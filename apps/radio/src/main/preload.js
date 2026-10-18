// Process: preload of the radio window (sandboxed, contextIsolation). Exposes window.mdfmApp; each call maps to one IPC
// channel that main.js handles (and main.js again checks the message came from the radio window).
// The only things the page can ask the app for. Nothing else crosses into the page.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = [];   // callbacks registered with onStatus()
const n = v => (v == null || v === "" ? null : +v);   // a missing coordinate stays missing (not 0)
// Status pushes from main fan out to every page listener; one listener throwing doesn't stop the others.
ipcRenderer.on("status", (e, s) => listeners.forEach(f => { try { f(s); } catch {} }));
contextBridge.exposeInMainWorld("mdfmApp", {
  live: kind => ipcRenderer.invoke("live:get", String(kind)),
  coords: (lat, lon) => ipcRenderer.send("live:coords", { lat: n(lat), lon: n(lon) }),
  tts: spec => ipcRenderer.invoke("tts:render", spec),
  geoError: msg => ipcRenderer.send("live:geoError", String(msg || "")),
  settings: { get: () => ipcRenderer.sendSync("settings:get"), set: s => ipcRenderer.invoke("settings:set", s) },
  checkNow: () => ipcRenderer.invoke("update:check"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  onStatus: f => { if (typeof f === "function") listeners.push(f); },
  open: url => ipcRenderer.invoke("open:url", String(url)),
  saveFile: (bytes, name, extras) => ipcRenderer.invoke("kit:save-file", { bytes, name: String(name || ""), extras: Array.isArray(extras) ? extras : undefined }),   // app kit save-file: the floppy's MP3 (and its MIDI beside it)
  win: {
    close: () => ipcRenderer.send("win:close"), minimize: () => ipcRenderer.send("win:min"), toggleFullScreen: () => ipcRenderer.send("win:full"),
    zoom: () => ipcRenderer.send("win:zoom"), dragStart: () => ipcRenderer.send("win:dragStart"), dragEnd: () => ipcRenderer.send("win:dragEnd"), fit: (h, deck) => ipcRenderer.send("win:fit", +h, +deck || 0),
    onFullScreen: f => { if (typeof f === "function") ipcRenderer.on("win:fullscreen", (e, v) => f(!!v)); },
  },
  showBouncerLog: () => ipcRenderer.invoke("bouncer:showLog"),
  slack: { connect: () => ipcRenderer.invoke("slack:connect"), disconnect: () => ipcRenderer.invoke("slack:disconnect"), setup: () => ipcRenderer.invoke("slack:setup") },
  autoplay: false,   // autoplay off: the page waits for a click before starting audio (matches the window's autoplayPolicy)
});
