// Re-demo recorder: a person does a recipe's steps once in a real browser window; the app records
// which element was clicked for each step and builds a new recipe version from it.
//
// Safety: while recording, every click on a submit button is stopped in the page before it can
// send anything (the "submit" step is recorded from that click). The window is labelled
// "recorder" for Bouncer, which has no rule allowing it to change anything either.
const path = require('path');
const { ipcMain, screen } = require('electron');
const { pageDescribe } = require('./recipes');

// Runs inside the page. Installs (once) a capture-phase click listener.
// (describe is pageDescribe, passed in as source text so no eval is needed in the page.)
function pageInstall(describe) {
  if (window.__fvuRec) return true;
  window.__fvuRec = { step: null, recorded: {} };
  // On a log-in page the recorder stays out of the way (no blocking, no recording).
  const loginPage = () => !!document.querySelector('input[type=password]');
  document.addEventListener('click', (e) => {
    if (loginPage()) return;
    const r = window.__fvuRec;
    const t = e.target;
    const submitBtn = t.closest && t.closest('button[type=submit],input[type=submit]');
    if (submitBtn) { e.preventDefault(); e.stopImmediatePropagation(); }
    if (!r.step) return;
    if (r.step.action === 'submit' && !submitBtn) return; // waiting for the submit button itself
    r.recorded[r.step.id] = describe(t);
  }, true);
  document.addEventListener('submit', (e) => { if (loginPage()) return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
  return true;
}

function createRecorder({ BrowserWindow, partition, tag }) {
  let session = null;

  ipcMain.handle('recorder:state', () => (session ? session.state() : null));
  ipcMain.handle('recorder:skip', () => { if (session) session.skip(); return true; });
  ipcMain.handle('recorder:back', () => { if (session) session.back(); return true; });
  ipcMain.handle('recorder:finish', () => { if (session) session.finish(); return true; });
  ipcMain.handle('recorder:cancel', () => { if (session) session.cancel(); return true; });
  ipcMain.handle('recorder:reload', () => { if (session) session.reload(); return true; });

  // -> Promise<{ recorded: { stepId: { locators, ... } }, skipped: [ids] } | null (cancelled)>
  function record({ recipe, url, title }) {
    if (session) session.cancel();
    return new Promise((resolve) => {
      const area = screen.getPrimaryDisplay().workArea;
      const helperW = 400;
      const site = new BrowserWindow({
        x: area.x, y: area.y, width: Math.max(1000, area.width - helperW - 10), height: area.height,
        title: `Recording: ${title || recipe.title}`,
        webPreferences: { partition, contextIsolation: true, sandbox: true },
      });
      tag(site.webContents, 'recorder');
      const helper = new BrowserWindow({
        x: area.x + area.width - helperW, y: area.y, width: helperW, height: Math.min(720, area.height),
        title: 'Re-demo', alwaysOnTop: true,
        webPreferences: { preload: path.join(__dirname, 'recorderPreload.js'), contextIsolation: true, sandbox: true },
      });
      let i = 0;
      const recorded = {};
      const skipped = [];
      let done = false;
      let poll = null;
      const steps = recipe.steps;
      const install = () => site.webContents.executeJavaScript(`(${pageInstall.toString()})(${pageDescribe.toString()})`).catch(() => {});
      const point = () => (i < steps.length
        ? site.webContents.executeJavaScript(`window.__fvuRec && (window.__fvuRec.step = ${JSON.stringify({ id: steps[i].id, action: steps[i].action })})`).catch(() => {})
        : site.webContents.executeJavaScript('window.__fvuRec && (window.__fvuRec.step = null)').catch(() => {}));
      const push = () => { if (!helper.isDestroyed()) helper.webContents.send('recorder:update', s.state()); };
      const end = (result) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        session = null;
        if (!helper.isDestroyed()) helper.destroy();
        if (!site.isDestroyed()) site.destroy();
        resolve(result);
      };
      const s = {
        state: () => ({ title: title || recipe.title, index: i, total: steps.length, steps: steps.map((st, k) => ({ id: st.id, prompt: st.prompt, status: recorded[st.id] ? 'recorded' : skipped.includes(st.id) ? 'skipped' : k === i ? 'now' : 'todo' })) }),
        skip: () => { if (i < steps.length) { skipped.push(steps[i].id); i++; point(); push(); } },
        back: () => { if (i > 0) { i--; delete recorded[steps[i].id]; const k = skipped.indexOf(steps[i].id); if (k >= 0) skipped.splice(k, 1); site.webContents.executeJavaScript(`window.__fvuRec && delete window.__fvuRec.recorded[${JSON.stringify(steps[i].id)}]`).catch(() => {}); point(); push(); } },
        finish: () => end({ recorded, skipped }),
        cancel: () => end(null),
        reload: () => { site.loadURL(url).catch(() => {}); },
      };
      session = s;
      site.webContents.on('dom-ready', async () => { await install(); await point(); });
      site.on('close', () => end(null));
      helper.on('close', () => end(null));
      poll = setInterval(async () => {
        if (done || site.isDestroyed() || i >= steps.length) return;
        let got = null;
        try { got = await site.webContents.executeJavaScript(`window.__fvuRec ? window.__fvuRec.recorded[${JSON.stringify(steps[i].id)}] || null : null`); } catch {}
        if (got) { recorded[steps[i].id] = got; i++; await point(); push(); }
      }, 400);
      site.loadURL(url).catch(() => {});
      helper.loadFile(path.join(__dirname, 'renderer', 'recorder.html'));
      helper.webContents.once('did-finish-load', push);
    });
  }

  return { record, busy: () => !!session };
}

module.exports = { createRecorder, pageInstall };
