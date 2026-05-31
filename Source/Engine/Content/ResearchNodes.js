/** @typedef {Object} ResearchEffect  tagged union (see contract §2.4) */
/** @typedef {Object} ResearchNode
 *  @property {string}  id
 *  @property {string}  name
 *  @property {"research"|"renown"} currency
 *  @property {number}  cost
 *  @property {string[]} prereqs
 *  @property {ResearchEffect[]} effects
 *  @property {string|null} requiresTerritory
 *  @property {string}  flavor
 */

/** Keyed map id -> ResearchNode. 15 backbone (research) + 2 premium (renown). */
export const RESEARCH_NODES = {
  res_scholar: {
    id: "res_scholar",
    name: "Found the Scholars' Guild",
    currency: "research",
    cost: 9,
    prereqs: [],
    requiresTerritory: null,
    effects: [
      { type: "unlockMachine", kind: "scholar" },
      { type: "unlockMachine", kind: "workshop" },
      { type: "unlockRecipe", recipeId: "r_parchment" },
    ],
    flavor:
      "A drafty hall, one candle, and the city's last literate quartermaster.",
  },
  res_lumber: {
    id: "res_lumber",
    name: "Lumber Rights",
    currency: "research",
    cost: 25,
    prereqs: ["res_scholar"],
    requiresTerritory: null,
    effects: [
      { type: "unlockMachine", kind: "gatherer" },
      { type: "unlockRecipe", recipeId: "r_plank" },
    ],
    flavor:
      "The eastern woods are ours again — fell what the siege left standing.",
  },
  res_tannery: {
    id: "res_tannery",
    name: "Tannery Charter",
    currency: "research",
    cost: 25,
    prereqs: ["res_scholar"],
    requiresTerritory: null,
    effects: [
      { type: "unlockMachine", kind: "gatherer" },
      { type: "unlockRecipe", recipeId: "r_leather" },
    ],
    flavor: "Boar-hide cures hard, but it cures fast.",
  },
  res_coalworks: {
    id: "res_coalworks",
    name: "Coalworks",
    currency: "research",
    cost: 40,
    prereqs: ["res_lumber"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_coal" },
      { type: "enableGathererResource", resourceId: "coal_raw" },
    ],
    flavor: "The deep seams burn hotter than any wood-fire.",
  },
  res_steelmaking: {
    id: "res_steelmaking",
    name: "Steelmaking",
    currency: "research",
    cost: 120,
    prereqs: ["res_coalworks"],
    requiresTerritory: null,
    effects: [{ type: "unlockRecipe", recipeId: "r_steel" }],
    flavor: "Iron is a tool. Steel is a weapon.",
  },
  res_fittings: {
    id: "res_fittings",
    name: "Fittings & Rivets",
    currency: "research",
    cost: 180,
    prereqs: ["res_steelmaking"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_fitting" },
      { type: "unlockListing", resourceIds: ["fitting"] },
    ],
    flavor: "A blade is nothing without the rivet that holds the hilt.",
  },
  res_open_market: {
    id: "res_open_market",
    name: "Open the Component Stalls",
    currency: "research",
    cost: 90,
    prereqs: ["res_steelmaking"],
    requiresTerritory: null,
    effects: [
      {
        type: "unlockListing",
        resourceIds: ["coal", "iron_bar", "plank", "leather", "steel"],
      },
    ],
    flavor: "Even half-finished goods fetch coin from a desperate quarter.",
  },
  res_smithing: {
    id: "res_smithing",
    name: "Blade & Plate Smithing",
    currency: "research",
    cost: 250,
    prereqs: ["res_steelmaking"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_blade" },
      { type: "unlockRecipe", recipeId: "r_plating" },
      { type: "unlockListing", resourceIds: ["blade", "plating"] },
    ],
    flavor: "The forge-masters return to their anvils.",
  },
  res_armory: {
    id: "res_armory",
    name: "The Armory",
    currency: "research",
    cost: 400,
    prereqs: ["res_smithing", "res_fittings"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_sword" },
      { type: "unlockRecipe", recipeId: "r_armor" },
      { type: "unlockRecipe", recipeId: "r_shield" },
      { type: "unlockListing", resourceIds: ["sword", "armor", "shield"] },
    ],
    flavor: "Now we forge for heroes, not just for coin.",
  },
  res_efficient_forges: {
    id: "res_efficient_forges",
    name: "Efficient Forges",
    currency: "research",
    cost: 300,
    prereqs: ["res_steelmaking"],
    requiresTerritory: null,
    effects: [{ type: "productionBonus", kind: "smelter", mult: 1.25 }],
    flavor: "Bank the coals just so and one charge does the work of two.",
  },
  res_assembly_jigs: {
    id: "res_assembly_jigs",
    name: "Assembly Jigs",
    currency: "research",
    cost: 550,
    prereqs: ["res_armory"],
    requiresTerritory: null,
    effects: [{ type: "productionBonus", kind: "workshop", mult: 1.25 }],
    flavor: "Standardized jigs mean any apprentice builds like a master.",
  },
  res_trade_routes: {
    id: "res_trade_routes",
    name: "Trade Routes",
    currency: "research",
    cost: 700,
    prereqs: ["res_open_market"],
    requiresTerritory: null,
    effects: [
      { type: "marketCapacityBonus", mult: 1.3 },
      { type: "titheRate", value: 0.07 },
    ],
    flavor: "Merchant caravans slip past the siege lines by moonlight.",
  },
  res_ledgers: {
    id: "res_ledgers",
    name: "Caravan Ledgers",
    currency: "research",
    cost: 600,
    prereqs: ["res_trade_routes"],
    requiresTerritory: null,
    effects: [{ type: "offlineCapHours", value: 12 }],
    flavor: "Clerks keep the books running while the city sleeps.",
  },
  res_logistics: {
    id: "res_logistics",
    name: "Master Logistics",
    currency: "research",
    cost: 1800,
    prereqs: ["res_ledgers", "res_assembly_jigs"],
    requiresTerritory: null,
    effects: [
      { type: "offlineCapHours", value: 24 },
      { type: "globalRateBonus", mult: 1.1 },
    ],
    flavor: "A kingdom that runs itself is a kingdom that endures.",
  },
  res_grand_design: {
    id: "res_grand_design",
    name: "The Grand Design",
    currency: "research",
    cost: 5000,
    prereqs: ["res_logistics", "res_efficient_forges"],
    requiresTerritory: null,
    effects: [
      { type: "globalRateBonus", mult: 1.2 },
      { type: "scholarBonus", mult: 1.5 },
    ],
    flavor: "Every wheel, every fire, every quill — turning as one.",
  },
  // Premium (renown)
  res_war_college: {
    id: "res_war_college",
    name: "War College",
    currency: "renown",
    cost: 30,
    prereqs: ["res_armory"],
    requiresTerritory: "t_smithyward",
    effects: [{ type: "heroSlot", count: 1 }],
    flavor: "Two banners on the wall are harder to break than one.",
  },
  res_quartermaster: {
    id: "res_quartermaster",
    name: "Master Quartermaster",
    currency: "renown",
    cost: 60,
    prereqs: ["res_war_college", "res_trade_routes"],
    requiresTerritory: "t_ironreach",
    effects: [{ type: "autoSell", enabled: true }],
    flavor: "One ledger, one seal, and nothing in Yensburg goes to waste.",
  },
};
