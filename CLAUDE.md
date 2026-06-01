# IdleKingdom — Project Guide (CLAUDE.md)

> Durable context for any Claude Code session working on this repo. Read this first.
> Self-contained on purpose: it must be useful even in a session that lacks the
> developer's global `~/.claude` memory.

## What this is

**IdleKingdom** — a minimalist flat-fantasy **idle/automation game** (Kingdom Inc.-inspired),
set in the besieged city of **Yensburg**. Core loop: a **node/flow-graph factory** (a DAG, not
spatial belts) → **rate-based steady-state** simulation → **true idle + offline catch-up**.
You scale by **leveling nodes** (not copying them). Three currencies (Gold / Research / Renown),
permanent tiered gear (weapon / armor / accessory), timed deterministic expeditions, and
reclaiming 6 territories → victory → free-play (no prestige).

- **Live:** https://dev.jdayers.com/kingdom/
- **Repo:** `evilchinesefood/IdleKingdom` (GitHub, **private**). Default branch **`main`** — the project deploys from `main`.
- **Local path:** `C:\Users\evilc\Github\IdleKingdom` (Windows) = `/mnt/c/Users/evilc/Github/IdleKingdom` (WSL).
- This repo has **`core.filemode=false`** set locally (required on `C:\`/DrvFs — NTFS reports exec bits, so otherwise `git status` shows every file as modified). Don't remove it.

## Tech stack & hard rules (non-negotiable)

- **Vanilla JS, native ES modules, buildless.** NO framework (no React/Vue/etc.), NO bundler, NO build step. Files load directly via `<script type="module">`.
- **PascalCase** for ALL files and directories (`GraphView.js`, `Source/Engine/`).
- **Prettier** before finishing any task. Keep code minimal/clean: short names, few comments (only where the logic isn't self-evident), small single-purpose functions. Don't add type annotations/docstrings/comments to code you didn't change.
- The **engine is headless and DOM-free** (unit-tested under node). The UI only reads frozen snapshots and dispatches intents — strict one-way data flow.
- **Render cadence is LOCKED:** render on intents + expedition-resolve + a 2s HUD-only interval. NEVER reintroduce per-frame rendering.

## Architecture

- **Engine** (`Source/Engine/**`, headless): `GameState` + `RateSolver` (steady-state rates) + Systems + Persistence (behind a `StorageAdapter` seam) + an injectable `Clock`. Save = localStorage now, cloud-ready abstraction. Flow: intents → reducers → new state → a frozen read-model `Snapshot` (`Source/Engine/Snapshot.js`).
- **UI** (`Source/UI/**`, thin): a hand-rolled `h()`/`patch()` reconciler (`Source/UI/Render/Dom.js`) renders panels from `Snapshot.build` and dispatches intents (`Source/UI/Intents.js`). `App.js` owns mounting, the hash router, and the overlay layer. The factory **canvas** (`GraphView.js` + `GraphInput.js`) is a bespoke hand-rolled SVG (pan/zoom/ports/drag) — out of scope for component swaps; only its chrome/presentation changes.
- **Selectors** (`Source/UI/Logic/Selectors.js`) — pure, DOM-free, unit-tested.
- Two format modules: `Source/UI/Render/Format.js` (`formatNumber`/`formatRate`, used by `Hud.js`) and `Source/UI/Format/Format.js` (`fmtNum`/`fmtRate`/`fmtCountdown`/`fmtCost`/`cap`, used by panels; re-exports the Render ones).

## UI component system — Web Awesome + Font Awesome Pro Duotone

The non-canvas UI is built on **Web Awesome v3.7.0** web components with **FA Pro Duotone** icons,
**vendored + buildless** (no runtime CDN).

- **Vendored** under `Source/Vendor/`: `WebAwesome/` (from `@awesome.me/webawesome` **`dist-cdn`**, not `dist`), `FontAwesome/{css,webfonts}` (Pro Duotone), and `Fonts/` (Cinzel display + EB Garamond body). The WA loader in `Index.html` needs `data-webawesome="/kingdom/Source/Vendor/WebAwesome/"` (absolute subpath base).
- **Icons** — `Source/UI/Icons.js`: `icon(concept, opts={})` → an `<i>` Duotone vnode; `iconName(concept)` → the FA name string. **`opts` is an OBJECT** (`{noTone, class, primary, secondary, secOpacity}`), NEVER a string. Use `{noTone:true}` for HUD icons (dark-navbar contrast). The central `ICONS` map is the single source of truth (game concept → FA name + tone). **No emoji anywhere in `Source/UI`** — the only exception is the `×` link-delete glyph in `GraphView`.
- **Theme** — `Source/Styles/WaTheme.css` maps the parchment/iron/gold palette onto `--wa-*` tokens, scoped to `html.kingdom-theme`. `Theme.css` holds the raw `--parchment`/`--iron`/`--gold`/`--good`/`--bad`/… vars.
- **Reconciler extensions** (already shipped in `Dom.js`): `onWa<Event>` props add custom-event listeners (`onWaHide`→`wa-hide`; remove-before-add so listeners don't stack); `prop:<name>` assigns a DOM **property** (`prop:value`, `prop:open`, `prop:active`). Standard form events (`onchange`/`onclick`) stay on the plain `on*` → DOM-handler path.

**Rules when emitting WA components:**
- **KEY every** `wa-select`/`wa-dialog`/interactive component (`key:"recipe-"+id`) so the 2s/intent re-render reuses it in place and never tears down an open dropdown/dialog mid-interaction.
- `prop:value` always reflects the **authoritative snapshot** so a rejected reducer intent snaps the control back ("M3"); don't rely on the `!==` thrash guard for correctness.
- **Size tokens are SHORT form `s`/`m`/`l`.** The long form (`small`/`medium`/`large`) is **deprecated in WA v3.7.0** (console warns). (The cross-phase critique got this backwards — short form is correct.)
- Icons into WA slots go via a real `slot="start"` attribute on the `<i>` (or a wrapping `<span slot="start">`), never a CSS class.
- Tab router: drive from `onWaTabShow` (read `event.detail.name`), set `prop:active`, emit NO `wa-tab-panel` (App owns screen mounting). Dialogs close via `onWaHide` + the footer button `onclick` (same `onClose`); App owns add/remove of the dialog vnode (it emits `prop:open:true` while it should show).
- `fmtCost(amount)` is **text-only** — prepend `icon("gold"/"research"/"renown")` as a sibling vnode.

## Testing & verification (this is the safety net — always run it)

- **`node Tests/RunAll.js`** — zero-dep registered suite; MUST stay green (currently **281 passed, 0 failed**). Engine + pure-UI-helper tests.
- **`node Tests/PlaythroughProbe.mjs`** — standalone 13-step end-to-end probe that drives the REAL UI panels under a minimal DOM shim and fires their real handlers (the strongest automated check). Per-change gate (currently **13/13**). NOT in `RunAll`.
- **`node Tests/VictoryProbe.mjs`** — scripted engine→victory probe.
- **CRUCIAL LIMITATION:** the node DOM shim does NOT upgrade `wa-*` custom elements (no shadow DOM, no `wa-change`/`wa-hide` dispatch, no reflected properties). The probe asserts emitted **vnodes / attributes / handlers** only — all real Web Awesome *behavior*, FA glyph rendering, and visual layout are **browser-only** (the human's acceptance pass; hard-reload twice for the SW swap).
- Keep semantic CSS classes on `wa-*` elements (`.ni-upgrade`, `.exp-launch`, `.os-close`, `.res-buy`, `.hp-equip`, …) so probe selectors survive. Run **Prettier** on changed files before finishing.

## Deploy (buildless rsync to the home server)

- **Target:** `johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/`. SSH is **password auth only** — pass `-o PreferredAuthentications=password -o PubkeyAuthentication=no` (the SFTP subsystem is blocked; use rsync/scp over ssh). The **Home Server / johndayers.com** password is in your password manager / WSL `~/.claude` memory `server_access.md` — **deliberately not stored in this file**. The deploy toolchain (`sshpass`) is WSL-based; run it from the `/mnt/c/...` path.
- **Bump `ServiceWorker.js` `CACHE` on every asset-touching deploy** (it's a cache-first SW; the activate handler purges old caches + re-precaches). **Currently `idlekingdom-v10`** → next is `v11`, `v12`, … Any asset that must work offline MUST be listed in `SHELL` (the WA loader, `webawesome.css`, the FA css, `fa-duotone-900.woff2`, and the vendored fonts are already there).
- **`.htaccess`** (committed at repo root, REQUIRED): `DirectoryIndex Index.html` (the PascalCase entry would otherwise 403), ES-module MIME types, and `AddType font/woff2 .woff2` (the FA webfont renders as boxes without it).
- **Exclude from rsync** (and NEVER ship `.npmrc` — it holds the FA Pro token): `.git/ docs/ Tests/ node_modules/ package.json package-lock.json .gitignore .npmrc .npmrc.example .omc/ CLAUDE.md AGENTS.md`.
- Command:
  ```bash
  SSHPASS='<home-server-pw>' sshpass -e rsync -avz --delete \
    --exclude='.git/' --exclude='docs/' --exclude='Tests/' --exclude='node_modules/' \
    --exclude='package.json' --exclude='package-lock.json' --exclude='.gitignore' \
    --exclude='.npmrc' --exclude='.npmrc.example' --exclude='.omc/' \
    --exclude='CLAUDE.md' --exclude='AGENTS.md' \
    -e "ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no" \
    /mnt/c/Users/evilc/Github/IdleKingdom/ johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/kingdom/
  ```
- Verify after: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://dev.jdayers.com/kingdom/<asset>` — JS as `text/javascript`, css as `text/css`, woff2 as `font/woff2`; and confirm `.npmrc` returns 404.
- **Local play:** `python3 -m http.server 8137 --directory /mnt/c/Users/evilc/Github/IdleKingdom` → `http://localhost:8137/Index.html`.

## Secrets

- The **FA Pro npm token** lives ONLY in the gitignored repo-root **`.npmrc`** (present locally, never committed, never deployed). To re-vendor WA/FA: from a scratch dir that has the `.npmrc`, `npm install @awesome.me/webawesome@3.7.0 @fortawesome/fontawesome-pro`, then copy `dist-cdn`→`Source/Vendor/WebAwesome` and FA `css/`+`webfonts/`→`Source/Vendor/FontAwesome/`.
- No secrets are embedded in this file by design. Don't paste the FA token or the server password into any committed/deployed file.

## Gotchas / hard-won lessons

- **`core.filemode=false`** is required for this repo on `C:\` (DrvFs) — already set; without it `git status` shows every file modified (mode `100644`↔`100755`).
- **`patch()` reconciles over `childNodes` (incl. text nodes), not `children`.** A past bug stacked text nodes (the "saved" HUD badge flooded the screen). Test shims must include text nodes.
- **WA size tokens: short form `s`/`m`/`l`** (long form deprecated v3.7.0).
- **`icon()`'s second arg is an options object**, not a class string.
- Node-card drag is **select-first** (first tap selects, then a drag moves it) + grab-offset (no jump) + snap-to-grid on drop. Link flow-labels are **click-to-reveal**, hit-tested through `GraphInput.hitLink` on a TAP (a pan-drag that *starts* on a link must NOT toggle it). `Svg.linkBezier()` is the shared control-point source for `linkPath` + `hitLink` (keep them in sync).
- UI prefs (`Source/UI/Prefs.js`, localStorage `idlekingdom-prefs`: `snapToGrid`, `alwaysShowRates`) are separate from the engine save (`SAVE_KEY`). Settings modal = `Source/UI/Settings.js` (gear button in the HUD).
- The Snapshot node read-model includes derived `throughput`/`atCapacity`/`starved` + a `capacityPct` that's correct for consumers (scholar/market use input-draw, not `availableOut`). `effectiveRate` = producer output (back-compat).

## Current status (as of 2026-06-01)

- **MVP** complete (tag `v1.0.0-mvp`).
- **UI re-platform onto Web Awesome — Phases 1–5 COMPLETE & deployed** (SW `idlekingdom-v10`):
  P1 foundation (vendored WA/FA, `Icons.js`, `WaTheme.css`, `Dom.js` `onWa*`/`prop:` extensions, all emoji → FA Duotone); P2 HUD/tabs; P3 factory panels + Snapshot derived fields + MAX/STARVED badges + link click-to-reveal (B1); P4 research/expeditions/heroes; P5 dialogs/tooltip/error-flash/legend; + the WA short-size-token fix. All on `main`, pushed to `origin`.
- **PENDING — the human's:** per-phase **browser acceptance** (WA/FA only render in a real browser) and the **acceptance tags** `ui-p1-foundation` / `ui-p2-hud-tabs` / `ui-p3-factory` / `ui-p4-content-panels` / `ui-p5-modals-tooltips-polish` — **not all applied yet** (gated on sign-off). Don't apply them or claim acceptance without the human's confirmation.
- **Spec + plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (the `2026-06-01-idlekingdom-ui-replatform-*` set is the re-platform; `2026-05-31-*` is the original MVP).

## Working style

- This project was built with the superpowers **`subagent-driven-development`** workflow: a fresh implementer subagent per task, then a spec-compliance review and a code-quality review with fix-loops. **Commit per task** (conventional-commit messages + a `Co-Authored-By` trailer). **Push only fast-forward to `origin/main`** (never force-push main).
- Verify before claiming completion (run the suites + probe). Don't fabricate green results.
- Communication: brief and direct. On clear tasks, just do the work; on ambiguous ones, ask first.
