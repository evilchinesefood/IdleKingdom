import { describe, it, expect } from "./Runner.js";
import {
  GraphView,
  deltaTransform,
  actionBarSpec,
} from "../Source/UI/GraphView.js";
import { iconName } from "../Source/UI/Icons.js";

// Drive GraphView._onSelectBox in isolation via a stub `this` (no canvas/DOM needed):
// the marquee now POPULATES the selection sets (no dispatch) and leaves select mode.
function stub(buildings, nodes = []) {
  const dispatched = [];
  return {
    _mode: "select",
    snap: { buildings, nodes },
    selNodes: new Set(),
    selBuildings: new Set(),
    game: { dispatch: (i) => dispatched.push(i) },
    _draw() {},
    onModeChange() {},
    dispatched,
  };
}

describe("GraphView._onSelectBox — marquee populates the selection", () => {
  it("selects nodes fully inside the box (and never dispatches)", () => {
    const s = stub(
      [],
      [
        { id: "n1", pos: { x: 10, y: 10 } }, // fully inside
        { id: "n2", pos: { x: 280, y: 280 } }, // overflows the box
      ],
    );
    // box covers n1 (10..130, 10..74) but not n2 (would need to reach 400,344)
    GraphView.prototype._onSelectBox.call(s, { x: 0, y: 0, w: 300, h: 300 });
    expect([...s.selNodes]).toEqual(["n1"]);
    expect(s.dispatched.length).toBe(0);
    expect(s._mode).toBe(null);
  });

  it("selects buildings whose rect intersects the box", () => {
    const s = stub(
      [
        { id: "b1", rect: { x: 0, y: 0, w: 100, h: 100 } }, // intersects
        { id: "b2", rect: { x: 500, y: 500, w: 50, h: 50 } }, // outside
      ],
      [],
    );
    GraphView.prototype._onSelectBox.call(s, {
      x: -10,
      y: -10,
      w: 200,
      h: 200,
    });
    expect([...s.selBuildings]).toEqual(["b1"]);
    expect(s.dispatched.length).toBe(0);
  });

  it("a tiny drag (rect < 8) selects nothing", () => {
    const s = stub([], [{ id: "n1", pos: { x: 0, y: 0 } }]);
    GraphView.prototype._onSelectBox.call(s, { x: 0, y: 0, w: 4, h: 4 });
    expect(s.selNodes.size).toBe(0);
    expect(s.dispatched.length).toBe(0);
  });

  it("clears a stale single selection so a later Ctrl+click can't re-inject it", () => {
    const s = stub([], [{ id: "n1", pos: { x: 10, y: 10 } }]);
    s.selectedId = "stale"; // a prior plain-click selection
    GraphView.prototype._onSelectBox.call(s, { x: 0, y: 0, w: 300, h: 300 });
    expect(s.selectedId).toBe(null); // marquee replaced it
    expect([...s.selNodes]).toEqual(["n1"]);
  });
});

describe("GraphView._nodeIcon — reflects resource/output, not just kind", () => {
  const gv = (recipes = {}) => ({ game: { content: { recipes } } });
  const ni = (stub, n) => GraphView.prototype._nodeIcon.call(stub, n);
  it("gatherer shows its resource icon", () => {
    expect(ni(gv(), { kind: "gatherer", resourceId: "iron_ore" })).toBe(
      iconName("iron_ore"),
    );
  });
  it("crafter shows its recipe output icon", () => {
    const s = gv({ r_iron_bar: { output: "iron_bar" } });
    expect(ni(s, { kind: "smelter", recipeId: "r_iron_bar" })).toBe(
      iconName("iron_bar"),
    );
  });
  it("storage shows its first held resource icon", () => {
    expect(
      ni(gv(), { kind: "storage", resourceIds: ["timber", "iron_ore"] }),
    ).toBe(iconName("timber"));
  });
  it("market falls back to its kind icon when nothing is flowing", () => {
    expect(ni(gv(), { kind: "market" })).toBe(iconName("market"));
    expect(ni(gv(), { kind: "market", draw: {} })).toBe(iconName("market"));
  });
  it("market reflects the resource it sells most (top flow in draw)", () => {
    expect(ni(gv(), { kind: "market", draw: { timber: 1, iron_bar: 5 } })).toBe(
      iconName("iron_bar"),
    );
  });
  it("scholar reflects the resource it draws (parchment) when running", () => {
    expect(ni(gv(), { kind: "scholar", draw: { parchment: 2 } })).toBe(
      iconName("parchment"),
    );
  });
});

describe("GraphView._selectBuilding — a group click drives the action bar", () => {
  it("adds the clicked group to selBuildings (so the floating bar appears) and clears any prior selection", () => {
    const sel = [];
    const s = {
      selectedBuildingId: null,
      selectedId: "n9",
      selectedLinkId: "l1",
      selNodes: new Set(["n9"]),
      selBuildings: new Set(),
      _clearSelectionSets: GraphView.prototype._clearSelectionSets,
      onSelect: (id) => sel.push("select:" + id),
      onSelectBuilding: (id) => sel.push("bldg:" + id),
      _draw() {},
    };
    GraphView.prototype._selectBuilding.call(s, "b1");
    expect(s.selectedBuildingId).toBe("b1"); // slim panel + resize handles
    expect(s.selBuildings.has("b1")).toBe(true); // hasSelection() -> bar shows
    expect(s.selNodes.size).toBe(0); // prior node selection cleared
    expect(s.selectedId).toBe(null);
    expect(sel).toEqual(["select:null", "bldg:b1"]);
  });
});

describe("GraphView._selectedGroupMembers — highlight source for a selected group", () => {
  it("returns every node in a selected group, recursing nested children", () => {
    const s = {
      snap: {
        buildings: [
          { id: "b1", nodeIds: ["n1", "n2"], children: ["b2"] },
          { id: "b2", nodeIds: ["n3"], children: [] },
          { id: "b3", nodeIds: ["n4"], children: [] }, // not selected
        ],
        nodes: [
          { id: "n1", building: "b1" },
          { id: "n2", building: "b1" },
          { id: "n3", building: "b2" },
          { id: "n4", building: "b3" },
        ],
      },
      selBuildings: new Set(["b1"]),
      _subtreeBuildingIds: GraphView.prototype._subtreeBuildingIds,
    };
    const members = GraphView.prototype._selectedGroupMembers.call(s);
    expect([...members].sort()).toEqual(["n1", "n2", "n3"]); // b1 + nested b2, not b3
  });

  it("returns an empty set when nothing is selected", () => {
    const s = {
      snap: { buildings: [], nodes: [] },
      selBuildings: new Set(),
      _subtreeBuildingIds: GraphView.prototype._subtreeBuildingIds,
    };
    expect(GraphView.prototype._selectedGroupMembers.call(s).size).toBe(0);
  });
});

describe("GraphView deltaTransform — pan/zoom fast-path math (task 9)", () => {
  it("pan-only (scale unchanged) is a pure translate by the offset delta", () => {
    const d = { scale: 2, tx: 10, ty: 20 };
    const v = { scale: 2, tx: 40, ty: 5 }; // panned +30,-15
    const t = deltaTransform(d, v);
    expect(t.k).toBeCloseTo(1, 1e-9);
    expect(t.bx).toBeCloseTo(30, 1e-9);
    expect(t.by).toBeCloseTo(-15, 1e-9);
    expect(t.str).toBe("translate(30 -15) scale(1)");
  });

  it("identity view -> identity transform", () => {
    const v = { scale: 1.5, tx: 7, ty: -3 };
    const t = deltaTransform(v, v);
    expect(t.k).toBeCloseTo(1, 1e-9);
    expect(t.bx).toBeCloseTo(0, 1e-9);
    expect(t.by).toBeCloseTo(0, 1e-9);
  });

  it("the transform maps an already-drawn screen point to the live screen point", () => {
    // A graph point g, drawn under view d, must land where view v would put it.
    const d = { scale: 1, tx: 0, ty: 0 };
    const v = { scale: 2, tx: 50, ty: -10 };
    const t = deltaTransform(d, v);
    const g = { x: 120, y: 80 };
    const Pd = { x: g.x * d.scale + d.tx, y: g.y * d.scale + d.ty }; // drawn pos
    const Pv = { x: g.x * v.scale + v.tx, y: g.y * v.scale + v.ty }; // wanted pos
    // SVG "translate(b) scale(k)" => k*P + b
    const mapped = { x: t.k * Pd.x + t.bx, y: t.k * Pd.y + t.by };
    expect(mapped.x).toBeCloseTo(Pv.x, 1e-9);
    expect(mapped.y).toBeCloseTo(Pv.y, 1e-9);
  });

  it("zoom folds into a single translate+scale (k = ratio of scales)", () => {
    const d = { scale: 1, tx: 0, ty: 0 };
    const v = { scale: 3, tx: 12, ty: 24 };
    const t = deltaTransform(d, v);
    expect(t.k).toBeCloseTo(3, 1e-9);
    expect(t.bx).toBeCloseTo(12, 1e-9); // v.tx - d.tx*k = 12 - 0
    expect(t.by).toBeCloseTo(24, 1e-9);
  });
});

describe("GraphView gesture fast-path (task 9 + task 10 bar)", () => {
  // Minimal stub: a fake layer root + action bar that record attribute writes,
  // and a _draw spy that recaptures drawnView (as the real _draw does).
  function gestureStub() {
    const root = {
      attrs: {},
      setAttribute(k, val) {
        this.attrs[k] = val;
      },
      removeAttribute(k) {
        delete this.attrs[k];
      },
    };
    const bar = { style: {} };
    const s = {
      view: { scale: 1, tx: 0, ty: 0 },
      _drawnView: { scale: 1, tx: 0, ty: 0 },
      layerRoot: root,
      actionBarEl: bar,
      _barAnchor: { left: 100, top: 50 },
      _gesturing: false,
      _wheelTimer: null,
      _hostRect: { width: 800, height: 600 },
      drawCalls: 0,
      _draw() {
        this.drawCalls++;
        this._drawnView = { ...this.view };
      },
      _onViewChange: GraphView.prototype._onViewChange,
      _applyDeltaTransform: GraphView.prototype._applyDeltaTransform,
      _endGesture: GraphView.prototype._endGesture,
      _requestDraw: GraphView.prototype._requestDraw, // headless: falls through to _draw
    };
    return s;
  }

  it("a pan gesture sets the delta transform WITHOUT a full redraw", () => {
    const s = gestureStub();
    s.view = { scale: 1, tx: 30, ty: -15 };
    s._onViewChange("gesture");
    expect(s._gesturing).toBe(true);
    expect(s.drawCalls).toBe(0); // no rebuild during the gesture
    expect(s.layerRoot.attrs.transform).toBe("translate(30 -15) scale(1)");
  });

  it("translates the floating action bar by the same delta (task 10)", () => {
    const s = gestureStub();
    s.view = { scale: 2, tx: 0, ty: 0 }; // zoom 2x about origin
    s._onViewChange("gesture");
    // bar anchor (100,50) -> k*anchor + b = 2*100+0, 2*50+0
    expect(s.actionBarEl.style.left).toBe("200px");
    expect(s.actionBarEl.style.top).toBe("100px");
  });

  it("gesture end resets the transform and does one full redraw (recaptures drawnView)", () => {
    const s = gestureStub();
    s.view = { scale: 1, tx: 30, ty: 0 };
    s._onViewChange("gesture");
    expect("transform" in s.layerRoot.attrs).toBe(true);
    s._endGesture();
    expect(s._gesturing).toBe(false);
    expect("transform" in s.layerRoot.attrs).toBe(false); // reset to identity
    expect(s.drawCalls).toBe(1);
    expect(s._drawnView).toEqual({ scale: 1, tx: 30, ty: 0 }); // re-baselined
    expect(s._hostRect).toBe(null); // task 10: cache invalidated on gesture end
  });

  it("a wheel gesture arms a debounce timer that ends the gesture when it fires", () => {
    const s = gestureStub();
    s.view = { scale: 1.1, tx: 0, ty: 0 };
    s._onViewChange("wheel");
    expect(s._wheelTimer != null).toBe(true); // debounce armed, no redraw yet
    expect(s.drawCalls).toBe(0);
    const armed = s._wheelTimer;
    s.view = { scale: 1.2, tx: 0, ty: 0 };
    s._onViewChange("wheel"); // a 2nd wheel tick resets the timer
    expect(s._wheelTimer != null).toBe(true);
    expect(s._wheelTimer === armed).toBe(false);
    // simulate the debounce elapsing
    s._endGesture();
    expect(s._wheelTimer).toBe(null);
    expect(s.drawCalls).toBe(1);
  });
});

describe("GraphView._nodeMap / _nodeAt cache (task 11)", () => {
  it("_nodeAt resolves via a Map and caches it per snapshot identity", () => {
    const snap = {
      nodes: [
        { id: "n1", pos: { x: 0, y: 0 } },
        { id: "n2", pos: { x: 1, y: 1 } },
      ],
    };
    const s = {
      snap,
      _nodeMap: GraphView.prototype._nodeMap,
      _nodeAt: GraphView.prototype._nodeAt,
    };
    expect(s._nodeAt("n2").id).toBe("n2");
    const m1 = s._nodeMap();
    const m2 = s._nodeMap();
    expect(m1).toBe(m2); // reused, not rebuilt
    s.snap = { nodes: [{ id: "n3", pos: { x: 0, y: 0 } }] }; // new snapshot
    expect(s._nodeMap()).toBe(s._nodeMap());
    expect(m1).toBe(m1);
    expect(s._nodeAt("n3").id).toBe("n3");
    expect(s._nodeAt("n1")).toBe(undefined); // old node gone from new snap
  });
});

describe("GraphView._dragSubtreeSet — computed once per drag (task 12)", () => {
  it("calls _subtreeBuildingIds once and reuses across calls; recomputes after grab", () => {
    let calls = 0;
    const s = {
      _buildingDrag: { id: "b1", dx: 0, dy: 0 },
      _dragSubtree: null,
      _subtreeBuildingIds() {
        calls++;
        return new Set(["b1", "b2"]);
      },
      _dragSubtreeSet: GraphView.prototype._dragSubtreeSet,
      _grabBuilding: GraphView.prototype._grabBuilding,
    };
    const a = s._dragSubtreeSet();
    const b = s._dragSubtreeSet();
    expect(calls).toBe(1); // not recomputed per call
    expect(a).toBe(b);
    expect([...a].sort()).toEqual(["b1", "b2"]);
    // a fresh grab clears the cache so the next drag recomputes
    s._grabBuilding("b3", 0, 0);
    s._dragSubtreeSet();
    expect(calls).toBe(2);
  });

  it("returns an empty set when no building is being dragged", () => {
    const s = {
      _buildingDrag: null,
      _dragSubtreeSet: GraphView.prototype._dragSubtreeSet,
    };
    expect(s._dragSubtreeSet().size).toBe(0);
  });
});

describe("GraphView.reconcileSelection — drop stale selection (task 27)", () => {
  const snap = {
    nodes: [{ id: "n1" }, { id: "n2" }],
    buildings: [{ id: "b1" }],
    links: [{ id: "l1" }],
  };
  function selStub(over) {
    return {
      selectedId: null,
      selectedBuildingId: null,
      selectedLinkId: null,
      selNodes: new Set(),
      selBuildings: new Set(),
      reconcileSelection: GraphView.prototype.reconcileSelection,
      ...over,
    };
  }

  it("clears a single node selection that no longer exists", () => {
    const s = selStub({ selectedId: "gone" });
    expect(s.reconcileSelection(snap)).toBe(true);
    expect(s.selectedId).toBe(null);
  });

  it("keeps a single node selection that still exists", () => {
    const s = selStub({ selectedId: "n1" });
    expect(s.reconcileSelection(snap)).toBe(false);
    expect(s.selectedId).toBe("n1");
  });

  it("clears a stale building + link selection", () => {
    const s = selStub({ selectedBuildingId: "bX", selectedLinkId: "lX" });
    expect(s.reconcileSelection(snap)).toBe(true);
    expect(s.selectedBuildingId).toBe(null);
    expect(s.selectedLinkId).toBe(null);
  });

  it("prunes only the absent members from the multi-selection sets", () => {
    const s = selStub({
      selNodes: new Set(["n1", "gone"]),
      selBuildings: new Set(["b1", "bGone"]),
    });
    expect(s.reconcileSelection(snap)).toBe(true);
    expect([...s.selNodes]).toEqual(["n1"]);
    expect([...s.selBuildings]).toEqual(["b1"]);
  });
});

describe("GraphView._toggleSelect — Ctrl+click folds in a prior single selection", () => {
  const stub = (over) => ({
    selectedId: null,
    selectedBuildingId: null,
    selNodes: new Set(),
    selBuildings: new Set(),
    _draw() {},
    onSelectionChange() {},
    ...over,
  });

  it("includes a previously single-selected node so the count isn't off by one", () => {
    const s = stub({ selectedId: "n1" }); // plain-clicked first, then Ctrl+click n2
    GraphView.prototype._toggleSelect.call(s, "n2", false);
    expect([...s.selNodes].sort()).toEqual(["n1", "n2"]); // BOTH counted (was off-by-one)
    expect(s.selectedId).toBe(null); // folded into the multi-selection
  });

  it("plain toggle (no prior single selection) adds then removes", () => {
    const s = stub({ selNodes: new Set(["a"]) });
    GraphView.prototype._toggleSelect.call(s, "b", false);
    expect([...s.selNodes].sort()).toEqual(["a", "b"]);
    GraphView.prototype._toggleSelect.call(s, "a", false); // toggle off
    expect([...s.selNodes].sort()).toEqual(["b"]);
  });
});

describe("actionBarSpec — single-machine vs multi-selection button list", () => {
  const labels = (spec) => spec.map((b) => b.label);
  const ids = (spec) => spec.map((b) => b.id);

  it("single machine (sets empty, selectedId set): Copy + Delete, NO Group", () => {
    const spec = actionBarSpec({
      selNodesSize: 0,
      selBuildingsSize: 0,
      selectedId: "n1",
      clipboardNonEmpty: false,
    });
    expect(labels(spec)).toEqual(["Copy", "Delete"]);
    expect(ids(spec).includes("group")).toBe(false);
    // delete reads exactly "Delete" (not the bulk "Delete All")
    expect(spec.find((b) => b.id === "delete").label).toBe("Delete");
  });

  it("single machine with a clipboard adds Paste between Copy and Delete", () => {
    const spec = actionBarSpec({
      selNodesSize: 0,
      selBuildingsSize: 0,
      selectedId: "n1",
      clipboardNonEmpty: true,
    });
    expect(labels(spec)).toEqual(["Copy", "Paste", "Delete"]);
  });

  it("multi loose nodes: Group + Copy + Delete All (unchanged)", () => {
    const spec = actionBarSpec({
      selNodesSize: 2,
      selBuildingsSize: 0,
      selectedId: null,
      clipboardNonEmpty: false,
    });
    expect(labels(spec)).toEqual(["Group", "Copy", "Delete All"]);
  });

  it("multi with clipboard: Group + Copy + Paste + Delete All", () => {
    const spec = actionBarSpec({
      selNodesSize: 1,
      selBuildingsSize: 0,
      selectedId: null,
      clipboardNonEmpty: true,
    });
    expect(labels(spec)).toEqual(["Group", "Copy", "Paste", "Delete All"]);
  });

  it("a single selected group (1 building, 0 nodes) hides Group", () => {
    const spec = actionBarSpec({
      selNodesSize: 0,
      selBuildingsSize: 1,
      selectedId: null,
      clipboardNonEmpty: false,
    });
    expect(labels(spec)).toEqual(["Copy", "Delete All"]);
  });

  it("two selected groups show Group (grouping nests them)", () => {
    const spec = actionBarSpec({
      selNodesSize: 0,
      selBuildingsSize: 2,
      selectedId: null,
      clipboardNonEmpty: false,
    });
    expect(labels(spec)).toEqual(["Group", "Copy", "Delete All"]);
  });

  it("multi takes precedence over a stray selectedId (no single fallback)", () => {
    const spec = actionBarSpec({
      selNodesSize: 1,
      selBuildingsSize: 0,
      selectedId: "n1",
      clipboardNonEmpty: false,
    });
    expect(labels(spec)).toEqual(["Group", "Copy", "Delete All"]);
  });
});

describe("GraphView single-mode action bar helpers", () => {
  it("_barBBox: single selectedId yields that machine's box when sets are empty", () => {
    const s = {
      selNodes: new Set(),
      selBuildings: new Set(),
      selectedId: "n1",
      snap: { nodes: [{ id: "n1", pos: { x: 100, y: 200 } }], buildings: [] },
      _selectionBBox: GraphView.prototype._selectionBBox,
      _barBBox: GraphView.prototype._barBBox,
      _nodeAt: (id) => s.snap.nodes.find((n) => n.id === id),
    };
    const box = s._barBBox();
    expect(box.x).toBe(100);
    expect(box.y).toBe(200);
    expect(box.w).toBe(120); // NODE_W
    expect(box.h).toBe(64); // NODE_H
  });

  it("_barBBox: nothing selected -> null", () => {
    const s = {
      selNodes: new Set(),
      selBuildings: new Set(),
      selectedId: null,
      snap: { nodes: [], buildings: [] },
      _selectionBBox: GraphView.prototype._selectionBBox,
      _barBBox: GraphView.prototype._barBBox,
      _nodeAt: () => undefined,
    };
    expect(s._barBBox()).toBe(null);
  });

  it("_selectionMemberIds: falls back to [selectedId] in single mode", () => {
    const s = {
      selNodes: new Set(),
      selBuildings: new Set(),
      selectedId: "n7",
      snap: { nodes: [], buildings: [] },
      _selectionMemberIds: GraphView.prototype._selectionMemberIds,
      _subtreeBuildingIds: GraphView.prototype._subtreeBuildingIds,
    };
    expect(s._selectionMemberIds()).toEqual(["n7"]);
  });

  it("_deleteSingleSelection: dispatches RemoveNode for the selected machine + clears", () => {
    const dispatched = [];
    let onSelectArg = "unset";
    const s = {
      selectedId: "n3",
      game: { dispatch: (i) => dispatched.push(i) }, // no getSnapshot (guarded)
      reconcileSelection: GraphView.prototype.reconcileSelection,
      onSelect: (id) => (onSelectArg = id),
      _draw() {},
      _deleteSingleSelection: GraphView.prototype._deleteSingleSelection,
    };
    s._deleteSingleSelection();
    expect(dispatched).toEqual([{ type: "RemoveNode", nodeId: "n3" }]);
    expect(s.selectedId).toBe(null);
    expect(onSelectArg).toBe(null); // inspector closed
  });

  it("_deleteSingleSelection: no-op when nothing is single-selected", () => {
    const dispatched = [];
    const s = {
      selectedId: null,
      game: { dispatch: (i) => dispatched.push(i) },
      _deleteSingleSelection: GraphView.prototype._deleteSingleSelection,
    };
    s._deleteSingleSelection();
    expect(dispatched.length).toBe(0);
  });

  it("_barHasSelection: true for a lone selectedId, false when fully clear", () => {
    const base = {
      selNodes: new Set(),
      selBuildings: new Set(),
      selectedId: null,
      hasSelection: GraphView.prototype.hasSelection,
      _barHasSelection: GraphView.prototype._barHasSelection,
    };
    expect(base._barHasSelection()).toBe(false);
    base.selectedId = "n1";
    expect(base._barHasSelection()).toBe(true);
  });
});
