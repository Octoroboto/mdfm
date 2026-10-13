/* TUNE: the sound-tuning pop-out (MDFM.mountTune). Builds the knobs, presets and room picker inside `panel` and wires
   them to radio.setSound(). `toggle` (a checkbox) opens and closes it. Settings are kept on this device (localStorage
   "mdfmSound") unless opts.store = { get(), set(sound) } is given. Styles: .tunepop and friends in skin/radio.css. */
function mountTune(radio, { panel, toggle, store, mixStore, grooveStore, title = "Sound tuning" } = {}) {
  if (!radio || typeof radio.setSound !== "function" || !panel) return null;
  const DEF = radio.soundDefaults(), uid = "t" + Math.random().toString(36).slice(2, 7);
  const KNOBS = [["realism", "REALISM", "MIN", "MAX", "How real it sounds: speakers in a room, a little glue and air"],
    ["width", "SOUNDSTAGE", "MONO", "WIDE", "How wide the stereo picture is (the middle is as it is now)"],
    ["clarity", "CLARITY", "MIN", "MAX", "Less mud, more presence and air"],
    ["warmth", "WARMTH", "MIN", "MAX", "Rich, warm tape and console colour"],
    ["room", "ROOM", "DRY", "FULL", "How much of the listening room you hear (pick the room above)"],
    ["rattle", "TRUNK RATTLE", "OFF", "MAX", "Loose panels buzzing on heavy sub bass"],
    ["grain", "RADIO GRAIN", "OFF", "MAX", "Hiss, crackle, a narrower band and a little flutter"],
    ["ambience", "AMBIENCE", "OFF", "MORE", "Background sounds under the music: HEARYE's forests, taverns and caves, WYBC's concert-hall room, MDFM's vinyl crackle (the middle is the station's own)"]];
  const st = store || { get() { try { return JSON.parse(localStorage.getItem("mdfmSound") || "null"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem("mdfmSound", JSON.stringify(v)); } catch (e) {} } };
  let cur = radio.getSound(); const saved = st.get(); if (saved) cur = radio.setSound(saved);
  panel.classList.add("pop", "tunepop"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", uid + "h"); panel.hidden = true;
  panel.innerHTML = `<div class="wtitle"><span id="${uid}h"></span></div><div class="tunerow"><label class="tunefld">Preset <select data-t="preset" aria-label="Sound preset"></select></label><label class="tunefld">Room <select data-t="room" aria-label="Listening room"></select></label><div class="tunebtns"><div class="rd-btn"><button type="button" data-t="reset" title="Everything back: the knobs, and this station's style matrix and groove" aria-label="Reset all sound tuning for this station"></button><small>RESET</small></div><div class="rd-btn"><button type="button" data-t="close" title="Close sound tuning" aria-label="Close sound tuning"></button><small>CLOSE</small></div></div></div><div class="rd-knobs tuneknobs" role="group" aria-label="Sound tuning knobs"></div><p class="tunehint">With every knob at its start mark the station sounds exactly as it always has. Double-click a knob to put it back.</p>` +
    (typeof radio.setStyleMix === "function" ? `<div class="tunemix" role="group" aria-labelledby="${uid}m"><div class="tunemixhd"><span class="tunemixt" id="${uid}m">STYLE MATRIX</span><span class="tunemixst" data-t="mixst"></span><div class="rd-btn"><button type="button" data-t="mixzero" title="Every style back to zero on this station" aria-label="Reset the style matrix for this station"></button><small>ZERO</small></div></div><div class="tunesliders"></div>${typeof radio.setGroove === "function" ? `<div class="tunegrv" role="group" aria-labelledby="${uid}g"></div>` : ""}<p class="tunehint">The song on air is the middle. Drag out toward a style to pull the song that way: its instruments, groove, tempo and sound move toward the style; pull several ways at once to blend them. Each station keeps its own. Double-click a point to put it back.${typeof radio.setGroove === "function" ? " Beside it: the tempo, time signature, swing, length, key and drums, also per station; Save takes all of it." : ""}</p></div>` : "");
  panel.querySelector(`#${uid}h`).textContent = title;
  const q = k => panel.querySelector(`[data-t="${k}"]`), pre = q("preset"), room = q("room"), kn = panel.querySelector(".tuneknobs");
  for (const r of radio.rooms()) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.name; room.appendChild(o); }
  const presets = radio.soundPresets(); for (const p of [...presets, { id: "custom", name: "Custom" }]) { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name; pre.appendChild(o); }
  const same = (a, b) => Object.keys(DEF).every(k => k === "roomType" ? (a.room === 0 && b.room === 0) || a.roomType === b.roomType : Math.abs(a[k] - b[k]) < .005);
  const pct = v => Math.round(v * 100), knobs = {};
  let ticks = ""; for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * Math.PI / 180; ticks += `<circle cx="${30 + Math.sin(a) * 27}" cy="${30 - Math.cos(a) * 27}" r="${i === 0 || i === 10 || i === 5 ? 1.4 : .9}" fill="rgba(226,229,238,.75)"/>`; }
  for (const [k, label, lo, hi, tip] of KNOBS) { const d = document.createElement("div"); d.className = "rd-k"; d.dataset.sk = k; const id = `${uid}_${k}`;
    d.innerHTML = `<div class="rd-dial"><svg class="rd-ticks" viewBox="0 0 60 60" aria-hidden="true">${ticks}</svg><div class="rd-knob" role="slider" tabindex="0" aria-labelledby="${id}" aria-valuemin="0" aria-valuemax="100"></div></div><div class="rd-mm"><span>${lo}</span><span>${hi}</span></div><small id="${id}">${label}</small>`;
    d.querySelector(".rd-knob").title = tip; kn.appendChild(d); knobs[k] = d; }
  let show = () => { for (const [k] of KNOBS) { const d = knobs[k], el = d.querySelector(".rd-knob"), v = cur[k]; el.style.transform = `rotate(${-135 + v * 270}deg)`;
      el.setAttribute("aria-valuenow", String(pct(v))); el.setAttribute("aria-valuetext", k === "width" ? (v < .48 ? `narrower (${pct(v)})` : v > .52 ? `wider (${pct(v)})` : "as it is") : k === "ambience" ? (v === 0 ? "off" : v < .48 ? `quieter (${pct(v)})` : v > .52 ? `louder (${pct(v)})` : "the station's own") : v === 0 ? "off" : pct(v) + " percent");
      d.classList.toggle("moved", Math.abs(v - DEF[k]) > .005); }
    room.value = cur.roomType; const m = presets.find(p => same(p.sound, cur)); pre.value = m ? m.id : "custom";
    if (toggle) toggle.closest("label,.rd-btn")?.classList.toggle("tuned", !same(cur, DEF)); };
  const set = o => { cur = radio.setSound(o); st.set(cur); show(); };
  const clamp = v => Math.max(0, Math.min(1, v));
  for (const [k] of KNOBS) { const el = knobs[k].querySelector(".rd-knob"); let y0 = 0, v0 = 0, drag = false;
    el.addEventListener("pointerdown", e => { drag = true; y0 = e.clientY; v0 = cur[k]; el.setPointerCapture(e.pointerId); e.preventDefault(); });
    el.addEventListener("pointermove", e => { if (drag) set({ [k]: clamp(v0 + (y0 - e.clientY) / 160) }); });
    const end = () => { drag = false; }; el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", e => { e.preventDefault(); set({ [k]: clamp(cur[k] - e.deltaY * .0015) }); }, { passive: false });
    el.addEventListener("dblclick", () => set({ [k]: DEF[k] }));
    el.addEventListener("keydown", e => { const s = { ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05, PageUp: .2, PageDown: -.2 }[e.key];
      if (s != null) { set({ [k]: clamp(cur[k] + s) }); e.preventDefault(); } else if (e.key === "Home") { set({ [k]: 0 }); e.preventDefault(); } else if (e.key === "End") { set({ [k]: 1 }); e.preventDefault(); } }); }
  room.addEventListener("change", () => set({ roomType: room.value, room: cur.room || .5 }));
  pre.addEventListener("change", () => { const p = presets.find(x => x.id === pre.value); if (p) set(p.sound); });
  q("reset").addEventListener("click", () => { cur = radio.resetSound(); st.set(cur); show(); resetAll(); });   // the knobs, plus this station's style matrix and groove
  const open = v => { panel.hidden = !v; if (toggle) { if ("checked" in toggle) toggle.checked = v; else toggle.setAttribute("aria-pressed", String(v)); toggle.setAttribute("aria-expanded", String(v)); }
    if (v) setTimeout(() => { const f = panel.querySelector(".rd-knob"); f && f.focus({ preventScroll: true }); }, 0); };
  if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.addEventListener(toggle.type === "checkbox" ? "change" : "click", () => open(toggle.type === "checkbox" ? toggle.checked : panel.hidden)); }
  q("close").addEventListener("click", () => { open(false); toggle && toggle.focus(); });
  panel.addEventListener("keydown", e => { if (e.key === "Escape") { open(false); toggle && toggle.focus(); } });
  // the style matrix: a radar chart, one axis per style. The song on air is the middle; drag out along an axis (or tab to a
  // handle and use the arrow keys) to pull it toward that style. Per station, kept in localStorage "mdfmStyleMix" unless opts.mixStore.
  const mixBox = panel.querySelector(".tunesliders"); let mixOn = () => false, grvOn = () => false, resetAll = () => {};
  if (mixBox) {
    const ms = mixStore || { get() { try { return JSON.parse(localStorage.getItem("mdfmStyleMix") || "null"); } catch (e) { return null; } },
      set(v) { try { localStorage.setItem("mdfmStyleMix", JSON.stringify(v)); } catch (e) {} } };
    const all = ms.get() || {}; for (const id in all) radio.setStyleMix(all[id], id);
    const sid = () => (radio.getStation && radio.getStation() ? radio.getStation().id : "mdfm"), keys = radio.styleMixKeys(), N = keys.length, RR = 104, NS = "http://www.w3.org/2000/svg";
    const ang = i => (-90 + i * 360 / N) * Math.PI / 180, pt = (i, r) => [Math.cos(ang(i)) * r, Math.sin(ang(i)) * r];
    const poly = r => keys.map((_, i) => pt(i, r).map(x => x.toFixed(1)).join(",")).join(" ");
    let svg = `<svg class="tradar" viewBox="-222 -150 444 300" role="group" aria-label="Style matrix: drag out from the middle toward a style">`;
    for (let k = 1; k <= 5; k++) svg += `<polygon class="tr-ring${k === 5 ? " out" : ""}" points="${poly(RR * k / 5)}"/>`;
    keys.forEach((_, i) => { const [x, y] = pt(i, RR); svg += `<line class="tr-ax" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
    svg += `<polygon class="tr-shape" points=""/><circle class="tr-song" r="5"><title>The song as it is</title></circle>`;
    keys.forEach(([k, label], i) => { const [x, y] = pt(i, RR + 20), anc = Math.abs(x) < 8 ? "middle" : x > 0 ? "start" : "end", words = label.split(" ");
      svg += `<text class="tr-lab${k === "chaos" ? " chaos" : ""}" x="${x.toFixed(1)}" y="${(y + (y > 10 ? 6 : y < -10 ? -6 - (words.length - 1) * 10 : -(words.length - 1) * 5)).toFixed(1)}" text-anchor="${anc}">${words.map((w, j) => `<tspan x="${x.toFixed(1)}" dy="${j ? 10 : 0}">${w}</tspan>`).join("")}<tspan class="tr-val" x="${x.toFixed(1)}" dy="11" data-v="${k}">0%</tspan></text>`;
      svg += `<circle class="tr-h${k === "chaos" ? " chaos" : ""}" r="7" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-label="${label} pull" data-k="${k}"><title>${keys[i][2]}</title></circle>`; });
    mixBox.innerHTML = svg + "</svg>"; mixBox.classList.add("tuneradarbox");
    const S = mixBox.querySelector("svg"), shape = S.querySelector(".tr-shape"), hs = [...S.querySelectorAll(".tr-h")];
    const save = v => { all[sid()] = v; ms.set(all); };
    const setK = (k, v) => { v = Math.max(0, Math.min(1, v)); if (v < .04) v = 0; save(radio.setStyleMix({ [k]: v })); paintMix(); };   // a hair from the middle is the middle
    const paintMix = () => { const m = radio.getStyleMix(), st = radio.getStation ? radio.getStation() : null; q("mixst").textContent = st ? `for ${st.name}` : "";
      shape.setAttribute("points", keys.map(([k], i) => pt(i, Math.max(.0001, m[k] || 0) * RR).map(x => x.toFixed(1)).join(",")).join(" "));
      keys.forEach(([k], i) => { const v = m[k] || 0, [x, y] = pt(i, Math.max(v, .1) * RR), h = hs[i]; h.setAttribute("cx", x.toFixed(1)); h.setAttribute("cy", y.toFixed(1)); h.setAttribute("r", v > 0 ? "7" : "4.5");
        h.setAttribute("aria-valuenow", String(Math.round(v * 100))); h.setAttribute("aria-valuetext", v ? Math.round(v * 100) + " percent" : "off"); h.classList.toggle("moved", v > 0);
        S.querySelector(`[data-v="${k}"]`).textContent = Math.round(v * 100) + "%"; });
      S.classList.toggle("moved", mixOn()); if (toggle) toggle.closest("label,.rd-btn")?.classList.toggle("tuned", !same(cur, DEF) || mixOn() || grvOn()); };
    mixOn = () => { const m = radio.getStyleMix(); return Object.values(m).some(v => v > .001); };
    // drag: the nearest axis to where you press, then along it
    const local = e => { const p = S.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const r = p.matrixTransform(S.getScreenCTM().inverse()); return [r.x, r.y]; };
    let dragK = null;
    const pull = (e, k) => { const [x, y] = local(e), i = keys.findIndex(z => z[0] === k), [ux, uy] = pt(i, 1); setK(k, (x * ux + y * uy) / RR); };
    let pend = false;   // pressed in the middle: the axis is picked once the pointer heads somewhere
    const near = (x, y) => { let best = 0, bd = 9; const a = Math.atan2(y, x); keys.forEach((_, i) => { let d = Math.abs(a - ang(i)); d = Math.min(d, 2 * Math.PI - d); if (d < bd) { bd = d; best = i; } }); return keys[best][0]; };
    S.addEventListener("pointerdown", e => { const [x, y] = local(e), r = Math.hypot(x, y); if (r > RR + 30) return; const h = e.target.closest && e.target.closest(".tr-h");
      S.setPointerCapture(e.pointerId); e.preventDefault(); if (h && (radio.getStyleMix()[h.dataset.k] || 0) > .1) { dragK = h.dataset.k; return; }
      if (r < 16) { pend = true; dragK = null; return; } dragK = near(x, y); pull(e, dragK); });
    S.addEventListener("pointermove", e => { if (pend) { const [x, y] = local(e); if (Math.hypot(x, y) < 16) return; pend = false; dragK = near(x, y); } if (dragK) pull(e, dragK); });
    const end = () => { dragK = null; pend = false; }; S.addEventListener("pointerup", end); S.addEventListener("pointercancel", end);
    for (const h of hs) { const k = h.dataset.k;
      h.addEventListener("keydown", e => { const m = radio.getStyleMix()[k] || 0, d = { ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05, PageUp: .2, PageDown: -.2 }[e.key];
        if (d != null) { setK(k, m + d); e.preventDefault(); } else if (e.key === "Home") { setK(k, 0); e.preventDefault(); } else if (e.key === "End") { setK(k, 1); e.preventDefault(); } });
      h.addEventListener("dblclick", () => setK(k, 0)); }
    q("mixzero").addEventListener("click", () => { save(radio.resetStyleMix()); paintMix(); });
    const ra0 = resetAll; resetAll = () => { ra0(); save(radio.resetStyleMix()); paintMix(); };
    if (radio.on) radio.on("station", paintMix); paintMix();
  }
  // groove and key: tempo, time signature, swing, length, key and mode, and the drums. Per station, kept in localStorage
  // "mdfmGroove" unless opts.grooveStore. Each control's middle (or far left for BPM) is the song as written.
  const gBox = panel.querySelector(".tunegrv");
  if (gBox) {
    const gs = grooveStore || { get() { try { return JSON.parse(localStorage.getItem("mdfmGroove") || "null"); } catch (e) { return null; } },
      set(v) { try { localStorage.setItem("mdfmGroove", JSON.stringify(v)); } catch (e) {} } };
    const gall = gs.get() || {}; for (const id in gall) radio.setGroove(gall[id], id);
    const GD = radio.grooveDefaults(), tips = Object.fromEntries(radio.grooveKeys().map(([k, , tip]) => [k, tip]));
    const sid = () => (radio.getStation && radio.getStation() ? radio.getStation().id : "mdfm");
    const NOTES = ["C", "C♯ / D♭", "D", "E♭", "E", "F", "F♯ / G♭", "G", "A♭", "A", "B♭", "B"];
    const lenMul = v => v < .5 ? .5 + v : 1 + (v - .5) * 4, lvl = v => v < .5 ? Math.pow(v * 2, 1.6) : 1 + (v - .5) * 2;
    const sign = v => (v > 0 ? "+" : "−") + Math.abs(v);
    const SL = { bpm: ["BPM", 39, 220, 1, v => v ? String(v) : "SONG"], swing: ["SWING", 0, 100, 1, v => Math.abs(v - 50) < 1 ? "SONG" : sign(Math.round((v - 50) * 2))],
      length: ["LENGTH", 0, 100, 1, v => Math.abs(v - 50) < 1 ? "SONG" : "×" + lenMul(v / 100).toFixed(1)],
      density: ["DENSITY", 0, 100, 1, v => Math.abs(v - 50) < 1 ? "SONG" : v < 50 ? "SPARSE " + (50 - v) * 2 : "BUSY " + (v - 50) * 2],
      fills: ["FILLS", 0, 100, 1, v => Math.abs(v - 50) < 1 ? "SONG" : v < 50 ? (v === 0 ? "NONE" : "FEWER") : v === 100 ? "LOTS" : "MORE"],
      feel: ["FEEL", 0, 2, 1, v => ["HALF", "NORMAL", "DOUBLE"][v]], humanize: ["HUMANIZE", 0, 100, 1, v => v ? v + "%" : "OFF"],
      drums: ["DRUMS", 0, 100, 1, v => v === 0 ? "OFF" : Math.abs(v - 50) < 1 ? "0 dB" : (v > 50 ? "+" : "") + (20 * Math.log10(lvl(v / 100))).toFixed(1) + " dB"] };
    const snap = (k, x) => k === "humanize" ? (x <= 2 ? 0 : x) : ["swing", "length", "density", "fills", "drums"].includes(k) && Math.abs(x - 50) <= 2 ? 50 : x;   // near the default is the default
    const toUI = (k, v) => k === "bpm" ? (v || 39) : k === "feel" ? Math.round(v * 2) : Math.round(v * 100), fromUI = (k, x) => k === "bpm" ? (x < 40 ? 0 : x) : k === "feel" ? x / 2 : x / 100;
    const row = k => { const [lab, mn, mx, stp] = SL[k], id = `${uid}g_${k}`; return `<div class="tg-row" data-gk="${k}"><label class="tg-l" for="${id}">${lab}</label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${stp}" data-g="${k}" title="${tips[k] || ""}"><output class="tg-v" for="${id}" data-gv="${k}"></output></div>`; };
    gBox.innerHTML = `<div class="tunemixhd tg-hd"><span class="tunemixt" id="${uid}g">GROOVE &amp; KEY</span><span class="tunemixst" data-t="grvst"></span><div class="rd-btn"><button type="button" data-t="grvreset" title="Tempo, time, key and drums back to the song as written on this station" aria-label="Reset groove and key for this station"></button><small>RESET</small></div></div>` +
      `<div class="tg-sec">${row("bpm")}<div class="tg-row" data-gk="meter"><label class="tg-l" for="${uid}g_meter">TIME</label><select id="${uid}g_meter" data-g="meter" title="${tips.meter}"><option value="">Song's (4/4)</option>${radio.meters().map(m => `<option value="${m}">${m}</option>`).join("")}</select></div>${row("swing")}${row("length")}</div>` +
      `<div class="tg-sec tg-key" data-gk="key"><div class="tg-row"><label class="tg-l" for="${uid}g_root">KEY</label><select id="${uid}g_root" data-g="root" title="${tips.root}"><option value="-1">Song's key</option>${NOTES.map((n, i) => `<option value="${i}">${n}</option>`).join("")}</select></div>` +
      `<div class="tg-row"><label class="tg-l" for="${uid}g_mode">MODE</label><select id="${uid}g_mode" data-g="mode" title="${tips.mode}"><option value="">Song's scale</option>${radio.keyModes().map(m => `<option value="${m.id}">${m.name}</option>`).join("")}</select></div></div>` +
      `<div class="tg-sec" data-gk="drums"><span class="tg-sub">DRUMS</span>${["density", "fills", "feel", "humanize", "drums"].map(row).join("")}</div>`;
    const gq = k => gBox.querySelector(`[data-g="${k}"]`), gsave = v => { gall[sid()] = v; gs.set(gall); };
    grvOn = () => { const g = radio.getGroove(); return Object.keys(GD).some(k => typeof GD[k] === "number" ? Math.abs(g[k] - GD[k]) > .005 : g[k] !== GD[k]); };
    const paintG = () => { const g = radio.getGroove(), sup = radio.grooveSupport(sid()), st = radio.getStation ? radio.getStation() : null; gBox.querySelector('[data-t="grvst"]').textContent = st ? `for ${st.name}` : "";
      for (const k of Object.keys(SL)) { const el = gq(k), x = toUI(k, g[k]); el.value = String(x); const o = gBox.querySelector(`[data-gv="${k}"]`); o.textContent = SL[k][4](k === "bpm" ? g.bpm : x); el.setAttribute("aria-valuetext", o.textContent);
        el.closest(".tg-row").classList.toggle("moved", k === "bpm" ? g.bpm > 0 : Math.abs(g[k] - GD[k]) > .005); }
      gq("meter").value = g.meter; gq("root").value = String(g.root); gq("mode").value = g.mode;
      gq("meter").closest(".tg-row").classList.toggle("moved", !!g.meter); gq("root").closest(".tg-row").classList.toggle("moved", g.root >= 0); gq("mode").closest(".tg-row").classList.toggle("moved", !!g.mode);
      const off = { bpm: !sup.bpm, meter: !sup.meter, swing: !sup.swing, length: !sup.length };
      for (const [k, v] of Object.entries(off)) { const el = gq(k); el.disabled = v; el.closest(".tg-row").classList.toggle("na", v); el.closest(".tg-row").title = v ? `Not on ${st ? st.name : "this station"}` : ""; }
      gBox.classList.toggle("moved", grvOn()); if (toggle) toggle.closest("label,.rd-btn")?.classList.toggle("tuned", !same(cur, DEF) || mixOn() || grvOn()); };
    const setG = o => { gsave(radio.setGroove(o)); paintG(); };
    for (const k of Object.keys(SL)) { const el = gq(k); el.addEventListener("input", () => setG({ [k]: fromUI(k, snap(k, +el.value)) })); el.addEventListener("dblclick", () => setG({ [k]: GD[k] })); }
    gq("meter").addEventListener("change", () => setG({ meter: gq("meter").value }));
    gq("root").addEventListener("change", () => setG({ root: +gq("root").value }));
    gq("mode").addEventListener("change", () => setG({ mode: gq("mode").value }));
    q("grvreset").addEventListener("click", () => { gsave(radio.resetGroove()); paintG(); });
    const rg0 = resetAll; resetAll = () => { rg0(); gsave(radio.resetGroove()); paintG(); };
    if (radio.on) radio.on("station", paintG); paintG();
  }
  const show0 = show; show = () => { show0(); if ((mixOn() || grvOn()) && toggle) toggle.closest("label,.rd-btn")?.classList.add("tuned"); };
  show(); return { open, get: () => ({ ...cur }), set };
}
