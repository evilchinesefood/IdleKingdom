import { reduce } from "./Reducer.js";
import { build as buildSnapshot } from "./Snapshot.js";
import { solve } from "./Simulation/RateSolver.js";
import { applyTick } from "./Simulation/Tick.js";
import { applyOffline } from "./Simulation/Offline.js";
import { tryAdvanceSiege } from "./Systems/SiegeSystem.js";
import { deserialize, SAVE_KEY } from "./Persistence/SaveManager.js";
import { NewGame } from "./GameState.js";

// Structural/spatial edits the player expects Ctrl+Z to reverse. Time/economy
// intents (Sell) are deliberately excluded — rewinding them would thrash live
// currencies/timers. Research is excluded too: it's a progression commitment
// (it grants unlocks that other intents already depend on), so undoing it
// would desync downstream state.
const UNDOABLE = new Set([
  "PlaceNode",
  "ConnectLink",
  "RemoveNode",
  "RemoveLink",
  "SetNodePos",
  "UpgradeNode",
  "BulkUpgrade",
  "SetRecipe",
  "SetGathererResource",
  "SetStorageRule",
  "CreateBuilding",
  "MoveBuilding",
  "ResizeBuilding",
  "CopyBuilding",
  "UngroupBuilding",
  "DeleteBuilding",
  "RemoveFromBuilding",
  "AddToBuilding",
  "RenameBuilding",
]);
// Kept on JSON: for these plain-object parts (graph/unlocks/stockpile — finite
// numbers + short strings) V8's JSON fast path is at-or-faster than structuredClone
// on Node 22 (measured ~1.04x slower), so switching was a no-win. The hot-path win
// came instead from holding the dispatch-time undo entry by reference (see dispatch).
const clonePart = (o) => JSON.parse(JSON.stringify(o));

// Re-merge LIVE stockpiles (by node id) over a graph restored from an undo/redo
// snapshot. Stockpiles keep accruing at 20 Hz after an intent is recorded, so the
// snapshot's stock is stale; the live value is authoritative. Nodes the restore
// removed lose their stock (correct); nodes the restore resurrects keep the
// snapshot's stock (correct for un-delete — they have no live counterpart).
function mergeLiveStockpiles(restoredGraph, liveGraph) {
  const liveById = new Map(liveGraph.nodes.map((n) => [n.id, n]));
  for (const node of restoredGraph.nodes) {
    const live = liveById.get(node.id);
    if (live && live.stockpile) node.stockpile = clonePart(live.stockpile);
  }
}

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
    this.state = deserialize(raw, this.clock, this.content, storage); // NewGame on null/corrupt
    let summary;
    try {
      // Defense in depth: even a save that passes validate could throw here (e.g.
      // a solver edge case). Recover to a clean NewGame rather than re-throwing on
      // every reload — a thrown bootstrap is an unrecoverable boot loop.
      summary = applyOffline(this.state, this.content, this.clock.now());
      delete this.state._solved;
      this._ensureSolved();
    } catch (err) {
      console.warn("[Game] bootstrap failed; starting new game", err);
      this.state = NewGame(this.clock);
      delete this.state._solved;
      summary = applyOffline(this.state, this.content, this.clock.now());
      this._ensureSolved();
    }
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
      // prev is detached after this dispatch: reduce cloned it into out.state, ticks
      // mutate the clone (this.state) — safe to hold prev.graph/prev.unlocks by
      // reference (zero-clone dispatch); undo() clones at restore time. (redo entries
      // CAN'T do this — they snapshot the LIVE this.state, which keeps mutating.)
      this._undo.push({
        type: intent.type,
        graph: prev.graph,
        unlocks: prev.unlocks,
        currencyDelta: {
          gold: out.state.currencies.gold - prev.currencies.gold,
          research: out.state.currencies.research - prev.currencies.research,
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
    const restored = clonePart(entry.graph);
    mergeLiveStockpiles(restored, this.state.graph);
    this.state.graph = restored;
    this.state.unlocks = clonePart(entry.unlocks);
    this.state.currencies.gold -= entry.currencyDelta.gold;
    this.state.currencies.research -= entry.currencyDelta.research;
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
    const restored = clonePart(entry.graph);
    mergeLiveStockpiles(restored, this.state.graph);
    this.state.graph = restored;
    this.state.unlocks = clonePart(entry.unlocks);
    this.state.currencies.gold += entry.currencyDelta.gold;
    this.state.currencies.research += entry.currencyDelta.research;
    delete this.state._solved;
    this._ensureSolved();
    this._emit();
    return { ok: true };
  }

  tick(dtSeconds) {
    const solved = this._ensureSolved();
    applyTick(this.state, solved, dtSeconds);
    const fell = tryAdvanceSiege(this.state, this.content);
    if (fell.length) {
      // reclaim mutated unlocks outside the intent system — stale history would desync on undo
      this.clearHistory();
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
