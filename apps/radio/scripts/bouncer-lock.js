// Records the fingerprint of the reviewed Bouncer rules + config (src/main/bouncer/bouncer.lock.json).
// Run after reviewing a change to policy.cedar or bouncer.config.json:  npm run bouncer:lock
const fs = require("fs"), path = require("path");
const { fingerprint } = require("../kit/bouncer");
const dir = path.join(__dirname, "..", "src", "main", "bouncer");
const policy = fs.readFileSync(path.join(dir, "policy.cedar"), "utf8");
const config = JSON.parse(fs.readFileSync(path.join(dir, "bouncer.config.json"), "utf8"));
const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
fs.writeFileSync(path.join(dir, "bouncer.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log(`Locked Bouncer rules v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
