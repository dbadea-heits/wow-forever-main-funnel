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

// Identifies the inputs a trainer verdict was computed from; a verdict is current only while this is unchanged.
export const trainerKey = (answers, specs) =>
  JSON.stringify([Object.entries(answers).sort(([a], [b]) => (a < b ? -1 : 1)), specs.map((s) => s.id)]);

// One content type's verdict. Free text needs the trainer, whose verdict (over the preset answers too) wins while
// it's current; otherwise octy's ratings decide locally. Manual overrides beat both.
export function stepVerdict({ answers, specs, trainer, override }) {
  const local = localVerdict(answers, specs);
  const needsTrainer = hasText(answers);
  const useTrainer = needsTrainer && trainer?.key === trainerKey(answers, specs);
  const kept = new Set(
    specs
      .filter((s) => (s.id in override ? override[s.id] : useTrainer ? trainer.pExcl[s.id] < EXCLUDE_THRESHOLD : !local.excluded.has(s.id)))
      .map((s) => s.id),
  );
  return { kept, fit: local.fit, pExcl: useTrainer ? trainer.pExcl : null, trainerPending: needsTrainer && !useTrainer };
}

// A rated question can't change anything when each of its answers rates every remaining spec the same.
function distinguishes(q, pool, answers) {
  const options = optionsOf(q);
  if (!options.length) return true; // free text
  const vectors = options.map((o) => ratingsOf(q, o, answers));
  if (vectors.every((v) => !Object.keys(v).length)) return true; // unrated context question (e.g. "raid at 60?")
  return vectors.some((v) => new Set(pool.map((s) => v[s.id] ?? ".")).size > 1);
}

// How evenly the question's sharpest answer splits the pool: 0.5 = half the specs rated against it, 0 = none.
function splitScore(q, pool, answers) {
  if (!pool.length) return 0;
  return Math.max(0, ...optionsOf(q).map((o) => {
    const ratings = ratingsOf(q, o, answers);
    const against = pool.reduce((n, s) => n + (ratings[s.id] === "X" ? 1 : ratings[s.id] === "Y" ? 0.5 : 0), 0);
    return Math.min(against, pool.length - against) / pool.length;
  }));
}

// The questions worth asking for this pool, the ones that split it most evenly first. Questions that no longer apply
// (role not in the pool, unmet showIf, no effect) are dropped unless already answered, so they can still be cleared.
export function questionsToAsk(items, pool, answers) {
  const roles = new Set(pool.map((s) => s.role));
  const shown = items.filter((it) =>
    it.hint || isAnswered(answers[it.q]) || (
      (!it.when || roles.has(it.when)) &&
      (!it.showIf || answers[it.showIf.q]?.chosen.includes(it.showIf.option)) &&
      distinguishes(it.q, pool, answers)
    ));
  const score = (it) => (it.q && optionsOf(it.q).length ? splitScore(it.q, pool, answers) : -1);
  // Stable sort: free-text questions and hints (score -1) keep their order after the rated ones.
  return shown.map((it, i) => ({ it, i, s: score(it) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.it);
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
