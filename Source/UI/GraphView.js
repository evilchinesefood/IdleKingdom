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
    this.layerLinks = svg("g", {});
    this.layerNodes = svg("g", {});
    this.svgEl.appendChild(this.layerLinks);
    this.svgEl.appendChild(this.layerNodes);
    this.host.appendChild(this.svgEl);

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
      onSelectLink: (id) => this._selectLink(id),
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

  // Graph-space hit test against the rendered link Bézier (GraphInput passes graph
  // coords). Samples the SAME cubic linkPath draws (shared linkBezier control pts)
  // so a tap on the visible curve mid-span hits even on vertically-offset links.
  hitLink(gx, gy) {
    if (!this.snap) return null;
    const tol = 14 / this.view.scale;
    for (const l of this.snap.links) {
      const from = this._nodeAt(l.from),
        to = this._nodeAt(l.to);
      if (!from || !to) continue;
      const fp = this._pos(from),
        tp = this._pos(to);
      const a = { x: fp.x + NODE_W, y: fp.y + NODE_H / 2 };
      const b = { x: tp.x, y: tp.y + NODE_H / 2 };
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
        if (Math.hypot(gx - px, gy - py) <= tol) return l.id;
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
    return null;
  }

  _select(id) {
    this.selectedId = id;
    this.onSelect(id);
    this.selectedLinkId = null;
    this._draw();
  }

  // resolve a node's effective pos: a live drag-nudge overrides the snapshot pos
  _pos(n) {
    return (this._dragPos && this._dragPos[n.id]) || n.pos;
  }

  _draw() {
    if (!this.snap) return;
    const v = this.view;
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
              r: 10,
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
    this._replace(this.layerNodes, nodeEls);
  }

  _drawNode(n, v) {
    const np = this._pos(n);
    const p = graphToScreen(v, np.x, np.y);
    const w = NODE_W * v.scale,
      hgt = NODE_H * v.scale;
    const g = svg("g", {
      class: n.id === this.selectedId ? "node-card selected" : "node-card",
    });
    g.appendChild(
      svg("rect", {
        class: "node-box",
        x: p.x,
        y: p.y,
        width: w,
        height: hgt,
        rx: 8,
      }),
    );
    g.appendChild(
      svg("text", { class: "node-label", x: p.x + 30, y: p.y + 20 }, [
        cap(n.kind),
      ]),
    );
    const fo = svg("foreignObject", {
      x: p.x + 5,
      y: p.y + 4,
      width: 24,
      height: 24,
      class: "node-ico",
    });
    const iEl = document.createElement("i");
    iEl.className = `fa-duotone fa-solid fa-${iconName(n.kind)}`;
    iEl.setAttribute("aria-hidden", "true");
    fo.appendChild(iEl);
    g.appendChild(fo);
    g.appendChild(
      svg("text", { class: "node-sub", x: p.x + 8, y: p.y + 38 }, [
        `L${n.level} · ${(n.effectiveRate ?? 0).toFixed(2)}/s`,
      ]),
    );
    // capacity bar
    const pct = Math.max(0, Math.min(1, n.capacityPct ?? 0));
    const barY = p.y + hgt - 8;
    g.appendChild(
      svg("rect", {
        class: "cap-bg",
        x: p.x + 8,
        y: barY,
        width: w - 16,
        height: 4,
      }),
    );
    const capCls =
      "cap-fill" +
      (n.atCapacity ? " at-capacity" : n.starved ? " starved" : "");
    g.appendChild(
      svg("rect", {
        class: capCls,
        x: p.x + 8,
        y: barY,
        width: (w - 16) * pct,
        height: 4,
      }),
    );
    // MAX/starved badge in the top-right corner
    if (n.atCapacity || n.starved) {
      const label = n.atCapacity ? "MAX" : "LOW";
      const variant = n.atCapacity ? "max" : "starved";
      const bw = 34 * v.scale,
        bh = 14 * v.scale;
      const bx = p.x + w - bw - 4 * v.scale,
        by = p.y + 4 * v.scale;
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
            y: by + bh / 2 + 3.5 * v.scale,
            "text-anchor": "middle",
          },
          [label],
        ),
      );
    }
    // ports (visible dot + transparent >=44px hit halo)
    const op = graphToScreen(v, np.x + NODE_W, np.y + NODE_H / 2);
    const ip = graphToScreen(v, np.x, np.y + NODE_H / 2);
    const armedOut = this.armedPort && this.armedPort.nodeId === n.id;
    g.appendChild(
      svg("circle", { class: "port-hit", cx: op.x, cy: op.y, r: HIT_R }),
    );
    g.appendChild(
      svg("circle", {
        class: armedOut ? "port armed" : "port",
        cx: op.x,
        cy: op.y,
        r: PORT_R,
      }),
    );
    g.appendChild(
      svg("circle", { class: "port-hit", cx: ip.x, cy: ip.y, r: HIT_R }),
    );
    g.appendChild(
      svg("circle", { class: "port", cx: ip.x, cy: ip.y, r: PORT_R }),
    );
    return g;
  }

  _replace(layer, els) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (const e of els) layer.appendChild(e);
  }
}
