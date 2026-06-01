import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { cap } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { GATHERER_VARIANTS } from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

function variantLabel(resourceId) {
  for (const v of Object.values(GATHERER_VARIANTS)) {
    if (v.resourceIds.includes(resourceId)) return v.label;
  }
  return "Gatherer";
}

export function BuildMenu(snap, dispatch, ui) {
  const bm = snap.buildMenu || {
    placeableMachines: [],
    unlockedRecipes: [],
    gathererResources: [],
  };

  const machineButtons = bm.placeableMachines.map((kind) =>
    h(
      "wa-button",
      {
        key: "bm-machine-" + kind,
        class:
          "bm-machine" + (ui.selectedPaletteKind === kind ? " selected" : ""),
        size: "small",
        pill: true,
        appearance: ui.selectedPaletteKind === kind ? "accent" : "outlined",
        onclick: () => ui.setPalette(kind),
      },
      h("span", { slot: "start" }, icon(kind)),
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
          "wa-button",
          {
            key: "bm-place-gatherer-" + rid,
            class: "bm-place",
            appearance: "filled",
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind: "gatherer",
                resourceId: rid,
                pos: ui.spawnPos(),
              }),
          },
          h("span", { slot: "start" }, icon(rid)),
          `${variantLabel(rid)}: ${res.display}`,
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
          "wa-button",
          {
            key: "bm-place-recipe-" + r,
            class: "bm-place",
            appearance: "filled",
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind,
                recipeId: r,
                pos: ui.spawnPos(),
              }),
          },
          h("span", { slot: "start" }, icon(recipe.output)),
          out.display,
        ),
      );
    }
  } else if (kind) {
    detail.push(
      h(
        "wa-button",
        {
          key: "bm-place-" + kind,
          class: "bm-place",
          appearance: "filled",
          onclick: () =>
            dispatch({ type: INTENT.PlaceNode, kind, pos: ui.spawnPos() }),
        },
        h("span", { slot: "start" }, icon(kind)),
        `Place ${cap(kind)}`,
      ),
    );
  }

  return h(
    "wa-card",
    { key: "buildmenu", class: "build-menu", id: "BuildMenu" },
    h("div", { class: "bm-title" }, h("span", {}, icon("factory")), " Build"),
    h("div", { class: "bm-machines" }, ...machineButtons),
    h("div", { class: "bm-detail" }, ...detail),
  );
}
