// Bouncer for MDFM Radio: the real Cedar rules, checked against every request the app makes and a set it must never make.
// Tests the app's rules (kit/bouncer/shared.cedar + kit/bouncer/families/mdfm-apps.cedar + src/main/bouncer/app.cedar,
// as bouncer.config.json lists them) through the app kit's Bouncer (kit/bouncer) with the real Cedar engine.
// Run: cd apps/radio && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test, so src/common exists). Node's built-in runner, no window.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createBouncer, fingerprint } = require("../kit/bouncer");
const DIR = path.join(__dirname, "../src/main/bouncer");
const config = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.config.json"), "utf8"));
const policyText = require("../kit/bouncer/rules").loadRules(DIR, config).text;
// The questions the rules must answer (shared with the kit's Cedar upgrade check): [caller, method, url, body, expect, why].
const CASES = require("./bouncer-cases.cjs");
const ask = (b, [caller, method, url, body]) => b.check({ url, method, ...(body && typeof body === "object" ? body : body != null ? { body } : {}) }, caller);
const lock = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.lock.json"), "utf8"));
// A fresh Bouncer over the reviewed rules, logging to a temp folder.
const make = () => createBouncer({ appName: "MDFM Radio", policyText, config, lock, logDir: fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-b-")), enginePackageVersion: "4.13.0" });

test("rules are locked, enforcing and healthy", () => {
  assert.deepStrictEqual({ p: lock.policySha256, c: lock.configSha256 }, (({ policySha256: p, configSha256: c }) => ({ p, c }))(fingerprint(policyText, config)), "run npm run bouncer:lock after reviewing a rules change");
  assert.strictEqual(config.mode, "enforce");
  const st = make().status(); assert.strictEqual(st.healthy, true, st.problems.join("; ")); assert.strictEqual(st.mode, "enforce");
});

test("every request the app makes is allowed, and everything else is blocked (test/bouncer-cases.cjs)", () => {
  const b = make(), wrong = [];
  for (const c of CASES) { const r = ask(b, c); if ((c[4] === "allow") !== (r.decision === "allow") || (c[4] === "deny" && r.allow)) wrong.push(`${c[4]} expected: ${c[0]} ${c[1]} ${c[2]} (${c[5] || "a request the app makes"}): ${r.decision} ${r.why || ""}`); }
  assert.deepStrictEqual(wrong, []);
  assert.ok(CASES.filter(c => c[4] === "allow").length >= 20 && CASES.filter(c => c[4] === "deny").length >= 15, "the questions file is complete");
});
test("plain http is blocked even where https is allowed (kit/bouncer/shared.cedar)", () => {
  const b = make();
  assert.strictEqual(b.check({ url: "https://ipwho.is/", method: "GET" }, "app").decision, "allow");
  assert.strictEqual(b.check({ url: "http://ipwho.is/", method: "GET" }, "app").allow, false);
  assert.throws(() => b.assert({ url: "https://example.com/x", method: "GET" }), /Blocked by Bouncer/);
});
test("a runaway loop hits the daily limit", () => {
  const b = make(); let last;
  for (let i = 0; i < 25; i++) last = b.check({ url: "https://slack.com/api/auth.revoke", method: "GET" }, "app");
  assert.strictEqual(last.allow, false);
});
test("a changed rules file without a new lock blocks everything", () => {
  const b = createBouncer({ appName: "x", policyText: policyText + "\n// edit", config, lock, logDir: fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-b-")) });
  assert.strictEqual(b.status().healthy, false);
  assert.strictEqual(b.check({ url: "https://ipwho.is/", method: "GET" }, "app").allow, false);
});
test("only common/net.js sends requests", () => {
  const roots = [path.join(__dirname, "../src/main"), path.join(__dirname, "../../common")], bad = [];
  const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== "node_modules") walk(p); } else if (/\.js$/.test(f) && !/net\.js$/.test(f)) {
    const t = fs.readFileSync(p, "utf8"); if (/\bfetch\s*\(|\bhttps?\.(request|get)\s*\(|\bnet\.request\b|XMLHttpRequest|new\s+WebSocket/.test(t.replace(/\/\/.*$/gm, ""))) bad.push(path.relative(path.join(__dirname, ".."), p)); } } };
  roots.forEach(walk);
  assert.deepStrictEqual(bad, [], "these files send requests without going through Bouncer");
});

test("a URL with a broken %-escape is judged (unreadable, fails closed), never throws out of the hook", () => {
  const { requestFacts } = require("../kit/bouncer/facts");
  assert.strictEqual(requestFacts({ url: "https://ipwho.is/50%off" }).ok, false);
  assert.strictEqual(requestFacts({ url: "file:///Users/x/100%.wav" }).ok, true, "local files are not judged");
  const b = make();
  assert.throws(() => b.assert({ url: "https://ipwho.is/a%E0%A4%A", method: "GET" }, "app"), e => e.code === "BOUNCED");
  let handler; b.attachSession({ webRequest: { onBeforeRequest: (_f, h) => { handler = h; } } });
  let out = null; handler({ url: "https://fonts.gstatic.com/50%off", method: "GET", webContentsId: 3 }, r => { out = r; });
  assert.deepStrictEqual(out, { cancel: true });
});

test("app-update-download: only the mdfm release .dmg and GitHub's file hosts", () => {
  const b = make(), ok = u => { try { b.assert({ url: u, method: "GET" }, "app"); return true; } catch { return false; } };
  assert.ok(ok("https://github.com/Octoroboto/mdfm/releases/download/radio-v0.3.7/MDFM.Radio-0.3.7-arm64.dmg"));
  assert.ok(ok("https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r&sig=x"));
  assert.ok(ok("https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2"));
  assert.ok(!ok("https://github.com/Octoroboto/other/releases/download/v1/x.dmg"));
  assert.ok(!ok("https://github.com/evil/mdfm/releases/download/radio-v1.0.0/x.dmg"));
});

test("ptlk-news-feeds: only the three feeds", () => {
  const b = make(), ok = u => { try { b.assert({ url: u, method: "GET" }, "app"); return true; } catch { return false; } };
  for (const u of ["https://feeds.npr.org/1006/rss.xml", "https://feeds.bbci.co.uk/news/business/rss.xml", "https://www.gamespot.com/feeds/game-news/"]) assert.ok(ok(u), u);
  for (const u of ["https://feeds.npr.org/1001/rss.xml", "https://www.gamespot.com/login/", "https://feeds.bbci.co.uk/news/rss.xml"]) assert.ok(!ok(u), u);
});
