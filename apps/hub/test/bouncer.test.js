// Bouncer for MD Hub: both rule sets checked with real Cedar.
//   app  (enforced): the app's own requests. Rules: kit/bouncer/shared.cedar + kit/bouncer/families/mdfm-apps.cedar
//        + src/main/bouncer/app.cedar, as bouncer.config.json lists them; questions in test/bouncer-cases.cjs.
//   view (view-policy.cedar, observe): the hub page on claude.ai, which is logged, never blocked.
// Run: cd apps/hub && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test, so src/common exists). No window.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createBouncer, fingerprint } = require("../kit/bouncer");
const DIR = path.join(__dirname, "../src/main/bouncer");
// Reads one rules file, its config and lock from src/main/bouncer.
const load = (p, c, l) => ({ policyText: fs.readFileSync(path.join(DIR, p), "utf8"), config: JSON.parse(fs.readFileSync(path.join(DIR, c), "utf8")), lock: JSON.parse(fs.readFileSync(path.join(DIR, l), "utf8")) });
const APP = (() => { const config = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.config.json"), "utf8"));
  return { policyText: require("../kit/bouncer/rules").loadRules(DIR, config).text, config, lock: JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.lock.json"), "utf8")) }; })();
// The questions the app's rules must answer (shared with the kit's Cedar upgrade check): [caller, method, url, body, expect, why].
const CASES = require("./bouncer-cases.cjs");
const ask = (b, [caller, method, url, body]) => b.check({ url, method, ...(body && typeof body === "object" ? body : body != null ? { body } : {}) }, caller);
const VIEW = load("view-policy.cedar", "bouncer.view.config.json", "bouncer.view.lock.json");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mdhub-b-"));
// fp: a rules set's current fingerprint, to compare with its lock.
const make = (s, name = "MD Hub") => createBouncer({ appName: name, ...s, logDir: tmp(), enginePackageVersion: "4.13.0" });
const fp = s => { const f = fingerprint(s.policyText, s.config); return { p: f.policySha256, c: f.configSha256 }; };

test("both rule sets are locked and healthy; app enforces, hub page observes", () => {
  for (const [s, mode] of [[APP, "enforce"], [VIEW, "observe"]]) {
    assert.deepStrictEqual({ p: s.lock.policySha256, c: s.lock.configSha256 }, fp(s), "run npm run bouncer:lock after reviewing a rules change");
    assert.strictEqual(s.config.mode, mode);
    const st = make(s).status(); assert.strictEqual(st.healthy, true, st.problems.join("; ")); assert.strictEqual(st.mode, mode);
  }
});

test("every request the app's own code makes is allowed, and everything else is blocked (test/bouncer-cases.cjs)", () => {
  const b = make(APP), wrong = [];
  for (const c of CASES) { const r = ask(b, c); if ((c[4] === "allow") !== (r.decision === "allow") || (c[4] === "deny" && r.allow)) wrong.push(`${c[4]} expected: ${c[0]} ${c[1]} ${c[2]} (${c[5] || "a request the app makes"}): ${r.decision} ${r.why || ""}`); }
  assert.deepStrictEqual(wrong, []);
  assert.ok(CASES.filter(c => c[4] === "allow").length >= 15 && CASES.filter(c => c[4] === "deny").length >= 12, "the questions file is complete");
});
test("plain http is blocked even where https is allowed (kit/bouncer/shared.cedar)", () => {
  const b = make(APP);
  assert.strictEqual(b.check({ url: "https://ipwho.is/", method: "GET" }, "app").decision, "allow");
  assert.strictEqual(b.check({ url: "http://ipwho.is/", method: "GET" }, "app").allow, false);
  assert.throws(() => b.assert({ url: "https://example.com/x", method: "GET" }), /Blocked by Bouncer/);
});
test("a changed rules file without a new lock blocks everything", () => {
  const b = createBouncer({ appName: "x", policyText: APP.policyText + "\n// edit", config: APP.config, lock: APP.lock, logDir: tmp() });
  assert.strictEqual(b.status().healthy, false);
  assert.strictEqual(b.check({ url: "https://ipwho.is/", method: "GET" }, "app").allow, false);
});

// The hub page: what it normally does must be quiet; anything else is logged as "would block" (never blocked).
// [caller, method, url]
const VIEW_OK = [
  ["hub", "GET", "https://claude.ai/artifact/V9DKVsKPguVWjCGFacb5iM"],
  ["hub", "POST", "https://claude.ai/api/organizations/x/artifacts/y/data"],
  ["hub", "GET", "https://abc123.claudeusercontent.com/index.html"],
  ["hub", "GET", "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"],
  ["hub", "GET", "https://fonts.gstatic.com/s/inter/v13/x.woff2"],
  ["login", "GET", "https://accounts.google.com/o/oauth2/v2/auth"],
  ["login", "POST", "https://claude.ai/api/auth/send_magic_link"],
  ["background", "GET", "https://claude.ai/sw.js"],
];
// [caller, method, url, why]
const VIEW_ODD = [
  ["hub", "GET", "https://www.google-analytics.com/collect", "tracking"],
  ["hub", "POST", "https://cdnjs.cloudflare.com/x", "posting to a CDN"],
  ["hub", "GET", "https://example.com/", "an unknown site"],
  ["shell", "GET", "https://claude.ai/", "the steel strip calling out"],
];
test("the hub page's normal traffic is allowed", () => {
  const b = make(VIEW, "MD Hub (hub page)");
  for (const [caller, method, url] of VIEW_OK) { const r = b.check({ url, method }, caller); assert.strictEqual(r.decision, "allow", `${caller} ${method} ${url}: ${r.why}`); }
});
test("odd hub page traffic is logged but not blocked (observe)", () => {
  const b = make(VIEW, "MD Hub (hub page)");
  for (const [caller, method, url, what] of VIEW_ODD) { const r = b.check({ url, method }, caller); assert.notStrictEqual(r.decision, "allow", `${what} should be flagged`); assert.strictEqual(r.allow, true, `${what} must not be blocked in observe mode`); }
});

test("only common/net.js sends requests", () => {
  const roots = [path.join(__dirname, "../src/main"), path.join(__dirname, "../../common")], bad = [];
  const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== "node_modules") walk(p); } else if (/\.js$/.test(f) && !/net\.js$/.test(f)) {
    const t = fs.readFileSync(p, "utf8"); if (/\bfetch\s*\(|\bhttps?\.(request|get)\s*\(|\bnet\.request\b|XMLHttpRequest|new\s+WebSocket/.test(t.replace(/\/\/.*$/gm, ""))) bad.push(path.relative(path.join(__dirname, ".."), p)); } } };
  roots.forEach(walk);
  assert.deepStrictEqual(bad, [], "these files send requests without going through Bouncer");
});

test("sign-in windows' rules are locked and enforcing here too", () => {
  const S = { policyText: fs.readFileSync(path.join(__dirname, "../src/common/signin-policy.cedar"), "utf8"),
    config: JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.signin.config.json"), "utf8")), lock: JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.signin.lock.json"), "utf8")) };
  assert.deepStrictEqual({ p: S.lock.policySha256, c: S.lock.configSha256 }, fp(S)); assert.strictEqual(S.config.mode, "enforce");
  const b = make(S, "MD Hub (sign-in windows)"); assert.strictEqual(b.status().healthy, true);
  assert.strictEqual(b.check({ url: "https://slack.com/oauth/v2/authorize", method: "GET" }, "slack-signin").decision, "allow");
  assert.strictEqual(b.check({ url: "https://claude.ai/", method: "GET" }, "slack-signin").allow, false);
});

test("a URL with a broken %-escape is judged, never throws out of the request hook", () => {
  const app = make(APP);
  assert.throws(() => app.assert({ url: "https://ipwho.is/50%off", method: "GET" }, "app"), e => e.code === "BOUNCED");
  let handler; app.attachSession({ webRequest: { onBeforeRequest: (_f, h) => { handler = h; } } });
  let out = null; handler({ url: "https://ipwho.is/50%off", method: "GET", webContentsId: 3 }, r => { out = r; });
  assert.deepStrictEqual(out, { cancel: true }, "enforced: blocked");
  const view = make(VIEW, "MD Hub (hub page)");
  view.attachSession({ webRequest: { onBeforeRequest: (_f, h) => { handler = h; } } });
  out = null; handler({ url: "https://claude.ai/search/50%off", method: "GET", webContentsId: 4 }, r => { out = r; });
  assert.deepStrictEqual(out, { cancel: false }, "observe: logged, not blocked");
});
