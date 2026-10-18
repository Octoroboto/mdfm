// MDFM Radio: the MDFM station in its own window. Plays with zero Claude credits.
// Process: Electron main (the app's entry point, package.json "main"). Owns the one radio window, serves the radio page
// over the private mdfm:// scheme with a strict per-page CSP, answers the page's IPC (only from that window), and starts
// Bouncer first so no request leaves without passing the Cedar rules. Shared modules come from src/common (apps/common).
const { app, BrowserWindow, ipcMain, protocol, session, shell, Menu, safeStorage, dialog } = require("electron");
const onscreen = require("../common/onscreen");
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const security = require("./security");
const settingsStore = require("./settings");
const { cleanAxmod } = require("../common/axmod-settings");
const { createLive } = require("../common/live");
const { createHeadlines } = require("../common/headlines");   // PTLK 108.0's live headlines and encyclopedia pages
const ptlkLive = createHeadlines();
const { createSlack } = require("../common/slack");
const { createSlackConfig } = require("../common/slack-config");
const { openSignInWindow } = require("../common/signin");
const { startSlackSetup, setupAvailable } = require("../common/slack-setup");
const pkg = require("../../package.json");
const { createUpdater, validateEngine, inlineScripts } = require("./updater");
const { startFutureproofer } = require("./futureproof");
const { createReceiverUpdater, applyToPage, versionOf } = require("../common/receiver");
const tts = require("./tts");
const { createFitter } = require("./winfit");

// mdfm:// is "standard" and "secure" so the page gets a normal origin (localStorage, Web Audio) without serving over http.
protocol.registerSchemesAsPrivileged([{ scheme: "mdfm", privileges: { standard: true, secure: true, supportFetchAPI: false } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); }   // a second launch focuses the first window instead (see "second-instance" below)

let win = null, settings = null, fp = null;   // win: the radio window; settings: the saved settings (settings.js); fp: Futureproofer, once started
// App updates: Download fetches the newest .dmg into ~/Downloads itself (progress on the Dock icon), then opens it.
const { createAppDownload, isReleaseDmg } = require("../common/app-download");
let appDl = null;
// Starts (or joins) the .dmg download for a release URL. The Dock icon shows progress; when done, a dialog explains the
// drag-to-Applications step; on failure it offers the release page in the browser instead.
function downloadUpdate(url, appName) {
  if (!appDl) appDl = createAppDownload({ downloadsDir: app.getPath("downloads"), openFile: f => shell.openPath(f), userAgent: appName.replace(/ /g, "-"),
    onProgress: p => { if (win && !win.isDestroyed()) win.setProgressBar(p.state === "downloading" ? Math.max(.02, p.pct) : -1); } });
  return appDl.start(url).then(() => {
    dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: "info", buttons: ["OK"], message: `The new ${appName} is in your Downloads folder`,
      detail: `It's open in Finder now: quit ${appName}, drag the new one into Applications, choose Replace, and open it again.` }).catch(() => {});
  }).catch(e => dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: "warning", buttons: ["Open the download page", "Cancel"], defaultId: 0, cancelId: 1,
      message: "The update didn't download", detail: e.message }).then(r => { if (r.response === 0) shell.openExternal(url); }).catch(() => {}));
}

// Bouncer starts first, before any window or request exists (rules: src/main/bouncer/policy.cedar).
const bouncer = security.startBouncer({ notify: p => sendStatus(`Bouncer stopped a request: ${p.body}`) });
const bundledDir = path.join(__dirname, "../../vendor");
const getSettings = () => settings;
const live = createLive(getSettings);
let slack = null, slackCfg = null;   // optional company news; created once the app is ready (needs userData + keychain)
// New content or a new look found right after launch is put on screen straight away (the app reloads itself), so a
// restart is all anyone needs. Later in a session it waits for the next launch, so music that's playing isn't cut off.
// Reloads the window if the app launched under 90 s ago (nothing worth interrupting yet), else just shows msg.
const launchedAt = Date.now(), FRESH_MS = 90e3;
function freshOrSay(msg) { if (win && !win.isDestroyed() && Date.now() - launchedAt < FRESH_MS) win.webContents.reload(); else sendStatus(msg); }
const updater = createUpdater({ app, getSettings, bundledDir, appVersion: app.getVersion(),
  onStatus: () => sendStatus(), onEngine: () => freshOrSay("New MDFM content is ready. It plays from the next launch, or press Cmd+R now.") });

// The look (MedDev Receiver, its own repo): newer versions are fetched quietly and swapped into the page on the next launch or Cmd+R.
// The look updater runs only when content updates are on and "Use bundled" is off.
const lookOn = () => !!(settings && settings.contentUpdates && !settings.useBundled);
// Bundled look version: read from the first 400 characters of the bundled page's <style id="mdfm-skin"> banner.
const bundledLook = () => { try { const h = fs.readFileSync(path.join(bundledDir, "radio.html"), "utf8"); return { version: versionOf((/<style id="mdfm-skin">([\s\S]{0,400})/.exec(h) || [])[1]) || "0.0.0" }; } catch { return { version: "0.0.0" }; } };
const look = createReceiverUpdater({ dir: path.join(app.getPath("userData"), "receiver"), getJSON: (u, o) => require("../common/net").getJSON(u, { timeout: 30000, maxBytes: 20e6, ...o }), bundled: bundledLook, enabled: lookOn,
  onChange: s => freshOrSay(`A new receiver look (${s.version}) is ready. It shows from the next launch, or press Cmd+R now.`) });

// ===== Status for the page =====
// The Station screen and Settings show this: content version, live data, Bouncer, Futureproofer, Slack. Sent on "status".
function status(note) { return { ...updater.status, engine: servedEngine || updater.status.engine, live: { ...live.status }, bouncer: bouncerSummary(), futureproofer: fp ? fpSummary() : null, slack: slack ? { ...slack.status, ready: slack.ready, builder: !!setupAvailable({ app }) } : null, note: note || null, appVersion: app.getVersion() }; }
function bouncerSummary() { const b = bouncer.status(); return { level: b.level, label: b.label, mode: b.mode, healthy: b.healthy, blocked: b.counts.blocked, problem: b.problems[0] || null, rules: b.policy.version }; }
function fpSummary() { const f = fp.status(); return { level: f.level, label: f.label, results: f.results.map(r => ({ id: r.id, title: r.title, level: r.level, summary: r.summary, action: r.action || null })) }; }
function sendStatus(note) { if (win && !win.isDestroyed()) win.webContents.send("status", status(note)); }

let servedEngine = null;   // the radio page actually being served (may be the bundled one if an update failed its check)
// The radio page to serve: the newest valid content update (or the bundled copy), with a newer look swapped in.
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
// The page's Content-Security-Policy: only its own inline scripts (by sha256 hash), inline styles, Google Fonts; no
// network (connect-src 'none'), so every outside call goes through IPC to main and through Bouncer.
function csp(html) {
  const hashes = inlineScripts(html).map(s => `'sha256-${crypto.createHash("sha256").update(s.code).digest("base64")}'`).join(" ");
  return ["default-src 'none'", `script-src ${hashes}`, "style-src 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com data:",
    "img-src data:", "connect-src 'none'", "media-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");
}

// Creates the frameless, transparent radio window. Sandboxed, contextIsolation, no Node; preload.js is the page's only bridge.
function createWindow() {
  // No macOS frame or title bar: the receiver itself is the window, with its own POWER / MIN / FULL buttons.
  win = new BrowserWindow({ width: 1060, height: 820, minWidth: 700, minHeight: 520, frame: false, transparent: true, hasShadow: false, backgroundColor: "#00000000",
    fullscreenable: true, title: "MDFM Radio", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: "user-gesture-required", spellcheck: false } });
  bouncer.tag(win.webContents, "radio");   // the radio window may only load its fonts
  win.once("ready-to-show", () => { onscreen.keepOnScreen(require("electron").screen, win); win.show(); });
  win.on("moved", () => onscreen.keepOnScreen(require("electron").screen, win));
  require("electron").screen.on("display-removed", () => onscreen.keepOnScreen(require("electron").screen, win));
  for (const ev of ["display-added", "display-metrics-changed"]) require("electron").screen.on(ev, () => onscreen.keepOnScreen(require("electron").screen, win));
  win.on("show", () => onscreen.keepOnScreen(require("electron").screen, win));
  const fsSend = v => { if (!win.isDestroyed()) win.webContents.send("win:fullscreen", v); };
  win.on("enter-full-screen", () => fsSend(true)); win.on("leave-full-screen", () => fsSend(false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/github\.com\/Octoroboto\//.test(url)) shell.openExternal(url); return { action: "deny" }; });   // new windows never open; GitHub links from the page go to the browser
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("mdfm://")) e.preventDefault(); });   // the page can't navigate away from mdfm://
  win.loadURL("mdfm://app/radio.html");
}

// ===== Startup =====
app.whenReady().then(async () => {
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
  // Every mdfm:// request returns the current page (it is a single-page app) with its CSP header.
  protocol.handle("mdfm", () => { const html = pageToServe(); return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp(html) } }); });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "geolocation"));   // only location is ever granted (the page uses it for local weather); everything else is refused
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === "geolocation");
  // ===== IPC from the radio page =====
  // The radio page's calls: only from the radio window's own page (not the setup wizard or any other window).
  const fromRadio = e => !!win && !win.isDestroyed() && e.sender === win.webContents && !!e.senderFrame && !e.senderFrame.parent;
  // live:get kinds: "weather", "sports", "news" (Slack), "headlines:business|gaming", "wiki:<Animal Title>" (pattern-checked here
  // too, before it reaches headlines.js).
  ipcMain.handle("live:get", async (e, kind) => { if (!fromRadio(e)) return null; const v = kind === "weather" ? await live.weather() : kind === "sports" ? await live.sports() : kind === "news" ? await slack.fetchNews()
    : /^(headlines:(business|gaming)|wiki:[A-Z][A-Za-z' -]{1,60})$/.test(String(kind)) ? await ptlkLive.get(kind) : null; if (!/^(headlines|wiki):/.test(String(kind))) sendStatus(); return v; });
  const refreshLive = () => live.weather().then(() => live.sports()).then(() => sendStatus()).catch(() => sendStatus());
  let coordsAt = 0;   // a new position refreshes weather and sports at most once a minute (same spot: nothing to do)
  ipcMain.on("live:coords", (e, c) => { if (!fromRadio(e) || !live.setCoords(c) || Date.now() - coordsAt < 60e3) return; coordsAt = Date.now(); refreshLive(); });
  ipcMain.on("live:geoError", (e, msg) => { if (!fromRadio(e)) return; live.setGeoError(msg); sendStatus(); });
  // Don't wait for a weather break: find the location and fetch weather and scores at launch, then every 15 minutes.
  setTimeout(refreshLive, 4000); setInterval(refreshLive, 15 * 60e3);
  ipcMain.on("settings:get", e => { e.returnValue = fromRadio(e) ? settings : {}; });   // sync: the page needs its settings before it can build the receiver
  // Saves settings from the page. Only listed keys are taken and each is cleaned (types, lengths, the skin id pattern), since
  // the renderer is untrusted. A changed city or units refetches the weather.
  ipcMain.handle("settings:set", (e, s) => { if (!fromRadio(e)) return settings;
    const before = settings; settings = { ...settings, ...pick(s, ["contentUpdates", "useBundled", "city", "units", "slackNews", "slackChannels", "nameFixes", "types", "skin"]) };
    if (s && "axmod" in s) settings.axmod = cleanAxmod(s.axmod);   // AXMOD accessibility settings (MedDev Receiver 1.7+)
    settings.skin = /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(settings.skin || "")) ? String(settings.skin) : "";
    { const t = {}; for (const k of ["meters", "ids", "stingers", "ads", "interviews", "callers", "weather", "sports", "plays", "arts", "podcast", "cooking", "homerepair", "garage", "funnelball", "showponies", "technews", "news"]) if (settings.types && k in settings.types) t[k] = !!settings.types[k]; settings.types = t; }
    settings.city = String(settings.city || "").slice(0, 120); settings.units = settings.units === "c" ? "c" : "f";
    settings.contentUpdates = settings.contentUpdates !== false; settings.useBundled = !!settings.useBundled;
    settings.slackNews = !!settings.slackNews; settings.slackChannels = String(settings.slackChannels || "").slice(0, 500); settings.nameFixes = String(settings.nameFixes || "").slice(0, 4000);
    settingsStore.save(app, settings);
    if (before.city !== settings.city || before.units !== settings.units) { live.reset(); setTimeout(() => live.weather().then(() => live.sports()).then(() => sendStatus()), 200); }
    sendStatus(before.useBundled !== settings.useBundled ? "Version choice saved. It applies from the next launch, or press Cmd+R now." : null); return settings;
  });
  ipcMain.handle("slack:connect", async e => { if (!fromRadio(e)) return false; try { await slack.connect(); if (!settings.slackNews) { settings = { ...settings, slackNews: true }; settingsStore.save(app, settings); } sendStatus("Slack connected. Company news plays at the top of the hour."); return true; }
    catch (e) { sendStatus(e.message); return false; } });
  ipcMain.handle("slack:setup", e => { if (!fromRadio(e)) return false; if (setupAvailable({ app })) openSlackSetup(); return !!setupAvailable({ app }); });
  ipcMain.handle("slack:disconnect", async e => { if (!fromRadio(e)) return false; await slack.disconnect(); sendStatus("Slack disconnected. The app no longer has access."); return true; });
  ipcMain.handle("update:check", async e => { if (!fromRadio(e)) return null; await fp.run({ force: true }); return status(); });
  ipcMain.handle("status:get", e => fromRadio(e) ? status() : null);
  // Save song (the floppy): the page makes the MP3 (and a MIDI file of the song), this asks where to put them (Music/MDFM by default). App kit save-file.
  require("../../kit/save-file/main.js").registerSaveFile({ subfolder: "MDFM", types: ["mp3", "mid"], isAllowedSender: e => !!win && !win.isDestroyed() && e.sender === win.webContents });   // isAllowedSender: only the radio window may save files
  // Renders a robot-voice line with macOS `say` (tts.js); the page plays the returned WAV bytes through its own audio chain.
  ipcMain.handle("tts:render", async (e, spec) => { if (!fromRadio(e)) throw new Error("not allowed"); return tts.render({ text: String(spec && spec.text || ""), voice: spec && spec.voice ? String(spec.voice) : null, rate: +(spec && spec.rate) || 1, pitch: +(spec && spec.pitch) || 1 }); });
  // Window buttons on the receiver (POWER / MIN / FULL): act on whichever window sent the message.
  const from = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on("win:close", e => from(e) && from(e).close());
  ipcMain.on("win:min", e => from(e) && from(e).minimize());
  ipcMain.on("win:full", e => { const w = from(e); if (w) w.setFullScreen(!w.isFullScreen()); });
  // Dragging the receiver by its metal. CSS drag regions alone proved unreliable on a frameless transparent window,
  // so the page also reports a press on bare metal and the window follows the pointer until the release.
  let drag = null;
  const stopDrag = () => { if (drag) { clearInterval(drag.t); drag = null; } };
  ipcMain.on("win:dragStart", e => { const w = from(e); if (!w || w.isFullScreen()) return; const { screen } = require("electron");
    const c = screen.getCursorScreenPoint(), [x, y] = w.getPosition(); clearInterval(drag && drag.t);
    drag = { w, dx: c.x - x, dy: c.y - y, until: Date.now() + 60e3, t: setInterval(() => {
      if (w.isDestroyed() || Date.now() > drag.until) { clearInterval(drag.t); drag = null; return; }
      const p = screen.getCursorScreenPoint(), q = onscreen.clampedPosition(screen, w, p.x - drag.dx, p.y - drag.dy); w.setPosition(Math.round(q.x), Math.round(q.y)); }, 12) };
    w.removeListener("blur", stopDrag); w.once("blur", stopDrag); });   // one listener per window, not one per drag
  ipcMain.on("win:dragEnd", stopDrag);
  ipcMain.on("win:zoom", e => { const w = from(e); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
  // The window follows the receiver's height: on load, and every time MIX opens, closes or changes section (1.25).
  // Clamped to the screen's work area, debounced, never below the deck (the receiver with MIX closed). See winfit.js.
  const fitters = new WeakMap();   // one fitter (debounce state) per window
  ipcMain.on("win:fit", (e, h, deck) => { const w = from(e); if (!w || w !== win) return;
    if (!fitters.has(w)) fitters.set(w, createFitter({ win: w, screen: require("electron").screen }));
    fitters.get(w).request(h, deck); });
  // Bouncer's "show log" button: reveals the blocked-request log in Finder.
  ipcMain.handle("bouncer:showLog", e => { if (!fromRadio(e)) return; const f = bouncer.status().log.file; if (f && fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(path.dirname(f)); });
  // Links from the page: a release .dmg starts the in-app download; only GitHub, OSV and Electron pages open in the browser.
  ipcMain.handle("open:url", (e, url) => { if (!fromRadio(e)) return; if (isReleaseDmg(url)) { downloadUpdate(String(url), "MDFM Radio"); return; } if (/^https:\/\/(github\.com\/Octoroboto\/|osv\.dev\/vulnerability\/|www\.electronjs\.org\/)/.test(url)) shell.openExternal(url); });
  // ===== Menu =====
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload", label: "Reload (applies new content)" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { label: "Bring Back to Center", accelerator: "CmdOrCtrl+Shift+0", click: () => onscreen.center(require("electron").screen, BrowserWindow.getAllWindows().find(x => !x.getParentWindow()) ) }, { type: "separator" }, { role: "front" }] },
    { role: "help", submenu: [{ label: "MDFM on GitHub", click: () => shell.openExternal("https://github.com/Octoroboto/mdfm") },
      ...(setupAvailable({ app }) ? [{ type: "separator" }, { label: "Set up Slack for MDFM…", click: () => openSlackSetup() }] : [])] },
  ]));
  // At every launch, check for new content and a new look first (up to 5 seconds), so the window opens with them.
  if (settings.contentUpdates && !settings.useBundled) await Promise.race([Promise.allSettled([updater.checkContent(), look.check()]), new Promise(r => setTimeout(r, 5000))]);
  createWindow(); updater.start();
  fp = startFutureproofer({ updater, look, enginePackageVersion: bouncer.status().enginePackageVersion, onChange: () => sendStatus() });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
// Another launch of the app: bring this window forward.
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
// Copies only the listed keys that exist in o (used to take settings from the page).
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
