import { h, patch } from "./Render/Dom.js";
import { formatNumber, formatRate } from "./Render/Format.js";

const TABS = [
  { route: "factory", label: "⚒ Factory" },
  { route: "research", label: "📜 Research" },
  { route: "expeditions", label: "🛡 Expeditions" },
  { route: "heroes", label: "⚔ Heroes" },
];

function currencyCell(key, icon, value, rate) {
  return h("div", { class: "hud-cur", key }, [
    h("span", { class: "val" }, [`${icon} ${value}`]),
    h("span", { class: "rate" }, [rate]),
  ]);
}

export class Hud {
  constructor(el, router) {
    this.el = el;
    this.router = router;
  }

  render(snap) {
    const cs = snap.currencyStrings || {};
    const goldV = cs.gold ?? formatNumber(snap.currencies.gold);
    const resV = cs.research ?? formatNumber(snap.currencies.research);
    const renV = cs.renown ?? formatNumber(snap.currencies.renown);
    const goldR = cs.goldRate ?? formatRate(snap.rates.goldRate);
    const resR = cs.researchRate ?? formatRate(snap.rates.researchRate);

    const saveOk = snap.save && snap.save.status === "ok";
    const tabs = h(
      "nav",
      { class: "hud-tabs" },
      TABS.map((t) =>
        h(
          "a",
          {
            key: t.route,
            href: "#/" + t.route,
            class: this.router.current === t.route ? "active" : "",
          },
          [t.label],
        ),
      ),
    );

    patch(this.el, [
      h("div", { class: "hud-currencies", key: "cur" }, [
        currencyCell("gold", "🪙", goldV, goldR),
        currencyCell("research", "📜", resV, resR),
        currencyCell("renown", "🛡️", renV, "—"),
      ]),
      h(
        "div",
        { class: saveOk ? "hud-save" : "hud-save failed", key: "save" },
        [saveOk ? "💾 saved" : "⚠ save failed"],
      ),
      tabs,
    ]);
  }
}
