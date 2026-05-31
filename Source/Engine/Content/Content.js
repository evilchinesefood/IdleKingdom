import { RESOURCES } from "./Resources.js";
import { MACHINES, GATHERER_VARIANTS } from "./Machines.js";
import { RECIPES } from "./Recipes.js";
import { RESEARCH_NODES } from "./ResearchNodes.js";
import { TERRITORIES } from "./Territories.js";
import { EQUIPMENT } from "./Equipment.js";
import { HEROES } from "./Heroes.js";
import { START_STATE } from "./StartState.js";

/** Aggregate content the engine reads: keyed maps by canonical id/kind. */
export const content = {
  resources: RESOURCES,
  machines: MACHINES,
  gathererVariants: GATHERER_VARIANTS,
  recipes: RECIPES,
  researchNodes: RESEARCH_NODES,
  territories: TERRITORIES,
  equipment: EQUIPMENT,
  heroes: HEROES,
  startState: START_STATE,
};
