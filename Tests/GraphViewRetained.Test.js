import { describe, it, expect } from "./Runner.js";
import {
  GraphView,
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

// ---- minimal DOM shim for mounting GraphView headlessly -------------------
function makeEl(tag) {
  const el = {
    tagName: tag,
    childNodes: [],
    attrs: {},
    style: {},
    parentNode: null,
    textContent: "",
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    getAttribute(k) {
      return this.attrs[k] != null ? this.attrs[k] : null;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    appendChild(c) {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    },
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    replaceChild(fresh, old) {
      const i = this.childNodes.indexOf(old);
      if (i < 0) throw new Error("replaceChild: old not found");
      if (fresh.parentNode) fresh.parentNode.removeChild(fresh);
      this.childNodes[i] = fresh;
      old.parentNode = null;
      fresh.parentNode = this;
      return old;
    },
    contains() {
      return false;
    },
    get firstChild() {
      return this.childNodes[0] || null;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
  };
  return el;
}
function installDom() {
  const doc = {
    createElement: (t) => makeEl(t),
    createElementNS: (_ns, t) => makeEl(t),
    createTextNode: (s) => ({ nodeType: 3, textContent: s, parentNode: null }),
    activeElement: null,
  };
  globalThis.document = doc;
  return doc;
}
// A snapshot-shaped node row with sane defaults (mirror Snapshot.js node rows).
function nrow(id, over = {}) {
  return {
    id,
    kind: "gatherer",
    level: 1,
    pos: { x: 100, y: 100 },
    effectiveRate: 1,
    capacityPct: 0.5,
    atCapacity: false,
    starved: false,
    working: true,
    resourceId: "iron_ore",
    recipeId: null,
    goldOut: 0,
    researchOut: 0,
    siegeOut: 0,
    ...over,
  };
}
function mount(snap) {
  installDom();
  const host = makeEl("div");
  const game = { content: { recipes: {} }, dispatch: () => ({ ok: true }) };
  // GraphView imports GraphInput which wires pointer handlers onto the svg el —
  // the shim's addEventListener is a no-op, so construction is safe headless.
  const gv = new GraphView(host, game);
  gv.render(snap);
  return gv;
}

describe("GraphView retained node layer", () => {
  it("reuses the same element object across draws when nothing structural changed", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    const el1 = gv._nodeEls.get("a").g;
    gv.render({
      nodes: [nrow("a", { level: 5, capacityPct: 0.9 })],
      links: [],
      buildings: [],
    });
    const el2 = gv._nodeEls.get("a").g;
    expect(el1 === el2).toBe(true); // identity preserved
    expect(gv.layerNodes.childNodes.length).toBe(1);
  });

  it("updates transform / cap width / sub text in place", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    const e = gv._nodeEls.get("a");
    gv.render({
      nodes: [nrow("a", { pos: { x: 200, y: 300 }, level: 7, capacityPct: 1 })],
      links: [],
      buildings: [],
    });
    expect(e.g.getAttribute("transform")).toBe("translate(200 300) scale(1)");
    expect(e.capFill.getAttribute("width")).toBe(String(120 - 16));
    expect(e.subText.textContent.includes("L7")).toBe(true);
  });

  it("rebuilds only the node whose sig changed (badge flip)", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    const a1 = gv._nodeEls.get("a").g;
    const b1 = gv._nodeEls.get("b").g;
    gv.render({
      nodes: [
        nrow("a", { atCapacity: true }),
        nrow("b", { pos: { x: 400, y: 100 } }),
      ],
      links: [],
      buildings: [],
    });
    expect(gv._nodeEls.get("a").g === a1).toBe(false); // rebuilt (badge appeared)
    expect(gv._nodeEls.get("b").g === b1).toBe(true); // untouched
    expect(gv.layerNodes.childNodes.length).toBe(2);
  });

  it("removes departed nodes from DOM and map", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b")],
      links: [],
      buildings: [],
    });
    gv.render({ nodes: [nrow("b")], links: [], buildings: [] });
    expect(gv._nodeEls.has("a")).toBe(false);
    expect(gv.layerNodes.childNodes.length).toBe(1);
  });

  it("selection class is applied in place without rebuild", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    const el = gv._nodeEls.get("a").g;
    gv.selectedId = "a";
    gv.render({ nodes: [nrow("a")], links: [], buildings: [] });
    expect(gv._nodeEls.get("a").g === el).toBe(true);
    expect(el.getAttribute("class").includes("selected")).toBe(true);
  });

  it("empty canvas shows the hint; nodes replace it; emptying re-shows it", () => {
    const gv = mount({ nodes: [], links: [], buildings: [] });
    expect(gv.layerNodes.childNodes.length).toBe(1); // the hint text
    gv.render({ nodes: [nrow("a")], links: [], buildings: [] });
    const tags = gv.layerNodes.childNodes.map(
      (c) => c.getAttribute("class") || "",
    );
    expect(tags.some((c) => c.includes("graph-empty"))).toBe(false);
    expect(gv.layerNodes.childNodes.length).toBe(1);
    // N -> 0: the cached hint re-shows (pins the _hintEl re-attach branch)
    gv.render({ nodes: [], links: [], buildings: [] });
    expect(gv.layerNodes.childNodes.length).toBe(1);
    expect(
      (gv.layerNodes.firstChild.getAttribute("class") || "").includes(
        "graph-empty",
      ),
    ).toBe(true);
  });
});

function lrow(id, from, to, over = {}) {
  return { id, from, to, resourceId: "iron_ore", flow: 1, fedPct: 1, ...over };
}

describe("GraphView retained link layer", () => {
  it("reuses link elements and updates path d in place when an endpoint moves", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    });
    const e1 = gv._linkEls.get("l1");
    const d1 = e1.path.getAttribute("d");
    gv.render({
      nodes: [
        nrow("a", { pos: { x: 150, y: 100 } }),
        nrow("b", { pos: { x: 400, y: 100 } }),
      ],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    });
    expect(gv._linkEls.get("l1") === e1).toBe(true);
    expect(e1.path.getAttribute("d") === d1).toBe(false);
    expect(e1.hit.getAttribute("d")).toBe(e1.path.getAttribute("d"));
  });

  it("starved class toggles in place; reveal rebuilds with label + delete", () => {
    const snap = {
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [lrow("l1", "a", "b", { fedPct: 0.4 })],
      buildings: [],
    };
    const gv = mount(snap);
    const e = gv._linkEls.get("l1");
    expect(e.path.getAttribute("class").includes("starved")).toBe(true);
    gv.selectedLinkId = "l1"; // reveal -> structural change
    gv.render(snap);
    const e2 = gv._linkEls.get("l1");
    expect(e2 === e).toBe(false);
    const classes = e2.g.childNodes.map((c) => c.getAttribute("class") || "");
    expect(classes.some((c) => c.includes("link-label"))).toBe(true);
    expect(classes.some((c) => c.includes("link-delete-g"))).toBe(true);
  });

  it("removes departed links", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    });
    gv.render({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    expect(gv._linkEls.has("l1")).toBe(false);
    expect(gv.layerLinks.childNodes.length).toBe(0);
  });

  it("unreveal rebuilds back to a plain dot; sheds label + delete", () => {
    const snap = {
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    };
    const gv = mount(snap);
    gv.selectedLinkId = "l1"; // reveal -> rebuilt with label + delete
    gv.render(snap);
    const e = gv._linkEls.get("l1");
    gv.selectedLinkId = null; // unreveal -> structural change back to plain
    gv.render(snap);
    const e2 = gv._linkEls.get("l1");
    expect(e2 === e).toBe(false); // rebuilt
    const classes = e2.g.childNodes.map((c) => c.getAttribute("class") || "");
    expect(classes.some((c) => c.includes("link-dot"))).toBe(true);
    expect(classes.some((c) => c.includes("link-label"))).toBe(false);
    expect(classes.some((c) => c.includes("link-delete-g"))).toBe(false);
  });
});

describe("GraphView LOD far tier", () => {
  function classesOf(g) {
    return g.childNodes.map((c) => c.getAttribute("class") || "");
  }
  it("far tier drops icon FO, gear FO, and ports; keeps box/label/cap/badge", () => {
    const gv = mount({
      nodes: [nrow("a", { atCapacity: true })],
      links: [],
      buildings: [],
    });
    gv.view = { scale: 0.4, tx: 0, ty: 0 };
    gv.render({
      nodes: [nrow("a", { atCapacity: true })],
      links: [],
      buildings: [],
    });
    const cls = classesOf(gv._nodeEls.get("a").g);
    expect(cls.some((c) => c.includes("node-ico"))).toBe(false);
    expect(cls.some((c) => c.includes("node-working"))).toBe(false);
    expect(cls.some((c) => c.includes("port"))).toBe(false);
    expect(cls.some((c) => c.includes("node-box"))).toBe(true);
    expect(cls.some((c) => c.includes("node-label"))).toBe(true);
    expect(cls.some((c) => c.includes("cap-fill"))).toBe(true);
    expect(cls.some((c) => c.includes("node-badge-box"))).toBe(true);
  });

  it("crossing the threshold rebuilds (tier is in the sig); selected node stays full", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    const a1 = gv._nodeEls.get("a").g;
    gv.selectedId = "b";
    gv.view = { scale: 0.3, tx: 0, ty: 0 };
    gv.render({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    expect(gv._nodeEls.get("a").g === a1).toBe(false); // rebuilt as far
    const bCls = classesOf(gv._nodeEls.get("b").g);
    expect(bCls.some((c) => c.includes("node-ico"))).toBe(true); // selected stays full
  });
});

describe("GraphView viewport culling", () => {
  it("renders only nodes inside the padded viewport; map keeps culled entries", () => {
    const gv = mount({
      nodes: [nrow("in"), nrow("out", { pos: { x: 5000, y: 5000 } })],
      links: [],
      buildings: [],
    });
    // headless default: no host rect -> everything rendered
    expect(gv.layerNodes.childNodes.length).toBe(2);
    // inject a measurable viewport (the shim has no layout)
    gv._hostRect = { width: 800, height: 600 };
    gv.render({
      nodes: [nrow("in"), nrow("out", { pos: { x: 5000, y: 5000 } })],
      links: [],
      buildings: [],
    });
    expect(gv.layerNodes.childNodes.length).toBe(1);
    expect(gv._nodeEls.has("out")).toBe(true); // entry kept, DOM-detached
    expect(gv._nodeEls.get("out").g.parentNode).toBe(null);
  });

  it("selected node renders even when off-viewport", () => {
    const gv = mount({
      nodes: [nrow("far", { pos: { x: 5000, y: 5000 } })],
      links: [],
      buildings: [],
    });
    gv._hostRect = { width: 800, height: 600 };
    gv.selectedId = "far";
    gv.render({
      nodes: [nrow("far", { pos: { x: 5000, y: 5000 } })],
      links: [],
      buildings: [],
    });
    expect(gv.layerNodes.childNodes.length).toBe(1);
  });

  it("a link crossing the view renders even with both endpoints culled", () => {
    const gv = mount({
      nodes: [
        nrow("L", { pos: { x: -2000, y: 200 } }),
        nrow("R", { pos: { x: 3000, y: 200 } }),
      ],
      links: [lrow("x", "L", "R")],
      buildings: [],
    });
    gv._hostRect = { width: 800, height: 600 };
    gv.render({
      nodes: [
        nrow("L", { pos: { x: -2000, y: 200 } }),
        nrow("R", { pos: { x: 3000, y: 200 } }),
      ],
      links: [lrow("x", "L", "R")],
      buildings: [],
    });
    expect(gv.layerNodes.childNodes.length).toBe(0);
    expect(gv.layerLinks.childNodes.length).toBe(1);
  });

  it("scrolling a culled node back into view re-attaches the SAME element", () => {
    const gv = mount({
      nodes: [nrow("a", { pos: { x: 5000, y: 100 } })],
      links: [],
      buildings: [],
    });
    gv._hostRect = { width: 800, height: 600 };
    gv.render({
      nodes: [nrow("a", { pos: { x: 5000, y: 100 } })],
      links: [],
      buildings: [],
    });
    const detached = gv._nodeEls.get("a").g;
    expect(detached.parentNode).toBe(null);
    gv.view = { scale: 1, tx: -4800, ty: 0 }; // pan so the node is on-screen
    gv.render({
      nodes: [nrow("a", { pos: { x: 5000, y: 100 } })],
      links: [],
      buildings: [],
    });
    expect(gv._nodeEls.get("a").g === detached).toBe(true);
    expect(detached.parentNode === gv.layerNodes).toBe(true);
  });

  it("measures + caches the host rect; a zero rect is NOT cached (render-all)", () => {
    const snap = {
      nodes: [nrow("in"), nrow("out", { pos: { x: 5000, y: 5000 } })],
      links: [],
      buildings: [],
    };
    const gv = mount(snap);
    // zero rect: unmeasurable -> not cached, culling stays off (render-all)
    gv.host.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    });
    gv.render(snap);
    expect(gv._hostRect).toBe(null);
    expect(gv.layerNodes.childNodes.length).toBe(2);
    // a real rect: measured, cached, and culling goes live
    gv.host.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    });
    gv.render(snap);
    expect(gv._hostRect.width).toBe(800);
    expect(gv.layerNodes.childNodes.length).toBe(1);
    expect(gv._nodeEls.get("out").g.parentNode).toBe(null);
  });
});
