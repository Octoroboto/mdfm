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
    const fit=()=>app.win.fit(Math.ceil(document.documentElement.scrollHeight)); setTimeout(fit,400); }
  if(app) radio.setProviders({weather:()=>app.live("weather"),sports:()=>app.live("sports"),news:()=>app.live("news"),cannedFallback:false});
  const np=$("#np"), cap=$("#cap"); let capT=0;
  radio.on("nowplaying",s=>{ np.textContent=`Now playing: “${s.title}” · ${s.style.toLowerCase()} · ${s.bpm} BPM`; });
  radio.on("caption",c=>{ cap.textContent=`${c.who}: ${c.text}`; clearTimeout(capT); capT=setTimeout(()=>{ cap.textContent=""; },14000); });
  const box=$("#sndOn"); box.checked=false;
  box.addEventListener("change",()=>{ box.checked?radio.start():radio.stop(); if(!box.checked) np.textContent="Press the speaker to tune in."; });
  $("#skipBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); } else radio.skip(); });
  $("#spotBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); setTimeout(()=>radio.spotNow(),1200); } else radio.spotNow(); });
  $("#stEngine").textContent=`v${MDFM.VERSION}`;
  // Collin's sound modes: LET IT RIDE (longer songs) and UNDERWATER. Remembered on this device.
  const mode=(btn,led,key,set,get)=>{ const b=$(btn); if(!b) return; let v=false; try{ v=localStorage.getItem(key)==="1"; }catch(e){}
    const show=()=>{ b.setAttribute("aria-pressed",String(get())); $(led).classList.toggle("on",get()); };
    if(v) set(true); show();
    b.addEventListener("click",e=>{ if(e.detail>0) b.blur(); set(!get()); show(); try{ localStorage.setItem(key,get()?"1":"0"); }catch(err){} }); };
  if(radio.setLetItRide) mode("#rideBtn","#rideLed","mdfmRide",v=>radio.setLetItRide(v),()=>radio.isLetItRide());
  if(radio.setUnderwater) mode("#uwBtn","#uwLed","mdfmUnderwater",v=>radio.setUnderwater(v),()=>radio.isUnderwater());
  // Content types people can switch off. In the app they're saved with the app settings; in a browser, on this device.
  const TYPES=[["ids","Station IDs"],["stingers","Voice drops between songs"],["ads","Ads"],["interviews","Interviews"],["callers","Call-ins"],
    ["weather","Weather with Tabitha"],["sports","Sports with Chip"],["plays","Golden Age radio plays"],["arts","Arts and Culture"],["news","Company news from Slack",!app?"app only":""]];
  const typeList=$("#typeList"); let types={};
  try{ types=app?(app.settings.get().types||{}):JSON.parse(localStorage.getItem("mdfmTypes")||"{}"); }catch(e){}
  if(app) types.news=!!app.settings.get().slackNews;
  for(const [k,label,note] of TYPES){ const l=document.createElement("label"); l.className="opt";
    l.innerHTML=`<input type="checkbox" data-type="${k}"${k==="news"?' id="setSlackNews"':""}> <span>${label}${note?` <small>(${note})</small>`:""}</span>`;
    const cb=l.querySelector("input"); cb.checked=types[k]!==false; if(k==="news"&&!app){ cb.disabled=true; cb.checked=false; } typeList.appendChild(l); }
  const typeState=()=>{ const t={}; typeList.querySelectorAll("input[data-type]").forEach(cb=>t[cb.dataset.type]=cb.checked); return t; };
  radio.setTypes(typeState());
  typeList.addEventListener("change",()=>{ const t=typeState(); radio.setTypes(t);
    if(app) app.settings.set({types:t,slackNews:t.news}); else try{ localStorage.setItem("mdfmTypes",JSON.stringify(t)); }catch(e){} });
  $("#settings").hidden=false;
  document.querySelectorAll(".apponly").forEach(el=>el.hidden=!app);
  if(!app) return;
  if(app.autoplay) setTimeout(()=>{ box.checked=true; radio.start(); },600);
  if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>app.coords(p.coords.latitude,p.coords.longitude),()=>{}, {timeout:8000,maximumAge:3600e3});
  const s=app.settings.get();
  $("#setSlackChannels").value=s.slackChannels||""; $("#setNameFixes").value=s.nameFixes||"";
  $("#setUpdates").checked=!!s.contentUpdates; $("#setBundled").checked=!!s.useBundled; $("#setCity").value=s.city||""; $("#setUnits").value=s.units||"f";
  const save=()=>app.settings.set({contentUpdates:$("#setUpdates").checked,useBundled:$("#setBundled").checked,city:$("#setCity").value.trim(),units:$("#setUnits").value,
    slackChannels:$("#setSlackChannels").value.trim(),nameFixes:$("#setNameFixes").value});
  for(const id of ["#setUpdates","#setBundled","#setUnits","#setSlackChannels","#setNameFixes"]) $(id).addEventListener("change",save);
  $("#slackConnect").addEventListener("click",()=>{ $("#slackState").textContent="Finish signing in to Slack in your browser..."; app.slack.connect().then(ok=>{ if(ok){ $("#setSlackNews").checked=true; radio.setTypes({news:true}); } }); });
  $("#slackDisconnect").addEventListener("click",()=>app.slack.disconnect());
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
    const sl=st.slack; if(sl){ $("#slackConnect").hidden=sl.connected; $("#slackDisconnect").hidden=!sl.connected; $("#slackConnect").disabled=!sl.ready;
      $("#slackState").textContent=!sl.ready?"Slack news isn't set up for this copy of the app yet.":sl.connected?`Connected. News: ${sl.news}.`:"Not connected. When connected, the radio reads the newest posts from #general, #littlevisionaries and #animal-pics at the top of each hour (two minutes at most). Read-only."; }
    $("#stUpd").textContent=`New content: ${st.result}${st.lastCheck?` · checked ${new Date(st.lastCheck).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""}`+(st.appUpdate?` · App ${st.appUpdate.version} is available`:"");
    const b=$("#appUpd"); b.hidden=!st.appUpdate; b.onclick=()=>st.appUpdate&&app.open(st.appUpdate.download||st.appUpdate.url);
  };
  app.onStatus(paint); app.getStatus().then(paint);
})();
