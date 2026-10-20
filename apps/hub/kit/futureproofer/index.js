// Futureproofer — keeps an app and everything it depends on current (reusable).
//
// The app registers checks (see checks.js for ready-made ones): each is { id, title, everyHours,
// run: async () => result }. Futureproofer runs them at launch, again on their own schedule while
// the app stays open, and before work when the last full check is older than `staleAfterDays`.
// Results are kept on disk so the badge is right even before the first check of a session.
const fs = require('fs');
const path = require('path');

const RANK = { ok: 0, info: 0, warn: 1, bad: 2 };

function createFutureproofer({ appName, stateFile, checks = [], notify = () => {}, staleAfterDays = 3, retryMinutes = 30, now = () => Date.now() }) {
  let state = { results: {}, lastFullCheck: null };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch {}
  // Written to a side file and renamed into place, so a crash or full disk never leaves half a state file.
  const save = () => { const tmp = `${stateFile}.${process.pid}.tmp`; try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, stateFile); } catch { try { fs.rmSync(tmp, { force: true }); } catch {} } };
  const registry = new Map(checks.map((c) => [c.id, c]));
  let runningNow = null;

  function register(check) { registry.set(check.id, check); }

  // For results learned outside a scheduled run (e.g. a live job found the automation broken).
  function setResult(id, r) {
    state.results[id] = { ...(state.results[id] || {}), ...r, id, checkedAt: r.checkedAt || new Date(now()).toISOString() };
    save();
    if (r.level === 'bad') notify({ title: 'Futureproofer: needs attention', body: r.summary || '' });
  }

  const due = (c) => {
    const r = state.results[c.id];
    if (r && r.failed) return now() - Date.parse(r.failedAt || 0) > retryMinutes * 60e3;   // retry a failed check sooner
    if (!r || !r.checkedAt) return true;
    return now() - Date.parse(r.checkedAt) > (c.everyHours || 6) * 3600e3;
  };

  // Runs every check that is due (or all of them with force). One run at a time.
  async function run({ force = false, only = null } = {}) {
    if (runningNow) return runningNow;
    runningNow = (async () => {
      const before = level({ ignoreFailed: true });
      const list = [...registry.values()].filter((c) => (only ? only.includes(c.id) : force || due(c)));
      for (const c of list) {
        try {
          const r = await c.run({ previous: state.results[c.id] || null }); // a check may remember things between runs (checkCedar does)
          state.results[c.id] = { ...r, id: c.id, title: r.title || c.title, checkedAt: r.checkedAt || new Date(now()).toISOString() };
        } catch (e) {
          const prev = state.results[c.id] || {};
          // A check that couldn't run keeps its last real checkedAt (if any), so offline doesn't look fresh.
          state.results[c.id] = { ...prev, id: c.id, title: c.title, level: prev.level === 'bad' ? 'bad' : 'warn', summary: `Couldn't check: ${e.message}`, failedAt: new Date(now()).toISOString(), failed: true };
        }
      }
      // A full check means every check ran and succeeded recently; a failure doesn't count.
      if ([...registry.values()].every((c) => { const r = state.results[c.id]; return r && !r.failed && !due(c); })) state.lastFullCheck = new Date(now()).toISOString();
      save();
      const after = level({ ignoreFailed: true });
      if (RANK[after] > RANK[before] && after !== 'ok') {
        const worst = Object.values(state.results).filter((r) => !r.failed && (r.level === 'bad' || r.level === 'warn')).map((r) => r.summary);
        notify({ title: after === 'bad' ? 'Futureproofer: needs attention' : 'Futureproofer: update available', body: worst[0] || '' });
      }
      return status();
    })();
    try { return await runningNow; } finally { runningNow = null; }
  }

  // Before work: re-check if the last full check is too old (never blocks on a network failure).
  async function ensureFresh() {
    if (!state.lastFullCheck || now() - Date.parse(state.lastFullCheck) > staleAfterDays * 864e5) {
      try { await run({ force: true }); } catch {}
    }
    return status();
  }

  // ignoreFailed: a check that couldn't run (offline) shows amber but doesn't send a notification.
  function level({ ignoreFailed = false } = {}) {
    const rs = [...registry.keys()].map((id) => state.results[id]).filter((r) => r && !(ignoreFailed && r.failed));
    let worst = 'ok';
    rs.forEach((r) => { if ((RANK[r.level] || 0) > RANK[worst]) worst = r.level; });
    return worst;
  }

  function status() {
    const stale = !state.lastFullCheck || now() - Date.parse(state.lastFullCheck) > staleAfterDays * 864e5;
    const results = [...registry.values()].map((c) => state.results[c.id] || { id: c.id, title: c.title, level: 'info', summary: 'Not checked yet.' });
    const worst = level();
    const toUpdate = results.filter((r) => r.level === 'warn' || r.level === 'bad').length;
    const badgeLevel = worst === 'bad' ? 'red' : worst === 'warn' || stale ? 'amber' : 'green';
    const label = worst === 'bad' ? 'Needs attention' : toUpdate ? `${toUpdate} to update` : stale ? 'Check due' : 'All current ✓';
    return { appName, level: badgeLevel, label, stale, lastFullCheck: state.lastFullCheck, results, running: !!runningNow };
  }

  let timer = null;
  function start({ firstDelayMs = 8000, everyMs = 3600e3 } = {}) {
    if (timer) return;
    setTimeout(() => run().catch(() => {}), firstDelayMs);
    timer = setInterval(() => run().catch(() => {}), everyMs); // each check still keeps its own interval
  }

  return { register, setResult, run, ensureFresh, status, start, results: () => state.results };
}

module.exports = { createFutureproofer, checks: require('./checks'), versions: require('./versions') };
