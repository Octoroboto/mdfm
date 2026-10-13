// Browser smoke test (needs Playwright: npx playwright install chromium). Builds, then checks the engine runs,
// the spectrum moves, spots generate, packs merge, and an offline render produces sound without clipping.
import { createServer } from "node:http"; import { readFile } from "node:fs/promises"; import { join } from "node:path";
let chromium; try { ({ chromium } = await import("playwright")); } catch { console.log("Playwright not installed: skipping browser smoke test."); process.exit(0); }
const root = new URL("../", import.meta.url).pathname;
const srv = createServer(async (q, r) => { let body; try { body = await readFile(join(root, q.url)); } catch { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": q.url.endsWith(".html") ? "text/html" : q.url.endsWith(".css") ? "text/css" : "text/javascript" }); r.end(body); }).listen(0);
const port = srv.address().port, b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), p = await b.newPage(), errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto(`http://localhost:${port}/demo/index.html`); await p.waitForTimeout(500);
const r = await p.evaluate(async () => {
  const out = { version: radio.version };
  const spots = []; for (let i = 0; i < 300; i++) spots.push(radio.nextSpotText());
  out.kinds = [...new Set(spots.map(s => s.kind))]; out.examplePackUsed = spots.some(s => /Analyze|whole other app|Collin's/.test(s.text));
  radio.start(); await new Promise(r => setTimeout(r, 4000));
  const sp = radio.getSpectrum(); out.spectrumMax = sp ? Math.max(...sp) : 0; out.np = radio.nowPlaying();
  radio.stop();
  const buf = await radio.renderOffline("song", 6); const d = buf.getChannelData(0); let s = 0, pk = 0; for (const x of d) { s += x * x; pk = Math.max(pk, Math.abs(x)); }
  out.fb = radio.sampleLines("funnelball"); out.pod = (radio.sampleLines("podcast")||[]).length; out.cook = (radio.sampleLines("cooking")||[]).length;
  out.sp = (radio.sampleLines("showponies")||[]).length; out.hr = (radio.sampleLines("homerepair")||[]).length; out.ga = (radio.sampleLines("garage")||[]).length;
  out.tech = await radio.sampleLines("technews");
  // WYBC 88.1 (Collin's ambient piano): available, plays through the same output, and switches back
  out.stations = radio.stations().map(x => x.id + (x.available ? "" : " (missing)"));
  radio.setStation("wybc"); radio.start(); await new Promise(r => setTimeout(r, 5000));
  const ws = radio.getSpectrum(); out.wybcSpectrum = ws ? Math.max(...ws) : 0; out.wybcNp = radio.nowPlaying() && radio.nowPlaying().station;
  radio.setStation("mdfm"); await new Promise(r => setTimeout(r, 1500)); out.backNp = radio.nowPlaying() && radio.nowPlaying().bpm; radio.stop();
  // PTLK 108.0 (procedural talk): a stand-in voice (a buzz as long as the line) so it plays without the system's speech
  const fakeTts = async ({ text }) => { const sr = 22050, n = Math.max(2000, Math.min(sr * 3, text.length * 300)), b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(6000 * Math.sin(i / sr * 2 * Math.PI * 140) * (0.6 + 0.4 * Math.sin(i / sr * 2 * Math.PI * 4))), true); return b; };
  radio.setProviders({ tts: fakeTts, headlines: async kind => kind === "gaming" ? [{ title: "A studio announces a sequel to a game about farming", source: "Smoke Test Wire" }, { title: "Handheld console sales rise during the holidays", source: "Smoke Test Wire" }, { title: "Esports league adds three new teams this season", source: "Smoke Test Wire" }] : null });
  const caps = [], pspots = []; radio.on("caption", c => caps.push(c)); radio.on("spot", x => pspots.push(x));
  radio.setStationTypes("ptlk", { doug: false, biz: false, usb: false, nature: false, lost: false, hoa: false, ship: false, wizard: false, buttons: true, ids: true });
  radio.setStation("ptlk"); radio.start(); let pmax = 0; for (let i = 0; i < 50 && (i < 12 || !caps.some(c => c.who === "Sal")); i++) { await new Promise(r => setTimeout(r, 500)); const q = radio.getSpectrum(); if (q) pmax = Math.max(pmax, ...q); }
  out.ptlkSpectrum = pmax; out.ptlkNp = radio.nowPlaying(); out.ptlkLive = pspots.some(x => x.kind === "ptlk" && x.live); out.ptlkWho = [...new Set(caps.map(c => c.who))]; out.ptlkAir = radio.onAir();
  radio.skip(); await new Promise(r => setTimeout(r, 1500)); out.ptlkSkip = radio.nowPlaying() && radio.nowPlaying().station;
  radio.setStation("mdfm"); await new Promise(r => setTimeout(r, 1500)); out.backNp2 = radio.nowPlaying() && radio.nowPlaying().bpm; radio.stop();
  // PTLK show music: every style's theme renders with sound and no clipping; the phone line isn't louder than a dry voice
  out.ptMusic = []; for (const style of ["news", "doug", "ticker", "pomp", "lost", "westcoast", "tech", "nature", "noir", "fantasy"]) { const m = await radio.renderOffline("ptmusic", 9, { style, cue: "theme" }), d = m.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.ptMusic.push([style, +Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); }
  const lvl = b => { const d = b.getChannelData(0); let q = 0; for (const x of d) q += x * x; return Math.sqrt(q / d.length); };
  out.phoneVsDry = +(20 * Math.log10(lvl(await radio.renderOffline("voicetest", 3, { phone: true })) / lvl(await radio.renderOffline("voicetest", 3, { phone: false })))).toFixed(1);
  // TUNE: presets apply, reset returns to the defaults
  out.presets = radio.soundPresets().length; radio.setSound(radio.soundPresets()[2].sound); out.tuned = radio.getSound().roomType; radio.resetSound(); out.untuned = JSON.stringify(radio.getSound()) === JSON.stringify(radio.soundDefaults());
  out.rms = Math.sqrt(s / d.length); out.peak = pk; return out;
});
console.log(r); await b.close(); srv.close();
const ok = !errs.length && r.spectrumMax > 0.05 && r.rms > 0.02 && r.peak < 1.5 && r.kinds.includes("ad") && r.kinds.includes("id") && r.kinds.includes("interview") && r.examplePackUsed && r.np && r.fb.length > 4 && r.pod > 5 && r.cook > 5 && r.sp > 10 && r.hr > 5 && r.ga > 5 && r.stations.join() === "wybc,mdfm,ptlk" && r.wybcSpectrum > 0.05 && r.wybcNp === "wybc" && r.backNp > 0
  && r.ptlkSpectrum > 0.05 && r.ptlkNp && r.ptlkNp.station === "ptlk" && r.ptlkNp.style === "Button Mashers" && r.ptlkLive && r.ptlkWho.includes("Sal") && r.ptlkAir && r.ptlkAir.saveable && r.ptlkSkip === "ptlk" && r.backNp2 > 0
  && r.ptMusic.length === 10 && r.ptMusic.every(([, rms, pk]) => rms > 0.02 && pk < 1.2) && r.phoneVsDry < 0 && r.presets >= 5 && r.tuned === "car" && r.untuned;
if (errs.length) console.log("page errors:", errs);
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED"); process.exit(ok ? 0 : 1);
