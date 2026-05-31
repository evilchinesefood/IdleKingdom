import { Router } from "./Router.js";
import { Hud } from "./Hud.js";
import { GraphView } from "./GraphView.js";
import { patch } from "./Render/Dom.js";
import { BuildMenu } from "./BuildMenu.js";
import { NodeInspector } from "./NodeInspector.js";
import { ResearchTree } from "./ResearchTree.js";
import { ExpeditionBoard } from "./ExpeditionBoard.js";
import { HeroPanel } from "./HeroPanel.js";
import { OfflineSummary } from "./OfflineSummary.js";
import { Tooltip } from "./Tooltip.js";
import { Victory } from "./Victory.js";
import { victoryReady } from "./Logic/Selectors.js";
import { INTENT } from "../Engine/Intents.js";

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
    this.errorEl.style.display = "none";

    this.root.innerHTML = "";
    this.root.appendChild(this.hudEl);
    this.root.appendChild(this.screenEl);
    this.root.appendChild(this.overlayEl);
    this.root.appendChild(this.errorEl);

    this.hud = new Hud(this.hudEl, this.router);
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
    this.router.onChange(() => this._mountScreen());
    this.game.onSnapshot((snap) => this._onSnapshot(snap));
    this.router.start();
    this._mountScreen();
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
      this.graphView = new GraphView(canvas, this.game, {
        onSelect: (id) => {
          this.selectedNodeId = id;
          this.renderNow();
        },
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
    const tip = Tooltip(snap, this.dispatch);
    if (tip) children.push(tip);
    patch(this.overlayEl, children);
  }

  _flashError(msg) {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = "";
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this.errorEl.style.display = "none";
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
