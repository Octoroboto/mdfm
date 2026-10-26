/* MIX files (1.34): save every station's content and instrument switches and the whole mix to a named file, and load
   one back. Loading while the radio plays glides the dials from where they are to the file's values over CROSSMIX
   seconds, as if someone turned them by hand. The skin, the volume and the app's own settings are never in the file. */
// ===== File overview =====
// Where it fits: scripts/build.mjs joins this file into the bundle scope after src/export.js (whose saveBytes and safeName
// it uses) and before src/tune.js (whose MIX drawer has the EXPORT / IMPORT buttons and the CROSSMIX slider). The engine's
// public API (src/engine.js) reaches it through radio.getSettings() and radio.applySettings(), and the bundles export
// exportMix, readMixFile and mixFileName for pages that want their own buttons.
// The file is JSON, named <name>.mdfm.json (a plain .mdfm loads too). Its shape, version 1:
//   kind        "mdfm-mix" (anything else is refused)
//   v           1 (newer files load as far as this version understands them)
//   name        the name it was saved under; saved: an ISO time; engine: the MDFM version that wrote it
//   station     the station that was on (an id, e.g. "ptrn")
//   types       { stationId: { switchKey: on } }: every station's "What plays" switches (MDFM 99.9's are its setTypes keys)
//   instruments { instrumentKey: on }: the instrument pool MDFM 99.9, PTRN and CLUK pick from
//   sound, eq, fx   the SOUND settings, the parametric EQ and the effects (every station)
//   original    ORIGINAL (the mix bypass) was on; underwater: UNDERWATER was on
//   stations    { stationId: { style: {w, lanes}, groove, beat } }: each station's style matrix, groove & key and BEAT
// Nothing in a file is trusted: every value goes through the engine's own setters, which clamp and drop what they don't know,
// and stations or switches this build doesn't have are skipped.

// ===== Making a file =====
// MIXFILE_KIND / MIXFILE_V: the file's kind tag and the version this code writes and reads
const MIXFILE_KIND = "mdfm-mix", MIXFILE_V = 1;
// mxfObj(x): x when it is a plain object, else null
const mxfObj = x => x && typeof x === "object" && !Array.isArray(x) ? x : null;
// mixSnapshot(radio, opts): everything a MIX file holds, read from the engine now. opts.name: the name to put in it;
// opts.types: switch values to use instead of the engine's ({stationId: {...}}), for pages whose checkboxes are the truth
// (MDFM 99.9's Calm mode keeps the engine's stingers off without changing the switch). Returns the plain object above.
function mixSnapshot(radio, { name = "", types = null } = {}) {
  const has = k => typeof radio[k] === "function", ids = has("stations") ? radio.stations().filter(s => s.available).map(s => s.id) : ["mdfm"];
  const o = { kind: MIXFILE_KIND, v: MIXFILE_V, name: String(name || "").slice(0, 120), saved: new Date().toISOString(), engine: radio.version || "",
    station: has("getStation") && radio.getStation() ? radio.getStation().id : "mdfm", types: {}, stations: {} };
  for (const id of ids) { const t = id === "mdfm" && has("getTypes") ? radio.getTypes() : has("getStationTypes") ? radio.getStationTypes(id) : null;
    if (t && Object.keys(t).length) o.types[id] = { ...t, ...(mxfObj(types && types[id]) || {}) }; }
  if (has("getInstruments")) o.instruments = radio.getInstruments();
  if (has("getSound")) o.sound = radio.getSound();
  if (has("getEq")) o.eq = radio.getEq();
  if (has("getFx")) o.fx = radio.getFx();
  if (has("isMixBypass")) o.original = !!radio.isMixBypass();
  if (has("isUnderwater")) o.underwater = !!radio.isUnderwater();
  for (const id of ids) { const s = {};
    if (has("getStyleMix")) s.style = { w: radio.getStyleMix(id), ...(has("getStyleLanes") ? { lanes: radio.getStyleLanes(id) } : {}) };
    if (has("getGroove")) s.groove = radio.getGroove(id);
    if (has("getBeat")) s.beat = radio.getBeat(id);
    o.stations[id] = s; }
  return o;
}
// mixFileName(name): the file name for a mix called name ("My mix" -> "My mix.mdfm.json"); an empty name gives
// "MDFM mix.mdfm.json". It ends in .json because the apps' Save dialog (the kit's save-file) only writes known types.
function mixFileName(name) { return (safeName(name) || "MDFM mix") + ".mdfm.json"; }
// exportMix(radio, opts): saves the snapshot as <name>.mdfm.json through saveBytes (the app's Save dialog, claude.ai's downloads
// as a .zip, or a browser download). opts: { name, app, types }. Resolves like saveBytes plus { file: the snapshot }; throws
// with code "declined" when the Save dialog is cancelled.
async function exportMix(radio, { name = "", app = null, types = null } = {}) {
  const file = mixSnapshot(radio, { name, types }), bytes = new TextEncoder().encode(JSON.stringify(file, null, 1) + "\n");
  return { ...(await saveBytes(bytes, mixFileName(name), { app, type: "application/json" })), file };
}

// ===== Reading a file =====
// mixFromZip(u8): the first .mdfm or .json file inside a zip made by zipFiles (stored, not compressed: what claude.ai's
// downloads hand back), as text; null when there is none. Walks the local file headers (signature 0x04034b50).
function mixFromZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(); let p = 0;
  while (p + 30 <= u8.length && dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true), size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true);
    const name = dec.decode(u8.subarray(p + 30, p + 30 + nl)), at = p + 30 + nl + xl;   // header (30 bytes), the name, the extra field, then the data
    if (method === 0 && /\.(mdfm|json)$/i.test(name)) return dec.decode(u8.subarray(at, at + size));
    p = at + size; }
  return null;
}
// mixParse(text): the checked file object from JSON text. Throws an Error with a message fit to show when it isn't a MIX
// file. Unknown fields are kept (they're ignored when applied); a newer version loads what this one understands.
function mixParse(text) {
  let d; try { d = JSON.parse(String(text).replace(/^﻿/, "")); } catch (e) { throw new Error("That file isn't a MIX file (it isn't readable JSON)."); }
  if (!mxfObj(d) || d.kind !== MIXFILE_KIND) throw new Error("That file isn't a MIX file.");
  if (!(+d.v >= 1)) throw new Error("That MIX file has no version, so it can't be read.");
  return d;
}
// readMixFile(file): a File or Blob picked by the person -> the checked file object (a promise). Takes .mdfm / .json, or a
// .zip from claude.ai's downloads with one inside. Files over 2 MB are refused (a real one is a few kB).
async function readMixFile(file) {
  if (!file) throw new Error("No file picked.");
  if (file.size > 2e6) throw new Error("That file is too big to be a MIX file.");
  const u8 = new Uint8Array(await file.arrayBuffer());
  if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b) { const t = mixFromZip(u8); if (t == null) throw new Error("There's no MIX file inside that zip."); return mixParse(t); }   // "PK": a zip
  return mixParse(new TextDecoder().decode(u8));
}

// ===== Applying a file (the crossmix) =====
// mxfLerp(a, b, k, path): the value between a (k = 0) and b (k = 1) for one setting, by its path ("eq.p1.freq",
// "groove.swing"...). Numbers glide: frequencies on a log scale so the sweep sounds even; everything else (on/off,
// choices, room type, the BEAT grid, and groove values where -1 or 0 means "the song's own") switches at the halfway point.
// Objects are walked key by key over b's keys; a key missing from a keeps b's value.
function mxfLerp(a, b, k, path = "") {
  if (Array.isArray(b)) return k >= .5 || !Array.isArray(a) ? b.map(x => Array.isArray(x) ? [...x] : x) : a.map(x => Array.isArray(x) ? [...x] : x);
  if (mxfObj(b)) { const o = {}, A = mxfObj(a) || {}; for (const key in b) o[key] = key in A ? mxfLerp(A[key], b[key], k, path ? path + "." + key : key) : b[key]; return o; }
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) return k >= .5 ? b : a;
  if (k >= 1) return b; if (k <= 0) return a;   // the ends exactly (a + (b - a) * 1 can miss b by a rounding error)
  if (/(^|\.)groove\.(bpm)$/.test(path)) return a > 0 && b > 0 ? Math.round(a + (b - a) * k) : k >= .5 ? b : a;   // 0 = the song's tempo
  if (/(^|\.)groove\.(root|meter|mode|feel|gv)$/.test(path)) return k >= .5 ? b : a;   // choices
  if (/(^|\.)groove\./.test(path) && (a < 0 || b < 0)) return k >= .5 ? b : a;   // -1 = the song's own / follow
  if (/\.freq$/.test(path) && a > 0 && b > 0) return a * Math.pow(b / a, k);
  if (/\.slope$/.test(path)) return k >= .5 ? b : a;
  return a + (b - a) * k;
}
// mxfEase(k): smoothstep, so the glide starts and lands gently (k 0..1 -> 0..1)
const mxfEase = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
// MIXFILE_RUN: the crossmix in progress on each radio (radio -> { stop() }), so a second import replaces the first
const MIXFILE_RUN = new WeakMap();
// mixApply(radio, data, opts): puts a checked MIX file on the radio. opts:
//   crossmix  seconds to glide over while the radio plays (0 = at once; default 4, at most 30). Off air it's always at once.
//   emit      the engine's emit(ev, data) (radio.applySettings passes it) for the "mixfile" events below
//   onFrame   called after each glide step (the MIX drawer repaints its dials)
// What happens: stations that aren't the target get their style, groove and BEAT at once (nobody hears them). If the file
// was saved on another station, the target's own settings go on first and then the dial switches (the usual switch-over:
// the old station fades as it always does, the new one starts with its mix already set) and the shared settings (SOUND,
// EQ, FX) glide. On the same station everything glides together. Switches (what plays, instruments, ORIGINAL) and the
// non-gliding values change at the halfway point. Events: "mixfile" {phase: "start" | "switch" | "done", name, station,
// crossmix}; "switch" is when the switches and instruments changed, and also carries the file's types and instruments
// (pages tick their checkboxes to match then).
// Returns a promise of { name, station, crossmix, skipped: [what this build couldn't take] } when the glide ends.
function mixApply(radio, data, { crossmix = 4, emit = () => {}, onFrame = null } = {}) {
  const d = mxfObj(data); if (!d || d.kind !== MIXFILE_KIND) return Promise.reject(new Error("That isn't a MIX file."));
  const has = k => typeof radio[k] === "function", prev = MIXFILE_RUN.get(radio); if (prev) prev.stop(true);   // a crossmix already running lands where it was going first
  const avail = has("stations") ? radio.stations().filter(s => s.available).map(s => s.id) : ["mdfm"], skipped = [];
  const target = avail.includes(d.station) ? d.station : (has("getStation") && radio.getStation() ? radio.getStation().id : "mdfm");
  if (d.station && d.station !== target) skipped.push(`station ${d.station}`);
  const cur = has("getStation") && radio.getStation() ? radio.getStation().id : "mdfm", on = has("isOn") && radio.isOn();
  const secs = on ? Math.max(0, Math.min(30, +crossmix || 0)) : 0, name = String(d.name || ""), S = mxfObj(d.stations) || {};
  for (const id in S) if (!avail.includes(id)) skipped.push(`station ${id}`);
  for (const id in (mxfObj(d.types) || {})) if (!avail.includes(id)) skipped.push(`switches for ${id}`);
  // per(id, x): put one station's style, groove and BEAT on at once
  const per = (id, x) => { if (!mxfObj(x)) return;
    if (mxfObj(x.style) && has("setStyleMix")) radio.setStyleMix({ w: mxfObj(x.style.w) || {}, lanes: mxfObj(x.style.lanes) || undefined }, id);
    if (mxfObj(x.groove) && has("setGroove")) radio.setGroove(x.groove, id);
    if (mxfObj(x.beat) && has("setBeat")) radio.setBeat(x.beat, id); };
  // switches(): what plays on every station, the instruments, ORIGINAL; then the "switch" event
  const switches = () => { const T = mxfObj(d.types) || {};
    for (const id of avail) { const t = mxfObj(T[id]); if (!t) continue; if (id === "mdfm" && has("setTypes")) radio.setTypes(t); else if (has("setStationTypes")) radio.setStationTypes(id, t); }
    if (mxfObj(d.instruments) && has("setInstruments")) radio.setInstruments(d.instruments);
    if (typeof d.original === "boolean" && has("setMixBypass") && !!radio.isMixBypass() !== d.original) radio.setMixBypass(d.original);
    emit("mixfile", { phase: "switch", name, station: target, crossmix: secs, types: T, instruments: mxfObj(d.instruments) || {} }); };
  emit("mixfile", { phase: "start", name, station: target, crossmix: secs });
  for (const id of avail) if (id !== target && S[id]) per(id, S[id]);   // off-air stations: at once
  const moving = target !== cur && has("setStation");
  if (moving) { per(target, S[target]); radio.setStation(target); }   // the new station starts with its own mix in place
  // the glide: from = the values now, to = the file's; the target station's own parts glide only when it was already on
  const pick = () => ({ sound: has("getSound") ? radio.getSound() : null, eq: has("getEq") ? radio.getEq() : null, fx: has("getFx") ? radio.getFx() : null,
    st: moving ? null : { style: has("getStyleMix") ? { w: radio.getStyleMix(target), lanes: has("getStyleLanes") ? radio.getStyleLanes(target) : undefined } : null,
      groove: has("getGroove") ? radio.getGroove(target) : null, beat: has("getBeat") ? radio.getBeat(target) : null } });
  const from = pick(), T0 = S[target] || {};
  const to = { sound: mxfObj(d.sound), eq: mxfObj(d.eq), fx: mxfObj(d.fx),
    st: moving ? null : { style: mxfObj(T0.style) ? { w: mxfObj(T0.style.w) || {}, lanes: mxfObj(T0.style.lanes) || undefined } : null, groove: mxfObj(T0.groove), beat: mxfObj(T0.beat) } };
  // last: what each setter was last given (as JSON), so a frame only calls the setters whose values changed
  const last = {};
  const send = (key, v, fn) => { if (v == null) return; const j = JSON.stringify(v); if (last[key] === j) return; last[key] = j; try { fn(v); } catch (e) {} };
  // step(k): put the in-between values at k (0..1, eased) on the engine
  const step = k => {
    if (to.sound && has("setSound")) send("sound", mxfLerp(from.sound, to.sound, k, "sound"), v => radio.setSound(v));
    if (to.eq && has("setEq")) send("eq", mxfLerp(from.eq, to.eq, k, "eq"), v => radio.setEq(v));
    if (to.fx && has("setFx")) send("fx", mxfLerp(from.fx, to.fx, k, "fx"), v => radio.setFx(v));
    if (to.st) { const f = from.st, t = to.st;
      if (t.style && f.style && has("setStyleMix")) send("style", mxfLerp(f.style, t.style, k, "style"), v => radio.setStyleMix(v, target));
      if (t.groove && f.groove && has("setGroove")) send("groove", mxfLerp(f.groove, t.groove, k, "groove"), v => radio.setGroove(v, target));
      if (t.beat && f.beat && has("setBeat")) send("beat", mxfLerp(f.beat, t.beat, k, "beat"), v => radio.setBeat(v, target)); }
    if (onFrame) try { onFrame(k); } catch (e) {} };
  return new Promise(res => {
    let flipped = false, timer = 0, offSt = null; const t0 = Date.now();
    // finish(): the last values exactly as the file has them, then "done"
    const finish = () => { clearTimeout(timer); if (offSt) offSt(); MIXFILE_RUN.delete(radio); if (!flipped) { flipped = true; switches(); } step(1);
      emit("mixfile", { phase: "done", name, station: target, crossmix: secs }); res({ name, station: target, crossmix: secs, skipped }); };
    const run = { stop: () => finish() }; MIXFILE_RUN.set(radio, run);
    if (!secs) { finish(); return; }
    // someone turns the station dial mid-glide: land at once, so this station's values don't follow onto the next one
    if (radio.on) offSt = radio.on("station", st => { if (st && st.id !== target) finish(); });
    // tick(): one glide step every 50 ms (20 a second: smooth to the ear, light on the scheduler)
    const tick = () => { const k = Math.min(1, (Date.now() - t0) / (secs * 1000));
      if (!flipped && k >= .5) { flipped = true; switches(); }
      if (k >= 1) { finish(); return; } step(mxfEase(k)); timer = setTimeout(tick, 50); };
    tick(); });
}
