import { describe, it, expect } from "./Runner.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { seededState } from "./Fixtures/Seeded.js";
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
  migrate5to6,
  migrate6to7,
  migrate7to8,
  migrate8to9,
  migrate9to10,
  migrate10to11,
  MIGRATIONS,
} from "../Source/Engine/Persistence/Migrations.js";
import { content } from "../Source/Engine/Content/Content.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import SaveV1 from "./Fixtures/SaveV1.json" with { type: "json" };

describe("SaveManager.serialize", () => {
  it("strips _solved and stamps version + timestamps", () => {
    const clock = new FakeClock(1000);
    const state = NewGame(clock);
    state._solved = { goldRate: 2.0, junk: true };
    const json = serialize(state);
    const blob = JSON.parse(json);
    expect(blob.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(11);
    expect(SAVE_KEY).toBe("idlekingdom.save");
    expect(typeof blob.savedAt).toBe("number");
    expect(typeof blob.lastSeen).toBe("number");
    expect(blob._solved).toBe(undefined);
    expect(blob.currencies.gold).toBe(50.0);
  });

  it("strips meta._saveStatus from the persisted blob (task 25)", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.meta._saveStatus = "failed"; // live HUD wiring set by Main.js
    const blob = JSON.parse(serialize(state, 0));
    expect(blob.meta._saveStatus).toBe(undefined);
    // live state retains it (HUD save-failure badge depends on it)
    expect(state.meta._saveStatus).toBe("failed");
    // the rest of meta survives
    expect(blob.meta.won).toBe(false);
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
    const state = seededState(clock);
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
    const state = seededState(clock);
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
    expect(typeof MIGRATIONS[3]).toBe("function");
    expect(typeof MIGRATIONS[4]).toBe("function"); // v4->v5 adds storage room
    expect(typeof MIGRATIONS[5]).toBe("function"); // v5->v6 storage resourceId->resourceIds
    expect(typeof MIGRATIONS[6]).toBe("function"); // v6->v7 storage shared-cap clamp
    expect(MIGRATIONS[8]).toBe(migrate8to9); // v8->v9 building children default
  });

  it("5->6 converts storage resourceId -> resourceIds[] (gatherers untouched)", () => {
    const v6 = migrate5to6({
      version: 5,
      graph: {
        nodes: [
          { id: "s0", kind: "storage", resourceId: "iron_ore" },
          { id: "s1", kind: "storage", resourceId: null },
          { id: "g0", kind: "gatherer", resourceId: "iron_ore" },
        ],
      },
    });
    expect(v6.version).toBe(6);
    expect(v6.graph.nodes[0].resourceIds).toEqual(["iron_ore"]);
    expect(v6.graph.nodes[0].resourceId).toBe(undefined); // dropped
    expect(v6.graph.nodes[1].resourceIds).toEqual([]); // null -> empty
    expect(v6.graph.nodes[2].resourceId).toBe("iron_ore"); // gatherer untouched
  });

  it("5->6 is safe on a blob with no graph/nodes", () => {
    expect(migrate5to6({ version: 5 }).version).toBe(6);
  });

  it("6->7 scales an over-cap storage stockpile down to the shared cap", () => {
    const v7 = migrate6to7({
      version: 6,
      graph: {
        nodes: [
          {
            id: "s",
            kind: "storage",
            level: 2,
            resourceIds: ["iron_ore", "timber"],
            stockpile: { iron_ore: 400, timber: 400 }, // 800 > L2 shared cap 400
          },
        ],
      },
    });
    expect(v7.version).toBe(7);
    const s = v7.graph.nodes[0];
    expect(s.stockpile.iron_ore + s.stockpile.timber).toBeCloseTo(400, 1e-9);
  });

  it("7->8 clamps a raised offline cap down to the 1h maximum", () => {
    const v8 = migrate7to8({ version: 7, unlocks: { offlineCapHours: 24 } });
    expect(v8.version).toBe(8);
    expect(v8.unlocks.offlineCapHours).toBe(1);
  });

  it("7->8 is safe on a blob with no unlocks", () => {
    expect(migrate7to8({ version: 7 }).version).toBe(8);
  });

  it("8->9 defaults building children to [] (leaves existing arrays)", () => {
    const v9 = migrate8to9({
      version: 8,
      graph: {
        buildings: [
          { id: "b_0", nodeIds: ["n0"] }, // no children -> []
          { id: "b_1", nodeIds: [], children: ["b_0"] }, // kept
        ],
      },
    });
    expect(v9.version).toBe(9);
    expect(v9.graph.buildings[0].children).toEqual([]);
    expect(v9.graph.buildings[1].children).toEqual(["b_0"]);
  });

  it("8->9 is safe on a blob with no graph/buildings", () => {
    expect(migrate8to9({ version: 8 }).version).toBe(9);
  });

  it("9->10 drops tutorialFlags and marks the tutorial done", () => {
    const v10 = migrate9to10({
      version: 9,
      meta: { tutorialFlags: { seenGoldTip: false }, won: false },
    });
    expect(v10.version).toBe(10);
    expect(v10.meta.tutorialFlags).toBe(undefined);
    expect(v10.meta.tutorialDone).toBe(true);
    expect(v10.meta.won).toBe(false); // other meta preserved
  });

  it("9->10 is safe on a blob with no meta", () => {
    const v10 = migrate9to10({ version: 9 });
    expect(v10.version).toBe(10);
    expect(v10.meta.tutorialDone).toBe(true);
  });
});

describe("SaveManager.deserialize", () => {
  it("round-trips deep-equal incl. sparse stockpiles and null slots", () => {
    const clock = new FakeClock(5000);
    const state = seededState(clock);
    state.currencies.gold = 123.456;
    state.graph.nodes[0].stockpile = { iron_ore: 7.25 }; // sparse
    state._solved = { goldRate: 2 }; // must not survive
    const json = serialize(state);
    const back = deserialize(json, clock);
    expect(back.currencies.gold).toBeCloseTo(123.456, 1e-9);
    expect(back.graph.nodes[0].stockpile.iron_ore).toBeCloseTo(7.25, 1e-9);
    expect(back.graph.nodes[2].stockpile).toEqual({}); // market: empty sparse
    expect(back._solved).toBe(undefined);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it("default-fills unlocks.gathererResources on a migrated save (task 8)", () => {
    const clock = new FakeClock(5000);
    // SaveV1 predates gathererResources; deserialize must non-destructively default it.
    const state = deserialize(JSON.stringify(SaveV1), clock);
    expect(Array.isArray(state.unlocks.gathererResources)).toBe(true);
    expect(state.unlocks.gathererResources).toEqual([]);
  });

  it("does NOT clobber an existing gathererResources on load (task 8)", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    state.unlocks.gathererResources = ["timber", "hide"];
    const back = deserialize(serialize(state), clock);
    expect(back.unlocks.gathererResources).toEqual(["timber", "hide"]);
  });

  it("migrates SaveV1 fixture all the way to v11", () => {
    const clock = new FakeClock(5000);
    const state = deserialize(JSON.stringify(SaveV1), clock);
    expect(state.version).toBe(11);
    expect(state.meta.tutorialDone).toBe(true); // v9->v10 marks existing saves done
    expect(state.unlocks.offlineCapHours).toBe(1); // v3 default 8, clamped to 1 by v7->v8
    expect(state.unlocks.offlineCap).toBe(undefined);
    expect(state.unlocks.productionBonuses.smelter).toBe(1.0);
    expect(Array.isArray(state.graph.buildings)).toBe(true); // v4 adds buildings
    expect(state.unlocks.machinesUnlocked.includes("storage")).toBe(true); // v5
    expect(state.unlocks.productionBonuses.storage).toBe(1.0); // v5
    expect(state.currencies.gold).toBe(25.0); // no data loss
    // v10->v11 war rework: heroes/expeditions/renown/gearTiersUnlocked/heroSlots dropped
    expect(state.heroes).toBe(undefined);
    expect(state.expeditions).toBe(undefined);
    expect(state.currencies.renown).toBe(undefined);
    expect(state.currencies.research).toBeCloseTo(0, 1e-9); // SaveV1 renown was 0
    expect(state.unlocks.gearTiersUnlocked).toBe(undefined);
    expect(state.unlocks.heroSlots).toBe(undefined);
    expect(state.siege.progress).toBe(0);
    expect(state.unlocks.productionBonuses.barracks).toBe(1.0);
  });

  it("falls back to NewGame on malformed JSON without throwing", () => {
    const clock = new FakeClock(9000);
    const state = deserialize("{not valid json", clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(50.0);
  });

  it("falls back to NewGame when validate fails (missing currencies)", () => {
    const clock = new FakeClock(9000);
    const broken = JSON.stringify({
      version: 3,
      graph: { nodes: [], links: [] },
    });
    const state = deserialize(broken, clock);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(50.0);
  });

  it("content-aware deserialize rejects a cyclic graph -> NewGame (task 3)", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const clock = new FakeClock(0);
    const g = NewGame(clock);
    g.graph.nodes.push(
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
    g.graph.links.push(
      { id: "lc0", from: "a", to: "b", resourceId: "iron_bar" },
      { id: "lc1", from: "b", to: "a", resourceId: "iron_bar" },
    );
    const back = deserialize(serialize(g), clock, content);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.graph.nodes.length).toBe(0); // fresh NewGame, cycle rejected
  });

  it("content-aware deserialize rejects an unknown-kind node -> NewGame (task 3)", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const clock = new FakeClock(0);
    const g = NewGame(clock);
    g.graph.nodes.push({
      id: "x",
      kind: "bogus",
      level: 1,
      resourceId: null,
      recipeId: null,
      stockpile: {},
      pos: { x: 0, y: 0 },
    });
    const back = deserialize(serialize(g), clock, content);
    expect(back.graph.nodes.length).toBe(0);
  });

  it("content-aware deserialize accepts a valid round-trip (task 3)", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const clock = new FakeClock(0);
    const state = seededState(clock);
    const back = deserialize(serialize(state), clock, content);
    expect(back.graph.nodes.length).toBe(3); // seed chain survives
  });

  it("future-version save (v12) -> NewGame + raw blob backed up, original untouched (task 4)", () => {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const future = NewGame(clock);
    future.version = 12;
    future.currencies.gold = 999; // a marker we can find in the backup
    const raw = JSON.stringify(future);
    storage.set(SAVE_KEY, raw); // the live key still holds the future blob
    const orig = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    let state;
    try {
      state = deserialize(raw, clock, undefined, storage);
    } finally {
      console.warn = orig;
    }
    expect(warned).toBe(true);
    expect(state.version).toBe(SAVE_VERSION); // fresh NewGame, not the v12 blob
    expect(state.currencies.gold).toBe(50.0);
    // raw blob copied verbatim to the versioned backup key
    expect(storage.get("idlekingdom-save-backup-v12")).toBe(raw);
    // the original live key is untouched (next autosave overwrites it)
    expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("future-version save with no storage adapter still returns NewGame (task 4)", () => {
    const clock = new FakeClock(0);
    const future = NewGame(clock);
    future.version = 12;
    const orig = console.warn;
    console.warn = () => {};
    let state;
    try {
      state = deserialize(JSON.stringify(future), clock);
    } finally {
      console.warn = orig;
    }
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.currencies.gold).toBe(50.0);
  });

  it("canonical-ID guard: NewGame has only r_iron_bar, no available field", () => {
    const clock = new FakeClock(0);
    const state = NewGame(clock);
    expect(state.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(state.territories.reclaimed).toEqual([]);
    expect("available" in state.territories).toBe(false);
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

describe("migrate10to11 — war rework", () => {
  it("drops heroes/expeditions/renown, converts renown x10 to research, seeds siege", () => {
    const v10 = JSON.parse(serialize(NewGame(new FakeClock(0)), 0));
    v10.version = 10;
    v10.currencies.renown = 7;
    v10.heroes = [
      { id: "h_0", templateId: "hero_warden", level: 3, equipped: {} },
    ];
    v10.expeditions = { active: null, completed: [] };
    v10.unlocks.gearTiersUnlocked = [{ itemId: "sword", tier: 1 }];
    v10.unlocks.heroSlots = 2;
    v10.unlocks.researchOwned = ["res_scholar", "res_war_college"];
    delete v10.siege;
    const out = deserialize(JSON.stringify(v10), new FakeClock(0), content);
    expect(out.version).toBe(11);
    expect(out.heroes).toBe(undefined);
    expect(out.expeditions).toBe(undefined);
    expect(out.currencies.renown).toBe(undefined);
    expect(out.currencies.research).toBeCloseTo(70, 1e-9); // 7 renown x10
    expect(out.siege.progress).toBe(0);
    expect(out.unlocks.gearTiersUnlocked).toBe(undefined);
    expect(out.unlocks.heroSlots).toBe(undefined);
    expect(out.unlocks.researchOwned.includes("res_war_college")).toBe(false); // node deleted
    expect(out.unlocks.productionBonuses.barracks).toBe(1.0);
  });

  it("migrating a v10 blob WITHOUT productionBonuses yields a fully-seeded map (task 5)", () => {
    const v10 = {
      version: 10,
      currencies: { gold: 25, research: 0 },
      graph: {
        nodes: [],
        links: [],
        buildings: [],
        nextNodeSeq: 0,
        nextLinkSeq: 0,
        nextBuildingSeq: 0,
      },
      unlocks: {
        machinesUnlocked: ["gatherer", "smelter"],
        recipesUnlocked: ["r_iron_bar"],
        researchOwned: [],
        gathererResources: [],
        marketListings: ["iron_ore"],
        titheRate: 0,
        autoSell: false,
        offlineCapHours: 1,
        // no productionBonuses key at all
      },
      siege: { progress: 0 },
      territories: { reclaimed: [], available: ["t_gatehouse"] },
      meta: { won: false, tutorialDone: true, createdAt: 0 },
    };
    const out = migrate10to11(v10);
    const pb = out.unlocks.productionBonuses;
    expect(pb.gatherer).toBe(1.0);
    expect(pb.smelter).toBe(1.0);
    expect(pb.workshop).toBe(1.0);
    expect(pb.barracks).toBe(1.0);
    expect(pb.market).toBe(1.0);
    expect(pb.scholar).toBe(1.0);
  });
});

describe("deserialize normalize — repairs solver-required gaps (deep-review C2)", () => {
  it("a save missing unlocks.marketListings/titheRate is repaired, not discarded", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const clock = new FakeClock(0);
    const state = seededState(clock);
    state.currencies.gold = 999999; // marker: real progress must survive
    const blob = JSON.parse(serialize(state));
    delete blob.unlocks.marketListings;
    delete blob.unlocks.titheRate;
    delete blob.unlocks.productionBonuses;
    const back = deserialize(JSON.stringify(blob), clock, content);
    expect(back.currencies.gold).toBe(999999); // NOT a NewGame fallback
    expect(Array.isArray(back.unlocks.marketListings)).toBe(true);
    expect(back.unlocks.titheRate).toBe(0);
    expect(typeof back.unlocks.productionBonuses).toBe("object");
  });

  it("non-finite lastSeen/savedAt clamp to now (zero offline) instead of NaN", () => {
    const clock = new FakeClock(5000);
    const state = seededState(clock);
    const blob = JSON.parse(serialize(state));
    blob.lastSeen = "x";
    delete blob.savedAt;
    const back = deserialize(JSON.stringify(blob), clock);
    expect(back.lastSeen).toBe(5000);
    expect(back.savedAt).toBe(5000);
  });

  it("territories.reclaimed of wrong type is repaired to []", () => {
    const clock = new FakeClock(0);
    const state = seededState(clock);
    const blob = JSON.parse(serialize(state));
    blob.territories.reclaimed = null;
    const back = deserialize(JSON.stringify(blob), clock);
    expect(back.territories.reclaimed).toEqual([]);
    expect(back.graph.nodes.length).toBe(3); // save survived
  });
});
