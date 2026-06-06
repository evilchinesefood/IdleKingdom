import { describe, it, expect } from "./Runner.js";
import {
  NewGame,
  clone,
  freeze,
  validate,
  SAVE_VERSION,
} from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";

describe("GameState.NewGame", () => {
  it("stamps version and clock timestamps", () => {
    const g = NewGame(new FakeClock(1000));
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.savedAt).toBe(1000);
    expect(g.lastSeen).toBe(1000);
    expect(g.meta.createdAt).toBe(1000);
  });

  it("MAJOR #4/#5: only r_iron_bar unlocked, no heroes key, empty reclaimed", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect("heroes" in g).toBe(false);
    expect(g.territories.reclaimed).toEqual([]);
    expect("available" in g.territories).toBe(false);
  });

  it("starts with an EMPTY graph (the player builds everything)", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.graph.nodes.length).toBe(0);
    expect(g.graph.links.length).toBe(0);
    expect(g.graph.nextNodeSeq).toBe(0);
    expect(g.graph.nextLinkSeq).toBe(0);
  });

  it("brand-new game seeds siege.progress === 0 and no heroes/expeditions keys", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.siege.progress).toBe(0);
    expect("heroes" in g).toBe(false);
    expect("expeditions" in g).toBe(false);
  });

  it("starts with 25 gold and zero research (no renown)", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.currencies.gold).toBe(25.0);
    expect(g.currencies.research).toBe(0.0);
    expect("renown" in g.currencies).toBe(false);
  });

  it("defaults unlocks.gathererResources to [] (task 8)", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.unlocks.gathererResources).toEqual([]);
  });

  it("two NewGames do not share references", () => {
    const a = NewGame(new FakeClock(0));
    const b = NewGame(new FakeClock(0));
    // mutate one game's state and confirm the other is untouched (deep clone)
    a.currencies.gold = 999;
    a.unlocks.recipesUnlocked.push("r_steel");
    a.graph.nodes.push({ id: "x", kind: "gatherer" });
    expect(b.currencies.gold).toBe(25.0);
    expect(b.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(b.graph.nodes.length).toBe(0);
  });
});

describe("GameState.clone", () => {
  it("produces an independent deep copy", () => {
    const g = NewGame(new FakeClock(0));
    const c = clone(g);
    c.currencies.gold = 999;
    expect(g.currencies.gold).toBe(25.0);
  });

  it("strips the non-persisted _solved cache", () => {
    const g = NewGame(new FakeClock(0));
    g._solved = { goldRate: 2.0 };
    const c = clone(g);
    expect(c._solved).toBe(undefined);
  });
});

describe("GameState.freeze", () => {
  it("returns a deeply frozen object", () => {
    const g = NewGame(new FakeClock(0));
    const f = freeze(g);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.currencies)).toBe(true);
    expect(Object.isFrozen(f.graph.nodes[0])).toBe(true);
  });
});

describe("GameState.validate", () => {
  it("accepts a fresh NewGame", () => {
    expect(validate(NewGame(new FakeClock(0)))).toBe(true);
  });
  it("rejects null / non-object", () => {
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
  });
  it("rejects missing required keys", () => {
    const g = NewGame(new FakeClock(0));
    delete g.currencies;
    expect(validate(g)).toBe(false);
  });
  it("rejects non-finite currencies", () => {
    const g = NewGame(new FakeClock(0));
    g.currencies.gold = Infinity;
    expect(validate(g)).toBe(false);
  });
  it("rejects a link pointing at a missing node", () => {
    const g = NewGame(new FakeClock(0));
    g.graph.links.push({
      id: "l_bad",
      from: "n_ghost",
      to: "n_market_0",
      resourceId: "iron_bar",
    });
    expect(validate(g)).toBe(false);
  });
});

describe("GameState.validate — content-aware bounds (task 3)", () => {
  it("rejects a cyclic graph when content is supplied", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.graph.nodes.push(
      {
        id: "a",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "b",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    );
    g.graph.links.push(
      { id: "lc0", from: "a", to: "b", resourceId: "iron_bar" },
      { id: "lc1", from: "b", to: "a", resourceId: "iron_bar" },
    );
    expect(validate(g, content)).toBe(false); // cycle
    // without content the cycle check is skipped (shape-only) -> still true
    expect(validate(g)).toBe(true);
  });

  it("rejects an unknown node kind when content is supplied", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.graph.nodes.push({
      id: "x",
      kind: "not_a_machine",
      level: 1,
      resourceId: null,
      recipeId: null,
      stockpile: {},
      pos: { x: 0, y: 0 },
    });
    expect(validate(g, content)).toBe(false);
  });

  it("rejects a crafter with an unknown recipeId", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.graph.nodes.push({
      id: "x",
      kind: "smelter",
      level: 1,
      resourceId: null,
      recipeId: "r_nope",
      stockpile: {},
      pos: { x: 0, y: 0 },
    });
    expect(validate(g, content)).toBe(false);
  });

  it("ACCEPTS a crafter with no recipe yet (null recipeId) — a just-placed smelter must not wipe the save", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.graph.nodes.push({
      id: "x",
      kind: "smelter",
      level: 1,
      resourceId: null,
      recipeId: null, // placed, recipe not assigned yet — legal, common
      stockpile: {},
      pos: { x: 0, y: 0 },
    });
    expect(validate(g, content)).toBe(true);
  });

  it("rejects a link carrying an unknown resourceId", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.graph.nodes.push(
      {
        id: "a",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: {},
        pos: { x: 0, y: 0 },
      },
      {
        id: "b",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: {},
        pos: { x: 1, y: 0 },
      },
    );
    g.graph.links.push({
      id: "lr",
      from: "a",
      to: "b",
      resourceId: "unobtanium",
    });
    expect(validate(g, content)).toBe(false);
  });

  it("rejects a save with a missing siege block", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    delete g.siege;
    expect(validate(g, content)).toBe(false);
  });

  it("rejects a save with a NaN siege.progress", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    const g = NewGame(new FakeClock(0));
    g.siege.progress = NaN;
    expect(validate(g, content)).toBe(false);
  });

  it("accepts a fresh NewGame with content supplied", async () => {
    const { content } = await import("../Source/Engine/Content/Content.js");
    expect(validate(NewGame(new FakeClock(0)), content)).toBe(true);
  });
});
