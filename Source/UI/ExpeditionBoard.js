import { h } from "./Render/Dom.js";
import { fmtCountdown, fmtNum } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { expeditionCardStatus, launchNudge } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

export function ExpeditionBoard(snap, dispatch) {
  const exp = snap.expedition; // {active, territoryId, timeRemainingMs, durationMs, heroId} | null
  const lead = (snap.heroes || [])[0] || { id: null, power: 0 };
  const heroPower = lead.power || 0;

  const cards = (snap.territories || []).map((t) => {
    const status = expeditionCardStatus(t, exp, heroPower);
    const parts = [
      h("div", { class: "exp-name" }, `#${t.order} ${t.name}`),
      h("div", { class: "exp-flavor" }, t.flavor || ""),
      h(
        "div",
        { class: "exp-power" },
        `Power ${fmtNum(heroPower)} / ${fmtNum(t.requiredPower)}`,
      ),
      h("div", { class: "exp-dur" }, `Duration ${fmtCountdown(t.durationMs)}`),
      h("div", { class: "exp-reward" }, [
        icon("gold"),
        ` ${fmtNum(t.rewards.gold)}  `,
        icon("research"),
        ` ${fmtNum(t.rewards.research)}  `,
        icon("renown"),
        ` ${fmtNum(t.rewards.renown)}`,
      ]),
    ];

    if (status === "active") {
      const rem = exp ? exp.timeRemainingMs : 0;
      parts.push(
        h(
          "div",
          { class: "exp-countdown" },
          `In progress — ${fmtCountdown(rem)}`,
        ),
      );
    } else if (status === "ready") {
      parts.push(
        h(
          "button",
          {
            class: "exp-launch affordable",
            onclick: () =>
              dispatch({
                type: INTENT.StartExpedition,
                territoryId: t.id,
                heroId: lead.id,
              }),
          },
          "Launch",
        ),
      );
    } else if (status === "underpowered") {
      parts.push(
        h(
          "button",
          {
            class: "exp-launch locked",
            disabled: true,
            title: launchNudge(heroPower, t.requiredPower),
          },
          "Launch",
        ),
      );
      parts.push(
        h(
          "div",
          { class: "exp-nudge" },
          launchNudge(heroPower, t.requiredPower),
        ),
      );
    } else if (status === "busy") {
      parts.push(
        h(
          "button",
          {
            class: "exp-launch locked",
            disabled: true,
            title: "Another expedition is running.",
          },
          "Launch",
        ),
      );
    } else if (status === "reclaimed") {
      parts.push(
        h("div", { class: "exp-done" }, ["Reclaimed ", icon("ready")]),
      );
    } else {
      parts.push(h("div", { class: "exp-locked" }, "Locked"));
    }

    return h(
      "div",
      { class: `exp-card ${status}` + (t.isVictory ? " victory" : "") },
      ...parts,
    );
  });

  return h(
    "div",
    { class: "expedition-board", id: "ExpeditionBoard" },
    ...cards,
  );
}
