import { describe, it, expect } from "./Runner.js";
import { h, patch } from "../Source/UI/Render/Dom.js";

// Browser-faithful fake nodes: `children` is elements-only (like the real DOM),
// `childNodes` includes text. The previous shim conflated the two, which hid a
// real bug where text nodes were re-appended (never reconciled) on every render.
class FakeText {
  constructor(t) {
    this.nodeType = 3;
    this.nodeValue = String(t);
    this.parentNode = null;
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(v) {
    this.nodeValue = String(v);
  }
}
class FakeEl {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this._listeners = {};
    this.parentNode = null;
    this.__props = undefined;
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  get textContent() {
    return this.childNodes.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = v === "" ? [] : [new FakeText(v)];
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "data-key") this.dataset.key = String(v);
  }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === "data-key") delete this.dataset.key;
  }
  addEventListener(t, fn) {
    (this._listeners[t] ||= []).push(fn);
  }
  removeEventListener(t, fn) {
    const a = this._listeners[t];
    if (a) {
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    }
  }
  dispatch(t, ev) {
    (this._listeners[t] || []).slice().forEach((fn) => fn(ev));
  }
  _detach(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
  }
  appendChild(c) {
    if (c.parentNode) c.parentNode._detach(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode._detach(c);
    c.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c);
    else this.childNodes.splice(i, 0, c);
    return c;
  }
  removeChild(c) {
    this._detach(c);
    c.parentNode = null;
    return c;
  }
}
const fakeDoc = {
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => new FakeText(t),
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
  it("captures variadic positional children (the form panels use)", () => {
    const node = h(
      "div",
      { class: "x" },
      h("div", {}, "a"),
      h("div", {}, "b"),
      h("div", {}, "c"),
    );
    expect(node.children.length).toBe(3);
  });
  it("captures spread-array children passed positionally", () => {
    const rows = [h("div", {}, "r1"), h("div", {}, "r2"), h("div", {}, "r3")];
    const node = h("div", { class: "x" }, ...rows);
    expect(node.children.length).toBe(3);
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

describe("Dom.patch text reconciliation (regression: stacking saved badge)", () => {
  it("does NOT accumulate text nodes when re-rendered repeatedly", () => {
    const root = new FakeEl("div");
    for (let i = 0; i < 6; i++)
      patch(root, [h("div", { key: "save" }, ["💾 saved"])], fakeDoc);
    const save = root.children[0];
    expect(save.childNodes.length).toBe(1); // not 6
    expect(save.textContent).toBe("💾 saved");
  });
  it("updates a keyed element's text in place when the value changes", () => {
    const root = new FakeEl("div");
    patch(root, [h("div", { key: "g" }, ["🪙 25"])], fakeDoc);
    patch(root, [h("div", { key: "g" }, ["🪙 40"])], fakeDoc);
    const g = root.children[0];
    expect(g.childNodes.length).toBe(1);
    expect(g.textContent).toBe("🪙 40");
  });
  it("keeps mixed text+element children stable across re-renders", () => {
    const root = new FakeEl("div");
    for (let i = 0; i < 4; i++)
      patch(root, ["lead ", h("b", { key: "x" }, ["bold"]), " tail"], fakeDoc);
    expect(root.childNodes.length).toBe(3); // text, <b>, text
    expect(root.textContent).toBe("lead bold tail");
  });
  it("reconciles an unkeyed nav sibling without stacking (the real HUD shape)", () => {
    const root = new FakeEl("div");
    for (let i = 0; i < 5; i++) {
      patch(
        root,
        [
          h("div", { key: "cur" }, ["🪙 25"]),
          h("div", { key: "save" }, ["💾 saved"]),
          h("nav", {}, [h("a", { key: "t" }, ["Factory"])]),
        ],
        fakeDoc,
      );
    }
    expect(root.childNodes.length).toBe(3);
    expect(root.children[1].textContent).toBe("💾 saved");
  });
});

describe("Dom.patch keyed tag-mismatch (task 24)", () => {
  it("creates a FRESH element when a keyed vnode changes tag (no misapplied reuse)", () => {
    const root = new FakeEl("div");
    patch(root, [h("div", { key: "x" }, ["A"])], fakeDoc);
    const firstX = root.children[0];
    expect(firstX.tagName).toBe("DIV");
    patch(root, [h("span", { key: "x" }, ["B"])], fakeDoc); // same key, new tag
    expect(root.children.length).toBe(1); // old DIV removed, not left behind
    const now = root.children[0];
    expect(now.tagName).toBe("SPAN");
    expect(now).toBe(now); // fresh element
    expect(now === firstX).toBe(false);
    expect(now.textContent).toBe("B");
  });
  it("still reuses the keyed element when the tag is unchanged", () => {
    const root = new FakeEl("div");
    patch(root, [h("div", { key: "x" }, ["A"])], fakeDoc);
    const firstX = root.children[0];
    patch(root, [h("div", { key: "x" }, ["A2"])], fakeDoc);
    expect(root.children[0]).toBe(firstX); // same instance
    expect(root.children[0].textContent).toBe("A2");
  });
});

describe("Dom.patch — Web Awesome extensions", () => {
  it("onWa* binds the kebab custom event; firing it calls the fn", () => {
    const root = new FakeEl("div");
    let got = null;
    patch(
      root,
      [
        h("wa-select", {
          key: "s",
          onWaChange: (e) => {
            got = e.detail;
          },
        }),
      ],
      fakeDoc,
    );
    const sel = root.children[0];
    sel.dispatch("wa-change", { detail: "iron_bar" });
    expect(got).toBe("iron_bar");
  });
  it("onWa* listener does not stack across re-renders (remove-before-add)", () => {
    const root = new FakeEl("div");
    const fns = [() => {}, () => {}, () => {}];
    fns.forEach((fn) =>
      patch(root, [h("wa-dialog", { key: "d", onWaHide: fn })], fakeDoc),
    );
    const dlg = root.children[0];
    expect((dlg._listeners["wa-hide"] || []).length).toBe(1);
  });
  it("prop: assigns a DOM property, not an attribute", () => {
    const root = new FakeEl("div");
    patch(root, [h("wa-select", { key: "s", "prop:value": "steel" })], fakeDoc);
    const sel = root.children[0];
    expect(sel.value).toBe("steel");
    expect("value" in sel.attributes).toBe(false);
  });
  it("boolean attributes still render as empty attrs", () => {
    const root = new FakeEl("div");
    patch(root, [h("wa-button", { key: "b", disabled: true })], fakeDoc);
    expect(root.children[0].attributes.disabled).toBe("");
  });
});
