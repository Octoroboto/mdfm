// Futureproofer kit as MDFM Radio uses it: checks run, results stick, failures show amber and never pass silently.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { createFutureproofer, checks } = require("../kit/futureproofer");
test("electron and package checks read npm dist-tags", async () => {
  const getJson = async url => (/electron/.test(url) ? { latest: "46.1.0" } : { latest: "4.13.0" });
  assert.strictEqual((await checks.checkElectron({ current: "44.5.1", getJson })).level, "warn");
  assert.strictEqual((await checks.checkElectron({ current: "41.0.0", getJson })).level, "bad");
  assert.strictEqual((await checks.checkPackage({ id: "b", title: "b", name: "@cedar-policy/cedar-wasm", current: "4.13.0", getJson })).level, "ok");
});
test("osv: known problems turn red", async () => {
  const r = await checks.checkVulnerabilities({ packages: [{ name: "electron", version: "44.5.1" }], postJson: async () => ({ results: [{ vulns: [{ id: "GHSA-x" }] }] }) });
  assert.strictEqual(r.level, "bad"); assert.match(r.summary, /electron/);
});
test("scheduler: an offline check shows amber, results are saved", async () => {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fp-")), "state.json");
  const fp = createFutureproofer({ appName: "MDFM Radio", stateFile, checks: [
    { id: "a", title: "A", run: async () => checks.result("a", "A", "ok", "fine") },
    { id: "b", title: "B", run: async () => { throw new Error("offline"); } }] });
  const st = await fp.run({ force: true });
  assert.strictEqual(st.results.find(r => r.id === "b").level, "warn");
  assert.match(st.results.find(r => r.id === "b").summary, /offline/);
  assert.ok(JSON.parse(fs.readFileSync(stateFile, "utf8")).results.a);
});
test("mac check: Intel and old macOS are flagged", () => {
  assert.strictEqual(checks.checkMac({ darwinRelease: "25.0.0", arch: "arm64", translated: false, minMacos: 13, testedMacos: 26 }).level, "ok");
  assert.strictEqual(checks.checkMac({ darwinRelease: "21.0.0", arch: "arm64", translated: false, minMacos: 13, testedMacos: 26 }).level, "bad");
});
