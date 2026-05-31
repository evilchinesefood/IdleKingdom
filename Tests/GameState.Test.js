import { describe, it, expect } from "./Runner.js";
import { NewGame, clone, freeze, validate, SAVE_VERSION } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";

describe("GameState.NewGame", () => {
  it("stamps version and clock timestamps", () => {
    const g = NewGame(new FakeClock(1000));
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.savedAt).toBe(1000);
    expect(g.lastSeen).toBe(1000);
    expect(g.meta.createdAt).toBe(1000);
  });

  it("MAJOR #4/#5: only r_iron_bar unlocked, warden seed hero, t_gatehouse first", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.unlocks.recipesUnlocked).toEqual(["r_iron_bar"]);
    expect(g.heroes[0].templateId).toBe("hero_warden");
    expect(g.territories.available).toEqual(["t_gatehouse"]);
    expect(g.territories.reclaimed).toEqual([]);
  });

  it("seeds the Mine -> Smelt -> Market chain", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.graph.nodes.map((n) => n.kind)).toEqual(["gatherer", "smelter", "market"]);
    expect(g.graph.nodes[0].resourceId).toBe("iron_ore");
    expect(g.graph.nodes[1].recipeId).toBe("r_iron_bar");
    expect(g.graph.links.length).toBe(2);
    expect(g.graph.links[0]).toEqual({ id: "l_0", from: "n_miner_0", to: "n_smelter_0", resourceId: "iron_ore" });
  });

  it("brand-new game has no active expedition", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.expeditions.active).toBe(null);
  });

  it("starts with 25 gold and zero research/renown", () => {
    const g = NewGame(new FakeClock(0));
    expect(g.currencies.gold).toBe(25.0);
    expect(g.currencies.research).toBe(0.0);
    expect(g.currencies.renown).toBe(0.0);
  });

  it("two NewGames do not share references", () => {
    const a = NewGame(new FakeClock(0));
    const b = NewGame(new FakeClock(0));
    a.graph.nodes[0].level = 99;
    expect(b.graph.nodes[0].level).toBe(1);
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
    g.graph.links.push({ id: "l_bad", from: "n_ghost", to: "n_market_0", resourceId: "iron_bar" });
    expect(validate(g)).toBe(false);
  });
});
