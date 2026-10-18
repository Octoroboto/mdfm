const fs = require("fs"), path = require("path");   // Settings store. Process: Electron main. Loads and saves settings.json in the app's userData folder.
// Values from the frame or hub page are cleaned in main.js before saving. hubUrl: the hub artifact the window opens;
// skipVersion: an app version the person chose to skip (futureproof.js). An optional bridgeArtifacts list may be added
// by hand (bridge-scope.js).
const DEFAULTS = { hubUrl: "https://claude.ai/artifact/V9DKVsKPguVWjCGFacb5iM", city: "", units: "f", types: {}, slackNews: false, slackChannels: "", nameFixes: "", skipVersion: "", skin: "", slackRelay: "" };
// Path of settings.json.
function file(app) { return path.join(app.getPath("userData"), "settings.json"); }
// The saved settings over the defaults (defaults alone if the file is missing or broken).
function load(app) { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(app), "utf8")) }; } catch { return { ...DEFAULTS }; } }
// Writes a side file then renames it over settings.json, so a crash never leaves half a file.
function save(app, s) { const f = file(app), tmp = f + ".tmp"; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, f); }
module.exports = { load, save, DEFAULTS };
