import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { cap } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import {
  MACHINES,
  GATHERER_VARIANTS,
  isCrafter,
} from "../Engine/Content/Machines.js";
import { INTENT } from "../Engine/Intents.js";

// Memoize placement button lists per (kind, unlocked-set signature).
const _detailMemo = new Map();
function _cachedDetail(key, build) {
  if (_detailMemo.has(key)) return _detailMemo.get(key);
  const v = build();
  _detailMemo.set(key, v);
  return v;
}

// A single placement button. Locked recipes are dimmed + inert (same treatment
// as locked machine tiles): grayed via .locked, disabled, no click handler.
function placeBtn({ key, iconId, label, locked, onclick }) {
  return h(
    "wa-button",
    {
      key,
      class: "bm-place" + (locked ? " locked" : ""),
      appearance: "filled",
      disabled: !!locked,
      title: locked ? label + " — locked" : undefined,
      "aria-label": locked ? label + " (locked)" : undefined,
      onclick: locked ? undefined : onclick,
    },
    h("span", { slot: "start" }, icon(iconId)),
    label,
  );
}

// Build the placement buttons for a given machine kind, hosted inside the
// per-type popover. ALL recipes for the kind are listed; the ones the player
// hasn't unlocked yet are grayed out (locked) rather than hidden.
// `dispatch` and `ui` are stable app-level refs — safe to capture in cached closures.
function detailForKind(kind, bm, dispatch, ui) {
  // Key on (kind, unlocked set) so options refresh after a research unlock.
  const unlockedSig =
    kind === "gatherer"
      ? (bm.gathererResources || []).join(",")
      : (bm.unlockedRecipes || []).join(",");
  const memoKey = kind + "|" + unlockedSig;
  return _cachedDetail(memoKey, () => {
    const detail = [h("div", { class: "bm-detail-title" }, "Machine Recipe:")];
    if (kind === "gatherer") {
      const unlocked = new Set(bm.gathererResources || []);
      for (const v of Object.values(GATHERER_VARIANTS)) {
        for (const rid of v.resourceIds) {
          const res = RESOURCES[rid];
          if (!res) continue;
          detail.push(
            placeBtn({
              key: "bm-place-gatherer-" + rid,
              iconId: rid,
              label: `${v.label}: ${res.display}`,
              locked: !unlocked.has(rid),
              onclick: () =>
                dispatch({
                  type: INTENT.PlaceNode,
                  kind: "gatherer",
                  resourceId: rid,
                  pos: ui.spawnPos(),
                }),
            }),
          );
        }
      }
    } else if (isCrafter(kind)) {
      const unlocked = new Set(bm.unlockedRecipes || []);
      for (const r in RECIPES) {
        const recipe = RECIPES[r];
        if (recipe.crafterKind !== kind) continue;
        const out = RESOURCES[recipe.output];
        if (!out) continue;
        detail.push(
          placeBtn({
            key: "bm-place-recipe-" + r,
            iconId: recipe.output,
            label: out.display,
            locked: !unlocked.has(r),
            onclick: () =>
              dispatch({
                type: INTENT.PlaceNode,
                kind,
                recipeId: r,
                pos: ui.spawnPos(),
              }),
          }),
        );
      }
    } else {
      detail.push(
        placeBtn({
          key: "bm-place-" + kind,
          iconId: kind,
          label: cap(kind),
          locked: false,
          onclick: () =>
            dispatch({ type: INTENT.PlaceNode, kind, pos: ui.spawnPos() }),
        }),
      );
    }
    return detail;
  });
}

// Returns true if a pointerdown event should close the open popover.
// A click is "inside" if any node in the composed path carries .bm-cell
// (covers the owning cell, its button, and the popover itself).
// Pass e.composedPath() as the second argument; pass [] when testing with
// the headless shim (no open popover → always false anyway).
export function shouldCloseBmPopover(openKind, composedPath) {
  if (!openKind) return false;
  for (const node of composedPath) {
    if (node && node.classList && node.classList.contains("bm-cell"))
      return false;
  }
  return true;
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
