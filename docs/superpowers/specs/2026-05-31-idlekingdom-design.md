---
name: idlekingdom-mvp-design
date: 2026-05-31
status: draft
repo: evilchinesefood/IdleKingdom
---

# IdleKingdom — MVP Design Spec

> A web-based idle/automation game inspired by *Kingdom Inc.* — vanilla JS, node-graph production chains, rate-based steady-state simulation, true idle with offline catch-up. Synthesized from a multi-agent design pass (economy / research / territory / tech) with an adversarial consistency-and-balance critique applied.

## 1. Overview & Vision

**IdleKingdom** is a buildless, vanilla-JS idle/automation game set in the besieged fortress-city of **Yensburg**. The King is dead — bought and murdered by a Usurer-Lord — and six of the city's walls have fallen. The player rebuilds Yensburg's war economy from a single iron mine, works raw ore up a crafting chain into weapons and armor, arms a hero, and reclaims the six fallen territories one wall at a time until the Black Keep falls and the throne is avenged.

The core fantasy is a tight, legible **factory loop** married to a **craft-to-fight / fight-to-craft** progression spine: you craft to field a hero, the hero reclaims territory, and each reclaimed territory unlocks new factory content — deeper recipes, new resources, permanent production bonuses, and higher equipment tiers. Craft fuels conquest; conquest deepens the craft.

**Design pillars:**
- **Legible, compact factory.** A node/flow graph (a DAG) the player can hold in their head — you scale by *leveling individual nodes*, not by stamping out copies. The graph stays small and readable.
- **Continuous, honest simulation.** A rate-based steady-state solver (units/sec, continuous floats) computes effective throughput; offline progress is the same steady-state rate integrated over elapsed time, clamped to an offline cap. No randomness, no big-number library — every number stays in normal JS float range.
- **Three clean currencies, no dead ones.** Gold (sell goods), Research (unlock the tech tree), Renown (expedition rewards → hero power). Each is meaningfully both earned and spent.
- **A complete arc.** Roughly a handful of hours of engagement spread over a day or two, with offline catch-up smoothing the waits. Reclaim all six territories → victory epilogue → free-play continues. **No prestige, no reset in MVP.**

**Scope (locked MVP content budget):** ~5 raw resources, 4 intermediates, 4 components, 3 equipment goods; 6 machine kinds; 15 research nodes (+2 explicitly-flagged premium Renown nodes); 6 territories; 1 starting hero (up to 3). Tech is vanilla JS, native ES modules, no framework, no bundler; PascalCase files & directories; a headless DOM-free engine that is fully unit-tested, and a thin DOM+SVG UI in flat-fantasy art (parchment / iron / gold), responsive to mouse-drag on desktop and pan/pinch + tap-port-then-port on mobile.

---

## 2. Core Gameplay Loop

The moment-to-moment and session-to-session loops are nested:

**Inner loop (factory, continuous):**
1. **Harvest** raw resources from gatherer nodes (Miner, Forester, Trapper).
2. **Craft** raws up the chain through Smelter and Workshop nodes (ore → bar → steel → blade → sword).
3. **Sell** goods at a Market node for **Gold** (an infinite gold sink), which also yields a small **Research** tithe on every sale.
4. **Research** unlocks new machines, recipes, market listings, bonuses, and offline-cap raises (spend Research; two premium nodes spend Renown).
5. **Upgrade/expand** — spend Gold to level individual nodes (raising their rate) and place new nodes/links to extend the graph.

**Outer loop (conquest, timed):**
6. **Equip** a hero — craft the three equipment goods (sword/armor/shield) and slot them permanently (weapon/armor/accessory).
7. **Expedition** — launch a timed auto-expedition against the next territory. If `heroPower >= requiredPower` the run can start; on real-time completion it deterministically **succeeds**, paying Gold/Research/**Renown**.
8. **Reclaim** the territory → unlock new factory content (resources, recipes, permanent bonuses, higher gear tiers) and spend Renown on hero levels.
9. The new factory content lets you craft better gear and clear the next, harder territory. Repeat until all six are reclaimed → **Victory**.

```
   ┌─────────────── INNER LOOP (factory, real-time) ───────────────┐
   │  Harvest ─▶ Craft ─▶ Sell(Gold + Research tithe) ─▶ Research   │
   │     ▲                                                  │       │
   │     └────────── Upgrade / Expand (spend Gold) ◀────────┘       │
   └───────────────────────────┬───────────────────────────────────┘
                               │ craft equipment goods
                               ▼
   ┌─────────────── OUTER LOOP (conquest, timed) ──────────────────┐
   │  Equip hero ─▶ Expedition(power gate) ─▶ Reclaim (Renown)      │
   │     ▲                                          │               │
   │     └── unlock recipes/resources/gear tiers ◀──┘               │
   └───────────────────────────────────────────────────────────────┘
              reclaim all 6 territories ─▶ VICTORY ─▶ free-play
```

The starting chain (Mine → Smelt → Sell) is **pre-seeded and already running** on first load; contextual tooltips teach upgrade, connect, research, and expedition in sequence.

---

## 3. Economy & Production Graph

All numbers are real, JS-float-safe, and validated against the steady-state solver: the graph is an acyclic DAG, every craft step is gold-positive, and the first research unlock lands ~60 seconds into active play.

### 3.1 Currencies

| id | name | icon | exactly how earned |
|----|------|------|--------------------|
| `gold` | Gold | 🪙 | Selling any *listed* resource at a Market node (`sellRate units/sec × basePrice`). The infinite gold source/sink for the economy. |
| `research` | Research | 📜 | Two sources: (a) a **Scholar** node converting `parchment` → research 1:1, and (b) a passive **sales tithe** — every Market sale also yields `research += goldValue × 0.05` (raised to 0.07 by `res_trade_routes`). |
| `renown` | Renown | 🛡️ | **Only** from completing timed expeditions. Spent on hero levels, optional hero unlocks, and two premium research nodes. |

The sales tithe is the only early Research source (the Scholar unlocks via the first research node), which is what makes the opening loop self-bootstrapping.

### 3.2 Resources

Tier 0 = raw, 1 = intermediate, 2 = component, 3 = equipment good. Prices are **Gold per unit** sold at Market. Intermediates and components have no Market listing until a research node (`res_open_market`) enables it (kept off-market early to force the player up the chain) — **except `iron_bar`**, which is listed from the start as the pre-seeded chain's sale good (the §7 opening sells iron_bar at 2.0 gold/s). The raws are all listed from the start (low value); `gemstone` is harmlessly listed before it is mineable (T4).

**Tier 0 — Raw (5)**
| id | display | tier | icon | base sell |
|----|---------|------|------|-----------|
| `iron_ore` | Iron Ore | 0 | ⛏️ | 0.5 |
| `timber` | Timber | 0 | 🪵 | 0.4 |
| `hide` | Raw Hide | 0 | 🐗 | 0.6 |
| `coal_raw` | Coal Seam | 0 | 🪨 | 0.5 |
| `gemstone` | Gemstone | 0 | 💎 | 3.0 |

**Tier 1 — Intermediate (5, incl. research feedstock)**
| id | display | tier | icon | base sell |
|----|---------|------|------|-----------|
| `iron_bar` | Iron Bar | 1 | 🟫 | 4.0 |
| `plank` | Plank | 1 | 🟧 | 3.5 |
| `leather` | Leather | 1 | 🟤 | 4.0 |
| `coal` | Refined Coal | 1 | ⚫ | 1.5 |
| `parchment` | Parchment | 1 | 🧾 | — (never Market-listed; a research feedstock — produced by `r_parchment` from timber, consumed by the Scholar 1:1 → Research) |

**Tier 2 — Component (4)**
| id | display | tier | icon | base sell |
|----|---------|------|------|-----------|
| `steel` | Steel | 2 | ⬜ | 14.0 |
| `blade` | Blade | 2 | 🔪 | 45.0 |
| `plating` | Plating | 2 | 🔲 | 45.0 |
| `fitting` | Fitting | 2 | 🔩 | 16.0 |

*`steel` is the shared backbone component feeding both `blade` and `plating`; `fitting` is the cheap binder. Four entries keeps the graph compact while giving three "real" component sinks plus the steel chokepoint.*

**Tier 3 — Equipment Good (3)**
| id | display | tier | icon | base sell |
|----|---------|------|------|-----------|
| `sword` | Sword | 3 | ⚔️ | 140.0 |
| `armor` | Plate Armor | 3 | 🥋 | 150.0 |
| `shield` | Shield | 3 | 🛡️ | 110.0 |

Equipment goods are dual-purpose: **sell them for Gold, or equip them on a hero** (see §6). The same `sword` item ID is both a market good and a weapon-slot item.

> **Resource count note:** 5 raw + 5 intermediate + 4 component + 3 equipment = **17 resources** (over the ~15 budget by design: `parchment` is a non-sold research feedstock — Research's own sub-chain, not a saleable good — and the fourth component `steel` is the deliberate throughput chokepoint the whole equipment chain depends on). Counting only *saleable* goods it is 16.

### 3.3 Machine Types (6)

All upgrade costs use `cost(level) = base × 1.15^level`, paid in **Gold** (`level` is the *current* level; the cost shown is to buy the next one). `1.15` is the universal growth factor for predictable pacing.

| id | name | kind | base output (L1) | rate gain / level | upgrade base cost (Gold) | notes |
|----|------|------|------------------|-------------------|--------------------------|-------|
| `miner` | Miner | gatherer | 1.0 unit/s | +0.5 unit/s | 15 | Produces one assigned raw (`iron_ore` / `coal_raw` / `gemstone`). |
| `forester` | Forester | gatherer | 1.0 unit/s | +0.5 unit/s | 15 | Produces `timber`. |
| `trapper` | Trapper | gatherer | 1.0 unit/s | +0.5 unit/s | 15 | Produces `hide`. |
| `smelter` | Smelter | crafter | recipe-based (§3.4) | +0.25 craft/s to its recipe's base output | 25 | Handles Tier-1 recipes and `r_steel`. |
| `workshop` | Workshop | crafter | recipe-based | +0.20 craft/s to base output | 40 | Handles Tier-2 components, Tier-3 equipment, and `r_parchment`. |
| `market` | Market | market | sells 5.0 units/s (L1) | +5.0 units/s | 30 | Gold sink. One Market pulls from multiple inputs; capacity is shared across its links. |
| `scholar` | Scholar | scholar | 0.5 research/s (L1) | +0.25 research/s | 35 | Consumes `parchment` 1:1 per research. Unlocked by `res_scholar`. |

**Machine-kind accounting:** the engine treats `gatherer`, `smelter`, `workshop`, `market`, `scholar` as **5 distinct kinds**; Miner / Forester / Trapper are one `gatherer` kind differentiated by a `resourceId` field (UI labels are cosmetic). This satisfies the ~6 budget (5 engine kinds + the gatherer variant family).

Notes:
- **A crafter node's "rate" is multiplied onto its recipe's base output.** A Smelter at L3 running `r_iron_bar` (base 0.5) outputs `0.5 + 0.25×(3−1) = 1.0` bars/s, *capped by incoming supply* per the solver: `actual = min(capacity, min_i(supply_i / inputCost_i))`.
- `parchment` for the Scholar is produced by a Workshop recipe (`r_parchment`, §3.4) — Research has its own sub-chain that competes for `timber`.

### 3.4 Recipes (12)

Format: **inputs → output** at **base output rate** (units/sec at crafter L1, before the node's per-level rate gain, before supply clamping). Recipe input amounts are "per output unit."

| recipe id | crafter | inputs (resource:amount) | output | base out/s | input draw at base |
|-----------|---------|---------------------------|--------|-----------|--------------------|
| `r_iron_bar` | smelter | `iron_ore:2` | `iron_bar` | 0.5 | 1.0 ore/s |
| `r_plank` | smelter | `timber:2` | `plank` | 0.5 | 1.0 timber/s |
| `r_leather` | smelter | `hide:2` | `leather` | 0.5 | 1.0 hide/s |
| `r_coal` | smelter | `coal_raw:1` | `coal` | 1.0 | 1.0 coal_raw/s |
| `r_steel` | smelter | `iron_bar:2, coal:1` | `steel` | 0.25 | 0.5 bar/s + 0.25 coal/s |
| `r_blade` | workshop | `steel:2, plank:1` | `blade` | 0.2 | 0.4 steel/s + 0.2 plank/s |
| `r_plating` | workshop | `steel:2, leather:1` | `plating` | 0.2 | 0.4 steel/s + 0.2 leather/s |
| `r_fitting` | workshop | `iron_bar:1, leather:1` | `fitting` | 0.25 | 0.25 bar/s + 0.25 leather/s |
| `r_sword` | workshop | `blade:1, fitting:1` | `sword` | 0.1 | 0.1 blade/s + 0.1 fitting/s |
| `r_armor` | workshop | `plating:2, fitting:1` | `armor` | 0.1 | 0.2 plating/s + 0.1 fitting/s |
| `r_shield` | workshop | `plating:1, plank:2` | `shield` | 0.1 | 0.1 plating/s + 0.2 plank/s |
| `r_parchment` | workshop | `timber:1` | `parchment` | 0.5 | 0.5 timber/s |

**DAG validation:** acyclic confirmed; all three equipment goods are reachable from raws at **chain depth 4** — the shortest path to a sword is `iron_ore → iron_bar → steel → blade → sword`, i.e. **4 craft steps** (ore→bar, bar→steel, steel→blade, blade→sword). Every step is value-positive — the output's sell price exceeds the summed sell price of its inputs, so crafting up is never a Gold loss:

| good | raw input cost | sell | margin | value multiple |
|------|---------------:|-----:|-------:|---------------:|
| iron_bar | 1.00 | 4.0 | +3.00 | 4.0× |
| steel | 2.50 | 14.0 | +11.50 | 5.6× |
| blade | 5.80 | 45.0 | +39.20 | 7.8× |
| sword | 8.00 | 140.0 | +132.00 | 17.5× |
| armor | 14.60 | 150.0 | +135.40 | 10.3× |
| shield | 7.80 | 110.0 | +102.20 | 14.1× |

**Steel chokepoint (intended friction):** crafting steel nets only **+1.12 gold/s** over selling its inputs (bar + coal) at equal flow — far thinner than blade (+2.7) or sword (+7.9). This is deliberate: steel forces the player to *also* stand up a coal miner + `r_coal` smelter just to feed the backbone, making the steel chain the economy's pacing gate. It is verified strictly positive, so it is never loss-making.

`gemstone` (raw, sell 3.0) is a wildcard raw: it has a Market price so it is never a dead resource, but **no MVP recipe consumes it** — it is reserved for post-MVP accessory/premium recipes. Its T4 unlock is therefore "a better gold raw," not a new chain (see Open Questions §12).

---

## 4. Node-Graph & Simulation Model

The factory is a directed acyclic graph: **nodes** are machines, **links** carry one resource from a producer to a consumer. The simulation is a **rate-based steady-state solver** — it computes effective units/sec for the whole graph and the per-frame integrator simply advances stockpiles and currencies by those rates.

### 4.1 Solver behavior (steady state)

For any node, capacity is its level-scaled rate:
- **Gatherer:** `(baseOutput + rateGain × (level−1)) × kindBonus` — no inputs, always produces at capacity.
- **Crafter (smelter/workshop):** `(recipe.baseOut + rateGain × (level−1)) × kindBonus`, then clamped by supply:
  `actual_out = min( capacity, min over inputs_i( incomingSupply_i / inputAmount_i ) )`.
- **Market:** `baseOutput + rateGain × (level−1)` total sell units/sec, **shared across all its input links**; sells only *listed* resources; on overflow, all inputs scale down proportionally (fair share). Emits `goldRate = Σ(sold_i × basePrice_i)` and `researchRate = goldRate × titheRate`.
- **Scholar:** `min(capacity, parchmentSupply)` research/sec, drawing `parchment` 1:1.

The solver runs in **topological order** (Kahn's algorithm; a link that would create a cycle is rejected at intent time), so every upstream supply is solved before its consumer reads it — a single forward pass, O(N+E).

### 4.2 Stockpiles & backpressure

A producer that outputs more than its downstream consumers draw routes the **surplus to its own per-node stockpile** (an uncapped float map, sparse — only resources actually accrued). A reverse-topo backpressure pass decides *destination* (downstream link vs. own bin); it never reduces production — a producer happily fills its own bin when consumers are slow. Surplus-with-no-consumer therefore accrues locally rather than vanishing.

The solver result (`goldRate`, `researchRate`, per-node `surplusRate`, per-link `linkFlow`, per-node capacity/draw for UI bars) is **cached** and re-run only when topology, a level, a recipe, or an unlock changes — **not** every frame.

### 4.3 Online integration

Each fixed sim step of `dt` seconds:
```
gold     += goldRate     × dt
research += researchRate × dt
for each (node, resource, rate) in surplusRate: node.stockpile[resource] += rate × dt
advance active expedition countdown by dt
```

### 4.4 Offline catch-up

On load, elapsed wall-clock time since `lastSeen` is **clamped to the offline cap** (default **8h**, raisable to 12h then 24h via research):
```
dt   = min(now − lastSeen, offlineCapHours × 3600s)
solved = solve(state)                      // rates as the player left them — constant offline
gold     += solved.goldRate     × dt
research += solved.researchRate × dt
stockpiles += solved.surplusRate × dt
```
Because no upgrades happen while away, offline rates are constant, so this is **exact in one shot** (no per-tick replay). An in-flight expedition is fast-forwarded: if `now ≥ startedAt + duration`, it resolves deterministically (power was validated at launch) — Renown awarded, territory reclaimed, unlocks applied. The longest mission (60 min) is far below the 8h cap, so **no expedition is ever truncated by the offline window**; at most a player loses idle factory gold past the cap.

A **"While you were away"** summary (gold/research/renown gained, expeditions resolved) is surfaced only if elapsed exceeds ~60s, to avoid nagging on quick reloads.

**Known offline edge cases (intended, noted for QA):**
- A chain left **mid-fill** (empty buffers) is slightly *overpaid* offline, since steady-state assumes full flow from second zero. Per the locked rate-based decision this is accepted.
- `res_quartermaster` auto-sell plus uncapped offline stockpiles can produce a large **one-shot gold dump** on the load that first enables it (e.g. ~144k units after 8h at 5/s). Floats stay safe; this is covered by a dedicated test (§10).

---

## 5. Research Tree

15 research-backbone nodes plus 2 explicitly-flagged **premium Renown nodes** (17 total). Costs are tuned to the validated pacing: the first node lands at **~60s** of active play (~9 Research banked), early nodes clear in the first few minutes, mid-game branches open once a Scholar stream runs (~3 min), and capstones gate the deep end.

**Gating legend** — *Research-purchasable*: buy with banked currency the moment prerequisites are met. *Territory-gated*: a `requires_territory` flag keeps the node locked until the Nth reclaim fires. Territory tags `T1…T6` reference the six reclaims in §6.

> **BLOCKER #1 fix (deadlock removed):** the entire equipment chain — `res_smithing` and `res_armory` — is now **Research-purchasable** (gated only on `res_steelmaking`), *not* territory-gated. The player researches the equipment chain off the pure-factory economy, crafts Tier-1 gear, and *then* attempts the first territory. Territory gating is reserved for the *higher gear tiers* (handled in §6 unlocks), which is where the craft-to-fight interlock genuinely lives.

### 5.1 Research backbone (15 nodes — all priced in `research`)

| id | name | cost | prereqs | effect | gating | flavor |
|----|------|------|---------|--------|--------|--------|
| `res_scholar` | Found the Scholars' Guild | 9 | — | Unlock machine `scholar` + recipe `r_parchment` (Workshop). Opens a dedicated Research stream beyond the sales tithe. | Research-purchasable | A drafty hall, one candle, and the city's last literate quartermaster. |
| `res_lumber` | Lumber Rights | 25 | `res_scholar` | Unlock machine `forester` + Smelter recipe `r_plank`. | Research-purchasable | The eastern woods are ours again — fell what the siege left standing. |
| `res_tannery` | Tannery Charter | 25 | `res_scholar` | Unlock machine `trapper` + Smelter recipe `r_leather`. | Research-purchasable | Boar-hide cures hard, but it cures fast. |
| `res_coalworks` | Coalworks | 40 | `res_lumber` | Unlock Smelter recipe `r_coal`; enable a `miner` to be assigned to `coal_raw`. | Research-purchasable | The deep seams burn hotter than any wood-fire. |
| `res_steelmaking` | Steelmaking | 120 | `res_coalworks` | Unlock Smelter recipe `r_steel` (`iron_bar:2, coal:1 → steel`). The backbone component is online. | Research-purchasable | Iron is a tool. Steel is a weapon. |
| `res_fittings` | Fittings & Rivets | 180 | `res_steelmaking` | Unlock Workshop recipe `r_fitting` + Market listing for `fitting`. | Research-purchasable | A blade is nothing without the rivet that holds the hilt. |
| `res_open_market` | Open the Component Stalls | 90 | `res_steelmaking` | Enable Market listings for `coal`, `iron_bar`, `plank`, `leather`, `steel` (sell surplus intermediates). | Research-purchasable | Even half-finished goods fetch coin from a desperate quarter. |
| `res_smithing` | Blade & Plate Smithing | 250 | `res_steelmaking` | Unlock Workshop recipes `r_blade` + `r_plating`, plus Market listings for `blade` + `plating`. | **Research-purchasable** *(was T1-gated — fixed)* | The forge-masters return to their anvils. |
| `res_armory` | The Armory | 400 | `res_smithing`, `res_fittings` | Unlock Workshop recipes `r_sword`, `r_armor`, `r_shield` (all three Tier-1 equipment goods) + their Market listings. Hero gear becomes craftable. | **Research-purchasable** *(was T1-gated — fixed)* | Now we forge for heroes, not just for coin. |
| `res_efficient_forges` | Efficient Forges | 300 | `res_steelmaking` | +25% rate to all `smelter` nodes (applied to base output before supply clamp). | Research-purchasable | Bank the coals just so and one charge does the work of two. |
| `res_assembly_jigs` | Assembly Jigs | 550 | `res_armory` | +25% rate to all `workshop` nodes. | Research-purchasable | Standardized jigs mean any apprentice builds like a master. |
| `res_trade_routes` | Trade Routes | 700 | `res_open_market` | +30% Market capacity (units/sec per `market`) **and** sales tithe 0.05 → 0.07 research/gold. | Research-purchasable | Merchant caravans slip past the siege lines by moonlight. |
| `res_ledgers` | Caravan Ledgers (Offline I) | 600 | `res_trade_routes` | +4 hr offline cap (8h → 12h). | Research-purchasable | Clerks keep the books running while the city sleeps. |
| `res_logistics` | Master Logistics (Offline II) | 1800 | `res_ledgers`, `res_assembly_jigs` | +12 hr offline cap (→ 24h) **and** +10% global rate (all gatherer/smelter/workshop). | Research-purchasable | A kingdom that runs itself is a kingdom that endures. |
| `res_grand_design` | The Grand Design *(capstone)* | 5000 | `res_logistics`, `res_efficient_forges` | +20% global rate (all production) **and** +50% Scholar output. The endgame compounding spike. | Research-purchasable | Every wheel, every fire, every quill — turning as one. |

### 5.2 Premium Renown nodes (2 — priced in `renown`)

| id | name | cost | prereqs | effect | gating | flavor |
|----|------|------|---------|--------|--------|--------|
| `res_war_college` | War College | 30 `renown` | `res_armory` | +1 hero slot (recruit a 2nd hero; 3rd via the T5 reclaim). | **Territory-gated (T2)** | Two banners on the wall are harder to break than one. |
| `res_quartermaster` | Master Quartermaster *(capstone)* | 60 `renown` | `res_war_college`, `res_trade_routes` | **Auto-sell:** any node with a stockpile and no downstream consumer auto-routes to the nearest Market with spare capacity. Ends manual surplus management for free-play. | **Territory-gated (T4)** | One ledger, one seal, and nothing in Yensburg goes to waste. |

> **Node count note:** 15 research-backbone + 2 premium = **17** (two over the ~15 budget, by design, since the brief lists "+1 hero slot" and "auto-sell QoL" as distinct premium effect types reserved for the Renown currency). Clean cut-points if a strict 15/16 is wanted: drop `res_quartermaster`, or fold `res_war_college` into a territory reclaim reward.

### 5.3 Tree shape & rationale

- **Spine (forced opening):** `res_scholar` (9) → `res_lumber`/`res_tannery` (25 each, parallel) → `res_coalworks` (40) → `res_steelmaking` (120). Lights the Scholar stream and every Tier-1 recipe, then steel.
- **Equipment line (now pure-research):** `res_steelmaking` → `res_smithing` (250) + `res_fittings` (180) → `res_armory` (400). This is the route to craftable Tier-1 gear *before* the first expedition — the deadlock fix. A pure-idle player reaches it on factory income alone.
- **Economy line:** `res_open_market` (90) and `res_fittings` (180) widen the gold faucet without combat.
- **Throughput line:** `res_efficient_forges` (+25% smelters) and `res_assembly_jigs` (+25% workshops) keep the compact graph feeling fast.
- **Offline & trade (long-tail):** `res_trade_routes` → `res_ledgers` (8→12h) → `res_logistics` (→24h + global rate) smooth the day-or-two arc.
- **Capstones:** `res_grand_design` (5000 research) is the research-pure crescendo; `res_quartermaster` (60 renown) is the free-play auto-sell payoff only a near-victorious player can afford.

Backbone total ≈ **10,089 research**, clearing in a few hours of mixed active/offline play at realistic income (steel spine ~219 research; capstone reachable in ~20 min at mid-game ~4 research/s). Every cost is `research` except the two premium nodes priced in `renown`; no node references an ID outside §3 / §6.

---

## 6. Territories, Expeditions & Heroes

Each territory is a **timed auto-expedition with a deterministic power threshold**. If `heroPower >= requiredPower`, the run can be started; on real-time completion (fast-forwarded on offline return) it **succeeds**, grants rewards, reclaims the territory, and fires its factory unlocks. Below the threshold the mission cannot be started — there is no failure roll. Territories must be reclaimed in order, `t_gatehouse → t_blackkeep`.

### 6.1 The Six Territories

> **BLOCKER #2 + #3 fix (off-by-one gear availability + unbeatable T6):** every gear-tier unlock is shifted **one territory earlier** so the gear unlocked by reclaiming territory *N* is available on the attempt against territory *N+1* (you fight a wall with the gear you already have). T2 sword/shield now unlock on the **T2 (Smithy Ward)** reclaim, T2 armor on **T3**, T3 sword/shield on **T4**, and **T3 armor on T5** (was T6). This makes the T6 attempt a true T3/T3/T3 loadout (120 power vs req 110, +10 headroom) instead of the previously-impossible 108.

| # | id | name | flavor | req. power | duration | rewards (gold / research / renown) | factory content unlocked on reclaim |
|---|----|------|--------|-----------:|---------:|------------------------------------|-------------------------------------|
| 1 | `t_gatehouse` | **The Gatehouse** | "Push the rabble off the drawbridge and light the first brazier." | **30** | 2 min | 50 / 20 / **10** | Grants the starting hero `hero_warden` (formal knighting). Permanent bonus: **+10% all gatherer output**. |
| 2 | `t_smithyward` | **Smithy Ward** | "Reclaim the cold forges; the bellows still remember fire." | **38** | 5 min | 120 / 40 / **15** | Unlocks **Tier-2 `sword` & `shield`** crafting (`stat = 10×2 / 8×2`). Permanent bonus: **Smelter output +10%**. |
| 3 | `t_oldmarket` | **The Old Market** | "Merchants return where the banners fly; trade quickens." | **50** | 10 min | 300 / 80 / **25** | Unlocks **Tier-2 `armor`** crafting (`stat = 12×2`). Permanent bonus: **+15% Market sell rate** (all `market` capacity). |
| 4 | `t_ironreach` | **Ironreach Mine** | "The deep galleries are ours again — and they glitter." | **65** | 20 min | 700 / 150 / **35** | Unlocks **`gemstone` mining** (`miner` reassignable to `gemstone`) and **Tier-3 `sword` & `shield`** (`stat = 30 / 24`). Permanent bonus: **Smelter steel output +20%**. |
| 5 | `t_highwall` | **The High Wall** | "From the ramparts you can see the keep — and who waits in it." | **85** | 40 min | 1500 / 300 / **50** | Unlocks **Tier-3 `armor`** (`stat = 36`) and **Hero slot 3** availability. Premium: **offline cap → 12h** (mirrors `res_ledgers`). |
| 6 | `t_blackkeep` | **The Black Keep** | "The Usurer-Lord who bought the King's death waits behind the last door. End it." | **110** | 60 min | 4000 / 600 / **70** | **VICTORY.** Triggers the victory epilogue; free-play continues with all content unlocked. |

**Reclaim ordering rule:** each territory consumes the previous reclaim's gear-tier unlocks as crafting prerequisites — this is the craft-to-fight / fight-to-craft interlock. The longest mission (60 min) sits far under the 8h offline cap, so any single expedition fully fast-forwards on return.

### 6.2 Hero Model

**Starting hero — `hero_warden`** *("The Warden")*, the last sworn knight of the gate, granted automatically on the **first territory reclaim** (`t_gatehouse`). Before that first reclaim the player crafts **T1 sword + T1 armor + T1 shield** (now reachable via pure research, §5) and equips them to reach the 30-power floor: a full-T1 L1 hero = `10 + 12 + 8 + 5 = 35` power, clearing `t_gatehouse` (req 30) with +5 headroom. The Gatehouse expedition is the hero's knighting.

**Heroes 2 & 3 (optional):**
- `hero_ranger` — unlocked by spending **40 Renown** any time after reclaiming `t_oldmarket` (T3).
- `hero_smith` — unlocked by spending **80 Renown** any time after reclaiming `t_highwall` (T5).
- Each hero carries its own three equipment slots; only the **lead hero's** power gates expeditions in MVP. Heroes 2 & 3 are optional parallel-mission hooks for post-MVP and a pure-optional Renown sink (see §6.4 for honest funding accounting).

**Hero levels** — bought with **Renown**: `cost(L → L+1) = 5 × L` Renown (L1→2 = 5, L2→3 = 10, …). Each level adds **+5 heroPower**. No XP grind; leveling is a clean deterministic Renown purchase.

**Equipment slots** (per §3.2 / §6.3):
| slot | item family | T1 stat | tier scaling |
|------|-------------|---------|--------------|
| **weapon** | `sword` | +10 Attack | `10 × tier` (T2 = 20, T3 = 30) |
| **armor** | `armor` (Plate Armor) | +12 Defense | `12 × tier` (T2 = 24, T3 = 36) |
| **accessory** | `shield` | +8 Defense | `8 × tier` (T2 = 16, T3 = 24) |

Equipping a higher-tier item replaces the lower one in its slot (permanent, no durability, not consumed). Higher gear tiers only become craftable as territories unlock their Tier-2/3 components, locking gear progression to combat progression. Attack and Defense both count 1:1 toward heroPower in MVP (combat is a single threshold compare); the split exists so later balance can weight missions without new systems.

### 6.3 Deterministic Power Math — Proof of Reachability

```
heroPower = Σ(equipped item stats) + heroLevel × 5
```

**Gear-tier availability (post-fix, interlocked with §6.1 unlocks):** T1 of all three goods is craftable via research *before* T1. T2 sword/shield unlock on the **T2** reclaim → usable on the **T3** attempt; T2 armor on **T3** → usable on **T4**; T3 sword/shield on **T4** → usable on **T5**; T3 armor on **T5** → usable on the **T6** attempt.

**Expected best legitimately-available loadout at each attempt vs. requirement** (re-validated after the off-by-one fix — every row uses only gear the player actually possesses at launch):

| attempt | loadout (sword / armor / shield tier, hero level) | gear power | level bonus | **total power** | required | headroom |
|---------|---------------------------------------------------|-----------:|------------:|----------------:|---------:|---------:|
| **T1** `t_gatehouse` | T1 / T1 / T1, L1 | 10+12+8 = 30 | +5 | **35** | 30 | **+5** |
| **T2** `t_smithyward` | T1 / T1 / T1, L2 | 30 | +10 | **40** | 38 | **+2** |
| **T3** `t_oldmarket` | T2 / T1 / T2, L3 | 20+12+16 = 48 | +15 | **63** | 50 | **+13** |
| **T4** `t_ironreach` | T2 / T2 / T2, L4 | 20+24+16 = 60 | +20 | **80** | 65 | **+15** |
| **T5** `t_highwall` | T3 / T2 / T3, L5 | 30+24+24 = 78 | +25 | **103** | 85 | **+18** |
| **T6** `t_blackkeep` | T3 / T3 / T3, L6 | 30+36+24 = 90 | +30 | **120** | 110 | **+10** |

Every gate clears with **positive headroom**, and every loadout uses only gear unlocked by a *prior* reclaim. **T2 is intentionally the tightest (+2):** it is the teaching beat that forces the player's first Renown purchase — the 10 Renown banked from the T1 clear funds L2 (cost 5) with margin; a player who instead grinds one extra gear tier also clears it (the UI tooltip must nudge toward *leveling*, see §7/§8). From T3 onward, gear-tier jumps (10/12/8 → 20/24/16 → 30/36/24) outpace the linear requirement curve, so the run never dead-ends.

### 6.4 Renown Economy (required path solvable; completionist honest)

| territory | renown reward | cumulative banked | hero level needed at *next* attempt | cumulative renown cost of that level | fundable? |
|-----------|--------------:|------------------:|:-----------------------------------:|-------------------------------------:|:---------:|
| T1 | 10 | 10 | L2 (for T2) | 5 | ✅ |
| T2 | 15 | 25 | L3 (for T3) | 15 | ✅ |
| T3 | 25 | 50 | L4 (for T4) | 30 | ✅ |
| T4 | 35 | 85 | L5 (for T5) | 50 | ✅ |
| T5 | 50 | 135 | L6 (for T6) | 75 | ✅ |
| T6 | 70 | 205 | — (win) | — | — |

**Required path:** total Renown earned across the run = **205**; required hero leveling to L6 = **75**; the gating path is never starved.

> **MAJOR #6 fix (honest completionist accounting):** the surplus after required leveling is `205 − 75 = 130`. **Completionist content costs more than 130 in a single linear pass:** both optional heroes (40 + 80 = 120) **plus** both premium Renown nodes (`res_war_college` 30 + `res_quartermaster` 60 = 90) total **210** on top of the 75 required levels — i.e. **285 vs. 205 earned, short by 80.** Therefore: **the required victory path is fully funded; buying *all* optional content (both heroes + both premium nodes) requires post-victory free-play Renown farming, not a single pass.** A player picking *some* optional content (e.g. one extra hero + `res_war_college`) fits inside the 130 surplus. (Tuning lever if a single-pass completionist is later desired: raise T6's Renown reward from 70 toward ~150 — left as an Open Question, §12.)

### 6.5 Expedition Flow & Offline Behavior

**Active flow:**
1. Player selects the next locked territory (must be the lowest un-reclaimed one).
2. UI shows `requiredPower`, the lead hero's current `heroPower`, and the real-time `duration`. If `heroPower < requiredPower`, the **Launch** button is disabled with a tooltip that nudges toward **both** *forge better gear* **and** *level your hero* (deterministic; no failure roll).
3. On Launch, a real-time countdown starts (one active expedition at a time in MVP). The factory keeps running normally during the expedition — independent subsystems.
4. On completion: the run **succeeds** (power validated at launch), rewards granted (`gold`/`research`/`renown`), the territory is reclaimed, and its factory unlocks fire immediately. A flavor one-liner plays.

**Offline:** the launch timestamp is persisted; on return, elapsed time is clamped to the offline cap and an in-flight expedition resolves deterministically if its duration elapsed (see §4.4). Only one expedition runs at a time, so offline resolution is a single deterministic completion check plus standard factory steady-state catch-up — no queue replay or ordering ambiguity.

---

## 7. Progression & Pacing — The Arc to Victory

**Opening steady state** (pre-seeded Miner L1 → Smelter L1 `r_iron_bar` → Market L1): **2.0 gold/s**, **0.10 research/s** (the 5% tithe).

Greedy-upgrade simulation of the first 3 minutes of active play (buying whichever side is the current bottleneck each tick):

| t (s) | Miner L | Smelter L | gold/s | gold on hand | research |
|------:|:-------:|:---------:|-------:|-------------:|---------:|
| 30 | 3 | 2 | 3.0 | 1 | 3.4 |
| 60 | 4 | 4 | 5.0 | 20 | **9.0** |
| 90 | 7 | 6 | 7.0 | 11 | 17.8 |
| 120 | 9 | 8 | 9.0 | 43 | 29.9 |
| 150 | 11 | 10 | 11.0 | 73 | 45.3 |
| 180 | 13 | 12 | 13.0 | 74 | 63.7 |

**First research node (`res_scholar`, cost 9) is affordable at ~60s** of active play — exactly the target. The `1.15` cost curve means each early upgrade pays for itself in ~5–8 seconds, giving the satisfying "buy a stack of upgrades" rhythm, then decelerates so the player turns to research/expeditions for the next power spike rather than infinitely leveling L1 nodes.

**Full arc (roughly a handful of hours over a day or two):**

1. **Minute 0–1 — Bootstrap.** Pre-seeded chain runs; tutorial points at the gold counter. Buy the first Miner/Smelter upgrades. Bank ~9 Research → buy `res_scholar`, place a Scholar + `r_parchment` Workshop (needs a Forester for timber — comes next).
2. **Minute 1–5 — Tier-1 buildout.** `res_lumber` + `res_tannery` open Forester/Trapper and plank/leather; `res_coalworks` opens coal. The Research stream now climbs past 1/s. Sell intermediates after `res_open_market`.
3. **Minute 5–15 — Steel & equipment.** `res_steelmaking` (120) lights the backbone; stand up coal miner + `r_coal` → `r_steel`. `res_smithing` + `res_fittings` → `res_armory` make all three Tier-1 equipment goods craftable. Craft T1 sword/armor/shield, equip → 35 power.
4. **First reclaim — `t_gatehouse`.** Launch the 2-min expedition (35 ≥ 30). Win → `hero_warden` formalized, +10% gatherer bonus, first 10 Renown. The outer loop is now live.
5. **Mid-game — climb the walls.** Each reclaim unlocks the next gear tier (T2 then T3) and a permanent bonus; spend Renown on the required hero level before each next attempt (L2…L6). Throughput research (`res_efficient_forges`, `res_assembly_jigs`) and trade/offline research (`res_trade_routes`, `res_ledgers`, `res_logistics`) carry the longer waits — the 20/40/60-min expeditions are designed to be left running while away.
6. **Endgame — `t_blackkeep`.** With T3/T3/T3 + L6 = 120 power, clear the 60-min final expedition (req 110, +10 headroom). Optionally bank the capstone `res_grand_design` (5000) for the compounding spike.
7. **Victory → free-play.** Epilogue plays; all content stays unlocked. Free-play completionists farm Renown for the remaining optional heroes/premium nodes and chase capstone research. **No prestige/reset.**

Offline catch-up is the pacing smoother throughout: the 8h cap (→12h→24h via research) means a player can leave the longest expedition and the factory running overnight and return to a resolved expedition plus capped idle gold.

---

## 8. UI / UX & Responsive / Touch

The UI is a thin **render-and-dispatch** layer over the headless engine: it reads frozen snapshots and dispatches intents, never mutating engine state directly. Flat-fantasy art direction — **parchment / iron / gold** palette, CSS custom-property theme tokens, SVG icons.

**Screens (hash-routed, no deps):**
- **HUD (persistent top bar):** Gold / Research / Renown counters with live `/s` rates, a save-status indicator, and screen tabs. Currency strings are formatted from snapshot-derived fields.
- **Factory (`#/factory`) — the SVG node graph:** the core screen. Nodes are draggable machine cards; links are SVG paths with animated flow labels and "% of capacity / fed at Y%" indicators from the solver. A **Build Menu** palette places machines and picks recipes/assigned raws; a **Node Inspector** side panel shows the selected node's rate, level, and a live-cost **Upgrade** button.
- **Research (`#/research`):** an SVG/DOM tree of the 15 (+2) nodes with locked / available / owned states, costs, prereq edges, and a **Buy** action.
- **Expeditions (`#/expeditions`):** six territory cards showing required power vs. current hero power, duration, a **Launch** button (disabled below threshold with the gear-or-level nudge tooltip), and a live countdown on the active run.
- **Heroes:** roster with three equip slots (weapon/armor/accessory), a Renown **Level-Up** button, and a power readout broken down by gear + level.
- **Offline Summary:** a modal on load (only if elapsed > ~60s) listing gold/research/renown earned and any expeditions resolved while away.
- **Tooltips:** contextual one-shot onboarding (gold counter → upgrade → connect → research → expedition), dismissible, with seen-flags persisted in the save.

**Responsive & touch:**
- **Mobile-first** layout (flex/grid), with the HUD collapsing to a compact bar and panels becoming bottom-sheets on narrow screens.
- **Desktop:** mouse-drag to move nodes, drag from an output port to an input port to connect, scroll/drag to pan-zoom the graph.
- **Mobile:** **pan/pinch** the SVG canvas; connect via **tap-port-then-port** (tap a source output, then tap a target input). All touch hit-areas are **≥44px**. Pointer events are normalized through a single gesture layer (drag / pan / pinch / tap-port) so mouse/touch/pen share one code path.
- The Launch-disabled tooltip explicitly addresses **MINOR #7** — it must read like guidance ("Power too low — forge better gear *or level your hero*"), not a dead wall, since the +2-headroom T2 gate silently requires the first Renown level purchase.

---

## 9. Technical Architecture

Buildless vanilla JS, native ES modules, PascalCase files & dirs, no framework, no bundler, no big-number lib. The engine is a **pure, DOM-free state machine**; the UI is a thin render layer. One-way flow: **UI dispatches intents → engine mutates state → engine emits an immutable snapshot → UI renders the snapshot.** The engine never touches `window`, `document`, `localStorage`, or `Date.now()` directly — those arrive through injected adapters (`StorageAdapter`, `Clock`), so the entire engine is unit-testable under Node with zero shims.

### 9.1 File / Directory Tree

```
IdleKingdom/
├── Index.html                         Single entry; <div id="App"> mount + <script type="module" src="./Source/Main.js">.
├── Manifest.webmanifest               PWA manifest (relative paths; installable on mobile).
├── ServiceWorker.js                   Optional offline shell cache (relative URLs, no build step).
│
├── Source/
│   ├── Main.js                        Composition root: build adapters, load save, construct Game, mount App, start RAF loop.
│   │
│   ├── Engine/                         HEADLESS. No DOM, no globals, no Date.now — fully unit-testable in Node.
│   │   ├── Game.js                     Top-level facade: holds GameState, applies Intents, runs ticks, emits snapshots.
│   │   ├── GameState.js                Serializable state factory + invariants (NewGame seed, deep clone, freeze-for-snapshot).
│   │   ├── Intents.js                  Intent type constants + validators (PlaceNode, ConnectLink, UpgradeNode, BuyResearch, EquipItem, StartExpedition, ...).
│   │   ├── Reducer.js                  Pure (state, intent) -> state. The ONLY place state mutates from user input. Routes to systems.
│   │   ├── Snapshot.js                 Builds the read-only view object the UI consumes (derived fields baked in).
│   │   │
│   │   ├── Simulation/
│   │   │   ├── RateSolver.js           Steady-state DAG solver: topo sort -> demand pull -> supply push -> backpressure -> rates.
│   │   │   ├── Topology.js             Cycle detection (Kahn's), topo-order cache, link/port validity checks.
│   │   │   ├── Tick.js                 Advances stockpiles + currencies by solved rates over a dt; the per-frame integrator.
│   │   │   └── Offline.js              Offline catch-up: clamp dt to cap, integrate steady-state, fast-forward expeditions, build summary.
│   │   │
│   │   ├── Systems/
│   │   │   ├── EconomySystem.js        Market sink, gold/research tithe, sell-listing gating, upgrade-cost curve (base*1.15^level).
│   │   │   ├── ResearchSystem.js       Research-node graph: prereqs, costs, apply-unlock effects (recipes, listings, offline cap, bonuses).
│   │   │   ├── ExpeditionSystem.js     Timed runs: start gating (power>=req), countdown, on-complete rewards + territory reclaim.
│   │   │   ├── HeroSystem.js           Hero roster, equip-to-slot, heroPower computation, Renown-purchased levels.
│   │   │   └── ProgressionSystem.js    Territory reclaim -> applies interlock unlocks; win-condition check (all 6 reclaimed).
│   │   │
│   │   ├── Content/                     Static data-only modules (no logic). Canonical IDs/numbers from §3, §5, §6. SINGLE SOURCE OF TRUTH FOR IDs.
│   │   │   ├── Resources.js            5 raw + 4 intermediate + 4 component + 3 equipment goods; tiers, prices, icons.
│   │   │   ├── Machines.js             6 machine kinds; base output, rate-gain/level, upgrade base cost.
│   │   │   ├── Recipes.js              12 recipes: inputs{id:amt}, output, baseOut, crafterKind.
│   │   │   ├── ResearchNodes.js        15 backbone + 2 premium nodes: id, cost{research|renown}, prereqs[], effects[], gating.
│   │   │   ├── Territories.js          6 territories: requiredPower, durationMs, rewards, gear-tier unlock effects, flavor.
│   │   │   ├── Equipment.js            sword/armor/shield: slot, statType, baseStat, tier scaling.
│   │   │   ├── Heroes.js               Hero templates (hero_warden, hero_ranger, hero_smith): levelBonus per level, base power.
│   │   │   └── StartState.js           NewGame seed: pre-placed Miner->Smelter->Market, 25 gold, default listings/locks.
│   │   │
│   │   ├── Persistence/
│   │   │   ├── SaveManager.js          serialize(state)->json, deserialize(json)->state, runs migrations, validates version.
│   │   │   ├── Migrations.js           Ordered map {fromVersion: migrateFn}; chained to current SAVE_VERSION.
│   │   │   ├── StorageAdapter.js       Interface contract (JSDoc): get/set/remove. No impl.
│   │   │   ├── LocalStorageAdapter.js  Browser impl over window.localStorage (try/catch, quota-safe).
│   │   │   └── MemoryStorageAdapter.js In-memory impl for tests (no browser needed).
│   │   │
│   │   └── Clock.js                    Injectable time source: now()->ms, plus FakeClock for deterministic tests.
│   │
│   ├── UI/                             DOM + SVG ONLY. Reads snapshots, dispatches intents. Never mutates engine state directly.
│   │   ├── App.js                      Shell + hash router; owns active screen; subscribes to snapshots; tooltip layer.
│   │   ├── Router.js                   Tiny hashchange router (#/factory, #/research, #/expeditions); no deps.
│   │   ├── GraphView.js                SVG factory canvas: render nodes/links, pan/zoom, connect (mouse-drag + touch tap-port-then-port).
│   │   ├── GraphInput.js               Pointer-event normalizer: unifies mouse/touch/pen into drag/pan/pinch/tap-port gestures.
│   │   ├── Hud.js                      Top bar: gold/research/renown counters + rates, save indicator, screen tabs.
│   │   ├── BuildMenu.js                Palette of placeable machines + recipe pickers; emits PlaceNode/SetRecipe intents.
│   │   ├── NodeInspector.js            Side panel for selected node: rate, level, upgrade button (live cost), recipe/assigned-raw.
│   │   ├── ResearchTree.js             SVG/DOM tree of nodes: locked/available/owned states, cost, BuyResearch intent.
│   │   ├── ExpeditionBoard.js          6 territory cards: required power vs hero power, duration, launch button, live countdown.
│   │   ├── HeroPanel.js                Hero roster, equip slots (weapon/armor/accessory), level-up (Renown), power readout.
│   │   ├── OfflineSummary.js           Modal on load if elapsed>threshold: gold/research/renown earned, expeditions resolved.
│   │   ├── Tooltip.js                  Contextual onboarding tooltips; anchored, dismissible, one-shot flags persisted in save.
│   │   └── Render/
│   │       ├── Dom.js                  Tiny h()/patch helpers (keyed diff) so screens re-render cheaply without a framework.
│   │       └── Svg.js                  SVG element builders + viewBox transform math (screen<->graph coords) for GraphView.
│   │
│   └── Styles/
│       ├── Reset.css                  Minimal normalize.
│       ├── Theme.css                  Parchment/iron/gold flat-fantasy tokens (CSS custom properties).
│       ├── Layout.css                 Responsive shell, HUD, panels (flex/grid; mobile-first breakpoints).
│       └── Graph.css                  Node/link/port styling, drag-cursor, touch hit-areas (>=44px tap targets).
│
└── Tests/
    ├── Runner.js                       Zero-dep harness: describe/it/expect, async support, TAP-ish summary, exit code.
    ├── RunAll.js                       Imports every *.Test.js and runs; invoked by `node Tests/RunAll.js`.
    ├── RateSolver.Test.js              Solver correctness on the fixed starting graph + multi-input bottleneck graphs.
    ├── Tick.Test.js                    Integration of rates into stockpiles/currencies over known dt.
    ├── Offline.Test.js                 Catch-up math incl. 3-day gap clamped to 8h cap; expedition fast-forward; auto-sell dump.
    ├── SaveManager.Test.js             Round-trip serialize/deserialize equality + migration chain from v1.
    ├── ExpeditionSystem.Test.js        Start gating, completion rewards, territory reclaim + interlock unlock.
    ├── ResearchSystem.Test.js          Prereq gating, cost spend, effect application (unlock recipe/listing/offline cap).
    ├── Economy.Test.js                 Upgrade-cost curve, value-positivity of every recipe, sales tithe.
    ├── Progression.Test.js             Win condition fires only after all 6 territories reclaimed.
    └── Fixtures/
        ├── KnownGraph.js               Hand-computed expected-rate fixtures for the solver.
        └── SaveV1.json                 A legacy v1 save blob to exercise migration.
```

### 9.2 Save Schema

`SAVE_VERSION = 3` is a module constant in `SaveManager.js`. The persisted blob (IDs below are canonical — see **MAJOR #4 & #5 fixes**: recipe unlocks are owned solely by research, so a new game has only `r_iron_bar` unlocked; hero/territory IDs use canon `hero_warden` / `t_gatehouse`):

```json
{
  "version": 3,
  "savedAt": 1748736000000,
  "lastSeen": 1748736000000,

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
    "offlineCapHours": 8,
    "productionBonuses": { "gatherer": 1.0, "smelter": 1.0, "workshop": 1.0, "market": 1.0, "scholar": 1.0 }
  },

  "heroes": [
    { "id": "h_0", "templateId": "hero_warden", "level": 1, "equipped": { "weapon": null, "armor": null, "accessory": null } }
  ],

  "expeditions": {
    "active": { "territoryId": "t_gatehouse", "startedAt": 1748735900000, "durationMs": 120000, "heroId": "h_0" },
    "completed": []
  },

  "territories": {
    "reclaimed": [],
    "available": ["t_gatehouse"]
  },

  "meta": {
    "tutorialFlags": { "seenGoldTip": false, "seenUpgradeTip": false, "seenConnectTip": false },
    "won": false,
    "createdAt": 1748736000000,
    "playtimeMs": 0
  }
}
```

**Field notes:**
- `Content/*.js` is the **single source of truth for IDs**; the schema above is illustrative and must match it.
- Floats stored raw (continuous units/sec sim). No big-number encoding.
- `equipped[slot]` holds `null` or `{ "itemId": "sword", "tier": 1 }` — equipment is permanent slot data, never a consumed resource, so it lives on the hero, not a graph stockpile.
- `stockpile` is **sparse** — only resources a node has actually accrued (surplus-with-no-consumer).
- `expeditions.active` is a single object (MVP = one at a time) or `null`; the schema is forward-compatible with an array if a later territory unlocks a 2nd hero slot.
- `lastSeen` is the wall-clock stamp for offline catch-up; `savedAt` is diagnostic.
- The non-persisted cached solver result (`_solved`) is stripped before serialization.

**Migration (`Migrations.js`):** a plain ordered registry `{ 1: migrate1to2, 2: migrate2to3 }`; each fn takes a blob at version N → blob at N+1. `deserialize` parses, reads `blob.version` (default 1 if absent), chains every migration up to `SAVE_VERSION` (asserting +1 each hop), then runs `validate(state)` (required keys, finite currencies, node/link referential integrity) and falls back to a fresh `NewGame()` with a logged warning if validation fails — a corrupt save must **never** brick the page. Encoded deltas: `1→2` added `meta.tutorialFlags`; `2→3` split a flat `offlineCap` int into `unlocks.offlineCapHours` + `productionBonuses`. Each migration is fixture-tested.

### 9.3 Rate-Solver Pseudo-code (`RateSolver.js`)

```
function solve(state, content):
    order = Topology.topoSort(nodes, links)          # Kahn's; throws on cycle -> ConnectLink intent rejected

    function capacity(node):
        m = content.machines[node.kind]
        bonus = state.unlocks.productionBonuses[node.kind] or 1.0
        if node.kind == "gatherer": return (m.baseOutput + m.rateGain*(node.level-1)) * bonus
        if node.kind in {"smelter","workshop"}:
            r = content.recipes[node.recipeId]
            return (r.baseOut + m.rateGain*(node.level-1)) * bonus     # level adds to recipe BASE OUTPUT
        if node.kind == "market":  return (m.baseOutput + m.rateGain*(node.level-1)) * bonus   # shared across inputs; bonus carries res_trade_routes +30% & T3 +15%
        if node.kind == "scholar": return (m.baseOutput + m.rateGain*(node.level-1)) * bonus   # research/s, draws parchment 1:1

    availableOut = {}; linkFlow = {}; surplus = {}

    # --- Pass 1: forward in topo order; each node pulls from upstream supply ---
    for node in order:
        incoming = {}
        for L in links.where(to == node.id):
            offered = availableOut[L.from][L.resourceId] or 0
            incoming[L.resourceId] += offered
            linkFlow[L.id] = offered                                   # provisional
        cap = capacity(node)

        if node.kind == "gatherer":
            availableOut[node.id] = { node.resourceId: cap }
        elif node.kind in {"smelter","workshop"}:
            r = content.recipes[node.recipeId]
            limit = cap
            for (inId, amt) in r.inputs: limit = min(limit, (incoming[inId] or 0) / amt)
            out = max(0, limit)
            availableOut[node.id] = { r.output: out }
            node._draw = { inId: out*amt for (inId,amt) in r.inputs }
        elif node.kind == "scholar":
            out = min(cap, incoming["parchment"] or 0)
            node._draw = { "parchment": out }; node._researchRate = out
            availableOut[node.id] = {}
        elif node.kind == "market":
            sellable = {}; total = 0
            for (resId, amt) in incoming:
                if resId in state.unlocks.marketListings: sellable[resId]=amt; total+=amt
            scale = (total > cap and total > 0) ? cap/total : 1.0
            node._sold = { resId: amt*scale for (resId,amt) in sellable }
            node._goldRate = sum(node._sold[resId] * content.resources[resId].basePrice)
            node._researchRate = node._goldRate * state.unlocks.titheRate     # 0.05, ->0.07 via res_trade_routes
            availableOut[node.id] = {}

    # --- Pass 2: backpressure (reverse topo) -> decide destination (downstream link vs own stockpile) ---
    demand = {}
    for node in reverse(order):
        for L in links.where(from == node.id):
            wanted = drawWanted(L.to, L.resourceId)     # consumer's _draw / _sold share
            demand[(node.id, L.resourceId)] += wanted
            linkFlow[L.id] = min(linkFlow[L.id], wanted)
        for resId in availableOut[node.id]:
            surplusRate = max(0, availableOut[node.id][resId] - (demand[(node.id,resId)] or 0))
            if surplusRate > 0: surplus[node.id][resId] += surplusRate    # accrues to node stockpile in Tick
        # Pass 2 only decides where produced units GO; it does NOT reduce production
        # (producer fills its own bin when consumers are slow). DAG + infinite market sink => exact 2-pass solution.

    return { capacityByNode, availableOut, linkFlow, surplusRate: surplus,
             goldRate: Σ market._goldRate,
             researchRate: Σ scholar._researchRate + Σ market._researchRate,
             perNodeDraw }
```

**Key properties:** topo order guarantees upstream is solved first (single O(N+E) forward pass); bottleneck is exactly `min(capacity, min_i(supply_i/inputCost_i))`; backpressure decides *destination* not production, so surplus accrues to the node; Market is the infinite sink (never a supplier, sells listed inputs up to shared capacity scaling proportionally on overflow, emits gold + tithe). The result is cached on a non-persisted `state._solved` and re-run only on structural/level/recipe/unlock changes.

> **Build amendment (as implemented in `RateSolver.js`):** because the recipe graph requires **fan-out** (e.g. `iron_bar` feeds both `r_steel` and `r_fitting`), a producer's output is **conserved** — rationed across its outbound links by **capacity-weighted want** (`want = consumerCapacity × inputCost`; scholar/market `want = capacity`). If `Σwant ≤ output` each link gets its full want and the remainder accrues to the producer's stockpile; otherwise each link gets `output × want/Σwant` (proportional fair share). The sum of a producer's outbound link flows therefore never exceeds its output — no duplication at branch points. **Known MVP simplification:** when producers over-deliver to a single Market beyond its shared sell capacity, the unsold remainder is discarded at the sink (the Market does not back-pressure unsold goods into producer stockpiles); gold/research rates are exact regardless. The synthetic `inputCost === 0` divide is not guarded (all real recipes use positive integer costs and content is static).

### 9.4 UI ⇄ Engine Boundary

One-way flow, three verbs:
```
        dispatch(intent)                          emit(snapshot)
  UI ──────────────────────►  Game/Reducer ──────────────────────►  UI render
  (DOM/SVG events)            (pure mutation)     (frozen read-model)
```
- **Intents in.** Every user action is a plain validated object, e.g. `{type:"UpgradeNode",nodeId}`, `{type:"ConnectLink",from,to,resourceId}`, `{type:"BuyResearch",nodeId}`, `{type:"EquipItem",heroId,slot,itemId}`, `{type:"StartExpedition",territoryId,heroId}`, `{type:"PlaceNode",kind,resourceId?,pos}`, `{type:"SetRecipe",nodeId,recipeId}`, `{type:"SellFromStockpile",nodeId,resId}`. `Game.dispatch` → `Reducer(state,intent)`. The reducer **rejects illegal intents** (insufficient gold, cycle-creating link, power-too-low expedition, unmet research prereq) and returns the unchanged state plus a transient `lastError` the HUD flashes. Topology/economy-affecting intents trigger a `RateSolver.solve` and cache the result.
- **Snapshot out.** After any dispatch (and each tick) `Snapshot.build(state, solved)` produces a frozen (`Object.freeze`, structurally shared where unchanged) read-model with derived fields pre-computed: per-node effective rate & capacity %, per-link flow, hero power, expedition time-remaining, affordability booleans, formatted currency strings. The UI holds no engine references.
- **Subscription.** `App.js` registers one listener `game.onSnapshot(snap => render(snap))`. The engine emits after every accepted intent and at most once per animation frame (many ticks, one render).

### 9.5 RAF Loop & Autosave (`Main.js`)

```
const clock = new Clock();
const storage = new LocalStorageAdapter();
const game = new Game({ content, clock });

const offlineSummary = game.bootstrap(storage);   // load+migrate save, applyOffline, return summary
App.mount(document.getElementById("App"), game);
if (offlineSummary.appliedMs > 60_000) App.showOfflineSummary(offlineSummary);

let last = clock.now(); let acc = 0;
const STEP = 1000 / 20;                            // 20 sim Hz: smooth + cheap, decoupled from render

function frame() {
    const now = clock.now();
    let dt = now - last; last = now;
    if (dt > 250) dt = 250;                        // tab-throttle guard; real catch-up is the offline path
    acc += dt;
    while (acc >= STEP) { game.tick(STEP/1000); acc -= STEP; }   // fixed-step integration
    game.emitSnapshotForFrame();                   // one coalesced render per frame
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```
Fixed 20 Hz steps keep integration deterministic and frame-rate-independent; rendering is once per RAF tick regardless of sim-step count. Throttled background tabs produce a larger `dt` next frame (capped 250 ms); anything longer is reconciled by the **offline path** on the next real foreground load via `lastSeen`.

**Autosave:** interval autosave every ~10 s (`storage.set(KEY, SaveManager.serialize(game.getState()))`, stamping `savedAt` + `lastSeen`); `visibilitychange`→`document.hidden` saves immediately (likeliest mobile "leave" signal); `beforeunload`/`pagehide` does a final synchronous save. `lastSeen` is always written so the next offline delta is accurate; saves are debounced (~1 s) so a visibility flip + interval don't double-write. Writes are try/catch-wrapped (private-mode/quota) — a failed write flips a HUD "save failed" indicator rather than throwing.

---

## 10. Testing Plan

**Approach — zero-dependency, buildless.** `Tests/Runner.js` is a ~80-line harness exposing `describe/it/expect` with `toBe / toEqual / toBeCloseTo / toThrow / toBeTruthy`. Tests are plain ES-module files imported by `Tests/RunAll.js`; run with `node Tests/RunAll.js`. The engine's DOM-free design plus injected `FakeClock` and `MemoryStorageAdapter` means **every engine test runs in Node with no jsdom, no mocks, no transpile.** Float comparisons use `toBeCloseTo(expected, epsilon=1e-9)`. Exit code is non-zero on any failure (CI-friendly).

**Concrete tests:**

1. **Solver correctness — fixed starting graph** (`RateSolver.Test.js`)
   - Seed graph (Miner L1 → Smelter L1 `r_iron_bar` → Market L1): assert smelter throughput = 0.5 bar/s (ore 1.0 / inputCost 2, ≤ cap 0.5), `goldRate` = 0.5 × 4.0 = **2.0 gold/s**, `researchRate` = **0.10/s** — the §7 baseline.
   - Bottleneck: feed a Smelter only 0.6 ore/s → throughput 0.3 bar/s, not capacity.
   - Multi-input steel: `r_steel` fed 0.5 iron_bar/s + 0.10 coal/s → bottleneck = min(0.5/2, 0.10/1, cap 0.25) = **0.10 steel/s** (coal binding).
   - Surplus accrual: producer 1.0/s into consumer pulling 0.4/s → producer stockpile grows at **0.6/s**, link flow 0.4/s.
   - Market overflow: two inputs totaling 8/s into Market cap 5/s → proportional scale, total sold 5/s, gold = Σ(scaled × price).
   - Cycle rejection: a link that closes a loop → `Topology.topoSort` throws / `ConnectLink` rejected.

2. **Offline catch-up** (`Offline.Test.js`)
   - 2 h within 8 h cap → gold gained = 2.0 × 7200 = **14,400**, research = 720.
   - **3-day gap** with 8 h cap → `appliedMs` clamped to 8 h, `clamped:true`, gold = 2.0 × 28,800 = **57,600**.
   - Raised cap (`offlineCapHours = 24`), 3-day gap → clamp to 24 h.
   - Expedition fast-forward: active expedition finishing mid-gap → renown awarded, territory reclaimed, `active` cleared, summary lists it.
   - **Auto-sell long-offline dump (MINOR #11):** with `res_quartermaster` owned and a large stockpile after an 8 h offline window, assert the one-shot auto-sell gold is finite, correct, and applied exactly once.
   - Summary correctness: `gained.*` match before/after deltas; quick reload (<60 s) suppresses the summary.

3. **Save round-trip + migration** (`SaveManager.Test.js`)
   - Round-trip: `deserialize(serialize(state))` deep-equals original (floats via `toBeCloseTo`), incl. sparse stockpiles and `null` equip slots.
   - Migration: load `Fixtures/SaveV1.json` → result has `version:3`, `meta.tutorialFlags` (1→2), `unlocks.offlineCapHours` + `productionBonuses` (2→3), no data loss.
   - Corruption guard: malformed JSON / missing `currencies` → falls back to `NewGame()` without throwing.
   - `_solved` is stripped from the serialized blob.
   - **Canonical-ID guard (MAJOR #4/#5):** a new game's `recipesUnlocked` equals `["r_iron_bar"]` only; the seed hero `templateId` is `hero_warden`; the first available territory is `t_gatehouse`.

4. **Expedition resolution** (`ExpeditionSystem.Test.js`)
   - Gating: hero power 35, territory req 38 → `StartExpedition` rejected; level the hero to L2 (or equip higher gear) → power ≥ req → accepted.
   - Completion: advance `FakeClock` past duration → renown credited, territory → `reclaimed`, interlock unlocks applied (new gear-tier/listing/bonus present), graph re-solved.
   - **Power-curve regression (BLOCKER #2/#3):** assert each of the six §6.3 rows — best legitimately-available loadout at attempt N has `total ≥ required` using only gear unlocked by reclaims `< N`. Guards the off-by-one fix permanently.
   - Determinism: identical start state + clock → identical result twice (no RNG).

5. **Research + Economy** (`ResearchSystem.Test.js`, `Economy.Test.js`)
   - Prereq gating: buying a node whose prereq isn't owned → rejected; with prereq → spends research/renown, adds to `researchOwned`, applies effect.
   - **Equipment-chain reachability (BLOCKER #1):** assert `res_smithing` and `res_armory` are buyable with only `res_steelmaking` (+ `res_fittings` for armory) owned and **no territory reclaimed** — i.e. T1 gear is craftable before the first expedition.
   - Upgrade-cost curve: `cost(level) = base × 1.15^level` for several kinds/levels (exact float).
   - Value-positivity invariant: iterate **all 12 recipes**, assert output `basePrice` > Σ(input `basePrice` × amount) — machine-checks §3.4, including the thin-but-positive steel margin.
   - Sales tithe: Market selling X gold/s yields exactly `0.05X` (and `0.07X` after `res_trade_routes`) research/s.

6. **Win condition** (`Progression.Test.js`)
   - `checkWin` false with 5/6 reclaimed; reclaim the 6th → true, `meta.won` set, victory event emitted exactly once (idempotent on subsequent ticks).

These suites cover the load-bearing engine logic; UI is verified manually (DOM/SVG, responsive, touch-connect) since it carries no game-rule logic — all rules live in the headless, fully-tested engine.

---

## 11. Out of Scope / Future

Explicitly **not** in the MVP (reserved for post-launch):
- **Prestige / reset / NG+.** The MVP ends at the six-territory victory then continues as free-play; there is no reset layer, no meta-currency, no big-number library (numbers stay in normal JS float range by design).
- **Cloud sync / accounts.** Saves are local-only (`localStorage` via `StorageAdapter`); no server, no auth, no cross-device sync. The adapter seam makes a future cloud-storage impl drop-in.
- **Audio.** No music or SFX in MVP.
- **Fuller narrative.** Light flavor only (intro blurb, one-liners per territory/major research, victory epilogue). No branching story, dialogue trees, or characters beyond the three heroes.
- **`gemstone` consumption chain.** Mined post-T4 but unconsumed in MVP (sells for gold only); reserved for post-MVP accessory/premium-recipe content.
- **Parallel expeditions & active heroes 2/3.** MVP runs one expedition at a time and only the lead hero's power gates missions; heroes 2/3 are optional Renown sinks and post-MVP parallel-mission hooks. The `expeditions.active` schema is already array-ready.
- **Stockpile bin caps, node copies, advanced logistics.** Stockpiles are uncapped floats; scaling is by leveling nodes, not placing copies. A future research could add bin caps or splitters.
- **Single-pass completionist Renown.** Buying *all* optional content in one linear run is intentionally not funded (see §6.4); it's a free-play goal.

---

## 12. Open Questions

Items the design deliberately leaves unresolved for a tuning/playtest pass rather than papering over:

1. **Single-pass completionist Renown (from MAJOR #6).** The required victory path is funded (205 earned vs 75 needed), but buying both optional heroes (120) **and** both premium Renown nodes (90) needs 285 — short by 80 in one pass. **Decision needed:** accept this as a free-play farming goal (current stance), or raise T6's Renown reward (70 → ~150) to enable a single-pass 100% clear. Affects only optional content, not winnability.

2. **`gemstone` payoff (from MINOR #9).** The T4 `gemstone` unlock is currently "a better gold raw" with no consuming recipe. **Decision needed:** ship it as-is (a pure gold sink, honest but underwhelming as a reclaim reward), or add a small post-MVP `accessory`/`gem`-consuming recipe to make the T4 reward feel like new content. Would add 1 resource + 1 recipe beyond the locked budget.

3. **Steel-chain friction (from MINOR #8).** Steel's margin is intentionally thin (+1.12 gold/s) to make it a throughput chokepoint requiring a parallel coal sub-chain. **Confirm in playtest** that this friction reads as satisfying gating rather than tedium; if it stalls, the lever is steel base sell 14 → ~16 or steel base-out 0.25 → 0.30 (both keep value-positivity).

4. **Premium-node count vs. budget (from MINOR #10).** The tree ships 17 nodes (15 + 2 premium) vs the ~15 budget. **Decision needed if a hard cap is enforced:** keep both premium nodes (current stance), drop `res_quartermaster`, or fold `res_war_college` into a territory reclaim reward.

5. **Offline mid-fill overpay (from MINOR #11).** Steady-state offline integration slightly overpays a chain left with empty buffers (assumes full flow from t=0). Per the locked rate-based decision this is accepted; **confirm** it's not exploitable by deliberately leaving chains empty before logging off (expected: negligible, since the overpay is bounded by one buffer-fill's worth of throughput).

6. **Second-hero power contribution.** MVP gates expeditions on the **lead hero only**; heroes 2/3 don't add to the gating power. **Open for post-MVP:** whether parallel heroes run simultaneous expeditions, sum power for a single mission, or remain flavor — the `expeditions.active` array-ready schema supports any of these without a migration.
