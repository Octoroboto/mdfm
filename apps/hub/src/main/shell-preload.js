// The steel frame's controls. Nothing else crosses into the frame page.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = [];
ipcRenderer.on("status", (e, s) => listeners.forEach(f => { try { f(s); } catch {} }));
contextBridge.exposeInMainWorld("mdhub", {
  win: { close: () => ipcRenderer.send("win:close"), minimize: () => ipcRenderer.send("win:min"), toggleFullScreen: () => ipcRenderer.send("win:full"),
    zoom: () => ipcRenderer.send("win:zoom"), dragStart: () => ipcRenderer.send("win:dragStart"), dragEnd: () => ipcRenderer.send("win:dragEnd"),
    onFullScreen: f => { if (typeof f === "function") ipcRenderer.on("win:fullscreen", (e, v) => f(!!v)); } },
  settings: { get: () => ipcRenderer.sendSync("settings:get"), set: s => ipcRenderer.invoke("settings:set", s),
    onTypes: f => { if (typeof f === "function") ipcRenderer.on("settings:types", (e, s) => f(s)); } },
  showSettings: open => ipcRenderer.send("shell:settings", !!open),
  reloadHub: () => ipcRenderer.send("shell:reload"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  onStatus: f => { if (typeof f === "function") listeners.push(f); },
  checkNow: () => ipcRenderer.invoke("update:check"),
  slack: { connect: () => ipcRenderer.invoke("slack:connect"), disconnect: () => ipcRenderer.invoke("slack:disconnect") },
  bouncerDetails: () => ipcRenderer.invoke("bouncer:details"),
  showBouncerLog: which => ipcRenderer.invoke("bouncer:showLog", which === "hub" ? "hub" : "app"),
  open: url => ipcRenderer.invoke("open:url", String(url)),
});
