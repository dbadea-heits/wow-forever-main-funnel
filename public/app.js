import { VIDEO_URL, VIDEO_TITLE, CHANNEL, EXAMPLES, CLASSES, SPECS, FUNDAMENTALS, CONTENT_TYPES, PLAYSTYLE, DEFAULT_WEIGHTS } from "./data.js";
import { judge, cancelHumanCheck } from "./jev.js";
import { saveLocal, loadLocal, clearLocal, encodeShare, decodeShare } from "./persist.js";
import { TEXTURE_OPTIONS, ratingsOf } from "./ratings.js";
import {
  emptyAnswer, isAnswered, isMulti, optionsOf, effectiveAnswers, answerRatings, localVerdict, stepVerdict,
  trainerKey, questionsToAsk, scoreSpecs, sameScore, knockout,
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
  playstyle: {}, // question -> answer ({chosen, text, dealbreaker}); applies to every content type
  // ctId -> {answers, overrides (Playstyle answers replaced for this content type), visited, skipped,
  //          trainer: {key, pExcl} | null, override: {specId: kept}, error, loading, phase} — the last three aren't saved.
  texture: {},
  tiebreak: {}, // "specA|specB" (sorted) -> the spec the player would rather play
};

// ---------- derived state ----------

const pool = () =>
  SPECS.filter(
    (s) => s.range.some((r) => state.sel.range.has(r)) && state.sel.dmg.has(s.dmg) && state.sel.role.has(s.role),
  );
const basePool = () => pool().filter((s) => !state.manualExcl.has(s.id));

function textureOf(ctId) {
  return (state.texture[ctId] ??= {
    answers: {},
    overrides: {},
    visited: false,
    skipped: false,
    trainer: null,
    override: {},
    error: null,
    loading: false,
    phase: null,
  });
}

const answersFor = (ctId) => {
  const t = textureOf(ctId);
  return effectiveAnswers(state.playstyle, t.overrides, t.answers);
};
const verdictOf = (ctId) => {
  const t = textureOf(ctId);
  return stepVerdict({ answers: answersFor(ctId), specs: basePool(), trainer: t.trainer, override: t.override });
};

// pending: not opened yet · stale: written notes the trainer hasn't read · evaluated: everything decided.
function statusOf(ctId) {
  const t = textureOf(ctId);
  if (t.skipped) return "skipped";
  if (!t.visited) return "pending";
  return verdictOf(ctId).trainerPending ? "stale" : "evaluated";
}

const STATUS_LABEL = {
  pending: "not visited yet",
  evaluated: "decided",
  stale: "notes not read by the trainer yet",
  skipped: "skipped",
};

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
  tip.replaceChildren(
    el("div", { class: "tip-title", style: `color:${classColor(s)}` }, specName(s)),
    el("div", {}, s.role),
    el("div", { class: "tip-row" }, el("span", {}, s.range.join(" / ")), el("span", {}, s.dmg)),
    el("div", { class: "tip-traits" }, s.traits),
  );
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
  if (cur.ct) textureOf(cur.ct).visited = true;

  nav.replaceChildren(
    el("div", { class: "nav-title" }, "The Funnel"),
    ...list.map((s, i) =>
      el(
        "button",
        {
          class: `nav-item${s.id === state.step ? " active" : ""}`,
          disabled: i > block,
          title: s.ct ? `${s.label}: ${STATUS_LABEL[statusOf(s.ct)]}` : null,
          onclick: () => go(s.id),
        },
        icon(s.icon, "sm"),
        el("span", { class: "grow" }, s.label),
        s.ct ? el("span", { class: `dot ${statusOf(s.ct)}` }) : null,
      ),
    ),
    state.picked.length
      ? el("div", { class: "nav-legend" },
          Object.entries(STATUS_LABEL).map(([status, label]) => el("div", {}, el("span", { class: `dot ${status}` }), label)))
      : null,
    el("button", { class: "nav-reset", onclick: startOver }, "Start over"),
  );

  // On the mobile step strip, keep the current step in view.
  nav.querySelector(".nav-item.active").scrollIntoView({ block: "nearest", inline: "center" });

  const body = cur.ct ? renderTexture(cur.ct) : VIEWS[cur.id]();
  const footer = el(
    "div",
    { class: "footer" },
    el("button", { disabled: idx === 0, onclick: () => go(list[idx - 1].id) }, "← Back"),
    idx < list.length - 1
      ? el("button", { class: "primary", disabled: idx >= block, onclick: () => go(list[idx + 1].id) }, "Next →")
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
  app.replaceChildren(el("section", { class: "step" }, body, footer, credit));
  save();
}

function go(id) {
  cancelHumanCheck();
  state.step = id;
  render();
  window.scrollTo(0, 0);
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
    texture: Object.fromEntries(
      Object.entries(state.texture).map(([id, t]) => [id, {
        answers: t.answers, overrides: t.overrides, visited: t.visited, skipped: t.skipped, trainer: t.trainer, override: t.override,
      }]),
    ),
    tiebreak: state.tiebreak,
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
    };
  };
  const answerMap = (x, questions) => Object.fromEntries(Object.entries(obj(x)).filter(([q]) => questions.has(q)).map(([q, a]) => [q, answer(q, a)]));

  for (const f of FUNDAMENTALS) {
    if (Array.isArray(snap.sel?.[f.key])) state.sel[f.key] = new Set(snap.sel[f.key].filter((o) => f.options.includes(o)));
  }
  const seen = new Set();
  state.picked = list(snap.picked)
    .filter((p) => CT[p?.id] && !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, weight: Number.isFinite(p.weight) && p.weight >= 0 ? p.weight : 0, custom: p.custom === true }));
  state.manualExcl = new Set(list(snap.manualExcl).filter((id) => SPEC[id]));
  state.playstyle = answerMap(snap.playstyle, PLAYSTYLE_QS);
  for (const [id, saved] of Object.entries(obj(snap.texture))) {
    if (!CT[id]) continue;
    const t = textureOf(id);
    t.answers = answerMap(saved.answers, new Set(CT[id].items.map((it) => it.q).filter(Boolean)));
    t.overrides = answerMap(saved.overrides, PLAYSTYLE_QS);
    t.visited = saved.visited === true;
    t.skipped = saved.skipped === true;
    const trainer = obj(saved.trainer);
    t.trainer = typeof trainer.key === "string" ? { key: trainer.key, pExcl: specMap(trainer.pExcl, (p) => Number.isFinite(p) && p >= 0 && p <= 1) } : null;
    t.override = specMap(saved.override, (v) => typeof v === "boolean");
  }
  state.tiebreak = Object.fromEntries(Object.entries(obj(snap.tiebreak)).filter(([pair, w]) => pair.split("|").includes(w) && SPEC[w]));
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

// One question with octy's preset answers (single or multi choice), a dealbreaker toggle and optional notes, or a
// free-text box when the question has no presets. `container[q]` holds the answer; `ctx.answers` gives derived
// ratings their context, `ctx.pool` the specs still in play.
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
        commit();
        render();
      },
    }, opt);
  });
  return el("div", { class: "q" },
    el("span", {}, q, isMulti(q) ? el("small", { class: "multi" }, " · pick any") : null),
    el("div", { class: "chips" }, chips),
    a.chosen.length && rated
      ? el("label", { class: `dealbreaker${a.dealbreaker ? " on" : ""}` },
          el("input", {
            type: "checkbox",
            checked: a.dealbreaker,
            onchange: (e) => {
              a.dealbreaker = e.target.checked;
              commit();
              render();
            },
          }),
          "Dealbreaker — rule out specs octy rates ✗")
      : null,
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

// octy's narrow-match (Y) and exclude (X) ratings of a spec across a set of answers.
function octyNotes(answers, s) {
  return Object.entries(answers).flatMap(([q, a]) => {
    if (!a.chosen.length) return [];
    const r = answerRatings(q, a, answers)[s.id];
    return r === "X" || r === "Y" ? [{ r, dealbreaker: a.dealbreaker, text: `${q} → ${a.chosen.join(" / ")}` }] : [];
  });
}

function octyTally(notes) {
  if (!notes.length) return null;
  const n = (r) => notes.filter((x) => x.r === r).length;
  const parts = [n("X") && `${n("X")} ✗`, n("Y") && `${n("Y")} ~`].filter(Boolean);
  const title = notes.map((x) => `${x.r === "X" ? "✗ against" : "~ narrow"}${x.dealbreaker ? " (dealbreaker)" : ""}: ${x.text}`).join("\n");
  return el("span", { class: "octy-tally", title }, `octy ${parts.join(" ")}`);
}

const answerText = (a) => [a.chosen.join(" / "), a.text.trim() && `“${a.text.trim()}”`].filter(Boolean).join(" + ") + (a.dealbreaker ? " · dealbreaker" : "");

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
      el("p", { class: "muted" }, "Method from octy's video ", el("a", { href: VIDEO_URL, target: "_blank", rel: "noopener" }, "Find Your WoW Forever Main in 15 Minutes"), ". Your answers use octy's own ratings of every spec: preferences rank the specs, dealbreakers rule them out, and the class trainer reads anything you write in your own words. Specs left standing earn each content type's weight."),
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
    return [
      header("Look back", "ability_stealth",
        el("p", { class: "muted" }, "Any obvious exclusions? Now that you've ranked content, click a spec that clearly doesn't fit to exclude it (click again to restore). Every later step starts from what's left.")),
      el("div", { class: "spec-grid" }, p.map((s) =>
        specTile(s, {
          off: state.manualExcl.has(s.id),
          onClick: () => {
            state.manualExcl.has(s.id) ? state.manualExcl.delete(s.id) : state.manualExcl.add(s.id);
            render();
          },
        }),
      )),
      el("p", { class: "kept-count" }, `${basePool().length} of ${p.length} specs kept.`),
    ];
  },

  playstyle: () => {
    const specs = basePool();
    const { excluded, fit } = localVerdict(effectiveAnswers(state.playstyle, {}, {}), specs);
    const ctx = { pool: specs, answers: state.playstyle };
    const answered = Object.values(state.playstyle).filter(isAnswered).length;
    return [
      header("Playstyle", "spell_holy_magicalsentry",
        el("p", { class: "muted" }, "Answered once, used for every content type — you can still change an answer for one content type on its page. Leave blank anything you don't mind.")),
      el("div", { class: "parchment" },
        el("p", { class: "parchment-intro" }, "Answers are preferences: they rank specs using octy's ratings. Tick “Dealbreaker” only when you feel strongly — then specs octy rates ✗ are ruled out everywhere."),
        questionsToAsk(PLAYSTYLE, specs, state.playstyle).map((it) => questionField(state.playstyle, it.q, ctx)),
      ),
      el("div", { class: "actions" },
        el("span", { class: "counter" }, `${specs.length - excluded.size} of ${specs.length} specs left`),
        el("span", { class: "muted small" }, answered ? `${answered} answered` : "Nothing answered yet"),
      ),
      el("div", { class: "spec-grid" }, specs
        .slice()
        .sort((a, b) => (fit[b.id] ?? -1) - (fit[a.id] ?? -1))
        .map((s) => specTile(s, { off: excluded.has(s.id), note: fitNote(fit[s.id]) }))),
    ];
  },

  review: () => {
    const flags = [];
    for (const p of state.picked) {
      const t = textureOf(p.id);
      const label = CT[p.id].label;
      if (t.skipped) continue;
      const v = verdictOf(p.id);
      if (!v.kept.size) flags.push(el("li", {}, `Nothing survives in ${label} — loosen a dealbreaker there or on Playstyle.`));
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
    return [
      header("Review", "spell_holy_auraoflight", el("p", { class: "muted" }, "Everything you answered, per content type. Click a content type to change it.")),
      flags.length ? el("div", { class: "warn" }, el("strong", {}, "Worth a look"), el("ul", { class: "flags" }, flags)) : null,
      state.picked.map((p) => {
        const t = textureOf(p.id);
        const answers = answersFor(p.id);
        const entries = Object.entries(answers);
        return el("div", { class: "panel review" },
          el("h3", {}, el("button", { class: "mini", onclick: () => go(`ct:${p.id}`) }, CT[p.id].label), ` ×${p.weight}`,
            el("span", { class: `badge ${statusOf(p.id)}` }, STATUS_LABEL[statusOf(p.id)])),
          t.skipped ? el("p", { class: "muted" }, "Skipped — scores 0.")
            : entries.length
              ? el("dl", {}, entries.map(([q, a]) => [
                  el("dt", {}, q, PLAYSTYLE_QS.has(q) ? el("small", { class: "muted" }, q in t.overrides ? " · changed for this content" : " · Playstyle") : null),
                  el("dd", {}, answerText(a)),
                ]))
              : el("p", { class: "muted" }, "No answers — every spec in your pool survives here."),
        );
      }),
    ];
  },

  results: () => {
    const ranked = state.picked.map((p) => ({ ...p, status: statusOf(p.id) }));
    const stepLinks = (list) => list.map((p) => el("button", { class: "mini", onclick: () => go(`ct:${p.id}`) }, CT[p.id].label));
    const counted = ranked.filter((p) => p.status === "evaluated" || p.status === "stale");
    if (!counted.length) {
      return [
        header("Results", "inv_misc_coin_01"),
        el("div", { class: "panel empty-results" },
          el("h2", {}, "No results yet"),
          el("p", {}, "Open at least one content type to see your main and alt candidates."),
          el("div", { class: "step-links" }, stepLinks(ranked)),
        ),
      ];
    }
    const stepScores = ranked.map((p) => ({ id: p.id, weight: p.weight, verdict: p.status === "pending" || p.status === "skipped" ? null : verdictOf(p.id) }));
    const rows = scoreSpecs(stepScores, basePool());
    const scored = rows.filter((r) => r.points > 0);
    const top = scored.filter((r) => sameScore(r, scored[0]));
    const { champion, next } = top.length > 1 ? knockout(top.map((r) => r.spec.id), state.tiebreak) : { champion: top[0]?.spec.id, next: null };
    // Alts: the rest of a tie for main, then the next two score groups.
    const groups = [];
    for (const r of scored) {
      if (top.includes(r)) continue;
      if (!groups.length || !sameScore(groups.at(-1)[0], r)) groups.push([r]);
      else groups.at(-1).push(r);
    }
    const MAX_ALTS = 4; // the rest of a big tie stays visible in the table
    const alts = [...(champion ? top.filter((r) => r.spec.id !== champion) : []), ...groups.slice(0, 2).flat()].slice(0, MAX_ALTS);
    const mainRow = rows.find((r) => r.spec.id === champion);
    const tier = (r) => (r === mainRow ? "main" : alts.includes(r) ? "alt" : null);
    const ordered = mainRow ? [mainRow, ...rows.filter((r) => r !== mainRow)] : rows;
    const pending = ranked.filter((p) => p.status === "pending");
    const unread = ranked.filter((p) => p.status === "stale");

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
    const pick = (a, b) => {
      const pair = [a, b].sort();
      return (winner) => {
        state.tiebreak[pair.join("|")] = winner;
        render();
      };
    };
    const tieBreaker = next
      ? el("div", { class: "panel tiebreak" },
          el("h2", {}, `It's a tie between ${top.length} specs`),
          el("p", { class: "muted" }, "Settle it: which would you rather play?"),
          el("div", { class: "tiebreak-pair" }, next.map((id) =>
            el("button", { class: "loot-choice", dataset: { spec: id }, onclick: () => pick(...next)(id) }, icon(SPEC[id].icon, "lg"), specLabel(SPEC[id])))),
        )
      : null;

    return [
      header("Results", "inv_misc_coin_01", shareBox),
      pending.length ? el("div", { class: "warn" }, "Not visited yet (scores 0): ", el("span", { class: "step-links" }, stepLinks(pending))) : null,
      unread.length ? el("div", { class: "warn" }, "Notes the trainer hasn't read — these use octy's ratings only: ", el("span", { class: "step-links" }, stepLinks(unread))) : null,
      tieBreaker,
      !next && (mainRow || alts.length)
        ? el("div", { class: "podium" }, [mainRow, ...alts].filter(Boolean).map((r) =>
            el("div", { class: `loot ${tier(r)}`, dataset: { spec: r.spec.id } },
              icon(r.spec.icon, "xl"),
              el("div", { class: "loot-text" },
                el("div", { class: "loot-tier" }, tier(r) === "main" ? "Main candidate" : "Alt candidate"),
                specLabel(r.spec),
                el("div", { class: "muted small" }, r.spec.role, r.fit !== null ? ` · fit ${pct(r.fit)}` : ""),
              ),
              el("div", { class: "loot-pts" }, r.points, el("small", {}, "pts")),
            ),
          ))
        : null,
      el("div", { class: "panel table-wrap" },
        el("table", { class: "results" },
          el("thead", {}, el("tr", {},
            el("th", {}, "#"), el("th", {}, "Class / spec"), el("th", {}, "Total"), el("th", { title: "How well octy's ratings match your preferences; breaks ties" }, "Fit"),
            state.picked.map((p) => el("th", { class: "ct-col" }, icon(CT[p.id].icon, "sm"), el("div", {}, CT[p.id].label), el("div", { class: "muted small" }, `×${p.weight}`))),
          )),
          el("tbody", {}, ordered.map((r, i) =>
            el("tr", { class: r.points === 0 ? "zero" : tier(r) ?? "" },
              el("td", { class: "muted" }, i + 1),
              el("td", { dataset: { spec: r.spec.id } }, el("span", { class: "spec-cell" }, icon(r.spec.icon, "sm"), specLabel(r.spec))),
              el("td", { class: "num" }, r.points),
              el("td", { class: "muted small" }, pct(r.fit)),
              r.cells.map((c, j) =>
                el("td", { class: "cell" },
                  ranked[j].status === "skipped" ? el("span", { class: "muted small" }, "skipped")
                    : ranked[j].status === "pending" ? el("span", { class: "muted" }, "—")
                    : [el("span", { class: c.ok ? "ok" : "bad" }, c.ok ? "✓" : "✗"), " ", el("span", { class: "muted small" }, c.fit !== null ? `fit ${pct(c.fit)}` : "")],
                ),
              ),
            ),
          )),
        ),
      ),
    ];
  },
};

// ---------- content type step ----------

function renderTexture(ctId) {
  const ct = CT[ctId];
  const t = textureOf(ctId);
  const weight = state.picked.find((p) => p.id === ctId).weight;
  const specs = basePool();
  const answers = answersFor(ctId);
  const verdict = verdictOf(ctId);
  const status = statusOf(ctId);
  const written = Object.values(answers).some((a) => a.text.trim());

  // Questions are judged against the specs still in play after the Playstyle dealbreakers.
  const playstyleOnly = effectiveAnswers(state.playstyle, t.overrides, {});
  const playstyleExcluded = localVerdict(playstyleOnly, specs).excluded;
  const inPlay = specs.filter((s) => !playstyleExcluded.has(s.id));
  const ctx = { pool: inPlay, answers };

  const ask = async () => {
    t.error = null;
    t.override = {};
    const here = () => state.step === `ct:${ctId}`;
    t.loading = true;
    render();
    try {
      const pExcl = await judge(ctId, answers, specs.map((s) => s.id), (phase) => {
        t.phase = phase;
        if (here()) render();
      });
      t.trainer = { key: trainerKey(answers, specs), pExcl };
    } catch (e) {
      if (!e.cancelled) t.error = e.message;
    } finally {
      t.loading = false;
      t.phase = null;
      if (here()) render();
      else save();
    }
  };

  const ownQuestions = questionsToAsk(ct.items, inPlay, answers);
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

  return [
    header(ct.label, ct.icon,
      el("div", { class: "head-meta" }, el("span", { class: "weight-pill" }, `weight ×${weight}`), el("span", { class: `badge ${status}` }, STATUS_LABEL[status])),
      ct.examples.length ? el("div", { class: "examples-links" }, ct.examples.map((x) => watch(x.t, `${x.who}'s take`))) : null,
    ),
    ct.tip ? el("p", { class: "tip" }, ct.tip) : null,
    el("div", { class: "parchment" },
      ownQuestions.length
        ? el("p", { class: "parchment-intro" }, `Questions for ${ct.label}, the ones that narrow your pool most first. Answers are preferences unless you tick “Dealbreaker”; anything you write is read by the trainer.`)
        : el("p", { class: "parchment-intro" }, `No ${ct.label}-specific questions left for your pool — your Playstyle answers decide this one.`),
      ownQuestions.map((it) => (it.hint ? el("p", { class: "hint" }, it.hint) : questionField(t.answers, it.q, ctx))),
      overridden.map((it) =>
        el("div", { class: "override" },
          el("div", { class: "override-head" },
            el("span", { class: "muted small" }, `Playstyle answer changed for ${ct.label}`),
            el("button", { class: "mini", onclick: () => { delete t.overrides[it.q]; render(); } }, "Use my Playstyle answer")),
          questionField(t.overrides, it.q, ctx))),
    ),
    el("details", { class: "panel playstyle-here" },
      el("summary", {}, `Your Playstyle answers (applied here)${overridden.length ? ` · ${overridden.length} changed` : ""}`),
      el("ul", {}, playstyleList),
    ),
    el("div", { class: "actions" },
      el("span", { class: "counter" }, `${verdict.kept.size} of ${specs.length} specs left`),
      written
        ? el("button", { class: "primary", disabled: t.loading || !verdict.trainerPending, onclick: ask }, ASK_LABEL[t.loading ? t.phase ?? "checking" : verdict.trainerPending ? "idle" : "done"])
        : null,
      el("button", { disabled: t.loading, onclick: () => { t.skipped = !t.skipped; render(); } }, t.skipped ? "Include this content type" : "Skip"),
    ),
    t.error
      ? el("div", { class: "error" }, t.error, " ", el("button", { class: "mini", onclick: ask }, "Try again"))
      : null,
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
          return el("button", {
            class: `verdict${ok ? "" : " excluded"}`,
            dataset: { spec: s.id },
            onclick: () => { t.override[s.id] = !ok; render(); },
          },
            icon(s.icon, "sm"),
            el("span", { class: "verdict-name" }, specLabel(s), octyTally(octyNotes(answers, s))),
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
