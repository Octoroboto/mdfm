const fs = require("fs"), path = require("path");   // Settings store. Process: Electron main. Loads and saves settings.json in the app's userData folder.
// Values are cleaned in main.js (settings:set) before they are saved; DEFAULTS fill anything missing from older files.
const DEFAULTS = { contentUpdates: true, useBundled: false, city: "", units: "f", volume: 0.8, a11y: {}, slackNews: false, slackChannels: "", nameFixes: "", types: {}, skin: "", slackRelay: "", axmod: { schema: 1, values: {}, channels: {} } };
// Path of settings.json.
function file(app) { return path.join(app.getPath("userData"), "settings.json"); }
// The saved settings over the defaults (defaults alone if the file is missing or broken).
function load(app) { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(app), "utf8")) }; } catch { return { ...DEFAULTS }; } }
// Writes a side file then renames it over settings.json, so a crash never leaves half a file.
function save(app, s) { const f = file(app), tmp = f + ".tmp"; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, f); }
module.exports = { load, save, DEFAULTS };
