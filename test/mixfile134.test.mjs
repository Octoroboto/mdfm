// 1.34: MIX files (src/mixfile.js): a snapshot round-trips through JSON onto another radio, an on-air import glides the
// dials and flips the switches halfway, a file from another station tunes there, bad files are refused, and a claude.ai
// .zip opens. On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs. node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;   // the bundle's vendored scripts look for `self`
const { createMDFM, readMixFile, mixFileName, zipFiles } = await import("../dist/mdfm.mjs");

// sim(): fake clock (mock timers, a fixed date) and a fresh FakeAudioContext with a radio on it; run(sec) advances both in 40 ms steps.
function sim() {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 26, 9, 0).getTime() });
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run };
}
const done = () => mock.timers.reset();
// strip(f): a snapshot without the fields that differ between two saves (time, name, engine)
const strip = f => { const { saved, name, engine, ...rest } = f; return JSON.parse(JSON.stringify(rest)); };
// dial(r): a radio with a bit of everything moved, on PTRN
function dial(r) {
  r.setSound({ realism: .7, warmth: .4, room: .3, roomType: "club" });
  r.setEq({ p1: { freq: 800, gain: 4, q: 1.2 }, hc: { on: true, freq: 9000, slope: 24 } });
  r.setFx({ echo: .6, reverb: .3, filter: .2 });
  r.setStyleMix({ jazz: .5, space: .2 }, "ptrn"); r.setGroove({ swing: .7, bpm: 128, root: 3 }, "ptrn"); r.setBeat({ inf: .8, grid: { k: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0] } }, "ptrn");
  r.setStyleMix({ rock: .4 }, "mdfm"); r.setGroove({ density: .9 }, "mdfm");
  r.setTypes({ ads: false, weather: false }); r.setStationTypes("wybc", { winds: false });
  const inst = r.instrumentList(); r.setInstruments({ [inst[0][0]]: false, [inst[3][0]]: false });
  r.setStation("ptrn");
}

test("a snapshot survives JSON and lands the same on another radio", async () => {
  const a = sim(); dial(a.r); const file = JSON.parse(JSON.stringify(a.r.getSettings({ name: "Late night" }))); done();
  assert.equal(file.kind, "mdfm-mix"); assert.equal(file.v, 1); assert.equal(file.name, "Late night"); assert.equal(file.station, "ptrn");
  assert.ok(file.types.mdfm && file.types.wybc && file.instruments && file.sound && file.eq && file.fx && file.stations.ptrn.groove);
  const b = sim(); const res = await b.r.applySettings(file, { crossmix: 4 });   // off air: at once, whatever the crossmix
  assert.equal(res.crossmix, 0); assert.equal(res.station, "ptrn"); assert.deepEqual(res.skipped, []);
  assert.deepEqual(strip(b.r.getSettings()), strip(file)); done();
});

test("on air: the dials glide, switches flip halfway, events in order", async () => {
  const a = sim(); dial(a.r); a.r.setStation("mdfm"); const file = a.r.getSettings({ name: "Glide" }); done();
  const b = sim(); b.r.start(); await b.run(1); const ev = []; b.r.on("mixfile", e => ev.push(e.phase));
  const echo0 = b.r.getFx().echo, p = b.r.applySettings(file, { crossmix: 2 });
  await b.run(.6); const mid = b.r.getFx().echo;
  assert.ok(mid > echo0 + .01 && mid < .59, `echo part way (${mid})`); assert.equal(b.r.getTypes().ads, true, "switches wait for halfway");
  await b.run(.8); assert.equal(b.r.getTypes().ads, false, "switches flipped after halfway");
  await b.run(1); const res = await p;
  assert.equal(res.crossmix, 2); assert.equal(b.r.getFx().echo, .6); assert.equal(b.r.getStyleMix("mdfm").rock, .4);
  assert.deepEqual(ev, ["start", "switch", "done"]);
  assert.equal(Math.round(b.r.getEq().p1.freq), 800); b.r.stop(); done();
});

test("a file saved on another station tunes there and brings that station's mix", async () => {
  const a = sim(); dial(a.r); const file = a.r.getSettings(); done();
  const b = sim(); b.r.start(); await b.run(1); assert.equal(b.r.getStation().id, "mdfm");
  const p = b.r.applySettings(file, { crossmix: 1 }); assert.equal(b.r.getStation().id, "ptrn", "tuned at once");
  assert.equal(b.r.getGroove("ptrn").swing, file.stations.ptrn.groove.swing, "the new station's own mix is on before it plays");
  await b.run(1.5); await p; assert.equal(b.r.getStyleMix("ptrn").jazz, .5); b.r.stop(); done();
});

test("a second import lands the first, and turning the dial mid-glide lands it", async () => {
  const a = sim(); dial(a.r); a.r.setStation("mdfm"); const f1 = a.r.getSettings(); a.r.setFx({ echo: .1 }); const f2 = a.r.getSettings(); done();
  const b = sim(); b.r.start(); await b.run(.5);
  const p1 = b.r.applySettings(f1, { crossmix: 5 }); await b.run(.4); const p2 = b.r.applySettings(f2, { crossmix: 5 });
  const r1 = await p1; assert.equal(r1.name, ""); await b.run(.4); b.r.setStation("wybc"); await b.run(.1); await p2; assert.equal(b.r.getFx().echo, .1); b.r.stop(); done();
});

test("stations this build doesn't have are skipped and reported", async () => {
  const b = sim(); const f = b.r.getSettings(); f.station = "zzzz"; f.stations.zzzz = { groove: { swing: .3 } }; f.types.zzzz = { a: true };
  const res = await b.r.applySettings(f); assert.equal(res.station, "mdfm"); assert.deepEqual(res.skipped, ["station zzzz", "station zzzz", "switches for zzzz"]); done();
});

test("reading files: .mdfm, a claude.ai .zip, and refusals", async () => {
  const b = sim(); const f = b.r.getSettings({ name: "Zipped" }); done();
  const bytes = new TextEncoder().encode(JSON.stringify(f));
  assert.equal((await readMixFile(new Blob([bytes]))).name, "Zipped");
  const zip = zipFiles([{ name: "Zipped.mdfm", bytes }]); assert.equal((await readMixFile(zip)).name, "Zipped");
  await assert.rejects(readMixFile(new Blob(["{\"kind\":\"other\"}"])), /isn't a MIX file/);
  await assert.rejects(readMixFile(new Blob(["not json"])), /isn't a MIX file/);
  await assert.rejects(readMixFile(zipFiles([{ name: "song.mp3", bytes: new Uint8Array(10) }])), /no MIX file inside/);
  assert.equal(mixFileName("Late: night/mix"), "Late night mix.mdfm.json"); assert.equal(mixFileName(""), "MDFM mix.mdfm.json");
});
