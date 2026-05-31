/** @typedef {Object} Resource
 *  @property {string}  id
 *  @property {string}  display
 *  @property {0|1|2|3} tier
 *  @property {string}  icon
 *  @property {number|null} basePrice  Gold per unit at Market; null = never listed
 */

/** Keyed map id -> Resource. 5 raw + 5 intermediate + 4 component + 3 equipment. */
export const RESOURCES = {
  // Tier 0 — Raw (5)
  iron_ore: { id: "iron_ore", display: "Iron Ore", tier: 0, icon: "⛏️", basePrice: 0.5 },
  timber: { id: "timber", display: "Timber", tier: 0, icon: "🪵", basePrice: 0.4 },
  hide: { id: "hide", display: "Raw Hide", tier: 0, icon: "🐗", basePrice: 0.6 },
  coal_raw: { id: "coal_raw", display: "Coal Seam", tier: 0, icon: "🪨", basePrice: 0.5 },
  gemstone: { id: "gemstone", display: "Gemstone", tier: 0, icon: "💎", basePrice: 3.0 },
  // Tier 1 — Intermediate (5)
  iron_bar: { id: "iron_bar", display: "Iron Bar", tier: 1, icon: "🟫", basePrice: 4.0 },
  plank: { id: "plank", display: "Plank", tier: 1, icon: "🟧", basePrice: 3.5 },
  leather: { id: "leather", display: "Leather", tier: 1, icon: "🟤", basePrice: 4.0 },
  coal: { id: "coal", display: "Refined Coal", tier: 1, icon: "⚫", basePrice: 1.5 },
  parchment: { id: "parchment", display: "Parchment", tier: 1, icon: "🧾", basePrice: null },
  // Tier 2 — Component (4)
  steel: { id: "steel", display: "Steel", tier: 2, icon: "⬜", basePrice: 14.0 },
  blade: { id: "blade", display: "Blade", tier: 2, icon: "🔪", basePrice: 45.0 },
  plating: { id: "plating", display: "Plating", tier: 2, icon: "🔲", basePrice: 45.0 },
  fitting: { id: "fitting", display: "Fitting", tier: 2, icon: "🔩", basePrice: 16.0 },
  // Tier 3 — Equipment good (3)
  sword: { id: "sword", display: "Sword", tier: 3, icon: "⚔️", basePrice: 140.0 },
  armor: { id: "armor", display: "Plate Armor", tier: 3, icon: "🥋", basePrice: 150.0 },
  shield: { id: "shield", display: "Shield", tier: 3, icon: "🛡️", basePrice: 110.0 },
};
