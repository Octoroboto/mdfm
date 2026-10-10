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
    if(app.win.dragStart){ const CONTROL="button,input,select,textarea,label,a,summary,[role=slider],[tabindex],.rd-btn,.rd-k,.settings[open] .setgrid,#nozzle,.swatter";
      let dragging=false; const end=()=>{ if(dragging){ dragging=false; app.win.dragEnd(); document.documentElement.classList.remove("dragging"); } };
      document.addEventListener("mousedown",e=>{ if(e.button!==0||e.detail>1||document.documentElement.classList.contains("fullscreen")||e.target.closest(CONTROL)) return;
        if(!e.target.closest(".wrap")) return; dragging=true; document.documentElement.classList.add("dragging"); app.win.dragStart(); e.preventDefault(); });
      addEventListener("mouseup",end); addEventListener("blur",end); }
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
  // LOW / MID / HIGH tone knobs (-12..+12 dB, centre = flat) and the big VOLUME knob. Drag up/right, scroll, or use the arrow keys;
  // double-click puts a knob back. Remembered on this device.
  { const load=(k,d)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } }, save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
    const tone=Object.assign({low:0,mid:0,high:0},load("mdfmTone",{})); let vol=load("mdfmVolume",.8);
    const ticks=(svg,n,r,cx,big)=>{ let h=""; for(let i=0;i<=n;i++){ const a=(-135+i*270/n)*Math.PI/180, major=i===0||i===n||i===n/2; h+=`<circle cx="${cx+Math.sin(a)*r}" cy="${cx-Math.cos(a)*r}" r="${major?1.5:.9}" fill="rgba(226,229,238,.75)"/>`; } svg.innerHTML=h+(big||""); };
    document.querySelectorAll(".tk-ticks").forEach(s=>ticks(s,10,27,30));
    { let lab=""; for(let i=0;i<=10;i++){ const a=(-135+i*27)*Math.PI/180; lab+=`<text x="${70+Math.sin(a)*64}" y="${70-Math.cos(a)*64+3}" text-anchor="middle" font-family="Tahoma,Verdana,sans-serif" font-weight="700" font-size="8.5" fill="rgba(226,229,238,.82)">${i}</text>`; }
      const sc=document.querySelector(".vol-scale"); if(sc) ticks(sc,40,54,70,lab); }
    const knob=(el,get,set,min,max,step,fmt,reset)=>{ if(!el) return; const show=()=>{ const v=get(), f=(v-min)/(max-min); el.style.transform=`rotate(${-135+f*270}deg)`; el.setAttribute("aria-valuenow",String(Math.round(v*10)/10)); el.setAttribute("aria-valuetext",fmt(v)); el.title=fmt(v); };
      const put=v=>{ set(Math.max(min,Math.min(max,v))); show(); }; let sx=0,sy=0,sv=0;
      el.addEventListener("pointerdown",e=>{ el.setPointerCapture(e.pointerId); sx=e.clientX; sy=e.clientY; sv=get(); e.preventDefault(); e.stopPropagation(); });
      el.addEventListener("pointermove",e=>{ if(!el.hasPointerCapture(e.pointerId)) return; put(sv+((e.clientX-sx)-(e.clientY-sy))/150*(max-min)); });
      el.addEventListener("wheel",e=>{ e.preventDefault(); put(get()-Math.sign(e.deltaY)*step); },{passive:false});
      el.addEventListener("dblclick",()=>put(reset));
      el.addEventListener("keydown",e=>{ const k=e.key, st=e.shiftKey?step*4:step; if(k==="ArrowUp"||k==="ArrowRight") put(get()+st); else if(k==="ArrowDown"||k==="ArrowLeft") put(get()-st); else if(k==="Home") put(min); else if(k==="End") put(max); else return; e.preventDefault(); });
      show(); };
    radio.setTone(tone); radio.setVolume(vol);
    document.querySelectorAll(".tk").forEach(t=>{ const b=t.dataset.band; knob(t.querySelector(".tk-knob"),()=>tone[b],v=>{ tone[b]=Math.round(v*2)/2; radio.setTone({[b]:tone[b]}); save("mdfmTone",tone); },-12,12,1,v=>`${b[0].toUpperCase()+b.slice(1)} ${v>0?"+":""}${v} dB`,0); });
    knob(document.querySelector(".vol-knob"),()=>vol,v=>{ vol=Math.round(v*100)/100; radio.setVolume(vol); save("mdfmVolume",vol); },0,1,.05,v=>`Volume ${Math.round(v*10*10)/10}`,.8); }
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
