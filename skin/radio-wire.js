/* MDFM Radio page wiring. Works in a plain browser (canned weather/sports) and in the MDFM Radio app,
   which provides window.mdfmApp for live weather, local sports, settings and update status. */
(()=>{
  const $=s=>document.querySelector(s), app=window.mdfmApp||null;
  const radio=MDFM.createMDFM();
  window.__radio=radio; window.__vizSource=()=>radio.getSpectrum(); window.__thwack=()=>radio.thwack();
  // Frameless app window: the receiver is the window. POWER closes, MIN minimizes, FULL toggles full screen.
  if(app&&app.win){ document.documentElement.classList.add("appwin"); $("#wctl").hidden=false;
    $("#wClose").addEventListener("click",()=>app.win.close()); $("#wMin").addEventListener("click",()=>app.win.minimize());
    $("#wFull").addEventListener("click",()=>app.win.toggleFullScreen());
    document.querySelector("header.top .wtitle").addEventListener("dblclick",e=>{ if(!e.target.closest("button")) app.win.zoom(); });
    app.win.onFullScreen(fs=>document.documentElement.classList.toggle("fullscreen",!!fs));
    // Drag by the metal: a press anywhere that isn't a control moves the window (works even where CSS drag regions don't).
    // tabindex="-1" isn't a control: AXMOD puts it on .wrap as the skip-link target, which made every press look like a control.
    if(app.win.dragStart){ const CONTROL="button,input,select,textarea,label,a,summary,[role=slider],[tabindex]:not([tabindex^=\"-\"]),.rd-btn,.rd-k,.settings[open] .setgrid,#nozzle,.swatter";
      let dragging=false; const end=()=>{ if(dragging){ dragging=false; app.win.dragEnd(); document.documentElement.classList.remove("dragging"); } };
      document.addEventListener("mousedown",e=>{ if(e.button!==0||e.detail>1||document.documentElement.classList.contains("fullscreen")||e.target.closest(CONTROL)) return;
        // The skin's parts above and around the receiver (a crown, a stage) sit on the bare page: they move the window too.
        if(!e.target.closest(".wrap")&&e.target!==document.body&&e.target!==document.documentElement) return; dragging=true; document.documentElement.classList.add("dragging"); app.win.dragStart(); e.preventDefault(); });
      addEventListener("mouseup",end); addEventListener("pointerup",end); addEventListener("blur",end);
      // A lost mouse-up must never leave the window stuck to the cursor: any move or scroll with the button up ends the drag.
      addEventListener("mousemove",e=>{ if(dragging&&!(e.buttons&1)) end(); }); addEventListener("wheel",end,{passive:true}); }
    const fit=()=>app.win.fit(Math.ceil(document.documentElement.scrollHeight)); setTimeout(fit,400);
    // If the whole receiver fits, it is never left scrolled part-way (which looked like the top being cut off).
    const unscroll=()=>{ const se=document.scrollingElement; if(se&&se.scrollTop>0&&se.scrollHeight<=innerHeight+1) se.scrollTop=0; };
    addEventListener("resize",unscroll); addEventListener("focus",unscroll); document.addEventListener("visibilitychange",unscroll); }
  if(app) radio.setProviders({weather:()=>app.live("weather"),sports:()=>app.live("sports"),news:()=>app.live("news"),cannedFallback:false});
  // Newer apps render the robot voices as audio, so the volume and LOW/MID/HIGH EQ apply to them too.
  if(app&&app.tts) radio.setProviders({tts:spec=>app.tts(spec)});
  const np=$("#np"), cap=$("#cap"); let capT=0;
  radio.on("nowplaying",s=>{ np.textContent=`Now playing: “${s.title}” · ${s.style.toLowerCase()} · ${s.bpm} BPM`; });
  radio.on("caption",c=>{ cap.textContent=`${c.who}: ${c.text}`; clearTimeout(capT); capT=setTimeout(()=>{ cap.textContent=""; },14000); });
  const box=$("#sndOn"); box.checked=false;
  box.addEventListener("change",()=>{ box.checked?radio.start():radio.stop(); if(!box.checked) np.textContent="Press the SOUND button to tune in."; });
  $("#skipBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); } else radio.skip(); });
  $("#spotBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); setTimeout(()=>radio.spotNow(),1200); } else radio.spotNow(); });
  // Save song: renders the song on air again from the top (off the live audio, so it keeps playing) and saves it as an MP3.
  const saveBtn=$("#saveBtn");   // the floppy: renders the song on air again from the top and saves it as an MP3
  if(saveBtn) saveBtn.addEventListener("click",async()=>{
    if(saveBtn.getAttribute("aria-busy")==="true") return;
    if(!radio.isOn()||!radio.nowPlaying()){ cap.textContent="Tune in first, then press the floppy to save the song that's playing."; return; }
    saveBtn.setAttribute("aria-busy","true"); clearTimeout(capT); const say=t=>{ cap.textContent=t; };
    try{ const r=await MDFM.saveSong(radio,{app,onStatus:say}); cap.textContent=r.via==="claude"?`Saved “${r.title}” (the MP3 is inside ${r.name}).`:`Saved “${r.title}” as an MP3.`; }
    catch(e){ cap.textContent=e&&e.code==="declined"?"Not saved.":`Couldn't save the song: ${(e&&e.message)||e}`; }
    finally{ saveBtn.removeAttribute("aria-busy"); capT=setTimeout(()=>{ cap.textContent=""; },9000); } });
  $("#stEngine").textContent=`v${MDFM.VERSION}`;
  window.MDFM_receiver(radio,{app});
  // AXMOD (accessibility, MedDev Receiver 1.7+): captions for voices and songs, text versions of the EQ and meters,
  // and Calm mode mutes the voice drops between songs. Skipped quietly on an older receiver.
  (A=>{ if(!A) return; A.hasSound=true;
    radio.on("caption",c=>A.caption(c.text,{who:c.who}));
    radio.on("nowplaying",s=>A.sound(`Music: “${s.title}”, ${s.style.toLowerCase()}, ${s.bpm} BPM`));
    const band=(a,i,j)=>{ let m=0; for(let k=i;k<j;k++) m=Math.max(m,a[k]||0); return Math.round(m*100)+"%"; };
    A.describe($("header.top .lcd.viz"),()=>{ if(!radio.isOn()) return "off"; const s=radio.getSpectrum&&radio.getSpectrum(); return s?`bass ${band(s,0,6)}, mids ${band(s,6,13)}, treble ${band(s,13,19)}`:"on"; },{label:"EQ"});
    A.describe($(".vu"),()=>{ const l=radio.isOn()&&radio.getLevels?radio.getLevels():null; return l?`left ${Math.round(l[0]+14)} VU, right ${Math.round(l[1]+14)} VU`:"radio off"; },{label:"VU meters"});
    const stingers=()=>{ const cb=document.querySelector('#typeList input[data-type="stingers"]'); return cb?cb.checked:true; };
    A.on(v=>{ if(radio.setTypes) radio.setTypes({stingers:!v.calm&&stingers()}); });
    if(A.get().calm&&radio.setTypes) radio.setTypes({stingers:false});
    const tl=$("#typeList"); if(tl) tl.addEventListener("change",()=>{ if(A.get().calm&&radio.setTypes) radio.setTypes({stingers:false}); });
  })(window.AXMOD);
  $("#settings").hidden=false;
  document.querySelectorAll(".apponly").forEach(el=>el.hidden=!app);
  if(!app) return;
  if(app.autoplay) setTimeout(()=>{ box.checked=true; radio.start(); },600);
  // The Mac's own location (macOS asks once). If it's off or unavailable, the app uses a rough network location and says so.
  const geoWhy=e=>e&&e.code===1?"not allowed (System Settings → Privacy & Security → Location Services → MDFM Radio)":e&&e.code===3?"timed out":"unavailable";
  if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>app.coords(p.coords.latitude,p.coords.longitude),e=>{ if(app.geoError) app.geoError(geoWhy(e)); }, {timeout:15000,maximumAge:3600e3,enableHighAccuracy:false});
  else if(app.geoError) app.geoError("unavailable");
  const s=app.settings.get();
  $("#setSlackChannels").value=s.slackChannels||""; $("#setNameFixes").value=s.nameFixes||"";
  $("#setUpdates").checked=!!s.contentUpdates; $("#setBundled").checked=!!s.useBundled; $("#setCity").value=s.city||""; $("#setUnits").value=s.units||"f";
  const save=()=>app.settings.set({contentUpdates:$("#setUpdates").checked,useBundled:$("#setBundled").checked,city:$("#setCity").value.trim(),units:$("#setUnits").value,
    slackChannels:$("#setSlackChannels").value.trim(),nameFixes:$("#setNameFixes").value});
  for(const id of ["#setUpdates","#setBundled","#setUnits","#setSlackChannels","#setNameFixes"]) $(id).addEventListener("change",save);
  $("#slackConnect").addEventListener("click",()=>{ $("#slackState").textContent="Sign in to Slack in the window that opened. It closes by itself when you're done."; app.slack.connect().then(ok=>{ if(ok){ $("#setSlackNews").checked=true; radio.setTypes({news:true}); } }); });
  $("#slackDisconnect").addEventListener("click",()=>app.slack.disconnect());
  if($("#slackSetup")&&app.slack.setup) $("#slackSetup").addEventListener("click",()=>app.slack.setup());
  $("#setCity").addEventListener("change",save);
  $("#checkNow").addEventListener("click",()=>app.checkNow());
  $("#bouncerLog").addEventListener("click",()=>app.showBouncerLog&&app.showBouncerLog());
  const paint=st=>{
    const e=st.engine||{};
    $("#stEngine").textContent=`v${MDFM.VERSION} (${e.source==="updated"?"updated from the repo":"came with the app"})`;
    const bz=st.bouncer; $("#stLive").textContent=`Location: ${st.live.location} · Weather: ${st.live.weather} · Sports: ${st.live.sports}`+(bz?` · Bouncer: ${bz.label}${bz.blocked?` (${bz.blocked} blocked)`:""}${bz.problem?` · ${bz.problem}`:""}`:"");
    const fpS=st.futureproofer; if(fpS){ $("#stLive").textContent+=` · Futureproofer: ${fpS.label}`;
      const ul=$("#fpList"); ul.textContent="";
      for(const r of fpS.results){ const li=document.createElement("li"); li.className=r.level==="bad"?"bad":r.level==="warn"?"warn":r.level==="ok"?"ok":"";
        const dot=document.createElement("i"); dot.className="dot"; const b=document.createElement("b"); b.textContent=r.title+":"; const sp=document.createElement("span"); sp.textContent=r.summary||"";
        li.append(dot,b,sp); if(r.action&&r.action.url){ const btn=document.createElement("button"); btn.type="button"; btn.className="btn"; btn.textContent=r.action.label||"Open"; btn.onclick=()=>app.open(r.action.url); li.append(btn); }
        ul.append(li); } }
    const sl=st.slack; if(sl){ $("#slackConnect").hidden=sl.connected; $("#slackDisconnect").hidden=!sl.connected; $("#slackConnect").disabled=!sl.ready; if($("#slackSetup")) $("#slackSetup").hidden=!sl.builder;
      $("#slackState").textContent=!sl.ready?"Slack news isn't switched on for RentVision yet. When MedDev switches it on, Connect Slack works here without an update.":sl.connected?`Connected. News: ${sl.news}.`:"Not connected. When connected, the radio reads the newest posts from #general, #littlevisionaries and #animal-pics at the top of each hour (two minutes at most). Read-only."; }
    $("#stUpd").textContent=`New content: ${st.result}${st.lastCheck?` · checked ${new Date(st.lastCheck).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""}`+(st.appUpdate?` · App ${st.appUpdate.version} is available`:"");
    const b=$("#appUpd"); b.hidden=!st.appUpdate; b.onclick=()=>st.appUpdate&&app.open(st.appUpdate.download||st.appUpdate.url);
  };
  app.onStatus(paint); app.getStatus().then(paint);
})();
