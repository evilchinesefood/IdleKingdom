import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import {
  MACHINES,
  GATHERER_VARIANTS,
} from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";

describe("Resources content", () => {
  it("has 27 resources", () => {
    expect(Object.keys(RESOURCES).length).toBe(27);
  });
  it("each entry's key matches its id", () => {
    for (const [k, r] of Object.entries(RESOURCES)) expect(r.id).toBe(k);
  });
  it("tier counts: 5 raw, 5 intermediate, 5 component(+hardened_steel), 6 equipment(+fine/master), 3 troops(tier5)", () => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of Object.values(RESOURCES)) counts[r.tier]++;
    expect(counts).toEqual({ 0: 5, 1: 5, 2: 5, 3: 6, 4: 3, 5: 3 });
  });
  it("parchment and troops are the never-listed resources (basePrice null)", () => {
    const nulls = Object.values(RESOURCES)
      .filter((r) => r.basePrice === null)
      .map((r) => r.id);
    expect(nulls).toEqual(["parchment", "militia", "soldier", "knight"]);
  });
  it("canonical prices", () => {
    expect(RESOURCES.iron_bar.basePrice).toBe(4.0);
    expect(RESOURCES.steel.basePrice).toBe(14.0);
    expect(RESOURCES.sword.basePrice).toBe(140.0);
    expect(RESOURCES.gemstone.basePrice).toBe(3.0);
  });
  it("canonical war-rework prices", () => {
    expect(RESOURCES.hardened_steel.basePrice).toBe(20.0);
    expect(RESOURCES.master_sword.basePrice).toBe(400.0);
    expect(RESOURCES.knight.basePrice).toBe(null);
    expect(RESOURCES.knight.power).toBe(9);
  });
});

describe("Machines content", () => {
  it("has 7 engine kinds, each keyed by its kind", () => {
    expect(Object.keys(MACHINES).length).toBe(7);
    for (const [k, m] of Object.entries(MACHINES)) expect(m.kind).toBe(k);
  });
  it("canonical machine numbers", () => {
    expect(MACHINES.gatherer.baseOutput).toBe(1.0);
    expect(MACHINES.gatherer.rateGain).toBe(0.5);
    expect(MACHINES.gatherer.upgradeBase).toBe(15);
    expect(MACHINES.market.baseOutput).toBe(5.0);
    expect(MACHINES.scholar.baseOutput).toBe(0.5);
    expect(MACHINES.storage.baseCap).toBe(200); // shared total cap = 200*level
    expect(MACHINES.storage.capGain).toBe(200);
  });
  it("gatherer variants reference real resources", () => {
    for (const v of Object.values(GATHERER_VARIANTS)) {
      for (const id of v.resourceIds) expect(RESOURCES[id]).toBeTruthy();
    }
  });
});

describe("Recipes content", () => {
  it("has 22 recipes, each keyed by its id", () => {
    expect(Object.keys(RECIPES).length).toBe(22);
    for (const [k, r] of Object.entries(RECIPES)) expect(r.id).toBe(k);
  });
  it("every crafterKind is a real smelter/workshop/barracks machine", () => {
    const validKinds = new Set(["smelter", "workshop", "barracks"]);
    for (const r of Object.values(RECIPES)) {
      expect(validKinds.has(r.crafterKind)).toBe(true);
      expect(MACHINES[r.crafterKind]).toBeTruthy();
    }
  });
  it("canonical steel recipe", () => {
    expect(RECIPES.r_steel.inputs).toEqual({ iron_bar: 2, coal: 1 });
    expect(RECIPES.r_steel.output).toBe("steel");
    expect(RECIPES.r_steel.baseOut).toBe(0.25);
  });
});

describe("Troop content (siege power)", () => {
  it("the three troops are tier-5, never-listed, with canonical power", () => {
    const troops = ["militia", "soldier", "knight"];
    for (const id of troops) {
      expect(RESOURCES[id].tier).toBe(5);
      expect(RESOURCES[id].basePrice).toBe(null);
      expect(typeof RESOURCES[id].power).toBe("number");
    }
    expect(RESOURCES.militia.power).toBe(1);
    expect(RESOURCES.soldier.power).toBe(3);
    expect(RESOURCES.knight.power).toBe(9);
  });
  it("the three troop recipes are barracks-crafted", () => {
    for (const id of ["r_militia", "r_soldier", "r_knight"]) {
      expect(RECIPES[id].crafterKind).toBe("barracks");
    }
    expect(RECIPES.r_militia.output).toBe("militia");
    expect(RECIPES.r_soldier.output).toBe("soldier");
    expect(RECIPES.r_knight.output).toBe("knight");
  });
});
