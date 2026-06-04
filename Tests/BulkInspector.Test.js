import { describe, it, expect } from "./Runner.js";
import { BulkInspector } from "../Source/UI/BulkInspector.js";

// Inspect the h() vnode tree directly (no DOM): gather text, find by class.
function vtext(v) {
  if (v == null || typeof v === "boolean") return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(vtext).join("");
  return (v.children || []).map(vtext).join("");
}
function findByClass(v, cls) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const c = v.props && v.props.class;
  if (c && String(c).split(/\s+/).includes(cls)) return v;
  for (const ch of v.children || []) {
    const r = findByClass(ch, cls);
    if (r) return r;
  }
  return null;
}

const smelterSnap = {
  nodes: [
    {
      id: "a",
      kind: "smelter",
      level: 1,
      recipeId: "r_iron_bar",
      upgradeCost: 28.75,
    },
    {
      id: "b",
      kind: "smelter",
      level: 2,
      recipeId: "r_iron_bar",
      upgradeCost: 33.06,
    },
  ],
  buildMenu: {
    unlockedRecipes: ["r_iron_bar", "r_plank"],
    gathererResources: ["iron_ore"],
    unlockedResources: ["iron_ore"],
  },
};

describe("BulkInspector — same-type bulk panel", () => {
  it("titles with the selection count + kind", () => {
    const v = BulkInspector(
      smelterSnap,
      { kind: "smelter", nodeIds: ["a", "b"] },
      {},
    );
    expect(vtext(findByClass(v, "bulk-title")).includes("2 Smelters")).toBe(
      true,
    );
  });

  it("renders an Upgrade-all (+1) button whose click fires onUpgradeAll", () => {
    const fired = [];
    const v = BulkInspector(
      smelterSnap,
      { kind: "smelter", nodeIds: ["a", "b"] },
      { onUpgradeAll: () => fired.push("up") },
    );
    const btn = findByClass(v, "bulk-upgrade");
    expect(btn != null).toBe(true);
    expect(vtext(btn).includes("Upgrade all (+1):")).toBe(true);
    btn.props.onclick();
    expect(fired).toEqual(["up"]);
  });

  it("offers a recipe select for crafters; a pick applies to all via onSetRecipe", () => {
    const set = [];
    const v = BulkInspector(
      smelterSnap,
      { kind: "smelter", nodeIds: ["a", "b"] },
      { onSetRecipe: (r) => set.push(r) },
    );
    const sel = findByClass(v, "bulk-recipe");
    expect(sel != null).toBe(true);
    sel.props.onchange({ target: { value: "r_plank" } });
    expect(set).toEqual(["r_plank"]);
  });

  it("shows a gather select (not a recipe select) for gatherers", () => {
    const gsnap = {
      nodes: [
        {
          id: "g1",
          kind: "gatherer",
          level: 1,
          resourceId: "iron_ore",
          upgradeCost: 17.25,
        },
        {
          id: "g2",
          kind: "gatherer",
          level: 1,
          resourceId: "iron_ore",
          upgradeCost: 17.25,
        },
      ],
      buildMenu: {
        unlockedRecipes: [],
        gathererResources: ["iron_ore"],
        unlockedResources: [],
      },
    };
    const v = BulkInspector(
      gsnap,
      { kind: "gatherer", nodeIds: ["g1", "g2"] },
      {},
    );
    expect(findByClass(v, "bulk-gatherer") != null).toBe(true);
    expect(findByClass(v, "bulk-recipe")).toBe(null);
  });
});
