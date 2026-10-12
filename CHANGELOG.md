# MDFM changelog

Bump `version` in package.json and add an entry here with every change that gets merged to `main`.

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
