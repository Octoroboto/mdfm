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
- Works with a strict Content-Security-Policy: it makes no network requests.
- The voice is the system text-to-speech (`speechSynthesis`). On a Mac it uses the "Fred" robot voice when it's installed.
- It only uses CPU while it's playing. `radio.stop()` suspends the audio engine.

## API

| Call | What it does |
|---|---|
| `createMDFM(opts)` | Makes a radio. `opts.packs` adds content packs, `opts.includeCore: false` drops the built-in one, `opts.volume` 0–1, `opts.spots: false` turns ads/IDs off. |
| `radio.start()` / `stop()` / `toggle()` / `isOn()` | Play control. Browsers need a click before the first `start()` unless autoplay is allowed. |
| `radio.skip()` | Crossfade into the next song now. |
| `radio.spotNow()` | Play a stinger plus an ad or station ID now. |
| `radio.setVolume(v)` / `setSpots(bool)` | Live settings. |
| `radio.getSpectrum()` | 19 levels (0–1) from the live audio, or `null` when off. Draw your own EQ with it. |
| `radio.nowPlaying()` | `{ title, style, bpm }` |
| `radio.on(event, fn)` | Events: `nowplaying`, `spot` (`{ kind, text }`), `start`, `stop`. Returns an unsubscribe function. |
| `radio.thwack()` | A swatter-hit sound effect (used by the hub's fly swatter). |
| `mountEQ(canvas, radio, opts)` | LED bars with falling peak caps. Idle shimmer when off (`idle: false` to hide). |

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
