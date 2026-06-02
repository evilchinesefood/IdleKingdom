# IdleKingdom UI Re-platform — Phase 4 (Research / Expeditions / Heroes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the three remaining content panels — `ResearchTree`, `ExpeditionBoard`, `HeroPanel` — onto Web Awesome `wa-card`/`wa-button`/`wa-select`/`wa-callout`/`wa-tag`/`wa-badge` while keeping every semantic class the PlaythroughProbe relies on, the depth-column research layout, and the memoized SVG prereq-edge passthrough unchanged.

**Architecture:** Each panel keeps its existing pure `(snap, dispatch)` signature and its outer container element/id; only the per-item presentation changes from hand-rolled `<div>`/`<button>`/`<select>`/`<option>` to keyed `wa-*` custom elements emitted through the already-extended `h()`/`patch` reconciler (P1's `onWa*` + `prop:` props). Selects are keyed and read `prop:value` straight from the authoritative snapshot so the 2s HUD re-render and intent re-renders reuse the element in place and a rejected reducer snaps the visible value back (spec M3). No engine, no render-cadence, no `Dom.js` changes — this phase is pure panel markup plus CSS and the probe-selector migration.

**Tech Stack:** Vanilla JS ESM (buildless), Web Awesome v3.7.0 (`dist-cdn`, vendored), Font Awesome Pro Duotone webfonts (vendored) via `Source/UI/Icons.js`, zero-dep node test runner (`Tests/RunAll.js`) + standalone `Tests/PlaythroughProbe.mjs`, Apache static hosting, service worker (`idlekingdom-v7`).

**Spec:** docs/superpowers/specs/2026-06-01-idlekingdom-ui-replatform-design.md  ·  **Prereq:** Phase 1 (+ prior phases) shipped.

**Phase prerequisites (verify before starting — all land in P1/earlier):**
- `Source/UI/Icons.js` exports `icon(concept[, extraClass])` (an `<i>` Duotone vnode) and `iconName(concept)`.
- `Source/UI/Render/Dom.js` `applyProps` already supports `onWa<Event>` listeners and `prop:<name>` DOM-property assignment (inert until used).
- `Source/UI/Format/Format.js` `fmtCost` is **text-only** (no embedded currency emoji) — call-sites prepend `icon(currency)` as a sibling vnode.
- The vendored WA loader + FA Duotone CSS are wired into `Index.html`; `WaTheme.css` maps the fantasy palette onto `--wa-*` tokens.
- The PlaythroughProbe `FakeEl` listener model is array-backed (P1 M1 upgrade); standard `onchange`/`onclick` still land as `el.onchange`/`el.onclick`, which the probe drives directly.

---

### Task 4.1: Re-platform ResearchTree to keyed `wa-card` + `wa-button`

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/ResearchTree.js`

- [ ] **Step 1: Read the current file to confirm the layout/edge code stays byte-identical.** Open `/home/evilc/Projects/IdleKingdom/Source/UI/ResearchTree.js`. The `depthOf`, `layout()`, `edgeLayer()` functions, the `COL_W/ROW_H/PAD/CARD_W/CARD_H` constants, and the `{ el: edgeLayer(), key: "res-edges" }` passthrough in the returned vnode MUST NOT change — only the per-node card markup inside the `cards` map and the imports change.

- [ ] **Step 2: Rewrite `Source/UI/ResearchTree.js`.** Keep everything above `export function ResearchTree` except the imports; add `icon` to imports; swap each node `<div>` for a keyed `wa-card` (retain the `res-node {status}` class for the border tint) and the buy `<button>` for a footer `wa-button`. Write the file exactly as:

```js
import { h } from "./Render/Dom.js";
import { svg } from "./Render/Svg.js";
import { fmtCost } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESEARCH_NODES } from "../Engine/Content/ResearchNodes.js";
import { INTENT } from "../Engine/Intents.js";

// Layered layout: column = prereq depth, row = order within depth.
function depthOf(id, memo) {
  if (memo[id] != null) return memo[id];
  const node = RESEARCH_NODES[id];
  if (!node || node.prereqs.length === 0) return (memo[id] = 0);
  const d = 1 + Math.max(...node.prereqs.map((p) => depthOf(p, memo)));
  return (memo[id] = d);
}

const COL_W = 200,
  ROW_H = 110,
  PAD = 24,
  CARD_W = 160,
  CARD_H = 88;

// Static layout (positions + dimensions) — derived once from content.
let _layout = null;
function layout() {
  if (_layout) return _layout;
  const memo = {};
  const rows = {};
  const pos = {};
  for (const id of Object.keys(RESEARCH_NODES)) {
    const d = depthOf(id, memo);
    rows[d] = rows[d] || 0;
    pos[id] = { x: PAD + d * COL_W, y: PAD + rows[d] * ROW_H };
    rows[d]++;
  }
  const width = PAD + (Math.max(...Object.values(memo)) + 1) * COL_W;
  const height = PAD + Math.max(...Object.values(rows)) * ROW_H + PAD;
  _layout = { pos, width, height };
  return _layout;
}

// Static SVG prereq edge layer — built at most once (depends only on content).
let _edgeLayer = null;
function edgeLayer() {
  if (_edgeLayer) return _edgeLayer;
  const { pos, width, height } = layout();
  const edges = [];
  for (const node of Object.values(RESEARCH_NODES)) {
    for (const p of node.prereqs) {
      const a = pos[p],
        b = pos[node.id];
      if (!a || !b) continue;
      edges.push(
        svg("line", {
          x1: a.x + CARD_W,
          y1: a.y + CARD_H / 2,
          x2: b.x,
          y2: b.y + CARD_H / 2,
          class: "res-edge",
        }),
      );
    }
  }
  _edgeLayer = svg(
    "svg",
    { class: "res-edges", width, height, viewBox: `0 0 ${width} ${height}` },
    edges,
  );
  return _edgeLayer;
}

export function ResearchTree(snap, dispatch) {
  const { pos, width, height } = layout();

  const cards = (snap.research || []).map((r) => {
    const p = pos[r.id] || { x: 0, y: 0 };
    const canBuy = r.status === "available" && r.affordable;

    let buyBtn;
    if (r.status === "owned") {
      buyBtn = h(
        "wa-button",
        {
          slot: "footer",
          class: "res-buy",
          variant: "success",
          appearance: "outlined",
          size: "small",
          disabled: true,
        },
        icon("ready"),
        " Owned",
      );
    } else if (r.status === "locked") {
      buyBtn = h(
        "wa-button",
        {
          slot: "footer",
          class: "res-buy",
          appearance: "outlined",
          size: "small",
          disabled: true,
        },
        icon("locked"),
        " Locked",
      );
    } else {
      buyBtn = h(
        "wa-button",
        {
          slot: "footer",
          class: "res-buy " + (canBuy ? "affordable" : "locked"),
          variant: "brand",
          appearance: "accent",
          size: "small",
          disabled: !canBuy,
          onclick: () => dispatch({ type: INTENT.BuyResearch, nodeId: r.id }),
        },
        icon("upgrade"),
        " Research",
      );
    }

    return h(
      "wa-card",
      {
        key: "res-" + r.id,
        class: `res-node ${r.status}`,
        "with-footer": true,
        style: `position:absolute;left:${p.x}px;top:${p.y}px;width:${CARD_W}px`,
      },
      h("div", { class: "res-name", slot: "header" }, r.name),
      h(
        "div",
        { class: "res-cost" },
        icon(r.currency),
        " " + fmtCost(r.cost, r.currency),
      ),
      h("div", { class: "res-eff" }, r.effectsText || ""),
      buyBtn,
    );
  });

  return h(
    "div",
    {
      class: "research-tree",
      id: "ResearchTree",
      style: `position:relative;width:${width}px;height:${height}px`,
    },
    // Embed the prebuilt (memoized) SVG DOM node via the "el" passthrough vnode.
    { el: edgeLayer(), key: "res-edges" },
    ...cards,
  );
}
```

- [ ] **Step 3: Syntax check.** Run:

```bash
node --check /home/evilc/Projects/IdleKingdom/Source/UI/ResearchTree.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Confirm no emoji and probe selectors intact (static grep).** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -lP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI/ResearchTree.js && echo "EMOJI REMAIN" || echo "emoji-free"
grep -c 'res-node\|res-buy\|res-edges' Source/UI/ResearchTree.js
```
Expected: `emoji-free`; the second grep prints a non-zero count (the `res-node`/`res-buy`/`res-edges` classes are retained so the probe's `.res-node` / `.res-node.available .res-buy` / `.res-node .res-buy` selectors still match).

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/ResearchTree.js
git commit -m "feat(ui): ResearchTree on wa-card + wa-button (keep edge passthrough + probe classes)"
```

---

### Task 4.2: Re-platform ExpeditionBoard to keyed `wa-card` + status components

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/ExpeditionBoard.js`

- [ ] **Step 1: Read the current file** to confirm the `expeditionCardStatus`/`launchNudge` call sites and the status branches (`active`/`ready`/`underpowered`/`busy`/`reclaimed`/`locked`). The reducer-status mapping and the `INTENT.StartExpedition` payload (`{territoryId: t.id, heroId: lead.id}`) MUST stay identical.

- [ ] **Step 2: Rewrite `Source/UI/ExpeditionBoard.js`.** Each territory becomes a keyed `wa-card` (retain `exp-card {status}` + ` victory` classes for the border); rewards become 3 `wa-tag` with currency icons (replacing `🪙📜🛡️`); each status renders its WA control, keeping the `.exp-launch`, `.exp-launch affordable`, `.exp-launch locked`, `.exp-nudge`, `.exp-done`, `.exp-locked` classes the probe asserts. Write the file exactly as:

```js
import { h } from "./Render/Dom.js";
import { fmtCountdown, fmtNum } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { expeditionCardStatus, launchNudge } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

export function ExpeditionBoard(snap, dispatch) {
  const exp = snap.expedition; // {active, territoryId, timeRemainingMs, durationMs, heroId} | null
  const lead = (snap.heroes || [])[0] || { id: null, power: 0 };
  const heroPower = lead.power || 0;

  const cards = (snap.territories || []).map((t) => {
    const status = expeditionCardStatus(t, exp, heroPower);

    const header = h(
      "div",
      { class: "exp-name", slot: "header" },
      `#${t.order} ${t.name}`,
      ...(t.isVictory ? [" ", icon("victory")] : []),
    );

    const parts = [
      h("div", { class: "exp-flavor" }, t.flavor || ""),
      h(
        "div",
        { class: "exp-power" },
        icon("renown"),
        ` Power ${fmtNum(heroPower)} / ${fmtNum(t.requiredPower)}`,
      ),
      h("div", { class: "exp-dur" }, `Duration ${fmtCountdown(t.durationMs)}`),
      h(
        "div",
        { class: "exp-reward" },
        h("wa-tag", { size: "small" }, icon("gold"), " " + fmtNum(t.rewards.gold)),
        " ",
        h(
          "wa-tag",
          { size: "small" },
          icon("research"),
          " " + fmtNum(t.rewards.research),
        ),
        " ",
        h(
          "wa-tag",
          { size: "small" },
          icon("renown"),
          " " + fmtNum(t.rewards.renown),
        ),
      ),
    ];

    if (status === "active") {
      const rem = exp ? exp.timeRemainingMs : 0;
      const pct =
        exp && exp.durationMs > 0
          ? Math.max(0, Math.min(100, (1 - rem / exp.durationMs) * 100))
          : 0;
      parts.push(
        h(
          "wa-callout",
          { class: "exp-countdown", variant: "brand", size: "small" },
          icon("inprogress"),
          ` In progress — ${fmtCountdown(rem)}`,
        ),
        h("wa-progress-bar", { class: "exp-progress", value: pct }),
      );
    } else if (status === "ready") {
      parts.push(
        h(
          "wa-button",
          {
            class: "exp-launch affordable",
            variant: "success",
            appearance: "accent",
            onclick: () =>
              dispatch({
                type: INTENT.StartExpedition,
                territoryId: t.id,
                heroId: lead.id,
              }),
          },
          icon("launch"),
          " Launch",
        ),
      );
    } else if (status === "underpowered") {
      parts.push(
        h(
          "wa-button",
          { class: "exp-launch locked", disabled: true },
          icon("launch"),
          " Launch",
        ),
        h(
          "wa-callout",
          { class: "exp-nudge", variant: "warning", size: "small" },
          icon("starved"),
          " " + launchNudge(heroPower, t.requiredPower),
        ),
      );
    } else if (status === "busy") {
      parts.push(
        h(
          "wa-button",
          { class: "exp-launch locked", disabled: true },
          icon("launch"),
          " Launch",
        ),
        h(
          "wa-callout",
          { class: "exp-busy", variant: "neutral", size: "small" },
          icon("inprogress"),
          " Another expedition is running.",
        ),
      );
    } else if (status === "reclaimed") {
      parts.push(
        h(
          "wa-tag",
          { class: "exp-done", variant: "success" },
          icon("ready"),
          " Reclaimed",
        ),
      );
    } else {
      parts.push(
        h(
          "wa-tag",
          { class: "exp-locked", appearance: "outlined" },
          icon("locked"),
          " Locked",
        ),
      );
    }

    return h(
      "wa-card",
      {
        key: "terr-" + t.id,
        class: `exp-card ${status}` + (t.isVictory ? " victory" : ""),
        "with-header": true,
      },
      header,
      ...parts,
    );
  });

  return h(
    "div",
    { class: "expedition-board", id: "ExpeditionBoard" },
    ...cards,
  );
}
```

- [ ] **Step 3: Syntax check.** Run:

```bash
node --check /home/evilc/Projects/IdleKingdom/Source/UI/ExpeditionBoard.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Confirm no emoji + probe selectors intact.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -lP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI/ExpeditionBoard.js && echo "EMOJI REMAIN" || echo "emoji-free"
grep -c 'exp-card\|exp-launch\|exp-nudge\|exp-done\|exp-locked' Source/UI/ExpeditionBoard.js
```
Expected: `emoji-free` (the `🪙📜🛡️` reward glyphs and the `Reclaimed ✓` checkmark are gone); the count grep is non-zero. The probe relies on `.exp-card`, `.exp-launch.affordable` (ready), `.exp-launch.locked` (underpowered/busy), and `.exp-nudge` — all preserved on the `wa-*` elements.

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/ExpeditionBoard.js
git commit -m "feat(ui): ExpeditionBoard on wa-card + wa-callout/wa-tag/wa-button (keep probe classes)"
```

---

### Task 4.3: Re-platform HeroPanel to keyed `wa-card` + keyed `wa-select` equip slots

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/HeroPanel.js`

- [ ] **Step 1: Read the current file** to confirm: equip slots iterate `["weapon","armor","accessory"]` mapped through `SLOT_ITEM` to `sword/armor/shield`; option labels MUST carry the resource display name (`res.display`) and `T{tier}` (the probe asserts no `"undefined"` and a `Tn` option with a display name); the `EquipItem` payload is `{heroId, slot, itemId, tier:Number(val)}` and the `""` ("— none —") option is a no-op; `LevelUpHero` and `RecruitHero` payloads are unchanged. The `.hp-equip` select, `.hp-levelup`, `.hp-recruit`, and `.hp-power` (with the breakdown text the probe reads) classes MUST survive.

- [ ] **Step 2: Rewrite `Source/UI/HeroPanel.js`.** Each hero/recruit card → keyed `wa-card`; equip slots → keyed `wa-select` (`"equip-"+hero.id+"-"+slot`) reading `prop:value` from the authoritative snapshot so a rejected `EquipItem` snaps back (M3); options → `wa-option` per unlocked tier plus a `"— none —"` option; Level Up / Recruit → `wa-button`. Write the file exactly as:

```js
import { h } from "./Render/Dom.js";
import { fmtNum, fmtCost } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { HEROES } from "../Engine/Content/Heroes.js";
import { INTENT } from "../Engine/Intents.js";

const SLOT_ITEM = { weapon: "sword", armor: "armor", accessory: "shield" };

function tiersFor(snap, itemId) {
  return (snap.gearTiers || [])
    .filter((g) => g.itemId === itemId)
    .map((g) => g.tier);
}

export function HeroPanel(snap, dispatch) {
  const heroes = snap.heroes || [];
  const heroCards = heroes.map((hero) => {
    const slots = ["weapon", "armor", "accessory"].map((slot) => {
      const itemId = SLOT_ITEM[slot];
      const res = RESOURCES[itemId];
      const equipped = hero.equipped[slot]; // {itemId,tier} | null
      const tierOpts = tiersFor(snap, itemId).map((tier) =>
        h(
          "wa-option",
          { value: String(tier) },
          icon(itemId),
          ` ${res.display} T${tier}`,
        ),
      );
      return h(
        "div",
        { class: "hp-slot" },
        h("div", { class: "hp-slot-label" }, slot),
        h(
          "wa-select",
          {
            key: "equip-" + hero.id + "-" + slot,
            class: "hp-equip",
            label: slot,
            appearance: "filled",
            "prop:value": equipped ? String(equipped.tier) : "",
            onchange: (e) => {
              const val = e.target.value;
              if (val === "") return; // "— none —" is a no-op (no unequip intent in MVP)
              dispatch({
                type: INTENT.EquipItem,
                heroId: hero.id,
                slot,
                itemId,
                tier: Number(val),
              });
            },
          },
          h("wa-option", { value: "" }, "— none —"),
          ...tierOpts,
        ),
      );
    });

    return h(
      "wa-card",
      { key: "hero-" + hero.id, class: "hero-card", "with-header": true },
      h("div", { class: "hp-name", slot: "header" }, hero.name),
      h(
        "div",
        { class: "hp-power" },
        icon("renown"),
        ` Power ${fmtNum(hero.power)} (gear ${fmtNum(hero.powerBreakdown.gear)} + level ${fmtNum(hero.powerBreakdown.level)})`,
      ),
      h("wa-tag", { class: "hp-level", size: "small" }, `Level ${hero.level}`),
      ...slots,
      h(
        "wa-button",
        {
          class: "hp-levelup " + (hero.canLevel ? "affordable" : "locked"),
          variant: "brand",
          appearance: "accent",
          disabled: !hero.canLevel,
          onclick: () =>
            dispatch({ type: INTENT.LevelUpHero, heroId: hero.id }),
        },
        icon("levelup"),
        " Level Up → ",
        icon("renown"),
        " " + fmtCost(hero.levelCost, "renown"),
      ),
    );
  });

  // Recruit options for not-yet-recruited heroes.
  const recruited = new Set(heroes.map((x) => x.templateId));
  const recruitCards = Object.values(HEROES)
    .filter((tpl) => !recruited.has(tpl.id) && tpl.unlockKind === "renown")
    .map((tpl) => {
      const r = (snap.recruitable || []).find(
        (x) => x.templateId === tpl.id,
      ) || { canRecruit: false };
      return h(
        "wa-card",
        { key: "recruit-" + tpl.id, class: "recruit-card", "with-header": true },
        h("div", { class: "hp-name", slot: "header" }, tpl.name),
        h(
          "wa-button",
          {
            class: "hp-recruit " + (r.canRecruit ? "affordable" : "locked"),
            appearance: "accent",
            disabled: !r.canRecruit,
            onclick: () =>
              dispatch({ type: INTENT.RecruitHero, templateId: tpl.id }),
          },
          icon("recruit"),
          " Recruit → ",
          icon("renown"),
          " " + fmtCost(tpl.unlockRenownCost, "renown"),
        ),
      );
    });

  return h(
    "div",
    { class: "hero-panel", id: "HeroPanel" },
    ...heroCards,
    ...recruitCards,
  );
}
```

- [ ] **Step 3: Syntax check.** Run:

```bash
node --check /home/evilc/Projects/IdleKingdom/Source/UI/HeroPanel.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Confirm no emoji + probe selectors intact.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -lP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI/HeroPanel.js && echo "EMOJI REMAIN" || echo "emoji-free"
grep -c 'hp-equip\|hp-levelup\|hp-recruit\|hp-power' Source/UI/HeroPanel.js
```
Expected: `emoji-free` (the old `${res.icon}` emoji option labels are gone); count non-zero. The probe drives `.hp-equip` via `sel.onchange({target:{value:"1"}})`, reads `.hp-power` text, and clicks `.hp-levelup` — all preserved.

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/HeroPanel.js
git commit -m "feat(ui): HeroPanel on wa-card + keyed wa-select equip slots + wa-button actions"
```

---

### Task 4.4: Layout.css — style the new `wa-*` panels + retire double-styling

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Layout.css`

- [ ] **Step 1: Read the relevant Layout.css block** (`.res-node`/`.exp-card`/`.hero-card`/`.recruit-card`, the shared `.bm-place,.ni-upgrade,...,.res-buy,.exp-launch,.hp-levelup,.hp-recruit` button rule, `.affordable`/`.locked`, and the `.hp-equip` / `.res-cost` rules) so the edits are surgical. The `wa-*` host elements now carry the look via WA variant/appearance + `WaTheme.css` tokens, so the hand-rolled `background`/`border`/`padding` on the card classes and the button background rules become redundant on the WA elements.

- [ ] **Step 2: Stop the shared button rule from painting the WA buttons.** Web Awesome buttons get their fill from `variant`/`appearance` + tokens; the legacy `border/background/padding` rule double-styles them. Remove `.res-buy`, `.exp-launch`, `.hp-levelup`, `.hp-recruit` from the shared selector so only the remaining native BuildMenu/NodeInspector buttons keep it. Find:

```css
.bm-machine,
.bm-place,
.ni-upgrade,
.ni-sell,
.res-buy,
.exp-launch,
.hp-levelup,
.hp-recruit {
  min-height: var(--tap);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--parchment-dk);
  color: var(--ink);
  padding: 0 0.6rem;
  cursor: pointer;
}
```
Replace with:

```css
.bm-machine,
.bm-place,
.ni-upgrade,
.ni-sell {
  min-height: var(--tap);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--parchment-dk);
  color: var(--ink);
  padding: 0 0.6rem;
  cursor: pointer;
}
/* P4 WA action buttons: look comes from variant/appearance + WaTheme tokens.
   The legacy .affordable/.locked background+opacity must not repaint them. */
wa-button.res-buy,
wa-button.exp-launch,
wa-button.hp-levelup,
wa-button.hp-recruit {
  width: 100%;
  margin-top: 0.4rem;
}
wa-button.affordable,
wa-button.locked {
  background: none;
  opacity: 1;
}
```

- [ ] **Step 3: Make `wa-card` panels keep their grid/border look but defer surface to WA tokens.** The `.res-node`/`.exp-card`/`.hero-card`/`.recruit-card` rules still set positioning + the status-border tint, but the redundant `background`/`box-shadow`/`padding` should be dropped from the now-`wa-card` hosts (WA cards bring their own surface from `--wa-color-surface-*`). Find the research-node block:

```css
.res-node {
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  padding: 0.4rem;
  box-shadow: var(--shadow);
}
.res-node.owned {
  border-color: var(--good);
}
.res-node.available {
  border-color: var(--gold);
}
.res-node.locked {
  opacity: 0.6;
}
```
Replace with (keep the absolute-position width via the inline style each card already sets; tint the WA card border via the `--wa-color-surface-border`-agnostic outline so the status cue survives the shadow DOM — apply to the host):

```css
.res-node {
  --wa-card-border-width: 2px;
}
.res-node.owned {
  --wa-color-neutral-border-normal: var(--good);
  outline: 2px solid var(--good);
  border-radius: var(--radius);
}
.res-node.available {
  --wa-color-neutral-border-normal: var(--gold);
  outline: 2px solid var(--gold);
  border-radius: var(--radius);
}
.res-node.locked {
  opacity: 0.6;
}
```

- [ ] **Step 4: Tint the expedition/victory card borders the same way.** Find:

```css
.exp-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.6rem;
}
.exp-card.victory {
  border-color: var(--gold);
}
```
Replace with:

```css
.exp-card.victory {
  outline: 2px solid var(--gold);
  border-radius: var(--radius);
}
.exp-card.active {
  outline: 2px solid var(--good);
  border-radius: var(--radius);
}
.exp-card.reclaimed {
  opacity: 0.85;
}
.exp-reward {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin: 0.3rem 0;
}
.exp-progress {
  margin-top: 0.3rem;
}
```

- [ ] **Step 5: Drop the redundant hero/recruit card surface.** Find:

```css
.hero-card,
.recruit-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.6rem;
}
```
Replace with:

```css
.hp-level {
  margin: 0.25rem 0;
  display: inline-block;
}
.hp-equip {
  width: 100%;
  margin: 0.25rem 0;
}
```
(The `.hero-card`/`.recruit-card` surface is now the `wa-card` default; the grid container `.hero-panel` rule that lays them out is unchanged.)

- [ ] **Step 6: Syntax/sanity check the CSS.** There is no CSS linter wired; confirm the file still parses by checking brace balance and that the targeted blocks were replaced (not duplicated):

```bash
cd /home/evilc/Projects/IdleKingdom
node -e "const c=require('fs').readFileSync('Source/Styles/Layout.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('BRACE MISMATCH',o,cl);process.exit(1)}console.log('braces balanced',o)"
grep -c 'wa-button.res-buy\|exp-reward\|hp-level' Source/Styles/Layout.css
```
Expected: `braces balanced <n>` and a non-zero count.

- [ ] **Step 7: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Styles/Layout.css
git commit -m "style(ui): style P4 wa-card panels via tokens; retire redundant button/card painting"
```

---

### Task 4.5: Migrate the PlaythroughProbe selectors for P4 panels

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/PlaythroughProbe.mjs`

> The semantic classes (`.res-node`, `.res-buy`, `.exp-card`, `.exp-launch.affordable`, `.exp-launch.locked`, `.exp-nudge`, `.hp-equip`, `.hp-levelup`, `.hp-power`) are all retained on the `wa-*` elements, so the probe's selectors already match. The remaining adaptations are (a) the `wa-select` shim has no shadow upgrade, so equip-option labels must be asserted off `wa-option` children rather than `option`, and (b) the reward/level chips now live on `wa-tag`. Verify and adjust only where a tag name is hard-coded.

- [ ] **Step 1: Confirm what currently matches/breaks.** Run the probe BEFORE editing to see the exact failure surface (the FakeEl selector engine matches by `localName`, so `option` will no longer match the new `wa-option`):

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/PlaythroughProbe.mjs 2>&1 | tail -30
```
Expected: STEP 5 (and STEP 7's equip loop) FAIL on the equip-option assertions — `sel.querySelectorAll("option")` returns `[]` because options now render as `wa-option`. Steps 2, 4 (research), 6 (expedition) should still PASS because `.res-node`/`.res-buy`/`.exp-launch.affordable`/`.exp-launch.locked`/`.exp-nudge` are preserved. Note the failing line numbers.

- [ ] **Step 2: Update STEP 5 equip-option selectors from `option` → `wa-option`.** In `Tests/PlaythroughProbe.mjs`, inside STEP 5's slot loop, change:

```js
      const optText = sel.querySelectorAll("option").map((o) => o.text);
```
to:

```js
      const optText = sel.querySelectorAll("wa-option").map((o) => o.text);
```

- [ ] **Step 3: Update STEP 7's tier-availability check from `option` → `wa-option`.** In STEP 7's equip block, change:

```js
        const hasOpt = sel
          .querySelectorAll("option")
          .some((o) => o.getAttribute("value") === String(tier));
```
to:

```js
        const hasOpt = sel
          .querySelectorAll("wa-option")
          .some((o) => o.getAttribute("value") === String(tier));
```

- [ ] **Step 4: Run the probe, expect PASS.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/PlaythroughProbe.mjs 2>&1 | tail -20
```
Expected: `13/13 steps passed.` and `PROBE PASS: full play-session reachable through the real UI layer.` In particular STEP 2/4 (ResearchTree buy), STEP 5/7 (HeroPanel equip select onchange + Level Up), and STEP 6 (ExpeditionBoard launch gating + launch) all drive the new `wa-*` controls via their real `onclick`/`onchange` handlers.

- [ ] **Step 5: Run the full unit suite to confirm no regression.** The engine + pure-helper tests must stay green (P4 touches no engine/helper code):

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
```
Expected: `0 failed`.

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Tests/PlaythroughProbe.mjs
git commit -m "test(ui): migrate PlaythroughProbe equip-option selectors to wa-option (P4)"
```

---

### Task 4.6: Service worker cache v7 + deploy + curl checks

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`

- [ ] **Step 1: Bump the cache version.** P4 ships no new asset files (only edits to existing JS/CSS already in `SHELL` or fetched on demand), so only the `CACHE` constant changes to force the activate handler to purge the old cache and re-precache. Edit `ServiceWorker.js` and change:

```js
const CACHE = "idlekingdom-v3";
```
to:

```js
const CACHE = "idlekingdom-v7";
```
(P2 shipped `-v5`, P3 shipped `-v6`; P4 is `-v7`. Leave the `SHELL` list and the install/activate/fetch handlers unchanged — the WA loader, `webawesome.css`, `fontawesome.css`, `duotone.css`, and `fa-duotone-900.woff2` were added to `SHELL` in P1 and the on-demand WA component modules are fetched-then-served by the cache-first handler.)

- [ ] **Step 2: Syntax check + commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
node --check ServiceWorker.js && echo "ok"
git add ServiceWorker.js
git commit -m "chore(pwa): SW cache v7 for P4 panels"
```

- [ ] **Step 3: Final pre-deploy gate.** Run both verification lanes one more time and the emoji gate over all of `Source/UI`:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
node Tests/PlaythroughProbe.mjs 2>&1 | tail -2
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v Icons.js && echo "EMOJI REMAIN — fix before deploy" || echo "UI emoji-free"
```
Expected: `0 failed`; `13/13 steps passed.`; `UI emoji-free`.

- [ ] **Step 4: Deploy via the buildless rsync.** Password from `memory/server_access.md` → Home Server. (`Source/Vendor/` ships because it lives under `Source/`; `--delete` keeps the remote clean.)

```bash
cd /home/evilc/Projects/IdleKingdom
SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
  --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' --exclude='package.json' --exclude='.gitignore' --exclude='.npmrc' --exclude='.omc/' \
  -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
```

- [ ] **Step 5: Verify the served files return 200.** Run (the three edited panels + the SW + Layout.css must all serve):

```bash
for u in Source/UI/ResearchTree.js Source/UI/ExpeditionBoard.js Source/UI/HeroPanel.js \
         Source/Styles/Layout.css ServiceWorker.js Index.html; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://dev.jdayers.com/kingdom/$u"
done
```
Expected: all `200`; the `.js` files served as a JS content type (`text/javascript` or `application/javascript`), `ServiceWorker.js` likewise, `Layout.css` as `text/css`.

- [ ] **Step 6: Commit nothing here** (deploy is not a commit) — proceed to the human acceptance task.

---

### Task 4.7: HUMAN browser acceptance (the only real WA-behavior check)

**Files:** (none — verification)

> Web Awesome components do NOT upgrade under the node test shim (no shadow DOM, no `wa-change`, no reflected `value`). All component *behavior* — `wa-select` open/keyboard/value propagation, `wa-card` slots, `wa-callout`/`wa-tag`/`wa-badge` rendering, and the M3 reducer-reject snap-back — is verified here in a real browser.

- [ ] **Step 1: Hard-reload for the SW swap.** Open `https://dev.jdayers.com/kingdom/` and hard-reload twice (Ctrl+Shift+R) so the `idlekingdom-v7` service worker activates and purges the old cache. Confirm in DevTools → Application → Service Workers that the active worker reports cache `idlekingdom-v7`. Confirm zero console errors and no Vendor 404s.

- [ ] **Step 2: Research panel — buy a node.** Open the Research tab. Confirm:
  - Each research node is a parchment `wa-card` laid out in depth columns with the SVG prereq edges still drawn behind them (the memoized edge layer is intact).
  - Available nodes show a gold-tinted border + a brand "Research" `wa-button` (currency icon prepended in the cost line); owned nodes show a green border + a disabled "Owned" button with a check icon; locked nodes show a dimmed card + disabled "Locked" button with a lock icon.
  - Click "Research" on an affordable available node → it flips to "Owned" (green) and its dependents become available on the next render. No layout shift of the columns.

- [ ] **Step 3: Expeditions panel — launch + resolve.** Open the Expeditions tab. Confirm:
  - Each territory is a `wa-card`; the victory territory shows a crown icon in its header and a gold border; rewards render as three `wa-tag` chips with gold/research/renown duotone icons.
  - The next target at sufficient power shows a green "Launch" `wa-button` (flag-checkered icon); below required power it shows a disabled "Launch" plus a warning `wa-callout` carrying the launch-nudge text.
  - Click "Launch" on a ready territory → the card switches to a brand `wa-callout` "In progress — m:ss" with a `wa-progress-bar` that advances. Wait for (or fast-forward in-game by leaving it) resolution → the card becomes a green "Reclaimed" `wa-tag` and the board advances the next target. Status colors (green active/reclaimed, warning underpowered, neutral busy) are visually distinct.

- [ ] **Step 4: Heroes panel — equip + level + M3 snap-back.** Open the Heroes tab. Confirm:
  - Each hero is a `wa-card`; the power line carries a renown icon and the full `gear + level` breakdown; level is a `wa-tag`.
  - Each of the 3 equip slots is a labelled `wa-select` (Weapon/Armor/Accessory). Open one — it shows "— none —" plus one `wa-option` per unlocked tier, each with the item icon and "{display} T{tier}" (NEVER "undefined T#"). Pick a tier → the hero power rises and the select shows the chosen tier; the select stays open-able after the 2s HUD re-render (keyed, not torn down).
  - Click "Level Up" (brand button, renown cost shown) → level + power rise. Recruit cards for renown-unlock heroes show a "Recruit" button enabled only when affordable.
  - **M3 reducer-reject snap-back:** with insufficient renown to satisfy a higher tier (or any state where the engine would reject the equip), select that option → confirm the visible `wa-select` value snaps back to the authoritative (still-equipped) tier on the re-render rather than sticking on the rejected choice. (If every selectable tier is currently valid, temporarily exhaust renown / use a tier whose `EquipItem` the reducer rejects to exercise the path; the value must reflect the snapshot, not the optimistic pick.)

- [ ] **Step 5: Capture screenshots** of the three panels (research with an owned+available+locked mix, an in-progress expedition, a hero with gear equipped) for the phase record.

- [ ] **Step 6: Tag + finalize.** If acceptance passes:

```bash
cd /home/evilc/Projects/IdleKingdom
git tag -f ui-p4-content-panels
git push origin main && git push -f origin ui-p4-content-panels
```

---

## Notes for the executor
- **No engine / no cadence changes:** P4 touches only the three panels, Layout.css, the probe, and the SW version. Panels still render on intents + expedition-resolve; the HUD-only 2s interval is unchanged. Do NOT add per-frame rendering.
- **Keying is correctness, not just thrash-avoidance (M3):** every `wa-select` is keyed (`equip-<heroId>-<slot>`) and its `prop:value` always reflects the authoritative snapshot, so a rejected `EquipItem` re-render snaps the dropdown back to the equipped tier rather than persisting the optimistic pick. Verify this in the browser (Task 4.7 Step 4).
- **Semantic classes are load-bearing:** `.res-buy`, `.exp-launch`/`.exp-launch.affordable`/`.exp-launch.locked`, `.exp-nudge`, `.hp-equip`, `.hp-levelup`, `.hp-recruit`, `.hp-power`, `.res-node`, `.exp-card` stay on the `wa-*` elements so the PlaythroughProbe selectors survive with minimal churn (only the `option` → `wa-option` adaptation in Task 4.5).
- **Standard vs `wa-` events:** equip `wa-select` uses plain `onchange` (WA form controls fire unprefixed `change`), so no `onWa*` is needed here and the probe drives it via `sel.onchange(...)` exactly as today. `onWa*` lifecycle wiring is a P5 concern (dialogs).
- **`wa-option` labels carry the resource display name** via `icon(itemId)` + `${res.display} T${tier}` — the probe asserts no "undefined" and a real display name on the T1 option.
- **WA tag/attr provenance:** every tag and attribute used here (`wa-card` with `with-header`/`with-footer` + `header`/`footer` slots, `wa-button` `variant`/`appearance`/`size`/`disabled`, `wa-select` `value`(prop)/`label`/`appearance` + `wa-option` `value`, `wa-callout` `variant`/`size`, `wa-tag` `variant`/`appearance`/`size`, `wa-progress-bar` `value`) is confirmed in spec §6 (Tag reference + per-surface mapping) and §5 (`prop:` convention). No `wa-tab-panel`, no `<wa-icon>`, no kit code.
