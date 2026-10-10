# Futureproofer

Futureproofer keeps an Electron app, and everything it depends on, current. It also flags website
automation that has stopped working, before that breaks a job.

## Checks (`checks.js`; network calls are injected so the app can route them through Bouncer)

| Check | Source | Red when | Amber when |
| --- | --- | --- | --- |
| `checkAppRelease` | the app's public GitHub releases page | – | a newer version is out (offers the right .dmg for the chip) |
| `checkElectron` | npm dist-tags for `electron` | the version is older than the newest 3 majors (no security fixes) | a newer major exists |
| `checkPackage` | npm dist-tags | a major behind, when `behindMajorIsBad` | a newer version exists |
| `checkVulnerabilities` | [OSV](https://osv.dev), Google's open vulnerability database | the shipped versions have known advisories | – |
| `checkMac` | `os.release()`, chip, Rosetta | macOS is older than the app supports | macOS is newer than tested; Intel Mac; Intel build running under Rosetta |
| `checkBuildReport` | `build/dependency-report.json` (npm audit + outdated, written at build time) | known problems in **shipped** packages | the build is more than 45 days old |

`createFutureproofer({ checks: [{ id, title, everyHours, run }] })` runs the checks at launch,
then each on its own schedule, and again before work (`ensureFresh`) if the last full check is
more than 3 days old. Results are kept on disk. A check that can't run (offline) shows amber
and never silently passes.

## Website recipes (`recipes.js`, `recorder.js`)

Steps that drive someone else's website are written down as a **recipe**: each step lists
several ways (locators) to find its button or field, best first.

- **Runner:** `pageFind(locators)` runs inside the page and reports which locator worked. A
  backup locator working counts as a "self-repair": the app saves a new recipe version with that
  locator first.
- **Health check:** a daily dry run that walks the steps without submitting anything.
- **Re-demo:** when no locator works, a person does the task once in a recorder window. Every
  click on a submit button is stopped in the page, and the window gets its own Bouncer label
  that allows no changes. The recording becomes a new recipe version (recorded locators first,
  old ones kept as backups). It's tested with a dry run before it's switched on. Versions are
  kept for rollback.

## Badge

Include `renderer/badge.js` (it uses the Bouncer badge styles), then call
`FutureprooferBadge.mount({ status, runNow, command, recipes, useRecipe, openExternal, onEvent })`.

## Update pipeline (repo side)

The app checks for updates; changes reach the app through this pipeline:

1. Dependabot (`.github/dependabot.yml`) opens a weekly pull request for new versions.
2. The tests run on it (`.github/workflows/test.yml`).
3. A person merges it and runs `npm run release -- "notes"`. That builds the app, writes the
   dependency report, sets Electron's fuses, signs it, and publishes the .dmg files to the
   public releases page.
4. Every installed copy sees the new version.

Automatic install needs an Apple Developer ID (Electron's updater requires a signed app on macOS).
