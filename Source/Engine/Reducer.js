import { validate } from "./Intents.js";
import { clone } from "./GameState.js";
import { isValidLink, wouldStayAcyclic } from "./Simulation/Topology.js";
import * as Economy from "./Systems/EconomySystem.js";
import * as Research from "./Systems/ResearchSystem.js";
import * as Hero from "./Systems/HeroSystem.js";
import * as Expedition from "./Systems/ExpeditionSystem.js";

// Gatherer resources assignable from the very start (before any research/reclaim).
// Seeded with ONLY iron_ore; timber/hide/coal_raw/gemstone are added to
// unlocks.gathererResources by enableGathererResource effects (res_lumber/res_tannery/
// res_coalworks and the t_ironreach reclaim). Never hardcode the gated raws here.
const STARTABLE_GATHERER_RESOURCES = ["iron_ore"];

function reject(state, error) {
  return { state, error };
}

function nodeById(state, id) {
  return state.graph.nodes.find((n) => n.id === id);
}

export function reduce(state, intent, content) {
  const v = validate(intent);
  if (!v.ok) return reject(state, v.error);

  // Work on a clone; only return it if the intent is accepted.
  const next = clone(state);
  const nowMs =
    typeof intent._nowMs === "number" ? intent._nowMs : state.lastSeen;
  let structural = false;

  switch (intent.type) {
    case "UpgradeNode": {
      if (!Economy.canUpgrade(next, content, intent.nodeId))
        return reject(state, "cannot upgrade");
      Economy.applyUpgrade(next, content, intent.nodeId);
      structural = true;
      break;
    }
    case "SellFromStockpile": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      if (!Economy.isListed(next, content, intent.resId))
        return reject(state, "resource not listed");
      if ((node.stockpile[intent.resId] || 0) <= 0)
        return reject(state, "empty stockpile");
      Economy.sellFromStockpile(next, content, intent.nodeId, intent.resId);
      break;
    }
    case "BuyResearch": {
      if (!Research.canBuyResearch(next, content, intent.nodeId))
        return reject(state, "cannot buy research");
      Research.buyResearch(next, content, intent.nodeId);
      structural = true;
      break;
    }
    case "EquipItem": {
      if (
        !Hero.canEquip(
          next,
          content,
          intent.heroId,
          intent.slot,
          intent.itemId,
          intent.tier,
        )
      ) {
        return reject(state, "cannot equip");
      }
      Hero.equip(
        next,
        content,
        intent.heroId,
        intent.slot,
        intent.itemId,
        intent.tier,
      );
      break;
    }
    case "LevelUpHero": {
      if (!Hero.canLevelUp(next, content, intent.heroId))
        return reject(state, "cannot level up");
      Hero.levelUp(next, content, intent.heroId);
      break;
    }
    case "RecruitHero": {
      if (!Hero.canRecruit(next, content, intent.templateId))
        return reject(state, "cannot recruit");
      Hero.recruit(next, content, intent.templateId);
      break;
    }
    case "StartExpedition": {
      if (
        !Expedition.canStart(next, content, intent.territoryId, intent.heroId)
      ) {
        return reject(state, "cannot start expedition");
      }
      Expedition.startExpedition(
        next,
        content,
        intent.territoryId,
        intent.heroId,
        nowMs,
      );
      break;
    }
    case "PlaceNode": {
      if (
        !content.machines[intent.kind] ||
        !next.unlocks.machinesUnlocked.includes(intent.kind)
      )
        return reject(state, "machine not placeable");
      const seq = next.graph.nextNodeSeq;
      const id = "n_" + intent.kind + "_" + seq;
      next.graph.nodes.push({
        id,
        kind: intent.kind,
        level: 1,
        resourceId: intent.resourceId || null,
        recipeId: intent.recipeId || null,
        stockpile: {},
        pos: { x: intent.pos.x, y: intent.pos.y },
      });
      next.graph.nextNodeSeq = seq + 1;
      structural = true;
      break;
    }
    case "ConnectLink": {
      if (
        !isValidLink(next, content, intent.from, intent.to, intent.resourceId)
      ) {
        return reject(state, "invalid link");
      }
      if (
        !wouldStayAcyclic(
          next.graph.nodes,
          next.graph.links,
          intent.from,
          intent.to,
        )
      ) {
        return reject(state, "cycle");
      }
      const seq = next.graph.nextLinkSeq;
      next.graph.links.push({
        id: "l_" + seq,
        from: intent.from,
        to: intent.to,
        resourceId: intent.resourceId,
      });
      next.graph.nextLinkSeq = seq + 1;
      structural = true;
      break;
    }
    case "SetRecipe": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      if (node.kind !== "smelter" && node.kind !== "workshop")
        return reject(state, "not a crafter");
      if (!next.unlocks.recipesUnlocked.includes(intent.recipeId))
        return reject(state, "recipe locked");
      const recipe = content.recipes[intent.recipeId];
      if (!recipe || recipe.crafterKind !== node.kind)
        return reject(state, "recipe/crafter mismatch");
      node.recipeId = intent.recipeId;
      structural = true;
      break;
    }
    case "SetGathererResource": {
      const node = nodeById(next, intent.nodeId);
      if (!node || node.kind !== "gatherer")
        return reject(state, "not a gatherer");
      const enabled = (next.unlocks.gathererResources || []).includes(
        intent.resourceId,
      );
      const startable = STARTABLE_GATHERER_RESOURCES.includes(
        intent.resourceId,
      );
      if (!enabled && !startable) return reject(state, "resource not enabled");
      node.resourceId = intent.resourceId;
      structural = true;
      break;
    }
    case "RemoveNode": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      next.graph.nodes = next.graph.nodes.filter((n) => n.id !== intent.nodeId);
      next.graph.links = next.graph.links.filter(
        (l) => l.from !== intent.nodeId && l.to !== intent.nodeId,
      );
      structural = true;
      break;
    }
    case "RemoveLink": {
      const link = next.graph.links.find((l) => l.id === intent.linkId);
      if (!link) return reject(state, "no such link");
      next.graph.links = next.graph.links.filter((l) => l.id !== intent.linkId);
      structural = true;
      break;
    }
    case "DismissTooltip": {
      next.meta.tutorialFlags[intent.flag] = true;
      break;
    }
    default:
      return reject(state, "unhandled intent: " + intent.type);
  }

  if (structural) delete next._solved;
  return { state: next };
}
