import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";

const EPILOGUE =
  "The last door of the Black Keep falls. The Usurer-Lord who bought the King's death " +
  "is dragged into the light of the braziers you relit. Yensburg stands. Six walls reclaimed, " +
  "the throne avenged. The forges do not cool — they never will again.";

export function Victory(onClose) {
  // Acknowledged-only: WA's wa-hide (Escape / header ×) is cancelable — block it
  // so the victory epilogue can't be dismissed by accident and lost forever.
  // The only way out is the explicit "Continue the Reign" button below.
  const blockDismiss = (e) => e && e.preventDefault && e.preventDefault();
  return h(
    "wa-dialog",
    {
      id: "Victory",
      key: "victory",
      "prop:open": true,
      onWaHide: blockDismiss,
    },
    h(
      "div",
      { slot: "label", class: "victory-title" },
      icon("victory"),
      " Yensburg Reclaimed",
    ),
    h("div", { class: "victory-text modal-text" }, EPILOGUE),
    h(
      "div",
      { class: "victory-sub" },
      "Free-play continues — all content remains unlocked.",
    ),
    h(
      "wa-button",
      {
        class: "victory-close",
        slot: "footer",
        variant: "brand",
        appearance: "accent",
        onclick: onClose,
      },
      icon("victory"),
      " Continue the Reign",
    ),
  );
}
