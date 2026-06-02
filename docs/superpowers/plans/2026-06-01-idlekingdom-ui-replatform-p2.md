# IdleKingdom UI Re-platform — Phase 2 (HUD + Tabs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the HUD onto Web Awesome — currency + save as keyed `wa-tag`s and the tab bar as a `wa-tab-group` that drives the existing hash router via `wa-tab-show` — without reintroducing per-frame rendering or new game state.

**Architecture:** `Source/UI/Hud.js` keeps its `render(snap)` signature and its `(el, router)` constructor; only the emitted vnode tree changes. Three currency cells become keyed `wa-tag` (pill, `size=l`) each with a `start`-slot Duotone `icon()` + value + a `<small>` /s rate; the save badge becomes a keyed `wa-tag` (`variant` success/danger, `appearance=outlined`). The four tabs become a `wa-tab-group` (`prop:active={router.current}`) of `wa-tab`s (one per `panel`), with NO `wa-tab-panel` (App still owns screen mounting via `_mountScreen`). Routing stays hash-based: `onWaTabShow` calls `router.navigate(event.detail.name)`. The `onWa*`/`prop:` render-layer paths and `Icons.js` already shipped in P1 and are reused verbatim; `Dom.js` is NOT modified.

**Tech Stack:** Vanilla JS ESM (buildless), Web Awesome v3.7.0 (`wa-tag`, `wa-tab-group`, `wa-tab`, vendored), Font Awesome Pro Duotone icons via `Source/UI/Icons.js`, zero-dep node test runner, service worker (`idlekingdom-v5`), Apache static hosting at `/kingdom/`.

**Spec:** docs/superpowers/specs/2026-06-01-idlekingdom-ui-replatform-design.md  ·  **Prereq:** Phase 1 (vendored WA/FA, theme, `Icons.js`, `Dom.js` `onWa*`/`prop:` extensions, all emoji removed) shipped.

---

### Task 2.1: Re-platform `Hud.js` onto `wa-tag` + `wa-tab-group`

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/Hud.js`

- [ ] **Step 1: Read the current file + confirm prerequisites.** Open `/home/evilc/Projects/IdleKingdom/Source/UI/Hud.js`. Confirm P1 already swapped the emoji in this file (icon import + `icon("gold")` etc.). If `Hud.js` still contains literal `🪙/📜/🛡️/💾/⚠` glyphs, STOP — P1 is not fully shipped and this phase's prereq is unmet. Also confirm `Source/UI/Icons.js` exports `icon` and that `Source/UI/Render/Dom.js` contains the `isWaListenerProp`/`waEventName` helpers and the `prop:` branch (P1). Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -nE 'isWaListenerProp|waEventName|prop:' Source/UI/Render/Dom.js | head
grep -n 'export function icon' Source/UI/Icons.js
grep -cP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' Source/UI/Hud.js
```
Expected: the Dom.js grep prints the P1 helper/branch lines; `icon` export is found; the emoji count for `Hud.js` is `0`. If the emoji count is non-zero, abort (prereq unmet).

- [ ] **Step 2: Rewrite `Source/UI/Hud.js`.** Replace the entire file with the version below. Notes baked in:
  - Currency cells keep the `.hud-cur` class **and** an inner `.val` span (probe selectors `.hud-cur` + `.val`) so the PlaythroughProbe migration stays minimal; the value text lives in `.val` exactly as today.
  - `wa-tag` uses `pill`, `size="l"`, `variant="neutral"` for currencies. The `<i>` icon goes in `slot="start"` (a plain attribute on the child vnode — passes through `setAttribute`, per spec §5 A3). Value + rate are default-slot children.
  - The save badge is a keyed `wa-tag` with `appearance="outlined"` and `variant` `success` (saved) / `danger` (failed); the icon concept is `save_ok` / `save_fail` (defined in P1's `Icons.js`). Keep class `hud-save` (+ `failed` when failed) so existing CSS/probe hooks survive.
  - The tab bar is a single `wa-tab-group` keyed `"tabs"` so the 2s HUD re-render and intent re-renders reuse it in place (never tear it down mid-interaction). `prop:active` is set to `this.router.current` so the authoritative route always drives active styling (spec M3 — value always reflects the authoritative source, don't lean on the `!==` guard for correctness). Each `wa-tab` carries `panel="<route>"`, is keyed `"tab-"+route`, an `start`-slot `icon(route)`, and the label text. NO `wa-tab-panel` is emitted (App owns mounting; spec §6 HUD + OQ-3).
  - `onWaTabShow` on the group calls `this.router.navigate(event.detail.name)`. `wa-tab-show`'s `event.detail.name` is the activated tab's `panel` value (spec §5 A1 / §6 HUD). The handler is a stable arrow bound on the instance so the remove-before-add bookkeeping in P1's `Dom.js` keeps exactly one listener across re-renders (spec §5 A4 — no accumulation). Guard `router` having no `navigate` (the probe passes `{current}` only) so the probe never throws if it ever fires it.

```js
import { h, patch } from "./Render/Dom.js";
import { formatNumber, formatRate } from "./Render/Format.js";
import { icon } from "./Icons.js";

const TABS = [
  { route: "factory", label: "Factory" },
  { route: "research", label: "Research" },
  { route: "expeditions", label: "Expeditions" },
  { route: "heroes", label: "Heroes" },
];

function currencyTag(key, concept, value, rate) {
  return h(
    "wa-tag",
    { key, class: "hud-cur", variant: "neutral", appearance: "filled", size: "large", pill: true },
    [
      icon(concept, "slot:start"),
      h("span", { class: "val" }, [value]),
      rate != null ? h("small", { class: "rate" }, [rate]) : null,
    ],
  );
}

export class Hud {
  constructor(el, router) {
    this.el = el;
    this.router = router;
    this._onTabShow = (e) => {
      const name = e && e.detail && e.detail.name;
      if (name && this.router && typeof this.router.navigate === "function") {
        this.router.navigate(name);
      }
    };
  }

  render(snap) {
    const cs = snap.currencyStrings || {};
    const goldV = cs.gold ?? formatNumber(snap.currencies.gold);
    const resV = cs.research ?? formatNumber(snap.currencies.research);
    const renV = cs.renown ?? formatNumber(snap.currencies.renown);
    const goldR = cs.goldRate ?? formatRate(snap.rates.goldRate);
    const resR = cs.researchRate ?? formatRate(snap.rates.researchRate);

    const saveOk = snap.save && snap.save.status === "ok";

    const tabGroup = h(
      "wa-tab-group",
      { key: "tabs", class: "hud-tabs", "prop:active": this.router.current, onWaTabShow: this._onTabShow },
      TABS.map((t) =>
        h("wa-tab", { key: "tab-" + t.route, panel: t.route }, [
          icon(t.route, "slot:start"),
          t.label,
        ]),
      ),
    );

    patch(this.el, [
      h("div", { class: "hud-currencies", key: "cur" }, [
        currencyTag("gold", "gold", goldV, goldR),
        currencyTag("research", "research", resV, resR),
        currencyTag("renown", "renown", renV, null),
      ]),
      h(
        "wa-tag",
        {
          key: "save",
          class: saveOk ? "hud-save" : "hud-save failed",
          variant: saveOk ? "success" : "danger",
          appearance: "outlined",
        },
        [
          icon(saveOk ? "save_ok" : "save_fail", "slot:start"),
          saveOk ? "saved" : "save failed",
        ],
      ),
      tabGroup,
    ]);
  }
}
```

- [ ] **Step 3: `slot:start` → real `slot="start"`.** The `icon(concept, extraClass)` helper from P1 appends `extraClass` to the icon's `class` attribute, which would wrongly emit `class="... slot:start"` rather than a `slot` attribute. Web Awesome reads the **`slot` attribute**, not a class. So do NOT pass `slot:start` through `extraClass`. Instead set the slot explicitly: replace each `icon(concept, "slot:start")` call above with a slotted wrapper using the icon vnode plus a `slot` prop. Concretely, change the three `currencyTag` icon lines and the two tab/save icon lines to wrap the icon in a `slot`-bearing vnode is unnecessary — instead add the `slot` attribute directly onto the `<i>` by post-setting it. Implement a tiny local helper at the top of `Hud.js` (below the imports) and use it everywhere an icon goes into a WA slot:

```js
function startIcon(concept) {
  const v = icon(concept);
  v.props = { ...v.props, slot: "start" };
  return v;
}
```

Then replace every `icon(concept, "slot:start")` / `icon(t.route, "slot:start")` / `icon(saveOk ? ... : ..., "slot:start")` call with `startIcon(concept)` / `startIcon(t.route)` / `startIcon(saveOk ? "save_ok" : "save_fail")`. (`icon()` returns a vnode `{tag,props,key,children}`; reassigning `props` with an added `slot` is safe and keeps the `class`/`style`/`aria-hidden` the helper set.) The currency value/rate stay default-slot children; only the icon carries `slot="start"`.

- [ ] **Step 4: Syntax check.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check Source/UI/Hud.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 5: Smoke-render under the existing engine test (no WA upgrade, structure only).** The node shim does NOT upgrade `wa-*` elements, but it DOES build the light-DOM tree the reconciler emits, so structural assertions hold. Run the existing render-cadence + format suites to confirm nothing regressed at import time:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js RenderCadence | tail -3
node Tests/RunAll.js Format | tail -3
```
Expected: both green (`0 failed`). (`Hud` is imported transitively where used; a syntax or import error would surface here.)

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Hud.js
git commit -m "feat(ui): re-platform HUD onto wa-tag currencies + wa-tab-group tabs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: HUD/tab CSS — `wa-tag` layout + `wa-tab-group` bottom placement on narrow screens

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Layout.css`

- [ ] **Step 1: Read the current HUD rules.** Open `/home/evilc/Projects/IdleKingdom/Source/Styles/Layout.css` lines 7–60 and 91–102. The existing rules target `.hud-currencies`, `.hud-cur`, `.hud-cur .val`, `.hud-cur .rate`, `.hud-tabs`, `.hud-tabs a`, `.hud-tabs a.active`, `.hud-save`, `.hud-save.failed`, and the `@media (max-width: 640px)` block. We keep the container classes (`.hud`, `.hud-currencies`, `.hud-tabs`) and the value/rate inner classes, retire the old `<a>`-anchored tab rules (now `wa-tab`), and add WA-specific layout.

- [ ] **Step 2: Replace the `.hud-cur`/`.hud-tabs a`/`.hud-save` rule block.** The currency/save are now `wa-tag` hosts (their internal look comes from WA tokens + variant/appearance per spec §3 theme). Update the `.hud-cur` inner layout, drop the old anchor-tab rules, and lay out the new tab group. Replace the block from `.hud-cur {` through `.hud-save.failed { ... }` (lines ~24–60 in the current file) with:

```css
.hud-cur {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.hud-cur .val {
  font-weight: 700;
}
.hud-cur .rate {
  font-size: 0.7rem;
  opacity: 0.8;
}
.hud-cur i[slot="start"],
.hud-save i[slot="start"] {
  font-size: 1rem;
}

/* Tab bar (wa-tab-group). WA owns active styling via tokens + the
   --wa-color-brand-* overrides in WaTheme.css; we only place/size it. */
.hud-tabs {
  flex: 0 0 auto;
}
.hud-tabs::part(base) {
  border-bottom: none;
}
.hud-tabs wa-tab i[slot="start"] {
  margin-inline-end: 0.3rem;
}

.hud-save {
  font-size: 0.8rem;
}
```

  Note: `.hud-save` / `.hud-save.failed` no longer set color — `wa-tag` `variant="success"/"danger"` + the theme tokens drive that. Keep the `.hud-save` selector (probe/CSS hook) but it is now a `wa-tag` host. `::part(base)` targets the WA component's exposed `base` part (Web Awesome components expose CSS parts; `base` is the outer wrapper — used here only to remove the default tab-group bottom rule against the iron HUD bar). If the part name differs in the vendored build, this rule is cosmetic and a no-op (falls through harmlessly); verify the tab strip looks clean in the browser pass and adjust the part name then.

- [ ] **Step 3: Bottom placement on narrow screens.** The spec calls for `placement="bottom"` on narrow screens "via CSS/media". `wa-tab-group` placement is normally an attribute, but App owns no per-width re-render and we must not add JS resize wiring (render cadence is locked). Use a media query to dock the whole HUD's tab strip to the bottom visually instead — extend the existing `@media (max-width: 640px)` block so the tab group spans full width at the bottom of the stacked HUD (the HUD already switches to `flex-direction: column` there and the tabs already get `order: 3`). Replace the existing `@media (max-width: 640px)` block (lines ~91–102) with:

```css
@media (max-width: 640px) {
  .hud {
    flex-direction: column;
    align-items: stretch;
  }
  .hud-currencies {
    order: 1;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .hud-save {
    order: 2;
    align-self: flex-end;
  }
  .hud-tabs {
    order: 3;
    width: 100%;
  }
  .hud-tabs::part(nav) {
    justify-content: space-around;
  }
}
```

  Note: `::part(nav)` targets the tab-group's internal scrolling nav row so the four tabs spread evenly across the full-width bottom strip. As with `::part(base)`, if the exposed part name differs in the vendored build this rule is a harmless no-op; the fallback `width: 100%` already gives a full-width bottom strip. The visual result (a bottom tab bar on phones) is confirmed in the browser pass.

- [ ] **Step 4: Verify the CSS file parses (no dangling braces) + nothing else references the removed selectors.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node -e "const c=require('fs').readFileSync('Source/Styles/Layout.css','utf8');const o=(c.match(/{/g)||[]).length,x=(c.match(/}/g)||[]).length;console.log('braces',o,x);process.exit(o===x?0:1)" && echo "balanced"
grep -rn 'hud-tabs a' Source Tests --include=*.js --include=*.mjs || echo "no JS refs to old anchor-tab selector"
```
Expected: `braces N N` + `balanced`; the JS grep prints only the PlaythroughProbe line (migrated in Task 2.3) or "no JS refs" once that migration is done. (At this point the probe still uses `.hud-tabs a` — that's expected; Task 2.3 migrates it.)

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Styles/Layout.css
git commit -m "style(ui): HUD layout for wa-tag currencies + wa-tab-group (bottom on narrow)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Migrate PlaythroughProbe HUD selectors to the new tags

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/PlaythroughProbe.mjs`

- [ ] **Step 1: Read the HUD assertion block.** Open `/home/evilc/Projects/IdleKingdom/Tests/PlaythroughProbe.mjs` lines ~470–496. It currently asserts:
  - `hudEl.querySelectorAll(".hud-cur")[0]` exists and its `.querySelector(".val").text` includes `"25"`.
  - `hudEl.querySelectorAll(".hud-cur").length === 3`.
  - `hudEl.querySelectorAll(".hud-tabs a").length === 4`.

  The new HUD keeps `.hud-cur` (now on each currency `wa-tag`) **and** the inner `.val` span, so the gold-cell and currency-count assertions survive **unchanged**. Only the tab selector must change: tabs are now `wa-tab[panel="..."]` inside `.hud-tabs`, not `<a>`.

  Important: the probe's FakeEl shim (lines 18–229) does NOT upgrade `wa-*` elements and its `addEventListener` stores a single listener per type — but the probe never dispatches `wa-tab-show`, and the probe's `router` is a plain `{ current: "factory" }` object (no `navigate`), so the new HUD's tab-show handler is never invoked here. No shim change is needed. The probe's `querySelectorAll` supports tag + `[attr="v"]` + descendant selectors (lines 144–220), so `.hud-tabs wa-tab` and `wa-tab[panel="factory"]` both work against the emitted light-DOM tree.

- [ ] **Step 2: Migrate the tab selector.** Replace the tab assertion (the `hudEl.querySelectorAll(".hud-tabs a")` block, ~lines 493–496) with one that asserts four `wa-tab`s with the right `panel` values. Apply this exact edit:

```js
    // Tabs are now wa-tab[panel] inside the wa-tab-group (no <a>, no wa-tab-panel).
    assert(
      hudEl.querySelectorAll(".hud-tabs wa-tab").length === 4,
      `HUD rendered ${hudEl.querySelectorAll(".hud-tabs wa-tab").length} tabs (expected 4 wa-tab)`,
    );
    for (const route of ["factory", "research", "expeditions", "heroes"]) {
      assert(
        hudEl.querySelector(`wa-tab[panel="${route}"]`),
        `HUD missing wa-tab for route "${route}"`,
      );
    }
    // No wa-tab-panel is emitted — App owns screen mounting (spec §6 HUD / OQ-3).
    assert(
      hudEl.querySelectorAll("wa-tab-panel").length === 0,
      `HUD emitted ${hudEl.querySelectorAll("wa-tab-panel").length} wa-tab-panel (expected 0)`,
    );
```

  Leave the `.hud-cur` gold-cell and `.hud-cur` count assertions (lines ~481–492) exactly as they are — they still pass because the new currency `wa-tag`s keep `class="hud-cur"` with an inner `.val` span.

- [ ] **Step 3: Run the probe + confirm the HUD step passes.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/PlaythroughProbe.mjs 2>&1 | tail -25
```
Expected: the probe completes its full run with the HUD step green (no `assert` failure mentioning `.hud-cur`, currency count, `wa-tab`, or `wa-tab-panel`); the script exits 0. If `querySelectorAll('wa-tab')` returns 0, the most likely cause is the icon's `slot` attribute clobbering the tag — re-check Task 2.1 Step 3 (`startIcon` sets `slot`, not a class).

- [ ] **Step 4: Run the full registered suite (regression gate).** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -3
```
Expected: `0 failed` (the registered suites — 256 engine + P1 UI helper suites — are unaffected by the Hud/probe change).

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Tests/PlaythroughProbe.mjs
git commit -m "test(ui): migrate PlaythroughProbe HUD selectors to wa-tag/wa-tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4: Service worker cache v5

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`

- [ ] **Step 1: Bump the cache version.** P2 ships no new assets (Hud.js is loaded via `Source/Main.js`, already in `SHELL`; the WA/FA Vendor assets entered `SHELL` in P1's `-v4`). Only the version bump is needed so the activate handler purges the old cache and re-precaches the changed `Hud.js`/`Layout.css`. In `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`, change line 1:

```js
const CACHE = "idlekingdom-v5";
```
  Leave `SHELL` and the install/activate/fetch handlers unchanged (the P1 `-v4` entries — `WaTheme.css`, the WA loader/CSS, the FA CSS + `fa-duotone-900.woff2` — must already be present; if `SHELL` does NOT contain `./Source/Styles/WaTheme.css` and the Vendor entries, P1 was not fully shipped — STOP and report).

- [ ] **Step 2: Confirm prereq SHELL entries + syntax.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node --check ServiceWorker.js && echo "syntax ok"
grep -q 'idlekingdom-v5' ServiceWorker.js && echo "v5 set"
for s in WaTheme.css webawesome.loader.js styles/webawesome.css fontawesome.css duotone.css fa-duotone-900.woff2; do
  grep -q "$s" ServiceWorker.js && echo "shell has $s" || echo "MISSING SHELL: $s (P1 incomplete)"
done
```
Expected: `syntax ok`, `v5 set`, and `shell has …` for all six (no `MISSING SHELL`). If any are missing, P1 is incomplete — STOP.

- [ ] **Step 3: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add ServiceWorker.js
git commit -m "chore(pwa): bump SW cache to idlekingdom-v5 (HUD re-platform)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.5: Deploy + endpoint verification

**Files:** (none — verification + deploy)

- [ ] **Step 1: Final pre-deploy gate.** Run the full registered suite, the standalone probe, and a HUD-specific emoji check:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
node Tests/PlaythroughProbe.mjs >/dev/null 2>&1 && echo "probe exit 0" || echo "PROBE FAILED"
grep -cP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' Source/UI/Hud.js
```
Expected: `0 failed`, `probe exit 0`, and `0` (no emoji in `Hud.js`).

- [ ] **Step 2: Deploy via the buildless rsync.** Password from `memory/server_access.md` → Home Server. (Vendor/ is under Source/ so it ships; `--delete` keeps the remote tree clean.) Run:

```bash
cd /home/evilc/Projects/IdleKingdom
SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
  --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' --exclude='package.json' --exclude='.gitignore' --exclude='.npmrc' --exclude='.omc/' \
  -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
```
If `sshpass`/network is blocked in this environment, STOP and ask the human to run the rsync (server password needed), then continue.

- [ ] **Step 3: Verify the changed assets + WA/FA shell serve 200.** Run:

```bash
for u in Index.html Source/UI/Hud.js Source/Styles/Layout.css ServiceWorker.js \
         Source/Vendor/WebAwesome/webawesome.loader.js \
         Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://dev.jdayers.com/kingdom/$u"
done
```
Expected: all `200`; `Hud.js` served as a JS type (`text/javascript` or `application/javascript`); the woff2 as `font/woff2`.

- [ ] **Step 4: Commit anything regenerated.** (None expected — verification only. If nothing changed, skip.)

---

### Task 2.6: HUMAN browser acceptance (the only real WA behavior check)

**Files:** (none — manual verification)

> The node shim never upgrades `wa-*` elements (no shadow DOM, no `wa-tab-show` dispatch, no `prop:active` reflection), so all real tab/router behavior is browser-verified here. Hard-reload `https://dev.jdayers.com/kingdom/` twice (or Ctrl+Shift+R) to swap to SW `idlekingdom-v5`.

- [ ] **Step 1: HUD renders correctly.** Confirm:
  - Three currency `wa-tag` pills render across the HUD, each showing a Duotone two-tone icon (coins / scroll / shield-halved per `Icons.js`) in the parchment/gold/ink palette, the value, and (gold + research) a small `/s` rate; renown shows no rate.
  - The save badge renders as an outlined `wa-tag` (green when saved) with a floppy-disk icon and "saved".
  - No console errors, no Vendor 404s, no FA "missing-glyph" boxes.

- [ ] **Step 2: Tabs switch routes + active styling (OQ-3).** Confirm:
  - The four tabs render in the `wa-tab-group` with their Duotone start icons + labels (Factory / Research / Expeditions / Heroes), even though NO `wa-tab-panel` exists (spec OQ-3 — verify the group renders all four tabs and does not error/collapse with no panels present).
  - Clicking a tab navigates: the URL hash changes to `#/research` etc. AND the screen content swaps (App's `_mountScreen` mounts the route's panel host). This proves `wa-tab-show` → `router.navigate(event.detail.name)` is wired (`event.detail.name` = the tab's `panel`).
  - The active tab shows the brand/gold active styling and it matches the current route after each click.

- [ ] **Step 3: Deep-link + back/forward.** Confirm:
  - Loading `https://dev.jdayers.com/kingdom/#/expeditions` directly opens on the Expeditions screen with the Expeditions tab active (`prop:active={router.current}` on mount).
  - After clicking through Factory → Research → Heroes, the browser Back button returns through the route history and the active tab + screen both follow each hash change (the router's `hashchange` listener and the HUD re-render keep them in sync). Forward re-advances correctly.
  - Loading a junk hash (`#/nonsense`) lands on Factory (router `DEFAULT_ROUTE`) with the Factory tab active.

- [ ] **Step 4: No listener accumulation across the 2s HUD re-render (DevTools).** The HUD re-renders every ~2s (`App.refreshHud`) and on every intent. Confirm the `onWaTabShow` listener does not stack:
  - Open DevTools → Elements → select the `<wa-tab-group class="hud-tabs">` element → "Event Listeners" pane. Note the count of `wa-tab-show` listeners (should be exactly 1).
  - Leave the page idle ~10s (≥5 HUD re-renders) and let several intents fire (click around the factory). Re-check the "Event Listeners" pane: the `wa-tab-show` count must STILL be 1 (P1's remove-before-add bookkeeping in `Dom.js` + the stable `this._onTabShow` handler). If it grows, the handler identity is unstable — re-check that `_onTabShow` is bound once in the constructor (Task 2.1).
  - Tabs must remain clickable after the idle period (a stacked/torn-down group would break click handling) — click each tab once more and confirm it still routes.

- [ ] **Step 5: Narrow-screen placement.** In DevTools device toolbar (≤640px width), confirm the HUD stacks and the tab strip docks full-width at the bottom with the four tabs spread evenly, and tab navigation still works.

- [ ] **Step 6: Capture evidence + finalize.** Screenshot the wide HUD (tabs + currencies), the narrow/bottom tab bar, and the DevTools "Event Listeners: 1" view. If all checks pass:

```bash
cd /home/evilc/Projects/IdleKingdom
git tag -f ui-p2-hud-tabs
git push origin main && git push -f origin ui-p2-hud-tabs
```
If any check fails, do NOT tag — record the failure (which step, observed vs expected) and iterate on the responsible task before re-deploying.

---

## Notes for the executor
- **Dom.js is NOT modified this phase.** P2 only consumes the P1 `onWa*`/`prop:` paths. If `onWaTabShow`/`prop:active` don't behave, the bug is in P1's `Dom.js` (or P1 wasn't shipped) — verify Task 2.1 Step 1 first.
- **Keep the semantic classes.** `.hud-cur` (currency tags), `.val` (value span), `.hud-tabs` (tab group), `.hud-save` (save tag) all stay so the probe selectors and existing CSS hooks survive (spec §6 cleanup note).
- **No `wa-tab-panel`.** App owns screen mounting via `_mountScreen`; the `wa-tab-group` is purely the styled, route-driving tab bar (spec §6 HUD + OQ-3, browser-verified in Task 2.6 Step 2).
- **Render cadence unchanged.** The HUD still renders on `App._onSnapshot`/`_mountScreen` (intents + mount) and the 2s `refreshHud`; no per-frame rendering is introduced. The keyed `wa-tab-group` is reused in place across all of these so it never tears down mid-interaction.
- **Probe shim caveat.** The PlaythroughProbe never fires `wa-tab-show` (its `router` is `{current}` only), so its single-listener `addEventListener` shim is irrelevant here. Real listener-accumulation is browser-only (Task 2.6 Step 4).
