// Bouncer: tamper-evident decision log (one JSON line per entry, each line carries the hash of the
// previous one, so editing or deleting a line breaks the chain and verify() reports where).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createLog(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = () => path.join(dir, `bouncer-${new Date().toISOString().slice(0, 7)}.jsonl`);
  let lastHash = null;
  let lastFile = null;

  function tail(f) {
    try {
      const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
      return lines.length ? JSON.parse(lines[lines.length - 1]).hash : null;
    } catch { return null; }
  }

  function append(entry) {
    const f = file();
    if (f !== lastFile) { lastFile = f; lastHash = tail(f); }
    const rec = { t: new Date().toISOString(), ...entry, prev: lastHash || 'start' };
    rec.hash = sha(JSON.stringify(rec));
    // Written synchronously on purpose: lines stay in order and survive a crash. Only blocks, would-blocks and
    // allowed changes are logged (never reads), so it's a handful of short lines, not one per request.
    const line = JSON.stringify(rec) + '\n';
    const fresh = checked && checked.file === f && checked.ok && sameStat(f, checked);
    fs.appendFileSync(f, line);
    lastHash = rec.hash;
    if (fresh) { const st = fs.statSync(f); Object.assign(checked, { entries: checked.entries + 1, size: st.size, mtimeMs: st.mtimeMs }); }
    else checked = null;
    return rec;
  }
  // The last full verify, kept while the file is only changed by this log: then status() doesn't re-read it.
  let checked = null;
  function sameStat(f, c) { try { const st = fs.statSync(f); return st.size === c.size && st.mtimeMs === c.mtimeMs; } catch { return false; } }

  // -> { ok, entries, brokenAt? }. Re-reads the whole file only when something other than this log changed it
  // (or it hasn't been read yet, or it's been 10 minutes); pass { full: true } to force a full re-read.
  function verify(f = file(), { full = false } = {}) {
    if (!full && checked && checked.file === f && Date.now() - checked.at < 600e3 && sameStat(f, checked)) return { ok: checked.ok, entries: checked.entries, ...(checked.brokenAt ? { brokenAt: checked.brokenAt } : {}) };
    const r = fullVerify(f);
    try { const st = fs.statSync(f); checked = { file: f, ...r, size: st.size, mtimeMs: st.mtimeMs, at: Date.now() }; } catch { checked = null; }
    return r;
  }
  function fullVerify(f) {
    let lines;
    try { lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean); } catch { return { ok: true, entries: 0 }; }
    let prev = 'start';
    for (let i = 0; i < lines.length; i++) {
      let rec;
      try { rec = JSON.parse(lines[i]); } catch { return { ok: false, entries: lines.length, brokenAt: i + 1 }; }
      const { hash, ...rest } = rec;
      if (rec.prev !== prev || sha(JSON.stringify(rest)) !== hash) return { ok: false, entries: lines.length, brokenAt: i + 1 };
      prev = hash;
    }
    return { ok: true, entries: lines.length };
  }

  function recent(n = 50, filter = () => true) {
    try {
      return fs.readFileSync(file(), 'utf8').trim().split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((r) => r && filter(r)).slice(-n).reverse();
    } catch { return []; }
  }

  return { append, verify, recent, file, dir };
}

module.exports = { createLog, sha };
