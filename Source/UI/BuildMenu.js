import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { cap } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { GATHERER_VARIANTS } from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

// UI label for the gatherer variant that mines a given raw resource.
function variantLabel(resourceId) {
  for (const v of Object.values(GATHERER_VARIANTS)) {
    if (v.resourceIds.includes(resourceId)) return v.label;
  }
  return "Gatherer";
}

export function BuildMenu(snap, dispatch, ui) {
  // ui = { selectedPaletteKind, setPalette(kind), spawnPos() } owned by App.
  const bm = snap.buildMenu || {
    placeableMachines: [],
    unlockedRecipes: [],
    gathererResources: [],
  };

  const machineButtons = bm.placeableMachines.map((kind) =>
    h(
      "button",
      {
        class:
          "bm-machine" + (ui.selectedPaletteKind === kind ? " selected" : ""),
        onclick: () => ui.setPalette(kind),
      },
      cap(kind),
    ),
  );

  const detail = [];
  const kind = ui.selectedPaletteKind;
  if (kind === "gatherer") {
    detail.push(h("div", { class: "bm-detail-title" }, "Assign raw:"));
    for (const rid of bm.gathererResources || []) {
      const res = RESOURCES[rid];
      if (!res) continue;
      detail.push(
        h(
          "button",
          {
            class: "bm-place",
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind: "gatherer",
                resourceId: rid,
                pos: ui.spawnPos(),
              }),
          },
          [icon(rid), ` ${variantLabel(rid)}: ${res.display}`],
        ),
      );
    }
  } else if (kind === "smelter" || kind === "workshop") {
    detail.push(h("div", { class: "bm-detail-title" }, "Pick recipe:"));
    for (const r of bm.unlockedRecipes) {
      const recipe = RECIPES[r];
      if (!recipe || recipe.crafterKind !== kind) continue;
      const out = RESOURCES[recipe.output];
      detail.push(
        h(
          "button",
          {
            class: "bm-place",
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind,
                recipeId: r,
                pos: ui.spawnPos(),
              }),
          },
          [icon(recipe.output), ` ${out.display}`],
        ),
      );
    }
  } else if (kind) {
    detail.push(
      h(
        "button",
        {
          class: "bm-place",
          onclick: () =>
            dispatch({ type: INTENT.PlaceNode, kind, pos: ui.spawnPos() }),
        },
        `Place ${cap(kind)}`,
      ),
    );
  }

  return h(
    "div",
    { class: "build-menu", id: "BuildMenu" },
    h("div", { class: "bm-title" }, "Build"),
    h("div", { class: "bm-machines" }, ...machineButtons),
    h("div", { class: "bm-detail" }, ...detail),
  );
}
