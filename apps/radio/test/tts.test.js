// Voices: at most 2 `say` runs at once with a short queue, identical lines rendered once, say's own [[commands]] removed,
// and the cache capped by size. `say` is faked (these run anywhere).
// Tests src/main/tts.js createTts().
// Run: cd apps/radio && npm test (copies apps/common into src/common first, then MDFM_TEST=1 node --test test/*.test.js).
// One file: MDFM_TEST=1 node --test test/<this file> (after one npm test, so src/common exists). Node's built-in runner, no window.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs");
const { createTts, MAX_RUNNING, MAX_QUEUE } = require("../src/main/tts");
// A fake `say`: records concurrency (now/peak), runs and the text files it was given, and writes bytes-sized WAVs after ms.
function fakeSay({ ms = 30, bytes = 1000 } = {}) {
  const st = { now: 0, peak: 0, runs: 0, texts: [] };
  const exec = (cmd, a, o, cb) => { st.now++; st.runs++; st.peak = Math.max(st.peak, st.now); st.texts.push(fs.readFileSync(a[a.indexOf("-f") + 1], "utf8"));
    setTimeout(() => { fs.writeFileSync(a[a.indexOf("-o") + 1], Buffer.alloc(bytes)); st.now--; cb(null, "", ""); }, ms); };
  return { st, tts: createTts({ exec, available: () => true }) };
}
test("tts: two at a time, a full queue answers busy, the same line at once is rendered once", async () => {
  const { st, tts } = fakeSay();
  const lines = Array.from({ length: 10 }, (_, i) => tts.render({ text: "word " + i }));
  const same = [tts.render({ text: "word 0" })];
  await Promise.all([...lines, ...same]);
  assert.strictEqual(st.peak, MAX_RUNNING); assert.strictEqual(st.runs, 10);
  const { tts: t2 } = fakeSay({ ms: 200 });
  const many = Array.from({ length: MAX_RUNNING + MAX_QUEUE + 3 }, (_, i) => t2.render({ text: "line " + i }).then(() => "ok", e => e.message));
  const out = await Promise.all(many);
  assert.strictEqual(out.filter(x => x === "busy").length, 3); assert.strictEqual(out.filter(x => x === "ok").length, MAX_RUNNING + MAX_QUEUE);
});
test("tts: say's own [[commands]] in the text are not acted on", async () => {
  const { st, tts } = fakeSay();
  await tts.render({ text: "hello [[slnc 60000]] there [[rate 700]]" });
  assert.ok(!/\[\[(slnc|rate)/.test(st.texts[0]), st.texts[0]);
});
test("tts: the cache keeps no huge entries and stays under its size cap", async () => {
  const big = fakeSay({ ms: 1, bytes: 5 * 1024 * 1024 });
  await big.tts.render({ text: "long" }); await big.tts.render({ text: "long" });
  assert.strictEqual(big.st.runs, 2, "a 5 MB line isn't cached"); assert.strictEqual(big.tts.stats().cached, 0);
  const mid = fakeSay({ ms: 1, bytes: 3 * 1024 * 1024 });
  for (let i = 0; i < 20; i++) await mid.tts.render({ text: "line " + i });
  assert.ok(mid.tts.stats().cacheBytes <= 40 * 1024 * 1024 && mid.tts.stats().cached === 13);
});
