import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost, affordClass } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { INTENT } from "../Engine/Intents.js";

export function NodeInspector(snap, dispatch, selectedNodeId) {
  const node = (snap.nodes || []).find((n) => n.id === selectedNodeId);
  if (!node)
    return h(
      "div",
      { class: "node-inspector empty", id: "NodeInspector" },
      "Select a node",
    );

  const pct = Math.round((node.capacityPct || 0) * 100);
  const rows = [
    h("div", { class: "ni-title" }, node.kind),
    h("div", { class: "ni-line" }, `Level ${node.level}`),
    h(
      "div",
      { class: "ni-line" },
      `Rate ${fmtRate(node.effectiveRate)} / cap ${fmtRate(node.capacity)} (${pct}%)`,
    ),
  ];

  // Stockpile + manual sell
  const sp = node.stockpile || {};
  for (const [resId, qty] of Object.entries(sp)) {
    if (qty <= 0) continue;
    const res = RESOURCES[resId];
    if (!res) continue;
    rows.push(
      h(
        "div",
        { class: "ni-stock" },
        `${res.icon} ${res.display}: ${fmtNum(qty)}`,
        res.basePrice != null
          ? h(
              "button",
              {
                class: "ni-sell",
                onclick: () =>
                  dispatch({
                    type: INTENT.SellFromStockpile,
                    nodeId: node.id,
                    resId,
                  }),
              },
              "Sell",
            )
          : null,
      ),
    );
  }

  // Recipe / raw reassignment
  if (node.kind === "smelter" || node.kind === "workshop") {
    const opts = (snap.buildMenu ? snap.buildMenu.unlockedRecipes : [])
      .filter((r) => RECIPES[r] && RECIPES[r].crafterKind === node.kind)
      .map((r) =>
        h(
          "option",
          { value: r, selected: r === node.recipeId },
          RESOURCES[RECIPES[r].output].display,
        ),
      );
    rows.push(
      h(
        "select",
        {
          class: "ni-recipe",
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
    const res = RESOURCES[node.resourceId];
    if (res)
      rows.push(
        h("div", { class: "ni-line" }, `Mining ${res.icon} ${res.display}`),
      );
  }

  // Upgrade
  rows.push(
    h(
      "button",
      {
        class: "ni-upgrade " + affordClass(node.canAfford),
        disabled: !node.canAfford,
        onclick: () => dispatch({ type: INTENT.UpgradeNode, nodeId: node.id }),
      },
      `Upgrade → ${fmtCost(node.upgradeCost, "gold")}`,
    ),
  );

  return h("div", { class: "node-inspector", id: "NodeInspector" }, ...rows);
}
