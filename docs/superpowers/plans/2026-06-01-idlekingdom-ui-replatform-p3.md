# IdleKingdom UI Re-platform — Phase 3 (Factory panels + node/link items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the factory side-panels (BuildMenu + NodeInspector) onto keyed Web Awesome `wa-card`/`wa-select`/`wa-button` components, add the derived `throughput`/`atCapacity`/`starved` snapshot fields, mirror MAX/starved cues on the SVG node cards, and convert always-on link labels to a tap-to-reveal control routed through `GraphInput`.

**Architecture:** The only engine-adjacent change is three additive, derived, frozen read-model fields on each Snapshot node (`throughput`, `atCapacity`, `starved`) plus a corrected `capacityPct`; `RateSolver` and all other engine code stay untouched, so the 256-test suite holds. BuildMenu/NodeInspector emit WA custom elements through the already-shipped `h()`/`patch` extensions (`onWa*` events, `prop:` properties) from Phase 1 — keyed so the 2s HUD re-render and intent re-renders reuse open dropdowns in place. The hand-rolled SVG canvas (`GraphView`/`GraphInput`) stays bespoke: node cards gain a small SVG MAX/starved badge + `.cap-fill` modifier classes, and link labels become click-to-reveal driven by a new `GraphView.selectedLinkId` toggled only on a tap hit-tested through `GraphInput.hitLink()`.

**Tech Stack:** Vanilla JS ESM (buildless), Web Awesome v3.7.0 (vendored, loaded in P1), Font Awesome Pro Duotone `<i>` icons via `Source/UI/Icons.js`, hand-rolled SVG canvas, zero-dep node test runner (`Tests/RunAll.js`), Apache static hosting, service worker (`idlekingdom-v6`).

**Spec:** docs/superpowers/specs/2026-06-01-idlekingdom-ui-replatform-design.md  ·  **Prereq:** Phase 1 (foundation: vendored WA/FA, `Icons.js`, `WaTheme.css`, the `Dom.js` `onWa*`/`prop:` extensions, de-emoji'd `fmtCost(amount)` returning text-only) + Phase 2 (HUD + tabs) shipped.

---

### Established conventions reused from P1/P2 (do NOT redefine)

- Icons: `import { icon } from "./Icons.js"` — `icon(concept)` returns an `<i>` Duotone vnode; `iconName(concept)` returns the FA name string. Never emoji. The icon map already contains `gatherer`/`smelter`/`workshop`/`market`/`scholar`, every resource id, `upgrade`/`sell`/`remove`/`connect`, `max` (`gauge-high`), `starved` (`triangle-exclamation`), and all currency concepts.
- `Source/UI/Render/Dom.js` extensions are ALREADY present and inert until used: a prop named `onWa<Event>` (camelCase) adds an `addEventListener` for the kebab custom event (`onWaHide` → `wa-hide`); a prop named `prop:<name>` assigns the DOM PROPERTY (`prop:value`, `prop:open`). Standard form events (`onchange`/`oninput`) stay on the plain `on*` → DOM-handler path. Do NOT modify `Dom.js` in this phase.
- KEY every `wa-select` and interactive component (`key:"recipe-"+node.id`) so the 2s HUD re-render (`refreshHud()` — HUD only) and intent re-renders reuse the element in place and never tear down an open dropdown. `prop:value` always reflects the authoritative snapshot value; the `!==` guard in `Dom.js` is for thrash-avoidance only, not correctness (spec M3) — keep selects keyed and let the value track the snapshot.
- Render cadence is LOCKED: panels render on intents + expedition-resolve; HUD-only on a 2s interval. `App._renderScreen` owns screen rendering; do NOT reintroduce per-frame rendering.
- Theme tokens live in `Source/Styles/WaTheme.css` (fantasy palette: `--parchment`/`-dk`, `--ink`, `--iron`, `--gold`, `--good`, `--bad`). Component look comes from `variant`/`appearance` attrs + tokens — do not hand-paint backgrounds on WA elements.
- Keep the SEMANTIC CSS classes on the new `wa-*` elements (`.bm-machine`, `.bm-place`, `.ni-recipe`, `.ni-gatherer`, `.ni-sell`, `.ni-upgrade`, `.ni-remove`) so the PlaythroughProbe's selectors survive.
- `fmtCost` is text-only after P1: `fmtCost(amount)` returns just the formatted number string (e.g. `"15"`). Prepend the currency icon as a sibling vnode (`[icon("gold"), " ", fmtCost(node.upgradeCost)]`).

**Sequencing gate:** Task 3.1 (the additive Snapshot fields) MUST land first — BuildMenu/NodeInspector/GraphView all read `node.throughput`/`atCapacity`/`starved`/corrected `capacityPct`, and the node-test lane pins them before any UI work. Tasks 3.2–3.5 then build the UI on top. Task 3.6 migrates the probe; Task 3.7 deploys + browser-accepts.

---

### Task 3.1: Additive Snapshot read-model fields (`throughput`/`atCapacity`/`starved`) + corrected `capacityPct` (TDD)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Engine/Snapshot.js`
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/Snapshot.Test.js`

- [ ] **Step 1: Write the failing table-driven assertions.** Append this block to `Tests/Snapshot.Test.js` (inside the file; it already imports `seededState`, `FakeClock`, `solve`, `build`, and `content`). Add a `NewGame` import at the top alongside the existing imports, then add the new `describe` at the end of the file:

At the top of `Tests/Snapshot.Test.js`, after the existing import block, add:

```js
import { NewGame } from "../Source/Engine/GameState.js";
```

At the end of the file (after the existing `describe("Snapshot", ...)` closes), add:

```js
// P3: derived throughput / atCapacity / starved read-model fields (spec §8).
// Producers (gatherer/smelter/workshop) -> throughput = Σ availableOut.
// Consumers (scholar/market)            -> throughput = Σ perNodeDraw (input draw).
// atCapacity = cap>0 && throughput >= cap-EPS; starved = cap>0 && takesInput && throughput < cap-EPS.
// Helper: build a 1+-node graph state directly (RateSolver runs on topology, not unlocks,
// except market listings which the seed/StartState already grants for iron_bar etc).
function graphState(clock, nodes, links = []) {
  const s = NewGame(clock);
  s.graph = {
    nodes,
    links,
    nextNodeSeq: nodes.length,
    nextLinkSeq: links.length,
  };
  delete s._solved;
  return s;
}

describe("Snapshot.throughput/atCapacity/starved (§8)", () => {
  it("full-fed gatherer -> atCapacity true, starved false (gatherers take no input)", () => {
    // seed miner: gatherer iron_ore L1, cap 1.0, availableOut {iron_ore:1.0} -> throughput 1.0
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const miner = snap.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.throughput).toBeCloseTo(1.0, 1e-9);
    expect(miner.capacity).toBeCloseTo(1.0, 1e-9);
    expect(miner.atCapacity).toBe(true);
    expect(miner.starved).toBe(false);
  });

  it("under-fed (disconnected) smelter -> starved true, atCapacity false", () => {
    // smelter r_iron_bar (cap 0.5) with no inbound link: incoming iron_ore 0 -> out 0 -> throughput 0 < cap
    const s = graphState(new FakeClock(0), [
      { id: "sm", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 0, y: 0 } },
    ]);
    const snap = build(s, solve(s, content), content);
    const sm = snap.nodes.find((n) => n.id === "sm");
    expect(sm.capacity).toBeCloseTo(0.5, 1e-9);
    expect(sm.throughput).toBeCloseTo(0, 1e-9);
    expect(sm.starved).toBe(true);
    expect(sm.atCapacity).toBe(false);
    expect(sm.capacityPct).toBeCloseTo(0, 1e-9);
  });

  it("fully-fed scholar -> atCapacity true, starved false (throughput = input draw)", () => {
    // forester(timber,cap1) -> workshop(r_parchment,cap0.5 -> 0.5 parchment) -> scholar(cap0.5, draws 0.5)
    const s = graphState(
      new FakeClock(0),
      [
        { id: "for", kind: "gatherer", level: 1, resourceId: "timber", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
        { id: "ws", kind: "workshop", level: 1, resourceId: null, recipeId: "r_parchment", stockpile: {}, pos: { x: 1, y: 0 } },
        { id: "sch", kind: "scholar", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 2, y: 0 } },
      ],
      [
        { id: "la", from: "for", to: "ws", resourceId: "timber" },
        { id: "lb", from: "ws", to: "sch", resourceId: "parchment" },
      ],
    );
    const snap = build(s, solve(s, content), content);
    const sch = snap.nodes.find((n) => n.id === "sch");
    expect(sch.capacity).toBeCloseTo(0.5, 1e-9);
    expect(sch.throughput).toBeCloseTo(0.5, 1e-9); // input draw, NOT availableOut (which is {})
    expect(sch.atCapacity).toBe(true);
    expect(sch.starved).toBe(false);
    expect(sch.capacityPct).toBeCloseTo(1.0, 1e-9);
  });

  it("market scaled below cap -> starved true (consumer throughput < cap)", () => {
    // seed market: cap 5.0, draws 0.5 iron_bar (smelter output) -> throughput 0.5 < 5.0
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const market = snap.nodes.find((n) => n.id === "n_market_0");
    expect(market.capacity).toBeCloseTo(5.0, 1e-9);
    expect(market.throughput).toBeCloseTo(0.5, 1e-9);
    expect(market.starved).toBe(true);
    expect(market.atCapacity).toBe(false);
  });

  it("unconfigured gatherer (resourceId null) -> neither atCapacity nor starved", () => {
    // gatherer with no resource: cap 1.0 (base) but availableOut {} -> throughput 0; takesInput false
    const s = graphState(new FakeClock(0), [
      { id: "g0", kind: "gatherer", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
    ]);
    const snap = build(s, solve(s, content), content);
    const g0 = snap.nodes.find((n) => n.id === "g0");
    expect(g0.throughput).toBeCloseTo(0, 1e-9);
    expect(g0.atCapacity).toBe(false);
    expect(g0.starved).toBe(false);
  });

  it("keeps effectiveRate = producer output for back-compat (consumers stay 0)", () => {
    const s = seededState(new FakeClock(0));
    const snap = build(s, solve(s, content), content);
    const smelter = snap.nodes.find((n) => n.id === "n_smelter_0");
    const market = snap.nodes.find((n) => n.id === "n_market_0");
    expect(smelter.effectiveRate).toBeCloseTo(0.5, 1e-9); // producer rate unchanged
    expect(market.effectiveRate).toBeCloseTo(0, 1e-9); // market availableOut is {} -> 0
    expect(market.throughput).toBeCloseTo(0.5, 1e-9); // but throughput uses draw
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node Tests/RunAll.js Snapshot.throughput` — Expected: the 6 new cases FAIL (`throughput`/`atCapacity`/`starved` are `undefined`; `capacityPct` for the disconnected smelter/scholar is currently `effectiveRate/cap` not `throughput/cap`).

- [ ] **Step 3: Add the derived fields in `Source/Engine/Snapshot.js`.** Replace the existing `nodes` map block (lines 29–50, the `state.graph.nodes.map(...)` that returns the node read-model) with this. It keeps `effectiveRate = producerRate` for back-compat, adds the three new fields, and fixes `capacityPct` to use `throughput`:

```js
  const nodes = state.graph.nodes.map((node) => {
    const cap = (solved.capacityByNode && solved.capacityByNode[node.id]) || 0;
    const out = (solved.availableOut && solved.availableOut[node.id]) || {};
    const drawMap = (solved.perNodeDraw && solved.perNodeDraw[node.id]) || {};
    const producerRate = Object.values(out).reduce((a, b) => a + b, 0);
    const consumerRate = Object.values(drawMap).reduce((a, b) => a + b, 0);
    const isConsumer = node.kind === "scholar" || node.kind === "market";
    const throughput = isConsumer ? consumerRate : producerRate;
    const takesInput = node.kind !== "gatherer"; // gatherers take no input -> never starved
    const EPS = 1e-6;
    const atCapacity = cap > 0 && throughput >= cap - EPS;
    const starved = cap > 0 && takesInput && throughput < cap - EPS;
    const cost = upgradeCost(node.kind, node.level, content);
    return {
      id: node.id,
      kind: node.kind,
      level: node.level,
      resourceId: node.resourceId,
      recipeId: node.recipeId,
      pos: { x: node.pos.x, y: node.pos.y },
      capacity: cap,
      effectiveRate: producerRate, // unchanged meaning (producer output)
      throughput, // NEW: producer output, or consumer input draw
      capacityPct: cap > 0 ? throughput / cap : 0, // now correct for consumers
      atCapacity, // NEW
      starved, // NEW
      draw: drawMap,
      surplus: (solved.surplusRate && solved.surplusRate[node.id]) || {},
      stockpile: { ...node.stockpile },
      upgradeCost: cost,
      canAfford: state.currencies.gold >= cost,
    };
  });
```

- [ ] **Step 4: Run it, expect PASS.** Run: `node Tests/RunAll.js Snapshot` — Expected: all Snapshot cases green (existing + 6 new).

- [ ] **Step 5: Run the FULL suite — engine stays green.** Run: `node Tests/RunAll.js | tail -1` — Expected: `262 passed, 0 failed, 262 total` (256 prior + 6 new; if P1/P2 added suites the count is higher — the invariant is `0 failed`).

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Engine/Snapshot.js Tests/Snapshot.Test.js
git commit -m "feat(engine): additive Snapshot throughput/atCapacity/starved fields + fix capacityPct for consumers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: BuildMenu → `wa-card` + `wa-button` palette/place-actions

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/BuildMenu.js`

- [ ] **Step 1: Rewrite `Source/UI/BuildMenu.js`.** Keep the `BuildMenu(snap, dispatch, ui)` signature, the `variantLabel` helper, the `INTENT.PlaceNode` payloads, and the semantic classes (`.bm-machine`, `.bm-place`). Wrap the panel in a keyed `wa-card`, render the machine palette as `wa-button`s (`size=s`, `pill`, `appearance` accent when selected else outlined, `start`-slot kind icon), and place-actions as full-width filled `wa-button`s with a `start`-slot resource/output icon. Replace `${res.icon}` (emoji) with `icon(res.id)`:

```js
import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { GATHERER_VARIANTS } from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

// UI label for the gatherer variant that mines a given raw resource.
function variantLabel(resourceId) {
  for (const v of Object.values(GATHERER_VARIANTS)) {
    if (v.resourceIds.includes(resourceId)) return v.label;
  }
  return "Gatherer";
}

export function BuildMenu(snap, dispatch, ui) {
  // ui = { selectedPaletteKind, setPalette(kind), spawnPos() } owned by App.
  const bm = snap.buildMenu || {
    placeableMachines: [],
    unlockedRecipes: [],
    gathererResources: [],
  };

  const machineButtons = bm.placeableMachines.map((kind) =>
    h(
      "wa-button",
      {
        key: "bm-machine-" + kind,
        class: "bm-machine" + (ui.selectedPaletteKind === kind ? " selected" : ""),
        size: "small",
        pill: true,
        appearance: ui.selectedPaletteKind === kind ? "accent" : "outlined",
        onclick: () => ui.setPalette(kind),
      },
      h("span", { slot: "start" }, icon(kind)),
      kind,
    ),
  );

  const detail = [];
  const kind = ui.selectedPaletteKind;
  if (kind === "gatherer") {
    detail.push(h("div", { class: "bm-detail-title" }, "Assign raw:"));
    for (const rid of bm.gathererResources || []) {
      const res = RESOURCES[rid];
      if (!res) continue;
      detail.push(
        h(
          "wa-button",
          {
            key: "bm-place-gatherer-" + rid,
            class: "bm-place",
            appearance: "filled",
            "with-caret": false,
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind: "gatherer",
                resourceId: rid,
                pos: ui.spawnPos(),
              }),
          },
          h("span", { slot: "start" }, icon(rid)),
          `${variantLabel(rid)}: ${res.display}`,
        ),
      );
    }
  } else if (kind === "smelter" || kind === "workshop") {
    detail.push(h("div", { class: "bm-detail-title" }, "Pick recipe:"));
    for (const r of bm.unlockedRecipes) {
      const recipe = RECIPES[r];
      if (!recipe || recipe.crafterKind !== kind) continue;
      const out = RESOURCES[recipe.output];
      detail.push(
        h(
          "wa-button",
          {
            key: "bm-place-recipe-" + r,
            class: "bm-place",
            appearance: "filled",
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind,
                recipeId: r,
                pos: ui.spawnPos(),
              }),
          },
          h("span", { slot: "start" }, icon(recipe.output)),
          out.display,
        ),
      );
    }
  } else if (kind) {
    detail.push(
      h(
        "wa-button",
        {
          key: "bm-place-" + kind,
          class: "bm-place",
          appearance: "filled",
          onclick: () =>
            dispatch({ type: INTENT.PlaceNode, kind, pos: ui.spawnPos() }),
        },
        h("span", { slot: "start" }, icon(kind)),
        `Place ${kind}`,
      ),
    );
  }

  return h(
    "wa-card",
    { key: "buildmenu", class: "build-menu", id: "BuildMenu" },
    h("div", { class: "bm-title" }, h("span", {}, icon("factory")), " Build"),
    h("div", { class: "bm-machines" }, ...machineButtons),
    h("div", { class: "bm-detail" }, ...detail),
  );
}
```

(`with-caret:false` is harmless if WA ignores it; `appearance:"filled"` is the confirmed `wa-button` appearance per spec §6. The `slot="start"` span is a plain attribute passthrough — the icon lands in WA's `start` slot.)

- [ ] **Step 2: Syntax check.** Run: `node --check Source/UI/BuildMenu.js && echo "syntax ok"` — Expected: `syntax ok`.

- [ ] **Step 3: Probe still finds `.bm-place`/`.bm-machine` (no behavior change yet).** Run the probe to confirm the BuildMenu steps (3 + 4) still locate the buttons by class and fire `onclick`: `node Tests/PlaythroughProbe.mjs 2>&1 | grep -E "step (3|4)"` — Expected: `PASS step 3` and `PASS step 4` (the `.bm-place` selector + `.onclick` handler survive on the `wa-button`; the probe shim treats `<wa-button>` as an ordinary FakeEl, and `onclick` stays on the `on*` path).

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/BuildMenu.js
git commit -m "feat(ui): BuildMenu on wa-card + wa-button palette/place-actions with duotone icons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: NodeInspector → `wa-card`, keyed `wa-select`s, `wa-progress-bar`, `wa-tag`, MAX/starved `wa-badge`, WA action buttons

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/NodeInspector.js`

- [ ] **Step 1: Rewrite `Source/UI/NodeInspector.js`.** Keep the `NodeInspector(snap, dispatch, selectedNodeId)` signature, the `INTENT` payloads, and the semantic classes (`.ni-recipe`, `.ni-gatherer`, `.ni-sell`, `.ni-upgrade`, `.ni-remove`). The recipe/gatherer `<select>`s become keyed `wa-select`s using `prop:value` (always the authoritative `node.recipeId`/`node.resourceId`) with `onchange` dispatching the existing intents. The header gets a MAX/starved `wa-badge`. `fmtCost` is text-only — prepend `icon("gold")`:

```js
import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { INTENT } from "../Engine/Intents.js";

export function NodeInspector(snap, dispatch, selectedNodeId) {
  const node = (snap.nodes || []).find((n) => n.id === selectedNodeId);
  if (!node)
    return h(
      "wa-card",
      { key: "inspector", class: "node-inspector empty", id: "NodeInspector" },
      h("span", { class: "ni-empty-ico" }, icon("settings")),
      " Select a node",
    );

  const pct = Math.max(0, Math.min(1, node.capacityPct || 0));

  // header: kind icon + kind name + MAX/starved badge (mutually exclusive)
  const headerKids = [
    h("span", { class: "ni-kind-ico" }, icon(node.kind)),
    " ",
    node.kind,
  ];
  if (node.atCapacity) {
    headerKids.push(
      h(
        "wa-badge",
        { key: "ni-badge", class: "ni-badge max", variant: "success" },
        h("span", { slot: "start" }, icon("max")),
        "MAX",
      ),
    );
  } else if (node.starved) {
    headerKids.push(
      h(
        "wa-badge",
        { key: "ni-badge", class: "ni-badge starved", variant: "warning" },
        h("span", { slot: "start" }, icon("starved")),
        "STARVED",
      ),
    );
  }

  const rows = [
    h("div", { class: "ni-title" }, ...headerKids),
    h("wa-tag", { class: "ni-level", size: "small" }, `Level ${node.level}`),
    h("div", { class: "ni-line" }, `Rate ${fmtRate(node.throughput)} / cap ${fmtRate(node.capacity)}`),
    h("wa-progress-bar", {
      class: "ni-cap" + (node.starved ? " starved" : ""),
      value: Math.round(pct * 100),
    }),
  ];

  // Stockpile + manual sell
  const sp = node.stockpile || {};
  for (const [resId, qty] of Object.entries(sp)) {
    if (qty <= 0) continue;
    const res = RESOURCES[resId];
    if (!res) continue;
    rows.push(
      h(
        "div",
        { class: "ni-stock" },
        h("span", { class: "ni-stock-ico" }, icon(resId)),
        ` ${res.display}: ${fmtNum(qty)} `,
        res.basePrice != null
          ? h(
              "wa-button",
              {
                key: "ni-sell-" + resId,
                class: "ni-sell",
                size: "small",
                appearance: "outlined",
                onclick: () =>
                  dispatch({
                    type: INTENT.SellFromStockpile,
                    nodeId: node.id,
                    resId,
                  }),
              },
              h("span", { slot: "start" }, icon("sell")),
              "Sell",
            )
          : null,
      ),
    );
  }

  // Recipe / raw reassignment — keyed wa-select, prop:value reflects snapshot
  if (node.kind === "smelter" || node.kind === "workshop") {
    const opts = (snap.buildMenu ? snap.buildMenu.unlockedRecipes : [])
      .filter((r) => RECIPES[r] && RECIPES[r].crafterKind === node.kind)
      .map((r) =>
        h(
          "wa-option",
          { value: r },
          h("span", { slot: "start" }, icon(RECIPES[r].output)),
          RESOURCES[RECIPES[r].output].display,
        ),
      );
    rows.push(
      h(
        "wa-select",
        {
          key: "recipe-" + node.id,
          class: "ni-recipe",
          label: "Recipe",
          appearance: "filled",
          "prop:value": node.recipeId || "",
          onchange: (e) =>
            dispatch({
              type: INTENT.SetRecipe,
              nodeId: node.id,
              recipeId: e.target.value,
            }),
        },
        ...opts,
      ),
    );
  } else if (node.kind === "gatherer") {
    const raws = (snap.buildMenu ? snap.buildMenu.gathererResources : []) || [];
    const opts = raws
      .filter((rid) => RESOURCES[rid])
      .map((rid) =>
        h(
          "wa-option",
          { value: rid },
          h("span", { slot: "start" }, icon(rid)),
          RESOURCES[rid].display,
        ),
      );
    rows.push(
      h(
        "wa-select",
        {
          key: "gatherer-" + node.id,
          class: "ni-gatherer",
          label: "Gather",
          appearance: "filled",
          "prop:value": node.resourceId || "",
          onchange: (e) =>
            dispatch({
              type: INTENT.SetGathererResource,
              nodeId: node.id,
              resourceId: e.target.value,
            }),
        },
        ...opts,
      ),
    );
  }

  // Upgrade (brand) — fmtCost is text-only; prepend gold icon
  rows.push(
    h(
      "wa-button",
      {
        key: "ni-upgrade-" + node.id,
        class: "ni-upgrade",
        variant: "brand",
        appearance: "accent",
        disabled: !node.canAfford,
        onclick: () => dispatch({ type: INTENT.UpgradeNode, nodeId: node.id }),
      },
      h("span", { slot: "start" }, icon("upgrade")),
      "Upgrade ",
      icon("gold"),
      " ",
      fmtCost(node.upgradeCost),
    ),
  );

  // Remove (danger)
  rows.push(
    h(
      "wa-button",
      {
        key: "ni-remove-" + node.id,
        class: "ni-remove",
        variant: "danger",
        appearance: "outlined",
        onclick: () => dispatch({ type: INTENT.RemoveNode, nodeId: node.id }),
      },
      h("span", { slot: "start" }, icon("remove")),
      "Remove",
    ),
  );

  return h(
    "wa-card",
    { key: "inspector", class: "node-inspector", id: "NodeInspector" },
    ...rows,
  );
}
```

(`wa-progress-bar`'s `value` is `0..100` per spec §6; the `.starved` class drives a warning fill color in CSS (Task 3.5). `prop:value` set to `node.recipeId || ""` keeps the select coherent even when `recipeId` is null; the select is keyed so the 2s/intent re-render reuses it in place and never closes an open dropdown.)

- [ ] **Step 2: Syntax check.** Run: `node --check Source/UI/NodeInspector.js && echo "syntax ok"` — Expected: `syntax ok`.

- [ ] **Step 3: Probe still finds the inspector controls + fires the right intents.** Run: `node Tests/PlaythroughProbe.mjs 2>&1 | grep -E "step (3|4|13)"` — Expected: `PASS step 3` (Upgrade button via `.ni-upgrade`.onclick → `UpgradeNode`), `PASS step 4` (Sell via `.ni-sell`.onclick → `SellFromStockpile`), `PASS step 13` (gatherer reassign via `.ni-gatherer`.onchange → `SetGathererResource`; Remove via `.ni-remove`.onclick → `RemoveNode`). The probe fires `onchange`/`onclick`, both of which stay on the `on*` DOM-handler path for `wa-select`/`wa-button` under the shim. (If step 13 fails because `e.target.value` is read off the fired event, note the probe passes `{ target: { value: "timber" } }` explicitly — our `onchange` reads `e.target.value`, so it matches. The probe migration in Task 3.6 handles the link-reveal change.)

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/NodeInspector.js
git commit -m "feat(ui): NodeInspector on wa-card/wa-select/wa-button with MAX/starved badge + progress bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4: GraphView node MAX/starved SVG badge + `.cap-fill` modifiers; link click-to-reveal (state + draw)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/GraphView.js`

This task adds the SVG-side presentation: the node-card MAX/starved badge, the `.cap-fill` modifier classes, the `selectedLinkId` state, and the conditional link label/✕ rendering. The hit-test routing (so a tap toggles it) is wired in Task 3.5 via `GraphInput`. After Step 1, GraphView exposes `_selectLink(id)` which Task 3.5's `GraphInput.hitLink` callback will call.

- [ ] **Step 1: Add `selectedLinkId` state + `_selectLink`, and clear it on node-select.** In `Source/UI/GraphView.js`, in the constructor add `this.selectedLinkId = null;` right after `this.selectedId = null;`:

```js
    this.selectedId = null;
    this.selectedLinkId = null; // link whose label/✕ is revealed (UI-only, persists across render(snap))
```

Then replace the existing `_select(id)` method so selecting a node clears any revealed link (node-select and link-reveal are mutually exclusive), and add `_selectLink(id)` + `hitLink(gx,gy)`:

```js
  _select(id) {
    this.selectedId = id;
    this.selectedLinkId = null; // node-select / empty-click clears link reveal
    this.onSelect(id);
    this._draw();
  }

  // Toggle the revealed link (UI-only). Called from GraphInput on a TAP that hit a link.
  _selectLink(id) {
    this.selectedLinkId = this.selectedLinkId === id ? null : id;
    this._draw();
  }

  // Hit-test a link's curve in graph space. Returns the link id under (gx,gy) or null.
  // Sampled along the cubic path; tolerance scaled to a comfortable tap target.
  hitLink(gx, gy) {
    if (!this.snap) return null;
    const tol = 14 / this.view.scale; // graph-space tolerance (~14 screen px)
    for (const l of this.snap.links) {
      const from = this._nodeAt(l.from),
        to = this._nodeAt(l.to);
      if (!from || !to) continue;
      const fp = this._pos(from),
        tp = this._pos(to);
      const a = { x: fp.x + NODE_W, y: fp.y + NODE_H / 2 };
      const b = { x: tp.x, y: tp.y + NODE_H / 2 };
      // sample the straight chord between endpoints (the curve hugs it closely enough for hit-testing)
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        if (Math.hypot(gx - px, gy - py) <= tol) return l.id;
      }
    }
    return null;
  }
```

- [ ] **Step 2: Wire `hitLink` + `selectLink` into the `GraphInput` constructor callbacks.** In the constructor's `new GraphInput(this.svgEl, { ... })` options object, add two callbacks alongside the existing ones (after `onSelect`):

```js
      onSelect: (id) => this._select(id),
      hitLink: (gx, gy) => this.hitLink(gx, gy),
      onSelectLink: (id) => this._selectLink(id),
      onViewChange: () => this._draw(),
```

- [ ] **Step 3: Add the SVG MAX/starved badge to the node card.** In `_drawNode(n, v)`, after the `node-sub` text `g.appendChild(...)` block and before the capacity-bar block, add a small top-right badge driven by `n.atCapacity`/`n.starved`:

```js
    // MAX / starved badge (top-right of the card; mirrors NodeInspector §7)
    if (n.atCapacity || n.starved) {
      const label = n.atCapacity ? "MAX" : "LOW";
      const cls = n.atCapacity ? "node-badge max" : "node-badge starved";
      const bw = 34 * v.scale,
        bh = 14 * v.scale;
      const bx = p.x + w - bw - 4 * v.scale,
        by = p.y + 4 * v.scale;
      g.appendChild(
        svg("rect", {
          class: cls + " node-badge-box",
          x: bx,
          y: by,
          width: bw,
          height: bh,
          rx: 4,
        }),
      );
      g.appendChild(
        svg(
          "text",
          {
            class: cls + " node-badge-text",
            x: bx + bw / 2,
            y: by + bh / 2 + 3.5 * v.scale,
            "text-anchor": "middle",
          },
          [label],
        ),
      );
    }
```

- [ ] **Step 4: Apply the `.cap-fill` modifier class.** In `_drawNode`, change the `cap-fill` rect's `class` from the static `"cap-fill"` to a modifier-aware class:

Replace:

```js
    g.appendChild(
      svg("rect", {
        class: "cap-fill",
        x: p.x + 8,
        y: barY,
        width: (w - 16) * pct,
        height: 4,
      }),
    );
```

with:

```js
    const capCls =
      "cap-fill" +
      (n.atCapacity ? " at-capacity" : n.starved ? " starved" : "");
    g.appendChild(
      svg("rect", {
        class: capCls,
        x: p.x + 8,
        y: barY,
        width: (w - 16) * pct,
        height: 4,
      }),
    );
```

- [ ] **Step 5: Stop always-drawing the link label + ✕; reveal only the selected link; add a wide transparent hit stroke.** In `_draw()`, replace the per-link `g`-building block (currently the link `<path>` + always-on `link-label` `<text>` + the `link-delete-g` group, lines ~204–254) with this. The `link-hit` wide transparent stroke is always present (it's the tap target the `GraphInput.hitLink` test mirrors, and it makes pointer targeting forgiving); the label + ✕ render only when `l.id === this.selectedLinkId`:

```js
        const starved = l.fedPct != null && l.fedPct < 0.999;
        const g = svg("g", {});
        g.appendChild(
          svg("path", {
            class: starved ? "link-path starved" : "link-path",
            d: linkPath(a, b),
          }),
        );
        // wide transparent stroke: forgiving tap target (mirrors GraphInput.hitLink)
        g.appendChild(
          svg("path", { class: "link-hit", d: linkPath(a, b) }),
        );
        if (l.id === this.selectedLinkId) {
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 };
          const res = (this.snap && this.snap.links && RESOURCES[l.resourceId]) || null;
          const display = (RESOURCES[l.resourceId] && RESOURCES[l.resourceId].display) || l.resourceId;
          g.appendChild(
            svg(
              "text",
              {
                class: "link-label",
                x: mid.x,
                y: mid.y,
                "text-anchor": "middle",
              },
              [`${display} · ${(l.flow ?? 0).toFixed(2)}/s`],
            ),
          );
          const del = svg("g", { class: "link-delete-g" });
          del.appendChild(
            svg("circle", {
              class: "link-delete-hit",
              cx: mid.x,
              cy: mid.y + 12,
              r: 10,
              onclick: () =>
                this.game.dispatch({ type: INTENT.RemoveLink, linkId: l.id }),
            }),
          );
          del.appendChild(
            svg(
              "text",
              {
                class: "link-delete",
                x: mid.x,
                y: mid.y + 16,
                "text-anchor": "middle",
                onclick: () =>
                  this.game.dispatch({ type: INTENT.RemoveLink, linkId: l.id }),
              },
              ["✕"],
            ),
          );
          g.appendChild(del);
        }
        return g;
```

(The revealed label uses the resource `display` name, not the raw id, per spec §7. The icon-in-SVG path stays out of the label to keep it a single `<text>` — the duotone resource icon is the node-card concern, not the transient link plaque; spec §7 permits the monochrome path for the SVG link label. The `✕` is the only emoji-like glyph and is an established existing literal kept for the delete affordance — it is NOT a content emoji and is exempt from the panel emoji gate, matching how P1 scoped GraphView.)

- [ ] **Step 6: Import `RESOURCES`.** At the top of `Source/UI/GraphView.js`, add the import (the revealed label needs the display name):

```js
import { RESOURCES } from "../Engine/Content/Resources.js";
```

- [ ] **Step 7: Syntax check.** Run: `node --check Source/UI/GraphView.js && echo "syntax ok"` — Expected: `syntax ok`.

- [ ] **Step 8: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/GraphView.js
git commit -m "feat(ui): GraphView node MAX/starved badge, cap-fill modifiers, link click-to-reveal state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.5: GraphInput link tap hit-test (B1) + Graph/Layout CSS

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/GraphInput.js`
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Graph.css`
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Layout.css`

- [ ] **Step 1: Route the link hit-test through `GraphInput` (B1).** In `Source/UI/GraphInput.js`, in `_down(e)`, the current fall-through is: port hit → connect; node hit → dragNode; else `pan` + `onSelect(null)`. We must NOT toggle the link on `_down` (a bare toggle there would be cleared by the `onSelect(null)` of a pan and breaks pan-drags). Instead: detect a link under the pointer in `_down`, remember it as `this.downLink`, fall through to `pan` (so pan-drags still work), and only toggle the reveal in `_up` if the gesture was a TAP (`moved <= TAP_MOVE_PX`). Record the link in `_down` after the node-hit check, replacing the final `pan` block:

Replace:

```js
    const nodeId = this.cb.hitNode(g.x, g.y);
    if (nodeId) {
      this.mode = "dragNode";
      this.dragNodeId = nodeId;
      this.cb.onSelect(nodeId);
      return;
    }

    this.mode = "pan";
    this.cb.onSelect(null);
    this.el.classList.add("panning");
  }
```

with:

```js
    const nodeId = this.cb.hitNode(g.x, g.y);
    if (nodeId) {
      this.mode = "dragNode";
      this.dragNodeId = nodeId;
      this.cb.onSelect(nodeId);
      return;
    }

    // Empty space (or a link): start a pan, but remember any link under the pointer.
    // We DON'T toggle here — a pan-drag that starts on a link must not reveal it.
    // The reveal toggles in _up only if the gesture was a tap (moved <= TAP_MOVE_PX).
    this.downLink =
      this.cb.hitLink && !nodeId ? this.cb.hitLink(g.x, g.y) : null;
    this.mode = "pan";
    if (!this.downLink) this.cb.onSelect(null); // tapping a link must not clear node-select via the pan path
    this.el.classList.add("panning");
  }
```

Then in `_up(e)`, handle the link tap. Add this block right after the `if (wasMode === "dragNode" ...)` block and before the `if (wasMode === "connect" ...)` block:

```js
    if (wasMode === "pan" && this.downLink && moved <= TAP_MOVE_PX) {
      // a tap (not a pan-drag) on a link toggles its label/✕ reveal
      if (this.cb.onSelectLink) this.cb.onSelectLink(this.downLink);
    } else if (
      wasMode === "pan" &&
      this.downLink &&
      moved > TAP_MOVE_PX &&
      this.cb.onSelect
    ) {
      // a pan-drag that began on a link: it was a pan, so clear any node-select
      this.cb.onSelect(null);
    }
```

And add `this.downLink = null;` to the constructor (next to `this.connectFrom = null;`) and clear it in the `if (this.pointers.size === 0)` reset block in `_up`:

In the constructor, after `this.connectFrom = null;`:

```js
    this.connectFrom = null; // {nodeId, dir, gx, gy} during a mouse drag-connect
    this.downLink = null; // link id under the pointer at _down (for tap-to-reveal)
```

In `_up`, in the `if (this.pointers.size === 0) { ... }` block, add `this.downLink = null;`:

```js
    if (this.pointers.size === 0) {
      this.mode = null;
      this.dragNodeId = null;
      this.connectFrom = null;
      this.downLink = null;
      this.el.classList.remove("panning");
    }
```

- [ ] **Step 2: Syntax check.** Run: `node --check Source/UI/GraphInput.js && echo "syntax ok"` — Expected: `syntax ok`.

- [ ] **Step 3: Add the Graph.css rules** for the link hit stroke, the node MAX/starved badge, and the `.cap-fill` modifiers. Append to `Source/Styles/Graph.css`:

```css
/* P3: wide transparent tap target for link reveal (B1) */
.link-hit {
  stroke: transparent;
  stroke-width: 18;
  fill: none;
  pointer-events: stroke;
  cursor: pointer;
}

/* P3: node MAX / starved badge (SVG) */
.node-badge-box.max {
  fill: var(--good);
}
.node-badge-box.starved {
  fill: var(--bad);
}
.node-badge-text {
  fill: var(--parchment);
  font-size: 9px;
  font-weight: 700;
}

/* P3: capacity-bar fill modifiers */
.cap-fill.at-capacity {
  fill: var(--good);
}
.cap-fill.starved {
  fill: var(--bad);
}
```

- [ ] **Step 4: Add the NodeInspector progress-bar + badge styling** to `Source/Styles/Layout.css`. The `wa-progress-bar` warning fill uses the WA progress-bar `--indicator-color` part-token; scope the starved color and the inline badge layout. Append to `Source/Styles/Layout.css`:

```css
/* P3: NodeInspector progress bar + MAX/starved badge */
.node-inspector .ni-cap {
  --track-height: 6px;
  margin: 4px 0;
}
.node-inspector .ni-cap.starved::part(indicator) {
  background-color: var(--bad);
}
.node-inspector .ni-badge {
  margin-inline-start: 8px;
  vertical-align: middle;
}
.node-inspector .ni-title {
  display: flex;
  align-items: center;
  gap: 4px;
}
.node-inspector .ni-stock {
  display: flex;
  align-items: center;
  gap: 4px;
}
.node-inspector wa-button,
.build-menu wa-button {
  display: block;
  width: 100%;
  margin: 4px 0;
}
.build-menu .bm-machines wa-button {
  display: inline-flex;
  width: auto;
}
```

(`::part(indicator)` is the standard `wa-progress-bar` shadow part for the moving fill; if the vendored v3.7.0 part name differs, the browser pass — Task 3.7 — confirms it, and this rule is the single tuning point. The starved color is a passive cue; correctness of the MAX/starved state lives in the badge.)

- [ ] **Step 5: Syntax/lint sanity (CSS has no node check; confirm files parse via a quick grep).** Run: `grep -c "link-hit\|node-badge\|cap-fill.at-capacity\|cap-fill.starved" Source/Styles/Graph.css` — Expected: `>= 4`. Run: `grep -c "ni-cap\|ni-badge" Source/Styles/Layout.css` — Expected: `>= 2`.

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/GraphInput.js Source/Styles/Graph.css Source/Styles/Layout.css
git commit -m "feat(ui): GraphInput link tap hit-test (B1) + node badge / link-hit / cap-fill CSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.6: Migrate the PlaythroughProbe selectors (link reveal + select value)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/PlaythroughProbe.mjs`

The probe's RemoveLink step (step 13) finds `.link-delete` directly, but after Task 3.4 the ✕ only renders when the link is revealed. The probe must first reveal the link via `gv._selectLink(linkId)` (the exact method `GraphInput.onSelectLink` invokes on a tap), then re-render and find the ✕. No new behavior is being faked — `_selectLink` is the real reveal path.

- [ ] **Step 1: Update the RemoveLink section in step 13.** In `Tests/PlaythroughProbe.mjs`, find the `// --- RemoveLink via the ✕ midpoint control in GraphView ---` block (around lines 1492–1506). Replace it with a version that first reveals the link:

```js
    // --- RemoveLink via the ✕ midpoint control in GraphView (now click-to-reveal, P3) ---
    gv.render(snap(mg));
    const beforeLinks = mg.getState().graph.links.length;
    // The label + ✕ are hidden until the link is revealed. Reveal it via the real
    // toggle path (GraphInput.onSelectLink -> GraphView._selectLink) before locating the ✕.
    const someLinkId = mg.getState().graph.links[0].id;
    gv._selectLink(someLinkId); // [click] tap-to-reveal a link
    const delX = gvHost.querySelector(".link-delete");
    assert(delX, "GraphView rendered no link-delete ✕ control after reveal");
    assert(
      typeof delX.onclick === "function",
      "link-delete control has no onclick",
    );
    delX.onclick(); // [click]
    assert(
      mg.getState().graph.links.length === beforeLinks - 1,
      `RemoveLink via ✕ did not drop a link (${beforeLinks} -> ${mg.getState().graph.links.length})`,
    );
    console.log("    [click] GraphView link reveal + ✕ -> RemoveLink");
```

- [ ] **Step 2: Add a positive assertion that a hidden link has NO ✕ (proves click-to-reveal).** Immediately before the reveal block above (after `const beforeLinks = ...`), add:

```js
    // pre-reveal: with selectedLinkId null, the ✕ must NOT be present (default-hidden)
    assert(
      gvHost.querySelector(".link-delete") == null,
      "link ✕ should be hidden until the link is revealed (P3 click-to-reveal)",
    );
```

- [ ] **Step 3: Add a link tap-vs-pan assertion (B1) — a pan-drag starting on a link does NOT reveal it.** After the RemoveLink block (after its `console.log`), add a focused check that drives `GraphInput` directly. Use the surviving second link or rebuild; simplest is to assert the toggle semantics on a fresh GraphView so state is clean:

```js
    // --- B1: a pan-drag that STARTS on a link must NOT toggle its reveal ---
    const gv2Host = new FakeEl("div");
    const gv2 = new Game; // placeholder to avoid lint; real construction below
```

Replace that placeholder stub with the real construction (the two lines above are illustrative only — write exactly this):

```js
    // --- B1: a pan-drag that STARTS on a link must NOT toggle its reveal ---
    const gv2Host = new FakeEl("div");
    const gv2 = new GraphView(gv2Host, mg, {});
    gv2.render(snap(mg));
    const linkB = mg.getState().graph.links[0];
    const fromN = mg.getState().graph.nodes.find((n) => n.id === linkB.from);
    const toN = mg.getState().graph.nodes.find((n) => n.id === linkB.to);
    // midpoint of the link chord in graph coords (node is 120x64; out port at +120,+32; in at +0,+32)
    const mgx = (fromN.pos.x + 120 + toN.pos.x) / 2;
    const mgy = (fromN.pos.y + 32 + toN.pos.y + 32) / 2;
    // sanity: hitLink finds the link at its midpoint
    assert(
      gv2.hitLink(mgx, mgy) === linkB.id,
      `hitLink should find ${linkB.id} at link midpoint, got ${gv2.hitLink(mgx, mgy)}`,
    );
    const pdn = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y });
    // press on the link, then move FAR (a pan-drag), then release -> must NOT reveal
    gv2.input._down(pdn(2, mgx, mgy));
    gv2.input._move(pdn(2, mgx + 80, mgy + 60));
    gv2.input._up(pdn(2, mgx + 80, mgy + 60));
    assert(
      gv2.selectedLinkId == null,
      "a pan-drag starting on a link wrongly revealed it (B1 violation)",
    );
    // now a TAP on the link (no movement) -> reveals it
    gv2.input._down(pdn(3, mgx, mgy));
    gv2.input._up(pdn(3, mgx, mgy));
    assert(
      gv2.selectedLinkId === linkB.id,
      "a tap on a link should reveal it",
    );
    console.log("    [wired] GraphInput link tap reveals; pan-drag on link does not (B1)");
```

(Note: `_down`/`_move`/`_up` use screen coords; the shim's `getBoundingClientRect()` returns `{left:0,top:0}` and the default view is identity (`scale:1,tx:0,ty:0`), so screen coords == graph coords here — the midpoint math is exact. `hitLink` confirms the link is found before the gesture tests.)

- [ ] **Step 4: Run the full probe, expect all steps PASS.** Run: `node Tests/PlaythroughProbe.mjs 2>&1 | tail -5` — Expected: the summary shows `N/N steps passed.` with `PASS step 13` including the new reveal + B1 lines, and exit code 0. If any step fails, fix the panel/probe before continuing (do not weaken assertions).

- [ ] **Step 5: Run the registered suite to confirm no node-test regressions.** Run: `node Tests/RunAll.js | tail -1` — Expected: `0 failed`.

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Tests/PlaythroughProbe.mjs
git commit -m "test(ui): probe migration — link click-to-reveal + B1 tap-vs-pan + reveal-before-✕

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.7: Service worker v6 bump, deploy, and human browser acceptance

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`

- [ ] **Step 1: Bump the SW cache to v6.** In `Source/`'s `ServiceWorker.js`, change the cache constant (P2 left it at `idlekingdom-v5`; this phase is `-v6`). No new assets ship in P3 (the WA/FA Vendor shell is already in `SHELL` from P1), so only the version bumps to force the activate handler to purge old caches and re-precache:

```js
const CACHE = "idlekingdom-v6";
```

(Leave `SHELL` and the install/activate/fetch handlers unchanged — the P1 `SHELL` already lists the WA loader, `webawesome.css`, `fontawesome.css`, `duotone.css`, and `fa-duotone-900.woff2`. If P3's edits introduce any NEW asset file, add it to `SHELL`; this phase adds none — only edits to existing JS/CSS already covered by `SHELL` or fetched/cached on demand.)

- [ ] **Step 2: Syntax check + full gate.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check ServiceWorker.js && echo "sw ok"
node Tests/RunAll.js | tail -1
node Tests/PlaythroughProbe.mjs 2>&1 | tail -1
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v -e Icons.js -e GraphView.js && echo "EMOJI REMAIN — investigate" || echo "UI panels emoji-free"
```

Expected: `sw ok`; `0 failed`; the probe summary line shows all steps passed; `UI panels emoji-free` (GraphView is exempt only for the `✕` delete-affordance glyph, consistent with P1's scoping — confirm no content emoji like `⛏️`/`🔥` remain in GraphView via `grep -nP '[\x{1F000}-\x{1FAFF}]' Source/UI/GraphView.js` returning nothing).

- [ ] **Step 3: Commit the SW bump.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add ServiceWorker.js
git commit -m "chore(pwa): SW cache v6 for Phase 3 factory-panel re-platform

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Deploy via the buildless rsync.** Password from `memory/server_access.md` → Home Server:

```bash
cd /home/evilc/Projects/IdleKingdom
SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
  --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' --exclude='package.json' --exclude='.gitignore' --exclude='.npmrc' --exclude='.omc/' \
  -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
```

- [ ] **Step 5: Verify the changed assets serve 200.** Run:

```bash
for u in Index.html Source/UI/BuildMenu.js Source/UI/NodeInspector.js Source/UI/GraphView.js Source/UI/GraphInput.js Source/Engine/Snapshot.js Source/Styles/Graph.css Source/Styles/Layout.css ServiceWorker.js; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://dev.jdayers.com/kingdom/$u"
done
```

Expected: every line ends in `200`.

- [ ] **Step 6: HUMAN browser acceptance** (the only real WA-behavior check — WA components do NOT upgrade under the node probe shim). Hard-reload `https://dev.jdayers.com/kingdom/` twice (or Ctrl+Shift+R) for the SW v6 swap, open the Factory tab, and confirm each:

  - **Dropdown open/close/keyboard:** click a smelter/workshop node → NodeInspector shows a `wa-select` "Recipe"; click it → it opens; pick another recipe with the mouse, then re-open and navigate with arrow keys + Enter → it selects. The dropdown stays open during the 2s HUD tick (it must NOT close on its own — proves keying works). Same for a gatherer's "Gather" select.
  - **Recipe/gatherer change re-renders WITH CORRECT value (spec M2):** temporarily add `console.log("dispatch", arguments?.[0])` is not needed — instead, in DevTools console run `window.__lastDispatch = null;` is unavailable; use the app's own path: pick a different recipe and confirm (a) the node card's output/label updates and (b) the select's displayed value matches the chosen recipe after the re-render. If the app exposes a debug dispatch log, assert the dispatched intent payload is `{type:"SetRecipe", recipeId:<chosen>}` / `{type:"SetGathererResource", resourceId:<chosen>}`. Concretely: change a gatherer from Iron Ore to Timber → the node sub-line/icon reflects timber and the select reads "Timber".
  - **MAX vs starved cues:** build Miner(iron_ore) → Smelter(r_iron_bar) → Market and let it run. Observe: the Miner card shows a green **MAX** badge + green full cap-bar (running full at L1); the Market card shows a **LOW** badge + amber cap-bar (throughput 0.5 ≪ cap 5). Disconnect the smelter's input (delete the Miner→Smelter link) → the Smelter shows **LOW** + amber. Open each in NodeInspector → the header `wa-badge` reads "MAX" (success/green) or "STARVED" (warning/amber) matching the canvas, and the `wa-progress-bar` is amber when starved.
  - **Link click-to-reveal:** link labels and the ✕ are HIDDEN by default (clean canvas). Tap a link curve → its `"{display} · {flow}/s"` label + ✕ appear; tap it again → they hide; tap a different link → the first hides and the new one reveals (only one at a time). Click the ✕ → the link is removed.
  - **B1 — pan starting on a link does NOT toggle:** press-and-hold on a link curve and drag (pan the canvas) → release. The link label must NOT appear (it was a pan, not a tap). Then a clean tap (no movement) on the same link DOES reveal it.
  - **M3 — reducer-reject select snap-back:** if a recipe/gatherer option can be rejected by the reducer (e.g. an option the engine refuses), pick it and confirm the select snaps back to the authoritative snapshot value coherently (no stale visible selection). At minimum, confirm a normal valid change persists and the select always shows the snapshot's current `recipeId`/`resourceId`.
  - **No regressions:** no console errors, no Vendor 404s, no FA boxes; node-card duotone machine icons (from P1) still render and scale under pan/zoom; the MAX/LOW SVG badge scales with zoom and stays at the card's top-right.

  Capture screenshots of: a MAX node, a starved/LOW node, an open recipe `wa-select`, and a revealed link label.

- [ ] **Step 7: Tag + push if acceptance passes.**

```bash
cd /home/evilc/Projects/IdleKingdom
git tag -f ui-p3-factory
git push origin main && git push -f origin ui-p3-factory
```

---

## Notes for the executor

- **Dependency order is mandatory:** Task 3.1 (Snapshot fields) lands first — every UI task reads `node.throughput`/`atCapacity`/`starved`. The 6 new Snapshot assertions are the only node-tested logic in this phase; everything else (BuildMenu/NodeInspector/GraphView/GraphInput) is browser-verified because Web Awesome components do not upgrade under the probe shim.
- **Keying is correctness, not optimization:** every `wa-select` and `wa-button` carries a stable `key`. Without it the 2s HUD tick / intent re-render tears down and rebuilds the element, closing an open dropdown mid-interaction (spec §6). `prop:value` always reflects the authoritative snapshot value (spec M3).
- **Standard vs `wa-` events:** `wa-select`/`wa-button` fire standard `change`/`click` (unprefixed) — bind plain `onchange`/`onclick` (already done above). No `onWa*` is needed in this phase (those are for lifecycle events used by P5 dialogs).
- **Do NOT touch `Dom.js`:** the `onWa*`/`prop:` extensions shipped in P1 and are sufficient. Do NOT touch the engine beyond `Snapshot.js`. Do NOT change the render cadence or the hand-rolled canvas geometry/pan/zoom.
- **The `✕` link-delete glyph is exempt** from the panel emoji gate (it is a delete-affordance control glyph in the SVG canvas, consistent with P1's GraphView scoping), but no content emoji (`⛏️`/`🔥`/`🪙` etc.) may remain anywhere in `Source/UI`.
- **Probe is a gate:** `node Tests/PlaythroughProbe.mjs` must exit 0 with all steps passing after Task 3.6. It proves the emitted `wa-*` tags keep the semantic classes and that the wired `onclick`/`onchange`/link-reveal handlers fire the right intents — but correct `wa-select` value propagation and dropdown UX are browser-only (Task 3.7).
