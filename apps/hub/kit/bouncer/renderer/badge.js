// Bouncer badge (lower-right corner) and its info panel. Reusable: the app passes its own api.
//   BouncerBadge.mount({ status, recent, checkNow, showLog, openExternal, onEvent })
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SHIELD = '<svg class="bnc-shield" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1 2.5 3v4.3c0 3.4 2.3 6.4 5.5 7.7 3.2-1.3 5.5-4.3 5.5-7.7V3L8 1Zm0 1.6 4 1.5v3.2c0 2.6-1.6 4.9-4 6.1-2.4-1.2-4-3.5-4-6.1V4.1l4-1.5Z"/></svg>';
  const ABOUT = [
    ['Cedar — the rule engine', 'https://www.cedarpolicy.com/'],
    ['Cedar security & formal verification', 'https://docs.cedarpolicy.com/other/security.html'],
    ['Cedar source code (GitHub)', 'https://github.com/cedar-policy/cedar'],
    ['Cedar joins the CNCF (AWS)', 'https://aws.amazon.com/blogs/opensource/cedar-joins-cncf-as-a-sandbox-project/'],
    ['Cedar paper, OOPSLA 2024 (ACM)', 'https://dl.acm.org/doi/10.1145/3649835'],
  ];
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never');

  function mount(api) {
    const badge = document.createElement('button');
    badge.className = 'bnc-badge';
    badge.type = 'button';
    badge.title = 'Bouncer: what this app is allowed to send';
    let corner = document.getElementById('kit-corner');
    if (!corner) { corner = document.createElement('div'); corner.id = 'kit-corner'; document.body.appendChild(corner); }
    corner.appendChild(badge);
    let last = null;

    async function refresh() {
      try { last = await api.status(); } catch (e) { last = { level: 'red', label: 'Problem', problems: [e.message] }; }
      badge.className = `bnc-badge bnc-${last.level}`;
      const ver = last.policy && last.policy.version ? ` · rules v${last.policy.version}` : '';
      const fresh = last.upToDate === true ? ' · up to date ✓' : last.upToDate === false ? ' · update available' : '';
      badge.innerHTML = `${SHIELD}<span class="bnc-dot"></span><span>Bouncer · ${esc(last.label)}</span><span class="bnc-muted">${esc(ver + fresh)}</span>`;
      badge.setAttribute('aria-label', `Bouncer: ${last.label}. Open details`);
      return last;
    }

    async function openPanel() {
      const st = await refresh();
      let events = [];
      try { events = await api.recent(40); } catch {}
      const overlay = document.createElement('div');
      overlay.className = 'bnc-overlay';
      const modeText = st.mode === 'enforce'
        ? 'Enforcing: anything not on the list below is stopped before it leaves this Mac.'
        : 'Observing: nothing is blocked yet. Anything the rules would block is logged as "would block" so the rules can be checked before they are switched on.';
      overlay.innerHTML = `
        <aside class="bnc-panel" role="dialog" aria-label="Bouncer details">
          <div class="bnc-head"><div><h2>Bouncer</h2><div class="bnc-muted">Checks every request ${esc(st.appName || 'this app')} sends using your logins</div></div>
            <button class="bnc-close" data-x>Close</button></div>
          <div class="bnc-state"><span class="bnc-dot" style="background:${st.level === 'green' ? 'var(--ok,#137a3d)' : st.level === 'red' ? 'var(--bad,#b42318)' : '#d99a00'}"></span>${esc(st.label)}</div>
          <p>${esc(modeText)} The logins this app uses can do much more than it needs; Bouncer limits the app to its own short list, however broad a login is.</p>
          ${st.problems && st.problems.length ? `<div class="bnc-problems">${st.problems.map(esc).join('<br>')}</div>` : ''}
          <h3>Engine</h3>
          <dl class="bnc-kv">
            <dt>Rule engine</dt><dd>${st.engine ? `${esc(st.engine.name)} ${esc(st.engine.version)}` : 'not loaded'}</dd>
            <dt>Package</dt><dd>${esc(st.enginePackage)} ${esc(st.enginePackageVersion || '?')}</dd>
            <dt>Newest release</dt><dd>${esc(st.latestEngine || 'not checked yet')} ${st.upToDate === true ? '✓ up to date' : st.upToDate === false ? '— update available' : ''}</dd>
            <dt>Last checked</dt><dd>${esc(when(st.lastUpdateCheck))}${st.updateError ? ` (last try failed: ${esc(st.updateError)})` : ''}</dd>
            <dt>Rules</dt><dd>version ${esc(st.policy && st.policy.version)} · fingerprint ${esc(st.policy && st.policy.sha256)} · ${st.policy && st.policy.locked ? 'matches the reviewed copy ✓' : 'DOES NOT match the reviewed copy'}</dd>
            <dt>Decision log</dt><dd>${st.log ? `${esc(st.log.entries)} entries this month · ${st.log.intact ? 'untouched ✓' : 'EDITED'}` : ''}</dd>
            <dt>Since launch</dt><dd>${st.counts ? `${st.counts.allowed} allowed · ${st.counts.blocked} blocked · ${st.counts.wouldBlock} would block` : ''}</dd>
          </dl>
          <div class="bnc-row"><button data-check>Check for updates now</button><button data-log>Show log file</button></div>
          <h3>Why trust it</h3>
          <p>The rules are checked by <strong>Cedar</strong>, an open-source policy engine from AWS, now a Cloud Native Computing Foundation project. Its core is formally verified (machine-checked proofs) and continuously tested against that proof. Bouncer only asks Cedar for a yes/no; the security logic isn't home-made. Everything not allowed is blocked by default, and a "never" rule always beats an "allow" rule.</p>
          <ul>${ABOUT.map(([t, u]) => `<li><a href="#" data-open="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul>
          <h3>Rules (${(st.policy && st.policy.rules || []).length})</h3>
          <ul class="bnc-rules">${(st.policy && st.policy.rules || []).map((r) => `<li><span class="bnc-tag ${r.effect}">${r.effect === 'forbid' ? 'never' : 'allow'}</span><span>${esc(r.description || r.id)}</span></li>`).join('')}</ul>
          <h3>Recent decisions</h3>
          ${events.length ? `<ul class="bnc-events">${events.map((e) => `<li><span class="bnc-tag ${esc(e.d)}">${esc(e.d.replace('-', ' '))}</span> <code>${esc(e.method || '')} ${esc(e.host || '')}${esc(e.path || e.url || '')}</code><div class="bnc-muted">${esc(when(e.t))} · ${esc(e.caller)} · ${esc(e.why || (e.rules || []).join(', '))}</div></li>`).join('')}</ul>` : '<p class="bnc-muted">Nothing yet. (Reading requests aren\'t listed; changes and blocks are.)</p>'}
        </aside>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-x]')) close(); });
      document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
      overlay.querySelector('[data-check]').addEventListener('click', async (e) => { e.target.textContent = 'Checking…'; try { await api.checkNow(); } catch {} close(); openPanel(); });
      overlay.querySelector('[data-log]').addEventListener('click', () => api.showLog());
      overlay.querySelectorAll('[data-open]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(a.dataset.open); }));
    }

    badge.addEventListener('click', openPanel);
    if (api.onEvent) api.onEvent(() => refresh());
    refresh();
    setInterval(refresh, 60 * 1000);
    return { refresh, open: openPanel };
  }

  window.BouncerBadge = { mount };
}());
