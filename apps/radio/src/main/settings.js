const fs = require("fs"), path = require("path");
const DEFAULTS = { contentUpdates: true, useBundled: false, city: "", units: "f", volume: 0.8, a11y: {}, slackNews: false, slackChannels: "", nameFixes: "", types: {} };
function file(app) { return path.join(app.getPath("userData"), "settings.json"); }
function load(app) { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(app), "utf8")) }; } catch { return { ...DEFAULTS }; } }
function save(app, s) { const f = file(app), tmp = f + ".tmp"; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, f); }
module.exports = { load, save, DEFAULTS };
