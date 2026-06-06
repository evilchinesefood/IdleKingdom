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

export function migrate3to4(blob) {
  const next = { ...blob, version: 4 };
  if (!next.graph) next.graph = {};
  const g = next.graph;
  if (!Array.isArray(g.buildings)) g.buildings = [];
  if (typeof g.nextBuildingSeq !== "number") g.nextBuildingSeq = 0;
  return next;
}

export function migrate4to5(blob) {
  const next = { ...blob, version: 5 };
  if (!next.unlocks) next.unlocks = {};
  const u = next.unlocks;
  if (
    Array.isArray(u.machinesUnlocked) &&
    !u.machinesUnlocked.includes("storage")
  )
    u.machinesUnlocked.push("storage");
  if (u.productionBonuses && u.productionBonuses.storage == null)
    u.productionBonuses.storage = 1.0;
  return next;
}

export function migrate5to6(blob) {
  const next = { ...blob, version: 6 };
  const nodes = (next.graph && next.graph.nodes) || [];
  for (const n of nodes) {
    if (n.kind === "storage") {
      // single held resource -> array of held resources
      if (!Array.isArray(n.resourceIds))
        n.resourceIds = n.resourceId ? [n.resourceId] : [];
      delete n.resourceId;
    }
  }
  return next;
}

export function migrate6to7(blob) {
  // Storage hold cap became a SHARED total (200*level) instead of per-type. An old
  // multi-type storage could be over the new shared cap; scale its contents down to fit.
  const next = { ...blob, version: 7 };
  const nodes = (next.graph && next.graph.nodes) || [];
  for (const n of nodes) {
    if (n.kind !== "storage" || !n.stockpile) continue;
    const cap = 200 * (n.level || 1);
    let total = 0;
    for (const k in n.stockpile) total += n.stockpile[k] || 0;
    if (total > cap && total > 0) {
      const scale = cap / total;
      for (const k in n.stockpile) n.stockpile[k] *= scale;
    }
  }
  return next;
}

export function migrate7to8(blob) {
  // Offline progress is now hard-capped at 1 hour. Clamp any save that earned a higher
  // cap from the old research/territory effects (those grants have been retired).
  const next = { ...blob, version: 8 };
  if (next.unlocks) {
    next.unlocks.offlineCapHours = Math.min(
      next.unlocks.offlineCapHours ?? 1,
      1,
    );
  }
  return next;
}

export function migrate8to9(blob) {
  // Buildings gained an optional `children` (nested groups). Default it to [].
  const next = { ...blob, version: 9 };
  const buildings = (next.graph && next.graph.buildings) || [];
  for (const b of buildings) if (!Array.isArray(b.children)) b.children = [];
  return next;
}

export function migrate9to10(blob) {
  // The onboarding tutorial moved from per-step "seen" flags to a single
  // action-triggered guide gated by meta.tutorialDone. Any existing save is a
  // returning player, so mark the tutorial done — it shouldn't replay.
  const next = { ...blob, version: 10 };
  if (!next.meta) next.meta = {};
  delete next.meta.tutorialFlags;
  next.meta.tutorialDone = true;
  return next;
}

export function migrate10to11(blob) {
  // War rework: expeditions/heroes/renown removed; rate-based siege added.
  // Banked renown converts to research at 1:10 so progress isn't wasted.
  const next = { ...blob, version: 11 };
  next.currencies = { ...next.currencies };
  next.currencies.research =
    (next.currencies.research || 0) + (next.currencies.renown || 0) * 10;
  delete next.currencies.renown;
  delete next.heroes;
  delete next.expeditions;
  next.unlocks = { ...next.unlocks };
  delete next.unlocks.gearTiersUnlocked;
  delete next.unlocks.heroSlots;
  // research nodes that no longer exist (war college) must not linger as owned
  next.unlocks.researchOwned = (next.unlocks.researchOwned || []).filter(
    (id) => id !== "res_war_college",
  );
  // Seed a full default map (without storage — task 40 drops that slot) then
  // overlay whatever the v10 blob already had, so no kind is left undefined.
  next.unlocks.productionBonuses = {
    gatherer: 1.0,
    smelter: 1.0,
    workshop: 1.0,
    barracks: 1.0,
    market: 1.0,
    scholar: 1.0,
    ...next.unlocks.productionBonuses,
  };
  if (!next.siege) next.siege = { progress: 0 };
  return next;
}

export const MIGRATIONS = {
  1: migrate1to2,
  2: migrate2to3,
  3: migrate3to4,
  4: migrate4to5,
  5: migrate5to6,
  6: migrate6to7,
  7: migrate7to8,
  8: migrate8to9,
  9: migrate9to10,
  10: migrate10to11,
};
