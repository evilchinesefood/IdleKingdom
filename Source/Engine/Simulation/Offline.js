import { solve } from "./RateSolver.js";
import { applyTick } from "./Tick.js";
import { tryResolve } from "../Systems/ExpeditionSystem.js";
import { isListed } from "../Systems/EconomySystem.js";

/** One-shot offline catch-up. Clamps elapsed to offlineCapHours, integrates steady-state rates,
 *  fast-forwards an in-flight expedition deterministically, sets state.lastSeen = nowMs, and
 *  returns a summary. Pure-ish: mutates state in place; reads no wall-clock (nowMs injected). */
export function applyOffline(state, content, nowMs) {
  const capHours = state.unlocks.offlineCapHours || 8;
  const capMs = capHours * 3600 * 1000;
  const raw = Math.max(0, nowMs - (state.lastSeen || 0));
  const appliedMs = Math.min(raw, capMs);
  const clamped = raw > capMs;

  const gold0 = state.currencies.gold;
  const research0 = state.currencies.research;
  const renown0 = state.currencies.renown;

  if (appliedMs > 0) {
    const solved = solve(state, content);
    applyTick(state, solved, appliedMs / 1000);
  }

  // res_quartermaster auto-sell: one-shot sweep of every node stockpile (listed resources only).
  // Done in-line so the whole offline dump is a single deterministic pass; runs after surplus
  // integration so freshly-accrued surplus is also dumped, and exactly once per call.
  if (state.unlocks.autoSell) {
    for (const node of state.graph.nodes) {
      for (const res in node.stockpile) {
        const qty = node.stockpile[res];
        if (qty > 0 && isListed(state, content, res)) {
          const gold = qty * content.resources[res].basePrice;
          state.currencies.gold += gold;
          state.currencies.research += gold * state.unlocks.titheRate;
          node.stockpile[res] = 0;
        }
      }
    }
  }

  const expeditionsResolved = [];
  // Deterministically resolve the in-flight expedition if it finished within the catch-up window.
  // Expeditions resolve by real elapsed time (uncapped); the offline cap limits only passive production (spec §4.4).
  const resolved = tryResolve(state, content, nowMs);
  if (resolved) expeditionsResolved.push(resolved);

  state.lastSeen = nowMs;

  return {
    appliedMs,
    clamped,
    gained: {
      gold: state.currencies.gold - gold0,
      research: state.currencies.research - research0,
      renown: state.currencies.renown - renown0,
    },
    expeditionsResolved,
  };
}
