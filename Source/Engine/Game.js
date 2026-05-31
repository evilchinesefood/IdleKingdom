import { reduce } from "./Reducer.js";
import { build as buildSnapshot } from "./Snapshot.js";
import { solve } from "./Simulation/RateSolver.js";
import { applyTick } from "./Simulation/Tick.js";
import { applyOffline } from "./Simulation/Offline.js";
import { tryResolve } from "./Systems/ExpeditionSystem.js";
import { deserialize, SAVE_KEY } from "./Persistence/SaveManager.js";

export class Game {
  constructor({ content, clock }) {
    this.content = content;
    this.clock = clock;
    this.state = null;
    this.storage = null;
    this.listeners = new Set();
    this._pendingError = null;
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
    return summary;
  }

  dispatch(intent) {
    const withTime =
      intent && typeof intent === "object"
        ? { ...intent, _nowMs: this.clock.now() }
        : intent;
    const out = reduce(this.state, withTime, this.content);
    if (out.error !== undefined) {
      // keep old state; surface the error on the next emitted snapshot (flash-once)
      this._pendingError = out.error;
      this._emit();
      return { ok: false, error: out.error };
    }
    this.state = out.state;
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
    }
  }

  getState() {
    return this.state;
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
