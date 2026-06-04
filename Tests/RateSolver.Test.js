import { describe, it, expect } from "./Runner.js";
import {
  seedGraph,
  bottleneckGraph,
  steelGraph,
  surplusGraph,
  marketOverflowGraph,
  content,
  cycleGraph,
} from "./Fixtures/KnownGraph.js";
import { solve, capacity } from "../Source/Engine/Simulation/RateSolver.js";
import { isValidLink } from "../Source/Engine/Simulation/Topology.js";

describe("KnownGraph fixtures load", () => {
  it("exposes the five named fixtures with state+content", () => {
    for (const make of [
      seedGraph,
      bottleneckGraph,
      steelGraph,
      surplusGraph,
      marketOverflowGraph,
    ]) {
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
    expect(solved.availableOut["n_smelter_0"]["iron_bar"]).toBeCloseTo(
      0.5,
      1e-9,
    );
  });
  it("0.6 ore/s feed -> smelter outputs 0.3 bar/s (supply-bound)", () => {
    const { state, content, expected } = bottleneckGraph();
    const solved = solve(state, content);
    expect(solved.availableOut["g"]["iron_ore"]).toBeCloseTo(
      expected.oreOut,
      1e-9,
    ); // 0.6
    expect(solved.availableOut["s"]["iron_bar"]).toBeCloseTo(
      expected.smelterOut,
      1e-9,
    ); // 0.3
  });
  it("under-fed consumer reports fedFrac < 1 (drives the starved-link cue)", () => {
    const { state, content } = bottleneckGraph();
    const solved = solve(state, content);
    // gatherer makes 0.6 ore/s; smelter L1 wants cap*inputs = 0.5*2 = 1.0/s, so
    // the flow is producer-bound at 0.6 and the consumer is only 60% fed.
    expect(solved.linkFlow["l0"]).toBeCloseTo(0.6, 1e-9);
    expect(solved.fedFrac["s|iron_ore"]).toBeCloseTo(0.6, 1e-9);
  });
  it("a fully-fed consumer reports fedFrac === 1", () => {
    const { state, content } = bottleneckGraph();
    state.unlocks.productionBonuses.gatherer = 2.0; // 2.0 ore/s out-produces the 1.0/s want
    delete state._solved;
    const solved = solve(state, content);
    expect(solved.fedFrac["s|iron_ore"]).toBeCloseTo(1, 1e-9);
  });
  it("r_steel fed 0.5 iron_bar/s + 0.10 coal/s -> 0.10 steel/s (coal binds)", () => {
    // Direct pinned-supply graph: two gatherers emitting the intermediates at exact rates.
    const pinnedNodes = [
      {
        id: "fib",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_bar",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "fco",
        kind: "gatherer",
        level: 1,
        resourceId: "coal",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 1 },
      },
      {
        id: "st",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_steel",
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
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
      graph: {
        nodes: pinnedNodes,
        links: pinnedLinks,
        nextNodeSeq: 3,
        nextLinkSeq: 2,
      },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: ["r_steel"],
        machinesUnlocked: ["gatherer", "smelter", "market"],
        marketListings: [],
        titheRate: 0.05,
        offlineCapHours: 8,
        productionBonuses: {
          gatherer: 0.1,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: false,
        heroSlots: 1,
      },
    };
    const solved = solve(pinnedState, content());
    expect(solved.availableOut["fib"]["iron_bar"]).toBeCloseTo(0.5, 1e-9);
    expect(solved.availableOut["fco"]["coal"]).toBeCloseTo(0.1, 1e-9);
    // limit = min(cap 0.25, iron_bar 0.5/2 = 0.25, coal 0.10/1 = 0.10) = 0.10 -> coal binds.
    expect(solved.availableOut["st"]["steel"]).toBeCloseTo(0.1, 1e-9);
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
  it("market does not sell an UNLISTED resource (selling is research-gated)", () => {
    const { state, content } = marketOverflowGraph();
    // Only iron_ore listed: iron_ore (4/s @0.5) sells = 2.0; iron_bar is ignored.
    state.unlocks.marketListings = ["iron_ore"];
    const solved = solve(state, content);
    expect(solved.goldRate).toBeCloseTo(2.0, 1e-9);
  });
  it("res_trade_routes tithe 0.07 applies", () => {
    const { state, content } = seedGraph();
    state.unlocks.titheRate = 0.07;
    const solved = solve(state, content);
    expect(solved.researchRate).toBeCloseTo(2.0 * 0.07, 1e-9); // 0.14
  });
  it("re-added market link is rejected by isValidLink, and the solver conserves output anyway", () => {
    const { state, content } = seedGraph();
    // The exact seed market triple (n_smelter_0 -> n_market_0, iron_bar) must NOT validate again.
    expect(
      isValidLink(state, content, "n_smelter_0", "n_market_0", "iron_bar"),
    ).toBe(false);
    expect(solve(state, content).goldRate).toBeCloseTo(2.0, 1e-9);
    // Defense-in-depth: even if a duplicate link is forced into the graph, the solver rations the
    // smelter's single 0.5 bar/s across BOTH outbound links (no duplication) so goldRate stays 2.0.
    state.graph.links.push({
      id: "l_dup",
      from: "n_smelter_0",
      to: "n_market_0",
      resourceId: "iron_bar",
    });
    expect(solve(state, content).goldRate).toBeCloseTo(2.0, 1e-9);
  });
});

describe("RateSolver — Scholar", () => {
  it("scholar converts parchment 1:1 up to capacity", () => {
    // forester timber -> workshop r_parchment -> scholar
    const nodes = [
      {
        id: "gt",
        kind: "gatherer",
        level: 1,
        resourceId: "timber",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // 1.0 timber/s
      {
        id: "wp",
        kind: "workshop",
        level: 1,
        resourceId: null,
        recipeId: "r_parchment",
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // baseOut 0.5, in timber:1 -> 0.5/s
      {
        id: "sc",
        kind: "scholar",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 2, y: 0 },
      }, // cap 0.5 research/s
    ];
    const links = [
      { id: "l0", from: "gt", to: "wp", resourceId: "timber" },
      { id: "l1", from: "wp", to: "sc", resourceId: "parchment" },
    ];
    const state = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links, nextNodeSeq: 3, nextLinkSeq: 2 },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: ["r_parchment"],
        machinesUnlocked: [
          "gatherer",
          "smelter",
          "market",
          "workshop",
          "scholar",
        ],
        marketListings: [],
        titheRate: 0.05,
        offlineCapHours: 8,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: false,
        heroSlots: 1,
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
      {
        id: "gp",
        kind: "gatherer",
        level: 1,
        resourceId: "parchment",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // 1.0/s
      {
        id: "sc",
        kind: "scholar",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // cap 0.5
    ];
    const links = [{ id: "l0", from: "gp", to: "sc", resourceId: "parchment" }];
    const state = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: [],
        machinesUnlocked: ["gatherer", "scholar"],
        marketListings: [],
        titheRate: 0.05,
        offlineCapHours: 8,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: false,
        heroSlots: 1,
      },
    };
    const solved = solve(state, content());
    expect(solved.researchRate).toBeCloseTo(0.5, 1e-9); // clamped to cap, not 1.0
  });
});

describe("RateSolver — Pass 2 surplus & backpressure", () => {
  it("a gatherer with no consumer accrues full output to its own surplus", () => {
    const { state, content, expected } = surplusGraph();
    const solved = solve(state, content);
    expect(solved.surplusRate["m"]["iron_ore"]).toBeCloseTo(
      expected.surplusOre,
      1e-9,
    ); // 1.0
  });
  it("seed graph: miner has zero surplus (smelter consumes all 1.0 ore as 0.5 bar needs 1.0 ore)", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    // smelter draws iron_ore = out*2 = 0.5*2 = 1.0 ; miner produces exactly 1.0 -> no surplus.
    const minerSurplus =
      (solved.surplusRate["n_miner_0"] &&
        solved.surplusRate["n_miner_0"]["iron_ore"]) ||
      0;
    expect(minerSurplus).toBeCloseTo(0.0, 1e-9);
  });
  it("seed graph: smelter accrues its iron_bar surplus only if market underdraws (here market sells all)", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    // market sells the full 0.5 bar/s (cap 5 >> 0.5) -> smelter surplus 0.
    const smSurplus =
      (solved.surplusRate["n_smelter_0"] &&
        solved.surplusRate["n_smelter_0"]["iron_bar"]) ||
      0;
    expect(smSurplus).toBeCloseTo(0.0, 1e-9);
  });
  it("gatherers push full output into a market whose sell-cap binds (mass conserved, market overflow scales the sale)", () => {
    const big = [
      {
        id: "ga",
        kind: "gatherer",
        level: 7,
        resourceId: "iron_bar",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // 4.0 bar/s
      {
        id: "gb",
        kind: "gatherer",
        level: 7,
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 1 },
      }, // 4.0 ore/s
      {
        id: "mk",
        kind: "market",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // cap 5
    ];
    const links = [
      { id: "l0", from: "ga", to: "mk", resourceId: "iron_bar" },
      { id: "l1", from: "gb", to: "mk", resourceId: "iron_ore" },
    ];
    const state = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes: big, links, nextNodeSeq: 3, nextLinkSeq: 2 },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: [],
        machinesUnlocked: ["gatherer", "market"],
        marketListings: ["iron_ore", "iron_bar"],
        titheRate: 0.05,
        offlineCapHours: 8,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: false,
        heroSlots: 1,
      },
    };
    const solved = solve(state, content());
    // Market want per inbound link = market cap (5.0); each gatherer (4.0) < want, so each pushes its
    // FULL output into its single outbound link — mass conserved, no gatherer surplus.
    expect(solved.linkFlow["l0"]).toBeCloseTo(4.0, 1e-9);
    expect(solved.linkFlow["l1"]).toBeCloseTo(4.0, 1e-9);
    const gaSurplus =
      (solved.surplusRate["ga"] && solved.surplusRate["ga"]["iron_bar"]) || 0;
    const gbSurplus =
      (solved.surplusRate["gb"] && solved.surplusRate["gb"]["iron_ore"]) || 0;
    expect(gaSurplus).toBeCloseTo(0.0, 1e-9);
    expect(gbSurplus).toBeCloseTo(0.0, 1e-9);
    // Market receives 8.0 but sells only cap 5.0 (scale 5/8=0.625): iron_bar 2.5@4.0 + iron_ore 2.5@0.5 = 11.25.
    expect(solved.goldRate).toBeCloseTo(11.25, 1e-9);
  });
});

describe("RateSolver — full-supply steel (cap-bound, no input binds)", () => {
  it("steelGraph: two pinned 1.0/s intermediate feeds -> steel at cap 0.25/s", () => {
    const { state, content, expected } = steelGraph();
    const solved = solve(state, content);
    // iron_bar 1.0/s (>=0.5 needed) & coal 1.0/s (>=0.25 needed) both exceed the per-input need,
    // so r_steel runs at its capacity 0.25/s (nothing binds below cap).
    expect(solved.availableOut["st"]["steel"]).toBeCloseTo(
      expected.steelOutWithFullSupply,
      1e-9,
    ); // 0.25
  });
});

describe("RateSolver — fan-out conservation", () => {
  function fanState(nodes, links, over = {}) {
    return {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: {
        nodes,
        links,
        nextNodeSeq: nodes.length,
        nextLinkSeq: links.length,
      },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: ["r_iron_bar", "r_steel", "r_fitting"],
        machinesUnlocked: ["gatherer", "smelter", "workshop", "market"],
        marketListings: ["iron_ore", "iron_bar"],
        titheRate: 0.05,
        offlineCapHours: 8,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: false,
        heroSlots: 1,
        ...over,
      },
    };
  }

  it("one gatherer (1.0 ore/s) -> two r_iron_bar smelters: each gets 0.5 ore -> 0.25 bar/s; total ore drawn = 1.0 (not 2.0)", () => {
    const nodes = [
      {
        id: "g",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // 1.0 ore/s
      {
        id: "s1",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // cap 0.5
      {
        id: "s2",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 1, y: 1 },
      }, // cap 0.5
    ];
    const links = [
      { id: "l0", from: "g", to: "s1", resourceId: "iron_ore" },
      { id: "l1", from: "g", to: "s2", resourceId: "iron_ore" },
    ];
    const solved = solve(fanState(nodes, links), content());
    // Each smelter wants 0.5*2 = 1.0 ore; totalWant 2.0 > out 1.0 -> each link gets 1.0*(1.0/2.0)=0.5.
    expect(solved.linkFlow["l0"]).toBeCloseTo(0.5, 1e-9);
    expect(solved.linkFlow["l1"]).toBeCloseTo(0.5, 1e-9);
    // CONSERVATION: total ore leaving the gatherer = 0.5 + 0.5 = 1.0 = its output (not doubled to 2.0).
    expect(solved.linkFlow["l0"] + solved.linkFlow["l1"]).toBeCloseTo(
      1.0,
      1e-9,
    );
    const gSurplus =
      (solved.surplusRate["g"] && solved.surplusRate["g"]["iron_ore"]) || 0;
    expect(gSurplus).toBeCloseTo(0.0, 1e-9);
    // Each smelter receives 0.5 ore -> out = min(0.5, 0.5/2=0.25) = 0.25 bar/s.
    expect(solved.availableOut["s1"]["iron_bar"]).toBeCloseTo(0.25, 1e-9);
    expect(solved.availableOut["s2"]["iron_bar"]).toBeCloseTo(0.25, 1e-9);
  });

  it("one iron_bar producer feeding r_steel AND r_fitting: Σ outbound linkFlow = producer output (conserved), surplus accounted", () => {
    const nodes = [
      {
        id: "p",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_bar",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // bonus 0.6 -> 0.6 bar/s
      {
        id: "st",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_steel",
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // cap 0.25, iron_bar:2
      {
        id: "ft",
        kind: "workshop",
        level: 1,
        resourceId: null,
        recipeId: "r_fitting",
        stockpile: {},
        pos: { x: 1, y: 1 },
      }, // cap 0.25, iron_bar:1
    ];
    const links = [
      { id: "l0", from: "p", to: "st", resourceId: "iron_bar" },
      { id: "l1", from: "p", to: "ft", resourceId: "iron_bar" },
    ];
    const over = {
      productionBonuses: {
        gatherer: 0.6,
        smelter: 1.0,
        workshop: 1.0,
        market: 1.0,
        scholar: 1.0,
      },
    };
    const solved = solve(fanState(nodes, links, over), content());
    const out = solved.availableOut["p"]["iron_bar"];
    expect(out).toBeCloseTo(0.6, 1e-9);
    // wants: steel 0.25*2=0.5, fitting 0.25*1=0.25; totalWant 0.75 > out 0.6 -> proportional.
    expect(solved.linkFlow["l0"]).toBeCloseTo(0.6 * (0.5 / 0.75), 1e-9); // 0.4
    expect(solved.linkFlow["l1"]).toBeCloseTo(0.6 * (0.25 / 0.75), 1e-9); // 0.2
    // CONSERVATION: Σ outbound flows never exceeds producer output.
    const sumOut = solved.linkFlow["l0"] + solved.linkFlow["l1"];
    expect(sumOut <= out + 1e-9).toBeTruthy();
    expect(sumOut).toBeCloseTo(out, 1e-9); // demand exceeds supply -> all output dispatched, surplus 0
    const pSurplus =
      (solved.surplusRate["p"] && solved.surplusRate["p"]["iron_bar"]) || 0;
    expect(pSurplus).toBeCloseTo(0.0, 1e-9);
  });

  it("one producer -> two markets: goldRate equals the single-producer value (NOT doubled)", () => {
    const twoMarkets = [
      {
        id: "g",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_bar",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      }, // bonus 0.5 -> 0.5 bar/s
      {
        id: "mA",
        kind: "market",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 1, y: 0 },
      }, // cap 5
      {
        id: "mB",
        kind: "market",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 1, y: 1 },
      }, // cap 5
    ];
    const twoLinks = [
      { id: "l0", from: "g", to: "mA", resourceId: "iron_bar" },
      { id: "l1", from: "g", to: "mB", resourceId: "iron_bar" },
    ];
    const bonus = {
      productionBonuses: {
        gatherer: 0.5,
        smelter: 1.0,
        workshop: 1.0,
        market: 1.0,
        scholar: 1.0,
      },
    };
    const goldTwo = solve(
      fanState(twoMarkets, twoLinks, bonus),
      content(),
    ).goldRate;
    // Single-market baseline: same 0.5 bar/s gatherer -> one market.
    const oneMarket = [
      {
        id: "g",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_bar",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "mA",
        kind: "market",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    ];
    const oneLink = [{ id: "l0", from: "g", to: "mA", resourceId: "iron_bar" }];
    const goldOne = solve(
      fanState(oneMarket, oneLink, bonus),
      content(),
    ).goldRate;
    expect(goldOne).toBeCloseTo(2.0, 1e-9); // 0.5 bar @4.0
    expect(goldTwo).toBeCloseTo(goldOne, 1e-9); // 0.5 bar rationed across both markets -> still 2.0, NOT 4.0
  });
});

describe("RateSolver — autoSell surplus liquidation (task 7)", () => {
  // A lone gatherer producing a LISTED resource with no consumer accrues full
  // surplus. With autoSell on, that surplus sells at 50% basePrice into goldRate.
  function loneGathererState(autoSell, resourceId = "iron_ore") {
    const nodes = [
      {
        id: "m",
        kind: "gatherer",
        level: 1,
        resourceId,
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
    ];
    return {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links: [], nextNodeSeq: 1, nextLinkSeq: 0 },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: [],
        machinesUnlocked: ["gatherer", "market", "storage"],
        marketListings: [
          "iron_ore",
          "timber",
          "hide",
          "coal_raw",
          "gemstone",
          "iron_bar",
        ],
        titheRate: 0.05,
        offlineCapHours: 1,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
          storage: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell,
        heroSlots: 1,
      },
    };
  }

  it("listed surplus sells at 50% basePrice into goldRate only when autoSell is on", () => {
    // iron_ore basePrice 0.5; gatherer L1 -> 1.0/s surplus. 1.0 * 0.5 * 0.5 = 0.25 gold/s.
    const off = solve(loneGathererState(false), content());
    expect(off.goldRate).toBeCloseTo(0, 1e-9);
    const on = solve(loneGathererState(true), content());
    expect(on.goldRate).toBeCloseTo(1.0 * 0.5 * 0.5, 1e-9); // 0.25
  });

  it("autoSell gold tithes to research like every other sell path", () => {
    // 0.25 gold/s sold * titheRate 0.05 = 0.0125 research/s
    const on = solve(loneGathererState(true), content());
    expect(on.researchRate).toBeCloseTo(0.25 * 0.05, 1e-9);
    const off = solve(loneGathererState(false), content());
    expect(off.researchRate).toBeCloseTo(0, 1e-9);
  });

  it("does NOT sell an UNLISTED resource even with autoSell", () => {
    // parchment has basePrice null (never listed); coal not in marketListings here.
    const st = loneGathererState(true, "coal");
    st.unlocks.recipesUnlocked = []; // coal stays unlisted
    const solved = solve(st, content());
    expect(solved.goldRate).toBeCloseTo(0, 1e-9);
  });

  it("NEVER sells storage-room surplus (buffers protected)", () => {
    // A storage room fed beyond its passthrough leaves surplus that must NOT auto-sell.
    const nodes = [
      {
        id: "g",
        kind: "gatherer",
        level: 7, // 4.0 iron_ore/s
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "s",
        kind: "storage",
        level: 1,
        resourceId: null,
        recipeId: null,
        resourceIds: ["iron_ore"],
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    ];
    const links = [{ id: "l0", from: "g", to: "s", resourceId: "iron_ore" }];
    const st = {
      currencies: { gold: 0, research: 0, renown: 0 },
      graph: { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 },
      unlocks: {
        researchOwned: [],
        recipesUnlocked: [],
        machinesUnlocked: ["gatherer", "storage"],
        marketListings: ["iron_ore", "iron_bar"],
        titheRate: 0.05,
        offlineCapHours: 1,
        productionBonuses: {
          gatherer: 1.0,
          smelter: 1.0,
          workshop: 1.0,
          market: 1.0,
          scholar: 1.0,
          storage: 1.0,
        },
        gearTiersUnlocked: [],
        autoSell: true,
        heroSlots: 1,
      },
    };
    const solved = solve(st, content());
    // Storage passthrough (cap 10/s) drains the gatherer's 4.0/s fully (no gatherer
    // surplus), but the storage room has no downstream consumer so its OWN surplus is
    // 4.0/s. That storage surplus must NOT auto-sell -> goldRate stays 0.
    const gSurplus =
      (solved.surplusRate["g"] && solved.surplusRate["g"]["iron_ore"]) || 0;
    const sSurplus =
      (solved.surplusRate["s"] && solved.surplusRate["s"]["iron_ore"]) || 0;
    expect(gSurplus).toBeCloseTo(0, 1e-9);
    expect(sSurplus).toBeCloseTo(4.0, 1e-9); // storage holds the surplus
    expect(solved.goldRate).toBeCloseTo(0, 1e-9); // storage surplus never sold
  });

  it("autoSell goldRate flows through offline catch-up", async () => {
    const { applyOffline } =
      await import("../Source/Engine/Simulation/Offline.js");
    const st = loneGathererState(true);
    st.lastSeen = 0;
    st.expeditions = { active: null, completed: [] };
    // 100s of offline at 0.25 gold/s autoSell rate = 25 gold.
    const summary = applyOffline(st, content(), 100 * 1000);
    expect(summary.gained.gold).toBeCloseTo(0.25 * 100, 1e-6);
  });
});

describe("RateSolver — cycle rejection", () => {
  it("solve throws 'cycle' on a looped graph", () => {
    const { state, content } = cycleGraph();
    expect(() => solve(state, content)).toThrow("cycle");
  });
});
