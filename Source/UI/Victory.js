import { h } from "./Render/Dom.js";

const EPILOGUE =
  "The last door of the Black Keep falls. The Usurer-Lord who bought the King's death " +
  "is dragged into the light of the braziers you relit. Yensburg stands. Six walls reclaimed, " +
  "the throne avenged. The forges do not cool — they never will again.";

export function Victory(onClose) {
  return h(
    "div",
    { class: "modal-backdrop victory-backdrop", id: "Victory" },
    h(
      "div",
      { class: "modal victory-modal" },
      h("div", { class: "victory-title" }, "Yensburg Reclaimed"),
      h("div", { class: "victory-text" }, EPILOGUE),
      h(
        "div",
        { class: "victory-sub" },
        "Free-play continues — all content remains unlocked.",
      ),
      h(
        "button",
        { class: "victory-close", onclick: onClose },
        "Continue the Reign",
      ),
    ),
  );
}
