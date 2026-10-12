// Bouncer for MDFM Radio: the real Cedar rules, checked against every request the app makes and a set it must never make.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createBouncer, fingerprint } = require("../kit/bouncer");
const DIR = path.join(__dirname, "../src/main/bouncer");
const policyText = fs.readFileSync(path.join(DIR, "policy.cedar"), "utf8");
const config = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.config.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.lock.json"), "utf8"));
const make = () => createBouncer({ appName: "MDFM Radio", policyText, config, lock, logDir: fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-b-")), enginePackageVersion: "4.13.0" });

test("rules are locked, enforcing and healthy", () => {
  assert.deepStrictEqual({ p: lock.policySha256, c: lock.configSha256 }, (({ policySha256: p, configSha256: c }) => ({ p, c }))(fingerprint(policyText, config)), "run npm run bouncer:lock after reviewing a rules change");
  assert.strictEqual(config.mode, "enforce");
  const st = make().status(); assert.strictEqual(st.healthy, true, st.problems.join("; ")); assert.strictEqual(st.mode, "enforce");
});

const ALLOW = [
  ["app", "https://api.open-meteo.com/v1/forecast?latitude=41.9&longitude=-87.6&current=temperature_2m"],
  ["app", "https://geocoding-api.open-meteo.com/v1/search?count=1&name=Chicago"],
  ["app", "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=41.9&longitude=-87.6&localityLanguage=en"],
  ["app", "https://ipwho.is/"],
  ["app", "https://get.geojs.io/v1/ip/geo.json"],
  ["app", "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"],
  ["app", "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard"],
  ["app", "https://slack.com/api/conversations.list?types=public_channel&limit=1000"],
  ["app", "https://slack.com/api/conversations.history?channel=C2WCGG31N&limit=20&oldest=1"],
  ["app", "https://slack.com/api/users.info?user=U123"],
  ["app", "https://slack.com/api/auth.revoke"],
  ["app", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/package.json"],
  ["app", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/dist/radio.html"],
  ["app", "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/manifest.json"],
  ["app", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/config/slack.json"],
  ["app", "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/receiver.js"],
  ["app", "https://api.github.com/repos/Octoroboto/mdfm/releases?per_page=20"],
  ["app", "https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest"],
  ["app", "https://registry.npmjs.org/-/package/electron/dist-tags"],
  ["app", "https://registry.npmjs.org/-/package/@cedar-policy/cedar-wasm/dist-tags"],
  ["radio", "https://fonts.googleapis.com/css2?family=VT323&display=swap"],
  ["radio", "https://fonts.gstatic.com/s/vt323/v17/abc.woff2"],
];
const BLOCK = [
  ["app", "POST", "https://slack.com/api/chat.postMessage", "posting to Slack"],
  ["app", "GET", "https://slack.com/api/chat.postMessage?channel=C1&text=hi", "posting to Slack via GET"],
  ["app", "GET", "https://slack.com/api/conversations.join?channel=C1", "joining a channel"],
  ["app", "GET", "https://slack.com/api/files.list", "reading files"],
  ["app", "GET", "https://slack.com/api/conversations.history?channel=D123", "fine path, but this one is allowed"],
  ["app", "GET", "https://raw.githubusercontent.com/someone-else/evil/main/radio.html", "another repo"],
  ["app", "GET", "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/src/receiver.css", "the receiver's source, not its checked dist"],
  ["app", "GET", "https://api.github.com/repos/Octoroboto/floorplan-video-uploader/releases", "another repo's releases"],
  ["app", "GET", "https://example.com/", "an unknown site"],
  ["app", "GET", "https://registry.npmjs.org/left-pad", "other npm packages"],
  ["app", "PUT", "https://api.open-meteo.com/v1/forecast", "a change"],
  ["app", "DELETE", "https://slack.com/api/users.info", "a delete"],
  ["radio", "GET", "https://api.open-meteo.com/v1/forecast", "the window calling an API"],
  ["radio", "GET", "https://www.google-analytics.com/collect", "tracking from the window"],
  ["background", "GET", "https://fonts.gstatic.com/s/x.woff2", "a service worker"],
  ["ui", "GET", "https://fonts.googleapis.com/css2", "an unlabelled window"],
].filter(x => !x[3].startsWith("fine path"));

test("every request the app makes is allowed", () => {
  const b = make();
  for (const [caller, url] of ALLOW) { const r = b.check({ url, method: "GET" }, caller); assert.strictEqual(r.decision, "allow", `${caller} ${url}: ${r.why}`); }
});
test("the OSV security lookup is the only POST", () => {
  const b = make(), body = JSON.stringify({ queries: [{ package: { name: "electron", ecosystem: "npm" }, version: "44.5.1" }] });
  assert.strictEqual(b.check({ url: "https://api.osv.dev/v1/querybatch", method: "POST", body, contentType: "application/json" }, "app").decision, "allow");
  assert.strictEqual(b.check({ url: "https://api.osv.dev/v1/querybatch", method: "POST", body: JSON.stringify({ queries: [], extra: 1 }), contentType: "application/json" }, "app").allow, false);
  assert.strictEqual(b.check({ url: "https://api.osv.dev/v1/query", method: "POST", body, contentType: "application/json" }, "app").allow, false);
  assert.strictEqual(b.check({ url: "https://slack.com/api/conversations.history", method: "POST", body: "{\"queries\":1}", contentType: "application/json" }, "app").allow, false);
});
test("anything else is blocked", () => {
  const b = make();
  for (const [caller, method, url, what] of BLOCK) { const r = b.check({ url, method }, caller); assert.strictEqual(r.allow, false, `${what} should be blocked: ${caller} ${method} ${url}`); }
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
