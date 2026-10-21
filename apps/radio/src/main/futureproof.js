// Futureproofer for MDFM Radio, in the background: it checks that the app, its engine (Electron), Bouncer's rule
// engine, the Mac and the MDFM content are current, and says so on the Station screen and in Settings.
// It never forces anything: no pop-ups, no automatic installs. New content still applies on the next launch.
// Process: Electron main. Started by main.js after the window opens. Uses the app kit's futureproofer (kit/futureproofer,
// synced from another repo); each check below returns checks.result(id, title, "ok"|"warn"|"bad", summary, extras).
const { app } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const { getJSON, postJSON } = require("../common/net");
const { createFutureproofer, checks } = require("../../kit/futureproofer");

const MIN_MACOS = 13;      // Electron 44 needs macOS 13 or newer
const TESTED_MACOS = 26;   // newest macOS the app has been used on

// True when this (Intel) build runs under Rosetta on Apple Silicon: sysctl.proc_translated is 1.
function underRosetta() { try { return execFileSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).trim() === "1"; } catch { return false; } }
// The build-time dependency report shipped in the app (scripts/dependency-report.js), or null.
function buildReport() { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "build", "dependency-report.json"), "utf8")); } catch { return null; } }

// updater: src/main/updater.js; look: the MedDev Receiver updater (common/receiver.js); enginePackageVersion: the installed
// cedar-wasm version (from Bouncer); onChange(): called when any result changes. Returns the futureproofer (status(), run()).
function startFutureproofer({ updater, look, enginePackageVersion, onChange }) {
  const translated = process.platform === "darwin" && underRosetta();
  const fp = createFutureproofer({
    appName: "MDFM Radio",
    stateFile: path.join(app.getPath("userData"), "futureproofer", "state.json"),
    notify: () => onChange(),   // background: no pop-ups, just refresh the status line
    checks: [
      { id: "app", title: "This app", everyHours: 6, run: async () => {
        await updater.checkApp(); const u = updater.status.appUpdate;
        return u ? checks.result("app", "This app", "warn", `MDFM Radio ${u.version} is available (you have ${app.getVersion()}). It's optional: update whenever you like.`, { action: { label: `Download ${u.version}`, url: u.download || u.url } })
                 : checks.result("app", "This app", "ok", `Version ${app.getVersion()} is the newest.`);
      } },
      { id: "content", title: "MDFM content and looks", everyHours: 6, run: async () => {
        await updater.checkContent(); const s = updater.status;
        if (/fail/i.test(s.result || "")) throw new Error(s.result);
        return checks.result("content", "MDFM content and looks", "ok", `MDFM ${s.engine && s.engine.version} (${s.result || "checked"}). New content plays from the next launch.`);
      } },
      { id: "look", title: "Receiver look (MedDev Receiver)", everyHours: 6, run: async () => {
        const s = await look.check(); if (/fail/i.test(s.result || "")) throw new Error(s.result);
        return checks.result("look", "Receiver look (MedDev Receiver)", "ok", `Look ${s.version} (${s.source === "updated" ? "updated" : "built in"}; ${s.result}). A new look shows from the next launch.`);
      } },
      { id: "electron", title: "Electron (the app's engine)", everyHours: 12, run: () => checks.checkElectron({ current: process.versions.electron, getJson: getJSON }) },
      { id: "bouncer-engine", title: "Bouncer's rule engine (Cedar)", everyHours: 12, run: ({ previous } = {}) => checks.checkCedar({ current: enginePackageVersion, previous, getJson: getJSON }) },   // newer Cedar arrives as a tested PR (kit-update.yml); this warns only if that looks stuck
      { id: "vulnerabilities", title: "Known security problems", everyHours: 12, run: () => checks.checkVulnerabilities({ packages: [{ name: "electron", version: process.versions.electron }, { name: "@cedar-policy/cedar-wasm", version: enginePackageVersion }], postJson: postJSON }) },
      { id: "mac", title: "This Mac", everyHours: 24, run: async () => checks.checkMac({ darwinRelease: os.release(), arch: process.arch, translated, minMacos: MIN_MACOS, testedMacos: TESTED_MACOS }) },
      { id: "build", title: "Build check", everyHours: 24, run: async () => checks.checkBuildReport({ report: buildReport() }) },
    ],
  });
  fp.start({ firstDelayMs: 25e3, everyMs: 3600e3 });   // first run 25 s after launch, then hourly (each check keeps its own everyHours)
  return fp;
}
module.exports = { startFutureproofer };
