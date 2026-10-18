/* Optional LED spectrum display for MDFM. Draws 19 bars with falling peak caps on a <canvas>.
   When the radio is off it shows a gentle idle shimmer (or nothing, with idle:false). */
// Where it fits: scripts/build.mjs puts this file into the bundle after the engine (its one export becomes a plain function),
// and dist/mdfm.mjs / mdfm.iife.js export it as mountEQ. The hub page, dist/radio.html and the apps call it with a <canvas>
// and the radio from createMDFM() (src/engine.js), whose getSpectrum() gives 19 levels 0..1 (or null when off).
// mountEQ(canvas, radio, opts): starts drawing at screen refresh rate and returns { setEnabled(v), destroy() }.
// opts: segment (LED height, CSS px, default 3), gap (CSS px between LEDs and bars, 1), colors (bottom-to-top gradient
// stops), unlit (color of dark LEDs), capColor (peak caps), idle (false hides the shimmer when the radio is off).
export function mountEQ(canvas, radio, opts = {}) {
  const N = 19, SEG = opts.segment ?? 3, GAP = opts.gap ?? 1;   // 19 bars, matching the engine's getSpectrum()
  const colors = opts.colors ?? ["#1ec81e", "#7fe22a", "#e8e030", "#ff9a1e", "#ff3b2a"];
  const unlit = opts.unlit ?? "rgba(60,90,60,.16)", capColor = opts.capColor ?? "#d8dbe6";
  const ctx = canvas.getContext("2d");
  // Per-bar state: lvl = the level shown (0..1), peak = the cap's height, pv = the cap's fall speed, hold = seconds the cap waits before falling.
  const lvl = new Float32Array(N), peak = new Float32Array(N), pv = new Float32Array(N), hold = new Float32Array(N);
  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, enabled = true;   // W, H: canvas size in device pixels; dpr: pixel ratio; raf: the animation frame id; last: the last frame's time (ms); enabled: setEnabled()
  const fit = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr)); canvas.width = W; canvas.height = H; };   // fit(): matches the canvas's pixel size to its CSS size (pixel ratio capped at 2 to keep drawing cheap)
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  const idleBuf = new Float32Array(N), zero = new Float32Array(N);
  // idle(t): the "off" shimmer, two slow sine waves per bar around 0.08 (t in seconds). Reuses one buffer, no allocation per frame.
  function idle(t) { const o = idleBuf; for (let i = 0; i < N; i++) o[i] = .08 + .06 * Math.sin(t * 1.3 + i * .7) + .04 * Math.sin(t * 2.9 + i * 1.9); return o; }
  // draw(): paints every bar's LEDs from the bottom (lit ones with the gradient, the rest unlit) and its peak cap.
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bw = W / N, seg = SEG * dpr, gap = GAP * dpr, rows = Math.floor(H / (seg + gap));
    const g = ctx.createLinearGradient(0, H, 0, 0); colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    for (let i = 0; i < N; i++) {
      const x = Math.round(i * bw + gap), w = Math.max(1, Math.round(bw - gap * 2)), on = enabled ? Math.round(lvl[i] * rows) : 0;
      ctx.fillStyle = unlit; for (let r = on; r < rows; r++) ctx.fillRect(x, H - (r + 1) * (seg + gap), w, seg);
      ctx.fillStyle = g; for (let r = 0; r < on; r++) ctx.fillRect(x, H - (r + 1) * (seg + gap), w, seg);
      const pr = Math.min(rows - 1, Math.round(peak[i] * rows));
      if (enabled && pr > 0) { ctx.fillStyle = capColor; ctx.fillRect(x, H - (pr + 1) * (seg + gap), w, Math.max(1, Math.round(seg * .7))); }
    }
  }
  // step(now): one animation frame (now in ms). Skips hidden tabs and anything faster than ~60 fps, eases levels toward the
  // target and moves the peak caps, then draws.
  function step(now) {
    raf = requestAnimationFrame(step);
    if (document.hidden || now - last < 16) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;   // seconds since the last frame, capped at 0.1 so a stall doesn't jump
    const tg = (radio && radio.getSpectrum()) || (opts.idle === false ? zero : idle(now / 1000));
    for (let i = 0; i < N; i++) {
      lvl[i] = tg[i] > lvl[i] ? tg[i] : Math.max(tg[i], lvl[i] - dt * 2.6);   // rises instantly, falls at 2.6 levels per second
      if (lvl[i] >= peak[i]) { peak[i] = lvl[i]; pv[i] = 0; hold[i] = .35; } else if (hold[i] > 0) hold[i] -= dt; else { pv[i] += dt * 1.8; peak[i] = Math.max(0, peak[i] - pv[i] * dt); }   // caps jump up with the level, hold for 0.35 s, then fall with gravity (speed grows 1.8 per second)
    }
    draw();
  }
  raf = requestAnimationFrame(step);
  return {
    setEnabled(v) { enabled = !!v; draw(); },   // false shows the bars unlit (e.g. a muted or hidden display)
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },   // stops drawing and stops watching the canvas size
  };
}
