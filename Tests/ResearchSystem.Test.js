import { describe, it, expect } from "./Runner.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";
import { MACHINES } from "../Source/Engine/Content/Machines.js";
import { RECIPES } from "../Source/Engine/Content/Recipes.js";
import { RESEARCH_NODES } from "../Source/Engine/Content/ResearchNodes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  canBuyResearch,
  buyResearch,
  applyEffects,
  researchStatus,
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
  s.currencies.renown += content.researchNodes[id].cost + 1;
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

  it("BLOCKER #1: res_smithing + res_armory buyable with NO territory reclaimed", () => {
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

  it("territory-gated nodes blocked until reclaim: res_war_college needs t_smithyward", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.research = 100000;
    s.currencies.renown = 100000;
    own(s, "res_scholar");
    own(s, "res_lumber");
    own(s, "res_tannery");
    own(s, "res_coalworks");
    own(s, "res_steelmaking");
    own(s, "res_smithing");
    own(s, "res_fittings");
    own(s, "res_armory");
    // prereq (res_armory) owned + renown plenty, but t_smithyward not reclaimed:
    expect(canBuyResearch(s, content, "res_war_college")).toBe(false);
    s.territories.reclaimed.push("t_gatehouse", "t_smithyward");
    expect(canBuyResearch(s, content, "res_war_college")).toBe(true);
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

  it("res_quartermaster effect wiring: EFFECTS and content effects are in lockstep and set autoSell (task 7)", () => {
    // content.researchNodes[id].effects (display/validation) must match the applied EFFECTS.
    const node = content.researchNodes.res_quartermaster;
    expect(node.effects).toEqual([{ type: "autoSell", enabled: true }]);
    // buying it (after prereqs/territory) flips state.unlocks.autoSell on.
    const s = NewGame(new FakeClock(0));
    s.unlocks.researchOwned.push(
      "res_scholar",
      "res_lumber",
      "res_tannery",
      "res_coalworks",
      "res_steelmaking",
      "res_smithing",
      "res_fittings",
      "res_armory",
      "res_war_college",
      "res_trade_routes",
    );
    s.territories.reclaimed.push("t_ironreach");
    s.currencies.renown = 1000;
    expect(canBuyResearch(s, content, "res_quartermaster")).toBe(true);
    buyResearch(s, content, "res_quartermaster");
    expect(s.unlocks.autoSell).toBe(true);
  });

  it("applyEffects: marketCapacityBonus, enableGathererResource, heroSlot, autoSell, unlockGearTier", () => {
    const s = NewGame(new FakeClock(0));
    applyEffects(s, content, [{ type: "marketCapacityBonus", mult: 1.3 }]);
    expect(s.unlocks.productionBonuses.market).toBeCloseTo(1.3, 1e-9);
    applyEffects(s, content, [
      { type: "enableGathererResource", resourceId: "coal_raw" },
    ]);
    expect(s.unlocks.gathererResources.includes("coal_raw")).toBe(true);
    const slots0 = s.unlocks.heroSlots;
    applyEffects(s, content, [{ type: "heroSlot", count: 1 }]);
    expect(s.unlocks.heroSlots).toBe(slots0 + 1);
    applyEffects(s, content, [{ type: "autoSell", enabled: true }]);
    expect(s.unlocks.autoSell).toBe(true);
    applyEffects(s, content, [
      { type: "unlockGearTier", itemIds: ["sword", "shield"], tier: 2 },
    ]);
    const hasSwordT2 = s.unlocks.gearTiersUnlocked.some(
      (g) => g.itemId === "sword" && g.tier === 2,
    );
    expect(hasSwordT2).toBe(true);
  });
});
