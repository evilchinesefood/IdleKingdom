/** @typedef {Object} TerritoryReward { gold:number, research:number }
 *  @typedef {Object} Territory
 *  @property {string}  id
 *  @property {string}  name
 *  @property {string}  flavor
 *  @property {number}  order
 *  @property {number}  siegeCost
 *  @property {TerritoryReward} rewards
 *  @property {Object[]} unlocks
 *  @property {boolean} isVictory
 */

/** Keyed map id -> Territory (6), order t_gatehouse -> t_blackkeep. */
export const TERRITORIES = {
  t_gatehouse: {
    id: "t_gatehouse",
    name: "The Gatehouse",
    order: 1,
    siegeCost: 40,
    rewards: { gold: 50, research: 20 },
    isVictory: false,
    unlocks: [{ type: "productionBonus", kind: "gatherer", mult: 1.1 }],
    flavor: "Push the rabble off the drawbridge and light the first brazier.",
  },
  t_smithyward: {
    id: "t_smithyward",
    name: "Smithy Ward",
    order: 2,
    siegeCost: 150,
    rewards: { gold: 120, research: 40 },
    isVictory: false,
    unlocks: [{ type: "productionBonus", kind: "smelter", mult: 1.1 }],
    flavor: "Reclaim the cold forges; the bellows still remember fire.",
  },
  t_oldmarket: {
    id: "t_oldmarket",
    name: "The Old Market",
    order: 3,
    siegeCost: 500,
    rewards: { gold: 300, research: 80 },
    isVictory: false,
    unlocks: [{ type: "marketCapacityBonus", mult: 1.15 }],
    flavor: "Merchants return where the banners fly; trade quickens.",
  },
  t_ironreach: {
    id: "t_ironreach",
    name: "Ironreach Mine",
    order: 4,
    siegeCost: 40000,
    rewards: { gold: 700, research: 150 },
    isVictory: false,
    unlocks: [
      { type: "enableGathererResource", resourceId: "gemstone" },
      { type: "productionBonus", kind: "smelter", mult: 1.2 },
    ],
    flavor: "The deep galleries are ours again — and they glitter.",
  },
  t_highwall: {
    id: "t_highwall",
    name: "The High Wall",
    order: 5,
    siegeCost: 120000,
    rewards: { gold: 1500, research: 300 },
    isVictory: false,
    unlocks: [{ type: "productionBonus", kind: "barracks", mult: 1.25 }],
    flavor: "From the ramparts you can see the keep — and who waits in it.",
  },
  t_blackkeep: {
    id: "t_blackkeep",
    name: "The Black Keep",
    order: 6,
    siegeCost: 400000,
    rewards: { gold: 4000, research: 600 },
    isVictory: true,
    unlocks: [],
    flavor:
      "The Usurer-Lord who bought the King's death waits behind the last door. End it.",
  },
};
