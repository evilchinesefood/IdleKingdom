# IdleKingdom MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the IdleKingdom MVP — a buildless vanilla-JS idle/automation game (node-graph production chains, rate-based steady-state simulation, true idle with offline catch-up, timed deterministic expeditions) playable through to a six-territory victory.

**Architecture:** A headless, DOM-free engine (GameState + rate solver + systems + persistence) unit-tested under node, behind a thin DOM+SVG UI that dispatches intents and renders frozen snapshots. Strict one-way data flow; no framework, no bundler, no npm dependencies.

**Tech Stack:** Vanilla JS (native ES modules), SVG + DOM UI, a zero-dependency node test runner, localStorage persistence via a StorageAdapter seam. PascalCase files & directories.

**Spec:** `docs/superpowers/specs/2026-05-31-idlekingdom-design.md`

---

> **⚠️ Execution-ordering note (from plan review):** Phase 3 (`Offline.js`) imports `ExpeditionSystem.tryResolve` and `EconomySystem.isListed`/`sellFromStockpile`, which are implemented in Phase 4 — so Phase 3's offline tasks depend on Phase 4. Execute in the order **P1 → P2 → P4 → P3 → P5 → P6**, or stub those two functions in Phase 3 and finish them in Phase 4. Phases 1, 2, 5, 6 keep their numbered order.

## Interface Contract & File Structure

_Authoritative names, signatures, and paths. Every task below builds against this._

I now have the complete spec. Let me produce the authoritative interface contract.

# IdleKingdom — Interface Contract (Authoritative)

> Single source of truth for file paths, names, and signatures. Every plan task builds against this verbatim. Source: `docs/superpowers/specs/2026-05-31-idlekingdom-design.md`. PascalCase files & dirs. Vanilla ES modules, no bundler, no framework, no deps.

---

## 1. File / Directory Tree (spec §9.1)

```
IdleKingdom/
├── Index.html                         Single entry; <div id="App"> mount + <script type="module" src="./Source/Main.js">.
├── Manifest.webmanifest               PWA manifest (relative paths; installable on mobile).
├── ServiceWorker.js                   Optional offline shell cache (relative URLs, no build step).
│
├── Source/
│   ├── Main.js                        Composition root: build adapters, load save, construct Game, mount App, start RAF loop.
│   │
│   ├── Engine/                        HEADLESS. No DOM, no globals, no Date.now — fully unit-testable in Node.
│   │   ├── Game.js                    Top-level facade: holds GameState, applies Intents, runs ticks, emits snapshots.
│   │   ├── GameState.js               Serializable state factory + invariants (NewGame seed, deep clone, freeze-for-snapshot).
│   │   ├── Intents.js                 Intent type constants + validators (PlaceNode, ConnectLink, UpgradeNode, BuyResearch, EquipItem, StartExpedition, ...).
│   │   ├── Reducer.js                 Pure (state, intent) -> state. The ONLY place state mutates from user input. Routes to systems.
│   │   ├── Snapshot.js                Builds the read-only view object the UI consumes (derived fields baked in).
│   │   │
│   │   ├── Simulation/
│   │   │   ├── RateSolver.js          Steady-state DAG solver: topo sort -> demand pull -> supply push -> backpressure -> rates.
│   │   │   ├── Topology.js            Cycle detection (Kahn's), topo-order cache, link/port validity checks.
│   │   │   ├── Tick.js                Advances stockpiles + currencies by solved rates over a dt; the per-frame integrator.
│   │   │   └── Offline.js             Offline catch-up: clamp dt to cap, integrate steady-state, fast-forward expeditions, build summary.
│   │   │
│   │   ├── Systems/
│   │   │   ├── EconomySystem.js       Market sink, gold/research tithe, sell-listing gating, upgrade-cost curve (base*1.15^level).
│   │   │   ├── ResearchSystem.js      Research-node graph: prereqs, costs, apply-unlock effects (recipes, listings, offline cap, bonuses).
│   │   │   ├── ExpeditionSystem.js    Timed runs: start gating (power>=req), countdown, on-complete rewards + territory reclaim.
│   │   │   ├── HeroSystem.js          Hero roster, equip-to-slot, heroPower computation, Renown-purchased levels.
│   │   │   └── ProgressionSystem.js   Territory reclaim -> applies interlock unlocks; win-condition check (all 6 reclaimed).
│   │   │
│   │   ├── Content/                   Static data-only modules (no logic). Canonical IDs/numbers from §3,§5,§6. SINGLE SOURCE OF TRUTH FOR IDs.
│   │   │   ├── Resources.js           5 raw + 5 intermediate + 4 component + 3 equipment goods; tiers, prices, icons.
│   │   │   ├── Machines.js            6 machine kinds; base output, rate-gain/level, upgrade base cost.
│   │   │   ├── Recipes.js             12 recipes: inputs{id:amt}, output, baseOut, crafterKind.
│   │   │   ├── ResearchNodes.js       15 backbone + 2 premium nodes: id, cost{research|renown}, prereqs[], effects[], gating.
│   │   │   ├── Territories.js         6 territories: requiredPower, durationMs, rewards, gear-tier unlock effects, flavor.
│   │   │   ├── Equipment.js           sword/armor/shield: slot, statType, baseStat, tier scaling.
│   │   │   ├── Heroes.js              Hero templates (hero_warden, hero_ranger, hero_smith): levelBonus per level, base power.
│   │   │   └── StartState.js          NewGame seed: pre-placed Miner->Smelter->Market, 25 gold, default listings/locks.
│   │   │
│   │   ├── Persistence/
│   │   │   ├── SaveManager.js         serialize(state)->json, deserialize(json)->state, runs migrations, validates version.
│   │   │   ├── Migrations.js          Ordered map {fromVersion: migrateFn}; chained to current SAVE_VERSION.
│   │   │   ├── StorageAdapter.js      Interface contract (JSDoc): get/set/remove. No impl.
│   │   │   ├── LocalStorageAdapter.js Browser impl over window.localStorage (try/catch, quota-safe).
│   │   │   └── MemoryStorageAdapter.js In-memory impl for tests (no browser needed).
│   │   │
│   │   └── Clock.js                   Injectable time source: now()->ms, plus FakeClock for deterministic tests.
│   │
│   ├── UI/                            DOM + SVG ONLY. Reads snapshots, dispatches intents. Never mutates engine state directly.
│   │   ├── App.js                     Shell + hash router; owns active screen; subscribes to snapshots; tooltip layer.
│   │   ├── Router.js                  Tiny hashchange router (#/factory, #/research, #/expeditions); no deps.
│   │   ├── GraphView.js               SVG factory canvas: render nodes/links, pan/zoom, connect (mouse-drag + touch tap-port-then-port).
│   │   ├── GraphInput.js              Pointer-event normalizer: unifies mouse/touch/pen into drag/pan/pinch/tap-port gestures.
│   │   ├── Hud.js                     Top bar: gold/research/renown counters + rates, save indicator, screen tabs.
│   │   ├── BuildMenu.js               Palette of placeable machines + recipe pickers; emits PlaceNode/SetRecipe intents.
│   │   ├── NodeInspector.js           Side panel for selected node: rate, level, upgrade button (live cost), recipe/assigned-raw.
│   │   ├── ResearchTree.js            SVG/DOM tree of nodes: locked/available/owned states, cost, BuyResearch intent.
│   │   ├── ExpeditionBoard.js         6 territory cards: required power vs hero power, duration, launch button, live countdown.
│   │   ├── HeroPanel.js               Hero roster, equip slots (weapon/armor/accessory), level-up (Renown), power readout.
│   │   ├── OfflineSummary.js          Modal on load if elapsed>threshold: gold/research/renown earned, expeditions resolved.
│   │   ├── Tooltip.js                 Contextual onboarding tooltips; anchored, dismissible, one-shot flags persisted in save.
│   │   └── Render/
│   │       ├── Dom.js                 Tiny h()/patch helpers (keyed diff) so screens re-render cheaply without a framework.
│   │       └── Svg.js                 SVG element builders + viewBox transform math (screen<->graph coords) for GraphView.
│   │
│   └── Styles/
│       ├── Reset.css                 Minimal normalize.
│       ├── Theme.css                 Parchment/iron/gold flat-fantasy tokens (CSS custom properties).
│       ├── Layout.css                Responsive shell, HUD, panels (flex/grid; mobile-first breakpoints).
│       └── Graph.css                 Node/link/port styling, drag-cursor, touch hit-areas (>=44px tap targets).
│
└── Tests/
    ├── Runner.js                      Zero-dep harness: describe/it/expect, async support, TAP-ish summary, exit code.
    ├── RunAll.js                      Imports every *.Test.js and runs; invoked by `node Tests/RunAll.js`.
    ├── RateSolver.Test.js             Solver correctness on the fixed starting graph + multi-input bottleneck graphs.
    ├── Tick.Test.js                   Integration of rates into stockpiles/currencies over known dt.
    ├── Offline.Test.js                Catch-up math incl. 3-day gap clamped to 8h cap; expedition fast-forward; auto-sell dump.
    ├── SaveManager.Test.js            Round-trip serialize/deserialize equality + migration chain from v1.
    ├── ExpeditionSystem.Test.js       Start gating, completion rewards, territory reclaim + interlock unlock.
    ├── ResearchSystem.Test.js         Prereq gating, cost spend, effect application (unlock recipe/listing/offline cap).
    ├── Economy.Test.js                Upgrade-cost curve, value-positivity of every recipe, sales tithe.
    ├── Progression.Test.js            Win condition fires only after all 6 territories reclaimed.
    └── Fixtures/
        ├── KnownGraph.js              Hand-computed expected-rate fixtures for the solver.
        └── SaveV1.json                A legacy v1 save blob to exercise migration.
```

---

## 2. Content Data Record Shapes (`Source/Engine/Content/*.js`)

These are the **canonical IDs and numbers**. All other modules reference these; never hardcode IDs elsewhere.

### 2.1 `Resources.js`

```js
/** @typedef {Object} Resource
 *  @property {string}  id          canonical id
 *  @property {string}  display     UI label
 *  @property {0|1|2|3} tier        0=raw 1=intermediate 2=component 3=equipment
 *  @property {string}  icon        emoji glyph
 *  @property {number|null} basePrice  Gold per unit at Market; null = never listed (parchment)
 */

/** Keyed map id -> Resource. */
export const RESOURCES = {
  // Tier 0 — Raw (5)
  iron_ore:  { id:"iron_ore",  display:"Iron Ore",    tier:0, icon:"⛏️", basePrice:0.5 },
  timber:    { id:"timber",    display:"Timber",      tier:0, icon:"🪵", basePrice:0.4 },
  hide:      { id:"hide",      display:"Raw Hide",    tier:0, icon:"🐗", basePrice:0.6 },
  coal_raw:  { id:"coal_raw",  display:"Coal Seam",   tier:0, icon:"🪨", basePrice:0.5 },
  gemstone:  { id:"gemstone",  display:"Gemstone",    tier:0, icon:"💎", basePrice:3.0 },
  // Tier 1 — Intermediate (5)
  iron_bar:  { id:"iron_bar",  display:"Iron Bar",    tier:1, icon:"🟫", basePrice:4.0 },
  plank:     { id:"plank",     display:"Plank",       tier:1, icon:"🟧", basePrice:3.5 },
  leather:   { id:"leather",   display:"Leather",     tier:1, icon:"🟤", basePrice:4.0 },
  coal:      { id:"coal",      display:"Refined Coal",tier:1, icon:"⚫", basePrice:1.5 },
  parchment: { id:"parchment", display:"Parchment",   tier:1, icon:"🧾", basePrice:null }, // research feedstock, never listed
  // Tier 2 — Component (4)
  steel:     { id:"steel",     display:"Steel",       tier:2, icon:"⬜", basePrice:14.0 },
  blade:     { id:"blade",     display:"Blade",       tier:2, icon:"🔪", basePrice:45.0 },
  plating:   { id:"plating",   display:"Plating",     tier:2, icon:"🔲", basePrice:45.0 },
  fitting:   { id:"fitting",   display:"Fitting",     tier:2, icon:"🔩", basePrice:16.0 },
  // Tier 3 — Equipment good (3)
  sword:     { id:"sword",     display:"Sword",       tier:3, icon:"⚔️", basePrice:140.0 },
  armor:     { id:"armor",     display:"Plate Armor", tier:3, icon:"🥋", basePrice:150.0 },
  shield:    { id:"shield",    display:"Shield",      tier:3, icon:"🛡️", basePrice:110.0 },
};
```

### 2.2 `Machines.js`

```js
/** @typedef {Object} Machine
 *  @property {string} kind        engine kind key (5 distinct: gatherer|smelter|workshop|market|scholar)
 *  @property {number} baseOutput  L1 output (units/s for gatherer/market/scholar; for crafters output is recipe-driven, baseOutput unused)
 *  @property {number} rateGain    added per level above 1
 *  @property {number} upgradeBase Gold base cost for cost(level)=upgradeBase*1.15^level
 */

/** Keyed map kind -> Machine. The 5 engine kinds; Miner/Forester/Trapper are the `gatherer` kind differentiated by node.resourceId. */
export const MACHINES = {
  gatherer: { kind:"gatherer", baseOutput:1.0, rateGain:0.5,  upgradeBase:15 },
  smelter:  { kind:"smelter",  baseOutput:0.0, rateGain:0.25, upgradeBase:25 }, // rateGain adds to recipe.baseOut
  workshop: { kind:"workshop", baseOutput:0.0, rateGain:0.20, upgradeBase:40 }, // rateGain adds to recipe.baseOut
  market:   { kind:"market",   baseOutput:5.0, rateGain:5.0,  upgradeBase:30 }, // total sell units/s, shared across links
  scholar:  { kind:"scholar",  baseOutput:0.5, rateGain:0.25, upgradeBase:35 }, // research/s, draws parchment 1:1
};

/** Gatherer UI variants (cosmetic; engine treats all as `gatherer`). Allowed resourceId assignments per variant. */
export const GATHERER_VARIANTS = {
  miner:    { label:"Miner",    resourceIds:["iron_ore","coal_raw","gemstone"] }, // coal_raw gated by res_coalworks; gemstone by t_ironreach
  forester: { label:"Forester", resourceIds:["timber"] },
  trapper:  { label:"Trapper",  resourceIds:["hide"] },
};
```

### 2.3 `Recipes.js`

```js
/** @typedef {Object} Recipe
 *  @property {string} id
 *  @property {"smelter"|"workshop"} crafterKind
 *  @property {Object<string,number>} inputs  resourceId -> amount per output unit
 *  @property {string} output     output resourceId
 *  @property {number} baseOut    output units/s at crafter L1 (before rateGain, before supply clamp)
 */

/** Keyed map id -> Recipe (12). */
export const RECIPES = {
  r_iron_bar:  { id:"r_iron_bar",  crafterKind:"smelter",  inputs:{ iron_ore:2 },           output:"iron_bar",  baseOut:0.5 },
  r_plank:     { id:"r_plank",     crafterKind:"smelter",  inputs:{ timber:2 },             output:"plank",     baseOut:0.5 },
  r_leather:   { id:"r_leather",   crafterKind:"smelter",  inputs:{ hide:2 },               output:"leather",   baseOut:0.5 },
  r_coal:      { id:"r_coal",      crafterKind:"smelter",  inputs:{ coal_raw:1 },           output:"coal",      baseOut:1.0 },
  r_steel:     { id:"r_steel",     crafterKind:"smelter",  inputs:{ iron_bar:2, coal:1 },   output:"steel",     baseOut:0.25 },
  r_blade:     { id:"r_blade",     crafterKind:"workshop", inputs:{ steel:2, plank:1 },     output:"blade",     baseOut:0.2 },
  r_plating:   { id:"r_plating",   crafterKind:"workshop", inputs:{ steel:2, leather:1 },   output:"plating",   baseOut:0.2 },
  r_fitting:   { id:"r_fitting",   crafterKind:"workshop", inputs:{ iron_bar:1, leather:1 },output:"fitting",   baseOut:0.25 },
  r_sword:     { id:"r_sword",     crafterKind:"workshop", inputs:{ blade:1, fitting:1 },   output:"sword",     baseOut:0.1 },
  r_armor:     { id:"r_armor",     crafterKind:"workshop", inputs:{ plating:2, fitting:1 }, output:"armor",     baseOut:0.1 },
  r_shield:    { id:"r_shield",    crafterKind:"workshop", inputs:{ plating:1, plank:2 },   output:"shield",    baseOut:0.1 },
  r_parchment: { id:"r_parchment", crafterKind:"workshop", inputs:{ timber:1 },             output:"parchment", baseOut:0.5 },
};
```

### 2.4 `ResearchNodes.js`

```js
/** @typedef {Object} ResearchEffect  one of the tagged effect shapes below
 *  Effect tags (exhaustive):
 *    { type:"unlockMachine",  kind:string }                       // e.g. "scholar"
 *    { type:"unlockRecipe",   recipeId:string }                   // adds to recipesUnlocked
 *    { type:"unlockListing",  resourceIds:string[] }              // adds to marketListings
 *    { type:"enableGathererResource", resourceId:string }         // allow miner assign (e.g. coal_raw)
 *    { type:"productionBonus", kind:string, mult:number }         // multiplies productionBonuses[kind] (e.g. smelter ×1.25)
 *    { type:"globalRateBonus", mult:number }                      // multiplies gatherer+smelter+workshop bonuses
 *    { type:"marketCapacityBonus", mult:number }                  // folds into productionBonuses.market
 *    { type:"titheRate",      value:number }                      // sets unlocks.titheRate (0.07)
 *    { type:"offlineCapHours",value:number }                      // sets unlocks.offlineCapHours (12 | 24)
 *    { type:"scholarBonus",   mult:number }                       // multiplies productionBonuses.scholar
 *    { type:"heroSlot",       count:number }                      // +1 hero slot
 *    { type:"autoSell",       enabled:true }                      // res_quartermaster auto-sell
 */
/** @typedef {Object} ResearchNode
 *  @property {string}  id
 *  @property {string}  name
 *  @property {"research"|"renown"} currency
 *  @property {number}  cost
 *  @property {string[]} prereqs               other research node ids
 *  @property {ResearchEffect[]} effects
 *  @property {string|null} requiresTerritory  e.g. "t_smithyward" (T2) | "t_ironreach" (T4) | null
 *  @property {string}  flavor
 */

/** Keyed map id -> ResearchNode. 15 backbone (currency:"research") + 2 premium (currency:"renown"). */
export const RESEARCH_NODES = {
  res_scholar:          { id:"res_scholar",          currency:"research", cost:9,    prereqs:[],                                  requiresTerritory:null },
  res_lumber:           { id:"res_lumber",           currency:"research", cost:25,   prereqs:["res_scholar"],                     requiresTerritory:null },
  res_tannery:          { id:"res_tannery",          currency:"research", cost:25,   prereqs:["res_scholar"],                     requiresTerritory:null },
  res_coalworks:        { id:"res_coalworks",        currency:"research", cost:40,   prereqs:["res_lumber"],                      requiresTerritory:null },
  res_steelmaking:      { id:"res_steelmaking",      currency:"research", cost:120,  prereqs:["res_coalworks"],                   requiresTerritory:null },
  res_fittings:         { id:"res_fittings",         currency:"research", cost:180,  prereqs:["res_steelmaking"],                 requiresTerritory:null },
  res_open_market:      { id:"res_open_market",      currency:"research", cost:90,   prereqs:["res_steelmaking"],                 requiresTerritory:null },
  res_smithing:         { id:"res_smithing",         currency:"research", cost:250,  prereqs:["res_steelmaking"],                 requiresTerritory:null },
  res_armory:           { id:"res_armory",           currency:"research", cost:400,  prereqs:["res_smithing","res_fittings"],     requiresTerritory:null },
  res_efficient_forges: { id:"res_efficient_forges", currency:"research", cost:300,  prereqs:["res_steelmaking"],                 requiresTerritory:null },
  res_assembly_jigs:    { id:"res_assembly_jigs",    currency:"research", cost:550,  prereqs:["res_armory"],                      requiresTerritory:null },
  res_trade_routes:     { id:"res_trade_routes",     currency:"research", cost:700,  prereqs:["res_open_market"],                 requiresTerritory:null },
  res_ledgers:          { id:"res_ledgers",          currency:"research", cost:600,  prereqs:["res_trade_routes"],                requiresTerritory:null },
  res_logistics:        { id:"res_logistics",        currency:"research", cost:1800, prereqs:["res_ledgers","res_assembly_jigs"], requiresTerritory:null },
  res_grand_design:     { id:"res_grand_design",     currency:"research", cost:5000, prereqs:["res_logistics","res_efficient_forges"], requiresTerritory:null },
  // Premium (renown)
  res_war_college:      { id:"res_war_college",      currency:"renown",   cost:30,   prereqs:["res_armory"],                      requiresTerritory:"t_smithyward" }, // T2
  res_quartermaster:    { id:"res_quartermaster",    currency:"renown",   cost:60,   prereqs:["res_war_college","res_trade_routes"], requiresTerritory:"t_ironreach" }, // T4
};
```

Effect mapping (authoritative — implement in `ResearchSystem.applyEffects`):
- `res_scholar` → `unlockMachine scholar`, `unlockRecipe r_parchment`
- `res_lumber` → `unlockMachine forester`*(gatherer)*, `unlockRecipe r_plank`
- `res_tannery` → `unlockMachine trapper`*(gatherer)*, `unlockRecipe r_leather`
- `res_coalworks` → `unlockRecipe r_coal`, `enableGathererResource coal_raw`
- `res_steelmaking` → `unlockRecipe r_steel`
- `res_fittings` → `unlockRecipe r_fitting`, `unlockListing [fitting]`
- `res_open_market` → `unlockListing [coal, iron_bar, plank, leather, steel]`
- `res_smithing` → `unlockRecipe r_blade`, `unlockRecipe r_plating`, `unlockListing [blade, plating]`
- `res_armory` → `unlockRecipe r_sword`, `unlockRecipe r_armor`, `unlockRecipe r_shield`, `unlockListing [sword, armor, shield]`
- `res_efficient_forges` → `productionBonus smelter ×1.25`
- `res_assembly_jigs` → `productionBonus workshop ×1.25`
- `res_trade_routes` → `marketCapacityBonus ×1.30`, `titheRate 0.07`
- `res_ledgers` → `offlineCapHours 12`
- `res_logistics` → `offlineCapHours 24`, `globalRateBonus ×1.10`
- `res_grand_design` → `globalRateBonus ×1.20` (all production incl. market), `scholarBonus ×1.50`
- `res_war_college` → `heroSlot +1`
- `res_quartermaster` → `autoSell enabled`

### 2.5 `Territories.js`

```js
/** @typedef {Object} TerritoryReward { gold:number, research:number, renown:number }
 *  @typedef {Object} Territory
 *  @property {string}  id
 *  @property {string}  name
 *  @property {string}  flavor
 *  @property {number}  order            1..6, reclaim order
 *  @property {number}  requiredPower
 *  @property {number}  durationMs
 *  @property {TerritoryReward} rewards
 *  @property {ResearchEffect[]} unlocks   gear-tier/listing/bonus/heroSlot/offlineCap effects fired on reclaim
 *  @property {string|null} grantsHero     hero templateId granted on reclaim (t_gatehouse -> hero_warden) | null
 *  @property {boolean} isVictory          true only for t_blackkeep
 */

/** Keyed map id -> Territory (6), reclaim order t_gatehouse -> t_blackkeep. */
export const TERRITORIES = {
  t_gatehouse:  { id:"t_gatehouse",  order:1, requiredPower:30,  durationMs:120000,  rewards:{gold:50,   research:20,  renown:10}, grantsHero:"hero_warden", isVictory:false,
                  unlocks:[ {type:"productionBonus", kind:"gatherer", mult:1.10} ] },
  t_smithyward: { id:"t_smithyward", order:2, requiredPower:38,  durationMs:300000,  rewards:{gold:120,  research:40,  renown:15}, grantsHero:null, isVictory:false,
                  unlocks:[ {type:"unlockGearTier", itemIds:["sword","shield"], tier:2}, {type:"productionBonus", kind:"smelter", mult:1.10} ] },
  t_oldmarket:  { id:"t_oldmarket",  order:3, requiredPower:50,  durationMs:600000,  rewards:{gold:300,  research:80,  renown:25}, grantsHero:null, isVictory:false,
                  unlocks:[ {type:"unlockGearTier", itemIds:["armor"], tier:2}, {type:"marketCapacityBonus", mult:1.15} ] },
  t_ironreach:  { id:"t_ironreach",  order:4, requiredPower:65,  durationMs:1200000, rewards:{gold:700,  research:150, renown:35}, grantsHero:null, isVictory:false,
                  unlocks:[ {type:"enableGathererResource", resourceId:"gemstone"}, {type:"unlockGearTier", itemIds:["sword","shield"], tier:3}, {type:"productionBonus", kind:"smelter", mult:1.20} ] },
  t_highwall:   { id:"t_highwall",   order:5, requiredPower:85,  durationMs:2400000, rewards:{gold:1500, research:300, renown:50}, grantsHero:null, isVictory:false,
                  unlocks:[ {type:"unlockGearTier", itemIds:["armor"], tier:3}, {type:"heroSlot", count:1}, {type:"offlineCapHours", value:12} ] },
  t_blackkeep:  { id:"t_blackkeep",  order:6, requiredPower:110, durationMs:3600000, rewards:{gold:4000, research:600, renown:70}, grantsHero:null, isVictory:true,
                  unlocks:[] },
};
```

Additional effect tag used only by territories: `{ type:"unlockGearTier", itemIds:string[], tier:2|3 }` (adds `{itemId,tier}` pairs to `unlocks.gearTiersUnlocked`).

### 2.6 `Equipment.js`

```js
/** @typedef {Object} EquipmentItem
 *  @property {string} itemId       resource id reused as equipment (sword|armor|shield)
 *  @property {"weapon"|"armor"|"accessory"} slot
 *  @property {"attack"|"defense"} statType
 *  @property {number} baseStat     T1 stat; stat at tier T = baseStat * T
 */

/** Keyed map itemId -> EquipmentItem (3). stat(item,tier)=baseStat*tier; counts 1:1 toward heroPower. */
export const EQUIPMENT = {
  sword:  { itemId:"sword",  slot:"weapon",    statType:"attack",  baseStat:10 }, // T1=10 T2=20 T3=30
  armor:  { itemId:"armor",  slot:"armor",     statType:"defense", baseStat:12 }, // T1=12 T2=24 T3=36
  shield: { itemId:"shield", slot:"accessory", statType:"defense", baseStat:8  }, // T1=8  T2=16 T3=24
};

/** Helper required: itemStat(itemId, tier) -> number === EQUIPMENT[itemId].baseStat * tier */
```

### 2.7 `Heroes.js`

```js
/** @typedef {Object} HeroTemplate
 *  @property {string} id            hero_warden | hero_ranger | hero_smith
 *  @property {string} name
 *  @property {number} basePower     base before gear+level (0 in MVP; power from gear+level)
 *  @property {number} levelStep     +heroPower per level (5)
 *  @property {("territory"|"renown")} unlockKind
 *  @property {string|null} unlockTerritory   reclaim gating (hero_ranger->t_oldmarket, hero_smith->t_highwall); hero_warden granted, null
 *  @property {number} unlockRenownCost        0 for warden; 40 ranger; 80 smith
 */

/** Keyed map id -> HeroTemplate (3). heroLevel cost(L->L+1) = 5*L renown; each level +5 power. */
export const HEROES = {
  hero_warden: { id:"hero_warden", name:"The Warden", basePower:0, levelStep:5, unlockKind:"territory", unlockTerritory:"t_gatehouse", unlockRenownCost:0 },
  hero_ranger: { id:"hero_ranger", name:"The Ranger", basePower:0, levelStep:5, unlockKind:"renown",    unlockTerritory:"t_oldmarket", unlockRenownCost:40 },
  hero_smith:  { id:"hero_smith",  name:"The Smith",  basePower:0, levelStep:5, unlockKind:"renown",    unlockTerritory:"t_highwall",  unlockRenownCost:80 },
};
```

### 2.8 `StartState.js` (seed object)

```js
/** Pre-placed Miner -> Smelter(r_iron_bar) -> Market; 25 gold; iron_bar listed. Mirrors save schema §9.2. */
export const START_STATE = {
  currencies: { gold:25.0, research:0.0, renown:0.0 },
  graph: {
    nodes: [
      { id:"n_miner_0",   kind:"gatherer", level:1, resourceId:"iron_ore", recipeId:null,        stockpile:{ iron_ore:0.0 }, pos:{x:120,y:200} },
      { id:"n_smelter_0", kind:"smelter",  level:1, resourceId:null,       recipeId:"r_iron_bar",stockpile:{ iron_bar:0.0 }, pos:{x:360,y:200} },
      { id:"n_market_0",  kind:"market",   level:1, resourceId:null,       recipeId:null,        stockpile:{},               pos:{x:600,y:200} },
    ],
    links: [
      { id:"l_0", from:"n_miner_0",   to:"n_smelter_0", resourceId:"iron_ore" },
      { id:"l_1", from:"n_smelter_0", to:"n_market_0",  resourceId:"iron_bar" },
    ],
    nextNodeSeq:1, nextLinkSeq:2,
  },
  unlocks: {
    researchOwned:[], recipesUnlocked:["r_iron_bar"], machinesUnlocked:["gatherer","smelter","market"],
    marketListings:["iron_ore","timber","hide","coal_raw","gemstone","iron_bar"],
    titheRate:0.05, offlineCapHours:8,
    productionBonuses:{ gatherer:1.0, smelter:1.0, workshop:1.0, market:1.0, scholar:1.0 },
    gearTiersUnlocked:[ {itemId:"sword",tier:1},{itemId:"armor",tier:1},{itemId:"shield",tier:1} ],
    autoSell:false, heroSlots:1,
  },
  heroes: [ { id:"h_0", templateId:"hero_warden", level:1, equipped:{ weapon:null, armor:null, accessory:null } } ],
  expeditions: { active:null, completed:[] },
  territories: { reclaimed:[], available:["t_gatehouse"] },
  meta: { tutorialFlags:{ seenGoldTip:false, seenUpgradeTip:false, seenConnectTip:false }, won:false, createdAt:0, playtimeMs:0 },
};
```

> Note: in a brand-new game `expeditions.active` is `null`. The §9.2 illustrative blob shows an in-flight expedition only to document the field shape; the canonical seed has no active expedition.

The `content` object passed to `new Game({content})` aggregates all of the above:

```js
/** @typedef {Object} Content
 *  @property {Object<string,Resource>}     resources
 *  @property {Object<string,Machine>}      machines
 *  @property {Object<string,Recipe>}       recipes
 *  @property {Object<string,ResearchNode>} researchNodes
 *  @property {Object<string,Territory>}    territories
 *  @property {Object<string,EquipmentItem>} equipment
 *  @property {Object<string,HeroTemplate>} heroes
 *  @property {Object} startState
 */
```

---

## 3. GameState (`GameState.js`) — matches save schema §9.2

```js
/** @typedef {Object} Node
 *  @property {string} id
 *  @property {"gatherer"|"smelter"|"workshop"|"market"|"scholar"} kind
 *  @property {number} level
 *  @property {string|null} resourceId   gatherer assignment | null
 *  @property {string|null} recipeId     crafter recipe | null
 *  @property {Object<string,number>} stockpile  sparse: only accrued resources
 *  @property {{x:number,y:number}} pos
 */
/** @typedef {Object} Link { id:string, from:string, to:string, resourceId:string } */
/** @typedef {Object} EquipSlot { itemId:string, tier:number } | null */
/** @typedef {Object} Hero { id:string, templateId:string, level:number, equipped:{weapon:EquipSlot, armor:EquipSlot, accessory:EquipSlot} } */
/** @typedef {Object} ActiveExpedition { territoryId:string, startedAt:number, durationMs:number, heroId:string } | null */
/** @typedef {Object} CompletedExpedition { territoryId:string, completedAt:number } */

/** @typedef {Object} GameState
 *  @property {number} version           === SAVE_VERSION (3)
 *  @property {number} savedAt           diagnostic ms
 *  @property {number} lastSeen          wall-clock ms for offline catch-up
 *  @property {{gold:number, research:number, renown:number}} currencies
 *  @property {{nodes:Node[], links:Link[], nextNodeSeq:number, nextLinkSeq:number}} graph
 *  @property {Object} unlocks {
 *     researchOwned:string[],
 *     recipesUnlocked:string[],          // NewGame === ["r_iron_bar"]
 *     machinesUnlocked:string[],         // NewGame === ["gatherer","smelter","market"]
 *     marketListings:string[],           // NewGame === ["iron_ore","timber","hide","coal_raw","gemstone","iron_bar"]
 *     titheRate:number,                  // 0.05 -> 0.07
 *     offlineCapHours:number,            // 8 -> 12 -> 24
 *     productionBonuses:{gatherer:number,smelter:number,workshop:number,market:number,scholar:number},
 *     gearTiersUnlocked:{itemId:string,tier:number}[],
 *     autoSell:boolean,
 *     heroSlots:number
 *  }
 *  @property {Hero[]} heroes
 *  @property {{active:ActiveExpedition, completed:CompletedExpedition[]}} expeditions
 *  @property {{reclaimed:string[], available:string[]}} territories
 *  @property {{tutorialFlags:Object<string,boolean>, won:boolean, createdAt:number, playtimeMs:number}} meta
 *  @property {Object} [_solved]         NON-PERSISTED cached solver result; stripped before serialize
 */

/** Factory: returns a fresh seeded GameState (deep-copied from START_STATE, version=SAVE_VERSION, timestamps stamped from clock). */
export function NewGame(clock) { /* ... */ }
/** Deep structural clone (no shared refs); excludes _solved. */
export function clone(state) { /* ... */ }
/** Returns a deep-frozen copy for snapshot use. */
export function freeze(state) { /* ... */ }
/** Structural validation: required keys, finite currencies, node/link referential integrity. Returns boolean. */
export function validate(state) { /* ... */ }
```

---

## 4. Clock (`Clock.js`)

```js
/** Real time source. */
export class Clock { now() { return Date.now(); } }       // -> number (ms)

/** Deterministic test clock. */
export class FakeClock {
  constructor(startMs = 0) {}
  now() {}                  // -> number (ms)
  setNow(ms) {}             // set absolute
  advance(ms) {}            // add to current; returns new now
}
```

---

## 5. StorageAdapter (`Persistence/`)

```js
/** @interface StorageAdapter (StorageAdapter.js — JSDoc contract, no impl)
 *  get(key:string)          -> string|null
 *  set(key:string, value:string) -> void   (may throw on quota; callers try/catch)
 *  remove(key:string)       -> void
 */

/** MemoryStorageAdapter.js — backing Map, no browser. */
export class MemoryStorageAdapter {
  constructor() {}
  get(key) {}     // -> string|null
  set(key, value) {}
  remove(key) {}
}

/** LocalStorageAdapter.js — window.localStorage; all ops try/catch; set returns boolean ok or throws caught by SaveManager/Main. */
export class LocalStorageAdapter {
  constructor(storage = window.localStorage) {}
  get(key) {}     // -> string|null
  set(key, value) {}
  remove(key) {}
}
```

---

## 6. Topology (`Simulation/Topology.js`)

```js
/** Kahn's algorithm. Returns node ids in topo order. THROWS Error("cycle") if a cycle exists. */
export function topoSort(nodes, links) { /* -> string[] orderedIds */ }

/** True if adding link from->to keeps the graph acyclic (used by ConnectLink validation). */
export function wouldStayAcyclic(nodes, links, from, to) { /* -> boolean */ }

/** Port validity: a candidate link from->to carrying resourceId is structurally legal
 *  (producer can output resourceId, consumer can accept it, not a duplicate, from!=to). */
export function isValidLink(state, content, from, to, resourceId) { /* -> boolean */ }

/** Cached topo order keyed off graph structure (rebuilt when topology changes). */
export function orderFor(state) { /* -> string[] */ }
```

---

## 7. RateSolver (`Simulation/RateSolver.js`)

```js
/** @typedef {Object} Solved
 *  @property {Object<string,number>} capacityByNode            nodeId -> capacity units/s
 *  @property {Object<string,Object<string,number>>} availableOut nodeId -> {resourceId: units/s produced}
 *  @property {Object<string,number>} linkFlow                  linkId -> units/s actually flowing
 *  @property {Object<string,Object<string,number>>} surplusRate nodeId -> {resourceId: units/s to own stockpile}
 *  @property {number} goldRate                                 Σ market gold/s
 *  @property {number} researchRate                             Σ scholar + Σ market tithe research/s
 *  @property {Object<string,Object<string,number>>} perNodeDraw nodeId -> {resourceId: units/s consumed}
 */

/** Single O(N+E) two-pass steady-state solve. Pure; reads state.graph + state.unlocks + content. */
export function solve(state, content) { /* -> Solved */ }

/** Capacity per kind (level adds to the relevant base; bonus = productionBonuses[kind] or 1.0):
 *   gatherer: (machine.baseOutput + machine.rateGain*(level-1)) * bonus
 *   smelter|workshop: (recipe.baseOut + machine.rateGain*(level-1)) * bonus      // level adds to recipe base output
 *   market:  (machine.baseOutput + machine.rateGain*(level-1)) * bonus           // shared across input links; bonus carries res_trade_routes +30% & T3 +15%
 *   scholar: (machine.baseOutput + machine.rateGain*(level-1)) * bonus           // research/s, draws parchment 1:1
 * Crafter throughput clamp: actual = min(capacity, min over inputs_i(incomingSupply_i / inputAmount_i)).
 * Market overflow: scale = total>cap ? cap/total : 1.0; sells only listed resources; goldRate += sold*basePrice; researchRate += goldRate*titheRate.
 */
export function capacity(node, state, content) { /* -> number */ }
```

---

## 8. Tick (`Simulation/Tick.js`)

```js
/** Per-frame integrator. Mutates state in place over dtSeconds using the solved rates.
 *  gold     += solved.goldRate     * dt
 *  research += solved.researchRate * dt
 *  for (nodeId, {res:rate}) in solved.surplusRate: node.stockpile[res] += rate * dt
 *  if expeditions.active: advance countdown; ExpeditionSystem resolves when elapsed >= durationMs. */
export function applyTick(state, solved, dtSeconds) { /* -> void (mutates state) */ }
```

---

## 9. Offline (`Simulation/Offline.js`)

```js
/** @typedef {Object} OfflineSummary
 *  @property {number} appliedMs                          dt actually integrated (post-clamp)
 *  @property {boolean} clamped                           true if raw elapsed exceeded the cap
 *  @property {{gold:number, research:number, renown:number}} gained
 *  @property {{territoryId:string, rewards:object}[]} expeditionsResolved
 */

/** One-shot offline catch-up. Clamps (nowMs - state.lastSeen) to offlineCapHours*3600*1000,
 *  integrates steady-state rates exactly, fast-forwards an in-flight expedition (deterministic
 *  resolve if startedAt+durationMs <= nowMs), applies reclaim unlocks, builds and returns summary.
 *  Sets state.lastSeen = nowMs. Auto-sell (res_quartermaster) dump applied exactly once if owned. */
export function applyOffline(state, content, nowMs) { /* -> OfflineSummary */ }
```

---

## 10. SaveManager (`Persistence/SaveManager.js`) + Migrations

```js
export const SAVE_VERSION = 3;
export const SAVE_KEY = "idlekingdom.save";

/** Strips _solved, stamps savedAt + lastSeen, JSON.stringify. */
export function serialize(state) { /* -> string */ }

/** JSON.parse -> read version (default 1) -> chain migrations to SAVE_VERSION (assert +1 each hop)
 *  -> validate(state) -> on failure log warn + return NewGame(). Never throws to caller. */
export function deserialize(json, clock) { /* -> GameState */ }
```

```js
/** Migrations.js — ordered registry; each fn: blob@N -> blob@N+1.
 *  1->2 adds meta.tutorialFlags; 2->3 splits flat offlineCap into unlocks.offlineCapHours + productionBonuses. */
export const MIGRATIONS = { 1: migrate1to2, 2: migrate2to3 };  // { [fromVersion:number]: (blob) => blob }
export function migrate1to2(blob) { /* -> blob v2 */ }
export function migrate2to3(blob) { /* -> blob v3 */ }
```

---

## 11. Systems (`Systems/*.js`)

### 11.1 `EconomySystem.js`

```js
/** cost(level) = machine.upgradeBase * 1.15^level   (level = current; cost is to buy next). */
export function upgradeCost(kind, level, content) { /* -> number (Gold) */ }
/** True if state.currencies.gold >= upgradeCost(node.kind, node.level). */
export function canUpgrade(state, content, nodeId) { /* -> boolean */ }
/** Spends gold, increments node.level; marks solver dirty. Mutates. */
export function applyUpgrade(state, content, nodeId) { /* -> void */ }
/** True if resourceId is in unlocks.marketListings AND content.resources[id].basePrice != null. */
export function isListed(state, content, resourceId) { /* -> boolean */ }
/** Manual sell from a node's stockpile (SellFromStockpile intent): converts stockpile units to gold+tithe at basePrice. Mutates. */
export function sellFromStockpile(state, content, nodeId, resId) { /* -> void */ }
```

### 11.2 `ResearchSystem.js`

```js
/** True if node exists, not owned, prereqs all owned, requiresTerritory (if any) reclaimed,
 *  and currencies[node.currency] >= node.cost. */
export function canBuyResearch(state, content, id) { /* -> boolean */ }
/** Spends node.cost in node.currency, pushes id to researchOwned, applies effects, marks solver dirty. Mutates. */
export function buyResearch(state, content, id) { /* -> void */ }
/** Applies a ResearchEffect[] to state.unlocks (recipes/listings/bonuses/caps/tithe/heroSlots/autoSell). Mutates. Shared with ProgressionSystem. */
export function applyEffects(state, content, effects) { /* -> void */ }
/** Node UI state. */
export function researchStatus(state, content, id) { /* -> "owned"|"available"|"locked" */ }
```

### 11.3 `ExpeditionSystem.js`

```js
/** Lowest un-reclaimed territory id (the only legal target), or null if all reclaimed. */
export function nextTerritory(state, content) { /* -> string|null */ }
/** True if no active expedition, territoryId === nextTerritory, hero exists, heroPower(hero) >= requiredPower. */
export function canStart(state, content, territoryId, heroId) { /* -> boolean */ }
/** Sets expeditions.active = {territoryId, startedAt:clockNow, durationMs, heroId}. Mutates. */
export function startExpedition(state, content, territoryId, heroId, nowMs) { /* -> void */ }
/** If active && nowMs >= startedAt+durationMs: grant rewards, reclaim territory (ProgressionSystem.reclaim),
 *  push to completed, clear active. Deterministic success. Returns resolved descriptor or null. Mutates. */
export function tryResolve(state, content, nowMs) { /* -> {territoryId, rewards}|null */ }
/** Remaining ms for the active run, or 0. */
export function timeRemaining(state, nowMs) { /* -> number */ }
```

### 11.4 `HeroSystem.js`

```js
/** heroPower = Σ(itemStat(equipped[slot].itemId, equipped[slot].tier)) + level * 5  (basePower=0). */
export function heroPower(state, content, heroId) { /* -> number */ }
/** Renown cost L->L+1 = 5 * currentLevel. */
export function levelCost(level) { /* -> number (Renown) */ }
/** True if renown >= levelCost(hero.level). */
export function canLevelUp(state, content, heroId) { /* -> boolean */ }
/** Spends renown, hero.level += 1. Mutates. */
export function levelUp(state, content, heroId) { /* -> void */ }
/** True if itemId's tier is in unlocks.gearTiersUnlocked, item slot matches, hero exists. */
export function canEquip(state, content, heroId, slot, itemId, tier) { /* -> boolean */ }
/** Sets hero.equipped[slot] = {itemId, tier} (replaces, permanent, not consumed). Mutates. */
export function equip(state, content, heroId, slot, itemId, tier) { /* -> void */ }
/** True if renown >= template.unlockRenownCost AND template.unlockTerritory reclaimed AND heroes.length < unlocks.heroSlots. */
export function canRecruit(state, content, templateId) { /* -> boolean */ }
/** Spends renown, pushes new Hero {id, templateId, level:1, empty slots}. Mutates. */
export function recruit(state, content, templateId) { /* -> void */ }
```

### 11.5 `ProgressionSystem.js`

```js
/** Moves territoryId reclaimed->[], removes from available, adds next territory to available,
 *  applies territory.unlocks via ResearchSystem.applyEffects, grants hero if grantsHero set,
 *  sets meta.won if isVictory. Mutates. */
export function reclaim(state, content, territoryId) { /* -> void */ }
/** True iff all 6 territory ids are in territories.reclaimed. */
export function checkWin(state, content) { /* -> boolean */ }
```

---

## 12. Intents (`Engine/Intents.js`) + Reducer (`Engine/Reducer.js`)

```js
/** Intent type-tag constants. */
export const INTENT = {
  PlaceNode:         "PlaceNode",
  ConnectLink:       "ConnectLink",
  UpgradeNode:       "UpgradeNode",
  SetRecipe:         "SetRecipe",
  BuyResearch:       "BuyResearch",
  EquipItem:         "EquipItem",
  StartExpedition:   "StartExpedition",
  SellFromStockpile: "SellFromStockpile",
  LevelUpHero:       "LevelUpHero",
  RecruitHero:       "RecruitHero",
  SetGathererResource:"SetGathererResource",
  RemoveNode:        "RemoveNode",
  RemoveLink:        "RemoveLink",
  DismissTooltip:    "DismissTooltip",
};

/** Intent union — exact field names:
 *  { type:"PlaceNode",          kind:string, resourceId?:string, recipeId?:string, pos:{x,y} }
 *  { type:"ConnectLink",        from:string, to:string, resourceId:string }
 *  { type:"UpgradeNode",        nodeId:string }
 *  { type:"SetRecipe",          nodeId:string, recipeId:string }
 *  { type:"BuyResearch",        nodeId:string }                       // nodeId = research node id
 *  { type:"EquipItem",          heroId:string, slot:string, itemId:string, tier:number }
 *  { type:"StartExpedition",    territoryId:string, heroId:string }
 *  { type:"SellFromStockpile",  nodeId:string, resId:string }
 *  { type:"LevelUpHero",        heroId:string }
 *  { type:"RecruitHero",        templateId:string }
 *  { type:"SetGathererResource",nodeId:string, resourceId:string }
 *  { type:"RemoveNode",         nodeId:string }
 *  { type:"RemoveLink",         linkId:string }
 *  { type:"DismissTooltip",     flag:string }
 */

/** Per-intent structural validators (cheap shape checks only; legality is the reducer/systems' job). */
export function validate(intent) { /* -> { ok:boolean, error?:string } */ }
```

> `BuyResearch` uses field name `nodeId` carrying the research-node id (per spec §9.4 example `{type:"BuyResearch",nodeId}`). The reducer routes it to `ResearchSystem.canBuyResearch(state, content, intent.nodeId)`.

```js
/** Reducer.reduce — pure; the ONLY place user-input mutation happens.
 *  Clones state, validates+routes intent to the owning system, rejects illegal intents
 *  (insufficient gold, cycle link, power-too-low, unmet prereq) returning unchanged state + error.
 *  On accepted topology/economy-affecting intents, marks _solved dirty (re-solved by Game). */
export function reduce(state, intent, content) { /* -> { state:GameState, error?:string } */ }
```

---

## 13. Snapshot (`Engine/Snapshot.js`)

```js
/** Builds the frozen (Object.freeze, deep) read-model the UI renders. Derived fields baked in. */
export function build(state, solved, content) { /* -> Readonly<SnapshotView> */ }

/** @typedef {Object} SnapshotView — derived fields the UI consumes:
 *  currencies:        { gold, research, renown }              raw values
 *  rates:             { goldRate, researchRate }              units/s (renownRate is 0; renown only from expeditions)
 *  currencyStrings:   { gold, research, renown, goldRate, researchRate }  formatted display strings
 *  nodes: [{ id, kind, level, resourceId, recipeId, pos,
 *            capacity, effectiveRate, capacityPct,            // effectiveRate/capacity from solved
 *            draw:{res:rate}, surplus:{res:rate}, stockpile:{res:qty},
 *            upgradeCost, canAfford }]
 *  links: [{ id, from, to, resourceId, flow, fedPct }]        // flow units/s, fedPct = flow/wanted
 *  research: [{ id, name, cost, currency, status, prereqsMet, affordable, effectsText }]
 *  heroes: [{ id, templateId, name, level, power, powerBreakdown:{gear, level},
 *             equipped:{weapon, armor, accessory}, levelCost, canLevel }]
 *  territories: [{ id, name, order, requiredPower, durationMs, rewards, status,  // locked|available|reclaimed|active
 *                  flavor, isNext }]
 *  expedition: { active:boolean, territoryId, timeRemainingMs, durationMs, heroId } | null
 *  buildMenu: { placeableMachines:[...], unlockedRecipes:[...] }
 *  save: { status:"ok"|"failed", lastSavedAt }
 *  tutorial: { flags:{...} }
 *  meta: { won:boolean }
 *  lastError: string|null                                     // transient, HUD flashes
 */
```

---

## 14. Game Facade (`Engine/Game.js`)

```js
export class Game {
  /** @param {{content:Content, clock:Clock}} deps */
  constructor({ content, clock }) {}

  /** Load+migrate save from storage (or NewGame), run applyOffline, return OfflineSummary.
   *  Stores storage ref for autosave. */
  bootstrap(storage) { /* -> OfflineSummary */ }

  /** Route an intent through Reducer.reduce; re-solve if dirty; emit snapshot. */
  dispatch(intent) { /* -> { ok:boolean, error?:string } */ }

  /** Fixed-step integrate: applyTick(state, solved, dtSeconds); resolve expeditions. Does NOT emit per call. */
  tick(dtSeconds) { /* -> void */ }

  /** Current raw GameState (used by autosave: SaveManager.serialize(game.getState())). */
  getState() { /* -> GameState */ }

  /** Subscribe to snapshots; returns an unsubscribe fn. */
  onSnapshot(fn) { /* -> () => void */ }

  /** Build one snapshot (using current cached _solved) and emit to listeners — one coalesced render per RAF frame. */
  emitSnapshotForFrame() { /* -> void */ }
}
```

---

## 15. Tests/Runner.js API + RunAll discovery

```js
/** Runner.js — zero-dep harness. */
export function describe(name, fn) {}    // groups; nestable
export function it(name, fn) {}          // test case; fn may be async
export function expect(actual) {
  return {
    toBe(expected) {},                   // Object.is / ===
    toEqual(expected) {},                // deep structural equality
    toBeCloseTo(expected, epsilon = 1e-9) {}, // float compare within epsilon
    toThrow(matcher) {},                 // fn under test throws (optional message/substring matcher)
    toBeTruthy() {},                     // !!actual
  };
}
/** Runs all registered describe/it, prints TAP-ish summary, sets process.exitCode non-zero on any failure. */
export async function run() {}
```

```js
/** RunAll.js — imports every Tests/*.Test.js (static import list maintained in this file; no fs glob needed
 *  for buildless ESM), then calls Runner.run(). */
```

**Run command (exact):**
```
node Tests/RunAll.js
```

---

## 16. Cross-cutting constraints (enforce in every task)

- Engine never touches `window`, `document`, `localStorage`, or `Date.now()` — only via injected `Clock` / `StorageAdapter`.
- `Content/*.js` is the **single source of truth for IDs**; no ID literals elsewhere except `StartState.js` seed and tests.
- New game has only `r_iron_bar` unlocked; seed hero `templateId === "hero_warden"`; first available territory `t_gatehouse` (MAJOR #4/#5 guard).
- `res_smithing` + `res_armory` are **Research-purchasable** (no `requiresTerritory`); only `res_war_college` (T2) and `res_quartermaster` (T4) are territory-gated (BLOCKER #1).
- Gear-tier unlocks fire one territory early (T2 sword/shield on t_smithyward, T2 armor on t_oldmarket, T3 sword/shield on t_ironreach, T3 armor on t_highwall) — BLOCKER #2/#3.
- Solver result lives on non-persisted `state._solved`, stripped before serialize, re-solved only on topology/level/recipe/unlock change.
- Float comparisons in tests use `toBeCloseTo(expected, 1e-9)`. Sim runs at fixed 20 Hz (`STEP = 1000/20`); frame `dt` capped at 250 ms; longer gaps reconciled via offline path.

---

The repo is on `main` with just the spec committed, node v22 available, `Source/` and `Tests/` don't exist yet. I have everything needed to write the Phase 1 plan.

## Phase 1: Project Bootstrap, Test Harness & Content Data

**Phase goal:** Stand up the buildless repo skeleton and the data foundation every later phase builds on. By the end of this phase the repository contains: a `.gitignore`, a minimal `Index.html` stub, a zero-dependency test harness (`Tests/Runner.js`) with `describe/it/expect` (`toBe/toEqual/toBeCloseTo/toThrow/toBeTruthy`), async support, and a non-zero exit code on failure — proven by its own self-test; a `Tests/RunAll.js` discovery module; the injectable `Clock` + `FakeClock`; the persistence adapters (`StorageAdapter` JSDoc contract, `MemoryStorageAdapter`, `LocalStorageAdapter`); all eight `Content/*.js` data modules carrying the EXACT IDs/numbers from spec §3/§5/§6; the `GameState.NewGame()` seed (plus `clone`/`freeze`/`validate`); and a content-integrity test suite that machine-checks every cross-reference (recipe inputs/outputs, research prereqs/effects, value-positivity of all 12 recipes, and the pre-seeded Mine→Smelt→Market chain). The phase ends with a green `node Tests/RunAll.js`.

---

### Task 1.1: Repo skeleton — .gitignore + Index.html stub

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/.gitignore`
- Create: `/home/evilc/Projects/IdleKingdom/Index.html`

Steps:

- [ ] **Step 1: Write `.gitignore`.** Create `/home/evilc/Projects/IdleKingdom/.gitignore`:

```
# OS / editor cruft
.DS_Store
Thumbs.db
*.swp
*~

# Logs
*.log
npm-debug.log*

# Node (only used as a test runner; no deps expected)
node_modules/

# OMC orchestration state (not part of the game)
.omc/
```

- [ ] **Step 2: Write the `Index.html` stub.** Create `/home/evilc/Projects/IdleKingdom/Index.html`. Minimal — just enough to exist and mount; styles/UI come in a later phase.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>IdleKingdom</title>
  </head>
  <body>
    <div id="App"></div>
    <script type="module" src="./Source/Main.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Sanity-check the HTML is well-formed.** Run:

```
node -e "const fs=require('fs');const s=fs.readFileSync('/home/evilc/Projects/IdleKingdom/Index.html','utf8');if(!s.includes('id=\"App\"'))throw new Error('missing App mount');if(!s.includes('./Source/Main.js'))throw new Error('missing module script');console.log('Index.html OK');"
```

Expected output:

```
Index.html OK
```

(`Source/Main.js` does not exist yet — that is fine; this only verifies the stub's contents.)

- [ ] **Step 4: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add .gitignore Index.html && git -C /home/evilc/Projects/IdleKingdom commit -m "chore: repo skeleton — .gitignore + Index.html stub"
```

---

### Task 1.2: Zero-dep test harness `Tests/Runner.js`

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Tests/Runner.js`

Steps:

- [ ] **Step 1: Write the full Runner implementation.** Create `/home/evilc/Projects/IdleKingdom/Tests/Runner.js`. Supports nested `describe`, async `it`, the five matchers, a TAP-ish summary, and `process.exitCode` non-zero on any failure.

```js
// Zero-dependency test harness. No npm, no transpile. Plain ES module.

const registry = []; // flat list of { path:string[], name, fn }
const suiteStack = [];

export function describe(name, fn) {
  suiteStack.push(name);
  fn();
  suiteStack.pop();
}

export function it(name, fn) {
  registry.push({ path: suiteStack.slice(), name, fn });
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function show(v) {
  try {
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  } catch {
    return "<unprintable>";
  }
}

export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        throw new Error(`expected ${show(actual)} to be ${show(expected)}`);
      }
    },
    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        throw new Error(`expected ${show(actual)} to deep-equal ${show(expected)}`);
      }
    },
    toBeCloseTo(expected, epsilon = 1e-9) {
      if (typeof actual !== "number" || Math.abs(actual - expected) > epsilon) {
        throw new Error(`expected ${show(actual)} to be within ${epsilon} of ${show(expected)}`);
      }
    },
    toThrow(matcher) {
      if (typeof actual !== "function") {
        throw new Error(`toThrow expects a function, got ${show(actual)}`);
      }
      let threw = false;
      let err;
      try {
        actual();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (!threw) throw new Error(`expected function to throw`);
      if (matcher != null) {
        const msg = err && err.message != null ? String(err.message) : String(err);
        if (typeof matcher === "string" && !msg.includes(matcher)) {
          throw new Error(`expected thrown message ${show(msg)} to include ${show(matcher)}`);
        }
        if (matcher instanceof RegExp && !matcher.test(msg)) {
          throw new Error(`expected thrown message ${show(msg)} to match ${matcher}`);
        }
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`expected ${show(actual)} to be truthy`);
    },
  };
}

export async function run(filter) {
  let passed = 0;
  let failed = 0;
  let ran = 0;
  const needle = filter ? String(filter).toLowerCase() : null;
  for (const t of registry) {
    const label = [...t.path, t.name].join(" › ");
    if (needle && !label.toLowerCase().includes(needle)) continue;
    ran++;
    try {
      await t.fn();
      passed++;
      console.log(`ok   ${label}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${label}`);
      console.log(`     ${e && e.message ? e.message : e}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${ran} total${needle ? ` (filter: ${filter})` : ""}`);
  if (failed > 0) process.exitCode = 1;
  return { passed, failed, total: ran };
}
```

- [ ] **Step 2: Write a self-test for the harness.** Create `/home/evilc/Projects/IdleKingdom/Tests/Runner.Test.js`. This proves every matcher, async support, and (via a manual sub-run) the failure path.

```js
import { describe, it, expect } from "./Runner.js";

describe("Runner matchers", () => {
  it("toBe uses Object.is", () => {
    expect(1 + 1).toBe(2);
    expect("a").toBe("a");
  });

  it("toEqual does deep structural equality", () => {
    expect({ a: [1, 2], b: { c: 3 } }).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it("toBeCloseTo compares floats within epsilon", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3, 1e-9);
  });

  it("toThrow catches thrown errors and matches substrings", () => {
    expect(() => {
      throw new Error("cycle detected");
    }).toThrow("cycle");
    expect(() => {
      throw new Error("boom");
    }).toThrow();
  });

  it("toBeTruthy passes on truthy values", () => {
    expect(1).toBeTruthy();
    expect("x").toBeTruthy();
    expect([]).toBeTruthy();
  });

  it("supports async tests", async () => {
    const v = await Promise.resolve(42);
    expect(v).toBe(42);
  });

  it("failing matchers throw (negative path)", () => {
    let threw = false;
    try {
      expect(1).toBe(2);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect({ a: 1 }).toEqual({ a: 2 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(0.1).toBeCloseTo(0.2, 1e-9);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(() => 1).toThrow();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(0).toBeTruthy();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
```

- [ ] **Step 3: Run the harness against its own self-test directly (RunAll does not exist yet).** Run:

```
node --input-type=module -e "import('/home/evilc/Projects/IdleKingdom/Tests/Runner.Test.js').then(()=>import('/home/evilc/Projects/IdleKingdom/Tests/Runner.js')).then(m=>m.run())"
```

Expected output (order of `ok` lines is stable; trailing summary is the assertion):

```
ok   Runner matchers › toBe uses Object.is
ok   Runner matchers › toEqual does deep structural equality
ok   Runner matchers › toBeCloseTo compares floats within epsilon
ok   Runner matchers › toThrow catches thrown errors and matches substrings
ok   Runner matchers › toBeTruthy passes on truthy values
ok   Runner matchers › supports async tests
ok   Runner matchers › failing matchers throw (negative path)

7 passed, 0 failed, 7 total
```

- [ ] **Step 4: Verify the non-zero exit code on failure.** Run a throwaway snippet that registers a deliberately failing test, then checks the exit code:

```
node --input-type=module -e "import('/home/evilc/Projects/IdleKingdom/Tests/Runner.js').then(m=>{m.it('intentional fail',()=>m.expect(1).toBe(2));return m.run();}).then(()=>process.exit(process.exitCode||0))"; echo "exit=$?"
```

Expected output (the run prints the failure, then the shell echoes a non-zero code):

```
FAIL intentional fail
     expected 1 to be 2

0 passed, 1 failed, 1 total
exit=1
```

- [ ] **Step 5: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Tests/Runner.js Tests/Runner.Test.js && git -C /home/evilc/Projects/IdleKingdom commit -m "test: zero-dep Runner harness with self-test"
```

---

### Task 1.3: Test discovery `Tests/RunAll.js`

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`
- Modify: (none)

Steps:

- [ ] **Step 1: Write `RunAll.js` with a static import list.** Create `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`. Buildless ESM has no fs-glob requirement; the import list is maintained here and grows as later phases add `*.Test.js` files. For Phase 1 it imports only the harness self-test (more are appended in Tasks 1.6 and 1.8).

```js
// Imports every Tests/*.Test.js so they register, then runs the harness.
// Static import list (buildless ESM — no fs glob). Append new suites here.
import { run } from "./Runner.js";

import "./Runner.Test.js";

// Optional substring filter: `node Tests/RunAll.js Clock` runs only suites whose label contains "Clock".
run(process.argv[2]);
```

- [ ] **Step 2: Run the full suite via the canonical command.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output:

```
ok   Runner matchers › toBe uses Object.is
ok   Runner matchers › toEqual does deep structural equality
ok   Runner matchers › toBeCloseTo compares floats within epsilon
ok   Runner matchers › toThrow catches thrown errors and matches substrings
ok   Runner matchers › toBeTruthy passes on truthy values
ok   Runner matchers › supports async tests
ok   Runner matchers › failing matchers throw (negative path)

7 passed, 0 failed, 7 total
```

- [ ] **Step 3: Confirm a clean exit code.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js > /dev/null; echo "exit=$?"
```

Expected output:

```
exit=0
```

- [ ] **Step 4: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "test: RunAll discovery entrypoint"
```

---

### Task 1.4: Injectable `Clock` + `FakeClock`

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Clock.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/Clock.Test.js`

Steps:

- [ ] **Step 1: Write the failing test.** Create `/home/evilc/Projects/IdleKingdom/Tests/Clock.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import { Clock, FakeClock } from "../Source/Engine/Clock.js";

describe("Clock", () => {
  it("Clock.now() returns a finite ms number", () => {
    const c = new Clock();
    const t = c.now();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
  });

  it("FakeClock starts at 0 by default", () => {
    const fc = new FakeClock();
    expect(fc.now()).toBe(0);
  });

  it("FakeClock starts at the provided ms", () => {
    const fc = new FakeClock(1000);
    expect(fc.now()).toBe(1000);
  });

  it("setNow sets absolute time", () => {
    const fc = new FakeClock(5);
    fc.setNow(500);
    expect(fc.now()).toBe(500);
  });

  it("advance adds to current time and returns the new now", () => {
    const fc = new FakeClock(100);
    const after = fc.advance(250);
    expect(after).toBe(350);
    expect(fc.now()).toBe(350);
  });
});
```

- [ ] **Step 2: Register the suite in RunAll.** Edit `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`, adding the import after the `Runner.Test.js` line:

```js
import "./Runner.Test.js";
import "./Clock.Test.js";
```

- [ ] **Step 3: Run it, expect FAIL.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js Clock
```

Expected: the process fails because `../Source/Engine/Clock.js` does not exist yet — a module-resolution error before any test runs, e.g.:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../Source/Engine/Clock.js'
```

(Note: the `Clock` argument is accepted but unused in Phase 1's RunAll; filtering is wired in a later phase. The command form matches the contract's run convention.)

- [ ] **Step 4: Write the minimal implementation.** Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Clock.js`:

```js
// Injectable time source. The engine NEVER calls Date.now() directly.

export class Clock {
  now() {
    return Date.now();
  }
}

export class FakeClock {
  constructor(startMs = 0) {
    this._now = startMs;
  }
  now() {
    return this._now;
  }
  setNow(ms) {
    this._now = ms;
  }
  advance(ms) {
    this._now += ms;
    return this._now;
  }
}
```

- [ ] **Step 5: Run it, expect PASS.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output (tail; Runner suite still passes, Clock suite now green):

```
ok   Clock › Clock.now() returns a finite ms number
ok   Clock › FakeClock starts at 0 by default
ok   Clock › FakeClock starts at the provided ms
ok   Clock › setNow sets absolute time
ok   Clock › advance adds to current time and returns the new now

12 passed, 0 failed, 12 total
```

- [ ] **Step 6: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Source/Engine/Clock.js Tests/Clock.Test.js Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "feat: injectable Clock + FakeClock"
```

---

### Task 1.5: Persistence adapters (`StorageAdapter`, `MemoryStorageAdapter`, `LocalStorageAdapter`)

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/StorageAdapter.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/MemoryStorageAdapter.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/LocalStorageAdapter.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/StorageAdapter.Test.js`

Steps:

- [ ] **Step 1: Write the failing test.** Create `/home/evilc/Projects/IdleKingdom/Tests/StorageAdapter.Test.js`. Exercises `MemoryStorageAdapter` fully and `LocalStorageAdapter` against a fake `window.localStorage`-shaped object plus its quota-throw try/catch path.

```js
import { describe, it, expect } from "./Runner.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { LocalStorageAdapter } from "../Source/Engine/Persistence/LocalStorageAdapter.js";

describe("MemoryStorageAdapter", () => {
  it("returns null for a missing key", () => {
    const s = new MemoryStorageAdapter();
    expect(s.get("nope")).toBe(null);
  });

  it("round-trips set/get", () => {
    const s = new MemoryStorageAdapter();
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
  });

  it("remove deletes a key", () => {
    const s = new MemoryStorageAdapter();
    s.set("k", "v");
    s.remove("k");
    expect(s.get("k")).toBe(null);
  });
});

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    _throwOnSet() {
      this.setItem = () => {
        throw new Error("QuotaExceededError");
      };
    },
  };
}

describe("LocalStorageAdapter", () => {
  it("round-trips through an injected storage object", () => {
    const fake = makeFakeStorage();
    const s = new LocalStorageAdapter(fake);
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
    expect(fake.getItem("k")).toBe("v");
  });

  it("get returns null for a missing key", () => {
    const s = new LocalStorageAdapter(makeFakeStorage());
    expect(s.get("missing")).toBe(null);
  });

  it("remove deletes a key", () => {
    const fake = makeFakeStorage();
    const s = new LocalStorageAdapter(fake);
    s.set("k", "v");
    s.remove("k");
    expect(s.get("k")).toBe(null);
  });

  it("set swallows quota errors and returns false", () => {
    const fake = makeFakeStorage();
    fake._throwOnSet();
    const s = new LocalStorageAdapter(fake);
    expect(s.set("k", "v")).toBe(false);
  });

  it("set returns true on success", () => {
    const s = new LocalStorageAdapter(makeFakeStorage());
    expect(s.set("k", "v")).toBe(true);
  });
});
```

- [ ] **Step 2: Register the suite in RunAll.** Edit `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`, appending after the Clock import:

```js
import "./Clock.Test.js";
import "./StorageAdapter.Test.js";
```

- [ ] **Step 3: Run it, expect FAIL.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected: module-resolution failure because the adapter files do not exist yet:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../Source/Engine/Persistence/MemoryStorageAdapter.js'
```

- [ ] **Step 4: Write the JSDoc interface contract.** Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/StorageAdapter.js`:

```js
/**
 * @interface StorageAdapter
 * The persistence seam. Implementations: MemoryStorageAdapter (tests),
 * LocalStorageAdapter (browser). No implementation lives here.
 *
 * get(key: string)            -> string | null
 * set(key: string, value: string) -> void | boolean   // may fail on quota; callers tolerate false
 * remove(key: string)         -> void
 */
export {};
```

- [ ] **Step 5: Write `MemoryStorageAdapter`.** Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/MemoryStorageAdapter.js`:

```js
// In-memory StorageAdapter for tests — no browser needed.
export class MemoryStorageAdapter {
  constructor() {
    this._map = new Map();
  }
  get(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  set(key, value) {
    this._map.set(key, String(value));
  }
  remove(key) {
    this._map.delete(key);
  }
}
```

- [ ] **Step 6: Write `LocalStorageAdapter`.** Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/LocalStorageAdapter.js`. All ops are try/catch-wrapped; `set` returns a boolean ok so `Main.js` can flip a "save failed" indicator instead of throwing.

```js
// Browser StorageAdapter over window.localStorage. Quota-safe.
export class LocalStorageAdapter {
  constructor(storage = (typeof window !== "undefined" ? window.localStorage : undefined)) {
    this._s = storage;
  }
  get(key) {
    try {
      return this._s.getItem(key);
    } catch {
      return null;
    }
  }
  set(key, value) {
    try {
      this._s.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }
  remove(key) {
    try {
      this._s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
```

- [ ] **Step 7: Run it, expect PASS.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output (tail):

```
ok   MemoryStorageAdapter › returns null for a missing key
ok   MemoryStorageAdapter › round-trips set/get
ok   MemoryStorageAdapter › remove deletes a key
ok   LocalStorageAdapter › round-trips through an injected storage object
ok   LocalStorageAdapter › get returns null for a missing key
ok   LocalStorageAdapter › remove deletes a key
ok   LocalStorageAdapter › set swallows quota errors and returns false
ok   LocalStorageAdapter › set returns true on success

20 passed, 0 failed, 20 total
```

- [ ] **Step 8: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Source/Engine/Persistence/ Tests/StorageAdapter.Test.js Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "feat: StorageAdapter contract + Memory/LocalStorage impls"
```

---

### Task 1.6: Content data modules — Resources, Machines, Recipes, Equipment, Heroes

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Resources.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Machines.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Recipes.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Equipment.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Heroes.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/ContentShapes.Test.js`

Steps:

- [ ] **Step 1: Write `Resources.js`** — exact IDs/numbers from spec §3.2. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Resources.js`:

```js
/** @typedef {Object} Resource
 *  @property {string}  id
 *  @property {string}  display
 *  @property {0|1|2|3} tier
 *  @property {string}  icon
 *  @property {number|null} basePrice  Gold per unit at Market; null = never listed
 */

/** Keyed map id -> Resource. 5 raw + 5 intermediate + 4 component + 3 equipment. */
export const RESOURCES = {
  // Tier 0 — Raw (5)
  iron_ore: { id: "iron_ore", display: "Iron Ore", tier: 0, icon: "⛏️", basePrice: 0.5 },
  timber: { id: "timber", display: "Timber", tier: 0, icon: "🪵", basePrice: 0.4 },
  hide: { id: "hide", display: "Raw Hide", tier: 0, icon: "🐗", basePrice: 0.6 },
  coal_raw: { id: "coal_raw", display: "Coal Seam", tier: 0, icon: "🪨", basePrice: 0.5 },
  gemstone: { id: "gemstone", display: "Gemstone", tier: 0, icon: "💎", basePrice: 3.0 },
  // Tier 1 — Intermediate (5)
  iron_bar: { id: "iron_bar", display: "Iron Bar", tier: 1, icon: "🟫", basePrice: 4.0 },
  plank: { id: "plank", display: "Plank", tier: 1, icon: "🟧", basePrice: 3.5 },
  leather: { id: "leather", display: "Leather", tier: 1, icon: "🟤", basePrice: 4.0 },
  coal: { id: "coal", display: "Refined Coal", tier: 1, icon: "⚫", basePrice: 1.5 },
  parchment: { id: "parchment", display: "Parchment", tier: 1, icon: "🧾", basePrice: null },
  // Tier 2 — Component (4)
  steel: { id: "steel", display: "Steel", tier: 2, icon: "⬜", basePrice: 14.0 },
  blade: { id: "blade", display: "Blade", tier: 2, icon: "🔪", basePrice: 45.0 },
  plating: { id: "plating", display: "Plating", tier: 2, icon: "🔲", basePrice: 45.0 },
  fitting: { id: "fitting", display: "Fitting", tier: 2, icon: "🔩", basePrice: 16.0 },
  // Tier 3 — Equipment good (3)
  sword: { id: "sword", display: "Sword", tier: 3, icon: "⚔️", basePrice: 140.0 },
  armor: { id: "armor", display: "Plate Armor", tier: 3, icon: "🥋", basePrice: 150.0 },
  shield: { id: "shield", display: "Shield", tier: 3, icon: "🛡️", basePrice: 110.0 },
};
```

- [ ] **Step 2: Write `Machines.js`** — exact numbers from spec §3.3. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Machines.js`:

```js
/** @typedef {Object} Machine
 *  @property {string} kind        gatherer|smelter|workshop|market|scholar
 *  @property {number} baseOutput  L1 output (units/s); crafters are recipe-driven, baseOutput unused
 *  @property {number} rateGain    added per level above 1
 *  @property {number} upgradeBase Gold base cost for cost(level)=upgradeBase*1.15^level
 */

/** Keyed map kind -> Machine. The 5 engine kinds. */
export const MACHINES = {
  gatherer: { kind: "gatherer", baseOutput: 1.0, rateGain: 0.5, upgradeBase: 15 },
  smelter: { kind: "smelter", baseOutput: 0.0, rateGain: 0.25, upgradeBase: 25 },
  workshop: { kind: "workshop", baseOutput: 0.0, rateGain: 0.2, upgradeBase: 40 },
  market: { kind: "market", baseOutput: 5.0, rateGain: 5.0, upgradeBase: 30 },
  scholar: { kind: "scholar", baseOutput: 0.5, rateGain: 0.25, upgradeBase: 35 },
};

/** Gatherer UI variants (cosmetic; engine treats all as `gatherer`). */
export const GATHERER_VARIANTS = {
  miner: { label: "Miner", resourceIds: ["iron_ore", "coal_raw", "gemstone"] },
  forester: { label: "Forester", resourceIds: ["timber"] },
  trapper: { label: "Trapper", resourceIds: ["hide"] },
};
```

- [ ] **Step 3: Write `Recipes.js`** — exact recipes from spec §3.4. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Recipes.js`:

```js
/** @typedef {Object} Recipe
 *  @property {string} id
 *  @property {"smelter"|"workshop"} crafterKind
 *  @property {Object<string,number>} inputs  resourceId -> amount per output unit
 *  @property {string} output
 *  @property {number} baseOut    output units/s at crafter L1
 */

/** Keyed map id -> Recipe (12). */
export const RECIPES = {
  r_iron_bar: { id: "r_iron_bar", crafterKind: "smelter", inputs: { iron_ore: 2 }, output: "iron_bar", baseOut: 0.5 },
  r_plank: { id: "r_plank", crafterKind: "smelter", inputs: { timber: 2 }, output: "plank", baseOut: 0.5 },
  r_leather: { id: "r_leather", crafterKind: "smelter", inputs: { hide: 2 }, output: "leather", baseOut: 0.5 },
  r_coal: { id: "r_coal", crafterKind: "smelter", inputs: { coal_raw: 1 }, output: "coal", baseOut: 1.0 },
  r_steel: { id: "r_steel", crafterKind: "smelter", inputs: { iron_bar: 2, coal: 1 }, output: "steel", baseOut: 0.25 },
  r_blade: { id: "r_blade", crafterKind: "workshop", inputs: { steel: 2, plank: 1 }, output: "blade", baseOut: 0.2 },
  r_plating: { id: "r_plating", crafterKind: "workshop", inputs: { steel: 2, leather: 1 }, output: "plating", baseOut: 0.2 },
  r_fitting: { id: "r_fitting", crafterKind: "workshop", inputs: { iron_bar: 1, leather: 1 }, output: "fitting", baseOut: 0.25 },
  r_sword: { id: "r_sword", crafterKind: "workshop", inputs: { blade: 1, fitting: 1 }, output: "sword", baseOut: 0.1 },
  r_armor: { id: "r_armor", crafterKind: "workshop", inputs: { plating: 2, fitting: 1 }, output: "armor", baseOut: 0.1 },
  r_shield: { id: "r_shield", crafterKind: "workshop", inputs: { plating: 1, plank: 2 }, output: "shield", baseOut: 0.1 },
  r_parchment: { id: "r_parchment", crafterKind: "workshop", inputs: { timber: 1 }, output: "parchment", baseOut: 0.5 },
};
```

- [ ] **Step 4: Write `Equipment.js`** — exact stats from spec §6.2. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Equipment.js`:

```js
/** @typedef {Object} EquipmentItem
 *  @property {string} itemId       resource id reused as equipment (sword|armor|shield)
 *  @property {"weapon"|"armor"|"accessory"} slot
 *  @property {"attack"|"defense"} statType
 *  @property {number} baseStat     T1 stat; stat at tier T = baseStat * T
 */

/** Keyed map itemId -> EquipmentItem (3). */
export const EQUIPMENT = {
  sword: { itemId: "sword", slot: "weapon", statType: "attack", baseStat: 10 },
  armor: { itemId: "armor", slot: "armor", statType: "defense", baseStat: 12 },
  shield: { itemId: "shield", slot: "accessory", statType: "defense", baseStat: 8 },
};

/** itemStat(itemId, tier) === EQUIPMENT[itemId].baseStat * tier. */
export function itemStat(itemId, tier) {
  return EQUIPMENT[itemId].baseStat * tier;
}
```

- [ ] **Step 5: Write `Heroes.js`** — exact templates from spec §6.2. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Heroes.js`:

```js
/** @typedef {Object} HeroTemplate
 *  @property {string} id            hero_warden | hero_ranger | hero_smith
 *  @property {string} name
 *  @property {number} basePower     0 in MVP; power from gear+level
 *  @property {number} levelStep     +heroPower per level (5)
 *  @property {("territory"|"renown")} unlockKind
 *  @property {string|null} unlockTerritory
 *  @property {number} unlockRenownCost
 */

/** Keyed map id -> HeroTemplate (3). */
export const HEROES = {
  hero_warden: { id: "hero_warden", name: "The Warden", basePower: 0, levelStep: 5, unlockKind: "territory", unlockTerritory: "t_gatehouse", unlockRenownCost: 0 },
  hero_ranger: { id: "hero_ranger", name: "The Ranger", basePower: 0, levelStep: 5, unlockKind: "renown", unlockTerritory: "t_oldmarket", unlockRenownCost: 40 },
  hero_smith: { id: "hero_smith", name: "The Smith", basePower: 0, levelStep: 5, unlockKind: "renown", unlockTerritory: "t_highwall", unlockRenownCost: 80 },
};
```

- [ ] **Step 6: Write the shapes test.** Create `/home/evilc/Projects/IdleKingdom/Tests/ContentShapes.Test.js`. Verifies exact counts and the load-bearing canonical numbers.

```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES, GATHERER_VARIANTS } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { EQUIPMENT, itemStat } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";

describe("Resources content", () => {
  it("has 17 resources", () => {
    expect(Object.keys(RESOURCES).length).toBe(17);
  });
  it("each entry's key matches its id", () => {
    for (const [k, r] of Object.entries(RESOURCES)) expect(r.id).toBe(k);
  });
  it("tier counts: 5 raw, 5 intermediate, 4 component, 3 equipment", () => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const r of Object.values(RESOURCES)) counts[r.tier]++;
    expect(counts).toEqual({ 0: 5, 1: 5, 2: 4, 3: 3 });
  });
  it("parchment is the only never-listed resource", () => {
    const nulls = Object.values(RESOURCES).filter((r) => r.basePrice === null).map((r) => r.id);
    expect(nulls).toEqual(["parchment"]);
  });
  it("canonical prices", () => {
    expect(RESOURCES.iron_bar.basePrice).toBe(4.0);
    expect(RESOURCES.steel.basePrice).toBe(14.0);
    expect(RESOURCES.sword.basePrice).toBe(140.0);
    expect(RESOURCES.gemstone.basePrice).toBe(3.0);
  });
});

describe("Machines content", () => {
  it("has 5 engine kinds, each keyed by its kind", () => {
    expect(Object.keys(MACHINES).length).toBe(5);
    for (const [k, m] of Object.entries(MACHINES)) expect(m.kind).toBe(k);
  });
  it("canonical machine numbers", () => {
    expect(MACHINES.gatherer.baseOutput).toBe(1.0);
    expect(MACHINES.gatherer.rateGain).toBe(0.5);
    expect(MACHINES.gatherer.upgradeBase).toBe(15);
    expect(MACHINES.market.baseOutput).toBe(5.0);
    expect(MACHINES.scholar.baseOutput).toBe(0.5);
  });
  it("gatherer variants reference real resources", () => {
    for (const v of Object.values(GATHERER_VARIANTS)) {
      for (const id of v.resourceIds) expect(RESOURCES[id]).toBeTruthy();
    }
  });
});

describe("Recipes content", () => {
  it("has 12 recipes, each keyed by its id", () => {
    expect(Object.keys(RECIPES).length).toBe(12);
    for (const [k, r] of Object.entries(RECIPES)) expect(r.id).toBe(k);
  });
  it("every crafterKind is a real smelter/workshop machine", () => {
    for (const r of Object.values(RECIPES)) {
      expect(r.crafterKind === "smelter" || r.crafterKind === "workshop").toBe(true);
      expect(MACHINES[r.crafterKind]).toBeTruthy();
    }
  });
  it("canonical steel recipe", () => {
    expect(RECIPES.r_steel.inputs).toEqual({ iron_bar: 2, coal: 1 });
    expect(RECIPES.r_steel.output).toBe("steel");
    expect(RECIPES.r_steel.baseOut).toBe(0.25);
  });
});

describe("Equipment content", () => {
  it("has 3 items keyed by itemId with correct slots", () => {
    expect(Object.keys(EQUIPMENT).length).toBe(3);
    expect(EQUIPMENT.sword.slot).toBe("weapon");
    expect(EQUIPMENT.armor.slot).toBe("armor");
    expect(EQUIPMENT.shield.slot).toBe("accessory");
  });
  it("itemStat scales linearly by tier", () => {
    expect(itemStat("sword", 1)).toBe(10);
    expect(itemStat("sword", 3)).toBe(30);
    expect(itemStat("armor", 2)).toBe(24);
    expect(itemStat("shield", 3)).toBe(24);
  });
});

describe("Heroes content", () => {
  it("has 3 templates keyed by id", () => {
    expect(Object.keys(HEROES).length).toBe(3);
    for (const [k, h] of Object.entries(HEROES)) expect(h.id).toBe(k);
  });
  it("warden is the territory-granted starter, others are renown-unlocked", () => {
    expect(HEROES.hero_warden.unlockKind).toBe("territory");
    expect(HEROES.hero_warden.unlockRenownCost).toBe(0);
    expect(HEROES.hero_ranger.unlockRenownCost).toBe(40);
    expect(HEROES.hero_smith.unlockRenownCost).toBe(80);
  });
});
```

- [ ] **Step 7: Register the suite in RunAll.** Edit `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`, appending after the StorageAdapter import:

```js
import "./StorageAdapter.Test.js";
import "./ContentShapes.Test.js";
```

- [ ] **Step 8: Run it, expect PASS.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output (tail):

```
ok   Heroes content › has 3 templates keyed by id
ok   Heroes content › warden is the territory-granted starter, others are renown-unlocked

42 passed, 0 failed, 42 total
```

- [ ] **Step 9: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Source/Engine/Content/ Tests/ContentShapes.Test.js Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "feat: Content data — Resources/Machines/Recipes/Equipment/Heroes"
```

---

### Task 1.7: Content data modules — ResearchNodes & Territories

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/ResearchNodes.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Territories.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/ContentTree.Test.js`

Steps:

- [ ] **Step 1: Write `ResearchNodes.js`** — exact IDs/costs/prereqs/effects from spec §5 and the contract's effect mapping. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/ResearchNodes.js`:

```js
/** @typedef {Object} ResearchEffect  tagged union (see contract §2.4) */
/** @typedef {Object} ResearchNode
 *  @property {string}  id
 *  @property {string}  name
 *  @property {"research"|"renown"} currency
 *  @property {number}  cost
 *  @property {string[]} prereqs
 *  @property {ResearchEffect[]} effects
 *  @property {string|null} requiresTerritory
 *  @property {string}  flavor
 */

/** Keyed map id -> ResearchNode. 15 backbone (research) + 2 premium (renown). */
export const RESEARCH_NODES = {
  res_scholar: {
    id: "res_scholar", name: "Found the Scholars' Guild", currency: "research", cost: 9, prereqs: [], requiresTerritory: null,
    effects: [{ type: "unlockMachine", kind: "scholar" }, { type: "unlockRecipe", recipeId: "r_parchment" }],
    flavor: "A drafty hall, one candle, and the city's last literate quartermaster.",
  },
  res_lumber: {
    id: "res_lumber", name: "Lumber Rights", currency: "research", cost: 25, prereqs: ["res_scholar"], requiresTerritory: null,
    effects: [{ type: "unlockMachine", kind: "gatherer" }, { type: "unlockRecipe", recipeId: "r_plank" }],
    flavor: "The eastern woods are ours again — fell what the siege left standing.",
  },
  res_tannery: {
    id: "res_tannery", name: "Tannery Charter", currency: "research", cost: 25, prereqs: ["res_scholar"], requiresTerritory: null,
    effects: [{ type: "unlockMachine", kind: "gatherer" }, { type: "unlockRecipe", recipeId: "r_leather" }],
    flavor: "Boar-hide cures hard, but it cures fast.",
  },
  res_coalworks: {
    id: "res_coalworks", name: "Coalworks", currency: "research", cost: 40, prereqs: ["res_lumber"], requiresTerritory: null,
    effects: [{ type: "unlockRecipe", recipeId: "r_coal" }, { type: "enableGathererResource", resourceId: "coal_raw" }],
    flavor: "The deep seams burn hotter than any wood-fire.",
  },
  res_steelmaking: {
    id: "res_steelmaking", name: "Steelmaking", currency: "research", cost: 120, prereqs: ["res_coalworks"], requiresTerritory: null,
    effects: [{ type: "unlockRecipe", recipeId: "r_steel" }],
    flavor: "Iron is a tool. Steel is a weapon.",
  },
  res_fittings: {
    id: "res_fittings", name: "Fittings & Rivets", currency: "research", cost: 180, prereqs: ["res_steelmaking"], requiresTerritory: null,
    effects: [{ type: "unlockRecipe", recipeId: "r_fitting" }, { type: "unlockListing", resourceIds: ["fitting"] }],
    flavor: "A blade is nothing without the rivet that holds the hilt.",
  },
  res_open_market: {
    id: "res_open_market", name: "Open the Component Stalls", currency: "research", cost: 90, prereqs: ["res_steelmaking"], requiresTerritory: null,
    effects: [{ type: "unlockListing", resourceIds: ["coal", "iron_bar", "plank", "leather", "steel"] }],
    flavor: "Even half-finished goods fetch coin from a desperate quarter.",
  },
  res_smithing: {
    id: "res_smithing", name: "Blade & Plate Smithing", currency: "research", cost: 250, prereqs: ["res_steelmaking"], requiresTerritory: null,
    effects: [{ type: "unlockRecipe", recipeId: "r_blade" }, { type: "unlockRecipe", recipeId: "r_plating" }, { type: "unlockListing", resourceIds: ["blade", "plating"] }],
    flavor: "The forge-masters return to their anvils.",
  },
  res_armory: {
    id: "res_armory", name: "The Armory", currency: "research", cost: 400, prereqs: ["res_smithing", "res_fittings"], requiresTerritory: null,
    effects: [
      { type: "unlockRecipe", recipeId: "r_sword" }, { type: "unlockRecipe", recipeId: "r_armor" }, { type: "unlockRecipe", recipeId: "r_shield" },
      { type: "unlockListing", resourceIds: ["sword", "armor", "shield"] },
    ],
    flavor: "Now we forge for heroes, not just for coin.",
  },
  res_efficient_forges: {
    id: "res_efficient_forges", name: "Efficient Forges", currency: "research", cost: 300, prereqs: ["res_steelmaking"], requiresTerritory: null,
    effects: [{ type: "productionBonus", kind: "smelter", mult: 1.25 }],
    flavor: "Bank the coals just so and one charge does the work of two.",
  },
  res_assembly_jigs: {
    id: "res_assembly_jigs", name: "Assembly Jigs", currency: "research", cost: 550, prereqs: ["res_armory"], requiresTerritory: null,
    effects: [{ type: "productionBonus", kind: "workshop", mult: 1.25 }],
    flavor: "Standardized jigs mean any apprentice builds like a master.",
  },
  res_trade_routes: {
    id: "res_trade_routes", name: "Trade Routes", currency: "research", cost: 700, prereqs: ["res_open_market"], requiresTerritory: null,
    effects: [{ type: "marketCapacityBonus", mult: 1.3 }, { type: "titheRate", value: 0.07 }],
    flavor: "Merchant caravans slip past the siege lines by moonlight.",
  },
  res_ledgers: {
    id: "res_ledgers", name: "Caravan Ledgers", currency: "research", cost: 600, prereqs: ["res_trade_routes"], requiresTerritory: null,
    effects: [{ type: "offlineCapHours", value: 12 }],
    flavor: "Clerks keep the books running while the city sleeps.",
  },
  res_logistics: {
    id: "res_logistics", name: "Master Logistics", currency: "research", cost: 1800, prereqs: ["res_ledgers", "res_assembly_jigs"], requiresTerritory: null,
    effects: [{ type: "offlineCapHours", value: 24 }, { type: "globalRateBonus", mult: 1.1 }],
    flavor: "A kingdom that runs itself is a kingdom that endures.",
  },
  res_grand_design: {
    id: "res_grand_design", name: "The Grand Design", currency: "research", cost: 5000, prereqs: ["res_logistics", "res_efficient_forges"], requiresTerritory: null,
    effects: [{ type: "globalRateBonus", mult: 1.2 }, { type: "scholarBonus", mult: 1.5 }],
    flavor: "Every wheel, every fire, every quill — turning as one.",
  },
  // Premium (renown)
  res_war_college: {
    id: "res_war_college", name: "War College", currency: "renown", cost: 30, prereqs: ["res_armory"], requiresTerritory: "t_smithyward",
    effects: [{ type: "heroSlot", count: 1 }],
    flavor: "Two banners on the wall are harder to break than one.",
  },
  res_quartermaster: {
    id: "res_quartermaster", name: "Master Quartermaster", currency: "renown", cost: 60, prereqs: ["res_war_college", "res_trade_routes"], requiresTerritory: "t_ironreach",
    effects: [{ type: "autoSell", enabled: true }],
    flavor: "One ledger, one seal, and nothing in Yensburg goes to waste.",
  },
};
```

- [ ] **Step 2: Write `Territories.js`** — exact IDs/numbers/unlocks from spec §6.1 and the contract §2.5. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Territories.js`:

```js
/** @typedef {Object} TerritoryReward { gold:number, research:number, renown:number }
 *  @typedef {Object} Territory
 *  @property {string}  id
 *  @property {string}  name
 *  @property {string}  flavor
 *  @property {number}  order
 *  @property {number}  requiredPower
 *  @property {number}  durationMs
 *  @property {TerritoryReward} rewards
 *  @property {Object[]} unlocks
 *  @property {string|null} grantsHero
 *  @property {boolean} isVictory
 */

/** Keyed map id -> Territory (6), order t_gatehouse -> t_blackkeep. */
export const TERRITORIES = {
  t_gatehouse: {
    id: "t_gatehouse", name: "The Gatehouse", order: 1, requiredPower: 30, durationMs: 120000,
    rewards: { gold: 50, research: 20, renown: 10 }, grantsHero: "hero_warden", isVictory: false,
    unlocks: [{ type: "productionBonus", kind: "gatherer", mult: 1.1 }],
    flavor: "Push the rabble off the drawbridge and light the first brazier.",
  },
  t_smithyward: {
    id: "t_smithyward", name: "Smithy Ward", order: 2, requiredPower: 38, durationMs: 300000,
    rewards: { gold: 120, research: 40, renown: 15 }, grantsHero: null, isVictory: false,
    unlocks: [{ type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 2 }, { type: "productionBonus", kind: "smelter", mult: 1.1 }],
    flavor: "Reclaim the cold forges; the bellows still remember fire.",
  },
  t_oldmarket: {
    id: "t_oldmarket", name: "The Old Market", order: 3, requiredPower: 50, durationMs: 600000,
    rewards: { gold: 300, research: 80, renown: 25 }, grantsHero: null, isVictory: false,
    unlocks: [{ type: "unlockGearTier", itemIds: ["armor"], tier: 2 }, { type: "marketCapacityBonus", mult: 1.15 }],
    flavor: "Merchants return where the banners fly; trade quickens.",
  },
  t_ironreach: {
    id: "t_ironreach", name: "Ironreach Mine", order: 4, requiredPower: 65, durationMs: 1200000,
    rewards: { gold: 700, research: 150, renown: 35 }, grantsHero: null, isVictory: false,
    unlocks: [
      { type: "enableGathererResource", resourceId: "gemstone" },
      { type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 3 },
      { type: "productionBonus", kind: "smelter", mult: 1.2 },
    ],
    flavor: "The deep galleries are ours again — and they glitter.",
  },
  t_highwall: {
    id: "t_highwall", name: "The High Wall", order: 5, requiredPower: 85, durationMs: 2400000,
    rewards: { gold: 1500, research: 300, renown: 50 }, grantsHero: null, isVictory: false,
    unlocks: [{ type: "unlockGearTier", itemIds: ["armor"], tier: 3 }, { type: "heroSlot", count: 1 }, { type: "offlineCapHours", value: 12 }],
    flavor: "From the ramparts you can see the keep — and who waits in it.",
  },
  t_blackkeep: {
    id: "t_blackkeep", name: "The Black Keep", order: 6, requiredPower: 110, durationMs: 3600000,
    rewards: { gold: 4000, research: 600, renown: 70 }, grantsHero: null, isVictory: true,
    unlocks: [],
    flavor: "The Usurer-Lord who bought the King's death waits behind the last door. End it.",
  },
};
```

- [ ] **Step 3: Write the tree-integrity test.** Create `/home/evilc/Projects/IdleKingdom/Tests/ContentTree.Test.js`. Machine-checks counts, prereq references, effect references, the BLOCKER guards (equipment chain pure-research; only war_college/quartermaster territory-gated; gear-tier shift), and the territory ordering.

```js
import { describe, it, expect } from "./Runner.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";

const VALID_EFFECT_TYPES = new Set([
  "unlockMachine", "unlockRecipe", "unlockListing", "enableGathererResource",
  "productionBonus", "globalRateBonus", "marketCapacityBonus", "titheRate",
  "offlineCapHours", "scholarBonus", "heroSlot", "autoSell", "unlockGearTier",
]);

function checkEffectRefs(eff) {
  switch (eff.type) {
    case "unlockMachine":
      expect(MACHINES[eff.kind]).toBeTruthy();
      break;
    case "unlockRecipe":
      expect(RECIPES[eff.recipeId]).toBeTruthy();
      break;
    case "unlockListing":
      for (const id of eff.resourceIds) expect(RESOURCES[id]).toBeTruthy();
      break;
    case "enableGathererResource":
      expect(RESOURCES[eff.resourceId]).toBeTruthy();
      break;
    case "productionBonus":
      expect(MACHINES[eff.kind]).toBeTruthy();
      break;
    case "unlockGearTier":
      for (const id of eff.itemIds) expect(EQUIPMENT[id]).toBeTruthy();
      break;
    default:
      // scalar effects (mult/value/count/enabled) carry no id reference
      break;
  }
}

describe("ResearchNodes content", () => {
  it("has 17 nodes (15 research + 2 renown), each keyed by id", () => {
    const all = Object.values(RESEARCH_NODES);
    expect(all.length).toBe(17);
    for (const [k, n] of Object.entries(RESEARCH_NODES)) expect(n.id).toBe(k);
    expect(all.filter((n) => n.currency === "research").length).toBe(15);
    expect(all.filter((n) => n.currency === "renown").length).toBe(2);
  });

  it("every prereq references a real research node", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      for (const p of n.prereqs) expect(RESEARCH_NODES[p]).toBeTruthy();
    }
  });

  it("every effect has a known type and valid id references", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      expect(Array.isArray(n.effects)).toBe(true);
      for (const eff of n.effects) {
        expect(VALID_EFFECT_TYPES.has(eff.type)).toBe(true);
        checkEffectRefs(eff);
      }
    }
  });

  it("BLOCKER #1: equipment chain is pure-research (no territory gate)", () => {
    expect(RESEARCH_NODES.res_smithing.requiresTerritory).toBe(null);
    expect(RESEARCH_NODES.res_armory.requiresTerritory).toBe(null);
  });

  it("only war_college and quartermaster are territory-gated", () => {
    const gated = Object.values(RESEARCH_NODES).filter((n) => n.requiresTerritory != null).map((n) => n.id).sort();
    expect(gated).toEqual(["res_quartermaster", "res_war_college"]);
    expect(RESEARCH_NODES.res_war_college.requiresTerritory).toBe("t_smithyward");
    expect(RESEARCH_NODES.res_quartermaster.requiresTerritory).toBe("t_ironreach");
  });

  it("every requiresTerritory references a real territory", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      if (n.requiresTerritory != null) expect(TERRITORIES[n.requiresTerritory]).toBeTruthy();
    }
  });

  it("canonical spine costs", () => {
    expect(RESEARCH_NODES.res_scholar.cost).toBe(9);
    expect(RESEARCH_NODES.res_steelmaking.cost).toBe(120);
    expect(RESEARCH_NODES.res_armory.cost).toBe(400);
    expect(RESEARCH_NODES.res_grand_design.cost).toBe(5000);
  });
});

describe("Territories content", () => {
  it("has 6 territories keyed by id with orders 1..6", () => {
    const all = Object.values(TERRITORIES);
    expect(all.length).toBe(6);
    for (const [k, t] of Object.entries(TERRITORIES)) expect(t.id).toBe(k);
    expect(all.map((t) => t.order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("only t_blackkeep is the victory territory and it is order 6", () => {
    const victors = all().filter((t) => t.isVictory).map((t) => t.id);
    expect(victors).toEqual(["t_blackkeep"]);
    expect(TERRITORIES.t_blackkeep.order).toBe(6);
  });

  it("grantsHero references a real hero template", () => {
    for (const t of Object.values(TERRITORIES)) {
      if (t.grantsHero != null) expect(HEROES[t.grantsHero]).toBeTruthy();
    }
    expect(TERRITORIES.t_gatehouse.grantsHero).toBe("hero_warden");
  });

  it("every territory unlock effect references valid ids", () => {
    for (const t of Object.values(TERRITORIES)) {
      for (const eff of t.unlocks) {
        expect(VALID_EFFECT_TYPES.has(eff.type)).toBe(true);
        checkEffectRefs(eff);
      }
    }
  });

  it("BLOCKER #2/#3: gear-tier unlocks fire one territory early", () => {
    const tiers = (id) =>
      TERRITORIES[id].unlocks.filter((e) => e.type === "unlockGearTier").map((e) => ({ items: e.itemIds, tier: e.tier }));
    expect(tiers("t_smithyward")).toEqual([{ items: ["sword", "shield"], tier: 2 }]);
    expect(tiers("t_oldmarket")).toEqual([{ items: ["armor"], tier: 2 }]);
    expect(tiers("t_ironreach")).toEqual([{ items: ["sword", "shield"], tier: 3 }]);
    expect(tiers("t_highwall")).toEqual([{ items: ["armor"], tier: 3 }]);
  });

  it("required power is strictly increasing in reclaim order", () => {
    const ordered = all().sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].requiredPower > ordered[i - 1].requiredPower).toBe(true);
    }
  });
});

function all() {
  return Object.values(TERRITORIES);
}
```

- [ ] **Step 4: Register the suite in RunAll.** Edit `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`, appending after the ContentShapes import:

```js
import "./ContentShapes.Test.js";
import "./ContentTree.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output (tail):

```
ok   Territories content › BLOCKER #2/#3: gear-tier unlocks fire one territory early
ok   Territories content › required power is strictly increasing in reclaim order

55 passed, 0 failed, 55 total
```

- [ ] **Step 6: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Source/Engine/Content/ResearchNodes.js Source/Engine/Content/Territories.js Tests/ContentTree.Test.js Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "feat: Content data — ResearchNodes + Territories with integrity guards"
```

---

### Task 1.8: `StartState.js` seed + `GameState.NewGame()` + content-integrity suite

**Files**
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/StartState.js`
- Create: `/home/evilc/Projects/IdleKingdom/Source/Engine/GameState.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/GameState.Test.js`
- Test: `/home/evilc/Projects/IdleKingdom/Tests/ContentIntegrity.Test.js`

Steps:

- [ ] **Step 1: Write `StartState.js`** — exact seed from contract §2.8 / spec §9.2. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/Content/StartState.js`:

```js
/** NewGame seed: pre-placed Miner -> Smelter(r_iron_bar) -> Market; 25 gold; iron_bar listed.
 *  Brand-new game has expeditions.active === null. */
export const START_STATE = {
  currencies: { gold: 25.0, research: 0.0, renown: 0.0 },
  graph: {
    nodes: [
      { id: "n_miner_0", kind: "gatherer", level: 1, resourceId: "iron_ore", recipeId: null, stockpile: { iron_ore: 0.0 }, pos: { x: 120, y: 200 } },
      { id: "n_smelter_0", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: { iron_bar: 0.0 }, pos: { x: 360, y: 200 } },
      { id: "n_market_0", kind: "market", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 600, y: 200 } },
    ],
    links: [
      { id: "l_0", from: "n_miner_0", to: "n_smelter_0", resourceId: "iron_ore" },
      { id: "l_1", from: "n_smelter_0", to: "n_market_0", resourceId: "iron_bar" },
    ],
    nextNodeSeq: 1,
    nextLinkSeq: 2,
  },
  unlocks: {
    researchOwned: [],
    recipesUnlocked: ["r_iron_bar"],
    machinesUnlocked: ["gatherer", "smelter", "market"],
    marketListings: ["iron_ore", "timber", "hide", "coal_raw", "gemstone", "iron_bar"],
    titheRate: 0.05,
    offlineCapHours: 8,
    productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
    gearTiersUnlocked: [
      { itemId: "sword", tier: 1 },
      { itemId: "armor", tier: 1 },
      { itemId: "shield", tier: 1 },
    ],
    autoSell: false,
    heroSlots: 1,
  },
  heroes: [{ id: "h_0", templateId: "hero_warden", level: 1, equipped: { weapon: null, armor: null, accessory: null } }],
  expeditions: { active: null, completed: [] },
  territories: { reclaimed: [], available: ["t_gatehouse"] },
  meta: { tutorialFlags: { seenGoldTip: false, seenUpgradeTip: false, seenConnectTip: false }, won: false, createdAt: 0, playtimeMs: 0 },
};
```

- [ ] **Step 2: Write `GameState.js`** — `NewGame`, `clone`, `freeze`, `validate` per contract §3. SAVE_VERSION lives in SaveManager (Phase 2); GameState reads it via a local constant kept in sync, so for Phase 1 we hardcode the version constant here and re-export it. Create `/home/evilc/Projects/IdleKingdom/Source/Engine/GameState.js`:

```js
import { START_STATE } from "./Content/StartState.js";

/** Current persisted save schema version (mirrored by SaveManager in Phase 2). */
export const SAVE_VERSION = 3;

/** Structured deep clone with no shared refs; drops the non-persisted _solved cache. */
export function clone(state) {
  const { _solved, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

/** Fresh seeded GameState: deep copy of START_STATE, version stamped, timestamps from clock. */
export function NewGame(clock) {
  const now = clock ? clock.now() : 0;
  const seed = JSON.parse(JSON.stringify(START_STATE));
  return {
    version: SAVE_VERSION,
    savedAt: now,
    lastSeen: now,
    ...seed,
    meta: { ...seed.meta, createdAt: now },
  };
}

/** Deep-freeze a clone for snapshot use (recursively freezes nested objects/arrays). */
export function freeze(state) {
  const copy = clone(state);
  deepFreeze(copy);
  return copy;
}

function deepFreeze(o) {
  if (o === null || typeof o !== "object") return o;
  for (const k of Object.keys(o)) deepFreeze(o[k]);
  return Object.freeze(o);
}

/** Structural validation: required keys, finite currencies, node/link referential integrity. */
export function validate(state) {
  if (!state || typeof state !== "object") return false;
  const required = ["version", "currencies", "graph", "unlocks", "heroes", "expeditions", "territories", "meta"];
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(state, k)) return false;
  }
  const c = state.currencies;
  if (!c || !Number.isFinite(c.gold) || !Number.isFinite(c.research) || !Number.isFinite(c.renown)) return false;
  const g = state.graph;
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.links)) return false;
  const nodeIds = new Set();
  for (const n of g.nodes) {
    if (!n || typeof n.id !== "string" || nodeIds.has(n.id)) return false;
    nodeIds.add(n.id);
  }
  for (const l of g.links) {
    if (!l || typeof l.id !== "string") return false;
    if (!nodeIds.has(l.from) || !nodeIds.has(l.to)) return false;
  }
  return true;
}
```

- [ ] **Step 3: Write the `GameState.Test.js` suite.** Create `/home/evilc/Projects/IdleKingdom/Tests/GameState.Test.js`. Covers NewGame canon (MAJOR #4/#5 guards), timestamp stamping, clone isolation, deep freeze, and validate's true/false paths.

```js
import { describe, it, expect } from "./Runner.js";
import { NewGame, clone, freeze, validate, SAVE_VERSION } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";

describe("GameState.NewGame", () => {
  it("stamps version and clock timestamps", () => {
    const g = NewGame(new FakeClock(1000));
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.savedAt).toBe(1000);
    expect(g.lastSeen).toBe(1000);
    expect(g.meta.createdAt).toBe(1000);
  });

  it("MAJOR #4/#5: only r_iron_bar unlocked, warden seed hero, t_gatehouse first", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(g.heroes[0].templateId).toBe("hero_warden");
    expect(g.territories.available).toEqual(["t_gatehouse"]);
    expect(g.territories.reclaimed).toEqual([]);
  });

  it("seeds the Mine -> Smelt -> Market chain", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.graph.nodes.map((n) => n.kind)).toEqual(["gatherer", "smelter", "market"]);
    expect(g.graph.nodes[0].resourceId).toBe("iron_ore");
    expect(g.graph.nodes[1].recipeId).toBe("r_iron_bar");
    expect(g.graph.links.length).toBe(2);
    expect(g.graph.links[0]).toEqual({ id: "l_0", from: "n_miner_0", to: "n_smelter_0", resourceId: "iron_ore" });
  });

  it("brand-new game has no active expedition", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.expeditions.active).toBe(null);
  });

  it("starts with 25 gold and zero research/renown", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.currencies.gold).toBe(25.0);
    expect(g.currencies.research).toBe(0.0);
    expect(g.currencies.renown).toBe(0.0);
  });

  it("two NewGames do not share references", () => {
    const a = NewGame(new FakeClock(0));
    const b = NewGame(new FakeClock(0));
    a.graph.nodes[0].level = 99;
    expect(b.graph.nodes[0].level).toBe(1);
  });
});

describe("GameState.clone", () => {
  it("produces an independent deep copy", () => {
    const g = NewGame(new FakeClock(0));
    const c = clone(g);
    c.currencies.gold = 999;
    expect(g.currencies.gold).toBe(25.0);
  });

  it("strips the non-persisted _solved cache", () => {
    const g = NewGame(new FakeClock(0));
    g._solved = { goldRate: 2.0 };
    const c = clone(g);
    expect(c._solved).toBe(undefined);
  });
});

describe("GameState.freeze", () => {
  it("returns a deeply frozen object", () => {
    const g = NewGame(new FakeClock(0));
    const f = freeze(g);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.currencies)).toBe(true);
    expect(Object.isFrozen(f.graph.nodes[0])).toBe(true);
  });
});

describe("GameState.validate", () => {
  it("accepts a fresh NewGame", () => {
    expect(validate(NewGame(new FakeClock(0)))).toBe(true);
  });
  it("rejects null / non-object", () => {
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
  });
  it("rejects missing required keys", () => {
    const g = NewGame(new FakeClock(0));
    delete g.currencies;
    expect(validate(g)).toBe(false);
  });
  it("rejects non-finite currencies", () => {
    const g = NewGame(new FakeClock(0));
    g.currencies.gold = Infinity;
    expect(validate(g)).toBe(false);
  });
  it("rejects a link pointing at a missing node", () => {
    const g = NewGame(new FakeClock(0));
    g.graph.links.push({ id: "l_bad", from: "n_ghost", to: "n_market_0", resourceId: "iron_bar" });
    expect(validate(g)).toBe(false);
  });
});
```

- [ ] **Step 4: Write the cross-content integrity suite.** Create `/home/evilc/Projects/IdleKingdom/Tests/ContentIntegrity.Test.js`. This is the phase-capstone test: it machine-checks every cross-reference across all content modules, value-positivity of all 12 recipes, and that the seed's referenced IDs exist.

```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { START_STATE } from "../Source/Engine/Content/StartState.js";

describe("Recipe id integrity", () => {
  it("every recipe input and output is a real resource id", () => {
    for (const r of Object.values(RECIPES)) {
      expect(RESOURCES[r.output]).toBeTruthy();
      for (const inId of Object.keys(r.inputs)) expect(RESOURCES[inId]).toBeTruthy();
    }
  });
  it("every recipe crafterKind is a real machine kind", () => {
    for (const r of Object.values(RECIPES)) expect(MACHINES[r.crafterKind]).toBeTruthy();
  });
});

describe("Value-positivity of all 12 recipes (§3.4)", () => {
  it("each output basePrice exceeds summed input basePrice (parchment exempt: never listed)", () => {
    for (const r of Object.values(RECIPES)) {
      if (r.output === "parchment") continue; // research feedstock, never market-listed
      const outPrice = RESOURCES[r.output].basePrice;
      let inCost = 0;
      for (const [inId, amt] of Object.entries(r.inputs)) {
        inCost += RESOURCES[inId].basePrice * amt;
      }
      // strictly positive margin
      expect(outPrice - inCost > 0).toBe(true);
    }
  });
  it("steel margin is thin-but-positive (chokepoint guard)", () => {
    // steel inputs: iron_bar*2 (4.0) + coal*1 (1.5) = 9.5; sell 14.0 -> +4.5 per steel unit
    const r = RECIPES.r_steel;
    const inCost = RESOURCES.iron_bar.basePrice * 2 + RESOURCES.coal.basePrice * 1;
    expect(inCost).toBeCloseTo(9.5, 1e-9);
    expect(RESOURCES.steel.basePrice - inCost).toBeCloseTo(4.5, 1e-9);
  });
});

describe("Research/Territory cross-references", () => {
  it("every research prereq is a real node", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      for (const p of n.prereqs) expect(RESEARCH_NODES[p]).toBeTruthy();
    }
  });
  it("every research requiresTerritory is a real territory", () => {
    for (const n of Object.values(RESEARCH_NODES)) {
      if (n.requiresTerritory != null) expect(TERRITORIES[n.requiresTerritory]).toBeTruthy();
    }
  });
  it("every territory grantsHero is a real hero template", () => {
    for (const t of Object.values(TERRITORIES)) {
      if (t.grantsHero != null) expect(HEROES[t.grantsHero]).toBeTruthy();
    }
  });
});

describe("StartState seed integrity", () => {
  it("seed node recipeId/resourceId reference real content", () => {
    for (const n of START_STATE.graph.nodes) {
      if (n.recipeId != null) expect(RECIPES[n.recipeId]).toBeTruthy();
      if (n.resourceId != null) expect(RESOURCES[n.resourceId]).toBeTruthy();
      expect(MACHINES[n.kind]).toBeTruthy();
    }
  });
  it("seed links reference existing nodes and real resources", () => {
    const ids = new Set(START_STATE.graph.nodes.map((n) => n.id));
    for (const l of START_STATE.graph.links) {
      expect(ids.has(l.from)).toBe(true);
      expect(ids.has(l.to)).toBe(true);
      expect(RESOURCES[l.resourceId]).toBeTruthy();
    }
  });
  it("seed is exactly the Mine -> Smelt -> Market chain", () => {
    const n = START_STATE.graph.nodes;
    expect(n.length).toBe(3);
    expect(n[0].kind).toBe("gatherer");
    expect(n[0].resourceId).toBe("iron_ore");
    expect(n[1].kind).toBe("smelter");
    expect(n[1].recipeId).toBe("r_iron_bar");
    expect(n[2].kind).toBe("market");
    expect(START_STATE.graph.links.map((l) => l.resourceId)).toEqual(["iron_ore", "iron_bar"]);
  });
  it("seed recipesUnlocked is exactly [r_iron_bar]", () => {
    expect(START_STATE.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
  });
  it("every seed marketListing is a real resource", () => {
    for (const id of START_STATE.unlocks.marketListings) expect(RESOURCES[id]).toBeTruthy();
  });
  it("seed gearTiersUnlocked items are real equipment", () => {
    for (const g of START_STATE.unlocks.gearTiersUnlocked) expect(EQUIPMENT[g.itemId]).toBeTruthy();
  });
});
```

- [ ] **Step 5: Register both suites in RunAll.** Edit `/home/evilc/Projects/IdleKingdom/Tests/RunAll.js`, appending after the ContentTree import:

```js
import "./ContentTree.Test.js";
import "./GameState.Test.js";
import "./ContentIntegrity.Test.js";
```

- [ ] **Step 6: Run the full suite, expect PASS.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js
```

Expected output (tail; final summary is the green gate for the phase):

```
ok   StartState seed integrity › seed gearTiersUnlocked items are real equipment

83 passed, 0 failed, 83 total
```

(The exact passed-count may differ by a few if individual `it` blocks are split; the load-bearing assertion is `0 failed` and a clean exit.)

- [ ] **Step 7: Confirm clean exit code.** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js > /dev/null; echo "exit=$?"
```

Expected output:

```
exit=0
```

- [ ] **Step 8: Commit.** Run:

```
git -C /home/evilc/Projects/IdleKingdom add Source/Engine/Content/StartState.js Source/Engine/GameState.js Tests/GameState.Test.js Tests/ContentIntegrity.Test.js Tests/RunAll.js && git -C /home/evilc/Projects/IdleKingdom commit -m "feat: StartState seed + GameState NewGame/clone/freeze/validate + content-integrity suite"
```

---

### Task 1.9: Phase 1 verification gate

**Files**
- Modify: (none — verification only)

Steps:

- [ ] **Step 1: Final full-suite run (the phase exit gate).** Run:

```
node /home/evilc/Projects/IdleKingdom/Tests/RunAll.js; echo "exit=$?"
```

Expected: every suite green and a zero exit code, ending with:

```
0 failed
exit=0
```

- [ ] **Step 2: Confirm the working tree is clean and review the Phase 1 file inventory.** Run:

```
git -C /home/evilc/Projects/IdleKingdom status --short && echo "---FILES---" && find /home/evilc/Projects/IdleKingdom/Source /home/evilc/Projects/IdleKingdom/Tests -type f | sort
```

Expected: no uncommitted changes (empty `status --short`), and the file list contains exactly the Phase 1 artifacts:

```
---FILES---
/home/evilc/Projects/IdleKingdom/Source/Engine/Clock.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Equipment.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Heroes.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Machines.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Recipes.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Resources.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/ResearchNodes.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/StartState.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Content/Territories.js
/home/evilc/Projects/IdleKingdom/Source/Engine/GameState.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/LocalStorageAdapter.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/MemoryStorageAdapter.js
/home/evilc/Projects/IdleKingdom/Source/Engine/Persistence/StorageAdapter.js
/home/evilc/Projects/IdleKingdom/Tests/Clock.Test.js
/home/evilc/Projects/IdleKingdom/Tests/ContentIntegrity.Test.js
/home/evilc/Projects/IdleKingdom/Tests/ContentShapes.Test.js
/home/evilc/Projects/IdleKingdom/Tests/ContentTree.Test.js
/home/evilc/Projects/IdleKingdom/Tests/GameState.Test.js
/home/evilc/Projects/IdleKingdom/Tests/RunAll.js
/home/evilc/Projects/IdleKingdom/Tests/Runner.js
/home/evilc/Projects/IdleKingdom/Tests/Runner.Test.js
/home/evilc/Projects/IdleKingdom/Tests/StorageAdapter.Test.js
```

If `git status --short` is non-empty, commit the stragglers before declaring Phase 1 complete. No further commit is needed if the tree is already clean.

---

I have everything I need. The spec §9.3 pseudo-code, §4 solver behavior, §10 test baselines, and the interface contract are all clear. Now I'll write the complete Phase 2 plan.

## Phase 2: Simulation — Topology, RateSolver, Tick

**Phase goal:** Build the headless, deterministic rate-based simulation core. By the end of this phase the engine can take a `GameState` plus the aggregated `Content` and (a) topologically order the production graph with cycle rejection (`Topology.js`), (b) solve steady-state rates in a single O(N+E) two-pass solve (`RateSolver.js`) producing per-node capacity/draw/surplus, per-link flow, and aggregate `goldRate`/`researchRate`, and (c) integrate those rates into stockpiles and currencies over a `dt` (`Tick.js`). Every numeric assertion uses the spec's exact §7/§10 baselines (seed graph → 0.5 bar/s, `goldRate` 2.0, `researchRate` 0.10; the 0.6-ore bottleneck → 0.3 bar/s; the multi-input steel bottleneck → 0.10 steel/s coal-binding; proportional market overflow; surplus accrual). All tests run under plain `node` with no DOM/window/`Date.now`. This phase depends only on Phase 1 (Content modules, `GameState`, `Clock`, `Tests/Runner.js` + `Tests/RunAll.js`); it produces no UI and touches no persistence.

> **Assumptions carried from Phase 1 (must already exist):** `Source/Engine/Content/*.js` exporting `RESOURCES`, `MACHINES`, `RECIPES` etc. and a `Content` aggregate; `Source/Engine/GameState.js` exporting `NewGame(clock)` / `clone(state)`; `Source/Engine/Clock.js` exporting `FakeClock`; `Tests/Runner.js` exporting `describe/it/expect/run`; `Tests/RunAll.js` importing the test files and calling `run()`. Where a task needs the aggregated content object it builds it inline from the Content modules so the solver tests do not depend on a Phase-1 `Content.js` aggregate name.

---

### Task 2.1: Topology — Kahn topo sort + cycle detection

Build the dependency-ordering primitive the solver depends on. `topoSort` returns node ids in producer→consumer order and throws `Error("cycle")` when the link set is not acyclic. This task also stubs the other three exported functions so later tasks can fill them in without breaking imports.

**Files**
- Create: `Source/Engine/Simulation/Topology.js`
- Test: `Tests/Topology.Test.js`
- Modify: `Tests/RunAll.js`

**Steps**

- [ ] **Step 1: Write the failing test for `topoSort` ordering + cycle throw.**
  Create `Tests/Topology.Test.js`:
  ```js
  import { describe, it, expect } from "./Runner.js";
  import { topoSort } from "../Source/Engine/Simulation/Topology.js";

  describe("Topology.topoSort", () => {
    it("orders a linear miner->smelter->market chain", () => {
      const nodes = [
        { id: "n_miner_0", kind: "gatherer" },
        { id: "n_smelter_0", kind: "smelter" },
        { id: "n_market_0", kind: "market" },
      ];
      const links = [
        { id: "l_0", from: "n_miner_0", to: "n_smelter_0", resourceId: "iron_ore" },
        { id: "l_1", from: "n_smelter_0", to: "n_market_0", resourceId: "iron_bar" },
      ];
      const order = topoSort(nodes, links);
      expect(order.indexOf("n_miner_0") < order.indexOf("n_smelter_0")).toBeTruthy();
      expect(order.indexOf("n_smelter_0") < order.indexOf("n_market_0")).toBeTruthy();
      expect(order.length).toBe(3);
    });

    it("includes isolated nodes with no links", () => {
      const nodes = [{ id: "a", kind: "gatherer" }, { id: "b", kind: "gatherer" }];
      const order = topoSort(nodes, []);
      expect(order.length).toBe(2);
      expect(order.includes("a")).toBeTruthy();
      expect(order.includes("b")).toBeTruthy();
    });

    it("throws on a cycle", () => {
      const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
      const links = [
        { id: "l0", from: "a", to: "b", resourceId: "x" },
        { id: "l1", from: "b", to: "c", resourceId: "x" },
        { id: "l2", from: "c", to: "a", resourceId: "x" },
      ];
      expect(() => topoSort(nodes, links)).toThrow("cycle");
    });
  });
  ```

- [ ] **Step 2: Register the test file in `RunAll.js`.**
  In `Tests/RunAll.js`, add the import near the other test imports (keep imports above the `run()` call):
  ```js
  import "./Topology.Test.js";
  ```

- [ ] **Step 3: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js Topology
  ```
  Expected: failure because `Source/Engine/Simulation/Topology.js` does not exist (module-not-found error / `0 passed`, non-zero exit code).

- [ ] **Step 4: Write the minimal `Topology.js` with `topoSort` and stubs.**
  Create `Source/Engine/Simulation/Topology.js`:
  ```js
  /** Kahn's algorithm. Returns node ids in topo order. Throws Error("cycle") if a cycle exists. */
  export function topoSort(nodes, links) {
    const ids = nodes.map((n) => n.id);
    const indeg = new Map(ids.map((id) => [id, 0]));
    const adj = new Map(ids.map((id) => [id, []]));
    for (const l of links) {
      if (!adj.has(l.from) || !indeg.has(l.to)) continue;
      adj.get(l.from).push(l.to);
      indeg.set(l.to, indeg.get(l.to) + 1);
    }
    const queue = ids.filter((id) => indeg.get(id) === 0);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const to of adj.get(id)) {
        const d = indeg.get(to) - 1;
        indeg.set(to, d);
        if (d === 0) queue.push(to);
      }
    }
    if (order.length !== ids.length) throw new Error("cycle");
    return order;
  }

  /** True if adding link from->to keeps the graph acyclic. */
  export function wouldStayAcyclic(nodes, links, from, to) {
    try {
      topoSort(nodes, [...links, { id: "__probe__", from, to, resourceId: "__probe__" }]);
      return true;
    } catch {
      return false;
    }
  }

  /** Port validity: structural legality of a candidate link. Filled in Task 2.2. */
  export function isValidLink(state, content, from, to, resourceId) {
    return false;
  }

  /** Cached topo order keyed off graph structure. Filled in Task 2.2. */
  export function orderFor(state) {
    return topoSort(state.graph.nodes, state.graph.links);
  }
  ```

- [ ] **Step 5: Run it, expect PASS.**
  Run:
  ```
  node Tests/RunAll.js Topology
  ```
  Expected: all 3 `Topology.topoSort` tests pass; summary line shows `3 passed, 0 failed` and exit code 0.

- [ ] **Step 6: Commit.**
  ```
  git add Source/Engine/Simulation/Topology.js Tests/Topology.Test.js Tests/RunAll.js
  git commit -m "feat(sim): add Topology.topoSort with Kahn cycle detection"
  ```

---

### Task 2.2: Topology — `wouldStayAcyclic`, `isValidLink`, `orderFor` cache

Complete the validity helpers the reducer will call when accepting a `ConnectLink`. `isValidLink` enforces: `from !== to`, producer can output `resourceId`, consumer can accept it, no duplicate link, and the result stays acyclic. `orderFor` caches the topo order on a non-persisted field keyed by a cheap structural signature.

**Files**
- Modify: `Source/Engine/Simulation/Topology.js`
- Test: `Tests/Topology.Test.js`

**Steps**

- [ ] **Step 1: Write the failing tests for `wouldStayAcyclic` and `isValidLink`.**
  Append to `Tests/Topology.Test.js` (add the new imports to the existing import line at the top, i.e. change it to `import { topoSort, wouldStayAcyclic, isValidLink, orderFor } from "../Source/Engine/Simulation/Topology.js";`), then add:
  ```js
  import { NewGame } from "../Source/Engine/GameState.js";
  import { FakeClock } from "../Source/Engine/Clock.js";
  import { RESOURCES } from "../Source/Engine/Content/Resources.js";
  import { MACHINES, GATHERER_VARIANTS } from "../Source/Engine/Content/Machines.js";
  import { RECIPES } from "../Source/Engine/Content/Recipes.js";

  const CONTENT = { resources: RESOURCES, machines: MACHINES, recipes: RECIPES, gathererVariants: GATHERER_VARIANTS };

  describe("Topology.wouldStayAcyclic", () => {
    it("permits a forward link", () => {
      const nodes = [{ id: "a" }, { id: "b" }];
      const links = [{ id: "l0", from: "a", to: "b", resourceId: "x" }];
      expect(wouldStayAcyclic(nodes, links, "a", "b")).toBeTruthy();
    });
    it("rejects a back link that closes a loop", () => {
      const nodes = [{ id: "a" }, { id: "b" }];
      const links = [{ id: "l0", from: "a", to: "b", resourceId: "x" }];
      expect(wouldStayAcyclic(nodes, links, "b", "a")).toBe(false);
    });
  });

  describe("Topology.isValidLink", () => {
    it("accepts smelter(iron_bar) -> market for iron_bar", () => {
      const state = NewGame(new FakeClock(0));
      expect(isValidLink(state, CONTENT, "n_smelter_0", "n_market_0", "iron_bar")).toBeTruthy();
    });
    it("rejects from===to", () => {
      const state = NewGame(new FakeClock(0));
      expect(isValidLink(state, CONTENT, "n_miner_0", "n_miner_0", "iron_ore")).toBe(false);
    });
    it("rejects a resource the producer cannot output", () => {
      const state = NewGame(new FakeClock(0));
      // miner is assigned iron_ore, cannot output timber
      expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "timber")).toBe(false);
    });
    it("rejects a duplicate of an existing link", () => {
      const state = NewGame(new FakeClock(0));
      // l_0 already carries iron_ore miner->smelter
      expect(isValidLink(state, CONTENT, "n_miner_0", "n_smelter_0", "iron_ore")).toBe(false);
    });
    it("rejects a resource the consumer cannot accept", () => {
      const state = NewGame(new FakeClock(0));
      // smelter runs r_iron_bar (inputs iron_ore) — cannot accept iron_bar as input
      expect(isValidLink(state, CONTENT, "n_smelter_0", "n_smelter_0", "iron_bar")).toBe(false);
    });
  });

  describe("Topology.orderFor", () => {
    it("returns a valid topo order for the seed graph and caches it", () => {
      const state = NewGame(new FakeClock(0));
      const a = orderFor(state);
      const b = orderFor(state);
      expect(a.length).toBe(3);
      expect(a.indexOf("n_miner_0") < a.indexOf("n_smelter_0")).toBeTruthy();
      expect(a).toBe(b); // cached reference reused while structure unchanged
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js Topology
  ```
  Expected: the `wouldStayAcyclic` tests pass (already implemented), but `isValidLink` tests fail (stub returns `false` for the accept case) and `orderFor` cache-identity test fails (`a` !== `b` since `orderFor` rebuilds each call). Failure summary, non-zero exit.

- [ ] **Step 3: Implement the producer-output and consumer-accept helpers + `isValidLink`.**
  In `Source/Engine/Simulation/Topology.js`, replace the `isValidLink` stub with:
  ```js
  /** Resources a node can emit downstream given its kind/assignment. */
  function outputsOf(node, content) {
    if (node.kind === "gatherer") return node.resourceId ? [node.resourceId] : [];
    if (node.kind === "smelter" || node.kind === "workshop") {
      const r = content.recipes[node.recipeId];
      return r ? [r.output] : [];
    }
    return []; // market and scholar are sinks, never producers
  }

  /** Resources a node can consume as input given its kind/assignment. */
  function acceptsOf(node, content) {
    if (node.kind === "smelter" || node.kind === "workshop") {
      const r = content.recipes[node.recipeId];
      return r ? Object.keys(r.inputs) : [];
    }
    if (node.kind === "scholar") return ["parchment"];
    if (node.kind === "market") return null; // market accepts any listed resource (checked at solve time)
    return []; // gatherer takes no inputs
  }

  /** Port validity: a candidate link from->to carrying resourceId is structurally legal. */
  export function isValidLink(state, content, from, to, resourceId) {
    if (from === to) return false;
    const nodes = state.graph.nodes;
    const links = state.graph.links;
    const fromNode = nodes.find((n) => n.id === from);
    const toNode = nodes.find((n) => n.id === to);
    if (!fromNode || !toNode) return false;
    if (!outputsOf(fromNode, content).includes(resourceId)) return false;
    const accepts = acceptsOf(toNode, content);
    if (accepts !== null && !accepts.includes(resourceId)) return false;
    if (links.some((l) => l.from === from && l.to === to && l.resourceId === resourceId)) return false;
    return wouldStayAcyclic(nodes, links, from, to);
  }
  ```

- [ ] **Step 4: Implement the `orderFor` structural cache.**
  Replace the `orderFor` stub with:
  ```js
  /** Cheap structural signature: node ids + link endpoints. */
  function graphSig(state) {
    const g = state.graph;
    return g.nodes.map((n) => n.id).join(",") + "|" + g.links.map((l) => l.from + ">" + l.to).join(",");
  }

  /** Cached topo order keyed off graph structure (rebuilt when topology changes). */
  export function orderFor(state) {
    const sig = graphSig(state);
    if (!state._topo || state._topo.sig !== sig) {
      state._topo = { sig, order: topoSort(state.graph.nodes, state.graph.links) };
    }
    return state._topo.order;
  }
  ```

- [ ] **Step 5: Run it, expect PASS.**
  Run:
  ```
  node Tests/RunAll.js Topology
  ```
  Expected: all `Topology.*` tests pass (3 topoSort + 2 wouldStayAcyclic + 5 isValidLink + 1 orderFor = 11 passed, 0 failed), exit code 0.

- [ ] **Step 6: Commit.**
  ```
  git add Source/Engine/Simulation/Topology.js Tests/Topology.Test.js
  git commit -m "feat(sim): add link validity checks and cached topo order"
  ```

---

### Task 2.3: KnownGraph fixtures — hand-computed expected rates

Build the fixture module the solver tests assert against. Each fixture returns a `{ state, content }` pair plus the hand-computed expected numbers, so the solver test reads canonical values from one place. `content` is assembled from the Content modules. These graphs are constructed directly (not via `NewGame`) except the seed fixture, which reuses the canonical seed.

**Files**
- Create: `Tests/Fixtures/KnownGraph.js`
- Test: (used by Task 2.4; no standalone run needed here, but we add a sanity import test to confirm it loads)
- Modify: `Tests/RunAll.js`

**Steps**

- [ ] **Step 1: Write the failing sanity test that imports the fixtures.**
  Create `Tests/RateSolver.Test.js` with only an import-sanity check for now (it grows in Task 2.4):
  ```js
  import { describe, it, expect } from "./Runner.js";
  import { seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph } from "./Fixtures/KnownGraph.js";

  describe("KnownGraph fixtures load", () => {
    it("exposes the five named fixtures with state+content", () => {
      for (const make of [seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph]) {
        const f = make();
        expect(!!f.state).toBeTruthy();
        expect(!!f.content).toBeTruthy();
        expect(Array.isArray(f.state.graph.nodes)).toBeTruthy();
      }
    });
  });
  ```

- [ ] **Step 2: Register the new test file in `RunAll.js`.**
  In `Tests/RunAll.js` add:
  ```js
  import "./RateSolver.Test.js";
  ```

- [ ] **Step 3: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: failure — `Tests/Fixtures/KnownGraph.js` does not exist (module-not-found), non-zero exit.

- [ ] **Step 4: Write the complete `KnownGraph.js` fixtures.**
  Create `Tests/Fixtures/KnownGraph.js`:
  ```js
  import { NewGame } from "../../Source/Engine/GameState.js";
  import { FakeClock } from "../../Source/Engine/Clock.js";
  import { RESOURCES } from "../../Source/Engine/Content/Resources.js";
  import { MACHINES, GATHERER_VARIANTS } from "../../Source/Engine/Content/Machines.js";
  import { RECIPES } from "../../Source/Engine/Content/Recipes.js";

  /** Aggregate content slice the solver needs. */
  export function content() {
    return { resources: RESOURCES, machines: MACHINES, recipes: RECIPES, gathererVariants: GATHERER_VARIANTS };
  }

  /** Default unlocks block used by hand-built fixtures (mirrors NewGame seed). */
  function baseUnlocks(over = {}) {
    return {
      researchOwned: [],
      recipesUnlocked: ["r_iron_bar"],
      machinesUnlocked: ["gatherer", "smelter", "market"],
      marketListings: ["iron_ore", "timber", "hide", "coal_raw", "gemstone", "iron_bar"],
      titheRate: 0.05,
      offlineCapHours: 8,
      productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
      gearTiersUnlocked: [],
      autoSell: false,
      heroSlots: 1,
      ...over,
    };
  }

  /** Minimal state wrapper around a graph + unlocks (no heroes/territories needed for solver). */
  function stateOf(graph, unlocks) {
    return { currencies: { gold: 0, research: 0, renown: 0 }, graph, unlocks: unlocks || baseUnlocks() };
  }

  /** SEED: canonical Miner L1 -> Smelter L1 r_iron_bar -> Market L1.
   *  gatherer cap 1.0 ore/s; r_iron_bar inputs iron_ore:2, baseOut 0.5;
   *  smelter out = min(0.5, 1.0/2) = 0.5 bar/s; market sells 0.5 iron_bar @4.0 => goldRate 2.0; researchRate 2.0*0.05=0.10. */
  export function seedGraph() {
    const state = NewGame(new FakeClock(0));
    return {
      state,
      content: content(),
      expected: {
        smelterOut: 0.5,
        goldRate: 2.0,
        researchRate: 0.1,
        oreCap: 1.0,
      },
    };
  }

  /** BOTTLENECK: a gatherer producing only 0.6 ore/s feeds the smelter.
   *  We model the limited supply by a gatherer whose capacity is 0.6 (level scaling won't hit 0.6,
   *  so we inject it via a one-off fixture gatherer 'cap' override read by the test through expected). */
  export function bottleneckGraph() {
    // Build a smelter fed by exactly 0.6 ore/s. Simplest exact construction: a single upstream
    // node that offers 0.6 ore/s. Use a gatherer with a fixture-only fractional level is not exact,
    // so we feed the smelter from a gatherer at L1 (1.0) but cap supply via a downstream-only test
    // that reads availableOut. Instead, model directly: place ONE gatherer offering 0.6 by using a
    // recipe-free 'supplier' is not a kind; so use a smelter whose own output we pin.
    // Cleanest exact: gatherer L1 = 1.0 ore is too much. We therefore use the documented number by
    // building a smelter with incoming iron_ore = 0.6 using a tiny helper graph: gatherer feeding a
    // PASS-THROUGH is unavailable. So we assert against a gatherer whose productionBonus = 0.6.
    const nodes = [
      { id: "g", kind: "gatherer", level: 1, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
      { id: "s", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 1, y: 0 } },
    ];
    const links = [{ id: "l0", from: "g", to: "s", resourceId: "iron_ore" }];
    const graph = { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 };
    // gatherer bonus 0.6 -> cap = (1.0 + 0.5*0) * 0.6 = 0.6 ore/s; smelter out = min(0.5, 0.6/2) = 0.3.
    const unlocks = baseUnlocks({ productionBonuses: { gatherer: 0.6, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 } });
    return {
      state: stateOf(graph, unlocks),
      content: content(),
      expected: { oreOut: 0.6, smelterOut: 0.3 },
    };
  }

  /** STEEL multi-input bottleneck: r_steel needs iron_bar:2, coal:1, cap 0.25.
   *  Feed iron_bar 0.5/s and coal 0.10/s. limit = min(0.25, 0.5/2=0.25, 0.10/1=0.10) = 0.10 (coal binds).
   *  We pin the two upstream supplies using gatherers with bonus producing those exact rates, but
   *  iron_bar/coal are intermediates — so we use two smelters whose outputs we pin via gatherer bonuses.
   *  Simpler exact construction: two 'gatherer' nodes assigned the intermediate ids directly via fixture
   *  (the solver's gatherer branch outputs node.resourceId at capacity regardless of tier). */
  export function steelGraph() {
    const nodes = [
      { id: "fb", kind: "gatherer", level: 1, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
      { id: "fc", kind: "gatherer", level: 1, resourceId: "coal", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } },
      { id: "st", kind: "smelter", level: 1, resourceId: null, recipeId: "r_steel", stockpile: {}, pos: { x: 1, y: 0 } },
    ];
    const links = [
      { id: "l0", from: "fb", to: "st", resourceId: "iron_bar" },
      { id: "l1", from: "fc", to: "st", resourceId: "coal" },
    ];
    const graph = { nodes, links, nextNodeSeq: 3, nextLinkSeq: 2 };
    // fb cap = 1.0*0.5 = 0.5 iron_bar/s ; fc cap = 1.0*0.10 = 0.10 coal/s (per-kind bonus can't differ
    // between the two gatherers, so use level scaling instead): keep both at bonus 1.0 and pin supplies
    // by reading expected from the recipe-free model below.
    // fb L1 = 1.0 iron_bar/s, fc L1 = 1.0 coal/s would give limit=min(0.25,0.5,1.0)=0.25 — not the doc case.
    // To get the documented 0.10 coal-binding case we throttle coal supply to 0.10 via a SECOND smelter.
    return {
      state: stateOf(graph),
      content: content(),
      expected: { steelOutWithFullSupply: 0.25 }, // see steelCoalBoundGraph for the 0.10 case
    };
  }

  /** STEEL coal-bound (the documented §10 case): iron_bar 0.5/s, coal 0.10/s -> steel 0.10/s.
   *  Construct exact 0.5 iron_bar and 0.10 coal supplies using crafter nodes fed by abundant gatherers:
   *   - iron_bar: gatherer iron_ore (cap large) -> smelter r_iron_bar (baseOut 0.5) => 0.5 iron_bar/s
   *   - coal:     gatherer coal_raw (bonus 0.10) -> smelter r_coal (baseOut 1.0, but supply 0.10 binds) => 0.10 coal/s */
  export function steelCoalBoundGraph() {
    const nodes = [
      { id: "gore", kind: "gatherer", level: 3, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // cap 1.0+0.5*2=2.0 ore/s
      { id: "sbar", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 1, y: 0 } }, // out min(0.5, 2.0/2=1.0)=0.5
      { id: "gcoalraw", kind: "gatherer", level: 1, resourceId: "coal_raw", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } },
      { id: "scoal", kind: "smelter", level: 1, resourceId: null, recipeId: "r_coal", stockpile: {}, pos: { x: 1, y: 1 } }, // baseOut 1.0; supply binds
      { id: "ssteel", kind: "smelter", level: 1, resourceId: null, recipeId: "r_steel", stockpile: {}, pos: { x: 2, y: 0 } },
    ];
    const links = [
      { id: "l0", from: "gore", to: "sbar", resourceId: "iron_ore" },
      { id: "l1", from: "sbar", to: "ssteel", resourceId: "iron_bar" },
      { id: "l2", from: "gcoalraw", to: "scoal", resourceId: "coal_raw" },
      { id: "l3", from: "scoal", to: "ssteel", resourceId: "coal" },
    ];
    const graph = { nodes, links, nextNodeSeq: 5, nextLinkSeq: 4 };
    // gcoalraw bonus 0.10 -> 0.10 coal_raw/s; r_coal inputs coal_raw:1 baseOut 1.0 -> out min(1.0, 0.10/1)=0.10 coal/s.
    const unlocks = baseUnlocks({
      recipesUnlocked: ["r_iron_bar", "r_coal", "r_steel"],
      productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
    });
    // To pin coal supply to exactly 0.10 without per-node bonuses, give the coal_raw gatherer its own
    // fixture field 'capOverride' is NOT supported by solver; instead we feed scoal through a low gatherer:
    // gatherer L1 coal_raw = 1.0/s would make coal 1.0/s. We need 0.10. So model coal_raw gatherer with a
    // negative-impossible level. Therefore we use a per-kind bonus split: not possible (gatherer shares bonus).
    // RESOLUTION: feed coal via the production-bonus-free path by setting gcoalraw to a single node graph
    // with gatherer kind whose cap we accept as 1.0, then THROTTLE at r_coal by limiting coal_raw supply
    // through a fractional link is unavailable. We instead assert the §10 case using injected supply (Task 2.4
    // uses a direct two-supplier graph with pinned gatherer resourceIds 'iron_bar' & 'coal' and node levels).
    return { state: stateOf(graph, unlocks), content: content() };
  }

  /** SURPLUS accrual: a gatherer with NO downstream consumer accrues its full output to its own stockpile.
   *  miner iron_ore L1 = 1.0 ore/s, no links -> surplusRate[miner].iron_ore = 1.0. */
  export function surplusGraph() {
    const nodes = [
      { id: "m", kind: "gatherer", level: 1, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
    ];
    const graph = { nodes, links: [], nextNodeSeq: 1, nextLinkSeq: 0 };
    return { state: stateOf(graph), content: content(), expected: { surplusOre: 1.0 } };
  }

  /** MARKET overflow: two listed inputs totaling 8/s into a Market cap 5/s -> proportional scale 5/8.
   *  Feed iron_bar 4/s and iron_ore 4/s (both listed). scale = 5/8 = 0.625.
   *  sold iron_bar = 2.5 @4.0 = 10.0 ; sold iron_ore = 2.5 @0.5 = 1.25 ; goldRate = 11.25. */
  export function marketOverflowGraph() {
    const nodes = [
      { id: "gbar", kind: "gatherer", level: 7, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // cap 1.0+0.5*6=4.0
      { id: "gore", kind: "gatherer", level: 7, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } }, // cap 4.0
      { id: "mk", kind: "market", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 1, y: 0 } }, // cap 5.0
    ];
    const links = [
      { id: "l0", from: "gbar", to: "mk", resourceId: "iron_bar" },
      { id: "l1", from: "gore", to: "mk", resourceId: "iron_ore" },
    ];
    const graph = { nodes, links, nextNodeSeq: 3, nextLinkSeq: 2 };
    return {
      state: stateOf(graph),
      content: content(),
      expected: { cap: 5.0, scale: 0.625, soldBar: 2.5, soldOre: 2.5, goldRate: 11.25, researchRate: 11.25 * 0.05 },
    };
  }

  /** CYCLE: a closed loop that topoSort must reject. */
  export function cycleGraph() {
    const nodes = [
      { id: "a", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 0, y: 0 } },
      { id: "b", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 1, y: 0 } },
    ];
    const links = [
      { id: "l0", from: "a", to: "b", resourceId: "iron_bar" },
      { id: "l1", from: "b", to: "a", resourceId: "iron_bar" },
    ];
    const graph = { nodes, links, nextNodeSeq: 2, nextLinkSeq: 2 };
    return { state: stateOf(graph), content: content() };
  }
  ```

  > **Note on the steel coal-bound case:** because all gatherers of one kind share `productionBonuses.gatherer`, the cleanest *exact* 0.5-iron_bar + 0.10-coal supply is built directly in the Task 2.4 test using two `gatherer` nodes whose `resourceId` is the intermediate id (`iron_bar`, `coal`) with chosen levels — the solver's gatherer branch emits `node.resourceId` at capacity regardless of tier, which is exactly what a fixture supply line needs. Task 2.4 therefore defines `steelCoalBoundGraph`'s assertion against a directly-pinned graph and does not rely on the throttled-recipe path sketched above. Keep `steelCoalBoundGraph` exported for completeness; the authoritative steel test uses an inline pinned-supply graph shown in Task 2.4.

- [ ] **Step 5: Run it, expect PASS (fixtures load).**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: the single `KnownGraph fixtures load` test passes (`1 passed, 0 failed`), exit code 0. (The five named fixtures imported are `seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph` — all defined.)

- [ ] **Step 6: Commit.**
  ```
  git add Tests/Fixtures/KnownGraph.js Tests/RateSolver.Test.js Tests/RunAll.js
  git commit -m "test(sim): add hand-computed KnownGraph rate fixtures"
  ```

---

### Task 2.4: RateSolver — `capacity` + Pass 1 (forward) for gatherer/crafter

Implement the level-scaled `capacity(node, state, content)` and the forward Pass 1 for gatherer and crafter kinds (the supply-bottleneck `min(capacity, min_i supply_i/inputAmt_i)`). Market and scholar are added in Task 2.5. Pass 2 surplus/backpressure is added in Task 2.6. This task asserts the seed-graph smelter throughput (0.5 bar/s), the 0.6-ore bottleneck (0.3 bar/s), and the multi-input steel coal-bound case (0.10 steel/s).

**Files**
- Create: `Source/Engine/Simulation/RateSolver.js`
- Test: `Tests/RateSolver.Test.js`

**Steps**

- [ ] **Step 1: Write the failing tests for `capacity` and crafter throughput.**
  Append to `Tests/RateSolver.Test.js` (extend the existing import line to also import the solver, i.e. add `import { solve, capacity } from "../Source/Engine/Simulation/RateSolver.js";` near the top, and add the `steelCoalBoundGraph` to the fixtures import is unnecessary — the steel case below builds its graph inline):
  ```js
  describe("RateSolver.capacity", () => {
    it("gatherer L1 iron_ore -> 1.0", () => {
      const { state, content } = seedGraph();
      const miner = state.graph.nodes.find((n) => n.id === "n_miner_0");
      expect(capacity(miner, state, content)).toBeCloseTo(1.0, 1e-9);
    });
    it("smelter L1 r_iron_bar -> baseOut 0.5 (no level bonus)", () => {
      const { state, content } = seedGraph();
      const sm = state.graph.nodes.find((n) => n.id === "n_smelter_0");
      expect(capacity(sm, state, content)).toBeCloseTo(0.5, 1e-9);
    });
    it("gatherer L3 iron_ore -> 1.0 + 0.5*2 = 2.0", () => {
      const { state, content } = seedGraph();
      const m = { ...state.graph.nodes[0], level: 3 };
      expect(capacity(m, state, content)).toBeCloseTo(2.0, 1e-9);
    });
    it("smelter capacity scales with productionBonuses.smelter", () => {
      const { state, content } = seedGraph();
      state.unlocks.productionBonuses.smelter = 1.25;
      const sm = state.graph.nodes.find((n) => n.id === "n_smelter_0");
      expect(capacity(sm, state, content)).toBeCloseTo(0.625, 1e-9);
    });
  });

  describe("RateSolver Pass 1 — crafter throughput", () => {
    it("seed graph: smelter outputs 0.5 iron_bar/s (cap-bound)", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      expect(solved.availableOut["n_smelter_0"]["iron_bar"]).toBeCloseTo(0.5, 1e-9);
    });
    it("0.6 ore/s feed -> smelter outputs 0.3 bar/s (supply-bound)", () => {
      const { state, content, expected } = bottleneckGraph();
      const solved = solve(state, content);
      expect(solved.availableOut["g"]["iron_ore"]).toBeCloseTo(expected.oreOut, 1e-9); // 0.6
      expect(solved.availableOut["s"]["iron_bar"]).toBeCloseTo(expected.smelterOut, 1e-9); // 0.3
    });
    it("r_steel fed 0.5 iron_bar/s + 0.10 coal/s -> 0.10 steel/s (coal binds)", () => {
      // Direct pinned-supply graph: two gatherers emitting the intermediates at exact rates.
      // gatherer 'iron_bar' L1 -> 1.0/s is too much; we need exactly 0.5 and 0.10.
      // Use levels/bonuses: iron_bar gatherer at L1 with gatherer bonus is shared, so instead pin
      // supply through links by choosing node levels that hit the targets:
      //   ib: gatherer iron_bar, we want 0.5 -> not reachable by integer levels (min 1.0).
      // So we feed the steel smelter from two SMELTER suppliers whose baseOut already match:
      //   r_iron_bar baseOut 0.5 (fed abundant ore) -> 0.5 iron_bar/s
      //   r_coal baseOut 1.0 but fed only 0.10 coal_raw/s -> 0.10 coal/s
      const nodes = [
        { id: "gore", kind: "gatherer", level: 3, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
        { id: "sbar", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 1, y: 0 } },
        { id: "gcr", kind: "gatherer", level: 1, resourceId: "coal_raw", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } },
        { id: "scoal", kind: "smelter", level: 1, resourceId: null, recipeId: "r_coal", stockpile: {}, pos: { x: 1, y: 1 } },
        { id: "ssteel", kind: "smelter", level: 1, resourceId: null, recipeId: "r_steel", stockpile: {}, pos: { x: 2, y: 0 } },
      ];
      const links = [
        { id: "l0", from: "gore", to: "sbar", resourceId: "iron_ore" },
        { id: "l1", from: "sbar", to: "ssteel", resourceId: "iron_bar" },
        { id: "l2", from: "gcr", to: "scoal", resourceId: "coal_raw" },
        { id: "l3", from: "scoal", to: "ssteel", resourceId: "coal" },
      ];
      const state = {
        currencies: { gold: 0, research: 0, renown: 0 },
        graph: { nodes, links, nextNodeSeq: 5, nextLinkSeq: 4 },
        unlocks: {
          researchOwned: [], recipesUnlocked: ["r_iron_bar", "r_coal", "r_steel"],
          machinesUnlocked: ["gatherer", "smelter", "market"],
          marketListings: ["iron_ore", "timber", "hide", "coal_raw", "gemstone", "iron_bar"],
          titheRate: 0.05, offlineCapHours: 8,
          // gatherer bonus 0.10 so gcr emits 0.10 coal_raw/s -> r_coal binds at 0.10 coal/s;
          // gore at bonus 0.10 emits 0.10*2.0(L3)=0.20 ore/s -> r_iron_bar out min(0.5,0.20/2=0.10)=0.10 — wrong.
          // We need gore abundant AND gcr scarce, but they share the gatherer bonus. Resolve by giving
          // gore enough level to overcome the 0.10 bonus: L? cap=(1+0.5*(L-1))*0.10. For >=1.0 ore need L>=19.
          // Simpler: keep gatherer bonus 1.0 and throttle coal via a low coal_raw gatherer is impossible at
          // L1=1.0. THEREFORE feed coal directly with the bonus on coal supply only is not separable.
          productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
          gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
        },
      };
      // gore L3 -> 2.0 ore/s ; r_iron_bar out = min(0.5, 2.0/2=1.0) = 0.5 iron_bar/s.
      // gcr L1 -> 1.0 coal_raw/s ; r_coal out = min(1.0, 1.0/1) = 1.0 coal/s. That gives coal 1.0, not 0.10.
      // To force the documented 0.10 coal-binding, set scoal recipe supply by lowering gcr via per-NODE
      // capacity: the contract has no per-node bonus, so we instead model the §10 numbers by feeding the
      // steel smelter from two PINNED gatherers whose resourceId is the intermediate itself.
      const pinnedNodes = [
        { id: "fib", kind: "gatherer", level: 1, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
        { id: "fco", kind: "gatherer", level: 1, resourceId: "coal", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } },
        { id: "st", kind: "smelter", level: 1, resourceId: null, recipeId: "r_steel", stockpile: {}, pos: { x: 1, y: 0 } },
      ];
      const pinnedLinks = [
        { id: "p0", from: "fib", to: "st", resourceId: "iron_bar" },
        { id: "p1", from: "fco", to: "st", resourceId: "coal" },
      ];
      // We want fib -> 0.5 iron_bar/s and fco -> 0.10 coal/s. Shared gatherer bonus can't differ,
      // so pin via per-node levels won't hit 0.5/0.10 either. Final resolution: assert the solver's
      // bottleneck FORMULA directly with supplies injected through availableOut seeding is internal.
      // Instead, verify the min() math on a graph whose supplies are 0.5 and 0.10 by construction:
      //   fib bonus path: set gatherer bonus to 0.5 -> fib emits 0.5 iron_bar/s AND fco emits 0.5 coal/s.
      //   That makes coal 0.5 not 0.10. So coal would bind at min(0.25,0.5/2=0.25,0.5/1=0.5)=0.25 (cap binds).
      // The clean, contract-faithful way to get DIFFERENT supply rates is DIFFERENT node levels under a
      // single bonus: gatherer cap = (1 + 0.5*(L-1)) * bonus. With bonus=0.10:
      //   L1 -> 0.10  ; we want coal=0.10 -> fco L1, bonus 0.10. iron_bar=0.5 -> (1+0.5*(L-1))*0.10=0.5
      //   => 1+0.5*(L-1)=5 => L-1=8 => L=9. So fib L9 -> 0.5 iron_bar/s.
      pinnedNodes[0].level = 9; // fib -> (1+0.5*8)*0.10 = 5*0.10 = 0.5 iron_bar/s
      pinnedNodes[1].level = 1; // fco -> (1+0.5*0)*0.10 = 0.10 coal/s
      const pinnedState = {
        currencies: { gold: 0, research: 0, renown: 0 },
        graph: { nodes: pinnedNodes, links: pinnedLinks, nextNodeSeq: 3, nextLinkSeq: 2 },
        unlocks: {
          researchOwned: [], recipesUnlocked: ["r_steel"],
          machinesUnlocked: ["gatherer", "smelter", "market"],
          marketListings: [],
          titheRate: 0.05, offlineCapHours: 8,
          productionBonuses: { gatherer: 0.10, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
          gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
        },
      };
      const solved = solve(pinnedState, content());
      expect(solved.availableOut["fib"]["iron_bar"]).toBeCloseTo(0.5, 1e-9);
      expect(solved.availableOut["fco"]["coal"]).toBeCloseTo(0.10, 1e-9);
      // limit = min(cap 0.25, iron_bar 0.5/2 = 0.25, coal 0.10/1 = 0.10) = 0.10 -> coal binds.
      expect(solved.availableOut["st"]["steel"]).toBeCloseTo(0.10, 1e-9);
    });
  });
  ```

  > Note: the steel test imports `content` from the fixtures module — add `content` to the `KnownGraph.js` import in `RateSolver.Test.js` (i.e. `import { seedGraph, bottleneckGraph, steelGraph, surplusGraph, marketOverflowGraph, content } from "./Fixtures/KnownGraph.js";`).

- [ ] **Step 2: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: failure — `Source/Engine/Simulation/RateSolver.js` does not exist (module-not-found), non-zero exit.

- [ ] **Step 3: Write `RateSolver.js` with `capacity` + Pass 1 for gatherer/crafter (market/scholar as no-ops, surplus empty for now).**
  Create `Source/Engine/Simulation/RateSolver.js`:
  ```js
  import { topoSort } from "./Topology.js";

  /** Capacity per kind (level adds to the relevant base; bonus = productionBonuses[kind] or 1.0). */
  export function capacity(node, state, content) {
    const m = content.machines[node.kind];
    const bonus = (state.unlocks.productionBonuses && state.unlocks.productionBonuses[node.kind]) || 1.0;
    if (node.kind === "gatherer") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
    if (node.kind === "smelter" || node.kind === "workshop") {
      const r = content.recipes[node.recipeId];
      if (!r) return 0;
      return (r.baseOut + m.rateGain * (node.level - 1)) * bonus; // level adds to recipe base output
    }
    if (node.kind === "market") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
    if (node.kind === "scholar") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
    return 0;
  }

  /** Single O(N+E) two-pass steady-state solve. Pure. */
  export function solve(state, content) {
    const nodes = state.graph.nodes;
    const links = state.graph.links;
    const order = topoSort(nodes, links);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const inLinks = new Map(nodes.map((n) => [n.id, []]));
    const outLinks = new Map(nodes.map((n) => [n.id, []]));
    for (const l of links) {
      if (inLinks.has(l.to)) inLinks.get(l.to).push(l);
      if (outLinks.has(l.from)) outLinks.get(l.from).push(l);
    }

    const availableOut = {};
    const linkFlow = {};
    const surplusRate = {};
    const capacityByNode = {};
    const perNodeDraw = {};
    const sold = {}; // nodeId -> {resId: units/s}
    const goldByNode = {}; // nodeId -> gold/s
    const researchByNode = {}; // nodeId -> research/s (scholar + market tithe)

    // --- Pass 1: forward in topo order ---
    for (const id of order) {
      const node = byId.get(id);
      const incoming = {};
      for (const L of inLinks.get(id)) {
        const offered = (availableOut[L.from] && availableOut[L.from][L.resourceId]) || 0;
        incoming[L.resourceId] = (incoming[L.resourceId] || 0) + offered;
        linkFlow[L.id] = offered; // provisional
      }
      const cap = capacity(node, state, content);
      capacityByNode[id] = cap;

      if (node.kind === "gatherer") {
        availableOut[id] = node.resourceId ? { [node.resourceId]: cap } : {};
      } else if (node.kind === "smelter" || node.kind === "workshop") {
        const r = content.recipes[node.recipeId];
        if (!r) {
          availableOut[id] = {};
          perNodeDraw[id] = {};
          continue;
        }
        let limit = cap;
        for (const inId in r.inputs) {
          limit = Math.min(limit, (incoming[inId] || 0) / r.inputs[inId]);
        }
        const out = Math.max(0, limit);
        availableOut[id] = { [r.output]: out };
        const draw = {};
        for (const inId in r.inputs) draw[inId] = out * r.inputs[inId];
        perNodeDraw[id] = draw;
      } else {
        // market and scholar — implemented in Task 2.5
        availableOut[id] = {};
        perNodeDraw[id] = {};
      }
    }

    // Pass 2 (surplus/backpressure) added in Task 2.6.

    return {
      capacityByNode,
      availableOut,
      linkFlow,
      surplusRate,
      goldRate: 0,
      researchRate: 0,
      perNodeDraw,
    };
  }
  ```

- [ ] **Step 4: Run it, expect PASS for the implemented assertions.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: the `RateSolver.capacity` group (4 tests) and `RateSolver Pass 1 — crafter throughput` group (3 tests) plus the earlier `KnownGraph fixtures load` test all pass (`8 passed, 0 failed`), exit code 0. Specifically `n_smelter_0` outputs 0.5, the 0.6-ore feed yields 0.3, and the steel graph yields 0.10 (coal binding).

- [ ] **Step 5: Commit.**
  ```
  git add Source/Engine/Simulation/RateSolver.js Tests/RateSolver.Test.js
  git commit -m "feat(sim): add RateSolver capacity + forward pass for gatherer/crafter"
  ```

---

### Task 2.5: RateSolver — Market (proportional overflow + gold + tithe) and Scholar (parchment 1:1)

Add the market sink and scholar branches to Pass 1, computing `goldRate` and `researchRate`. Market sells only listed resources, shares its capacity across input links, and scales proportionally on overflow; it emits `goldRate = Σ(sold × basePrice)` and a tithe `researchRate = goldRate × titheRate`. Scholar converts incoming parchment 1:1 up to capacity. This task asserts the seed-graph `goldRate` 2.0 / `researchRate` 0.10 and the proportional market-overflow case.

**Files**
- Modify: `Source/Engine/Simulation/RateSolver.js`
- Test: `Tests/RateSolver.Test.js`

**Steps**

- [ ] **Step 1: Write the failing tests for market gold/tithe, overflow, and scholar.**
  Append to `Tests/RateSolver.Test.js`:
  ```js
  describe("RateSolver — Market sink", () => {
    it("seed graph: goldRate 2.0, researchRate 0.10", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      expect(solved.goldRate).toBeCloseTo(2.0, 1e-9);
      expect(solved.researchRate).toBeCloseTo(0.1, 1e-9);
    });
    it("proportional overflow: 8/s into cap 5/s scales 5/8, goldRate 11.25", () => {
      const { state, content, expected } = marketOverflowGraph();
      const solved = solve(state, content);
      expect(solved.goldRate).toBeCloseTo(expected.goldRate, 1e-9); // 11.25
      expect(solved.researchRate).toBeCloseTo(expected.researchRate, 1e-9); // 0.5625
    });
    it("market does not sell an unlisted resource", () => {
      const { state, content } = marketOverflowGraph();
      // Remove iron_bar from listings: only iron_ore (4/s) sells, under cap 5 -> no scaling.
      state.unlocks.marketListings = ["iron_ore"];
      const solved = solve(state, content);
      // sold iron_ore 4.0 @0.5 = 2.0 gold/s (iron_bar ignored, total 4 < cap 5)
      expect(solved.goldRate).toBeCloseTo(2.0, 1e-9);
    });
    it("res_trade_routes tithe 0.07 applies", () => {
      const { state, content } = seedGraph();
      state.unlocks.titheRate = 0.07;
      const solved = solve(state, content);
      expect(solved.researchRate).toBeCloseTo(2.0 * 0.07, 1e-9); // 0.14
    });
  });

  describe("RateSolver — Scholar", () => {
    it("scholar converts parchment 1:1 up to capacity", () => {
      // forester timber -> workshop r_parchment -> scholar
      const nodes = [
        { id: "gt", kind: "gatherer", level: 1, resourceId: "timber", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 1.0 timber/s
        { id: "wp", kind: "workshop", level: 1, resourceId: null, recipeId: "r_parchment", stockpile: {}, pos: { x: 1, y: 0 } }, // baseOut 0.5, in timber:1 -> 0.5/s
        { id: "sc", kind: "scholar", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 2, y: 0 } }, // cap 0.5 research/s
      ];
      const links = [
        { id: "l0", from: "gt", to: "wp", resourceId: "timber" },
        { id: "l1", from: "wp", to: "sc", resourceId: "parchment" },
      ];
      const state = {
        currencies: { gold: 0, research: 0, renown: 0 },
        graph: { nodes, links, nextNodeSeq: 3, nextLinkSeq: 2 },
        unlocks: {
          researchOwned: [], recipesUnlocked: ["r_parchment"],
          machinesUnlocked: ["gatherer", "smelter", "market", "workshop", "scholar"],
          marketListings: [], titheRate: 0.05, offlineCapHours: 8,
          productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
          gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
        },
      };
      const solved = solve(state, content());
      // parchment supply 0.5/s, scholar cap 0.5 -> research 0.5/s.
      expect(solved.researchRate).toBeCloseTo(0.5, 1e-9);
      expect(solved.perNodeDraw["sc"]["parchment"]).toBeCloseTo(0.5, 1e-9);
    });
    it("scholar clamps to capacity when parchment supply exceeds it", () => {
      // pin parchment supply at 1.0 via a gatherer assigned 'parchment'; scholar cap 0.5 -> research 0.5.
      const nodes = [
        { id: "gp", kind: "gatherer", level: 1, resourceId: "parchment", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 1.0/s
        { id: "sc", kind: "scholar", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 1, y: 0 } }, // cap 0.5
      ];
      const links = [{ id: "l0", from: "gp", to: "sc", resourceId: "parchment" }];
      const state = {
        currencies: { gold: 0, research: 0, renown: 0 },
        graph: { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 },
        unlocks: {
          researchOwned: [], recipesUnlocked: [],
          machinesUnlocked: ["gatherer", "scholar"], marketListings: [],
          titheRate: 0.05, offlineCapHours: 8,
          productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
          gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
        },
      };
      const solved = solve(state, content());
      expect(solved.researchRate).toBeCloseTo(0.5, 1e-9); // clamped to cap, not 1.0
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: the new `Market` and `Scholar` tests fail (current solver leaves market/scholar branches as no-ops, so `goldRate`/`researchRate` are 0). Failure summary, non-zero exit.

- [ ] **Step 3: Replace the market/scholar no-op branch with the real implementation.**
  In `Source/Engine/Simulation/RateSolver.js`, replace the `else { // market and scholar` block inside the Pass 1 loop with:
  ```js
      } else if (node.kind === "scholar") {
        const parch = incoming["parchment"] || 0;
        const out = Math.min(cap, parch);
        availableOut[id] = {};
        perNodeDraw[id] = { parchment: out };
        researchByNode[id] = out;
      } else if (node.kind === "market") {
        const sellable = {};
        let total = 0;
        for (const resId in incoming) {
          const res = content.resources[resId];
          if (state.unlocks.marketListings.includes(resId) && res && res.basePrice != null) {
            sellable[resId] = incoming[resId];
            total += incoming[resId];
          }
        }
        const scale = total > cap && total > 0 ? cap / total : 1.0;
        const nodeSold = {};
        let gold = 0;
        for (const resId in sellable) {
          const amt = sellable[resId] * scale;
          nodeSold[resId] = amt;
          gold += amt * content.resources[resId].basePrice;
        }
        sold[id] = nodeSold;
        goldByNode[id] = gold;
        researchByNode[id] = gold * state.unlocks.titheRate;
        availableOut[id] = {};
        perNodeDraw[id] = nodeSold; // market "draws" what it sells (used by backpressure)
      } else {
        availableOut[id] = {};
        perNodeDraw[id] = {};
      }
  ```

- [ ] **Step 4: Aggregate `goldRate` / `researchRate` in the return.**
  In `Source/Engine/Simulation/RateSolver.js`, replace the `return { ... goldRate: 0, researchRate: 0, ... }` block with:
  ```js
      let goldRate = 0;
      for (const id in goldByNode) goldRate += goldByNode[id];
      let researchRate = 0;
      for (const id in researchByNode) researchRate += researchByNode[id];

      return {
        capacityByNode,
        availableOut,
        linkFlow,
        surplusRate,
        goldRate,
        researchRate,
        perNodeDraw,
      };
  ```
  (Place the `goldRate`/`researchRate` accumulation just before the existing `return`, replacing the old return object that had the literal `0`s.)

- [ ] **Step 5: Run it, expect PASS.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: all market/scholar tests pass — seed graph `goldRate` 2.0 & `researchRate` 0.10; overflow `goldRate` 11.25 & `researchRate` 0.5625; unlisted-resource case 2.0; tithe-0.07 case 0.14; scholar 0.5/s both ways. Running total `14 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit.**
  ```
  git add Source/Engine/Simulation/RateSolver.js Tests/RateSolver.Test.js
  git commit -m "feat(sim): add market overflow/gold/tithe and scholar to RateSolver"
  ```

---

### Task 2.6: RateSolver — Pass 2 backpressure & surplus accrual + cycle rejection

Add the reverse-topo Pass 2 that decides each produced unit's destination (downstream link vs the producer's own stockpile) without reducing production. Surplus-with-no-consumer accrues to `surplusRate[nodeId][resId]`; `linkFlow` is finalized to the lesser of offered vs wanted. Also assert that `solve` propagates `topoSort`'s cycle throw (so `ConnectLink` can be rejected upstream).

**Files**
- Modify: `Source/Engine/Simulation/RateSolver.js`
- Test: `Tests/RateSolver.Test.js`

**Steps**

- [ ] **Step 1: Write the failing tests for surplus accrual, link flow, and cycle throw.**
  Append to `Tests/RateSolver.Test.js` (add `cycleGraph` and `steelGraph` already imported? — extend the fixtures import to also bring in `cycleGraph`, i.e. `import { ..., cycleGraph } from "./Fixtures/KnownGraph.js";`):
  ```js
  describe("RateSolver — Pass 2 surplus & backpressure", () => {
    it("a gatherer with no consumer accrues full output to its own surplus", () => {
      const { state, content, expected } = surplusGraph();
      const solved = solve(state, content);
      expect(solved.surplusRate["m"]["iron_ore"]).toBeCloseTo(expected.surplusOre, 1e-9); // 1.0
    });
    it("seed graph: miner has zero surplus (smelter consumes all 1.0 ore as 0.5 bar needs 1.0 ore)", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      // smelter draws iron_ore = out*2 = 0.5*2 = 1.0 ; miner produces exactly 1.0 -> no surplus.
      const minerSurplus = (solved.surplusRate["n_miner_0"] && solved.surplusRate["n_miner_0"]["iron_ore"]) || 0;
      expect(minerSurplus).toBeCloseTo(0.0, 1e-9);
    });
    it("seed graph: smelter accrues its iron_bar surplus only if market underdraws (here market sells all)", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      // market sells the full 0.5 bar/s (cap 5 >> 0.5) -> smelter surplus 0.
      const smSurplus = (solved.surplusRate["n_smelter_0"] && solved.surplusRate["n_smelter_0"]["iron_bar"]) || 0;
      expect(smSurplus).toBeCloseTo(0.0, 1e-9);
    });
    it("over-supplied smelter accrues iron_bar surplus when market cap binds", () => {
      // Build: gatherer iron_bar L9 bonus path gives a fat 0.5? Use a high-level gatherer feeding a tiny market.
      const nodes = [
        { id: "gbar", kind: "gatherer", level: 3, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 2.0 bar/s
        { id: "mk", kind: "market", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 1, y: 0 } }, // cap 5.0 -> sells all 2.0
      ];
      // market cap 5 > 2.0 so no surplus; lower the gatherer below cap stays no surplus. To force surplus,
      // give TWO gatherers totaling 8 into cap 5 (reuse overflow fixture shape) and check the producer surplus.
      const big = [
        { id: "ga", kind: "gatherer", level: 7, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // 4.0 bar/s
        { id: "gb", kind: "gatherer", level: 7, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 1 } }, // 4.0 ore/s
        { id: "mk", kind: "market", level: 1, resourceId: null, recipeId: null, stockpile: {}, pos: { x: 1, y: 0 } }, // cap 5
      ];
      const links = [
        { id: "l0", from: "ga", to: "mk", resourceId: "iron_bar" },
        { id: "l1", from: "gb", to: "mk", resourceId: "iron_ore" },
      ];
      const state = {
        currencies: { gold: 0, research: 0, renown: 0 },
        graph: { nodes: big, links, nextNodeSeq: 3, nextLinkSeq: 2 },
        unlocks: {
          researchOwned: [], recipesUnlocked: [],
          machinesUnlocked: ["gatherer", "market"],
          marketListings: ["iron_ore", "iron_bar"], titheRate: 0.05, offlineCapHours: 8,
          productionBonuses: { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 },
          gearTiersUnlocked: [], autoSell: false, heroSlots: 1,
        },
      };
      const solved = solve(state, content());
      // scale 5/8=0.625 -> market draws iron_bar 2.5, iron_ore 2.5.
      // ga produces 4.0 bar -> surplus 4.0-2.5 = 1.5 ; gb produces 4.0 ore -> surplus 1.5.
      expect(solved.surplusRate["ga"]["iron_bar"]).toBeCloseTo(1.5, 1e-9);
      expect(solved.surplusRate["gb"]["iron_ore"]).toBeCloseTo(1.5, 1e-9);
      // linkFlow finalized to what the market actually draws.
      expect(solved.linkFlow["l0"]).toBeCloseTo(2.5, 1e-9);
      expect(solved.linkFlow["l1"]).toBeCloseTo(2.5, 1e-9);
    });
  });

  describe("RateSolver — cycle rejection", () => {
    it("solve throws 'cycle' on a looped graph", () => {
      const { state, content } = cycleGraph();
      expect(() => solve(state, content)).toThrow("cycle");
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: surplus/backpressure tests fail (`surplusRate` is still the empty object from Task 2.4/2.5, and `linkFlow` for the overflow market is still the provisional offered value 4.0, not the drawn 2.5). The cycle test already passes (solve calls `topoSort`, which throws). Failure summary, non-zero exit.

- [ ] **Step 3: Implement Pass 2 (reverse-topo backpressure + surplus).**
  In `Source/Engine/Simulation/RateSolver.js`, insert the following block immediately after the Pass 1 `for (const id of order)` loop closes and before the `goldRate`/`researchRate` aggregation. It uses `perNodeDraw` (each consumer's per-resource draw, including the market's `sold` map) to compute, per producer link, how much the consumer wants of that resource, splitting the consumer's total demand for a resource proportionally across its inbound links of that resource:
  ```js
    // --- Pass 2: backpressure (reverse topo) -> decide destination (link vs own stockpile) ---
    // Total provisional offered per (consumerId,resId) across that consumer's inbound links of that resId.
    const offeredTo = {}; // `${to}|${resId}` -> total provisional offered
    for (const l of links) {
      const off = (availableOut[l.from] && availableOut[l.from][l.resourceId]) || 0;
      const k = l.to + "|" + l.resourceId;
      offeredTo[k] = (offeredTo[k] || 0) + off;
    }
    // demand[`${producerId}|${resId}`] = units the downstream consumers actually pull from this producer.
    const demand = {};
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      for (const L of outLinks.get(id)) {
        const consumerDraw = (perNodeDraw[L.to] && perNodeDraw[L.to][L.resourceId]) || 0;
        const k = L.to + "|" + L.resourceId;
        const totalOffered = offeredTo[k] || 0;
        const offHere = (availableOut[L.from] && availableOut[L.from][L.resourceId]) || 0;
        // Proportional share of the consumer's draw attributable to this inbound link.
        const wanted = totalOffered > 0 ? consumerDraw * (offHere / totalOffered) : 0;
        const dk = id + "|" + L.resourceId;
        demand[dk] = (demand[dk] || 0) + wanted;
        linkFlow[L.id] = Math.min(linkFlow[L.id] != null ? linkFlow[L.id] : offHere, wanted);
      }
      const outs = availableOut[id] || {};
      for (const resId in outs) {
        const produced = outs[resId];
        const taken = demand[id + "|" + resId] || 0;
        const sr = Math.max(0, produced - taken);
        if (sr > 0) {
          if (!surplusRate[id]) surplusRate[id] = {};
          surplusRate[id][resId] = (surplusRate[id][resId] || 0) + sr;
        }
      }
    }
  ```

- [ ] **Step 4: Run it, expect PASS.**
  Run:
  ```
  node Tests/RunAll.js RateSolver
  ```
  Expected: surplus fixture (1.0), seed-graph zero-surplus cases (miner 0.0, smelter 0.0), overflow producer surplus (ga/gb 1.5 each) with finalized `linkFlow` 2.5/2.5, and the cycle throw all pass. Running total `20 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Run the full suite to confirm no regressions in Topology.**
  Run:
  ```
  node Tests/RunAll.js
  ```
  Expected: every registered test file (Topology, RateSolver, plus any Phase 1 files) passes; summary shows `0 failed` and exit code 0.

- [ ] **Step 6: Commit.**
  ```
  git add Source/Engine/Simulation/RateSolver.js Tests/RateSolver.Test.js
  git commit -m "feat(sim): add Pass 2 backpressure, surplus accrual, link-flow finalization"
  ```

---

### Task 2.7: Tick — integrate solved rates into stockpiles & currencies

Implement the per-frame integrator `applyTick(state, solved, dtSeconds)` that mutates state in place: gold/research advance by their rates × dt, and every `(node, res, rate)` in `surplusRate` accrues to that node's sparse stockpile. Expedition countdown advancement is delegated (Phase 3's `ExpeditionSystem`) and only sketched here behind a guard so this task stays within simulation scope — if `expeditions.active` exists we leave its resolution to the systems layer and do not double-handle it.

**Files**
- Create: `Source/Engine/Simulation/Tick.js`
- Test: `Tests/Tick.Test.js`
- Modify: `Tests/RunAll.js`

**Steps**

- [ ] **Step 1: Write the failing test for `applyTick`.**
  Create `Tests/Tick.Test.js`:
  ```js
  import { describe, it, expect } from "./Runner.js";
  import { applyTick } from "../Source/Engine/Simulation/Tick.js";
  import { solve } from "../Source/Engine/Simulation/RateSolver.js";
  import { seedGraph, surplusGraph } from "./Fixtures/KnownGraph.js";

  describe("Tick.applyTick — currencies", () => {
    it("seed graph: 2s of ticking adds 4.0 gold and 0.20 research", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      state.currencies.gold = 0;
      state.currencies.research = 0;
      applyTick(state, solved, 2.0);
      expect(state.currencies.gold).toBeCloseTo(4.0, 1e-9); // 2.0 gold/s * 2s
      expect(state.currencies.research).toBeCloseTo(0.2, 1e-9); // 0.10/s * 2s
    });
    it("renown is never advanced by a tick (only expeditions grant renown)", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      state.currencies.renown = 7.0;
      applyTick(state, solved, 5.0);
      expect(state.currencies.renown).toBeCloseTo(7.0, 1e-9);
    });
  });

  describe("Tick.applyTick — surplus into stockpiles", () => {
    it("accrues surplus into the node's sparse stockpile", () => {
      const { state, content } = surplusGraph();
      const solved = solve(state, content);
      const node = state.graph.nodes.find((n) => n.id === "m");
      node.stockpile = {};
      applyTick(state, solved, 3.0);
      expect(node.stockpile["iron_ore"]).toBeCloseTo(3.0, 1e-9); // 1.0/s * 3s
    });
    it("accumulates across multiple ticks", () => {
      const { state, content } = surplusGraph();
      const solved = solve(state, content);
      const node = state.graph.nodes.find((n) => n.id === "m");
      node.stockpile = {};
      applyTick(state, solved, 1.0);
      applyTick(state, solved, 1.0);
      expect(node.stockpile["iron_ore"]).toBeCloseTo(2.0, 1e-9);
    });
    it("does not create stockpile keys for nodes with no surplus", () => {
      const { state, content } = seedGraph();
      const solved = solve(state, content);
      const miner = state.graph.nodes.find((n) => n.id === "n_miner_0");
      miner.stockpile = {};
      applyTick(state, solved, 10.0);
      expect(Object.keys(miner.stockpile).length).toBe(0); // miner fully consumed by smelter -> no surplus
    });
  });
  ```

- [ ] **Step 2: Register the test in `RunAll.js`.**
  In `Tests/RunAll.js` add:
  ```js
  import "./Tick.Test.js";
  ```

- [ ] **Step 3: Run it, expect FAIL.**
  Run:
  ```
  node Tests/RunAll.js Tick
  ```
  Expected: failure — `Source/Engine/Simulation/Tick.js` does not exist (module-not-found), non-zero exit.

- [ ] **Step 4: Write the minimal `Tick.js`.**
  Create `Source/Engine/Simulation/Tick.js`:
  ```js
  /** Per-frame integrator. Mutates state in place over dtSeconds using the solved rates.
   *  gold/research advance by their rates; surplus accrues to each node's sparse stockpile.
   *  Renown is NOT advanced here (expeditions are the only renown source).
   *  Expedition countdown resolution is handled by ExpeditionSystem at the Game layer. */
  export function applyTick(state, solved, dtSeconds) {
    state.currencies.gold += solved.goldRate * dtSeconds;
    state.currencies.research += solved.researchRate * dtSeconds;

    const surplus = solved.surplusRate || {};
    const byId = state.graph.nodes;
    for (const nodeId in surplus) {
      const node = byId.find((n) => n.id === nodeId);
      if (!node) continue;
      if (!node.stockpile) node.stockpile = {};
      const rates = surplus[nodeId];
      for (const resId in rates) {
        node.stockpile[resId] = (node.stockpile[resId] || 0) + rates[resId] * dtSeconds;
      }
    }
  }
  ```

- [ ] **Step 5: Run it, expect PASS.**
  Run:
  ```
  node Tests/RunAll.js Tick
  ```
  Expected: all 5 `Tick.applyTick` tests pass — gold 4.0 / research 0.20 over 2s, renown unchanged, surplus 3.0 over 3s, 2.0 across two ticks, and the seed miner stockpile stays empty. Summary `5 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Run the full suite to confirm the whole phase is green.**
  Run:
  ```
  node Tests/RunAll.js
  ```
  Expected: Topology + RateSolver + Tick (+ Phase 1 files) all pass; summary `0 failed`, exit code 0.

- [ ] **Step 7: Commit.**
  ```
  git add Source/Engine/Simulation/Tick.js Tests/Tick.Test.js Tests/RunAll.js
  git commit -m "feat(sim): add Tick integrator for currencies and stockpile surplus"
  ```

---

I now have the complete spec and interface contract. I have everything needed to write the Phase 3 plan. The repo currently has no Source or Tests files yet (only the spec is committed), so I'll write a self-contained Phase 3 plan that builds against the contract.

Here is the complete Phase 3 plan section:

---

## Phase 3: Persistence & Offline Catch-up

**Phase goal:** Make the game durable and idle-honest. Build the save layer (`SaveManager` with `SAVE_VERSION=3`, `serialize` that strips the non-persisted `_solved` cache and stamps `savedAt`/`lastSeen`, `deserialize` that chains migrations, validates, and falls back to a fresh `NewGame()` on any corruption so a bad blob never bricks the page), the migration registry (`1→2` adds `meta.tutorialFlags`, `2→3` splits a flat `offlineCap` int into `unlocks.offlineCapHours` + `productionBonuses`) with a `SaveV1.json` fixture, and the one-shot offline catch-up (`Offline.applyOffline` per spec §4.4: clamp elapsed to `offlineCapHours`, integrate the steady-state solver rates exactly over the clamped dt, deterministically fast-forward the single in-flight expedition, optionally dump auto-sell stockpiles once, and build a "while you were away" summary that the UI suppresses under ~60s). Every task is TDD: failing test first, minimal impl, green, commit. This phase assumes Phase 1 (Content, Clock, GameState, StorageAdapters, Runner) and Phase 2 (RateSolver, Topology, Tick, Systems) already exist and pass against the same interface contract — `solve`, `applyTick`, `NewGame`, `clone`, `validate`, `FakeClock`, `MemoryStorageAdapter`, `ExpeditionSystem.tryResolve`, `EconomySystem.sellFromStockpile`, and the `content` aggregate are all available.

---

### Task 3.1: SaveManager constants + serialize (strips `_solved`, stamps timestamps)

**Files**
- Create: `Source/Engine/Persistence/SaveManager.js`
- Test: `Tests/SaveManager.Test.js`
- Modify: `Tests/RunAll.js` (add static import of the new test)

Steps:

- [ ] **Step 1: Write the failing serialize test.** Create `Tests/SaveManager.Test.js` with the first describe block. It builds a fresh `NewGame`, attaches a fake `_solved` cache, serializes, and asserts the JSON parses, carries `version:3`, stamps `savedAt`/`lastSeen`, and does NOT contain `_solved`.

```js
// Tests/SaveManager.Test.js
import { describe, it, expect } from "./Runner.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { serialize, SAVE_VERSION, SAVE_KEY } from "../Source/Engine/Persistence/SaveManager.js";

describe("SaveManager.serialize", () => {
  it("strips _solved and stamps version + timestamps", () => {
    const clock = new FakeClock(1000);
    const state = NewGame(clock);
    state._solved = { goldRate: 2.0, junk: true };
    const json = serialize(state);
    const blob = JSON.parse(json);
    expect(blob.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(SAVE_KEY).toBe("idlekingdom.save");
    expect(typeof blob.savedAt).toBe("number");
    expect(typeof blob.lastSeen).toBe("number");
    expect(blob._solved).toBe(undefined);
    expect(blob.currencies.gold).toBe(25.0);
  });
});
```

- [ ] **Step 2: Add the test to RunAll.js.** Insert the static import + invocation so the harness discovers it. Open `Tests/RunAll.js` and add this import alongside the existing ones (placement is alphabetical among the imports; if the file currently has none for SaveManager, add it):

```js
import "./SaveManager.Test.js";
```

- [ ] **Step 3: Run it, expect FAIL.** `node Tests/RunAll.js SaveManager` — expect failure resolving the module:
```
Error: Cannot find module '.../Source/Engine/Persistence/SaveManager.js'
```
(or `serialize is not a function` if the file exists empty).

- [ ] **Step 4: Write minimal SaveManager.serialize impl.** Create `Source/Engine/Persistence/SaveManager.js`:

```js
// Source/Engine/Persistence/SaveManager.js
export const SAVE_VERSION = 3;
export const SAVE_KEY = "idlekingdom.save";

/** Strips _solved, stamps savedAt + lastSeen, JSON.stringify. */
export function serialize(state) {
  const { _solved, ...rest } = state;
  const now = state.lastSeen;
  const blob = { ...rest, version: SAVE_VERSION, savedAt: now, lastSeen: now };
  return JSON.stringify(blob);
}
```

- [ ] **Step 5: Run it, expect PASS.** `node Tests/RunAll.js SaveManager`:
```
SaveManager.serialize
  ✓ strips _solved and stamps version + timestamps
1 passing
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Persistence/SaveManager.js Tests/SaveManager.Test.js Tests/RunAll.js
git commit -m "feat(persistence): SaveManager serialize strips _solved and stamps version"
```

---

### Task 3.2: Migrations registry (`1→2`, `2→3`) + `SaveV1.json` fixture

**Files**
- Create: `Source/Engine/Persistence/Migrations.js`
- Create: `Tests/Fixtures/SaveV1.json`
- Test: `Tests/SaveManager.Test.js` (extend)

Steps:

- [ ] **Step 1: Write the SaveV1 fixture.** Create `Tests/Fixtures/SaveV1.json` — a legacy v1 blob: no `version` field (defaults to 1), no `meta.tutorialFlags`, and a flat `unlocks.offlineCap` integer instead of `offlineCapHours`/`productionBonuses`. It mirrors the canonical seed shape otherwise.

```json
{
  "savedAt": 1700000000000,
  "lastSeen": 1700000000000,
  "currencies": { "gold": 25.0, "research": 0.0, "renown": 0.0 },
  "graph": {
    "nodes": [
      { "id": "n_miner_0",   "kind": "gatherer", "level": 1, "resourceId": "iron_ore", "recipeId": null,         "stockpile": { "iron_ore": 0.0 }, "pos": { "x": 120, "y": 200 } },
      { "id": "n_smelter_0", "kind": "smelter",  "level": 1, "resourceId": null,       "recipeId": "r_iron_bar", "stockpile": { "iron_bar": 0.0 }, "pos": { "x": 360, "y": 200 } },
      { "id": "n_market_0",  "kind": "market",   "level": 1, "resourceId": null,       "recipeId": null,         "stockpile": {},                  "pos": { "x": 600, "y": 200 } }
    ],
    "links": [
      { "id": "l_0", "from": "n_miner_0",   "to": "n_smelter_0", "resourceId": "iron_ore" },
      { "id": "l_1", "from": "n_smelter_0", "to": "n_market_0",  "resourceId": "iron_bar" }
    ],
    "nextNodeSeq": 1,
    "nextLinkSeq": 2
  },
  "unlocks": {
    "researchOwned": [],
    "recipesUnlocked": ["r_iron_bar"],
    "machinesUnlocked": ["gatherer", "smelter", "market"],
    "marketListings": ["iron_ore", "timber", "hide", "coal_raw", "gemstone", "iron_bar"],
    "titheRate": 0.05,
    "offlineCap": 8,
    "gearTiersUnlocked": [ { "itemId": "sword", "tier": 1 }, { "itemId": "armor", "tier": 1 }, { "itemId": "shield", "tier": 1 } ],
    "autoSell": false,
    "heroSlots": 1
  },
  "heroes": [
    { "id": "h_0", "templateId": "hero_warden", "level": 1, "equipped": { "weapon": null, "armor": null, "accessory": null } }
  ],
  "expeditions": { "active": null, "completed": [] },
  "territories": { "reclaimed": [], "available": ["t_gatehouse"] },
  "meta": { "won": false, "createdAt": 1700000000000, "playtimeMs": 0 }
}
```

- [ ] **Step 2: Write the failing migration unit test.** Extend `Tests/SaveManager.Test.js` with a describe block that imports the fixture and calls `migrate1to2` then `migrate2to3` directly, asserting each delta in isolation.

```js
// append to Tests/SaveManager.Test.js
import { migrate1to2, migrate2to3, MIGRATIONS } from "../Source/Engine/Persistence/Migrations.js";
import SaveV1 from "./Fixtures/SaveV1.json" with { type: "json" };

describe("Migrations", () => {
  it("1->2 adds meta.tutorialFlags without touching other fields", () => {
    const v1 = JSON.parse(JSON.stringify(SaveV1));
    expect(v1.meta.tutorialFlags).toBe(undefined);
    const v2 = migrate1to2(v1);
    expect(v2.version).toBe(2);
    expect(v2.meta.tutorialFlags.seenGoldTip).toBe(false);
    expect(v2.meta.tutorialFlags.seenUpgradeTip).toBe(false);
    expect(v2.meta.tutorialFlags.seenConnectTip).toBe(false);
    expect(v2.currencies.gold).toBe(25.0);
  });

  it("2->3 splits flat offlineCap into offlineCapHours + productionBonuses", () => {
    const v2 = migrate1to2(JSON.parse(JSON.stringify(SaveV1)));
    expect(v2.unlocks.offlineCap).toBe(8);
    expect(v2.unlocks.offlineCapHours).toBe(undefined);
    const v3 = migrate2to3(v2);
    expect(v3.version).toBe(3);
    expect(v3.unlocks.offlineCapHours).toBe(8);
    expect(v3.unlocks.offlineCap).toBe(undefined);
    expect(v3.unlocks.productionBonuses.gatherer).toBe(1.0);
    expect(v3.unlocks.productionBonuses.smelter).toBe(1.0);
    expect(v3.unlocks.productionBonuses.workshop).toBe(1.0);
    expect(v3.unlocks.productionBonuses.market).toBe(1.0);
    expect(v3.unlocks.productionBonuses.scholar).toBe(1.0);
  });

  it("MIGRATIONS registry is keyed by fromVersion", () => {
    expect(MIGRATIONS[1]).toBe(migrate1to2);
    expect(MIGRATIONS[2]).toBe(migrate2to3);
  });
});
```

- [ ] **Step 3: Run it, expect FAIL.** `node Tests/RunAll.js SaveManager`:
```
Error: Cannot find module '.../Source/Engine/Persistence/Migrations.js'
```

- [ ] **Step 4: Write the Migrations.js impl.** Create `Source/Engine/Persistence/Migrations.js`. Each fn returns a new blob bumped one version; it preserves all unrelated fields and only applies the documented delta.

```js
// Source/Engine/Persistence/Migrations.js

/** v1 -> v2: introduce meta.tutorialFlags. */
export function migrate1to2(blob) {
  const meta = { ...(blob.meta || {}) };
  if (!meta.tutorialFlags) {
    meta.tutorialFlags = { seenGoldTip: false, seenUpgradeTip: false, seenConnectTip: false };
  }
  return { ...blob, version: 2, meta };
}

/** v2 -> v3: split flat unlocks.offlineCap int into offlineCapHours + productionBonuses. */
export function migrate2to3(blob) {
  const unlocks = { ...(blob.unlocks || {}) };
  const cap = typeof unlocks.offlineCap === "number" ? unlocks.offlineCap : 8;
  delete unlocks.offlineCap;
  unlocks.offlineCapHours = cap;
  if (!unlocks.productionBonuses) {
    unlocks.productionBonuses = { gatherer: 1.0, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 };
  }
  return { ...blob, version: 3, unlocks };
}

/** Ordered registry { [fromVersion]: migrateFn }; chained to SAVE_VERSION. */
export const MIGRATIONS = { 1: migrate1to2, 2: migrate2to3 };
```

- [ ] **Step 5: Run it, expect PASS.** `node Tests/RunAll.js SaveManager`:
```
Migrations
  ✓ 1->2 adds meta.tutorialFlags without touching other fields
  ✓ 2->3 splits flat offlineCap into offlineCapHours + productionBonuses
  ✓ MIGRATIONS registry is keyed by fromVersion
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Persistence/Migrations.js Tests/Fixtures/SaveV1.json Tests/SaveManager.Test.js
git commit -m "feat(persistence): migration registry 1->2 tutorialFlags, 2->3 offlineCap split"
```

---

### Task 3.3: SaveManager.deserialize (chain migrations → validate → NewGame fallback)

**Files**
- Modify: `Source/Engine/Persistence/SaveManager.js`
- Test: `Tests/SaveManager.Test.js` (extend)

Steps:

- [ ] **Step 1: Write the failing round-trip + migration + corruption tests.** Append to `Tests/SaveManager.Test.js`. Covers: round-trip deep-equal incl. sparse stockpiles + null equip slots; SaveV1 → v3 end-to-end; corruption → NewGame; canonical-ID guard.

```js
// append to Tests/SaveManager.Test.js
import { deserialize } from "../Source/Engine/Persistence/SaveManager.js";

describe("SaveManager.deserialize", () => {
  it("round-trips deep-equal incl. sparse stockpiles and null slots", () => {
    const clock = new FakeClock(5000);
    const state = NewGame(clock);
    state.currencies.gold = 123.456;
    state.graph.nodes[0].stockpile = { iron_ore: 7.25 }; // sparse
    state._solved = { goldRate: 2 };                       // must not survive
    const json = serialize(state);
    const back = deserialize(json, clock);
    expect(back.currencies.gold).toBeCloseTo(123.456, 1e-9);
    expect(back.graph.nodes[0].stockpile.iron_ore).toBeCloseTo(7.25, 1e-9);
    expect(back.graph.nodes[2].stockpile).toEqual({});      // market: empty sparse
    expect(back.heroes[0].equipped.weapon).toBe(null);
    expect(back.heroes[0].equipped.armor).toBe(null);
    expect(back.heroes[0].equipped.accessory).toBe(null);
    expect(back._solved).toBe(undefined);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it("migrates SaveV1 fixture all the way to v3", () => {
    const clock = new FakeClock(5000);
    const state = deserialize(JSON.stringify(SaveV1), clock);
    expect(state.version).toBe(3);
    expect(state.meta.tutorialFlags.seenGoldTip).toBe(false);
    expect(state.unlocks.offlineCapHours).toBe(8);
    expect(state.unlocks.offlineCap).toBe(undefined);
    expect(state.unlocks.productionBonuses.smelter).toBe(1.0);
    expect(state.currencies.gold).toBe(25.0); // no data loss
  });

  it("falls back to NewGame on malformed JSON without throwing", () => {
    const clock = new FakeClock(9000);
    const state = deserialize("{not valid json", clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(25.0);
  });

  it("falls back to NewGame when validate fails (missing currencies)", () => {
    const clock = new FakeClock(9000);
    const broken = JSON.stringify({ version: 3, graph: { nodes: [], links: [] } });
    const state = deserialize(broken, clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(25.0);
  });

  it("canonical-ID guard: NewGame has only r_iron_bar, hero_warden, t_gatehouse", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    expect(state.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(state.heroes[0].templateId).toBe("hero_warden");
    expect(state.territories.available[0]).toBe("t_gatehouse");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `node Tests/RunAll.js SaveManager`:
```
TypeError: deserialize is not a function
```

- [ ] **Step 3: Write deserialize impl.** Add to `Source/Engine/Persistence/SaveManager.js` — import `NewGame` + `validate` and the `MIGRATIONS` registry, parse defensively, chain migrations asserting +1 per hop, validate, fall back on any failure.

```js
// add to top of Source/Engine/Persistence/SaveManager.js
import { NewGame, validate } from "../GameState.js";
import { MIGRATIONS } from "./Migrations.js";
```

```js
// add to body of Source/Engine/Persistence/SaveManager.js

/** JSON.parse -> migrate to SAVE_VERSION -> validate -> NewGame() on any failure. Never throws. */
export function deserialize(json, clock) {
  try {
    let blob = JSON.parse(json);
    let v = typeof blob.version === "number" ? blob.version : 1;
    while (v < SAVE_VERSION) {
      const fn = MIGRATIONS[v];
      if (!fn) throw new Error("no migration from version " + v);
      blob = fn(blob);
      if (blob.version !== v + 1) throw new Error("migration did not bump " + v + " -> " + (v + 1));
      v = blob.version;
    }
    if (!validate(blob)) throw new Error("validate failed");
    return blob;
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[SaveManager] corrupt save, starting fresh:", e.message);
    return NewGame(clock);
  }
}
```

- [ ] **Step 4: Run it, expect PASS.** `node Tests/RunAll.js SaveManager`:
```
SaveManager.deserialize
  ✓ round-trips deep-equal incl. sparse stockpiles and null slots
  ✓ migrates SaveV1 fixture all the way to v3
  ✓ falls back to NewGame on malformed JSON without throwing
  ✓ falls back to NewGame when validate fails (missing currencies)
  ✓ canonical-ID guard: NewGame has only r_iron_bar, hero_warden, t_gatehouse
```

- [ ] **Step 5: Run the full suite to confirm no regressions.** `node Tests/RunAll.js`:
```
... (all prior suites) ...
0 failing
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Persistence/SaveManager.js Tests/SaveManager.Test.js
git commit -m "feat(persistence): deserialize chains migrations, validates, falls back to NewGame"
```

---

### Task 3.4: Offline.applyOffline — clamp + steady-state integration + summary suppression

**Files**
- Create: `Source/Engine/Simulation/Offline.js`
- Test: `Tests/Offline.Test.js`
- Modify: `Tests/RunAll.js` (add static import)

Steps:

- [ ] **Step 1: Write the failing within-cap + clamp tests.** Create `Tests/Offline.Test.js`. Uses `NewGame` (opening steady state = 2.0 gold/s, 0.10 research/s per §7) and drives `applyOffline` directly. Sets `state.lastSeen` and passes a `nowMs`.

```js
// Tests/Offline.Test.js
import { describe, it, expect } from "./Runner.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { content } from "../Source/Engine/Content/Content.js";
import { applyOffline } from "../Source/Engine/Simulation/Offline.js";

const HOUR = 3600 * 1000;

describe("Offline.applyOffline within cap", () => {
  it("2h within 8h cap gains 14400 gold and 720 research", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    const now = 2 * HOUR;
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(2 * HOUR);
    expect(summary.clamped).toBe(false);
    expect(summary.gained.gold).toBeCloseTo(14400, 1e-6);
    expect(summary.gained.research).toBeCloseTo(720, 1e-6);
    expect(state.currencies.gold).toBeCloseTo(25.0 + 14400, 1e-6); // seed 25 + gained
    expect(state.lastSeen).toBe(now);
  });
});

describe("Offline.applyOffline clamps to cap", () => {
  it("3-day gap clamps to 8h => 57600 gold, clamped:true", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    const now = 3 * 24 * HOUR; // 72h
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(8 * HOUR);
    expect(summary.clamped).toBe(true);
    expect(summary.gained.gold).toBeCloseTo(57600, 1e-6);
    expect(state.lastSeen).toBe(now); // lastSeen advances to real now, not the clamp
  });

  it("raised cap (offlineCapHours=24) clamps a 3-day gap to 24h", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    state.unlocks.offlineCapHours = 24;
    const now = 3 * 24 * HOUR;
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(24 * HOUR);
    expect(summary.clamped).toBe(true);
    expect(summary.gained.gold).toBeCloseTo(2.0 * 24 * 3600, 1e-6); // 172800
  });

  it("suppresses (negligible) under ~60s: appliedMs small, gains tiny", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    const now = 30 * 1000; // 30s
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(30 * 1000);
    expect(summary.clamped).toBe(false);
    expect(summary.gained.gold).toBeCloseTo(60, 1e-6); // 2.0 * 30
  });
});
```

> Note: `Offline.js` re-uses the existing `RateSolver.solve` and a fresh solve per call. The seed graph's steady state is `goldRate=2.0`, `researchRate=0.10` (validated in Phase 2's `RateSolver.Test.js`); these offline tests depend on that solver result, so they double as an integration check. `content` is the Phase 1 aggregate exporting `{ resources, machines, recipes, researchNodes, territories, equipment, heroes, startState }` from `Source/Engine/Content/Content.js`.

- [ ] **Step 2: Add the test to RunAll.js.** Add to `Tests/RunAll.js`:
```js
import "./Offline.Test.js";
```

- [ ] **Step 3: Run it, expect FAIL.** `node Tests/RunAll.js Offline`:
```
Error: Cannot find module '.../Source/Engine/Simulation/Offline.js'
```

- [ ] **Step 4: Write the minimal Offline.applyOffline impl.** Create `Source/Engine/Simulation/Offline.js`. Clamps the raw elapsed to `offlineCapHours*3600*1000`, solves once, integrates gold/research/stockpiles exactly over the clamped dt, builds the summary, and advances `lastSeen` to the real `nowMs`. Expedition fast-forward and auto-sell come in 3.5/3.6.

```js
// Source/Engine/Simulation/Offline.js
import { solve } from "./RateSolver.js";

/** One-shot offline catch-up. See spec §4.4. Mutates state; returns OfflineSummary. */
export function applyOffline(state, content, nowMs) {
  const raw = Math.max(0, nowMs - state.lastSeen);
  const capMs = state.unlocks.offlineCapHours * 3600 * 1000;
  const appliedMs = Math.min(raw, capMs);
  const clamped = raw > capMs;
  const dt = appliedMs / 1000;

  const before = {
    gold: state.currencies.gold,
    research: state.currencies.research,
    renown: state.currencies.renown,
  };

  const solved = solve(state, content);
  state.currencies.gold += solved.goldRate * dt;
  state.currencies.research += solved.researchRate * dt;
  for (const node of state.graph.nodes) {
    const sr = solved.surplusRate[node.id];
    if (!sr) continue;
    for (const res in sr) {
      node.stockpile[res] = (node.stockpile[res] || 0) + sr[res] * dt;
    }
  }

  const expeditionsResolved = [];

  state.lastSeen = nowMs;

  return {
    appliedMs,
    clamped,
    gained: {
      gold: state.currencies.gold - before.gold,
      research: state.currencies.research - before.research,
      renown: state.currencies.renown - before.renown,
    },
    expeditionsResolved,
  };
}
```

- [ ] **Step 5: Run it, expect PASS.** `node Tests/RunAll.js Offline`:
```
Offline.applyOffline within cap
  ✓ 2h within 8h cap gains 14400 gold and 720 research
Offline.applyOffline clamps to cap
  ✓ 3-day gap clamps to 8h => 57600 gold, clamped:true
  ✓ raised cap (offlineCapHours=24) clamps a 3-day gap to 24h
  ✓ suppresses (negligible) under ~60s: appliedMs small, gains tiny
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Simulation/Offline.js Tests/Offline.Test.js Tests/RunAll.js
git commit -m "feat(offline): applyOffline clamps dt to cap and integrates steady-state exactly"
```

---

### Task 3.5: Offline expedition fast-forward (deterministic resolve + reclaim)

**Files**
- Modify: `Source/Engine/Simulation/Offline.js`
- Test: `Tests/Offline.Test.js` (extend)

Steps:

- [ ] **Step 1: Write the failing fast-forward test.** Append to `Tests/Offline.Test.js`. Seeds an in-flight expedition against `t_gatehouse` that started before the gap and finishes mid-gap; asserts renown awarded, territory reclaimed, `active` cleared, and the summary lists it. Uses `ExpeditionSystem.startExpedition` to set up the active run legally (hero power already meets the 30 floor only after equipping/leveling — but for fast-forward we set `active` directly to keep this test focused on the offline resolve path, which is deterministic-success by contract since power was validated at launch).

```js
// append to Tests/Offline.Test.js
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";

describe("Offline expedition fast-forward", () => {
  it("resolves an in-flight expedition mid-gap: renown awarded, territory reclaimed, active cleared", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    // an expedition launched at t=0 against t_gatehouse (duration 120000)
    state.expeditions.active = {
      territoryId: "t_gatehouse",
      startedAt: 0,
      durationMs: TERRITORIES.t_gatehouse.durationMs, // 120000
      heroId: "h_0",
    };
    const now = 2 * HOUR; // far past completion, within 8h cap
    const beforeRenown = state.currencies.renown;
    const summary = applyOffline(state, content, now);

    expect(state.expeditions.active).toBe(null);
    expect(state.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(state.currencies.renown).toBeCloseTo(beforeRenown + 10, 1e-6); // t_gatehouse renown reward
    expect(summary.gained.renown).toBeCloseTo(10, 1e-6);
    expect(summary.expeditionsResolved.length).toBe(1);
    expect(summary.expeditionsResolved[0].territoryId).toBe("t_gatehouse");
  });

  it("leaves an unfinished expedition active when it would not complete within the clamped window", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    state.expeditions.active = {
      territoryId: "t_gatehouse",
      startedAt: 0,
      durationMs: TERRITORIES.t_gatehouse.durationMs, // 120000 = 2min
      heroId: "h_0",
    };
    const now = 60 * 1000; // 60s in, expedition not done (needs 120s)
    const summary = applyOffline(state, content, now);
    expect(state.expeditions.active).not.toBe(null);
    expect(state.territories.reclaimed.length).toBe(0);
    expect(summary.expeditionsResolved.length).toBe(0);
  });
});
```

> `not.toBe` is part of the harness's chainable matcher set; if Phase 1's `Runner.js` does not expose `.not`, replace `expect(x).not.toBe(null)` with `expect(x === null).toBe(false)`. The contract lists `toBe` only — use the `=== null` form to stay strictly within the contract:

```js
    expect(state.expeditions.active === null).toBe(false);
```
Apply the same substitution in the first assertion of this second test.

- [ ] **Step 2: Run it, expect FAIL.** `node Tests/RunAll.js Offline`:
```
Offline expedition fast-forward
  ✗ resolves an in-flight expedition mid-gap: ...
    expected null, got { territoryId: "t_gatehouse", ... }
```

- [ ] **Step 3: Wire ExpeditionSystem.tryResolve into Offline.** Modify `Source/Engine/Simulation/Offline.js` — import `tryResolve` and call it once with the real `nowMs` (deterministic-success; it grants rewards, reclaims via `ProgressionSystem.reclaim`, and clears `active`). Capture the resolved descriptor into the summary. Because rewards land in `state.currencies` after the `before` snapshot is taken, `gained.renown`/`gained.gold` already include them.

```js
// add import near the top of Source/Engine/Simulation/Offline.js
import { tryResolve } from "../Systems/ExpeditionSystem.js";
```

Replace the `const expeditionsResolved = [];` line with the resolve call (placed after stockpile integration, before `state.lastSeen = nowMs`):

```js
  const expeditionsResolved = [];
  const resolved = tryResolve(state, content, nowMs);
  if (resolved) expeditionsResolved.push(resolved);
```

- [ ] **Step 4: Run it, expect PASS.** `node Tests/RunAll.js Offline`:
```
Offline expedition fast-forward
  ✓ resolves an in-flight expedition mid-gap: renown awarded, territory reclaimed, active cleared
  ✓ leaves an unfinished expedition active when it would not complete within the clamped window
```

- [ ] **Step 5: Run the within-cap suite again to confirm no regression.** `node Tests/RunAll.js Offline`:
```
... all 6 Offline tests ...
0 failing
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Simulation/Offline.js Tests/Offline.Test.js
git commit -m "feat(offline): fast-forward and deterministically resolve in-flight expedition"
```

---

### Task 3.6: Offline auto-sell one-shot dump (res_quartermaster), finite + once

**Files**
- Modify: `Source/Engine/Simulation/Offline.js`
- Test: `Tests/Offline.Test.js` (extend)

Steps:

- [ ] **Step 1: Write the failing auto-sell dump test.** Append to `Tests/Offline.Test.js`. With `res_quartermaster` owned (`unlocks.autoSell = true`) and a large pre-existing stockpile of a *listed* resource on a node with no downstream consumer, assert the one-shot dump converts that stockpile to gold+tithe at `basePrice`, the result is finite, the stockpile is emptied, and a second `applyOffline` call does NOT dump again (it has nothing left). Uses `iron_bar` (listed at start, basePrice 4.0) accrued on the smelter node.

```js
// append to Tests/Offline.Test.js
import { RESOURCES } from "../Source/Engine/Content/Resources.js";

describe("Offline auto-sell one-shot dump", () => {
  it("dumps stockpiles to gold once when autoSell is owned; finite and emptied", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    state.unlocks.autoSell = true;
    // simulate ~8h of accrued surplus iron_bar sitting on the smelter (no consumer)
    const smelter = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 144000; // big but float-safe
    const beforeGold = state.currencies.gold;
    const price = RESOURCES.iron_bar.basePrice; // 4.0
    const tithe = state.unlocks.titheRate;       // 0.05

    const summary = applyOffline(state, content, 1000); // tiny dt so factory accrual ~ negligible
    const dumpGold = 144000 * price;

    expect(Number.isFinite(state.currencies.gold)).toBe(true);
    expect(smelter.stockpile.iron_bar).toBeCloseTo(0, 1e-6);
    // gold gained >= the dump (plus a sliver of 1s factory income)
    expect(summary.gained.gold).toBeCloseTo(dumpGold + 2.0 * 1, 1e-3);
    expect(state.currencies.gold).toBeCloseTo(beforeGold + dumpGold + 2.0 * 1, 1e-3);
    expect(summary.gained.research).toBeCloseTo(dumpGold * tithe + 0.1 * 1, 1e-3);

    // second pass: nothing left to dump
    const goldAfterFirst = state.currencies.gold;
    const summary2 = applyOffline(state, content, 2000);
    expect(state.graph.nodes.find((n) => n.id === "n_smelter_0").stockpile.iron_bar).toBeCloseTo(0, 1e-6);
    expect(summary2.gained.gold).toBeCloseTo(2.0 * 1, 1e-3); // only 1s of factory income, no second dump
  });

  it("does NOT dump when autoSell is not owned", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.lastSeen = 0;
    const smelter = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 5000;
    applyOffline(state, content, 1000);
    // stockpile may grow from accrual but must not be sold off
    const after = state.graph.nodes.find((n) => n.id === "n_smelter_0").stockpile.iron_bar;
    expect(after >= 5000).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `node Tests/RunAll.js Offline`:
```
Offline auto-sell one-shot dump
  ✗ dumps stockpiles to gold once when autoSell is owned; finite and emptied
    expected 0, got 144000   (stockpile not emptied)
```

- [ ] **Step 3: Add the auto-sell dump to Offline.applyOffline.** Modify `Source/Engine/Simulation/Offline.js` — import `isListed` from EconomySystem, and after the stockpile integration (so freshly-accrued surplus is also dumped) iterate every node's stockpile and sell any *listed* resource at `basePrice`, crediting gold + tithe and zeroing the entry. Done in-line (not via `sellFromStockpile`) so the entire offline dump is a single deterministic sweep. Place this block after the surplus-integration loop and before the `tryResolve` call:

```js
// add import near the top of Source/Engine/Simulation/Offline.js
import { isListed } from "../Systems/EconomySystem.js";
```

```js
  // res_quartermaster auto-sell: one-shot sweep of every node stockpile (listed resources only).
  if (state.unlocks.autoSell) {
    for (const node of state.graph.nodes) {
      for (const res in node.stockpile) {
        const qty = node.stockpile[res];
        if (qty > 0 && isListed(state, content, res)) {
          const gold = qty * content.resources[res].basePrice;
          state.currencies.gold += gold;
          state.currencies.research += gold * state.unlocks.titheRate;
          node.stockpile[res] = 0;
        }
      }
    }
  }
```

- [ ] **Step 4: Run it, expect PASS.** `node Tests/RunAll.js Offline`:
```
Offline auto-sell one-shot dump
  ✓ dumps stockpiles to gold once when autoSell is owned; finite and emptied
  ✓ does NOT dump when autoSell is not owned
```

- [ ] **Step 5: Run the full suite to confirm no regressions.** `node Tests/RunAll.js`:
```
... (RateSolver, Tick, SaveManager, Offline, Expedition, Research, Economy, Progression) ...
0 failing
```

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Simulation/Offline.js Tests/Offline.Test.js
git commit -m "feat(offline): one-shot auto-sell stockpile dump when res_quartermaster owned"
```

---

### Task 3.7: Phase 3 verification — full suite green + persistence/offline integration smoke

**Files**
- Test: `Tests/Offline.Test.js` (extend with a save→offline integration smoke)

Steps:

- [ ] **Step 1: Write a persistence→offline integration smoke test.** Append to `Tests/Offline.Test.js`. Round-trips a save through `MemoryStorageAdapter`, then runs `applyOffline` on the deserialized state, proving the serialized `lastSeen` drives a correct offline delta end-to-end.

```js
// append to Tests/Offline.Test.js
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { serialize, deserialize, SAVE_KEY } from "../Source/Engine/Persistence/SaveManager.js";

describe("Persistence + Offline integration", () => {
  it("save with lastSeen=0, reload at 2h => 14400 gold via applyOffline", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const state = NewGame(clock);
    state.lastSeen = 0;
    storage.set(SAVE_KEY, serialize(state)); // serialize stamps lastSeen = state.lastSeen = 0
    // ...later...
    const loaded = deserialize(storage.get(SAVE_KEY), clock);
    expect(loaded.lastSeen).toBe(0);
    const summary = applyOffline(loaded, content, 2 * HOUR);
    expect(summary.gained.gold).toBeCloseTo(14400, 1e-6);
    expect(loaded.lastSeen).toBe(2 * HOUR);
  });
});
```

- [ ] **Step 2: Run it, expect PASS.** `node Tests/RunAll.js Offline`:
```
Persistence + Offline integration
  ✓ save with lastSeen=0, reload at 2h => 14400 gold via applyOffline
```

- [ ] **Step 3: Run the entire test suite, expect all green.** `node Tests/RunAll.js`:
```
RateSolver ... ✓
Tick ... ✓
SaveManager ... ✓ (serialize, Migrations, deserialize)
Offline ... ✓ (within cap, clamp, fast-forward, auto-sell, integration)
ExpeditionSystem ... ✓
ResearchSystem ... ✓
Economy ... ✓
Progression ... ✓
0 failing
```
Exit code 0.

- [ ] **Step 4: Commit.**
```
git add Tests/Offline.Test.js
git commit -m "test(offline): persistence->offline integration smoke; phase 3 green"
```

---

**Phase 3 done-when:** `SaveManager.serialize`/`deserialize` round-trips with `_solved` stripped and timestamps stamped; the `1→2→3` migration chain upgrades the `SaveV1.json` fixture with no data loss; any corruption (bad JSON, failed `validate`) yields a fresh `NewGame()` without throwing; `Offline.applyOffline` integrates steady-state gold/research/stockpiles exactly over a cap-clamped dt (14400 gold at 2h; 57600 clamped at 3-day/8h with `clamped:true`; 172800 at raised 24h cap), deterministically fast-forwards the single in-flight expedition (renown + reclaim + cleared `active`), performs the `res_quartermaster` auto-sell dump exactly once with finite results, and reports a summary the UI suppresses under ~60s; canonical-ID guards (`recipesUnlocked === ["r_iron_bar"]`, seed hero `hero_warden`, first territory `t_gatehouse`) hold; `node Tests/RunAll.js` exits 0.

---

The repo has no Source/Tests files yet (those are built in earlier phases). I have the full spec and the authoritative interface contract. Now I'll write the complete Phase 4 plan section. This is the deliverable — I'll output it directly as my final message.

## Phase 4: Game Systems, Intents, Reducer, Snapshot & Game Facade

**Phase goal.** Build the complete rules layer on top of the Content data and Simulation primitives that earlier phases delivered (`Content/*.js`, `RateSolver.solve`, `Topology`, `Tick.applyTick`, `Offline.applyOffline`, `GameState` with `NewGame/clone/freeze/validate`, `Clock/FakeClock`, `SaveManager`, `MemoryStorageAdapter`, and the `Tests/Runner.js` harness). This phase adds the five domain systems (`EconomySystem`, `ResearchSystem`, `ExpeditionSystem`, `HeroSystem`, `ProgressionSystem`), the intent vocabulary + validators (`Intents.js`), the pure `Reducer.reduce` that routes intents to systems and rejects illegal actions, the frozen read-model builder `Snapshot.build`, and the `Game` facade that ties dispatch/tick/bootstrap/snapshot together. Tests permanently guard the three balance blockers: equipment-chain reachability without territory (BLOCKER #1), the six-row power-curve regression (BLOCKER #2/#3), expedition gating reject-then-accept, win-only-at-6/6 idempotency, the exact `base*1.15^level` upgrade curve, value-positivity of all 12 recipes, and the 0.05→0.07 sales tithe. Every system is pure-or-mutating-in-place per the contract; nothing touches `window`, `document`, `localStorage`, or `Date.now()` — time arrives only via the injected `Clock`/`nowMs`. All tests run under plain `node Tests/RunAll.js` with `FakeClock` + `MemoryStorageAdapter`.

> Each task that adds a `*.Test.js` file also assumes `Tests/RunAll.js` has a static import list (per the contract: "static import list maintained in this file"). Where a task creates a new test file, it includes the exact edit to add that import to `RunAll.js`. If an earlier phase already registered a given test file name, the "add import" step is a no-op confirm — keep the import present and unique.

---

### Task 4.1: EconomySystem — upgrade-cost curve, listing gate, manual sell

**Files**
- Create: `Source/Engine/Systems/EconomySystem.js`
- Create: `Tests/Economy.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing upgrade-cost + tithe + value-positivity test.**
Create `Tests/Economy.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  upgradeCost, canUpgrade, applyUpgrade, isListed, sellFromStockpile,
} from "../Source/Engine/Systems/EconomySystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
};

describe("EconomySystem", () => {
  it("upgradeCost = base * 1.15^level (exact floats)", () => {
    // gatherer upgradeBase = 15
    expect(upgradeCost("gatherer", 1, content)).toBeCloseTo(15 * Math.pow(1.15, 1), 1e-9);
    expect(upgradeCost("gatherer", 5, content)).toBeCloseTo(15 * Math.pow(1.15, 5), 1e-9);
    // smelter upgradeBase = 25
    expect(upgradeCost("smelter", 3, content)).toBeCloseTo(25 * Math.pow(1.15, 3), 1e-9);
    // market upgradeBase = 30
    expect(upgradeCost("market", 0, content)).toBeCloseTo(30 * Math.pow(1.15, 0), 1e-9);
    // scholar upgradeBase = 35
    expect(upgradeCost("scholar", 4, content)).toBeCloseTo(35 * Math.pow(1.15, 4), 1e-9);
  });

  it("canUpgrade reflects gold on hand; applyUpgrade spends + increments level", () => {
    const s = NewGame(new FakeClock(0));
    // seed has 25 gold; miner L1 next cost = 15*1.15 = 17.25
    expect(canUpgrade(s, content, "n_miner_0")).toBe(true);
    applyUpgrade(s, content, "n_miner_0");
    const miner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    expect(s.currencies.gold).toBeCloseTo(25 - 15 * Math.pow(1.15, 1), 1e-9);
    expect(s._solved).toBe(undefined);
  });

  it("isListed honors marketListings AND non-null basePrice", () => {
    const s = NewGame(new FakeClock(0));
    expect(isListed(s, content, "iron_bar")).toBe(true); // listed at start
    expect(isListed(s, content, "steel")).toBe(false);    // not in NewGame listings
    expect(isListed(s, content, "parchment")).toBe(false); // listed never; basePrice null
  });

  it("sellFromStockpile converts a node's stockpile to gold + research tithe", () => {
    const s = NewGame(new FakeClock(0));
    const smelter = s.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 10;
    const gold0 = s.currencies.gold;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    // 10 iron_bar * 4.0 = 40 gold; tithe 0.05 * 40 = 2 research
    expect(s.currencies.gold).toBeCloseTo(gold0 + 40.0, 1e-9);
    expect(s.currencies.research).toBeCloseTo(2.0, 1e-9);
    expect(smelter.stockpile.iron_bar).toBeCloseTo(0, 1e-9);
  });

  it("value-positivity invariant: every one of the 12 recipes is gold-positive", () => {
    for (const r of Object.values(RECIPES)) {
      const outPrice = RESOURCES[r.output].basePrice;
      let inCost = 0;
      for (const [inId, amt] of Object.entries(r.inputs)) {
        const p = RESOURCES[inId].basePrice;
        inCost += (p == null ? 0 : p) * amt;
      }
      // parchment has null basePrice (never listed) — treat output value as 0 for the assert,
      // and it still must not be negative-margin: its inputs (timber) cost > 0, so skip null-output recipes.
      if (outPrice == null) continue;
      expect(outPrice > inCost).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `Tests/RunAll.js` imports `./Economy.Test.js`. Add (if not already present) the line `import "./Economy.Test.js";` in the static import block above the `run()` call.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Economy
```
Expected: failures because `Source/Engine/Systems/EconomySystem.js` does not exist yet (module-not-found / import error reported by the harness, non-zero exit code).

- [ ] **Step 4: Write the minimal EconomySystem implementation.**
Create `Source/Engine/Systems/EconomySystem.js`:
```js
export function upgradeCost(kind, level, content) {
  return content.machines[kind].upgradeBase * Math.pow(1.15, level);
}

export function canUpgrade(state, content, nodeId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  return state.currencies.gold >= upgradeCost(node.kind, node.level, content);
}

export function applyUpgrade(state, content, nodeId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const cost = upgradeCost(node.kind, node.level, content);
  if (state.currencies.gold < cost) return;
  state.currencies.gold -= cost;
  node.level += 1;
  delete state._solved;
}

export function isListed(state, content, resourceId) {
  const res = content.resources[resourceId];
  if (!res || res.basePrice == null) return false;
  return state.unlocks.marketListings.includes(resourceId);
}

export function sellFromStockpile(state, content, nodeId, resId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  if (!isListed(state, content, resId)) return;
  const qty = node.stockpile[resId] || 0;
  if (qty <= 0) return;
  const gold = qty * content.resources[resId].basePrice;
  state.currencies.gold += gold;
  state.currencies.research += gold * state.unlocks.titheRate;
  node.stockpile[resId] = 0;
}
```

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Economy
```
Expected: all `EconomySystem` cases pass; summary shows `0 failed`, exit code 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Systems/EconomySystem.js Tests/Economy.Test.js Tests/RunAll.js
git commit -m "feat(engine): add EconomySystem (upgrade curve, listing gate, manual sell) with tests"
```

---

### Task 4.2: ResearchSystem — prereq gating, spend, applyEffects (BLOCKER #1)

**Files**
- Create: `Source/Engine/Systems/ResearchSystem.js`
- Create: `Tests/ResearchSystem.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing ResearchSystem test (gating, spend, effects, BLOCKER #1).**
Create `Tests/ResearchSystem.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  canBuyResearch, buyResearch, applyEffects, researchStatus,
} from "../Source/Engine/Systems/ResearchSystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES, researchNodes: RESEARCH_NODES,
};

// Buy a chain of research nodes by directly granting currency, ignoring prereq order helper.
function own(s, id) {
  s.currencies.research += content.researchNodes[id].cost + 1;
  s.currencies.renown += content.researchNodes[id].cost + 1;
  buyResearch(s, content, id);
}

describe("ResearchSystem", () => {
  it("prereq gating: cannot buy res_lumber before res_scholar", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_lumber")).toBe(false); // prereq res_scholar unowned
    expect(researchStatus(s, content, "res_lumber")).toBe("locked");
    expect(researchStatus(s, content, "res_scholar")).toBe("available");
  });

  it("buying spends currency, records ownership, applies effects", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_scholar")).toBe(true);
    buyResearch(s, content, "res_scholar");
    expect(s.unlocks.researchOwned.includes("res_scholar")).toBe(true);
    expect(s.currencies.research).toBeCloseTo(1000 - 9, 1e-9);
    // res_scholar effects: unlockMachine scholar + unlockRecipe r_parchment
    expect(s.unlocks.machinesUnlocked.includes("scholar")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_parchment")).toBe(true);
    expect(researchStatus(s, content, "res_scholar")).toBe("owned");
    expect(s._solved).toBe(undefined);
  });

  it("BLOCKER #1: res_smithing + res_armory buyable with NO territory reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    // climb the research-only spine
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    // res_smithing needs only res_steelmaking
    expect(canBuyResearch(s, content, "res_smithing")).toBe(true);
    own(s, "res_smithing");
    // res_armory needs res_smithing + res_fittings (also research-only)
    own(s, "res_fittings");
    expect(canBuyResearch(s, content, "res_armory")).toBe(true);
    own(s, "res_armory");
    // No territory was reclaimed at any point:
    expect(s.territories.reclaimed.length).toBe(0);
    // All three equipment recipes are now unlocked => T1 gear craftable pre-expedition.
    expect(s.unlocks.recipesUnlocked.includes("r_sword")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_armor")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_shield")).toBe(true);
  });

  it("territory-gated nodes blocked until reclaim: res_war_college needs t_smithyward", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    s.currencies.renown = 100000;
    own(s, "res_scholar"); own(s, "res_lumber"); own(s, "res_tannery");
    own(s, "res_coalworks"); own(s, "res_steelmaking");
    own(s, "res_smithing"); own(s, "res_fittings"); own(s, "res_armory");
    // prereq (res_armory) owned + renown plenty, but t_smithyward not reclaimed:
    expect(canBuyResearch(s, content, "res_war_college")).toBe(false);
    s.territories.reclaimed.push("t_gatehouse", "t_smithyward");
    expect(canBuyResearch(s, content, "res_war_college")).toBe(true);
  });

  it("applyEffects: titheRate, offlineCapHours, productionBonus, globalRateBonus", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "titheRate", value: 0.07 }]);
    expect(s.unlocks.titheRate).toBeCloseTo(0.07, 1e-9);
    applyEffects(s, content, [{ type: "offlineCapHours", value: 24 }]);
    expect(s.unlocks.offlineCapHours).toBe(24);
    applyEffects(s, content, [{ type: "productionBonus", kind: "smelter", mult: 1.25 }]);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25, 1e-9);
    applyEffects(s, content, [{ type: "globalRateBonus", mult: 1.10 }]);
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.10, 1e-9);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25 * 1.10, 1e-9);
    expect(s.unlocks.productionBonuses.workshop).toBeCloseTo(1.10, 1e-9);
  });

  it("applyEffects: marketCapacityBonus, enableGathererResource, heroSlot, autoSell, unlockGearTier", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "marketCapacityBonus", mult: 1.30 }]);
    expect(s.unlocks.productionBonuses.market).toBeCloseTo(1.30, 1e-9);
    applyEffects(s, content, [{ type: "enableGathererResource", resourceId: "coal_raw" }]);
    expect(s.unlocks.gathererResources.includes("coal_raw")).toBe(true);
    const slots0 = s.unlocks.heroSlots;
    applyEffects(s, content, [{ type: "heroSlot", count: 1 }]);
    expect(s.unlocks.heroSlots).toBe(slots0 + 1);
    applyEffects(s, content, [{ type: "autoSell", enabled: true }]);
    expect(s.unlocks.autoSell).toBe(true);
    applyEffects(s, content, [{ type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 2 }]);
    const hasSwordT2 = s.unlocks.gearTiersUnlocked.some((g) => g.itemId === "sword" && g.tier === 2);
    expect(hasSwordT2).toBe(true);
  });
});
```

> The test references `s.unlocks.gathererResources`. The `enableGathererResource` effect appends to a `gathererResources` array on `unlocks`. If the StartState seed from an earlier phase did not include `gathererResources`, `applyEffects` lazily initializes it to `[]` before pushing (the implementation does this defensively).

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./ResearchSystem.Test.js";` is present in the static import block.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js ResearchSystem
```
Expected: failures — `Source/Engine/Systems/ResearchSystem.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal ResearchSystem implementation.**
Create `Source/Engine/Systems/ResearchSystem.js` (note: `res_lumber`/`res_tannery` enable the `timber`/`hide` gatherer resources via `enableGathererResource` — same mechanism as `res_coalworks` for `coal_raw` — so the reducer's startable-gatherer set must be seeded with only `iron_ore` and extended by these effects, never hardcoded; see the Phase 4 reducer task):
```js
// Authoritative effect mapping per node (Interface Contract §2.4).
const EFFECTS = {
  res_scholar:          [{ type: "unlockMachine", kind: "scholar" }, { type: "unlockRecipe", recipeId: "r_parchment" }],
  res_lumber:           [{ type: "enableGathererResource", resourceId: "timber" }, { type: "unlockRecipe", recipeId: "r_plank" }],
  res_tannery:          [{ type: "enableGathererResource", resourceId: "hide" }, { type: "unlockRecipe", recipeId: "r_leather" }],
  res_coalworks:        [{ type: "unlockRecipe", recipeId: "r_coal" }, { type: "enableGathererResource", resourceId: "coal_raw" }],
  res_steelmaking:      [{ type: "unlockRecipe", recipeId: "r_steel" }],
  res_fittings:         [{ type: "unlockRecipe", recipeId: "r_fitting" }, { type: "unlockListing", resourceIds: ["fitting"] }],
  res_open_market:      [{ type: "unlockListing", resourceIds: ["coal", "iron_bar", "plank", "leather", "steel"] }],
  res_smithing:         [{ type: "unlockRecipe", recipeId: "r_blade" }, { type: "unlockRecipe", recipeId: "r_plating" }, { type: "unlockListing", resourceIds: ["blade", "plating"] }],
  res_armory:           [{ type: "unlockRecipe", recipeId: "r_sword" }, { type: "unlockRecipe", recipeId: "r_armor" }, { type: "unlockRecipe", recipeId: "r_shield" }, { type: "unlockListing", resourceIds: ["sword", "armor", "shield"] }],
  res_efficient_forges: [{ type: "productionBonus", kind: "smelter", mult: 1.25 }],
  res_assembly_jigs:    [{ type: "productionBonus", kind: "workshop", mult: 1.25 }],
  res_trade_routes:     [{ type: "marketCapacityBonus", mult: 1.30 }, { type: "titheRate", value: 0.07 }],
  res_ledgers:          [{ type: "offlineCapHours", value: 12 }],
  res_logistics:        [{ type: "offlineCapHours", value: 24 }, { type: "globalRateBonus", mult: 1.10 }],
  res_grand_design:     [{ type: "globalRateBonus", mult: 1.20 }, { type: "scholarBonus", mult: 1.50 }],
  res_war_college:      [{ type: "heroSlot", count: 1 }],
  res_quartermaster:    [{ type: "autoSell", enabled: true }],
};

export function researchStatus(state, content, id) {
  if (state.unlocks.researchOwned.includes(id)) return "owned";
  const node = content.researchNodes[id];
  if (!node) return "locked";
  const prereqsMet = node.prereqs.every((p) => state.unlocks.researchOwned.includes(p));
  const terrMet = !node.requiresTerritory || state.territories.reclaimed.includes(node.requiresTerritory);
  return prereqsMet && terrMet ? "available" : "locked";
}

export function canBuyResearch(state, content, id) {
  const node = content.researchNodes[id];
  if (!node) return false;
  if (state.unlocks.researchOwned.includes(id)) return false;
  if (!node.prereqs.every((p) => state.unlocks.researchOwned.includes(p))) return false;
  if (node.requiresTerritory && !state.territories.reclaimed.includes(node.requiresTerritory)) return false;
  return state.currencies[node.currency] >= node.cost;
}

export function buyResearch(state, content, id) {
  if (!canBuyResearch(state, content, id)) return;
  const node = content.researchNodes[id];
  state.currencies[node.currency] -= node.cost;
  state.unlocks.researchOwned.push(id);
  applyEffects(state, content, EFFECTS[id] || []);
  delete state._solved;
}

export function applyEffects(state, content, effects) {
  const u = state.unlocks;
  for (const e of effects) {
    switch (e.type) {
      case "unlockMachine":
        // gatherer variants (forester/trapper) collapse to the "gatherer" engine kind.
        if (!u.machinesUnlocked.includes(e.kind)) u.machinesUnlocked.push(e.kind);
        break;
      case "unlockRecipe":
        if (!u.recipesUnlocked.includes(e.recipeId)) u.recipesUnlocked.push(e.recipeId);
        break;
      case "unlockListing":
        for (const r of e.resourceIds) if (!u.marketListings.includes(r)) u.marketListings.push(r);
        break;
      case "enableGathererResource":
        if (!u.gathererResources) u.gathererResources = [];
        if (!u.gathererResources.includes(e.resourceId)) u.gathererResources.push(e.resourceId);
        break;
      case "productionBonus":
        u.productionBonuses[e.kind] = (u.productionBonuses[e.kind] || 1.0) * e.mult;
        break;
      case "globalRateBonus":
        for (const k of ["gatherer", "smelter", "workshop"]) {
          u.productionBonuses[k] = (u.productionBonuses[k] || 1.0) * e.mult;
        }
        break;
      case "marketCapacityBonus":
        u.productionBonuses.market = (u.productionBonuses.market || 1.0) * e.mult;
        break;
      case "scholarBonus":
        u.productionBonuses.scholar = (u.productionBonuses.scholar || 1.0) * e.mult;
        break;
      case "titheRate":
        u.titheRate = e.value;
        break;
      case "offlineCapHours":
        u.offlineCapHours = e.value;
        break;
      case "heroSlot":
        u.heroSlots = (u.heroSlots || 1) + e.count;
        break;
      case "autoSell":
        u.autoSell = e.enabled;
        break;
      case "unlockGearTier":
        for (const itemId of e.itemIds) {
          const exists = u.gearTiersUnlocked.some((g) => g.itemId === itemId && g.tier === e.tier);
          if (!exists) u.gearTiersUnlocked.push({ itemId, tier: e.tier });
        }
        break;
    }
  }
}
```

> Note: `EFFECTS` here is the system's internal lookup keyed by research node id; it is *derived from* the canonical `Content/ResearchNodes.js` mapping in the contract. The node `cost`/`prereqs`/`requiresTerritory`/`currency` are still read from `content.researchNodes`. The `unlockGearTier` effect tag is shared with territories (Task 4.5).

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js ResearchSystem
```
Expected: all `ResearchSystem` cases pass — including the BLOCKER #1 case asserting `res_smithing`/`res_armory` buyable with `reclaimed.length === 0`. Summary `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Systems/ResearchSystem.js Tests/ResearchSystem.Test.js Tests/RunAll.js
git commit -m "feat(engine): add ResearchSystem (prereq gating, spend, applyEffects); BLOCKER #1 guard"
```

---

### Task 4.3: HeroSystem — heroPower, equip, Renown level/recruit

**Files**
- Create: `Source/Engine/Systems/HeroSystem.js`
- Modify: `Source/Engine/Content/Equipment.js` (add `itemStat` helper if not already exported by an earlier phase)
- Create: `Tests/HeroSystem.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Confirm `itemStat` exists in `Equipment.js`.** Open `Source/Engine/Content/Equipment.js`. The contract requires the helper `itemStat(itemId, tier) -> baseStat * tier`. If an earlier phase already exported it, skip Step 2. If not, Step 2 adds it.

- [ ] **Step 2 (conditional): Add `itemStat` to `Equipment.js`.** Append to `Source/Engine/Content/Equipment.js` (only if not already present):
```js
export function itemStat(itemId, tier) {
  return EQUIPMENT[itemId].baseStat * tier;
}
```

- [ ] **Step 3: Write the failing HeroSystem test.**
Create `Tests/HeroSystem.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  heroPower, levelCost, canLevelUp, levelUp,
  canEquip, equip, canRecruit, recruit,
} from "../Source/Engine/Systems/HeroSystem.js";

const content = { equipment: EQUIPMENT, heroes: HEROES };

describe("HeroSystem", () => {
  it("heroPower = gear stats + level*5; L1 unequipped = 5", () => {
    const s = NewGame(new FakeClock(0));
    // seed hero h_0 is L1, no gear: power = 0 gear + 1*5 = 5
    expect(heroPower(s, content, "h_0")).toBeCloseTo(5, 1e-9);
  });

  it("full T1 loadout on L1 hero = 35 power (clears t_gatehouse req 30)", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1);   // 10
    equip(s, content, "h_0", "armor", "armor", 1);     // 12
    equip(s, content, "h_0", "accessory", "shield", 1); // 8
    expect(heroPower(s, content, "h_0")).toBeCloseTo(10 + 12 + 8 + 5, 1e-9); // 35
  });

  it("levelCost = 5*L; levelUp spends renown and raises power +5", () => {
    expect(levelCost(1)).toBe(5);
    expect(levelCost(2)).toBe(10);
    const s = NewGame(new FakeClock(0));
    s.currencies.renown = 5;
    expect(canLevelUp(s, content, "h_0")).toBe(true);
    const p0 = heroPower(s, content, "h_0");
    levelUp(s, content, "h_0");
    expect(s.currencies.renown).toBeCloseTo(0, 1e-9);
    const hero = s.heroes.find((h) => h.id === "h_0");
    expect(hero.level).toBe(2);
    expect(heroPower(s, content, "h_0")).toBeCloseTo(p0 + 5, 1e-9);
    expect(canLevelUp(s, content, "h_0")).toBe(false); // needs 10 now, has 0
  });

  it("canEquip requires the tier to be in gearTiersUnlocked + slot match", () => {
    const s = NewGame(new FakeClock(0));
    // NewGame unlocks only tier 1 of each item.
    expect(canEquip(s, content, "h_0", "weapon", "sword", 1)).toBe(true);
    expect(canEquip(s, content, "h_0", "weapon", "sword", 2)).toBe(false); // T2 not unlocked
    expect(canEquip(s, content, "h_0", "armor", "sword", 1)).toBe(false);  // wrong slot
  });

  it("recruit gated by renown + unlockTerritory + heroSlots; pushes a new hero", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.renown = 1000;
    // hero_ranger needs t_oldmarket reclaimed AND a free slot. NewGame heroSlots=1, already 1 hero.
    expect(canRecruit(s, content, "hero_ranger")).toBe(false); // no free slot, no territory
    s.unlocks.heroSlots = 2;
    s.territories.reclaimed.push("t_gatehouse", "t_smithyward", "t_oldmarket");
    expect(canRecruit(s, content, "hero_ranger")).toBe(true);
    recruit(s, content, "hero_ranger");
    expect(s.heroes.length).toBe(2);
    const ranger = s.heroes[1];
    expect(ranger.templateId).toBe("hero_ranger");
    expect(ranger.level).toBe(1);
    expect(s.currencies.renown).toBeCloseTo(1000 - 40, 1e-9);
  });
});
```

- [ ] **Step 4: Register the test in `RunAll.js`.** Ensure `import "./HeroSystem.Test.js";` is present.

- [ ] **Step 5: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js HeroSystem
```
Expected: failures — `Source/Engine/Systems/HeroSystem.js` not found, non-zero exit code.

- [ ] **Step 6: Write the minimal HeroSystem implementation.**
Create `Source/Engine/Systems/HeroSystem.js`:
```js
import { itemStat } from "../Content/Equipment.js";

function findHero(state, heroId) {
  return state.heroes.find((h) => h.id === heroId);
}

export function heroPower(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return 0;
  let gear = 0;
  for (const slot of ["weapon", "armor", "accessory"]) {
    const e = hero.equipped[slot];
    if (e) gear += itemStat(e.itemId, e.tier);
  }
  return gear + hero.level * 5;
}

export function levelCost(level) {
  return 5 * level;
}

export function canLevelUp(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return false;
  return state.currencies.renown >= levelCost(hero.level);
}

export function levelUp(state, content, heroId) {
  const hero = findHero(state, heroId);
  if (!hero) return;
  const cost = levelCost(hero.level);
  if (state.currencies.renown < cost) return;
  state.currencies.renown -= cost;
  hero.level += 1;
}

export function canEquip(state, content, heroId, slot, itemId, tier) {
  const hero = findHero(state, heroId);
  if (!hero) return false;
  const item = content.equipment[itemId];
  if (!item || item.slot !== slot) return false;
  return state.unlocks.gearTiersUnlocked.some((g) => g.itemId === itemId && g.tier === tier);
}

export function equip(state, content, heroId, slot, itemId, tier) {
  const hero = findHero(state, heroId);
  if (!hero) return;
  hero.equipped[slot] = { itemId, tier };
}

export function canRecruit(state, content, templateId) {
  const tmpl = content.heroes[templateId];
  if (!tmpl) return false;
  if (state.heroes.some((h) => h.templateId === templateId)) return false;
  if (state.heroes.length >= state.unlocks.heroSlots) return false;
  if (tmpl.unlockTerritory && !state.territories.reclaimed.includes(tmpl.unlockTerritory)) return false;
  return state.currencies.renown >= tmpl.unlockRenownCost;
}

export function recruit(state, content, templateId) {
  if (!canRecruit(state, content, templateId)) return;
  const tmpl = content.heroes[templateId];
  state.currencies.renown -= tmpl.unlockRenownCost;
  const id = "h_" + state.heroes.length;
  state.heroes.push({ id, templateId, level: 1, equipped: { weapon: null, armor: null, accessory: null } });
}
```

> `equip` does not re-validate (the reducer calls `canEquip` first); per the contract it simply sets the slot. The test calls `equip` directly with T1 gear that is always unlocked in `NewGame`, so power assertions hold.

- [ ] **Step 7: Run it, expect PASS.** Run:
```
node Tests/RunAll.js HeroSystem
```
Expected: all `HeroSystem` cases pass; `0 failed`, exit 0.

- [ ] **Step 8: Commit.**
```
git add Source/Engine/Systems/HeroSystem.js Source/Engine/Content/Equipment.js Tests/HeroSystem.Test.js Tests/RunAll.js
git commit -m "feat(engine): add HeroSystem (heroPower, equip, renown level/recruit) with tests"
```

---

### Task 4.4: ProgressionSystem — reclaim applies unlocks; checkWin all 6 (idempotent)

**Files**
- Create: `Source/Engine/Systems/ProgressionSystem.js`
- Create: `Tests/Progression.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing Progression test.**
Create `Tests/Progression.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { reclaim, checkWin } from "../Source/Engine/Systems/ProgressionSystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

const ORDER = ["t_gatehouse", "t_smithyward", "t_oldmarket", "t_ironreach", "t_highwall", "t_blackkeep"];

describe("ProgressionSystem", () => {
  it("reclaim moves territory to reclaimed, advances available, applies unlocks", () => {
    const s = NewGame(new FakeClock(0));
    reclaim(s, content, "t_gatehouse");
    expect(s.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(s.territories.available.includes("t_gatehouse")).toBe(false);
    expect(s.territories.available.includes("t_smithyward")).toBe(true);
    // t_gatehouse unlock: gatherer bonus 1.10
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.10, 1e-9);
  });

  it("t_gatehouse grants hero_warden only if not already present (seed already has it)", () => {
    const s = NewGame(new FakeClock(0));
    const count0 = s.heroes.length; // 1 (seed warden)
    reclaim(s, content, "t_gatehouse");
    expect(s.heroes.length).toBe(count0); // not duplicated
  });

  it("t_smithyward unlocks T2 sword/shield gear tier", () => {
    const s = NewGame(new FakeClock(0));
    reclaim(s, content, "t_smithyward");
    const swordT2 = s.unlocks.gearTiersUnlocked.some((g) => g.itemId === "sword" && g.tier === 2);
    const shieldT2 = s.unlocks.gearTiersUnlocked.some((g) => g.itemId === "shield" && g.tier === 2);
    expect(swordT2).toBe(true);
    expect(shieldT2).toBe(true);
  });

  it("checkWin false at 5/6; true only after the 6th reclaim; meta.won set", () => {
    const s = NewGame(new FakeClock(0));
    for (let i = 0; i < 5; i++) reclaim(s, content, ORDER[i]);
    expect(checkWin(s, content)).toBe(false);
    expect(s.meta.won).toBe(false);
    reclaim(s, content, "t_blackkeep");
    expect(checkWin(s, content)).toBe(true);
    expect(s.meta.won).toBe(true);
  });

  it("win is idempotent: reclaiming an already-reclaimed territory does not double-apply", () => {
    const s = NewGame(new FakeClock(0));
    for (const t of ORDER) reclaim(s, content, t);
    const reclaimedCount = s.territories.reclaimed.length;
    const gathererBonus = s.unlocks.productionBonuses.gatherer;
    reclaim(s, content, "t_gatehouse"); // already reclaimed -> no-op
    expect(s.territories.reclaimed.length).toBe(reclaimedCount);
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(gathererBonus, 1e-9);
    expect(checkWin(s, content)).toBe(true);
  });
});
```

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./Progression.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Progression
```
Expected: failures — `Source/Engine/Systems/ProgressionSystem.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal ProgressionSystem implementation.**
Create `Source/Engine/Systems/ProgressionSystem.js`:
```js
import { applyEffects } from "./ResearchSystem.js";

export function reclaim(state, content, territoryId) {
  const terr = content.territories[territoryId];
  if (!terr) return;
  if (state.territories.reclaimed.includes(territoryId)) return; // idempotent

  state.territories.reclaimed.push(territoryId);
  const ai = state.territories.available.indexOf(territoryId);
  if (ai !== -1) state.territories.available.splice(ai, 1);

  // open the next territory in order, if any
  const next = Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order)[0];
  if (next && !state.territories.available.includes(next.id)) {
    state.territories.available.push(next.id);
  }

  applyEffects(state, content, terr.unlocks || []);

  if (terr.grantsHero) {
    const already = state.heroes.some((h) => h.templateId === terr.grantsHero);
    if (!already) {
      const id = "h_" + state.heroes.length;
      state.heroes.push({ id, templateId: terr.grantsHero, level: 1, equipped: { weapon: null, armor: null, accessory: null } });
    }
  }

  if (terr.isVictory) state.meta.won = true;
  delete state._solved;
}

export function checkWin(state, content) {
  const all = Object.keys(content.territories);
  const won = all.every((id) => state.territories.reclaimed.includes(id));
  if (won) state.meta.won = true;
  return won;
}
```

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Progression
```
Expected: all `ProgressionSystem` cases pass — including 5/6 false, 6/6 true, idempotent re-reclaim; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Systems/ProgressionSystem.js Tests/Progression.Test.js Tests/RunAll.js
git commit -m "feat(engine): add ProgressionSystem (reclaim unlocks, idempotent checkWin) with tests"
```

---

### Task 4.5: ExpeditionSystem — start gating, resolve, reclaim + power-curve regression (BLOCKER #2/#3)

**Files**
- Create: `Source/Engine/Systems/ExpeditionSystem.js`
- Create: `Tests/ExpeditionSystem.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing ExpeditionSystem test (gating reject-then-accept, resolve, six-row power curve).**
Create `Tests/ExpeditionSystem.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { heroPower, equip, levelUp } from "../Source/Engine/Systems/HeroSystem.js";
import { reclaim } from "../Source/Engine/Systems/ProgressionSystem.js";
import {
  nextTerritory, canStart, startExpedition, tryResolve, timeRemaining,
} from "../Source/Engine/Systems/ExpeditionSystem.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("ExpeditionSystem", () => {
  it("nextTerritory is the lowest un-reclaimed; null when all reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    expect(nextTerritory(s, content)).toBe("t_gatehouse");
    s.territories.reclaimed = Object.keys(TERRITORIES).slice();
    expect(nextTerritory(s, content)).toBe(null);
  });

  it("gating reject-then-accept: power 35 vs req 38 rejected; level to L2 -> accepted", () => {
    const s = NewGame(new FakeClock(0));
    // craft path is research; here we just equip T1 gear directly (all T1 unlocked at start)
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    // reclaim t_gatehouse so the next target is t_smithyward (req 38)
    reclaim(s, content, "t_gatehouse");
    expect(nextTerritory(s, content)).toBe("t_smithyward");
    expect(heroPower(s, content, "h_0")).toBeCloseTo(35, 1e-9);
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(false); // 35 < 38
    s.currencies.renown = 5;
    levelUp(s, content, "h_0"); // L2 -> power 40
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(true);
  });

  it("cannot start a non-next territory or with active expedition running", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    expect(canStart(s, content, "t_smithyward", "h_0")).toBe(false); // not the next one
    startExpedition(s, content, "t_gatehouse", "h_0", 1000);
    expect(s.expeditions.active.territoryId).toBe("t_gatehouse");
    expect(canStart(s, content, "t_gatehouse", "h_0")).toBe(false); // already active
  });

  it("startExpedition stamps startedAt; timeRemaining counts down; tryResolve grants + reclaims", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1);
    equip(s, content, "h_0", "armor", "armor", 1);
    equip(s, content, "h_0", "accessory", "shield", 1);
    startExpedition(s, content, "t_gatehouse", "h_0", 1000);
    expect(timeRemaining(s, 1000)).toBe(120000); // durationMs
    expect(timeRemaining(s, 61000)).toBe(60000);
    expect(tryResolve(s, content, 100000)).toBe(null); // not yet
    const gold0 = s.currencies.gold, research0 = s.currencies.research, renown0 = s.currencies.renown;
    const resolved = tryResolve(s, content, 1000 + 120000);
    expect(resolved.territoryId).toBe("t_gatehouse");
    expect(s.currencies.gold).toBeCloseTo(gold0 + 50, 1e-9);
    expect(s.currencies.research).toBeCloseTo(research0 + 20, 1e-9);
    expect(s.currencies.renown).toBeCloseTo(renown0 + 10, 1e-9);
    expect(s.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(s.expeditions.active).toBe(null);
    expect(s.expeditions.completed.length).toBe(1);
  });

  it("BLOCKER #2/#3 power-curve regression: each of the six §6.3 rows clears its gate with prior-reclaim gear", () => {
    // Build a fresh state, unlock ALL gear tiers a player would legitimately possess
    // by the time of each attempt, then assert the §6.3 best-loadout total >= required.
    // Each row uses ONLY gear unlocked by reclaims strictly BEFORE that attempt.
    const rows = [
      // attempt territory, [swordTier, armorTier, shieldTier], heroLevel, expectedTotal
      { id: "t_gatehouse",  gear: [1, 1, 1], level: 1, total: 35,  req: 30 },
      { id: "t_smithyward", gear: [1, 1, 1], level: 2, total: 40,  req: 38 },
      { id: "t_oldmarket",  gear: [2, 1, 2], level: 3, total: 63,  req: 50 },
      { id: "t_ironreach",  gear: [2, 2, 2], level: 4, total: 80,  req: 65 },
      { id: "t_highwall",   gear: [3, 2, 3], level: 5, total: 103, req: 85 },
      { id: "t_blackkeep",  gear: [3, 3, 3], level: 6, total: 120, req: 110 },
    ];

    // Track which gear tiers are unlocked as we reclaim in order. Start = T1 of all (NewGame seed).
    const unlocked = new Set(["sword:1", "armor:1", "shield:1"]);
    const s = NewGame(new FakeClock(0));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [sw, ar, sh] = row.gear;
      // Assert the gear this row uses is legitimately available BEFORE attempting row.id:
      expect(unlocked.has("sword:" + sw)).toBe(true);
      expect(unlocked.has("armor:" + ar)).toBe(true);
      expect(unlocked.has("shield:" + sh)).toBe(true);

      // Equip + set level to compute power, assert vs required.
      equip(s, content, "h_0", "weapon", "sword", sw);
      equip(s, content, "h_0", "armor", "armor", ar);
      equip(s, content, "h_0", "accessory", "shield", sh);
      s.heroes.find((h) => h.id === "h_0").level = row.level;

      const power = heroPower(s, content, "h_0");
      expect(power).toBeCloseTo(row.total, 1e-9);
      expect(power >= row.req).toBeTruthy();
      expect(power >= content.territories[row.id].requiredPower).toBeTruthy();

      // Now reclaim row.id and fold ITS gear-tier unlocks into `unlocked` for the next attempt.
      reclaim(s, content, row.id);
      for (const g of s.unlocks.gearTiersUnlocked) unlocked.add(g.itemId + ":" + g.tier);
    }
    expect(s.meta.won).toBe(true);
  });

  it("determinism: identical start + clock yields identical resolution twice", () => {
    function runOnce() {
      const s = NewGame(new FakeClock(0));
      equip(s, content, "h_0", "weapon", "sword", 1);
      equip(s, content, "h_0", "armor", "armor", 1);
      equip(s, content, "h_0", "accessory", "shield", 1);
      startExpedition(s, content, "t_gatehouse", "h_0", 0);
      return tryResolve(s, content, 120000);
    }
    expect(runOnce()).toEqual(runOnce());
  });
});
```

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./ExpeditionSystem.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js ExpeditionSystem
```
Expected: failures — `Source/Engine/Systems/ExpeditionSystem.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal ExpeditionSystem implementation.**
Create `Source/Engine/Systems/ExpeditionSystem.js`:
```js
import { heroPower } from "./HeroSystem.js";
import { reclaim } from "./ProgressionSystem.js";

export function nextTerritory(state, content) {
  const remaining = Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order);
  return remaining.length ? remaining[0].id : null;
}

export function canStart(state, content, territoryId, heroId) {
  if (state.expeditions.active) return false;
  if (territoryId !== nextTerritory(state, content)) return false;
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return false;
  const terr = content.territories[territoryId];
  if (!terr) return false;
  return heroPower(state, content, heroId) >= terr.requiredPower;
}

export function startExpedition(state, content, territoryId, heroId, nowMs) {
  if (!canStart(state, content, territoryId, heroId)) return;
  const terr = content.territories[territoryId];
  state.expeditions.active = {
    territoryId, startedAt: nowMs, durationMs: terr.durationMs, heroId,
  };
}

export function timeRemaining(state, nowMs) {
  const a = state.expeditions.active;
  if (!a) return 0;
  const end = a.startedAt + a.durationMs;
  return Math.max(0, end - nowMs);
}

export function tryResolve(state, content, nowMs) {
  const a = state.expeditions.active;
  if (!a) return null;
  if (nowMs < a.startedAt + a.durationMs) return null;
  const terr = content.territories[a.territoryId];
  state.currencies.gold += terr.rewards.gold;
  state.currencies.research += terr.rewards.research;
  state.currencies.renown += terr.rewards.renown;
  reclaim(state, content, a.territoryId);
  state.expeditions.completed.push({ territoryId: a.territoryId, completedAt: nowMs });
  state.expeditions.active = null;
  return { territoryId: terr.id, rewards: terr.rewards };
}
```

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js ExpeditionSystem
```
Expected: all cases pass — gating reject-then-accept, resolve+reclaim, the **six-row BLOCKER #2/#3 power-curve regression**, and determinism; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Systems/ExpeditionSystem.js Tests/ExpeditionSystem.Test.js Tests/RunAll.js
git commit -m "feat(engine): add ExpeditionSystem (gating, resolve, reclaim); BLOCKER #2/#3 power-curve guard"
```

---

### Task 4.6: Intents — type constants + structural validators

**Files**
- Create: `Source/Engine/Intents.js`
- Create: `Tests/Intents.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing Intents test.**
Create `Tests/Intents.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { INTENT, validate } from "../Source/Engine/Intents.js";

describe("Intents", () => {
  it("exposes the full INTENT tag set", () => {
    expect(INTENT.PlaceNode).toBe("PlaceNode");
    expect(INTENT.ConnectLink).toBe("ConnectLink");
    expect(INTENT.UpgradeNode).toBe("UpgradeNode");
    expect(INTENT.SetRecipe).toBe("SetRecipe");
    expect(INTENT.BuyResearch).toBe("BuyResearch");
    expect(INTENT.EquipItem).toBe("EquipItem");
    expect(INTENT.StartExpedition).toBe("StartExpedition");
    expect(INTENT.SellFromStockpile).toBe("SellFromStockpile");
    expect(INTENT.LevelUpHero).toBe("LevelUpHero");
    expect(INTENT.RecruitHero).toBe("RecruitHero");
    expect(INTENT.SetGathererResource).toBe("SetGathererResource");
    expect(INTENT.RemoveNode).toBe("RemoveNode");
    expect(INTENT.RemoveLink).toBe("RemoveLink");
    expect(INTENT.DismissTooltip).toBe("DismissTooltip");
  });

  it("validate accepts well-formed intents", () => {
    expect(validate({ type: "UpgradeNode", nodeId: "n_miner_0" }).ok).toBe(true);
    expect(validate({ type: "ConnectLink", from: "a", to: "b", resourceId: "iron_ore" }).ok).toBe(true);
    expect(validate({ type: "BuyResearch", nodeId: "res_scholar" }).ok).toBe(true);
    expect(validate({ type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 1 }).ok).toBe(true);
    expect(validate({ type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0" }).ok).toBe(true);
    expect(validate({ type: "PlaceNode", kind: "smelter", pos: { x: 10, y: 20 } }).ok).toBe(true);
    expect(validate({ type: "SetRecipe", nodeId: "n_smelter_0", recipeId: "r_steel" }).ok).toBe(true);
    expect(validate({ type: "SellFromStockpile", nodeId: "n_smelter_0", resId: "iron_bar" }).ok).toBe(true);
    expect(validate({ type: "LevelUpHero", heroId: "h_0" }).ok).toBe(true);
    expect(validate({ type: "RecruitHero", templateId: "hero_ranger" }).ok).toBe(true);
    expect(validate({ type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "coal_raw" }).ok).toBe(true);
    expect(validate({ type: "RemoveNode", nodeId: "n_x" }).ok).toBe(true);
    expect(validate({ type: "RemoveLink", linkId: "l_0" }).ok).toBe(true);
    expect(validate({ type: "DismissTooltip", flag: "seenGoldTip" }).ok).toBe(true);
  });

  it("validate rejects unknown type + missing fields", () => {
    expect(validate({ type: "Nope" }).ok).toBe(false);
    expect(validate({ type: "UpgradeNode" }).ok).toBe(false);                 // no nodeId
    expect(validate({ type: "ConnectLink", from: "a", to: "b" }).ok).toBe(false); // no resourceId
    expect(validate({ type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword" }).ok).toBe(false); // no tier
    expect(validate({ type: "PlaceNode", kind: "smelter" }).ok).toBe(false);  // no pos
    expect(validate({ type: "PlaceNode", kind: "smelter", pos: { x: 1 } }).ok).toBe(false); // pos.y missing
    expect(validate(null).ok).toBe(false);
    expect(validate(42).ok).toBe(false);
  });

  it("validate returns an error message on rejection", () => {
    const r = validate({ type: "UpgradeNode" });
    expect(r.ok).toBe(false);
    expect(typeof r.error === "string" && r.error.length > 0).toBeTruthy();
  });
});
```

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./Intents.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Intents
```
Expected: failures — `Source/Engine/Intents.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal Intents implementation.**
Create `Source/Engine/Intents.js`:
```js
export const INTENT = {
  PlaceNode: "PlaceNode",
  ConnectLink: "ConnectLink",
  UpgradeNode: "UpgradeNode",
  SetRecipe: "SetRecipe",
  BuyResearch: "BuyResearch",
  EquipItem: "EquipItem",
  StartExpedition: "StartExpedition",
  SellFromStockpile: "SellFromStockpile",
  LevelUpHero: "LevelUpHero",
  RecruitHero: "RecruitHero",
  SetGathererResource: "SetGathererResource",
  RemoveNode: "RemoveNode",
  RemoveLink: "RemoveLink",
  DismissTooltip: "DismissTooltip",
};

const isStr = (v) => typeof v === "string" && v.length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPos = (v) => v && isNum(v.x) && isNum(v.y);

const SHAPES = {
  PlaceNode: (i) => isStr(i.kind) && isPos(i.pos),
  ConnectLink: (i) => isStr(i.from) && isStr(i.to) && isStr(i.resourceId),
  UpgradeNode: (i) => isStr(i.nodeId),
  SetRecipe: (i) => isStr(i.nodeId) && isStr(i.recipeId),
  BuyResearch: (i) => isStr(i.nodeId),
  EquipItem: (i) => isStr(i.heroId) && isStr(i.slot) && isStr(i.itemId) && isNum(i.tier),
  StartExpedition: (i) => isStr(i.territoryId) && isStr(i.heroId),
  SellFromStockpile: (i) => isStr(i.nodeId) && isStr(i.resId),
  LevelUpHero: (i) => isStr(i.heroId),
  RecruitHero: (i) => isStr(i.templateId),
  SetGathererResource: (i) => isStr(i.nodeId) && isStr(i.resourceId),
  RemoveNode: (i) => isStr(i.nodeId),
  RemoveLink: (i) => isStr(i.linkId),
  DismissTooltip: (i) => isStr(i.flag),
};

export function validate(intent) {
  if (!intent || typeof intent !== "object") return { ok: false, error: "intent must be an object" };
  const shape = SHAPES[intent.type];
  if (!shape) return { ok: false, error: "unknown intent type: " + intent.type };
  if (!shape(intent)) return { ok: false, error: "malformed " + intent.type + " intent" };
  return { ok: true };
}
```

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Intents
```
Expected: all `Intents` cases pass; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Intents.js Tests/Intents.Test.js Tests/RunAll.js
git commit -m "feat(engine): add Intents constants + structural validators with tests"
```

---

### Task 4.7: Reducer — pure (state, intent, content) → {state, error}, routes to systems

**Files**
- Create: `Source/Engine/Reducer.js`
- Create: `Tests/Reducer.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing Reducer test (accept, reject-unchanged, structural-dirty).**
Create `Tests/Reducer.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { reduce } from "../Source/Engine/Reducer.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("Reducer", () => {
  it("is pure: rejected intent returns the original state object unchanged + an error", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.gold = 0; // cannot afford any upgrade
    const before = JSON.stringify(s);
    const out = reduce(s, { type: "UpgradeNode", nodeId: "n_miner_0" }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);                 // unchanged reference on reject
    expect(JSON.stringify(s)).toBe(before);    // input not mutated
  });

  it("accepts a legal UpgradeNode: returns a new state with the level bumped, original untouched", () => {
    const s = NewGame(new FakeClock(0)); // 25 gold; miner upgrade 17.25
    const out = reduce(s, { type: "UpgradeNode", nodeId: "n_miner_0" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state).not.toBe(s);             // new state on accept (cloned)
    const miner = out.state.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    const origMiner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(origMiner.level).toBe(1);           // original not mutated
    expect(out.state._solved).toBe(undefined); // structural change -> solver dirty
  });

  it("rejects malformed intents via Intents.validate", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "UpgradeNode" }, content);
    expect(out.state).toBe(s);
    expect(typeof out.error === "string").toBe(true);
  });

  it("routes BuyResearch via nodeId; rejects unaffordable, accepts affordable", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 0;
    const rej = reduce(s, { type: "BuyResearch", nodeId: "res_scholar" }, content);
    expect(rej.error !== undefined).toBe(true);
    expect(rej.state).toBe(s);
    s.currencies.research = 100;
    const acc = reduce(s, { type: "BuyResearch", nodeId: "res_scholar" }, content);
    expect(acc.error).toBe(undefined);
    expect(acc.state.unlocks.researchOwned.includes("res_scholar")).toBe(true);
  });

  it("routes StartExpedition; rejects under-power; accepts when power >= req", () => {
    const s = NewGame(new FakeClock(0));
    const rej = reduce(s, { type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0" }, content);
    expect(rej.error !== undefined).toBe(true); // hero power 5 < 30
    // equip + dispatch equip through the reducer
    let cur = s;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 1 }, content).state;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "armor", itemId: "armor", tier: 1 }, content).state;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "accessory", itemId: "shield", tier: 1 }, content).state;
    const acc = reduce(cur, { type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0", _nowMs: 5000 }, content);
    expect(acc.error).toBe(undefined);
    expect(acc.state.expeditions.active.territoryId).toBe("t_gatehouse");
  });

  it("rejects EquipItem with a locked tier (T2 sword before any reclaim)", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 2 }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("rejects a cycle-creating ConnectLink", () => {
    const s = NewGame(new FakeClock(0));
    // seed: miner->smelter->market. Try to close a cycle market->miner (illegal & wrong ports anyway).
    const out = reduce(s, { type: "ConnectLink", from: "n_market_0", to: "n_miner_0", resourceId: "iron_bar" }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("DismissTooltip flips a tutorial flag (non-structural, no solver dirty needed)", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "DismissTooltip", flag: "seenGoldTip" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state.meta.tutorialFlags.seenGoldTip).toBe(true);
  });
});
```

> The reducer reads an optional `intent._nowMs` for time-bearing intents (`StartExpedition`). The `Game` facade injects `clock.now()` into `_nowMs` before calling `reduce` (Task 4.9); tests pass it explicitly. When absent, the reducer defaults `_nowMs` to `state.lastSeen` (deterministic, never reads wall-clock).

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./Reducer.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Reducer
```
Expected: failures — `Source/Engine/Reducer.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal Reducer implementation.**
Create `Source/Engine/Reducer.js`:
```js
import { validate } from "./Intents.js";
import { clone } from "./GameState.js";
import { isValidLink, wouldStayAcyclic } from "./Simulation/Topology.js";
import * as Economy from "./Systems/EconomySystem.js";
import * as Research from "./Systems/ResearchSystem.js";
import * as Hero from "./Systems/HeroSystem.js";
import * as Expedition from "./Systems/ExpeditionSystem.js";

function reject(state, error) {
  return { state, error };
}

function nodeById(state, id) {
  return state.graph.nodes.find((n) => n.id === id);
}

export function reduce(state, intent, content) {
  const v = validate(intent);
  if (!v.ok) return reject(state, v.error);

  // Work on a clone; only return it if the intent is accepted.
  const next = clone(state);
  const nowMs = typeof intent._nowMs === "number" ? intent._nowMs : state.lastSeen;
  let structural = false;

  switch (intent.type) {
    case "UpgradeNode": {
      if (!Economy.canUpgrade(next, content, intent.nodeId)) return reject(state, "cannot upgrade");
      Economy.applyUpgrade(next, content, intent.nodeId);
      structural = true;
      break;
    }
    case "SellFromStockpile": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      if (!Economy.isListed(next, content, intent.resId)) return reject(state, "resource not listed");
      if ((node.stockpile[intent.resId] || 0) <= 0) return reject(state, "empty stockpile");
      Economy.sellFromStockpile(next, content, intent.nodeId, intent.resId);
      break;
    }
    case "BuyResearch": {
      if (!Research.canBuyResearch(next, content, intent.nodeId)) return reject(state, "cannot buy research");
      Research.buyResearch(next, content, intent.nodeId);
      structural = true;
      break;
    }
    case "EquipItem": {
      if (!Hero.canEquip(next, content, intent.heroId, intent.slot, intent.itemId, intent.tier)) {
        return reject(state, "cannot equip");
      }
      Hero.equip(next, content, intent.heroId, intent.slot, intent.itemId, intent.tier);
      break;
    }
    case "LevelUpHero": {
      if (!Hero.canLevelUp(next, content, intent.heroId)) return reject(state, "cannot level up");
      Hero.levelUp(next, content, intent.heroId);
      break;
    }
    case "RecruitHero": {
      if (!Hero.canRecruit(next, content, intent.templateId)) return reject(state, "cannot recruit");
      Hero.recruit(next, content, intent.templateId);
      break;
    }
    case "StartExpedition": {
      if (!Expedition.canStart(next, content, intent.territoryId, intent.heroId)) {
        return reject(state, "cannot start expedition");
      }
      Expedition.startExpedition(next, content, intent.territoryId, intent.heroId, nowMs);
      break;
    }
    case "PlaceNode": {
      const seq = next.graph.nextNodeSeq;
      const id = "n_" + intent.kind + "_" + seq;
      next.graph.nodes.push({
        id,
        kind: intent.kind,
        level: 1,
        resourceId: intent.resourceId || null,
        recipeId: intent.recipeId || null,
        stockpile: {},
        pos: { x: intent.pos.x, y: intent.pos.y },
      });
      next.graph.nextNodeSeq = seq + 1;
      structural = true;
      break;
    }
    case "ConnectLink": {
      if (!isValidLink(next, content, intent.from, intent.to, intent.resourceId)) {
        return reject(state, "invalid link");
      }
      if (!wouldStayAcyclic(next.graph.nodes, next.graph.links, intent.from, intent.to)) {
        return reject(state, "cycle");
      }
      const seq = next.graph.nextLinkSeq;
      next.graph.links.push({ id: "l_" + seq, from: intent.from, to: intent.to, resourceId: intent.resourceId });
      next.graph.nextLinkSeq = seq + 1;
      structural = true;
      break;
    }
    case "SetRecipe": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      if (node.kind !== "smelter" && node.kind !== "workshop") return reject(state, "not a crafter");
      if (!next.unlocks.recipesUnlocked.includes(intent.recipeId)) return reject(state, "recipe locked");
      const recipe = content.recipes[intent.recipeId];
      if (!recipe || recipe.crafterKind !== node.kind) return reject(state, "recipe/crafter mismatch");
      node.recipeId = intent.recipeId;
      structural = true;
      break;
    }
    case "SetGathererResource": {
      const node = nodeById(next, intent.nodeId);
      if (!node || node.kind !== "gatherer") return reject(state, "not a gatherer");
      const enabled = (next.unlocks.gathererResources || []).includes(intent.resourceId);
      const startable = ["iron_ore", "timber", "hide"].includes(intent.resourceId);
      if (!enabled && !startable) return reject(state, "resource not enabled");
      node.resourceId = intent.resourceId;
      structural = true;
      break;
    }
    case "RemoveNode": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      next.graph.nodes = next.graph.nodes.filter((n) => n.id !== intent.nodeId);
      next.graph.links = next.graph.links.filter((l) => l.from !== intent.nodeId && l.to !== intent.nodeId);
      structural = true;
      break;
    }
    case "RemoveLink": {
      const link = next.graph.links.find((l) => l.id === intent.linkId);
      if (!link) return reject(state, "no such link");
      next.graph.links = next.graph.links.filter((l) => l.id !== intent.linkId);
      structural = true;
      break;
    }
    case "DismissTooltip": {
      next.meta.tutorialFlags[intent.flag] = true;
      break;
    }
    default:
      return reject(state, "unhandled intent: " + intent.type);
  }

  if (structural) delete next._solved;
  return { state: next };
}
```

> The reducer never reads `Date.now()`: time-bearing intents take `intent._nowMs`, defaulting to `state.lastSeen`. `SetGathererResource` allows the three always-available starting raws (`iron_ore`/`timber`/`hide`) plus anything in `unlocks.gathererResources` (populated by `enableGathererResource` effects for `coal_raw`/`gemstone`). `isValidLink`/`wouldStayAcyclic` come from `Topology.js` (Phase ≤3); the cycle test relies on `isValidLink` rejecting the market→miner case on ports, but the test still asserts a non-empty error either way.

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Reducer
```
Expected: all `Reducer` cases pass — purity on reject, new-state on accept, solver-dirty on structural change, BuyResearch/StartExpedition/Equip routing, cycle + locked-tier rejection, tooltip flip; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Reducer.js Tests/Reducer.Test.js Tests/RunAll.js
git commit -m "feat(engine): add pure Reducer routing intents to systems with rejection + solver-dirty"
```

---

### Task 4.8: Snapshot — frozen read-model with derived fields

**Files**
- Create: `Source/Engine/Snapshot.js`
- Create: `Tests/Snapshot.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing Snapshot test.**
Create `Tests/Snapshot.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { build } from "../Source/Engine/Snapshot.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("Snapshot", () => {
  it("builds a frozen read-model with raw currencies + rates from solved", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap.currencies.gold).toBeCloseTo(25, 1e-9);
    // seed steady state: goldRate 2.0, researchRate 0.10 (§7 baseline)
    expect(snap.rates.goldRate).toBeCloseTo(2.0, 1e-9);
    expect(snap.rates.researchRate).toBeCloseTo(0.10, 1e-9);
  });

  it("node rows carry upgradeCost, canAfford, capacity, effectiveRate", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const miner = snap.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(1);
    expect(miner.upgradeCost).toBeCloseTo(15 * Math.pow(1.15, 1), 1e-9);
    expect(miner.canAfford).toBe(true); // 25 gold >= 17.25
    expect(typeof miner.capacity === "number").toBe(true);
    expect(typeof miner.effectiveRate === "number").toBe(true);
  });

  it("research rows carry status + affordability + name", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100;
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const scholar = snap.research.find((r) => r.id === "res_scholar");
    expect(scholar.status).toBe("available");
    expect(scholar.affordable).toBe(true);
    expect(scholar.name).toBe(content.researchNodes.res_scholar ? RESEARCH_NODES.res_scholar.name || "Found the Scholars' Guild" : "");
  });

  it("hero rows carry power + powerBreakdown + levelCost", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const hero = snap.heroes.find((h) => h.id === "h_0");
    expect(hero.power).toBeCloseTo(5, 1e-9);
    expect(hero.powerBreakdown.gear).toBeCloseTo(0, 1e-9);
    expect(hero.powerBreakdown.level).toBeCloseTo(5, 1e-9);
    expect(hero.levelCost).toBe(5);
  });

  it("territory rows carry status + isNext; expedition is null when none active", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    const gh = snap.territories.find((t) => t.id === "t_gatehouse");
    expect(gh.status).toBe("available");
    expect(gh.isNext).toBe(true);
    const sw = snap.territories.find((t) => t.id === "t_smithyward");
    expect(sw.status).toBe("locked");
    expect(snap.expedition).toBe(null);
    expect(snap.meta.won).toBe(false);
  });

  it("snapshot is deeply frozen (nested objects too)", () => {
    const s = NewGame(new FakeClock(0));
    const solved = solve(s, content);
    const snap = build(s, solved, content);
    expect(Object.isFrozen(snap.currencies)).toBe(true);
    expect(Object.isFrozen(snap.nodes)).toBe(true);
    expect(Object.isFrozen(snap.nodes[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./Snapshot.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Snapshot
```
Expected: failures — `Source/Engine/Snapshot.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal Snapshot implementation.**
Create `Source/Engine/Snapshot.js`:
```js
import { upgradeCost } from "./Systems/EconomySystem.js";
import { heroPower, levelCost, canLevelUp } from "./Systems/HeroSystem.js";
import { researchStatus, canBuyResearch } from "./Systems/ResearchSystem.js";
import { nextTerritory, timeRemaining } from "./Systems/ExpeditionSystem.js";

function fmt(n) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return (Math.round(n * 100) / 100).toString();
}

function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

export function build(state, solved, content) {
  const goldRate = solved.goldRate || 0;
  const researchRate = solved.researchRate || 0;

  const nodes = state.graph.nodes.map((node) => {
    const cap = (solved.capacityByNode && solved.capacityByNode[node.id]) || 0;
    const out = (solved.availableOut && solved.availableOut[node.id]) || {};
    const effectiveRate = Object.values(out).reduce((a, b) => a + b, 0);
    const cost = upgradeCost(node.kind, node.level, content);
    return {
      id: node.id, kind: node.kind, level: node.level,
      resourceId: node.resourceId, recipeId: node.recipeId,
      pos: { x: node.pos.x, y: node.pos.y },
      capacity: cap, effectiveRate,
      capacityPct: cap > 0 ? effectiveRate / cap : 0,
      draw: (solved.perNodeDraw && solved.perNodeDraw[node.id]) || {},
      surplus: (solved.surplusRate && solved.surplusRate[node.id]) || {},
      stockpile: { ...node.stockpile },
      upgradeCost: cost,
      canAfford: state.currencies.gold >= cost,
    };
  });

  const links = state.graph.links.map((l) => {
    const flow = (solved.linkFlow && solved.linkFlow[l.id]) || 0;
    return { id: l.id, from: l.from, to: l.to, resourceId: l.resourceId, flow, fedPct: 0 };
  });

  const research = Object.values(content.researchNodes).map((rn) => {
    const status = researchStatus(state, content, rn.id);
    return {
      id: rn.id, name: rn.name, cost: rn.cost, currency: rn.currency,
      status,
      prereqsMet: rn.prereqs.every((p) => state.unlocks.researchOwned.includes(p)),
      affordable: canBuyResearch(state, content, rn.id),
      effectsText: rn.flavor || "",
    };
  });

  const heroes = state.heroes.map((h) => {
    const tmpl = content.heroes[h.templateId];
    const power = heroPower(state, content, h.id);
    return {
      id: h.id, templateId: h.templateId, name: tmpl ? tmpl.name : h.templateId,
      level: h.level, power,
      powerBreakdown: { gear: power - h.level * 5, level: h.level * 5 },
      equipped: {
        weapon: h.equipped.weapon, armor: h.equipped.armor, accessory: h.equipped.accessory,
      },
      levelCost: levelCost(h.level),
      canLevel: canLevelUp(state, content, h.id),
    };
  });

  const nextId = nextTerritory(state, content);
  const active = state.expeditions.active;
  const territories = Object.values(content.territories)
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      let status;
      if (state.territories.reclaimed.includes(t.id)) status = "reclaimed";
      else if (active && active.territoryId === t.id) status = "active";
      else if (state.territories.available.includes(t.id)) status = "available";
      else status = "locked";
      return {
        id: t.id, name: t.name, order: t.order,
        requiredPower: t.requiredPower, durationMs: t.durationMs,
        rewards: { ...t.rewards }, status, flavor: t.flavor || "",
        isNext: t.id === nextId,
      };
    });

  const nowMs = state.lastSeen;
  const expedition = active
    ? {
        active: true, territoryId: active.territoryId,
        timeRemainingMs: timeRemaining(state, nowMs),
        durationMs: active.durationMs, heroId: active.heroId,
      }
    : null;

  const snap = {
    currencies: { gold: state.currencies.gold, research: state.currencies.research, renown: state.currencies.renown },
    rates: { goldRate, researchRate },
    currencyStrings: {
      gold: fmt(state.currencies.gold), research: fmt(state.currencies.research),
      renown: fmt(state.currencies.renown), goldRate: fmt(goldRate), researchRate: fmt(researchRate),
    },
    nodes, links, research, heroes, territories, expedition,
    buildMenu: {
      placeableMachines: state.unlocks.machinesUnlocked.slice(),
      unlockedRecipes: state.unlocks.recipesUnlocked.slice(),
    },
    save: { status: "ok", lastSavedAt: state.savedAt },
    tutorial: { flags: { ...state.meta.tutorialFlags } },
    meta: { won: state.meta.won },
    lastError: null,
  };

  return deepFreeze(snap);
}
```

> `fedPct` is left 0 in the MVP read-model (the solver's `linkFlow` already gives flow; the consumer "wanted" denominator is a UI nicety and not asserted by any Phase-4 test). `effectsText` uses node flavor for the tooltip line; the contract lists it as a derived UI string. Snapshot only *reads* state/solved — it never mutates and never reads wall-clock (`nowMs = state.lastSeen`).

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Snapshot
```
Expected: all `Snapshot` cases pass — frozen tree, seed rates 2.0/0.10, node/research/hero/territory rows, null expedition; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Snapshot.js Tests/Snapshot.Test.js Tests/RunAll.js
git commit -m "feat(engine): add Snapshot frozen read-model builder with derived fields + tests"
```

---

### Task 4.9: Game facade — bootstrap / dispatch / tick / getState / onSnapshot / emitSnapshotForFrame

**Files**
- Create: `Source/Engine/Game.js`
- Create: `Tests/Game.Test.js`
- Modify: `Tests/RunAll.js`

- [ ] **Step 1: Write the failing Game facade test.**
Create `Tests/Game.Test.js`:
```js
import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { START_STATE } from "../Source/Engine/Content/StartState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { Game } from "../Source/Engine/Game.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES, startState: START_STATE,
};

function makeGame(clock) {
  return new Game({ content, clock: clock || new FakeClock(0) });
}

describe("Game facade", () => {
  it("bootstrap on empty storage starts a new game and returns an offline summary", () => {
    const g = makeGame(new FakeClock(0));
    const summary = g.bootstrap(new MemoryStorageAdapter());
    expect(summary !== null && typeof summary === "object").toBe(true);
    expect(typeof summary.appliedMs === "number").toBe(true);
    expect(g.getState().currencies.gold).toBeCloseTo(25, 1e-9);
  });

  it("dispatch routes a legal intent and returns ok; rejects an illegal one", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    const ok = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(ok.ok).toBe(true);
    expect(g.getState().graph.nodes.find((n) => n.id === "n_miner_0").level).toBe(2);
    // drain gold then reject
    g.getState().currencies.gold = 0;
    const bad = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(bad.ok).toBe(false);
    expect(typeof bad.error === "string").toBe(true);
  });

  it("dispatch emits a snapshot to subscribers", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    let last = null;
    const off = g.onSnapshot((snap) => { last = snap; });
    g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(last !== null).toBe(true);
    expect(Object.isFrozen(last)).toBe(true);
    expect(last.nodes.find((n) => n.id === "n_miner_0").level).toBe(2);
    off();
    last = null;
    g.dispatch({ type: "DismissTooltip", flag: "seenGoldTip" });
    expect(last).toBe(null); // unsubscribed
  });

  it("tick integrates rates over dt without emitting per call", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    let emits = 0;
    g.onSnapshot(() => { emits++; });
    const gold0 = g.getState().currencies.gold;
    g.tick(10); // 10 seconds at 2.0 gold/s -> +20 gold
    expect(g.getState().currencies.gold).toBeCloseTo(gold0 + 20, 1e-9);
    expect(emits).toBe(0); // tick does not emit
    g.emitSnapshotForFrame();
    expect(emits).toBe(1);
  });

  it("tick resolves an in-flight expedition when its duration elapses", () => {
    const clock = new FakeClock(0);
    const g = makeGame(clock);
    g.bootstrap(new MemoryStorageAdapter());
    // equip + start via dispatch
    g.dispatch({ type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 1 });
    g.dispatch({ type: "EquipItem", heroId: "h_0", slot: "armor", itemId: "armor", tier: 1 });
    g.dispatch({ type: "EquipItem", heroId: "h_0", slot: "accessory", itemId: "shield", tier: 1 });
    g.dispatch({ type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0" });
    expect(g.getState().expeditions.active.territoryId).toBe("t_gatehouse");
    // advance clock past 120s and tick
    clock.advance(125000);
    g.tick(125); // dt seconds; facade reads clock.now() for resolution timestamp
    expect(g.getState().expeditions.active).toBe(null);
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(true);
  });

  it("getState returns the live raw state for autosave (has version, no frozen)", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    const st = g.getState();
    expect(typeof st.version === "number").toBe(true);
    expect(Object.isFrozen(st)).toBe(false);
  });
});
```

> `Game.dispatch` injects `clock.now()` as `intent._nowMs` for `StartExpedition`. `Game.tick(dtSeconds)` calls `applyTick` then resolves expeditions using `clock.now()` (the facade owns the clock; the systems stay clock-free). The expedition test advances the `FakeClock` and ticks; the facade reads `clock.now()` for the resolution timestamp.

- [ ] **Step 2: Register the test in `RunAll.js`.** Ensure `import "./Game.Test.js";` is present.

- [ ] **Step 3: Run it, expect FAIL.** Run:
```
node Tests/RunAll.js Game
```
Expected: failures — `Source/Engine/Game.js` not found, non-zero exit code.

- [ ] **Step 4: Write the minimal Game facade implementation.**
Create `Source/Engine/Game.js`:
```js
import { reduce } from "./Reducer.js";
import { build as buildSnapshot } from "./Snapshot.js";
import { solve } from "./Simulation/RateSolver.js";
import { applyTick } from "./Simulation/Tick.js";
import { applyOffline } from "./Simulation/Offline.js";
import { tryResolve } from "./Systems/ExpeditionSystem.js";
import { deserialize } from "./Persistence/SaveManager.js";

export class Game {
  constructor({ content, clock }) {
    this.content = content;
    this.clock = clock;
    this.state = null;
    this.storage = null;
    this.listeners = new Set();
  }

  _ensureSolved() {
    if (!this.state._solved) {
      this.state._solved = solve(this.state, this.content);
    }
    return this.state._solved;
  }

  bootstrap(storage) {
    this.storage = storage;
    const raw = storage.get("idlekingdom.save");
    this.state = deserialize(raw, this.clock); // NewGame on null/corrupt
    const summary = applyOffline(this.state, this.content, this.clock.now());
    delete this.state._solved;
    this._ensureSolved();
    return summary;
  }

  dispatch(intent) {
    const withTime = (intent && typeof intent === "object")
      ? { ...intent, _nowMs: this.clock.now() }
      : intent;
    const out = reduce(this.state, withTime, this.content);
    if (out.error !== undefined) {
      return { ok: false, error: out.error };
    }
    this.state = out.state;
    this._ensureSolved();
    this._emit();
    return { ok: true };
  }

  tick(dtSeconds) {
    const solved = this._ensureSolved();
    applyTick(this.state, solved, dtSeconds);
    const resolved = tryResolve(this.state, this.content, this.clock.now());
    if (resolved) {
      delete this.state._solved; // reclaim unlocks change rates
      this._ensureSolved();
    }
  }

  getState() {
    return this.state;
  }

  onSnapshot(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const snap = buildSnapshot(this.state, this._ensureSolved(), this.content);
    for (const fn of this.listeners) fn(snap);
  }

  emitSnapshotForFrame() {
    this._emit();
  }
}
```

> `applyTick` (Phase ≤3) advances stockpiles + currencies and the expedition countdown; the facade then calls `ExpeditionSystem.tryResolve` with `clock.now()` for deterministic resolution (the same path `Offline.applyOffline` fast-forwards). `bootstrap` clears the offline-stale `_solved` and re-solves so the first frame's snapshot reflects post-offline state. `dispatch` re-solves on every accept (cheap; `_solved` was deleted by structural intents, kept otherwise so `_ensureSolved` re-uses it).

- [ ] **Step 5: Run it, expect PASS.** Run:
```
node Tests/RunAll.js Game
```
Expected: all `Game facade` cases pass — bootstrap+summary, dispatch ok/reject, snapshot emit + unsubscribe, tick integration without emit, expedition resolution on tick, live `getState`; `0 failed`, exit 0.

- [ ] **Step 6: Commit.**
```
git add Source/Engine/Game.js Tests/Game.Test.js Tests/RunAll.js
git commit -m "feat(engine): add Game facade (bootstrap/dispatch/tick/snapshot) with tests"
```

---

### Task 4.10: Full-suite green + sales-tithe 0.05→0.07 cross-check

**Files**
- Modify: `Tests/Economy.Test.js` (append the tithe-rate transition case)
- Modify: `Tests/RunAll.js` (confirm all Phase-4 imports present)

- [ ] **Step 1: Append the sales-tithe 0.05→0.07 transition test to `Economy.Test.js`.** Add inside the existing `describe("EconomySystem", ...)` block (before its closing `});`):
```js
  it("sales tithe is 0.05, then 0.07 after res_trade_routes (via applyEffects titheRate)", () => {
    // Use the solver-independent sellFromStockpile path to assert tithe arithmetic directly.
    const s = (await import("../Source/Engine/GameState.js")).NewGame(new FakeClock(0));
    const node = s.graph.nodes.find((n) => n.id === "n_smelter_0");
    node.stockpile.iron_bar = 100;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar"); // 100*4=400 gold, 0.05*400=20 research
    expect(s.currencies.research).toBeCloseTo(20, 1e-9);
    // raise tithe to 0.07 and sell again
    s.unlocks.titheRate = 0.07;
    node.stockpile.iron_bar = 100;
    const research0 = s.currencies.research;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar"); // +400 gold, 0.07*400=28 research
    expect(s.currencies.research - research0).toBeCloseTo(28, 1e-9);
  });
```
> The `it` callback must be marked `async` for the dynamic `import`. Change its signature to `it("sales tithe ...", async () => {`. (The Runner supports async `it` per the contract.) Alternatively, hoist `import { NewGame } from "../Source/Engine/GameState.js";` to the top of the file and use `NewGame(new FakeClock(0))` synchronously — prefer the hoisted import to keep the test plain:
```js
// top of Tests/Economy.Test.js, with the other imports:
import { NewGame } from "../Source/Engine/GameState.js";
```
and the case body becomes synchronous:
```js
  it("sales tithe is 0.05, then 0.07 after raising titheRate", () => {
    const s = NewGame(new FakeClock(0));
    const node = s.graph.nodes.find((n) => n.id === "n_smelter_0");
    node.stockpile.iron_bar = 100;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    expect(s.currencies.research).toBeCloseTo(20, 1e-9);
    s.unlocks.titheRate = 0.07;
    node.stockpile.iron_bar = 100;
    const research0 = s.currencies.research;
    sellFromStockpile(s, content, "n_smelter_0", "iron_bar");
    expect(s.currencies.research - research0).toBeCloseTo(28, 1e-9);
  });
```
Note: `FakeClock` and `NewGame` must both be imported at the top of `Economy.Test.js`; `FakeClock` is already imported from Task 4.1, add the `NewGame` import line.

- [ ] **Step 2: Run the full suite, expect PASS.** Run:
```
node Tests/RunAll.js
```
Expected: every Phase-4 suite (`EconomySystem`, `ResearchSystem`, `HeroSystem`, `ProgressionSystem`, `ExpeditionSystem`, `Intents`, `Reducer`, `Snapshot`, `Game facade`) plus all earlier-phase suites pass; final summary `0 failed`, exit code 0. Confirm the BLOCKER #1 case (`res_smithing`/`res_armory` with no territory), the six-row BLOCKER #2/#3 power-curve regression, the value-positivity of all 12 recipes, the exact `15*1.15^level` curve, and the 0.05/0.07 tithe all appear in the passing output.

- [ ] **Step 3: Confirm `RunAll.js` import list is complete.** Open `Tests/RunAll.js` and verify the static import block includes, in some order:
```js
import "./Economy.Test.js";
import "./ResearchSystem.Test.js";
import "./HeroSystem.Test.js";
import "./Progression.Test.js";
import "./ExpeditionSystem.Test.js";
import "./Intents.Test.js";
import "./Reducer.Test.js";
import "./Snapshot.Test.js";
import "./Game.Test.js";
```
plus any earlier-phase test imports. No duplicates.

- [ ] **Step 4: Commit.**
```
git add Tests/Economy.Test.js Tests/RunAll.js
git commit -m "test(engine): cross-check sales tithe 0.05->0.07; confirm Phase-4 suite green"
```

---

Only the spec is committed; no source code exists yet. This means Phase 5's plan must reference the engine interfaces from the contract (Game facade, Snapshot, Clock, SaveManager, etc.) as the things it builds upon, but cannot assume implementation details beyond the contract. The plan I write for Phase 5 builds UI files and Main.js, plus small pure-unit tests for the render helpers.

I have everything I need. The contract and spec are clear. Let me write the complete Phase 5 plan.

Now I'll produce the complete Phase 5 markdown plan section.

## Phase 5: UI Core — Shell, Render Helpers, HUD & Graph Canvas

**Phase goal:** Stand up the thin DOM/SVG UI layer over the already-headless engine (Phases 1–4) so a real browser shows the seeded Miner→Smelter→Market chain, ticks the counters at 2.0 gold/s + 0.10 research/s, and lets the player drag nodes, connect ports (mouse drag on desktop, tap-port-then-port on mobile), and pan/zoom — all driven by frozen snapshots and dispatched intents per §9.4. Since all game rules live in the tested engine, UI logic is kept to two genuinely-pure helper families — `Dom` (h() + keyed patch) and `Svg` (element builders + screen↔graph viewBox math) — plus a tiny number formatter; those get small zero-dep unit tests under `node Tests/RunAll.js`, while the screen wiring (App/Hud/GraphView/GraphInput/Router) and the `Main.js` 20 Hz RAF loop + autosave (§9.5) are verified by explicit manual browser steps served over `python3 -m http.server`. The engine, `Game`, `Snapshot`, `Clock`, and `SaveManager` from the interface contract are consumed verbatim; nothing in the engine is touched.

---

### Task 5.1: Number formatting helper (`Format.js`) + tests

UI counters need compact, deterministic strings ("1.2K", "3.4M", "25", "2.0/s") derived from raw snapshot floats. This is the one piece of pure presentation logic, so it gets a real unit test. It lives under `UI/Render/` next to the other pure helpers.

Files:
- Create: `Source/UI/Render/Format.js`
- Test: `Tests/Format.Test.js`
- Modify: `Tests/RunAll.js`

Steps:

- [ ] **Step 1: Write the failing test.** Create `Tests/Format.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import { formatNumber, formatRate } from "../Source/UI/Render/Format.js";

describe("Format.formatNumber", () => {
  it("renders small integers exactly", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(25)).toBe("25");
    expect(formatNumber(999)).toBe("999");
  });
  it("shows one decimal for small non-integers", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(0.1)).toBe("0.1");
  });
  it("uses K above one thousand", () => {
    expect(formatNumber(1000)).toBe("1.0K");
    expect(formatNumber(1234)).toBe("1.2K");
    expect(formatNumber(57600)).toBe("57.6K");
  });
  it("uses M above one million", () => {
    expect(formatNumber(1000000)).toBe("1.0M");
    expect(formatNumber(144000)).toBe("144.0K");
    expect(formatNumber(2500000)).toBe("2.5M");
  });
  it("uses B above one billion", () => {
    expect(formatNumber(3500000000)).toBe("3.5B");
  });
  it("clamps tiny negatives and NaN to 0", () => {
    expect(formatNumber(-0.0001)).toBe("0");
    expect(formatNumber(NaN)).toBe("0");
  });
});

describe("Format.formatRate", () => {
  it("suffixes /s and keeps one decimal under 1000", () => {
    expect(formatRate(2)).toBe("2.0/s");
    expect(formatRate(0.1)).toBe("0.1/s");
    expect(formatRate(0)).toBe("0/s");
  });
  it("compacts large rates with K/M", () => {
    expect(formatRate(1500)).toBe("1.5K/s");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `node Tests/RunAll.js Format`. Expected: failure because `Source/UI/Render/Format.js` does not exist — output contains `Cannot find module` / an `Error` line and a non-zero summary like `# fail 1` (the suite import throws). This confirms the test is wired and red.

- [ ] **Step 3: Write the minimal implementation.** Create `Source/UI/Render/Format.js`:

```js
const UNITS = [
  { v: 1e9, s: "B" },
  { v: 1e6, s: "M" },
  { v: 1e3, s: "K" },
];

export function formatNumber(n) {
  if (!Number.isFinite(n) || n < 1e-3) return "0";
  for (const u of UNITS) {
    if (n >= u.v) return (n / u.v).toFixed(1) + u.s;
  }
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

export function formatRate(n) {
  if (!Number.isFinite(n) || n < 1e-3) return "0/s";
  for (const u of UNITS) {
    if (n >= u.v) return (n / u.v).toFixed(1) + u.s + "/s";
  }
  return n.toFixed(1) + "/s";
}
```

- [ ] **Step 4: Register the suite in RunAll.** In `Tests/RunAll.js`, add to the static import list (alphabetical, alongside the other `import "./*.Test.js"` lines):

```js
import "./Format.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run `node Tests/RunAll.js Format`. Expected: all `formatNumber` / `formatRate` cases pass — summary shows `# pass <N>` with `# fail 0` and exit code 0.

- [ ] **Step 6: Commit.**

```
git add Source/UI/Render/Format.js Tests/Format.Test.js Tests/RunAll.js
git commit -m "feat(ui): number/rate formatting helper with unit tests"
```

---

### Task 5.2: DOM helpers — `h()` + keyed patch (`Dom.js`) + tests

The screens need a tiny no-framework virtual-node + keyed-diff so re-rendering on every snapshot is cheap and preserves focus/identity on keyed lists. `h()` builds plain descriptor objects; `patch()` reconciles a real parent against a new child descriptor list, reusing keyed elements. This is pure DOM-shape logic but `patch` touches DOM — so the test exercises the **pure descriptor builder and the keyed-reconciliation algorithm against a minimal fake element** (no jsdom), keeping it node-runnable.

Files:
- Create: `Source/UI/Render/Dom.js`
- Test: `Tests/Dom.Test.js`
- Modify: `Tests/RunAll.js`

Steps:

- [ ] **Step 1: Write the failing test.** Create `Tests/Dom.Test.js`. It builds a fake DOM element implementing only the surface `patch` uses, so it runs under plain node:

```js
import { describe, it, expect } from "./Runner.js";
import { h, patch } from "../Source/UI/Render/Dom.js";

// Minimal fake element: enough surface for Dom.patch under node (no jsdom).
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this._listeners = {};
    this.parentNode = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === "data-key") this.dataset.key = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, fn) { this._listeners[t] = fn; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
}
const fakeDoc = { createElement: (t) => new FakeEl(t), createTextNode: (t) => { const e = new FakeEl("#text"); e.textContent = String(t); return e; } };

describe("Dom.h", () => {
  it("builds a descriptor with tag, props, children", () => {
    const node = h("div", { class: "card", key: "n_miner_0" }, ["hello"]);
    expect(node.tag).toBe("div");
    expect(node.props.class).toBe("card");
    expect(node.key).toBe("n_miner_0");
    expect(node.children[0]).toBe("hello");
  });
  it("flattens nested child arrays and drops null/false", () => {
    const node = h("ul", {}, [h("li", {}, ["a"]), null, false, [h("li", {}, ["b"])]]);
    expect(node.children.length).toBe(2);
    expect(node.children[0].tag).toBe("li");
    expect(node.children[1].tag).toBe("li");
  });
});

describe("Dom.patch keyed reconciliation", () => {
  it("creates children on first patch", () => {
    const root = new FakeEl("div");
    patch(root, [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])], fakeDoc);
    expect(root.children.length).toBe(2);
    expect(root.children[0].dataset.key).toBe("a");
    expect(root.children[1].dataset.key).toBe("b");
  });
  it("reuses keyed elements across re-render (same instance)", () => {
    const root = new FakeEl("div");
    patch(root, [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])], fakeDoc);
    const firstA = root.children[0];
    patch(root, [h("span", { key: "b" }, ["B2"]), h("span", { key: "a" }, ["A2"])], fakeDoc);
    expect(root.children.length).toBe(2);
    // 'a' element instance preserved, just reordered + text updated
    const aNow = root.children.find((c) => c.dataset.key === "a");
    expect(aNow).toBe(firstA);
  });
  it("removes children dropped from the new list", () => {
    const root = new FakeEl("div");
    patch(root, [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])], fakeDoc);
    patch(root, [h("span", { key: "a" }, ["A"])], fakeDoc);
    expect(root.children.length).toBe(1);
    expect(root.children[0].dataset.key).toBe("a");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `node Tests/RunAll.js Dom`. Expected: failure — `Cannot find module .../Source/UI/Render/Dom.js`, summary `# fail` non-zero, exit code non-zero.

- [ ] **Step 3: Write the minimal implementation.** Create `Source/UI/Render/Dom.js`. `doc` is injected (defaults to global `document` in the browser) so the keyed-diff is testable headless:

```js
const flat = (children) => {
  const out = [];
  const push = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach(push); return; }
    out.push(c);
  };
  (Array.isArray(children) ? children : [children]).forEach(push);
  return out;
};

export function h(tag, props = {}, children = []) {
  const key = props.key != null ? String(props.key) : null;
  return { tag, props, key, children: flat(children) };
}

const isText = (c) => typeof c === "string" || typeof c === "number";

function create(vnode, doc) {
  if (isText(vnode)) return doc.createTextNode(String(vnode));
  const el = doc.createElement(vnode.tag);
  applyProps(el, {}, vnode.props);
  patch(el, vnode.children, doc);
  return el;
}

function applyProps(el, oldProps, newProps) {
  for (const k in oldProps) {
    if (!(k in newProps)) {
      if (k.startsWith("on")) el[k.toLowerCase()] = null;
      else el.removeAttribute(k === "key" ? "data-key" : k);
    }
  }
  for (const k in newProps) {
    const v = newProps[k];
    if (k === "key") { el.setAttribute("data-key", v); continue; }
    if (k.startsWith("on") && typeof v === "function") { el[k.toLowerCase()] = v; continue; }
    if (k === "text") { el.textContent = String(v); continue; }
    if (v === false || v == null) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}

export function patch(parent, newChildrenRaw, doc = document) {
  const newChildren = flat(newChildrenRaw);
  const existing = Array.from(parent.children);
  const byKey = new Map();
  for (const el of existing) if (el.dataset && el.dataset.key != null) byKey.set(el.dataset.key, el);

  let cursor = 0;
  for (const vnode of newChildren) {
    let el;
    if (!isText(vnode) && vnode.key != null && byKey.has(vnode.key)) {
      el = byKey.get(vnode.key);
      byKey.delete(vnode.key);
      const oldProps = el.__props || {};
      applyProps(el, oldProps, vnode.props);
      el.__props = vnode.props;
      patch(el, vnode.children, doc);
    } else {
      el = create(vnode, doc);
      if (!isText(vnode)) el.__props = vnode.props;
    }
    const ref = parent.children[cursor] || null;
    if (ref !== el) parent.insertBefore(el, ref);
    cursor++;
  }
  // remove anything not consumed
  while (parent.children.length > cursor) {
    parent.removeChild(parent.children[parent.children.length - 1]);
  }
}
```

- [ ] **Step 4: Register the suite.** In `Tests/RunAll.js` add:

```js
import "./Dom.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run `node Tests/RunAll.js Dom`. Expected: all `Dom.h` and `Dom.patch keyed reconciliation` cases pass — `# fail 0`, exit code 0.

- [ ] **Step 6: Commit.**

```
git add Source/UI/Render/Dom.js Tests/Dom.Test.js Tests/RunAll.js
git commit -m "feat(ui): h() + keyed-diff DOM helper with headless reconciliation tests"
```

---

### Task 5.3: SVG builders + screen↔graph coordinate math (`Svg.js`) + tests

`GraphView` draws nodes/links as SVG and must convert between screen pixels (pointer events) and graph coordinates (node `pos`) through a pan/zoom viewBox. The transform math is pure and load-bearing for drag/connect accuracy, so it gets unit tests; the element builders are thin wrappers.

Files:
- Create: `Source/UI/Render/Svg.js`
- Test: `Tests/Svg.Test.js`
- Modify: `Tests/RunAll.js`

Steps:

- [ ] **Step 1: Write the failing test.** Create `Tests/Svg.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import { makeView, screenToGraph, graphToScreen, clampScale, panBy, zoomAt } from "../Source/UI/Render/Svg.js";

describe("Svg.makeView", () => {
  it("starts at identity-ish view (scale 1, no offset)", () => {
    const v = makeView();
    expect(v.scale).toBe(1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });
});

describe("Svg coordinate transforms", () => {
  it("screenToGraph inverts graphToScreen", () => {
    const v = { scale: 2, tx: 50, ty: 30 };
    const g = { x: 120, y: 200 };
    const s = graphToScreen(v, g.x, g.y);
    const back = screenToGraph(v, s.x, s.y);
    expect(back.x).toBeCloseTo(120, 1e-9);
    expect(back.y).toBeCloseTo(200, 1e-9);
  });
  it("graphToScreen applies scale then translate", () => {
    const v = { scale: 2, tx: 50, ty: 30 };
    const s = graphToScreen(v, 10, 10);
    expect(s.x).toBeCloseTo(70, 1e-9); // 10*2 + 50
    expect(s.y).toBeCloseTo(50, 1e-9); // 10*2 + 30
  });
});

describe("Svg.clampScale", () => {
  it("clamps to [0.25, 4]", () => {
    expect(clampScale(0.1)).toBeCloseTo(0.25, 1e-9);
    expect(clampScale(10)).toBeCloseTo(4, 1e-9);
    expect(clampScale(1.5)).toBeCloseTo(1.5, 1e-9);
  });
});

describe("Svg.panBy", () => {
  it("adds pixel delta to translation", () => {
    const v = panBy({ scale: 1, tx: 0, ty: 0 }, 15, -5);
    expect(v.tx).toBeCloseTo(15, 1e-9);
    expect(v.ty).toBeCloseTo(-5, 1e-9);
  });
});

describe("Svg.zoomAt", () => {
  it("keeps the screen-anchor point fixed under the cursor", () => {
    const v0 = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 200, y: 100 };
    const before = screenToGraph(v0, anchor.x, anchor.y);
    const v1 = zoomAt(v0, anchor.x, anchor.y, 2); // 2x zoom factor
    const after = screenToGraph(v1, anchor.x, anchor.y);
    // graph point under the cursor is unchanged by zoom
    expect(after.x).toBeCloseTo(before.x, 1e-9);
    expect(after.y).toBeCloseTo(before.y, 1e-9);
    expect(v1.scale).toBeCloseTo(2, 1e-9);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `node Tests/RunAll.js Svg`. Expected: failure — `Cannot find module .../Source/UI/Render/Svg.js`, non-zero summary/exit.

- [ ] **Step 3: Write the minimal implementation.** Create `Source/UI/Render/Svg.js`. Element builders use the injected `doc` (defaults to global `document`); the transform math is dependency-free:

```js
const SVG_NS = "http://www.w3.org/2000/svg";
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;

export function svg(tag, props = {}, children = [], doc = document) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el[k.toLowerCase()] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  }
  return el;
}

// View transform: graph point -> screen = graph*scale + translate.
export function makeView() {
  return { scale: 1, tx: 0, ty: 0 };
}

export function clampScale(s) {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
}

export function graphToScreen(v, gx, gy) {
  return { x: gx * v.scale + v.tx, y: gy * v.scale + v.ty };
}

export function screenToGraph(v, sx, sy) {
  return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
}

export function panBy(v, dxPx, dyPx) {
  return { scale: v.scale, tx: v.tx + dxPx, ty: v.ty + dyPx };
}

// Zoom by `factor` while keeping the graph point under (anchorX, anchorY) fixed on screen.
export function zoomAt(v, anchorX, anchorY, factor) {
  const newScale = clampScale(v.scale * factor);
  const g = screenToGraph(v, anchorX, anchorY);
  return { scale: newScale, tx: anchorX - g.x * newScale, ty: anchorY - g.y * newScale };
}

// Build a "M x1 y1 C ..." cubic path connecting two graph-space points (left->right flow curve).
export function linkPath(from, to) {
  const dx = Math.max(40, (to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}
```

- [ ] **Step 4: Register the suite.** In `Tests/RunAll.js` add:

```js
import "./Svg.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run `node Tests/RunAll.js Svg`. Expected: all transform/clamp/pan/zoom cases pass — `# fail 0`, exit code 0. Re-run the full suite `node Tests/RunAll.js` and expect all prior phases plus `Format`/`Dom`/`Svg` green.

- [ ] **Step 6: Commit.**

```
git add Source/UI/Render/Svg.js Tests/Svg.Test.js Tests/RunAll.js
git commit -m "feat(ui): SVG builders + screen<->graph viewBox transform math with tests"
```

---

### Task 5.4: Styles — Reset, Theme tokens, Layout, Graph

The four CSS files give the flat-fantasy parchment/iron/gold look, the mobile-first responsive shell, and the ≥44px touch targets the spec requires (§8). No tests — these are verified visually in Task 5.11. Authored together since the screens reference their class names.

Files:
- Create: `Source/Styles/Reset.css`
- Create: `Source/Styles/Theme.css`
- Create: `Source/Styles/Layout.css`
- Create: `Source/Styles/Graph.css`

Steps:

- [ ] **Step 1: Write `Reset.css`.** Create `Source/Styles/Reset.css`:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
button:disabled { cursor: not-allowed; }
ul, ol { list-style: none; }
svg { display: block; }
input, select { font: inherit; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
```

- [ ] **Step 2: Write `Theme.css`.** Create `Source/Styles/Theme.css`:

```css
:root {
  --parchment: #f4e8cf;
  --parchment-dk: #e6d4ab;
  --ink: #2b211a;
  --ink-soft: #5a4a39;
  --iron: #3a3f44;
  --iron-lt: #565d63;
  --gold: #c9a227;
  --gold-lt: #e3c354;
  --good: #4a7c44;
  --bad: #9c3b2e;
  --line: #b8a173;
  --panel: #fbf3df;
  --shadow: 0 2px 6px rgba(43, 33, 26, 0.25);
  --radius: 8px;
  --tap: 44px;
  --font: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
}
body {
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--font);
}
.muted { color: var(--ink-soft); }
.good { color: var(--good); }
.bad { color: var(--bad); }
```

- [ ] **Step 3: Write `Layout.css`.** Create `Source/Styles/Layout.css`:

```css
#App { display: flex; flex-direction: column; height: 100%; }

/* HUD */
.hud {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--iron); color: var(--parchment);
  box-shadow: var(--shadow); flex-wrap: wrap;
}
.hud-currencies { display: flex; gap: 1rem; flex: 1; min-width: 0; }
.hud-cur { display: flex; flex-direction: column; line-height: 1.1; }
.hud-cur .val { font-weight: 700; }
.hud-cur .rate { font-size: 0.75rem; color: var(--gold-lt); }
.hud-tabs { display: flex; gap: 0.25rem; }
.hud-tabs a {
  min-height: var(--tap); min-width: var(--tap);
  display: flex; align-items: center; justify-content: center;
  padding: 0 0.75rem; color: var(--parchment-dk);
  text-decoration: none; border-radius: var(--radius);
}
.hud-tabs a.active { background: var(--gold); color: var(--ink); }
.hud-save { font-size: 0.75rem; }
.hud-save.failed { color: var(--bad); }
.hud-error {
  position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
  background: var(--bad); color: #fff; padding: 0.5rem 1rem;
  border-radius: var(--radius); box-shadow: var(--shadow); z-index: 50;
}

/* Screen host */
.screen { flex: 1; position: relative; overflow: hidden; }

/* Panels (Inspector / BuildMenu host slots used by later phases) */
.panel {
  position: absolute; background: var(--panel);
  border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 0.75rem;
}

/* Mobile-first: tabs become a bottom bar on narrow screens */
@media (max-width: 640px) {
  .hud { flex-direction: column; align-items: stretch; }
  .hud-tabs { order: 3; justify-content: space-around; width: 100%; }
}
```

- [ ] **Step 4: Write `Graph.css`.** Create `Source/Styles/Graph.css`:

```css
.graph-svg {
  width: 100%; height: 100%;
  background:
    repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(184,161,115,0.25) 40px),
    repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(184,161,115,0.25) 40px),
    var(--parchment);
  touch-action: none; /* we own pan/pinch */
  cursor: grab;
}
.graph-svg.panning { cursor: grabbing; }

.node-card { cursor: move; }
.node-card .node-box {
  fill: var(--panel); stroke: var(--iron); stroke-width: 2; rx: 8;
}
.node-card.selected .node-box { stroke: var(--gold); stroke-width: 3; }
.node-card .node-label { fill: var(--ink); font-size: 13px; font-weight: 700; }
.node-card .node-sub { fill: var(--ink-soft); font-size: 11px; }

/* capacity bar */
.cap-bg { fill: var(--parchment-dk); }
.cap-fill { fill: var(--good); }

/* ports — >=44px hit area via transparent halo */
.port { fill: var(--iron); stroke: var(--parchment); stroke-width: 2; }
.port-hit { fill: transparent; }              /* r >= 22 so the tap target is >=44px */
.port.armed { fill: var(--gold); }            /* tap-port-then-port: first port chosen */

.link-path { fill: none; stroke: var(--iron-lt); stroke-width: 3; }
.link-path.starved { stroke: var(--bad); stroke-dasharray: 6 4; }
.link-label { fill: var(--ink-soft); font-size: 10px; }
.link-pending { fill: none; stroke: var(--gold); stroke-width: 3; stroke-dasharray: 5 4; }
```

- [ ] **Step 5: Commit.**

```
git add Source/Styles/Reset.css Source/Styles/Theme.css Source/Styles/Layout.css Source/Styles/Graph.css
git commit -m "feat(ui): parchment/iron/gold theme, responsive layout, graph styling with >=44px tap targets"
```

---

### Task 5.5: Hash router (`Router.js`)

A dependency-free `hashchange` router that maps `#/factory`, `#/research`, `#/expeditions`, `#/heroes` to a current-screen string and notifies a listener. App owns the screen swap; the router is pure routing.

Files:
- Create: `Source/UI/Router.js`

Steps:

- [ ] **Step 1: Write the implementation.** Create `Source/UI/Router.js`. `win` is injected so it stays decoupled (browser passes nothing → defaults to `window`):

```js
export const ROUTES = ["factory", "research", "expeditions", "heroes"];
export const DEFAULT_ROUTE = "factory";

export function parseHash(hash) {
  const m = String(hash || "").replace(/^#\/?/, "").split("/")[0];
  return ROUTES.includes(m) ? m : DEFAULT_ROUTE;
}

export class Router {
  constructor(win = window) {
    this.win = win;
    this._listeners = [];
    this.current = parseHash(win.location.hash);
    this._onHash = () => {
      const next = parseHash(this.win.location.hash);
      if (next !== this.current) { this.current = next; this._emit(); }
    };
  }
  start() {
    this.win.addEventListener("hashchange", this._onHash);
    if (!this.win.location.hash) this.navigate(DEFAULT_ROUTE);
    else this._emit();
    return this;
  }
  navigate(route) {
    if (!ROUTES.includes(route)) route = DEFAULT_ROUTE;
    this.win.location.hash = "#/" + route;
  }
  onChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter((f) => f !== fn); }; }
  _emit() { for (const fn of this._listeners) fn(this.current); }
}
```

- [ ] **Step 2: Manual sanity (no automated test).** This is verified end-to-end in Task 5.11 (clicking tabs changes the URL hash and the active screen). No node test — the router only wraps `window.location` + `hashchange`, which carries no game logic.

- [ ] **Step 3: Commit.**

```
git add Source/UI/Router.js
git commit -m "feat(ui): dependency-free hashchange router (#/factory #/research #/expeditions #/heroes)"
```

---

### Task 5.6: HUD (`Hud.js`)

Top bar: Gold / Research / Renown counters with live `/s` rates from the snapshot, a save-status indicator, and the screen tabs. Renders from `snapshot.currencyStrings` + `snapshot.rates` + `snapshot.save` per the contract §13; pure render-from-snapshot, dispatches no engine intents (tab clicks go to the router).

Files:
- Create: `Source/UI/Hud.js`

Steps:

- [ ] **Step 1: Write the implementation.** Create `Source/UI/Hud.js`. It uses `h`/`patch` from `Dom.js` and `formatNumber`/`formatRate` as a fallback if `currencyStrings` is absent:

```js
import { h, patch } from "./Render/Dom.js";
import { formatNumber, formatRate } from "./Render/Format.js";

const TABS = [
  { route: "factory", label: "⚒ Factory" },
  { route: "research", label: "📜 Research" },
  { route: "expeditions", label: "🛡 Expeditions" },
  { route: "heroes", label: "⚔ Heroes" },
];

function currencyCell(key, icon, value, rate) {
  return h("div", { class: "hud-cur", key }, [
    h("span", { class: "val" }, [`${icon} ${value}`]),
    h("span", { class: "rate" }, [rate]),
  ]);
}

export class Hud {
  constructor(el, router) { this.el = el; this.router = router; }

  render(snap) {
    const cs = snap.currencyStrings || {};
    const goldV = cs.gold ?? formatNumber(snap.currencies.gold);
    const resV = cs.research ?? formatNumber(snap.currencies.research);
    const renV = cs.renown ?? formatNumber(snap.currencies.renown);
    const goldR = cs.goldRate ?? formatRate(snap.rates.goldRate);
    const resR = cs.researchRate ?? formatRate(snap.rates.researchRate);

    const saveOk = snap.save && snap.save.status === "ok";
    const tabs = h(
      "nav",
      { class: "hud-tabs" },
      TABS.map((t) =>
        h(
          "a",
          {
            key: t.route,
            href: "#/" + t.route,
            class: this.router.current === t.route ? "active" : "",
          },
          [t.label]
        )
      )
    );

    patch(this.el, [
      h("div", { class: "hud-currencies", key: "cur" }, [
        currencyCell("gold", "🪙", goldV, goldR),
        currencyCell("research", "📜", resV, resR),
        currencyCell("renown", "🛡️", renV, "—"),
      ]),
      h("div", { class: saveOk ? "hud-save" : "hud-save failed", key: "save" }, [
        saveOk ? "💾 saved" : "⚠ save failed",
      ]),
      tabs,
    ]);
  }
}
```

- [ ] **Step 2: Manual sanity (deferred).** Verified visually in Task 5.11 (counters render, gold ticks up). No node test — pure snapshot projection.

- [ ] **Step 3: Commit.**

```
git add Source/UI/Hud.js
git commit -m "feat(ui): HUD top bar — currency counters, /s rates, save indicator, screen tabs"
```

---

### Task 5.7: Graph input gesture normalizer (`GraphInput.js`)

A single pointer-event layer that unifies mouse / touch / pen into the gestures `GraphView` consumes: node **drag**, canvas **pan**, two-finger **pinch**-zoom, scroll-wheel zoom, and **tap-port** (the mobile connect path). It is a thin event translator that emits callbacks with graph-space coordinates via the injected view + `screenToGraph`; it holds no game state.

Files:
- Create: `Source/UI/GraphInput.js`

Steps:

- [ ] **Step 1: Write the implementation.** Create `Source/UI/GraphInput.js`:

```js
import { screenToGraph, panBy, zoomAt } from "./Render/Svg.js";

const TAP_MOVE_PX = 6; // movement under this between down/up is a tap, not a drag

export class GraphInput {
  /**
   * @param {SVGElement} el  the graph <svg>
   * @param {{getView, setView, hitPort, hitNode, onNodeDrag, onConnect, onTapPort, onSelect, onViewChange}} cb
   *   getView() -> {scale,tx,ty}; setView(v); hitPort(gx,gy)->{nodeId,dir}|null; hitNode(gx,gy)->nodeId|null
   *   onNodeDrag(nodeId, gx, gy); onConnect(fromNodeId, toNodeId); onTapPort(nodeId, dir); onSelect(nodeId|null); onViewChange()
   */
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.pointers = new Map(); // pointerId -> {x,y}
    this.mode = null;          // 'pan' | 'dragNode' | 'connect'
    this.dragNodeId = null;
    this.connectFrom = null;   // {nodeId, gx, gy} during a mouse drag-connect
    this.startScreen = null;
    this.pinchDist = 0;
    this._bind();
  }

  _toGraph(ev) {
    const r = this.el.getBoundingClientRect();
    return screenToGraph(this.cb.getView(), ev.clientX - r.left, ev.clientY - r.top);
  }

  _bind() {
    this.el.addEventListener("pointerdown", (e) => this._down(e));
    this.el.addEventListener("pointermove", (e) => this._move(e));
    this.el.addEventListener("pointerup", (e) => this._up(e));
    this.el.addEventListener("pointercancel", (e) => this._up(e));
    this.el.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
  }

  _down(e) {
    this.el.setPointerCapture && this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.startScreen = { x: e.clientX, y: e.clientY };

    if (this.pointers.size === 2) { // pinch start
      this.mode = "pinch";
      const pts = [...this.pointers.values()];
      this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return;
    }

    const g = this._toGraph(e);
    const port = this.cb.hitPort(g.x, g.y);
    if (port) {
      // mouse: begin a drag-connect; touch: armed for tap-port-then-port (resolved on up)
      this.mode = "connect";
      this.connectFrom = { nodeId: port.nodeId, dir: port.dir, gx: g.x, gy: g.y };
      this.cb.onTapPort(port.nodeId, port.dir); // arm/visual
      return;
    }
    const nodeId = this.cb.hitNode(g.x, g.y);
    if (nodeId) { this.mode = "dragNode"; this.dragNodeId = nodeId; this.cb.onSelect(nodeId); return; }

    this.mode = "pan"; this.cb.onSelect(null); this.el.classList.add("panning");
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.mode === "pinch" && this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = this.el.getBoundingClientRect();
      const cx = (pts[0].x + pts[1].x) / 2 - r.left;
      const cy = (pts[0].y + pts[1].y) / 2 - r.top;
      const factor = this.pinchDist > 0 ? dist / this.pinchDist : 1;
      this.cb.setView(zoomAt(this.cb.getView(), cx, cy, factor));
      this.pinchDist = dist; this.cb.onViewChange();
      return;
    }
    if (this.mode === "dragNode") {
      const g = this._toGraph(e); this.cb.onNodeDrag(this.dragNodeId, g.x, g.y); return;
    }
    if (this.mode === "pan") {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this.cb.setView(panBy(this.cb.getView(), dx, dy)); this.cb.onViewChange(); return;
    }
    // 'connect' move: GraphView draws the pending link by reading getView + last pointer (it polls onViewChange)
    if (this.mode === "connect") { this.cb.onViewChange(); }
  }

  _up(e) {
    const wasMode = this.mode;
    const start = this.startScreen;
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
    this.pointers.delete(e.pointerId);

    if (wasMode === "connect") {
      const g = this._toGraph(e);
      const target = this.cb.hitPort(g.x, g.y);
      if (moved > TAP_MOVE_PX && target && target.nodeId !== this.connectFrom.nodeId) {
        // mouse drag-connect: from output -> to input
        this.cb.onConnect(this.connectFrom.nodeId, target.nodeId);
        this.cb.onTapPort(null, null); // clear arm
      } else if (moved <= TAP_MOVE_PX) {
        // touch tap-port: leave armed; second tap-port (next _down→_up tap) completes via onTapPort sequence in GraphView
        // GraphView resolves the second armed port into onConnect.
      }
    }
    if (this.pointers.size < 2 && this.mode === "pinch") this.mode = this.pointers.size === 1 ? "pan" : null;
    if (this.pointers.size === 0) { this.mode = null; this.dragNodeId = null; this.connectFrom = null; this.el.classList.remove("panning"); }
  }

  _wheel(e) {
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.cb.setView(zoomAt(this.cb.getView(), e.clientX - r.left, e.clientY - r.top, factor));
    this.cb.onViewChange();
  }
}
```

- [ ] **Step 2: Manual sanity (deferred).** Gesture behavior is verified in Task 5.11 (drag a node, connect via mouse drag, scroll-zoom, mobile pan/pinch/tap-connect). No node test — `GraphInput` only translates `PointerEvent`s, which require a real browser; its math dependency (`screenToGraph`/`zoomAt`/`panBy`) is already covered in Task 5.3.

- [ ] **Step 3: Commit.**

```
git add Source/UI/GraphInput.js
git commit -m "feat(ui): pointer-event normalizer (mouse drag-connect, scroll/pinch zoom, pan, tap-port)"
```

---

### Task 5.8: Graph canvas (`GraphView.js`)

The core SVG factory canvas: renders nodes and links from the snapshot, draws per-node capacity bars and per-link flow, owns the pan/zoom `view`, wires `GraphInput` callbacks, dispatches `ConnectLink` on a completed connect (and tracks tap-port-then-port for touch), and reports selection back to `App` for the inspector (Phase 6). It reads `snapshot.nodes` / `snapshot.links` per contract §13.

Files:
- Create: `Source/UI/GraphView.js`

Steps:

- [ ] **Step 1: Write the implementation.** Create `Source/UI/GraphView.js`:

```js
import { svg, makeView, graphToScreen, screenToGraph, linkPath } from "./Render/Svg.js";
import { GraphInput } from "./GraphInput.js";
import { INTENT } from "../Engine/Intents.js";

const NODE_W = 120, NODE_H = 64, PORT_R = 8, HIT_R = 22;

const KIND_ICON = { gatherer: "⛏️", smelter: "🔥", workshop: "🔨", market: "🏪", scholar: "📜" };

export class GraphView {
  constructor(host, game, opts = {}) {
    this.host = host;
    this.game = game;
    this.view = makeView();
    this.selectedId = null;
    this.armedPort = null;      // {nodeId, dir} for touch tap-port-then-port
    this.snap = null;
    this.onSelect = opts.onSelect || (() => {});

    this.svgEl = svg("svg", { class: "graph-svg" });
    this.layerLinks = svg("g", {});
    this.layerNodes = svg("g", {});
    this.svgEl.appendChild(this.layerLinks);
    this.svgEl.appendChild(this.layerNodes);
    this.host.appendChild(this.svgEl);

    this.input = new GraphInput(this.svgEl, {
      getView: () => this.view,
      setView: (v) => { this.view = v; },
      hitPort: (gx, gy) => this._hitPort(gx, gy),
      hitNode: (gx, gy) => this._hitNode(gx, gy),
      onNodeDrag: (id, gx, gy) => this._dragNode(id, gx, gy),
      onConnect: (from, to) => this._connect(from, to),
      onTapPort: (nodeId, dir) => this._tapPort(nodeId, dir),
      onSelect: (id) => this._select(id),
      onViewChange: () => this._draw(),
    });
  }

  render(snap) { this.snap = snap; this._draw(); }

  _nodeAt(id) { return this.snap.nodes.find((n) => n.id === id); }
  _outPort(n) { return { x: n.pos.x + NODE_W, y: n.pos.y + NODE_H / 2 }; }
  _inPort(n) { return { x: n.pos.x, y: n.pos.y + NODE_H / 2 }; }

  _hitPort(gx, gy) {
    if (!this.snap) return null;
    for (const n of this.snap.nodes) {
      const o = this._outPort(n);
      if (Math.hypot(gx - o.x, gy - o.y) <= HIT_R) return { nodeId: n.id, dir: "out" };
      const i = this._inPort(n);
      if (Math.hypot(gx - i.x, gy - i.y) <= HIT_R) return { nodeId: n.id, dir: "in" };
    }
    return null;
  }
  _hitNode(gx, gy) {
    if (!this.snap) return null;
    for (const n of this.snap.nodes) {
      if (gx >= n.pos.x && gx <= n.pos.x + NODE_W && gy >= n.pos.y && gy <= n.pos.y + NODE_H) return n.id;
    }
    return null;
  }

  _dragNode(id, gx, gy) {
    const n = this._nodeAt(id);
    if (n) { n.pos = { x: gx - NODE_W / 2, y: gy - NODE_H / 2 }; this._draw(); }
    // Note: drag is view-only nudge in MVP; persistent pos moves are a SetNodePos intent (Phase 6). Redraw keeps it live.
  }

  _connect(fromId, toId) {
    const from = this._nodeAt(fromId), to = this._nodeAt(toId);
    if (!from || !to) return;
    const resourceId = this._inferResource(from);
    if (!resourceId) return;
    this.game.dispatch({ type: INTENT.ConnectLink, from: fromId, to: toId, resourceId });
    this.armedPort = null;
  }

  // touch: first tap-out arms; second tap-in completes
  _tapPort(nodeId, dir) {
    if (nodeId == null) { this.armedPort = null; this._draw(); return; }
    if (!this.armedPort && dir === "out") { this.armedPort = { nodeId, dir }; this._draw(); return; }
    if (this.armedPort && dir === "in" && nodeId !== this.armedPort.nodeId) {
      this._connect(this.armedPort.nodeId, nodeId);
      this.armedPort = null; this._draw();
    }
  }

  _inferResource(fromNode) {
    if (fromNode.resourceId) return fromNode.resourceId;      // gatherer
    if (fromNode.recipeId && this.snap.recipeOutputs) return this.snap.recipeOutputs[fromNode.recipeId];
    // fall back to the node's primary surplus/stockpile key
    const keys = Object.keys(fromNode.surplus || fromNode.stockpile || {});
    return keys[0] || null;
  }

  _select(id) { this.selectedId = id; this.onSelect(id); this._draw(); }

  _draw() {
    if (!this.snap) return;
    const v = this.view;
    // links
    const linkEls = this.snap.links.map((l) => {
      const from = this._nodeAt(l.from), to = this._nodeAt(l.to);
      if (!from || !to) return null;
      const a = graphToScreen(v, this._outPort(from).x, this._outPort(from).y);
      const b = graphToScreen(v, this._inPort(to).x, this._inPort(to).y);
      const starved = l.fedPct != null && l.fedPct < 0.999;
      const g = svg("g", {});
      g.appendChild(svg("path", { class: starved ? "link-path starved" : "link-path", d: linkPath(a, b) }));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 };
      g.appendChild(svg("text", { class: "link-label", x: mid.x, y: mid.y, "text-anchor": "middle" },
        [`${l.resourceId} ${(l.flow ?? 0).toFixed(2)}/s`]));
      return g;
    }).filter(Boolean);
    this._replace(this.layerLinks, linkEls);

    // nodes
    const nodeEls = this.snap.nodes.map((n) => this._drawNode(n, v));
    this._replace(this.layerNodes, nodeEls);
  }

  _drawNode(n, v) {
    const p = graphToScreen(v, n.pos.x, n.pos.y);
    const w = NODE_W * v.scale, hgt = NODE_H * v.scale;
    const g = svg("g", { class: n.id === this.selectedId ? "node-card selected" : "node-card" });
    g.appendChild(svg("rect", { class: "node-box", x: p.x, y: p.y, width: w, height: hgt, rx: 8 }));
    g.appendChild(svg("text", { class: "node-label", x: p.x + 8, y: p.y + 20 },
      [`${KIND_ICON[n.kind] || "▣"} ${n.kind}`]));
    g.appendChild(svg("text", { class: "node-sub", x: p.x + 8, y: p.y + 38 },
      [`L${n.level} · ${(n.effectiveRate ?? 0).toFixed(2)}/s`]));
    // capacity bar
    const pct = Math.max(0, Math.min(1, n.capacityPct ?? 0));
    const barY = p.y + hgt - 8;
    g.appendChild(svg("rect", { class: "cap-bg", x: p.x + 8, y: barY, width: w - 16, height: 4 }));
    g.appendChild(svg("rect", { class: "cap-fill", x: p.x + 8, y: barY, width: (w - 16) * pct, height: 4 }));
    // ports (visible dot + transparent >=44px hit halo)
    const op = graphToScreen(v, this._outPort(n).x, this._outPort(n).y);
    const ip = graphToScreen(v, this._inPort(n).x, this._inPort(n).y);
    const armedOut = this.armedPort && this.armedPort.nodeId === n.id;
    g.appendChild(svg("circle", { class: "port-hit", cx: op.x, cy: op.y, r: HIT_R }));
    g.appendChild(svg("circle", { class: armedOut ? "port armed" : "port", cx: op.x, cy: op.y, r: PORT_R }));
    g.appendChild(svg("circle", { class: "port-hit", cx: ip.x, cy: ip.y, r: HIT_R }));
    g.appendChild(svg("circle", { class: "port", cx: ip.x, cy: ip.y, r: PORT_R }));
    return g;
  }

  _replace(layer, els) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (const e of els) layer.appendChild(e);
  }
}
```

- [ ] **Step 2: Manual sanity (deferred).** GraphView is verified visually in Task 5.11 (seed chain of 3 nodes + 2 links renders, capacity bars show, ports are tappable, connect works). No node test — it is SVG rendering + browser pointer wiring; its pure math (`Svg.js`) is already covered.

- [ ] **Step 3: Commit.**

```
git add Source/UI/GraphView.js
git commit -m "feat(ui): SVG graph canvas — render nodes/links, capacity bars, connect/select, pan/zoom"
```

---

### Task 5.9: App shell (`App.js`)

The shell mounts the HUD + the active screen host, owns the `Router`, subscribes to `game.onSnapshot`, routes between Factory (the GraphView from 5.8) and placeholder hosts for Research/Expeditions/Heroes (filled in Phases 6–7), flashes `snapshot.lastError` in the HUD error banner, and exposes `mount(el, game)` + `showOfflineSummary(summary)` per the §9.5 composition contract. It is the single snapshot listener; on each emitted snapshot it renders the HUD and the active screen.

Files:
- Create: `Source/UI/App.js`

Steps:

- [ ] **Step 1: Write the implementation.** Create `Source/UI/App.js`:

```js
import { Router } from "./Router.js";
import { Hud } from "./Hud.js";
import { GraphView } from "./GraphView.js";

export const App = {
  mount(rootEl, game) {
    const inst = new AppInstance(rootEl, game);
    inst.start();
    App._current = inst;
    return inst;
  },
  showOfflineSummary(summary) {
    if (App._current) App._current.showOfflineSummary(summary);
  },
  _current: null,
};

class AppInstance {
  constructor(rootEl, game) {
    this.root = rootEl;
    this.game = game;
    this.router = new Router();

    this.hudEl = document.createElement("header");
    this.hudEl.className = "hud";
    this.screenEl = document.createElement("main");
    this.screenEl.className = "screen";
    this.errorEl = document.createElement("div");
    this.errorEl.className = "hud-error";
    this.errorEl.style.display = "none";

    this.root.innerHTML = "";
    this.root.appendChild(this.hudEl);
    this.root.appendChild(this.screenEl);
    this.root.appendChild(this.errorEl);

    this.hud = new Hud(this.hudEl, this.router);
    this.graphView = null;
    this.lastSnap = null;
    this.activeScreen = null;
    this._errorTimer = null;
  }

  start() {
    this.router.onChange(() => this._mountScreen());
    this.game.onSnapshot((snap) => this._onSnapshot(snap));
    this.router.start();
    this._mountScreen();
  }

  _mountScreen() {
    const route = this.router.current;
    if (this.activeScreen === route && route !== "factory" ? false : this.activeScreen === route) {
      this.hud.render(this.lastSnap || this._emptySnap());
      return;
    }
    this.activeScreen = route;
    this.screenEl.innerHTML = "";
    this.graphView = null;

    if (route === "factory") {
      this.graphView = new GraphView(this.screenEl, this.game, { onSelect: () => {} });
    } else {
      const ph = document.createElement("div");
      ph.className = "panel";
      ph.style.cssText = "position:static;margin:1rem;";
      ph.textContent = `${route} screen — built in a later phase`;
      this.screenEl.appendChild(ph);
    }
    if (this.lastSnap) this._renderScreen(this.lastSnap);
  }

  _onSnapshot(snap) {
    this.lastSnap = snap;
    this.hud.render(snap);
    this._renderScreen(snap);
    if (snap.lastError) this._flashError(snap.lastError);
  }

  _renderScreen(snap) {
    if (this.activeScreen === "factory" && this.graphView) this.graphView.render(snap);
  }

  _flashError(msg) {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = "";
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => { this.errorEl.style.display = "none"; }, 2500);
  }

  showOfflineSummary(summary) {
    const g = summary.gained || { gold: 0, research: 0, renown: 0 };
    const modal = document.createElement("div");
    modal.className = "panel";
    modal.style.cssText = "position:fixed;inset:auto;left:50%;top:30%;transform:translateX(-50%);z-index:60;min-width:240px;";
    const exp = (summary.expeditionsResolved || []).map((e) => e.territoryId).join(", ") || "none";
    modal.innerHTML =
      `<h3>While you were away</h3>` +
      `<p>🪙 ${g.gold.toFixed(0)} · 📜 ${g.research.toFixed(0)} · 🛡️ ${g.renown.toFixed(0)}</p>` +
      `<p class="muted">Expeditions resolved: ${exp}</p>`;
    const close = document.createElement("button");
    close.textContent = "Onward";
    close.style.cssText = "min-height:44px;margin-top:0.5rem;border:1px solid var(--line);border-radius:8px;padding:0 1rem;background:var(--gold);";
    close.onclick = () => modal.remove();
    modal.appendChild(close);
    this.root.appendChild(modal);
  }

  _emptySnap() {
    return { currencies: { gold: 0, research: 0, renown: 0 }, rates: { goldRate: 0, researchRate: 0 }, save: { status: "ok" } };
  }
}
```

- [ ] **Step 2: Manual sanity (deferred).** App is verified in Task 5.11 (shell renders, tabs switch screens, error banner flashes on an illegal intent, offline modal shows). No node test — it is DOM composition over the browser snapshot stream.

- [ ] **Step 3: Commit.**

```
git add Source/UI/App.js
git commit -m "feat(ui): App shell — router, HUD mount, factory screen, error flash, offline summary modal"
```

---

### Task 5.10: Main composition root, RAF loop & autosave (`Main.js`) + PWA shell

The §9.5 composition root: build `Clock` + `LocalStorageAdapter`, assemble the `content` object from `Content/*.js`, construct `Game`, `bootstrap(storage)` (load+migrate+offline), mount `App`, show the offline summary if `appliedMs > 60_000`, run the fixed-20 Hz RAF loop, and wire the debounced ~10 s / `visibilitychange` / `pagehide` autosave with try/catch-guarded writes that flip the HUD save indicator. Also create `Index.html`, `Manifest.webmanifest`, and `ServiceWorker.js` (all relative paths, buildless).

Files:
- Create: `Source/Main.js`
- Create: `Index.html`
- Create: `Manifest.webmanifest`
- Create: `ServiceWorker.js`

Steps:

- [ ] **Step 1: Write `Index.html`.** Create `Index.html` at repo root:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
  <meta name="theme-color" content="#3a3f44" />
  <title>IdleKingdom</title>
  <link rel="manifest" href="./Manifest.webmanifest" />
  <link rel="stylesheet" href="./Source/Styles/Reset.css" />
  <link rel="stylesheet" href="./Source/Styles/Theme.css" />
  <link rel="stylesheet" href="./Source/Styles/Layout.css" />
  <link rel="stylesheet" href="./Source/Styles/Graph.css" />
</head>
<body>
  <div id="App"></div>
  <script type="module" src="./Source/Main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `Manifest.webmanifest`.** Create `Manifest.webmanifest` at repo root (relative `start_url`/`scope` so it installs under any subpath):

```json
{
  "name": "IdleKingdom",
  "short_name": "IdleKingdom",
  "description": "Rebuild Yensburg's war economy and reclaim six fallen walls.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#f4e8cf",
  "theme_color": "#3a3f44",
  "icons": [
    { "src": "./Source/Assets/Icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "./Source/Assets/Icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Write `ServiceWorker.js`.** Create `ServiceWorker.js` at repo root. Cache-first shell over relative URLs; tolerant of missing assets so registration never blocks load:

```js
const CACHE = "idlekingdom-v1";
const SHELL = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  "./Source/Main.js",
  "./Source/Styles/Reset.css",
  "./Source/Styles/Theme.css",
  "./Source/Styles/Layout.css",
  "./Source/Styles/Graph.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match("./Index.html")))
  );
});
```

- [ ] **Step 4: Write `Main.js`.** Create `Source/Main.js`. It imports the engine pieces by their contract paths and assembles `content`:

```js
import { Game } from "./Engine/Game.js";
import { Clock } from "./Engine/Clock.js";
import { LocalStorageAdapter } from "./Engine/Persistence/LocalStorageAdapter.js";
import { serialize, SAVE_KEY } from "./Engine/Persistence/SaveManager.js";
import { App } from "./UI/App.js";

import { RESOURCES } from "./Engine/Content/Resources.js";
import { MACHINES } from "./Engine/Content/Machines.js";
import { RECIPES } from "./Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "./Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "./Engine/Content/Territories.js";
import { EQUIPMENT } from "./Engine/Content/Equipment.js";
import { HEROES } from "./Engine/Content/Heroes.js";
import { START_STATE } from "./Engine/Content/StartState.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
  equipment: EQUIPMENT,
  heroes: HEROES,
  startState: START_STATE,
};

const clock = new Clock();
const storage = new LocalStorageAdapter();
const game = new Game({ content, clock });

const offlineSummary = game.bootstrap(storage);
App.mount(document.getElementById("App"), game);
if (offlineSummary && offlineSummary.appliedMs > 60_000) App.showOfflineSummary(offlineSummary);

// --- Autosave (debounced ~1s; interval ~10s; visibility/pagehide immediate) ---
let saveStatus = "ok";
let saveTimer = null;
let lastSavedAt = 0;

function doSave() {
  saveTimer = null;
  try {
    storage.set(SAVE_KEY, serialize(game.getState()));
    saveStatus = "ok";
    lastSavedAt = clock.now();
  } catch (err) {
    saveStatus = "failed";
  }
  // surface status to the HUD via a lightweight snapshot field hook
  game.getState().meta && (game.getState().meta._saveStatus = saveStatus);
}

function requestSave(immediate) {
  if (immediate) { if (saveTimer) clearTimeout(saveTimer); doSave(); return; }
  if (saveTimer) return; // debounce: a save is already queued
  saveTimer = setTimeout(doSave, 1000);
}

setInterval(() => requestSave(false), 10_000);
document.addEventListener("visibilitychange", () => { if (document.hidden) requestSave(true); });
window.addEventListener("pagehide", () => requestSave(true));
window.addEventListener("beforeunload", () => requestSave(true));

// --- Fixed-step RAF loop (§9.5) ---
let last = clock.now();
let acc = 0;
const STEP = 1000 / 20; // 20 Hz

function frame() {
  const now = clock.now();
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250; // tab-throttle guard; longer gaps reconciled by offline path
  acc += dt;
  while (acc >= STEP) { game.tick(STEP / 1000); acc -= STEP; }
  game.emitSnapshotForFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Optional offline shell (relative, never blocks load) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {});
  });
}
```

- [ ] **Step 5: Verify the engine entrypoints exist before relying on them.** Run `node -e "import('./Source/Engine/Game.js').then(()=>console.log('GAME OK')).catch(e=>{console.error(e.message);process.exit(1)})"`. Expected: prints `GAME OK` (the headless `Game` facade from Phase 1–4 imports cleanly under node). If it errors, that is an earlier-phase gap to fix before this phase's manual checks — Main.js wires only contract names.

- [ ] **Step 6: Full test suite still green.** Run `node Tests/RunAll.js`. Expected: every suite (all prior phases + `Format`/`Dom`/`Svg`) passes — `# fail 0`, exit code 0. (Main.js/Index.html/SW are browser-only and carry no node tests; they are exercised manually in 5.11.)

- [ ] **Step 7: Commit.**

```
git add Source/Main.js Index.html Manifest.webmanifest ServiceWorker.js
git commit -m "feat(ui): Main composition root — 20Hz RAF loop, debounced autosave, PWA shell"
```

---

### Task 5.11: Manual browser verification (served, desktop + mobile)

The screen wiring and loop carry no game-rule logic, so they are verified live in a browser per the spec's UI-is-manual stance (§10). This task is a checklist with exact commands and expected observations; it ends by recording the result in a commit message (no code).

Files:
- (none created — verification only)

Steps:

- [ ] **Step 1: Serve the buildless app.** From the repo root run (background) `python3 -m http.server 8080`. Expected: console shows `Serving HTTP on 0.0.0.0 port 8080`. Open `http://localhost:8080/Index.html` in a desktop browser.

- [ ] **Step 2: Verify the seed chain renders.** Expected observations: the Factory screen shows **three node cards** — `⛏️ gatherer` (Miner), `🔥 smelter`, `🏪 market` — left to right, joined by **two link paths** labeled `iron_ore …/s` and `iron_bar …/s`. Each card shows `L1 · <rate>/s` and a green capacity bar. The HUD top bar shows 🪙 ~25, 📜 ~0, 🛡️ 0 with `/s` rates beneath gold and research, a `💾 saved` indicator, and four tabs.

- [ ] **Step 3: Verify counters tick.** Watch for ~5 seconds without interacting. Expected: 🪙 Gold rises at roughly **2.0/s** (≈ +10 over 5 s) and 📜 Research rises at roughly **0.10/s** — matching the §7 opening steady state. The gold `/s` cell reads `2.0/s`, research reads `0.1/s`.

- [ ] **Step 4: Drag a node.** Mouse-press on the smelter card body and drag. Expected: the card follows the cursor smoothly, its two links re-curve to stay attached to its ports, and releasing leaves it in place. Clicking empty canvas deselects (card outline returns from gold to iron).

- [ ] **Step 5: Connect two nodes (mouse drag).** Place-or-use any second producible output: press on the **smelter's right (output) port** and drag to the **market's left (input) port**, release. Expected: either a new link appears, or — if the link already exists / would be a duplicate or cycle — the HUD flashes a red error banner for ~2.5 s (e.g. "duplicate link" / "cycle") and no link is added. The engine, not the UI, makes that ruling; the UI must surface `lastError`.

- [ ] **Step 6: Zoom and pan.** Scroll the mouse wheel over the canvas. Expected: the graph zooms toward the cursor (the point under the cursor stays fixed), clamped between 0.25× and 4×. Press on empty canvas and drag: the whole graph pans; cursor shows `grabbing`.

- [ ] **Step 7: Verify routing.** Click the **Research**, **Expeditions**, **Heroes** tabs. Expected: the URL hash changes to `#/research` etc., the active tab highlights gold, and the screen body shows the "<route> screen — built in a later phase" placeholder; clicking **Factory** restores the live graph and the counters are still ticking (the engine never stopped).

- [ ] **Step 8: Verify autosave + reload persistence.** Wait ~12 s (one autosave interval), note the gold value, then reload the page. Expected: gold resumes at approximately the saved value (not reset to 25), confirming `SaveManager.serialize` + `LocalStorageAdapter` round-trip via the autosave path. The HUD shows `💾 saved`.

- [ ] **Step 9: Verify offline summary.** In DevTools Application tab, leave the save as-is, close the tab for >60 s (or hand-edit the stored `idlekingdom.save` `lastSeen` back by, say, 600000 ms via the console: `localStorage` get → parse → set `lastSeen` older → set back), then reload. Expected: a **"While you were away"** modal appears listing 🪙/📜/🛡️ gained over the elapsed (clamped) window with an "Onward" dismiss button; dismissing returns to the live factory.

- [ ] **Step 10: Verify mobile touch path.** Open the same URL in a mobile browser (or DevTools device emulation with touch). Expected: (a) **one-finger drag** on empty canvas pans; (b) **two-finger pinch** zooms; (c) **tap an output port** (it turns gold = armed) then **tap a target input port** dispatches a `ConnectLink` (new link or an error-banner ruling); (d) all port/tab tap targets are comfortably ≥44px (no mis-taps). The HUD collapses tabs to a full-width row under the counters on the narrow viewport.

- [ ] **Step 11: Stop the server and record the result.** Stop the background `python3 -m http.server`. If all 10 checks pass, make an empty marker commit documenting the manual verification:

```
git commit --allow-empty -m "test(ui): manual browser verification of Phase 5 shell — seed chain renders, counters tick at 2.0g/0.1r per sec, drag/connect/zoom/pan, routing, autosave round-trip, offline modal, mobile tap-connect (>=44px) all confirmed"
```

---

I have everything I need. This is the Phase 6 plan section. The UI is DOM/SVG and verified manually per the spec (§10), but the contract requires pure-unit-testing of pure helpers, so I'll create small testable helper modules (formatting/countdown/affordability) under `Source/UI/` that run headless in node, and keep the DOM-touching render code in the panel modules. I'll write the complete plan now.

Below is the complete Phase 6 plan section.

---

## Phase 6: UI Panels, Onboarding, Victory & Final Integration

**Phase goal.** Turn the headless, fully-tested engine (Phases 1–5) plus the shell/HUD/GraphView scaffolding into a complete, playable game. This phase builds the remaining DOM/SVG panels — `BuildMenu`, `NodeInspector`, `ResearchTree`, `ExpeditionBoard`, `HeroPanel`, `OfflineSummary`, `Tooltip` — plus the responsive bottom-sheet behavior and the victory epilogue. Per spec §10, panels carry no game-rule logic (all rules live in the tested engine), so the panels themselves are verified manually; but every *pure* helper a panel needs (currency/affordability formatting, countdown formatting, tooltip step sequencing, snapshot-derived view selectors) is extracted into headless modules under `Source/UI/Format/` and `Source/UI/Logic/` and unit-tested in node alongside the engine suites. The phase ends with a full manual acceptance pass mapped to the spec arc (§7), a final `node Tests/RunAll.js` all-green gate, and a release tag.

> Conventions for this phase (consistent with Phases 1–5): UI modules read frozen `SnapshotView` objects (§13) and dispatch `INTENT`-typed intents (§12) via `game.dispatch(...)`; they never import engine internals or mutate state. DOM is built with the `h()`/`patch()` helpers from `Source/UI/Render/Dom.js` and SVG via `Source/UI/Render/Svg.js`. Pure helpers import nothing DOM-related so they run under plain node. New test files are added to the static import list in `Tests/RunAll.js` (no fs glob, buildless ESM). Float asserts use `expect(x).toBeCloseTo(y, 1e-9)`.

---

### Task 6.1: Pure formatting helpers (currency, rate, countdown, affordability)

Pure, DOM-free string/number helpers consumed by every panel. Fully unit-tested.

**Files**
- Create: `Source/UI/Format/Format.js`  *(panel-helper formatting — distinct from P5's `Source/UI/Render/Format.js`, which holds the HUD's `formatNumber`/`formatRate`; this module may re-export those from `../Render/Format.js` to avoid duplication)*
- Test: `Tests/FormatHelpers.Test.js`  *(NOT `Format.Test.js` — that name is already taken by P5 Task 5.1; reusing it would silently overwrite P5's suite)*
- Modify: `Tests/RunAll.js`

**Steps**

- [ ] **Step 1: Write the failing test for `Format.js`.** Create `Tests/FormatHelpers.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import {
  fmtNum, fmtRate, fmtCountdown, fmtCost, affordClass,
} from "../Source/UI/Format/Format.js";

describe("Format.fmtNum", () => {
  it("trims integers and rounds to 1 decimal otherwise", () => {
    expect(fmtNum(25)).toBe("25");
    expect(fmtNum(25.0)).toBe("25");
    expect(fmtNum(2.04)).toBe("2");
    expect(fmtNum(2.5)).toBe("2.5");
    expect(fmtNum(1234.56)).toBe("1,235");
  });
  it("formats thousands with separators", () => {
    expect(fmtNum(57600)).toBe("57,600");
    expect(fmtNum(144000.4)).toBe("144,000");
  });
  it("handles zero and tiny floats", () => {
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(0.04)).toBe("0");
    expect(fmtNum(0.1)).toBe("0.1");
  });
});

describe("Format.fmtRate", () => {
  it("appends /s and keeps 2 decimals for small rates", () => {
    expect(fmtRate(2.0)).toBe("2/s");
    expect(fmtRate(0.1)).toBe("0.1/s");
    expect(fmtRate(0.05)).toBe("0.05/s");
    expect(fmtRate(0)).toBe("0/s");
  });
});

describe("Format.fmtCountdown", () => {
  it("formats ms as M:SS under an hour", () => {
    expect(fmtCountdown(0)).toBe("0:00");
    expect(fmtCountdown(1000)).toBe("0:01");
    expect(fmtCountdown(120000)).toBe("2:00");
    expect(fmtCountdown(65000)).toBe("1:05");
  });
  it("formats H:MM:SS at or above an hour", () => {
    expect(fmtCountdown(3600000)).toBe("1:00:00");
    expect(fmtCountdown(3661000)).toBe("1:01:01");
  });
  it("clamps negatives to zero", () => {
    expect(fmtCountdown(-500)).toBe("0:00");
  });
});

describe("Format.fmtCost", () => {
  it("renders a cost with a currency glyph", () => {
    expect(fmtCost(9, "research")).toBe("9 📜");
    expect(fmtCost(30, "renown")).toBe("30 🛡️");
    expect(fmtCost(15.0, "gold")).toBe("15 🪙");
  });
});

describe("Format.affordClass", () => {
  it("returns 'affordable' when true, 'locked' when false", () => {
    expect(affordClass(true)).toBe("affordable");
    expect(affordClass(false)).toBe("locked");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `node Tests/RunAll.js Format`. Expect failure: `Error: Cannot find module '.../Source/UI/Format/Format.js'` (or `RunAll` reports the import throwing). The suite does not run green.

- [ ] **Step 3: Write minimal implementation.** Create `Source/UI/Format/Format.js`:

```js
// DOM-free display formatting helpers. Pure; unit-tested under node.

const CURRENCY_GLYPH = { gold: "🪙", research: "📜", renown: "🛡️" };

function withSeparators(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtNum(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return withSeparators(String(Math.round(n)));
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return String(r);
  return String(r);
}

export function fmtRate(n) {
  if (!isFinite(n)) return "0/s";
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return r + "/s";
  return r + "/s";
}

export function fmtCountdown(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function fmtCost(amount, currency) {
  return `${fmtNum(amount)} ${CURRENCY_GLYPH[currency] || ""}`.trimEnd();
}

export function affordClass(ok) {
  return ok ? "affordable" : "locked";
}
```

- [ ] **Step 4: Register the test file.** In `Tests/RunAll.js`, add to the static import list (alongside the existing imports):

```js
import "./FormatHelpers.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run `node Tests/RunAll.js Format`. Expect all `Format.*` cases green, e.g. `# pass <N>  # fail 0` and exit code 0.

- [ ] **Step 6: Commit.**

```
git add Source/UI/Format/Format.js Tests/FormatHelpers.Test.js Tests/RunAll.js
git commit -m "feat(ui): pure display formatting helpers (num/rate/countdown/cost)"
```

---

### Task 6.2: Snapshot view selectors (pure derivations the panels read)

Small pure selectors that turn a `SnapshotView` into the exact shapes each panel renders, plus the tooltip-step decision logic. Keeping these pure means the panels stay dumb and these decisions are tested.

**Files**
- Create: `Source/UI/Logic/Selectors.js`
- Test: `Tests/Selectors.Test.js`
- Modify: `Tests/RunAll.js`

**Steps**

- [ ] **Step 1: Write the failing test.** Create `Tests/Selectors.Test.js`:

```js
import { describe, it, expect } from "./Runner.js";
import {
  nextTutorialStep, expeditionCardStatus, launchNudge, victoryReady,
} from "../Source/UI/Logic/Selectors.js";

const baseTut = { seenGoldTip: false, seenUpgradeTip: false, seenConnectTip: false, seenResearchTip: false, seenExpeditionTip: false };

describe("Selectors.nextTutorialStep", () => {
  it("walks gold -> upgrade -> connect -> research -> expedition in order", () => {
    expect(nextTutorialStep({ ...baseTut })).toBe("gold");
    expect(nextTutorialStep({ ...baseTut, seenGoldTip: true })).toBe("upgrade");
    expect(nextTutorialStep({ ...baseTut, seenGoldTip: true, seenUpgradeTip: true })).toBe("connect");
    expect(nextTutorialStep({ ...baseTut, seenGoldTip: true, seenUpgradeTip: true, seenConnectTip: true })).toBe("research");
    expect(nextTutorialStep({ ...baseTut, seenGoldTip: true, seenUpgradeTip: true, seenConnectTip: true, seenResearchTip: true })).toBe("expedition");
  });
  it("returns null once all flags are seen", () => {
    expect(nextTutorialStep({ seenGoldTip: true, seenUpgradeTip: true, seenConnectTip: true, seenResearchTip: true, seenExpeditionTip: true })).toBe(null);
  });
  it("treats undefined flags as unseen", () => {
    expect(nextTutorialStep({})).toBe("gold");
  });
});

describe("Selectors.expeditionCardStatus", () => {
  const terr = { id: "t_smithyward", status: "available", requiredPower: 38, isNext: true };
  it("maps engine status straight through when not next-active", () => {
    expect(expeditionCardStatus({ ...terr, status: "reclaimed" }, null, 40)).toBe("reclaimed");
    expect(expeditionCardStatus({ ...terr, status: "locked" }, null, 40)).toBe("locked");
  });
  it("returns 'active' when this territory is the live expedition", () => {
    const exp = { active: true, territoryId: "t_smithyward" };
    expect(expeditionCardStatus(terr, exp, 40)).toBe("active");
  });
  it("returns 'ready' when next, available, power suffices, no active run", () => {
    expect(expeditionCardStatus(terr, null, 40)).toBe("ready");
    expect(expeditionCardStatus(terr, { active: false }, 40)).toBe("ready");
  });
  it("returns 'underpowered' when next/available but power too low", () => {
    expect(expeditionCardStatus(terr, null, 30)).toBe("underpowered");
  });
  it("returns 'busy' when ready in itself but another expedition is active", () => {
    const exp = { active: true, territoryId: "t_gatehouse" };
    expect(expeditionCardStatus(terr, exp, 40)).toBe("busy");
  });
});

describe("Selectors.launchNudge", () => {
  it("nudges toward BOTH forging gear and leveling the hero (MINOR #7)", () => {
    const msg = launchNudge(35, 38);
    expect(msg.includes("forge")).toBeTruthy();
    expect(msg.includes("level")).toBeTruthy();
    expect(msg.includes("3")).toBeTruthy(); // shortfall = 38-35 = 3
  });
});

describe("Selectors.victoryReady", () => {
  it("true only when meta.won", () => {
    expect(victoryReady({ meta: { won: true } })).toBe(true);
    expect(victoryReady({ meta: { won: false } })).toBe(false);
    expect(victoryReady({ meta: {} })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `node Tests/RunAll.js Selectors`. Expect module-not-found failure for `Source/UI/Logic/Selectors.js`.

- [ ] **Step 3: Write minimal implementation.** Create `Source/UI/Logic/Selectors.js`:

```js
// DOM-free selectors over a frozen SnapshotView. Pure; unit-tested under node.

const TUTORIAL_ORDER = [
  ["gold", "seenGoldTip"],
  ["upgrade", "seenUpgradeTip"],
  ["connect", "seenConnectTip"],
  ["research", "seenResearchTip"],
  ["expedition", "seenExpeditionTip"],
];

export function nextTutorialStep(flags) {
  const f = flags || {};
  for (const [step, key] of TUTORIAL_ORDER) {
    if (!f[key]) return step;
  }
  return null;
}

export function expeditionCardStatus(terr, expedition, heroPower) {
  if (terr.status === "reclaimed") return "reclaimed";
  if (expedition && expedition.active && expedition.territoryId === terr.id) return "active";
  if (terr.status === "locked" || !terr.isNext) return "locked";
  // territory is the next available target
  const anotherActive = !!(expedition && expedition.active && expedition.territoryId !== terr.id);
  if (heroPower < terr.requiredPower) return "underpowered";
  if (anotherActive) return "busy";
  return "ready";
}

export function launchNudge(heroPower, requiredPower) {
  const shortfall = Math.max(0, Math.ceil(requiredPower - heroPower));
  return `Power too low (need ${shortfall} more) — forge better gear or level your hero.`;
}

export function victoryReady(snap) {
  return !!(snap && snap.meta && snap.meta.won === true);
}
```

- [ ] **Step 4: Register the test file.** In `Tests/RunAll.js` add:

```js
import "./Selectors.Test.js";
```

- [ ] **Step 5: Run it, expect PASS.** Run `node Tests/RunAll.js Selectors`. Expect all `Selectors.*` cases green, exit code 0.

- [ ] **Step 6: Commit.**

```
git add Source/UI/Logic/Selectors.js Tests/Selectors.Test.js Tests/RunAll.js
git commit -m "feat(ui): pure snapshot selectors for tutorial/expedition/victory"
```

---

### Task 6.3: BuildMenu — place machines + pick recipe/assigned raw

Palette panel that lists placeable machines (from `snap.buildMenu.placeableMachines`) and, on selection, lets the player pick a recipe (crafters) or an assigned raw (gatherers), emitting `PlaceNode` / `SetRecipe` / `SetGathererResource` intents.

**Files**
- Create: `Source/UI/BuildMenu.js`
- Modify: `Source/UI/App.js` (mount BuildMenu into factory screen)

**Steps**

- [ ] **Step 1: Implement `BuildMenu.js`.** Create `Source/UI/BuildMenu.js`:

```js
import { h } from "./Render/Dom.js";
import { fmtCost } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { GATHERER_VARIANTS } from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

// Map a gatherer variant label from an allowed resourceId, for the palette.
function variantsForKind(kind) {
  if (kind !== "gatherer") return [{ kind, resourceId: null }];
  const out = [];
  for (const v of Object.values(GATHERER_VARIANTS)) {
    for (const rid of v.resourceIds) out.push({ kind, label: v.label, resourceId: rid });
  }
  return out;
}

export function BuildMenu(snap, dispatch, ui) {
  // ui = { selectedPaletteKind, spawnPos } mutable view-state owned by App
  const bm = snap.buildMenu || { placeableMachines: [], unlockedRecipes: [] };

  const machineButtons = bm.placeableMachines.map((kind) =>
    h("button", {
      class: "bm-machine" + (ui.selectedPaletteKind === kind ? " selected" : ""),
      onclick: () => ui.setPalette(kind),
    }, kind)
  );

  const detail = [];
  const kind = ui.selectedPaletteKind;
  if (kind === "gatherer") {
    detail.push(h("div", { class: "bm-detail-title" }, "Assign raw:"));
    for (const v of variantsForKind("gatherer")) {
      const res = RESOURCES[v.resourceId];
      detail.push(h("button", {
        class: "bm-place",
        onclick: () => dispatch({
          type: INTENT.PlaceNode, kind: "gatherer",
          resourceId: v.resourceId, pos: ui.spawnPos(),
        }),
      }, `${res.icon} ${v.label}: ${res.display}`));
    }
  } else if (kind === "smelter" || kind === "workshop") {
    detail.push(h("div", { class: "bm-detail-title" }, "Pick recipe:"));
    for (const r of bm.unlockedRecipes) {
      const recipe = RECIPES[r];
      if (!recipe || recipe.crafterKind !== kind) continue;
      const out = RESOURCES[recipe.output];
      detail.push(h("button", {
        class: "bm-place",
        onclick: () => dispatch({
          type: INTENT.PlaceNode, kind, recipeId: r, pos: ui.spawnPos(),
        }),
      }, `${out.icon} ${out.display}`));
    }
  } else if (kind) {
    detail.push(h("button", {
      class: "bm-place",
      onclick: () => dispatch({ type: INTENT.PlaceNode, kind, pos: ui.spawnPos() }),
    }, `Place ${kind}`));
  }

  return h("div", { class: "build-menu", id: "BuildMenu" },
    h("div", { class: "bm-title" }, "Build"),
    h("div", { class: "bm-machines" }, ...machineButtons),
    h("div", { class: "bm-detail" }, ...detail),
  );
}
```

- [ ] **Step 2: Wire BuildMenu into the factory screen.** In `Source/UI/App.js`, inside the factory-screen render path, import and mount `BuildMenu`. Add near the other UI imports:

```js
import { BuildMenu } from "./BuildMenu.js";
```

and where the factory screen composes its children (next to `GraphView`), append the BuildMenu, passing a `ui` object that exposes `selectedPaletteKind`, `setPalette(kind)` (sets the field and re-renders), and `spawnPos()` (returns a graph-space coordinate near the viewport center, e.g. `{ x: 300, y: 320 }` or the GraphView's current center):

```js
// inside factoryScreen(snap):
children.push(BuildMenu(snap, this.dispatch, this.buildUi));
```

with `this.buildUi` initialized in the App constructor:

```js
this.buildUi = {
  selectedPaletteKind: null,
  setPalette: (k) => { this.buildUi.selectedPaletteKind = k; this.renderNow(); },
  spawnPos: () => this.graphView.centerGraphPos(),
};
```

(If `graphView.centerGraphPos()` was not added in Phase 4, fall back to `() => ({ x: 300, y: 320 })`.)

- [ ] **Step 3: Manual smoke (browser).** Serve the repo (`python3 -m http.server 8080` from the repo root) and open `http://localhost:8080/Index.html`. On `#/factory`, confirm: the Build palette shows `gatherer`, `smelter`, `market` initially; selecting `gatherer` shows three raw-assign buttons; clicking one places a new gatherer node (visible in GraphView); selecting `smelter` shows the `Iron Bar` recipe (only `r_iron_bar` unlocked at start). Document the result in the acceptance checklist (Task 6.10), not as an automated test (UI is manually verified per §10).

- [ ] **Step 4: Commit.**

```
git add Source/UI/BuildMenu.js Source/UI/App.js
git commit -m "feat(ui): BuildMenu palette places machines and picks recipe/raw"
```

---

### Task 6.4: NodeInspector — rate, level, live-cost upgrade, recipe/raw switch

Side panel for the currently selected node showing its solved effective rate, capacity %, level, stockpile, and a live-cost Upgrade button (disabled when unaffordable), plus a recipe/raw reassignment control and per-stockpile manual sell.

**Files**
- Create: `Source/UI/NodeInspector.js`
- Modify: `Source/UI/App.js` (mount NodeInspector + track selectedNodeId)

**Steps**

- [ ] **Step 1: Implement `NodeInspector.js`.** Create `Source/UI/NodeInspector.js`:

```js
import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost, affordClass } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { INTENT } from "../Engine/Intents.js";

export function NodeInspector(snap, dispatch, selectedNodeId) {
  const node = (snap.nodes || []).find((n) => n.id === selectedNodeId);
  if (!node) return h("div", { class: "node-inspector empty", id: "NodeInspector" }, "Select a node");

  const pct = Math.round((node.capacityPct || 0) * 100);
  const rows = [
    h("div", { class: "ni-title" }, node.kind),
    h("div", { class: "ni-line" }, `Level ${node.level}`),
    h("div", { class: "ni-line" }, `Rate ${fmtRate(node.effectiveRate)} / cap ${fmtRate(node.capacity)} (${pct}%)`),
  ];

  // Stockpile + manual sell
  const sp = node.stockpile || {};
  for (const [resId, qty] of Object.entries(sp)) {
    if (qty <= 0) continue;
    const res = RESOURCES[resId];
    rows.push(h("div", { class: "ni-stock" },
      `${res.icon} ${res.display}: ${fmtNum(qty)}`,
      res.basePrice != null
        ? h("button", { class: "ni-sell", onclick: () => dispatch({ type: INTENT.SellFromStockpile, nodeId: node.id, resId }) }, "Sell")
        : null,
    ));
  }

  // Recipe / raw reassignment
  if (node.kind === "smelter" || node.kind === "workshop") {
    const opts = (snap.buildMenu ? snap.buildMenu.unlockedRecipes : [])
      .filter((r) => RECIPES[r] && RECIPES[r].crafterKind === node.kind)
      .map((r) => h("option", { value: r, selected: r === node.recipeId }, RESOURCES[RECIPES[r].output].display));
    rows.push(h("select", {
      class: "ni-recipe",
      onchange: (e) => dispatch({ type: INTENT.SetRecipe, nodeId: node.id, recipeId: e.target.value }),
    }, ...opts));
  } else if (node.kind === "gatherer") {
    const res = RESOURCES[node.resourceId];
    rows.push(h("div", { class: "ni-line" }, `Mining ${res.icon} ${res.display}`));
  }

  // Upgrade
  rows.push(h("button", {
    class: "ni-upgrade " + affordClass(node.canAfford),
    disabled: !node.canAfford,
    onclick: () => dispatch({ type: INTENT.UpgradeNode, nodeId: node.id }),
  }, `Upgrade → ${fmtCost(node.upgradeCost, "gold")}`));

  return h("div", { class: "node-inspector", id: "NodeInspector" }, ...rows);
}
```

- [ ] **Step 2: Wire NodeInspector into App.** In `Source/UI/App.js` add the import and mount it in the factory screen, tracking the selected node id (set by GraphView's node-tap callback from Phase 4):

```js
import { NodeInspector } from "./NodeInspector.js";
// ...
children.push(NodeInspector(snap, this.dispatch, this.selectedNodeId));
```

Ensure GraphView's "node selected" callback sets `this.selectedNodeId = id; this.renderNow();` (this hook should exist from Phase 4; if not, add it to the GraphView mount config).

- [ ] **Step 3: Manual smoke (browser).** With the dev server running, click the pre-seeded Miner node. Confirm the inspector shows `gatherer`, `Level 1`, a rate line, and an `Upgrade → 17 🪙` button (cost = `15 × 1.15^1 = 17.25 → "17"`). With 25 starting gold the button is enabled; clicking it spends gold and increments the level (rate line updates). Record in the acceptance checklist.

- [ ] **Step 4: Commit.**

```
git add Source/UI/NodeInspector.js Source/UI/App.js
git commit -m "feat(ui): NodeInspector shows rate/level/stockpile + live-cost upgrade"
```

---

### Task 6.5: ResearchTree — locked/available/owned, costs, prereq edges, buy

DOM/SVG tree of the 15+2 research nodes from `snap.research`, drawing prereq edges (SVG) under DOM node cards colored by status, with a Buy button that dispatches `BuyResearch` (disabled unless `affordable && status === "available"`).

**Files**
- Create: `Source/UI/ResearchTree.js`
- Modify: `Source/UI/App.js` (mount research screen)

**Steps**

- [ ] **Step 1: Implement `ResearchTree.js`.** Create `Source/UI/ResearchTree.js`:

```js
import { h } from "./Render/Dom.js";
import { svg } from "./Render/Svg.js";
import { fmtCost, affordClass } from "./Format/Format.js";
import { RESEARCH_NODES } from "../Engine/Content/ResearchNodes.js";
import { INTENT } from "../Engine/Intents.js";

// Simple layered layout: column = prereq depth, row = order within depth.
function depthOf(id, memo) {
  if (memo[id] != null) return memo[id];
  const node = RESEARCH_NODES[id];
  if (!node || node.prereqs.length === 0) return (memo[id] = 0);
  const d = 1 + Math.max(...node.prereqs.map((p) => depthOf(p, memo)));
  return (memo[id] = d);
}

export function ResearchTree(snap, dispatch) {
  const memo = {};
  const rows = {};
  const pos = {};
  const COL_W = 180, ROW_H = 96, PAD = 24;
  for (const id of Object.keys(RESEARCH_NODES)) {
    const d = depthOf(id, memo);
    rows[d] = (rows[d] || 0);
    pos[id] = { x: PAD + d * COL_W, y: PAD + rows[d] * ROW_H };
    rows[d]++;
  }
  const width = PAD + (Math.max(...Object.values(memo)) + 1) * COL_W;
  const height = PAD + Math.max(...Object.values(rows)) * ROW_H + PAD;

  // SVG prereq edges
  const edges = [];
  for (const node of Object.values(RESEARCH_NODES)) {
    for (const p of node.prereqs) {
      const a = pos[p], b = pos[node.id];
      if (!a || !b) continue;
      edges.push(svg("line", {
        x1: a.x + 140, y1: a.y + 28, x2: b.x, y2: b.y + 28,
        class: "res-edge",
      }));
    }
  }
  const edgeLayer = svg("svg", { class: "res-edges", width, height }, ...edges);

  // DOM node cards over the edge layer
  const cards = (snap.research || []).map((r) => {
    const p = pos[r.id] || { x: 0, y: 0 };
    const canBuy = r.status === "available" && r.affordable;
    return h("div", {
      class: `res-node ${r.status}`,
      style: `position:absolute;left:${p.x}px;top:${p.y}px`,
    },
      h("div", { class: "res-name" }, r.name),
      h("div", { class: "res-cost" }, fmtCost(r.cost, r.currency)),
      h("div", { class: "res-eff" }, r.effectsText || ""),
      h("button", {
        class: "res-buy " + affordClass(canBuy),
        disabled: !canBuy,
        onclick: () => dispatch({ type: INTENT.BuyResearch, nodeId: r.id }),
      }, r.status === "owned" ? "Owned" : "Research"),
    );
  });

  return h("div", { class: "research-tree", id: "ResearchTree", style: `position:relative;width:${width}px;height:${height}px` },
    edgeLayer, ...cards,
  );
}
```

- [ ] **Step 2: Wire the research screen.** In `Source/UI/App.js` add the import and route `#/research` to render `ResearchTree(snap, this.dispatch)`:

```js
import { ResearchTree } from "./ResearchTree.js";
// in the screen switch:
case "research": return ResearchTree(snap, this.dispatch);
```

(If `Source/UI/Render/Svg.js` exports the SVG builder under a different name than `svg`, use that export — it must already exist from Phase 4's `GraphView`/`Svg.js`. The contract names the module `Svg.js`; this task assumes a generic element builder export.)

- [ ] **Step 3: Manual smoke (browser).** Navigate to `#/research`. Confirm `res_scholar` renders as `available` (cost `9 📜`, Research button enabled once ≥9 research banked); all others with unmet prereqs render `locked` with a disabled button; prereq edges connect parents to children. Buy `res_scholar` and confirm it flips to `owned` and `res_lumber`/`res_tannery` become `available`. Record in the checklist.

- [ ] **Step 4: Commit.**

```
git add Source/UI/ResearchTree.js Source/UI/App.js
git commit -m "feat(ui): ResearchTree with prereq edges, status colors, buy action"
```

---

### Task 6.6: ExpeditionBoard — 6 cards, power vs req, duration, launch nudge, live countdown

Six territory cards from `snap.territories`, each showing required vs current hero power, duration, status (from the tested `expeditionCardStatus` selector), a Launch button (disabled below threshold with the gear-or-level nudge tooltip), and a live countdown on the active run.

**Files**
- Create: `Source/UI/ExpeditionBoard.js`
- Modify: `Source/UI/App.js` (mount expeditions screen)

**Steps**

- [ ] **Step 1: Implement `ExpeditionBoard.js`.** Create `Source/UI/ExpeditionBoard.js`:

```js
import { h } from "./Render/Dom.js";
import { fmtCountdown, fmtNum } from "./Format/Format.js";
import { expeditionCardStatus, launchNudge } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

export function ExpeditionBoard(snap, dispatch) {
  const exp = snap.expedition; // {active, territoryId, timeRemainingMs, durationMs, heroId} | null
  const lead = (snap.heroes || [])[0] || { id: null, power: 0 };
  const heroPower = lead.power || 0;

  const cards = (snap.territories || []).map((t) => {
    const status = expeditionCardStatus(t, exp, heroPower);
    const parts = [
      h("div", { class: "exp-name" }, `#${t.order} ${t.name}`),
      h("div", { class: "exp-flavor" }, t.flavor || ""),
      h("div", { class: "exp-power" }, `Power ${fmtNum(heroPower)} / ${fmtNum(t.requiredPower)}`),
      h("div", { class: "exp-dur" }, `Duration ${fmtCountdown(t.durationMs)}`),
      h("div", { class: "exp-reward" },
        `🪙 ${fmtNum(t.rewards.gold)}  📜 ${fmtNum(t.rewards.research)}  🛡️ ${fmtNum(t.rewards.renown)}`),
    ];

    if (status === "active") {
      const rem = exp ? exp.timeRemainingMs : 0;
      parts.push(h("div", { class: "exp-countdown" }, `In progress — ${fmtCountdown(rem)}`));
    } else if (status === "ready") {
      parts.push(h("button", {
        class: "exp-launch affordable",
        onclick: () => dispatch({ type: INTENT.StartExpedition, territoryId: t.id, heroId: lead.id }),
      }, "Launch"));
    } else if (status === "underpowered") {
      parts.push(h("button", {
        class: "exp-launch locked",
        disabled: true,
        title: launchNudge(heroPower, t.requiredPower),
      }, "Launch"));
      parts.push(h("div", { class: "exp-nudge" }, launchNudge(heroPower, t.requiredPower)));
    } else if (status === "busy") {
      parts.push(h("button", { class: "exp-launch locked", disabled: true, title: "Another expedition is running." }, "Launch"));
    } else if (status === "reclaimed") {
      parts.push(h("div", { class: "exp-done" }, "Reclaimed ✓"));
    } else {
      parts.push(h("div", { class: "exp-locked" }, "Locked"));
    }

    return h("div", { class: `exp-card ${status}` + (t.isVictory ? " victory" : "") }, ...parts);
  });

  return h("div", { class: "expedition-board", id: "ExpeditionBoard" }, ...cards);
}
```

- [ ] **Step 2: Wire the expeditions screen.** In `Source/UI/App.js`:

```js
import { ExpeditionBoard } from "./ExpeditionBoard.js";
// in the screen switch:
case "expeditions": return ExpeditionBoard(snap, this.dispatch);
```

- [ ] **Step 3: Manual smoke (browser).** Navigate to `#/expeditions`. With a fresh game (hero power 0, no gear) `t_gatehouse` shows `underpowered` with the nudge text containing "forge better gear or level your hero". After equipping T1 gear (Task 6.7 / acceptance) so power = 35 ≥ 30, the card flips to `ready` with an enabled Launch button; launching shows a live countdown. Cards #2–#6 render `locked`. Record in the checklist.

- [ ] **Step 4: Commit.**

```
git add Source/UI/ExpeditionBoard.js Source/UI/App.js
git commit -m "feat(ui): ExpeditionBoard cards with power gate, nudge, live countdown"
```

---

### Task 6.7: HeroPanel — 3 equip slots, Renown level-up, power breakdown

Roster panel showing each hero, three equip slots (weapon/armor/accessory) with tier pickers limited to unlocked gear tiers, a Renown Level-Up button (live cost), a power readout broken down into gear + level, and a Recruit button for optional heroes.

**Files**
- Create: `Source/UI/HeroPanel.js`
- Modify: `Source/UI/App.js` (mount hero screen/tab)

**Steps**

- [ ] **Step 1: Implement `HeroPanel.js`.** Create `Source/UI/HeroPanel.js`:

```js
import { h } from "./Render/Dom.js";
import { fmtNum, fmtCost, affordClass } from "./Format/Format.js";
import { EQUIPMENT } from "../Engine/Content/Equipment.js";
import { HEROES } from "../Engine/Content/Heroes.js";
import { INTENT } from "../Engine/Intents.js";

const SLOT_ITEM = { weapon: "sword", armor: "armor", accessory: "shield" };

function tiersFor(snap, itemId) {
  // gearTiersUnlocked from snapshot.tutorial? No — derive from heroes' allowed set baked into snapshot.
  // The snapshot exposes unlocked tiers per item via snap.gearTiers (array of {itemId,tier}).
  const list = (snap.gearTiers || []).filter((g) => g.itemId === itemId).map((g) => g.tier);
  return list.length ? list : [1];
}

export function HeroPanel(snap, dispatch) {
  const heroes = snap.heroes || [];
  const heroCards = heroes.map((hero) => {
    const slots = ["weapon", "armor", "accessory"].map((slot) => {
      const itemId = SLOT_ITEM[slot];
      const item = EQUIPMENT[itemId];
      const equipped = hero.equipped[slot]; // {itemId,tier} | null
      const tierOpts = tiersFor(snap, itemId).map((tier) =>
        h("option", { value: String(tier), selected: equipped && equipped.tier === tier },
          `${item.display} T${tier}`));
      return h("div", { class: "hp-slot" },
        h("div", { class: "hp-slot-label" }, slot),
        h("select", {
          class: "hp-equip",
          onchange: (e) => dispatch({
            type: INTENT.EquipItem, heroId: hero.id, slot, itemId, tier: Number(e.target.value),
          }),
        }, h("option", { value: "" }, "— none —"), ...tierOpts),
      );
    });

    return h("div", { class: "hero-card" },
      h("div", { class: "hp-name" }, hero.name),
      h("div", { class: "hp-power" },
        `Power ${fmtNum(hero.power)} (gear ${fmtNum(hero.powerBreakdown.gear)} + level ${fmtNum(hero.powerBreakdown.level)})`),
      h("div", { class: "hp-level" }, `Level ${hero.level}`),
      ...slots,
      h("button", {
        class: "hp-levelup " + affordClass(hero.canLevel),
        disabled: !hero.canLevel,
        onclick: () => dispatch({ type: INTENT.LevelUpHero, heroId: hero.id }),
      }, `Level Up → ${fmtCost(hero.levelCost, "renown")}`),
    );
  });

  // Recruit options for not-yet-recruited heroes
  const recruited = new Set(heroes.map((x) => x.templateId));
  const recruitCards = Object.values(HEROES)
    .filter((tpl) => !recruited.has(tpl.id) && tpl.unlockKind === "renown")
    .map((tpl) => {
      const r = (snap.recruitable || []).find((x) => x.templateId === tpl.id) || { canRecruit: false };
      return h("div", { class: "recruit-card" },
        h("div", { class: "hp-name" }, tpl.name),
        h("button", {
          class: "hp-recruit " + affordClass(r.canRecruit),
          disabled: !r.canRecruit,
          onclick: () => dispatch({ type: INTENT.RecruitHero, templateId: tpl.id }),
        }, `Recruit → ${fmtCost(tpl.unlockRenownCost, "renown")}`),
      );
    });

  return h("div", { class: "hero-panel", id: "HeroPanel" }, ...heroCards, ...recruitCards);
}
```

> Snapshot dependency note: this panel reads two derived fields beyond §13's core list — `snap.gearTiers` (mirror of `unlocks.gearTiersUnlocked`) and `snap.recruitable` (`[{templateId, canRecruit}]`). If `Snapshot.build` from Phase 2 does not yet expose them, add them in this task as a one-line additive extension to `Snapshot.build` (they are pure projections of `state.unlocks.gearTiersUnlocked` and `HeroSystem.canRecruit`), then re-run `node Tests/RunAll.js SaveManager` to confirm no serialization field leaked (snapshot is non-persisted).

- [ ] **Step 2: Extend `Snapshot.build` if needed.** In `Source/Engine/Snapshot.js`, in the returned frozen view, add (only if absent):

```js
gearTiers: state.unlocks.gearTiersUnlocked.map((g) => ({ itemId: g.itemId, tier: g.tier })),
recruitable: Object.keys(content.heroes).map((tpl) => ({
  templateId: tpl,
  canRecruit: HeroSystem.canRecruit(state, content, tpl),
})),
```

(import `* as HeroSystem from "./Systems/HeroSystem.js"` at the top if not already imported).

- [ ] **Step 3: Wire the hero screen.** In `Source/UI/App.js`:

```js
import { HeroPanel } from "./HeroPanel.js";
// in the screen switch:
case "heroes": return HeroPanel(snap, this.dispatch);
```

Add a `Heroes` tab to the HUD/router tab list if not present.

- [ ] **Step 4: Run engine tests, expect PASS.** Run `node Tests/RunAll.js`. Expect all existing engine suites still green (the snapshot extension is additive and non-persisted), `# fail 0`, exit code 0.

- [ ] **Step 5: Manual smoke (browser).** Navigate to `#/heroes`. Confirm `The Warden` shows `Power 0 (gear 0 + level 0)` at start (note: level bonus is `level × 5` per the contract — a fresh L1 hero with no gear shows power 5 if the engine counts L1; verify against `HeroSystem.heroPower`, which is `Σgear + level*5` → L1 = 5). Equip T1 sword/armor/shield via the slot pickers → power 35. The Level-Up button shows `Level Up → 5 🛡️` and is disabled until 5 renown is banked. Record in the checklist.

- [ ] **Step 6: Commit.**

```
git add Source/UI/HeroPanel.js Source/UI/App.js Source/Engine/Snapshot.js
git commit -m "feat(ui): HeroPanel equip slots, renown level-up, power breakdown"
```

---

### Task 6.8: OfflineSummary modal + Tooltip onboarding (one-shot, persisted flags)

The "While you were away" modal (shown only if `offlineSummary.appliedMs > 60_000`) and the contextual one-shot tooltip sequence (gold → upgrade → connect → research → expedition), driven by the tested `nextTutorialStep` selector and dismissed via the `DismissTooltip` intent (flags persisted in `meta.tutorialFlags`).

**Files**
- Create: `Source/UI/OfflineSummary.js`
- Create: `Source/UI/Tooltip.js`
- Modify: `Source/UI/App.js` (showOfflineSummary + tooltip layer)

**Steps**

- [ ] **Step 1: Implement `OfflineSummary.js`.** Create `Source/UI/OfflineSummary.js`:

```js
import { h } from "./Render/Dom.js";
import { fmtNum, fmtCountdown } from "./Format/Format.js";
import { TERRITORIES } from "../Engine/Content/Territories.js";

export function OfflineSummary(summary, onClose) {
  const g = summary.gained || { gold: 0, research: 0, renown: 0 };
  const expLines = (summary.expeditionsResolved || []).map((e) =>
    h("div", { class: "os-exp" }, `Reclaimed ${TERRITORIES[e.territoryId] ? TERRITORIES[e.territoryId].name : e.territoryId}`));

  return h("div", { class: "modal-backdrop", id: "OfflineSummary" },
    h("div", { class: "modal os-modal" },
      h("div", { class: "os-title" }, "While you were away"),
      h("div", { class: "os-elapsed" }, `Away for ${fmtCountdown(summary.appliedMs)}${summary.clamped ? " (capped)" : ""}`),
      h("div", { class: "os-gained" },
        `🪙 +${fmtNum(g.gold)}   📜 +${fmtNum(g.research)}   🛡️ +${fmtNum(g.renown)}`),
      ...expLines,
      h("button", { class: "os-close", onclick: onClose }, "Continue"),
    ),
  );
}
```

- [ ] **Step 2: Implement `Tooltip.js`.** Create `Source/UI/Tooltip.js`:

```js
import { h } from "./Render/Dom.js";
import { nextTutorialStep } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

const TIPS = {
  gold:       { flag: "seenGoldTip",       anchor: "#Hud .hud-gold",      text: "This is your Gold. Sell goods at the Market to earn it." },
  upgrade:    { flag: "seenUpgradeTip",    anchor: "#NodeInspector .ni-upgrade", text: "Tap a node, then Upgrade it to raise its rate." },
  connect:    { flag: "seenConnectTip",    anchor: "#GraphView",          text: "Drag from an output port to an input port to connect machines." },
  research:   { flag: "seenResearchTip",   anchor: "#Hud .tab-research",  text: "Bank Research and open the tree to unlock new machines." },
  expedition: { flag: "seenExpeditionTip", anchor: "#Hud .tab-expeditions", text: "Forge gear, equip a hero, and launch an expedition." },
};

export function Tooltip(snap, dispatch) {
  const flags = (snap.tutorial && snap.tutorial.flags) || {};
  const step = nextTutorialStep(flags);
  if (!step) return null;
  const tip = TIPS[step];
  if (!tip) return null;

  return h("div", { class: "tooltip-layer", id: "TooltipLayer", "data-anchor": tip.anchor },
    h("div", { class: "tooltip" },
      h("div", { class: "tip-text" }, tip.text),
      h("button", {
        class: "tip-dismiss",
        onclick: () => dispatch({ type: INTENT.DismissTooltip, flag: tip.flag }),
      }, "Got it"),
    ),
  );
}
```

- [ ] **Step 3: Wire modal + tooltip layer into App.** In `Source/UI/App.js`:

```js
import { OfflineSummary } from "./OfflineSummary.js";
import { Tooltip } from "./Tooltip.js";
```

Add a `showOfflineSummary(summary)` method that stores the summary and re-renders; in the top-level render, if `this.pendingOfflineSummary` is set, append `OfflineSummary(this.pendingOfflineSummary, () => { this.pendingOfflineSummary = null; this.renderNow(); })` to the shell. Always append `Tooltip(snap, this.dispatch)` to the shell so the active one-shot tip is shown. In `Source/Main.js` the call already exists per §9.5:

```js
if (offlineSummary.appliedMs > 60_000) App.showOfflineSummary(offlineSummary);
```

— confirm `App.mount` returns or exposes the instance so `showOfflineSummary` is callable, and that the threshold is `> 60_000` (matches the tested 60s gate in `Offline.Test.js`).

- [ ] **Step 4: Run engine tests, expect PASS.** Run `node Tests/RunAll.js Selectors`. Expect the `nextTutorialStep` sequence cases (used by `Tooltip`) green, `# fail 0`. Also run `node Tests/RunAll.js` to confirm nothing regressed.

- [ ] **Step 5: Manual smoke (browser).** Fresh game (clear `localStorage` key `idlekingdom.save`): the gold tooltip appears anchored to the HUD gold counter; clicking "Got it" dispatches `DismissTooltip{flag:"seenGoldTip"}`, the flag persists (reload → it does not reappear), and the upgrade tip becomes active. To exercise OfflineSummary, set `lastSeen` back ~2h (via devtools editing the save) and reload — confirm the modal shows `🪙 +14,400 📜 +720` (per §10's 2h-within-cap figures) and "Continue" closes it. Record both in the checklist.

- [ ] **Step 6: Commit.**

```
git add Source/UI/OfflineSummary.js Source/UI/Tooltip.js Source/UI/App.js
git commit -m "feat(ui): offline summary modal + one-shot persisted onboarding tooltips"
```

---

### Task 6.9: Victory epilogue screen + responsive bottom-sheet panel behavior

A victory epilogue overlay that fires once when `snap.meta.won` becomes true (gated by the tested `victoryReady` selector), and the responsive CSS that turns side panels (BuildMenu / NodeInspector / HeroPanel) into bottom-sheets on narrow viewports with ≥44px touch targets.

**Files**
- Create: `Source/UI/Victory.js`
- Modify: `Source/UI/App.js` (fire victory once)
- Modify: `Source/Styles/Layout.css` (bottom-sheet breakpoints)

**Steps**

- [ ] **Step 1: Implement `Victory.js`.** Create `Source/UI/Victory.js`:

```js
import { h } from "./Render/Dom.js";

const EPILOGUE =
  "The last door of the Black Keep falls. The Usurer-Lord who bought the King's death " +
  "is dragged into the light of the braziers you relit. Yensburg stands. Six walls reclaimed, " +
  "the throne avenged. The forges do not cool — they never will again.";

export function Victory(onClose) {
  return h("div", { class: "modal-backdrop victory-backdrop", id: "Victory" },
    h("div", { class: "modal victory-modal" },
      h("div", { class: "victory-title" }, "Yensburg Reclaimed"),
      h("div", { class: "victory-text" }, EPILOGUE),
      h("div", { class: "victory-sub" }, "Free-play continues — all content remains unlocked."),
      h("button", { class: "victory-close", onclick: onClose }, "Continue the Reign"),
    ),
  );
}
```

- [ ] **Step 2: Fire victory once in App.** In `Source/UI/App.js`:

```js
import { Victory } from "./Victory.js";
import { victoryReady } from "./Logic/Selectors.js";
```

In the snapshot render path, after computing `snap`, fire the epilogue exactly once:

```js
if (victoryReady(snap) && !this.victoryShown) {
  this.victoryShown = true;
  this.showVictory = true;
}
if (this.showVictory) {
  children.push(Victory(() => { this.showVictory = false; this.renderNow(); }));
}
```

Initialize `this.victoryShown = false; this.showVictory = false;` in the constructor. The `victoryShown` latch ensures the epilogue shows once per session even though `meta.won` stays true forever (idempotent on subsequent ticks — mirrors the `Progression.Test.js` "emitted exactly once" property).

- [ ] **Step 3: Add bottom-sheet responsive CSS.** In `Source/Styles/Layout.css`, append:

```css
/* Wide: panels dock to the side */
.build-menu, .node-inspector, .hero-panel {
  position: relative;
}

/* Narrow (mobile): panels become bottom-sheets */
@media (max-width: 720px) {
  .build-menu, .node-inspector {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    max-height: 45vh;
    overflow-y: auto;
    border-top: 2px solid var(--iron, #5a5048);
    background: var(--parchment, #efe2c4);
    box-shadow: 0 -6px 18px rgba(0,0,0,0.3);
    z-index: 40;
  }
  .hero-panel { padding-bottom: 56px; }

  /* >=44px touch targets for every actionable control */
  .bm-machine, .bm-place, .ni-upgrade, .ni-sell, .res-buy,
  .exp-launch, .hp-levelup, .hp-recruit, .hp-equip, .ni-recipe,
  .tip-dismiss, .os-close, .victory-close {
    min-height: 44px;
    min-width: 44px;
    font-size: 16px;
  }

  /* HUD collapses to a compact bar */
  .hud { font-size: 14px; gap: 6px; }
}
```

- [ ] **Step 4: Manual smoke (browser).** (a) Victory: temporarily set the save's `territories.reclaimed` to all six ids (devtools) and reload, or play through — confirm the epilogue overlay fires once on the frame `meta.won` flips, "Continue the Reign" dismisses it, and it does not re-fire on subsequent renders. (b) Responsive: shrink the viewport below 720px (devtools device toolbar) — confirm BuildMenu/NodeInspector dock to a scrollable bottom-sheet and all buttons are ≥44px. Record in the checklist.

- [ ] **Step 5: Commit.**

```
git add Source/UI/Victory.js Source/UI/App.js Source/Styles/Layout.css
git commit -m "feat(ui): victory epilogue (fires once) + responsive bottom-sheet panels"
```

---

### Task 6.10: FINAL INTEGRATION — manual acceptance pass + all-green gate + release tag

Run the full spec-mapped acceptance pass against the served game, confirm the engine suite is all-green, then tag the MVP. This task is the gate; it is checked off only when every box below passes.

**Files**
- Modify: `Tests/RunAll.js` (final confirmation only — no new code unless a defect is found)
- (No new source files; defects found here are fixed in the owning module with its own test + commit before this task is closed.)

**Steps**

- [ ] **Step 1: Run the full engine suite, expect ALL GREEN.** Run `node Tests/RunAll.js`. Expected output ends with a summary line showing zero failures and exit code 0, e.g.:

```
# tests <N>
# pass  <N>
# fail  0
```

If any suite fails, STOP — fix the owning module under TDD (write/repair its `*.Test.js`, fix impl, re-run filtered then full) and commit that fix before returning here. Do not proceed to tag with a red suite.

- [ ] **Step 2: Serve the game for the manual pass.** Run (background): `python3 -m http.server 8080` from `/home/evilc/Projects/IdleKingdom`. Open `http://localhost:8080/Index.html`. Clear any prior save: in devtools console run `localStorage.removeItem("idlekingdom.save")` then reload to guarantee a fresh `NewGame()` seed.

- [ ] **Step 3: Work the acceptance checklist (spec §7 arc).** Check each box only after observing the stated expected result in the running game:

  - [ ] **A1 — Pre-seeded start runs.** Fresh load shows Miner→Smelter→Market on `#/factory`, HUD gold ticking up at ~**2.0/s** and research at ~**0.10/s** (the §7 baseline / `RateSolver.Test.js` figure). No console errors.
  - [ ] **A2 — Onboarding sequence.** The gold tooltip appears first; dismissing it advances to the upgrade tip; flags persist across reload (no re-show).
  - [ ] **A3 — Upgrade loop.** Selecting the Miner shows `Upgrade → 17 🪙` (15×1.15¹ → "17"); buying a few upgrades visibly raises gold/s; cost climbs on the 1.15 curve.
  - [ ] **A4 — First research at ~60s.** With greedy upgrades, ~9 research is banked around 60s; `#/research` shows `res_scholar` (cost `9 📜`) as `available`; buying it flips it to `owned` and unlocks `res_lumber`/`res_tannery`.
  - [ ] **A5 — Build to steel.** Research the spine (`res_lumber`/`res_tannery` → `res_coalworks` → `res_steelmaking`); place a coal Miner (assign `coal_raw`), a `r_coal` Smelter, and a `r_steel` Smelter via BuildMenu; connect them; NodeInspector shows steel flowing (bottleneck behaves as the §3.4 chokepoint).
  - [ ] **A6 — Build equipment.** Research `res_smithing` + `res_fittings` → `res_armory` (all Research-purchasable, **no territory required** — BLOCKER #1 guard); build the blade/plating/fitting → sword/armor/shield chains; confirm the three equipment goods accrue.
  - [ ] **A7 — Equip T1 gear → 35 power.** On `#/heroes`, equip T1 sword (10) + T1 armor (12) + T1 shield (8); power breakdown reads gear **30** + level **5** = **35** for L1 Warden (matches §6.3 T1 row).
  - [ ] **A8 — Clear t_gatehouse.** On `#/expeditions`, `t_gatehouse` (req 30) shows `ready`; Launch starts a 2:00 countdown; the factory keeps running during it.
  - [ ] **A9 — Unlock fires on reclaim.** On completion: +10 renown credited, `t_gatehouse` shows `Reclaimed ✓`, the **+10% gatherer** bonus is live (gatherer rates jump in NodeInspector), and `t_smithyward` becomes the next target.
  - [ ] **A10 — Reload mid-expedition → offline summary + resolution.** Launch a longer expedition (e.g. `t_smithyward`, 5 min) after leveling/equipping to clear it; while it is running, advance the save's `lastSeen` back past the expedition duration (devtools, e.g. −6 min) and reload. Confirm the **OfflineSummary modal** appears (elapsed > 60s), lists gold/research/renown gained and the resolved expedition, and on close the territory is reclaimed with its unlock applied (offline fast-forward per §4.4 / `Offline.Test.js`).
  - [ ] **A11 — Power curve holds to T6.** Progress through T3→T6, leveling the hero with Renown (L2…L6) and equipping each newly-unlocked gear tier; confirm each attempt clears with positive headroom exactly per the §6.3 table (T2 is the tight +2 that requires the first level-up; the launch-disabled nudge reads "forge better gear or level your hero" — MINOR #7).
  - [ ] **A12 — Victory.** Clearing `t_blackkeep` (req 110, loadout 120) fires the **victory epilogue once**; HUD/`meta.won` reflects the win; free-play continues with all content unlocked; the epilogue does not re-fire on later frames.
  - [ ] **A13 — Save resilience.** Corrupt the save (set it to `"{"` in devtools) and reload — the game falls back to a fresh `NewGame()` without a blank/broken page (matches `SaveManager.Test.js` corruption guard). Then confirm the "save failed" HUD indicator path by simulating a quota error if feasible (optional).
  - [ ] **A14 — Responsive/touch.** Below 720px the panels are bottom-sheets, all controls ≥44px, and tap-port-then-port connect works on a touch-emulated viewport (GraphInput from Phase 4).

- [ ] **Step 4: Stop the dev server.** Kill the background `http.server` (Ctrl-C / kill the job).

- [ ] **Step 5: Final all-green re-confirm.** Re-run `node Tests/RunAll.js` one last time. Expect `# fail 0` and exit code 0. This is the release gate.

- [ ] **Step 6: Tag and commit the MVP release.**

```
git add -A
git commit -m "chore(release): IdleKingdom MVP — all panels, onboarding, victory, acceptance pass green" --allow-empty
git tag -a v1.0.0-mvp -m "IdleKingdom MVP: complete factory + research + expeditions + heroes + victory; engine suite all-green"
```

(If the acceptance pass surfaced any defect, it was fixed-with-test-and-committed in its owning module during Step 3 before this tag — the tag must sit on top of a green suite and a clean acceptance run.)
