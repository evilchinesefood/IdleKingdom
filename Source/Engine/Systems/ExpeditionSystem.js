import { heroPower } from "./HeroSystem.js";
import { reclaim } from "./ProgressionSystem.js";

export function nextTerritory(state, content) {
  const remaining = Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order);
  return remaining.length ? remaining[0].id : null;
}

export function canStart(state, content, territoryId, heroId) {
  if (state.expeditions.active) return false;
  if (territoryId !== nextTerritory(state, content)) return false;
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return false;
  const terr = content.territories[territoryId];
  if (!terr) return false;
  return heroPower(state, content, heroId) >= terr.requiredPower;
}

export function startExpedition(state, content, territoryId, heroId, nowMs) {
  if (!canStart(state, content, territoryId, heroId)) return;
  const terr = content.territories[territoryId];
  state.expeditions.active = {
    territoryId,
    startedAt: nowMs,
    durationMs: terr.durationMs,
    heroId,
  };
}

export function timeRemaining(state, nowMs) {
  const a = state.expeditions.active;
  if (!a) return 0;
  const end = a.startedAt + a.durationMs;
  return Math.max(0, end - nowMs);
}

export function tryResolve(state, content, nowMs) {
  const a = state.expeditions.active;
  if (!a) return null;
  if (nowMs < a.startedAt + a.durationMs) return null;
  const terr = content.territories[a.territoryId];
  state.currencies.gold += terr.rewards.gold;
  state.currencies.research += terr.rewards.research;
  state.currencies.renown += terr.rewards.renown;
  reclaim(state, content, a.territoryId);
  state.expeditions.completed.push({
    territoryId: a.territoryId,
    completedAt: nowMs,
  });
  state.expeditions.active = null;
  return { territoryId: terr.id, rewards: terr.rewards };
}
