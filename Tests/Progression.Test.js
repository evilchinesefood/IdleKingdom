import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { reclaim } from "../Source/Engine/Systems/ProgressionSystem.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
};

const ORDER = [
  "t_gatehouse",
  "t_smithyward",
  "t_oldmarket",
  "t_ironreach",
  "t_highwall",
  "t_blackkeep",
];

describe("ProgressionSystem", () => {
  it("reclaim moves territory to reclaimed, advances available, applies unlocks", () => {
    const s = NewGame(new FakeClock(0));
    reclaim(s, content, "t_gatehouse");
    expect(s.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(s.territories.available.includes("t_gatehouse")).toBe(false);
    expect(s.territories.available.includes("t_smithyward")).toBe(true);
    // t_gatehouse unlock: gatherer bonus 1.10
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.1, 1e-9);
  });

  it("t_smithyward applies its smelter production bonus", () => {
    const s = NewGame(new FakeClock(0));
    reclaim(s, content, "t_smithyward");
    // t_smithyward unlock: smelter bonus 1.10
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.1, 1e-9);
  });

  it("meta.won is set only after the victory territory is reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    for (let i = 0; i < 5; i++) reclaim(s, content, ORDER[i]);
    expect(s.meta.won).toBe(false); // 5/6 reclaimed, no victory territory yet
    reclaim(s, content, "t_blackkeep"); // the isVictory territory
    expect(s.meta.won).toBe(true);
  });

  it("win is idempotent: reclaiming an already-reclaimed territory does not double-apply", () => {
    const s = NewGame(new FakeClock(0));
    for (const t of ORDER) reclaim(s, content, t);
    const reclaimedCount = s.territories.reclaimed.length;
    const gathererBonus = s.unlocks.productionBonuses.gatherer;
    reclaim(s, content, "t_gatehouse"); // already reclaimed -> no-op
    expect(s.territories.reclaimed.length).toBe(reclaimedCount);
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(
      gathererBonus,
      1e-9,
    );
    expect(s.meta.won).toBe(true);
  });
});
