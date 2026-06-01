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

export function fmtCountdown(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function fmtCost(amount /*, currency */) {
  return fmtNum(amount);
}

export function affordClass(ok) {
  return ok ? "affordable" : "locked";
}
