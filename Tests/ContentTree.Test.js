import { describe, it, expect } from "./Runner.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";

const VALID_EFFECT_TYPES = new Set([
  "unlockMachine", "unlockRecipe", "unlockListing", "enableGathererResource",
  "productionBonus", "globalRateBonus", "marketCapacityBonus", "titheRate",
  "offlineCapHours", "scholarBonus", "heroSlot", "autoSell", "unlockGearTier",
]);

function checkEffectRefs(eff) {
  switch (eff.type) {
    case "unlockMachine":
      expect(MACHINES[eff.kind]).toBeTruthy();
      break;
    case "unlockRecipe":
      expect(RECIPES[eff.recipeId]).toBeTruthy();
      break;
    case "unlockListing":
      for (const id of eff.resourceIds) expect(RESOURCES[id]).toBeTruthy();
      break;
    case "enableGathererResource":
      expect(RESOURCES[eff.resourceId]).toBeTruthy();
      break;
    case "productionBonus":
      expect(MACHINES[eff.kind]).toBeTruthy();
      break;
    case "unlockGearTier":
      for (const id of eff.itemIds) expect(EQUIPMENT[id]).toBeTruthy();
      break;
    default:
      // scalar effects (mult/value/count/enabled) carry no id reference
      break;
  }
}

describe("ResearchNodes content", () => {
  it("has 17 nodes (15 research + 2 renown), each keyed by id", () => {
    const all = Object.values(RESEARCH_NODES);
    expect(all.length).toBe(17);
    for (const [k, n] of Object.entries(RESEARCH_NODES)) expect(n.id).toBe(k);
    expect(all.filter((n) => n.currency === "research").length).toBe(15);
    expect(all.filter((n) => n.currency === "renown").length).toBe(2);
  });

  it("every prereq references a real research node", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      for (const p of n.prereqs) expect(RESEARCH_NODES[p]).toBeTruthy();
    }
  });

  it("every effect has a known type and valid id references", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      expect(Array.isArray(n.effects)).toBe(true);
      for (const eff of n.effects) {
        expect(VALID_EFFECT_TYPES.has(eff.type)).toBe(true);
        checkEffectRefs(eff);
      }
    }
  });

  it("BLOCKER #1: equipment chain is pure-research (no territory gate)", () => {
    expect(RESEARCH_NODES.res_smithing.requiresTerritory).toBe(null);
    expect(RESEARCH_NODES.res_armory.requiresTerritory).toBe(null);
  });

  it("only war_college and quartermaster are territory-gated", () => {
    const gated = Object.values(RESEARCH_NODES).filter((n) => n.requiresTerritory != null).map((n) => n.id).sort();
    expect(gated).toEqual(["res_quartermaster", "res_war_college"]);
    expect(RESEARCH_NODES.res_war_college.requiresTerritory).toBe("t_smithyward");
    expect(RESEARCH_NODES.res_quartermaster.requiresTerritory).toBe("t_ironreach");
  });

  it("every requiresTerritory references a real territory", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      if (n.requiresTerritory != null) expect(TERRITORIES[n.requiresTerritory]).toBeTruthy();
    }
  });

  it("canonical spine costs", () => {
    expect(RESEARCH_NODES.res_scholar.cost).toBe(9);
    expect(RESEARCH_NODES.res_steelmaking.cost).toBe(120);
    expect(RESEARCH_NODES.res_armory.cost).toBe(400);
    expect(RESEARCH_NODES.res_grand_design.cost).toBe(5000);
  });
});

describe("Territories content", () => {
  it("has 6 territories keyed by id with orders 1..6", () => {
    const all = Object.values(TERRITORIES);
    expect(all.length).toBe(6);
    for (const [k, t] of Object.entries(TERRITORIES)) expect(t.id).toBe(k);
    expect(all.map((t) => t.order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("only t_blackkeep is the victory territory and it is order 6", () => {
    const victors = all().filter((t) => t.isVictory).map((t) => t.id);
    expect(victors).toEqual(["t_blackkeep"]);
    expect(TERRITORIES.t_blackkeep.order).toBe(6);
  });

  it("grantsHero references a real hero template", () => {
    for (const t of Object.values(TERRITORIES)) {
      if (t.grantsHero != null) expect(HEROES[t.grantsHero]).toBeTruthy();
    }
    expect(TERRITORIES.t_gatehouse.grantsHero).toBe("hero_warden");
  });

  it("every territory unlock effect references valid ids", () => {
    for (const t of Object.values(TERRITORIES)) {
      for (const eff of t.unlocks) {
        expect(VALID_EFFECT_TYPES.has(eff.type)).toBe(true);
        checkEffectRefs(eff);
      }
    }
  });

  it("BLOCKER #2/#3: gear-tier unlocks fire one territory early", () => {
    const tiers = (id) =>
      TERRITORIES[id].unlocks.filter((e) => e.type === "unlockGearTier").map((e) => ({ items: e.itemIds, tier: e.tier }));
    expect(tiers("t_smithyward")).toEqual([{ items: ["sword", "shield"], tier: 2 }]);
    expect(tiers("t_oldmarket")).toEqual([{ items: ["armor"], tier: 2 }]);
    expect(tiers("t_ironreach")).toEqual([{ items: ["sword", "shield"], tier: 3 }]);
    expect(tiers("t_highwall")).toEqual([{ items: ["armor"], tier: 3 }]);
  });

  it("required power is strictly increasing in reclaim order", () => {
    const ordered = all().sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].requiredPower > ordered[i - 1].requiredPower).toBe(true);
    }
  });
});

function all() {
  return Object.values(TERRITORIES);
}
