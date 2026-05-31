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
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { build } from "../Source/Engine/Snapshot.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("Snapshot", () => {
  it("builds a frozen read-model with raw currencies + rates from solved", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap.currencies.gold).toBeCloseTo(25, 1e-9);
    // seed steady state: goldRate 2.0, researchRate 0.10 (§7 baseline)
    expect(snap.rates.goldRate).toBeCloseTo(2.0, 1e-9);
    expect(snap.rates.researchRate).toBeCloseTo(0.10, 1e-9);
  });

  it("node rows carry upgradeCost, canAfford, capacity, effectiveRate", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const miner = snap.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(1);
    expect(miner.upgradeCost).toBeCloseTo(15 * Math.pow(1.15, 1), 1e-9);
    expect(miner.canAfford).toBe(true); // 25 gold >= 17.25
    expect(typeof miner.capacity === "number").toBe(true);
    expect(typeof miner.effectiveRate === "number").toBe(true);
  });

  it("research rows carry status + affordability + name", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100;
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const scholar = snap.research.find((r) => r.id === "res_scholar");
    expect(scholar.status).toBe("available");
    expect(scholar.affordable).toBe(true);
    expect(scholar.name).toBe(content.researchNodes.res_scholar ? RESEARCH_NODES.res_scholar.name || "Found the Scholars' Guild" : "");
  });

  it("hero rows carry power + powerBreakdown + levelCost", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const hero = snap.heroes.find((h) => h.id === "h_0");
    expect(hero.power).toBeCloseTo(5, 1e-9);
    expect(hero.powerBreakdown.gear).toBeCloseTo(0, 1e-9);
    expect(hero.powerBreakdown.level).toBeCloseTo(5, 1e-9);
    expect(hero.levelCost).toBe(5);
  });

  it("territory rows carry status + isNext; expedition is null when none active", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const gh = snap.territories.find((t) => t.id === "t_gatehouse");
    expect(gh.status).toBe("available");
    expect(gh.isNext).toBe(true);
    const sw = snap.territories.find((t) => t.id === "t_smithyward");
    expect(sw.status).toBe("locked");
    expect(snap.expedition).toBe(null);
    expect(snap.meta.won).toBe(false);
  });

  it("snapshot is deeply frozen (nested objects too)", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap.currencies)).toBe(true);
    expect(Object.isFrozen(snap.nodes)).toBe(true);
    expect(Object.isFrozen(snap.nodes[0])).toBe(true);
  });
});
