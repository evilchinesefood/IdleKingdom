// DOM-free display formatting helpers for the panels. Pure; unit-tested under node.
// Distinct from ../Render/Format.js (HUD's formatNumber/formatRate), which is re-exported here.

export { formatNumber, formatRate } from "../Render/Format.js";

function withSeparators(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtNum(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return withSeparators(String(Math.round(n)));
  const r = Math.round(n * 10) / 10;
  return String(r);
}

export function fmtRate(n) {
  if (!isFinite(n)) return "0/s";
  const r = Math.round(n * 100) / 100;
  return r + "/s";
}

// keep in sync with fmtCost in Source/Engine/Systems/EconomySystem.js (reject toasts
// must show the same number as the panel button for any given cost).
// Sync guard: Tests/CostFormat.Test.js
export function fmtCost(amount /*, currency */) {
  return fmtNum(amount);
}

export function affordClass(ok) {
  return ok ? "affordable" : "locked";
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
