/* MIX (1.25, was TUNE): the mixing drawer, MDFM.mountMix (MDFM.mountTune is the same function, for older pages).
   It fills `panel` with an inline drawer that opens under the main deck and pushes the page down (no pop-out, no
   overlay). Four sections: SOUND (a six-band parametric EQ with its curve, tone, room, presets; every station), STYLE
   (the style matrix as a PAD or as channel FADERS with "what changes" lanes; this station), GROOVE & KEY (tempo and time,
   key, drums; this station) and FX (every station; GLITCH sits in TRICKS). ORIGINAL in the header holds the unmixed station.
   `toggle` opens and closes it: a checkbox (the radio page's #tuneOn) or a button (the hub's #rxTuneBtn).
   Every part is feature-detected (typeof radio.x === "function"), so the drawer only shows what the engine can do.
   Kept on this device in localStorage unless a store is given: mdfmSound (opts.store), mdfmStyleMix (opts.mixStore),
   mdfmGroove (opts.grooveStore), mdfmFx (opts.fxStore), mdfmEq (opts.eqStore), mdfmTone (opts.toneStore, kept in step
   with the EQ's LOW / MID 1 / HIGH gains, which the receiver re-applies) and the drawer's own state,
   mdfmMixUI (opts.uiStore). Its CSS ships inside this file (MIX_CSS), so every page that loads MDFM gets it. */
function mountMix(radio, opts = {}) {
  const { panel, toggle, store, mixStore, grooveStore, fxStore, toneStore, eqStore, uiStore, title = "MIX" } = opts;
  if (!radio || typeof radio.setSound !== "function" || !panel) return null;
  const doc = panel.ownerDocument || document, win = doc.defaultView || window;
  if (!doc.getElementById("mdfm-mix-css")) { const s = doc.createElement("style"); s.id = "mdfm-mix-css"; s.textContent = MIX_CSS;
    const before = doc.getElementById("mdfm-radio"); before ? before.parentNode.insertBefore(s, before) : doc.head.appendChild(s); }
  const has = k => typeof radio[k] === "function";
  const obj = x => x && typeof x === "object" && !Array.isArray(x) ? x : null;
  const ls0 = key => ({ get() { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} } });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = "mx" + Math.random().toString(36).slice(2, 6); let nid = 0; const mkid = s => `${uid}-${s}`;
  const station = () => (has("getStation") && radio.getStation()) || null, sid = () => (station() ? station().id : "mdfm");
  const coarse = () => { try { return win.matchMedia("(pointer:coarse)").matches; } catch (e) { return false; } };
  const reduced = () => { try { return win.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) { return false; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vib = () => { try { navigator.vibrate && navigator.vibrate(5); } catch (e) {} };

  // ---------- 1.26: while a finger, pen or mouse drags a control, the engine update, the repaint and the save run once per
  // frame (the newest value wins) instead of once per pointer event; settings are written when the drag ends. A tap,
  // the keyboard and the API still apply at once. ----------
  let dragN = 0, jobRaf = 0; const jobs = new Map(), held = new Map();
  const raf = f => (win.requestAnimationFrame ? win.requestAnimationFrame(f) : setTimeout(f, 16));
  const runJobs = () => { jobRaf = 0; if (!jobs.size) return; const L = [...jobs.values()]; jobs.clear(); for (const f of L) { try { f(); } catch (e) {} } };
  const live = (key, fn) => { if (!dragN) { jobs.delete(key); fn(); return; } jobs.delete(key); jobs.set(key, fn); if (!jobRaf) jobRaf = raf(runJobs); };
  const flushSaves = () => { if (!held.size) return; const L = [...held]; held.clear(); for (const [st, v] of L) { try { st.set(v); } catch (e) {} } };
  const dragOn = () => { dragN++; };
  const dragOff = () => { if (!dragN) return; dragN--; if (!dragN) { runJobs(); flushSaves(); } };
  const lazy = st => st && typeof st.set === "function" ? { get: (...a) => st.get(...a), set: v => { if (dragN) held.set(st, v); else { held.delete(st); st.set(v); } } } : st;
  const ls = key => lazy(ls0(key));
  win.addEventListener("pagehide", () => { runJobs(); flushSaves(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) { runJobs(); flushSaves(); } });

  // ---------- the drawer's own state (per device) ----------
  const us = uiStore || ls0("mdfmMixUI"), ui0 = obj(us.get()) || {};
  const ui = { v: 1, open: false, section: "sound", acc: { sound: true, style: true, groove: false, fx: false }, styleView: "pad", eqBand: "p1", grooveCard: "tempo",
    ...ui0, acc: { sound: true, style: true, groove: false, fx: false, ...(obj(ui0.acc) || {}) } };
  const saveUI = () => us.set(ui);

  // ---------- one pointer helper for knobs, faders and dials: drag past a dead zone, tap, double-tap, long-press ----------
  function gesture(el, h) {
    let pid = null, x0 = 0, y0 = 0, lx = 0, ly = 0, moved = false, longed = false, longT = 0, type = "mouse", last = { t: 0, x: 0, y: 0 };
    el.addEventListener("pointerdown", e => {
      if (pid !== null || (e.pointerType === "mouse" && e.button !== 0) || (h.skip && h.skip(e))) return;
      pid = e.pointerId; type = e.pointerType || "mouse"; x0 = lx = e.clientX; y0 = ly = e.clientY; moved = false; longed = false; dragOn();
      try { el.setPointerCapture(pid); } catch (err) {}
      e.preventDefault(); h.down && h.down(e);
      clearTimeout(longT); if (h.long) longT = setTimeout(() => { if (pid !== null && !moved) { longed = true; h.long(e); } }, 500); });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return; const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!moved) { if (Math.hypot(dx, dy) < (h.dead == null ? 3 : h.dead)) return; moved = true; clearTimeout(longT); lx = e.clientX; ly = e.clientY; h.start && h.start(e); return; }
      const ddx = e.clientX - lx, ddy = e.clientY - ly; lx = e.clientX; ly = e.clientY; h.move && h.move(ddx, ddy, e, { dx, dy, type }); });
    const up = e => {
      if (e.pointerId !== pid) return; pid = null; clearTimeout(longT); dragOff();
      if (e.type === "pointerup" && !moved && !longed) { const t = performance.now(), near = Math.hypot(e.clientX - last.x, e.clientY - last.y) < 12;
        if (h.double && t - last.t < 300 && near) { last.t = 0; h.double(e); } else { last = { t, x: e.clientX, y: e.clientY }; h.tap && h.tap(e); } }
      else last.t = 0;
      h.end && h.end(e, moved); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
  }
  // fine control: Shift/Alt/Ctrl x0.2 with a mouse; on touch, the further the finger slides sideways, the finer (x0.25 at 160 px)
  const fineOf = (e, g) => { if (g.type !== "mouse") { const ax = Math.abs(g.dx); return ax <= 60 ? 1 : ax >= 160 ? .25 : 1 - .75 * (ax - 60) / 100; }
    return e.shiftKey || e.altKey || e.ctrlKey || e.metaKey ? .2 : 1; };
  // type a value: Enter on a knob or the BPM readout opens a small number field; Enter or leaving it sets, Esc cancels
  function editValue(host, cur, min, max, step, done) {
    if (host.querySelector(".mx-edit")) return; const f = doc.createElement("input");
    f.type = "number"; f.className = "mx-edit"; f.min = min; f.max = max; f.step = step; f.value = String(cur); f.setAttribute("aria-label", "Type a value");
    host.appendChild(f); f.focus(); f.select(); let gone = false;
    const end = ok => { if (gone) return; gone = true; const v = parseFloat(f.value); f.remove(); if (ok && Number.isFinite(v)) done(v); else done(null); };
    f.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true); } else if (e.key === "Escape") { e.preventDefault(); end(false); } });
    f.addEventListener("blur", () => end(true)); f.addEventListener("pointerdown", e => e.stopPropagation());
  }

  // ---------- Knob: .mx-k > .mx-dial > .rd-dial > (svg.rd-ticks, .rd-knob[role=slider]); the whole cell takes the pointer ----------
  const TICKS = (() => { let t = ""; for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * Math.PI / 180;
    t += `<circle cx="${(30 + Math.sin(a) * 27).toFixed(2)}" cy="${(30 - Math.cos(a) * 27).toFixed(2)}" r="${i % 5 ? .9 : 1.4}" fill="rgba(226,229,238,.75)"/>`; } return t; })();
  // aria: a fuller name for screen readers when the caption alone is ambiguous (HATS under LEVELS is the hats' level)
  const knobHTML = (key, label, lo, hi, cls = "", aria = "") => { const c = mkid("c" + (++nid));
    return `<div class="mx-k${cls ? " " + cls : ""}" data-key="${key}"><div class="mx-dial"><div class="rd-dial"><svg class="rd-ticks" viewBox="0 0 60 60" aria-hidden="true">${TICKS}</svg><div class="rd-knob" role="slider" tabindex="0" ${aria ? `aria-label="${esc(aria)}"` : `aria-labelledby="${c}"`}></div></div></div><div class="rd-mm" aria-hidden="true"><span>${lo}</span><span>${hi}</span></div><small id="${c}">${label}</small><output class="mx-v" aria-hidden="true"></output></div>`; };
  function Knob(cell, o) {
    const kn = cell.querySelector(".rd-knob"), out = cell.querySelector(".mx-v"), range = o.max - o.min, home = o.home == null ? o.def : o.home;
    let v = o.def, raw = v, dis = false, hoverT = 0, bub = null, bubT = 0, dragging = false;
    kn.setAttribute("aria-valuemin", String(o.min)); kn.setAttribute("aria-valuemax", String(o.max));
    if (o.tip) { cell.title = o.tip; kn.setAttribute("aria-description", o.tip); }
    const snap = x => +(Math.round((clamp(x, o.min, o.max) - o.min) / o.step) * o.step + o.min).toFixed(4);
    const paint = () => { const f = (v - o.min) / range; kn.style.transform = `rotate(${(-135 + f * 270).toFixed(1)}deg)`;
      const t = o.fmt(v); out.textContent = t; kn.setAttribute("aria-valuenow", String(v)); kn.setAttribute("aria-valuetext", o.text ? o.text(v) : t); };
    const put = (x, detent) => { if (dis) return; let nv = snap(x);
      if (detent && o.center != null && Math.abs(x - o.center) < range * .03) { nv = o.center; if (v !== o.center) { vib(); out.classList.add("det"); setTimeout(() => out.classList.remove("det"), 400); } }
      if (nv === v) return; v = nv; paint(); live(cell, () => o.onInput(v)); };
    const reset = () => { if (dis) return; raw = home; if (o.onReset) o.onReset(); else { v = NaN; put(home); } };
    const fine = on => { if (on) out.dataset.fine = "1"; else delete out.dataset.fine; };
    const hideBub = () => { if (bub) { bub.remove(); bub = null; } clearTimeout(bubT); };
    gesture(cell, { skip: e => !!e.target.closest("button,input,.mx-bub"),
      down: () => { kn.focus({ preventScroll: true }); raw = v; hideBub(); }, start: () => { dragging = true; },
      move: (ddx, ddy, e, g) => { if (dis) return; const f = fineOf(e, g), d = g.type === "mouse" ? ddx - ddy : -ddy; fine(f < 1);
        raw = clamp(raw + d / 200 * range * f, o.min, o.max); put(raw, true); },
      end: () => { dragging = false; fine(false); }, double: () => reset(),
      long: () => { if (dis) return; hideBub(); bub = doc.createElement("div"); bub.className = "mx-bub"; bub.setAttribute("role", "group");
        bub.innerHTML = `<span></span><button type="button" class="btn">RESET</button>`; bub.firstChild.textContent = o.text ? o.text(v) : o.fmt(v);
        bub.lastChild.addEventListener("click", () => { reset(); hideBub(); kn.focus({ preventScroll: true }); }); cell.appendChild(bub); bubT = setTimeout(hideBub, 3500); } });
    cell.addEventListener("pointerenter", () => { hoverT = performance.now(); }); cell.addEventListener("pointerleave", () => { hoverT = 0; });
    cell.addEventListener("wheel", e => { if (dis || !hoverT || performance.now() - hoverT < 150) return; e.preventDefault(); raw = v;
      put(v - e.deltaY * .0015 * range * (e.shiftKey ? .2 : 1)); }, { passive: false });
    kn.addEventListener("keydown", e => { if (dis) return; const s = o.step * (e.shiftKey ? 5 : 1), big = range * .1;
      const d = { ArrowUp: s, ArrowRight: s, ArrowDown: -s, ArrowLeft: -s, PageUp: big, PageDown: -big }[e.key];
      if (d != null) put(v + d); else if (e.key === "Home") put(o.min); else if (e.key === "End") put(o.max);
      else if (e.key === "Delete" || e.key === "Backspace") reset();
      else if (e.key === "Enter") editValue(cell, o.toEdit ? o.toEdit(v) : v, o.min, o.max, o.step, x => { if (x != null) put(o.fromEdit ? o.fromEdit(x) : x); kn.focus({ preventScroll: true }); });
      else return; e.preventDefault(); });
    paint();
    return { el: cell, get: () => v, set(x) { v = snap(x); if (!dragging) raw = v; paint(); }, opt(p) { Object.assign(o, p); paint(); },
      state(s) { cell.classList.toggle("moved", !!s.moved); cell.classList.toggle("song", !!s.song); if (s.text != null) out.textContent = s.text; if (s.aria != null) kn.setAttribute("aria-valuetext", s.aria); },
      disable(reason) { dis = !!reason; cell.classList.toggle("na", dis); kn.setAttribute("aria-disabled", String(dis)); cell.title = reason || o.tip || ""; } };
  }

  // ---------- Fader: a vertical channel fader; a native range input underneath for the keyboard and screen readers ----------
  const faderHTML = (key, label) => { const c = mkid("c" + (++nid));
    return `<div class="mx-f" data-key="${key}"><output class="mx-v" aria-hidden="true">0%</output><div class="mx-ft"><i class="mx-track"></i><i class="mx-fill"></i><i class="mx-cap"></i><input type="range" min="0" max="100" step="1" value="0" aria-orientation="vertical" aria-labelledby="${c}"></div><small id="${c}">${label}</small></div>`; };
  function Fader(cell, o) {
    const inp = cell.querySelector("input"), out = cell.querySelector(".mx-v"), ft = cell.querySelector(".mx-ft"); let v = 0, raw = 0, dragging = false;
    if (o.tip) { cell.title = o.tip; inp.setAttribute("aria-description", o.tip); }
    const paint = () => { inp.value = String(v); cell.style.setProperty("--p", String(v / 100)); out.textContent = o.fmt(v); inp.setAttribute("aria-valuetext", o.text(v)); };
    const put = x => { x = Math.round(clamp(x, 0, 100)); if (x === v) return; v = x; paint(); live(cell, () => o.onInput(v)); };
    inp.addEventListener("input", () => { v = +inp.value; paint(); o.onInput(v); });
    let fth = 0;
    gesture(ft, { down: () => { inp.focus({ preventScroll: true }); raw = v; fth = ft.clientHeight; }, start: () => { dragging = true; },
      move: (ddx, ddy, e, g) => { const f = fineOf(e, g), h = Math.max(60, (fth || ft.clientHeight) - 40); cell.classList.toggle("fine", f < 1); raw = clamp(raw - ddy / h * 100 * f, 0, 100); put(raw); },
      end: () => { dragging = false; cell.classList.remove("fine"); }, double: () => { raw = 0; v = -1; put(o.def || 0); } });
    cell.addEventListener("wheel", e => { if (!cell.matches(":hover")) return; e.preventDefault(); put(v - Math.sign(e.deltaY) * 5); }, { passive: false });
    paint();
    return { el: cell, get: () => v, set(x) { const nv = Math.round(x); if (nv === v && inp.value === String(v)) { if (!dragging) raw = v; return; } v = nv; if (!dragging) raw = v; paint(); } };
  }

  // ---------- Seg: a row of radio buttons (>= 44 px), arrow keys move the choice; wraps instead of shrinking ----------
  function Seg(box, items, onPick, label) {
    box.classList.add("mx-seg"); box.setAttribute("role", "radiogroup"); if (label) box.setAttribute("aria-label", label);
    box.innerHTML = items.map(([val, lab, tip, cls]) => `<button type="button" class="btn${cls ? " " + cls : ""}" role="radio" aria-checked="false" tabindex="-1" data-v="${esc(val)}"${tip ? ` title="${esc(tip)}"` : ""}>${lab}</button>`).join("");
    const bs = [...box.querySelectorAll("button")]; let cur = null;
    const ok = b => b.getAttribute("aria-disabled") !== "true";
    box.addEventListener("click", e => { const b = e.target.closest("button[role=radio]"); if (b && ok(b)) onPick(b.dataset.v, b); });
    box.addEventListener("keydown", e => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault();
      let i = bs.indexOf(doc.activeElement); for (let n = 0; n < bs.length; n++) { i = (i + d + bs.length) % bs.length; if (ok(bs[i])) break; }
      bs[i].focus(); onPick(bs[i].dataset.v, bs[i]); });
    const api = { el: box, btn: v => bs.find(b => b.dataset.v === String(v)),
      set(val) { cur = val == null ? null : String(val); let any = false; for (const b of bs) { const on = b.dataset.v === cur; any = any || on; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }
        if (!any) { const f = bs.find(ok) || bs[0]; if (f) f.tabIndex = 0; } },
      disable(reason) { for (const b of bs) { b.setAttribute("aria-disabled", String(!!reason)); b.title = reason || ""; } box.classList.toggle("na", !!reason); } };
    return api;
  }
  const songBtn = (key, what) => `<button type="button" class="btn mx-song" data-song="${key}" aria-pressed="true" title="Back to the song's own ${esc(what)}" aria-label="${esc(what)}: the song's own">SONG</button>`;
  const rdBtn = (attr, cap, aria, tip) => `<div class="rd-btn"><button type="button" ${attr} aria-label="${esc(aria)}" title="${esc(tip || aria)}"></button><small>${cap}</small></div>`;

  // ---------- markup ----------
  const SEC = { sound: has("setSound"), style: has("setStyleMix") && has("styleMixKeys"), groove: has("setGroove") && has("grooveKeys"), fx: has("setFx") && has("fxKeys") };
  const NAMES = { sound: "Sound", style: "Style", groove: "Groove & Key", fx: "FX" };
  const secHTML = (k, h, badge, hint, body, extra = "") => `<section class="mx-sec" data-sec="${k}" id="${mkid("sec-" + k)}" aria-labelledby="${mkid("h-" + k)}"><header class="mx-sh"><h3><button type="button" class="mx-acc" id="${mkid("h-" + k)}" aria-controls="${mkid("body-" + k)}">${h}<i class="mx-dot" aria-hidden="true"></i></button></h3><span class="mx-badge" data-badge="${k}">${badge}</span>${extra}${rdBtn(`data-reset="${k}"`, "RESET", `Reset ${NAMES[k]}`, k === "style" || k === "groove" ? `Back to the song as written on this station` : `Back to how MDFM sounds as it is, on every station`)}<p class="mx-hint">${hint}</p></header><div class="mx-body" id="${mkid("body-" + k)}">${body}</div></section>`;
  const BYP = has("setMixBypass") ? "setMixBypass" : has("setBypass") ? "setBypass" : null;
  let html = `<div class="mx-in"><div class="wtitle mx-wt"><span id="${mkid("title")}"></span></div><div class="mx-head"><span class="mx-scope" data-scope></span><div class="mx-tabs" aria-label="Mix sections">${Object.keys(SEC).filter(k => SEC[k]).map(k => `<button type="button" class="btn" data-tab="${k}" id="${mkid("tab-" + k)}" aria-controls="${mkid("sec-" + k)}">${NAMES[k]}<i class="mx-dot" aria-hidden="true"></i></button>`).join("")}</div>` +
    (BYP ? `<button type="button" class="btn mx-orig" data-t="orig" aria-pressed="false" title="Hold to hear the station as it is, with no style, groove, effects or EQ. On a touch screen a quick tap keeps it on until you tap again">ORIGINAL</button>` : "") +
    (has("setLite") ? `<button type="button" class="btn mx-lite" data-t="lite" aria-pressed="false" title="LITE mixing for phones and tablets: while MIX is open it pauses the decorations, drops the glass and glow, slows the meters, schedules the music further ahead and holds MDFM's talk breaks until you close MIX. AUTO turns it on for touch screens. Tap to switch AUTO / ON / OFF">LITE <span data-lite-v>AUTO</span></button>` : "") +
    `<button type="button" class="btn mx-void" data-t="void" aria-pressed="false" title="VOID: while MIX is open, the radio drops its skin and every texture, glass, glow and decoration for flat dark blocks (the fastest thing a phone can draw). Same layout and controls. Tap again to bring the look back">VOID</button>` +
    (has("perfStats") ? `<button type="button" class="btn mx-perfbtn" data-t="perf" aria-pressed="false" title="A small readout of how the page and the music are keeping up: frame rate, the longest freeze, and whether notes arrive on time. Try it with LITE and VOID on and off">PERF</button>` : "") +
    `<div class="rd-btn mx-resetall"><button type="button" data-t="reset" aria-label="Reset everything in MIX for this station" title="Everything back: sound and EQ, this station's style and groove, and the effects"></button><small>RESET ALL</small></div></div><p class="mx-bypnote" role="status" hidden>ORIGINAL: you're hearing the station as it is. Your mix comes back when you let go.</p>`;
  // SOUND
  const DEF = radio.soundDefaults(), presets = has("soundPresets") ? radio.soundPresets() : [], rooms = has("rooms") ? radio.rooms() : [];
  const TONE = [["realism", "REALISM", "MIN", "MAX", "How real it sounds: speakers in a room, a little glue and air"],
    ["clarity", "CLARITY", "MIN", "MAX", "Less mud, more presence and air"], ["warmth", "WARMTH", "MIN", "MAX", "Rich, warm tape and console colour"],
    ["width", "SOUNDSTAGE", "MONO", "WIDE", "How wide the stereo picture is (the middle is as it is now)"],
    ["grain", "RADIO GRAIN", "OFF", "MAX", "Hiss, crackle, a narrower band and a little flutter"], ["rattle", "TRUNK RATTLE", "OFF", "MAX", "Loose panels buzzing on heavy sub bass"],
    ["ambience", "AMBIENCE", "OFF", "MORE", "Background sounds under the music: HEARYE's forests, taverns and caves, WYBC's concert-hall room, MDFM's vinyl crackle (the middle is the station's own)"]].filter(x => x[0] in DEF);
  const BANDS = has("setTone") ? [["low", "LOW", "Low shelf (bass), -12 to +12 dB"], ["mid", "MID", "Mid (around 1 kHz), -12 to +12 dB"], ["high", "HIGH", "High shelf (treble), -12 to +12 dB"]] : [];
  // the parametric EQ (engine 1.25 E3): LOW CUT, LOW shelf, MID 1, MID 2, HIGH shelf, HIGH CUT; LOW / MID / HIGH above are the quick route to the same shelves and mid
  const EQB = has("eqBands") && has("setEq") && has("getEq") && has("eqResponse") ? radio.eqBands() : [];
  const EQS = { lc: "LC", ls: "LS", p1: "1", p2: "2", hs: "HS", hc: "HC" }, EQC = { lc: "#6ec3ff", ls: "#ffb347", p1: "#7fe22a", p2: "#ff6fd8", hs: "#ffd23f", hc: "#a99bff" };
  const eqCard = EQB.length ? `<div class="mx-card mx-eq" data-card="eq"><div class="mx-ch"><h4>EQ</h4><button type="button" class="btn mx-tg" data-eq-on aria-pressed="true" title="EQ on or off (off: the station with a flat EQ)">EQ ON</button><button type="button" class="btn mx-sb" data-eq-reset title="Every band back to flat">RESET EQ</button></div>` +
    `<div class="mx-eqg" data-eq-graph role="group" aria-label="EQ curve: drag a band's dot sideways for frequency and up or down for gain; pinch or scroll for Q"><canvas aria-hidden="true"></canvas>${EQB.map(b => `<button type="button" class="mx-eqn" data-band="${b.id}" tabindex="-1" style="--bc:${EQC[b.id] || "#fff"}"><span>${EQS[b.id] || b.id}</span></button>`).join("")}</div>` +
    `<div class="mx-eqstrip"><div data-eq-band></div><div class="mx-knobs mx-eqk">${knobHTML("eq-freq", "FREQ", "LO", "HI")}${knobHTML("eq-gain", "GAIN", "−12", "+12", "mx-bip")}${knobHTML("eq-q", "Q", "WIDE", "NARROW")}<div class="mx-eqcut"><span class="mx-rl">SLOPE</span><div data-eq-slope></div><button type="button" class="btn mx-tg" data-eq-bon aria-pressed="false">OFF</button></div><div class="mx-eqbr"><button type="button" class="btn mx-sb" data-eq-breset>RESET BAND</button></div></div></div>` +
    `${BANDS.length ? `<div class="mx-qt"><span class="mx-rl">QUICK TONE</span><div class="mx-knobs">${BANDS.map(([k, l]) => knobHTML("tone-" + k, l, "−12", "+12", "mx-bip")).join("")}</div></div>` : ""}</div>`
    : BANDS.length ? `<div class="mx-card mx-eq" data-card="eq"><h4>EQ</h4><div class="mx-knobs">${BANDS.map(([k, l]) => knobHTML("tone-" + k, l, "−12", "+12", "mx-bip")).join("")}</div></div>` : "";
  if (SEC.sound) html += secHTML("sound", "SOUND", "ALL STATIONS", "EQ, tone and the room you're listening in. Double-tap a knob or a dot to put it back.",
    `<div class="mx-grid mx-soundgrid">${eqCard}` +
    `<div class="mx-card" data-card="tone"><h4>TONE</h4><div class="mx-knobs">${TONE.map(([k, l, lo, hi]) => knobHTML(k, l, lo, hi, k === "width" || k === "ambience" ? "mx-bip" : "")).join("")}</div></div>` +
    `${"room" in DEF ? `<div class="mx-card" data-card="room"><h4>ROOM</h4>${rooms.length ? `<div data-room></div>` : ""}<div class="mx-knobs">${knobHTML("room", "ROOM", "DRY", "FULL")}</div></div>` : ""}</div>`,
    presets.length ? `<label class="mx-fld">PRESET <select data-preset aria-label="Sound preset"></select></label>` : "");
  // STYLE: ten directions on a circle; PAD (one puck, an AMOUNT ring) or FADERS (one channel each, plus WHAT CHANGES lanes)
  const MIXK = SEC.style ? radio.styleMixKeys() : [], DIRS = MIXK.filter(x => x[0] !== "chaos");
  const PAD = SEC.style && has("padToMix") && has("mixToPad") && has("setStylePad") && DIRS.length >= 3;
  const ANG = Object.fromEntries(DIRS.map(([k, , , a], i) => [k, typeof a === "number" ? a : i * 360 / DIRS.length]));
  const DCOL = Object.fromEntries(DIRS.map(([k]) => [k, `hsl(${Math.round(ANG[k])},72%,62%)`]));
  const LANES = SEC.style && has("styleLanes") && has("setStyleLanes") && has("getStyleLanes") ? radio.styleLanes() : [];
  const STAGES = SEC.style && has("styleStages") ? radio.styleStages() : [];
  const RINGS = STAGES.filter(s => s.ring).map(s => [s.ring, s.ringLabel || s.label2 || s.label]);
  const short = l => l.length > 8 ? l.slice(0, 4) + "." : l;   // ORCHESTRAL -> ORCH. on the pad (its full name is the button's label)
  const padHTML = !PAD ? "" : `<div class="mx-pad" data-view="pad" data-hook="style-pad"><div class="mx-padbox" data-padbox><svg class="mx-padsvg" viewBox="-100 -100 200 200" aria-hidden="true"></svg>` +
    DIRS.map(([k, l]) => { const a = ANG[k] * Math.PI / 180; return `<button type="button" class="mx-pl" data-dir="${k}" style="left:${(50 + 41 * Math.sin(a)).toFixed(2)}%;top:${(50 - 41 * Math.cos(a)).toFixed(2)}%;--dc:${DCOL[k]}" aria-label="${esc(l)}: pull toward it" title="${esc(l)}">${esc(short(l))}</button>`; }).join("") +
    `<div class="mx-puck mx-ghost" hidden aria-hidden="true"></div><div class="mx-puck" data-puck role="slider" tabindex="0" aria-label="Style blend" aria-valuemin="0" aria-valuemax="100"></div></div>` +
    `<div class="mx-padro"><output class="mx-padtxt" aria-live="polite"></output>${knobHTML("ring", "AMOUNT", "0", "ALL")}</div><p class="mx-hint mx-custom" hidden>Custom blend: see FADERS. Dragging the pad replaces it.</p></div>`;
  if (SEC.style) html += secHTML("style", "STYLE", "THIS STATION", "Pull the song toward a style. Each station keeps its own; Save takes it.",
    `<div class="mx-grid mx-stylegrid"><div class="mx-card mx-stylecard" data-card="blend"><div class="mx-ch"><h4>STYLE BLEND</h4><div class="mx-view" data-hook="style-view"${PAD ? "" : " hidden"}></div><span class="mx-scaled" hidden title="The styles add up to more than 100%, so the engine scales them down; the small numbers are what plays">SCALED</span></div>${padHTML}` +
    `<div class="mx-fbank" data-view="faders" role="group" aria-label="Style faders">${DIRS.map(([k, l]) => faderHTML(k, l)).join("")}</div>` +
    `${STAGES.length ? `<p class="mx-hint mx-legend" data-view="faders" aria-hidden="true"><i data-s="feel"></i>FEEL <i data-s="drums"></i>DRUMS <i data-s="band"></i>BAND <i data-s="full"></i>FULL: how far each style has gone</p>` : ""}` +
    `${LANES.length ? `<div class="mx-lanes" data-view="faders"><span class="mx-rl">WHAT CHANGES</span><div class="mx-knobs">${LANES.map(([k, l]) => knobHTML("lane-" + k, l, "OFF", "ALL", "mx-lane", `${l} lane: how much the styles may change it`)).join("")}</div></div>` : ""}</div></div>`);
  // GROOVE & KEY
  const GK = SEC.groove ? radio.grooveKeys() : [], GKS = new Set(GK.map(x => x[0])), GD = SEC.groove && has("grooveDefaults") ? radio.grooveDefaults() : {};
  const OLDG = { swing: ["STRAIGHT", "SHUFFLE", "tempo"], length: ["×0.5", "×3", "tempo"], density: ["BARE", "BUSY", "drums"], fills: ["NONE", "LOTS", "drums"], drums: ["OFF", "LOUD", "levels"], humanize: ["TIGHT", "LOOSE", "feel"] };
  // one record per key: {id, label, tip, type, min, max, def, song, bipolar, group, captions, unit, scale}; old engines without meta get it from OLDG
  const GI = (has("grooveKeyInfo") ? radio.grooveKeyInfo() : GK.map(([id, label, tip, meta]) => ({ id, label, tip, ...(obj(meta) || {}) }))).map(m => {
    const o = OLDG[m.id], def = typeof GD[m.id] === "number" ? GD[m.id] : m.def;
    return { ...m, def, type: m.type || (o || (typeof def === "number" && !["bpm", "root", "feel"].includes(m.id)) ? "knob" : "choice"), group: m.group || (o ? o[2] : "drums"),
      captions: m.captions || (o ? [o[0], o[1]] : ["MIN", "MAX"]), song: m.song || (typeof def === "number" && def < 0 ? "SONG" : "") }; }).filter(m => GKS.has(m.id));
  const CAPS = { push: ["EARLY", "LATE"], pushK: ["EARLY", "LATE"], pushS: ["EARLY", "LATE"], pushH: ["EARLY", "LATE"], hatdens: ["LESS", "MORE"], hatswing: ["0", "HEAVY"], swing: ["0", "SHUFFLE"] };   // short enough for the knob's width
  for (const m of GI) if (CAPS[m.id]) m.captions = CAPS[m.id];
  const GIK = Object.fromEntries(GI.map(m => [m.id, m])), gtip = Object.fromEntries(GI.map(m => [m.id, m.tip || ""]));
  const GORD = ["mel", "rep", "range", "harm", "swing", "length", "density", "hatdens", "fills", "ghosts", "push", "hatswing", "humanize", "accent", "pushK", "pushS", "pushH", "kick", "snare", "hats", "drums"];   // matrix.md 5.3
  const GKNOB = GI.filter(m => m.type === "knob" && typeof GD[m.id] === "number").sort((a, b) => (GORD.indexOf(a.id) + 1 || 99) - (GORD.indexOf(b.id) + 1 || 99));
  const capFix = s => String(s).replace(/^x(?=\d)/, "×");
  const GSUB = [["drums", "PATTERN"], ["feel", "FEEL"], ["levels", "LEVELS"]];
  const GLAB = { drums: "ALL", hats: "HATS", kick: "KICK", snare: "SNARE", pushK: "KICK", pushS: "SNARE", pushH: "HATS" };   // short captions inside their group
  const GARIA = { drums: "Drums level, all of the kit", hats: "Hats level", kick: "Kick level", snare: "Snare level", pushK: "Kick push", pushS: "Snare push", pushH: "Hat push", hatdens: "Hat density" };
  const DEFCAP = { push: "ON", accent: "AS IS", humanize: "OFF", ghosts: "OFF", mel: "AS IS", rep: "AS IS", range: "AS IS", harm: "AS IS" };
  const kw = m => `<div class="mx-kw">${knobHTML("g-" + m.id, GLAB[m.id] || m.label, capFix(m.captions[0]), capFix(m.captions[1]), m.bipolar ? "mx-bip" : "", GARIA[m.id] || "")}` +
    `<button type="button" class="btn mx-song" data-song="${m.id}" aria-pressed="true" title="${esc(m.song ? (m.song === "FOLLOW" ? "Follow the main setting" : "Back to the song's own") : "Back to the default")}" aria-label="${esc((GARIA[m.id] || m.label) + ": " + (m.song ? (m.song === "FOLLOW" ? "follow" : "the song's own") : "default"))}">${m.song || DEFCAP[m.id] || "DEF"}</button></div>`;
  const gTempoK = GKNOB.filter(m => m.group === "tempo"), gMelK = GKNOB.filter(m => m.group === "melody"), gPushPart = new Set(["pushK", "pushS", "pushH"]);
  if (SEC.groove) html += secHTML("groove", "GROOVE &amp; KEY", "THIS STATION", gMelK.length ? "Tempo, time, key, melody and drums. SONG and AS IS follow the song as written." : "Tempo, time, key and drums. SONG follows the song as written.",
    `<div class="mx-gtabs" data-gtabs></div><div class="mx-grid mx-gcards">` +
    `<div class="mx-card" data-card="tempo" id="${mkid("gc-tempo")}"><h4>TEMPO &amp; TIME</h4>${GKS.has("bpm") ? `<div class="mx-num" data-key="bpm"><span class="mx-numl" id="${mkid("bpml")}">BPM</span><button type="button" class="btn" data-d="-1" aria-label="Slower">−</button><div class="lcd mx-lcd" role="spinbutton" tabindex="0" aria-labelledby="${mkid("bpml")}" aria-valuemin="40" aria-valuemax="220" title="${esc(gtip.bpm || "")}"></div><button type="button" class="btn" data-d="1" aria-label="Faster">+</button><button type="button" class="btn" data-tap title="Tap the beat">TAP</button>${songBtn("bpm", "tempo")}</div>` : ""}` +
    `${GKS.has("meter") ? `<div class="mx-row"><span class="mx-rl">TIME</span><div data-g="meter"></div></div>` : ""}${GKS.has("feel") ? `<div class="mx-row"><span class="mx-rl">FEEL</span><div data-g="feel"></div></div>` : ""}` +
    `${gTempoK.length ? `<div class="mx-knobs mx-kwrap">${gTempoK.map(kw).join("")}</div>` : ""}</div>` +
    `<div class="mx-card" data-card="key" id="${mkid("gc-key")}"><h4>KEY</h4>${GKS.has("root") ? `<div data-g="root"></div>` : ""}${GKS.has("mode") ? `<label class="mx-fld">MODE <select data-g="mode" title="${esc(gtip.mode || "")}"></select></label>` : ""}</div>` +
    `${gMelK.length ? `<div class="mx-card mx-melody" data-card="melody" id="${mkid("gc-melody")}"><h4>MELODY</h4><div class="mx-knobs mx-kwrap">${gMelK.map(kw).join("")}</div></div>` : ""}` +
    `<div class="mx-card mx-drums" data-card="drums" id="${mkid("gc-drums")}"><h4>DRUMS</h4>${GSUB.map(([g, l]) => { const ks = GKNOB.filter(m => m.group === g || (g === "drums" && !["tempo", "feel", "levels", "melody"].includes(m.group)));
      if (!ks.length) return ""; const main = ks.filter(m => !gPushPart.has(m.id)), part = ks.filter(m => gPushPart.has(m.id));
      return `<div class="mx-sub" data-sub="${g}"><h5>${l}</h5><div class="mx-knobs mx-kwrap">${main.map(kw).join("")}</div>${part.length ? `<details class="mx-more"><summary>PUSH EACH PART</summary><div class="mx-knobs mx-kwrap">${part.map(kw).join("")}</div></details>` : ""}</div>`; }).join("")}</div></div>`);
  // FX (GLITCH is a trick: it lives in TRICKS with TAPE STOP and SPIN BACK)
  const FK = SEC.fx ? radio.fxKeys() : [], FKS = new Set(FK.map(x => x[0])), FD = SEC.fx && has("fxDefaults") ? radio.fxDefaults() : {};
  const FGROUPS = [["space", "SPACE", ["echo", "reverb"]], ["move", "MOVEMENT", ["chorus", "flange", "phaser", "warble"]], ["colour", "COLOUR", ["drive", "crush"]],
    ["filter", "FILTER", ["filter"]], ["rhythm", "RHYTHM", ["gate", "pump"]]];
  const grouped = new Set([...FGROUPS.flatMap(g => g[2]), "glitch"]), FMORE = FK.map(x => x[0]).filter(k => !grouped.has(k)), flab = Object.fromEntries(FK.map(([k, l, t]) => [k, [l, t]]));
  const FLO = { filter: ["LP", "HP"] }, hasTricks = has("tapeStop") || has("spinBack") || FKS.has("glitch");
  if (SEC.fx) html += secHTML("fx", "FX", "ALL STATIONS", "Echo, gate and pump follow the beat. Off (the filter in the middle) is the station as it is.",
    `<div class="mx-grid mx-fxgrid">${FGROUPS.map(([g, l, ks]) => { const here = ks.filter(k => FKS.has(k)); if (!here.length && g !== "colour") return "";
      return `<div class="mx-card mx-grp" data-card="${g}"><h4>${l}</h4><div class="mx-knobs">${here.map(k => knobHTML("fx-" + k, flab[k][0], (FLO[k] || ["OFF"])[0], (FLO[k] || ["", "MAX"])[1], k === "filter" ? "mx-hero mx-bip" : "")).join("")}${g === "colour" ? `<div class="mx-uw" data-uw></div>` : ""}</div></div>`; }).join("")}` +
    `${FMORE.length ? `<div class="mx-card mx-grp" data-card="more"><h4>MORE</h4><div class="mx-knobs">${FMORE.map(k => knobHTML("fx-" + k, flab[k][0], "OFF", "MAX")).join("")}</div></div>` : ""}` +
    `${hasTricks ? `<div class="mx-card mx-grp mx-tricks" data-card="tricks"><h4>TRICKS</h4><div class="mx-pads">${has("tapeStop") ? `<button type="button" class="btn mx-padbtn" data-t="tape" title="The music slows to a stop, then drops back in on the beat">TAPE STOP</button>` : ""}${has("spinBack") ? `<button type="button" class="btn mx-padbtn" data-t="spin" title="Spins the music backwards like a record, then drops back in on the beat">SPIN BACK</button>` : ""}</div>` +
      `${FKS.has("glitch") ? `<div class="mx-knobs">${knobHTML("fx-glitch", flab.glitch[0], "OFF", "MAX", "chaos")}</div>` : ""}</div>` : ""}</div>`);
  html += `<button type="button" class="btn mx-close">▲ Close ${esc(title)}</button></div>`;

  panel.classList.remove("pop", "tunepop"); panel.classList.add("mixdrawer"); panel.setAttribute("role", "region"); panel.setAttribute("aria-labelledby", mkid("title"));
  panel.hidden = true; panel.innerHTML = html; panel.querySelector(`#${mkid("title")}`).textContent = title;
  const $p = s => panel.querySelector(s), $$p = s => [...panel.querySelectorAll(s)];
  const qc = new Map(), $c = s => { let e = qc.get(s); if (!e || !e.isConnected) { e = panel.querySelector(s); if (e) qc.set(s, e); } return e; };   // 1.26: cached lookups for per-frame paints
  const S = {};   // per section: { paint(), reset(), moved() }
  const painted = {};   // 1.26: when MIX last painted a section itself (so the engine's echo of the same change doesn't paint it twice)
  const visible = el => !!el && !panel.hidden && el.getClientRects().length > 0;
  const hz = f => f >= 1000 ? (f / 1000).toFixed(f < 10000 ? (f % 1000 ? 1 : 0) : 0).replace(/\.0$/, "") + "k" : String(Math.round(f));

  // ---------- SOUND: tone, room, presets, and the EQ (curve + six bands + the quick LOW / MID / HIGH) ----------
  if (SEC.sound) {
    const st = lazy(store) || ls("mdfmSound"); let cur = radio.getSound(); const saved = obj(st.get()); if (saved) cur = radio.setSound(saved);
    const ts = lazy(toneStore) || ls("mdfmTone"), es = lazy(eqStore) || ls("mdfmEq"), num = (v, d) => typeof v === "number" && Number.isFinite(v) ? clamp(v, -12, 12) : d;
    let tone = { low: 0, mid: 0, high: 0 };
    const EQON = EQB.length > 0, EQD = EQON && has("eqDefaults") ? radio.eqDefaults() : null;
    const toneOf = e => { const b = id => (EQB.find(x => x.tone === id) || {}).id, g = id => num(e[b(id)] && e[b(id)].gain, 0); return { low: g("low"), mid: g("mid"), high: g("high") }; };
    if (EQON) { const se = obj(es.get()); if (se) radio.setEq(se); else { const t0 = obj(ts.get()); if (t0) radio.setTone({ low: num(t0.low, 0), mid: num(t0.mid, 0), high: num(t0.high, 0) }); }
      tone = toneOf(radio.getEq()); }
    else if (BANDS.length) { const t0 = obj(ts.get()) || (has("getTone") ? radio.getTone() : {}) || {};
      tone = { low: num(t0.low, 0), mid: num(t0.mid, 0), high: num(t0.high, 0) }; radio.setTone(tone); }
    const same = (a, b) => Object.keys(DEF).every(k => k === "roomType" ? (a.room === 0 && b.room === 0) || a.roomType === b.roomType : Math.abs(a[k] - b[k]) < .005);
    const pct = v => Math.round(v * 100);
    const set = o => { cur = radio.setSound(o); st.set(cur); S.sound.paint(); led(); };
    const K = {};
    for (const [k, , , , tip] of TONE) { const bip = k === "width" || k === "ambience";
      K[k] = Knob($p(`.mx-k[data-key="${k}"]`), { min: 0, max: 100, step: 1, def: Math.round(DEF[k] * 100), center: bip ? 50 : null, tip,
        fmt: v => k === "width" ? (Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "−" + (50 - v) : "+" + (v - 50)) : k === "ambience" ? (v === 0 ? "OFF" : Math.abs(v - 50) < 1 ? "OWN" : v + "%") : v === 0 ? "OFF" : v + "%",
        text: v => k === "width" ? (v < 48 ? `narrower (${v})` : v > 52 ? `wider (${v})` : "as it is") : k === "ambience" ? (v === 0 ? "off" : v < 48 ? `quieter (${v})` : v > 52 ? `louder (${v})` : "the station's own") : v === 0 ? "off" : v + " percent",
        onInput: v => set({ [k]: v / 100 }) }); }
    if ("room" in DEF) K.room = Knob($p(`.mx-k[data-key="room"]`), { min: 0, max: 100, step: 1, def: Math.round(DEF.room * 100), tip: "How much of the listening room you hear (pick the room above; tap it again for dry)",
      fmt: v => v === 0 ? "DRY" : v + "%", onInput: v => set({ room: v / 100 }) });
    const roomSeg = $p("[data-room]") ? Seg($p("[data-room]"), rooms.map(r => [r.id, r.name]), v => { if (cur.room > 0 && cur.roomType === v) set({ room: 0 }); else set({ roomType: v, room: cur.room || .5 }); }, "Listening room") : null;
    // the EQ is saved whole (mdfmEq) and as mdfmTone {low, mid, high}: the receiver re-applies mdfmTone when it mounts, so both must agree
    const saveTone = () => { if (EQON) { const e = radio.getEq(); es.set(e); tone = toneOf(e); } ts.set(tone); };
    const TB = {};
    for (const [b, , tip] of BANDS) TB[b] = Knob($p(`.mx-k[data-key="tone-${b}"]`), { min: -12, max: 12, step: .5, def: 0, center: 0, tip,
      fmt: v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1), text: v => `${v > 0 ? "+" : ""}${v} dB`,
      onInput: v => { tone[b] = v; radio.setTone({ [b]: v }); saveTone(); S.sound.paint(); led(); } });
    const pre = $p("[data-preset]");
    if (pre) { for (const p of [...presets, { id: "custom", name: "Custom" }]) { const o = doc.createElement("option"); o.value = p.id; o.textContent = p.name; pre.appendChild(o); }
      pre.addEventListener("change", () => { const p = presets.find(x => x.id === pre.value); if (p) set(p.sound); }); }   // a preset sets tone and room, never the EQ
    const E = EQON ? mountEq(() => { saveTone(); S.sound.paint(); led(); }) : null;
    const toneMoved = () => BANDS.some(([b]) => Math.abs(tone[b]) > .01);
    S.sound = {
      paint() { for (const [k] of TONE) { K[k].set(pct(cur[k])); K[k].state({ moved: Math.abs(cur[k] - DEF[k]) > .005 }); }
        if (K.room) { K.room.set(pct(cur.room)); K.room.state({ moved: Math.abs(cur.room - DEF.room) > .005 }); }
        if (roomSeg) roomSeg.set(cur.room > 0 ? cur.roomType : null);
        if (EQON) tone = toneOf(radio.getEq());
        for (const [b] of BANDS) { TB[b].set(tone[b]); TB[b].state({ moved: Math.abs(tone[b]) > .01 }); }
        if (pre) { const m = presets.find(p => same(p.sound, cur)); pre.value = m ? m.id : "custom"; }
        if (E) E.paint(); },
      reset() { cur = radio.resetSound(); st.set(cur); if (EQON) radio.resetEq(); else if (BANDS.length) { tone = { low: 0, mid: 0, high: 0 }; radio.setTone(tone); } saveTone(); this.paint(); },
      moved: () => !same(cur, DEF) || toneMoved() || (E ? E.moved() : false), get: () => ({ ...cur }), set, eq: E };

    // ---------- the parametric EQ: a HiDPI canvas curve from eqResponse(), six draggable dots, and a band strip under it ----------
    function mountEq(changed) {
      const g = $p("[data-eq-graph]"), cv = g.querySelector("canvas"), cx = cv.getContext && cv.getContext("2d"), nodes = Object.fromEntries($$p(".mx-eqn").map(n => [n.dataset.band, n]));
      const BI = Object.fromEntries(EQB.map(b => [b.id, b])), isCut = b => !!BI[b].slopes, hasQ = b => !!BI[b].q, hasGain = b => !!BI[b].gain;
      if (!BI[ui.eqBand]) ui.eqBand = BI.p1 ? "p1" : EQB[0].id;
      const FMIN = 20, FMAX = 20000, DB = 15, NPT = 192, FQ = new Float32Array(NPT); for (let i = 0; i < NPT; i++) FQ[i] = FMIN * Math.pow(FMAX / FMIN, i / (NPT - 1));
      let W = 0, H = 0, dpr = 1, drawT = 0, specT = 0, eq = radio.getEq();
      const xOf = f => Math.log(f / FMIN) / Math.log(FMAX / FMIN) * W, fOf = x => FMIN * Math.pow(FMAX / FMIN, clamp(x / W, 0, 1));
      const yOf = d => H / 2 - d / DB * (H / 2 - 8), dOf = y => (H / 2 - y) / (H / 2 - 8) * DB;
      let eqPend = null; const mergeP = (a, b) => { const o = { ...a }; for (const k in b) o[k] = b[k] && typeof b[k] === "object" ? { ...(o[k] || {}), ...b[k] } : b[k]; return o; };
      const put = p => { eqPend = eqPend ? mergeP(eqPend, p) : p; live(g, () => { const q = eqPend; eqPend = null; if (q) { eq = radio.setEq(q); changed(); } }); };
      const resp = b => { try { return radio.eqResponse(FQ, b); } catch (e) { return new Float32Array(NPT); } };
      const nodeY = b => { const o = eq[b]; if (hasGain(b)) return yOf(eq.on === false ? 0 : o.gain); const r = radio.eqResponse([o.freq], b); return yOf(o.on && eq.on !== false ? clamp(r[0] || 0, -DB, DB) : 0); };
      function draw() { drawT = 0; if (!cx || !W) return; const css = win.getComputedStyle(panel), lcd = (css.getPropertyValue("--lcd") || "").trim() || "#00e000";
        cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
        cx.fillStyle = "rgba(0,0,0,.42)"; cx.fillRect(0, 0, W, H);
        const sp = radio.isOn && radio.isOn() && has("getSpectrum") ? radio.getSpectrum() : null;   // the live spectrum, faint, behind everything
        if (sp && sp.length) { cx.fillStyle = "rgba(255,255,255,.07)"; const n = sp.length; for (let i = 0; i < n; i++) { const f0 = 42 * Math.pow(15000 / 42, i / n), f1 = 42 * Math.pow(15000 / 42, (i + 1) / n), h = clamp(sp[i], 0, 1) * (H - 4);
          cx.fillRect(xOf(f0) + 1, H - h, Math.max(1, xOf(f1) - xOf(f0) - 2), h); } }
        cx.lineWidth = 1; cx.font = "10px Tahoma,Verdana,sans-serif"; cx.textBaseline = "top";
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = Math.round(xOf(f)) + .5; cx.strokeStyle = "rgba(255,255,255,.09)"; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
          if (W > 300 || [100, 1000, 10000].includes(f)) { cx.fillStyle = "rgba(255,255,255,.38)"; cx.fillText(hz(f), x + 3, H - 13); } }
        for (const d of [-12, -6, 6, 12]) { const y = Math.round(yOf(d)) + .5; cx.strokeStyle = "rgba(255,255,255,.06)"; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
          cx.fillStyle = "rgba(255,255,255,.32)"; cx.fillText((d > 0 ? "+" : "") + d, 3, y - (d > 0 ? -2 : 12)); }
        { const y = Math.round(yOf(0)) + .5; cx.strokeStyle = "rgba(255,255,255,.28)"; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
        const line = (a, col, w, dash) => { cx.strokeStyle = col; cx.lineWidth = w; cx.setLineDash(dash || []); cx.beginPath(); for (let i = 0; i < NPT; i++) { const x = xOf(FQ[i]), y = yOf(clamp(a[i], -DB - 2, DB + 2)); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); cx.setLineDash([]); };
        const on = eq.on !== false;
        if (on) for (const b of EQB) { const o = eq[b.id]; if ((isCut(b.id) && !o.on) || (hasGain(b.id) && Math.abs(o.gain) < .05)) continue;
          const r = resp(b.id); cx.globalAlpha = b.id === ui.eqBand ? .75 : .4; line(r, EQC[b.id] || "#fff", 1.25); cx.globalAlpha = 1;
          if (b.id === ui.eqBand) { cx.fillStyle = (EQC[b.id] || "#fff") + "22"; cx.beginPath(); cx.moveTo(0, yOf(0)); for (let i = 0; i < NPT; i++) cx.lineTo(xOf(FQ[i]), yOf(clamp(r[i], -DB - 2, DB + 2))); cx.lineTo(W, yOf(0)); cx.closePath(); cx.fill(); } }
        line(on ? resp() : new Float32Array(NPT), on ? lcd : "rgba(255,255,255,.45)", 2.25, on ? null : [5, 4]);
        for (const b of EQB) { const n = nodes[b.id], o = eq[b.id]; if (!n) continue; n.style.left = xOf(o.freq) + "px"; n.style.top = nodeY(b.id) + "px";
          n.classList.toggle("off", (isCut(b.id) && !o.on) || !on); n.classList.toggle("sel", b.id === ui.eqBand);
          n.setAttribute("aria-label", `${b.label}: ${hz(o.freq)}Hz${hasGain(b.id) ? `, ${o.gain > 0 ? "+" : ""}${o.gain.toFixed(1)} dB` : isCut(b.id) ? (o.on ? `, ${o.slope} dB per octave` : ", off") : ""}`); } }
      const redraw = () => { if (!drawT) drawT = (win.requestAnimationFrame || (f => setTimeout(f, 16)))(draw); };
      const size = () => { const r = g.getBoundingClientRect(); if (!r.width) return; dpr = Math.min(win.MDFM_lite ? 2 : 3, win.devicePixelRatio || 1); W = r.width; H = r.height;
        const bw = Math.round(W * dpr), bh = Math.round(H * dpr); if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; } draw(); };
      if (typeof ResizeObserver === "function") new ResizeObserver(size).observe(g);
      // 15 fps spectrum, only while the drawer is open, the graph on screen and the radio on
      const spec = () => { specT = 0; if (!panel.hidden && !doc.hidden && visible(g) && radio.isOn && radio.isOn()) { if (win.MDFM_lite) { specT = setTimeout(spec, 500); return; } draw(); specT = setTimeout(spec, 66); } };   // 1.26: LITE leaves the live spectrum out
      const specOn = () => { if (!specT) specT = setTimeout(spec, 66); };
      // band strip: picker, FREQ / GAIN / Q knobs (or SLOPE 12 / 24 and ON for the cuts), RESET BAND
      const pick = Seg($p("[data-eq-band]"), EQB.map(b => [b.id, EQS[b.id] || b.id, b.label]), v => { ui.eqBand = v; saveUI(); paint(); }, "EQ band");
      const lf = (b, u) => { const [a, z] = BI[b].freq; return a * Math.pow(z / a, u / 1000); }, uf = (b, f) => { const [a, z] = BI[b].freq; return Math.round(Math.log(f / a) / Math.log(z / a) * 1000); };
      const lq = (b, u) => { const [a, z] = BI[b].q || [.3, 8]; return a * Math.pow(z / a, u / 1000); }, uq = (b, q) => { const [a, z] = BI[b].q || [.3, 8]; return Math.round(Math.log(q / a) / Math.log(z / a) * 1000); };
      const bnow = () => ui.eqBand, dflt = b => (EQD && EQD[b]) || BI[b].def || {};
      const KF = Knob($p('.mx-k[data-key="eq-freq"]'), { min: 0, max: 1000, step: 1, def: 500, tip: "The band's frequency", fmt: u => hz(lf(bnow(), u)) + "Hz", text: u => hz(lf(bnow(), u)) + " hertz",
        onInput: u => put({ [bnow()]: { freq: +lf(bnow(), u).toFixed(1) } }), onReset: () => put({ [bnow()]: { freq: dflt(bnow()).freq } }), toEdit: u => Math.round(lf(bnow(), u)), fromEdit: f => uf(bnow(), clamp(f, ...BI[bnow()].freq)) });
      const KG = Knob($p('.mx-k[data-key="eq-gain"]'), { min: -12, max: 12, step: .5, def: 0, center: 0, tip: "The band's boost or cut", fmt: v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1), text: v => `${v > 0 ? "+" : ""}${v} dB`,
        onInput: v => put({ [bnow()]: { gain: v } }), onReset: () => put({ [bnow()]: { gain: 0 } }) });
      const KQ = Knob($p('.mx-k[data-key="eq-q"]'), { min: 0, max: 1000, step: 1, def: 300, tip: "How wide the band is: low Q is broad, high Q is narrow", fmt: u => lq(bnow(), u).toFixed(2), text: u => "Q " + lq(bnow(), u).toFixed(2),
        onInput: u => put({ [bnow()]: { q: +lq(bnow(), u).toFixed(3) } }), onReset: () => put({ [bnow()]: { q: dflt(bnow()).q } }), toEdit: u => +lq(bnow(), u).toFixed(2), fromEdit: q => uq(bnow(), clamp(q, ...(BI[bnow()].q || [.3, 8]))) });
      const slope = Seg($p("[data-eq-slope]"), [["12", "12 dB"], ["24", "24 dB"]], v => put({ [bnow()]: { slope: +v, on: true } }), "Slope, dB per octave");
      const bon = $p("[data-eq-bon]"), onB = $p("[data-eq-on]");
      bon.addEventListener("click", () => put({ [bnow()]: { on: !eq[bnow()].on } }));
      onB.addEventListener("click", () => { eq = has("eqBypass") ? (radio.eqBypass(eq.on !== false), radio.getEq()) : radio.setEq({ on: eq.on === false }); changed(); });
      const resetBand = b => put({ [b]: { ...dflt(b), ...(isCut(b) ? { on: false } : {}) } });
      $p("[data-eq-breset]").addEventListener("click", () => resetBand(bnow()));
      $p("[data-eq-reset]").addEventListener("click", () => { eq = radio.resetEq(); changed(); });
      const moved = () => { const e = radio.getEq(); if (e.on === false) return true;
        return EQB.some(b => { const o = e[b.id], d = dflt(b.id); return isCut(b.id) ? !!o.on : Math.abs(o.gain - (d.gain || 0)) > .01; }); };
      function paint() { eq = radio.getEq(); const b = bnow(), o = eq[b];
        pick.set(b); KF.set(uf(b, o.freq)); KF.state({ moved: Math.abs(o.freq - (dflt(b).freq || o.freq)) > .5 });
        KG.el.hidden = !hasGain(b); if (hasGain(b)) { KG.set(o.gain); KG.state({ moved: Math.abs(o.gain) > .01 }); }
        KQ.el.hidden = !hasQ(b); if (hasQ(b)) { KQ.set(uq(b, o.q)); KQ.state({ moved: Math.abs(o.q - (dflt(b).q || o.q)) > .005 }); }
        $p(".mx-eqcut").hidden = !isCut(b); if (isCut(b)) { slope.set(String(o.slope)); bon.setAttribute("aria-pressed", String(!!o.on)); bon.textContent = o.on ? "ON" : "OFF"; bon.setAttribute("aria-label", `${BI[b].label} ${o.on ? "on" : "off"}`); }
        const eon = eq.on !== false; onB.setAttribute("aria-pressed", String(eon)); onB.textContent = eon ? "EQ ON" : "EQ OFF"; panel.querySelector(".mx-eq").classList.toggle("eqoff", !eon);
        redraw(); if (!panel.hidden) specOn(); }
      // the dots: x = frequency, y = gain (shelves and peaks; the cuts move sideways only); Q by pinch, wheel, Alt-drag or the Q knob
      const pts = new Map(); let drag = null, pinch = null, lastTap = { t: 0, b: "", x: 0, y: 0 };
      let gRect = null; const local = e => { const r = gRect || g.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const hit = (x, y) => { let best = null, bd = 23; for (const b of EQB) { const n = nodes[b.id]; if (!n) continue; const d = Math.hypot(x - parseFloat(n.style.left), y - parseFloat(n.style.top)) - (b.id === ui.eqBand ? 4 : 0);
        if (d < bd) { bd = d; best = b.id; } } return best; };
      const select = b => { if (b !== ui.eqBand) { ui.eqBand = b; saveUI(); paint(); } };
      g.addEventListener("pointerdown", e => { if (e.pointerType === "mouse" && e.button !== 0) return; const [x, y] = local(e);
        if (!pts.size) gRect = g.getBoundingClientRect(); if (!pts.has(e.pointerId)) dragOn(); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { g.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault();
        if (pts.size === 2) { const pb = drag && !drag.moved && drag.before ? drag.before : ui.eqBand;   // a second finger: pinch the band (fingers apart = a wider band, lower Q) that was selected (the first finger only just landed)
          if (drag) nodes[drag.b].classList.remove("drag"); drag = null; if (!hasQ(pb)) return; select(pb); const [a, c] = [...pts.values()]; pinch = { d0: Math.max(24, Math.abs(a.x - c.x)), q0: eq[pb].q }; return; }
        if (pts.size > 1) return; const before = ui.eqBand, b = hit(x, y); if (!b) { drag = null; return; } select(b);
        drag = { b, id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: x - parseFloat(nodes[b].style.left), oy: y - parseFloat(nodes[b].style.top), moved: false, before, q0: eq[b].q, alt: e.altKey && e.pointerType === "mouse" };
        nodes[b].classList.add("drag"); });
      g.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pts.size >= 2) { const [a, c] = [...pts.values()], d = Math.max(24, Math.abs(a.x - c.x)); put({ [ui.eqBand]: { q: +clamp(pinch.q0 * pinch.d0 / d, ...(BI[ui.eqBand].q || [.3, 8])).toFixed(3) } }); return; }
        if (!drag || drag.id !== e.pointerId) return; if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) return; drag.moved = true;
        const b = drag.b; if (drag.alt && hasQ(b)) { put({ [b]: { q: +clamp(drag.q0 * Math.pow(2, -(e.clientY - drag.y0) / 60), ...BI[b].q).toFixed(3) } }); return; }
        const [x, y] = local(e), p = { freq: +clamp(fOf(x - drag.ox), ...BI[b].freq).toFixed(1) };
        if (hasGain(b)) { let d = clamp(dOf(y - drag.oy), -12, 12); if (Math.abs(d) < .35) d = 0; p.gain = Math.round(d * 10) / 10; }
        if (isCut(b) && !eq[b].on) p.on = true; put({ [b]: p }); });
      const up = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (!pts.size) gRect = null; dragOff(); if (pinch) { if (pts.size < 2) pinch = null; return; }
        if (!drag || drag.id !== e.pointerId) return; const d = drag; drag = null; nodes[d.b].classList.remove("drag");
        if (e.type !== "pointerup" || d.moved) { lastTap.t = 0; return; }
        const t = performance.now(); if (t - lastTap.t < 300 && lastTap.b === d.b && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 12) { lastTap.t = 0; resetBand(d.b); return; }
        lastTap = { t, b: d.b, x: e.clientX, y: e.clientY }; if (isCut(d.b) && !eq[d.b].on) put({ [d.b]: { on: true } }); };
      g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up); g.addEventListener("lostpointercapture", up);
      g.addEventListener("wheel", e => { const [x, y] = local(e), b = hit(x, y) || null; if (!b || !hasQ(b)) return; e.preventDefault(); select(b);
        put({ [b]: { q: +clamp(eq[b].q * Math.pow(2, -e.deltaY * .002), ...BI[b].q).toFixed(3) } }); }, { passive: false });
      for (const b of EQB) { const n = nodes[b.id]; if (!n) continue; n.addEventListener("focus", () => select(b.id));
        n.addEventListener("keydown", e => { const o = eq[b.id], fs = e.shiftKey ? 1.12 : 1.03; let p = null;
          if (e.key === "ArrowRight") p = { freq: clamp(o.freq * fs, ...b.freq) }; else if (e.key === "ArrowLeft") p = { freq: clamp(o.freq / fs, ...b.freq) };
          else if (hasGain(b.id) && (e.key === "ArrowUp" || e.key === "ArrowDown")) p = { gain: clamp(o.gain + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 3 : .5), -12, 12) };
          else if (e.key === "Delete" || e.key === "Backspace") { resetBand(b.id); e.preventDefault(); return; } else return; e.preventDefault(); put({ [b.id]: p }); }); }
      for (const n of Object.values(nodes)) n.tabIndex = 0;
      if (radio.on) radio.on("eq", () => { if (!drag && !pinch) { eq = radio.getEq(); } });
      return { paint, moved, size, redraw, specOn };
    }
  }

  // ---------- STYLE: PAD (a puck among ten directions, an AMOUNT ring, FEEL / DRUMS / BAND / FULL rings) and FADERS (one channel each) ----------
  if (SEC.style) {
    const ms = lazy(mixStore) || ls("mdfmStyleMix"), all = obj(ms.get()) || {}, rings = {};
    let glitchFromV1 = null;
    // each station's saved record: v2 {v, w, lanes, ring} (or an old flat v1 {pop:.., classical:.., chaos:..}, which the engine migrates;
    // an old CHAOS becomes GLITCH, an effect, and is written into mdfmFx below if that has no GLITCH yet)
    for (const id in all) { const rec = obj(all[id]); if (!rec) continue;
      if (has("migrateStyleMix")) { const m = radio.migrateStyleMix(rec); if (typeof m.glitch === "number" && m.glitch > 0) glitchFromV1 = Math.max(glitchFromV1 || 0, m.glitch); }
      rings[id] = typeof rec.ring === "number" ? clamp(rec.ring, 0, 1) : 1;
      const r = rec.v === 2 && obj(rec.w) ? { w: rec.w, lanes: obj(rec.lanes) || undefined } : rec; radio.setStyleMix(r, id); }
    const ringOf = id => (id in rings ? rings[id] : 1);
    const save = () => { const id = sid(); all[id] = { v: 2, w: radio.getStyleMix(id), ...(LANES.length ? { lanes: radio.getStyleLanes(id) } : {}), ring: ringOf(id) }; ms.set(all); };
    const after = () => { save(); S.style.paint(); painted.style = performance.now(); led(); };
    const setK = (k, v) => { v = clamp(v, 0, 1); if (v < .04 && v < (radio.getStyleMix()[k] || 0)) v = 0; radio.setStyleMix({ [k]: v }); after(); };   // pulled back to a hair from zero is zero
    const F = {}; for (const [k, l, tip] of DIRS) { F[k] = Fader($p(`.mx-f[data-key="${k}"]`), { def: 0, tip, fmt: v => v + "%", text: v => v ? `${l} ${v} percent` : `${l} off`, onInput: v => setK(k, v / 100) });
      F[k].el.style.setProperty("--dc", DCOL[k]);
      if (STAGES.length) { const lit = doc.createElement("div"); lit.className = "mx-lit4"; lit.setAttribute("aria-hidden", "true"); lit.innerHTML = `<i data-s="feel"></i><i data-s="drums"></i><i data-s="band"></i><i data-s="full"></i>`; F[k].el.insertBefore(lit, F[k].el.querySelector("small")); }
      const eff = doc.createElement("span"); eff.className = "mx-eff"; eff.hidden = true; F[k].el.insertBefore(eff, F[k].el.querySelector(".mx-ft")); }
    const LK = {}; for (const [k, l, tip] of LANES) { LK[k] = Knob($p(`.mx-k[data-key="lane-${k}"]`), { min: 0, max: 100, step: 1, def: 100, tip: tip || `How much the styles may change the ${l.toLowerCase()}`,
      fmt: v => v === 0 ? "OFF" : v === 100 ? "ALL" : v + "%", text: v => v === 0 ? "kept as the song" : v + " percent",
      onInput: v => { radio.setStyleLanes({ [k]: v / 100 }); after(); } });
      const i = doc.createElement("i"); i.className = "mx-live"; i.title = "Changing now"; LK[k].el.appendChild(i); }
    // the view switch, remembered in mdfmMixUI.styleView
    const vbox = $p('[data-hook="style-view"]'), view = PAD ? Seg(vbox, [["pad", "PAD"], ["faders", "FADERS"]], v => { ui.styleView = v; saveUI(); showView(); resized(); }, "Style view") : null;
    const card = $p(".mx-stylecard");
    function showView() { const v = PAD && ui.styleView !== "faders" ? "pad" : "faders"; card.dataset.view = v; if (view) view.set(v);
      for (const el of card.querySelectorAll("[data-view]")) el.hidden = el.dataset.view !== v; if (v === "pad" && P) P.size(); if (S.style) S.style.paint(); }
    // ----- the pad -----
    const P = PAD ? (() => {
      const box = $p("[data-padbox]"), svg = box.querySelector("svg"), puck = $p("[data-puck]"), ghost = $p(".mx-puck.mx-ghost"), txt = $p(".mx-padtxt"), note = $p(".mx-custom"), RP = 56, RR = 64;
      const NS = "http://www.w3.org/2000/svg", pt = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)], f2 = n => n.toFixed(2);
      const order = DIRS.map(d => d[0]), N = order.length;
      let s = `<defs>`; order.forEach((k, i) => { const k2 = order[(i + 1) % N], [x1, y1] = pt(RP, ANG[k]), [x2, y2] = pt(RP, ANG[k2]);
        s += `<linearGradient id="${mkid("sg" + i)}" gradientUnits="userSpaceOnUse" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"><stop offset="0" stop-color="${DCOL[k]}"/><stop offset="1" stop-color="${DCOL[k2]}"/></linearGradient>`; });
      s += `</defs><circle r="${RR + 6}" fill="rgba(0,0,0,.35)"/><circle r="${RR}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>`;
      order.forEach((k, i) => { const k2 = order[(i + 1) % N], a1 = ANG[k], a2 = ANG[k2] < a1 ? ANG[k2] + 360 : ANG[k2], [x1, y1] = pt(RP, a1), [x2, y2] = pt(RP, a2);
        s += `<path class="mx-sector" data-a="${k}" data-b="${k2}" d="M0 0L${f2(x1)} ${f2(y1)}A${RP} ${RP} 0 0 1 ${f2(x2)} ${f2(y2)}Z" fill="url(#${mkid("sg" + i)})" opacity=".16"/>`; });
      order.forEach(k => { const [x, y] = pt(RP, ANG[k]); s += `<line class="mx-spoke" data-dir="${k}" x1="0" y1="0" x2="${f2(x)}" y2="${f2(y)}" stroke="${DCOL[k]}" stroke-width=".8" opacity=".35"/><circle cx="${f2(x)}" cy="${f2(y)}" r="2.2" fill="${DCOL[k]}"/>`; });
      s += `<g class="mx-rings"></g><circle r="${f2(RP * .05)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".7" stroke-dasharray="1.4 1.2"/><text class="mx-svgt" y="${f2(RP * .05 + 7)}" text-anchor="middle">SONG</text>`;
      s += `<path class="mx-amt" fill="none" stroke="var(--gold,#e2c86b)" stroke-width="5" stroke-linecap="round"/>`;
      svg.innerHTML = s; const ringsG = svg.querySelector(".mx-rings"), amt = svg.querySelector(".mx-amt");
      const AK = Knob($p('.mx-k[data-key="ring"]'), { min: 0, max: 100, step: 1, def: 100, tip: "AMOUNT: scales the whole blend, so you can keep the mix of styles and ride how much of it plays",
        fmt: v => v + "%", text: v => `amount ${v} percent`, onInput: v => setRing(v / 100) });
      let pos = { x: 0, y: 0 };   // where the puck sits (pad radius 1), kept even while the AMOUNT is 0
      const setPad = (x, y) => { const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; } pos = { x, y }; const px = x, py = y;
        live(box, () => { radio.setStylePad({ x: px, y: py, ring: ringOf(sid()) }); after(); }); };
      let ringPend = null;   // the AMOUNT before this frame's ring moves (a custom blend scales by new / old once per frame)
      function setRing(v) { const id = sid(); if (!ringPend || ringPend.id !== id) ringPend = { id, old: ringOf(id) }; rings[id] = clamp(v, 0, 1);
        live(box, () => { const rp = ringPend; ringPend = null; if (rp) ringApply(rp.id, rp.old); }); }
      function ringApply(id, old) { const mp = radio.mixToPad(radio.getStyleMix(), old || 1);
        if (mp.custom) { if (old > 0) { const w = radio.getStyleMix(), f = rings[id] / old; for (const k in w) w[k] = clamp(w[k] * f, 0, 1); radio.setStyleMix(w); } }
        else radio.setStylePad({ x: pos.x, y: pos.y, ring: rings[id] }); after(); }
      let padRect = null;   // measured once per drag (a read per move forced a layout after every repaint)
      const toPad = e => { const r = padRect || box.getBoundingClientRect(); return [((e.clientX - r.left) / r.width * 200 - 100) / RP, ((e.clientY - r.top) / r.height * 200 - 100) / RP]; };
      let mode = null, a0 = 0, ring0 = 1, lastT = { t: 0, x: 0, y: 0 }, pid = null, moved = false, start = [0, 0];
      const angOf = (x, y) => Math.atan2(x, -y) * 180 / Math.PI;
      box.addEventListener("pointerdown", e => { if (pid !== null || (e.pointerType === "mouse" && e.button !== 0) || e.target.closest(".mx-pl")) return; padRect = null;
        const [x, y] = toPad(e), r = Math.hypot(x, y); if (r > (RR + 9) / RP) return;
        pid = e.pointerId; padRect = box.getBoundingClientRect(); try { box.setPointerCapture(pid); } catch (err) {} e.preventDefault(); puck.focus({ preventScroll: true }); moved = false; start = [e.clientX, e.clientY];
        dragOn(); if (r > (RP + 3) / RP) { mode = "ring"; a0 = angOf(x, y); ring0 = ringOf(sid()); return; }
        mode = "pad"; box.classList.add("drag"); setPad(x, y); });
      box.addEventListener("pointermove", e => { if (e.pointerId !== pid) return; if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 3) moved = true; const [x, y] = toPad(e);
        if (mode === "ring") { let d = angOf(x, y) - a0; d = ((d + 540) % 360) - 180; a0 += d; ring0 = clamp(ring0 + d / 300, 0, 1); setRing(Math.round(ring0 * 100) / 100); return; }
        if (mode === "pad") setPad(x, y); });
      const up = e => { if (e.pointerId !== pid) return; pid = null; box.classList.remove("drag"); const m = mode; mode = null; padRect = null; dragOff();
        if (e.type === "pointerup" && m === "pad" && !moved) { const t = performance.now(); if (t - lastT.t < 300 && Math.hypot(e.clientX - lastT.x, e.clientY - lastT.y) < 12) { lastT.t = 0; setPad(0, 0); return; } lastT = { t, x: e.clientX, y: e.clientY }; }
        else lastT.t = 0; };
      box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up); box.addEventListener("lostpointercapture", up);
      // a label: the puck goes to 60% of that direction
      for (const b of box.querySelectorAll(".mx-pl")) b.addEventListener("click", () => { const k = b.dataset.dir, ring = ringOf(sid()) || 1, r = Math.min(1, .05 + .95 * Math.min(1, .6 / ring)), [x, y] = pt(r, ANG[k]);
        box.classList.add("glide"); setTimeout(() => box.classList.remove("glide"), 260); setPad(x, y); });
      puck.addEventListener("keydown", e => { const st = .05, r = Math.hypot(pos.x, pos.y); let x = pos.x, y = pos.y;
        if (e.key === "ArrowRight") x += st; else if (e.key === "ArrowLeft") x -= st; else if (e.key === "ArrowUp") y -= st; else if (e.key === "ArrowDown") y += st;
        else if (e.key === "Home" || e.key === "Delete" || e.key === "Backspace") { x = 0; y = 0; }
        else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") { const d = e.key === "+" || e.key === "=" ? st : -st, nr = clamp(r + d, 0, 1), a = r > .001 ? Math.atan2(x, -y) : 0; x = nr * Math.sin(a); y = -nr * Math.cos(a); }
        else if (e.key === "[" || e.key === "]") { const a = ((Math.atan2(x, -y) * 180 / Math.PI) + 360) % 360, sec = 360 / N; let i = Math.round(a / sec) % N; i = (i + (e.key === "]" ? 1 : -1) + N) % N;
          const rr = Math.max(r, .3); [x, y] = pt(rr, ANG[order[i]]); }
        else return; e.preventDefault(); setPad(x, y); });
      function size() { /* labels are % placed; nothing to measure */ }
      let ringsDrawn = NaN; const padEls = {};
      function paint(m, plan) { const id = sid(), ring = ringOf(id), mp = radio.mixToPad(m, ring || 1), anyW = order.some(k => (m[k] || 0) > .001);
        if (!mp.custom && anyW) pos = { x: mp.x, y: mp.y }; else if (!anyW && ring > 0 && Math.hypot(pos.x, pos.y) > .051) pos = { x: 0, y: 0 };   // inside the dead zone (or AMOUNT 0) the puck stays where it was put
        const show = mp.custom ? null : pos;
        puck.hidden = !show; ghost.hidden = !mp.custom; note.hidden = !mp.custom;
        const place = (el, x, y) => { el.style.left = (50 + x * RP / 2) + "%"; el.style.top = (50 + y * RP / 2) + "%"; };
        if (show) place(puck, show.x, show.y); if (mp.custom) { place(ghost, mp.x, mp.y); puck.hidden = false; place(puck, 0, 0); puck.classList.add("idle"); } else puck.classList.remove("idle");
        // rings at the amounts where stages start: drawn where they fall for this AMOUNT (a stage the AMOUNT can't reach is left out)
        if (ring !== ringsDrawn) { ringsDrawn = ring; ringsG.innerHTML = RINGS.map(([a, l]) => { if (a > ring + .001) return ""; const r = RP * (.05 + .95 * Math.min(1, a / (ring || 1))), [tx, ty] = pt(r, 18);
          return `<circle r="${f2(r)}" fill="none" stroke="rgba(255,255,255,${a >= 1 ? .28 : .16})" stroke-width="${a >= 1 ? .9 : .6}" stroke-dasharray="${a >= 1 ? "" : "2 2"}"/><text class="mx-svgt" x="${f2(tx + 1.5)}" y="${f2(ty + 2)}">${l}</text>`; }).join(""); }   // 1.26: rebuilt only when AMOUNT changes
        const [ax, ay] = pt(RR, Math.min(359.9, ring * 360)); amt.setAttribute("d", ring <= 0 ? "" : ring >= .999 ? `M0 ${-RR}A${RR} ${RR} 0 1 1 -0.01 ${-RR}` : `M0 ${-RR}A${RR} ${RR} 0 ${ring > .5 ? 1 : 0} 1 ${f2(ax)} ${f2(ay)}`);
        AK.set(Math.round(ring * 100)); AK.state({ moved: ring < .995 });
        const on = order.filter(k => (m[k] || 0) > .001).sort((a, b) => m[b] - m[a]), eff = plan && plan.w ? plan.w : m;
        for (const b of (padEls.pl || (padEls.pl = [...box.querySelectorAll(".mx-pl")]))) { const k = b.dataset.dir, v = m[k] || 0; b.classList.toggle("on", v > .001); b.style.setProperty("--w", String(v)); }
        for (const l of (padEls.sp || (padEls.sp = [...svg.querySelectorAll(".mx-spoke")]))) { const v = m[l.dataset.dir] || 0; l.setAttribute("opacity", v > .001 ? String(.5 + .5 * Math.min(1, v * 1.5)) : ".35"); l.setAttribute("stroke-width", v > .001 ? "1.8" : ".8"); }
        for (const p of (padEls.se || (padEls.se = [...svg.querySelectorAll(".mx-sector")]))) { const a = m[p.dataset.a] || 0, b = m[p.dataset.b] || 0; p.setAttribute("opacity", a > .001 && b > .001 ? ".42" : ".16"); }
        const lab = k => (DIRS.find(d => d[0] === k) || [k, k])[1], parts = on.map(k => `${lab(k)} ${Math.round((eff[k] || 0) * 100)}%`);
        txt.textContent = parts.length ? parts.slice(0, 3).join(" · ") + (parts.length > 3 ? ` · +${parts.length - 3}` : "") : "THE SONG AS IT IS";
        const amount = Math.round(on.reduce((a, k) => a + (eff[k] || 0), 0) * 100);
        puck.setAttribute("aria-valuenow", String(Math.min(100, amount)));
        puck.setAttribute("aria-valuetext", parts.length ? `${on.map(k => `${Math.round((m[k] || 0) * 100)}% ${lab(k)}`).join(", ")}, amount ${Math.round(ring * 100)}%${mp.custom ? ", custom blend" : ""}` : "the song as it is"); }
      return { paint, size };
    })() : null;
    const scaled = $p(".mx-scaled");
    S.style = {
      paint() { const m = radio.getStyleMix(), plan = has("getStylePlan") ? radio.getStylePlan() : null, sc = !!(plan && plan.scaled);
        const fadersShown = !(P && card.dataset.view === "pad");   // 1.26: the hidden view isn't repainted on every move (showView paints it when it opens)
        if (fadersShown) for (const [k] of DIRS) { const v = m[k] || 0, f = F[k]; f.set(Math.round(v * 100)); f.el.classList.toggle("moved", v > .001);
          const eff = f.eff || (f.eff = f.el.querySelector(".mx-eff")); eff.hidden = !(sc && v > .001); if (sc) eff.textContent = "▸" + Math.round(((plan.w || {})[k] || 0) * 100);
          const st = plan && plan.stages ? plan.stages[k] : null, lit = f.lit !== undefined ? f.lit : (f.lit = f.el.querySelector(".mx-lit4"));
          if (lit) { const L = { feel: st ? st.feel || 0 : 0, drums: st ? st.drums || 0 : 0, band: st ? (st.bass ? 1 : Math.max(0, ((st.keys || 0) - .5) * 2)) : 0, full: st && st.lead ? 1 : 0 };
            for (const i of lit.children) { const x = clamp(L[i.dataset.s], 0, 1); i.style.setProperty("--x", String(x)); i.classList.toggle("on", x > .02); }
            const roles = plan && plan.roles ? Object.keys(plan.roles).filter(r => plan.roles[r] === k) : []; f.el.title = roles.length ? `Plays: ${roles.join(", ")}` : (f.el.title.startsWith("Plays:") ? "" : f.el.title); } }
        if (scaled) scaled.hidden = !sc;
        if (LANES.length && fadersShown) { const L = radio.getStyleLanes(), stg = plan && plan.stages ? Object.values(plan.stages) : [];
          const act = { drums: s => s.drums > .02, keys: s => s.keys > .02, bass: s => !!s.bass, lead: s => !!s.lead, groove: s => s.groove > .02, tempo: s => s.tempo > .02, fx: s => s.fx > .02 };
          for (const [k] of LANES) { LK[k].set(Math.round((L[k] == null ? 1 : L[k]) * 100)); LK[k].state({ moved: (L[k] == null ? 1 : L[k]) < .995 });
            LK[k].el.classList.toggle("live", (L[k] == null ? 1 : L[k]) > .005 && stg.some(s => act[k] ? act[k](s) : false)); } }
        if (P) P.paint(m, plan); },
      reset() { radio.resetStyleMix(); rings[sid()] = 1; save(); this.paint(); },
      moved: () => Object.values(radio.getStyleMix()).some(v => v > .001) || ringOf(sid()) < .995 || (LANES.length ? Object.values(radio.getStyleLanes()).some(v => v < .995) : false),
      glitchFromV1 };
    showView();
  }

  // ---------- GROOVE & KEY ----------
  if (SEC.groove) {
    const gs = lazy(grooveStore) || ls("mdfmGroove"), gall = obj(gs.get()) || {};
    for (const id in gall) if (obj(gall[id])) radio.setGroove(gall[id], id);
    const gsave = v => { gall[sid()] = v; gs.set(gall); };
    const setG = o => { gsave(radio.setGroove({ ...o, gv: GD.gv || 2 })); S.groove.paint(); led(); };
    const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"], NAMES12 = ["C", "C♯ / D♭", "D", "E♭", "E", "F", "F♯ / G♭", "G", "A♭", "A", "B♭", "B"];
    const PCS = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
    const lenMul = v => v < .5 ? .5 + v : 1 + (v - .5) * 4, lvl = v => v < .5 ? Math.pow(v * 2, 1.6) : 1 + (v - .5) * 2;
    const dB = v => v === 0 ? "OFF" : Math.abs(v - 50) < 1 ? "0 dB" : (v > 50 ? "+" : "") + (20 * Math.log10(lvl(v / 100))).toFixed(1) + " dB";
    const msOf = (m, v) => { const [a, z] = m.scale || [-30, 30]; return a + (z - a) * v / 100; };
    const GF = { swing: v => v === 0 ? "STRAIGHT" : v + "%", length: v => "×" + lenMul(v / 100).toFixed(1), density: v => v === 0 ? "BARE" : String(v),
      fills: v => v === 0 ? "NONE" : String(v), humanize: v => v ? v + "%" : "OFF", ghosts: v => v ? v + "%" : "OFF", accent: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "FLAT " + (50 - v) : "+" + (v - 50),
      hatdens: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "LESS " + (50 - v) : "MORE " + (v - 50), hatswing: v => v === 0 ? "STRAIGHT" : v + "%",
      mel: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "SIMPLE " + (50 - v) : "BUSY " + (v - 50), rep: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "VARIED " + (50 - v) : "REPEAT " + (v - 50),
      range: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "NARROW " + (50 - v) : "WIDE " + (v - 50),
      harm: v => Math.abs(v - 50) < 1 || (v >= 35 && v < 65) ? "AS IS" : v < 12 ? "FIFTHS" : v < 35 ? "TRIADS" : v < 85 ? "7THS" : "9THS" };
    const fmtG = m => GF[m.id] || (m.unit === "dB" || m.group === "levels" ? dB : m.unit === "ms" ? (v => { const x = msOf(m, v); return Math.abs(x) < .5 ? "ON" : (x < 0 ? "AHEAD " : "BEHIND ") + Math.abs(x).toFixed(0); }) : (v => v + "%"));
    const txtG = m => m.unit === "ms" ? (v => { const x = msOf(m, v); return Math.abs(x) < .5 ? "on the beat" : `${Math.abs(x).toFixed(0)} milliseconds ${x < 0 ? "ahead" : "behind"}`; }) : null;
    let ownBpm = 0, own = null;
    const GKn = {};
    for (const m of GKNOB) { const k = m.id, song = !!m.song && GD[k] < 0, bip = !!m.bipolar;
      GKn[k] = Knob($p(`.mx-k[data-key="g-${k}"]`), { min: 0, max: 100, step: 1, def: song ? 50 : Math.round((GD[k] || 0) * 100), center: bip ? 50 : null, tip: gtip[k], fmt: fmtG(m), text: txtG(m),
        onInput: v => setG({ [k]: ((k === "humanize" || k === "ghosts") && v <= 2 && v / 100 < radio.getGroove()[k] ? 0 : v) / 100 }), onReset: () => setG({ [k]: GD[k] }) }); }
    $$p(".mx-song[data-song]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.song; if (k === "bpm") setG({ bpm: 0 }); else setG({ [k]: GD[k] }); }));
    // BPM: an LCD you drag up and down (1 BPM per 6 px), [-] [+] that repeat while held, TAP, and SONG
    const num = $p(".mx-num"), lcd = num && num.querySelector(".mx-lcd");
    let bpmRaw = 0;
    const bpmNow = () => { const g = radio.getGroove(); return g.bpm || clamp(Math.round(ownBpm) || 120, 40, 220); };
    const setBpm = v => setG({ bpm: clamp(Math.round(v), 40, 220) });
    if (num) {
      gesture(lcd, { dead: 2, down: () => { lcd.focus({ preventScroll: true }); bpmRaw = bpmNow(); },
        move: (ddx, ddy, e, g) => { const f = fineOf(e, g); lcd.classList.toggle("fine", f < 1); bpmRaw = clamp(bpmRaw - ddy / 6 * f, 40, 220); if (Math.round(bpmRaw) !== radio.getGroove().bpm) setBpm(bpmRaw); },
        end: () => lcd.classList.remove("fine"), double: () => setG({ bpm: 0 }) });
      lcd.addEventListener("keydown", e => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (d != null) setBpm(bpmNow() + d * (e.shiftKey ? 5 : 1)); else if (e.key === "Home") setBpm(40); else if (e.key === "End") setBpm(220);
        else if (e.key === "Delete" || e.key === "Backspace") setG({ bpm: 0 });
        else if (e.key === "Enter") editValue(num, bpmNow(), 40, 220, 1, v => { if (v != null) setBpm(v); lcd.focus({ preventScroll: true }); }); else return; e.preventDefault(); });
      for (const b of num.querySelectorAll("[data-d]")) { let t = 0; const d = +b.dataset.d, stop = () => clearTimeout(t);
        const step = () => setBpm(bpmNow() + d);
        b.addEventListener("pointerdown", e => { if (e.button) return; step(); t = setTimeout(function rep() { step(); t = setTimeout(rep, 60); }, 400); });
        for (const ev of ["pointerup", "pointerleave", "pointercancel", "blur"]) b.addEventListener(ev, stop);
        b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(); } }); }
      let taps = []; num.querySelector("[data-tap]").addEventListener("click", () => { const t = performance.now(); if (taps.length && t - taps[taps.length - 1] > 2000) taps = []; taps.push(t); if (taps.length > 5) taps.shift();
        if (taps.length >= 2) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setBpm(60000 / iv); } });
    }
    const segs = {};
    if ($p('[data-g="meter"]')) segs.meter = Seg($p('[data-g="meter"]'), [["", "SONG", "The song's own time"], ...radio.meters().map(m => [m, m])], v => setG({ meter: v }), "Time signature");
    if ($p('[data-g="feel"]')) segs.feel = Seg($p('[data-g="feel"]'), [["0", "HALF"], ["0.5", "NORMAL"], ["1", "DOUBLE"]], v => setG({ feel: +v }), "Feel");
    if ($p('[data-g="root"]')) { segs.root = Seg($p('[data-g="root"]'), [["-1", "SONG", "The song's own key", "mx-ks"], ...NOTES.map((n, i) => [String(i), n, NAMES12[i], [1, 3, 6, 8, 10].includes(i) ? "mx-blk" : "mx-wht"])], v => setG({ root: +v }), "Key");
      segs.root.el.classList.add("mx-keys"); }
    const modeSel = $p('select[data-g="mode"]');
    if (modeSel) { const FAM = { major: "Major family", lydian: "Major family", mixolydian: "Major family", lyddom: "Major family", minor: "Minor family", dorian: "Minor family", phrygian: "Minor family", locrian: "Minor family", harmonic: "Minor family", melodic: "Minor family" };
      const o0 = doc.createElement("option"); o0.value = ""; o0.textContent = "Song's scale"; modeSel.appendChild(o0); const gr = {};
      for (const m of radio.keyModes()) { const f = FAM[m.id] || "Exotic"; if (!gr[f]) { gr[f] = doc.createElement("optgroup"); gr[f].label = f; } const o = doc.createElement("option"); o.value = m.id; o.textContent = m.name; o.dataset.base = m.name; gr[f].appendChild(o); }
      for (const f of ["Major family", "Minor family", "Exotic"]) if (gr[f]) modeSel.appendChild(gr[f]);
      modeSel.addEventListener("change", () => setG({ mode: modeSel.value })); }
    // the mini tabs (phones): TEMPO · KEY · DRUMS, one card at a time
    const gt = $p("[data-gtabs]"); segs.gtab = Seg(gt, [["tempo", "TEMPO"], ["key", "KEY"], ...(gMelK.length ? [["melody", "MELODY"]] : []), ["drums", "DRUMS"]], v => { ui.grooveCard = v; saveUI(); layoutGroove(); resized(); }, "Groove card");
    const isMoved = (g, k) => typeof GD[k] === "number" ? Math.abs(g[k] - GD[k]) > .005 : g[k] !== GD[k];
    const DRUMCARD = new Set(GKNOB.filter(m => m.group !== "tempo" && m.group !== "melody").map(m => m.id)), MELCARD = new Set(gMelK.map(m => m.id));
    S.groove = {
      paint() { const g = radio.getGroove(), sup = radio.grooveSupport(sid()), nm = station() ? station().name : "this station";
        own = has("songOwn") ? radio.songOwn() : null; ownBpm = own && own.bpm ? +own.bpm : 0; const kp = own && own.key ? String(own.key).split(" ") : null;
        const not = `Not on ${nm}`;
        for (const k of Object.keys(GKn)) { const m = GIK[k], raw = g[k], song = !!m.song && GD[k] < 0 && raw < 0, x = song ? 50 : Math.round(raw * 100); GKn[k].set(x);
          GKn[k].state({ moved: isMoved(g, k), song, text: song ? m.song : null, aria: song ? (m.song === "FOLLOW" ? "follows the main setting" : "the song's own") : null });
          const sb = $p(`.mx-song[data-song="${k}"]`); if (sb) sb.setAttribute("aria-pressed", String(!isMoved(g, k)));
          const cap = { swing: "swing", length: "length", drums: "drums" }[k]; GKn[k].disable(cap && !sup[cap] ? not : DRUMCARD.has(k) && sup.drums === 0 ? not : MELCARD.has(k) && sup.melody === 0 ? not : ""); }
        if (num) { const song = !g.bpm; lcd.textContent = song ? (ownBpm ? String(Math.round(ownBpm)) : "SONG") : String(g.bpm); lcd.classList.toggle("song", song);
          lcd.setAttribute("aria-valuenow", String(g.bpm || Math.round(ownBpm) || 0)); lcd.setAttribute("aria-valuetext", song ? (ownBpm ? `the song's own, ${Math.round(ownBpm)} BPM` : "the song's own") : `${g.bpm} BPM`);
          num.classList.toggle("moved", g.bpm > 0); num.querySelector('.mx-song[data-song="bpm"]').setAttribute("aria-pressed", String(song));
          num.classList.toggle("na", !sup.bpm); num.querySelectorAll("button,.mx-lcd").forEach(b => { b.toggleAttribute("disabled", !sup.bpm && b.tagName === "BUTTON"); }); num.title = sup.bpm ? "" : not; }
        if (segs.meter) { segs.meter.set(g.meter); const b = segs.meter.btn(""); b.textContent = "SONG" + (own && own.time && sup.meter ? ` (${own.time})` : "");
          segs.meter.disable(sup.meter ? "" : not); segs.meter.el.closest(".mx-row").classList.toggle("moved", !!g.meter); }
        if (segs.feel) { segs.feel.set(String(Math.round(g.feel * 2) / 2)); segs.feel.el.closest(".mx-row").classList.toggle("moved", Math.abs(g.feel - .5) > .01); }
        if (segs.root) { segs.root.set(String(g.root)); segs.root.btn("-1").textContent = "SONG" + (kp ? ` (${kp[0].replace("#", "♯").replace(/^([A-G])b$/, "$1♭")})` : "");
          for (let i = 0; i < 12; i++) segs.root.btn(String(i)).classList.toggle("own", !!(kp && PCS[kp[0]] === i));
          segs.root.disable(sup.key === 0 ? not : ""); segs.root.el.classList.toggle("moved", g.root >= 0); }
        if (modeSel) { modeSel.options[0].textContent = "Song's scale" + (kp && kp.length > 1 ? ` (${kp.slice(1).join(" ")})` : "");
          for (const o of modeSel.querySelectorAll("option[data-base]")) o.textContent = o.dataset.base + (kp && kp.length > 1 && o.dataset.base.toLowerCase().replace(/ \(.*\)$/, "") === kp.slice(1).join(" ").toLowerCase() ? " (song)" : "");
          modeSel.value = g.mode; modeSel.disabled = sup.key === 0; modeSel.closest(".mx-fld").classList.toggle("moved", !!g.mode); }
        for (const d of $$p(".mx-more")) { if (!d.open && [...d.querySelectorAll(".mx-k")].some(c => c.classList.contains("moved"))) d.open = true; } },
      reset() { gsave(radio.resetGroove()); this.paint(); },
      moved: () => { const g = radio.getGroove(); return Object.keys(GD).some(k => k !== "gv" && isMoved(g, k)); } };
  }

  // ---------- FX ----------
  if (SEC.fx) {
    const fs = lazy(fxStore) || ls("mdfmFx"), fsaved = obj(fs.get()); if (fsaved) radio.setFx(fsaved);
    // an old (1.24) CHAOS saved with the style matrix is GLITCH now: kept unless mdfmFx already has its own GLITCH
    if (S.style && typeof S.style.glitchFromV1 === "number" && FKS.has("glitch") && !(fsaved && typeof fsaved.glitch === "number")) fs.set(radio.setFx({ glitch: Math.max(radio.getFx().glitch || 0, S.style.glitchFromV1) }));
    const ftxt = (k, v) => k === "filter" ? (Math.abs(v - 50) < 1 ? "OFF" : v < 50 ? "LP " + hz(20000 * Math.pow(180 / 20000, Math.min(1, (50 - v) / 50))) : "HP " + hz(10 * Math.pow(300, Math.min(1, (v - 50) / 50)))) : v === 0 ? "OFF" : v + "%";
    const setF = o => { fs.set(radio.setFx(o)); S.fx.paint(); led(); };
    const FKn = {}; for (const [k, , tip] of FK) { const bip = Math.abs((FD[k] || 0) - .5) < .001, cell = $p(`.mx-k[data-key="fx-${k}"]`); if (!cell) continue;
      FKn[k] = Knob(cell, { min: 0, max: 100, step: 1, def: Math.round((FD[k] || 0) * 100), center: bip ? 50 : null, tip, fmt: v => ftxt(k, v),
        text: v => k === "filter" ? (Math.abs(v - 50) < 1 ? "off" : v < 50 ? "low-pass " + ftxt(k, v).slice(3) + "Hz" : "high-pass " + ftxt(k, v).slice(3) + "Hz") : v === 0 ? "off" : v + " percent",
        onInput: v => { if (!bip && v <= 1 && v / 100 < radio.getFx()[k]) v = 0; setF({ [k]: v / 100 }); } }); }
    // UNDERWATER moves here as a colour effect. The receiver wires #uwBtn by id after this runs (it must stay unique),
    // so an existing one (the hub's) is moved in, and otherwise it is made here.
    const uwBox = $p("[data-uw]"); let uw = null;
    if (uwBox && has("setUnderwater")) { const old = doc.getElementById("uwBtn"), wrap = old && !panel.contains(old) ? old.closest(".rd-btn") : null;
      if (wrap) uwBox.appendChild(wrap); else if (!old) uwBox.innerHTML = `<div class="rd-btn"><span class="rd-led" id="uwLed"></span><button type="button" id="uwBtn" aria-pressed="false" title="Underwater: muffled, drifting sound"></button><small>UNDERWATER</small></div>`;
      uw = uwBox.querySelector("#uwBtn"); if (uw) uw.addEventListener("click", () => setTimeout(() => { S.fx.paint(); led(); }, 0)); }
    if (uwBox && !uwBox.children.length) uwBox.remove();
    const uwOn = () => has("isUnderwater") && !!radio.isUnderwater();
    const trick = (b, fn) => { if (!b) return; b.addEventListener("click", () => { if (fn()) b.classList.add("busy"); });
      if (radio.on) radio.on("tape", e => { setTimeout(() => b.classList.remove("busy"), Math.max(0, ((e && e.until) - (radio.audioContext ? radio.audioContext.currentTime : 0)) * 1000) || 1500); }); };
    trick($p('[data-t="tape"]'), () => radio.tapeStop()); trick($p('[data-t="spin"]'), () => radio.spinBack());
    // GLITCH flashes when it fires a trick
    if (FKn.glitch && radio.on) { let gT = 0; radio.on("glitch", e => { const ctxT = radio.audioContext ? radio.audioContext.currentTime : 0, at = e && typeof e.t === "number" ? Math.max(0, (e.t - ctxT) * 1000) : 0;
      setTimeout(() => { FKn.glitch.el.classList.add("fired"); clearTimeout(gT); gT = setTimeout(() => FKn.glitch.el.classList.remove("fired"), 220); }, Math.min(4000, at)); }); }
    S.fx = {
      paint() { const f = radio.getFx(); for (const k of Object.keys(FKn)) { FKn[k].set(Math.round(f[k] * 100)); FKn[k].state({ moved: Math.abs(f[k] - (FD[k] || 0)) > .004 }); } },
      reset() { fs.set(radio.resetFx()); if (uw && uwOn()) uw.click(); this.paint(); },
      moved: () => { const f = radio.getFx(); return Object.keys(FD).some(k => Math.abs(f[k] - FD[k]) > .004) || uwOn(); } };
  }

  // ---------- moved dots, the MIX LED, scope badges ----------
  const tl = toggle ? toggle.closest("label,.rd-btn") : null;
  function led() { let anyM = false;
    for (const k of Object.keys(S)) { const m = S[k].moved(); anyM = anyM || m; const sec = $c(`.mx-sec[data-sec="${k}"]`), tab = $c(`[data-tab="${k}"]`);
      sec && sec.classList.toggle("moved", m); tab && tab.classList.toggle("moved", m); }
    if (tl) tl.classList.toggle("tuned", anyM); }
  function scope() { const st = station(), nm = st ? st.name : "";
    $p("[data-scope]").textContent = nm ? `Mixing ${nm}` : "";
    for (const k of ["style", "groove"]) { const b = $p(`[data-badge="${k}"]`); if (b) b.textContent = nm ? `THIS STATION · ${nm}` : "THIS STATION"; } }
  const paintAll = () => { for (const k of Object.keys(S)) S[k].paint(); scope(); led(); };
  for (const b of $$p("[data-reset]")) b.addEventListener("click", () => { const s = S[b.dataset.reset]; if (s) { s.reset(); led(); } });
  // RESET ALL asks twice: the first tap arms it for 3 s
  { const b = $p('[data-t="reset"]'), cap = b.parentNode.querySelector("small"); let armT = 0;
    b.addEventListener("click", () => { if (!b.classList.contains("armed")) { b.classList.add("armed"); cap.textContent = "TAP AGAIN"; b.setAttribute("aria-label", "Tap again to reset everything in MIX");
        clearTimeout(armT); armT = setTimeout(() => { b.classList.remove("armed"); cap.textContent = "RESET ALL"; b.setAttribute("aria-label", "Reset everything in MIX for this station"); }, 3000); return; }
      clearTimeout(armT); b.classList.remove("armed"); cap.textContent = "RESET ALL"; for (const k of Object.keys(S)) S[k].reset(); led(); }); }

  // ---------- ORIGINAL: hold to hear the station unmixed (setMixBypass); a quick tap on touch latches it until the next tap ----------
  const ob = $p('[data-t="orig"]'), bypNote = $p(".mx-bypnote");
  const bypOn = () => !!(BYP && (has("isMixBypass") ? radio.isMixBypass() : ob && ob.getAttribute("aria-pressed") === "true"));
  const bypPaint = v => { if (!ob) return; ob.setAttribute("aria-pressed", String(!!v)); ob.classList.toggle("on", !!v); panel.classList.toggle("mx-byp", !!v); bypNote.hidden = !v; };
  if (ob) { let held = null, latched = false;
    const go = v => { radio[BYP](!!v); bypPaint(v); };
    ob.addEventListener("pointerdown", e => { if (e.pointerType === "mouse" && e.button !== 0) return; e.preventDefault(); try { ob.setPointerCapture(e.pointerId); } catch (err) {}
      held = { id: e.pointerId, t: performance.now(), type: e.pointerType, was: latched }; if (!latched) go(true); });
    const rel = e => { if (!held || e.pointerId !== held.id) return; const h = held; held = null; const quick = performance.now() - h.t < 350;
      if (h.was) { latched = false; go(false); return; }   // a tap while latched lets go
      if (quick && h.type !== "mouse" && e.type === "pointerup") { latched = true; return; }   // touch: a quick tap keeps it on
      latched = false; go(false); };
    ob.addEventListener("pointerup", rel); ob.addEventListener("pointercancel", rel); ob.addEventListener("lostpointercapture", rel);
    ob.addEventListener("click", e => { if (e.detail !== 0) return; latched = !bypOn(); go(latched); });   // keyboard (Enter / Space) toggles
    ob.addEventListener("keydown", e => { if (e.key === "Escape" && bypOn()) { latched = false; go(false); e.stopPropagation(); } });
    const letGo = () => { if (bypOn() && !latched) go(false); };
    win.addEventListener("blur", letGo); doc.addEventListener("visibilitychange", () => { if (doc.hidden) letGo(); }); }

  // ---------- repaint on the engine's events: the hub, the page and the API stay in step (coalesced to one paint per frame) ----------
  const dirty = new Map(); let rafT = 0;
  const later = (...ks) => { const t = performance.now(); for (const k of ks) if (!dirty.has(k)) dirty.set(k, t); if (rafT) return;
    rafT = setTimeout(() => {   // a timer, not requestAnimationFrame: a page in the background still keeps up
      rafT = 0; const ks = [...dirty]; dirty.clear();
      // 1.26: a section MIX itself already painted after the change isn't painted again
      for (const [k, t] of ks) if (S[k] && !(painted[k] >= t)) S[k].paint(); if (ks.some(([k]) => k === "scope")) scope(); led(); }); };
  if (radio.on) { radio.on("station", () => { scope(); later("style", "groove"); });   // the scope line at once; the controls on the next frame
    radio.on("nowplaying", () => later("groove"));
    radio.on("fx", () => later("fx")); radio.on("groove", () => later("groove")); radio.on("mix", () => later("style"));
    radio.on("eq", () => later("sound")); radio.on("tone", () => later("sound"));
    radio.on("bypass", v => bypPaint(v)); }
  // ---------- layout: board (>= 900 px), accordion (600-899), tabs (< 600); by the drawer's own width ----------
  const secs = Object.keys(S), tabs = $$p("[data-tab]");
  if (!secs.includes(ui.section)) ui.section = secs[0];
  const layoutOf = w => w >= 900 ? "board" : w >= 600 ? "acc" : "tabs";
  let L = "";
  function layoutGroove() { const cards = $$p(".mx-gcards>.mx-card"); for (const c of cards) c.toggleAttribute("data-active", c.dataset.card === ui.grooveCard); if (S.groove) segs_gt().set(ui.grooveCard); }
  const segs_gt = () => ({ set(v) { $$p("[data-gtabs] button").forEach(b => { const on = b.dataset.v === v; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }); } });
  function applyLayout(w) {
    const nl = layoutOf(w == null ? (panel.clientWidth || (panel.parentElement ? panel.parentElement.clientWidth : 1000)) : w); const changed = nl !== L; L = nl; panel.dataset.layout = L;
    const tl2 = $p(".mx-tabs"); if (L === "tabs") tl2.setAttribute("role", "tablist"); else tl2.removeAttribute("role");
    for (const t of tabs) { const k = t.dataset.tab, sec = $p(`.mx-sec[data-sec="${k}"]`);
      if (L === "tabs") { t.setAttribute("role", "tab"); t.setAttribute("aria-selected", String(k === ui.section)); t.tabIndex = k === ui.section ? 0 : -1; t.classList.toggle("on", k === ui.section); sec.setAttribute("role", "tabpanel"); sec.setAttribute("aria-labelledby", t.id); }
      else { t.removeAttribute("role"); t.removeAttribute("aria-selected"); t.tabIndex = 0; t.classList.toggle("on", L === "acc" && !!ui.acc[k]); sec.removeAttribute("role"); sec.setAttribute("aria-labelledby", mkid("h-" + k)); }
      sec.toggleAttribute("data-active", k === ui.section); sec.toggleAttribute("data-open", L !== "acc" || !!ui.acc[k]);
      const ab = sec.querySelector(".mx-acc"); if (L === "acc") ab.setAttribute("aria-expanded", String(!!ui.acc[k])); else ab.removeAttribute("aria-expanded"); ab.tabIndex = L === "acc" ? 0 : -1; }
    layoutGroove();
    return changed; }
  // the EQ canvas measures itself once it is on screen (a hidden drawer has no size), and the faint spectrum runs only while it shows
  const eqWake = () => { const E = S.sound && S.sound.eq; if (E) { E.size(); E.specOn(); } };
  const showSec = (k, focus) => { const sec = $p(`.mx-sec[data-sec="${k}"]`); if (!sec) return;
    if (L === "tabs") { ui.section = k; } else if (L === "acc") { ui.acc[k] = true; ui.section = k; } else ui.section = k;
    saveUI(); applyLayout(); resized(); eqWake();
    if (L !== "tabs") setTimeout(() => sec.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }), 30);
    if (focus) { const t = $p(`[data-tab="${k}"]`); t && t.focus({ preventScroll: true }); } };
  for (const t of tabs) { t.addEventListener("click", () => showSec(t.dataset.tab));
    t.addEventListener("keydown", e => { if (L !== "tabs") return; const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault();
      const i = (tabs.indexOf(t) + d + tabs.length) % tabs.length; showSec(tabs[i].dataset.tab, true); }); }
  for (const ab of $$p(".mx-acc")) ab.addEventListener("click", () => { if (L !== "acc") return; const k = ab.closest(".mx-sec").dataset.sec; ui.acc[k] = !ui.acc[k]; if (ui.acc[k]) ui.section = k; saveUI(); applyLayout(); resized(); });
  if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (!panel.hidden && applyLayout()) resized(); }).observe(panel);

  // ---------- open / close: grid-template-rows 0fr -> 1fr; the page grows, nothing floats ----------
  let resizeT = 0;
  function resized() { clearTimeout(resizeT); resizeT = setTimeout(() => { try { win.dispatchEvent(new CustomEvent("mdfm:mixresize", { detail: { open: !panel.hidden, layout: L } })); } catch (e) {} }, 30); }
  let animT = 0, isOpen = false;
  // ---------- 1.26 LITE (mobile mix): AUTO = phones and tablets (touch-first, or an iPad that says it's a Mac) ----------
  const liteAuto = () => { const n = win.navigator || {}, ua = n.userAgent || "";
    return /iPhone|iPad|iPod|Android/i.test(ua) || (n.platform === "MacIntel" && (n.maxTouchPoints || 0) > 1) || coarse(); };
  if (!["auto", "on", "off"].includes(ui.lite)) ui.lite = "auto";
  const liteWanted = () => ui.lite === "on" || (ui.lite === "auto" && liteAuto());
  let spotsHeld = null;
  function applyLite() { const act = isOpen && liteWanted(), root = doc.documentElement;
    root.classList.toggle("mx-lite", act); try { win.MDFM_lite = act; } catch (e) {}
    if (has("setLite")) radio.setLite(act);
    if (act && has("prewarmMix")) radio.prewarmMix();
    if (act && spotsHeld === null && has("getSpots") && has("setSpots")) { spotsHeld = radio.getSpots(); radio.setSpots(false); }   // MDFM's talk breaks wait while you mix
    else if (!act && spotsHeld !== null) { radio.setSpots(spotsHeld); spotsHeld = null; }
    const lb = $p('[data-t="lite"]'); if (lb) { lb.setAttribute("aria-pressed", String(act)); lb.classList.toggle("on", act); lb.querySelector("[data-lite-v]").textContent = ui.lite.toUpperCase(); } }
  { const lb = $p('[data-t="lite"]'); if (lb) lb.addEventListener("click", () => { ui.lite = { auto: "on", on: "off", off: "auto" }[ui.lite]; saveUI(); applyLite(); }); }
  // ---------- 1.27 VOID: flat dark blocks while MIX is open (its own switch, remembered in mdfmMixUI.void) ----------
  function applyVoid() { const act = isOpen && !!ui.void, root = doc.documentElement; root.classList.toggle("mx-void", act);
    const th = doc.getElementById("meddev-skin-theme"); if (th) { if (act && !th.disabled) { th.disabled = true; th.dataset.voided = "1"; } else if (!act && th.dataset.voided) { th.disabled = false; delete th.dataset.voided; } }
    try { win.dispatchEvent(new CustomEvent("mdfm:void", { detail: { on: act } })); } catch (e) {}
    const vb = $p('[data-t="void"]'); if (vb) { vb.setAttribute("aria-pressed", String(act)); vb.classList.toggle("on", act); } }
  { const vb = $p('[data-t="void"]'); if (vb) vb.addEventListener("click", () => { ui.void = !ui.void; saveUI(); applyVoid(); }); }
  // ---------- 1.27 PERF: an on-screen readout (frame rate, longest freeze, notes on time); stays up until turned off ----------
  let perfBox = null, perfT = 0, perfRaf = 0;
  function perfOn(on) { const pb = $p('[data-t="perf"]'); if (pb) { pb.setAttribute("aria-pressed", String(on)); pb.classList.toggle("on", on); }
    if (!on) { if (perfBox) perfBox.remove(); perfBox = null; clearTimeout(perfT); if (perfRaf) win.cancelAnimationFrame(perfRaf); perfRaf = 0; return; }
    if (perfBox || !has("perfStats")) return;
    perfBox = doc.createElement("div"); perfBox.className = "mx-perf"; perfBox.setAttribute("role", "status"); perfBox.setAttribute("aria-label", "Performance readout");
    perfBox.innerHTML = `<b>PERF</b><button type="button" aria-label="Close the performance readout">×</button><pre></pre>`; doc.body.appendChild(perfBox);
    perfBox.querySelector("button").addEventListener("click", () => { ui.perf = false; saveUI(); perfOn(false); });
    const pre = perfBox.querySelector("pre"), gaps = [], hist = [];   // frame gaps (5 s) and the scheduler's counts per half second (5 s)
    let last = 0, frames = 0, t0 = performance.now(); radio.perfStats(true);
    const fr = now => { if (last) gaps.push([now, now - last]); last = now; frames++; perfRaf = win.requestAnimationFrame(fr); }; perfRaf = win.requestAnimationFrame(fr);
    const tick = () => { if (!perfBox) return; const now = performance.now(), st = radio.perfStats(true); hist.push([now, st]);
      while (gaps.length && gaps[0][0] < now - 5000) gaps.shift(); while (hist.length && hist[0][0] < now - 5000) hist.shift();
      const fps = frames / ((now - t0) / 1000); frames = 0; t0 = now;
      const freeze = gaps.reduce((m, g) => Math.max(m, g[1]), 0), sum = k => hist.reduce((a, h) => a + h[1][k], 0), minLead = hist.reduce((m, h) => Math.min(m, h[1].minLead), 9);
      const late = sum("late"), tight = sum("tight"), steps = sum("steps"), modes = [st.lite ? "LITE" : "", doc.documentElement.classList.contains("mx-void") ? "VOID" : ""].filter(Boolean).join(" · ") || "normal";
      const ok = !late && !tight, ms = x => Math.round(x * 1000);
      pre.textContent = `FPS     ${Math.round(fps)}\nFREEZE  ${Math.round(freeze)} ms  (longest, 5 s)\nNOTES   ${steps ? (ok ? "on time" : `${late} skipped · ${tight} near misses`) : "—"}\nSPARE   ${steps && minLead < 9 ? ms(minLead) + " ms" : "—"}  (of ${ms(st.ahead)} ms ahead)\nAUDIO   ${st.sampleRate ? Math.round(st.sampleRate / 100) / 10 + " kHz" : "—"} · ${st.state}${st.outputLatency ? " · out " + ms(st.outputLatency) + " ms" : ""}\nMODE    ${modes}`;
      perfBox.classList.toggle("bad", late > 0 || freeze > 250); perfBox.classList.toggle("warn", !(late > 0 || freeze > 250) && (tight > 0 || freeze > 100));
      perfT = setTimeout(tick, 500); };
    perfT = setTimeout(tick, 500); }
  { const pb = $p('[data-t="perf"]'); if (pb) pb.addEventListener("click", () => { ui.perf = !ui.perf; saveUI(); perfOn(!!ui.perf); }); if (ui.perf) perfOn(true); }
  function open(v, { restore = false } = {}) {
    v = !!v; if (toggle) { if (toggle.type === "checkbox") toggle.checked = v; else toggle.setAttribute("aria-pressed", String(v)); toggle.setAttribute("aria-expanded", String(v)); }
    if (v === isOpen) return; isOpen = v; ui.open = v; saveUI(); clearTimeout(animT); applyLite(); applyVoid();
    const done = () => { panel.removeAttribute("inert"); if (isOpen) { panel.classList.add("mx-settled"); eqWake(); } else panel.hidden = true; resized(); };
    if (v) { panel.hidden = false; applyLayout(); paintAll(); eqWake();
      if (reduced() || restore) { panel.classList.remove("mx-shut"); done(); }
      else { panel.classList.add("mx-shut"); panel.classList.remove("mx-settled"); void panel.offsetHeight; panel.classList.remove("mx-shut"); animT = setTimeout(done, 260); }
      if (!restore) { const t = $p(`[data-tab="${ui.section}"]`) || tabs[0]; t && t.focus({ preventScroll: true });
        if (L !== "board") setTimeout(() => { const t2 = $p(".mx-wt"); t2 && t2.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }); }, 40); } }
    else { panel.classList.remove("mx-settled"); if (reduced()) done(); else { panel.setAttribute("inert", ""); panel.classList.add("mx-shut"); animT = setTimeout(done, 260); } }
  }
  if (toggle) { toggle.setAttribute("aria-controls", panel.id || ""); toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener(toggle.type === "checkbox" ? "change" : "click", () => open(toggle.type === "checkbox" ? toggle.checked : !isOpen)); }
  const close = () => { open(false); toggle && toggle.focus(); };
  $p(".mx-close").addEventListener("click", close);
  panel.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); } });
  doc.addEventListener("pointerdown", e => { for (const b of $$p(".mx-bub")) if (!b.contains(e.target)) b.remove(); }, true);

  paintAll(); applyLayout(1000);
  // the drawer comes back open where it was left open, except on a phone, where the deck shows first
  if (ui.open && !(coarse() && (win.innerWidth || 1000) < 640)) open(true, { restore: true }); else { ui.open = false; }
  if (radio.on) radio.on("start", eqWake);
  return { open, isOpen: () => isOpen, section: k => showSec(k), paint: paintAll, get: () => (S.sound ? S.sound.get() : {}), set: o => S.sound && S.sound.set(o) };
}
const mountTune = mountMix;   // older pages (the hub up to v102, kit apps) call mountTune

const MIX_CSS = `
.mixdrawer .btn.mx-lite{min-height:44px;padding:0 12px;font:700 .66rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.12em;touch-action:manipulation}
.mixdrawer .btn.mx-lite.on{color:#7fe0e6;box-shadow:inset 0 0 0 2px #7fe0e6}
.mixdrawer[data-layout=tabs] .mx-lite{order:5}
html.mx-lite *,html.mx-lite *::before,html.mx-lite *::after{text-shadow:none!important;animation-play-state:paused!important}
html.mx-lite .mixdrawer *,html.mx-lite .mixdrawer *::before,html.mx-lite .mixdrawer *::after{animation-play-state:running!important;transition-duration:0s!important}
html.mx-lite .lcd::after,html.mx-lite .list::after,html.mx-lite .tabs::after,html.mx-lite .hits::after,html.mx-lite .msgs::after,html.mx-lite .vu-glass::after,html.mx-lite .glass::after{display:none!important}
html.mx-lite .mixdrawer canvas{filter:none!important}
.mixdrawer .btn.mx-void{min-height:44px;padding:0 12px;font:700 .66rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.16em;touch-action:manipulation}
.mixdrawer[data-layout=tabs] .mx-void{order:5}
/* 1.27 PERF readout */
.mixdrawer .btn.mx-perfbtn{min-height:44px;padding:0 12px;font:700 .66rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.16em;touch-action:manipulation}
.mixdrawer[data-layout=tabs] .mx-perfbtn{order:5}
.mx-perf{position:fixed;right:max(10px,env(safe-area-inset-right,0px));bottom:max(10px,env(safe-area-inset-bottom,0px));z-index:2147483000;background:rgba(10,11,13,.92);color:#cfe9d4;border:1px solid #2f8f4a;border-radius:8px;padding:8px 10px 9px;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:auto;max-width:calc(100vw - 20px);contain:layout paint}
.mx-perf.warn{border-color:#d9b23a;color:#f3e3b0}.mx-perf.bad{border-color:#e0574d;color:#ffd0cb}
.mx-perf b{font:700 10px/1 Tahoma,Verdana,sans-serif;letter-spacing:.2em;opacity:.7}
.mx-perf button{position:absolute;top:2px;right:4px;width:28px;height:28px;border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer}
.mx-perf pre{margin:6px 0 0;font:inherit;white-space:pre}
.mx-perf{pointer-events:none}.mx-perf button{pointer-events:auto}   /* touches pass through to the controls underneath */
@media (max-width:600px){.mx-perf{font-size:10px;padding:5px 8px 6px;background:rgba(10,11,13,.82)}.mx-perf pre{margin-top:3px}}
/* ===== 1.27 VOID: no skin, no textures, glass, glow, shadows, filters or decorations; flat dark blocks, crisp lit edges ===== */
html.mx-void{--v-bg:#111215;--v-blk:#1b1c21;--v-blk2:#24252b;--v-blk3:#2e3038;--v-line:#33353e;--v-txt:#d8dae1;--v-mute:#8b8e9a;--v-glow:var(--lcd,#00e000);--v-scr:#0a0b0d;color-scheme:dark}
html.mx-void body{background:var(--v-bg)!important}
html.mx-void *,html.mx-void *::before,html.mx-void *::after{background-image:none!important;box-shadow:none!important;text-shadow:none!important;filter:none!important;mix-blend-mode:normal!important;animation:none!important;transition:none!important;border-image:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html.mx-void .skin-decor,html.mx-void [class^="sx-"],html.mx-void [class*=" sx-"],html.mx-void .spraycan,html.mx-void .ffly,html.mx-void .canlayer,html.mx-void .mistfx,html.mx-void .wtitle::before,html.mx-void .wtitle::after,html.mx-void .lcd::after,html.mx-void .list::after,html.mx-void .tabs::after,html.mx-void .hits::after,html.mx-void .msgs::after,html.mx-void .vu-glass::after,html.mx-void .glass::after{display:none!important}
html.mx-void .deck,html.mx-void .panel,html.mx-void .wing,html.mx-void .mx-card,html.mx-void .mx-sec,html.mx-void .setsec{background-color:var(--v-blk)!important;border:1px solid var(--v-line)!important;border-radius:8px!important}
html.mx-void .mixdrawer{background-color:transparent!important;border-top:1px solid var(--v-line)!important}
html.mx-void .wtitle{background-color:transparent!important;border:0!important;color:var(--v-mute)!important;letter-spacing:.3em!important;justify-content:flex-start!important}
html.mx-void .lcd,html.mx-void .vu-glass,html.mx-void input,html.mx-void select,html.mx-void textarea,html.mx-void .mx-eqg{background-color:var(--v-scr)!important;border:1px solid var(--v-line)!important;border-radius:6px!important}
html.mx-void .btn,html.mx-void .wbtn button,html.mx-void .stbtn,html.mx-void .seg button,html.mx-void .tabs button,html.mx-void .mixdrawer button:where(:not(.rd-knob,.mx-eqn,.mx-puck,.mx-acc)){background-color:var(--v-blk2)!important;border:1px solid var(--v-line)!important;border-radius:6px!important;color:var(--v-txt)!important}
html.mx-void .btn:hover,html.mx-void .mixdrawer button:where(:not(.rd-knob,.mx-eqn,.mx-puck,.mx-acc)):hover{background-color:var(--v-blk3)!important}
html.mx-void [aria-pressed=true],html.mx-void [aria-checked=true],html.mx-void [aria-selected=true],html.mx-void .btn.on,html.mx-void .mixdrawer button.on{border-color:var(--v-glow)!important;color:var(--v-glow)!important;outline:1px solid var(--v-glow)!important;outline-offset:-3px!important}
html.mx-void .mixdrawer button.mx-acc{background-color:transparent!important;border:0!important;outline:0!important;color:var(--v-txt)!important;padding:0!important}
html.mx-void .rd-btn button,html.mx-void .mixdrawer .rd-btn button,html.mx-void .vizsw input,html.mx-void .rd-knob,html.mx-void .vol-knob{background-color:var(--v-blk3)!important;border:1px solid #474a55!important;border-radius:50%!important}
html.mx-void .rd-btn button[aria-pressed=true],html.mx-void .rd-btn button:active,html.mx-void .mixdrawer .rd-btn button.armed{border-color:var(--v-glow)!important;background-color:var(--v-blk2)!important}
html.mx-void .rd-knob::after,html.mx-void .vol-knob::after{background-color:var(--v-glow)!important}
html.mx-void .mx-track{background-color:var(--v-scr)!important}
html.mx-void .mx-fill{background-color:var(--v-glow)!important;opacity:.55}
html.mx-void .mx-cap{background-color:#3d404a!important;border:1px solid #5a5e6b!important;border-radius:3px!important}
html.mx-void small,html.mx-void .mx-hint,html.mx-void .hint,html.mx-void h3,html.mx-void h4{color:var(--v-mute)!important}
html.mx-lite .mx-padbox,html.mx-lite .mx-padtxt,html.mx-lite .mx-eqg,html.mx-lite .mx-f .mx-ft{will-change:transform;contain:layout paint}
.mixdrawer{display:grid;grid-template-rows:1fr;transition:grid-template-rows .22s ease-out;margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.45);box-shadow:0 -1px 0 rgba(255,255,255,.08);position:relative;min-width:0}
.mixdrawer[hidden],.mixdrawer [hidden]{display:none!important}
.mixdrawer.mx-shut{grid-template-rows:0fr}
.mx-in{min-height:0;min-width:0;overflow:hidden;display:flex;flex-direction:column;gap:12px}
.mixdrawer.mx-settled>.mx-in{overflow:visible}
@media (prefers-reduced-motion:reduce){.mixdrawer{transition:none}}
.mixdrawer .mx-wt{margin:0}
.mx-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.mx-scope{font:400 18px/1 var(--f-mono,"VT323",monospace);color:var(--lcd,#00e000);background:var(--lcd-bg,rgba(0,0,0,.45));border-radius:3px;padding:5px 8px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mx-tabs{display:flex;flex-wrap:wrap;gap:6px;flex:1 1 auto;min-width:0}
.mixdrawer .mx-tabs>.btn{min-height:44px;padding:0 14px;font-size:.8rem;letter-spacing:.06em}
.mixdrawer .mx-tabs>.btn.on{box-shadow:inset 0 0 0 2px #7fe22a;color:#7fe22a}
.mx-dot{display:none;width:7px;height:7px;border-radius:50%;background:#7fe22a;box-shadow:0 0 6px #7fe22a;margin-left:7px;flex:none}
.mx-tabs .moved .mx-dot,.mx-sec.moved .mx-acc .mx-dot{display:inline-block}
.mixdrawer .rd-btn>button::after{content:"";position:absolute;inset:-10px}
@media (pointer:coarse){.mixdrawer .rd-btn>button::after{inset:-12px}}
.mixdrawer .rd-btn>button{position:relative}
.mx-resetall{margin-left:auto}
.mx-resetall button.armed{box-shadow:0 0 0 2px var(--btn-bezel,#111),0 0 10px #ff5f56}
.mx-resetall small{min-width:7.5em;text-align:center}
.mx-sec{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:8px;background:rgba(0,0,0,.18);box-shadow:inset 0 1px 3px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.06);min-width:0;scroll-margin-top:8px}
.mx-sh{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.mx-sh h3{margin:0;font:inherit}
.mx-acc{appearance:none;-webkit-appearance:none;background:none;border:0;padding:0 4px 0 0;margin:0;color:var(--caption,#cfd2de);font:700 .74rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.22em;text-shadow:0 1px 0 rgba(0,0,0,.65);display:inline-flex;align-items:center;min-height:44px;min-width:44px;cursor:default}
.mixdrawer[data-layout=acc] .mx-acc{cursor:pointer}
.mixdrawer[data-layout=acc] .mx-acc::before{content:"▸";margin-right:8px;letter-spacing:0}
.mixdrawer[data-layout=acc] .mx-sec[data-open] .mx-acc::before{content:"▾"}
.mx-acc:focus-visible{outline:2px solid var(--gold,#e2c86b);outline-offset:2px}
.mx-badge{font:700 .55rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.14em;padding:5px 7px;border-radius:3px;background:var(--lcd-bg,rgba(0,0,0,.4));color:var(--lcd,#00e000);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.mx-sh>.rd-btn{margin-left:auto}
.mx-hint{margin:0;font-size:.78rem;line-height:1.3;color:var(--hint,#b9bdc9)}
.mx-sh>.mx-hint{flex-basis:100%}
.mx-fld{display:inline-flex;align-items:center;gap:8px;font:700 .6rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.16em;color:var(--caption,#cfd2de)}
.mx-fld select{min-height:44px;min-width:0;max-width:100%;font:600 .85rem/1.2 var(--f-body,Tahoma,sans-serif);letter-spacing:0;padding:6px 8px}
.mx-card .mx-fld{display:flex;flex-direction:column;align-items:stretch}
.mx-fld.moved{color:#7fe22a}
.mx-body{display:flex;flex-direction:column;gap:10px;min-width:0}
.mx-grid{display:grid;gap:10px;min-width:0}
.mx-card{border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:10px;background:rgba(0,0,0,.14);min-width:0}
.mx-card h4{margin:0;font:700 .6rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.2em;color:var(--caption,#cfd2de);opacity:.85;text-shadow:0 1px 0 rgba(0,0,0,.65)}
.mx-knobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px 4px;justify-items:center;align-items:start}
.mx-k{--ks:1.3333;position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:68px;min-height:84px;padding:2px 2px 4px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:ns-resize}
.mx-k.mx-hero{--ks:2}
@media (pointer:coarse){.mx-k{--ks:1.5556}.mx-k.mx-hero{--ks:2.1111}}
.mx-dial{position:relative;width:calc(52px * var(--ks));height:calc(46px * var(--ks));flex:none}
.mx-dial>.rd-dial{position:absolute;left:0;top:0;width:52px;height:46px;margin:0;transform:scale(var(--ks));transform-origin:0 0}
.mx-k .rd-knob{--kc:var(--knob-pointer,#ffb347)}
.mx-k.moved .rd-knob{--kc:#7fe22a}
.mx-k.chaos .rd-knob{--kc:#ff5f56}
.mx-k .rd-knob:focus-visible{outline:2px solid var(--gold,#e2c86b)}
.mx-k .rd-mm{width:calc(52px * var(--ks) + 10px);display:flex;justify-content:space-between;margin:-4px -5px 0;font-size:.46rem;letter-spacing:.04em;white-space:nowrap}
.mx-k small{font:700 .56rem/1.15 Tahoma,Verdana,sans-serif;letter-spacing:.14em;color:var(--caption,#cfd2de);text-shadow:0 1px 0 rgba(0,0,0,.65);text-align:center;max-width:90px}
.mx-k.moved small{color:#7fe22a}
.mx-v{font:400 15px/1 var(--f-mono,"VT323",monospace);color:var(--lcd,#00e000);background:var(--lcd-bg,rgba(0,0,0,.45));border-radius:3px;padding:2px 5px;min-width:46px;text-align:center;white-space:nowrap}
.mx-v[data-fine]::after{content:" FINE";color:#ffd23f}
.mx-v.det{font-weight:700;color:#fff}
.mx-k.song .rd-knob,.mx-k.song .mx-v{opacity:.55}
.mx-k.na{opacity:.4;cursor:not-allowed}
.mx-edit{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:78px;min-height:32px;font:400 18px/1 var(--f-mono,"VT323",monospace);text-align:center;z-index:3}
.mx-bub{position:absolute;left:50%;top:-6px;transform:translate(-50%,-100%);z-index:5;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(10,10,14,.94);color:var(--lcd,#00e000);font:400 17px/1 var(--f-mono,"VT323",monospace);white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.6)}
.mx-bub .btn{min-height:44px}
.mx-kw{display:flex;flex-direction:column;align-items:center;gap:4px}
.mixdrawer .btn.mx-song{min-width:56px;min-height:44px;padding:0 10px;font:700 .58rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.12em}
.mixdrawer .btn.mx-song[aria-pressed=true]{color:#7fe22a;box-shadow:inset 0 0 0 2px #7fe22a}
.mx-seg{display:flex;flex-wrap:wrap;gap:4px}
.mixdrawer .mx-seg>.btn{min-height:44px;min-width:44px;padding:0 12px;font-size:.8rem}
.mixdrawer .mx-seg>[aria-checked=true]{box-shadow:inset 0 0 0 2px #7fe22a;color:#7fe22a}
.mixdrawer .mx-seg>[aria-disabled=true]{opacity:.4;cursor:not-allowed}
.mx-row{display:flex;flex-direction:column;gap:5px}
.mx-rl,.mx-numl{font:700 .58rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.18em;color:var(--caption,#cfd2de);text-shadow:0 1px 0 rgba(0,0,0,.65)}
.mx-row.moved .mx-rl,.mx-num.moved .mx-numl{color:#7fe22a}
.mx-num{display:flex;flex-wrap:wrap;align-items:center;gap:6px;position:relative}
.mx-numl{flex-basis:100%}
.mixdrawer .mx-num>.btn{min-width:44px;min-height:44px;padding:0 10px}
.mx-num.na{opacity:.45}
.mixdrawer .mx-num>.lcd.mx-lcd{flex:none;width:96px;min-width:0;height:44px;box-sizing:border-box;margin:0;padding:0 8px;display:flex;align-items:center;justify-content:center;font:400 30px/1 var(--f-mono,"VT323",monospace);color:var(--lcd,#00e000);touch-action:none;user-select:none;-webkit-user-select:none;cursor:ns-resize;min-height:0}
.mx-lcd.song{opacity:.6}
.mx-lcd.fine::after{content:"FINE";font-size:12px;color:#ffd23f;margin-left:4px}
.mx-lcd:focus-visible{outline:2px solid var(--gold,#e2c86b);outline-offset:2px}
.mx-keys{display:grid;grid-template-columns:repeat(6,minmax(44px,1fr));gap:4px}
.mx-keys>.mx-ks{grid-column:1/-1}
.mixdrawer .mx-keys>.btn{padding:0 4px}
.mixdrawer .mx-keys>.mx-blk{background:linear-gradient(#24252c,#0d0d11);color:#e6e6ee}
.mx-keys>.own::after{content:"";position:absolute;right:4px;top:4px;width:6px;height:6px;border-radius:50%;background:var(--lcd,#00e000)}
.mx-fbank{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:10px 4px;justify-items:center}
.mx-f{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:50px}
.mx-f small{font:700 .52rem/1.1 Tahoma,Verdana,sans-serif;letter-spacing:.1em;color:var(--caption,#cfd2de);text-shadow:0 1px 0 rgba(0,0,0,.65);text-align:center;max-width:64px;min-height:2.2em}
.mx-f.moved small{color:#7fe22a}
.mx-f.fine .mx-v::after{content:" FINE";color:#ffd23f}
.mx-ft{position:relative;width:44px;height:180px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ns-resize}
@media (pointer:coarse){.mx-ft{height:150px}}
.mx-ft>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;pointer-events:none;writing-mode:vertical-lr;direction:rtl}
.mx-track,.mx-fill{position:absolute;left:17px;width:10px;border-radius:5px}
.mx-track{top:20px;bottom:20px;background:rgba(0,0,0,.6);box-shadow:inset 0 1px 3px rgba(0,0,0,.85),0 1px 0 rgba(255,255,255,.08)}
.mx-fill{bottom:20px;height:calc((100% - 40px) * var(--p,0));background:var(--knob-pointer,#ffb347);box-shadow:0 0 6px var(--knob-pointer,#ffb347)}
.mx-f.moved .mx-fill{background:#7fe22a;box-shadow:0 0 6px #7fe22a}
.mx-cap{position:absolute;left:4px;width:36px;height:28px;bottom:calc(6px + (100% - 40px) * var(--p,0));border-radius:4px;border:1px solid #000;background:repeating-linear-gradient(180deg,rgba(255,255,255,.18) 0 1px,transparent 1px 4px),linear-gradient(180deg,var(--btn-up-1,#8a8d9c),var(--btn-up-2,#3a3c47));box-shadow:0 2px 4px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.3)}
.mx-cap::after{content:"";position:absolute;left:3px;right:3px;top:12px;height:2px;background:var(--knob-pointer,#ffb347)}
.mx-ft:has(input:focus-visible) .mx-cap{outline:2px solid var(--gold,#e2c86b);outline-offset:2px}
.mx-grp .mx-hero{align-self:center}
.mx-uw{display:flex;align-items:center;justify-content:center;min-width:76px;min-height:84px}
.mx-pads{display:flex;flex-wrap:wrap;gap:10px}
.mixdrawer .mx-padbtn{min-width:96px;min-height:56px;flex:1 1 96px;font-size:.8rem;letter-spacing:.08em}
.mixdrawer .mx-padbtn.busy{box-shadow:0 0 0 2px #7fe22a,0 0 12px #7fe22a;color:#7fe22a}
.mixdrawer .btn.mx-close{align-self:center;min-height:44px;padding:0 22px}
.mx-gtabs{display:none}
.mx-soundgrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.mx-gcards{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.mx-gcards>[data-card=drums]{grid-column:1/-1}
.mx-stylegrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.mx-fxgrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,176px),1fr))}
.mixdrawer:is([data-layout=board],[data-layout=acc]) .mx-fxgrid>[data-card=move]{grid-column:span 2}
.mixdrawer[data-layout=board] .mx-in{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}
.mixdrawer[data-layout=board] .mx-in>:not(.mx-sec){grid-column:1/-1}
.mixdrawer[data-layout=board] .mx-sec[data-sec=sound],.mixdrawer[data-layout=board] .mx-sec[data-sec=fx]{grid-column:1/-1}
.mixdrawer[data-layout=board] .mx-sec[data-sec=style]{grid-column:1/6}
.mixdrawer[data-layout=board] .mx-sec[data-sec=groove]{grid-column:6/-1}
.mixdrawer[data-layout=board] .mx-sec[data-sec=style]:not(:has(~ .mx-sec[data-sec=groove])){grid-column:1/-1}
.mx-soundgrid>.mx-eq{grid-column:1/-1}
.mixdrawer[data-layout=board] .mx-soundgrid{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
.mixdrawer[data-layout=board] .mx-soundgrid>.mx-eq{grid-column:1;grid-row:span 2}
.mixdrawer[data-layout=board] .mx-close{justify-self:center}
.mixdrawer[data-layout=acc] .mx-sec:not([data-open])>.mx-body,.mixdrawer[data-layout=acc] .mx-sec:not([data-open]) .mx-sh>.mx-hint{display:none}
.mixdrawer[data-layout=tabs] .mx-tabs{position:sticky;top:0;z-index:4;flex-basis:100%;flex-wrap:nowrap;padding:4px 0;background:inherit}
.mixdrawer[data-layout=tabs] .mx-tabs>.btn{flex:1 1 0;padding:0 6px;min-width:0;font-size:.74rem}
.mixdrawer[data-layout=tabs] .mx-sec:not([data-active]){display:none}
.mixdrawer[data-layout=tabs] .mx-sec{padding:10px 8px}
.mixdrawer[data-layout=tabs] .mx-card{padding:8px}
.mixdrawer[data-layout=tabs] .mx-resetall{margin-left:0}
.mixdrawer[data-layout=tabs] .mx-gtabs{display:flex}
.mixdrawer[data-layout=tabs] .mx-gtabs>.btn{flex:1 1 0}
.mixdrawer[data-layout=tabs] .mx-gcards>.mx-card:not([data-active]){display:none}
.mixdrawer[data-layout=tabs] .mx-knobs{grid-template-columns:repeat(auto-fill,minmax(72px,1fr))}
@media (pointer:coarse){.mx-knobs,.mixdrawer[data-layout=tabs] .mx-knobs{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}.mx-k{min-width:84px}}
.mixdrawer:is([data-layout=board],[data-layout=acc]) .mx-stylegrid>.mx-stylecard{grid-column:1/-1}
/* 1.25 UI-2: card header row, toggles, ORIGINAL */
.mx-ch{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.mx-ch>h4{margin-right:auto}
.mixdrawer .btn.mx-tg,.mixdrawer .btn.mx-sb{min-height:44px;min-width:44px;padding:0 12px;font:700 .6rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.12em;white-space:nowrap}
.mixdrawer .btn.mx-tg[aria-pressed=true]{color:#7fe22a;box-shadow:inset 0 0 0 2px #7fe22a}
.mixdrawer .btn.mx-orig{min-height:44px;padding:0 14px;font:700 .7rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.14em;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.mixdrawer .btn.mx-orig.on{color:#ffd23f;box-shadow:inset 0 0 0 2px #ffd23f,0 0 12px rgba(255,210,63,.6)}
.mx-bypnote{margin:0;padding:6px 10px;border-radius:4px;background:rgba(255,210,63,.12);color:#ffd23f;font-size:.8rem;line-height:1.3}
.mixdrawer.mx-byp .mx-body{opacity:.6}
.mixdrawer[data-layout=tabs] .mx-orig{order:5}
/* EQ: the curve, its dots, the band strip, QUICK TONE */
.mx-eqg{position:relative;height:180px;border-radius:4px;touch-action:none;user-select:none;-webkit-user-select:none;background:var(--lcd-bg,rgba(0,0,0,.45));box-shadow:inset 0 1px 4px rgba(0,0,0,.7)}
.mixdrawer[data-layout=acc] .mx-eqg{height:160px}
.mixdrawer[data-layout=tabs] .mx-eqg{height:150px}
@media (pointer:coarse){.mx-eqg{height:150px}}
.mx-eqg>canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:4px;display:block}
.mx-eqn{position:absolute;left:-99px;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;padding:0;border:0;background:none;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;z-index:1}
.mx-eqn::before{content:"";position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;box-sizing:border-box;border-radius:50%;background:var(--bc);border:2px solid rgba(0,0,0,.65);box-shadow:0 0 0 1px rgba(255,255,255,.35)}
.mx-eqn>span{position:absolute;left:50%;top:-2px;transform:translateX(-50%);font:700 9px/1 Tahoma,Verdana,sans-serif;letter-spacing:.04em;color:var(--bc);text-shadow:0 1px 2px #000;pointer-events:none;white-space:nowrap}
.mx-eqn.off::before{background:rgba(0,0,0,.5);border-color:var(--bc)}
.mx-eqn.sel{z-index:2}
.mx-eqn.sel::before{width:20px;height:20px;margin:-10px 0 0 -10px;box-shadow:0 0 0 2px #fff,0 0 10px var(--bc)}
.mx-eqn.drag{cursor:grabbing}
.mx-eqn:focus-visible{outline:2px solid var(--gold,#e2c86b);outline-offset:-8px;border-radius:50%}
.mx-eq.eqoff .mx-eqn{opacity:.55}
.mx-eqstrip{display:flex;flex-direction:column;gap:8px;min-width:0}
.mixdrawer [data-eq-band].mx-seg>.btn{min-width:48px;padding:0 10px}
.mixdrawer .mx-eqk{display:flex;flex-wrap:wrap;align-items:center;gap:8px 4px}
.mx-eqk>.mx-k{width:76px}
@media (pointer:coarse){.mx-eqk>.mx-k{width:88px}}
.mixdrawer[data-layout=tabs] [data-eq-band].mx-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr))}
.mixdrawer[data-layout=tabs] [data-eq-band].mx-seg>.btn{min-width:44px;padding:0 2px}
.mx-eqcut,.mx-eqbr{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:84px}
.mx-qt{display:flex;flex-direction:column;gap:6px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
/* STYLE: the pad */
.mx-pad{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0}
.mx-padbox{position:relative;width:min(100%,360px);aspect-ratio:1/1;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:crosshair}
.mx-padsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.mx-svgt{font:700 5.5px Tahoma,Verdana,sans-serif;letter-spacing:.08em;fill:rgba(255,255,255,.6)}
.mx-pl{position:absolute;transform:translate(-50%,-50%);min-width:44px;min-height:44px;padding:0 3px;margin:0;background:none;border:0;border-radius:6px;color:var(--caption,#cfd2de);font:700 11px/1 Tahoma,Verdana,sans-serif;letter-spacing:.05em;white-space:nowrap;cursor:pointer;text-shadow:0 1px 0 rgba(0,0,0,.8);z-index:2;-webkit-tap-highlight-color:transparent}
.mx-pl::after{content:"";position:absolute;left:20%;right:20%;bottom:9px;height:2px;border-radius:1px;background:var(--dc);opacity:.35;transform:scaleX(.4)}
.mx-pl.on{color:var(--dc)}
.mx-pl.on::after{opacity:1;transform:scaleX(calc(.4 + .6 * var(--w,0)))}
.mx-pl:focus-visible{outline:2px solid var(--gold,#e2c86b)}
.mx-puck{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;box-sizing:border-box;border-radius:50%;z-index:3;background:radial-gradient(circle at 35% 30%,#fff 0,#e2e4ee 18%,#8a8d9c 60%,#3a3c47 100%);border:2px solid #111;box-shadow:0 3px 8px rgba(0,0,0,.7),0 0 0 3px rgba(226,200,107,.55)}
.mx-puck::after{content:"";position:absolute;inset:-12px;border-radius:50%}
.mx-puck:focus-visible{outline:2px solid var(--gold,#e2c86b);outline-offset:4px}
.mx-puck.idle{opacity:.45;box-shadow:0 2px 5px rgba(0,0,0,.6)}
.mx-puck.mx-ghost{background:rgba(226,200,107,.12);border:2px dashed var(--gold,#e2c86b);box-shadow:none;pointer-events:none;z-index:2}
.mx-padbox.glide .mx-puck{transition:left .24s ease-out,top .24s ease-out}
.mx-padbox.drag{cursor:grabbing}
.mx-padro{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 12px;max-width:100%}
.mx-padtxt{font:400 18px/1.15 var(--f-mono,"VT323",monospace);color:var(--lcd,#00e000);background:var(--lcd-bg,rgba(0,0,0,.45));border-radius:3px;padding:6px 10px;min-width:12em;max-width:100%;text-align:center;overflow-wrap:anywhere}
/* STYLE: faders, stage lights, lanes */
.mx-f small{border-bottom:2px solid var(--dc,transparent);padding-bottom:2px}
.mx-lit4{display:flex;gap:3px}
.mx-lit4>i,.mx-legend>i{display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.14)}
.mx-lit4>i.on{background:var(--dc,#7fe22a);opacity:calc(.35 + .65 * var(--x,1));box-shadow:0 0 4px var(--dc,#7fe22a)}
.mx-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
.mx-legend>i{background:#7fe22a;margin-left:6px}
.mx-legend>i:first-child{margin-left:0}
.mx-eff{font:400 13px/1 var(--f-mono,"VT323",monospace);color:#ffd23f;min-height:13px}
.mx-scaled{font:700 .55rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.14em;padding:5px 7px;border-radius:3px;background:rgba(255,210,63,.15);color:#ffd23f}
.mx-lanes{display:flex;flex-direction:column;gap:6px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
.mx-lane .mx-live{position:absolute;right:6px;top:4px;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.14)}
.mx-lane.live .mx-live{background:#7fe22a;box-shadow:0 0 6px #7fe22a}
/* GROOVE: the drums card */
.mx-sub{display:flex;flex-direction:column;gap:6px;min-width:0}
.mx-sub+.mx-sub{border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
.mx-sub h5{margin:0;font:700 .55rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.2em;color:var(--caption,#cfd2de);opacity:.7}
.mx-drums .mx-k small,.mx-kwrap .mx-k small{white-space:nowrap;letter-spacing:.06em}
.mx-more>summary{min-height:44px;display:flex;align-items:center;gap:6px;cursor:pointer;font:700 .55rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.16em;color:var(--caption,#cfd2de);list-style:none}
.mx-more>summary::-webkit-details-marker{display:none}
.mx-more>summary::before{content:"▸"}
.mx-more[open]>summary::before{content:"▾"}
.mixdrawer .mx-kw>.btn.mx-song{max-width:100%}
.mx-drums{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:10px 14px;align-items:start}
.mx-drums>h4{grid-column:1/-1}
.mx-drums>.mx-sub+.mx-sub{border-top:0;padding-top:0}
.mixdrawer .mx-tricks{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.mx-tricks>h4{grid-column:1/-1}
.mixdrawer:is([data-layout=board],[data-layout=acc]) .mx-fxgrid>[data-card=tricks]{grid-column:span 2}
/* FX: GLITCH flashes when it fires */
.mx-k.fired .rd-knob{filter:drop-shadow(0 0 8px #ff5f56)}
.mx-k.fired .mx-v{color:#fff;background:#ff5f56}
`;
