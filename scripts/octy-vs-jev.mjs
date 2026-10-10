// Compares octy's chip ratings (public/ratings.js) with Jev. Prints a markdown report to stdout.
//   1. Jev's own view: per rated option, a G/Y/X-style score for every spec, without octy's ratings.
//   2. Faithfulness: the production prompt (src/prompt.js) for each chip alone, with octy's ratings.
// Usage: node scripts/octy-vs-jev.mjs > report.md   (reads TYPESAFE_API_KEY from env or .dev.vars)
import { readFileSync } from "node:fs";
import { SPECS, CONTENT_TYPES } from "../public/data.js";
import { TEXTURE_OPTIONS } from "../public/ratings.js";
import { buildRequest } from "../src/prompt.js";

const KEY = process.env.TYPESAFE_API_KEY ?? readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^TYPESAFE_API_KEY=(.*)$/m)[1].trim();
const CONCURRENCY = 4;
const LEVELS = ["G", "Y", "X"];
const NO_PREF = "No strong preference";

let tokens = 0;
let calls = 0;
async function jev(body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
    const json = await res.json();
    tokens += json.usage.input_tokens;
    calls++;
    return json.answers;
  }
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const describe = (s) => `${s.cls} ${s.spec} (${s.role}): ${s.traits}`;
// Every rated (question, option, spec) cell: octy's letter plus room for Jev's verdicts.
const questions = Object.entries(TEXTURE_OPTIONS)
  .map(([q, options]) => ({ q, options: Object.entries(options).filter(([, letters]) => letters) }))
  .filter((x) => x.options.length);
const cells = questions.flatMap(({ q, options }) =>
  options.flatMap(([option, letters]) =>
    SPECS.flatMap((s, i) => (letters[i] === "." ? [] : [{ q, option, spec: s, octy: letters[i] }])),
  ),
);
const cellKey = (q, option, specId) => `${q}|${option}|${specId}`;
const byKey = new Map(cells.map((c) => [cellKey(c.q, c.option, c.spec.id), c]));

// ---------- run 1: Jev's own view, one call per question ----------
await pool(questions, async ({ q, options }) => {
  const qs = {};
  options.forEach(([option, letters], oi) =>
    SPECS.forEach((s, si) => {
      if (letters[si] === ".") return;
      qs[`${oi}.${s.id}`] = {
        type: "score",
        instructions: `A player answered \`question\` with \`options.o${oi}\`. How well does the spec \`specs.${s.id}\` fit that answer?`,
        criteria: [
          "Good match: the spec fits this preference",
          "Narrow match: the spec fits only partly or with caveats",
          "Should be excluded: the spec clashes with this preference",
        ],
      };
    }),
  );
  const answers = await jev({
    state: {
      question: q,
      options: Object.fromEntries(options.map(([option], oi) => [`o${oi}`, option])),
      specs: Object.fromEntries(SPECS.map((s) => [s.id, describe(s)])),
    },
    model: "jev-latest",
    questions: qs,
  });
  for (const [id, a] of Object.entries(answers)) {
    const [oi, specId] = id.split(".");
    const level = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1])[0][0];
    byKey.get(cellKey(q, options[oi][0], specId)).jev = LEVELS[Number(level)];
  }
});

// ---------- run 2: production prompt per chip, with octy's ratings ----------
const ctFor = (q) => CONTENT_TYPES.find((c) => c.items.some((it) => it.q === q));
const chips = questions.flatMap(({ q, options }) => options.map(([option]) => ({ q, option })));
await pool(chips, async ({ q, option }) => {
  const body = buildRequest(ctFor(q), [{ q, answer: "", chosen: [option] }], SPECS);
  const answers = await jev(body);
  for (const [specId, a] of Object.entries(answers)) {
    const c = byKey.get(cellKey(q, option, specId));
    if (c) c.pExcl = a.noul;
  }
});

// ---------- report ----------
const pctOf = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "—");
const informative = cells.filter((c) => c.option !== NO_PREF);
const lines = [];
const p = (s = "") => lines.push(s);

p("# octy vs Jev: chip ratings");
p();
p(`${cells.length} rated cells (${informative.length} excluding "${NO_PREF}"), ${chips.length} chips, ${calls} Jev calls, ${tokens.toLocaleString()} input tokens (≈ $${((tokens / 1e6) * 0.042).toFixed(3)}).`);
p();
p("## 1. Jev's own view vs octy (no ratings given)");
p();
p(`Agreement: ${pctOf(informative.filter((c) => c.jev === c.octy).length, informative.length)} of informative cells (${pctOf(cells.filter((c) => c.jev === c.octy).length, cells.length)} including "${NO_PREF}").`);
p();
p("| octy \\ Jev | G | Y | X |");
p("|---|---|---|---|");
for (const o of LEVELS) p(`| ${o} | ${LEVELS.map((j) => informative.filter((c) => c.octy === o && c.jev === j).length).join(" | ")} |`);
p();
const severe = informative.filter((c) => (c.octy === "X" && c.jev === "G") || (c.octy === "G" && c.jev === "X"));
p(`Severe disagreements (octy X ↔ Jev G, or octy G ↔ Jev X): ${severe.length}`);
p();
const tally = (list, key) => Object.entries(list.reduce((m, c) => ((m[key(c)] = (m[key(c)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
p("| Spec | severe disagreements |");
p("|---|---|");
for (const [k, n] of tally(severe, (c) => `${c.spec.cls} ${c.spec.spec}`)) p(`| ${k} | ${n} |`);
p();
p("| Question | severe disagreements |");
p("|---|---|");
for (const [k, n] of tally(severe, (c) => c.q)) p(`| ${k} | ${n} |`);
p();
p("<details><summary>All severe disagreements</summary>");
p();
p("| Spec | Question → option | octy | Jev |");
p("|---|---|---|---|");
for (const c of severe) p(`| ${c.spec.cls} ${c.spec.spec} | ${c.q} → ${c.option} | ${c.octy} | ${c.jev} |`);
p();
p("</details>");
p();
p("## 2. Faithfulness of the production prompt (chip alone, octy's ratings given)");
p();
p("| octy | cells | Jev excluded (P ≥ 0.5) | mean P(excluded) |");
p("|---|---|---|---|");
for (const o of LEVELS) {
  const list = informative.filter((c) => c.octy === o && c.pExcl !== undefined);
  const excl = list.filter((c) => c.pExcl >= 0.5).length;
  const mean = list.reduce((a, c) => a + c.pExcl, 0) / (list.length || 1);
  p(`| ${o} | ${list.length} | ${excl} (${pctOf(excl, list.length)}) | ${mean.toFixed(2)} |`);
}
const xs = informative.filter((c) => c.octy === "X");
const gs = informative.filter((c) => c.octy === "G");
const faithful = xs.filter((c) => c.pExcl >= 0.5).length + gs.filter((c) => c.pExcl < 0.5).length;
p();
p(`Faithfulness (octy X excluded, octy G kept): ${pctOf(faithful, xs.length + gs.length)}`);
const unfaithful = [...xs.filter((c) => c.pExcl < 0.5), ...gs.filter((c) => c.pExcl >= 0.5)];
p();
p("<details><summary>Unfaithful cells</summary>");
p();
p("| Spec | Question → option | octy | P(excluded) |");
p("|---|---|---|---|");
for (const c of unfaithful) p(`| ${c.spec.cls} ${c.spec.spec} | ${c.q} → ${c.option} | ${c.octy} | ${c.pExcl.toFixed(2)} |`);
p();
p("</details>");

console.log(lines.join("\n"));
