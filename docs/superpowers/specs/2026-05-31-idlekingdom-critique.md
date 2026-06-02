# IdleKingdom — Design Critique (findings applied during synthesis)

I have a complete, verified picture. Compiling findings.

# IdleKingdom — Adversarial Consistency / Balance / Fun Review

## BLOCKERS (must fix — game is unwinnable / contradicts itself as written)

**1. T1 reclaim ⇄ equipment circular deadlock (the central interlock is broken).**
`res_smithing` (unlocks `r_blade`/`r_plating`) and `res_armory` (unlocks `r_sword`/`r_armor`/`r_shield`) are BOTH flagged **Territory-gated (T1)** in RESEARCH. But T1 = `t_gatehouse` (req power **30**) is the *first* territory, and TERRITORY §2 + ECONOMY §6 say the player must **craft a T1 sword/armor/shield to clear it**. You can't craft equipment until after the T1 reclaim, and you can't do the T1 reclaim without equipment. A gearless hero is L1 = **5 power** (`0 + 1*5`), and the only renown source is expeditions, so there's no pre-T1 way to buy levels to 30 either. **Unwinnable.**
*Fix:* make `res_smithing` + `res_armory` **Research-purchasable** (gated only by `res_steelmaking`, not by a territory). Let the player research the equipment chain off the pure-factory economy, craft T1 gear, then attempt `t_gatehouse`. Reserve the territory gating for the *higher gear tiers* only.

**2. T6 final boss is mathematically unbeatable with legitimately-available gear.**
TERRITORY §3's "T6 attempt" assumes loadout **T3/T3/T3** = 90 gear + 30 level = 120 (req 110). But §1 says **T3 armor unlocks on the `t_blackkeep` (T6) reclaim itself** — i.e. only *after* you've already won. The best armor available *at the T6 attempt* is T2 (stat 24). Real best loadout: T3 sword 30 + T2 armor 24 + T3 shield 24 + L6 bonus 30 = **108 < 110**. **The win gate cannot be cleared.**
*Fix:* either move T3 armor to unlock on the **T5** reclaim, or lower `t_blackkeep` required power to ≤108 (e.g. 105), or raise the hero level bonus. Recommend unlocking T3 armor at T5 alongside T3 sword/shield (gives 120 vs 110, the intended +10 headroom).

**3. Gear-tier availability is off-by-one against every attempt in the power-curve proof.**
The §3 proof assumes the gear tier unlocked by reclaiming territory N is usable *on the attempt for territory N*. It isn't — you fight a territory with the gear you have *before* reclaiming it. Concretely, T2 sword/shield "unlock on reclaiming `t_oldmarket` (T3)," yet the **T3 attempt** row already equips T2 gear. With only-T1 gear actually available, the T3 attempt is T1/T1/T1 + L3 = **45 < req 50 → FAIL**. The whole monotonic-headroom table is built on gear the player doesn't yet possess at the moment of each launch.
*Fix:* shift every gear-tier unlock one territory earlier (T2 sword/shield on the **T2/Smithy Ward** reclaim — which §1's flavor text already half-claims via "T2 component grind"; T2 armor on **T3**; T3 sword/shield on **T4**; T3 armor on **T5**), then re-validate the §3 table. This also resolves Blocker 2.

## MAJOR

**4. Three documents disagree on how `r_plank`/`r_leather`/`r_coal` unlock.**
RESEARCH gates them behind `res_lumber`/`res_tannery`/`res_coalworks`. ECONOMY §6 says they're recipe-selectable once the gatherer's raw flows. TERRITORY §1 says `t_gatehouse` reclaim "Unlocks `forester`+`trapper` and Smelter recipes `r_plank`, `r_leather`." And TECH's save sample pre-lists `["r_iron_bar","r_plank","r_leather","r_coal"]` as already-unlocked at new-game. Four conflicting unlock sources for the same recipes.
*Fix:* pick ONE owner. Cleanest: research nodes own all recipe unlocks (`res_lumber`→`r_plank`, etc.); strike the duplicate grants from TERRITORY §1 and from the TECH start-state. Update the save sample to `["r_iron_bar"]` only.

**5. TECH save schema uses non-canonical IDs (dangling references).**
The §2 sample blob references `templateId:"captain"` (canon: `hero_warden`), `territoryId:"t_outerwall"` and `available:["t_outerwall"]` (canon T1: `t_gatehouse`). The brief states IDs are canonical and the foundation contract pins them. An implementer copying the schema seeds the wrong IDs.
*Fix:* replace with `hero_warden` and `t_gatehouse` throughout the sample; add a one-line note that `Content/*.js` is the single source of truth for IDs.

**6. §3 completionist Renown claim is arithmetically wrong.**
Total Renown earned = **205**; required leveling to L6 = **75**; surplus = **130**. §3 says 130 is "enough to also buy both optional hero unlocks (40+80) **and** a small premium research." But hero2+hero3 = 120 leaves only 10, and the two Renown research nodes cost **30+60 = 90** more. Completionist needs 75+120+90 = **285 vs 205 earned → short by 80.** (The *required* path is fine; only the surplus claim is false.)
*Fix:* either raise late Renown rewards (e.g. T6 70→150), or honestly state that completionist (both heroes + both Renown nodes) requires post-victory free-play farming, not a single linear pass.

## MINOR

**7. T2 power gate headroom is +2 and depends on a forced Renown purchase.** `t_smithyward` (req 38) is cleared only as T1/T1/T1 + **L2** = 40. The 10 Renown from T1 funds L2 (cost 5), so it works, but it's the tightest gate and silently *requires* spending Renown — fine as a teaching beat if the UI explicitly tells the player "level your hero," otherwise it reads as a wall. Confirm the §4 "power too low" tooltip nudges toward leveling, not just gear.

**8. Steel margin is thin and steel needs a parallel coal sub-chain.** Crafting steel nets only **+1.12 gold/s** over selling its inputs (bar+coal), vs blade (+2.7), sword (+7.9). Verified positive, so not loss-making, but steel is a deliberate throughput chokepoint requiring the player to *also* stand up a coal miner + `r_coal` smelter just to feed it. Confirm this friction is intended; if not, bump steel base sell from 14 to ~16, or steel base-out from 0.25 to 0.30.

**9. `gemstone` is a fully dead resource in the MVP.** Raw, sells 3.0, mined only after T4, and **no MVP recipe consumes it** (admitted in §4). It's pure inventory clutter until post-MVP. Acceptable as a sink (sell for gold), but note no accessory/premium recipe actually exists, so the T4 "gemstone mining" unlock is just "a slightly better gold raw" — underwhelming as a reclaim reward.

**10. Count drift vs budget.** ECONOMY §2 header says "Tier 2 — Component **(3)**" but lists **4** (`steel`,`blade`,`plating`,`fitting`) → 16 resources total vs the ~15 budget. RESEARCH ships **17** nodes vs ~15. Both within "~" tolerance and self-flagged, but fix the literal "(3)" header so it matches its own table.

**11. Offline integrates steady-state from t=0, ignoring stockpile fill/drain transients.** Per the LOCKED rate-based decision this is intended, but two edge cases the TECH pseudocode glosses: (a) a chain left *mid-fill* (empty buffers) is *overpaid* offline since steady-state assumes full flow from second 0; (b) `res_quartermaster` auto-sell + uncapped offline stockpiles (e.g. 144k units after 8h at 5/s) produces a large one-shot gold dump on the load that enables it. Neither breaks anything (floats are safe), but worth a design note and a test for the auto-sell-after-long-offline case.

**12. §4 prose mislabels chain depth.** Text says equipment is "raw → T1 → component → equipment" (3 steps); the real shortest path is ore→bar→steel→blade→sword = **4 craft steps**. The "depth 4" claim is correct; the 3-arrow prose isn't. Cosmetic.

## Things that correctly check out (anti-FUD)
- All 12 recipe inputs trace to obtainable raws; DAG is acyclic; **every recipe is gold-positive** vs both raw and immediate-input cost (verified). Crafting up always beats selling inputs in gold/sec at equal flow.
- §7 opening pacing reproduces: ~9–11 research banked at **t≈60s**, so a 9-cost first node lands on target.
- Research tree totals 10,089 research; clears in a "few hours" of mixed active/offline play at realistic income (steel spine ~219, capstone reachable in ~20 min at mid-game ~4 res/s).
- Renown is meaningfully both earned (expeditions only) and spent (mandatory hero levels gate the power curve) — no dead currency.
- Tier stat formulas (`10/12/8 × tier`) are internally consistent across all three documents.

---

**VERDICT: FIX-FIRST — 3 blockers (#1 unwinnable T1 deadlock, #2 unbeatable T6, #3 off-by-one gear-tier availability) plus 3 majors must be resolved before implementation.**
