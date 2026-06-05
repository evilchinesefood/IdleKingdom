<p align="center">
  <img src="Source/Assets/LogoDark.png" alt="IdleKingdom" width="300">
</p>

# IdleKingdom

A web-based **idle / automation game** set in the besieged fortress-city of **Yensburg** — rebuild a war economy from a single mine, automate production chains, forge gear, muster troops, and besiege six fallen territories until the Black Keep falls. Inspired by _Kingdom Inc._

**▶ Play:** https://dev.jdayers.com/kingdom/

---

## The loop

Harvest raw resources → run them through crafting chains → sell goods at the Market for **Gold** → spend **Research** to unlock machines, recipes, and bonuses → upgrade & expand → forge gear and muster troops in **Barracks** → your troops' power passively **besieges** the next territory, which falls and unlocks more factory content → reclaim all six territories to win. **True idle:** production — and the siege — keep accruing while you're away, with an offline catch-up on return.

## Tech & design

- **Vanilla JS, native ES modules, buildless** — no framework, no bundler, no runtime dependencies. Served as static files; `PascalCase` file & directory names.
- **Headless engine** (`Source/Engine/`) — a pure, DOM-free state machine, fully unit-tested. One-way data flow: the UI dispatches _intents_, the engine mutates state and emits a frozen _snapshot_, the UI renders the snapshot.
- **Rate-based steady-state simulation** — a topological solver computes per-node throughput (with fan-out conservation); offline progress is the same rates integrated over elapsed time, clamped to a cap.
- **DOM + SVG UI** (`Source/UI/`) — a small hand-rolled `h()`/`patch` reconciler over a bespoke SVG factory graph, built on [Web Awesome](https://webawesome.com) components + Font Awesome Pro **Duotone** icons (buildless, vendored); clean History-API path routing (no hash).
- **Persistence** — `localStorage` behind a `StorageAdapter` seam; versioned save migrations; corruption falls back to a fresh game.

## Repository layout

```
Index.html              Single entry (mounts #App, loads Source/Main.js)
Manifest.webmanifest    PWA manifest        ServiceWorker.js   Offline shell cache
Source/
  Main.js               Composition root: bootstrap, RAF tick, autosave
  Engine/               Headless: GameState, Simulation (RateSolver/Tick/Offline),
                        Systems (Economy/Research/Siege/Progression),
                        Content (data), Persistence, Intents, Reducer, Snapshot
  UI/                   DOM/SVG: App, Hud, GraphView, panels, Render helpers, Icons
  Styles/               Flat-fantasy CSS (parchment / iron / gold)
  Vendor/               Vendored Web Awesome + Font Awesome Pro (committed, buildless)
Tests/                  Zero-dependency node test runner + suites + probes
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
- **Routing** is clean path-based (`/kingdom/factory`, no `#`). Locally, enter via `/Index.html` and navigate through the UI — a hard refresh on a route path (e.g. `/factory`) 404s under `python3 -m http.server` (no URL rewrite); production serves it via the committed `.htaccess` rewrite.
- **Vendoring** (`Source/Vendor/`): the Web Awesome + Font Awesome Pro assets are committed for buildless serving. Refreshing them requires a Font Awesome npm token (private registry) in a **gitignored** `.npmrc` — see the `FontAwesome Pro` entry in personal memory; see `Source/Vendor/.npmrc.example`.
- **Deploy:** a buildless `rsync` of the static files to the dev host (credentials in personal memory). Bump `ServiceWorker.js`'s `CACHE` version on each deploy so clients pick up changes.

## Gameplay

- **Node-graph factory.** Place machines on an open canvas and wire outputs to inputs (drag from a port, or tap-port-then-port on touch). Each link carries a specific resource, and a producer's links auto-follow its current output.
- **Rate-based economy.** A steady-state solver computes each machine's throughput with demand-limited fan-in — multiple feeders share a consumer's demand, so nothing is over-produced. Every node shows its state at a glance: **MAX** (at capacity), **LOW** (running but under capacity), or **OFF** (connected but idle).
- **Research tree.** Spend **Research** to unlock machines, recipes, Market listings, production & market bonuses, gear tiers, troop types, and auto-sell.
- **War & siege.** Forge gear in tiers — base, then **Fine** (via Hardened Steel), then **Master** (via Gemstones) — and feed it to **Barracks** that muster troops: Militia, Soldiers, Knights. Your standing army's power passively besieges the next territory in order; when its siege bar fills, the territory falls, grants rewards, and unlocks more factory content. Reclaim all six — ending at the Black Keep — to win, then keep going in free-play.
- **Buildings (groups).** Marquee-drag or **Ctrl/Cmd-click** to select machines, then use the floating action bar to **Group / Copy / Paste / Delete**. Groups can be moved, resized, renamed, and **nested** — a group of machines plus other groups functions as one unit. Copy a group with or without its upgrade levels.
- **Build menu.** A bottom-centered bar showing every machine type (locked ones dimmed until researched); clicking an unlocked type pops up its placement options directly above it.
- **Quality of life.** Undo/redo and keyboard shortcuts (Ctrl+Z / Ctrl+Y, C / V copy-paste, Delete, arrow-nudge, Esc), snap-to-grid, optional always-on rates, and sound effects — all toggleable in Settings.
- **True idle + offline.** Production keeps accruing while the tab is closed; on return a "While you were away" summary credits up to **1 hour** of offline progress.
- **Installable PWA.** Runs offline via a service worker; `localStorage` save with versioned migrations (a corrupt save falls back to a fresh game).

## Machine types

| Machine          | Role                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gatherer**     | Harvests a raw resource (Iron Ore, Timber, Raw Hide, Coal Seam, Gemstone) — takes no inputs.                                                       |
| **Smelter**      | Smelts a recipe: Iron Bar, Plank, Leather, Refined Coal, or Steel.                                                                                 |
| **Workshop**     | Crafts components & gear: Fitting, Blade, Plating, Sword, Plate Armor, Shield, Parchment, and the Fine / Master gear tiers.                        |
| **Barracks**     | Musters troops from a recipe — converts a full gear set (sword + armor + shield) into Militia, Soldiers, or Knights, whose power drives the siege. |
| **Market**       | Sells incoming **listed** goods for Gold (plus a small Research tithe); listings are unlocked by research.                                         |
| **Scholar**      | Consumes Parchment to generate Research.                                                                                                           |
| **Storage Room** | A capacity-capped pass-through buffer — holds up to _level_ resource types in a shared pool and stockpiles surplus up to the cap.                  |

Two currencies drive it all: **Gold** (build, upgrade, copy) and **Research** (unlocks & bonuses). Troop power — not a currency — is what besieges and reclaims territory.
