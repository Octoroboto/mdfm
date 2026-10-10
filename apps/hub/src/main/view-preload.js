// Runs in the hub window's frames. Only the hub artifact's own frame (a claude.ai sandbox frame) gets the MDFM bridge,
// and the main process checks again on every call. Everything here is about the radio: live data, voices, settings.
const { contextBridge, ipcRenderer, webFrame } = require("electron");
try { webFrame.insertCSS("::-webkit-scrollbar{width:0!important;height:0!important;background:transparent}"); } catch {}   // no scroll bars on the receiver
const host = location.hostname, isFrame = window.top !== window;
if (isFrame && /(^|\.)(claudeusercontent\.com|claude\.ai|claude\.site|claude\.com)$/.test(host)) {
  contextBridge.exposeInMainWorld("mdfmApp", {
    hub: true,
    live: kind => ipcRenderer.invoke("hub:live", String(kind)),
    coords: (lat, lon) => ipcRenderer.send("hub:coords", { lat: +lat, lon: +lon }),
    geoError: msg => ipcRenderer.send("hub:geoError", String(msg || "")),
    tts: spec => ipcRenderer.invoke("hub:tts", spec),
    settings: { get: () => ipcRenderer.sendSync("hub:settings:get"), set: s => ipcRenderer.invoke("hub:settings:set", s),
      onChange: f => { if (typeof f === "function") ipcRenderer.on("hub:settings:changed", (e, s) => f(s)); } },
  });
}
