// Builds the TypeSafe System One request. Server-side only, so the endpoint can't be used as a general Jev proxy.
import { answerRatings } from "../public/funnel.js";

const RATING_TEXT = { Y: "narrow match", X: "recommended to exclude" };

// answers: {question: {chosen, text, dealbreaker}}, at least one with free text.
export function buildRequest(contentType, answers, specs) {
  const entries = Object.entries(answers);
  // octy's ratings only matter for dealbreakers: a preference never rules a spec out on its own.
  const rated = entries
    .filter(([, a]) => a.dealbreaker && a.chosen.length)
    .map(([q, a]) => ({ q, options: a.chosen.join(" / "), ratings: answerRatings(q, a, answers) }));
  const ratingNotes = (s) =>
    rated.flatMap(({ q, options, ratings }) => (RATING_TEXT[ratings[s.id]] ? [`${q} → ${options}: ${RATING_TEXT[ratings[s.id]]}`] : []));

  return {
    state: {
      // Shared rules live in the state, which is billed once per call; question instructions are billed per question.
      rules: [
        "Each of `player_answers` has `chosen_options` (preset answers), `free_text`, or both. Preset answers have a `strength`: 'dealbreaker' or 'preference'; free text is judged on its own wording.",
        "`specs.<id>.expert_ratings` lists an expert's rating of that spec for the player's dealbreaker answers; dealbreakers it doesn't list rate the spec as a good match or not at all.",
        "Rule a spec out if a dealbreaker's rating is 'recommended to exclude', or if free text states a firm requirement or dislike that directly conflicts with the spec.",
        "Free text that qualifies a chosen option (for example, allowing an exception) takes precedence over the rating.",
        "Preference answers never rule a spec out on their own; neither do a 'narrow match', unanswered questions, or soft wishes in free text.",
      ],
      content_type: contentType.label,
      player_answers: entries.map(([q, a]) => ({
        question: q,
        ...(a.chosen.length && { chosen_options: a.chosen, strength: a.dealbreaker ? "dealbreaker" : "preference" }),
        ...(a.text && { free_text: a.text }),
      })),
      specs: Object.fromEntries(
        specs.map((s) => {
          const notes = ratingNotes(s);
          return [s.id, {
            description: `${s.cls} ${s.spec} (${s.role}): ${s.traits}`,
            ...(notes.length && { expert_ratings: notes }),
          }];
        }),
      ),
    },
    model: "jev-latest",
    questions: Object.fromEntries(
      specs.map((s) => [
        s.id,
        {
          type: "noul",
          instructions: `Following \`rules\`, should \`player_answers\` rule out the spec \`specs.${s.id}\` for \`content_type\`?`,
          criteria: { true: "Ruled out", false: "Not ruled out" },
        },
      ]),
    ),
  };
}
