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

describe("Storage Room — availability & rule", () => {
  it("is placeable from the start", () => {
    const game = newGame();
    expect(
      game.getSnapshot().buildMenu.placeableMachines.includes("storage"),
    ).toBe(true);
    const id = place(game, "storage");
    const n = game.getState().graph.nodes.find((x) => x.id === id);
    expect(n.kind).toBe("storage");
    expect(n.level).toBe(1);
    expect(n.resourceId).toBe(null);
  });

  it("SetStorageRule assigns what the room holds", () => {
    const game = newGame();
    const id = place(game, "storage");
    const out = game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceId: "iron_ore",
    });
    expect(out.ok).toBe(true);
    expect(
      game.getState().graph.nodes.find((x) => x.id === id).resourceId,
    ).toBe("iron_ore");
  });

  it("rejects an unknown resource and non-storage targets", () => {
    const game = newGame();
    const sid = place(game, "storage");
    expect(
      game.dispatch({
        type: INTENT.SetStorageRule,
        nodeId: sid,
        resourceId: "not_a_resource",
      }).ok,
    ).toBe(false);
    const gid = place(game, "gatherer", { resourceId: "iron_ore" }, 200);
    expect(
      game.dispatch({
        type: INTENT.SetStorageRule,
        nodeId: gid,
        resourceId: "iron_ore",
      }).ok,
    ).toBe(false);
  });

  it("changing the held resource dumps the old contents", () => {
    const game = newGame();
    const id = place(game, "storage");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceId: "iron_ore",
    });
    const node = game.getState().graph.nodes.find((x) => x.id === id);
    node.stockpile = { iron_ore: 42 };
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: id,
      resourceId: "timber",
    });
    expect(
      game.getState().graph.nodes.find((x) => x.id === id).stockpile.iron_ore,
    ).toBe(undefined);
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
      resourceId: "iron_ore",
    });
    const st = game.getState();
    // gatherer -> storage carrying its held resource is legal
    expect(isValidLink(st, content, gid, sid, "iron_ore")).toBe(true);
    // a different resource is rejected (room holds iron_ore only)
    expect(isValidLink(st, content, gid, sid, "timber")).toBe(false);
    // storage -> market carrying the held resource is legal (storage emits it)
    const mid = place(game, "market", {}, 400);
    expect(isValidLink(game.getState(), content, sid, mid, "iron_ore")).toBe(
      true,
    );
  });

  it("emits nothing until a rule is set", () => {
    const game = newGame();
    const sid = place(game, "storage");
    const mid = place(game, "market", {}, 200);
    // no resourceId yet -> storage has no output port
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
    resourceId: "iron_ore",
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
    // direct gatherer -> market for the baseline gold rate
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

    // routing the same gatherer through a storage room yields the same gold
    const game = newGame();
    chain(game, true);
    expect(game.getSnapshot().rates.goldRate).toBeCloseTo(directGold, 1e-9);
  });

  it("output is capped at the passthrough rate", () => {
    const game = newGame();
    const { sid } = chain(game, true);
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    // 1/s in (one L1 gatherer) is well under the L1 passthrough cap (10/s)
    expect(sn.throughput).toBeCloseTo(1.0, 1e-9);
    expect(sn.capacity).toBeCloseTo(10.0, 1e-9);
  });

  it("clamps passthrough at the cap; excess inflow becomes (undrained) surplus", () => {
    const game = newGame();
    const sid = place(game, "storage", {}, 0);
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceId: "iron_ore",
    });
    // 12 gatherers * 1/s = 12/s into an L1 storage whose passthrough cap is 10/s,
    // with no downstream link so all passthrough accrues as surplus.
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
    expect(solved.surplusRate[sid].iron_ore).toBeCloseTo(10, 1e-9); // all stored
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    expect(sn.atCapacity).toBe(true);
    expect(sn.starved).toBe(false); // ceiling, not demand -> never starved
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
      resourceId: "iron_ore",
    });
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: s2,
      resourceId: "iron_ore",
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
    expect(link.fedPct).toBeCloseTo(1, 1e-9); // gatherer delivers 100% of its output
  });
});

describe("Storage Room — offline auto-sell exclusion", () => {
  it("a held buffer is preserved across an offline sweep (not liquidated)", () => {
    const game = newGame();
    const sid = place(game, "storage");
    game.dispatch({
      type: INTENT.SetStorageRule,
      nodeId: sid,
      resourceId: "iron_ore",
    });
    const state = game.getState();
    state.unlocks.autoSell = true; // res_quartermaster
    state.lastSeen = 0;
    state.graph.nodes.find((n) => n.id === sid).stockpile = { iron_ore: 100 };
    const goldBefore = state.currencies.gold;
    applyOffline(state, content, 60 * 1000); // 60s offline catch-up
    const node = state.graph.nodes.find((n) => n.id === sid);
    expect(node.stockpile.iron_ore).toBeCloseTo(100, 1e-9); // buffer kept
    expect(state.currencies.gold).toBeCloseTo(goldBefore, 1e-9); // nothing sold
  });
});

describe("Storage Room — capacity & stockpile clamp", () => {
  it("capacity grows with level", () => {
    expect(storageCapacity({ kind: "storage", level: 1 }, content)).toBe(100);
    expect(storageCapacity({ kind: "storage", level: 2 }, content)).toBe(200);
    expect(storageCapacity({ kind: "gatherer", level: 5 }, content)).toBe(0);
  });

  it("undrained inflow accrues to the stockpile, clamped at capacity", () => {
    const game = newGame();
    const { sid } = chain(game, false); // no market -> all passthrough is surplus
    const state = game.getState();
    const node = state.graph.nodes.find((n) => n.id === sid);
    node.stockpile = {};
    const solved = solve(state, content);
    applyTick(state, solved, 50); // 1/s * 50s
    expect(node.stockpile.iron_ore).toBeCloseTo(50, 1e-9);
    applyTick(state, solved, 100); // would be 150, clamps at baseCap 100
    expect(node.stockpile.iron_ore).toBeCloseTo(100, 1e-9);
  });

  it("snapshot reports storedTotal and storageCap for a storage node", () => {
    const game = newGame();
    const { sid } = chain(game, false);
    const state = game.getState();
    state.graph.nodes.find((n) => n.id === sid).stockpile = { iron_ore: 30 };
    delete state._solved;
    const sn = game.getSnapshot().nodes.find((n) => n.id === sid);
    expect(sn.storageCap).toBe(100);
    expect(sn.storedTotal).toBeCloseTo(30, 1e-9);
  });
});
