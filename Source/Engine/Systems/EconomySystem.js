// Machine upgrade cost: 15%/level compounding up to the knee, then a gentler
// 10%/level beyond it so late-game (L50+) prices stay reachable.
const GROWTH = 1.15;
const SOFT_KNEE = 40;
const SOFT_GROWTH = 1.1;
export function upgradeCost(kind, level, content) {
  const hard = Math.min(level, SOFT_KNEE);
  const soft = Math.max(0, level - SOFT_KNEE);
  return (
    content.machines[kind].upgradeBase *
    Math.pow(GROWTH, hard) *
    Math.pow(SOFT_GROWTH, soft)
  );
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

/** THE building pricing walk — both copy-cost variants in one pass.
 *  `structure` = bare L0->L1 rebuild (upgradeBase per member); `withUpgrades` =
 *  structure + every member's upgrade ladder to its current level. Pass a prebuilt
 *  node id->node Map (`byId`) when pricing many buildings against one state. */
export function buildingCopyCosts(building, state, content, byId) {
  const idx = byId || new Map(state.graph.nodes.map((n) => [n.id, n]));
  let structure = 0;
  let upgrades = 0;
  for (const nid of building.nodeIds) {
    const n = idx.get(nid);
    if (!n) continue;
    structure += upgradeCost(n.kind, 0, content); // upgradeBase = base machine cost
    for (let L = 1; L < n.level; L++)
      upgrades += upgradeCost(n.kind, L, content);
  }
  return { structure, withUpgrades: structure + upgrades };
}

/** Base rebuild cost of a building (bare structure, no upgrades). */
export function buildingStructureCost(building, state, content) {
  return buildingCopyCosts(building, state, content).structure;
}

/** Cost to copy a building, with (default) or without the upgrade ladder. */
export function buildingCopyCost(
  building,
  state,
  content,
  withUpgrades = true,
) {
  const c = buildingCopyCosts(building, state, content);
  return withUpgrades ? c.withUpgrades : c.structure;
}

/** Auto-sell (res_quartermaster) liquidates surplus at this fraction of basePrice —
 *  the discount keeps hand-built market routes the better deal. */
export const AUTO_SELL_RATE = 0.5;

/** Cost to paste a loose set of cloned nodes: each node's structure (L0->L1) plus
 *  its upgrade ladder up to its target level. Mirrors buildingCopyCost's pricing. */
export function pasteCost(nodes, content) {
  let t = 0;
  for (const n of nodes) {
    t += upgradeCost(n.kind, 0, content);
    for (let L = 1; L < (n.level || 1); L++)
      t += upgradeCost(n.kind, L, content);
  }
  return t;
}

/** A storage room's total holding capacity: cap = baseCap + capGain*(level-1). */
export function storageCapacity(node, content) {
  if (!node || node.kind !== "storage") return 0;
  const m = content.machines.storage;
  return m.baseCap + m.capGain * (node.level - 1);
}

export function isListed(state, content, resourceId) {
  // Selling is research-gated progression: a resource must be a market listing AND
  // have a price (price-less inputs like parchment are never sellable).
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
