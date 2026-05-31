// Headless scripted engine->victory probe (NOT a unit suite; run directly).
// Drives the Game facade via dispatches + clock advances to prove the engine
// reaches victory and that a reclaim unlock fires. UI is NOT involved.

import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { heroPower } from "../Source/Engine/Systems/HeroSystem.js";

const fail = (m) => {
  console.error("PROBE FAIL:", m);
  process.exit(1);
};
const ok = (m) => console.log("  ok -", m);

const clock = new FakeClock(0);
const game = new Game({ content, clock });
game.bootstrap(new MemoryStorageAdapter());

// Seed currencies so the probe exercises the CHAIN (research->build->equip->expedite),
// not the multi-minute idle grind (the grind itself is covered by Tick/RateSolver suites).
const st = game.getState();
st.currencies.research = 100000;
st.currencies.renown = 100000;
st.currencies.gold = 100000;
delete st._solved;

// --- Research the full equipment + offline-cap spine (all Research-purchasable). ---
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
];
for (const id of spine) {
  const r = game.dispatch({ type: INTENT.BuyResearch, nodeId: id });
  if (!r.ok) fail(`BuyResearch ${id} rejected: ${r.error}`);
}
ok("research spine bought (equipment recipes unlocked through res_armory)");

// --- Build the steel + equipment chain via PlaceNode + ConnectLink. ---
function place(kind, extra) {
  const before = game.getState().graph.nodes.length;
  const r = game.dispatch({
    type: INTENT.PlaceNode,
    kind,
    pos: { x: 100 + before * 30, y: 100 },
    ...extra,
  });
  if (!r.ok) fail(`PlaceNode ${kind} rejected: ${r.error}`);
  const nodes = game.getState().graph.nodes;
  return nodes[nodes.length - 1].id;
}
// extra gatherers for coal; steel + equipment crafters (just prove placement + recipe set work)
const coalMiner = place("gatherer", { resourceId: "coal_raw" });
const coalSmelter = place("smelter", { recipeId: "r_coal" });
const steelSmelter = place("smelter", { recipeId: "r_steel" });
const bladeWorkshop = place("workshop", { recipeId: "r_blade" });
const swordWorkshop = place("workshop", { recipeId: "r_sword" });
ok(
  `placed coal/steel/equipment chain (${[coalMiner, coalSmelter, steelSmelter, bladeWorkshop, swordWorkshop].join(", ")})`,
);

// connect coal miner -> coal smelter (proves ConnectLink + resource inference path)
let r = game.dispatch({
  type: INTENT.ConnectLink,
  from: coalMiner,
  to: coalSmelter,
  resourceId: "coal_raw",
});
if (!r.ok) fail(`ConnectLink coal rejected: ${r.error}`);
ok("connected coal gatherer -> coal smelter");

// --- Equip T1 gear on the starting Warden -> power 35 (10+12+8 gear + L1*5). ---
const heroId = game.getState().heroes[0].id;
for (const [slot, itemId] of [
  ["weapon", "sword"],
  ["armor", "armor"],
  ["accessory", "shield"],
]) {
  const e = game.dispatch({
    type: INTENT.EquipItem,
    heroId,
    slot,
    itemId,
    tier: 1,
  });
  if (!e.ok) fail(`EquipItem ${itemId} T1 rejected: ${e.error}`);
}
const p35 = heroPower(game.getState(), content, heroId);
if (p35 !== 35) fail(`expected power 35 after T1 gear, got ${p35}`);
ok("equipped T1 sword+armor+shield -> hero power 35");

// --- Clear t_gatehouse (req 30) and assert the +10% gatherer unlock fires. ---
const gathererBonusBefore = game.getState().unlocks.productionBonuses.gatherer;
r = game.dispatch({
  type: INTENT.StartExpedition,
  territoryId: "t_gatehouse",
  heroId,
});
if (!r.ok) fail(`StartExpedition t_gatehouse rejected: ${r.error}`);
clock.advance(TERRITORIES.t_gatehouse.durationMs + 1000);
game.tick(0.05); // a tick after the duration triggers tryResolve
if (!game.getState().territories.reclaimed.includes("t_gatehouse"))
  fail("t_gatehouse not reclaimed after duration + tick");
const gathererBonusAfter = game.getState().unlocks.productionBonuses.gatherer;
if (!(gathererBonusAfter > gathererBonusBefore))
  fail(
    `gatherer production bonus did not increase (before ${gathererBonusBefore}, after ${gathererBonusAfter})`,
  );
ok(
  `t_gatehouse reclaimed; gatherer bonus rose ${gathererBonusBefore} -> ${gathererBonusAfter} (unlock fired)`,
);

// --- Drive the remaining territories to VICTORY. ---
// Strategy: before each next territory, level the hero with renown until power suffices
// (gear tiers also unlock on reclaim; T1 gear + leveling alone covers the curve here since
// renown is seeded). Then start + advance clock past duration + tick to resolve.
function nextTerr(state) {
  return Object.values(content.territories)
    .filter((t) => !state.territories.reclaimed.includes(t.id))
    .sort((a, b) => a.order - b.order)[0];
}

let guard = 0;
while (!game.getState().meta.won && guard++ < 50) {
  const state = game.getState();
  const terr = nextTerr(state);
  if (!terr) break;
  const hid = state.heroes[0].id;
  // Equip the highest unlocked tier of each slot to maximize gear power.
  const tiersByItem = {};
  for (const g of state.unlocks.gearTiersUnlocked) {
    tiersByItem[g.itemId] = Math.max(tiersByItem[g.itemId] || 0, g.tier);
  }
  for (const [slot, itemId] of [
    ["weapon", "sword"],
    ["armor", "armor"],
    ["accessory", "shield"],
  ]) {
    const tier = tiersByItem[itemId] || 1;
    game.dispatch({ type: INTENT.EquipItem, heroId: hid, slot, itemId, tier });
  }
  // Level hero until power >= requiredPower.
  let safety = 0;
  while (
    heroPower(game.getState(), content, hid) < terr.requiredPower &&
    safety++ < 200
  ) {
    const lr = game.dispatch({ type: INTENT.LevelUpHero, heroId: hid });
    if (!lr.ok) fail(`LevelUpHero rejected (terr ${terr.id}): ${lr.error}`);
  }
  const sr = game.dispatch({
    type: INTENT.StartExpedition,
    territoryId: terr.id,
    heroId: hid,
  });
  if (!sr.ok)
    fail(
      `StartExpedition ${terr.id} rejected (power ${heroPower(game.getState(), content, hid)}/${terr.requiredPower}): ${sr.error}`,
    );
  clock.advance(terr.durationMs + 1000);
  game.tick(0.05);
  if (!game.getState().territories.reclaimed.includes(terr.id))
    fail(`${terr.id} not reclaimed after duration + tick`);
}

const final = game.getState();
const allReclaimed = Object.keys(content.territories).every((id) =>
  final.territories.reclaimed.includes(id),
);
if (!allReclaimed) fail("not all 6 territories reclaimed");
if (!final.meta.won) fail("meta.won is false after clearing all territories");

// Confirm the victory snapshot the UI would consume reports won:true.
let wonSnap = null;
const unsub = game.onSnapshot((s) => (wonSnap = s));
game.emitSnapshotForFrame();
unsub();
if (!wonSnap || wonSnap.meta.won !== true)
  fail("emitted snapshot meta.won !== true");

ok("all 6 territories reclaimed; meta.won === true; victory snapshot won:true");
console.log("PROBE PASS: engine reaches victory via scripted dispatches.");
