import { solve } from "./RateSolver.js";
import { applyTick } from "./Tick.js";
import { tryResolve } from "../Systems/ExpeditionSystem.js";

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

  const expeditionsResolved = [];
  // Deterministically resolve the in-flight expedition if it finished within the catch-up window.
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
