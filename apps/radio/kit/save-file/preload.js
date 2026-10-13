// Add to the app's preload, inside the object it exposes (e.g. contextBridge.exposeInMainWorld("mdfmApp", { ..., ...saveFileBridge(ipcRenderer) })):
//   const { saveFileBridge } = require("../../kit/save-file/preload.js");
// With sandbox: true the preload can't require kit files; paste the one line instead:
//   saveFile: (bytes, name, extras) => ipcRenderer.invoke("kit:save-file", { bytes, name, extras }),
function saveFileBridge(ipcRenderer, channel = "kit:save-file") {
  return { saveFile: (bytes, name, extras) => ipcRenderer.invoke(channel, { bytes, name: String(name || ""), extras: Array.isArray(extras) ? extras : undefined }) };
}
module.exports = { saveFileBridge };
