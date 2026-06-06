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

// ---- benchmark dataset builder ----------------------------------------------
// cols × 4 rows = cols*4 nodes: gatherer -> smelter -> workshop -> market,
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

// Case 6: map-tier batch draw — scale so all 500 nodes are in the map tier
// (< MAP_SCALE = 0.15). Scale 0.064 puts the 20000-unit-wide graph in 1280px.
// At map tier: per-element nodes are detached, batch paths populate layerMap.
// This case measures the batch rebuild cost + simulated pan (transform-only).
const MAP_TIER_SCALE = 0.064;
let case6ms, case6nodeCount, case6mapBatchCount, case6foCount;
{
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
  const gv = mount(snap0);
  gv.view = { scale: MAP_TIER_SCALE, tx: 0, ty: 0 };
  gv._hostRect = { width: 1280, height: 800 };
  gv.render(snap0);
  case6nodeCount = gv.layerNodes.childNodes.length; // should be 0 (all batched)
  case6mapBatchCount = gv.layerMap.childNodes.length; // link path + kind paths
  case6foCount = countFO(gv.layerNodes);
  case6ms = bench(() => gv.render(snap0)); // same snap: batch NOT rebuilt, just re-appended
}

// ---- 1500-node cases --------------------------------------------------------
const snap1500 = bigSnap(375); // 375 cols x 4 rows = 1500 nodes, 1125 links
let case7ms, case7mapMs;
{
  // Case 7a: map-tier cold batch build at 1500 nodes
  const gv = mount(snap1500);
  gv.view = { scale: 0.02, tx: 0, ty: 0 }; // deep zoom = map tier
  gv._hostRect = { width: 1280, height: 800 };
  // First render (cold build)
  gv.render(snap1500);
  // Timed: same-snap re-render (batch stable, no rebuild)
  case7ms = bench(() => gv.render(snap1500));

  // Case 7b: batch rebuild cost (new snapshot each iteration)
  let iter = 0;
  case7mapMs = bench(() => {
    const s = bigSnap(375);
    s.nodes.forEach((n, j) => {
      n.effectiveRate = 1 + ((j + iter) % 10) * 0.1;
    });
    iter++;
    gv.render(s);
  });
}

// ---- 3000-node cases --------------------------------------------------------
const snap3000 = bigSnap(750); // 750 cols x 4 rows = 3000 nodes, 2250 links
let case8ms, case8mapMs;
{
  // Case 8a: map-tier stable re-render at 3000 nodes
  const gv = mount(snap3000);
  gv.view = { scale: 0.01, tx: 0, ty: 0 }; // deep zoom = map tier
  gv._hostRect = { width: 1280, height: 800 };
  gv.render(snap3000);
  case8ms = bench(() => gv.render(snap3000));

  // Case 8b: batch rebuild cost (new snapshot each iteration)
  let iter = 0;
  case8mapMs = bench(() => {
    const s = bigSnap(750);
    s.nodes.forEach((n, j) => {
      n.effectiveRate = 1 + ((j + iter) % 10) * 0.1;
    });
    iter++;
    gv.render(s);
  });
}

// ---- print table -----------------------------------------------------------
const W = [42, 12, 38];
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
console.log(`(median of ${RUNS} runs after ${WARMUPS} warmups, ms)`);
console.log(hr());
console.log(row("Case", "Median ms", "Notes"));
console.log(hr());
console.log(
  row(
    "1. first full draw (cold, 500n)",
    case1ms.toFixed(3),
    "fresh element map each run",
  ),
);
console.log(
  row(
    "2. unchanged-snapshot redraw (500n)",
    case2ms.toFixed(3),
    "pure update; no-cull (all 500 traversed)",
  ),
);
console.log(
  row(
    "3. new-snap redraw rates-drift (500n)",
    case3ms.toFixed(3),
    `new els: ${case3newEls}, map growth: ${case3mapGrew} (expect 0/0)`,
  ),
);
console.log(
  row(
    "4. drag frame (500n)",
    case4ms.toFixed(3),
    "_dragPos 1 node; no-cull (all 500 traversed)",
  ),
);
console.log(
  row(
    "5. culled draw 1280x800 (500n)",
    case5ms.toFixed(3),
    `${case5count} nodes in DOM (out of ${snap0.nodes.length})`,
  ),
);
console.log(
  row(
    "6. MAP-tier stable re-render (500n)",
    case6ms.toFixed(3),
    `scale=${MAP_TIER_SCALE}; ${case6nodeCount} indiv nodes; ${case6mapBatchCount} batch els; ${case6foCount} FOs`,
  ),
);
console.log(hr());
console.log(
  row(
    "7a. MAP-tier stable re-render (1500n)",
    case7ms.toFixed(3),
    "same snap — no batch rebuild",
  ),
);
console.log(
  row(
    "7b. MAP-tier batch rebuild (1500n)",
    case7mapMs.toFixed(3),
    "new snap each call — full batch rebuild",
  ),
);
console.log(
  row(
    "8a. MAP-tier stable re-render (3000n)",
    case8ms.toFixed(3),
    "same snap — no batch rebuild",
  ),
);
console.log(
  row(
    "8b. MAP-tier batch rebuild (3000n)",
    case8mapMs.toFixed(3),
    "new snap each call — full batch rebuild",
  ),
);
console.log(hr());
console.log("");

// ---- sanity checks (report, don't gate) ------------------------------------
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
    `WARN case 6 has ${case6foCount} foreignObjects — map tier should build zero`,
  );
if (case6nodeCount > 0)
  warns.push(
    `WARN case 6: ${case6nodeCount} individual nodes in DOM at map tier — expect 0 (no selection)`,
  );
if (case6mapBatchCount === 0)
  warns.push(
    `WARN case 6: layerMap is empty at map tier — batch layer should be populated`,
  );

if (warns.length) {
  for (const w of warns) console.warn(w);
  console.log("");
}

process.exit(0);
