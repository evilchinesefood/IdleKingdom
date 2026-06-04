import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
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
  equipment: EQUIPMENT,
  heroes: HEROES,
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
    expect(g.getState().currencies.gold).toBeCloseTo(25, 1e-9);
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

  it("tick resolves an in-flight expedition when its duration elapses", () => {
    const clock = new FakeClock(0);
    const g = makeGame(clock);
    g.bootstrap(new MemoryStorageAdapter());
    // equip + start via dispatch
    g.dispatch({
      type: "EquipItem",
      heroId: "h_0",
      slot: "weapon",
      itemId: "sword",
      tier: 1,
    });
    g.dispatch({
      type: "EquipItem",
      heroId: "h_0",
      slot: "armor",
      itemId: "armor",
      tier: 1,
    });
    g.dispatch({
      type: "EquipItem",
      heroId: "h_0",
      slot: "accessory",
      itemId: "shield",
      tier: 1,
    });
    g.dispatch({
      type: "StartExpedition",
      territoryId: "t_gatehouse",
      heroId: "h_0",
    });
    expect(g.getState().expeditions.active.territoryId).toBe("t_gatehouse");
    // advance clock past 120s and tick
    clock.advance(125000);
    g.tick(125); // dt seconds; facade reads clock.now() for resolution timestamp
    expect(g.getState().expeditions.active).toBe(null);
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(
      true,
    );
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
    expect(g.getState().currencies.gold).toBeCloseTo(25, 1e-9);
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

  it("getState returns the live raw state for autosave (has version, no frozen)", () => {
    const g = makeGame(new FakeClock(0));
    g.bootstrap(new MemoryStorageAdapter());
    const st = g.getState();
    expect(typeof st.version === "number").toBe(true);
    expect(Object.isFrozen(st)).toBe(false);
  });
});
