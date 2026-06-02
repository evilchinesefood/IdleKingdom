import { Game } from "./Source/Engine/Game.js";
import { FakeClock } from "./Source/Engine/Clock.js";
import { MemoryStorageAdapter } from "./Source/Engine/Persistence/MemoryStorageAdapter.js";
import { content } from "./Source/Engine/Content/Content.js";
import { INTENT } from "./Source/Engine/Intents.js";
import { applyOffline } from "./Source/Engine/Simulation/Offline.js";

const g = new Game({ content, clock: new FakeClock(0) });
g.bootstrap(new MemoryStorageAdapter());
g.getState().currencies.gold = 1e9;
delete g.getState()._solved;

const r1 = g.dispatch({ type: INTENT.PlaceNode, kind: "storage", pos: { x: 0, y: 0 } });
console.log("PlaceNode ok?", r1.ok, r1.error || "");
const nodes1 = g.getState().graph.nodes;
const sid = nodes1[nodes1.length - 1].id;
const r2 = g.dispatch({ type: INTENT.SetStorageRule, nodeId: sid, resourceId: "iron_ore" });
console.log("SetStorageRule ok?", r2.ok, r2.error || "");

let st = g.getState();
let node = st.graph.nodes.find((n) => n.id === sid);
node.stockpile = { iron_ore: 100 };
st.unlocks.autoSell = true;
st.lastSeen = 0;
const gold0 = st.currencies.gold;

const summary = applyOffline(st, content, 60 * 1000);
node = st.graph.nodes.find((n) => n.id === sid);
console.log("iron_ore basePrice =", content.resources.iron_ore.basePrice);
console.log("offline gold gained:", st.currencies.gold - gold0);
console.log("storage stockpile after offline:", JSON.stringify(node.stockpile));
console.log("summary.gained:", JSON.stringify(summary.gained));
