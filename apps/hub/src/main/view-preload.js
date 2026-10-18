// Runs in the hub window's frames. Only the hub artifact's own frame (its claudeusercontent.com sandbox frame, under the hub
// artifact's page) gets the MDFM bridge: main decides (bridge-scope.js) and checks again on every call.
// Everything here is about the radio: live data, voices, settings.
// Process: preload of the hub view (WebContentsView, persist:mdhub session). nodeIntegrationInSubFrames is on so this
// also runs in the artifact's sandbox iframe; it only exposes window.mdfmApp there after main confirms the frame.
const { contextBridge, ipcRenderer, webFrame } = require("electron");
try { webFrame.insertCSS("::-webkit-scrollbar{width:0!important;height:0!important;background:transparent}"); } catch {}   // no scroll bars on the receiver
const n = v => (v == null || v === "" ? null : +v);   // a missing coordinate stays missing (not 0)
const host = location.hostname, isFrame = window.top !== window;   // host of the frame this copy of the preload is running in; isFrame: not the top page
let bridgeOk = false;
if (isFrame && /(^|\.)claudeusercontent\.com$/.test(host)) { try { bridgeOk = ipcRenderer.sendSync("hub:bridgeOk") === true; } catch {} }   // sync: the bridge has to be decided before the page's own scripts run
if (bridgeOk) {
  // Newer receiver look: add it over the page's own copy, but only when it's newer than what the page has.
  window.addEventListener("DOMContentLoaded", () => { try {
    const st = document.getElementById("mdfm-skin"), have = st && (/MedDev Receiver (\d+\.\d+\.\d+)/.exec(st.textContent.slice(0, 400)) || [])[1];
    if (!have) return; const nw = ipcRenderer.sendSync("hub:look"); if (!nw || !nw.css) return;
    const p = v => v.split(".").map(Number), a = p(nw.version), b = p(have);   // plain x.y.z compare (no dependencies in a preload)
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) webFrame.insertCSS(nw.css);
  } catch {} });
  contextBridge.exposeInMainWorld("mdfmApp", {
    hub: true,
    live: kind => ipcRenderer.invoke("hub:live", String(kind)),
    coords: (lat, lon) => ipcRenderer.send("hub:coords", { lat: n(lat), lon: n(lon) }),
    geoError: msg => ipcRenderer.send("hub:geoError", String(msg || "")),
    tts: spec => ipcRenderer.invoke("hub:tts", spec),
    skins: () => ipcRenderer.sendSync("hub:skins"),
    settings: { get: () => ipcRenderer.sendSync("hub:settings:get"), set: s => ipcRenderer.invoke("hub:settings:set", s),
      onChange: f => { if (typeof f === "function") ipcRenderer.on("hub:settings:changed", (e, s) => f(s)); } },
  });
}
