import { START_STATE } from "./Content/StartState.js";

/** Current persisted save schema version (mirrored by SaveManager in Phase 2). */
export const SAVE_VERSION = 6;

/** Structured deep clone with no shared refs; drops the non-persisted _solved cache. */
export function clone(state) {
  const { _solved, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

/** Fresh seeded GameState: deep copy of START_STATE, version stamped, timestamps from clock. */
export function NewGame(clock) {
  const now = clock ? clock.now() : 0;
  const seed = JSON.parse(JSON.stringify(START_STATE));
  return {
    version: SAVE_VERSION,
    savedAt: now,
    lastSeen: now,
    ...seed,
    meta: { ...seed.meta, createdAt: now },
  };
}

/** Deep-freeze a clone for snapshot use (recursively freezes nested objects/arrays). */
export function freeze(state) {
  const copy = clone(state);
  deepFreeze(copy);
  return copy;
}

function deepFreeze(o) {
  if (o === null || typeof o !== "object") return o;
  for (const k of Object.keys(o)) deepFreeze(o[k]);
  return Object.freeze(o);
}

/** Structural validation: required keys, finite currencies, node/link referential integrity. */
export function validate(state) {
  if (!state || typeof state !== "object") return false;
  const required = [
    "version",
    "currencies",
    "graph",
    "unlocks",
    "heroes",
    "expeditions",
    "territories",
    "meta",
  ];
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(state, k)) return false;
  }
  const c = state.currencies;
  if (
    !c ||
    !Number.isFinite(c.gold) ||
    !Number.isFinite(c.research) ||
    !Number.isFinite(c.renown)
  )
    return false;
  const g = state.graph;
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.links)) return false;
  const nodeIds = new Set();
  for (const n of g.nodes) {
    if (!n || typeof n.id !== "string" || nodeIds.has(n.id)) return false;
    nodeIds.add(n.id);
  }
  for (const l of g.links) {
    if (!l || typeof l.id !== "string") return false;
    if (!nodeIds.has(l.from) || !nodeIds.has(l.to)) return false;
  }
  if (g.buildings !== undefined) {
    if (!Array.isArray(g.buildings)) return false;
    for (const b of g.buildings) {
      if (!b || typeof b.id !== "string" || !Array.isArray(b.nodeIds))
        return false;
      for (const nid of b.nodeIds) if (!nodeIds.has(nid)) return false;
    }
  }
  return true;
}
