/** @typedef {Object} TerritoryReward { gold:number, research:number, renown:number }
 *  @typedef {Object} Territory
 *  @property {string}  id
 *  @property {string}  name
 *  @property {string}  flavor
 *  @property {number}  order
 *  @property {number}  requiredPower
 *  @property {number}  durationMs
 *  @property {TerritoryReward} rewards
 *  @property {Object[]} unlocks
 *  @property {string|null} grantsHero
 *  @property {boolean} isVictory
 */

/** Keyed map id -> Territory (6), order t_gatehouse -> t_blackkeep. */
export const TERRITORIES = {
  t_gatehouse: {
    id: "t_gatehouse",
    name: "The Gatehouse",
    order: 1,
    requiredPower: 30,
    durationMs: 120000,
    rewards: { gold: 50, research: 20, renown: 10 },
    grantsHero: "hero_warden",
    isVictory: false,
    unlocks: [{ type: "productionBonus", kind: "gatherer", mult: 1.1 }],
    flavor: "Push the rabble off the drawbridge and light the first brazier.",
  },
  t_smithyward: {
    id: "t_smithyward",
    name: "Smithy Ward",
    order: 2,
    requiredPower: 38,
    durationMs: 300000,
    rewards: { gold: 120, research: 40, renown: 15 },
    grantsHero: null,
    isVictory: false,
    unlocks: [
      { type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 2 },
      { type: "productionBonus", kind: "smelter", mult: 1.1 },
    ],
    flavor: "Reclaim the cold forges; the bellows still remember fire.",
  },
  t_oldmarket: {
    id: "t_oldmarket",
    name: "The Old Market",
    order: 3,
    requiredPower: 50,
    durationMs: 600000,
    rewards: { gold: 300, research: 80, renown: 25 },
    grantsHero: null,
    isVictory: false,
    unlocks: [
      { type: "unlockGearTier", itemIds: ["armor"], tier: 2 },
      { type: "marketCapacityBonus", mult: 1.15 },
    ],
    flavor: "Merchants return where the banners fly; trade quickens.",
  },
  t_ironreach: {
    id: "t_ironreach",
    name: "Ironreach Mine",
    order: 4,
    requiredPower: 65,
    durationMs: 1200000,
    rewards: { gold: 700, research: 150, renown: 35 },
    grantsHero: null,
    isVictory: false,
    unlocks: [
      { type: "enableGathererResource", resourceId: "gemstone" },
      { type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 3 },
      { type: "productionBonus", kind: "smelter", mult: 1.2 },
    ],
    flavor: "The deep galleries are ours again — and they glitter.",
  },
  t_highwall: {
    id: "t_highwall",
    name: "The High Wall",
    order: 5,
    requiredPower: 85,
    durationMs: 2400000,
    rewards: { gold: 1500, research: 300, renown: 50 },
    grantsHero: null,
    isVictory: false,
    unlocks: [
      { type: "unlockGearTier", itemIds: ["armor"], tier: 3 },
      { type: "heroSlot", count: 1 },
    ],
    flavor: "From the ramparts you can see the keep — and who waits in it.",
  },
  t_blackkeep: {
    id: "t_blackkeep",
    name: "The Black Keep",
    order: 6,
    requiredPower: 110,
    durationMs: 3600000,
    rewards: { gold: 4000, research: 600, renown: 70 },
    grantsHero: null,
    isVictory: true,
    unlocks: [],
    flavor:
      "The Usurer-Lord who bought the King's death waits behind the last door. End it.",
  },
};
