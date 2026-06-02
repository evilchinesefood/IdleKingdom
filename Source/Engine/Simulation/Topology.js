/** Kahn's algorithm. Returns node ids in topo order. Throws Error("cycle") if a cycle exists. */
export function topoSort(nodes, links) {
  const ids = nodes.map((n) => n.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const l of links) {
    if (!adj.has(l.from) || !indeg.has(l.to)) continue;
    adj.get(l.from).push(l.to);
    indeg.set(l.to, indeg.get(l.to) + 1);
  }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const to of adj.get(id)) {
      const d = indeg.get(to) - 1;
      indeg.set(to, d);
      if (d === 0) queue.push(to);
    }
  }
  if (order.length !== ids.length) throw new Error("cycle");
  return order;
}

/** True if adding link from->to keeps the graph acyclic. */
export function wouldStayAcyclic(nodes, links, from, to) {
  try {
    topoSort(nodes, [
      ...links,
      { id: "__probe__", from, to, resourceId: "__probe__" },
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Resources a node can emit downstream given its kind/assignment. */
function outputsOf(node, content) {
  if (node.kind === "gatherer") return node.resourceId ? [node.resourceId] : [];
  if (node.kind === "smelter" || node.kind === "workshop") {
    const r = content.recipes[node.recipeId];
    return r ? [r.output] : [];
  }
  if (node.kind === "storage") return node.resourceId ? [node.resourceId] : [];
  return []; // market and scholar are sinks, never producers
}

/** Resources a node can consume as input given its kind/assignment. */
function acceptsOf(node, content) {
  if (node.kind === "smelter" || node.kind === "workshop") {
    const r = content.recipes[node.recipeId];
    return r ? Object.keys(r.inputs) : [];
  }
  if (node.kind === "scholar") return ["parchment"];
  if (node.kind === "market") return null; // market accepts any listed resource (checked at solve time)
  if (node.kind === "storage") return node.resourceId ? [node.resourceId] : [];
  return []; // gatherer takes no inputs
}

/** Port validity: a candidate link from->to carrying resourceId is structurally legal. */
export function isValidLink(state, content, from, to, resourceId) {
  if (from === to) return false;
  const nodes = state.graph.nodes;
  const links = state.graph.links;
  const fromNode = nodes.find((n) => n.id === from);
  const toNode = nodes.find((n) => n.id === to);
  if (!fromNode || !toNode) return false;
  if (!outputsOf(fromNode, content).includes(resourceId)) return false;
  const accepts = acceptsOf(toNode, content);
  if (accepts !== null && !accepts.includes(resourceId)) return false;
  // Exact-duplicate guard (all kinds incl. markets): never add the same (from,to,resourceId)
  // triple twice — that would double-count the feed in the solver. Markets may still aggregate
  // DISTINCT feeds (different source, or different resource); only the exact triple is rejected.
  if (
    links.some(
      (l) => l.from === from && l.to === to && l.resourceId === resourceId,
    )
  )
    return false;
  return wouldStayAcyclic(nodes, links, from, to);
}

/** Cheap structural signature: node ids + link endpoints. */
function graphSig(state) {
  const g = state.graph;
  return (
    g.nodes.map((n) => n.id).join(",") +
    "|" +
    g.links.map((l) => l.from + ">" + l.to).join(",")
  );
}

/** Cached topo order keyed off graph structure (rebuilt when topology changes). */
export function orderFor(state) {
  const sig = graphSig(state);
  if (!state._topo || state._topo.sig !== sig) {
    state._topo = {
      sig,
      order: topoSort(state.graph.nodes, state.graph.links),
    };
  }
  return state._topo.order;
}
