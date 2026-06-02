import {
  upgradeCost,
  buildingCopyCost,
  storageCapacity,
} from "./Systems/EconomySystem.js";
import {
  heroPower,
  levelCost,
  canLevelUp,
  canRecruit,
} from "./Systems/HeroSystem.js";
import { researchStatus, canBuyResearch } from "./Systems/ResearchSystem.js";
import { nextTerritory, timeRemaining } from "./Systems/ExpeditionSystem.js";

function fmt(n) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return (Math.round(n * 100) / 100).toString();
}

function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
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
    const throughput = isConsumer ? consumerRate : producerRate;
    // storage is excluded: its `cap` is an oversized passthrough ceiling, not a demand,
    // so it must not read as starved when running below it (gatherers take no input).
    const takesInput = node.kind !== "gatherer" && node.kind !== "storage";
    const EPS = 1e-6;
    const heldIds = node.kind === "storage" ? node.resourceIds || [] : null;
    // storage passes each held type through up to `cap`, so its effective ceiling
    // for the bar / MAX is cap * (number of held types), not a single `cap`.
    const capBasis =
      node.kind === "storage" ? cap * Math.max(1, heldIds.length) : cap;
    const atCapacity = capBasis > 0 && throughput >= capBasis - EPS;
    const starved = cap > 0 && takesInput && throughput < cap - EPS;
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
      stockpile: { ...node.stockpile },
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
    };
  });

  const buildings = buildingList.map((b) => {
    const copyCost = buildingCopyCost(b, state, content, true);
    const copyCostStructure = buildingCopyCost(b, state, content, false);
    return {
      id: b.id,
      name: b.name,
      nodeIds: b.nodeIds.slice(),
      rect: { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h },
      copyCost,
      copyCostStructure,
      canAffordCopy: state.currencies.gold >= copyCost,
      canAffordCopyStructure: state.currencies.gold >= copyCostStructure,
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

  const research = Object.values(content.researchNodes).map((rn) => {
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
      affordable: canBuyResearch(state, content, rn.id),
      effectsText: rn.flavor || "",
      description: rn.description || "",
    };
  });

  const heroes = state.heroes.map((h) => {
    const tmpl = content.heroes[h.templateId];
    const power = heroPower(state, content, h.id);
    return {
      id: h.id,
      templateId: h.templateId,
      name: tmpl ? tmpl.name : h.templateId,
      level: h.level,
      power,
      powerBreakdown: { gear: power - h.level * 5, level: h.level * 5 },
      equipped: {
        weapon: h.equipped.weapon,
        armor: h.equipped.armor,
        accessory: h.equipped.accessory,
      },
      levelCost: levelCost(h.level),
      canLevel: canLevelUp(state, content, h.id),
    };
  });

  const nextId = nextTerritory(state, content);
  const active = state.expeditions.active;
  const territories = Object.values(content.territories)
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      let status;
      if (state.territories.reclaimed.includes(t.id)) status = "reclaimed";
      else if (active && active.territoryId === t.id) status = "active";
      else if (state.territories.available.includes(t.id)) status = "available";
      else status = "locked";
      return {
        id: t.id,
        name: t.name,
        order: t.order,
        requiredPower: t.requiredPower,
        durationMs: t.durationMs,
        rewards: { ...t.rewards },
        status,
        flavor: t.flavor || "",
        isNext: t.id === nextId,
        isVictory: !!t.isVictory,
      };
    });

  const nowMs = state.lastSeen;
  const expedition = active
    ? {
        active: true,
        territoryId: active.territoryId,
        timeRemainingMs: timeRemaining(state, nowMs),
        durationMs: active.durationMs,
        heroId: active.heroId,
      }
    : null;

  // Resources the player has actually unlocked: gatherable raws + the inputs/outputs
  // of unlocked recipes. Drives the Storage Room's "holds" multi-select (so it lists
  // only items the player can handle, not every resource in the game).
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
      renown: state.currencies.renown,
    },
    rates: { goldRate, researchRate },
    currencyStrings: {
      gold: fmt(state.currencies.gold),
      research: fmt(state.currencies.research),
      renown: fmt(state.currencies.renown),
      goldRate: fmt(goldRate) + "/s",
      researchRate: fmt(researchRate) + "/s",
    },
    nodes,
    links,
    buildings,
    research,
    heroes,
    territories,
    expedition,
    buildMenu: {
      placeableMachines: state.unlocks.machinesUnlocked.slice(),
      unlockedRecipes: state.unlocks.recipesUnlocked.slice(),
      gathererResources: ["iron_ore"].concat(
        (state.unlocks.gathererResources || []).filter((r) => r !== "iron_ore"),
      ),
      unlockedResources: [...unlockedRes],
    },
    gearTiers: state.unlocks.gearTiersUnlocked.map((g) => ({
      itemId: g.itemId,
      tier: g.tier,
    })),
    recruitable: Object.keys(content.heroes).map((tpl) => ({
      templateId: tpl,
      canRecruit: canRecruit(state, content, tpl),
    })),
    save: {
      status: (state.meta && state.meta._saveStatus) || "ok",
      lastSavedAt: state.savedAt || null,
    },
    tutorial: { flags: { ...state.meta.tutorialFlags } },
    meta: { won: state.meta.won, seenVictory: !!state.meta.seenVictory },
    lastError: lastError || null,
  };

  return deepFreeze(snap);
}
