# IdleKingdom UI Re-platform — Phase 5 (Modals + Tooltips + Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the overlay layer — OfflineSummary and Victory onto keyed `wa-dialog`, the onboarding Tooltip onto `wa-callout`, and the HUD error flash onto a `wa-callout variant=danger` — then do the final layout/clarity polish pass (MAX/starved legend, onboarding tightening, screen real-estate), keeping the once-only victory gate and tutorial persistence (engine/Selectors) untouched.

**Architecture:** `App._renderOverlay` already owns the overlay layer and `patch()`es `[OfflineSummary, Victory, Tooltip]` into `overlayEl`; this phase swaps each component's vnode tree to WA tags while keeping that ownership and the existing close-wiring closures. The reconciler's `prop:` (DOM property) and `onWa*` (custom-event listener) extensions from P1 drive dialog `open`/`wa-hide`. The HUD error flash keeps its imperative `errorEl` host + 2.5s timer but its child is now a reconciled `wa-callout` instead of bare `textContent`. Engine and `Source/UI/Logic/Selectors.js` are not touched: `victoryReady`/`nextTutorialStep` and the `AckVictory`/`seenVictory` gate stay exactly as shipped.

**Tech Stack:** Vanilla JS ESM (buildless), Web Awesome v3.7.0 (`wa-dialog`, `wa-callout`, `wa-tag`, `wa-button`; vendored `dist-cdn`), Font Awesome Pro Duotone (vendored, via `icon()`), zero-dep node test runner + the standalone PlaythroughProbe, service worker (`idlekingdom-v8`), Apache static hosting, rsync deploy.

**Spec:** docs/superpowers/specs/2026-06-01-idlekingdom-ui-replatform-design.md  ·  **Prereq:** Phase 1 (+ prior phases) shipped.

---

### Task 5.1: OfflineSummary → keyed `wa-dialog`

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/OfflineSummary.js`

The current modal is a `.modal-backdrop > .modal` tree with an emoji gained line (`🪙 +n  📜 +n  🛡️ +n`) and an `.os-close` `<button>`. Re-platform to a keyed `wa-dialog` whose dismissal (button OR backdrop/Esc) routes through `onClose`. Keep the `#OfflineSummary` id and `.os-close` class so the probe's selectors survive. Use `icon()` for the three gained currencies (no emoji) and render them as `wa-tag`s; reclaimed expeditions as `wa-tag variant=success`.

- [ ] **Step 1: Rewrite `Source/UI/OfflineSummary.js`.** Replace the whole file with:

```js
import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtNum, fmtCountdown } from "./Format/Format.js";
import { TERRITORIES } from "../Engine/Content/Territories.js";

export function OfflineSummary(summary, onClose) {
  const g = summary.gained || { gold: 0, research: 0, renown: 0 };
  const reclaimedTags = (summary.expeditionsResolved || []).map((e) =>
    h(
      "wa-tag",
      { class: "os-exp", variant: "success", "appearance": "outlined", "size": "s" },
      icon("ready"),
      " Reclaimed " +
        (TERRITORIES[e.territoryId]
          ? TERRITORIES[e.territoryId].name
          : e.territoryId),
    ),
  );

  return h(
    "wa-dialog",
    {
      id: "OfflineSummary",
      key: "offline",
      "prop:open": true,
      label: "While you were away",
      onWaHide: onClose,
    },
    h(
      "div",
      { class: "os-elapsed modal-text" },
      `Away for ${fmtCountdown(summary.appliedMs)}${summary.clamped ? " (capped)" : ""}`,
    ),
    h(
      "div",
      { class: "os-gained" },
      h("wa-tag", { class: "os-gain", "size": "l", pill: true }, icon("gold"), " +" + fmtNum(g.gold)),
      h("wa-tag", { class: "os-gain", "size": "l", pill: true }, icon("research"), " +" + fmtNum(g.research)),
      h("wa-tag", { class: "os-gain", "size": "l", pill: true }, icon("renown"), " +" + fmtNum(g.renown)),
    ),
    ...reclaimedTags,
    h(
      "wa-button",
      { class: "os-close", slot: "footer", variant: "brand", appearance: "accent", onclick: onClose },
      "Continue",
    ),
  );
}
```

  Notes: `prop:open` opens the dialog via the DOM property (P1 extension); `onWaHide` fires on ANY dismissal (footer button click closes via `onclick → onClose`; backdrop/Esc closes via `wa-hide → onClose`). Both call the same `onClose` App passes (clears `pendingOfflineSummary` + `renderNow`). `key:"offline"` keeps the dialog node reused in place across the 2s HUD re-render / intent re-renders so it is never torn down mid-display. `.modal-text` keeps the elapsed line user-selectable (per Reset.css P1 rule). `#OfflineSummary` id + `.os-close` class preserve the probe selectors.

- [ ] **Step 2: Syntax check.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/OfflineSummary.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 3: Confirm no emoji remain in the file.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -nP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' Source/UI/OfflineSummary.js && echo "EMOJI REMAIN" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/OfflineSummary.js
git commit -m "feat(ui): OfflineSummary as keyed wa-dialog (onWaHide close, wa-tag gains)"
```

---

### Task 5.2: Victory → keyed `wa-dialog` (acknowledged, light-dismiss off)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/Victory.js`

Re-platform to a keyed `wa-dialog` with light-dismiss OFF so the win must be acknowledged (clicking the backdrop must NOT close it — only the "Continue the Reign" button or Esc). The label slot holds a crown icon + "Yensburg Reclaimed". The epilogue body stays user-selectable. Keep the `#Victory` id and `.victory-close` / `.victory-text` classes for the probe.

- [ ] **Step 1: Rewrite `Source/UI/Victory.js`.** Replace the whole file with:

```js
import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";

const EPILOGUE =
  "The last door of the Black Keep falls. The Usurer-Lord who bought the King's death " +
  "is dragged into the light of the braziers you relit. Yensburg stands. Six walls reclaimed, " +
  "the throne avenged. The forges do not cool — they never will again.";

export function Victory(onClose) {
  return h(
    "wa-dialog",
    {
      id: "Victory",
      key: "victory",
      "prop:open": true,
      onWaHide: onClose,
    },
    // label slot: crown + title (custom label content, so use the label slot, not the attr)
    h("div", { slot: "label", class: "victory-title" }, icon("victory"), " Yensburg Reclaimed"),
    h("div", { class: "victory-text modal-text" }, EPILOGUE),
    h(
      "div",
      { class: "victory-sub" },
      "Free-play continues — all content remains unlocked.",
    ),
    h(
      "wa-button",
      {
        class: "victory-close",
        slot: "footer",
        variant: "brand",
        appearance: "accent",
        onclick: onClose,
      },
      icon("victory"),
      " Continue the Reign",
    ),
  );
}
```

  Notes: There is no `light-dismiss` attribute set, and `wa-dialog`'s light-dismiss is OPT-IN — omitting it means clicking the overlay does NOT close the dialog (acknowledged behavior). `onWaHide → onClose` still catches the footer-button close and Esc; `onClose` is App's closure that flips `showVictory=false`, dispatches `AckVictory`, and `renderNow()`s. The `AckVictory` once-only gate and persisted `seenVictory` live in App.js + the engine and are NOT touched here. `key:"victory"` keeps the node stable. `.victory-text.modal-text` keeps the epilogue selectable. `#Victory` id + `.victory-close` + `.victory-text` classes preserve probe selectors.

- [ ] **Step 2: Syntax check.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/Victory.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 3: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Victory.js
git commit -m "feat(ui): Victory as keyed wa-dialog (acknowledged, light-dismiss off, crown label)"
```

---

### Task 5.3: Tooltip → `wa-callout` inside the kept `.tooltip-layer` host

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/Tooltip.js`

Keep the `.tooltip-layer` host (id `TooltipLayer`, `data-anchor` — App/CSS positions it). The inner `.tooltip > .tip-text + .tip-dismiss button` becomes a keyed `wa-callout variant=brand` with a `start`-slot `circle-info` icon, the tip text, and a `wa-button size=s` "Got it". `nextTutorialStep`/anchor logic stays unchanged (it lives in `Logic/Selectors.js`, untouched). Keep `.tip-text` and `.tip-dismiss` classes for the probe.

- [ ] **Step 1: Rewrite `Source/UI/Tooltip.js`.** Replace the whole file with:

```js
import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { nextTutorialStep } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

// anchor = a CSS selector for the element this tip points at (cosmetic; used by App to position).
const TIPS = {
  gold: {
    flag: "seenGoldTip",
    anchor: ".factory-panels",
    text: "Welcome to Yensburg. Open the Build menu and place a Miner, a Smelter, and a Market — connect them so ore becomes iron bars that sell at the Market for Gold.",
  },
  upgrade: {
    flag: "seenUpgradeTip",
    anchor: "#NodeInspector .ni-upgrade",
    text: "Tap a node, then Upgrade it to raise its rate.",
  },
  connect: {
    flag: "seenConnectTip",
    anchor: ".graph-svg",
    text: "Drag from an output port to an input port to connect machines.",
  },
  research: {
    flag: "seenResearchTip",
    anchor: '.hud-tabs a[href="#/research"]',
    text: "Bank Research and open the tree to unlock new machines.",
  },
  expedition: {
    flag: "seenExpeditionTip",
    anchor: '.hud-tabs a[href="#/expeditions"]',
    text: "Forge gear, equip a hero, and launch an expedition.",
  },
};

export function Tooltip(snap, dispatch) {
  const flags = (snap.tutorial && snap.tutorial.flags) || {};
  const step = nextTutorialStep(flags);
  if (!step) return null;
  const tip = TIPS[step];
  if (!tip) return null;

  return h(
    "div",
    { class: "tooltip-layer", id: "TooltipLayer", "data-anchor": tip.anchor },
    h(
      "wa-callout",
      { class: "tooltip", key: "tip-" + step, variant: "brand" },
      icon("info", "tip-icon"),
      h("span", { slot: "", class: "tip-text" }, tip.text),
      h(
        "wa-button",
        {
          class: "tip-dismiss",
          slot: "",
          size: "small",
          appearance: "plain",
          onclick: () =>
            dispatch({ type: INTENT.DismissTooltip, flag: tip.flag }),
        },
        "Got it",
      ),
    ),
  );
}
```

  Notes: the `start` slot of `wa-callout` takes the leading icon — but per the icon convention we place the `<i>` into the `start` slot via the slot attribute. Set the icon's slot explicitly. Adjust the icon line to `icon("info", "tip-icon")` then add `slot:"start"` is needed: since `icon()` produces a fixed vnode, wrap it so the slot is set. Replace the `icon("info", "tip-icon")` line with a slotted wrapper:

```js
      h("span", { slot: "start" }, icon("info", "tip-icon")),
```

  i.e. the final `wa-callout` children are: a `start`-slotted span holding the `circle-info` icon, the default-slot `.tip-text`, and the `.tip-dismiss` `wa-button`. `key:"tip-"+step` keys the callout per tutorial step so advancing tips reuse/replace the node cleanly. `DismissTooltip{flag}` is the same intent dispatched today (engine/Selectors persistence unchanged).

- [ ] **Step 2: Apply the start-slot icon fix.** Open `Source/UI/Tooltip.js` and replace the line:

```js
      icon("info", "tip-icon"),
```
with:
```js
      h("span", { slot: "start" }, icon("info", "tip-icon")),
```

- [ ] **Step 3: Syntax check.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/Tooltip.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Tooltip.js
git commit -m "feat(ui): Tooltip onboarding callout as keyed wa-callout (circle-info + Got it)"
```

---

### Task 5.4: Error flash → `wa-callout variant=danger` (keep imperative host + timer)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/App.js`

The `.hud-error` host (`this.errorEl`) and its 2.5s `setTimeout` are imperative (outside the reconciler) — keep them. Today `_flashError` sets `this.errorEl.textContent = msg`. Change it to `patch()` a `wa-callout variant=danger` (with a `triangle-exclamation` start-slot icon) into the host, and clear it by patching empty children on timeout. Also wire the overlay dialogs' open/close in `_renderOverlay` — but note: the dialogs already close via their own `onWaHide`/`onclick` closures (Tasks 5.1/5.2), and `prop:open:true` is emitted by the component each render; App only needs to keep rendering/not-rendering the dialog vnode based on `pendingOfflineSummary`/`showVictory`, which it already does. So the App change is the error-flash callout plus importing `patch`/`h`/`icon`.

- [ ] **Step 1: Add imports.** In `Source/UI/App.js`, the file already imports `patch` from `./Render/Dom.js`. Add `h` to that import and add an icon import. Change line:

```js
import { patch } from "./Render/Dom.js";
```
to:
```js
import { patch, h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
```

- [ ] **Step 2: Replace `_flashError` to render a `wa-callout`.** Replace the existing method:

```js
  _flashError(msg) {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = "";
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this.errorEl.style.display = "none";
    }, 2500);
  }
```
with:

```js
  _flashError(msg) {
    patch(this.errorEl, [
      h(
        "wa-callout",
        { class: "hud-error-callout", key: "err", variant: "danger" },
        h("span", { slot: "start" }, icon("starved", "err-icon")),
        h("span", { class: "hud-error-text" }, msg),
      ),
    ]);
    this.errorEl.style.display = "";
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this.errorEl.style.display = "none";
      patch(this.errorEl, []);
    }, 2500);
  }
```

  Notes: `icon("starved")` maps to `triangle-exclamation` (the spec's danger/warning glyph, per Icons.js). The callout is reconciled into the same imperative `errorEl` host — the host stays display:none until a flash, the timer clears it. Patching `[]` on timeout removes the callout node so a fresh `key:"err"` callout is created on the next flash (the host is briefly empty between flashes, matching the prior `textContent` behavior).

- [ ] **Step 3: Syntax check.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/App.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/App.js
git commit -m "feat(ui): HUD error flash renders a wa-callout variant=danger (imperative host + timer kept)"
```

---

### Task 5.5: Layout/Theme polish — dialog/callout styling, MAX/starved legend, screen real-estate

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Layout.css`
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Theme.css`

The old `.modal-backdrop`/`.modal`/`.tooltip`/`.os-close`/`.victory-close`/`.tip-dismiss` rules now style elements that no longer exist (dialogs/callouts/wa-buttons own their chrome). Retire the dead backdrop/modal/button-look rules, keep the host-positioning rules the overlay still relies on (`.overlay-layer`, `.tooltip-layer`, `.hud-error`), and add: the error-flash callout sizing, the gained-tag row, the victory label/text, and a MAX/starved legend block. Add the legend's small visual tokens to Theme.css.

- [ ] **Step 1: Replace the overlay/modal/tooltip CSS block in `Layout.css`.** Replace this block (the `/* Overlay layer (tooltip + modals) */` section through the `.victory-sub` rule, lines ~304-372):

```css
/* Overlay layer (tooltip + modals) */
.overlay-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 70;
}
.overlay-layer > * {
  pointer-events: auto;
}
.tooltip-layer {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
}
.tooltip {
  background: var(--ink);
  color: var(--parchment);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.6rem 0.9rem;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.tip-dismiss,
.os-close,
.victory-close {
  min-height: var(--tap);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--gold);
  color: var(--ink);
  cursor: pointer;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 8, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.25rem;
  max-width: 420px;
  width: calc(100% - 2rem);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.os-title,
.victory-title {
  font-size: 1.25rem;
  font-weight: 700;
}
.victory-text {
  line-height: 1.45;
}
.victory-sub {
  font-size: 0.85rem;
  color: var(--ink-soft);
}
```

  with:

```css
/* Overlay layer (tooltip callout + wa-dialog modals) */
.overlay-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 70;
}
.overlay-layer > * {
  pointer-events: auto;
}
/* wa-dialog renders its own backdrop/panel/focus-trap; let it span the layer. */
.overlay-layer wa-dialog {
  pointer-events: auto;
}

/* Onboarding tooltip: kept positioning host; inner is a wa-callout. */
.tooltip-layer {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  max-width: 340px;
}
.tooltip {
  width: 100%;
}
.tip-text {
  line-height: 1.4;
}
.tip-dismiss {
  margin-top: 0.4rem;
  align-self: flex-end;
}

/* Dialog bodies */
.os-elapsed {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}
.os-gained {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.os-exp {
  margin: 0.2rem 0.2rem 0 0;
}
.victory-title {
  font-size: 1.25rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.victory-text {
  line-height: 1.45;
}
.victory-sub {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-top: 0.5rem;
}

/* HUD error flash: imperative host + reconciled wa-callout child */
.hud-error {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  max-width: 90vw;
}
.hud-error-callout {
  box-shadow: var(--shadow);
}

/* MAX / starved legend (clarity) */
.factory-legend {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  z-index: 30;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  color: var(--ink-soft);
  pointer-events: none;
}
.factory-legend .lg-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.factory-legend .lg-max {
  color: var(--good);
}
.factory-legend .lg-starved {
  color: var(--bad);
}
```

  Note: the old `.hud-error` rule earlier in Layout.css (lines ~61-72) gave the host its own red background/padding — that styling now belongs to the `wa-callout`, so remove the inner `background`/`color`/`padding`/`border-radius` from that earlier rule. Do that in Step 2.

- [ ] **Step 2: Slim the earlier `.hud-error` host rule.** Replace the earlier `.hud-error` rule (lines ~61-72):

```css
.hud-error {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bad);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 50;
}
```
  with (host positioning only — the new consolidated rule in Step 1 owns the rest; delete the duplicate background/padding so the callout supplies the look):

```css
/* .hud-error host positioning is defined in the overlay section below. */
```

- [ ] **Step 3: Add the legend mount in App's factory screen.** In `Source/UI/App.js` `_mountScreen()`, the factory branch appends `canvas` + `panelEl`. Add a static legend element after the panel append so the player sees what MAX/STARVED mean. Replace the factory branch:

```js
    if (route === "factory") {
      const canvas = document.createElement("div");
      canvas.className = "graph-host";
      this.screenEl.appendChild(canvas);
      this.screenEl.appendChild(this.panelEl);
      this.panelEl.innerHTML = "";
      this.graphView = new GraphView(canvas, this.game, {
        onSelect: (id) => {
          this.selectedNodeId = id;
          this.renderNow();
        },
      });
    } else {
```
  with:

```js
    if (route === "factory") {
      const canvas = document.createElement("div");
      canvas.className = "graph-host";
      this.screenEl.appendChild(canvas);
      this.screenEl.appendChild(this.panelEl);
      this.panelEl.innerHTML = "";
      const legend = document.createElement("div");
      legend.className = "factory-legend";
      patch(legend, [
        h("span", { class: "lg-item lg-max" }, icon("max"), " MAX = running at level cap"),
        h("span", { class: "lg-item lg-starved" }, icon("starved"), " STARVED = needs more input"),
      ]);
      this.screenEl.appendChild(legend);
      this.graphView = new GraphView(canvas, this.game, {
        onSelect: (id) => {
          this.selectedNodeId = id;
          this.renderNow();
        },
      });
    } else {
```

  Note: `icon("max")` → `gauge-high` (green), `icon("starved")` → `triangle-exclamation` (red), per Icons.js — the same glyphs the P3 node badges use, so the legend matches the canvas cues.

- [ ] **Step 4: Theme.css — no new raw tokens required.** The legend reuses `--good`/`--bad`/`--panel`/`--line` already defined in Theme.css. Confirm those exist (they do, per the current file). No edit needed unless a polish token is missing; if so add it under `:root`. Skip if nothing is missing.

- [ ] **Step 5: Syntax/sanity checks.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/App.js && echo "app ok"
grep -c '\.modal-backdrop\|\.modal {' Source/Styles/Layout.css
```
Expected: `app ok`; the grep prints `0` (dead modal rules retired).

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Styles/Layout.css Source/Styles/Theme.css Source/UI/App.js
git commit -m "feat(ui): polish overlay/dialog CSS + MAX/starved factory legend; retire dead modal rules"
```

---

### Task 5.6: Migrate the PlaythroughProbe selectors for the WA overlay

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/PlaythroughProbe.mjs`

The probe drives the real overlay components under the `FakeEl` shim. WA tags do NOT upgrade under the shim (no shadow DOM, no `wa-hide` dispatch), so the probe asserts emitted vnodes/attributes/handlers only. Three migrations are needed:

1. STEP 8 (OfflineSummary): currently asserts `text.includes("🪙")`. The gained currencies are now `wa-tag`s with `icon()` (`fa-coins`), no emoji. Re-point the assertion to the new structure. The close button is still `.os-close` (now a `wa-button` with `onclick`) — that selector survives. The `#OfflineSummary` id survives.
2. STEP 7 / STEP 12 (Victory): `.victory-close` and the body text (`Yensburg Reclaimed`, `forges do not cool`, `Free-play continues`) all survive as text in the new tree; `.victory-close` is now a `wa-button` with `onclick` — the probe calls `.onclick()` directly, which still works. No change needed there, but the title now lives in the `slot="label"` div — confirm `vHost.text` still contains it (it does; slot is just an attribute, the text is a child). No change needed for STEP 7/12.
3. STEP 9 (Tooltip): `#TooltipLayer`, `.tip-text`, `.tip-dismiss` all survive; `.tip-dismiss` is now a `wa-button` with `onclick`. No change needed.

So only STEP 8's emoji assertion must change.

- [ ] **Step 1: Re-point STEP 8's gained-amount assertion.** In `Tests/PlaythroughProbe.mjs`, find STEP 8's block. Replace:

```js
    assert(
      /\+/.test(text) && text.includes("🪙"),
      `OfflineSummary did not render gained amounts; text="${text}"`,
    );
```
  with:

```js
    // gained currencies now render as wa-tag + FA duotone icons (no emoji).
    const goldTag = host.querySelector(".os-gain");
    assert(goldTag, "OfflineSummary rendered no gained currency tag");
    assert(
      goldTag.querySelector("i.fa-coins"),
      "OfflineSummary gold tag has no FA coins icon",
    );
    assert(/\+/.test(text), `OfflineSummary did not render a gained amount; text="${text}"`);
```

  Notes: `.os-gain` is the class on each gained `wa-tag` (Task 5.1); `icon("gold")` emits `<i class="fa-duotone fa-solid fa-coins …">`, so `i.fa-coins` matches under the shim's selector engine. The `#OfflineSummary` id, `.os-close` close button, and the gold-amount-in-text assertions later in STEP 8 (`text.replace(/,/g,"").includes(String(goldShown))`) are unchanged and still pass (the value text lives inside the `wa-tag`).

- [ ] **Step 2: Confirm no emoji-dependent assertions remain in the probe.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -nP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' Tests/PlaythroughProbe.mjs && echo "EMOJI REF REMAIN" || echo "probe emoji-free"
```
Expected: `probe emoji-free` (the `console.log` summary line at the end of STEP 8 also references `🪙` — re-point it too in Step 3 if grep flags it).

- [ ] **Step 3: De-emoji the STEP 8 summary log if flagged.** If Step 2 flagged the log line, replace:

```js
    console.log(
      `    [render+click] OfflineSummary (gained 🪙${goldShown} over ${summary.appliedMs}ms)`,
    );
```
  with:

```js
    console.log(
      `    [render+click] OfflineSummary (gained ${goldShown} gold over ${summary.appliedMs}ms)`,
    );
```

- [ ] **Step 4: Run the probe, expect PASS.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/PlaythroughProbe.mjs | tail -3
```
Expected: `13/13 steps passed.` and `PROBE PASS: full play-session reachable through the real UI layer.`

- [ ] **Step 5: Run the full unit suite (engine + UI helpers) to confirm no regression.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
```
Expected: `0 failed`.

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Tests/PlaythroughProbe.mjs
git commit -m "test(ui): migrate PlaythroughProbe OfflineSummary assertion to wa-tag/FA icon (no emoji)"
```

---

### Task 5.7: Service worker cache v8

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`

P5 ships no NEW asset files (all changes are edits to existing JS/CSS already in `SHELL` from P1-P2: `App.js` loads via `Main.js`; `Layout.css`/`Theme.css` are in `SHELL`). Bump the cache so the activate handler purges the old cache and re-precaches the edited shell.

- [ ] **Step 1: Bump the cache version.** In `Source/../ServiceWorker.js`, change:

```js
const CACHE = "idlekingdom-v7";
```
  to:

```js
const CACHE = "idlekingdom-v8";
```

  Note: the repo's current `CACHE` line reads whatever the last-shipped phase set (P4 → `idlekingdom-v7`). Match the actual current value when editing; the target is `idlekingdom-v8`. The `SHELL` list already contains `./Source/Styles/Layout.css` + `./Source/Styles/Theme.css` and the vendored WA/FA assets (added in P1) — confirm they are present; if any P5-edited file is missing from `SHELL`, add it. No new files are introduced this phase, so no `SHELL` additions are expected.

- [ ] **Step 2: Verify SHELL covers the P5-touched shell assets.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check ServiceWorker.js && echo "syntax ok"
grep -E 'Layout.css|Theme.css|WaTheme.css|webawesome|duotone' ServiceWorker.js
```
Expected: `syntax ok`; the grep shows Layout.css, Theme.css, WaTheme.css, the WA loader/css, and the FA duotone css + woff2 already listed (from P1-P2). If WaTheme.css is missing, add `"./Source/Styles/WaTheme.css",` to `SHELL`.

- [ ] **Step 3: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add ServiceWorker.js
git commit -m "chore(pwa): SW cache v8 for P5 overlay re-platform"
```

---

### Task 5.8: Deploy + curl checks

**Files:** (none — verification + deploy)

- [ ] **Step 1: Full gate before deploy.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
node Tests/PlaythroughProbe.mjs | tail -2
node Tests/VictoryProbe.mjs | tail -1
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v Icons.js && echo "EMOJI REMAIN — fix before deploy" || echo "UI emoji-free"
```
Expected: `0 failed`; `13/13 steps passed.` + `PROBE PASS`; `PROBE PASS: engine reaches victory…`; `UI emoji-free`.

- [ ] **Step 2: Deploy via the buildless rsync.** Password from `memory/server_access.md` → Home Server. Run:

```bash
cd /home/evilc/Projects/IdleKingdom
SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
  --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' --exclude='package.json' --exclude='.gitignore' --exclude='.npmrc' --exclude='.omc/' \
  -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
```

- [ ] **Step 3: Verify the edited assets serve 200.** Run:

```bash
for u in Index.html Source/UI/App.js Source/UI/OfflineSummary.js Source/UI/Victory.js \
         Source/UI/Tooltip.js Source/Styles/Layout.css Source/Styles/Theme.css ServiceWorker.js; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://dev.jdayers.com/kingdom/$u"
done
```
Expected: all `200`; `.js` served as a JS MIME, `.css` as `text/css`.

- [ ] **Step 4: Commit nothing (deploy is stateless); proceed to acceptance.** No commit — deploy produces no repo changes.

---

### Task 5.9: HUMAN browser acceptance

**Files:** (none — manual verification)

Web Awesome components do NOT render under the node test shim — these behaviors are browser-only. Hard-reload `https://dev.jdayers.com/kingdom/` (twice, or Ctrl+Shift+R, for the SW v8 swap) and confirm each item below with the concrete expected observation.

- [ ] **Step 1: OfflineSummary dialog (focus-trap + dismissal).** Close the tab for >60s, reopen `/kingdom/`. Expected:
  - A `wa-dialog` titled "While you were away" opens centered with a WA backdrop.
  - Body shows the elapsed line + three gained currency `wa-tag`s with two-tone Duotone coins/scroll/shield icons (no emoji), plus a `wa-tag variant=success` per reclaimed expedition.
  - Keyboard focus is trapped inside the dialog (Tab cycles only within it).
  - Clicking the backdrop OR pressing Esc OR clicking "Continue" closes it; it does NOT reappear on the next 2s HUD tick (proves `pendingOfflineSummary` cleared by `onWaHide`/`onClose`).

- [ ] **Step 2: Victory dialog fires exactly once and is acknowledged.** Drive a save to victory (or load a won save). Expected:
  - The Victory `wa-dialog` opens with a crown icon + "Yensburg Reclaimed" in the label, the epilogue body, and the free-play sub-line.
  - Clicking the BACKDROP does NOT close it (light-dismiss off — acknowledged-only). Esc or "Continue the Reign" closes it.
  - After closing, reload the page: the Victory dialog does NOT reappear (proves `AckVictory` persisted `seenVictory`; the App gate suppresses re-fire). Free-play continues, all content unlocked.

- [ ] **Step 3: Tutorial callouts anchor, advance, and persist.** On a fresh save (clear localStorage), Expected:
  - The first onboarding `wa-callout variant=brand` appears (bottom-center) with a `circle-info` start icon, the gold tip text, and a "Got it" `wa-button`.
  - Clicking "Got it" dismisses it and the NEXT tip (upgrade) appears — the callout advances through the tutorial order.
  - Reload mid-sequence: already-dismissed tips do NOT reappear; the next un-seen tip shows (proves `DismissTooltip` flag persisted via the engine save).

- [ ] **Step 4: Selectable dialog body text.** In the OfflineSummary and Victory dialogs, click-drag across the elapsed/epilogue body text. Expected: the `.modal-text`/`.victory-text` body IS selectable (highlights), while chrome (buttons, tags, the title) is NOT (per the Reset.css `user-select` split). Confirm shadow-DOM slotted body text honors `user-select:text` (spec §7 caveat) — if the body does not highlight, note it.

- [ ] **Step 5: Error-flash callout appears and auto-clears.** Trigger a rejected intent (e.g. attempt an unaffordable Upgrade, or place an invalid connection) so `snap.lastError` is set. Expected:
  - A `wa-callout variant=danger` with a `triangle-exclamation` start icon and the error text appears near the top-center.
  - It auto-clears after ~2.5s (the imperative timer) and the host returns to hidden; firing another error shows a fresh callout.

- [ ] **Step 6: MAX/STARVED legend + general polish.** On the Factory screen, Expected:
  - A small parchment legend at bottom-left reads "MAX = running at level cap" (gauge-high, green) and "STARVED = needs more input" (triangle-exclamation, red), matching the node-card cues from P3.
  - Overall layout is uncluttered (no leftover bare HTML buttons/modals; dialogs and callouts use the fantasy palette tokens).
  - No console errors; no Vendor 404s; no FA "missing-glyph" boxes.

- [ ] **Step 7: Tag + finalize.** If all acceptance items pass:

```bash
cd /home/evilc/Projects/IdleKingdom
git tag -f ui-p5-modals-tooltips-polish
git push origin main && git push -f origin ui-p5-modals-tooltips-polish
```

---

## Notes for the executor
- **Engine + Selectors untouched.** `victoryReady`/`nextTutorialStep` in `Source/UI/Logic/Selectors.js` and the `AckVictory`/`seenVictory`/`DismissTooltip` persistence in App.js + the engine are NOT modified. This phase only swaps the overlay components' vnode trees and the error-flash render path, plus CSS/legend polish.
- **Close-wiring stays in App.** `App._renderOverlay` keeps owning which overlay vnodes exist (`pendingOfflineSummary`, `showVictory`, `Tooltip(snap)`); the dialogs/callouts close via the `onClose`/`dispatch` closures App already passes. `onWaHide` catches Esc/backdrop dismissal so those paths run the same `onClose` as the button.
- **Keys are mandatory.** Every overlay component is keyed (`"offline"`, `"victory"`, `"tip-"+step`, `"err"`) so the 2s HUD re-render and intent re-renders reuse the element in place and never tear down an open dialog/callout (spec §6 / established conventions).
- **`prop:open` is authoritative.** The dialog emits `prop:open:true` every render while it should be shown; App stops rendering the vnode to remove it. Do not rely on toggling `open` to false — removing the vnode (via `patch`) destroys the node, and re-adding it re-mounts a fresh open dialog.
- **Probe is browser-incomplete by design.** The `wa-dialog` focus-trap, light-dismiss, and `wa-hide` dispatch never run under the node shim — those are verified ONLY in Task 5.9. The probe migration (Task 5.6) only re-points the one emoji assertion; the rest of the overlay selectors survive unchanged.
- **SW version.** Match the actual current `CACHE` value in `ServiceWorker.js` when bumping; the P5 target is `idlekingdom-v8`. No new asset files are added this phase, so `SHELL` should already be complete from P1-P2 — verify, don't blindly append.
