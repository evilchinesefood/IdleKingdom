const SVG_NS = "http://www.w3.org/2000/svg";
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;
export const SCALE_HARD_FLOOR = 0.02; // absolute minimum — prevents degenerate gesture math
const FIT_MARGIN = 0.9; // fraction of viewport the bounding box fills at fit scale

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

// min defaults to SCALE_MIN for back-compat; callers with a dynamic floor pass it explicitly.
export function clampScale(s, min = SCALE_MIN) {
  return Math.min(SCALE_MAX, Math.max(min, s));
}

// Axis-aligned bounding box of all nodes and building rects (graph coords).
// nodes: [{pos:{x,y}}], nodeW/nodeH: machine dims, buildings: [{rect:{x,y,w,h}}]
// Returns {x,y,w,h} or null on empty graph.
export function graphBounds(nodes, buildings, nodeW, nodeH) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes || []) {
    minX = Math.min(minX, n.pos.x);
    minY = Math.min(minY, n.pos.y);
    maxX = Math.max(maxX, n.pos.x + nodeW);
    maxY = Math.max(maxY, n.pos.y + nodeH);
  }
  for (const b of buildings || []) {
    const r = b.rect;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Scale that frames `bounds` inside a viewport of (viewportW x viewportH) with
// `pad` pixels of padding on each side. Never returns a value above 1.0 (no zoom-in),
// and never below SCALE_HARD_FLOOR (keeps gesture math safe).
export function fitScaleFor(bounds, viewportW, viewportH, pad) {
  if (
    !bounds ||
    bounds.w <= 0 ||
    bounds.h <= 0 ||
    viewportW <= 0 ||
    viewportH <= 0
  )
    return SCALE_MIN;
  const availW = viewportW - pad * 2;
  const availH = viewportH - pad * 2;
  if (availW <= 0 || availH <= 0) return SCALE_HARD_FLOOR;
  const s = Math.min(availW / bounds.w, availH / bounds.h);
  return Math.max(SCALE_HARD_FLOOR, Math.min(1.0, s));
}

// Dynamic zoom minimum: the lesser of SCALE_MIN and fitScale*FIT_MARGIN, but
// never below SCALE_HARD_FLOOR. Empty graph keeps SCALE_MIN.
export function dynamicMin(bounds, viewportW, viewportH) {
  if (!bounds) return SCALE_MIN;
  const fs = fitScaleFor(bounds, viewportW, viewportH, 40);
  return Math.max(SCALE_HARD_FLOOR, Math.min(SCALE_MIN, fs * FIT_MARGIN));
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
// scaleMin defaults to SCALE_MIN for back-compat; pass a dynamic floor for fit-zoom paths.
export function zoomAt(v, anchorX, anchorY, factor, scaleMin = SCALE_MIN) {
  const newScale = clampScale(v.scale * factor, scaleMin);
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

// Control points for the link curve — shared source of truth for draw + hit-test.
export function linkBezier(from, to) {
  const dx = Math.max(40, (to.x - from.x) * 0.5);
  return { c1: { x: from.x + dx, y: from.y }, c2: { x: to.x - dx, y: to.y } };
}

// Build a "M x1 y1 C ..." cubic path connecting two graph-space points (left->right flow curve).
export function linkPath(from, to) {
  const { c1, c2 } = linkBezier(from, to);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}
