import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { TERRITORIES } from "../Source/Engine/Content/Territories.js";
import { seededState } from "./Fixtures/Seeded.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { reduce } from "../Source/Engine/Reducer.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
};

describe("Reducer", () => {
  it("is pure: rejected intent returns the original state object unchanged + an error", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.gold = 0; // cannot afford any upgrade
    const before = JSON.stringify(s);
    const out = reduce(
      s,
      { type: "UpgradeNode", nodeId: "n_miner_0" },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s); // unchanged reference on reject
    expect(JSON.stringify(s)).toBe(before); // input not mutated
  });

  it("accepts a legal UpgradeNode: returns a new state with the level bumped, original untouched", () => {
    const s = seededState(new FakeClock(0)); // 25 gold; miner upgrade 17.25
    const out = reduce(
      s,
      { type: "UpgradeNode", nodeId: "n_miner_0" },
      content,
    );
    expect(out.error).toBe(undefined);
    expect(out.state !== s).toBe(true); // new state on accept (cloned)
    const miner = out.state.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(miner.level).toBe(2);
    const origMiner = s.graph.nodes.find((n) => n.id === "n_miner_0");
    expect(origMiner.level).toBe(1); // original not mutated
    expect(out.state._solved).toBe(undefined); // structural change -> solver dirty
  });

  it("rejects malformed intents via Intents.validate", () => {
    const s = seededState(new FakeClock(0));
    const out = reduce(s, { type: "UpgradeNode" }, content);
    expect(out.state).toBe(s);
    expect(typeof out.error === "string").toBe(true);
  });

  it("routes BuyResearch via nodeId; rejects unaffordable, accepts affordable", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.research = 0;
    const rej = reduce(
      s,
      { type: "BuyResearch", nodeId: "res_scholar" },
      content,
    );
    expect(rej.error !== undefined).toBe(true);
    expect(rej.state).toBe(s);
    s.currencies.research = 100;
    const acc = reduce(
      s,
      { type: "BuyResearch", nodeId: "res_scholar" },
      content,
    );
    expect(acc.error).toBe(undefined);
    expect(acc.state.unlocks.researchOwned.includes("res_scholar")).toBe(true);
  });

  it("routes BuyTuning; rejects unaffordable, accepts when research covers the cost", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.research = 0;
    const rej = reduce(s, { type: "BuyTuning", kind: "gatherer" }, content);
    expect(rej.error !== undefined).toBe(true); // broke
    expect(rej.state).toBe(s);
    s.currencies.research = 100;
    const acc = reduce(s, { type: "BuyTuning", kind: "gatherer" }, content);
    expect(acc.error).toBe(undefined);
    expect(acc.state.unlocks.tuningRanks.gatherer).toBe(1);
    expect(acc.state.unlocks.productionBonuses.gatherer).toBeCloseTo(1.1, 1e-9);
  });

  it("rejects a cycle-creating ConnectLink", () => {
    const s = seededState(new FakeClock(0));
    // seed: miner->smelter->market. Try to close a cycle market->miner (illegal & wrong ports anyway).
    const out = reduce(
      s,
      {
        type: "ConnectLink",
        from: "n_market_0",
        to: "n_miner_0",
        resourceId: "iron_bar",
      },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("DismissTutorial marks the tutorial done (non-structural, no solver dirty needed)", () => {
    const s = seededState(new FakeClock(0));
    const out = reduce(s, { type: "DismissTutorial" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state.meta.tutorialDone).toBe(true);
  });

  it("BulkUpgrade upgrades every selected node by 1 and charges the combined cost", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.gold = 100000;
    const ids = ["n_miner_0", "n_smelter_0"];
    const before = ids.map(
      (id) => s.graph.nodes.find((n) => n.id === id).level,
    );
    const out = reduce(s, { type: "BulkUpgrade", nodeIds: ids }, content);
    expect(out.error).toBe(undefined);
    ids.forEach((id, i) => {
      expect(out.state.graph.nodes.find((n) => n.id === id).level).toBe(
        before[i] + 1,
      );
    });
    expect(out.state.currencies.gold < 100000).toBe(true); // combined cost charged
  });

  it("BulkUpgrade is all-or-nothing: rejects with no change when gold can't cover all", () => {
    const s = seededState(new FakeClock(0));
    s.currencies.gold = 0;
    const ids = ["n_miner_0", "n_smelter_0"];
    const out = reduce(s, { type: "BulkUpgrade", nodeIds: ids }, content);
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s); // unchanged reference on reject
    ids.forEach((id) => {
      expect(s.graph.nodes.find((n) => n.id === id).level).toBe(1);
    });
  });

  it("SetGathererResource rejects timber/hide before their research; accepts after enableGathererResource", () => {
    const s = seededState(new FakeClock(0));
    // timber is NOT startable until res_lumber enables it (must not leak from a hardcoded set).
    const rejTimber = reduce(
      s,
      {
        type: "SetGathererResource",
        nodeId: "n_miner_0",
        resourceId: "timber",
      },
      content,
    );
    expect(rejTimber.error !== undefined).toBe(true);
    expect(rejTimber.state).toBe(s);
    const rejHide = reduce(
      s,
      { type: "SetGathererResource", nodeId: "n_miner_0", resourceId: "hide" },
      content,
    );
    expect(rejHide.error !== undefined).toBe(true);
    // iron_ore is the only seeded startable raw.
    const accIron = reduce(
      s,
      {
        type: "SetGathererResource",
        nodeId: "n_miner_0",
        resourceId: "iron_ore",
      },
      content,
    );
    expect(accIron.error).toBe(undefined);
    // After enabling timber via gathererResources it becomes assignable.
    const withTimber = seededState(new FakeClock(0));
    withTimber.unlocks.gathererResources = ["timber"];
    const accTimber = reduce(
      withTimber,
      {
        type: "SetGathererResource",
        nodeId: "n_miner_0",
        resourceId: "timber",
      },
      content,
    );
    expect(accTimber.error).toBe(undefined);
    expect(
      accTimber.state.graph.nodes.find((n) => n.id === "n_miner_0").resourceId,
    ).toBe("timber");
  });

  it("AckVictory sets meta.seenVictory; non-structural so rates are unaffected", () => {
    const s = seededState(new FakeClock(0));
    s.meta.won = true;
    const before = solve(s, content).goldRate;
    const out = reduce(s, { type: "AckVictory" }, content);
    expect(out.error).toBe(undefined);
    expect(out.state.meta.seenVictory).toBe(true);
    expect(s.meta.seenVictory).toBe(false); // original untouched
    // non-structural: economy unchanged after the ack
    expect(solve(out.state, content).goldRate).toBeCloseTo(before, 1e-9);
  });

  it("SetNodePos updates pos; non-structural so rates are unaffected; original untouched", () => {
    const s = seededState(new FakeClock(0));
    const before = solve(s, content).goldRate;
    const out = reduce(
      s,
      { type: "SetNodePos", nodeId: "n_smelter_0", pos: { x: 999, y: 42 } },
      content,
    );
    expect(out.error).toBe(undefined);
    const moved = out.state.graph.nodes.find((n) => n.id === "n_smelter_0");
    expect(moved.pos).toEqual({ x: 999, y: 42 });
    // pos move does not perturb the economy
    expect(solve(out.state, content).goldRate).toBeCloseTo(before, 1e-9);
    // original untouched
    expect(s.graph.nodes.find((n) => n.id === "n_smelter_0").pos).toEqual({
      x: 360,
      y: 200,
    });
  });

  it("SetNodePos carries the prior _solved cache forward reference-identical (no forced re-solve)", () => {
    const s = seededState(new FakeClock(0));
    // attach a solve cache as the live game would have before dispatching
    s._solved = solve(s, content);
    const cached = s._solved;
    const out = reduce(
      s,
      { type: "SetNodePos", nodeId: "n_smelter_0", pos: { x: 7, y: 7 } },
      content,
    );
    expect(out.error).toBe(undefined);
    // SAME object reference: pos is render-only, so the solve is provably unchanged
    expect(out.state._solved).toBe(cached);
    // the carried solve still describes the same economy after the move
    const fresh = solve(out.state, content);
    expect(out.state._solved.goldRate).toBeCloseTo(fresh.goldRate, 1e-9);
    expect(out.state._solved.researchRate).toBeCloseTo(
      fresh.researchRate,
      1e-9,
    );
  });

  it("a structural intent drops the _solved cache even when the input had one", () => {
    const s = seededState(new FakeClock(0));
    s._solved = solve(s, content);
    const out = reduce(
      s,
      {
        type: "PlaceNode",
        kind: "gatherer",
        resourceId: "iron_ore",
        pos: { x: 5, y: 5 },
      },
      content,
    );
    expect(out.error).toBe(undefined);
    expect(out.state._solved).toBe(undefined); // structural -> cache invalidated
  });

  it("SetNodePos rejects an unknown node", () => {
    const s = seededState(new FakeClock(0));
    const out = reduce(
      s,
      { type: "SetNodePos", nodeId: "n_nope", pos: { x: 1, y: 2 } },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("PlaceNode rejects a gatherer with a not-yet-enabled raw (defensive minor)", () => {
    const s = seededState(new FakeClock(0)); // timber not enabled yet
    const n0 = s.graph.nodes.length;
    const out = reduce(
      s,
      {
        type: "PlaceNode",
        kind: "gatherer",
        resourceId: "timber",
        pos: { x: 10, y: 20 },
      },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
    expect(s.graph.nodes.length).toBe(n0);
    // legit path: iron_ore (startable) still works
    const ok = reduce(
      s,
      {
        type: "PlaceNode",
        kind: "gatherer",
        resourceId: "iron_ore",
        pos: { x: 10, y: 20 },
      },
      content,
    );
    expect(ok.error).toBe(undefined);
    expect(ok.state.graph.nodes.length).toBe(n0 + 1);
  });

  it("PlaceNode rejects an unknown/cosmetic machine kind cleanly (no throw, state unchanged)", () => {
    const s = seededState(new FakeClock(0));
    const nodeCount0 = s.graph.nodes.length;
    // "forester" is a cosmetic gatherer label, NOT an engine machine kind.
    const out = reduce(
      s,
      { type: "PlaceNode", kind: "forester", pos: { x: 10, y: 20 } },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
    expect(s.graph.nodes.length).toBe(nodeCount0); // nothing pushed
  });

  it("PlaceNode rejects a real-but-locked machine kind (scholar before res_scholar)", () => {
    const s = seededState(new FakeClock(0));
    // "scholar" is a valid engine kind but not in NewGame machinesUnlocked.
    expect(s.unlocks.machinesUnlocked.includes("scholar")).toBe(false);
    const out = reduce(
      s,
      { type: "PlaceNode", kind: "scholar", pos: { x: 10, y: 20 } },
      content,
    );
    expect(out.error !== undefined).toBe(true);
    expect(out.state).toBe(s);
  });

  it("PlaceNode accepts an unlocked kind (smelter) — legitimate path still works", () => {
    const s = seededState(new FakeClock(0));
    const nodeCount0 = s.graph.nodes.length;
    const out = reduce(
      s,
      { type: "PlaceNode", kind: "smelter", pos: { x: 480, y: 300 } },
      content,
    );
    expect(out.error).toBe(undefined);
    expect(out.state.graph.nodes.length).toBe(nodeCount0 + 1);
    const placed = out.state.graph.nodes[out.state.graph.nodes.length - 1];
    expect(placed.kind).toBe("smelter");
  });
});
