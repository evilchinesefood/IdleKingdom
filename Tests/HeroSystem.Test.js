import { describe, it, expect } from "./Runner.js";
import { EQUIPMENT } from "../Source/Engine/Content/Equipment.js";
import { HEROES } from "../Source/Engine/Content/Heroes.js";
import { NewGame } from "../Source/Engine/GameState.js";
import { FakeClock } from "../Source/Engine/Clock.js";
import {
  heroPower,
  levelCost,
  canLevelUp,
  levelUp,
  canEquip,
  equip,
  canRecruit,
  recruit,
} from "../Source/Engine/Systems/HeroSystem.js";

const content = { equipment: EQUIPMENT, heroes: HEROES };

describe("HeroSystem", () => {
  it("heroPower = gear stats + level*5; L1 unequipped = 5", () => {
    const s = NewGame(new FakeClock(0));
    // seed hero h_0 is L1, no gear: power = 0 gear + 1*5 = 5
    expect(heroPower(s, content, "h_0")).toBeCloseTo(5, 1e-9);
  });

  it("full T1 loadout on L1 hero = 35 power (clears t_gatehouse req 30)", () => {
    const s = NewGame(new FakeClock(0));
    equip(s, content, "h_0", "weapon", "sword", 1); // 10
    equip(s, content, "h_0", "armor", "armor", 1); // 12
    equip(s, content, "h_0", "accessory", "shield", 1); // 8
    expect(heroPower(s, content, "h_0")).toBeCloseTo(10 + 12 + 8 + 5, 1e-9); // 35
  });

  it("levelCost = 5*L; levelUp spends renown and raises power +5", () => {
    expect(levelCost(1)).toBe(5);
    expect(levelCost(2)).toBe(10);
    const s = NewGame(new FakeClock(0));
    s.currencies.renown = 5;
    expect(canLevelUp(s, content, "h_0")).toBe(true);
    const p0 = heroPower(s, content, "h_0");
    levelUp(s, content, "h_0");
    expect(s.currencies.renown).toBeCloseTo(0, 1e-9);
    const hero = s.heroes.find((h) => h.id === "h_0");
    expect(hero.level).toBe(2);
    expect(heroPower(s, content, "h_0")).toBeCloseTo(p0 + 5, 1e-9);
    expect(canLevelUp(s, content, "h_0")).toBe(false); // needs 10 now, has 0
  });

  it("canEquip requires the tier to be in gearTiersUnlocked + slot match", () => {
    const s = NewGame(new FakeClock(0));
    // NewGame unlocks only tier 1 of each item.
    expect(canEquip(s, content, "h_0", "weapon", "sword", 1)).toBe(true);
    expect(canEquip(s, content, "h_0", "weapon", "sword", 2)).toBe(false); // T2 not unlocked
    expect(canEquip(s, content, "h_0", "armor", "sword", 1)).toBe(false); // wrong slot
  });

  it("recruit gated by renown + unlockTerritory + heroSlots; pushes a new hero", () => {
    const s = NewGame(new FakeClock(0));
    s.currencies.renown = 1000;
    // hero_ranger needs t_oldmarket reclaimed AND a free slot. NewGame heroSlots=1, already 1 hero.
    expect(canRecruit(s, content, "hero_ranger")).toBe(false); // no free slot, no territory
    s.unlocks.heroSlots = 2;
    s.territories.reclaimed.push("t_gatehouse", "t_smithyward", "t_oldmarket");
    expect(canRecruit(s, content, "hero_ranger")).toBe(true);
    recruit(s, content, "hero_ranger");
    expect(s.heroes.length).toBe(2);
    const ranger = s.heroes[1];
    expect(ranger.templateId).toBe("hero_ranger");
    expect(ranger.level).toBe(1);
    expect(s.currencies.renown).toBeCloseTo(1000 - 40, 1e-9);
  });
});
