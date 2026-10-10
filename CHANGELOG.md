# MDFM changelog

Bump `version` in package.json and add an entry here with every change that gets merged to `main`.

## Unreleased (proposed by Collin)
- `radio.setLetItRide(on)` / `isLetItRide()` (or `createMDFM({ letItRide: true })`): the current song, and each next one while it's on, runs about two minutes, with a second breakdown and a snare roll and crash every 16 bars. Turning it off lets the song end soon after.
- `radio.setUnderwater(on)` / `isUnderwater()` (or `createMDFM({ underwater: true })`): muffled, resonant, slowly drifting low-pass plus a slight pitch wobble on the music. It fades in and out over about a second. The robot voice is system speech, so it stays dry.

## 1.0.0 (2026-10-10, Rob)
- First standalone release, split out of the Media Development Hub.
- Seven styles: Melodic Drill, Chill Trap, Pluggnb, Slow Jam R&B, Afroswing, Lo-fi Boom Bap, West Coast. Songs are random every time and crossfade.
- Stingers, cheesy ad beds, robot-voice station IDs and ads (including the late show-pony ID).
- Content packs, optional LED EQ display (`mountEQ`), offline render for tests.
