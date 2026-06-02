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
  if (!Array.isArray(next.graph.buildings)) next.graph.buildings = [];
  if (typeof next.graph.nextBuildingSeq !== "number")
    next.graph.nextBuildingSeq = 0;
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
      // Defensive: a gatherer placed with an explicit raw must use an enabled/startable raw.
      if (intent.kind === "gatherer" && intent.resourceId) {
        const enabled = (next.unlocks.gathererResources || []).includes(
          intent.resourceId,
        );
        const startable = STARTABLE_GATHERER_RESOURCES.includes(
          intent.resourceId,
        );
        if (!enabled && !startable)
          return reject(state, "resource not enabled");
      }
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
    case "SetStorageRule": {
      const node = nodeById(next, intent.nodeId);
      if (!node || node.kind !== "storage")
        return reject(state, "not a storage room");
      if (!content.resources[intent.resourceId])
        return reject(state, "unknown resource");
      // changing what a room holds dumps the old contents (can't keep mismatched stock)
      if (node.resourceId && node.resourceId !== intent.resourceId)
        node.stockpile = {};
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
      // drop it from any building; remove buildings left empty
      for (const b of next.graph.buildings)
        b.nodeIds = b.nodeIds.filter((id) => id !== intent.nodeId);
      next.graph.buildings = next.graph.buildings.filter(
        (b) => b.nodeIds.length > 0,
      );
      structural = true;
      break;
    }
    case "CreateBuilding": {
      const exist = intent.nodeIds.filter((id) => nodeById(next, id));
      const grouped = new Set(next.graph.buildings.flatMap((b) => b.nodeIds));
      const free = exist.filter((id) => !grouped.has(id));
      if (free.length === 0)
        return reject(state, "no ungrouped nodes to group");
      const seq = next.graph.nextBuildingSeq;
      const name =
        typeof intent.name === "string" && intent.name.trim()
          ? intent.name.trim()
          : "Building " + (seq + 1);
      next.graph.buildings.push({
        id: "b_" + seq,
        name,
        nodeIds: free,
        rect: {
          x: intent.rect.x,
          y: intent.rect.y,
          w: intent.rect.w,
          h: intent.rect.h,
        },
      });
      next.graph.nextBuildingSeq = seq + 1;
      break;
    }
    case "MoveBuilding": {
      const b = next.graph.buildings.find((x) => x.id === intent.buildingId);
      if (!b) return reject(state, "no such building");
      const { dx, dy } = intent.delta;
      b.rect.x += dx;
      b.rect.y += dy;
      for (const nid of b.nodeIds) {
        const n = nodeById(next, nid);
        if (n) n.pos = { x: n.pos.x + dx, y: n.pos.y + dy };
      }
      break;
    }
    case "ResizeBuilding": {
      const b = next.graph.buildings.find((x) => x.id === intent.buildingId);
      if (!b) return reject(state, "no such building");
      b.rect = {
        x: intent.rect.x,
        y: intent.rect.y,
        w: intent.rect.w,
        h: intent.rect.h,
      };
      // re-capture: members are the machines the UI found inside the new box that
      // exist and aren't already claimed by another building.
      const otherGrouped = new Set(
        next.graph.buildings
          .filter((x) => x.id !== b.id)
          .flatMap((x) => x.nodeIds),
      );
      b.nodeIds = intent.nodeIds.filter(
        (id) => nodeById(next, id) && !otherGrouped.has(id),
      );
      break;
    }
    case "CopyBuilding": {
      const b = next.graph.buildings.find((x) => x.id === intent.buildingId);
      if (!b) return reject(state, "no such building");
      const withUpgrades = intent.withUpgrades !== false; // default: copy at current levels
      const cost = Economy.buildingCopyCost(b, next, content, withUpgrades);
      if (next.currencies.gold < cost)
        return reject(state, "cannot afford copy");
      next.currencies.gold -= cost;
      const { dx, dy } = intent.offset;
      const idMap = {};
      const newIds = [];
      let nseq = next.graph.nextNodeSeq;
      for (const nid of b.nodeIds) {
        const src = nodeById(next, nid);
        if (!src) continue;
        const id = "n_" + src.kind + "_" + nseq;
        nseq += 1;
        idMap[nid] = id;
        newIds.push(id);
        next.graph.nodes.push({
          id,
          kind: src.kind,
          level: withUpgrades ? src.level : 1, // structure-only paste starts at L1
          resourceId: src.resourceId,
          recipeId: src.recipeId,
          stockpile: {},
          pos: { x: src.pos.x + dx, y: src.pos.y + dy },
        });
      }
      next.graph.nextNodeSeq = nseq;
      // duplicate the internal links (both endpoints inside the source building)
      const member = new Set(b.nodeIds);
      let lseq = next.graph.nextLinkSeq;
      for (const l of next.graph.links.slice()) {
        if (
          member.has(l.from) &&
          member.has(l.to) &&
          idMap[l.from] &&
          idMap[l.to]
        ) {
          next.graph.links.push({
            id: "l_" + lseq,
            from: idMap[l.from],
            to: idMap[l.to],
            resourceId: l.resourceId,
          });
          lseq += 1;
        }
      }
      next.graph.nextLinkSeq = lseq;
      const bseq = next.graph.nextBuildingSeq;
      next.graph.buildings.push({
        id: "b_" + bseq,
        name: b.name + " copy",
        nodeIds: newIds,
        rect: { x: b.rect.x + dx, y: b.rect.y + dy, w: b.rect.w, h: b.rect.h },
      });
      next.graph.nextBuildingSeq = bseq + 1;
      structural = true;
      break;
    }
    case "UngroupBuilding": {
      const idx = next.graph.buildings.findIndex(
        (x) => x.id === intent.buildingId,
      );
      if (idx < 0) return reject(state, "no such building");
      next.graph.buildings.splice(idx, 1);
      break;
    }
    case "RenameBuilding": {
      const b = next.graph.buildings.find((x) => x.id === intent.buildingId);
      if (!b) return reject(state, "no such building");
      const nm = intent.name.trim();
      // reject empty/whitespace and no-op renames so an accepted UNDOABLE intent
      // never pushes a phantom undo entry for a name that didn't actually change.
      if (!nm || nm === b.name) return reject(state, "no name change");
      b.name = nm;
      break;
    }
    case "RemoveLink": {
      const link = next.graph.links.find((l) => l.id === intent.linkId);
      if (!link) return reject(state, "no such link");
      next.graph.links = next.graph.links.filter((l) => l.id !== intent.linkId);
      structural = true;
      break;
    }
    case "SetNodePos": {
      const node = nodeById(next, intent.nodeId);
      if (!node) return reject(state, "no such node");
      node.pos = { x: intent.pos.x, y: intent.pos.y };
      break;
    }
    case "AckVictory": {
      next.meta.seenVictory = true;
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
