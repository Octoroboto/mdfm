// HEARYE 95.5's writer (src/faire.js) and its scripted shows (src/faire/*.js): every show has 15+ episodes with known
// voices and sound cues, and the procedural segments never leave a placeholder or "undefined" in a line.
// Run: node --test test/faire.test.mjs (no build needed: loads src/faire.js and the show files into a vm context).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// The writer and every show file, concatenated and run in one vm context, so createFaire and the SHOW_* objects exist.
const src = ["doug", "cauldron", "grog", "pest", "dqi", "onestar", "hoard", "pools"].map(f => readFileSync(new URL(`../src/faire/${f}.js`, import.meta.url), "utf8")).join("\n") + "\n" + readFileSync(new URL("../src/faire.js", import.meta.url), "utf8");
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ";this.F=createFaire(Math.random); this.SHOWS=[SHOW_DOUG,SHOW_CAULDRON,SHOW_GROG,SHOW_PEST,SHOW_DQI,SHOW_ONESTAR,SHOW_HOARD];", ctx);
const { F, SHOWS } = ctx;
// SFX: every sound cue a script may use. STYLES: every music style a show may ask for.
const SFX = new Set("rain knock door steps claps thunder clock horse wind teacup page applause hammer crash gallery".split(" "));
const STYLES = new Set(["elven", "halfling", "tavern", "council", "evil", "herald", "orders", "battle", "lament", "procession"]);
// A line's spoken text, whether it is [who, "text"] or [who, { say, show }].
const text = l => typeof l[1] === "object" && l[1] ? l[1].say + " " + l[1].show : String(l[1] ?? "");
// Asserts each script line is well formed: pauses positive, cues known, a voice for every speaker, no placeholders.
function checkLines(lines, cast, where) {
  for (const l of lines) {
    if (l[0] === "seg") continue; if (l[0] === "pause") { assert.ok(+l[1] > 0, where); continue; }
    if (l[0] === "sfx") { assert.ok(SFX.has(l[1]), `${where}: sfx ${l[1]}`); continue; }
    assert.ok(cast[l[0]], `${where}: no voice for ${l[0]}`);
    assert.ok(text(l).trim().length > 1 && !/undefined|NaN|\{\w+\}/.test(text(l)), `${where}: bad line ${text(l)}`);
  }
}
test("every scripted show: 15+ episodes, known voices and cues, a style with music", () => {
  for (const s of SHOWS) {
    assert.ok(s.episodes.length >= 15, `${s.id}: ${s.episodes.length} episodes`); assert.ok(STYLES.has(s.style), `${s.id}: style ${s.style}`);
    assert.equal(new Set(s.episodes.map(e => e.title)).size, s.episodes.length, `${s.id}: repeated titles`);
    for (const e of s.episodes) checkLines(e.lines, { ...s.cast, ...(e.cast || {}) }, `${s.id} "${e.title}"`);
  }
});
test("episodes don't repeat until every one has aired", () => {
  for (const s of F.shows) { const seen = new Set(); for (let i = 0; i < s.episodes; i++) seen.add(F.show(s.id).title); assert.equal(seen.size, s.episodes, s.id); }
});
test("procedural segments: jousts, ponies, callers, ads, news and IDs are always well formed", () => {
  for (let i = 0; i < 300; i++) {
    for (const seg of [F.joust(), F.ponies(), F.caller()]) { checkLines(seg.lines, { ...F.HOSTS, ...seg.cast }, seg.kind); assert.ok(STYLES.has(seg.style || "lament")); }
    const a = F.ad(); checkLines(a.lines, a.cast, "ad " + a.title);
    for (const l of [F.ids(), F.bardIntro({ title: "T", artist: "A" }), F.bardBack({ title: "T", artist: "A" }), F.heraldOpen(), F.heraldClose(), F.piece(), F.artist()]) assert.ok(l && !/undefined|\{\w+\}/.test(l), l);
    for (const l of F.proclamations()) assert.ok(!/undefined|\{\w+\}/.test(text(l)));
  }
  const n = F.news([{ who: { first: "Rob", initial: "D" }, channel: "general", text: "Hey everyone, are you coming to the meeting today? Thanks!", image: 2 }]);
  assert.match(n[0][1].show, /#general/); assert.match(n[0][1].say, /Hail all ye good folk, art thou coming to the council this day\? Many thanks!/);
  assert.equal(F.news([]), null);
});
