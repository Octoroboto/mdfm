// 1.29 MELODY (Groove & Key): COMPLEXITY, REPETITION, RANGE, HARMONY. As written at 50 (no extra random draws), live on
// MDFM, PTRN and CLUK, kept per station. On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs.
// Run: node scripts/build.mjs, then node --test test/*.test.mjs (or just this file). Needs dist/mdfm.mjs from the build.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM } = await import("../dist/mdfm.mjs");
// seed(n): replaces Math.random with a seeded mulberry32 stream, so a run is repeatable; done() puts the real one back.
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps. Always seed 11.
function sim(opts = {}) { mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 17, 9, 20).getTime() }); seed(11);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false, ...opts });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run }; }
const done = () => { mock.timers.reset(); Math.random = realRandom; };
// play(g): plays sec seconds with those groove settings and returns how many audio nodes were made (same number = same graph).
const play = async (g, sec = 20) => { const { ctx, r, run } = sim(); if (g) r.setGroove({ ...g, gv: 3 }); r.start(); await run(sec); r.stop(); const n = ctx.nodes; done(); return n; };

test("the four MELODY keys exist, centred at 50, in their own group, and only where MDFM writes the songs", () => {
  const { r } = sim(); const info = Object.fromEntries(r.grooveKeyInfo().map(m => [m.id, m]));
  for (const k of ["mel", "rep", "range", "harm"]) { assert.equal(info[k].group, "melody"); assert.equal(info[k].def, .5); assert.equal(info[k].bipolar, true); }
  assert.equal(r.grooveKeys().length, 26);
  assert.deepEqual(["mdfm", "ptrn", "cluk", "hearye", "ptlk", "wybc"].map(id => r.grooveSupport(id).melody), [1, 1, 1, 0, 0, 0]);
  const g = r.setGroove({ mel: .8, rep: 0, range: 1.7, harm: -2 }); assert.deepEqual([g.mel, g.rep, g.range, g.harm], [.8, 0, 1, 0], "clamped to 0..1");
  r.resetGroove(); assert.equal(r.getGroove().mel, .5); done();
});
test("at 50 the song is exactly as written: the same graph, note for note, as with the controls never touched", async () => {
  const a = await play(null), b = await play({ mel: .5, rep: .5, range: .5, harm: .5 });
  assert.equal(b, a);
});
test("moving them changes what plays (simpler: fewer notes, busier: more), and nothing throws at the extremes", async () => {
  const base = await play(null), simple = await play({ mel: 0 }), busy = await play({ mel: 1 });
  assert.ok(simple < base, `simpler makes fewer nodes (${simple} vs ${base})`); assert.ok(busy > base, `busier makes more (${busy} vs ${base})`);
  for (const g of [{ rep: 0 }, { rep: 1 }, { range: 0 }, { range: 1 }, { harm: 0 }, { harm: .2 }, { harm: .75 }, { harm: 1 }, { mel: 1, rep: 0, range: 1, harm: 1 }, { mel: 0, rep: 1, range: 0, harm: 0 }])
    await assert.doesNotReject(play(g, 12), JSON.stringify(g));
});
