// "Download" for a new app version: fetches the newest release's .dmg straight into ~/Downloads (no browser, no
// releases page), shows progress on the Dock icon, then opens the .dmg so Finder shows "drag to Applications".
// Only GitHub release .dmg files of Octoroboto/mdfm, over https, following GitHub's redirect to its file host, and
// every hop goes through Bouncer (rule "app-update-download"). Nothing is installed automatically. A download that stalls
// for a minute (the Mac slept, the network dropped) fails, so the next press of Download starts afresh.
// 
// Process: Electron main. Loaded by apps/radio and apps/hub main.js (copied in by sync-common/sync-content); the renderer
// only asks for it over IPC. Exports createAppDownload(...) and isReleaseDmg(url).
// 
// ===== Allowed downloads =====
// RELEASE_DMG: the only URL shape a download may start from (a radio-v/hub-v release asset). HOSTS: where GitHub may
// redirect each hop. MAX_BYTES: a 600 MB ceiling so a wrong or hostile answer can't fill the disk.
const fs = require("fs"), path = require("path");
const { fetchHop } = require("./net");
const RELEASE_DMG = /^https:\/\/github\.com\/Octoroboto\/mdfm\/releases\/download\/(radio|hub)-v\d+\.\d+\.\d+\/[A-Za-z0-9._+-]+\.dmg$/;   // no '%': nothing is decoded into a path
const HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const MAX_BYTES = 600 * 1024 * 1024;
// True only for an Octoroboto/mdfm release .dmg URL (the renderer's request is checked against this before anything runs).
const isReleaseDmg = url => RELEASE_DMG.test(String(url || ""));
// The name it's saved under: the URL's last part as it is (GitHub's asset names never need decoding), never a path.
function fileName(url) {
  const n = path.basename(String(url).split("/").pop() || "");
  if (!/^[A-Za-z0-9._+-]+\.dmg$/.test(n) || n.startsWith(".")) throw new Error("bad file name");
  return n;
}
// A path in dir that doesn't exist yet: "name", then "name (1)"..."name (99)", then a timestamped name. Never overwrites.
function freeName(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 100; i++) { const p = path.join(dir, i ? `${base} (${i})${ext}` : name); if (!fs.existsSync(p)) return p; }
  return path.join(dir, `${base} ${Date.now()}${ext}`);
}
// ===== Downloader =====
// Makes the downloader. downloadsDir: where the .dmg goes (~/Downloads). openFile(path): opens it (shell.openPath).
// onProgress({ state: "downloading"|"done"|"failed", pct 0..1, name, file?, error? }): drives the Dock progress bar.
// stallMs: milliseconds with no new bytes before the download is abandoned. Returns { start, isReleaseDmg }.
function createAppDownload({ downloadsDir, openFile, onProgress = () => {}, userAgent = "MDFM-Radio", stallMs = 60e3 }) {
  let busy = null;   // the running download's promise, or null (one download at a time)
  // Downloads one URL: follows up to 5 redirects by hand (each new host checked against HOSTS and Bouncer by fetchHop),
  // streams into "<file>.part", renames it into place only when complete, then opens it. Resolves the final path.
  async function run(url) {
    const name = fileName(url), ac = new AbortController(); let idle = null;
    const poke = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(new Error("the download stalled")), stallMs); };   // every chunk re-arms the stall timer; firing it aborts the fetch
    const stalled = e => ac.signal.aborted ? new Error("the download stalled") : e;
    const drop = async r => { try { await r.body?.cancel(); } catch {} };   // a body we won't read is let go, not left open
    poke();
    try {
      let u = url, res = null;
      for (let hop = 0; hop < 5 && !res; hop++) {
        const x = new URL(u), r = await fetchHop(x, { hosts: HOSTS, userAgent, signal: ac.signal }).catch(e => { throw stalled(e); });
        if (r.status >= 300 && r.status < 400) { await drop(r); const loc = r.headers.get("location"); if (!loc) throw new Error("redirect without a location"); u = new URL(loc, x).toString(); continue; }
        if (!r.ok) { await drop(r); throw new Error(`${x.hostname} ${r.status}`); }
        res = r;
      }
      if (!res) throw new Error("too many redirects");
      const total = +res.headers.get("content-length") || 0; if (total > MAX_BYTES) { await drop(res); throw new Error("the file is unexpectedly large"); }
      const file = freeName(downloadsDir, name), part = file + ".part";   // written to a side file so a half download never looks like a finished .dmg
      const out = fs.createWriteStream(part); let got = 0, last = 0;
      try {
        for await (const chunk of res.body) {
          poke(); got += chunk.length; if (got > MAX_BYTES) throw new Error("the file is unexpectedly large");
          if (!out.write(chunk)) await new Promise(r => out.once("drain", r));   // respect back-pressure so a fast network doesn't buffer the whole file in memory
          if (total && Date.now() - last > 250) { last = Date.now(); onProgress({ state: "downloading", pct: got / total, name }); }
        }
        clearTimeout(idle);
        await new Promise((r, j) => out.end(e => e ? j(e) : r()));
        if (total && got !== total) throw new Error("the download was cut off");
        fs.renameSync(part, file);
      } catch (e) { try { out.destroy(); fs.unlinkSync(part); } catch {} throw stalled(e); }
      onProgress({ state: "done", pct: 1, name: path.basename(file), file });
      await openFile(file);
      return file;
    } finally { clearTimeout(idle); }
  }
  // Resolves the saved file's path; a second press while one is running joins the same download.
  function start(url) {
    if (!isReleaseDmg(url)) return Promise.reject(new Error("not an MDFM release .dmg"));
    if (busy) return busy;
    let name; try { name = fileName(url); } catch (e) { return Promise.reject(e); }
    onProgress({ state: "downloading", pct: 0, name });
    busy = run(url).catch(e => { onProgress({ state: "failed", error: e.message }); throw e; }).finally(() => { busy = null; });
    return busy;
  }
  return { start, isReleaseDmg };
}
module.exports = { createAppDownload, isReleaseDmg };
