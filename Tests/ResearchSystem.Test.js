import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  canBuyResearch,
  buyResearch,
  applyEffects,
  researchStatus,
} from "../Source/Engine/Systems/ResearchSystem.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
};

// Buy a chain of research nodes by directly granting currency, ignoring prereq order helper.
function own(s, id) {
  s.currencies.research += content.researchNodes[id].cost + 1;
  s.currencies.renown += content.researchNodes[id].cost + 1;
  buyResearch(s, content, id);
}

describe("ResearchSystem", () => {
  it("prereq gating: cannot buy res_lumber before res_scholar", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_lumber")).toBe(false); // prereq res_scholar unowned
    expect(researchStatus(s, content, "res_lumber")).toBe("locked");
    expect(researchStatus(s, content, "res_scholar")).toBe("available");
  });

  it("buying spends currency, records ownership, applies effects", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_scholar")).toBe(true);
    buyResearch(s, content, "res_scholar");
    expect(s.unlocks.researchOwned.includes("res_scholar")).toBe(true);
    expect(s.currencies.research).toBeCloseTo(1000 - 9, 1e-9);
    // res_scholar effects: unlockMachine scholar + unlockRecipe r_parchment
    expect(s.unlocks.machinesUnlocked.includes("scholar")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_parchment")).toBe(true);
    expect(researchStatus(s, content, "res_scholar")).toBe("owned");
    expect(s._solved).toBe(undefined);
  });

  it("BLOCKER #1: res_smithing + res_armory buyable with NO territory reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    // climb the research-only spine
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    // res_smithing needs only res_steelmaking
    expect(canBuyResearch(s, content, "res_smithing")).toBe(true);
    own(s, "res_smithing");
    // res_armory needs res_smithing + res_fittings (also research-only)
    own(s, "res_fittings");
    expect(canBuyResearch(s, content, "res_armory")).toBe(true);
    own(s, "res_armory");
    // No territory was reclaimed at any point:
    expect(s.territories.reclaimed.length).toBe(0);
    // All three equipment recipes are now unlocked => T1 gear craftable pre-expedition.
    expect(s.unlocks.recipesUnlocked.includes("r_sword")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_armor")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_shield")).toBe(true);
  });

  it("territory-gated nodes blocked until reclaim: res_war_college needs t_smithyward", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    s.currencies.renown = 100000;
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_smithing");
    own(s, "res_fittings");
    own(s, "res_armory");
    // prereq (res_armory) owned + renown plenty, but t_smithyward not reclaimed:
    expect(canBuyResearch(s, content, "res_war_college")).toBe(false);
    s.territories.reclaimed.push("t_gatehouse", "t_smithyward");
    expect(canBuyResearch(s, content, "res_war_college")).toBe(true);
  });

  it("applyEffects: titheRate, offlineCapHours, productionBonus, globalRateBonus", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "titheRate", value: 0.07 }]);
    expect(s.unlocks.titheRate).toBeCloseTo(0.07, 1e-9);
    applyEffects(s, content, [{ type: "offlineCapHours", value: 24 }]);
    expect(s.unlocks.offlineCapHours).toBe(24);
    applyEffects(s, content, [
      { type: "productionBonus", kind: "smelter", mult: 1.25 },
    ]);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25, 1e-9);
    applyEffects(s, content, [{ type: "globalRateBonus", mult: 1.1 }]);
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.1, 1e-9);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25 * 1.1, 1e-9);
    expect(s.unlocks.productionBonuses.workshop).toBeCloseTo(1.1, 1e-9);
  });

  it("applyEffects: marketCapacityBonus, enableGathererResource, heroSlot, autoSell, unlockGearTier", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "marketCapacityBonus", mult: 1.3 }]);
    expect(s.unlocks.productionBonuses.market).toBeCloseTo(1.3, 1e-9);
    applyEffects(s, content, [
      { type: "enableGathererResource", resourceId: "coal_raw" },
    ]);
    expect(s.unlocks.gathererResources.includes("coal_raw")).toBe(true);
    const slots0 = s.unlocks.heroSlots;
    applyEffects(s, content, [{ type: "heroSlot", count: 1 }]);
    expect(s.unlocks.heroSlots).toBe(slots0 + 1);
    applyEffects(s, content, [{ type: "autoSell", enabled: true }]);
    expect(s.unlocks.autoSell).toBe(true);
    applyEffects(s, content, [
      { type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 2 },
    ]);
    const hasSwordT2 = s.unlocks.gearTiersUnlocked.some(
      (g) => g.itemId === "sword" && g.tier === 2,
    );
    expect(hasSwordT2).toBe(true);
  });
});
