import {
  svg,
  makeView,
  graphToScreen,
  screenToGraph,
  linkPath,
} from "./Render/Svg.js";
import { GraphInput } from "./GraphInput.js";
import { INTENT } from "../Engine/Intents.js";

const NODE_W = 120,
  NODE_H = 64,
  PORT_R = 8,
  HIT_R = 22;

const KIND_ICON = {
  gatherer: "⛏️",
  smelter: "🔥",
  workshop: "🔨",
  market: "🏪",
  scholar: "📜",
};

export class GraphView {
  constructor(host, game, opts = {}) {
    this.host = host;
    this.game = game;
    this.view = makeView();
    this.selectedId = null;
    this.armedPort = null; // {nodeId, dir} for touch tap-port-then-port
    this.snap = null;
    this.onSelect = opts.onSelect || (() => {});

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
      onNodeDrag: (id, gx, gy) => this._dragNode(id, gx, gy),
      onConnect: (from, to) => this._connect(from, to),
      onConnectMove: (fromId, gx, gy) => this._connectMove(fromId, gx, gy),
      onConnectEnd: () => this._connectEnd(),
      onTapPort: (nodeId, dir) => this._tapPort(nodeId, dir),
      onSelect: (id) => this._select(id),
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

  _dragNode(id, gx, gy) {
    const n = this._nodeAt(id);
    if (n) {
      // snapshot nodes are frozen; nudge a local override for live redraw only
      this._dragPos = this._dragPos || {};
      this._dragPos[id] = { x: gx - NODE_W / 2, y: gy - NODE_H / 2 };
      this._draw();
    }
    // Note: drag is a view-only nudge in MVP; persistent pos moves are a SetNodePos intent (Phase 6).
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
        const g = svg("g", {});
        g.appendChild(
          svg("path", {
            class: starved ? "link-path starved" : "link-path",
            d: linkPath(a, b),
          }),
        );
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 };
        g.appendChild(
          svg(
            "text",
            {
              class: "link-label",
              x: mid.x,
              y: mid.y,
              "text-anchor": "middle",
            },
            [`${l.resourceId} ${(l.flow ?? 0).toFixed(2)}/s`],
          ),
        );
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
      svg("text", { class: "node-label", x: p.x + 8, y: p.y + 20 }, [
        `${KIND_ICON[n.kind] || "▣"} ${n.kind}`,
      ]),
    );
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
    g.appendChild(
      svg("rect", {
        class: "cap-fill",
        x: p.x + 8,
        y: barY,
        width: (w - 16) * pct,
        height: 4,
      }),
    );
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
