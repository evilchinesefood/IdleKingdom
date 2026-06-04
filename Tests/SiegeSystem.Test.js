import { describe, it, expect } from "./Runner.js";
import { content } from "../Source/Engine/Content/Content.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  nextTerritory,
  tryAdvanceSiege,
} from "../Source/Engine/Systems/SiegeSystem.js";

describe("SiegeSystem", () => {
  it("nextTerritory walks the order; null when all reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    expect(nextTerritory(s, content)).toBe("t_gatehouse");
    s.territories.reclaimed = Object.keys(content.territories);
    expect(nextTerritory(s, content)).toBe(null);
  });

  it("insufficient progress reclaims nothing", () => {
    const s = NewGame(new FakeClock(0));
    s.siege.progress = 39; // gatehouse costs 40
    expect(tryAdvanceSiege(s, content)).toEqual([]);
    expect(s.territories.reclaimed.length).toBe(0);
    expect(s.siege.progress).toBe(39);
  });

  it("crossing siegeCost reclaims, applies unlocks, rolls surplus forward", () => {
    const s = NewGame(new FakeClock(0));
    s.siege.progress = 50; // gatehouse 40 -> 10 rolls toward smithyward
    const fell = tryAdvanceSiege(s, content);
    expect(fell.length).toBe(1);
    expect(fell[0].territoryId).toBe("t_gatehouse");
    expect(s.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(s.siege.progress).toBeCloseTo(10, 1e-9);
    // gatehouse unlock applied (productionBonus gatherer 1.1)
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.1, 1e-9);
    // rewards granted (gold 50, research 20 on top of start 25/0)
    expect(s.currencies.gold).toBeCloseTo(75, 1e-9);
    expect(s.currencies.research).toBeCloseTo(20, 1e-9);
  });

  it("a huge progress chain-reclaims multiple territories in order", () => {
    const s = NewGame(new FakeClock(0));
    s.siege.progress = 40 + 150 + 100; // gatehouse + smithyward + part of oldmarket
    const fell = tryAdvanceSiege(s, content);
    expect(fell.map((f) => f.territoryId)).toEqual([
      "t_gatehouse",
      "t_smithyward",
    ]);
    expect(s.siege.progress).toBeCloseTo(100, 1e-9);
  });

  it("reclaiming the final territory sets meta.won", () => {
    const s = NewGame(new FakeClock(0));
    const all = Object.values(content.territories);
    s.territories.reclaimed = all.filter((t) => !t.isVictory).map((t) => t.id);
    s.siege.progress = content.territories.t_blackkeep.siegeCost;
    tryAdvanceSiege(s, content);
    expect(s.meta.won).toBe(true);
  });

  it("every territory has a finite positive siegeCost", () => {
    for (const t of Object.values(content.territories)) {
      expect(Number.isFinite(t.siegeCost) && t.siegeCost > 0).toBe(true);
    }
  });
});
