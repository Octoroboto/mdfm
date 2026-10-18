// Engine scheduling, pacing and robustness tests, run in node against a strict fake Web Audio (test/_fakeaudio.mjs).
// node --test test/*.test.mjs   // (no build needed: imports src/engine.js directly)
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals();
const { createMDFM } = await import("../src/engine.js");
const examplePack = (await import("../packs/example-pack.js")).default;

// seed(n): replaces Math.random with a seeded mulberry32 stream, so a run is repeatable; done() puts the real one back.
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps. ev collects spot, nowplaying and caption events with their times. at: the fake date; rate: sample rate; s: seed.
function sim(opts = {}, { at = new Date(2026, 9, 11, 9, 20), rate = 48000, s = 1 } = {}) {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: at.getTime() });
  seed(s);
  const ctx = new FakeAudioContext({ sampleRate: rate }), r = createMDFM({ audioContext: ctx, ...opts });
  const ev = { spot: [], np: [], cap: [] };
  r.on("spot", x => ev.spot.push({ t: ctx.currentTime, kind: x.kind, x }));
  r.on("nowplaying", x => ev.np.push({ t: ctx.currentTime, style: x.style }));
  r.on("caption", x => ev.cap.push({ t: ctx.currentTime, text: x.text, who: x.who }));
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { if (r.isOn() || true) ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, ev, run };
}
const done = () => { mock.timers.reset(); Math.random = realRandom; };
const SHOWS = ["play", "arts", "podcast", "cooking"];

test("two hours on air: no AudioParam errors, shows 12+ minutes apart, no genre repeat within 4 songs, talk keeps coming", async () => {
  for (const s of [1, 2]) {
    const { r, ev, run, ctx } = sim({}, { s }); r.start(); await run(7200);
    const shows = ev.spot.filter(e => SHOWS.includes(e.kind)).map(e => e.t);
    for (let i = 1; i < shows.length; i++) assert.ok(shows[i] - shows[i - 1] > 720, `shows ${shows[i - 1]} and ${shows[i]} too close`);
    const st = ev.np.map(e => e.style);
    for (let i = 1; i < st.length; i++) assert.ok(!st.slice(Math.max(0, i - 4), i).includes(st[i]), `genre ${st[i]} repeated within 4 songs`);
    assert.ok(ev.spot.length > 20, "talk breaks keep coming");
    assert.ok(!ev.cap.some(c => /undefined|NaN/.test(c.text)), "no undefined/NaN in captions");
    assert.ok(ctx.disconnects > 10, "finished songs' buses are disconnected");
    r.stop(); await run(1);
  }
  done();
});

test("a news provider that returns junk or throws never stalls the station", async () => {
  for (const news of [() => { throw new Error("boom"); }, async () => ({ items: [{ text: "hello" }] }), () => new Promise(() => {})]) {
    const { r, ev, run } = sim({ news }, { at: new Date(2026, 9, 11, 9, 57) }); r.start(); await run(3600);
    const after = ev.spot.filter(e => e.t > 900);
    assert.ok(after.length >= 5, `station kept talking (${after.length} breaks after 15 min)`);
    r.stop(); await run(1);
  }
  done();
});

test("weather and sports providers that throw or reject never stall the station", async () => {
  const { r, ev, run } = sim({ weather: () => { throw new Error("x"); }, sports: () => Promise.reject(new Error("y")), cannedFallback: false, types: { ads: false, ids: false, interviews: false, callers: false, funnelball: false, plays: false, arts: false, podcast: false, cooking: false, homerepair: false, garage: false, showponies: false } });
  r.start(); await run(3600);
  assert.ok(!ev.cap.some(c => /undefined/.test(c.text)));
  assert.ok(ev.spot.filter(e => e.t > 1800).length >= 1, "still running breaks in the second half hour");
  r.stop(); await run(1); done();
});

test("weather provider with junk numbers never says NaN", async () => {
  const { r, ev, run } = sim({ weather: async () => ({ temp: "warm", wind: "lots", cond: "sunny" }), cannedFallback: true });
  r.start(); await run(10); for (let i = 0; i < 6; i++) { r.spotNow("weather"); await run(60); }
  assert.ok(ev.cap.filter(c => /Tabitha/.test(c.text)).length >= 6, "six weather breaks ran"); assert.ok(!ev.cap.some(c => /NaN/.test(c.text)), ev.cap.map(c => c.text).join("\n"));
  r.stop(); await run(1); done();
});

test("types switched off never play, and with every talk type off except voice drops, voice drops still play", async () => {
  const allOff = Object.fromEntries(["ids", "stingers", "ads", "interviews", "callers", "weather", "sports", "plays", "arts", "podcast", "cooking", "homerepair", "garage", "funnelball", "showponies", "technews", "news"].map(k => [k, false]));
  let x = sim({ types: allOff, news: async () => ({ items: [{ text: "hi", channel: "general", who: { first: "A" }, kind: "official" }] }) }, { at: new Date(2026, 9, 11, 9, 50) });
  x.r.start(); await x.run(3600);
  assert.equal(x.ev.spot.length, 0, "nothing but music: " + x.ev.spot.map(e => e.kind));
  x.r.stop(); await x.run(1);
  x = sim({ types: { ...allOff, stingers: true } }); x.r.start(); await x.run(1800);
  assert.ok(x.ev.spot.length > 0 && x.ev.spot.every(e => e.kind === "stinger"), "voice drops play: " + x.ev.spot.map(e => e.kind));
  x.r.stop(); await x.run(1); done();
});

test("generated ads never say undefined when a pack has an owner and kind but no other parts", async () => {
  const { r } = sim({ includeCore: false, packs: [examplePack] });
  for (let i = 0; i < 400; i++) { const s = r.nextSpotText(); if (s && s.text != null) assert.ok(!/undefined/.test(s.text), s.text); }
  done();
});

test("spotNow('id') and spotNow('ad') speak real text; spotNow of a kind with no content doesn't wedge the station", async () => {
  const { r, ev, run } = sim({}); r.start(); await run(5);
  r.spotNow("id"); await run(40); r.spotNow("ad"); await run(60);
  assert.ok(!ev.cap.some(c => c.text == null || /undefined/.test(c.text)), ev.cap.map(c => c.text).join("\n"));
  r.spotNow("interview"); await run(30);
  const n = ev.cap.length; r.spotNow("id"); await run(30); assert.ok(ev.cap.length > n, "station still talks after a malformed forced spot");
  r.stop(); await run(1); done();
});

test("stop then start again quickly: the old talk break doesn't keep talking", async () => {
  const { r, ev, run } = sim({}); r.start(); await run(5);
  r.spotNow("play"); await run(20);
  assert.ok(ev.cap.length > 0, "play started");
  r.stop(); await run(.1); r.start();
  const t0 = ev.spot.length, c0 = ev.cap.length; await run(25);
  const newSpot = ev.spot.slice(t0).length;
  if (!newSpot) assert.equal(ev.cap.length, c0, "stale captions after restart: " + ev.cap.slice(c0).map(c => c.text).join(" | "));
  r.stop(); await run(1); done();
});

test("news at the top of the hour still plays when a long break is running at the first song change", async () => {
  let hits = 0;
  for (const s of [3, 4, 5, 6, 7]) {
    const { r, ev, run } = sim({ news: async () => ({ items: [{ text: "Lunch is here.", channel: "general", who: { first: "Ann" }, kind: "official" }] }) }, { at: new Date(2026, 9, 11, 9, 59, 30), s });
    r.start(); await run(5); r.spotNow("play"); await run(9 * 60);
    if (ev.spot.some(e => e.kind === "news")) hits++;
    r.stop(); await run(1);
  }
  assert.equal(hits, 5, `news played in ${hits}/5 runs`); done();
});

test("getSpectrum stays finite at a 16 kHz output rate; setVolume ignores junk", async () => {
  const { r, run } = sim({ volume: "loud" }, { rate: 16000 }); r.start(); await run(3);
  const sp = r.getSpectrum(); assert.ok(sp.every(Number.isFinite), "spectrum finite: " + [...sp]);
  r.setVolume(NaN); r.setVolume(undefined); r.setVolume(.5); assert.equal(r.getVolume(), .5);
  await run(1); r.stop(); await run(1); done();
});

test("noise bursts longer than the noise buffer don't run out early", async () => {
  const { r, ctx, run } = sim({}); r.start(); await run(120);
  const noise = ctx.sources.filter(s => s.buffer && Math.abs(s.buffer.duration - 2) < 1e-9 && s.stopT != null);
  assert.ok(noise.length > 100);
  for (const s of noise) assert.ok(s.loop || s.off + (s.stopT - s.startT) <= 2 + 1e-9, `noise source runs out: offset ${s.off} for ${s.stopT - s.startT}s`);
  r.stop(); await run(1); done();
});

test("renderOffline while the radio is playing doesn't disturb the live scheduler", async () => {
  const { r, run, ctx } = sim({}); r.start(); await run(5);
  const p = r.renderOffline("song", 4), n0 = ctx.nodes;
  assert.equal(r.audioContext, ctx, "live context stays current while the render runs");
  await run(1); assert.ok(ctx.nodes > n0, "live music keeps being scheduled during the render");
  await run(2); const buf = await p; assert.ok(buf.length > 0);
  assert.equal(r.audioContext, ctx); await run(5);
  r.stop(); await run(1); done();
});
