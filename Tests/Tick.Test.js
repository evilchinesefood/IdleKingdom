import { describe, it, expect } from "./Runner.js";
import { applyTick } from "../Source/Engine/Simulation/Tick.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { seedGraph, surplusGraph } from "./Fixtures/KnownGraph.js";

describe("Tick.applyTick — currencies", () => {
  it("seed graph: 2s of ticking adds 4.0 gold and 0.20 research", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    state.currencies.gold = 0;
    state.currencies.research = 0;
    applyTick(state, solved, 2.0);
    expect(state.currencies.gold).toBeCloseTo(4.0, 1e-9); // 2.0 gold/s * 2s
    expect(state.currencies.research).toBeCloseTo(0.2, 1e-9); // 0.10/s * 2s
  });
  it("renown is never advanced by a tick (only expeditions grant renown)", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    state.currencies.renown = 7.0;
    applyTick(state, solved, 5.0);
    expect(state.currencies.renown).toBeCloseTo(7.0, 1e-9);
  });
});

describe("Tick.applyTick — surplus into stockpiles", () => {
  it("accrues surplus into the node's sparse stockpile", () => {
    const { state, content } = surplusGraph();
    const solved = solve(state, content);
    const node = state.graph.nodes.find((n) => n.id === "m");
    node.stockpile = {};
    applyTick(state, solved, 3.0);
    expect(node.stockpile["iron_ore"]).toBeCloseTo(3.0, 1e-9); // 1.0/s * 3s
  });
  it("accumulates across multiple ticks", () => {
    const { state, content } = surplusGraph();
    const solved = solve(state, content);
    const node = state.graph.nodes.find((n) => n.id === "m");
    node.stockpile = {};
    applyTick(state, solved, 1.0);
    applyTick(state, solved, 1.0);
    expect(node.stockpile["iron_ore"]).toBeCloseTo(2.0, 1e-9);
  });
  it("does not create stockpile keys for nodes with no surplus", () => {
    const { state, content } = seedGraph();
    const solved = solve(state, content);
    const miner = state.graph.nodes.find((n) => n.id === "n_miner_0");
    miner.stockpile = {};
    applyTick(state, solved, 10.0);
    expect(Object.keys(miner.stockpile).length).toBe(0); // miner fully consumed by smelter -> no surplus
  });
});
