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
  if(app&&typeof app.live==="function") radio.setProviders({weather:()=>app.live("weather"),sports:()=>app.live("sports"),news:()=>app.live("news"),cannedFallback:false});   // live data from the app (MDFM Radio, or a kit app with mdfm-live); without it, the station's own made-up reports
  // PTLK 108.0: newer apps fetch live business and gaming headlines and encyclopedia pages; without them the shows write their own.
  // (Through app.live, so older apps simply answer null.)
  if(app&&typeof app.live==="function") radio.setProviders({headlines:(kind,arg)=>app.live(kind==="wiki"?"wiki:"+arg:"headlines:"+kind)});
  // Newer apps render the robot voices as audio, so the volume and LOW/MID/HIGH EQ apply to them too.
  if(app&&typeof app.tts==="function") radio.setProviders({tts:spec=>app.tts(spec)});
  const np=$("#np"), cap=$("#cap"); let capT=0;
  const npText=s=>s.station==="ptrn"?`“${s.title}” · ${s.artist} · ${String(s.style).toLowerCase()} · ${s.bpm} BPM${s.time&&s.time!=="4/4"?" · "+s.time:""}`:s.station==="ptlk"||(s.station==="hearye"&&s.talk)?`${s.style} · “${s.title}” · ${s.artist}`:s.station==="hearye"?`“${s.title}” · ${s.artist} · ${s.style.toLowerCase()}`:s.station==="wybc"?`“${s.title}” · ${s.artist} · ambient piano`:`“${s.title}” · ${s.style.toLowerCase()} · ${s.bpm} BPM`;
  radio.on("nowplaying",s=>{ np.textContent=`Now playing: ${npText(s)}`; });
  // Stations: WYBC 88.1 (Collin's ambient piano), HEARYE 95.5 (Renn Faire Radio), MDFM 99.9 HD and PTLK 108.0 (talk). The arrows switch; the choice is remembered on this device.
  const stLS="mdfmStation", showStation=st=>{ if(!st) return; $("#stName").textContent=st.name; document.documentElement.dataset.station=st.id;
    const w=st.id==="wybc"||st.id==="hearye", t=st.id==="ptlk", pt=st.id==="ptrn"; $("#skipBtn").textContent=t?"Next show":w?"Next piece":pt?"Next track":"Next song"; $("#spotBtn").textContent=pt?"Drop a tag":w||t?"Station ID":"Station break";
    $("#skipBtn").title=t?"Skip to a new show":st.id==="hearye"?"On to the next piece":w?"A new piece":pt?"Mix into the next track on the next bar":"Skip to the next song"; $("#spotBtn").title=pt?"A station tag on the beat":""; };
  if(radio.setStation){ try{ const k=localStorage.getItem(stLS); if(k) radio.setStation(k); }catch(e){}
    showStation(radio.getStation());
    radio.on("station",st=>{ showStation(st); try{ localStorage.setItem(stLS,st.id); }catch(e){}
      if(!radio.isOn()) np.textContent=`Tuned to ${st.name}. Press the SOUND button to tune in.`; else if(st.id==="mdfm"&&window.AXMOD) window.AXMOD.sound("MDFM 99.9 HD"); });
    const step=d=>()=>{ d>0?radio.nextStation():radio.prevStation(); };
    $("#stPrev").addEventListener("click",step(-1)); $("#stNext").addEventListener("click",step(1));
    if(!radio.stations().some(s=>s.id!=="mdfm"&&s.available)) $("#stBtns").hidden=true;
    // WYBC's own "what plays" switches (this device)
    const wl=$("#wybcList"), list=radio.stationTypeList("wybc");
    if(wl&&list.length&&radio.stations().some(s=>s.id==="wybc"&&s.available)){ let wt={}; try{ wt=JSON.parse(localStorage.getItem("wybcTypes")||"{}"); }catch(e){}
      for(const [k,label] of list){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-wtype="${k}"> <span>${label}</span>`;
        l.querySelector("input").checked=wt[k]!==false; wl.appendChild(l); }
      const ws=()=>{ const t={}; wl.querySelectorAll("input[data-wtype]").forEach(cb=>t[cb.dataset.wtype]=cb.checked); return t; };
      radio.setStationTypes("wybc",ws()); wl.addEventListener("change",()=>{ const t=ws(); radio.setStationTypes("wybc",t); try{ localStorage.setItem("wybcTypes",JSON.stringify(t)); }catch(e){} });
      $("#wybcSet").hidden=false; }
    // HEARYE's show and segment switches (this device)
    const hl=$("#hearyeList"), hlist=radio.stationTypeList("hearye");
    if(hl&&hlist.length&&radio.stations().some(s=>s.id==="hearye"&&s.available)){ let ht={}; try{ ht=JSON.parse(localStorage.getItem("hearyeTypes")||"{}"); }catch(e){}
      for(const [k,label] of hlist){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-htype="${k}"> <span></span>`; l.querySelector("span").textContent=label;
        l.querySelector("input").checked=ht[k]!==false; hl.appendChild(l); }
      const hs=()=>{ const t={}; hl.querySelectorAll("input[data-htype]").forEach(cb=>t[cb.dataset.htype]=cb.checked); return t; };
      radio.setStationTypes("hearye",hs()); hl.addEventListener("change",()=>{ const t=hs(); radio.setStationTypes("hearye",t); try{ localStorage.setItem("hearyeTypes",JSON.stringify(t)); }catch(e){} });
      $("#hearyeSet").hidden=false; }
    // PTRN's genre switches, in families, with All / None for each (this device)
    const rl=$("#ptrnList"), rlist=radio.stationTypeList("ptrn");
    if(rl&&rlist.length&&radio.stations().some(s=>s.id==="ptrn"&&s.available)){ let rt={}; try{ rt=JSON.parse(localStorage.getItem("ptrnTypes")||"{}"); }catch(e){}
      const fams=[...new Set(rlist.map(x=>x[2]))];
      for(const f of fams){ const box=document.createElement("div"); box.className="ptrnfam"; const hd=document.createElement("div"); hd.className="ptrnfamhd"; const nm=document.createElement("span"); nm.textContent=f; hd.append(nm);
        const items=rlist.filter(x=>x[2]===f); if(items.length>1) for(const [lab,v] of [["All",true],["None",false]]){ const b=document.createElement("button"); b.type="button"; b.className="btn"; b.textContent=lab; b.setAttribute("aria-label",`${lab} of ${f}`); b.addEventListener("click",()=>{ box.querySelectorAll("input").forEach(cb=>cb.checked=v); rl.dispatchEvent(new Event("change")); }); hd.append(b); }
        const g=document.createElement("div"); g.className="types";
        for(const [k,label] of items){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-rtype="${k}"> <span></span>`; l.querySelector("span").textContent=label; l.querySelector("input").checked=rt[k]!==false; g.appendChild(l); }
        box.append(hd,g); rl.appendChild(box); }
      const rs=()=>{ const t={}; rl.querySelectorAll("input[data-rtype]").forEach(cb=>t[cb.dataset.rtype]=cb.checked); return t; };
      radio.setStationTypes("ptrn",rs()); rl.addEventListener("change",()=>{ const t=rs(); radio.setStationTypes("ptrn",t); try{ localStorage.setItem("ptrnTypes",JSON.stringify(t)); }catch(e){} });
      $("#ptrnSet").hidden=false; }
    // PTLK's show switches (this device)
    const pl=$("#ptlkList"), plist=radio.stationTypeList("ptlk");
    if(pl&&plist.length&&radio.stations().some(s=>s.id==="ptlk"&&s.available)){ let pt={}; try{ pt=JSON.parse(localStorage.getItem("ptlkTypes")||"{}"); }catch(e){}
      for(const [k,label] of plist){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-ptype="${k}"> <span>${label}</span>`;
        l.querySelector("input").checked=pt[k]!==false; pl.appendChild(l); }
      const ps=()=>{ const t={}; pl.querySelectorAll("input[data-ptype]").forEach(cb=>t[cb.dataset.ptype]=cb.checked); return t; };
      radio.setStationTypes("ptlk",ps()); pl.addEventListener("change",()=>{ const t=ps(); radio.setStationTypes("ptlk",t); try{ localStorage.setItem("ptlkTypes",JSON.stringify(t)); }catch(e){} });
      $("#ptlkSet").hidden=false; } }
  else { const b=$("#stBtns"); if(b) b.hidden=true; }
  radio.on("caption",c=>{ cap.textContent=`${c.who}: ${c.text}`; clearTimeout(capT); capT=setTimeout(()=>{ cap.textContent=""; },14000); });
  const box=$("#sndOn"); box.checked=false;
  box.addEventListener("change",()=>{ box.checked?radio.start():radio.stop(); if(!box.checked) np.textContent="Press the SOUND button to tune in."; });
  $("#skipBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); } else radio.skip(); });
  $("#spotBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); setTimeout(()=>radio.spotNow(),1200); } else radio.spotNow(); });
  // Save song: renders the song on air again from the top (off the live audio, so it keeps playing) and saves it as an MP3.
  const saveBtn=$("#saveBtn");   // the floppy: saves the show/break on top (recorded from its start) or else the song on air, as an MP3
  if(saveBtn) saveBtn.addEventListener("click",async()=>{
    if(saveBtn.getAttribute("aria-busy")==="true") return;
    if(!radio.isOn()||(!radio.nowPlaying()&&!(radio.onAir&&radio.onAir()))){ cap.textContent="Tune in first, then press the floppy to save what's playing."; return; }
    saveBtn.setAttribute("aria-busy","true"); clearTimeout(capT); const say=t=>{ cap.textContent=t; };
    try{ const r=await MDFM.saveSong(radio,{app,onStatus:say}); cap.textContent=MDFM.savedText?MDFM.savedText(r):`Saved “${r.title}”.`; }
    catch(e){ cap.textContent=e&&e.code==="declined"?"Not saved.":`Couldn't save it: ${(e&&e.message)||e}`; }
    finally{ saveBtn.removeAttribute("aria-busy"); capT=setTimeout(()=>{ cap.textContent=""; },9000); } });
  // TUNE: the sound-tuning pop-out (realism, soundstage, clarity, warmth, room, trunk rattle, radio grain). Kept on this device.
  if(MDFM.mountTune&&radio.setSound&&$("#tunePop")) MDFM.mountTune(radio,{panel:$("#tunePop"),toggle:$("#tuneOn")});
  else if($("#tuneOn")) $("#tuneOn").closest("label").hidden=true;
  $("#stEngine").textContent=`v${MDFM.VERSION}`;
  window.MDFM_receiver(radio,{app});
  // AXMOD (accessibility, MedDev Receiver 1.7+): captions for voices and songs, text versions of the EQ and meters,
  // and Calm mode mutes the voice drops between songs. Skipped quietly on an older receiver.
  (A=>{ if(!A) return; A.hasSound=true;
    radio.on("caption",c=>A.caption(c.text,{who:c.who}));
    radio.on("nowplaying",s=>A.sound(s.station==="ptrn"?`PTRN 101.1: “${s.title}” by ${s.artist}, ${String(s.style).toLowerCase()}, ${s.bpm} BPM`:s.station==="ptlk"?`PTLK 108.0: ${s.style}, “${s.title}”, with ${s.artist}`:s.station==="hearye"?(s.talk?`HEARYE 95.5: ${s.style}, “${s.title}”, with ${s.artist}`:`HEARYE 95.5: “${s.title}” by ${s.artist}, ${s.style.toLowerCase()}`):s.station==="wybc"?`WYBC 88.1: “${s.title}” by ${s.artist}, ambient piano`:`Music: “${s.title}”, ${s.style.toLowerCase()}, ${s.bpm} BPM`));
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
  // What this app can do. The MDFM Radio app has everything; another kit app may have only some of it (live data and
  // Slack come from the kit's mdfm-live module), and anything it can't do is hidden rather than left to fail silently.
  const has=f=>typeof f==="function", LS=app.liveSettings||null, S=LS||app.settings||null, liveOK=has(app.live), slackOK=!!(app.slack&&has(app.slack.connect));
  const hideBox=sel=>{ const el=$(sel); if(el) (el.closest("label,fieldset")||el).hidden=true; };
  if(!has(app.checkNow)){ hideBox("#setUpdates"); hideBox("#setBundled"); hideBox("#fpSet"); $("#checkNow").hidden=true; $("#appUpd").hidden=true; }
  if(!liveOK||!S){ hideBox("#setCity"); hideBox("#setUnits"); }
  if(!slackOK) hideBox("#slackSet");
  const logFn=has(app.showBouncerLog)?app.showBouncerLog:has(app.liveBouncerLog)?app.liveBouncerLog:null; if(!logFn) $("#bouncerLog").hidden=true;
  if(app.autoplay) setTimeout(()=>{ box.checked=true; radio.start(); },600);
  // The Mac's own location (macOS asks once). If it's off or unavailable, the app uses a rough network location and says so.
  const geoWhy=e=>e&&e.code===1?"not allowed (System Settings → Privacy & Security → Location Services → this app)":e&&e.code===3?"timed out":"unavailable";
  if(liveOK&&has(app.coords)){ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>app.coords(p.coords.latitude,p.coords.longitude),e=>{ if(has(app.geoError)) app.geoError(geoWhy(e)); }, {timeout:15000,maximumAge:3600e3,enableHighAccuracy:false});
    else if(has(app.geoError)) app.geoError("unavailable"); }
  const fill=s=>{ s=s||{}; $("#setSlackChannels").value=s.slackChannels||""; $("#setNameFixes").value=s.nameFixes||""; $("#setCity").value=s.city||""; $("#setUnits").value=s.units||"f"; };
  if(S&&has(S.get)) Promise.resolve(S.get()).then(fill).catch(()=>{});
  if(app.settings&&has(app.settings.get)&&has(app.checkNow)) Promise.resolve(app.settings.get()).then(s=>{ s=s||{}; $("#setUpdates").checked=!!s.contentUpdates; $("#setBundled").checked=!!s.useBundled; }).catch(()=>{});
  const liveVals=()=>({city:$("#setCity").value.trim(),units:$("#setUnits").value,slackChannels:$("#setSlackChannels").value.trim(),nameFixes:$("#setNameFixes").value});
  const save=()=>{ const own={contentUpdates:$("#setUpdates").checked,useBundled:$("#setBundled").checked};
    if(LS){ LS.set(liveVals()); if(has(app.checkNow)&&app.settings&&has(app.settings.set)) app.settings.set(own); }
    else if(app.settings&&has(app.settings.set)) app.settings.set({...own,...liveVals()}); };
  for(const id of ["#setUpdates","#setBundled","#setUnits","#setSlackChannels","#setNameFixes","#setCity"]) $(id).addEventListener("change",save);
  if(slackOK){
    $("#slackConnect").addEventListener("click",()=>{ $("#slackState").textContent="Sign in to Slack in the window that opened. It closes by itself when you're done.";
      app.slack.connect().then(ok=>{ if(ok){ const n=$("#setSlackNews"); if(n) n.checked=true; radio.setTypes({news:true}); } }).catch(e=>{ $("#slackState").textContent=`Couldn't connect Slack: ${(e&&e.message)||e}`; }); });
    $("#slackDisconnect").addEventListener("click",()=>app.slack.disconnect());
    if($("#slackSetup")&&has(app.slack.setup)) $("#slackSetup").addEventListener("click",()=>app.slack.setup()); }
  if(has(app.checkNow)) $("#checkNow").addEventListener("click",()=>app.checkNow());
  if(logFn) $("#bouncerLog").addEventListener("click",()=>logFn());
  const paint=st=>{ if(!st) return;
    const e=st.engine; if(e) $("#stEngine").textContent=`v${MDFM.VERSION} (${e.source==="updated"?"updated from the repo":"came with the app"})`;
    const bz=st.bouncer; if(st.live) $("#stLive").textContent=`Location: ${st.live.location} · Weather: ${st.live.weather} · Sports: ${st.live.sports}`+(bz?` · Bouncer: ${bz.label}${bz.blocked?` (${bz.blocked} blocked)`:""}${bz.problem?` · ${bz.problem}`:""}`:"");
    const fpS=st.futureproofer; if(fpS){ $("#stLive").textContent+=` · Futureproofer: ${fpS.label}`;
      const ul=$("#fpList"); ul.textContent="";
      for(const r of fpS.results){ const li=document.createElement("li"); li.className=r.level==="bad"?"bad":r.level==="warn"?"warn":r.level==="ok"?"ok":"";
        const dot=document.createElement("i"); dot.className="dot"; const b=document.createElement("b"); b.textContent=r.title+":"; const sp=document.createElement("span"); sp.textContent=r.summary||"";
        li.append(dot,b,sp); if(r.action&&r.action.url){ const btn=document.createElement("button"); btn.type="button"; btn.className="btn"; btn.textContent=r.action.label||"Open"; btn.onclick=()=>app.open(r.action.url); li.append(btn); }
        ul.append(li); } }
    const sl=st.slack; if(sl&&slackOK){ $("#slackConnect").hidden=sl.connected; $("#slackDisconnect").hidden=!sl.connected; $("#slackConnect").disabled=!sl.ready; if($("#slackSetup")) $("#slackSetup").hidden=!sl.builder;
      $("#slackState").textContent=!sl.ready?"Slack news isn't switched on for RentVision yet. When MedDev switches it on, Connect Slack works here without an update.":sl.connected?`Connected. News: ${sl.news}.`:st.note&&/slack/i.test(st.note)?st.note:"Not connected. When connected, the radio reads the newest posts from #general, #littlevisionaries and #animal-pics at the top of each hour (two minutes at most). Read-only."; }
    if("result" in st) $("#stUpd").textContent=`New content: ${st.result}${st.lastCheck?` · checked ${new Date(st.lastCheck).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""}`+(st.appUpdate?` · App ${st.appUpdate.version} is available`:"");
    if(has(app.checkNow)){ const b=$("#appUpd"); b.hidden=!st.appUpdate; b.onclick=()=>st.appUpdate&&app.open(st.appUpdate.download||st.appUpdate.url); }
  };
  if(has(app.onStatus)) app.onStatus(paint); if(has(app.getStatus)) Promise.resolve(app.getStatus()).then(paint).catch(()=>{});
  if(has(app.onLiveStatus)) app.onLiveStatus(paint); if(has(app.liveStatus)) Promise.resolve(app.liveStatus()).then(paint).catch(()=>{});
  if(liveOK&&!has(app.getStatus)) $("#stLive").textContent="Live weather and sports: finding where you are…";
  else if(!liveOK) $("#stLive").textContent="Weather and sports are the station's own made-up reports here. Live ones need the app kit's mdfm-live module in this app.";
})();
