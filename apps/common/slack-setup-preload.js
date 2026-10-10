// The setup wizard's only bridge: its own steps, nothing else.
const { contextBridge, ipcRenderer } = require("electron");
const step = n => a => ipcRenderer.invoke(`slackSetup:${n}`, a);
contextBridge.exposeInMainWorld("setup", {
  state: step("state"), cloudflare: step("cloudflare"), deploy: step("deploy"), slackApp: step("slackApp"), team: step("team"), secrets: step("secrets"), save: step("save"),
  onLog: f => { if (typeof f === "function") ipcRenderer.on("slackSetup:log", (e, t) => f(String(t))); },
  onAppId: f => { if (typeof f === "function") ipcRenderer.on("slackSetup:appId", (e, t) => f(String(t))); },
});
