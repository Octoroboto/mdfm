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
  // HEARYE 95.5 (Renn Faire Radio): the crier, then a piece with an artist; only the joust left on, skipping the piece brings the joust
  radio.setStationTypes("hearye", { doug: false, cauldron: false, grog: false, pest: false, dqi: false, onestar: false, hoard: false, ponies: false, news: false, ads: false, callers: false, joust: true, ids: true, amb: true });
  const hcaps = [], hspots = []; radio.on("caption", c => hcaps.push(c)); radio.on("spot", x => hspots.push(x));
  radio.setStation("hearye"); radio.start(); let hmax = 0; for (let i = 0; i < 40 && !(radio.nowPlaying() && radio.nowPlaying().station === "hearye" && radio.nowPlaying().artist && hcaps.some(c => /Bard/.test(c.who))); i++) { await new Promise(r => setTimeout(r, 500)); }
  for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 500)); const q = radio.getSpectrum(); if (q) hmax = Math.max(hmax, ...q); }
  out.hearyeSpectrum = hmax; out.hearyeNp = radio.nowPlaying(); out.hearyeWho = [...new Set(hcaps.map(c => c.who))];
  radio.skip(); for (let i = 0; i < 60 && !hspots.some(x => x.kind === "hearye" && x.show === "The Royal Joust"); i++) await new Promise(r => setTimeout(r, 500));
  out.hearyeJoust = hspots.some(x => x.kind === "hearye" && x.show === "The Royal Joust"); out.hearyeAir = radio.onAir();
  radio.setStation("mdfm"); await new Promise(r => setTimeout(r, 1500)); out.backNp3 = radio.nowPlaying() && radio.nowPlaying().bpm; radio.stop();
  out.hearyeSave = await (async () => { const b2 = await radio.renderOffline("fpiece", 6, { style: "battle", seed: 3, target: 60 }); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]; })();
  // Style matrix (MIX, 1.25 E3): ten directions, per station; a full mix renders with sound and no clipping, and zero puts it back.
  // Old saved values move over (classical -> orchestral, galactic -> space, chaos -> the GLITCH effect)
  out.mixKeys = radio.styleMixKeys().length; radio.setStation("mdfm");
  radio.setStyleMix({ classical: .5, galactic: .25, chaos: .4 }, "ptlk"); out.mixMig = [radio.getStyleMix("ptlk").orchestral, radio.getStyleMix("ptlk").space, radio.getFx().glitch, "chaos" in radio.getStyleMix("ptlk")]; radio.resetStyleMix("ptlk"); radio.resetFx();
  radio.setStyleMix(Object.fromEntries(radio.styleMixKeys().map(([k]) => [k, 1])));
  out.mixOther = radio.getStyleMix("hearye").rock; out.mixRender = await (async () => { const b2 = await radio.renderOffline("song", 6); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]; })();
  // Save on WYBC goes through the whole chain, with the style matrix's pull and rhythm section when it's up
  out.wybcSave = []; for (const m of [null, { pop: 1, jazz: .5 }]) { radio.resetStyleMix("wybc"); if (m) radio.setStyleMix(m, "wybc"); const b2 = await radio.renderOffline("wybc", 12); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.wybcSave.push([+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); } radio.resetStyleMix("wybc");
  // Groove & key (TUNE): per station; a song with every control moved renders with sound and no clipping, and reset puts it back
  out.grvKeys = radio.grooveKeys().length; out.grvModes = radio.keyModes().length; radio.setGroove({ bpm: 120, meter: "5/4", swing: .8, length: .7, root: 9, mode: "doubleharm", density: .9, fills: 1, feel: 1, humanize: .6, drums: .7 }, "mdfm");
  out.grvOther = radio.getGroove("hearye").bpm; out.grvRender = await (async () => { const b2 = await radio.renderOffline("song", 8); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]; })();
  radio.resetGroove("mdfm"); out.grvZero = JSON.stringify(radio.getGroove("mdfm")) === JSON.stringify(radio.grooveDefaults());
  radio.resetStyleMix(); out.mixZero = Object.values(radio.getStyleMix()).every(v => v === 0);
  // 1.25 (E3): the drum controls, GLITCH, the parametric EQ and ORIGINAL (bypass) render; the EQ's curve; the pad helper
  radio.setGroove({ push: .2, pushS: .9, ghosts: .7, accent: .8, hatswing: .6, hatdens: .8, kick: .7, snare: .4, hats: .6, gv: 3 }, "mdfm"); radio.setFx({ glitch: 1 });
  radio.setEq({ lc: { on: true, freq: 50, slope: 24 }, ls: { gain: 3 }, p2: { gain: 4, freq: 2500, q: 1.5 }, hc: { on: true, freq: 16000 } }); radio.setStyleMix({ jazz: .7, latin: .3 });
  out.e3Render = await (async () => { const b2 = await radio.renderOffline("song", 10); const d = b2.getChannelData(0); let q = 0, p = 0, n = 0; for (const x of d) { if (!Number.isFinite(x)) n++; q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2), n]; })();
  out.eqCurve = Array.from(radio.eqResponse([30, 2500, 10000])).map(x => +x.toFixed(1)); radio.setMixBypass(true); out.bypass = [radio.isMixBypass(), radio._tuneState().matrix.mdfm, radio._tuneState().groove.mdfm]; radio.setMixBypass(false);
  radio.resetGroove("mdfm"); radio.resetFx(); radio.resetEq(); radio.resetStyleMix(); out.e3Zero = radio.eqResponse([100, 1000, 10000]).every(x => x === 0) && !radio._tuneState().groove.mdfm && !radio._tuneState().matrix.mdfm && radio.getFx().glitch === 0;
  out.pad = radio.padToMix(0, -1).w.rock === 1 && radio.padToMix(0, 0).amount === 0;
  // PTLK show music: every style's theme renders with sound and no clipping; the phone line isn't louder than a dry voice
  out.ptMusic = []; for (const style of ["news", "doug", "ticker", "pomp", "lost", "westcoast", "tech", "nature", "noir", "fantasy"]) { const m = await radio.renderOffline("ptmusic", 9, { style, cue: "theme" }), d = m.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.ptMusic.push([style, +Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); }
  const lvl = b => { const d = b.getChannelData(0); let q = 0; for (const x of d) q += x * x; return Math.sqrt(q / d.length); };
  out.phoneVsDry = +(20 * Math.log10(lvl(await radio.renderOffline("voicetest", 3, { phone: true })) / lvl(await radio.renderOffline("voicetest", 3, { phone: false })))).toFixed(1);
  // PTRN 101.1 (1.22): genres only, one switched on; plays, a skip mixes into the next track, a tag lands, back to MDFM; every genre renders
  radio.setStationTypes("ptrn", Object.fromEntries(radio.stationTypeList("ptrn").map(([k]) => [k, k === "funk" || k === "tags"]))); radio.setStation("ptrn"); radio.start();
  const pnp = []; const offP = radio.on("nowplaying", n => pnp.push(n)); let rmax = 0; for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 100)); const s2 = radio.getSpectrum(); if (s2) rmax = Math.max(rmax, ...s2); }
  out.ptrnSpectrum = rmax; out.ptrnNp = radio.nowPlaying(); radio.skip(); for (let i = 0; i < 80 && pnp.length < 2; i++) await new Promise(r => setTimeout(r, 100)); out.ptrnSkip = pnp.length >= 1 && pnp[pnp.length - 1].style === "Funk";
  radio.spotNow(); await new Promise(r => setTimeout(r, 2500)); out.ptrnGenres = radio.stationTypeList("ptrn").length; offP();
  radio.setStation("mdfm"); await new Promise(r => setTimeout(r, 1500)); out.backNp4 = radio.nowPlaying() && radio.nowPlaying().bpm; radio.stop();
  out.ptrnRenders = []; for (const style of ["HOUSE", "SWING JAZZ", "SALSA", "METAL", "AMBIENT", "CHIPTUNE"]) { const m = await radio.renderOffline("ptrn", 6, { style }), d = m.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.ptrnRenders.push([style, +Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); }
  // CLUK 92.3 (1.24): plays a song with an artist, a skip brings a break (a show, the request line or ads), an ID, back to MDFM; every genre renders; show music renders
  radio.setStation("cluk"); radio.start(); const cnp = [], cspots = [], ccaps = []; const offC = radio.on("nowplaying", n => cnp.push(n)), offCs = radio.on("spot", x => cspots.push(x)), offCc = radio.on("caption", c => ccaps.push(c));
  let cmax = 0; for (let i = 0; i < 60 && !(cnp.some(n => n.station === "cluk" && !n.talk && n.artist && n.bpm)); i++) { await new Promise(r => setTimeout(r, 250)); const s2 = radio.getSpectrum(); if (s2) cmax = Math.max(cmax, ...s2); }
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 100)); const s2 = radio.getSpectrum(); if (s2) cmax = Math.max(cmax, ...s2); }
  out.clukSpectrum = cmax; out.clukSong = cnp.find(n => n.station === "cluk" && !n.talk) || null; radio.skip();
  for (let i = 0; i < 80 && !cspots.some(x => x.kind === "cluk"); i++) await new Promise(r => setTimeout(r, 250)); out.clukBreak = (cspots.find(x => x.kind === "cluk") || {}).show || null; out.clukAir = radio.onAir();
  radio.spotNow(); await new Promise(r => setTimeout(r, 1500)); out.clukId = cspots.some(x => x.kind === "id" && x.station === "cluk"); out.clukWho = [...new Set(ccaps.map(c => c.who))]; offC(); offCs(); offCc();
  radio.setStation("mdfm"); await new Promise(r => setTimeout(r, 1500)); out.backNp5 = radio.nowPlaying() && radio.nowPlaying().bpm; radio.stop();
  out.clukRenders = []; for (const style of ["BIG BEAT", "BREAKBEAT", "FUNKY BREAKS", "ACID BREAKS", "RAVE BREAKS", "ELECTRO", "ELECTRO HOUSE", "HARD HOUSE"]) { const m = await radio.renderOffline("cluk", 6, { style, from: 16 }), d = m.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.clukRenders.push([style, +Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); }
  out.clukCues = []; for (const cue of ["theme", "sting", "outro", "bed"]) { const m = await radio.renderOffline("ccue", 6, { style: "bigbeat", cue }), d = m.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } out.clukCues.push([cue, +Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]); }
  out.clukTypes = radio.stationTypeList("cluk").length;
  // TUNE effects (1.22): all on renders with sound and no clipping; off is back to the defaults
  out.fxKeys = radio.fxKeys().length; radio.setFx({ echo: .6, reverb: .5, chorus: .5, flange: .4, phaser: .4, warble: .3, crush: .3, drive: .4, filter: .3, gate: .4, pump: .5 });
  out.fxRender = await (async () => { const b2 = await radio.renderOffline("song", 6); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]; })();
  radio.resetFx(); out.fxZero = JSON.stringify(radio.getFx()) === JSON.stringify(radio.fxDefaults());
  // Instruments (1.23): the pool lists every kit, bass, keys, lead and pad; classic-only still renders; back to everything
  const IL = radio.instrumentList(); out.instN = IL.length; out.instClassic = IL.filter(x => x[3] === "classic").length; radio.setInstruments(Object.fromEntries(IL.map(([k, , , s]) => [k, s === "classic"])));
  out.instRender = await (async () => { const b2 = await radio.renderOffline("ptrn", 6, { style: "HOUSE" }); const d = b2.getChannelData(0); let q = 0, p = 0; for (const x of d) { q += x * x; p = Math.max(p, Math.abs(x)); } return [+Math.sqrt(q / d.length).toFixed(3), +p.toFixed(2)]; })();
  radio.setInstruments(Object.fromEntries(IL.map(([k]) => [k, true]))); out.instAll = Object.values(radio.getInstruments()).every(Boolean);
  // TUNE: presets apply, reset returns to the defaults
  out.presets = radio.soundPresets().length; radio.setSound(radio.soundPresets()[2].sound); out.tuned = radio.getSound().roomType; radio.resetSound(); out.untuned = JSON.stringify(radio.getSound()) === JSON.stringify(radio.soundDefaults());
  out.rms = Math.sqrt(s / d.length); out.peak = pk; return out;
});
// 1.25: settings stored as something other than an object (a stray "null", a number) never stop the radio page from wiring up
const p2 = await b.newPage(), errs2 = []; p2.on("pageerror", e => errs2.push(e.message));
await p2.addInitScript(() => { try { for (const k of ["wybcTypes", "hearyeTypes", "ptrnTypes", "clukTypes", "ptlkTypes", "mdfmInstruments", "mdfmSound"]) localStorage.setItem(k, "null"); localStorage.setItem("mdfmStyleMix", "5"); localStorage.setItem("mdfmGroove", "\"x\""); localStorage.setItem("mdfmFx", "7"); } catch (e) {} });
await p2.goto(`http://localhost:${port}/dist/radio.html`); await p2.waitForTimeout(1200);
r.wired = await p2.evaluate(() => { const s = document.querySelector("#stLive"), t = document.querySelector("#tunePop"); return !!(window.__radio && s && s.textContent.length > 10 && t && t.children.length); });
r.wireErrs = errs2;
// 1.25 MIX: the drawer opens inline (not a pop-out), one control per section moves the engine, RESET ALL (two taps) puts it back, Esc closes
const p3 = await b.newPage({ viewport: { width: 1440, height: 900 } }), errs3 = []; p3.on("pageerror", e => errs3.push(e.message));
await p3.goto(`http://localhost:${port}/dist/radio.html`); await p3.waitForTimeout(800);
await p3.click("#tuneOn", { force: true }); await p3.waitForTimeout(400);
const key = async (sel, k = "ArrowUp", n = 5) => { await p3.focus(sel); for (let i = 0; i < n; i++) await p3.keyboard.press(k); };
r.mix = await p3.evaluate(() => { const d = document.querySelector("#tunePop"); return { open: !d.hidden && d.getBoundingClientRect().height > 300, pop: d.classList.contains("pop"), pos: getComputedStyle(d).position, label: document.querySelector("label.tunesw").textContent.trim(), secs: d.querySelectorAll(".mx-sec").length, uw: !!d.querySelector("#uwBtn"), mountMix: typeof MDFM.mountMix === "function" && MDFM.mountMix === MDFM.mountTune }; });
// 1.25 UI-2: the PAD (keyboard on the puck), the EQ curve and band strip, the drum controls, ORIGINAL
r.ui2 = await p3.evaluate(() => { const d = document.querySelector("#tunePop"), c = d.querySelector(".mx-eqg canvas"); return { pad: !!d.querySelector(".mx-padbox [data-puck]"), view: d.querySelector(".mx-stylecard").dataset.view, nodes: d.querySelectorAll(".mx-eqn").length, canvas: c.width > 0 && c.height > 0, chaos: !!d.querySelector('[data-key="chaos"]'), glitch: !!d.querySelector('[data-card=tricks] [data-key="fx-glitch"]'), drums: ["push", "ghosts", "accent", "hatswing", "hatdens", "kick", "snare", "hats", "humanize"].every(k => d.querySelector(`.mx-k[data-key="g-${k}"]`) && d.querySelector(`.mx-song[data-song="${k}"]`)), orig: !!d.querySelector(".mx-orig[aria-pressed]") }; });
await key("[data-puck]", "ArrowRight", 8); r.ui2.padMix = await p3.evaluate(() => Object.values(window.__radio.getStyleMix()).filter(v => v > 0).length);
await key('.mx-eqn[data-band="p2"]', "ArrowUp", 6); await key('.mx-k[data-key="eq-q"] .rd-knob', "ArrowUp", 50);
r.ui2.eq = await p3.evaluate(() => { const e = window.__radio.getEq(), s = JSON.parse(localStorage.getItem("mdfmEq") || "null"); return [e.p2.gain, e.p2.q > 1, !!s && s.p2.gain === e.p2.gain]; });
await key('.mx-k[data-key="g-ghosts"] .rd-knob'); r.ui2.ghosts = await p3.evaluate(() => window.__radio.getGroove().ghosts);
await p3.focus(".mx-orig"); await p3.keyboard.press("Enter"); r.ui2.origOn = await p3.evaluate(() => window.__radio.isMixBypass() && document.querySelector(".mx-orig").getAttribute("aria-pressed") === "true");
await p3.keyboard.press("Enter"); r.ui2.origOff = await p3.evaluate(() => !window.__radio.isMixBypass());
await p3.evaluate(() => window.__radio.setFx({ glitch: .3 })); await p3.waitForTimeout(100); r.ui2.repaint = await p3.evaluate(() => document.querySelector('.mx-k[data-key="fx-glitch"] .mx-v').textContent);
await p3.evaluate(() => window.__radio.setFx({ glitch: 0 }));
await p3.click('[data-hook="style-view"] [data-v="faders"]');
await key('.mx-k[data-key="realism"] .rd-knob'); await key('.mx-k[data-key="tone-low"] .rd-knob'); await key('.mx-f[data-key="pop"] input', "ArrowUp", 30);
await key('.mx-k[data-key="g-humanize"] .rd-knob'); await key('.mx-k[data-key="fx-echo"] .rd-knob');
r.mixMoved = await p3.evaluate(() => { const R = window.__radio; return { realism: R.getSound().realism, low: R.getTone().low, pop: R.getStyleMix().pop, hum: R.getGroove().humanize, echo: R.getFx().echo, led: document.querySelector("label.tunesw").classList.contains("tuned") }; });
await p3.click('[data-t="reset"]'); await p3.click('[data-t="reset"]'); await p3.waitForTimeout(100);
r.mixReset = await p3.evaluate(() => { const R = window.__radio, e = R.getEq(); return e.p2.gain === 0 && R.getGroove().ghosts === 0 && R.getSound().realism === 0 && R.getTone().low === 0 && !Object.values(R.getStyleMix()).some(v => v > 0) && R.getGroove().humanize === 0 && R.getFx().echo === 0 && !document.querySelector("label.tunesw").classList.contains("tuned"); });
await p3.focus('.mx-k[data-key="realism"] .rd-knob'); await p3.keyboard.press("Escape");
await p3.waitForFunction(() => document.querySelector("#tunePop").hidden, null, { timeout: 2500 }).catch(() => {});   // 1.26: wait for the close (a fixed 400 ms was flaky on slower machines)
r.mixClosed = await p3.evaluate(() => document.querySelector("#tunePop").hidden && document.activeElement === document.querySelector("#tuneOn"));
r.mixErrs = errs3;
console.log(r); await b.close(); srv.close();
const ok = !errs.length && r.spectrumMax > 0.05 && r.rms > 0.02 && r.peak < 1.5 && r.kinds.includes("ad") && r.kinds.includes("id") && r.kinds.includes("interview") && r.examplePackUsed && r.np && r.fb.length > 4 && r.pod > 5 && r.cook > 5 && r.sp > 10 && r.hr > 5 && r.ga > 5 && r.stations.join() === "wybc,cluk,hearye,mdfm,ptrn,ptlk" && r.wybcSpectrum > 0.05 && r.wybcNp === "wybc" && r.backNp > 0
  && r.ptlkSpectrum > 0.05 && r.ptlkNp && r.ptlkNp.station === "ptlk" && r.ptlkNp.style === "Button Mashers" && r.ptlkLive && r.ptlkWho.includes("Sal") && r.ptlkAir && r.ptlkAir.saveable && r.ptlkSkip === "ptlk" && r.backNp2 > 0
  && r.hearyeSpectrum > 0.05 && r.hearyeNp && r.hearyeNp.station === "hearye" && r.hearyeNp.artist && r.hearyeWho.some(w => /Crier/.test(w)) && r.hearyeJoust && r.hearyeAir && r.hearyeAir.saveable && r.backNp3 > 0 && r.hearyeSave[0] > 0.01 && r.hearyeSave[1] < 1.2
  && r.mixKeys === 10 && r.mixMig.join() === "0.5,0.25,0.4,false" && r.mixOther === 0 && r.mixRender[0] > 0.02 && r.mixRender[1] < 1.2 && r.mixZero && r.grvKeys === 26 && r.grvModes >= 15 && r.grvOther === 0 && r.grvRender[0] > 0.02 && r.grvRender[1] < 1.3 && r.grvZero && r.wybcSave.every(([rms, pk]) => rms > 0.01 && pk < 1.3)
  && r.ptMusic.length === 10 && r.ptMusic.every(([, rms, pk]) => rms > 0.02 && pk < 1.2) && r.phoneVsDry < 0 && r.presets >= 5 && r.tuned === "car" && r.untuned
  && r.ptrnSpectrum > 0.05 && r.ptrnNp && r.ptrnNp.station === "ptrn" && r.ptrnNp.style === "Funk" && r.ptrnNp.artist && r.ptrnSkip && r.ptrnGenres >= 43 && r.backNp4 > 0 && r.ptrnRenders.every(([, rms, pk]) => rms > 0.01 && pk < 1.3)
  && r.fxKeys === 12 && r.e3Render[0] > 0.02 && r.e3Render[1] < 1.2 && r.e3Render[2] === 0 && r.eqCurve[0] < -3 && r.eqCurve[1] > 3 && Math.abs(r.eqCurve[2]) < 3 && r.bypass.join() === "true,false,false" && r.e3Zero && r.pad && r.fxRender[0] > 0.02 && r.fxRender[1] < 1.3 && r.fxZero && r.instN >= 40 && r.instClassic >= 20 && r.instRender[0] > 0.01 && r.instRender[1] < 1.3 && r.instAll
  && r.clukSpectrum > 0.05 && r.clukSong && r.clukSong.artist && r.clukSong.bpm > 100 && r.clukBreak && r.clukId && r.clukWho.some(w => /Rhonda|Clark/.test(w)) && r.backNp5 > 0 && r.clukTypes >= 20
  && r.clukRenders.every(([, rms, pk]) => rms > 0.02 && pk < 1.3) && r.clukCues.every(([, rms, pk]) => rms > 0.005 && pk < 1.3) && r.wired && !r.wireErrs.length
  && r.mix.open && !r.mix.pop && r.mix.pos !== "absolute" && r.mix.label === "MIX" && r.mix.secs === 4 && r.mix.uw && r.mix.mountMix
  && r.ui2.pad && r.ui2.view === "pad" && r.ui2.nodes === 6 && r.ui2.canvas && !r.ui2.chaos && r.ui2.glitch && r.ui2.drums && r.ui2.orig && r.ui2.padMix >= 1 && r.ui2.eq[0] > 0 && r.ui2.eq[1] && r.ui2.eq[2] && r.ui2.ghosts > 0 && r.ui2.origOn && r.ui2.origOff && r.ui2.repaint === "30%"
  && r.mixMoved.realism > 0 && r.mixMoved.low > 0 && r.mixMoved.pop > 0 && r.mixMoved.hum > 0 && r.mixMoved.echo > 0 && r.mixMoved.led && r.mixReset && r.mixClosed && !r.mixErrs.length;
if (errs.length) console.log("page errors:", errs);
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED"); process.exit(ok ? 0 : 1);
