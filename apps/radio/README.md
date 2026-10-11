# MDFM Radio

MDFM 99.9 HD as a Mac app that looks like a receiver sitting on your desktop: generated hip-hop, station breaks,
live local weather and sports, optional Slack company news. Runs on the Mac with zero Claude credits.

## Install (anyone)

1. Download the .dmg for your Mac from https://github.com/Octoroboto/mdfm/releases (newest `radio-v…`):
   `…-arm64.dmg` for Apple-chip Macs (M1 and newer), the other one for Intel Macs.
2. Open it and drag **MDFM Radio** to **Applications**.
3. First launch: macOS may say it can't check the app (it isn't from the App Store). Open **System Settings →
   Privacy & Security**, scroll down, click **Open Anyway**. Only needed once.
4. Allow location when asked (for local weather and sports), or type a city in Settings.

Needs macOS 13 or newer.

## Using it

- **Window:** POWER, MIN and FULL are on the steel. Drag the receiver by its metal.
- **SOUND:** press it to tune in. **Next song** and **Station break** do what they say.
- **Mixer:** the big **VOLUME** knob and **LOW / MID / HIGH** (a real 3-band EQ) shape everything, the voices included. Drag, scroll or use the arrow keys; double-click resets a knob.
- **Modes:** **LET IT RIDE** keeps each song going about two minutes. **UNDERWATER** makes everything muffled and drifting.
- **Lights:** **METER** turns the VU lamps on or off. **EQ** turns the LED equalizer on or off. The light knobs recolour everything that's lit.
- **Settings:**
  - **Skin:** how the receiver looks. "House default" follows whatever MedDev picks; your own pick wins.
  - **What plays between songs:** switch off any kind of talk. Music always plays.
  - City and units, Slack news, and "Keeping things current".

## The look and skins

The look comes from **MedDev Receiver**, a separate repo (`Octoroboto/meddev-receiver`) shared with the hub page and MD Hub. The app has a copy built in, and from version 0.2.6 it also follows newer looks and skins live: they're checked against the receiver's manifest and show from the next launch (or Cmd+R). "Get new MDFM content and looks automatically" in Settings turns this on and off, and "Use the version that came with the app" goes back to the built-in look.

## Slack news

**Connect Slack** (Settings) opens Slack's sign-in in a small app window. It can only go to Slack, Google or Apple sign-in and MDFM's helper, and it closes itself when you're connected. The button works once MedDev has switched Slack on (the mdfm repo's `config/slack.json`); no app update is needed for that. In a copy run from source, **Set up Slack for everyone** runs the one-time setup (see `apps/slack-relay/README.md`).

## What keeps it safe and current

- **Bouncer** (`kit/bouncer`, rules in `src/main/bouncer/policy.cedar`): every request the app makes is checked by Cedar
  rules first; anything not on the list is blocked. The app only reads (weather, location, sports, Slack posts if
  connected, MDFM content from this repo, the receiver look and skins from `meddev-receiver/main/dist`, version checks),
  plus one security lookup at OSV. Rules v4. Status shows on the
  Station screen; Settings → Show Bouncer log.
- **Futureproofer** (`kit/futureproofer`, `src/main/futureproof.js`), in the background: checks the app, MDFM
  content, Electron, Bouncer's engine, known security problems (OSV), this Mac and the build. Results are in
  Settings → Keeping things current, including a "Receiver look" line. Nothing is ever forced: new content and looks
  show from the next launch, and a new app version is offered as a download.
- **Build**: Electron fuses (no RunAsNode, NODE_OPTIONS or inspect; app only from app.asar, integrity checked) and an
  ad-hoc signature (`scripts/adhoc-sign.js`). With an Apple Developer ID this becomes real signing + notarization,
  and the Open Anyway step goes away.

## For Rob: build and release

```
cd ~/RentVision/mdfm/apps/radio
npm install            # first time
npm start              # run from source
npm test               # tests (also rebuilds the MDFM content)
npm run install:mac    # build and install on this Mac
# release for everyone: bump "version" in package.json, then
npm run release -- "What changed"
```

After reviewing a change to the Bouncer rules: `npm run bouncer:lock`. Diagnosing from source only:
`MDFM_BOUNCER_OBSERVE=1 npm start` (logs instead of blocking; ignored in built apps).
