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

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
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

// These lock the 60fps-churn fix: rendering is driven by intents + siege
// resolution, NOT by every tick.
describe("RenderCadence — tick does not churn the renderer", () => {
  it("tick does NOT notify onSnapshot listeners when no siege resolves", () => {
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

  it("tick DOES notify once when accumulated siege progress fells a territory", () => {
    const clock = new FakeClock(0);
    const g = bootSeeded(clock);
    // prefill siege progress just past t_gatehouse's cost (40); the seeded chain
    // has no barracks so this is the only siege source.
    g.getState().siege.progress = TERRITORIES.t_gatehouse.siegeCost + 1;
    delete g.getState()._solved;
    let notifications = 0;
    g.onSnapshot(() => notifications++);
    g.tick(0.05);
    expect(notifications).toBe(1);
    expect(g.getState().territories.reclaimed.includes("t_gatehouse")).toBe(
      true,
    );
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
