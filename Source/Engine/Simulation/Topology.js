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
    topoSort(nodes, [...links, { id: "__probe__", from, to, resourceId: "__probe__" }]);
    return true;
  } catch {
    return false;
  }
}

/** Port validity: structural legality of a candidate link. Filled in Task 2.2. */
export function isValidLink(state, content, from, to, resourceId) {
  return false;
}

/** Cached topo order keyed off graph structure. Filled in Task 2.2. */
export function orderFor(state) {
  return topoSort(state.graph.nodes, state.graph.links);
}
