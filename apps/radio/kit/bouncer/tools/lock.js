// Records the fingerprints of an app's reviewed Bouncer rules and config. Run it after reviewing a rules change:
//   node kit/bouncer/tools/lock.js [rulesFolder]      (default: src/main/bouncer)
// The folder holds bouncer.config.json and the rules (policy.cedar, or the files its "rules" list names: see
// kit/bouncer/rules.js); this writes bouncer.lock.json next to them. The app refuses rules that don't match the lock
// (Bouncer blocks everything), so an edit can't slip in without a review. The lock doesn't cover the Cedar engine's
// version: a Cedar upgrade needs no new lock (the upgrade PR's tests and same-answers check cover it instead).
const fs = require("fs"), path = require("path");
const { fingerprint } = require("..");
const { loadRules } = require("../rules");
const dir = path.resolve(process.argv[2] || "src/main/bouncer");
const config = JSON.parse(fs.readFileSync(path.join(dir, "bouncer.config.json"), "utf8"));
const { text, files } = loadRules(dir, config);
const lock = { ...fingerprint(text, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
if (files.length > 1) lock.files = files.map(f => path.relative(dir, f));
fs.writeFileSync(path.join(dir, "bouncer.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log(`Locked ${path.relative(process.cwd(), dir) || "."}/${files.map(f => path.basename(f)).join(" + ")} v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
