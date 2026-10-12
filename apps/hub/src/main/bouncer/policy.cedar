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
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("only-reads")
@description("The app's own code never sends changes: only GET and HEAD (plus the OSV security lookup)")
forbid (principal, action, resource)
when {
  context.method != "GET" && context.method != "HEAD" &&
  !(context.caller == "app" && context.method == "POST" && context.host == "api.osv.dev" && context.path == "/v1/querybatch" && ["queries"].containsAll(context.fields))
};

@id("no-slack-writes")
@description("Never call a Slack method that posts, uploads, joins, reacts or changes anything")
forbid (principal, action, resource == Host::"slack.com")
when {
  context.path like "*chat.*" || context.path like "*files.*" || context.path like "*.join" || context.path like "*.invite*" ||
  context.path like "*reactions.*" || context.path like "*pins.*" || context.path like "*.set*" || context.path like "*.create*" ||
  context.path like "*.archive*" || context.path like "*.delete*" || context.path like "*.kick*" || context.path like "*.leave*" ||
  context.path like "*admin.*"
};

@id("weather")
@description("Current weather (Open-Meteo)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.open-meteo.com")
when { context.path == "/v1/forecast" && context.sameToday < 1000 };

@id("city-lookup")
@description("Turn the city in Settings into a location (Open-Meteo geocoding)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"geocoding-api.open-meteo.com")
when { context.path == "/v1/search" && context.sameToday < 500 };

@id("place-name")
@description("Name the town for the Mac's location (BigDataCloud)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.bigdatacloud.net")
when { context.path == "/data/reverse-geocode-client" && context.sameToday < 500 };

@id("network-location")
@description("Rough location from the network (ipwho.is, then geojs.io)")
permit (principal == Caller::"app", action == Action::"GET", resource)
when { ((context.host == "ipwho.is" && context.path == "/") || (context.host == "get.geojs.io" && context.path == "/v1/ip/geo.json")) && context.sameToday < 200 };


// ══ PTLK 108.0 (talk shows) ══════════════════════════════════════════════════════════════════

@id("ptlk-headlines")
@description("Business and gaming headlines for Analyze Biz and Button Mashers (GDELT, read-only, cached 30 minutes)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.gdeltproject.org")
when { context.path == "/api/v2/doc/doc" && context.sameToday < 300 };

@id("ptlk-encyclopedia")
@description("A short Wikipedia summary of one animal for The Long Look (read-only)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"en.wikipedia.org")
when { context.path like "/api/rest_v1/page/summary/*" && context.sameToday < 500 };

@id("sports-scores")
@description("Public scoreboards: local, college, the day's big game and obscure leagues (ESPN)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"site.api.espn.com")
when { context.path like "/apis/site/v2/sports/*/scoreboard" && context.sameToday < 1000 };

@id("slack-read-news")
@description("Read public channel posts, the channel list and posters' names (read-only token)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"slack.com")
when { ["/api/conversations.history", "/api/conversations.list", "/api/users.info"].contains(context.path) && context.sameToday < 2000 };

@id("slack-disconnect")
@description("Give the Slack token back when disconnecting")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"slack.com")
when { context.path == "/api/auth.revoke" && context.sameToday < 20 };

@id("receiver-look")
@description("Download new versions of the receiver look from the meddev-receiver repo")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/meddev-receiver/main/dist/*" && context.sameToday < 100 };

@id("slack-switch")
@description("See whether Slack sign-in has been switched on (the mdfm repo's config/slack.json)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path == "/Octoroboto/mdfm/main/config/slack.json" && context.sameToday < 50 };

@id("app-releases")
@description("See whether a newer MD Hub app is out (mdfm releases)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.github.com")
when { context.path like "/repos/Octoroboto/mdfm/*" && context.sameToday < 200 };

@id("engine-update-check")
@description("Check for newer Electron or Cedar versions (npm)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"registry.npmjs.org")
when { ["/@cedar-policy/cedar-wasm/latest", "/-/package/electron/dist-tags", "/-/package/@cedar-policy/cedar-wasm/dist-tags"].contains(context.path) && context.sameToday < 50 };

@id("security-advisories")
@description("Ask OSV whether the app's own packages have known security problems")
permit (principal == Caller::"app", action == Action::"POST", resource == Host::"api.osv.dev")
when { context.path == "/v1/querybatch" && ["queries"].containsAll(context.fields) && context.sameToday < 50 };
