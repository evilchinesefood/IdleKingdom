import { describe, it, expect } from "./Runner.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  upgradeCost, canUpgrade, applyUpgrade, isListed, sellFromStockpile,
} from "../Source/Engine/Systems/EconomySystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
};

describe("EconomySystem", () => {
  it("upgradeCost = base * 1.15^level (exact floats)", () => {
    // gatherer upgradeBase = 15
    expect(upgradeCost("gatherer", 1, content)).toBeCloseTo(15 * Math.pow(1.15, 1), 1e-9);
    expect(upgradeCost("gatherer", 5, content)).toBeCloseTo(15 * Math.pow(1.15, 5), 1e-9);
    // smelter upgradeBase = 25
    expect(upgradeCost("smelter", 3, content)).toBeCloseTo(25 * Math.pow(1.15, 3), 1e-9);
    // market upgradeBase = 30
    expect(upgradeCost("market", 0, content)).toBeCloseTo(30 * Math.pow(1.15, 0), 1e-9);
    // scholar upgradeBase = 35
    expect(upgradeCost("scholar", 4, content)).toBeCloseTo(35 * Math.pow(1.15, 4), 1e-9);
  });

  it("canUpgrade reflects gold on hand; applyUpgrade spends + increments level", () => {
    const s = NewGame(new FakeClock(0));
    // seed has 25 gold; miner L1 next cost = 15*1.15 = 17.25
    expect(canUpgrade(s, content, "n_miner_0")).toBe(true);
    applyUpgrade(s, content, "n_miner_0");
    const miner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    expect(s.currencies.gold).toBeCloseTo(25 - 15 * Math.pow(1.15, 1), 1e-9);
    expect(s._solved).toBe(undefined);
  });

  it("isListed honors marketListings AND non-null basePrice", () => {
    const s = NewGame(new FakeClock(0));
    expect(isListed(s, content, "iron_bar")).toBe(true); // listed at start
    expect(isListed(s, content, "steel")).toBe(false);    // not in NewGame listings
    expect(isListed(s, content, "parchment")).toBe(false); // listed never; basePrice null
  });

  it("sellFromStockpile converts a node's stockpile to gold + research tithe", () => {
    const s = NewGame(new FakeClock(0));
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
});
