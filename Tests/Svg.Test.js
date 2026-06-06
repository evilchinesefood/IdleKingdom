import { describe, it, expect } from "./Runner.js";
import {
  makeView,
  screenToGraph,
  graphToScreen,
  clampScale,
  panBy,
  zoomAt,
  snapToGrid,
  graphBounds,
  fitScaleFor,
  dynamicMin,
  SCALE_MIN,
  SCALE_HARD_FLOOR,
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
  it("clamps to [0.25, 4] by default (back-compat)", () => {
    expect(clampScale(0.1)).toBeCloseTo(0.25, 1e-9);
    expect(clampScale(10)).toBeCloseTo(4, 1e-9);
    expect(clampScale(1.5)).toBeCloseTo(1.5, 1e-9);
  });
  it("respects a dynamic min below SCALE_MIN", () => {
    expect(clampScale(0.05, 0.04)).toBeCloseTo(0.05, 1e-9);
    expect(clampScale(0.03, 0.04)).toBeCloseTo(0.04, 1e-9);
  });
});

describe("Svg.panBy", () => {
  it("adds pixel delta to translation", () => {
    const v = panBy({ scale: 1, tx: 0, ty: 0 }, 15, -5);
    expect(v.tx).toBeCloseTo(15, 1e-9);
    expect(v.ty).toBeCloseTo(-5, 1e-9);
  });
});

describe("Svg.snapToGrid", () => {
  it("rounds each axis to the nearest grid multiple", () => {
    const p = snapToGrid({ x: 53, y: 18 }, 40);
    expect(p.x).toBe(40); // 53/40=1.325 -> round 1 -> 40
    expect(p.y).toBe(0); // 18/40=0.45 -> round 0 -> 0
  });
  it("rounds .5 up (banker-free Math.round)", () => {
    const p = snapToGrid({ x: 60, y: 60 }, 40);
    expect(p.x).toBe(80); // 60/40=1.5 -> round 2 -> 80
    expect(p.y).toBe(80);
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
  it("respects a dynamic scaleMin below SCALE_MIN", () => {
    const v0 = { scale: 0.05, tx: 0, ty: 0 };
    const v1 = zoomAt(v0, 0, 0, 0.5, 0.04); // would go to 0.025 but floor at 0.04
    expect(v1.scale).toBeCloseTo(0.04, 1e-9);
  });
});

describe("Svg.graphBounds", () => {
  const NW = 120,
    NH = 64;

  it("returns null for empty nodes and buildings", () => {
    expect(graphBounds([], [], NW, NH)).toBe(null);
    expect(graphBounds(null, null, NW, NH)).toBe(null);
  });

  it("bounds a single node using nodeW/nodeH", () => {
    const b = graphBounds([{ pos: { x: 100, y: 200 } }], [], NW, NH);
    expect(b.x).toBe(100);
    expect(b.y).toBe(200);
    expect(b.w).toBe(NW);
    expect(b.h).toBe(NH);
  });

  it("unions multiple nodes", () => {
    const nodes = [{ pos: { x: 0, y: 0 } }, { pos: { x: 500, y: 300 } }];
    const b = graphBounds(nodes, [], NW, NH);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.w).toBe(500 + NW);
    expect(b.h).toBe(300 + NH);
  });

  it("includes building rects", () => {
    const nodes = [{ pos: { x: 100, y: 100 } }];
    const buildings = [{ rect: { x: -50, y: -50, w: 200, h: 200 } }];
    const b = graphBounds(nodes, buildings, NW, NH);
    expect(b.x).toBe(-50);
    expect(b.y).toBe(-50);
    expect(b.w).toBe(Math.max(100 + NW, -50 + 200) - -50);
    expect(b.h).toBe(Math.max(100 + NH, -50 + 200) - -50);
  });
});

describe("Svg.fitScaleFor", () => {
  it("frames a 1000x500 graph in an 800x600 viewport with 40px pad", () => {
    // availW=720, availH=520; scale = min(720/1000, 520/500) = min(0.72, 1.04) = 0.72
    const s = fitScaleFor({ w: 1000, h: 500 }, 800, 600, 40);
    expect(s).toBeCloseTo(0.72, 4);
  });

  it("never zooms in past 1.0 even for tiny graphs", () => {
    const s = fitScaleFor({ w: 10, h: 10 }, 800, 600, 40);
    expect(s).toBe(1.0);
  });

  it("returns SCALE_HARD_FLOOR for degenerate input", () => {
    expect(fitScaleFor(null, 800, 600, 40)).toBe(SCALE_MIN);
    expect(fitScaleFor({ w: 0, h: 0 }, 800, 600, 40)).toBe(SCALE_MIN);
    expect(fitScaleFor({ w: 100, h: 100 }, 0, 0, 40)).toBe(SCALE_MIN);
  });
});

describe("Svg.dynamicMin", () => {
  it("returns SCALE_MIN for empty graph (null bounds)", () => {
    expect(dynamicMin(null, 800, 600)).toBe(SCALE_MIN);
  });

  it("returns a value <= SCALE_MIN and >= SCALE_HARD_FLOOR", () => {
    // a large graph that needs to zoom out further than SCALE_MIN
    const bounds = { x: 0, y: 0, w: 5000, h: 3000 };
    const min = dynamicMin(bounds, 800, 600);
    expect(min >= SCALE_HARD_FLOOR && min <= SCALE_MIN).toBe(true);
  });

  it("keeps SCALE_MIN for a small graph that fits at 1.0", () => {
    const bounds = { x: 0, y: 0, w: 200, h: 100 };
    const min = dynamicMin(bounds, 800, 600);
    expect(min).toBe(SCALE_MIN); // fitScale would be 1.0, min(0.25, 1*0.9)=0.25
  });
});
