import { describe, it, expect } from "./Runner.js";
import { topoSort, wouldStayAcyclic, isValidLink, orderFor } from "../Source/Engine/Simulation/Topology.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES, GATHERER_VARIANTS } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";

const CONTENT = { resources: RESOURCES, machines: MACHINES, recipes: RECIPES, gathererVariants: GATHERER_VARIANTS };

describe("Topology.topoSort", () => {
  it("orders a linear miner->smelter->market chain", () => {
    const nodes = [
      { id: "n_miner_0", kind: "gatherer" },
      { id: "n_smelter_0", kind: "smelter" },
      { id: "n_market_0", kind: "market" },
    ];
    const links = [
      { id: "l_0", from: "n_miner_0", to: "n_smelter_0", resourceId: "iron_ore" },
      { id: "l_1", from: "n_smelter_0", to: "n_market_0", resourceId: "iron_bar" },
    ];
    const order = topoSort(nodes, links);
    expect(order.indexOf("n_miner_0") < order.indexOf("n_smelter_0")).toBeTruthy();
    expect(order.indexOf("n_smelter_0") < order.indexOf("n_market_0")).toBeTruthy();
    expect(order.length).toBe(3);
  });

  it("includes isolated nodes with no links", () => {
    const nodes = [{ id: "a", kind: "gatherer" }, { id: "b", kind: "gatherer" }];
    const order = topoSort(nodes, []);
    expect(order.length).toBe(2);
    expect(order.includes("a")).toBeTruthy();
    expect(order.includes("b")).toBeTruthy();
  });

  it("throws on a cycle", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const links = [
      { id: "l0", from: "a", to: "b", resourceId: "x" },
      { id: "l1", from: "b", to: "c", resourceId: "x" },
      { id: "l2", from: "c", to: "a", resourceId: "x" },
    ];
    expect(() => topoSort(nodes, links)).toThrow("cycle");
  });
});

describe("Topology.wouldStayAcyclic", () => {
  it("permits a forward link", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const links = [{ id: "l0", from: "a", to: "b", resourceId: "x" }];
    expect(wouldStayAcyclic(nodes, links, "a", "b")).toBeTruthy();
  });
  it("rejects a back link that closes a loop", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const links = [{ id: "l0", from: "a", to: "b", resourceId: "x" }];
    expect(wouldStayAcyclic(nodes, links, "b", "a")).toBe(false);
  });
});

describe("Topology.isValidLink", () => {
  it("accepts a DISTINCT new feed into a market (second smelter -> market for iron_bar)", () => {
    const state = NewGame(new FakeClock(0));
    // Add a second smelter producing iron_bar; feeding it into the market is a distinct new feed
    // (different source than seed link l_1), so it must be accepted.
    state.graph.nodes.push({
      id: "n_smelter_1",
      kind: "smelter",
      level: 1,
      resourceId: null,
      recipeId: "r_iron_bar",
      stockpile: {},
      pos: { x: 360, y: 320 },
    });
    expect(isValidLink(state, CONTENT, "n_smelter_1", "n_market_0", "iron_bar")).toBeTruthy();
  });
  it("rejects re-adding the EXACT seed market link l_1 (smelter -> market, iron_bar) as a duplicate", () => {
    const state = NewGame(new FakeClock(0));
    // l_1 already carries iron_bar n_smelter_0 -> n_market_0; the exact triple must be rejected
    // even for a market target, or the solver would double-count the feed.
    expect(isValidLink(state, CONTENT, "n_smelter_0", "n_market_0", "iron_bar")).toBe(false);
  });
  it("rejects from===to", () => {
    const state = NewGame(new FakeClock(0));
    expect(isValidLink(state, CONTENT, "n_miner_0", "n_miner_0", "iron_ore")).toBe(false);
  });
  it("rejects a resource the producer cannot output", () => {
    const state = NewGame(new FakeClock(0));
    // miner is assigned iron_ore, cannot output timber
    expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "timber")).toBe(false);
  });
  it("rejects a duplicate of an existing non-market link (re-adding l_0)", () => {
    const state = NewGame(new FakeClock(0));
    // l_0 already carries iron_ore miner->smelter
    expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "iron_ore")).toBe(false);
  });
  it("rejects a resource the consumer cannot accept", () => {
    const state = NewGame(new FakeClock(0));
    // smelter runs r_iron_bar (inputs iron_ore) — cannot accept iron_bar as input
    expect(isValidLink(state, CONTENT, "n_smelter_0", "n_smelter_0", "iron_bar")).toBe(false);
  });
  it("accepts two DISTINCT miners feeding one smelter the same resource (solver sums them)", () => {
    const state = NewGame(new FakeClock(0));
    // Add a second miner producing iron_ore; both miners -> smelter for iron_ore are distinct feeds.
    state.graph.nodes.push({
      id: "n_miner_1",
      kind: "gatherer",
      level: 1,
      resourceId: "iron_ore",
      recipeId: null,
      stockpile: {},
      pos: { x: 120, y: 320 },
    });
    // n_miner_0 -> n_smelter_0 iron_ore is the existing l_0 (rejected as duplicate)...
    expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "iron_ore")).toBe(false);
    // ...but the distinct n_miner_1 -> n_smelter_0 iron_ore feed is valid.
    expect(isValidLink(state, CONTENT, "n_miner_1", "n_smelter_0", "iron_ore")).toBeTruthy();
  });
});

describe("Topology.orderFor", () => {
  it("returns a valid topo order for the seed graph and caches it", () => {
    const state = NewGame(new FakeClock(0));
    const a = orderFor(state);
    const b = orderFor(state);
    expect(a.length).toBe(3);
    expect(a.indexOf("n_miner_0") < a.indexOf("n_smelter_0")).toBeTruthy();
    expect(a).toBe(b); // cached reference reused while structure unchanged
  });
});
