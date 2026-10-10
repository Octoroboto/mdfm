// Wizard page: one button per step; each lights its LED green, amber while running, red if it needs another go.
(() => {
  const $ = id => document.getElementById(id), s = window.setup; if (!s) return;
  const logEl = $("log"); s.onLog(t => { if (t) { logEl.textContent += t + "\n"; logEl.scrollTop = logEl.scrollHeight; } });
  if (s.onLoginUrl) s.onLoginUrl(() => { $("cfAlt").hidden = false; });
  $("obBrowser").addEventListener("click", async () => { const r = await s.browser("onboarding"); $("s2").querySelector(".note").textContent = r && r.note || ""; });
  $("cfBrowser").addEventListener("click", async () => { const r = await s.browser("login"); $("s1").querySelector(".note").textContent = r && r.note || ""; });
  s.onAppId(id => { const li = $("s3"); li.querySelector(".note").textContent = `App ${id} created. Copy its Client ID and Client Secret below.`; });
  const mark = (li, cls, note) => { li.classList.remove("ok", "busy", "bad"); if (cls) li.classList.add(cls); if (note != null) li.querySelector(".note").textContent = note; };
  const args = { secrets: () => ({ clientId: $("clientId").value, clientSecret: $("clientSecret").value, teamId: $("teamId").value }) };
  document.querySelectorAll("button[data-step]").forEach(b => b.addEventListener("click", async () => {
    const step = b.dataset.step, li = b.closest("li"); b.disabled = true; mark(li, "busy", "Working...");
    let r; try { r = await s[step](args[step] ? args[step]() : undefined); } catch (e) { r = { ok: false, note: e.message }; }
    b.disabled = false; r = r || { ok: false };
    if (r.relay) $("addr").textContent = r.relay;
    if (r.onboarding) $("obAlt").hidden = false;
    if (r.teamId) $("teamId").value = r.teamId;
    if (r.push) { $("push").hidden = false; $("push").textContent = "Push this so everyone's apps get it:\n" + r.push; }
    mark(li, r.ok ? "ok" : "bad", r.note || (r.ok ? "Done." : "That didn't work. The log says why."));
  }));
  s.state().then(st => { if (st && st.relay) { $("addr").textContent = st.relay; mark($("s2"), "ok", "Already online."); } if (st && st.teamId) $("teamId").value = st.teamId; });
})();
