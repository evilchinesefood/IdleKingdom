import { NewGame, validate } from "../GameState.js";
import { MIGRATIONS } from "./Migrations.js";

export const SAVE_VERSION = 11;
export const SAVE_KEY = "idlekingdom.save";

/** Strips the _solved cache and meta._saveStatus (live HUD wiring), stamps
 *  savedAt + lastSeen, JSON.stringify. Contract: only TOP-LEVEL fields may be
 *  (re)assigned on the spread copy — graph/unlocks/currencies/etc. are LIVE
 *  references shared with the running game, never write into them here (meta
 *  is special-cased below for exactly that reason). */
export function serialize(state, nowMs) {
  const { _solved, ...rest } = state;
  const now = typeof nowMs === "number" ? nowMs : state.savedAt;
  rest.savedAt = now;
  rest.lastSeen = now;
  // meta is a shared ref via the shallow spread; clone it so deleting the live-only
  // _saveStatus doesn't strip it off the running game's meta (the HUD badge needs it).
  if (rest.meta && rest.meta._saveStatus !== undefined) {
    const { _saveStatus, ...metaRest } = rest.meta;
    rest.meta = metaRest;
  }
  return JSON.stringify(rest);
}

/** JSON.parse -> read version (default 1) -> chain migrations to SAVE_VERSION (assert +1 each hop)
 *  -> validate -> on failure logs a warning and returns NewGame(). Never throws to caller.
 *  A null/absent save (no prior progress) returns NewGame() silently — that is not corruption.
 *  When `content` is supplied, validate runs the deeper content-aware bounds checks (cycles,
 *  unknown kinds/recipes/resources/territory). A future-version blob (version > SAVE_VERSION)
 *  is backed up verbatim (via `storage`) and replaced with NewGame() — never run under older
 *  client logic (which would silently corrupt its newer shape). */
export function deserialize(json, clock, content, storage) {
  if (json == null) return NewGame(clock);
  let blob;
  try {
    blob = JSON.parse(json);
  } catch (err) {
    console.warn("[SaveManager] save unreadable; starting new game", err);
    return NewGame(clock);
  }
  if (typeof blob.version === "number" && blob.version > SAVE_VERSION) {
    const backupKey = "idlekingdom-save-backup-v" + blob.version;
    if (storage) {
      try {
        storage.set(backupKey, json); // raw blob, copied verbatim for manual recovery
      } catch {
        /* backup is best-effort; never block the new game on it */
      }
    }
    console.warn(
      "[SaveManager] save is from a newer version (v" +
        blob.version +
        "); backed up to " +
        backupKey +
        " and starting new game",
    );
    return NewGame(clock);
  }
  try {
    let version = typeof blob.version === "number" ? blob.version : 1;
    while (version < SAVE_VERSION) {
      const fn = MIGRATIONS[version];
      if (!fn) break;
      blob = fn(blob);
      if (blob.version !== version + 1) break; // each hop must advance exactly +1
      version = blob.version;
    }
    // Non-destructive normalize (no version bump), run BEFORE validate so a save
    // with a missing subtree field is repaired rather than discarded. Default-fill
    // every field the solver/systems read unguarded (marketListings.includes,
    // titheRate math, researchOwned.push, productionBonuses Object.values) — a
    // shape-valid blob missing one of these used to pass validate, throw mid-solve,
    // and silently cost the whole save via the bootstrap NewGame fallback.
    if (blob.unlocks && typeof blob.unlocks === "object") {
      const u = blob.unlocks;
      const arrays = [
        "gathererResources",
        "marketListings",
        "researchOwned",
        "machinesUnlocked",
        "recipesUnlocked",
      ];
      for (const k of arrays) if (!Array.isArray(u[k])) u[k] = [];
      if (!u.tuningRanks || typeof u.tuningRanks !== "object")
        u.tuningRanks = {};
      if (!u.productionBonuses || typeof u.productionBonuses !== "object")
        u.productionBonuses = {};
      if (!Number.isFinite(u.titheRate)) u.titheRate = 0;
    }
    if (
      blob.territories &&
      typeof blob.territories === "object" &&
      !Array.isArray(blob.territories.reclaimed)
    )
      blob.territories.reclaimed = [];
    // Non-finite timestamps would NaN the offline window — clamp to "just now"
    // (zero offline progress, nothing lost).
    const nowMs = clock ? clock.now() : 0;
    if (!Number.isFinite(blob.savedAt)) blob.savedAt = nowMs;
    if (!Number.isFinite(blob.lastSeen)) blob.lastSeen = nowMs;
    if (!validate(blob, content)) {
      console.warn("[SaveManager] save failed validation; starting new game");
      return NewGame(clock);
    }
    return blob;
  } catch (err) {
    console.warn("[SaveManager] save migration failed; starting new game", err);
    return NewGame(clock);
  }
}
