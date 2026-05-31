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
  it("accepts smelter(iron_bar) -> market for iron_bar", () => {
    const state = NewGame(new FakeClock(0));
    expect(isValidLink(state, CONTENT, "n_smelter_0", "n_market_0", "iron_bar")).toBeTruthy();
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
  it("rejects a duplicate of an existing link", () => {
    const state = NewGame(new FakeClock(0));
    // l_0 already carries iron_ore miner->smelter
    expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "iron_ore")).toBe(false);
  });
  it("rejects a resource the consumer cannot accept", () => {
    const state = NewGame(new FakeClock(0));
    // smelter runs r_iron_bar (inputs iron_ore) — cannot accept iron_bar as input
    expect(isValidLink(state, CONTENT, "n_smelter_0", "n_smelter_0", "iron_bar")).toBe(false);
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
