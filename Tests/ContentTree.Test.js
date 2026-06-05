import { describe, it, expect } from "./Runner.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";

const VALID_EFFECT_TYPES = new Set([
  "unlockMachine",
  "unlockRecipe",
  "unlockListing",
  "enableGathererResource",
  "productionBonus",
  "globalRateBonus",
  "marketCapacityBonus",
  "titheRate",
  "offlineCapHours",
  "scholarBonus",
  "autoSell",
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
    default:
      // scalar effects (mult/value/count/enabled) carry no id reference
      break;
  }
}

describe("ResearchNodes content", () => {
  it("has 19 nodes, all research-currency, each keyed by id", () => {
    const all = Object.values(RESEARCH_NODES);
    expect(all.length).toBe(19);
    for (const [k, n] of Object.entries(RESEARCH_NODES)) expect(n.id).toBe(k);
    expect(all.filter((n) => n.currency === "research").length).toBe(19);
    expect(all.filter((n) => n.currency === "renown").length).toBe(0);
  });

  it("the three war-rework nodes' recipes and listings all resolve", () => {
    for (const id of [
      "res_drill_yard",
      "res_hardened_steel",
      "res_master_smithing",
    ]) {
      const node = RESEARCH_NODES[id];
      expect(node).toBeTruthy();
      for (const eff of node.effects) {
        if (eff.type === "unlockRecipe")
          expect(RECIPES[eff.recipeId]).toBeTruthy();
        if (eff.type === "unlockMachine")
          expect(MACHINES[eff.kind]).toBeTruthy();
        if (eff.type === "unlockListing")
          for (const r of eff.resourceIds) expect(RESOURCES[r]).toBeTruthy();
      }
    }
  });

  it("every barracks recipe's inputs and outputs are real resources", () => {
    const barracks = Object.values(RECIPES).filter(
      (r) => r.crafterKind === "barracks",
    );
    expect(barracks.length).toBe(3);
    for (const r of barracks) {
      expect(RESOURCES[r.output]).toBeTruthy();
      for (const inId of Object.keys(r.inputs))
        expect(RESOURCES[inId]).toBeTruthy();
    }
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

  it("equipment chain is pure-research (no territory gate)", () => {
    expect(RESEARCH_NODES.res_smithing.requiresTerritory).toBe(null);
    expect(RESEARCH_NODES.res_armory.requiresTerritory).toBe(null);
  });

  it("only master_smithing and quartermaster are territory-gated (both t_ironreach)", () => {
    const gated = Object.values(RESEARCH_NODES)
      .filter((n) => n.requiresTerritory != null)
      .map((n) => n.id)
      .sort();
    expect(gated).toEqual(["res_master_smithing", "res_quartermaster"]);
    expect(RESEARCH_NODES.res_master_smithing.requiresTerritory).toBe(
      "t_ironreach",
    );
    expect(RESEARCH_NODES.res_quartermaster.requiresTerritory).toBe(
      "t_ironreach",
    );
  });

  it("every requiresTerritory references a real territory", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      if (n.requiresTerritory != null)
        expect(TERRITORIES[n.requiresTerritory]).toBeTruthy();
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
    expect(all.map((t) => t.order).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("only t_blackkeep is the victory territory and it is order 6", () => {
    const victors = all()
      .filter((t) => t.isVictory)
      .map((t) => t.id);
    expect(victors).toEqual(["t_blackkeep"]);
    expect(TERRITORIES.t_blackkeep.order).toBe(6);
  });

  it("every territory unlock effect references valid ids", () => {
    for (const t of Object.values(TERRITORIES)) {
      for (const eff of t.unlocks) {
        expect(VALID_EFFECT_TYPES.has(eff.type)).toBe(true);
        checkEffectRefs(eff);
      }
    }
  });

  it("each territory carries finite gold+research rewards", () => {
    for (const t of Object.values(TERRITORIES)) {
      expect(Number.isFinite(t.rewards.gold)).toBe(true);
      expect(Number.isFinite(t.rewards.research)).toBe(true);
    }
    expect(TERRITORIES.t_gatehouse.rewards).toEqual({ gold: 50, research: 20 });
  });

  it("siegeCost is strictly increasing in reclaim order", () => {
    const ordered = all().sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].siegeCost > ordered[i - 1].siegeCost).toBe(true);
    }
    expect(ordered.map((t) => t.siegeCost)).toEqual([
      40, 150, 500, 1500, 4500, 12000,
    ]);
  });
});

function all() {
  return Object.values(TERRITORIES);
}
