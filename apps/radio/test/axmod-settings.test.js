// AXMOD settings: only small, plain values reach settings.json.
// Tests common/axmod-settings.js cleanAxmod(). Requires apps/common directly, so it runs without the sync.
// Run: cd apps/radio && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
const test = require("node:test"), assert = require("node:assert");
const { cleanAxmod } = require("../../common/axmod-settings");
test("keeps real AXMOD choices", () => {
  const v = cleanAxmod({ schema: 1, values: { contrast: true, size: "150", saturation: 70, voice: "com.apple.voice.Samantha" }, channels: { music: .5 } });
  assert.deepStrictEqual(v, { schema: 1, values: { contrast: true, size: "150", saturation: 70, voice: "com.apple.voice.Samantha" }, channels: { music: .5 } });
});
test("drops anything odd", () => {
  const v = cleanAxmod({ values: { "__proto__": true, "bad key": 1, big: 1e9, obj: { a: 1 }, long: "x".repeat(500), ok: false }, channels: { music: 7, "BAD": .2, sfx: "loud" } });
  assert.deepStrictEqual(v, { schema: 1, values: { ok: false }, channels: { music: 1 } });
  assert.deepStrictEqual(cleanAxmod(null), { schema: 1, values: {}, channels: {} });
  assert.deepStrictEqual(cleanAxmod("x"), { schema: 1, values: {}, channels: {} });
});
