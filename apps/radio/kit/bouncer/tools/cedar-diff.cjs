#!/usr/bin/env node
// Same-answers check: asks the same questions of two Bouncers and fails if any answer differs.
// Used two ways:
//   1. Cedar upgrade: same rules, old engine vs new engine
//        node kit/bouncer/tools/cedar-diff.cjs --cases test/bouncer-cases.cjs --rules src/main/bouncer \
//             --engine-before /tmp/cedar-old/node_modules/@cedar-policy/cedar-wasm --engine-after node_modules/@cedar-policy/cedar-wasm
//   2. Rules change (for example splitting policy.cedar into shared.cedar + app.cedar): same engine, old rules vs new
//        node kit/bouncer/tools/cedar-diff.cjs --cases test/bouncer-cases.cjs --rules old/bouncer --rules-after src/main/bouncer
// --rules / --rules-after: a rules folder (bouncer.config.json + its rules, see kit/bouncer/rules.js) or one .cedar file.
// --engine-before / --engine-after: a @cedar-policy/cedar-wasm package folder (default: the one this app installs).
// --no-expect: only compare the two answers (ignore each question's expected answer).
// --json <file>: also write the full report as JSON (the upgrade workflow attaches it to the PR).
// Exit code: 0 = every answer the same (and every expected answer met); 1 = a difference; 2 = couldn't run.
//
// The cases file (test/bouncer-cases.cjs) exports an array, or { cases }, of questions:
//   { caller, method, url, body?, contentType?, formFields?, formValues?, sameToday?, expect?: "allow"|"deny", note }
// or the short form many apps' tests already use: [caller, method, url, body, expect, note], where body may be
// a string, { formFields: [...] } or { body, contentType }.
const fs = require('fs');
const path = require('path');
const { requestFacts } = require('../facts');
const { loadRules } = require('../rules');
const { createCedarEngine, readRules } = require('../engine-cedar');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}

function readRulesAt(p) {
  const abs = path.resolve(p);
  if (fs.statSync(abs).isDirectory()) return { ...loadRules(abs), where: abs };
  return { text: fs.readFileSync(abs, 'utf8'), files: [abs], split: false, where: abs };
}

function loadEngineModule(dir) {
  if (!dir) return require('@cedar-policy/cedar-wasm/nodejs');
  const root = path.resolve(dir);
  return require(path.join(root, 'nodejs'));
}
function packageVersion(dir) {
  try {
    const root = dir ? path.resolve(dir) : path.join(path.dirname(require.resolve('@cedar-policy/cedar-wasm/nodejs')), '..');
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  } catch { return null; }
}

function normalizeCase(c, i) {
  if (Array.isArray(c)) {
    const [caller, method, url, body, expect, note] = c;
    const o = { caller, method, url, expect, note };
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) Object.assign(o, body); else if (body != null) o.body = body;
    return { ...o, n: i + 1 };
  }
  return { ...c, n: i + 1 };
}
function loadCases(file) {
  const abs = path.resolve(file);
  delete require.cache[require.resolve(abs)]; // always the file as it is now
  const m = require(abs);
  const list = Array.isArray(m) ? m : m.cases;
  if (!Array.isArray(list) || !list.length) throw new Error(`${file} has no cases (export an array or { cases })`);
  return list.map(normalizeCase);
}

function ask(engine, c, toFacts = requestFacts) {
  const facts = toFacts({ url: c.url, method: c.method, body: c.body, contentType: c.contentType, formFields: c.formFields, formValues: c.formValues });
  if (!facts.ok) return { decision: 'deny', reasons: [], errors: [facts.error] };
  if (c.sameToday != null) facts.sameToday = c.sameToday;
  try { return engine.decide(c.caller || 'app', facts); } catch (e) { return { decision: 'error', reasons: [], errors: [e.message] }; }
}

// Which rules moved, changed, came or went (by @id; text compared without comments and spacing).
function compareRules(cedarMod, before, after) {
  const norm = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const a = readRules(cedarMod, before).rules, b = readRules(cedarMod, after).rules;
  const out = { same: [], changed: [], added: [], removed: [] };
  for (const id of Object.keys(a)) (id in b ? (norm(a[id]) === norm(b[id]) ? out.same : out.changed) : out.removed).push(id);
  for (const id of Object.keys(b)) if (!(id in a)) out.added.push(id);
  return out;
}

// bouncer = { createCedarEngine, requestFacts } to judge with an app's own copy of Bouncer (default: this kit's).
function sameAnswers({ cases, rulesBefore, rulesAfter = rulesBefore, cedarBefore, cedarAfter = cedarBefore, checkExpected = true, bouncer = null }) {
  const make = (bouncer && bouncer.createCedarEngine) || createCedarEngine, toFacts = (bouncer && bouncer.requestFacts) || requestFacts;
  const eb = make(rulesBefore, cedarBefore), ea = make(rulesAfter, cedarAfter);
  const rows = cases.map((c) => {
    const x = ask(eb, c, toFacts), y = ask(ea, c, toFacts);
    return { n: c.n, note: c.note || `${c.method} ${c.url}`, caller: c.caller || 'app', method: c.method, url: c.url, expect: c.expect || null,
      before: x.decision, after: y.decision, beforeRules: x.reasons, afterRules: y.reasons, errors: [...x.errors, ...y.errors] };
  });
  const differ = rows.filter((r) => r.before !== r.after);
  const missedBefore = rows.filter((r) => r.expect && r.before !== r.expect);
  const missedAfter = rows.filter((r) => r.expect && r.after !== r.expect);
  // An engine that can't answer (an error, not a decision) fails the check even when both sides fail the same way.
  // (A rule that errors on one request is skipped by Cedar, as in the app, and only shows in a row's errors.)
  const errored = rows.filter((r) => r.before === 'error' || r.after === 'error');
  const rules = rulesBefore === rulesAfter ? null : compareRules(cedarAfter, rulesBefore, rulesAfter);
  return { checkExpected, asked: rows.length, differ, missedBefore, missedAfter, errored, rules, engines: { before: eb.version, after: ea.version }, rows,
    ok: differ.length === 0 && errored.length === 0 && (!checkExpected || missedAfter.length === 0) };
}

function describe(r) {
  const lines = [];
  lines.push(`Asked ${r.asked} questions. Engine ${r.engines.before}${r.engines.after !== r.engines.before ? ` → ${r.engines.after}` : ''}.`);
  if (r.rules) lines.push(`Rules: ${r.rules.same.length} unchanged, ${r.rules.changed.length} changed${r.rules.changed.length ? ` (${r.rules.changed.join(', ')})` : ''}, ${r.rules.added.length} added${r.rules.added.length ? ` (${r.rules.added.join(', ')})` : ''}, ${r.rules.removed.length} removed${r.rules.removed.length ? ` (${r.rules.removed.join(', ')})` : ''}.`);
  if (!r.differ.length) lines.push('✓ Every answer is the same.');
  for (const d of r.differ) lines.push(`✗ #${d.n} ${d.note}: ${d.before} before (${d.beforeRules.join(', ') || 'no rule'}), ${d.after} after (${d.afterRules.join(', ') || 'no rule'})`);
  if (r.checkExpected !== false) for (const d of r.missedAfter) if (!r.differ.includes(d)) lines.push(`✗ #${d.n} ${d.note}: expected ${d.expect}, got ${d.after}`);
  for (const d of r.errored || []) lines.push(`✗ #${d.n} ${d.note}: the engine couldn't answer (${d.errors.join('; ') || 'error'})`);
  if (r.checkExpected !== false && r.missedBefore.length) lines.push(`! ${r.missedBefore.length} expected answer(s) were already wrong before the change: ${r.missedBefore.map((d) => '#' + d.n).join(', ')}`);
  return lines.join('\n');
}

module.exports = { sameAnswers, loadCases, normalizeCase, compareRules, describe };

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.cases || !o.rules) {
    console.error('Usage: cedar-diff.cjs --cases <file> --rules <folder|file> [--rules-after <folder|file>] [--engine-before <dir>] [--engine-after <dir>] [--json <file>]');
    process.exit(2);
  }
  let r;
  try {
    const before = readRulesAt(o.rules), after = o.rulesAfter ? readRulesAt(o.rulesAfter) : before;
    const cb = loadEngineModule(o.engineBefore), ca = o.engineAfter ? loadEngineModule(o.engineAfter) : cb;
    r = sameAnswers({ cases: loadCases(o.cases), rulesBefore: before.text, rulesAfter: after.text, cedarBefore: cb, cedarAfter: ca, checkExpected: !o.noExpect });
    r.packages = { before: packageVersion(o.engineBefore), after: packageVersion(o.engineAfter || o.engineBefore) };
  } catch (e) { console.error(`Couldn't run the same-answers check: ${e.message}`); process.exit(2); }
  console.log(describe(r));
  if (o.json) fs.writeFileSync(path.resolve(o.json), JSON.stringify(r, null, 2) + '\n');
  process.exit(r.ok ? 0 : 1);
}
