/** @typedef {Object} EquipmentItem
 *  @property {string} itemId       resource id reused as equipment (sword|armor|shield)
 *  @property {"weapon"|"armor"|"accessory"} slot
 *  @property {"attack"|"defense"} statType
 *  @property {number} baseStat     T1 stat; stat at tier T = baseStat * T
 */

/** Keyed map itemId -> EquipmentItem (3). */
export const EQUIPMENT = {
  sword: { itemId: "sword", slot: "weapon", statType: "attack", baseStat: 10 },
  armor: { itemId: "armor", slot: "armor", statType: "defense", baseStat: 12 },
  shield: { itemId: "shield", slot: "accessory", statType: "defense", baseStat: 8 },
};

/** itemStat(itemId, tier) === EQUIPMENT[itemId].baseStat * tier. */
export function itemStat(itemId, tier) {
  return EQUIPMENT[itemId].baseStat * tier;
}
