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

/** Full rebuild cost of a building copy: placement is free in this game, so the
 *  cost is the sum of every member machine's upgrades needed to reach its level. */
export function buildingCopyCost(building, state, content) {
  let total = 0;
  for (const nid of building.nodeIds) {
    const n = state.graph.nodes.find((x) => x.id === nid);
    if (!n) continue;
    for (let L = 1; L < n.level; L++) total += upgradeCost(n.kind, L, content);
  }
  return total;
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
