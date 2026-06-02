import { topoSort } from "./Topology.js";

/** Capacity per kind (level adds to the relevant base; bonus = productionBonuses[kind] ?? 1.0). */
export function capacity(node, state, content) {
  const m = content.machines[node.kind];
  const bonus =
    (state.unlocks.productionBonuses &&
      state.unlocks.productionBonuses[node.kind]) ??
    1.0;
  if (node.kind === "gatherer")
    return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  if (node.kind === "smelter" || node.kind === "workshop") {
    const r = content.recipes[node.recipeId];
    if (!r) return 0;
    return (r.baseOut + m.rateGain * (node.level - 1)) * bonus; // level adds to recipe base output
  }
  if (node.kind === "market")
    return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  if (node.kind === "scholar")
    return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus;
  if (node.kind === "storage")
    return (m.baseOutput + m.rateGain * (node.level - 1)) * bonus; // passthrough rate
  return 0;
}

/** A consumer link's capacity-limited want for its carried resource (supply-independent). */
function linkWant(consumer, resourceId, cap, content) {
  if (consumer.kind === "smelter" || consumer.kind === "workshop") {
    const r = content.recipes[consumer.recipeId];
    if (!r || !(resourceId in r.inputs)) return 0;
    return cap * r.inputs[resourceId]; // units of resource needed to run at full capacity
  }
  if (consumer.kind === "scholar") return resourceId === "parchment" ? cap : 0;
  if (consumer.kind === "market") return cap; // shared sell capacity
  if (consumer.kind === "storage")
    return resourceId === consumer.resourceId ? cap : 0;
  return 0; // gatherers take no inputs
}

/** Single O(N+E) forward-pass steady-state solve with capacity-weighted fan-out rationing. Pure.
 *  Conserves mass: the sum of a producer's outbound link flows never exceeds its output; any
 *  unconsumed remainder accrues to the producer's own stockpile (surplusRate). */
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

  const availableOut = {}; // nodeId -> {resId: units/s produced}
  const linkFlow = {}; // linkId -> units/s actually flowing (finalized, conserved)
  const surplusRate = {}; // nodeId -> {resId: units/s to own stockpile}
  const capacityByNode = {};
  const perNodeDraw = {}; // nodeId -> {resId: units/s consumed}
  const fedFrac = {}; // `${consumerId}|${resId}` -> received/want in [0,1] (under-feed signal)
  const goldByNode = {}; // nodeId -> gold/s
  const researchByNode = {}; // nodeId -> research/s (scholar + market tithe)

  // Precompute capacities, then per-link want and per-(producer,resId) totalWant.
  for (const n of nodes) capacityByNode[n.id] = capacity(n, state, content);
  const wantByLink = {}; // linkId -> capacity-limited consumer want
  const totalWant = {}; // `${producerId}|${resId}` -> Σ want over that producer's outbound links of resId
  for (const l of links) {
    const consumer = byId.get(l.to);
    const w = consumer
      ? linkWant(consumer, l.resourceId, capacityByNode[l.to], content)
      : 0;
    wantByLink[l.id] = w;
    const k = l.from + "|" + l.resourceId;
    totalWant[k] = (totalWant[k] || 0) + w;
  }

  // --- Forward pass in topo order. Inbound flows are already finalized by upstream producers. ---
  for (const id of order) {
    const node = byId.get(id);
    const cap = capacityByNode[id];

    // Actual input = Σ inbound linkFlow (fan-IN sums; flows were rationed by upstream producers).
    const incoming = {};
    for (const L of inLinks.get(id)) {
      const f = linkFlow[L.id] || 0;
      incoming[L.resourceId] = (incoming[L.resourceId] || 0) + f;
    }

    if (node.kind === "gatherer") {
      availableOut[id] = node.resourceId ? { [node.resourceId]: cap } : {};
      perNodeDraw[id] = {};
    } else if (node.kind === "smelter" || node.kind === "workshop") {
      const r = content.recipes[node.recipeId];
      if (!r) {
        availableOut[id] = {};
        perNodeDraw[id] = {};
      } else {
        let limit = cap;
        for (const inId in r.inputs) {
          limit = Math.min(limit, (incoming[inId] || 0) / r.inputs[inId]);
        }
        const out = Math.max(0, limit);
        availableOut[id] = { [r.output]: out };
        const draw = {};
        for (const inId in r.inputs) draw[inId] = out * r.inputs[inId];
        perNodeDraw[id] = draw;
        // fed fraction per input resource = received / capacity-want (drives the
        // under-fed "starved link" cue; flow can't exceed upstream supply).
        for (const inId in r.inputs) {
          const want = cap * r.inputs[inId];
          fedFrac[id + "|" + inId] =
            want > 0 ? Math.min(1, (incoming[inId] || 0) / want) : 1;
        }
      }
    } else if (node.kind === "scholar") {
      const parch = incoming["parchment"] || 0;
      const out = Math.min(cap, parch);
      availableOut[id] = {};
      perNodeDraw[id] = { parchment: out };
      researchByNode[id] = out;
      fedFrac[id + "|parchment"] = cap > 0 ? Math.min(1, parch / cap) : 1;
    } else if (node.kind === "market") {
      const sellable = {};
      let total = 0;
      for (const resId in incoming) {
        const res = content.resources[resId];
        if (
          state.unlocks.marketListings.includes(resId) &&
          res &&
          res.basePrice != null
        ) {
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
      goldByNode[id] = gold;
      researchByNode[id] = gold * state.unlocks.titheRate;
      availableOut[id] = {};
      perNodeDraw[id] = nodeSold;
    } else if (node.kind === "storage") {
      // Capped pass-through: accept up to `cap` of the configured resource, expose
      // it as output for downstream links; whatever isn't drawn becomes surplus and
      // accrues to the (hard-capped) stockpile in applyTick. Not an active source.
      // No fedFrac is emitted: `cap` here is the passthrough ceiling, not a demand, so
      // a feed link below it must NOT render as starved (mirrors the market sink).
      const rid = node.resourceId;
      const inflow = rid ? incoming[rid] || 0 : 0;
      const pass = Math.min(cap, inflow);
      availableOut[id] = rid && pass > 0 ? { [rid]: pass } : {};
      perNodeDraw[id] = rid && pass > 0 ? { [rid]: pass } : {};
    } else {
      availableOut[id] = {};
      perNodeDraw[id] = {};
    }

    // Ration this node's output across its outbound links (capacity-weighted), conserving mass.
    const outs = availableOut[id];
    for (const resId in outs) {
      const out = outs[resId];
      const tw = totalWant[id + "|" + resId] || 0;
      let dispatched = 0;
      for (const L of outLinks.get(id)) {
        if (L.resourceId !== resId) continue;
        const w = wantByLink[L.id];
        let flow;
        if (tw <= 0) flow = 0;
        else if (tw <= out)
          flow = w; // demand fits: each consumer gets its full want
        else flow = out * (w / tw); // demand exceeds supply: proportional fair share
        linkFlow[L.id] = flow;
        dispatched += flow;
      }
      const sr = Math.max(0, out - dispatched);
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
    fedFrac,
    goldByNode,
    researchByNode,
  };
}
