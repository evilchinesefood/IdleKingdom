import { applyEffects } from "./ResearchSystem.js";

export function reclaim(state, content, territoryId) {
  const terr = content.territories[territoryId];
  if (!terr) return;
  if (state.territories.reclaimed.includes(territoryId)) return; // idempotent

  state.territories.reclaimed.push(territoryId);

  applyEffects(state, content, terr.unlocks || []);

  if (terr.isVictory) state.meta.won = true;
  delete state._solved;
}
