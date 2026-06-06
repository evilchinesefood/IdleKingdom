import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  canBuyResearch,
  buyResearchError,
  buyResearch,
  applyEffects,
  researchStatus,
  tuningCost,
  canBuyTuning,
  buyTuningError,
  buyTuning,
} from "../Source/Engine/Systems/ResearchSystem.js";
import { reduce } from "../Source/Engine/Reducer.js";
import { solve } from "../Source/Engine/Simulation/RateSolver.js";
import { content as fullContent } from "../Source/Engine/Content/Content.js";

const content = {
  resources: RESOURCES,
  machines: MACHINES,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
};

// Buy a chain of research nodes by directly granting currency, ignoring prereq order helper.
function own(s, id) {
  s.currencies.research += content.researchNodes[id].cost + 1;
  buyResearch(s, content, id);
}

describe("ResearchSystem", () => {
  it("prereq gating: cannot buy res_lumber before res_scholar", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_lumber")).toBe(false); // prereq res_scholar unowned
    expect(researchStatus(s, content, "res_lumber")).toBe("locked");
    expect(researchStatus(s, content, "res_scholar")).toBe("available");
  });

  it("buyResearchError: null when buyable, cost-named when ONLY cost blocks, catch-all on prereq", () => {
    const s = NewGame(new FakeClock(0));
    // res_scholar costs 9 research and has no prereqs.
    s.currencies.research = 9;
    expect(buyResearchError(s, content, "res_scholar")).toBe(null);
    // one short -> the cost-only message, naming the price in the node's currency
    s.currencies.research = 8;
    expect(buyResearchError(s, content, "res_scholar")).toBe(
      "Not enough research — unlock costs 9",
    );
    expect(canBuyResearch(s, content, "res_scholar")).toBe(false);
    // prereq failure is the catch-all even with currency to spare
    s.currencies.research = 1000;
    expect(buyResearchError(s, content, "res_lumber")).toBe(
      "Cannot buy research",
    );
  });

  it("buyTuningError: cost-named when ONLY cost blocks, catch-all otherwise", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 9; // gatherer tuning rank 0 costs 25
    expect(buyTuningError(s, content, "gatherer")).toBe(
      "Not enough research — tuning costs 25",
    );
    expect(buyTuningError(s, content, "storage")).toBe("Cannot buy tuning"); // not tunable
    expect(buyTuningError(s, content, "scholar")).toBe("Cannot buy tuning"); // locked machine
    s.currencies.research = 25;
    expect(buyTuningError(s, content, "gatherer")).toBe(null);
  });

  it("buying spends currency, records ownership, applies effects", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_scholar")).toBe(true);
    buyResearch(s, content, "res_scholar");
    expect(s.unlocks.researchOwned.includes("res_scholar")).toBe(true);
    expect(s.currencies.research).toBeCloseTo(1000 - 9, 1e-9);
    // res_scholar effects: unlockMachine scholar + unlockRecipe r_parchment
    expect(s.unlocks.machinesUnlocked.includes("scholar")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_parchment")).toBe(true);
    expect(researchStatus(s, content, "res_scholar")).toBe("owned");
    expect(s._solved).toBe(undefined);
  });

  it("res_smithing + res_armory buyable with NO territory reclaimed", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    // climb the research-only spine
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    // res_smithing needs only res_steelmaking
    expect(canBuyResearch(s, content, "res_smithing")).toBe(true);
    own(s, "res_smithing");
    // res_armory needs res_smithing + res_fittings (also research-only)
    own(s, "res_fittings");
    expect(canBuyResearch(s, content, "res_armory")).toBe(true);
    own(s, "res_armory");
    // No territory was reclaimed at any point:
    expect(s.territories.reclaimed.length).toBe(0);
    // All three equipment recipes are now unlocked => T1 gear craftable pre-expedition.
    expect(s.unlocks.recipesUnlocked.includes("r_sword")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_armor")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_shield")).toBe(true);
    // ...and the workshop machine is placeable (unlocked at res_scholar, the very first
    // node), so the equipment chain is actually buildable in-game, not just recipe-unlocked.
    expect(s.unlocks.machinesUnlocked.includes("workshop")).toBe(true);
  });

  it("scholar bootstrap: res_scholar alone unlocks the Workshop so the parchment stream isn't trapped", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100;
    own(s, "res_scholar");
    // The Scholar machine consumes parchment; r_parchment (timber->parchment) is a
    // WORKSHOP recipe. res_scholar must therefore also unlock the workshop machine,
    // or the only way to feed the Scholar is locked 8 nodes deep (dead trap).
    expect(s.unlocks.machinesUnlocked.includes("scholar")).toBe(true);
    expect(s.unlocks.machinesUnlocked.includes("workshop")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_parchment")).toBe(true);

    // PlaceNode {kind:"workshop"} is ACCEPTED by the reducer right after res_scholar.
    const placeWorkshop = reduce(
      s,
      {
        type: "PlaceNode",
        kind: "workshop",
        recipeId: "r_parchment",
        pos: { x: 200, y: 200 },
      },
      fullContent,
    );
    expect(placeWorkshop.error).toBe(undefined);
    expect(
      placeWorkshop.state.graph.nodes.some((n) => n.kind === "workshop"),
    ).toBe(true);
    // ...and a Scholar too, completing the parchment -> research stream.
    const placeScholar = reduce(
      placeWorkshop.state,
      { type: "PlaceNode", kind: "scholar", pos: { x: 360, y: 200 } },
      fullContent,
    );
    expect(placeScholar.error).toBe(undefined);
  });

  it("scholar bootstrap: a fed Workshop(r_parchment) -> Scholar yields research > 0 via solve", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100;
    own(s, "res_scholar");
    own(s, "res_lumber"); // enables timber gathering so the workshop can actually be fed
    // timber gatherer -> parchment workshop -> scholar
    let st = reduce(
      s,
      {
        type: "PlaceNode",
        kind: "gatherer",
        resourceId: "timber",
        pos: { x: 0, y: 0 },
      },
      fullContent,
    ).state;
    const gid = st.graph.nodes[st.graph.nodes.length - 1].id;
    st = reduce(
      st,
      {
        type: "PlaceNode",
        kind: "workshop",
        recipeId: "r_parchment",
        pos: { x: 200, y: 0 },
      },
      fullContent,
    ).state;
    const wid = st.graph.nodes[st.graph.nodes.length - 1].id;
    st = reduce(
      st,
      { type: "PlaceNode", kind: "scholar", pos: { x: 400, y: 0 } },
      fullContent,
    ).state;
    const sid = st.graph.nodes[st.graph.nodes.length - 1].id;
    st = reduce(
      st,
      { type: "ConnectLink", from: gid, to: wid, resourceId: "timber" },
      fullContent,
    ).state;
    st = reduce(
      st,
      { type: "ConnectLink", from: wid, to: sid, resourceId: "parchment" },
      fullContent,
    ).state;

    const solved = solve(st, fullContent);
    expect(solved.researchRate > 0).toBeTruthy();
  });

  it("territory-gated nodes blocked until reclaim: res_master_smithing needs t_ironreach", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_hardened_steel"); // prereq of res_master_smithing
    // prereq owned + research plenty, but t_ironreach not reclaimed:
    expect(canBuyResearch(s, content, "res_master_smithing")).toBe(false);
    s.territories.reclaimed.push(
      "t_gatehouse",
      "t_smithyward",
      "t_oldmarket",
      "t_ironreach",
    );
    expect(canBuyResearch(s, content, "res_master_smithing")).toBe(true);
  });

  it("res_drill_yard unlocks the barracks machine (and the militia recipe)", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_smithing");
    own(s, "res_fittings");
    own(s, "res_armory"); // prereq of res_drill_yard
    expect(s.unlocks.machinesUnlocked.includes("barracks")).toBe(false);
    own(s, "res_drill_yard");
    expect(s.unlocks.machinesUnlocked.includes("barracks")).toBe(true);
    expect(s.unlocks.recipesUnlocked.includes("r_militia")).toBe(true);
  });

  it("private EFFECTS and ResearchNodes.effects are in lockstep for the three war-rework nodes", () => {
    // buyResearch applies the module-private EFFECTS table; applyEffects(node.effects)
    // applies the DECLARED content effects. If the two ever drift, the resulting
    // unlock subtrees differ. Deep-equal them per node.
    for (const id of [
      "res_drill_yard",
      "res_hardened_steel",
      "res_master_smithing",
    ]) {
      // A: buy the node (runs private EFFECTS[id])
      const a = NewGame(new FakeClock(0));
      a.unlocks.researchOwned.push(...content.researchNodes[id].prereqs);
      a.territories.reclaimed.push("t_ironreach"); // satisfies any territory gate
      a.currencies.research = content.researchNodes[id].cost;
      buyResearch(a, content, id);

      // B: apply the DECLARED node.effects to a clean unlocks tree
      const b = NewGame(new FakeClock(0));
      applyEffects(b, content, content.researchNodes[id].effects);

      // the unlock fields each effect touches must match between A and B
      expect(b.unlocks.machinesUnlocked).toEqual(a.unlocks.machinesUnlocked);
      expect(b.unlocks.marketListings).toEqual(a.unlocks.marketListings);
      // A already has r_iron_bar seeded; compare the newly-unlocked recipes only
      const newRecipes = (u) =>
        u.recipesUnlocked.filter((r) => r !== "r_iron_bar");
      expect(newRecipes(b.unlocks)).toEqual(newRecipes(a.unlocks));
    }
  });

  it("applyEffects: titheRate, offlineCapHours, productionBonus, globalRateBonus", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "titheRate", value: 0.07 }]);
    expect(s.unlocks.titheRate).toBeCloseTo(0.07, 1e-9);
    applyEffects(s, content, [{ type: "offlineCapHours", value: 24 }]);
    expect(s.unlocks.offlineCapHours).toBe(1); // clamped: 1h is a hard maximum
    applyEffects(s, content, [
      { type: "productionBonus", kind: "smelter", mult: 1.25 },
    ]);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25, 1e-9);
    applyEffects(s, content, [{ type: "globalRateBonus", mult: 1.1 }]);
    expect(s.unlocks.productionBonuses.gatherer).toBeCloseTo(1.1, 1e-9);
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.25 * 1.1, 1e-9);
    expect(s.unlocks.productionBonuses.workshop).toBeCloseTo(1.1, 1e-9);
  });

  it("Tier-A nodes blocked until t_highwall reclaimed, purchasable after", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    // Satisfy all prereqs for res_war_drums
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_smithing");
    own(s, "res_fittings");
    own(s, "res_armory");
    own(s, "res_drill_yard");
    own(s, "res_hardened_steel");
    s.territories.reclaimed.push(
      "t_gatehouse",
      "t_smithyward",
      "t_oldmarket",
      "t_ironreach",
    );
    own(s, "res_master_smithing");
    // prereqs met but t_highwall not yet reclaimed
    expect(canBuyResearch(s, content, "res_war_drums")).toBe(false);
    expect(researchStatus(s, content, "res_war_drums")).toBe("locked");
    // reclaim t_highwall
    s.territories.reclaimed.push("t_highwall");
    expect(canBuyResearch(s, content, "res_war_drums")).toBe(true);
    buyResearch(s, content, "res_war_drums");
    expect(s.unlocks.researchOwned.includes("res_war_drums")).toBe(true);
    // effect: productionBonus barracks ×1.5
    expect(s.unlocks.productionBonuses.barracks).toBeCloseTo(1.5, 1e-9);
  });

  it("Tier-B nodes blocked until t_blackkeep reclaimed, purchasable after", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    // Satisfy prereqs for res_siege_engines (needs res_war_drums)
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_smithing");
    own(s, "res_fittings");
    own(s, "res_armory");
    own(s, "res_drill_yard");
    own(s, "res_hardened_steel");
    s.territories.reclaimed.push(
      "t_gatehouse",
      "t_smithyward",
      "t_oldmarket",
      "t_ironreach",
    );
    own(s, "res_master_smithing");
    s.territories.reclaimed.push("t_highwall");
    own(s, "res_war_drums");
    // prereqs met but t_blackkeep not yet reclaimed
    expect(canBuyResearch(s, content, "res_siege_engines")).toBe(false);
    expect(researchStatus(s, content, "res_siege_engines")).toBe("locked");
    // reclaim t_blackkeep
    s.territories.reclaimed.push("t_blackkeep");
    expect(canBuyResearch(s, content, "res_siege_engines")).toBe(true);
    buyResearch(s, content, "res_siege_engines");
    expect(s.unlocks.researchOwned.includes("res_siege_engines")).toBe(true);
    // effect: productionBonus barracks ×2.0 (stacks on the ×1.5 from res_war_drums)
    expect(s.unlocks.productionBonuses.barracks).toBeCloseTo(1.5 * 2.0, 1e-9);
  });

  it("res_quartermaster effect wiring: EFFECTS and content effects are in lockstep and set autoSell (task 7)", () => {
    // content.researchNodes[id].effects (display/validation) must match the applied EFFECTS.
    const node = content.researchNodes.res_quartermaster;
    expect(node.effects).toEqual([{ type: "autoSell", enabled: true }]);
    // buying it (after prereqs/territory) flips state.unlocks.autoSell on.
    const s = NewGame(new FakeClock(0));
    s.unlocks.researchOwned.push(
      "res_scholar",
      "res_open_market",
      "res_steelmaking",
      "res_trade_routes",
    );
    s.territories.reclaimed.push("t_ironreach");
    s.currencies.research = 1000;
    expect(canBuyResearch(s, content, "res_quartermaster")).toBe(true);
    buyResearch(s, content, "res_quartermaster");
    expect(s.unlocks.autoSell).toBe(true);
  });

  it("applyEffects: marketCapacityBonus, enableGathererResource, autoSell", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "marketCapacityBonus", mult: 1.3 }]);
    expect(s.unlocks.productionBonuses.market).toBeCloseTo(1.3, 1e-9);
    applyEffects(s, content, [
      { type: "enableGathererResource", resourceId: "coal_raw" },
    ]);
    expect(s.unlocks.gathererResources.includes("coal_raw")).toBe(true);
    applyEffects(s, content, [{ type: "autoSell", enabled: true }]);
    expect(s.unlocks.autoSell).toBe(true);
  });
});

describe("Machine Tuning — endless research sink", () => {
  it("cost grows geometrically per rank (25, 40, 64) — halved baseline", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(tuningCost(s, "gatherer")).toBe(25);
    buyTuning(s, content, "gatherer");
    expect(tuningCost(s, "gatherer")).toBe(40);
    buyTuning(s, content, "gatherer");
    expect(tuningCost(s, "gatherer")).toBe(64);
    expect(s.currencies.research).toBeCloseTo(1000 - 25 - 40, 1e-9);
    expect(s.unlocks.tuningRanks.gatherer).toBe(2);
  });

  it("baseline is halved: rank 0 === 25, rank 1 === 40 (was 50/80)", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    expect(tuningCost(s, "gatherer")).toBe(25);
    buyTuning(s, content, "gatherer");
    expect(tuningCost(s, "gatherer")).toBe(40);
  });

  it("each rank multiplies the kind's bonus by 1.1, stacking on one-shot research", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 1000;
    s.unlocks.productionBonuses.smelter = 1.25; // e.g. res_efficient_forges
    buyTuning(s, content, "smelter");
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.375, 1e-9);
    buyTuning(s, content, "smelter");
    expect(s.unlocks.productionBonuses.smelter).toBeCloseTo(1.5125, 1e-9);
  });

  it("rejects locked kinds, non-tunable kinds, and unaffordable buys (pure-on-reject)", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 9;
    expect(canBuyTuning(s, content, "scholar")).toBe(false); // machine locked at start
    expect(canBuyTuning(s, content, "storage")).toBe(false); // not a tunable kind
    expect(canBuyTuning(s, content, "gatherer")).toBe(false); // broke
    const out = reduce(s, { type: "BuyTuning", kind: "gatherer" }, fullContent);
    expect(out.error).toBe("Not enough research — tuning costs 25"); // gatherer rank-0 tuning cost
    expect(out.state).toBe(s); // original untouched on reject
  });

  it("an accepted BuyTuning intent raises that kind's solved capacity by 10%", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100;
    s.graph.nodes.push({
      id: "g1",
      kind: "gatherer",
      level: 1,
      resourceId: "iron_ore",
      recipeId: null,
      stockpile: {},
      pos: { x: 0, y: 0 },
    });
    const before = solve(s, fullContent).capacityByNode.g1;
    const out = reduce(s, { type: "BuyTuning", kind: "gatherer" }, fullContent);
    expect(out.error).toBe(undefined);
    const after = solve(out.state, fullContent).capacityByNode.g1;
    expect(after).toBeCloseTo(before * 1.1, 1e-9);
  });
});
