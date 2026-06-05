import { describe, it, expect } from "./Runner.js";
import {
  lodTier,
  nodeSig,
  cullRectFor,
  nodeInRect,
  segmentIntersectsRect,
} from "../Source/UI/GraphView.js";

describe("GraphView retained-render pure helpers", () => {
  it("lodTier: full at/above 0.5, far below", () => {
    expect(lodTier(1)).toBe("full");
    expect(lodTier(0.5)).toBe("full");
    expect(lodTier(0.49)).toBe("far");
    expect(lodTier(0.1)).toBe("far");
  });

  it("nodeSig captures structure, not continuous values", () => {
    const base = {
      kind: "smelter",
      working: true,
      atCapacity: false,
      starved: false,
    };
    const a = nodeSig(base, "full", false, "iron-bar");
    // level/capacityPct/pos are NOT in the sig (updated in place)
    const b = nodeSig(
      { ...base, level: 9, capacityPct: 0.7 },
      "full",
      false,
      "iron-bar",
    );
    expect(a).toBe(b);
    // badge flips, icon, tier, working, armed ARE in the sig
    expect(
      nodeSig({ ...base, atCapacity: true }, "full", false, "iron-bar") === a,
    ).toBe(false);
    expect(
      nodeSig(
        { ...base, working: false, starved: true },
        "full",
        false,
        "iron-bar",
      ) === a,
    ).toBe(false);
    expect(nodeSig(base, "far", false, "iron-bar") === a).toBe(false);
    expect(nodeSig(base, "full", true, "iron-bar") === a).toBe(false);
    expect(nodeSig(base, "full", false, "sword") === a).toBe(false);
  });

  it("nodeSig badge precedence: max > low > off > none", () => {
    const sig = (n) => nodeSig(n, "full", false, "x").split("|")[4];
    expect(sig({ kind: "k", atCapacity: true, working: true })).toBe("max");
    expect(sig({ kind: "k", starved: true, working: true })).toBe("low");
    expect(sig({ kind: "k", starved: true, working: false })).toBe("off");
    expect(sig({ kind: "k", working: true })).toBe("none");
  });

  it("cullRectFor maps the padded screen viewport into graph space", () => {
    // identity view: scale 1, no offset -> rect is just the padded box
    const v = { scale: 1, tx: 0, ty: 0 };
    const r = cullRectFor(v, 800, 600, 150);
    expect(r.x0).toBeCloseTo(-150, 1e-9);
    expect(r.y0).toBeCloseTo(-150, 1e-9);
    expect(r.x1).toBeCloseTo(950, 1e-9);
    expect(r.y1).toBeCloseTo(750, 1e-9);
    // zoomed out 2x: the same screen shows twice the graph units
    const r2 = cullRectFor({ scale: 0.5, tx: 0, ty: 0 }, 800, 600, 0);
    expect(r2.x1).toBeCloseTo(1600, 1e-9);
    expect(r2.y1).toBeCloseTo(1200, 1e-9);
  });

  it("nodeInRect: overlap counts, fully-outside does not (node is 120x64)", () => {
    const vp = { x0: 0, y0: 0, x1: 800, y1: 600 };
    expect(nodeInRect({ x: 100, y: 100 }, vp)).toBe(true);
    expect(nodeInRect({ x: -119, y: 0 }, vp)).toBe(true); // 1px still inside
    expect(nodeInRect({ x: -121, y: 0 }, vp)).toBe(false);
    expect(nodeInRect({ x: 0, y: 601 }, vp)).toBe(false);
    expect(nodeInRect({ x: 801, y: 0 }, vp)).toBe(false);
  });

  it("segmentIntersectsRect catches a link crossing the view with both ends outside", () => {
    const vp = { x0: 0, y0: 0, x1: 800, y1: 600 };
    expect(
      segmentIntersectsRect({ x: -500, y: 300 }, { x: 1300, y: 300 }, vp),
    ).toBe(true);
    expect(
      segmentIntersectsRect({ x: -500, y: -500 }, { x: -100, y: -100 }, vp),
    ).toBe(false);
    expect(
      segmentIntersectsRect({ x: 100, y: 100 }, { x: 200, y: 200 }, vp),
    ).toBe(true); // inside
  });
});
