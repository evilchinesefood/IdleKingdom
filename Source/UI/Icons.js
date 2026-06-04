// Single source of truth: game concept -> FA Pro Duotone Solid icon + tone.
// Render via FA webfont <i> (NOT <wa-icon>, which needs a runtime CDN kit for Pro).
import { h } from "./Render/Dom.js";

export const ICONS = {
  // currencies
  gold: { name: "coins", primary: "var(--gold)", secondary: "var(--ink)" },
  research: {
    name: "scroll",
    primary: "var(--parchment-dk)",
    secondary: "var(--ink)",
  },
  renown: {
    name: "shield-halved",
    primary: "var(--iron)",
    secondary: "var(--gold)",
  },
  // machine kinds
  gatherer: { name: "pickaxe" },
  smelter: { name: "fire", primary: "var(--bad)" },
  workshop: { name: "hammer" },
  market: { name: "shop", primary: "var(--gold)" },
  scholar: { name: "book-open" },
  // gatherer cosmetic variants
  miner: { name: "pickaxe" },
  forester: { name: "tree" },
  trapper: { name: "paw" },
  // resources (engine resource ids)
  iron_ore: { name: "gem" },
  timber: { name: "tree" },
  hide: { name: "paw" },
  coal_raw: { name: "mountain" },
  gemstone: { name: "gem", primary: "var(--gold)" },
  iron_bar: { name: "bars" },
  plank: { name: "block-brick" },
  leather: { name: "scroll-old" },
  coal: { name: "fire" },
  parchment: { name: "scroll" },
  steel: { name: "cubes" },
  blade: { name: "dagger" },
  plating: { name: "shield" },
  fitting: { name: "gear" },
  sword: { name: "sword" },
  armor: { name: "shirt" },
  shield: { name: "shield" },
  hardened_steel: { name: "gear" },
  fine_sword: { name: "sword", primary: "var(--gold)" },
  fine_armor: { name: "shirt", primary: "var(--gold)" },
  fine_shield: { name: "shield", primary: "var(--gold)" },
  master_sword: { name: "sword", primary: "var(--parchment-dk)" },
  master_armor: { name: "shirt", primary: "var(--parchment-dk)" },
  master_shield: { name: "shield", primary: "var(--parchment-dk)" },
  militia: { name: "helmet-battle" },
  soldier: { name: "helmet-battle", primary: "var(--iron)" },
  knight: { name: "helmet-battle", primary: "var(--gold)" },
  // tabs / actions / statuses
  factory: { name: "gears" },
  expeditions: { name: "shield" },
  heroes: { name: "chess-knight" },
  upgrade: { name: "circle-up" },
  levelup: { name: "arrow-up-right-dots" },
  sell: { name: "coins" },
  remove: { name: "trash" },
  connect: { name: "link" },
  recruit: { name: "user-plus" },
  launch: { name: "flag-checkered" },
  settings: { name: "gear" },
  group: { name: "object-group" },
  menu: { name: "bars" },
  storage: { name: "warehouse" },
  copy: { name: "copy" },
  victory: { name: "crown", primary: "var(--gold)" },
  offline: { name: "moon" },
  save_ok: { name: "floppy-disk" },
  save_fail: { name: "triangle-exclamation", primary: "var(--bad)" },
  ready: { name: "circle-check", primary: "var(--good)" },
  inprogress: { name: "hourglass-half" },
  locked: { name: "lock" },
  max: { name: "gauge-high", primary: "var(--good)" },
  starved: { name: "triangle-exclamation", primary: "var(--bad)" },
  info: { name: "circle-info" },
};

function styleFor(i) {
  const p = [];
  if (i.primary) p.push(`--fa-primary-color:${i.primary}`);
  if (i.secondary) p.push(`--fa-secondary-color:${i.secondary}`);
  if (i.secOpacity != null) p.push(`--fa-secondary-opacity:${i.secOpacity}`);
  return p.join(";");
}

// icon(concept, opts?)
// opts.noTone      → emit no inline tone style (lets CSS control tones)
// opts.primary     → override registry primary color
// opts.secondary   → override registry secondary color
// opts.secOpacity  → override registry secondary opacity
// opts.class       → extra class appended to the element
// Default (single-arg) behavior is unchanged: registry tones applied inline.
export function icon(concept, opts = {}) {
  const i = ICONS[concept] || { name: "circle-question" };
  const cls = `fa-duotone fa-solid fa-${i.name}${i.swap ? " fa-swap-opacity" : ""}${opts.class ? " " + opts.class : ""}`;
  const props = { class: cls, "aria-hidden": "true" };
  if (!opts.noTone) {
    const s = styleFor({
      primary: opts.primary ?? i.primary,
      secondary: opts.secondary ?? i.secondary,
      secOpacity: opts.secOpacity ?? i.secOpacity,
    });
    if (s) props.style = s;
  }
  return h("i", props);
}

export function iconName(concept) {
  return (ICONS[concept] || { name: "circle-question" }).name;
}
