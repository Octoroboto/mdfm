// ─────────────────────────────────────────────────────────────────────────────────────────────
// Shared Bouncer rules: the floor every RentVision app stands on. The app kit owns this file; an app gets
// changes to it by moving to a newer kit, never by editing its copy. A changed copy no longer matches the
// app's lock, so it can't ship until someone runs the same-answers check and re-locks.
//
// Only "forbid" rules go here. A forbid can only make an app stricter, so it's safe everywhere. A permit
// here would give every app a door some of them don't need; permits stay in each app's own app.cedar.
// ─────────────────────────────────────────────────────────────────────────────────────────────

@id("https-only")
@description("Nothing leaves over plain http or ws: only https and wss")
forbid (principal, action, resource)
when { context.scheme != "https" && context.scheme != "wss" };

@id("never-delete")
@description("Never delete anything, anywhere")
forbid (principal, action == Action::"DELETE", resource);

@id("never-delete-by-address")
@description("Never send a change to an address that deletes, destroys, archives, trashes or removes (any capitals)")
forbid (principal, action, resource)
when {
  context.method != "GET" && context.method != "HEAD" && context.method != "OPTIONS" &&
  (context.pathLower like "*delete*" || context.pathLower like "*destroy*" || context.pathLower like "*archive*" ||
   context.pathLower like "*trash*" || context.pathLower like "*remove*")
};
