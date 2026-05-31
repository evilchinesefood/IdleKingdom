const flat = (children) => {
  const out = [];
  const push = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) {
      c.forEach(push);
      return;
    }
    out.push(c);
  };
  (Array.isArray(children) ? children : [children]).forEach(push);
  return out;
};

export function h(tag, props = {}, ...children) {
  const key = props.key != null ? String(props.key) : null;
  return { tag, props, key, children: flat(children) };
}

const isText = (c) => typeof c === "string" || typeof c === "number";
const isPassthrough = (c) =>
  c && typeof c === "object" && c.el && !("tag" in c);

function create(vnode, doc) {
  if (isText(vnode)) return doc.createTextNode(String(vnode));
  if (isPassthrough(vnode)) return vnode.el; // prebuilt DOM/SVG node
  const el = doc.createElement(vnode.tag);
  applyProps(el, {}, vnode.props);
  patch(el, vnode.children, doc);
  return el;
}

function applyProps(el, oldProps, newProps) {
  for (const k in oldProps) {
    if (!(k in newProps)) {
      if (k.startsWith("on")) el[k.toLowerCase()] = null;
      else el.removeAttribute(k === "key" ? "data-key" : k);
    }
  }
  for (const k in newProps) {
    const v = newProps[k];
    if (k === "key") {
      el.setAttribute("data-key", v);
      continue;
    }
    if (k.startsWith("on") && typeof v === "function") {
      el[k.toLowerCase()] = v;
      continue;
    }
    if (k === "text") {
      el.textContent = String(v);
      continue;
    }
    if (v === false || v == null) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}

export function patch(parent, newChildrenRaw, doc = document) {
  const newChildren = flat(newChildrenRaw);
  const existing = Array.from(parent.children);
  const byKey = new Map();
  for (const el of existing)
    if (el.dataset && el.dataset.key != null) byKey.set(el.dataset.key, el);

  let cursor = 0;
  for (const vnode of newChildren) {
    let el;
    if (!isText(vnode) && vnode.key != null && byKey.has(vnode.key)) {
      el = byKey.get(vnode.key);
      byKey.delete(vnode.key);
      const oldProps = el.__props || {};
      applyProps(el, oldProps, vnode.props);
      el.__props = vnode.props;
      patch(el, vnode.children, doc);
    } else {
      el = create(vnode, doc);
      if (!isText(vnode)) el.__props = vnode.props;
    }
    const ref = parent.children[cursor] || null;
    if (ref !== el) parent.insertBefore(el, ref);
    cursor++;
  }
  // remove anything not consumed
  while (parent.children.length > cursor) {
    parent.removeChild(parent.children[parent.children.length - 1]);
  }
}
