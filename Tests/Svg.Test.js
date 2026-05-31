import { describe, it, expect } from "./Runner.js";
import {
  makeView,
  screenToGraph,
  graphToScreen,
  clampScale,
  panBy,
  zoomAt,
} from "../Source/UI/Render/Svg.js";

describe("Svg.makeView", () => {
  it("starts at identity-ish view (scale 1, no offset)", () => {
    const v = makeView();
    expect(v.scale).toBe(1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });
});

describe("Svg coordinate transforms", () => {
  it("screenToGraph inverts graphToScreen", () => {
    const v = { scale: 2, tx: 50, ty: 30 };
    const g = { x: 120, y: 200 };
    const s = graphToScreen(v, g.x, g.y);
    const back = screenToGraph(v, s.x, s.y);
    expect(back.x).toBeCloseTo(120, 1e-9);
    expect(back.y).toBeCloseTo(200, 1e-9);
  });
  it("graphToScreen applies scale then translate", () => {
    const v = { scale: 2, tx: 50, ty: 30 };
    const s = graphToScreen(v, 10, 10);
    expect(s.x).toBeCloseTo(70, 1e-9); // 10*2 + 50
    expect(s.y).toBeCloseTo(50, 1e-9); // 10*2 + 30
  });
});

describe("Svg.clampScale", () => {
  it("clamps to [0.25, 4]", () => {
    expect(clampScale(0.1)).toBeCloseTo(0.25, 1e-9);
    expect(clampScale(10)).toBeCloseTo(4, 1e-9);
    expect(clampScale(1.5)).toBeCloseTo(1.5, 1e-9);
  });
});

describe("Svg.panBy", () => {
  it("adds pixel delta to translation", () => {
    const v = panBy({ scale: 1, tx: 0, ty: 0 }, 15, -5);
    expect(v.tx).toBeCloseTo(15, 1e-9);
    expect(v.ty).toBeCloseTo(-5, 1e-9);
  });
});

describe("Svg.zoomAt", () => {
  it("keeps the screen-anchor point fixed under the cursor", () => {
    const v0 = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 200, y: 100 };
    const before = screenToGraph(v0, anchor.x, anchor.y);
    const v1 = zoomAt(v0, anchor.x, anchor.y, 2); // 2x zoom factor
    const after = screenToGraph(v1, anchor.x, anchor.y);
    // graph point under the cursor is unchanged by zoom
    expect(after.x).toBeCloseTo(before.x, 1e-9);
    expect(after.y).toBeCloseTo(before.y, 1e-9);
    expect(v1.scale).toBeCloseTo(2, 1e-9);
  });
});
