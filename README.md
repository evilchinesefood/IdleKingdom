<p align="center">
  <img src="Source/Assets/LogoDark.png" alt="IdleKingdom" width="300">
</p>

# IdleKingdom

A web-based **idle / automation game** set in the besieged fortress-city of **Yensburg** — rebuild a war economy from a single mine, automate production chains, forge gear, muster troops, and besiege six fallen territories until the Black Keep falls. Inspired by _Kingdom Inc._

**▶ Play:** https://dev.jdayers.com/kingdom/

---

## The loop

Harvest raw resources → run them through crafting chains → sell goods at the Market for **Gold** → spend **Research** to unlock machines, recipes, listings, and bonuses → upgrade & expand → forge gear and muster troops in the **Barracks** → your standing army's **power** passively **besieges** the next territory, which falls and unlocks more content → reclaim all six territories — ending at the Black Keep — to win, then keep playing in free-play. **True idle:** production _and_ the siege keep accruing while the tab is closed, with an offline catch-up on return.

## Gameplay

- **Node-graph factory.** Place machines on an open canvas and wire outputs to inputs (drag from a port, or tap-port-then-port on touch). Each link carries one resource, and a producer's links auto-follow its current output.
- **Rate-based economy.** A steady-state solver computes each machine's throughput with demand-limited fan-in — multiple feeders share a consumer's demand, so nothing is over-produced. Every node shows its state at a glance: **MAX** (at capacity), **LOW** (running but under capacity), or **OFF** (connected but idle).
- **Research tree.** 25 nodes. Spend **Research** to unlock machines, recipes, Market listings, production & market bonuses, gear tiers, troop types, and auto-sell. The deepest tiers are gated behind reclaimed territories — two nodes (Master gear/Knights and auto-sell) need **Ironreach Mine**, three need **The High Wall**, and three free-play nodes open only after **The Black Keep** falls.
- **War & siege.** Forge gear in tiers — base, then **Fine** (via Hardened Steel), then **Master** (via Gemstones) — and feed full sets into **Barracks** that muster troops: **Militia** (power 1), **Soldiers** (power 3), **Knights** (power 9). Your standing army's total power passively besieges the next territory in order; when its siege bar fills, the territory falls, grants Gold + Research, and unlocks more content. Reclaim all six to win, then keep going.
- **Buildings (groups).** Marquee-drag or **Ctrl/Cmd-click** to multi-select machines, then use the floating action bar to **Group / Copy / Paste / Delete**. Groups can be moved, copied, resized, renamed, and **nested** — a group of machines plus other groups acts as one unit. Drag a multi-selection to move every member at once (a single undo step).
- **Build menu.** A bottom-centered bar showing every machine type (locked ones dimmed until researched); clicking an unlocked type pops up its placement options directly above it.
- **Storage Rooms.** A capacity-capped pass-through buffer — holds up to _level_-many distinct resource types in a shared pool and stockpiles surplus up to the cap. Available from the start.
- **Map view.** Zoom out to fit the whole factory at once; at far zoom the graph drops to a simplified, map-style level of detail (no per-node icons or ports) so hundreds of machines stay readable and fast.
- **Quality of life.** Undo/redo, keyboard shortcuts, snap-to-grid, optional always-on rate labels, and sound effects — all toggleable in Settings.
- **True idle + offline.** Production keeps accruing while the tab is closed; on return a "While you were away" summary credits up to **1 hour** of offline progress.
- **Installable PWA.** Runs offline via a service worker; **autosave** to `localStorage` with versioned save migrations (a corrupt save falls back to a fresh game).

## Keyboard shortcuts

| Keys                                    | Action                                              |
| --------------------------------------- | --------------------------------------------------- |
| `Ctrl/Cmd + Z`                          | Undo                                                |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | Redo                                                |
| `Ctrl/Cmd + C` / `Ctrl/Cmd + V`         | Copy / paste the selection                          |
| `G`                                     | Group the current multi-selection (2+ items)        |
| `F`                                     | Fit the whole factory to view                       |
| Arrow keys                              | Nudge the selected node or group by one grid cell   |
| `Delete` / `Backspace`                  | Remove the selected node, group, or link            |
| `Escape`                                | Cancel connect / build mode, or clear the selection |

When a single node is focused: `Enter` inspects it, `C` arms/connects a link, arrow keys move it, `Delete` removes it.

## Machine types

| Machine          | Role                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gatherer**     | Harvests a raw resource (Iron Ore, Timber, Raw Hide, Coal Seam, Gemstone) — takes no inputs.                                                       |
| **Smelter**      | Smelts a recipe: Iron Bar, Plank, Leather, Refined Coal, Steel, or Hardened Steel.                                                                 |
| **Workshop**     | Crafts components, gear, and Parchment: Fitting, Blade, Plating, Sword, Plate Armor, Shield — plus the Fine and Master gear tiers.                 |
| **Barracks**     | Musters troops from a recipe — converts a full gear set (sword + armor + shield) into Militia, Soldiers, or Knights, whose power drives the siege. |
| **Market**       | Sells incoming **listed** goods for Gold (plus a small passive Research tithe); listings are unlocked by research.                                 |
| **Scholar**      | Consumes Parchment to generate Research.                                                                                                           |
| **Storage Room** | A capacity-capped pass-through buffer — holds up to _level_ resource types in a shared pool and stockpiles surplus up to the cap.                  |

Two currencies drive it all: **Gold** (build, upgrade, copy) and **Research** (unlocks & bonuses). Troop power — not a currency — is what besieges and reclaims territory.

## Development

- **Buildless vanilla JS, native ES modules — no framework, no bundler, no runtime dependencies.** Served as static files; `PascalCase` file & directory names.
- **Headless engine** (`Source/Engine/`) — a pure, DOM-free state machine. The UI dispatches _intents_, the engine mutates state and emits a frozen _snapshot_, the UI renders the snapshot. A topological rate solver computes per-node throughput; offline progress is those same rates integrated over elapsed time, clamped to the cap.
- **DOM + SVG UI** (`Source/UI/`) — a small hand-rolled reconciler over a bespoke SVG factory graph, with retained-render node reuse and viewport culling so large factories stay smooth. Clean History-API path routing (no hash).

```bash
# Run it locally (no build step):
python3 -m http.server 8137
# then open http://localhost:8137/Index.html

# Run the full gate (zero deps, just node):
npm test
```

`npm test` runs the unit suite, a 13-step UI playthrough probe, and a headless engine→victory probe.

Routing is clean path-based (`/kingdom/factory`, no `#`). Locally, enter via `/Index.html` and navigate through the UI — a hard refresh on a deep route path 404s under `python3 -m http.server` (no URL rewrite); production serves it via the committed `.htaccess` rewrite.
