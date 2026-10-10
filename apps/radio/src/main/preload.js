// The only things the page can ask the app for. Nothing else crosses into the page.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = [];
ipcRenderer.on("status", (e, s) => listeners.forEach(f => { try { f(s); } catch {} }));
contextBridge.exposeInMainWorld("mdfmApp", {
  live: kind => ipcRenderer.invoke("live:get", String(kind)),
  coords: (lat, lon) => ipcRenderer.send("live:coords", { lat: +lat, lon: +lon }),
  settings: { get: () => ipcRenderer.sendSync("settings:get"), set: s => ipcRenderer.invoke("settings:set", s) },
  checkNow: () => ipcRenderer.invoke("update:check"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  onStatus: f => { if (typeof f === "function") listeners.push(f); },
  open: url => ipcRenderer.invoke("open:url", String(url)),
  win: {
    close: () => ipcRenderer.send("win:close"), minimize: () => ipcRenderer.send("win:min"), toggleFullScreen: () => ipcRenderer.send("win:full"),
    zoom: () => ipcRenderer.send("win:zoom"), dragStart: () => ipcRenderer.send("win:dragStart"), dragEnd: () => ipcRenderer.send("win:dragEnd"), fit: h => ipcRenderer.send("win:fit", +h),
    onFullScreen: f => { if (typeof f === "function") ipcRenderer.on("win:fullscreen", (e, v) => f(!!v)); },
  },
  showBouncerLog: () => ipcRenderer.invoke("bouncer:showLog"),
  slack: { connect: () => ipcRenderer.invoke("slack:connect"), disconnect: () => ipcRenderer.invoke("slack:disconnect") },
  autoplay: false,
});
