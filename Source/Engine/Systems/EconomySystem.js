export function upgradeCost(kind, level, content) {
  return content.machines[kind].upgradeBase * Math.pow(1.15, level);
}

export function canUpgrade(state, content, nodeId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  return state.currencies.gold >= upgradeCost(node.kind, node.level, content);
}

export function applyUpgrade(state, content, nodeId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const cost = upgradeCost(node.kind, node.level, content);
  if (state.currencies.gold < cost) return;
  state.currencies.gold -= cost;
  node.level += 1;
  delete state._solved;
}

/** Base rebuild cost of a building: the L0->L1 placement price (upgradeBase) per
 *  member machine — i.e. what it costs to recreate the bare structure, no upgrades. */
export function buildingStructureCost(building, state, content) {
  let total = 0;
  for (const nid of building.nodeIds) {
    const n = state.graph.nodes.find((x) => x.id === nid);
    if (!n) continue;
    total += upgradeCost(n.kind, 0, content); // upgradeBase = base machine cost
  }
  return total;
}

/** Cost to copy a building: always the full structure rebuild, PLUS (when
 *  `withUpgrades`, the default) every member's upgrade ladder to its current level.
 *  `withUpgrades:false` prices a clean structure-only paste (machines at level 1). */
export function buildingCopyCost(
  building,
  state,
  content,
  withUpgrades = true,
) {
  let total = buildingStructureCost(building, state, content);
  if (withUpgrades) {
    for (const nid of building.nodeIds) {
      const n = state.graph.nodes.find((x) => x.id === nid);
      if (!n) continue;
      for (let L = 1; L < n.level; L++)
        total += upgradeCost(n.kind, L, content);
    }
  }
  return total;
}

/** A storage room's total holding capacity: cap = baseCap + capGain*(level-1). */
export function storageCapacity(node, content) {
  if (!node || node.kind !== "storage") return 0;
  const m = content.machines.storage;
  return m.baseCap + m.capGain * (node.level - 1);
}

export function isListed(state, content, resourceId) {
  const res = content.resources[resourceId];
  if (!res || res.basePrice == null) return false;
  return state.unlocks.marketListings.includes(resourceId);
}

export function sellFromStockpile(state, content, nodeId, resId) {
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  if (!isListed(state, content, resId)) return;
  const qty = node.stockpile[resId] || 0;
  if (qty <= 0) return;
  const gold = qty * content.resources[resId].basePrice;
  state.currencies.gold += gold;
  state.currencies.research += gold * state.unlocks.titheRate;
  node.stockpile[resId] = 0;
}
