import { solve } from "./RateSolver.js";
import { applyTick } from "./Tick.js";
import { tryAdvanceSiege } from "../Systems/SiegeSystem.js";

/** One-shot offline catch-up. Clamps elapsed to offlineCapHours, integrates steady-state rates
 *  (siege progress accrues with them via applyTick), resolves any territories the accumulated
 *  siege progress fells, sets state.lastSeen = nowMs, and returns a summary. Pure-ish: mutates
 *  state in place; reads no wall-clock (nowMs injected). */
export function applyOffline(state, content, nowMs) {
  const capHours = state.unlocks.offlineCapHours || 1;
  const capMs = capHours * 3600 * 1000;
  const raw = Math.max(0, nowMs - (state.lastSeen || 0));
  const appliedMs = Math.min(raw, capMs);
  const clamped = raw > capMs;

  const gold0 = state.currencies.gold;
  const research0 = state.currencies.research;

  if (appliedMs > 0) {
    // res_quartermaster surplus auto-sell is folded into the solved goldRate (see
    // RateSolver), so the steady-state integration above already credits offline
    // auto-sell income — no separate stockpile sweep needed. applyTick also accrues
    // siege progress over the window.
    const solved = solve(state, content);
    applyTick(state, solved, appliedMs / 1000);
  }

  // Territories besieged past their cost during the window fall now (cap applies:
  // siege progress is passive production, so it accrues only over appliedMs).
  // Seed siege for pre-war saves so tryAdvanceSiege's precondition holds.
  if (!state.siege) state.siege = { progress: 0 };
  const territoriesReclaimed = tryAdvanceSiege(state, content);

  state.lastSeen = nowMs;

  return {
    appliedMs,
    clamped,
    gained: {
      gold: state.currencies.gold - gold0,
      research: state.currencies.research - research0,
    },
    territoriesReclaimed,
  };
}
