// 1.37 PERFORM (MIX › PERFORM): pads land on the next 16th and RECORD writes drum pads into BEAT; ROLL, XY and DROP start,
// report their state and let go; the XY pad never changes the FX knobs' own settings; nothing works with SOUND off.
// On the strict fake Web Audio (test/_fakeaudio.mjs), against dist/mdfm.mjs. Run: node scripts/build.mjs, then node --test test/*.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM } = await import("../dist/mdfm.mjs");

// sim(): fake clock and a fresh radio on PTRN; run(sec) advances both in 40 ms steps (as in the other tests)
function sim() {
  mock.timers.reset(); mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 9, 27, 9, 0).getTime() });
  const ctx = new FakeAudioContext({ sampleRate: 48000 }), r = createMDFM({ audioContext: ctx, spots: false });
  const run = async sec => { for (let i = 0; i < Math.round(sec * 25); i++) { ctx.currentTime += .04; mock.timers.tick(40); await new Promise(setImmediate); } };
  return { ctx, r, run };
}

test("perfInfo lists eight pads (five drum lanes), the XY effects, the rolls and the drops; nothing plays with SOUND off", () => {
  const { r } = sim(), i = r.perfInfo();
  assert.equal(i.pads.length, 8); assert.deepEqual(i.pads.filter(p => p[2]).map(p => p[2]), ["k", "s", "h", "o", "p"]);
  assert.deepEqual(i.xy.map(x => x[0]), ["echo", "reverb", "gate", "crush", "flange"]); assert.deepEqual(i.rolls.map(x => x[0]), [1, .5, .25, .125]); assert.deepEqual(i.drops, [4, 8]);
  assert.equal(r.perfPad("kick"), null); assert.equal(r.perfRoll(.5), false); assert.equal(r.perfDrop(4), false);
  mock.timers.reset();
});
test("pads land on a 16th after now; RECORD writes the drum pads into BEAT (and lifts INFLUENCE to .5)", async () => {
  const { ctx, r, run } = sim(); r.setStation("ptrn"); r.setBeat({ inf: 0 }); r.start(); await run(3);
  const seen = []; r.on("pad", e => seen.push(e.id));
  for (const id of ["kick", "clap", "hat", "ohat", "perc", "stab", "horn", "crash"]) { const p = r.perfPad(id); assert.ok(p && p.t >= ctx.currentTime && p.step >= 0 && p.step < 16, id); }
  assert.equal(seen.length, 8); assert.equal(r.perfPad("nope"), null);
  const before = r.getBeat(); assert.ok(before.grid.k.every(x => x === 0), "no RECORD: BEAT untouched");
  const k = r.perfPad("kick", { rec: true }), h = r.perfPad("stab", { rec: true }), b = r.getBeat();
  assert.equal(b.grid.k[k.step], 2); assert.equal(b.inf, .5); assert.ok(Object.values(b.grid).every(l => l.filter(x => x).length <= 1), "STAB has no lane");
  r.perfPad("kick", { rec: true }); const b2 = r.getBeat(); assert.ok(b2.grid.k.includes(3) || b2.grid.k.filter(x => x).length === 2, "a second hit on the same step goes loud");
  r.stop(); mock.timers.reset();
});
test("ROLL, XY and DROP report their state and let go; XY leaves the FX settings alone", async () => {
  const { ctx, r, run } = sim(); r.setStation("ptrn"); r.start(); await run(3);
  assert.equal(r.perfRoll(.25), true); assert.equal(r.perfState().roll, .25); r.perfRoll(0); assert.equal(r.perfState().roll, 0);
  const fx0 = r.getFx(); const o = r.perfXY({ x: .8, y: .6, fx: "reverb" }); assert.deepEqual(o, { filter: .8, reverb: .6 });
  assert.deepEqual(r.getFx(), fx0, "the knobs keep their values"); assert.deepEqual(r.perfState().xy, { filter: .8, reverb: .6 });
  r.perfXY(null); assert.equal(r.perfState().xy, null);
  const d = r.perfDrop(4); assert.ok(d && d.from >= ctx.currentTime && d.at > d.from); assert.equal(r.perfDrop(8), false, "one at a time");
  const bar = (d.at - d.from) / 4; assert.ok(bar > .8 && bar < 4, "four bars of a real tempo");
  await run(d.at - ctx.currentTime + .5); assert.equal(r.perfState().drop, null, "done after the drop");
  assert.ok(r.perfDrop(8), "and another can start"); r.stop(); mock.timers.reset();
});
