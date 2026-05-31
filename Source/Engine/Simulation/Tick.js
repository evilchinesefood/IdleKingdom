/** Per-frame integrator. Mutates state in place over dtSeconds using the solved rates.
 *  gold/research advance by their rates; surplus accrues to each node's sparse stockpile.
 *  Renown is NOT advanced here (expeditions are the only renown source).
 *  Expedition countdown resolution is handled by ExpeditionSystem at the Game layer. */
export function applyTick(state, solved, dtSeconds) {
  state.currencies.gold += solved.goldRate * dtSeconds;
  state.currencies.research += solved.researchRate * dtSeconds;

  const surplus = solved.surplusRate || {};
  const byId = state.graph.nodes;
  for (const nodeId in surplus) {
    const node = byId.find((n) => n.id === nodeId);
    if (!node) continue;
    if (!node.stockpile) node.stockpile = {};
    const rates = surplus[nodeId];
    for (const resId in rates) {
      node.stockpile[resId] = (node.stockpile[resId] || 0) + rates[resId] * dtSeconds;
    }
  }
}
