import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { reduce } from "../Source/Engine/Reducer.js";

const content = {
  resources: RESOURCES, machines: MACHINES, recipes: RECIPES,
  researchNodes: RESEARCH_NODES, territories: TERRITORIES,
  equipment: EQUIPMENT, heroes: HEROES,
};

describe("Reducer", () => {
  it("is pure: rejected intent returns the original state object unchanged + an error", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.gold = 0; // cannot afford any upgrade
    const before = JSON.stringify(s);
    const out = reduce(s, { type: "UpgradeNode", nodeId: "n_miner_0" }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);                 // unchanged reference on reject
    expect(JSON.stringify(s)).toBe(before);    // input not mutated
  });

  it("accepts a legal UpgradeNode: returns a new state with the level bumped, original untouched", () => {
    const s = NewGame(new FakeClock(0)); // 25 gold; miner upgrade 17.25
    const out = reduce(s, { type: "UpgradeNode", nodeId: "n_miner_0" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state !== s).toBe(true);        // new state on accept (cloned)
    const miner = out.state.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    const origMiner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(origMiner.level).toBe(1);           // original not mutated
    expect(out.state._solved).toBe(undefined); // structural change -> solver dirty
  });

  it("rejects malformed intents via Intents.validate", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "UpgradeNode" }, content);
    expect(out.state).toBe(s);
    expect(typeof out.error === "string").toBe(true);
  });

  it("routes BuyResearch via nodeId; rejects unaffordable, accepts affordable", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 0;
    const rej = reduce(s, { type: "BuyResearch", nodeId: "res_scholar" }, content);
    expect(rej.error !== undefined).toBe(true);
    expect(rej.state).toBe(s);
    s.currencies.research = 100;
    const acc = reduce(s, { type: "BuyResearch", nodeId: "res_scholar" }, content);
    expect(acc.error).toBe(undefined);
    expect(acc.state.unlocks.researchOwned.includes("res_scholar")).toBe(true);
  });

  it("routes StartExpedition; rejects under-power; accepts when power >= req", () => {
    const s = NewGame(new FakeClock(0));
    const rej = reduce(s, { type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0" }, content);
    expect(rej.error !== undefined).toBe(true); // hero power 5 < 30
    // equip + dispatch equip through the reducer
    let cur = s;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 1 }, content).state;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "armor", itemId: "armor", tier: 1 }, content).state;
    cur = reduce(cur, { type: "EquipItem", heroId: "h_0", slot: "accessory", itemId: "shield", tier: 1 }, content).state;
    const acc = reduce(cur, { type: "StartExpedition", territoryId: "t_gatehouse", heroId: "h_0", _nowMs: 5000 }, content);
    expect(acc.error).toBe(undefined);
    expect(acc.state.expeditions.active.territoryId).toBe("t_gatehouse");
  });

  it("rejects EquipItem with a locked tier (T2 sword before any reclaim)", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "EquipItem", heroId: "h_0", slot: "weapon", itemId: "sword", tier: 2 }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("rejects a cycle-creating ConnectLink", () => {
    const s = NewGame(new FakeClock(0));
    // seed: miner->smelter->market. Try to close a cycle market->miner (illegal & wrong ports anyway).
    const out = reduce(s, { type: "ConnectLink", from: "n_market_0", to: "n_miner_0", resourceId: "iron_bar" }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("DismissTooltip flips a tutorial flag (non-structural, no solver dirty needed)", () => {
    const s = NewGame(new FakeClock(0));
    const out = reduce(s, { type: "DismissTooltip", flag: "seenGoldTip" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state.meta.tutorialFlags.seenGoldTip).toBe(true);
  });

  it("SetGathererResource rejects timber/hide before their research; accepts after enableGathererResource", () => {
    const s = NewGame(new FakeClock(0));
    // timber is NOT startable until res_lumber enables it (must not leak from a hardcoded set).
    const rejTimber = reduce(s, { type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "timber" }, content);
    expect(rejTimber.error !== undefined).toBe(true);
    expect(rejTimber.state).toBe(s);
    const rejHide = reduce(s, { type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "hide" }, content);
    expect(rejHide.error !== undefined).toBe(true);
    // iron_ore is the only seeded startable raw.
    const accIron = reduce(s, { type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "iron_ore" }, content);
    expect(accIron.error).toBe(undefined);
    // After enabling timber via gathererResources it becomes assignable.
    const withTimber = NewGame(new FakeClock(0));
    withTimber.unlocks.gathererResources = ["timber"];
    const accTimber = reduce(withTimber, { type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "timber" }, content);
    expect(accTimber.error).toBe(undefined);
    expect(accTimber.state.graph.nodes.find((n) => n.id === "n_miner_0").resourceId).toBe("timber");
  });
});
