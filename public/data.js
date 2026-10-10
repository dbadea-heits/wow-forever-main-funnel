// Source: octy, "Find Your WoW Forever Main in 15 Minutes" (video description chapters)
// and octy's funnel spreadsheet (spec table + texture questions).

export const VIDEO_URL = "https://www.youtube.com/watch?v=cJaE-VfseFE";
export const VIDEO_TITLE = "Find Your WoW Forever Main in 15 Minutes - No Tierlists, No Guessing!";
export const CHANNEL = { name: "octy", url: "https://www.youtube.com/@octypve" };

export const EXAMPLES = [
  { who: "octy", blurb: "PvP-first, ranged caster, softcore", start: 63, results: 920 },
  { who: "Osa", blurb: "Semi-casual, PvE oriented, roleplayer", start: 991, results: 2144 },
  { who: "Dqve", blurb: "PvP oriented, ranged, skill expression", start: 2186, results: 2912 },
  { who: "Theo", blurb: "PvE oriented, melee only, tank enjoyer", start: 2934, results: 3466 },
];

// range/dmg/role: verbatim from octy's sheet.
// traits: Classic-era reference text plus WoW Forever specifics from the video.
// This is the only spec knowledge Jev sees — edit freely.
// Canonical WoW class colors; class icons from Wowhead (assets/icons).
export const CLASSES = {
  Warrior: { color: "#C69B6D", icon: "classicon_warrior" },
  Paladin: { color: "#F48CBA", icon: "classicon_paladin" },
  Hunter: { color: "#AAD372", icon: "classicon_hunter" },
  Rogue: { color: "#FFF468", icon: "classicon_rogue" },
  Priest: { color: "#FFFFFF", icon: "classicon_priest" },
  Shaman: { color: "#0070DD", icon: "classicon_shaman" },
  Mage: { color: "#3FC7EB", icon: "classicon_mage" },
  Warlock: { color: "#8788EE", icon: "classicon_warlock" },
  Druid: { color: "#FF7C0A", icon: "classicon_druid" },
};

// icon: Wowhead icon name, stored locally as assets/icons/<icon>.jpg.
export const SPECS = [
  { id: "warrior_arms", icon: "ability_warrior_savageblow", cls: "Warrior", spec: "Arms", range: ["Melee"], dmg: "Physical", role: "Pure DPS",
    traits: "Plate, two-hander brute strength; rage (no mana); Mortal Strike healing reduction; little self-heal (Victory Rush); low mobility, gets kited; eats a lot while leveling; can respec tank; weak solo/1vX PvP without a healer" },
  { id: "warrior_fury", icon: "ability_warrior_innerrage", cls: "Warrior", spec: "Fury", range: ["Melee"], dmg: "Physical", role: "Pure DPS",
    traits: "Dual-wield brute strength; rage; top raid melee damage, direct damage; weak in PvP; no self-heal; leveling downtime; can respec tank" },
  { id: "warrior_prot", icon: "ability_warrior_defensivestance", cls: "Warrior", spec: "Protection", range: ["Melee"], dmg: "Physical", role: "Tank",
    traits: "Plate and shield main tank; rage; poor in PvP and solo questing; no pet, no shapeshift" },
  { id: "rogue_assassination", icon: "ability_rogue_eviscerate", cls: "Rogue", spec: "Assassination", range: ["Melee"], dmg: "Physical", role: "Pure DPS",
    traits: "Dexterous; energy/combo points (no mana); stealth; stuns (Cheap Shot, Kidney Shot); poisons; CC-and-reset style; strong escapes (Vanish, Sprint); no self-heal; cannot tank or heal" },
  { id: "rogue_combat", icon: "ability_backstab", cls: "Rogue", spec: "Combat", range: ["Melee"], dmg: "Physical", role: "Pure DPS",
    traits: "Dexterous; energy; direct damage, Blade Flurry cleave; strong PvE melee DPS; stuns, Sprint; cannot tank or heal" },
  { id: "rogue_subtlety", icon: "ability_stealth", cls: "Rogue", spec: "Subtlety", range: ["Melee"], dmg: "Physical", role: "Pure DPS",
    traits: "Dexterous; energy; stealth opener burst, Preparation; strongest ganking/open-world opener; cannot tank or heal" },
  { id: "paladin_holy", icon: "spell_holy_holybolt", cls: "Paladin", spec: "Holy", range: ["Melee", "Ranged"], dmg: "Spellcaster", role: "Healer",
    traits: "Plate healer; holy light magic; strong direct single-target/tank healing; mana; Divine Shield bubble; low mobility; blessings" },
  { id: "paladin_prot", icon: "spell_holy_devotionaura", cls: "Paladin", spec: "Protection", range: ["Melee"], dmg: "Combination", role: "Tank",
    traits: "Plate and shield; holy magic AoE threat; mana; self-heals; low mobility" },
  { id: "paladin_ret", icon: "spell_holy_auraoflight", cls: "Paladin", spec: "Retribution", range: ["Melee"], dmg: "Combination", role: "Hybrid",
    traits: "Holy warrior: two-hander plus holy magic; mana; can off-heal and respec healer or tank; auras and blessings support; Hammer of Justice stun; bubble; low mobility, gets kited" },
  { id: "hunter_bm", icon: "ability_hunter_beasttaming", cls: "Hunter", spec: "Beast Mastery", range: ["Ranged"], dmg: "Physical", role: "Pure DPS",
    traits: "Heavily pet-reliant; mana; easiest leveling, low downtime; kiting; Aspect of the Cheetah; no healing; cannot tank or heal" },
  { id: "hunter_mm", icon: "ability_marksmanship", cls: "Hunter", spec: "Marksmanship", range: ["Ranged"], dmg: "Physical", role: "Pure DPS",
    traits: "Bow/gun direct damage (Aimed Shot); mana; kiting; Trueshot Aura raid support; can play without a pet (Lone Wolf); no healing" },
  { id: "hunter_survival", icon: "ability_hunter_swiftstrike", cls: "Hunter", spec: "Survival", range: ["Melee", "Ranged"], dmg: "Physical", role: "Pure DPS",
    traits: "Traps, CC and defensive tools (Deterrence); kiting; uses a pet; some DoTs; no healing; cannot tank or heal" },
  { id: "druid_balance", icon: "spell_nature_starfall", cls: "Druid", spec: "Balance", range: ["Ranged"], dmg: "Spellcaster", role: "Hybrid",
    traits: "Must stay in Moonkin shapeshift form (gear hidden); nature and arcane magic; mana, can go OOM; mix of DoTs (Moonfire, Insect Swarm) and direct nukes; can off-heal and respec heal/tank; raid crit aura; roots; very mobile and slippery via forms; best flag carrier" },
  { id: "druid_bear", icon: "ability_racial_bearform", cls: "Druid", spec: "Feral - Bear", range: ["Melee"], dmg: "Combination", role: "Tank",
    traits: "Permanent bear shapeshift tank; rage; can swap to cat DPS in the same gear; off-heals out of form; mobile via forms" },
  { id: "druid_cat", icon: "ability_druid_catform", cls: "Druid", spec: "Feral - Cat", range: ["Melee"], dmg: "Combination", role: "Hybrid",
    traits: "Cat shapeshift; energy; bleed/DoT focused (Rake, Rip); stealth; can off-tank in bear and off-heal; slippery kiting, high mobility; Leader of the Pack crit aura" },
  { id: "druid_resto", icon: "spell_nature_healingtouch", cls: "Druid", spec: "Restoration", range: ["Ranged"], dmg: "Spellcaster", role: "Healer",
    traits: "HoT-focused healer, stays mostly in caster form; nature magic; mana; mobile via forms; good flag carrier" },
  { id: "shaman_elemental", icon: "spell_nature_lightning", cls: "Shaman", spec: "Elemental", range: ["Ranged"], dmg: "Spellcaster", role: "Hybrid",
    traits: "Nature/fire elemental magic (Lightning Bolt, Chain Lightning, Lava Burst); burst direct damage; mana; totems group support; can self-heal and off-heal; Ghost Wolf run speed; mail armor" },
  { id: "shaman_enh_tank", icon: "spell_nature_skinofearth", cls: "Shaman", spec: "Enhancement - Tank", range: ["Melee"], dmg: "Combination", role: "Tank",
    traits: "New WoW Forever tank spec; shield plus elemental magic; mana; totems; likely no direct taunt; Ghost Wolf; novel" },
  { id: "shaman_enh_dps", icon: "spell_nature_lightningshield", cls: "Shaman", spec: "Enhancement - DPS", range: ["Melee"], dmg: "Combination", role: "Hybrid",
    traits: "Melee plus elemental magic (Windfury burst, Maelstrom Weapon instant Lightning Bolt); mana; totems group support; off-heal; Ghost Wolf" },
  { id: "shaman_resto", icon: "spell_nature_magicimmunity", cls: "Shaman", spec: "Restoration", range: ["Ranged"], dmg: "Spellcaster", role: "Healer",
    traits: "Chain Heal raid healer; totems; nature/water magic; mana; Ghost Wolf" },
  { id: "warlock_affliction", icon: "spell_shadow_deathcoil", cls: "Warlock", spec: "Affliction", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Shadow magic; DoT and drain \"rot\" playstyle; strong self-sustain (Drain Life, Siphon Life); uses a pet but not centrally; Fear CC; Life Tap mana; easy leveling; low mobility; cannot heal others or tank" },
  { id: "warlock_demonology", icon: "spell_shadow_metamorphosis", cls: "Warlock", spec: "Demonology", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Heavily pet-reliant (Felguard); shadow magic; sustain through pet and Drain Life; easy leveling; low mobility" },
  { id: "warlock_destruction", icon: "spell_shadow_rainoffire", cls: "Warlock", spec: "Destruction", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Fire/shadow burst direct damage (Shadow Bolt, Conflagrate); little self-healing; turret-like, low mobility; minor pet" },
  { id: "mage_arcane", icon: "spell_holy_magicalsentry", cls: "Mage", spec: "Arcane", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Arcane burst; heavy mana management; Blink, Polymorph CC; squishy, no self-heal; conjured food/water" },
  { id: "mage_fire", icon: "spell_fire_firebolt02", cls: "Mage", spec: "Fire", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Fire crit burst direct damage; AoE; squishy, no self-heal; Blink" },
  { id: "mage_frost", icon: "spell_frost_frostbolt02", cls: "Mage", spec: "Frost", range: ["Ranged"], dmg: "Spellcaster", role: "Pure DPS",
    traits: "Frost kite-CC-reset style (Frost Nova, slows, Blink, Ice Block, Ice Barrier); easiest AoE grinding/leveling; optional Water Elemental pet; no self-heal" },
  { id: "priest_discipline", icon: "spell_holy_wordfortitude", cls: "Priest", spec: "Discipline", range: ["Ranged"], dmg: "Spellcaster", role: "Healer",
    traits: "Holy-magic shield healer (Power Word: Shield); Power Infusion support; mana; cloth, squishy; low mobility" },
  { id: "priest_holy", icon: "spell_holy_guardianspirit", cls: "Priest", spec: "Holy", range: ["Ranged"], dmg: "Spellcaster", role: "Healer",
    traits: "Holy-magic raid healer (Prayer of Healing); direct heals; mana; cloth; low mobility" },
  { id: "priest_shadow", icon: "spell_shadow_shadowwordpain", cls: "Priest", spec: "Shadow", range: ["Ranged"], dmg: "Spellcaster", role: "Hybrid",
    traits: "Shadow magic; DoTs (Shadow Word: Pain, Vampiric Touch) plus Mind Blast; strong self-heal and off-heal (Vampiric Embrace); group mana support; Psychic Scream fear; no pet; Shadowform keeps a humanoid look with visible gear; low mobility; can respec to two healer specs" },
];

export const FUNDAMENTALS = [
  { key: "range", title: "Melee or ranged?", t: 164,
    guide: "Picture a boss fight or a big battle. Are you trading blows up close, or holding the line at range? Leave both ticked unless you feel strongly.",
    options: ["Melee", "Ranged"],
    icons: { Melee: "inv_sword_04", Ranged: "inv_weapon_bow_07" } },
  { key: "dmg", title: "Spellcaster, physical, or both?", t: 208,
    guide: "Pure casters hit hardest but get interrupted and are squishy. Physical classes handle movement and armor better. Combination covers battle mages and holy warriors.",
    options: ["Spellcaster", "Physical", "Combination"],
    icons: { Spellcaster: "spell_holy_magicalsentry", Physical: "ability_warrior_cleave", Combination: "spell_holy_sealofmight" } },
  { key: "role", title: "Which roles do you enjoy?", t: 264,
    guide: "Tank, healer, pure DPS, or hybrid (damage plus off-heal/support flexibility).",
    options: ["Tank", "Healer", "Pure DPS", "Hybrid"],
    icons: { Tank: "inv_shield_06", Healer: "spell_holy_flashheal", "Pure DPS": "ability_warrior_challange", Hybrid: "spell_nature_wispsplode" } },
];

const qs = (list) => list.map((q) => ({ q }));

// Asked once on the Playstyle step and applied to every content type (each step can override an answer).
// "Any obvious exclusions?" became the click-to-exclude grid on the Look back step.
export const PLAYSTYLE = qs([
  "Do you want your character to be dot/hot focused or direct damage/healing focused?",
  "How do you feel about Shapeshifting during battle?",
  "Do you have any preference in terms of schools of magic?",
  "Do you prefer brute, raw strength or dexterity and skill?",
  "How do you feel about pet-based classes?",
  "Is mobility mandatory?",
  "Is having a finite resource a dealbreaker (mana)?",
  "Any general aesthetic preferences? Sound design?",
]);

const PVP_Q = [
  "Do you prefer to kite and reset, or survive and outlast?",
  "Self-healing: negotiable?",
  "Are you ok if your class is heavily Cooldown reliant?",
  "Do you NEED a Stun in the kit?",
  "Do you NEED strong escape/engage potential?",
];

// `when`: only asked if the pool still has a spec with that role.
const RAID_ITEMS = [
  { q: "Do you care more about doing maximum personal damage, or increasing the raid's damage?" },
  { q: "Do you want to be able to off-tank or re-spec tank?" },
  { q: "Do you want to be able to off-heal or re-spec healer?" },
  { q: "If Healers are in your list: Tank healing or Raid healing?", when: "Healer" },
  { q: "If Tanks are in your list: is it a deal breaker if you have to manage a finite resource (mana)?", when: "Tank" },
  { q: "Any other considerations? Novelty?" },
];

const RP_DETERMINES = "Will your RP character determine your class / spec?";
const RP_MATTERS = "If not - does it matter to you that the class / spec you eventually choose matches your RP character?";

// `showIf`: only asked once another question in the step has that answer.
// `favors`: classes octy's tip recommends for a content type without questions; only they score there.
export const CONTENT_TYPES = [
  { id: "pvp_1vx", icon: "ability_dualwield", label: "1vX PVP", examples: [{ who: "octy", t: 510 }], items: qs(PVP_Q) },
  { id: "pvp_small", icon: "achievement_arena_2v2_7", label: "Small group PVP", examples: [{ who: "Dqve", t: 2672 }], items: qs(PVP_Q) },
  { id: "pvp_large", icon: "inv_bannerpvp_02", label: "Large scale PVP", examples: [], items: qs(PVP_Q) },
  { id: "bgs", icon: "inv_misc_rune_07", label: "BGs", examples: [{ who: "octy", t: 711 }, { who: "Dqve", t: 2390 }, { who: "Theo", t: 3308 }],
    items: qs([...PVP_Q, "Do you want to be expected to flag carry?", "Do you want to be expected to defend a base?"]) },
  { id: "ganking", icon: "ability_rogue_ambush", label: "Ganking/griefing", examples: [], tip: "octy's sheet: just roll Rogue, or Priest, or Druid.", favors: ["Rogue", "Priest", "Druid"], items: [] },
  { id: "dungeons", icon: "inv_misc_key_03", label: "Dungeons", examples: [{ who: "Osa", t: 1773 }, { who: "Dqve", t: 2768 }, { who: "Theo", t: 3244 }],
    items: qs([
      "Do you care more about doing maximum personal damage, or increasing the group's damage?",
      "Do you want to be able to off-tank or re-spec tank?",
      "Do you want to be able to off-heal or re-spec healer?",
      "Big AOE, or massive Single Target?",
      "Any other considerations? Novelty?",
    ]) },
  { id: "raid_pug", icon: "inv_misc_head_dragon_01", label: "Raiding in PUGs", examples: [{ who: "octy", t: 792 }], items: RAID_ITEMS },
  { id: "raid_guild", icon: "inv_misc_tabardpvp_01", label: "Raiding in a Guild", examples: [{ who: "Theo", t: 3048 }], items: RAID_ITEMS },
  { id: "speedrun", icon: "spell_nature_swiftness", label: "Speedrunning", examples: [], tip: "octy's sheet: wait for the tierlists to come out, and align with your raid. Nothing to ask here yet, so it doesn't change your scores.", items: [] },
  { id: "leveling", icon: "inv_misc_book_09", label: "Leveling", examples: [{ who: "Osa", t: 1373 }],
    items: qs([
      "What have you already leveled to 60 before?",
      "Do you want a new experience, or do you want to refine your route?",
      "How much of a challenge do you want?",
      "How do you feel about downtime?",
      "Any AOE grinding or just pure questing?",
      "How about dungeons - do you want to be able to heal/tank dungeons while leveling?",
      "Do you care about a free level 40 mount?",
    ]) },
  { id: "hardcore", icon: "inv_misc_bone_humanskull_01", label: "Hardcore", examples: [],
    items: qs([
      "What have you already leveled to 60 on HC before?",
      "Do you want a new experience, or do you want to refine your route?",
      "How much of a challenge do you want?",
      "How do you feel about downtime?",
      "Any AOE grinding or just pure questing?",
      "How about dungeons - do you want to be able to heal/tank dungeons while leveling?",
      "Do you want to have hard saves/escapes, or are you ok dying to a serious mistake?",
    ]) },
  { id: "roleplay", icon: "inv_misc_note_06", label: "Roleplay", examples: [{ who: "Osa", t: 1965 }],
    items: [
      { q: "Do you have an established RP character headed into WoW Forever?" },
      { q: RP_DETERMINES },
      { q: "If so - what's your plan for your first Forever character?", showIf: { q: RP_DETERMINES, option: "Yes" } },
      { q: RP_MATTERS, showIf: { q: RP_DETERMINES, option: "No" } },
      { hint: "If it doesn't - consider other texture analyses as a higher priority!", showIf: { q: RP_MATTERS, option: "No" } },
      { q: "If it does - what part of Azeroth are you drawn to (Faction → Race)?", showIf: { q: RP_MATTERS, option: "Yes" } },
      { q: "What kind of RP characters do you see possible, given your Faction / Race preference?", showIf: { q: RP_MATTERS, option: "Yes" } },
      { q: "What alignment are you leaning towards for your first character? Do you want it to match their typical class / spec fantasy?",
        showIf: { q: RP_MATTERS, option: "Yes" } },
    ] },
  { id: "farming", icon: "inv_misc_coin_01", label: "Farming/professions", examples: [],
    items: [
      { q: "Raw gold/kill-based farms, or Professions/Auction House?" },
      { q: "Do you want to min-max your farming efficiency?" },
      { q: "If so, from what perspective: movement? Downtime? Time to kill? Gather speed?",
        showIf: { q: "Do you want to min-max your farming efficiency?", option: "Yes, I want to play the BEST farming class" } },
      { q: "Solo farms only, or do you want to go for group content?" },
    ] },
];

// octy's weights: 3 for the top content type, then 2, 1, and 0.5 for the rest.
export const DEFAULT_WEIGHTS = [3, 2, 1, 0.5];
