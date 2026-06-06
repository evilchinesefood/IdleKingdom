/** @typedef {Object} Recipe
 *  @property {string} id
 *  @property {"smelter"|"workshop"|"barracks"} crafterKind
 *  @property {Object<string,number>} inputs  resourceId -> amount per output unit
 *  @property {string} output
 *  @property {number} baseOut    output units/s at crafter L1
 */

/** Keyed map id -> Recipe (12). */
export const RECIPES = {
  r_iron_bar: {
    id: "r_iron_bar",
    crafterKind: "smelter",
    inputs: { iron_ore: 2 },
    output: "iron_bar",
    baseOut: 0.5,
  },
  r_plank: {
    id: "r_plank",
    crafterKind: "smelter",
    inputs: { timber: 2 },
    output: "plank",
    baseOut: 0.5,
  },
  r_leather: {
    id: "r_leather",
    crafterKind: "smelter",
    inputs: { hide: 2 },
    output: "leather",
    baseOut: 0.5,
  },
  r_coal: {
    id: "r_coal",
    crafterKind: "smelter",
    inputs: { coal_raw: 1 },
    output: "coal",
    baseOut: 1.0,
  },
  r_steel: {
    id: "r_steel",
    crafterKind: "smelter",
    inputs: { iron_bar: 2, coal: 1 },
    output: "steel",
    baseOut: 0.25,
  },
  r_blade: {
    id: "r_blade",
    crafterKind: "workshop",
    inputs: { steel: 2, plank: 1 },
    output: "blade",
    baseOut: 0.2,
  },
  r_plating: {
    id: "r_plating",
    crafterKind: "workshop",
    inputs: { steel: 2, leather: 1 },
    output: "plating",
    baseOut: 0.2,
  },
  r_fitting: {
    id: "r_fitting",
    crafterKind: "workshop",
    inputs: { iron_bar: 1, leather: 1 },
    output: "fitting",
    baseOut: 0.25,
  },
  r_sword: {
    id: "r_sword",
    crafterKind: "workshop",
    inputs: { blade: 1, fitting: 1 },
    output: "sword",
    baseOut: 0.1,
  },
  r_armor: {
    id: "r_armor",
    crafterKind: "workshop",
    inputs: { plating: 2, fitting: 1 },
    output: "armor",
    baseOut: 0.1,
  },
  r_shield: {
    id: "r_shield",
    crafterKind: "workshop",
    inputs: { plating: 1, plank: 2 },
    output: "shield",
    baseOut: 0.1,
  },
  r_parchment: {
    id: "r_parchment",
    crafterKind: "workshop",
    inputs: { timber: 1 },
    output: "parchment",
    baseOut: 0.5,
  },
  r_hardened_steel: {
    id: "r_hardened_steel",
    crafterKind: "smelter",
    inputs: { steel: 1, coal_raw: 2 },
    output: "hardened_steel",
    baseOut: 0.15,
  },
  r_fine_sword: {
    id: "r_fine_sword",
    crafterKind: "workshop",
    inputs: { sword: 1, hardened_steel: 1 },
    output: "fine_sword",
    baseOut: 0.08,
  },
  r_fine_armor: {
    id: "r_fine_armor",
    crafterKind: "workshop",
    inputs: { armor: 1, hardened_steel: 1 },
    output: "fine_armor",
    baseOut: 0.08,
  },
  r_fine_shield: {
    id: "r_fine_shield",
    crafterKind: "workshop",
    inputs: { shield: 1, hardened_steel: 1 },
    output: "fine_shield",
    baseOut: 0.08,
  },
  r_master_sword: {
    id: "r_master_sword",
    crafterKind: "workshop",
    inputs: { fine_sword: 1, gemstone: 2 },
    output: "master_sword",
    baseOut: 0.05,
  },
  r_master_armor: {
    id: "r_master_armor",
    crafterKind: "workshop",
    inputs: { fine_armor: 1, gemstone: 2 },
    output: "master_armor",
    baseOut: 0.05,
  },
  r_master_shield: {
    id: "r_master_shield",
    crafterKind: "workshop",
    inputs: { fine_shield: 1, gemstone: 2 },
    output: "master_shield",
    baseOut: 0.05,
  },
  r_militia: {
    id: "r_militia",
    crafterKind: "barracks",
    inputs: { sword: 1, armor: 1, shield: 1 },
    output: "militia",
    baseOut: 0.05,
  },
  r_soldier: {
    id: "r_soldier",
    crafterKind: "barracks",
    inputs: { fine_sword: 1, fine_armor: 1, fine_shield: 1 },
    output: "soldier",
    baseOut: 0.04,
  },
  r_knight: {
    id: "r_knight",
    crafterKind: "barracks",
    inputs: { master_sword: 1, master_armor: 1, master_shield: 1 },
    output: "knight",
    baseOut: 0.03,
  },
};
