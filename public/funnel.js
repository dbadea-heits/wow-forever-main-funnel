// Funnel rules, independent of the UI: which questions to ask, what octy's ratings make of the answers, and scoring.
// An answer is {chosen: string[], text: string, dealbreaker: boolean}; answer sets are {question: answer}.
import { TEXTURE_OPTIONS, MULTI_CHOICE, ratingsOf } from "./ratings.js";

export const EXCLUDE_THRESHOLD = 0.5; // the trainer's P(excluded) at which a spec is turned away

export const emptyAnswer = () => ({ chosen: [], text: "", dealbreaker: false });
export const isAnswered = (a) => !!a && (a.chosen.length > 0 || a.text.trim() !== "");
export const isMulti = (q) => MULTI_CHOICE.has(q);
export const optionsOf = (q) => Object.keys(TEXTURE_OPTIONS[q] ?? {});

// Playstyle answers apply to every content type; a step's override replaces one (even with "no answer"),
// and the step's own questions come on top. Only answered questions are kept.
export function effectiveAnswers(playstyle, overrides, own) {
  return Object.fromEntries(Object.entries({ ...playstyle, ...overrides, ...own }).filter(([, a]) => isAnswered(a)));
}

const RANK = { X: 0, Y: 1, G: 2 };
// octy's rating of each spec for one answer. With several options picked ("Shadow or Holy"), a spec counts as
// the best match among them.
export function answerRatings(q, answer, answers) {
  const best = {};
  for (const option of answer.chosen) {
    for (const [id, r] of Object.entries(ratingsOf(q, option, answers))) {
      if (best[id] === undefined || RANK[r] > RANK[best[id]]) best[id] = r;
    }
  }
  return best;
}

const FIT = { G: 1, Y: 0.5, X: 0 };
// Dealbreaker answers exclude the specs octy rates ✗. Every answered preset (dealbreaker or not) adds to the spec's
// fit, the mean of G = 1, Y = ½, ✗ = 0 over the answers that rate it; null when none does.
export function localVerdict(answers, specs) {
  const excluded = new Set();
  const sum = {};
  const count = {};
  for (const [q, a] of Object.entries(answers)) {
    if (!a.chosen.length) continue;
    const ratings = answerRatings(q, a, answers);
    for (const s of specs) {
      const r = ratings[s.id];
      if (!r) continue;
      sum[s.id] = (sum[s.id] ?? 0) + FIT[r];
      count[s.id] = (count[s.id] ?? 0) + 1;
      if (a.dealbreaker && r === "X") excluded.add(s.id);
    }
  }
  return { excluded, fit: Object.fromEntries(specs.map((s) => [s.id, count[s.id] ? sum[s.id] / count[s.id] : null])) };
}

const hasText = (answers) => Object.values(answers).some((a) => a.text.trim());

const sameAnswer = (a, b) =>
  a.dealbreaker === b.dealbreaker && a.text.trim() === b.text.trim() && a.chosen.length === b.chosen.length && a.chosen.every((o) => b.chosen.includes(o));

// Identifies the inputs a trainer verdict was computed from; a verdict is current only while this is unchanged.
export const trainerKey = (answers, specs) =>
  JSON.stringify([Object.entries(answers).sort(([a], [b]) => (a < b ? -1 : 1)), specs.map((s) => s.id)]);

// One set of answers judged: octy's ratings locally, the trainer's verdict on top while it's current (only free text
// needs it). Dealbreakers are absolute: what they rule out stays out whatever the trainer says.
export function judgeAnswers(answers, specs, trainer) {
  const local = localVerdict(answers, specs);
  const needsTrainer = hasText(answers);
  const useTrainer = needsTrainer && trainer?.key === trainerKey(answers, specs);
  const kept = new Set(
    specs.filter((s) => !local.excluded.has(s.id) && (!useTrainer || trainer.pExcl[s.id] < EXCLUDE_THRESHOLD)).map((s) => s.id),
  );
  return { kept, fit: local.fit, pExcl: useTrainer ? trainer.pExcl : null, trainerPending: needsTrainer && !useTrainer };
}

// What a content type's own trainer call reads. Normally just the step's answers: the Playstyle answers are judged
// once, on the Playstyle page, and that verdict is reused. A step that changes a Playstyle answer is judged on its
// full set of answers instead, since the shared verdict no longer describes it.
export function stepTrainerAnswers(playstyle, overrides, own) {
  const changed = Object.fromEntries(Object.entries(overrides).filter(([q, a]) => !sameAnswer(a, playstyle[q] ?? emptyAnswer())));
  return Object.keys(changed).length
    ? { sharesPlaystyle: false, answers: effectiveAnswers(playstyle, changed, own) }
    : { sharesPlaystyle: true, answers: effectiveAnswers({}, {}, own) };
}

// A content type with nothing to ask and no favored classes would hand every spec full points, so it isn't scored.
export const isScored = (ct) => ct.items.length > 0 || !!ct.favors;

// One content type's verdict: the shared Playstyle verdict (unless the step changes a Playstyle answer) and the step's
// own answers, then the content type's favored classes (octy's tip), then the player's manual overrides.
// trainerPending: the step's own notes aren't read yet (unread Playstyle notes are the Playstyle page's to report).
export function stepVerdict({ playstyle, playstyleTrainer, overrides, own, specs, trainer, override, favors }) {
  const { sharesPlaystyle, answers } = stepTrainerAnswers(playstyle, overrides, own);
  const step = judgeAnswers(answers, specs, trainer);
  const shared = sharesPlaystyle ? judgeAnswers(effectiveAnswers(playstyle, {}, {}), specs, playstyleTrainer) : null;
  const pExcl = shared?.pExcl || step.pExcl
    ? Object.fromEntries(specs.map((s) => [s.id, Math.max(shared?.pExcl?.[s.id] ?? 0, step.pExcl?.[s.id] ?? 0)]))
    : null;
  const kept = new Set(
    specs
      .filter((s) => (s.id in override ? override[s.id] : step.kept.has(s.id) && (!shared || shared.kept.has(s.id)) && (!favors || favors.includes(s.cls))))
      .map((s) => s.id),
  );
  const fit = localVerdict(effectiveAnswers(playstyle, overrides, own), specs).fit;
  return { kept, fit, pExcl, trainerPending: step.trainerPending };
}

// A rated question can't change anything when each of its answers rates every remaining spec the same.
function distinguishes(q, pool, answers) {
  const options = optionsOf(q);
  if (!options.length) return true; // free text
  const vectors = options.map((o) => ratingsOf(q, o, answers));
  if (vectors.every((v) => !Object.keys(v).length)) return true; // unrated branch question (e.g. "Will your RP character…?")
  return vectors.some((v) => new Set(pool.map((s) => v[s.id] ?? ".")).size > 1);
}

// How evenly the question's sharpest answer splits the pool: 0.5 = half the specs rated against it, 0 = none.
// A "narrow match" counts as half against unless `xOnly`, which counts only the ✗ ratings an answer can drop.
function splitScore(q, pool, answers, xOnly = false) {
  if (!pool.length) return 0;
  return Math.max(0, ...optionsOf(q).map((o) => {
    const ratings = ratingsOf(q, o, answers);
    const against = pool.reduce((n, s) => n + (ratings[s.id] === "X" ? 1 : ratings[s.id] === "Y" && !xOnly ? 0.5 : 0), 0);
    return Math.min(against, pool.length - against) / pool.length;
  }));
}

// The questions worth asking for this pool, the ones that split it most evenly first. Questions that no longer apply
// (role not in the pool, unmet showIf, no effect) are dropped unless already answered, so they can still be cleared.
export function questionsToAsk(items, pool, answers) {
  const roles = new Set(pool.map((s) => s.role));
  const met = (it) => !it.showIf || answers[it.showIf.q]?.chosen.includes(it.showIf.option);
  const shown = items.filter((it) =>
    it.hint ? met(it) : isAnswered(answers[it.q]) || ((!it.when || roles.has(it.when)) && met(it) && distinguishes(it.q, pool, answers)));
  const score = (it) => (it.q && optionsOf(it.q).length ? splitScore(it.q, pool, answers) : -1);
  // Stable sort: free-text questions and hints (score -1) keep their order after the rated ones.
  return shown.map((it, i) => ({ it, i, s: score(it) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.it);
}

// The unanswered preset question that best splits specs tied for main, octy's "look back" when no one leads.
// Questions with an answer octy rates ✗ for some of the tied specs come first, since only a drop changes points;
// the rest can still separate them by fit. sources: [{scope, items, answers}] in priority order (an equal split goes
// to the earlier source, so Playstyle, which applies everywhere, comes first). skip: scope|question keys passed on.
// Returns {scope, q} or null when no question left can tell the tied specs apart.
export function nextQuestion(sources, tied, skip = new Set()) {
  let best = null;
  const better = (a, b) => a.x > b.x || (a.x === b.x && a.s > b.s);
  for (const { scope, items, answers } of sources) {
    for (const it of questionsToAsk(items, tied, answers)) {
      if (!it.q || !optionsOf(it.q).length || isAnswered(answers[it.q]) || skip.has(`${scope}|${it.q}`)) continue;
      const cand = { scope, q: it.q, x: splitScore(it.q, tied, answers, true), s: splitScore(it.q, tied, answers) };
      if (cand.s > 0 && (!best || better(cand, best))) best = cand;
    }
  }
  return best && { scope: best.scope, q: best.q };
}

// steps: [{id, weight, verdict | null}] (null = not evaluated or skipped). Points follow octy's method
// (weight × survived); fit (weight-averaged) breaks ties.
export function scoreSpecs(steps, specs) {
  return specs
    .map((s) => {
      const cells = steps.map(({ weight, verdict }) => {
        const ok = !!verdict && verdict.kept.has(s.id);
        return { ok, fit: verdict?.fit[s.id] ?? null, p: verdict?.pExcl?.[s.id], pts: ok ? weight : 0 };
      });
      const rated = steps.map((st, i) => ({ w: st.weight, f: cells[i].fit })).filter((x) => x.f !== null && x.w > 0);
      const w = rated.reduce((a, x) => a + x.w, 0);
      return {
        spec: s,
        cells,
        points: cells.reduce((a, c) => a + c.pts, 0),
        fit: w ? rated.reduce((a, x) => a + x.w * x.f, 0) / w : null,
      };
    })
    .sort((a, b) => b.points - a.points || (b.fit ?? -1) - (a.fit ?? -1));
}

// Rows tied with the top on points and fit (to the displayed percent).
export const sameScore = (a, b) => a.points === b.points && Math.round((a.fit ?? 0) * 100) === Math.round((b.fit ?? 0) * 100);

// Knockout over the tied specs using the player's "A or B?" picks ({"a|b": winner}, ids sorted). Returns the
// champion so far and the next undecided pair, or null when the knockout is complete.
export function knockout(ids, picks) {
  let champion = ids[0];
  for (const challenger of ids.slice(1)) {
    const pair = [champion, challenger].sort();
    const winner = picks[pair.join("|")];
    if (!winner) return { champion: null, next: pair };
    champion = winner;
  }
  return { champion, next: null };
}
