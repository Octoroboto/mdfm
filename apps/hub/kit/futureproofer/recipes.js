// Recipes: website automation written down as data, not code.
//
// A recipe lists the steps of a task on someone else's website (e.g. Wistia's "Publish natively"
// dialog) and, for each step, several ways to find the button or field ("locators"), best first.
// When a website changes, the runner falls back to the next locator (self-repair). When none work,
// the step is flagged "needs re-demo": a person does the task once in a recorder window and a new
// recipe version is saved. Versions are kept, so a bad recording can be rolled back.
const fs = require('fs');
const path = require('path');

// Runs INSIDE the web page (serialized with .toString()), so it must be self-contained.
// Returns { el, index } for the first locator that matches a visible element, or null.
function pageFind(locators) {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const all = (sel) => { try { return [...document.querySelectorAll(sel || '*')]; } catch { return []; } };
  const tries = {
    css: (l) => all(l.css).find(visible),
    id: (l) => { const e = document.getElementById(l.id); return visible(e) ? e : null; },
    name: (l) => all(`[name="${String(l.name).replace(/"/g, '\\"')}"]`).find(visible),
    aria: (l) => all(l.tag || '[aria-label]').find((e) => visible(e) && norm(e.getAttribute('aria-label')) === norm(l.aria)),
    text: (l) => all(l.tag || 'button,a,[role=button],[role=tab],label').find((e) => visible(e) && (norm(e.innerText) === norm(l.text) || norm(e.getAttribute('aria-label')) === norm(l.text))),
    textIncludes: (l) => all(l.tag || 'button,a,[role=button],[role=tab]').find((e) => visible(e) && norm(e.innerText).includes(norm(l.textIncludes))),
    label: (l) => { // a form control by its label text
      const lab = all('label').find((e) => norm(e.innerText) === norm(l.label));
      if (!lab) return null;
      const c = lab.control || lab.querySelector('input,textarea,select') || (lab.htmlFor && document.getElementById(lab.htmlFor));
      return c || null;
    },
    placeholder: (l) => all('input,textarea').find((e) => visible(e) && norm(e.getAttribute('placeholder')) === norm(l.placeholder)),
  };
  for (let i = 0; i < (locators || []).length; i++) {
    const l = locators[i];
    const kind = Object.keys(tries).find((k) => k in l);
    if (!kind) continue;
    let el = null;
    try { el = tries[kind](l); } catch { el = null; }
    if (el && l.within) { try { if (!el.closest(l.within)) el = null; } catch { el = null; } }
    if (el) return { el, index: i };
  }
  return null;
}

// Runs INSIDE the web page: describes a clicked element as locators, best first.
function pageDescribe(target) {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  let el = target.closest('button,a,input,textarea,select,label,[role=button],[role=tab],[role=checkbox],[role=menuitem]') || target;
  if (el.tagName === 'LABEL' && el.control) el = el.control;
  const tag = el.tagName.toLowerCase();
  const out = [];
  const id = el.id;
  // Generated ids (React useId "_r_3f_" / ":r1:", base-ui, radix, headlessui, long numbers) change
  // between page loads, so they're skipped.
  if (id && !/(^|[-_:])r[_:]|[:]|\d{3,}|base-ui|radix|headlessui|react|mui|ember/i.test(id)) out.push({ css: `#${CSS.escape(id)}` });
  const aria = el.getAttribute('aria-label');
  if (aria) out.push({ aria: norm(aria), tag });
  if (el.name) out.push({ name: el.name });
  const text = norm(el.innerText).slice(0, 60);
  if (text && !['input', 'textarea', 'select'].includes(tag)) {
    const sel = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : el.type === 'submit' ? `${tag}[type=submit]` : tag;
    out.push({ text, tag: sel });
    if (text.length > 4) out.push({ textIncludes: text.slice(0, 30), tag: sel });
  }
  if (['input', 'textarea', 'select'].includes(tag)) {
    const lab = (el.labels && el.labels[0]) ? norm(el.labels[0].innerText) : null;
    if (lab) out.push({ label: lab });
    if (el.getAttribute('placeholder')) out.push({ placeholder: el.getAttribute('placeholder') });
  }
  return { tag, type: el.type || null, locators: out, inDialog: !!el.closest('[role=dialog]'), inForm: !!el.closest('form') };
}

// Merge a recording into a recipe: recorded locators first, the old ones kept as backups.
function mergeRecording(recipe, recorded) {
  const key = (l) => JSON.stringify(l);
  const steps = recipe.steps.map((s) => {
    const rec = recorded[s.id];
    if (!rec || !rec.locators || !rec.locators.length) return s;
    const seen = new Set();
    const locators = [...rec.locators.map((l) => (s.within ? { ...l, within: s.within } : l)), ...s.locators]
      .filter((l) => { const k = key(l); if (seen.has(k)) return false; seen.add(k); return true; });
    return { ...s, locators };
  });
  return { ...recipe, steps };
}

// Put the locator that worked first (after a self-repair).
function promote(recipe, healed) {
  const steps = recipe.steps.map((s) => {
    const i = healed[s.id];
    if (!i) return s;
    const locators = s.locators.slice();
    const [w] = locators.splice(i, 1);
    return { ...s, locators: [w, ...locators] };
  });
  return { ...recipe, steps };
}

// Versions on disk: <dir>/<recipeId>/v<N>.json + active.json ({ version }). The bundled recipe is v1.
function createRecipeStore({ dir, bundled }) {
  const rdir = (id) => path.join(dir, id);
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

  function versions(id) {
    const out = [{ ...bundled[id], version: bundled[id].version || 1, source: 'built in' }];
    try {
      fs.readdirSync(rdir(id)).filter((f) => /^v\d+\.json$/.test(f)).forEach((f) => {
        const r = readJson(path.join(rdir(id), f));
        if (r) out.push(r);
      });
    } catch {}
    return out.sort((a, b) => a.version - b.version);
  }
  function active(id) {
    const a = readJson(path.join(rdir(id), 'active.json'));
    const vs = versions(id);
    return (a && vs.find((v) => v.version === a.version)) || vs.filter((v) => v.version >= (bundled[id].version || 1)).pop() || vs[0];
  }
  function save(id, recipe, { source, activate = true } = {}) {
    fs.mkdirSync(rdir(id), { recursive: true });
    const version = Math.max(...versions(id).map((v) => v.version)) + 1;
    const r = { ...recipe, version, source: source || 'recorded', savedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(rdir(id), `v${version}.json`), JSON.stringify(r, null, 2));
    if (activate) setActive(id, version);
    return r;
  }
  function setActive(id, version) {
    fs.mkdirSync(rdir(id), { recursive: true });
    fs.writeFileSync(path.join(rdir(id), 'active.json'), JSON.stringify({ version, at: new Date().toISOString() }));
  }
  function health(id, h) { // remember the last health result per recipe
    const f = path.join(rdir(id), 'health.json');
    if (h) { fs.mkdirSync(rdir(id), { recursive: true }); fs.writeFileSync(f, JSON.stringify(h, null, 2)); return h; }
    return readJson(f);
  }
  return { versions, active, save, setActive, health };
}

module.exports = { pageFind, pageDescribe, mergeRecording, promote, createRecipeStore };
