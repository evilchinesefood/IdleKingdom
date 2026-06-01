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

// Boot a game with the classic chain so it has steady-state production to tick.
function bootSeeded(clock) {
  const g = new Game({ content, clock });
  g.bootstrap(new MemoryStorageAdapter());
  g.getState().graph = seededState(clock).graph;
  delete g.getState()._solved;
  return g;
}

// These lock the 60fps-churn fix: rendering is driven by intents + expedition
// resolution, NOT by every tick.
describe("RenderCadence — tick does not churn the renderer", () => {
  it("tick does NOT notify onSnapshot listeners when no expedition resolves", () => {
    const clock = new FakeClock(0);
    const g = bootSeeded(clock);
    let notifications = 0;
    g.onSnapshot(() => notifications++);
    for (let i = 0; i < 5; i++) {
      clock.advance(50);
      g.tick(0.05);
    }
    expect(notifications).toBe(0);
  });

  it("tick DOES notify once when an in-flight expedition resolves", () => {
    const clock = new FakeClock(0);
    const g = bootSeeded(clock);
    // place an active expedition whose end time is already in the past
    g.getState().expeditions.active = {
      territoryId: "t_gatehouse",
      startedAt: 0,
      durationMs: TERRITORIES.t_gatehouse.durationMs,
      heroId: "h_0",
    };
    let notifications = 0;
    g.onSnapshot(() => notifications++);
    clock.advance(TERRITORIES.t_gatehouse.durationMs + 1000);
    g.tick(1.0);
    expect(notifications).toBe(1);
    expect(g.getState().expeditions.active).toBe(null);
  });

  it("getSnapshot returns a built snapshot WITHOUT notifying listeners", () => {
    const clock = new FakeClock(0);
    const g = bootSeeded(clock);
    let notifications = 0;
    g.onSnapshot(() => notifications++);
    const snap = g.getSnapshot();
    expect(snap !== null && typeof snap === "object").toBe(true);
    expect(snap.rates.goldRate).toBeCloseTo(2.0, 1e-9);
    expect(notifications).toBe(0);
  });

  it("dispatch of a legal intent notifies listeners", () => {
    const clock = new FakeClock(0);
    const g = bootSeeded(clock);
    let notifications = 0;
    g.onSnapshot(() => notifications++);
    const out = g.dispatch({ type: "UpgradeNode", nodeId: "n_miner_0" });
    expect(out.ok).toBe(true);
    expect(notifications).toBe(1);
  });
});
