// Records the fingerprints of the reviewed Bouncer rules + configs. Run after reviewing a change:  npm run bouncer:lock
//   policy.cedar (the app's own requests) and ../common/signin-policy.cedar (the sign-in windows).
const fs = require("fs"), path = require("path");
const { fingerprint } = require("../kit/bouncer");
const dir = path.join(__dirname, "..", "src", "main", "bouncer"), common = path.join(__dirname, "..", "..", "common");
for (const [pol, cfg, out] of [[path.join(dir, "policy.cedar"), "bouncer.config.json", "bouncer.lock.json"], [path.join(common, "signin-policy.cedar"), "bouncer.signin.config.json", "bouncer.signin.lock.json"]]) {
  const policy = fs.readFileSync(pol, "utf8"), config = JSON.parse(fs.readFileSync(path.join(dir, cfg), "utf8"));
  const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
  fs.writeFileSync(path.join(dir, out), JSON.stringify(lock, null, 2) + "\n");
  console.log(`Locked ${path.basename(pol)} v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
}
