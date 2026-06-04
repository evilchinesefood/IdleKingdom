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

function waEventName(propKey) {
  return propKey
    .slice(2)
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
const isWaListenerProp = (k) => /^onWa[A-Z]/.test(k);

function applyProps(el, oldProps, newProps) {
  for (const k in oldProps) {
    if (isWaListenerProp(k)) {
      if (!(k in newProps)) {
        const reg = el.__waEvents && el.__waEvents[k];
        if (reg) {
          el.removeEventListener(reg.name, reg.fn);
          delete el.__waEvents[k];
        }
      }
      continue;
    }
    if (k.startsWith("prop:")) {
      if (!(k in newProps)) {
        try {
          el[k.slice(5)] = undefined;
        } catch {}
      }
      continue;
    }
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
    if (isWaListenerProp(k)) {
      if (typeof v === "function") {
        el.__waEvents = el.__waEvents || {};
        const prev = el.__waEvents[k];
        if (!prev || prev.fn !== v) {
          if (prev) el.removeEventListener(prev.name, prev.fn);
          const name = waEventName(k);
          el.addEventListener(name, v);
          el.__waEvents[k] = { name, fn: v };
        }
      }
      continue;
    }
    if (k.startsWith("prop:")) {
      const name = k.slice(5);
      // Don't clobber a control the user is actively editing: re-asserting
      // value/open on the focused element (e.g. an open wa-select) under a
      // live per-tick snapshot would close the dropdown / cancel the edit.
      if (
        (name === "value" || name === "open") &&
        typeof document !== "undefined" &&
        document.activeElement === el
      )
        continue;
      if (el[name] !== v) el[name] = v;
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
  // Reconcile over ALL child nodes (elements AND text). Using parent.children
  // (elements only) desyncs the cursor and leaks text nodes — every re-render
  // would append a fresh text node and never remove the stale one.
  const byKey = new Map();
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && node.dataset && node.dataset.key != null)
      byKey.set(node.dataset.key, node);
  }

  let cursor = 0;
  for (const vnode of newChildren) {
    let el;
    if (isText(vnode)) {
      const want = String(vnode);
      const cur = parent.childNodes[cursor];
      if (cur && cur.nodeType === 3) {
        // reuse the text node in place — just update its value
        if (cur.nodeValue !== want) cur.nodeValue = want;
        cursor++;
        continue;
      }
      el = doc.createTextNode(want);
    } else if (
      vnode.key != null &&
      byKey.has(vnode.key) &&
      byKey.get(vnode.key).tagName === String(vnode.tag).toUpperCase()
    ) {
      // Reuse the keyed element only when its tag still matches — a keyed vnode
      // whose tag changed must become a fresh element (task 24), not a misapplied
      // reuse of the old one.
      el = byKey.get(vnode.key);
      byKey.delete(vnode.key);
      const oldProps = el.__props || {};
      applyProps(el, oldProps, vnode.props);
      el.__props = vnode.props;
      patch(el, vnode.children, doc);
    } else if (isPassthrough(vnode)) {
      el = vnode.el; // prebuilt DOM/SVG node — reuse, don't recreate
    } else {
      el = create(vnode, doc);
      el.__props = vnode.props;
    }
    const ref = parent.childNodes[cursor] || null;
    if (ref !== el) parent.insertBefore(el, ref);
    cursor++;
  }
  // remove any trailing leftover nodes (elements OR text)
  while (parent.childNodes.length > cursor) {
    parent.removeChild(parent.childNodes[parent.childNodes.length - 1]);
  }
}
