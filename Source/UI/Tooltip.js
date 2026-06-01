import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { nextTutorialStep } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

// anchor = a CSS selector for the element this tip points at (cosmetic; used by App to position).
const TIPS = {
  gold: {
    flag: "seenGoldTip",
    anchor: ".factory-panels",
    text: "Welcome to Yensburg. Open the Build menu and place a Miner, a Smelter, and a Market — connect them so ore becomes iron bars that sell at the Market for Gold.",
  },
  upgrade: {
    flag: "seenUpgradeTip",
    anchor: "#NodeInspector .ni-upgrade",
    text: "Tap a node, then Upgrade it to raise its rate.",
  },
  connect: {
    flag: "seenConnectTip",
    anchor: ".graph-svg",
    text: "Drag from an output port to an input port to connect machines.",
  },
  research: {
    flag: "seenResearchTip",
    anchor: 'wa-tab[panel="research"]',
    text: "Bank Research and open the tree to unlock new machines.",
  },
  expedition: {
    flag: "seenExpeditionTip",
    anchor: 'wa-tab[panel="expeditions"]',
    text: "Forge gear, equip a hero, and launch an expedition.",
  },
};

export function Tooltip(snap, dispatch) {
  const flags = (snap.tutorial && snap.tutorial.flags) || {};
  const step = nextTutorialStep(flags);
  if (!step) return null;
  const tip = TIPS[step];
  if (!tip) return null;

  return h(
    "div",
    { class: "tooltip-layer", id: "TooltipLayer", "data-anchor": tip.anchor },
    h(
      "wa-callout",
      { class: "tooltip", key: "tip-" + step, variant: "brand" },
      h("span", { slot: "start" }, icon("info", { class: "tip-icon" })),
      h("span", { class: "tip-text" }, tip.text),
      h(
        "wa-button",
        {
          class: "tip-dismiss",
          size: "s",
          appearance: "plain",
          onclick: () =>
            dispatch({ type: INTENT.DismissTooltip, flag: tip.flag }),
        },
        "Got it",
      ),
    ),
  );
}
