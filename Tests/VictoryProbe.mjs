// Headless scripted engine->victory probe (NOT a unit suite; run directly).
// Drives the Game facade via dispatches + clock advances + ticks to prove the
// engine reaches VICTORY through the SIEGE loop: the player musters an army in
// Barracks (fed by real gear chains), siege progress auto-accrues from that
// army's power, and territories fall strictly in order until the Black Keep.
// UI is NOT involved (PlaythroughProbe covers the real UI layer).

import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";

const fail = (m) => {
  console.error("PROBE FAIL:", m);
  process.exit(1);
};
const ok = (m) => console.log("  ok -", m);
let assertions = 0;
const expect = (cond, m) => {
  assertions++;
  if (!cond) fail(m);
};

const ORDER = Object.values(TERRITORIES)
  .sort((a, b) => a.order - b.order)
  .map((t) => t.id);

const clock = new FakeClock(0);
const game = new Game({ content, clock });
game.bootstrap(new MemoryStorageAdapter());

// Seed currencies so the probe exercises the war CHAIN (research->barracks->
// muster->siege), not the multi-hour idle grind for research (the grind itself
// is covered by Tick/RateSolver/Offline suites). Economy bootstrap = the same
// scholar/market machinery the old probe relied on; here we fund it directly so
// each BuyResearch is gated on the RESEARCH it costs, not on wall-time.
const st = game.getState();
st.currencies.research = 100000;
st.currencies.gold = 100000;
delete st._solved;

// ---------------------------------------------------------------------------
// Helpers (reused from the historical chain-building infra).
// ---------------------------------------------------------------------------
function place(kind, extra) {
  const before = game.getState().graph.nodes.length;
  const r = game.dispatch({
    type: INTENT.PlaceNode,
    kind,
    pos: { x: 100 + before * 24, y: 100 + (before % 7) * 24 },
    ...extra,
  });
  if (!r.ok) fail(`PlaceNode ${kind} rejected: ${r.error}`);
  const nodes = game.getState().graph.nodes;
  return nodes[nodes.length - 1].id;
}
function connect(from, to, resourceId) {
  const r = game.dispatch({ type: INTENT.ConnectLink, from, to, resourceId });
  if (!r.ok) fail(`ConnectLink ${from}->${to} (${resourceId}): ${r.error}`);
}
function buy(id) {
  const r = game.dispatch({ type: INTENT.BuyResearch, nodeId: id });
  if (!r.ok) fail(`BuyResearch ${id} rejected: ${r.error}`);
}
// Level a node up `times` times (gold is seeded, so this never rejects).
function levelTo(nodeId, level) {
  while (
    game.getState().graph.nodes.find((n) => n.id === nodeId).level < level
  ) {
    game.getState().currencies.gold = 1e9; // keep upgrades affordable
    delete game.getState()._solved;
    const r = game.dispatch({ type: INTENT.UpgradeNode, nodeId });
    if (!r.ok) fail(`UpgradeNode ${nodeId} rejected: ${r.error}`);
  }
}
function siegeRateNow() {
  const s = game.getState();
  return solve(s, content).siegeRate;
}
function reclaimed() {
  return game.getState().territories.reclaimed.slice();
}

// ---------------------------------------------------------------------------
// PHASE 0 — research the economy + war spine up to the no-territory-gate nodes.
// res_drill_yard (barracks + r_militia) and res_hardened_steel (fine gear) are
// ungated; res_master_smithing requires t_ironreach (handled in a later phase).
// ---------------------------------------------------------------------------
const spine = [
  "res_scholar",
  "res_lumber",
  "res_tannery",
  "res_coalworks",
  "res_steelmaking",
  "res_open_market",
  "res_smithing",
  "res_fittings",
  "res_armory",
  "res_drill_yard",
  "res_hardened_steel",
];
for (const id of spine) buy(id);
expect(
  game.getState().unlocks.machinesUnlocked.includes("barracks"),
  "barracks not unlocked after res_drill_yard",
);
expect(
  game.getState().unlocks.recipesUnlocked.includes("r_militia"),
  "r_militia not unlocked after res_drill_yard",
);
ok(
  "research spine bought (drill yard + hardened steel; barracks + militia unlocked)",
);

// ---------------------------------------------------------------------------
// PHASE 1 — build the gear chain feeding a militia army, then assert a NONZERO
// siege rate. The chain: miners -> smelters (iron_bar/coal/steel) + foresters/
// trappers -> planks/leather -> workshops (blade/plating/fitting) -> workshops
// (sword/armor/shield) -> barracks(r_militia). We over-level producers so each
// barracks is fully fed (the solver rations by capacity; redundant supply idles).
// ---------------------------------------------------------------------------
// Raw gatherers (multiple per raw so smelters/workshops never starve).
const ironMiners = [
  place("gatherer", { resourceId: "iron_ore" }),
  place("gatherer", { resourceId: "iron_ore" }),
  place("gatherer", { resourceId: "iron_ore" }),
];
const coalMiners = [
  place("gatherer", { resourceId: "coal_raw" }),
  place("gatherer", { resourceId: "coal_raw" }),
];
const foresters = [
  place("gatherer", { resourceId: "timber" }),
  place("gatherer", { resourceId: "timber" }),
];
const trappers = [place("gatherer", { resourceId: "hide" })];
for (const id of [...ironMiners, ...coalMiners, ...foresters, ...trappers])
  levelTo(id, 10);

// Intermediates.
const ironSmelters = [
  place("smelter", { recipeId: "r_iron_bar" }),
  place("smelter", { recipeId: "r_iron_bar" }),
  place("smelter", { recipeId: "r_iron_bar" }),
];
const coalSmelters = [
  place("smelter", { recipeId: "r_coal" }),
  place("smelter", { recipeId: "r_coal" }),
];
const plankSmelters = [
  place("smelter", { recipeId: "r_plank" }),
  place("smelter", { recipeId: "r_plank" }),
];
const leatherSmelters = [place("smelter", { recipeId: "r_leather" })];
const steelSmelters = [
  place("smelter", { recipeId: "r_steel" }),
  place("smelter", { recipeId: "r_steel" }),
  place("smelter", { recipeId: "r_steel" }),
];
for (const id of [
  ...ironSmelters,
  ...coalSmelters,
  ...plankSmelters,
  ...leatherSmelters,
  ...steelSmelters,
])
  levelTo(id, 12);

// Components.
const bladeShops = [
  place("workshop", { recipeId: "r_blade" }),
  place("workshop", { recipeId: "r_blade" }),
];
const platingShops = [
  place("workshop", { recipeId: "r_plating" }),
  place("workshop", { recipeId: "r_plating" }),
];
const fittingShops = [
  place("workshop", { recipeId: "r_fitting" }),
  place("workshop", { recipeId: "r_fitting" }),
];
for (const id of [...bladeShops, ...platingShops, ...fittingShops])
  levelTo(id, 14);

// Gear.
const swordShops = [
  place("workshop", { recipeId: "r_sword" }),
  place("workshop", { recipeId: "r_sword" }),
];
const armorShops = [
  place("workshop", { recipeId: "r_armor" }),
  place("workshop", { recipeId: "r_armor" }),
];
const shieldShops = [
  place("workshop", { recipeId: "r_shield" }),
  place("workshop", { recipeId: "r_shield" }),
];
for (const id of [...swordShops, ...armorShops, ...shieldShops])
  levelTo(id, 16);

// Wire raws -> intermediates.
for (const m of ironMiners)
  for (const s of ironSmelters) connect(m, s, "iron_ore");
for (const m of coalMiners)
  for (const s of coalSmelters) connect(m, s, "coal_raw");
for (const m of foresters)
  for (const s of plankSmelters) connect(m, s, "timber");
for (const m of trappers)
  for (const s of leatherSmelters) connect(m, s, "hide");
// steel needs iron_bar + coal.
for (const s of ironSmelters)
  for (const t of steelSmelters) connect(s, t, "iron_bar");
for (const c of coalSmelters)
  for (const t of steelSmelters) connect(c, t, "coal");
// components: blade(steel,plank) plating(steel,leather) fitting(iron_bar,leather).
for (const t of steelSmelters)
  for (const w of bladeShops) connect(t, w, "steel");
for (const p of plankSmelters)
  for (const w of bladeShops) connect(p, w, "plank");
for (const t of steelSmelters)
  for (const w of platingShops) connect(t, w, "steel");
for (const l of leatherSmelters)
  for (const w of platingShops) connect(l, w, "leather");
for (const s of ironSmelters)
  for (const w of fittingShops) connect(s, w, "iron_bar");
for (const l of leatherSmelters)
  for (const w of fittingShops) connect(l, w, "leather");
// gear: sword(blade,fitting) armor(plating,fitting) shield(plating,plank).
for (const b of bladeShops) for (const w of swordShops) connect(b, w, "blade");
for (const f of fittingShops)
  for (const w of swordShops) connect(f, w, "fitting");
for (const p of platingShops)
  for (const w of armorShops) connect(p, w, "plating");
for (const f of fittingShops)
  for (const w of armorShops) connect(f, w, "fitting");
for (const p of platingShops)
  for (const w of shieldShops) connect(p, w, "plating");
for (const p of plankSmelters)
  for (const w of shieldShops) connect(p, w, "plank");

// Barracks mustering militia, fed by gear. Several leveled barracks => real power.
const militiaBarracks = [];
for (let i = 0; i < 4; i++) {
  const b = place("barracks", { recipeId: "r_militia" });
  levelTo(b, 8);
  for (const w of swordShops) connect(w, b, "sword");
  for (const w of armorShops) connect(w, b, "armor");
  for (const w of shieldShops) connect(w, b, "shield");
  militiaBarracks.push(b);
}
delete game.getState()._solved;
const rate1 = siegeRateNow();
expect(rate1 > 0, `militia army produced no siege rate (${rate1})`);
ok(
  `militia gear chain + ${militiaBarracks.length} barracks => siege rate ${rate1.toFixed(3)} power/s`,
);

// ---------------------------------------------------------------------------
// PHASE 2 — siege the first territories IN ORDER off the militia army. Tick in
// chunks (applyTick integrates linearly; tryAdvanceSiege resolves per tick) and
// ASSERT each fall extends the reclaimed list by exactly the next ordered id.
// Stop once t_ironreach is reclaimed (unlocks gemstone + the master-smithing gate).
// ---------------------------------------------------------------------------
const fellOrder = [];
function tickAndRecord(dt) {
  const before = reclaimed();
  game.tick(dt);
  const after = reclaimed();
  for (let i = before.length; i < after.length; i++) {
    const id = after[i];
    // Each newly-reclaimed id must be the NEXT one in canonical siege order.
    const expectedIdx = fellOrder.length;
    expect(
      id === ORDER[expectedIdx],
      `territory #${expectedIdx + 1} fell out of order: got ${id}, expected ${ORDER[expectedIdx]}`,
    );
    fellOrder.push(id);
  }
}

let guard = 0;
while (!reclaimed().includes("t_ironreach") && guard++ < 5000) {
  clock.advance(60_000);
  tickAndRecord(60); // 60s of siege per step
}
expect(
  reclaimed().includes("t_ironreach"),
  `t_ironreach not reclaimed by the militia army after ${guard} steps`,
);
expect(
  fellOrder.join(",") === "t_gatehouse,t_smithyward,t_oldmarket,t_ironreach",
  `fall order through ironreach wrong: ${fellOrder.join(",")}`,
);
expect(
  game.getState().unlocks.gathererResources.includes("gemstone"),
  "gemstone gathering not enabled after t_ironreach",
);
ok(
  `militia army felled ${fellOrder.join(" -> ")} strictly in order; gemstone unlocked`,
);

// ---------------------------------------------------------------------------
// PHASE 3 — now that t_ironreach is reclaimed, the master-smithing gate opens.
// Buy res_master_smithing (research 1500), build the upgraded chains
// (hardened_steel -> fine gear; gemstone + fine -> master gear) and muster
// KNIGHTS (power 9) to crack the High Wall (4500) and Black Keep (12000).
// ---------------------------------------------------------------------------
game.getState().currencies.research = 100000;
delete game.getState()._solved;
buy("res_master_smithing");
expect(
  game.getState().unlocks.recipesUnlocked.includes("r_knight"),
  "r_knight not unlocked after res_master_smithing",
);

// hardened_steel = steel + coal_raw; we need raw coal feeding both coal smelters
// AND hardened-steel smelters, plus extra steel. Add capacity.
const gemMiners = [
  place("gatherer", { resourceId: "gemstone" }),
  place("gatherer", { resourceId: "gemstone" }),
  place("gatherer", { resourceId: "gemstone" }),
];
const moreCoalMiners = [
  place("gatherer", { resourceId: "coal_raw" }),
  place("gatherer", { resourceId: "coal_raw" }),
  place("gatherer", { resourceId: "coal_raw" }),
];
const moreIronMiners = [
  place("gatherer", { resourceId: "iron_ore" }),
  place("gatherer", { resourceId: "iron_ore" }),
];
for (const id of [...gemMiners, ...moreCoalMiners, ...moreIronMiners])
  levelTo(id, 14);

const moreIronSmelters = [
  place("smelter", { recipeId: "r_iron_bar" }),
  place("smelter", { recipeId: "r_iron_bar" }),
];
const moreSteelSmelters = [
  place("smelter", { recipeId: "r_steel" }),
  place("smelter", { recipeId: "r_steel" }),
  place("smelter", { recipeId: "r_steel" }),
];
const hardenedSmelters = [
  place("smelter", { recipeId: "r_hardened_steel" }),
  place("smelter", { recipeId: "r_hardened_steel" }),
  place("smelter", { recipeId: "r_hardened_steel" }),
];
for (const id of [
  ...moreIronSmelters,
  ...moreSteelSmelters,
  ...hardenedSmelters,
])
  levelTo(id, 16);

// Fine gear = base gear + hardened_steel.
const fineSwordShops = [
  place("workshop", { recipeId: "r_fine_sword" }),
  place("workshop", { recipeId: "r_fine_sword" }),
];
const fineArmorShops = [
  place("workshop", { recipeId: "r_fine_armor" }),
  place("workshop", { recipeId: "r_fine_armor" }),
];
const fineShieldShops = [
  place("workshop", { recipeId: "r_fine_shield" }),
  place("workshop", { recipeId: "r_fine_shield" }),
];
// Master gear = fine gear + gemstone:2.
const masterSwordShops = [
  place("workshop", { recipeId: "r_master_sword" }),
  place("workshop", { recipeId: "r_master_sword" }),
];
const masterArmorShops = [
  place("workshop", { recipeId: "r_master_armor" }),
  place("workshop", { recipeId: "r_master_armor" }),
];
const masterShieldShops = [
  place("workshop", { recipeId: "r_master_shield" }),
  place("workshop", { recipeId: "r_master_shield" }),
];
for (const id of [
  ...fineSwordShops,
  ...fineArmorShops,
  ...fineShieldShops,
  ...masterSwordShops,
  ...masterArmorShops,
  ...masterShieldShops,
])
  levelTo(id, 18);

// Need extra base gear shops to feed the fine chain (the originals feed militia).
const swordShops2 = [
  place("workshop", { recipeId: "r_sword" }),
  place("workshop", { recipeId: "r_sword" }),
];
const armorShops2 = [
  place("workshop", { recipeId: "r_armor" }),
  place("workshop", { recipeId: "r_armor" }),
];
const shieldShops2 = [
  place("workshop", { recipeId: "r_shield" }),
  place("workshop", { recipeId: "r_shield" }),
];
const bladeShops2 = [
  place("workshop", { recipeId: "r_blade" }),
  place("workshop", { recipeId: "r_blade" }),
];
const platingShops2 = [
  place("workshop", { recipeId: "r_plating" }),
  place("workshop", { recipeId: "r_plating" }),
];
const fittingShops2 = [
  place("workshop", { recipeId: "r_fitting" }),
  place("workshop", { recipeId: "r_fitting" }),
];
for (const id of [
  ...swordShops2,
  ...armorShops2,
  ...shieldShops2,
  ...bladeShops2,
  ...platingShops2,
  ...fittingShops2,
])
  levelTo(id, 16);
const plankSmelters2 = [place("smelter", { recipeId: "r_plank" })];
const leatherSmelters2 = [place("smelter", { recipeId: "r_leather" })];
const coalSmelters2 = [
  place("smelter", { recipeId: "r_coal" }),
  place("smelter", { recipeId: "r_coal" }),
];
for (const id of [...plankSmelters2, ...leatherSmelters2, ...coalSmelters2])
  levelTo(id, 14);
const foresters2 = [place("gatherer", { resourceId: "timber" })];
const trappers2 = [place("gatherer", { resourceId: "hide" })];
for (const id of [...foresters2, ...trappers2]) levelTo(id, 12);

// Wire the T2/T3 chain.
for (const m of moreIronMiners)
  for (const s of moreIronSmelters) connect(m, s, "iron_ore");
for (const s of moreIronSmelters)
  for (const t of moreSteelSmelters) connect(s, t, "iron_bar");
for (const c of moreCoalMiners)
  for (const t of coalSmelters2) connect(c, t, "coal_raw");
for (const c of coalSmelters2)
  for (const t of moreSteelSmelters) connect(c, t, "coal");
// hardened_steel needs steel + coal_raw (RAW coal, not refined).
for (const t of moreSteelSmelters)
  for (const h of hardenedSmelters) connect(t, h, "steel");
for (const c of moreCoalMiners)
  for (const h of hardenedSmelters) connect(c, h, "coal_raw");
// base gear chain #2.
for (const f of foresters2)
  for (const s of plankSmelters2) connect(f, s, "timber");
for (const tr of trappers2)
  for (const s of leatherSmelters2) connect(tr, s, "hide");
for (const t of moreSteelSmelters)
  for (const w of bladeShops2) connect(t, w, "steel");
for (const p of plankSmelters2)
  for (const w of bladeShops2) connect(p, w, "plank");
for (const t of moreSteelSmelters)
  for (const w of platingShops2) connect(t, w, "steel");
for (const l of leatherSmelters2)
  for (const w of platingShops2) connect(l, w, "leather");
for (const s of moreIronSmelters)
  for (const w of fittingShops2) connect(s, w, "iron_bar");
for (const l of leatherSmelters2)
  for (const w of fittingShops2) connect(l, w, "leather");
for (const b of bladeShops2)
  for (const w of swordShops2) connect(b, w, "blade");
for (const f of fittingShops2)
  for (const w of swordShops2) connect(f, w, "fitting");
for (const p of platingShops2)
  for (const w of armorShops2) connect(p, w, "plating");
for (const f of fittingShops2)
  for (const w of armorShops2) connect(f, w, "fitting");
for (const p of platingShops2)
  for (const w of shieldShops2) connect(p, w, "plating");
for (const p of plankSmelters2)
  for (const w of shieldShops2) connect(p, w, "plank");
// fine gear.
for (const w of swordShops2)
  for (const f of fineSwordShops) connect(w, f, "sword");
for (const h of hardenedSmelters)
  for (const f of fineSwordShops) connect(h, f, "hardened_steel");
for (const w of armorShops2)
  for (const f of fineArmorShops) connect(w, f, "armor");
for (const h of hardenedSmelters)
  for (const f of fineArmorShops) connect(h, f, "hardened_steel");
for (const w of shieldShops2)
  for (const f of fineShieldShops) connect(w, f, "shield");
for (const h of hardenedSmelters)
  for (const f of fineShieldShops) connect(h, f, "hardened_steel");
// master gear.
for (const f of fineSwordShops)
  for (const m of masterSwordShops) connect(f, m, "fine_sword");
for (const g of gemMiners)
  for (const m of masterSwordShops) connect(g, m, "gemstone");
for (const f of fineArmorShops)
  for (const m of masterArmorShops) connect(f, m, "fine_armor");
for (const g of gemMiners)
  for (const m of masterArmorShops) connect(g, m, "gemstone");
for (const f of fineShieldShops)
  for (const m of masterShieldShops) connect(f, m, "fine_shield");
for (const g of gemMiners)
  for (const m of masterShieldShops) connect(g, m, "gemstone");

// Knight barracks (power 9). Add several, leveled, to crack 4500 + 12000.
const knightBarracks = [];
for (let i = 0; i < 6; i++) {
  const b = place("barracks", { recipeId: "r_knight" });
  levelTo(b, 12);
  for (const w of masterSwordShops) connect(w, b, "master_sword");
  for (const w of masterArmorShops) connect(w, b, "master_armor");
  for (const w of masterShieldShops) connect(w, b, "master_shield");
  knightBarracks.push(b);
}
delete game.getState()._solved;
const rate2 = siegeRateNow();
expect(
  rate2 > rate1,
  `knight army did not raise siege rate (${rate1} -> ${rate2})`,
);
ok(
  `knight gear chain + ${knightBarracks.length} barracks => siege rate ${rate2.toFixed(3)} power/s`,
);

// ---------------------------------------------------------------------------
// PHASE 4 — siege the rest to VICTORY. Big-dt ticks keep wall-time tiny; each
// reclaim is still asserted IN ORDER via tickAndRecord.
// ---------------------------------------------------------------------------
guard = 0;
while (!game.getState().meta.won && guard++ < 5000) {
  clock.advance(600_000);
  tickAndRecord(600); // 10 game-min of siege per step
}
expect(game.getState().meta.won, `meta.won false after ${guard} siege steps`);

// Fall order across ALL SIX must be exactly the canonical order.
expect(
  fellOrder.join(",") === ORDER.join(","),
  `final fall order wrong:\n  got: ${fellOrder.join(",")}\n  exp: ${ORDER.join(",")}`,
);
const allReclaimed = ORDER.every((id) =>
  game.getState().territories.reclaimed.includes(id),
);
expect(allReclaimed, "not all 6 territories reclaimed");

// Black Keep grants meta.won; High Wall granted the barracks production bonus.
expect(
  game.getState().unlocks.productionBonuses.barracks > 1.0,
  "t_highwall barracks production bonus did not apply",
);

// Confirm the victory snapshot the UI would consume reports won:true.
let wonSnap = null;
const unsub = game.onSnapshot((s) => (wonSnap = s));
game.emitSnapshotForFrame();
unsub();
expect(
  wonSnap && wonSnap.meta.won === true,
  "emitted snapshot meta.won !== true",
);
expect(
  wonSnap.territories.every((t) => t.status === "reclaimed"),
  "victory snapshot still shows an un-reclaimed territory",
);

ok(
  `all 6 territories fell IN ORDER (${fellOrder.join(" -> ")}); meta.won === true; victory snapshot won:true`,
);
console.log(
  `PROBE PASS: engine reaches victory via the SIEGE loop (${assertions} assertions).`,
);
