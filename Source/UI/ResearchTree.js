import { h } from "./Render/Dom.js";
import { svg } from "./Render/Svg.js";
import { icon } from "./Icons.js";
import { fmtCost, affordClass } from "./Format/Format.js";
import { RESEARCH_NODES } from "../Engine/Content/ResearchNodes.js";
import { INTENT } from "../Engine/Intents.js";

// Layered layout: column = prereq depth, row = order within depth.
function depthOf(id, memo) {
  if (memo[id] != null) return memo[id];
  const node = RESEARCH_NODES[id];
  if (!node || node.prereqs.length === 0) return (memo[id] = 0);
  const d = 1 + Math.max(...node.prereqs.map((p) => depthOf(p, memo)));
  return (memo[id] = d);
}

const COL_W = 200,
  ROW_H = 160,
  PAD = 24,
  CARD_W = 160,
  CARD_H = 88;

// Static layout (positions + dimensions) — derived once from content.
let _layout = null;
function layout() {
  if (_layout) return _layout;
  const memo = {};
  const rows = {};
  const pos = {};
  for (const id of Object.keys(RESEARCH_NODES)) {
    const d = depthOf(id, memo);
    rows[d] = rows[d] || 0;
    pos[id] = { x: PAD + d * COL_W, y: PAD + rows[d] * ROW_H };
    rows[d]++;
  }
  const width = PAD + (Math.max(...Object.values(memo)) + 1) * COL_W;
  const height = PAD + Math.max(...Object.values(rows)) * ROW_H + PAD;
  _layout = { pos, width, height };
  return _layout;
}

// Static SVG prereq edge layer — built at most once (depends only on content).
let _edgeLayer = null;
function edgeLayer() {
  if (_edgeLayer) return _edgeLayer;
  const { pos, width, height } = layout();
  const edges = [];
  for (const node of Object.values(RESEARCH_NODES)) {
    for (const p of node.prereqs) {
      const a = pos[p],
        b = pos[node.id];
      if (!a || !b) continue;
      edges.push(
        svg("line", {
          x1: a.x + CARD_W,
          y1: a.y + CARD_H / 2,
          x2: b.x,
          y2: b.y + CARD_H / 2,
          class: "res-edge",
        }),
      );
    }
  }
  _edgeLayer = svg(
    "svg",
    { class: "res-edges", width, height, viewBox: `0 0 ${width} ${height}` },
    edges,
  );
  return _edgeLayer;
}

export function ResearchTree(snap, dispatch) {
  const { pos, width, height } = layout();

  const cards = (snap.research || []).map((r) => {
    const p = pos[r.id] || { x: 0, y: 0 };
    const canBuy = r.status === "available" && r.affordable;
    return h(
      "div",
      {
        class: `res-node ${r.status}`,
        style: `position:absolute;left:${p.x}px;top:${p.y}px;width:${CARD_W}px`,
      },
      h("div", { class: "res-name" }, r.name),
      h("div", { class: "res-cost" }, [icon(r.currency), " ", fmtCost(r.cost)]),
      h("div", { class: "res-eff" }, r.effectsText || ""),
      h(
        "button",
        {
          class: "res-buy " + affordClass(canBuy),
          disabled: !canBuy,
          onclick: () => dispatch({ type: INTENT.BuyResearch, nodeId: r.id }),
        },
        r.status === "owned" ? "Owned" : "Research",
      ),
    );
  });

  return h(
    "div",
    {
      class: "research-tree",
      id: "ResearchTree",
      style: `position:relative;width:${width}px;height:${height}px`,
    },
    // Embed the prebuilt (memoized) SVG DOM node via the "el" passthrough vnode.
    { el: edgeLayer(), key: "res-edges" },
    ...cards,
  );
}
