# MDFM 99.9 HD

A hip-hop radio station that runs inside an app. Beats, stingers, cheesy ad music and robot-voice station IDs and ads are all synthesized live with Web Audio: **no audio files, no network calls, no Claude credits.** Every song is different: style, key, chords, drums, bassline, melody and title are random each time.

Used by the Media Development Hub (Rob) and Analyze Pics (Collin).

## Use it in an Electron app

In the **renderer** (the web page side):

```js
import { createMDFM, mountEQ } from "mdfm";

const radio = createMDFM();                  // optional: { packs: [myPack], volume: 0.8, spots: true }
mountEQ(document.querySelector("#eq"), radio);   // optional LED display on a <canvas>
playButton.onclick = () => radio.toggle();
radio.on("nowplaying", s => console.log(s.title, s.style, s.bpm));
```

No bundler? Load `node_modules/mdfm/dist/mdfm.iife.js` with a `<script>` tag and use `window.MDFM.createMDFM()`.

In the **main process**, if you want it to start without a click first:

```js
new BrowserWindow({ webPreferences: { autoplayPolicy: "no-user-gesture-required" } });
```

Notes
- Works with a strict Content-Security-Policy: it makes no network requests unless you turn on live weather.
- The voice is the system text-to-speech (`speechSynthesis`). On a Mac it uses the "Fred" robot voice when it's installed.
- It only uses CPU while it's playing. `radio.stop()` suspends the audio engine.

## Receiver badging (required in every app)

Every app that plays MDFM shows the hub's receiver footer: the MedDev pin and the faceplate marks. It ships in the skin, so it updates with the repo:

```html
<link rel="stylesheet" href="node_modules/mdfm/dist/skin.css">
<footer data-mdfm-badges></footer>            <!-- bottom of the window -->
<script src="node_modules/mdfm/dist/skin.js"></script>
```

The look and controls come from **MedDev Receiver** (`Octoroboto/meddev-receiver`), bundled in `vendor/meddev-receiver` (`npm run receiver:sync` refreshes it). `skin.js` fills any `[data-mdfm-badges]` element. If you add one later, call `window.MDFM_mountBadges()`.

## API

| Call | What it does |
|---|---|
| `createMDFM(opts)` | Makes a radio. `opts.packs` adds content packs, `opts.includeCore: false` drops the built-in one, `opts.volume` 0–1, `opts.spots: false` turns ads/IDs off, `opts.weather` an async function returning `{ temp, cond, place, wind }` (see `openMeteo`). |
| `radio.start()` / `stop()` / `toggle()` / `isOn()` | Play control. Browsers need a click before the first `start()` unless autoplay is allowed. |
| `radio.skip()` | Crossfade into the next song now. |
| `radio.spotNow()` | Play a stinger plus an ad or station ID now. |
| `radio.setVolume(v)` / `setSpots(bool)` | Live settings. |
| `radio.setLetItRide(bool)` / `isLetItRide()` | Keep each song going about 2 minutes (second breakdown, extra fills). Also `opts.letItRide`. |
| `radio.setUnderwater(bool)` / `isUnderwater()` | Muffled underwater sound on the music. Also `opts.underwater`. |
| `radio.getSpectrum()` | 19 levels (0–1) from the live audio, or `null` when off. Draw your own EQ with it. |
| `radio.nowPlaying()` | `{ title, style, bpm }` |
| `radio.on(event, fn)` | Events: `nowplaying`, `spot` (`{ kind, text }`), `caption` (`{ who, text }` for every spoken line), `start`, `stop`. Returns an unsubscribe function. |
| `radio.setProviders({ weather, sports, cannedFallback })` | Turn live data on or off after creating the radio. |
| `radio.thwack()` | A swatter-hit sound effect (used by the hub's fly swatter). |
| `mountEQ(canvas, radio, opts)` | LED bars with falling peak caps. Idle shimmer when off (`idle: false` to hide). |

## Stations

Six stations share one audio output (volume, EQ, meters, visualizer and MIX), on the dial by frequency:

- **WYBC 88.1**: ambient piano composed live by Collin's generator (`vendor/ambient-soundtrack`), with a made-up artist per piece and a whisper DJ every 15-20 minutes. No ads, shows or news.
- **CLUK 92.3** (1.24): Everything in the Chicken. The whole universe is inside one enormous chicken and this is its
  station. Music that rips (big beat, breakbeat, funky, acid and rave breaks, electro, electro house and hard house: `CLUK_GENRES`
  in `src/engine.js`, on MDFM's song writer with riff, acid, electro and rubber basses, stabs and a drum-bus drive), DJ Rhonda
  Pecks and the station voice Clark Featherstone between songs, Rhonda's request line, 62 ads, and ten scripted shows written
  by a writers' room (`src/cluk/*.js`, 12 episodes each) plus Lazer Hour with Ned (18 episodes, with raves and rescues of the
  President's daughter). Each show's theme, stingers, bed and outro come from its own genre. `src/cluk.js` (`createCluk`) deals
  the shows and writes the procedural parts.
- **HEARYE 95.5**: Renn Faire Radio, the Home of High Drama. Procedural high-fantasy music (`FS` in `src/engine.js`: elven
  ambience, halfling party, tavern jig, the wizards' council, den of evil, angelic herald, battle orders, glorious battle,
  bard's lament, royal procession) on harps, lutes, flutes, fiddles, strings, horns, brass, organ, Gregorian chant, battle
  drums, frame drums and tambourines, over forest, meadow, mountain, cave, tavern and hearth ambience. (1.16's pop and epic
  layers were taken out in 1.17.1; the Style Matrix in TUNE pulls it toward pop when you want that.) Each piece is written
  from a seed (a made-up title and players), so Save renders the piece on air again from the top. Between pieces: a royal
  crier (IDs), a bard (intros, back-announces, call-ins) and a herald (realm news: the Slack news from `opts.news`, read in
  the old tongue, or made-up proclamations without it), seven scripted shows of 15-16 episodes each (`src/faire/*.js`: Why
  Dost Thou Clappest, Doug?, The Cauldron of Dark Desire, Hot Grog Sticky Gruel, Pestilence Today, Don't Quest-ion It, One
  Star Quest, Hoard and Order; no repeats until every episode has aired), procedural jousting and royal show-pony broadcasts,
  and ads, each with its style's theme, bed, stingers and closing cadence. `src/faire.js` (`createFaire`) writes the talk.
- **MDFM 99.9 HD**: everything above. About one song in four is in 3/4, 6/8, 5/4 or 7/8, picked to suit its genre (1.22).
- **PTRN 101.1** (PATTERN, 1.22): no shows, no DJ. 34 genres in seven families (electronic, hip-hop and R&B, rock and pop,
  jazz/funk/soul, Latin and Caribbean, chill, country and folk), each a switch in its Settings; the station plays simple
  procedural tracks in whichever are on (MDFM's song writer, with genres of its own in `STY`), mixed one into the next
  with an equal-power blend, beat-matched when the tempos are close. The only voice is tags: station IDs and drops on the
  beat. Where the app renders voices (`opts.tts`) they're played like samples (echo throw, stutter, slowed, reversed
  or gated), in clear voices only; in a browser, the system voice on the downbeat with a vocal-chop stutter. Next track
  blends on the next bar; Drop a tag fires one. Save renders the track with its tags and TUNE's effects.
- **PTLK 108.0**: 100% procedural talk radio (`src/talk.js`). Nine shows, each episode written as it airs from large pools of
  names, places, plots and jokes, with running storylines (Doug's feud with Sheila Vance, Ron's mailbox, the Overnight Shipping
  serial) kept while the page is open: Clap Attack with Doug, Analyze Biz, The Real USB Drives of Cleverly Spillz, Button Mashers,
  The Long Look (nature), Lost & Found Live, The Committee, Overnight Shipping and Ask a Retired Wizard. An announcer and the organ
  run between shows. `setProviders({ headlines(kind, arg) })` feeds live material: `headlines("business")` and
  `headlines("gaming")` resolve `[{ title, source }]`, `headlines("wiki", "Pangolin")` resolves `{ title, extract }`. The
  shows read live headlines straight, then joke about the situation, never about named people; with no provider, or after
  6 seconds, they make up their own (fictional companies and games). Each show has several formats, its own theme
  music and stingers (`PT` in `src/engine.js`: news, ticker, pomp, West Coast, tech, nature, noir, fantasy styles), and
  `renderOffline("ptmusic", secs, { style, cue })` renders any of them for checks. The apps provide it through `app.live("headlines:…")` /
  `app.live("wiki:…")` (`apps/common/headlines.js`: GDELT and Wikipedia, filtered and cached).

`radio.stations()`, `getStation()`, `setStation(id)`, `nextStation()`, `prevStation()` and the `station` event switch between them
(live, or before SOUND). `stationTypeList("wybc")` / `setStationTypes("wybc", { ids, strings, winds, hall, room })` are WYBC's
"what plays" switches; MDFM's stay `setTypes`. On WYBC, `skip()` crossfades to a new piece, `spotNow()` plays a station ID
and `renderSong()` renders a fresh 2.5-minute performance. On PTLK, `skip()` starts a new show, `spotNow()` cuts in a station ID
between lines and the show carries on, `onAir()` describes the show (Save records it whole in the apps, where the voices are
audio) and `stationTypeList("ptlk")` / `setStationTypes("ptlk", { doug, biz, usb, buttons, nature, lost, hoa, ship, wizard, ids })`
are its switches. On HEARYE, `skip()` moves on to the next piece (or ends the segment on air), `spotNow()` brings the crier in,
`renderSong()` renders the piece on air from the top, `onAir()` describes a show, ad or call-in on air, and
`stationTypeList("hearye")` / `setStationTypes("hearye", { doug, cauldron, grog, pest, dqi, onestar, hoard, joust, ponies, news,
ads, callers, ids, amb })` are its switches. `renderOffline("fpiece", secs, { style, seed })` and `renderOffline("fcue", secs,
{ style, cue })` render its music for checks. The radio page has ◀ ▶ arrows on the lower button row and a
"What plays" section per station; it remembers the station and WYBC's switches on the device.

## MIX (1.25; was TUNE)

The MIX drawer (`mountMix`, alias `mountTune`, in `src/tune.js`) opens under the main panel and has four sections:
- **Sound:** a parametric EQ (`setEq`, `getEq`, `eqResponse`), tone knobs, room and presets.
- **Style:** the style matrix, with pad and fader views (`setStyleMix`, `setStylePad`, `padToMix`, `getStylePlan`). Ten directions: rock, pop, dance, hip-hop, lo-fi, space, orchestral, jazz, latin, country.
- **Groove & Key:** `setGroove`, `grooveKeyInfo()` for ranges and defaults, including the drum controls: push/pull, ghosts, accent, hat swing, hat density, kick/snare/hat level.
- **FX:** `setFx`, including `glitch`.

**MELODY (1.29):** groove keys `mel` (COMPLEXITY), `rep` (REPETITION), `range` (RANGE) and `harm` (HARMONY), each 0..1 with .5 as written, kept per station with the rest of GROOVE. `playStep` uses `melMot` (which phrase, varied, simplified or filled, wider or narrower) and `harmChord` (fifths, triads, the song's voicing, 7ths, 9ths) only while one is moved. Choices come from a hash, never the song's random stream. `grooveSupport(id).melody` is 1 on MDFM, PTRN and CLUK.

**BEAT (1.31):** `setBeat({inf, bass, follow, grid:{k,s,h,o,p}}, id)` (cells 0 = the song decides, 1/2/3 = soft/hit/loud, −1 = rest) steers the song's drums per bar (`beatPlan`, hashed, never the song's random stream); `beatNow()` gives the on-air bar for the MIX card (logged only while `beatWatch(true)`). Nothing changes until a step is set.

**LITE (1.26, phones and tablets):** the LITE button next to ORIGINAL cycles AUTO / ON / OFF. It's saved in `mdfmMixUI.lite`, and AUTO means touch devices. While MIX is open in LITE:
- the page gets `html.mx-lite` and `window.MDFM_lite` (the receiver's meters drop to 20 fps);
- the engine gets `setLite(true)`: notes are scheduled 0.5 s ahead and the matrix saturators skip oversampling;
- MDFM's talk breaks are held with `setSpots(false)` and given back on close.

**VOID (1.27):** its own button. It's saved in `mdfmMixUI.void` and active while MIX is open. It sets `html.mx-void`, turns off the skin's theme stylesheet (`#meddev-skin-theme`, restored afterwards) and fires `mdfm:void`. The CSS removes background images, shadows, glows, filters, blend modes and animations, hides the decorations and paints flat blocks.

**PERF (1.27):** a fixed readout fed by `radio.perfStats(true)` twice a second and by `requestAnimationFrame` for frame timing.

While any MIX control is being dragged, its engine call, repaint and save are coalesced to one per frame and the saves are written when the drag ends.

`setMixBypass(true)` is ORIGINAL. Every control at its default is the station as written. The sections below describe the engine's sound stage (older notes; the names TUNE and CHAOS are from before 1.25).

## Sound tuning (TUNE)

**Style Matrix** (1.17): a radar chart in the TUNE pop-out pulls the station's music toward pop, hip-hop, rock, classical,
modern country and "galactic cosmotosis" (plus CHAOS). The song keeps its notes and form, but its instruments, groove,
tempo, swing and sound move toward each style, weighted by how far each axis is pulled. It's per station:
`styleMixKeys()`, `getStyleMix(id)`, `setStyleMix({ rock: .5, galactic: .3 }, id)`, `resetStyleMix(id)`. With everything
at the centre, nothing changes.

**Groove & Key** (1.17): beside the radar, per station:
- **Tempo and time:** BPM (40–220, or the song's own), time signature (the song's 4/4, or 3/4, 6/8, 5/4, 7/8, 7/4), swing, and length (0.5× to 3×, from the next song).
- **Key:** any key and scale (major, minor, the modes and 12 more, such as Phrygian dominant, Double harmonic and Super Locrian). Notes move by scale degree, so chords and tunes keep their shape.
- **Drums:** density, fills, feel (half, normal or double time), humanize and drum level.

API: `grooveKeys()`, `keyModes()`, `meters()`, `grooveSupport(id)`, `getGroove(id)`, `setGroove({ bpm: 120, meter: "5/4", root: 9, mode: "mixolydian", density: .7 }, id)` and `resetGroove(id)`. `mountTune` takes an optional `grooveStore` (default: localStorage `mdfmGroove`).

Save includes everything. `nowPlaying()` and the saved file's info show the new BPM, key and time. WYBC has no time signature, and its drum controls work on the matrix's rhythm section. With every control at its default, nothing changes.

`radio.setSound({ realism, width, clarity, warmth, room, roomType, rattle, grain })` shapes the sound between the station
mix and the volume. Values run 0 to 1 (`width` 0.5 is untouched, 0 is mono, 1 is wide); `roomType` is `studio`, `car`,
`living`, `club` or `hall`. At the defaults (`soundDefaults()`) the stage is a straight wire. `soundPresets()` lists the
presets, `resetSound()` goes back, and `createMDFM({ sound })` starts tuned. The radio page's TUNE button opens the knobs.

**Instruments** (1.23): each MDFM and PTRN song picks a drum kit (classic, 808 boom, punchy, dusty lo-fi), a bass sound
(synth, 808, sub, FM, acid), keys, a lead and a pad. `radio.instrumentList()` lists the pool as [key, label, category, since]
("classic" = MDFM before 1.22, "1.22" = came with PTRN, "1.23" = new); `setInstruments({key: false})` takes one out (from
the next song). The radio page's Settings has the switches (localStorage `mdfmInstruments`). Since 1.28 CLUK uses the pool too, the genre bass lines
(reese, wobble, slap, CLUK's five) and CLUK's keys and acid lead are in it, and `instrumentsNow()` says what the song on air
is playing; Settings shows it as a "Playing now" card with Switch off buttons, plus ▶ NOW / HEARD marks on the list.
Since 1.31 a **High-end pack** (marimba, kalimba, celesta, harp, koto, suitcase, felt and upright pianos, upright bass) is in the pool too,
marked by a fifth item `"highend"` in `instrumentList()`.

**Effects** (1.22): `radio.setFx({ echo, reverb, chorus, flange, phaser, warble, crush, drive, filter, gate, pump })`, all 0 to 1
(0 = off; `filter` .5 = off, below is low-pass, above is high-pass), on every station and in Save. Echo, gate and pump follow
the beat. `radio.tapeStop()` and `radio.spinBack()` drop the music back in on the beat. `getFx()`, `resetFx()`, `fxKeys()`,
`fxDefaults()`. All off: not in the path at all. The TUNE pop-out has an EFFECTS section (localStorage `mdfmFx`).

**Groove & Key values** (1.22): swing, length, density, fills and drums are `-1` for the song's own (TUNE's SONG buttons),
or 0 to 1 on their own scale (swing 0 = straight; density 0 = bare; fills 0 = none; drums 0 = off). TIME has 4/4 too.

`ambience` (1.21, default 0.5) sets the background sounds under the music: HEARYE's forests, taverns and caves, WYBC's
concert-hall room and MDFM's vinyl crackle. 0 turns them off, 0.5 is the station's own level, 1 is about 8 dB louder.

## Weather and time

The DJ reads the local time on its own, with a remark that fits the hour, then hands over to Tabitha Snatterbean for the weather. Real weather is opt-in, because it's the only part of MDFM that uses the network (Open-Meteo, free, no key):

```js
import { createMDFM, openMeteo } from "mdfm";
const radio = createMDFM({ weather: openMeteo({ lat: 41.88, lon: -87.63, place: "Chicago" }) });
// or openMeteo({ place: "the office", auto: true }) to use the device location
```

Without it (or where the network is blocked, like the hub), Tabitha does a cheeky no-data forecast instead. When you do pass a live provider, MDFM only uses live data: if a fetch fails, it plays a station ID instead of a canned forecast. Set `cannedFallback: true` to allow the canned lines as a backup. Sports works the same way. If your CSP is strict, allow `https://api.open-meteo.com` in `connect-src`.

## Sports with Chip Nitro

Chip Nitro does sports. With no data he reports on the Browser Tab League. For real local scores, pass the opt-in ESPN scoreboard reader (public feed, no key):

```js
import { createMDFM, openMeteo, espnSports } from "mdfm";
const radio = createMDFM({
  weather: openMeteo({ lat: 41.88, lon: -87.63, place: "Chicago" }),
  sports: espnSports({ city: "Chicago" }),            // or { teams: ["Bears", "Cubs"], leagues: ["nfl", "mlb"] }
});
```

Leagues: nfl, nba, mlb, nhl, mls, wnba (default), plus ncaaf and ncaab. It picks your city's teams, live games first, then recent results, then upcoming. If the renderer can't fetch it (CORS or CSP), pass `fetch` to route the request through your main process. Allow `https://site.api.espn.com` in `connect-src` if you have a strict CSP. This feed is ESPN's public site API, not an official, documented one, so treat it as best-effort.

## Content packs (ads and station IDs)

Ads and IDs live in plain data files so they're easy to add to. **Add your own pack file instead of editing someone else's**, so two people never edit the same file at once.

- `src/content/default.js`: the core station (Rob).
- `packs/example-pack.js`: copy this to start your own, e.g. `packs/analyze-pics.js`.

Then `createMDFM({ packs: [myPack] })`. A pack has `ids`, `late` and `ads` (strings, or functions `h => string` where `h` has `pick`, `ri` and `freq`) plus `adParts` for the mix-and-match ad generator.

## Keeping both apps up to date (both directions)

This repo is the **one copy** of MDFM. Neither app keeps its own edited copy.

**Recommended setup for each of us:**
1. Clone this repo next to your app: `~/RentVision/mdfm` (or wherever your app lives).
2. In your app's package.json: `"mdfm": "file:../mdfm"`, then `npm install`. Your app now runs straight from your clone.
3. To get the other person's changes: `git pull` in the mdfm folder. Your app picks them up on its next reload. No reinstall.

**Making a change (either of us):**
1. In the mdfm folder: `git checkout -b feedback/<your-name>/<what-you-changed>` (Rob can work on `main`).
2. Edit `src/` or a pack in `packs/`. Never edit `dist/` or the copy inside `node_modules`.
3. `npm test` (builds `dist/` and runs the smoke test; needs Playwright).
4. Commit (including `dist/`) and push the branch.
5. Rob reviews and merges into `main`, bumps the version and adds a CHANGELOG line. Then everyone `git pull`s.

**Pinned installs (optional, for release builds):** `"mdfm": "github:Octoroboto/mdfm#v1.0.0"`, then `npm install` after a new tag.

**Before Collin has GitHub access:** install from the release file instead: `npm install ./mdfm-1.0.0.tgz`. If you change anything in the meantime, change it in an unpacked copy of this repo (not inside `node_modules`) and send Rob the changed files or a `git diff`, so it lands in the repo before you switch to the clone.

**The Media Development Hub** can't load from a private repo, so it embeds `dist/mdfm.iife.js`. After a merge, run `npm run hub` (writes `dist/hub-embed.html`) and ask Claude to republish the hub with it. The hub shows the MDFM version in the speaker tooltip so you can tell if it's behind.

## Developing

- `npm run build`: rebuilds `dist/` from `src/` (no dependencies).
- `npm run demo`: opens a test page at http://localhost:5179/demo/
- `npm test`: build + browser smoke test.
- **Comments:** every file is commented for someone opening it cold (`docs/COMMENTING.md` has the rules), and every change keeps it that way: new code arrives with its comments, changed code has its comments updated. A comment-only pass is checked with `node scripts/comment-check.mjs <before dir> <after dir>` (needs `npm i --no-save acorn`), which fails if anything but comments changed.
