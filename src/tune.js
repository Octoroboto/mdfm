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
// ===== MIX drawer: how it fits =====
// Who mounts it:
//   - the radio page: skin/radio-wire.js calls mountMix(radio, { panel: #tunePop, toggle: #tuneOn }) (a checkbox toggle).
//   - the hub (MedDev Receiver): a button toggle (#rxTuneBtn); a page may pass its own stores so settings live elsewhere.
//   - kit apps and older hub builds (up to v102) call MDFM.mountTune, the alias at the end of this file.
// opts:
//   panel    the element MIX fills (required). It becomes .mixdrawer, role=region, labelled by the title, and starts hidden.
//   toggle   optional checkbox or button that opens and closes it (its aria-expanded / aria-controls are kept up to date).
//   title    the caption (default "MIX"; the close button reads "Close <title>").
//   store, mixStore, grooveStore, fxStore, eqStore, toneStore, uiStore: optional { get(), set(value) } objects used instead
//            of the localStorage keys below (get returns the saved value or null). All but uiStore go through lazy(), so a
//            drag saves once when it ends.
// localStorage keys (JSON) when no store is given:
//   mdfmSound     the SOUND settings {realism, clarity, warmth, width, grain, rattle, ambience, room 0..1, roomType} (every station)
//   mdfmEq        the whole parametric EQ as radio.getEq() returns it (every station)
//   mdfmTone      {low, mid, high} in dB, -12..+12: the EQ's LS / P1 / HS gains, kept equal to mdfmEq
//   mdfmStyleMix  { [stationId]: {v: 2, w: {direction: 0..1}, lanes: {lane: 0..1}, ring: AMOUNT 0..1} }
//   mdfmGroove    { [stationId]: groove & key settings }        mdfmFx  the FX amounts {key: 0..1} (every station)
//   mdfmMixUI     the drawer's own state (see `ui` below)
// Layout (applyLayout, further down): picked from the drawer's own width by a ResizeObserver and put in panel.dataset.layout
//   for the CSS: "board" >= 900 px (sections side by side on a 12-column grid), "acc" 600-899 px (an accordion: each section
//   header folds its body), "tabs" < 600 px (one section at a time; the head's buttons become an ARIA tablist). After a
//   change of size or layout, window gets a "mdfm:mixresize" event {open, layout} so the page can re-measure.
// Drag coalescing (1.26): while any control is dragged (dragN > 0), live(key, fn) keeps only the newest engine update per
//   control and runs it once per frame, and lazy() stores hold their saves until the last drag ends. Taps, keys and API
//   calls apply at once.
// Talking to the engine: every part is feature-detected with has("name"). Controls call radio.setSound / setEq / setTone /
//   setStyleMix / setStylePad / setStyleLanes / setGroove / setBeat / setFx / setMixBypass ... and save what comes back.
//   radio.on("station" | "mix" | "groove" | "fx" | "eq" | "tone" | "bypass" | "nowplaying" | ...) repaints the matching
//   section, at most once per frame, and skips a section MIX already painted after its own change (see `painted`).
// Returns { open(v), isOpen(), section(k), paint(), get(), set(o) } (get / set are the SOUND settings), or null when there is
//   no panel or the engine has no setSound.
function mountMix(radio, opts = {}) {
  // opts: see the header above. The stores fall back to localStorage, section by section, further down.
  const { panel, toggle, store, mixStore, grooveStore, fxStore, toneStore, eqStore, uiStore, title = "MIX" } = opts;
  // nothing to mount without a panel or an engine with the SOUND API; callers treat null as "no MIX here"
  if (!radio || typeof radio.setSound !== "function" || !panel) return null;
  // the panel's own document and window (the drawer can be mounted into another window or frame), not the globals
  const doc = panel.ownerDocument || document, win = doc.defaultView || window;
  // MIX_CSS goes in once per document, before the skin's stylesheet (#mdfm-radio) so a skin can override it
  if (!doc.getElementById("mdfm-mix-css")) { const s = doc.createElement("style"); s.id = "mdfm-mix-css"; s.textContent = MIX_CSS;
    const before = doc.getElementById("mdfm-radio"); before ? before.parentNode.insertBefore(s, before) : doc.head.appendChild(s); }
  // ===== small helpers =====
  // has(k): the engine offers radio[k] (feature detection). obj(x): x when it is a plain object, else null.
  // ls0(key): an unbuffered localStorage store {get, set} for JSON under key; errors (private mode, quota) are swallowed.
  // esc(s): HTML-escape text and attribute values going into the markup strings.
  // uid / mkid(s): ids prefixed per mount, so two drawers on one page don't collide; nid numbers the knob captions.
  // station() / sid(): the station on air and its id ("mdfm" without getStation); per-station records are keyed by sid().
  // coarse(): a touch-first pointer. reduced(): the user asked for less motion (no open animation, no smooth scrolling).
  // clamp(v, a, b); vib(): a 5 ms buzz when a knob hits its detent (where navigator.vibrate exists; iOS Safari has none).
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
  // dragN: how many controls are being dragged now (dragOn / dragOff). jobs: control key (its element) -> the newest
  // pending engine update for this frame. held: store -> the newest value waiting to be saved. jobRaf: the pending frame.
  let dragN = 0, jobRaf = 0; const jobs = new Map(), held = new Map();
  // requestAnimationFrame, or a 16 ms timer where there is none
  const raf = f => (win.requestAnimationFrame ? win.requestAnimationFrame(f) : setTimeout(f, 16));
  // run this frame's queued updates (one per control); one that throws doesn't stop the rest
  const runJobs = () => { jobRaf = 0; if (!jobs.size) return; const L = [...jobs.values()]; jobs.clear(); for (const f of L) { try { f(); } catch (e) {} } };
  // live(key, fn): outside a drag, run fn now (dropping a queued one for that key); during a drag, queue it for the next frame
  const live = (key, fn) => { if (!dragN) { jobs.delete(key); fn(); return; } jobs.delete(key); jobs.set(key, fn); if (!jobRaf) jobRaf = raf(runJobs); };
  // write the saves held during the drag
  const flushSaves = () => { if (!held.size) return; const L = [...held]; held.clear(); for (const [st, v] of L) { try { st.set(v); } catch (e) {} } };
  // gesture(), the EQ graph and the pad call these on press and release; when the last drag ends, updates and saves go out
  const dragOn = () => { dragN++; };
  const dragOff = () => { if (!dragN) return; dragN--; if (!dragN) { runJobs(); flushSaves(); } };
  // lazy(st): wraps a store so set() during a drag is held (newest wins) and written on release; anything else passes
  // through unchanged, so `lazy(opts.x) || ls(key)` falls back to localStorage when no store was given
  const lazy = st => st && typeof st.set === "function" ? { get: (...a) => st.get(...a), set: v => { if (dragN) held.set(st, v); else { held.delete(st); st.set(v); } } } : st;
  // ls(key): the localStorage store for key, saved lazily
  const ls = key => lazy(ls0(key));
  // never lose a held update or save when the page goes away or to the background mid-drag (a pointerup may never come)
  win.addEventListener("pagehide", () => { runJobs(); flushSaves(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) { runJobs(); flushSaves(); } });

  // ---------- the drawer's own state (per device) ----------
  // us: where the drawer's state is kept (opts.uiStore or mdfmMixUI; saved at once, not lazily). ui0: what was saved.
  const us = uiStore || ls0("mdfmMixUI"), ui0 = obj(us.get()) || {};
  // ui fields (saveUI() writes them):
  //   v           record version (1)
  //   open        the drawer was left open (reopened on load, except on a phone)
  //   section     the section shown in the tabs layout, or the one last chosen ("sound" | "style" | "groove" | "fx")
  //   acc         which sections are unfolded in the accordion layout
  //   styleView   STYLE's view, "pad" or "faders"
  //   eqBand      the EQ band selected in the band strip ("lc" "ls" "p1" "p2" "hs" "hc")
  //   grooveCard  the Groove & Key card shown when its cards are tabbed ("tempo" "key" "melody" "drums" "beat")
  //   lite, void, perf are added further down (LITE "auto" | "on" | "off", VOID and PERF on or off).
  // acc is merged on its own so a saved acc that lacks a section keeps that section's default.
  const ui = { v: 1, open: false, section: "sound", acc: { sound: true, style: true, groove: false, fx: false }, styleView: "pad", eqBand: "p1", grooveCard: "tempo",
    ...ui0, acc: { sound: true, style: true, groove: false, fx: false, ...(obj(ui0.acc) || {}) } };
  // saveUI(): write ui to its store
  const saveUI = () => us.set(ui);

  // ---------- one pointer helper for knobs, faders and dials: drag past a dead zone, tap, double-tap, long-press ----------
  // gesture(el, h): pointer handling for one element. Every h callback is optional:
  //   skip(e) true = ignore this press; down(e) on press; start(e) once the pointer moves past h.dead px (default 3);
  //   move(ddx, ddy, e, {dx, dy, type}): ddx / ddy since the last move, dx / dy since the press, type = the pointerType;
  //   end(e, moved) on release; tap(e) for a press with no movement; double(e) for a second tap within 300 ms and 12 px
  //   (instead of tap); long(e) after 500 ms held still (no tap follows).
  // One pointer at a time (a second finger is ignored). Calls dragOn / dragOff so updates and saves coalesce while held.
  function gesture(el, h) {
    let pid = null, x0 = 0, y0 = 0, lx = 0, ly = 0, moved = false, longed = false, longT = 0, type = "mouse", last = { t: 0, x: 0, y: 0 };
    el.addEventListener("pointerdown", e => {
      if (pid !== null || (e.pointerType === "mouse" && e.button !== 0) || (h.skip && h.skip(e))) return;
      pid = e.pointerId; type = e.pointerType || "mouse"; x0 = lx = e.clientX; y0 = ly = e.clientY; moved = false; longed = false; dragOn();
      // capture: the moves keep coming when the finger slides off the element (throws if the pointer is already gone)
      try { el.setPointerCapture(pid); } catch (err) {}
      // no text selection, no page scroll or native drag from this press
      e.preventDefault(); h.down && h.down(e);
      // long-press timer; cancelled by movement or release
      clearTimeout(longT); if (h.long) longT = setTimeout(() => { if (pid !== null && !moved) { longed = true; h.long(e); } }, 500); });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return; const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!moved) { if (Math.hypot(dx, dy) < (h.dead == null ? 3 : h.dead)) return; moved = true; clearTimeout(longT); lx = e.clientX; ly = e.clientY; h.start && h.start(e); return; }
      const ddx = e.clientX - lx, ddy = e.clientY - ly; lx = e.clientX; ly = e.clientY; h.move && h.move(ddx, ddy, e, { dx, dy, type }); });
    // release: pointerup, pointercancel (the browser took the gesture over) or lost capture; pid = null makes it run once
    const up = e => {
      if (e.pointerId !== pid) return; pid = null; clearTimeout(longT); dragOff();
      if (e.type === "pointerup" && !moved && !longed) { const t = performance.now(), near = Math.hypot(e.clientX - last.x, e.clientY - last.y) < 12;
        if (h.double && t - last.t < 300 && near) { last.t = 0; h.double(e); } else { last = { t, x: e.clientX, y: e.clientY }; h.tap && h.tap(e); } }
      // a drag or a long-press breaks a double-tap sequence
      else last.t = 0;
      h.end && h.end(e, moved); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
  }
  // fine control: Shift/Alt/Ctrl x0.2 with a mouse; on touch, the further the finger slides sideways, the finer (x0.25 at 160 px)
  // returns the multiplier for a drag's delta; g is gesture()'s move info {dx, dy, type}
  const fineOf = (e, g) => { if (g.type !== "mouse") { const ax = Math.abs(g.dx); return ax <= 60 ? 1 : ax >= 160 ? .25 : 1 - .75 * (ax - 60) / 100; }
    return e.shiftKey || e.altKey || e.ctrlKey || e.metaKey ? .2 : 1; };
  // type a value: Enter on a knob or the BPM readout opens a small number field; Enter or leaving it sets, Esc cancels
  // host: the element the field goes in; cur: its starting value; min / max / step: the field's limits;
  // done(v) gets the typed number, or null when cancelled or not a number. One field per host at a time.
  function editValue(host, cur, min, max, step, done) {
    if (host.querySelector(".mx-edit")) return; const f = doc.createElement("input");
    f.type = "number"; f.className = "mx-edit"; f.min = min; f.max = max; f.step = step; f.value = String(cur); f.setAttribute("aria-label", "Type a value");
    host.appendChild(f); f.focus(); f.select(); let gone = false;
    const end = ok => { if (gone) return; gone = true; const v = parseFloat(f.value); f.remove(); if (ok && Number.isFinite(v)) done(v); else done(null); };
    // stopPropagation: the knob's own keys and the panel's Escape-to-close don't see what is typed here
    f.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true); } else if (e.key === "Escape") { e.preventDefault(); end(false); } });
    // leaving the field sets it; a press in it must not start a drag on the knob underneath
    f.addEventListener("blur", () => end(true)); f.addEventListener("pointerdown", e => e.stopPropagation());
  }

  // ---------- Knob: .mx-k > .mx-dial > .rd-dial > (svg.rd-ticks, .rd-knob[role=slider]); the whole cell takes the pointer ----------
  // TICKS: the dots around a knob: 11 over the 270-degree sweep (-135 to +135, 27 apart) on a 60 x 60 viewBox at
  // radius 27; every fifth (both ends and the middle) is bigger
  const TICKS = (() => { let t = ""; for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * Math.PI / 180;
    t += `<circle cx="${(30 + Math.sin(a) * 27).toFixed(2)}" cy="${(30 - Math.cos(a) * 27).toFixed(2)}" r="${i % 5 ? .9 : 1.4}" fill="rgba(226,229,238,.75)"/>`; } return t; })();
  // knobHTML(key, label, lo, hi, cls, aria): one knob cell. data-key finds it later; lo / hi are the captions at the ends
  // of the sweep; cls adds classes (mx-bip: bipolar, the middle is home); the <small> caption labels the slider unless aria
  // is given. The <output> shows the value for sighted users; screen readers get the slider's aria-valuetext instead.
  // aria: a fuller name for screen readers when the caption alone is ambiguous (HATS under LEVELS is the hats' level)
  const knobHTML = (key, label, lo, hi, cls = "", aria = "") => { const c = mkid("c" + (++nid));
    return `<div class="mx-k${cls ? " " + cls : ""}" data-key="${key}"><div class="mx-dial"><div class="rd-dial"><svg class="rd-ticks" viewBox="0 0 60 60" aria-hidden="true">${TICKS}</svg><div class="rd-knob" role="slider" tabindex="0" ${aria ? `aria-label="${esc(aria)}"` : `aria-labelledby="${c}"`}></div></div></div><div class="rd-mm" aria-hidden="true"><span>${lo}</span><span>${hi}</span></div><small id="${c}">${label}</small><output class="mx-v" aria-hidden="true"></output></div>`; };
  // Knob(cell, o): wires a cell built by knobHTML. o:
  //   min, max, step   the range in the knob's own units (0..100 %, dB, or 0..1000 for the EQ's log-mapped knobs)
  //   def, home        the starting value and the one reset() goes back to (home defaults to def)
  //   center           a detent: a drag within 3% of the range of it snaps there with a buzz (bipolar knobs)
  //   fmt(v)           the short readout; text(v) the screen-reader valuetext (defaults to fmt); tip the tooltip
  //   onInput(v)       the new value (once per frame while dragging, through live())
  //   onReset()        replaces the default reset; toEdit(v) / fromEdit(x) convert to and from the typed value (Enter)
  // Input: drag (mouse: right or up turns it up; touch: up only, so a sideways slide is free to set fine control), the
  //   wheel (only after hovering 150 ms, so a page scrolling past doesn't turn it), keys (arrows, Shift x5, PageUp / PageDown
  //   10%, Home / End, Delete resets, Enter types a value), double-tap resets, long-press shows the value with RESET.
  // Returns { el, get(), set(x) (paints, no onInput), opt(p) (change options), state({moved, song, text, aria}), disable(reason) }.
  function Knob(cell, o) {
    const kn = cell.querySelector(".rd-knob"), out = cell.querySelector(".mx-v"), range = o.max - o.min, home = o.home == null ? o.def : o.home;
    // v: the snapped value shown; raw: the unsnapped drag position (slow drags add up below one step); dis: disabled;
    // hoverT: when the pointer came over the cell (the wheel guard); bub / bubT: the long-press bubble and its timer
    let v = o.def, raw = v, dis = false, hoverT = 0, bub = null, bubT = 0, dragging = false;
    kn.setAttribute("aria-valuemin", String(o.min)); kn.setAttribute("aria-valuemax", String(o.max));
    if (o.tip) { cell.title = o.tip; kn.setAttribute("aria-description", o.tip); }
    // snap(x): clamp, round to a step counted from min (toFixed(4) drops float noise)
    const snap = x => +(Math.round((clamp(x, o.min, o.max) - o.min) / o.step) * o.step + o.min).toFixed(4);
    // paint(): turn the knob (-135 to +135 degrees), set the readout and the slider's ARIA values
    const paint = () => { const f = (v - o.min) / range; kn.style.transform = `rotate(${(-135 + f * 270).toFixed(1)}deg)`;
      const t = o.fmt(v); out.textContent = t; kn.setAttribute("aria-valuenow", String(v)); kn.setAttribute("aria-valuetext", o.text ? o.text(v) : t); };
    // put(x, detent): set from a raw value; with detent, snap to center when close; onInput only when the value changes
    const put = (x, detent) => { if (dis) return; let nv = snap(x);
      if (detent && o.center != null && Math.abs(x - o.center) < range * .03) { nv = o.center; if (v !== o.center) { vib(); out.classList.add("det"); setTimeout(() => out.classList.remove("det"), 400); } }
      if (nv === v) return; v = nv; paint(); live(cell, () => o.onInput(v)); };
    // reset(): back to home (or o.onReset); v = NaN so put() always applies
    const reset = () => { if (dis) return; raw = home; if (o.onReset) o.onReset(); else { v = NaN; put(home); } };
    // fine(on): marks the readout while fine control is active (styled by the CSS)
    const fine = on => { if (on) out.dataset.fine = "1"; else delete out.dataset.fine; };
    const hideBub = () => { if (bub) { bub.remove(); bub = null; } clearTimeout(bubT); };
    // presses on buttons, the typed-value field or the bubble inside the cell are theirs; focus without scrolling the page
    gesture(cell, { skip: e => !!e.target.closest("button,input,.mx-bub"),
      down: () => { kn.focus({ preventScroll: true }); raw = v; hideBub(); }, start: () => { dragging = true; },
      // mouse: ddx - ddy (right or up = more); touch: vertical only. 200 px = the whole range, times the fine factor
      move: (ddx, ddy, e, g) => { if (dis) return; const f = fineOf(e, g), d = g.type === "mouse" ? ddx - ddy : -ddy; fine(f < 1);
        raw = clamp(raw + d / 200 * range * f, o.min, o.max); put(raw, true); },
      end: () => { dragging = false; fine(false); }, double: () => reset(),
      // long-press: a small bubble with the value and RESET, gone after 3.5 s or a press anywhere else
      long: () => { if (dis) return; hideBub(); bub = doc.createElement("div"); bub.className = "mx-bub"; bub.setAttribute("role", "group");
        bub.innerHTML = `<span></span><button type="button" class="btn">RESET</button>`; bub.firstChild.textContent = o.text ? o.text(v) : o.fmt(v);
        bub.lastChild.addEventListener("click", () => { reset(); hideBub(); kn.focus({ preventScroll: true }); }); cell.appendChild(bub); bubT = setTimeout(hideBub, 3500); } });
    // the wheel only turns a knob the pointer has rested on for 150 ms
    cell.addEventListener("pointerenter", () => { hoverT = performance.now(); }); cell.addEventListener("pointerleave", () => { hoverT = 0; });
    // passive: false so preventDefault can stop the page scrolling; 0.0015 of the range per wheel pixel
    cell.addEventListener("wheel", e => { if (dis || !hoverT || performance.now() - hoverT < 150) return; e.preventDefault(); raw = v;
      put(v - e.deltaY * .0015 * range * (e.shiftKey ? .2 : 1)); }, { passive: false });
    // keys: arrows one step (Shift x5), PageUp / PageDown a tenth, Home / End the ends, Delete / Backspace reset, Enter types
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
  // faderHTML(key, label): one fader cell: the readout, the track, fill and cap drawn from --p (0..1) by the CSS, and a
  // transparent native range input over them for the keyboard and screen readers; the caption labels the input.
  const faderHTML = (key, label) => { const c = mkid("c" + (++nid));
    return `<div class="mx-f" data-key="${key}"><output class="mx-v" aria-hidden="true">0%</output><div class="mx-ft"><i class="mx-track"></i><i class="mx-fill"></i><i class="mx-cap"></i><input type="range" min="0" max="100" step="1" value="0" aria-orientation="vertical" aria-labelledby="${c}"></div><small id="${c}">${label}</small></div>`; };
  // Fader(cell, o): wires a cell built by faderHTML. Values are 0..100 (%). o: def (the double-tap value), tip, fmt(v) the
  //   readout, text(v) the aria-valuetext, onInput(v). The track drags vertically (its height less 40 px, at least 60, is the
  //   whole range; fine control as for knobs); the wheel moves it 5 per notch while hovered.
  // Returns { el, get(), set(x) } (set paints only).
  function Fader(cell, o) {
    const inp = cell.querySelector("input"), out = cell.querySelector(".mx-v"), ft = cell.querySelector(".mx-ft"); let v = 0, raw = 0, dragging = false;
    if (o.tip) { cell.title = o.tip; inp.setAttribute("aria-description", o.tip); }
    const paint = () => { inp.value = String(v); cell.style.setProperty("--p", String(v / 100)); out.textContent = o.fmt(v); inp.setAttribute("aria-valuetext", o.text(v)); };
    const put = x => { x = Math.round(clamp(x, 0, 100)); if (x === v) return; v = x; paint(); live(cell, () => o.onInput(v)); };
    // the native input (keyboard, assistive tech) applies at once, not through live()
    inp.addEventListener("input", () => { v = +inp.value; paint(); o.onInput(v); });
    // fth: the track's height, measured on press (reading it on every move would force a layout per frame)
    let fth = 0;
    gesture(ft, { down: () => { inp.focus({ preventScroll: true }); raw = v; fth = ft.clientHeight; }, start: () => { dragging = true; },
      move: (ddx, ddy, e, g) => { const f = fineOf(e, g), h = Math.max(60, (fth || ft.clientHeight) - 40); cell.classList.toggle("fine", f < 1); raw = clamp(raw - ddy / h * 100 * f, 0, 100); put(raw); },
      // double-tap: v = -1 so put() applies even when def is the value already shown
      end: () => { dragging = false; cell.classList.remove("fine"); }, double: () => { raw = 0; v = -1; put(o.def || 0); } });
    cell.addEventListener("wheel", e => { if (!cell.matches(":hover")) return; e.preventDefault(); put(v - Math.sign(e.deltaY) * 5); }, { passive: false });
    paint();
    // set(x): skip the repaint when nothing changed; mid-drag, raw keeps following the finger
    return { el: cell, get: () => v, set(x) { const nv = Math.round(x); if (nv === v && inp.value === String(v)) { if (!dragging) raw = v; return; } v = nv; if (!dragging) raw = v; paint(); } };
  }

  // ---------- Seg: a row of radio buttons (>= 44 px), arrow keys move the choice; wraps instead of shrinking ----------
  // Seg(box, items, onPick, label): fills box with a radiogroup. items: [value, label HTML, tooltip, extra class].
  //   onPick(value, button) on a click or an arrow key (arrows skip disabled buttons, wrap, and pick as they move, like native
  //   radios). Roving tabindex: only the checked button (or the first enabled one) is in the tab order.
  // Returns { el, btn(v) (the button for v), set(v) (check v, or nothing for null; no onPick), disable(reason) }.
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
  // songBtn(key, what): the SONG button beside a control (pressed while the song's own value is in use).
  // rdBtn(attr, cap, aria, tip): a round receiver-style button (rd-btn, the skin's look) with a caption under it.
  const songBtn = (key, what) => `<button type="button" class="btn mx-song" data-song="${key}" aria-pressed="true" title="Back to the song's own ${esc(what)}" aria-label="${esc(what)}: the song's own">SONG</button>`;
  const rdBtn = (attr, cap, aria, tip) => `<div class="rd-btn"><button type="button" ${attr} aria-label="${esc(aria)}" title="${esc(tip || aria)}"></button><small>${cap}</small></div>`;

  // ---------- markup ----------
  // SEC: the sections this engine supports (one it lacks isn't built). NAMES: their names on the tabs and RESET labels.
  const SEC = { sound: has("setSound"), style: has("setStyleMix") && has("styleMixKeys"), groove: has("setGroove") && has("grooveKeys"), fx: has("setFx") && has("fxKeys") };
  const NAMES = { sound: "Sound", style: "Style", groove: "Groove & Key", fx: "FX" };
  // secHTML(k, h, badge, hint, body, extra): one section: a header (its h3 is the accordion button; a scope badge such as
  // ALL STATIONS or THIS STATION; extra controls; RESET; a hint) and the body. The ids tie tabs, headers and bodies for ARIA.
  const secHTML = (k, h, badge, hint, body, extra = "") => `<section class="mx-sec" data-sec="${k}" id="${mkid("sec-" + k)}" aria-labelledby="${mkid("h-" + k)}"><header class="mx-sh"><h3><button type="button" class="mx-acc" id="${mkid("h-" + k)}" aria-controls="${mkid("body-" + k)}">${h}<i class="mx-dot" aria-hidden="true"></i></button></h3><span class="mx-badge" data-badge="${k}">${badge}</span>${extra}${rdBtn(`data-reset="${k}"`, "RESET", `Reset ${NAMES[k]}`, k === "style" || k === "groove" ? `Back to the song as written on this station` : `Back to how MDFM sounds as it is, on every station`)}<p class="mx-hint">${hint}</p></header><div class="mx-body" id="${mkid("body-" + k)}">${body}</div></section>`;
  // BYP: the engine call behind ORIGINAL (setMixBypass from 1.25 E3, setBypass before), or null: no ORIGINAL button
  const BYP = has("setMixBypass") ? "setMixBypass" : has("setBypass") ? "setBypass" : null;
  // the drawer's head: the title, the scope line (data-scope: which station the per-station sections apply to), the section
  // tabs (buttons; a tablist in the tabs layout), then ORIGINAL (hold to bypass), LITE, VOID and PERF when the engine has
  // them, RESET ALL, and the role=status note shown while ORIGINAL is held
  let html = `<div class="mx-in"><div class="wtitle mx-wt"><span id="${mkid("title")}"></span></div><div class="mx-head"><span class="mx-scope" data-scope></span><div class="mx-tabs" aria-label="Mix sections">${Object.keys(SEC).filter(k => SEC[k]).map(k => `<button type="button" class="btn" data-tab="${k}" id="${mkid("tab-" + k)}" aria-controls="${mkid("sec-" + k)}">${NAMES[k]}<i class="mx-dot" aria-hidden="true"></i></button>`).join("")}</div>` +
    (BYP ? `<button type="button" class="btn mx-orig" data-t="orig" aria-pressed="false" title="Hold to hear the station as it is, with no style, groove, effects or EQ. On a touch screen a quick tap keeps it on until you tap again">ORIGINAL</button>` : "") +
    (has("setLite") ? `<button type="button" class="btn mx-lite" data-t="lite" aria-pressed="false" title="LITE mixing for phones and tablets: while MIX is open it pauses the decorations, drops the glass and glow, slows the meters, schedules the music further ahead and holds MDFM's talk breaks until you close MIX. AUTO turns it on for touch screens. Tap to switch AUTO / ON / OFF">LITE <span data-lite-v>AUTO</span></button>` : "") +
    `<button type="button" class="btn mx-void" data-t="void" aria-pressed="false" title="VOID: while MIX is open, the radio drops its skin and every texture, glass, glow and decoration for flat dark blocks (the fastest thing a phone can draw). Same layout and controls. Tap again to bring the look back">VOID</button>` +
    (has("perfStats") ? `<button type="button" class="btn mx-perfbtn" data-t="perf" aria-pressed="false" title="A small readout of how the page and the music are keeping up: frame rate, the longest freeze, and whether notes arrive on time. Try it with LITE and VOID on and off">PERF</button>` : "") +
    `<div class="rd-btn mx-resetall"><button type="button" data-t="reset" aria-label="Reset everything in MIX for this station" title="Everything back: sound and EQ, this station's style and groove, and the effects"></button><small>RESET ALL</small></div></div><p class="mx-bypnote" role="status" hidden>ORIGINAL: you're hearing the station as it is. Your mix comes back when you let go.</p>`;
  // SOUND
  // DEF: the engine's SOUND defaults (its keys decide which knobs exist); presets: [{id, name, sound}]; rooms: [{id, name}]
  const DEF = radio.soundDefaults(), presets = has("soundPresets") ? radio.soundPresets() : [], rooms = has("rooms") ? radio.rooms() : [];
  // TONE: one knob per SOUND key: [key, caption, low-end caption, high-end caption, tooltip]; keys not in DEF are dropped
  const TONE = [["realism", "REALISM", "MIN", "MAX", "How real it sounds: speakers in a room, a little glue and air"],
    ["clarity", "CLARITY", "MIN", "MAX", "Less mud, more presence and air"], ["warmth", "WARMTH", "MIN", "MAX", "Rich, warm tape and console colour"],
    ["width", "SOUNDSTAGE", "MONO", "WIDE", "How wide the stereo picture is (the middle is as it is now)"],
    ["grain", "RADIO GRAIN", "OFF", "MAX", "Hiss, crackle, a narrower band and a little flutter"], ["rattle", "TRUNK RATTLE", "OFF", "MAX", "Loose panels buzzing on heavy sub bass"],
    ["ambience", "AMBIENCE", "OFF", "MORE", "Background sounds under the music: HEARYE's forests, taverns and caves, WYBC's concert-hall room, MDFM's vinyl crackle (the middle is the station's own)"]].filter(x => x[0] in DEF);
  // BANDS: the quick LOW / MID / HIGH knobs [key, caption, tooltip], only with setTone
  const BANDS = has("setTone") ? [["low", "LOW", "Low shelf (bass), -12 to +12 dB"], ["mid", "MID", "Mid (around 1 kHz), -12 to +12 dB"], ["high", "HIGH", "High shelf (treble), -12 to +12 dB"]] : [];
  // the parametric EQ (engine 1.25 E3): LOW CUT, LOW shelf, MID 1, MID 2, HIGH shelf, HIGH CUT; LOW / MID / HIGH above are the quick route to the same shelves and mid
  const EQB = has("eqBands") && has("setEq") && has("getEq") && has("eqResponse") ? radio.eqBands() : [];
  // EQS: each band's short name (its dot and the band picker); EQC: its colour (dot and curve)
  const EQS = { lc: "LC", ls: "LS", p1: "1", p2: "2", hs: "HS", hc: "HC" }, EQC = { lc: "#6ec3ff", ls: "#ffb347", p1: "#7fe22a", p2: "#ff6fd8", hs: "#ffd23f", hc: "#a99bff" };
  // eqCard: with the parametric EQ: a header (EQ ON, RESET EQ), the curve (a canvas and a dot button per band), the band strip
  // (picker, FREQ / GAIN / Q, SLOPE and ON for the cuts, RESET BAND) and QUICK TONE. An older engine gets LOW / MID / HIGH only.
  const eqCard = EQB.length ? `<div class="mx-card mx-eq" data-card="eq"><div class="mx-ch"><h4>EQ</h4><button type="button" class="btn mx-tg" data-eq-on aria-pressed="true" title="EQ on or off (off: the station with a flat EQ)">EQ ON</button><button type="button" class="btn mx-sb" data-eq-reset title="Every band back to flat">RESET EQ</button></div>` +
    `<div class="mx-eqg" data-eq-graph role="group" aria-label="EQ curve: drag a band's dot sideways for frequency and up or down for gain; pinch or scroll for Q"><canvas aria-hidden="true"></canvas>${EQB.map(b => `<button type="button" class="mx-eqn" data-band="${b.id}" tabindex="-1" style="--bc:${EQC[b.id] || "#fff"}"><span>${EQS[b.id] || b.id}</span></button>`).join("")}</div>` +
    `<div class="mx-eqstrip"><div data-eq-band></div><div class="mx-knobs mx-eqk">${knobHTML("eq-freq", "FREQ", "LO", "HI")}${knobHTML("eq-gain", "GAIN", "−12", "+12", "mx-bip")}${knobHTML("eq-q", "Q", "WIDE", "NARROW")}<div class="mx-eqcut"><span class="mx-rl">SLOPE</span><div data-eq-slope></div><button type="button" class="btn mx-tg" data-eq-bon aria-pressed="false">OFF</button></div><div class="mx-eqbr"><button type="button" class="btn mx-sb" data-eq-breset>RESET BAND</button></div></div></div>` +
    `${BANDS.length ? `<div class="mx-qt"><span class="mx-rl">QUICK TONE</span><div class="mx-knobs">${BANDS.map(([k, l]) => knobHTML("tone-" + k, l, "−12", "+12", "mx-bip")).join("")}</div></div>` : ""}</div>`
    : BANDS.length ? `<div class="mx-card mx-eq" data-card="eq"><h4>EQ</h4><div class="mx-knobs">${BANDS.map(([k, l]) => knobHTML("tone-" + k, l, "−12", "+12", "mx-bip")).join("")}</div></div>` : "";
  // SOUND: the EQ card, TONE knobs, ROOM (a room picker and its amount); the PRESET select sits in the section header
  if (SEC.sound) html += secHTML("sound", "SOUND", "ALL STATIONS", "EQ, tone and the room you're listening in. Double-tap a knob or a dot to put it back.",
    `<div class="mx-grid mx-soundgrid">${eqCard}` +
    `<div class="mx-card" data-card="tone"><h4>TONE</h4><div class="mx-knobs">${TONE.map(([k, l, lo, hi]) => knobHTML(k, l, lo, hi, k === "width" || k === "ambience" ? "mx-bip" : "")).join("")}</div></div>` +
    `${"room" in DEF ? `<div class="mx-card" data-card="room"><h4>ROOM</h4>${rooms.length ? `<div data-room></div>` : ""}<div class="mx-knobs">${knobHTML("room", "ROOM", "DRY", "FULL")}</div></div>` : ""}</div>`,
    presets.length ? `<label class="mx-fld">PRESET <select data-preset aria-label="Sound preset"></select></label>` : "");
  // STYLE: ten directions on a circle; PAD (one puck, an AMOUNT ring) or FADERS (one channel each, plus WHAT CHANGES lanes)
  // MIXK: [key, label, tip, angle] per direction from the engine; DIRS leaves out the old chaos key (GLITCH is an FX now).
  // PAD: the engine has the pad API and there are at least three directions to put round the circle.
  const MIXK = SEC.style ? radio.styleMixKeys() : [], DIRS = MIXK.filter(x => x[0] !== "chaos");
  const PAD = SEC.style && has("padToMix") && has("mixToPad") && has("setStylePad") && DIRS.length >= 3;
  // ANG: each direction's angle on the pad in degrees (0 = top, clockwise; the engine's, or evenly spread).
  // DCOL: its colour, whose hue is that angle.
  const ANG = Object.fromEntries(DIRS.map(([k, , , a], i) => [k, typeof a === "number" ? a : i * 360 / DIRS.length]));
  const DCOL = Object.fromEntries(DIRS.map(([k]) => [k, `hsl(${Math.round(ANG[k])},72%,62%)`]));
  // LANES: [key, label, tip] WHAT CHANGES lanes. STAGES: how far a style has gone (FEEL / DRUMS / BAND / FULL);
  // RINGS: [amount, label] for the stages drawn as rings on the pad.
  const LANES = SEC.style && has("styleLanes") && has("setStyleLanes") && has("getStyleLanes") ? radio.styleLanes() : [];
  const STAGES = SEC.style && has("styleStages") ? radio.styleStages() : [];
  const RINGS = STAGES.filter(s => s.ring).map(s => [s.ring, s.ringLabel || s.label2 || s.label]);
  const short = l => l.length > 8 ? l.slice(0, 4) + "." : l;   // ORCHESTRAL -> ORCH. on the pad (its full name is the button's label)
  // padHTML: the pad (an SVG filled in by P below, a label button per direction on a circle of 41%, a ghost puck for custom
  // blends, the puck itself as role=slider), the readout with the AMOUNT knob, and the custom-blend note
  const padHTML = !PAD ? "" : `<div class="mx-pad" data-view="pad" data-hook="style-pad"><div class="mx-padbox" data-padbox><svg class="mx-padsvg" viewBox="-100 -100 200 200" aria-hidden="true"></svg>` +
    DIRS.map(([k, l]) => { const a = ANG[k] * Math.PI / 180; return `<button type="button" class="mx-pl" data-dir="${k}" style="left:${(50 + 41 * Math.sin(a)).toFixed(2)}%;top:${(50 - 41 * Math.cos(a)).toFixed(2)}%;--dc:${DCOL[k]}" aria-label="${esc(l)}: pull toward it" title="${esc(l)}">${esc(short(l))}</button>`; }).join("") +
    `<div class="mx-puck mx-ghost" hidden aria-hidden="true"></div><div class="mx-puck" data-puck role="slider" tabindex="0" aria-label="Style blend" aria-valuemin="0" aria-valuemax="100"></div></div>` +
    `<div class="mx-padro"><output class="mx-padtxt" aria-live="polite"></output>${knobHTML("ring", "AMOUNT", "0", "ALL")}</div><p class="mx-hint mx-custom" hidden>Custom blend: see FADERS. Dragging the pad replaces it.</p></div>`;
  // STYLE: the blend card with the PAD / FADERS switch, SCALED flag, pad, fader bank, stage legend and WHAT CHANGES
  // lane knobs; data-view says which view each part belongs to
  if (SEC.style) html += secHTML("style", "STYLE", "THIS STATION", "Pull the song toward a style. Each station keeps its own; Save takes it.",
    `<div class="mx-grid mx-stylegrid"><div class="mx-card mx-stylecard" data-card="blend"><div class="mx-ch"><h4>STYLE BLEND</h4><div class="mx-view" data-hook="style-view"${PAD ? "" : " hidden"}></div><span class="mx-scaled" hidden title="The styles add up to more than 100%, so the engine scales them down; the small numbers are what plays">SCALED</span></div>${padHTML}` +
    `<div class="mx-fbank" data-view="faders" role="group" aria-label="Style faders">${DIRS.map(([k, l]) => faderHTML(k, l)).join("")}</div>` +
    `${STAGES.length ? `<p class="mx-hint mx-legend" data-view="faders" aria-hidden="true"><i data-s="feel"></i>FEEL <i data-s="drums"></i>DRUMS <i data-s="band"></i>BAND <i data-s="full"></i>FULL: how far each style has gone</p>` : ""}` +
    `${LANES.length ? `<div class="mx-lanes" data-view="faders"><span class="mx-rl">WHAT CHANGES</span><div class="mx-knobs">${LANES.map(([k, l]) => knobHTML("lane-" + k, l, "OFF", "ALL", "mx-lane", `${l} lane: how much the styles may change it`)).join("")}</div></div>` : ""}</div></div>`);
  // GROOVE & KEY
  // GK: [id, label, tip, meta] groove keys; GKS: their ids; GD: the defaults (a negative number = follow the song)
  const GK = SEC.groove ? radio.grooveKeys() : [], GKS = new Set(GK.map(x => x[0])), GD = SEC.groove && has("grooveDefaults") ? radio.grooveDefaults() : {};
  // OLDG: for engines without key metadata: [low caption, high caption, group]
  const OLDG = { swing: ["STRAIGHT", "SHUFFLE", "tempo"], length: ["×0.5", "×3", "tempo"], density: ["BARE", "BUSY", "drums"], fills: ["NONE", "LOTS", "drums"], drums: ["OFF", "LOUD", "levels"], humanize: ["TIGHT", "LOOSE", "feel"] };
  // one record per key: {id, label, tip, type, min, max, def, song, bipolar, group, captions, unit, scale}; old engines without meta get it from OLDG
  const GI = (has("grooveKeyInfo") ? radio.grooveKeyInfo() : GK.map(([id, label, tip, meta]) => ({ id, label, tip, ...(obj(meta) || {}) }))).map(m => {
    const o = OLDG[m.id], def = typeof GD[m.id] === "number" ? GD[m.id] : m.def;
    return { ...m, def, type: m.type || (o || (typeof def === "number" && !["bpm", "root", "feel"].includes(m.id)) ? "knob" : "choice"), group: m.group || (o ? o[2] : "drums"),
      captions: m.captions || (o ? [o[0], o[1]] : ["MIN", "MAX"]), song: m.song || (typeof def === "number" && def < 0 ? "SONG" : "") }; }).filter(m => GKS.has(m.id));
  const CAPS = { push: ["EARLY", "LATE"], pushK: ["EARLY", "LATE"], pushS: ["EARLY", "LATE"], pushH: ["EARLY", "LATE"], hatdens: ["LESS", "MORE"], hatswing: ["0", "HEAVY"], swing: ["0", "SHUFFLE"] };   // short enough for the knob's width
  for (const m of GI) if (CAPS[m.id]) m.captions = CAPS[m.id];
  // GIK: key info by id; gtip: tooltips by id
  const GIK = Object.fromEntries(GI.map(m => [m.id, m])), gtip = Object.fromEntries(GI.map(m => [m.id, m.tip || ""]));
  // GORD: the order the knobs appear in; GKNOB: the numeric keys shown as knobs, in that order
  const GORD = ["mel", "rep", "range", "harm", "swing", "length", "density", "hatdens", "fills", "ghosts", "push", "hatswing", "humanize", "accent", "pushK", "pushS", "pushH", "kick", "snare", "hats", "drums"];   // matrix.md 5.3
  const GKNOB = GI.filter(m => m.type === "knob" && typeof GD[m.id] === "number").sort((a, b) => (GORD.indexOf(a.id) + 1 || 99) - (GORD.indexOf(b.id) + 1 || 99));
  // capFix: "x2" -> "×2" in captions
  const capFix = s => String(s).replace(/^x(?=\d)/, "×");
  // GSUB: the DRUMS card's sub-groups [group, heading]
  const GSUB = [["drums", "PATTERN"], ["feel", "FEEL"], ["levels", "LEVELS"]];
  const GLAB = { drums: "ALL", hats: "HATS", kick: "KICK", snare: "SNARE", pushK: "KICK", pushS: "SNARE", pushH: "HATS" };   // short captions inside their group
  const GARIA = { drums: "Drums level, all of the kit", hats: "Hats level", kick: "Kick level", snare: "Snare level", pushK: "Kick push", pushS: "Snare push", pushH: "Hat push", hatdens: "Hat density" };
  const DEFCAP = { push: "ON", accent: "AS IS", humanize: "OFF", ghosts: "OFF", mel: "AS IS", rep: "AS IS", range: "AS IS", harm: "AS IS" };
  // kw(m): a groove knob with its button: SONG / AS IS / DEF (or FOLLOW for a part that follows the main push), pressed
  // while the key follows the song or its default
  const kw = m => `<div class="mx-kw">${knobHTML("g-" + m.id, GLAB[m.id] || m.label, capFix(m.captions[0]), capFix(m.captions[1]), m.bipolar ? "mx-bip" : "", GARIA[m.id] || "")}` +
    `<button type="button" class="btn mx-song" data-song="${m.id}" aria-pressed="true" title="${esc(m.song ? (m.song === "FOLLOW" ? "Follow the main setting" : "Back to the song's own") : "Back to the default")}" aria-label="${esc((GARIA[m.id] || m.label) + ": " + (m.song ? (m.song === "FOLLOW" ? "follow" : "the song's own") : "default"))}">${m.song || DEFCAP[m.id] || "DEF"}</button></div>`;
  // 1.31 BEAT: a one-bar drum pattern that steers the song's drums (its own card in Groove & Key)
  const BT = SEC.groove && has("setBeat") && has("beatInfo"), BTI = BT ? radio.beatInfo() : null;
  // BT_TOOLS: the paint tools [cell value, label, tooltip]: 2 hit, 3 loud, 1 soft (a ghost), -1 rest, 0 erase (the song decides)
  const BT_TOOLS = [["2", "● HIT", "Play here"], ["3", "▲ LOUD", "Play here, accented"], ["1", "· SOFT", "Play here, softly (a ghost note)"], ["-1", "✕ REST", "Keep this step quiet"], ["0", "ERASE", "No opinion: the song decides"]];
  // beatHTML: the INFLUENCE knob, BASS FOLLOWS KICK and FOLLOW BREAKS, the tool picker, a 16-step row per lane (role=grid,
  // focus roves in it), COPY SONG, a START FROM preset list, CLEAR and a live note
  const beatHTML = !BT ? "" : `<div class="mx-card mx-beat" data-card="beat" id="${mkid("gc-beat")}"><h4>BEAT</h4>` +
    `<div class="mx-bt-top"><div class="mx-knobs">${knobHTML("beat-inf", "INFLUENCE", "OFF", "EXACT", "", "Beat influence")}</div>` +
    `<div class="mx-bt-sw"><button type="button" class="btn mx-tg" data-bt="bass" aria-pressed="false" title="The song's bass hits move toward your kicks (as much as INFLUENCE says). Genre bass lines like reese and wobble keep their own rhythm.">BASS FOLLOWS KICK</button>` +
    `<button type="button" class="btn mx-tg" data-bt="follow" aria-pressed="true" title="On: the song's intros and breaks stay without drums. Off: the beat plays through them too.">FOLLOW BREAKS</button></div></div>` +
    `<div class="mx-bt-tools" data-bt-tools></div>` +
    `<div class="mx-bt-grid" role="grid" aria-label="Beat pattern: one bar of 16 steps">${BTI.lanes.map(([k, l]) => `<div class="mx-bt-lane" role="row" data-lane="${k}"><span class="mx-bt-ln" role="rowheader">${esc(l)}</span><div class="mx-bt-cells">${Array.from({ length: 16 }, (_, i) => `<button type="button" class="mx-bt-c" role="gridcell" tabindex="-1" data-lane="${k}" data-i="${i}"></button>`).join("")}</div></div>`).join("")}</div>` +
    `<div class="mx-bt-acts"><button type="button" class="btn mx-sb" data-bt-copy title="Fill the grid with what the song on air is playing in this bar">COPY SONG</button>` +
    `<label class="mx-fld mx-bt-pre"><span class="mx-vh">Start from a pattern</span><select data-bt-pre><option value="">START FROM…</option>${BTI.presets.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join("")}</select></label>` +
    `<button type="button" class="btn mx-sb" data-bt-clear title="Empty every step (the song decides)">CLEAR</button></div>` +
    `<p class="mx-bt-note" data-bt-note aria-live="polite"></p></div>`;
  // gTempoK / gMelK: the knobs in the TEMPO & TIME and MELODY cards; gPushPart: per-part pushes, folded under PUSH EACH PART
  const gTempoK = GKNOB.filter(m => m.group === "tempo"), gMelK = GKNOB.filter(m => m.group === "melody"), gPushPart = new Set(["pushK", "pushS", "pushH"]);
  // GROOVE & KEY: card tabs (narrow layouts), TEMPO & TIME (the BPM spinbutton with - / + / TAP / SONG, TIME and FEEL choices,
  // tempo knobs), KEY (root and mode), MELODY, DRUMS (PATTERN / FEEL / LEVELS) and BEAT. The hint mentions melody when it's there.
  if (SEC.groove) html += secHTML("groove", "GROOVE &amp; KEY", "THIS STATION", gMelK.length ? "Tempo, time, key, melody and drums. SONG and AS IS follow the song as written." : "Tempo, time, key and drums. SONG follows the song as written.",
    `<div class="mx-gtabs" data-gtabs></div><div class="mx-grid mx-gcards">` +
    `<div class="mx-card" data-card="tempo" id="${mkid("gc-tempo")}"><h4>TEMPO &amp; TIME</h4>${GKS.has("bpm") ? `<div class="mx-num" data-key="bpm"><span class="mx-numl" id="${mkid("bpml")}">BPM</span><button type="button" class="btn" data-d="-1" aria-label="Slower">−</button><div class="lcd mx-lcd" role="spinbutton" tabindex="0" aria-labelledby="${mkid("bpml")}" aria-valuemin="40" aria-valuemax="220" title="${esc(gtip.bpm || "")}"></div><button type="button" class="btn" data-d="1" aria-label="Faster">+</button><button type="button" class="btn" data-tap title="Tap the beat">TAP</button>${songBtn("bpm", "tempo")}</div>` : ""}` +
    `${GKS.has("meter") ? `<div class="mx-row"><span class="mx-rl">TIME</span><div data-g="meter"></div></div>` : ""}${GKS.has("feel") ? `<div class="mx-row"><span class="mx-rl">FEEL</span><div data-g="feel"></div></div>` : ""}` +
    `${gTempoK.length ? `<div class="mx-knobs mx-kwrap">${gTempoK.map(kw).join("")}</div>` : ""}</div>` +
    `<div class="mx-card" data-card="key" id="${mkid("gc-key")}"><h4>KEY</h4>${GKS.has("root") ? `<div data-g="root"></div>` : ""}${GKS.has("mode") ? `<label class="mx-fld">MODE <select data-g="mode" title="${esc(gtip.mode || "")}"></select></label>` : ""}</div>` +
    `${gMelK.length ? `<div class="mx-card mx-melody" data-card="melody" id="${mkid("gc-melody")}"><h4>MELODY</h4><div class="mx-knobs mx-kwrap">${gMelK.map(kw).join("")}</div></div>` : ""}` +
    `<div class="mx-card mx-drums" data-card="drums" id="${mkid("gc-drums")}"><h4>DRUMS</h4>${GSUB.map(([g, l]) => { const ks = GKNOB.filter(m => m.group === g || (g === "drums" && !["tempo", "feel", "levels", "melody"].includes(m.group)));
      if (!ks.length) return ""; const main = ks.filter(m => !gPushPart.has(m.id)), part = ks.filter(m => gPushPart.has(m.id));
      return `<div class="mx-sub" data-sub="${g}"><h5>${l}</h5><div class="mx-knobs mx-kwrap">${main.map(kw).join("")}</div>${part.length ? `<details class="mx-more"><summary>PUSH EACH PART</summary><div class="mx-knobs mx-kwrap">${part.map(kw).join("")}</div></details>` : ""}</div>`; }).join("")}</div>${beatHTML}</div>`);
  // FX (GLITCH is a trick: it lives in TRICKS with TAPE STOP and SPIN BACK)
  // FK: [key, label, tip]; FKS: their ids; FD: defaults. FGROUPS: [card, heading, keys]. FMORE: keys in no group (a newer
  // engine's) go in a MORE card; flab: key -> [label, tip].
  const FK = SEC.fx ? radio.fxKeys() : [], FKS = new Set(FK.map(x => x[0])), FD = SEC.fx && has("fxDefaults") ? radio.fxDefaults() : {};
  const FGROUPS = [["space", "SPACE", ["echo", "reverb"]], ["move", "MOVEMENT", ["chorus", "flange", "phaser", "warble"]], ["colour", "COLOUR", ["drive", "crush"]],
    ["filter", "FILTER", ["filter"]], ["rhythm", "RHYTHM", ["gate", "pump"]]];
  const grouped = new Set([...FGROUPS.flatMap(g => g[2]), "glitch"]), FMORE = FK.map(x => x[0]).filter(k => !grouped.has(k)), flab = Object.fromEntries(FK.map(([k, l, t]) => [k, [l, t]]));
  // FLO: end captions other than OFF / MAX (the filter: LP on the left, HP on the right, off in the middle)
  const FLO = { filter: ["LP", "HP"] }, hasTricks = has("tapeStop") || has("spinBack") || FKS.has("glitch");
  // FX: a card per group (COLOUR also holds the underwater switch, data-uw), MORE, and TRICKS (TAPE STOP, SPIN BACK, GLITCH)
  if (SEC.fx) html += secHTML("fx", "FX", "ALL STATIONS", "Echo, gate and pump follow the beat. Off (the filter in the middle) is the station as it is.",
    `<div class="mx-grid mx-fxgrid">${FGROUPS.map(([g, l, ks]) => { const here = ks.filter(k => FKS.has(k)); if (!here.length && g !== "colour") return "";
      return `<div class="mx-card mx-grp" data-card="${g}"><h4>${l}</h4><div class="mx-knobs">${here.map(k => knobHTML("fx-" + k, flab[k][0], (FLO[k] || ["OFF"])[0], (FLO[k] || ["", "MAX"])[1], k === "filter" ? "mx-hero mx-bip" : "")).join("")}${g === "colour" ? `<div class="mx-uw" data-uw></div>` : ""}</div></div>`; }).join("")}` +
    `${FMORE.length ? `<div class="mx-card mx-grp" data-card="more"><h4>MORE</h4><div class="mx-knobs">${FMORE.map(k => knobHTML("fx-" + k, flab[k][0], "OFF", "MAX")).join("")}</div></div>` : ""}` +
    `${hasTricks ? `<div class="mx-card mx-grp mx-tricks" data-card="tricks"><h4>TRICKS</h4><div class="mx-pads">${has("tapeStop") ? `<button type="button" class="btn mx-padbtn" data-t="tape" title="The music slows to a stop, then drops back in on the beat">TAPE STOP</button>` : ""}${has("spinBack") ? `<button type="button" class="btn mx-padbtn" data-t="spin" title="Spins the music backwards like a record, then drops back in on the beat">SPIN BACK</button>` : ""}</div>` +
      `${FKS.has("glitch") ? `<div class="mx-knobs">${knobHTML("fx-glitch", flab.glitch[0], "OFF", "MAX", "chaos")}</div>` : ""}</div>` : ""}</div>`);
  // the close button at the foot
  html += `<button type="button" class="btn mx-close">▲ Close ${esc(title)}</button></div>`;

  // make the panel the drawer: drop the old pop-out classes (pop, tunepop), label it as a region, start closed;
  // the title goes in as text, so any title is safe
  panel.classList.remove("pop", "tunepop"); panel.classList.add("mixdrawer"); panel.setAttribute("role", "region"); panel.setAttribute("aria-labelledby", mkid("title"));
  panel.hidden = true; panel.innerHTML = html; panel.querySelector(`#${mkid("title")}`).textContent = title;
  // $p / $$p: one / all matches inside the panel
  const $p = s => panel.querySelector(s), $$p = s => [...panel.querySelectorAll(s)];
  const qc = new Map(), $c = s => { let e = qc.get(s); if (!e || !e.isConnected) { e = panel.querySelector(s); if (e) qc.set(s, e); } return e; };   // 1.26: cached lookups for per-frame paints
  const S = {};   // per section: { paint(), reset(), moved() }
  const painted = {};   // 1.26: when MIX last painted a section itself (so the engine's echo of the same change doesn't paint it twice)
  // visible(el): on screen (the drawer open and el laid out). hz(f): 1500 -> "1.5k", 10000 -> "10k", 250 -> "250".
  const visible = el => !!el && !panel.hidden && el.getClientRects().length > 0;
  const hz = f => f >= 1000 ? (f / 1000).toFixed(f < 10000 ? (f % 1000 ? 1 : 0) : 0).replace(/\.0$/, "") + "k" : String(Math.round(f));

  // ---------- SOUND: tone, room, presets, and the EQ (curve + six bands + the quick LOW / MID / HIGH) ----------
  if (SEC.sound) {
    // st: the SOUND store; a saved sound is applied now (setSound returns the full, clamped settings)
    const st = lazy(store) || ls("mdfmSound"); let cur = radio.getSound(); const saved = obj(st.get()); if (saved) cur = radio.setSound(saved);
    // ts / es: the tone and EQ stores; num(v, d): a finite dB value clamped to +-12, else d
    const ts = lazy(toneStore) || ls("mdfmTone"), es = lazy(eqStore) || ls("mdfmEq"), num = (v, d) => typeof v === "number" && Number.isFinite(v) ? clamp(v, -12, 12) : d;
    // tone: {low, mid, high} dB, the quick tone and what mdfmTone saves
    let tone = { low: 0, mid: 0, high: 0 };
    // EQON: the parametric EQ exists; EQD: its defaults
    const EQON = EQB.length > 0, EQD = EQON && has("eqDefaults") ? radio.eqDefaults() : null;
    // toneOf(e): LOW / MID / HIGH from an EQ: the gains of the bands tagged tone low / mid / high
    const toneOf = e => { const b = id => (EQB.find(x => x.tone === id) || {}).id, g = id => num(e[b(id)] && e[b(id)].gain, 0); return { low: g("low"), mid: g("mid"), high: g("high") }; };
    // restore: a saved EQ wins; otherwise an older saved mdfmTone goes through setTone (which moves the same bands)
    if (EQON) { const se = obj(es.get()); if (se) radio.setEq(se); else { const t0 = obj(ts.get()); if (t0) radio.setTone({ low: num(t0.low, 0), mid: num(t0.mid, 0), high: num(t0.high, 0) }); }
      tone = toneOf(radio.getEq()); }
    // no parametric EQ: the saved tone (or the engine's) is applied as it is
    else if (BANDS.length) { const t0 = obj(ts.get()) || (has("getTone") ? radio.getTone() : {}) || {};
      tone = { low: num(t0.low, 0), mid: num(t0.mid, 0), high: num(t0.high, 0) }; radio.setTone(tone); }
    // same(a, b): two sound settings match (to .005; the room type only matters while a room is on). pct: 0..1 -> 0..100.
    const same = (a, b) => Object.keys(DEF).every(k => k === "roomType" ? (a.room === 0 && b.room === 0) || a.roomType === b.roomType : Math.abs(a[k] - b[k]) < .005);
    const pct = v => Math.round(v * 100);
    // set(o): apply part of the sound, save it, repaint, update the section dots (led() is defined further down)
    const set = o => { cur = radio.setSound(o); st.set(cur); S.sound.paint(); led(); };
    const K = {};
    // a knob per TONE key, 0..100 % of the engine's 0..1; SOUNDSTAGE and AMBIENCE are bipolar (50 = as is / the station's own)
    for (const [k, , , , tip] of TONE) { const bip = k === "width" || k === "ambience";
      K[k] = Knob($p(`.mx-k[data-key="${k}"]`), { min: 0, max: 100, step: 1, def: Math.round(DEF[k] * 100), center: bip ? 50 : null, tip,
        fmt: v => k === "width" ? (Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "−" + (50 - v) : "+" + (v - 50)) : k === "ambience" ? (v === 0 ? "OFF" : Math.abs(v - 50) < 1 ? "OWN" : v + "%") : v === 0 ? "OFF" : v + "%",
        text: v => k === "width" ? (v < 48 ? `narrower (${v})` : v > 52 ? `wider (${v})` : "as it is") : k === "ambience" ? (v === 0 ? "off" : v < 48 ? `quieter (${v})` : v > 52 ? `louder (${v})` : "the station's own") : v === 0 ? "off" : v + " percent",
        onInput: v => set({ [k]: v / 100 }) }); }
    if ("room" in DEF) K.room = Knob($p(`.mx-k[data-key="room"]`), { min: 0, max: 100, step: 1, def: Math.round(DEF.room * 100), tip: "How much of the listening room you hear (pick the room above; tap it again for dry)",
      fmt: v => v === 0 ? "DRY" : v + "%", onInput: v => set({ room: v / 100 }) });
    // the room picker: the room that's on again turns the room off (dry); another one switches to it at the same amount (or 50%)
    const roomSeg = $p("[data-room]") ? Seg($p("[data-room]"), rooms.map(r => [r.id, r.name]), v => { if (cur.room > 0 && cur.roomType === v) set({ room: 0 }); else set({ roomType: v, room: cur.room || .5 }); }, "Listening room") : null;
    // the EQ is saved whole (mdfmEq) and as mdfmTone {low, mid, high}: the receiver re-applies mdfmTone when it mounts, so both must agree
    const saveTone = () => { if (EQON) { const e = radio.getEq(); es.set(e); tone = toneOf(e); } ts.set(tone); };
    const TB = {};
    // TB: the quick tone knobs, -12..+12 dB in 0.5 dB steps, through setTone (the EQ's LS / P1 / HS when it has one)
    for (const [b, , tip] of BANDS) TB[b] = Knob($p(`.mx-k[data-key="tone-${b}"]`), { min: -12, max: 12, step: .5, def: 0, center: 0, tip,
      fmt: v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1), text: v => `${v > 0 ? "+" : ""}${v} dB`,
      onInput: v => { tone[b] = v; radio.setTone({ [b]: v }); saveTone(); S.sound.paint(); led(); } });
    // the PRESET select: the engine's presets plus Custom (shown when nothing matches)
    const pre = $p("[data-preset]");
    if (pre) { for (const p of [...presets, { id: "custom", name: "Custom" }]) { const o = doc.createElement("option"); o.value = p.id; o.textContent = p.name; pre.appendChild(o); }
      pre.addEventListener("change", () => { const p = presets.find(x => x.id === pre.value); if (p) set(p.sound); }); }   // a preset sets tone and room, never the EQ
    // E: the EQ controller (mountEq below); after each EQ change it saves, repaints and updates the dots
    const E = EQON ? mountEq(() => { saveTone(); S.sound.paint(); led(); }) : null;
    // toneMoved(): a quick tone band is off 0 dB
    const toneMoved = () => BANDS.some(([b]) => Math.abs(tone[b]) > .01);
    // S.sound: paint() syncs every control from the engine; reset() puts sound, EQ and tone back; moved() lights the section dot;
    // get / set for the returned API; eq lets eqWake() size the curve when it comes on screen
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
    // mountEq(changed): wires the EQ card; changed() runs after every engine change. Returns { paint, moved, size, redraw, specOn }.
    function mountEq(changed) {
      // g: the graph; cv / cx: its canvas and 2D context (null without canvas); nodes: band id -> its dot button
      const g = $p("[data-eq-graph]"), cv = g.querySelector("canvas"), cx = cv.getContext && cv.getContext("2d"), nodes = Object.fromEntries($$p(".mx-eqn").map(n => [n.dataset.band, n]));
      // BI: band info by id (eqBands(): {id, label, type, tone, freq: [lo, hi], gain, q: [lo, hi], slopes, def});
      // isCut: LC / HC (they have slopes); hasQ / hasGain: the band has that parameter
      const BI = Object.fromEntries(EQB.map(b => [b.id, b])), isCut = b => !!BI[b].slopes, hasQ = b => !!BI[b].q, hasGain = b => !!BI[b].gain;
      // a saved band this engine doesn't have falls back to MID 1
      if (!BI[ui.eqBand]) ui.eqBand = BI.p1 ? "p1" : EQB[0].id;
      // the plot: 20 Hz to 20 kHz on a log x axis, +-15 dB on y; curves are sampled at 192 log-spaced frequencies (FQ)
      const FMIN = 20, FMAX = 20000, DB = 15, NPT = 192, FQ = new Float32Array(NPT); for (let i = 0; i < NPT; i++) FQ[i] = FMIN * Math.pow(FMAX / FMIN, i / (NPT - 1));
      // W / H: the graph's size in CSS px; dpr: canvas pixels per CSS px; drawT: the pending frame; specT: the spectrum timer;
      // eq: the engine's EQ as last read
      let W = 0, H = 0, dpr = 1, drawT = 0, specT = 0, eq = radio.getEq();
      // xOf / fOf: frequency <-> x (log); yOf / dOf: dB <-> y, with 8 px kept free at the top and bottom
      const xOf = f => Math.log(f / FMIN) / Math.log(FMAX / FMIN) * W, fOf = x => FMIN * Math.pow(FMAX / FMIN, clamp(x / W, 0, 1));
      const yOf = d => H / 2 - d / DB * (H / 2 - 8), dOf = y => (H / 2 - y) / (H / 2 - 8) * DB;
      // eqPend: changes not yet applied, merged per band (a frame that moves freq then gain keeps both)
      let eqPend = null; const mergeP = (a, b) => { const o = { ...a }; for (const k in b) o[k] = b[k] && typeof b[k] === "object" ? { ...(o[k] || {}), ...b[k] } : b[k]; return o; };
      // put(p): queue a partial EQ change; applied through live() (once per frame while dragging), then changed()
      const put = p => { eqPend = eqPend ? mergeP(eqPend, p) : p; live(g, () => { const q = eqPend; eqPend = null; if (q) { eq = radio.setEq(q); changed(); } }); };
      // resp(b): band b's curve in dB at FQ (the whole EQ without b); flat if the engine throws
      const resp = b => { try { return radio.eqResponse(FQ, b); } catch (e) { return new Float32Array(NPT); } };
      // nodeY(b): a dot's height: its gain for shelves and peaks; for a cut, the curve's level at its frequency (0 when off)
      const nodeY = b => { const o = eq[b]; if (hasGain(b)) return yOf(eq.on === false ? 0 : o.gain); const r = radio.eqResponse([o.freq], b); return yOf(o.on && eq.on !== false ? clamp(r[0] || 0, -DB, DB) : 0); };
      // draw(): the backing, the faint live spectrum, the grid and labels, each active band's curve (the selected one filled),
      // the total curve (dashed grey with the EQ off), then places and labels the dots. Colours follow the skin's --lcd.
      function draw() { drawT = 0; if (!cx || !W) return; const css = win.getComputedStyle(panel), lcd = (css.getPropertyValue("--lcd") || "").trim() || "#00e000";
        cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
        cx.fillStyle = "rgba(0,0,0,.42)"; cx.fillRect(0, 0, W, H);
        const sp = radio.isOn && radio.isOn() && has("getSpectrum") ? radio.getSpectrum() : null;   // the live spectrum, faint, behind everything
        // the spectrum's bins are spread log-spaced from 42 Hz to 15 kHz and drawn as faint bars from the bottom
        if (sp && sp.length) { cx.fillStyle = "rgba(255,255,255,.07)"; const n = sp.length; for (let i = 0; i < n; i++) { const f0 = 42 * Math.pow(15000 / 42, i / n), f1 = 42 * Math.pow(15000 / 42, (i + 1) / n), h = clamp(sp[i], 0, 1) * (H - 4);
          cx.fillRect(xOf(f0) + 1, H - h, Math.max(1, xOf(f1) - xOf(f0) - 2), h); } }
        cx.lineWidth = 1; cx.font = "10px Tahoma,Verdana,sans-serif"; cx.textBaseline = "top";
        // grid: frequency lines (labels only at 100, 1k and 10k on a graph narrower than 300 px), then +-6 / +-12 dB
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = Math.round(xOf(f)) + .5; cx.strokeStyle = "rgba(255,255,255,.09)"; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
          if (W > 300 || [100, 1000, 10000].includes(f)) { cx.fillStyle = "rgba(255,255,255,.38)"; cx.fillText(hz(f), x + 3, H - 13); } }
        for (const d of [-12, -6, 6, 12]) { const y = Math.round(yOf(d)) + .5; cx.strokeStyle = "rgba(255,255,255,.06)"; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
          cx.fillStyle = "rgba(255,255,255,.32)"; cx.fillText((d > 0 ? "+" : "") + d, 3, y - (d > 0 ? -2 : 12)); }
        // 0 dB, brighter
        { const y = Math.round(yOf(0)) + .5; cx.strokeStyle = "rgba(255,255,255,.28)"; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
        // line(a, col, w, dash): stroke a curve sampled at FQ (clamped just past +-15 dB)
        const line = (a, col, w, dash) => { cx.strokeStyle = col; cx.lineWidth = w; cx.setLineDash(dash || []); cx.beginPath(); for (let i = 0; i < NPT; i++) { const x = xOf(FQ[i]), y = yOf(clamp(a[i], -DB - 2, DB + 2)); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); cx.setLineDash([]); };
        const on = eq.on !== false;
        // the bands' own curves: cuts that are off and flat bands are skipped
        if (on) for (const b of EQB) { const o = eq[b.id]; if ((isCut(b.id) && !o.on) || (hasGain(b.id) && Math.abs(o.gain) < .05)) continue;
          const r = resp(b.id); cx.globalAlpha = b.id === ui.eqBand ? .75 : .4; line(r, EQC[b.id] || "#fff", 1.25); cx.globalAlpha = 1;
          if (b.id === ui.eqBand) { cx.fillStyle = (EQC[b.id] || "#fff") + "22"; cx.beginPath(); cx.moveTo(0, yOf(0)); for (let i = 0; i < NPT; i++) cx.lineTo(xOf(FQ[i]), yOf(clamp(r[i], -DB - 2, DB + 2))); cx.lineTo(W, yOf(0)); cx.closePath(); cx.fill(); } }
        // the total response
        line(on ? resp() : new Float32Array(NPT), on ? lcd : "rgba(255,255,255,.45)", 2.25, on ? null : [5, 4]);
        // the dots, with an aria-label that reads the band's settings
        for (const b of EQB) { const n = nodes[b.id], o = eq[b.id]; if (!n) continue; n.style.left = xOf(o.freq) + "px"; n.style.top = nodeY(b.id) + "px";
          n.classList.toggle("off", (isCut(b.id) && !o.on) || !on); n.classList.toggle("sel", b.id === ui.eqBand);
          n.setAttribute("aria-label", `${b.label}: ${hz(o.freq)}Hz${hasGain(b.id) ? `, ${o.gain > 0 ? "+" : ""}${o.gain.toFixed(1)} dB` : isCut(b.id) ? (o.on ? `, ${o.slope} dB per octave` : ", off") : ""}`); } }
      // redraw(): one draw per frame at most
      const redraw = () => { if (!drawT) drawT = (win.requestAnimationFrame || (f => setTimeout(f, 16)))(draw); };
      // size(): match the canvas to its box at device pixels (at most 3x, 2x in LITE) and draw; a hidden drawer measures 0,
      // so it also runs when the drawer opens (eqWake)
      const size = () => { const r = g.getBoundingClientRect(); if (!r.width) return; dpr = Math.min(win.MDFM_lite ? 2 : 3, win.devicePixelRatio || 1); W = r.width; H = r.height;
        const bw = Math.round(W * dpr), bh = Math.round(H * dpr); if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; } draw(); };
      if (typeof ResizeObserver === "function") new ResizeObserver(size).observe(g);
      // 15 fps spectrum, only while the drawer is open, the graph on screen and the radio on
      const spec = () => { specT = 0; if (!panel.hidden && !doc.hidden && visible(g) && radio.isOn && radio.isOn()) { if (win.MDFM_lite) { specT = setTimeout(spec, 500); return; } draw(); specT = setTimeout(spec, 66); } };   // 1.26: LITE leaves the live spectrum out
      const specOn = () => { if (!specT) specT = setTimeout(spec, 66); };
      // band strip: picker, FREQ / GAIN / Q knobs (or SLOPE 12 / 24 and ON for the cuts), RESET BAND
      const pick = Seg($p("[data-eq-band]"), EQB.map(b => [b.id, EQS[b.id] || b.id, b.label]), v => { ui.eqBand = v; saveUI(); paint(); }, "EQ band");
      // lf / uf: knob units 0..1000 <-> the band's frequency, log across its range (even per octave);
      // lq / uq: the same for Q (0.3..8 unless the band says otherwise)
      const lf = (b, u) => { const [a, z] = BI[b].freq; return a * Math.pow(z / a, u / 1000); }, uf = (b, f) => { const [a, z] = BI[b].freq; return Math.round(Math.log(f / a) / Math.log(z / a) * 1000); };
      const lq = (b, u) => { const [a, z] = BI[b].q || [.3, 8]; return a * Math.pow(z / a, u / 1000); }, uq = (b, q) => { const [a, z] = BI[b].q || [.3, 8]; return Math.round(Math.log(q / a) / Math.log(z / a) * 1000); };
      // bnow(): the selected band; dflt(b): its defaults
      const bnow = () => ui.eqBand, dflt = b => (EQD && EQD[b]) || BI[b].def || {};
      // FREQ / GAIN / Q for the selected band; each knob's reset puts only its own parameter back; Enter takes Hz or Q typed in
      const KF = Knob($p('.mx-k[data-key="eq-freq"]'), { min: 0, max: 1000, step: 1, def: 500, tip: "The band's frequency", fmt: u => hz(lf(bnow(), u)) + "Hz", text: u => hz(lf(bnow(), u)) + " hertz",
        onInput: u => put({ [bnow()]: { freq: +lf(bnow(), u).toFixed(1) } }), onReset: () => put({ [bnow()]: { freq: dflt(bnow()).freq } }), toEdit: u => Math.round(lf(bnow(), u)), fromEdit: f => uf(bnow(), clamp(f, ...BI[bnow()].freq)) });
      const KG = Knob($p('.mx-k[data-key="eq-gain"]'), { min: -12, max: 12, step: .5, def: 0, center: 0, tip: "The band's boost or cut", fmt: v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1), text: v => `${v > 0 ? "+" : ""}${v} dB`,
        onInput: v => put({ [bnow()]: { gain: v } }), onReset: () => put({ [bnow()]: { gain: 0 } }) });
      const KQ = Knob($p('.mx-k[data-key="eq-q"]'), { min: 0, max: 1000, step: 1, def: 300, tip: "How wide the band is: low Q is broad, high Q is narrow", fmt: u => lq(bnow(), u).toFixed(2), text: u => "Q " + lq(bnow(), u).toFixed(2),
        onInput: u => put({ [bnow()]: { q: +lq(bnow(), u).toFixed(3) } }), onReset: () => put({ [bnow()]: { q: dflt(bnow()).q } }), toEdit: u => +lq(bnow(), u).toFixed(2), fromEdit: q => uq(bnow(), clamp(q, ...(BI[bnow()].q || [.3, 8]))) });
      // SLOPE (cuts only); choosing one also turns the cut on
      const slope = Seg($p("[data-eq-slope]"), [["12", "12 dB"], ["24", "24 dB"]], v => put({ [bnow()]: { slope: +v, on: true } }), "Slope, dB per octave");
      // bon: the selected cut's ON / OFF; onB: EQ ON for the whole EQ (eqBypass where the engine has it)
      const bon = $p("[data-eq-bon]"), onB = $p("[data-eq-on]");
      bon.addEventListener("click", () => put({ [bnow()]: { on: !eq[bnow()].on } }));
      onB.addEventListener("click", () => { eq = has("eqBypass") ? (radio.eqBypass(eq.on !== false), radio.getEq()) : radio.setEq({ on: eq.on === false }); changed(); });
      // resetBand(b): back to its defaults; a cut is switched off
      const resetBand = b => put({ [b]: { ...dflt(b), ...(isCut(b) ? { on: false } : {}) } });
      $p("[data-eq-breset]").addEventListener("click", () => resetBand(bnow()));
      $p("[data-eq-reset]").addEventListener("click", () => { eq = radio.resetEq(); changed(); });
      // moved(): the EQ isn't flat (switched off, a cut on, or a gain off its default)
      const moved = () => { const e = radio.getEq(); if (e.on === false) return true;
        return EQB.some(b => { const o = e[b.id], d = dflt(b.id); return isCut(b.id) ? !!o.on : Math.abs(o.gain - (d.gain || 0)) > .01; }); };
      // paint(): the band strip for the selected band (controls it lacks are hidden), EQ ON, then redraw and the spectrum
      function paint() { eq = radio.getEq(); const b = bnow(), o = eq[b];
        pick.set(b); KF.set(uf(b, o.freq)); KF.state({ moved: Math.abs(o.freq - (dflt(b).freq || o.freq)) > .5 });
        KG.el.hidden = !hasGain(b); if (hasGain(b)) { KG.set(o.gain); KG.state({ moved: Math.abs(o.gain) > .01 }); }
        KQ.el.hidden = !hasQ(b); if (hasQ(b)) { KQ.set(uq(b, o.q)); KQ.state({ moved: Math.abs(o.q - (dflt(b).q || o.q)) > .005 }); }
        $p(".mx-eqcut").hidden = !isCut(b); if (isCut(b)) { slope.set(String(o.slope)); bon.setAttribute("aria-pressed", String(!!o.on)); bon.textContent = o.on ? "ON" : "OFF"; bon.setAttribute("aria-label", `${BI[b].label} ${o.on ? "on" : "off"}`); }
        const eon = eq.on !== false; onB.setAttribute("aria-pressed", String(eon)); onB.textContent = eon ? "EQ ON" : "EQ OFF"; panel.querySelector(".mx-eq").classList.toggle("eqoff", !eon);
        redraw(); if (!panel.hidden) specOn(); }
      // the dots: x = frequency, y = gain (shelves and peaks; the cuts move sideways only); Q by pinch, wheel, Alt-drag or the Q knob
      // pts: pointerId -> last position (pinch); drag: {b, id, x0, y0, ox / oy (grab offset from the dot's centre), moved,
      // before (the band selected before this press), q0, alt (mouse Alt-drag sets Q)}; pinch: {d0 finger distance, q0};
      // lastTap: for a double tap, which resets the band
      const pts = new Map(); let drag = null, pinch = null, lastTap = { t: 0, b: "", x: 0, y: 0 };
      // gRect: the graph's box, measured at the first finger and reused until all have lifted
      let gRect = null; const local = e => { const r = gRect || g.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      // hit(x, y): the nearest dot within 23 px; the selected one gets 4 px extra so it wins a tie
      const hit = (x, y) => { let best = null, bd = 23; for (const b of EQB) { const n = nodes[b.id]; if (!n) continue; const d = Math.hypot(x - parseFloat(n.style.left), y - parseFloat(n.style.top)) - (b.id === ui.eqBand ? 4 : 0);
        if (d < bd) { bd = d; best = b.id; } } return best; };
      // select(b): make b the band in the strip
      const select = b => { if (b !== ui.eqBand) { ui.eqBand = b; saveUI(); paint(); } };
      // press: every pointer counts as a drag (dragOn) and is captured; one finger grabs the nearest dot, a second one pinches
      g.addEventListener("pointerdown", e => { if (e.pointerType === "mouse" && e.button !== 0) return; const [x, y] = local(e);
        if (!pts.size) gRect = g.getBoundingClientRect(); if (!pts.has(e.pointerId)) dragOn(); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { g.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault();
        if (pts.size === 2) { const pb = drag && !drag.moved && drag.before ? drag.before : ui.eqBand;   // a second finger: pinch the band (fingers apart = a wider band, lower Q) that was selected (the first finger only just landed)
          if (drag) nodes[drag.b].classList.remove("drag"); drag = null; if (!hasQ(pb)) return; select(pb); const [a, c] = [...pts.values()]; pinch = { d0: Math.max(24, Math.abs(a.x - c.x)), q0: eq[pb].q }; return; }
        if (pts.size > 1) return; const before = ui.eqBand, b = hit(x, y); if (!b) { drag = null; return; } select(b);
        drag = { b, id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: x - parseFloat(nodes[b].style.left), oy: y - parseFloat(nodes[b].style.top), moved: false, before, q0: eq[b].q, alt: e.altKey && e.pointerType === "mouse" };
        nodes[b].classList.add("drag"); });
      // move: pinch: Q = q0 x starting distance / distance now (horizontal, at least 24 px). Drag: a 3 px dead zone, then
      // Alt-drag sets Q (60 px up doubles it); otherwise x sets the frequency and y the gain (0.1 dB steps, 0 within .35 dB);
      // dragging a cut that is off turns it on
      g.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pts.size >= 2) { const [a, c] = [...pts.values()], d = Math.max(24, Math.abs(a.x - c.x)); put({ [ui.eqBand]: { q: +clamp(pinch.q0 * pinch.d0 / d, ...(BI[ui.eqBand].q || [.3, 8])).toFixed(3) } }); return; }
        if (!drag || drag.id !== e.pointerId) return; if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) return; drag.moved = true;
        const b = drag.b; if (drag.alt && hasQ(b)) { put({ [b]: { q: +clamp(drag.q0 * Math.pow(2, -(e.clientY - drag.y0) / 60), ...BI[b].q).toFixed(3) } }); return; }
        const [x, y] = local(e), p = { freq: +clamp(fOf(x - drag.ox), ...BI[b].freq).toFixed(1) };
        if (hasGain(b)) { let d = clamp(dOf(y - drag.oy), -12, 12); if (Math.abs(d) < .35) d = 0; p.gain = Math.round(d * 10) / 10; }
        if (isCut(b) && !eq[b].on) p.on = true; put({ [b]: p }); });
      // release: after a pinch the finger left behind does nothing; a tap selects (and turns an off cut on); a double tap on
      // the same dot resets the band
      const up = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (!pts.size) gRect = null; dragOff(); if (pinch) { if (pts.size < 2) pinch = null; return; }
        if (!drag || drag.id !== e.pointerId) return; const d = drag; drag = null; nodes[d.b].classList.remove("drag");
        if (e.type !== "pointerup" || d.moved) { lastTap.t = 0; return; }
        const t = performance.now(); if (t - lastTap.t < 300 && lastTap.b === d.b && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 12) { lastTap.t = 0; resetBand(d.b); return; }
        lastTap = { t, b: d.b, x: e.clientX, y: e.clientY }; if (isCut(d.b) && !eq[d.b].on) put({ [d.b]: { on: true } }); };
      g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up); g.addEventListener("lostpointercapture", up);
      // the wheel over a dot with Q: scrolling up narrows it (higher Q), 500 px of wheel doubles or halves it
      g.addEventListener("wheel", e => { const [x, y] = local(e), b = hit(x, y) || null; if (!b || !hasQ(b)) return; e.preventDefault(); select(b);
        put({ [b]: { q: +clamp(eq[b].q * Math.pow(2, -e.deltaY * .002), ...BI[b].q).toFixed(3) } }); }, { passive: false });
      // dots by keyboard: focus selects; Left / Right frequency x1.03 (Shift x1.12), Up / Down gain 0.5 dB (Shift 3), Delete resets
      for (const b of EQB) { const n = nodes[b.id]; if (!n) continue; n.addEventListener("focus", () => select(b.id));
        n.addEventListener("keydown", e => { const o = eq[b.id], fs = e.shiftKey ? 1.12 : 1.03; let p = null;
          if (e.key === "ArrowRight") p = { freq: clamp(o.freq * fs, ...b.freq) }; else if (e.key === "ArrowLeft") p = { freq: clamp(o.freq / fs, ...b.freq) };
          else if (hasGain(b.id) && (e.key === "ArrowUp" || e.key === "ArrowDown")) p = { gain: clamp(o.gain + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 3 : .5), -12, 12) };
          else if (e.key === "Delete" || e.key === "Backspace") { resetBand(b.id); e.preventDefault(); return; } else return; e.preventDefault(); put({ [b.id]: p }); }); }
      // the dots join the tab order (tabindex -1 in the markup)
      for (const n of Object.values(nodes)) n.tabIndex = 0;
      // an EQ change from elsewhere (the hub, the API): refresh eq, except mid-drag, where MIX's own value is newer;
      // the repaint itself comes from the shared event handler further down
      if (radio.on) radio.on("eq", () => { if (!drag && !pinch) { eq = radio.getEq(); } });
      return { paint, moved, size, redraw, specOn };
    }
  }

  // ---------- STYLE: PAD (a puck among ten directions, an AMOUNT ring, FEEL / DRUMS / BAND / FULL rings) and FADERS (one channel each) ----------
  if (SEC.style) {
    // ms: the style store; all: {stationId: record}; rings: AMOUNT per station (0..1, 1 when not saved)
    const ms = lazy(mixStore) || ls("mdfmStyleMix"), all = obj(ms.get()) || {}, rings = {};
    // glitchFromV1: the largest old CHAOS found, handed to FX through S.style.glitchFromV1
    let glitchFromV1 = null;
    // each station's saved record: v2 {v, w, lanes, ring} (or an old flat v1 {pop:.., classical:.., chaos:..}, which the engine migrates;
    // an old CHAOS becomes GLITCH, an effect, and is written into mdfmFx below if that has no GLITCH yet)
    for (const id in all) { const rec = obj(all[id]); if (!rec) continue;
      if (has("migrateStyleMix")) { const m = radio.migrateStyleMix(rec); if (typeof m.glitch === "number" && m.glitch > 0) glitchFromV1 = Math.max(glitchFromV1 || 0, m.glitch); }
      rings[id] = typeof rec.ring === "number" ? clamp(rec.ring, 0, 1) : 1;
      const r = rec.v === 2 && obj(rec.w) ? { w: rec.w, lanes: obj(rec.lanes) || undefined } : rec; radio.setStyleMix(r, id); }
    // ringOf(id): that station's AMOUNT
    const ringOf = id => (id in rings ? rings[id] : 1);
    // save(): this station's record as v2 {v, w, lanes, ring}
    const save = () => { const id = sid(); all[id] = { v: 2, w: radio.getStyleMix(id), ...(LANES.length ? { lanes: radio.getStyleLanes(id) } : {}), ring: ringOf(id) }; ms.set(all); };
    // after(): after any style change: save, repaint, note the paint time (the engine's "mix" echo is then skipped), update dots
    const after = () => { save(); S.style.paint(); painted.style = performance.now(); led(); };
    // setK(k, v): one direction's weight, 0..1
    const setK = (k, v) => { v = clamp(v, 0, 1); if (v < .04 && v < (radio.getStyleMix()[k] || 0)) v = 0; radio.setStyleMix({ [k]: v }); after(); };   // pulled back to a hair from zero is zero
    // F: a fader per direction (0..100 %), in its colour; with STAGES, four lights (FEEL / DRUMS / BAND / FULL) over the
    // caption; an .mx-eff readout shows the scaled value that actually plays
    const F = {}; for (const [k, l, tip] of DIRS) { F[k] = Fader($p(`.mx-f[data-key="${k}"]`), { def: 0, tip, fmt: v => v + "%", text: v => v ? `${l} ${v} percent` : `${l} off`, onInput: v => setK(k, v / 100) });
      F[k].el.style.setProperty("--dc", DCOL[k]);
      if (STAGES.length) { const lit = doc.createElement("div"); lit.className = "mx-lit4"; lit.setAttribute("aria-hidden", "true"); lit.innerHTML = `<i data-s="feel"></i><i data-s="drums"></i><i data-s="band"></i><i data-s="full"></i>`; F[k].el.insertBefore(lit, F[k].el.querySelector("small")); }
      const eff = doc.createElement("span"); eff.className = "mx-eff"; eff.hidden = true; F[k].el.insertBefore(eff, F[k].el.querySelector(".mx-ft")); }
    // LK: the lane knobs, 0..100 % (100: the styles may change it fully; 0: kept as the song), each with a "changing now" light
    const LK = {}; for (const [k, l, tip] of LANES) { LK[k] = Knob($p(`.mx-k[data-key="lane-${k}"]`), { min: 0, max: 100, step: 1, def: 100, tip: tip || `How much the styles may change the ${l.toLowerCase()}`,
      fmt: v => v === 0 ? "OFF" : v === 100 ? "ALL" : v + "%", text: v => v === 0 ? "kept as the song" : v + " percent",
      onInput: v => { radio.setStyleLanes({ [k]: v / 100 }); after(); } });
      const i = doc.createElement("i"); i.className = "mx-live"; i.title = "Changing now"; LK[k].el.appendChild(i); }
    // the view switch, remembered in mdfmMixUI.styleView
    const vbox = $p('[data-hook="style-view"]'), view = PAD ? Seg(vbox, [["pad", "PAD"], ["faders", "FADERS"]], v => { ui.styleView = v; saveUI(); showView(); resized(); }, "Style view") : null;
    // card: the blend card; its data-view is the view shown
    const card = $p(".mx-stylecard");
    // showView(): show the chosen view's parts (FADERS when there is no PAD), measure the pad, repaint
    function showView() { const v = PAD && ui.styleView !== "faders" ? "pad" : "faders"; card.dataset.view = v; if (view) view.set(v);
      for (const el of card.querySelectorAll("[data-view]")) el.hidden = el.dataset.view !== v; if (v === "pad" && P) P.size(); if (S.style) S.style.paint(); }
    // ----- the pad -----
    const P = PAD ? (() => {
      // RP: the pad's radius in SVG units (viewBox -100..100); RR: the AMOUNT ring's radius, just outside it
      const box = $p("[data-padbox]"), svg = box.querySelector("svg"), puck = $p("[data-puck]"), ghost = $p(".mx-puck.mx-ghost"), txt = $p(".mx-padtxt"), note = $p(".mx-custom"), RP = 56, RR = 64;
      // pt(r, a): polar -> SVG x, y (0 degrees = up, clockwise); f2: two decimals
      const NS = "http://www.w3.org/2000/svg", pt = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)], f2 = n => n.toFixed(2);
      // order / N: the directions round the circle
      const order = DIRS.map(d => d[0]), N = order.length;
      // the SVG: a gradient per neighbouring pair, a backing disc and the AMOUNT track, a sector between neighbours (lit when both
      // play), a spoke and dot per direction, the stage rings group, the SONG dead zone at the centre (5% of the radius),
      // and the AMOUNT arc
      let s = `<defs>`; order.forEach((k, i) => { const k2 = order[(i + 1) % N], [x1, y1] = pt(RP, ANG[k]), [x2, y2] = pt(RP, ANG[k2]);
        s += `<linearGradient id="${mkid("sg" + i)}" gradientUnits="userSpaceOnUse" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"><stop offset="0" stop-color="${DCOL[k]}"/><stop offset="1" stop-color="${DCOL[k2]}"/></linearGradient>`; });
      s += `</defs><circle r="${RR + 6}" fill="rgba(0,0,0,.35)"/><circle r="${RR}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>`;
      order.forEach((k, i) => { const k2 = order[(i + 1) % N], a1 = ANG[k], a2 = ANG[k2] < a1 ? ANG[k2] + 360 : ANG[k2], [x1, y1] = pt(RP, a1), [x2, y2] = pt(RP, a2);
        s += `<path class="mx-sector" data-a="${k}" data-b="${k2}" d="M0 0L${f2(x1)} ${f2(y1)}A${RP} ${RP} 0 0 1 ${f2(x2)} ${f2(y2)}Z" fill="url(#${mkid("sg" + i)})" opacity=".16"/>`; });
      order.forEach(k => { const [x, y] = pt(RP, ANG[k]); s += `<line class="mx-spoke" data-dir="${k}" x1="0" y1="0" x2="${f2(x)}" y2="${f2(y)}" stroke="${DCOL[k]}" stroke-width=".8" opacity=".35"/><circle cx="${f2(x)}" cy="${f2(y)}" r="2.2" fill="${DCOL[k]}"/>`; });
      s += `<g class="mx-rings"></g><circle r="${f2(RP * .05)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".7" stroke-dasharray="1.4 1.2"/><text class="mx-svgt" y="${f2(RP * .05 + 7)}" text-anchor="middle">SONG</text>`;
      s += `<path class="mx-amt" fill="none" stroke="var(--gold,#e2c86b)" stroke-width="5" stroke-linecap="round"/>`;
      svg.innerHTML = s; const ringsG = svg.querySelector(".mx-rings"), amt = svg.querySelector(".mx-amt");
      // AK: the AMOUNT knob, 0..100 %
      const AK = Knob($p('.mx-k[data-key="ring"]'), { min: 0, max: 100, step: 1, def: 100, tip: "AMOUNT: scales the whole blend, so you can keep the mix of styles and ride how much of it plays",
        fmt: v => v + "%", text: v => `amount ${v} percent`, onInput: v => setRing(v / 100) });
      let pos = { x: 0, y: 0 };   // where the puck sits (pad radius 1), kept even while the AMOUNT is 0
      // setPad(x, y): move the puck (kept inside the circle) and apply it with this station's AMOUNT, once per frame
      const setPad = (x, y) => { const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; } pos = { x, y }; const px = x, py = y;
        live(box, () => { radio.setStylePad({ x: px, y: py, ring: ringOf(sid()) }); after(); }); };
      let ringPend = null;   // the AMOUNT before this frame's ring moves (a custom blend scales by new / old once per frame)
      // setRing(v): AMOUNT 0..1 for this station; applied once per frame
      function setRing(v) { const id = sid(); if (!ringPend || ringPend.id !== id) ringPend = { id, old: ringOf(id) }; rings[id] = clamp(v, 0, 1);
        live(box, () => { const rp = ringPend; ringPend = null; if (rp) ringApply(rp.id, rp.old); }); }
      // ringApply(id, old): a blend the pad can't show (custom) is scaled by new / old; a pad blend is re-derived from the puck
      function ringApply(id, old) { const mp = radio.mixToPad(radio.getStyleMix(), old || 1);
        if (mp.custom) { if (old > 0) { const w = radio.getStyleMix(), f = rings[id] / old; for (const k in w) w[k] = clamp(w[k] * f, 0, 1); radio.setStyleMix(w); } }
        else radio.setStylePad({ x: pos.x, y: pos.y, ring: rings[id] }); after(); }
      let padRect = null;   // measured once per drag (a read per move forced a layout after every repaint)
      // toPad(e): pointer -> pad coordinates (radius 1 = RP)
      const toPad = e => { const r = padRect || box.getBoundingClientRect(); return [((e.clientX - r.left) / r.width * 200 - 100) / RP, ((e.clientY - r.top) / r.height * 200 - 100) / RP]; };
      // mode: "pad" (moving the puck) or "ring" (turning AMOUNT round the rim); a0 / ring0: angle and AMOUNT at the last move;
      // lastT: the last tap (double tap); start: the press point for the 3 px movement test
      let mode = null, a0 = 0, ring0 = 1, lastT = { t: 0, x: 0, y: 0 }, pid = null, moved = false, start = [0, 0];
      // angOf(x, y): degrees, 0 = up, clockwise
      const angOf = (x, y) => Math.atan2(x, -y) * 180 / Math.PI;
      // press: the direction labels handle their own clicks; presses outside the rim are ignored; on the rim (beyond the pad)
      // turns AMOUNT; inside, the puck jumps to the finger
      box.addEventListener("pointerdown", e => { if (pid !== null || (e.pointerType === "mouse" && e.button !== 0) || e.target.closest(".mx-pl")) return; padRect = null;
        const [x, y] = toPad(e), r = Math.hypot(x, y); if (r > (RR + 9) / RP) return;
        pid = e.pointerId; padRect = box.getBoundingClientRect(); try { box.setPointerCapture(pid); } catch (err) {} e.preventDefault(); puck.focus({ preventScroll: true }); moved = false; start = [e.clientX, e.clientY];
        dragOn(); if (r > (RP + 3) / RP) { mode = "ring"; a0 = angOf(x, y); ring0 = ringOf(sid()); return; }
        mode = "pad"; box.classList.add("drag"); setPad(x, y); });
      // move: on the rim, the angle change (wrapped to +-180) adds to AMOUNT, 300 degrees = the whole range
      box.addEventListener("pointermove", e => { if (e.pointerId !== pid) return; if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 3) moved = true; const [x, y] = toPad(e);
        if (mode === "ring") { let d = angOf(x, y) - a0; d = ((d + 540) % 360) - 180; a0 += d; ring0 = clamp(ring0 + d / 300, 0, 1); setRing(Math.round(ring0 * 100) / 100); return; }
        if (mode === "pad") setPad(x, y); });
      // release: a double tap on the pad puts the puck in the middle (the song as it is)
      const up = e => { if (e.pointerId !== pid) return; pid = null; box.classList.remove("drag"); const m = mode; mode = null; padRect = null; dragOff();
        if (e.type === "pointerup" && m === "pad" && !moved) { const t = performance.now(); if (t - lastT.t < 300 && Math.hypot(e.clientX - lastT.x, e.clientY - lastT.y) < 12) { lastT.t = 0; setPad(0, 0); return; } lastT = { t, x: e.clientX, y: e.clientY }; }
        else lastT.t = 0; };
      box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up); box.addEventListener("lostpointercapture", up);
      // a label: the puck goes to 60% of that direction
      // (the distance is chosen so the direction plays at 60% at the current AMOUNT; .glide animates the puck there)
      for (const b of box.querySelectorAll(".mx-pl")) b.addEventListener("click", () => { const k = b.dataset.dir, ring = ringOf(sid()) || 1, r = Math.min(1, .05 + .95 * Math.min(1, .6 / ring)), [x, y] = pt(r, ANG[k]);
        box.classList.add("glide"); setTimeout(() => box.classList.remove("glide"), 260); setPad(x, y); });
      // puck keys: arrows move 0.05, Home / Delete centre it, + / - change the distance at the same angle,
      // [ / ] jump to the previous / next direction (at least 0.3 out)
      puck.addEventListener("keydown", e => { const st = .05, r = Math.hypot(pos.x, pos.y); let x = pos.x, y = pos.y;
        if (e.key === "ArrowRight") x += st; else if (e.key === "ArrowLeft") x -= st; else if (e.key === "ArrowUp") y -= st; else if (e.key === "ArrowDown") y += st;
        else if (e.key === "Home" || e.key === "Delete" || e.key === "Backspace") { x = 0; y = 0; }
        else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") { const d = e.key === "+" || e.key === "=" ? st : -st, nr = clamp(r + d, 0, 1), a = r > .001 ? Math.atan2(x, -y) : 0; x = nr * Math.sin(a); y = -nr * Math.cos(a); }
        else if (e.key === "[" || e.key === "]") { const a = ((Math.atan2(x, -y) * 180 / Math.PI) + 360) % 360, sec = 360 / N; let i = Math.round(a / sec) % N; i = (i + (e.key === "]" ? 1 : -1) + N) % N;
          const rr = Math.max(r, .3); [x, y] = pt(rr, ANG[order[i]]); }
        else return; e.preventDefault(); setPad(x, y); });
      function size() { /* labels are % placed; nothing to measure */ }
      // ringsDrawn: the AMOUNT the rings were last drawn for; padEls: cached element lists
      let ringsDrawn = NaN; const padEls = {};
      // paint(m, plan): weights m (and the engine's plan) on the pad: puck or ghost, rings, the AMOUNT arc, lit labels, spokes
      // and sectors, the readout and the puck's ARIA
      function paint(m, plan) { const id = sid(), ring = ringOf(id), mp = radio.mixToPad(m, ring || 1), anyW = order.some(k => (m[k] || 0) > .001);
        if (!mp.custom && anyW) pos = { x: mp.x, y: mp.y }; else if (!anyW && ring > 0 && Math.hypot(pos.x, pos.y) > .051) pos = { x: 0, y: 0 };   // inside the dead zone (or AMOUNT 0) the puck stays where it was put
        // a custom blend has no single pad point: the ghost shows its centre of weight and the puck idles in the middle
        const show = mp.custom ? null : pos;
        puck.hidden = !show; ghost.hidden = !mp.custom; note.hidden = !mp.custom;
        const place = (el, x, y) => { el.style.left = (50 + x * RP / 2) + "%"; el.style.top = (50 + y * RP / 2) + "%"; };
        if (show) place(puck, show.x, show.y); if (mp.custom) { place(ghost, mp.x, mp.y); puck.hidden = false; place(puck, 0, 0); puck.classList.add("idle"); } else puck.classList.remove("idle");
        // rings at the amounts where stages start: drawn where they fall for this AMOUNT (a stage the AMOUNT can't reach is left out)
        if (ring !== ringsDrawn) { ringsDrawn = ring; ringsG.innerHTML = RINGS.map(([a, l]) => { if (a > ring + .001) return ""; const r = RP * (.05 + .95 * Math.min(1, a / (ring || 1))), [tx, ty] = pt(r, 18);
          return `<circle r="${f2(r)}" fill="none" stroke="rgba(255,255,255,${a >= 1 ? .28 : .16})" stroke-width="${a >= 1 ? .9 : .6}" stroke-dasharray="${a >= 1 ? "" : "2 2"}"/><text class="mx-svgt" x="${f2(tx + 1.5)}" y="${f2(ty + 2)}">${l}</text>`; }).join(""); }   // 1.26: rebuilt only when AMOUNT changes
        // the AMOUNT arc clockwise from the top (a full ring is drawn as an almost closed arc: SVG can't draw 360 degrees in one)
        const [ax, ay] = pt(RR, Math.min(359.9, ring * 360)); amt.setAttribute("d", ring <= 0 ? "" : ring >= .999 ? `M0 ${-RR}A${RR} ${RR} 0 1 1 -0.01 ${-RR}` : `M0 ${-RR}A${RR} ${RR} 0 ${ring > .5 ? 1 : 0} 1 ${f2(ax)} ${f2(ay)}`);
        AK.set(Math.round(ring * 100)); AK.state({ moved: ring < .995 });
        // on: the directions playing, biggest first; eff: the effective (scaled) weights when the plan has them
        const on = order.filter(k => (m[k] || 0) > .001).sort((a, b) => m[b] - m[a]), eff = plan && plan.w ? plan.w : m;
        for (const b of (padEls.pl || (padEls.pl = [...box.querySelectorAll(".mx-pl")]))) { const k = b.dataset.dir, v = m[k] || 0; b.classList.toggle("on", v > .001); b.style.setProperty("--w", String(v)); }
        for (const l of (padEls.sp || (padEls.sp = [...svg.querySelectorAll(".mx-spoke")]))) { const v = m[l.dataset.dir] || 0; l.setAttribute("opacity", v > .001 ? String(.5 + .5 * Math.min(1, v * 1.5)) : ".35"); l.setAttribute("stroke-width", v > .001 ? "1.8" : ".8"); }
        for (const p of (padEls.se || (padEls.se = [...svg.querySelectorAll(".mx-sector")]))) { const a = m[p.dataset.a] || 0, b = m[p.dataset.b] || 0; p.setAttribute("opacity", a > .001 && b > .001 ? ".42" : ".16"); }
        // readout: up to three "NAME 40%" parts; the puck's aria-valuenow is the summed amount, at most 100
        const lab = k => (DIRS.find(d => d[0] === k) || [k, k])[1], parts = on.map(k => `${lab(k)} ${Math.round((eff[k] || 0) * 100)}%`);
        txt.textContent = parts.length ? parts.slice(0, 3).join(" · ") + (parts.length > 3 ? ` · +${parts.length - 3}` : "") : "THE SONG AS IT IS";
        const amount = Math.round(on.reduce((a, k) => a + (eff[k] || 0), 0) * 100);
        puck.setAttribute("aria-valuenow", String(Math.min(100, amount)));
        puck.setAttribute("aria-valuetext", parts.length ? `${on.map(k => `${Math.round((m[k] || 0) * 100)}% ${lab(k)}`).join(", ")}, amount ${Math.round(ring * 100)}%${mp.custom ? ", custom blend" : ""}` : "the song as it is"); }
      return { paint, size };
    })() : null;
    // SCALED: the styles add up to more than 100% and the engine scales them down
    const scaled = $p(".mx-scaled");
    // S.style: paint() pulls the mix and plan from the engine into the faders, lights, lane knobs and pad; reset(); moved()
    // lights the section dot; glitchFromV1 is read by FX
    S.style = {
      paint() { const m = radio.getStyleMix(), plan = has("getStylePlan") ? radio.getStylePlan() : null, sc = !!(plan && plan.scaled);
        const fadersShown = !(P && card.dataset.view === "pad");   // 1.26: the hidden view isn't repainted on every move (showView paints it when it opens)
        if (fadersShown) for (const [k] of DIRS) { const v = m[k] || 0, f = F[k]; f.set(Math.round(v * 100)); f.el.classList.toggle("moved", v > .001);
          const eff = f.eff || (f.eff = f.el.querySelector(".mx-eff")); eff.hidden = !(sc && v > .001); if (sc) eff.textContent = "▸" + Math.round(((plan.w || {})[k] || 0) * 100);
          const st = plan && plan.stages ? plan.stages[k] : null, lit = f.lit !== undefined ? f.lit : (f.lit = f.el.querySelector(".mx-lit4"));
          // the four lights: FEEL and DRUMS from the stage amounts, BAND by the bass or keys past half, FULL by the lead
          if (lit) { const L = { feel: st ? st.feel || 0 : 0, drums: st ? st.drums || 0 : 0, band: st ? (st.bass ? 1 : Math.max(0, ((st.keys || 0) - .5) * 2)) : 0, full: st && st.lead ? 1 : 0 };
            for (const i of lit.children) { const x = clamp(L[i.dataset.s], 0, 1); i.style.setProperty("--x", String(x)); i.classList.toggle("on", x > .02); }
            // the tooltip lists the parts this style owns now ("Plays: bass, lead")
            const roles = plan && plan.roles ? Object.keys(plan.roles).filter(r => plan.roles[r] === k) : []; f.el.title = roles.length ? `Plays: ${roles.join(", ")}` : (f.el.title.startsWith("Plays:") ? "" : f.el.title); } }
        if (scaled) scaled.hidden = !sc;
        if (LANES.length && fadersShown) { const L = radio.getStyleLanes(), stg = plan && plan.stages ? Object.values(plan.stages) : [];
          // act: whether some style is changing each lane right now (lights the lane's live dot)
          const act = { drums: s => s.drums > .02, keys: s => s.keys > .02, bass: s => !!s.bass, lead: s => !!s.lead, groove: s => s.groove > .02, tempo: s => s.tempo > .02, fx: s => s.fx > .02 };
          for (const [k] of LANES) { LK[k].set(Math.round((L[k] == null ? 1 : L[k]) * 100)); LK[k].state({ moved: (L[k] == null ? 1 : L[k]) < .995 });
            LK[k].el.classList.toggle("live", (L[k] == null ? 1 : L[k]) > .005 && stg.some(s => act[k] ? act[k](s) : false)); } }
        if (P) P.paint(m, plan); },
      reset() { radio.resetStyleMix(); rings[sid()] = 1; save(); this.paint(); },
      moved: () => Object.values(radio.getStyleMix()).some(v => v > .001) || ringOf(sid()) < .995 || (LANES.length ? Object.values(radio.getStyleLanes()).some(v => v < .995) : false),
      glitchFromV1 };
    // show the saved view (this is also the first paint)
    showView();
  }

  // Builds the GROOVE section: per-station tempo/feel/key/mode overrides and the drum/melody knobs.
  // Everything goes through radio.setGroove(); the result is saved per station id (sid()) in the groove store.
  // ---------- GROOVE & KEY ----------
  if (SEC.groove) {
    // gs: the groove store (opts.grooveStore or localStorage "mdfmGroove"); gall: { stationId: groove object }.
    // Every saved station's groove is pushed into the engine at mount so switching stations keeps each one's setting.
    const gs = lazy(grooveStore) || ls("mdfmGroove"), gall = obj(gs.get()) || {};
    for (const id in gall) if (obj(gall[id])) radio.setGroove(gall[id], id);
    // gsave(v): remember the engine's normalised groove v for the current station.
    // setG(o): apply a partial groove change (always tagged with the groove schema version gv), save, repaint, update the LED.
    const gsave = v => { gall[sid()] = v; gs.set(gall); };
    const setG = o => { gsave(radio.setGroove({ ...o, gv: GD.gv || 2 })); S.groove.paint(); led(); };
    // NOTES: key button labels (pitch class 0..11, C = 0); NAMES12: their spoken names; PCS: song-key spelling -> pitch class.
    const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"], NAMES12 = ["C", "C♯ / D♭", "D", "E♭", "E", "F", "F♯ / G♭", "G", "A♭", "A", "B♭", "B"];
    const PCS = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 }; // spellings radio.songOwn().key may use
    // Knob value curves (v is 0..1, .5 = the knob's centre): lenMul maps note LENGTH to a multiplier (.5x..3x, 1x at centre);
    // lvl maps a level knob to linear gain (0 at 0, 1 at centre, 2 at full; the 1.6 power gives a usable fade near the bottom).
    const lenMul = v => v < .5 ? .5 + v : 1 + (v - .5) * 4, lvl = v => v < .5 ? Math.pow(v * 2, 1.6) : 1 + (v - .5) * 2;
    // dB(v): label for a 0..100 level knob (OFF at 0, 0 dB at 50).
    const dB = v => v === 0 ? "OFF" : Math.abs(v - 50) < 1 ? "0 dB" : (v > 50 ? "+" : "") + (20 * Math.log10(lvl(v / 100))).toFixed(1) + " dB";
    // msOf(m, v): a timing-push knob's 0..100 value -> milliseconds over the knob's own scale (m.scale, default -30..+30 ms).
    const msOf = (m, v) => { const [a, z] = m.scale || [-30, 30]; return a + (z - a) * v / 100; };
    // GF: per-knob value labels shown under the knob (keyed by GKNOB id). Bipolar knobs read AS IS at the centre (50).
    const GF = { swing: v => v === 0 ? "STRAIGHT" : v + "%", length: v => "×" + lenMul(v / 100).toFixed(1), density: v => v === 0 ? "BARE" : String(v),
      fills: v => v === 0 ? "NONE" : String(v), humanize: v => v ? v + "%" : "OFF", ghosts: v => v ? v + "%" : "OFF", accent: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "FLAT " + (50 - v) : "+" + (v - 50),
      hatdens: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "LESS " + (50 - v) : "MORE " + (v - 50), hatswing: v => v === 0 ? "STRAIGHT" : v + "%",
      mel: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "SIMPLE " + (50 - v) : "BUSY " + (v - 50), rep: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "VARIED " + (50 - v) : "REPEAT " + (v - 50),
      range: v => Math.abs(v - 50) < 1 ? "AS IS" : v < 50 ? "NARROW " + (50 - v) : "WIDE " + (v - 50),
      harm: v => Math.abs(v - 50) < 1 || (v >= 35 && v < 65) ? "AS IS" : v < 12 ? "FIFTHS" : v < 35 ? "TRIADS" : v < 85 ? "7THS" : "9THS" };
    // fmtG(m): picks the label formatter for knob meta m: its GF entry, else dB for levels, AHEAD/BEHIND ms for push knobs, else percent.
    const fmtG = m => GF[m.id] || (m.unit === "dB" || m.group === "levels" ? dB : m.unit === "ms" ? (v => { const x = msOf(m, v); return Math.abs(x) < .5 ? "ON" : (x < 0 ? "AHEAD " : "BEHIND ") + Math.abs(x).toFixed(0); }) : (v => v + "%"));
    // txtG(m): the screen-reader text for ms knobs ("12 milliseconds ahead"); null means Knob uses the visual label.
    const txtG = m => m.unit === "ms" ? (v => { const x = msOf(m, v); return Math.abs(x) < .5 ? "on the beat" : `${Math.abs(x).toFixed(0)} milliseconds ${x < 0 ? "ahead" : "behind"}`; }) : null;
    // ownBpm / own: the playing song's own tempo and {bpm, key, time} (radio.songOwn), refreshed in S.groove.paint.
    let ownBpm = 0, own = null;
    // GKn: { grooveKey: Knob } for every knob in GKNOB. A "song" knob (GD[k] < 0) defaults to the song's own value,
    // shown parked at centre with its m.song label. humanize/ghosts: a drag down to <= 2% snaps to 0 (OFF) so it can be truly off.
    const GKn = {};
    for (const m of GKNOB) { const k = m.id, song = !!m.song && GD[k] < 0, bip = !!m.bipolar;
      GKn[k] = Knob($p(`.mx-k[data-key="g-${k}"]`), { min: 0, max: 100, step: 1, def: song ? 50 : Math.round((GD[k] || 0) * 100), center: bip ? 50 : null, tip: gtip[k], fmt: fmtG(m), text: txtG(m),
        onInput: v => setG({ [k]: ((k === "humanize" || k === "ghosts") && v <= 2 && v / 100 < radio.getGroove()[k] ? 0 : v) / 100 }), onReset: () => setG({ [k]: GD[k] }) }); }
    // the small SONG buttons beside a control put it back to the song's own value (bpm 0 = the song's tempo).
    $$p(".mx-song[data-song]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.song; if (k === "bpm") setG({ bpm: 0 }); else setG({ [k]: GD[k] }); }));
    // BPM: an LCD you drag up and down (1 BPM per 6 px), [-] [+] that repeat while held, TAP, and SONG
    // bpmRaw: the unrounded BPM while dragging, so slow drags still accumulate (setBpm rounds it).
    const num = $p(".mx-num"), lcd = num && num.querySelector(".mx-lcd");
    let bpmRaw = 0;
    // bpmNow(): the BPM shown: the override, else the song's own (rounded, clamped 40..220), else 120.
    const bpmNow = () => { const g = radio.getGroove(); return g.bpm || clamp(Math.round(ownBpm) || 120, 40, 220); };
    const setBpm = v => setG({ bpm: clamp(Math.round(v), 40, 220) });
    // gesture() (helper above) handles pointer drags with a 2 px dead zone; fineOf() gives a <1 multiplier for fine mode
    // (modifier key or slow touch), and the LCD shows FINE. Double-tap/click goes back to the song's tempo.
    if (num) {
      gesture(lcd, { dead: 2, down: () => { lcd.focus({ preventScroll: true }); bpmRaw = bpmNow(); }, // focus for the keys below, without scrolling the page mid-drag
        move: (ddx, ddy, e, g) => { const f = fineOf(e, g); lcd.classList.toggle("fine", f < 1); bpmRaw = clamp(bpmRaw - ddy / 6 * f, 40, 220); if (Math.round(bpmRaw) !== radio.getGroove().bpm) setBpm(bpmRaw); },
        end: () => lcd.classList.remove("fine"), double: () => setG({ bpm: 0 }) });
      // keyboard on the LCD (it is an ARIA spinbutton): arrows +-1 (Shift +-5), PageUp/Down +-10, Home/End the limits,
      // Delete/Backspace = SONG, Enter opens the typed-value editor (editValue).
      lcd.addEventListener("keydown", e => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (d != null) setBpm(bpmNow() + d * (e.shiftKey ? 5 : 1)); else if (e.key === "Home") setBpm(40); else if (e.key === "End") setBpm(220);
        else if (e.key === "Delete" || e.key === "Backspace") setG({ bpm: 0 });
        else if (e.key === "Enter") editValue(num, bpmNow(), 40, 220, 1, v => { if (v != null) setBpm(v); lcd.focus({ preventScroll: true }); }); else return; e.preventDefault(); });
      // [-] / [+]: one step on press, then repeat after 400 ms every 60 ms until release (pointerleave/cancel/blur also stop it).
      for (const b of num.querySelectorAll("[data-d]")) { let t = 0; const d = +b.dataset.d, stop = () => clearTimeout(t);
        const step = () => setBpm(bpmNow() + d);
        b.addEventListener("pointerdown", e => { if (e.button) return; step(); t = setTimeout(function rep() { step(); t = setTimeout(rep, 60); }, 400); }); // e.button: ignore right/middle clicks
        for (const ev of ["pointerup", "pointerleave", "pointercancel", "blur"]) b.addEventListener(ev, stop);
        b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(); } }); }
      // TAP tempo: average interval of the last (up to 5) taps; a gap over 2 s starts a new count.
      let taps = []; num.querySelector("[data-tap]").addEventListener("click", () => { const t = performance.now(); if (taps.length && t - taps[taps.length - 1] > 2000) taps = []; taps.push(t); if (taps.length > 5) taps.shift();
        if (taps.length >= 2) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setBpm(60000 / iv); } });
    }
    // segs: the segmented button rows (Seg helper): time signature, feel (HALF/NORMAL/DOUBLE = 0/.5/1), key root, and the phone card tabs.
    const segs = {};
    if ($p('[data-g="meter"]')) segs.meter = Seg($p('[data-g="meter"]'), [["", "SONG", "The song's own time"], ...radio.meters().map(m => [m, m])], v => setG({ meter: v }), "Time signature");
    if ($p('[data-g="feel"]')) segs.feel = Seg($p('[data-g="feel"]'), [["0", "HALF"], ["0.5", "NORMAL"], ["1", "DOUBLE"]], v => setG({ feel: +v }), "Feel");
    // the key row looks like a piano octave: sharps/flats get mx-blk, naturals mx-wht; "-1" is SONG (the song's own key).
    if ($p('[data-g="root"]')) { segs.root = Seg($p('[data-g="root"]'), [["-1", "SONG", "The song's own key", "mx-ks"], ...NOTES.map((n, i) => [String(i), n, NAMES12[i], [1, 3, 6, 8, 10].includes(i) ? "mx-blk" : "mx-wht"])], v => setG({ root: +v }), "Key");
      segs.root.el.classList.add("mx-keys"); }
    // MODE: a <select> of radio.keyModes() grouped into Major / Minor / Exotic families; "" = the song's own scale.
    const modeSel = $p('select[data-g="mode"]');
    if (modeSel) { const FAM = { major: "Major family", lydian: "Major family", mixolydian: "Major family", lyddom: "Major family", minor: "Minor family", dorian: "Minor family", phrygian: "Minor family", locrian: "Minor family", harmonic: "Minor family", melodic: "Minor family" };
      const o0 = doc.createElement("option"); o0.value = ""; o0.textContent = "Song's scale"; modeSel.appendChild(o0); const gr = {};
      for (const m of radio.keyModes()) { const f = FAM[m.id] || "Exotic"; if (!gr[f]) { gr[f] = doc.createElement("optgroup"); gr[f].label = f; } const o = doc.createElement("option"); o.value = m.id; o.textContent = m.name; o.dataset.base = m.name; gr[f].appendChild(o); }
      for (const f of ["Major family", "Minor family", "Exotic"]) if (gr[f]) modeSel.appendChild(gr[f]);
      modeSel.addEventListener("change", () => setG({ mode: modeSel.value })); }
    // the mini tabs (phones): TEMPO · KEY · DRUMS, one card at a time
    const gt = $p("[data-gtabs]"); segs.gtab = Seg(gt, [["tempo", "TEMPO"], ["key", "KEY"], ...(gMelK.length ? [["melody", "MELODY"]] : []), ["drums", "DRUMS"], ...(BT ? [["beat", "BEAT"]] : [])], v => { ui.grooveCard = v; saveUI(); layoutGroove(); resized(); }, "Groove card"); // hooks into the layout code below (layoutGroove, resized)
    // isMoved(g, k): does groove field k differ from its default GD[k] (numbers with a .005 tolerance)?
    // DRUMCARD / MELCARD: knob ids on the DRUMS / MELODY cards, greyed out when the station has no drums / melody.
    const isMoved = (g, k) => typeof GD[k] === "number" ? Math.abs(g[k] - GD[k]) > .005 : g[k] !== GD[k];
    const DRUMCARD = new Set(GKNOB.filter(m => m.group !== "tempo" && m.group !== "melody").map(m => m.id)), MELCARD = new Set(gMelK.map(m => m.id));
    // S.groove: this section's contract with the rest of MIX (every S.* has the same three members):
    //   paint(): read the engine (getGroove, grooveSupport, songOwn) and update every control, its moved state, ARIA and disabled state
    //   reset(): put the station's groove back to defaults and save; moved(): true if anything differs from defaults (drives the dots/LED)
    S.groove = {
      paint() { const g = radio.getGroove(), sup = radio.grooveSupport(sid()), nm = station() ? station().name : "this station";
        own = has("songOwn") ? radio.songOwn() : null; ownBpm = own && own.bpm ? +own.bpm : 0; const kp = own && own.key ? String(own.key).split(" ") : null;
        const not = `Not on ${nm}`;
        for (const k of Object.keys(GKn)) { const m = GIK[k], raw = g[k], song = !!m.song && GD[k] < 0 && raw < 0, x = song ? 50 : Math.round(raw * 100); GKn[k].set(x);
          GKn[k].state({ moved: isMoved(g, k), song, text: song ? m.song : null, aria: song ? (m.song === "FOLLOW" ? "follows the main setting" : "the song's own") : null });
          const sb = $p(`.mx-song[data-song="${k}"]`); if (sb) sb.setAttribute("aria-pressed", String(!isMoved(g, k)));
          // disabled with a "Not on <station>" reason when the station doesn't support that knob's capability (sup.* from grooveSupport)
          const cap = { swing: "swing", length: "length", drums: "drums" }[k]; GKn[k].disable(cap && !sup[cap] ? not : DRUMCARD.has(k) && sup.drums === 0 ? not : MELCARD.has(k) && sup.melody === 0 ? not : ""); }
        if (num) { const song = !g.bpm; lcd.textContent = song ? (ownBpm ? String(Math.round(ownBpm)) : "SONG") : String(g.bpm); lcd.classList.toggle("song", song);
          lcd.setAttribute("aria-valuenow", String(g.bpm || Math.round(ownBpm) || 0)); lcd.setAttribute("aria-valuetext", song ? (ownBpm ? `the song's own, ${Math.round(ownBpm)} BPM` : "the song's own") : `${g.bpm} BPM`);
          num.classList.toggle("moved", g.bpm > 0); num.querySelector('.mx-song[data-song="bpm"]').setAttribute("aria-pressed", String(song));
          num.classList.toggle("na", !sup.bpm); num.querySelectorAll("button,.mx-lcd").forEach(b => { b.toggleAttribute("disabled", !sup.bpm && b.tagName === "BUTTON"); }); num.title = sup.bpm ? "" : not; } // only buttons get disabled; the LCD stays focusable
        if (segs.meter) { segs.meter.set(g.meter); const b = segs.meter.btn(""); b.textContent = "SONG" + (own && own.time && sup.meter ? ` (${own.time})` : "");
          segs.meter.disable(sup.meter ? "" : not); segs.meter.el.closest(".mx-row").classList.toggle("moved", !!g.meter); }
        if (segs.feel) { segs.feel.set(String(Math.round(g.feel * 2) / 2)); segs.feel.el.closest(".mx-row").classList.toggle("moved", Math.abs(g.feel - .5) > .01); }
        if (segs.root) { segs.root.set(String(g.root)); segs.root.btn("-1").textContent = "SONG" + (kp ? ` (${kp[0].replace("#", "♯").replace(/^([A-G])b$/, "$1♭")})` : "");
          for (let i = 0; i < 12; i++) segs.root.btn(String(i)).classList.toggle("own", !!(kp && PCS[kp[0]] === i));
          segs.root.disable(sup.key === 0 ? not : ""); segs.root.el.classList.toggle("moved", g.root >= 0); }
        if (modeSel) { modeSel.options[0].textContent = "Song's scale" + (kp && kp.length > 1 ? ` (${kp.slice(1).join(" ")})` : "");
          for (const o of modeSel.querySelectorAll("option[data-base]")) o.textContent = o.dataset.base + (kp && kp.length > 1 && o.dataset.base.toLowerCase().replace(/ \(.*\)$/, "") === kp.slice(1).join(" ").toLowerCase() ? " (song)" : "");
          modeSel.value = g.mode; modeSel.disabled = sup.key === 0; modeSel.closest(".mx-fld").classList.toggle("moved", !!g.mode); }
        // open a collapsed "more" disclosure that hides a moved knob, so a change is never invisible
        for (const d of $$p(".mx-more")) { if (!d.open && [...d.querySelectorAll(".mx-k")].some(c => c.classList.contains("moved"))) d.open = true; } },
      reset() { gsave(radio.resetGroove()); this.paint(); },
      moved: () => { const g = radio.getGroove(); return Object.keys(GD).some(k => k !== "gv" && isMoved(g, k)); } };
    // ---------- 1.31 BEAT: tap or drag across the steps with a tool; INFLUENCE decides how hard the pattern pulls ----------
      // bs: the beat store (opts.beatStore or localStorage "mdfmBeat"), { stationId: beat }; each is pushed to the engine at mount.
      // A beat is { grid: { lane: 16 steps }, inf: 0..1 influence, plus on/off switches named by the [data-bt] buttons }.
      // Step values: 0 empty (song decides), 1 soft, 2 hit, 3 loud, -1 rest. BTI = radio.beatInfo(): lanes [[key, name]] and defaults.
    if (BT) {
      const bs = lazy(opts.beatStore) || ls("mdfmBeat"), ball = obj(bs.get()) || {};
      for (const id in ball) if (obj(ball[id])) radio.setBeat(ball[id], id);
      const card = $p(".mx-beat"), cells = [...card.querySelectorAll(".mx-bt-c")], LN = Object.fromEntries(BTI.lanes), note = card.querySelector("[data-bt-note]");
      // bsave(v): save beat v for this station; setB(o): apply a partial beat change, save, repaint the card, update the LED.
      const bsave = v => { ball[sid()] = v; bs.set(ball); };
      const setB = o => { bsave(radio.setBeat(o)); paintB(); led(); };
      // empty(): a blank grid; used(b): does beat b have any non-empty step; WORD: step value -> screen-reader word.
      const empty = () => Object.fromEntries(BTI.lanes.map(([k]) => [k, Array(16).fill(0)]));
      const used = b => BTI.lanes.some(([k]) => b.grid[k].some(x => x !== 0));
      const WORD = { 0: "empty", 1: "soft hit", 2: "hit", 3: "loud hit", "-1": "rest" };
      // infTxt(v): INFLUENCE label for 0..100: OFF, NUDGE (<34), BLEND (<67), LEAD, EXACT (100).
      const infTxt = v => v === 0 ? "OFF" : v >= 100 ? "EXACT" : v < 34 ? "NUDGE " + v : v < 67 ? "BLEND " + v : "LEAD " + v;
      const infKn = Knob($p('.mx-k[data-key="beat-inf"]'), { min: 0, max: 100, step: 1, def: Math.round(BTI.def.inf * 100), tip: "How hard your pattern pulls on the song's drums: NUDGE adds soft hits and thins with rests, BLEND mixes the two, LEAD plays yours with the song's touches, EXACT plays only yours.",
        fmt: infTxt, text: v => v === 0 ? "off" : v >= 100 ? "exactly your pattern" : infTxt(v).toLowerCase().replace(" ", ", "), onInput: v => setB({ inf: v / 100 }), onReset: () => setB({ inf: BTI.def.inf }) });
      // tool: the step value the next tap writes (a BT_TOOLS id as a string, remembered in ui.beatTool; default "2" = HIT).
      let tool = ui.beatTool && BT_TOOLS.some(t => t[0] === ui.beatTool) ? ui.beatTool : "2";
      const tools = Seg(card.querySelector("[data-bt-tools]"), BT_TOOLS, v => { tool = v; ui.beatTool = v; saveUI(); tools.set(v); }, "Beat tool"); tools.set(tool);
      // one grid edit: tap a step with the tool (the same value again clears it); drag paints the value the first step got
      // paintV: the value being painted during a drag (null when not dragging); last: the cell last painted;
      // focusAt: the grid index (lane * 16 + step) that holds the roving tabindex.
      let paintV = null, last = null, focusAt = 0;
      // cellAt: the step under a pointer. Needed because touch pointers stay captured by the first target, so e.target won't change.
      const cellAt = (x, y) => { const e = doc.elementFromPoint(x, y); return e && e.closest && e.closest(".mx-bt-c"); };
      // put(c, v): write value v into cell c's step (no-op if unchanged). hitV(c): the value a tap gives (same tool again = clear).
      const put = (c, v) => { const b = radio.getBeat(), k = c.dataset.lane, i = +c.dataset.i; if (b.grid[k][i] === v) return; b.grid[k][i] = v; setB({ grid: b.grid }); };
      const hitV = c => { const cur = radio.getBeat().grid[c.dataset.lane][+c.dataset.i], t = +tool; return cur === t && t !== 0 ? 0 : t; };
      const grid = card.querySelector(".mx-bt-grid");
      // pointerdown: start a paint (left button only; ignored when the station has no BEAT). preventDefault stops text selection and,
      // with touch-action:pan-y in CSS, horizontal drags paint while vertical swipes still scroll. vib() = a 5 ms haptic tick;
      // dragOn()/dragOff() tell the drawer a drag is in progress.
      grid.addEventListener("pointerdown", e => { const c = e.target.closest(".mx-bt-c"); if (!c || (e.pointerType === "mouse" && e.button !== 0) || card.classList.contains("na")) return;
        e.preventDefault(); paintV = hitV(c); last = c; focusAt = cells.indexOf(c); put(c, paintV); vib(); dragOn(); });
      grid.addEventListener("pointermove", e => { if (paintV === null) return; const c = cellAt(e.clientX, e.clientY); if (!c || c === last) return; last = c; put(c, paintV); });
      const endPaint = () => { if (paintV === null) return; paintV = null; last = null; dragOff(); };
      // the window's pointerup too, in case the pointer is released outside the grid
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) grid.addEventListener(ev, endPaint); win.addEventListener("pointerup", endPaint);
      // the keyboard: arrows move, Enter / Space applies the tool, Delete clears
      // focusCell(n): move the roving tabindex (only one cell is tabbable) to cell n and focus it.
      const focusCell = n => { focusAt = clamp(n, 0, cells.length - 1); cells.forEach((c, j) => c.tabIndex = j === focusAt ? 0 : -1); cells[focusAt].focus({ preventScroll: true }); };
      // grid keys: Left/Right one step, Up/Down one lane (16 cells), Home/End the lane's first/last step.
      grid.addEventListener("keydown", e => { const c = e.target.closest(".mx-bt-c"); if (!c) return; const j = cells.indexOf(c);
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 16, ArrowUp: -16, Home: -(j % 16), End: 15 - (j % 16) }[e.key];
        if (d != null) focusCell(j + d); else if (e.key === "Enter" || e.key === " ") put(c, hitV(c)); else if (e.key === "Delete" || e.key === "Backspace") put(c, 0); else return; e.preventDefault(); });
      grid.addEventListener("focusin", e => { const c = e.target.closest(".mx-bt-c"); if (c) focusAt = cells.indexOf(c); });
      // [data-bt] buttons toggle boolean beat fields; CLEAR empties the grid; the preset <select> resets to its prompt after loading.
      for (const b of card.querySelectorAll("[data-bt]")) b.addEventListener("click", () => { const k = b.dataset.bt; setB({ [k]: !radio.getBeat()[k] }); });
      card.querySelector("[data-bt-clear]").addEventListener("click", () => setB({ grid: empty() }));
      const preSel = card.querySelector("[data-bt-pre]");
      preSel.addEventListener("change", () => { const g = preSel.value && radio.beatPreset(preSel.value); preSel.value = ""; if (g) setB({ grid: g, inf: radio.getBeat().inf || BTI.def.inf }); });
      // COPY SONG: copy what the song is playing now (radio.beatNow) into the grid as plain hits.
      const copyB = card.querySelector("[data-bt-copy]");
      copyB.addEventListener("click", () => { const n = has("beatNow") && radio.beatNow(sid()); if (!n) return; setB({ grid: Object.fromEntries(BTI.lanes.map(([k]) => [k, n.song[k].map(x => x ? 2 : 0)])) }); });
      // the playhead and the faint "the song plays here" dots, while MIX is open and the card shows
      // now: the latest radio.beatNow() snapshot ({step, bar, song, play}); phStep: a key of it so cells repaint only when it changes.
      let now = null, phStep = -1;
      // paintNow(): own = the song plays this step, ph = the playhead column, fire = this step actually sounds now.
      const paintNow = () => { const n = now; for (const c of cells) { const k = c.dataset.lane, i = +c.dataset.i;
          c.classList.toggle("own", !!(n && n.song[k][i])); c.classList.toggle("ph", !!n && i === n.step); c.classList.toggle("fire", !!(n && i === n.step && n.play && n.play[k][i])); }
        copyB.disabled = !n || !BTI.lanes.some(([k]) => n.song[k].some(Boolean)); };
      // a 60 ms poll (not engine events): while the card is visible, beatWatch(true) asks the engine to log the on-air bar
      // (no sound change); when hidden, logging stops and the playhead is cleared. offsetParent null = the card isn't displayed.
      setInterval(() => { const vis = isOpen && !panel.hidden && card.offsetParent !== null;
        if (has("beatWatch")) radio.beatWatch(vis);
        if (!vis) { if (now) { now = null; paintNow(); } return; }
        const n = radio.beatNow(sid()); const key = n ? n.bar + ":" + n.step + ":" + JSON.stringify(n.play) : "";
        if (key !== phStep) { phStep = key; now = n; paintNow(); } }, 60);
      // paintB(): repaint the BEAT card from radio.getBeat(): cell values (data-v drives the CSS colours) and ARIA labels,
      // the influence knob, switches, tools, presets, CLEAR, and the hint line. Everything is disabled on stations without BEAT.
      function paintB() { const b = radio.getBeat(), sup = !has("beatSupport") || radio.beatSupport(sid()), nm = station() ? station().name : "this station";
        card.classList.toggle("na", !sup); card.classList.toggle("moved", used(b));
        for (const c of cells) { const k = c.dataset.lane, i = +c.dataset.i, v = b.grid[k][i]; c.dataset.v = String(v);
          c.setAttribute("aria-label", `${LN[k]}, step ${i + 1}${i % 4 === 0 ? ` (beat ${i / 4 + 1})` : ""}: ${WORD[v]}`); c.toggleAttribute("disabled", !sup); }
        // keep at least one cell tabbable (roving tabindex)
        if (!cells.some(c => c.tabIndex === 0)) cells[0].tabIndex = 0;
        infKn.set(Math.round(b.inf * 100)); infKn.state({ moved: Math.abs(b.inf - BTI.def.inf) > .004 }); infKn.disable(sup ? "" : `Not on ${nm}`);
        for (const t of card.querySelectorAll("[data-bt]")) { t.setAttribute("aria-pressed", String(!!b[t.dataset.bt])); t.disabled = !sup; }
        tools.disable(sup ? "" : `Not on ${nm}`); preSel.disabled = !sup; card.querySelector("[data-bt-clear]").disabled = !sup || !used(b);
        note.textContent = !sup ? `BEAT plays on MDFM 99.9, PTRN 101.1 and CLUK 92.3 (not on ${nm}).` : !used(b) ? "Tap steps to steer the drums. Empty steps: the song decides. ✕ REST keeps a step quiet. Drag to paint."
          : b.inf === 0 ? "INFLUENCE is off: the song plays its own drums." : b.inf >= 1 ? "The drums play exactly your pattern (from the next bar)." : "Your pattern steers the song's drums from the next bar. A song without drums gets some that fit it, from its next section."; }
      // wrap S.groove so the GROOVE section's paint/reset/moved include the BEAT card
      const g0 = S.groove;
      S.groove = { paint() { g0.paint(); paintB(); }, reset() { g0.reset(); bsave(radio.resetBeat()); paintB(); }, moved: () => g0.moved() || used(radio.getBeat()) };
      // the engine's "beat" event (a change from elsewhere: the hub, the API) repaints on the next tick; later() is defined below
      if (radio.on) radio.on("beat", () => later("groove"));
    }
  }

  // Builds the FX section: one knob per FK entry, the tape-stop / spin-back tricks, GLITCH, and UNDERWATER.
  // fs: the FX store (opts.fxStore or localStorage "mdfmFx"); FX are global, not per station.
  // ---------- FX ----------
  if (SEC.fx) {
    const fs = lazy(fxStore) || ls("mdfmFx"), fsaved = obj(fs.get()); if (fsaved) radio.setFx(fsaved);
    // an old (1.24) CHAOS saved with the style matrix is GLITCH now: kept unless mdfmFx already has its own GLITCH
    if (S.style && typeof S.style.glitchFromV1 === "number" && FKS.has("glitch") && !(fsaved && typeof fsaved.glitch === "number")) fs.set(radio.setFx({ glitch: Math.max(radio.getFx().glitch || 0, S.style.glitchFromV1) }));
    // ftxt(k, v): FX knob label. FILTER is bipolar: below 50 a low-pass sweeping 20 kHz -> 180 Hz, above 50 a high-pass 10 Hz -> 3 kHz
    // (exponential, so it moves evenly by ear); every other FX reads OFF or a percent.
    const ftxt = (k, v) => k === "filter" ? (Math.abs(v - 50) < 1 ? "OFF" : v < 50 ? "LP " + hz(20000 * Math.pow(180 / 20000, Math.min(1, (50 - v) / 50))) : "HP " + hz(10 * Math.pow(300, Math.min(1, (v - 50) / 50)))) : v === 0 ? "OFF" : v + "%";
    // setF(o): apply a partial FX change, save, repaint, update the LED.
    const setF = o => { fs.set(radio.setFx(o)); S.fx.paint(); led(); };
    // FKn: { fxKey: Knob }. A knob whose default is .5 is bipolar (centred). Non-bipolar: a drag down to <= 1% snaps to 0 (OFF).
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
    // uwOn(): is UNDERWATER on (counts as "moved" for the FX dot)
    const uwOn = () => has("isUnderwater") && !!radio.isUnderwater();
    // trick(b, fn): a one-shot button (TAPE STOP, SPIN BACK). fn() returns true if the trick started; the button shows busy
    // until the engine's "tape" event says it ends (e.until, audio-clock seconds -> ms from now), or 1.5 s if that's unknown.
    const trick = (b, fn) => { if (!b) return; b.addEventListener("click", () => { if (fn()) b.classList.add("busy"); });
      if (radio.on) radio.on("tape", e => { setTimeout(() => b.classList.remove("busy"), Math.max(0, ((e && e.until) - (radio.audioContext ? radio.audioContext.currentTime : 0)) * 1000) || 1500); }); };
    trick($p('[data-t="tape"]'), () => radio.tapeStop()); trick($p('[data-t="spin"]'), () => radio.spinBack());
    // GLITCH flashes when it fires a trick
    if (FKn.glitch && radio.on) { let gT = 0; radio.on("glitch", e => { const ctxT = radio.audioContext ? radio.audioContext.currentTime : 0, at = e && typeof e.t === "number" ? Math.max(0, (e.t - ctxT) * 1000) : 0;
      setTimeout(() => { FKn.glitch.el.classList.add("fired"); clearTimeout(gT); gT = setTimeout(() => FKn.glitch.el.classList.remove("fired"), 220); }, Math.min(4000, at)); }); }
    // S.fx: paint() reads radio.getFx(); reset() also turns UNDERWATER off (by clicking its button so the receiver's LED follows);
    // moved() is true if any FX differs from FD by more than .004 or UNDERWATER is on.
    S.fx = {
      paint() { const f = radio.getFx(); for (const k of Object.keys(FKn)) { FKn[k].set(Math.round(f[k] * 100)); FKn[k].state({ moved: Math.abs(f[k] - (FD[k] || 0)) > .004 }); } },
      reset() { fs.set(radio.resetFx()); if (uw && uwOn()) uw.click(); this.paint(); },
      moved: () => { const f = radio.getFx(); return Object.keys(FD).some(k => Math.abs(f[k] - FD[k]) > .004) || uwOn(); } };
  }

  // ---------- moved dots, the MIX LED, scope badges ----------
  // tl: the MIX toggle's wrapper on the deck; it gets .tuned (its LED lights) while anything in MIX is moved.
  const tl = toggle ? toggle.closest("label,.rd-btn") : null;
  // led(): mark each section and its tab .moved (the dot) from S[k].moved(), and light the MIX LED if any is.
  function led() { let anyM = false;
    for (const k of Object.keys(S)) { const m = S[k].moved(); anyM = anyM || m; const sec = $c(`.mx-sec[data-sec="${k}"]`), tab = $c(`[data-tab="${k}"]`);
      sec && sec.classList.toggle("moved", m); tab && tab.classList.toggle("moved", m); }
    if (tl) tl.classList.toggle("tuned", anyM); }
  // scope(): the "Mixing <station>" line and the THIS STATION badges on the per-station sections (STYLE, GROOVE).
  function scope() { const st = station(), nm = st ? st.name : "";
    $p("[data-scope]").textContent = nm ? `Mixing ${nm}` : "";
    for (const k of ["style", "groove"]) { const b = $p(`[data-badge="${k}"]`); if (b) b.textContent = nm ? `THIS STATION · ${nm}` : "THIS STATION"; } }
  // paintAll(): repaint every section, the scope line and the LED. Each section's own RESET button resets just that section.
  const paintAll = () => { for (const k of Object.keys(S)) S[k].paint(); scope(); led(); };
  for (const b of $$p("[data-reset]")) b.addEventListener("click", () => { const s = S[b.dataset.reset]; if (s) { s.reset(); led(); } });
  // RESET ALL asks twice: the first tap arms it for 3 s
  { const b = $p('[data-t="reset"]'), cap = b.parentNode.querySelector("small"); let armT = 0;
    b.addEventListener("click", () => { if (!b.classList.contains("armed")) { b.classList.add("armed"); cap.textContent = "TAP AGAIN"; b.setAttribute("aria-label", "Tap again to reset everything in MIX");
        clearTimeout(armT); armT = setTimeout(() => { b.classList.remove("armed"); cap.textContent = "RESET ALL"; b.setAttribute("aria-label", "Reset everything in MIX for this station"); }, 3000); return; }
      clearTimeout(armT); b.classList.remove("armed"); cap.textContent = "RESET ALL"; for (const k of Object.keys(S)) S[k].reset(); led(); }); }

  // ---------- ORIGINAL: hold to hear the station unmixed (setMixBypass); a quick tap on touch latches it until the next tap ----------
  const ob = $p('[data-t="orig"]'), bypNote = $p(".mx-bypnote");
  // BYP: the engine's bypass method name (setMixBypass, or the older setBypass), or null. bypOn(): is bypass on now.
  // bypPaint(v): show bypass state: the button, .mx-byp on the panel (dims the controls) and the "you hear the original" note.
  const bypOn = () => !!(BYP && (has("isMixBypass") ? radio.isMixBypass() : ob && ob.getAttribute("aria-pressed") === "true"));
  const bypPaint = v => { if (!ob) return; ob.setAttribute("aria-pressed", String(!!v)); ob.classList.toggle("on", !!v); panel.classList.toggle("mx-byp", !!v); bypNote.hidden = !v; };
    // held: the pointer currently pressing ORIGINAL ({id, start time, pointer type, was it latched}); latched: stays on after release.
    // go(v): switch bypass in the engine and repaint. Pointer capture keeps the release coming to this button even if the finger slides off.
  if (ob) { let held = null, latched = false;
    const go = v => { radio[BYP](!!v); bypPaint(v); };
    ob.addEventListener("pointerdown", e => { if (e.pointerType === "mouse" && e.button !== 0) return; e.preventDefault(); try { ob.setPointerCapture(e.pointerId); } catch (err) {}
      held = { id: e.pointerId, t: performance.now(), type: e.pointerType, was: latched }; if (!latched) go(true); });
    // rel: release. Under 350 ms counts as a tap.
    const rel = e => { if (!held || e.pointerId !== held.id) return; const h = held; held = null; const quick = performance.now() - h.t < 350;
      if (h.was) { latched = false; go(false); return; }   // a tap while latched lets go
      if (quick && h.type !== "mouse" && e.type === "pointerup") { latched = true; return; }   // touch: a quick tap keeps it on
      latched = false; go(false); };
    ob.addEventListener("pointerup", rel); ob.addEventListener("pointercancel", rel); ob.addEventListener("lostpointercapture", rel);
    ob.addEventListener("click", e => { if (e.detail !== 0) return; latched = !bypOn(); go(latched); });   // keyboard (Enter / Space) toggles
    ob.addEventListener("keydown", e => { if (e.key === "Escape" && bypOn()) { latched = false; go(false); e.stopPropagation(); } });
    // a held ORIGINAL lets go if the window loses focus or the page is hidden (the pointerup would never arrive)
    const letGo = () => { if (bypOn() && !latched) go(false); };
    win.addEventListener("blur", letGo); doc.addEventListener("visibilitychange", () => { if (doc.hidden) letGo(); }); }

  // ---------- repaint on the engine's events: the hub, the page and the API stay in step (coalesced to one paint per frame) ----------
  // dirty: { section key: time it was marked }; rafT: the pending repaint timer. later(...ks) marks sections and schedules one repaint.
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
  // secs: the section keys in S; tabs: the section tab buttons (also the accordion headers' twins). ui.section: the shown/last section.
  const secs = Object.keys(S), tabs = $$p("[data-tab]");
  if (!secs.includes(ui.section)) ui.section = secs[0];
  // layoutOf(w): drawer width in px -> "board" | "acc" | "tabs". L: the current layout ("" before the first applyLayout).
  const layoutOf = w => w >= 900 ? "board" : w >= 600 ? "acc" : "tabs";
  let L = "";
  // layoutGroove(): show only the chosen groove card (ui.grooveCard) on phones and sync the mini tabs.
  // segs_gt(): a tiny Seg-like setter for those mini tabs (aria-checked + roving tabindex).
  function layoutGroove() { const cards = $$p(".mx-gcards>.mx-card"); for (const c of cards) c.toggleAttribute("data-active", c.dataset.card === ui.grooveCard); if (S.groove) segs_gt().set(ui.grooveCard); }
  const segs_gt = () => ({ set(v) { $$p("[data-gtabs] button").forEach(b => { const on = b.dataset.v === v; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }); } });
  // applyLayout(w): pick the layout for width w (default: the panel's own width, its parent's while hidden, or 1000) and set panel[data-layout].
  // tabs: real ARIA tablist/tab/tabpanel; acc: the .mx-acc header buttons get aria-expanded; board: everything open.
  // Sets data-active (the shown section) and data-open (expanded) on each section. Returns true if the layout changed.
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
  // showSec(k, focus): show section k (select its tab; open it in acc and scroll to it in acc/board), save ui, re-layout,
  // and if focus, focus its tab (keyboard arrows on the tablist).
  const showSec = (k, focus) => { const sec = $p(`.mx-sec[data-sec="${k}"]`); if (!sec) return;
    if (L === "tabs") { ui.section = k; } else if (L === "acc") { ui.acc[k] = true; ui.section = k; } else ui.section = k;
    saveUI(); applyLayout(); resized(); eqWake();
    if (L !== "tabs") setTimeout(() => sec.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }), 30);
    if (focus) { const t = $p(`[data-tab="${k}"]`); t && t.focus({ preventScroll: true }); } };
  // tab clicks; in tabs layout Left/Right move between tabs with wrap-around (ARIA tabs pattern)
  for (const t of tabs) { t.addEventListener("click", () => showSec(t.dataset.tab));
    t.addEventListener("keydown", e => { if (L !== "tabs") return; const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault();
      const i = (tabs.indexOf(t) + d + tabs.length) % tabs.length; showSec(tabs[i].dataset.tab, true); }); }
  // accordion headers toggle their section (only in the acc layout)
  for (const ab of $$p(".mx-acc")) ab.addEventListener("click", () => { if (L !== "acc") return; const k = ab.closest(".mx-sec").dataset.sec; ui.acc[k] = !ui.acc[k]; if (ui.acc[k]) ui.section = k; saveUI(); applyLayout(); resized(); });
  // re-layout when the drawer's width changes (the page or a side panel resizing); skipped while hidden
  if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (!panel.hidden && applyLayout()) resized(); }).observe(panel);

  // ---------- open / close: grid-template-rows 0fr -> 1fr; the page grows, nothing floats ----------
  // resized(): tell the page ("mdfm:mixresize" on window, {open, layout}) that the drawer changed size; debounced 30 ms.
  // animT: the open/close animation timer; isOpen: is the drawer open (read by BEAT's poll, LITE, VOID).
  let resizeT = 0;
  function resized() { clearTimeout(resizeT); resizeT = setTimeout(() => { try { win.dispatchEvent(new CustomEvent("mdfm:mixresize", { detail: { open: !panel.hidden, layout: L } })); } catch (e) {} }, 30); }
  let animT = 0, isOpen = false;
  // ---------- 1.26 LITE (mobile mix): AUTO = phones and tablets (touch-first, or an iPad that says it's a Mac) ----------
  // liteAuto(): a phone or tablet by user agent, an iPadOS device reporting "MacIntel" with touch points, or a coarse pointer.
  const liteAuto = () => { const n = win.navigator || {}, ua = n.userAgent || "";
    return /iPhone|iPad|iPod|Android/i.test(ua) || (n.platform === "MacIntel" && (n.maxTouchPoints || 0) > 1) || coarse(); };
  // ui.lite: "auto" | "on" | "off" (the LITE button cycles them). liteWanted(): should LITE be on while MIX is open.
  if (!["auto", "on", "off"].includes(ui.lite)) ui.lite = "auto";
  const liteWanted = () => ui.lite === "on" || (ui.lite === "auto" && liteAuto());
  // spotsHeld: the talk-break (spots) setting saved when LITE paused it, null when LITE isn't holding it.
  let spotsHeld = null;
  // applyLite(): LITE is active only while MIX is open. Sets html.mx-lite (CSS drops shadows, pauses page animations),
  // window.MDFM_lite, radio.setLite (lighter engine work) and prewarmMix, pauses talk breaks, and repaints the LITE button (shows the mode).
  function applyLite() { const act = isOpen && liteWanted(), root = doc.documentElement;
    root.classList.toggle("mx-lite", act); try { win.MDFM_lite = act; } catch (e) {}
    if (has("setLite")) radio.setLite(act);
    if (act && has("prewarmMix")) radio.prewarmMix();
    if (act && spotsHeld === null && has("getSpots") && has("setSpots")) { spotsHeld = radio.getSpots(); radio.setSpots(false); }   // MDFM's talk breaks wait while you mix
    else if (!act && spotsHeld !== null) { radio.setSpots(spotsHeld); spotsHeld = null; }
    const lb = $p('[data-t="lite"]'); if (lb) { lb.setAttribute("aria-pressed", String(act)); lb.classList.toggle("on", act); lb.querySelector("[data-lite-v]").textContent = ui.lite.toUpperCase(); } }
  { const lb = $p('[data-t="lite"]'); if (lb) lb.addEventListener("click", () => { ui.lite = { auto: "on", on: "off", off: "auto" }[ui.lite]; saveUI(); applyLite(); }); }
  // ---------- 1.27 VOID: flat dark blocks while MIX is open (its own switch, remembered in mdfmMixUI.void) ----------
  // applyVoid(): VOID is active only while MIX is open and ui.void is set. Sets html.mx-void and disables the receiver skin's
  // stylesheet (#meddev-skin-theme; data-voided marks that VOID did it, so a skin that was already off stays off), then emits "mdfm:void".
  function applyVoid() { const act = isOpen && !!ui.void, root = doc.documentElement; root.classList.toggle("mx-void", act);
    const th = doc.getElementById("meddev-skin-theme"); if (th) { if (act && !th.disabled) { th.disabled = true; th.dataset.voided = "1"; } else if (!act && th.dataset.voided) { th.disabled = false; delete th.dataset.voided; } }
    try { win.dispatchEvent(new CustomEvent("mdfm:void", { detail: { on: act } })); } catch (e) {}
    const vb = $p('[data-t="void"]'); if (vb) { vb.setAttribute("aria-pressed", String(act)); vb.classList.toggle("on", act); } }
  { const vb = $p('[data-t="void"]'); if (vb) vb.addEventListener("click", () => { ui.void = !ui.void; saveUI(); applyVoid(); }); }
  // ---------- 1.27 PERF: an on-screen readout (frame rate, longest freeze, notes on time); stays up until turned off ----------
  // perfBox: the readout element (null when off); perfT: its 500 ms update timer; perfRaf: the frame counter's requestAnimationFrame id.
  let perfBox = null, perfT = 0, perfRaf = 0;
  // perfOn(on): show or remove the PERF readout (needs radio.perfStats). It counts frames with requestAnimationFrame,
  // and every 500 ms reads (and resets) the scheduler's counters: late (skipped) steps, tight (near-miss) steps, steps, minLead
  // (the least time, in seconds, a note was scheduled ahead). It shows the last 5 s; red for a skipped note or a freeze > 250 ms,
  // amber for near misses or a freeze > 100 ms. 9 is a "no reading" sentinel for minLead.
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
  // open(v, {restore}): open or close the drawer. Syncs the toggle (checkbox or aria-pressed button, aria-expanded), saves ui.open,
  // and switches LITE and VOID with it. Opening: unhide, lay out, repaint, then animate from .mx-shut (grid rows 0fr) to 1fr;
  // the forced reflow (void panel.offsetHeight) makes the browser see the 0fr start. 260 ms matches the .22 s CSS transition.
  // .mx-settled (after the animation) lets popups overflow. Closing: inert during the animation, then hidden.
  // restore (reopening at page load) and reduced motion skip the animation. Opening also focuses the section tab and,
  // outside the board layout, scrolls the drawer's title into view.
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
  // the toggle may be a checkbox ("change") or a button ("click"); either way it controls the panel (aria-controls)
  if (toggle) { toggle.setAttribute("aria-controls", panel.id || ""); toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener(toggle.type === "checkbox" ? "change" : "click", () => open(toggle.type === "checkbox" ? toggle.checked : !isOpen)); }
  // close(): close and give focus back to the toggle. Escape anywhere in the drawer closes it unless a control used the key.
  const close = () => { open(false); toggle && toggle.focus(); };
  $p(".mx-close").addEventListener("click", close);
  panel.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); } });
  // a pointerdown anywhere outside a value bubble (.mx-bub, the typed-value editor) closes it; capture phase so it runs first
  doc.addEventListener("pointerdown", e => { for (const b of $$p(".mx-bub")) if (!b.contains(e.target)) b.remove(); }, true);

  // first paint, laid out as the board (the hidden drawer has no width yet; the real layout comes when it opens)
  paintAll(); applyLayout(1000);
  // the drawer comes back open where it was left open, except on a phone, where the deck shows first
  if (ui.open && !(coarse() && (win.innerWidth || 1000) < 640)) open(true, { restore: true }); else { ui.open = false; }
  // the EQ canvas measures again when audio starts. Returns the MIX API:
  //   open(v), isOpen(), section(k) = show section k, paint() = repaint all, get()/set(o) = the SOUND (EQ/tone) settings
  if (radio.on) radio.on("start", eqWake);
  return { open, isOpen: () => isOpen, section: k => showSec(k), paint: paintAll, get: () => (S.sound ? S.sound.get() : {}), set: o => S.sound && S.sound.set(o) };
}
const mountTune = mountMix;   // older pages (the hub up to v102, kit apps) call mountTune

// ===== MIX_CSS =====
// All of the MIX drawer's CSS, injected once by mountMix. No comments go inside the template string (that would change the CSS);
// its sections, in order:
//   - LITE / VOID / PERF buttons, and html.mx-lite: no text shadows, page animations paused (MIX's own keep running, no transitions),
//     glass and LCD overlays hidden, canvas filters off
//   - the PERF readout box (fixed bottom-right, safe-area aware, warn/bad colours, touches pass through except its close button)
//   - 1.27 VOID (html.mx-void): flat dark colour tokens (--v-*), strips every image, shadow, filter, animation and skin decoration,
//     flat blocks for panels, screens, buttons and knobs, lit edges (--v-glow, the station's LCD colour) for pressed/selected controls
//   - the drawer: grid-template-rows 0fr/1fr open/close animation (.mx-shut, .mx-settled), reduced motion
//   - header, scope line, tabs, moved dots, RESET ALL (armed state), section heads, accordion headers (▸/▾)
//   - knobs (.mx-k, --ks size; bigger under pointer:coarse), value labels, FINE marker, value bubble, SONG buttons, segmented rows
//   - GROOVE: BPM LCD, key row (piano-style), faders, the groove cards (mini tabs on phones)
//   - 1.31 BEAT step grid: tools, lanes, 16 cells (data-v colours: 1 soft, 2 hit, 3 loud, -1 rest ✕; .own song dot, .ph playhead,
//     .fire sounding), container queries stack lanes under 560 px, and VOID overrides that keep the grid readable
//   - layouts: [data-layout=board] (a column grid; GROOVE beside STYLE), acc (closed sections hide their body),
//     tabs (only the active section and groove card show)
//   - ORIGINAL (bypass) button and dimming, the EQ graph and its nodes, the XY pad and puck, STYLE faders/lights/lanes,
//     "more" disclosures, drums and FX tricks, and the GLITCH .fired flash
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
html.mx-void header.top .wctl{position:static!important;transform:none!important;height:auto!important;padding:0!important;margin:0 18px 0 0!important;background:none!important}
html.mx-void .lcd,html.mx-void .vu-glass,html.mx-void input,html.mx-void select,html.mx-void textarea,html.mx-void .mx-eqg{background-color:var(--v-scr)!important;border:1px solid var(--v-line)!important;border-radius:6px!important}
html.mx-void .btn,html.mx-void .wbtn button,html.mx-void .stbtn,html.mx-void .seg button,html.mx-void .tabs button,html.mx-void .mixdrawer button:where(:not(.rd-knob,.mx-eqn,.mx-puck,.mx-acc,.mx-bt-c)){background-color:var(--v-blk2)!important;border:1px solid var(--v-line)!important;border-radius:6px!important;color:var(--v-txt)!important}
html.mx-void .btn:hover,html.mx-void .mixdrawer button:where(:not(.rd-knob,.mx-eqn,.mx-puck,.mx-acc,.mx-bt-c)):hover{background-color:var(--v-blk3)!important}
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
.mx-gcards>[data-card=beat]{grid-column:1/-1}
/* 1.31 BEAT: the step grid */
.mx-beat{container-type:inline-size}
.mx-bt-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px}
.mx-bt-sw{display:flex;flex-wrap:wrap;gap:8px}
.mx-bt-tools.mx-seg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.mx-bt-tools.mx-seg>.btn{min-height:44px;min-width:0;padding:0 4px;font:700 .58rem/1 Tahoma,Verdana,sans-serif;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-bt-grid{display:grid;gap:6px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.mx-bt-lane{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:center}
.mx-bt-ln{font:700 .58rem/1.15 Tahoma,Verdana,sans-serif;letter-spacing:.1em;color:var(--caption,#cfd2de);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-bt-cells{display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:3px}
.mx-bt-c{position:relative;min-height:36px;min-width:0;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:4px;background:rgba(0,0,0,.35);cursor:pointer;touch-action:pan-y;color:#7fe22a;font:700 .9rem/1 Tahoma,Verdana,sans-serif}
.mx-bt-c:nth-child(4n+1){background:rgba(255,255,255,.07)}
.mx-bt-c:nth-child(4n+5){margin-left:5px}
.mx-bt-c::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(226,229,238,.0)}
.mx-bt-c.own::after{background:rgba(226,229,238,.32)}
.mx-bt-c[data-v="2"],.mx-bt-c[data-v="3"]{background:#3d7a14;border-color:#7fe22a}
.mx-bt-c[data-v="3"]{background:#7fe22a;box-shadow:0 0 8px rgba(127,226,42,.55)}
.mx-bt-c[data-v="1"]{background:rgba(127,226,42,.22);border-color:rgba(127,226,42,.55)}
.mx-bt-c[data-v="-1"]{background:rgba(0,0,0,.5);border-color:rgba(255,120,90,.55)}
.mx-bt-c[data-v="-1"]::before{content:"✕";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff8a6a;font-size:.8rem}
.mx-bt-c.own[data-v="2"]::after,.mx-bt-c.own[data-v="3"]::after{background:rgba(0,0,0,.35)}
.mx-bt-c.ph{outline:2px solid rgba(255,255,255,.55);outline-offset:-2px}
.mx-bt-c.fire{box-shadow:0 0 0 2px #ffd23f,0 0 10px rgba(255,210,63,.6)}
.mx-bt-c:focus-visible{outline:2px solid #ffd23f;outline-offset:1px;z-index:1}
.mx-bt-c:disabled{cursor:default;opacity:.45}
.mx-bt-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.mx-bt-pre{flex:1 1 160px;min-width:0}.mx-bt-pre select{min-height:44px;width:100%}
.mx-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.mx-bt-note{margin:0;font-size:.74rem;line-height:1.35;color:var(--caption,#cfd2de);opacity:.85}
.mx-beat.na .mx-bt-grid{opacity:.5}
@media (pointer:coarse){.mx-bt-c{min-height:44px}}
@container (max-width:560px){.mx-bt-lane{grid-template-columns:minmax(0,1fr)}.mx-bt-ln{padding-top:2px}.mx-bt-cells{grid-template-columns:repeat(8,minmax(0,1fr));row-gap:6px}.mx-bt-c:nth-child(4n+5){margin-left:0}.mx-bt-c:nth-child(8n+5){margin-left:5px}.mx-bt-c{min-height:40px}}
@container (max-width:560px){.mx-bt-cells{row-gap:8px}.mx-bt-acts .btn{flex:1 1 auto}}
@media (pointer:coarse){.mx-bt-c{min-height:44px}}
/* VOID (flat dark) keeps the grid readable: its own fills, and outlines instead of glows */
html.mx-void .mixdrawer .mx-bt-c{background-color:#15171c!important;border:1px solid #3a3d47!important;border-radius:4px!important}
html.mx-void .mixdrawer .mx-bt-c:nth-child(4n+1){background-color:#22252c!important}
html.mx-void .mixdrawer .mx-bt-c[data-v="1"]{background-color:#2c4a18!important;border-color:#6aa83a!important}
html.mx-void .mixdrawer .mx-bt-c[data-v="2"]{background-color:#4f9a1c!important;border-color:#7fe22a!important}
html.mx-void .mixdrawer .mx-bt-c[data-v="3"]{background-color:#8be83a!important;border-color:#d8ffb0!important}
html.mx-void .mixdrawer .mx-bt-c[data-v="-1"]{background-color:#0c0d10!important;border-color:#b5553f!important}
html.mx-void .mixdrawer .mx-bt-c.own::after{background-color:rgba(226,229,238,.45)!important}
html.mx-void .mixdrawer .mx-bt-c.own[data-v="2"]::after,html.mx-void .mixdrawer .mx-bt-c.own[data-v="3"]::after{background-color:rgba(0,0,0,.45)!important}
html.mx-void .mixdrawer .mx-bt-c.ph{outline:2px solid #e2e5ee!important;outline-offset:-2px!important}
html.mx-void .mixdrawer .mx-bt-c.fire{outline:3px solid #ffd23f!important;outline-offset:-3px!important}
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
