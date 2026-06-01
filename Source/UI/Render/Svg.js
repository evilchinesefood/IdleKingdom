const SVG_NS = "http://www.w3.org/2000/svg";
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;

export function svg(tag, props = {}, children = [], doc = document) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el[k.toLowerCase()] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  }
  return el;
}

// View transform: graph point -> screen = graph*scale + translate.
export function makeView() {
  return { scale: 1, tx: 0, ty: 0 };
}

export function clampScale(s) {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
}

export function graphToScreen(v, gx, gy) {
  return { x: gx * v.scale + v.tx, y: gy * v.scale + v.ty };
}

export function screenToGraph(v, sx, sy) {
  return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
}

export function panBy(v, dxPx, dyPx) {
  return { scale: v.scale, tx: v.tx + dxPx, ty: v.ty + dyPx };
}

// Zoom by `factor` while keeping the graph point under (anchorX, anchorY) fixed on screen.
export function zoomAt(v, anchorX, anchorY, factor) {
  const newScale = clampScale(v.scale * factor);
  const g = screenToGraph(v, anchorX, anchorY);
  return {
    scale: newScale,
    tx: anchorX - g.x * newScale,
    ty: anchorY - g.y * newScale,
  };
}

// Snap a graph-space point to the nearest `grid` multiple (DOM-free, testable).
export function snapToGrid(pos, grid) {
  return {
    x: Math.round(pos.x / grid) * grid,
    y: Math.round(pos.y / grid) * grid,
  };
}

// Build a "M x1 y1 C ..." cubic path connecting two graph-space points (left->right flow curve).
export function linkPath(from, to) {
  const dx = Math.max(40, (to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}
