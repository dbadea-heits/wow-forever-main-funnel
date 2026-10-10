// Builds the TypeSafe System One request. Server-side only, so the endpoint can't be used as a general Jev proxy.

export function buildRequest(contentType, answers, specs) {
  return {
    state: {
      content_type: contentType.label,
      player_answers: answers
        .filter((a) => a.answer.trim())
        .map((a) => ({ question: a.q, answer: a.answer.trim() })),
      specs: Object.fromEntries(specs.map((s) => [s.id, `${s.cls} ${s.spec} (${s.role}): ${s.traits}`])),
    },
    model: "jev-latest",
    questions: Object.fromEntries(
      specs.map((s) => [
        s.id,
        {
          type: "noul",
          instructions:
            `Do the player's \`player_answers\` for \`content_type\` clearly rule out the spec \`specs.${s.id}\`? ` +
            "Answer yes only if a stated preference directly conflicts with this spec. " +
            "Unanswered, neutral, or soft preferences are not exclusions.",
          criteria: {
            true: "A stated preference directly conflicts with this spec",
            false: "No stated preference conflicts with this spec",
          },
        },
      ]),
    ),
  };
}
