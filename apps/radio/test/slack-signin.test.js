// Slack sign-in in an app window, the helper address, and the builder's setup wizard (the parts that don't need a window).
// Tests common/signin.js allowed(), common/slack-config.js, slack-setup.js's output parsers, common/slack.js connect() and
// common/signin-policy.cedar (real Cedar). No Electron: sign-in windows are faked.
// Run: cd apps/radio && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test, so src/common exists). Node's built-in runner, no window.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { allowed, SLACK_HOSTS, CLOUDFLARE_HOSTS } = require("../src/common/signin");
const { createSlackConfig, validRelay } = require("../src/common/slack-config");
const S = require("../src/common/slack-setup");
const { createSlack } = require("../src/common/slack");

test("the sign-in window only goes to sign-in sites, the helper and this app's own one-time port", () => {
  const o = { hosts: SLACK_HOSTS, extraHosts: ["mdfm-slack.rv.workers.dev"], localPorts: [53111] };
  for (const u of ["https://slack.com/oauth/v2/authorize?x=1", "https://rentvision.slack.com/sso", "https://a.slack-edge.com/x.js", "https://accounts.google.com/o/oauth2",
    "https://mdfm-slack.rv.workers.dev/callback?code=1", "http://127.0.0.1:53111/slack"]) assert.ok(allowed(u, o), u);
  for (const u of ["https://evil.com/", "http://slack.com/", "http://127.0.0.1:9999/slack", "https://slack.com.evil.com/", "file:///etc/passwd", "javascript:alert(1)",
    "https://other.workers.dev/"]) assert.ok(!allowed(u, o), u);
  assert.ok(allowed("https://dash.cloudflare.com/oauth2/auth?x", { hosts: CLOUDFLARE_HOSTS, localPorts: [8976] }));
  assert.ok(allowed("http://localhost:8976/oauth/callback?code=1", { hosts: CLOUDFLARE_HOSTS, localPorts: [8976] }));
  assert.ok(!allowed("https://slack.com/", { hosts: CLOUDFLARE_HOSTS }));
  assert.ok(allowed("https://login.example-sso.com/", { hosts: CLOUDFLARE_HOSTS, anyHttps: true }), "the builder's Cloudflare window may follow any https sign-in");
  assert.ok(!allowed("http://example.com/", { hosts: CLOUDFLARE_HOSTS, anyHttps: true }) && !allowed("http://localhost:9/", { anyHttps: true }));
});

test("helper address: this Mac's setting, then the app, then the repo's switch; only plain https", async () => {
  assert.ok(validRelay("https://mdfm-slack.rv.workers.dev")); assert.ok(validRelay("https://mdfm-slack.rv.workers.dev/"));
  for (const v of ["http://x.workers.dev", "https://x.workers.dev/steal", "https://u:p@x.workers.dev", "https://x.workers.dev?a=1", "", null, "javascript:1"]) assert.ok(!validRelay(v), String(v));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scfg-")); let override = "";
  let remote = { relay: "https://mdfm-slack.rv.workers.dev" };
  const c = createSlackConfig({ dataDir: dir, getJSON: async () => remote, getOverride: () => override });
  assert.strictEqual(c.relay(), "", "nothing until it's switched on");
  await c.refresh(); assert.strictEqual(c.relay(), "https://mdfm-slack.rv.workers.dev"); assert.strictEqual(c.status.source, "MedDev");
  const again = createSlackConfig({ dataDir: dir, getJSON: async () => { throw new Error("offline"); } });
  assert.strictEqual(again.relay(), "https://mdfm-slack.rv.workers.dev", "remembered across launches, works offline");
  override = "https://mine.rv.workers.dev"; assert.strictEqual(c.relay(), "https://mine.rv.workers.dev");
  remote = { relay: "http://evil.example/" }; override = ""; const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "scfg-"));
  const bad = createSlackConfig({ dataDir: d2, getJSON: async () => remote }); await bad.refresh(); assert.strictEqual(bad.relay(), "", "a bad address is ignored");
  const none = createSlackConfig({ dataDir: d2, getJSON: async () => { throw new Error("raw.githubusercontent.com 404"); } });
  await none.refresh(); assert.match(none.status.result, /not switched on/);
});

test("setup wizard reads Cloudflare's and Slack's output correctly", () => {
  assert.strictEqual(S.findLoginUrl("Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d1\nWaiting"), "https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d1");
  assert.strictEqual(S.findLoginUrl("Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=co"), null, "waits for the whole link");
  assert.strictEqual(S.findLoginUrl("\u001b[33mVisit https://dash.cloudflare.com/oauth2/auth?a=1&b=2\u001b[39m\n"), "https://dash.cloudflare.com/oauth2/auth?a=1&b=2");
  assert.strictEqual(S.findWorkerUrl("Uploaded mdfm-slack (1.2 sec)\nDeployed mdfm-slack triggers\n  https://mdfm-slack.robd.workers.dev\nCurrent Version ID: x"), "https://mdfm-slack.robd.workers.dev");
  assert.ok(S.needsSubdomain("You need to register a workers.dev subdomain before publishing to workers.dev"));
  assert.ok(S.loggedIn("Getting User settings...\n👋 You are logged in with an OAuth Token, associated with the email rob@x")); assert.ok(!S.loggedIn("You are not authenticated. Please run `wrangler login`."));
  assert.strictEqual(S.findTeamId("https://app.slack.com/client/T02ABCDEF/C0123"), "T02ABCDEF");
  assert.strictEqual(S.findAppId("https://api.slack.com/apps/A09XYZ123/general"), "A09XYZ123");
  assert.ok(S.validClientId("1234567890.9876543210") && !S.validClientId("abc"));
  assert.ok(S.validSecret("0123456789abcdef0123456789abcdef") && !S.validSecret("short"));
  assert.ok(S.validTeam("T02ABCDEF") && !S.validTeam("U123"));
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, "../../slack-relay/slack-app-manifest.json"), "utf8"));
  const m = S.manifestFor("https://mdfm-slack.robd.workers.dev/", base);
  assert.deepStrictEqual(m.oauth_config.redirect_urls, ["https://mdfm-slack.robd.workers.dev/callback"]);
  assert.deepStrictEqual(m.oauth_config.scopes.user, ["channels:history", "channels:read", "users:read"], "read-only scopes, unchanged");
  assert.match(S.slackCreateUrl(m), /^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=%7B/);
});

test("connect: the sign-in window gets the helper's start page, then closes itself when the token comes back", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slk-"));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  let opened = null, closed = false;
  const slack = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => "https://mdfm-slack.rv.workers.dev",
    openSignIn: (url, onClosed) => { opened = url; return { close: () => { closed = true; }, focus() {} }; } });
  assert.strictEqual(slack.ready, true);
  const p = slack.connect();
  await new Promise(r => setTimeout(r, 50));
  const u = new URL(opened); assert.strictEqual(u.origin + u.pathname, "https://mdfm-slack.rv.workers.dev/start");
  const port = +u.searchParams.get("port"), nonce = u.searchParams.get("nonce");
  const post = body => new Promise((res, rej) => { const r = http.request({ host: "127.0.0.1", port, path: "/slack", method: "POST" }, x => { x.resume(); x.on("end", () => res(x.statusCode)); }); r.on("error", rej); r.end(body); });
  assert.strictEqual(await post(new URLSearchParams({ nonce: "wrong", token: "xoxp-1" }).toString()), 400, "a wrong nonce is refused");
  assert.strictEqual(await post(new URLSearchParams({ nonce, token: "xoxp-123", team: "T1" }).toString()), 200);
  assert.strictEqual(await p, true); assert.strictEqual(slack.connected, true);
  await new Promise(r => setTimeout(r, 1300)); assert.ok(closed, "the window closes itself");
});

test("connect: closing the sign-in window cancels cleanly, and nothing happens until Slack is switched on", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slk-")), safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  let cancel; const slack = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => "https://mdfm-slack.rv.workers.dev",
    openSignIn: (url, onClosed) => { cancel = onClosed; return { close() {}, focus() {} }; } });
  const p = slack.connect(); await new Promise(r => setTimeout(r, 50)); cancel();
  await assert.rejects(p, /closed before it finished/);
  const off = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => "" });
  assert.strictEqual(off.ready, false); await assert.rejects(off.connect(), /isn't switched on/);
});

test("sign-in windows' Bouncer (real Cedar): Slack and its sign-in, the helper and the way back; nothing else", () => {
  const { createBouncer, fingerprint } = require("../kit/bouncer");
  const DIR = path.join(__dirname, "../src/main/bouncer");
  const policyText = fs.readFileSync(path.join(__dirname, "../src/common/signin-policy.cedar"), "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.signin.config.json"), "utf8")), lock = JSON.parse(fs.readFileSync(path.join(DIR, "bouncer.signin.lock.json"), "utf8"));
  assert.deepStrictEqual([lock.policySha256, lock.configSha256], (f => [f.policySha256, f.configSha256])(fingerprint(policyText, config)), "run npm run bouncer:lock");
  const b = createBouncer({ appName: "t", policyText, config, lock, logDir: fs.mkdtempSync(path.join(os.tmpdir(), "sb-")), enginePackageVersion: "4.13.0" });
  assert.strictEqual(b.status().healthy, true); assert.strictEqual(config.mode, "enforce");
  const ok = (caller, method, url) => assert.strictEqual(b.check({ url, method }, caller).decision, "allow", `${caller} ${method} ${url}`);
  const no = (caller, method, url) => assert.strictEqual(b.check({ url, method }, caller).allow, false, `${caller} ${method} ${url} should be blocked`);
  for (const u of ["https://slack.com/oauth/v2/authorize?x", "https://rentvision.slack.com/sso/saml", "https://a.slack-edge.com/app.js", "https://accounts.google.com/o/oauth2/v2/auth",
    "https://www.gstatic.com/x.js", "https://mdfm-slack.robd.workers.dev/start?port=5&nonce=x", "https://mdfm-slack.robd.workers.dev/callback?code=1"]) { ok("slack-signin", "GET", u); ok("background", "GET", u); }
  ok("slack-signin", "POST", "https://slack.com/api/signin.check"); ok("slack-signin", "POST", "http://127.0.0.1:53111/slack");
  no("slack-signin", "GET", "https://example.com/"); no("slack-signin", "GET", "https://evil.workers.dev/"); no("slack-signin", "GET", "https://dash.cloudflare.com/");
  no("ui", "POST", "http://127.0.0.1:53111/slack"); no("slack-signin", "POST", "http://127.0.0.1:53111/other");
  ok("setup", "GET", "https://dash.cloudflare.com/oauth2/auth?x"); ok("setup", "POST", "https://api.slack.com/apps"); ok("background", "GET", "https://dash.cloudflare.com/api/v4/x");
  ok("setup", "GET", "https://some-sso.example.com/login");
});

test("connect: refused while Slack is off, then works once the helper's address arrives (no stuck sign-in)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slk-")), safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  let relay = "", opened = null, cancel;
  const slack = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => relay,
    openSignIn: (url, onClosed) => { opened = url; cancel = onClosed; return { close() {}, focus() {} }; } });
  await assert.rejects(slack.connect(), /isn't switched on/);
  relay = "https://mdfm-slack.rv.workers.dev";
  const p = slack.connect(); await new Promise(r => setTimeout(r, 50));
  assert.ok(opened && opened.startsWith(relay + "/start?"), "the sign-in window opens"); cancel();
  await assert.rejects(p, /closed before it finished/);
  const boom = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => relay, openSignIn: () => { throw new Error("no window"); } });
  await assert.rejects(boom.connect(), /no window/, "a window that can't open fails the sign-in instead of leaving it hanging");
});
