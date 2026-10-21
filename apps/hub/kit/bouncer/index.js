// Bouncer — outbound request allowlist for Electron apps (reusable; app supplies the policy).
//
// Default deny: a request leaves the app only if a rule in the app's Cedar policy permits it.
// Two gates cover every route out of the app:
//   1. attachSession(ses): Electron's request hook for every window using that session
//      (pages, hidden windows, and Electron `net` requests). A session has room for one hook, so a module that opens
//      its own windows on its own session (mdfm-live's Connect Slack window) claims it with attachSession(ses, { own: true }):
//      its Bouncer takes over that session whichever order they attach in, and the app's catch-all
//      app.on('session-created', s => bouncer.attachSession(s)) leaves a claimed session alone.
//   2. assert(req) / guardFetch: called by the app's own code before Node requests
//      (fetch, https) — those don't pass through Electron's hook.
// Modes (from the app's bouncer.config.json, fixed at build time):
//   "observe": requests the rules don't allow still go through and are logged as "would block". Two things
//              are stopped even in observe: everything, when the rules don't match their lock or the engine
//              won't load (Bouncer is unhealthy); and nothing else. Use observe to try reviewed rules out.
//   "enforce": requests the rules don't allow, and addresses Bouncer can't read, are cancelled before they leave the Mac.
const crypto = require('crypto');
const { requestFacts, NETWORK_SCHEMES } = require('./facts');
const { createLog } = require('./log');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// GraphQL operation name, when the body has one (shown in the log).
const opName = (f) => (f.form && f.form.operationName) || ((f.search || '').match(/[?&]op=([^&]+)/) || [])[1] || undefined;

class BouncerBlocked extends Error {
  constructor(facts, caller, why) {
    super(`Blocked by Bouncer: ${facts.method} ${facts.host}${facts.path} (${why})`);
    this.code = 'BOUNCED';
    this.facts = facts;
    this.caller = caller;
  }
}

function createBouncer({
  appName,
  policyText,
  config = {},
  lock = {},
  logDir,
  notify = () => {},
  engineFactory,        // (policyText) -> engine; defaults to Cedar
  enginePackage = '@cedar-policy/cedar-wasm',
  enginePackageVersion = null,
  now = () => Date.now(),
  modeOverride = null, // developer runs only (the app passes it only when not packaged)
}) {
  const mode = modeOverride === 'observe' ? 'observe' : config.mode === 'enforce' ? 'enforce' : 'observe';
  const log = createLog(logDir);
  const problems = [];
  const counts = { allowed: 0, blocked: 0, wouldBlock: 0 };
  const tags = new Map(); // webContents id -> caller
  const expected = new Map(); // host -> expiry: the app's own Electron net requests in flight
  const daily = { day: null, byRoute: new Map() };
  const lastNotice = new Map();
  let lastUpdateCheck = null;
  let latestEngine = null;
  let updateError = null;

  // 1. Is the policy the one that was reviewed and locked at build time?
  const policySha = sha256(policyText || '');
  const configSha = sha256(JSON.stringify(config));
  const lockOk = lock.policySha256 === policySha && lock.configSha256 === configSha;
  if (!lockOk) problems.push('The rules file doesn\'t match the locked copy (bouncer.lock.json). Run "npm run bouncer:lock" after reviewing a rules change.');

  // 2. Load the engine and the rules.
  let engine = null;
  try {
    engine = engineFactory ? engineFactory(policyText) : require('./engine-cedar').createCedarEngine(policyText);
  } catch (e) {
    problems.push(`The rule engine didn't load: ${e.message}`);
  }
  const healthy = () => !!engine && lockOk;

  function sameToday(routeKey, bump) {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (daily.day !== day) { daily.day = day; daily.byRoute = new Map(); }
    const n = daily.byRoute.get(routeKey) || 0;
    if (bump) daily.byRoute.set(routeKey, n + 1);
    return n;
  }

  function noticeOnce(key, payload) {
    const t = now();
    if ((lastNotice.get(key) || 0) > t - 60000) return;
    lastNotice.set(key, t);
    notify(payload);
  }

  // -> { allow, decision, enforced, reasons, facts, caller, why }
  function check(req, caller = 'app', { count = true } = {}) {
    const facts = requestFacts(req);
    if (!facts.ok) {
      const r = { allow: mode !== 'enforce', decision: 'deny', enforced: mode === 'enforce', reasons: [], facts, caller, why: 'unreadable address' };
      log.append({ d: r.enforced ? 'blocked' : 'would-block', caller, url: String(req.url).slice(0, 300), why: r.why });
      return r;
    }
    if (!NETWORK_SCHEMES.has(facts.scheme)) return { allow: true, decision: 'allow', enforced: false, reasons: ['not-network'], facts, caller };
    facts.sameToday = sameToday(facts.routeKey, false);
    let result;
    if (!healthy()) {
      result = { decision: 'deny', reasons: [], errors: problems.slice() };
    } else {
      try { result = engine.decide(caller, facts); } catch (e) { result = { decision: 'deny', reasons: [], errors: [e.message] }; }
    }
    const denied = result.decision !== 'allow';
    // Rules that don't match their lock (or a broken engine) block in every mode: observe is for trying out
    // reviewed rules, not for running unreviewed ones.
    const enforced = denied && (mode === 'enforce' || !healthy());
    const why = denied
      ? (result.reasons.length ? `stopped by rule ${result.reasons.join(', ')}` : !healthy() ? 'Bouncer is not healthy' : 'no rule allows this')
      : `allowed by ${result.reasons.join(', ')}`;
    if (!denied && count) sameToday(facts.routeKey, true);
    if (denied) {
      if (enforced) counts.blocked++; else counts.wouldBlock++;
      log.append({ d: enforced ? 'blocked' : 'would-block', caller, method: facts.method, host: facts.host, path: facts.path, op: opName(facts), fields: facts.fields, rules: result.reasons, why, errors: result.errors && result.errors.length ? result.errors : undefined });
      if (enforced) noticeOnce(facts.routeKey + caller, { title: 'Blocked by Bouncer', body: `${facts.method} ${facts.host}${facts.path} — ${why}` });
    } else {
      counts.allowed++;
      const quiet = result.reasons.length && result.reasons.every((r) => (config.quietRules || []).includes(r));
      if (count && !quiet && facts.method !== 'GET' && facts.method !== 'HEAD' && facts.method !== 'OPTIONS') {
        log.append({ d: 'allowed', caller, method: facts.method, host: facts.host, path: facts.path, op: opName(facts), fields: facts.fields, rules: result.reasons });
      }
    }
    return { allow: !enforced, decision: result.decision, enforced, reasons: result.reasons, facts, caller, why };
  }

  // For the app's own requests: throws BouncerBlocked when enforced.
  function assert(req, caller = 'app') {
    const r = check(req, caller);
    if (!r.allow) throw new BouncerBlocked(r.facts, caller, r.why);
    return r;
  }

  // Wraps a fetch() so every call is checked first.
  function guardFetch(fetchFn, caller = 'app') {
    return (url, opts = {}) => {
      const headers = opts.headers || {};
      const ct = headers['Content-Type'] || headers['content-type'] || '';
      assert({ url: String(url), method: opts.method || 'GET', body: opts.body, contentType: ct }, caller);
      return fetchFn(url, opts);
    };
  }

  // Which part of the app a window belongs to (decides which rules apply). Untagged windows
  // count as "ui", which has no network rules at all.
  function tag(webContents, caller) {
    if (!webContents) return;
    const id = webContents.id;
    tags.set(id, caller);
    webContents.once('destroyed', () => tags.delete(id));
  }

  // The app's own Electron net requests have no window. Requests without a window that the app
  // didn't announce (a page's service worker or web worker: analytics, trackers) are "background".
  function expectHost(url, ms = 120000) {
    try { expected.set(new URL(url).hostname.toLowerCase(), now() + ms); } catch {}
  }
  function callerFor(details) {
    if (details.webContentsId != null) return tags.get(details.webContentsId) || 'ui';
    let host = '';
    try { host = new URL(details.url).hostname.toLowerCase(); } catch {}
    return (expected.get(host) || 0) > now() ? 'app' : 'background';
  }

  const attached = new WeakSet();
  // Which Bouncer owns a session, shared by every Bouncer in the process (an app's and its modules'), even across copies of this file.
  const OWNED = globalThis[Symbol.for('rentvision.bouncer.owned')] || (globalThis[Symbol.for('rentvision.bouncer.owned')] = new WeakMap());
  const me = {};
  // Returns true when this Bouncer's hook is on the session, false when it was left to the Bouncer that owns it.
  function attachSession(ses, opts = {}) {
    if (!ses) return false;
    const owner = OWNED.get(ses);
    if (owner && owner !== me && !opts.own) return false;   // another module's own session: its Bouncer stays in charge
    const takeover = !!opts.own && owner !== me;
    if (opts.own) OWNED.set(ses, me);
    if (attached.has(ses) && !takeover) return true;
    attached.add(ses);
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      let body = null;
      if (details.uploadData && details.uploadData.length) {
        body = details.uploadData.map((d) => (d.bytes ? Buffer.from(d.bytes) : Buffer.alloc(0)));
      }
      const caller = callerFor(details);
      // net requests were already counted by the app-side check; don't count twice.
      // The callback must always be called, or the request hangs: an error fails closed when enforcing.
      let r;
      try { r = check({ url: details.url, method: details.method, body }, caller, { count: details.webContentsId != null }); }
      catch (e) { r = { allow: mode !== 'enforce' }; }
      callback({ cancel: !r.allow });
    });
    return true;
  }

  // Engine freshness: compares the installed engine package with the newest release.
  // getJson(url) must itself go through Bouncer (the policy allows this read).
  async function checkForUpdates(getJson) {
    try {
      const j = await getJson(`https://registry.npmjs.org/${enginePackage}/latest`);
      latestEngine = j && j.version ? j.version : null;
      lastUpdateCheck = new Date(now()).toISOString();
      updateError = null;
    } catch (e) {
      updateError = e.message;
    }
    return status();
  }

  const cmp = (a, b) => {
    const pa = String(a || '0').split('.').map(Number); const pb = String(b || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  };

  function status({ staleAfterDays = 3 } = {}) {
    const upToDate = latestEngine ? cmp(enginePackageVersion, latestEngine) >= 0 : null;
    const stale = !lastUpdateCheck || (now() - Date.parse(lastUpdateCheck)) > staleAfterDays * 864e5;
    const logCheck = log.verify();
    const issues = problems.slice();
    if (!logCheck.ok) issues.push(`The decision log was edited (line ${logCheck.brokenAt}).`);
    let level = 'green';
    if (!healthy() || !logCheck.ok) level = 'red';
    else if (mode !== 'enforce' || upToDate === false || stale) level = 'amber';
    const label = level === 'red' ? 'Problem'
      : mode !== 'enforce' ? 'Observing'
      : upToDate === false ? 'Update available'
      : stale ? 'Update check due'
      : 'Enforcing';
    return {
      appName,
      level,
      label,
      mode,
      healthy: healthy(),
      problems: issues,
      engine: engine ? { name: engine.name, version: engine.version, languageVersion: engine.languageVersion } : null,
      enginePackage,
      enginePackageVersion,
      latestEngine,
      upToDate,
      lastUpdateCheck,
      updateError,
      policy: { version: config.policyVersion || null, sha256: policySha.slice(0, 12), locked: lockOk, rules: engine ? engine.rules : [] },
      counts: { ...counts },
      log: { file: log.file(), entries: logCheck.entries, intact: logCheck.ok },
    };
  }

  return { check, assert, guardFetch, tag, expectHost, attachSession, checkForUpdates, status, recent: (n) => log.recent(n), mode, BouncerBlocked };
}

// Fingerprint used by `npm run bouncer:lock` and at launch.
function fingerprint(policyText, config) {
  return { policySha256: sha256(policyText), configSha256: sha256(JSON.stringify(config)) };
}

module.exports = { createBouncer, fingerprint, BouncerBlocked };
