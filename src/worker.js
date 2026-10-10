import { DurableObject } from "cloudflare:workers";
import { SPECS, CONTENT_TYPES } from "../public/data.js";
import { buildRequest } from "./prompt.js";

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_BODY_BYTES = 34_000; // 14 answers × 500 chars, worst-case JSON escaping, spec ids, Turnstile token
const MAX_ANSWER_CHARS = 500;
const MAX_TOKEN_CHARS = 2048;
const UPSTREAM_TIMEOUT_MS = 60_000;

const CT = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c]));
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s]));

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Request body: {contentType: id, answers: string[] aligned to CONTENT_TYPES[].items, specIds: string[], token: Turnstile token}.
// Returns {contentType, answers: [{q, answer}], specs, token} or an error string.
function parseJudgeRequest(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return "body must be JSON";
  }
  const ct = CT[body?.contentType];
  if (!ct) return "unknown contentType";
  const { answers, specIds } = body;
  if (!Array.isArray(answers) || answers.length !== ct.items.length) return "answers must align with the content type's items";
  if (!answers.every((a) => typeof a === "string" && a.length <= MAX_ANSWER_CHARS)) return `answers must be strings of at most ${MAX_ANSWER_CHARS} chars`;
  if (!Array.isArray(specIds) || specIds.length === 0 || new Set(specIds).size !== specIds.length || !specIds.every((id) => SPEC[id]))
    return "specIds must be a non-empty list of unique known spec ids";
  if (typeof body.token !== "string" || !body.token || body.token.length > MAX_TOKEN_CHARS) return "missing human check token";
  const qa = ct.items.map((it, i) => ({ q: it.q, answer: answers[i] })).filter((a) => a.q);
  if (!qa.some((a) => a.answer.trim())) return "no answers given";
  return { contentType: ct, answers: qa, specs: specIds.map((id) => SPEC[id]), token: body.token };
}

// Cross-site pages can POST text/plain without a CORS preflight. Requiring JSON forces a preflight,
// which this Worker never grants; Sec-Fetch-Site rejects cross-site browser requests outright.
function isSameOriginJson(request) {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const site = request.headers.get("Sec-Fetch-Site");
  return type === "application/json" && (site === null || site === "same-origin");
}

async function isHuman(token, ip, env) {
  const res = await fetch(SITEVERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
  return (await res.json()).success === true;
}

async function judge(request, env) {
  if (!env.TURNSTILE_SECRET) return json(500, { error: "server misconfigured: TURNSTILE_SECRET is not set" });
  if (!isSameOriginJson(request)) return json(403, { error: "cross-origin requests are not allowed" });

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await env.IP_LIMITER.limit({ key: ip })).success)
    return json(429, { error: "Slow down — too many requests. Try again in a minute." });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "request too large" });
  const parsed = parseJudgeRequest(raw);
  if (typeof parsed === "string") return json(400, { error: parsed });

  try {
    if (!(await isHuman(parsed.token, ip, env))) return json(403, { error: "Human check failed — please try again." });
  } catch (e) {
    console.error("turnstile", e.message);
    return json(502, { error: "Human check unavailable — try again shortly." });
  }

  const budget = env.BUDGET.get(env.BUDGET.idFromName("global"));
  if (!(await budget.take(Number(env.DAILY_LIMIT))))
    return json(503, { error: "The trainer has seen enough students today. Use the manual kept/excluded toggles, or come back tomorrow (resets 00:00 UTC)." });

  let res;
  try {
    res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(parsed.contentType, parsed.answers, parsed.specs)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    await budget.refund();
    console.error("typesafe unreachable", e.message);
    return json(502, { error: "The trainer is unreachable — try again shortly." });
  }
  if (!res.ok) {
    await budget.refund();
    console.error("typesafe", res.status, await res.text());
    return json(502, { error: `The trainer is unavailable (${res.status}) — try again shortly.` });
  }
  const { answers } = await res.json();
  return json(200, { pExcl: Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.noul])) });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/config") {
      if (!env.TURNSTILE_SITE_KEY) return json(500, { error: "server misconfigured: TURNSTILE_SITE_KEY is not set" });
      return json(200, { turnstileSiteKey: env.TURNSTILE_SITE_KEY });
    }
    if (pathname !== "/api/judge") return json(404, { error: "not found" });
    if (request.method !== "POST") return json(405, { error: "POST only" });
    return judge(request, env);
  },
};

const today = () => new Date().toISOString().slice(0, 10);

// One global instance: an exact count of Jev calls per UTC day. Failed upstream calls are refunded.
export class DailyBudget extends DurableObject {
  async take(limit) {
    const day = today();
    const cur = (await this.ctx.storage.get("usage")) ?? { day, count: 0 };
    const count = cur.day === day ? cur.count : 0;
    if (count >= limit) return false;
    await this.ctx.storage.put("usage", { day, count: count + 1 });
    return true;
  }

  async refund() {
    const cur = await this.ctx.storage.get("usage");
    if (cur?.day === today() && cur.count > 0) await this.ctx.storage.put("usage", { day: cur.day, count: cur.count - 1 });
  }
}
