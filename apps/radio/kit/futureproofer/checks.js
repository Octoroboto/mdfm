// Futureproofer checks. Each returns { id, title, level, summary, details?, action? }
//   level: 'ok' | 'warn' (amber: plan an update) | 'bad' (red: fix now) | 'info'
// Network access is injected (getJson / postJson) so the app can route it through Bouncer.
const { compare, major } = require('./versions');

const result = (id, title, level, summary, extra = {}) => ({ id, title, level, summary, checkedAt: new Date().toISOString(), ...extra });

// Electron supports its newest 3 major versions (a new major every 8 weeks).
// https://www.electronjs.org/docs/latest/tutorial/electron-timelines
async function checkElectron({ current, getJson }) {
  const tags = await getJson('https://registry.npmjs.org/-/package/electron/dist-tags');
  const latest = tags.latest;
  const supportedFrom = major(latest) - 2;
  const cur = major(current);
  const base = { current, latest, supportedMajors: [supportedFrom, supportedFrom + 1, major(latest)] };
  if (cur < supportedFrom) {
    return result('electron', 'Electron (the app\'s engine)', 'bad',
      `Electron ${current} no longer gets security fixes (supported: ${supportedFrom}–${major(latest)}). Update to ${latest}.`, base);
  }
  if (compare(current, latest) < 0) {
    const lvl = cur < major(latest) ? 'warn' : 'info';
    return result('electron', 'Electron (the app\'s engine)', lvl, `Electron ${current} is supported; ${latest} is the newest.`, base);
  }
  return result('electron', 'Electron (the app\'s engine)', 'ok', `Electron ${current} is the newest.`, base);
}

// A package the app ships with (e.g. Bouncer's rule engine).
async function checkPackage({ id, title, name, current, getJson, behindMajorIsBad = false }) {
  const tags = await getJson(`https://registry.npmjs.org/-/package/${name}/dist-tags`);
  const latest = tags.latest;
  if (!current) return result(id, title, 'bad', `${name} is not installed.`, { latest });
  if (compare(current, latest) >= 0) return result(id, title, 'ok', `${name} ${current} is the newest.`, { current, latest });
  const lvl = major(current) < major(latest) && behindMajorIsBad ? 'bad' : 'warn';
  return result(id, title, lvl, `${name} ${current} → ${latest} available.`, { current, latest });
}

// Known security problems in the exact versions the app ships, from OSV (https://osv.dev),
// the open vulnerability database run by Google that covers the npm ecosystem.
async function checkVulnerabilities({ packages, postJson }) {
  const body = { queries: packages.filter((p) => p.version).map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })) };
  const res = await postJson('https://api.osv.dev/v1/querybatch', body);
  const found = [];
  (res.results || []).forEach((r, i) => {
    (r.vulns || []).forEach((v) => found.push({ package: body.queries[i].package.name, version: body.queries[i].version, id: v.id, url: `https://osv.dev/vulnerability/${v.id}` }));
  });
  if (!found.length) return result('vulnerabilities', 'Known security problems', 'ok', `None known in ${body.queries.map((q) => `${q.package.name} ${q.version}`).join(', ')}.`, { found });
  const pkgs = [...new Set(found.map((f) => f.package))];
  return result('vulnerabilities', 'Known security problems', 'bad', `${found.length} known in ${pkgs.join(', ')} — update ${pkgs.length > 1 ? 'them' : 'it'}.`, { found });
}

// macOS version + chip. Darwin 20–24 = macOS 11–15; Darwin 25 = macOS 26 (Apple's renumbering).
function macosFromDarwin(darwin) {
  const d = parseInt(String(darwin).split('.')[0], 10);
  if (!d) return null;
  return d >= 25 ? d + 1 : d - 9;
}
// Apple: macOS 26 is the last for Intel Macs; Rosetta 2 mostly goes away in macOS 28.
function checkMac({ darwinRelease, arch, translated, minMacos, testedMacos }) {
  const v = macosFromDarwin(darwinRelease);
  const notes = [];
  let level = 'ok';
  if (v && v < minMacos) { level = 'bad'; notes.push(`macOS ${v} is older than this app supports (${minMacos} or newer). Update macOS.`); }
  if (v && v > testedMacos) { level = level === 'bad' ? level : 'warn'; notes.push(`macOS ${v} is newer than the app was tested on (${testedMacos}). Report anything odd.`); }
  if (translated) { level = level === 'bad' ? level : 'warn'; notes.push('This Mac has an Apple chip but is running the Intel build through Rosetta, which Apple is removing. Install the Apple Silicon (arm64) build.'); }
  else if (arch === 'x64') { level = level === 'bad' ? level : 'warn'; notes.push('Intel Mac: Apple\'s last macOS for Intel is 26. Plan for an Apple Silicon Mac.'); }
  const chip = translated ? 'Apple Silicon (running Intel build)' : arch === 'arm64' ? 'Apple Silicon' : 'Intel';
  return result('mac', 'This Mac', level, notes.length ? notes.join(' ') : `macOS ${v || '?'} on ${chip} — supported.`, { macos: v, chip });
}

// The app's own releases, published on a public GitHub releases page.
async function checkAppRelease({ current, repo, getJson, arch }) {
  const rel = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  if (!latest) return result('app', 'This app', 'info', 'No releases published yet.', { current });
  const want = arch === 'arm64' ? /arm64/i : /x64|intel/i;
  const asset = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name) && want.test(a.name)) || (rel.assets || []).find((a) => /\.dmg$/i.test(a.name));
  const extra = { current, latest, notes: String(rel.body || '').slice(0, 2000), url: rel.html_url };
  if (compare(current, latest) >= 0) return result('app', 'This app', 'ok', `Version ${current} is the newest.`, extra);
  return result('app', 'This app', 'warn', `Version ${latest} is available (you have ${current}).`, {
    ...extra, action: { label: `Download ${latest}`, url: asset ? asset.browser_download_url : rel.html_url },
  });
}

// The build-time dependency report (npm audit + npm outdated, saved when the app was built).
function checkBuildReport({ report, maxAgeDays = 45, now = Date.now() }) {
  if (!report) return result('build', 'Build check', 'info', 'No build report (running from source).');
  const ageDays = Math.floor((now - Date.parse(report.createdAt)) / 864e5);
  const a = report.audit || {};
  const high = (a.high || 0) + (a.critical || 0);
  const shippedIssues = (report.shippedVulnerabilities || []).length;
  let level = 'ok';
  const notes = [];
  if (shippedIssues) { level = 'bad'; notes.push(`${shippedIssues} known problems in packages the app ships.`); }
  if (high) notes.push(`${high} high/critical warnings in build tools (not shipped in the app).`);
  if (ageDays > maxAgeDays) { level = level === 'bad' ? level : 'warn'; notes.push(`Built ${ageDays} days ago — time for a fresh build.`); }
  return result('build', 'Build check', level, notes.length ? notes.join(' ') : `Built ${ageDays} day(s) ago; no problems in shipped packages.`, { report: { createdAt: report.createdAt, audit: a, outdated: report.outdated || [] } });
}

module.exports = { checkElectron, checkPackage, checkVulnerabilities, checkMac, macosFromDarwin, checkAppRelease, checkBuildReport, result };
