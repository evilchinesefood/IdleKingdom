import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";

// Slim "Group" panel: Rename + Ungroup only. Copy / Paste / Delete All live on
// the floating action bar that also appears whenever a group is selected.
// handlers: { onRename(name), onRenameInput(name), onUngroup() }.
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
      " No group selected",
    );

  return h(
    "wa-card",
    { key: "binspector", class: "building-inspector", id: "BuildingInspector" },
    h("div", { class: "bi-title" }, [icon("group"), " Group"]),
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
    h(
      "div",
      { class: "bi-line" },
      `${b.nodeIds.length} machines in this group`,
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
