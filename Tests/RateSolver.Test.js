import { describe, it, expect } from "./Runner.js";
import { seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph } from "./Fixtures/KnownGraph.js";

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
