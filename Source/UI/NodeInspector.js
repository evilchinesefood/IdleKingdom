import { h } from "./Render/Dom.js";
import { fmtNum, fmtRate, fmtCost, cap } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { RECIPES } from "../Engine/Content/Recipes.js";
import { INTENT } from "../Engine/Intents.js";

export function NodeInspector(snap, dispatch, selectedNodeId) {
  const node = (snap.nodes || []).find((n) => n.id === selectedNodeId);
  // Nothing selected -> a hidden (display:none via .empty) but STILL-MOUNTED card,
  // keyed the same as the populated one. Returning null here destroyed/recreated the
  // wa-card on every select, and the fresh card re-hydrated with a visible reflow
  // (text grew + jumped ~15px). Reusing the element avoids that; it shows no content.
  if (!node)
    return h("wa-card", {
      key: "inspector",
      class: "node-inspector empty",
      id: "NodeInspector",
    });

  const pct = Math.max(0, Math.min(1, node.capacityPct || 0));

  // Header: kind icon + name + optional MAX/starved badge
  const headerKids = [
    h("span", { class: "ni-kind-ico" }, icon(node.kind)),
    " ",
    cap(node.kind),
  ];
  // MAX only when the node is actually shipping output (matches the canvas gear);
  // a fully-fed producer whose output goes nowhere shows neither MAX nor a gear.
  const atMax = node.atCapacity && node.working;
  if (atMax) {
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
      `Rate ${fmtRate(node.throughput)}  |  Cap ${fmtRate(node.capacity)}`,
    ),
    h("wa-progress-bar", {
      class: "ni-cap" + (node.starved ? " starved" : ""),
      value: Math.round(pct * 100),
    }),
  ];

  // Stock section — ONLY Storage Rooms hold inventory now. Capacity is a SHARED pool
  // across all held types, so show a Total/cap line + each held type's quantity (with
  // a Sell button for sellable resources).
  const sp = node.stockpile || {};
  const stockRows = [];
  if (node.kind === "storage") {
    stockRows.push(
      h(
        "div",
        { class: "ni-stock ni-stock-total", key: "stk-total" },
        `Total: ${fmtNum(node.storedTotal || 0)} / ${fmtNum(node.storageCap || 0)}`,
      ),
    );
    for (const resId of node.resourceIds || []) {
      const res = RESOURCES[resId];
      if (!res) continue;
      const qty = sp[resId] || 0;
      stockRows.push(
        h(
          "div",
          { class: "ni-stock", key: "stk-" + resId },
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
    // Required components for the selected recipe (icon + qty x name), below the select.
    const rec = node.recipeId && RECIPES[node.recipeId];
    if (rec && rec.inputs && Object.keys(rec.inputs).length) {
      const comps = Object.entries(rec.inputs).map(([rid, qty]) =>
        h(
          "span",
          { key: "comp-" + rid, class: "ni-comp" },
          icon(rid),
          ` ${qty}× ${RESOURCES[rid] ? RESOURCES[rid].display : rid}`,
        ),
      );
      rows.push(
        h(
          "div",
          { class: "ni-components", key: "ni-comp-" + node.recipeId },
          h("span", { class: "ni-comp-title" }, "Requires: "),
          ...comps,
        ),
      );
    }
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
  } else if (node.kind === "storage") {
    // Multi-select of UNLOCKED resources; the room holds up to `level` types.
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
          key: "storage-" + node.id,
          class: "ni-storage",
          label: `Holds — up to ${node.level} type${node.level === 1 ? "" : "s"}`,
          appearance: "filled",
          multiple: true,
          "prop:value": node.resourceIds || [],
          onchange: (e) =>
            dispatch({
              type: INTENT.SetStorageRule,
              nodeId: node.id,
              resourceIds: Array.isArray(e.target.value)
                ? e.target.value
                : e.target.value
                  ? [e.target.value]
                  : [],
            }),
        },
        ...opts,
      ),
    );
  }

  // Add to an existing building (only when this machine isn't already grouped).
  if (!node.building && (snap.buildings || []).length) {
    const opts = [
      h("wa-option", { key: "ab-none", value: "" }, "— add to group —"),
    ].concat(
      (snap.buildings || []).map((b) =>
        h("wa-option", { key: "ab-" + b.id, value: b.id }, b.name),
      ),
    );
    rows.push(
      h(
        "wa-select",
        {
          key: "addbuilding-" + node.id,
          class: "ni-addbuilding",
          label: "Add to group",
          appearance: "filled",
          "prop:value": "",
          onchange: (e) => {
            if (e.target.value)
              dispatch({
                type: INTENT.AddToBuilding,
                nodeId: node.id,
                buildingId: e.target.value,
              });
          },
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
      "Upgrade: ",
      icon("gold"),
      " ",
      fmtCost(node.upgradeCost),
    ),
  );

  // Ungroup — shown when this machine belongs to a building: removes THIS machine
  // from the group (the rest of the building stays intact), reachable from any member.
  if (node.building) {
    rows.push(
      h(
        "wa-button",
        {
          key: "ni-ungroup-" + node.id,
          class: "ni-ungroup",
          variant: "neutral",
          appearance: "outlined",
          onclick: () =>
            dispatch({
              type: INTENT.RemoveFromBuilding,
              nodeId: node.id,
            }),
        },
        h("span", { slot: "start" }, icon("group")),
        "Ungroup Machine",
      ),
    );
  }

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
