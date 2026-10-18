// Starts Bouncer for MDFM Radio: loads the reviewed rules (src/main/bouncer/policy.cedar), checks them
// against the lock, puts the gate on every browser session, and hands it to common/net.js, the one
// file that sends the app's own requests.
// Process: Electron main, required by main.js before app "ready". Two Bouncers (app kit, kit/bouncer): the app's own, and
// one for the sign-in windows. A rules file that doesn't match its lock makes Bouncer block everything.
const { app, session } = require("electron");
const fs = require("fs"), path = require("path");
const { createBouncer } = require("../../kit/bouncer");
const net = require("../common/net");
const DIR = path.join(__dirname, "bouncer");
let bouncer = null, signinBouncer = null;   // both set by startBouncer(); read through get() and signin()

// The installed @cedar-policy/cedar-wasm version (Futureproofer compares it with npm's latest), or null.
function enginePackageVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve("@cedar-policy/cedar-wasm/nodejs")), "..", "package.json"), "utf8")).version; }
  catch { return null; }
}
// Reads a JSON file, or returns d when it's missing or broken (Bouncer then reports the problem rather than crashing).
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// Call before app "ready" so every session (including later ones) gets the gate.
// notify(problem): called when Bouncer blocks a request (main.js shows it on the Station screen). Returns the app's Bouncer.
function startBouncer({ notify }) {
  bouncer = createBouncer({
    appName: "MDFM Radio",
    policyText: fs.readFileSync(path.join(DIR, "policy.cedar"), "utf8"),
    config: readJson(path.join(DIR, "bouncer.config.json"), {}),
    lock: readJson(path.join(DIR, "bouncer.lock.json"), {}),
    logDir: path.join(app.getPath("userData"), "bouncer"),
    notify,
    enginePackageVersion: enginePackageVersion(),
    // Diagnosing from source only: MDFM_BOUNCER_OBSERVE=1 npm start (log, don't block). A built app ignores it.
    modeOverride: !app.isPackaged && process.env.MDFM_BOUNCER_OBSERVE === "1" ? "observe" : null,
  });
  net.useBouncer(bouncer);
  // The sign-in windows (Connect Slack, the builder's setup) get their own Bouncer and rules (../common/signin-policy.cedar).
  // Their sessions are handed to it when they open, which replaces the app's gate for those sessions only.
  signinBouncer = createBouncer({
    appName: "MDFM Radio (sign-in windows)",
    policyText: fs.readFileSync(path.join(__dirname, "../common/signin-policy.cedar"), "utf8"),
    config: readJson(path.join(DIR, "bouncer.signin.config.json"), {}),
    lock: readJson(path.join(DIR, "bouncer.signin.lock.json"), {}),
    logDir: path.join(app.getPath("userData"), "bouncer-signin"),
    notify: () => {}, enginePackageVersion: enginePackageVersion(),
    modeOverride: !app.isPackaged && process.env.MDFM_BOUNCER_OBSERVE === "1" ? "observe" : null,
  });
  app.on("session-created", s => bouncer.attachSession(s));   // every session made later (e.g. by a library) is gated too; sign-in windows re-attach theirs to signinBouncer
  app.whenReady().then(() => {
    bouncer.attachSession(session.defaultSession);
    // Daily check for a newer Cedar engine (Futureproofer shows it).
    const check = () => bouncer.checkForUpdates(url => net.getJSON(url));
    setTimeout(check, 8000); setInterval(check, 24 * 3600e3);
  });
  return bouncer;
}
module.exports = { startBouncer, get: () => bouncer, signin: () => signinBouncer };
