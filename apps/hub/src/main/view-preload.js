// Runs in the hub window's frames. Only the hub artifact's own frame (a claude.ai sandbox frame) gets the MDFM bridge,
// and the main process checks again on every call. Everything here is about the radio: live data, voices, settings.
const { contextBridge, ipcRenderer, webFrame } = require("electron");
try { webFrame.insertCSS("::-webkit-scrollbar{width:0!important;height:0!important;background:transparent}"); } catch {}   // no scroll bars on the receiver
const host = location.hostname, isFrame = window.top !== window;
if (isFrame && /(^|\.)(claudeusercontent\.com|claude\.ai|claude\.site|claude\.com)$/.test(host)) {
  // Newer receiver look: add it over the page's own copy, but only when it's newer than what the page has.
  window.addEventListener("DOMContentLoaded", () => { try {
    const st = document.getElementById("mdfm-skin"), have = st && (/MedDev Receiver (\d+\.\d+\.\d+)/.exec(st.textContent.slice(0, 400)) || [])[1];
    if (!have) return; const nw = ipcRenderer.sendSync("hub:look"); if (!nw || !nw.css) return;
    const p = v => v.split(".").map(Number), a = p(nw.version), b = p(have);
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) webFrame.insertCSS(nw.css);
  } catch {} });
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
