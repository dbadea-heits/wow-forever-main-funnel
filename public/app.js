import { VIDEO_URL, VIDEO_TITLE, CHANNEL, EXAMPLES, CLASSES, SPECS, FUNDAMENTALS, CONTENT_TYPES, DEFAULT_WEIGHTS } from "./data.js";
import { judge, cancelHumanCheck, EXCLUDE_THRESHOLD } from "./jev.js";
import { saveLocal, loadLocal, clearLocal, encodeShare, decodeShare } from "./persist.js";
import { TEXTURE_OPTIONS, octyRatings } from "./ratings.js";

const CT = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c]));
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s]));

const state = {
  step: "intro",
  sel: Object.fromEntries(FUNDAMENTALS.map((f) => [f.key, new Set(f.options)])),
  picked: [], // [{id, weight, custom}] in rank order; custom = weight typed by the user, so it no longer follows the rank
  manualExcl: new Set(),
  // ctId -> {answers: string[], choices: string[][], status, pExcl, override, judged: specIds the trainer ruled on,
  //          error, loading, phase} — error/loading/phase are not saved.
  texture: {},
};

// ---------- derived state ----------

const pool = () =>
  SPECS.filter(
    (s) => s.range.some((r) => state.sel.range.has(r)) && state.sel.dmg.has(s.dmg) && state.sel.role.has(s.role),
  );
const basePool = () => pool().filter((s) => !state.manualExcl.has(s.id));

function textureOf(ctId) {
  return (state.texture[ctId] ??= {
    answers: CT[ctId].items.map(() => ""),
    choices: CT[ctId].items.map(() => []), // chosen preset answers (octy's dropdowns) per item
    status: "pending",
    pExcl: {},
    override: {},
    judged: [],
    error: null,
    loading: false,
    phase: null,
  });
}

const counted = (t) => t.status === "evaluated" || t.status === "stale";
// A spec that joined the pool after the last trainer run has no verdict for this step.
const unjudged = (t, specId) => counted(t) && !(specId in t.override) && !t.judged.includes(specId);
// "stale" also covers a pool that gained specs since the last run.
const statusOf = (t) => (t.status === "evaluated" && basePool().some((s) => unjudged(t, s.id)) ? "stale" : t.status);

function survived(t, specId) {
  if (specId in t.override) return t.override[specId];
  if (!t.judged.includes(specId)) return false;
  const p = t.pExcl[specId];
  return p === undefined || p < EXCLUDE_THRESHOLD;
}

function scores() {
  return basePool()
    .map((s) => {
      const cells = state.picked.map(({ id, weight }) => {
        const t = textureOf(id);
        const ok = counted(t) && survived(t, s.id);
        return { status: t.status, ok, recheck: unjudged(t, s.id), p: t.pExcl[s.id], pts: ok ? weight : 0 };
      });
      return { spec: s, cells, total: cells.reduce((a, c) => a + c.pts, 0) };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------- step list & gating ----------

function steps() {
  return [
    { id: "intro", label: "Introduction", icon: "inv_misc_book_09" },
    { id: "fundamentals", label: "Fundamentals", icon: "inv_sword_04" },
    { id: "content", label: "Content types", icon: "inv_misc_note_06" },
    { id: "lookback", label: "Look back", icon: "ability_stealth" },
    ...state.picked.map((p, i) => ({ id: `ct:${p.id}`, label: `${i + 1}. ${CT[p.id].label}`, icon: CT[p.id].icon, ct: p.id })),
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
const pct = (p) => (p === undefined ? "—" : `${Math.round(p * 100)}%`);

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

  nav.replaceChildren(
    el("div", { class: "nav-title" }, "The Funnel"),
    ...list.map((s, i) =>
      el(
        "button",
        {
          class: `nav-item${s.id === state.step ? " active" : ""}`,
          disabled: i > block,
          title: s.ct ? `${s.label}: ${STATUS_LABEL[statusOf(textureOf(s.ct))]}` : null,
          onclick: () => go(s.id),
        },
        icon(s.icon, "sm"),
        el("span", { class: "grow" }, s.label),
        s.ct ? el("span", { class: `dot ${statusOf(textureOf(s.ct))}` }) : null,
      ),
    ),
    state.picked.length
      ? el("div", { class: "nav-legend" },
          Object.entries(STATUS_LABEL).map(([status, label]) =>
            el("div", {}, el("span", { class: `dot ${status}` }), status === "stale" ? "changed — re-run the trainer" : label)))
      : null,
    el("button", { class: "nav-reset", onclick: startOver }, "Start over"),
  );

  // On the mobile step strip, keep the current step in view.
  nav.querySelector(".nav-item.active").scrollIntoView({ block: "nearest", inline: "center" });

  const cur = list[idx];
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

const STATUSES = ["pending", "evaluated", "stale", "skipped"];

function snapshot() {
  return {
    v: 1,
    step: state.step,
    sel: Object.fromEntries(Object.entries(state.sel).map(([k, set]) => [k, [...set]])),
    picked: state.picked,
    manualExcl: [...state.manualExcl],
    texture: Object.fromEntries(
      Object.entries(state.texture).map(([id, t]) => [id, {
        answers: t.answers, choices: t.choices, status: t.status, pExcl: t.pExcl, override: t.override, judged: t.judged,
      }]),
    ),
  };
}

const save = () => saveLocal(snapshot());

// Rebuilds state from a saved or shared snapshot. Share links are untrusted input, so every field is checked
// against the known content types, specs and preset answers; anything unknown is dropped.
function restore(snap) {
  if (snap?.v !== 1) return;
  const list = (x) => (Array.isArray(x) ? x : []);
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const specMap = (x, valid) => Object.fromEntries(Object.entries(obj(x)).filter(([id, v]) => SPEC[id] && valid(v)));

  for (const f of FUNDAMENTALS) {
    if (Array.isArray(snap.sel?.[f.key])) state.sel[f.key] = new Set(snap.sel[f.key].filter((o) => f.options.includes(o)));
  }
  const seen = new Set();
  state.picked = list(snap.picked)
    .filter((p) => CT[p?.id] && !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, weight: Number.isFinite(p.weight) && p.weight >= 0 ? p.weight : 0, custom: p.custom === true }));
  state.manualExcl = new Set(list(snap.manualExcl).filter((id) => SPEC[id]));
  for (const [id, saved] of Object.entries(obj(snap.texture))) {
    if (!CT[id]) continue;
    const items = CT[id].items;
    const t = textureOf(id);
    if (list(saved.answers).length === items.length) t.answers = saved.answers.map((a) => (typeof a === "string" ? a.slice(0, MAX_ANSWER_CHARS) : ""));
    if (list(saved.choices).length === items.length) {
      t.choices = saved.choices.map((c, i) =>
        list(c).filter((o, j, all) => Object.hasOwn(TEXTURE_OPTIONS[items[i].q] ?? {}, o) && all.indexOf(o) === j));
    }
    t.status = STATUSES.includes(saved.status) ? saved.status : "pending";
    t.pExcl = specMap(saved.pExcl, (p) => Number.isFinite(p) && p >= 0 && p <= 1);
    t.override = specMap(saved.override, (v) => typeof v === "boolean");
    t.judged = list(saved.judged).filter((s) => SPEC[s]);
  }
  state.step = steps().some((s) => s.id === snap.step) ? snap.step : "intro";
}

async function shareLink() {
  return `${location.origin}${location.pathname}#s=${await encodeShare(snapshot())}`;
}

const header = (title, iconName, ...extra) =>
  el("header", { class: "step-head" }, iconName ? icon(iconName, "lg") : null, el("div", {}, el("h1", {}, title), extra));

function specTile(s, { off = false, onClick } = {}) {
  return el(
    onClick ? "button" : "div",
    { class: `spec-tile${off ? " off" : ""}`, dataset: { spec: s.id }, onclick: onClick },
    icon(s.icon),
    el("span", { class: "spec-text" }, specLabel(s), el("small", {}, s.role)),
  );
}

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
      el("p", { class: "muted" }, "Method from octy's video ", el("a", { href: VIDEO_URL, target: "_blank", rel: "noopener" }, "Find Your WoW Forever Main in 15 Minutes"), ". For each content type, the class trainer reads your texture answers and turns away the specs that clash with them; the specs left standing earn that content type's weight."),
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
        el("p", { class: "muted" }, "Now that you've ranked content, does anything in the pool clearly not fit? Click a spec to exclude it (click again to restore). Every texture step starts from what's left.")),
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

  results: () => {
    const ranked = state.picked.map((p) => ({ ...p, t: textureOf(p.id) }));
    const stepLinks = (list) => list.map((p) => el("button", { class: "mini", onclick: () => go(`ct:${p.id}`) }, CT[p.id].label));
    if (!ranked.some((p) => counted(p.t))) {
      return [
        header("Results", "inv_misc_coin_01"),
        el("div", { class: "panel empty-results" },
          el("h2", {}, "No results yet"),
          el("p", {}, "Consult the trainer on at least one content type to see your main and alt candidates."),
          el("div", { class: "step-links" }, stepLinks(ranked)),
        ),
      ];
    }
    const rows = scores();
    const distinct = [...new Set(rows.map((r) => r.total).filter((t) => t > 0))];
    const [mainPts, ...altPts] = distinct;
    const alts = new Set(altPts.slice(0, 2));
    const tier = (r) => (r.total === mainPts ? "main" : alts.has(r.total) ? "alt" : null);
    const pending = ranked.filter((p) => p.t.status === "pending");
    const changed = ranked.filter((p) => statusOf(p.t) === "stale");
    const podium = rows.filter(tier);
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
    return [
      header("Results", "inv_misc_coin_01", shareBox),
      pending.length ? el("div", { class: "warn" }, "Not evaluated yet: ", el("span", { class: "step-links" }, stepLinks(pending))) : null,
      changed.length ? el("div", { class: "warn" }, "Changed since the last trainer run — specs marked “re-check” score 0 there until you re-run: ", el("span", { class: "step-links" }, stepLinks(changed))) : null,
      podium.length
        ? el("div", { class: "podium" }, podium.map((r) =>
            el("div", { class: `loot ${tier(r)}`, dataset: { spec: r.spec.id } },
              icon(r.spec.icon, "xl"),
              el("div", { class: "loot-text" },
                el("div", { class: "loot-tier" }, tier(r) === "main" ? "Main candidate" : "Alt candidate"),
                specLabel(r.spec),
                el("div", { class: "muted small" }, r.spec.role),
              ),
              el("div", { class: "loot-pts" }, r.total, el("small", {}, "pts")),
            ),
          ))
        : null,
      el("div", { class: "panel table-wrap" },
        el("table", { class: "results" },
          el("thead", {}, el("tr", {},
            el("th", {}, "#"), el("th", {}, "Class / spec"), el("th", {}, "Total"),
            state.picked.map((p) => el("th", { class: "ct-col" }, icon(CT[p.id].icon, "sm"), el("div", {}, CT[p.id].label), el("div", { class: "muted small" }, `×${p.weight}`))),
          )),
          el("tbody", {}, rows.map((r, i) =>
            el("tr", { class: r.total === 0 ? "zero" : tier(r) ?? "" },
              el("td", { class: "muted" }, i + 1),
              el("td", { dataset: { spec: r.spec.id } }, el("span", { class: "spec-cell" }, icon(r.spec.icon, "sm"), specLabel(r.spec))),
              el("td", { class: "num" }, r.total),
              r.cells.map((c) =>
                el("td", { class: "cell" },
                  c.status === "skipped" ? el("span", { class: "muted small" }, "skipped")
                    : c.status === "pending" ? el("span", { class: "muted" }, "—")
                    : c.recheck ? el("span", { class: "recheck small", title: "Joined your pool after the last trainer run" }, "re-check")
                    : [el("span", { class: c.ok ? "ok" : "bad" }, c.ok ? "✓" : "✗"), " ", el("span", { class: "muted small" }, pct(c.p))],
                ),
              ),
            ),
          )),
        ),
      ),
    ];
  },
};

const STATUS_LABEL = {
  pending: "not evaluated",
  evaluated: "evaluated",
  stale: "answers or pool changed — consult the trainer again",
  skipped: "skipped",
};

const MAX_ANSWER_CHARS = 500; // the Worker's limit per answer

function renderTexture(ctId) {
  const ct = CT[ctId];
  const t = textureOf(ctId);
  const weight = state.picked.find((p) => p.id === ctId).weight;
  const status = statusOf(t);
  const badge = el("span", { class: `badge ${status}` }, STATUS_LABEL[status]);
  const markStale = () => {
    save();
    if (t.status !== "evaluated") return;
    t.status = "stale";
    badge.className = "badge stale";
    badge.textContent = STATUS_LABEL.stale;
    nav.querySelector(".nav-item.active .dot").className = "dot stale";
  };

  const ask = async () => {
    t.error = null;
    t.override = {};
    const specIds = basePool().map((s) => s.id);
    if (!t.answers.some((a) => a.trim()) && !t.choices.some((c) => c.length)) {
      t.pExcl = {};
      t.judged = specIds;
      t.status = "evaluated";
      return render();
    }
    const here = () => state.step === `ct:${ctId}`;
    t.loading = true;
    render();
    try {
      t.pExcl = await judge(ctId, t.answers, t.choices, specIds, (phase) => {
        t.phase = phase;
        if (here()) render();
      });
      t.judged = specIds;
      t.status = "evaluated";
    } catch (e) {
      if (!e.cancelled) t.error = e.message;
    } finally {
      t.loading = false;
      t.phase = null;
      if (here()) render();
      else save();
    }
  };

  // octy's narrow-match (Y) and exclude (X) ratings of a spec for the chosen preset answers.
  const octyNotes = (s) =>
    ct.items.flatMap((it, i) =>
      t.choices[i].flatMap((opt) => {
        const r = octyRatings(it.q, opt)[s.id];
        return r === "X" || r === "Y" ? [{ r, text: `${it.q} → ${opt}` }] : [];
      }),
    );

  const textarea = (i, placeholder) =>
    el("textarea", {
      rows: 2,
      maxLength: MAX_ANSWER_CHARS,
      value: t.answers[i],
      placeholder,
      oninput: (e) => {
        t.answers[i] = e.target.value;
        markStale();
      },
    });

  // Questions with preset answers hide their free-text box behind a link until it's wanted.
  const detail = (i) => {
    if (t.answers[i]) return textarea(i, "Add detail (optional)");
    return el("button", {
      class: "add-detail",
      onclick: (e) => {
        const box = textarea(i, "Add detail (optional)");
        e.currentTarget.replaceWith(box);
        box.focus();
      },
    }, "+ add detail");
  };

  // An answer octy rates ✗ for every spec still in the pool contradicts the earlier funnel steps
  // (e.g. a magic school after picking Physical only), so it can't be picked.
  const pool = basePool();
  const rulesOutPool = (q, opt) => {
    const ratings = octyRatings(q, opt);
    return pool.every((s) => ratings[s.id] === "X");
  };

  const question = (it, i) => {
    const options = TEXTURE_OPTIONS[it.q];
    if (!options) return el("label", { class: "q" }, el("span", {}, it.q), textarea(i));
    return el("div", { class: "q" }, el("span", {}, it.q),
      el("div", { class: "chips" }, Object.keys(options).map((opt) => {
        const on = t.choices[i].includes(opt);
        const contradicts = rulesOutPool(it.q, opt);
        return el("button", {
          class: `chip${on ? " on" : ""}`,
          "aria-pressed": String(on),
          // A chosen chip stays clickable so it can be removed if the pool changed after it was picked.
          disabled: contradicts && !on,
          title: contradicts ? "octy rates every spec left in your pool ✗ for this answer" : null,
          onclick: (e) => {
            const chosen = t.choices[i];
            const at = chosen.indexOf(opt);
            if (at === -1) chosen.push(opt);
            else chosen.splice(at, 1);
            e.currentTarget.classList.toggle("on", at === -1);
            e.currentTarget.setAttribute("aria-pressed", String(at === -1));
            e.currentTarget.disabled = contradicts && at !== -1;
            markStale();
          },
        }, opt);
      })),
      detail(i),
    );
  };

  return [
    header(ct.label, ct.icon,
      el("div", { class: "head-meta" }, el("span", { class: "weight-pill" }, `weight ×${weight}`), badge),
      ct.examples.length ? el("div", { class: "examples-links" }, ct.examples.map((x) => watch(x.t, `${x.who}'s take`))) : null,
    ),
    ct.tip ? el("p", { class: "tip" }, ct.tip) : null,
    el("div", { class: "parchment" },
      el("p", { class: "parchment-intro" }, "Answer what you have opinions on; leave the rest blank. Pick any of octy's preset answers that fit and add detail in your own words — the trainer weighs both and only turns away specs that clash with them."),
      ct.items.map((it, i) => (it.hint ? el("p", { class: "hint" }, it.hint) : question(it, i))),
    ),
    el("div", { class: "actions" },
      el("button", { class: "primary", disabled: t.loading, onclick: ask }, ASK_LABEL[t.loading ? t.phase ?? "checking" : "idle"]),
      el("button", { disabled: t.loading, onclick: () => { t.status = "skipped"; render(); } }, "Skip this content type"),
    ),
    t.error
      ? el("div", { class: "error" }, t.error, " ", el("button", { class: "mini", onclick: ask }, "Try again"))
      : null,
    counted(t)
      ? el("div", { class: "panel verdicts" },
          el("p", { class: "muted small" }, "Bar = P(excluded). ✗/~ = octy's exclude / narrow-match ratings for your preset answers. Click a spec to override the trainer."),
          basePool().map((s) => {
            const ok = survived(t, s.id);
            const recheck = unjudged(t, s.id);
            const p = t.pExcl[s.id];
            return el("button", {
              class: `verdict${ok ? "" : " excluded"}`,
              dataset: { spec: s.id },
              onclick: () => { t.override[s.id] = !ok; render(); },
            },
              icon(s.icon, "sm"),
              el("span", { class: "verdict-name" }, specLabel(s), octyTally(octyNotes(s))),
              el("span", { class: "bar" }, el("span", { style: `width:${(p ?? 0) * 100}%` })),
              el("span", { class: "pct" }, pct(p)),
              recheck
                ? el("span", { class: "badge stale", title: "Joined your pool after the last trainer run" }, "re-check")
                : el("span", { class: `badge ${ok ? "kept" : "excluded"}` }, ok ? "kept" : "excluded", s.id in t.override ? " (override)" : ""),
            );
          }),
        )
      : null,
  ];
}

const ASK_LABEL = {
  idle: "Consult the Trainer",
  checking: "Checking you're human…",
  human: "Confirm you're human to continue…",
  trainer: "The trainer ponders…",
};

function octyTally(notes) {
  if (!notes.length) return null;
  const n = (r) => notes.filter((x) => x.r === r).length;
  const parts = [n("X") && `${n("X")} ✗`, n("Y") && `${n("Y")} ~`].filter(Boolean);
  const title = notes.map((x) => `${x.r === "X" ? "✗ exclude" : "~ narrow"}: ${x.text}`).join("\n");
  return el("span", { class: "octy-tally", title }, `octy ${parts.join(" ")}`);
}

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
