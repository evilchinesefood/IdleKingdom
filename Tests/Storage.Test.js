import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { applyTick } from "../Source/Engine/Simulation/Tick.js";
import { applyOffline } from "../Source/Engine/Simulation/Offline.js";
import { storageCapacity } from "../Source/Engine/Systems/EconomySystem.js";
import { isValidLink } from "../Source/Engine/Simulation/Topology.js";

function newGame(gold = 1e6) {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  const st = game.getState();
  st.currencies.gold = gold;
  delete st._solved;
  return game;
}

function place(game, kind, extra = {}, x = 0) {
  game.dispatch({ type: INTENT.PlaceNode, kind, pos: { x, y: 0 }, ...extra });
  const nodes = game.getState().graph.nodes;
  return nodes[nodes.length - 1].id;
}

const nodeById = (game, id) =>
  game.getState().graph.nodes.find((x) => x.id === id);

describe("Storage Room — availability & rule", () => {
  it("is placeable from the start", () => {
    const game = newGame();
    expect(
      game.getSnapshot().buildMenu.placeableMachines.includes("storage"),
    ).toBe(true);
    const id = place(game, "storage");
    const n = nodeById(game, id);
    expect(n.kind).toBe("storage");
    expect(n.level).toBe(1);
    expect(n.resourceIds || []).toEqual([]); // holds nothing until configured
  });

  it("SetStorageRule assigns the resources the room holds", () => {
    const game = newGame();
    const id = place(game, "storage");
    const out = game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceIds: ["iron_ore"],
    });
    expect(out.ok).toBe(true);
    expect(nodeById(game, id).resourceIds).toEqual(["iron_ore"]);
  });

  it("holds up to `level` types; over-selection is capped, upgrading raises it", () => {
    const game = newGame();
    const id = place(game, "storage");
    // L1 storage keeps at most 1 type even if two are selected
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceIds: ["iron_ore", "timber"],
    });
    expect(nodeById(game, id).resourceIds.length).toBe(1);
    // upgrading to L2 raises the limit to 2 types
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: id });
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceIds: ["iron_ore", "timber"],
    });
    expect(nodeById(game, id).resourceIds).toEqual(["iron_ore", "timber"]);
  });

  it("filters unknown resources and rejects non-storage targets", () => {
    const game = newGame();
    const sid = place(game, "storage");
    // unknown resources are silently dropped (accepted, holds nothing)
    const u = game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["not_a_resource"],
    });
    expect(u.ok).toBe(true);
    expect(nodeById(game, sid).resourceIds).toEqual([]);
    // a non-storage node is rejected
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 200);
    expect(
      game.dispatch({
        type: INTENT.SetStorageRule,
        nodeId: gid,
        resourceIds: ["iron_ore"],
      }).ok,
    ).toBe(false);
  });

  it("changing the held resources dumps the dropped contents", () => {
    const game = newGame();
    const id = place(game, "storage");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceIds: ["iron_ore"],
    });
    nodeById(game, id).stockpile = { iron_ore: 42 };
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceIds: ["timber"],
    });
    expect(nodeById(game, id).stockpile.iron_ore).toBe(undefined);
  });
});

describe("Storage Room — port legality", () => {
  it("accepts and outputs only its held resource", () => {
    const game = newGame();
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const sid = place(game, "storage", {}, 200);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    const st = game.getState();
    expect(isValidLink(st, content, gid, sid, "iron_ore")).toBe(true);
    expect(isValidLink(st, content, gid, sid, "timber")).toBe(false);
    const mid = place(game, "market", {}, 400);
    expect(isValidLink(game.getState(), content, sid, mid, "iron_ore")).toBe(
      true,
    );
  });

  it("emits nothing until a rule is set", () => {
    const game = newGame();
    const sid = place(game, "storage");
    const mid = place(game, "market", {}, 200);
    expect(isValidLink(game.getState(), content, sid, mid, "iron_ore")).toBe(
      false,
    );
  });
});

// Build gatherer(iron_ore) -> storage(iron_ore) -> [optional market]. Returns ids.
function chain(game, withMarket) {
  const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
  const sid = place(game, "storage", {}, 200);
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
  let mid = null;
  if (withMarket) {
    mid = place(game, "market", {}, 400);
    game.dispatch({
      type: INTENT.ConnectLink,
      from: sid,
      to: mid,
      resourceId: "iron_ore",
    });
  }
  return { gid, sid, mid };
}

describe("Storage Room — passthrough (rate solve)", () => {
  it("passes its resource through to a downstream consumer", () => {
    const direct = newGame();
    const dgid = place(direct, "gatherer", { resourceId: "iron_ore" }, 0);
    const dmid = place(direct, "market", {}, 200);
    direct.dispatch({
      type: INTENT.ConnectLink,
      from: dgid,
      to: dmid,
      resourceId: "iron_ore",
    });
    const directGold = direct.getSnapshot().rates.goldRate;
    expect(directGold > 0).toBe(true);

    const game = newGame();
    chain(game, true);
    expect(game.getSnapshot().rates.goldRate).toBeCloseTo(directGold, 1e-9);
  });

  it("output is capped at the passthrough rate", () => {
    const game = newGame();
    const { sid } = chain(game, true);
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    expect(sn.throughput).toBeCloseTo(1.0, 1e-9);
    expect(sn.capacity).toBeCloseTo(10.0, 1e-9);
  });

  it("passes multiple held resources through independently", () => {
    const game = newGame();
    const sid = place(game, "storage", {}, 200);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: sid }); // L2 -> 2 types
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore", "timber"],
    });
    const gi = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    // timber needs a gatherer too; place one and connect (timber gather is gated,
    // but the SOLVE only needs the link + a producer of timber — use a 2nd gatherer
    // forced to iron_ore won't help, so connect iron_ore only and assert it flows).
    game.dispatch({
      type: INTENT.ConnectLink,
      from: gi,
      to: sid,
      resourceId: "iron_ore",
    });
    const state = game.getState();
    delete state._solved;
    const solved = solve(state, content);
    expect(solved.availableOut[sid].iron_ore).toBeCloseTo(1, 1e-9);
  });

  it("clamps passthrough at the cap; excess inflow becomes (undrained) surplus", () => {
    const game = newGame();
    const sid = place(game, "storage", {}, 0);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    for (let i = 0; i < 12; i++) {
      const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 100 + i);
      game.dispatch({
        type: INTENT.ConnectLink,
        from: gid,
        to: sid,
        resourceId: "iron_ore",
      });
    }
    const state = game.getState();
    delete state._solved;
    const solved = solve(state, content);
    expect(solved.availableOut[sid].iron_ore).toBeCloseTo(10, 1e-9); // min(10,12)
    expect(solved.surplusRate[sid].iron_ore).toBeCloseTo(10, 1e-9);
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    expect(sn.atCapacity).toBe(true);
    expect(sn.starved).toBe(false);
  });

  it("chains storage -> storage and stays a passive buffer (same gold as direct)", () => {
    const direct = newGame();
    const dg = place(direct, "gatherer", { resourceId: "iron_ore" }, 0);
    const dm = place(direct, "market", {}, 200);
    direct.dispatch({
      type: INTENT.ConnectLink,
      from: dg,
      to: dm,
      resourceId: "iron_ore",
    });
    const directGold = direct.getSnapshot().rates.goldRate;

    const game = newGame();
    const g = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const s1 = place(game, "storage", {}, 150);
    const s2 = place(game, "storage", {}, 300);
    const m = place(game, "market", {}, 450);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: s1,
      resourceIds: ["iron_ore"],
    });
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: s2,
      resourceIds: ["iron_ore"],
    });
    game.dispatch({
      type: INTENT.ConnectLink,
      from: g,
      to: s1,
      resourceId: "iron_ore",
    });
    game.dispatch({
      type: INTENT.ConnectLink,
      from: s1,
      to: s2,
      resourceId: "iron_ore",
    });
    game.dispatch({
      type: INTENT.ConnectLink,
      from: s2,
      to: m,
      resourceId: "iron_ore",
    });
    expect(game.getSnapshot().rates.goldRate).toBeCloseTo(directGold, 1e-9);
    const snaps = game.getSnapshot().nodes;
    expect(snaps.find((n) => n.id === s1).starved).toBe(false);
    expect(snaps.find((n) => n.id === s2).starved).toBe(false);
  });

  it("feed link into a fully-supplied storage is not flagged starved", () => {
    const game = newGame();
    const { gid, sid } = chain(game, true);
    const link = game
      .getSnapshot()
      .links.find((l) => l.from === gid && l.to === sid);
    expect(link.fedPct).toBeCloseTo(1, 1e-9);
  });
});

describe("Storage Room — offline auto-sell exclusion", () => {
  it("a held buffer is preserved across an offline sweep (not liquidated)", () => {
    const game = newGame();
    const sid = place(game, "storage");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    const state = game.getState();
    state.unlocks.autoSell = true; // res_quartermaster
    state.lastSeen = 0;
    state.graph.nodes.find((n) => n.id === sid).stockpile = { iron_ore: 100 };
    const goldBefore = state.currencies.gold;
    applyOffline(state, content, 60 * 1000);
    const node = state.graph.nodes.find((n) => n.id === sid);
    expect(node.stockpile.iron_ore).toBeCloseTo(100, 1e-9);
    expect(state.currencies.gold).toBeCloseTo(goldBefore, 1e-9);
  });
});

describe("Storage Room — capacity & stockpile clamp", () => {
  it("capacity grows with level (shared total = 200*level)", () => {
    expect(storageCapacity({ kind: "storage", level: 1 }, content)).toBe(200);
    expect(storageCapacity({ kind: "storage", level: 2 }, content)).toBe(400);
    expect(storageCapacity({ kind: "storage", level: 3 }, content)).toBe(600);
    expect(storageCapacity({ kind: "gatherer", level: 5 }, content)).toBe(0);
  });

  it("undrained inflow accrues to the stockpile, clamped at the shared cap", () => {
    const game = newGame();
    const { sid } = chain(game, false); // no market -> all passthrough is surplus
    const state = game.getState();
    const node = state.graph.nodes.find((n) => n.id === sid);
    node.stockpile = {};
    const solved = solve(state, content);
    applyTick(state, solved, 150); // 1/s * 150s
    expect(node.stockpile.iron_ore).toBeCloseTo(150, 1e-9);
    applyTick(state, solved, 100); // would be 250, clamps at L1 cap 200
    expect(node.stockpile.iron_ore).toBeCloseTo(200, 1e-9);
  });

  it("the cap is a SHARED pool across types, not per-type", () => {
    // L2 storage (cap 400) holding two types: the SUM is clamped at 400, not 2*400.
    const game = newGame();
    const sid = place(game, "storage", {}, 0);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: sid }); // -> L2, cap 400, 2 types
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore", "timber"],
    });
    const node = game.getState().graph.nodes.find((n) => n.id === sid);
    node.stockpile = { iron_ore: 150, timber: 150 }; // 300 total, 100 room left
    const solved = { surplusRate: { [sid]: { iron_ore: 100, timber: 100 } } };
    applyTick(game.getState(), solved, 1); // try to add 200 more (only 100 fits)
    const total = (node.stockpile.iron_ore || 0) + (node.stockpile.timber || 0);
    expect(total).toBeCloseTo(400, 1e-9); // clamped at the shared 400, not 500
  });

  it("non-storage machines do NOT accrue a stockpile", () => {
    const game = newGame();
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 0); // surplus, no consumer
    const state = game.getState();
    delete state._solved;
    const solved = solve(state, content);
    applyTick(state, solved, 10);
    const g = state.graph.nodes.find((n) => n.id === gid);
    expect(Object.keys(g.stockpile || {}).length).toBe(0);
  });

  it("snapshot reports storedTotal and storageCap for a storage node", () => {
    const game = newGame();
    const { sid } = chain(game, false);
    const state = game.getState();
    state.graph.nodes.find((n) => n.id === sid).stockpile = { iron_ore: 30 };
    delete state._solved;
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    expect(sn.storageCap).toBe(200);
    expect(sn.storedTotal).toBeCloseTo(30, 1e-9);
  });
});

describe("SetStorageRule — outbound links follow the held types", () => {
  const connect = (game, from, to, resourceId) =>
    game.dispatch({ type: INTENT.ConnectLink, from, to, resourceId });

  it("re-points a stale outbound link to the new primary type", () => {
    const game = newGame();
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const sid = place(game, "storage", {}, 200);
    const mid = place(game, "market", {}, 400);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    connect(game, gid, sid, "iron_ore");
    connect(game, sid, mid, "iron_ore");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["coal_raw"],
    });
    const links = game.getState().graph.links;
    expect(links.find((l) => l.from === sid && l.to === mid).resourceId).toBe(
      "coal_raw",
    );
    // the inbound feed link is NOT touched (rewrite is outbound-only)
    expect(links.find((l) => l.from === gid && l.to === sid).resourceId).toBe(
      "iron_ore",
    );
  });

  it("keeps still-held links; re-points only stale ones without duplicating a triple", () => {
    const game = newGame();
    const sid = place(game, "storage", {}, 0);
    game.dispatch({ type: INTENT.UpgradeNode, nodeId: sid }); // L2 -> 2 types
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore", "coal_raw"],
    });
    const mid = place(game, "market", {}, 300);
    connect(game, sid, mid, "iron_ore");
    connect(game, sid, mid, "coal_raw");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore", "timber"],
    });
    const out = game.getState().graph.links.filter((l) => l.from === sid);
    expect(out.filter((l) => l.resourceId === "iron_ore").length).toBe(1); // untouched, no dup
    expect(out.filter((l) => l.resourceId === "timber").length).toBe(1); // stale followed
  });

  it("clearing the rule leaves links untouched (dead link stays visible)", () => {
    const game = newGame();
    const sid = place(game, "storage", {}, 0);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    const mid = place(game, "market", {}, 300);
    connect(game, sid, mid, "iron_ore");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: [],
    });
    expect(
      game.getState().graph.links.find((l) => l.from === sid).resourceId,
    ).toBe("iron_ore");
  });

  it("flow resumes immediately after a chain retype, no link re-draw needed", () => {
    const game = newGame();
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 0);
    const sid = place(game, "storage", {}, 200);
    const mid = place(game, "market", {}, 400);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["iron_ore"],
    });
    connect(game, gid, sid, "iron_ore");
    connect(game, sid, mid, "iron_ore");
    const st0 = game.getState();
    delete st0._solved;
    const linkId = st0.graph.links.find(
      (l) => l.from === sid && l.to === mid,
    ).id;
    expect(solve(st0, content).linkFlow[linkId] > 0).toBe(true);
    // retype the whole chain to timber (gather gating bypassed, as elsewhere)
    game.getState().unlocks.gathererResources = ["timber"];
    game.dispatch({
      type: INTENT.SetGathererResource,
      nodeId: gid,
      resourceId: "timber",
    });
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceIds: ["timber"],
    });
    const st1 = game.getState();
    delete st1._solved;
    expect(solve(st1, content).linkFlow[linkId] > 0).toBe(true);
  });
});
