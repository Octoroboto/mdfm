// "Download" for a new app version: fetches the newest release's .dmg straight into ~/Downloads (no browser, no
// releases page), shows progress on the Dock icon, then opens the .dmg so Finder shows "drag to Applications".
// Only GitHub release .dmg files of Octoroboto/mdfm, over https, following GitHub's redirect to its file host, and
// every hop goes through Bouncer (rule "app-update-download"). Nothing is installed automatically.
const fs = require("fs"), path = require("path");
const { fetchHop } = require("./net");
const RELEASE_DMG = /^https:\/\/github\.com\/Octoroboto\/mdfm\/releases\/download\/(radio|hub)-v\d+\.\d+\.\d+\/[A-Za-z0-9._%+-]+\.dmg$/;
const HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const MAX_BYTES = 600 * 1024 * 1024;
const isReleaseDmg = url => RELEASE_DMG.test(String(url || ""));
function freeName(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 100; i++) { const p = path.join(dir, i ? `${base} (${i})${ext}` : name); if (!fs.existsSync(p)) return p; }
  return path.join(dir, `${base} ${Date.now()}${ext}`);
}
function createAppDownload({ downloadsDir, openFile, onProgress = () => {}, userAgent = "MDFM-Radio" }) {
  let busy = null;
  async function run(url) {
    let u = url, res = null;
    for (let hop = 0; hop < 5 && !res; hop++) {
      const x = new URL(u), r = await fetchHop(x, { hosts: HOSTS, userAgent });
      if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) throw new Error("redirect without a location"); u = new URL(loc, x).toString(); continue; }
      if (!r.ok) throw new Error(`${x.hostname} ${r.status}`);
      res = r;
    }
    if (!res) throw new Error("too many redirects");
    const total = +res.headers.get("content-length") || 0; if (total > MAX_BYTES) throw new Error("the file is unexpectedly large");
    const name = decodeURIComponent(url.split("/").pop()), file = freeName(downloadsDir, name), part = file + ".part";
    const out = fs.createWriteStream(part); let got = 0, last = 0;
    try {
      for await (const chunk of res.body) {
        got += chunk.length; if (got > MAX_BYTES) throw new Error("the file is unexpectedly large");
        if (!out.write(chunk)) await new Promise(r => out.once("drain", r));
        if (total && Date.now() - last > 250) { last = Date.now(); onProgress({ state: "downloading", pct: got / total, name }); }
      }
      await new Promise((r, j) => out.end(e => e ? j(e) : r()));
      if (total && got !== total) throw new Error("the download was cut off");
      fs.renameSync(part, file);
    } catch (e) { try { out.destroy(); fs.unlinkSync(part); } catch {} throw e; }
    onProgress({ state: "done", pct: 1, name: path.basename(file), file });
    await openFile(file);
    return file;
  }
  // Resolves the saved file's path; a second press while one is running joins the same download.
  function start(url) {
    if (!isReleaseDmg(url)) return Promise.reject(new Error("not an MDFM release .dmg"));
    if (busy) return busy;
    onProgress({ state: "downloading", pct: 0, name: decodeURIComponent(url.split("/").pop()) });
    busy = run(url).catch(e => { onProgress({ state: "failed", error: e.message }); throw e; }).finally(() => { busy = null; });
    return busy;
  }
  return { start, isReleaseDmg };
}
module.exports = { createAppDownload, isReleaseDmg };
