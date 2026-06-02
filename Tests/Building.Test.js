import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";

// Place a gatherer -> smelter, connect them, and grab their snapshot ids.
function setup(gold = 1e6) {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  const st = game.getState();
  st.currencies.gold = gold;
  delete st._solved;
  game.dispatch({
    type: INTENT.PlaceNode,
    kind: "gatherer",
    resourceId: "iron_ore",
    pos: { x: 0, y: 0 },
  });
  game.dispatch({
    type: INTENT.PlaceNode,
    kind: "smelter",
    recipeId: "r_iron_bar",
    pos: { x: 200, y: 0 },
  });
  let snap = game.getSnapshot();
  const g = snap.nodes.find((n) => n.kind === "gatherer");
  const s = snap.nodes.find((n) => n.kind === "smelter");
  game.dispatch({
    type: INTENT.ConnectLink,
    from: g.id,
    to: s.id,
    resourceId: "iron_ore",
  });
  return { game, g, s };
}

function group(game, ids, rect = { x: -10, y: -10, w: 340, h: 100 }, name) {
  return game.dispatch({
    type: INTENT.CreateBuilding,
    nodeIds: ids,
    rect,
    name,
  });
}

describe("Building — create / membership", () => {
  it("groups machines into a named building exposed in the snapshot", () => {
    const { game, g, s } = setup();
    const out = group(game, [g.id, s.id], undefined, "Foundry");
    expect(out.ok).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(1);
    const b = snap.buildings[0];
    expect(b.name).toBe("Foundry");
    expect(b.nodeIds.length).toBe(2);
    // each member node reports its building id
    const gn = snap.nodes.find((n) => n.id === g.id);
    expect(gn.building).toBe(b.id);
  });

  it("rejects grouping nodes that are already in a building", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]);
    const out = group(game, [g.id, s.id]);
    expect(out.ok).toBe(false);
  });
});

describe("Building — move (as a unit)", () => {
  it("translates the rect and every member node by the delta", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]);
    let snap = game.getSnapshot();
    const b0 = snap.buildings[0];
    const gx0 = snap.nodes.find((n) => n.id === g.id).pos.x;
    const out = game.dispatch({
      type: INTENT.MoveBuilding,
      buildingId: b0.id,
      delta: { dx: 50, dy: 30 },
    });
    expect(out.ok).toBe(true);
    snap = game.getSnapshot();
    expect(snap.buildings[0].rect.x).toBe(b0.rect.x + 50);
    expect(snap.nodes.find((n) => n.id === g.id).pos.x).toBe(gx0 + 50);
  });
});

describe("Building — copy", () => {
  it("duplicates machines (kind+level) and internal links, charging the rebuild cost", () => {
    const { game, g, s } = setup(1e6);
    // upgrade the smelter once so the copy isn't free
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: s.id });
    group(game, [g.id, s.id]);
    let snap = game.getSnapshot();
    const b = snap.buildings[0];
    expect(b.copyCost > 0).toBe(true);
    const goldBefore = snap.currencies.gold;
    const nodesBefore = snap.nodes.length;
    const linksBefore = snap.links.length;
    const out = game.dispatch({
      type: INTENT.CopyBuilding,
      buildingId: b.id,
      offset: { dx: 0, dy: 200 },
    });
    expect(out.ok).toBe(true);
    snap = game.getSnapshot();
    expect(snap.nodes.length).toBe(nodesBefore + 2); // both machines duplicated
    expect(snap.links.length).toBe(linksBefore + 1); // internal link duplicated
    expect(snap.buildings.length).toBe(2);
    expect(snap.currencies.gold).toBeCloseTo(goldBefore - b.copyCost, 1e-6);
    // the duplicated smelter keeps its level
    const smelters = snap.nodes.filter((n) => n.kind === "smelter");
    expect(smelters.every((n) => n.level === 2)).toBe(true);
  });

  it("rejects the copy when gold is insufficient", () => {
    const { game, g, s } = setup(1e6);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: s.id });
    group(game, [g.id, s.id]);
    game.getState().currencies.gold = 0;
    delete game.getState()._solved;
    const out = game.dispatch({
      type: INTENT.CopyBuilding,
      buildingId: game.getSnapshot().buildings[0].id,
      offset: { dx: 0, dy: 200 },
    });
    expect(out.ok).toBe(false);
  });
});

describe("Building — ungroup / rename / node removal", () => {
  it("ungroup removes the building but keeps the machines", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]);
    const bId = game.getSnapshot().buildings[0].id;
    const out = game.dispatch({
      type: INTENT.UngroupBuilding,
      buildingId: bId,
    });
    expect(out.ok).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(0);
    expect(snap.nodes.length).toBe(2); // machines remain
  });

  it("rename updates the displayed name", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]);
    const bId = game.getSnapshot().buildings[0].id;
    game.dispatch({
      type: INTENT.RenameBuilding,
      buildingId: bId,
      name: "Smithy",
    });
    expect(game.getSnapshot().buildings[0].name).toBe("Smithy");
  });

  it("removing a member node prunes it; emptying a building drops it", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]);
    game.dispatch({ type: INTENT.RemoveNode, nodeId: g.id });
    let snap = game.getSnapshot();
    expect(snap.buildings[0].nodeIds.length).toBe(1);
    game.dispatch({ type: INTENT.RemoveNode, nodeId: s.id });
    snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(0);
  });
});
