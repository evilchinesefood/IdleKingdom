import { h } from "./Render/Dom.js";
import { fmtNum, fmtCost } from "./Format/Format.js";
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
          "wa-option",
          { value: String(tier) },
          icon(itemId),
          ` ${res.display} T${tier}`,
        ),
      );
      return h(
        "div",
        { class: "hp-slot" },
        h("div", { class: "hp-slot-label" }, slot),
        h(
          "wa-select",
          {
            key: "equip-" + hero.id + "-" + slot,
            class: "hp-equip",
            label: slot,
            appearance: "filled",
            "prop:value": equipped ? String(equipped.tier) : "",
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
          h("wa-option", { value: "" }, "— none —"),
          ...tierOpts,
        ),
      );
    });

    const levelUpButton = h(
      "wa-button",
      {
        class: "hp-levelup " + (hero.canLevel ? "affordable" : "locked"),
        variant: "brand",
        appearance: "accent",
        disabled: !hero.canLevel,
        onclick: () => dispatch({ type: INTENT.LevelUpHero, heroId: hero.id }),
      },
      icon("levelup"),
      " Level Up → ",
      icon("renown"),
      " " + fmtCost(hero.levelCost),
    );

    return h(
      "wa-card",
      { key: "hero-" + hero.id, class: "hero-card", "with-header": true },
      h("div", { class: "hp-name", slot: "header" }, hero.name),
      h(
        "div",
        { class: "hp-power" },
        icon("renown"),
        ` Power ${fmtNum(hero.power)} (gear ${fmtNum(hero.powerBreakdown.gear)} + level ${fmtNum(hero.powerBreakdown.level)})`,
      ),
      h("wa-tag", { class: "hp-level", size: "s" }, `Level ${hero.level}`),
      ...slots,
      levelUpButton,
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
      const recruitButton = h(
        "wa-button",
        {
          class: "hp-recruit " + (r.canRecruit ? "affordable" : "locked"),
          appearance: "accent",
          disabled: !r.canRecruit,
          onclick: () =>
            dispatch({ type: INTENT.RecruitHero, templateId: tpl.id }),
        },
        icon("recruit"),
        " Recruit → ",
        icon("renown"),
        " " + fmtCost(tpl.unlockRenownCost),
      );
      return h(
        "wa-card",
        {
          key: "recruit-" + tpl.id,
          class: "recruit-card",
          "with-header": true,
        },
        h("div", { class: "hp-name", slot: "header" }, tpl.name),
        recruitButton,
      );
    });

  return h(
    "div",
    { class: "hero-panel", id: "HeroPanel" },
    ...heroCards,
    ...recruitCards,
  );
}
