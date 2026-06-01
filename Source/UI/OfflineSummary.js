import { h } from "./Render/Dom.js";
import { fmtNum, fmtCountdown } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { TERRITORIES } from "../Engine/Content/Territories.js";

export function OfflineSummary(summary, onClose) {
  const g = summary.gained || { gold: 0, research: 0, renown: 0 };
  const expLines = (summary.expeditionsResolved || []).map((e) =>
    h(
      "div",
      { class: "os-exp" },
      `Reclaimed ${TERRITORIES[e.territoryId] ? TERRITORIES[e.territoryId].name : e.territoryId}`,
    ),
  );

  return h(
    "div",
    { class: "modal-backdrop", id: "OfflineSummary" },
    h(
      "div",
      { class: "modal os-modal" },
      h("div", { class: "os-title" }, "While you were away"),
      h(
        "div",
        { class: "os-elapsed" },
        `Away for ${fmtCountdown(summary.appliedMs)}${summary.clamped ? " (capped)" : ""}`,
      ),
      h("div", { class: "os-gained" }, [
        icon("gold"),
        ` +${fmtNum(g.gold)}   `,
        icon("research"),
        ` +${fmtNum(g.research)}   `,
        icon("renown"),
        ` +${fmtNum(g.renown)}`,
      ]),
      ...expLines,
      h("button", { class: "os-close", onclick: onClose }, "Continue"),
    ),
  );
}
