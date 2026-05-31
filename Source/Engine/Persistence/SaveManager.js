import { NewGame, validate } from "../GameState.js";
import { MIGRATIONS } from "./Migrations.js";

export const SAVE_VERSION = 3;
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
 *  -> validate -> on failure return NewGame(). Never throws to caller. */
export function deserialize(json, clock) {
  if (json == null) return NewGame(clock);
  let blob;
  try {
    blob = JSON.parse(json);
  } catch {
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
    if (!validate(blob)) return NewGame(clock);
    return blob;
  } catch {
    return NewGame(clock);
  }
}
