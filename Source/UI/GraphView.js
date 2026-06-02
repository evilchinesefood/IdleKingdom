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
      hitLinkDelete: (gx, gy) => this.hitLinkDelete(gx, gy),
      onSelectLink: (id) => this._selectLink(id),
      onDeleteLink: (id) => this._deleteLink(id),
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
    g.appendChild(
      svg("text", { class: "node-sub", x: 8, y: 38 }, [
        `L${n.level} · ${(n.effectiveRate ?? 0).toFixed(2)}/s`,
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
    const capCls =
      "cap-fill" +
      (n.atCapacity ? " at-capacity" : n.starved ? " starved" : "");
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
    if (n.atCapacity || n.starved) {
      const label = n.atCapacity ? "MAX" : "LOW";
      const variant = n.atCapacity ? "max" : "starved";
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
