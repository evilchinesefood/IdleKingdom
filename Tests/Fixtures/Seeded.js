import { NewGame } from "../../Source/Engine/GameState.js";

// A fresh game IDENTICAL to NewGame() except the classic Mine -> Smelt -> Market
// chain is injected. The live game now starts with an EMPTY graph (the player
// builds everything), so engine tests that need a working factory as their
// fixture use this instead of NewGame()/START_STATE. Returns a deep, independent
// clone each call (tests mutate it).
export function seededState(clock) {
  const s = NewGame(clock);
  s.graph = {
    nodes: [
      {
        id: "n_miner_0",
        kind: "gatherer",
        level: 1,
        resourceId: "iron_ore",
        recipeId: null,
        stockpile: { iron_ore: 0.0 },
        pos: { x: 120, y: 200 },
      },
      {
        id: "n_smelter_0",
        kind: "smelter",
        level: 1,
        resourceId: null,
        recipeId: "r_iron_bar",
        stockpile: { iron_bar: 0.0 },
        pos: { x: 360, y: 200 },
      },
      {
        id: "n_market_0",
        kind: "market",
        level: 1,
        resourceId: null,
        recipeId: null,
        stockpile: {},
        pos: { x: 600, y: 200 },
      },
    ],
    links: [
      {
        id: "l_0",
        from: "n_miner_0",
        to: "n_smelter_0",
        resourceId: "iron_ore",
      },
      {
        id: "l_1",
        from: "n_smelter_0",
        to: "n_market_0",
        resourceId: "iron_bar",
      },
    ],
    nextNodeSeq: 1,
    nextLinkSeq: 2,
  };
  delete s._solved;
  return s;
}
