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
// ─────────────────────────────────────────────────────────────────────────────────────────────


// ══ Hard stops (forbid always wins) ══════════════════════════════════════════════════════════

@id("only-reads")
@description("MDFM Radio never sends changes: only GET and HEAD leave the app (plus the OSV security lookup)")
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
  context.path like "*admin.*" || context.path like "*users.profile.set*"
};


// ══ Live weather and location ════════════════════════════════════════════════════════════════

@id("weather")
@description("Current weather for the radio's location (Open-Meteo)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.open-meteo.com")
when { context.path == "/v1/forecast" && context.sameToday < 1000 };

@id("city-lookup")
@description("Turn the city typed in Settings into a location (Open-Meteo geocoding)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"geocoding-api.open-meteo.com")
when { context.path == "/v1/search" && context.sameToday < 500 };

@id("place-name")
@description("Name the town for the Mac's location (BigDataCloud)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.bigdatacloud.net")
when { context.path == "/data/reverse-geocode-client" && context.sameToday < 500 };

@id("network-location")
@description("Rough location from the network when the Mac's location is off (ipwho.is, then geojs.io)")
permit (principal == Caller::"app", action == Action::"GET", resource)
when {
  ((context.host == "ipwho.is" && context.path == "/") || (context.host == "get.geojs.io" && context.path == "/v1/ip/geo.json")) &&
  context.sameToday < 200
};


// ══ App updates ══════════════════════════════════════════════════════════════════════════════

@id("app-update-download")
@description("Download a newer version of this app (the .dmg from the mdfm releases page, then GitHub's file host it redirects to), only when someone presses Download")
permit (principal == Caller::"app", action == Action::"GET", resource)
when {
  ((context.host == "github.com" && context.path like "/Octoroboto/mdfm/releases/download/*") ||
   context.host == "objects.githubusercontent.com" || context.host == "release-assets.githubusercontent.com") &&
  context.sameToday < 30
};


// ══ PTLK 108.0 (talk shows) ══════════════════════════════════════════════════════════════════

@id("ptlk-headlines")
@description("Business and gaming headlines for Analyze Biz and Button Mashers (GDELT, read-only, cached 30 minutes)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.gdeltproject.org")
when { context.path == "/api/v2/doc/doc" && context.sameToday < 300 };

@id("ptlk-encyclopedia")
@description("A short Wikipedia summary of one animal for The Long Look (read-only)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"en.wikipedia.org")
when { context.path like "/api/rest_v1/page/summary/*" && context.sameToday < 500 };


// ══ Local sports ═════════════════════════════════════════════════════════════════════════════

@id("sports-scores")
@description("Public scoreboards for nearby pro teams (ESPN)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"site.api.espn.com")
when { context.path like "/apis/site/v2/sports/*/scoreboard" && context.sameToday < 1000 };


// ══ Slack company news (only after the person connects Slack) ════════════════════════════════

@id("slack-read-news")
@description("Read public channel posts, the channel list and posters' names (read-only token)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"slack.com")
when {
  ["/api/conversations.history", "/api/conversations.list", "/api/users.info"].contains(context.path) &&
  context.sameToday < 2000
};

@id("slack-disconnect")
@description("Give the Slack token back when the person disconnects")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"slack.com")
when { context.path == "/api/auth.revoke" && context.sameToday < 20 };


// ══ MDFM content and app updates (the public Octoroboto/mdfm repo) ═══════════════════════════

@id("mdfm-content")
@description("Download new MDFM content and looks from the mdfm repo")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/mdfm/*" && context.sameToday < 200 };

@id("receiver-look")
@description("Download new versions of the receiver look from the meddev-receiver repo")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/meddev-receiver/main/dist/*" && context.sameToday < 100 };

@id("mdfm-app-releases")
@description("See whether a newer MDFM Radio app is out (mdfm releases)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.github.com")
when { context.path like "/repos/Octoroboto/mdfm/*" && context.sameToday < 200 };


// ══ Keeping the safety parts current ═════════════════════════════════════════════════════════

@id("engine-update-check")
@description("Check whether newer Electron or Cedar versions are out (npm), for Bouncer and Futureproofer")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"registry.npmjs.org")
when {
  ["/@cedar-policy/cedar-wasm/latest", "/-/package/electron/dist-tags", "/-/package/@cedar-policy/cedar-wasm/dist-tags"].contains(context.path) &&
  context.sameToday < 50
};

@id("security-advisories")
@description("Ask OSV (Google's open vulnerability database) whether the app's own packages have known security problems")
permit (principal == Caller::"app", action == Action::"POST", resource == Host::"api.osv.dev")
when { context.path == "/v1/querybatch" && ["queries"].containsAll(context.fields) && context.sameToday < 50 };


// ══ The radio window ═════════════════════════════════════════════════════════════════════════

@id("radio-fonts")
@description("The radio window may load its fonts (Google Fonts); nothing else")
permit (principal == Caller::"radio", action == Action::"GET", resource)
when {
  (context.host == "fonts.googleapis.com" && context.path == "/css2") ||
  (context.host == "fonts.gstatic.com" && context.path like "/s/*")
};
