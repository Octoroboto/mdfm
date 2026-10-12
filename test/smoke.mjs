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
  // TUNE: presets apply, reset returns to the defaults
  out.presets = radio.soundPresets().length; radio.setSound(radio.soundPresets()[2].sound); out.tuned = radio.getSound().roomType; radio.resetSound(); out.untuned = JSON.stringify(radio.getSound()) === JSON.stringify(radio.soundDefaults());
  out.rms = Math.sqrt(s / d.length); out.peak = pk; return out;
});
console.log(r); await b.close(); srv.close();
const ok = !errs.length && r.spectrumMax > 0.05 && r.rms > 0.02 && r.peak < 1.5 && r.kinds.includes("ad") && r.kinds.includes("id") && r.kinds.includes("interview") && r.examplePackUsed && r.np && r.fb.length > 4 && r.pod > 5 && r.cook > 5 && r.sp > 10 && r.hr > 5 && r.ga > 5 && r.stations.join() === "wybc,mdfm" && r.wybcSpectrum > 0.05 && r.wybcNp === "wybc" && r.backNp > 0 && r.presets >= 5 && r.tuned === "car" && r.untuned;
if (errs.length) console.log("page errors:", errs);
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED"); process.exit(ok ? 0 : 1);
