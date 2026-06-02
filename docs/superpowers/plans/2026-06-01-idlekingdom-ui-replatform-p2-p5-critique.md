# IdleKingdom UI Re-platform P2–P5 — Cross-phase Critique

Confirmed. The FakeEl `.text` getter recurses through childNodes, so `wa-option` text (icon vnode + ` ${res.display} T${tier}` string child) will join correctly — `o.text` includes the display name and `T1`. The P4 Task 4.5 migration to `wa-option` is sound: after migration, `optText` reads `wa-option` children, the T1 option's text contains the display name (regex `/T1$/` and `/[A-Za-z]/` pass), and `sel.onchange({target:{value:"1"}})` dispatches `EquipItem tier:1`. ✓

One nuance: the P4 HeroPanel `wa-option` for a tier renders `icon(itemId), \` ${res.display} T${tier}\``. The `.text` join would be `"<icon-text> Sword T1"`. The icon `<i>` vnode has no text children, so `o.text` = `" Sword T1"`. The `/T1$/` regex matches (ends in "T1"). ✓ Good.

I now have comprehensive verification. Let me compile the final prioritized findings.

## Cross-Phase Consistency Review — IdleKingdom UI Re-platform (P2–P5)

I read the spec, the P1 plan, all four phase plans (P2–P5), and verified every load-bearing claim against the actual source: `Dom.js`, `Hud.js`, `Snapshot.js`, `RateSolver.js` (at `Source/Engine/Simulation/`), `GraphView.js`, `GraphInput.js`, `Intents.js`, `App.js`, the current panels, `Tests/PlaythroughProbe.mjs`, `Tests/Snapshot.Test.js`, and `Tests/Fixtures/Seeded.js`.

**Repo-state context (affects all phases):** On disk, `Dom.js` has NO `onWa*`/`prop:`/`__waEvents` extensions, `fmtCost` still embeds emoji, `Hud.js`/`GraphView.js` still use emoji, and `ServiceWorker.js` is at `idlekingdom-v3`. So P1 is genuinely unapplied. Every P2–P5 plan correctly treats P1 (and prior phases) as prerequisites with explicit verify-or-STOP gates. This is correct, not a defect.

---

### PHASE 2 (HUD + Tabs)

- **MINOR — Task 2.1 Step 2, `size: "l"` is not a valid Web Awesome size token.** WA v3 `wa-tag`/`wa-button` `size` enum is `small|medium|large`, not `l`/`s`. The spec uses `size=l` as shorthand; the plan copies it literally. Result is a silent fall-back to default size (no break, no probe impact). Fix: use `size: "large"`. (Cross-phase: P4 already uses `"small"` correctly — P2/P3/P5 are the outliers; see the global note below.)
- **PASS — everything else.** `startIcon()` correctly sets a real `slot:"start"` prop instead of abusing `icon()`'s `extraClass` (verified `applyProps` routes `slot` through `setAttribute`, and `extraClass` only appends to `class`). `prop:active`/`onWaTabShow` consume P1 paths without touching `Dom.js`. Probe migration `.hud-tabs a` → `.hud-tabs wa-tab` + `wa-tab[panel="…"]` + `wa-tab-panel===0` matches the real assertions at probe lines 481–496 and the selector engine (`[attr="v"]`, descendant) supports it. SW v5 is sequential. Render cadence preserved (keyed group, no resize JS).

**Verdict: READY** (0 must-fix; 1 cosmetic size-token nit shared across phases)

---

### PHASE 3 (Factory panels + node/link items)

- **PASS — Task 3.1 (TDD) is solid.** `Snapshot.Test.js` really imports `seededState`, `FakeClock`, `solve`, `build`, builds a local `content`, and `NewGame` exists in `GameState.js`. Seed node IDs (`n_miner_0`/`n_smelter_0`/`n_market_0`) and link IDs (`l_0`/`l_1`) match `Fixtures/Seeded.js` exactly. The `graphState` helper faithfully mirrors the Seeded.js `graph` shape + `delete s._solved`. The Snapshot edit replaces the real `nodes.map` block (lines 29–50) and keeps `effectiveRate`/`draw`/`surplus` semantics. Failing-test-first → real code → full-suite gate is correct.
  - **NIT (sub-MINOR) — Task 3.1 Step 1, `graphState` uses `nextNodeSeq: nodes.length`** whereas Seeded.js uses `nextNodeSeq:1, nextLinkSeq:2`. Irrelevant to solving (solver reads topology, not seq counters); harmless.
- **PASS — B1 hit-test routing.** `GraphInput` stores callbacks as `this.cb`; the plan's `this.cb.hitLink`/`onSelectLink`/`onSelect` and the `_down`/`_up` edits match the real method bodies (the `_up` reset block already has `this.connectFrom = null;` to append `this.downLink = null;` beside). `TAP_MOVE_PX` exists. The B1 probe test's midpoint math (300,232) correctly lands between node boxes so `hitNode` returns null and the link path is reached; `gv.input`/`gv2.input` is the real field name (GraphView line 41).
- **PASS — Task 3.4 link block** targets the real imperative `svg("g")` per-link map (lines ~204–254, NOT an `h()/patch` path) and the `cap-fill` rect; `this.game.dispatch` is valid because the probe passes `mg` (a `Game`) as the GraphView `game`. Probe RemoveLink migration correctly reveals via `gv._selectLink(...)` before locating `.link-delete`.
- **MINOR — `size: "s"` invalid token** (Task 3.2 line 241, Task 3.3 lines 405/431). Same as P2: use `"small"`. Non-breaking.

**Verdict: READY** (0 must-fix; 1 cosmetic size-token nit)

---

### PHASE 4 (Research / Expeditions / Heroes)

- **MINOR — `fmtCost` is called 2-arg but P1 made it 1-arg.** P4 calls `fmtCost(r.cost, r.currency)`, `fmtCost(hero.levelCost, "renown")`, `fmtCost(tpl.unlockRenownCost, "renown")`. After P1's fix (`fmtCost(amount /*, currency */)`), the 2nd arg is silently ignored and no emoji leaks (P1 removes all `CURRENCY_GLYPH` use). So this is functionally correct but stylistically stale — passing a dead arg. Recommend dropping the 2nd arg for consistency with P3 (`fmtCost(node.upgradeCost)`). Not a blocker.
- **PASS — probe migration is the right surface.** Real probe STEP 5 (line 839) and STEP 7 (line 1040) use `querySelectorAll("option")`; migrating to `wa-option` is exactly correct because the selector engine matches by `localName`. Verified FakeEl `.text` recurses children, so `wa-option` label `" {display} T{tier}"` still passes the `/T1$/` + `/[A-Za-z]/` and no-`undefined` assertions, and `sel.onchange({target:{value:"1"}})` dispatches `EquipItem tier:1`. All retained classes (`.res-node`/`.res-buy`/`.exp-card`/`.exp-launch.affordable`/`.exp-launch.locked`/`.exp-nudge`/`.hp-equip`/`.hp-levelup`/`.hp-recruit`/`.hp-power`) match the current files. `{ el: edgeLayer(), key: "res-edges" }` passthrough preserved byte-identical (verified `isPassthrough` in Dom.js).
- **PASS — `size: "small"` is the correct WA token here** (P4 is the one phase that got it right). SW v7 sequential. M3 snap-back + keyed selects + browser-acceptance present.

**Verdict: READY** (0 must-fix; 1 stylistic dead-arg nit)

---

### PHASE 5 (Modals + Tooltips + Polish)

- **PASS — overlay re-platform is sound.** Current `OfflineSummary` (`#OfflineSummary`, `.os-close`, `expeditionsResolved`/`appliedMs`/`clamped`/`gained`), `Victory` (`#Victory`, `.victory-close`, `.victory-text`), and `Tooltip` (`#TooltipLayer`, `.tip-text`, `.tip-dismiss`, the verbatim `TIPS` object) all match the rewrites. `App._flashError` (lines 196–201) matches the exact text P5 Task 5.4 replaces; App imports `patch` (line 4) and not `icon` yet (P5 adds both `h` and `icon`). `_mountScreen` factory branch matches Task 5.5 Step 3 verbatim. `onWaHide`/`prop:open` consume P1 paths. Probe STEP 8 emoji migration to `.os-gain` + `i.fa-coins` is valid (selector engine tokenizes `i.fa-coins` into tag `i` + class `fa-coins`, and P1's `icon("gold")` emits `fa-coins`). The two-step Tooltip icon edit (Step 1 plants `icon("info","tip-icon"),`, Step 2 swaps that unique line) is internally consistent.
- **MINOR — Task 5.3 Tooltip keeps dead `.hud-tabs a[href="#/research"]` anchors.** After P2 the tabs are `wa-tab[panel="research"]`, not `<a href>`. Verified App does NOT read `data-anchor` (positioning is pure CSS), so these anchors are cosmetically inert and harmless — but they're now-wrong selectors carried forward. Recommend updating to `wa-tab[panel="research"]`/`wa-tab[panel="expeditions"]` for correctness, or note them as vestigial.
- **MINOR — `size: "s"`/`size: "l"` invalid tokens** in OfflineSummary `wa-tag`s and the Tooltip `wa-button` (`size: "s"`). Same fix: `"small"`/`"large"`.
- **PASS — SW v8.** Task 5.7 correctly instructs matching the actual current `CACHE` value and targeting v8 (acknowledging the repo is at v3, not v7) — robust against the unapplied-prior-phase reality.

**Verdict: READY** (0 must-fix; 2 cosmetic nits — dead anchors + size token)

---

### Cross-cutting observations
- **Convention consistency: PASS.** Every phase reuses P1's `icon()`/`iconName()`, `onWa*`/`prop:` (no redundant `Dom.js` edits in P2–P5), keys all selects/dialogs/callouts, preserves semantic classes, locks render cadence, and touches the engine only via P3's additive Snapshot fields. All INTENT names used (`PlaceNode`, `UpgradeNode`, `SetRecipe`, `SetGathererResource`, `SellFromStockpile`, `RemoveNode`, `RemoveLink`, `BuyResearch`, `EquipItem`, `StartExpedition`, `LevelUpHero`, `RecruitHero`, `AckVictory`, `DismissTooltip`) exist in `Intents.js`.
- **WA-API accuracy: one systemic nit.** The only invented/incorrect API usage is the `size: "s"`/`"l"` shorthand (P2, P3, P5) vs the valid WA enum `small|medium|large` (P4 got it right). Non-breaking (WA ignores invalid enum → default size) but it's a genuine cross-phase inconsistency. Events (`wa-tab-show`, `wa-hide`, plain `onchange`) are all used correctly per the spec.
- **Dependency order: PASS.** P3 Snapshot-fields task (3.1) lands before the UI that consumes `atCapacity`/`starved`. SW versions are strictly sequential (P2 v5 → P3 v6 → P4 v7 → P5 v8). No phase depends on a later phase.
- **TDD/real-code/testing-reality: PASS.** P3 has the only node-testable logic (Snapshot fields) with failing-test-first + real code + 262-total gate. All WA/DOM tasks have real full-file code, `node --check`, probe migrations, and concrete human browser-acceptance steps. M2 (correct-value) and M3 (reducer-reject snap-back) browser checks are present in P3 and P4. No TBD/TODO/"similar to" placeholders; every task ends in a conventional commit.
- **Coverage: PASS.** Every spec §6 surface is implemented across the phases (HUD/tabs P2; BuildMenu/NodeInspector/GraphView node+link P3; ResearchTree/ExpeditionBoard/HeroPanel P4; OfflineSummary/Victory/Tooltip/error-flash + legend P5). Nothing from §6 is missed.

---

### Final verdicts
- **P2 — READY** (0 must-fix)
- **P3 — READY** (0 must-fix)
- **P4 — READY** (0 must-fix)
- **P5 — READY** (0 must-fix)

All four phases are implementable as written. The only recommended polish (not blocking): normalize the `size` token to WA's `small`/`large` enum in P2/P3/P5 to match P4; drop the now-unused 2nd `fmtCost` arg in P4; and refresh P5's vestigial `.hud-tabs a[href]` tooltip anchors to `wa-tab[panel="…"]`.
