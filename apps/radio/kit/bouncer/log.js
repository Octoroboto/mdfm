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
    fs.appendFileSync(f, JSON.stringify(rec) + '\n');
    lastHash = rec.hash;
    return rec;
  }

  // -> { ok, entries, brokenAt? }
  function verify(f = file()) {
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
