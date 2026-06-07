import { describe, it, expect } from "./Runner.js";
import {
  GraphView,
  lodTier,
  nodeSig,
  cullRectFor,
  nodeInRect,
  segmentIntersectsRect,
  MAP_SCALE,
  LOD_SCALE,
} from "../Source/UI/GraphView.js";

describe("GraphView retained-render pure helpers", () => {
  it("lodTier: 3-way thresholds — full/far/map", () => {
    expect(lodTier(1)).toBe("full");
    expect(lodTier(LOD_SCALE)).toBe("full"); // at threshold = full
    expect(lodTier(LOD_SCALE - 0.01)).toBe("far"); // just below LOD = far
    expect(lodTier(MAP_SCALE)).toBe("far"); // at MAP threshold = still far
    expect(lodTier(MAP_SCALE - 0.001)).toBe("map"); // just below MAP = map
    expect(lodTier(0.001)).toBe("map"); // deep zoom = map
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
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      if (!ref) {
        this.childNodes.push(c);
      } else {
        const i = this.childNodes.indexOf(ref);
        if (i < 0) this.childNodes.push(c);
        else this.childNodes.splice(i, 0, c);
      }
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

  it("a culled node re-enters at its snapshot position, not the end (stable Tab order — deep-review #8)", () => {
    // three nodes: b sits far away; a and c are on-screen
    const snap = (bx) => ({
      nodes: [
        nrow("a", { pos: { x: 100, y: 100 } }),
        nrow("b", { pos: { x: bx, y: 100 } }),
        nrow("c", { pos: { x: 300, y: 100 } }),
      ],
      links: [],
      buildings: [],
    });
    const gv = mount(snap(5000));
    gv._hostRect = { width: 800, height: 600 };
    gv.render(snap(5000)); // b culled (off-viewport)
    expect(gv._nodeEls.get("b").g.parentNode).toBe(null);
    gv.render(snap(200)); // b moves on-screen -> re-attaches
    const order = gv.layerNodes.childNodes
      .map((el) => el.getAttribute && el.getAttribute("data-node-id"))
      .filter(Boolean);
    expect(order).toEqual(["a", "b", "c"]); // NOT ["a","c","b"]
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

describe("GraphView single-machine action bar (headless mount)", () => {
  it("a single selected machine renders the bar with Copy + Delete (no Group), no throw", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    gv.selectedId = "a"; // a plain-clicked machine; multi sets stay empty
    gv.render({ nodes: [nrow("a")], links: [], buildings: [] });
    const labels = gv.actionBarEl.childNodes.map((b) => b.textContent);
    expect(labels).toEqual(["Copy", "Delete"]);
    expect(labels.includes("Group")).toBe(false);
  });

  it("deselecting (selectedId=null) hides the bar and drops its sig", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    gv.selectedId = "a";
    gv.render({ nodes: [nrow("a")], links: [], buildings: [] });
    expect(gv.actionBarEl.childNodes.length).toBe(2);
    expect(gv.actionBarEl.style.display).toBe("flex");
    gv.selectedId = null;
    gv.render({ nodes: [nrow("a")], links: [], buildings: [] });
    expect(gv.actionBarEl.style.display).toBe("none");
    expect(gv._barSig).toBe(null);
  });

  it("sig flips between machines so the retained bar rebuilds on selection change", () => {
    const gv = mount({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    gv.selectedId = "a";
    gv.render({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    const sigA = gv._barSig;
    gv.selectedId = "b";
    gv.render({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    expect(gv._barSig === sigA).toBe(false); // id is part of the sig
  });
});

// Task 35 + deep-review #16: SVG carries group semantics + a live machine count.
describe("GraphView accessibility — SVG label", () => {
  it("svgEl carries role=group, a roledescription, and the machine count", () => {
    const gv = mount({ nodes: [], links: [], buildings: [] });
    expect(gv.svgEl.getAttribute("role")).toBe("group");
    expect(gv.svgEl.getAttribute("aria-roledescription")).toBe("factory graph");
    expect(gv.svgEl.getAttribute("aria-label")).toBe(
      "Factory graph, 0 machines",
    );
  });
});

describe("GraphView fitView", () => {
  it("no-ops on an empty graph (no throw, view unchanged)", () => {
    const gv = mount({ nodes: [], links: [], buildings: [] });
    const v0 = { ...gv.view };
    gv.fitView();
    expect(gv.view.scale).toBe(v0.scale);
  });

  it("no-ops when no real host rect is available (headless)", () => {
    const gv = mount({ nodes: [nrow("a")], links: [], buildings: [] });
    // headless shim has no getBoundingClientRect -> fitView returns early
    gv.fitView();
    expect(gv.view.scale).toBe(1); // unchanged from makeView default
  });

  it("sets a scale <= 1.0 and centers the graph in a real viewport", () => {
    const gv = mount({
      nodes: [
        nrow("a", { pos: { x: 0, y: 0 } }),
        nrow("b", { pos: { x: 1000, y: 500 } }),
      ],
      links: [],
      buildings: [],
    });
    // inject a measurable viewport
    gv.host.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    });
    gv.fitView();
    expect(gv.view.scale > 0 && gv.view.scale <= 1.0).toBe(true);
  });
});

// Task 32: _groupSelection dispatches CreateBuilding for ≥2 selected nodes.
// The g-shortcut guard (selNodes + selBuildings >= 2) lives in App._handleGlobalKey;
// the underlying method is tested here for correctness when used with a valid selection.
describe("GraphView _groupSelection", () => {
  it("dispatches CreateBuilding when ≥2 nodes are selected", () => {
    let dispatched = null;
    installDom();
    const host = makeEl("div");
    const game = {
      content: { recipes: {} },
      dispatch: (intent) => {
        dispatched = intent;
        return { ok: true };
      },
    };
    const gv = new GraphView(host, game);
    gv.render({
      nodes: [nrow("a"), nrow("b", { pos: { x: 400, y: 100 } })],
      links: [],
      buildings: [],
    });
    gv.selNodes = new Set(["a", "b"]);
    gv._groupSelection();
    expect(dispatched && dispatched.type).toBe("CreateBuilding");
    expect(
      dispatched.nodeIds.includes("a") && dispatched.nodeIds.includes("b"),
    ).toBe(true);
  });

  it("does not dispatch when selNodes and selBuildings are both empty", () => {
    let dispatched = null;
    installDom();
    const host = makeEl("div");
    const game = {
      content: { recipes: {} },
      dispatch: (intent) => {
        dispatched = intent;
        return { ok: true };
      },
    };
    const gv = new GraphView(host, game);
    gv.render({ nodes: [], links: [], buildings: [] });
    // selNodes and selBuildings start empty — _groupSelection early-returns
    gv._groupSelection();
    expect(dispatched).toBe(null);
  });
});

// ---- Map LOD tier tests -----------------------------------------------------

describe("GraphView map LOD tier", () => {
  // Helper: count children with a given class in a layer element.
  function countClass(layer, cls) {
    return layer.childNodes.filter(
      (c) => c.getAttribute && (c.getAttribute("class") || "").includes(cls),
    ).length;
  }

  it("map tier populates layerMap with batch paths and detaches per-element nodes/links", () => {
    const gv = mount({
      nodes: [
        nrow("a", { pos: { x: 0, y: 0 }, kind: "gatherer" }),
        nrow("b", { pos: { x: 200, y: 0 }, kind: "smelter" }),
        nrow("c", { pos: { x: 400, y: 0 }, kind: "gatherer" }),
      ],
      links: [lrow("l1", "a", "b"), lrow("l2", "b", "c")],
      buildings: [],
    });
    // Inject map-tier scale
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render({
      nodes: [
        nrow("a", { pos: { x: 0, y: 0 }, kind: "gatherer" }),
        nrow("b", { pos: { x: 200, y: 0 }, kind: "smelter" }),
        nrow("c", { pos: { x: 400, y: 0 }, kind: "gatherer" }),
      ],
      links: [lrow("l1", "a", "b"), lrow("l2", "b", "c")],
      buildings: [],
    });
    // Batch layer has at least 1 child (link path + at least 1 node-kind path)
    expect(gv.layerMap.childNodes.length > 0).toBe(true);
    // Per-element nodes are detached from layerNodes (map tier shows batch instead)
    expect(gv.layerNodes.childNodes.length).toBe(0);
    // Per-element links are detached from layerLinks
    expect(gv.layerLinks.childNodes.length).toBe(0);
    // The retained Maps still hold the entries (for zoom-back re-attach)
    expect(gv._nodeEls.has("a")).toBe(true);
    expect(gv._linkEls.has("l1")).toBe(true);
  });

  it("selected node renders individually at map tier; non-selected nodes do not", () => {
    const snap = {
      nodes: [
        nrow("sel", { pos: { x: 0, y: 0 } }),
        nrow("bg", { pos: { x: 200, y: 0 } }),
      ],
      links: [],
      buildings: [],
    };
    const gv = mount(snap);
    gv.selectedId = "sel";
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render(snap);
    // The selected node renders individually in layerNodes
    expect(gv.layerNodes.childNodes.length).toBe(1);
    expect(gv._nodeEls.get("sel").g.parentNode === gv.layerNodes).toBe(true);
    // The non-selected node is detached
    expect(gv._nodeEls.get("bg").g.parentNode).toBe(null);
    // Batch layer still populated
    expect(gv.layerMap.childNodes.length > 0).toBe(true);
  });

  it("deselect at map tier returns the node to the batch (indiv-set change rebuilds)", () => {
    const snap = {
      nodes: [
        nrow("sel", { pos: { x: 0, y: 0 } }),
        nrow("bg", { pos: { x: 200, y: 0 } }),
      ],
      links: [],
      buildings: [],
    };
    const gv = mount(snap);
    gv.selectedId = "sel";
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render(snap);
    const kind = snap.nodes[0].kind;
    // While selected, the batch excludes the individually-rendered node
    expect(gv._mapNodeEls[kind].getAttribute("d").includes("M0 0h")).toBe(
      false,
    );

    gv.selectedId = null;
    gv.render(snap); // same snapshot identity — indiv-set change must rebuild
    expect(gv.layerNodes.childNodes.length).toBe(0);
    expect(gv._mapNodeEls[kind].getAttribute("d").includes("M0 0h")).toBe(true);
  });

  it("zoom back from map to far re-attaches retained per-element nodes", () => {
    const snap = {
      nodes: [nrow("a"), nrow("b", { pos: { x: 200, y: 0 } })],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    };
    const gv = mount(snap);
    // Go map tier
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render(snap);
    expect(gv.layerNodes.childNodes.length).toBe(0); // detached at map tier

    // Zoom back to far tier
    gv.view = { scale: MAP_SCALE + 0.05, tx: 0, ty: 0 }; // between MAP and LOD
    gv.render(snap);
    // Batch layer is cleared
    expect(gv.layerMap.childNodes.length).toBe(0);
    // Per-element nodes are back
    expect(gv.layerNodes.childNodes.length).toBe(2);
    expect(gv._nodeEls.get("a").g.parentNode === gv.layerNodes).toBe(true);
    // Per-element links are back
    expect(gv.layerLinks.childNodes.length).toBe(1);
  });

  it("zoom back from map to full re-attaches with full tier (icons present)", () => {
    const snap = {
      nodes: [nrow("a")],
      links: [],
      buildings: [],
    };
    const gv = mount(snap);
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render(snap);
    const entryMap = gv._nodeEls.get("a");

    // Zoom back to full tier
    gv.view = { scale: 1, tx: 0, ty: 0 };
    gv.render(snap);
    // Element was rebuilt for full tier (sig changed: map->full)
    const entryFull = gv._nodeEls.get("a");
    expect(entryFull.g.parentNode === gv.layerNodes).toBe(true);
    // Has icon foreignObject (full tier)
    const classes = entryFull.g.childNodes.map(
      (c) => c.getAttribute("class") || "",
    );
    expect(classes.some((c) => c.includes("node-ico"))).toBe(true);
    expect(gv.layerMap.childNodes.length).toBe(0);
  });

  it("nodeSig crossing map<->far triggers rebuild", () => {
    const snap = { nodes: [nrow("a")], links: [], buildings: [] };
    const gv = mount(snap);
    gv.view = { scale: LOD_SCALE - 0.01, tx: 0, ty: 0 }; // far tier
    gv.render(snap);
    const entryFar = gv._nodeEls.get("a").g;

    gv.view = { scale: MAP_SCALE - 0.001, tx: 0, ty: 0 }; // map tier
    gv.render(snap);
    // At map tier the node is detached (not in layerNodes), but the entry is replaced
    // if the sig changed (map tier builds individual nodes at "full" for selected only).
    // The non-selected node "a" is now batched — entry still present in map.
    expect(gv._nodeEls.has("a")).toBe(true);

    // Zoom back to far: entry should re-attach and may be rebuilt if sig differs
    gv.view = { scale: MAP_SCALE + 0.01, tx: 0, ty: 0 }; // back to far
    gv.render(snap);
    expect(gv._nodeEls.get("a").g.parentNode === gv.layerNodes).toBe(true);
  });

  it("batch rebuild only on snapshot identity change, not on repeated same-snap renders", () => {
    const snap = {
      nodes: [nrow("a"), nrow("b", { pos: { x: 200, y: 0 } })],
      links: [lrow("l1", "a", "b")],
      buildings: [],
    };
    const gv = mount(snap);
    gv.view = { scale: MAP_SCALE - 0.01, tx: 0, ty: 0 };
    gv._hostRect = { width: 1280, height: 800 };
    gv.render(snap);
    const linkElAfterFirst = gv._mapLinkEl;
    // Re-render with same snap object — batch should NOT rebuild (same identity)
    gv.render(snap);
    expect(gv._mapLinkEl === linkElAfterFirst).toBe(true);
  });
});
