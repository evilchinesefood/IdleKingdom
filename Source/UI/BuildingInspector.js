import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtCost } from "./Format/Format.js";

// handlers: { onCopy(), onRename(name), onUngroup() }; `copying` = copy placement active.
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
      onWaChange: (e) => handlers.onRename(e.target.value),
    }),
    h("div", { class: "bi-line" }, `${b.nodeIds.length} machines grouped`),
    h(
      "wa-button",
      {
        key: "bi-copy",
        class: "bi-copy",
        variant: copying ? "neutral" : "brand",
        appearance: copying ? "outlined" : "accent",
        disabled: !copying && !b.canAffordCopy,
        onclick: () => handlers.onCopy(),
      },
      copying
        ? "Cancel — tap the canvas to place"
        : ["Copy ", icon("gold"), " ", fmtCost(b.copyCost)],
    ),
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
