/** @typedef {Object} ResearchEffect  tagged union (see contract §2.4) */
/** @typedef {Object} ResearchNode
 *  @property {string}  id
 *  @property {string}  name
 *  @property {"research"} currency
 *  @property {number}  cost
 *  @property {string[]} prereqs
 *  @property {ResearchEffect[]} effects
 *  @property {string|null} requiresTerritory
 *  @property {string}  description   concrete mechanical effects (shown to the player)
 *  @property {string}  flavor        witty in-world flavor (secondary)
 */

/** Keyed map id -> ResearchNode. */
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
    description:
      "Unlocks the Scholar (generates Research) and Workshop machines, plus the Parchment recipe.",
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
      { type: "enableGathererResource", resourceId: "timber" },
      { type: "unlockRecipe", recipeId: "r_plank" },
    ],
    description: "Lets gatherers harvest Timber and unlocks the Plank recipe.",
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
      { type: "enableGathererResource", resourceId: "hide" },
      { type: "unlockRecipe", recipeId: "r_leather" },
    ],
    description:
      "Lets gatherers harvest Raw Hide and unlocks the Leather recipe.",
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
    description:
      "Lets gatherers harvest Coal Seam and unlocks the Refined Coal recipe.",
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
    description: "Unlocks the Steel recipe (smelts Iron Bar + Coal).",
    flavor: "Iron is a tool. Steel is a weapon.",
  },
  res_fittings: {
    id: "res_fittings",
    name: "Fittings & Rivets",
    currency: "research",
    cost: 180,
    prereqs: ["res_steelmaking", "res_tannery"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_fitting" },
      { type: "unlockListing", resourceIds: ["fitting"] },
    ],
    description:
      "Unlocks the Fitting recipe (Iron Bar + Leather) and lists Fittings for sale at the Market.",
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
    description:
      "Lists Refined Coal, Iron Bar, Plank, Leather, and Steel for sale at the Market.",
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
    description:
      "Unlocks the Blade and Plating recipes and lists both for sale at the Market.",
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
    description:
      "Unlocks the Sword, Plate Armor, and Shield recipes and lists all three for sale.",
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
    description: "+25% Smelter output.",
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
    description: "+25% Workshop output.",
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
    description:
      "+30% Market throughput and sets the passive gold tithe to 7%.",
    flavor: "Merchant caravans slip past the siege lines by moonlight.",
  },
  res_ledgers: {
    id: "res_ledgers",
    name: "Caravan Ledgers",
    currency: "research",
    cost: 600,
    prereqs: ["res_trade_routes"],
    requiresTerritory: null,
    effects: [{ type: "marketCapacityBonus", mult: 1.4 }],
    description:
      "+40% Market sell capacity for the larger volumes you now move.",
    flavor: "Clerks tally ever-bigger caravans rolling through the gates.",
  },
  res_logistics: {
    id: "res_logistics",
    name: "Master Logistics",
    currency: "research",
    cost: 1800,
    prereqs: ["res_ledgers", "res_assembly_jigs"],
    requiresTerritory: null,
    effects: [{ type: "globalRateBonus", mult: 1.1 }],
    description:
      "+10% output to all production (gatherers, smelters, workshops).",
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
    description:
      "+20% to all production (gatherers, smelters, workshops) and +50% Scholar research output.",
    flavor: "Every wheel, every fire, every quill — turning as one.",
  },
  res_drill_yard: {
    id: "res_drill_yard",
    name: "The Drill Yard",
    currency: "research",
    cost: 600,
    prereqs: ["res_armory"],
    requiresTerritory: null,
    effects: [
      { type: "unlockMachine", kind: "barracks" },
      { type: "unlockRecipe", recipeId: "r_militia" },
    ],
    description:
      "Unlocks the Barracks and Militia muster (sword + armor + shield).",
    flavor: "Pikes up. The city remembers how to march.",
  },
  res_hardened_steel: {
    id: "res_hardened_steel",
    name: "Hardened Steel",
    currency: "research",
    cost: 800,
    prereqs: ["res_steelmaking"],
    requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_hardened_steel" },
      { type: "unlockRecipe", recipeId: "r_fine_sword" },
      { type: "unlockRecipe", recipeId: "r_fine_armor" },
      { type: "unlockRecipe", recipeId: "r_fine_shield" },
      { type: "unlockRecipe", recipeId: "r_soldier" },
      {
        type: "unlockListing",
        resourceIds: [
          "hardened_steel",
          "fine_sword",
          "fine_armor",
          "fine_shield",
        ],
      },
    ],
    description:
      "Unlocks Hardened Steel and Fine (T2) gear — and Soldiers mustered from it.",
    flavor: "Quench twice; strike once.",
  },
  res_master_smithing: {
    id: "res_master_smithing",
    name: "Masterwork Smithing",
    currency: "research",
    cost: 1500,
    prereqs: ["res_hardened_steel"],
    requiresTerritory: "t_ironreach",
    effects: [
      { type: "unlockRecipe", recipeId: "r_master_sword" },
      { type: "unlockRecipe", recipeId: "r_master_armor" },
      { type: "unlockRecipe", recipeId: "r_master_shield" },
      { type: "unlockRecipe", recipeId: "r_knight" },
      {
        type: "unlockListing",
        resourceIds: ["master_sword", "master_armor", "master_shield"],
      },
    ],
    description: "Gemstone-set Master (T3) gear — and Knights worthy of it.",
    flavor: "A blade with a jewel in its hilt has a debt in its edge.",
  },
  res_quartermaster: {
    id: "res_quartermaster",
    name: "Master Quartermaster",
    currency: "research",
    cost: 900,
    prereqs: ["res_trade_routes"],
    requiresTerritory: "t_ironreach",
    effects: [{ type: "autoSell", enabled: true }],
    description:
      "Auto-sells the undrained surplus of any listed good at 50% of its Market price (storage buffers are never sold).",
    flavor: "One ledger, one seal, and nothing in Yensburg goes to waste.",
  },

  // ── Tier A — unlocked after The High Wall falls ──────────────────────────
  res_war_drums: {
    id: "res_war_drums",
    name: "War Drums",
    currency: "research",
    cost: 2500,
    prereqs: ["res_drill_yard", "res_master_smithing"],
    requiresTerritory: "t_highwall",
    effects: [{ type: "productionBonus", kind: "barracks", mult: 1.5 }],
    description:
      "+50% Barracks muster rate — militia, soldiers, and knights all muster faster.",
    flavor:
      "The drumbeat carries farther than any order; the ranks close before the echo fades.",
  },
  res_merchant_compact: {
    id: "res_merchant_compact",
    name: "Merchant Compact",
    currency: "research",
    cost: 3000,
    prereqs: ["res_logistics"],
    requiresTerritory: "t_highwall",
    effects: [
      { type: "globalRateBonus", mult: 1.15 },
      { type: "marketCapacityBonus", mult: 1.2 },
    ],
    description:
      "+15% output to all production (gatherers, smelters, workshops) and +20% Market sell capacity.",
    flavor:
      "The guilds sign the compact under torchlight; by morning, every cart rolls faster.",
  },
  res_illuminated_texts: {
    id: "res_illuminated_texts",
    name: "Illuminated Texts",
    currency: "research",
    cost: 3500,
    prereqs: ["res_grand_design"],
    requiresTerritory: "t_highwall",
    effects: [{ type: "scholarBonus", mult: 2.0 }],
    description:
      "+100% Scholar research output — your scribes double their output.",
    flavor:
      "Gold leaf and lapis lazuli: the margin notes alone are worth a siege.",
  },

  // ── Tier B — post-victory free-play, unlocked after The Black Keep falls ─
  res_siege_engines: {
    id: "res_siege_engines",
    name: "Siege Engines",
    currency: "research",
    cost: 25000,
    prereqs: ["res_war_drums"],
    requiresTerritory: "t_blackkeep",
    effects: [{ type: "productionBonus", kind: "barracks", mult: 2.0 }],
    description:
      "+100% Barracks muster rate — your war machines turn the barracks into a force of nature.",
    flavor:
      "Trebuchet, ballista, ram — the enemy's walls mean nothing when the machines arrive.",
  },
  res_eternal_forge: {
    id: "res_eternal_forge",
    name: "The Eternal Forge",
    currency: "research",
    cost: 40000,
    prereqs: ["res_merchant_compact", "res_illuminated_texts"],
    requiresTerritory: "t_blackkeep",
    effects: [
      { type: "globalRateBonus", mult: 1.3 },
      { type: "scholarBonus", mult: 1.5 },
    ],
    description:
      "+30% to all production (gatherers, smelters, workshops) and +50% Scholar research output.",
    flavor:
      "The forge that never cools; the quill that never dries. Yensburg does not rest.",
  },
  res_yensburg_reborn: {
    id: "res_yensburg_reborn",
    name: "Yensburg Reborn",
    currency: "research",
    cost: 60000,
    prereqs: ["res_siege_engines", "res_eternal_forge"],
    requiresTerritory: "t_blackkeep",
    effects: [
      { type: "globalRateBonus", mult: 1.5 },
      { type: "productionBonus", kind: "barracks", mult: 1.5 },
      { type: "marketCapacityBonus", mult: 2.0 },
    ],
    description:
      "+50% to all production, +50% Barracks muster rate, and ×2 Market sell capacity. The city is whole again.",
    flavor:
      "The banners fly, the bells ring. What the Usurer-Lord took, the people have rebuilt — and then some.",
  },
};
