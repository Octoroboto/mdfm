// Copies the built radio page from the mdfm repo into vendor/ (the version that ships inside the app).
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const repo = path.join(__dirname, "../../.."), vendor = path.join(__dirname, "../vendor");
execSync("node scripts/build.mjs", { cwd: repo, stdio: "inherit" });
const { version } = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(repo, "dist/radio.html"), path.join(vendor, "radio.html"));
fs.writeFileSync(path.join(vendor, "version.json"), JSON.stringify({ version }, null, 2) + "\n");
fs.rmSync(path.join(__dirname, "../src/common"), { recursive: true, force: true });
fs.cpSync(path.join(__dirname, "../../common"), path.join(__dirname, "../src/common"), { recursive: true });
console.log(`vendor/radio.html = MDFM ${version}; src/common synced`);
