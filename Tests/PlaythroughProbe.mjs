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
  location: { hash: "" },
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
const { heroPower } = await import("../Source/Engine/Systems/HeroSystem.js");
const { applyOffline } = await import("../Source/Engine/Simulation/Offline.js");

const { ResearchTree } = await import("../Source/UI/ResearchTree.js");
const { BuildMenu } = await import("../Source/UI/BuildMenu.js");
const { NodeInspector } = await import("../Source/UI/NodeInspector.js");
const { HeroPanel } = await import("../Source/UI/HeroPanel.js");
const { ExpeditionBoard } = await import("../Source/UI/ExpeditionBoard.js");
const { Victory } = await import("../Source/UI/Victory.js");
const { victoryReady } = await import("../Source/UI/Logic/Selectors.js");
const { OfflineSummary } = await import("../Source/UI/OfflineSummary.js");
const { Tooltip } = await import("../Source/UI/Tooltip.js");
const { Hud } = await import("../Source/UI/Hud.js");
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
    return game.dispatch(intent);
  };
  return d;
}

// ----------------------------------------------------------------------------
// Boot a game
// ----------------------------------------------------------------------------
const clock = new FakeClock(1_000_000);
const game = new Game({ content, clock });
game.bootstrap(new MemoryStorageAdapter());

// ============================================================================
// STEP 1 — initial factory + HUD gold ~25 and a >0 gold/s after a few ticks
// ============================================================================
step(
  1,
  "Initial seed factory renders; HUD gold ~25 then >0 gold/s after ticks",
  () => {
    const s0 = snap(game);
    // Seed Mine -> Smelt -> Market present
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

    // HUD renders gold ~25 (Snapshot.build is source; HUD reflects it)
    const router = { current: "factory" };
    const hudEl = new FakeEl("header");
    const hud = new Hud(hudEl, router);
    hud.render(s0);
    // Check the structured gold currency cell (text concatenation would abut the rate).
    assert(
      s0.currencyStrings.gold === "25",
      `snapshot gold string ${s0.currencyStrings.gold}, expected 25`,
    );
    const goldCell = hudEl.querySelectorAll(".hud-cur")[0];
    assert(goldCell, "HUD rendered no gold currency cell");
    const goldValText = goldCell.querySelector(".val").text;
    assert(
      goldValText.includes("25"),
      `HUD gold cell "${goldValText}" did not show 25`,
    );
    // HUD must render multiple currency cells + tabs (regression: "first child only" bug)
    assert(
      hudEl.querySelectorAll(".hud-cur").length === 3,
      `HUD rendered ${hudEl.querySelectorAll(".hud-cur").length} currency cells (expected 3 — first-child-only regression?)`,
    );
    assert(
      hudEl.querySelectorAll(".hud-tabs a").length === 4,
      `HUD rendered ${hudEl.querySelectorAll(".hud-tabs a").length} tabs (expected 4)`,
    );

    // A few ticks should produce a positive gold rate (seed chain sells iron_bar).
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
    const placeBtns = host.querySelectorAll(".bm-place");
    assert(
      placeBtns.length > 0,
      "BuildMenu rendered no workshop recipe buttons",
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
    const smBtns = host.querySelectorAll(".bm-place");
    assert(smBtns.length > 0, "no smelter recipe buttons");
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

    // --- Market sale yields gold + research tithe (via NodeInspector Sell button) ---
    // Put sellable stock on the seed market-feeding smelter and sell it through the UI.
    const node = game
      .getState()
      .graph.nodes.find((n) => n.id === "n_smelter_0");
    node.stockpile.iron_bar = 10;
    delete game.getState()._solved;
    const goldBefore = game.getState().currencies.gold;
    const resBefore = game.getState().currencies.research;
    const sellDispatch = recordingDispatch(game);
    const niHost = renderPanel(
      NodeInspector(snap(game), sellDispatch, "n_smelter_0"),
    );
    const sellBtn = niHost.querySelector(".ni-sell");
    assert(
      sellBtn,
      "NodeInspector rendered no Sell button for stocked smelter",
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

// ============================================================================
// STEP 5 — equip T1 gear via HeroPanel; level hero; heroPower rises + shown
// ============================================================================
step(
  5,
  "Equip T1 gear via HeroPanel select; level hero; power rises and panel reflects it",
  () => {
    game.getState().currencies.renown = 100000;
    delete game.getState()._solved;
    const heroId = game.getState().heroes[0].id;
    const p0 = heroPower(game.getState(), content, heroId);

    // Equip each slot via the rendered <select>.onchange handler.
    const slots = [
      ["weapon", "sword"],
      ["armor", "armor"],
      ["accessory", "shield"],
    ];
    for (const [slot] of slots) {
      const dispatch = recordingDispatch(game);
      const host = renderPanel(HeroPanel(snap(game), dispatch));
      const selects = host.querySelectorAll(".hp-equip");
      // slots render in order weapon, armor, accessory for hero 0
      const idx = ["weapon", "armor", "accessory"].indexOf(slot);
      const sel = selects[idx];
      assert(sel, `HeroPanel rendered no select for slot ${slot}`);
      assert(
        typeof sel.onchange === "function",
        `select for ${slot} has no onchange`,
      );
      // MINOR: gear option labels must use the resource display, never "undefined T#"
      const optText = sel.querySelectorAll("option").map((o) => o.text);
      assert(
        !optText.some((t) => /undefined/.test(t)),
        `HeroPanel ${slot} option labels contain "undefined": ${JSON.stringify(optText)}`,
      );
      const tierOpt = optText.find((t) => /T1$/.test(t));
      assert(
        tierOpt && /[A-Za-z]/.test(tierOpt),
        `HeroPanel ${slot} T1 option has no display name: ${JSON.stringify(optText)}`,
      );
      sel.onchange({ target: { value: "1" } }); // [click] choose T1
      assert(
        dispatch.last.type === "EquipItem" &&
          dispatch.last.slot === slot &&
          dispatch.last.tier === 1,
        `expected EquipItem ${slot} T1, got ${JSON.stringify(dispatch.last)}`,
      );
    }
    const pGear = heroPower(game.getState(), content, heroId);
    assert(
      pGear === p0 + 30,
      `gear power expected ${p0 + 30} (10+12+8), got ${pGear}`,
    );
    console.log("    [click] HeroPanel equip selects (onchange)");

    // Level the hero via the rendered Level Up button.
    const lvlDispatch = recordingDispatch(game);
    const host = renderPanel(HeroPanel(snap(game), lvlDispatch));
    const lvlBtn = host.querySelector(".hp-levelup");
    assert(lvlBtn, "HeroPanel rendered no Level Up button");
    const lvlBefore = game.getState().heroes[0].level;
    lvlBtn.onclick(); // [click]
    assert(
      lvlDispatch.last.type === "LevelUpHero",
      "Level Up did not dispatch LevelUpHero",
    );
    assert(
      game.getState().heroes[0].level === lvlBefore + 1,
      "hero level did not rise",
    );
    const pAfter = heroPower(game.getState(), content, heroId);
    assert(
      pAfter === pGear + 5,
      `power after level expected ${pGear + 5}, got ${pAfter}`,
    );

    // The HeroPanel must SHOW the new power.
    const finalHost = renderPanel(
      HeroPanel(snap(game), recordingDispatch(game)),
    );
    const powerText = finalHost.querySelector(".hp-power").text;
    assert(
      powerText.includes(String(pAfter)),
      `HeroPanel power text "${powerText}" does not show power ${pAfter}`,
    );
    console.log(
      "    [click] HeroPanel Level Up button (power reflected in panel)",
    );
  },
);

// ============================================================================
// STEP 6 — launch t_gatehouse via ExpeditionBoard: gated below power, launchable
//          at/above; fast-forward; resolves -> renown+reclaim+unlock+board advances
// ============================================================================
step(
  6,
  "ExpeditionBoard gates t_gatehouse below power, launches at power; resolves with unlock + advance",
  () => {
    const heroId = game.getState().heroes[0].id;

    // First confirm gating: temporarily strip power below 30 by un-equipping is not
    // exposed; instead build a low-power snapshot by reading current power vs req.
    // Current power is 40 (30 gear + level 2*5). Required for t_gatehouse is 30 -> ready.
    // To prove the gated branch, render a board with a synthetic low-power lead via a
    // hand-built snapshot derived from the real one.
    const liveSnap = snap(game);
    const lowSnap = JSON.parse(JSON.stringify(liveSnap));
    lowSnap.heroes[0].power = 5; // below 30
    const gateHost = renderPanel(
      ExpeditionBoard(lowSnap, recordingDispatch(game)),
    );
    // the gatehouse card (status underpowered) renders a disabled launch + nudge
    const lockedBtns = gateHost.querySelectorAll(".exp-launch.locked");
    assert(
      lockedBtns.length >= 1,
      "underpowered gatehouse did not render a locked Launch",
    );
    assert(
      gateHost.querySelector(".exp-nudge"),
      "no underpowered nudge rendered",
    );
    // ensure NO affordable launch in the low-power board
    assert(
      gateHost.querySelectorAll(".exp-launch.affordable").length === 0,
      "low-power board still offered an affordable Launch",
    );
    console.log(
      "    [render] underpowered board => locked Launch + nudge (gating verified)",
    );

    // Now launch for real at sufficient power via the rendered Launch button.
    const dispatch = recordingDispatch(game);
    const host = renderPanel(ExpeditionBoard(snap(game), dispatch));
    const launch = host.querySelector(".exp-launch.affordable");
    assert(
      launch,
      "no launchable (affordable) Launch button at sufficient power",
    );
    assert(
      typeof launch.onclick === "function",
      "Launch button has no onclick",
    );
    const renownBefore = game.getState().currencies.renown;
    const bonusBefore = game.getState().unlocks.productionBonuses.gatherer;
    launch.onclick(); // [click]
    assert(
      dispatch.last.type === "StartExpedition" &&
        dispatch.last.territoryId === "t_gatehouse" &&
        dispatch.last.heroId === heroId,
      `expected StartExpedition t_gatehouse, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      game.getState().expeditions.active &&
        game.getState().expeditions.active.territoryId === "t_gatehouse",
      "expedition did not start",
    );
    console.log("    [click] ExpeditionBoard Launch button");

    // Fast-forward the clock past duration; a tick resolves it.
    clock.advance(TERRITORIES.t_gatehouse.durationMs + 1000);
    game.tick(0.05); // [wired] clock fast-forward + tick (the RAF loop's resolve path)
    assert(
      game.getState().territories.reclaimed.includes("t_gatehouse"),
      "t_gatehouse not reclaimed after fast-forward + tick",
    );
    assert(
      game.getState().currencies.renown >= renownBefore + 10,
      `renown reward not applied (before ${renownBefore}, after ${game.getState().currencies.renown})`,
    );
    const bonusAfter = game.getState().unlocks.productionBonuses.gatherer;
    assert(
      bonusAfter > bonusBefore,
      `gatherer factory unlock did not fire (${bonusBefore} -> ${bonusAfter})`,
    );

    // Board advances: t_smithyward becomes the next available target.
    const s = snap(game);
    const gate = s.territories.find((t) => t.id === "t_gatehouse");
    const smithy = s.territories.find((t) => t.id === "t_smithyward");
    assert(
      gate.status === "reclaimed",
      `gatehouse status=${gate.status}, expected reclaimed`,
    );
    assert(
      smithy.isNext && smithy.status === "available",
      `board did not advance to t_smithyward (isNext=${smithy.isNext}, status=${smithy.status})`,
    );
    console.log("    [wired] clock fast-forward + game.tick resolve");
  },
);

// ============================================================================
// STEP 7 — drive to victory (reclaim all 6 in order); Victory overlay renders
// ============================================================================
step(
  7,
  "Drive remaining territories to victory; Victory overlay renders epilogue + free-play",
  () => {
    game.getState().currencies.renown = 1_000_000;
    delete game.getState()._solved;
    const heroId = game.getState().heroes[0].id;

    function nextTerr() {
      const st = game.getState();
      return Object.values(content.territories)
        .filter((t) => !st.territories.reclaimed.includes(t.id))
        .sort((a, b) => a.order - b.order)[0];
    }

    let guard = 0;
    while (!game.getState().meta.won && guard++ < 50) {
      const terr = nextTerr();
      if (!terr) break;
      // equip best unlocked tiers via HeroPanel selects
      const st = game.getState();
      const best = {};
      for (const g of st.unlocks.gearTiersUnlocked)
        best[g.itemId] = Math.max(best[g.itemId] || 0, g.tier);
      for (const [slot, itemId] of [
        ["weapon", "sword"],
        ["armor", "armor"],
        ["accessory", "shield"],
      ]) {
        const dispatch = recordingDispatch(game);
        const host = renderPanel(HeroPanel(snap(game), dispatch));
        const idx = ["weapon", "armor", "accessory"].indexOf(slot);
        const sel = host.querySelectorAll(".hp-equip")[idx];
        const tier = best[itemId] || 1;
        // only fire if the select offers that tier option
        const hasOpt = sel
          .querySelectorAll("option")
          .some((o) => o.getAttribute("value") === String(tier));
        if (hasOpt) sel.onchange({ target: { value: String(tier) } });
      }
      // level until power >= required, via the Level Up button
      let safety = 0;
      while (
        heroPower(game.getState(), content, heroId) < terr.requiredPower &&
        safety++ < 500
      ) {
        const dispatch = recordingDispatch(game);
        const host = renderPanel(HeroPanel(snap(game), dispatch));
        const btn = host.querySelector(".hp-levelup");
        assert(
          btn && typeof btn.onclick === "function",
          `no Level Up button for ${terr.id}`,
        );
        btn.onclick();
      }
      // launch via ExpeditionBoard button
      const dispatch = recordingDispatch(game);
      const host = renderPanel(ExpeditionBoard(snap(game), dispatch));
      const launch = host.querySelector(".exp-launch.affordable");
      assert(
        launch,
        `no Launch button for ${terr.id} at power ${heroPower(game.getState(), content, heroId)}/${terr.requiredPower}`,
      );
      launch.onclick();
      assert(
        game.getState().expeditions.active,
        `expedition ${terr.id} did not start`,
      );
      clock.advance(terr.durationMs + 1000);
      game.tick(0.05);
      assert(
        game.getState().territories.reclaimed.includes(terr.id),
        `${terr.id} not reclaimed`,
      );
    }

    const allReclaimed = Object.keys(content.territories).every((id) =>
      game.getState().territories.reclaimed.includes(id),
    );
    assert(allReclaimed, "not all 6 territories reclaimed");
    assert(
      game.getState().meta.won === true,
      "meta.won false after clearing all",
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
    // the Continue button closes the overlay (free-play continues)
    const closeBtn = vHost.querySelector(".victory-close");
    assert(
      closeBtn && typeof closeBtn.onclick === "function",
      "no victory close button",
    );
    closeBtn.onclick();
    assert(closed, "victory close handler did not fire");
    // snapshot still won:true after closing (free-play; content unlocked)
    assert(
      snap(game).meta.won === true,
      "meta.won flipped false after closing victory",
    );
    console.log(
      "    [click] HeroPanel/ExpeditionBoard buttons + Victory close (free-play)",
    );
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
    assert(
      /\+/.test(text) && text.includes("🪙"),
      `OfflineSummary did not render gained amounts; text="${text}"`,
    );
    // It must show the actual gold gained.
    const goldShown = Math.round(summary.gained.gold);
    assert(
      text.replace(/,/g, "").includes(String(goldShown)),
      `OfflineSummary text "${text}" missing gold ${goldShown}`,
    );
    const closeBtn = host.querySelector(".os-close");
    assert(
      closeBtn && typeof closeBtn.onclick === "function",
      "no offline close button",
    );
    closeBtn.onclick();
    assert(closed, "offline close handler did not fire");
    console.log(
      `    [render+click] OfflineSummary (gained 🪙${goldShown} over ${summary.appliedMs}ms)`,
    );
  },
);

// ============================================================================
// STEP 9 — Onboarding: tooltips advance; DismissTooltip persists through save R/T
// ============================================================================
step(
  9,
  "Tooltips advance via Dismiss button; seen-flag survives serialize/deserialize",
  () => {
    // Fresh game with default tutorial flags.
    const tclock = new FakeClock(0);
    const tg = new Game({ content, clock: tclock });
    tg.bootstrap(new MemoryStorageAdapter());

    // First tip should be the gold tip (TUTORIAL_ORDER[0]).
    const dispatch = recordingDispatch(tg);
    const host1 = renderPanel(Tooltip(snap(tg), dispatch));
    assert(
      host1.querySelector("#TooltipLayer"),
      "no tooltip rendered initially",
    );
    const text1 = host1.querySelector(".tip-text").text;
    assert(/Gold/.test(text1), `first tip not the gold tip: "${text1}"`);
    const dismiss1 = host1.querySelector(".tip-dismiss");
    assert(
      dismiss1 && typeof dismiss1.onclick === "function",
      "no tip dismiss button",
    );
    dismiss1.onclick(); // [click]
    assert(
      dispatch.last.type === "DismissTooltip" &&
        dispatch.last.flag === "seenGoldTip",
      `expected DismissTooltip seenGoldTip, got ${JSON.stringify(dispatch.last)}`,
    );
    assert(
      tg.getState().meta.tutorialFlags.seenGoldTip === true,
      "seenGoldTip flag not set after dismiss",
    );

    // Tooltip must ADVANCE to the next step (upgrade tip).
    const host2 = renderPanel(Tooltip(snap(tg), dispatch));
    const text2 = host2.querySelector(".tip-text").text;
    assert(
      text2 !== text1,
      "tooltip did not advance to a new tip after dismiss",
    );
    assert(
      /Upgrade/i.test(text2),
      `second tip not the upgrade tip: "${text2}"`,
    );
    console.log("    [click] Tooltip Dismiss button (advances to next tip)");

    // Persist the seen-flag through a real serialize/deserialize round-trip.
    const json = serialize(tg.getState(), 0);
    const restored = deserialize(json, tclock);
    assert(
      restored.meta.tutorialFlags.seenGoldTip === true,
      "seenGoldTip did NOT survive serialize/deserialize round-trip",
    );
    console.log("    [round-trip] DismissTooltip flag persisted");
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

    // --- RemoveLink via the ✕ midpoint control in GraphView ---
    gv.render(snap(mg));
    const beforeLinks = mg.getState().graph.links.length;
    const delX = gvHost.querySelector(".link-delete");
    assert(delX, "GraphView rendered no link-delete ✕ control");
    assert(
      typeof delX.onclick === "function",
      "link-delete control has no onclick",
    );
    delX.onclick(); // [click]
    assert(
      mg.getState().graph.links.length === beforeLinks - 1,
      `RemoveLink via ✕ did not drop a link (${beforeLinks} -> ${mg.getState().graph.links.length})`,
    );
    console.log("    [click] GraphView link ✕ -> RemoveLink");

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
