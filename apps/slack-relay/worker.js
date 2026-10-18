// MDFM Radio Slack sign-in helper (Cloudflare Worker). It exists only so the Slack app's client secret never ships in the public repo.
// Flow: app opens /start?port&nonce -> Slack approval -> /callback swaps the code for the person's read-only user token
// -> this page hands the token straight to the app on 127.0.0.1:<port> and keeps nothing. No storage, no logs of tokens.
// Secrets (set with `npx wrangler secret put`): SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, STATE_KEY (random), TEAM_ID (RentVision's Slack team id).
// Runs on Cloudflare Workers (not in the app). Deployed with wrangler (apps/slack-relay/README.md, or the builder's setup
// wizard in common/slack-setup.js). Security: the OAuth state is HMAC-signed and expires in 10 minutes, the token only
// ever goes to 127.0.0.1, the team must be RentVision's, and every page is no-store, unframeable and script-locked by CSP.
const SCOPES = "channels:history,channels:read,users:read";   // Slack user-token scopes: read public channels and their history, and user names
const enc = new TextEncoder();
// base64url without padding.
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// HMAC-SHA256 of data with key, base64url (signs the OAuth state).
async function hmac(key, data) { const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data))); }
// Constant-time string compare, so a forged signature can't be found by timing.
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
// HTML-escapes a value placed into the page.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// An HTML page Response. Its CSP allows one inline script by hash; 'sha256-REPLACED' is swapped for the real hash on the
// callback page. form-action only to 127.0.0.1, so the form can post nowhere else.
const page = (body, status = 200) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MDFM Radio</title><body style="font:16px system-ui;background:#111;color:#eee;padding:40px">${body}</body>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-REPLACED'; form-action http://127.0.0.1:*; base-uri 'none'" } });
// The callback page's only script: submit the form to the app at once.
const AUTOSUBMIT = "document.forms[0].submit()";

// The Worker's request handler (exported for the tests). env: the secrets.
// /start?port&nonce: checks them, packs { port, nonce, expiry } into a signed state, and redirects to Slack's consent page.
// /callback: checks the state's signature and expiry, swaps the code for a user token (with the secret), checks the team,
// and returns a page that POSTs { nonce, token, team } to http://127.0.0.1:<port>/slack (common/slack.js listens there).
export async function handle(req, env) {
  const url = new URL(req.url), redirect = `${url.origin}/callback`;
  if (url.pathname === "/start") {
    const port = +url.searchParams.get("port"), nonce = url.searchParams.get("nonce") || "";
    if (!(port >= 1024 && port <= 65535) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return page("Bad request.", 400);
    const payload = b64u(enc.encode(JSON.stringify({ p: port, n: nonce, x: Date.now() + 10 * 60e3 })));
    const state = `${payload}.${await hmac(env.STATE_KEY, payload)}`;
    const q = new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, user_scope: SCOPES, redirect_uri: redirect, state, ...(env.TEAM_ID ? { team: env.TEAM_ID } : {}) });
    return Response.redirect(`https://slack.com/oauth/v2/authorize?${q}`, 302);
  }
  if (url.pathname === "/callback") {
    if (url.searchParams.get("error")) return page("Slack sign-in was cancelled. You can close this tab.");
    const [payload, sig] = (url.searchParams.get("state") || "").split(".");
    if (!payload || !sig || !safeEq(sig, await hmac(env.STATE_KEY, payload))) return page("This sign-in link isn't valid. Try Connect Slack again from the app.", 400);
    let st; try { st = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return page("Bad request.", 400); }
    if (!(st.x > Date.now())) return page("This sign-in link expired. Try Connect Slack again from the app.", 400);
    const r = await fetch("https://slack.com/api/oauth.v2.access", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, code: url.searchParams.get("code") || "", redirect_uri: redirect }) });
    const j = await r.json().catch(() => ({}));
    const token = j.authed_user && j.authed_user.access_token, team = j.team && j.team.id;
    if (!j.ok || !token) return page("Slack didn't give MDFM Radio access. Try again, or ask the person who set it up.", 400);
    if (env.TEAM_ID && team !== env.TEAM_ID) return page("MDFM Radio only works with the RentVision Slack.", 403);
    const res = page(`<p>Connecting MDFM Radio to Slack...</p><form method="post" action="http://127.0.0.1:${st.p}/slack">
<input type="hidden" name="nonce" value="${esc(st.n)}"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="team" value="${esc(team || "")}">
<noscript><button>Finish connecting</button></noscript></form><script>${AUTOSUBMIT}</script>`);
    const h = new Headers(res.headers); h.set("content-security-policy", h.get("content-security-policy").replace("sha256-REPLACED", `sha256-${await sha256b64(AUTOSUBMIT)}`));
    return new Response(res.body, { status: 200, headers: h });
  }
  return page("MDFM Radio Slack sign-in helper.", 404);
}
// Base64 (not url) sha256 of s, the form a CSP hash takes.
async function sha256b64(s) { return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))))); }
// Cloudflare's module Worker entry point.
export default { fetch: (req, env) => handle(req, env) };
