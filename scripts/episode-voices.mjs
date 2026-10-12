// Renders the voices of MDFM show episodes with macOS's own `say` (the same voices the MDFM Radio app uses),
// one WAV per line, plus a manifest of the running order. Claude mixes them with the station's music bed and
// sound effects into a finished episode. Mac only. Nothing leaves the Mac.
//   node scripts/episode-voices.mjs "the squeaky door" "moist loaf"
// Each argument matches an episode title, or failing that, words in its script.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import pack from "../src/content/default.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), OUT = join(ROOT, "exports");
const SAY = "/usr/bin/say";
if (process.platform !== "darwin" || !existsSync(SAY)) { console.error("This needs a Mac (it uses macOS's own voices)."); process.exit(1); }
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["the squeaky door", "moist loaf"];

// the station's accent table (same names as src/engine.js)
const ACCENTS = {
  american: ["Samantha","Alex","Aaron","Nicky","Allison","Ava","Tom"], british: ["Daniel","Arthur","Oliver","Serena","Kate","Martha"],
  australian: ["Karen","Lee","Catherine","Gordon"], irish: ["Moira"], scottish: ["Fiona"], indian: ["Rishi","Veena","Isha","Sangeeta"],
  southafrican: ["Tessa"], robot: ["Zarvox","Trinoids","Ralph","Fred","Albert"], whisper: ["Whisper"], gloomy: ["Bad News","Organ","Cellos"],
  cheery: ["Good News","Superstar","Jester"], bubbly: ["Bubbles","Boing","Wobble"], kid: ["Junior","Kathy"] };
const installed = execFileSync(SAY, ["-v", "?"], { encoding: "utf8" }).split("\n").map(l => l.replace(/\s+[a-z]{2}[_-][A-Z]{2}.*$/, "").trim()).filter(Boolean);
const has = n => installed.find(v => v === n || v.startsWith(n + " (")) || null;
const DJ = has("Fred") || has("Ralph") || has("Zarvox") || has("Alex") || has("Daniel");

const KINDS = [["homerepair", "Fixer Downer"], ["cooking", "Simmer Down"], ["garage", "Gasket Case"], ["podcasts", "The Apex Grind"]];
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function find(q) {
  const n = norm(q);
  for (const [k] of KINDS) for (const ep of pack[k] || []) if (norm(ep.title) === n || norm(ep.title).includes(n)) return { kind: k, ep };
  for (const [k] of KINDS) for (const ep of pack[k] || []) if (ep.lines.some(l => typeof l[1] === "string" && norm(l[1]).includes(n))) return { kind: k, ep };
  return null;
}
// the DJ's open and close, as on air (src/engine.js)
const OPEN = { homerepair: ep => [["dj", `M D F M Home and Garden presents ${ep.show}. Today: ${ep.title}.`]],
  garage: ep => [["dj", `Car trouble? Please don't call these guys. It's ${ep.show}. Today: ${ep.title}.`], ["pause", 400]],
  podcasts: ep => [["dj", `M D F M presents a podcast we did not ask for. ${ep.show}. ${ep.title}.`]],
  cooking: ep => [["dj", `And now, from M D F M Public Radio, ${ep.show}.`], ["pause", 600]] };
const CLOSE = { homerepair: "That was Fixer Downer. M D F M does not recommend anything Gary did.", garage: "That was Gasket Case. No cars were fixed during this broadcast.",
  podcasts: "That was a podcast. We're legally required to say it was a podcast.", cooking: "That was Simmer Down. Please don't call in about the recipes." };
const BED = { homerepair: "lounge", garage: "infomercial synth", podcasts: "lounge", cooking: "arts" };

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
  const voices = { dj: { voice: DJ, rate: .95, pitch: 1, name: "DJ" } }, used = new Set([DJ]);
  for (const [k, c] of Object.entries(ep.cast || {})) {
    let v = null; for (const n of [...(c.names || []), ...(ACCENTS[c.accent] || [])]) { const h = has(n); if (h && !used.has(h)) { v = h; break; } }
    if (!v) for (const n of [...(c.names || []), ...(ACCENTS[c.accent] || [])]) { const h = has(n); if (h) { v = h; break; } }
    if (v) used.add(v); voices[k] = { voice: v, rate: c.rate ?? 1, pitch: c.pitch ?? 1, name: c.name || k, phone: !!c.phone };
  }
  const lines = [...OPEN[kind](ep), ...ep.lines, ["dj", CLOSE[kind]]], order = []; let n = 0;
  for (const [who, text] of lines) {
    if (who === "pause") { order.push({ type: "pause", ms: +text || 1000 }); continue; }
    if (who === "sfx" || who === "organ") { order.push({ type: "sfx", name: text }); continue; }
    const t = typeof text === "object" ? text.say : text, v = voices[who] || voices.dj, f = String(++n).padStart(3, "0") + ".wav";
    render(t, v.voice, v.rate, v.pitch, join(dir, f));
    order.push({ type: "voice", file: f, who: v.name, voice: v.voice, phone: !!v.phone, text: typeof text === "object" ? text.show : text });
    process.stdout.write(".");
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ show: ep.show, title: ep.title, kind, bed: BED[kind], order }, null, 1));
  console.log(`\n${ep.show}: ${ep.title} -> exports/${slug} (${n} lines)`);
}
