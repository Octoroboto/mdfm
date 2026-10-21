// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bouncer rules: MD Hub, the app's OWN requests (enforced)
//
// Default: EVERYTHING IS BLOCKED. A request leaves the app's own code only if a "permit" rule below
// allows it, and a "forbid" rule always wins. Checked by Cedar (https://www.cedarpolicy.com).
// The hub page itself (claude.ai and the hub artifact) is watched by a second Bouncer, see view-policy.cedar.
//
// Who asks: Caller::"app" (src/common/net.js: weather, location, sports, Slack news, update checks, the receiver look).
// The app only READS, plus one security lookup at OSV (a POST).
// Changing this file: review, then `npm run bouncer:lock`.
//
// Since kit 2.19 these are only MD Hub's own rules. Bouncer reads them together with the kit's
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
  context.path like "*admin.*"
};

@id("slack-switch")
@description("See whether Slack sign-in has been switched on (the mdfm repo's config/slack.json)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path == "/Octoroboto/mdfm/main/config/slack.json" && context.sameToday < 50 };

@id("app-releases")
@description("See whether a newer MD Hub app is out (mdfm releases)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.github.com")
when { context.path like "/repos/Octoroboto/mdfm/*" && context.sameToday < 200 };
