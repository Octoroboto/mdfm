// 1.31 BEAT (Groove & Key): a one-bar drum pattern that steers the song's drums. Nothing changes until a cell is set
// (and at INFLUENCE 0); at 1 the drums play exactly the pattern; rests thin the song; BASS FOLLOWS KICK; per station.
// On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs.
// Run: node scripts/build.mjs, then node --test test/*.test.mjs (or just this file). Needs dist/mdfm.mjs from the build.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM } = await import("../dist/mdfm.mjs");
// seed(n): replaces Math.random with a seeded mulberry32 stream, so a run is repeatable; done() puts the real one back.
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps. s: seed.
function sim(opts = {}, s = 11) { mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 18, 9, 20).getTime() }); seed(s);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false, ...opts });
  const run = async (sec, each) => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); if (each) each(); } };
  return { ctx, r, run }; }
const done = () => { mock.timers.reset(); Math.random = realRandom; };
// play(beat): plays sec seconds with that pattern set and returns how many audio nodes were made (a cheap fingerprint of the graph).
const play = async (beat, sec = 20, s = 11) => { const { ctx, r, run } = sim({}, s); if (beat) r.setBeat(beat); r.start(); await run(sec); r.stop(); const n = ctx.nodes; done(); return n; };
// the bars the on-air song played while the card watched: {bar: {song, play}}
const watch = async (beat, sec = 40, s = 11) => { const { r, run } = sim({}, s); if (beat) r.setBeat(beat); r.beatWatch(true); r.start(); const bars = {};
  await run(sec, () => { const n = r.beatNow(); if (n && n.on !== false) bars[n.bar + ":" + JSON.stringify(n.song.k)] = n; }); r.stop(); done(); return Object.values(bars); };
// G({ k, s, h, o, p }): builds a beat from 16-character strings per lane (kick, snare, hat, open hat, perc):
// "." rest, g ghost, x hit, X accent, "-" blank (follow the song).
const G = (o) => Object.fromEntries(["k", "s", "h", "o", "p"].map(k => [k, Array.from({ length: 16 }, (_, i) => o[k] ? ({ ".": 0, g: 1, x: 2, X: 3, "-": -1 })[o[k][i]] : 0)]));

test("the API: lanes, presets, cleaning, per station, only where MDFM writes the songs", () => {
  const { r } = sim(); const info = r.beatInfo();
  assert.deepEqual(info.lanes.map(x => x[0]), ["k", "s", "h", "o", "p"]); assert.equal(info.steps, 16); assert.ok(info.presets.length >= 6);
  assert.deepEqual(["mdfm", "ptrn", "cluk", "hearye", "ptlk", "wybc"].map(id => r.beatSupport(id)), [true, true, true, false, false, false]);
  const b = r.setBeat({ inf: 3, bass: true, grid: { k: [2, 9, -1, "x"], s: "nope" } });
  assert.equal(b.inf, 1); assert.equal(b.bass, true); assert.equal(b.follow, true); assert.deepEqual(b.grid.k.slice(0, 4), [2, 0, -1, 0]); assert.equal(b.grid.s.length, 16);
  assert.equal(r.getBeat("ptrn").grid.k[0], 0, "per station"); r.setBeat({ inf: .3 }, "ptrn"); assert.equal(r.getBeat("ptrn").inf, .3); assert.equal(r.getBeat().inf, 1);
  assert.deepEqual(r.beatPreset("four").k.slice(0, 5), [2, 0, 0, 0, 2]); assert.equal(r.beatPreset("nope"), null);
  r.resetBeat(); assert.deepEqual(r.getBeat(), { inf: .5, bass: false, follow: true, grid: G({}) }); done();
});
test("untouched (no cells set), or at INFLUENCE 0, the song plays exactly as written", async () => {
  const a = await play(null), b = await play({ inf: .9 }), c = await play({ inf: 0, grid: G({ k: "x...x...x...x...", h: "----------------" }) });
  assert.equal(b, a); assert.equal(c, a);
});
test("at INFLUENCE 1 the drums play the pattern exactly; rests and blanks are quiet", async () => {
  const pat = { k: "x...x...x...x...", s: "....x.......x...", h: "x-x-x-x-x-x-x-x-", o: "..x...x...x...x.", p: "----------------" };
  const bars = await watch({ inf: 1, grid: G(pat) }); assert.ok(bars.length >= 4, `saw ${bars.length} bars`);
  for (const n of bars) for (const k of ["k", "s", "h", "o", "p"]) assert.deepEqual(n.play[k], [...pat[k]].map(c => c === "x" || c === "X"), `lane ${k}`);
});
test("a nudge keeps the song's backbone (its kick on 1 and its backbeat) even where you rest", async () => {
  const bars = await watch({ inf: .3, grid: G({ k: "----------------", s: "----------------" }) });
  let kept = 0, seen = 0; for (const n of bars) { if (n.song.k[0]) { seen++; assert.ok(n.play.k[0], "kick on 1 kept"); } for (const i of [4, 8, 12]) if (n.song.s[i]) assert.ok(n.play.s[i], "backbeat kept");
    for (let i = 1; i < 16; i++) if (n.song.k[i] && !n.play.k[i]) kept++; }
  assert.ok(seen > 0); assert.ok(kept > 0, "some other kicks rest");
});
test("blend: the song's own hits mostly stay and some of yours come in", async () => {
  const bars = await watch({ inf: .5, grid: G({ k: "xxxxxxxxxxxxxxxx" }) }); let own = 0, keep = 0, add = 0, room = 0;
  for (const n of bars) for (let i = 0; i < 16; i++) { if (n.song.k[i]) { own++; keep += n.play.k[i]; } else { room++; add += n.play.k[i]; } }
  assert.equal(keep, own); assert.ok(add > 0 && add <= room);
});
test("a song without drums (PTRN's Ambient) gets drums that follow your pattern, from its next section; FOLLOW BREAKS keeps the intro quiet", async () => {
  const run1 = async beat => { const { r, run } = sim(); r.setStationTypes("ptrn", Object.fromEntries(r.stationTypeList("ptrn").map(([k]) => [k, k === "ambient"]))); if (beat) r.setBeat(beat, "ptrn"); r.beatWatch(true); r.start(); r.setStation("ptrn");
    const bars = []; await run(70, () => { const n = r.beatNow(); if (n && !bars.some(b => b.bar === n.bar)) bars.push(n); }); r.stop(); done(); return bars; };
  const off = await run1(null); assert.ok(off.length > 4); assert.ok(off.every(n => !n.song.k.some(Boolean) && n.play === null), "ambient: no drums of its own");
  const on = await run1({ inf: .8, grid: G({ k: "x...x...x...x..." }) }); const drum = on.filter(n => n.play && n.play.k.some(Boolean));
  assert.ok(drum.length > 2, `drums came in (${drum.length} bars)`); assert.ok(on.every(n => !n.song.k.some(Boolean)), "the song's own dots stay empty");
  assert.ok(drum.every(n => n.play.k.every((v, i) => !v || i % 4 === 0)), "only where the pattern asks (and the fit's kicks)");
  assert.ok(on.some(n => n.play && !n.play.k.some(Boolean)), "some bars (the intro) stay quiet");
});
test("BASS FOLLOWS KICK and the extremes don't throw, on MDFM, PTRN and CLUK", async () => {
  for (const b of [{ inf: 1, bass: true, grid: G({ k: "x..x..x...x..x.." }) }, { inf: .2, bass: true, follow: false, grid: G({ s: "XXXXXXXXXXXXXXXX", h: "gggggggggggggggg", p: "x.x.x.x.x.x.x.x." }) },
    { inf: .6, grid: G({ k: "----------------", s: "----------------", h: "----------------", o: "----------------", p: "----------------" }) }])
    await assert.doesNotReject(play(b, 14));
  let moved = 0; for (const s of [11, 12, 13, 14]) { const a = await play({ inf: 1, grid: G({ k: "x..x..x...x..x.." }) }, 20, s), c = await play({ inf: 1, bass: true, grid: G({ k: "x..x..x...x..x.." }) }, 20, s); if (a !== c) moved++; }
  assert.ok(moved > 0, "the bass moves");
  for (const id of ["ptrn", "cluk"]) { const { r, run } = sim(); r.setBeat({ inf: .9, bass: true, grid: G({ k: "x...x...x...x...", h: "-x-x-x-x-x-x-x-x" }) }, id); r.start(); r.setStation && r.setStation(id); await assert.doesNotReject(run(20)); r.stop(); done(); }
});
