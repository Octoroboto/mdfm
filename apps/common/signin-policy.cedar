// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bouncer rules: sign-in windows (MDFM Radio and MD Hub), ENFORCED
//
// The small windows that open for "Connect Slack" (and, in a copy run from source, the builder's
// "Set up Slack for everyone" wizard) have their own Bouncer with these rules. Default: everything
// is blocked; a request leaves only if a rule below allows it.
//
// Who asks (principal):
//   Caller::"slack-signin"  the Connect Slack window and its sign-in popups
//   Caller::"setup"         the builder's setup windows (Cloudflare, Slack app pages); only created
//                           when the app runs from source next to apps/slack-relay, never in a built app
//   Caller::"ui" / "background"  anything else in these windows' sessions (e.g. a site's service worker)
//
// Changing this file: review, then `npm run bouncer:lock` in each app.
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("sign-in-sites")
@description("Slack, and the Google, Apple or Okta sign-in Slack may use")
permit (principal, action, resource)
when {
  (context.host == "slack.com" || context.host like "*.slack.com" || context.host == "slackb.com" || context.host like "*.slackb.com" ||
   context.host == "slack-edge.com" || context.host like "*.slack-edge.com" || context.host == "slack-imgs.com" || context.host like "*.slack-imgs.com" ||
   context.host == "accounts.google.com" || context.host == "accounts.youtube.com" || context.host like "*.gstatic.com" || context.host like "*.googleusercontent.com" ||
   context.host == "apis.google.com" || context.host == "www.google.com" || context.host == "play.google.com" || context.host == "ogs.google.com" ||
   context.host == "fonts.googleapis.com" || context.host == "www.googleapis.com" || context.host == "oauth2.googleapis.com" ||
   context.host == "appleid.apple.com" || context.host like "*.cdn-apple.com" || context.host like "*.okta.com" || context.host like "*.oktacdn.com") &&
  context.sameToday < 20000
};

@id("mdfm-helper")
@description("MDFM's Slack sign-in helper (the mdfm-slack Cloudflare Worker)")
permit (principal, action, resource)
when { context.host like "mdfm-slack.*.workers.dev" && context.sameToday < 500 };

@id("back-to-the-app")
@description("Hand the finished sign-in back to the app on this Mac (127.0.0.1, its one-time /slack address)")
permit (principal == Caller::"slack-signin", action, resource == Host::"127.0.0.1")
when { context.path == "/slack" && context.sameToday < 50 };

@id("cloudflare-sign-in")
@description("Cloudflare's sign-in and dashboard, for the builder's setup only")
permit (principal, action, resource)
when {
  (context.host == "dash.cloudflare.com" || context.host == "cloudflare.com" || context.host like "*.cloudflare.com") &&
  context.caller != "slack-signin" && context.sameToday < 20000
};

@id("builder-setup")
@description("The builder's setup windows may follow any sign-in page (they only exist in a copy run from source)")
permit (principal == Caller::"setup", action, resource);
