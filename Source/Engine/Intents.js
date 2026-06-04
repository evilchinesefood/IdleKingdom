export const INTENT = {
  PlaceNode: "PlaceNode",
  ConnectLink: "ConnectLink",
  UpgradeNode: "UpgradeNode",
  BulkUpgrade: "BulkUpgrade",
  SetRecipe: "SetRecipe",
  BuyResearch: "BuyResearch",
  EquipItem: "EquipItem",
  StartExpedition: "StartExpedition",
  SellFromStockpile: "SellFromStockpile",
  LevelUpHero: "LevelUpHero",
  RecruitHero: "RecruitHero",
  SetGathererResource: "SetGathererResource",
  SetStorageRule: "SetStorageRule",
  AddToBuilding: "AddToBuilding",
  RemoveNode: "RemoveNode",
  RemoveLink: "RemoveLink",
  SetNodePos: "SetNodePos",
  CreateBuilding: "CreateBuilding",
  MoveBuilding: "MoveBuilding",
  ResizeBuilding: "ResizeBuilding",
  CopyBuilding: "CopyBuilding",
  PasteNodes: "PasteNodes",
  UngroupBuilding: "UngroupBuilding",
  DeleteBuilding: "DeleteBuilding",
  RemoveFromBuilding: "RemoveFromBuilding",
  RenameBuilding: "RenameBuilding",
  AckVictory: "AckVictory",
  DismissTutorial: "DismissTutorial",
};

const isStr = (v) => typeof v === "string" && v.length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPos = (v) => v && isNum(v.x) && isNum(v.y);
const isDelta = (v) => v && isNum(v.dx) && isNum(v.dy);
const isRect = (v) => v && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h);
const isStrArr = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

const SHAPES = {
  PlaceNode: (i) => isStr(i.kind) && isPos(i.pos),
  ConnectLink: (i) => isStr(i.from) && isStr(i.to) && isStr(i.resourceId),
  UpgradeNode: (i) => isStr(i.nodeId),
  BulkUpgrade: (i) => isStrArr(i.nodeIds),
  SetRecipe: (i) => isStr(i.nodeId) && isStr(i.recipeId),
  BuyResearch: (i) => isStr(i.nodeId),
  EquipItem: (i) =>
    isStr(i.heroId) && isStr(i.slot) && isStr(i.itemId) && isNum(i.tier),
  StartExpedition: (i) => isStr(i.territoryId) && isStr(i.heroId),
  SellFromStockpile: (i) => isStr(i.nodeId) && isStr(i.resId),
  LevelUpHero: (i) => isStr(i.heroId),
  RecruitHero: (i) => isStr(i.templateId),
  SetGathererResource: (i) => isStr(i.nodeId) && isStr(i.resourceId),
  SetStorageRule: (i) => isStr(i.nodeId) && Array.isArray(i.resourceIds),
  AddToBuilding: (i) => isStr(i.nodeId) && isStr(i.buildingId),
  RemoveNode: (i) => isStr(i.nodeId),
  RemoveLink: (i) => isStr(i.linkId),
  SetNodePos: (i) =>
    isStr(i.nodeId) &&
    i.pos &&
    Number.isFinite(i.pos.x) &&
    Number.isFinite(i.pos.y),
  CreateBuilding: (i) =>
    isRect(i.rect) &&
    (isStrArr(i.nodeIds) || isStrArr(i.children)) &&
    (i.nodeIds === undefined ||
      (Array.isArray(i.nodeIds) && i.nodeIds.every(isStr))) &&
    (i.children === undefined ||
      (Array.isArray(i.children) && i.children.every(isStr))),
  MoveBuilding: (i) => isStr(i.buildingId) && isDelta(i.delta),
  ResizeBuilding: (i) =>
    isStr(i.buildingId) && isRect(i.rect) && Array.isArray(i.nodeIds),
  CopyBuilding: (i) => isStr(i.buildingId) && isDelta(i.offset),
  PasteNodes: (i) =>
    isPos(i.at) &&
    Array.isArray(i.nodes) &&
    i.nodes.length > 0 &&
    i.nodes.every((n) => n && isStr(n.kind)) &&
    Array.isArray(i.links),
  UngroupBuilding: (i) => isStr(i.buildingId),
  DeleteBuilding: (i) => isStr(i.buildingId),
  RemoveFromBuilding: (i) => isStr(i.nodeId),
  RenameBuilding: (i) => isStr(i.buildingId) && typeof i.name === "string",
  AckVictory: () => true,
  DismissTutorial: () => true,
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
