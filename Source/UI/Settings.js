import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";

export function Settings(prefs, handlers) {
  const { onToggle, onReset, onClose } = handlers;
  const toggleRow = (key, label) =>
    h("label", { class: "settings-row", key }, [
      h("input", {
        type: "checkbox",
        key: "cb",
        "prop:checked": !!prefs[key],
        onchange: () => onToggle(key),
      }),
      " " + label,
    ]);
  return h(
    "wa-dialog",
    {
      id: "Settings",
      key: "settings",
      "prop:open": true,
      onWaHide: onClose,
    },
    h("div", { slot: "label", class: "os-title" }, [
      icon("settings"),
      " Settings",
    ]),
    h("div", { class: "settings-modal" }, [
      toggleRow("snapToGrid", "Snap nodes to grid"),
      toggleRow("alwaysShowRates", "Always show rates"),
    ]),
    h(
      "div",
      {
        slot: "footer",
        style: "display: flex; gap: 0.5rem; justify-content: flex-end;",
      },
      [
        h(
          "wa-button",
          {
            key: "r",
            variant: "danger",
            appearance: "outlined",
            onclick: () => onReset(),
          },
          "Reset game",
        ),
        h(
          "wa-button",
          {
            key: "c",
            variant: "brand",
            appearance: "accent",
            onclick: () => onClose(),
          },
          "Close",
        ),
      ],
    ),
  );
}
