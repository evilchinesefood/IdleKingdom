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

export function icon(concept, extraClass = "") {
  const i = ICONS[concept] || { name: "circle-question" };
  const cls = `fa-duotone fa-solid fa-${i.name}${i.swap ? " fa-swap-opacity" : ""}${extraClass ? " " + extraClass : ""}`;
  const props = { class: cls, "aria-hidden": "true" };
  const s = styleFor(i);
  if (s) props.style = s;
  return h("i", props);
}

export function iconName(concept) {
  return (ICONS[concept] || { name: "circle-question" }).name;
}
