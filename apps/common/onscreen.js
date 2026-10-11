// Keeps a frameless window reachable: its top edge never goes above the menu bar, and enough of it stays on a screen to grab.
// Also used by the Window menu's "Bring Back to Center".
const KEEP_X = 160, KEEP_Y = 90;   // pixels of the window that must stay on screen
function clampPoint({ x, y, width, height }, wa) {
  return {
    x: Math.min(Math.max(x, wa.x - width + KEEP_X), wa.x + wa.width - KEEP_X),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - KEEP_Y),
  };
}
function areaFor(screen, b) { return screen.getDisplayMatching(b).workArea; }
function clampedPosition(screen, win, x, y) {
  const b = win.getBounds(), p = { x, y, width: b.width, height: b.height };
  return clampPoint(p, areaFor(screen, { ...b, x: Math.round(x), y: Math.round(y) }));
}
function keepOnScreen(screen, win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const b = win.getBounds(), visible = screen.getAllDisplays().some(d => { const a = d.workArea;
    return b.x + b.width - KEEP_X >= a.x && b.x + KEEP_X <= a.x + a.width && b.y >= a.y - 1 && b.y + KEEP_Y <= a.y + a.height; });
  if (visible) return;
  const p = clampPoint(b, areaFor(screen, b)); win.setPosition(Math.round(p.x), Math.round(p.y));
}
function center(screen, win) {
  if (!win || win.isDestroyed()) return; if (win.isFullScreen()) win.setFullScreen(false);
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, b = win.getBounds();
  const width = Math.min(b.width, wa.width), height = Math.min(b.height, wa.height);
  win.setBounds({ x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height }); win.show(); win.focus();
}
module.exports = { clampPoint, clampedPosition, keepOnScreen, center, KEEP_X, KEEP_Y };
