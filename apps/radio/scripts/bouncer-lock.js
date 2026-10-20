// Records the fingerprints of the reviewed Bouncer rules + configs. Run after reviewing a change:  npm run bouncer:lock
//   the app's own rules (the files bouncer.config.json "rules" lists, read by kit/bouncer/rules.js) and
//   ../common/signin-policy.cedar (the sign-in windows).
// Runs in Node from the command line (npm run bouncer:lock). Writes src/main/bouncer/bouncer.lock.json and
// bouncer.signin.lock.json; at startup security.js compares the live rules against these fingerprints.
const fs = require("fs"), path = require("path");
const { fingerprint } = require("../kit/bouncer");
const { loadRules } = require("../kit/bouncer/rules");
const dir = path.join(__dirname, "..", "src", "main", "bouncer"), common = path.join(__dirname, "..", "..", "common");
// Each entry: [policy file, its config file name, its lock file name], all configs and locks in src/main/bouncer.
// pol null = the app's own rules, read through bouncer.config.json "rules".
for (const [pol, cfg, out] of [[null, "bouncer.config.json", "bouncer.lock.json"], [path.join(common, "signin-policy.cedar"), "bouncer.signin.config.json", "bouncer.signin.lock.json"]]) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, cfg), "utf8")), policy = pol ? fs.readFileSync(pol, "utf8") : loadRules(dir, config).text;
  const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
  fs.writeFileSync(path.join(dir, out), JSON.stringify(lock, null, 2) + "\n");
  console.log(`Locked ${pol ? path.basename(pol) : "app rules"} v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
}
