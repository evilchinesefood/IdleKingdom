// DOM-free selectors over a frozen SnapshotView. Pure; unit-tested under node.

const TUTORIAL_ORDER = [
  ["gold", "seenGoldTip"],
  ["upgrade", "seenUpgradeTip"],
  ["connect", "seenConnectTip"],
  ["research", "seenResearchTip"],
  ["expedition", "seenExpeditionTip"],
];

export function nextTutorialStep(flags) {
  const f = flags || {};
  for (const [step, key] of TUTORIAL_ORDER) {
    if (!f[key]) return step;
  }
  return null;
}

export function expeditionCardStatus(terr, expedition, heroPower) {
  if (terr.status === "reclaimed") return "reclaimed";
  if (expedition && expedition.active && expedition.territoryId === terr.id)
    return "active";
  if (terr.status === "locked" || !terr.isNext) return "locked";
  // territory is the next available target
  const anotherActive = !!(
    expedition &&
    expedition.active &&
    expedition.territoryId !== terr.id
  );
  if (heroPower < terr.requiredPower) return "underpowered";
  if (anotherActive) return "busy";
  return "ready";
}

export function launchNudge(heroPower, requiredPower) {
  const shortfall = Math.max(0, Math.ceil(requiredPower - heroPower));
  return `Power too low (need ${shortfall} more) — forge better gear or level your hero.`;
}

export function victoryReady(snap) {
  return !!(snap && snap.meta && snap.meta.won === true);
}
