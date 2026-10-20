// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bouncer rules: MDFM Radio
//
// Default: EVERYTHING IS BLOCKED. A request leaves the app only if a "permit" rule below allows
// it, and a "forbid" rule always wins. Rules are checked by Cedar (https://www.cedarpolicy.com).
//
// MDFM Radio only READS. It never posts, uploads or changes anything anywhere. The one exception
// is asking OSV about known security problems in the app's own package versions (a lookup sent
// as POST, see "security-advisories"); anything else that isn't a GET is stopped by "only-reads".
//
// Who asks (principal):
//   Caller::"app"        the app's own code (src/common/net.js): weather, location, sports,
//                        Slack news, MDFM content and app updates, Bouncer's engine check
//   Caller::"radio"      the radio window itself (fonts only; everything else is built in)
//   Caller::"ui" / "background"  anything else: no network at all
//
// Daily limits ("sameToday", per kind of request): far above normal use, only there to stop a
// runaway loop. Normal: weather ~100/day, each sports league ~150/day, Slack ~75 history and a
// few hundred name look-ups a day. Counts restart at midnight and when the app restarts.
//
// Changing this file: review the change, then run `npm run bouncer:lock`. The app refuses to
// use rules that don't match the lock (and blocks everything), and the tests fail.
//
// Since kit 2.19 these are only MDFM Radio's own rules. Bouncer reads them together with the kit's
// shared floor (kit/bouncer/shared.cedar: https only, never delete) and the MDFM family rules both apps share
// (kit/bouncer/families/mdfm-apps.cedar), in the order bouncer.config.json "rules" lists.
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("no-slack-writes")
@description("Never call a Slack method that posts, uploads, joins, reacts or changes anything")
forbid (principal, action, resource == Host::"slack.com")
when {
  context.path like "*chat.*" || context.path like "*files.*" || context.path like "*.join" || context.path like "*.invite*" ||
  context.path like "*reactions.*" || context.path like "*pins.*" || context.path like "*.set*" || context.path like "*.create*" ||
  context.path like "*.archive*" || context.path like "*.delete*" || context.path like "*.kick*" || context.path like "*.leave*" ||
  context.path like "*admin.*" || context.path like "*users.profile.set*"
};

@id("mdfm-content")
@description("Download new MDFM content and looks from the mdfm repo")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/mdfm/*" && context.sameToday < 200 };

@id("mdfm-app-releases")
@description("See whether a newer MDFM Radio app is out (mdfm releases)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.github.com")
when { context.path like "/repos/Octoroboto/mdfm/*" && context.sameToday < 200 };

@id("radio-fonts")
@description("The radio window may load its fonts (Google Fonts); nothing else")
permit (principal == Caller::"radio", action == Action::"GET", resource)
when {
  (context.host == "fonts.googleapis.com" && context.path == "/css2") ||
  (context.host == "fonts.gstatic.com" && context.path like "/s/*")
};
