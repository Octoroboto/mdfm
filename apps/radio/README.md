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

## What keeps it safe and current

- **Bouncer** (`kit/bouncer`, rules in `src/main/bouncer/policy.cedar`): every request the app makes is checked by Cedar
  rules first; anything not on the list is blocked. The app only reads (weather, location, sports, Slack posts if
  connected, MDFM content from this repo, version checks), plus one security lookup at OSV. Status shows on the
  Station screen; Settings → Show Bouncer log.
- **Futureproofer** (`kit/futureproofer`, `src/main/futureproof.js`), in the background: checks the app, MDFM
  content, Electron, Bouncer's engine, known security problems (OSV), this Mac and the build. Results are in
  Settings → Keeping things current. Nothing is ever forced: new content plays from the next launch, and a new app
  version is offered as a download.
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
