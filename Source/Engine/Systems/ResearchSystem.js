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
  res_war_college: [{ type: "heroSlot", count: 1 }],
  res_quartermaster: [{ type: "autoSell", enabled: true }],
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

export function canBuyResearch(state, content, id) {
  const node = content.researchNodes[id];
  if (!node) return false;
  if (state.unlocks.researchOwned.includes(id)) return false;
  if (!node.prereqs.every((p) => state.unlocks.researchOwned.includes(p)))
    return false;
  if (
    node.requiresTerritory &&
    !state.territories.reclaimed.includes(node.requiresTerritory)
  )
    return false;
  return state.currencies[node.currency] >= node.cost;
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
  kinds: ["gatherer", "smelter", "workshop", "market", "scholar"],
  baseCost: 50,
  costGrowth: 1.6,
  mult: 1.1,
};

export function tuningRank(state, kind) {
  return (state.unlocks.tuningRanks && state.unlocks.tuningRanks[kind]) || 0;
}

export function tuningCost(state, kind) {
  // round (not ceil): 50 * 1.6^2 floats to 128.00000000000003
  return Math.round(
    TUNING.baseCost * Math.pow(TUNING.costGrowth, tuningRank(state, kind)),
  );
}

export function canBuyTuning(state, content, kind) {
  if (!TUNING.kinds.includes(kind)) return false;
  if (!state.unlocks.machinesUnlocked.includes(kind)) return false;
  return state.currencies.research >= tuningCost(state, kind);
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
      case "heroSlot":
        u.heroSlots = (u.heroSlots || 1) + e.count;
        break;
      case "autoSell":
        u.autoSell = e.enabled;
        break;
      case "unlockGearTier":
        for (const itemId of e.itemIds) {
          const exists = u.gearTiersUnlocked.some(
            (g) => g.itemId === itemId && g.tier === e.tier,
          );
          if (!exists) u.gearTiersUnlocked.push({ itemId, tier: e.tier });
        }
        break;
    }
  }
}
