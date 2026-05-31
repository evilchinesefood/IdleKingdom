import { topoSort } from "./Topology.js";

/** Capacity per kind (level adds to the relevant base; bonus = productionBonuses[kind] or 1.0). */
export function capacity(node, state, content) {
  const m = content.machines[node.kind];
  const bonus = (state.unlocks.productionBonuses && state.unlocks.productionBonuses[node.kind]) || 1.0;
  if (node.kind === "gatherer") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  if (node.kind === "smelter" || node.kind === "workshop") {
    const r = content.recipes[node.recipeId];
    if (!r) return 0;
    return (r.baseOut + m.rateGain * (node.level - 1)) * bonus; // level adds to recipe base output
  }
  if (node.kind === "market") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  if (node.kind === "scholar") return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  return 0;
}

/** Single O(N+E) two-pass steady-state solve. Pure. */
export function solve(state, content) {
  const nodes = state.graph.nodes;
  const links = state.graph.links;
  const order = topoSort(nodes, links);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inLinks = new Map(nodes.map((n) => [n.id, []]));
  const outLinks = new Map(nodes.map((n) => [n.id, []]));
  for (const l of links) {
    if (inLinks.has(l.to)) inLinks.get(l.to).push(l);
    if (outLinks.has(l.from)) outLinks.get(l.from).push(l);
  }

  const availableOut = {};
  const linkFlow = {};
  const surplusRate = {};
  const capacityByNode = {};
  const perNodeDraw = {};
  const sold = {}; // nodeId -> {resId: units/s}
  const goldByNode = {}; // nodeId -> gold/s
  const researchByNode = {}; // nodeId -> research/s (scholar + market tithe)

  // --- Pass 1: forward in topo order ---
  for (const id of order) {
    const node = byId.get(id);
    const incoming = {};
    for (const L of inLinks.get(id)) {
      const offered = (availableOut[L.from] && availableOut[L.from][L.resourceId]) || 0;
      incoming[L.resourceId] = (incoming[L.resourceId] || 0) + offered;
      linkFlow[L.id] = offered; // provisional
    }
    const cap = capacity(node, state, content);
    capacityByNode[id] = cap;

    if (node.kind === "gatherer") {
      availableOut[id] = node.resourceId ? { [node.resourceId]: cap } : {};
    } else if (node.kind === "smelter" || node.kind === "workshop") {
      const r = content.recipes[node.recipeId];
      if (!r) {
        availableOut[id] = {};
        perNodeDraw[id] = {};
        continue;
      }
      let limit = cap;
      for (const inId in r.inputs) {
        limit = Math.min(limit, (incoming[inId] || 0) / r.inputs[inId]);
      }
      const out = Math.max(0, limit);
      availableOut[id] = { [r.output]: out };
      const draw = {};
      for (const inId in r.inputs) draw[inId] = out * r.inputs[inId];
      perNodeDraw[id] = draw;
    } else {
      // market and scholar — implemented in Task 2.5
      availableOut[id] = {};
      perNodeDraw[id] = {};
    }
  }

  // Pass 2 (surplus/backpressure) added in Task 2.6.

  return {
    capacityByNode,
    availableOut,
    linkFlow,
    surplusRate,
    goldRate: 0,
    researchRate: 0,
    perNodeDraw,
  };
}
