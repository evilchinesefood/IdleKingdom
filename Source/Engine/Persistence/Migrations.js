/** Ordered migration registry; each fn upgrades a blob from version N to N+1. */

export function migrate1to2(blob) {
  const next = { ...blob, version: 2 };
  if (!next.meta) next.meta = {};
  if (!next.meta.tutorialFlags) {
    next.meta.tutorialFlags = {
      seenGoldTip: false,
      seenUpgradeTip: false,
      seenConnectTip: false,
    };
  }
  return next;
}

export function migrate2to3(blob) {
  const next = { ...blob, version: 3 };
  if (!next.unlocks) next.unlocks = {};
  const u = next.unlocks;
  // Split a legacy flat offlineCap (hours) into the v3 fields if present.
  if (u.offlineCapHours == null) {
    u.offlineCapHours = typeof u.offlineCap === "number" ? u.offlineCap : 8;
  }
  delete u.offlineCap;
  if (!u.productionBonuses) {
    u.productionBonuses = {
      gatherer: 1.0,
      smelter: 1.0,
      workshop: 1.0,
      market: 1.0,
      scholar: 1.0,
    };
  }
  return next;
}

export const MIGRATIONS = { 1: migrate1to2, 2: migrate2to3 };
