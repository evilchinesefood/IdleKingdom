import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtCost } from "./Format/Format.js";

// handlers: { onCopy(withUpgrades), onRename(name), onRenameInput(name), onUngroup() }.
// `copying` = copy placement active (the player is about to tap the canvas to place).
export function BuildingInspector(snap, buildingId, handlers, copying) {
  const b = (snap.buildings || []).find((x) => x.id === buildingId);
  if (!b)
    return h(
      "wa-card",
      {
        key: "binspector",
        class: "building-inspector",
        id: "BuildingInspector",
      },
      " No building selected",
    );

  const copyButtons = copying
    ? [
        h(
          "wa-button",
          {
            key: "bi-copy-cancel",
            class: "bi-copy",
            variant: "neutral",
            appearance: "outlined",
            onclick: () => handlers.onCopy(),
          },
          "Cancel — tap the canvas to place",
        ),
      ]
    : [
        h(
          "wa-button",
          {
            key: "bi-copy",
            class: "bi-copy",
            variant: "brand",
            appearance: "accent",
            disabled: !b.canAffordCopy,
            onclick: () => handlers.onCopy(true),
          },
          h("span", { slot: "start" }, icon("copy")),
          "Copy + upgrades ",
          icon("gold"),
          " ",
          fmtCost(b.copyCost),
        ),
        h(
          "wa-button",
          {
            key: "bi-copy-structure",
            class: "bi-copy-structure",
            variant: "brand",
            appearance: "outlined",
            disabled: !b.canAffordCopyStructure,
            onclick: () => handlers.onCopy(false),
          },
          h("span", { slot: "start" }, icon("copy")),
          "Copy structure ",
          icon("gold"),
          " ",
          fmtCost(b.copyCostStructure),
        ),
      ];

  return h(
    "wa-card",
    { key: "binspector", class: "building-inspector", id: "BuildingInspector" },
    h("div", { class: "bi-title" }, [icon("factory"), " Building"]),
    h("wa-input", {
      key: "bi-name",
      class: "bi-name",
      label: "Name",
      size: "s",
      "prop:value": b.name,
      // <wa-input> fires the NATIVE input/change events (not wa-input/wa-change),
      // same as the wa-selects: track keystrokes into a transient on input and
      // commit on blur/Enter via change. App flushes the transient on deselect so
      // a click-away onto the canvas (which removes the input first) still persists.
      oninput: (e) => handlers.onRenameInput(e.target.value),
      onchange: (e) => handlers.onRename(e.target.value),
      onkeydown: (e) => {
        if (e.key === "Enter") {
          handlers.onRename(e.target.value);
          e.target.blur && e.target.blur();
        }
      },
    }),
    h("div", { class: "bi-line" }, `${b.nodeIds.length} machines grouped`),
    ...copyButtons,
    h(
      "wa-button",
      {
        key: "bi-ungroup",
        class: "bi-ungroup",
        variant: "neutral",
        appearance: "outlined",
        onclick: () => handlers.onUngroup(),
      },
      "Ungroup",
    ),
  );
}
