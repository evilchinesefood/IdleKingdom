import { applyEffects } from "./ResearchSystem.js";

export function reclaim(state, content, territoryId) {
  const terr = content.territories[territoryId];
  if (!terr) return;
  if (state.territories.reclaimed.includes(territoryId)) return; // idempotent

  state.territories.reclaimed.push(territoryId);
  const ai = state.territories.available.indexOf(territoryId);
  if (ai !== -1) state.territories.available.splice(ai, 1);

  // open the next territory in order, if any
  const next = Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order)[0];
  if (next && !state.territories.available.includes(next.id)) {
    state.territories.available.push(next.id);
  }

  applyEffects(state, content, terr.unlocks || []);

  if (terr.grantsHero) {
    const already = state.heroes.some((h) => h.templateId === terr.grantsHero);
    if (!already) {
      const id = "h_" + state.heroes.length;
      state.heroes.push({ id, templateId: terr.grantsHero, level: 1, equipped: { weapon: null, armor: null, accessory: null } });
    }
  }

  if (terr.isVictory) state.meta.won = true;
  delete state._solved;
}

export function checkWin(state, content) {
  const all = Object.keys(content.territories);
  const won = all.every((id) => state.territories.reclaimed.includes(id));
  if (won) state.meta.won = true;
  return won;
}
