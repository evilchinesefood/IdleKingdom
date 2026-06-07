import {
  upgradeCost,
  buildingCopyCosts,
  storageCapacity,
} from "./Systems/EconomySystem.js";
import {
  researchStatus,
  canBuyResearch,
  TUNING,
  tuningRank,
  tuningCost,
  canBuyTuning,
} from "./Systems/ResearchSystem.js";
import { nextTerritory } from "./Systems/SiegeSystem.js";

function fmt(n) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return (Math.round(n * 100) / 100).toString();
}

// Shared frozen empty stockpile — most nodes have none; avoids a throwaway {} per node per build.
const EMPTY_STOCKPILE = Object.freeze({});

// ---------------------------------------------------------------------------
// Memoization for sub-arrays that only change on unlock/reclaim/structural events.
// Stored on the module so the cache persists across calls within a session.
// ---------------------------------------------------------------------------

// Memo entry shape: { key: string, value: any }
let _researchMemo = null;
let _tuningMemo = null;
let _territoriesMemo = null;
// buildings cost memo: keyed on graph identity + per-building id/nodeIds/rect
let _buildingsCostMemo = null;

function _researchKey(state) {
  const u = state.unlocks;
  // Floor both balances: affordable flips when a floor-integer threshold crosses.
  // Avoids churn from sub-integer accumulation between 2s HUD ticks while still
  // updating at most once per accumulated unit (well within the refresh cadence).
  const rBal = Math.floor(state.currencies.research || 0);
  const gBal = Math.floor(state.currencies.gold || 0);
  return (
    (u.researchOwned ? u.researchOwned.length : 0) +
    "|" +
    (u.recipesUnlocked ? u.recipesUnlocked.length : 0) +
    "|" +
    (u.machinesUnlocked ? u.machinesUnlocked.length : 0) +
    "|" +
    (u.titheRate ?? 0) +
    "|" +
    rBal +
    "|" +
    gBal +
    "|" +
    (state.territories && state.territories.reclaimed
      ? state.territories.reclaimed.join(",")
      : "")
  );
}

function _tuningKey(state) {
  const u = state.unlocks;
  const kinds = u.machinesUnlocked ? u.machinesUnlocked.join(",") : "";
  const bonuses = u.productionBonuses
    ? Object.values(u.productionBonuses).join(",")
    : "";
  const ranks = u.tuningRanks ? Object.values(u.tuningRanks).join(",") : "";
  // Floor research balance: affordable flips when this changes.
  const rBal = Math.floor(state.currencies.research || 0);
  return kinds + "|" + bonuses + "|" + ranks + "|" + rBal;
}

function _territoriesKey(state) {
  return (
    (state.territories && state.territories.reclaimed
      ? state.territories.reclaimed.join(",")
      : "") +
    "|" +
    (state.siege && state.siege.progress != null
      ? Math.floor(state.siege.progress)
      : 0)
  );
}

function _buildingsCostKey(state) {
  const bl = state.graph.buildings || [];
  if (bl.length === 0) return "0"; // nothing to key — skip the O(nodes) walk
  // Key on building count + each building's id + nodeIds length + node levels
  // (copyCost depends on levels). Cheap string that changes on any structural edit.
  return (
    bl.length +
    "|" +
    bl.map((b) => b.id + ":" + (b.nodeIds ? b.nodeIds.length : 0)).join(",") +
    "|" +
    (state.graph.nodes || []).map((n) => n.id + "." + n.level).join(",")
  );
}

/** Empty snapshot for pre-load rendering (no game state yet). Shape mirrors build() output. */
export function empty(content) {
  return Object.freeze({
    currencies: Object.freeze({ gold: 0, research: 0 }),
    rates: Object.freeze({ goldRate: 0, researchRate: 0 }),
    currencyStrings: Object.freeze({
      gold: "0",
      research: "0",
      goldRate: "0/s",
      researchRate: "0/s",
    }),
    nodes: Object.freeze([]),
    links: Object.freeze([]),
    buildings: Object.freeze([]),
    research: Object.freeze([]),
    tuning: Object.freeze([]),
    territories: Object.freeze([]),
    siege: Object.freeze({
      targetId: null,
      progress: 0,
      cost: null,
      rate: 0,
      etaSeconds: null,
    }),
    buildMenu: Object.freeze({
      placeableMachines: [],
      unlockedRecipes: [],
      gathererResources: [],
      unlockedResources: [],
    }),
    save: Object.freeze({ status: "ok", lastSavedAt: null }),
    meta: Object.freeze({ won: false, seenVictory: false, tutorialDone: true }),
    lastError: null,
  });
}

export function build(state, solved, content, lastError = null) {
  const goldRate = solved.goldRate || 0;
  const researchRate = solved.researchRate || 0;

  const buildingList = state.graph.buildings || [];
  const nodeBuilding = {}; // nodeId -> buildingId (membership lookup for the UI)
  for (const b of buildingList)
    for (const nid of b.nodeIds) nodeBuilding[nid] = b.id;

  // How much each node actually SHIPS downstream (sum of its outbound link flows) —
  // drives the "working" animation: a producer only counts as working if its output
  // is being consumed, not merely produced into the void.
  const outFlow = {};
  for (const l of state.graph.links)
    outFlow[l.from] =
      (outFlow[l.from] || 0) +
      ((solved.linkFlow && solved.linkFlow[l.id]) || 0);

  const nodes = state.graph.nodes.map((node) => {
    const cap = (solved.capacityByNode && solved.capacityByNode[node.id]) || 0;
    const out = (solved.availableOut && solved.availableOut[node.id]) || {};
    const drawMap = (solved.perNodeDraw && solved.perNodeDraw[node.id]) || {};
    const producerRate = Object.values(out).reduce((a, b) => a + b, 0);
    const consumerRate = Object.values(drawMap).reduce((a, b) => a + b, 0);
    const isConsumer = node.kind === "scholar" || node.kind === "market";
    // barracks is a crafter-SINK: troops never enter the resource graph, so
    // availableOut[id] = {} and producerRate = 0.  Use the troop muster rate
    // (siegeRateByNode) as the throughput basis so capacityPct/atCapacity/starved
    // reflect real supply rather than being permanently zero / starved.
    const isBarracks = node.kind === "barracks";
    const troopRate = isBarracks
      ? (solved.siegeRateByNode && solved.siegeRateByNode[node.id]) || 0
      : 0;
    const throughput = isBarracks
      ? troopRate
      : isConsumer
        ? consumerRate
        : producerRate;
    // storage is excluded: its `cap` is an oversized passthrough ceiling, not a demand,
    // so it must not read as starved when running below it (gatherers take no input).
    // barracks uses troopRate above, so exclude it from the generic producerRate path.
    const takesInput =
      node.kind !== "gatherer" && node.kind !== "storage" && !isBarracks;
    const EPS = 1e-6;
    const heldIds = node.kind === "storage" ? node.resourceIds || [] : null;
    // storage passes each held type through up to `cap`, so its effective ceiling
    // for the bar / MAX is cap * (number of held types), not a single `cap`.
    const capBasis =
      node.kind === "storage" ? cap * Math.max(1, heldIds.length) : cap;
    const atCapacity = capBasis > 0 && throughput >= capBasis - EPS;
    // barracks: starved uses the same cap>0 && throughput<cap check, but now
    // throughput = troopRate so the condition is true only when genuinely under-fed.
    const starved = isBarracks
      ? cap > 0 && troopRate < cap - EPS
      : cap > 0 && takesInput && throughput < cap - EPS;
    // "working" = actively moving USED resources (drives the moving-parts animation):
    // a producer must be SHIPPING output downstream (not producing into the void or a
    // full chain), and a consumer/storage must be drawing input. Anything with no flow
    // is idle. NOT gated on `starved` — an under-fed machine is still working (slowly);
    // the LOW badge signals starvation separately.
    const isProducer =
      node.kind === "gatherer" ||
      node.kind === "smelter" ||
      node.kind === "workshop";
    const usefulRate = isProducer ? outFlow[node.id] || 0 : consumerRate;
    const working = usefulRate > EPS;
    const cost = upgradeCost(node.kind, node.level, content);
    return {
      id: node.id,
      kind: node.kind,
      level: node.level,
      resourceId: node.resourceId,
      resourceIds: heldIds, // storage: the resource types it holds (null otherwise)
      recipeId: node.recipeId,
      pos: { x: node.pos.x, y: node.pos.y },
      capacity: cap,
      effectiveRate: producerRate,
      throughput,
      capacityPct: capBasis > 0 ? Math.min(1, throughput / capBasis) : 0,
      atCapacity,
      starved,
      working,
      draw: drawMap,
      surplus: (solved.surplusRate && solved.surplusRate[node.id]) || {},
      stockpile: node.stockpile ? { ...node.stockpile } : EMPTY_STOCKPILE,
      upgradeCost: cost,
      canAfford: state.currencies.gold >= cost,
      building: nodeBuilding[node.id] || null,
      // storage room: SHARED total hold cap (across all held types) + total currently held
      storageCap:
        node.kind === "storage" ? storageCapacity(node, content) : null,
      storedTotal:
        node.kind === "storage" && node.stockpile
          ? (heldIds || []).reduce((a, r) => a + (node.stockpile[r] || 0), 0)
          : 0,
      // headline output for nodes that produce currency, not a resource
      goldOut: (solved.goldByNode && solved.goldByNode[node.id]) || 0,
      researchOut:
        (solved.researchByNode && solved.researchByNode[node.id]) || 0,
      siegeOut:
        (solved.siegeRateByNode && solved.siegeRateByNode[node.id]) || 0,
      // the resource this node ships downstream (null for barracks/market/scholar)
      outputResourceId: (() => {
        if (node.kind === "gatherer") return node.resourceId || null;
        if (node.kind === "smelter" || node.kind === "workshop") {
          const r = content.recipes[node.recipeId];
          return (r && r.output) || null;
        }
        if (node.kind === "storage")
          return (node.resourceIds && node.resourceIds[0]) || null;
        return null;
      })(),
    };
  });

  const costIdx = new Map(state.graph.nodes.map((n) => [n.id, n]));
  const bKey = _buildingsCostKey(state);
  let buildingsCostData;
  if (_buildingsCostMemo && _buildingsCostMemo.key === bKey) {
    buildingsCostData = _buildingsCostMemo.value;
  } else {
    buildingsCostData = buildingList.map((b) => {
      const costs = buildingCopyCosts(b, state, content, costIdx);
      return {
        id: b.id,
        copyCost: costs.withUpgrades,
        copyCostStructure: costs.structure,
      };
    });
    _buildingsCostMemo = { key: bKey, value: buildingsCostData };
  }
  const byCostId = new Map(buildingsCostData.map((x) => [x.id, x]));
  const gold = state.currencies.gold;
  const buildings = buildingList.map((b) => {
    const cd = byCostId.get(b.id) || { copyCost: 0, copyCostStructure: 0 };
    return {
      id: b.id,
      name: b.name,
      nodeIds: b.nodeIds.slice(),
      children: (b.children || []).slice(),
      rect: { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h },
      copyCost: cd.copyCost,
      copyCostStructure: cd.copyCostStructure,
      canAffordCopy: gold >= cd.copyCost,
      canAffordCopyStructure: gold >= cd.copyCostStructure,
    };
  });

  const links = state.graph.links.map((l) => {
    const flow = (solved.linkFlow && solved.linkFlow[l.id]) || 0;
    // fedPct = how much of the consumer's demand for this resource is met. < 1
    // means the connection is under-feeding (producer is the bottleneck) and the
    // link renders starved/dashed. Markets/producers have no demand-want -> 1.
    const fed = solved.fedFrac && solved.fedFrac[l.to + "|" + l.resourceId];
    const fedPct = flow <= 0 ? 0 : fed == null ? 1 : fed;
    return {
      id: l.id,
      from: l.from,
      to: l.to,
      resourceId: l.resourceId,
      flow,
      fedPct,
    };
  });

  let research;
  const rKey = _researchKey(state);
  if (_researchMemo && _researchMemo.key === rKey) {
    research = _researchMemo.value;
  } else {
    research = Object.values(content.researchNodes).map((rn) => {
      const status = researchStatus(state, content, rn.id);
      return {
        id: rn.id,
        name: rn.name,
        cost: rn.cost,
        currency: rn.currency,
        status,
        prereqsMet: rn.prereqs.every((p) =>
          state.unlocks.researchOwned.includes(p),
        ),
        // prereq ids + display names so ResearchTree needs no RESEARCH_NODES import for names
        prereqs: rn.prereqs.map((p) => ({
          id: p,
          name: (content.researchNodes[p] || {}).name || p,
        })),
        affordable: canBuyResearch(state, content, rn.id),
        // surface the territory gate so the tree can explain WHY a node is locked
        requiresTerritory: rn.requiresTerritory
          ? {
              name:
                (content.territories[rn.requiresTerritory] || {}).name ||
                rn.requiresTerritory,
              met: state.territories.reclaimed.includes(rn.requiresTerritory),
            }
          : null,
        effectsText: rn.flavor || "",
        description: rn.description || "",
      };
    });
    Object.freeze(research);
    _researchMemo = { key: rKey, value: research };
  }

  // Machine Tuning rows (endless sink) — only kinds the player has unlocked.
  let tuning;
  const tKey = _tuningKey(state);
  if (_tuningMemo && _tuningMemo.key === tKey) {
    tuning = _tuningMemo.value;
  } else {
    tuning = TUNING.kinds
      .filter((k) => state.unlocks.machinesUnlocked.includes(k))
      .map((kind) => ({
        kind,
        rank: tuningRank(state, kind),
        bonus:
          (state.unlocks.productionBonuses &&
            state.unlocks.productionBonuses[kind]) ??
          1.0,
        nextCost: tuningCost(state, kind),
        affordable: canBuyTuning(state, content, kind),
      }));
    Object.freeze(tuning);
    _tuningMemo = { key: tKey, value: tuning };
  }

  const targetId = nextTerritory(state, content);
  let territories;
  const terrKey = _territoriesKey(state);
  if (_territoriesMemo && _territoriesMemo.key === terrKey) {
    territories = _territoriesMemo.value;
  } else {
    territories = Object.values(content.territories)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        let status;
        if (state.territories.reclaimed.includes(t.id)) status = "reclaimed";
        else if (t.id === targetId) status = "sieging";
        else status = "locked";
        return {
          id: t.id,
          name: t.name,
          order: t.order,
          siegeCost: t.siegeCost,
          rewards: { ...t.rewards },
          status,
          flavor: t.flavor || "",
          isVictory: !!t.isVictory,
        };
      });
    Object.freeze(territories);
    _territoriesMemo = { key: terrKey, value: territories };
  }

  const siegeRate = solved.siegeRate || 0;
  const target = targetId ? content.territories[targetId] : null;
  const siege = {
    targetId,
    progress: state.siege ? state.siege.progress : 0,
    cost: target ? target.siegeCost : null,
    rate: siegeRate,
    etaSeconds:
      target && siegeRate > 0
        ? Math.max(0, (target.siegeCost - state.siege.progress) / siegeRate)
        : null,
  };

  // Resources the player has actually unlocked: gatherable raws + the inputs/outputs
  // of unlocked recipes. Drives the Storage Room's "holds" multi-select (so it lists
  // only items the player can handle, not every resource in the game).
  // Troops (resources with a `power` field) are excluded — not storable.
  const unlockedRes = new Set(["iron_ore"]);
  for (const r of state.unlocks.gathererResources || []) unlockedRes.add(r);
  for (const rid of state.unlocks.recipesUnlocked) {
    const rec = content.recipes[rid];
    if (!rec) continue;
    if (rec.output) unlockedRes.add(rec.output);
    for (const inId in rec.inputs || {}) unlockedRes.add(inId);
  }

  const snap = {
    currencies: {
      gold: state.currencies.gold,
      research: state.currencies.research,
    },
    rates: { goldRate, researchRate },
    currencyStrings: {
      gold: fmt(state.currencies.gold),
      research: fmt(state.currencies.research),
      goldRate: fmt(goldRate) + "/s",
      researchRate: fmt(researchRate) + "/s",
    },
    nodes,
    links,
    buildings,
    research,
    tuning,
    territories,
    siege,
    buildMenu: {
      placeableMachines: state.unlocks.machinesUnlocked.slice(),
      unlockedRecipes: state.unlocks.recipesUnlocked.slice(),
      gathererResources: ["iron_ore"].concat(
        (state.unlocks.gathererResources || []).filter((r) => r !== "iron_ore"),
      ),
      unlockedResources: [...unlockedRes].filter(
        (r) => content.resources[r] && content.resources[r].power == null,
      ),
    },
    save: {
      status: (state.meta && state.meta._saveStatus) || "ok",
      lastSavedAt: state.savedAt || null,
    },
    meta: {
      won: state.meta.won,
      seenVictory: !!state.meta.seenVictory,
      tutorialDone: !!state.meta.tutorialDone,
    },
    lastError: lastError || null,
  };

  // Shallow-freeze: top-level snap object + its direct array/object properties.
  // Reducer purity + UI read-discipline make deep-freeze unnecessary; memoized
  // sub-arrays are already frozen when stored.
  Object.freeze(snap.currencies);
  Object.freeze(snap.rates);
  Object.freeze(snap.currencyStrings);
  Object.freeze(snap.nodes);
  Object.freeze(snap.links);
  Object.freeze(snap.buildings);
  Object.freeze(snap.siege);
  Object.freeze(snap.buildMenu);
  Object.freeze(snap.save);
  Object.freeze(snap.meta);
  return Object.freeze(snap);
}
