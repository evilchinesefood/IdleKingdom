import { describe, it, expect } from "./Runner.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { serialize, deserialize, SAVE_VERSION, SAVE_KEY } from "../Source/Engine/Persistence/SaveManager.js";
import { migrate1to2, migrate2to3, MIGRATIONS } from "../Source/Engine/Persistence/Migrations.js";
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
    const broken = JSON.stringify({ version: 3, graph: { nodes: [], links: [] } });
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
