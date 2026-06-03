import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { nextTutorialStep } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

const TIPS = {
  gold: {
    flag: "seenGoldTip",
    text: "Welcome to Yensburg. Open the Build menu and place a Miner, a Smelter, and a Market — connect them so ore becomes iron bars that sell at the Market for Gold.",
  },
  upgrade: {
    flag: "seenUpgradeTip",
    text: "Tap a node, then Upgrade it to raise its rate.",
  },
  connect: {
    flag: "seenConnectTip",
    text: "Drag from an output port to an input port to connect machines.",
  },
  research: {
    flag: "seenResearchTip",
    text: "Bank Research and open the tree to unlock new machines.",
  },
  expedition: {
    flag: "seenExpeditionTip",
    text: "Forge gear, equip a hero, and launch an expedition.",
  },
};

export function Tooltip(snap, dispatch) {
  const flags = (snap.tutorial && snap.tutorial.flags) || {};
  const step = nextTutorialStep(flags);
  if (!step) return null;
  const tip = TIPS[step];
  if (!tip) return null;

  // Centered modal (matches Victory/OfflineSummary). Acknowledged-only: block
  // wa-hide so Escape / overlay clicks can't close it without setting the
  // seen-flag (which would just re-open it on the next render). The only way
  // out is the "Got it" button, which advances to the next tip.
  const blockDismiss = (e) => e && e.preventDefault && e.preventDefault();
  return h(
    "wa-dialog",
    {
      id: "TooltipLayer",
      key: "tip-" + step,
      class: "intro-dialog",
      open: true,
      onWaHide: blockDismiss,
    },
    h("div", { slot: "label", class: "os-title" }, icon("info"), " Tip"),
    h("div", { class: "tip-text modal-text" }, tip.text),
    h(
      "div",
      { slot: "footer", class: "intro-footer" },
      h(
        "wa-button",
        {
          class: "tip-dismiss",
          variant: "brand",
          appearance: "accent",
          onclick: () =>
            dispatch({ type: INTENT.DismissTooltip, flag: tip.flag }),
        },
        "Got it",
      ),
    ),
  );
}
