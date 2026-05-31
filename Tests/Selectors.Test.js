import { describe, it, expect } from "./Runner.js";
import {
  nextTutorialStep,
  expeditionCardStatus,
  launchNudge,
  victoryReady,
} from "../Source/UI/Logic/Selectors.js";

const baseTut = {
  seenGoldTip: false,
  seenUpgradeTip: false,
  seenConnectTip: false,
  seenResearchTip: false,
  seenExpeditionTip: false,
};

describe("Selectors.nextTutorialStep", () => {
  it("walks gold -> upgrade -> connect -> research -> expedition in order", () => {
    expect(nextTutorialStep({ ...baseTut })).toBe("gold");
    expect(nextTutorialStep({ ...baseTut, seenGoldTip: true })).toBe("upgrade");
    expect(
      nextTutorialStep({ ...baseTut, seenGoldTip: true, seenUpgradeTip: true }),
    ).toBe("connect");
    expect(
      nextTutorialStep({
        ...baseTut,
        seenGoldTip: true,
        seenUpgradeTip: true,
        seenConnectTip: true,
      }),
    ).toBe("research");
    expect(
      nextTutorialStep({
        ...baseTut,
        seenGoldTip: true,
        seenUpgradeTip: true,
        seenConnectTip: true,
        seenResearchTip: true,
      }),
    ).toBe("expedition");
  });
  it("returns null once all flags are seen", () => {
    expect(
      nextTutorialStep({
        seenGoldTip: true,
        seenUpgradeTip: true,
        seenConnectTip: true,
        seenResearchTip: true,
        seenExpeditionTip: true,
      }),
    ).toBe(null);
  });
  it("treats undefined flags as unseen", () => {
    expect(nextTutorialStep({})).toBe("gold");
  });
});

describe("Selectors.expeditionCardStatus", () => {
  const terr = {
    id: "t_smithyward",
    status: "available",
    requiredPower: 38,
    isNext: true,
  };
  it("maps engine status straight through when not next-active", () => {
    expect(expeditionCardStatus({ ...terr, status: "reclaimed" }, null, 40)).toBe(
      "reclaimed",
    );
    expect(expeditionCardStatus({ ...terr, status: "locked" }, null, 40)).toBe(
      "locked",
    );
  });
  it("returns 'active' when this territory is the live expedition", () => {
    const exp = { active: true, territoryId: "t_smithyward" };
    expect(expeditionCardStatus(terr, exp, 40)).toBe("active");
  });
  it("returns 'ready' when next, available, power suffices, no active run", () => {
    expect(expeditionCardStatus(terr, null, 40)).toBe("ready");
    expect(expeditionCardStatus(terr, { active: false }, 40)).toBe("ready");
  });
  it("returns 'underpowered' when next/available but power too low", () => {
    expect(expeditionCardStatus(terr, null, 30)).toBe("underpowered");
  });
  it("returns 'busy' when ready in itself but another expedition is active", () => {
    const exp = { active: true, territoryId: "t_gatehouse" };
    expect(expeditionCardStatus(terr, exp, 40)).toBe("busy");
  });
});

describe("Selectors.launchNudge", () => {
  it("nudges toward BOTH forging gear and leveling the hero (MINOR #7)", () => {
    const msg = launchNudge(35, 38);
    expect(msg.includes("forge")).toBeTruthy();
    expect(msg.includes("level")).toBeTruthy();
    expect(msg.includes("3")).toBeTruthy(); // shortfall = 38-35 = 3
  });
});

describe("Selectors.victoryReady", () => {
  it("true only when meta.won", () => {
    expect(victoryReady({ meta: { won: true } })).toBe(true);
    expect(victoryReady({ meta: { won: false } })).toBe(false);
    expect(victoryReady({ meta: {} })).toBe(false);
  });
});
