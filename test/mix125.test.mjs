// 1.25 (E3): the style matrix's pad helpers and migration, the parametric EQ's curve, the new drum controls' data,
// GLITCH and ORIGINAL (bypass), on the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs. node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;   // the bundle's vendored scripts look for `self`
const { createMDFM } = await import("../dist/mdfm.mjs");   // the built bundle (run the build first), so CLUK and HEARYE are in

// seed(n): replaces Math.random with a seeded mulberry32 stream, so a run is repeatable; done() puts the real one back.
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps. s: seed.
function sim(opts = {}, { s = 1 } = {}) {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 15, 9, 20).getTime() }); seed(s);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, ...opts });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run };
}
const done = () => { mock.timers.reset(); Math.random = realRandom; };
// near(): assert a is within tol of b.
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
// The ten style-matrix directions, clockwise from the top.
const DIRS = ["rock", "pop", "dance", "hiphop", "lofi", "space", "orchestral", "jazz", "latin", "country"];

test("style directions: ten, clockwise from the top, 36 degrees apart; no chaos, classical or galactic", () => {
  const { r } = sim(); const k = r.styleMixKeys();
  assert.deepEqual(k.map(x => x[0]), DIRS);
  k.forEach((x, i) => { assert.equal(x[3], i * 36); assert.ok(x[1] && x[2]); });
  const d = r.styleDirections(); assert.equal(d.length, 10); assert.equal(d.find(x => x.id === "space").tempo, null);
  assert.deepEqual(Object.keys(r.getStyleMix("mdfm")), DIRS);
  assert.ok(r.styleLanes().length === 7 && r.styleStages().some(s => s.id === "drums"));
  done();
});

test("padToMix: centre is the song, an axis is one direction, a sector blends its two neighbours (cos²/sin², summing to the amount)", () => {
  const { r } = sim();
  const z = r.padToMix(0, 0); assert.equal(z.amount, 0); assert.ok(Object.values(z.w).every(v => v === 0));
  assert.ok(Object.values(r.padToMix(.04, 0).w).every(v => v === 0), "dead zone");
  const top = r.padToMix(0, -1); assert.equal(top.w.rock, 1); assert.equal(Object.values(top.w).filter(v => v > 0).length, 1);
  const a = 18 * Math.PI / 180, mid = r.padToMix(Math.sin(a), -Math.cos(a));   // halfway between ROCK (0) and POP (36)
  near(mid.w.rock, .5, 1e-3, "rock half"); near(mid.w.pop, .5, 1e-3, "pop half");
  const b = 9 * Math.PI / 180, q = r.padToMix(Math.sin(b) * .6, -Math.cos(b) * .6);   // a quarter of the way, 60% out
  const amt = (.6 - .05) / .95; near(q.amount, amt, 1e-3, "amount"); near(q.w.rock + q.w.pop, amt, 2e-3, "weights sum to the amount"); assert.ok(q.w.rock > q.w.pop);
  const snap = r.padToMix(Math.sin(2 * Math.PI / 180), -Math.cos(2 * Math.PI / 180)); assert.equal(snap.w.pop, 0, "within a few degrees of an axis snaps to it");
  const ring = r.padToMix(0, -1, .5); near(ring.w.rock, .5, 1e-9, "the amount ring scales it");
  const wrap = r.padToMix(Math.sin(342 * Math.PI / 180), -Math.cos(342 * Math.PI / 180)); near(wrap.w.country, .5, 1e-3, "country"); near(wrap.w.rock, .5, 1e-3, "wraps to rock");
  for (let th = 0; th < 360; th += 7) { const p = r.padToMix(Math.sin(th * Math.PI / 180), -Math.cos(th * Math.PI / 180)); const on = Object.values(p.w).filter(v => v > 0); assert.ok(on.length <= 2); near(on.reduce((x, y) => x + y, 0), 1, 2e-3, `full ring at ${th}`); }
  // the inverse lands back on the same point; a non-neighbour pair is a custom blend
  const back = r.mixToPad(q.w); near(back.x, Math.sin(b) * .6, 2e-3, "x"); near(back.y, -Math.cos(b) * .6, 2e-3, "y"); assert.equal(back.custom, false);
  assert.equal(r.mixToPad({ rock: .5, space: .5 }).custom, true);
  const set = r.setStylePad({ angle: 108, dist: 1 }, "mdfm"); assert.equal(set.w.hiphop, 1); assert.equal(r.getStyleMix("mdfm").hiphop, 1);
  done();
});

test("migration: classical -> orchestral, galactic -> space, chaos -> GLITCH (an effect); lanes and resets", () => {
  const { r } = sim(); let fx = null; r.on("fx", e => fx = e);
  const m = r.setStyleMix({ pop: .2, hiphop: .1, rock: 0, classical: .4, country: 0, galactic: .3, chaos: .7 }, "mdfm");
  assert.equal(m.orchestral, .4); assert.equal(m.space, .3); assert.ok(!("classical" in m) && !("chaos" in m) && !("galactic" in m));
  assert.equal(r.getFx().glitch, .7); assert.equal(fx && fx.glitch, .7);
  r.setStyleMix({ chaos: .2 }, "ptrn"); assert.equal(r.getFx().glitch, .7, "an old, smaller chaos never turns GLITCH down");
  const v = r.migrateStyleMix({ pop: .5, classical: .25, chaos: .1 }); assert.equal(v.v, 2); assert.equal(v.w.orchestral, .25); assert.equal(v.w.pop, .5); assert.equal(v.glitch, .1); assert.equal(v.lanes.tempo, 1);
  assert.equal(r.migrateStyleMix({ w: { jazz: .4 }, lanes: { tempo: 0 }, v: 2 }).lanes.tempo, 0);
  r.setStyleMix({ lanes: { tempo: 0, bass: .5 } }, "mdfm"); assert.equal(r.getStyleLanes("mdfm").tempo, 0); assert.equal(r.getStyleLanes("mdfm").bass, .5);
  r.resetStyleMix("mdfm"); assert.ok(Object.values(r.getStyleMix("mdfm")).every(x => x === 0)); assert.equal(r.getStyleLanes("mdfm").tempo, 1);
  done();
});

test("the matrix's plan: one owner per part, scaled (not cut off) past 100% in total, stages by amount", () => {
  const { r } = sim();
  r.setStyleMix({ rock: .7, jazz: .3 }, "mdfm"); let p = r.getStylePlan("mdfm");
  assert.equal(p.roles.kick, "rock"); assert.equal(p.roles.bass, "rock"); assert.equal(p.scaled, false);
  assert.equal(p.stages.rock.bass, true); assert.equal(p.stages.rock.lead, true); assert.equal(p.stages.jazz.bass, false); near(p.stages.rock.drums, 1, 1e-9, "drums done by 45%");
  r.setStyleMix({ rock: .8, jazz: .8 }, "mdfm"); p = r.getStylePlan("mdfm"); assert.equal(p.scaled, true); near(p.w.rock, .5, 1e-9, "scaled to sum 1");
  r.setStyleMix({ rock: 0, jazz: 0, orchestral: .9 }, "mdfm"); p = r.getStylePlan("mdfm"); assert.equal(p.roles.hat, "orchestral", "the orchestra takes the hats out at the top");
  r.setStyleMix({ orchestral: .1 }, "mdfm"); p = r.getStylePlan("mdfm"); assert.equal(p.stages.orchestral.drums, 0, "10%: the kit is untouched"); assert.equal(p.stages.orchestral.bass, false);
  r.resetStyleMix("mdfm"); done();
});

test("EQ: flat at default (and bypassed); the curve matches each band; LOW / MID / HIGH are the old tone knobs", () => {
  const { r } = sim(); const F = [20, 50, 100, 200, 1000, 3000, 10000, 20000];
  assert.ok(r.eqResponse(F).every(x => x === 0), "flat");
  const eq = r.getEq(); assert.equal(eq.on, true); assert.equal(eq.ls.freq, 250); assert.equal(eq.p1.freq, 1000); assert.equal(eq.p1.q, .7); assert.equal(eq.hs.freq, 4000); assert.equal(eq.lc.on, false); assert.equal(eq.hc.on, false);
  assert.deepEqual(r.eqDefaults(), eq); assert.equal(r.eqBands().length, 6);
  let tone = null; r.on("tone", t => tone = t);
  r.setTone({ low: 6, high: -3 }); assert.equal(r.getEq().ls.gain, 6); assert.equal(r.getEq().hs.gain, -3); assert.deepEqual(tone, { low: 6, mid: 0, high: -3 });
  let c = r.eqResponse(F); near(c[0], 6, .3, "low shelf at 20 Hz"); near(c[7], -3, .3, "high shelf at 20 kHz"); near(c[4], 0, 1.5, "mid");
  r.resetEq(); assert.deepEqual(r.getTone(), { low: 0, mid: 0, high: 0 });
  r.setEq({ p2: { gain: 12, freq: 3000, q: 1 } }); c = r.eqResponse([3000, 300, 15000]); near(c[0], 12, .05, "peak at its frequency"); assert.ok(c[1] < 1 && c[2] < 3);
  r.resetEq(); r.setEq({ lc: { on: true, freq: 100, slope: 12 } }); c = r.eqResponse([100, 50, 1000]); near(c[0], -3, .2, "-3 dB at the cut"); near(c[1], -12.3, 1, "12 dB/oct"); near(c[2], 0, .1, "pass band");
  r.setEq({ lc: { slope: 24 } }); c = r.eqResponse([100, 50]); near(c[0], -3, .2, "24: -3 dB at the cut"); near(c[1], -24.1, 1.5, "24 dB/oct");
  r.resetEq(); r.setEq({ hc: { on: true, freq: 5000 } }); c = r.eqResponse([5000, 10000]); near(c[0], -3, .2, "high cut"); assert.ok(c[1] < -10);
  r.setEq({ hc: { freq: 99999 } }); assert.equal(r.getEq().hc.freq, 20000, "clamped to its range"); r.setEq({ lc: { freq: 1 } }); assert.equal(r.getEq().lc.freq, 20);
  r.setEq({ ls: { gain: 6 } }); assert.deepEqual(r.eqResponse(F, "hc").length, F.length); near(r.eqResponse([20], "ls")[0], 6, .3, "one band's own curve");
  r.eqBypass(true); assert.ok(r.eqResponse(F).every(x => x === 0), "bypassed: flat"); assert.equal(r.getEq().on, false);
  r.resetEq(); done();
});

test("drum controls: listed with their ranges and defaults; the defaults (even set explicitly) leave the groove off", () => {
  const { r } = sim(); const keys = r.grooveKeys(), ids = keys.map(k => k[0]), D = r.grooveDefaults();
  for (const k of ["push", "pushK", "pushS", "pushH", "ghosts", "accent", "hatswing", "hatdens", "kick", "snare", "hats"]) { assert.ok(ids.includes(k), k); assert.ok(k in D, k); }
  const info = Object.fromEntries(r.grooveKeyInfo().map(x => [x.id, x])); assert.equal(info.push.def, .5); assert.equal(info.push.bipolar, true); assert.deepEqual(info.push.scale, [-30, 30]); assert.equal(info.kick.def, -1); assert.equal(info.pushK.song, "FOLLOW");
  assert.ok(keys.every(k => k[3] && "def" in k[3]), "each entry carries its meta");
  assert.equal(D.gv, 3);
  r.setGroove({ push: .5, pushK: -1, pushS: -1, pushH: -1, ghosts: 0, accent: .5, hatswing: -1, hatdens: -1, kick: -1, snare: -1, hats: -1, gv: 3 }, "mdfm");
  assert.equal(r._tuneState().groove.mdfm, false, "defaults: groove off (nothing rerouted)");
  const g = r.setGroove({ push: 2, ghosts: -5, kick: -1, hatswing: -3 }, "mdfm"); assert.equal(g.push, 1); assert.equal(g.ghosts, 0); assert.equal(g.kick, -1); assert.equal(g.hatswing, -1);
  assert.equal(r._tuneState().groove.mdfm, true);
  r.resetGroove("mdfm"); assert.deepEqual(r.getGroove("mdfm"), D); done();
});

test("on air with the matrix, every drum control, GLITCH and the EQ moved: no AudioParam errors; ORIGINAL holds and gives it all back", async () => {
  const { r, run, ctx } = sim({}, { s: 4 }); let glitches = 0; r.on("glitch", () => glitches++);
  r.setStyleMix({ hiphop: .6, latin: .4 }, "mdfm"); r.setStyleMix({ orchestral: .8 }, "hearye"); r.setStyleMix({ dance: 1 }, "ptrn");
  r.setGroove({ push: .1, pushS: .9, ghosts: .8, accent: .9, hatswing: .7, hatdens: .9, kick: .7, snare: .3, hats: .6, humanize: .4, gv: 3 }, "mdfm");
  r.setFx({ glitch: 1 }); r.setEq({ lc: { on: true, freq: 60, slope: 24 }, p2: { gain: 4 }, hc: { on: true } });
  r.start(); await run(40);
  assert.ok(glitches > 0, "GLITCH fired"); assert.equal(r._tuneState().stages, 1, "the style stage is in"); assert.ok(r._tuneState().eqRoute.includes("p2"));
  r.setMixBypass(true); assert.equal(r.isMixBypass(), true); assert.equal(r._tuneState().matrix.mdfm, false); assert.equal(r._tuneState().groove.mdfm, false); assert.equal(r._tuneState().eqRoute, "");
  r.setStyleMix({ hiphop: .9 }, "mdfm"); assert.equal(r._tuneState().matrix.mdfm, false, "held while ORIGINAL is down");
  await run(5); r.setMixBypass(false); assert.equal(r._tuneState().matrix.mdfm, true); assert.equal(r._tuneState().groove.mdfm, true); assert.equal(r.getStyleMix("mdfm").hiphop, .9);
  r.setStation("hearye"); await run(20); r.setStation("ptrn"); await run(20); r.setStation("cluk"); await run(10);
  r.stop(); await run(1); assert.ok(ctx.nodes > 0); done();
});
