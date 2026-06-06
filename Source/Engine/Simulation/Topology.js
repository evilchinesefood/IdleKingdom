import { isCrafter } from "../Content/Machines.js";

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
  // Index pointer instead of queue.shift() (which is O(n) per dequeue -> O(n²) drain).
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
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
  if (node.kind === "storage")
    return Array.isArray(node.resourceIds) ? node.resourceIds.slice() : [];
  // barracks is intentionally terminal: troops feed the siege, not the resource graph,
  // so outputsOf returns [] while acceptsOf includes it (asymmetric by design).
  return []; // market, scholar, barracks are sinks, never producers
}

/** Resources a node can consume as input given its kind/assignment. */
function acceptsOf(node, content) {
  if (isCrafter(node.kind)) {
    const r = content.recipes[node.recipeId];
    return r ? Object.keys(r.inputs) : [];
  }
  if (node.kind === "scholar") return ["parchment"];
  if (node.kind === "market") return null; // market accepts any listed resource (checked at solve time)
  if (node.kind === "storage")
    return Array.isArray(node.resourceIds) ? node.resourceIds.slice() : [];
  return []; // gatherer takes no inputs
}

/** DFS from `start` following existing links, returns true if `target` is reachable. */
function canReach(links, start, target) {
  // Build adjacency lazily for this call only — cheaper than full topoSort for sparse checks.
  const adj = new Map();
  for (const l of links) {
    let a = adj.get(l.from);
    if (!a) {
      a = [];
      adj.set(l.from, a);
    }
    a.push(l.to);
  }
  const visited = new Set();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === target) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const nexts = adj.get(cur);
    if (nexts) for (const n of nexts) stack.push(n);
  }
  return false;
}

/** Port validity: a candidate link from->to carrying resourceId is structurally legal.
 *  Pass an optional prebuilt `byId` Map<id,node> to skip the linear scans. */
export function isValidLink(state, content, from, to, resourceId, byId) {
  if (from === to) return false;
  const nodes = state.graph.nodes;
  const links = state.graph.links;
  const map = byId || new Map(nodes.map((n) => [n.id, n]));
  const fromNode = map.get(from);
  const toNode = map.get(to);
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
  // Acyclicity: adding from->to creates a cycle iff `from` is already reachable FROM `to`.
  // DFS from `to` searching for `from` — O(reachable subgraph) vs full topoSort.
  return !canReach(links, to, from);
}
