// 1.35 BEAT presets: more START FROM patterns, filed under groups. Checks every preset is well formed (a full 16-step
// grid, cells only -1..3, a known group) and that loading one sets the lanes it names and leaves the others to the song.
// Run: node scripts/build.mjs, then node --test test/beat135.test.mjs. Needs dist/mdfm.mjs from the build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeAudioContext, installGlobals } from "./_fakeaudio.mjs";
installGlobals(); globalThis.self = globalThis;
const { createMDFM } = await import("../dist/mdfm.mjs");
const radio = () => createMDFM({ audioContext: new FakeAudioContext({ sampleRate: 48000 }), spots: false });

test("every preset is a full grid in a known group, with unique ids", () => {
  const r = radio(), info = r.beatInfo();
  assert.ok(info.presets.length >= 30, "the 1.35 list is there");
  assert.deepEqual(info.groups, ["Hip-hop", "Dance", "Band", "World", "Shape it"]);
  assert.equal(new Set(info.presets.map(p => p[0])).size, info.presets.length, "ids are unique");
  for (const [id, name, group] of info.presets) {
    assert.ok(name && info.groups.includes(group), id + ": named and grouped");
    const g = r.beatPreset(id);
    for (const [k] of info.lanes) { assert.equal(g[k].length, 16, id + " " + k); assert.ok(g[k].every(x => Number.isInteger(x) && x >= -1 && x <= 3), id + " " + k); }
    assert.ok(info.lanes.some(([k]) => g[k].some(x => x !== 0)), id + ": sets at least one step");
  }
});
test("the 1.31 presets are kept, and a one-lane preset leaves the other lanes to the song", () => {
  const r = radio(), ids = r.beatInfo().presets.map(p => p[0]);
  for (const id of ["four", "boombap", "trap", "half", "break", "dembow", "twostep", "lesshats", "nokick"]) assert.ok(ids.includes(id), id);
  const g = r.beatPreset("nosnare");
  assert.ok(g.s.every(x => x === -1)); for (const k of ["k", "h", "o", "p"]) assert.ok(g[k].every(x => x === 0), k);
  assert.deepEqual(r.beatPreset("bossa").p.map(x => x > 0 ? 1 : 0).join(""), "1001001000100100");   // the bossa clave
});
