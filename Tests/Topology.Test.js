import { describe, it, expect } from "./Runner.js";
import { topoSort } from "../Source/Engine/Simulation/Topology.js";

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
