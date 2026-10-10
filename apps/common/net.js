// Every outbound request goes through here. Only these hosts, only GET, short timeouts. Nothing else leaves the app.
// slack.com is only called when the person has connected Slack (read-only: channel history, channel list, user names).
const ALLOWED = new Set(["registry.npmjs.org", "api.osv.dev", "api.open-meteo.com", "geocoding-api.open-meteo.com", "api.bigdatacloud.net", "ipwho.is", "get.geojs.io", "site.api.espn.com",
  "raw.githubusercontent.com", "api.github.com", "slack.com"]);
// Bouncer (the app's Cedar rules) checks every request here first. Without it, nothing leaves (tests excepted).
let bouncer = null;
function useBouncer(b) { bouncer = b; }
function gate(url) {
  if (bouncer) { bouncer.assert({ url: String(url), method: "GET" }, "app"); return; }
  if (process.env.MDFM_TEST === "1") return;
  throw Object.assign(new Error("Bouncer is not running, so the app is not allowed to send requests."), { code: "BOUNCED" });
}
async function getJSON(url, { timeout = 8000, text = false, token = null } = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname)) throw new Error("blocked host: " + u.hostname);
  gate(u);
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(u, { signal: ac.signal, redirect: "error", headers: { "user-agent": "MDFM-Radio", accept: text ? "*/*" : "application/json", ...(token ? { authorization: "Bearer " + token } : {}) } });
    if (!r.ok) throw new Error(`${u.hostname} ${r.status}`);
    return text ? await r.text() : await r.json();
  } finally { clearTimeout(t); }
}
// The one POST the app makes: asking OSV (Google's open vulnerability database) about the app's own package versions.
async function postJSON(url, body, { timeout = 10000 } = {}) {
  const u = new URL(url), text = JSON.stringify(body);
  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname)) throw new Error("blocked host: " + u.hostname);
  if (bouncer) bouncer.assert({ url: String(u), method: "POST", body: text, contentType: "application/json" }, "app");
  else if (process.env.MDFM_TEST !== "1") throw Object.assign(new Error("Bouncer is not running, so the app is not allowed to send requests."), { code: "BOUNCED" });
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(u, { method: "POST", body: text, signal: ac.signal, redirect: "error", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "MDFM-Radio" } });
    if (!r.ok) throw new Error(`${u.hostname} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
module.exports = { getJSON, postJSON, ALLOWED, useBouncer };
