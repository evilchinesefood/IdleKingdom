import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost, cap } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { INTENT } from "../Engine/Intents.js";

export function NodeInspector(snap, dispatch, selectedNodeId) {
  const node = (snap.nodes || []).find((n) => n.id === selectedNodeId);
  if (!node)
    return h(
      "wa-card",
      { key: "inspector", class: "node-inspector empty", id: "NodeInspector" },
      h("span", { class: "ni-empty-ico" }, icon("settings")),
      " Select a node",
    );

  const pct = Math.max(0, Math.min(1, node.capacityPct || 0));

  // Header: kind icon + name + optional MAX/starved badge
  const headerKids = [
    h("span", { class: "ni-kind-ico" }, icon(node.kind)),
    " ",
    cap(node.kind),
  ];
  if (node.atCapacity) {
    headerKids.push(
      h(
        "wa-badge",
        { key: "ni-badge", class: "ni-badge max", variant: "success" },
        h("span", { slot: "start" }, icon("max")),
        "MAX",
      ),
    );
  } else if (node.starved) {
    headerKids.push(
      h(
        "wa-badge",
        { key: "ni-badge", class: "ni-badge starved", variant: "warning" },
        h("span", { slot: "start" }, icon("starved")),
        "LOW",
      ),
    );
  }

  const rows = [
    h("div", { class: "ni-title" }, ...headerKids),
    h("wa-tag", { class: "ni-level", size: "s" }, `Level ${node.level}`),
    h(
      "div",
      { class: "ni-line" },
      `Rate ${fmtRate(node.throughput)} / cap ${fmtRate(node.capacity)}`,
    ),
    h("wa-progress-bar", {
      class: "ni-cap" + (node.starved ? " starved" : ""),
      value: Math.round(pct * 100),
    }),
  ];

  // Stockpile + manual sell — grouped into a bordered "Stock" section
  const sp = node.stockpile || {};
  const stockRows = [];
  for (const [resId, qty] of Object.entries(sp)) {
    if (qty <= 0) continue;
    const res = RESOURCES[resId];
    if (!res) continue;
    stockRows.push(
      h(
        "div",
        { class: "ni-stock" },
        [icon(resId), ` ${res.display}: ${fmtNum(qty)}`],
        res.basePrice != null
          ? h(
              "wa-button",
              {
                key: "ni-sell-" + resId,
                class: "ni-sell",
                size: "s",
                appearance: "outlined",
                onclick: () =>
                  dispatch({
                    type: INTENT.SellFromStockpile,
                    nodeId: node.id,
                    resId,
                  }),
              },
              h("span", { slot: "start" }, icon("sell")),
              "Sell",
            )
          : null,
      ),
    );
  }

  if (stockRows.length) {
    rows.push(
      h(
        "div",
        { class: "ni-stock-section" },
        h("div", { class: "ni-stock-title" }, "Stock"),
        ...stockRows,
      ),
    );
  }

  // Recipe / raw reassignment
  if (node.kind === "smelter" || node.kind === "workshop") {
    const opts = (snap.buildMenu ? snap.buildMenu.unlockedRecipes : [])
      .filter((r) => RECIPES[r] && RECIPES[r].crafterKind === node.kind)
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
          key: "recipe-" + node.id,
          class: "ni-recipe",
          label: "Recipe",
          appearance: "filled",
          "prop:value": node.recipeId || "",
          onchange: (e) =>
            dispatch({
              type: INTENT.SetRecipe,
              nodeId: node.id,
              recipeId: e.target.value,
            }),
        },
        ...opts,
      ),
    );
  } else if (node.kind === "gatherer") {
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
          key: "gatherer-" + node.id,
          class: "ni-gatherer",
          label: "Gather",
          appearance: "filled",
          "prop:value": node.resourceId || "",
          onchange: (e) =>
            dispatch({
              type: INTENT.SetGathererResource,
              nodeId: node.id,
              resourceId: e.target.value,
            }),
        },
        ...opts,
      ),
    );
  }

  // Upgrade
  rows.push(
    h(
      "wa-button",
      {
        key: "ni-upgrade-" + node.id,
        class: "ni-upgrade",
        variant: "brand",
        appearance: "accent",
        disabled: !node.canAfford,
        onclick: () => dispatch({ type: INTENT.UpgradeNode, nodeId: node.id }),
      },
      h("span", { slot: "start" }, icon("upgrade")),
      "Upgrade ",
      icon("gold"),
      " ",
      fmtCost(node.upgradeCost),
    ),
  );

  // Remove
  rows.push(
    h(
      "wa-button",
      {
        key: "ni-remove-" + node.id,
        class: "ni-remove",
        variant: "danger",
        appearance: "outlined",
        onclick: () => dispatch({ type: INTENT.RemoveNode, nodeId: node.id }),
      },
      h("span", { slot: "start" }, icon("remove")),
      "Remove",
    ),
  );

  return h(
    "wa-card",
    { key: "inspector", class: "node-inspector", id: "NodeInspector" },
    ...rows,
  );
}
