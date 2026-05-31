/** @typedef {Object} Machine
 *  @property {string} kind        gatherer|smelter|workshop|market|scholar
 *  @property {number} baseOutput  L1 output (units/s); crafters are recipe-driven, baseOutput unused
 *  @property {number} rateGain    added per level above 1
 *  @property {number} upgradeBase Gold base cost for cost(level)=upgradeBase*1.15^level
 */

/** Keyed map kind -> Machine. The 5 engine kinds. */
export const MACHINES = {
  gatherer: { kind: "gatherer", baseOutput: 1.0, rateGain: 0.5, upgradeBase: 15 },
  smelter: { kind: "smelter", baseOutput: 0.0, rateGain: 0.25, upgradeBase: 25 },
  workshop: { kind: "workshop", baseOutput: 0.0, rateGain: 0.2, upgradeBase: 40 },
  market: { kind: "market", baseOutput: 5.0, rateGain: 5.0, upgradeBase: 30 },
  scholar: { kind: "scholar", baseOutput: 0.5, rateGain: 0.25, upgradeBase: 35 },
};

/** Gatherer UI variants (cosmetic; engine treats all as `gatherer`). */
export const GATHERER_VARIANTS = {
  miner: { label: "Miner", resourceIds: ["iron_ore", "coal_raw", "gemstone"] },
  forester: { label: "Forester", resourceIds: ["timber"] },
  trapper: { label: "Trapper", resourceIds: ["hide"] },
};
