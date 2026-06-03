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
      open: true,
      // WA dialogs are NOT light-dismiss by default; opt in so a click on the
      // overlay (outside the modal) closes it (fires wa-hide -> onClose).
      "light-dismiss": true,
      onWaHide: onClose,
    },
    h("div", { slot: "label", class: "os-title" }, [
      icon("settings"),
      " Settings",
    ]),
    h("div", { class: "settings-modal" }, [
      toggleRow("snapToGrid", "Snap nodes to grid"),
      toggleRow("alwaysShowRates", "Always show rates"),
      toggleRow("soundDisabled", "Disable sounds"),
    ]),
    h(
      "div",
      { class: "settings-links" },
      h(
        "a",
        {
          class: "settings-link",
          href: "https://github.com/evilchinesefood/IdleKingdom",
          target: "_blank",
          rel: "noopener",
        },
        "View source on GitHub",
      ),
    ),
    h(
      "div",
      { class: "BezelWrap" },
      h(
        "a",
        {
          class: "credit sm",
          href: "https://jdayers.com/",
          target: "_blank",
          rel: "noopener",
        },
        "> made with ",
        h("span", { class: "heart" }, "❤"),
        " by david ayers",
        h("span", { class: "cursor" }, "_"),
      ),
    ),
    h(
      "div",
      {
        slot: "footer",
        // Reset on the LEFT, Close on the right.
        style: "display: flex; gap: 0.5rem; justify-content: space-between;",
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
