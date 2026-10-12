/* Saving what's playing: MP3 encoding (lamejs, vendored in vendor/lamejs), ID3 tags, a tiny zip writer and a
   "save these bytes" helper that works in the apps (a native Save dialog), on claude.ai pages (the downloads
   capability, which takes .zip but not .mp3) and in plain browsers (a normal download). */
const yieldNow = () => new Promise(r => setTimeout(r, 0));
function id3(meta) {   // ID3v2.3: title, artist, album, genre, BPM, comment
  const enc = new TextEncoder(), frames = [];
  const frame = (id, text) => { if (!text) return; const body = enc.encode(String(text)), b = new Uint8Array(10 + 1 + body.length);
    b.set(enc.encode(id), 0); const n = body.length + 1; b[4] = n >>> 24 & 255; b[5] = n >>> 16 & 255; b[6] = n >>> 8 & 255; b[7] = n & 255; b[10] = 3; b.set(body, 11); frames.push(b); };
  frame("TIT2", meta.title); frame("TPE1", meta.artist || "MDFM 99.9 HD"); frame("TALB", meta.album || "MDFM 99.9 HD"); frame("TCON", meta.genre); frame("TBPM", meta.bpm);
  if (meta.comment) { const body = enc.encode("eng\0" + meta.comment), b = new Uint8Array(11 + body.length), n = body.length + 1;
    b.set(enc.encode("COMM"), 0); b[4] = n >>> 24 & 255; b[5] = n >>> 16 & 255; b[6] = n >>> 8 & 255; b[7] = n & 255; b[10] = 3; b.set(body, 11); frames.push(b); }
  const size = frames.reduce((a, f) => a + f.length, 0), h = new Uint8Array(10 + size);
  h.set([73, 68, 51, 3, 0, 0, size >>> 21 & 127, size >>> 14 & 127, size >>> 7 & 127, size & 127]); let o = 10; for (const f of frames) { h.set(f, o); o += f.length; }
  return h;
}
/** AudioBuffer -> MP3 bytes (Uint8Array). Encodes in small slices and yields between them, so the live station keeps playing. */
async function encodeMp3(buffer, meta = {}, onProgress) {
  if (typeof lamejs === "undefined") throw new Error("The MP3 encoder isn't in this build.");
  const kbps = meta.kbps || 192, sr = buffer.sampleRate, ch = Math.min(2, buffer.numberOfChannels);
  const enc = new lamejs.Mp3Encoder(ch, sr, kbps), L = buffer.getChannelData(0), R = ch > 1 ? buffer.getChannelData(1) : null;
  const to16 = (src, a, b) => { const o = new Int16Array(b - a); for (let i = a; i < b; i++) { const v = Math.max(-1, Math.min(1, src[i])); o[i - a] = v < 0 ? v * 32768 : v * 32767; } return o; };
  const parts = [id3(meta)], step = 1152 * 20;
  for (let i = 0; i < L.length; i += step) {
    const j = Math.min(L.length, i + step), out = R ? enc.encodeBuffer(to16(L, i, j), to16(R, i, j)) : enc.encodeBuffer(to16(L, i, j));
    if (out.length) parts.push(new Uint8Array(out.buffer, out.byteOffset, out.length).slice());
    if ((i / step) % 4 === 3) { if (onProgress) onProgress(j / L.length); await yieldNow(); }
  }
  const tail = enc.flush(); if (tail.length) parts.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.length).slice());
  const n = parts.reduce((a, p) => a + p.length, 0), mp3 = new Uint8Array(n); let o = 0; for (const p of parts) { mp3.set(p, o); o += p.length; }
  return mp3;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** [{name, bytes}] -> a zip (stored, no compression: MP3s don't shrink anyway). */
function zipFiles(files) {
  const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
  const u16 = v => [v & 255, v >>> 8 & 255], u32 = v => [v & 255, v >>> 8 & 255, v >>> 16 & 255, v >>> 24 & 255];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), size = f.bytes.length;
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
    chunks.push(head, name, f.bytes);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += head.length + name.length + size;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
/** Saves bytes as a file. app.saveFile (the apps) > claude.ai downloads (as .zip) > a plain browser download. Resolves {via, name} or throws. */
async function saveBytes(bytes, filename, { app = null, type = "audio/mpeg" } = {}) {
  if (app && typeof app.saveFile === "function") { const r = await app.saveFile(bytes, filename); if (r === false || (r && r.canceled)) throw Object.assign(new Error("Canceled"), { code: "declined" }); return { via: "app", name: (r && r.path) || filename }; }
  if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
    const dl = await Promise.race([window.claude.use("downloads"), new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
    if (dl) { const zipName = filename.replace(/\.[a-z0-9]+$/i, "") + ".zip"; await dl.save({ filename: zipName, data: zipFiles([{ name: filename, bytes }]) }); return { via: "claude", name: zipName }; }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { via: "browser", name: filename };
}
const safeName = s => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
/** Saving a break: waits for it to end, then encodes the recording. */
async function saveBreak(radio, air, { app = null, onStatus = () => {} } = {}) {
  onStatus(`Recording “${air.title}”. It saves when it's over…`);
  const r = await radio.recordBreak(); if (!r) throw new Error("It ended before it could be saved.");
  const i = r.info, mp3 = await encodeMp3(r.buffer, { title: i.title, album: i.show, genre: "Radio", comment: `MDFM 99.9 HD. ${i.show}${i.episode ? ": " + i.episode : ""}. Recorded off the air.` }, p => onStatus(`Making the MP3… ${Math.round(p * 100)}%`));
  const name = safeName(`MDFM - ${i.title}`) + ".mp3";
  onStatus("Saving…"); return { ...(await saveBytes(mp3, name, { app })), title: i.title, bytes: mp3.length, kind: "break" };
}
/** The whole "Save" flow: the break on top if one is playing (shows, weather, ads...), else the song on air rendered again from the top. onStatus(text) reports progress. */
async function saveSong(radio, { app = null, onStatus = () => {} } = {}) {
  if (!radio || typeof radio.renderSong !== "function") throw new Error("This radio can't save songs.");
  // A show, weather, ad or other break on top right now: save that instead (the whole break, once it ends).
  const air = typeof radio.onAir === "function" ? radio.onAir() : null;
  if (air && air.saveable) return saveBreak(radio, air, { app, onStatus });
  if (air) onStatus("Shows save in the MDFM Radio app. Saving the last song instead…");
  onStatus(radio.getStation && radio.getStation() && radio.getStation().id === "wybc" ? "Recording a fresh piece (about 2½ minutes of music)…" : "Recording the song…"); const r = await radio.renderSong(); if (!r) throw new Error("Nothing is playing yet.");
  if (r.info && r.info.station === "wybc") {   // WYBC 88.1: Collin's ambient piano
    const i = r.info, mp3 = await encodeMp3(r.buffer, { title: i.title, artist: i.artist || "WYBC 88.1", album: "WYBC 88.1", genre: "Ambient", comment: "WYBC 88.1. Ambient piano, composed by the station the moment you saved it." }, p => onStatus(`Making the MP3… ${Math.round(p * 100)}%`));
    const name = safeName(`WYBC - ${i.artist ? i.artist + " - " : ""}${i.title} (ambient piano)`) + ".mp3";
    onStatus("Saving…"); return { ...(await saveBytes(mp3, name, { app })), title: i.title, bytes: mp3.length };
  }
  const i = r.info, style = String(i.style || "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace("R&b", "R&B").replace("Pluggnb", "PluggnB").replace(/\bDj\b/, "DJ");
  const mp3 = await encodeMp3(r.buffer, { title: i.title, genre: style, bpm: i.bpm, comment: `MDFM 99.9 HD. ${style}, ${i.bpm} BPM, ${i.key || ""}. Written by the station the moment it played.` }, p => onStatus(`Making the MP3… ${Math.round(p * 100)}%`));
  const name = safeName(`MDFM - ${i.title} (${style}, ${i.bpm} BPM)`) + ".mp3";
  onStatus("Saving…"); return { ...(await saveBytes(mp3, name, { app })), title: i.title, bytes: mp3.length };
}
