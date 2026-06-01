---
name: idlekingdom-ui-replatform
date: 2026-06-01
status: draft
repo: evilchinesefood/IdleKingdom
---

# IdleKingdom UI Re-platform — Design Spec

> Re-platform all non-canvas UI onto **Web Awesome** web components with **Font Awesome Pro Duotone** icons, buildless + vendored, keeping the `h()`/`patch` reconciler and the bespoke SVG factory canvas. Synthesized from a researched (cited) multi-agent design pass with an adversarial feasibility critique applied.

## 1. Overview & Goals

IdleKingdom is a buildless, vanilla-JS idle/automation game (live at `dev.jdayers.com/kingdom`, repo `/home/evilc/Projects/IdleKingdom`, branch `main`). Today its non-canvas UI is rendered by a hand-rolled `h()`/`patch()` reconciler (`Source/UI/Render/Dom.js`) over a set of panels, reading from `Snapshot.build` (`Source/Engine/Snapshot.js`) and dispatching intents. This spec defines a full re-platform of all non-canvas UI onto **Web Awesome v3.7.0** web components, with **Font Awesome Pro Duotone** iconography, delivered **buildless and vendored** (no bundler, no runtime CDN).

**Goals (four focus areas):**

1. **Factory graph readability** — node cards gain MAX/starved cues; link labels become click-to-reveal instead of always-on clutter.
2. **Visual polish / theme** — the existing flat-fantasy parchment/iron/gold palette is re-expressed through Web Awesome design tokens, gaining consistent component styling.
3. **Layout / screen real-estate** — HUD, tabs, and panels are rebuilt on WA layout primitives for better space usage.
4. **Clarity (knowing what to do)** — duotone icons everywhere, MAX/starved legends, onboarding tooltips as `wa-callout`, clear status badges.

**Locked invariants (design strictly to these):**

- The bespoke SVG factory **canvas** (`GraphView`/`GraphInput`) stays hand-rolled. Its surrounding chrome and the node-card/link presentation are in scope.
- Icons use the **FA Pro Duotone** family throughout via FA's own webfont `<i>` markup — replacing all emoji. (`<wa-icon>` is deliberately NOT used for duotone; rationale in §4.)
- The `h()`/`patch()` reconciler is **kept and extended** (never rewritten) to emit WA custom elements.
- Delivery is **buildless + vendored** under `Source/Vendor/`, deployed via rsync. No runtime CDN.
- The engine stays **headless and unit-tested**; the UI only reads snapshots and dispatches intents.
- Render cadence is **locked**: render on intents + expedition-resolve + a 2s HUD-only interval. No phase reintroduces per-frame rendering.

All component tags, attributes, events, token names, and FA markup below are drawn from the confirmed research (Web Awesome v3.7.0 docs; FA Pro Duotone docs) and verified against the live codebase. Version-sensitive items are flagged inline with their doc URLs.

---

## 2. Stack & Delivery (vendored, buildless)

### Target layout under `Source/Vendor/`

```
Source/Vendor/
  WebAwesome/                 <- copied from @awesome.me/webawesome dist-cdn/ (NOT dist/)
    webawesome.loader.js
    webawesome.js             <- exports setBasePath/getBasePath, registerIconLibrary
    styles/webawesome.css
    components/ ...            <- on-demand component modules the loader fetches
  FontAwesome/                <- copied from @fortawesome/fontawesome-pro
    css/
      fontawesome.css         <- REQUIRED core engine
      duotone.css             <- Duotone Solid (the default duotone weight)
    webfonts/                 <- MUST be a sibling of css/ (CSS uses ../webfonts/ url())
      fa-duotone-900.woff2
      fa-duotone-900.ttf
```

Rationale (per research):

- Use **`dist-cdn/`**, not `dist/` — `dist-cdn` is pre-bundled for direct browser use; `dist` keeps deps split for bundlers and breaks buildless loading. ([WA install docs](https://webawesome.com/docs))
- Keep FA `css/` and `webfonts/` as **siblings**. FA's `@font-face` rules reference `url(../webfonts/...)`; siblings + `<link>`-in-place means fonts resolve correctly under `/kingdom/` with zero path rewriting. Do not inline/relocate the FA CSS. ([FA host-yourself](https://docs.fontawesome.com/web/setup/host-yourself/webfonts))
- Vendor only what we use: ship `fontawesome.css` + `duotone.css` only (skip `all.css` — research confirms `all.css` omits Duotone Solid). Prune unused webfont weights after the icon map is finalized.

### One-time install + copy (local, token never committed)

Create a `.gitignore`d `.npmrc` (and a committed `Source/Vendor/.npmrc.example` documenting it). Both scope lines are required — Web Awesome's package lives on the same registry as FA Pro:

```
@fortawesome:registry=https://npm.fontawesome.com/
@awesome.me:registry=https://npm.fontawesome.com/
//npm.fontawesome.com/:_authToken=<FA_PACKAGE_TOKEN>
```

From a scratch dir **outside** the repo (e.g. `/home/evilc/python/idlekingdom-vendor/`):

```bash
npm install @awesome.me/webawesome@3.7.0 @fortawesome/fontawesome-pro
cp -R node_modules/@awesome.me/webawesome/dist-cdn \
      /home/evilc/Projects/IdleKingdom/Source/Vendor/WebAwesome
mkdir -p /home/evilc/Projects/IdleKingdom/Source/Vendor/FontAwesome
cp -R node_modules/@fortawesome/fontawesome-pro/css \
      node_modules/@fortawesome/fontawesome-pro/webfonts \
      /home/evilc/Projects/IdleKingdom/Source/Vendor/FontAwesome/
```

**Verify after copy:** `Source/Vendor/WebAwesome/webawesome.loader.js` and `Source/Vendor/FontAwesome/css/duotone.css` both exist. Research flags [GH Discussion #2146](https://github.com/shoelace-style/webawesome/discussions/2146) — some older ZIP downloads lacked `dist-cdn/`; confirm it is present in the npm tarball.

### `Index.html` additions (relative, subpath-safe for `/kingdom/`)

Add to `<head>`, ordering FA + WA CSS **before** the app's own CSS so the kingdom theme (which overrides `--wa-*` tokens) cascades last:

```html
<!-- Web Awesome v3.7.0 (vendored, buildless) -->
<link rel="stylesheet" href="./Source/Vendor/WebAwesome/styles/webawesome.css" />
<script
  type="module"
  src="./Source/Vendor/WebAwesome/webawesome.loader.js"
  data-webawesome="/kingdom/Source/Vendor/WebAwesome/"
></script>

<!-- Font Awesome Pro Duotone (vendored webfonts) -->
<link rel="stylesheet" href="./Source/Vendor/FontAwesome/css/fontawesome.css" />
<link rel="stylesheet" href="./Source/Vendor/FontAwesome/css/duotone.css" />

<!-- App styles (theme overrides cascade last) -->
<link rel="stylesheet" href="./Source/Styles/Reset.css" />
<link rel="stylesheet" href="./Source/Styles/Theme.css" />
<link rel="stylesheet" href="./Source/Styles/WaTheme.css" />   <!-- NEW: WA token overrides -->
<link rel="stylesheet" href="./Source/Styles/Layout.css" />
<link rel="stylesheet" href="./Source/Styles/Graph.css" />
```

And set the theme class stack on `<html>`:

```html
<html lang="en" class="wa-theme-default wa-palette-default kingdom-theme">
```

**Subpath base path:** `data-webawesome="/kingdom/Source/Vendor/WebAwesome/"` sets WA's base path explicitly so component asset fetches resolve under the subpath rather than trusting auto-detection. The programmatic equivalent is `setBasePath('/kingdom/Source/Vendor/WebAwesome/')` from `webawesome.js`. We do **NOT** set `data-fa-kit-code` and do **NOT** use `<wa-icon family="duotone">` (that path fetches SVGs from FA's CDN, violating the no-runtime-CDN rule; see §4).

### Service worker & deploy

The SW (`ServiceWorker.js`, `CACHE = "idlekingdom-v3"`) is **cache-first**: `caches.match() || fetch()`. An uncached file is fetched once but **not stored**, so any Vendor asset that must work offline **must be listed in `SHELL`**. Per deploy that touches assets:

- Bump `CACHE` (`-v3` → `-v4` → … per phase) so the activate handler purges old caches and re-precaches.
- Add to `SHELL`: `webawesome.loader.js`, `styles/webawesome.css`, `fontawesome.css`, `duotone.css`, and the **Duotone woff2** (`fa-duotone-900.woff2`). The woff2 must be precached or offline reload renders boxes.
- Ensure the rsync include list covers `Source/Vendor/**` (both `WebAwesome/` and `FontAwesome/webfonts/` — the woff2 files are easy to miss).

`.htaccess` (P1): add `AddType font/woff2 .woff2` so woff2 isn't served as `text/plain` (missing MIME → boxes). `.gitignore`: add `Source/Vendor/.npmrc`. The existing `DirectoryIndex Index.html` and JS/mjs/svg/webmanifest MIME rules are unchanged.

---

## 3. Theme & Design Tokens (fantasy palette via Web Awesome)

New file `Source/Styles/WaTheme.css`, scoped to the `.kingdom-theme` class on `<html>`. Keep `wa-theme-default` as the base; override the semantic `--wa-*` custom properties to re-point at the existing palette variables in `Theme.css` (which stays the single source of truth for the raw `--parchment`/`--iron`/`--gold` values). WA tokens are ordinary CSS custom properties and cascade, so children inherit. ([WA tokens](https://webawesome.com/docs/tokens), [WA themes](https://webawesome.com/docs/themes))

```css
/* Source/Styles/WaTheme.css
   Parchment/iron/gold kingdom theme: override Web Awesome v3.7.0 design tokens.
   DRAFT token names — confirm against vendored webawesome.css after install (see Open Question OQ-1). */
.kingdom-theme {
  /* Brand (gold) */
  --wa-color-brand-fill-normal: var(--gold);
  --wa-color-brand-fill-loud: var(--gold-lt);
  --wa-color-brand-border-normal: var(--gold);
  --wa-color-brand-on-normal: var(--ink);
  --wa-color-brand-on-loud: var(--ink);

  /* Surfaces (parchment) */
  --wa-color-surface-default: var(--panel);
  --wa-color-surface-lowered: var(--parchment);
  --wa-color-surface-raised: var(--parchment-dk);

  /* Focus ring (gold) */
  --wa-color-focus: var(--gold);

  /* Success / danger -> existing good/bad */
  --wa-color-success-fill-normal: var(--good);
  --wa-color-success-on-normal: var(--parchment);
  --wa-color-danger-fill-normal: var(--bad);
  --wa-color-danger-on-normal: #fff;

  /* Neutral scale anchored to iron/ink */
  --wa-color-neutral-05: var(--parchment);
  --wa-color-neutral-30: var(--line);
  --wa-color-neutral-60: var(--iron-lt);
  --wa-color-neutral-90: var(--iron);
  --wa-color-neutral-95: var(--ink);

  /* Form controls */
  --wa-form-control-border-color: var(--line);
  --wa-form-control-label-color: var(--ink-soft);

  /* Typography: reuse the serif fantasy stack */
  --wa-font-family-body: var(--font);
  --wa-font-family-heading: var(--font);

  /* Borders / radius */
  --wa-border-width-s: 1px;
  --wa-border-radius-m: var(--radius);

  /* FA duotone two-tone defaults (per-icon overridable) */
  --fa-primary-color: var(--ink);
  --fa-secondary-color: var(--gold);
  --fa-secondary-opacity: 0.45;
}
```

**Version-sensitivity (carry forward as a process gate):** the exact numeric neutral-scale slots (`-05` … `-95`) and a few semantic names (`*-fill-loud`, `*-surface-raised`, `--wa-border-radius-m`) are the most version-sensitive items. The research confirms the `--wa-color-*` / `--wa-font-*` / `--wa-border-*` namespaces and the brand/surface/neutral/focus/form-control patterns, but exact slot rosters iterate across the 3.x line. **Sequence P1 so the package is pulled FIRST, then `grep --wa-color- Source/Vendor/WebAwesome/styles/webawesome.css` to confirm precise names, THEN author `WaTheme.css`.** Treat the token list above as a draft, not ready-to-write. `WaTheme.css` is the single tuning point if a name differs. ([WA tokens](https://webawesome.com/docs/tokens))

---

## 4. Icon System (FA Pro Duotone) + icon map

### Why FA webfont `<i>`, not `<wa-icon>`

`<wa-icon>` renders SVG icons; its default library bundles only FA **Free**. Pro families (duotone, sharp, sharp-duotone) unlock in `<wa-icon>` **only via a kit code** (`setKitCode`/`data-fa-kit-code`), which fetches SVGs from FA's CDN at runtime — violating the no-runtime-CDN rule. Self-hosting Pro Duotone through `registerIconLibrary()` is **not supported** by Web Awesome today ([GH Discussion #1621](https://github.com/shoelace-style/webawesome/discussions/1621)). FA's own **webfont** path (`<i class="fa-duotone fa-solid fa-…">`) is the only truly offline/vendored duotone option, and the `h()`/`patch` reconciler emits `<i>` trivially. So: use `<wa-*>` for buttons/tabs/dialogs/etc.; use plain `<i>` for iconography (placed into WA `start`/`end` **slots** where a component wants an icon, never the `wa-icon` `name` attr). ([FA duotone](https://docs.fontawesome.com/web/style/duotone), [WA icon](https://webawesome.com/docs/components/icon/))

### Duotone markup + tone control

Markup: `<i class="fa-duotone fa-solid fa-camera"></i>`. Two-tone control via CSS custom properties set on the element (they do not inherit reliably onto icon elements, so apply directly or via the `.kingdom-theme` defaults in §3):

| Property | Default | Range |
|---|---|---|
| `--fa-primary-color` | `currentColor` | any CSS color |
| `--fa-secondary-color` | `currentColor` | any CSS color |
| `--fa-primary-opacity` | `1.0` | 0–1.0 |
| `--fa-secondary-opacity` | `0.4` | 0–1.0 |

`fa-swap-opacity` flips which layer is the 40% layer. Names are kebab-case. **Verify each name exists in Duotone Solid specifically** at `fontawesome.com/icons` (filter Style = Duotone) before finalizing — not every icon ships in every weight.

### Icon map module — `Source/UI/Icons.js`

A single source of truth: game concept → FA Duotone name + tone, plus render helpers. Two render paths are required because the factory node cards are hand-rolled **SVG** (`GraphView` draws machine icons inside the SVG canvas), and HTML `<i>` webfont icons cannot render inside SVG `<text>`:

1. `icon(concept, extraClass)` → an `h("i", …)` vnode for all HTML chrome (HUD, tabs, buttons, cards, panels).
2. `iconName(concept)` → the raw FA name string, for the SVG node-card path (P3) and any future WA component that takes a name.

```js
// game concept -> { name, primary?, secondary?, secOpacity?, swap? }
// names are FA Pro Duotone Solid (fa-duotone fa-solid fa-<name>); verify in the gallery.
import { h } from "./Render/Dom.js";

export const ICONS = {
  // currencies
  gold:     { name: "coins",         primary: "var(--gold)", secondary: "var(--ink)" },
  research: { name: "scroll",        primary: "var(--parchment-dk)", secondary: "var(--ink)" },
  renown:   { name: "shield-halved", primary: "var(--iron)", secondary: "var(--gold)" },
  // machines
  gatherer: { name: "pickaxe" }, smelter: { name: "fire", primary: "var(--bad)" },
  workshop: { name: "hammer" },  market:  { name: "shop", primary: "var(--gold)" },
  scholar:  { name: "book-open" },
  // ...resources, equipment, tabs, actions, statuses, MAX/starved (full table below)
};

const styleFor = (i) => {
  const p = [];
  if (i.primary)            p.push(`--fa-primary-color:${i.primary}`);
  if (i.secondary)          p.push(`--fa-secondary-color:${i.secondary}`);
  if (i.secOpacity != null) p.push(`--fa-secondary-opacity:${i.secOpacity}`);
  return p.join(";");
};

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

The engine field `RESOURCES[x].icon` (an emoji) is **left intact** (engine stays headless/tested); the UI maps `resource.id → icon(<id>)` via `ICONS`, ignoring the emoji string.

### Icon map table (game concept → Duotone Solid name → tone)

Where two candidates appear, the one after `→` is the recommended pick; the first is the fallback if not in Duotone Solid.

**Currencies:** gold → `coins` (gold/ink); research → `scroll` (parchment-dk/ink); renown → `shield-halved` (iron/gold).

**Machine kinds (replaces `KIND_ICON`):** gatherer → `pickaxe` (was ⛏️); smelter → `fire` (was 🔥); workshop → `hammer` (was 🔨); market → `shop` (was 🏪); scholar → `book-open` (was 📜). Gatherer cosmetic variants: miner → `pickaxe`, forester → `tree`, trapper → `paw`.

**Resources** (UI maps resource id → name): iron_ore → `gem`/`pickaxe`; timber → `tree`; hide → `paw`; coal_raw → `mountain`; gemstone → `gem`; iron_bar → `bars`; plank → `block-brick`; leather → `scroll-old`; coal → `fire`; parchment → `scroll`; steel → `cubes`; blade → `dagger`; plating → `shield`; fitting → `gear`. Equipment: sword → `sword`; armor → `shirt`; shield → `shield`.

**Tabs / panels / actions / statuses:**

| Concept | FA name | Replaces |
|---|---|---|
| tab: factory | `gears` | ⚒ |
| tab: research | `flask` | 📜 |
| tab: expeditions | `shield` (or `flag`) | 🛡 |
| tab: heroes | `chess-knight` (or `helmet-battle`) | ⚔ |
| upgrade | `circle-up` | — |
| level-up | `arrow-up-right-dots` | — |
| sell | `coins` (or `sack-dollar`) | "Sell" |
| remove / delete | `trash` (or `xmark`) | ✕ |
| connect / link | `link` | — |
| recruit | `user-plus` | — |
| launch | `flag-checkered` | — |
| settings | `gear` | — |
| victory | `crown` | — |
| offline summary | `moon` | — |
| save ok | `floppy-disk` | 💾 |
| save failed | `triangle-exclamation` | ⚠ |
| status: ready / reclaimed | `circle-check` | ✓ |
| status: in progress | `hourglass-half` | — |
| status: locked | `lock` | — |
| MAX (at level capacity) | `gauge-high` | (P3) |
| starved / input-limited | `triangle-exclamation` | (P3) |

### `fmtCost` emoji — must be de-emoji'd in P1 (BLOCKER fix)

`Source/UI/Format/Format.js` defines `CURRENCY_GLYPH = { gold:"🪙", research:"📜", renown:"🛡️" }` and `fmtCost()` returns a string with the emoji baked in (e.g. `"<n> 🪙"`). It is consumed as a **string** by `NodeInspector` (`Upgrade → ${fmtCost(...)}`) and `HeroPanel` (`Level Up → …`, `Recruit → …`). Because the glyph is inside a returned string (not a vnode), it cannot be swapped by `icon()` the way HUD/ExpeditionBoard emoji are — and the P1 acceptance grep gate would fail on it. **Fix (mandatory in P1):** change `fmtCost` to return text-only (e.g. `"<n> gold"` or just the number) and have call-sites prepend `icon("gold")` / `icon("research")` / `icon("renown")` as a sibling vnode in the button label. Do not exempt `Format/Format.js` from the gate.

### SVG node-card icon — Open Question (P3 decision)

`GraphView` draws machine icons inside the SVG canvas. FA duotone's two-layer rendering uses CSS `::before`/`::after` and **cannot render in a single SVG `<text>`**. The icon map supplies `iconName()` so the name is available now; the rendering technique is an **Open Question** resolved in P3 (see OQ-2): either (a) a `<foreignObject>` holding an `<i class="fa-duotone …">` (full duotone, but re-introduces HTML layout inside the hand-rolled SVG that the `_replace()` teardown must handle), or (b) a monochrome single-layer glyph via `font-family:"Font Awesome 6 Duotone"` + codepoint in SVG `<text>` (no duotone). Stop treating this as decided.

---

## 5. Render-Layer Extensions (h()/patch for Web Awesome)

The reconciler is extended, never rewritten. `patch()`, `create`, `flat`, and the SVG `svg()` factory are **untouched** — custom elements are ordinary `Element`s, and the recent childNodes/text reconciliation is fully compatible (WA components render into shadow DOM, which is invisible to `childNodes`, so the light-DOM children the reconciler manages never desync). All changes are additive edits to `applyProps()` in `Source/UI/Render/Dom.js`, so un-migrated panels render identically and each phase's rollback story holds.

Today `applyProps` handles: `key` → `data-key`; `on*` → lowercased DOM handler property (`el.onclick = fn`); `text` → `textContent`; everything else → `setAttribute`/`removeAttribute` with boolean coercion (`true`→`""`, `false`/`null`→remove); props cached on `el.__props`.

### A1. Custom event listeners — `onWa*` convention

`el.onwa-show = fn` does nothing (no such IDL handler; the hyphen is invalid). Standard events (`change`, `input`, `focus`, `blur` — which WA form controls **do** fire, unprefixed) keep the existing `on*` → DOM-property path. Only **`wa-`-prefixed** lifecycle events get an `addEventListener` path, keyed off a camelCase prop convention: `onWaChange` → `wa-change`, `onWaAfterHide` → `wa-after-hide`, `onWaTabShow` → `wa-tab-show`.

```js
function waEventName(propKey) {
  const body = propKey.slice(2);                       // "WaChange"
  return body
    .replace(/^./, (c) => c.toLowerCase())             // "waChange"
    .replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());  // "wa-change"
}
const isWaListenerProp = (k) => /^onWa[A-Z]/.test(k);
```

In `applyProps`, ahead of the existing `on*` branch:

```js
// removal loop:
if (isWaListenerProp(k) && !(k in newProps)) {
  const reg = el.__waEvents && el.__waEvents[k];
  if (reg) { el.removeEventListener(reg.name, reg.fn); delete el.__waEvents[k]; }
  continue;
}
// set loop:
if (isWaListenerProp(k) && typeof v === "function") {
  el.__waEvents = el.__waEvents || {};
  const prev = el.__waEvents[k];
  if (!prev || prev.fn !== v) {
    if (prev) el.removeEventListener(prev.name, prev.fn);
    const name = waEventName(k);
    el.addEventListener(name, v);
    el.__waEvents[k] = { name, fn: v };
  }
  continue;
}
```

This preserves function identity: the remove-before-add bookkeeping prevents stacking. Panels should bind stable handlers (or accept the cheap remove/add). Use `onWa*` only for prefixed lifecycle events (`wa-show`, `wa-hide`, `wa-after-hide`, `wa-tab-show`, `wa-clear`, `wa-invalid`). For form-value changes prefer plain `onchange`/`oninput` — no new code needed there.

### A2. Properties vs attributes — `prop:` convention

Some WA components are driven by **DOM properties** not attributes: `wa-select` `value` (can be an **array** for `multiple`, not expressible as an attribute), `wa-dialog` `open`. Introduce a `prop:`-prefixed key that assigns to the property:

```js
// set loop:
if (k.startsWith("prop:")) {
  const name = k.slice(5);
  if (el[name] !== v) el[name] = v;   // skip if unchanged
  continue;
}
// removal loop:
if (k.startsWith("prop:") && !(k in newProps)) { el[k.slice(5)] = undefined; continue; }
```

Usage: `h("wa-select", { "prop:value": node.recipeId, onchange: … })`, `h("wa-dialog", { "prop:open": true, … })`. Reflected booleans (`disabled`, `pill`, `open`, `multiple`, `required`) keep the existing attribute path (`true`→`""` matches WA's presence-based booleans).

**Caveat (MAJOR M3) — the `!==` guard is for thrash-avoidance, NOT correctness.** Because every intent re-renders panels (`App._onSnapshot` → `_renderScreen`), a rejected intent (reducer returns `{ok:false}`) re-renders the select with the *old* value, and the guard would happily re-assert that stale value — silently reverting the user's visible selection. **Mitigation: always key the selects** (`key:"recipe-"+node.id`, etc.) and let `value` always reflect the authoritative snapshot; do not rely on the guard for correctness. Verify reducer-reject behavior for `SetRecipe`/`SetGathererResource`/`EquipItem` in the browser pass (pick an invalid option, confirm the select snaps back coherently). The render cadence already makes thrash unlikely — `refreshHud()` deliberately does **not** rebuild interactive panels; keep that invariant.

### A3. Slotted children — already works

`slot="footer"` etc. are plain attributes on the child vnode, passed through `setAttribute` untouched. Default- and named-slot children are ordinary `children` reconciled normally. **One hard rule (research §2): never self-close custom-element tags.** `h()` always produces paired tags via `createElement` + child patching, so this is automatically satisfied — the caution is for any hand-written HTML.

### A4. Cleanup so WA elements don't fight the reconciler

- **Listener identity / leaks:** `el.__waEvents` removes the old listener before adding on change, and on prop deletion. When `patch` removes an element, its listeners die with the GC'd node — no `disconnectedCallback` needed. (Note: this leak risk is browser-real but **invisible to the test shim** — see §10 M1.)
- **`wa-tab-group` self-managed active state:** drive the router from `onWaTabShow` (read `event.detail.name`); pass `active` as `prop:active` only on mount / external route change, guarded by `!==`, so we don't yank the tab mid-animation.
- **`wa-dialog` close:** fires **`wa-hide`** (NOT `wa-request-close`; `event.preventDefault()` cancels). Map dismissal via `onWaHide`/`onWaAfterHide`; use `prop:open` to open/close so programmatic close stays in sync.

The only render-layer file touched is `Dom.js` (`applyProps`). Snapshot changes are in §8; GraphView changes are in §7.

---

## 6. Component Mapping (every UI surface → WA)

### Data facts that drive the mapping (verified)

- **Snapshot node** (`Snapshot.js`): `{ id, kind, level, resourceId, recipeId, pos, capacity, effectiveRate, capacityPct, draw, surplus, stockpile, upgradeCost, canAfford }`. New derived fields `throughput`, `atCapacity`, `starved` are added in §8.
- **Snapshot link**: `{ id, from, to, resourceId, flow, fedPct }`.
- **Renderer:** `on*` props become handlers; `key` enables in-place reuse (**critical** so open `wa-select`/`wa-dropdown` aren't torn down by the 2s/intent re-render — all selects/dialogs MUST be keyed).
- **`wa-select`/`wa-input` fire standard `change`/`input`** (unprefixed) — bind `onchange` for value, matching today's `onchange`.

### Tag reference (key attrs)

`wa-button` (`variant` neutral/brand/success/warning/danger, `appearance` accent/filled/filled-outlined/outlined/plain, `size`, `pill`, `disabled`, `loading`; slots default/`start`/`end`) · `wa-card` (header/footer/media slots) · `wa-dialog` (`open`, `label`, `light-dismiss`, `without-header`; slots default/`footer`/`header-actions`/`label`) · `wa-select` (`value`, `multiple`, `placeholder`, `label`, `with-clear`, `appearance`, `pill`, `required`; children `wa-option`) · `wa-option` (`value`) · `wa-tab-group` (`active`, `placement`) · `wa-tab` (`panel`) · `wa-tab-panel` (`name`) · `wa-tooltip` · `wa-callout` · `wa-badge` · `wa-tag` · `wa-input` · `wa-divider` · `wa-progress-bar` · `wa-spinner`. ([WA components](https://webawesome.com/docs/components)) Note: the clear attribute is `with-clear`, not `clearable`.

### Per-surface mapping

**HUD — `Hud.js` (P2):** currency cells → 3 `wa-tag` (pill, `size=l`), each with `start`-slot `<i>` icon + value + a `<small>` rate, keyed `"gold"/"research"/"renown"`. Save badge → `wa-tag` (`variant=success/danger`, `appearance=outlined`) with `floppy-disk`/`triangle-exclamation`, keyed `"save"`. Tab bar → `wa-tab-group` (`active={router.current}`) with 4 `wa-tab` (`panel="factory|research|expeditions|heroes"`), each `start`-slot icon + label. **Routing stays hash-based**: `onWaTabShow` → `router.navigate(event.detail.name)`. Use `wa-tab-group` purely as the styled tab bar — **no `wa-tab-panel`** (App owns screen mounting). On narrow screens, `placement="bottom"` via CSS/media.

**BuildMenu — `BuildMenu.js` (P3):** outer → `wa-card` (keyed `"buildmenu"`), header = `<i gears>` + "Build". Machine palette → row of `wa-button` (`size=s`, `appearance=accent` when selected else `outlined`, `pill`), `start`-slot kind icon, `onclick → ui.setPalette(kind)`. Place-actions → vertical stack of `wa-button` (`appearance=filled`, full-width), `start`-slot resource/output icon, `onclick → dispatch(PlaceNode …)`. Replace `${res.icon}` with `icon(res.id)`.

**NodeInspector — `NodeInspector.js` (P3):** outer → `wa-card` (keyed `"inspector"`); empty state = "Select a node" with muted icon. Header: kind icon + `node.kind` + **MAX/starved badge** (§7). Body: `wa-tag size=s` "Level {n}"; `wa-progress-bar value={capacityPct*100}` labelled "Rate {effectiveRate}/{capacity}". Stockpile rows: icon + qty + `wa-button size=s appearance=outlined` "Sell" (`start`-slot coins) → `SellFromStockpile`. Recipe → `wa-select` (keyed `"recipe-"+id`, `prop:value={node.recipeId}`, `label="Recipe"`, `appearance=filled`) with `wa-option`s (output icon + display); event **`onchange`** → `dispatch(SetRecipe, e.target.value)`. Gatherer → `wa-select` (keyed `"gatherer-"+id`) similarly → `SetGathererResource`. Upgrade → `wa-button` (`variant=brand`, `appearance=accent`, `disabled={!canAfford}`, `start`-slot circle-up), label "Upgrade → " + `icon("gold")` + cost (per the `fmtCost` fix). Remove → `wa-button` (`variant=danger`, `appearance=outlined`, `start`-slot trash) → `RemoveNode`.

**ResearchTree — `ResearchTree.js` (P4):** depth-column layout + the memoized SVG prereq-edge layer (`{el}` passthrough) **stay unchanged** — mixing the passthrough vnode with `wa-card` siblings works (custom elements are ordinary Elements). Each node → absolute-positioned `wa-card` (keyed `"res-"+id`, status class retained for border tint). Header = name; body = cost (with currency icon) + flavor. Buy → `wa-button` footer: `variant=brand appearance=accent` when buyable; `disabled` + `circle-check` "Owned"; `disabled` + `lock` when locked. `onclick → BuyResearch`.

**ExpeditionBoard — `ExpeditionBoard.js` (P4):** each territory → `wa-card` (keyed `"terr-"+id`, status/victory classes for border). Header `#{order} {name}` (+ crown when victory). Body: flavor; power line with shield icon; duration; rewards as 3 `wa-tag size=s` (gold/research/renown icons — replaces `🪙📜🛡️`). active → `wa-callout variant=brand` "In progress — {countdown}" + optional `wa-progress-bar`. ready → `wa-button variant=success appearance=accent` (`start`-slot flag-checkered) "Launch" → `StartExpedition`. underpowered → `wa-button disabled` + `wa-callout variant=warning` (nudge text). busy → `wa-button disabled` + tooltip/callout. reclaimed → `wa-tag variant=success` circle-check. locked → `wa-tag appearance=outlined` lock.

**HeroPanel — `HeroPanel.js` (P4):** each hero/recruit → `wa-card` (keyed `"hero-"+id` / `"recruit-"+id`). Header = name; body = power line + `wa-tag size=s` level. 3 equip slots → `wa-select` (keyed `"equip-"+id+"-"+slot`, `prop:value={equipped?String(tier):""}`, `label={slot}`, `appearance=filled`); `wa-option value=""` "— none —" then a `wa-option` per tier (`value=String(tier)`, item icon, "{display} T{tier}"); `onchange` → if `""` no-op else `EquipItem {heroId, slot, itemId, tier:Number(val)}`. Level Up → `wa-button variant=brand appearance=accent disabled={!canLevel}` (`start`-slot arrow-up-right-dots), label + `icon("renown")` + cost. Recruit → `wa-button appearance=accent disabled={!canRecruit}` (`start`-slot user-plus).

**OfflineSummary — `OfflineSummary.js` (P5):** `.modal-backdrop` → `wa-dialog` (`prop:open=true`, `label="While you were away"`, keyed `"offline"`). Body: elapsed; gained as 3 `wa-tag`; reclaimed lines as `wa-tag variant=success`. Footer slot `wa-button variant=brand` "Continue" → `onClose`. Close wiring: `onWaHide → onClose()` (clears `pendingOfflineSummary` + `renderNow`). App's `_renderOverlay` keeps owning the dialog node.

**Victory — `Victory.js` (P5):** → `wa-dialog` (`prop:open=true`, `light-dismiss` off so it's acknowledged, `label` slot = crown + "Yensburg Reclaimed", keyed `"victory"`). Body: epilogue (`user-select:text`) + sub. Footer `wa-button variant=brand appearance=accent` (crown) "Continue the Reign" → `AckVictory`. `onWaHide → onClose`. The once-only `AckVictory` gate + persisted `seenVictory` are unchanged.

**Tooltip — `Tooltip.js` (P5):** keep the `.tooltip-layer` host (App positions it via `data-anchor`). Inner → `wa-callout variant=brand` (keyed `"tip-"+step`), `start`-slot `circle-info`, default-slot tip text, + `wa-button size=s appearance=plain` "Got it" → `DismissTooltip {flag}`. `nextTutorialStep`/anchor logic unchanged.

**Error flash — `App.js` `.hud-error` (P5):** keep the imperative `errorEl` host + 2.5s timer (outside the reconciler); set its child to a `wa-callout variant=danger` with `start`-slot triangle-exclamation.

**Cleanup:** after moving to `wa-button` `disabled` + `variant/appearance`, the old `.affordable`/`.locked` background/opacity rules become redundant — retire them or scope to remaining non-WA elements to avoid double-styling. **Keep semantic classes** (`.ni-upgrade`, `.exp-launch affordable`, `.os-close`, `.res-buy`, `.victory-close`, `.tip-dismiss`) on the `wa-*` elements so the playthrough probe's class selectors survive with minimal churn (§10).

> **Note (import-path inconsistency, non-blocking):** most panels import from `./Format/Format.js`, while `Hud.js` imports `./Render/Format.js`. Two format modules exist. The icon helper lives at `Source/UI/Icons.js`; pick a single home for any shared format additions (recommend `UI/Render/` to sit beside the render layer).

---

## 7. The Three Concrete Items

### Item 1 — `user-select:none` on UI chrome

Pure CSS (Reset.css or WaTheme.css), applied to chrome containers and WA host selectors, leaving genuine text selectable:

```css
.hud, .factory-panels, .panel-host, .overlay-layer, .build-menu, .node-inspector,
.hero-panel, .research-tree, .expedition-board, .tooltip, .modal,
wa-button, wa-tab, wa-tab-group, wa-card, wa-callout, wa-badge, wa-tag {
  user-select: none;
  -webkit-user-select: none;
}
wa-input, wa-select, .modal-text, .victory-text { user-select: text; }
```

The graph SVG `<text>` is already unselectable. **Caveat:** WA components render label text into shadow DOM, so the host-selector rule styles the host but may not reach slotted/shadow text — fine for short chrome labels, but verify in the browser pass that the dialog/callout body text intended to be selectable (`.modal-text`/`.victory-text`) honors it.

### Item 2 — node MAX badge + starved cue

Driven by the new snapshot fields (§8). Definition: `atCapacity` (running full for its level → green "MAX", upgrade to go faster), `starved` (input-limited consumer → distinct warning cue). They are mutually exclusive; both false = idle/unconfigured (shows neither). Per the verified analysis, the canonical formula is **RENDER/ENGINE's** (gatherers with no resource configured correctly read "neither," not "always MAX" — discard the COMPONENTS "gatherers always MAX" shorthand).

- **NodeInspector (HTML, P3):** header badge — `wa-badge variant=success` `start`-slot `gauge-high` "MAX" when `atCapacity`; `wa-badge variant=warning` `triangle-exclamation` "STARVED" (or "LOW") when `starved`. The `wa-progress-bar` uses a warning color when starved.
- **GraphView node card (SVG, P3):** mirror the same state with a small SVG badge at the card's top-right (a `<rect>` + `<text>` "MAX" tinted `--good`; warning chip tinted `--bad`/amber when starved), and add a modifier class to the capacity-bar fill: `.cap-fill.at-capacity` (full, green/gold) vs `.cap-fill.starved` (amber, partial). The bar already reads `n.capacityPct`, now corrected to reflect `throughput` (§8).

### Item 3 — link labels hidden by default; click to reveal

**State lives in `GraphView` (UI), not the snapshot** — whether a label shows is presentation, not game state, and must not round-trip through the headless engine. All data needed (`l.resourceId`, `l.flow`, `l.fedPct`) is already in every link. `GraphView` already owns transient view state (`selectedId`, `armedPort`, …) and is long-lived (re-created only on route change), so a `selectedLinkId` persists across `render(snap)` calls.

Changes in `GraphView.js`:

1. Add `this.selectedLinkId = null;` (next to `selectedId`).
2. In `_draw()`, **stop always-drawing** the `link-label` `<text>` and the `✕` delete affordance. Render both **only** when `l.id === this.selectedLinkId`. Starved link styling (`.link-path.starved`, dashed `--bad`, driven by `fedPct<0.999`) stays always-on as a passive cue.
3. Add `_selectLink(id)` that toggles `selectedLinkId` and redraws; clear `selectedLinkId` inside `_select` so node-select / empty-click and link-reveal are mutually exclusive.

**BLOCKER fix (B1) — route the link hit-test through `GraphInput`, not a bare SVG `onclick`.** A naive `onclick` on a `link-hit` path is broken: `GraphInput._bind()` attaches `pointerdown` on `this.svgEl`, and link paths are children of `svgEl`, so a press fires both the link handler **and** bubbles to `svgEl`'s `pointerdown` → `_down()` → no port/node hit → `onSelect(null)` → `_select(null)`, which clears `selectedLinkId` on the very same gesture (label never appears). Additionally `setPointerCapture` on every `_down` makes child `click` events unreliable. **Correct design:** add a `hitLink(gx, gy)` test to `GraphInput`, checked inside `_down` **before** the `onSelect(null)` fall-through; only toggle the reveal on a **tap** (pointer moved ≤ `TAP_MOVE_PX`) so pan-drags that start on a link don't toggle it. This also makes touch work without special-casing. Add a wide transparent hit stroke for easy targeting:

```css
.link-hit { stroke: transparent; stroke-width: 18; fill: none; pointer-events: stroke; cursor: pointer; }
.link-label, .link-delete { /* only created when revealed; no display toggle needed */ }
```

When revealed, render the midpoint output label: `icon(resourceId)` (via `<foreignObject>` if using the duotone HTML path, else a monochrome glyph) + `"{RESOURCES[resourceId].display} · {flow.toFixed(2)}/s"` on a small parchment `<rect>` plaque, plus the `✕` → `RemoveLink`.

---

## 8. Snapshot/Engine changes

The **only** engine-adjacent edit is additive read-model fields in `Source/Engine/Snapshot.js`. `RateSolver.js` needs **no change** — it already returns `capacityByNode`, `availableOut`, and `perNodeDraw`.

**Why a consumer special-case is required (verified):** `effectiveRate` = sum of `availableOut[id]`, which is correct for **producers** (gatherer/smelter/workshop). But scholar/market set `availableOut[id] = {}` (RateSolver.js), so their `effectiveRate` is `0` even when fully fed — naively flagging every fed scholar/market as "starved." Their real throughput is their **input draw** (`perNodeDraw[id]`). So compute a per-node `throughput` = producer output for producers, input draw for consumers.

In `Snapshot.build`, inside the `nodes.map` (after the existing `effectiveRate`/`capacity` lines):

```js
const out = (solved.availableOut && solved.availableOut[node.id]) || {};
const drawMap = (solved.perNodeDraw && solved.perNodeDraw[node.id]) || {};
const producerRate = Object.values(out).reduce((a, b) => a + b, 0);
const consumerRate = Object.values(drawMap).reduce((a, b) => a + b, 0);
const isConsumer = node.kind === "scholar" || node.kind === "market";
const throughput = isConsumer ? consumerRate : producerRate;

const takesInput = node.kind !== "gatherer"; // gatherers take no input -> never starved
const EPS = 1e-6;
const atCapacity = cap > 0 && throughput >= cap - EPS;
const starved    = cap > 0 && takesInput && throughput < cap - EPS;
```

Expose on the node object (keep `effectiveRate` = `producerRate` for back-compat; add the three new fields; fix `capacityPct` to use `throughput` so consumers show a real bar):

```js
return {
  id: node.id, kind: node.kind, level: node.level,
  resourceId: node.resourceId, recipeId: node.recipeId,
  pos: { x: node.pos.x, y: node.pos.y },
  capacity: cap,
  effectiveRate: producerRate,                  // unchanged meaning
  throughput,                                   // NEW
  capacityPct: cap > 0 ? throughput / cap : 0,  // now correct for consumers
  atCapacity,                                   // NEW
  starved,                                      // NEW
  draw: drawMap,
  surplus: (solved.surplusRate && solved.surplusRate[node.id]) || {},
  stockpile: { ...node.stockpile },
  upgradeCost: cost, canAfford: state.currencies.gold >= cost,
};
```

**Semantics:** `atCapacity` → green "MAX"; `starved` → warning cue; both false (cap 0: no recipe/resource/disconnected) → idle, neither badge. A gatherer with `resourceId=null` has empty `availableOut` → `throughput=0`, `atCapacity=false`, and `takesInput=false` → `starved=false` → correctly shows neither.

These are derived, frozen read-model fields, so **no existing engine test changes**; add proactive Snapshot-level assertions (gatherer→atCapacity; under-fed smelter→starved; fully-fed scholar→atCapacity not starved; market scaled below cap→starved; unconfigured gatherer→neither). The 256 existing tests stay green.

---

## 9. Phased Rollout (5 phases, each shippable)

Each phase is independently shippable + deployable. Standing invariants across all phases: engine `Source/Engine/**` untouched except the additive Snapshot fields (P3); render cadence locked; the reconciler is extended once (P2) additively so un-migrated panels render identically; SW `CACHE` bumped per deploy with required Vendor assets in `SHELL`.

### P1 — Foundation
Vendor WA `dist-cdn/` + FA Pro Duotone (`css/`+`webfonts/`) under `Source/Vendor/`; buildless `<link>`/`<script type=module>` with explicit subpath base; parchment/iron/gold theme as `--wa-*` token overrides; central `Source/UI/Icons.js`; **all emoji replaced with FA Duotone `<i>` markup** (including the `fmtCost` string fix, B2); `user-select:none`; the **`Dom.js` event-listener + `prop:` extension** (additive, inert until used). No structural component swaps yet (buttons/tabs stay native HTML) — this phase proves loader + fonts + theme + icons on the live subpath.

Files: add `Source/Vendor/**`, `Source/UI/Icons.js`, `Source/Styles/WaTheme.css`, `Source/Vendor/.npmrc.example`; edit `Index.html`, `Source/Styles/Reset.css`, `Source/UI/Render/Dom.js`, `Source/UI/Format/Format.js` (fmtCost), emoji call-sites in `Hud.js`/`ExpeditionBoard.js`/`OfflineSummary.js`/`BuildMenu.js`/`NodeInspector.js`/`HeroPanel.js` (and `GraphView.js` node icons — using `iconName`, pending OQ-2), `ServiceWorker.js` (`-v4` + SHELL), `.htaccess` (woff2 MIME), `.gitignore`.

Acceptance: loads at `/kingdom/` with zero console errors / no Vendor 404s / no FA boxes; **no emoji remain** in `Source/UI` (grep gate, engine `Resources.js` exempt); duotone two-tone renders from theme tokens; `user-select:none` confirmed.

### P2 — HUD + tabs
Re-platform HUD (currency `wa-tag`, save `wa-tag`, `wa-tab-group` driving the hash router via `onWaTabShow`). The `Dom.js` extension lands here if not already in P1 (the design front-loads it to P1; either is acceptable so long as it precedes any `wa-*` event use). Verify deep-links, back/forward, and no listener accumulation across the 2s HUD re-render.

Files: `Source/UI/Hud.js`, `Source/Styles/Layout.css`, `ServiceWorker.js` (`-v5`).

### P3 — Factory panels + the node/link items
`BuildMenu`/`NodeInspector` → real `wa-select`/`wa-button`; the Snapshot `atCapacity`/`starved` fields (§8); GraphView node MAX/starved badges + `.cap-fill` modifier classes; link **click-to-reveal** routed through `GraphInput.hitLink` (B1). Resolve OQ-2 (SVG node-card icon technique).

Files: `Source/Engine/Snapshot.js`, `Source/UI/BuildMenu.js`, `Source/UI/NodeInspector.js`, `Source/UI/GraphView.js`, `Source/UI/GraphInput.js`, `Source/Styles/Graph.css`, `Source/Styles/Layout.css`, `ServiceWorker.js` (`-v6`).

### P4 — Research / Expeditions / Heroes
`ResearchTree` (keep the `{el}` prereq-edge passthrough), `ExpeditionBoard`, `HeroPanel` → `wa-card`/`wa-select`/`wa-button`/`wa-callout`/`wa-tag`/`wa-badge`. Keep semantic classes on WA elements for probe-selector survival.

Files: `Source/UI/ResearchTree.js`, `Source/UI/ExpeditionBoard.js`, `Source/UI/HeroPanel.js`, `Source/Styles/Layout.css`, `ServiceWorker.js` (`-v7`).

### P5 — Modals + tooltips + polish
`OfflineSummary` + `Victory` → `wa-dialog` (close via `wa-hide`); `Tooltip` → `wa-callout`; error flash → `wa-callout`; final layout/screen-real-estate + clarity polish (MAX/starved legend, onboarding flow). `AckVictory` once-only gate and tutorial persistence unchanged.

Files: `Source/UI/OfflineSummary.js`, `Source/UI/Victory.js`, `Source/UI/Tooltip.js`, `Source/UI/App.js` (overlay `open`/`wa-hide` wiring), `Source/Styles/Layout.css`+`Theme.css`, `ServiceWorker.js` (`-v8`).

---

## 10. Testing & Verification (incl. the no-WA-under-node reality)

**The crux:** the playthrough probe's `FakeEl` is a plain object graph that does NOT run the custom-elements registry — `<wa-*>` tags never upgrade, so there is no shadow DOM, no `wa-change` dispatch, no reflected properties, no `updateComplete`, no focus-trap. The probe can only assert **what vnodes/attributes/handlers a panel emitted**, never rendered WA behavior. All WA *behavior* verification is the manual browser pass.

Four verification lanes, mixed per phase:

1. **Engine green** — `node Tests/RunAll.js` must stay green (**256 tests** — correct the stale "248+" count). The only engine edit is the additive Snapshot fields (P3), which get new assertions here.
2. **Pure-helper node unit tests** (`Tests/*.Test.js`, added to `RunAll.js`):
   - **Icon map** (`Tests/IconMap.Test.js`): every game concept + every `RESOURCES` id resolves to a non-empty `{name}`; `icon()` emits a vnode whose `class` contains `fa-` and **never** an emoji codepoint; no concept silently collides on `undefined`.
   - **Patch extension** (`Tests/Dom.Test.js`): `onWaChange` binds a `wa-change` listener and firing it calls the fn; `prop:value` sets `el.value` as a property not an attribute; `disabled:true` still yields an empty attribute. **M1 fix:** the test `FakeEl` must be upgraded to maintain an **array of listeners per type** (the current shim stores one and overwrites, so the promised "no-stacking" assertion is impossible as drafted) — then assert the remove-before-add bookkeeping keeps the count at 1. Also add a DevTools "Event Listeners" check to the browser checklist, since the real leak is browser-only.
   - **Snapshot derivation** (`Tests/Snapshot.Test.js`, P3): table-driven `atCapacity`/`starved`/idle across known solver outputs (full-fed→atCapacity; throttled→starved; fully-fed scholar→atCapacity-not-starved; unconfigured gatherer→neither).
3. **PlaythroughProbe adaptation** — migrate selectors phase-by-phase to the new tags/classes, asserting emitted `wa-*` tag + attributes + that the wired handler fires the right intent. The shim's `addEventListener` records into `_listeners`, so a `wa-change`/`wa-hide` handler is invoked exactly as `el.onchange(...)` is today (`el._listeners['wa-change']({...})`). Probe runs are a per-phase CI gate. **M2:** because `e.target.value` on a real `wa-select` `change` depends on shadow-DOM upgrade the shim never performs, the **correct-value** propagation for recipe/gatherer/equip is verifiable **only** in the browser — so P3/P4 browser checklists must assert the **dispatched intent payload value** (temporary `console.log(dispatch.last)`), not just visual re-render; and P2's throwaway `<wa-select>` probe should empirically confirm `change` + `event.target.value` before BuildMenu/NodeInspector commit to it.
4. **Live browser pass (the only real visual/behavior check)** — per phase: rsync to `dev.jdayers.com/kingdom`, bump SW cache, hard-reload, walk a written checklist, capture screenshots. Phase highlights: P1 — duotone glyphs, theme tokens, offline reload still shows glyphs (proves woff2 precached), no chrome text-highlight; P2 — tab→route + active styling + listener-leak inspection + tab-group renders/fires with no `wa-tab-panel` (m3); P3 — open a dropdown (open/close/keyboard, unprobeable), recipe change re-renders **with correct value**, build a chain and confirm MAX vs starved, click links to reveal/hide (and confirm a pan starting on a link does NOT toggle, per B1); P4 — buy research, launch+resolve expedition, equip+level a hero, status-color clarity, **reducer-reject select snap-back** (M3); P5 — dialog focus-trap/light-dismiss, victory fires once, tutorial callouts anchor+advance, selectable dialog body text (m5).

**Rollback safety:** P1 is purely additive (revert `Index.html` links + SW bump → emoji UI returns). The `Dom.js` extension is inert without `onWa*`/`prop:` props, so P2+ panels can each revert to their prior phase's file independently. The snapshot fields are additive and unit-pinned. The kept SVG passthrough (research edges) and hand-rolled canvas never change shape. The safety-critical victory-once/flag-persistence logic is engine/selectors code untouched across all five phases.

---

## 11. Risks & Out-of-Scope

**Risks (mitigations folded into the phases):**

- **WA token-name drift (version-sensitive).** Neutral-scale slots and a few semantic names may differ in the actually-pulled v3.7.0. Mitigation: pull-then-grep-then-author sequencing (OQ-1); `WaTheme.css` is the single tuning point. ([WA tokens](https://webawesome.com/docs/tokens))
- **Standard-vs-`wa-`-prefixed event split** on form controls is the highest-likelihood reconciler bug source — it is not uniform. Mitigation: bind plain `onchange`/`oninput` for values; `onWa*` only for lifecycle events; unit-test the split.
- **`prop:value` stale-revert on rejected intents (M3).** Mitigation: keep selects keyed; verify reducer-reject snap-back in the browser.
- **`dist-cdn/` packaging.** Confirm it exists in the pulled tarball ([GH #2146](https://github.com/shoelace-style/webawesome/discussions/2146)).
- **woff2 MIME** on the Plesk vhost — add `AddType font/woff2 .woff2` (P1) or fonts render as boxes.
- **SW offline correctness** — Vendor assets that must work offline (loader, `webawesome.css`, `fa-duotone-900.woff2`) **must** be in `SHELL` (cache-first won't store un-listed files).
- **No-WA-under-node testing gap** — dropdown keyboard/open-close, dialog focus-trap/light-dismiss, animations, and correct `wa-select` value propagation are browser-only; the per-phase checklists carry the specific assertions (M1/M2/M3) so the automated net's reach isn't overstated.
- **Listener thrash** if panels pass fresh closures every render — bind stable handlers; the remove-before-add bookkeeping bounds the cost.

**Out-of-scope (explicit):**

- The hand-rolled SVG factory **canvas** (`GraphView`/`GraphInput` geometry, pan/zoom, ports) — only its chrome and node-card/link **presentation** change.
- The headless **engine** (`Source/Engine/**`) — except the additive Snapshot read-model fields. No new intents are introduced; all mappings reuse existing intents.
- The **render cadence** — no per-frame rendering is reintroduced.
- `<wa-icon>` for duotone — deliberately excluded (kit-code = runtime CDN; self-hosted Pro Duotone unsupported in `wa-icon`).
- Pro themes beyond `wa-theme-default` and palettes beyond `wa-palette-default` — not adopted; the kingdom look is achieved purely via token overrides.

**Open Questions:**

- **OQ-1 (process gate, blocks P1 theme authoring):** confirm the exact `--wa-color-*`/`--wa-border-radius-*` token names in the vendored v3.7.0 `webawesome.css` before finalizing `WaTheme.css`. The token list in §3 is a draft.
- **OQ-2 (P3 decision, currently undecided):** SVG node-card icon technique — `<foreignObject>` + `<i>` (full duotone, but adds HTML inside the hand-rolled SVG that `_replace()` teardown must handle) vs. monochrome single-layer glyph via `font-family` + codepoint (no duotone). The icon map already supplies `iconName()` either way. For P1, if neither is ready, node-card icons may temporarily stay as emoji in-canvas and be reworked in P3 (note: this would make the P1 emoji-grep gate scope to non-canvas UI only — decide explicitly).
- **OQ-3 (minor):** confirm `wa-tab-group` renders all `wa-tab`s and fires `wa-tab-show` with **no** `wa-tab-panel`s present (some tab implementations expect matching panels). Low risk; on the P2 browser checklist.
