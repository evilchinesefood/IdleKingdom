# IdleKingdom

A web-based **idle / automation game** set in the besieged fortress-city of **Yensburg** — rebuild a war economy from a single mine, automate production chains, arm a hero, and reclaim six fallen walls. Inspired by *Kingdom Inc.*

**▶ Play:** https://dev.jdayers.com/kingdom/

---

## The loop

Harvest raw resources → run them through crafting chains → sell goods at the Market for **Gold** → spend **Research** to unlock machines, recipes, and bonuses → upgrade & expand → forge gear and equip a hero → launch timed **expeditions** that reclaim territory (which in turn unlocks more factory content) → reclaim all six territories to win. **True idle:** production keeps accruing while you're away, with an offline catch-up on return.

## Tech & design

- **Vanilla JS, native ES modules, buildless** — no framework, no bundler, no runtime dependencies. Served as static files; `PascalCase` file & directory names.
- **Headless engine** (`Source/Engine/`) — a pure, DOM-free state machine, fully unit-tested. One-way data flow: the UI dispatches *intents*, the engine mutates state and emits a frozen *snapshot*, the UI renders the snapshot.
- **Rate-based steady-state simulation** — a topological solver computes per-node throughput (with fan-out conservation); offline progress is the same rates integrated over elapsed time, clamped to a cap.
- **DOM + SVG UI** (`Source/UI/`) — a small hand-rolled `h()`/`patch` reconciler over a bespoke SVG factory graph. *Being re-platformed onto [Web Awesome](https://webawesome.com) components + Font Awesome Pro **Duotone** icons (buildless, vendored).*
- **Persistence** — `localStorage` behind a `StorageAdapter` seam; versioned save migrations; corruption falls back to a fresh game.

## Repository layout

```
Index.html              Single entry (mounts #App, loads Source/Main.js)
Manifest.webmanifest    PWA manifest        ServiceWorker.js   Offline shell cache
Source/
  Main.js               Composition root: bootstrap, RAF tick, autosave
  Engine/               Headless: GameState, Simulation (RateSolver/Tick/Offline),
                        Systems (Economy/Research/Expedition/Hero/Progression),
                        Content (data), Persistence, Intents, Reducer, Snapshot
  UI/                   DOM/SVG: App, Hud, GraphView, panels, Render helpers, Icons
  Styles/               Flat-fantasy CSS (parchment / iron / gold)
  Vendor/               Vendored Web Awesome + Font Awesome Pro (committed, buildless)
Tests/                  Zero-dependency node test runner + suites + probes
docs/superpowers/
  specs/                Design specs (MVP, UI re-platform)
  plans/                Phased, bite-sized implementation plans
```

## Develop

```bash
# Run it locally (no build step):
python3 -m http.server 8137
# then open http://localhost:8137/Index.html

# Run the test suite (zero deps, just node):
node Tests/RunAll.js
```

- The headless engine is covered by the test suite; UI/Web-Awesome behavior is verified in a real browser (it doesn't render under the node test shim).
- **Vendoring** (`Source/Vendor/`): the Web Awesome + Font Awesome Pro assets are committed for buildless serving. Refreshing them requires a Font Awesome npm token (private registry) in a **gitignored** `.npmrc` — see the `FontAwesome Pro` entry in personal memory; see `Source/Vendor/.npmrc.example`.
- **Deploy:** a buildless `rsync` of the static files to the dev host (credentials in personal memory). Bump `ServiceWorker.js`'s `CACHE` version on each deploy so clients pick up changes.

## Status

- **MVP — complete & live** (`v1.0.0-mvp`): full economy, research tree, expeditions, heroes, save/offline, and victory; ~250+ passing tests.
- **In progress — UI re-platform** to Web Awesome + Font Awesome Pro Duotone, in five shippable phases. See `docs/superpowers/plans/`.

## Design docs

Full design and rationale live in `docs/superpowers/specs/` (the MVP spec and the UI-re-platform spec) and the phase-by-phase build plans in `docs/superpowers/plans/`.
