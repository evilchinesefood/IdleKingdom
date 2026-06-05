import { describe, it, expect } from "./Runner.js";
import { INTENT, validate } from "../Source/Engine/Intents.js";

describe("Intents", () => {
  it("exposes the full INTENT tag set", () => {
    expect(INTENT.PlaceNode).toBe("PlaceNode");
    expect(INTENT.ConnectLink).toBe("ConnectLink");
    expect(INTENT.UpgradeNode).toBe("UpgradeNode");
    expect(INTENT.BulkUpgrade).toBe("BulkUpgrade");
    expect(INTENT.SetRecipe).toBe("SetRecipe");
    expect(INTENT.BuyResearch).toBe("BuyResearch");
    expect(INTENT.BuyTuning).toBe("BuyTuning");
    expect(INTENT.SellFromStockpile).toBe("SellFromStockpile");
    expect(INTENT.SetGathererResource).toBe("SetGathererResource");
    expect(INTENT.SetStorageRule).toBe("SetStorageRule");
    expect(INTENT.RemoveNode).toBe("RemoveNode");
    expect(INTENT.RemoveLink).toBe("RemoveLink");
    expect(INTENT.SetNodePos).toBe("SetNodePos");
    expect(INTENT.AckVictory).toBe("AckVictory");
    expect(INTENT.DismissTutorial).toBe("DismissTutorial");
    // war-rework: no hero/expedition intents survive
    expect(INTENT.EquipItem).toBe(undefined);
    expect(INTENT.StartExpedition).toBe(undefined);
    expect(INTENT.LevelUpHero).toBe(undefined);
    expect(INTENT.RecruitHero).toBe(undefined);
  });

  it("validate accepts well-formed intents", () => {
    expect(validate({ type: "UpgradeNode", nodeId: "n_miner_0" }).ok).toBe(
      true,
    );
    expect(validate({ type: "BulkUpgrade", nodeIds: ["n_a", "n_b"] }).ok).toBe(
      true,
    );
    expect(
      validate({
        type: "ConnectLink",
        from: "a",
        to: "b",
        resourceId: "iron_ore",
      }).ok,
    ).toBe(true);
    expect(validate({ type: "BuyResearch", nodeId: "res_scholar" }).ok).toBe(
      true,
    );
    expect(validate({ type: "BuyTuning", kind: "gatherer" }).ok).toBe(true);
    expect(
      validate({ type: "PlaceNode", kind: "smelter", pos: { x: 10, y: 20 } })
        .ok,
    ).toBe(true);
    expect(
      validate({
        type: "SetRecipe",
        nodeId: "n_smelter_0",
        recipeId: "r_steel",
      }).ok,
    ).toBe(true);
    expect(
      validate({
        type: "SellFromStockpile",
        nodeId: "n_smelter_0",
        resId: "iron_bar",
      }).ok,
    ).toBe(true);
    expect(
      validate({
        type: "SetGathererResource",
        nodeId: "n_miner_0",
        resourceId: "coal_raw",
      }).ok,
    ).toBe(true);
    expect(validate({ type: "RemoveNode", nodeId: "n_x" }).ok).toBe(true);
    expect(validate({ type: "RemoveLink", linkId: "l_0" }).ok).toBe(true);
    expect(
      validate({ type: "SetNodePos", nodeId: "n_x", pos: { x: 1, y: 2 } }).ok,
    ).toBe(true);
    expect(validate({ type: "AckVictory" }).ok).toBe(true);
    expect(validate({ type: "DismissTutorial" }).ok).toBe(true);
  });

  it("validate rejects unknown type + missing fields", () => {
    expect(validate({ type: "Nope" }).ok).toBe(false);
    expect(validate({ type: "UpgradeNode" }).ok).toBe(false); // no nodeId
    expect(validate({ type: "ConnectLink", from: "a", to: "b" }).ok).toBe(
      false,
    ); // no resourceId
    expect(validate({ type: "BuyTuning" }).ok).toBe(false); // no kind
    expect(validate({ type: "PlaceNode", kind: "smelter" }).ok).toBe(false); // no pos
    expect(
      validate({ type: "PlaceNode", kind: "smelter", pos: { x: 1 } }).ok,
    ).toBe(false); // pos.y missing
    expect(validate({ type: "SetNodePos", nodeId: "n_x" }).ok).toBe(false); // no pos
    expect(validate({ type: "BulkUpgrade", nodeIds: [] }).ok).toBe(false); // empty list
    expect(
      validate({ type: "SetNodePos", nodeId: "n_x", pos: { x: 1 } }).ok,
    ).toBe(false); // pos.y missing
    expect(
      validate({ type: "SetNodePos", nodeId: "n_x", pos: { x: NaN, y: 2 } }).ok,
    ).toBe(false); // non-finite
    expect(validate(null).ok).toBe(false);
    expect(validate(42).ok).toBe(false);
  });

  it("validate returns an error message on rejection", () => {
    const r = validate({ type: "UpgradeNode" });
    expect(r.ok).toBe(false);
    expect(typeof r.error === "string" && r.error.length > 0).toBeTruthy();
  });
});
