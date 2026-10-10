// Direct TypeSafe System One calls for offline scripts (the site goes through the Worker instead).
// Reads TYPESAFE_API_KEY from the environment or .dev.vars.
import { readFileSync } from "node:fs";

const KEY = process.env.TYPESAFE_API_KEY ?? readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^TYPESAFE_API_KEY=(.*)$/m)[1].trim();

export const usage = { calls: 0, tokens: 0 };
export const costOf = (tokens) => (tokens / 1e6) * 0.042;

// Returns the response's `answers`, retrying rate limits and overload.
export async function jev(body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
    const json = await res.json();
    usage.tokens += json.usage.input_tokens;
    usage.calls++;
    return json.answers;
  }
}

// Maps items through fn with at most `concurrency` calls in flight, keeping order.
export async function pool(items, fn, concurrency = 4) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}
