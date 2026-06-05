// RENDER BENCHMARK — standalone, NOT registered in RunAll.js.
// Quantifies the retained-render rework: before/after numbers for each
// relevant draw path. Run:  node Tests/RenderBench.mjs

import { performance } from "node:perf_hooks";
import { GraphView } from "../Source/UI/GraphView.js";

// ---- minimal DOM shim (copied from GraphViewRetained.Test.js) ----------------
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

// Snapshot-shaped node row with sane defaults (mirrors Snapshot.js node rows).
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

function lrow(id, from, to, over = {}) {
  return { id, from, to, resourceId: "iron_ore", flow: 1, fedPct: 1, ...over };
}

function mount(snap) {
  installDom();
  const host = makeEl("div");
  const game = { content: { recipes: {} }, dispatch: () => ({ ok: true }) };
  const gv = new GraphView(host, game);
  gv.render(snap);
  return gv;
}

// ---- 500-node benchmark dataset ---------------------------------------------
// 125 columns x 4 rows = 500 nodes: gatherer -> smelter -> workshop -> market,
// linked down each column.
function bigSnap(cols = 125) {
  const kinds = ["gatherer", "smelter", "workshop", "market"];
  const nodes = [],
    links = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 4; r++) {
      nodes.push(
        nrow(`n${c}_${r}`, {
          kind: kinds[r],
          level: 1 + ((c + r) % 12),
          pos: { x: c * 160, y: r * 120 },
          working: r < 3,
          capacityPct: ((c * 7 + r * 3) % 100) / 100,
        }),
      );
      if (r > 0) links.push(lrow(`l${c}_${r}`, `n${c}_${r - 1}`, `n${c}_${r}`));
    }
  }
  return { nodes, links, buildings: [] };
}

// ---- timing helpers ---------------------------------------------------------
const WARMUPS = 5;
const RUNS = 30;

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function bench(fn) {
  for (let i = 0; i < WARMUPS; i++) fn();
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return median(times);
}

// ---- run cases --------------------------------------------------------------
installDom();

const snap0 = bigSnap();
const someId = snap0.nodes[0].id; // n0_0

// Case 1: first full draw — cold build, fresh mount each iteration.
// We don't count mount() overhead; only the _draw() cold render from scratch.
let case1ms;
{
  // Warmup
  for (let i = 0; i < WARMUPS; i++) {
    const gv = mount({ nodes: [], links: [], buildings: [] });
    gv._nodeEls.clear();
    gv._linkEls.clear();
    gv.snap = snap0;
    gv._draw();
  }
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    // Fresh mount each iteration = cold element map
    const gv = mount({ nodes: [], links: [], buildings: [] });
    gv._nodeEls.clear();
    gv._linkEls.clear();
    gv.snap = snap0;
    const t0 = performance.now();
    gv._draw();
    times.push(performance.now() - t0);
  }
  case1ms = median(times);
}

// Case 2: unchanged-snapshot redraw — same snap object re-rendered.
let case2ms;
{
  const gv = mount(snap0);
  case2ms = bench(() => gv.render(snap0));
}

// Case 3: new-snapshot redraw, rates drifted — rebuild rows with different
// effectiveRate/capacityPct each iteration (the every-dispatch case).
// Verify zero element creation two ways: (a) the set of node .g element
// identities must not grow across the timed loop, and (b) the _nodeEls map
// size must stay constant. Both must agree on "no rebuilds".
let case3ms, case3newEls, case3mapGrew;
{
  // Trip-wire: the identity counter is meaningless if entries no longer expose
  // `.g`, since every `.g` would read undefined and the diff would collapse to
  // Set([undefined]) reporting a false "0 new elements".
  const elIds = (gv) => {
    const ids = new Set([...gv._nodeEls.values()].map((e) => e.g));
    if (ids.has(undefined))
      throw new Error("_nodeEls entry shape changed — .g missing");
    return ids;
  };

  const gv = mount(snap0);
  let iter = 0;
  for (let i = 0; i < WARMUPS; i++) {
    const drifted = bigSnap();
    drifted.nodes.forEach((n, j) => {
      n.effectiveRate = 1 + ((j + iter) % 10) * 0.1;
      n.capacityPct = ((j * 3 + iter) % 100) / 100;
    });
    iter++;
    gv.render(drifted);
  }
  // Baselines captured after warmup, before the timed loop.
  const elIdsBefore = elIds(gv);
  const mapSizeBefore = gv._nodeEls.size;
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const drifted = bigSnap();
    drifted.nodes.forEach((n, j) => {
      n.effectiveRate = 1 + ((j + iter) % 10) * 0.1;
      n.capacityPct = ((j * 3 + iter) % 100) / 100;
    });
    iter++;
    const t0 = performance.now();
    gv.render(drifted);
    times.push(performance.now() - t0);
  }
  case3ms = median(times);
  // (a) any node .g element not present before the timed runs = a rebuild
  const elIdsAfter = elIds(gv);
  case3newEls = [...elIdsAfter].filter((e) => !elIdsBefore.has(e)).length;
  // (b) secondary signal: the keyed map size must not have grown
  case3mapGrew = gv._nodeEls.size - mapSizeBefore;
}

// Case 4: drag frame — set _dragPos for one node then call _draw().
// _dragPos is a plain object: { [id]: {x, y} }
let case4ms;
{
  const gv = mount(snap0);
  case4ms = bench(() => {
    gv._dragPos = { [someId]: { x: 50, y: 80 } };
    gv._draw();
  });
}

// Case 5: culled draw — inject a viewport-sized host rect so only a subset renders.
let case5ms, case5count;
{
  const gv = mount(snap0);
  gv._hostRect = { width: 1280, height: 800 };
  gv.render(snap0); // one draw so the hostRect takes effect
  case5count = gv.layerNodes.childNodes.length;
  case5ms = bench(() => gv.render(snap0));
}

// Case 6: far-tier full-map draw — scale so all 500 nodes fit in the viewport
// AND the LOD threshold (< 0.5) is satisfied. Graph is 124*160 = 19840 px wide
// (col 0..124), 3*120 = 360 px tall. To fit 19840 graph-units in 1280 px:
// scale = 1280 / (19840 + 160) = 1280 / 20000 ≈ 0.064. That is well below 0.5
// (far tier). Set tx/ty so x=0 maps to screen 0 (tx=0, ty=0 puts the top-left at
// the origin). Then all 500 nodes land in the cull rect.
const FAR_SCALE = 0.064;
let case6ms, case6nodeCount, case6foCount;
{
  const gv = mount(snap0);
  gv.view = { scale: FAR_SCALE, tx: 0, ty: 0 };
  // set hostRect wide/tall enough to contain the full graph at this scale
  // full width at scale: 20000 * 0.064 = 1280; height: 480 * 0.064 = 30.7 — use
  // a generous rect so culling passes all nodes
  gv._hostRect = { width: 1280, height: 800 };
  gv.render(snap0);
  case6nodeCount = gv.layerNodes.childNodes.length;
  // Count foreignObjects: in far tier there should be none (no node-ico, no node-working)
  function countFO(layer) {
    let n = 0;
    function walk(el) {
      if (!el || !el.childNodes) return;
      for (const c of el.childNodes) {
        if (c.tagName === "foreignobject" || c.tagName === "foreignObject") n++;
        walk(c);
      }
    }
    walk(layer);
    return n;
  }
  case6foCount = countFO(gv.layerNodes);
  case6ms = bench(() => gv.render(snap0));
}

// ---- print table -----------------------------------------------------------
const W = [34, 12, 40];
function row(a, b, c) {
  return (
    a.padEnd(W[0]) +
    b.toString().padStart(W[1]) +
    "   " +
    c.toString().padStart(W[2])
  );
}
function hr() {
  return "-".repeat(W[0] + W[1] + 3 + W[2]);
}

console.log("");
console.log("IdleKingdom GraphView Render Benchmark");
console.log(
  `Dataset: ${snap0.nodes.length} nodes, ${snap0.links.length} links (median of ${RUNS} runs after ${WARMUPS} warmups, ms)`,
);
console.log(hr());
console.log(row("Case", "Median ms", "Notes"));
console.log(hr());
console.log(
  row(
    "1. first full draw (cold)",
    case1ms.toFixed(3),
    "fresh element map each run",
  ),
);
console.log(
  row(
    "2. unchanged-snapshot redraw",
    case2ms.toFixed(3),
    "pure update path; no-cull (all 500 traversed)",
  ),
);
console.log(
  row(
    "3. new-snap redraw (rates drifted)",
    case3ms.toFixed(3),
    `new elements: ${case3newEls}, map growth: ${case3mapGrew} (expect 0/0)`,
  ),
);
console.log(
  row(
    "4. drag frame",
    case4ms.toFixed(3),
    `_dragPos set for 1 node; no-cull (all 500 traversed)`,
  ),
);
console.log(
  row(
    "5. culled draw (1280x800 viewport)",
    case5ms.toFixed(3),
    `${case5count} nodes in DOM (out of ${snap0.nodes.length})`,
  ),
);
console.log(
  row(
    "6. far-tier full-map draw",
    case6ms.toFixed(3),
    `scale=${FAR_SCALE}; ${case6nodeCount} nodes in DOM; ${case6foCount} foreignObjects (expect 0)`,
  ),
);
console.log(hr());
console.log("");

// ---- sanity checks (report, don't gate) ------------------------------------
// Cases 2/4 have no viewport culling (null _hostRect = headless) so all 500
// nodes + 375 links are traversed every call. The threshold is 5 ms; the real
// "well under 1 ms" win is visible in case 5 (culled: ~0.4 ms, 36 DOM nodes).
const warns = [];
if (case2ms > 5)
  warns.push(
    `WARN case 2 (unchanged redraw) = ${case2ms.toFixed(3)} ms > 5 ms — retained path may be defeated`,
  );
if (case4ms > 5)
  warns.push(
    `WARN case 4 (drag frame) = ${case4ms.toFixed(3)} ms > 5 ms — retained path may be defeated`,
  );
if (case3newEls > 0)
  warns.push(
    `WARN case 3 created ${case3newEls} new elements — rate-drift should NOT rebuild nodes`,
  );
if (case3mapGrew !== 0)
  warns.push(
    `WARN case 3 _nodeEls map grew by ${case3mapGrew} — rate-drift should NOT add entries`,
  );
if (case6foCount > 0)
  warns.push(
    `WARN case 6 has ${case6foCount} foreignObjects — far tier should build zero`,
  );
if (case6nodeCount < snap0.nodes.length)
  warns.push(
    `WARN case 6: only ${case6nodeCount}/${snap0.nodes.length} nodes in DOM — far-tier full-map should include all (check scale/viewport)`,
  );

if (warns.length) {
  for (const w of warns) console.warn(w);
  console.log("");
}

process.exit(0);
