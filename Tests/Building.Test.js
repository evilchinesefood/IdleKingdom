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

describe("Building — resize (re-captures membership)", () => {
  it("shrinking the box drops machines now outside it", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]); // both inside the wide box
    const bId = game.getSnapshot().buildings[0].id;
    expect(game.getSnapshot().buildings[0].nodeIds.length).toBe(2);
    // shrink the rect so only the gatherer (at x 0..120) stays inside; the UI
    // passes the recomputed nodeIds (here just the gatherer).
    const out = game.dispatch({
      type: INTENT.ResizeBuilding,
      buildingId: bId,
      rect: { x: -10, y: -10, w: 160, h: 120 },
      nodeIds: [g.id],
    });
    expect(out.ok).toBe(true);
    const b = game.getSnapshot().buildings[0];
    expect(b.nodeIds).toEqual([g.id]);
    expect(b.rect.w).toBe(160);
  });

  it("ignores ids already claimed by another building", () => {
    const { game, g, s } = setup();
    group(game, [g.id]); // building A = gatherer
    group(game, [s.id]); // building B = smelter
    const aId = game.getSnapshot().buildings[0].id;
    // try to grow A to also claim the smelter — reducer must refuse the stolen node
    game.dispatch({
      type: INTENT.ResizeBuilding,
      buildingId: aId,
      rect: { x: -10, y: -10, w: 340, h: 120 },
      nodeIds: [g.id, s.id],
    });
    const a = game.getSnapshot().buildings.find((x) => x.id === aId);
    expect(a.nodeIds).toEqual([g.id]); // smelter stays in building B
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

  it("copy cost = base structure + upgrades; structure-only is cheaper", () => {
    const { game, g, s } = setup(1e6);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: s.id }); // smelter -> L2
    group(game, [g.id, s.id]);
    const b = game.getSnapshot().buildings[0];
    // structure rebuild = gatherer upgradeBase (15) + smelter upgradeBase (25)
    expect(b.copyCostStructure).toBeCloseTo(40, 1e-6);
    // full copy also pays the smelter's L1->L2 upgrade, so it costs strictly more
    expect(b.copyCost > b.copyCostStructure).toBe(true);
  });

  it("structure-only copy duplicates machines at L1 and charges the structure cost", () => {
    const { game, g, s } = setup(1e6);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: s.id }); // smelter -> L2
    group(game, [g.id, s.id]);
    let snap = game.getSnapshot();
    const b = snap.buildings[0];
    const goldBefore = snap.currencies.gold;
    const nodesBefore = snap.nodes.length;
    const out = game.dispatch({
      type: INTENT.CopyBuilding,
      buildingId: b.id,
      offset: { dx: 0, dy: 200 },
      withUpgrades: false,
    });
    expect(out.ok).toBe(true);
    snap = game.getSnapshot();
    expect(snap.nodes.length).toBe(nodesBefore + 2);
    expect(snap.buildings.length).toBe(2);
    expect(snap.currencies.gold).toBeCloseTo(
      goldBefore - b.copyCostStructure,
      1e-6,
    );
    // the duplicated smelter is reset to L1 (clean structure), original stays L2
    const smelters = snap.nodes.filter((n) => n.kind === "smelter");
    expect(smelters.some((n) => n.level === 1)).toBe(true);
    expect(smelters.some((n) => n.level === 2)).toBe(true);
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

  it("DeleteBuilding removes the building AND its machines + their links", () => {
    const { game, g, s } = setup(); // gatherer -> smelter, linked
    group(game, [g.id, s.id]);
    const bId = game.getSnapshot().buildings[0].id;
    expect(game.getSnapshot().links.length).toBe(1);
    const out = game.dispatch({ type: INTENT.DeleteBuilding, buildingId: bId });
    expect(out.ok).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(0);
    expect(snap.nodes.length).toBe(0); // both machines gone
    expect(snap.links.length).toBe(0); // their link gone too
    // rejects an unknown building
    expect(
      game.dispatch({ type: INTENT.DeleteBuilding, buildingId: "b_nope" }).ok,
    ).toBe(false);
  });

  it("RemoveFromBuilding drops one machine but keeps the rest of the group", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id]); // building with both machines
    const bId = game.getSnapshot().buildings[0].id;
    const out = game.dispatch({
      type: INTENT.RemoveFromBuilding,
      nodeId: g.id,
    });
    expect(out.ok).toBe(true);
    let snap = game.getSnapshot();
    expect(snap.buildings.length).toBe(1); // building survives with the smelter
    expect(snap.buildings[0].id).toBe(bId);
    expect(snap.buildings[0].nodeIds).toEqual([s.id]);
    expect(snap.nodes.find((n) => n.id === g.id).building).toBe(null); // freed
    expect(snap.nodes.length).toBe(2); // both machines still exist
    // removing the last member drops the (now empty) building
    game.dispatch({ type: INTENT.RemoveFromBuilding, nodeId: s.id });
    expect(game.getSnapshot().buildings.length).toBe(0);
  });

  it("rejects RemoveFromBuilding for a machine not in any building", () => {
    const { game, g } = setup();
    expect(
      game.dispatch({ type: INTENT.RemoveFromBuilding, nodeId: g.id }).ok,
    ).toBe(false);
  });

  it("AddToBuilding adds an ungrouped machine to an existing building", () => {
    const { game, g, s } = setup();
    group(game, [g.id]); // building with just the gatherer
    const bId = game.getSnapshot().buildings[0].id;
    const out = game.dispatch({
      type: INTENT.AddToBuilding,
      nodeId: s.id,
      buildingId: bId,
    });
    expect(out.ok).toBe(true);
    const b = game.getSnapshot().buildings[0];
    expect(b.nodeIds.includes(s.id)).toBe(true);
    expect(b.nodeIds.length).toBe(2);
    // a machine already in a building can't be re-added
    expect(
      game.dispatch({
        type: INTENT.AddToBuilding,
        nodeId: s.id,
        buildingId: bId,
      }).ok,
    ).toBe(false);
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

  it("rejects empty/whitespace and no-op renames (no phantom undo entry)", () => {
    const { game, g, s } = setup();
    group(game, [g.id, s.id], undefined, "Foundry");
    const bId = game.getSnapshot().buildings[0].id;
    expect(
      game.dispatch({
        type: INTENT.RenameBuilding,
        buildingId: bId,
        name: "   ",
      }).ok,
    ).toBe(false);
    expect(
      game.dispatch({
        type: INTENT.RenameBuilding,
        buildingId: bId,
        name: "Foundry",
      }).ok,
    ).toBe(false); // unchanged -> rejected
    // a genuine change is still accepted
    const ok = game.dispatch({
      type: INTENT.RenameBuilding,
      buildingId: bId,
      name: "Smithy",
    });
    expect(ok.ok).toBe(true);
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
