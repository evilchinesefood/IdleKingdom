/** @typedef {Object} Recipe
 *  @property {string} id
 *  @property {"smelter"|"workshop"} crafterKind
 *  @property {Object<string,number>} inputs  resourceId -> amount per output unit
 *  @property {string} output
 *  @property {number} baseOut    output units/s at crafter L1
 */

/** Keyed map id -> Recipe (12). */
export const RECIPES = {
  r_iron_bar: { id: "r_iron_bar", crafterKind: "smelter", inputs: { iron_ore: 2 }, output: "iron_bar", baseOut: 0.5 },
  r_plank: { id: "r_plank", crafterKind: "smelter", inputs: { timber: 2 }, output: "plank", baseOut: 0.5 },
  r_leather: { id: "r_leather", crafterKind: "smelter", inputs: { hide: 2 }, output: "leather", baseOut: 0.5 },
  r_coal: { id: "r_coal", crafterKind: "smelter", inputs: { coal_raw: 1 }, output: "coal", baseOut: 1.0 },
  r_steel: { id: "r_steel", crafterKind: "smelter", inputs: { iron_bar: 2, coal: 1 }, output: "steel", baseOut: 0.25 },
  r_blade: { id: "r_blade", crafterKind: "workshop", inputs: { steel: 2, plank: 1 }, output: "blade", baseOut: 0.2 },
  r_plating: { id: "r_plating", crafterKind: "workshop", inputs: { steel: 2, leather: 1 }, output: "plating", baseOut: 0.2 },
  r_fitting: { id: "r_fitting", crafterKind: "workshop", inputs: { iron_bar: 1, leather: 1 }, output: "fitting", baseOut: 0.25 },
  r_sword: { id: "r_sword", crafterKind: "workshop", inputs: { blade: 1, fitting: 1 }, output: "sword", baseOut: 0.1 },
  r_armor: { id: "r_armor", crafterKind: "workshop", inputs: { plating: 2, fitting: 1 }, output: "armor", baseOut: 0.1 },
  r_shield: { id: "r_shield", crafterKind: "workshop", inputs: { plating: 1, plank: 2 }, output: "shield", baseOut: 0.1 },
  r_parchment: { id: "r_parchment", crafterKind: "workshop", inputs: { timber: 1 }, output: "parchment", baseOut: 0.5 },
};
