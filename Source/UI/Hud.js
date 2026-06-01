import { h, patch } from "./Render/Dom.js";
import { formatNumber, formatRate } from "./Render/Format.js";
import { icon } from "./Icons.js";

const TABS = [
  { route: "factory", label: "Factory" },
  { route: "research", label: "Research" },
  { route: "expeditions", label: "Expeditions" },
  { route: "heroes", label: "Heroes" },
];

function startIcon(concept) {
  const v = icon(concept, { noTone: true });
  v.props = { ...v.props, slot: "start" };
  return v;
}

function currencyTag(key, concept, value, rate) {
  return h(
    "wa-tag",
    {
      key,
      class: "hud-cur",
      variant: "neutral",
      appearance: "filled",
      size: "l",
      pill: true,
    },
    [
      startIcon(concept),
      h("span", { class: "val" }, [value]),
      rate != null ? h("small", { class: "rate" }, [rate]) : null,
    ],
  );
}

export class Hud {
  constructor(el, router, onOpenSettings) {
    this.el = el;
    this.router = router;
    this.onOpenSettings = onOpenSettings;
    this._onTabShow = (e) => {
      const name = e && e.detail && e.detail.name;
      if (name && this.router && typeof this.router.navigate === "function") {
        this.router.navigate(name);
      }
    };
  }

  render(snap) {
    const cs = snap.currencyStrings || {};
    const goldV = cs.gold ?? formatNumber(snap.currencies.gold);
    const resV = cs.research ?? formatNumber(snap.currencies.research);
    const renV = cs.renown ?? formatNumber(snap.currencies.renown);
    const goldR = cs.goldRate ?? formatRate(snap.rates.goldRate);
    const resR = cs.researchRate ?? formatRate(snap.rates.researchRate);

    const saveOk = snap.save && snap.save.status === "ok";

    patch(this.el, [
      h("div", { class: "hud-currencies", key: "cur" }, [
        currencyTag("gold", "gold", goldV, goldR),
        currencyTag("research", "research", resV, resR),
        currencyTag("renown", "renown", renV, null),
      ]),
      h(
        "wa-tag",
        {
          key: "save",
          class: saveOk ? "hud-save" : "hud-save failed",
          variant: saveOk ? "success" : "danger",
          appearance: "outlined",
        },
        [
          startIcon(saveOk ? "save_ok" : "save_fail"),
          saveOk ? "saved" : "save failed",
        ],
      ),
      h(
        "wa-tab-group",
        {
          key: "tabs",
          class: "hud-tabs",
          "prop:active": this.router.current,
          onWaTabShow: this._onTabShow,
        },
        TABS.map((t) =>
          h("wa-tab", { key: "tab-" + t.route, panel: t.route }, [
            startIcon(t.route),
            t.label,
          ]),
        ),
      ),
      h(
        "button",
        {
          class: "hud-settings",
          key: "settings-btn",
          "aria-label": "Settings",
          onclick: () => this.onOpenSettings && this.onOpenSettings(),
        },
        [icon("settings", { noTone: true })],
      ),
    ]);
  }
}
