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
    return (consumer.resourceIds || []).includes(resourceId) ? cap : 0;
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

  for (const n of nodes) capacityByNode[n.id] = capacity(n, state, content);
  // Demand-limited fan-in: track each consumer's REMAINING unfilled demand per resource.
  // As producers are dispatched in topo order, each fills as much of the consumer's
  // remaining need as it can, and the rest carries to later feeders — so a healthy
  // feeder fills the consumer fully and a redundant co-feeder simply ships nothing
  // (its gear idles). This never over-supplies the consumer (each flow <= remaining)
  // and never strands deliverable supply (no fixed per-feeder cap). Single-feeder
  // chains are unchanged (the sole feeder sees the full want as its remaining).
  const remaining = {}; // `${to}|${resId}` -> consumer's still-unfilled want
  for (const l of links) {
    const k = l.to + "|" + l.resourceId;
    if (!(k in remaining)) {
      const consumer = byId.get(l.to);
      remaining[k] = consumer
        ? linkWant(consumer, l.resourceId, capacityByNode[l.to], content)
        : 0;
    }
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
      // Capped pass-through per held resource: accept up to `cap` of each configured
      // resource and expose it as output; whatever isn't drawn becomes surplus and
      // accrues to the (hard-capped) stockpile in applyTick. Not an active source.
      // No fedFrac is emitted: `cap` is the passthrough ceiling, not a demand, so a
      // feed link below it must NOT render as starved (mirrors the market sink).
      const held = node.resourceIds || [];
      const out = {};
      const draw = {};
      for (const rid of held) {
        const pass = Math.min(cap, incoming[rid] || 0);
        if (pass > 0) {
          out[rid] = pass;
          draw[rid] = pass;
        }
      }
      availableOut[id] = out;
      perNodeDraw[id] = draw;
    } else {
      availableOut[id] = {};
      perNodeDraw[id] = {};
    }

    // Ration this node's output across its outbound links by each consumer's REMAINING
    // demand (decremented as we go), conserving mass. A consumer already filled by an
    // earlier feeder leaves 0 remaining, so a redundant co-feeder ships nothing.
    const outs = availableOut[id];
    for (const resId in outs) {
      const out = outs[resId];
      const mine = outLinks.get(id).filter((L) => L.resourceId === resId);
      // Group by DISTINCT consumer so duplicate links to the same consumer+resource
      // share one demand (counting its remaining once). Normally isValidLink forbids
      // duplicate triples; this keeps mass conserved even if one is forced in.
      const demand = new Map(); // consumerId -> remaining want
      for (const L of mine)
        if (!demand.has(L.to))
          demand.set(L.to, Math.max(0, remaining[L.to + "|" + resId] || 0));
      let tw = 0; // total still-unfilled demand across this node's distinct consumers
      for (const d of demand.values()) tw += d;
      const deliver = new Map(); // consumerId -> flow
      let dispatched = 0;
      for (const [cid, d] of demand) {
        let f;
        if (tw <= 0) f = 0;
        else if (tw <= out)
          f = d; // enough output: fill each consumer's remaining need
        else f = out * (d / tw); // not enough: split proportional to remaining need
        deliver.set(cid, f);
        remaining[cid + "|" + resId] = d - f; // consume the delivered demand
        dispatched += f;
      }
      // put each consumer's delivery on its first link; duplicate links carry 0
      const seen = new Set();
      for (const L of mine) {
        linkFlow[L.id] = seen.has(L.to) ? 0 : deliver.get(L.to) || 0;
        seen.add(L.to);
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
