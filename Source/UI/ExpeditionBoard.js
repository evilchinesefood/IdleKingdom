import { h } from "./Render/Dom.js";
import { fmtCountdown, fmtNum } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { expeditionCardStatus, launchNudge } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

export function ExpeditionBoard(snap, dispatch) {
  const exp = snap.expedition;
  const lead = (snap.heroes || [])[0] || { id: null, power: 0 };
  const heroPower = lead.power || 0;

  const cards = (snap.territories || []).map((t) => {
    const status = expeditionCardStatus(t, exp, heroPower);

    const header = h(
      "div",
      { class: "exp-name", slot: "header" },
      `#${t.order} ${t.name}`,
      ...(t.isVictory ? [" ", icon("victory")] : []),
    );

    const parts = [
      h("div", { class: "exp-flavor" }, t.flavor || ""),
      h(
        "div",
        { class: "exp-power" },
        icon("renown"),
        ` Power ${fmtNum(heroPower)} / ${fmtNum(t.requiredPower)}`,
      ),
      h("div", { class: "exp-dur" }, `Duration ${fmtCountdown(t.durationMs)}`),
      h(
        "div",
        { class: "exp-reward" },
        h("wa-tag", { size: "s" }, icon("gold"), " " + fmtNum(t.rewards.gold)),
        " ",
        h(
          "wa-tag",
          { size: "s" },
          icon("research"),
          " " + fmtNum(t.rewards.research),
        ),
        " ",
        h(
          "wa-tag",
          { size: "s" },
          icon("renown"),
          " " + fmtNum(t.rewards.renown),
        ),
      ),
    ];

    if (status === "active") {
      const rem = exp ? exp.timeRemainingMs : 0;
      const pct =
        exp && exp.durationMs > 0
          ? Math.max(0, Math.min(100, (1 - rem / exp.durationMs) * 100))
          : 0;
      parts.push(
        h(
          "wa-callout",
          { class: "exp-countdown", variant: "brand", size: "s" },
          icon("inprogress"),
          ` In progress — ${fmtCountdown(rem)}`,
        ),
      );
      parts.push(h("wa-progress-bar", { class: "exp-progress", value: pct }));
    } else if (status === "ready") {
      parts.push(
        h(
          "wa-button",
          {
            class: "exp-launch affordable",
            variant: "success",
            appearance: "accent",
            onclick: () =>
              dispatch({
                type: INTENT.StartExpedition,
                territoryId: t.id,
                heroId: lead.id,
              }),
          },
          icon("launch"),
          " Launch",
        ),
      );
    } else if (status === "underpowered") {
      parts.push(
        h(
          "wa-button",
          { class: "exp-launch locked", disabled: true },
          icon("launch"),
          " Launch",
        ),
      );
      parts.push(
        h(
          "wa-callout",
          { class: "exp-nudge", variant: "warning", size: "s" },
          icon("starved"),
          " " + launchNudge(heroPower, t.requiredPower),
        ),
      );
    } else if (status === "busy") {
      parts.push(
        h(
          "wa-button",
          { class: "exp-launch locked", disabled: true },
          icon("launch"),
          " Launch",
        ),
      );
      parts.push(
        h(
          "wa-callout",
          { class: "exp-busy", variant: "neutral", size: "s" },
          icon("inprogress"),
          " Another expedition is running.",
        ),
      );
    } else if (status === "reclaimed") {
      parts.push(
        h(
          "wa-tag",
          { class: "exp-done", variant: "success" },
          icon("ready"),
          " Reclaimed",
        ),
      );
    } else {
      parts.push(
        h(
          "wa-tag",
          { class: "exp-locked", appearance: "outlined" },
          icon("locked"),
          " Locked",
        ),
      );
    }

    return h(
      "wa-card",
      {
        key: "terr-" + t.id,
        class: `exp-card ${status}` + (t.isVictory ? " victory" : ""),
        "with-header": true,
      },
      header,
      ...parts,
    );
  });

  return h(
    "div",
    { class: "expedition-board", id: "ExpeditionBoard" },
    ...cards,
  );
}
