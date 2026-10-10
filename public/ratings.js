import { SPECS, CLASSES } from "./data.js";

const LEVELED = ["What have you already leveled to 60 before?", "What have you already leveled to 60 on HC before?"];
const NEW_OR_REFINE = "Do you want a new experience, or do you want to refine your route?";
function classOptions() {
  return Object.fromEntries(Object.keys(CLASSES).map((cls) => [cls, null]));
}

// octy's preset answers per texture question (GUIDED sheet dropdowns) with his rating of every spec for that answer
// (sheet tab "Spec Texture Ruleset"). Each rating string has one letter per spec, in SPECS order:
// G = good match, Y = narrow match, X = recommended to exclude, . = not rated. null = answer has no ratings.
export const TEXTURE_OPTIONS = {
  "Do you prefer to kite and reset, or survive and outlast?": {
    "Kite and reset": "XXXGGGXXXGGGGXGGYYYYXXXGGGXXX",
    "Survive and Outlast": "GGGXXXGGGYXYGXGGGGGGGGGXXXGGG",
  },
  "Do you want your character to be dot/hot focused or direct damage/healing focused?": {
    "Direct damage/healing preferred": "GGGGGGGGGGGGYYYXGGGGXGGGGGGGY",
    "Dots/Hots preferred": "XXXYXXXXXXXYGYGGXXXYGYYXYXXXG",
  },
  "Self-healing: negotiable?": {
    "Need strong self-healing": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I need some healing": "XXXXXXGGGYXXGGGGGGGGYYXXXXGGG",
  },
  "How do you feel about Shapeshifting during battle?": {
    "I prefer shapeshifting classes": "XXXXXXXXXXXXGGGGYYYYXXXXXXXXY",
    "I hate it": "GGGGGGGGGGGGXXXXYYYYGGGGGGGGY",
  },
  "Do you have any preference in terms of schools of magic?": {
    "Shadow": "XXXXXXXXXXXXXXXXXXXXGGGXXXYYG",
    "Elemental (E/W/A/F)": "XXXXXXXXXXXXXXXXGGGGXXXGGGXXX",
    "Arcane": "XXXXXXXXXXXXXXXXXXXXXXXGGGXXX",
    "Frost": "XXXXXXXXXXXXXXXXXXXXXXXGGGXXX",
    "Holy": "XXXXXXGGGXXXXXXXXXXXXXXXXXGGY",
    "Nature": "XXXXXXXXXXXXGGGGXXXXXXXXXXXXX",
  },
  "Do you prefer brute, raw strength or dexterity and skill?": {
    "Strength": "GGGXXXXGGXXXXGYXXYYXXXXXXXXXX",
    "Dexterity": "XXXGGGXXXGGGXYGXXGGXXXXXXXXXX",
  },
  "How do you feel about pet-based classes?": {
    "I prefer pet-based classes": "XXXXXXXXXGYGXXXXXXXXGGGXXXXXX",
    "I hate it": "GGGGGGGGGXYXGGGGGGGGYXYGGGGGG",
  },
  "Is mobility mandatory?": {
    "I need strong mobility": "XXXXXXXXXGGGGGGGYYYYXXXGGGXXX",
    "I need some mobility": "YYYYYYYYYGGGGGGGGGGGXXXGGGXXX",
  },
  "Is having a finite resource a dealbreaker (mana)?": {
    "I hate mana management": "GGGGGGXXYYYYXGYXXYYXGGGXXXXXY",
  },
  "Are you ok if your class is heavily Cooldown reliant?": {
    "I prefer it": "GGGGGGGGGXXXXXXXXXXXXXXYGGXXX",
    "I hate it": "XXXXXXXXXGGGGGGGGGGGGGGXXXGGG",
  },
  "Do you NEED a Stun in the kit?": {
    "I need stuns": "YYYGGGGGGGXXYGYYXXXXXXXXXXXXX",
    "I need some kind of reliable hard CC": "YYYGGGGGGGGGGGGGXXXXGGGGGGGGG",
  },
  "Do you NEED strong escape/engage potential?": {
    "I need to be able to get away": "XXXGGGGGGGGGGGGGYYYYXXXGGGXXX",
  },
  "Do you want to be able to off-tank or re-spec tank?": {
    "I need to be able to tank": "GGGXXXGGGXXXGGGGYGYYXXXXXXXXX",
    "I hate tanking": "XXXGGGGXXGGGGXGGGXGGGGGGGGGGG",
  },
  "Do you want to be able to off-heal or re-spec healer?": {
    "I need to be able to heal": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I hate healing": "GGGGGGXGGGGGYYYXYYYXGGGGGGXXX",
  },
  "Do you care more about doing maximum personal damage, or increasing the raid's damage?": {
    "Personal damage to the moon": "GGGGGGXXGGGGXXXXXXXXGGGGGGXXX",
    "Raid damage is my priority": "XXXXXXXXXXXXGGGXGGGGXXXXXXXXG",
    "I like having some support": "XXXXXXGGGXXXGGGYGGGGXXXXXXGXG",
  },
  "If Healers are in your list: Tank healing or Raid healing?": {
    "Tank healing": "......G........Y...Y......YG.",
    "Raid healing": "......X........G...G......GG.",
    "Balanced healing": "......X........G...G......GG.",
  },
  "If Tanks are in your list: is it a deal breaker if you have to manage a finite resource (mana)?": {
    "Deal breaker - Rage only!": "..G....X.....G...X...........",
    "I like the Mana mini-game": "..X....G.....Y...G...........",
  },
  "How much of a challenge do you want?": {
    "Big challenge": "GGGYYYXXXXYXGYYXGYYXXXYYYXXXX",
    "Medium challenge": "XXYGGGYYXXGGYGGYYYYYXXGYYXYYX",
    "As easy as possible": "XXXXXXYGGGXXXYXYXXXYGGXGGGYYG",
  },
  "How do you feel about downtime?": {
    "I hate downtime": "YGYYYYXXYGYGXGGXXGGXGGYXXXYYG",
    "I'm fine with some downtime": "GYGGGGYGGYGYYYYXYGGYXXGXXYYYY",
    "I like to take it slow": "XXXXXXGGYXYXGXXGGXXGXXYGGGYYX",
  },
  "How about dungeons - do you want to be able to heal/tank dungeons while leveling?": {
    "I need to have tank AND healer offspec": "XXXXXXGGGXXXGGGGGGGGXXXXXXXXX",
    "I need tank offspec": "GGGXXXGGGXXXGGGGGGGGXXXXXXXXX",
    "I need healer offspec": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I don't plan to tank/heal": "GGXGGGXXGGGGGXGXGXGXGGGGGGXXG",
  },
  "Do you want to be expected to flag carry?": {
    "I love flag carrying": "XXYXXYXYXXXYGGGYYYYYXXXXXGXXX",
    "I hate flag carrying": "GGGGGGGGGGGGXYYGGGGGGGGGGGGGG",
  },
  "Do you want to be expected to defend a base?": {
    "I love defending bases": "XXXGGGXYYGYGYYYXXXXXGGGXXXXXX",
    "I hate defending bases": "GGGXXXGGGXYXGGGGGGGGXXXGGGGGG",
  },
  "Do you care more about doing maximum personal damage, or increasing the group's damage?": {
    "Personal damage to the moon": "GGXGGGXXGGGGXXXXXXXXGGGGGGXXX",
    "Group damage is my priority": "XXXXXXXXXXXXGGGXGGGGXXXXXXGXX",
    "I like having some support": "XXXXXXGGGXXXGGGXGGGGXXXXXXGYG",
  },
  "Big AOE, or massive Single Target?": {
    "I want to blast on AOE pulls": "YYGXYX.GXYYYGYY.YYY.YGGGGG..X",
    "I want to prioritize single target": "GGXGGY.XGGGGYYG.GGG.GGGGGG..G",
    "I like a balance": "GGXXGY.XXGGGGGG.GGG.GGGGGG..Y",
  },
  "Do you want to have hard saves/escapes, or are you ok dying to a serious mistake?": {
    "I need strong escapes/saves": "XXXGGGGGGGGGYYYYXXXXXXXYYGXXX",
    "I need some decent outs": "XXXGGGGGGGGGGGGGXGGXXXXGGGXXX",
    "I don't want any hard saves": "GGGXXXXXXXXXXXXXGXXGGGGXXXGGG",
  },
  "Raw gold/kill-based farms, or Professions/Auction House?": {
    "Farming mobs for my gold": "GGGGGGXGGGGGGGGXGGGXGGGGGGXXG",
    "Profession/AH focus": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to min-max your farming efficiency?": {
    "Yes, I want to play the BEST farming class": "XXXXXXXYXYXXYYGXXXXXGGXXXGXXY",
    "No, I just want to farm on my chosen main": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "If so, from what perspective: movement? Downtime? Time to kill? Gather speed?": {
    "Movement - I want to move mob to mob FAST": "YYYXXXXXXGGGGGGXXGGXXXXXXXXXX",
    "Downtime - I want to kill with ZERO downtime": "XYGXXXXXYGGGXYGXXYYXGGYXXXGYG",
    "TTK - I want to kill mobs FAST": "GGXGGGXXYGGYYXGXGYGXGGGGGGXXY",
    "Gather - I want to gather herbs FAST (Tauren)": "YYYXXXXXXYYYGGGXYYYXXXXXXXXXX",
  },
  "Solo farms only, or do you want to go for group content?": {
    "I mostly will farm Solo": "GGXGGGXGGGGGGYGXGYGXGGGGGGXXG",
    "I mostly will farm in Group content": "XXGXXXGGXXXXXGXGXGXGXXXXXXGGX",
  },
  "Any AOE grinding or just pure questing?": {
    "I love AOE grinding": "XXYXXXXGXXXXXYXXXYXXXXXXXGXXX",
    "I hate AOE grinding": "GGGGGGGYGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you care about a free level 40 mount?": {
    "Yes, this is huge for me": "XXXXXXGGGXXXXXXXXXXXGGGXXXXXX",
    "No, I want to be more careful with my gold": "GGGGGGXXXGGGGGGGGGGGXXXGGGGGG",
  },
  // Not in octy's sheet: pickers whose ratings are derived in ratingsOf below.
  [LEVELED[0]]: classOptions(),
  [LEVELED[1]]: classOptions(),
  [NEW_OR_REFINE]: { "New experience": null, "Refine my route": null },
  // Roleplay branch questions: unrated, they only decide which follow-ups are asked.
  "Do you have an established RP character headed into WoW Forever?": { Yes: null, No: null },
  "Will your RP character determine your class / spec?": { Yes: null, No: null },
  "If not - does it matter to you that the class / spec you eventually choose matches your RP character?": { Yes: null, No: null },
};

// Questions where several answers can be picked at once; every other question is single-choice.
export const MULTI_CHOICE = new Set([
  "Do you have any preference in terms of schools of magic?",
  "If so, from what perspective: movement? Downtime? Time to kill? Gather speed?",
  ...LEVELED,
]);

// The rating of every spec for one answer, as {specId: "G" | "Y" | "X"}; unrated specs are omitted.
// `answers` ({question: {chosen}}) supplies context for derived questions: "new experience" turns away the classes
// already leveled, "refine my route" prefers them.
export function ratingsOf(question, option, answers) {
  if (question === NEW_OR_REFINE) {
    const leveled = new Set(LEVELED.flatMap((q) => answers[q]?.chosen ?? []));
    if (!leveled.size) return {};
    const fresh = option === "New experience";
    return Object.fromEntries(SPECS.map((s) => [s.id, leveled.has(s.cls) ? (fresh ? "X" : "G") : fresh ? "G" : "Y"]));
  }
  const letters = TEXTURE_OPTIONS[question]?.[option] ?? "";
  return Object.fromEntries(SPECS.flatMap((s, i) => (letters[i] && letters[i] !== "." ? [[s.id, letters[i]]] : [])));
}
