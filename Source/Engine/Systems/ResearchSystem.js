// Shared cost formatter so reject toasts match the UI button (see EconomySystem.js,
// kept in sync with Source/UI/Format/Format.js).
import { fmtCost } from "./EconomySystem.js";

// Authoritative effect mapping per node (Interface Contract §2.4).
const EFFECTS = {
  res_scholar: [
    { type: "unlockMachine", kind: "scholar" },
    { type: "unlockMachine", kind: "workshop" },
    { type: "unlockRecipe", recipeId: "r_parchment" },
  ],
  res_lumber: [
    { type: "enableGathererResource", resourceId: "timber" },
    { type: "unlockRecipe", recipeId: "r_plank" },
  ],
  res_tannery: [
    { type: "enableGathererResource", resourceId: "hide" },
    { type: "unlockRecipe", recipeId: "r_leather" },
  ],
  res_coalworks: [
    { type: "unlockRecipe", recipeId: "r_coal" },
    { type: "enableGathererResource", resourceId: "coal_raw" },
  ],
  res_steelmaking: [{ type: "unlockRecipe", recipeId: "r_steel" }],
  res_fittings: [
    { type: "unlockRecipe", recipeId: "r_fitting" },
    { type: "unlockListing", resourceIds: ["fitting"] },
  ],
  res_open_market: [
    {
      type: "unlockListing",
      resourceIds: ["coal", "iron_bar", "plank", "leather", "steel"],
    },
  ],
  res_smithing: [
    { type: "unlockRecipe", recipeId: "r_blade" },
    { type: "unlockRecipe", recipeId: "r_plating" },
    { type: "unlockListing", resourceIds: ["blade", "plating"] },
  ],
  res_armory: [
    { type: "unlockRecipe", recipeId: "r_sword" },
    { type: "unlockRecipe", recipeId: "r_armor" },
    { type: "unlockRecipe", recipeId: "r_shield" },
    { type: "unlockListing", resourceIds: ["sword", "armor", "shield"] },
  ],
  res_efficient_forges: [
    { type: "productionBonus", kind: "smelter", mult: 1.25 },
  ],
  res_assembly_jigs: [
    { type: "productionBonus", kind: "workshop", mult: 1.25 },
  ],
  res_trade_routes: [
    { type: "marketCapacityBonus", mult: 1.3 },
    { type: "titheRate", value: 0.07 },
  ],
  res_ledgers: [{ type: "marketCapacityBonus", mult: 1.4 }],
  res_logistics: [{ type: "globalRateBonus", mult: 1.1 }],
  res_grand_design: [
    { type: "globalRateBonus", mult: 1.2 },
    { type: "scholarBonus", mult: 1.5 },
  ],
  res_drill_yard: [
    { type: "unlockMachine", kind: "barracks" },
    { type: "unlockRecipe", recipeId: "r_militia" },
  ],
  res_hardened_steel: [
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
  res_master_smithing: [
    { type: "unlockRecipe", recipeId: "r_master_sword" },
    { type: "unlockRecipe", recipeId: "r_master_armor" },
    { type: "unlockRecipe", recipeId: "r_master_shield" },
    { type: "unlockRecipe", recipeId: "r_knight" },
    {
      type: "unlockListing",
      resourceIds: ["master_sword", "master_armor", "master_shield"],
    },
  ],
  res_quartermaster: [{ type: "autoSell", enabled: true }],

  // Tier A — t_highwall gated
  res_war_drums: [{ type: "productionBonus", kind: "barracks", mult: 1.5 }],
  res_merchant_compact: [
    { type: "globalRateBonus", mult: 1.15 },
    { type: "marketCapacityBonus", mult: 1.2 },
  ],
  res_illuminated_texts: [{ type: "scholarBonus", mult: 2.0 }],

  // Tier B — t_blackkeep gated
  res_siege_engines: [{ type: "productionBonus", kind: "barracks", mult: 2.0 }],
  res_eternal_forge: [
    { type: "globalRateBonus", mult: 1.3 },
    { type: "scholarBonus", mult: 1.5 },
  ],
  res_yensburg_reborn: [
    { type: "globalRateBonus", mult: 1.5 },
    { type: "productionBonus", kind: "barracks", mult: 1.5 },
    { type: "marketCapacityBonus", mult: 2.0 },
  ],
};

export function researchStatus(state, content, id) {
  if (state.unlocks.researchOwned.includes(id)) return "owned";
  const node = content.researchNodes[id];
  if (!node) return "locked";
  const prereqsMet = node.prereqs.every((p) =>
    state.unlocks.researchOwned.includes(p),
  );
  const terrMet =
    !node.requiresTerritory ||
    state.territories.reclaimed.includes(node.requiresTerritory);
  return prereqsMet && terrMet ? "available" : "locked";
}

// Null when buyable; otherwise a user-facing reason. The cost-only failure spells
// out the price; everything else is the catch-all. canBuyResearch is the boolean view.
export function buyResearchError(state, content, id) {
  const node = content.researchNodes[id];
  if (!node) return "Cannot buy research";
  if (state.unlocks.researchOwned.includes(id)) return "Cannot buy research";
  if (!node.prereqs.every((p) => state.unlocks.researchOwned.includes(p)))
    return "Cannot buy research";
  if (
    node.requiresTerritory &&
    !state.territories.reclaimed.includes(node.requiresTerritory)
  )
    return "Cannot buy research";
  if (state.currencies[node.currency] < node.cost)
    return `Not enough ${node.currency} — unlock costs ${fmtCost(node.cost)}`;
  return null;
}

export function canBuyResearch(state, content, id) {
  return buyResearchError(state, content, id) === null;
}

export function buyResearch(state, content, id) {
  if (!canBuyResearch(state, content, id)) return;
  const node = content.researchNodes[id];
  state.currencies[node.currency] -= node.cost;
  state.unlocks.researchOwned.push(id);
  applyEffects(state, content, EFFECTS[id] || []);
  delete state._solved;
}

/** Machine Tuning — the endless research sink: each rank multiplies the kind's
 *  production bonus by `mult`; the next rank's cost grows by `costGrowth`. */
export const TUNING = {
  kinds: ["gatherer", "smelter", "workshop", "barracks", "market", "scholar"],
  baseCost: 25,
  costGrowth: 1.6,
  mult: 1.1,
};

export function tuningRank(state, kind) {
  return (state.unlocks.tuningRanks && state.unlocks.tuningRanks[kind]) || 0;
}

export function tuningCost(state, kind) {
  // round (not ceil): float drift (e.g. 25 * 1.6^4 = 163.84000…0003)
  return Math.round(
    TUNING.baseCost * Math.pow(TUNING.costGrowth, tuningRank(state, kind)),
  );
}

// Null when buyable; otherwise a user-facing reason. Tuning is paid in research.
export function buyTuningError(state, content, kind) {
  if (!TUNING.kinds.includes(kind)) return "Cannot buy tuning";
  if (!state.unlocks.machinesUnlocked.includes(kind))
    return "Cannot buy tuning";
  const cost = tuningCost(state, kind);
  if (state.currencies.research < cost)
    return `Not enough research — tuning costs ${fmtCost(cost)}`;
  return null;
}

export function canBuyTuning(state, content, kind) {
  return buyTuningError(state, content, kind) === null;
}

export function buyTuning(state, content, kind) {
  if (!canBuyTuning(state, content, kind)) return;
  state.currencies.research -= tuningCost(state, kind);
  const u = state.unlocks;
  if (!u.tuningRanks) u.tuningRanks = {};
  u.tuningRanks[kind] = (u.tuningRanks[kind] || 0) + 1;
  if (!u.productionBonuses) u.productionBonuses = {};
  u.productionBonuses[kind] = (u.productionBonuses[kind] ?? 1.0) * TUNING.mult;
  delete state._solved;
}

export function applyEffects(state, content, effects) {
  const u = state.unlocks;
  for (const e of effects) {
    switch (e.type) {
      case "unlockMachine":
        // gatherer variants (forester/trapper) collapse to the "gatherer" engine kind.
        if (!u.machinesUnlocked.includes(e.kind))
          u.machinesUnlocked.push(e.kind);
        break;
      case "unlockRecipe":
        if (!u.recipesUnlocked.includes(e.recipeId))
          u.recipesUnlocked.push(e.recipeId);
        break;
      case "unlockListing":
        for (const r of e.resourceIds)
          if (!u.marketListings.includes(r)) u.marketListings.push(r);
        break;
      case "enableGathererResource":
        if (!u.gathererResources) u.gathererResources = [];
        if (!u.gathererResources.includes(e.resourceId))
          u.gathererResources.push(e.resourceId);
        break;
      case "productionBonus":
        u.productionBonuses[e.kind] =
          (u.productionBonuses[e.kind] || 1.0) * e.mult;
        break;
      case "globalRateBonus":
        for (const k of ["gatherer", "smelter", "workshop"]) {
          u.productionBonuses[k] = (u.productionBonuses[k] || 1.0) * e.mult;
        }
        break;
      case "marketCapacityBonus":
        u.productionBonuses.market =
          (u.productionBonuses.market || 1.0) * e.mult;
        break;
      case "scholarBonus":
        u.productionBonuses.scholar =
          (u.productionBonuses.scholar || 1.0) * e.mult;
        break;
      case "titheRate":
        u.titheRate = e.value;
        break;
      case "offlineCapHours":
        // 1h is a hard maximum: clamp so no effect can ever raise the offline cap past it.
        u.offlineCapHours = Math.min(e.value, 1);
        break;
      case "autoSell":
        u.autoSell = e.enabled;
        break;
    }
  }
}
