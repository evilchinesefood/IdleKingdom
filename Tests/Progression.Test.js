import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  reclaim,
  checkWin,
} from "../Source/Engine/Systems/ProgressionSystem.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
  equipment: EQUIPMENT,
  heroes: HEROES,
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

  it("t_gatehouse grants hero_warden only if not already present (seed already has it)", () => {
    const s = NewGame(new FakeClock(0));
    const count0 = s.heroes.length; // 1 (seed warden)
    reclaim(s, content, "t_gatehouse");
    expect(s.heroes.length).toBe(count0); // not duplicated
  });

  it("t_smithyward unlocks T2 sword/shield gear tier", () => {
    const s = NewGame(new FakeClock(0));
    reclaim(s, content, "t_smithyward");
    const swordT2 = s.unlocks.gearTiersUnlocked.some(
      (g) => g.itemId === "sword" && g.tier === 2,
    );
    const shieldT2 = s.unlocks.gearTiersUnlocked.some(
      (g) => g.itemId === "shield" && g.tier === 2,
    );
    expect(swordT2).toBe(true);
    expect(shieldT2).toBe(true);
  });

  it("checkWin false at 5/6; true only after the 6th reclaim; meta.won set", () => {
    const s = NewGame(new FakeClock(0));
    for (let i = 0; i < 5; i++) reclaim(s, content, ORDER[i]);
    expect(checkWin(s, content)).toBe(false);
    expect(s.meta.won).toBe(false);
    reclaim(s, content, "t_blackkeep");
    expect(checkWin(s, content)).toBe(true);
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
    expect(checkWin(s, content)).toBe(true);
  });
});
