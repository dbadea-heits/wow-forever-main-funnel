// Jev client. The Worker at /api/judge builds the prompt, verifies the Turnstile token, and holds the TypeSafe key.

export const EXCLUDE_THRESHOLD = 0.5;

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const CHECK_TIMEOUT_MS = 20_000; // silent check, before Cloudflare asks the visitor to interact
const INTERACTIVE_TIMEOUT_MS = 90_000; // once the visitor is shown the challenge
const REQUEST_TIMEOUT_MS = 30_000;

let sitekey; // Promise<string>; cleared on failure so the next ask retries setup
let active; // the human check in progress: {cancel}

function loadTurnstile() {
  sitekey ??= (async () => {
    const res = await fetch("/api/config");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `config request failed (${res.status})`);
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the human check (challenges.cloudflare.com)."));
      document.head.append(script);
    });
    return body.turnstileSiteKey;
  })().catch((e) => {
    sitekey = undefined;
    throw e;
  });
  return sitekey;
}

const cancelled = () => Object.assign(new Error("Human check cancelled."), { cancelled: true });

// Stops the human check in progress (e.g. the visitor left the step); its judge() call rejects with `cancelled`.
export function cancelHumanCheck() {
  active?.cancel();
}

// Tokens are single-use, so every call renders a fresh widget and removes it afterwards. The #turnstile dialog
// only opens when Cloudflare needs the visitor to interact.
async function humanToken(onPhase) {
  cancelHumanCheck();
  const key = await loadTurnstile();
  const dialog = document.getElementById("turnstile");
  return new Promise((resolve, reject) => {
    let done = false;
    let timer;
    let widgetId;
    const finish = (settle, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      dialog.hidden = true;
      active = undefined;
      // Removing a widget from inside its own callback is deferred so Turnstile can finish the callback first.
      setTimeout(() => widgetId !== undefined && turnstile.remove(widgetId));
      settle(value);
    };
    const expireIn = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(reject, new Error("The human check timed out.")), ms);
    };
    active = { cancel: () => finish(reject, cancelled()) };
    dialog.querySelector(".human-check-cancel").onclick = active.cancel;
    expireIn(CHECK_TIMEOUT_MS);
    widgetId = turnstile.render(dialog.querySelector(".human-check-slot"), {
      sitekey: key,
      appearance: "interaction-only",
      theme: "dark",
      callback: (token) => finish(resolve, token),
      "error-callback": (code) => {
        finish(reject, new Error(`The human check failed (${code}).`));
        return true; // handled; stops Turnstile from also throwing
      },
      "timeout-callback": () => finish(reject, new Error("The human check timed out.")),
      "before-interactive-callback": () => {
        dialog.hidden = false;
        expireIn(INTERACTIVE_TIMEOUT_MS);
        onPhase("human");
      },
      "after-interactive-callback": () => onPhase("checking"),
    });
  });
}

// answers: strings and choices: chosen preset answers, both aligned to the content type's items.
// onPhase(phase) reports progress: "human" (visitor must complete the check), "checking", "trainer".
// Returns {specId: P(excluded)}.
export async function judge(contentType, answers, choices, specIds, onPhase) {
  onPhase("checking");
  const token = await humanToken(onPhase);
  onPhase("trainer");
  let res;
  try {
    res = await fetch("/api/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, answers, choices, specIds, token }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? "The trainer took too long to answer." : `Could not reach the trainer: ${e.message}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.pExcl;
}
