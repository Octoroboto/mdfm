const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const { fitBounds, createFitter } = require("../src/main/winfit");
const wa = { x: 0, y: 25, width: 1440, height: 875 };
const b = (y, height) => ({ x: 200, y, width: 1060, height });

test("the window grows to the receiver, within the screen's work area", () => {
  assert.deepEqual(fitBounds({ want: 760, bounds: b(40, 600), workArea: wa }), { x: 200, y: 40, width: 1060, height: 760 });
  assert.equal(fitBounds({ want: 3046, bounds: b(40, 760), workArea: wa }).height, 875);   // MIX open on a short screen: the work area, no taller
});
test("growing near the bottom of the screen moves the window up, never above the work area", () => {
  const r = fitBounds({ want: 800, bounds: b(300, 600), workArea: wa }); assert.equal(r.height, 800); assert.equal(r.y, 25 + 875 - 800);
  assert.equal(fitBounds({ want: 5000, bounds: b(300, 600), workArea: wa }).y, 25);
});
test("it shrinks back when MIX closes, but never below the deck or the window's minimum", () => {
  assert.equal(fitBounds({ want: 700, deck: 700, bounds: b(25, 875), workArea: wa, minHeight: 520 }).height, 700);
  assert.equal(fitBounds({ want: 400, deck: 690, bounds: b(25, 875), workArea: wa, minHeight: 520 }).height, 690);   // a request under the deck
  assert.equal(fitBounds({ want: 400, bounds: b(25, 875), workArea: wa, minHeight: 520 }).height, 520);              // an older page sends no deck
  assert.equal(fitBounds({ want: 900, deck: 2000, bounds: b(25, 600), workArea: wa }).height, 875);                 // a deck taller than the screen: the screen
});
test("nonsense and no-change requests do nothing", () => {
  assert.equal(fitBounds({ want: 0, bounds: b(40, 600), workArea: wa }), null);
  assert.equal(fitBounds({ want: NaN, bounds: b(40, 600), workArea: wa }), null);
  assert.equal(fitBounds({ want: 601, bounds: b(40, 600), workArea: wa }), null);
});

function fakeWin(bounds, { full = false, max = false } = {}) {
  const w = { b: { ...bounds }, sets: [], isDestroyed: () => false, isFullScreen: () => full, isMaximized: () => max, getBounds: () => ({ ...w.b }),
    getMinimumSize: () => [700, 520], setBounds(nb) { w.sets.push(nb.height); w.b = { ...nb }; } }; return w; }
const screen = { getDisplayMatching: () => ({ workArea: wa }) };
function fakeTimers() { let n = 0; const q = new Map(); return { setTimeout: (f) => { q.set(++n, f); return n; }, clearTimeout: id => q.delete(id), run() { const fs = [...q.values()]; q.clear(); fs.forEach(f => f()); }, size: () => q.size }; }

test("every request is honoured, not just the first (1.24 only ever sized the window once)", () => {
  const win = fakeWin(b(40, 820)), timers = fakeTimers(), f = createFitter({ win, screen, timers });
  f.request(760, 760); assert.deepEqual(win.sets, [760]);            // load: at once
  f.request(1600, 760); timers.run(); assert.deepEqual(win.sets, [760, 875]);   // MIX opens
  f.request(760, 760); timers.run(); assert.deepEqual(win.sets, [760, 875, 760]); // MIX closes: back to the deck
});
test("requests are debounced: a drawer animating open is one resize", () => {
  const win = fakeWin(b(40, 760)), timers = fakeTimers(), f = createFitter({ win, screen, timers });
  f.request(760, 760); win.sets.length = 0;
  for (const h of [800, 900, 1000, 1100]) f.request(h, 760);
  assert.equal(timers.size(), 1); timers.run(); assert.deepEqual(win.sets, [875]);
});
test("a full-screen or maximized window is left alone", () => {
  for (const o of [{ full: true }, { max: true }]) { const win = fakeWin(b(40, 600), o), f = createFitter({ win, screen, timers: fakeTimers() }); f.request(800, 600); assert.deepEqual(win.sets, []); }
});
test("main.js wires win:fit through the fitter and the preload passes the deck", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8"), pre = fs.readFileSync(path.join(__dirname, "../src/main/preload.js"), "utf8");
  assert.match(main, /require\("\.\/winfit"\)/); assert.match(main, /ipcMain\.on\("win:fit", \(e, h, deck\)/); assert.doesNotMatch(main, /fitted = true/);
  assert.match(pre, /fit: \(h, deck\) => ipcRenderer\.send\("win:fit", \+h, \+deck \|\| 0\)/);
});
