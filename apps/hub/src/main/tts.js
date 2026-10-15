// Renders MDFM's robot voices to audio with macOS's own `say`, so they play through the radio's volume, LOW/MID/HIGH EQ,
// VU meters and visualizer like everything else. Local only: no network. Falls back (in the page) to system speech if this fails.
// At most 2 `say` runs at a time with up to 24 waiting (more answers "busy", so the page uses system speech); the same line
// asked for twice at once is rendered once; the cache of recent lines is capped by size as well as count.
const { execFile } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const SAY = "/usr/bin/say";
const MAX_BYTES = 40 * 1024 * 1024, MAX_ENTRY = 4 * 1024 * 1024, MAX_COUNT = 80, MAX_RUNNING = 2, MAX_QUEUE = 24;

function args(spec, inFile, outFile, voice) {
  const a = ["-f", inFile, "-o", outFile, "--file-format=WAVE", "--data-format=LEI16@22050"];
  if (voice) a.push("-v", voice);
  const rate = Math.max(90, Math.min(360, Math.round(175 * (+spec.rate || 1)))); a.push("-r", String(rate));
  return a;
}
// exec and available can be swapped in tests; the app uses the real `say`.
function createTts({ exec = execFile, available = () => process.platform === "darwin" && fs.existsSync(SAY) } = {}) {
  const cache = new Map();   // recent lines (station IDs repeat), newest last
  let cacheBytes = 0, running = 0; const waiters = [], inflight = new Map();
  const run = a => new Promise((res, rej) => exec(SAY, a, { timeout: 20000 }, (e, out, err) => e ? rej(Object.assign(new Error(String(err || e.message).slice(0, 200)), { timedOut: !!e.killed })) : res()));
  const acquire = () => running < MAX_RUNNING ? (running++, Promise.resolve())
    : waiters.length >= MAX_QUEUE ? Promise.reject(new Error("busy")) : new Promise(r => waiters.push(r));   // a waiter is handed the slot by release()
  const release = () => { const w = waiters.shift(); if (w) w(); else running--; };
  function keep(key, buf) {
    if (buf.length > MAX_ENTRY) return;
    cache.set(key, buf); cacheBytes += buf.length;
    while (cacheBytes > MAX_BYTES || cache.size > MAX_COUNT) { const k = cache.keys().next().value; cacheBytes -= cache.get(k).length; cache.delete(k); }
  }
  async function renderNow(spec, text, key) {
    // Pitch: speech-synthesis pitch (0..2, 1 = normal) becomes a relative pitch shift for the voices that support it.
    const st = Math.max(-24, Math.min(24, Math.round(12 * Math.log2(Math.max(.1, +spec.pitch || 1)))));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-tts-")), inFile = path.join(dir, "line.txt"), outFile = path.join(dir, "line.wav");
    try {
      fs.writeFileSync(inFile, (st ? `[[pbas ${st > 0 ? "+" : ""}${st}]] ` : "") + text);   // text goes in a file, never on the command line
      const name = spec.voice ? String(spec.voice).slice(0, 80) : null, short = name ? name.replace(/\s*\(.*$/, "") : null;
      let ok = false;
      for (const v of [...new Set([name, short, null])]) { try { await run(args(spec, inFile, outFile, v)); ok = true; break; } catch (e) { if (e.timedOut) break; } }   // a run that timed out isn't tried again with another voice
      if (!ok) throw new Error("say failed");
      const buf = fs.readFileSync(outFile);
      keep(key, buf);
      return buf;
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
  async function render(spec) {
    // [[...]] are `say`'s own commands (silence, rate, voice): text from Slack or headlines never gets to use them.
    const text = String(spec && spec.text || "").replace(/\[\[|\]\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!text || !available()) throw new Error("no local voice");
    const key = crypto.createHash("sha1").update(JSON.stringify([text, spec.voice, spec.rate, spec.pitch])).digest("hex");
    if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return b; }
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => { await acquire(); try { return await renderNow(spec, text, key); } finally { release(); } })();
    inflight.set(key, p); p.then(() => inflight.delete(key), () => inflight.delete(key));
    return p;
  }
  return { render, stats: () => ({ running, waiting: waiters.length, cached: cache.size, cacheBytes }) };
}
const tts = createTts();
module.exports = { render: tts.render, createTts, MAX_BYTES, MAX_ENTRY, MAX_RUNNING, MAX_QUEUE };
