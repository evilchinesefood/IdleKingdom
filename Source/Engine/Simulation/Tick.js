import { MACHINES } from "../Content/Machines.js";

/** Per-frame integrator. Mutates state in place over dtSeconds using the solved rates.
 *  gold/research advance by their rates; surplus accrues to each node's sparse stockpile
 *  (storage rooms clamp their stockpile at the level's holding capacity — overflow is lost).
 *  Renown is NOT advanced here (expeditions are the only renown source).
 *  Expedition countdown resolution is handled by ExpeditionSystem at the Game layer. */
export function applyTick(state, solved, dtSeconds) {
  state.currencies.gold += solved.goldRate * dtSeconds;
  state.currencies.research += solved.researchRate * dtSeconds;

  const surplus = solved.surplusRate || {};
  const byId = state.graph.nodes;
  for (const nodeId in surplus) {
    const node = byId.find((n) => n.id === nodeId);
    // Only Storage Rooms hold inventory now — other machines' undrained surplus is
    // discarded (their production is lost if nothing downstream consumes it).
    if (!node || node.kind !== "storage") continue;
    if (!node.stockpile) node.stockpile = {};
    const m = MACHINES.storage;
    const capTotal = m.baseCap + m.capGain * (node.level - 1); // per-type hold cap
    const rates = surplus[nodeId];
    for (const resId in rates) {
      let v = (node.stockpile[resId] || 0) + rates[resId] * dtSeconds;
      if (v > capTotal) v = capTotal;
      node.stockpile[resId] = v;
    }
  }
}
