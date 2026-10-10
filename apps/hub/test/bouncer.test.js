// Bouncer for MD Hub: both rule sets checked with real Cedar.
//   app  (policy.cedar, enforced): the app's own requests.
//   view (view-policy.cedar, observe): the hub page on claude.ai, which is logged, never blocked.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createBouncer, fingerprint } = require("../kit/bouncer");
const DIR = path.join(__dirname, "../src/main/bouncer");
const load = (p, c, l) => ({ policyText: fs.readFileSync(path.join(DIR, p), "utf8"), config: JSON.parse(fs.readFileSync(path.join(DIR, c), "utf8")), lock: JSON.parse(fs.readFileSync(path.join(DIR, l), "utf8")) });
const APP = load("policy.cedar", "bouncer.config.json", "bouncer.lock.json");
const VIEW = load("view-policy.cedar", "bouncer.view.config.json", "bouncer.view.lock.json");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mdhub-b-"));
const make = (s, name = "MD Hub") => createBouncer({ appName: name, ...s, logDir: tmp(), enginePackageVersion: "4.13.0" });
const fp = s => { const f = fingerprint(s.policyText, s.config); return { p: f.policySha256, c: f.configSha256 }; };

test("both rule sets are locked and healthy; app enforces, hub page observes", () => {
  for (const [s, mode] of [[APP, "enforce"], [VIEW, "observe"]]) {
    assert.deepStrictEqual({ p: s.lock.policySha256, c: s.lock.configSha256 }, fp(s), "run npm run bouncer:lock after reviewing a rules change");
    assert.strictEqual(s.config.mode, mode);
    const st = make(s).status(); assert.strictEqual(st.healthy, true, st.problems.join("; ")); assert.strictEqual(st.mode, mode);
  }
});

const ALLOW = [
  "https://api.open-meteo.com/v1/forecast?latitude=41.2&longitude=-95.9&current=temperature_2m",
  "https://geocoding-api.open-meteo.com/v1/search?count=1&name=Omaha",
  "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=41.2&longitude=-95.9&localityLanguage=en",
  "https://ipwho.is/", "https://get.geojs.io/v1/ip/geo.json",
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80",
  "https://site.api.espn.com/apis/site/v2/sports/rugby/267979/scoreboard",
  "https://slack.com/api/conversations.list?types=public_channel&limit=1000",
  "https://slack.com/api/conversations.history?channel=C2WCGG31N&limit=20&oldest=1",
  "https://slack.com/api/users.info?user=U123", "https://slack.com/api/auth.revoke",
  "https://api.github.com/repos/Octoroboto/mdfm/releases?per_page=30",
  "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/manifest.json",
  "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/receiver.css",
  "https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest",
  "https://registry.npmjs.org/-/package/electron/dist-tags",
];
const BLOCK = [
  ["POST", "https://slack.com/api/chat.postMessage", "posting to Slack"],
  ["GET", "https://slack.com/api/chat.postMessage?channel=C1&text=hi", "posting to Slack via GET"],
  ["GET", "https://slack.com/api/conversations.join?channel=C1", "joining a channel"],
  ["GET", "https://slack.com/api/files.list", "reading files"],
  ["GET", "https://api.github.com/repos/Octoroboto/floorplan-video-uploader/releases", "another repo"],
  ["GET", "https://claude.ai/api/organizations", "the app's own code calling claude.ai"],
  ["GET", "https://example.com/", "an unknown site"],
  ["GET", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/dist/radio.html", "radio content (the hub app doesn't need it)"],
  ["GET", "https://raw.githubusercontent.com/someone-else/meddev-receiver/main/dist/receiver.js", "a look from another account"],
  ["GET", "https://registry.npmjs.org/left-pad", "other npm packages"],
  ["PUT", "https://api.open-meteo.com/v1/forecast", "a change"],
];
test("every request the app's own code makes is allowed", () => {
  const b = make(APP);
  for (const url of ALLOW) { const r = b.check({ url, method: "GET" }, "app"); assert.strictEqual(r.decision, "allow", `${url}: ${r.why}`); }
});
test("the OSV security lookup is the only POST", () => {
  const b = make(APP), body = JSON.stringify({ queries: [{ package: { name: "electron", ecosystem: "npm" }, version: "44.5.1" }] });
  assert.strictEqual(b.check({ url: "https://api.osv.dev/v1/querybatch", method: "POST", body, contentType: "application/json" }, "app").decision, "allow");
  assert.strictEqual(b.check({ url: "https://api.osv.dev/v1/querybatch", method: "POST", body: JSON.stringify({ queries: [], extra: 1 }), contentType: "application/json" }, "app").allow, false);
});
test("anything else from the app is blocked", () => {
  const b = make(APP);
  for (const [method, url, what] of BLOCK) assert.strictEqual(b.check({ url, method }, "app").allow, false, `${what} should be blocked`);
  for (const caller of ["shell", "ui"]) assert.strictEqual(b.check({ url: "https://api.open-meteo.com/v1/forecast", method: "GET" }, caller).allow, false, `${caller} window calling an API`);
  assert.throws(() => b.assert({ url: "https://example.com/x", method: "GET" }), /Blocked by Bouncer/);
});
test("a changed rules file without a new lock blocks everything", () => {
  const b = createBouncer({ appName: "x", policyText: APP.policyText + "\n// edit", config: APP.config, lock: APP.lock, logDir: tmp() });
  assert.strictEqual(b.status().healthy, false);
  assert.strictEqual(b.check({ url: "https://ipwho.is/", method: "GET" }, "app").allow, false);
});

// The hub page: what it normally does must be quiet; anything else is logged as "would block" (never blocked).
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
