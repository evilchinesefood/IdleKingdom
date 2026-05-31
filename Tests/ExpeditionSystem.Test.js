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
import { heroPower, equip, levelUp } from "../Source/Engine/Systems/HeroSystem.js";
import { reclaim } from "../Source/Engine/Systems/ProgressionSystem.js";
import {
  nextTerritory, canStart, startExpedition, tryResolve, timeRemaining,
} from "../Source/Engine/Systems/ExpeditionSystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("ExpeditionSystem", () => {
  it("nextTerritory is the lowest un-reclaimed; null when all reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    expect(nextTerritory(s, content)).toBe("t_gatehouse");
    s.territories.reclaimed = Object.keys(TERRITORIES).slice();
    expect(nextTerritory(s, content)).toBe(null);
  });

  it("gating reject-then-accept: power 35 vs req 38 rejected; level to L2 -> accepted", () => {
    const s = NewGame(new FakeClock(0));
    // craft path is research; here we just equip T1 gear directly (all T1 unlocked at start)
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    // reclaim t_gatehouse so the next target is t_smithyward (req 38)
    reclaim(s, content, "t_gatehouse");
    expect(nextTerritory(s, content)).toBe("t_smithyward");
    expect(heroPower(s, content, "h_0")).toBeCloseTo(35, 1e-9);
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(false); // 35 < 38
    s.currencies.renown = 5;
    levelUp(s, content, "h_0"); // L2 -> power 40
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(true);
  });

  it("cannot start a non-next territory or with active expedition running", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(false); // not the next one
    startExpedition(s, content, "t_gatehouse", "h_0", 1000);
    expect(s.expeditions.active.territoryId).toBe("t_gatehouse");
    expect(canStart(s, content, "t_gatehouse", "h_0")).toBe(false); // already active
  });

  it("startExpedition stamps startedAt; timeRemaining counts down; tryResolve grants + reclaims", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    startExpedition(s, content, "t_gatehouse", "h_0", 1000);
    expect(timeRemaining(s, 1000)).toBe(120000); // durationMs
    expect(timeRemaining(s, 61000)).toBe(60000);
    expect(tryResolve(s, content, 100000)).toBe(null); // not yet
    const gold0 = s.currencies.gold, research0 = s.currencies.research, renown0 = s.currencies.renown;
    const resolved = tryResolve(s, content, 1000 + 120000);
    expect(resolved.territoryId).toBe("t_gatehouse");
    expect(s.currencies.gold).toBeCloseTo(gold0 + 50, 1e-9);
    expect(s.currencies.research).toBeCloseTo(research0 + 20, 1e-9);
    expect(s.currencies.renown).toBeCloseTo(renown0 + 10, 1e-9);
    expect(s.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(s.expeditions.active).toBe(null);
    expect(s.expeditions.completed.length).toBe(1);
  });

  it("BLOCKER #2/#3 power-curve regression: each of the six §6.3 rows clears its gate with prior-reclaim gear", () => {
    // Build a fresh state, unlock ALL gear tiers a player would legitimately possess
    // by the time of each attempt, then assert the §6.3 best-loadout total >= required.
    // Each row uses ONLY gear unlocked by reclaims strictly BEFORE that attempt.
    const rows = [
      // attempt territory, [swordTier, armorTier, shieldTier], heroLevel, expectedTotal
      { id: "t_gatehouse",  gear: [1, 1, 1], level: 1, total: 35,  req: 30 },
      { id: "t_smithyward", gear: [1, 1, 1], level: 2, total: 40,  req: 38 },
      { id: "t_oldmarket",  gear: [2, 1, 2], level: 3, total: 63,  req: 50 },
      { id: "t_ironreach",  gear: [2, 2, 2], level: 4, total: 80,  req: 65 },
      { id: "t_highwall",   gear: [3, 2, 3], level: 5, total: 103, req: 85 },
      { id: "t_blackkeep",  gear: [3, 3, 3], level: 6, total: 120, req: 110 },
    ];

    // Track which gear tiers are unlocked as we reclaim in order. Start = T1 of all (NewGame seed).
    const unlocked = new Set(["sword:1", "armor:1", "shield:1"]);
    const s = NewGame(new FakeClock(0));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [sw, ar, sh] = row.gear;
      // Assert the gear this row uses is legitimately available BEFORE attempting row.id:
      expect(unlocked.has("sword:" + sw)).toBe(true);
      expect(unlocked.has("armor:" + ar)).toBe(true);
      expect(unlocked.has("shield:" + sh)).toBe(true);

      // Equip + set level to compute power, assert vs required.
      equip(s, content, "h_0", "weapon", "sword", sw);
      equip(s, content, "h_0", "armor", "armor", ar);
      equip(s, content, "h_0", "accessory", "shield", sh);
      s.heroes.find((h) => h.id === "h_0").level = row.level;

      const power = heroPower(s, content, "h_0");
      expect(power).toBeCloseTo(row.total, 1e-9);
      expect(power >= row.req).toBeTruthy();
      expect(power >= content.territories[row.id].requiredPower).toBeTruthy();

      // Now reclaim row.id and fold ITS gear-tier unlocks into `unlocked` for the next attempt.
      reclaim(s, content, row.id);
      for (const g of s.unlocks.gearTiersUnlocked) unlocked.add(g.itemId + ":" + g.tier);
    }
    expect(s.meta.won).toBe(true);
  });

  it("determinism: identical start + clock yields identical resolution twice", () => {
    function runOnce() {
      const s = NewGame(new FakeClock(0));
      equip(s, content, "h_0", "weapon", "sword", 1);
      equip(s, content, "h_0", "armor", "armor", 1);
      equip(s, content, "h_0", "accessory", "shield", 1);
      startExpedition(s, content, "t_gatehouse", "h_0", 0);
      return tryResolve(s, content, 120000);
    }
    expect(runOnce()).toEqual(runOnce());
  });
});
