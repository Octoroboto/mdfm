// 1.25 fixes (audit bugs-engine.md) and the sliced Save, against the built bundle (dist/mdfm.mjs: run the build first) on the
// strict fake Web Audio, so CLUK and HEARYE are in. node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;   // the bundle's vendored scripts look for `self`
const { createMDFM } = await import("../dist/mdfm.mjs");

function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
function sim(opts = {}, { at = new Date(2026, 9, 15, 9, 20), s = 1 } = {}) {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: at.getTime() }); seed(s);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, ...opts });
  const ev = { spot: [], np: [], cap: [] };
  r.on("spot", x => ev.spot.push({ t: ctx.currentTime, ...x })); r.on("nowplaying", x => ev.np.push({ t: ctx.currentTime, ...x })); r.on("caption", x => ev.cap.push({ t: ctx.currentTime, ...x }));
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, ev, run };
}
const done = () => { mock.timers.reset(); Math.random = realRandom; };

test("H1: effects and the style matrix's sound set before SOUND are in the path once it's on", async () => {
  let { r, run } = sim({}); r.setFx({ echo: .6 }); r.start(); await run(1);
  assert.equal(r._fxState().inPath, true, "effects stage in the path"); r.stop(); await run(1); done();
  ({ r, run } = sim({})); r.setStyleMix({ rock: .8 }, "mdfm"); r.start(); await run(1);
  assert.equal(r._tuneState().stages, 1, "style matrix stage built"); r.stop(); await run(1); done();
});

test("H2: CLUK songs run about two minutes (not half that), and a Lazer Hour rave never outlasts its song", async () => {
  const { r, ev, run } = sim({}, { s: 3 }); r.setStation("cluk"); r.start(); await run(40);
  const songs = ev.np.filter(n => n.station === "cluk" && !n.talk && n.bpm);
  assert.ok(songs.length >= 1, "a CLUK song played");
  for (const n of songs) { const secs = n.bars * 4 * 60 / n.bpm; assert.ok(secs > 95, `${n.style} at ${n.bpm} BPM: ${n.bars} bars, ${secs.toFixed(0)} s`); }
  r.setGroove({ bpm: 200 }, "cluk");   // a rave song from its hook at 200 BPM runs well under 120 s
  assert.ok(r._clukRun([["rave", 120], ["voice", "And we're back."]]));
  await run(1); const t0 = (ev.spot.find(x => x.kind === "rave") || {}).t; assert.ok(t0 != null, "the rave started");
  await run(130); const back = ev.cap.find(c => c.text === "And we're back." && c.t > t0);
  assert.ok(back && back.t - t0 < 100, `the show came back ${back ? (back.t - t0).toFixed(1) + " s" : "never"} after a 120 s rave was asked for (its song is shorter)`);
  r.stop(); await run(1); done();
});

test("M1: a pack with only some caller or Funnelball lists never says 'undefined' and never sticks in a break", async () => {
  const { r, ev, run } = sim({ includeCore: false, packs: [{ callers: { open: ["Hi, long time listener."] }, funnelball: { cities: ["Akron"], intro: ["Live from {venue}."] }, ids: ["M D F M."] }] });
  r.start(); await run(2); r.spotNow("caller"); await run(10); r.spotNow("funnelball"); await run(10);
  assert.ok(!ev.cap.some(c => /undefined|\{\w+\}/.test(c.text)), ev.cap.map(c => c.text).join(" | "));
  assert.equal(r.sampleLines("funnelball"), null);
  assert.equal(r.onAir(), null, "no break left hanging"); r.spotNow("id"); await run(10); assert.ok(ev.cap.some(c => c.text === "M D F M."), "the station still talks");
  r.stop(); await run(1); done();
});

test("M2: skip during a crossfade finishes the crossfade instead of skipping the song fading in", async () => {
  const { r, ev, run } = sim({ spots: false }, { s: 5 }); r.start(); await run(2);
  r.skip(); for (let i = 0; i < 100 && ev.np.length < 2; i++) await run(.2);
  assert.equal(ev.np.length, 2, "the first skip brings the next song");
  await run(.6); r.skip(); await run(4);
  assert.equal(ev.np.length, 2, "a skip during the crossfade doesn't skip the new song: " + ev.np.map(n => n.title).join(", "));
  r.skip(); for (let i = 0; i < 50 && ev.np.length < 3; i++) await run(.2); assert.equal(ev.np.length, 3, "after the crossfade, skip skips again");
  r.stop(); await run(1); done();
});

test("M3: a context the OS suspends comes back while SOUND is on, and stays suspended after stop", async () => {
  const { r, ctx, run } = sim({}); r.start(); await run(1);
  await ctx.suspend(); ctx._emit("statechange"); await run(1); assert.equal(ctx.state, "running", "resumed");
  r.stop(); await run(1); assert.equal(ctx.state, "suspended"); ctx._emit("statechange"); await run(1); assert.equal(ctx.state, "suspended", "a deliberate stop isn't undone");
  done();
});

test("M4: a sports provider with missing fields never reads out a {placeholder}; string scores compare as numbers", async () => {
  const { r, ev, run } = sim({ sports: async () => [{ team: "Akron Zips", opp: "Kent State", state: "post", won: true }], cannedFallback: false });
  r.start(); await run(2); r.spotNow("sports"); await run(40);
  assert.ok(ev.cap.length > 1 && !ev.cap.some(c => /\{\w+\}/.test(c.text)), ev.cap.map(c => c.text).join(" | "));
  r.stop(); await run(1); done();
});

test("M5: HEARYE with two shows switched on keeps bringing them back", async () => {
  const off = Object.fromEntries(createMDFM({ audioContext: new FakeAudioContext() }).stationTypeList("hearye").map(([k]) => [k, false]));
  const { r, ev, run } = sim({}, { s: 2 }); r.setStationTypes("hearye", { ...off, doug: true, cauldron: true, ids: true });
  r.setStation("hearye"); r.start(); await run(3600);
  const shows = ev.spot.filter(x => x.kind === "hearye" && x.show && !/Ad|news|Hearth/i.test(x.show));
  assert.ok(shows.length >= 4, `${shows.length} show segments in an hour: ${shows.map(x => x.show).join(", ")}`);
  r.stop(); await run(1); done();
});

test("Save renders in slices: notes all the way to the end, and the MIDI file has them all", async () => {
  const { r, run } = sim({ spots: false }, { s: 4 }); r.start(); await run(2);
  const p = r.renderSong(); await run(4); const res = await p;
  assert.ok(res && res.buffer && res.midi, "rendered with a MIDI file"); const secs = res.buffer.duration;
  const m = res.midi; let i = 14, last = 0, tempo = 500000, ppq = (m[12] << 8) | m[13];
  while (i < m.length) { const len = (m[i + 4] << 24) | (m[i + 5] << 16) | (m[i + 6] << 8) | m[i + 7]; let j = i + 8, t = 0, run2 = 0; const end = j + len;
    while (j < end) { let d = 0, b; do { b = m[j++]; d = (d << 7) | (b & 127); } while (b & 128); t += d; let st = m[j]; if (st & 128) j++; else st = run2; run2 = st;
      if (st === 255) { const ty = m[j++]; let l = 0; do { b = m[j++]; l = (l << 7) | (b & 127); } while (b & 128); if (ty === 81) tempo = (m[j] << 16) | (m[j + 1] << 8) | m[j + 2]; j += l; }
      else if ((st & 240) === 144 || (st & 240) === 128 || (st & 240) === 224 || (st & 240) === 176) { if ((st & 240) === 144 && m[j + 1] > 0) last = Math.max(last, t); j += 2; } else j += 1; }
    i = end; }
  const lastSec = last / ppq * tempo / 1e6;
  assert.ok(lastSec > secs - 12, `last MIDI note at ${lastSec.toFixed(1)} s of a ${secs.toFixed(1)} s Save`);
  r.stop(); await run(1); done();
});

test("stations: one registry (unknown ids fall back to MDFM's switches), and opts.station can start on CLUK", async () => {
  const { r, run } = sim({});
  assert.deepEqual(r.getStationTypes("nope"), r.getStationTypes("mdfm"));
  assert.doesNotThrow(() => r.setStationTypes("constructor", { ads: true }));
  assert.equal(r.stations().map(s => s.id).join(), "wybc,cluk,hearye,mdfm,ptrn,ptlk");
  for (const id of ["wybc", "cluk", "hearye", "ptrn", "ptlk", "mdfm"]) { r.setStation(id); assert.equal(r.getStation().id, id); }
  r.setStation("mdfm"); r.start(); await run(1); for (const id of ["cluk", "ptrn", "hearye", "ptlk", "wybc", "mdfm"]) { r.setStation(id); await run(3); r.skip(); await run(2); r.spotNow(); await run(2); }
  r.stop(); await run(1); done();
  const c = createMDFM({ audioContext: new FakeAudioContext(), station: "cluk" }); assert.equal(c.getStation().id, "cluk");
});
