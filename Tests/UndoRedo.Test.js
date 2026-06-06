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

  it("MoveNodes is one undo entry: a single undo restores ALL moved positions", () => {
    const game = newGame();
    const place = (x, y) =>
      game.dispatch({
        type: INTENT.PlaceNode,
        kind: "gatherer",
        resourceId: "iron_ore",
        pos: { x, y },
      });
    place(0, 0);
    place(100, 0);
    const [a, b] = game.getSnapshot().nodes.map((n) => n.id);
    const depth = game._undo.length;
    game.dispatch({
      type: "MoveNodes",
      moves: [
        { id: a, x: 500, y: 500 },
        { id: b, x: 600, y: 600 },
      ],
    });
    expect(game._undo.length).toBe(depth + 1); // ONE history entry for the whole move
    const moved = game.getSnapshot().nodes;
    expect(moved.find((n) => n.id === a).pos).toEqual({ x: 500, y: 500 });
    expect(moved.find((n) => n.id === b).pos).toEqual({ x: 600, y: 600 });
    game.undo(); // single Ctrl+Z restores BOTH
    const back = game.getSnapshot().nodes;
    expect(back.find((n) => n.id === a).pos).toEqual({ x: 0, y: 0 });
    expect(back.find((n) => n.id === b).pos).toEqual({ x: 100, y: 0 });
  });
});

describe("Undo/redo — preserves LIVE stockpiles (task 1)", () => {
  // Build a gatherer (no consumer) so its output accrues to its own surplus, but
  // surplus only accrues to STORAGE rooms in applyTick. Use a storage room fed by
  // a gatherer so live stock builds up between intents.
  function storageGame() {
    const game = newGame(1e6);
    // gatherer -> storage(iron_ore). The storage accrues surplus into its stockpile.
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 0 },
    });
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "storage",
      pos: { x: 200, y: 0 },
    });
    const ids = game.getState().graph.nodes.map((n) => n.id);
    const gid = ids[0];
    const sid = ids[1];
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    game.dispatch({
      type: INTENT.ConnectLink,
      from: gid,
      to: sid,
      resourceId: "iron_ore",
    });
    return { game, gid, sid };
  }

  const stock = (game, id) =>
    game.getState().graph.nodes.find((n) => n.id === id).stockpile.iron_ore ||
    0;

  it("undo keeps live stock accrued AFTER the undone intent", () => {
    const { game, sid } = storageGame();
    game.tick(10); // accrue some stock into the storage room
    const before = stock(game, sid);
    expect(before > 0).toBe(true);
    // an undoable structural edit (place another gatherer) then more accrual
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 200 },
    });
    game.tick(10);
    const grown = stock(game, sid);
    expect(grown > before).toBe(true);
    game.undo(); // reverts the place; must NOT snap stock back to intent-time value
    expect(stock(game, sid)).toBeCloseTo(grown, 1e-6);
  });

  it("undo->tick->redo does not resurrect phantom stock", () => {
    const { game, sid } = storageGame();
    game.tick(10);
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 0, y: 200 },
    });
    game.undo();
    game.tick(10); // live accrual after the undo
    const live = stock(game, sid);
    game.redo(); // re-applies the place; must keep LIVE stock, not snapshot stock
    expect(stock(game, sid)).toBeCloseTo(live, 1e-6);
  });

  it("BuyResearch is NOT undoable: dispatching it pushes no history (task 5)", () => {
    const game = newGame(1e6);
    game.getState().currencies.research = 1e6;
    delete game.getState()._solved;
    const depth0 = game._undo.length;
    const r = game.dispatch({
      type: INTENT.BuyResearch,
      nodeId: "res_scholar",
    });
    expect(r.ok).toBe(true);
    expect(game.getState().unlocks.researchOwned.includes("res_scholar")).toBe(
      true,
    );
    expect(game._undo.length).toBe(depth0); // research is a commitment, not undoable
    expect(game.canUndo()).toBe(false);
  });

  it("undo of RemoveNode restores the deleted node's snapshot stock", () => {
    const { game, sid } = storageGame();
    game.tick(10);
    const snapStock = stock(game, sid);
    expect(snapStock > 0).toBe(true);
    game.dispatch({ type: INTENT.RemoveNode, nodeId: sid });
    expect(game.getState().graph.nodes.find((n) => n.id === sid)).toBe(
      undefined,
    );
    game.undo(); // un-delete: the resurrected node keeps its snapshot stock
    expect(stock(game, sid)).toBeCloseTo(snapStock, 1e-6);
  });
});
