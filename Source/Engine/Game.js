import { reduce } from "./Reducer.js";
import { build as buildSnapshot } from "./Snapshot.js";
import { solve } from "./Simulation/RateSolver.js";
import { applyTick } from "./Simulation/Tick.js";
import { applyOffline } from "./Simulation/Offline.js";
import { tryResolve } from "./Systems/ExpeditionSystem.js";
import { deserialize, SAVE_KEY } from "./Persistence/SaveManager.js";

// Structural/spatial edits the player expects Ctrl+Z to reverse. Time/economy
// intents (Sell, expeditions, hero) are deliberately excluded — rewinding them
// would thrash live currencies/timers.
const UNDOABLE = new Set([
  "PlaceNode",
  "ConnectLink",
  "RemoveNode",
  "RemoveLink",
  "SetNodePos",
  "UpgradeNode",
  "SetRecipe",
  "SetGathererResource",
  "SetStorageRule",
  "CreateBuilding",
  "MoveBuilding",
  "ResizeBuilding",
  "CopyBuilding",
  "UngroupBuilding",
  "RenameBuilding",
  "BuyResearch",
]);
const clonePart = (o) => JSON.parse(JSON.stringify(o));

export class Game {
  constructor({ content, clock }) {
    this.content = content;
    this.clock = clock;
    this.state = null;
    this.storage = null;
    this.listeners = new Set();
    this._pendingError = null;
    this._undo = []; // history of {type, graph, unlocks, currencyDelta}, oldest→newest
    this._redo = [];
    this._histLimit = 50;
  }

  _ensureSolved() {
    if (!this.state._solved) {
      this.state._solved = solve(this.state, this.content);
    }
    return this.state._solved;
  }

  bootstrap(storage) {
    this.storage = storage;
    const raw = storage.get(SAVE_KEY);
    this.state = deserialize(raw, this.clock); // NewGame on null/corrupt
    const summary = applyOffline(this.state, this.content, this.clock.now());
    delete this.state._solved;
    this._ensureSolved();
    this._undo = []; // a freshly loaded/offline-reconciled game has no undo history
    this._redo = [];
    return summary;
  }

  dispatch(intent) {
    const withTime =
      intent && typeof intent === "object"
        ? { ...intent, _nowMs: this.clock.now() }
        : intent;
    const prev = this.state; // pre-action (live) state
    const out = reduce(prev, withTime, this.content);
    if (out.error !== undefined) {
      // keep old state; surface the error on the next emitted snapshot (flash-once)
      this._pendingError = out.error;
      this._emit();
      return { ok: false, error: out.error };
    }
    // Accepted. Any new action invalidates the redo stack; structural/spatial
    // edits also push an undo entry (graph+unlocks subtree + the currency delta
    // the action caused, so undoing refunds cost without rewinding accrual).
    this._redo.length = 0;
    if (intent && UNDOABLE.has(intent.type)) {
      this._undo.push({
        type: intent.type,
        graph: clonePart(prev.graph),
        unlocks: clonePart(prev.unlocks),
        currencyDelta: {
          gold: out.state.currencies.gold - prev.currencies.gold,
          research: out.state.currencies.research - prev.currencies.research,
          renown: out.state.currencies.renown - prev.currencies.renown,
        },
      });
      if (this._undo.length > this._histLimit) this._undo.shift();
    }
    this.state = out.state;
    this._ensureSolved();
    this._emit();
    return { ok: true };
  }

  canUndo() {
    return this._undo.length > 0;
  }
  canRedo() {
    return this._redo.length > 0;
  }
  clearHistory() {
    this._undo.length = 0;
    this._redo.length = 0;
  }

  undo() {
    if (this._undo.length === 0) return { ok: false };
    const entry = this._undo.pop();
    // stash current structure so redo can replay forward
    this._redo.push({
      type: entry.type,
      graph: clonePart(this.state.graph),
      unlocks: clonePart(this.state.unlocks),
      currencyDelta: entry.currencyDelta,
    });
    if (this._redo.length > this._histLimit) this._redo.shift();
    // restore the pre-action structure; reverse the action's currency delta on
    // top of LIVE currencies (keeps accrued gold/research, refunds the cost)
    this.state.graph = clonePart(entry.graph);
    this.state.unlocks = clonePart(entry.unlocks);
    this.state.currencies.gold -= entry.currencyDelta.gold;
    this.state.currencies.research -= entry.currencyDelta.research;
    this.state.currencies.renown -= entry.currencyDelta.renown;
    delete this.state._solved;
    this._ensureSolved();
    this._emit();
    return { ok: true };
  }

  redo() {
    if (this._redo.length === 0) return { ok: false };
    const entry = this._redo.pop();
    this._undo.push({
      type: entry.type,
      graph: clonePart(this.state.graph),
      unlocks: clonePart(this.state.unlocks),
      currencyDelta: entry.currencyDelta,
    });
    if (this._undo.length > this._histLimit) this._undo.shift();
    this.state.graph = clonePart(entry.graph);
    this.state.unlocks = clonePart(entry.unlocks);
    this.state.currencies.gold += entry.currencyDelta.gold;
    this.state.currencies.research += entry.currencyDelta.research;
    this.state.currencies.renown += entry.currencyDelta.renown;
    delete this.state._solved;
    this._ensureSolved();
    this._emit();
    return { ok: true };
  }

  tick(dtSeconds) {
    const solved = this._ensureSolved();
    applyTick(this.state, solved, dtSeconds);
    const resolved = tryResolve(this.state, this.content, this.clock.now());
    if (resolved) {
      delete this.state._solved; // reclaim unlocks change rates
      this._ensureSolved();
      this._emit(); // discrete event (reward/reclaim/victory) — render it now
    }
  }

  getState() {
    return this.state;
  }

  // Build the current snapshot WITHOUT notifying listeners — used by the
  // passive HUD refresh so counters can tick without a full re-render.
  getSnapshot() {
    return buildSnapshot(this.state, this._ensureSolved(), this.content, null);
  }

  onSnapshot(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const err = this._pendingError;
    this._pendingError = null; // flash-once: surfaced for exactly one snapshot
    const snap = buildSnapshot(
      this.state,
      this._ensureSolved(),
      this.content,
      err,
    );
    for (const fn of this.listeners) fn(snap);
  }

  emitSnapshotForFrame() {
    this._emit();
  }
}
