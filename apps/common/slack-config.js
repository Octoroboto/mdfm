// Where the Slack sign-in helper lives. Checked in this order:
//   1. this Mac's own setting (written by the builder's "Set up Slack" wizard),
//   2. the app's package.json (mdfm.slackRelay),
//   3. the mdfm repo's config/slack.json, fetched from GitHub and kept, so pushing that one file switches Slack on for every
//      installed app without an app release.
const fs = require("fs"), path = require("path");
const CONFIG_URL = "https://raw.githubusercontent.com/Octoroboto/mdfm/main/config/slack.json";

// A helper address must be a plain https origin (no path, query or credentials). (pure; tested)
function validRelay(v) {
  if (typeof v !== "string" || !v) return false;
  let u; try { u = new URL(v); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash && /\.workers\.dev$|\.[a-z]{2,}$/.test(u.hostname);
}
const origin = v => new URL(v).origin;

function createSlackConfig({ dataDir, getJSON, packaged = "", getOverride = () => "" }) {
  const file = path.join(dataDir, "slack-config.json");
  let remote = ""; try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (validRelay(j.relay)) remote = origin(j.relay); } catch {}
  const status = { source: null, lastCheck: null, result: "not checked yet" };
  function relay() {
    const o = getOverride(); if (validRelay(o)) { status.source = "this Mac"; return origin(o); }
    if (validRelay(packaged)) { status.source = "the app"; return origin(packaged); }
    if (remote) { status.source = "MedDev"; return remote; }
    status.source = null; return "";
  }
  async function refresh() {
    status.lastCheck = new Date().toISOString();
    try {
      const j = await getJSON(CONFIG_URL);
      if (j && validRelay(j.relay)) { remote = origin(j.relay); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ relay: remote })); status.result = "ok"; }
      else status.result = "not switched on yet";
    } catch (e) { status.result = /404/.test(e.message) ? "not switched on yet" : "check failed: " + e.message; }
    return relay();
  }
  return { relay, refresh, status };
}

module.exports = { createSlackConfig, validRelay, CONFIG_URL };
