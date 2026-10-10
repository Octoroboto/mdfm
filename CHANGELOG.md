# MDFM changelog

Bump `version` in package.json and add an entry here with every change that gets merged to `main`.

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
