// The four interviews from octy's video (https://www.youtube.com/watch?v=cJaE-VfseFE), written down as the answers a
// player would give in the app, plus what the video concluded. `at` = video second of the quoted result.
//
// Transcription rules:
// - A preset answer that made octy cut specs is a dealbreaker; a stated leaning that cut nothing is a preference;
//   "don't care" is left blank.
// - Anything said that no preset covers is written as the player's note on the closest question, in their words.
//   PvP steps have no free-text question of their own, so per-content exclusions ("no healers for 1vX") go on the
//   step's own copy of the Playstyle aesthetics question.
// - A spec octy kept or cut against the answers is a manual override (`override`).
// - `video.steps` are the finalists octy wrote down per content type; `video.main` the spec(s) he landed on.
import { PLAYSTYLE, CONTENT_TYPES } from "../public/data.js";

const ALL_ITEMS = [...PLAYSTYLE, ...CONTENT_TYPES.flatMap((c) => c.items)].filter((it) => it.q);
// Question text by prefix, so a renamed or removed question fails loudly instead of being silently dropped.
const q = (prefix) => {
  const hits = [...new Set(ALL_ITEMS.filter((it) => it.q.startsWith(prefix)).map((it) => it.q))];
  if (hits.length !== 1) throw new Error(`interviews: question "${prefix}…" matches ${hits.length} questions`);
  return hits[0];
};
const list = (chosen) => (chosen === undefined ? [] : [chosen].flat());
const deal = (chosen, text = "") => ({ chosen: list(chosen), text, dealbreaker: true });
const pref = (chosen, text = "") => ({ chosen: list(chosen), text, dealbreaker: false });
const note = (text) => ({ chosen: [], text, dealbreaker: false });
const blank = () => ({ chosen: [], text: "", dealbreaker: false });

const DOT = q("Do you want your character to be dot/hot");
const SHAPESHIFT = q("How do you feel about Shapeshifting");
const SCHOOLS = q("Do you have any preference in terms of schools");
const PETS = q("How do you feel about pet-based");
const MOBILITY = q("Is mobility mandatory");
const AESTHETIC = q("Any general aesthetic preferences");
const KITE = q("Do you prefer to kite and reset");
const SELF_HEAL = q("Self-healing");
const FLAG = q("Do you want to be expected to flag carry");
const DAMAGE_GROUP = q("Do you care more about doing maximum personal damage, or increasing the group");
const DAMAGE_RAID = q("Do you care more about doing maximum personal damage, or increasing the raid");
const OFF_TANK = q("Do you want to be able to off-tank");
const OFF_HEAL = q("Do you want to be able to off-heal");
const AOE = q("Big AOE");
const NOVELTY = q("Any other considerations? Novelty");
const HEAL_KIND = q("If Healers are in your list");
const TANK_MANA = q("If Tanks are in your list");
const CHALLENGE = q("How much of a challenge");
const DOWNTIME = q("How do you feel about downtime");
const AOE_GRIND = q("Any AOE grinding");
const LEVEL_DUNGEONS = q("How about dungeons");
const RP_ESTABLISHED = q("Do you have an established RP character");
const RP_DETERMINES = q("Will your RP character determine");
const RP_MATCH = q("If not - does it matter");
const RP_AZEROTH = q("If it does - what part of Azeroth");
const RP_POSSIBLE = q("What kind of RP characters");

export const INTERVIEWS = [
  {
    who: "octy",
    fundamentals: { range: ["Melee", "Ranged"], dmg: ["Spellcaster", "Combination"], role: ["Tank", "Healer", "Pure DPS", "Hybrid"] },
    // 07:40–08:20: after ranking content, tanks go, then melee (holy paladin is gone from his raid list too).
    lookBack: ["paladin_prot", "druid_bear", "shaman_enh_tank", "paladin_ret", "druid_cat", "shaman_enh_dps", "paladin_holy"],
    content: [{ id: "pvp_1vx" }, { id: "bgs" }, { id: "raid_pug" }, { id: "farming", skip: true }],
    playstyle: {
      [DOT]: pref("Dots/Hots preferred", "I love rotting enemies down, but some burst is fine."),
      [SHAPESHIFT]: deal("I hate it", "I don't like druid forms. Ghost Wolf is fine since it's only for running around, and resto druid mostly stays in caster form, which is fine."),
      [PETS]: deal("I hate it", "Marginally prefer classes that don't heavily rely on their pet; warriors tunneled my pets in TBC and Wrath."),
    },
    steps: {
      pvp_1vx: {
        answers: {
          [KITE]: deal("Survive and Outlast"),
          [SELF_HEAL]: deal("Need strong self-healing", "Critical: I don't want to rely on a healer or die to trickle damage. Affliction/demonology sustain barely meets my standard; destruction doesn't."),
        },
        overrides: { [AESTHETIC]: note("No dedicated healer specs: solo open-world PvP as a healer isn't fun for me. No strong preference between shadow and elemental magic.") },
      },
      bgs: {
        answers: { [KITE]: deal("Survive and Outlast") },
        overrides: {
          [DOT]: deal("Dots/Hots preferred", "I love dotting everything and watching the pressure build on enemy healers."),
          [AESTHETIC]: note("No healer specs for BGs."),
        },
      },
      raid_pug: {
        answers: {
          [OFF_HEAL]: deal("I need to be able to heal", "I don't want to wait for a DPS spot; I want quick invites."),
          [HEAL_KIND]: pref("Raid healing"),
        },
        overrides: { [AESTHETIC]: note("I want to see my character's gear when raiding.") },
      },
    },
    video: {
      steps: {
        pvp_1vx: { at: 700, kept: ["shaman_elemental", "priest_shadow", "warlock_affliction"] },
        bgs: { at: 780, kept: ["priest_shadow", "warlock_affliction"] },
        raid_pug: { at: 885, kept: ["shaman_elemental", "shaman_resto", "druid_resto", "priest_discipline", "priest_holy", "priest_shadow"] },
      },
      at: 920,
      main: ["priest_shadow"],
      alts: ["warlock_affliction", "shaman_elemental"],
    },
  },
  {
    who: "Osa",
    // 19:00–20:40: no range preference; pure physical first dropped, then put back; pure DPS kept ("leave them all in").
    fundamentals: { range: ["Melee", "Ranged"], dmg: ["Spellcaster", "Physical", "Combination"], role: ["Tank", "Healer", "Pure DPS", "Hybrid"] },
    lookBack: [],
    // 21:20: leveling, dungeons, raiding (dropped at 32:40), roleplay, hardcore (never reached).
    content: [{ id: "leveling" }, { id: "dungeons" }, { id: "raid_guild", skip: true }, { id: "roleplay" }, { id: "hardcore", skip: true }],
    playstyle: {
      [AESTHETIC]: note("I don't like Elemental shaman: the ugly Lightning Bolt animation. Enhancement is fine, I'm in melee and won't see it."),
    },
    steps: {
      leveling: {
        answers: {
          [CHALLENGE]: deal("Medium challenge", "I don't want it to be easy: no beast mastery hunter or frost mage. Warlock is fine though."),
          [DOWNTIME]: deal("I hate downtime", "I don't want to drink or eat a lot, so no arms or fury warrior."),
          [AOE_GRIND]: pref("I hate AOE grinding"),
          [LEVEL_DUNGEONS]: deal("I need healer offspec", "I want the flexibility to heal and tank dungeons while leveling. Questing as a healer or a pure tank is too slow, except feral bear since it can go cat."),
        },
        // 25:40: demonology kept as a joke ("what if there's cool items").
        override: { warlock_demonology: true },
      },
      dungeons: {
        answers: {
          [OFF_TANK]: deal("I need to be able to tank", "I want to DPS by default and flex into tanking or healing, so no dedicated tank or healer specs."),
          [OFF_HEAL]: deal("I need to be able to heal"),
          [DAMAGE_GROUP]: deal("I like having some support"),
          [AOE]: pref("I like a balance"),
        },
        overrides: {
          [DOT]: pref("Direct damage/healing preferred", "Some dots like cat bleeds are fine, I just wouldn't want affliction."),
          [SCHOOLS]: note("No elemental magic."),
        },
      },
      roleplay: {
        answers: {
          [RP_ESTABLISHED]: note("No."),
          [RP_DETERMINES]: note("No, it's the other way around: my class and spec will determine my character."),
          [RP_MATCH]: note("Yes, it matters that they match."),
          [RP_AZEROTH]: note("Horde more than Alliance, though Alliance is maybe on the table. I like Tauren and I really like the Skyborn, so no warlock or priest."),
          [RP_POSSIBLE]: note("Not a warrior or a mage. I'm not that interested in RPing a paladin, even a Forsaken one."),
        },
      },
    },
    video: {
      steps: {
        leveling: { at: 1760, kept: ["paladin_ret", "druid_balance", "druid_cat", "druid_bear", "warlock_demonology", "priest_shadow", "shaman_enh_dps"] },
        dungeons: { at: 1960, kept: ["druid_balance", "druid_cat"] },
        roleplay: { at: 2140, kept: ["rogue_assassination", "rogue_combat", "rogue_subtlety", "druid_balance", "druid_bear", "druid_cat", "druid_resto", "hunter_bm", "hunter_mm", "hunter_survival"] },
      },
      at: 2160,
      // "I would really recommend you to start on Druid."
      main: ["druid_balance", "druid_cat"],
      alts: [],
    },
  },
  {
    who: "Dqve",
    fundamentals: { range: ["Ranged"], dmg: ["Spellcaster", "Physical", "Combination"], role: ["Pure DPS", "Hybrid"] },
    lookBack: [],
    // 38:40–39:20: BGs, small group PvP, dungeons, PUG raiding (low weight, not done).
    content: [{ id: "bgs" }, { id: "pvp_small" }, { id: "dungeons" }, { id: "raid_pug", skip: true }],
    playstyle: {
      [SHAPESHIFT]: pref("I prefer shapeshifting classes"),
      [PETS]: deal("I hate it", "Exclude anything remotely close to a pet, warlocks included since they'll be using one most of the time. Marksmanship is fine thanks to Lone Wolf."),
      [MOBILITY]: deal("I need some mobility", "I love mobility so I can pick my fights; Ghost Wolf is enough."),
      [AESTHETIC]: note("Not a fan of the Hunter class fantasy, and I won't play a gnome. I really like nature magic like Lava Burst, and shadow priest is super cool."),
    },
    steps: {
      bgs: {
        answers: {
          [KITE]: pref("Kite and reset"),
          [SELF_HEAL]: note("Not a must, but I want to be tanky and self-sufficient: frost mage's barrier, nova and ice block are enough, fire and arcane are too squishy."),
          [FLAG]: pref("I love flag carrying"),
        },
      },
      pvp_small: {
        answers: {
          [SELF_HEAL]: note("I want to be able to off-heal my friends; affliction's self-sustain isn't enough."),
        },
      },
      dungeons: {
        answers: {
          [OFF_TANK]: pref("I need to be able to tank", "I enjoy tanking 5-mans, but it's not a dealbreaker."),
          [OFF_HEAL]: pref("I need to be able to heal", "I enjoy healing, not a dealbreaker."),
        },
        overrides: { [MOBILITY]: blank() },
      },
    },
    video: {
      steps: {
        bgs: { at: 2665, kept: ["druid_balance", "shaman_elemental", "mage_frost"] },
        pvp_small: { at: 2745, kept: ["druid_balance", "shaman_elemental"] },
        dungeons: { at: 2885, kept: ["druid_balance", "shaman_elemental", "mage_arcane", "mage_fire", "mage_frost", "priest_shadow"] },
      },
      at: 2905,
      // "Balance has seven, Ellie has seven, and Frost has five."
      main: ["druid_balance", "shaman_elemental"],
      alts: ["mage_frost"],
    },
  },
  {
    who: "Theo",
    fundamentals: { range: ["Melee"], dmg: ["Spellcaster", "Physical", "Combination"], role: ["Tank", "Pure DPS", "Hybrid"] },
    lookBack: [],
    // 50:00–50:40: guild raiding, dungeons, BGs, small group PvP (not done).
    content: [{ id: "raid_guild" }, { id: "dungeons" }, { id: "bgs" }, { id: "pvp_small", skip: true }],
    playstyle: {
      [DOT]: deal("Direct damage/healing preferred"),
      [SHAPESHIFT]: deal("I hate it", "Ghost Wolf is fine, that's as far as it goes."),
      [PETS]: deal("I hate it", "Pets have bad AI in classic."),
      [AESTHETIC]: note("I lean more towards elemental than holy, so not retribution paladin. Protection paladin is fine because tanking matters most to me."),
    },
    steps: {
      raid_guild: {
        answers: {
          [OFF_TANK]: deal("I need to be able to tank", "Being able to swap to tank makes it easier to get groups."),
          [TANK_MANA]: pref("I like the Mana mini-game"),
          [NOVELTY]: note("Novelty matters: I haven't played much paladin in classic, and Enhancement tank is new. Warriors aren't new to me."),
        },
      },
      dungeons: {
        answers: {
          [OFF_TANK]: deal("I need to be able to tank", "I want to main tank in dungeons, so tank specs only."),
          [NOVELTY]: note("Same as raiding: I want something new to me, paladin or Enhancement tank, not warrior."),
        },
      },
      bgs: {
        answers: { [KITE]: deal("Survive and Outlast", "All in, stuck in the thick of it.") },
        overrides: { [AESTHETIC]: note("No tank specs, they aren't viable in PvP. Fury isn't really a PvP spec. More elemental than holy, so not retribution.") },
      },
    },
    video: {
      steps: {
        raid_guild: { at: 3225, kept: ["paladin_prot", "shaman_enh_tank"] },
        dungeons: { at: 3300, kept: ["paladin_prot", "shaman_enh_tank"] },
        bgs: { at: 3465, kept: ["warrior_arms", "shaman_enh_dps"] },
      },
      at: 3465,
      // "Enhance is leading with six points. Prot pali has five points." (enhance counted as one class)
      main: ["shaman_enh_tank", "paladin_prot"],
      alts: ["shaman_enh_dps", "warrior_arms"],
    },
  },
];
