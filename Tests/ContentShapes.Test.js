import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import {
  MACHINES,
  GATHERER_VARIANTS,
} from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { EQUIPMENT, itemStat } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";

describe("Resources content", () => {
  it("has 17 resources", () => {
    expect(Object.keys(RESOURCES).length).toBe(17);
  });
  it("each entry's key matches its id", () => {
    for (const [k, r] of Object.entries(RESOURCES)) expect(r.id).toBe(k);
  });
  it("tier counts: 5 raw, 5 intermediate, 4 component, 3 equipment", () => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const r of Object.values(RESOURCES)) counts[r.tier]++;
    expect(counts).toEqual({ 0: 5, 1: 5, 2: 4, 3: 3 });
  });
  it("parchment is the only never-listed resource", () => {
    const nulls = Object.values(RESOURCES)
      .filter((r) => r.basePrice === null)
      .map((r) => r.id);
    expect(nulls).toEqual(["parchment"]);
  });
  it("canonical prices", () => {
    expect(RESOURCES.iron_bar.basePrice).toBe(4.0);
    expect(RESOURCES.steel.basePrice).toBe(14.0);
    expect(RESOURCES.sword.basePrice).toBe(140.0);
    expect(RESOURCES.gemstone.basePrice).toBe(3.0);
  });
});

describe("Machines content", () => {
  it("has 6 engine kinds, each keyed by its kind", () => {
    expect(Object.keys(MACHINES).length).toBe(6);
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
  it("has 12 recipes, each keyed by its id", () => {
    expect(Object.keys(RECIPES).length).toBe(12);
    for (const [k, r] of Object.entries(RECIPES)) expect(r.id).toBe(k);
  });
  it("every crafterKind is a real smelter/workshop machine", () => {
    for (const r of Object.values(RECIPES)) {
      expect(r.crafterKind === "smelter" || r.crafterKind === "workshop").toBe(
        true,
      );
      expect(MACHINES[r.crafterKind]).toBeTruthy();
    }
  });
  it("canonical steel recipe", () => {
    expect(RECIPES.r_steel.inputs).toEqual({ iron_bar: 2, coal: 1 });
    expect(RECIPES.r_steel.output).toBe("steel");
    expect(RECIPES.r_steel.baseOut).toBe(0.25);
  });
});

describe("Equipment content", () => {
  it("has 3 items keyed by itemId with correct slots", () => {
    expect(Object.keys(EQUIPMENT).length).toBe(3);
    expect(EQUIPMENT.sword.slot).toBe("weapon");
    expect(EQUIPMENT.armor.slot).toBe("armor");
    expect(EQUIPMENT.shield.slot).toBe("accessory");
  });
  it("itemStat scales linearly by tier", () => {
    expect(itemStat("sword", 1)).toBe(10);
    expect(itemStat("sword", 3)).toBe(30);
    expect(itemStat("armor", 2)).toBe(24);
    expect(itemStat("shield", 3)).toBe(24);
  });
});

describe("Heroes content", () => {
  it("has 3 templates keyed by id", () => {
    expect(Object.keys(HEROES).length).toBe(3);
    for (const [k, h] of Object.entries(HEROES)) expect(h.id).toBe(k);
  });
  it("warden is the territory-granted starter, others are renown-unlocked", () => {
    expect(HEROES.hero_warden.unlockKind).toBe("territory");
    expect(HEROES.hero_warden.unlockRenownCost).toBe(0);
    expect(HEROES.hero_ranger.unlockRenownCost).toBe(40);
    expect(HEROES.hero_smith.unlockRenownCost).toBe(80);
  });
});
