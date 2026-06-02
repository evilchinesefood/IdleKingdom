import { Router } from "./Router.js";
import { Hud } from "./Hud.js";
import { GraphView } from "./GraphView.js";
import { patch, h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { BuildMenu } from "./BuildMenu.js";
import { NodeInspector } from "./NodeInspector.js";
import { ResearchTree } from "./ResearchTree.js";
import { ExpeditionBoard } from "./ExpeditionBoard.js";
import { HeroPanel } from "./HeroPanel.js";
import { OfflineSummary } from "./OfflineSummary.js";
import { Tooltip } from "./Tooltip.js";
import { Victory } from "./Victory.js";
import { Settings } from "./Settings.js";
import { loadPrefs, savePrefs } from "./Prefs.js";
import { victoryReady } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";
import { SAVE_KEY } from "../Engine/Persistence/SaveManager.js";

export const App = {
  mount(rootEl, game) {
    const inst = new AppInstance(rootEl, game);
    inst.start();
    App._current = inst;
    return inst;
  },
  showOfflineSummary(summary) {
    if (App._current) App._current.showOfflineSummary(summary);
  },
  refreshHud() {
    if (App._current) App._current.refreshHud();
  },
  _current: null,
};

class AppInstance {
  constructor(rootEl, game) {
    this.root = rootEl;
    this.game = game;
    this.router = new Router();
    this.dispatch = (intent) => this.game.dispatch(intent);

    this.hudEl = document.createElement("header");
    this.hudEl.className = "hud";
    this.hudEl.id = "Hud";
    this.screenEl = document.createElement("main");
    this.screenEl.className = "screen";
    this.panelEl = document.createElement("aside"); // factory side-panels host
    this.panelEl.className = "factory-panels";
    this.overlayEl = document.createElement("div"); // tooltip + modal layer
    this.overlayEl.className = "overlay-layer";
    this.errorEl = document.createElement("div");
    this.errorEl.className = "hud-error";
    this.errorEl.setAttribute("role", "alert");
    this.errorEl.style.display = "none";

    this.root.innerHTML = "";
    this.root.appendChild(this.hudEl);
    this.root.appendChild(this.screenEl);
    this.root.appendChild(this.overlayEl);
    this.root.appendChild(this.errorEl);

    this.prefs = loadPrefs();
    this.showSettings = false;

    this.hud = new Hud(this.hudEl, this.router, () => this.openSettings());
    this.graphView = null;
    this.lastSnap = null;
    this.activeScreen = null;
    this._errorTimer = null;

    this.selectedNodeId = null;
    this.buildUi = {
      selectedPaletteKind: null,
      setPalette: (k) => {
        this.buildUi.selectedPaletteKind = k;
        this.renderNow();
      },
      spawnPos: () =>
        this.graphView && this.graphView.centerGraphPos
          ? this.graphView.centerGraphPos()
          : { x: 300, y: 320 },
    };

    this.pendingOfflineSummary = null;
    this.victoryShown = false;
    this.showVictory = false;
  }

  start() {
    this._applyPrefs();
    this.router.onChange(() => this._mountScreen());
    this.game.onSnapshot((snap) => this._onSnapshot(snap));
    this.router.start();
    this._mountScreen();
  }

  _applyPrefs() {
    this.hudEl.classList.toggle("show-rates", !!this.prefs.alwaysShowRates);
  }

  openSettings() {
    this.showSettings = true;
    this.renderNow();
  }

  _mountScreen() {
    const route = this.router.current;
    if (this.activeScreen === route) {
      this.hud.render(this.lastSnap || this._emptySnap());
      return;
    }
    this.activeScreen = route;
    this.screenEl.innerHTML = "";
    this.graphView = null;
    this.selectedNodeId = null;

    if (route === "factory") {
      const canvas = document.createElement("div");
      canvas.className = "graph-host";
      this.screenEl.appendChild(canvas);
      this.screenEl.appendChild(this.panelEl);
      this.panelEl.innerHTML = "";
      const legend = document.createElement("div");
      legend.className = "factory-legend";
      patch(legend, [
        h(
          "span",
          { class: "lg-item lg-max" },
          icon("max"),
          " MAX = running at level cap",
        ),
        h(
          "span",
          { class: "lg-item lg-starved" },
          icon("starved"),
          " LOW = needs more input",
        ),
      ]);
      this.screenEl.appendChild(legend);
      this.graphView = new GraphView(canvas, this.game, {
        onSelect: (id) => {
          this.selectedNodeId = id;
          this.renderNow();
        },
        snap: () => !!this.prefs.snapToGrid,
      });
    } else {
      // route-owned panel host
      const host = document.createElement("div");
      host.className = "panel-host";
      this.screenEl.appendChild(host);
      this._routeHost = host;
    }

    const snap = this.lastSnap || this._emptySnap();
    this.hud.render(snap);
    if (this.lastSnap) this._renderScreen(this.lastSnap);
  }

  _onSnapshot(snap) {
    this.lastSnap = snap;
    if (victoryReady(snap) && !snap.meta.seenVictory && !this.victoryShown) {
      this.victoryShown = true;
      this.showVictory = true;
    }
    this.hud.render(snap);
    this._renderScreen(snap);
    this._renderOverlay(snap);
    if (snap.lastError) this._flashError(snap.lastError);
  }

  // Re-render the active screen + overlay from the last snapshot (used by UI-state changes).
  renderNow() {
    const snap = this.lastSnap || this._emptySnap();
    this._renderScreen(snap);
    this._renderOverlay(snap);
  }

  // Passive HUD-only refresh (~every 2s): update currency/rate counters WITHOUT
  // rebuilding the interactive panels/graph — rebuilding them would close open
  // dropdowns and make buttons un-clickable under continuous re-render.
  refreshHud() {
    const snap = this.game.getSnapshot();
    this.lastSnap = snap;
    this.hud.render(snap);
  }

  _renderScreen(snap) {
    const route = this.activeScreen;
    if (route === "factory") {
      if (this.graphView) this.graphView.render(snap);
      patch(this.panelEl, [
        BuildMenu(snap, this.dispatch, this.buildUi),
        NodeInspector(snap, this.dispatch, this.selectedNodeId),
      ]);
      return;
    }
    if (!this._routeHost) return;
    let vnode = null;
    if (route === "research") vnode = ResearchTree(snap, this.dispatch);
    else if (route === "expeditions")
      vnode = ExpeditionBoard(snap, this.dispatch);
    else if (route === "heroes") vnode = HeroPanel(snap, this.dispatch);
    patch(this._routeHost, vnode ? [vnode] : []);
  }

  _renderOverlay(snap) {
    const children = [];
    if (this.pendingOfflineSummary) {
      children.push(
        OfflineSummary(this.pendingOfflineSummary, () => {
          this.pendingOfflineSummary = null;
          this.renderNow();
        }),
      );
    }
    if (this.showVictory) {
      children.push(
        Victory(() => {
          this.showVictory = false;
          this.dispatch({ type: INTENT.AckVictory });
          this.renderNow();
        }),
      );
    }
    if (this.showSettings) {
      children.push(
        Settings(this.prefs, {
          onToggle: (k) => {
            this.prefs[k] = !this.prefs[k];
            savePrefs(this.prefs);
            this._applyPrefs();
            this.renderNow();
          },
          onReset: () => {
            if (
              typeof confirm === "function" &&
              !confirm("Reset all progress? This cannot be undone.")
            )
              return;
            try {
              localStorage.removeItem(SAVE_KEY);
            } catch {}
            location.reload();
          },
          onClose: () => {
            this.showSettings = false;
            this.renderNow();
          },
        }),
      );
    }
    const tip = Tooltip(snap, this.dispatch);
    if (tip) children.push(tip);
    patch(this.overlayEl, children);
    this._positionTooltip();
  }

  // Position the onboarding tooltip beside the element named by its data-anchor
  // (the dead "anchor" the tip declared). Falls back to the CSS default
  // (bottom-center) when there's no anchor or no measurable target (e.g. tests).
  _positionTooltip() {
    let layer = null;
    try {
      layer = this.overlayEl.querySelector
        ? this.overlayEl.querySelector(".tooltip-layer")
        : null;
    } catch {
      layer = null;
    }
    if (!layer || !layer.style) return;
    // reset to the CSS default before (maybe) re-anchoring
    layer.style.left = "";
    layer.style.top = "";
    layer.style.bottom = "";
    layer.style.transform = "";
    const sel = layer.getAttribute && layer.getAttribute("data-anchor");
    if (!sel) return;
    let target = null;
    try {
      target = document.querySelector(sel);
    } catch {
      target = null;
    }
    if (!target || typeof target.getBoundingClientRect !== "function") return;
    let tr, lr;
    try {
      tr = target.getBoundingClientRect();
      lr = layer.getBoundingClientRect();
    } catch {
      return;
    }
    if (!tr || (!tr.width && !tr.height)) return; // unmeasured → keep default
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const tipW = lr.width || 320;
    const tipH = lr.height || 120;
    const m = 8;
    // prefer below the anchor; flip above if it would overflow the viewport
    let top = tr.bottom + m;
    if (top + tipH > vh - m) top = Math.max(m, tr.top - tipH - m);
    // center on the anchor, clamped on-screen
    let left = tr.left + tr.width / 2 - tipW / 2;
    left = Math.max(m, Math.min(left, vw - tipW - m));
    layer.style.left = left + "px";
    layer.style.top = top + "px";
    layer.style.bottom = "auto";
    layer.style.transform = "none";
  }

  _flashError(msg) {
    patch(this.errorEl, [
      h(
        "wa-callout",
        { class: "hud-error-callout", key: "err", variant: "danger" },
        h("span", { slot: "start" }, icon("starved", { class: "err-icon" })),
        h("span", { class: "hud-error-text" }, msg),
      ),
    ]);
    this.errorEl.style.display = "";
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this.errorEl.style.display = "none";
      patch(this.errorEl, []);
    }, 2500);
  }

  showOfflineSummary(summary) {
    this.pendingOfflineSummary = summary;
    this.renderNow();
  }

  _emptySnap() {
    return {
      currencies: { gold: 0, research: 0, renown: 0 },
      rates: { goldRate: 0, researchRate: 0 },
      save: { status: "ok" },
      nodes: [],
      links: [],
      research: [],
      heroes: [],
      territories: [],
      expedition: null,
      buildMenu: {
        placeableMachines: [],
        unlockedRecipes: [],
        gathererResources: [],
      },
      gearTiers: [],
      recruitable: [],
      tutorial: { flags: {} },
      meta: { won: false, seenVictory: false },
    };
  }
}
