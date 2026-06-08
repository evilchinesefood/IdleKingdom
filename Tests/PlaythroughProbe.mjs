// END-TO-END PLAY-SESSION PROBE (standalone; NOT registered in RunAll.js).
//
// Drives the REAL UI layer under a minimal DOM/window/localStorage shim:
// for each step it builds a snapshot, renders the actual exported panel via its
// real render function, FINDS the control the panel rendered, and fires that
// control's own click/change handler (the strongest check). Where a control is
// driven via its rendered handler we log "[click]"; where a step necessarily
// dispatches the wired intent directly (e.g. the SVG drag-connect path or a
// programmatic clock fast-forward) we log "[wired]".
//
// Run:  node Tests/PlaythroughProbe.mjs

// ----------------------------------------------------------------------------
// Minimal DOM shim
// ----------------------------------------------------------------------------
const SVG_NS = "http://www.w3.org/2000/svg";

class FakeEl {
  constructor(tag, ns) {
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag).toLowerCase();
    this.namespaceURI = ns || null;
    this.childNodes = []; // text + element nodes, in order
    this.attributes = {}; // name -> string
    this.dataset = {};
    this.textContent = "";
    this.style = {};
    this.parentNode = null;
    this._listeners = {};
    this.__props = undefined;
    // event-handler props (onclick/onchange/etc) live as own properties
  }
  // patch()/create() rely on `children` being ELEMENT children only.
  get children() {
    return this.childNodes.filter((c) => c.nodeType !== 3);
  }
  get nodeType() {
    return this.tagName === "#TEXT" ? 3 : 1;
  }
  get className() {
    return this.attributes["class"] || "";
  }
  set className(v) {
    this.attributes["class"] = String(v);
  }
  get classList() {
    const self = this;
    return {
      add: (c) => {
        const s = new Set(
          (self.attributes["class"] || "").split(/\s+/).filter(Boolean),
        );
        s.add(c);
        self.attributes["class"] = [...s].join(" ");
      },
      remove: (c) => {
        const s = new Set(
          (self.attributes["class"] || "").split(/\s+/).filter(Boolean),
        );
        s.delete(c);
        self.attributes["class"] = [...s].join(" ");
      },
      contains: (c) =>
        (self.attributes["class"] || "").split(/\s+/).includes(c),
    };
  }
  get id() {
    return this.attributes["id"] || "";
  }
  set id(v) {
    this.attributes["id"] = String(v);
  }
  get innerHTML() {
    return "";
  }
  set innerHTML(v) {
    if (v === "") {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
    }
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "data-key") this.dataset.key = String(v);
    if (k.startsWith("data-")) this.dataset[k.slice(5)] = String(v);
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === "data-key") delete this.dataset.key;
  }
  addEventListener(t, fn) {
    this._listeners[t] = fn;
  }
  removeEventListener(t) {
    delete this._listeners[t];
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (c.parentNode === this) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
    } else if (c.parentNode) {
      c.parentNode.removeChild(c);
    }
    c.parentNode = this;
    if (!ref) {
      this.childNodes.push(c);
    } else {
      const i = this.childNodes.indexOf(ref);
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
    }
    return c;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    };
  }
  // --- selector engine (supports tag, .class, #id, [attr], [attr="v"], descendant) ---
  _matchSimple(sel) {
    sel = sel.trim();
    if (!sel) return false;
    // split into the leaf compound (tag/.class/#id/[attr]) — no combinators here
    let tag = null;
    const classes = [];
    const attrs = [];
    let id = null;
    const re = /([.#]?[\w-]+|\[[^\]]+\])/g;
    let m;
    while ((m = re.exec(sel))) {
      const tok = m[1];
      if (tok.startsWith(".")) classes.push(tok.slice(1));
      else if (tok.startsWith("#")) id = tok.slice(1);
      else if (tok.startsWith("[")) attrs.push(tok.slice(1, -1));
      else tag = tok;
    }
    if (tag && this.localName !== tag.toLowerCase()) return false;
    if (id && this.id !== id) return false;
    for (const c of classes) if (!this.classList.contains(c)) return false;
    for (const a of attrs) {
      const eq = a.indexOf("=");
      if (eq < 0) {
        if (!(a in this.attributes)) return false;
      } else {
        const key = a.slice(0, eq);
        let val = a.slice(eq + 1).replace(/^["']|["']$/g, "");
        if (this.getAttribute(key) !== val) return false;
      }
    }
    return true;
  }
  _allEls() {
    const out = [];
    for (const c of this.childNodes) {
      if (c.nodeType === 3) continue;
      out.push(c);
      out.push(...c._allEls());
    }
    return out;
  }
  querySelectorAll(selector) {
    // support comma groups + a single descendant combinator (space)
    const groups = selector.split(",").map((s) => s.trim());
    const all = this._allEls();
    const matched = [];
    for (const g of groups) {
      const parts = g.split(/\s+/).filter(Boolean);
      const leaf = parts[parts.length - 1];
      const ancestors = parts.slice(0, -1);
      for (const el of all) {
        if (!el._matchSimple(leaf)) continue;
        // check ancestor chain (loose: each ancestor sel must match some ancestor)
        let ok = true;
        let cursor = el.parentNode;
        for (let ai = ancestors.length - 1; ai >= 0; ai--) {
          let found = false;
          let p = cursor;
          while (p) {
            if (p._matchSimple && p._matchSimple(ancestors[ai])) {
              found = true;
              cursor = p.parentNode;
              break;
            }
            p = p.parentNode;
          }
          if (!found) {
            ok = false;
            break;
          }
        }
        if (ok && !matched.includes(el)) matched.push(el);
      }
    }
    return matched;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  // text content of the whole subtree (for assertions)
  get text() {
    if (this.nodeType === 3) return this.textContent;
    return this.childNodes.map((c) => c.text).join("");
  }
}

function makeTextNode(t) {
  const e = new FakeEl("#text");
  e.textContent = String(t);
  return e;
}

const documentShim = {
  createElement: (t) => new FakeEl(t, null),
  createElementNS: (ns, t) => new FakeEl(t, ns),
  createTextNode: makeTextNode,
  addEventListener: () => {},
  removeEventListener: () => {},
  hidden: false,
  getElementById: () => null,
  body: new FakeEl("body"),
};

const localStorageShim = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => new Map(map),
    _load: (m) => {
      map.clear();
      for (const [k, v] of m) map.set(k, v);
    },
  };
})();

const windowShim = {
  location: { hash: "", pathname: "/" },
  // History API shim: the real Router.navigate() calls history.pushState; record
  // the pathname so parsePath round-trips (no real browser history stack needed).
  history: {
    pushState: (_s, _t, url) => {
      if (url != null) windowShim.location.pathname = String(url);
    },
    replaceState: (_s, _t, url) => {
      if (url != null) windowShim.location.pathname = String(url);
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: localStorageShim,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  navigator: { serviceWorker: undefined },
};

globalThis.document = documentShim;
globalThis.window = windowShim;
globalThis.localStorage = localStorageShim;
globalThis.requestAnimationFrame = windowShim.requestAnimationFrame;

// ----------------------------------------------------------------------------
// Imports (after shims installed; modules read `document`/`window` at runtime)
// ----------------------------------------------------------------------------
const { Game } = await import("../Source/Engine/Game.js");
const { FakeClock } = await import("../Source/Engine/Clock.js");
const { MemoryStorageAdapter } =
  await import("../Source/Engine/Persistence/MemoryStorageAdapter.js");
const { LocalStorageAdapter } =
  await import("../Source/Engine/Persistence/LocalStorageAdapter.js");
const { serialize, deserialize, SAVE_KEY } =
  await import("../Source/Engine/Persistence/SaveManager.js");
const { content } = await import("../Source/Engine/Content/Content.js");
const { build: buildSnapshot } = await import("../Source/Engine/Snapshot.js");
const { solve } = await import("../Source/Engine/Simulation/RateSolver.js");
const { TERRITORIES } = await import("../Source/Engine/Content/Territories.js");
const { applyOffline } = await import("../Source/Engine/Simulation/Offline.js");

const { ResearchTree } = await import("../Source/UI/ResearchTree.js");
const { BuildMenu } = await import("../Source/UI/BuildMenu.js");
const { NodeInspector } = await import("../Source/UI/NodeInspector.js");
const { WarBoard } = await import("../Source/UI/WarBoard.js");
const { Victory } = await import("../Source/UI/Victory.js");
const { victoryReady } = await import("../Source/UI/Logic/Selectors.js");
const { OfflineSummary } = await import("../Source/UI/OfflineSummary.js");
const { Tooltip } = await import("../Source/UI/Tooltip.js");
const { Hud } = await import("../Source/UI/Hud.js");
const { Router } = await import("../Source/UI/Router.js");
const { GraphView } = await import("../Source/UI/GraphView.js");
const { patch } = await import("../Source/UI/Render/Dom.js");

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------
const results = [];
let curStep = 0;
let curName = "";
const fails = [];

function step(n, name, fn) {
  curStep = n;
  curName = name;
  try {
    fn();
    results.push({ n, name, pass: true });
    console.log(`STEP ${n} PASS — ${name}`);
  } catch (err) {
    results.push({ n, name, pass: false, err: err.message });
    fails.push({ n, name, err: err.message });
    console.log(`STEP ${n} FAIL — ${name}\n    -> ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Render a panel vnode into a fresh host element via the real patch(), return host.
function renderPanel(vnode) {
  const host = new FakeEl("div");
  patch(host, [vnode], documentShim);
  return host;
}

// Build the live snapshot the UI would consume this frame.
function snap(game) {
  const st = game.getState();
  if (!st._solved) st._solved = solve(st, content);
  return buildSnapshot(st, st._solved, content, null);
}

// dispatch wrapper used as the panel's `dispatch` arg; records the last intent.
function recordingDispatch(game) {
  const d = (intent) => {
    d.last = intent;
    d.lastResult = game.dispatch(intent);
    return d.lastResult;
  };
  return d;
}

// The live game now starts with an EMPTY graph — the player builds everything.
// Drive the exact intents the UI would fire to construct the classic
// Mine -> Smelt -> Market chain (PlaceNode x3 + ConnectLink x2; placing is free).
// Then canonicalize the new node/link ids + seed positions so the rest of the
// probe can keep referring to n_miner_0 / n_smelter_0 / n_market_0 by name.
function buildSeedChain(game) {
  const d = recordingDispatch(game);
  const ids = [];
  const place = (kind, extra, pos) => {
    const before = game.getState().graph.nodes.length;
    const r = d({ type: "PlaceNode", kind, pos, ...extra });
    assert(r.ok, `PlaceNode ${kind} rejected: ${r.error}`);
    assert(
      game.getState().graph.nodes.length === before + 1,
      `PlaceNode ${kind} did not add a node`,
    );
    const id = game.getState().graph.nodes.slice(-1)[0].id;
    ids.push(id);
    return id;
  };
  const minerId = place(
    "gatherer",
    { resourceId: "iron_ore" },
    { x: 120, y: 200 },
  );
  const smelterId = place(
    "smelter",
    { recipeId: "r_iron_bar" },
    { x: 360, y: 200 },
  );
  const marketId = place("market", {}, { x: 600, y: 200 });

  let r = d({
    type: "ConnectLink",
    from: minerId,
    to: smelterId,
    resourceId: "iron_ore",
  });
  assert(r.ok, `ConnectLink miner->smelter rejected: ${r.error}`);
  r = d({
    type: "ConnectLink",
    from: smelterId,
    to: marketId,
    resourceId: "iron_bar",
  });
  assert(r.ok, `ConnectLink smelter->market rejected: ${r.error}`);

  // Canonicalize ids/positions to the historical seed names so later steps that
  // address nodes by id (n_miner_0 etc.) keep working unchanged.
  const st = game.getState();
  const rename = {
    [minerId]: "n_miner_0",
    [smelterId]: "n_smelter_0",
    [marketId]: "n_market_0",
  };
  for (const n of st.graph.nodes) {
    if (rename[n.id]) n.id = rename[n.id];
  }
  st.graph.links.forEach((l, i) => {
    if (rename[l.from]) l.from = rename[l.from];
    if (rename[l.to]) l.to = rename[l.to];
    l.id = "l_" + i;
  });
  delete st._solved;
}

// ----------------------------------------------------------------------------
// Boot a game
// ----------------------------------------------------------------------------
const clock = new FakeClock(1_000_000);
const game = new Game({ content, clock });
game.bootstrap(new MemoryStorageAdapter());

// ============================================================================
// STEP 1 — build the Mine -> Smelt -> Market chain from an empty start, then
//          assert it produces ~2.0 gold/s and the HUD reflects gold ~50
// ============================================================================
step(
  1,
  "Build Mine->Smelt->Market via PlaceNode+ConnectLink; chain produces ~2.0 gold/s; HUD gold ~50",
  () => {
    // Brand-new game starts EMPTY — the player builds everything.
    const empty = snap(game);
    assert(
      empty.nodes.length === 0,
      `expected an empty start graph, got ${empty.nodes.length} nodes`,
    );

    // Drive the build intents the UI would fire (placing is free).
    buildSeedChain(game);
    console.log(
      "    [wired] PlaceNode x3 + ConnectLink x2 (built the seed chain from empty)",
    );

    const s0 = snap(game);
    // Seed Mine -> Smelt -> Market now present
    const kinds = s0.nodes.map((n) => n.kind).sort();
    assert(
      JSON.stringify(kinds) ===
        JSON.stringify(["gatherer", "market", "smelter"]),
      `seed graph kinds wrong: ${kinds}`,
    );
    assert(
      s0.nodes.length === 3,
      `expected 3 seed nodes, got ${s0.nodes.length}`,
    );
    assert(
      s0.links.length === 2,
      `expected 2 seed links, got ${s0.links.length}`,
    );

    // HUD renders gold ~50 (Snapshot.build is source; HUD reflects it)
    const router = { current: "factory" };
    const hudEl = new FakeEl("header");
    const hud = new Hud(hudEl, router);
    hud.render(s0);
    // Check the structured gold currency cell (text concatenation would abut the rate).
    assert(
      s0.currencyStrings.gold === "50",
      `snapshot gold string ${s0.currencyStrings.gold}, expected 50`,
    );
    const goldCell = hudEl.querySelectorAll(".hud-cur")[0];
    assert(goldCell, "HUD rendered no gold currency cell");
    const goldValText = goldCell.querySelector(".val").text;
    assert(
      goldValText.includes("50"),
      `HUD gold cell "${goldValText}" did not show 50`,
    );
    // HUD must render multiple currency cells + tabs (regression: "first child only" bug).
    // The war rework dropped Renown -> two currencies remain: Gold + Research.
    assert(
      hudEl.querySelectorAll(".hud-cur").length === 2,
      `HUD rendered ${hudEl.querySelectorAll(".hud-cur").length} currency cells (expected 2 — Gold + Research; first-child-only regression?)`,
    );
    // Tabs are now wa-tab[panel] inside the wa-tab-group (no <a>, no wa-tab-panel).
    // The war rework replaced expeditions/heroes with a single War tab.
    assert(
      hudEl.querySelectorAll(".hud-tabs wa-tab").length === 3,
      `HUD rendered ${hudEl.querySelectorAll(".hud-tabs wa-tab").length} tabs (expected 3 wa-tab)`,
    );
    for (const route of ["factory", "research", "war"]) {
      assert(
        hudEl.querySelector(`wa-tab[panel="${route}"]`),
        `HUD missing wa-tab for route "${route}"`,
      );
    }
    assert(
      hudEl.querySelectorAll("wa-tab-panel").length === 0,
      `HUD emitted ${hudEl.querySelectorAll("wa-tab-panel").length} wa-tab-panel (expected 0)`,
    );

    // The freshly-built chain sells iron_bar at the §7 baseline: 2.0 gold/s.
    assert(
      Math.abs(s0.rates.goldRate - 2.0) < 1e-9,
      `built chain gold rate ${s0.rates.goldRate}, expected 2.0`,
    );

    // A few ticks keep producing a positive gold rate.
    for (let i = 0; i < 10; i++) {
      clock.advance(50);
      game.tick(0.05);
    }
    const s1 = snap(game);
    assert(
      s1.rates.goldRate > 0,
      `gold rate not >0 after ticks: ${s1.rates.goldRate}`,
    );
  },
);

// ============================================================================
// STEP 2 — buy res_scholar via the ResearchTree control; workshop placeable
// ============================================================================
step(
  2,
  "Buy res_scholar via rendered ResearchTree button; workshop becomes placeable",
  () => {
    // ensure affordable: seed research currency so the seed economy isn't a gate
    game.getState().currencies.research = 50;
    delete game.getState()._solved;

    const dispatch = recordingDispatch(game);
    const host = renderPanel(ResearchTree(snap(game), dispatch));

    // find the res_scholar card's Research button and click it (real handler)
    const cards = host.querySelectorAll(".res-node");
    assert(
      cards.length === Object.keys(content.researchNodes).length,
      `ResearchTree rendered ${cards.length} cards (expected ${Object.keys(content.researchNodes).length})`,
    );
    // locate scholar card: it's the available one whose button says "Research"
    let scholarBtn = null;
    for (const c of host.querySelectorAll(".res-node.available .res-buy")) {
      // res_scholar is the only prereq-free node; it's the first available
      scholarBtn = c;
      break;
    }
    assert(scholarBtn, "no available research buy button rendered");
    assert(
      typeof scholarBtn.onclick === "function",
      "res-buy button has no onclick handler",
    );
    scholarBtn.onclick(); // [click] real rendered handler
    assert(
      dispatch.last && dispatch.last.type === "BuyResearch",
      `expected BuyResearch dispatched, got ${dispatch.last && dispatch.last.type}`,
    );
    assert(
      dispatch.last.nodeId === "res_scholar",
      `clicked button dispatched nodeId=${dispatch.last.nodeId}, expected res_scholar`,
    );

    // engine accepted -> workshop now placeable
    assert(
      game.getState().unlocks.researchOwned.includes("res_scholar"),
      "res_scholar not owned after click",
    );
    const s2 = snap(game);
    assert(
      s2.buildMenu.placeableMachines.includes("workshop"),
      `workshop not placeable after res_scholar; placeable=${s2.buildMenu.placeableMachines}`,
    );
    console.log("    [click] ResearchTree Research button");
  },
);

// ============================================================================
// STEP 3 — place Workshop + Scholar via BuildMenu; connect via GraphView;
//          upgrade via NodeInspector. Each intent accepted, snapshot updates.
// ============================================================================
step(
  3,
  "Place Workshop+Scholar (BuildMenu), connect (GraphView), upgrade (NodeInspector)",
  () => {
    game.getState().currencies.gold = 5000; // afford upgrade
    delete game.getState()._solved;

    // --- Place a Workshop via BuildMenu: select palette, click recipe button ---
    const dispatch = recordingDispatch(game);
    const ui = {
      selectedPaletteKind: "workshop",
      setPalette: (k) => (ui.selectedPaletteKind = k),
      spawnPos: () => ({ x: 480, y: 320 }),
    };
    const beforeNodes = game.getState().graph.nodes.length;
    let host = renderPanel(BuildMenu(snap(game), dispatch, ui));
    // The popover now lists ALL recipes for the kind; locked (not-yet-unlocked)
    // ones are dimmed + inert (.locked). Click the first UNLOCKED one.
    const placeBtns = host
      .querySelectorAll(".bm-place")
      .filter((b) => !b.classList.contains("locked"));
    assert(
      placeBtns.length > 0,
      "BuildMenu rendered no unlocked workshop recipe buttons",
    );
    // r_parchment is the only workshop recipe unlocked after res_scholar
    placeBtns[0].onclick(); // [click]
    assert(
      dispatch.last.type === "PlaceNode" && dispatch.last.kind === "workshop",
      `expected PlaceNode workshop, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      game.getState().graph.nodes.length === beforeNodes + 1,
      "workshop node not added",
    );
    const workshopId = game.getState().graph.nodes.slice(-1)[0].id;

    // --- Place a Scholar via BuildMenu (scholar has no recipe/raw -> "Place scholar") ---
    ui.selectedPaletteKind = "scholar";
    host = renderPanel(BuildMenu(snap(game), dispatch, ui));
    const scholarPlace = host.querySelector(".bm-place");
    assert(scholarPlace, "BuildMenu rendered no scholar place button");
    const beforeScholar = game.getState().graph.nodes.length;
    scholarPlace.onclick(); // [click]
    assert(
      dispatch.last.type === "PlaceNode" && dispatch.last.kind === "scholar",
      `expected PlaceNode scholar, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      game.getState().graph.nodes.length === beforeScholar + 1,
      "scholar node not added",
    );
    const scholarId = game.getState().graph.nodes.slice(-1)[0].id;
    console.log("    [click] BuildMenu place buttons (workshop, scholar)");

    // --- Connect nodes via the GraphView connect path (real connect handler) ---
    // Connect seed miner -> the new workshop is invalid (recipe mismatch); instead
    // connect the seed smelter (outputs iron_bar) into ... no valid consumer.
    // Use GraphView._connect (the exact method GraphInput calls on a drag-connect)
    // to add miner(iron_ore) -> a fresh smelter. First place a 2nd smelter via engine-agnostic
    // BuildMenu so the connect has a valid target.
    ui.selectedPaletteKind = "smelter";
    host = renderPanel(BuildMenu(snap(game), dispatch, ui));
    const smBtns = host
      .querySelectorAll(".bm-place")
      .filter((b) => !b.classList.contains("locked"));
    assert(smBtns.length > 0, "no unlocked smelter recipe buttons");
    smBtns[0].onclick(); // place a smelter (r_iron_bar) [click]
    const newSmelterId = game.getState().graph.nodes.slice(-1)[0].id;

    // Build a GraphView and drive its connect path exactly as GraphInput would.
    const gvHost = new FakeEl("div");
    const gv = new GraphView(gvHost, game, {});
    gv.render(snap(game));
    const beforeLinks = game.getState().graph.links.length;
    // _connect(fromOutput, toInput) is the method GraphInput.onConnect invokes.
    gv._connect("n_miner_0", newSmelterId); // [wired] SVG drag-connect handler
    assert(
      game.getState().graph.links.length === beforeLinks + 1,
      "ConnectLink via GraphView._connect did not add a link",
    );
    const newLink = game.getState().graph.links.slice(-1)[0];
    assert(
      newLink.from === "n_miner_0" &&
        newLink.to === newSmelterId &&
        newLink.resourceId === "iron_ore",
      `connect produced wrong link: ${JSON.stringify(newLink)}`,
    );
    console.log(
      "    [wired] GraphView._connect (drag-connect path -> ConnectLink)",
    );

    // --- Upgrade a node via NodeInspector (real upgrade button handler) ---
    const niDispatch = recordingDispatch(game);
    const niHost = renderPanel(
      NodeInspector(snap(game), niDispatch, "n_miner_0"),
    );
    const upBtn = niHost.querySelector(".ni-upgrade");
    assert(upBtn, "NodeInspector rendered no upgrade button");
    assert(
      typeof upBtn.onclick === "function",
      "upgrade button has no onclick",
    );
    const lvlBefore = game
      .getState()
      .graph.nodes.find((n) => n.id === "n_miner_0").level;
    upBtn.onclick(); // [click]
    assert(
      niDispatch.last.type === "UpgradeNode" &&
        niDispatch.last.nodeId === "n_miner_0",
      `expected UpgradeNode n_miner_0, got ${JSON.stringify(niDispatch.last)}`,
    );
    const lvlAfter = game
      .getState()
      .graph.nodes.find((n) => n.id === "n_miner_0").level;
    assert(
      lvlAfter === lvlBefore + 1,
      `miner level did not rise (${lvlBefore}->${lvlAfter})`,
    );
    console.log("    [click] NodeInspector Upgrade button");
  },
);

// ============================================================================
// STEP 4 — climb research to res_armory; build chain; craft equipment;
//          sell yields gold + research tithe
// ============================================================================
step(
  4,
  "Climb research to res_armory via UI; equipment recipes craftable; Market sale yields gold+tithe",
  () => {
    game.getState().currencies.research = 100000;
    delete game.getState()._solved;

    // Buy the research spine by clicking the rendered ResearchTree button for each.
    const spine = [
      "res_lumber",
      "res_tannery",
      "res_coalworks",
      "res_steelmaking",
      "res_open_market",
      "res_smithing",
      "res_fittings",
      "res_armory",
    ];
    for (const id of spine) {
      const dispatch = recordingDispatch(game);
      const host = renderPanel(ResearchTree(snap(game), dispatch));
      // find the card whose buy handler dispatches this id
      let btn = null;
      for (const b of host.querySelectorAll(".res-node .res-buy")) {
        // probe handler target by reading the closure via a dry dispatch capture:
        // each card's onclick dispatches {nodeId:r.id}; we identify by clicking on
        // a recording dispatch that DOES NOT forward when id mismatches.
        // Simpler: match by the available card whose name matches.
      }
      // The cards array order mirrors content.researchNodes; click the one for `id`
      // by finding the available card sitting at this id's slot.
      const idx = Object.keys(content.researchNodes).indexOf(id);
      const card = host.querySelectorAll(".res-node")[idx];
      btn = card.querySelector(".res-buy");
      assert(btn, `no buy button for ${id}`);
      btn.onclick(); // [click]
      assert(
        dispatch.last.type === "BuyResearch" && dispatch.last.nodeId === id,
        `clicking card[${idx}] dispatched ${JSON.stringify(dispatch.last)} expected ${id}`,
      );
      assert(
        game.getState().unlocks.researchOwned.includes(id),
        `${id} not owned after click (rejected by engine?)`,
      );
    }
    console.log("    [click] ResearchTree buttons (full spine to res_armory)");

    // equipment recipes now unlocked -> craftable via BuildMenu workshop palette
    const s = snap(game);
    for (const r of ["r_sword", "r_armor", "r_shield"]) {
      assert(
        s.buildMenu.unlockedRecipes.includes(r),
        `${r} not unlocked after res_armory; recipes=${s.buildMenu.unlockedRecipes}`,
      );
    }
    // a workshop palette in BuildMenu should now offer sword/armor/shield place buttons
    const dispatch = recordingDispatch(game);
    const ui = {
      selectedPaletteKind: "workshop",
      setPalette() {},
      spawnPos: () => ({ x: 1, y: 1 }),
    };
    const host = renderPanel(BuildMenu(s, dispatch, ui));
    const labels = host.querySelectorAll(".bm-place").map((b) => b.text);
    assert(
      labels.some((l) => l.includes("Sword")),
      `no Sword craft button; got ${labels}`,
    );

    // --- Sale from a Storage Room's stock via the NodeInspector Sell button ---
    // Only Storage Rooms hold inventory now: place one, set it to hold iron_bar,
    // seed its stock, and sell through the UI.
    game.dispatch({
      type: "PlaceNode",
      kind: "storage",
      pos: { x: 600, y: 600 },
    });
    const sid = game
      .getState()
      .graph.nodes.filter((n) => n.kind === "storage")
      .pop().id;
    game.dispatch({
      type: "SetStorageRule",
      nodeId: sid,
      resourceIds: ["iron_bar"],
    });
    // re-fetch after the dispatch (the reducer clones state)
    const node = game.getState().graph.nodes.find((n) => n.id === sid);
    node.stockpile.iron_bar = 10;
    delete game.getState()._solved;
    const goldBefore = game.getState().currencies.gold;
    const resBefore = game.getState().currencies.research;
    const sellDispatch = recordingDispatch(game);
    const niHost = renderPanel(NodeInspector(snap(game), sellDispatch, sid));
    const sellBtn = niHost.querySelector(".ni-sell");
    assert(
      sellBtn,
      "NodeInspector rendered no Sell button for stocked storage room",
    );
    sellBtn.onclick(); // [click]
    assert(
      sellDispatch.last.type === "SellFromStockpile" &&
        sellDispatch.last.resId === "iron_bar",
      `expected SellFromStockpile iron_bar, got ${JSON.stringify(sellDispatch.last)}`,
    );
    const goldAfter = game.getState().currencies.gold;
    const resAfter = game.getState().currencies.research;
    // 10 iron_bar * 4.0 = 40 gold; tithe 0.05 -> +2 research
    assert(
      goldAfter - goldBefore === 40,
      `sale gold delta ${goldAfter - goldBefore}, expected 40`,
    );
    assert(
      Math.abs(resAfter - resBefore - 2) < 1e-9,
      `sale research tithe delta ${resAfter - resBefore}, expected 2`,
    );
    console.log(
      "    [click] NodeInspector Sell button (gold + tithe verified)",
    );
  },
);

// ----------------------------------------------------------------------------
// War helpers: build a fully-fed gear chain feeding a militia/knight Barracks.
// The FOCAL war controls (BuildMenu place, NodeInspector recipe wa-select, the
// GraphView drag-connect into the Barracks) are driven through their REAL
// rendered handlers ([click]/[wired]); the deep upstream gear chain is built via
// the wired PlaceNode/ConnectLink intents the UI fires (same discipline the seed
// chain used). Returns the barracks node ids placed.
// ----------------------------------------------------------------------------
function placeWired(game, kind, extra) {
  const d = recordingDispatch(game);
  const before = game.getState().graph.nodes.length;
  const r = d({ type: "PlaceNode", kind, pos: { x: 60, y: 60 }, ...extra });
  assert(
    r.ok,
    `PlaceNode ${kind} (${JSON.stringify(extra)}) rejected: ${r.error}`,
  );
  assert(
    game.getState().graph.nodes.length === before + 1,
    `PlaceNode ${kind} added no node`,
  );
  return game.getState().graph.nodes.slice(-1)[0].id;
}
function connectWired(game, from, to, resourceId) {
  const r = game.dispatch({ type: "ConnectLink", from, to, resourceId });
  assert(
    r.ok,
    `ConnectLink ${from}->${to} (${resourceId}) rejected: ${r.error}`,
  );
}
function levelWired(game, nodeId, level) {
  while (
    game.getState().graph.nodes.find((n) => n.id === nodeId).level < level
  ) {
    game.getState().currencies.gold = 1e9;
    delete game.getState()._solved;
    const r = game.dispatch({ type: "UpgradeNode", nodeId });
    assert(r.ok, `UpgradeNode ${nodeId} rejected: ${r.error}`);
  }
}
// Build the base militia gear chain (miners/foresters/trappers -> smelters ->
// component+gear workshops). Returns { swords, armors, shields } producer ids.
function buildMilitiaGearChain(game) {
  const iron = [
    placeWired(game, "gatherer", { resourceId: "iron_ore" }),
    placeWired(game, "gatherer", { resourceId: "iron_ore" }),
  ];
  const coalRaw = [placeWired(game, "gatherer", { resourceId: "coal_raw" })];
  const timber = [placeWired(game, "gatherer", { resourceId: "timber" })];
  const hide = [placeWired(game, "gatherer", { resourceId: "hide" })];
  for (const id of [...iron, ...coalRaw, ...timber, ...hide])
    levelWired(game, id, 10);

  const ironBar = [
    placeWired(game, "smelter", { recipeId: "r_iron_bar" }),
    placeWired(game, "smelter", { recipeId: "r_iron_bar" }),
  ];
  const coal = [placeWired(game, "smelter", { recipeId: "r_coal" })];
  const plank = [placeWired(game, "smelter", { recipeId: "r_plank" })];
  const leather = [placeWired(game, "smelter", { recipeId: "r_leather" })];
  const steel = [
    placeWired(game, "smelter", { recipeId: "r_steel" }),
    placeWired(game, "smelter", { recipeId: "r_steel" }),
  ];
  for (const id of [...ironBar, ...coal, ...plank, ...leather, ...steel])
    levelWired(game, id, 12);

  const blade = [placeWired(game, "workshop", { recipeId: "r_blade" })];
  const plating = [placeWired(game, "workshop", { recipeId: "r_plating" })];
  const fitting = [placeWired(game, "workshop", { recipeId: "r_fitting" })];
  const swords = [placeWired(game, "workshop", { recipeId: "r_sword" })];
  const armors = [placeWired(game, "workshop", { recipeId: "r_armor" })];
  const shields = [placeWired(game, "workshop", { recipeId: "r_shield" })];
  for (const id of [
    ...blade,
    ...plating,
    ...fitting,
    ...swords,
    ...armors,
    ...shields,
  ])
    levelWired(game, id, 14);

  for (const m of iron)
    for (const s of ironBar) connectWired(game, m, s, "iron_ore");
  for (const m of coalRaw)
    for (const s of coal) connectWired(game, m, s, "coal_raw");
  for (const m of timber)
    for (const s of plank) connectWired(game, m, s, "timber");
  for (const m of hide)
    for (const s of leather) connectWired(game, m, s, "hide");
  for (const s of ironBar)
    for (const t of steel) connectWired(game, s, t, "iron_bar");
  for (const c of coal) for (const t of steel) connectWired(game, c, t, "coal");
  for (const t of steel)
    for (const w of blade) connectWired(game, t, w, "steel");
  for (const p of plank)
    for (const w of blade) connectWired(game, p, w, "plank");
  for (const t of steel)
    for (const w of plating) connectWired(game, t, w, "steel");
  for (const l of leather)
    for (const w of plating) connectWired(game, l, w, "leather");
  for (const s of ironBar)
    for (const w of fitting) connectWired(game, s, w, "iron_bar");
  for (const l of leather)
    for (const w of fitting) connectWired(game, l, w, "leather");
  for (const b of blade)
    for (const w of swords) connectWired(game, b, w, "blade");
  for (const f of fitting)
    for (const w of swords) connectWired(game, f, w, "fitting");
  for (const p of plating)
    for (const w of armors) connectWired(game, p, w, "plating");
  for (const f of fitting)
    for (const w of armors) connectWired(game, f, w, "fitting");
  for (const p of plating)
    for (const w of shields) connectWired(game, p, w, "plating");
  for (const p of plank)
    for (const w of shields) connectWired(game, p, w, "plank");
  return { swords, armors, shields };
}

// ============================================================================
// STEP 5 — buy The Drill Yard on the real ResearchTree, place a Barracks from the
//          real BuildMenu (bottom-bar popover), set r_militia in the real
//          NodeInspector wa-select, connect sword/armor/shield producers through
//          real GraphView drag-connect taps. Barracks then musters militia.
// ============================================================================
step(
  5,
  "Buy Drill Yard (ResearchTree), place Barracks (BuildMenu), set r_militia (NodeInspector wa-select), wire gear (GraphView connect)",
  () => {
    game.getState().currencies.research = 100000;
    game.getState().currencies.gold = 1e9;
    delete game.getState()._solved;

    // --- Buy res_drill_yard via the rendered ResearchTree button ---
    const rdispatch = recordingDispatch(game);
    const rHost = renderPanel(ResearchTree(snap(game), rdispatch));
    const idx = Object.keys(content.researchNodes).indexOf("res_drill_yard");
    const card = rHost.querySelectorAll(".res-node")[idx];
    const buyBtn = card.querySelector(".res-buy");
    assert(buyBtn, "no buy button for res_drill_yard");
    assert(
      typeof buyBtn.onclick === "function",
      "res_drill_yard buy button has no onclick (still locked?)",
    );
    buyBtn.onclick(); // [click]
    assert(
      rdispatch.last.type === "BuyResearch" &&
        rdispatch.last.nodeId === "res_drill_yard",
      `expected BuyResearch res_drill_yard, got ${JSON.stringify(rdispatch.last)}`,
    );
    assert(
      game.getState().unlocks.researchOwned.includes("res_drill_yard"),
      "res_drill_yard not owned after click",
    );
    // barracks now placeable in the BuildMenu
    assert(
      snap(game).buildMenu.placeableMachines.includes("barracks"),
      "barracks not placeable after res_drill_yard",
    );
    console.log(
      "    [click] ResearchTree Drill Yard button -> barracks unlocked",
    );

    // --- Place a Barracks via the real BuildMenu bottom-bar popover ---
    const bdispatch = recordingDispatch(game);
    const ui = {
      selectedPaletteKind: "barracks",
      setPalette() {},
      spawnPos: () => ({ x: 700, y: 400 }),
    };
    const bmHost = renderPanel(BuildMenu(snap(game), bdispatch, ui));
    // the popover lists barracks recipes; r_militia is the only unlocked one.
    const placeBtns = bmHost
      .querySelectorAll(".bm-place")
      .filter((b) => !b.classList.contains("locked"));
    assert(
      placeBtns.length > 0,
      "BuildMenu rendered no unlocked barracks recipe buttons",
    );
    const labels = placeBtns.map((b) => b.text);
    assert(
      labels.some((l) => l.includes("Militia")),
      `no Militia barracks place button; got ${JSON.stringify(labels)}`,
    );
    const beforeNodes = game.getState().graph.nodes.length;
    placeBtns[0].onclick(); // [click]
    assert(
      bdispatch.last.type === "PlaceNode" && bdispatch.last.kind === "barracks",
      `expected PlaceNode barracks, got ${JSON.stringify(bdispatch.last)}`,
    );
    assert(
      game.getState().graph.nodes.length === beforeNodes + 1,
      "barracks node not added",
    );
    const barracksId = game.getState().graph.nodes.slice(-1)[0].id;
    // level it so its capacity (and thus militia rate) is meaningful
    levelWired(game, barracksId, 6);
    console.log("    [click] BuildMenu place Barracks (r_militia)");

    // --- Confirm/set r_militia via the real NodeInspector recipe wa-select ---
    const nidispatch = recordingDispatch(game);
    const niHost = renderPanel(
      NodeInspector(snap(game), nidispatch, barracksId),
    );
    const recipeSel = niHost.querySelector(".ni-recipe");
    assert(
      recipeSel,
      "NodeInspector rendered no recipe wa-select for barracks",
    );
    assert(
      typeof recipeSel.onchange === "function",
      "barracks recipe select has no onchange",
    );
    // option labels must use resource displays (e.g. "Militia"), never "undefined"
    const optText = recipeSel.querySelectorAll("wa-option").map((o) => o.text);
    assert(
      optText.some((t) => /Militia/.test(t)) &&
        !optText.some((t) => /undefined/.test(t)),
      `barracks recipe options bad: ${JSON.stringify(optText)}`,
    );
    recipeSel.onchange({ target: { value: "r_militia" } }); // [click]
    assert(
      nidispatch.last.type === "SetRecipe" &&
        nidispatch.last.nodeId === barracksId &&
        nidispatch.last.recipeId === "r_militia",
      `expected SetRecipe r_militia, got ${JSON.stringify(nidispatch.last)}`,
    );
    // The reducer must ACCEPT SetRecipe on a barracks. Asserting the node's
    // recipeId alone is a no-op here (BuildMenu already baked r_militia into the
    // PlaceNode), so a silently-rejected SetRecipe would slip through. Demand the
    // dispatch reports ok — this is the guard that catches "Not a crafter".
    assert(
      nidispatch.lastResult.ok,
      `SetRecipe r_militia on barracks was rejected: ${nidispatch.lastResult.error}`,
    );
    assert(
      game.getState().graph.nodes.find((n) => n.id === barracksId).recipeId ===
        "r_militia",
      "barracks recipe not set to r_militia",
    );
    console.log("    [click] NodeInspector recipe wa-select -> r_militia");

    // --- Build the upstream gear chain, then connect gear -> Barracks via the
    //     real GraphView drag-connect path (GraphInput.onConnect -> _connect). ---
    const gear = buildMilitiaGearChain(game);
    const gvHost = new FakeEl("div");
    const gv = new GraphView(gvHost, game, {});
    gv.render(snap(game));
    const beforeLinks = game.getState().graph.links.length;
    for (const w of gear.swords) gv._connect(w, barracksId); // sword -> barracks
    for (const w of gear.armors) gv._connect(w, barracksId); // armor -> barracks
    for (const w of gear.shields) gv._connect(w, barracksId); // shield -> barracks
    const added = game.getState().graph.links.length - beforeLinks;
    assert(
      added === gear.swords.length + gear.armors.length + gear.shields.length,
      `GraphView._connect added ${added} barracks-feed links (expected 3)`,
    );
    const barracksLinks = game
      .getState()
      .graph.links.filter((l) => l.to === barracksId)
      .map((l) => l.resourceId)
      .sort();
    assert(
      JSON.stringify(barracksLinks) ===
        JSON.stringify(["armor", "shield", "sword"]),
      `barracks not fed sword+armor+shield; got ${JSON.stringify(barracksLinks)}`,
    );
    console.log(
      "    [wired] GraphView._connect sword/armor/shield -> Barracks",
    );

    // The army now produces siege power (the barracks emits a siege rate).
    delete game.getState()._solved;
    const sRate = snap(game).siege.rate;
    assert(sRate > 0, `militia army produced no siege rate (${sRate})`);
    // and the NodeInspector surfaces the barracks' power/s contribution.
    const niHost2 = renderPanel(
      NodeInspector(snap(game), recordingDispatch(game), barracksId),
    );
    const siegeLine = niHost2.querySelector(".ni-siege-out");
    assert(siegeLine, "NodeInspector showed no barracks siege-out line");
    assert(
      /power\/s/.test(siegeLine.text),
      `barracks siege-out line malformed: "${siegeLine.text}"`,
    );
    console.log(
      `    [render] militia army siege rate ${sRate.toFixed(3)} power/s`,
    );
  },
);

// ============================================================================
// STEP 6 — open the War tab via the real router/tabs; assert the sieging card
//          shows a NONZERO rate (real .war-rate text); tick until t_gatehouse
//          falls; assert the card flips to Reclaimed (real .war-done badge).
// ============================================================================
step(
  6,
  "War tab: sieging card shows nonzero rate; tick to fall t_gatehouse; card flips to Reclaimed",
  () => {
    // Navigate to the War route exactly as a tab click would (the Hud's
    // onWaTabShow handler calls router.navigate(name)).
    const router = new Router(windowShim);
    router.navigate("war");
    assert(router.current === "war", "router did not navigate to the War tab");
    console.log("    [click] router.navigate('war') (tab show)");

    // Render the real WarBoard for the sieging snapshot.
    let s = snap(game);
    const gate0 = s.territories.find((t) => t.id === "t_gatehouse");
    assert(
      gate0.status === "sieging",
      `t_gatehouse status=${gate0.status}, expected sieging`,
    );
    let host = renderPanel(WarBoard(s));
    // the sieging card carries a progress bar + a .war-rate line reading "X power/s"
    const sieging = host.querySelector(".war-card.sieging");
    assert(sieging, "WarBoard rendered no sieging card");
    assert(
      sieging.querySelector(".war-progress"),
      "sieging card has no wa-progress-bar",
    );
    const rateLine = sieging.querySelector(".war-rate");
    assert(rateLine, "sieging card has no .war-rate line");
    const rateText = rateLine.text;
    assert(
      /power\/s/.test(rateText) && /falls in/.test(rateText),
      `.war-rate did not show a live rate: "${rateText}"`,
    );
    // the rate text must reflect a NONZERO siege rate (not the "No army" fallback)
    assert(
      !/No army/.test(rateText) && s.siege.rate > 0,
      `expected a nonzero siege rate in the card; text="${rateText}", rate=${s.siege.rate}`,
    );
    console.log(`    [render] War sieging card: "${rateText.trim()}"`);

    // Tick (big-dt; siege accrues linearly) until t_gatehouse (cost 40) falls.
    let guard = 0;
    while (
      !game.getState().territories.reclaimed.includes("t_gatehouse") &&
      guard++ < 2000
    ) {
      clock.advance(60_000);
      game.tick(60);
    }
    assert(
      game.getState().territories.reclaimed.includes("t_gatehouse"),
      `t_gatehouse not reclaimed after ${guard} ticks`,
    );
    console.log("    [wired] game.tick siege loop -> t_gatehouse falls");

    // Re-render the War tab: the gatehouse card now shows the Reclaimed badge.
    s = snap(game);
    const gate1 = s.territories.find((t) => t.id === "t_gatehouse");
    assert(
      gate1.status === "reclaimed",
      `gatehouse status=${gate1.status}, expected reclaimed`,
    );
    host = renderPanel(WarBoard(s));
    const doneCard = host.querySelector(".war-card.reclaimed");
    assert(doneCard, "WarBoard rendered no reclaimed card after the fall");
    const badge = doneCard.querySelector(".war-done");
    assert(badge, "reclaimed card has no .war-done badge");
    assert(
      /Reclaimed/.test(badge.text),
      `reclaimed badge text wrong: "${badge.text}"`,
    );
    // and the siege front advanced to t_smithyward
    const smithy = s.territories.find((t) => t.id === "t_smithyward");
    assert(
      smithy.status === "sieging",
      `siege did not advance to t_smithyward (status=${smithy.status})`,
    );
    console.log(
      "    [render] gatehouse card flipped to Reclaimed; front -> Smithy Ward",
    );
  },
);

// ============================================================================
// STEP 7 — drive to VICTORY through real ticks (no hero/expedition): muster a
//          knight army the way the real player would (the victory drive may
//          fast-fund research/upgrades like the old probe did, but must reach
//          meta.won through real siege ticks). Victory overlay renders epilogue.
// ============================================================================
step(
  7,
  "Drive to victory via the siege loop (real ticks); territories fall in order; Victory overlay renders",
  () => {
    const ORDER = Object.values(content.territories)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);

    // Phase A: militia army alone fells gatehouse..ironreach in order. Tick in
    // chunks and record each reclaim, asserting canonical order as we go.
    const fellOrder = game.getState().territories.reclaimed.slice(); // gatehouse already fell in step 6
    function tickRecord(dt) {
      const before = game.getState().territories.reclaimed.slice();
      game.tick(dt);
      const after = game.getState().territories.reclaimed;
      for (let i = before.length; i < after.length; i++) {
        const id = after[i];
        assert(
          id === ORDER[fellOrder.length],
          `territory fell out of order: got ${id}, expected ${ORDER[fellOrder.length]}`,
        );
        fellOrder.push(id);
      }
    }
    // Big-dt steps (applyTick integrates linearly -> exact); the retuned
    // siegeCosts make small steps need thousands of iterations, so siege in 1h
    // chunks to keep the loop in the low dozens with ample guard headroom.
    let guard = 0;
    while (
      !game.getState().territories.reclaimed.includes("t_ironreach") &&
      guard++ < 5000
    ) {
      clock.advance(3_600_000);
      tickRecord(3600);
    }
    assert(
      game.getState().territories.reclaimed.includes("t_ironreach"),
      "militia army never felled t_ironreach",
    );
    assert(
      game.getState().unlocks.gathererResources.includes("gemstone"),
      "gemstone gathering not enabled after t_ironreach",
    );

    // Phase B: ironreach is reclaimed -> the master-smithing gate opens. Buy it,
    // build the hardened/fine/master gear chain, muster KNIGHTS (power 9) to
    // crack High Wall (4500) + Black Keep (12000). Research/gold are fast-funded
    // (the old probe seeded currencies the same way) — the WIN still comes only
    // from real siege ticks below.
    game.getState().currencies.research = 100000;
    game.getState().currencies.gold = 1e9;
    delete game.getState()._solved;
    assert(
      game.dispatch({ type: "BuyResearch", nodeId: "res_hardened_steel" }).ok ||
        game.getState().unlocks.researchOwned.includes("res_hardened_steel"),
      "res_hardened_steel not buyable",
    );
    const ms = game.dispatch({
      type: "BuyResearch",
      nodeId: "res_master_smithing",
    });
    assert(
      ms.ok && game.getState().unlocks.recipesUnlocked.includes("r_knight"),
      `res_master_smithing not buyable after t_ironreach: ${ms.error}`,
    );

    // raws: gemstone (newly unlocked) + extra coal/iron for hardened steel
    const gems = [
      placeWired(game, "gatherer", { resourceId: "gemstone" }),
      placeWired(game, "gatherer", { resourceId: "gemstone" }),
    ];
    const coalRaw = [
      placeWired(game, "gatherer", { resourceId: "coal_raw" }),
      placeWired(game, "gatherer", { resourceId: "coal_raw" }),
    ];
    const iron = [
      placeWired(game, "gatherer", { resourceId: "iron_ore" }),
      placeWired(game, "gatherer", { resourceId: "iron_ore" }),
    ];
    const timber = [placeWired(game, "gatherer", { resourceId: "timber" })];
    const hide = [placeWired(game, "gatherer", { resourceId: "hide" })];
    for (const id of [...gems, ...coalRaw, ...iron, ...timber, ...hide])
      levelWired(game, id, 14);

    const ironBar = [
      placeWired(game, "smelter", { recipeId: "r_iron_bar" }),
      placeWired(game, "smelter", { recipeId: "r_iron_bar" }),
    ];
    const coal = [placeWired(game, "smelter", { recipeId: "r_coal" })];
    const plank = [placeWired(game, "smelter", { recipeId: "r_plank" })];
    const leather = [placeWired(game, "smelter", { recipeId: "r_leather" })];
    const steel = [
      placeWired(game, "smelter", { recipeId: "r_steel" }),
      placeWired(game, "smelter", { recipeId: "r_steel" }),
      placeWired(game, "smelter", { recipeId: "r_steel" }),
    ];
    const hardened = [
      placeWired(game, "smelter", { recipeId: "r_hardened_steel" }),
      placeWired(game, "smelter", { recipeId: "r_hardened_steel" }),
    ];
    for (const id of [
      ...ironBar,
      ...coal,
      ...plank,
      ...leather,
      ...steel,
      ...hardened,
    ])
      levelWired(game, id, 16);

    const blade = [placeWired(game, "workshop", { recipeId: "r_blade" })];
    const plating = [placeWired(game, "workshop", { recipeId: "r_plating" })];
    const fitting = [placeWired(game, "workshop", { recipeId: "r_fitting" })];
    const swords = [placeWired(game, "workshop", { recipeId: "r_sword" })];
    const armors = [placeWired(game, "workshop", { recipeId: "r_armor" })];
    const shields = [placeWired(game, "workshop", { recipeId: "r_shield" })];
    const fineSword = [
      placeWired(game, "workshop", { recipeId: "r_fine_sword" }),
    ];
    const fineArmor = [
      placeWired(game, "workshop", { recipeId: "r_fine_armor" }),
    ];
    const fineShield = [
      placeWired(game, "workshop", { recipeId: "r_fine_shield" }),
    ];
    const mSword = [
      placeWired(game, "workshop", { recipeId: "r_master_sword" }),
    ];
    const mArmor = [
      placeWired(game, "workshop", { recipeId: "r_master_armor" }),
    ];
    const mShield = [
      placeWired(game, "workshop", { recipeId: "r_master_shield" }),
    ];
    for (const id of [
      ...blade,
      ...plating,
      ...fitting,
      ...swords,
      ...armors,
      ...shields,
      ...fineSword,
      ...fineArmor,
      ...fineShield,
      ...mSword,
      ...mArmor,
      ...mShield,
    ])
      levelWired(game, id, 18);

    for (const m of iron)
      for (const s of ironBar) connectWired(game, m, s, "iron_ore");
    for (const m of coalRaw)
      for (const s of coal) connectWired(game, m, s, "coal_raw");
    for (const m of timber)
      for (const s of plank) connectWired(game, m, s, "timber");
    for (const m of hide)
      for (const s of leather) connectWired(game, m, s, "hide");
    for (const s of ironBar)
      for (const t of steel) connectWired(game, s, t, "iron_bar");
    for (const c of coal)
      for (const t of steel) connectWired(game, c, t, "coal");
    for (const t of steel)
      for (const h of hardened) connectWired(game, t, h, "steel");
    for (const c of coalRaw)
      for (const h of hardened) connectWired(game, c, h, "coal_raw");
    for (const t of steel)
      for (const w of blade) connectWired(game, t, w, "steel");
    for (const p of plank)
      for (const w of blade) connectWired(game, p, w, "plank");
    for (const t of steel)
      for (const w of plating) connectWired(game, t, w, "steel");
    for (const l of leather)
      for (const w of plating) connectWired(game, l, w, "leather");
    for (const s of ironBar)
      for (const w of fitting) connectWired(game, s, w, "iron_bar");
    for (const l of leather)
      for (const w of fitting) connectWired(game, l, w, "leather");
    for (const b of blade)
      for (const w of swords) connectWired(game, b, w, "blade");
    for (const f of fitting)
      for (const w of swords) connectWired(game, f, w, "fitting");
    for (const p of plating)
      for (const w of armors) connectWired(game, p, w, "plating");
    for (const f of fitting)
      for (const w of armors) connectWired(game, f, w, "fitting");
    for (const p of plating)
      for (const w of shields) connectWired(game, p, w, "plating");
    for (const p of plank)
      for (const w of shields) connectWired(game, p, w, "plank");
    for (const w of swords)
      for (const f of fineSword) connectWired(game, w, f, "sword");
    for (const h of hardened)
      for (const f of fineSword) connectWired(game, h, f, "hardened_steel");
    for (const w of armors)
      for (const f of fineArmor) connectWired(game, w, f, "armor");
    for (const h of hardened)
      for (const f of fineArmor) connectWired(game, h, f, "hardened_steel");
    for (const w of shields)
      for (const f of fineShield) connectWired(game, w, f, "shield");
    for (const h of hardened)
      for (const f of fineShield) connectWired(game, h, f, "hardened_steel");
    for (const f of fineSword)
      for (const m of mSword) connectWired(game, f, m, "fine_sword");
    for (const g of gems)
      for (const m of mSword) connectWired(game, g, m, "gemstone");
    for (const f of fineArmor)
      for (const m of mArmor) connectWired(game, f, m, "fine_armor");
    for (const g of gems)
      for (const m of mArmor) connectWired(game, g, m, "gemstone");
    for (const f of fineShield)
      for (const m of mShield) connectWired(game, f, m, "fine_shield");
    for (const g of gems)
      for (const m of mShield) connectWired(game, g, m, "gemstone");

    // Knight barracks (power 9), several & leveled, to crack 4500 + 12000.
    for (let i = 0; i < 6; i++) {
      const b = placeWired(game, "barracks", { recipeId: "r_knight" });
      levelWired(game, b, 12);
      for (const w of mSword) connectWired(game, w, b, "master_sword");
      for (const w of mArmor) connectWired(game, w, b, "master_armor");
      for (const w of mShield) connectWired(game, w, b, "master_shield");
    }
    delete game.getState()._solved;
    assert(snap(game).siege.rate > 0, "knight army produced no siege rate");

    // Phase C: big-dt ticks to VICTORY; every reclaim still asserted in order.
    guard = 0;
    while (!game.getState().meta.won && guard++ < 5000) {
      clock.advance(3_600_000);
      tickRecord(3600);
    }
    assert(
      game.getState().meta.won === true,
      "meta.won false after siege drive",
    );
    assert(
      fellOrder.join(",") === ORDER.join(","),
      `final fall order wrong:\n  got ${fellOrder.join(",")}\n  exp ${ORDER.join(",")}`,
    );
    const allReclaimed = ORDER.every((id) =>
      game.getState().territories.reclaimed.includes(id),
    );
    assert(allReclaimed, "not all 6 territories reclaimed");
    console.log(
      `    [wired] siege drive to victory; fall order ${fellOrder.join(" -> ")}`,
    );

    // Victory overlay renders with epilogue text + free-play line.
    let closed = false;
    const vHost = renderPanel(Victory(() => (closed = true)));
    const vText = vHost.text;
    assert(vText.includes("Yensburg Reclaimed"), "Victory missing title");
    assert(
      vText.includes("forges do not cool"),
      "Victory missing epilogue body",
    );
    assert(
      vText.includes("Free-play continues"),
      "Victory missing free-play line",
    );
    const closeBtn = vHost.querySelector(".victory-close");
    assert(
      closeBtn && typeof closeBtn.onclick === "function",
      "no victory close button",
    );
    closeBtn.onclick();
    assert(closed, "victory close handler did not fire");
    assert(
      snap(game).meta.won === true,
      "meta.won flipped false after closing victory",
    );
    console.log("    [click] Victory close (free-play continues)");
  },
);

// ============================================================================
// STEP 8 — OfflineSummary path: simulate elapsed wall-clock; modal renders gains
// ============================================================================
step(
  8,
  "OfflineSummary: elapsed wall-clock via clock/lastSeen -> modal renders gained amounts",
  () => {
    // Fresh game so the offline integration has steady-state production to bank.
    const oclock = new FakeClock(0);
    const og = new Game({ content, clock: oclock });
    og.bootstrap(new MemoryStorageAdapter());
    buildSeedChain(og); // build the producing chain (empty start otherwise banks nothing)

    // Also muster a militia army so the offline window FELLS a territory: the
    // summary must report `territoriesReclaimed` (OfflineSummary renders each as a
    // "Reclaimed <name>" tag). Unlock the war spine + a barracks, feed it gear.
    og.getState().currencies.research = 100000;
    og.getState().currencies.gold = 1e9;
    delete og.getState()._solved;
    for (const id of [
      "res_scholar",
      "res_lumber",
      "res_tannery",
      "res_coalworks",
      "res_steelmaking",
      "res_open_market",
      "res_smithing",
      "res_fittings",
      "res_armory",
      "res_drill_yard",
    ]) {
      const r = og.dispatch({ type: "BuyResearch", nodeId: id });
      assert(r.ok, `offline-setup BuyResearch ${id}: ${r.error}`);
    }
    const ogBarracks = placeWired(og, "barracks", { recipeId: "r_militia" });
    levelWired(og, ogBarracks, 8);
    const ogGear = buildMilitiaGearChain(og);
    for (const w of ogGear.swords) connectWired(og, w, ogBarracks, "sword");
    for (const w of ogGear.armors) connectWired(og, w, ogBarracks, "armor");
    for (const w of ogGear.shields) connectWired(og, w, ogBarracks, "shield");
    delete og.getState()._solved;
    assert(snap(og).siege.rate > 0, "offline army produced no siege rate");

    // simulate the player closing the tab now and returning 2 hours later
    const elapsed = 2 * 3600 * 1000;
    oclock.advance(elapsed);
    // applyOffline is what Game.bootstrap calls; here we call it directly with the
    // advanced clock to produce the summary Main.js would feed App.showOfflineSummary.
    const summary = applyOffline(og.getState(), content, oclock.now());
    assert(summary.appliedMs > 0, "offline applied 0ms");
    assert(
      summary.gained && summary.gained.gold > 0,
      `offline gained no gold: ${JSON.stringify(summary.gained)}`,
    );
    // the 2h siege window felled at least t_gatehouse (cost 40).
    assert(
      Array.isArray(summary.territoriesReclaimed) &&
        summary.territoriesReclaimed.some(
          (t) => t.territoryId === "t_gatehouse",
        ),
      `offline summary reported no t_gatehouse reclaim: ${JSON.stringify(summary.territoriesReclaimed)}`,
    );

    // Render the real OfflineSummary modal with the summary.
    let closed = false;
    const host = renderPanel(OfflineSummary(summary, () => (closed = true)));
    assert(
      host.querySelector("#OfflineSummary"),
      "OfflineSummary modal not rendered",
    );
    const text = host.text;
    assert(
      text.includes("While you were away"),
      "OfflineSummary missing title",
    );
    // gained currencies render as .os-gain wa-tags with FA duotone icons (no emoji).
    const goldTag = host.querySelector(".os-gain");
    assert(goldTag, "OfflineSummary rendered no .os-gain currency tag");
    assert(
      goldTag.querySelector("i.fa-coins"),
      "OfflineSummary gold tag has no FA coins icon",
    );
    assert(
      /\+/.test(text),
      `OfflineSummary did not render a gained amount; text="${text}"`,
    );
    // It must show the actual gold gained.
    const goldShown = Math.round(summary.gained.gold);
    assert(
      text.replace(/,/g, "").includes(String(goldShown)),
      `OfflineSummary text "${text}" missing gold ${goldShown}`,
    );
    // It must list the territory the offline siege reclaimed (real .os-exp tag).
    const reclaimTags = host.querySelectorAll(".os-exp");
    assert(
      reclaimTags.length >= 1,
      "OfflineSummary rendered no .os-exp reclaimed tag",
    );
    assert(
      reclaimTags.some(
        (t) => /Reclaimed/.test(t.text) && /Gatehouse/.test(t.text),
      ),
      `OfflineSummary reclaimed tag missing The Gatehouse; got ${JSON.stringify(reclaimTags.map((t) => t.text))}`,
    );
    const closeBtn = host.querySelector(".os-close");
    assert(
      closeBtn && typeof closeBtn.onclick === "function",
      "no offline close button",
    );
    closeBtn.onclick();
    assert(closed, "offline close handler did not fire");
    console.log(
      `    [render+click] OfflineSummary (gained ${goldShown} gold over ${summary.appliedMs}ms)`,
    );
  },
);

// ============================================================================
// STEP 9 — Guided tutorial: the card is ACTION-TRIGGERED (advances only when the
//          player completes each objective), Skip ends it, tutorialDone persists
// ============================================================================
step(
  9,
  "Tutorial card advances on actions; Skip ends it; tutorialDone survives save R/T",
  () => {
    const tclock = new FakeClock(0);
    const tg = new Game({ content, clock: tclock });
    tg.bootstrap(new MemoryStorageAdapter());
    const dispatch = recordingDispatch(tg);

    // Fresh game -> first objective is "place a Miner".
    let host = renderPanel(Tooltip(snap(tg), dispatch));
    assert(
      host.querySelector("#TutorialCard"),
      "no tutorial card on a fresh game",
    );
    const title1 = host.querySelector(".tut-title").text;
    assert(
      /Build Your First Machine/.test(title1),
      `first step not the miner step: "${title1}"`,
    );
    assert(
      /Step 1 of 5/.test(host.querySelector(".tut-step").text),
      "missing step counter on the first card",
    );

    // ACTION-TRIGGERED: placing a Miner (gatherer) advances the guide to the
    // Smelter step with NO "next" click — the card reads the live snapshot.
    dispatch({
      type: "PlaceNode",
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 300, y: 320 },
    });
    host = renderPanel(Tooltip(snap(tg), dispatch));
    assert(
      /Refine the Ore/.test(host.querySelector(".tut-title").text),
      "card did not advance to the smelter step after placing a Miner",
    );
    console.log("    [trigger] placing a Miner advanced the guide (no button)");

    // Skip is ALWAYS available and ends the whole tutorial.
    const skip = host.querySelector(".tut-skip");
    assert(
      skip && typeof skip.onclick === "function",
      "no Skip button on the tutorial card",
    );
    skip.onclick(); // [click]
    assert(
      dispatch.last.type === "DismissTutorial",
      `expected DismissTutorial, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      tg.getState().meta.tutorialDone === true,
      "tutorialDone not set after Skip",
    );

    // Once skipped, no card renders at all.
    host = renderPanel(Tooltip(snap(tg), dispatch));
    assert(
      !host.querySelector("#TutorialCard"),
      "tutorial card still shown after Skip",
    );
    console.log("    [click] Skip tutorial -> DismissTutorial, card gone");

    // tutorialDone survives a real serialize/deserialize round-trip.
    const json = serialize(tg.getState(), 0);
    const restored = deserialize(json, tclock);
    assert(
      restored.meta.tutorialDone === true,
      "tutorialDone did NOT survive serialize/deserialize round-trip",
    );
    console.log("    [round-trip] tutorialDone persisted");
  },
);

// ============================================================================
// STEP 10 — Save/load round-trip through the real storage adapter
// ============================================================================
step(
  10,
  "Save/load round-trip via real LocalStorageAdapter restores state",
  () => {
    // Use the LocalStorageAdapter against the window.localStorage shim.
    const adapter = new LocalStorageAdapter(localStorageShim);
    const sclock = new FakeClock(500000);
    const sg = new Game({ content, clock: sclock });
    sg.bootstrap(adapter);

    // Mutate state through a UI action: buy res_scholar via ResearchTree.
    sg.getState().currencies.research = 50;
    delete sg.getState()._solved;
    const dispatch = recordingDispatch(sg);
    const host = renderPanel(ResearchTree(snap(sg), dispatch));
    host.querySelector(".res-node.available .res-buy").onclick();
    assert(
      sg.getState().unlocks.researchOwned.includes("res_scholar"),
      "scholar not bought before save",
    );
    const goldMark = sg.getState().currencies.gold;
    sg.getState().currencies.gold = 777; // distinctive marker
    delete sg.getState()._solved;

    // Save through the adapter (the exact path Main.js uses).
    adapter.set(SAVE_KEY, serialize(sg.getState(), sclock.now()));

    // New Game instance, same adapter -> bootstrap restores from storage.
    const sg2 = new Game({ content, clock: sclock });
    sg2.bootstrap(adapter);
    const r = sg2.getState();
    assert(
      r.unlocks.researchOwned.includes("res_scholar"),
      "res_scholar not restored after load",
    );
    assert(
      r.currencies.gold === 777,
      `gold not restored: expected 777, got ${r.currencies.gold}`,
    );
    // graph restored intact
    assert(
      r.graph.nodes.length === sg.getState().graph.nodes.length,
      "node count not restored",
    );
    // a snapshot can be built from the restored state (UI would consume it)
    const rs = snap(sg2);
    assert(
      rs.currencyStrings.gold === "777",
      `restored HUD gold string ${rs.currencyStrings.gold}`,
    );
    console.log(
      "    [round-trip] LocalStorageAdapter save -> bootstrap restore",
    );
  },
);

// ============================================================================
// STEP 11 — B1: autosave stamps lastSeen=now; immediate reload => no phantom offline
// ============================================================================
step(
  11,
  "B1: save stamps lastSeen=now; immediate reload credits ~0 gold + no offline modal; >60s does",
  () => {
    const bclock = new FakeClock(0);
    const bg = new Game({ content, clock: bclock });
    bg.bootstrap(new MemoryStorageAdapter());
    buildSeedChain(bg); // build the producing chain so 2/s income exists

    // play 30s foreground
    for (let i = 0; i < 600; i++) {
      bclock.advance(50);
      bg.tick(0.05);
    }
    const T = bclock.now();
    // autosave path (Main.js): serialize(state, clock.now()) stamps lastSeen=T
    const blob = JSON.parse(serialize(bg.getState(), T));
    assert(
      blob.lastSeen === T,
      `autosave lastSeen=${blob.lastSeen}, expected ${T} (B1 phantom-offline freeze)`,
    );
    assert(
      blob.savedAt === T,
      `autosave savedAt=${blob.savedAt}, expected ${T}`,
    );

    // reload 5s later: applyOffline must credit ~0, no summary modal
    const reloaded = deserialize(serialize(bg.getState(), T), bclock);
    assert(reloaded.lastSeen === T, "reloaded lastSeen not preserved");
    const sImmediate = applyOffline(reloaded, content, T + 5_000);
    assert(
      Math.abs(sImmediate.gained.gold - 10) < 1e-6,
      `immediate reload credited ${sImmediate.gained.gold} gold, expected ~10 (2/s*5s), not a phantom session`,
    );
    assert(
      sImmediate.appliedMs <= 60_000,
      `immediate reload appliedMs ${sImmediate.appliedMs} would trigger the offline modal (>60s)`,
    );

    // >60s away: real credit + modal
    const reloaded2 = deserialize(serialize(bg.getState(), T), bclock);
    const sAway = applyOffline(reloaded2, content, T + 5 * 60_000);
    assert(
      sAway.appliedMs > 60_000,
      "5-min reload did not exceed the 60s offline-modal threshold",
    );
    assert(sAway.gained.gold > 0, "5-min reload credited no gold");
    console.log(
      "    [wired] serialize(now) -> applyOffline; no phantom offline on quick reload",
    );
  },
);

// ============================================================================
// STEP 12 — B2: victory fires once; AckVictory persists through save; gate suppresses re-fire
// ============================================================================
step(
  12,
  "B2: AckVictory sets meta.seenVictory, survives save R/T, App gate suppresses re-fire",
  () => {
    const vclock = new FakeClock(0);
    const vg = new Game({ content, clock: vclock });
    vg.bootstrap(new MemoryStorageAdapter());

    // force a won state directly (engine), then snapshot reflects won + not-yet-seen
    vg.getState().meta.won = true;
    delete vg.getState()._solved;
    const s1 = snap(vg);
    assert(victoryReady(s1) === true, "victoryReady false after meta.won=true");
    assert(
      s1.meta.seenVictory === false,
      `seenVictory should start false, got ${s1.meta.seenVictory}`,
    );
    // gate (App.js): victoryReady && !seenVictory && !victoryShown -> would fire
    assert(
      victoryReady(s1) && !s1.meta.seenVictory,
      "victory gate would NOT fire on first win (bug)",
    );

    // Victory close handler dispatches AckVictory (mirror App wiring)
    const dispatch = recordingDispatch(vg);
    const vHost = renderPanel(Victory(() => dispatch({ type: "AckVictory" })));
    vHost.querySelector(".victory-close").onclick(); // [click]
    assert(
      dispatch.last && dispatch.last.type === "AckVictory",
      `Victory close did not dispatch AckVictory, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      vg.getState().meta.seenVictory === true,
      "AckVictory did not set meta.seenVictory",
    );

    // persists through serialize/deserialize
    const restored = deserialize(
      serialize(vg.getState(), vclock.now()),
      vclock,
    );
    assert(
      restored.meta.seenVictory === true,
      "seenVictory did NOT survive save round-trip",
    );

    // gate now suppresses the re-fire
    const s2 = buildSnapshot(restored, solve(restored, content), content, null);
    assert(victoryReady(s2) === true, "still won after reload");
    assert(
      (victoryReady(s2) && !s2.meta.seenVictory) === false,
      "App gate would re-fire victory after ack (B2 re-pop bug)",
    );
    console.log(
      "    [click+round-trip] AckVictory persists; victory fires once",
    );
  },
);

// ============================================================================
// STEP 13 — M2/M3: NodeInspector Remove + gatherer reassign; GraphView link ✕;
//           SetNodePos persists drag
// ============================================================================
step(
  13,
  "M2/M3: Remove node, reassign gatherer, delete link via ✕, SetNodePos persists drag",
  () => {
    const mclock = new FakeClock(0);
    const mg = new Game({ content, clock: mclock });
    mg.bootstrap(new MemoryStorageAdapter());
    // build the seed chain from the empty start so the edit ops have nodes/links
    buildSeedChain(mg);
    // enable a second gatherer raw so reassignment has a real target
    mg.getState().unlocks.gathererResources = ["timber"];
    delete mg.getState()._solved;

    // --- SetGathererResource via the NodeInspector <select> ---
    const d1 = recordingDispatch(mg);
    const niHost = renderPanel(NodeInspector(snap(mg), d1, "n_miner_0"));
    const gathSel = niHost.querySelector(".ni-gatherer");
    assert(gathSel, "NodeInspector rendered no gatherer <select>");
    assert(
      typeof gathSel.onchange === "function",
      "gatherer select has no onchange",
    );
    gathSel.onchange({ target: { value: "timber" } }); // [click]
    assert(
      d1.last.type === "SetGathererResource" && d1.last.resourceId === "timber",
      `expected SetGathererResource timber, got ${JSON.stringify(d1.last)}`,
    );
    assert(
      mg.getState().graph.nodes.find((n) => n.id === "n_miner_0").resourceId ===
        "timber",
      "miner not reassigned to timber",
    );
    console.log("    [click] NodeInspector gatherer reassign select");

    // --- SetNodePos via a drag on GraphView (pointer down/move/up through GraphInput) ---
    const gvHost = new FakeEl("div");
    const gv = new GraphView(gvHost, mg, {});
    gv.render(snap(mg));
    const startPos = mg
      .getState()
      .graph.nodes.find((n) => n.id === "n_smelter_0").pos;
    // node is at graph (360,200) size 120x64; pointer at its center, then drag right 100px
    const cx = startPos.x + 60,
      cy = startPos.y + 32;
    const dn = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y });
    // Shipped behavior (commit a1eaf80): grab-offset + select-first — the first gesture
    // only selects a node; it must already be selected before a drag moves it. So tap to
    // select, then drag to move.
    gv.input._down(dn(1, cx, cy));
    gv.input._up(dn(1, cx, cy));
    gv.input._down(dn(1, cx, cy));
    gv.input._move(dn(1, cx + 100, cy + 40));
    const solvedBefore = mg.getState()._solved;
    gv.input._up(dn(1, cx + 100, cy + 40));
    const movedPos = mg
      .getState()
      .graph.nodes.find((n) => n.id === "n_smelter_0").pos;
    assert(
      movedPos.x !== startPos.x || movedPos.y !== startPos.y,
      `SetNodePos did not persist drag (pos still ${JSON.stringify(movedPos)})`,
    );
    // _dragPos override cleared after pointerup so draw + hit-test agree on n.pos
    assert(
      !gv._dragPos || !gv._dragPos["n_smelter_0"],
      "drag override not cleared after pointerup",
    );
    // non-structural: _solved must survive a pure reposition
    assert(
      mg.getState()._solved,
      "SetNodePos needlessly invalidated _solved (should be non-structural)",
    );
    console.log(
      "    [wired] GraphView drag -> SetNodePos persists; _dragPos cleared; _solved kept",
    );

    // --- RemoveLink via the ✕ midpoint control in GraphView (click-to-reveal, P3) ---
    // The SVG is pointer-captured, so the ✕'s own onclick can never fire; deletion
    // routes through GraphInput.hitLinkDelete -> onDeleteLink (task 22). We tap the ✕.
    gv.render(snap(mg));
    const beforeLinks = mg.getState().graph.links.length;
    // pre-reveal: with selectedLinkId null, the ✕ must NOT be present (default-hidden)
    assert(
      gvHost.querySelector(".link-delete") == null,
      "link ✕ should be hidden until the link is revealed (P3 click-to-reveal)",
    );
    const delLink = mg.getState().graph.links[0];
    gv._selectLink(delLink.id); // [click] tap-to-reveal a link
    const delX = gvHost.querySelector(".link-delete");
    assert(delX, "GraphView rendered no link-delete ✕ control after reveal");
    // the ✕ has NO onclick (dead under pointer capture) — deletion is by tap-routing
    assert(
      delX.onclick == null,
      "link-delete ✕ should carry no onclick (task 22: routes via hitLinkDelete)",
    );
    // compute the ✕ hit center (mirrors GraphView.hitLinkDelete) and tap it
    const dFrom = mg.getState().graph.nodes.find((n) => n.id === delLink.from);
    const dTo = mg.getState().graph.nodes.find((n) => n.id === delLink.to);
    const dmx = (dFrom.pos.x + 120 + dTo.pos.x) / 2;
    const dmy = (dFrom.pos.y + 32 + (dTo.pos.y + 32)) / 2 + 6 / gv.view.scale;
    assert(
      gv.hitLinkDelete(dmx, dmy) === delLink.id,
      `hitLinkDelete should find ${delLink.id} at the ✕, got ${gv.hitLinkDelete(dmx, dmy)}`,
    );
    gv.input._down(dn(3, dmx, dmy)); // [tap] on the ✕
    gv.input._up(dn(3, dmx, dmy));
    assert(
      mg.getState().graph.links.length === beforeLinks - 1,
      `RemoveLink via ✕ did not drop a link (${beforeLinks} -> ${mg.getState().graph.links.length})`,
    );
    console.log("    [tap] GraphView link reveal + ✕ tap -> RemoveLink");

    // --- B1: a pan-drag that STARTS on a link must NOT toggle its reveal; a tap DOES ---
    const gv2Host = new FakeEl("div");
    const gv2 = new GraphView(gv2Host, mg, {});
    gv2.render(snap(mg));
    const linkB = mg.getState().graph.links[0];
    const fromN = mg.getState().graph.nodes.find((n) => n.id === linkB.from);
    const toN = mg.getState().graph.nodes.find((n) => n.id === linkB.to);
    const mgx = (fromN.pos.x + 120 + toN.pos.x) / 2;
    const mgy = (fromN.pos.y + 32 + toN.pos.y + 32) / 2;
    assert(
      gv2.hitLink(mgx, mgy) === linkB.id,
      `hitLink should find ${linkB.id} at link midpoint, got ${gv2.hitLink(mgx, mgy)}`,
    );
    const pdn = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y });
    gv2.input._down(pdn(2, mgx, mgy));
    gv2.input._move(pdn(2, mgx + 80, mgy + 60));
    gv2.input._up(pdn(2, mgx + 80, mgy + 60));
    assert(
      gv2.selectedLinkId == null,
      "a pan-drag starting on a link wrongly revealed it (B1 violation)",
    );
    // the pan-drag above moved the view; reset to identity so the tap's screen
    // coords map back to the same graph coords (screen == graph at scale 1, tx/ty 0)
    gv2.view = { scale: 1, tx: 0, ty: 0 };
    gv2.input._down(pdn(3, mgx, mgy));
    gv2.input._up(pdn(3, mgx, mgy));
    assert(gv2.selectedLinkId === linkB.id, "a tap on a link should reveal it");
    console.log(
      "    [wired] GraphInput link tap reveals; pan-drag on link does not (B1)",
    );

    // --- RemoveNode via the NodeInspector Remove button ---
    const d2 = recordingDispatch(mg);
    const beforeNodes = mg.getState().graph.nodes.length;
    const niHost2 = renderPanel(NodeInspector(snap(mg), d2, "n_market_0"));
    const rmBtn = niHost2.querySelector(".ni-remove");
    assert(rmBtn, "NodeInspector rendered no Remove button");
    rmBtn.onclick(); // [click]
    assert(
      d2.last.type === "RemoveNode" && d2.last.nodeId === "n_market_0",
      `expected RemoveNode n_market_0, got ${JSON.stringify(d2.last)}`,
    );
    assert(
      mg.getState().graph.nodes.length === beforeNodes - 1,
      "RemoveNode did not drop the node",
    );
    assert(
      !mg.getState().graph.nodes.some((n) => n.id === "n_market_0"),
      "removed node still present",
    );
    console.log("    [click] NodeInspector Remove button -> RemoveNode");
  },
);

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------
console.log(
  "\n==================== PLAYTHROUGH PROBE SUMMARY ====================",
);
for (const r of results) {
  console.log(
    `  ${r.pass ? "PASS" : "FAIL"}  step ${r.n}: ${r.name}${r.pass ? "" : "  <-- " + r.err}`,
  );
}
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} steps passed.`);
if (fails.length) {
  console.log("\nFAILURES:");
  for (const f of fails) console.log(`  step ${f.n} (${f.name}): ${f.err}`);
  process.exit(1);
}
console.log(
  "PROBE PASS: full play-session reachable through the real UI layer.",
);
