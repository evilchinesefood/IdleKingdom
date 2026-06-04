import { reclaim } from "./ProgressionSystem.js";

/** The single siege target: territories fall strictly in `order`. */
export function nextTerritory(state, content) {
  const remaining = Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order);
  return remaining.length ? remaining[0].id : null;
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
