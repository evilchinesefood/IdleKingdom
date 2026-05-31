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

/** SEED: Miner L1 -> Smelter L1 r_iron_bar -> Market L1.
 *  smelter out = min(0.5, 1.0 ore/2) = 0.5 bar/s; market sells 0.5@4.0 => goldRate 2.0, researchRate 0.10. */
export function seedGraph() {
  const state = NewGame(new FakeClock(0));
  return {
    state,
    content: content(),
    expected: { smelterOut: 0.5, goldRate: 2.0, researchRate: 0.1, oreCap: 1.0 },
  };
}

/** BOTTLENECK: gatherer bonus 0.6 -> 0.6 ore/s feeds the smelter -> out = min(0.5, 0.6/2) = 0.3 bar/s. */
export function bottleneckGraph() {
  const nodes = [
    { id: "g", kind: "gatherer", level: 1, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
    { id: "s", kind: "smelter", level: 1, resourceId: null, recipeId: "r_iron_bar", stockpile: {}, pos: { x: 1, y: 0 } },
  ];
  const links = [{ id: "l0", from: "g", to: "s", resourceId: "iron_ore" }];
  const graph = { nodes, links, nextNodeSeq: 2, nextLinkSeq: 1 };
  const unlocks = baseUnlocks({ productionBonuses: { gatherer: 0.6, smelter: 1.0, workshop: 1.0, market: 1.0, scholar: 1.0 } });
  return {
    state: stateOf(graph, unlocks),
    content: content(),
    expected: { oreOut: 0.6, smelterOut: 0.3 },
  };
}

/** STEEL full-supply: two pinned intermediate gatherers (iron_bar 1.0/s, coal 1.0/s) both exceed
 *  r_steel's per-input need, so steel runs at its capacity 0.25/s (nothing binds below cap). */
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
  const unlocks = baseUnlocks({ recipesUnlocked: ["r_steel"] });
  return {
    state: stateOf(graph, unlocks),
    content: content(),
    expected: { steelOutWithFullSupply: 0.25 },
  };
}

/** SURPLUS: a lone gatherer with no consumer accrues its full 1.0 ore/s to its own stockpile. */
export function surplusGraph() {
  const nodes = [
    { id: "m", kind: "gatherer", level: 1, resourceId: "iron_ore", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } },
  ];
  const graph = { nodes, links: [], nextNodeSeq: 1, nextLinkSeq: 0 };
  return { state: stateOf(graph), content: content(), expected: { surplusOre: 1.0 } };
}

/** MARKET overflow: iron_bar 4/s + iron_ore 4/s (both listed) into Market cap 5/s -> sell scale 5/8.
 *  sold 2.5 bar @4.0 + 2.5 ore @0.5 => goldRate 11.25, researchRate 0.5625. */
export function marketOverflowGraph() {
  const nodes = [
    { id: "gbar", kind: "gatherer", level: 7, resourceId: "iron_bar", recipeId: null, stockpile: {}, pos: { x: 0, y: 0 } }, // cap 4.0
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
