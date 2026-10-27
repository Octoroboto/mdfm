// 1.37 pop & dance pack: phonk and the Pop & dance family on PTRN, and the four new instruments (supersaw lead,
// future-house pluck, disco strings, thumb-and-pop slap bass, plus French house's filtered loop and the bouncy bass).
// On the strict fake Web Audio (test/_fakeaudio.mjs, which throws on bad AudioParam values), against src/engine.js.
// Run: node --test test/pack137.test.mjs (no build needed). Real loudness is checked in the browser (see PACK-NOTES).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals();
const { createMDFM } = await import("../src/engine.js");

// seed(n): a repeatable Math.random (mulberry32); the engine's R() stream starts from it
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock and audio, a radio on it; run(sec) advances both in 40 ms steps
function sim(opts = {}, s = 3) {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 27, 9, 0).getTime() }); seed(s);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false, ...opts });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run };
}
const done = () => { mock.timers.reset(); Math.random = realRandom; };
// NEW: the genres' Settings keys and the names they play under ("Playing now" style)
const NEW = { phonk: "Phonk", frenchhouse: "French house", eurodance: "'90s Eurodance", tropical: "Tropical house", nudisco: "Nu-disco", futurehouse: "Future house" };

test("the genres are in PTRN's Settings list, in their families, switched on", () => {
  const { r } = sim(), L = r.stationTypeList("ptrn"), by = Object.fromEntries(L.map(x => [x[0], x]));
  for (const [k, label] of Object.entries(NEW)) { assert.ok(by[k], k); assert.equal(by[k][1], label); }
  assert.equal(by.phonk[2], "Hip-hop & R&B");
  for (const k of ["frenchhouse", "eurodance", "tropical", "nudisco", "futurehouse"]) assert.equal(by[k][2], "Pop & dance");
  const on = r.getStationTypes("ptrn"); for (const k of Object.keys(NEW)) assert.equal(on[k], true, k + " on by default");
  done();
});
test("the new instruments are in Settings › Instruments, since 1.37", () => {
  const { r } = sim(), L = r.instrumentList(), keys = L.filter(x => x[3] === "1.37").map(x => x[0]).sort();
  assert.deepEqual(keys, ["bass_bounce", "bass_thumbpop", "keys_discostr", "keys_fhpluck", "keys_filterloop", "lead_fhpluck", "lead_ssaw"]);
  done();
});
test("each new genre plays on PTRN with no Web Audio errors and says what it plays", async () => {
  for (const [k, label] of Object.entries(NEW)) {
    const { r, run } = sim({}, 7); r.setStationTypes("ptrn", Object.fromEntries(r.stationTypeList("ptrn").map(([x]) => [x, x === k])));
    r.setStation("ptrn"); r.start(); await run(25);
    const np = r.nowPlaying(); assert.equal(np && np.style, label, k); assert.ok(np.bpm > 90 && np.bpm < 145, k + " tempo " + np.bpm);
    r.stop(); await run(1); done();
  }
});
test("a light (LITE) live load still plays the supersaw, and switching an instrument off swaps it out", async () => {
  const { r, run } = sim({}, 5); r.setStationTypes("ptrn", Object.fromEntries(r.stationTypeList("ptrn").map(([x]) => [x, x === "nudisco"])));
  r.setInstruments({ bass_thumbpop: false, keys_discostr: false }); r.setStation("ptrn"); r.start(); await run(20);
  const np = r.nowPlaying(); assert.equal(np.style, "Nu-disco"); assert.ok(!/slap bass|disco strings/.test(JSON.stringify(np.band || [])) , "switched-off instruments aren't named");
  r.stop(); await run(1); done();
});
// Real offline renders (sound, no clipping) of the new genres run in the browser smoke test (test/smoke.mjs, ptrnRenders).
