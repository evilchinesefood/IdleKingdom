import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtNum } from "./Format/Format.js";
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
        size: "s",
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
      open: true,
      onWaHide: onClose,
    },
    h("div", { slot: "label", class: "os-title" }, "While you were away"),
    h(
      "div",
      { class: "os-gained" },
      h("span", { class: "os-gain" }, icon("gold"), " +" + fmtNum(g.gold)),
      h(
        "span",
        { class: "os-gain" },
        icon("research"),
        " +" + fmtNum(g.research),
      ),
      h("span", { class: "os-gain" }, icon("renown"), " +" + fmtNum(g.renown)),
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
