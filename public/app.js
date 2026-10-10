import { VIDEO_URL, VIDEO_TITLE, CHANNEL, EXAMPLES, CLASSES, SPECS, FUNDAMENTALS, CONTENT_TYPES, DEFAULT_WEIGHTS } from "./data.js";
import { judge, EXCLUDE_THRESHOLD } from "./jev.js";

const CT = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c]));
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s]));

const state = {
  step: "intro",
  sel: Object.fromEntries(FUNDAMENTALS.map((f) => [f.key, new Set(f.options)])),
  picked: [], // [{id, weight}] in rank order
  manualExcl: new Set(),
  texture: {}, // ctId -> {answers: string[], status, pExcl, override, error, loading}
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
    status: "pending",
    pExcl: {},
    override: {},
    error: null,
    loading: false,
  });
}

function survived(t, specId) {
  if (specId in t.override) return t.override[specId];
  const p = t.pExcl[specId];
  return p === undefined || p < EXCLUDE_THRESHOLD;
}

function scores() {
  return basePool()
    .map((s) => {
      const cells = state.picked.map(({ id, weight }) => {
        const t = textureOf(id);
        const counted = t.status === "evaluated" || t.status === "stale";
        const ok = counted && survived(t, s.id);
        return { status: t.status, ok, p: t.pExcl[s.id], pts: ok ? weight : 0 };
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

const icon = (name, cls = "") => el("img", { class: `icon ${cls}`, src: `assets/icons/${name}.jpg`, alt: "", loading: "lazy" });

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
          onclick: () => go(s.id),
        },
        icon(s.icon, "sm"),
        el("span", { class: "grow" }, s.label),
        s.ct ? el("span", { class: `dot ${textureOf(s.ct).status}`, title: textureOf(s.ct).status }) : null,
      ),
    ),
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
}

function go(id) {
  state.step = id;
  render();
  window.scrollTo(0, 0);
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
    const move = (i, d) => {
      const [x] = state.picked.splice(i, 1);
      state.picked.splice(i + d, 0, x);
      render();
    };
    return [
      header("Content types", "inv_misc_note_06",
        el("p", { class: "muted" }, "Pick what you'll play, then rank it. Weights default to octy's 3 / 2 / 1 / 0.5. ", watch(336))),
      el("div", { class: "cols" },
        el("div", { class: "panel" },
          el("h3", {}, "Available"),
          el("div", { class: "ct-grid" }, CONTENT_TYPES.filter((c) => !pickedIds.has(c.id)).map((c) =>
            el("button", {
              class: "ct-tile",
              title: `Add ${c.label}`,
              onclick: () => {
                state.picked.push({ id: c.id, weight: DEFAULT_WEIGHTS[Math.min(state.picked.length, 3)] });
                render();
              },
            }, icon(c.icon), el("span", {}, c.label), el("span", { class: "add" }, "+")),
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
              el("label", { class: "weight" }, "×",
                el("input", {
                  type: "number", step: "0.5", min: "0", value: p.weight,
                  onchange: (e) => { p.weight = Math.max(0, Number(e.target.value) || 0); },
                })),
              el("button", { class: "mini", disabled: i === 0, onclick: () => move(i, -1), title: "Up" }, "↑"),
              el("button", { class: "mini", disabled: i === state.picked.length - 1, onclick: () => move(i, 1), title: "Down" }, "↓"),
              el("button", { class: "mini", onclick: () => { state.picked.splice(i, 1); render(); }, title: "Remove" }, "✕"),
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
    const rows = scores();
    const distinct = [...new Set(rows.map((r) => r.total).filter((t) => t > 0))];
    const [mainPts, ...altPts] = distinct;
    const alts = new Set(altPts.slice(0, 2));
    const tier = (r) => (r.total === mainPts ? "main" : alts.has(r.total) ? "alt" : null);
    const pending = state.picked.filter((p) => textureOf(p.id).status === "pending").map((p) => CT[p.id].label);
    const podium = rows.filter(tier);
    return [
      header("Results", "inv_misc_coin_01"),
      pending.length ? el("div", { class: "warn" }, `Not evaluated yet: ${pending.join(", ")}`) : null,
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
  stale: "answers changed — consult the trainer again",
  skipped: "skipped",
};

function renderTexture(ctId) {
  const ct = CT[ctId];
  const t = textureOf(ctId);
  const weight = state.picked.find((p) => p.id === ctId).weight;
  const badge = el("span", { class: `badge ${t.status}` }, STATUS_LABEL[t.status]);

  const ask = async () => {
    t.error = null;
    t.override = {};
    if (!t.answers.some((a) => a.trim())) {
      t.pExcl = {};
      t.status = "evaluated";
      return render();
    }
    t.loading = true;
    render();
    try {
      t.pExcl = await judge(ctId, t.answers, basePool().map((s) => s.id));
      t.status = "evaluated";
    } catch (e) {
      t.error = e.message;
    } finally {
      t.loading = false;
      if (state.step === `ct:${ctId}`) render();
    }
  };

  return [
    header(ct.label, ct.icon,
      el("div", { class: "head-meta" }, el("span", { class: "weight-pill" }, `weight ×${weight}`), badge),
      ct.examples.length ? el("div", { class: "examples-links" }, ct.examples.map((x) => watch(x.t, `${x.who}'s take`))) : null,
    ),
    ct.tip ? el("p", { class: "tip" }, ct.tip) : null,
    el("div", { class: "parchment" },
      el("p", { class: "parchment-intro" }, "Answer what you have opinions on; leave the rest blank. The trainer only turns away specs that clash with what you write."),
      ct.items.map((it, i) =>
        it.hint
          ? el("p", { class: "hint" }, it.hint)
          : el("label", { class: "q" }, el("span", {}, it.q),
              el("textarea", {
                rows: 2,
                value: t.answers[i],
                oninput: (e) => {
                  t.answers[i] = e.target.value;
                  if (t.status === "evaluated") {
                    t.status = "stale";
                    badge.className = "badge stale";
                    badge.textContent = STATUS_LABEL.stale;
                    nav.querySelector(".nav-item.active .dot").className = "dot stale";
                  }
                },
              })),
      ),
    ),
    el("div", { class: "actions" },
      el("button", { class: "primary", disabled: t.loading, onclick: ask }, t.loading ? "The trainer ponders…" : "Consult the Trainer"),
      el("button", { disabled: t.loading, onclick: () => { t.status = "skipped"; render(); } }, "Skip this content type"),
    ),
    t.error ? el("div", { class: "error" }, t.error) : null,
    t.status === "evaluated" || t.status === "stale"
      ? el("div", { class: "panel verdicts" },
          el("p", { class: "muted small" }, "Bar = P(excluded). Click a spec to override the trainer."),
          basePool().map((s) => {
            const ok = survived(t, s.id);
            const p = t.pExcl[s.id];
            return el("button", {
              class: `verdict${ok ? "" : " excluded"}`,
              dataset: { spec: s.id },
              onclick: () => { t.override[s.id] = !ok; render(); },
            },
              icon(s.icon, "sm"),
              specLabel(s),
              el("span", { class: "bar" }, el("span", { style: `width:${(p ?? 0) * 100}%` })),
              el("span", { class: "pct" }, pct(p)),
              el("span", { class: `badge ${ok ? "kept" : "excluded"}` }, ok ? "kept" : "excluded", s.id in t.override ? " (override)" : ""),
            );
          }),
        )
      : null,
  ];
}

render();
