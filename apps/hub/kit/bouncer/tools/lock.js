// Records the fingerprints of an app's reviewed Bouncer rules and config. Run it after reviewing a rules change:
//   node kit/bouncer/tools/lock.js [rulesFolder]      (default: src/main/bouncer)
// The folder holds policy.cedar + bouncer.config.json; this writes bouncer.lock.json next to them. The app refuses
// rules that don't match the lock (Bouncer blocks everything), so an edit can't slip in without a review.
const fs = require("fs"), path = require("path");
const { fingerprint } = require("..");
const dir = path.resolve(process.argv[2] || "src/main/bouncer");
const policy = fs.readFileSync(path.join(dir, "policy.cedar"), "utf8");
const config = JSON.parse(fs.readFileSync(path.join(dir, "bouncer.config.json"), "utf8"));
const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
fs.writeFileSync(path.join(dir, "bouncer.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log(`Locked ${path.relative(process.cwd(), dir) || "."}/policy.cedar v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
