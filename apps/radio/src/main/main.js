// MDFM Radio: the MDFM station in its own window. Plays with zero Claude credits.
const { app, BrowserWindow, ipcMain, protocol, session, shell, Menu, safeStorage } = require("electron");
const onscreen = require("../common/onscreen");
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const security = require("./security");
const settingsStore = require("./settings");
const { cleanAxmod } = require("../common/axmod-settings");
const { createLive } = require("../common/live");
const { createSlack } = require("../common/slack");
const { createSlackConfig } = require("../common/slack-config");
const { openSignInWindow } = require("../common/signin");
const { startSlackSetup, setupAvailable } = require("../common/slack-setup");
const pkg = require("../../package.json");
const { createUpdater, validateEngine, inlineScripts } = require("./updater");
const { startFutureproofer } = require("./futureproof");
const { createReceiverUpdater, applyToPage, versionOf } = require("../common/receiver");
const tts = require("./tts");

protocol.registerSchemesAsPrivileged([{ scheme: "mdfm", privileges: { standard: true, secure: true, supportFetchAPI: false } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, settings = null, fp = null;
// Bouncer starts first, before any window or request exists (rules: src/main/bouncer/policy.cedar).
const bouncer = security.startBouncer({ notify: p => sendStatus(`Bouncer stopped a request: ${p.body}`) });
const bundledDir = path.join(__dirname, "../../vendor");
const getSettings = () => settings;
const live = createLive(getSettings);
let slack = null, slackCfg = null;   // optional company news; created once the app is ready (needs userData + keychain)
const updater = createUpdater({ app, getSettings, bundledDir, appVersion: app.getVersion(),
  onStatus: () => sendStatus(), onEngine: () => sendStatus("New MDFM content is ready. It plays from the next launch, or press Cmd+R now.") });

// The look (MedDev Receiver, its own repo): newer versions are fetched quietly and swapped into the page on the next launch or Cmd+R.
const lookOn = () => !!(settings && settings.contentUpdates && !settings.useBundled);
const bundledLook = () => { try { const h = fs.readFileSync(path.join(bundledDir, "radio.html"), "utf8"); return { version: versionOf((/<style id="mdfm-skin">([\s\S]{0,400})/.exec(h) || [])[1]) || "0.0.0" }; } catch { return { version: "0.0.0" }; } };
const look = createReceiverUpdater({ dir: path.join(app.getPath("userData"), "receiver"), getJSON: (u, o) => require("../common/net").getJSON(u, o), bundled: bundledLook, enabled: lookOn,
  onChange: s => sendStatus(`A new receiver look (${s.version}) is ready. It shows from the next launch, or press Cmd+R now.`) });

function status(note) { return { ...updater.status, engine: servedEngine || updater.status.engine, live: { ...live.status }, bouncer: bouncerSummary(), futureproofer: fp ? fpSummary() : null, slack: slack ? { ...slack.status, ready: slack.ready, builder: !!setupAvailable({ app }) } : null, note: note || null, appVersion: app.getVersion() }; }
function bouncerSummary() { const b = bouncer.status(); return { level: b.level, label: b.label, mode: b.mode, healthy: b.healthy, blocked: b.counts.blocked, problem: b.problems[0] || null, rules: b.policy.version }; }
function fpSummary() { const f = fp.status(); return { level: f.level, label: f.label, results: f.results.map(r => ({ id: r.id, title: r.title, level: r.level, summary: r.summary, action: r.action || null })) }; }
function sendStatus(note) { if (win && !win.isDestroyed()) win.webContents.send("status", status(note)); }

let servedEngine = null;
function pageToServe() {
  const pick = updater.active();
  let html = fs.readFileSync(pick.file, "utf8");
  if (pick.source !== "bundled" && validateEngine(html, pick.version)) {   // a damaged update never runs
    const b = JSON.parse(fs.readFileSync(path.join(bundledDir, "version.json"), "utf8"));
    html = fs.readFileSync(path.join(bundledDir, "radio.html"), "utf8"); servedEngine = { version: b.version, source: "bundled" };
  } else servedEngine = { version: pick.version, source: pick.source };
  if (lookOn()) html = applyToPage(html, look.active());   // only ever swaps in a checked, newer look
  return html;
}
function csp(html) {
  const hashes = inlineScripts(html).map(s => `'sha256-${crypto.createHash("sha256").update(s.code).digest("base64")}'`).join(" ");
  return ["default-src 'none'", `script-src ${hashes}`, "style-src 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com data:",
    "img-src data:", "connect-src 'none'", "media-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");
}

function createWindow() {
  // No macOS frame or title bar: the receiver itself is the window, with its own POWER / MIN / FULL buttons.
  win = new BrowserWindow({ width: 1060, height: 820, minWidth: 700, minHeight: 520, frame: false, transparent: true, hasShadow: false, backgroundColor: "#00000000",
    fullscreenable: true, title: "MDFM Radio", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: "user-gesture-required", spellcheck: false } });
  bouncer.tag(win.webContents, "radio");   // the radio window may only load its fonts
  win.once("ready-to-show", () => { onscreen.keepOnScreen(require("electron").screen, win); win.show(); });
  win.on("moved", () => onscreen.keepOnScreen(require("electron").screen, win));
  require("electron").screen.on("display-removed", () => onscreen.keepOnScreen(require("electron").screen, win));
  const fsSend = v => { if (!win.isDestroyed()) win.webContents.send("win:fullscreen", v); };
  win.on("enter-full-screen", () => fsSend(true)); win.on("leave-full-screen", () => fsSend(false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/github\.com\/Octoroboto\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("mdfm://")) e.preventDefault(); });
  win.loadURL("mdfm://app/radio.html");
}

app.whenReady().then(() => {
  settings = settingsStore.load(app);
  // Slack: the sign-in helper's address (this Mac's setting, the app, or the mdfm repo's config/slack.json),
  // sign-in in an app window that closes itself, and the builder's one-time setup wizard.
  slackCfg = createSlackConfig({ dataDir: app.getPath("userData"), getJSON: (u, o) => require("../common/net").getJSON(u, o),
    packaged: (pkg.mdfm && pkg.mdfm.slackRelay) || "", getOverride: () => settings && settings.slackRelay });
  slack = createSlack({ dataDir: app.getPath("userData"), safeStorage, relayUrl: () => slackCfg.relay(), getSettings,
    openExternal: url => { const r = slackCfg.relay(); if (r && url.startsWith(r + "/start?")) shell.openExternal(url); },
    openSignIn: (url, onClosed) => { const u = new URL(url); return openSignInWindow(url, { parent: win, title: "Connect Slack to MDFM",
      extraHosts: [u.hostname], localPorts: [+u.searchParams.get("port")], onClosed, bouncer: security.signin(), caller: "slack-signin" }); } });
  const refreshSlackCfg = () => slackCfg.refresh().then(() => sendStatus()).catch(() => {});
  setTimeout(refreshSlackCfg, 6000); setInterval(refreshSlackCfg, 6 * 3600e3);
  const openSlackSetup = () => startSlackSetup({ app, parent: win, bouncer: security.signin(),
    saveOverride: v => { settings = { ...settings, slackRelay: v }; settingsStore.save(app, settings); sendStatus(); },
    onDone: () => sendStatus("Slack is switched on for this Mac. Push config/slack.json to switch it on for everyone.") });
  protocol.handle("mdfm", () => { const html = pageToServe(); return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp(html) } }); });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "geolocation"));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === "geolocation");
  ipcMain.handle("live:get", async (e, kind) => { const v = kind === "weather" ? await live.weather() : kind === "sports" ? await live.sports() : kind === "news" ? await slack.fetchNews() : null; sendStatus(); return v; });
  const refreshLive = () => live.weather().then(() => live.sports()).then(() => sendStatus()).catch(() => sendStatus());
  ipcMain.on("live:coords", (e, c) => { live.setCoords(c); refreshLive(); });
  ipcMain.on("live:geoError", (e, msg) => { live.setGeoError(msg); sendStatus(); });
  // Don't wait for a weather break: find the location and fetch weather and scores at launch, then every 15 minutes.
  setTimeout(refreshLive, 4000); setInterval(refreshLive, 15 * 60e3);
  ipcMain.on("settings:get", e => { e.returnValue = settings; });
  ipcMain.handle("settings:set", (e, s) => {
    const before = settings; settings = { ...settings, ...pick(s, ["contentUpdates", "useBundled", "city", "units", "slackNews", "slackChannels", "nameFixes", "types", "skin"]) };
    if (s && "axmod" in s) settings.axmod = cleanAxmod(s.axmod);   // AXMOD accessibility settings (MedDev Receiver 1.7+)
    settings.skin = /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(settings.skin || "")) ? String(settings.skin) : "";
    { const t = {}; for (const k of ["ids", "stingers", "ads", "interviews", "callers", "weather", "sports", "plays", "arts", "podcast", "cooking", "funnelball", "technews", "news"]) if (settings.types && k in settings.types) t[k] = !!settings.types[k]; settings.types = t; }
    settings.slackNews = !!settings.slackNews; settings.slackChannels = String(settings.slackChannels || "").slice(0, 500); settings.nameFixes = String(settings.nameFixes || "").slice(0, 4000);
    settingsStore.save(app, settings);
    if (before.city !== settings.city || before.units !== settings.units) { live.reset(); setTimeout(() => live.weather().then(() => live.sports()).then(() => sendStatus()), 200); }
    sendStatus(before.useBundled !== settings.useBundled ? "Version choice saved. It applies from the next launch, or press Cmd+R now." : null); return settings;
  });
  ipcMain.handle("slack:connect", async () => { try { await slack.connect(); if (!settings.slackNews) { settings = { ...settings, slackNews: true }; settingsStore.save(app, settings); } sendStatus("Slack connected. Company news plays at the top of the hour."); return true; }
    catch (e) { sendStatus(e.message); return false; } });
  ipcMain.handle("slack:setup", () => { if (setupAvailable({ app })) openSlackSetup(); return !!setupAvailable({ app }); });
  ipcMain.handle("slack:disconnect", async () => { await slack.disconnect(); sendStatus("Slack disconnected. The app no longer has access."); return true; });
  ipcMain.handle("update:check", async () => { await fp.run({ force: true }); return status(); });
  ipcMain.handle("status:get", () => status());
  ipcMain.handle("tts:render", async (e, spec) => tts.render({ text: String(spec && spec.text || ""), voice: spec && spec.voice ? String(spec.voice) : null, rate: +(spec && spec.rate) || 1, pitch: +(spec && spec.pitch) || 1 }));
  const from = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on("win:close", e => from(e) && from(e).close());
  ipcMain.on("win:min", e => from(e) && from(e).minimize());
  ipcMain.on("win:full", e => { const w = from(e); if (w) w.setFullScreen(!w.isFullScreen()); });
  // Dragging the receiver by its metal. CSS drag regions alone proved unreliable on a frameless transparent window,
  // so the page also reports a press on bare metal and the window follows the pointer until the release.
  let drag = null;
  ipcMain.on("win:dragStart", e => { const w = from(e); if (!w || w.isFullScreen()) return; const { screen } = require("electron");
    const c = screen.getCursorScreenPoint(), [x, y] = w.getPosition(); clearInterval(drag && drag.t);
    drag = { w, dx: c.x - x, dy: c.y - y, until: Date.now() + 60e3, t: setInterval(() => {
      if (w.isDestroyed() || Date.now() > drag.until) { clearInterval(drag.t); drag = null; return; }
      const p = screen.getCursorScreenPoint(), q = onscreen.clampedPosition(screen, w, p.x - drag.dx, p.y - drag.dy); w.setPosition(Math.round(q.x), Math.round(q.y)); }, 12) };
    w.once("blur", () => { if (drag) { clearInterval(drag.t); drag = null; } }); });
  ipcMain.on("win:dragEnd", () => { if (drag) { clearInterval(drag.t); drag = null; } });
  ipcMain.on("win:zoom", e => { const w = from(e); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
  let fitted = false;   // first load only: make the window as tall as the receiver (within the screen); after that the person decides
  ipcMain.on("win:fit", (e, h) => { const w = from(e); if (!w || fitted || !(h > 200)) return; fitted = true;
    const { screen } = require("electron"), wa = screen.getDisplayMatching(w.getBounds()).workArea, b = w.getBounds();
    const height = Math.min(Math.round(h), wa.height); w.setBounds({ x: b.x, y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - height)), width: b.width, height }); });
  ipcMain.handle("bouncer:showLog", () => { const f = bouncer.status().log.file; if (f && fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(path.dirname(f)); });
  ipcMain.handle("open:url", (e, url) => { if (/^https:\/\/(github\.com\/Octoroboto\/|osv\.dev\/vulnerability\/|www\.electronjs\.org\/)/.test(url)) shell.openExternal(url); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload", label: "Reload (applies new content)" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { label: "Bring Back to Center", accelerator: "CmdOrCtrl+Shift+0", click: () => onscreen.center(require("electron").screen, BrowserWindow.getAllWindows().find(x => !x.getParentWindow()) ) }, { type: "separator" }, { role: "front" }] },
    { role: "help", submenu: [{ label: "MDFM on GitHub", click: () => shell.openExternal("https://github.com/Octoroboto/mdfm") },
      ...(setupAvailable({ app }) ? [{ type: "separator" }, { label: "Set up Slack for MDFM…", click: () => openSlackSetup() }] : [])] },
  ]));
  createWindow(); updater.start();
  fp = startFutureproofer({ updater, look, enginePackageVersion: bouncer.status().enginePackageVersion, onChange: () => sendStatus() });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
