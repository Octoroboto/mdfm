const fs = require("fs"), path = require("path");
const DEFAULTS = { hubUrl: "https://claude.ai/artifact/V9DKVsKPguVWjCGFacb5iM", city: "", units: "f", types: {}, slackNews: false, slackChannels: "", nameFixes: "", skipVersion: "", skin: "" };
function file(app) { return path.join(app.getPath("userData"), "settings.json"); }
function load(app) { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(app), "utf8")) }; } catch { return { ...DEFAULTS }; } }
function save(app, s) { const f = file(app), tmp = f + ".tmp"; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, f); }
module.exports = { load, save, DEFAULTS };
