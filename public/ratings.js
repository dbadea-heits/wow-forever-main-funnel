import { SPECS } from "./data.js";

// octy's preset answers per texture question (GUIDED sheet dropdowns) with his rating of every spec for that answer
// (sheet tab "Spec Texture Ruleset"). Each rating string has one letter per spec, in SPECS order:
// G = good match, Y = narrow match, X = recommended to exclude, . = not rated. null = answer has no ratings.
export const TEXTURE_OPTIONS = {
  "Do you prefer to kite and reset, or survive and outlast?": {
    "Kite and reset": "XXXGGGXXXGGGGXGGYYYYXXXGGGXXX",
    "Survive and Outlast": "GGGXXXGGGYXYGXGGGGGGGGGXXXGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want your character to be dot/hot focused or direct damage/healing focused?": {
    "Direct damage/healing preferred": "GGGGGGGGGGGGYYYXGGGGXGGGGGGGY",
    "Dots/Hots preferred": "XXXYXXXXXXXYGYGGXXXYGYYXYXXXG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Self-healing: negotiable?": {
    "Need strong self-healing": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I need some healing": "XXXXXXGGGYXXGGGGGGGGYYXXXXGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "How do you feel about Shapeshifting during battle?": {
    "I prefer shapeshifting classes": "XXXXXXXXXXXXGGGGYYYYXXXXXXXXY",
    "I hate it": "GGGGGGGGGGGGXXXXYYYYGGGGGGGGY",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you have any preference in terms of schools of magic?": {
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
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
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "How do you feel about pet-based classes?": {
    "I prefer pet-based classes": "XXXXXXXXXGYGXXXXXXXXGGGXXXXXX",
    "I hate it": "GGGGGGGGGXYXGGGGGGGGYXYGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Is mobility mandatory?": {
    "I need strong mobility": "XXXXXXXXXGGGGGGGYYYYXXXGGGXXX",
    "I need some mobility": "YYYYYYYYYGGGGGGGGGGGXXXGGGXXX",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Is having a finite resource a dealbreaker (mana)?": {
    "I hate mana management": "GGGGGGXXYYYYXGYXXYYXGGGXXXXXY",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Are you ok if your class is heavily Cooldown reliant?": {
    "I prefer it": "GGGGGGGGGXXXXXXXXXXXXXXYGGXXX",
    "I hate it": "XXXXXXXXXGGGGGGGGGGGGGGXXXGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you NEED a Stun in the kit?": {
    "I need stuns": "YYYGGGGGGGXXYGYYXXXXXXXXXXXXX",
    "I need some kind of reliable hard CC": "YYYGGGGGGGGGGGGGXXXXGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you NEED strong escape/engage potential?": {
    "I need to be able to get away": "XXXGGGGGGGGGGGGGYYYYXXXGGGXXX",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to be able to off-tank or re-spec tank?": {
    "I need to be able to tank": "GGGXXXGGGXXXGGGGYGYYXXXXXXXXX",
    "I hate tanking": "XXXGGGGXXGGGGXGGGXGGGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to be able to off-heal or re-spec healer?": {
    "I need to be able to heal": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I hate healing": "GGGGGGXGGGGGYYYXYYYXGGGGGGXXX",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you care more about doing maximum personal damage, or increasing the raid's damage?": {
    "Personal damage to the moon": "GGGGGGXXGGGGXXXXXXXXGGGGGGXXX",
    "Raid damage is my priority": "XXXXXXXXXXXXGGGXGGGGXXXXXXXXG",
    "I like having some support": "XXXXXXGGGXXXGGGYGGGGXXXXXXGXG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "If Healers are in your list: Tank healing or Raid healing?": {
    "Tank healing": "......G........Y...Y......YG.",
    "Raid healing": "......X........G...G......GG.",
    "Balanced healing": "......X........G...G......GG.",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "If Tanks are in your list: is it a deal breaker if you have to manage a finite resource (mana)?": {
    "Deal breaker - Rage only!": "..G....X.....G...X...........",
    "I like the Mana mini-game": "..X....G.....Y...G...........",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "How much of a challenge do you want?": {
    "Big challenge": "GGGYYYXXXXYXGYYXGYYXXXYYYXXXX",
    "Medium challenge": "XXYGGGYYXXGGYGGYYYYYXXGYYXYYX",
    "As easy as possible": "XXXXXXYGGGXXXYXYXXXYGGXGGGYYG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "How do you feel about downtime?": {
    "I hate downtime": "YGYYYYXXYGYGXGGXXGGXGGYXXXYYG",
    "I'm fine with some downtime": "GYGGGGYGGYGYYYYXYGGYXXGXXYYYY",
    "I like to take it slow": "XXXXXXGGYXYXGXXGGXXGXXYGGGYYX",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "How about dungeons - do you want to be able to heal/tank dungeons while leveling?": {
    "I need to have tank AND healer offspec": "XXXXXXGGGXXXGGGGGGGGXXXXXXXXX",
    "I need tank offspec": "GGGXXXGGGXXXGGGGGGGGXXXXXXXXX",
    "I need healer offspec": "XXXXXXGGGXXXGGGGGGGGXXXXXXGGG",
    "I don't plan to tank/heal": "GGXGGGXXGGGGGXGXGXGXGGGGGGXXG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to be expected to flag carry?": {
    "I love flag carrying": "XXYXXYXYXXXYGGGYYYYYXXXXXGXXX",
    "I hate flag carrying": "GGGGGGGGGGGGXYYGGGGGGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to be expected to defend a base?": {
    "I love defending bases": "XXXGGGXYYGYGYYYXXXXXGGGXXXXXX",
    "I hate defending bases": "GGGXXXGGGXYXGGGGGGGGXXXGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you care more about doing maximum personal damage, or increasing the group's damage?": {
    "Personal damage to the moon": "GGXGGGXXGGGGXXXXXXXXGGGGGGXXX",
    "Group damage is my priority": "XXXXXXXXXXXXGGGXGGGGXXXXXXGXX",
    "I like having some support": "XXXXXXGGGXXXGGGXGGGGXXXXXXGYG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Big AOE, or massive Single Target?": {
    "I want to blast on AOE pulls": "YYGXYX.GXYYYGYY.YYY.YGGGGG..X",
    "I want to prioritize single target": "GGXGGY.XGGGGYYG.GGG.GGGGGG..G",
    "I like a balance": "GGXXGY.XXGGGGGG.GGG.GGGGGG..Y",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to have hard saves/escapes, or are you ok dying to a serious mistake?": {
    "I need strong escapes/saves": "XXXGGGGGGGGGYYYYXXXXXXXYYGXXX",
    "I need some decent outs": "XXXGGGGGGGGGGGGGXGGXXXXGGGXXX",
    "I don't want any hard saves": "GGGXXXXXXXXXXXXXGXXGGGGXXXGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Planning to raid at 60?": {
    "Yes": null,
    "No": null,
    "Not sure yet": null,
  },
  "Raw gold/kill-based farms?": {
    "Yes, farming mobs for my gold": "GGGGGGXGGGGGGGGXGGGXGGGGGGXXG",
    "No, profession/AH focus": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Or Professions/Auction House?": {
    "Yes, profession/AH focus": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "No, farming mobs for my gold": "GGGGGGXGGGGGGGGXGGGXGGGGGGXXG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you want to min-max your farming efficiency?": {
    "Yes, I want to play the BEST farming class": "XXXXXXXYXYXXYYGXXXXXGGXXXGXXY",
    "No, I just want to farm on my chosen main": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
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
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Any AOE grinding or just pure questing?": {
    "I love AOE grinding": "XXYXXXXGXXXXXYXXXYXXXXXXXGXXX",
    "I hate AOE grinding": "GGGGGGGYGGGGGGGGGGGGGGGGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
  "Do you care about a free level 40 mount?": {
    "Yes, this is huge for me": "XXXXXXGGGXXXXXXXXXXXGGGXXXXXX",
    "No, I want to be more careful with my gold": "GGGGGGXXXGGGGGGGGGGGXXXGGGGGG",
    "No strong preference": "GGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  },
};

// TEXTURE_OPTIONS[question][answer] as {specId: "G" | "Y" | "X"}; unrated specs are omitted.
export function octyRatings(question, answer) {
  const letters = TEXTURE_OPTIONS[question]?.[answer] ?? "";
  return Object.fromEntries(SPECS.flatMap((s, i) => (letters[i] && letters[i] !== "." ? [[s.id, letters[i]]] : [])));
}
