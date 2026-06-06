import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { cap, fmtCost } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js"; // intentional shared display table (resource names/icons)
import { RECIPES } from "../Engine/Content/Recipes.js";
import { isCrafter } from "../Engine/Content/Machines.js";

// Bulk inspector for a multi-selection of same-kind machines: change the
// recipe / gathered resource / held types for ALL of them at once, and upgrade
// them all by +1 (all-or-nothing on the combined gold cost). handlers:
// { onSetRecipe(recipeId), onSetResource(resourceId), onSetStorage(ids[]), onUpgradeAll() }
export function BulkInspector(snap, sel, handlers) {
  const nodes = sel.nodeIds
    .map((id) => (snap.nodes || []).find((n) => n.id === id))
    .filter(Boolean);
  const kind = sel.kind;
  const count = nodes.length;

  // Common selected value, or "" when the machines differ (so the dropdown
  // starts blank and any pick applies to the whole selection).
  const allSame = (get) => nodes.every((x) => get(x) === get(nodes[0]));
  const commonRecipe = allSame((x) => x.recipeId)
    ? nodes[0].recipeId || ""
    : "";
  const commonResource = allSame((x) => x.resourceId)
    ? nodes[0].resourceId || ""
    : "";

  const rows = [
    h(
      "div",
      { class: "bulk-title" },
      h("span", { class: "ni-kind-ico" }, icon(kind)),
      ` ${count} ${cap(kind)}${count === 1 ? "" : "s"}`,
    ),
    h(
      "div",
      { class: "bulk-line" },
      "Change the recipe and upgrade every selected machine.",
    ),
  ];

  if (isCrafter(kind)) {
    const opts = (snap.buildMenu ? snap.buildMenu.unlockedRecipes : [])
      .filter((r) => RECIPES[r] && RECIPES[r].crafterKind === kind)
      .map((r) =>
        h(
          "wa-option",
          { key: "opt-" + r, value: r },
          h("span", { slot: "start" }, icon(RECIPES[r].output)),
          RESOURCES[RECIPES[r].output].display,
        ),
      );
    rows.push(
      h(
        "wa-select",
        {
          key: "bulk-recipe",
          class: "bulk-recipe",
          label: "Recipe — all selected",
          appearance: "filled",
          "prop:value": commonRecipe,
          onchange: (e) =>
            e.target.value && handlers.onSetRecipe(e.target.value),
        },
        ...opts,
      ),
    );
  } else if (kind === "gatherer") {
    const raws = (snap.buildMenu ? snap.buildMenu.gathererResources : []) || [];
    const opts = raws
      .filter((rid) => RESOURCES[rid])
      .map((rid) =>
        h(
          "wa-option",
          { key: "opt-" + rid, value: rid },
          h("span", { slot: "start" }, icon(rid)),
          RESOURCES[rid].display,
        ),
      );
    rows.push(
      h(
        "wa-select",
        {
          key: "bulk-gatherer",
          class: "bulk-gatherer",
          label: "Gather — all selected",
          appearance: "filled",
          "prop:value": commonResource,
          onchange: (e) =>
            e.target.value && handlers.onSetResource(e.target.value),
        },
        ...opts,
      ),
    );
  } else if (kind === "storage") {
    const unlocked = (snap.buildMenu && snap.buildMenu.unlockedResources) || [];
    const opts = unlocked
      .filter((rid) => RESOURCES[rid])
      .map((rid) =>
        h(
          "wa-option",
          { key: "opt-" + rid, value: rid },
          h("span", { slot: "start" }, icon(rid)),
          RESOURCES[rid].display,
        ),
      );
    rows.push(
      h(
        "wa-select",
        {
          key: "bulk-storage",
          class: "bulk-storage",
          label: "Holds — all selected",
          appearance: "filled",
          multiple: true,
          // each room clamps the list to its own level in the reducer
          "prop:value": nodes[0].resourceIds || [],
          onchange: (e) =>
            handlers.onSetStorage(
              Array.isArray(e.target.value)
                ? e.target.value
                : e.target.value
                  ? [e.target.value]
                  : [],
            ),
        },
        ...opts,
      ),
    );
  }

  // Upgrade all (+1): combined cost; all-or-nothing is enforced in the reducer
  // (a reject flashes "not enough gold").
  const total = nodes.reduce((a, x) => a + (x.upgradeCost || 0), 0);
  rows.push(
    h(
      "wa-button",
      {
        key: "bulk-upgrade",
        class: "bulk-upgrade ni-upgrade",
        variant: "brand",
        appearance: "accent",
        onclick: () => handlers.onUpgradeAll(),
      },
      h("span", { slot: "start" }, icon("upgrade")),
      "Upgrade all (+1): ",
      icon("gold"),
      " ",
      fmtCost(total),
    ),
  );

  return h(
    "wa-card",
    { key: "bulkinspector", class: "bulk-inspector", id: "BulkInspector" },
    ...rows,
  );
}
