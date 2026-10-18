// Copies the shared live-data, Slack and network code (apps/common) into src/common, which ships inside the app.
// Runs in Node from the command line before a build. Edit apps/common, never src/common (it's replaced each time).
const fs = require("fs"), path = require("path");
const dst = path.join(__dirname, "../src/common");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, "../../common"), dst, { recursive: true });
// The frame uses the same steel skin and the same content-type list as the radio and the hub (built in the mdfm repo).
const repo = path.join(__dirname, "../../..");
require("child_process").execSync("node scripts/build.mjs", { cwd: repo, stdio: "ignore" });
fs.copyFileSync(path.join(repo, "dist/skin.css"), path.join(__dirname, "../src/shell/skin.css"));
fs.copyFileSync(path.join(repo, "skin/types.js"), path.join(__dirname, "../src/shell/types.js"));
fs.copyFileSync(path.join(repo, "vendor/meddev-receiver/skins.json"), path.join(__dirname, "../src/shell/skins.json"));
fs.copyFileSync(path.join(repo, "vendor/meddev-receiver/receiver.js"), path.join(__dirname, "../src/shell/receiver.js"));   // AXMOD and the receiver behaviour for the frame
console.log("src/common and the skin synced");
