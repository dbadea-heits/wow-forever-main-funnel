// Replays the video's four interviews (scripts/interviews.mjs) through the funnel rules and the production trainer
// prompt, and compares each step's survivors and the final pick with what octy concluded. Prints markdown; exits 1
// when a final pick disagrees with the video.
// Usage: node scripts/replay-interviews.mjs [--local] [--only=<who>]
//   --local  no trainer calls: steps with notes fall back to octy's ratings (marked "local")
import { SPECS, PLAYSTYLE, CONTENT_TYPES, DEFAULT_WEIGHTS } from "../public/data.js";
import {
  EXCLUDE_THRESHOLD, effectiveAnswers, isMulti, optionsOf, judgeAnswers, trainerKey, stepTrainerAnswers, stepVerdict, questionsToAsk,
  scoreSpecs, sameScore, isScored,
} from "../public/funnel.js";
import { buildRequest } from "../src/prompt.js";
import { INTERVIEWS } from "./interviews.mjs";

const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7);
const api = LOCAL ? null : await import("./jev-api.mjs");

const VIDEO = "https://www.youtube.com/watch?v=cJaE-VfseFE";
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s]));
const PLAYSTYLE_QS = new Set(PLAYSTYLE.map((it) => it.q));
const name = (id) => `${SPEC[id].cls} ${SPEC[id].spec}`;
const names = (ids) => ids.map(name).join(", ") || "—";
const clock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const watch = (t) => `[${clock(t)}](${VIDEO}&t=${t}s)`;
const without = (answers, q) => Object.fromEntries(Object.entries(answers).filter(([k]) => k !== q));

// Fail fast on answers the app couldn't produce: unknown question or option, several picks on a single-choice question.
function checkAnswers(where, answers, allowed) {
  for (const [q, a] of Object.entries(answers)) {
    if (!allowed.has(q)) throw new Error(`${where}: "${q}" is not asked here`);
    const options = optionsOf(q);
    for (const o of a.chosen) if (!options.includes(o)) throw new Error(`${where}: "${o}" is not an option of "${q}"`);
    if (a.chosen.length > 1 && !isMulti(q)) throw new Error(`${where}: "${q}" is single-choice`);
  }
}

async function trainerFor(contentType, answers, specs) {
  if (LOCAL || !Object.values(answers).some((a) => a.text.trim())) return null;
  const res = await api.jev(buildRequest(contentType, answers, specs));
  return { key: trainerKey(answers, specs), pExcl: Object.fromEntries(Object.entries(res).map(([id, a]) => [id, a.noul])) };
}

// The Worker's stand-in content type for the Playstyle page.
const PLAYSTYLE_STEP = { id: "playstyle", label: "General playstyle (every content type)", items: [] };

async function replay(iv) {
  const f = iv.fundamentals;
  const base = SPECS.filter((s) => s.range.some((r) => f.range.includes(r)) && f.dmg.includes(s.dmg) && f.role.includes(s.role) && !iv.lookBack.includes(s.id));
  const baseIds = new Set(base.map((s) => s.id));
  for (const id of [...iv.lookBack, ...Object.values(iv.video.steps).flatMap((st) => st.kept), ...iv.video.main, ...iv.video.alts]) {
    if (!SPEC[id]) throw new Error(`${iv.who}: unknown spec "${id}"`);
  }
  checkAnswers(`${iv.who} playstyle`, iv.playstyle, PLAYSTYLE_QS);

  // Questions the interviewee answered that the app would have hidden from them.
  const hidden = Object.keys(iv.playstyle)
    .filter((q) => !questionsToAsk(PLAYSTYLE, base, without(iv.playstyle, q)).some((it) => it.q === q))
    .map((q) => ({ step: "Playstyle", q }));
  // Playstyle notes are read once and the verdict reused by every content type, as on the site.
  const playstyleAnswers = effectiveAnswers(iv.playstyle, {}, {});
  const playstyleTrainer = await trainerFor(PLAYSTYLE_STEP, playstyleAnswers, base);
  const playstyleKept = judgeAnswers(playstyleAnswers, base, playstyleTrainer).kept;

  const steps = [];
  for (const [rank, c] of iv.content.entries()) {
    const ct = CONTENT_TYPES.find((x) => x.id === c.id);
    if (!ct) throw new Error(`${iv.who}: unknown content type "${c.id}"`);
    const weight = c.weight ?? DEFAULT_WEIGHTS[Math.min(rank, DEFAULT_WEIGHTS.length - 1)];
    if (c.skip || !isScored(ct)) {
      steps.push({ ct, weight, verdict: null });
      continue;
    }
    const s = iv.steps[c.id] ?? {};
    const own = s.answers ?? {};
    const overrides = s.overrides ?? {};
    checkAnswers(`${iv.who} ${c.id}`, own, new Set(ct.items.map((it) => it.q)));
    checkAnswers(`${iv.who} ${c.id} overrides`, overrides, PLAYSTYLE_QS);

    // Same pool the step page judges its questions against: after the Playstyle answers.
    const { sharesPlaystyle, answers: trainerAnswers } = stepTrainerAnswers(iv.playstyle, overrides, own);
    const keptBefore = sharesPlaystyle ? playstyleKept : judgeAnswers(effectiveAnswers(iv.playstyle, overrides, {}), base, null).kept;
    const inPlay = base.filter((x) => keptBefore.has(x.id));
    const answers = effectiveAnswers(iv.playstyle, overrides, own);
    for (const q of Object.keys(own)) {
      if (!questionsToAsk(ct.items, inPlay, without(answers, q)).some((it) => it.q === q)) hidden.push({ step: ct.label, q });
    }

    const trainer = await trainerFor(ct, trainerAnswers, base);
    const verdict = stepVerdict({
      playstyle: iv.playstyle, playstyleTrainer, overrides, own, specs: base, trainer, override: s.override ?? {}, favors: ct.favors,
    });
    steps.push({ ct, weight, verdict, video: iv.video.steps[c.id] });
  }

  const rows = scoreSpecs(steps.map((st) => ({ id: st.ct.id, weight: st.weight, verdict: st.verdict })), base);
  const scored = rows.filter((r) => r.points > 0);
  const top = scored.filter((r) => sameScore(r, scored[0])).map((r) => r.spec.id);
  const main = iv.video.main;
  const result = top.length && top.every((id) => main.includes(id)) ? "match" : top.some((id) => main.includes(id)) ? "tie" : "miss";
  return { iv, base, baseIds, steps, rows, top, result, hidden };
}

const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const MARK = { match: "✓ match", tie: "~ tied (tie-breaker can reach it)", miss: "✗ miss" };

const runs = [];
for (const iv of INTERVIEWS.filter((x) => !ONLY || x.who === ONLY)) runs.push(await replay(iv));

const out = [];
const p = (s = "") => out.push(s);
p("# Video interviews replayed through the funnel");
p();
p(LOCAL ? "Mode: **local** (octy's ratings only; notes not read)." : `Mode: **trainer** (${api.usage.calls} calls, ${api.usage.tokens.toLocaleString()} input tokens ≈ $${api.costOf(api.usage.tokens).toFixed(3)}).`);
p();
p("| Interview | Video main | App top | Result | Step cells agreeing |");
p("|---|---|---|---|---|");
let cellsAgree = 0;
let cellsTotal = 0;
for (const r of runs) {
  let agree = 0;
  let total = 0;
  for (const st of r.steps.filter((x) => x.verdict && x.video)) {
    for (const id of r.baseIds) {
      total++;
      if (st.verdict.kept.has(id) === st.video.kept.includes(id)) agree++;
    }
  }
  cellsAgree += agree;
  cellsTotal += total;
  p(`| ${r.iv.who} | ${names(r.iv.video.main)} | ${names(r.top)} | ${MARK[r.result]} | ${agree}/${total} (${pct(agree / total)}) |`);
}
p();
p(`Overall: ${runs.filter((r) => r.result === "match").length}/${runs.length} mains match, ${runs.filter((r) => r.result === "tie").length} tied; ${pct(cellsAgree / cellsTotal)} of step verdicts agree with the video.`);

for (const r of runs) {
  p();
  p(`## ${r.iv.who} — ${MARK[r.result]} (video result at ${watch(r.iv.video.at)})`);
  p();
  p(`Pool after fundamentals and look back: ${r.base.length} specs.`);
  p();
  p("| Content | Weight | Decided by | App kept | Cut by app, kept in video | Kept by app, cut in video |");
  p("|---|---|---|---|---|---|");
  for (const st of r.steps) {
    if (!st.verdict) {
      p(`| ${st.ct.label} | ${st.weight} | skipped | — | — | — |`);
      continue;
    }
    const kept = [...st.verdict.kept];
    const by = st.verdict.pExcl ? "trainer" : st.verdict.trainerPending ? "local (notes unread)" : "octy's ratings";
    const p100 = (id) => (st.verdict.pExcl ? ` (${pct(st.verdict.pExcl[id])})` : "");
    if (!st.video) {
      p(`| ${st.ct.label} | ${st.weight} | ${by} | ${names(kept)} | not in video | not in video |`);
      continue;
    }
    const missing = st.video.kept.filter((id) => r.baseIds.has(id) && !st.verdict.kept.has(id));
    const extra = kept.filter((id) => !st.video.kept.includes(id));
    p(`| ${st.ct.label} ${watch(st.video.at)} | ${st.weight} | ${by} | ${kept.length} | ${missing.map((id) => name(id) + p100(id)).join(", ") || "—"} | ${extra.map((id) => name(id) + p100(id)).join(", ") || "—"} |`);
  }
  p();
  if (r.hidden.length) {
    p("Answered in the video but hidden by the app:");
    for (const h of r.hidden) p(`- ${h.step}: ${h.q}`);
    p();
  }
  const expected = new Set([...r.iv.video.main, ...r.iv.video.alts]);
  p("| # | Spec | Points | Fit | Video |");
  p("|---|---|---|---|---|");
  r.rows.filter((row) => row.points > 0).slice(0, 8).forEach((row, i) => {
    const tag = r.iv.video.main.includes(row.spec.id) ? "main" : expected.has(row.spec.id) ? "alt" : "";
    p(`| ${i + 1} | ${name(row.spec.id)} | ${row.points} | ${pct(row.fit)} | ${tag} |`);
  });
  const lost = [...expected].filter((id) => !r.rows.slice(0, 8).some((row) => row.spec.id === id && row.points > 0));
  if (lost.length) p(`\nVideo picks outside the app's top 8: ${names(lost)}.`);
}
p();
p(`Trainer threshold: P(excluded) ≥ ${EXCLUDE_THRESHOLD}.`);

console.log(out.join("\n"));
process.exitCode = runs.some((r) => r.result === "miss") ? 1 : 0;
