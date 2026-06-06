import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { seededState } from "./Fixtures/Seeded.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { build } from "../Source/Engine/Snapshot.js";
import { NewGame } from "../Source/Engine/GameState.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
};

describe("Snapshot", () => {
  it("builds a frozen read-model with raw currencies + rates from solved", () => {
    const s = seededState(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap.currencies.gold).toBeCloseTo(25, 1e-9);
    // seed steady state: goldRate 2.0, researchRate 0.10 (§7 baseline)
    expect(snap.rates.goldRate).toBeCloseTo(2.0, 1e-9);
    expect(snap.rates.researchRate).toBeCloseTo(0.1, 1e-9);
  });

  it("node rows carry upgradeCost, canAfford, capacity, effectiveRate", () => {
    const s = seededState(new FakeClock(0));
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
    const s = seededState(new FakeClock(0));
    s.currencies.research = 100;
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const scholar = snap.research.find((r) => r.id === "res_scholar");
    expect(scholar.status).toBe("available");
    expect(scholar.affordable).toBe(true);
    expect(scholar.name).toBe(
      content.researchNodes.res_scholar
        ? RESEARCH_NODES.res_scholar.name || "Found the Scholars' Guild"
        : "",
    );
  });

  it("research rows expose the territory gate (res_scholar has none)", () => {
    const s = seededState(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const scholar = snap.research.find((r) => r.id === "res_scholar");
    expect(scholar.requiresTerritory).toBe(null);
  });

  // DELETED: "hero rows carry power + powerBreakdown + levelCost"
  // Heroes/HeroSystem removed in war rework (Task 7). Covered by siege read-model test.

  it("territory rows carry siege status; meta.won is false on a fresh game", () => {
    const s = seededState(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const gh = snap.territories.find((t) => t.id === "t_gatehouse");
    expect(gh.status).toBe("sieging");
    expect(gh.siegeCost).toBe(40);
    const sw = snap.territories.find((t) => t.id === "t_smithyward");
    expect(sw.status).toBe("locked");
    expect(snap.meta.won).toBe(false);
  });

  it("rate currency strings carry the /s unit (M1)", () => {
    const s = seededState(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(snap.currencyStrings.goldRate.endsWith("/s")).toBe(true);
    expect(snap.currencyStrings.researchRate.endsWith("/s")).toBe(true);
    expect(snap.currencyStrings.goldRate).toBe("2/s");
  });

  it("surfaces meta.seenVictory (B2); false on a fresh game", () => {
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    expect(snap.meta.seenVictory).toBe(false);
    const s2 = seededState(new FakeClock(0));
    s2.meta.seenVictory = true;
    const snap2 = build(s2, solve(s2, content), content);
    expect(snap2.meta.seenVictory).toBe(true);
  });

  it("snapshot top-level and direct array/object properties are frozen", () => {
    // deepFreeze replaced with shallow freeze of snap + top-level arrays/objects
    // (task 15); reducer purity guards engine mutations, UI is read-disciplined.
    const s = seededState(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.currencies)).toBe(true);
    expect(Object.isFrozen(snap.nodes)).toBe(true);
    // snap.nodes[0] is NOT required to be frozen (nested freeze removed)
  });
});

// P3: derived throughput / atCapacity / starved read-model fields (spec §8).
function graphState(clock, nodes, links = []) {
  const s = NewGame(clock);
  s.graph = {
    nodes,
    links,
    nextNodeSeq: nodes.length,
    nextLinkSeq: links.length,
  };
  delete s._solved;
  return s;
}

describe("Snapshot.throughput/atCapacity/starved (§8)", () => {
  it("full-fed gatherer -> atCapacity true, starved false (gatherers take no input)", () => {
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const miner = snap.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.throughput).toBeCloseTo(1.0, 1e-9);
    expect(miner.capacity).toBeCloseTo(1.0, 1e-9);
    expect(miner.atCapacity).toBe(true);
    expect(miner.starved).toBe(false);
  });

  it("under-fed (disconnected) smelter -> starved true, atCapacity false", () => {
    const s = graphState(new FakeClock(0), [
      {
        id: "sm",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
    ]);
    const snap = build(s, solve(s, content), content);
    const sm = snap.nodes.find((n) => n.id === "sm");
    expect(sm.capacity).toBeCloseTo(0.5, 1e-9);
    expect(sm.throughput).toBeCloseTo(0, 1e-9);
    expect(sm.starved).toBe(true);
    expect(sm.atCapacity).toBe(false);
    expect(sm.capacityPct).toBeCloseTo(0, 1e-9);
  });

  it("fully-fed scholar -> atCapacity true, starved false (throughput = input draw)", () => {
    const s = graphState(
      new FakeClock(0),
      [
        {
          id: "for",
          kind: "gatherer",
          level: 1,
          resourceId: "timber",
          recipeId: null,
          stockpile: {},
          pos: { x: 0, y: 0 },
        },
        {
          id: "ws",
          kind: "workshop",
          level: 1,
          resourceId: null,
          recipeId: "r_parchment",
          stockpile: {},
          pos: { x: 1, y: 0 },
        },
        {
          id: "sch",
          kind: "scholar",
          level: 1,
          resourceId: null,
          recipeId: null,
          stockpile: {},
          pos: { x: 2, y: 0 },
        },
      ],
      [
        { id: "la", from: "for", to: "ws", resourceId: "timber" },
        { id: "lb", from: "ws", to: "sch", resourceId: "parchment" },
      ],
    );
    const snap = build(s, solve(s, content), content);
    const sch = snap.nodes.find((n) => n.id === "sch");
    expect(sch.capacity).toBeCloseTo(0.5, 1e-9);
    expect(sch.throughput).toBeCloseTo(0.5, 1e-9);
    expect(sch.atCapacity).toBe(true);
    expect(sch.starved).toBe(false);
    expect(sch.capacityPct).toBeCloseTo(1.0, 1e-9);
  });

  it("market scaled below cap -> starved true (consumer throughput < cap)", () => {
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const market = snap.nodes.find((n) => n.id === "n_market_0");
    expect(market.capacity).toBeCloseTo(5.0, 1e-9);
    expect(market.throughput).toBeCloseTo(0.5, 1e-9);
    expect(market.starved).toBe(true);
    expect(market.atCapacity).toBe(false);
    // a selling market reports its gold output for the node display (was 0.00/s)
    expect(market.goldOut > 0).toBe(true);
    expect(market.effectiveRate).toBeCloseTo(0, 1e-9); // produces no graph resource
  });

  it("fully-fed barracks -> atCapacity true, starved false, capacityPct ~1", () => {
    // Build: iron-ore gatherer -> smelter (r_iron_bar) provides iron_bar, two
    // timber gatherers -> workshop (r_parchment) provides parchment for a plank-
    // chain.  For simplicity use a minimal chain that fully feeds r_militia:
    // sword/armor/shield gatherers (fake gatherers producing the required inputs)
    // wired directly into the barracks.  We cheat by using resourceId gatherers
    // for each troop-input resource so availableOut fills the barracks inputs at cap.
    // r_militia: inputs {sword:1, armor:1, shield:1}, baseOut 0.05, barracks rateGain 0.02
    // barracks L1 cap = baseOut + rateGain*(1-1) = 0.05
    // gatherer L1 cap = 1.0/s each — easily saturates the barracks want of 0.05/s
    const s = graphState(
      new FakeClock(0),
      [
        {
          id: "g_sword",
          kind: "gatherer",
          level: 1,
          resourceId: "sword",
          recipeId: null,
          stockpile: {},
          pos: { x: 0, y: 0 },
        },
        {
          id: "g_armor",
          kind: "gatherer",
          level: 1,
          resourceId: "armor",
          recipeId: null,
          stockpile: {},
          pos: { x: 1, y: 0 },
        },
        {
          id: "g_shield",
          kind: "gatherer",
          level: 1,
          resourceId: "shield",
          recipeId: null,
          stockpile: {},
          pos: { x: 2, y: 0 },
        },
        {
          id: "bk",
          kind: "barracks",
          level: 1,
          resourceId: null,
          recipeId: "r_militia",
          stockpile: {},
          pos: { x: 3, y: 0 },
        },
      ],
      [
        { id: "lsw", from: "g_sword", to: "bk", resourceId: "sword" },
        { id: "lar", from: "g_armor", to: "bk", resourceId: "armor" },
        { id: "lsh", from: "g_shield", to: "bk", resourceId: "shield" },
      ],
    );
    const snap = build(s, solve(s, content), content);
    const bk = snap.nodes.find((n) => n.id === "bk");
    expect(bk.atCapacity).toBe(true);
    expect(bk.starved).toBe(false);
    expect(bk.capacityPct).toBeCloseTo(1.0, 1e-9);
  });

  it("under-fed barracks -> starved true, atCapacity false", () => {
    // Barracks with no inputs connected: troopRate = 0, cap = 0.05 -> starved
    const s = graphState(new FakeClock(0), [
      {
        id: "bk2",
        kind: "barracks",
        level: 1,
        resourceId: null,
        recipeId: "r_militia",
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
    ]);
    const snap = build(s, solve(s, content), content);
    const bk2 = snap.nodes.find((n) => n.id === "bk2");
    expect(bk2.starved).toBe(true);
    expect(bk2.atCapacity).toBe(false);
    expect(bk2.capacityPct).toBeCloseTo(0, 1e-9);
  });

  it("fully-fed barracks working = true", () => {
    const s = graphState(
      new FakeClock(0),
      [
        {
          id: "g_sword",
          kind: "gatherer",
          level: 1,
          resourceId: "sword",
          recipeId: null,
          stockpile: {},
          pos: { x: 0, y: 0 },
        },
        {
          id: "g_armor",
          kind: "gatherer",
          level: 1,
          resourceId: "armor",
          recipeId: null,
          stockpile: {},
          pos: { x: 1, y: 0 },
        },
        {
          id: "g_shield",
          kind: "gatherer",
          level: 1,
          resourceId: "shield",
          recipeId: null,
          stockpile: {},
          pos: { x: 2, y: 0 },
        },
        {
          id: "bk3",
          kind: "barracks",
          level: 1,
          resourceId: null,
          recipeId: "r_militia",
          stockpile: {},
          pos: { x: 3, y: 0 },
        },
      ],
      [
        { id: "lsw3", from: "g_sword", to: "bk3", resourceId: "sword" },
        { id: "lar3", from: "g_armor", to: "bk3", resourceId: "armor" },
        { id: "lsh3", from: "g_shield", to: "bk3", resourceId: "shield" },
      ],
    );
    const snap = build(s, solve(s, content), content);
    const bk3 = snap.nodes.find((n) => n.id === "bk3");
    expect(bk3.working).toBe(true);
  });

  it("unconfigured gatherer (resourceId null) -> neither atCapacity nor starved", () => {
    const s = graphState(new FakeClock(0), [
      {
        id: "g0",
        kind: "gatherer",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
    ]);
    const snap = build(s, solve(s, content), content);
    const g0 = snap.nodes.find((n) => n.id === "g0");
    expect(g0.throughput).toBeCloseTo(0, 1e-9);
    expect(g0.atCapacity).toBe(false);
    expect(g0.starved).toBe(false);
  });

  it("keeps effectiveRate = producer output for back-compat (consumers stay 0)", () => {
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const smelter = snap.nodes.find((n) => n.id === "n_smelter_0");
    const market = snap.nodes.find((n) => n.id === "n_market_0");
    expect(smelter.effectiveRate).toBeCloseTo(0.5, 1e-9);
    expect(market.effectiveRate).toBeCloseTo(0, 1e-9);
    expect(market.throughput).toBeCloseTo(0.5, 1e-9);
  });
});

describe("Snapshot — Machine Tuning rows", () => {
  it("covers unlocked kinds with rank/cost/affordable; locked kinds omitted", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.research = 100;
    delete s._solved;
    const snap = build(s, solve(s, content), content);
    const g = snap.tuning.find((t) => t.kind === "gatherer");
    expect(g.rank).toBe(0);
    expect(g.nextCost).toBe(25);
    expect(g.affordable).toBe(true);
    // scholar machine is locked at start -> no tuning row
    expect(snap.tuning.some((t) => t.kind === "scholar")).toBe(false);
  });
});

describe("Snapshot — siege read-model", () => {
  it("emits siege target/progress/cost/rate/eta and no heroes/expedition/renown", () => {
    const s = NewGame(new FakeClock(0));
    s.siege.progress = 10;
    delete s._solved;
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(snap.heroes).toBe(undefined);
    expect(snap.expedition).toBe(undefined);
    expect(snap.currencies.renown).toBe(undefined);
    expect(snap.siege.targetId).toBe("t_gatehouse");
    expect(snap.siege.progress).toBeCloseTo(10, 1e-9);
    expect(snap.siege.cost).toBe(40);
    expect(snap.siege.rate).toBeCloseTo(0, 1e-9); // no barracks yet
    expect(snap.siege.etaSeconds).toBe(null); // rate 0 -> no eta
    const gh = snap.territories.find((t) => t.id === "t_gatehouse");
    expect(gh.status).toBe("sieging");
    expect(gh.siegeCost).toBe(40);
  });
});
