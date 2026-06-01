import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtNum, fmtCountdown } from "./Format/Format.js";
import { TERRITORIES } from "../Engine/Content/Territories.js";

export function OfflineSummary(summary, onClose) {
  const g = summary.gained || { gold: 0, research: 0, renown: 0 };
  const reclaimedTags = (summary.expeditionsResolved || []).map((e) =>
    h(
      "wa-tag",
      {
        class: "os-exp",
        variant: "success",
        appearance: "outlined",
        size: "small",
      },
      icon("ready"),
      " Reclaimed " +
        (TERRITORIES[e.territoryId]
          ? TERRITORIES[e.territoryId].name
          : e.territoryId),
    ),
  );
  return h(
    "wa-dialog",
    {
      id: "OfflineSummary",
      key: "offline",
      "prop:open": true,
      onWaHide: onClose,
    },
    h("div", { slot: "label", class: "os-title" }, "While you were away"),
    h(
      "div",
      { class: "os-elapsed modal-text" },
      `Away for ${fmtCountdown(summary.appliedMs)}${summary.clamped ? " (capped)" : ""}`,
    ),
    h(
      "div",
      { class: "os-gained" },
      h(
        "wa-tag",
        { class: "os-gain", size: "large", pill: true },
        icon("gold"),
        " +" + fmtNum(g.gold),
      ),
      h(
        "wa-tag",
        { class: "os-gain", size: "large", pill: true },
        icon("research"),
        " +" + fmtNum(g.research),
      ),
      h(
        "wa-tag",
        { class: "os-gain", size: "large", pill: true },
        icon("renown"),
        " +" + fmtNum(g.renown),
      ),
    ),
    ...reclaimedTags,
    h(
      "wa-button",
      {
        class: "os-close",
        slot: "footer",
        variant: "brand",
        appearance: "accent",
        onclick: onClose,
      },
      "Continue",
    ),
  );
}
