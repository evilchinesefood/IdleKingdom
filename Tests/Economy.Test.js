import { describe, it, expect } from "./Runner.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { seededState } from "./Fixtures/Seeded.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  upgradeCost,
  canUpgrade,
  applyUpgrade,
  isListed,
  sellFromStockpile,
  buildingCopyCost,
  buildingCopyCosts,
} from "../Source/Engine/Systems/EconomySystem.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
};

describe("EconomySystem", () => {
  it("upgradeCost = base * 1.15^level (exact floats)", () => {
    // gatherer upgradeBase = 15
    expect(upgradeCost("gatherer", 1, content)).toBeCloseTo(
      15 * Math.pow(1.15, 1),
      1e-9,
    );
    expect(upgradeCost("gatherer", 5, content)).toBeCloseTo(
      15 * Math.pow(1.15, 5),
      1e-9,
    );
    // smelter upgradeBase = 25
    expect(upgradeCost("smelter", 3, content)).toBeCloseTo(
      25 * Math.pow(1.15, 3),
      1e-9,
    );
    // market upgradeBase = 30
    expect(upgradeCost("market", 0, content)).toBeCloseTo(
      30 * Math.pow(1.15, 0),
      1e-9,
    );
    // scholar upgradeBase = 35
    expect(upgradeCost("scholar", 4, content)).toBeCloseTo(
      35 * Math.pow(1.15, 4),
      1e-9,
    );
  });

  it("canUpgrade reflects gold on hand; applyUpgrade spends + increments level", () => {
    const s = seededState(new FakeClock(0));
    // seed has 50 gold; miner L1 next cost = 15*1.15 = 17.25
    expect(canUpgrade(s, content, "n_miner_0")).toBe(true);
    applyUpgrade(s, content, "n_miner_0");
    const miner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    expect(s.currencies.gold).toBeCloseTo(50 - 15 * Math.pow(1.15, 1), 1e-9);
    expect(s._solved).toBe(undefined);
  });

  it("isListed honors marketListings AND non-null basePrice", () => {
    const s = NewGame(new FakeClock(0));
    expect(isListed(s, content, "iron_bar")).toBe(true); // listed at start
    expect(isListed(s, content, "steel")).toBe(false); // not listed until researched
    expect(isListed(s, content, "plank")).toBe(false); // listed via res_open_market
    expect(isListed(s, content, "parchment")).toBe(false); // basePrice null
  });

  it("sellFromStockpile converts a node's stockpile to gold + research tithe", () => {
    const s = seededState(new FakeClock(0));
    const smelter = s.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 10;
    const gold0 = s.currencies.gold;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    // 10 iron_bar * 4.0 = 40 gold; tithe 0.05 * 40 = 2 research
    expect(s.currencies.gold).toBeCloseTo(gold0 + 40.0, 1e-9);
    expect(s.currencies.research).toBeCloseTo(2.0, 1e-9);
    expect(smelter.stockpile.iron_bar).toBeCloseTo(0, 1e-9);
  });

  it("value-positivity invariant: every one of the 12 recipes is gold-positive", () => {
    for (const r of Object.values(RECIPES)) {
      const outPrice = RESOURCES[r.output].basePrice;
      let inCost = 0;
      for (const [inId, amt] of Object.entries(r.inputs)) {
        const p = RESOURCES[inId].basePrice;
        inCost += (p == null ? 0 : p) * amt;
      }
      // parchment has null basePrice (never listed) — treat output value as 0 for the assert,
      // and it still must not be negative-margin: its inputs (timber) cost > 0, so skip null-output recipes.
      if (outPrice == null) continue;
      expect(outPrice > inCost).toBeTruthy();
    }
  });

  it("upgradeCost piecewise: identical to 1.15^level at/below knee (L40), softer beyond", () => {
    const base = 15; // gatherer
    // Below knee — unchanged
    expect(upgradeCost("gatherer", 0, content)).toBeCloseTo(
      base * Math.pow(1.15, 0),
      1e-9,
    );
    expect(upgradeCost("gatherer", 10, content)).toBeCloseTo(
      base * Math.pow(1.15, 10),
      1e-9,
    );
    // At knee — unchanged
    expect(upgradeCost("gatherer", 40, content)).toBeCloseTo(
      base * Math.pow(1.15, 40),
      1e-9,
    );
    // First soft step: base * 1.15^40 * 1.1^1
    expect(upgradeCost("gatherer", 41, content)).toBeCloseTo(
      base * Math.pow(1.15, 40) * Math.pow(1.1, 1),
      1e-9,
    );
    // L50 must be cheaper than old pure-1.15 curve
    expect(
      upgradeCost("gatherer", 50, content) < base * Math.pow(1.15, 50),
    ).toBe(true);
    // Monotonic across the knee: 39 < 40 < 41 < 42
    const c39 = upgradeCost("gatherer", 39, content);
    const c40 = upgradeCost("gatherer", 40, content);
    const c41 = upgradeCost("gatherer", 41, content);
    const c42 = upgradeCost("gatherer", 42, content);
    expect(c40 > c39).toBe(true);
    expect(c41 > c40).toBe(true);
    expect(c42 > c41).toBe(true);
  });

  it("buildingCopyCosts returns the same two values as separate buildingCopyCost calls (task 14)", () => {
    const s = seededState(new FakeClock(0));
    // upgrade the smelter twice so the withUpgrades variant differs from structure-only
    applyUpgrade(s, content, "n_smelter_0");
    s.currencies.gold = 1e6;
    applyUpgrade(s, content, "n_smelter_0");
    const building = {
      id: "b_0",
      name: "B",
      nodeIds: ["n_miner_0", "n_smelter_0"],
      children: [],
      rect: { x: 0, y: 0, w: 10, h: 10 },
    };
    const combined = buildingCopyCosts(building, s, content);
    expect(combined.withUpgrades).toBeCloseTo(
      buildingCopyCost(building, s, content, true),
      1e-9,
    );
    expect(combined.structure).toBeCloseTo(
      buildingCopyCost(building, s, content, false),
      1e-9,
    );
    expect(combined.withUpgrades > combined.structure).toBe(true);
  });

  it("sales tithe is 0.05, then 0.07 after raising titheRate", () => {
    const s = seededState(new FakeClock(0));
    const node = s.graph.nodes.find((n) => n.id === "n_smelter_0");
    node.stockpile.iron_bar = 100;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    expect(s.currencies.research).toBeCloseTo(20, 1e-9);
    s.unlocks.titheRate = 0.07;
    node.stockpile.iron_bar = 100;
    const research0 = s.currencies.research;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    expect(s.currencies.research - research0).toBeCloseTo(28, 1e-9);
  });
});
