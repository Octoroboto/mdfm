// MD Hub: the Media Development Hub (a claude.ai artifact) in its own receiver window, with MDFM 99.9 HD wired to
// live local weather, sports (local + obscure), optional Slack company news and robot voices rendered through the EQ.
// Runs with zero Claude credits of its own; the hub page is the same artifact everyone else opens on claude.ai.
const { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, shell, Menu, safeStorage, screen, dialog } = require("electron");
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const security = require("./security");
const settingsStore = require("./settings");
const { createLive } = require("../common/live");
const { createSlack } = require("../common/slack");
const { startFutureproofer } = require("./futureproof");
const tts = require("./tts");
const pkg = require("../../package.json");

protocol.registerSchemesAsPrivileged([{ scheme: "mdhub", privileges: { standard: true, secure: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();

const STRIP = 44;   // height of the steel top strip (POWER / MIN / FULL, title, lights, SETTINGS)
const { createReceiverUpdater, versionOf } = require("../common/receiver");
// The look (MedDev Receiver, its own repo). Newer versions are fetched quietly; the frame uses them from the next launch,
// and the hub page gets the newer styling too (its controls' code updates when the hub artifact is republished).
const SHELL_SKIN = path.join(__dirname, "../shell/skin.css");
const look = createReceiverUpdater({ dir: path.join(app.getPath("userData"), "receiver"), getJSON: (u, o) => require("../common/net").getJSON(u, o),
  bundled: () => { try { const css = fs.readFileSync(SHELL_SKIN, "utf8"); return { version: versionOf(css) || "0.0.0", css, js: null }; } catch { return { version: "0.0.0" }; } },
  onChange: s => sendStatus(`A new receiver look (${s.version}) is ready. It shows from the next launch, or reload the hub (Cmd+R).`) });
const SHELL_SKINS = path.join(__dirname, "../shell/skins.json");
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
function skinsBundle() { const a = look.active(); if (a.source === "updated" && a.skins && Array.isArray(a.skins.skins)) return a.skins;
  try { return JSON.parse(fs.readFileSync(SHELL_SKINS, "utf8")); } catch { return { version: "0.0.0", default: "default", skins: [{ id: "default", name: "Default", description: "", css: "" }] }; } }
function currentSkin() { const b = skinsBundle(), want = settings && settings.skin; return b.skins.find(k => k.id === want) || b.skins.find(k => k.id === b.default) || b.skins[0]; }
const TYPE_KEYS = ["ids", "stingers", "ads", "interviews", "callers", "weather", "sports", "plays", "arts", "news"];
const HUB_HOSTS = /(^|\.)(claude\.ai|claudeusercontent\.com|claude\.site|claude\.com|anthropic\.com)$/;
const LOGIN_HOSTS = /(^|\.)(accounts\.google\.com|appleid\.apple\.com)$/;
let win = null, view = null, settings = null, fp = null, slack = null, settingsOpen = false;

const { appB, viewB, enginePackageVersion } = security.startBouncers({ notify: p => sendStatus(`Bouncer stopped a request: ${p.body}`) });
const getSettings = () => settings;
const saveSettings = patch => { settings = { ...settings, ...patch }; settingsStore.save(app, settings); return settings; };
const live = createLive(getSettings);

const summary = b => { const s = b.status(); return { level: s.level, label: s.label, mode: s.mode, healthy: s.healthy, blocked: s.counts.blocked, wouldBlock: s.counts.wouldBlock, problem: s.problems[0] || null }; };
function status(note) {
  const f = fp && fp.status();
  return { appVersion: app.getVersion(), live: { ...live.status }, bouncer: summary(appB), hubBouncer: summary(viewB),
    futureproofer: f ? { level: f.level, label: f.label, results: f.results.map(r => ({ id: r.id, title: r.title, level: r.level, summary: r.summary, action: r.action || null })) } : null,
    slack: slack ? { ...slack.status, ready: !!(pkg.mdfm && pkg.mdfm.slackRelay) } : null, note: note || null };
}
function sendStatus(note) { if (win && !win.isDestroyed()) win.webContents.send("status", status(note)); }

// ---- the steel frame (a local page) ----
function shellPage(name) {
  const file = path.join(__dirname, "../shell", name); if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}
function layout() {
  if (!win || !view) return;
  const [w, h] = win.getContentSize(), full = win.isFullScreen();
  view.setBounds(settingsOpen ? { x: 0, y: 0, width: 0, height: 0 } : { x: full ? 0 : 6, y: STRIP, width: Math.max(0, w - (full ? 0 : 12)), height: Math.max(0, h - STRIP - (full ? 0 : 6)) });
}
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 900, minWidth: 760, minHeight: 560, frame: false, backgroundColor: "#15161c", title: "MD Hub", show: false,
    webPreferences: { preload: path.join(__dirname, "shell-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  appB.tag(win.webContents, "shell"); viewB.tag(win.webContents, "shell");
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadURL("mdhub://app/shell.html");

  const hubSession = session.fromPartition("persist:mdhub");
  view = new WebContentsView({ webPreferences: { partition: "persist:mdhub", preload: path.join(__dirname, "view-preload.js"), nodeIntegrationInSubFrames: true,
    contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true } });
  win.contentView.addChildView(view); viewB.tag(view.webContents, "hub");
  const wc = view.webContents;
  wc.on("will-navigate", (e, url) => { try { const u = new URL(url); if (u.protocol === "https:" && (HUB_HOSTS.test(u.hostname) || LOGIN_HOSTS.test(u.hostname))) return; } catch {} e.preventDefault(); if (/^https:/.test(url)) shell.openExternal(url); });
  wc.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === "https:" && (LOGIN_HOSTS.test(u.hostname) || (HUB_HOSTS.test(u.hostname) && /\/(login|auth|oauth|magic-link)/.test(u.pathname))))
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, webPreferences: { partition: "persist:mdhub", contextIsolation: true, sandbox: true } } }; } catch {}
    if (/^https:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-create-window", w => viewB.tag(w.webContents, "login"));
  wc.on("did-finish-load", () => sendStatus());
  wc.loadURL(settings.hubUrl);

  win.on("resize", layout); win.on("enter-full-screen", () => { layout(); win.webContents.send("win:fullscreen", true); }); win.on("leave-full-screen", () => { layout(); win.webContents.send("win:fullscreen", false); });
  win.once("ready-to-show", () => { layout(); win.show(); });
  win.on("closed", () => { win = null; view = null; });
}

// A sign-in-friendly browser identity (claude.ai and Google sign-in expect a normal Chrome).
function chromeUA(ses) { ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|MD Hub|mdfm-hub)\/\S+/g, "")); }

app.whenReady().then(() => {
  settings = settingsStore.load(app);
  const relayUrl = (pkg.mdfm && pkg.mdfm.slackRelay) || "";
  slack = createSlack({ dataDir: app.getPath("userData"), safeStorage, relayUrl, getSettings,
    openExternal: url => { if (relayUrl && url.startsWith(relayUrl.replace(/\/$/, "") + "/start?")) shell.openExternal(url); } });

  protocol.handle("mdhub", req => {
    const name = new URL(req.url).pathname.replace(/^\//, "") || "shell.html", body = name === "skin.css" ? look.active().css : name === "theme.css" ? (currentSkin() || {}).css || "" : /^[a-z-]+\.(html|css|js)$/.test(name) ? shellPage(name) : null;
    if (body == null) return new Response("not found", { status: 404 });
    const type = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
    return new Response(body, { headers: { "content-type": type + "; charset=utf-8", "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'" } });
  });
  const hub = session.fromPartition("persist:mdhub");
  chromeUA(hub);
  viewB.attachSession(hub); appB.attachSession(session.defaultSession);
  const allowed = new Set(["geolocation", "notifications", "clipboard-sanitized-write", "fullscreen"]);
  hub.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
  hub.setPermissionCheckHandler((wc, perm) => allowed.has(perm));

  // ---- the hub page's bridge (only for claude.ai frames inside the hub view) ----
  const fromHub = e => { try { return view && e.sender === view.webContents && HUB_HOSTS.test(new URL(e.senderFrame.url).hostname); } catch { return false; } };
  const refreshLive = () => live.weather().then(() => live.sports()).then(() => sendStatus()).catch(() => sendStatus());
  setTimeout(refreshLive, 4000); setInterval(refreshLive, 15 * 60e3);
  ipcMain.handle("hub:live", async (e, kind) => { if (!fromHub(e)) return null; const v = kind === "weather" ? await live.weather() : kind === "sports" ? await live.sports() : kind === "news" ? await slack.fetchNews() : null; sendStatus(); return v; });
  ipcMain.on("hub:coords", (e, c) => { if (!fromHub(e)) return; live.setCoords(c); refreshLive(); });
  ipcMain.on("hub:geoError", (e, msg) => { if (!fromHub(e)) return; live.setGeoError(msg); sendStatus(); });
  ipcMain.handle("hub:tts", async (e, spec) => { if (!fromHub(e)) throw new Error("not allowed"); return tts.render({ text: String(spec && spec.text || ""), voice: spec && spec.voice ? String(spec.voice) : null, rate: +(spec && spec.rate) || 1, pitch: +(spec && spec.pitch) || 1 }); });
  // The content switches live in two places (the hub page's receiver and Settings): tell both when either changes.
  const typesNow = () => ({ types: { ...settings.types }, slackNews: !!settings.slackNews, skin: settings.skin || "" });
  const broadcastTypes = () => { const s = typesNow();
    if (win && !win.isDestroyed()) win.webContents.send("settings:types", s);
    if (view) for (const f of view.webContents.mainFrame.framesInSubtree) { try { if (f !== view.webContents.mainFrame && HUB_HOSTS.test(new URL(f.url).hostname)) f.send("hub:settings:changed", s); } catch {} } };
  // A newer look for the hub page's own styling (the preload compares it with the page's version and only ever adds a newer one).
  ipcMain.on("hub:look", e => { const a = look.active(); e.returnValue = fromHub(e) && a.source === "updated" ? { version: a.version, css: a.css } : null; });
  ipcMain.on("hub:settings:get", e => { e.returnValue = fromHub(e) ? { types: settings.types, slackNews: settings.slackNews, skin: settings.skin || "" } : {}; });
  ipcMain.on("hub:skins", e => { const a = look.active(); e.returnValue = fromHub(e) && a.source === "updated" && a.skins ? a.skins : null; });
  ipcMain.handle("hub:settings:set", (e, s) => { if (!fromHub(e)) return null; const t = {};
    for (const k of TYPE_KEYS) if (s && s.types && k in s.types) t[k] = !!s.types[k];
    const patch = { ...(s && s.types ? { types: t } : {}), ...(s && "slackNews" in s ? { slackNews: !!s.slackNews } : {}) };
    if (s && "skin" in s) patch.skin = SKIN_ID.test(String(s.skin || "")) ? String(s.skin) : "";
    saveSettings(patch); broadcastTypes(); return true; });

  // ---- the steel frame's controls ----
  const fromShell = e => win && e.sender === win.webContents;
  ipcMain.on("win:close", e => fromShell(e) && win.close());
  ipcMain.on("win:min", e => fromShell(e) && win.minimize());
  ipcMain.on("win:full", e => fromShell(e) && win.setFullScreen(!win.isFullScreen()));
  ipcMain.on("win:zoom", e => fromShell(e) && (win.isMaximized() ? win.unmaximize() : win.maximize()));
  let drag = null;   // drag by the metal: the window follows the pointer until release
  ipcMain.on("win:dragStart", e => { if (!fromShell(e) || win.isFullScreen()) return; const c = screen.getCursorScreenPoint(), [x, y] = win.getPosition(); clearInterval(drag && drag.t);
    drag = { dx: c.x - x, dy: c.y - y, until: Date.now() + 60e3, t: setInterval(() => { if (!win || Date.now() > drag.until) { clearInterval(drag.t); drag = null; return; }
      const p = screen.getCursorScreenPoint(); win.setPosition(Math.round(p.x - drag.dx), Math.round(p.y - drag.dy)); }, 12) };
    win.once("blur", () => { if (drag) { clearInterval(drag.t); drag = null; } }); });
  ipcMain.on("win:dragEnd", () => { if (drag) { clearInterval(drag.t); drag = null; } });
  ipcMain.on("shell:settings", (e, open) => { if (!fromShell(e)) return; settingsOpen = !!open; layout(); });
  ipcMain.on("shell:reload", e => { if (fromShell(e) && view) view.webContents.reload(); });
  ipcMain.on("settings:get", e => { e.returnValue = fromShell(e) ? settings : {}; });
  ipcMain.handle("settings:set", (e, s) => { if (!fromShell(e)) return settings; const before = settings;
    const patch = {}; for (const k of ["city", "units", "slackChannels", "nameFixes", "slackNews"]) if (s && k in s) patch[k] = k === "slackNews" ? !!s[k] : String(s[k]).slice(0, k === "nameFixes" ? 4000 : 500);
    if (s && s.types && typeof s.types === "object") { const t = {}; for (const k of TYPE_KEYS) if (k in s.types) t[k] = !!s.types[k]; patch.types = { ...settings.types, ...t }; if ("news" in t) patch.slackNews = t.news; }
    if (s && "skin" in s) patch.skin = SKIN_ID.test(String(s.skin || "")) ? String(s.skin) : "";
    saveSettings(patch); if (patch.types || "slackNews" in patch || "skin" in patch) broadcastTypes(); if (before.city !== settings.city || before.units !== settings.units) { live.reset(); refreshLive(); } return settings; });
  ipcMain.handle("skins:list", e => { if (!fromShell(e)) return null; const b = skinsBundle(), cur = currentSkin();
    return { houseDefault: b.default, choice: settings.skin || "", current: cur ? cur.id : "default", skins: b.skins.map(({ id, name, description }) => ({ id, name, description })) }; });
  ipcMain.handle("status:get", e => fromShell(e) ? status() : null);
  ipcMain.handle("update:check", async e => { if (fromShell(e)) await fp.run({ force: true }); return status(); });
  ipcMain.handle("slack:connect", async e => { if (!fromShell(e)) return false; try { await slack.connect(); saveSettings({ slackNews: true }); sendStatus("Slack connected. Company news plays at the top of the hour."); return true; } catch (err) { sendStatus(err.message); return false; } });
  ipcMain.handle("slack:disconnect", async e => { if (!fromShell(e)) return false; await slack.disconnect(); sendStatus("Slack disconnected."); return true; });
  ipcMain.handle("bouncer:details", e => { if (!fromShell(e)) return null; const d = b => ({ status: b.status(), recent: b.recent(30) }); return { app: d(appB), hub: d(viewB) }; });
  ipcMain.handle("bouncer:showLog", (e, which) => { if (!fromShell(e)) return; const f = (which === "hub" ? viewB : appB).status().log.file; if (f && fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(path.dirname(f)); });
  ipcMain.handle("open:url", (e, url) => { if (fromShell(e) && /^https:\/\/(github\.com\/Octoroboto\/|osv\.dev\/vulnerability\/)/.test(url)) shell.openExternal(url); });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ label: "Reload the hub", accelerator: "CmdOrCtrl+R", click: () => view && view.webContents.reload() }, { type: "separator" },
      { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => view && view.webContents.setZoomLevel(0) },
      { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => view && view.webContents.setZoomLevel(view.webContents.getZoomLevel() + .5) },
      { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => view && view.webContents.setZoomLevel(view.webContents.getZoomLevel() - .5) },
      { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "Check for updates", click: () => fp && fp.run({ force: true }).then(() => sendStatus()) },
      { label: "Open the hub in your browser", click: () => shell.openExternal(settings.hubUrl) }, { label: "MDFM on GitHub", click: () => shell.openExternal("https://github.com/Octoroboto/mdfm") }] },
  ]));
  createWindow();
  fp = startFutureproofer({ look, getWindow: () => win, getSettings, saveSettings, enginePackageVersion, onChange: () => sendStatus() });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
