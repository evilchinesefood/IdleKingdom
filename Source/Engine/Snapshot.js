import { upgradeCost } from "./Systems/EconomySystem.js";
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

  const nodes = state.graph.nodes.map((node) => {
    const cap = (solved.capacityByNode && solved.capacityByNode[node.id]) || 0;
    const out = (solved.availableOut && solved.availableOut[node.id]) || {};
    const drawMap = (solved.perNodeDraw && solved.perNodeDraw[node.id]) || {};
    const producerRate = Object.values(out).reduce((a, b) => a + b, 0);
    const consumerRate = Object.values(drawMap).reduce((a, b) => a + b, 0);
    const isConsumer = node.kind === "scholar" || node.kind === "market";
    const throughput = isConsumer ? consumerRate : producerRate;
    const takesInput = node.kind !== "gatherer";
    const EPS = 1e-6;
    const atCapacity = cap > 0 && throughput >= cap - EPS;
    const starved = cap > 0 && takesInput && throughput < cap - EPS;
    const cost = upgradeCost(node.kind, node.level, content);
    return {
      id: node.id,
      kind: node.kind,
      level: node.level,
      resourceId: node.resourceId,
      recipeId: node.recipeId,
      pos: { x: node.pos.x, y: node.pos.y },
      capacity: cap,
      effectiveRate: producerRate,
      throughput,
      capacityPct: cap > 0 ? throughput / cap : 0,
      atCapacity,
      starved,
      draw: drawMap,
      surplus: (solved.surplusRate && solved.surplusRate[node.id]) || {},
      stockpile: { ...node.stockpile },
      upgradeCost: cost,
      canAfford: state.currencies.gold >= cost,
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
