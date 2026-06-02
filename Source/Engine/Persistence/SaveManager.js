import { NewGame, validate } from "../GameState.js";
import { MIGRATIONS } from "./Migrations.js";

export const SAVE_VERSION = 8;
export const SAVE_KEY = "idlekingdom.save";

/** Strips _solved + _topo, stamps savedAt + lastSeen, JSON.stringify. */
export function serialize(state, nowMs) {
  const { _solved, _topo, ...rest } = state;
  const now = typeof nowMs === "number" ? nowMs : state.savedAt;
  rest.savedAt = now;
  rest.lastSeen = now;
  return JSON.stringify(rest);
}

/** JSON.parse -> read version (default 1) -> chain migrations to SAVE_VERSION (assert +1 each hop)
 *  -> validate -> on failure logs a warning and returns NewGame(). Never throws to caller.
 *  A null/absent save (no prior progress) returns NewGame() silently — that is not corruption. */
export function deserialize(json, clock) {
  if (json == null) return NewGame(clock);
  let blob;
  try {
    blob = JSON.parse(json);
  } catch (err) {
    console.warn("[SaveManager] save unreadable; starting new game", err);
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
    if (!validate(blob)) {
      console.warn("[SaveManager] save failed validation; starting new game");
      return NewGame(clock);
    }
    return blob;
  } catch (err) {
    console.warn("[SaveManager] save migration failed; starting new game", err);
    return NewGame(clock);
  }
}
