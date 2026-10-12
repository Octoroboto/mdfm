// The one file in the app that sends requests. Every request is checked by Bouncer first; without a running
// Bouncer nothing leaves (tests excepted). Keep a test that fails if any other file calls fetch/https directly.
// Copy to src/main/egress.js, then list the hosts the app needs in ALLOWED (Bouncer's rules are the real gate).
const ALLOWED = new Set(["raw.githubusercontent.com", "registry.npmjs.org", "api.osv.dev"]);
let bouncer = null;
function useBouncer(b) { bouncer = b; }
function gate(url, method, body, contentType) {
  if (bouncer) { bouncer.assert({ url: String(url), method, body, contentType }, "app"); return; }
  if (process.env.APP_TEST === "1") return;
  throw Object.assign(new Error("Bouncer is not running, so the app is not allowed to send requests."), { code: "BOUNCED" });
}
function check(url) { const u = new URL(url); if (u.protocol !== "https:" || !ALLOWED.has(u.hostname)) throw new Error("blocked host: " + u.hostname); return u; }
async function getJSON(url, { timeout = 8000, text = false } = {}) {
  const u = check(url); gate(u, "GET");
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(u, { signal: ac.signal, redirect: "error", headers: { accept: text ? "*/*" : "application/json" } });
    if (!r.ok) throw new Error(`${u.hostname} ${r.status}`);
    return text ? await r.text() : await r.json();
  } finally { clearTimeout(t); }
}
async function postJSON(url, body, { timeout = 10000 } = {}) {
  const u = check(url), text = JSON.stringify(body); gate(u, "POST", text, "application/json");
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(u, { method: "POST", body: text, signal: ac.signal, redirect: "error", headers: { "content-type": "application/json", accept: "application/json" } });
    if (!r.ok) throw new Error(`${u.hostname} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
module.exports = { getJSON, postJSON, useBouncer, ALLOWED };
