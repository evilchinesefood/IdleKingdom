import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";

function newGame(gold = 1e6) {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  const st = game.getState();
  st.currencies.gold = gold;
  delete st._solved;
  return game;
}

describe("Undo/redo — structural edits", () => {
  it("undo reverts a PlaceNode and clears canUndo", () => {
    const game = newGame();
    expect(game.canUndo()).toBe(false);
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    expect(game.getSnapshot().nodes.length).toBe(1);
    expect(game.canUndo()).toBe(true);
    game.undo();
    expect(game.getSnapshot().nodes.length).toBe(0);
    expect(game.canUndo()).toBe(false);
    expect(game.canRedo()).toBe(true);
  });

  it("redo re-applies the undone PlaceNode", () => {
    const game = newGame();
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    game.undo();
    game.redo();
    expect(game.getSnapshot().nodes.length).toBe(1);
    expect(game.canRedo()).toBe(false);
  });

  it("undoing an upgrade reverts the level AND refunds its gold cost", () => {
    const game = newGame(1e6);
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    const id = game.getSnapshot().nodes[0].id;
    const goldBefore = game.getSnapshot().currencies.gold;
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: id });
    let snap = game.getSnapshot();
    expect(snap.nodes[0].level).toBe(2);
    expect(snap.currencies.gold < goldBefore).toBe(true); // gold was spent
    game.undo();
    snap = game.getSnapshot();
    expect(snap.nodes[0].level).toBe(1); // level reverted
    expect(snap.currencies.gold).toBeCloseTo(goldBefore, 1e-6); // gold refunded
  });

  it("a new action clears the redo stack", () => {
    const game = newGame();
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    game.undo();
    expect(game.canRedo()).toBe(true);
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "smelter",
      recipeId: "r_iron_bar",
      pos: { x: 200, y: 0 },
    });
    expect(game.canRedo()).toBe(false);
  });

  it("non-undoable intents (e.g. a rejected action) push no history", () => {
    const game = newGame(0); // no gold
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    const id = game.getSnapshot().nodes[0].id;
    const undoDepth = game._undo.length;
    const r = game.dispatch({ type: INTENT.UpgradeNode, nodeId: id }); // can't afford
    expect(r.ok).toBe(false);
    expect(game._undo.length).toBe(undoDepth); // rejected -> no new history
  });
});
