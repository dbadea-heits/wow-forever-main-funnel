// Browser storage and share-link encoding for the funnel's snapshot. The snapshot's shape belongs to app.js.

const KEY = "wow-forever-funnel";

export function saveLocal(snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or disabled (private mode): the funnel still works, it just won't survive a reload.
  }
}

export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
}

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromBase64Url = (text) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

// gzip + base64url, so a full funnel fits comfortably in a URL fragment.
export async function encodeShare(snapshot) {
  const stream = new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream("gzip"));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeShare(code) {
  const stream = new Blob([fromBase64Url(code)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
