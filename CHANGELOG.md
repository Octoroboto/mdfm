# MDFM changelog

Bump `version` in package.json and add an entry here with every change that gets merged to `main`.

## 1.32.1 (2026-10-20, Rob)
- **VOID title bar (apps):** VOID strips the window-control strip's background and left-aligns the title, so POWER / MIN / FULL sat on top of "MDFM RADIO". In VOID the controls now sit in line before the title (`html.mx-void header.top .wctl`).
- **Settings section headers:** the frequency is now a small LCD chip in the skin's own LCD colours, one width for all (so the titles line up). It was the skin's LCD colour straight on the panel, which vanished on light skins (Q3 Reconciliation 1.4:1, Analyze Pics). The doubled class outranks Analyze Pics' black `<b>`. Analyze Pics' "N of N on" count is darker. Checked in every skin: frequency 7:1 or better, titles 4:1 or better.

## 1.32.0 (2026-10-19, Rob)
- **PTRN: five goth genres** in a new **Goth & dark** family: darkwave, gothic rock, witch house, ethereal wave and dark synth-pop. Each has its own switch in Settings (all on). They take MDFM's goth rules (`STYLE_FAM` "goth": key change up for the last hook, 6/8 and 7/8, the goth High-end pack picks). Gothic rock is left out of the High-end pack picks so it keeps its chorus guitar.
- **New sounds:** `M.ppbass` (a picked chorus bass) played by `BASSX.postpunk` (a melodic eighth-note figure per song); `M.chime` (a clean chorus guitar) played by `CHX.chime` (ringing arpeggios); `SNX.cavern` (the big reverb snare). The chorus (`chorusIn`) is shared by overlapping notes and is left out in LITE live. Settings › Instruments has "Chorus bass (post-punk)" and "Chorus guitar (post-punk)" (since "1.32", tagged new).
- **Levels:** genre `lvl` matched to PTRN's other genres (about −15.3 LUFS, within about 1 dB). Cost: gothic rock about 1.35× Rock at a 6× CPU throttle; the others are in line with their neighbours.
- MDFM 99.9 songs are unchanged (seeded render matches 1.31.0). PTRN's genre draws change, since there are more genres to draw from.
- Test hooks: `renderOffline("inst")` gains roles `mbass` and `snare`.
- **Fix:** PTRN could go silent after a tag (reported on Next track). When a resume of the audio was refused (iOS refuses one while its system voice holds the audio) nothing tried again. Now a once-a-second check resumes it while SOUND is on, and the 1.31 voice guard gives up after 10 s.
- **Fix:** SOUND off now stops a voice mid-line. In `setOn` an end-of-line comment had swallowed the voice stop (the known issue from the comments pass); it now calls `hush()`.

## Comments pass (2026-10-18, Rob; no version change, no behaviour change)
- **Comments:** every file outside `vendor/`, `dist/` and `apps/*/kit/` is now commented for a reader opening it cold. That means file headers, section banners, every function and table, and the reasons behind non-obvious lines. `src/engine.js` gets an overview and a glossary of its short names at the top.
- **Rules:** `docs/COMMENTING.md` has the rules, and `CLAUDE.md` makes them part of every future change.
- **Cedar policies:** the Bouncer `.cedar` policies are left untouched, because they are hash-locked.
- **Checker:** `scripts/comment-check.mjs` proves a comment-only change (token-for-token identical code, no new line breaks inside statements). The built bundles match 1.31.0 token for token.
- **Known issue found while commenting (not changed here):** in `setOn` (SOUND off), an end-of-line comment swallows `speechSynthesis.cancel()`, the voice-source stop and `speaking=false`. Those three never run, so a voice that's mid-line may keep talking after SOUND is switched off.

## 1.31.0 (2026-10-18, Rob)
Ships the 1.30 instruments work (previewed, never released on its own) together with BEAT.
- **BEAT** (MIX › Groove & Key, a new full-width card after Drums; a BEAT tab on phones): a one-bar drum pattern that steers the song's drums.
  - **The grid:** 16 steps for KICK, SNARE / CLAP, HAT, OPEN HAT and PERC. Each step is empty (the song decides), a hit (soft, normal or loud) or **✕ rest** (keep that step quiet). Tools: HIT, LOUD, SOFT, REST and ERASE. Tap to set (the same value again clears it); drag across a row to paint. Arrows, Enter and Delete work from the keyboard.
  - **INFLUENCE:** NUDGE (adds soft hits, thins with rests, keeps the kick on 1 and the backbeat), BLEND, LEAD (your pattern, with the song's touches), EXACT (only your pattern).
  - **Songs without drums** (and a ballad's drumless verses) get drums that fit the song from its next section: gentle at low influence (a rim click and a shaker), your full pattern at high.
  - **FOLLOW BREAKS** (on): intros and breaks stay without drums. **BASS FOLLOWS KICK**: the song's bass hits move toward your kicks (genre bass lines like reese and wobble keep their own rhythm).
  - Faint dots show what the song plays, the playing step is outlined and what actually plays lights up. **COPY SONG**, **START FROM…** (nine starting patterns) and **CLEAR**.
  - Per station, on MDFM 99.9, PTRN 101.1 and CLUK 92.3; kept on this device (`mdfmBeat`); RESET and ORIGINAL include it. With no steps set (or INFLUENCE at 0) the song is unchanged: a seeded render matches 1.30 to the render floor.
  - Works in VOID: the grid keeps its own colours.
- **Higher-end instruments** (from the 1.30 preview): marimba, kalimba, celesta, plucked harp, koto, a suitcase electric piano, felt and upright pianos, and a plucked upright bass. About one song in three picks one (never METAL, PUNK or CHIPTUNE); Settings › Instruments has them in a **High-end pack** box with All and None. Partials no longer click at their end, and damped notes fade out instead of cutting.
- **iPhone and iPad:** PTRN's voice tags (the system voice in a browser) are no longer cut off mid-word: the radio waits for the line to end before waking the audio back up.
- **API:** `beatInfo()`, `beatSupport(id)`, `getBeat(id)`, `setBeat(v, id)`, `resetBeat(id)`, `beatPreset(name)`, `beatWatch(on)`, `beatNow(id)`, event `beat`; `instrumentList()` items carry a fifth field (`"highend"` for the pack).

## 1.29.0 (2026-10-18, Rob)
- **MELODY** (MIX › Groove & Key, a new card between Key and Drums; a MELODY tab on phones). Four knobs, per station, each AS IS at 50:
  - **COMPLEXITY:** simpler (the weaker in-between notes drop out and the strong ones ring on) to busier (passing notes fill the gaps, then quick 16th pickups lead into notes).
  - **REPETITION:** varied (the tune changes a few notes every time through) to repetitive (the answer phrase becomes the hook, then the verse sings the hook too, in its own register).
  - **RANGE:** narrow and low-key to wide and soaring (each note's distance from the phrase's middle, ×0.35 to ×1.8).
  - **HARMONY:** open fifths, then triads, then the song's own chords (35–65), then 7ths, then 9ths (rootless over a bass).
  They reshape the song as it plays (heard within a bar), and Save and its MIDI file get the same notes. They never draw from the song's own random choices, so turning a knob back gives the same song. At 50 the sound is unchanged (a seeded render matches 1.28 to the render floor). They work on MDFM 99.9, PTRN 101.1 and CLUK 92.3; HEARYE, PTLK and WYBC say "Not on" (their music is written differently).
- **Engine:** groove keys `mel`, `rep`, `range` and `harm` (0..1, .5 as written; `grooveKeys()` now has 26), and `grooveSupport(id).melody`.

## 1.28.0 (2026-10-17, Rob)
- **Settings › Instruments shows what's playing.**
  - **Playing now:** a card at the top names the song on air and lists its drums, bass, keys, hook lead, verse lead and pad. Each has a **Switch off** button that takes effect from the next song, and a **Next song** button sits beside them.
  - **Marks in the list:** **▶ NOW** for what the song on air is playing, and **HEARD ×n** for what played in the last 12 songs (kept on this device).
  - Works on MDFM 99.9, PTRN 101.1 and CLUK 92.3.
- **More to switch off:**
  - CLUK's horn and guitar stabs, chicken-scratch guitar, rave piano, hard house stabs, electro stabs and acid lead.
  - The genre bass lines: reese, wobble, slap, and CLUK's riff, acid, electro, rubber and hard house basses. A switched-off bass line plays as a plain synth bass line.
  - The section is now "Instruments on MDFM 99.9, PTRN 101.1 and CLUK 92.3", and items that came with CLUK are marked **CLUK**.
- **API:**
  - `instrumentsNow(np?)` returns `[{role, cat, id, key, label, on}]`.
  - Now-playing carries `inst`.
- With everything on, songs are unchanged: a seeded render matches 1.27 to the render floor.

## 1.27.0 (2026-10-16, Rob)
- **VOID** (a button in MIX, next to LITE): while MIX is open, the radio drops its skin and every texture, glass, glow, shadow, filter and decoration, and draws flat dark-grey blocks with crisp lit edges. The layout and controls stay the same. On an iPhone 13, turning knobs went from about 2 fps to 50–60 fps. Tap it again to get the skin back; the choice is remembered.
- **PERF** (a button in MIX): a small on-screen readout of frame rate, the longest freeze, whether notes arrive on time (skipped or near misses), the time to spare, and the audio state. Touches pass through it. It stays up until you close it.
- **Lighter audio:**
  - A reverb turned all the way down (REALISM, ROOM, REVERB, the matrix hall) stops getting signal once its tail has rung out, so the browser can skip it, and it's reconnected the moment it's turned up. A send faded to zero never quite reached zero, so those reverbs kept running.
  - LITE runs every saturator (the master safety clipper, warmth, drive, the phone line and the matrix's two) without oversampling. A Save always renders at full quality.
  - LITE leaves out the copy that is 20 dB or more under the other at the edges of a style blend (the louder one takes its power). About 28% fewer oscillators there; the middle of a blend is unchanged, because both copies are audible.
  Off LITE (the Mac), the sound is unchanged: a seeded render matches 1.26 to the render floor.
- **Engine:** `perfStats(reset)` (scheduler health: steps, late, tight, minLead, ahead and audio details), and `_cullTest` (tests and the bench only).

## 1.26.0 (2026-10-16, Rob)
- **MIX on phones and tablets (LITE).** A LITE button sits next to ORIGINAL (AUTO / ON / OFF; AUTO is on for iPhone, iPad, Android and touch-first screens). While MIX is open in LITE:
  - decorations pause, the scratched glass and text glow are off, and the meters run at 20 fps;
  - the EQ graph leaves out its live spectrum;
  - the music is scheduled 0.5 s ahead instead of 0.25 s, so a busy screen doesn't make it skip;
  - the matrix's two saturators skip oversampling;
  - MDFM's talk breaks wait until MIX closes.
  Off LITE (the Mac), the sound is unchanged: a seeded render matches 1.25 to the render floor (about −84 dB).
- **Dragging is lighter everywhere.** While a finger, pen or mouse drags a MIX control:
  - the engine update, the repaint and the save run once per frame, not once per move;
  - settings are written when you let go (they were written to storage on every move);
  - the STYLE panel is painted once per change instead of twice;
  - the pad, the EQ graph and the faders measure themselves once per drag, the pad's rings are redrawn only when AMOUNT changes, and the hidden view (faders while on PAD) isn't repainted;
  - measured on a throttled iPad-sized page, the pad went from 42 to 57 fps and its longest freeze from 125 ms to 51 ms.
- **The matrix hall** builds its impulse response once per audio context, in small idle slices when MIX opens. Raising SPACE or HALL no longer stalls the page.
- **Engine:** `setLite(v)` / `isLite()`, `getSpots()` and `prewarmMix()`.
- **MedDev Receiver 1.13.4:** the 1.25 meter patch is now in the receiver itself, so the Mac apps get it too, plus `window.MDFM_lite`. `vendor/meddev-receiver` and `apps/common/receiver.js` are synced.

## 1.25.0 (2026-10-15, Rob)
- **TUNE is now MIX, and it opens in place.** MIX expands under the main panel and pushes the page down; nothing floats over the radio. It has four sections:
  - **Sound:** a six-band parametric EQ (low cut, low shelf, two mids, high shelf, high cut) with a curve you drag, plus the tone knobs, room and presets. The quick LOW/MID/HIGH knobs moved here from the station panel.
  - **Style:** a new matrix with a **PAD** view (drag one puck around ten directions, with an amount ring) and a **FADERS** view.
  - **Groove & Key:** a BPM dial with TAP, time, key and mode, and new drum controls.
  - **FX:** effects in groups, plus GLITCH and the tape tricks.
  - **ORIGINAL:** hold it to hear the station without any mixing.
  - On a phone the sections become tabs. MIX remembers which ones are open.
- **Built for touch.** Every knob, fader and button is at least 44 px. Knobs drag up and down, with a fine mode, double-tap to reset and long-press. Faders have thick tracks and big thumbs. Dragging no longer scrolls the page.
- **A tidier layout:**
  - **Main panel:** only what a listener needs (SOUND, stations, Next, Station ID/break, Save, Volume, MIX).
  - **Looks:** skins, the display, meters and light colours now have their own drawer.
  - **Settings:** in dial order (General, then 88.1 → 108.0, then Instruments, Slack and Futureproofer). Sections fold away, the on-air station's section opens by itself, and "Songs in 3/4, 6/8…" moved under MDFM's music.
- **The style matrix, rebuilt.**
  - **Directions:** ten around a circle: rock, pop, dance, hip-hop, lo-fi, space (was galactic), orchestral (was classical), jazz, latin, country.
  - **Gentler at low settings:** low settings change the feel first, then the drums, then the keys, bass and lead. It no longer stacks a second copy of the band over the song.
  - **Tempo:** only moves above 50%, and only when the song is far from the style.
  - **In key, at a steady level:** melodies keep their shape and tuned percussion follows the key. Levels are matched, so nothing jumps or clips.
  - **CHAOS is now GLITCH**, an effect: at most one trick per bar, back on the next downbeat.
  - Saved mixes carry over.
- **New drum controls:** push/pull (ahead or behind the beat), ghost notes, accent, hat swing, hat density, and kick, snare and hat level, on every station with drums. They're off by default, and Save includes them.
- **A producer's pass on the sound** (MDFM, PTRN, CLUK and HEARYE):
  - **Melody:** lead notes no longer clash with the chord on the beat (21% of strong beats did, now none).
  - **Chords:** no accidental sour chords (6.8% → 0), and every mode keeps its signature chord.
  - **Register:** leads sit lower and sweeter (the typical top note went from about 2 kHz to about 600 Hz; notes above C6 from 55% to 8%), and the octave-up doubles are now soft panned doubles.
  - **Key changes:** only in genres where they belong, with the old key cut off cleanly.
  - **Low end:** the kick no longer pumps the melody, bass stays above 41 Hz, and the kick is tuned to the key.
  - **Master:** a de-harsh dip, a lighter top cut, gentler glue and a soft clip, so nothing clips any more.
  - **Instruments:** a smoother guitar, fiddle, whistle, FM bell, sax and shawm, and lead levels evened out.
  - **Character kept:** the phonk cowbell, G-funk whistle, 808 slides, the DJ set's chops, CLUK's grit and HEARYE's shawm and chant all stay.
- **PTRN 101.1 plays CLUK's genres:** a new "Big beat & electro" family with big beat, breakbeat, funky, acid and rave breaks, electro, electro house and hard house, in PTRN's own song form and blends.
- **Faster:**
  - **Save:** 2–5x faster (renders run in slices), and long pieces even more.
  - **Live:** about 35% less audio-thread work. Hi-hats, rides and crashes use pre-rendered metal, the organ is one waveform per note, panners and reverb sends are shared, and CLUK's instruments are lighter.
  - **Visuals:** they stop drawing when they're off screen.
  - The receiver patch for its own repo is in the 1.25 notes.
- **Fixed:**
  - Saved effects and style sounds weren't heard after a reload until a slider moved.
  - CLUK songs played at half length, and Lazer Hour raves could run into silence.
  - TUNE's key and mode moved vocal chops, lutes, flutes and timpani twice.
  - An empty custom-pack list said "undefined" and could freeze MDFM in a break.
  - Skipping during a crossfade skipped two songs.
  - A context suspended by the OS was never resumed.
  - Sports said "{score}".
  - HEARYE shows stopped coming back with three or fewer switched on.
  - PTRN and CLUK Save cut the end off when the tempo was pulled.
  - A failed voice line after a station change spoke over the new station.
  - Saved style matrices never came back on load.
  - Smaller fixes: stingers on the wrong station, fills under 3/4 and 6/8, and bad stored settings.
- The station code is now one registry (one entry per station). `createMDFM({station:"cluk"})` now starts on CLUK.
- WYBC's generator has one marked "MDFM patch" line for sliced Save renders.

## Apps: MDFM Radio 0.3.10 and MD Hub 0.2.10 (2026-10-15, Rob)
Security and robustness fixes from the Oct 15 apps audit (needs an app release). No MDFM content change.
- **MD Hub's radio bridge is pinned to the hub.** Only the hub artifact's own sandbox frame (`*.claudeusercontent.com`, under `claude.ai/artifact/<hub id>`) gets `window.mdfmApp`. Other chats' artifacts, or someone else's shared or published artifact opened inside MD Hub, no longer get live data, voices or settings; their radio uses canned lines. If claude.ai's addresses change so the hub page isn't recognisable as an artifact address, the bridge still works and the app logs a warning once. Details in `apps/hub/README.md`.
- **Location and notifications in MD Hub** are only given to the hub page, not to other sites, embedded frames or login pop-ups.
- **Pop-ups keep the rules:** MD Hub's login pop-ups and the Slack sign-in pop-ups can't open further windows or wander off to other sites (those open in the browser).
- **Voices:** at most 2 `say` runs at a time with a short queue (past it, a line uses the system voice); the same line asked for twice at once is rendered once; the voice cache is capped at 40 MB; `say`'s own `[[...]]` commands inside Slack posts or headlines are no longer acted on.
- **Downloads:** an update that stalls for a minute fails (and Download works again) instead of hanging until restart; the saved name is never decoded into a path.
- **Kept copies:** only the newest 2 downloaded MDFM content versions and receiver looks are kept (plus the bundled copy). One content check runs at a time.
- **Pre-releases** on GitHub are no longer offered as app updates. Mark a build as a full release when it should reach people.
- **Smaller fixes:** the radio app's bridge only answers its own window; settings fields are type-checked; answers from the network are size-capped (2 MB, 20 MB for content and looks); a new location refreshes weather and sports at most once a minute, and the same spot again does nothing; a missing latitude or longitude from the IP lookup or the Mac is no longer read as 0; PTLK headline refreshes don't pile up, a bad character in a feed no longer throws the feed away, and encyclopedia pages are capped (200 cached, 300 fetches a day); the Slack token, Slack config and Futureproofer state are written atomically, and a token that can't be stored fails the sign-in instead of the app.
- **Fixed:** the apps now keep the "meters" switch (songs in 3/4, 6/8, 5/4, 7/8) in their settings; it had been dropped since it was added to the shared list.
- `apps/slack-relay/.gitignore` ignores wrangler's local cache.

## 1.24.0 (2026-10-15, Rob)
- **New station: CLUK 92.3, Everything in the Chicken.** The whole universe is inside one enormous chicken, and this is its radio station.
  - **Music that rips:** big beat, breakbeat, funky breaks, acid breaks, rave breaks, electro, electro house and hard house, with new sounds: a distorted riff bass, an acid line, electro and rubbery electro-house basses, chicken-scratch guitar, horn and guitar stabs, rave piano, hard-house stabs and a soft laser in electro hooks. Songs run about two minutes with breakdowns and drops. In the apps, shouted station words are chopped into the songs like samples.
  - **Shows** (written by a writers' room, played without repeats): Lazer Hour with Ned (18 episodes, with raves and rescues of the President's daughter), The Gizzard Report, Wishbone Court, The Egg Question, Outside, Molt, Pecking Order, Down the Drumstick, Nest Egg and Pluck! (12 each). Each has its own theme, stingers, bed and outro.
  - **Between songs:** DJ Rhonda Pecks, the station voice Clark Featherstone, Rhonda's request line and 62 ads.
  - **Settings:** "What plays on CLUK 92.3": the genres, the shows, the request line, the ads and the DJs.
  - Save renders the song on air; shows, call-ins and ads save as recordings in the apps.
- **Fixed:** since 1.23.0, TUNE's key and swing skipped MDFM and PTRN songs (a line had slipped into a comment).
- New sound effects for shows: laser, gavel, whoosh, cheer, ding.
- MDFM 99.9 and PTRN sound exactly as before (seeded renders about -100 dB apart).

## 1.23.0 (2026-10-14, Rob)
- **More instruments on MDFM 99.9 and PTRN 101.1.** Each song now picks its drum kit and bass sound to suit its genre, and newer keys, leads and pads turn up some of the time:
  - **Drum kits:** the classic kit plus an 808 boom kit (long, deep kick; tight snare), a punchy kit (hard click, crisp snare, bright hats) and a dusty lo-fi kit (soft, dark, a little saturated).
  - **Bass:** the classic synth bass and 808 plus sub, FM and acid bass. Walking, reggae and country bass lines keep their own tone.
  - **Keys:** Wurlitzer. **Leads:** FM lead, square lead (with glide), vibraphone. **Pad:** a warm analog pad.
  - Levels matched against the classic sounds (kits within about 2.5 dB in the low end, sub bass a little weightier on purpose).
  - Now playing carries `kit` and `bassSound`.
- **Settings: Instruments on MDFM 99.9 and PTRN 101.1.** Every drum kit, bass, keys, lead and pad in the pool, with All / None per group, "Classic MDFM only" and "Everything". Each is marked **classic** (MDFM's line-up before 1.22), **PTRN** (came with PTRN in 1.22) or **new** (1.23). Anything off is swapped for one that's on (from the next song); a whole group off, and each genre plays its own. Saved on this device (`mdfmInstruments`). API: `instrumentList()`, `getInstruments()`, `setInstruments()`.
- **Less clap on MDFM 99.9 and PTRN 101.1.** The clap is about 4 dB quieter with a shorter tail and much less reverb (it was sitting on top of the mix). In every genre that claps, songs now vary: about 3 in 10 play a snare only, about 1 in 4 a snare with a soft clap under it, and the rest as the genre is written. PTRN's techno, trance and gospel lean on the snare, synthwave's gated snare has only a touch of clap, and the Style Matrix's pop pull claps more softly.
- **PTRN tags: clear voices only.** The vocoder and the robot voices (Zarvox, Trinoids, Fred, Ralph) are out of the tag pool; tags are echo throws, stutters, slowed, reversed or gated.

## 1.22.1 (2026-10-13, Rob)
- **A switch for MDFM's time signatures:** "Songs in 3/4, 6/8, 5/4, 7/8" in MDFM 99.9's Settings (on by default). Off, every song is in 4/4, the line-up from before 1.22 (`setTypes({ meters: false })`). PTRN's genres aren't affected.

## 1.22.0 (2026-10-13, Rob)
- **New station: PTRN 101.1 (PATTERN).** No default sound, no shows, no DJ: its Settings list 34 genres in seven families (each with All / None), and it plays simple, well-made procedural tracks in whichever are on.
  - Electronic: house, techno, trance, drum & bass, dubstep, UK garage, synthwave, chiptune. Hip-hop & R&B: boom bap, trap, drill, G-funk, R&B. Rock & pop: rock, punk, metal, indie pop, synth-pop. Jazz, funk & soul: swing jazz, bossa nova, funk, disco, blues, gospel. Latin & Caribbean: reggaeton, salsa, reggae, dancehall, afrobeats. Chill: lo-fi, trip-hop, ambient. Country & folk.
  - New parts for them: ride cymbal and brushes, walking and upright bass, tumbao, reggae and boogie bass lines, reese and wobble bass, slap bass, clavinet, nylon guitar, piano montuno, skanks, acoustic strums, chugging guitar, lead guitar, saxophone, harmonica, horns, 8-bit drums and arpeggios, 12-bar blues and ii-V-I changes.
  - Tracks are mixed one into the next over 4 to 8 bars with an equal-power blend (no dip), beat-matched when the tempos are close. Next track blends in on the next bar.
  - The only voice is tags: station IDs and drops on the beat (and TUNE's tempo). In the apps they're played like vocal samples: an echo throw, stuttered in, slowed down, reversed in, gated, or vocoded onto the chord. In a browser: the system voice on the downbeat with a chopped vocal stutter. Drop a tag fires one.
  - Save renders the track with its tags, as an MP3 and MIDI ("PTRN - artist - title (genre)").
- **TUNE: a new EFFECTS section** on every station and skin: echo, reverb, chorus, flange, phaser, warble, bitcrush, drive, a DJ filter (low-pass left, high-pass right), a stutter gate and a sidechain pump, plus TAPE STOP, SPIN BACK and ALL OFF. Echo, gate and pump follow the beat. Save includes them. All off is exactly as before (the effects aren't in the path).
- **MDFM 99.9: other time signatures.** About one song in four is in 3/4, 6/8, 5/4 or 7/8, picked to suit its genre, with drum patterns written for 3/4 and 6/8 (DJ sets stay in 4/4). 4/4 songs are exactly as before.
- **TUNE Groove & Key:** TIME has a 4/4 option (it takes a song in another time back to its 4/4 patterns). Swing, length, density, fills and drums each have a SONG button for the song's own; the sliders are now their own scale, so 0 is a real zero (swing straight, density bare, fills none, drums off). Saved settings carry over. The Song's own / Song's key / Song's scale choices show what's playing, like "Song's own (6/8)", "Song's key (E♭)", "Song's scale (dorian)" (`radio.songOwn()`). BPM has a SONG button too: on SONG the slider sits at the song's own tempo and shows it. In the TIME, KEY and MODE lists the song's own choice is marked "(song)".

## 1.21.0 (2026-10-13, Rob)
- **HEARYE's nature sounds are quieter.** The scenes sit 3 to 9 dB lower under the music (forest about 5 dB, mountain and heights 7 to 9 dB).
  - The wind, the static-y one that sounded like waves, is much softer and has its hiss rolled off.
  - Leaves, stream, rain, fire, tavern murmur and the low rumble are lower too. Birds, owls, bells and the other short sounds are unchanged.
- **New AMBIENCE dial in TUNE** for the background sounds under the music: HEARYE's forests, taverns and caves, WYBC's concert-hall room and MDFM's vinyl crackle.
  - All the way down turns them off; the middle is the station's own level; all the way up is about 8 dB louder.
  - It's saved with the other TUNE knobs, Reset puts it back in the middle, and Save includes it.
- At the default, MDFM and WYBC sound exactly as before.

## 1.20.0 (2026-10-13, Rob)
- **The radio page only promises what the app can do.** In apps that embed it without the MDFM Radio app's back end (Analyze Pics, for one), Connect Slack used to do nothing, and weather, sports and PTLK headlines were silently the made-up ones. Now:
  - It asks for live data only when the app provides `live()`, and says on the status line when the reports are made up.
  - It hides Connect Slack, the city and units fields, content updates, Futureproofer and the Bouncer log button when the app can't do them.
  - A failed Slack connect now says why.
- **It works with the app kit's new `mdfm-live` module** (kit 2.12.0), which gives any kit app real weather, local sports, PTLK headlines and Slack news with its own Bouncers. Its settings and status come through `liveSettings`, `liveStatus` and `onLiveStatus`.
- **Fixed:** after Connect Slack succeeded, the radio app's page threw on a missing checkbox.
- **MedDev Receiver 1.13.3.**
- The MDFM Radio app works the same as before.

## 1.19.0 (2026-10-13, Rob)
- **HEARYE bangerz:** pulling HEARYE 95.5 toward a style in the Style Matrix now brings in a full beat and a low end, following the piece's chords. HEARYE's pieces have no kit or bass of their own, so before this the matrix could only add hats and cymbals.
  - **Hip-hop:** an 808 on the root that slides between the kicks, with a trap half-time snare on faster pieces (about 100 BPM and up) and a boom-bap backbeat on slower ones.
  - **Pop:** four on the floor, claps, and a bouncy offbeat synth bass.
  - **Rock:** a driving kick and snare, plus eighth-note bass.
  - **Country:** a kick and snare, plus root–fifth bass.
  - **Galactic:** a pulse bass.
  - **Classical:** timpani and low strings.
- **How it plays:**
  - It builds with the piece: intros and outros get only the kick and bass.
  - It fits 3-beat and jig-feel pieces too.
  - Blends follow the matrix, the Groove & Key drum controls apply, and Save (MP3 and MIDI) includes it.
- **Hip-hop's lo-fi sound loses less level** at full pull (it was about 7 dB down), on every station.
- With every slider at zero, nothing changes.

## 1.18.1 (2026-10-13, Rob)
- **MedDev Receiver 1.13.2:** the spray can shows its BUG SPRAY / SUGAR MIST label again when there's no room beside the radio (it had tucked out to just its tip), without covering anything clickable.

## 1.18.0 (2026-10-13, Rob)
- **Save also writes a MIDI file of the song**, for a DAW or notation program. It goes next to the MP3 with the same name.
  - **What's in it:** the notes exactly as they were rendered, after the Style Matrix and Groove & Key (the key, mode, tempo, time signature, swing, density and fills all carry over).
  - **Tracks:** one track per part: drums on channel 10 with General MIDI drum notes, then bass, chords, pad and lead (plus timpani on HEARYE). On WYBC: piano, strings and winds, plus the matrix's rhythm section when it's up.
  - **Also included:** the tempo, time signature and title, with a General MIDI instrument picked for each track.
  - **Works on** MDFM 99.9, HEARYE 95.5 pieces and WYBC 88.1. Shows and breaks still save as MP3 only.
- **Where it lands:**
  - In the MDFM Radio app: beside the MP3, from the same Save dialog. This needs the app rebuilt; an older app saves just the MP3 and says so.
  - On claude.ai pages: inside the same .zip.
  - In a browser: as a second download.
- **Under the hood:**
  - A small recorder around every instrument call. When nothing is being saved it's skipped entirely, so the sound is unchanged.
  - Three more marked "MDFM patch" lines in the WYBC generator report each piano, string and wind note.
  - `renderSong()` returns `midi` (Uint8Array, Standard MIDI File format 1, 480 PPQ). `MDFM.savedText(result)` gives the status line.
- **App (apps/radio):** the save-file bridge passes the MIDI along as an extra, and `mid` is an allowed type.

## 1.17.2 (2026-10-13, Rob)
- **TUNE resets all the way back:** with every Style Matrix point at the centre, the station sound stage (drive, lo-fi, hall, phaser and so on) fades out and is taken out of the path again, so the music is bit for bit as it was before tuning (it used to stay in, at zero). Any key jump CHAOS left hanging is cleared too.
- **RESET** (by the knobs) now puts everything back for the station on air: the knobs, its Style Matrix and its Groove & Key. ZERO and the groove's RESET still do just their own part.
- **Snapping:** a matrix point dragged to within 4% of the centre snaps to it, and the groove sliders snap to their defaults within 2%.
- **Checked:** on every station, tuning everything and then resetting renders the same as never tuning (−100 to −107 dB).
- **Note:** a song or piece that started while LENGTH was changed keeps that length; the next one is back to normal.

## 1.17.1 (2026-10-13, Rob)
- **HEARYE 95.5's music is back to its 1.15 sound:** the fantasy instruments on their own, at their original tempos, meters and scales, without the 1.16 pop, gothic and epic layers. Pieces render the same as in 1.15, sample for sample. To lean it toward pop now, use the Style Matrix.
- **Kept from 1.16 and 1.17:**
  - Titles don't repeat a word.
  - The quieter music under talk (the same level as 1.17).
  - The extra instruments that the matrix and the groove use.
- **Groove & Key:** a time signature isn't applied to HEARYE's 3-beat or triplet-feel pieces, which keep their own.

## 1.17.0 (2026-10-13, Rob)
- **Style Matrix in TUNE.** A radar chart under the sound knobs with seven axes: Pop, Hip-hop, Rock, Classical, Country, Galactic Cosmotosis and CHAOS. The song on air sits in the middle. Drag out toward a style (or tab to a point and use the arrow keys) to pull the song that way; double-click a point to reset it, and ZERO clears the station. Each station keeps its own mix (localStorage `mdfmStyleMix`).
- **Pulling, not layering.** The song keeps its own notes, chords, melody, bass line, rhythm and form. What changes:
  - **Instruments:** they're played the style's way (piano chords become power chords, strings, an acoustic strum, Rhodes, plucks or a cosmic pad; kicks become a rock kick, timpani, a laser hit and so on).
  - **Groove:** half-time snares and hat rolls for hip-hop, straight eighths for rock, a shaker-and-snap pocket for country, no kit for classical.
  - **Tempo and swing:** they move toward the style's. Tempos multiply when several axes are pulled.
  - **Station sound:** drive, lo-fi, a concert hall, brightness, or a phaser and echo.
- **Combining axes:** they blend by how far each is pulled. Past 100% in total, the song's own instruments are gone and the styles share the sound.
- **CHAOS** isn't a direction: notes jump, instruments swap at random, plus stutters, tape stops, gate chops, key changes and sound effects. The higher it's pulled, the worse it gets.
- **Country** is modern country radio: a big kit with claps, acoustic strum over palm-muted electric, banjo rolls, Telecaster twang and pedal steel, about 104 BPM.
- **Every station:**
  - MDFM 99.9 and HEARYE 95.5 are pulled note by note.
  - PTLK's show music is pulled too.
  - WYBC is pulled through the piano generator's own controls (pace, busyness, strings, winds, warmth, space), with a rhythm section in the style that follows the piano's chord. This needs one marked "MDFM patch" line in `vendor/ambient-soundtrack`, which exposes the chord.
- **Save matches what's on air** with the matrix up, on MDFM, HEARYE and WYBC: the pulled instruments, groove and tempo, and the station sound too (drive, lo-fi, hall, slapback, brightness, phaser and echo). A WYBC save now goes through the whole chain like the others (TUNE and EQ included), with the matrix's pull and rhythm section. For that, the WYBC generator has a second marked "MDFM patch" line that reports each chord as it's laid out.
- **Every point at the centre:** nothing is rerouted, and every station sounds exactly as before (MDFM checked sample for sample).
- **HEARYE:** the music under shows, ads and call-ins is about 6 dB quieter. The piece dips further under the bard, and the ambience drops lower during talk.
- API: `styleMixKeys()`, `getStyleMix(id)`, `setStyleMix(values, id)`, `resetStyleMix(id)`. `mountTune` takes an optional `mixStore`.
- **Groove & Key in TUNE**, beside the matrix, per station. Every control's default is the song as written, and Save takes all of it.
  - **Tempo and time:**
    - BPM: 40–220.
    - Time signature: the song's 4/4, or 3/4, 6/8, 5/4, 7/8, 7/4.
    - Swing: straight to heavy.
    - Length: 0.5× to 3×, from the next song or piece.
  - **Key and mode:** any of the 12 keys and 19 scales. Notes move by scale degree, so chords and melodies keep their shape.
  - **Drums:**
    - Density: sparse to busy (extra hats, ghost snares and kicks).
    - Fills: none to a fill every few bars.
    - Feel: half, normal or double time.
    - Humanize: timing and touch.
    - Drum level: off to +6 dB.
  - **Where it applies:** MDFM, HEARYE and PTLK's show music. On WYBC: the tempo, key and swing, and the drum controls on the matrix's rhythm section (no time signature). HEARYE's triplet-feel styles keep their own time signature.
  - **Now playing and saved files** show the new BPM, key and time signature.
  - A third marked "MDFM patch" line in the WYBC generator lets MDFM move its notes into the chosen key.
  - API: `grooveKeys()`, `keyModes()`, `meters()`, `grooveSupport(id)`, `getGroove(id)`, `setGroove(values, id)`, `resetGroove(id)`. `mountTune` takes an optional `grooveStore`.

## 1.16.0 (2026-10-13, Rob)
- **HEARYE 95.5's music leans about 60% toward gothic pop, fantasy pop and epic fantasy action scores.** The fantasy instruments still carry the tunes. Underneath them:
  - **Fantasy pop** (elven, halfling, tavern, procession, herald): a pop kit, a bouncy synth bass, bright synth pads and plucked synth arpeggios, with side-chain pumping.
  - **Gothic pop** (wizards' council, bard's lament, and a half-time den of evil): dark pads, a driving eighth-note synth bass and a big reverb snare.
  - **Epic action score** (battle orders, glorious battle, plus some on the herald, evil and procession): trailer drums, a pulsing synth, braams and impacts.
- **Every style:**
  - A riser and a snare build go into each new section, and an impact lands where the full band comes in.
  - Pieces build like pop songs: a quiet intro, a fuller first section, then the full beat.
  - Slower styles moved to pop tempos, and elven ambience moved from 3/4 to 4/4.
- **Show music:** show themes and outros pick up the new sound. The beds under talk get a soft synth pad but no drums.
- **Level:** still about 3 dB under MDFM.
- Piece titles no longer repeat a word ("Lantern of the Lantern Moon").
- MDFM 99.9 sounds exactly as before (checked sample for sample). Other stations are unchanged.

## 1.15.0 (2026-10-13, Rob)
- **A fourth station: HEARYE 95.5, Renn Faire Radio, the Home of High Drama.** Between WYBC 88.1 and MDFM 99.9 on the dial.
  - **Music:** procedural high-fantasy pieces in ten styles: elven ambience, halfling party, tavern jig, the wizards' council, den of evil, angelic herald, battle orders, glorious battle, bard's lament and royal procession.
    - Instruments: harps, lutes, flutes and tin whistles, fiddles, strings, horns, brass, a church organ, Gregorian chant, battle drums, frame drums and tambourines.
    - Each piece gets a made-up title and players, and grows from a quiet start to the full band over two or three minutes.
  - **Ambience:** forest, meadow, mountain, cave, tavern or fireside sounds play under every piece and fade back as the music fills in.
  - **Hosts:** a royal crier for station IDs, a bard who introduces and back-announces the pieces and takes call-ins, and a herald who reads the realm news. In the apps, that's the Slack company news rewritten into the old tongue ("thou art", "hath", "the council this day"). Elsewhere it's made-up proclamations.
  - **Between pieces:**
    - Seven scripted shows with 15 or 16 written episodes each, and no repeats until every episode has aired: Why Dost Thou Clappest, Doug?, The Cauldron of Dark Desire, Hot Grog Sticky Gruel, Pestilence Today, Don't Quest-ion It, One Star Quest and Hoard and Order.
    - Jousting matches and royal pony pageants, written live with play-by-play, scores and post-match interviews.
    - Ads (68 written, plus more assembled from parts) and call-ins to the bard.
  - **Show music:** every show, ad and ID has its style's theme, a soft bed under the talk, stingers and a closing cadence.
  - **Settings:** "What plays on HEARYE 95.5" has a switch for every show and segment, plus the ambience.
  - **Buttons and Save:** Next piece moves on, and Station ID brings the crier in. Save renders the piece on air again from the top (named "HEARYE - players - title (style)"). During a show, an ad or a call-in, Save records the whole segment in the apps.
  - **Level:** about 3 dB under MDFM.
- MDFM 99.9 sounds exactly as before (checked sample for sample). WYBC and PTLK are unchanged. New tests: `test/faire.test.mjs`, and the smoke test now tunes to HEARYE.

## 1.14.1 (2026-10-13, Rob)
- **Music plays on iPhone and iPad with the ring/silent switch on silent.** iOS treats web-page audio as "ambient" sound, so the silent switch muted the music while the voices (system speech) kept playing. Pressing SOUND now asks iOS for "playback" audio (Safari 17+) and keeps a silent audio element playing (older iOS), so the station plays like a music app. Only on iOS; nothing changes anywhere else (MDFM checked sample for sample).

## 1.14.0 (2026-10-13, Rob)
- **PTLK shows have music.** Every show opens with its own theme, which carries on softly under the host's first lines and comes back under the sign-off, plus stingers at every segment break and a closing hit. Most are newsy and high-energy (brass hits, ticker beeps, drum fills, timpani); The Real USB Drives of Cleverly Spillz is West Coast and urban (G-funk whistle, 808, Rhodes), Button Mashers is high-tech (chip arpeggios, zaps, power-ups), Ask a Retired Wizard is medieval fantasy (lute, recorder, drone, harp), The Long Look is gentle piano, Overnight Shipping is noir. Station IDs get a news sting.
- **More variety in every PTLK show.** Each show now has three or four formats and never runs the same one twice in a row: Doug does a listing, a live open house, a family meeting or a lightning round; Analyze Biz does a rundown, a lightning round with Gregg's Word of the Day, listener portfolios or bull versus bear; Cleverly Spillz has a party, a reunion special and a girls' trip; Button Mashers has headlines, a box art review, a call-in help line and a Jersey versus Boston tournament; The Long Look has letters, a day in the life and a wait in the hide with Pip; Lost & Found has callers, the front-desk bin and the lost items calling in; The Committee has a meeting, an emergency session and an election; Overnight Shipping sometimes opens mid-scene and Dolores radios in; the wizard takes calls, teaches the spell of the week, gets corrected by his old apprentice or reviews a modern gadget.
- **No more repeated show descriptions.** The announcer names the show and only sometimes adds a line about it, from several per show, never the same one twice running, and the hosts never repeat it.
- **Callers on the phone line are no longer loud, on every station.** The phone effect made callers 8 to 16 dB louder than the host; now they sit a couple of dB under.
- **Easy-to-understand voices everywhere.** The singing, bubbling and warbling system voices (Good News, Bad News, Cellos, Bubbles and the like) are only used where the voice is the joke (the whisper DJ); everyone else gets a clear everyday voice, at close to natural pitch and pace. Robot voices stay: they're MDFM's brand. MDFM 99.9's music sounds exactly as before (checked sample for sample).

## Apps: MDFM Radio 0.3.9 and MD Hub 0.2.9 (2026-10-12, Rob)
- **PTLK headlines come from news feeds now.** Even fetched in the background, GDELT took 8 to 11 seconds and kept answering "please slow down" (measured from Rob's Mac). Analyze Biz now reads NPR and BBC business headlines and Button Mashers reads GameSpot's game news, from their public RSS feeds, which answer in well under a second. GDELT stays as the backup if the feeds come back with fewer than three usable headlines. Headlines keep their source ("from NPR", "from GameSpot").
- Headlines with £, € and accented letters are no longer thrown out. New Bouncer rule "ptlk-news-feeds" (only those three feed addresses).

## Apps: MDFM Radio 0.3.8 and MD Hub 0.2.8 (2026-10-12, Rob)
- **PTLK's live headlines actually arrive.** GDELT (the headline source) allows one request every 5 seconds per internet connection and takes 3 to 10 seconds to answer; asked at show time, it either answered "please slow down" or took longer than the show would wait, so Analyze Biz and Button Mashers fell back to made-up headlines. Now the apps fetch business and gaming headlines in the background at launch and every 30 minutes, one at a time and 6 seconds apart (retrying once after a "slow down"), and a show gets the saved list instantly.
- Wikipedia requests for The Long Look name the app properly (Wikimedia's user-agent rule), so they aren't turned away.
- Not a Bouncer problem: the rules allowed every one of these requests.

## Apps: MDFM Radio 0.3.7 and MD Hub 0.2.7 (2026-10-12, Rob)
- **Download downloads.** When a newer app is out, Download (in Settings, the Futureproofer list, or MD Hub's "is available" box) now fetches the .dmg for this Mac's chip straight into the Downloads folder, with progress on the Dock icon, and opens it in Finder ready to drag into Applications. No browser and no releases page. If it can't, it offers the download page instead.
- Only the mdfm repo's release .dmg files, over https, following GitHub's redirect to its file host; every hop goes through Bouncer (new rule "app-update-download"). Nothing installs by itself.
- No MDFM content change.

## 1.13.0 (2026-10-12, Rob)
- **A third station: PTLK 108.0, all talk.** Every show is written as it airs (`src/talk.js`), from big enough pools of names, places, plots and jokes that an episode never repeats, with running storylines that carry on from one episode to the next. Shows, each with its own switch in "What plays on PTLK 108.0":
  - **Clap Attack with Doug:** real estate is a family business, and Doug didn't come to make friends. A listing of the hour with one flaw, callers who accidentally buy houses, his mother Barb, cousin Trent, and a feud with rival agent Sheila Vance that escalates every episode.
  - **Analyze Biz:** Squirky Tallume and Gregg Ploptz read three to five business headlines, then roast, analyze or plainly misunderstand them, with Gregg's Gut Check.
  - **The Real USB Drives of Cleverly Spillz:** the drama is real, the data has been forged. A drive turns up at a party, accusations fly, confessionals, and Rodney from the help kiosk proves the files were faked.
  - **Button Mashers:** Sal from Jersey and Kev from Boston read gaming headlines. They love video games. They've never played one.
  - **The Long Look:** a slow nature documentary about one animal: true facts (read from Wikipedia in the apps), a slow pan, and letters the animal may or may not have written.
  - Four more: **Lost & Found Live** (callers reunited with each other's things, and a ticking box), **The Committee** (an HOA meeting; Ron's mailbox keeps growing), **Overnight Shipping** (a noir serial at a sorting hub, a chapter per episode, with Big Lou the forklift and a mole in Returns who is an air fryer) and **Ask a Retired Wizard** (spells for modern problems, and the side effects).
- An announcer and the organ between shows. On PTLK the buttons read **Next show** and **Station ID** (an ID cuts in between lines, then the show carries on). Every show has its own voices, with callers on a phone line; captions name who's talking.
- **Live headlines in the apps:** the MDFM Radio app (0.3.6) and MD Hub (0.2.6) fetch business and gaming headlines (GDELT) and animal summaries (Wikipedia), filtered (no tragedies, crime or illness) and cached, under new Bouncer rules. Everywhere else, and whenever the news is slow, the shows write their own with made-up companies and games. The hosts read each real headline straight first and joke about the situation, never about named people.
- **Save on PTLK** (in the apps) records the whole show as an MP3: "PTLK - <show> - <episode>.mp3", artist = the hosts.
- **MDFM Radio 0.3.6:** content updates up to 16 MB are accepted (the page with every skin had grown past the old 8 MB check, so MDFM 1.12.1 content was being turned away).
- MedDev Receiver 1.13.1 built in: the spray can no longer sits on the header buttons in browser windows too narrow for it to rest beside the radio (about 800 to 1350 px wide), where it covered Station break / Station ID and took its clicks.
- Stations now switch through one path (leave the old station, enter the new one), so adding the next station is a few lines. MDFM 99.9 and WYBC 88.1 sound exactly as before (MDFM checked sample for sample).

## 1.12.1 (2026-10-12, Rob)
- **Layout fixes on the radio page:**
  - The station panel lost its spacing in 1.11.0: the new button row reused the station row's class name, which pushed the station controls to the right and opened big gaps. Fixed.
  - The station name stays on one line and sizes itself to the screen in every skin (some skins' fonts broke "MDFM 99.9 HD" over two lines).
  - On narrow headers the switches, floppy, arrows and text buttons share one row, and the analyzer runs full width underneath.
- MedDev Receiver 1.13.0 built in (the layout pass: LEDs beside their buttons, the header adapts to wide skin frames, the spray can rests beside the radio). Content update.

## 1.12.0 (2026-10-12, Rob)
- **TUNE: a sound-tuning pop-out.** A TUNE button next to SOUND and EQ opens a skinned panel of knobs. Every knob at its start mark is MDFM exactly as it sounded before (checked sample for sample), so nothing changes until someone turns something:
  - **Realism:** speakers in a real room, a little glue, air and low-end tightening.
  - **Soundstage:** mono through to wide (the middle is as it is now).
  - **Clarity:** less mud, more presence and air.
  - **Warmth:** rich, warm tape and console colour.
  - **Room**, with a room picker (studio, car, living room, club, concert hall): how much of that room you hear. The car adds cabin bass gain, a boxy middle and soft, damped highs.
  - **Trunk rattle:** loose panels buzzing, only when a song's sub bass pushes hard.
  - **Radio grain:** hiss, the odd crackle, a narrower band and a little flutter.
- **Presets:** MDFM (as it is), Rich and warm, Car stereo, Late-night AM, Club PA, Living room and Concert hall; turning any knob makes it Custom. RESET goes back to MDFM as it is; double-clicking a knob resets just that one. Knobs work by dragging, scrolling and the arrow keys. The settings are remembered on this device.
- **WYBC gets a whisper DJ.** WYBC's station IDs are now a whisper DJ who leans in every 15 to 20 minutes and whispers about the station, the time, or what just played ("That was Night Ferry, by Rafe Solberg."). It uses the Mac's Whisper voice (rendered through the volume and EQ in the MDFM Radio app); computers without one get a soft, slow voice instead. The piano dips under it. In Settings the switch is now "The whisper DJ".
- Tuning applies to both stations, the voices and Save. Engine: `setSound()`, `getSound()`, `resetSound()`, `soundDefaults()`, `soundPresets()`, `rooms()` and `createMDFM({ sound })`.
- Ideas from Collin: a wider soundstage, more clarity, a car interior with a hint of trunk rattle, a bit of radio grain; rich, enveloping and warm.

## 1.11.0 (2026-10-12, Rob)
- **A second station: WYBC 88.1.** Collin's ambient piano generator (from his "Where Ya Been, Collin?!" map) is now its own station: a soft, warm piano piece composed live, with light strings, the odd bass clarinet or bassoon, room tone, tape grain and far-off concert-hall sounds. No ads, shows or news, just a quiet station ID every 15 to 20 minutes. It plays through the same volume, EQ, meters and visualizer.
- **Station arrows** (◀ ▶) on the lower row with Next song and Station break switch between WYBC 88.1 and MDFM 99.9 HD, live or before tuning in. The display shows the station; on WYBC the buttons read Next piece (a new piece, crossfaded) and Station ID. The choice is remembered on this device.
- **Each station has its own "What plays" section** in Settings: MDFM's is now "What plays between songs on MDFM 99.9"; WYBC's has quiet station IDs, light strings, bass clarinet and bassoon, concert-hall sounds, and room tone and tape grain (the piano always plays). WYBC's switches are remembered on this device.
- **Every piece gets a made-up artist** (a name, a trio or quartet, or an ensemble), shown as it plays: it's procedural music, so the players are procedural too.
- **Save on WYBC** renders a fresh 2½-minute performance (off the live audio) and saves it as an MP3: "WYBC - <artist> - <piece> (ambient piano)", tagged with that artist and the album WYBC 88.1.
- Engine: `stations()`, `getStation()`, `setStation(id)`, `nextStation()`, `prevStation()`, `stationTypeList(id)`, `getStationTypes(id)`, `setStationTypes(id, t)` and a `station` event; `createMDFM({ station })` picks the starting station. Pages that don't use them stay on MDFM 99.9 as before.
- Collin's generator is in `vendor/ambient-soundtrack`, unchanged except one line: it no longer suspends an audio context the host owns.

## 1.10.6 (2026-10-12, Rob)
- **`dist/manifest.json`:** the build now writes a manifest (version, receiver version, path and sha256 of the engine and the radio page parts). The app kit's live MDFM updater (kit 2.2.0) reads it so kit apps get new radio content without a new build. No change to the radio itself.
- **The floppy saves what's on top.** During a show, weather, sports, news, an interview, a caller, an ad or a station ID, Save records the whole break (from its opening sting until the music is back, even if you press it halfway) and saves it as an MP3 named after the show and episode when it ends. Between breaks it saves the song, as before. Shows save in the MDFM Radio app, where the voices play through the station; in a browser the voices are the computer's own speech and can't be recorded, so it saves the song instead and says so.
- **No more silent radio after sleep or a speaker change.** If the station's audio clock hasn't started a moment after SOUND is turned on (macOS can leave it stuck after the Mac sleeps or the headphones/speakers change), the radio quietly starts a fresh audio engine. It also checks when audio devices change. If the speakers still can't be reached it says so on the screen.
- `radio.onAir()` and `radio.recordBreak()` for apps that add their own save button (the app kit's `KitSave.attachSong` picks this up through `MDFM.saveSong`).

## 1.10.5 (2026-10-12, Rob)
- **Save song (the floppy):** a floppy button next to Next song saves the song that's playing as an MP3: rendered again from the top (off the live audio, so it keeps playing), encoded at 192 kbps with title, style, BPM and key tags. MDFM Radio 0.3.5 asks where to save it (Music/MDFM by default; needs an app release; 0.3.4 and earlier get a normal download). On claude.ai pages (the hub, the phone page) the MP3 arrives inside a .zip, the only way those pages may hand out audio. The encoder is lamejs 1.2.1 (LGPL-3.0), kept in `vendor/lamejs`. New in the package: `radio.renderSong()`, `MDFM.saveSong()`, `MDFM.encodeMp3()`, `MDFM.saveBytes()`, `MDFM.zipFiles()`.

## 1.10.4 (2026-10-12, Rob)
- **"Now playing" knows what was rolled:** besides the title, style and BPM, each song now reports its key and scale, swing, chord progression, song form, length in bars and the instruments it was given (`nowPlaying()` and the `nowplaying` event; new fields only). The MDFM product page uses them for its "a song being written" card.
- **Fix:** asking for an interview or a call-in on demand (`spotNow("interview")` / `spotNow("caller")`) picked no lines and ended the break in silence. They now pick a guest or a caller like the regular breaks do.
- **Guitar sits back in the mix:** the distorted guitar (Emo Dance Pop, and some pop songs) is about 8 dB quieter. It was louder than the drums, bass and vocals put together.
- MedDev Receiver 1.11.1 built in. Content update.

## 1.10.3 (2026-10-12, Rob)
- **Drag the apps by a skin's top too:** in MDFM Radio, pressing on the parts a skin draws above or beside the receiver (Slouch from the Dead's theatre, Clara Stamford's cabinets) moves the window, like the metal does. Before, only presses inside the receiver did. Content update.

## 1.10.2 (2026-10-11, Rob)
- **MDFM Radio 0.3.4 / MD Hub 0.2.5: a restart is all it takes** (needs an app release). At every launch the apps check for new MDFM content and a new receiver look before the window opens (up to 5 seconds), so new skins and shows appear on that launch. Before, the check ran 25 seconds in and at most every 6 hours, and what it found only showed after another launch or Cmd+R. Anything that arrives in the first 90 seconds reloads the window by itself; later in a session it still waits for the next launch, so music that's playing isn't cut off. The look's downloads get 30 seconds instead of 8 (skins.json is ~6 MB).

## 1.10.1 (2026-10-11, Rob)
- **`radio.setDuck(level)`** (0 to 1): ducks the whole station, music and DJ, with a quick fade down and a gentler fade back. MedDev Receiver 1.11.0's skin actors use it: spoken lines duck to 12%, sung lines (♪) to silence.
- **MedDev Receiver 1.11.0 built in:** the new Slouch from the Dead: The Musical skin and its five-scene stage play. Content update.

## 1.10.0 (2026-10-11, Rob)
- **Five new genres in the mix** (17 in all), each with its own new sounds:
  - **Gothic Dance Pop:** four on the floor, a church organ and a dark choir, a pumping octave bass, huge snares and a crash every other bar in the hook.
  - **Pop Ballad:** slow, with broken piano chords, strings and a sung lead. The drums only come in for the hooks. Ballads come up about half as often as other genres.
  - **Alt Dance Pop:** syncopated four on the floor, plucked arpeggios, snaps, an eighth-note bass and a sung lead.
  - **Emo Dance Pop:** about 150 BPM, distorted guitar power chords (palm-muted in the verses, open in the hooks), crashes and a sung lead.
  - **Avant DJ Set:** a four-minute continuous mix. Two "tracks" blend in the middle (a filter sweep, a riser and a new groove a fourth or fifth away), with vocal chops, stutters, reversed swells and echo throws. In MDFM Radio and MD Hub it also chops up real words the Mac's voices say ("synergy", "per my last email", "show pony"), pitched like a sampler.
- **New instruments:** a sung synth voice (vowel formants and vibrato, used as a lead in the pop genres), vocal chops, and a distorted guitar with one amp per song so busy parts stay light. Each new genre was checked for CPU (about the same as the hip-hop genres) and level.
- Content update; no app release needed.

## 1.9.8 (2026-10-11, Rob)
- **Voices work on iPhone and iPad.** Safari there only lets a page start speech from a tap, so the voices never played in the browser version. Pressing SOUND now speaks one silent line, which unlocks speech for the rest of the visit, and the engine no longer cancels speech right before each line (iPhone dropped the line when it did). Content update; the desktop apps use their own voices and aren't affected.

## 1.9.7 (2026-10-11, Rob)
- **MDFM Radio 0.3.3 / MD Hub 0.2.4 are on the RentVision app kit 2.0.0** (needs an app release). Each app's `kit/` now holds Bouncer 2.0.0 and Futureproofer 2.0.0 installed by the kit's `install/add.mjs`, with exact versions in `kit/kit.lock.json`. Picks up Collin's review: `scheme`, `pathLower` and `searchLower` in the rule context, safe URL decoding, failed checks keep the last good check time and retry after 30 minutes, a cheaper log check, and a generic badge. Rules that don't match their lock now block in observe too (the hub page's observe Bouncer included). Rules and locks unchanged; Cedar stays pinned at 4.13.0.
- `apps/common/axmod-settings.js` stays as the apps' copy of the kit's `axmod/settings.js` (same code). This repo is where the kit's `receiver`, `axmod` and `mdfm` modules come from, so those aren't installed back into the apps.
- Includes the 1.9.4/1.9.6 app changes (window fits the screen, show switches remembered) if 0.3.2 / 0.2.3 weren't released.

## 1.9.6 (2026-10-11, Rob)
- **Three new shows** (content update; each can be switched off in Settings):
  - **Show Ponies**, a fully generated serial. Each season is a made-up circuit with six ponies (names, owners, handlers, hometowns and a quirk each), three judges and five episodes: four classes picked from Halter, Trail, Costume, Pleasure Driving, Jumpers, Freestyle to Music and Showmanship, then a double-points Supreme Champion finale. Announcer Pembroke Vance and colour commentator Darlene Tuttle call each run, the judges score it, owners sometimes complain on air, points carry over, and each episode opens with a recap of the last one. The season is saved, so the story carries on between launches; after the finale a new season starts with new ponies.
  - **Fixer Downer, with Gary Voss**: five episodes of unfortunate home repair (a squeaky door, one shelf, a small drip, a ceiling fan, a deck).
  - **Gasket Case, with Hal and Vern Pruitt**: five episodes of two old brothers taking calls about broken cars. Callers sound like they're on the phone (cast members can now have `phone: true`).
- New sound cues for shows: hammer, drill, crash and crank (an engine that won't start).
- MDFM Radio / MD Hub keep the new on/off switches in their saved settings (needs an app release; until then the switches still work in the page, they just aren't remembered by the older apps).

## 1.9.5 (2026-10-11, Rob)
- MedDev Receiver 1.10.4 built in: the light-colour knobs only re-colour Clara Stamford's embroidered screens instead of blacking them out, Clara's props are redrawn, and House of Spoons has no half spoons.

## 1.9.4 (2026-10-11, Rob)
- **Scrolling no longer gets stuck in MDFM Radio** (mostly seen in the Default skin). Default still marked the receiver, its title bar and its screens as macOS drag regions, which swallow scrolling and sometimes the mouse-up, so the window could stay stuck to the cursor until you clicked a few times. No skin uses CSS drag regions now; the receiver is dragged by its metal in `skin/radio-wire.js`, and any mouse move or scroll with the button up ends a drag. Reaches installed apps as a content update.
- **Top of the receiver cut off:** if the receiver fits its window it is never left scrolled part-way down (checked on resize, focus and when the window is shown again). Content update.
- **MDFM Radio 0.3.2 / MD Hub 0.2.3 (needs an app release):** a window that ends up taller than the screen it's on (a smaller display, the Dock growing) is shrunk so its top stays reachable, and the on-screen check also runs when a display is added or changes resolution and when the window is shown.
- **Settings text follows the skin:** the settings labels, hints and window-button captions use the receiver's new `--label`, `--hint` and `--etch` settings, so light skins (Q3 Reconciliation, Clara Stamford) keep them readable. MedDev Receiver 1.10.3 built in.

## 1.9.3 (2026-10-11, Rob)
- **Drag by the metal works again in MDFM Radio.** Since 1.9.0, AXMOD gives the receiver `tabindex="-1"` (the skip-link target), and the drag check counted anything with a tabindex as a control, so no press could start a drag. Elements with a negative tabindex no longer count as controls. Reaches installed apps as a content update.

## 1.9.2 (2026-10-11, Rob)
- **Bug-hunt fixes** (details in the project doc `claude/mdfm-bughunt-2026-10-11.md`). MedDev Receiver 1.10.2 built in.
- **Engine:** a failed weather, sports or news lookup can no longer leave the station music-only for good; stop/quick start during a break no longer leaves the old break talking; the hourly news isn't skipped when a long break runs over the hour; voice drops play when every other talk type is off; noise bursts loop, so risers, crashes and play sound effects run their full length; no more "undefined"/"NaN" spoken in edge cases.
- **MDFM Radio 0.3.1 / MD Hub 0.2.2:** Bouncer no longer hangs on addresses with a broken %-escape; a refused Connect Slack no longer sticks; the 15-minute weather refresh really runs every 15 minutes; one drag listener instead of one per drag; closing an older Slack setup wizard no longer breaks a newer one; content-update versions must be plain x.y.z.

## 1.9.1 (2026-10-11, Rob)
- **MD Hub 0.2.1:** the hub page inside MD Hub now gets every skin and the newest look the app has, built in or downloaded. Before, it only got them after a download, so a fresh install showed Business Lightning and House of Spoons as Default until the hub artifact was republished. The page still takes a look only when it's newer than its own.

## 1.9.0 (2026-10-11, Rob)
- **AXMOD accessibility in every MDFM receiver** (MedDev Receiver 1.7.1 built in). The radio page's Settings has an ACCESSIBILITY button, and Cmd+Option+A opens it anywhere. The AXMOD drawer is styled by the current skin.
  - The radio is wired to it: sound captions for every voice and song, text versions of the EQ and VU meters, and Calm mode mutes the voice drops between songs.
- **MDFM Radio 0.3.0:** AXMOD choices are saved with the app's settings. The radio page allows AXMOD's built-in reading fonts. It also includes 0.2.9's keep-the-window-on-screen fix.
- **MD Hub 0.2.0:** an Accessibility section in the frame's Settings. The frame now runs the receiver's code (with no flies or spray can on the frame). The hub page and the frame share one set of AXMOD choices through the app, and the hub page steps aside while the drawer is open. Includes 0.1.5's on-screen fix.
- Shared `apps/common/axmod-settings.js` keeps only small, plain AXMOD values.

## 1.8.1 (2026-10-11, Rob)
- **Workplace pass on show content.** The silly names stay (Sweaty Buns, Moist Loaf, Thicke Gravy), but every line that pushed them into innuendo is gone.
  - Simmer Down: the glaze bits in "Holiday baking" are out. "Snacks for the long winter" is now Fuddle's Forever Fudge, and "Party appetizers" is now Gus Gristle's Mystery Bites. "Comfort food" and "Breakfast" lost their suggestive closers.
  - Funnelball: wet/damp double meanings and "two balls" swapped for soggy/ponchos. Surname list cleaned.
  - The Apex Grind is unchanged.

## 1.8.0 (2026-10-11, Rob)
- **New shows** (each can be switched off under "What plays between songs"):
  - **The Apex Grind with Brayden Kolt:** a hustle-bro podcast where Brayden commits to a bit and will not let it go. Five episodes.
  - **Simmer Down:** a very calm public-radio cooking show whose guests' recipes have unfortunate names. Five episodes.
  - **Funnelball:** sportscasts for a made-up sport. Every broadcast is generated: teams, players, plays, scores and commentary.
- **MedDev Tech News on the half hour:** about a minute on what changed in the hub's automations in the past week, one item per automation. It plays wherever the radio can read the hub (the hub page and MD Hub). Pages pass `techNews: async () => ({ items })`.
- Receiver 1.4.0 built in (Mulchmaster, Barnaclava and Analyze Pics skins).

## 1.7.3 (2026-10-10, Rob)
- The receiver screen now says "Press the SOUND button to tune in." (it used to say "Press the speaker").

## 1.7.2 (2026-10-10, Rob)
- **Connect Slack** (MDFM Radio app 0.2.7, MD Hub 0.1.3) opens Slack's sign-in in an app window. The window can only go to Slack, Google or Apple sign-in, the MDFM helper, and the app's own one-time return address. It closes itself when Slack hands the token back and drops you back in the app. Closing it early cancels cleanly.
- **Set up Slack for everyone:** a one-time wizard, shown only in a copy run from source next to `apps/slack-relay`. It runs Cloudflare's tool to sign in and deploy the helper, opens Slack with the MDFM app pre-filled, reads RentVision's team id from Slack, sets the helper's secrets, and writes `config/slack.json`. Pushing that file switches Slack on for every installed app without an app release (MD Hub gets a read-only Bouncer rule for it: rules v3).
- Before Slack is switched on, the apps say so instead of "isn't set up for this copy".
- The sign-in windows have their own enforced Bouncer, with rules in `apps/common/signin-policy.cedar`. They allow Slack, the Google, Apple or Okta sign-in Slack may use, MDFM's helper, and the app's own return address; the builder's setup windows also allow Cloudflare. Before this, the app's main Bouncer blocked everything in those windows, so they stayed blank. If a window still won't load, the wizard has "Open in my browser instead" for the Cloudflare steps.

## 1.7.1 (2026-10-10, Rob)
- MedDev Receiver 1.1.1: the VOLUME knob's numbers no longer float out of place on iPhone.

## 1.7.0 (2026-10-10, Rob)
- **Skins**, from MedDev Receiver 1.1.0. There's a Skin dropdown on the radio page (Settings), the hub page's receiver, and MD Hub's Settings. "House default" follows whatever MedDev picks. Each person's own pick wins.
- Pages carry the skins in `<script id="meddev-skins" type="application/json">`.
- MDFM Radio app 0.2.6 and MD Hub 0.1.2 remember the choice. MD Hub's steel frame and hub page follow the same choice. New skins and house-default changes arrive live with the receiver.
- Default looks exactly as before.

## 1.6.0 (2026-10-10, Rob)
- The shared look and controls moved to their own repo, **MedDev Receiver** (`Octoroboto/meddev-receiver`, 1.0.0). It has the steel, LCDs, LEDs, buttons, knobs, VU meters, LED EQ, light knobs, flies and spray, badge plates, the MedDev badging and the receiver controls. Update it there once, and everything that points to it follows.
- mdfm ships a checked copy in `vendor/meddev-receiver/` as the built-in fallback. Refresh it with `npm run receiver:sync` (it needs `../meddev-receiver` next to mdfm).
- Pages now carry the look as `<style id="mdfm-skin">` plus `<script id="meddev-receiver-js">`. `<script id="mdfm-skin-js">` keeps the MDFM content-type list. `dist/skin.css` and `dist/skin.js` still contain everything, for pages that load them directly.
- MDFM Radio app 0.2.5 and MD Hub 0.1.1 follow newer receiver versions live. They download the look from the receiver repo's checked `dist/` and use it from the next launch (MD Hub: also on a hub reload). Both apps get one new read-only Bouncer rule for this (Radio rules v4, MD Hub rules v2) and a "Receiver look" line in Futureproofer.

## 1.5.10 (2026-10-10, Rob)
- The SOUND and EQ switches now match the receiver's other buttons: a round black push button with a red LED and an engraved caption (SOUND, EQ), the same as METER, LET IT RIDE and UNDERWATER. Applies everywhere the skin is used (MDFM Radio, the hub page, MD Hub).

## 1.5.9 (2026-10-10, Rob)
- The list of what plays between songs (the content switches) is now one shared list, `skin/types.js`, used by every MDFM receiver and the MD Hub app's Settings. The wording is the same everywhere.
- MD Hub: the content switches are in Settings too, and they stay in step with the receiver on the hub page both ways. The hub page shows them open instead of folded away.

## 1.5.8 (2026-10-10, Rob)
- The receiver controls (VOLUME, LOW / MID / HIGH, LET IT RIDE, UNDERWATER and the content-type checkboxes) are now one shared piece, `MDFM_receiver(radio, {app})`, so the radio app, the hub page and the MD Hub app all get the same controls. The knob, button and checkbox styles moved into the shared skin.
- Phones: the VU meters shrink to fit side by side.
- New: **MD Hub** desktop app (`apps/hub`, releases tagged `hub-v*`). It shows the live Media Development Hub from claude.ai in a steel receiver frame with no grey title bar. It feeds MDFM real weather, sports, Slack news and rendered voices (so the EQ shapes the voices too). It has two Bouncers (the app's own requests enforced; the hub page observed) and a foreground Futureproofer that asks before updating.
- Hub page: MDFM now has a full receiver deck with meters, knobs, mode buttons and content-type checkboxes.

## 1.5.7 (2026-10-10, Rob)
- Sports are now half mainstream, half obscure, all from ESPN's public scoreboards (live data only in the app):
  - Mainstream: your local pro teams, plus local college football and basketball (matched by state, so Omaha gets Nebraska), or the day's big game in the major leagues when nothing local is on.
  - Obscure: a game from a rotating list (Aussie rules, pro and college lacrosse, college volleyball, field hockey and hockey, the Scottish Championship, Indian Super League, A-League, USL, English National League, Eliteserien, J1, Swiss Super League, the CFL, college baseball). Chip has a whole Obscure Sports Desk for these.
- MDFM Radio app 0.2.4 fetches these. Older apps keep local pro teams only.

## 1.5.6 (2026-10-10, Rob)
- Much more variety inside each genre. Every song now gets:
  - its own arrangement from five song forms (intro, verses, build-ups, hooks, breaks, bridges, outro), sized to about 70-110 seconds;
  - its own instruments: usually the genre's own sound, sometimes a swap from the genre family (piano, bells, Rhodes, stabs, plucked arps, pads, choir, strings; piano, bell, whistle, pluck or synth leads);
  - separate melodies for hooks and verses (hooks sometimes jump an octave or get doubled), a different chord progression for verses, chord voicings that open up in the hook, and a key change into the last hook about one song in five;
  - section dynamics: sparse hats in verses, busier hats and a second kick pattern in hooks, build-ups with risers, beat drops before hooks, filter sweeps into breaks, and a different fill into each section (tom run, snare roll, hat stutter or a drop);
  - its own kit tuning (kick pitch, snare tone, hat length) and wider tempo and swing ranges.
- The same genre never plays twice within four songs.
- Callers sound like they're on the phone: high-pass and low-pass filtered, a nasal mid bump and light distortion (MDFM Radio app, where the voices are rendered as audio). Call-ins also drop the "M D F M interview" intro.

## 1.5.5 (2026-10-10, Rob)
- LOW / MID / HIGH are now a real 3-band EQ on the final output (low shelf 250 Hz, mid peak 1 kHz, high shelf 4 kHz, ±12 dB), after the compressor so cuts and boosts aren't evened out, with a limiter so boosts can't clip. Measured on identical renders: each knob moves its own band by about 10 dB at the ends (low boost about 7 dB, held back by the limiter).
- The meters and visualizer read after the EQ, so they show what you hear.
- Robot voices: `opts.tts(spec)` lets an app render each spoken line to audio; MDFM plays it through the volume, EQ, meters and visualizer. MDFM Radio app 0.2.3 does this with macOS voices (local, no network). Without it (browsers, the hub, older apps), system speech is used and follows the volume.

## 1.5.4 (2026-10-10, Rob)
- MDFM Radio app: no scroll bar along the right edge of the receiver (scrolling still works).

## 1.5.3 (2026-10-10, Rob)
- Receiver: a big VOLUME knob (0–10) and LOW / MID / HIGH tone knobs (±12 dB, centre is flat) beside the VU meters. Drag, scroll or use the arrow keys; double-click resets. Remembered per device.
- `radio.setTone({ low, mid, high })` / `getTone()` (dB, -12..+12; also `opts.tone`) and `radio.getVolume()`.
- Installed MDFM Radio apps get this as a content update; no new app build needed.

## 1.5.2 (2026-10-10, Rob)
- MDFM Radio app 0.2.2: finds the location and fetches weather and scores at launch (then every 15 minutes) instead of waiting for a weather break; a second network-location service (geojs.io) as backup; the Station screen says where the location came from and why the Mac's location wasn't used; changing the city in Settings refetches right away.

## 1.5.1 (2026-10-10, Rob)
- MDFM Radio app 0.2.1: the frameless receiver window can be dragged by its metal (the page reports a press and the window follows the pointer; the spray-can layer no longer blocks dragging).

## 1.5.0 (2026-10-10, Rob, with Collin)
- From Collin (PR #1): `radio.setLetItRide(on)` / `isLetItRide()` (or `createMDFM({ letItRide: true })`): the current song, and each next one while it's on, runs about two minutes, with a second breakdown and a snare roll and crash every 16 bars. Turning it off lets the song end soon after.
- From Collin (PR #1): `radio.setUnderwater(on)` / `isUnderwater()` (or `createMDFM({ underwater: true })`): muffled, resonant, slowly drifting low-pass plus a slight pitch wobble on the music. Fades in and out over about a second. The robot voice is system speech, so it stays dry.
- MDFM Radio app: LET IT RIDE and UNDERWATER buttons on the receiver.
- `caption` event ({ who, text }) for every spoken line, for on-screen captions.
- `radio.setProviders({ weather, sports, cannedFallback })` to switch live data on after creation (used by the desktop apps).
- Golden Age Radio Hour: six 1940s-style radio plays (detective, space serial, spooky, western, soap, police procedural) with a full cast, fake sponsors, a tremolo organ and old-time sound effects. New pack key `plays`.
- M D F M Arts and Culture with Wren Applewhite-Dunst: twelve quiet, silly public-radio arts pieces over a soft marimba bed. New pack key `arts`.
- `radio.spotNow("play")` / `radio.spotNow("arts")`; sound effects show up as `SFX` captions.
- New station IDs and stingers roasting the fact that the radio has both an LED meter and a needle meter.
- Company news on the hour (optional provider `news`): newest Slack posts from the past week, alternating channels, about two minutes, extractive summaries, first name + last initial, photo/video jokes, sensitive posts skipped. Pack keys `news` and `pronounce`.
- MDFM Radio app: Connect Slack (read-only user token in the keychain, via apps/slack-relay), extra channels and name pronunciation fixes in Settings.
- Receiver badging ships in skin.js: any `[data-mdfm-badges]` element gets the MedDev footer, so every app shows it and it updates with the repo.
- `radio.setTypes({ ids, stingers, ads, interviews, callers, weather, sports, plays, arts, news })` / `getTypes()`: switch any kind of talk off (music always plays). Settings has a checkbox for each; the app saves them, a plain browser remembers them on that device.
- Pacing leans on music (about 2 songs between short breaks, 3 to 4 after long ones; at most one play or arts piece every 12 minutes).
- `radio.getLevels()` returns left/right level in dBFS. The skin adds analog VU meters with their own METER on/off button (lamp goes dark, needles park).

## 1.4.0 (2026-10-10, Rob)
- Tabitha Snatterbean does the weather: deadpan, confidently wrong, in a British voice. Uses live weather when `weather` is set, otherwise philosophy.
- Chip Nitro does sports in a hyped-up American voice. Opt-in local scores with `espnSports({ city })`; otherwise the Browser Tab League.
- Weather and sports play over the talk bed like interviews.
- Live mode: when a weather or sports provider is set, only live data is used (a failed fetch plays a station ID instead). `cannedFallback: true` restores the canned backups.

## 1.3.0 (2026-10-10, Rob)
- Weather and time segments. The DJ reads the real local time with a remark for the hour. Live weather is opt-in via `openMeteo()` (Open-Meteo, no key); without it the weather is a cheeky no-data line. Packs can add `weather` templates.

## 1.2.2 (2026-10-10, Rob)
- Voice stingers: short DJ one-liners dropped over song transitions while the music keeps going (music dips, no full break). The "M D F M'in believe it" bad-copy bits moved here, plus quick tags. Packs can add `stingers`.

## 1.2.1 (2026-10-10, Rob)
- "You better M D F M'in believe it!" station ID, where the DJ reads bad copy and gets mad at whoever wrote it, plus five more in the same vein.

## 1.2.0 (2026-10-10, Rob)
- More roasts and self-deprecating bits: 15 ads, 7 station IDs, 3 interviews (the DJ interviews himself, your to-do list, your browser tabs), more caller complaints and replies.
- Brought back the "Have you tried crying?" ad. Roasting the listener and the station is on-brand; jokes about identity are not.

## 1.1.1 (2026-10-10, Rob)
- Sensitivity pass. The spray-can lid interview no longer talks about always being white. Removed dialect markers ("Mate", "Aye") and a non-contraction speech pattern so accented guests aren't caricatured, and moved Spudmuffin to a robot voice. Softened a "have you tried crying" ad and a "better photo" death euphemism. Fixed an empty slot in the ad list.

## 1.1.0 (2026-10-10, Rob)
- Five more styles: Neo-Soul, Amapiano (log drums), Cloud Rap, Jazz Hop, Chill Phonk (cowbell leads). Twelve styles in all.
- More chord progressions and song titles.
- 20 more ads and a bigger mix-and-match ad generator.
- Interviews: 19 scripted interview segments plus generated call-in segments, each guest in a different system voice or accent (British, Australian, Irish, Scottish, Indian, South African, American, and the Mac novelty voices), over a quiet talk bed. Packs can add `interviews` and `callers`.

## 1.0.0 (2026-10-10, Rob)
- First standalone release, split out of the Media Development Hub.
- Seven styles: Melodic Drill, Chill Trap, Pluggnb, Slow Jam R&B, Afroswing, Lo-fi Boom Bap, West Coast. Songs are random every time and crossfade.
- Stingers, cheesy ad beds, robot-voice station IDs and ads (including the late show-pony ID).
- Content packs, optional LED EQ display (`mountEQ`), offline render for tests.
