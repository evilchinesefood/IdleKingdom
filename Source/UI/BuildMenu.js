import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { cap } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { MACHINES, GATHERER_VARIANTS } from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

function variantLabel(resourceId) {
  for (const v of Object.values(GATHERER_VARIANTS)) {
    if (v.resourceIds.includes(resourceId)) return v.label;
  }
  return "Gatherer";
}

// Build the placement buttons for a given machine kind (same controls as before,
// now hosted inside the per-type popover).
function detailForKind(kind, bm, dispatch, ui) {
  const detail = [];
  if (kind === "gatherer") {
    detail.push(h("div", { class: "bm-detail-title" }, "Machine Recipe:"));
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
    detail.push(h("div", { class: "bm-detail-title" }, "Machine Recipe:"));
    for (const r of bm.unlockedRecipes) {
      const recipe = RECIPES[r];
      if (!recipe || recipe.crafterKind !== kind) continue;
      const out = RESOURCES[recipe.output];
      if (!out) continue;
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
  } else {
    detail.push(h("div", { class: "bm-detail-title" }, "Machine Recipe:"));
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
        cap(kind),
      ),
    );
  }
  return detail;
}

export function BuildMenu(snap, dispatch, ui) {
  const bm = snap.buildMenu || {
    placeableMachines: [],
    unlockedRecipes: [],
    gathererResources: [],
  };

  // Show EVERY machine kind; locked ones (not yet researched) are dimmed + inert.
  // Icon-only (the name is the hover title / aria-label, not visible text).
  const machineCells = Object.keys(MACHINES).map((kind) => {
    const unlocked = bm.placeableMachines.includes(kind);
    const selected = unlocked && ui.selectedPaletteKind === kind;
    const cellChildren = [
      h(
        "wa-button",
        {
          key: "bm-machine-" + kind,
          class:
            "bm-machine" +
            (selected ? " selected" : "") +
            (unlocked ? "" : " locked"),
          size: "s",
          pill: true,
          appearance: selected ? "accent" : "outlined",
          disabled: !unlocked,
          title: cap(kind) + (unlocked ? "" : " — locked"),
          "aria-label": cap(kind) + (unlocked ? "" : " (locked)"),
          onclick: unlocked
            ? () => ui.setPalette(selected ? null : kind)
            : undefined,
        },
        icon(kind),
      ),
    ];
    if (selected) {
      cellChildren.push(
        h(
          "div",
          { key: "bm-popover-" + kind, class: "bm-popover" },
          ...detailForKind(kind, bm, dispatch, ui),
        ),
      );
    }
    return h(
      "div",
      { key: "bm-cell-" + kind, class: "bm-cell" },
      ...cellChildren,
    );
  });

  return h(
    "div",
    { key: "buildbar", class: "build-bar-inner", id: "BuildMenu" },
    h("div", { class: "bm-machines" }, ...machineCells),
  );
}
