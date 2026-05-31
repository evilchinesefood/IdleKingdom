import { itemStat } from "../Content/Equipment.js";

function findHero(state, heroId) {
  return state.heroes.find((h) => h.id === heroId);
}

export function heroPower(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return 0;
  let gear = 0;
  for (const slot of ["weapon", "armor", "accessory"]) {
    const e = hero.equipped[slot];
    if (e) gear += itemStat(e.itemId, e.tier);
  }
  return gear + hero.level * 5;
}

export function levelCost(level) {
  return 5 * level;
}

export function canLevelUp(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return false;
  return state.currencies.renown >= levelCost(hero.level);
}

export function levelUp(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return;
  const cost = levelCost(hero.level);
  if (state.currencies.renown < cost) return;
  state.currencies.renown -= cost;
  hero.level += 1;
}

export function canEquip(state, content, heroId, slot, itemId, tier) {
  const hero = findHero(state, heroId);
  if (!hero) return false;
  const item = content.equipment[itemId];
  if (!item || item.slot !== slot) return false;
  return state.unlocks.gearTiersUnlocked.some((g) => g.itemId === itemId && g.tier === tier);
}

export function equip(state, content, heroId, slot, itemId, tier) {
  const hero = findHero(state, heroId);
  if (!hero) return;
  hero.equipped[slot] = { itemId, tier };
}

export function canRecruit(state, content, templateId) {
  const tmpl = content.heroes[templateId];
  if (!tmpl) return false;
  if (state.heroes.some((h) => h.templateId === templateId)) return false;
  if (state.heroes.length >= state.unlocks.heroSlots) return false;
  if (tmpl.unlockTerritory && !state.territories.reclaimed.includes(tmpl.unlockTerritory)) return false;
  return state.currencies.renown >= tmpl.unlockRenownCost;
}

export function recruit(state, content, templateId) {
  if (!canRecruit(state, content, templateId)) return;
  const tmpl = content.heroes[templateId];
  state.currencies.renown -= tmpl.unlockRenownCost;
  const id = "h_" + state.heroes.length;
  state.heroes.push({ id, templateId, level: 1, equipped: { weapon: null, armor: null, accessory: null } });
}
