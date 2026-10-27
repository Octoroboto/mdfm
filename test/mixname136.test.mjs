// 1.36: a saved MIX file's name ends with the station's call sign, the key and the BPM as heard
// ("Late night - PTRN - F# minor - 128 BPM.mdfm.json"). Checks mixFileName's tail rules and mixTags against a live radio:
// a song on air (with GROOVE & KEY moving the tempo), and talk (call sign only).
// On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs. Run: node scripts/build.mjs, then node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM, mixFileName, mixTags } = await import("../dist/mdfm.mjs");

// sim(): fake clock and a fresh radio; run(sec) advances both in 40 ms steps (as in mixfile134.test.mjs)
function sim() {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 26, 9, 0).getTime() });
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { r, run };
}

test("mixFileName: the tail goes on the end, missing parts are left out, never twice", () => {
  assert.equal(mixFileName("Late night", { call: "PTRN", key: "F# minor", bpm: 128 }), "Late night - PTRN - F# minor - 128 BPM.mdfm.json");
  assert.equal(mixFileName("Talk", { call: "PTLK", key: null, bpm: null }), "Talk - PTLK.mdfm.json");
  assert.equal(mixFileName("", { call: "MDFM", key: "C major", bpm: 90 }), "MDFM mix - MDFM - C major - 90 BPM.mdfm.json");
  assert.equal(mixFileName("Mine - PTRN - F# minor - 128 BPM", { call: "PTRN", key: "F# minor", bpm: 128 }), "Mine - PTRN - F# minor - 128 BPM.mdfm.json");
  assert.equal(mixFileName("Late: night/mix"), "Late night mix.mdfm.json", "no tags: as 1.34");
  assert.ok(mixFileName("x".repeat(200), { call: "PTRN", key: "C major", bpm: 100 }).length <= 120 + ".mdfm.json".length);
});
test("mixTags: a song on air gives call sign, key and BPM as heard; talk gives the call sign only", async () => {
  const { r, run } = sim(); r.setStation("ptrn"); r.start(); await run(4);
  const np = r.nowPlaying(), t = mixTags(r);
  assert.equal(t.call, "PTRN"); assert.equal(t.bpm, Math.round(np.bpm)); assert.ok(t.key && !/[♯♭]/.test(t.key), t.key);
  r.setGroove({ bpm: 133 }, "ptrn"); assert.equal(mixTags(r).bpm, 133, "GROOVE's tempo is what's heard");
  assert.match(mixFileName("Test", mixTags(r)), /^Test - PTRN - [A-G][#b]? \w+ - 133 BPM\.mdfm\.json$/);
  r.setStation("ptlk"); await run(2);
  assert.deepEqual(mixTags(r), { call: "PTLK", key: null, bpm: null });
  r.stop(); mock.timers.reset();
});
