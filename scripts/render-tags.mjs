// Records PTRN 101.1's tags with real macOS voices and writes them to src/content/tags-baked.js (1.33).
// Why: in a browser the tags used to be spoken live by the system voice. On iPhone that voice silences the page's music
// for the length of every tag. Baked clips play inside the music (Web Audio), exactly like the apps' rendered tags.
// Where it fits: run on a Mac (it needs `say`, built into macOS), then `npm run build`.
// scripts/build.mjs inlines the file into dist/radio.html, and scripts/hub-snippet.mjs into the hub embed.
// What it records: the engine's tagScript() list, so the lines always match the station: every ID, drop and joke as
// written, plus two genre lines per PTRN genre. Lines with BPM, key, time signature or clock stay live-only.
// Usage: node scripts/render-tags.mjs            (all lines, voices rotating through the installed ones)
//        node scripts/render-tags.mjs --check    (lists the lines and which voices are installed, records nothing)
// Output: MP3 (mono, 22.05 kHz, 32 kbit/s, encoded with the vendored lamejs: every browser decodes MP3), base64 inside a
// plain script that sets window.MDFM_TAGS.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

// The engine runs in Node on the fake Web Audio context the tests use; only tagScript() is called (no sound).
const { FakeAudioContext, installGlobals } = await import("../test/_fakeaudio.mjs");
installGlobals();
const { createMDFM } = await import("../src/engine.js");
const radio = createMDFM({ audioContext: new FakeAudioContext() });
const { lines, voices } = radio.tagScript();

// lamejs (vendor/lamejs, LGPL-3.0) is a plain browser script; run it here so it defines globalThis.lamejs
vm.runInThisContext(readFileSync(new URL("../vendor/lamejs/lame.min.js", import.meta.url), "utf8"));
// wavPcm(buf): the 16-bit mono samples and sample rate of a WAVE file `say` wrote (walks the chunks to find "fmt " and "data")
function wavPcm(buf) {
  let o = 12, rate = 22050, pcm = null;
  while (o + 8 <= buf.length) { const id = buf.toString("ascii", o, o + 4), n = buf.readUInt32LE(o + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(o + 12);
    if (id === "data") { pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + o + 8, buf.byteOffset + o + 8 + n - (n % 2))); break; }
    o += 8 + n + (n % 2); }
  return { pcm, rate };
}
// mp3(pcm, rate): MP3 bytes at 32 kbit/s mono (plenty for a voice; about 6 KB a line)
function mp3(pcm, rate) {
  const enc = new lamejs.Mp3Encoder(1, rate, 32), parts = [];
  for (let i = 0; i < pcm.length; i += 1152 * 20) { const out = enc.encodeBuffer(pcm.subarray(i, i + 1152 * 20)); if (out.length) parts.push(Buffer.from(out)); }
  const tail = enc.flush(); if (tail.length) parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}
// installedVoices(): the voice names `say -v ?` lists (one per line: "Name   lang   # sample"); [] when `say` is missing
function installedVoices() {
  try { return execFileSync("say", ["-v", "?"], { encoding: "utf8" }).split("\n").map(l => l.split(/\s{2,}/)[0].trim()).filter(Boolean); }
  catch { return []; }
}
const have = installedVoices();
// The station's tag voices that this Mac actually has (premium ones like Ava or Evan may not be downloaded)
const use = voices.filter(v => have.includes(v));
if (process.argv.includes("--check")) {
  console.log(`${lines.length} lines; voices installed: ${use.join(", ") || "none"}; missing: ${voices.filter(v => !use.includes(v)).join(", ") || "none"}`);
  process.exit(0);
}
if (!have.length) { console.error("render-tags: `say` isn't available. Run this on a Mac."); process.exit(1); }
if (!use.length) { console.error(`render-tags: none of the tag voices are installed (${voices.join(", ")}). Add one in System Settings > Accessibility > Spoken Content.`); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), "mdfm-tags-"));
const clips = [];
try {
  lines.forEach((ln, i) => {
    const voice = use[i % use.length];   // rotate the voices so neighbouring lines sound different
    const wav = join(tmp, `${i}.wav`);
    execFileSync("say", ["-v", voice, "-o", wav, "--file-format=WAVE", "--data-format=LEI16@22050", ln.text]);   // 16-bit PCM, 22.05 kHz
    const { pcm, rate } = wavPcm(readFileSync(wav));
    if (!pcm || !pcm.length) throw new Error(`render-tags: no audio for "${ln.text}" (${voice})`);
    clips.push({ kind: ln.kind, text: ln.text, ...(ln.genre ? { genre: ln.genre } : {}), voice, b64: mp3(pcm, rate).toString("base64") });
    process.stdout.write(`\r${i + 1}/${lines.length}`);
  });
} finally { rmSync(tmp, { recursive: true, force: true }); }

const made = new Date().toISOString().slice(0, 10);
const kb = Math.round(clips.reduce((n, c) => n + c.b64.length, 0) / 1024);
// The generated file: a header saying what it is, then one assignment. Regenerate it; don't edit it by hand.
const out = `/* PTRN 101.1 baked tags: generated by scripts/render-tags.mjs on ${made} (${clips.length} clips, ${use.length} voices, ${kb} KB).
   Real macOS voices recorded ahead of time so browser tags play inside the music. Regenerate after changing TAG_TXT or
   PTRN_GENRES in src/engine.js. Fields: kind (id | drop | joke | song), text (also the caption), genre (song lines only),
   voice, b64 (MP3, base64). */
window.MDFM_TAGS = ${JSON.stringify({ v: 1, made, format: "mp3", clips })};
`;
writeFileSync(new URL("../src/content/tags-baked.js", import.meta.url), out);
console.log(`\nwrote src/content/tags-baked.js: ${clips.length} clips, ${kb} KB, voices ${use.join(", ")}`);
