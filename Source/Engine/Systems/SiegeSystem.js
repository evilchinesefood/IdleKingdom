import { reclaim } from "./ProgressionSystem.js";

// Sorted territory list (by order) cached per content object. Content is a
// module-level singleton so this is effectively a one-time build.
let _sortedCache = null;
let _sortedContent = null;
function sortedTerritories(content) {
  if (_sortedContent !== content) {
    _sortedCache = Object.values(content.territories).sort(
      (a, b) => a.order - b.order,
    );
    _sortedContent = content;
  }
  return _sortedCache;
}

/** The single siege target: territories fall strictly in `order`. */
export function nextTerritory(state, content) {
  const sorted = sortedTerritories(content);
  const reclaimed = state.territories.reclaimed;
  for (const t of sorted) {
    if (!reclaimed.includes(t.id)) return t.id;
  }
  return null;
}

/** Spend accumulated siege progress against the next territory (repeatedly —
 *  a long offline window can fell several). Grants rewards, applies unlocks via
 *  reclaim(), rolls surplus progress forward. Returns [{territoryId, rewards}].
 *  Precondition: state.siege exists (StartState/migration seed it). Once no
 *  targets remain, surplus progress is discarded. */
export function tryAdvanceSiege(state, content) {
  const fell = [];
  for (;;) {
    const id = nextTerritory(state, content);
    if (!id) break;
    const terr = content.territories[id];
    if (state.siege.progress < terr.siegeCost) break;
    state.siege.progress -= terr.siegeCost;
    state.currencies.gold += terr.rewards.gold;
    state.currencies.research += terr.rewards.research;
    reclaim(state, content, id);
    fell.push({ territoryId: id, rewards: { ...terr.rewards } });
  }
  // nothing left to besiege: surplus progress has no target
  if (!nextTerritory(state, content)) state.siege.progress = 0;
  return fell;
}
