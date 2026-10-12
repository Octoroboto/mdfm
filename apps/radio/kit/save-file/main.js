// Save file: a native "Save as" for files a page makes (an MP3 of the song playing, a CSV, a PNG).
// Local only: it writes one file the person picks in the dialog, never anything else, and never touches the network.
//   const { registerSaveFile } = require("../../kit/save-file/main.js");
//   registerSaveFile({ subfolder: "MDFM", isAllowedSender: e => e.sender === win.webContents });
// The preload then exposes saveFile (see preload.js), and pages call app.saveFile(bytes, "name.mp3").
const { ipcMain, dialog, app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path");
const DEFAULT_TYPES = ["mp3", "wav", "m4a", "zip", "csv", "json", "txt", "md", "png", "jpg", "jpeg", "webp", "pdf"];
const safeName = s => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 150);

function registerSaveFile({ channel = "kit:save-file", defaultDir = () => app.getPath("music"), subfolder = "", types = DEFAULT_TYPES,
  maxBytes = 300e6, isAllowedSender = () => true, onSaved = null } = {}) {
  let lastDir = null;
  ipcMain.handle(channel, async (e, req) => {
    if (!isAllowedSender(e)) throw new Error("This window can't save files.");
    const name = safeName(req && req.name) || "file", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    if (!ext || !types.includes(ext.toLowerCase())) throw new Error(`Can't save .${ext || "?"} files.`);
    const raw = req && req.bytes, buf = Buffer.from(raw instanceof Uint8Array ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : raw instanceof ArrayBuffer ? raw : []);
    if (!buf.length || buf.length > maxBytes) throw new Error("That file is empty or too big.");
    let dir = lastDir; if (!dir) { dir = path.join(defaultDir(), subfolder); try { fs.mkdirSync(dir, { recursive: true }); } catch { dir = defaultDir(); } }
    const win = BrowserWindow.fromWebContents(e.sender) || undefined;
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, name), filters: [{ name: ext.toUpperCase() + " file", extensions: [ext.toLowerCase()] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    fs.writeFileSync(r.filePath, buf); lastDir = path.dirname(r.filePath);
    if (onSaved) try { onSaved(r.filePath, buf.length); } catch {}
    return { path: r.filePath, bytes: buf.length };
  });
}
module.exports = { registerSaveFile, DEFAULT_TYPES };
