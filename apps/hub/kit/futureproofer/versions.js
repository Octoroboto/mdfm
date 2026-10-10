// Small semver helpers (no dependency): compare "44.5.1" style versions.
function parse(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +(m[2] || 0), patch: +(m[3] || 0), pre: m[4] || null };
}
function compare(a, b) {
  const pa = parse(a); const pb = parse(b);
  if (!pa || !pb) return 0;
  for (const k of ['major', 'minor', 'patch']) if (pa[k] !== pb[k]) return pa[k] - pb[k];
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  return 0;
}
const major = (v) => (parse(v) || { major: 0 }).major;
module.exports = { parse, compare, major };
