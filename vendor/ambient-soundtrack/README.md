> **In MDFM:** this is Collin Geldmeier's generator, vendored unchanged except one line (marked "MDFM patch" in
> `stop()`): it no longer suspends an AudioContext that the host passed in, because MDFM shares its context between
> stations. It plays WYBC 88.1 (see the MDFM README). Upstream changes: copy the new file here and re-apply that line.

# Ambient Soundtrack

The generative soundtrack from Collin's "Where Ya Been, Collin?!" map, as a standalone package.

It's a soft, warm piano piece that the browser composes and plays live, so it never repeats. Layers:

- An acoustic-style piano, with sustain-pedal, hammer and key noises and the odd bench creak.
- Very light strings.
- A bass clarinet or bassoon now and then.
- A hushed room tone and a little tape grain.
- The occasional far-off concert-hall sound.

Everything runs through a gentle "tape" stage (soft saturation, a slow wobble, a warmth filter) and a wood-panelled room reverb.

There are no audio files, samples or dependencies. It's all built with the Web Audio API, and the whole thing is one ~33 KB JavaScript file.

## What's in here

| File | What it is |
|---|---|
| `ambient-soundtrack.js` | The engine. Drop it into any web page or web view. |
| `demo.html` | A test page with play/pause, the full mixer and a "Render WAV" button. Open it in Chrome, Safari, Firefox or Edge. |

## Quick start (web page or in-app web view)

```html
<script src="ambient-soundtrack.js"></script>
<script>
  const music = AmbientSoundtrack.create();
  playButton.onclick = () => music.start();   // first start must come from a tap/click (browser autoplay rules)
  pauseButton.onclick = () => music.stop();   // fades out; start() picks up where it left off
</script>
```

It also works as a CommonJS module: `const AmbientSoundtrack = require('./ambient-soundtrack.js')`. It still needs a browser or web-view environment, because it uses Web Audio.

## Mixer

`music.set(name, value)` changes a setting live, and `music.get(name)`, `music.settings()` and `music.reset()` read or restore them. You can also pass starting values with `AmbientSoundtrack.create({ settings: { tempo: .85, strings: 1.2 } })`.

| Setting | Range | Default | Controls |
|---|---|---|---|
| `master` | 0–1.5 | 1 | Overall volume |
| `piano` | 0–1.5 | 1 | Piano |
| `mech` | 0–1.5 | 1 | Pedal, hammer and key noises |
| `strings` | 0–1.5 | 1 | Light string section |
| `winds` | 0–1.5 | 1 | Bass clarinet / bassoon |
| `room` | 0–1.5 | 1 | Hushed room tone |
| `grain` | 0–1.5 | 1 | Tape hiss, rumble and dust |
| `hall` | 0–1.5 | 1 | Far-off concert-hall sounds (coughs, doors, tuning…) |
| `tempo` | 0.6–1.4 | 1 | Speed |
| `notes` | 0–1 | 0.5 | How busy the melody is |
| `warmth` | 0–1 | 0.5 | Brighter ↔ darker, woollier tone |
| `space` | 0–1 | 0.5 | Size of the room (reverb) |

## Getting it onto a radio app

There are three ways, depending on how the app plays audio.

**1. App built on web tech (or with a web view):** use it live, as in the quick start above.

**2. App streams audio from the browser:** route the output into a stream instead of the speakers:

```js
const ctx = new AudioContext();
const streamOut = ctx.createMediaStreamDestination();
const music = AmbientSoundtrack.create({ context: ctx, destination: streamOut });
await music.start();
// streamOut.stream is a live MediaStream: send it over WebRTC, record it with MediaRecorder, etc.
```

**3. App plays audio files (playlists, native apps, a streaming server):** render finished WAV files and use those:

```js
const wav = await AmbientSoundtrack.renderWav(600, music.settings());   // 10 minutes → Blob (audio/wav)
```

You can also use the "Render WAV" button in `demo.html`.

- Rendering runs about 4× faster than real time. A 10-minute file takes about 2–3 minutes to render and is about 100 MB (44.1 kHz, 16-bit stereo).
- Keep each render to about 10 minutes, because longer ones need a lot of memory.
- Every render is a brand-new performance, so you can make as many different files as you like and play them back-to-back.
- Files fade out over the last 5 seconds. Pass `{ fadeOut: false }` as the third argument if you'd rather crossfade them yourself.
- Convert to MP3/AAC with any encoder if the app needs it (for example `ffmpeg -i in.wav -b:a 192k out.mp3`).

## Notes

- **Loudness:** averages about −27 dB with peaks around −8 dB, so it's soft by design. Raise `master` or normalise the rendered files if it needs to sit louder on air.
- **Hidden tabs:** playback pauses when the browser tab is hidden and resumes when it's visible again. Turn that off with `create({ pauseWhenHidden: false })`.
- **Compatibility:** works in current Chrome, Edge, Firefox and Safari, including iOS and Android web views.
