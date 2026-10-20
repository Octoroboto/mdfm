# Bouncer

Bouncer is an outbound request allowlist for Electron apps. Each app ships a **Cedar policy**
listing exactly what it may send with the user's logins. Everything else is blocked by default,
and a `forbid` rule always beats a `permit` rule. Some standard names for the idea: default-deny
egress filtering, a policy enforcement point, policy-as-code, and least privilege.

Bouncer does not make the decisions itself.
[Cedar](https://www.cedarpolicy.com/) makes them: an open-source policy engine from AWS, now a
CNCF Sandbox project, with a [formally verified core](https://docs.cedarpolicy.com/other/security.html).
Bouncer turns each request into facts, asks Cedar, then lets the request through, blocks it, or
(in observe mode) logs it.

## How a request is described

| Cedar | Value |
| --- | --- |
| principal | `Caller::"app"` (the app's own code) or the label of the window it came from (`publish`, `manual`, `login`, `parser`; unlabelled windows are `ui`) |
| action | `Action::"<HTTP method>"` |
| resource | `Host::"<host name>"` |
| context | `caller, scheme` (`https`, `http`, `ws`, `wss`), `method, host, path` (decoded), `search` (the raw query string), `pathLower, searchLower` (lower-case copies, for case-insensitive rules: Cedar has no lower-case function), `fields` (form field names), `form` (short form values, never file contents), `bodyBytes` (request size), `sameToday` (requests of this kind today) |

## Gates

1. `attachSession(session)`: Electron's `webRequest.onBeforeRequest` for every window using
   that session (pages, hidden windows, Electron `net` requests). A session holds one hook. A module with windows on
   its own session (mdfm-live's Connect Slack window) calls `attachSession(session, { own: true })`: its Bouncer gets
   that session no matter which attaches first, and the app's `session-created` catch-all leaves it alone (returns false).
2. `assert(request)` / `guardFetch(fetch)`: for Node requests (fetch, https), which Electron's
   hook can't see. In an app, route these through one file (the kit's `templates/egress.js`) and keep
   a test that fails if any other file sends a request directly.

## Modes

| | `observe` | `enforce` |
| --- | --- | --- |
| A request the rules allow | goes through | goes through |
| A request no rule allows (or a forbid stops) | goes through, logged as **would block** | cancelled, logged as **blocked**, one notice a minute |
| An address Bouncer can't read (bad URL or %-escape) | goes through, logged as would block | cancelled |
| Rules that don't match their lock, or Cedar won't load (unhealthy) | **everything cancelled** | everything cancelled |
| Allowed changes (anything but GET/HEAD/OPTIONS) | logged | logged |

Reads that are allowed are counted but not logged. Built apps run in `enforce`; an app may ship in `observe`
while it collects its first real runs (Rob's rule: switch after 3 real jobs with nothing unexpected).

## Using it in an app

Pin the Cedar engine exactly, at the version in the kit's `kit.json` → `engines.cedar` (the installer prints the
`npm install --save-exact` line; every RentVision app uses the same one). New versions arrive as tested PRs: copy
`templates/kit-update.yml` to `.github/workflows/` and `templates/bouncer-cases.cjs` to `test/` (see the kit README,
"Cedar upgrades").

```js
const { createBouncer } = require('./kit/bouncer');
const bouncer = createBouncer({ appName, policyText, config, lock, logDir, notify, enginePackageVersion });
app.on('session-created', (s) => bouncer.attachSession(s));    // before app ready
bouncer.tag(win.webContents, 'publish');                        // label every window
bouncer.assert({ url, method, body, contentType });             // before every Node request
```

- `config` (`bouncer.config.json`): `{ "policyVersion": 1, "mode": "observe" | "enforce" }`. The
  mode is fixed at build time, so it can't be switched off from inside the app.
- `lock` (`bouncer.lock.json`): fingerprints of the rules and the config, from the lock script.
  If they don't match at launch, Bouncer marks itself unhealthy, blocks everything, and the app
  should refuse to run jobs.
- Log: `<logDir>/bouncer-YYYY-MM.jsonl`. Each line records a block, a would-block, or an
  allowed change, and carries the previous line's hash, so `verify()` detects edits. `status()` re-reads the
  file only when something other than Bouncer changed it, or every 10 minutes.
- Case: `path` and `search` keep their case. To catch `/Delete` as well as `/delete`, match `pathLower` /
  `searchLower` (write the pattern in lower case). To insist on https: `forbid ... when { context.scheme != "https" };`
  (the template has it).
- Badge: include `renderer/badge.css` and `renderer/badge.js`, then
  `BouncerBadge.mount({ status, recent, checkNow, showLog, openExternal, onEvent })`.
- Engine freshness: `checkForUpdates(getJson)` compares the installed
  `@cedar-policy/cedar-wasm` with the newest release on npm. The badge turns amber when an
  update is available or no check has succeeded for 3 days.

## Limits

Bouncer controls what the **app** sends. It doesn't change what a login can do elsewhere, and
it can't stop malware that already controls the Mac. For a packaged app, Electron's fuses and
ASAR integrity (a Futureproofer build step) make tampering with the app's files harder.

## Rules in two files (shared + the app's own)

A rules folder can hold one `policy.cedar`, or the app's own `app.cedar` read together with the kit's
`shared.cedar`. List them in `bouncer.config.json`:

```json
{ "policyVersion": 9, "mode": "enforce", "rules": ["../../../kit/bouncer/shared.cedar", "../../../kit/bouncer/families/mdfm-apps.cedar", "app.cedar"] }
```

**Family files** (`families/<family>.cedar`, kit-owned) hold the rules a group of related apps share word for word, such as
`families/mdfm-apps.cedar` for MDFM Radio and MD Hub (the uploaders get theirs when they move over). List the family file
between the shared floor and `app.cedar`. A family file may hold permits, because every app that lists it needs them.

`shared.cedar` is the floor every app stands on, and holds only `forbid` rules (https only, never DELETE, never a
change to a delete/destroy/archive/trash/remove address, in any capitals), so it can only make an app stricter. The
kit owns it: an app gets a changed `shared.cedar` when it moves to a newer kit (`install/update.mjs`). That copy no
longer matches the app's lock, so `check.mjs` and the app's tests fail until someone reviews it, runs the same-answers
check (`--rules` the old folder, `--rules-after` the new) and re-locks: the change can't ship unreviewed. (Doing that
for every app as a PR is the Bouncer Console's job, still to build; `kit-update.yml` only moves the Cedar version.) Load the rules with
`require('./kit/bouncer/rules').loadRules(dir).text` (instead of reading `policy.cedar`); `tools/lock.js` and
`check.mjs` read the same way, and the lock covers both files. Cedar reads a rule set as one, so moving a rule from
one file to the other changes no answer; giving two rules the same `@id` is an error.

## Same-answers check

`tools/cedar-diff.cjs` asks two Bouncers the same questions and fails on any different answer. Questions live in the
app's `test/bouncer-cases.cjs` (plain data: `[caller, method, url, body, expect, note]` or the long form; start from
`templates/bouncer-cases.cjs`).

```
node kit/bouncer/tools/cedar-diff.cjs --cases test/bouncer-cases.cjs --rules src/main/bouncer \
     --engine-before <old cedar-wasm folder> --engine-after node_modules/@cedar-policy/cedar-wasm   # a Cedar upgrade
node kit/bouncer/tools/cedar-diff.cjs --cases test/bouncer-cases.cjs --rules old-rules/ --rules-after src/main/bouncer   # a rules change
```

The lock covers the rules and the config, not the engine, so a Cedar upgrade needs no new lock.
