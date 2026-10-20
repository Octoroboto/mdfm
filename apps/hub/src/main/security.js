// Two Bouncers for MD Hub:
//   app:  the app's own requests (weather, sports, Slack, update checks) — ENFORCED (the files bouncer.config.json "rules"
//         lists: the kit's shared floor, the MDFM family rules and app.cedar, through kit/bouncer/rules.js)
//   view: the hub page itself on claude.ai — OBSERVE (view-policy.cedar): logs anything unusual, blocks nothing,
//         because blocking a site's own first-party calls can break it. Switch to enforce once the logs are clean.
// Process: Electron main, called from main.js at load (before app "ready"), so sessions are gated before any page loads.
// A third Bouncer guards the Slack sign-in windows. Any rules file that doesn't match its lock makes that Bouncer block everything.
const { app } = require("electron");
const fs = require("fs"), path = require("path");
const { createBouncer } = require("../../kit/bouncer");
const { loadRules } = require("../../kit/bouncer/rules");
const net = require("../common/net");
const DIR = path.join(__dirname, "bouncer");
// Reads a JSON file from src/main/bouncer, or returns d when it's missing or broken.
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return d; } };
// The installed @cedar-policy/cedar-wasm version (Futureproofer compares it with npm's latest), or null.
function enginePackageVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve("@cedar-policy/cedar-wasm/nodejs")), "..", "package.json"), "utf8")).version; } catch { return null; }
}
// The app's joined rules, or "" when they can't be read: the lock then doesn't match and Bouncer blocks everything (fails closed).
function rulesText() { try { return loadRules(DIR).text; } catch { return ""; } }
// notify(problem): called when the app's Bouncer blocks a request. Returns { appB, viewB, signinB, enginePackageVersion }.
// main.js attaches the sessions: appB on the default session, viewB on the hub's persist:mdhub session.
function startBouncers({ notify }) {
  const ev = enginePackageVersion(), dev = !app.isPackaged && process.env.MDFM_BOUNCER_OBSERVE === "1" ? "observe" : null;   // dev: MDFM_BOUNCER_OBSERVE=1 in a source run logs instead of blocking; a built app ignores it
  const appB = createBouncer({ appName: "MD Hub", policyText: rulesText(), config: readJson("bouncer.config.json", {}),
    lock: readJson("bouncer.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer"), notify, enginePackageVersion: ev, modeOverride: dev });
  const viewB = createBouncer({ appName: "MD Hub (hub page)", policyText: fs.readFileSync(path.join(DIR, "view-policy.cedar"), "utf8"), config: readJson("bouncer.view.config.json", {}),
    lock: readJson("bouncer.view.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer-hub-page"), notify: () => {}, enginePackageVersion: ev });   // (no modeOverride: the view Bouncer's mode comes from bouncer.view.config.json)
  // The sign-in windows (Connect Slack, the builder's setup) get their own enforced Bouncer (../common/signin-policy.cedar).
  const signinB = createBouncer({ appName: "MD Hub (sign-in windows)", policyText: fs.readFileSync(path.join(__dirname, "../common/signin-policy.cedar"), "utf8"),
    config: readJson("bouncer.signin.config.json", {}), lock: readJson("bouncer.signin.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer-signin"),
    notify: () => {}, enginePackageVersion: ev, modeOverride: dev });
  net.useBouncer(appB);   // common/net.js sends the app's own requests through appB
  app.whenReady().then(() => { const check = () => appB.checkForUpdates(url => net.getJSON(url)); setTimeout(check, 8000); setInterval(check, 24 * 3600e3); });   // daily check for a newer Cedar engine (Futureproofer shows it)
  return { appB, viewB, signinB, enginePackageVersion: ev };
}
module.exports = { startBouncers };
