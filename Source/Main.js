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
if (offlineSummary && offlineSummary.appliedMs > 60_000)
  App.showOfflineSummary(offlineSummary);

// --- Autosave (debounced ~1s; interval ~10s; visibility/pagehide immediate) ---
let saveStatus = "ok";
let saveTimer = null;
let lastSavedAt = 0;

function doSave() {
  saveTimer = null;
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
  game.emitSnapshotForFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Optional offline shell (relative, never blocks load) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {});
  });
}
