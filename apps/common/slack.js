// Optional Slack company news for MDFM. Runs in the main process. Read-only user token (channels:history, channels:read, users:read),
// stored encrypted by the OS keychain (Electron safeStorage). Connecting goes through a small sign-in helper (apps/slack-relay)
// that keeps the Slack app's secret out of this public repo; the token comes back to this Mac over 127.0.0.1 only.
// Sign-in opens in an app window (openSignIn) that closes itself when Slack hands the token back; without one it uses the browser.
// relayUrl can be a string or a function (the address can arrive later, from the mdfm repo's config/slack.json).
const http = require("http"), crypto = require("crypto"), fs = require("fs"), path = require("path");
const { getJSON } = require("./net");
const { writeAtomic } = require("./write-atomic");
const { personFromProfile, toItems, parseFixes, KIND_BY_NAME, parseChannelList } = require("./slack-parse");
const DEFAULT_CHANNELS = ["general", "littlevisionaries", "animal-pics"];

function createSlack({ dataDir, safeStorage, openExternal, openSignIn, relayUrl, getSettings, now = () => Date.now() }) {
  const relay = () => String((typeof relayUrl === "function" ? relayUrl() : relayUrl) || "");
  const tokenFile = path.join(dataDir, "slack.token");
  let token = null, channels = null, channelsAt = 0, users = {}, usersAt = {}, news = null, newsAt = 0, readIds = new Set();
  const status = { connected: false, team: null, news: "off", note: null };
  function loadToken() {
    try { if (safeStorage.isEncryptionAvailable() && fs.existsSync(tokenFile)) token = safeStorage.decryptString(fs.readFileSync(tokenFile)); } catch { token = null; }
    status.connected = !!token; return token;
  }
  function saveToken(t) { writeAtomic(tokenFile, safeStorage.encryptString(t), 0o600); token = t; status.connected = true; }
  async function api(method, params = {}) {
    const q = new URLSearchParams(params).toString();
    const j = await getJSON(`https://slack.com/api/${method}${q ? "?" + q : ""}`, { token });
    if (!j.ok) { if (/invalid_auth|token_revoked|account_inactive|not_authed/.test(j.error)) { disconnect(true); } throw new Error(j.error || "slack error"); }
    return j;
  }
  async function channelIds() {
    if (channels && now() - channelsAt < 6 * 3600e3) return channels;
    const map = {}; let cursor = "";
    for (let i = 0; i < 10; i++) {
      const j = await api("conversations.list", { types: "public_channel", exclude_archived: "true", limit: "1000", ...(cursor ? { cursor } : {}) });
      for (const c of j.channels || []) map[c.name] = c.id;
      cursor = j.response_metadata && j.response_metadata.next_cursor; if (!cursor) break;
    }
    channels = map; channelsAt = now(); return map;
  }
  async function user(id) {
    if (users[id] && now() - (usersAt[id] || 0) < 24 * 3600e3) return users[id];
    try { const j = await api("users.info", { user: id }); users[id] = personFromProfile(j.user); usersAt[id] = now(); } catch { users[id] = users[id] || null; }
    return users[id];
  }
  // Fetches the latest official post and a couple of puff candidates. Cached 10 minutes.
  async function fetchNews() {
    const s = getSettings();
    if (!token || !s.slackNews) { status.news = token ? "off in Settings" : "not connected"; return null; }
    if (news && now() - newsAt < 10 * 60e3) return pickFresh(news);
    try {
      const ids = await channelIds(), fixes = parseFixes(s.nameFixes);
      const wanted = [...new Set([...DEFAULT_CHANNELS, ...parseChannelList(s.slackChannels)])];
      const all = [], missing = [];
      for (const name of wanted) {
        const id = ids[name]; if (!id) { missing.push(name); continue; }
        const kind = KIND_BY_NAME[name] || "other", since = now() / 1000 - 7 * 86400;   // a week back at most
        let h; try { h = await api("conversations.history", { channel: id, limit: "20", oldest: String(Math.floor(since)) }); } catch (e) { missing.push(`${name} (${e.message})`); continue; }
        const ids2 = new Set(); for (const m of h.messages || []) { if (m.user) ids2.add(m.user); for (const x of (m.text || "").match(/<@([UW][A-Z0-9]+)/g) || []) ids2.add(x.slice(2)); }
        const map = {}; for (const u of ids2) { const p = await user(u); if (p) map[u] = p; }
        all.push(...toItems(h, { channel: name, kind, users: map, since, fixes }));
      }
      news = all; newsAt = now();
      status.news = `ok · ${all.length} post${all.length === 1 ? "" : "s"} this week` + (missing.length ? ` · couldn't read ${missing.join(", ")}` : "");
      return pickFresh(all);
    } catch (e) { status.news = "failed: " + e.message; return null; }
  }
  // Newest first, taking turns between the subscribed channels, until the break would run about two minutes.
  function pickFresh(all) {
    const items = budgetPick(all.filter(x => !readIds.has(x.id)));
    for (const x of items) readIds.add(x.id);
    return items.length ? { items } : null;
  }
  let pending = null;   // only one sign-in at a time
  function connect() {
    if (pending) { if (pending.win && pending.win.focus) pending.win.focus(); return pending.promise; }
    // Checked before a sign-in is "pending": a refusal here must not stick once the helper's address arrives.
    const relayBase = relay().replace(/\/$/, "");
    if (!relayBase) return Promise.reject(new Error("Slack isn't switched on for MDFM yet (no sign-in helper address)."));
    const p = { win: null };
    p.promise = new Promise((resolve, reject) => {
      const nonce = crypto.randomBytes(24).toString("base64url");
      let done = false;
      const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); try { srv.close(); } catch {} pending = null;
        if (p.win) setTimeout(() => { try { p.win.close(); } catch {} }, err ? 0 : 1200);
        err ? reject(err) : resolve(val); };
      const srv = http.createServer((req, res) => {
        if (req.method !== "POST" || req.url !== "/slack") { res.writeHead(404).end(); return; }
        let body = ""; req.on("data", d => { body += d; if (body.length > 8192) req.destroy(); });
        req.on("end", () => {
          const f = new URLSearchParams(body); let ok = f.get("nonce") === nonce && /^xoxp-/.test(f.get("token") || ""), err = null;
          if (ok) { try { saveToken(f.get("token")); } catch (e) { ok = false; err = new Error("Couldn't store the Slack token: " + e.message); } }   // stored first, so the page never says "connected" when it isn't
          res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
            .end(`<!doctype html><meta charset="utf-8"><title>MDFM</title><body style="font:16px system-ui;background:#111;color:#eee;padding:40px">${ok ? "Slack is connected. Taking you back to MDFM..." : "That didn't work. Try Connect Slack again from the app."}</body>`);
          if (ok) { status.team = f.get("team") || null; news = null; finish(null, true); } else if (err) finish(err);
        });
      });
      const timer = setTimeout(() => finish(new Error("Slack sign-in timed out.")), 5 * 60e3);
      srv.on("error", e => finish(e));
      srv.listen(0, "127.0.0.1", () => {
        const url = `${relayBase}/start?port=${srv.address().port}&nonce=${nonce}`;
        try { if (openSignIn) { p.win = openSignIn(url, () => finish(new Error("Slack sign-in was closed before it finished."))); }
        else openExternal(url); } catch (e) { finish(e); }
      });
    });
    pending = p; return p.promise;
  }
  async function disconnect(silent) {
    if (token && !silent) { try { await getJSON(`https://slack.com/api/auth.revoke`, { token }); } catch {} }
    token = null; news = null; users = {}; channels = null; try { fs.rmSync(tokenFile, { force: true }); } catch {}
    status.connected = false; status.team = null; status.news = "not connected";
  }
  loadToken();
  return { fetchNews, connect, disconnect, status, get connected() { return !!token; }, get ready() { return !!relay(); } };
}
module.exports = { createSlack, DEFAULT_CHANNELS };
const { budgetPick } = require("./slack-parse");
