// Futureproofer, background and unforced: quietly fetches newer MDFM content (engine, ads and the look) from the public repo,
// checks it before keeping it, and never forces anything. Turn it off in Settings; "Use bundled" rolls back.
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { getJSON } = require("../common/net");
const { cmpVersion } = require("../common/live-parse");
const { writeAtomic } = require("../common/write-atomic");
const RAW = "https://raw.githubusercontent.com/Octoroboto/mdfm/main/";
const REL = "https://api.github.com/repos/Octoroboto/mdfm/releases?per_page=20";
// A content update is the whole radio page (engine + ads + look), built by "npm run build" in the mdfm repo.
function inlineScripts(html) { return [...html.matchAll(/<script(?: id="([^"]*)")?>([\s\S]*?)<\/script>/g)].map(m => ({ id: m[1] || "", code: m[2] })); }
function validateEngine(html, version) {
  if (typeof html !== "string" || html.length < 100000 || html.length > 16e6) return "unexpected size";   // 16 MB: the page carries every skin (about 7 MB of it) and grows with stations
  if (!html.includes(`<meta name="mdfm-version" content="${version}">`)) return "version mismatch";
  for (const id of ["mdfm-lib", "mdfm-skin-js", "mdfm-radio-wire"]) if (!html.includes(`<script id="${id}">`)) return "missing " + id;
  if (!html.includes('<style id="mdfm-skin">')) return "missing skin";
  if (/<script[^>]+src=/i.test(html)) return "external script not allowed";
  const lib = inlineScripts(html).find(s => s.id === "mdfm-lib");
  if (!lib || !lib.code.includes(`MDFM ${version}:`)) return "engine version mismatch";
  for (const k of ["createMDFM", "setProviders", "getSpectrum", "caption"]) if (!lib.code.includes(k)) return "engine missing " + k;
  for (const s of inlineScripts(html)) { try { new vm.Script(s.code, { filename: s.id || "inline.js" }); } catch (e) { return `${s.id || "script"} does not parse: ${e.message}`; } }
  return null;
}
function createUpdater({ app, getSettings, bundledDir, appVersion, onEngine, onStatus }) {
  const dir = path.join(app.getPath("userData"), "engines");
  const status = { engine: null, lastCheck: null, result: "not checked yet", appUpdate: null };
  const say = () => onStatus && onStatus({ ...status });
  function bundled() { const v = JSON.parse(fs.readFileSync(path.join(bundledDir, "version.json"), "utf8")).version; return { version: v, file: path.join(bundledDir, "radio.html"), source: "bundled" }; }
  function cached() {
    try { return fs.readdirSync(dir).filter(v => /^\d+\.\d+\.\d+$/.test(v) && fs.existsSync(path.join(dir, v, "radio.html"))).sort(cmpVersion).reverse()
      .map(v => ({ version: v, file: path.join(dir, v, "radio.html"), source: "updated" })); } catch { return []; }
  }
  function active() {
    const b = bundled(), s = getSettings();
    if (s.useBundled || !s.contentUpdates) return b;
    const c = cached()[0];
    return c && cmpVersion(c.version, b.version) > 0 ? c : b;
  }
  // Old content is let go: the newest `keep` copies stay (plus the one in use), so each release doesn't leave ~9 MB behind.
  function prune(keep = 2) {
    const inUse = active().version;
    for (const c of cached().slice(keep)) if (c.version !== inUse) { try { fs.rmSync(path.join(dir, c.version), { recursive: true, force: true }); } catch {} }
  }
  // One check at a time: the launch check and Futureproofer's can overlap; the second joins the first.
  let checking = null;
  const checkContent = () => checking || (checking = doCheckContent().finally(() => { checking = null; }));
  async function doCheckContent() {
    if (!getSettings().contentUpdates) { status.result = "off in Settings"; say(); return; }
    status.lastCheck = new Date().toISOString();
    try {
      const pkg = await getJSON(RAW + "package.json"), cur = active();
      if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version || "")) || cmpVersion(pkg.version, cur.version) <= 0) { status.result = `up to date (${cur.version})`; say(); return; }
      const code = await getJSON(RAW + "dist/radio.html", { text: true, timeout: 30000, maxBytes: 20e6 });
      const bad = validateEngine(code, pkg.version);
      if (bad) { status.result = `skipped ${pkg.version}: ${bad}`; say(); return; }
      const d = path.join(dir, pkg.version);
      writeAtomic(path.join(d, "radio.html"), code);
      writeAtomic(path.join(d, "sha256.txt"), crypto.createHash("sha256").update(code).digest("hex"));
      status.result = `got ${pkg.version}`; prune(); say(); onEngine && onEngine(active());
    } catch (e) { status.result = "check failed: " + e.message; say(); }
  }
  async function checkApp() {
    try {
      const rels = await getJSON(REL);
      const best = rels.filter(r => !r.draft && !r.prerelease && /^radio-v/.test(r.tag_name)).sort((a, b) => cmpVersion(b.tag_name, a.tag_name))[0];
      const want = process.arch === "arm64" ? /arm64/i : /^(?!.*arm64).*\.dmg$/i;   // the .dmg for this Mac's chip
      const dmg = best && (best.assets || []).find(a => /\.dmg$/i.test(a.name) && want.test(a.name));
      status.appUpdate = best && cmpVersion(best.tag_name, appVersion) > 0 ? { version: best.tag_name.replace(/^radio-v/, ""), url: best.html_url, download: dmg ? dmg.browser_download_url : null } : null;
    } catch { /* stays as it was */ }
    say();
  }
  // Futureproofer schedules the checks (src/main/futureproof.js); this only reports what's active.
  function start() { status.engine = active(); say(); }
  return { start, active, checkContent, checkApp, status, validateEngine, prune };
}
module.exports = { createUpdater, validateEngine, inlineScripts };
