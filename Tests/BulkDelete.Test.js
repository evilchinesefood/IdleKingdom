import { describe, it, expect } from "./Runner.js";
import { GraphView } from "../Source/UI/GraphView.js";
import { iconName } from "../Source/UI/Icons.js";

// Drive GraphView._onSelectBox in isolation via a stub `this` (no canvas/DOM needed)
// to lock the delete-vs-create branch: delete mode must NEVER create a building, and
// select mode must NEVER delete one.
function stub(mode, buildings, nodes = []) {
  const dispatched = [];
  return {
    _mode: mode,
    snap: { buildings, nodes },
    selectedBuildingId: "b0",
    game: {
      dispatch: (i) => dispatched.push(i),
      getSnapshot: () => ({ buildings: [] }),
    },
    _draw() {},
    onModeChange() {},
    _selectBuilding() {},
    dispatched,
  };
}

describe("GraphView._onSelectBox — delete vs create branch", () => {
  it("delete mode deletes only the buildings the box intersects, never creates", () => {
    const s = stub("delete", [
      { id: "b1", rect: { x: 0, y: 0, w: 100, h: 100 } }, // intersects box
      { id: "b2", rect: { x: 500, y: 500, w: 50, h: 50 } }, // outside box
    ]);
    GraphView.prototype._onSelectBox.call(s, {
      x: -10,
      y: -10,
      w: 200,
      h: 200,
    });
    const types = s.dispatched.map((d) => d.type);
    expect(types.includes("CreateBuilding")).toBe(false);
    expect(
      s.dispatched
        .filter((d) => d.type === "DeleteBuilding")
        .map((d) => d.buildingId),
    ).toEqual(["b1"]);
  });

  it("select mode groups machines, never deletes", () => {
    const s = stub(
      "select",
      [],
      [{ id: "n1", building: null, pos: { x: 10, y: 10 } }],
    );
    GraphView.prototype._onSelectBox.call(s, { x: 0, y: 0, w: 300, h: 300 });
    const types = s.dispatched.map((d) => d.type);
    expect(types.includes("DeleteBuilding")).toBe(false);
    expect(types.includes("CreateBuilding")).toBe(true);
  });

  it("a tiny drag (rect < 8) is a no-op in delete mode", () => {
    const s = stub("delete", [
      { id: "b1", rect: { x: 0, y: 0, w: 100, h: 100 } },
    ]);
    GraphView.prototype._onSelectBox.call(s, { x: 0, y: 0, w: 4, h: 4 });
    expect(s.dispatched.length).toBe(0);
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
  it("market keeps its kind icon (no single resource)", () => {
    expect(ni(gv(), { kind: "market" })).toBe(iconName("market"));
  });
});
