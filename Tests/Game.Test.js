import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { START_STATE } from "../Source/Engine/Content/StartState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { Game } from "../Source/Engine/Game.js";
import { seededState } from "./Fixtures/Seeded.js";
import { NewGame } from "../Source/Engine/GameState.js";
import {
  serialize,
  SAVE_KEY,
} from "../Source/Engine/Persistence/SaveManager.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
  startState: START_STATE,
};

function makeGame(clock) {
  return new Game({ content, clock: clock || new FakeClock(0) });
}

// Boot a game and inject the classic Mine -> Smelt -> Market chain so facade
// tests have a producing factory (the live game starts with an empty graph).
function bootSeeded(g, clock) {
  g.bootstrap(new MemoryStorageAdapter());
  g.getState().graph = seededState(clock || new FakeClock(0)).graph;
  delete g.getState()._solved;
  return g;
}

describe("Game facade", () => {
  it("bootstrap on empty storage starts a new game and returns an offline summary", () => {
    const g = makeGame(new FakeClock(0));
    const summary = g.bootstrap(new MemoryStorageAdapter());
    expect(summary !== null && typeof summary === "object").toBe(true);
    expect(typeof summary.appliedMs === "number").toBe(true);
    expect(g.getState().currencies.gold).toBeCloseTo(50, 1e-9);
  });

  it("dispatch routes a legal intent and returns ok; rejects an illegal one", () => {
    const g = bootSeeded(makeGame(new FakeClock(0)));
    const ok = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(ok.ok).toBe(true);
    expect(
      g.getState().graph.nodes.find((n) => n.id === "n_miner_0").level,
    ).toBe(2);
    // drain gold then reject
    g.getState().currencies.gold = 0;
    const bad = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(bad.ok).toBe(false);
    expect(typeof bad.error === "string").toBe(true);
  });

  it("dispatch emits a snapshot to subscribers", () => {
    const g = bootSeeded(makeGame(new FakeClock(0)));
    let last = null;
    const off = g.onSnapshot((snap) => {
      last = snap;
    });
    g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(last !== null).toBe(true);
    expect(Object.isFrozen(last)).toBe(true);
    expect(last.nodes.find((n) => n.id === "n_miner_0").level).toBe(2);
    off();
    last = null;
    g.dispatch({ type: "DismissTutorial" });
    expect(last).toBe(null); // unsubscribed
  });

  it("surfaces a rejected dispatch as lastError for exactly one snapshot (flash-once)", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    let last = null;
    g.onSnapshot((snap) => {
      last = snap;
    });
    // make an UpgradeNode unaffordable so the reducer rejects it
    g.getState().currencies.gold = 0;
    const bad = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(bad.ok).toBe(false);
    // the rejected dispatch still emits a snapshot, carrying the error
    expect(typeof last.lastError === "string").toBe(true);
    // the very next emitted snapshot clears it
    g.emitSnapshotForFrame();
    expect(last.lastError).toBe(null);
  });

  it("tick integrates rates over dt without emitting per call", () => {
    const g = bootSeeded(makeGame(new FakeClock(0)));
    let emits = 0;
    g.onSnapshot(() => {
      emits++;
    });
    const gold0 = g.getState().currencies.gold;
    g.tick(10); // 10 seconds at 2.0 gold/s -> +20 gold
    expect(g.getState().currencies.gold).toBeCloseTo(gold0 + 20, 1e-9);
    expect(emits).toBe(0); // tick does not emit
    g.emitSnapshotForFrame();
    expect(emits).toBe(1);
  });

  it("tick resolves a siege when accumulated progress crosses the next cost: emits + reclaims + re-solves", () => {
    const clock = new FakeClock(0);
    const g = makeGame(clock);
    g.bootstrap(new MemoryStorageAdapter()); // empty graph -> no siege accrual on its own
    // prefill siege progress just past t_gatehouse's cost (40)
    g.getState().siege.progress = TERRITORIES.t_gatehouse.siegeCost + 1;
    delete g.getState()._solved;
    let emits = 0;
    g.onSnapshot(() => emits++);
    g.tick(0.1); // a single tick: tryAdvanceSiege fells t_gatehouse
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(
      true,
    );
    expect(emits).toBe(1); // discrete reclaim event emits exactly once
    // _solved was cleared before tick; non-undefined proves tick re-solved
    expect(g.getState()._solved !== undefined).toBe(true);
  });

  it("a passive siege reclaim keeps undo history valid — history holds graph only, never unlocks (deep-review C1)", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter()); // empty graph -> no siege accrual on its own
    // an UNDOABLE intent records an undo entry (graph only)
    const r = g.dispatch({
      type: "PlaceNode",
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x: 100, y: 100 },
    });
    expect(r.ok).toBe(true);
    expect(g.canUndo()).toBe(true);
    // gatehouse not yet reclaimed; its production bonus has not applied
    expect(g.getState().unlocks.productionBonuses.gatherer).toBeCloseTo(
      1.0,
      1e-9,
    );

    // push siege progress past t_gatehouse (cost 40) and tick: it falls + reclaims
    g.getState().siege.progress = TERRITORIES.t_gatehouse.siegeCost + 1;
    delete g.getState()._solved;
    g.tick(0.05);
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(
      true,
    );

    // history survives the reclaim: entries hold graph only, so the unlocks
    // the reclaim granted can never be rolled back by undo
    expect(g.canUndo()).toBe(true);
    expect(g.undo().ok).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(0); // the edit was reverted...
    // ...but the reclaim-granted content survives the undo:
    expect(g.getState().unlocks.productionBonuses.gatherer).toBeCloseTo(
      1.1,
      1e-9,
    );
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(
      true,
    );
    // and redo replays the edit cleanly
    expect(g.redo().ok).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(1);
  });

  it("bootstrap recovers from a poisoned cyclic save instead of throwing (task 2/3)", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const poisoned = NewGame(clock);
    poisoned.graph.nodes.push(
      {
        id: "a",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "b",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    );
    poisoned.graph.links.push(
      { id: "lc0", from: "a", to: "b", resourceId: "iron_bar" },
      { id: "lc1", from: "b", to: "a", resourceId: "iron_bar" },
    );
    storage.set(SAVE_KEY, serialize(poisoned, 0));
    const g = makeGame(clock);
    // bootstrap must NOT throw (a thrown boot is an unrecoverable reload loop).
    const summary = g.bootstrap(storage);
    expect(summary !== null && typeof summary === "object").toBe(true);
    expect(g.getState().graph.nodes.length).toBe(0); // fell back to NewGame
    expect(g.getState().currencies.gold).toBeCloseTo(50, 1e-9);
  });

  it("bootstrap try/catch falls back to NewGame if boot solve throws (task 2 defense)", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    storage.set(SAVE_KEY, serialize(seededState(clock), 0));
    const g = makeGame(clock);
    // force a throw the first time the boot path solves; the try/catch must
    // recover to a clean NewGame rather than propagate (defense in depth).
    const orig = g._ensureSolved.bind(g);
    let threw = false;
    g._ensureSolved = function () {
      if (!threw) {
        threw = true;
        throw new Error("boom");
      }
      return orig();
    };
    const summary = g.bootstrap(storage); // must recover, not propagate
    expect(summary !== null && typeof summary === "object").toBe(true);
    expect(threw).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(0); // recovered to NewGame
  });

  it("zero-clone undo: the by-reference prev entry is not corrupted by post-dispatch ticks", () => {
    // The dispatch-time undo entry now holds prev.graph/prev.unlocks BY REFERENCE
    // (prev is detached: reduce cloned it into the new live state, ticks mutate the
    // clone). This pins that invariant: ticks running between dispatches — which
    // mutate the LIVE graph at 20Hz — must never reach back into a stored undo entry.
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter()); // empty graph
    const place = (x) => ({
      type: "PlaceNode",
      kind: "gatherer",
      resourceId: "iron_ore",
      pos: { x, y: 0 },
    });

    expect(g.dispatch(place(0)).ok).toBe(true); // node A
    const idsAfterA = g.getState().graph.nodes.map((n) => n.id);
    expect(idsAfterA.length).toBe(1);
    g.tick(5); // live graph mutates (stockpiles/currencies) — entry must be immune

    expect(g.dispatch(place(120)).ok).toBe(true); // node B
    expect(g.getState().graph.nodes.length).toBe(2);
    g.tick(5);

    // undo B: the by-reference entry held the A-only structure; ticks since then
    // mutated only the live (post-B) graph, so the entry is uncorrupted.
    expect(g.undo().ok).toBe(true);
    expect(g.getState().graph.nodes.map((n) => n.id)).toEqual(idsAfterA);
    expect(g.getState().graph.nodes.length).toBe(1); // B removed, A remains

    // undo A: back to a structurally empty graph (the very first entry held {})
    expect(g.undo().ok).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(0);

    // redo replays forward cleanly (redo entries clone the live graph at undo time)
    expect(g.redo().ok).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(1);
    expect(g.redo().ok).toBe(true);
    expect(g.getState().graph.nodes.length).toBe(2);
  });

  it("zero-clone undo: an UpgradeNode entry holds the pre-upgrade level by reference, immune to ticks", () => {
    // A non-PlaceNode UNDOABLE intent: the entry must capture the PRE-action level
    // and survive ticks mutating the live state.
    const g = bootSeeded(makeGame(new FakeClock(0)));
    const lvl = () =>
      g.getState().graph.nodes.find((n) => n.id === "n_miner_0").level;
    expect(lvl()).toBe(1);
    expect(g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" }).ok).toBe(
      true,
    );
    expect(lvl()).toBe(2);
    g.tick(10); // live graph mutates; the undo entry (pre-upgrade) is by-reference
    expect(g.undo().ok).toBe(true);
    expect(lvl()).toBe(1); // restored to the captured pre-upgrade structure
  });

  it("dispatching SetNodePos does not force a re-solve (the solve cache survives, ref-identical)", () => {
    const g = bootSeeded(makeGame(new FakeClock(0)));
    const solvedBefore = g._ensureSolved(); // warm the cache
    const r = g.dispatch({
      type: "SetNodePos",
      nodeId: "n_smelter_0",
      pos: { x: 1234, y: 56 },
    });
    expect(r.ok).toBe(true);
    // moved
    expect(
      g.getState().graph.nodes.find((n) => n.id === "n_smelter_0").pos,
    ).toEqual({ x: 1234, y: 56 });
    // SAME solve object: reduce carried it forward, _ensureSolved did not re-solve
    expect(g.getState()._solved).toBe(solvedBefore);
  });

  it("a structural dispatch after SetNodePos re-solves (cache was carried, not stale-locked)", () => {
    const g = bootSeeded(makeGame(new FakeClock(0)));
    const solved0 = g._ensureSolved();
    g.dispatch({
      type: "SetNodePos",
      nodeId: "n_smelter_0",
      pos: { x: 1, y: 1 },
    });
    expect(g.getState()._solved).toBe(solved0); // carried
    // a real structural edit must produce a FRESH solve (different object)
    g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(g.getState()._solved === solved0).toBe(false);
  });

  it("getState returns the live raw state for autosave (has version, no frozen)", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    const st = g.getState();
    expect(typeof st.version === "number").toBe(true);
    expect(Object.isFrozen(st)).toBe(false);
  });
});
