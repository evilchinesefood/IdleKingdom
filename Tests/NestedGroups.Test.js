import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { migrate8to9 } from "../Source/Engine/Persistence/Migrations.js";

// Place N gatherers and return the game + their snapshot node ids.
function setup(n = 4, gold = 1e6) {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  const st = game.getState();
  st.currencies.gold = gold;
  delete st._solved;
  for (let i = 0; i < n; i++)
    game.dispatch({
      type: INTENT.PlaceNode,
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: i * 200, y: 0 },
    });
  const ids = game.getSnapshot().nodes.map((n) => n.id);
  return { game, ids };
}

const rect = (x = -10, y = -10, w = 340, h = 100) => ({ x, y, w, h });

function group(game, nodeIds, children, r = rect(), name) {
  return game.dispatch({
    type: INTENT.CreateBuilding,
    nodeIds,
    children,
    rect: r,
    name,
  });
}

const bById = (game, id) =>
  game.getSnapshot().buildings.find((b) => b.id === id);
const isTopLevel = (game, id) =>
  !game.getSnapshot().buildings.some((b) => (b.children || []).includes(id));

describe("NestedGroups — CreateBuilding with children", () => {
  it("nests selected groups as children; child stops being top-level", () => {
    const { game, ids } = setup(2);
    group(game, [ids[0]], undefined, rect(), "Child");
    const childId = game.getSnapshot().buildings[0].id;
    const out = group(game, [ids[1]], [childId], rect(), "Parent");
    expect(out.ok).toBe(true);
    const parent = game
      .getSnapshot()
      .buildings.find((b) => b.name === "Parent");
    expect(parent.children).toEqual([childId]);
    expect(isTopLevel(game, childId)).toBe(false);
    expect(isTopLevel(game, parent.id)).toBe(true);
  });

  it("defaults children to [] when none are given", () => {
    const { game, ids } = setup(1);
    group(game, [ids[0]]);
    expect(game.getSnapshot().buildings[0].children).toEqual([]);
  });

  it("rejects a build of only-already-nested children (nothing to group)", () => {
    const { game, ids } = setup(1);
    group(game, [ids[0]], undefined, rect(), "Child");
    const childId = game.getSnapshot().buildings[0].id;
    group(game, [], [childId], rect(), "Parent"); // nests the child
    // trying to nest the same (now non-top-level) child again, with no loose
    // nodes, leaves nothing valid to group -> reject.
    const out = group(game, [], [childId], rect(), "Again");
    expect(out.ok).toBe(false);
  });
});

describe("NestedGroups — MoveBuilding recurses", () => {
  it("moving a parent moves a node inside a CHILD group and the child rect", () => {
    const { game, ids } = setup(2);
    group(game, [ids[0]], undefined, rect(0, 0, 160, 100), "Child");
    const childId = game.getSnapshot().buildings[0].id;
    group(game, [ids[1]], [childId], rect(-10, -10, 500, 120), "Parent");
    const parentId = game
      .getSnapshot()
      .buildings.find((b) => b.name === "Parent").id;
    const childX0 = bById(game, childId).rect.x;
    const nodeX0 = game.getSnapshot().nodes.find((n) => n.id === ids[0]).pos.x;
    const out = game.dispatch({
      type: INTENT.MoveBuilding,
      buildingId: parentId,
      delta: { dx: 50, dy: 30 },
    });
    expect(out.ok).toBe(true);
    expect(bById(game, childId).rect.x).toBe(childX0 + 50);
    expect(game.getSnapshot().nodes.find((n) => n.id === ids[0]).pos.x).toBe(
      nodeX0 + 50,
    );
  });
});

describe("NestedGroups — DeleteBuilding recurses", () => {
  it("deleting a parent removes the child group's nodes AND the child building", () => {
    const { game, ids } = setup(2);
    group(game, [ids[0]], undefined, rect(), "Child");
    const childId = game.getSnapshot().buildings[0].id;
    group(game, [ids[1]], [childId], rect(), "Parent");
    const parentId = game
      .getSnapshot()
      .buildings.find((b) => b.name === "Parent").id;
    const out = game.dispatch({
      type: INTENT.DeleteBuilding,
      buildingId: parentId,
    });
    expect(out.ok).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(0); // parent + child both gone
    expect(snap.nodes.find((n) => n.id === ids[0])).toBe(undefined); // child's node gone
    expect(snap.nodes.find((n) => n.id === ids[1])).toBe(undefined); // parent's node gone
  });
});

describe("NestedGroups — UngroupBuilding (no recursion)", () => {
  it("ungrouping a parent keeps the child group + its nodes; parent nodes go loose", () => {
    const { game, ids } = setup(2);
    group(game, [ids[0]], undefined, rect(), "Child");
    const childId = game.getSnapshot().buildings[0].id;
    group(game, [ids[1]], [childId], rect(), "Parent");
    const parentId = game
      .getSnapshot()
      .buildings.find((b) => b.name === "Parent").id;
    const out = game.dispatch({
      type: INTENT.UngroupBuilding,
      buildingId: parentId,
    });
    expect(out.ok).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.buildings.find((b) => b.id === parentId)).toBe(undefined);
    expect(snap.buildings.find((b) => b.id === childId)).toBeTruthy(); // survives
    expect(isTopLevel(game, childId)).toBe(true); // now top-level
    expect(snap.nodes.find((n) => n.id === ids[0]).building).toBe(childId); // child node kept
    expect(snap.nodes.find((n) => n.id === ids[1]).building).toBe(null); // parent node loose
  });
});

describe("NestedGroups — RemoveNode prunes empty child from parent", () => {
  it("emptying a child group removes it AND prunes it from parent.children; a parent with another child survives", () => {
    const { game, ids } = setup(3);
    // two single-node child groups
    group(game, [ids[0]], undefined, rect(), "ChildA");
    const childA = game.getSnapshot().buildings[0].id;
    group(game, [ids[1]], undefined, rect(), "ChildB");
    const childB = game
      .getSnapshot()
      .buildings.find((b) => b.name === "ChildB").id;
    // parent with NO direct nodes, two nested children
    group(game, [], [childA, childB], rect(), "Parent");
    const parentId = game
      .getSnapshot()
      .buildings.find((b) => b.name === "Parent").id;
    // remove the only node in ChildA -> ChildA emptied + dropped + pruned
    game.dispatch({ type: INTENT.RemoveNode, nodeId: ids[0] });
    const snap = game.getSnapshot();
    expect(snap.buildings.find((b) => b.id === childA)).toBe(undefined); // child gone
    const parent = snap.buildings.find((b) => b.id === parentId);
    expect(parent).toBeTruthy(); // parent survives (still has ChildB) despite empty nodeIds
    expect(parent.children).toEqual([childB]); // childA pruned, childB kept
  });
});

describe("NestedGroups — migrate8to9", () => {
  it("defaults building children to []", () => {
    const v9 = migrate8to9({
      version: 8,
      graph: { buildings: [{ id: "b_0", nodeIds: ["n0"] }] },
    });
    expect(v9.version).toBe(9);
    expect(v9.graph.buildings[0].children).toEqual([]);
  });
});
