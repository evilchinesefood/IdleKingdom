// DOM-free selectors over a frozen SnapshotView. Pure; unit-tested under node.

function hasKind(snap, kind) {
  return (snap.nodes || []).some((n) => n.kind === kind);
}

// Action-triggered onboarding. Each step's `done(snap)` reads the LIVE snapshot,
// so the guide advances the moment the player completes the objective — there is
// no "next" button. Order = the basic gameplay loop (gather -> refine -> sell ->
// upgrade). The terminal "done" card has no predicate; the player ends the guide
// with Finish (or Skip at any step) — both set meta.tutorialDone.
const TUTORIAL_STEPS = [
  { id: "miner", done: (s) => hasKind(s, "gatherer") },
  { id: "smelter", done: (s) => hasKind(s, "smelter") },
  { id: "market", done: (s) => hasKind(s, "market") },
  { id: "connect", done: (s) => ((s.rates && s.rates.goldRate) || 0) > 0 },
  { id: "upgrade", done: (s) => (s.nodes || []).some((n) => n.level > 1) },
];

// Current onboarding step for the snapshot, or null once the guide is
// finished/skipped (meta.tutorialDone). `index` is 0-based; `total` counts the
// action steps. The terminal graduation card has id "done".
export function tutorialStep(snap) {
  if (!snap || !snap.meta || snap.meta.tutorialDone) return null;
  const total = TUTORIAL_STEPS.length;
  for (let i = 0; i < total; i++) {
    if (!TUTORIAL_STEPS[i].done(snap))
      return { id: TUTORIAL_STEPS[i].id, index: i, total };
  }
  return { id: "done", index: total, total };
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
