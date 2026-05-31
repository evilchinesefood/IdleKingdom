import { describe, it, expect } from "./Runner.js";
import { INTENT, validate } from "../Source/Engine/Intents.js";

describe("Intents", () => {
  it("exposes the full INTENT tag set", () => {
    expect(INTENT.PlaceNode).toBe("PlaceNode");
    expect(INTENT.ConnectLink).toBe("ConnectLink");
    expect(INTENT.UpgradeNode).toBe("UpgradeNode");
    expect(INTENT.SetRecipe).toBe("SetRecipe");
    expect(INTENT.BuyResearch).toBe("BuyResearch");
    expect(INTENT.EquipItem).toBe("EquipItem");
    expect(INTENT.StartExpedition).toBe("StartExpedition");
    expect(INTENT.SellFromStockpile).toBe("SellFromStockpile");
    expect(INTENT.LevelUpHero).toBe("LevelUpHero");
    expect(INTENT.RecruitHero).toBe("RecruitHero");
    expect(INTENT.SetGathererResource).toBe("SetGathererResource");
    expect(INTENT.RemoveNode).toBe("RemoveNode");
    expect(INTENT.RemoveLink).toBe("RemoveLink");
    expect(INTENT.DismissTooltip).toBe("DismissTooltip");
  });

  it("validate accepts well-formed intents", () => {
    expect(validate({ type: "UpgradeNode", nodeId: "n_miner_0" }).ok).toBe(
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
    expect(
      validate({
        type: "EquipItem",
        heroId: "h_0",
        slot: "weapon",
        itemId: "sword",
        tier: 1,
      }).ok,
    ).toBe(true);
    expect(
      validate({
        type: "StartExpedition",
        territoryId: "t_gatehouse",
        heroId: "h_0",
      }).ok,
    ).toBe(true);
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
    expect(validate({ type: "LevelUpHero", heroId: "h_0" }).ok).toBe(true);
    expect(
      validate({ type: "RecruitHero", templateId: "hero_ranger" }).ok,
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
    expect(validate({ type: "DismissTooltip", flag: "seenGoldTip" }).ok).toBe(
      true,
    );
  });

  it("validate rejects unknown type + missing fields", () => {
    expect(validate({ type: "Nope" }).ok).toBe(false);
    expect(validate({ type: "UpgradeNode" }).ok).toBe(false); // no nodeId
    expect(validate({ type: "ConnectLink", from: "a", to: "b" }).ok).toBe(
      false,
    ); // no resourceId
    expect(
      validate({
        type: "EquipItem",
        heroId: "h_0",
        slot: "weapon",
        itemId: "sword",
      }).ok,
    ).toBe(false); // no tier
    expect(validate({ type: "PlaceNode", kind: "smelter" }).ok).toBe(false); // no pos
    expect(
      validate({ type: "PlaceNode", kind: "smelter", pos: { x: 1 } }).ok,
    ).toBe(false); // pos.y missing
    expect(validate(null).ok).toBe(false);
    expect(validate(42).ok).toBe(false);
  });

  it("validate returns an error message on rejection", () => {
    const r = validate({ type: "UpgradeNode" });
    expect(r.ok).toBe(false);
    expect(typeof r.error === "string" && r.error.length > 0).toBeTruthy();
  });
});
