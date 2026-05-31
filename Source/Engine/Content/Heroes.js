/** @typedef {Object} HeroTemplate
 *  @property {string} id            hero_warden | hero_ranger | hero_smith
 *  @property {string} name
 *  @property {number} basePower     0 in MVP; power from gear+level
 *  @property {number} levelStep     +heroPower per level (5)
 *  @property {("territory"|"renown")} unlockKind
 *  @property {string|null} unlockTerritory
 *  @property {number} unlockRenownCost
 */

/** Keyed map id -> HeroTemplate (3). */
export const HEROES = {
  hero_warden: { id: "hero_warden", name: "The Warden", basePower: 0, levelStep: 5, unlockKind: "territory", unlockTerritory: "t_gatehouse", unlockRenownCost: 0 },
  hero_ranger: { id: "hero_ranger", name: "The Ranger", basePower: 0, levelStep: 5, unlockKind: "renown", unlockTerritory: "t_oldmarket", unlockRenownCost: 40 },
  hero_smith: { id: "hero_smith", name: "The Smith", basePower: 0, levelStep: 5, unlockKind: "renown", unlockTerritory: "t_highwall", unlockRenownCost: 80 },
};
