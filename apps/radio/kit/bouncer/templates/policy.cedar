// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bouncer rules: <APP NAME>
//
// Default: EVERYTHING IS BLOCKED. A request leaves the app only if a "permit" rule below allows
// it, and a "forbid" rule always wins. Rules are checked by Cedar (https://www.cedarpolicy.com).
//
// Who asks (principal):
//   Caller::"app"   the app's own code (src/main/egress.js, the one file that sends requests)
//   Caller::"ui"    the app's window: no network unless a rule says so
//
// Start in "observe" mode (bouncer.config.json): nothing is blocked, anything these rules would
// block is logged as "would block". After a few real runs with nothing unexpected, switch to
// "enforce". After every change: review it, then run `node kit/bouncer/tools/lock.js`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// ══ Hard stops (forbid always wins) ══════════════════════════════════════════════════════════

@id("only-reads")
@description("This app only reads: nothing but GET and HEAD leaves it. Add exceptions here, one by one, with a reason.")
forbid (principal, action, resource)
when { context.method != "GET" && context.method != "HEAD" };

@id("https-only")
@description("Nothing leaves over plain http or ws: only https and wss")
forbid (principal, action, resource)
when { context.scheme != "https" && context.scheme != "wss" };

@id("window-fonts-only")
@description("The app's window loads only its own files, plus Google Fonts for skins that use them")
forbid (principal == Caller::"ui", action, resource)
when { !(context.method == "GET" && (context.host == "fonts.googleapis.com" || context.host == "fonts.gstatic.com")) };

// ══ What the app may read ════════════════════════════════════════════════════════════════════

@id("window-fonts")
@description("Skins may load their fonts from Google Fonts")
permit (principal == Caller::"ui", action == Action::"GET", resource)
when { context.host == "fonts.googleapis.com" || context.host == "fonts.gstatic.com" };

// RECEIVER: new looks and skins (only if the app uses the receiver module).
@id("receiver-look")
@description("Read MedDev Receiver's published look and skins")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/meddev-receiver/main/dist/*" };

// FUTUREPROOFER: version and security checks (only if the app uses the futureproofer module).
@id("versions")
@description("Read newest package versions (Electron, Cedar) from npm")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"registry.npmjs.org")
when { context.path like "/-/package/*/dist-tags" };

// Add the app's own services below, as narrowly as possible (host + path + method), with a daily
// limit for anything that could loop, e.g.:  when { context.path like "/v1/forecast*" && context.sameToday < 500 }
