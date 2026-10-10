// Starts Bouncer for MDFM Radio: loads the reviewed rules (src/main/bouncer/policy.cedar), checks them
// against the lock, puts the gate on every browser session, and hands it to common/net.js, the one
// file that sends the app's own requests.
const { app, session } = require("electron");
const fs = require("fs"), path = require("path");
const { createBouncer } = require("../../kit/bouncer");
const net = require("../common/net");
const DIR = path.join(__dirname, "bouncer");
let bouncer = null, signinBouncer = null;

function enginePackageVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve("@cedar-policy/cedar-wasm/nodejs")), "..", "package.json"), "utf8")).version; }
  catch { return null; }
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// Call before app "ready" so every session (including later ones) gets the gate.
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
  app.on("session-created", s => bouncer.attachSession(s));
  app.whenReady().then(() => {
    bouncer.attachSession(session.defaultSession);
    const check = () => bouncer.checkForUpdates(url => net.getJSON(url));
    setTimeout(check, 8000); setInterval(check, 24 * 3600e3);
  });
  return bouncer;
}
module.exports = { startBouncer, get: () => bouncer, signin: () => signinBouncer };
