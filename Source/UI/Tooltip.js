import { h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { tutorialStep } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

const b = (t) => h("strong", {}, t); // emphasize an important term

// One entry per tutorial step id (see Selectors.TUTORIAL_STEPS + the "done" card).
// The guide advances automatically when each step's objective is met; there is no
// "next" button — only Skip (any step) / Finish (the done card).
const STEPS = {
  miner: {
    title: "Build Your First Machine",
    body: [
      "The ",
      b("Build bar"),
      " runs along the bottom of the screen — that's where you place machines. Tap the ",
      b("Gatherer"),
      " and place a ",
      b("Miner"),
      " to start gathering ",
      b("Iron Ore"),
      ".",
    ],
  },
  smelter: {
    title: "Refine the Ore",
    body: [
      "Now place a ",
      b("Smelter"),
      " — it refines ",
      b("Iron Ore"),
      " into ",
      b("Iron Bars"),
      ".",
    ],
  },
  market: {
    title: "Open for Business",
    body: [
      "Place a ",
      b("Market"),
      ". It sells your goods for ",
      b("Gold"),
      ".",
    ],
  },
  connect: {
    title: "Connect the Line",
    body: [
      "Drag from a machine's ",
      b("output port"),
      " to the next machine's ",
      b("input port"),
      ". Wire ",
      b("Miner → Smelter → Market"),
      " so Iron Ore flows through and sells for Gold.",
    ],
  },
  upgrade: {
    title: "Scale It Up",
    body: [
      "Select a machine and press ",
      b("Upgrade"),
      " to raise its output. Faster machines earn more ",
      b("Gold"),
      ".",
    ],
  },
  done: {
    title: "You're Running Yensburg",
    body: [
      "That's the core loop — gather, refine, sell, upgrade. Bank ",
      b("Research"),
      " to unlock new machines, then forge gear and launch ",
      b("Expeditions"),
      " to reclaim the city. Good luck!",
    ],
  },
};

// Non-blocking onboarding card pinned below the HUD. It does NOT cover the
// canvas/build bar, so the player can perform each objective while it's shown.
export function Tooltip(snap, dispatch) {
  const step = tutorialStep(snap);
  if (!step) return null;
  const def = STEPS[step.id];
  if (!def) return null;
  const isDone = step.id === "done";
  const skip = () => dispatch({ type: INTENT.DismissTutorial });

  return h(
    "div",
    { class: "tutorial-card", id: "TutorialCard", key: "tut-" + step.id },
    h(
      "div",
      { class: "tut-head" },
      h("span", { class: "tut-icon" }, icon(isDone ? "victory" : "info")),
      h("span", { class: "tut-title" }, def.title),
      isDone
        ? null
        : h(
            "span",
            { class: "tut-step" },
            `Step ${step.index + 1} of ${step.total}`,
          ),
    ),
    h("div", { class: "tut-text" }, ...def.body),
    h(
      "div",
      { class: "tut-actions" },
      h(
        "wa-button",
        {
          class: "tut-skip",
          size: "s",
          variant: isDone ? "brand" : "neutral",
          appearance: isDone ? "accent" : "plain",
          onclick: skip,
        },
        isDone ? "Finish" : "Skip tutorial",
      ),
    ),
  );
}
