// Futureproofer badge (lower-right, next to Bouncer's) and its panel. Reusable: the app passes its api.
//   FutureprooferBadge.mount({ status, runNow, command, openExternal, onEvent, recipes, useRecipe })
// Uses the Bouncer badge styles (kit/bouncer/renderer/badge.css).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never');
  const ICON = '<svg class="bnc-shield" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 6.3 8.1h-1.6A5 5 0 1 1 8 3a5 5 0 0 1 3.5 1.5L9.5 6.5H14V2l-1.5 1.5A6.5 6.5 0 0 0 8 1.5Z"/></svg>';
  const LABEL = { ok: 'current', warn: 'update', bad: 'fix now', info: 'note' };

  function details(r) {
    const bits = [];
    if (r.id === 'electron' && r.latest) bits.push(`You have ${esc(r.current)} · newest ${esc(r.latest)} · supported: ${esc((r.supportedMajors || []).join(', '))}`);
    if (r.id === 'vulnerabilities' && r.found && r.found.length) bits.push(`<ul class="fp-list">${r.found.slice(0, 12).map((f) => `<li><a href="#" data-open="${esc(f.url)}">${esc(f.id)}</a> in ${esc(f.package)} ${esc(f.version)}</li>`).join('')}</ul>`);
    if (r.id === 'app' && r.notes && r.level === 'warn') bits.push(`<div class="fp-sub">${esc(r.notes.slice(0, 400))}</div>`);
    if (r.id === 'build' && r.report) {
      const a = r.report.audit || {};
      bits.push(`Built ${esc(when(r.report.createdAt))} · build-tool warnings: ${a.critical || 0} critical, ${a.high || 0} high, ${a.moderate || 0} moderate, ${a.low || 0} low`);
      if ((r.report.outdated || []).length) bits.push(`<ul class="fp-list">${r.report.outdated.slice(0, 10).map((o) => `<li>${esc(o.name)} ${esc(o.current)} → ${esc(o.latest)}</li>`).join('')}</ul>`);
    }
    if (r.detail && (r.level === 'bad' || r.level === 'warn')) bits.push(`What it saw: ${esc(r.detail)}`);
    if (r.recipeVersion) bits.push(`Recipe version ${esc(r.recipeVersion)}${r.healedSteps && r.healedSteps.length ? ` · self-repaired: ${esc(r.healedSteps.join(', '))}` : ''}`);
    return bits.map((b) => `<div class="fp-sub">${b}</div>`).join('');
  }

  function mount(api) {
    const badge = document.createElement('button');
    badge.className = 'bnc-badge';
    badge.type = 'button';
    badge.title = 'Futureproofer: is everything up to date?';
    let corner = document.getElementById('kit-corner');
    if (!corner) { corner = document.createElement('div'); corner.id = 'kit-corner'; document.body.appendChild(corner); }
    corner.insertBefore(badge, corner.firstChild);

    async function refresh() {
      let st;
      try { st = await api.status(); } catch (e) { st = { level: 'red', label: 'Problem', results: [] }; }
      badge.className = `bnc-badge bnc-${st.level}`;
      badge.innerHTML = `${ICON}<span class="bnc-dot"></span><span>Futureproofer · ${esc(st.running ? 'Checking…' : st.label)}</span>`;
      badge.setAttribute('aria-label', `Futureproofer: ${st.label}. Open details`);
      return st;
    }

    async function openPanel() {
      const st = await refresh();
      let recipes = [];
      try { recipes = api.recipes ? await api.recipes() : []; } catch {}
      const overlay = document.createElement('div');
      overlay.className = 'bnc-overlay';
      overlay.innerHTML = `
        <aside class="bnc-panel" role="dialog" aria-label="Futureproofer details">
          <div class="bnc-head"><div><h2>Futureproofer</h2><div class="bnc-muted">Keeps ${esc(st.appName || 'this app')} and everything it depends on current</div></div>
            <button class="bnc-close" data-x>Close</button></div>
          <div class="bnc-state"><span class="bnc-dot" style="background:${st.level === 'green' ? 'var(--ok,#137a3d)' : st.level === 'red' ? 'var(--bad,#b42318)' : '#d99a00'}"></span>${esc(st.label)}</div>
          <p class="bnc-muted">Last full check: ${esc(when(st.lastFullCheck))}. Checks run when the app starts, every few hours while it's open, and before a job if the last check is more than 3 days old.</p>
          <div class="bnc-row"><button data-run>Check everything now</button></div>
          <h3>Checks</h3>
          ${st.results.map((r) => `<div class="fp-check"><div class="fp-top"><span class="bnc-tag ${esc(r.level)}">${esc(LABEL[r.level] || r.level)}</span><span class="fp-title">${esc(r.title)}</span></div>
            <div>${esc(r.summary)}</div>${details(r)}
            <div class="fp-sub">Checked ${esc(when(r.checkedAt))}</div>
            ${(r.actions || (r.action ? [r.action] : [])).length ? `<div class="bnc-row">${(r.actions || [r.action]).map((a) => (a.url ? `<button data-open="${esc(a.url)}">${esc(a.label)}</button>` : `<button data-cmd="${esc(a.command)}">${esc(a.label)}</button>`)).join('')}</div>` : ''}
          </div>`).join('')}
          ${recipes.length ? `<h3>Website recipes</h3>${recipes.map((rc) => `<div class="fp-check"><div class="fp-title">${esc(rc.title)}</div>
            <div class="fp-sub">Using version ${esc(rc.active)}. Versions: ${rc.versions.map((v) => `v${esc(v.version)} (${esc(v.source)}${v.savedAt ? ', ' + esc(new Date(v.savedAt).toLocaleDateString()) : ''})`).join(' · ')}</div>
            <div class="bnc-row"><button data-cmd="health:${esc(rc.id)}">Test it now (dry run)</button><button data-cmd="redemo:${esc(rc.id)}">Re-demo…</button>
            ${rc.versions.length > 1 ? `<select data-use="${esc(rc.id)}">${rc.versions.map((v) => `<option value="${esc(v.version)}"${v.version === rc.active ? ' selected' : ''}>Use v${esc(v.version)}</option>`).join('')}</select>` : ''}</div></div>`).join('')}` : ''}
        </aside>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      const reopen = () => { close(); openPanel(); };
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-x]')) close(); });
      document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
      overlay.querySelector('[data-run]').addEventListener('click', async (e) => { e.target.textContent = 'Checking…'; e.target.disabled = true; try { await api.runNow(); } catch {} reopen(); });
      overlay.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(b.dataset.open); }));
      overlay.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', async () => {
        const t = b.textContent; b.textContent = 'Working…'; b.disabled = true;
        try { await api.command(b.dataset.cmd); } catch (e) { alert(e.message); } // eslint-disable-line no-alert
        b.textContent = t; b.disabled = false; reopen();
      }));
      overlay.querySelectorAll('[data-use]').forEach((sel) => sel.addEventListener('change', async () => { await api.useRecipe(sel.dataset.use, Number(sel.value)); reopen(); }));
    }

    badge.addEventListener('click', openPanel);
    if (api.onEvent) api.onEvent(() => refresh());
    refresh();
    setInterval(refresh, 30 * 1000);
    return { refresh, open: openPanel };
  }

  window.FutureprooferBadge = { mount };
}());
