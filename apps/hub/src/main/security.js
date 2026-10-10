// Two Bouncers for MD Hub:
//   app:  the app's own requests (weather, sports, Slack, update checks) — ENFORCED (policy.cedar)
//   view: the hub page itself on claude.ai — OBSERVE (view-policy.cedar): logs anything unusual, blocks nothing,
//         because blocking a site's own first-party calls can break it. Switch to enforce once the logs are clean.
const { app } = require("electron");
const fs = require("fs"), path = require("path");
const { createBouncer } = require("../../kit/bouncer");
const net = require("../common/net");
const DIR = path.join(__dirname, "bouncer");
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return d; } };
function enginePackageVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve("@cedar-policy/cedar-wasm/nodejs")), "..", "package.json"), "utf8")).version; } catch { return null; }
}
function startBouncers({ notify }) {
  const ev = enginePackageVersion(), dev = !app.isPackaged && process.env.MDFM_BOUNCER_OBSERVE === "1" ? "observe" : null;
  const appB = createBouncer({ appName: "MD Hub", policyText: fs.readFileSync(path.join(DIR, "policy.cedar"), "utf8"), config: readJson("bouncer.config.json", {}),
    lock: readJson("bouncer.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer"), notify, enginePackageVersion: ev, modeOverride: dev });
  const viewB = createBouncer({ appName: "MD Hub (hub page)", policyText: fs.readFileSync(path.join(DIR, "view-policy.cedar"), "utf8"), config: readJson("bouncer.view.config.json", {}),
    lock: readJson("bouncer.view.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer-hub-page"), notify: () => {}, enginePackageVersion: ev });
  // The sign-in windows (Connect Slack, the builder's setup) get their own enforced Bouncer (../common/signin-policy.cedar).
  const signinB = createBouncer({ appName: "MD Hub (sign-in windows)", policyText: fs.readFileSync(path.join(__dirname, "../common/signin-policy.cedar"), "utf8"),
    config: readJson("bouncer.signin.config.json", {}), lock: readJson("bouncer.signin.lock.json", {}), logDir: path.join(app.getPath("userData"), "bouncer-signin"),
    notify: () => {}, enginePackageVersion: ev, modeOverride: dev });
  net.useBouncer(appB);
  app.whenReady().then(() => { const check = () => appB.checkForUpdates(url => net.getJSON(url)); setTimeout(check, 8000); setInterval(check, 24 * 3600e3); });
  return { appB, viewB, signinB, enginePackageVersion: ev };
}
module.exports = { startBouncers };
