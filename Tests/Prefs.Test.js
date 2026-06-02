import { describe, it, expect } from "./Runner.js";
import { loadPrefs, savePrefs, DEFAULT_PREFS } from "../Source/UI/Prefs.js";

function fakeStore(init) {
  const m = { ...(init || {}) };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
    _m: m,
  };
}

describe("Prefs", () => {
  it("returns defaults when storage is empty", () => {
    expect(loadPrefs(fakeStore())).toEqual(DEFAULT_PREFS);
  });
  it("round-trips saved prefs", () => {
    const s = fakeStore();
    savePrefs({ snapToGrid: false, alwaysShowRates: true }, s);
    expect(loadPrefs(s)).toEqual({
      snapToGrid: false,
      alwaysShowRates: true,
      soundDisabled: false,
    });
  });
  it("merges partial/unknown stored prefs over defaults", () => {
    const s = fakeStore({
      "idlekingdom-prefs": JSON.stringify({ alwaysShowRates: true }),
    });
    const p = loadPrefs(s);
    expect(p.alwaysShowRates).toBe(true);
    expect(p.snapToGrid).toBe(true); // default preserved
  });
  it("falls back to defaults on corrupt JSON", () => {
    const s = fakeStore({ "idlekingdom-prefs": "{not json" });
    expect(loadPrefs(s)).toEqual(DEFAULT_PREFS);
  });
});
