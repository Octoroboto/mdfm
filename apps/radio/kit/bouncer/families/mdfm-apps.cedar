// ─────────────────────────────────────────────────────────────────────────────────────────────
// Family rules: the MDFM apps (MDFM Radio and MD Hub)
//
// The rules both apps need, word for word: what the radio reads (weather, location, sports, Slack
// news, PTLK feeds), how the apps update, and the hard stop that keeps them read-only. The app kit
// owns this file; each app reads it between the kit's shared floor (kit/bouncer/shared.cedar) and
// its own rules (src/main/bouncer/app.cedar), listed in that app's bouncer.config.json "rules".
// A change here reaches an app when it moves to a newer kit, and needs that app's review and re-lock.
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("only-reads")
@description("The MDFM apps never send changes: only GET and HEAD leave them (plus the OSV security lookup)")
forbid (principal, action, resource)
when {
  context.method != "GET" && context.method != "HEAD" &&
  !(context.caller == "app" && context.method == "POST" && context.host == "api.osv.dev" && context.path == "/v1/querybatch" && ["queries"].containsAll(context.fields))
};

@id("sports-scores")
@description("Public scoreboards for nearby pro teams (ESPN)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"site.api.espn.com")
when { context.path like "/apis/site/v2/sports/*/scoreboard" && context.sameToday < 1000 };

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

@id("receiver-look")
@description("Download new versions of the receiver look from the meddev-receiver repo")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"raw.githubusercontent.com")
when { context.path like "/Octoroboto/meddev-receiver/main/dist/*" && context.sameToday < 100 };

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

@id("app-update-download")
@description("Download a newer version of this app (the .dmg from the mdfm releases page, then GitHub's file host it redirects to), only when someone presses Download")
permit (principal == Caller::"app", action == Action::"GET", resource)
when {
  ((context.host == "github.com" && context.path like "/Octoroboto/mdfm/releases/download/*") ||
   context.host == "objects.githubusercontent.com" || context.host == "release-assets.githubusercontent.com") &&
  context.sameToday < 30
};

@id("ptlk-news-feeds")
@description("Business and gaming headlines from public RSS feeds (NPR and BBC business, GameSpot game news), read-only, at most every 30 minutes")
permit (principal == Caller::"app", action == Action::"GET", resource)
when {
  ((context.host == "feeds.npr.org" && context.path == "/1006/rss.xml") ||
   (context.host == "feeds.bbci.co.uk" && context.path == "/news/business/rss.xml") ||
   (context.host == "www.gamespot.com" && context.path == "/feeds/game-news/")) &&
  context.sameToday < 300
};

@id("ptlk-headlines")
@description("Business and gaming headlines for Analyze Biz and Button Mashers (GDELT, read-only, cached 30 minutes)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"api.gdeltproject.org")
when { context.path == "/api/v2/doc/doc" && context.sameToday < 300 };

@id("ptlk-encyclopedia")
@description("A short Wikipedia summary of one animal for The Long Look (read-only)")
permit (principal == Caller::"app", action == Action::"GET", resource == Host::"en.wikipedia.org")
when { context.path like "/api/rest_v1/page/summary/*" && context.sameToday < 500 };
