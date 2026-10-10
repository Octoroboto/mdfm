// Renders MDFM's robot voices to audio with macOS's own `say`, so they play through the radio's volume, LOW/MID/HIGH EQ,
// VU meters and visualizer like everything else. Local only: no network. Falls back (in the page) to system speech if this fails.
const { execFile } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const SAY = "/usr/bin/say";
const cache = new Map();   // recent lines (station IDs repeat), newest last
const run = args => new Promise((res, rej) => execFile(SAY, args, { timeout: 20000 }, (e, out, err) => e ? rej(new Error(String(err || e.message).slice(0, 200))) : res()));

function args(spec, inFile, outFile, voice) {
  const a = ["-f", inFile, "-o", outFile, "--file-format=WAVE", "--data-format=LEI16@22050"];
  if (voice) a.push("-v", voice);
  const rate = Math.max(90, Math.min(360, Math.round(175 * (+spec.rate || 1)))); a.push("-r", String(rate));
  return a;
}
async function render(spec) {
  const text = String(spec && spec.text || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!text || process.platform !== "darwin" || !fs.existsSync(SAY)) throw new Error("no local voice");
  const key = crypto.createHash("sha1").update(JSON.stringify([text, spec.voice, spec.rate, spec.pitch])).digest("hex");
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return b; }
  // Pitch: speech-synthesis pitch (0..2, 1 = normal) becomes a relative pitch shift for the voices that support it.
  const st = Math.max(-24, Math.min(24, Math.round(12 * Math.log2(Math.max(.1, +spec.pitch || 1)))));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-tts-")), inFile = path.join(dir, "line.txt"), outFile = path.join(dir, "line.wav");
  try {
    fs.writeFileSync(inFile, (st ? `[[pbas ${st > 0 ? "+" : ""}${st}]] ` : "") + text);   // text goes in a file, never on the command line
    const name = spec.voice ? String(spec.voice).slice(0, 80) : null, short = name ? name.replace(/\s*\(.*$/, "") : null;
    let ok = false;
    for (const v of [...new Set([name, short, null])]) { try { await run(args(spec, inFile, outFile, v)); ok = true; break; } catch {} }
    if (!ok) throw new Error("say failed");
    const buf = fs.readFileSync(outFile);
    cache.set(key, buf); while (cache.size > 80) cache.delete(cache.keys().next().value);
    return buf;
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}
module.exports = { render };
