// Keeps a frameless window reachable: its top edge never goes above the menu bar, and enough of it stays on a screen to grab.
// Also used by the Window menu's "Bring Back to Center".
// Process: Electron main (radio and hub main.js, on move/resize/display changes and from the Window menu).
const KEEP_X = 160, KEEP_Y = 90;   // pixels of the window that must stay on screen
// Pure: moves a window rect { x, y, width, height } so KEEP_X px stay inside the work area wa horizontally, its top is
// never above wa (the menu bar) and KEEP_Y px stay above the bottom. Returns { x, y }.
function clampPoint({ x, y, width, height }, wa) {
  return {
    x: Math.min(Math.max(x, wa.x - width + KEEP_X), wa.x + wa.width - KEEP_X),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - KEEP_Y),
  };
}
// The work area (screen minus menu bar and Dock) of the display a rect is mostly on.
function areaFor(screen, b) { return screen.getDisplayMatching(b).workArea; }
// Where a window may be dragged to (x, y in screen points), clamped against the display it would land on. Returns { x, y }.
function clampedPosition(screen, win, x, y) {
  const b = win.getBounds(), p = { x, y, width: b.width, height: b.height };
  return clampPoint(p, areaFor(screen, { ...b, x: Math.round(x), y: Math.round(y) }));
}
// Moves (and if needed shrinks) a window that ended up unreachable, e.g. after a display was unplugged. Fullscreen is left alone.
function keepOnScreen(screen, win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const b = win.getBounds(), visible = screen.getAllDisplays().some(d => { const a = d.workArea;
    return b.x + b.width - KEEP_X >= a.x && b.x + KEEP_X <= a.x + a.width && b.y >= a.y - 1 && b.y + KEEP_Y <= a.y + a.height; });
  const wa = areaFor(screen, b);
  if (visible && b.height <= wa.height) return;
  // Taller than the screen it landed on (a smaller display, or the Dock grew): shrink it so its top stays reachable.
  const height = Math.min(b.height, wa.height), p = clampPoint({ ...b, height }, wa);
  win.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: b.width, height });
}
// "Bring Back to Center": leaves fullscreen, fits the window to the display under the mouse, centres, shows and focuses it.
function center(screen, win) {
  if (!win || win.isDestroyed()) return; if (win.isFullScreen()) win.setFullScreen(false);
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, b = win.getBounds();
  const width = Math.min(b.width, wa.width), height = Math.min(b.height, wa.height);
  win.setBounds({ x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height }); win.show(); win.focus();
}
module.exports = { clampPoint, clampedPosition, keepOnScreen, center, KEEP_X, KEEP_Y };
