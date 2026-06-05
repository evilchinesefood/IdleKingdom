import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { START_STATE } from "../Source/Engine/Content/StartState.js";

describe("Recipe id integrity", () => {
  it("every recipe input and output is a real resource id", () => {
    for (const r of Object.values(RECIPES)) {
      expect(RESOURCES[r.output]).toBeTruthy();
      for (const inId of Object.keys(r.inputs))
        expect(RESOURCES[inId]).toBeTruthy();
    }
  });
  it("every recipe crafterKind is a real machine kind", () => {
    for (const r of Object.values(RECIPES))
      expect(MACHINES[r.crafterKind]).toBeTruthy();
  });
});

describe("Value-positivity of all priced recipes (§3.4)", () => {
  it("each output basePrice exceeds summed input basePrice (parchment + troops exempt: never listed)", () => {
    for (const r of Object.values(RECIPES)) {
      const outPrice = RESOURCES[r.output].basePrice;
      if (outPrice == null) continue; // never-listed outputs (parchment, troops)
      let inCost = 0;
      for (const [inId, amt] of Object.entries(r.inputs)) {
        const p = RESOURCES[inId].basePrice;
        inCost += (p == null ? 0 : p) * amt;
      }
      // strictly positive margin
      expect(outPrice - inCost > 0).toBe(true);
    }
  });
  it("steel margin is thin-but-positive (chokepoint guard)", () => {
    // steel inputs: iron_bar*2 (4.0) + coal*1 (1.5) = 9.5; sell 14.0 -> +4.5 per steel unit
    const r = RECIPES.r_steel;
    const inCost =
      RESOURCES.iron_bar.basePrice * 2 + RESOURCES.coal.basePrice * 1;
    expect(inCost).toBeCloseTo(9.5, 1e-9);
    expect(RESOURCES.steel.basePrice - inCost).toBeCloseTo(4.5, 1e-9);
  });
});

describe("Research/Territory cross-references", () => {
  it("every research prereq is a real node", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      for (const p of n.prereqs) expect(RESEARCH_NODES[p]).toBeTruthy();
    }
  });
  it("every research requiresTerritory is a real territory", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      if (n.requiresTerritory != null)
        expect(TERRITORIES[n.requiresTerritory]).toBeTruthy();
    }
  });
});

describe("StartState seed integrity", () => {
  it("seed node recipeId/resourceId reference real content", () => {
    for (const n of START_STATE.graph.nodes) {
      if (n.recipeId != null) expect(RECIPES[n.recipeId]).toBeTruthy();
      if (n.resourceId != null) expect(RESOURCES[n.resourceId]).toBeTruthy();
      expect(MACHINES[n.kind]).toBeTruthy();
    }
  });
  it("seed links reference existing nodes and real resources", () => {
    const ids = new Set(START_STATE.graph.nodes.map((n) => n.id));
    for (const l of START_STATE.graph.links) {
      expect(ids.has(l.from)).toBe(true);
      expect(ids.has(l.to)).toBe(true);
      expect(RESOURCES[l.resourceId]).toBeTruthy();
    }
  });
  it("seed graph is EMPTY (the player builds the Mine -> Smelt -> Market chain)", () => {
    expect(START_STATE.graph.nodes.length).toBe(0);
    expect(START_STATE.graph.links.length).toBe(0);
    expect(START_STATE.graph.nextNodeSeq).toBe(0);
    expect(START_STATE.graph.nextLinkSeq).toBe(0);
  });
  it("seed recipesUnlocked is exactly [r_iron_bar]", () => {
    expect(START_STATE.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
  });
  it("every seed marketListing is a real resource", () => {
    for (const id of START_STATE.unlocks.marketListings)
      expect(RESOURCES[id]).toBeTruthy();
  });
});
