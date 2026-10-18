// MD Hub pieces that don't need a window: picking the right release, and which frames get the radio bridge.
// Run: cd apps/hub && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test). No window: "electron" is faked below.
const test = require("node:test"), assert = require("node:assert"), Module = require("module"), fs = require("fs"), path = require("path");
const realLoad = Module._load;
// Any require("electron") gets a tiny fake (app.getAppPath, dialog, shell), so main-process modules load in plain Node.
Module._load = function (req, ...rest) { return req === "electron" ? { app: { getAppPath: () => __dirname }, dialog: {}, shell: {} } : realLoad.call(this, req, ...rest); };
const net = require("../src/common/net");

test("update check picks the newest hub-v release and the .dmg for this chip", async () => {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, html_url: "https://github.com/Octoroboto/mdfm/releases/tag/" + tag, body: "notes",
    assets: [{ name: `MD Hub-${tag.slice(5)}-arm64.dmg`, browser_download_url: "https://dl/arm64.dmg" }, { name: `MD Hub-${tag.slice(5)}.dmg`, browser_download_url: "https://dl/x64.dmg" }], ...extra });
  const orig = net.getJSON;
  net.getJSON = async () => [rel("radio-v9.9.9"), rel("hub-v0.1.0"), rel("hub-v0.10.0"), rel("hub-v0.2.0"), rel("hub-v1.0.0", { draft: true }), rel("hub-v0.11.0", { prerelease: true })];
  try {
    delete require.cache[require.resolve("../src/main/futureproof")];
    const { latestRelease } = require("../src/main/futureproof");
    const u = await latestRelease();
    assert.strictEqual(u.version, "0.10.0", "versions compare as numbers; radio, draft and pre-releases are ignored");
    assert.strictEqual(u.download, arch === "arm64" ? "https://dl/arm64.dmg" : "https://dl/x64.dmg");
  } finally { net.getJSON = orig; }
});

test("only the hub artifact's own sandbox frame gets the radio bridge", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/main/view-preload.js"), "utf8");
  const re = new RegExp(src.match(/isFrame && \/(.+?)\/\.test\(host\)/)[1]);
  for (const h of ["abc.claudeusercontent.com", "x-1.claudeusercontent.com"]) assert.ok(re.test(h), h);
  for (const h of ["claude.ai", "claude.site", "evilclaudeusercontent.com", "claudeusercontent.com.evil.com", "example.com"]) assert.ok(!re.test(h), h);
  assert.match(src, /window\.top !== window/, "the bridge only goes into the artifact's frame, not the top page");
  assert.match(src, /sendSync\("hub:bridgeOk"\) === true/, "main decides before anything is exposed");
  assert.ok(src.indexOf('sendSync("hub:bridgeOk")') < src.indexOf("exposeInMainWorld"));
});

test("bridge scope: the hub artifact (or the hubUrl setting's), its claudeusercontent frame, nothing else", () => {
  const s = require("../src/main/bridge-scope"), HUB = "https://claude.ai/artifact/V9DKVsKPguVWjCGFacb5iM", FRAME = "https://a1b2c3.claudeusercontent.com/?x=1";
  const ids = s.allowedIds({ hubUrl: "https://claude.ai/artifact/NewHub12345" });
  assert.deepStrictEqual([...ids].sort(), ["NewHub12345", "V9DKVsKPguVWjCGFacb5iM"]);
  assert.ok(s.allowedIds({ bridgeArtifacts: ["Extra123456", "../bad"] }).has("Extra123456") && !s.allowedIds({ bridgeArtifacts: ["../bad"] }).has("../bad"));
  assert.strictEqual(s.artifactId(HUB), "V9DKVsKPguVWjCGFacb5iM");
  assert.strictEqual(s.artifactId("https://claude.ai/public/artifacts/abc-123-def"), "abc-123-def");
  assert.strictEqual(s.artifactId("https://claude.ai/chat/abc"), null); assert.strictEqual(s.artifactId("https://evil.com/artifact/V9DKVsKPguVWjCGFacb5iM"), null);
  const v = (frameUrl, topUrl, between = []) => s.frameVerdict({ frameUrl, topUrl, between, ids });
  assert.strictEqual(v(FRAME, HUB), "ok");
  assert.strictEqual(v(FRAME, "https://claude.ai/artifact/NewHub12345/"), "ok");
  assert.strictEqual(v(FRAME, HUB, ["https://b.claudeusercontent.com/", "https://claude.ai/embed"]), "ok", "sandbox wrappers in between are fine");
  assert.strictEqual(v(FRAME, "https://claude.ai/artifact/SomeoneElse99"), "deny", "another artifact is refused");
  assert.strictEqual(v(FRAME, "https://claude.ai/public/artifacts/SomeoneElse99"), "deny");
  assert.strictEqual(v(FRAME, HUB, ["https://ads.example.com/"]), "deny", "a third-party frame in between is refused");
  assert.strictEqual(v("https://claude.site/x", HUB), "deny"); assert.strictEqual(v("http://a.claudeusercontent.com/", HUB), "deny");
  assert.strictEqual(v(FRAME, "https://example.com/artifact/V9DKVsKPguVWjCGFacb5iM"), "deny");
  assert.strictEqual(v(FRAME, "https://claude.ai/some/new/layout"), "unknown", "safety valve: an unrecognised claude.ai address is allowed (with a warning)");
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  assert.match(main, /return v !== "deny"/); assert.match(main, /console\.warn\(msg\)/);
  assert.match(main, /if \(hubFrame\(f\)\) f\.send\("hub:settings:changed"/, "settings are only pushed to the hub's own frame");
});

test("location and notifications only for the hub's own origins; login pop-ups can't wander or open windows", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  assert.match(main, /ownOnly = new Set\(\["geolocation", "notifications"\]\)/);
  assert.match(main, /setPermissionRequestHandler\(\(wc, perm, cb, d\) => cb\(permOk\(/); assert.match(main, /setPermissionCheckHandler\(\(wc, perm, origin\) => permOk\(/);
  const pop = main.slice(main.indexOf('wc.on("did-create-window"'), main.indexOf('wc.on("did-create-window"') + 600);
  for (const k of ["setWindowOpenHandler", '"will-navigate"', '"will-redirect"']) assert.ok(pop.includes(k), k);
});

test("the hub page can't change app-only settings", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  const block = main.slice(main.indexOf('"hub:settings:set"'), main.indexOf('"hub:settings:set"') + 600);
  assert.ok(/fromHub\(e\)/.test(block));
  for (const k of ["hubUrl", "city", "slackChannels", "nameFixes", "skipVersion"]) assert.ok(!block.includes(k), `hub page must not set ${k}`);
});

test("foreground: Bouncer and Futureproofer badges with status lights are always on the strip", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/shell/shell.html"), "utf8");
  const strip = html.slice(html.indexOf('id="strip"'), html.indexOf("</div>", html.indexOf('id="strip"')));
  for (const id of ["bdgBouncer", "bdgFp"]) assert.match(strip, new RegExp(`id="${id}"[^>]*>\\s*<i class="led">`), `${id} badge with an LED`);
  const fp = fs.readFileSync(path.join(__dirname, "../src/main/futureproof.js"), "utf8");
  assert.match(fp, /"Download", "Later", "Skip this version"/, "updates are offered, never forced");
  assert.ok(!/autoUpdater|app\.quit|quitAndInstall/.test(fp), "nothing installs or quits on its own");
});

test("the same content switches everywhere: shared list, app settings, engine", async () => {
  const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "../../../skin/types.js"), "utf8"))(win);
  const keys = win.MDFM_TYPES.map(t => t[0]);
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  assert.deepStrictEqual(JSON.parse(main.match(/const TYPE_KEYS = (\[[^\]]+\])/)[1]), keys, "main's list matches the shared list");
  const eng = fs.readFileSync(path.join(__dirname, "../../../src/engine.js"), "utf8");
  assert.deepStrictEqual(JSON.parse(eng.match(/const TYPE_KEYS=(\[[^\]]+\])/)[1]), keys, "the engine's list matches the shared list");
  const html = fs.readFileSync(path.join(__dirname, "../src/shell/shell.html"), "utf8");
  assert.ok(html.indexOf('src="types.js"') < html.indexOf('src="shell.js"') && html.includes('id="setTypes"'), "Settings has the switches");
});
