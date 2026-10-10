// Sign-in windows for Slack (and, in the builder's setup, Cloudflare). A small, locked-down browser window: no Node, sandboxed,
// its own cookie jar, a normal Chrome user agent (Google sign-in refuses unknown browsers), and it can only go to the sign-in
// sites it needs. Anything else opens in the person's own browser. The window closes itself when the flow is done.
const SLACK_HOSTS = [/^slack\.com$/, /\.slack\.com$/, /\.slack-edge\.com$/, /\.slackb\.com$/, /^accounts\.google\.com$/, /\.gstatic\.com$/,
  /^apis\.google\.com$/, /^ssl\.gstatic\.com$/, /\.googleusercontent\.com$/, /^appleid\.apple\.com$/, /\.okta\.com$/];
const CLOUDFLARE_HOSTS = [/^dash\.cloudflare\.com$/, /\.cloudflare\.com$/, /^cloudflare\.com$/, /^accounts\.google\.com$/, /\.gstatic\.com$/, /^appleid\.apple\.com$/,
  /^challenges\.cloudflare\.com$/];

// Is this address one the sign-in window may open? (pure; tested)
function allowed(url, { hosts = SLACK_HOSTS, extraHosts = [], localPorts = [] } = {}) {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol === "about:" && url === "about:blank") return true;
  if ((u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return localPorts.includes(+u.port);
  if (u.protocol !== "https:") return false;
  return [...hosts, ...extraHosts].some(h => typeof h === "string" ? h === u.hostname : h.test(u.hostname));
}

function chromeUA(ses) {
  try { const v = process.versions.chrome; ses.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`); } catch {}
}

// Opens a sign-in window on url. onClosed fires if the person closes it first. Returns the window.
function openSignInWindow(url, { parent, title = "Sign in", hosts = SLACK_HOSTS, extraHosts = [], localPorts = [], partition = "persist:mdfm-signin", width = 560, height = 760, onClosed, onNavigate } = {}) {
  const { BrowserWindow, session, shell } = require("electron");
  const ses = session.fromPartition(partition); chromeUA(ses);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  const opts = { hosts, extraHosts, localPorts };
  const win = new BrowserWindow({ width, height, title, parent: parent && !parent.isDestroyed() ? parent : undefined, modal: false, show: false,
    backgroundColor: "#15161c", autoHideMenuBar: true, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
  const guard = (e, u) => { if (allowed(u, opts)) { onNavigate && onNavigate(u, win); return; } e.preventDefault(); if (/^https:/.test(u)) shell.openExternal(u); };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
  win.webContents.on("did-navigate", (e, u) => onNavigate && onNavigate(u, win));
  win.webContents.on("did-navigate-in-page", (e, u) => onNavigate && onNavigate(u, win));
  // Single sign-on sometimes opens a popup: allow it for the same sites, with the same rules.
  win.webContents.setWindowOpenHandler(({ url: u }) => allowed(u, opts)
    ? { action: "allow", overrideBrowserWindowOptions: { parent: win, width: 520, height: 700, autoHideMenuBar: true, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } } }
    : (/^https:/.test(u) && shell.openExternal(u), { action: "deny" }));
  win.webContents.on("did-create-window", w => { w.webContents.on("will-navigate", (e, u) => { if (!allowed(u, opts)) e.preventDefault(); }); });
  let closedByUs = false;
  win.on("closed", () => { if (!closedByUs && onClosed) onClosed(); });
  const close = win.close.bind(win); win.close = () => { closedByUs = true; if (!win.isDestroyed()) close(); if (parent && !parent.isDestroyed()) parent.focus(); };
  win.once("ready-to-show", () => win.show());
  win.loadURL(url);
  return win;
}

module.exports = { openSignInWindow, allowed, SLACK_HOSTS, CLOUDFLARE_HOSTS };
