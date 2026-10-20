# MD Hub

The Media Development Hub as a Mac app. It opens the live hub page from claude.ai inside a steel receiver frame, with no grey macOS title bar. MDFM 99.9 HD plays inside it with real local weather, sports and (optionally) Slack news. The hub page is always the current one on claude.ai, so it never needs an app update to change.

## Install (no Terminal needed)

1. Download the `.dmg` for your Mac from the [mdfm releases page](https://github.com/Octoroboto/mdfm/releases). Pick the newest `hub-v…` release: `arm64` is for Apple-chip Macs; the other one is for Intel.
2. Open it and drag **MD Hub** to **Applications**.
3. The first time, macOS may say it can't check the app. Open **System Settings → Privacy & Security** and click **Open Anyway**. This happens only once.
4. Sign in with your RentVision Claude account. If Google sign-in won't finish inside the app, use **Continue with email** and the code Claude emails you.

## Using it

- **POWER / MIN / FULL** on the top strip close, minimize and go full screen. Drag the window by the metal strip. Double-click the strip to zoom.
- **SETTINGS:** pick a skin, choose what plays between songs, set a city if weather or sports can't find you, choose units, connect Slack news, see what's out of date, and open the Bouncer logs.
- **Badges:** the BOUNCER and FUTUREPROOFER plates on the strip are always on show. Green means all good, amber means something to look at, and red blinks. Click one for the details.
- **Cmd+R** reloads the hub.

## Skins

Pick a **Skin** in SETTINGS, or on the hub's MDFM receiver. Both follow the same choice, and the steel frame changes with them.

- **House default** follows whatever MedDev picks. Your own pick wins.
- **Where skins come from:** they live in **MedDev Receiver** (`Octoroboto/meddev-receiver`).
- **How they arrive:** from version 0.1.2, MD Hub fetches new looks and skins by itself. They show from the next launch or a hub reload (Cmd+R).
- **What a skin can change:** it can restyle everything, but every control, the glass and the lights always work the same.

## Accessibility (AXMOD)

Settings → **Accessibility** (or Cmd+Option+A anywhere) slides out the AXMOD drawer, styled by the current skin: text size, high contrast, readable and dyslexia fonts, spacing, a reading ruler, read aloud, reduce motion, calm mode, colourblind-safe colours and more. The frame and the hub page share one set of choices, saved with the app's settings. The hub page applies them once it carries MedDev Receiver 1.7+ (when the hub artifact is republished).

## Slack news

**Connect Slack** in SETTINGS opens Slack's sign-in in a small app window that closes itself when you're connected. It works once MedDev has switched Slack on (the mdfm repo's `config/slack.json`), with no app update. In a copy run from source, **Set up Slack for everyone** runs the one-time setup.

## Safety

- **Bouncer, the app's own requests (enforced):** the app may only read weather, location, scoreboards, Slack news (read-only), this repo's releases, and the receiver look and skins (rules v2). Everything else is blocked. Rules: the kit's `shared.cedar` (https only, never delete) and `families/mdfm-apps.cedar` (shared with MDFM Radio) plus the app's own `src/main/bouncer/app.cedar`, listed in `bouncer.config.json`; the questions they must answer are in `test/bouncer-cases.cjs`.
- **Bouncer, the hub page (observe):** claude.ai is watched, and anything unusual is logged. Nothing is blocked, because blocking a site's own calls can break it. Rules are in `view-policy.cedar`. Switch it to enforce once the log has been quiet for a while.
- **Radio bridge scope:** only the hub artifact's own frame gets the radio bridge (`window.mdfmApp`: live data, voices, settings), and the app re-checks every call. Rules (`src/main/bridge-scope.js`):
  - the frame must be the artifact's sandbox frame on `*.claudeusercontent.com` (never the top page), with only claude.ai or claudeusercontent.com frames between it and the top;
  - the top page must be a claude.ai artifact whose id is allowed: the hub artifact (`V9DKVsKPguVWjCGFacb5iM`), the id in the `hubUrl` setting, and any ids in an optional `"bridgeArtifacts": ["…"]` list in the app's `settings.json`;
  - another claude.ai artifact (a chat's artifact, someone else's shared or published one) opened inside MD Hub gets no bridge, so its radio uses canned lines;
  - safety valve: if claude.ai changes its addresses so the top page isn't recognisable as an artifact address at all, the frame is allowed and the app logs a warning once (`npm start` shows it with the hub's frame addresses). Pin it down once that's been checked.
- **Location and notifications** are only given to the hub artifact's page (claude.ai and claudeusercontent.com, in the hub view). Other sites, frames from elsewhere and login pop-ups don't get them.
- **Login pop-ups** stay on Google, Apple and Claude sign-in; anything else opens in your browser, and a pop-up can't open more windows.

## Updates

Futureproofer runs in the foreground. When a newer MD Hub is out, it asks: **Download**, **Later** or **Skip this version**. Updates are never forced. Only full releases are offered (a GitHub pre-release isn't), and a download that stalls for a minute stops so it can be tried again.

## For the builder (Rob)

```
cd ~/RentVision/mdfm/apps/hub
npm install
npm start            # run it from source
npm test             # Bouncer rules with real Cedar + bridge checks
npm run install:mac  # build and install into /Applications
npm run release -- "What changed"   # bump "version" first; publishes hub-v<version>
```

- After a rules change, review it, then run `npm run bouncer:lock`.
- `npm run sync` copies `apps/common` and the shared MDFM skin in. It runs on its own before start and test.
