// Records the fingerprints of the reviewed Bouncer rules + configs. Run after reviewing a change:  npm run bouncer:lock
const fs = require("fs"), path = require("path");
const { fingerprint } = require("../kit/bouncer");
const dir = path.join(__dirname, "..", "src", "main", "bouncer");
for (const [pol, cfg, out] of [["policy.cedar", "bouncer.config.json", "bouncer.lock.json"], ["view-policy.cedar", "bouncer.view.config.json", "bouncer.view.lock.json"]]) {
  const policy = fs.readFileSync(path.join(dir, pol), "utf8"), config = JSON.parse(fs.readFileSync(path.join(dir, cfg), "utf8"));
  const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
  fs.writeFileSync(path.join(dir, out), JSON.stringify(lock, null, 2) + "\n");
  console.log(`Locked ${pol} v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
}
