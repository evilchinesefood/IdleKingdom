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
  it("2h within 8h cap gains 14400 gold and 720 research", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const now = 2 * HOUR;
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(2 * HOUR);
    expect(summary.clamped).toBe(false);
    expect(summary.gained.gold).toBeCloseTo(14400, 1e-6);
    expect(summary.gained.research).toBeCloseTo(720, 1e-6);
    expect(state.currencies.gold).toBeCloseTo(25.0 + 14400, 1e-6); // seed 25 + gained
    expect(state.lastSeen).toBe(now);
  });
});

describe("Offline.applyOffline clamps to cap", () => {
  it("3-day gap clamps to 8h => 57600 gold, clamped:true", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const now = 3 * 24 * HOUR; // 72h
    const summary = applyOffline(state, content, now);
    expect(summary.appliedMs).toBe(8 * HOUR);
    expect(summary.clamped).toBe(true);
    expect(summary.gained.gold).toBeCloseTo(57600, 1e-6);
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
    const now = 2 * HOUR; // far past completion, within 8h cap
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

describe("Offline auto-sell one-shot dump", () => {
  it("dumps stockpiles to gold once when autoSell is owned; finite and emptied", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    state.unlocks.autoSell = true;
    // simulate ~8h of accrued surplus iron_bar sitting on the smelter (no consumer)
    const smelter = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 144000; // big but float-safe
    const beforeGold = state.currencies.gold;
    const price = RESOURCES.iron_bar.basePrice; // 4.0
    const tithe = state.unlocks.titheRate; // 0.05

    const summary = applyOffline(state, content, 1000); // tiny dt so factory accrual ~ negligible
    const dumpGold = 144000 * price;

    expect(Number.isFinite(state.currencies.gold)).toBe(true);
    expect(smelter.stockpile.iron_bar).toBeCloseTo(0, 1e-6);
    // gold gained >= the dump (plus a sliver of 1s factory income)
    expect(summary.gained.gold).toBeCloseTo(dumpGold + 2.0 * 1, 1e-3);
    expect(state.currencies.gold).toBeCloseTo(
      beforeGold + dumpGold + 2.0 * 1,
      1e-3,
    );
    expect(summary.gained.research).toBeCloseTo(
      dumpGold * tithe + 0.1 * 1,
      1e-3,
    );

    // second pass: nothing left to dump
    const summary2 = applyOffline(state, content, 2000);
    expect(
      state.graph.nodes.find((n) => n.id === "n_smelter_0").stockpile.iron_bar,
    ).toBeCloseTo(0, 1e-6);
    expect(summary2.gained.gold).toBeCloseTo(2.0 * 1, 1e-3); // only 1s of factory income, no second dump
  });

  it("does NOT dump when autoSell is not owned", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.lastSeen = 0;
    const smelter = state.graph.nodes.find((n) => n.id === "n_smelter_0");
    smelter.stockpile.iron_bar = 5000;
    applyOffline(state, content, 1000);
    // stockpile may grow from accrual but must not be sold off
    const after = state.graph.nodes.find((n) => n.id === "n_smelter_0")
      .stockpile.iron_bar;
    expect(after >= 5000).toBe(true);
  });
});

describe("Persistence + Offline integration", () => {
  it("save with lastSeen=0, reload at 2h => 14400 gold via applyOffline", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const state = seededState(clock);
    state.lastSeen = 0;
    storage.set(SAVE_KEY, serialize(state)); // serialize stamps lastSeen = state.lastSeen = 0
    // ...later...
    const loaded = deserialize(storage.get(SAVE_KEY), clock);
    expect(loaded.lastSeen).toBe(0);
    const summary = applyOffline(loaded, content, 2 * HOUR);
    expect(summary.gained.gold).toBeCloseTo(14400, 1e-6);
    expect(loaded.lastSeen).toBe(2 * HOUR);
  });
});
