// Writes build/dependency-report.json (shipped inside the app; Futureproofer's "Build check" reads it):
// npm audit for everything and for shipped packages only, plus npm outdated. Run by build-mac.sh.
const { execFileSync } = require("child_process"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const npm = args => { try { return JSON.parse(execFileSync("npm", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) || "{}"); }
  catch (e) { try { return JSON.parse(e.stdout || "{}"); } catch { return { error: e.message }; } } };
const all = npm(["audit", "--json"]), shipped = npm(["audit", "--json", "--omit=dev"]), outdated = npm(["outdated", "--json"]);
const pkg = require(path.join(root, "package.json"));
const report = { createdAt: new Date().toISOString(), appVersion: pkg.version, node: process.version, electron: (pkg.devDependencies || {}).electron,
  audit: (all.metadata && all.metadata.vulnerabilities) || null,
  shippedVulnerabilities: Object.values(shipped.vulnerabilities || {}).map(v => ({ name: v.name, severity: v.severity, range: v.range })),
  outdated: Object.entries(outdated || {}).filter(([, v]) => v && v.current).map(([name, v]) => ({ name, current: v.current, wanted: v.wanted, latest: v.latest })) };
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "dependency-report.json"), JSON.stringify(report, null, 2) + "\n");
const a = report.audit || {};
console.log(`Dependency report: shipped packages with known problems: ${report.shippedVulnerabilities.length}; all warnings: ${a.critical || 0} critical, ${a.high || 0} high; outdated: ${report.outdated.length}`);
