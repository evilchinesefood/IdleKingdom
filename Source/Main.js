import { Game } from "./Engine/Game.js";
import { Clock } from "./Engine/Clock.js";
import { LocalStorageAdapter } from "./Engine/Persistence/LocalStorageAdapter.js";
import { serialize, SAVE_KEY } from "./Engine/Persistence/SaveManager.js";
import { App } from "./UI/App.js";

// Single-source content aggregate (includes gathererVariants); engine + UI share one definition.
import { content } from "./Engine/Content/Content.js";

const clock = new Clock();
const storage = new LocalStorageAdapter();
const game = new Game({ content, clock });

const offlineSummary = game.bootstrap(storage);
App.mount(document.getElementById("App"), game);
game.emitSnapshotForFrame(); // one initial full render from real state
if (offlineSummary && offlineSummary.appliedMs > 60_000)
  App.showOfflineSummary(offlineSummary);

// Passive display refresh: gold/research counters tick every 2s WITHOUT rebuilding
// the interactive panels. User actions (intents) and expedition resolution render
// immediately via Game._emit — this is what keeps buttons and dropdowns clickable.
setInterval(() => App.refreshHud(), 2000);

// --- Autosave (debounced ~1s; interval ~10s; visibility/pagehide immediate) ---
let saveStatus = "ok";
let saveTimer = null;
let lastSavedAt = 0;

function doSave() {
  saveTimer = null;
  // A reset clears the save then reloads; the reload fires pagehide/beforeunload
  // which would otherwise re-persist the still-in-memory state and undo the wipe.
  if (typeof window !== "undefined" && window.__IK_RESETTING) return;
  try {
    storage.set(SAVE_KEY, serialize(game.getState(), clock.now()));
    saveStatus = "ok";
    lastSavedAt = clock.now();
  } catch (err) {
    saveStatus = "failed";
  }
  // surface status to the HUD via a lightweight state hook
  const st = game.getState();
  if (st && st.meta) st.meta._saveStatus = saveStatus;
}

function requestSave(immediate) {
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    doSave();
    return;
  }
  if (saveTimer) return; // debounce: a save is already queued
  saveTimer = setTimeout(doSave, 1000);
}

setInterval(() => requestSave(false), 10_000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) requestSave(true);
});
window.addEventListener("pagehide", () => requestSave(true));
window.addEventListener("beforeunload", () => requestSave(true));

// --- Fixed-step RAF loop (§9.5) ---
let last = clock.now();
let acc = 0;
const STEP = 1000 / 20; // 20 Hz

function frame() {
  const now = clock.now();
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250; // tab-throttle guard; longer gaps reconciled by offline path
  acc += dt;
  while (acc >= STEP) {
    game.tick(STEP / 1000);
    acc -= STEP;
  }
  // No per-frame render: the sim accrues silently; the HUD refreshes on a 2s
  // interval and panels render on intents (see above). Rendering every frame
  // tore down interactive elements ~60x/sec, breaking all clicks.
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Optional offline shell (relative, never blocks load) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {});
  });
}
