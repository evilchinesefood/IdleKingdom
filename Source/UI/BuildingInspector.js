import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";

// handlers: { onRename(name), onRenameInput(name), onUngroup(), onDelete() }.
export function BuildingInspector(snap, buildingId, handlers) {
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
    // Delete the whole building INCLUDING its machines.
    h(
      "wa-button",
      {
        key: "bi-delete",
        class: "bi-delete",
        variant: "danger",
        appearance: "accent",
        onclick: () => handlers.onDelete(),
      },
      h("span", { slot: "start" }, icon("remove")),
      "Delete building + machines",
    ),
  );
}
