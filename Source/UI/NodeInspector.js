import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost, affordClass, cap } from "./Format/Format.js";
import { icon } from "./Icons.js";
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
    h("div", { class: "ni-title" }, [icon(node.kind), " ", cap(node.kind)]),
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
        [icon(resId), ` ${res.display}: ${fmtNum(qty)}`],
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
              [icon("sell"), " Sell"],
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
    const raws = (snap.buildMenu ? snap.buildMenu.gathererResources : []) || [];
    const opts = raws
      .filter((rid) => RESOURCES[rid])
      .map((rid) =>
        h("option", { value: rid, selected: rid === node.resourceId }, [
          icon(rid),
          ` ${RESOURCES[rid].display}`,
        ]),
      );
    rows.push(
      h(
        "select",
        {
          class: "ni-gatherer",
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
      "button",
      {
        class: "ni-upgrade " + affordClass(node.canAfford),
        disabled: !node.canAfford,
        onclick: () => dispatch({ type: INTENT.UpgradeNode, nodeId: node.id }),
      },
      [icon("gold"), ` Upgrade → ${fmtCost(node.upgradeCost)}`],
    ),
  );

  // Remove
  rows.push(
    h(
      "button",
      {
        class: "ni-remove",
        onclick: () => dispatch({ type: INTENT.RemoveNode, nodeId: node.id }),
      },
      "Remove",
    ),
  );

  return h("div", { class: "node-inspector", id: "NodeInspector" }, ...rows);
}
