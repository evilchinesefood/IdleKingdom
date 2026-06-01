import { h } from "./Render/Dom.js";
import { fmtNum, fmtCost, affordClass } from "./Format/Format.js";
import { icon } from "./Icons.js";
import { RESOURCES } from "../Engine/Content/Resources.js";
import { HEROES } from "../Engine/Content/Heroes.js";
import { INTENT } from "../Engine/Intents.js";

const SLOT_ITEM = { weapon: "sword", armor: "armor", accessory: "shield" };

function tiersFor(snap, itemId) {
  const list = (snap.gearTiers || [])
    .filter((g) => g.itemId === itemId)
    .map((g) => g.tier);
  return list;
}

export function HeroPanel(snap, dispatch) {
  const heroes = snap.heroes || [];
  const heroCards = heroes.map((hero) => {
    const slots = ["weapon", "armor", "accessory"].map((slot) => {
      const itemId = SLOT_ITEM[slot];
      const res = RESOURCES[itemId];
      const equipped = hero.equipped[slot]; // {itemId,tier} | null
      const tierOpts = tiersFor(snap, itemId).map((tier) =>
        h(
          "option",
          { value: String(tier), selected: equipped && equipped.tier === tier },
          [icon(itemId), ` ${res.display} T${tier}`],
        ),
      );
      return h(
        "div",
        { class: "hp-slot" },
        h("div", { class: "hp-slot-label" }, slot),
        h(
          "select",
          {
            class: "hp-equip",
            onchange: (e) => {
              const val = e.target.value;
              if (val === "") return; // "— none —" is a no-op (no unequip intent in MVP)
              dispatch({
                type: INTENT.EquipItem,
                heroId: hero.id,
                slot,
                itemId,
                tier: Number(val),
              });
            },
          },
          h("option", { value: "", selected: !equipped }, "— none —"),
          ...tierOpts,
        ),
      );
    });

    return h(
      "div",
      { class: "hero-card" },
      h("div", { class: "hp-name" }, hero.name),
      h(
        "div",
        { class: "hp-power" },
        `Power ${fmtNum(hero.power)} (gear ${fmtNum(hero.powerBreakdown.gear)} + level ${fmtNum(hero.powerBreakdown.level)})`,
      ),
      h("div", { class: "hp-level" }, `Level ${hero.level}`),
      ...slots,
      h(
        "button",
        {
          class: "hp-levelup " + affordClass(hero.canLevel),
          disabled: !hero.canLevel,
          onclick: () =>
            dispatch({ type: INTENT.LevelUpHero, heroId: hero.id }),
        },
        [icon("renown"), ` Level Up → ${fmtCost(hero.levelCost)}`],
      ),
    );
  });

  // Recruit options for not-yet-recruited heroes.
  const recruited = new Set(heroes.map((x) => x.templateId));
  const recruitCards = Object.values(HEROES)
    .filter((tpl) => !recruited.has(tpl.id) && tpl.unlockKind === "renown")
    .map((tpl) => {
      const r = (snap.recruitable || []).find(
        (x) => x.templateId === tpl.id,
      ) || { canRecruit: false };
      return h(
        "div",
        { class: "recruit-card" },
        h("div", { class: "hp-name" }, tpl.name),
        h(
          "button",
          {
            class: "hp-recruit " + affordClass(r.canRecruit),
            disabled: !r.canRecruit,
            onclick: () =>
              dispatch({ type: INTENT.RecruitHero, templateId: tpl.id }),
          },
          [
            icon("recruit"),
            " Recruit → ",
            icon("renown"),
            " " + fmtCost(tpl.unlockRenownCost),
          ],
        ),
      );
    });

  return h(
    "div",
    { class: "hero-panel", id: "HeroPanel" },
    ...heroCards,
    ...recruitCards,
  );
}
