export const INTENT = {
  PlaceNode: "PlaceNode",
  ConnectLink: "ConnectLink",
  UpgradeNode: "UpgradeNode",
  SetRecipe: "SetRecipe",
  BuyResearch: "BuyResearch",
  EquipItem: "EquipItem",
  StartExpedition: "StartExpedition",
  SellFromStockpile: "SellFromStockpile",
  LevelUpHero: "LevelUpHero",
  RecruitHero: "RecruitHero",
  SetGathererResource: "SetGathererResource",
  RemoveNode: "RemoveNode",
  RemoveLink: "RemoveLink",
  DismissTooltip: "DismissTooltip",
};

const isStr = (v) => typeof v === "string" && v.length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPos = (v) => v && isNum(v.x) && isNum(v.y);

const SHAPES = {
  PlaceNode: (i) => isStr(i.kind) && isPos(i.pos),
  ConnectLink: (i) => isStr(i.from) && isStr(i.to) && isStr(i.resourceId),
  UpgradeNode: (i) => isStr(i.nodeId),
  SetRecipe: (i) => isStr(i.nodeId) && isStr(i.recipeId),
  BuyResearch: (i) => isStr(i.nodeId),
  EquipItem: (i) =>
    isStr(i.heroId) && isStr(i.slot) && isStr(i.itemId) && isNum(i.tier),
  StartExpedition: (i) => isStr(i.territoryId) && isStr(i.heroId),
  SellFromStockpile: (i) => isStr(i.nodeId) && isStr(i.resId),
  LevelUpHero: (i) => isStr(i.heroId),
  RecruitHero: (i) => isStr(i.templateId),
  SetGathererResource: (i) => isStr(i.nodeId) && isStr(i.resourceId),
  RemoveNode: (i) => isStr(i.nodeId),
  RemoveLink: (i) => isStr(i.linkId),
  DismissTooltip: (i) => isStr(i.flag),
};

export function validate(intent) {
  if (!intent || typeof intent !== "object")
    return { ok: false, error: "intent must be an object" };
  const shape = SHAPES[intent.type];
  if (!shape)
    return { ok: false, error: "unknown intent type: " + intent.type };
  if (!shape(intent))
    return { ok: false, error: "malformed " + intent.type + " intent" };
  return { ok: true };
}
