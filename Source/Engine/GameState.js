import { START_STATE } from "./Content/StartState.js";
import { topoSort } from "./Simulation/Topology.js";

/** Current persisted save schema version (mirrored by SaveManager in Phase 2). */
export const SAVE_VERSION = 11;

/** Structured deep clone with no shared refs; drops the non-persisted _solved cache.
 *  Kept on JSON.parse(JSON.stringify()): for this plain-object game state (finite
 *  numbers + short strings) V8's JSON fast path is at-or-faster than structuredClone
 *  on Node 22 (measured: structuredClone ran ~1.04x SLOWER), so the switch was a
 *  no-win and reverted. */
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

/** Structural validation: required keys, finite currencies, node/link referential integrity.
 *  When `content` is supplied, also bounds-checks against game content: rejects cyclic graphs,
 *  unknown node kinds, unknown crafter recipeIds, and link resourceIds (defends the
 *  boot path against corrupt-but-shape-valid saves). */
export function validate(state, content) {
  if (!state || typeof state !== "object") return false;
  const required = [
    "version",
    "currencies",
    "graph",
    "unlocks",
    "siege",
    "territories",
    "meta",
  ];
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(state, k)) return false;
  }
  const c = state.currencies;
  if (!c || !Number.isFinite(c.gold) || !Number.isFinite(c.research))
    return false;
  if (!state.siege || !Number.isFinite(state.siege.progress)) return false;
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
      // children (nested groups) must be a string array when present; stale ids are
      // tolerated at runtime + pruned on the next edit, so don't reject on those.
      if (
        b.children !== undefined &&
        (!Array.isArray(b.children) ||
          !b.children.every((c) => typeof c === "string"))
      )
        return false;
    }
  }
  if (content) return validateAgainstContent(state, content);
  return true;
}

/** Deeper bounds checks that need game content: acyclic graph, known kinds/recipes/
 *  resources. */
function validateAgainstContent(state, content) {
  const g = state.graph;
  try {
    topoSort(g.nodes, g.links);
  } catch {
    return false; // cyclic graph would crash the solver at boot
  }
  for (const n of g.nodes) {
    if (!content.machines[n.kind]) return false;
    // null recipeId = a just-placed crafter awaiting assignment (legal, common);
    // only an UNKNOWN id is corruption.
    if (
      (n.kind === "smelter" ||
        n.kind === "workshop" ||
        n.kind === "barracks") &&
      n.recipeId != null &&
      !content.recipes[n.recipeId]
    )
      return false;
  }
  for (const l of g.links) {
    if (!content.resources[l.resourceId]) return false;
  }
  return true;
}
