// Bouncer: reads an app's rules folder into the one policy text Bouncer, the lock and the tests judge.
//
// A rules folder (usually src/main/bouncer) holds bouncer.config.json, bouncer.lock.json and the rules:
//   - one file, policy.cedar (every app before kit 2.18, and still fine), or
//   - several files listed in bouncer.config.json "rules", in order, relative to the folder, e.g.
//       "rules": ["../../../kit/bouncer/shared.cedar", "app.cedar"]
//     shared.cedar holds the rules every app shares (the kit owns it; an app gets changes through a kit update),
//     app.cedar holds this app's own. Cedar reads them together as one set, so splitting a file changes no decision.
// The lock covers the joined text, so a change to either file needs a review and a new lock.
const fs = require('fs');
const path = require('path');

function ruleFiles(dir, config) {
  const list = Array.isArray(config && config.rules) && config.rules.length ? config.rules : ['policy.cedar'];
  return list.map((f) => path.resolve(dir, f));
}

// -> { text, files: [absolute paths], split: true when the rules come from more than one file }
function loadRules(dir, config = null) {
  if (!config) config = JSON.parse(fs.readFileSync(path.join(dir, 'bouncer.config.json'), 'utf8'));
  const files = ruleFiles(dir, config);
  if (files.length === 1) return { text: fs.readFileSync(files[0], 'utf8'), files, split: false };
  const text = files.map((f) => `// ══ ${path.basename(f)} ══\n${fs.readFileSync(f, 'utf8').trimEnd()}\n`).join('\n');
  return { text, files, split: true };
}

module.exports = { loadRules, ruleFiles };
