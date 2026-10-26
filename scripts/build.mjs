// Zero-dependency build: stitches src/ into dist/mdfm.mjs (ES module) and dist/mdfm.iife.js (window.MDFM),
// and the shared look (the MedDev Receiver, vendor/meddev-receiver) into dist/skin.css, dist/skin.js and the self-contained dist/radio.html.
// Run by `npm run build` (also by `npm test`, `npm run demo`, `npm run hub` and on install via "prepare"). Outputs, all in dist/:
// mdfm.mjs / mdfm.iife.js  the library (ES module / window.MDFM), used by the hub page, apps and demos
// skin.css / skin.js       the MedDev Receiver's look and controls plus skin/types.js
// radio.html               the whole radio in one self-contained page: skin/radio-body.html + radio.css + the library + receiver + skin/radio-wire.js
// manifest.json            names, sizes and hashes of the parts the apps' live updater fetches
// The src/ files are joined into one scope rather than bundled: the engine's imports and exports are stripped, so every
// file's top-level names are shared. Order matters: content, talk, faire, cluk come before the engine that uses them.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);   // the repo root as a file URL
const read = p => readFileSync(new URL(p, root), "utf8");
const { version } = JSON.parse(read("package.json"));
const pack = read("src/content/default.js").replace(/export default\s*/, "const corePack = ");   // the core content pack becomes the const corePack (the first "export default" in that file is replaced)
const engine = read("src/engine.js").replace(/^import .*$/m, "").replace('"__VERSION__"', JSON.stringify(version)).replace(/^export (const|function) /gm, "$1 ");   // the engine: drop its first import line, stamp the version, and turn its exports into plain declarations
const ui = read("src/ui.js").replace(/^export function /m, "function ");
// PTLK 108.0: the procedural talk-show writer (plain function createTalk, no imports/exports)
const talk = read("src/talk.js");
// HEARYE 95.5: the scripted shows and pools (src/faire/*.js) and the station's writer (createFaire), plain consts and functions
// CLUK 92.3: the writers' room's shows, ads and pools (src/cluk/*.js) and the station's writer (createCluk)
const cluk = ["ned", "gizzard", "wishbone", "eggq", "outside", "molt", "pecking", "drumstick", "nestegg", "pluck", "ads1", "ads2", "pools"].map(f => read(`src/cluk/${f}.js`)).join("\n") + "\n" + read("src/cluk.js");
const faire = ["doug", "cauldron", "grog", "pest", "dqi", "onestar", "hoard", "pools"].map(f => read(`src/faire/${f}.js`)).join("\n") + "\n" + read("src/faire.js");
const wx = read("src/weather.js").replace(/^export function /m, "function ") + "\n" + read("src/sports.js").replace(/^export function /m, "function ");
// safety net: a file that still imports or exports would break the concatenated bundle
if (/^\s*(import|export)\b/m.test(pack + engine + ui + wx + talk + faire + cluk)) throw new Error("build: unexpected import/export left in src; update scripts/build.mjs");
// 1.33: baked PTRN tags (real voices recorded ahead of time on a Mac by scripts/render-tags.mjs; plain script that sets
// window.MDFM_TAGS). Optional: without the file, browsers keep using the system voice for tags. Inlined into radio.html
// as its own <script id="mdfm-tags"> ahead of the library, and into the hub embed by scripts/hub-snippet.mjs.
let tagsJs = ""; try { tagsJs = read("src/content/tags-baked.js"); } catch {}
const tagsTag = tagsJs ? `<script id="mdfm-tags">${tagsJs.replace(/<\/script/gi, "<\\/script")}</script>\n` : "";
const xp = read("src/export.js") + "\n" + read("src/mixfile.js") + "\n" + read("src/tune.js");   // the Save helpers, MIX files (1.34) and TUNE (the sound designer panel) ride in the same scope
// the MP3 encoder (lamejs, LGPL-3.0, "npm install --save-exact lamejs@1.2.1"); without it Save song reports that it's missing
let lame = ""; try { lame = readFileSync(new URL("vendor/lamejs/lame.min.js", root), "utf8"); } catch {}
const body = `${pack}\n${talk}\n${faire}\n${cluk}\n${engine}\n${ui}\n${wx}\n${xp}\n`;
// WYBC 88.1: Collin's ambient piano generator (vendor/ambient-soundtrack, no dependencies). Like lamejs it runs as a
// plain script ahead of the strict MDFM scope and defines the global AmbientSoundtrack. Without it, WYBC is skipped.
let amb = ""; try { amb = readFileSync(new URL("vendor/ambient-soundtrack/ambient-soundtrack.js", root), "utf8"); } catch {}
// (wrapped so it always lands on the page's global, even where a CommonJS `module` is in scope)
const ambJs = amb ? `/* Ambient Soundtrack (Collin Geldmeier): plays WYBC 88.1 */\n(function (module) {\n${amb}\n})(void 0);\n` : "";
// lamejs runs as a plain (non-strict) script ahead of the strict MDFM scope; it defines the global lamejs
const lameJs = lame ? `/* lamejs 1.2.1 (LGPL-3.0): MP3 encoder */\n${lame}\n` : "";
// Every built file starts with this banner so nobody edits dist/ by hand.
const banner = `/* MDFM ${version}: generated by "npm run build" from src/. Edit src/, not this file. */\n`;
mkdirSync(new URL("dist/", root), { recursive: true });
const out = (p, s) => writeFileSync(new URL("dist/" + p, root), s);
// The ES module and the IIFE share the same body and export the same names.
out("mdfm.mjs", `${banner}${lameJs}${ambJs}${body}export { createMDFM, mountEQ, mountTune, mountMix, openMeteo, espnSports, corePack, VERSION, STYLES, saveSong, savedText, encodeMp3, saveBytes, zipFiles, exportMix, readMixFile, mixFileName };\n`);
const iife = `${banner}${lameJs}${ambJs}var MDFM = (function () {\n"use strict";\n${body}return { createMDFM, mountEQ, mountTune, mountMix, openMeteo, espnSports, corePack, VERSION, STYLES, saveSong, savedText, encodeMp3, saveBytes, zipFiles, exportMix, readMixFile, mixFileName };\n})();\n`;
out("mdfm.iife.js", iife);
// shared look: the MedDev Receiver (its own repo, Octoroboto/meddev-receiver), bundled in vendor/meddev-receiver by
// "npm run receiver:sync". The apps also follow newer receiver versions live; see apps/common/receiver.js.
const RX = p => read("vendor/meddev-receiver/" + p);
const rx = JSON.parse(RX("manifest.json")), badges = RX("badges.html").trim();
const skinCss = RX("receiver.css"), receiverJs = RX("receiver.js");
const skinsTag = `<script id="meddev-skins" type="application/json">${RX("skins.json").trim().replace(/</g, "\\u003c")}</script>`;   // the receiver's skins as inline JSON; "<" is escaped so the JSON can't end the script tag early
const mdfmSkinJs = `/* MDFM ${version}: content types for the receiver controls */\n` + read("skin/types.js");
// dist/skin.js keeps everything in one file for pages that load it directly (Collin's app, demos).
const skinJs = receiverJs + "\n" + mdfmSkinJs;
out("skin.css", skinCss); out("skin.js", skinJs);
// radio.html: a full page with fonts from Google Fonts (the receiver skins' faces), the receiver's CSS and the radio's CSS
// inline, the body from skin/radio-body.html with the badges footer swapped in, and every script inline, in load order.
const radio = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="mdfm-version" content="${version}">
<meta name="meddev-receiver" content="${rx.version}">
<title>MDFM Radio</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&family=Russo+One&family=Rye&family=Bangers&family=Alfa+Slab+One&family=Press+Start+2P&family=Creepster&family=Black+Ops+One&family=Pacifico&family=Monoton&display=swap">
<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<style id="mdfm-skin">${skinCss}</style>
<style id="mdfm-radio">${read("skin/radio.css")}</style>
</head><body>
${read("skin/radio-body.html").replace("<!--MDFM:BADGES-->", badges)}
${tagsTag}<script id="mdfm-lib">${iife}</script>
${skinsTag}
<script id="meddev-receiver-js">${receiverJs}</script>
<script id="mdfm-skin-js">${mdfmSkinJs}</script>
<script id="mdfm-radio-wire">${read("skin/radio-wire.js")}</script>
</body></html>
`;
out("radio.html", radio);
// dist/manifest.json: what the app kit's MDFM updater (kit/mdfm/updater.cjs) reads to fetch newer content live.
// Each file is listed with its path in this repo and its sha256, so apps only keep a set that matches as a whole.
// The manifest lists the source path of each part and its sha256; skin/types.js, radio.css, radio-wire.js and
// radio-body.html are listed so the apps can update the look and wiring without a new app build.
const shaOf = s => createHash("sha256").update(s).digest("hex");
const parts = { "mdfm.iife.js": ["dist/mdfm.iife.js", iife], "types.js": ["skin/types.js", read("skin/types.js")], "radio.css": ["skin/radio.css", read("skin/radio.css")],
  "radio-wire.js": ["skin/radio-wire.js", read("skin/radio-wire.js")], "radio-body.html": ["skin/radio-body.html", read("skin/radio-body.html")] };
out("manifest.json", JSON.stringify({ name: "mdfm", version, receiver: rx.version,
  files: Object.fromEntries(Object.entries(parts).map(([k, [p, s]]) => [k, { path: p, bytes: Buffer.byteLength(s), sha256: shaOf(s) }])) }, null, 2) + "\n");
console.log(`built mdfm ${version} (receiver ${rx.version}) -> dist/mdfm.mjs, dist/mdfm.iife.js, dist/skin.css, dist/skin.js, dist/radio.html, dist/manifest.json`);
