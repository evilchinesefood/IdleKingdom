/** NewGame seed: EMPTY graph — the player builds everything from scratch.
 *  25 starting gold (placing nodes is free; gold is for upgrades). iron_bar is
 *  listed so the first Mine -> Smelt -> Market chain sells immediately once built.
 *  Brand-new game has expeditions.active === null. */
export const START_STATE = {
  currencies: { gold: 25.0, research: 0.0, renown: 0.0 },
  graph: {
    nodes: [],
    links: [],
    buildings: [],
    nextNodeSeq: 0,
    nextLinkSeq: 0,
    nextBuildingSeq: 0,
  },
  unlocks: {
    researchOwned: [],
    recipesUnlocked: ["r_iron_bar"],
    machinesUnlocked: ["gatherer", "smelter", "market", "storage"],
    marketListings: [
      "iron_ore",
      "timber",
      "hide",
      "coal_raw",
      "gemstone",
      "iron_bar",
    ],
    titheRate: 0.05,
    offlineCapHours: 1,
    productionBonuses: {
      gatherer: 1.0,
      smelter: 1.0,
      workshop: 1.0,
      market: 1.0,
      scholar: 1.0,
      storage: 1.0,
    },
    gearTiersUnlocked: [
      { itemId: "sword", tier: 1 },
      { itemId: "armor", tier: 1 },
      { itemId: "shield", tier: 1 },
    ],
    autoSell: false,
    heroSlots: 1,
  },
  heroes: [
    {
      id: "h_0",
      templateId: "hero_warden",
      level: 1,
      equipped: { weapon: null, armor: null, accessory: null },
    },
  ],
  expeditions: { active: null, completed: [] },
  territories: { reclaimed: [], available: ["t_gatehouse"] },
  meta: {
    tutorialDone: false,
    seenVictory: false,
    won: false,
    createdAt: 0,
    playtimeMs: 0,
  },
};
