// Copies the shared live-data, Slack and network code (apps/common) into src/common, which ships inside the app.
const fs = require("fs"), path = require("path");
const dst = path.join(__dirname, "../src/common");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, "../../common"), dst, { recursive: true });
// The frame uses the same steel skin and the same content-type list as the radio and the hub (built in the mdfm repo).
const repo = path.join(__dirname, "../../..");
require("child_process").execSync("node scripts/build.mjs", { cwd: repo, stdio: "ignore" });
fs.copyFileSync(path.join(repo, "dist/skin.css"), path.join(__dirname, "../src/shell/skin.css"));
fs.copyFileSync(path.join(repo, "skin/types.js"), path.join(__dirname, "../src/shell/types.js"));
console.log("src/common and the skin synced");
