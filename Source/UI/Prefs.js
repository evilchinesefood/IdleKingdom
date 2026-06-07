// UI preferences (NOT engine state) — persisted in localStorage under a separate key.
const KEY = "idlekingdom-prefs";
export const DEFAULT_PREFS = {
  snapToGrid: true,
  alwaysShowRates: true,
  soundDisabled: false,
  singleKeyShortcuts: true, // unmodified G/F — disable-able per WCAG 2.1.4
};

function store(s) {
  if (s) return s;
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function loadPrefs(storage) {
  const s = store(storage);
  if (!s) return { ...DEFAULT_PREFS };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...(p && typeof p === "object" ? p : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs, storage) {
  const s = store(storage);
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
