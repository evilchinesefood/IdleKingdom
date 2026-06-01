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
    "div",
    { class: "modal-backdrop", key: "settings", onclick: () => onClose() },
    [
      h(
        "div",
        {
          class: "modal settings-modal",
          key: "m",
          onclick: (e) => e.stopPropagation(),
        },
        [
          h("div", { class: "os-title" }, [icon("settings"), " Settings"]),
          toggleRow("snapToGrid", "Snap nodes to grid"),
          toggleRow("alwaysShowRates", "Always show rates"),
          h("div", { class: "settings-actions" }, [
            h(
              "button",
              { class: "settings-reset", key: "r", onclick: () => onReset() },
              ["Reset game"],
            ),
            h(
              "button",
              { class: "settings-close", key: "c", onclick: () => onClose() },
              ["Close"],
            ),
          ]),
        ],
      ),
    ],
  );
}
