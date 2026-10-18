// App updates download the .dmg in the app: only mdfm release .dmg files, redirects followed only to GitHub's file hosts.
// Tests common/app-download.js with a local fake of GitHub (no real downloads).
// Run: cd apps/radio && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test, so src/common exists). Node's built-in runner, no window.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createAppDownload, isReleaseDmg } = require("../src/common/app-download");
// A real-shaped release asset URL (the only kind start() accepts).
const URL0 = "https://github.com/Octoroboto/mdfm/releases/download/radio-v0.3.7/MDFM.Radio-0.3.7-arm64.dmg";
test("app download: only mdfm release .dmg files", () => {
  assert.ok(isReleaseDmg(URL0));
  assert.ok(isReleaseDmg("https://github.com/Octoroboto/mdfm/releases/download/hub-v0.2.7/MD.Hub-0.2.7.dmg"));
  for (const u of ["https://github.com/Octoroboto/mdfm/releases", "https://github.com/evil/mdfm/releases/download/radio-v1.0.0/x.dmg", "http://github.com/Octoroboto/mdfm/releases/download/radio-v0.3.7/x.dmg",
    "https://github.com/Octoroboto/mdfm/releases/download/radio-download/MDFM-Radio-Apple-chip.zip", "https://github.com/Octoroboto/mdfm/releases/download/radio-v0.3.7/../../x.dmg"]) assert.equal(isReleaseDmg(u), false, u);
});
test("app download: follows GitHub's redirect, saves into Downloads without clobbering, opens it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-")); fs.writeFileSync(path.join(dir, "MDFM.Radio-0.3.7-arm64.dmg"), "old");
  const body = Buffer.alloc(300000, 7), seen = [], prog = [];
  const real = global.fetch; global.fetch = async u => { seen.push(String(u));
    if (String(u) === URL0) return new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/x/y?sig=1" } });
    return new Response(body, { status: 200, headers: { "content-length": String(body.length) } }); };
  try {
    let opened = null; const dl = createAppDownload({ downloadsDir: dir, openFile: f => { opened = f; }, onProgress: p => prog.push(p.state) });
    const f = await dl.start(URL0);
    assert.equal(path.basename(f), "MDFM.Radio-0.3.7-arm64 (1).dmg"); assert.equal(fs.statSync(f).size, body.length); assert.equal(opened, f);
    assert.equal(seen.length, 2); assert.equal(prog[prog.length - 1], "done"); assert.ok(!fs.readdirSync(dir).some(n => n.endsWith(".part")));
  } finally { global.fetch = real; }
});
test("app download: a redirect to any other host is refused", async () => {
  const real = global.fetch; global.fetch = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x.dmg" } });
  try { const dl = createAppDownload({ downloadsDir: os.tmpdir(), openFile: () => {} }); await assert.rejects(dl.start(URL0), /blocked host/); }
  finally { global.fetch = real; }
});
test("app download: an encoded name can't climb out of Downloads, and a bad '%' doesn't throw", async () => {
  const dl = createAppDownload({ downloadsDir: os.tmpdir(), openFile: () => {} });
  for (const u of ["https://github.com/Octoroboto/mdfm/releases/download/hub-v9.9.9/..%2F..%2FLibrary%2FLaunchAgents%2Fx.dmg", "https://github.com/Octoroboto/mdfm/releases/download/hub-v9.9.9/a%zz.dmg"]) {
    assert.equal(isReleaseDmg(u), false, u);
    let p; assert.doesNotThrow(() => { p = dl.start(u); }); await assert.rejects(p, /not an MDFM release/);
  }
  await assert.rejects(dl.start("https://github.com/Octoroboto/mdfm/releases/download/hub-v9.9.9/.hidden.dmg"), /bad file name/);
});
test("app download: a download that stalls fails (and the next press starts afresh)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-")), real = global.fetch;
  global.fetch = async (u, o) => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1000)); o.signal.addEventListener("abort", () => c.error(o.signal.reason)); } }),
    { status: 200, headers: { "content-length": "5000" } });   // sends a little, then nothing
  try {
    const states = [], dl = createAppDownload({ downloadsDir: dir, openFile: () => {}, stallMs: 200, onProgress: p => states.push(p.state) });
    await assert.rejects(dl.start(URL0), /stalled/);
    assert.equal(states[states.length - 1], "failed"); assert.deepEqual(fs.readdirSync(dir), [], "the partial file is removed");
    await assert.rejects(dl.start(URL0), /stalled/, "a new press is a new download, not the stuck one");
  } finally { global.fetch = real; }
});
