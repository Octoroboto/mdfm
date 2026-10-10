// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bouncer rules: MD Hub, the hub PAGE (claude.ai and the hub artifact). OBSERVE mode.
//
// The hub lives on claude.ai, which loads its own sign-in, assets and services. Blocking a site's own
// first-party calls can break it (lesson from Wistia in the Floorplan Video Uploader), so this Bouncer
// starts in observe mode: nothing is blocked, and anything outside this list is logged as "would block".
// After a few weeks of clean logs, list what's needed and switch bouncer.view.config.json to "enforce".
//
// Who asks: Caller::"hub" (the hub window), Caller::"login" (sign-in pop-ups), Caller::"shell" (the app's
// own steel frame: no network at all), Caller::"background" (service workers).
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("claude")
@description("claude.ai, its artifact frames and Anthropic's own services")
permit (principal, action, resource)
when {
  ["hub", "login", "background"].contains(context.caller) &&
  (context.host == "claude.ai" || context.host like "*.claude.ai" || context.host like "*.claudeusercontent.com" ||
   context.host == "anthropic.com" || context.host like "*.anthropic.com" || context.host like "*.claude.com" || context.host == "claude.com")
};

@id("artifact-cdns")
@description("Libraries and fonts the hub artifact may load (the artifact CSP's own list)")
permit (principal, action in [Action::"GET", Action::"HEAD"], resource)
when {
  ["hub", "background"].contains(context.caller) &&
  ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "cdn.tailwindcss.com", "code.jquery.com", "fonts.googleapis.com", "fonts.gstatic.com"].contains(context.host)
};

@id("sign-in")
@description("Signing in to claude.ai (email code or Google)")
permit (principal, action, resource)
when {
  ["hub", "login"].contains(context.caller) &&
  (context.host == "accounts.google.com" || context.host like "*.gstatic.com" || context.host == "apis.google.com" || context.host like "*.googleusercontent.com")
};
