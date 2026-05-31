import { screenToGraph, panBy, zoomAt } from "./Render/Svg.js";

const TAP_MOVE_PX = 6; // movement under this between down/up is a tap, not a drag

export class GraphInput {
  /**
   * @param {SVGElement} el  the graph <svg>
   * @param {{getView, setView, hitPort, hitNode, onNodeDrag, onConnect, onTapPort, onSelect, onViewChange}} cb
   *   getView() -> {scale,tx,ty}; setView(v); hitPort(gx,gy)->{nodeId,dir}|null; hitNode(gx,gy)->nodeId|null
   *   onNodeDrag(nodeId, gx, gy); onConnect(fromNodeId, toNodeId); onTapPort(nodeId, dir); onSelect(nodeId|null); onViewChange()
   */
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.pointers = new Map(); // pointerId -> {x,y}
    this.mode = null; // 'pan' | 'dragNode' | 'connect' | 'pinch'
    this.dragNodeId = null;
    this.connectFrom = null; // {nodeId, dir, gx, gy} during a mouse drag-connect
    this.startScreen = null;
    this.pinchDist = 0;
    this._bind();
  }

  _toGraph(ev) {
    const r = this.el.getBoundingClientRect();
    return screenToGraph(
      this.cb.getView(),
      ev.clientX - r.left,
      ev.clientY - r.top,
    );
  }

  _bind() {
    this.el.addEventListener("pointerdown", (e) => this._down(e));
    this.el.addEventListener("pointermove", (e) => this._move(e));
    this.el.addEventListener("pointerup", (e) => this._up(e));
    this.el.addEventListener("pointercancel", (e) => this._up(e));
    this.el.addEventListener("wheel", (e) => this._wheel(e), {
      passive: false,
    });
  }

  _down(e) {
    this.el.setPointerCapture && this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.startScreen = { x: e.clientX, y: e.clientY };

    if (this.pointers.size === 2) {
      // pinch start
      this.mode = "pinch";
      const pts = [...this.pointers.values()];
      this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return;
    }

    const g = this._toGraph(e);
    const port = this.cb.hitPort(g.x, g.y);
    if (port) {
      // mouse: begin a drag-connect; touch: armed for tap-port-then-port (resolved on up)
      this.mode = "connect";
      this.connectFrom = {
        nodeId: port.nodeId,
        dir: port.dir,
        gx: g.x,
        gy: g.y,
      };
      this.cb.onTapPort(port.nodeId, port.dir); // arm/visual
      return;
    }
    const nodeId = this.cb.hitNode(g.x, g.y);
    if (nodeId) {
      this.mode = "dragNode";
      this.dragNodeId = nodeId;
      this.cb.onSelect(nodeId);
      return;
    }

    this.mode = "pan";
    this.cb.onSelect(null);
    this.el.classList.add("panning");
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.mode === "pinch" && this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = this.el.getBoundingClientRect();
      const cx = (pts[0].x + pts[1].x) / 2 - r.left;
      const cy = (pts[0].y + pts[1].y) / 2 - r.top;
      const factor = this.pinchDist > 0 ? dist / this.pinchDist : 1;
      this.cb.setView(zoomAt(this.cb.getView(), cx, cy, factor));
      this.pinchDist = dist;
      this.cb.onViewChange();
      return;
    }
    if (this.mode === "dragNode") {
      const g = this._toGraph(e);
      this.cb.onNodeDrag(this.dragNodeId, g.x, g.y);
      return;
    }
    if (this.mode === "pan") {
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      this.cb.setView(panBy(this.cb.getView(), dx, dy));
      this.cb.onViewChange();
      return;
    }
    // 'connect' move: GraphView redraws (pending link visual handled there)
    if (this.mode === "connect") {
      this.cb.onViewChange();
    }
  }

  _up(e) {
    const wasMode = this.mode;
    const start = this.startScreen;
    const moved = start
      ? Math.hypot(e.clientX - start.x, e.clientY - start.y)
      : 0;
    this.pointers.delete(e.pointerId);

    if (wasMode === "connect" && this.connectFrom) {
      const g = this._toGraph(e);
      const target = this.cb.hitPort(g.x, g.y);
      if (
        moved > TAP_MOVE_PX &&
        target &&
        target.nodeId !== this.connectFrom.nodeId
      ) {
        // mouse drag-connect: from output -> to input
        this.cb.onConnect(this.connectFrom.nodeId, target.nodeId);
        this.cb.onTapPort(null, null); // clear arm
      } else if (moved <= TAP_MOVE_PX) {
        // touch tap-port: leave armed; second tap-port (next _down→_up tap) completes
        // via the onTapPort sequence in GraphView.
      }
    }
    if (this.pointers.size < 2 && this.mode === "pinch")
      this.mode = this.pointers.size === 1 ? "pan" : null;
    if (this.pointers.size === 0) {
      this.mode = null;
      this.dragNodeId = null;
      this.connectFrom = null;
      this.el.classList.remove("panning");
    }
  }

  _wheel(e) {
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.cb.setView(
      zoomAt(this.cb.getView(), e.clientX - r.left, e.clientY - r.top, factor),
    );
    this.cb.onViewChange();
  }
}
