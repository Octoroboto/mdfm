// Futureproofer for MD Hub, in the FOREGROUND: when a newer MD Hub is out it asks (Download / Later / Skip this version).
// Download fetches the .dmg into ~/Downloads in the app (common/app-download.js). Never forced. It also keeps an eye on Electron, Bouncer's engine, known security problems, this Mac and the build.
// The hub page itself is always current: it's the live artifact on claude.ai.
// Process: Electron main. Started by main.js after the window opens. Uses the app kit's futureproofer (kit/futureproofer).
const { app, dialog, shell } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const { getJSON, postJSON } = require("../common/net");
const { cmpVersion } = require("../common/live-parse");
const { createFutureproofer, checks } = require("../../kit/futureproofer");
// REL: the mdfm GitHub releases list (shared by the radio-v* and hub-v* releases).
const REL = "https://api.github.com/repos/Octoroboto/mdfm/releases?per_page=30";
const MIN_MACOS = 13, TESTED_MACOS = 26;
// True when this (Intel) build runs under Rosetta on Apple Silicon: sysctl.proc_translated is 1.
function underRosetta() { try { return execFileSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).trim() === "1"; } catch { return false; } }
// The build-time dependency report shipped in the app (scripts/dependency-report.js), or null.
function buildReport() { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "build", "dependency-report.json"), "utf8")); } catch { return null; } }

// Newest hub-v* release on the mdfm releases page (drafts and pre-releases aren't offered), with the .dmg for this Mac's chip.
async function latestRelease() {
  const rels = await getJSON(REL);
  const best = rels.filter(r => !r.draft && !r.prerelease && /^hub-v/.test(r.tag_name)).sort((a, b) => cmpVersion(b.tag_name, a.tag_name))[0];
  if (!best) return null;
  const want = process.arch === "arm64" ? /arm64/i : /^(?!.*arm64).*\.dmg$/i, dmg = (best.assets || []).find(a => /\.dmg$/i.test(a.name) && want.test(a.name));
  return { version: best.tag_name.replace(/^hub-v/, ""), url: best.html_url, download: dmg ? dmg.browser_download_url : best.html_url, notes: String(best.body || "").slice(0, 600) };
}

// look: the MedDev Receiver updater. getWindow(): the hub window (for the dialog). getSettings/saveSettings: settings.js
// through main.js. enginePackageVersion: installed cedar-wasm. onChange(): status changed. download(url): main.js's
// in-app .dmg download. Returns the futureproofer.
function startFutureproofer({ look, getWindow, getSettings, saveSettings, enginePackageVersion, onChange, download }) {
  const translated = process.platform === "darwin" && underRosetta();
  let asked = null;   // versions already asked about this launch
  // Asks once per launch per version (never for a skipped one): Download / Later / Skip this version.
  async function offer(u) {
    const s = getSettings(); if (!u || s.skipVersion === u.version || asked === u.version) return; asked = u.version;
    const w = getWindow(); const { response } = await dialog.showMessageBox(w && !w.isDestroyed() ? w : undefined, {
      type: "info", buttons: ["Download", "Later", "Skip this version"], defaultId: 0, cancelId: 1,
      message: `MD Hub ${u.version} is available`, detail: `You have ${app.getVersion()}. Updating is optional.${u.notes ? "\n\n" + u.notes : ""}` });
    if (response === 0) { if (download && u.download !== u.url) download(u.download); else shell.openExternal(u.download); }   // the .dmg straight into Downloads; the releases page only if there's no .dmg for this Mac
    if (response === 2) saveSettings({ skipVersion: u.version });
  }
  const fp = createFutureproofer({
    appName: "MD Hub", stateFile: path.join(app.getPath("userData"), "futureproofer", "state.json"), notify: () => onChange(),
    checks: [
      { id: "app", title: "This app", everyHours: 6, run: async () => {
        const u = await latestRelease();
        if (u && cmpVersion(u.version, app.getVersion()) > 0) { setTimeout(() => offer(u), 500);
          return checks.result("app", "This app", "warn", `MD Hub ${u.version} is available (you have ${app.getVersion()}). Optional.`, { action: { label: `Download ${u.version}`, url: u.download } }); }
        return checks.result("app", "This app", "ok", `Version ${app.getVersion()} is the newest.`); } },
      { id: "look", title: "Receiver look (MedDev Receiver)", everyHours: 6, run: async () => {
        const s = await look.check(); if (/fail/i.test(s.result || "")) throw new Error(s.result);
        return checks.result("look", "Receiver look (MedDev Receiver)", "ok", `Look ${s.version} (${s.source === "updated" ? "updated" : "built in"}; ${s.result}). A new look shows from the next launch or hub reload.`);
      } },
      { id: "electron", title: "Electron (the app's engine)", everyHours: 12, run: () => checks.checkElectron({ current: process.versions.electron, getJson: getJSON }) },
      { id: "bouncer-engine", title: "Bouncer's rule engine (Cedar)", everyHours: 12, run: () => checks.checkPackage({ id: "bouncer-engine", title: "Bouncer's rule engine (Cedar)", name: "@cedar-policy/cedar-wasm", current: enginePackageVersion, getJson: getJSON, behindMajorIsBad: true }) },
      { id: "vulnerabilities", title: "Known security problems", everyHours: 12, run: () => checks.checkVulnerabilities({ packages: [{ name: "electron", version: process.versions.electron }, { name: "@cedar-policy/cedar-wasm", version: enginePackageVersion }], postJson: postJSON }) },
      { id: "mac", title: "This Mac", everyHours: 24, run: async () => checks.checkMac({ darwinRelease: os.release(), arch: process.arch, translated, minMacos: MIN_MACOS, testedMacos: TESTED_MACOS }) },
      { id: "build", title: "Build check", everyHours: 24, run: async () => checks.checkBuildReport({ report: buildReport() }) },
    ],
  });
  fp.start({ firstDelayMs: 20e3, everyMs: 3600e3 });   // first run 20 s after launch, then hourly (each check keeps its own everyHours)
  return fp;
}
module.exports = { startFutureproofer, latestRelease };
