// App updates download the .dmg in the app: only mdfm release .dmg files, redirects followed only to GitHub's file hosts.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createAppDownload, isReleaseDmg } = require("../src/common/app-download");
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
