import {
  svg,
  makeView,
  graphToScreen,
  screenToGraph,
  linkPath,
  linkBezier,
  snapToGrid,
} from "./Render/Svg.js";
import { GraphInput } from "./GraphInput.js";
import { INTENT } from "../Engine/Intents.js";
import { iconName } from "./Icons.js";
import { cap } from "./Format/Format.js";
import { RESOURCES } from "../Engine/Content/Resources.js";

const NODE_W = 120,
  NODE_H = 64,
  PORT_R = 8,
  HIT_R = 22,
  GRID = 40;

// Pure affine delta from the view baked into the last full draw (`d`) to the live
// view (`v`). Both views map graph->screen as screen = graph*scale + offset, so a
// point drawn at Pd = g*d.scale + d.offset must move to Pv = g*v.scale + v.offset.
// Eliminating g gives T(P) = k*P + b with k = v.scale/d.scale and
// b = v.offset - d.offset*k. SVG "translate(bx,by) scale(k)" applies exactly that.
// DOM-free + testable.
export function deltaTransform(d, v) {
  const k = v.scale / d.scale;
  const bx = v.tx - d.tx * k;
  const by = v.ty - d.ty * k;
  return { k, bx, by, str: `translate(${bx} ${by}) scale(${k})` };
}

const LOD_SCALE = 0.5; // below this zoom: no icon FO, no gear FO, no port circles
const CULL_MARGIN = 150; // screen px of off-viewport slack kept rendered

// Level-of-detail tier for the current zoom. "far" nodes skip the expensive
// foreignObject icon, the animated gear, and the port circles. DOM-free.
export function lodTier(scale) {
  return scale < LOD_SCALE ? "far" : "full";
}

// Badge precedence (max > low > off > none) shared by nodeSig (the rebuild key)
// and _buildNodeEl (the renderer) so the two can never drift. DOM-free.
function nodeBadge(n) {
  return n.atCapacity && n.working
    ? "max"
    : n.starved
      ? n.working
        ? "low"
        : "off"
      : "none";
}

// Structure-affecting render signature for a node. A node element is rebuilt
// ONLY when this changes; everything else (transform, class, aria, sub-rate
// text, cap-fill width) is updated in place each draw. DOM-free.
export function nodeSig(n, tier, armed, icon) {
  const badge = nodeBadge(n);
  return `${tier}|${n.kind}|${icon}|${n.working ? 1 : 0}|${badge}|${armed ? 1 : 0}`;
}

// The screen viewport (+marginPx slack on every side) mapped into graph space.
// Returns {x0,y0,x1,y1} in graph units. DOM-free.
export function cullRectFor(view, hostW, hostH, marginPx) {
  const a = screenToGraph(view, -marginPx, -marginPx);
  const b = screenToGraph(view, hostW + marginPx, hostH + marginPx);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

// AABB overlap of a node (NODE_W x NODE_H at pos) with a cull rect. DOM-free.
export function nodeInRect(pos, vp) {
  return (
    pos.x + NODE_W >= vp.x0 &&
    pos.x <= vp.x1 &&
    pos.y + NODE_H >= vp.y0 &&
    pos.y <= vp.y1
  );
}

// Conservative segment-vs-rect test (segment AABB vs rect) for links whose
// endpoints are both off-screen but whose span crosses the view. DOM-free.
export function segmentIntersectsRect(a, b, vp) {
  return (
    Math.max(a.x, b.x) >= vp.x0 &&
    Math.min(a.x, b.x) <= vp.x1 &&
    Math.max(a.y, b.y) >= vp.y0 &&
    Math.min(a.y, b.y) <= vp.y1
  );
}

// Cached setters: skip the DOM call when the value is unchanged (the common
// case for retained elements — most attrs are stable between draws).
function setAttr(el, k, v) {
  const c = el._attrCache || (el._attrCache = {});
  const s = String(v);
  if (c[k] === s) return;
  c[k] = s;
  el.setAttribute(k, s);
}
function setText(el, s) {
  if (el._textCache === s) return;
  el._textCache = s;
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(document.createTextNode(s));
  el.textContent = s; // keep the shim's simple readers working
}
function swapChild(parent, fresh, old) {
  if (typeof parent.replaceChild === "function")
    parent.replaceChild(fresh, old);
  else {
    parent.removeChild(old);
    parent.appendChild(fresh);
  }
}

export class GraphView {
  constructor(host, game, opts = {}) {
    this.host = host;
    this.game = game;
    this.view = makeView();
    this.selectedId = null;
    this.armedPort = null; // {nodeId, dir} for touch tap-port-then-port
    this.snap = null;
    this.onSelect = opts.onSelect || (() => {});
    this.snapEnabled = opts.snap || (() => false);
    this._grabOffset = null;
    this.selectedLinkId = null;

    this.svgEl = svg("svg", { class: "graph-svg" });
    // All layers live under ONE root <g> so an active pan/zoom gesture can apply a
    // single delta transform (task 9 fast path) instead of rebuilding everything.
    this.layerRoot = svg("g", {});
    this.layerBuildings = svg("g", {}); // building outlines/labels, behind all
    this.layerLinks = svg("g", {});
    this.layerNodes = svg("g", {});
    this.layerOverlay = svg("g", {}); // select box + copy ghost, on top
    this.layerRoot.appendChild(this.layerBuildings);
    this.layerRoot.appendChild(this.layerLinks);
    this.layerRoot.appendChild(this.layerNodes);
    this.layerRoot.appendChild(this.layerOverlay);
    this.svgEl.appendChild(this.layerRoot);
    this.host.appendChild(this.svgEl);

    // task 9: view captured at the last full _draw + gesture/coalesce state.
    this._drawnView = { ...this.view };
    this._gesturing = false;
    this._rafId = null;
    this._wheelTimer = null;
    this._hostRect = null; // task 10: cached host rect, invalidated on resize/gesture-end

    // Retained render: keyed element entries reused across draws. An entry is
    // rebuilt only when its structural sig changes; everything else is updated
    // in place (see nodeSig). Culled entries stay in the map (DOM-detached).
    this._nodeEls = new Map(); // id -> {g, subText, capFill, sig}
    this._hintEl = null; // empty-canvas hint (present only when 0 nodes)

    // Multi-selection set + floating action bar (HTML, anchored to the host).
    this.selNodes = new Set();
    this.selBuildings = new Set();
    this._grpMembers = new Set(); // node ids inside a selected group (highlight)
    this._clipboard = null; // {nodes:[{kind,level,recipeId,resourceId,resourceIds,dx,dy}], links:[{fromIdx,toIdx,resourceId}]}
    this._paste = null; // {gx,gy} live paste-ghost top-left while in paste mode
    this.actionBarEl = document.createElement("div");
    this.actionBarEl.className = "sel-actions";
    this.actionBarEl.style.display = "none";
    this.host.appendChild(this.actionBarEl);

    // Building tool state
    this._mode = null; // "select" | "copy" | null
    this.selectedBuildingId = null;
    this._selectBox = null; // live select rect (graph coords)
    this._buildingDrag = null; // {id, dx, dy} live move override
    this._bGrab = null;
    this._resize = null; // {id, handle, orig, rect} live edge-resize override
    this._copy = null; // {buildingId, gx, gy} live copy-ghost top-left
    this.onSelectBuilding = opts.onSelectBuilding || (() => {});
    this.onSelectionChange = opts.onSelectionChange || (() => {}); // multi-select set changed
    this.onModeChange = opts.onModeChange || (() => {});

    this.input = new GraphInput(this.svgEl, {
      getView: () => this.view,
      setView: (v) => {
        this.view = v;
      },
      hitPort: (gx, gy) => this._hitPort(gx, gy),
      hitNode: (gx, gy) => this._hitNode(gx, gy),
      isSelected: (id) => this.selectedId === id,
      onNodeGrab: (id, gx, gy) => this._grab(id, gx, gy),
      onNodeDrag: (id, gx, gy) => this._dragNode(id, gx, gy),
      onNodeDrop: (id, gx, gy) => this._dropNode(id, gx, gy),
      onConnect: (from, to) => this._connect(from, to),
      onConnectMove: (fromId, gx, gy) => this._connectMove(fromId, gx, gy),
      onConnectEnd: () => this._connectEnd(),
      onTapPort: (nodeId, dir) => this._tapPort(nodeId, dir),
      onSelect: (id) => this._select(id),
      hitLink: (gx, gy) => this.hitLink(gx, gy),
      hitLinkDelete: (gx, gy) => this.hitLinkDelete(gx, gy),
      onSelectLink: (id) => this._selectLink(id),
      onDeleteLink: (id) => this._deleteLink(id),
      getMode: () => this._mode,
      hitBuilding: (gx, gy) => this.hitBuilding(gx, gy),
      isGrouped: (id) => this.isGrouped(id),
      onSelectBuilding: (id) => this._selectBuilding(id),
      onBuildingGrab: (id, gx, gy) => this._grabBuilding(id, gx, gy),
      onBuildingDrag: (id, gx, gy) => this._dragBuilding(id, gx, gy),
      onBuildingDrop: (id, gx, gy) => this._dropBuilding(id, gx, gy),
      hitBuildingHandle: (gx, gy) => this.hitBuildingHandle(gx, gy),
      onResizeGrab: (id, handle) => this._grabResize(id, handle),
      onResizeDrag: (gx, gy) => this._dragResize(gx, gy),
      onResizeDrop: () => this._dropResize(),
      onSelectBoxMove: (rect) => {
        this._selectBox = rect;
        this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
      },
      onSelectBox: (rect) => this._onSelectBox(rect),
      onCopyMove: (gx, gy) => this._copyMove(gx, gy),
      onCopyPlace: (gx, gy) => this._copyPlace(gx, gy),
      onToggleSelect: (id, isBuilding) => this._toggleSelect(id, isBuilding),
      onPasteMove: (gx, gy) => this._pasteMove(gx, gy),
      onPastePlace: (gx, gy) => this._pastePlace(gx, gy),
      onPointersCleared: () => {
        this._clearTransient();
        this._endGesture(); // pan/pinch over -> full redraw + reset transform
      },
      onViewChange: (kind) => this._onViewChange(kind),
    });
    this._pendingLink = null; // {fromId, gx, gy} live mouse drag-connect preview

    // task 10: invalidate the cached host rect when the canvas resizes (guarded for
    // the headless shim, where ResizeObserver is absent).
    if (typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver(() => {
        this._hostRect = null;
      });
      this._ro.observe(this.host);
    }
  }

  // Graph-space coordinate near the center of the current viewport (for BuildMenu spawnPos).
  centerGraphPos() {
    const r = this.svgEl.getBoundingClientRect();
    const g = screenToGraph(this.view, r.width / 2, r.height / 2);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  }

  _connectMove(fromId, gx, gy) {
    this._pendingLink = { fromId, gx, gy };
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  _connectEnd() {
    this._pendingLink = null;
    this._draw();
  }

  // task 9 fast path: during an active pan/zoom gesture, don't rebuild the SVG.
  // Apply a single affine delta (drawnView -> live view) to the layer root and
  // coalesce the eventual full redraw. `kind` is "wheel" (no pointers -> debounce
  // the end) or "gesture" (pan/pinch -> end on pointer clear).
  _onViewChange(kind) {
    this._gesturing = true;
    this._applyDeltaTransform();
    if (kind === "wheel") {
      if (this._wheelTimer != null) clearTimeout(this._wheelTimer);
      this._wheelTimer = setTimeout(() => {
        this._wheelTimer = null;
        this._endGesture();
      }, 150);
    }
  }

  // Set the drawnView->liveView delta transform on the layer root so already-drawn
  // elements track the gesture without a rebuild. Guarded for the headless shim.
  _applyDeltaTransform() {
    const t = deltaTransform(this._drawnView, this.view);
    if (this.layerRoot && this.layerRoot.setAttribute)
      this.layerRoot.setAttribute("transform", t.str);
    // task 10: shift the floating action bar by the same delta instead of
    // recomputing its anchor (which would force a reflow every gesture frame).
    if (this._barAnchor && this.actionBarEl && this.actionBarEl.style) {
      const left = t.k * this._barAnchor.left + t.bx;
      const top = t.k * this._barAnchor.top + t.by;
      this.actionBarEl.style.left = left + "px";
      this.actionBarEl.style.top = top + "px";
    }
  }

  // Gesture over: drop the delta transform and do one full redraw (rAF-coalesced;
  // recaptures drawnView), then invalidate the cached host rect.
  _endGesture() {
    if (this._wheelTimer != null) {
      clearTimeout(this._wheelTimer);
      this._wheelTimer = null;
    }
    this._gesturing = false;
    if (this.layerRoot && this.layerRoot.removeAttribute)
      this.layerRoot.removeAttribute("transform");
    this._hostRect = null;
    this._requestDraw();
  }

  // rAF-coalesce a full redraw (guarded for the headless shim, where rAF is absent).
  _requestDraw() {
    if (typeof requestAnimationFrame !== "function") {
      this._draw();
      return;
    }
    if (this._rafId != null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._draw();
    });
  }

  // Toggle which link's flow label is revealed (touch-friendly alternative to hover).
  // A revealed link may coexist with a selected node by design: reveal is a UI
  // overlay orthogonal to inspector selection; only _select clears the link.
  _selectLink(id) {
    this.selectedLinkId = this.selectedLinkId === id ? null : id;
    this._draw();
  }

  // Hit-test the delete "×" of the currently-revealed link (graph coords). Lets
  // GraphInput route a tap there to DELETE instead of toggling the reveal off —
  // the pointer-captured SVG never lets the ×'s own onclick fire.
  hitLinkDelete(gx, gy) {
    if (!this.snap || this.selectedLinkId == null) return null;
    const l = this.snap.links.find((x) => x.id === this.selectedLinkId);
    if (!l) return null;
    const from = this._nodeAt(l.from),
      to = this._nodeAt(l.to);
    if (!from || !to) return null;
    const fp = this._pos(from),
      tp = this._pos(to);
    // mirror the × placement in _draw (graph-space midpoint + 6px screen offset)
    const mx = (fp.x + NODE_W + tp.x) / 2;
    const my =
      (fp.y + NODE_H / 2 + (tp.y + NODE_H / 2)) / 2 + 6 / this.view.scale;
    const r = 16 / this.view.scale;
    return Math.hypot(gx - mx, gy - my) <= r ? l.id : null;
  }

  _deleteLink(id) {
    this.game.dispatch({ type: INTENT.RemoveLink, linkId: id });
    this.selectedLinkId = null;
    this._draw();
  }

  // Graph-space hit test against the rendered link Bézier (GraphInput passes graph
  // coords). Samples the SAME cubic linkPath draws (shared linkBezier control pts)
  // so a tap on the visible curve mid-span hits even on vertically-offset links.
  hitLink(gx, gy) {
    if (!this.snap) return null;
    const v = this.view;
    // Sample the curve in SCREEN space so the hit path matches the one _draw
    // renders. linkBezier's `max(40, …)` clamp is not scale-invariant, so
    // sampling in graph space would desync from the drawn curve at any zoom != 1.
    const sx = gx * v.scale + v.tx,
      sy = gy * v.scale + v.ty;
    const tol = 14;
    for (const l of this.snap.links) {
      const from = this._nodeAt(l.from),
        to = this._nodeAt(l.to);
      if (!from || !to) continue;
      const fp = this._pos(from),
        tp = this._pos(to);
      const a = graphToScreen(v, fp.x + NODE_W, fp.y + NODE_H / 2);
      const b = graphToScreen(v, tp.x, tp.y + NODE_H / 2);
      const { c1, c2 } = linkBezier(a, b);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          u = 1 - t;
        const w0 = u * u * u,
          w1 = 3 * u * u * t,
          w2 = 3 * u * t * t,
          w3 = t * t * t;
        const px = w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x;
        const py = w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y;
        if (Math.hypot(sx - px, sy - py) <= tol) return l.id;
      }
    }
    return null;
  }

  render(snap) {
    this.snap = snap;
    this._draw();
  }

  // Wired in the culling task; null = render everything (also the headless path).
  _cullRect() {
    return null;
  }

  // Nodes that must render even off-viewport: live interaction targets.
  _nodeAlwaysVisible(n, focusedId) {
    return (
      n.id === this.selectedId ||
      n.id === focusedId ||
      (this._dragPos && !!this._dragPos[n.id]) ||
      (this.armedPort && this.armedPort.nodeId === n.id)
    );
  }

  // id -> node Map, built once per snapshot identity (task 11). Replaces the
  // O(links×nodes) linear Array.find used in _draw, _pos and the hit-tests.
  _nodeMap() {
    if (this._nodeMapSnap !== this.snap) {
      this._nodeMapCache = new Map(
        (this.snap.nodes || []).map((n) => [n.id, n]),
      );
      this._nodeMapSnap = this.snap;
    }
    return this._nodeMapCache;
  }

  _nodeAt(id) {
    return this._nodeMap().get(id);
  }
  _outPort(n) {
    return { x: n.pos.x + NODE_W, y: n.pos.y + NODE_H / 2 };
  }
  _inPort(n) {
    return { x: n.pos.x, y: n.pos.y + NODE_H / 2 };
  }

  _hitPort(gx, gy) {
    if (!this.snap) return null;
    for (const n of this.snap.nodes) {
      // Barracks have no out port (troops are unroutable) — don't hit-test it.
      if (n.kind !== "barracks") {
        const o = this._outPort(n);
        if (Math.hypot(gx - o.x, gy - o.y) <= HIT_R)
          return { nodeId: n.id, dir: "out" };
      }
      const i = this._inPort(n);
      if (Math.hypot(gx - i.x, gy - i.y) <= HIT_R)
        return { nodeId: n.id, dir: "in" };
    }
    return null;
  }
  _hitNode(gx, gy) {
    if (!this.snap) return null;
    for (const n of this.snap.nodes) {
      if (
        gx >= n.pos.x &&
        gx <= n.pos.x + NODE_W &&
        gy >= n.pos.y &&
        gy <= n.pos.y + NODE_H
      )
        return n.id;
    }
    return null;
  }

  // Capture the cursor-to-node-origin offset at drag start so grabbing a corner
  // doesn't snap the node center to the cursor (no jump).
  _grab(id, gx, gy) {
    const n = this._nodeAt(id);
    const p = n ? this._pos(n) : { x: gx, y: gy };
    this._grabOffset = { x: gx - p.x, y: gy - p.y };
  }

  _dragNode(id, gx, gy) {
    const n = this._nodeAt(id);
    if (!n) return;
    // snapshot nodes are frozen; nudge a local override for smooth live redraw
    const off = this._grabOffset || { x: NODE_W / 2, y: NODE_H / 2 };
    this._dragPos = this._dragPos || {};
    this._dragPos[id] = { x: gx - off.x, y: gy - off.y };
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  // On drag pointer-up: persist the new pos via SetNodePos (snapped to grid when
  // the pref is on), then clear the local override so draw + hit-test both read
  // the (now updated) snapshot n.pos.
  _dropNode(id, gx, gy) {
    const off = this._grabOffset || { x: NODE_W / 2, y: NODE_H / 2 };
    let pos = (this._dragPos && this._dragPos[id]) || {
      x: gx - off.x,
      y: gy - off.y,
    };
    if (this.snapEnabled()) pos = snapToGrid(pos, GRID);
    this.game.dispatch({ type: INTENT.SetNodePos, nodeId: id, pos });
    if (this._dragPos) delete this._dragPos[id];
    this._grabOffset = null;
  }

  _connect(fromId, toId) {
    const from = this._nodeAt(fromId),
      to = this._nodeAt(toId);
    if (!from || !to) return;
    const resourceId = this._inferResource(from);
    if (!resourceId) return;
    this.game.dispatch({
      type: INTENT.ConnectLink,
      from: fromId,
      to: toId,
      resourceId,
    });
    this.armedPort = null;
    this._pendingLink = null;
  }

  // touch: first tap-out arms; second tap-in completes
  _tapPort(nodeId, dir) {
    if (nodeId == null) {
      this.armedPort = null;
      this._draw();
      return;
    }
    if (!this.armedPort && dir === "out") {
      this.armedPort = { nodeId, dir };
      this._draw();
      return;
    }
    if (this.armedPort && dir === "in" && nodeId !== this.armedPort.nodeId) {
      this._connect(this.armedPort.nodeId, nodeId);
      this.armedPort = null;
      this._draw();
    }
  }

  // The machine's display icon reflects WHAT it handles, not just its kind: a
  // gatherer shows its resource, a crafter its recipe output, a storage its first
  // held type, and a sink/converter (market, scholar) the resource it's moving most
  // (top flow in node.draw). Only when there's no resource signal does it fall back
  // to the kind icon.
  _nodeIcon(n) {
    if (n.kind === "gatherer" && n.resourceId) return iconName(n.resourceId);
    if (
      n.kind === "smelter" ||
      n.kind === "workshop" ||
      n.kind === "barracks"
    ) {
      const r = n.recipeId && this.game.content.recipes[n.recipeId];
      if (r && r.output) return iconName(r.output);
    }
    if (n.kind === "storage" && n.resourceIds && n.resourceIds.length)
      return iconName(n.resourceIds[0]);
    if (n.kind === "storage") return iconName("storage"); // empty room keeps its icon
    // Sinks/converters (market, scholar): reflect the resource they handle most
    // (top units/s in node.draw); fall back to the kind icon when nothing flows.
    const d = n.draw;
    if (d) {
      let best = null,
        bestV = 1e-9;
      for (const k in d)
        if (d[k] > bestV) {
          bestV = d[k];
          best = k;
        }
      if (best) return iconName(best);
    }
    return iconName(n.kind);
  }

  _inferResource(fromNode) {
    // Barracks consume gear into troops, which aren't routable (no downstream
    // consumer) — they have an IN port only and must never source a link.
    if (fromNode.kind === "barracks") return null;
    if (fromNode.resourceId) return fromNode.resourceId; // gatherer
    if (fromNode.recipeId)
      return this.game.content.recipes[fromNode.recipeId]?.output ?? null;
    // storage holds an array; an outbound link carries its first held type
    // (multi-type rooms route their primary resource via a drawn port link).
    if (Array.isArray(fromNode.resourceIds) && fromNode.resourceIds.length)
      return fromNode.resourceIds[0];
    return null;
  }

  _select(id) {
    this.selectedId = id;
    this.selectedBuildingId = null; // selecting a node clears any building selection
    this._clearSelectionSets(); // single-inspect and multi-select never coexist
    this.onSelect(id);
    this.selectedLinkId = null;
    this._draw();
  }

  // Empty the multi-selection sets (no redraw).
  _clearSelectionSets() {
    this.selNodes.clear();
    this.selBuildings.clear();
  }

  // task 27: drop any selection (single + multi) whose id is absent from the fresh
  // snapshot — e.g. after undo/redo or a bulk delete removed the selected items.
  // Returns true if anything was cleared. No redraw (the caller re-renders).
  reconcileSelection(snap) {
    if (!snap) return false;
    const nodeIds = new Set((snap.nodes || []).map((n) => n.id));
    const bldgIds = new Set((snap.buildings || []).map((b) => b.id));
    let changed = false;
    if (this.selectedId != null && !nodeIds.has(this.selectedId)) {
      this.selectedId = null;
      changed = true;
    }
    if (
      this.selectedBuildingId != null &&
      !bldgIds.has(this.selectedBuildingId)
    ) {
      this.selectedBuildingId = null;
      changed = true;
    }
    if (this.selectedLinkId != null) {
      const linkIds = new Set((snap.links || []).map((l) => l.id));
      if (!linkIds.has(this.selectedLinkId)) {
        this.selectedLinkId = null;
        changed = true;
      }
    }
    for (const id of [...this.selNodes])
      if (!nodeIds.has(id)) {
        this.selNodes.delete(id);
        changed = true;
      }
    for (const id of [...this.selBuildings])
      if (!bldgIds.has(id)) {
        this.selBuildings.delete(id);
        changed = true;
      }
    return changed;
  }

  hasSelection() {
    return this.selNodes.size + this.selBuildings.size > 0;
  }

  // Ctrl/Cmd+click toggle: add/remove an item from the multi-selection.
  _toggleSelect(id, isBuilding) {
    // Building a multi-selection drops any single-group focus (panel/handles).
    this.selectedBuildingId = null;
    // Fold a prior single-selected node (from a plain click) INTO the set so the
    // first machine is counted too — otherwise Ctrl+clicking N machines after a
    // click yields a set of N-1 (and 2 clicks never reaches the 2+ bulk gate).
    if (this.selectedId != null) {
      this.selNodes.add(this.selectedId);
      this.selectedId = null;
    }
    const set = isBuilding ? this.selBuildings : this.selNodes;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this._draw();
    // App renders the bulk (same-type) panel from the new set.
    if (this.onSelectionChange) this.onSelectionChange();
  }

  // resolve a node's effective pos: a live drag-nudge (single node) or a live
  // building-move (whole subtree) overrides the snapshot pos.
  _pos(n) {
    if (this._dragPos && this._dragPos[n.id]) return this._dragPos[n.id];
    if (
      this._buildingDrag &&
      n.building &&
      this._dragSubtreeSet().has(n.building)
    )
      return {
        x: n.pos.x + this._buildingDrag.dx,
        y: n.pos.y + this._buildingDrag.dy,
      };
    return n.pos;
  }

  // The dragged building's subtree id set, computed once per drag (task 12) rather
  // than rebuilding a buildings Map for every node/building each _draw frame.
  _dragSubtreeSet() {
    if (!this._buildingDrag) return new Set();
    if (!this._dragSubtree)
      this._dragSubtree = this._subtreeBuildingIds(this._buildingDrag.id);
    return this._dragSubtree;
  }

  // The building `id` plus every group nested under it via `children` (snapshot,
  // cycle-guarded, includes id). Used to move/redraw a whole subtree as one unit.
  _subtreeBuildingIds(id) {
    const byId = new Map((this.snap.buildings || []).map((b) => [b.id, b]));
    const out = new Set([id]);
    const walk = (cur) => {
      const b = byId.get(cur);
      if (!b || !Array.isArray(b.children)) return;
      for (const cid of b.children)
        if (!out.has(cid)) {
          out.add(cid);
          walk(cid);
        }
    };
    walk(id);
    return out;
  }

  // ---- Buildings ---------------------------------------------------------

  getMode() {
    return this._mode;
  }

  toggleSelectMode() {
    this._mode = this._mode === "select" ? null : "select";
    this._copy = null;
    this._paste = null; // a stale paste ghost must not survive entering select mode
    this._selectBox = null;
    this._draw();
    this.onModeChange();
  }

  startCopy(buildingId, withUpgrades = true) {
    const b = (this.snap.buildings || []).find((x) => x.id === buildingId);
    if (!b) return;
    this._mode = "copy";
    this._copy = {
      buildingId,
      withUpgrades,
      gx: b.rect.x + GRID,
      gy: b.rect.y + GRID,
    };
    this._draw();
    this.onModeChange();
  }

  cancelMode() {
    this._mode = null;
    this._copy = null;
    this._paste = null;
    this._selectBox = null;
    this._draw();
    this.onModeChange();
  }

  // A gesture ended without a clean drop (e.g. interrupted by a 2nd pinch finger):
  // drop any live move/box override so it doesn't persist into later renders.
  // Copy mode (a deliberate tool state) is intentionally left alone.
  _clearTransient() {
    if (this._buildingDrag || this._bGrab || this._selectBox || this._resize) {
      this._buildingDrag = null;
      this._bGrab = null;
      this._dragSubtree = null;
      this._selectBox = null;
      this._resize = null;
      this._draw();
    }
  }

  isGrouped(id) {
    const n = this._nodeAt(id);
    return !!(n && n.building);
  }

  _buildingRect(b) {
    if (this._resize && this._resize.id === b.id) return this._resize.rect;
    // a live building-move nudges the dragged group AND every nested descendant.
    if (this._buildingDrag && this._dragSubtreeSet().has(b.id))
      return {
        x: b.rect.x + this._buildingDrag.dx,
        y: b.rect.y + this._buildingDrag.dy,
        w: b.rect.w,
        h: b.rect.h,
      };
    return b.rect;
  }

  // The 8 resize handles of a rect (graph coords).
  _handlePoints(r) {
    return {
      nw: { x: r.x, y: r.y },
      n: { x: r.x + r.w / 2, y: r.y },
      ne: { x: r.x + r.w, y: r.y },
      e: { x: r.x + r.w, y: r.y + r.h / 2 },
      se: { x: r.x + r.w, y: r.y + r.h },
      s: { x: r.x + r.w / 2, y: r.y + r.h },
      sw: { x: r.x, y: r.y + r.h },
      w: { x: r.x, y: r.y + r.h / 2 },
    };
  }

  // Hit-test the selected building's resize handles (graph coords).
  hitBuildingHandle(gx, gy) {
    if (!this.snap || this.selectedBuildingId == null) return null;
    const b = this.snap.buildings.find((x) => x.id === this.selectedBuildingId);
    if (!b) return null;
    const pts = this._handlePoints(this._buildingRect(b));
    const tol = 14 / this.view.scale;
    for (const key in pts) {
      if (Math.hypot(gx - pts[key].x, gy - pts[key].y) <= tol)
        return { buildingId: b.id, handle: key };
    }
    return null;
  }

  _grabResize(id, handle) {
    const b = (this.snap.buildings || []).find((x) => x.id === id);
    if (!b) return;
    this._resize = { id, handle, orig: { ...b.rect }, rect: { ...b.rect } };
  }

  _dragResize(gx, gy) {
    if (!this._resize) return;
    const o = this._resize.orig;
    const h = this._resize.handle;
    const MIN = 60;
    let left = o.x,
      top = o.y,
      right = o.x + o.w,
      bottom = o.y + o.h;
    if (h.includes("w")) left = Math.min(gx, right - MIN);
    if (h.includes("e")) right = Math.max(gx, left + MIN);
    if (h.includes("n")) top = Math.min(gy, bottom - MIN);
    if (h.includes("s")) bottom = Math.max(gy, top + MIN);
    this._resize.rect = { x: left, y: top, w: right - left, h: bottom - top };
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  _dropResize() {
    const r = this._resize;
    this._resize = null;
    if (!r) {
      this._draw();
      return;
    }
    const rect = r.rect;
    // re-capture: machines fully inside the new box (reducer drops any that are
    // already claimed by another building).
    const ids = (this.snap.nodes || [])
      .filter(
        (n) =>
          n.pos.x >= rect.x &&
          n.pos.x + NODE_W <= rect.x + rect.w &&
          n.pos.y >= rect.y &&
          n.pos.y + NODE_H <= rect.y + rect.h,
      )
      .map((n) => n.id);
    this.game.dispatch({
      type: INTENT.ResizeBuilding,
      buildingId: r.id,
      rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      nodeIds: ids,
    });
  }

  // Hit the building's outline BAND or its name label (graph coords). Interior
  // taps fall through to the machines/links/pan beneath. With nested groups a
  // parent border can overlap a child's; return the SMALLEST (innermost) match so
  // children stay selectable.
  hitBuilding(gx, gy) {
    if (!this.snap) return null;
    const band = 12 / this.view.scale;
    const lblH = 22 / this.view.scale;
    let best = null,
      bestArea = Infinity;
    for (const b of this.snap.buildings || []) {
      const r = this._buildingRect(b);
      const onLabel =
        gx >= r.x && gx <= r.x + r.w && gy >= r.y - lblH && gy < r.y;
      const onX = gx >= r.x - band && gx <= r.x + r.w + band;
      const onY = gy >= r.y - band && gy <= r.y + r.h + band;
      const inX = gx >= r.x + band && gx <= r.x + r.w - band;
      const inY = gy >= r.y + band && gy <= r.y + r.h - band;
      const onBand = onX && onY && !(inX && inY);
      if (onLabel || onBand) {
        const area = r.w * r.h;
        if (area < bestArea) {
          bestArea = area;
          best = b.id;
        }
      }
    }
    return best;
  }

  _selectBuilding(id) {
    this.selectedBuildingId = id;
    this.selectedId = null;
    this.selectedLinkId = null;
    this._clearSelectionSets();
    // Selecting a group ALSO puts it in the multi-selection set, so the floating
    // action bar (Group/Copy/Paste/Delete All) appears and the group's member
    // machines light up — while selectedBuildingId still drives the slim
    // Rename/Ungroup panel, the resize handles, and drag-as-a-unit.
    this.selBuildings.add(id);
    this.onSelect(null); // close any node inspector
    this.onSelectBuilding(id);
    this._draw();
  }

  _grabBuilding(id, gx, gy) {
    this._buildingDrag = { id, dx: 0, dy: 0 };
    this._bGrab = { gx, gy };
    this._dragSubtree = null; // recomputed once on first _pos/_buildingRect of this drag
  }

  _dragBuilding(id, gx, gy) {
    if (!this._buildingDrag || !this._bGrab) return;
    this._buildingDrag.dx = gx - this._bGrab.gx;
    this._buildingDrag.dy = gy - this._bGrab.gy;
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  _dropBuilding(id, gx, gy) {
    const d = this._buildingDrag;
    this._buildingDrag = null;
    this._bGrab = null;
    this._dragSubtree = null;
    if (!d) {
      this._draw();
      return;
    }
    // A tap (negligible SCREEN movement) just keeps the selection — don't move.
    // Threshold in screen px so it's zoom-independent (matches GraphInput's tap).
    if (Math.hypot(d.dx, d.dy) * this.view.scale < 6) {
      this._draw();
      return;
    }
    let dx = d.dx,
      dy = d.dy;
    if (this.snapEnabled()) {
      dx = Math.round(dx / GRID) * GRID;
      dy = Math.round(dy / GRID) * GRID;
    }
    if (dx === 0 && dy === 0) {
      this._draw();
      return;
    }
    this.game.dispatch({
      type: INTENT.MoveBuilding,
      buildingId: id,
      delta: { dx, dy },
    });
  }

  // Finalize a select-box: REPLACE the selection set with every node fully inside
  // the rect and every building whose rect intersects it. Does NOT group/delete —
  // those are now floating-bar actions. Then leave select mode (bar appears).
  _onSelectBox(rect) {
    this._selectBox = null;
    this._mode = null;
    this.onModeChange();
    if (!this.snap || rect.w < 8 || rect.h < 8) {
      this._draw();
      return;
    }
    // A fresh marquee replaces any prior single selection (node or group), so a
    // stale selectedId can't be re-injected by a later Ctrl+click fold.
    this.selectedId = null;
    this.selectedBuildingId = null;
    this.selNodes.clear();
    this.selBuildings.clear();
    for (const n of this.snap.nodes) {
      // Skip already-grouped machines: an enclosed building is represented in
      // selBuildings, so adding its members to selNodes would make "Group" a no-op
      // (the reducer rejects a group of only-already-grouped nodes).
      if (
        !n.building &&
        n.pos.x >= rect.x &&
        n.pos.x + NODE_W <= rect.x + rect.w &&
        n.pos.y >= rect.y &&
        n.pos.y + NODE_H <= rect.y + rect.h
      )
        this.selNodes.add(n.id);
    }
    for (const b of this.snap.buildings || []) {
      if (
        rect.x < b.rect.x + b.rect.w &&
        rect.x + rect.w > b.rect.x &&
        rect.y < b.rect.y + b.rect.h &&
        rect.y + rect.h > b.rect.y
      )
        this.selBuildings.add(b.id);
    }
    this._draw();
    // App renders the bulk (same-type) panel from the new set.
    if (this.onSelectionChange) this.onSelectionChange();
  }

  _copyMove(gx, gy) {
    if (!this._copy) return;
    this._copy.gx = gx;
    this._copy.gy = gy;
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  _copyPlace(gx, gy) {
    const c = this._copy;
    this._mode = null;
    this._copy = null;
    this.onModeChange();
    if (!c) {
      this._draw();
      return;
    }
    const b = (this.snap.buildings || []).find((x) => x.id === c.buildingId);
    if (!b) {
      this._draw();
      return;
    }
    let dx = gx - b.rect.x,
      dy = gy - b.rect.y;
    if (this.snapEnabled()) {
      dx = Math.round(dx / GRID) * GRID;
      dy = Math.round(dy / GRID) * GRID;
    }
    this.game.dispatch({
      type: INTENT.CopyBuilding,
      buildingId: c.buildingId,
      offset: { dx, dy },
      withUpgrades: c.withUpgrades !== false,
    });
  }

  // ---- Multi-selection bbox + bar actions --------------------------------

  // Union bbox (graph coords) of the current selection (nodes + buildings), or null.
  _selectionBBox() {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of this.selNodes) {
      const n = this._nodeAt(id);
      if (!n) continue;
      minX = Math.min(minX, n.pos.x);
      minY = Math.min(minY, n.pos.y);
      maxX = Math.max(maxX, n.pos.x + NODE_W);
      maxY = Math.max(maxY, n.pos.y + NODE_H);
    }
    for (const id of this.selBuildings) {
      const b = (this.snap.buildings || []).find((x) => x.id === id);
      if (!b) continue;
      minX = Math.min(minX, b.rect.x);
      minY = Math.min(minY, b.rect.y);
      maxX = Math.max(maxX, b.rect.x + b.rect.w);
      maxY = Math.max(maxY, b.rect.y + b.rect.h);
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // All member node ids: the selected loose nodes plus every node in a selected building.
  _selectionMemberIds() {
    const ids = new Set(this.selNodes);
    // A selected group contributes ALL its machines, recursively through nested
    // children (so copying a parent group copies the whole unit, not just its
    // direct members). _subtreeBuildingIds includes the building itself.
    for (const bid of this.selBuildings) {
      const subtree = this._subtreeBuildingIds(bid);
      for (const n of this.snap.nodes || [])
        if (n.building && subtree.has(n.building)) ids.add(n.id);
    }
    return [...ids];
  }

  // Node ids that belong to a SELECTED group (its whole subtree). Drives the
  // group-membership highlight so it's clear which machines a selected group owns.
  _selectedGroupMembers() {
    const ids = new Set();
    if (!this.snap) return ids;
    for (const bid of this.selBuildings) {
      const subtree = this._subtreeBuildingIds(bid);
      for (const n of this.snap.nodes || [])
        if (n.building && subtree.has(n.building)) ids.add(n.id);
    }
    return ids;
  }

  // Bar action: group the selected loose nodes AND selected groups into a new
  // parent building (the selected groups become its nested children).
  _groupSelection() {
    if (this.selNodes.size === 0 && this.selBuildings.size === 0) return;
    const PAD = 14;
    let x = Infinity,
      y = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const id of this.selNodes) {
      const n = this._nodeAt(id);
      if (!n) continue;
      x = Math.min(x, n.pos.x - PAD);
      y = Math.min(y, n.pos.y - PAD);
      right = Math.max(right, n.pos.x + NODE_W + PAD);
      bottom = Math.max(bottom, n.pos.y + NODE_H + PAD);
    }
    for (const id of this.selBuildings) {
      const b = (this.snap.buildings || []).find((x2) => x2.id === id);
      if (!b) continue;
      x = Math.min(x, b.rect.x - PAD);
      y = Math.min(y, b.rect.y - PAD);
      right = Math.max(right, b.rect.x + b.rect.w + PAD);
      bottom = Math.max(bottom, b.rect.y + b.rect.h + PAD);
    }
    if (x === Infinity) return;
    if (this.snapEnabled()) {
      x = Math.floor(x / GRID) * GRID;
      y = Math.floor(y / GRID) * GRID;
      right = Math.ceil(right / GRID) * GRID;
      bottom = Math.ceil(bottom / GRID) * GRID;
    }
    const nodeIds = [...this.selNodes];
    const children = [...this.selBuildings];
    this.game.dispatch({
      type: INTENT.CreateBuilding,
      nodeIds,
      children,
      rect: { x, y, w: right - x, h: bottom - y },
    });
    this._clearSelectionSets();
    // select the new parent: it's the building that owns nodeIds[0] (if any loose
    // nodes) or lists children[0] as a child.
    const made = (this.game.getSnapshot().buildings || []).find((b) =>
      nodeIds.length
        ? b.nodeIds.includes(nodeIds[0])
        : (b.children || []).includes(children[0]),
    );
    if (made) this._selectBuilding(made.id);
    else this._draw();
  }

  // Bar action: copy the selection to the clipboard (relative offsets + internal
  // links). `withUpgrades` keeps levels; otherwise members reset to level 1.
  _copySelection(withUpgrades) {
    const memberIds = this._selectionMemberIds();
    if (memberIds.length === 0) return;
    const members = memberIds.map((id) => this._nodeAt(id)).filter(Boolean);
    if (members.length === 0) return;
    let minX = Infinity,
      minY = Infinity;
    for (const n of members) {
      minX = Math.min(minX, n.pos.x);
      minY = Math.min(minY, n.pos.y);
    }
    const idxOf = new Map();
    const nodes = members.map((n, i) => {
      idxOf.set(n.id, i);
      const out = {
        kind: n.kind,
        level: withUpgrades ? n.level : 1,
        recipeId: n.recipeId || null,
        resourceId: n.resourceId || null,
        dx: n.pos.x - minX,
        dy: n.pos.y - minY,
      };
      if (Array.isArray(n.resourceIds)) out.resourceIds = [...n.resourceIds];
      return out;
    });
    const member = new Set(memberIds);
    const links = [];
    for (const l of this.snap.links) {
      if (member.has(l.from) && member.has(l.to))
        links.push({
          fromIdx: idxOf.get(l.from),
          toIdx: idxOf.get(l.to),
          resourceId: l.resourceId,
        });
    }
    this._clipboard = { nodes, links };
    this._draw();
  }

  // Bar action: enter paste mode; a ghost follows the pointer until placed.
  _pasteSelection() {
    if (!this._clipboard) return;
    const c = this.centerGraphPos();
    this._mode = "paste";
    this._paste = { gx: c.x, gy: c.y };
    this._draw();
    this.onModeChange();
  }

  _pasteMove(gx, gy) {
    if (!this._paste) return;
    this._paste.gx = gx;
    this._paste.gy = gy;
    this._requestDraw(); // per-pointermove: coalesce to one redraw per frame
  }

  _pastePlace(gx, gy) {
    this._mode = null;
    this._paste = null;
    this.onModeChange();
    if (!this._clipboard) {
      this._draw();
      return;
    }
    let at = { x: gx, y: gy };
    if (this.snapEnabled()) at = snapToGrid(at, GRID);
    this.game.dispatch({
      type: INTENT.PasteNodes,
      nodes: this._clipboard.nodes,
      links: this._clipboard.links,
      at,
    });
    this._draw(); // clipboard persists for repeat paste
  }

  // Bar action: delete the selection — whole buildings, then any loose nodes.
  _deleteSelection() {
    for (const bid of this.selBuildings)
      this.game.dispatch({ type: INTENT.DeleteBuilding, buildingId: bid });
    const deleted = new Set();
    for (const bid of this.selBuildings) {
      const b = (this.snap.buildings || []).find((x) => x.id === bid);
      if (b) for (const nid of b.nodeIds) deleted.add(nid);
    }
    for (const nid of this.selNodes)
      if (!deleted.has(nid))
        this.game.dispatch({ type: INTENT.RemoveNode, nodeId: nid });
    this._clearSelectionSets();
    this.selectedBuildingId = null;
    // task 27: a single-selected node/link may also have been removed by the bulk
    // delete — reconcile against the fresh snapshot so no stale id survives.
    if (this.game && this.game.getSnapshot)
      this.reconcileSelection(this.game.getSnapshot());
    if (this.onSelect) this.onSelect(null); // close the slim panel for a deleted group
    this._draw();
  }

  // Build + position the floating action bar above the selection bbox. Re-run
  // every _draw so it follows pan/zoom/selection. Guarded for the headless shim
  // (no getBoundingClientRect → skip positioning).
  _renderActionBar() {
    const bar = this.actionBarEl;
    if (!bar) return;
    if (!this.hasSelection() || this._mode === "paste") {
      bar.style.display = "none";
      this._barAnchor = null;
      this._barSig = null;
      return;
    }
    const bbox = this._selectionBBox();
    if (!bbox) {
      bar.style.display = "none";
      this._barAnchor = null;
      this._barSig = null;
      return;
    }
    // task 23: only tear down + rebuild the buttons when the SET changes. A plain
    // re-draw (pan/zoom/tick) keeps the same buttons, so reusing them avoids churn
    // and a dropped focus on the bar.
    const showGroup = this.selNodes.size > 0 || this.selBuildings.size >= 2;
    const sig = `${showGroup ? "G" : ""}C${this._clipboard ? "P" : ""}D`;
    if (sig !== this._barSig || bar.childNodes.length === 0) {
      // capture which button (by label) had focus so we can restore it post-rebuild
      let focusLabel = null;
      try {
        const a = document.activeElement;
        if (a && a.parentNode === bar && a.textContent)
          focusLabel = a.textContent;
      } catch {}
      while (bar.firstChild) bar.removeChild(bar.firstChild);
      const mkBtn = (label, fn) => {
        const b = document.createElement("button");
        b.className = "sel-act";
        b.textContent = label;
        b.onclick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          fn();
        };
        bar.appendChild(b);
      };
      // Group is available when grouping would nest at least one thing: any loose
      // node, or 2+ selected groups (one lone group has nothing to nest under).
      if (showGroup) mkBtn("Group", () => this._groupSelection());
      mkBtn("Copy", () => this._copySelection(true));
      if (this._clipboard) mkBtn("Paste", () => this._pasteSelection());
      mkBtn("Delete All", () => this._deleteSelection());
      this._barSig = sig;
      if (focusLabel) {
        for (const b of bar.childNodes)
          if (b.textContent === focusLabel && typeof b.focus === "function") {
            b.focus();
            break;
          }
      }
    }

    bar.style.display = "flex";
    const cx = bbox.x + bbox.w / 2;
    const screen = graphToScreen(this.view, cx, bbox.y);
    // task 10: cache the host rect (it only changes on resize/gesture-end, where
    // we null it) so we don't read-after-write thrash layout on every draw.
    let hostRect = this._hostRect,
      barRect = null;
    try {
      if (!hostRect && this.host.getBoundingClientRect)
        hostRect = this._hostRect = this.host.getBoundingClientRect();
      if (bar.getBoundingClientRect) barRect = bar.getBoundingClientRect();
    } catch {}
    if (!hostRect || !barRect || !barRect.width) return; // headless: skip positioning
    const barW = barRect.width,
      barH = barRect.height;
    let left = screen.x - barW / 2;
    left = Math.max(4, Math.min(left, hostRect.width - barW - 4));
    let top = screen.y - barH - 8;
    if (top < 4) {
      const bottom = graphToScreen(this.view, cx, bbox.y + bbox.h).y;
      top = bottom + 8;
    }
    bar.style.left = left + "px";
    bar.style.top = top + "px";
    // Record the anchor so the gesture fast path (task 9) can translate the bar by
    // the same delta instead of re-reading layout each frame.
    this._barAnchor = { left, top };
  }

  _draw() {
    if (!this.snap) return;
    const v = this.view;
    // buildings (behind links + nodes; always visible)
    this._replace(
      this.layerBuildings,
      (this.snap.buildings || []).map((b) => this._drawBuilding(b, v)),
    );
    // links
    const linkEls = this.snap.links
      .map((l) => {
        const from = this._nodeAt(l.from),
          to = this._nodeAt(l.to);
        if (!from || !to) return null;
        const fp = this._pos(from),
          tp = this._pos(to);
        const a = graphToScreen(v, fp.x + NODE_W, fp.y + NODE_H / 2);
        const b = graphToScreen(v, tp.x, tp.y + NODE_H / 2);
        const starved = l.fedPct != null && l.fedPct < 0.999;
        const g = svg("g", { class: "link-g" });
        g.appendChild(
          svg("path", {
            class: starved ? "link-path starved" : "link-path",
            d: linkPath(a, b),
          }),
        );
        // wide transparent hit path so the thin link is the visual tap target
        // (reveal now routes through GraphInput -> onSelectLink on a tap).
        g.appendChild(
          svg("path", {
            class: "link-hit",
            d: linkPath(a, b),
          }),
        );
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 };
        // Label + delete affordance only render when this link is revealed.
        if (l.id === this.selectedLinkId) {
          const resName =
            (RESOURCES[l.resourceId] && RESOURCES[l.resourceId].display) ||
            l.resourceId;
          g.appendChild(
            svg(
              "text",
              {
                class: "link-label show",
                x: mid.x,
                y: mid.y,
                "text-anchor": "middle",
              },
              [`${resName} · ${(l.flow ?? 0).toFixed(2)}/s`],
            ),
          );
          // link-delete affordance: a small × at the midpoint (its own hit target
          // so it doesn't interfere with the port drag-connect gesture).
          // Delete routes through GraphInput.hitLinkDelete -> onDeleteLink: the
          // SVG is pointer-captured, so an onclick here would never fire (task 22).
          const del = svg("g", { class: "link-delete-g" });
          del.appendChild(
            svg("circle", {
              class: "link-delete-hit",
              cx: mid.x,
              cy: mid.y + 12,
              r: 13,
            }),
          );
          del.appendChild(
            svg(
              "text",
              {
                class: "link-delete",
                x: mid.x,
                y: mid.y + 16,
                "text-anchor": "middle",
              },
              ["×"],
            ),
          );
          g.appendChild(del);
        } else {
          // subtle, always-on affordance that the link is interactive (touch)
          g.appendChild(
            svg("circle", {
              class: "link-dot",
              cx: mid.x,
              cy: mid.y + 6,
              r: 3,
            }),
          );
        }
        return g;
      })
      .filter(Boolean);

    // pending drag-connect preview: source output port -> live pointer
    if (this._pendingLink) {
      const from = this._nodeAt(this._pendingLink.fromId);
      if (from) {
        const fp = this._pos(from);
        const a = graphToScreen(v, fp.x + NODE_W, fp.y + NODE_H / 2);
        const b = graphToScreen(v, this._pendingLink.gx, this._pendingLink.gy);
        linkEls.push(svg("path", { class: "link-pending", d: linkPath(a, b) }));
      }
    }
    this._replace(this.layerLinks, linkEls);

    // nodes (retained: rebuild only on sig change; in-place updates otherwise)
    this._grpMembers = this._selectedGroupMembers(); // members of any selected group
    const refocus = this._activeNodeId(); // a sig-rebuild still destroys focus
    const tier = lodTier(v.scale);
    const vp = this._cullRect(); // Task 4 wires this; returns null until then
    const seen = new Set();
    for (const n of this.snap.nodes) {
      if (
        vp &&
        !this._nodeAlwaysVisible(n, refocus) &&
        !nodeInRect(this._pos(n), vp)
      )
        continue;
      seen.add(n.id);
      const armed = !!(this.armedPort && this.armedPort.nodeId === n.id);
      const nTier = n.id === this.selectedId ? "full" : tier;
      const icon = this._nodeIcon(n);
      const sig = nodeSig(n, nTier, armed, icon);
      let entry = this._nodeEls.get(n.id);
      if (!entry || entry.sig !== sig) {
        const fresh = this._buildNodeEl(n, nTier, armed, icon);
        fresh.sig = sig;
        if (entry && entry.g.parentNode === this.layerNodes)
          swapChild(this.layerNodes, fresh.g, entry.g);
        this._nodeEls.set(n.id, fresh);
        entry = fresh;
      }
      if (entry.g.parentNode !== this.layerNodes)
        this.layerNodes.appendChild(entry.g);
      this._updateNodeEl(entry, n, v);
    }
    // detach culled nodes (keep entries) and delete departed ones entirely
    const liveIds = this._nodeMap();
    for (const [id, entry] of this._nodeEls) {
      if (seen.has(id)) continue;
      if (entry.g.parentNode === this.layerNodes)
        this.layerNodes.removeChild(entry.g);
      if (!liveIds.has(id)) this._nodeEls.delete(id);
    }
    // empty-canvas hint: present exactly when there are no nodes at all
    if (this.snap.nodes.length === 0) {
      if (!this._hintEl) this._hintEl = this._emptyHint();
      if (this._hintEl.parentNode !== this.layerNodes)
        this.layerNodes.appendChild(this._hintEl);
    } else if (this._hintEl && this._hintEl.parentNode === this.layerNodes) {
      this.layerNodes.removeChild(this._hintEl);
    }
    if (refocus != null) this._restoreFocus(refocus);

    // overlay: live select box + copy ghost (on top of everything)
    this._replace(this.layerOverlay, this._drawOverlay(v));

    // task 9: a full draw bakes the live view into every element — record it so the
    // next gesture frame can compute its delta transform against this baseline.
    this._drawnView = { scale: v.scale, tx: v.tx, ty: v.ty };
    // A redraw landing MID-gesture (e.g. a snapshot from an expedition resolving
    // during a pan) just rebaked the live view, so any gesture delta still on the
    // layer root is stale — clear it or everything double-transforms.
    if (this.layerRoot && this.layerRoot.removeAttribute)
      this.layerRoot.removeAttribute("transform");

    // floating action bar follows the selection bbox
    this._renderActionBar();
  }

  _drawBuilding(b, v) {
    const r = this._buildingRect(b);
    const a = graphToScreen(v, r.x, r.y);
    let bCls = "building";
    // nested child groups get a subtler outline so the parent reads as the unit.
    const isChild = (this.snap.buildings || []).some((p) =>
      (p.children || []).includes(b.id),
    );
    if (isChild) bCls += " nested";
    if (b.id === this.selectedBuildingId) bCls += " selected";
    else if (this.selBuildings.has(b.id)) bCls += " multiselect";
    const g = svg("g", { class: bCls });
    g.appendChild(
      svg("rect", {
        class: "building-box",
        x: a.x,
        y: a.y,
        width: r.w * v.scale,
        height: r.h * v.scale,
        rx: 6,
      }),
    );
    g.appendChild(
      svg(
        "text",
        { class: "building-label", x: a.x + 6, y: a.y - 6 / v.scale },
        [b.name],
      ),
    );
    return g;
  }

  _drawOverlay(v) {
    const els = [];
    if (this._selectBox) {
      const a = graphToScreen(v, this._selectBox.x, this._selectBox.y);
      els.push(
        svg("rect", {
          class: "select-box",
          x: a.x,
          y: a.y,
          width: this._selectBox.w * v.scale,
          height: this._selectBox.h * v.scale,
        }),
      );
    }
    if (this._copy) {
      const b = (this.snap.buildings || []).find(
        (x) => x.id === this._copy.buildingId,
      );
      if (b) {
        const dx = this._copy.gx - b.rect.x,
          dy = this._copy.gy - b.rect.y;
        const a = graphToScreen(v, b.rect.x + dx, b.rect.y + dy);
        els.push(
          svg("rect", {
            class: "building-ghost",
            x: a.x,
            y: a.y,
            width: b.rect.w * v.scale,
            height: b.rect.h * v.scale,
            rx: 6,
          }),
        );
        for (const nid of b.nodeIds) {
          const n = this._nodeAt(nid);
          if (!n) continue;
          const np = graphToScreen(v, n.pos.x + dx, n.pos.y + dy);
          els.push(
            svg("rect", {
              class: "node-ghost",
              x: np.x,
              y: np.y,
              width: NODE_W * v.scale,
              height: NODE_H * v.scale,
              rx: 8,
            }),
          );
        }
      }
    }
    // paste ghost: one node outline per clipboard node at the live paste origin
    if (this._paste && this._clipboard) {
      for (const cn of this._clipboard.nodes) {
        const np = graphToScreen(
          v,
          this._paste.gx + (cn.dx || 0),
          this._paste.gy + (cn.dy || 0),
        );
        els.push(
          svg("rect", {
            class: "node-ghost",
            x: np.x,
            y: np.y,
            width: NODE_W * v.scale,
            height: NODE_H * v.scale,
            rx: 8,
          }),
        );
      }
    }
    // resize handles on the selected building (drag an edge/corner to resize)
    if (this.selectedBuildingId && !this._copy) {
      const b = (this.snap.buildings || []).find(
        (x) => x.id === this.selectedBuildingId,
      );
      if (b) {
        const pts = this._handlePoints(this._buildingRect(b));
        const hs = 5;
        for (const key in pts) {
          const sp = graphToScreen(v, pts[key].x, pts[key].y);
          els.push(
            svg("rect", {
              class: "building-handle",
              x: sp.x - hs,
              y: sp.y - hs,
              width: hs * 2,
              height: hs * 2,
            }),
          );
        }
      }
    }
    return els;
  }

  // Centered first-run hint shown on an empty canvas (screen space, so it stays
  // put under pan/zoom). Falls back to a default size when unmeasured (tests).
  _emptyHint() {
    let w = 600,
      hh = 400;
    try {
      const r = this.svgEl.getBoundingClientRect();
      if (r && r.width) {
        w = r.width;
        hh = r.height;
      }
    } catch {}
    return svg(
      "text",
      { class: "graph-empty", x: w / 2, y: hh / 2, "text-anchor": "middle" },
      ["No machines yet — open the Build menu to place one"],
    );
  }

  _activeNodeId() {
    try {
      const a = document.activeElement;
      if (
        a &&
        a.getAttribute &&
        this.layerNodes.contains &&
        this.layerNodes.contains(a)
      )
        return a.getAttribute("data-node-id");
    } catch {}
    return null;
  }

  _restoreFocus(id) {
    try {
      const g =
        this.layerNodes.querySelector &&
        this.layerNodes.querySelector(`[data-node-id="${id}"]`);
      if (g && typeof g.focus === "function") g.focus();
    } catch {}
  }

  _focusFirstNode() {
    try {
      const g =
        this.layerNodes.querySelector &&
        this.layerNodes.querySelector("[data-node-id]");
      if (g && typeof g.focus === "function") g.focus();
    } catch {}
  }

  // Keyboard operability (WCAG 2.1.1): Enter inspects, arrows nudge one grid
  // cell, C connects (arm this output, then C on a target), Delete removes.
  _onNodeKey(e, id) {
    const k = e.key;
    if (k === "Enter" || k === " " || k === "Spacebar") {
      e.preventDefault();
      this._select(id);
      return;
    }
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      this.game.dispatch({ type: INTENT.RemoveNode, nodeId: id });
      // the focused node is gone — move focus to a remaining node so a keyboard
      // user doesn't get dropped back to <body>.
      this._focusFirstNode();
      return;
    }
    if (k === "c" || k === "C") {
      e.preventDefault();
      this._keyboardConnect(id);
      return;
    }
    let dx = 0,
      dy = 0;
    if (k === "ArrowLeft") dx = -GRID;
    else if (k === "ArrowRight") dx = GRID;
    else if (k === "ArrowUp") dy = -GRID;
    else if (k === "ArrowDown") dy = GRID;
    else return;
    e.preventDefault();
    const n = this._nodeAt(id);
    if (!n) return;
    let pos = { x: n.pos.x + dx, y: n.pos.y + dy };
    if (this.snapEnabled()) pos = snapToGrid(pos, GRID);
    this.game.dispatch({ type: INTENT.SetNodePos, nodeId: id, pos });
  }

  _keyboardConnect(id) {
    if (!this.armedPort) {
      this.armedPort = { nodeId: id, dir: "out" }; // arm this node's output
      this._draw();
      return;
    }
    if (this.armedPort.nodeId === id) {
      this.armedPort = null; // press C again on the same node to cancel
      this._draw();
      return;
    }
    this._connect(this.armedPort.nodeId, id);
    this.armedPort = null;
    this._draw();
  }

  // Build a node element's STRUCTURE only (local unscaled coords). Per-draw
  // attributes — transform, class, aria-label, sub-rate text, cap-fill width —
  // are NOT set here; _updateNodeEl applies them every draw. An element is
  // rebuilt only when its structural sig (nodeSig) changes; `tier`/`armed`/`icon`
  // are the sig's structural inputs and arrive here straight from the sig site.
  _buildNodeEl(n, tier, armed, icon) {
    // Badge presence/variant is structural (rebuilds on change via nodeSig), so
    // it's baked in here rather than updated in place — same ladder as the sig.
    const badge = nodeBadge(n);
    // Render the whole node in ONE scaled group with children in LOCAL unscaled
    // coords (0..NODE_W, 0..NODE_H). The transform (applied in _updateNodeEl)
    // scales box, text, icon, cap-bar, badge AND ports uniformly with zoom — at
    // scale 1 this is pixel-identical to the old per-coordinate math. Ports also
    // line up with the graph-space hit-test (which uses the same graph units).
    // Capture just the id string for the keydown closure — a retained-but-culled
    // entry would otherwise pin the whole (stale) snapshot node alive.
    const id = n.id;
    const g = svg("g", {
      // Keyboard a11y: each node is a focusable button (Enter/arrows/C/Delete).
      // id is stable for the entry's lifetime, so these are build-time only.
      tabindex: 0,
      role: "button",
      "data-node-id": id,
      onkeydown: (e) => this._onNodeKey(e, id),
    });
    g.appendChild(
      svg("rect", {
        class: "node-box",
        x: 0,
        y: 0,
        width: NODE_W,
        height: NODE_H,
        rx: 8,
      }),
    );
    g.appendChild(
      svg("text", { class: "node-label", x: 30, y: 20 }, [cap(n.kind)]),
    );
    // tier "far": skip the icon foreignObject, the working-gear foreignObject,
    // and ALL FOUR port circles (out hit/dot + in hit/dot). Hit-testing still
    // works — it's graph-space math, not DOM (see _hitPort/_hitNode).
    if (tier !== "far") {
      const fo = svg("foreignObject", {
        x: 5,
        y: 4,
        width: 24,
        height: 24,
        class: "node-ico",
      });
      const iEl = document.createElement("i");
      iEl.className = `fa-duotone fa-solid fa-${icon}`;
      iEl.setAttribute("aria-hidden", "true");
      fo.appendChild(iEl);
      g.appendChild(fo);
    }
    // Shared "working" animation: a spinning gears cog shown ONLY while the machine
    // is actively producing and fed (n.working). Idle/blocked/full nodes are still.
    if (tier !== "far" && n.working) {
      const wfo = svg("foreignObject", {
        x: NODE_W - 27,
        y: NODE_H - 30,
        width: 16,
        height: 16,
        class: "node-working",
      });
      const wi = document.createElement("i");
      wi.className = "fa-duotone fa-solid fa-gears";
      wi.setAttribute("aria-hidden", "true");
      // The gear is rebuilt only on a sig change now, which would restart the CSS
      // animation from 0. Anchor each gear to a shared wall-clock phase via a
      // negative animation-delay so a recreated gear resumes mid-spin — the
      // animation looks continuous across rebuilds. (2.4s = keyframe duration;
      // guarded for the headless test shim where `performance` is absent.)
      const nowS =
        typeof performance !== "undefined" && performance.now
          ? performance.now() / 1000
          : 0;
      wi.style.animationDelay = "-" + (nowS % 2.4).toFixed(3) + "s";
      wfo.appendChild(wi);
      g.appendChild(wfo);
    }
    // Sub-rate text: created EMPTY here, content set every draw by _updateNodeEl.
    const subText = svg("text", { class: "node-sub", x: 8, y: 38 });
    g.appendChild(subText);
    // capacity bar
    const barY = NODE_H - 8;
    g.appendChild(
      svg("rect", {
        class: "cap-bg",
        x: 8,
        y: barY,
        width: NODE_W - 16,
        height: 4,
      }),
    );
    // cap-fill class is static per build (derived from the sig's badge): "MAX"
    // only counts when shipping (badge "max" === atCapacity && working) — a
    // fully-fed producer whose output goes nowhere isn't meaningfully at capacity.
    // width starts at 0 and is set every draw by _updateNodeEl.
    const capFill = svg("rect", {
      class:
        "cap-fill" +
        (badge === "max" ? " at-capacity" : n.starved ? " starved" : ""),
      x: 8,
      y: barY,
      width: 0,
      height: 4,
    });
    g.appendChild(capFill);
    // Top-right status badge: MAX (at capacity + shipping), LOW (running but under
    // capacity), or OFF (connected/idle with ~0 throughput). Structural via sig.
    if (badge !== "none") {
      const label = badge === "max" ? "MAX" : badge === "off" ? "OFF" : "LOW";
      const variant =
        badge === "max" ? "max" : badge === "off" ? "off" : "starved";
      const bw = 34,
        bh = 14;
      const bx = NODE_W - bw - 4,
        by = 4;
      g.appendChild(
        svg("rect", {
          class: `node-badge-box ${variant}`,
          x: bx,
          y: by,
          width: bw,
          height: bh,
          rx: 4,
        }),
      );
      g.appendChild(
        svg(
          "text",
          {
            class: "node-badge-text " + variant,
            x: bx + bw / 2,
            y: by + bh / 2 + 3.5,
            "text-anchor": "middle",
          },
          [label],
        ),
      );
    }
    // ports (visible dot + transparent >=44px hit halo), local coords. Barracks
    // are a terminal sink (gear in -> troops, which are unroutable) so they get
    // NO out port — skip its visible dot + hit halo, mirroring the _hitPort and
    // _inferResource guards.
    if (tier !== "far") {
      if (n.kind !== "barracks") {
        g.appendChild(
          svg("circle", {
            class: "port-hit",
            cx: NODE_W,
            cy: NODE_H / 2,
            r: HIT_R,
          }),
        );
        g.appendChild(
          svg("circle", {
            class: armed ? "port armed" : "port",
            cx: NODE_W,
            cy: NODE_H / 2,
            r: PORT_R,
          }),
        );
      }
      g.appendChild(
        svg("circle", { class: "port-hit", cx: 0, cy: NODE_H / 2, r: HIT_R }),
      );
      g.appendChild(
        svg("circle", { class: "port", cx: 0, cy: NODE_H / 2, r: PORT_R }),
      );
    }
    return { g, subText, capFill };
  }

  // Per-draw, in-place update of a retained node element: transform, selection
  // class, aria-label, sub-rate text, cap-fill width. Runs every draw for every
  // rendered node (cached setters skip the DOM call when a value is unchanged).
  _updateNodeEl(entry, n, v) {
    const np = this._pos(n);
    const p = graphToScreen(v, np.x, np.y);
    setAttr(entry.g, "transform", `translate(${p.x} ${p.y}) scale(${v.scale})`);
    let cls = "node-card";
    if (n.id === this.selectedId) cls += " selected";
    if (this.selNodes.has(n.id)) cls += " multiselect";
    else if (this._grpMembers && this._grpMembers.has(n.id))
      cls += " group-member";
    setAttr(entry.g, "class", cls);
    const stateLabel = n.atCapacity
      ? ", at max"
      : n.starved
        ? ", low on input"
        : "";
    setAttr(
      entry.g,
      "aria-label",
      `${cap(n.kind)}, level ${n.level}${stateLabel}`,
    );
    // Markets/scholars produce currency and barracks produce siege power, not a
    // routable resource — show that at a glance (their effectiveRate is 0 because
    // they don't output a graph resource).
    let subRate;
    if (n.kind === "market") subRate = `${(n.goldOut ?? 0).toFixed(2)} g/s`;
    else if (n.kind === "scholar")
      subRate = `${(n.researchOut ?? 0).toFixed(2)} r/s`;
    else if (n.kind === "barracks")
      subRate = `${(n.siegeOut ?? 0).toFixed(2)} pw/s`;
    else subRate = `${(n.effectiveRate ?? 0).toFixed(2)}/s`;
    setText(entry.subText, `L${n.level} · ${subRate}`);
    const pct = Math.max(0, Math.min(1, n.capacityPct ?? 0));
    setAttr(entry.capFill, "width", (NODE_W - 16) * pct);
  }

  _replace(layer, els) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (const e of els) layer.appendChild(e);
  }
}
