import { describe, it, expect } from "./Runner.js";
import { seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph, content } from "./Fixtures/KnownGraph.js";
import { solve, capacity } from "../Source/Engine/Simulation/RateSolver.js";

describe("KnownGraph fixtures load", () => {
  it("exposes the five named fixtures with state+content", () => {
    for (const make of [seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph]) {
      const f = make();
      expect(!!f.state).toBeTruthy();
      expect(!!f.content).toBeTruthy();
      expect(Array.isArray(f.state.graph.nodes)).toBeTruthy();
    }
  });
});

describe("RateSolver.capacity", () => {
  it("gatherer L1 iron_ore -> 1.0", () => {
    const { state, content } = seedGraph();
    const miner = state.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(capacity(miner, state, content)).toBeCloseTo(1.0, 1e-9);
  });
  it("smelter L1 r_iron_bar -> baseOut 0.5 (no level bonus)", () => {
    const { state, content } = seedGraph();
    const sm = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    expect(capacity(sm, state, content)).toBeCloseTo(0.5, 1e-9);
  });
  it("gatherer L3 iron_ore -> 1.0 + 0.5*2 = 2.0", () => {
    const { state, content } = seedGraph();
    const m = { ...state.graph.nodes[0], level: 3 };
    expect(capacity(m, state, content)).toBeCloseTo(2.0, 1e-9);
  });
  it("smelter capacity scales with productionBonuses.smelter", () => {
    const { state, content } = seedGraph();
    state.unlocks.productionBonuses.smelter = 1.25;
    const sm = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    expect(capacity(sm, state, content)).toBeCloseTo(0.625, 1e-9);
  });
});

describe("RateSolver Pass 1 — crafter throughput", () => {
  it("seed graph: smelter outputs 0.5 iron_bar/s (cap-bound)", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    expect(solved.availableOut["n_smelter_0"]["iron_bar"]).toBeCloseTo(0.5, 1e-9);
  });
  it("0.6 ore/s feed -> smelter outputs 0.3 bar/s (supply-bound)", () => {
    const { state, content, expected } = bottleneckGraph();
    const solved = solve(state, content);
    expect(solved.availableOut["g"]["iron_ore"]).toBeCloseTo(expected.oreOut, 1e-9); // 0.6
    expect(solved.availableOut["s"]["iron_bar"]).toBeCloseTo(expected.smelterOut, 1e-9); // 0.3
  });
  it("r_steel fed 0.5 iron_bar/s + 0.10 coal/s -> 0.10 steel/s (coal binds)", () => {
    // Direct pinned-supply graph: two gatherers emitting the intermediates at exact rates.
    const pinnedNodes = [
      { id: "fib", kind: "gatherer", level: 1, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
      { id: "fco", kind: "gatherer", level: 1, resourceId: "coal", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } },
      { id: "st", kind: "smelter", level: 1, resourceId: null, recipeId: "r_steel", stockpile: {}, pos: { x: 1, y: 0 } },
    ];
    const pinnedLinks = [
      { id: "p0", from: "fib", to: "st", resourceId: "iron_bar" },
      { id: "p1", from: "fco", to: "st", resourceId: "coal" },
    ];
    // gatherer cap = (1 + 0.5*(L-1)) * bonus. With bonus=0.10:
    //   fib L9 -> (1+0.5*8)*0.10 = 5*0.10 = 0.5 iron_bar/s
    //   fco L1 -> (1+0.5*0)*0.10 = 0.10 coal/s
    pinnedNodes[0].level = 9;
    pinnedNodes[1].level = 1;
    const pinnedState = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes: pinnedNodes, links: pinnedLinks, nextNodeSeq: 3, nextLinkSeq: 2 },
      unlocks: {
        researchOwned: [], recipesUnlocked: ["r_steel"],
        machinesUnlocked: ["gatherer", "smelter", "market"],
        marketListings: [],
        titheRate: 0.05, offlineCapHours: 8,
        productionBonuses: { gatherer: 0.10, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
        gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
      },
    };
    const solved = solve(pinnedState, content());
    expect(solved.availableOut["fib"]["iron_bar"]).toBeCloseTo(0.5, 1e-9);
    expect(solved.availableOut["fco"]["coal"]).toBeCloseTo(0.10, 1e-9);
    // limit = min(cap 0.25, iron_bar 0.5/2 = 0.25, coal 0.10/1 = 0.10) = 0.10 -> coal binds.
    expect(solved.availableOut["st"]["steel"]).toBeCloseTo(0.10, 1e-9);
  });
});

describe("RateSolver — Market sink", () => {
  it("seed graph: goldRate 2.0, researchRate 0.10", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    expect(solved.goldRate).toBeCloseTo(2.0, 1e-9);
    expect(solved.researchRate).toBeCloseTo(0.1, 1e-9);
  });
  it("proportional overflow: 8/s into cap 5/s scales 5/8, goldRate 11.25", () => {
    const { state, content, expected } = marketOverflowGraph();
    const solved = solve(state, content);
    expect(solved.goldRate).toBeCloseTo(expected.goldRate, 1e-9); // 11.25
    expect(solved.researchRate).toBeCloseTo(expected.researchRate, 1e-9); // 0.5625
  });
  it("market does not sell an unlisted resource", () => {
    const { state, content } = marketOverflowGraph();
    // Remove iron_bar from listings: only iron_ore (4/s) sells, under cap 5 -> no scaling.
    state.unlocks.marketListings = ["iron_ore"];
    const solved = solve(state, content);
    // sold iron_ore 4.0 @0.5 = 2.0 gold/s (iron_bar ignored, total 4 < cap 5)
    expect(solved.goldRate).toBeCloseTo(2.0, 1e-9);
  });
  it("res_trade_routes tithe 0.07 applies", () => {
    const { state, content } = seedGraph();
    state.unlocks.titheRate = 0.07;
    const solved = solve(state, content);
    expect(solved.researchRate).toBeCloseTo(2.0 * 0.07, 1e-9); // 0.14
  });
});

describe("RateSolver — Scholar", () => {
  it("scholar converts parchment 1:1 up to capacity", () => {
    // forester timber -> workshop r_parchment -> scholar
    const nodes = [
      { id: "gt", kind: "gatherer", level: 1, resourceId: "timber", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 1.0 timber/s
      { id: "wp", kind: "workshop", level: 1, resourceId: null, recipeId: "r_parchment", stockpile: {}, pos: { x: 1, y: 0 } }, // baseOut 0.5, in timber:1 -> 0.5/s
      { id: "sc", kind: "scholar", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 2, y: 0 } }, // cap 0.5 research/s
    ];
    const links = [
      { id: "l0", from: "gt", to: "wp", resourceId: "timber" },
      { id: "l1", from: "wp", to: "sc", resourceId: "parchment" },
    ];
    const state = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links, nextNodeSeq: 3, nextLinkSeq: 2 },
      unlocks: {
        researchOwned: [], recipesUnlocked: ["r_parchment"],
        machinesUnlocked: ["gatherer", "smelter", "market", "workshop", "scholar"],
        marketListings: [], titheRate: 0.05, offlineCapHours: 8,
        productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
        gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
      },
    };
    const solved = solve(state, content());
    // parchment supply 0.5/s, scholar cap 0.5 -> research 0.5/s.
    expect(solved.researchRate).toBeCloseTo(0.5, 1e-9);
    expect(solved.perNodeDraw["sc"]["parchment"]).toBeCloseTo(0.5, 1e-9);
  });
  it("scholar clamps to capacity when parchment supply exceeds it", () => {
    // pin parchment supply at 1.0 via a gatherer assigned 'parchment'; scholar cap 0.5 -> research 0.5.
    const nodes = [
      { id: "gp", kind: "gatherer", level: 1, resourceId: "parchment", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 1.0/s
      { id: "sc", kind: "scholar", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 1, y: 0 } }, // cap 0.5
    ];
    const links = [{ id: "l0", from: "gp", to: "sc", resourceId: "parchment" }];
    const state = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 },
      unlocks: {
        researchOwned: [], recipesUnlocked: [],
        machinesUnlocked: ["gatherer", "scholar"], marketListings: [],
        titheRate: 0.05, offlineCapHours: 8,
        productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
        gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
      },
    };
    const solved = solve(state, content());
    expect(solved.researchRate).toBeCloseTo(0.5, 1e-9); // clamped to cap, not 1.0
  });
});
