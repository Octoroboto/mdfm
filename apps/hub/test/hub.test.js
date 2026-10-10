// MD Hub pieces that don't need a window: picking the right release, and which frames get the radio bridge.
const test = require("node:test"), assert = require("node:assert"), Module = require("module"), fs = require("fs"), path = require("path");
const realLoad = Module._load;
Module._load = function (req, ...rest) { return req === "electron" ? { app: { getAppPath: () => __dirname }, dialog: {}, shell: {} } : realLoad.call(this, req, ...rest); };
const net = require("../src/common/net");

test("update check picks the newest hub-v release and the .dmg for this chip", async () => {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, html_url: "https://github.com/Octoroboto/mdfm/releases/tag/" + tag, body: "notes",
    assets: [{ name: `MD Hub-${tag.slice(5)}-arm64.dmg`, browser_download_url: "https://dl/arm64.dmg" }, { name: `MD Hub-${tag.slice(5)}.dmg`, browser_download_url: "https://dl/x64.dmg" }], ...extra });
  const orig = net.getJSON;
  net.getJSON = async () => [rel("radio-v9.9.9"), rel("hub-v0.1.0"), rel("hub-v0.10.0"), rel("hub-v0.2.0"), rel("hub-v1.0.0", { draft: true })];
  try {
    delete require.cache[require.resolve("../src/main/futureproof")];
    const { latestRelease } = require("../src/main/futureproof");
    const u = await latestRelease();
    assert.strictEqual(u.version, "0.10.0", "versions compare as numbers; radio and draft releases are ignored");
    assert.strictEqual(u.download, arch === "arm64" ? "https://dl/arm64.dmg" : "https://dl/x64.dmg");
  } finally { net.getJSON = orig; }
});

test("only claude.ai frames are trusted with the radio bridge", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/main/view-preload.js"), "utf8");
  const re = new RegExp(src.match(/\/(\(\^\|\\\.\)\(claudeusercontent[^/]+)\//)[1]);
  for (const h of ["abc.claudeusercontent.com", "claude.ai", "www.claude.ai", "claude.site"]) assert.ok(re.test(h), h);
  for (const h of ["claude.ai.evil.com", "notclaude.ai", "evilclaudeusercontent.com", "example.com"]) assert.ok(!re.test(h), h);
  assert.match(src, /window\.top !== window/, "the bridge only goes into the artifact's frame, not the top page");
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
