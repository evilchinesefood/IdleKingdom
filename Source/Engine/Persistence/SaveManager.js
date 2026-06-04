import { NewGame, validate } from "../GameState.js";
import { MIGRATIONS } from "./Migrations.js";

export const SAVE_VERSION = 11;
export const SAVE_KEY = "idlekingdom.save";

/** Strips the _solved cache and meta._saveStatus (live HUD wiring), stamps
 *  savedAt + lastSeen, JSON.stringify. Does not mutate the live state. */
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
    if (!validate(blob, content)) {
      console.warn("[SaveManager] save failed validation; starting new game");
      return NewGame(clock);
    }
    // Non-destructive normalize (no version bump): default-fill fields that older
    // saves and migrations never set so runtime code needn't rely on `|| []` guards.
    if (blob.unlocks && !Array.isArray(blob.unlocks.gathererResources))
      blob.unlocks.gathererResources = [];
    if (
      blob.unlocks &&
      (!blob.unlocks.tuningRanks ||
        typeof blob.unlocks.tuningRanks !== "object")
    )
      blob.unlocks.tuningRanks = {};
    return blob;
  } catch (err) {
    console.warn("[SaveManager] save migration failed; starting new game", err);
    return NewGame(clock);
  }
}
