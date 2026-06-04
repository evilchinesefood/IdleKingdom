import { describe, it, expect } from "./Runner.js";
import { ICONS, icon, iconName } from "../Source/UI/Icons.js";
import { RESOURCES } from "../Source/Engine/Content/Resources.js";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("Icons.map", () => {
  it("resolves every machine kind + currency to a non-empty FA name", () => {
    for (const c of [
      "gold",
      "research",
      "gatherer",
      "smelter",
      "workshop",
      "market",
      "scholar",
      "barracks",
    ]) {
      expect(typeof ICONS[c].name).toBe("string");
      expect(ICONS[c].name.length > 0).toBe(true);
    }
  });
  it("maps every engine resource id to a real (non-fallback) icon", () => {
    for (const id of Object.keys(RESOURCES)) {
      const m = ICONS[id];
      expect(!!(m && m.name && m.name !== "circle-question")).toBe(true);
    }
  });
});

describe("Icons.icon()", () => {
  it("emits an <i> vnode with a fa-duotone class and no emoji", () => {
    const v = icon("gold");
    expect(v.tag).toBe("i");
    expect(v.props.class.includes("fa-duotone")).toBe(true);
    expect(
      v.props.class.includes("fa-gold") || v.props.class.includes("fa-coins"),
    ).toBe(true);
    expect(EMOJI.test(JSON.stringify(v))).toBe(false);
    expect(v.props.style.includes("--fa-primary-color:var(--gold)")).toBe(true);
    expect(v.props.style.includes("--fa-secondary-color:var(--ink)")).toBe(
      true,
    );
  });
  it("falls back to circle-question for unknown concepts (no throw)", () => {
    expect(icon("nonexistent").props.class.includes("fa-circle-question")).toBe(
      true,
    );
  });
  it("iconName returns the raw FA name", () => {
    expect(iconName("market")).toBe(ICONS.market.name);
  });
  it("noTone omits the inline tone style (CSS controls tones)", () => {
    const v = icon("gold", { noTone: true });
    expect(v.props.style === undefined).toBe(true);
    expect(v.props.class.includes("fa-coins")).toBe(true);
  });
  it("primary/secondary overrides win over the registry tone", () => {
    const v = icon("gold", { primary: "var(--parchment)" });
    expect(v.props.style.includes("--fa-primary-color:var(--parchment)")).toBe(
      true,
    );
  });
  it("opts.class appends an extra class", () => {
    expect(icon("gold", { class: "x" }).props.class.includes(" x")).toBe(true);
  });
});
