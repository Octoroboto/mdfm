/* Optional LED spectrum display for MDFM. Draws 19 bars with falling peak caps on a <canvas>.
   When the radio is off it shows a gentle idle shimmer (or nothing, with idle:false). */
export function mountEQ(canvas, radio, opts = {}) {
  const N = 19, SEG = opts.segment ?? 3, GAP = opts.gap ?? 1;
  const colors = opts.colors ?? ["#1ec81e", "#7fe22a", "#e8e030", "#ff9a1e", "#ff3b2a"];
  const unlit = opts.unlit ?? "rgba(60,90,60,.16)", capColor = opts.capColor ?? "#d8dbe6";
  const ctx = canvas.getContext("2d");
  const lvl = new Float32Array(N), peak = new Float32Array(N), pv = new Float32Array(N), hold = new Float32Array(N);
  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, enabled = true;
  const fit = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr)); canvas.width = W; canvas.height = H; };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  function idle(t) { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = .08 + .06 * Math.sin(t * 1.3 + i * .7) + .04 * Math.sin(t * 2.9 + i * 1.9); return o; }
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
  function step(now) {
    raf = requestAnimationFrame(step);
    if (document.hidden || now - last < 16) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const tg = (radio && radio.getSpectrum()) || (opts.idle === false ? new Float32Array(N) : idle(now / 1000));
    for (let i = 0; i < N; i++) {
      lvl[i] = tg[i] > lvl[i] ? tg[i] : Math.max(tg[i], lvl[i] - dt * 2.6);
      if (lvl[i] >= peak[i]) { peak[i] = lvl[i]; pv[i] = 0; hold[i] = .35; } else if (hold[i] > 0) hold[i] -= dt; else { pv[i] += dt * 1.8; peak[i] = Math.max(0, peak[i] - pv[i] * dt); }
    }
    draw();
  }
  raf = requestAnimationFrame(step);
  return {
    setEnabled(v) { enabled = !!v; draw(); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
