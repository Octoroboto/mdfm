/* RentVision app kit: a Save button for any page. Works in the apps (native Save dialog through app.saveFile),
   on claude.ai pages (the downloads capability; .mp3 and other types it doesn't take go inside a .zip) and in plain
   browsers (a normal download). Uses MDFM.saveBytes when the MDFM radio is on the page, else its own copy.
     KitSave.attach(button, { make: async () => ({ bytes, name }), app: window.mdfmApp, onStatus: t => ... })
     KitSave.attachSong(button, radio, { app, onStatus })   // MDFM: saves the song that's playing as an MP3 */
(function () {
  const save = (bytes, name, app) => (window.MDFM && MDFM.saveBytes) ? MDFM.saveBytes(bytes, name, { app }) : fallback(bytes, name, app);
  async function fallback(bytes, name, app) {
    if (app && app.saveFile) { const r = await app.saveFile(bytes, name); if (!r || r.canceled) throw Object.assign(new Error("Canceled"), { code: "declined" }); return { via: "app", name: r.path }; }
    const url = URL.createObjectURL(new Blob([bytes])), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); return { via: "browser", name };
  }
  function busy(btn, on) { if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy"); }
  function attach(btn, { make, app = null, onStatus = () => {} }) {
    btn.addEventListener("click", async () => {
      if (btn.getAttribute("aria-busy") === "true") return; busy(btn, true);
      try { onStatus("Making the file…"); const f = await make(); onStatus("Saving…"); const r = await save(f.bytes, f.name, app); onStatus(`Saved ${f.name}.`); return r; }
      catch (e) { onStatus(e && e.code === "declined" ? "Not saved." : `Couldn't save: ${(e && e.message) || e}`); }
      finally { busy(btn, false); }
    });
  }
  function attachSong(btn, radio, { app = null, onStatus = () => {} } = {}) {
    btn.addEventListener("click", async () => {
      if (btn.getAttribute("aria-busy") === "true") return;
      if (!radio.isOn() || !radio.nowPlaying()) { onStatus("Tune in first, then save the song that's playing."); return; }
      busy(btn, true);
      try { const r = await MDFM.saveSong(radio, { app, onStatus }); onStatus(`Saved “${r.title}”.`); }
      catch (e) { onStatus(e && e.code === "declined" ? "Not saved." : `Couldn't save the song: ${(e && e.message) || e}`); }
      finally { busy(btn, false); }
    });
  }
  window.KitSave = { attach, attachSong };
})();
