import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";

function newGame() {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  const st = game.getState();
  st.currencies.gold = 1e6;
  delete st._solved;
  return game;
}
function place(game, kind, extra = {}, x = 0) {
  game.dispatch({ type: INTENT.PlaceNode, kind, pos: { x, y: 0 }, ...extra });
  const n = game.getState().graph.nodes;
  return n[n.length - 1].id;
}
function link(game, from, to, resourceId) {
  game.dispatch({ type: INTENT.ConnectLink, from, to, resourceId });
}
const solved = (game) => {
  const s = game.getState();
  delete s._solved;
  return solve(s, content);
};
const flowFrom = (sv, state, fromId) =>
  sv.linkFlow[state.graph.links.find((l) => l.from === fromId).id];

describe("RateSolver — demand-limited fan-in", () => {
  it("a redundant second feeder ships nothing; the first fills the consumer fully", () => {
    const game = newGame();
    const g1 = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const g2 = place(game, "gatherer", { resourceId: "iron_ore" }, 50);
    const s = place(game, "smelter", { recipeId: "r_iron_bar" }, 200);
    link(game, g1, s, "iron_ore");
    link(game, g2, s, "iron_ore");
    const sv = solved(game);
    const state = game.getState();
    // smelter wants 1.0 iron_ore; g1 (cap 1.0) fills it alone, g2 is redundant
    expect(flowFrom(sv, state, g1)).toBeCloseTo(1.0, 1e-9);
    expect(flowFrom(sv, state, g2)).toBeCloseTo(0, 1e-9);
    // no over-supply: the smelter receives exactly its demand
    expect(flowFrom(sv, state, g1) + flowFrom(sv, state, g2)).toBeCloseTo(
      1.0,
      1e-9,
    );
    // the redundant gatherer is idle (ships nothing) -> not "working"
    const snap = game.getSnapshot();
    expect(snap.nodes.find((n) => n.id === g2).working).toBe(false);
    expect(snap.nodes.find((n) => n.id === g1).working).toBe(true);
  });

  it("does NOT strand a healthy feeder when a co-feeder underperforms (no under-feed)", () => {
    // Two iron_bar smelters feed a fitting workshop (wants 0.25 iron_bar). Smelter A
    // is fed (output 0.5); smelter B is starved (output 0). The healthy A must fill
    // the workshop's full want — the old capacity-weighted split stranded half of A.
    const game = newGame();
    const st = game.getState();
    st.unlocks.machinesUnlocked.push("workshop");
    st.unlocks.recipesUnlocked.push("r_fitting");
    delete st._solved;
    const gOre = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const sA = place(game, "smelter", { recipeId: "r_iron_bar" }, 100);
    const sB = place(game, "smelter", { recipeId: "r_iron_bar" }, 100); // no ore feed
    const w = place(game, "workshop", { recipeId: "r_fitting" }, 300);
    link(game, gOre, sA, "iron_ore");
    link(game, sA, w, "iron_bar");
    link(game, sB, w, "iron_bar");
    const sv = solved(game);
    const state = game.getState();
    // workshop's iron_bar want = cap 0.25 * 1; A (output 0.5) supplies all of it
    expect(flowFrom(sv, state, sA)).toBeCloseTo(0.25, 1e-9);
    expect(flowFrom(sv, state, sB)).toBeCloseTo(0, 1e-9);
  });

  it("co-feeders top up to fully feed a consumer (no stranding, both work)", () => {
    const game = newGame();
    const st = game.getState();
    st.unlocks.productionBonuses.gatherer = 0.6; // each gatherer cap 0.6 < 1.0 demand
    delete st._solved;
    const g1 = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const g2 = place(game, "gatherer", { resourceId: "iron_ore" }, 50);
    const s = place(game, "smelter", { recipeId: "r_iron_bar" }, 200);
    link(game, g1, s, "iron_ore");
    link(game, g2, s, "iron_ore");
    const sv = solved(game);
    const state = game.getState();
    // g1 ships its full 0.6; g2 tops up the remaining 0.4 -> smelter fully fed (1.0)
    expect(flowFrom(sv, state, g1)).toBeCloseTo(0.6, 1e-9);
    expect(flowFrom(sv, state, g2)).toBeCloseTo(0.4, 1e-9);
  });

  it("single feeder still receives the full demand (one-to-one unchanged)", () => {
    const game = newGame();
    const g = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const s = place(game, "smelter", { recipeId: "r_iron_bar" }, 200);
    link(game, g, s, "iron_ore");
    const sv = solved(game);
    expect(flowFrom(sv, game.getState(), g)).toBeCloseTo(1.0, 1e-9);
  });
});

describe("Snapshot — working flag", () => {
  it("a disconnected producer is NOT working (output goes nowhere)", () => {
    const game = newGame();
    const g = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    expect(game.getSnapshot().nodes.find((n) => n.id === g).working).toBe(
      false,
    );
  });

  it("a producer shipping to a consumer IS working (both ends)", () => {
    const game = newGame();
    const g = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const m = place(game, "market", {}, 200);
    link(game, g, m, "iron_ore");
    const snap = game.getSnapshot();
    expect(snap.nodes.find((n) => n.id === g).working).toBe(true);
    expect(snap.nodes.find((n) => n.id === m).working).toBe(true);
  });
});

describe("Reducer — outbound links follow a machine's new output", () => {
  it("retyping a gatherer re-points its outbound link's resource", () => {
    const game = newGame();
    const st = game.getState();
    st.unlocks.gathererResources = ["timber"]; // enable timber gathering
    delete st._solved;
    const g = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const s = place(game, "smelter", { recipeId: "r_iron_bar" }, 200);
    link(game, g, s, "iron_ore");
    expect(game.getState().graph.links[0].resourceId).toBe("iron_ore");
    game.dispatch({
      type: INTENT.SetGathererResource,
      nodeId: g,
      resourceId: "timber",
    });
    expect(game.getState().graph.links[0].resourceId).toBe("timber");
  });

  it("retyping a crafter re-points its outbound link to the new recipe output", () => {
    const game = newGame();
    const st = game.getState();
    st.unlocks.recipesUnlocked.push("r_plank");
    delete st._solved;
    const s = place(game, "smelter", { recipeId: "r_iron_bar" }, 0);
    const m = place(game, "market", {}, 200);
    link(game, s, m, "iron_bar"); // smelter -> market carrying iron_bar
    game.dispatch({ type: INTENT.SetRecipe, nodeId: s, recipeId: "r_plank" });
    const lnk = game.getState().graph.links.find((l) => l.from === s);
    expect(lnk.resourceId).toBe("plank"); // follows the new output
  });
});
