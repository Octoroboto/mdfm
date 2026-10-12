/* TUNE: the sound-tuning pop-out (MDFM.mountTune). Builds the knobs, presets and room picker inside `panel` and wires
   them to radio.setSound(). `toggle` (a checkbox) opens and closes it. Settings are kept on this device (localStorage
   "mdfmSound") unless opts.store = { get(), set(sound) } is given. Styles: .tunepop and friends in skin/radio.css. */
function mountTune(radio, { panel, toggle, store, title = "Sound tuning" } = {}) {
  if (!radio || typeof radio.setSound !== "function" || !panel) return null;
  const DEF = radio.soundDefaults(), uid = "t" + Math.random().toString(36).slice(2, 7);
  const KNOBS = [["realism", "REALISM", "MIN", "MAX", "How real it sounds: speakers in a room, a little glue and air"],
    ["width", "SOUNDSTAGE", "MONO", "WIDE", "How wide the stereo picture is (the middle is as it is now)"],
    ["clarity", "CLARITY", "MIN", "MAX", "Less mud, more presence and air"],
    ["warmth", "WARMTH", "MIN", "MAX", "Rich, warm tape and console colour"],
    ["room", "ROOM", "DRY", "FULL", "How much of the listening room you hear (pick the room above)"],
    ["rattle", "TRUNK RATTLE", "OFF", "MAX", "Loose panels buzzing on heavy sub bass"],
    ["grain", "RADIO GRAIN", "OFF", "MAX", "Hiss, crackle, a narrower band and a little flutter"]];
  const st = store || { get() { try { return JSON.parse(localStorage.getItem("mdfmSound") || "null"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem("mdfmSound", JSON.stringify(v)); } catch (e) {} } };
  let cur = radio.getSound(); const saved = st.get(); if (saved) cur = radio.setSound(saved);
  panel.classList.add("pop", "tunepop"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", uid + "h"); panel.hidden = true;
  panel.innerHTML = `<div class="wtitle"><span id="${uid}h"></span></div><div class="tunerow"><label class="tunefld">Preset <select data-t="preset" aria-label="Sound preset"></select></label><label class="tunefld">Room <select data-t="room" aria-label="Listening room"></select></label><div class="tunebtns"><div class="rd-btn"><button type="button" data-t="reset" title="Back to MDFM exactly as it is" aria-label="Reset the sound tuning"></button><small>RESET</small></div><div class="rd-btn"><button type="button" data-t="close" title="Close sound tuning" aria-label="Close sound tuning"></button><small>CLOSE</small></div></div></div><div class="rd-knobs tuneknobs" role="group" aria-label="Sound tuning knobs"></div><p class="tunehint">With every knob at its start mark the station sounds exactly as it always has. Double-click a knob to put it back.</p>`;
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
  const show = () => { for (const [k] of KNOBS) { const d = knobs[k], el = d.querySelector(".rd-knob"), v = cur[k]; el.style.transform = `rotate(${-135 + v * 270}deg)`;
      el.setAttribute("aria-valuenow", String(pct(v))); el.setAttribute("aria-valuetext", k === "width" ? (v < .48 ? `narrower (${pct(v)})` : v > .52 ? `wider (${pct(v)})` : "as it is") : v === 0 ? "off" : pct(v) + " percent");
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
  q("reset").addEventListener("click", () => { cur = radio.resetSound(); st.set(cur); show(); });
  const open = v => { panel.hidden = !v; if (toggle) { if ("checked" in toggle) toggle.checked = v; else toggle.setAttribute("aria-pressed", String(v)); toggle.setAttribute("aria-expanded", String(v)); }
    if (v) setTimeout(() => { const f = panel.querySelector(".rd-knob"); f && f.focus({ preventScroll: true }); }, 0); };
  if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.addEventListener(toggle.type === "checkbox" ? "change" : "click", () => open(toggle.type === "checkbox" ? toggle.checked : panel.hidden)); }
  q("close").addEventListener("click", () => { open(false); toggle && toggle.focus(); });
  panel.addEventListener("keydown", e => { if (e.key === "Escape") { open(false); toggle && toggle.focus(); } });
  show(); return { open, get: () => ({ ...cur }), set };
}
