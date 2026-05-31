import { describe, it, expect } from "./Runner.js";
import { h, patch } from "../Source/UI/Render/Dom.js";

// Minimal fake element: enough surface for Dom.patch under node (no jsdom).
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this._listeners = {};
    this.parentNode = null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "data-key") this.dataset.key = String(v);
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  addEventListener(t, fn) {
    this._listeners[t] = fn;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (c.parentNode === this) {
      const cur = this.children.indexOf(c);
      if (cur >= 0) this.children.splice(cur, 1);
    }
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
}
const fakeDoc = {
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => {
    const e = new FakeEl("#text");
    e.textContent = String(t);
    return e;
  },
};

describe("Dom.h", () => {
  it("builds a descriptor with tag, props, children", () => {
    const node = h("div", { class: "card", key: "n_miner_0" }, ["hello"]);
    expect(node.tag).toBe("div");
    expect(node.props.class).toBe("card");
    expect(node.key).toBe("n_miner_0");
    expect(node.children[0]).toBe("hello");
  });
  it("flattens nested child arrays and drops null/false", () => {
    const node = h("ul", {}, [
      h("li", {}, ["a"]),
      null,
      false,
      [h("li", {}, ["b"])],
    ]);
    expect(node.children.length).toBe(2);
    expect(node.children[0].tag).toBe("li");
    expect(node.children[1].tag).toBe("li");
  });
});

describe("Dom.patch keyed reconciliation", () => {
  it("creates children on first patch", () => {
    const root = new FakeEl("div");
    patch(
      root,
      [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])],
      fakeDoc,
    );
    expect(root.children.length).toBe(2);
    expect(root.children[0].dataset.key).toBe("a");
    expect(root.children[1].dataset.key).toBe("b");
  });
  it("reuses keyed elements across re-render (same instance)", () => {
    const root = new FakeEl("div");
    patch(
      root,
      [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])],
      fakeDoc,
    );
    const firstA = root.children[0];
    patch(
      root,
      [h("span", { key: "b" }, ["B2"]), h("span", { key: "a" }, ["A2"])],
      fakeDoc,
    );
    expect(root.children.length).toBe(2);
    // 'a' element instance preserved, just reordered + text updated
    const aNow = root.children.find((c) => c.dataset.key === "a");
    expect(aNow).toBe(firstA);
  });
  it("removes children dropped from the new list", () => {
    const root = new FakeEl("div");
    patch(
      root,
      [h("span", { key: "a" }, ["A"]), h("span", { key: "b" }, ["B"])],
      fakeDoc,
    );
    patch(root, [h("span", { key: "a" }, ["A"])], fakeDoc);
    expect(root.children.length).toBe(1);
    expect(root.children[0].dataset.key).toBe("a");
  });
});
