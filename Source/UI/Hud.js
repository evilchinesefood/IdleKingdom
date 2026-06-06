import { h, patch } from "./Render/Dom.js";
import { formatNumber, formatRate } from "./Render/Format.js";
import { icon } from "./Icons.js";

const TABS = [
  { route: "factory", label: "Factory" },
  { route: "research", label: "Research" },
  { route: "war", label: "War" },
];

// wa-tag and wa-tab have NO "start" slot (only a default slot), so a
// slot="start" icon is unslotted and never rendered — leaving the value where
// the icon should be. Render the icon as a default-slot child instead.
function startIcon(concept) {
  return icon(concept, { noTone: true, class: "hud-ico" });
}

function currencyTag(key, concept, name, value, rate) {
  return h(
    "wa-tag",
    {
      key,
      class: "hud-cur",
      variant: "neutral",
      appearance: "filled",
      size: "l",
      pill: true,
      // The three currencies differ only by a small icon — give each an
      // accessible name so screen readers don't announce a bare number.
      "aria-label": `${name}: ${value}`,
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
      this.el.classList.remove("menu-open"); // collapse the mobile menu on choose
    };
  }

  render(snap) {
    const cs = snap.currencyStrings || {};
    const goldV = cs.gold ?? formatNumber(snap.currencies.gold);
    const resV = cs.research ?? formatNumber(snap.currencies.research);
    const goldR = cs.goldRate ?? formatRate(snap.rates.goldRate);
    const resR = cs.researchRate ?? formatRate(snap.rates.researchRate);

    const saveOk = snap.save && snap.save.status === "ok";

    patch(this.el, [
      // Logo hidden from the top nav for now — kept here (and .hud-logo CSS) for
      // later use; uncomment to restore.
      // h("img", {
      //   class: "hud-logo",
      //   key: "logo",
      //   src: "./Source/Assets/Logo.png",
      //   alt: "IdleKingdom",
      // }),
      h("div", { class: "hud-currencies", key: "cur" }, [
        currencyTag("gold", "gold", "Gold", goldV, goldR),
        currencyTag("research", "research", "Research", resV, resR),
      ]),
      // Idle games autosave constantly — a persistent "saved" tag is just
      // noise. Only surface the badge when a save actually FAILS, prominently.
      saveOk
        ? null
        : h(
            "wa-tag",
            {
              key: "save",
              class: "hud-save failed",
              variant: "danger",
              appearance: "filled",
              title:
                "Couldn't save — storage may be full or blocked (private browsing).",
            },
            [startIcon("save_fail"), " save failed"],
          ),
      // Hamburger (shown only below the navbar breakpoint via CSS): toggles the
      // .menu-open class on the HUD header to reveal/hide the collapsed tabs.
      h(
        "button",
        {
          class: "hud-hamburger",
          key: "hamburger",
          "aria-label": "Menu",
          "aria-expanded": this.el.classList.contains("menu-open")
            ? "true"
            : "false",
          onclick: () => this.el.classList.toggle("menu-open"),
        },
        [icon("menu", { noTone: true })],
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
