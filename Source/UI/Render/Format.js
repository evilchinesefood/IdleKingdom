// HUD number/rate formatter. fmtCost (panel costs) lives in Source/UI/Format/Format.js
// and Source/Engine/Systems/EconomySystem.js — sync guard: Tests/CostFormat.Test.js.
const UNITS = [
  { v: 1e9, s: "B" },
  { v: 1e6, s: "M" },
  { v: 1e3, s: "K" },
];

export function formatNumber(n) {
  if (!Number.isFinite(n) || n < 1e-3) return "0";
  for (const u of UNITS) {
    if (n >= u.v) return (n / u.v).toFixed(1) + u.s;
  }
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

export function formatRate(n) {
  if (!Number.isFinite(n) || n < 1e-3) return "0/s";
  for (const u of UNITS) {
    if (n >= u.v) return (n / u.v).toFixed(1) + u.s + "/s";
  }
  return n.toFixed(1) + "/s";
}
