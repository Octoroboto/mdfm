// Records the fingerprints of the reviewed Bouncer rules + configs. Run after reviewing a change:  npm run bouncer:lock
// Runs in Node from the command line (npm run bouncer:lock). Writes the three lock files in src/main/bouncer; at startup
// security.js compares each live rules file against its lock, and a mismatch makes that Bouncer block everything.
const fs = require("fs"), path = require("path");
const { fingerprint } = require("../kit/bouncer");
const { loadRules } = require("../kit/bouncer/rules");
const dir = path.join(__dirname, "..", "src", "main", "bouncer"), common = path.join(__dirname, "..", "..", "common");
// Each entry: [policy file (relative to src/main/bouncer, or absolute; null = the app's own rules, the files
// bouncer.config.json "rules" lists, read by kit/bouncer/rules.js), its config file, its lock file].
for (const [pol, cfg, out] of [[null, "bouncer.config.json", "bouncer.lock.json"], ["view-policy.cedar", "bouncer.view.config.json", "bouncer.view.lock.json"], [path.join(common, "signin-policy.cedar"), "bouncer.signin.config.json", "bouncer.signin.lock.json"]]) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, cfg), "utf8")), policy = pol ? fs.readFileSync(path.isAbsolute(pol) ? pol : path.join(dir, pol), "utf8") : loadRules(dir, config).text;
  const lock = { ...fingerprint(policy, config), lockedAt: new Date().toISOString(), mode: config.mode, policyVersion: config.policyVersion };
  fs.writeFileSync(path.join(dir, out), JSON.stringify(lock, null, 2) + "\n");
  console.log(`Locked ${pol ? path.basename(pol) : "app rules"} v${config.policyVersion} (${config.mode}): ${lock.policySha256.slice(0, 12)}`);
}
