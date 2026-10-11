// MedDev Receiver live updater for Electron apps (CommonJS, no dependencies).
// Checks this repo's dist/manifest.json, downloads a newer receiver.css + receiver.js, checks them, keeps them in the
// app's own folder, and hands back the newest good copy. The app keeps a bundled copy as the fallback, so nothing breaks
// offline. Never forced: the app decides when to use it (e.g. next launch or reload) and can turn it off.
//
//   const r = createReceiverUpdater({ dir, getJSON, bundled: { version, css, js }, enabled: () => true, onChange, timeoutMs: 60000 });
//   await r.check();        // at launch and every few hours
//   r.active()              // -> { version, css, js, skins, source: "bundled" | "updated" }   (skins: the parsed skins.json)
//   r.status                // -> { version, source, lastCheck, result }
//   applyToPage(html, r.active())  // swaps the look, the skins and the controls code into a page when newer
//
// getJSON(url, { text: true }) must be the app's own Bouncer-guarded fetch. Allow only
//   raw.githubusercontent.com  /Octoroboto/meddev-receiver/main/dist/*   (GET)
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const RAW = "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/";
const MAX = { css: 1e6, js: 2e6, skins: 12e6 };
const skinsTag = text => String(text).replace(/</g, "\\u003c");

function cmp(a, b) {
  const p = v => String(v || "").replace(/^[^\d]*/, "").split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0;
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
// The version a CSS or JS file says it is (its first-line banner).
function versionOf(text) { const m = /MedDev Receiver (\d+\.\d+\.\d+)/.exec(String(text || "").slice(0, 400)); return m ? m[1] : null; }

// Checks a downloaded pair before it is ever used. Returns null when good, or the reason it was refused.
function validateSkins(text, version) {
  if (typeof text !== "string" || text.length > MAX.skins) return "skins.json has an unexpected size";
  let b; try { b = JSON.parse(text); } catch { return "skins.json isn't valid JSON"; }
  if (b.version !== version || !Array.isArray(b.skins) || !b.skins.length) return "skins.json doesn't match this version";
  for (const k of b.skins) {
    if (!k || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(k.id || "") || typeof k.css !== "string" || typeof k.name !== "string") return "a skin is malformed";
    if (/<\/(style|script)|javascript:|expression\(/i.test(k.css)) return `skin ${k.id} contains something a skin can't`;
  }
  if (!b.skins.find(k => k.id === b.default)) return "the house default isn't one of the skins";
  return null;
}
function validate({ manifest, css, js, skins }) {
  if (!manifest || !/^\d+\.\d+\.\d+$/.test(manifest.version || "")) return "bad manifest";
  const f = manifest.files || {};
  if (typeof css !== "string" || typeof js !== "string") return "missing file";
  if (css.length < 1000 || css.length > MAX.css || js.length < 1000 || js.length > MAX.js) return "unexpected size";
  if (!f["receiver.css"] || sha(css) !== f["receiver.css"].sha256) return "receiver.css doesn't match the manifest";
  if (!f["receiver.js"] || sha(js) !== f["receiver.js"].sha256) return "receiver.js doesn't match the manifest";
  if (versionOf(css) !== manifest.version || versionOf(js) !== manifest.version) return "version mismatch";
  if (/<\/?(style|script)\b/i.test(css + js)) return "contains a style or script tag";
  if (/@import\s+url\(\s*["']?(?!https:\/\/fonts\.googleapis\.com\/)/i.test(css)) return "CSS imports from somewhere unexpected";
  if (!js.includes("window.MedDevReceiver=") || !js.includes("MDFM_receiver")) return "receiver.js is missing its API";
  if (f["skins.json"] || skins !== undefined) {
    if (!f["skins.json"] || typeof skins !== "string" || sha(skins) !== f["skins.json"].sha256) return "skins.json doesn't match the manifest";
    const bad = validateSkins(skins, manifest.version); if (bad) return bad;
  }
  try { new vm.Script(js, { filename: "receiver.js" }); } catch (e) { return "receiver.js does not parse: " + e.message; }
  return null;
}

// Swaps the look inside a page that embeds it, only when the given copy is newer than the page's own.
function applyToPage(html, rx) {
  if (!rx || !rx.css || !rx.js) return html;
  const cur = /<style id="mdfm-skin">([\s\S]*?)<\/style>/.exec(html);
  if (!cur || cmp(rx.version, versionOf(cur[1])) <= 0) return html;
  if (!/<script id="meddev-receiver-js">[\s\S]*?<\/script>/.test(html)) return html;   // an older page layout: leave it as it was rather than mix versions
  let out = html.replace(/<style id="mdfm-skin">[\s\S]*?<\/style>/, () => `<style id="mdfm-skin">${rx.css}</style>`);
  out = out.replace(/<script id="meddev-receiver-js">[\s\S]*?<\/script>/, () => `<script id="meddev-receiver-js">${rx.js}</script>`);
  if (rx.skinsText) {
    const tag = `<script id="meddev-skins" type="application/json">${skinsTag(rx.skinsText)}</script>`;
    out = /<script id="meddev-skins" type="application\/json">[\s\S]*?<\/script>/.test(out)
      ? out.replace(/<script id="meddev-skins" type="application\/json">[\s\S]*?<\/script>/, () => tag)
      : out.replace(/<script id="meddev-receiver-js">/, () => tag + "\n<script id=\"meddev-receiver-js\">");
  }
  return out;
}

function createReceiverUpdater({ dir, getJSON, bundled, enabled = () => true, onChange, base = RAW, timeoutMs = 60000 }) {
  const status = { version: null, source: "bundled", lastCheck: null, result: "not checked yet" };
  const b = () => (typeof bundled === "function" ? bundled() : bundled);
  function cached() {
    try { return fs.readdirSync(dir).filter(v => /^\d+\.\d+\.\d+$/.test(v) && fs.existsSync(path.join(dir, v, "receiver.js"))).sort(cmp).reverse(); } catch { return []; }
  }
  const seen = new Map();   // version -> { stamp, copy }: a kept copy is re-checked only when its files change
  function load(v) {
    let stamp; try { stamp = ["receiver.css", "receiver.js", "skins.json", "manifest.json"].map(n => { try { const st = fs.statSync(path.join(dir, v, n)); return st.size + ":" + st.mtimeMs; } catch { return "-"; } }).join("|"); } catch { stamp = null; }
    const hit = seen.get(v); if (hit && hit.stamp === stamp) return hit.copy;
    const copy = read(v); seen.set(v, { stamp, copy }); return copy;
  }
  function read(v) {
    try { const css = fs.readFileSync(path.join(dir, v, "receiver.css"), "utf8"), js = fs.readFileSync(path.join(dir, v, "receiver.js"), "utf8");
      let skinsText = null, skins = null; try { skinsText = fs.readFileSync(path.join(dir, v, "skins.json"), "utf8"); skins = JSON.parse(skinsText); } catch {}
      if (versionOf(css) !== v || versionOf(js) !== v) return null;
      // Copies kept by this updater carry their manifest: check them again, so a damaged file on disk is never used.
      // (Copies kept by older updaters have none and are used as before.)
      let m = null; try { m = JSON.parse(fs.readFileSync(path.join(dir, v, "manifest.json"), "utf8")); } catch (e) { if (e.code !== "ENOENT") return null; }
      if (m && validate({ manifest: m, css, js, skins: m.files && m.files["skins.json"] ? (skinsText == null ? "" : skinsText) : undefined })) return null;
      return { version: v, css, js, skins, skinsText, source: "updated" }; } catch { return null; }
  }
  function active() {
    const bb = { ...b(), source: "bundled" };
    if (enabled()) for (const v of cached()) { if (cmp(v, bb.version) <= 0) break; const c = load(v); if (c) { Object.assign(status, { version: c.version, source: c.source }); return c; } }
    Object.assign(status, { version: bb.version, source: "bundled" }); return bb;
  }
  // One check at a time (a second call while one is running gets the same answer), and no request waits forever.
  let running = null;
  const fetchOne = (url, o) => { let t; return Promise.race([Promise.resolve().then(() => getJSON(url, o)),
    new Promise((_, no) => { t = setTimeout(() => no(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs); })]).finally(() => clearTimeout(t)); };
  function check() { if (!running) running = doCheck().finally(() => { running = null; }); return running; }
  async function doCheck() {
    if (!enabled()) { status.result = "off"; return status; }
    status.lastCheck = new Date().toISOString();
    try {
      const manifest = await fetchOne(base + "manifest.json"), cur = active();
      if (!manifest || cmp(manifest.version, cur.version) <= 0) { status.result = `up to date (${cur.version})`; return status; }
      const css = await fetchOne(base + "receiver.css", { text: true }), js = await fetchOne(base + "receiver.js", { text: true });
      const skins = manifest.files && manifest.files["skins.json"] ? await fetchOne(base + "skins.json", { text: true }) : undefined;
      const bad = validate({ manifest, css, js, skins });
      if (bad) { status.result = `skipped ${manifest.version}: ${bad}`; return status; }
      // Write the whole copy into a side folder, then move it into place in one step: a crash or full disk part-way
      // never leaves a half-written version where active() would pick it up.
      const d = path.join(dir, manifest.version), tmp = path.join(dir, `.${manifest.version}.${process.pid}.${Date.now()}.tmp`);
      fs.mkdirSync(tmp, { recursive: true });
      try {
        for (const [n, s] of [["receiver.css", css], ["receiver.js", js], ...(skins !== undefined ? [["skins.json", skins]] : []), ["manifest.json", JSON.stringify(manifest)]]) fs.writeFileSync(path.join(tmp, n), s);
        if (fs.existsSync(d)) { const old = d + `.${Date.now()}.old`; fs.renameSync(d, old); try { fs.rmSync(old, { recursive: true, force: true }); } catch {} }
        fs.renameSync(tmp, d);
      } catch (e) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} throw e; }
      status.result = `got ${manifest.version}`; active(); onChange && onChange(status);
    } catch (e) { status.result = "check failed: " + e.message; }
    return status;
  }
  active();
  return { check, active, status, cached };
}

module.exports = { createReceiverUpdater, applyToPage, validate, validateSkins, versionOf, cmp, RAW };
