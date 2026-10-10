import test from "node:test"; import assert from "node:assert";
import { handle } from "../worker.js";
const env = { SLACK_CLIENT_ID: "123.456", SLACK_CLIENT_SECRET: "shh", STATE_KEY: "k".repeat(32), TEAM_ID: "T0RV" };
const nonce = "abcdefghijklmnop1234";
test("start redirects to Slack with user scopes and a signed state", async () => {
  const r = await handle(new Request(`https://relay.test/start?port=51234&nonce=${nonce}`), env);
  assert.equal(r.status, 302); const u = new URL(r.headers.get("location"));
  assert.equal(u.hostname, "slack.com"); assert.equal(u.searchParams.get("user_scope"), "channels:history,channels:read,users:read");
  assert.equal(u.searchParams.get("redirect_uri"), "https://relay.test/callback"); assert.ok(u.searchParams.get("state").includes("."));
  assert.equal(u.searchParams.get("client_secret"), null);
});
test("start rejects bad ports and nonces", async () => {
  assert.equal((await handle(new Request(`https://relay.test/start?port=80&nonce=${nonce}`), env)).status, 400);
  assert.equal((await handle(new Request(`https://relay.test/start?port=5000&nonce=x`), env)).status, 400);
});
test("callback: tampered state is refused; good state posts token to loopback only", async () => {
  const s = new URL((await handle(new Request(`https://relay.test/start?port=51234&nonce=${nonce}`), env)).headers.get("location")).searchParams.get("state");
  assert.equal((await handle(new Request(`https://relay.test/callback?code=c&state=${s}x`), env)).status, 400);
  const realFetch = globalThis.fetch; let sent;
  globalThis.fetch = async (u, o) => { sent = String(o.body); return new Response(JSON.stringify({ ok: true, authed_user: { access_token: "xoxp-test" }, team: { id: "T0RV" } })); };
  try {
    const r = await handle(new Request(`https://relay.test/callback?code=c&state=${s}`), env), html = await r.text();
    assert.equal(r.status, 200); assert.match(html, /action="http:\/\/127\.0\.0\.1:51234\/slack"/); assert.match(html, /xoxp-test/); assert.match(sent, /client_secret=shh/);
    assert.match(r.headers.get("content-security-policy"), /script-src 'sha256-[A-Za-z0-9+/=]+'/); assert.equal(r.headers.get("cache-control"), "no-store");
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, authed_user: { access_token: "xoxp-x" }, team: { id: "TOTHER" } }));
    assert.equal((await handle(new Request(`https://relay.test/callback?code=c&state=${s}`), env)).status, 403);
  } finally { globalThis.fetch = realFetch; }
});
