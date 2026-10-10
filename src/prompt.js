// Builds the TypeSafe System One request. Server-side only, so the endpoint can't be used as a general Jev proxy.
import { octyRatings } from "../public/ratings.js";

const RATING_TEXT = { Y: "narrow match", X: "recommended to exclude" };

// answers: [{q, answer, chosen}] with at least one of free text or chosen preset answers.
export function buildRequest(contentType, answers, specs) {
  const rated = answers.flatMap((a) => a.chosen.map((option) => ({ q: a.q, option, ratings: octyRatings(a.q, option) })));
  // Only narrow/exclude ratings are listed; good matches and unrated specs carry no signal against the spec.
  const ratingNotes = (s) =>
    rated.flatMap(({ q, option, ratings }) => (RATING_TEXT[ratings[s.id]] ? [`${q} → ${option}: ${RATING_TEXT[ratings[s.id]]}`] : []));

  return {
    state: {
      // Shared rules live in the state, which is billed once per call; question instructions are billed per question.
      rules: [
        "Each of `player_answers` has `chosen_options` (preset answers), `free_text`, or both.",
        "`specs.<id>.expert_ratings` lists an expert's rating of that spec for the player's chosen options; chosen options it doesn't list rate the spec as a good match or not at all.",
        "Rule a spec out if a 'recommended to exclude' rating reflects what the player wants, or if free text directly conflicts with the spec.",
        "Free text that qualifies a chosen option (for example, allowing an exception) takes precedence over the rating.",
        "A 'narrow match' alone is not a reason to rule a spec out, and neither are unanswered, neutral, or soft preferences.",
      ],
      content_type: contentType.label,
      player_answers: answers.map((a) => ({
        question: a.q,
        ...(a.chosen.length && { chosen_options: a.chosen }),
        ...(a.answer && { free_text: a.answer }),
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
