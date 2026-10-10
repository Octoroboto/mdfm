// MDFM Radio: the MDFM station in its own window. Plays with zero Claude credits.
const { app, BrowserWindow, ipcMain, protocol, session, shell, Menu, safeStorage } = require("electron");
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const security = require("./security");
const settingsStore = require("./settings");
const { createLive } = require("../common/live");
const { createSlack } = require("../common/slack");
const pkg = require("../../package.json");
const { createUpdater, validateEngine, inlineScripts } = require("./updater");
const { startFutureproofer } = require("./futureproof");

protocol.registerSchemesAsPrivileged([{ scheme: "mdfm", privileges: { standard: true, secure: true, supportFetchAPI: false } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, settings = null, fp = null;
// Bouncer starts first, before any window or request exists (rules: src/main/bouncer/policy.cedar).
const bouncer = security.startBouncer({ notify: p => sendStatus(`Bouncer stopped a request: ${p.body}`) });
const bundledDir = path.join(__dirname, "../../vendor");
const getSettings = () => settings;
const live = createLive(getSettings);
let slack = null;   // optional company news; created once the app is ready (needs userData + keychain)
const updater = createUpdater({ app, getSettings, bundledDir, appVersion: app.getVersion(),
  onStatus: () => sendStatus(), onEngine: () => sendStatus("New MDFM content is ready. It plays from the next launch, or press Cmd+R now.") });

function status(note) { return { ...updater.status, engine: servedEngine || updater.status.engine, live: { ...live.status }, bouncer: bouncerSummary(), futureproofer: fp ? fpSummary() : null, slack: slack ? { ...slack.status, ready: !!(pkg.mdfm && pkg.mdfm.slackRelay) } : null, note: note || null, appVersion: app.getVersion() }; }
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
  return html;
}
function csp(html) {
  const hashes = inlineScripts(html).map(s => `'sha256-${crypto.createHash("sha256").update(s.code).digest("base64")}'`).join(" ");
  return ["default-src 'none'", `script-src ${hashes}`, "style-src 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
    "img-src data:", "connect-src 'none'", "media-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");
}

function createWindow() {
  // No macOS frame or title bar: the receiver itself is the window, with its own POWER / MIN / FULL buttons.
  win = new BrowserWindow({ width: 1060, height: 820, minWidth: 700, minHeight: 520, frame: false, transparent: true, hasShadow: false, backgroundColor: "#00000000",
    fullscreenable: true, title: "MDFM Radio", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: "user-gesture-required", spellcheck: false } });
  bouncer.tag(win.webContents, "radio");   // the radio window may only load its fonts
  win.once("ready-to-show", () => win.show());
  const fsSend = v => { if (!win.isDestroyed()) win.webContents.send("win:fullscreen", v); };
  win.on("enter-full-screen", () => fsSend(true)); win.on("leave-full-screen", () => fsSend(false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/github\.com\/Octoroboto\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("mdfm://")) e.preventDefault(); });
  win.loadURL("mdfm://app/radio.html");
}

app.whenReady().then(() => {
  settings = settingsStore.load(app);
  const relayUrl = (pkg.mdfm && pkg.mdfm.slackRelay) || "";
  slack = createSlack({ dataDir: app.getPath("userData"), safeStorage, relayUrl, getSettings,
    openExternal: url => { if (relayUrl && url.startsWith(relayUrl.replace(/\/$/, "") + "/start?")) shell.openExternal(url); } });
  protocol.handle("mdfm", () => { const html = pageToServe(); return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp(html) } }); });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "geolocation"));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === "geolocation");
  ipcMain.handle("live:get", async (e, kind) => { const v = kind === "weather" ? await live.weather() : kind === "sports" ? await live.sports() : kind === "news" ? await slack.fetchNews() : null; sendStatus(); return v; });
  ipcMain.on("live:coords", (e, c) => { live.setCoords(c); live.weather().then(() => live.sports()).then(() => sendStatus()); });
  ipcMain.on("settings:get", e => { e.returnValue = settings; });
  ipcMain.handle("settings:set", (e, s) => {
    const before = settings; settings = { ...settings, ...pick(s, ["contentUpdates", "useBundled", "city", "units", "slackNews", "slackChannels", "nameFixes", "types"]) };
    { const t = {}; for (const k of ["ids", "stingers", "ads", "interviews", "callers", "weather", "sports", "plays", "arts", "news"]) if (settings.types && k in settings.types) t[k] = !!settings.types[k]; settings.types = t; }
    settings.slackNews = !!settings.slackNews; settings.slackChannels = String(settings.slackChannels || "").slice(0, 500); settings.nameFixes = String(settings.nameFixes || "").slice(0, 4000);
    settingsStore.save(app, settings);
    if (before.city !== settings.city || before.units !== settings.units) live.reset();
    sendStatus(before.useBundled !== settings.useBundled ? "Version choice saved. It applies from the next launch, or press Cmd+R now." : null); return settings;
  });
  ipcMain.handle("slack:connect", async () => { try { await slack.connect(); if (!settings.slackNews) { settings = { ...settings, slackNews: true }; settingsStore.save(app, settings); } sendStatus("Slack connected. Company news plays at the top of the hour."); return true; }
    catch (e) { sendStatus(e.message); return false; } });
  ipcMain.handle("slack:disconnect", async () => { await slack.disconnect(); sendStatus("Slack disconnected. The app no longer has access."); return true; });
  ipcMain.handle("update:check", async () => { await fp.run({ force: true }); return status(); });
  ipcMain.handle("status:get", () => status());
  const from = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on("win:close", e => from(e) && from(e).close());
  ipcMain.on("win:min", e => from(e) && from(e).minimize());
  ipcMain.on("win:full", e => { const w = from(e); if (w) w.setFullScreen(!w.isFullScreen()); });
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
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "MDFM on GitHub", click: () => shell.openExternal("https://github.com/Octoroboto/mdfm") }] },
  ]));
  createWindow(); updater.start();
  fp = startFutureproofer({ updater, enginePackageVersion: bouncer.status().enginePackageVersion, onChange: () => sendStatus() });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
