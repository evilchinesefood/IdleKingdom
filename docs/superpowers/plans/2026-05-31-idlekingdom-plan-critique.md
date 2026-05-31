# IdleKingdom — Plan Critique

I have completed my adversarial review. All numbers verify, all named acceptance tests are present, but I found several real defects. Here are my findings.

# PLAN REVIEW — IdleKingdom Implementation Plan

## COVERAGE: COMPLETE

Every named acceptance test maps to a task (all verified PRESENT, math re-derived and confirmed): solver baseline 2.0 gold/s & 0.10 research/s [P2 T2.5], offline 3-day clamp→8h=57,600 [P3 T3.4], save migration v1→v3 [P3 T3.2/3.3], equipment-chain reachability BLOCKER#1 [P4 T4.2], 6-row power-curve regression BLOCKER#2/#3 [P4 T4.5, headrooms +5/+2/+13/+15/+18/+10 confirmed], value-positivity of all 12 recipes [P1 T1.8 + P4 T4.1, all POS confirmed], win-at-6/6 idempotent [P4 T4.4]. Plus bottleneck (0.3), steel coal-bound (0.10), market overflow (0.625→11.25), cycle rejection, auto-sell dump, corruption→NewGame, canonical-ID guard, tithe 0.05→0.07. No coverage gaps.

## FINDINGS (prioritized)

**BLOCKER — none.** No defect blocks the engine suite from going green or breaks a tested invariant.

**MAJOR #1 — `Main.js` autosave will crash (`SaveManager` not exported).** `Source/Main.js` [P5 T5.10] does `import { SaveManager, SAVE_KEY } from "./Engine/Persistence/SaveManager.js"` then calls `SaveManager.serialize(...)`. But `SaveManager.js` [P3 T3.1] exports *named* `serialize`/`deserialize`/`SAVE_VERSION`/`SAVE_KEY` — there is no `SaveManager` export. `SaveManager.serialize` → `TypeError: Cannot read properties of undefined`, breaking every autosave + the `pagehide`/`visibilitychange` final save. **Fix:** `import { serialize, SAVE_KEY } from "./Engine/Persistence/SaveManager.js"` and call `serialize(game.getState())`. (Browser-only; not caught by `node Tests/RunAll.js`.)

**MAJOR #2 — `res_lumber`/`res_tannery` push bogus machine kinds.** `ResearchSystem.EFFECTS` [P4 T4.2] maps `res_lumber → {type:"unlockMachine",kind:"forester"}` and `res_tannery → kind:"trapper"`, and `applyEffects` pushes `e.kind` into `machinesUnlocked`. The engine kind is `"gatherer"` (forester/trapper are cosmetic variants per Machines.js / contract §2.2). Result: `machinesUnlocked` gains `"forester"`/`"trapper"`; `BuildMenu.placeableMachines = machinesUnlocked.slice()` lists them; `PlaceNode kind:"forester"` creates a node whose `capacity()` returns 0 (solver only knows the 5 real kinds). Contract §2.4 annotates these as `unlockMachine forester *(gatherer)*` — i.e. the gatherer kind, not a literal new kind. **Fix:** make these effects unlock `kind:"gatherer"` (idempotent, already present) or drop the `unlockMachine` for variants and instead rely on the recipe unlock; do not push variant labels into `machinesUnlocked`.

**MAJOR #3 — `Tests/Format.Test.js` is created twice / two overlapping `Format` modules.** P5 T5.1 creates `Source/UI/Render/Format.js` (`formatNumber`/`formatRate`) + `Tests/Format.Test.js`. P6 T6.1 creates `Source/UI/Format/Format.js` (`fmtNum`/`fmtRate`/`fmtCountdown`/`fmtCost`/`affordClass`) + **another** `Tests/Format.Test.js` at the same path. The second `Write` overwrites the first; the P5 test silently vanishes from the suite, and two near-duplicate formatters exist (`Hud.js` imports the P5 one, all P6 panels import the P6 one). **Fix:** consolidate on one module/path (recommend `Source/UI/Render/Format.js` per contract §1 file tree, which lists only `Render/Dom.js` + `Render/Svg.js` — `Format/` is not in the tree at all), give the P6 test a distinct name, and have `Hud.js` use the same exports.

**MAJOR #4 — `node Tests/RunAll.js <Filter>` never filters; filtered expected-outputs are wrong.** `RunAll.js` [P1 T1.3, unchanged through all phases] is `import "./X.Test.js"; … run()` with no `process.argv` handling. P1 T1.4 Step 3 explicitly defers filtering "to a later phase," but no later phase ever wires it. So every `node Tests/RunAll.js Topology` / `… RateSolver` / `… Economy` runs the **entire** suite. The "expect FAIL" steps still work (a missing-module import throws at load → whole run fails, nonzero exit), but the green expected-output blocks that show only the filtered suite's lines and a small count (e.g. P2 "3 passed, 0 failed", "8 passed", "20 passed") will not match reality once earlier suites exist — the real summary is cumulative. **Fix:** either implement an argv substring filter in `RunAll.js` (filter the `registry` in `Runner.run`), or change every filtered command to plain `node Tests/RunAll.js` and update the expected counts to cumulative/"0 failed".

**MINOR #1 — `_topo` cache leaks into clones and saves.** `Topology.orderFor` [P2 T2.2] writes `state._topo = {sig, order}`. But `GameState.clone` [P1 T1.8] and `SaveManager.serialize` [P3 T3.1] strip **only** `_solved`. So the cached topo order is JSON-cloned into every reduced state and serialized into every save (bloat; self-heals via sig recompute, so not a correctness bug). **Fix:** strip `_topo` alongside `_solved` in both `clone` and `serialize`, or store the topo cache on `_solved`.

**MINOR #2 — `SetGathererResource` hardcodes raw IDs.** Reducer [P4 T4.7] allows `["iron_ore","timber","hide"]` as always-startable via a literal array, violating the contract's "no ID literals outside Content/StartState/tests." **Fix:** derive the startable set from `GATHERER_VARIANTS` in Machines.js. (Also makes the forester/trapper unlocks of MAJOR #2 genuinely decorative.)

**MINOR #3 — Every accepted intent re-solves.** `Reducer.reduce` clones via JSON (dropping `_solved`); `Game.dispatch` then always calls `_ensureSolved()`, so even non-structural intents (`EquipItem`, `DismissTooltip`, `LevelUpHero`) trigger a full re-solve. Spec §4.2 says re-solve only on topology/level/recipe/unlock change. Idempotent and cheap on a small graph — perf nit, not a bug. **Fix (optional):** preserve `_solved` across the clone for non-structural intents.

**MINOR #4 — `HeroPanel` manual-step text self-contradicts.** P6 T6.7 Step 5 says the Warden shows "Power 0 (gear 0 + level 0)" then corrects to "L1 = 5." Impl is `gear + level*5` → 5. Doc wobble only.

## PLACEHOLDERS
None. Every code step contains real, complete code — no TBD/TODO/"similar to above". Conditional steps (P4 T4.3 `itemStat`, P6 T6.2 `Snapshot` extension) are explicitly gated and self-contained.

## TYPE/NAME CONSISTENCY
Mostly faithful to the contract. Drifts: MAJOR #1 (`SaveManager` namespace vs named exports), MAJOR #2 (`forester`/`trapper` as machine kinds), MAJOR #3 (`Format/` dir not in contract file tree; contract has only `Render/Dom.js`+`Render/Svg.js`). All other signatures/paths (`solve`, `capacity`, `applyTick`, `applyOffline`, `reduce`, `Snapshot.build`, `Game` facade, system functions, intent field names incl. `BuyResearch.nodeId`) match the contract verbatim.

## TDD ORDERING
Correct throughout. Every unit follows write-failing-test → run-expect-FAIL → minimal-impl → run-expect-PASS → commit. P1 T1.1 (skeleton) and the CSS/Main/UI-wiring tasks are appropriately exempt (manual verification per spec §10). Commits are present at every task.

## DEPENDENCY ORDER
Clean. Each phase consumes only earlier artifacts: P2 uses P1 Content/GameState/Clock/Runner; P3 uses P1–P2 (solve, applyTick, systems referenced by Offline are built in P4 — **note:** P3 T3.5/T3.6 `Offline.js` imports `ExpeditionSystem.tryResolve` and `EconomySystem.isListed`, which are built in **P4**). The plan's P3 preamble explicitly states "this phase assumes Phase 4 … ExpeditionSystem.tryResolve, EconomySystem.sellFromStockpile … available" — so P3 depends on P4. This is a **forward reference / phase mis-ordering** (P3 numbered before P4 but depends on it). Functionally fine if executed P1→P2→P4→P3→P5→P6, but as numbered, P3 cannot complete green before P4 exists. **Fix:** either swap P3/P4 numbering, or stub `tryResolve`/`isListed` in P3 and complete them in P4. (Calling this MINOR since the plan flags the dependency explicitly, but flag it for the assembler.)

## SCOPE
No contradictions with the locked MVP. File tree matches contract §1 except the unplanned `Source/UI/Format/` dir (MAJOR #3) and `Source/UI/Logic/` (P6 T6.2 — also not in the contract tree, but a reasonable pure-helper home; MINOR). Resource count note in spec §9.1 ("5 raw + 4 intermediate") is a known spec typo the contract corrects to 17/5-intermediate; the plan correctly implements 17 with 5 intermediates.

---

**VERDICT: FIX-FIRST** — 4 must-fix MAJOR (P5 T5.10 SaveManager import; P4 T4.2 forester/trapper kinds; P5 T5.1 / P6 T6.1 duplicate Format test+module; RunAll filtering vs expected-outputs across P1–P4) + 1 must-acknowledge phase-ordering dependency (P3→P4); MINORs optional.
