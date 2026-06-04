import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { fmtNum } from "./Format/Format.js";

// Coarse "falls in" countdown for the siege. Seconds under 90s, minutes under
// 90m, hours beyond. Null (no army / nothing besieging) renders an em dash.
function etaText(sec) {
  if (sec == null) return "—";
  if (sec < 90) return Math.ceil(sec) + "s";
  if (sec < 5400) return Math.ceil(sec / 60) + "m";
  return (sec / 3600).toFixed(1) + "h";
}

// The War screen: every territory as a card in conquest order, with the active
// siege front and center. The UI is passive — siege progress auto-accrues from
// the army the player musters in the Factory (Barracks), so there are no buttons.
export function WarBoard(snap) {
  const siege = snap.siege || {};
  const cards = (snap.territories || []).map((t) => {
    const sieging = t.status === "sieging";
    const pct =
      sieging && t.siegeCost
        ? Math.min(100, (siege.progress / t.siegeCost) * 100)
        : 0;
    const header = h(
      "div",
      { class: "war-name", slot: "header" },
      `#${t.order} ${t.name}`,
      ...(t.isVictory ? [" ", icon("victory")] : []),
    );
    const children = [
      header,
      h(
        "div",
        { class: "war-cost" },
        icon("siege"),
        " " + fmtNum(t.siegeCost) + " siege power",
      ),
      h("div", { class: "war-flavor" }, t.flavor || ""),
    ];
    if (sieging) {
      children.push(
        h("wa-progress-bar", { class: "war-progress", value: pct }),
        h(
          "div",
          { class: "war-rate" },
          siege.rate > 0
            ? fmtNum(siege.rate) +
                " power/s — falls in " +
                etaText(siege.etaSeconds)
            : "No army mustered — build Barracks and feed them gear.",
        ),
      );
    }
    if (t.status === "reclaimed")
      children.push(
        h(
          "wa-badge",
          { class: "war-done", variant: "success" },
          h("span", { slot: "start" }, icon("ready")),
          "Reclaimed",
        ),
      );
    return h(
      "wa-card",
      {
        key: "war-" + t.id,
        class: `war-card ${t.status}` + (t.isVictory ? " victory" : ""),
        "with-header": true,
      },
      ...children,
    );
  });
  return h("div", { class: "war-board", id: "WarBoard" }, ...cards);
}
