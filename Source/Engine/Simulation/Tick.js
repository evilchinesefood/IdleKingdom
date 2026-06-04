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
  const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
  for (const nodeId in surplus) {
    const node = byId.get(nodeId);
    // Only Storage Rooms hold inventory now — other machines' undrained surplus is
    // discarded (their production is lost if nothing downstream consumes it).
    if (!node || node.kind !== "storage") continue;
    if (!node.stockpile) node.stockpile = {};
    const m = MACHINES.storage;
    // SHARED total hold cap across all held types (cap = baseCap + capGain*(L-1)).
    const cap = m.baseCap + m.capGain * (node.level - 1);
    let total = 0;
    for (const k in node.stockpile) total += node.stockpile[k] || 0;
    const rates = surplus[nodeId];
    for (const resId in rates) {
      const room = Math.max(0, cap - total); // remaining shared room
      const add = Math.min(rates[resId] * dtSeconds, room); // overflow is lost
      if (add > 0) {
        node.stockpile[resId] = (node.stockpile[resId] || 0) + add;
        total += add;
      }
    }
  }
}
