// 1.26 (mobile mix): LITE schedules the music further ahead and is off by default; talk breaks can be held and given back.
// On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs. node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM } = await import("../dist/mdfm.mjs");

// seed(n): replaces Math.random with a seeded mulberry32 stream, so a run is repeatable; done() puts the real one back.
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps.
function sim(opts = {}) {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 16, 9, 20).getTime() }); seed(7);
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false, ...opts });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run };
}
const done = () => { mock.timers.reset(); Math.random = realRandom; };
// how far ahead of "now" each sound was scheduled when it was made (the median, over the sounds made since `from`)
const tag = ctx => { const mk = ctx.createBufferSource.bind(ctx); ctx.createBufferSource = () => { const s = mk(); s.made = ctx.currentTime; return s; }; };
const lead = (ctx, from) => { const L = ctx.sources.slice(from).filter(s => s.made != null && s.startT > 0).map(s => s.startT - s.made).sort((a, b) => a - b); return L[Math.floor(L.length / 2)]; };

test("LITE is off by default and schedules notes up to .5 s ahead (.25 s without it)", async () => {
  const { ctx, r, run } = sim(); tag(ctx); assert.equal(r.isLite(), false);
  r.start(); await run(4); let n = ctx.sources.length; await run(6); const off = lead(ctx, n);
  r.setLite(true); assert.equal(r.isLite(), true); await run(1); n = ctx.sources.length; await run(6); const on = lead(ctx, n);
  assert.ok(off > .1 && off <= .3, `without LITE notes are made about .25 s ahead (median ${off.toFixed(3)})`);
  assert.ok(on > off + .15 && on <= .55, `with LITE about .5 s ahead (median ${on.toFixed(3)} vs ${off.toFixed(3)})`);
  r.setLite(false); assert.equal(r.isLite(), false); r.stop(); done();
});

test("talk breaks: getSpots reports setSpots, so MIX can hold them and give them back", () => {
  const { r } = sim({ spots: true }); assert.equal(r.getSpots(), true);
  r.setSpots(false); assert.equal(r.getSpots(), false); r.setSpots(true); assert.equal(r.getSpots(), true); done();
});

test("prewarmMix and LITE with the matrix up don't throw, and switching LITE back restores the saturators", async () => {
  const { r, run } = sim(); r.start(); await run(2);
  r.setStyleMix({ rock: .6 }); r.setFx && r.setFx({ space: .5 }); r.prewarmMix(); await run(3);
  assert.doesNotThrow(() => { r.setLite(true); r.setLite(false); });
  r.setStyleMix({ rock: 0 }); r.stop(); done();
});

// 1.27: an effect turned back down to zero stops getting signal once its tail has rung out (live only), and turning it up
// again reconnects it at once; LITE's blend culling leaves out only a copy 20 dB or more under the other
test("1.27: ROOM turned back to zero lets its reverb rest after the tail; turned up again, it's reconnected", async () => {
  const { ctx, r, run } = sim(); const proto = Object.getPrototypeOf(ctx.createGain()), od = proto.disconnect, oc = proto.connect, convs = new Set(), ev = [];
  const mk = ctx.createConvolver.bind(ctx); ctx.createConvolver = () => { const c = mk(); convs.add(c); return c; };
  proto.disconnect = function (d) { if (convs.has(d)) ev.push("off"); return od.call(this, d); };
  proto.connect = function (d, ...x) { if (convs.has(d)) ev.push("on"); return oc.call(this, d, ...x); };
  try {
    r.start(); await run(1); r.setSound({ room: .5 }); await run(3); ev.length = 0;   // (REALISM is at zero, so its own reverb has already let go)
    r.setSound({ room: 0 }); await run(2); assert.deepEqual(ev, [], "not before its tail (4 s)");
    await run(3); assert.deepEqual(ev, ["off"], "after the tail the send lets go of the reverb");
    r.setSound({ room: .4 }); assert.deepEqual(ev, ["off", "on"], "turned up: reconnected at once"); ev.length = 0;
    r.setSound({ room: 0 }); await run(1); r.setSound({ room: .3 }); await run(6); assert.deepEqual(ev, [], "up again before the tail ran out: it never let go");
    r.stop();
  } finally { proto.disconnect = od; proto.connect = oc; done(); }
});
test("1.27: the culling test hook is off by default and LITE alone never culls a Save", () => {
  const { r } = sim(); assert.equal(typeof r._cullTest, "function"); r.setLite(true); r.setLite(false); done();
});
test("1.27: perfStats counts the scheduler's steps (none late on an unhurried run) and resets when asked", async () => {
  const { r, run } = sim(); r.start(); await run(4); const a = r.perfStats(true);
  assert.ok(a.steps > 20, `steps counted (${a.steps})`); assert.equal(a.late, 0); assert.ok(a.minLead > 0 && a.minLead <= .26, `spare ${a.minLead}`); assert.equal(a.ahead, .25);
  const b = r.perfStats(); assert.equal(b.steps, 0, "reset"); r.setLite(true); assert.equal(r.perfStats().ahead, .5); r.setLite(false); r.stop(); done();
});
