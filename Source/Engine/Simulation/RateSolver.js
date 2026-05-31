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
    } else if (node.kind === "scholar") {
      const parch = incoming["parchment"] || 0;
      const out = Math.min(cap, parch);
      availableOut[id] = {};
      perNodeDraw[id] = { parchment: out };
      researchByNode[id] = out;
    } else if (node.kind === "market") {
      const sellable = {};
      let total = 0;
      for (const resId in incoming) {
        const res = content.resources[resId];
        if (state.unlocks.marketListings.includes(resId) && res && res.basePrice != null) {
          sellable[resId] = incoming[resId];
          total += incoming[resId];
        }
      }
      const scale = total > cap && total > 0 ? cap / total : 1.0;
      const nodeSold = {};
      let gold = 0;
      for (const resId in sellable) {
        const amt = sellable[resId] * scale;
        nodeSold[resId] = amt;
        gold += amt * content.resources[resId].basePrice;
      }
      sold[id] = nodeSold;
      goldByNode[id] = gold;
      researchByNode[id] = gold * state.unlocks.titheRate;
      availableOut[id] = {};
      perNodeDraw[id] = nodeSold; // market "draws" what it sells (used by backpressure)
    } else {
      availableOut[id] = {};
      perNodeDraw[id] = {};
    }
  }

  // --- Pass 2: backpressure (reverse topo) -> decide destination (link vs own stockpile) ---
  // Total provisional offered per (consumerId,resId) across that consumer's inbound links of that resId.
  const offeredTo = {}; // `${to}|${resId}` -> total provisional offered
  for (const l of links) {
    const off = (availableOut[l.from] && availableOut[l.from][l.resourceId]) || 0;
    const k = l.to + "|" + l.resourceId;
    offeredTo[k] = (offeredTo[k] || 0) + off;
  }
  // demand[`${producerId}|${resId}`] = units the downstream consumers actually pull from this producer.
  const demand = {};
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    for (const L of outLinks.get(id)) {
      const consumerDraw = (perNodeDraw[L.to] && perNodeDraw[L.to][L.resourceId]) || 0;
      const k = L.to + "|" + L.resourceId;
      const totalOffered = offeredTo[k] || 0;
      const offHere = (availableOut[L.from] && availableOut[L.from][L.resourceId]) || 0;
      // Proportional share of the consumer's draw attributable to this inbound link.
      const wanted = totalOffered > 0 ? consumerDraw * (offHere / totalOffered) : 0;
      const dk = id + "|" + L.resourceId;
      demand[dk] = (demand[dk] || 0) + wanted;
      linkFlow[L.id] = Math.min(linkFlow[L.id] != null ? linkFlow[L.id] : offHere, wanted);
    }
    const outs = availableOut[id] || {};
    for (const resId in outs) {
      const produced = outs[resId];
      const taken = demand[id + "|" + resId] || 0;
      const sr = Math.max(0, produced - taken);
      if (sr > 0) {
        if (!surplusRate[id]) surplusRate[id] = {};
        surplusRate[id][resId] = (surplusRate[id][resId] || 0) + sr;
      }
    }
  }

  let goldRate = 0;
  for (const id in goldByNode) goldRate += goldByNode[id];
  let researchRate = 0;
  for (const id in researchByNode) researchRate += researchByNode[id];

  return {
    capacityByNode,
    availableOut,
    linkFlow,
    surplusRate,
    goldRate,
    researchRate,
    perNodeDraw,
  };
}
