import { describe, it, expect } from "./Runner.js";
import { seededState } from "./Fixtures/Seeded.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { content } from "../Source/Engine/Content/Content.js";
import { applyOffline } from "../Source/Engine/Simulation/Offline.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import {
  serialize,
  deserialize,
  SAVE_KEY,
} from "../Source/Engine/Persistence/SaveManager.js";

const HOUR = 3600 * 1000;

describe("Offline.applyOffline within cap", () => {
  it("30min within the 1h cap gains 3600 gold and 180 research", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const now = 0.5 * HOUR;
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(0.5 * HOUR);
    expect(summary.clamped).toBe(false);
    expect(summary.gained.gold).toBeCloseTo(3600, 1e-6);
    expect(summary.gained.research).toBeCloseTo(180, 1e-6);
    expect(state.currencies.gold).toBeCloseTo(25.0 + 3600, 1e-6); // seed 25 + gained
    expect(state.lastSeen).toBe(now);
  });
});

describe("Offline.applyOffline clamps to cap", () => {
  it("3-day gap clamps to the 1h cap => 7200 gold, clamped:true", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const now = 3 * 24 * HOUR; // 72h
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(1 * HOUR);
    expect(summary.clamped).toBe(true);
    expect(summary.gained.gold).toBeCloseTo(7200, 1e-6); // 2.0 gold/s * 3600s
    expect(state.lastSeen).toBe(now); // lastSeen advances to real now, not the clamp
  });

  it("raised cap (offlineCapHours=24) clamps a 3-day gap to 24h", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    state.unlocks.offlineCapHours = 24;
    const now = 3 * 24 * HOUR;
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(24 * HOUR);
    expect(summary.clamped).toBe(true);
    expect(summary.gained.gold).toBeCloseTo(2.0 * 24 * 3600, 1e-6); // 172800
  });

  it("suppresses (negligible) under ~60s: appliedMs small, gains tiny", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const now = 30 * 1000; // 30s
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(30 * 1000);
    expect(summary.clamped).toBe(false);
    expect(summary.gained.gold).toBeCloseTo(60, 1e-6); // 2.0 * 30
  });
});

describe("Offline expedition fast-forward", () => {
  it("resolves an in-flight expedition mid-gap: renown awarded, territory reclaimed, active cleared", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    // an expedition launched at t=0 against t_gatehouse (duration 120000)
    state.expeditions.active = {
      territoryId: "t_gatehouse",
      startedAt: 0,
      durationMs: TERRITORIES.t_gatehouse.durationMs, // 120000
      heroId: "h_0",
    };
    const now = 2 * HOUR; // gap clamps to the 1h cap, but the 2-min expedition resolves inside it
    const beforeRenown = state.currencies.renown;
    const summary = applyOffline(state, content, now);

    expect(state.expeditions.active).toBe(null);
    expect(state.territories.reclaimed.includes("t_gatehouse")).toBe(true);
    expect(state.currencies.renown).toBeCloseTo(beforeRenown + 10, 1e-6); // t_gatehouse renown reward
    expect(summary.gained.renown).toBeCloseTo(10, 1e-6);
    expect(summary.expeditionsResolved.length).toBe(1);
    expect(summary.expeditionsResolved[0].territoryId).toBe("t_gatehouse");
  });

  it("leaves an unfinished expedition active when it would not complete within the clamped window", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    state.expeditions.active = {
      territoryId: "t_gatehouse",
      startedAt: 0,
      durationMs: TERRITORIES.t_gatehouse.durationMs, // 120000 = 2min
      heroId: "h_0",
    };
    const now = 60 * 1000; // 60s in, expedition not done (needs 120s)
    const summary = applyOffline(state, content, now);
    expect(state.expeditions.active === null).toBe(false);
    expect(state.territories.reclaimed.length).toBe(0);
    expect(summary.expeditionsResolved.length).toBe(0);
  });
});

describe("Offline auto-sell via solved goldRate (task 7)", () => {
  // A lone gatherer producing a LISTED raw with no consumer; its surplus auto-sells
  // at 50% basePrice through the solved goldRate (no stockpile sweep anymore).
  function loneGatherer(autoSell) {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    state.unlocks.autoSell = autoSell;
    // strip the seed chain down to a single gatherer with no consumer
    state.graph.nodes = [
      {
        id: "g",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
    ];
    state.graph.links = [];
    return state;
  }

  it("credits offline gold from listed surplus at 50% price when autoSell is owned", () => {
    const state = loneGatherer(true);
    const price = RESOURCES.iron_ore.basePrice; // 0.5
    // gatherer L1 surplus 1.0/s; autoSell rate = 1.0 * 0.5 * 0.5 = 0.25 gold/s.
    const summary = applyOffline(state, content, 100 * 1000); // 100s
    expect(summary.gained.gold).toBeCloseTo(1.0 * price * 0.5 * 100, 1e-3); // 25
  });

  it("credits NOTHING extra offline when autoSell is not owned", () => {
    const state = loneGatherer(false);
    const summary = applyOffline(state, content, 100 * 1000);
    expect(summary.gained.gold).toBeCloseTo(0, 1e-6); // no consumer, no market -> 0
  });

  it("never sells a storage room's surplus offline (protected buffer)", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    state.unlocks.autoSell = true;
    state.graph.nodes = [
      {
        id: "g",
        kind: "gatherer",
        level: 7, // 4.0/s
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "s",
        kind: "storage",
        level: 1,
        resourceId: null,
        recipeId: null,
        resourceIds: ["iron_ore"],
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    ];
    state.graph.links = [
      { id: "l0", from: "g", to: "s", resourceId: "iron_ore" },
    ];
    const summary = applyOffline(state, content, 10 * 1000);
    // storage drains the gatherer fully (no gatherer surplus); the storage room's
    // own surplus is NOT auto-sold -> no offline gold from auto-sell.
    expect(summary.gained.gold).toBeCloseTo(0, 1e-6);
  });
});

describe("Persistence + Offline integration", () => {
  it("save with lastSeen=0, reload at 30min => 3600 gold via applyOffline", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const state = seededState(clock);
    state.lastSeen = 0;
    storage.set(SAVE_KEY, serialize(state)); // serialize stamps lastSeen = state.lastSeen = 0
    // ...later...
    const loaded = deserialize(storage.get(SAVE_KEY), clock);
    expect(loaded.lastSeen).toBe(0);
    const summary = applyOffline(loaded, content, 0.5 * HOUR);
    expect(summary.gained.gold).toBeCloseTo(3600, 1e-6);
    expect(loaded.lastSeen).toBe(0.5 * HOUR);
  });
});
