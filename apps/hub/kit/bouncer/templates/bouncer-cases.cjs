// The questions every Cedar upgrade (and every rules change) must answer the same way, with the answer each should get.
// Copy to test/bouncer-cases.cjs and add a line for everything the app sends, and for what it must never send.
// Plain data, no requires: the upgrade workflow loads it outside the app (kit/bouncer/tools/cedar-diff.cjs).
//   { caller, method, url, body?, contentType?, formFields?, sameToday?, expect: "allow" | "deny", note }
// or the short form: [caller, method, url, body, expect, note].
// These match kit/bouncer/templates/policy.cedar; replace them with the app's own.
module.exports = [
  ["app", "GET", "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/manifest.json", null, "allow", "receiver looks"],
  ["app", "GET", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/dist/manifest.json", null, "allow", "MDFM content"],
  ["app", "GET", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/src/engine.js", null, "deny", "MDFM source files"],
  ["app", "GET", "https://registry.npmjs.org/-/package/electron/dist-tags", null, "allow", "newest Electron version"],
  ["app", "POST", "https://registry.npmjs.org/-/package/electron/dist-tags", "x=1", "deny", "anything but reading"],
  ["app", "GET", "http://registry.npmjs.org/-/package/electron/dist-tags", null, "deny", "plain http"],
  ["app", "GET", "https://example.com/", null, "deny", "anywhere not listed"],
  ["ui", "GET", "https://fonts.gstatic.com/s/rye/v1/a.woff2", null, "allow", "the window loads a skin font"],
  ["ui", "GET", "https://raw.githubusercontent.com/Octoroboto/meddev-receiver/main/dist/manifest.json", null, "deny", "the window reaching the network itself"],
  ["app", "DELETE", "https://raw.githubusercontent.com/Octoroboto/mdfm/main/dist/manifest.json", null, "deny", "a delete, anywhere"],
];
