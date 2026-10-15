// The Oct 15 audit fixes that don't need a window: atomic writes, capped answers, kept-copy pruning, one content check
// at a time, no pre-releases, and a Slack token that can't be stored fails the sign-in instead of the app.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { writeAtomic } = require("../src/common/write-atomic");

test("atomic write: replaces the file in one step, sets the mode on an existing file, leaves no side files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-")), f = path.join(dir, "a", "token");
  writeAtomic(f, "one"); assert.strictEqual(fs.readFileSync(f, "utf8"), "one");
  fs.chmodSync(f, 0o644); writeAtomic(f, Buffer.from("two"), 0o600);
  assert.strictEqual(fs.readFileSync(f, "utf8"), "two"); assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ["token"]);
  assert.throws(() => writeAtomic(path.join(dir, "a"), "x"), "a write that can't land throws"); assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ["token"]);
});

test("network: an answer over the size cap is refused (by its length header or as it streams)", async () => {
  const { getJSON } = require("../src/common/net"), real = global.fetch;
  global.fetch = async u => /big-header/.test(String(u)) ? new Response("{}", { headers: { "content-length": String(5e6) } })
    : /big-stream/.test(String(u)) ? new Response(new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(100000)); c.close(); } }))
    : new Response('{"ok":true}');
  try {
    assert.deepStrictEqual(await getJSON("https://api.github.com/ok"), { ok: true });
    await assert.rejects(getJSON("https://api.github.com/big-header"), /unexpectedly large/);
    await assert.rejects(getJSON("https://api.github.com/big-stream", { text: true }), /unexpectedly large/);
    assert.strictEqual((await getJSON("https://api.github.com/big-stream", { text: true, maxBytes: 20e6 })).length, 4e6, "content and look updates get a bigger cap");
  } finally { global.fetch = real; }
});

// An updater over a temporary userData and bundled folder, with the network faked.
function updaterWith(fake) {
  const net = require("../src/common/net"), real = net.getJSON;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-upd-")), ud = path.join(home, "userData"), bundledDir = path.join(home, "vendor");
  fs.mkdirSync(bundledDir); fs.writeFileSync(path.join(bundledDir, "version.json"), JSON.stringify({ version: "1.0.0" })); fs.writeFileSync(path.join(bundledDir, "radio.html"), "bundled");
  net.getJSON = fake; delete require.cache[require.resolve("../src/main/updater")];
  const { createUpdater } = require("../src/main/updater");
  const u = createUpdater({ app: { getPath: () => ud }, getSettings: () => ({ contentUpdates: true }), bundledDir, appVersion: "0.3.0" });
  return { u, engines: path.join(ud, "engines"), done: () => { net.getJSON = real; delete require.cache[require.resolve("../src/main/updater")]; } };
}

test("content updates: only the newest 2 kept copies stay, and odd folder names are left alone", () => {
  const t = updaterWith(async () => { throw new Error("offline"); });
  try {
    for (const v of ["1.9.0", "1.10.0", "1.11.0", "1.2.0", "notes"]) { fs.mkdirSync(path.join(t.engines, v), { recursive: true }); fs.writeFileSync(path.join(t.engines, v, "radio.html"), v); }
    t.u.prune();
    assert.deepStrictEqual(fs.readdirSync(t.engines).sort(), ["1.10.0", "1.11.0", "notes"]);
    assert.strictEqual(t.u.active().version, "1.11.0");
  } finally { t.done(); }
});

test("content updates: two checks at once share one request", async () => {
  let calls = 0;
  const t = updaterWith(async url => { calls++; await new Promise(r => setTimeout(r, 50)); return { version: "1.0.0" }; });
  try {
    await Promise.all([t.u.checkContent(), t.u.checkContent()]);
    assert.strictEqual(calls, 1); assert.match(t.u.status.result, /up to date/);
    await t.u.checkContent(); assert.strictEqual(calls, 2, "a later check runs again");
  } finally { t.done(); }
});

test("app updates: drafts and pre-releases are never offered", async () => {
  const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, html_url: "https://github.com/Octoroboto/mdfm/releases/tag/" + tag, assets: [], ...extra });
  const t = updaterWith(async () => [rel("radio-v0.3.1"), rel("radio-v0.4.0", { prerelease: true }), rel("radio-v0.5.0", { draft: true })]);
  try { await t.u.checkApp(); assert.strictEqual(t.u.status.appUpdate.version, "0.3.1"); } finally { t.done(); }
});

test("receiver looks: only the newest 2 kept copies stay, plus the one in use", () => {
  const { createReceiverUpdater } = require("../src/common/receiver");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rx-"));
  for (const v of ["1.1.0", "1.2.0", "1.3.0", "1.4.0"]) { fs.mkdirSync(path.join(dir, v)); fs.writeFileSync(path.join(dir, v, "receiver.js"), "x"); }
  const r = createReceiverUpdater({ dir, getJSON: async () => null, bundled: { version: "0.0.0" } });
  r.status.source = "updated"; r.status.version = "1.1.0";   // pretend the oldest is the one on screen
  r.prune();
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["1.1.0", "1.3.0", "1.4.0"]);
});

test("Slack: a token that can't be stored fails the sign-in (no 'connected' page, no crash)", async () => {
  const { createSlack } = require("../src/common/slack");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slk-"));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: () => { throw new Error("Encryption is not available"); }, decryptString: b => b.toString() };
  let opened = null;
  const slack = createSlack({ dataDir: dir, safeStorage, getSettings: () => ({}), relayUrl: () => "https://mdfm-slack.rv.workers.dev",
    openSignIn: url => { opened = url; return { close() {}, focus() {} }; } });
  const p = slack.connect(), failed = p.catch(e => e); await new Promise(r => setTimeout(r, 50));
  const u = new URL(opened), port = +u.searchParams.get("port"), nonce = u.searchParams.get("nonce");
  const code = await new Promise((res, rej) => { const q = http.request({ host: "127.0.0.1", port, path: "/slack", method: "POST" }, x => { x.resume(); x.on("end", () => res(x.statusCode)); }); q.on("error", rej); q.end(new URLSearchParams({ nonce, token: "xoxp-1" }).toString()); });
  assert.strictEqual(code, 400);
  assert.match((await failed).message, /Couldn't store the Slack token/); assert.strictEqual(slack.connected, false);
});
