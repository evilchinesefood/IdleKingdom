import { describe, it, expect } from "./Runner.js";
import { tutorialStep, victoryReady } from "../Source/UI/Logic/Selectors.js";

const tutSnap = (over = {}) => ({
  nodes: [],
  rates: { goldRate: 0 },
  meta: { tutorialDone: false },
  ...over,
});
const withNodes = (nodes, rates) =>
  tutSnap({ nodes, rates: rates || { goldRate: 0 } });

describe("Selectors.tutorialStep", () => {
  it("walks the basic loop: miner -> smelter -> market -> connect -> upgrade -> done", () => {
    const g = { kind: "gatherer", level: 1 };
    const s = { kind: "smelter", level: 1 };
    const m = { kind: "market", level: 1 };
    expect(tutorialStep(tutSnap()).id).toBe("miner");
    expect(tutorialStep(withNodes([g])).id).toBe("smelter");
    expect(tutorialStep(withNodes([g, s])).id).toBe("market");
    expect(tutorialStep(withNodes([g, s, m])).id).toBe("connect");
    // chain connected + selling (goldRate > 0) -> upgrade step
    expect(tutorialStep(withNodes([g, s, m], { goldRate: 2 })).id).toBe(
      "upgrade",
    );
    // a node leveled past 1 -> terminal "done" card
    expect(
      tutorialStep(
        withNodes([{ kind: "gatherer", level: 2 }, s, m], { goldRate: 2 }),
      ).id,
    ).toBe("done");
  });
  it("returns null once the tutorial is finished/skipped", () => {
    expect(tutorialStep(tutSnap({ meta: { tutorialDone: true } }))).toBe(null);
  });
  it("returns null for a missing/empty snapshot (no meta)", () => {
    expect(tutorialStep(null)).toBe(null);
    expect(tutorialStep({})).toBe(null);
  });
  it("reports a 0-based index and a 5-step total", () => {
    const first = tutorialStep(tutSnap());
    expect(first.index).toBe(0);
    expect(first.total).toBe(5);
  });
});

describe("Selectors.victoryReady", () => {
  it("true only when meta.won", () => {
    expect(victoryReady({ meta: { won: true } })).toBe(true);
    expect(victoryReady({ meta: { won: false } })).toBe(false);
    expect(victoryReady({ meta: {} })).toBe(false);
  });
});
