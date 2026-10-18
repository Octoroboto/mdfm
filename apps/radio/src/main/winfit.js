// The window follows the receiver's height (MDFM 1.25): the page asks for its content height on load and every time the
// MIX drawer opens, closes or changes section. The first request (the page loading) sizes the window at once; later
// ones are debounced, so a drawer animating open becomes one resize, not a dozen. The height is always clamped to the
// screen's work area and never goes below the deck (the receiver with MIX closed) or the window's minimum height.
// Pure parts (fitBounds) are exported for the tests; no Electron here.
// Process: Electron main (main.js's "win:fit" IPC handler makes one fitter per window).

// want: the height the page asks for; deck: the receiver's height with MIX closed (0 if the page didn't say);
// bounds: the window's {x, y, width, height}; workArea: the display's {x, y, width, height}; minHeight: the window's minimum.
// Returns the new bounds, or null when nothing should change.
function fitBounds({ want, deck = 0, bounds, workArea, minHeight = 0 }) {
  if (!(want > 200) || !bounds || !workArea) return null;
  const top = workArea.height, floor = Math.min(top, Math.max(minHeight, Math.round(deck) || 0));
  const height = Math.max(floor, Math.min(top, Math.round(want)));
  if (Math.abs(height - bounds.height) < 2) return null;
  // keep the top edge where it is unless the bottom would go off the screen; then move up, but never above the work area
  const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height));
  return { x: bounds.x, y, width: bounds.width, height };
}

// win: the BrowserWindow; screen: Electron's screen. request(h, deck) is called from the win:fit IPC.
// delay: debounce in ms. timers: swappable for tests. Returns { request(h, deck), flush() }.
function createFitter({ win, screen, delay = 120, timers = { setTimeout, clearTimeout } }) {
  let first = true, t = null, last = null;
  // Applies the last request now. Skipped for fullscreen or maximized windows, which the person sized on purpose.
  const apply = () => { t = null; const r = last; last = null;
    if (!r || !win || win.isDestroyed() || win.isFullScreen() || win.isMaximized()) return;
    const b = win.getBounds(), wa = screen.getDisplayMatching(b).workArea, min = (win.getMinimumSize && win.getMinimumSize()[1]) || 0;
    const nb = fitBounds({ want: r.h, deck: r.deck, bounds: b, workArea: wa, minHeight: min });
    if (nb) win.setBounds(nb); };
  return {
    request(h, deck) { h = +h; deck = +deck || 0; if (!(h > 200)) return;
      last = { h, deck: deck > 0 && deck <= h ? deck : 0 };
      if (first) { first = false; apply(); return; }   // the page has just loaded: size it now
      if (t) timers.clearTimeout(t); t = timers.setTimeout(apply, delay); },
    flush() { if (t) { timers.clearTimeout(t); apply(); } } };
}

module.exports = { fitBounds, createFitter };
