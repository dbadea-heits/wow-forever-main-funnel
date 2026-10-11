import { VIDEO_URL, VIDEO_TITLE, CHANNEL, EXAMPLES, CLASSES, SPECS, FUNDAMENTALS, CONTENT_TYPES, PLAYSTYLE, DEFAULT_WEIGHTS } from "./data.js";
import { judge, cancelHumanCheck } from "./jev.js";
import { saveLocal, loadLocal, clearLocal, encodeShare, decodeShare } from "./persist.js";
import { TEXTURE_OPTIONS, ratingsOf } from "./ratings.js";
import {
  emptyAnswer, drops, isAnswered, isMulti, optionsOf, effectiveAnswers, answerRatings, judgeAnswers, stepVerdict, stepTrainerAnswers,
  isScored, trainerKey, questionsToAsk, nextQuestion, scoreSpecs, showPoints, sameScore, knockout,
} from "./funnel.js";

const CT = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c]));
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s]));
const PLAYSTYLE_QS = new Set(PLAYSTYLE.map((it) => it.q));
const MAX_ANSWER_CHARS = 500; // the Worker's limit per answer

const state = {
  step: "intro",
  sel: Object.fromEntries(FUNDAMENTALS.map((f) => [f.key, new Set(f.options)])),
  picked: [], // [{id, weight, custom}] in rank order; custom = weight typed by the user, so it no longer follows the rank
  manualExcl: new Set(),
  playstyle: {}, // question -> answer ({chosen, text, dealbreaker, spare}); applies to every content type
  playstyleTrainer: null, // {key, pExcl}: the trainer's reading of the Playstyle notes, reused by every content type
  // ctId -> {answers, overrides (Playstyle answers replaced for this content type), visited, skipped,
  //          trainer: {key, pExcl} | null, override: {specId: kept}}
  texture: {},
  tiebreak: {}, // "specA|specB" (sorted) -> the spec the player would rather play
  keptPreference: new Set(), // "scope|question|options" the player chose to keep as a preference instead of dropping
};

// Per-page UI that isn't saved: trainer call progress and errors, the page's trainer call (`ask`), the question order
// of the current visit, the "notes unread" warning on Next, and the results tie-breaker panel.
const ui = {};
const uiOf = (stepId) =>
  (ui[stepId] ??= { loading: false, phase: null, error: null, ask: null, order: null, leaving: false, choosing: false, skippedQuestions: new Set() });

// ---------- derived state ----------

const pool = () =>
  SPECS.filter(
    (s) => s.range.some((r) => state.sel.range.has(r)) && state.sel.dmg.has(s.dmg) && state.sel.role.has(s.role),
  );
const basePool = () => pool().filter((s) => !state.manualExcl.has(s.id));

function textureOf(ctId) {
  return (state.texture[ctId] ??= { answers: {}, overrides: {}, visited: false, skipped: false, trainer: null, override: {} });
}

const answersFor = (ctId) => {
  const t = textureOf(ctId);
  return effectiveAnswers(state.playstyle, t.overrides, t.answers);
};
const playstyleVerdict = () => judgeAnswers(effectiveAnswers(state.playstyle, {}, {}), basePool(), state.playstyleTrainer);
const verdictOf = (ctId) => {
  const t = textureOf(ctId);
  return stepVerdict({
    playstyle: state.playstyle, playstyleTrainer: state.playstyleTrainer, overrides: t.overrides, own: t.answers,
    specs: basePool(), trainer: t.trainer, override: t.override, favors: CT[ctId].favors,
  });
};

// Where a question is answered: "playstyle", "ct:<id>" (the content type's own questions) or "ct:<id>:override"
// (a Playstyle answer changed for that content type). Gives questionField the specs in play there, the answers
// derived ratings depend on, and where a drop applies.
function fieldContext(scope) {
  if (scope === "playstyle") return { scope, pool: basePool(), answers: state.playstyle, where: "for every content type" };
  const ctId = scope.split(":")[1];
  const t = textureOf(ctId);
  const specs = basePool();
  // Questions are judged against the specs still in play after the Playstyle answers; a changed Playstyle answer
  // against the other Playstyle answers only, so what it drops itself stays in its prompt.
  const { sharesPlaystyle } = stepTrainerAnswers(state.playstyle, t.overrides, t.answers);
  const kept = scope.endsWith(":override")
    ? judgeAnswers(effectiveAnswers(Object.fromEntries(Object.entries(state.playstyle).filter(([q]) => !(q in t.overrides))), {}, {}), specs, null).kept
    : sharesPlaystyle ? playstyleVerdict().kept : judgeAnswers(effectiveAnswers(state.playstyle, t.overrides, {}), specs, null).kept;
  return { scope, pool: specs.filter((s) => kept.has(s.id)), answers: answersFor(ctId), where: `for ${CT[ctId].label}` };
}

// Whether the page has notes the trainer hasn't read (they don't count until it has).
function notesUnread(step) {
  if (step.id === "playstyle") return playstyleVerdict().trainerPending;
  return !!step.ct && !textureOf(step.ct).skipped && isScored(CT[step.ct]) && verdictOf(step.ct).trainerPending;
}

// pending: not opened yet · stale: written notes the trainer hasn't read · evaluated: everything decided.
function statusOf(ctId) {
  const t = textureOf(ctId);
  if (t.skipped) return "skipped";
  if (!isScored(CT[ctId])) return "unscored";
  if (!t.visited) return "pending";
  return verdictOf(ctId).trainerPending ? "stale" : "evaluated";
}

const STATUS_LABEL = {
  pending: "not visited yet",
  evaluated: "decided",
  stale: "notes not read by the trainer yet",
  skipped: "skipped",
  unscored: "not scored (nothing to ask)",
};

// The status dot of a nav step: content types always have one, Playstyle only while its notes are unread.
function navStatus(s) {
  if (s.ct) return statusOf(s.ct);
  return s.id === "playstyle" && playstyleVerdict().trainerPending ? "stale" : null;
}

// ---------- step list & gating ----------

function steps() {
  return [
    { id: "intro", label: "Introduction", icon: "inv_misc_book_09" },
    { id: "fundamentals", label: "Fundamentals", icon: "inv_sword_04" },
    { id: "content", label: "Content types", icon: "inv_misc_note_06" },
    { id: "lookback", label: "Look back", icon: "ability_stealth" },
    { id: "playstyle", label: "Playstyle", icon: "spell_holy_magicalsentry" },
    ...state.picked.map((p, i) => ({ id: `ct:${p.id}`, label: `${i + 1}. ${CT[p.id].label}`, icon: CT[p.id].icon, ct: p.id })),
    { id: "review", label: "Review", icon: "spell_holy_auraoflight" },
    { id: "results", label: "Results", icon: "inv_misc_coin_01" },
  ];
}

// Index of the first step whose Next is blocked; steps after it are unreachable.
function blockedAt() {
  const ids = steps().map((s) => s.id);
  if (pool().length === 0) return ids.indexOf("fundamentals");
  if (state.picked.length === 0) return ids.indexOf("content");
  return ids.length;
}

// ---------- DOM helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k in node && k !== "list") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c);
  return node;
}

// Eager: icons are tiny and cached, and lazy loading made them flash blank on every re-render.
const icon = (name, cls = "") => el("img", { class: `icon ${cls}`, src: `assets/icons/${name}.jpg`, alt: "" });

const watch = (t, text = "Watch") =>
  el("a", { class: "ts", href: `${VIDEO_URL}&t=${t}s`, target: "_blank", rel: "noopener" }, "▶ ", text);

const specName = (s) => `${s.cls} ${s.spec}`;
const classColor = (s) => CLASSES[s.cls].color;
const specLabel = (s) => el("span", { class: "spec-name", style: `color:${classColor(s)}` }, specName(s));
const pct = (p) => (p === undefined || p === null ? "—" : `${Math.round(p * 100)}%`);

// ---------- spec tooltip (WoW-style, follows the cursor) ----------

const tip = el("div", { id: "tip", hidden: true });
document.body.append(tip);

document.addEventListener("mouseover", (e) => {
  const host = e.target.closest("[data-spec]");
  if (!host) return void (tip.hidden = true);
  const s = SPEC[host.dataset.spec];
  tip.replaceChildren(...[
    el("div", { class: "tip-title", style: `color:${classColor(s)}` }, specName(s)),
    el("div", {}, s.role),
    el("div", { class: "tip-row" }, el("span", {}, s.range.join(" / ")), el("span", {}, s.dmg)),
    el("div", { class: "tip-traits" }, s.traits),
    s.unproven ? el("div", { class: "tip-warn" }, `Unproven: ${s.unproven}`) : null,
    host.dataset.notes ? el("div", { class: "tip-notes" }, host.dataset.notes) : null,
  ].filter(Boolean));
  tip.hidden = false;
});
document.addEventListener("mousemove", (e) => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 16, window.innerWidth - tip.offsetWidth - 8);
  const y = Math.min(e.clientY + 16, window.innerHeight - tip.offsetHeight - 8);
  tip.style.transform = `translate(${x}px, ${y}px)`;
});

// ---------- rendering ----------

const app = document.getElementById("app");
const nav = document.getElementById("nav");

function render() {
  tip.hidden = true;
  const list = steps();
  if (!list.some((s) => s.id === state.step)) state.step = "content";
  const idx = list.findIndex((s) => s.id === state.step);
  const block = blockedAt();
  const cur = list[idx];

  nav.replaceChildren(...[
    el("div", { class: "nav-title" }, "The Funnel"),
    ...list.map((s, i) =>
      el(
        "button",
        {
          class: `nav-item${s.id === state.step ? " active" : ""}`,
          disabled: i > block,
          title: navStatus(s) ? `${s.label}: ${STATUS_LABEL[navStatus(s)]}` : null,
          onclick: () => go(s.id),
        },
        icon(s.icon, "sm"),
        el("span", { class: "grow" }, s.label),
        navStatus(s) ? el("span", { class: `dot ${navStatus(s)}` }) : null,
      ),
    ),
    state.picked.length
      ? el("div", { class: "nav-legend" },
          Object.entries(STATUS_LABEL)
            .filter(([status]) => status !== "unscored" || state.picked.some((p) => statusOf(p.id) === "unscored"))
            .map(([status, label]) => el("div", {}, el("span", { class: `dot ${status}` }), label)))
      : null,
  ].filter(Boolean));

  // On the mobile step strip, keep the current step in view.
  nav.querySelector(".nav-item.active").scrollIntoView({ block: "nearest", inline: "center" });

  const body = cur.ct ? renderTexture(cur.ct) : VIEWS[cur.id]();
  // Next on a page whose notes aren't read yet warns once: they don't count until the trainer reads them.
  const u = uiOf(cur.id);
  const unread = !u.loading && notesUnread(cur);
  const nextStep = list[idx + 1];
  const leaveWarning = u.leaving && unread
    ? el("div", { class: "warn leave-warn" },
        "Your notes on this page aren't read by the trainer yet, so they don't count. ",
        el("span", { class: "step-links" },
          u.ask ? el("button", { class: "mini primary", onclick: () => { u.leaving = false; u.ask(); } }, "Have the trainer read them") : null,
          el("button", { class: "mini", onclick: () => go(nextStep.id) }, "Continue anyway")))
    : null;
  const footer = el(
    "div",
    { class: "footer" },
    el("button", { disabled: idx === 0, onclick: () => go(list[idx - 1].id) }, "← Back"),
    nextStep
      ? el("button", {
          class: "primary",
          disabled: idx >= block,
          onclick: () => {
            if (unread && !u.leaving) {
              u.leaving = true;
              render();
            } else go(nextStep.id);
          },
        }, "Next →")
      : null,
  );
  const credit = el(
    "p",
    { class: "credit" },
    "Funnel method, questions and example interviews by ",
    el("a", { href: CHANNEL.url, target: "_blank", rel: "noopener" }, CHANNEL.name),
    " — from the video ",
    el("a", { href: VIDEO_URL, target: "_blank", rel: "noopener" }, `“${VIDEO_TITLE}”`),
    ". Go give it a watch.",
  );
  app.replaceChildren(el("section", { class: "step" }, body, leaveWarning, footer, credit));
  save();
}

// A content type counts as visited once the player leaves its page, so opening it isn't mistaken for deciding it.
// Every visit ranks the page's questions afresh.
function go(id) {
  cancelHumanCheck();
  const leaving = steps().find((s) => s.id === state.step);
  if (leaving?.ct) textureOf(leaving.ct).visited = true;
  uiOf(state.step).leaving = false;
  uiOf(id).order = null;
  state.step = id;
  render();
  window.scrollTo(0, 0);
}

// The page's questions in the order of this visit, so answering one doesn't reshuffle the list. Questions that show
// up mid-visit go right after the question they depend on (or last).
function pageOrder(stepId, shown) {
  const u = uiOf(stepId);
  const id = (it) => it.q ?? it.hint;
  u.order ??= shown.map(id);
  const rank = new Map(u.order.map((k, i) => [k, i]));
  const out = shown.filter((it) => rank.has(id(it))).sort((a, b) => rank.get(id(a)) - rank.get(id(b)));
  for (const it of shown.filter((x) => !rank.has(id(x)))) {
    const parent = it.showIf ? out.findIndex((x) => x.q === it.showIf.q) : -1;
    if (parent < 0) {
      out.push(it);
      continue;
    }
    let at = parent + 1;
    while (at < out.length && out[at].showIf?.q === it.showIf.q) at++;
    out.splice(at, 0, it);
  }
  return out;
}

function startOver() {
  if (!confirm("Start over? This clears all your answers and trainer results.")) return;
  clearLocal();
  location.replace(location.pathname);
}

// ---------- saving & sharing ----------

function snapshot() {
  return {
    v: 2,
    step: state.step,
    sel: Object.fromEntries(Object.entries(state.sel).map(([k, set]) => [k, [...set]])),
    picked: state.picked,
    manualExcl: [...state.manualExcl],
    playstyle: state.playstyle,
    playstyleTrainer: state.playstyleTrainer,
    texture: Object.fromEntries(
      Object.entries(state.texture).map(([id, t]) => [id, {
        answers: t.answers, overrides: t.overrides, visited: t.visited, skipped: t.skipped, trainer: t.trainer, override: t.override,
      }]),
    ),
    tiebreak: state.tiebreak,
    keptPreference: [...state.keptPreference],
  };
}

const save = () => saveLocal(snapshot());

// Rebuilds state from a saved or shared snapshot. Share links are untrusted input, so every field is checked
// against the known content types, questions, preset answers and specs; anything unknown is dropped.
function restore(snap) {
  if (snap?.v !== 2) return;
  const list = (x) => (Array.isArray(x) ? x : []);
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const specMap = (x, valid) => Object.fromEntries(Object.entries(obj(x)).filter(([id, v]) => SPEC[id] && valid(v)));
  const answer = (q, a) => {
    const options = TEXTURE_OPTIONS[q] ?? {};
    const chosen = [...new Set(list(a?.chosen).filter((o) => typeof o === "string" && Object.hasOwn(options, o)))];
    return {
      chosen: isMulti(q) ? chosen : chosen.slice(0, 1),
      text: typeof a?.text === "string" ? a.text.slice(0, MAX_ANSWER_CHARS) : "",
      dealbreaker: a?.dealbreaker === true,
      spare: [...new Set(list(a?.spare).filter((id) => SPEC[id]))],
    };
  };
  const answerMap = (x, questions) => Object.fromEntries(Object.entries(obj(x)).filter(([q]) => questions.has(q)).map(([q, a]) => [q, answer(q, a)]));
  const trainerOf = (x) => {
    const tr = obj(x);
    return typeof tr.key === "string" ? { key: tr.key, pExcl: specMap(tr.pExcl, (p) => Number.isFinite(p) && p >= 0 && p <= 1) } : null;
  };

  for (const f of FUNDAMENTALS) {
    if (Array.isArray(snap.sel?.[f.key])) state.sel[f.key] = new Set(snap.sel[f.key].filter((o) => f.options.includes(o)));
  }
  const seen = new Set();
  state.picked = list(snap.picked)
    .filter((p) => CT[p?.id] && !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, weight: Number.isFinite(p.weight) && p.weight >= 0 ? p.weight : 0, custom: p.custom === true }));
  state.manualExcl = new Set(list(snap.manualExcl).filter((id) => SPEC[id]));
  state.playstyle = answerMap(snap.playstyle, PLAYSTYLE_QS);
  state.playstyleTrainer = trainerOf(snap.playstyleTrainer);
  for (const [id, saved] of Object.entries(obj(snap.texture))) {
    if (!CT[id]) continue;
    const t = textureOf(id);
    t.answers = answerMap(saved.answers, new Set(CT[id].items.map((it) => it.q).filter(Boolean)));
    t.overrides = answerMap(saved.overrides, PLAYSTYLE_QS);
    t.visited = saved.visited === true;
    t.skipped = saved.skipped === true;
    t.trainer = trainerOf(saved.trainer);
    t.override = specMap(saved.override, (v) => typeof v === "boolean");
  }
  state.tiebreak = Object.fromEntries(Object.entries(obj(snap.tiebreak)).filter(([pair, w]) => pair.split("|").includes(w) && SPEC[w]));
  state.keptPreference = new Set(list(snap.keptPreference).filter((k) => typeof k === "string" && k.length <= 1000));
  state.step = steps().some((s) => s.id === snap.step) ? snap.step : "intro";
}

async function shareLink() {
  return `${location.origin}${location.pathname}#s=${await encodeShare(snapshot())}`;
}

// ---------- shared pieces ----------

const header = (title, iconName, ...extra) =>
  el("header", { class: "step-head" }, iconName ? icon(iconName, "lg") : null, el("div", {}, el("h1", {}, title), extra));

function specTile(s, { off = false, onClick, note } = {}) {
  return el(
    onClick ? "button" : "div",
    { class: `spec-tile${off ? " off" : ""}`, dataset: { spec: s.id }, onclick: onClick },
    icon(s.icon),
    el("span", { class: "spec-text" }, specLabel(s), el("small", {}, s.role, note ? ` · ${note}` : "")),
  );
}

const fitNote = (fit) => (fit === null || fit === undefined ? null : `fit ${pct(fit)}`);

// One question with octy's preset answers (single or multi choice), octy's "drop these?" prompt and optional notes, or
// a free-text box when the question has no presets. `container[q]` holds the answer; `ctx.answers` gives derived
// ratings their context, `ctx.pool` the specs still in play, `ctx.scope` names where the answer lives (for
// remembering "keep as a preference") and `ctx.where` where a drop applies.
function questionField(container, q, ctx) {
  const a = container[q] ?? emptyAnswer();
  const commit = () => {
    container[q] = a;
    save();
  };
  const textarea = (placeholder) =>
    el("textarea", {
      rows: 2,
      maxLength: MAX_ANSWER_CHARS,
      value: a.text,
      placeholder,
      oninput: (e) => {
        a.text = e.target.value;
        commit();
      },
      onchange: render, // refreshes status and the trainer button once the player is done typing
    });
  const options = optionsOf(q);
  if (!options.length) return el("label", { class: "q" }, el("span", {}, q), textarea());

  const rated = options.some((o) => Object.keys(ratingsOf(q, o, ctx.answers)).length);
  const chips = options.map((opt) => {
    const on = a.chosen.includes(opt);
    const ratings = ratingsOf(q, opt, ctx.answers);
    const against = ctx.pool.filter((s) => ratings[s.id] === "X");
    // An answer octy rates ✗ for every spec still in play contradicts the earlier funnel steps.
    const contradicts = rated && ctx.pool.length > 0 && against.length === ctx.pool.length;
    return el("button", {
      class: `chip${on ? " on" : ""}`,
      "aria-pressed": String(on),
      disabled: contradicts && !on,
      title: contradicts
        ? "octy rates every spec left in your pool ✗ for this answer"
        : against.length ? `octy rates ✗: ${against.map(specName).join(", ")}` : null,
      onclick: () => {
        if (isMulti(q)) a.chosen = on ? a.chosen.filter((o) => o !== opt) : [...a.chosen, opt];
        else a.chosen = on ? [] : [opt];
        a.dealbreaker = false; // a new answer drops different specs, so ask again
        a.spare = [];
        commit();
        render();
        // Bring the drop prompt into view, clear of the sticky counter bar.
        app.querySelector(`.q[data-q="${CSS.escape(q)}"] .drop`)?.scrollIntoView({ block: "nearest" });
      },
    }, opt);
  });
  return el("div", { class: "q", dataset: { q } },
    el("span", {}, q, isMulti(q) ? el("small", { class: "multi" }, " · pick any") : null),
    el("div", { class: "chips" }, chips),
    a.chosen.length && rated ? dropPrompt(a, q, ctx, commit) : null,
    a.text
      ? textarea("Add detail (optional)")
      : el("button", {
          class: "add-detail",
          onclick: (e) => {
            const box = textarea("Add detail (optional)");
            e.currentTarget.replaceWith(box);
            box.focus();
          },
        }, "+ add detail"),
  );
}

// octy's move after an answer: name the specs it rules out and ask whether to drop them. Nothing is dropped
// without a click; "keep" is remembered for that exact answer, so the prompt doesn't nag. Each named spec is a
// toggle, so a drop can spare some of them (`a.spare`).
function dropPrompt(a, q, ctx, commit) {
  const ratings = answerRatings(q, a, ctx.answers);
  const against = ctx.pool.filter((s) => ratings[s.id] === "X");
  if (!against.length) return null;
  const key = `${ctx.scope}|${q}|${[...a.chosen].sort().join("+")}`;
  const set = (drop) => {
    a.dealbreaker = drop;
    drop ? state.keptPreference.delete(key) : state.keptPreference.add(key);
    commit();
    render();
  };
  const toggles = el("span", { class: "drop-specs" }, against.map((s) => {
    const spared = a.spare.includes(s.id);
    return el("button", {
      class: `drop-spec${spared ? " spared" : ""}`,
      "aria-pressed": String(!spared),
      title: spared ? "Kept — click to drop it too" : "Click to keep this one",
      onclick: () => {
        a.spare = spared ? a.spare.filter((id) => id !== s.id) : [...a.spare, s.id];
        commit();
        render();
      },
    }, specName(s));
  }));
  const dropping = against.filter((s) => !a.spare.includes(s.id)).length;
  if (a.dealbreaker) {
    return el("div", { class: "drop dropped" },
      el("span", {}, `Dropped ${ctx.where} (click one to keep it):`), toggles,
      el("button", { class: "link", onclick: () => set(false) }, "undo"));
  }
  if (state.keptPreference.has(key)) {
    return el("div", { class: "drop kept" }, "Kept as a preference — it only ranks specs. ",
      el("button", { class: "link", onclick: () => set(true) }, `Drop ${against.length === 1 ? "it" : "them"} instead`));
  }
  return el("div", { class: "drop ask" },
    el("span", {}, `octy would drop ${against.length === 1 ? "this" : "these"} ${ctx.where}${against.length > 1 ? " (click one to keep it)" : ""}:`),
    toggles,
    el("span", { class: "drop-actions" },
      el("button", { class: "mini primary", disabled: !dropping, onclick: () => set(true) }, dropping === against.length ? "Drop" : `Drop ${dropping}`),
      el("button", { class: "mini", onclick: () => set(false) }, "Keep — just a preference")),
  );
}

// Short names for questions whose preset answers don't make sense alone ("I hate it").
const TOPIC = {
  "How do you feel about Shapeshifting during battle?": "Shapeshifting",
  "How do you feel about pet-based classes?": "Pets",
  "Do you have any preference in terms of schools of magic?": "Magic school",
  "Are you ok if your class is heavily Cooldown reliant?": "Cooldowns",
  "What have you already leveled to 60 before?": "Already leveled",
  "What have you already leveled to 60 on HC before?": "Already leveled on HC",
};
const optionLabel = (q, option) => (TOPIC[q] ? `${TOPIC[q]}: ${option}` : option);
const answerLabel = (q, a) => a.chosen.map((o) => optionLabel(q, o)).join(" / ");

// octy's exclude (X) and narrow-match (Y) ratings of a spec across a set of answers, exclusions first.
function octyNotes(answers, s) {
  return Object.entries(answers)
    .flatMap(([q, a]) => {
      if (!a.chosen.length) return [];
      const r = answerRatings(q, a, answers)[s.id];
      return r === "X" || r === "Y" ? [{ r, dropped: r === "X" && drops(a, s.id), q, label: answerLabel(q, a) }] : [];
    })
    .sort((x, y) => (x.r === y.r ? 0 : x.r === "X" ? -1 : 1));
}

const notesText = (notes) =>
  notes.map((x) => `${x.r === "X" ? "✗ goes against" : "~ narrow match"}${x.dropped ? " (dropped)" : ""}: ${x.q} → ${x.label}`).join("\n");

function octyTally(notes) {
  if (!notes.length) return null;
  const SHOWN = 2;
  return el("span", { class: "octy-tally", title: notesText(notes) },
    notes.slice(0, SHOWN).map((x) => `${x.r === "X" ? "✗" : "~"} ${x.label}`).join(" · "),
    notes.length > SHOWN ? ` +${notes.length - SHOWN} more` : "");
}

const answerText = (a) =>
  [a.chosen.join(" / "), a.text.trim() && `“${a.text.trim()}”`].filter(Boolean).join(" + ") +
  (a.dealbreaker ? ` · drops octy's ✗ specs${a.spare.length ? ` except ${a.spare.map((id) => specName(SPEC[id])).join(", ")}` : ""}` : "");

// Asks the trainer about `answers` for one page (stepId: "playstyle" or "ct:<id>"); `keep(trainer)` stores the verdict.
async function askTrainer(stepId, contentType, answers, keep) {
  const u = uiOf(stepId);
  const specs = basePool();
  const here = () => state.step === stepId;
  u.error = null;
  u.loading = true;
  render();
  try {
    const pExcl = await judge(contentType, answers, specs.map((s) => s.id), (phase) => {
      u.phase = phase;
      if (here()) render();
    });
    keep({ key: trainerKey(answers, specs), pExcl });
  } catch (e) {
    if (!e.cancelled) u.error = e.message;
  } finally {
    u.loading = false;
    u.phase = null;
    if (here()) render();
    else save();
  }
}

// The trainer button for a page with notes, and the error of its last call. Keeps `ask` for the "notes unread" warning.
function trainerControls(stepId, { pending, ask }) {
  const u = uiOf(stepId);
  u.ask = ask;
  return {
    button: el("button", { class: "primary", disabled: u.loading || !pending, onclick: ask }, ASK_LABEL[u.loading ? u.phase ?? "checking" : pending ? "idle" : "done"]),
    error: u.error ? el("div", { class: "error" }, u.error, " ", el("button", { class: "mini", onclick: ask }, "Try again")) : null,
  };
}

const unprovenBadge = (s) => (s.unproven ? el("span", { class: "badge unproven", title: s.unproven }, "Unproven") : null);

// Why a spec scored as it did across the counted content types: answers octy rates it well on that set it apart from
// other specs, and answers that go against it.
function reasonsFor(spec, ctIds) {
  const seen = new Map();
  for (const id of ctIds) {
    const answers = answersFor(id);
    for (const [q, a] of Object.entries(answers)) {
      if (!a.chosen.length) continue;
      const ratings = answerRatings(q, a, answers);
      const r = ratings[spec.id];
      const label = answerLabel(q, a);
      if (!r || seen.has(label)) continue;
      if (r === "G" && !basePool().some((s) => ratings[s.id] === "X" || ratings[s.id] === "Y")) continue;
      seen.set(label, { r, q, label });
    }
  }
  const all = [...seen.values()];
  return { matched: all.filter((x) => x.r === "G"), against: all.filter((x) => x.r !== "G") };
}

function whyBox(spec, ctIds) {
  const { matched, against } = reasonsFor(spec, ctIds);
  const SHOWN = 3;
  const line = (cls, title, items, all) =>
    items.length
      ? el("div", { class: cls, title: all.map((x) => `${x.q} → ${x.label}`).join("\n") || null },
          el("strong", {}, title), items.slice(0, SHOWN).join(" · "), items.length > SHOWN ? ` +${items.length - SHOWN} more` : "")
      : null;
  const warnings = [...against.map((x) => (x.r === "X" ? x.label : `${x.label} (partly)`)), ...(spec.unproven ? ["brand-new, unproven spec"] : [])];
  return el("div", { class: "why" },
    line("why-good", "Matched: ", matched.map((x) => x.label), matched),
    line("why-bad", "Watch out: ", warnings, against));
}

// ---------- views ----------

const VIEWS = {
  intro: () => [
    el(
      "div",
      { class: "hero" },
      el("div", { class: "hero-kicker" }, "World of Warcraft: Forever"),
      el("h1", { class: "hero-title" }, "Find Your Forever Main"),
      el("p", { class: "hero-lead" }, "Instead of a tierlist, answer one definite question at a time and narrow the spec list until clear winners remain."),
      el("div", { class: "class-strip" }, Object.entries(CLASSES).map(([name, c]) => el("img", { class: "icon", src: `assets/icons/${c.icon}.jpg`, alt: name, title: name, style: `--cc:${c.color}` }))),
      el("div", { class: "hero-actions" },
        el("button", { class: "primary big", onclick: () => go("fundamentals") }, "Begin the funnel"),
        watch(63, "Watch octy's method"),
      ),
    ),
    el(
      "div",
      { class: "panel" },
      el("h2", {}, "The three rules"),
      el(
        "ol",
        { class: "rules" },
        el("li", {}, "Don't exclude anything unless you feel strongly."),
        el("li", {}, "Look back at earlier answers; later ones can clarify them."),
        el("li", {}, "In WoW Forever there is no wasted time: rejected picks become alts."),
      ),
      el("p", { class: "muted" }, "Method from octy's video ", el("a", { href: VIDEO_URL, target: "_blank", rel: "noopener" }, "Find Your WoW Forever Main in 15 Minutes"), ". Your answers use octy's own ratings of every spec: they rank the specs, octy offers to drop the ones an answer goes against, and the class trainer reads anything you write in your own words. Each content type pays the specs left standing its weight × how well they fit your answers."),
    ),
    el("h2", {}, "Examples from the video"),
    el("div", { class: "examples" }, EXAMPLES.map((e) =>
      el("div", { class: "panel example" },
        el("div", { class: "who" }, e.who),
        el("div", { class: "muted" }, e.blurb),
        el("div", { class: "example-links" }, watch(e.start, "Walkthrough"), watch(e.results, "Results")),
      ),
    )),
  ],

  fundamentals: () => {
    const p = pool();
    return [
      header("Fundamentals", "inv_sword_04", el("p", { class: "muted" }, "Untick only what you feel strongly about.")),
      FUNDAMENTALS.map((f) =>
        el(
          "div",
          { class: "panel" },
          el("h3", {}, f.title, " ", watch(f.t)),
          el("p", { class: "muted" }, f.guide),
          el("div", { class: "options" }, f.options.map((o) =>
            el("label", { class: `option${state.sel[f.key].has(o) ? " on" : ""}` },
              el("input", {
                type: "checkbox",
                checked: state.sel[f.key].has(o),
                onchange: (e) => {
                  e.target.checked ? state.sel[f.key].add(o) : state.sel[f.key].delete(o);
                  render();
                },
              }),
              icon(f.icons[o], "lg"),
              el("span", {}, o),
            ),
          )),
        ),
      ),
      p.length
        ? el("div", {}, el("h2", {}, `Your pool: ${p.length} specs`), el("div", { class: "spec-grid" }, p.map((s) => specTile(s))))
        : el("div", { class: "error" }, "No specs left — tick at least one option"),
    ];
  },

  content: () => {
    const pickedIds = new Set(state.picked.map((p) => p.id));
    // Weights the user didn't type follow the rank, so reordering keeps octy's 3 / 2 / 1 / 0.5.
    const rerank = () => {
      state.picked.forEach((p, i) => {
        if (!p.custom) p.weight = DEFAULT_WEIGHTS[Math.min(i, DEFAULT_WEIGHTS.length - 1)];
      });
      render();
    };
    const move = (i, d) => {
      const [x] = state.picked.splice(i, 1);
      state.picked.splice(i + d, 0, x);
      rerank();
    };
    return [
      header("Content types", "inv_misc_note_06",
        el("p", { class: "muted" }, "Pick what you'll play, then rank it. Weights follow the rank (octy's 3 / 2 / 1 / 0.5) unless you type your own. ", watch(336))),
      el("div", { class: "cols" },
        el("div", { class: "panel" },
          el("h3", {}, "Available"),
          el("div", { class: "ct-grid" }, CONTENT_TYPES.filter((c) => !pickedIds.has(c.id)).map((c) =>
            el("button", {
              class: "ct-tile",
              title: `Add ${c.label}`,
              onclick: () => {
                state.picked.push({ id: c.id, weight: 0, custom: false });
                rerank();
              },
            }, icon(c.icon), el("span", {}, c.label.split("/").map((part, i) => (i ? ["/", el("wbr"), part] : part))), el("span", { class: "add" }, "+")),
          )),
        ),
        el("div", { class: "panel" },
          el("h3", {}, "Your ranking"),
          state.picked.length ? null : el("p", { class: "muted" }, "Nothing selected yet."),
          state.picked.map((p, i) =>
            el("div", { class: "rank-row" },
              el("span", { class: "rank" }, i + 1),
              icon(CT[p.id].icon, "sm"),
              el("span", { class: "grow" }, CT[p.id].label),
              el("label", { class: `weight${p.custom ? " custom" : ""}`, title: p.custom ? "Your weight — it stays when you reorder" : "Follows the rank" }, "×",
                el("input", {
                  type: "number", step: "0.5", min: "0", value: p.weight,
                  onchange: (e) => {
                    p.weight = Math.max(0, Number(e.target.value) || 0);
                    p.custom = true;
                    render();
                  },
                })),
              el("button", { class: "mini", disabled: i === 0, onclick: () => move(i, -1), title: "Up" }, "↑"),
              el("button", { class: "mini", disabled: i === state.picked.length - 1, onclick: () => move(i, 1), title: "Down" }, "↓"),
              el("button", { class: "mini", onclick: () => { state.picked.splice(i, 1); rerank(); }, title: "Remove" }, "✕"),
            ),
          ),
        ),
      ),
    ];
  },

  lookback: () => {
    const p = pool();
    const toggle = (ids, off) => {
      for (const id of ids) off ? state.manualExcl.delete(id) : state.manualExcl.add(id);
      render();
    };
    const classes = [...new Set(p.map((s) => s.cls))];
    return [
      header("Look back", "ability_stealth",
        el("p", { class: "muted" }, "Any obvious exclusions? Now that you've ranked content, click a class or a spec that clearly doesn't fit to exclude it (click again to restore). Every later step starts from what's left.")),
      el("div", { class: "class-toggles" }, classes.map((cls) => {
        const ids = p.filter((s) => s.cls === cls).map((s) => s.id);
        const off = ids.every((id) => state.manualExcl.has(id));
        return el("button", {
          class: `class-toggle${off ? " off" : ""}`,
          style: `--cc:${CLASSES[cls].color}`,
          "aria-pressed": String(off),
          title: off ? `Restore every ${cls} spec` : `Exclude every ${cls} spec`,
          onclick: () => toggle(ids, off),
        }, icon(CLASSES[cls].icon, "sm"), cls);
      })),
      el("div", { class: "spec-grid" }, p.map((s) =>
        specTile(s, { off: state.manualExcl.has(s.id), onClick: () => toggle([s.id], state.manualExcl.has(s.id)) }),
      )),
      el("p", { class: "kept-count" }, `${basePool().length} of ${p.length} specs kept.`),
    ];
  },

  playstyle: () => {
    const specs = basePool();
    const answers = effectiveAnswers(state.playstyle, {}, {});
    const verdict = playstyleVerdict();
    const ctx = fieldContext("playstyle");
    const answered = Object.keys(answers).length;
    const written = Object.values(answers).some((a) => a.text.trim());
    const ask = () => askTrainer("playstyle", "playstyle", answers, (trainer) => (state.playstyleTrainer = trainer));
    const trainer = trainerControls("playstyle", { pending: verdict.trainerPending, ask });
    return [
      header("Playstyle", "spell_holy_magicalsentry",
        el("p", { class: "muted" }, "Answered once, used for every content type — you can still change an answer for one content type on its page. Leave blank anything you don't mind.")),
      el("div", { class: "parchment" },
        el("p", { class: "parchment-intro" }, "Answers are preferences: they rank specs using octy's ratings. When an answer goes against some specs, octy offers to drop them — say yes only when you feel strongly. Notes are read once by the trainer and apply to every content type."),
        pageOrder("playstyle", questionsToAsk(PLAYSTYLE, specs, state.playstyle)).map((it) => questionField(state.playstyle, it.q, ctx)),
      ),
      el("div", { class: "actions" },
        el("span", { class: "counter" }, `${verdict.kept.size} of ${specs.length} specs left`),
        written ? trainer.button : el("span", { class: "muted small" }, answered ? `${answered} answered` : "Nothing answered yet"),
      ),
      trainer.error,
      written && verdict.trainerPending ? el("p", { class: "muted small" }, "Your notes aren't read yet — showing octy's ratings only.") : null,
      el("div", { class: "spec-grid" }, specs
        .slice()
        .sort((a, b) => Number(verdict.kept.has(b.id)) - Number(verdict.kept.has(a.id)) || (verdict.fit[b.id] ?? -1) - (verdict.fit[a.id] ?? -1))
        .map((s) => specTile(s, { off: !verdict.kept.has(s.id), note: fitNote(verdict.fit[s.id]) }))),
    ];
  },

  review: () => {
    const flags = [];
    if (playstyleVerdict().trainerPending) flags.push(el("li", {}, "Playstyle has notes the trainer hasn't read yet."));
    for (const p of state.picked) {
      const t = textureOf(p.id);
      const label = CT[p.id].label;
      if (t.skipped || !isScored(CT[p.id])) continue;
      const v = verdictOf(p.id);
      if (!v.kept.size) flags.push(el("li", {}, `Nothing survives in ${label} — undo a drop there or on Playstyle.`));
      if (v.trainerPending) flags.push(el("li", {}, `${label} has notes the trainer hasn't read yet.`));
      for (const [q, a] of Object.entries(t.overrides)) {
        const base = state.playstyle[q];
        if (answerText(a) !== (base ? answerText(base) : "")) {
          flags.push(el("li", {}, `${label} changes your Playstyle answer to “${q}”: ${base && isAnswered(base) ? answerText(base) : "no answer"} → ${isAnswered(a) ? answerText(a) : "no answer"}.`));
        }
      }
    }
    // The same content question answered differently in different content types.
    const seen = {};
    for (const p of state.picked) {
      for (const [q, a] of Object.entries(textureOf(p.id).answers)) {
        if (!isAnswered(a)) continue;
        (seen[q] ??= []).push({ label: CT[p.id].label, text: answerText(a) });
      }
    }
    for (const [q, list] of Object.entries(seen)) {
      if (new Set(list.map((x) => x.text)).size > 1) {
        flags.push(el("li", {}, `“${q}” differs between ${list.map((x) => `${x.label} (${x.text})`).join(" and ")} — fine if intended.`));
      }
    }
    const answerList = (entries) => el("dl", {}, entries.map(([q, a, note]) => [el("dt", {}, q, note ? el("small", { class: "muted" }, ` · ${note}`) : null), el("dd", {}, a)]));
    const playstyle = Object.entries(effectiveAnswers(state.playstyle, {}, {}));
    return [
      header("Review", "spell_holy_auraoflight", el("p", { class: "muted" }, "Your Playstyle answers, then what each content type changes or adds. Click a step to change it.")),
      flags.length ? el("div", { class: "warn" }, el("strong", {}, "Worth a look"), el("ul", { class: "flags" }, flags)) : null,
      el("div", { class: "panel review" },
        el("h3", {}, el("button", { class: "mini", onclick: () => go("playstyle") }, "Playstyle"), " every content type"),
        playstyle.length ? answerList(playstyle.map(([q, a]) => [q, answerText(a)])) : el("p", { class: "muted" }, "No answers."),
      ),
      state.picked.map((p) => {
        const t = textureOf(p.id);
        const changed = Object.entries(t.overrides)
          .filter(([q, a]) => answerText(a) !== answerText(state.playstyle[q] ?? emptyAnswer()))
          .map(([q, a]) => [q, isAnswered(a) ? answerText(a) : "no answer", `changed from Playstyle (${isAnswered(state.playstyle[q]) ? answerText(state.playstyle[q]) : "no answer"})`]);
        const own = Object.entries(t.answers).filter(([, a]) => isAnswered(a)).map(([q, a]) => [q, answerText(a)]);
        return el("div", { class: "panel review" },
          el("h3", {}, el("button", { class: "mini", onclick: () => go(`ct:${p.id}`) }, CT[p.id].label), ` ×${p.weight}`,
            el("span", { class: `badge ${statusOf(p.id)}` }, STATUS_LABEL[statusOf(p.id)])),
          t.skipped ? el("p", { class: "muted" }, "Skipped — scores 0.")
            : !isScored(CT[p.id]) ? el("p", { class: "muted" }, "Nothing to ask here yet — doesn't change your scores.")
            : changed.length || own.length ? answerList([...changed, ...own])
            : el("p", { class: "muted" }, "Nothing changed or added — your Playstyle answers decide this one."),
        );
      }),
    ];
  },

  results: () => {
    const ranked = state.picked.map((p) => ({ ...p, status: statusOf(p.id) }));
    const stepLinks = (list) => list.map((p) => el("button", { class: "mini", onclick: () => go(`ct:${p.id}`) }, CT[p.id].label));
    const counted = ranked.filter((p) => p.status === "evaluated" || p.status === "stale");
    const startOverButton = el("div", { class: "start-over" }, el("button", { onclick: startOver }, "Start over"));
    if (!counted.length) {
      return [
        header("Results", "inv_misc_coin_01"),
        el("div", { class: "panel empty-results" },
          el("h2", {}, "No results yet"),
          el("p", {}, "Open at least one content type to see your main and alt candidates."),
          el("div", { class: "step-links" }, stepLinks(ranked)),
        ),
        startOverButton,
      ];
    }
    const stepScores = ranked.map((p) => ({ id: p.id, weight: p.weight, verdict: counted.includes(p) ? verdictOf(p.id) : null }));
    const rows = scoreSpecs(stepScores, basePool());
    const scored = rows.filter((r) => r.points > 0);
    const top = scored.filter((r) => sameScore(r, scored[0]));
    // The "which would you rather play?" picker is optional, and only offered for a small tie: picking through a
    // dozen equal specs says nothing the answers didn't.
    const MAX_TIE_PICKER = 6;
    const canPick = top.length > 1 && top.length <= MAX_TIE_PICKER;
    const ko = canPick ? knockout(top.map((r) => r.spec.id), state.tiebreak) : null;
    const champion = top.length === 1 ? top[0].spec.id : ko?.champion ?? null;
    const mainRow = rows.find((r) => r.spec.id === champion);
    // Unsettled tie: the tied specs share the top spot (up to MAX_TIE_PICKER cards; the rest are in the table).
    const tied = mainRow ? [] : top.slice(0, MAX_TIE_PICKER);
    // Alts: the rest of a settled tie, then the next two score groups; none under an unsettled big tie, where
    // lower-scored cards would outrank tied specs left off the podium.
    const groups = [];
    for (const r of scored) {
      if (top.includes(r)) continue;
      if (!groups.length || !sameScore(groups.at(-1)[0], r)) groups.push([r]);
      else groups.at(-1).push(r);
    }
    const MAX_ALTS = 4; // the rest of a big tie stays visible in the table
    const alts = top.length > MAX_TIE_PICKER && !mainRow ? [] : [...(mainRow ? top.filter((r) => r !== mainRow) : []), ...groups.slice(0, 2).flat()].slice(0, MAX_ALTS);
    const tier = (r) => (r === mainRow || tied.includes(r) ? "main" : alts.includes(r) ? "alt" : null);
    const ordered = mainRow ? [mainRow, ...rows.filter((r) => r !== mainRow)] : rows;
    const pending = ranked.filter((p) => p.status === "pending");
    const unread = ranked.filter((p) => p.status === "stale");
    const u = uiOf("results");
    const shareStatus = el("span", { class: "muted small" });
    const shareBox = el("div", { class: "share" },
      el("button", {
        onclick: async () => {
          const url = await shareLink();
          const copied = await navigator.clipboard?.writeText(url).then(() => true, () => false);
          shareStatus.textContent = copied ? "Link copied — it includes your answers." : "Copy this link — it includes your answers:";
          shareBox.querySelector("input")?.remove();
          if (!copied) shareBox.append(el("input", { class: "share-url", readOnly: true, value: url, onfocus: (e) => e.target.select() }));
        },
      }, "Copy share link"),
      shareStatus,
    );
    const pick = (pair, winner) => {
      state.tiebreak[[...pair].sort().join("|")] = winner;
      render();
    };
    const clearPicks = () => {
      const ids = new Set(top.map((r) => r.spec.id));
      for (const pair of Object.keys(state.tiebreak)) if (pair.split("|").every((id) => ids.has(id))) delete state.tiebreak[pair];
      u.choosing = true;
      render();
    };
    // octy's "look back": while specs tie for main, offer the unanswered question that splits them best, inline.
    // It stays up after being answered (so its "drop these?" prompt can be used) until the player moves on.
    const askable = ranked.filter((p) => (p.status === "evaluated" || p.status === "stale") && CT[p.id].items.length);
    const tiedNow = top.length > 1 && !mainRow;
    const scopeLive = (scope) => scope === "playstyle" || askable.some((p) => `ct:${p.id}` === scope);
    if (u.current && !scopeLive(u.current.scope)) u.current = null;
    if (!u.current && tiedNow) {
      u.current = nextQuestion([
        { scope: "playstyle", items: PLAYSTYLE, answers: state.playstyle },
        ...askable.map((p) => ({ scope: `ct:${p.id}`, items: CT[p.id].items, answers: answersFor(p.id) })),
      ], top.map((r) => r.spec), u.skippedQuestions);
    }
    const cur = u.current;
    const curContainer = cur && (cur.scope === "playstyle" ? state.playstyle : textureOf(cur.scope.slice(3)).answers);
    const curAnswered = cur && isAnswered(curContainer[cur.q]);
    const moveOn = () => {
      if (!curAnswered) u.skippedQuestions.add(`${cur.scope}|${cur.q}`);
      u.current = null;
      render();
    };
    const nextPanel = cur
      ? el("div", { class: "parchment next-question" },
          el("h2", {}, "One more question"),
          el("p", { class: "parchment-intro" },
            tiedNow ? `Your answers can't separate these ${top.length} specs yet. This question splits them best ` : "That settled your main — you can still drop specs for this answer ",
            cur.scope === "playstyle" ? "(Playstyle — applies to every content type):" : `(${CT[cur.scope.slice(3)].label}):`),
          questionField(curContainer, cur.q, fieldContext(cur.scope)),
          el("button", { class: curAnswered ? "mini primary" : "add-detail", onclick: moveOn },
            !curAnswered ? "Skip this question" : tiedNow ? "Next question" : "Done"),
        )
      : null;
    let tieNote = null;
    if (top.length > MAX_TIE_PICKER) {
      tieNote = cur ? null : el("div", { class: "panel tiebreak" },
        el("p", {}, `${top.length} specs tie for main and no question left tells them apart. Drop specs you're not keen on from an earlier answer, or write a note for the trainer.`));
    } else if (canPick && !mainRow) {
      tieNote = el("div", { class: "panel tiebreak" },
        u.choosing && ko.next
          ? [
              el("h2", {}, "Which would you rather play?"),
              el("div", { class: "tiebreak-pair" }, ko.next.map((id) =>
                el("button", { class: "loot-choice", dataset: { spec: id }, onclick: () => pick(ko.next, id) }, icon(SPEC[id].icon, "lg"), specLabel(SPEC[id])))),
              el("button", { class: "mini", onclick: () => { u.choosing = false; render(); } }, "Not now"),
            ]
          : [
              el("p", {}, `${top.length} specs tie for main.`),
              el("button", { class: "primary", onclick: () => { u.choosing = true; render(); } }, "Tied — help me choose"),
            ]);
    } else if (canPick && mainRow) {
      tieNote = el("p", { class: "muted small" }, `${specName(mainRow.spec)} won your tie-breaker over ${top.length - 1} tied spec${top.length > 2 ? "s" : ""}. `,
        el("button", { class: "mini", onclick: clearPicks }, "Choose again"));
    }

    return [
      header("Results", "inv_misc_coin_01", shareBox),
      pending.length ? el("div", { class: "warn" }, "Not visited yet (scores 0): ", el("span", { class: "step-links" }, stepLinks(pending))) : null,
      unread.length ? el("div", { class: "warn" }, "Notes the trainer hasn't read — these use octy's ratings only: ", el("span", { class: "step-links" }, stepLinks(unread))) : null,
      playstyleVerdict().trainerPending
        ? el("div", { class: "warn" }, "Your Playstyle notes aren't read yet — octy's ratings only: ", el("span", { class: "step-links" }, el("button", { class: "mini", onclick: () => go("playstyle") }, "Playstyle")))
        : null,
      tiedNow ? nextPanel : null,
      el("div", { class: "podium" }, [mainRow, ...tied, ...alts].filter(Boolean).map((r) =>
        el("div", { class: `loot ${tier(r)}`, dataset: { spec: r.spec.id } },
          icon(r.spec.icon, "xl"),
          el("div", { class: "loot-text" },
            el("div", { class: "loot-tier" }, r === mainRow ? "Main candidate" : tied.includes(r) ? "Tied for main" : "Alt candidate"),
            el("div", { class: "loot-name" }, specLabel(r.spec), unprovenBadge(r.spec)),
            el("div", { class: "muted small" }, r.spec.role, r.fit !== null ? ` · fit ${pct(r.fit)}` : ""),
            r === mainRow || tied.includes(r) ? whyBox(r.spec, counted.map((p) => p.id)) : null,
          ),
          el("div", { class: "loot-pts" }, showPoints(r.points), el("small", {}, "pts")),
        ),
      )),
      tied.length < top.length && !mainRow ? el("p", { class: "muted small" }, `+${top.length - tied.length} more tied — see the table.`) : null,
      tiedNow ? null : nextPanel,
      tieNote,
      el("div", { class: "panel table-wrap" },
        el("table", { class: "results" },
          el("thead", {}, el("tr", {},
            el("th", {}, "#"), el("th", {}, "Class / spec"),
            el("th", { title: "Each content type pays its weight × the spec's fit there (full weight when no answer rates it); dropped specs get 0" }, "Total"),
            el("th", { title: "How well octy's ratings match your answers, weighted by content type" }, "Fit"),
            state.picked.map((p) => el("th", { class: "ct-col" }, icon(CT[p.id].icon, "sm"), el("div", {}, CT[p.id].label), el("div", { class: "muted small" }, `×${p.weight}`))),
          )),
          el("tbody", {}, ordered.map((r, i) =>
            el("tr", { class: r.points === 0 ? "zero" : tier(r) ?? "" },
              el("td", { class: "muted" }, i + 1),
              el("td", { dataset: { spec: r.spec.id } }, el("span", { class: "spec-cell" }, icon(r.spec.icon, "sm"), specLabel(r.spec), unprovenBadge(r.spec))),
              el("td", { class: "num" }, showPoints(r.points)),
              el("td", { class: "muted small" }, pct(r.fit)),
              r.cells.map((c, j) =>
                el("td", { class: "cell" },
                  ranked[j].status === "skipped" ? el("span", { class: "muted small" }, "skipped")
                    : ranked[j].status === "unscored" ? el("span", { class: "muted small" }, "not scored")
                    : ranked[j].status === "pending" ? el("span", { class: "muted" }, "—")
                    : [el("span", { class: c.ok ? "ok" : "bad" }, c.ok ? `✓ ${showPoints(c.pts)}` : "✗"), " ", el("span", { class: "muted small" }, c.fit !== null ? `fit ${pct(c.fit)}` : "")],
                ),
              ),
            ),
          )),
        ),
      ),
      startOverButton,
    ];
  },
};

// ---------- content type step ----------

function renderTexture(ctId) {
  const ct = CT[ctId];
  const t = textureOf(ctId);
  const stepId = `ct:${ctId}`;
  const weight = state.picked.find((p) => p.id === ctId).weight;
  const specs = basePool();
  const status = statusOf(ctId);
  const head = header(ct.label, ct.icon,
    el("div", { class: "head-meta" }, el("span", { class: "weight-pill" }, `weight ×${weight}`),
      el("span", { class: `badge ${status}` }, status === "pending" ? "in progress" : STATUS_LABEL[status])),
    ct.examples.length ? el("div", { class: "examples-links" }, ct.examples.map((x) => watch(x.t, `${x.who}'s take`))) : null,
  );
  if (!isScored(ct)) return [head, ct.tip ? el("p", { class: "tip" }, ct.tip) : null];

  const answers = answersFor(ctId);
  const verdict = verdictOf(ctId);
  // Only this step's own notes (or Playstyle notes it changed) need a trainer call here; Playstyle notes are read once.
  const { answers: trainerAnswers } = stepTrainerAnswers(state.playstyle, t.overrides, t.answers);
  const written = Object.values(trainerAnswers).some((a) => a.text.trim());
  const loading = uiOf(stepId).loading;

  const ctx = fieldContext(stepId);
  const overrideCtx = fieldContext(`${stepId}:override`);

  const ask = () => askTrainer(stepId, ctId, trainerAnswers, (trainer) => {
    t.trainer = trainer;
    t.override = {};
  });
  const trainer = trainerControls(stepId, { pending: verdict.trainerPending, ask });

  // Other content types that answered some of the same questions (the PvP types share theirs) can be copied over.
  const ownQs = new Set(ct.items.map((it) => it.q).filter(Boolean));
  const copySources = state.picked
    .filter((p) => p.id !== ctId)
    .map((p) => ({ label: CT[p.id].label, answers: Object.entries(textureOf(p.id).answers).filter(([q, a]) => ownQs.has(q) && isAnswered(a)) }))
    .filter((x) => x.answers.some(([q, a]) => JSON.stringify(t.answers[q]) !== JSON.stringify(a)));

  const ownQuestions = pageOrder(stepId, questionsToAsk(ct.items, ctx.pool, answers));
  const overridden = PLAYSTYLE.filter((it) => it.q in t.overrides);
  const playstyleList = PLAYSTYLE.map((it) => {
    if (it.q in t.overrides) return null;
    const base = state.playstyle[it.q];
    return el("li", {},
      el("span", { class: "grow" }, it.q, el("span", { class: "muted" }, ` — ${isAnswered(base) ? answerText(base) : "no answer"}`)),
      el("button", {
        class: "mini",
        onclick: () => {
          t.overrides[it.q] = structuredClone(base ?? emptyAnswer());
          render();
        },
      }, `Change for ${ct.label}`));
  });
  const intro = ownQuestions.length
    ? `Questions for ${ct.label}, the ones that narrow your pool most first. Answers rank specs; octy offers to drop the ones an answer goes against. Anything you write is read by the trainer.`
    : ct.favors
      ? `octy's tip decides this one: only ${ct.favors.join(", ")} specs score here, on top of your Playstyle answers. Click a spec below to change that.`
      : `No ${ct.label}-specific questions left for your pool — your Playstyle answers decide this one.`;

  return [
    head,
    ct.tip ? el("p", { class: "tip" }, ct.tip) : null,
    el("div", { class: "parchment" },
      el("p", { class: "parchment-intro" }, intro),
      copySources.length
        ? el("div", { class: "copy-from" }, copySources.map((x) =>
            el("button", {
              class: "mini",
              onclick: () => {
                for (const [q, a] of x.answers) t.answers[q] = structuredClone(a);
                render();
              },
            }, `Copy answers from ${x.label}`)))
        : null,
      ownQuestions.map((it) => (it.hint ? el("p", { class: "hint" }, it.hint) : questionField(t.answers, it.q, ctx))),
      overridden.map((it) =>
        el("div", { class: "override" },
          el("div", { class: "override-head" },
            el("span", { class: "muted small" }, `Playstyle answer changed for ${ct.label}`),
            el("button", { class: "mini", onclick: () => { delete t.overrides[it.q]; render(); } }, "Use my Playstyle answer")),
          questionField(t.overrides, it.q, overrideCtx))),
    ),
    el("details", { class: "panel playstyle-here" },
      el("summary", {}, `Your Playstyle answers (applied here)${overridden.length ? ` · ${overridden.length} changed` : ""}`),
      el("ul", {}, playstyleList),
    ),
    el("div", { class: "actions" },
      el("span", { class: "counter" }, `${verdict.kept.size} of ${specs.length} specs left`),
      written ? trainer.button : null,
      el("button", { disabled: loading, onclick: () => { t.skipped = !t.skipped; render(); } }, t.skipped ? "Include this content type" : "Skip"),
    ),
    trainer.error,
    el("div", { class: "panel verdicts" },
      el("p", { class: "muted small" },
        verdict.pExcl ? "The trainer read your notes. Bar = P(excluded). " : written ? "Your notes aren't read yet — showing octy's ratings only. " : "Live from octy's ratings. ",
        "✗/~ = octy's against / narrow ratings for your answers. Click a spec to override."),
      specs
        .slice()
        .sort((a, b) => Number(verdict.kept.has(b.id)) - Number(verdict.kept.has(a.id)) || (verdict.fit[b.id] ?? -1) - (verdict.fit[a.id] ?? -1))
        .map((s) => {
          const ok = verdict.kept.has(s.id);
          const p = verdict.pExcl?.[s.id];
          const fit = verdict.fit[s.id];
          const notes = octyNotes(answers, s);
          return el("button", {
            class: `verdict${ok ? "" : " excluded"}`,
            dataset: { spec: s.id, ...(notes.length && { notes: `octy's ratings for your answers:\n${notesText(notes)}` }) },
            onclick: () => { t.override[s.id] = !ok; render(); },
          },
            icon(s.icon, "sm"),
            el("span", { class: "verdict-name" }, specLabel(s), octyTally(notes)),
            p !== undefined
              ? el("span", { class: "bar" }, el("span", { style: `width:${p * 100}%` }))
              : el("span", { class: "bar fit" }, el("span", { style: `width:${(fit ?? 0) * 100}%` })),
            el("span", { class: "pct" }, p !== undefined ? pct(p) : fit !== null ? `fit ${pct(fit)}` : "—"),
            el("span", { class: `badge ${ok ? "kept" : "excluded"}` }, ok ? "kept" : "excluded", s.id in t.override ? " (override)" : ""),
          );
        }),
    ),
  ];
}

const ASK_LABEL = {
  idle: "Consult the Trainer about your notes",
  done: "Trainer has read your notes ✓",
  checking: "Checking you're human…",
  human: "Confirm you're human to continue…",
  trainer: "The trainer ponders…",
};

// ---------- start ----------

// A share link (#s=…) wins over this device's saved progress, after confirming if both exist.
async function boot() {
  const local = loadLocal();
  if (location.hash.startsWith("#s=")) {
    const shared = await decodeShare(location.hash.slice(3)).catch(() => null);
    history.replaceState(null, "", location.pathname);
    if (shared && (!local || confirm("Open the shared funnel? It replaces the answers saved on this device."))) {
      restore(shared);
      return render();
    }
  }
  if (local) restore(local);
  render();
}

boot();
