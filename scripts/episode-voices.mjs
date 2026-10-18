// Renders the voices of MDFM show episodes with macOS's own `say` (the same voices the MDFM Radio app uses),
// one WAV per line, plus a manifest of the running order. Claude mixes them with the station's music bed and
// sound effects into a finished episode. Mac only. Nothing leaves the Mac.
//   node scripts/episode-voices.mjs "the squeaky door" "moist loaf"
// Each argument matches an episode title, or failing that, words in its script.
// Output: exports/<show-title-slug>/001.wav, 002.wav... (16-bit 22.05 kHz mono, one per spoken line) and manifest.json
// { show, title, kind, bed (the music style for the bed), order: [{ type: "voice", file, who, voice, phone, text } |
// { type: "pause", ms } | { type: "sfx", name }] }. It reads the scripted MDFM 99.9 shows from src/content/default.js;
// the engine itself (src/engine.js) speaks them live with speechSynthesis instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import pack from "../src/content/default.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), OUT = join(ROOT, "exports");   // ROOT: the repo; OUT: where the renders go (exports/, outside dist/)
const SAY = "/usr/bin/say";
if (process.platform !== "darwin" || !existsSync(SAY)) { console.error("This needs a Mac (it uses macOS's own voices)."); process.exit(1); }
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["the squeaky door", "moist loaf"];   // no arguments: two sample episodes

// the station's accent table (same names as src/engine.js)
const ACCENTS = {
  american: ["Samantha","Alex","Aaron","Nicky","Allison","Ava","Tom"], british: ["Daniel","Arthur","Oliver","Serena","Kate","Martha"],
  australian: ["Karen","Lee","Catherine","Gordon"], irish: ["Moira"], scottish: ["Fiona"], indian: ["Rishi","Veena","Isha","Sangeeta"],
  southafrican: ["Tessa"], robot: ["Zarvox","Trinoids","Ralph","Fred","Albert"], whisper: ["Whisper"], gloomy: ["Bad News","Organ","Cellos"],
  cheery: ["Good News","Superstar","Jester"], bubbly: ["Bubbles","Boing","Wobble"], kid: ["Junior","Kathy"] };
const installed = execFileSync(SAY, ["-v", "?"], { encoding: "utf8" }).split("\n").map(l => l.replace(/\s+[a-z]{2}[_-][A-Z]{2}.*$/, "").trim()).filter(Boolean);   // the installed voices' names, from `say -v ?` (each line ends with a locale like en_US and a sample sentence)
const has = n => installed.find(v => v === n || v.startsWith(n + " (")) || null;   // has(n): the installed voice called n (or "n (Enhanced)" etc.), else null
const DJ = has("Fred") || has("Ralph") || has("Zarvox") || has("Alex") || has("Daniel");   // the DJ: the robot voices first, like the station, then ordinary fallbacks

// KINDS: [content pack key, show name] for the four scripted shows this renders.
const KINDS = [["homerepair", "Fixer Downer"], ["cooking", "Simmer Down"], ["garage", "Gasket Case"], ["podcasts", "The Apex Grind"]];
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();   // lower case, punctuation as spaces, single spaces: for matching titles and script text
// find(q): the first episode whose title contains q, else the first whose lines contain q. Returns { kind, ep } or null.
function find(q) {
  const n = norm(q);
  for (const [k] of KINDS) for (const ep of pack[k] || []) if (norm(ep.title) === n || norm(ep.title).includes(n)) return { kind: k, ep };
  for (const [k] of KINDS) for (const ep of pack[k] || []) if (ep.lines.some(l => typeof l[1] === "string" && norm(l[1]).includes(n))) return { kind: k, ep };
  return null;
}
// the DJ's open and close, as on air (src/engine.js)
// OPEN / CLOSE: the DJ's lines around each show, per kind (keep in step with src/engine.js). BED: the bed style per kind.
const OPEN = { homerepair: ep => [["dj", `M D F M Home and Garden presents ${ep.show}. Today: ${ep.title}.`]],
  garage: ep => [["dj", `Car trouble? Please don't call these guys. It's ${ep.show}. Today: ${ep.title}.`], ["pause", 400]],
  podcasts: ep => [["dj", `M D F M presents a podcast we did not ask for. ${ep.show}. ${ep.title}.`]],
  cooking: ep => [["dj", `And now, from M D F M Public Radio, ${ep.show}.`], ["pause", 600]] };
const CLOSE = { homerepair: "That was Fixer Downer. M D F M does not recommend anything Gary did.", garage: "That was Gasket Case. No cars were fixed during this broadcast.",
  podcasts: "That was a podcast. We're legally required to say it was a podcast.", cooking: "That was Simmer Down. Please don't call in about the recipes." };
const BED = { homerepair: "lounge", garage: "infomercial synth", podcasts: "lounge", cooking: "arts" };

// render(text, voice, rate, pitch, file): one line to a WAV with `say`. pitch (1 = natural) becomes a [[pbas]] shift in
// semitones (clamped to +-24); rate (1 = natural) becomes words per minute around 175 (clamped 90..360). The text goes
// through a temp file so quotes and line breaks are safe. If the chosen voice fails, it retries with the system default.
function render(text, voice, rate, pitch, file) {
  const st = Math.max(-24, Math.min(24, Math.round(12 * Math.log2(Math.max(.1, pitch || 1)))));
  const dir = join(tmpdir(), "mdfm-ep-" + process.pid); mkdirSync(dir, { recursive: true }); const tf = join(dir, "line.txt");
  writeFileSync(tf, (st ? `[[pbas ${st > 0 ? "+" : ""}${st}]] ` : "") + text);
  const a = ["-f", tf, "-o", file, "--file-format=WAVE", "--data-format=LEI16@22050", "-r", String(Math.max(90, Math.min(360, Math.round(175 * (rate || 1)))))];
  try { execFileSync(SAY, voice ? [...a, "-v", voice] : a); } catch { execFileSync(SAY, a); }
  rmSync(dir, { recursive: true, force: true });
}

for (const q of wanted) {
  const hit = find(q); if (!hit) { console.error(`No episode matches "${q}".`); continue; }
  const { kind, ep } = hit, slug = norm(`${ep.show.split(",")[0]} ${ep.title}`).replace(/ /g, "-"), dir = join(OUT, slug);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  // Cast each speaker: the cast's preferred names, then its accent's voices, preferring one no one else in this episode
  // has; if all are taken, the first installed one. Speakers without a cast entry fall back to the DJ voice.
  const voices = { dj: { voice: DJ, rate: .95, pitch: 1, name: "DJ" } }, used = new Set([DJ]);
  for (const [k, c] of Object.entries(ep.cast || {})) {
    let v = null; for (const n of [...(c.names || []), ...(ACCENTS[c.accent] || [])]) { const h = has(n); if (h && !used.has(h)) { v = h; break; } }
    if (!v) for (const n of [...(c.names || []), ...(ACCENTS[c.accent] || [])]) { const h = has(n); if (h) { v = h; break; } }
    if (v) used.add(v); voices[k] = { voice: v, rate: c.rate ?? 1, pitch: c.pitch ?? 1, name: c.name || k, phone: !!c.phone };
  }
  const lines = [...OPEN[kind](ep), ...ep.lines, ["dj", CLOSE[kind]]], order = []; let n = 0;
  for (const [who, text] of lines) {
    if (who === "pause") { order.push({ type: "pause", ms: +text || 1000 }); continue; }
    if (who === "sfx" || who === "organ") { order.push({ type: "sfx", name: text }); continue; }   // "organ" lines are music cues, logged like sound effects
    const t = typeof text === "object" ? text.say : text, v = voices[who] || voices.dj, f = String(++n).padStart(3, "0") + ".wav";   // a { say, show } line speaks `say` and shows `show` in the manifest (pronunciation vs spelling)
    render(t, v.voice, v.rate, v.pitch, join(dir, f));
    order.push({ type: "voice", file: f, who: v.name, voice: v.voice, phone: !!v.phone, text: typeof text === "object" ? text.show : text });
    process.stdout.write(".");
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ show: ep.show, title: ep.title, kind, bed: BED[kind], order }, null, 1));
  console.log(`\n${ep.show}: ${ep.title} -> exports/${slug} (${n} lines)`);
}
