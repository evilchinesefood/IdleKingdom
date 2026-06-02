import { describe, it, expect } from "./Runner.js";
import { Game } from "../Source/Engine/Game.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "../Source/Engine/Content/Content.js";
import { INTENT } from "../Source/Engine/Intents.js";
import { reduce } from "../Source/Engine/Reducer.js";
import { pasteCost } from "../Source/Engine/Systems/EconomySystem.js";
import { upgradeCost } from "../Source/Engine/Systems/EconomySystem.js";

function newGame(gold = 1e6) {
  const game = new Game({ content, clock: new FakeClock(0) });
  game.bootstrap(new MemoryStorageAdapter());
  game.getState().currencies.gold = gold;
  delete game.getState()._solved;
  return game;
}

// A clipboard of a gatherer -> smelter pair with one internal link.
const clip = () => ({
  nodes: [
    {
      kind: "gatherer",
      level: 1,
      recipeId: null,
      resourceId: "iron_ore",
      dx: 0,
      dy: 0,
    },
    {
      kind: "smelter",
      level: 2,
      recipeId: "r_iron_bar",
      resourceId: null,
      dx: 200,
      dy: 0,
    },
  ],
  links: [{ fromIdx: 0, toIdx: 1, resourceId: "iron_ore" }],
});

describe("EconomySystem.pasteCost", () => {
  it("sums each node's structure (L0) + upgrade ladder to its level", () => {
    const nodes = clip().nodes;
    // gatherer L1: upgradeBase(0). smelter L2: upgradeBase(0) + upgrade(1).
    const expected =
      upgradeCost("gatherer", 0, content) +
      upgradeCost("smelter", 0, content) +
      upgradeCost("smelter", 1, content);
    expect(pasteCost(nodes, content)).toBeCloseTo(expected, 1e-9);
  });
});

describe("Reducer PasteNodes", () => {
  it("creates the nodes + links and deducts pasteCost", () => {
    const game = newGame(1e6);
    const before = game.getState().graph.nodes.length;
    const goldBefore = game.getState().currencies.gold;
    const c = clip();
    const out = game.dispatch({
      type: INTENT.PasteNodes,
      nodes: c.nodes,
      links: c.links,
      at: { x: 500, y: 300 },
    });
    expect(out.ok).toBe(true);
    const st = game.getState();
    expect(st.graph.nodes.length).toBe(before + 2);
    expect(st.graph.links.length).toBe(1);
    // gold deducted by exactly pasteCost
    expect(goldBefore - st.currencies.gold).toBeCloseTo(
      pasteCost(c.nodes, content),
      1e-9,
    );
    // positions = at + dx/dy
    const pasted = st.graph.nodes.slice(-2);
    expect(pasted[0].pos).toEqual({ x: 500, y: 300 });
    expect(pasted[1].pos).toEqual({ x: 700, y: 300 });
    expect(pasted[1].level).toBe(2);
    // the link connects the two freshly-created nodes
    const link = st.graph.links.slice(-1)[0];
    expect(link.from).toBe(pasted[0].id);
    expect(link.to).toBe(pasted[1].id);
    expect(link.resourceId).toBe("iron_ore");
  });

  it("rejects when gold < cost (state object unchanged)", () => {
    // reduce() directly so the assertion is on reducer purity (Game.dispatch's
    // flash-once error + lazy re-solve mutate unrelated facade fields).
    const game = newGame(0);
    const s = game.getState();
    const c = clip();
    const before = JSON.stringify(s);
    const out = reduce(
      s,
      {
        type: INTENT.PasteNodes,
        nodes: c.nodes,
        links: c.links,
        at: { x: 0, y: 0 },
      },
      content,
    );
    expect(out.error).toBeTruthy();
    expect(out.state).toBe(s); // same object returned on reject
    expect(JSON.stringify(s)).toBe(before);
  });

  it("carries resourceIds for a storage node", () => {
    const game = newGame(1e6);
    const out = game.dispatch({
      type: INTENT.PasteNodes,
      nodes: [
        {
          kind: "storage",
          level: 1,
          recipeId: null,
          resourceId: null,
          resourceIds: ["iron_bar"],
          dx: 0,
          dy: 0,
        },
      ],
      links: [],
      at: { x: 10, y: 10 },
    });
    expect(out.ok).toBe(true);
    const pasted = game.getState().graph.nodes.slice(-1)[0];
    expect(pasted.kind).toBe("storage");
    expect(pasted.resourceIds).toEqual(["iron_bar"]);
  });
});
