// Jev client. The Worker at /api/judge builds the prompt, verifies the Turnstile token, and holds the TypeSafe key.

export const EXCLUDE_THRESHOLD = 0.5;

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let widget; // Promise<widgetId>; cleared on failure so the next ask retries setup
let pending; // {resolve, reject} of the challenge in flight
let queue = Promise.resolve(); // one challenge at a time: the widget has a single callback

function setupWidget() {
  widget ??= (async () => {
    const res = await fetch("/api/config");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `config request failed (${res.status})`);
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the human check (challenges.cloudflare.com)"));
      document.head.append(script);
    });
    return turnstile.render("#turnstile", {
      sitekey: body.turnstileSiteKey,
      execution: "execute",
      appearance: "interaction-only",
      theme: "dark",
      callback: (token) => pending.resolve(token),
      "error-callback": (code) => pending.reject(new Error(`Human check failed (${code}) — try again`)),
      "timeout-callback": () => pending.reject(new Error("Human check timed out — try again")),
    });
  })().catch((e) => {
    widget = undefined;
    throw e;
  });
  return widget;
}

// Tokens are single-use, so every judge call runs a fresh challenge.
function humanToken() {
  const next = queue.then(async () => {
    const id = await setupWidget();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      turnstile.reset(id);
      turnstile.execute(id);
    });
  });
  queue = next.catch(() => {});
  return next;
}

// answers: strings aligned to the content type's items. Returns {specId: P(excluded)}.
export async function judge(contentType, answers, specIds) {
  const token = await humanToken();
  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, answers, specIds, token }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.pExcl;
}
