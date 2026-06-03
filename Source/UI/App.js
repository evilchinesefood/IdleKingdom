import { Router } from "./Router.js";
import { Hud } from "./Hud.js";
import { GraphView } from "./GraphView.js";
import { patch, h } from "./Render/Dom.js";
import { icon } from "./Icons.js";
import { BuildMenu } from "./BuildMenu.js";
import { NodeInspector } from "./NodeInspector.js";
import { BuildingInspector } from "./BuildingInspector.js";
import { ResearchTree } from "./ResearchTree.js";
import { ExpeditionBoard } from "./ExpeditionBoard.js";
import { HeroPanel } from "./HeroPanel.js";
import { OfflineSummary } from "./OfflineSummary.js";
import { Tooltip } from "./Tooltip.js";
import { Victory } from "./Victory.js";
import { Settings } from "./Settings.js";
import { loadPrefs, savePrefs } from "./Prefs.js";
import * as Sound from "./Sound.js";
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
    this.dispatch = (intent) => {
      const res = this.game.dispatch(intent);
      this._playSfx(intent, res);
      return res;
    };

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
    this.selectedBuildingId = null;
    this.toolbarEl = null;
    this._pendingRename = null; // un-committed building-name keystrokes (flushed on deselect)
    this.buildUi = {
      selectedPaletteKind: null,
      setPalette: (k) => {
        Sound.play("click");
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
    document.addEventListener("keydown", (e) => this._handleGlobalKey(e));
    this.router.start();
    this._mountScreen();
  }

  // Global keyboard shortcuts (factory screen only). Undo/redo + clipboard work
  // off modifiers; Delete / arrows / Esc act on the current selection. A focused
  // graph node already handles its own arrows/Delete (GraphView._onNodeKey) and
  // calls preventDefault, so we bail on defaultPrevented to avoid double-acting.
  _handleGlobalKey(e) {
    if (this.activeScreen !== "factory") return;
    const t = e.target;
    const tag = (t && t.tagName ? t.tagName : "").toUpperCase();
    const typing =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "WA-INPUT" ||
      (t && t.isContentEditable);
    const mod = e.metaKey || e.ctrlKey;
    const k = (e.key || "").toLowerCase();
    const NUDGE = 40; // one grid cell

    if (mod && !typing) {
      if (k === "z" && !e.shiftKey) {
        if (this.game.canUndo()) this.game.undo();
        e.preventDefault();
        return;
      }
      if ((k === "z" && e.shiftKey) || k === "y") {
        if (this.game.canRedo()) this.game.redo();
        e.preventDefault();
        return;
      }
      if (k === "c") {
        // copy the current multi-selection (with upgrades) to the clipboard
        if (this.graphView && this.graphView.hasSelection())
          this.graphView._copySelection(true);
        e.preventDefault();
        return;
      }
      if (k === "v") {
        if (this.graphView) this.graphView._pasteSelection();
        e.preventDefault();
        return;
      }
      return;
    }

    if (typing || e.defaultPrevented) return;

    if (k === "escape") {
      if (this.graphView && this.graphView.getMode()) {
        this.graphView.cancelMode();
      } else {
        this.selectedNodeId = null;
        this.selectedBuildingId = null;
        if (this.graphView) {
          this.graphView.selectedId = null;
          this.graphView.selectedBuildingId = null;
          this.graphView.selectedLinkId = null;
          this.graphView.render(this.lastSnap || this._emptySnap());
        }
      }
      this.renderNow();
      e.preventDefault();
      return;
    }

    if (k === "delete" || k === "backspace") {
      if (this.selectedBuildingId) {
        this._pendingRename = null; // building is going away; drop any half-typed name
        this.dispatch({
          type: INTENT.UngroupBuilding,
          buildingId: this.selectedBuildingId,
        });
        this.selectedBuildingId = null;
        if (this.graphView) this.graphView.selectedBuildingId = null;
      } else if (this.selectedNodeId) {
        this.dispatch({ type: INTENT.RemoveNode, nodeId: this.selectedNodeId });
        this.selectedNodeId = null;
      } else if (this.graphView && this.graphView.selectedLinkId) {
        this.graphView._deleteLink(this.graphView.selectedLinkId);
      } else {
        return;
      }
      this.renderNow();
      e.preventDefault();
      return;
    }

    let dx = 0,
      dy = 0;
    if (k === "arrowleft") dx = -NUDGE;
    else if (k === "arrowright") dx = NUDGE;
    else if (k === "arrowup") dy = -NUDGE;
    else if (k === "arrowdown") dy = NUDGE;
    else return;

    if (this.selectedBuildingId) {
      this.dispatch({
        type: INTENT.MoveBuilding,
        buildingId: this.selectedBuildingId,
        delta: { dx, dy },
      });
      e.preventDefault();
    } else if (this.selectedNodeId) {
      const n = (this.lastSnap ? this.lastSnap.nodes : []).find(
        (x) => x.id === this.selectedNodeId,
      );
      if (n) {
        this.dispatch({
          type: INTENT.SetNodePos,
          nodeId: n.id,
          pos: { x: n.pos.x + dx, y: n.pos.y + dy },
        });
      }
      e.preventDefault();
    }
  }

  _applyPrefs() {
    this.hudEl.classList.toggle("show-rates", !!this.prefs.alwaysShowRates);
    Sound.setEnabled(!this.prefs.soundDisabled);
  }

  // Map an accepted/rejected intent to a sound effect (rejected -> error chime).
  _playSfx(intent, res) {
    if (!intent) return;
    if (res && res.ok === false) {
      // Only "can't afford / can't do that" failures get the error chime; benign
      // no-op rejects (empty Sell, re-selecting a value) stay silent.
      const ERR = new Set([
        "UpgradeNode",
        "CopyBuilding",
        "BuyResearch",
        "RecruitHero",
        "LevelUpHero",
        "StartExpedition",
        "PlaceNode",
      ]);
      if (ERR.has(intent.type)) Sound.play("error");
      return;
    }
    const SFX = {
      PlaceNode: "place",
      UpgradeNode: "upgrade",
      ConnectLink: "connect",
      RemoveNode: "delete",
      RemoveLink: "delete",
      CopyBuilding: "copy",
      CreateBuilding: "group",
      AddToBuilding: "group",
      UngroupBuilding: "group",
      RemoveFromBuilding: "group",
      StartExpedition: "expedition",
      BuyResearch: "research",
    };
    const s = SFX[intent.type];
    if (s) Sound.play(s);
  }

  openSettings() {
    Sound.play("click");
    this.showSettings = true;
    this.renderNow();
  }

  _mountScreen() {
    const route = this.router.current;
    if (this.activeScreen === route) {
      this.hud.render(this.lastSnap || this._emptySnap());
      return;
    }
    this._flushPendingRename(); // commit a half-typed name before leaving the factory
    Sound.play("click"); // tab/route switch
    this.activeScreen = route;
    this.screenEl.innerHTML = "";
    this.graphView = null;
    this.buildBarEl = null;
    this.selectedNodeId = null;
    this.selectedBuildingId = null;
    if (this.buildUi) this.buildUi.selectedPaletteKind = null; // re-enter the bar closed
    this.toolbarEl = null;

    if (route === "factory") {
      const canvas = document.createElement("div");
      canvas.className = "graph-host";
      this.screenEl.appendChild(canvas);
      this.screenEl.appendChild(this.panelEl);
      this.panelEl.innerHTML = "";
      this.toolbarEl = document.createElement("div");
      this.toolbarEl.className = "factory-tools";
      this.screenEl.appendChild(this.toolbarEl);
      this.buildBarEl = document.createElement("div");
      this.buildBarEl.className = "build-bar";
      this.screenEl.appendChild(this.buildBarEl);
      this.graphView = new GraphView(canvas, this.game, {
        onSelect: (id) => {
          this._flushPendingRename(); // commit a half-typed name before deselecting
          this.selectedNodeId = id;
          // always drop the building selection (node-select OR empty-canvas null)
          // so App and GraphView don't disagree about what's selected.
          this.selectedBuildingId = null;
          this.renderNow();
        },
        onSelectBuilding: (id) => {
          this._flushPendingRename();
          this.selectedBuildingId = id;
          this.selectedNodeId = null;
          this.renderNow();
        },
        onModeChange: () => this._renderToolbar(),
        snap: () => !!this.prefs.snapToGrid,
      });
      this._renderToolbar();
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

  // Passive refresh (~every 2s): update the currency counters AND re-render the
  // route's interactive panels so affordability-gated buttons (Upgrade, research
  // Buy, hero Level-up, expedition Launch) flip enabled/disabled as currencies
  // accrue — without the player having to deselect/reselect. The graph is NOT
  // redrawn here (it has no affordability state). Safe at this cadence because
  // the reconciler is keyed and Dom.js skips re-asserting value/open on a focused
  // control, so an open wa-select / mid-click button is preserved.
  refreshHud() {
    const snap = this.game.getSnapshot();
    this.lastSnap = snap;
    this.hud.render(snap);
    // Don't rebuild the interactive panels while the user is editing a control
    // there (an OPEN wa-select or a focused name input) — re-patching closes/
    // blurs it. Affordability refreshes on the next idle tick or any action.
    if (!this._panelHasFocus()) this._renderPanels(snap);
  }

  _panelHasFocus() {
    try {
      const a = document.activeElement;
      if (!a || a === document.body || a === document.documentElement)
        return false;
      const tag = (a.tagName || "").toUpperCase();
      if (
        tag === "WA-SELECT" ||
        tag === "WA-INPUT" ||
        tag === "INPUT" ||
        tag === "TEXTAREA"
      )
        return true;
      if (this.panelEl && this.panelEl.contains && this.panelEl.contains(a))
        return true;
      // route-owned panels (Research / Expeditions / Heroes) live in _routeHost,
      // not panelEl — without this, an open wa-select there is closed by the 2s
      // passive refresh (the "dropdown closes after ~1s" bug).
      if (
        this._routeHost &&
        this._routeHost.contains &&
        this._routeHost.contains(a)
      )
        return true;
      if (
        this.overlayEl &&
        this.overlayEl.contains &&
        this.overlayEl.contains(a)
      )
        return true;
      return false;
    } catch {
      return false;
    }
  }

  _renderScreen(snap) {
    if (this.activeScreen === "factory" && this.graphView)
      this.graphView.render(snap);
    this._renderPanels(snap);
  }

  _renderPanels(snap) {
    const route = this.activeScreen;
    if (route === "factory") {
      const inspector =
        this.selectedBuildingId != null
          ? BuildingInspector(
              snap,
              this.selectedBuildingId,
              this._buildingHandlers(),
            )
          : NodeInspector(snap, this.dispatch, this.selectedNodeId);
      const factoryPanels = [];
      if (inspector) factoryPanels.push(inspector); // null when nothing selected
      patch(this.panelEl, factoryPanels);
      // The build menu is its own bottom-centered bar (BuildMenu renders the
      // collapsed toggle itself, so patch it unconditionally).
      if (this.buildBarEl)
        patch(this.buildBarEl, [BuildMenu(snap, this.dispatch, this.buildUi)]);
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

  _buildingHandlers() {
    return {
      // live keystrokes -> transient (no dispatch, no re-render while focused)
      onRenameInput: (name) => {
        this._pendingRename = name;
      },
      // committed on blur/Enter
      onRename: (name) => this._commitRename(name),
      onUngroup: () => {
        this._pendingRename = null; // building is going away; nothing to commit
        this.dispatch({
          type: INTENT.UngroupBuilding,
          buildingId: this.selectedBuildingId,
        });
        this.selectedBuildingId = null;
        if (this.graphView) this.graphView.selectedBuildingId = null;
        this.renderNow();
      },
      onDelete: () => {
        this._pendingRename = null;
        this.dispatch({
          type: INTENT.DeleteBuilding,
          buildingId: this.selectedBuildingId,
        });
        this.selectedBuildingId = null;
        if (this.graphView) this.graphView.selectedBuildingId = null;
        this.renderNow();
      },
    };
  }

  // Commit any un-committed building-name keystrokes. Called before a deselect/
  // selection-change removes the name input — WA's wa-change can't fire once the
  // input is gone, so a click-away would otherwise drop the typed name.
  _flushPendingRename() {
    if (this._pendingRename != null) this._commitRename(this._pendingRename);
  }

  // Dispatch RenameBuilding only for a REAL change: non-empty, different from the
  // building's current name, and the building still exists. Keeps no-op renames
  // (cleared field, unchanged text, a deferred wa-change after a flush, or a stale
  // pending name for an ungrouped building) from polluting UNDOABLE history or
  // flashing a reject.
  _commitRename(name) {
    this._pendingRename = null;
    const id = this.selectedBuildingId;
    if (id == null) return;
    const nm = (name || "").trim();
    if (!nm) return;
    const b =
      this.lastSnap && (this.lastSnap.buildings || []).find((x) => x.id === id);
    if (!b || b.name === nm) return;
    this.dispatch({ type: INTENT.RenameBuilding, buildingId: id, name: nm });
  }

  // The factory toolbar: the Select tool (marquee → selection + floating bar).
  // The Build-menu toggle now lives in the bottom build bar.
  _renderToolbar() {
    if (!this.toolbarEl) return;
    const mode = this.graphView ? this.graphView.getMode() : null;
    const selecting = mode === "select";
    const selectLabel = selecting
      ? "Drag a box to select machines."
      : [icon("group"), " Select"];
    patch(this.toolbarEl, [
      h(
        "wa-button",
        {
          key: "tool-select",
          class: "tool-select",
          size: "s",
          variant: selecting ? "brand" : "neutral",
          appearance: selecting ? "accent" : "outlined",
          onclick: () => {
            if (!this.graphView) return;
            Sound.play("click");
            this.graphView.toggleSelectMode();
            this.renderNow();
          },
        },
        selectLabel,
      ),
    ]);
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
            // Stop autosave from re-writing the save on the reload's unload hooks.
            window.__IK_RESETTING = true;
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
  }

  _flashError(msg) {
    patch(this.errorEl, [
      h(
        "wa-callout",
        { class: "hud-error-callout", key: "err", variant: "danger" },
        h("span", { slot: "icon" }, icon("starved", { class: "err-icon" })),
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
      buildings: [],
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
