import { Router } from "./Router.js";
import { Hud } from "./Hud.js";
import { GraphView } from "./GraphView.js";

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

    this.hudEl = document.createElement("header");
    this.hudEl.className = "hud";
    this.screenEl = document.createElement("main");
    this.screenEl.className = "screen";
    this.errorEl = document.createElement("div");
    this.errorEl.className = "hud-error";
    this.errorEl.style.display = "none";

    this.root.innerHTML = "";
    this.root.appendChild(this.hudEl);
    this.root.appendChild(this.screenEl);
    this.root.appendChild(this.errorEl);

    this.hud = new Hud(this.hudEl, this.router);
    this.graphView = null;
    this.lastSnap = null;
    this.activeScreen = null;
    this._errorTimer = null;
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
      // already mounted; just refresh the HUD active-tab state
      this.hud.render(this.lastSnap || this._emptySnap());
      return;
    }
    this.activeScreen = route;
    this.screenEl.innerHTML = "";
    this.graphView = null;

    if (route === "factory") {
      this.graphView = new GraphView(this.screenEl, this.game, {
        onSelect: () => {},
      });
    } else {
      const ph = document.createElement("div");
      ph.className = "panel";
      ph.style.cssText = "position:static;margin:1rem;";
      ph.textContent = `${route} screen — built in a later phase`;
      this.screenEl.appendChild(ph);
    }
    const snap = this.lastSnap || this._emptySnap();
    this.hud.render(snap);
    if (this.lastSnap) this._renderScreen(this.lastSnap);
  }

  _onSnapshot(snap) {
    this.lastSnap = snap;
    this.hud.render(snap);
    this._renderScreen(snap);
    if (snap.lastError) this._flashError(snap.lastError);
  }

  _renderScreen(snap) {
    if (this.activeScreen === "factory" && this.graphView)
      this.graphView.render(snap);
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
    const g = summary.gained || { gold: 0, research: 0, renown: 0 };
    const modal = document.createElement("div");
    modal.className = "panel";
    modal.style.cssText =
      "position:fixed;inset:auto;left:50%;top:30%;transform:translateX(-50%);z-index:60;min-width:240px;";
    const exp =
      (summary.expeditionsResolved || [])
        .map((e) => e.territoryId)
        .join(", ") || "none";
    modal.innerHTML =
      `<h3>While you were away</h3>` +
      `<p>🪙 ${g.gold.toFixed(0)} · 📜 ${g.research.toFixed(0)} · 🛡️ ${g.renown.toFixed(0)}</p>` +
      `<p class="muted">Expeditions resolved: ${exp}</p>`;
    const close = document.createElement("button");
    close.textContent = "Onward";
    close.style.cssText =
      "min-height:44px;margin-top:0.5rem;border:1px solid var(--line);border-radius:8px;padding:0 1rem;background:var(--gold);";
    close.onclick = () => modal.remove();
    modal.appendChild(close);
    this.root.appendChild(modal);
  }

  _emptySnap() {
    return {
      currencies: { gold: 0, research: 0, renown: 0 },
      rates: { goldRate: 0, researchRate: 0 },
      save: { status: "ok" },
    };
  }
}
