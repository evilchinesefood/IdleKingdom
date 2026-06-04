import { describe, it, expect } from "./Runner.js";
import { GraphView } from "../Source/UI/GraphView.js";
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
