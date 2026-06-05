/** @typedef {Object} Machine
 *  @property {string} kind        gatherer|smelter|workshop|market|scholar
 *  @property {number} baseOutput  L1 output (units/s); crafters are recipe-driven, baseOutput unused
 *  @property {number} rateGain    added per level above 1
 *  @property {number} upgradeBase Gold base cost; piecewise curve: 15%/level up to L40, then 10%/level beyond
 */

/** Keyed map kind -> Machine. The 5 engine kinds. */
export const MACHINES = {
  gatherer: {
    kind: "gatherer",
    baseOutput: 1.0,
    rateGain: 0.5,
    upgradeBase: 15,
  },
  smelter: {
    kind: "smelter",
    baseOutput: 0.0,
    rateGain: 0.25,
    upgradeBase: 25,
  },
  workshop: {
    kind: "workshop",
    baseOutput: 0.0,
    rateGain: 0.2,
    upgradeBase: 40,
  },
  barracks: {
    kind: "barracks",
    baseOutput: 0.0, // recipe-driven, like smelter/workshop
    rateGain: 0.02,
    upgradeBase: 60,
  },
  market: { kind: "market", baseOutput: 5.0, rateGain: 5.0, upgradeBase: 30 },
  scholar: {
    kind: "scholar",
    baseOutput: 0.5,
    rateGain: 0.25,
    upgradeBase: 35,
  },
  // Storage Room: high passthrough (baseOutput/rateGain) so it never bottlenecks a
  // chain. baseCap/capGain are the SHARED total hold capacity across ALL held types
  // (cap = baseCap + capGain*(L-1) = 200*L: L1 200, L2 400, L3 600...). The NUMBER of
  // distinct types it can hold equals its level.
  storage: {
    kind: "storage",
    baseOutput: 10.0,
    rateGain: 5.0,
    upgradeBase: 20,
    baseCap: 200,
    capGain: 200,
  },
};

/** Gatherer UI variants (cosmetic; engine treats all as `gatherer`). */
export const GATHERER_VARIANTS = {
  miner: { label: "Miner", resourceIds: ["iron_ore", "coal_raw", "gemstone"] },
  forester: { label: "Forester", resourceIds: ["timber"] },
  trapper: { label: "Trapper", resourceIds: ["hide"] },
};
