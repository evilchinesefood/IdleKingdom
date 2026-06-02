# IdleKingdom UI Re-platform — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Web Awesome + Font Awesome Pro Duotone foundation — vendored buildless assets, the fantasy theme via WA tokens, a central icon map, all emoji replaced with Duotone `<i>` icons (incl. `<foreignObject>` icons inside the SVG canvas), `user-select:none` on chrome, and the additive `h()`/`patch` extensions for WA custom events + properties — without re-platforming any component yet.

**Architecture:** Everything is additive. WA/FA load via vendored files under `Source/Vendor/` referenced by relative `<link>`/`<script>` (buildless, subpath-safe for `/kingdom/`). A new `Source/UI/Icons.js` is the single icon source of truth; `Source/UI/Render/Dom.js` gains an `onWa*` event path and a `prop:` property path that stay inert until P2+ uses them. Native HTML controls are untouched this phase. Engine stays headless; the 256-test suite stays green; new pure-helper tests lock the icon map, the Dom extensions, and the `fmtCost` change.

**Tech Stack:** Vanilla JS ESM (buildless), Web Awesome v3.7.0 (`dist-cdn`, vendored), Font Awesome Pro **Duotone** webfonts (vendored), zero-dep node test runner, Apache static hosting (`.htaccess`), service worker (`idlekingdom-v4`).

**Spec:** `docs/superpowers/specs/2026-06-01-idlekingdom-ui-replatform-design.md` (read §2 delivery, §3 tokens, §4 icons, §5 render extensions, §7 item-1, §9 P1).

**Sequencing gate (OQ-1):** Tasks run in order. The vendor step (1.1) MUST complete before authoring `WaTheme.css` (1.2), because the exact `--wa-*` token names are confirmed by grepping the vendored stylesheet — do not author the theme from the spec's draft token list.

**Secrets note:** the Font Awesome npm token lives in `memory/secrets.md` (FontAwesome Pro section). It goes into a **gitignored** `.npmrc` only. NEVER commit the token or paste it into any committed file (including this plan).

---

### Task 1.1: Repo hygiene + vendor Web Awesome & FA Pro Duotone

**Files:**
- Create: `/home/evilc/Projects/IdleKingdom/.npmrc` (GITIGNORED — holds the token)
- Create: `/home/evilc/Projects/IdleKingdom/Source/Vendor/.npmrc.example`
- Create: `Source/Vendor/WebAwesome/**`, `Source/Vendor/FontAwesome/css/**`, `Source/Vendor/FontAwesome/webfonts/**`
- Modify: `/home/evilc/Projects/IdleKingdom/.gitignore`

- [ ] **Step 1: Gitignore the token file.** Append to `.gitignore`:

```
# Font Awesome / Web Awesome private registry auth (never commit)
.npmrc
```

- [ ] **Step 2: Write the committed example (no secret).** Create `Source/Vendor/.npmrc.example`:

```
# Copy to repo-root .npmrc (gitignored) and fill the token from memory/secrets.md → FontAwesome Pro.
@fortawesome:registry=https://npm.fontawesome.com/
@awesome.me:registry=https://npm.fontawesome.com/
//npm.fontawesome.com/:_authToken=YOUR_FA_PACKAGE_TOKEN
```

- [ ] **Step 3: Write the real `.npmrc`.** Create repo-root `.npmrc` with the same three lines, substituting the actual token from `memory/secrets.md` (FontAwesome Pro section). Confirm it is gitignored: `git -C /home/evilc/Projects/IdleKingdom check-ignore .npmrc` should print `.npmrc`.

- [ ] **Step 4: Install + vendor from a scratch dir.** Run (uses the repo `.npmrc` via `--userconfig`):

```bash
mkdir -p /home/evilc/python/idlekingdom-vendor && cd /home/evilc/python/idlekingdom-vendor
npm install --userconfig /home/evilc/Projects/IdleKingdom/.npmrc @awesome.me/webawesome@3.7.0 @fortawesome/fontawesome-pro
mkdir -p /home/evilc/Projects/IdleKingdom/Source/Vendor/FontAwesome
cp -R node_modules/@awesome.me/webawesome/dist-cdn /home/evilc/Projects/IdleKingdom/Source/Vendor/WebAwesome
cp -R node_modules/@fortawesome/fontawesome-pro/css node_modules/@fortawesome/fontawesome-pro/webfonts /home/evilc/Projects/IdleKingdom/Source/Vendor/FontAwesome/
```

If the registry is unreachable in this environment, STOP and ask the human to run the above via the `! <command>` prompt prefix (network + token needed), then continue.

- [ ] **Step 5: Verify the vendored layout exists.** Run and expect all four to print a path (non-empty):

```bash
cd /home/evilc/Projects/IdleKingdom
ls Source/Vendor/WebAwesome/webawesome.loader.js \
   Source/Vendor/WebAwesome/styles/webawesome.css \
   Source/Vendor/FontAwesome/css/duotone.css \
   Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2
```
Expected: four paths, no "No such file". (If `dist-cdn/` was absent, the npm tarball differs from the docs — re-check the package version and report.)

- [ ] **Step 6: Commit.** (Commit the vendored files — repo is private, Pro license permits self-hosting; commit the example and gitignore, NOT `.npmrc`.)

```bash
cd /home/evilc/Projects/IdleKingdom
git add .gitignore Source/Vendor/.npmrc.example Source/Vendor/WebAwesome Source/Vendor/FontAwesome
git status --short | grep -q '\.npmrc$' && echo "ERROR: .npmrc staged — abort" || echo "ok: token not staged"
git commit -m "chore(ui): vendor Web Awesome v3.7.0 (dist-cdn) + FA Pro Duotone (buildless)"
```

---

### Task 1.2: Confirm WA token names, then author the fantasy theme

**Files:**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Styles/WaTheme.css`

- [ ] **Step 1: Confirm the real token names (OQ-1 gate).** Run and read the output — do NOT trust the spec's draft list:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -oE '\-\-wa-color-[a-z0-9-]+' Source/Vendor/WebAwesome/styles/webawesome.css | sort -u | head -60
grep -oE '\-\-wa-(font|border-radius|space)-[a-z0-9-]+' Source/Vendor/WebAwesome/styles/webawesome.css | sort -u | head -40
```
Note the EXACT brand/surface/neutral/border-radius token names that exist. Use those names in Step 2 (adjust the draft below to match).

- [ ] **Step 2: Author `Source/Styles/WaTheme.css`.** Map the fantasy palette onto the confirmed `--wa-*` tokens, scoped to `.kingdom-theme`, and define the app's own palette vars + FA duotone defaults. Adjust token names to those found in Step 1:

```css
/* Kingdom theme — overrides Web Awesome design tokens with the flat-fantasy palette.
   Loads AFTER webawesome.css so these win. Scoped to html.kingdom-theme. */
.kingdom-theme {
  /* App palette (also consumed by hand-rolled CSS + FA icon tones) */
  --parchment:    #f4e8cf;
  --parchment-dk: #e8dcc0;
  --ink:          #3a3f44;
  --iron:         #6b7178;
  --gold:         #caa24a;
  --good:         #4f8a4f;
  --bad:          #b4543a;

  /* Map onto Web Awesome brand/surface tokens (NAMES PER STEP-1 GREP — adjust if different) */
  --wa-color-brand-fill-loud: var(--gold);
  --wa-color-brand-fill-quiet: var(--parchment-dk);
  --wa-color-brand-on-loud: var(--ink);
  --wa-color-surface-default: var(--parchment);
  --wa-color-surface-raised: #fbf3df;
  --wa-color-text-normal: var(--ink);
  --wa-color-text-quiet: var(--iron);
  --wa-color-success-fill-loud: var(--good);
  --wa-color-warning-fill-loud: var(--gold);
  --wa-color-danger-fill-loud: var(--bad);
  --wa-font-family-body: "Georgia", "Iowan Old Style", serif;
  --wa-border-radius-m: 6px;

  /* FA duotone two-tone defaults (overridable per icon) */
  --fa-primary-color: var(--ink);
  --fa-secondary-color: var(--gold);
  --fa-secondary-opacity: 0.45;
}
```

- [ ] **Step 3: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Styles/WaTheme.css
git commit -m "feat(ui): Web Awesome fantasy theme tokens (parchment/iron/gold)"
```

---

### Task 1.3: Wire the loader/CSS into Index.html + woff2 MIME

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Index.html`
- Modify: `/home/evilc/Projects/IdleKingdom/.htaccess`

- [ ] **Step 1: Add WA + FA links and the loader to `<head>` of `Index.html`.** Place BEFORE the existing app `<link>`s so `WaTheme.css` cascades last. Set the WA base path for the `/kingdom/` subpath:

```html
<!-- Web Awesome v3.7.0 (vendored, buildless) -->
<link rel="stylesheet" href="./Source/Vendor/WebAwesome/styles/webawesome.css" />
<script type="module" src="./Source/Vendor/WebAwesome/webawesome.loader.js"
        data-webawesome="/kingdom/Source/Vendor/WebAwesome/"></script>
<!-- Font Awesome Pro Duotone (vendored webfonts) -->
<link rel="stylesheet" href="./Source/Vendor/FontAwesome/css/fontawesome.css" />
<link rel="stylesheet" href="./Source/Vendor/FontAwesome/css/duotone.css" />
<!-- App theme override (cascades last) -->
<link rel="stylesheet" href="./Source/Styles/WaTheme.css" />
```

- [ ] **Step 2: Add the theme classes to the `<html>` tag** (keep `lang`):

```html
<html lang="en" class="wa-theme-default wa-palette-default kingdom-theme">
```

- [ ] **Step 3: Add the woff2 MIME type to `.htaccess`** (inside the existing `<IfModule mod_mime.c>` block, alongside the other `AddType` lines):

```
AddType font/woff2 .woff2
```

- [ ] **Step 4: Smoke-verify locally (no run-blocking server).** Confirm the referenced files resolve relative to the repo root:

```bash
cd /home/evilc/Projects/IdleKingdom
for f in Source/Vendor/WebAwesome/styles/webawesome.css Source/Vendor/WebAwesome/webawesome.loader.js \
         Source/Vendor/FontAwesome/css/fontawesome.css Source/Vendor/FontAwesome/css/duotone.css Source/Styles/WaTheme.css; do
  test -f "$f" && echo "ok $f" || echo "MISSING $f"
done
```
Expected: all "ok". (Real browser load is verified in Task 1.11 after deploy.)

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Index.html .htaccess
git commit -m "feat(ui): load vendored Web Awesome + FA Pro Duotone in Index.html (subpath base, woff2 MIME)"
```

---

### Task 1.4: Icon map module + tests

**Files:**
- Create: `/home/evilc/Projects/IdleKingdom/Source/UI/Icons.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/IconMap.Test.js`
- Modify: `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`

- [ ] **Step 1: Write the failing test.** Create `Tests/IconMap.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import { ICONS, icon, iconName } from "../Source/UI/Icons.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("Icons.map", () => {
  it("resolves every machine kind + currency to a non-empty FA name", () => {
    for (const c of ["gold","research","renown","gatherer","smelter","workshop","market","scholar"]) {
      expect(typeof ICONS[c].name).toBe("string");
      expect(ICONS[c].name.length > 0).toBe(true);
    }
  });
  it("maps every engine resource id to a real (non-fallback) icon", () => {
    for (const id of Object.keys(RESOURCES)) {
      const m = ICONS[id];
      expect(!!(m && m.name && m.name !== "circle-question")).toBe(true);
    }
  });
});

describe("Icons.icon()", () => {
  it("emits an <i> vnode with a fa-duotone class and no emoji", () => {
    const v = icon("gold");
    expect(v.tag).toBe("i");
    expect(v.props.class.includes("fa-duotone")).toBe(true);
    expect(v.props.class.includes("fa-gold") || v.props.class.includes("fa-coins")).toBe(true);
    expect(EMOJI.test(JSON.stringify(v))).toBe(false);
  });
  it("falls back to circle-question for unknown concepts (no throw)", () => {
    expect(icon("nonexistent").props.class.includes("fa-circle-question")).toBe(true);
  });
  it("iconName returns the raw FA name", () => {
    expect(iconName("market")).toBe(ICONS.market.name);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node Tests/RunAll.js IconMap` — Expected: FAIL (`Cannot find module ../Source/UI/Icons.js`).

- [ ] **Step 3: Write `Source/UI/Icons.js`.** Map every game concept + every resource id; provide `icon()` (vnode) and `iconName()` (string). (Verify each name exists in Duotone Solid at fontawesome.com before relying on it visually; the test only checks structure.)

```js
// Single source of truth: game concept -> FA Pro Duotone Solid icon + tone.
// Render via FA webfont <i> (NOT <wa-icon>, which needs a runtime CDN kit for Pro).
import { h } from "./Render/Dom.js";

export const ICONS = {
  // currencies
  gold:     { name: "coins",         primary: "var(--gold)",        secondary: "var(--ink)" },
  research: { name: "scroll",        primary: "var(--parchment-dk)", secondary: "var(--ink)" },
  renown:   { name: "shield-halved", primary: "var(--iron)",        secondary: "var(--gold)" },
  // machine kinds
  gatherer: { name: "pickaxe" }, smelter: { name: "fire", primary: "var(--bad)" },
  workshop: { name: "hammer" },  market:  { name: "shop", primary: "var(--gold)" },
  scholar:  { name: "book-open" },
  // gatherer cosmetic variants
  miner: { name: "pickaxe" }, forester: { name: "tree" }, trapper: { name: "paw" },
  // resources (engine resource ids)
  iron_ore: { name: "gem" }, timber: { name: "tree" }, hide: { name: "paw" },
  coal_raw: { name: "mountain" }, gemstone: { name: "gem", primary: "var(--gold)" },
  iron_bar: { name: "bars" }, plank: { name: "block-brick" }, leather: { name: "scroll-old" },
  coal: { name: "fire" }, parchment: { name: "scroll" }, steel: { name: "cubes" },
  blade: { name: "dagger" }, plating: { name: "shield" }, fitting: { name: "gear" },
  sword: { name: "sword" }, armor: { name: "shirt" }, shield: { name: "shield" },
  // tabs / actions / statuses
  factory: { name: "gears" }, expeditions: { name: "shield" }, heroes: { name: "chess-knight" },
  upgrade: { name: "circle-up" }, levelup: { name: "arrow-up-right-dots" },
  sell: { name: "coins" }, remove: { name: "trash" }, connect: { name: "link" },
  recruit: { name: "user-plus" }, launch: { name: "flag-checkered" }, settings: { name: "gear" },
  victory: { name: "crown", primary: "var(--gold)" }, offline: { name: "moon" },
  save_ok: { name: "floppy-disk" }, save_fail: { name: "triangle-exclamation", primary: "var(--bad)" },
  ready: { name: "circle-check", primary: "var(--good)" }, inprogress: { name: "hourglass-half" },
  locked: { name: "lock" }, max: { name: "gauge-high", primary: "var(--good)" },
  starved: { name: "triangle-exclamation", primary: "var(--bad)" }, info: { name: "circle-info" },
};

function styleFor(i) {
  const p = [];
  if (i.primary)            p.push(`--fa-primary-color:${i.primary}`);
  if (i.secondary)          p.push(`--fa-secondary-color:${i.secondary}`);
  if (i.secOpacity != null) p.push(`--fa-secondary-opacity:${i.secOpacity}`);
  return p.join(";");
}

export function icon(concept, extraClass = "") {
  const i = ICONS[concept] || { name: "circle-question" };
  const cls = `fa-duotone fa-solid fa-${i.name}${i.swap ? " fa-swap-opacity" : ""}${extraClass ? " " + extraClass : ""}`;
  const props = { class: cls, "aria-hidden": "true" };
  const s = styleFor(i);
  if (s) props.style = s;
  return h("i", props);
}

export function iconName(concept) {
  return (ICONS[concept] || { name: "circle-question" }).name;
}
```

- [ ] **Step 4: Register the suite + run, expect PASS.** Edit `Tests/RunAll.js`, append `import "./IconMap.Test.js";` after the existing imports. Run: `node Tests/RunAll.js IconMap` — Expected: all green.

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Icons.js Tests/IconMap.Test.js Tests/RunAll.js
git commit -m "feat(ui): FA Pro Duotone icon map (icon()/iconName()) + tests"
```

---

### Task 1.5: `h()`/`patch` extensions for Web Awesome (events + properties)

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/Render/Dom.js` (`applyProps`)
- Test: `/home/evilc/Projects/IdleKingdom/Tests/Dom.Test.js` (extend; upgrade `FakeEl` listener model)

- [ ] **Step 1: Upgrade the test shim to a faithful listener model + add failing tests.** In `Tests/Dom.Test.js`, change `FakeEl` so `addEventListener`/`removeEventListener` keep an **array per type** (today it stores one and overwrites, which can't prove no-stacking), add a property bag, and add a `dispatch(type, ev)` helper. Then add the new cases:

```js
// --- in FakeEl: replace the single-listener model ---
//   this._listeners = {};            // { type: [fn, ...] }
//   addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
//   removeEventListener(t, fn) { const a=this._listeners[t]; if(a){const i=a.indexOf(fn); if(i>=0)a.splice(i,1);} }
//   dispatch(t, ev) { (this._listeners[t]||[]).slice().forEach(fn => fn(ev)); }

describe("Dom.patch — Web Awesome extensions", () => {
  it("onWa* binds the kebab custom event; firing it calls the fn", () => {
    const root = new FakeEl("div");
    let got = null;
    patch(root, [h("wa-select", { key: "s", onWaChange: (e) => { got = e.detail; } })], fakeDoc);
    const sel = root.children[0];
    sel.dispatch("wa-change", { detail: "iron_bar" });
    expect(got).toBe("iron_bar");
  });
  it("onWa* listener does not stack across re-renders (remove-before-add)", () => {
    const root = new FakeEl("div");
    const fns = [() => {}, () => {}, () => {}];
    fns.forEach((fn) => patch(root, [h("wa-dialog", { key: "d", onWaHide: fn })], fakeDoc));
    const dlg = root.children[0];
    expect((dlg._listeners["wa-hide"] || []).length).toBe(1);
  });
  it("prop: assigns a DOM property, not an attribute", () => {
    const root = new FakeEl("div");
    patch(root, [h("wa-select", { key: "s", "prop:value": "steel" })], fakeDoc);
    const sel = root.children[0];
    expect(sel.value).toBe("steel");
    expect("value" in sel.attributes).toBe(false);
  });
  it("boolean attributes still render as empty attrs", () => {
    const root = new FakeEl("div");
    patch(root, [h("wa-button", { key: "b", disabled: true })], fakeDoc);
    expect(root.children[0].attributes.disabled).toBe("");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node Tests/RunAll.js Dom` — Expected: the four new cases FAIL (onWa*/prop: unsupported; FakeEl needs the array model — apply the shim change in Step 1 first so the failures are behavioral, not shim errors).

- [ ] **Step 3: Extend `applyProps` in `Source/UI/Render/Dom.js`.** Add the helpers above the function and the two branches inside it (in BOTH the removal loop and the set loop), ahead of the existing `on*` branch:

```js
function waEventName(propKey) {
  return propKey.slice(2)
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
const isWaListenerProp = (k) => /^onWa[A-Z]/.test(k);

// ---- in applyProps, REMOVAL loop (for k in oldProps not in newProps), first: ----
if (isWaListenerProp(k)) {
  if (!(k in newProps)) {
    const reg = el.__waEvents && el.__waEvents[k];
    if (reg) { el.removeEventListener(reg.name, reg.fn); delete el.__waEvents[k]; }
  }
  continue;
}
if (k.startsWith("prop:")) {
  if (!(k in newProps)) { try { el[k.slice(5)] = undefined; } catch {} }
  continue;
}

// ---- in applyProps, SET loop (for k in newProps), ahead of the on* branch: ----
if (isWaListenerProp(k)) {
  if (typeof v === "function") {
    el.__waEvents = el.__waEvents || {};
    const prev = el.__waEvents[k];
    if (!prev || prev.fn !== v) {
      if (prev) el.removeEventListener(prev.name, prev.fn);
      const name = waEventName(k);
      el.addEventListener(name, v);
      el.__waEvents[k] = { name, fn: v };
    }
  }
  continue;
}
if (k.startsWith("prop:")) {
  const name = k.slice(5);
  if (el[name] !== v) el[name] = v;
  continue;
}
```

- [ ] **Step 4: Run it, expect PASS.** Run: `node Tests/RunAll.js Dom` — Expected: all Dom cases green (existing + 4 new).

- [ ] **Step 5: Run the FULL suite to confirm no regression.** Run: `node Tests/RunAll.js` — Expected: `0 failed` (256 + new).

- [ ] **Step 6: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Render/Dom.js Tests/Dom.Test.js
git commit -m "feat(ui): patch() supports Web Awesome onWa* events + prop: properties (inert until used)"
```

---

### Task 1.6: De-emoji `fmtCost`

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/UI/Format/Format.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/FormatHelpers.Test.js`

- [ ] **Step 1: Add a failing test** to `Tests/FormatHelpers.Test.js`:

```js
describe("Format.fmtCost — no embedded emoji (B2)", () => {
  const EMOJI = /\p{Extended_Pictographic}/u;
  it("returns a text-only cost with no currency emoji glyph", () => {
    expect(EMOJI.test(fmtCost(9, "research"))).toBe(false);
    expect(EMOJI.test(fmtCost(30, "renown"))).toBe(false);
    expect(fmtCost(15, "gold")).toBe("15");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node Tests/RunAll.js FormatHelpers` — Expected: FAIL (current `fmtCost` returns `"15 🪙"`).

- [ ] **Step 3: Make `fmtCost` text-only** in `Source/UI/Format/Format.js`. Remove the `CURRENCY_GLYPH` use; return just the formatted number string:

```js
export function fmtCost(amount /*, currency */) {
  return fmtNum(amount);
}
```
(Leave `CURRENCY_GLYPH` removed/unused; call-sites get the icon via `icon(currency)` in Task 1.7.)

- [ ] **Step 4: Run it, expect PASS.** Run: `node Tests/RunAll.js FormatHelpers` — Expected: green.

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Format/Format.js Tests/FormatHelpers.Test.js
git commit -m "fix(ui): fmtCost returns text-only (currency icon now a sibling vnode)"
```

---

### Task 1.7: Replace emoji with `icon()` in the HTML panels

**Files:**
- Modify: `Source/UI/Hud.js`, `Source/UI/ExpeditionBoard.js`, `Source/UI/OfflineSummary.js`, `Source/UI/BuildMenu.js`, `Source/UI/NodeInspector.js`, `Source/UI/HeroPanel.js`

- [ ] **Step 1: Inventory the emoji.** Run to see every emoji literal you must replace:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -rnoP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' Source/UI --include=*.js | grep -v Icons.js
```

- [ ] **Step 2: Replace each emoji with an `icon()` vnode.** In each file, `import { icon } from "./Icons.js";` and swap the emoji string for an `icon(<concept>)` child. Examples:
  - `Hud.js`: currency cells use `icon("gold")`/`icon("research")`/`icon("renown")` instead of `🪙/📜/🛡️`; save badge `icon(saveOk ? "save_ok" : "save_fail")` instead of `💾/⚠`; tab labels prepend `icon("factory"|"research"|"expeditions"|"heroes")`.
  - `BuildMenu.js`: replace `${res.icon}` / kind emoji with `icon(res.id)` / `icon(kind)`.
  - `NodeInspector.js`: kind icon `icon(node.kind)`; Upgrade button label = `[icon("gold"), " " + fmtCost(node.upgradeCost)]`; Sell button `icon("sell")`.
  - `HeroPanel.js`: Level-Up label = `[icon("renown"), " " + fmtCost(cost)]`; Recruit `icon("recruit")`; equip option icons `icon(itemId)`.
  - `ExpeditionBoard.js`: reward chips `icon("gold")/icon("research")/icon("renown")`; status/launch icons (`icon("launch")`, `icon("ready")`, `icon("locked")`).
  - `OfflineSummary.js`: gained chips use the currency icons.
  (Where a label is currently a plain string with an emoji, change it to an array of children `[icon(...), " text"]` — `h()` flattens arrays.)

- [ ] **Step 3: Verify no panel emoji remain + suite green.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v -e Icons.js -e GraphView.js && echo "EMOJI REMAIN" || echo "clean (panels)"
node Tests/RunAll.js | tail -1
```
Expected: "clean (panels)" (GraphView handled in 1.8) and `0 failed`.

- [ ] **Step 4: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/Hud.js Source/UI/ExpeditionBoard.js Source/UI/OfflineSummary.js Source/UI/BuildMenu.js Source/UI/NodeInspector.js Source/UI/HeroPanel.js
git commit -m "feat(ui): replace panel emoji with FA Pro Duotone icons"
```

---

### Task 1.8: Duotone node icons inside the SVG canvas (`<foreignObject>`)

**Files:**
- Modify: `Source/UI/GraphView.js`, `Source/Styles/Graph.css`

- [ ] **Step 1: Read how nodes render.** Open `Source/UI/GraphView.js`; find where a node card draws its kind glyph (currently an emoji in an SVG `<text>`) and the `_replace()`/teardown that clears the SVG on re-render.

- [ ] **Step 2: Render the icon via `<foreignObject>`.** Replace the emoji `<text>` with a `<foreignObject>` sized to the icon box, containing an `<i class="fa-duotone fa-solid fa-<name>">` (use `iconName(node.kind)` or the gatherer-variant/resource concept). Build it with the existing SVG helper (`svg()` from `Render/Svg.js`) for the `<foreignObject>` and a raw `<i>` inside via the DOM helper. Concretely, inside the node-draw code:

```js
import { iconName } from "./Icons.js";
// ...
const ic = iconName(n.kind);               // machine-kind concept
const fo = svg("foreignObject", { x: cx - 12, y: cy - 12, width: 24, height: 24, class: "node-ico" });
const i  = document.createElement("i");
i.className = `fa-duotone fa-solid fa-${ic}`;
i.setAttribute("aria-hidden", "true");
fo.appendChild(i);
group.appendChild(fo);                      // group is the node's <g>
```
(If `GraphView` builds via the `h()`/`patch` SVG path rather than imperative `svg()`, emit `h("foreignObject", {x,y,width:24,height:24,class:"node-ico"}, h("i", {class:`fa-duotone fa-solid fa-${ic}`, "aria-hidden":"true"}))` instead — match the file's existing pattern.)

- [ ] **Step 3: Ensure teardown removes foreignObject subtrees.** Confirm the `_replace()`/clear path empties the node `<g>` (it already removes children, which includes the `<foreignObject>` + its `<i>`). If it clears via `innerHTML = ""` or removing child nodes, foreignObject is handled. Add a CSS rule in `Graph.css` so the icon sizes/centres and scales with zoom:

```css
.node-ico { overflow: visible; }
.node-ico i { font-size: 20px; line-height: 24px; display: block; text-align: center;
  --fa-primary-color: var(--ink); --fa-secondary-color: var(--gold); --fa-secondary-opacity: .45; }
```

- [ ] **Step 4: Verify no emoji remain anywhere in `Source/UI`.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v Icons.js && echo "EMOJI REMAIN" || echo "clean (all UI)"
node --check Source/UI/GraphView.js && echo "syntax ok"
```
Expected: "clean (all UI)" and "syntax ok". (Visual scaling/crispness under zoom is verified in the browser pass, Task 1.11; monochrome-glyph fallback only if a real issue surfaces.)

- [ ] **Step 5: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/UI/GraphView.js Source/Styles/Graph.css
git commit -m "feat(ui): Duotone node icons in the SVG canvas via foreignObject"
```

---

### Task 1.9: `user-select:none` on UI chrome

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/Source/Styles/Reset.css`

- [ ] **Step 1: Add the rules** to `Reset.css`:

```css
.hud, .factory-panels, .panel-host, .overlay-layer, .build-menu, .node-inspector,
.hero-panel, .research-tree, .expedition-board, .tooltip, .modal,
wa-button, wa-tab, wa-tab-group, wa-card, wa-callout, wa-badge, wa-tag {
  user-select: none;
  -webkit-user-select: none;
}
wa-input, wa-select, .modal-text, .victory-text { user-select: text; }
```

- [ ] **Step 2: Commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
git add Source/Styles/Reset.css
git commit -m "fix(ui): disable text selection on UI chrome (clicks no longer highlight)"
```

---

### Task 1.10: Service worker cache v4 + vendored assets in SHELL

**Files:**
- Modify: `/home/evilc/Projects/IdleKingdom/ServiceWorker.js`

- [ ] **Step 1: Bump cache + precache the vendored assets that must work offline.** Change `CACHE` to `"idlekingdom-v4"` and add the Vendor entries to `SHELL` (the woff2 MUST be precached or offline reload shows boxes):

```js
const CACHE = "idlekingdom-v4";
const SHELL = [
  "./", "./Index.html", "./Manifest.webmanifest",
  "./Source/Main.js",
  "./Source/Styles/Reset.css", "./Source/Styles/Theme.css",
  "./Source/Styles/WaTheme.css", "./Source/Styles/Layout.css", "./Source/Styles/Graph.css",
  "./Source/Vendor/WebAwesome/webawesome.loader.js",
  "./Source/Vendor/WebAwesome/styles/webawesome.css",
  "./Source/Vendor/FontAwesome/css/fontawesome.css",
  "./Source/Vendor/FontAwesome/css/duotone.css",
  "./Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2",
];
```
(Keep the existing install/activate/fetch handlers unchanged.)

- [ ] **Step 2: Syntax check + commit.**

```bash
cd /home/evilc/Projects/IdleKingdom
node --check ServiceWorker.js && echo "ok"
git add ServiceWorker.js
git commit -m "chore(pwa): SW cache v4 + precache vendored WA/FA shell assets"
```

---

### Task 1.11: Full-suite gate, deploy, and browser acceptance

**Files:** (none — verification + deploy)

- [ ] **Step 1: Full suite + emoji gate.** Run:

```bash
cd /home/evilc/Projects/IdleKingdom
node Tests/RunAll.js | tail -1
grep -rlP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' Source/UI --include=*.js | grep -v Icons.js && echo "EMOJI REMAIN — fix before deploy" || echo "UI emoji-free"
```
Expected: `0 failed` and "UI emoji-free".

- [ ] **Step 2: Deploy.** rsync to the dev server (Vendor/ is under Source/ so it ships; the `--delete` keeps it clean). Password from `memory/secrets.md` → Home Server:

```bash
cd /home/evilc/Projects/IdleKingdom
SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
  --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' --exclude='package.json' --exclude='.gitignore' --exclude='.npmrc' --exclude='.omc/' \
  -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
  ./ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
```

- [ ] **Step 3: Verify assets serve.** Run:

```bash
for u in Source/Vendor/WebAwesome/webawesome.loader.js Source/Vendor/WebAwesome/styles/webawesome.css \
         Source/Vendor/FontAwesome/css/duotone.css Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2 \
         Source/Styles/WaTheme.css; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://dev.jdayers.com/kingdom/$u"
done
```
Expected: all `200`; the woff2 served as `font/woff2`.

- [ ] **Step 4: HUMAN browser acceptance** (the only real visual check). Hard-reload `https://dev.jdayers.com/kingdom/` (twice, or Ctrl+Shift+R, for the SW v4 swap) and confirm:
  - No console errors; no Vendor 404s; no FA "missing-glyph" boxes.
  - Duotone icons render with the two-tone parchment/gold/ink palette (HUD currencies, tabs, build menu, node-inspector, expedition rewards, hero panel, and the **machine icons inside the factory canvas nodes**).
  - Theme tokens applied (WA component defaults pick up the fantasy palette — visible once P2 adds components; for now confirm `getComputedStyle(document.documentElement).getPropertyValue('--gold')` is set).
  - Clicking buttons/labels no longer highlights/selects text.
  - Offline test: DevTools → Network → Offline → reload — icons still render (proves the woff2 + WA shell are precached).
  - Canvas node icons stay crisp and correctly placed when you pan/zoom (foreignObject scaling). If they don't, note it — the monochrome-glyph fallback (spec §4) is the contingency.

- [ ] **Step 5: Tag + finalize.** If acceptance passes:

```bash
cd /home/evilc/Projects/IdleKingdom
git tag -f ui-p1-foundation
git push origin main && git push -f origin ui-p1-foundation
```

---

## Notes for the executor
- **Token safety:** the only place the FA token appears is the gitignored `.npmrc`. Verify it is never staged (Task 1.1 Step 6 guards this).
- **No component swaps this phase:** native HTML buttons/tabs stay; the WA *loader/theme* is in place and the `Dom.js` extensions are inert until P2. This keeps P1 low-risk and independently shippable.
- **OQ-1:** never author `WaTheme.css` from the spec's draft token names — grep the vendored CSS first (Task 1.2 Step 1).
- **Browser-only items** (real WA component behavior) arrive in P2+; P1's browser pass is limited to icons/theme/fonts/user-select.
