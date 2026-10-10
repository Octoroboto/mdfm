// Futureproofer for MDFM Radio, in the background: it checks that the app, its engine (Electron), Bouncer's rule
// engine, the Mac and the MDFM content are current, and says so on the Station screen and in Settings.
// It never forces anything: no pop-ups, no automatic installs. New content still applies on the next launch.
const { app } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const { getJSON, postJSON } = require("../common/net");
const { createFutureproofer, checks } = require("../../kit/futureproofer");

const MIN_MACOS = 13;      // Electron 44 needs macOS 13 or newer
const TESTED_MACOS = 26;   // newest macOS the app has been used on

function underRosetta() { try { return execFileSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).trim() === "1"; } catch { return false; } }
function buildReport() { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "build", "dependency-report.json"), "utf8")); } catch { return null; } }

function startFutureproofer({ updater, enginePackageVersion, onChange }) {
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
      { id: "electron", title: "Electron (the app's engine)", everyHours: 12, run: () => checks.checkElectron({ current: process.versions.electron, getJson: getJSON }) },
      { id: "bouncer-engine", title: "Bouncer's rule engine (Cedar)", everyHours: 12, run: () => checks.checkPackage({ id: "bouncer-engine", title: "Bouncer's rule engine (Cedar)", name: "@cedar-policy/cedar-wasm", current: enginePackageVersion, getJson: getJSON, behindMajorIsBad: true }) },
      { id: "vulnerabilities", title: "Known security problems", everyHours: 12, run: () => checks.checkVulnerabilities({ packages: [{ name: "electron", version: process.versions.electron }, { name: "@cedar-policy/cedar-wasm", version: enginePackageVersion }], postJson: postJSON }) },
      { id: "mac", title: "This Mac", everyHours: 24, run: async () => checks.checkMac({ darwinRelease: os.release(), arch: process.arch, translated, minMacos: MIN_MACOS, testedMacos: TESTED_MACOS }) },
      { id: "build", title: "Build check", everyHours: 24, run: async () => checks.checkBuildReport({ report: buildReport() }) },
    ],
  });
  fp.start({ firstDelayMs: 25e3, everyMs: 3600e3 });
  return fp;
}
module.exports = { startFutureproofer };
