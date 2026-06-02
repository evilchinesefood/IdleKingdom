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
    this.layerBuildings = svg("g", {}); // building outlines/labels, behind all
    this.layerLinks = svg("g", {});
    this.layerNodes = svg("g", {});
    this.layerOverlay = svg("g", {}); // select box + copy ghost, on top
    this.svgEl.appendChild(this.layerBuildings);
    this.svgEl.appendChild(this.layerLinks);
    this.svgEl.appendChild(this.layerNodes);
    this.svgEl.appendChild(this.layerOverlay);
    this.host.appendChild(this.svgEl);

    // Building tool state
    this._mode = null; // "select" | "copy" | null
    this.selectedBuildingId = null;
    this._selectBox = null; // live select rect (graph coords)
    this._buildingDrag = null; // {id, dx, dy} live move override
    this._bGrab = null;
    this._resize = null; // {id, handle, orig, rect} live edge-resize override
    this._copy = null; // {buildingId, gx, gy} live copy-ghost top-left
    this.onSelectBuilding = opts.onSelectBuilding || (() => {});
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
        this._draw();
      },
      onSelectBox: (rect) => this._onSelectBox(rect),
      onCopyMove: (gx, gy) => this._copyMove(gx, gy),
      onCopyPlace: (gx, gy) => this._copyPlace(gx, gy),
      onPointersCleared: () => this._clearTransient(),
      onViewChange: () => this._draw(),
    });
    this._pendingLink = null; // {fromId, gx, gy} live mouse drag-connect preview
  }

  // Graph-space coordinate near the center of the current viewport (for BuildMenu spawnPos).
  centerGraphPos() {
    const r = this.svgEl.getBoundingClientRect();
    const g = screenToGraph(this.view, r.width / 2, r.height / 2);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  }

  _connectMove(fromId, gx, gy) {
    this._pendingLink = { fromId, gx, gy };
    this._draw();
  }

  _connectEnd() {
    this._pendingLink = null;
    this._draw();
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

  _nodeAt(id) {
    return this.snap.nodes.find((n) => n.id === id);
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
      const o = this._outPort(n);
      if (Math.hypot(gx - o.x, gy - o.y) <= HIT_R)
        return { nodeId: n.id, dir: "out" };
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
    this._draw();
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

  _inferResource(fromNode) {
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
    this.onSelect(id);
    this.selectedLinkId = null;
    this._draw();
  }

  // resolve a node's effective pos: a live drag-nudge (single node) or a live
  // building-move (whole group) overrides the snapshot pos.
  _pos(n) {
    if (this._dragPos && this._dragPos[n.id]) return this._dragPos[n.id];
    if (this._buildingDrag && n.building === this._buildingDrag.id)
      return {
        x: n.pos.x + this._buildingDrag.dx,
        y: n.pos.y + this._buildingDrag.dy,
      };
    return n.pos;
  }

  // ---- Buildings ---------------------------------------------------------

  getMode() {
    return this._mode;
  }

  toggleSelectMode() {
    this._mode = this._mode === "select" ? null : "select";
    this._copy = null;
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
    if (this._buildingDrag && this._buildingDrag.id === b.id)
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
    this._draw();
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
  // taps fall through to the machines/links/pan beneath.
  hitBuilding(gx, gy) {
    if (!this.snap) return null;
    const band = 12 / this.view.scale;
    const lblH = 22 / this.view.scale;
    for (const b of this.snap.buildings || []) {
      const r = this._buildingRect(b);
      if (gx >= r.x && gx <= r.x + r.w && gy >= r.y - lblH && gy < r.y)
        return b.id; // label strip above the box
      const onX = gx >= r.x - band && gx <= r.x + r.w + band;
      const onY = gy >= r.y - band && gy <= r.y + r.h + band;
      const inX = gx >= r.x + band && gx <= r.x + r.w - band;
      const inY = gy >= r.y + band && gy <= r.y + r.h - band;
      if (onX && onY && !(inX && inY)) return b.id; // border band
    }
    return null;
  }

  _selectBuilding(id) {
    this.selectedBuildingId = id;
    this.selectedId = null;
    this.selectedLinkId = null;
    this.onSelect(null); // close any node inspector
    this.onSelectBuilding(id);
    this._draw();
  }

  _grabBuilding(id, gx, gy) {
    this._buildingDrag = { id, dx: 0, dy: 0 };
    this._bGrab = { gx, gy };
  }

  _dragBuilding(id, gx, gy) {
    if (!this._buildingDrag || !this._bGrab) return;
    this._buildingDrag.dx = gx - this._bGrab.gx;
    this._buildingDrag.dy = gy - this._bGrab.gy;
    this._draw();
  }

  _dropBuilding(id, gx, gy) {
    const d = this._buildingDrag;
    this._buildingDrag = null;
    this._bGrab = null;
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

  // Finalize a select-box: capture machines FULLY inside (and not already
  // grouped); the engine implies the internal links. Then leave select mode.
  _onSelectBox(rect) {
    this._selectBox = null;
    this._mode = null;
    this.onModeChange();
    if (!this.snap || rect.w < 8 || rect.h < 8) {
      this._draw();
      return;
    }
    const ids = this.snap.nodes
      .filter(
        (n) =>
          !n.building &&
          n.pos.x >= rect.x &&
          n.pos.x + NODE_W <= rect.x + rect.w &&
          n.pos.y >= rect.y &&
          n.pos.y + NODE_H <= rect.y + rect.h,
      )
      .map((n) => n.id);
    if (ids.length === 0) {
      this._draw();
      return;
    }
    this.game.dispatch({
      type: INTENT.CreateBuilding,
      nodeIds: ids,
      rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    });
    // select the freshly-created building so its inspector opens immediately
    const made = (this.game.getSnapshot().buildings || []).find((b) =>
      b.nodeIds.includes(ids[0]),
    );
    if (made) this._selectBuilding(made.id);
    else this._draw();
  }

  _copyMove(gx, gy) {
    if (!this._copy) return;
    this._copy.gx = gx;
    this._copy.gy = gy;
    this._draw();
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
          const del = svg("g", { class: "link-delete-g" });
          del.appendChild(
            svg("circle", {
              class: "link-delete-hit",
              cx: mid.x,
              cy: mid.y + 12,
              r: 13,
              onclick: () =>
                this.game.dispatch({ type: INTENT.RemoveLink, linkId: l.id }),
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
                onclick: () =>
                  this.game.dispatch({ type: INTENT.RemoveLink, linkId: l.id }),
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

    // nodes
    const nodeEls = this.snap.nodes.map((n) => this._drawNode(n, v));
    if (this.snap.nodes.length === 0) nodeEls.push(this._emptyHint());
    // The redraw destroys the focused node element — capture its id first so we
    // can restore keyboard focus to the rebuilt node afterwards.
    const refocus = this._activeNodeId();
    this._replace(this.layerNodes, nodeEls);
    if (refocus != null) this._restoreFocus(refocus);

    // overlay: live select box + copy ghost (on top of everything)
    this._replace(this.layerOverlay, this._drawOverlay(v));
  }

  _drawBuilding(b, v) {
    const r = this._buildingRect(b);
    const a = graphToScreen(v, r.x, r.y);
    const g = svg("g", {
      class:
        b.id === this.selectedBuildingId ? "building selected" : "building",
    });
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

  _drawNode(n, v) {
    const np = this._pos(n);
    const p = graphToScreen(v, np.x, np.y);
    // Render the whole node in ONE scaled group with children in LOCAL unscaled
    // coords (0..NODE_W, 0..NODE_H). The transform scales box, text, icon,
    // cap-bar, badge AND ports uniformly with zoom — at scale 1 this is
    // pixel-identical to the old per-coordinate math, and at any other zoom the
    // interior no longer spills/desyncs. Ports also line up with the
    // graph-space hit-test (which uses the same graph units).
    const stateLabel = n.atCapacity
      ? ", at max"
      : n.starved
        ? ", low on input"
        : "";
    const g = svg("g", {
      class: n.id === this.selectedId ? "node-card selected" : "node-card",
      transform: `translate(${p.x} ${p.y}) scale(${v.scale})`,
      // Keyboard a11y: each node is a focusable button (Enter/arrows/C/Delete).
      tabindex: 0,
      role: "button",
      "data-node-id": n.id,
      "aria-label": `${cap(n.kind)}, level ${n.level}${stateLabel}`,
      onkeydown: (e) => this._onNodeKey(e, n.id),
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
    const fo = svg("foreignObject", {
      x: 5,
      y: 4,
      width: 24,
      height: 24,
      class: "node-ico",
    });
    const iEl = document.createElement("i");
    iEl.className = `fa-duotone fa-solid fa-${iconName(n.kind)}`;
    iEl.setAttribute("aria-hidden", "true");
    fo.appendChild(iEl);
    g.appendChild(fo);
    // Shared "working" animation: a spinning gears cog shown ONLY while the machine
    // is actively producing and fed (n.working). Idle/blocked/full nodes are still.
    if (n.working) {
      const wfo = svg("foreignObject", {
        x: NODE_W - 22,
        y: NODE_H - 30,
        width: 16,
        height: 16,
        class: "node-working",
      });
      const wi = document.createElement("i");
      wi.className = "fa-duotone fa-solid fa-gears";
      wi.setAttribute("aria-hidden", "true");
      // The graph fully rebuilds its nodes on every render (e.g. on any click),
      // which would restart the CSS animation from 0. Anchor each gear to a shared
      // wall-clock phase via a negative animation-delay so a recreated gear resumes
      // mid-spin — the animation looks continuous across re-renders. (2.4s = keyframe
      // duration; guarded for the headless test shim where `performance` is absent.)
      const nowS =
        typeof performance !== "undefined" && performance.now
          ? performance.now() / 1000
          : 0;
      wi.style.animationDelay = "-" + (nowS % 2.4).toFixed(3) + "s";
      wfo.appendChild(wi);
      g.appendChild(wfo);
    }
    // Markets/scholars produce currency, not a resource — show that at a glance
    // (their effectiveRate is 0 because they don't output a graph resource).
    let subRate;
    if (n.kind === "market") subRate = `${(n.goldOut ?? 0).toFixed(2)} g/s`;
    else if (n.kind === "scholar")
      subRate = `${(n.researchOut ?? 0).toFixed(2)} r/s`;
    else subRate = `${(n.effectiveRate ?? 0).toFixed(2)}/s`;
    g.appendChild(
      svg("text", { class: "node-sub", x: 8, y: 38 }, [
        `L${n.level} · ${subRate}`,
      ]),
    );
    // capacity bar
    const pct = Math.max(0, Math.min(1, n.capacityPct ?? 0));
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
    // "MAX" only counts when the node is actually shipping its output (working) —
    // a fully-fed producer whose output goes nowhere isn't meaningfully at capacity,
    // and showing MAX next to an idle gear read as contradictory.
    const atMax = n.atCapacity && n.working;
    const capCls =
      "cap-fill" + (atMax ? " at-capacity" : n.starved ? " starved" : "");
    g.appendChild(
      svg("rect", {
        class: capCls,
        x: 8,
        y: barY,
        width: (NODE_W - 16) * pct,
        height: 4,
      }),
    );
    // MAX/starved badge in the top-right corner
    if (atMax || n.starved) {
      const label = atMax ? "MAX" : "LOW";
      const variant = atMax ? "max" : "starved";
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
            class: "node-badge-text",
            x: bx + bw / 2,
            y: by + bh / 2 + 3.5,
            "text-anchor": "middle",
          },
          [label],
        ),
      );
    }
    // ports (visible dot + transparent >=44px hit halo), local coords
    const armedOut = this.armedPort && this.armedPort.nodeId === n.id;
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
        class: armedOut ? "port armed" : "port",
        cx: NODE_W,
        cy: NODE_H / 2,
        r: PORT_R,
      }),
    );
    g.appendChild(
      svg("circle", { class: "port-hit", cx: 0, cy: NODE_H / 2, r: HIT_R }),
    );
    g.appendChild(
      svg("circle", { class: "port", cx: 0, cy: NODE_H / 2, r: PORT_R }),
    );
    return g;
  }

  _replace(layer, els) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (const e of els) layer.appendChild(e);
  }
}
