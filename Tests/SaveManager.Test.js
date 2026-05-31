import { describe, it, expect } from "./Runner.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  serialize,
  deserialize,
  SAVE_VERSION,
  SAVE_KEY,
} from "../Source/Engine/Persistence/SaveManager.js";
import {
  migrate1to2,
  migrate2to3,
  MIGRATIONS,
} from "../Source/Engine/Persistence/Migrations.js";
import SaveV1 from "./Fixtures/SaveV1.json" with { type: "json" };

describe("SaveManager.serialize", () => {
  it("strips _solved and stamps version + timestamps", () => {
    const clock = new FakeClock(1000);
    const state = NewGame(clock);
    state._solved = { goldRate: 2.0, junk: true };
    const json = serialize(state);
    const blob = JSON.parse(json);
    expect(blob.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(SAVE_KEY).toBe("idlekingdom.save");
    expect(typeof blob.savedAt).toBe("number");
    expect(typeof blob.lastSeen).toBe("number");
    expect(blob._solved).toBe(undefined);
    expect(blob.currencies.gold).toBe(25.0);
  });
});

describe("SaveManager.serialize lastSeen (B1 no-phantom-offline)", () => {
  it("stamps both savedAt and lastSeen to the passed nowMs", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.savedAt = 1000; // stale prior stamp
    state.lastSeen = 1000;
    const T = 42_000;
    const blob = JSON.parse(serialize(state, T));
    expect(blob.savedAt).toBe(T);
    expect(blob.lastSeen).toBe(T);
  });

  it("immediate reload (tiny elapsed) credits ~0 gold and yields no offline summary modal", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const { applyOffline } =
      await import("../Source/Engine/Simulation/Offline.js");
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    // foreground play then a save at T stamps lastSeen=T (the B1 fix)
    const T = 100_000;
    const saved = deserialize(serialize(state, T), clock);
    expect(saved.lastSeen).toBe(T);
    // reload 5s later
    const summary = applyOffline(saved, content, T + 5_000);
    expect(summary.gained.gold).toBeCloseTo(10, 1e-6); // 2/s * 5s, NOT a phantom whole session
    // Main.js only shows the modal when appliedMs > 60_000
    expect(summary.appliedMs > 60_000).toBe(false);
  });

  it(">60s elapsed credits real gold and would show the offline summary", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const { applyOffline } =
      await import("../Source/Engine/Simulation/Offline.js");
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    const T = 100_000;
    const saved = deserialize(serialize(state, T), clock);
    const summary = applyOffline(saved, content, T + 5 * 60_000); // 5 min away
    expect(summary.gained.gold).toBeCloseTo(2 * 300, 1e-6); // 2/s * 300s
    expect(summary.appliedMs > 60_000).toBe(true);
  });
});

describe("Victory once-after-ack (B2 seenVictory)", () => {
  it("AckVictory -> serialize -> deserialize preserves meta.seenVictory; gate suppresses re-fire", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const { reduce } = await import("../Source/Engine/Reducer.js");
    const { build } = await import("../Source/Engine/Snapshot.js");
    const { solve } = await import("../Source/Engine/Simulation/RateSolver.js");
    const { victoryReady } = await import("../Source/UI/Logic/Selectors.js");
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.meta.won = true;

    // seeded fresh: seenVictory false -> gate would fire on first win
    const s0 = build(state, solve(state, content), content, null);
    expect(s0.meta.seenVictory).toBe(false);
    expect(victoryReady(s0) && !s0.meta.seenVictory).toBe(true);

    const acked = reduce(state, { type: "AckVictory" }, content).state;
    expect(acked.meta.seenVictory).toBe(true);

    const back = deserialize(serialize(acked, 0), clock);
    expect(back.meta.seenVictory).toBe(true);

    // App gate: victoryReady && !seenVictory must now be FALSE post-ack
    const s1 = build(back, solve(back, content), content, null);
    expect(victoryReady(s1)).toBe(true); // still won (free-play)
    expect(victoryReady(s1) && !s1.meta.seenVictory).toBe(false);
  });
});

describe("Migrations", () => {
  it("1->2 adds meta.tutorialFlags without touching other fields", () => {
    const v1 = JSON.parse(JSON.stringify(SaveV1));
    expect(v1.meta.tutorialFlags).toBe(undefined);
    const v2 = migrate1to2(v1);
    expect(v2.version).toBe(2);
    expect(v2.meta.tutorialFlags.seenGoldTip).toBe(false);
    expect(v2.meta.tutorialFlags.seenUpgradeTip).toBe(false);
    expect(v2.meta.tutorialFlags.seenConnectTip).toBe(false);
    expect(v2.currencies.gold).toBe(25.0);
  });

  it("2->3 splits flat offlineCap into offlineCapHours + productionBonuses", () => {
    const v2 = migrate1to2(JSON.parse(JSON.stringify(SaveV1)));
    expect(v2.unlocks.offlineCap).toBe(8);
    expect(v2.unlocks.offlineCapHours).toBe(undefined);
    const v3 = migrate2to3(v2);
    expect(v3.version).toBe(3);
    expect(v3.unlocks.offlineCapHours).toBe(8);
    expect(v3.unlocks.offlineCap).toBe(undefined);
    expect(v3.unlocks.productionBonuses.gatherer).toBe(1.0);
    expect(v3.unlocks.productionBonuses.smelter).toBe(1.0);
    expect(v3.unlocks.productionBonuses.workshop).toBe(1.0);
    expect(v3.unlocks.productionBonuses.market).toBe(1.0);
    expect(v3.unlocks.productionBonuses.scholar).toBe(1.0);
  });

  it("MIGRATIONS registry is keyed by fromVersion", () => {
    expect(MIGRATIONS[1]).toBe(migrate1to2);
    expect(MIGRATIONS[2]).toBe(migrate2to3);
  });
});

describe("SaveManager.deserialize", () => {
  it("round-trips deep-equal incl. sparse stockpiles and null slots", () => {
    const clock = new FakeClock(5000);
    const state = NewGame(clock);
    state.currencies.gold = 123.456;
    state.graph.nodes[0].stockpile = { iron_ore: 7.25 }; // sparse
    state._solved = { goldRate: 2 }; // must not survive
    const json = serialize(state);
    const back = deserialize(json, clock);
    expect(back.currencies.gold).toBeCloseTo(123.456, 1e-9);
    expect(back.graph.nodes[0].stockpile.iron_ore).toBeCloseTo(7.25, 1e-9);
    expect(back.graph.nodes[2].stockpile).toEqual({}); // market: empty sparse
    expect(back.heroes[0].equipped.weapon).toBe(null);
    expect(back.heroes[0].equipped.armor).toBe(null);
    expect(back.heroes[0].equipped.accessory).toBe(null);
    expect(back._solved).toBe(undefined);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it("migrates SaveV1 fixture all the way to v3", () => {
    const clock = new FakeClock(5000);
    const state = deserialize(JSON.stringify(SaveV1), clock);
    expect(state.version).toBe(3);
    expect(state.meta.tutorialFlags.seenGoldTip).toBe(false);
    expect(state.unlocks.offlineCapHours).toBe(8);
    expect(state.unlocks.offlineCap).toBe(undefined);
    expect(state.unlocks.productionBonuses.smelter).toBe(1.0);
    expect(state.currencies.gold).toBe(25.0); // no data loss
  });

  it("falls back to NewGame on malformed JSON without throwing", () => {
    const clock = new FakeClock(9000);
    const state = deserialize("{not valid json", clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(25.0);
  });

  it("falls back to NewGame when validate fails (missing currencies)", () => {
    const clock = new FakeClock(9000);
    const broken = JSON.stringify({
      version: 3,
      graph: { nodes: [], links: [] },
    });
    const state = deserialize(broken, clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(25.0);
  });

  it("canonical-ID guard: NewGame has only r_iron_bar, hero_warden, t_gatehouse", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    expect(state.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(state.heroes[0].templateId).toBe("hero_warden");
    expect(state.territories.available[0]).toBe("t_gatehouse");
  });
});

describe("SaveManager.deserialize diagnostics", () => {
  it("warns when a corrupt save triggers the NewGame fallback", () => {
    const clock = new FakeClock(0);
    const orig = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      deserialize("{not valid json", clock);
    } finally {
      console.warn = orig;
    }
    expect(warned).toBe(true);
  });

  it("does NOT warn on a valid serialize -> deserialize round-trip", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    const json = serialize(state);
    const orig = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      deserialize(json, clock);
    } finally {
      console.warn = orig;
    }
    expect(warned).toBe(false);
  });
});
