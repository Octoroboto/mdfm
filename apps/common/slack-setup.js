// "Set up Slack for MDFM": the builder's one-time wizard (only in a copy run from source, next to apps/slack-relay).
// It signs in to Cloudflare in an app window, deploys the sign-in helper, opens Slack with the MDFM app pre-filled, reads
// RentVision's team id, sets the helper's secrets, and saves the helper's address for this Mac and in config/slack.json.
// Pushing config/slack.json switches Slack on for everyone's apps (no app release). Runs Cloudflare's own tool (wrangler)
// through npx, the same commands as apps/slack-relay/README.md.
// Process: Electron main. Opened from the app's menu (radio and hub main.js) only when setupAvailable() finds the source tree.
// Security: the wizard window is sandboxed with a preload that exposes only its steps; its IPC handlers answer only that
// window; sign-in windows go through signin.js and the sign-in Bouncer with caller "setup". Secrets go to Cloudflare via
// wrangler's stdin and are never written to disk or the repo.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { spawn } = require("child_process");
const { openSignInWindow, CLOUDFLARE_HOSTS, SLACK_HOSTS } = require("./signin");
const { validRelay } = require("./slack-config");

// ---- pure helpers (tested) ----
// Only once the whole link has arrived (it can come in pieces): it must be followed by whitespace.
const findLoginUrl = out => (/(https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?[^\s"'<>]+)\s/.exec(String(out).replace(/[\u001b]\[[0-9;]*m/g, "")) || [])[1] || null;
const findWorkerUrl = out => (/(https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)\b/i.exec(out) || [])[1] || null;
const needsSubdomain = out => /register a workers\.dev subdomain|workers\.dev subdomain/i.test(out);
const loggedIn = out => /You are logged in|associated with the email/i.test(out) && !/not authenticated/i.test(out);
const findTeamId = url => (/app\.slack\.com\/client\/(T[A-Z0-9]{6,})/.exec(url || "") || [])[1] || null;
const findAppId = url => (/api\.slack\.com\/apps\/(A[A-Z0-9]{6,})/.exec(url || "") || [])[1] || null;
const validClientId = v => /^\d{6,}\.\d{6,}$/.test(String(v || "").trim());
const validSecret = v => /^[a-f0-9]{32}$/i.test(String(v || "").trim());
const validTeam = v => /^T[A-Z0-9]{6,}$/.test(String(v || "").trim());
// The Slack app manifest (apps/slack-relay/slack-app-manifest.json) with its OAuth redirect pointed at this helper's /callback.
function manifestFor(relay, base) {
  const m = JSON.parse(JSON.stringify(base)); m.oauth_config.redirect_urls = [`${relay.replace(/\/$/, "")}/callback`]; return m;
}
// Slack's "create an app from a manifest" link, pre-filled.
const slackCreateUrl = manifest => `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(manifest))}`;

// Cloudflare's page for picking a workers.dev subdomain (needed once before the first deploy).
const ONBOARDING = "https://dash.cloudflare.com/?to=/:account/workers/onboarding";

// Returns { repo, relayDir } when the app runs from source next to apps/slack-relay, else null (always null when packaged).
function setupAvailable({ app }) {
  if (app.isPackaged) return null;
  const repo = path.resolve(app.getAppPath(), "../.."), relayDir = path.join(repo, "apps/slack-relay");
  return fs.existsSync(path.join(relayDir, "wrangler.toml")) ? { repo, relayDir } : null;
}

let owner = null;   // the wizard window whose handlers are registered (a second wizard takes them over)
// Opens the wizard window and registers its IPC handlers. parent: the app window. saveOverride(relay): stores the address
// for this Mac. onDone(relay): tells the app Slack is ready. bouncer: the sign-in Bouncer. Returns the window, or null.
function startSlackSetup({ app, parent, saveOverride, onDone, bouncer }) {
  const where = setupAvailable({ app }); if (!where) return null;
  const { BrowserWindow, ipcMain } = require("electron");
  const win = new BrowserWindow({ width: 760, height: 820, title: "Set up Slack for MDFM", parent: parent && !parent.isDestroyed() ? parent : undefined,
    backgroundColor: "#15161c", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "slack-setup-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  // Only the wizard's own window may call its handlers.
  const mine = e => e.sender === win.webContents;
  const log = t => { if (!win.isDestroyed()) win.webContents.send("slackSetup:log", String(t).slice(0, 2000)); };
  // State gathered as the steps run: the helper's address, the new Slack app id, the team id, Cloudflare's login link.
  const st = { relay: "", appId: "", teamId: "", loginUrl: "" };
  const watch = what => ({ onBlocked: u => log(`${what}: the window tried to open ${u}, which isn't allowed there; it opened in your browser instead.`),
    onFail: m => log(`${what}: the page didn't load: ${m}. Use "Open in my browser instead".`) });
  const PARTITION = "persist:mdfm-setup";
  const guarded = { bouncer, caller: "setup" };
  const env = { ...process.env, PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin`, BROWSER: "none", WRANGLER_SEND_METRICS: "false", CI: "" };   // extra paths so npx is found when the app was launched from Finder; BROWSER none stops wrangler opening a browser itself
  // Runs `npx wrangler <args>` in apps/slack-relay, streaming its output to the log. input: written to stdin (secrets).
  // onOut(allOutputSoFar, process): called on every chunk. Resolves { code, out }; never rejects.
  function run(args, { input, onOut } = {}) {
    return new Promise(resolve => {
      log(`$ npx wrangler ${args.filter(a => a !== "--yes").join(" ")}`);
      const p = spawn("npx", ["--yes", "wrangler", ...args], { cwd: where.relayDir, env });
      let out = ""; const take = d => { const s = d.toString(); out += s; log(s.replace(/[\u001b]\[[0-9;]*m/g, "").trim()); onOut && onOut(out, p); };
      p.stdout.on("data", take); p.stderr.on("data", take);
      p.on("error", e => { out += e.message; resolve({ code: 1, out }); });
      p.on("close", code => resolve({ code, out }));
      if (input != null) { p.stdin.write(input); p.stdin.end(); }
    });
  }
  // One handler per wizard step; each returns { ok, note?, ... } for the page.
  const handlers = {
    // What's already known (for the page's first paint).
    async state() {
      const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(where.repo, "config/slack.json"), "utf8")); } catch { return {}; } })();
      if (!st.relay && validRelay(cfg.relay)) st.relay = cfg.relay;
      return { ...st, repo: where.repo };
    },
    // Signs in to Cloudflare: `wrangler login` prints a link, which opens in a sign-in window; wrangler's local callback
    // (127.0.0.1:8976) finishes it. Already signed in: done at once.
    async cloudflare() {
      const who = await run(["whoami"]);
      if (who.code === 0 && loggedIn(who.out)) return { ok: true, note: "Already signed in to Cloudflare." };
      let signWin = null;
      const r = await run(["login", "--browser=false"], { onOut: (out, proc) => {
        const url = findLoginUrl(out);
        if (url && !signWin) { st.loginUrl = url; log("Opening Cloudflare's sign-in. If the window stays blank, press \"Open in my browser instead\".");
          if (!win.isDestroyed()) win.webContents.send("slackSetup:loginUrl", "1");
          signWin = openSignInWindow(url, { parent: win, title: "Sign in to Cloudflare", hosts: CLOUDFLARE_HOSTS, anyHttps: true, localPorts: [8976], partition: PARTITION, ...guarded, width: 900, height: 820,
            ...watch("Cloudflare"), onClosed: () => { if (!st.browserLogin) { try { proc.kill(); } catch {} } } }); }
      } });
      if (signWin && !signWin.isDestroyed()) signWin.close();
      return r.code === 0 ? { ok: true, note: "Signed in to Cloudflare." } : { ok: false, note: "Cloudflare sign-in didn't finish. Try again." };
    },
    // Fallback: finish Cloudflare's sign-in in the normal browser. Cloudflare's tool is still waiting on this Mac, so it works the same.
    async browser(kind) {
      if (kind === "onboarding") { require("electron").shell.openExternal(ONBOARDING); return { ok: true, note: "Pick a workers.dev name in your browser, then press Deploy again." }; }
      if (!/^https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?/.test(st.loginUrl)) return { ok: false, note: "Press Sign in to Cloudflare first." };
      st.browserLogin = true; require("electron").shell.openExternal(st.loginUrl);
      return { ok: true, note: "Finish signing in in your browser. This step turns green when Cloudflare says you're in." };
    },
    // Deploys the helper (wrangler deploy) and reads its workers.dev address from the output.
    async deploy() {
      const r = await run(["deploy"]);
      const url = findWorkerUrl(r.out);
      if (r.code === 0 && url) { st.relay = url; return { ok: true, relay: url }; }
      if (needsSubdomain(r.out)) {
        openSignInWindow(ONBOARDING, { parent: win, title: "Pick your workers.dev name", hosts: CLOUDFLARE_HOSTS, anyHttps: true, partition: PARTITION, ...guarded, width: 1000, height: 820, ...watch("Cloudflare") });
        return { ok: false, onboarding: true, note: "Cloudflare needs a workers.dev name first. Pick one in the window that opened (or in your browser), then press Deploy again." };
      }
      return { ok: false, note: "The deploy didn't work. The log below says why." };
    },
    // Opens Slack's "create app" page pre-filled from the manifest; watches the URL for the new app id, then jumps to its
    // Basic Information page where the Client ID and Secret are.
    async slackApp() {
      if (!st.relay) return { ok: false, note: "Deploy the helper first." };
      const base = JSON.parse(fs.readFileSync(path.join(where.relayDir, "slack-app-manifest.json"), "utf8"));
      openSignInWindow(slackCreateUrl(manifestFor(st.relay, base)), { parent: win, title: "Create the MDFM Slack app", hosts: SLACK_HOSTS, partition: PARTITION, ...guarded, width: 1000, height: 820,
        ...watch("Slack"), onNavigate: (u, w) => { const id = findAppId(u); if (id && id !== st.appId) { st.appId = id; log(`Slack app created: ${id}`);
          if (!/\/general/.test(u)) setTimeout(() => { if (!w.isDestroyed()) w.loadURL(`https://api.slack.com/apps/${id}/general`); }, 800);
          if (!win.isDestroyed()) win.webContents.send("slackSetup:appId", id); } } });
      return { ok: true, note: "Finish creating the app in the Slack window, then copy the Client ID and Client Secret from its Basic Information page." };
    },
    // Opens Slack in a window and reads the team id from the app.slack.com/client/T... address it lands on.
    async team() {
      return new Promise(resolve => {
        let done = false;
        const w = openSignInWindow("https://app.slack.com/client", { parent: win, title: "Open the RentVision Slack", hosts: SLACK_HOSTS, partition: PARTITION, ...guarded, ...watch("Slack"),
          onNavigate: (u, ww) => { const t = findTeamId(u); if (t && !done) { done = true; st.teamId = t; log(`RentVision team id: ${t}`); setTimeout(() => ww.close(), 400); resolve({ ok: true, teamId: t }); } },
          onClosed: () => { if (!done) { done = true; resolve({ ok: false, note: "Closed before Slack opened. Sign in and pick RentVision, or type the team id." }); } } });
        return w;
      });
    },
    // Checks the three values, then stores them plus a fresh random STATE_KEY (signs the OAuth state) as Worker secrets.
    async secrets(f) {
      const id = String(f && f.clientId || "").trim(), secret = String(f && f.clientSecret || "").trim(), team = String(f && f.teamId || st.teamId || "").trim();
      if (!validClientId(id)) return { ok: false, note: "That Client ID doesn't look right (numbers, a dot, numbers)." };
      if (!validSecret(secret)) return { ok: false, note: "That Client Secret doesn't look right (32 letters and numbers)." };
      if (!validTeam(team)) return { ok: false, note: "That team id doesn't look right (starts with T)." };
      const stateKey = crypto.randomBytes(32).toString("base64");
      for (const [name, value] of [["SLACK_CLIENT_ID", id], ["SLACK_CLIENT_SECRET", secret], ["STATE_KEY", stateKey], ["TEAM_ID", team]]) {
        const r = await run(["secret", "put", name], { input: value + "\n" });
        if (r.code !== 0) return { ok: false, note: `Setting ${name} didn't work. The log below says why.` };
      }
      st.teamId = team; return { ok: true, note: "The helper has its secrets." };
    },
    // Saves the address for this Mac and in config/slack.json, and returns the git command that publishes it to everyone.
    async save() {
      if (!validRelay(st.relay)) return { ok: false, note: "Deploy the helper first." };
      saveOverride(st.relay);
      require("./write-atomic").writeAtomic(path.join(where.repo, "config/slack.json"), JSON.stringify({ relay: st.relay }, null, 2) + "\n");
      onDone && onDone(st.relay);
      return { ok: true, relay: st.relay, push: `cd ${where.repo.replace(require("os").homedir(), "~")} && git add config/slack.json && git commit -m "Switch on Slack sign-in" && git push` };
    },
  };
  // Register the handlers, replacing any from an earlier wizard window.
  const channels = Object.keys(handlers).map(k => `slackSetup:${k}`);
  channels.forEach(ch => ipcMain.removeHandler(ch));
  for (const k of Object.keys(handlers)) ipcMain.handle(`slackSetup:${k}`, async (e, a) => { if (!mine(e)) return { ok: false }; try { return await handlers[k](a); } catch (err) { log(err.message); return { ok: false, note: err.message }; } });
  owner = win;
  win.on("closed", () => { if (owner === win) { owner = null; channels.forEach(ch => ipcMain.removeHandler(ch)); } });   // an older wizard closing leaves a newer one working
  win.loadFile(path.join(__dirname, "slack-setup.html"));
  return win;
}

module.exports = { startSlackSetup, setupAvailable, findLoginUrl, findWorkerUrl, needsSubdomain, loggedIn, findTeamId, findAppId, validClientId, validSecret, validTeam, manifestFor, slackCreateUrl };
