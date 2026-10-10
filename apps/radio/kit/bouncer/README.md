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
| context | `caller, method, host, path, search, fields` (form field names), `form` (short form values, never file contents), `sameToday` (requests of this kind today) |

## Gates

1. `attachSession(session)`: Electron's `webRequest.onBeforeRequest` for every window using
   that session (pages, hidden windows, Electron `net` requests).
2. `assert(request)` / `guardFetch(fetch)`: for Node requests (fetch, https), which Electron's
   hook can't see. In an app, route these through one file (FVU: `src/main/egress.js`) and keep
   a test that fails if any other file sends a request directly.

## Using it in an app

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
  allowed change, and carries the previous line's hash, so `verify()` detects edits.
- Badge: include `renderer/badge.css` and `renderer/badge.js`, then
  `BouncerBadge.mount({ status, recent, checkNow, showLog, openExternal, onEvent })`.
- Engine freshness: `checkForUpdates(getJson)` compares the installed
  `@cedar-policy/cedar-wasm` with the newest release on npm. The badge turns amber when an
  update is available or no check has succeeded for 3 days.

## Limits

Bouncer controls what the **app** sends. It doesn't change what a login can do elsewhere, and
it can't stop malware that already controls the Mac. For a packaged app, Electron's fuses and
ASAR integrity (a Futureproofer build step) make tampering with the app's files harder.
