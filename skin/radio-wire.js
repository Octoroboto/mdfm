/* MDFM Radio page wiring. Works in a plain browser (canned weather/sports) and in the MDFM Radio app,
   which provides window.mdfmApp for live weather, local sports, settings and update status. */
// ===== File overview =====
// Where it fits: scripts/build.mjs inlines this file last in dist/radio.html (the mdfm-radio-wire script), after the library
// (window.MDFM from dist/mdfm.iife.js), the MedDev Receiver (window.MDFM_receiver, vendor/meddev-receiver/receiver.js) and
// skin/types.js. It also ships in dist/manifest.json, so the apps' live updater can replace it without an app release.
// It finds its elements by id in skin/radio-body.html (#np, #cap, #stName, #skipBtn, #settings...), so ids changed there
// must change here too. The hub page has its own wiring and doesn't use this file.
// What it does: makes one radio (MDFM.createMDFM, src/engine.js), connects the app bridge (window.mdfmApp, the Electron
// preload: window controls, live data, voices, settings, update status), builds each station's "What plays" switches and
// the instrument list, wires Save, MIX and the receiver, and (in an app) the settings and status lines.
// Everything it keeps lives in localStorage on this device (keys: mdfmStation, wybcTypes, hearyeTypes, ptrnTypes, clukTypes,
// ptlkTypes, mdfmInstruments, mdfmInstHeard, mdfmSetOpen), always inside try/catch so a blocked storage still plays.
// 1.34: an imported MIX file (the MIX drawer's IMPORT) ticks these lists to match it and saves them (see "mixfile" below).
(()=>{
  // $(s): the first element matching s. app: the Electron app's bridge, or null in a plain browser.
  const $=s=>document.querySelector(s), app=window.mdfmApp||null;
  const radio=MDFM.createMDFM();
  // Hooks other scripts use: __radio (debugging and tests), __vizSource (the receiver's visualizer reads levels), __thwack (the fly swatter's hit sound).
  window.__radio=radio; window.__vizSource=()=>radio.getSpectrum(); window.__thwack=()=>radio.thwack();
  // ===== App window (only inside the apps) =====
  // Frameless app window: the receiver is the window. POWER closes, MIN minimizes, FULL toggles full screen.
  if(app&&app.win){ document.documentElement.classList.add("appwin"); $("#wctl").hidden=false;
    $("#wClose").addEventListener("click",()=>app.win.close()); $("#wMin").addEventListener("click",()=>app.win.minimize());
    $("#wFull").addEventListener("click",()=>app.win.toggleFullScreen());
    document.querySelector("header.top .wtitle").addEventListener("dblclick",e=>{ if(!e.target.closest("button")) app.win.zoom(); });
    app.win.onFullScreen(fs=>document.documentElement.classList.toggle("fullscreen",!!fs));
    // Drag by the metal: a press anywhere that isn't a control moves the window (works even where CSS drag regions don't).
    // tabindex="-1" isn't a control: AXMOD puts it on .wrap as the skip-link target, which made every press look like a control.
    if(app.win.dragStart){ const CONTROL="button,input,select,textarea,label,a,summary,[role=slider],[tabindex]:not([tabindex^=\"-\"]),.rd-btn,.rd-k,.mx-k,.mx-ft,.mx-lcd,.mixdrawer,.settings[open] .setlist,#nozzle,.swatter";
      let dragging=false; const end=()=>{ if(dragging){ dragging=false; app.win.dragEnd(); document.documentElement.classList.remove("dragging"); } };
      document.addEventListener("mousedown",e=>{ if(e.button!==0||e.detail>1||document.documentElement.classList.contains("fullscreen")||e.target.closest(CONTROL)) return;
        // The skin's parts above and around the receiver (a crown, a stage) sit on the bare page: they move the window too.
        if(!e.target.closest(".wrap")&&e.target!==document.body&&e.target!==document.documentElement) return; dragging=true; document.documentElement.classList.add("dragging"); app.win.dragStart(); e.preventDefault(); });
      addEventListener("mouseup",end); addEventListener("pointerup",end); addEventListener("blur",end);
      // A lost mouse-up must never leave the window stuck to the cursor: any move or scroll with the button up ends the drag.
      addEventListener("mousemove",e=>{ if(dragging&&!(e.buttons&1)) end(); }); addEventListener("wheel",end,{passive:true}); }
    // The content's own height, not scrollHeight: body has min-height:100vh, so scrollHeight never drops below the window
    // and the window could only ever grow (the receiver's bug-spray .canlayer spans the page and lags a frame, so it's left out). deck = the same with MIX closed, the floor the app never shrinks below.
    const contentH=()=>{ const cs=getComputedStyle(document.body), top=document.documentElement.getBoundingClientRect().top; let b=0; for(const el of document.body.children){ if(el.hidden||el.tagName==="SCRIPT"||el.tagName==="STYLE"||el.classList.contains("canlayer")) continue; const st=getComputedStyle(el);
        if(st.position==="fixed"||st.display==="none") continue; const r=el.getBoundingClientRect(); if(r.height) b=Math.max(b,r.bottom+(parseFloat(st.marginBottom)||0)); }
      return Math.ceil(b-top+(parseFloat(cs.paddingBottom)||0)+(parseFloat(cs.borderBottomWidth)||0)); };
    const fit=()=>{ const h=contentH(), d=$("#tunePop"), mh=d&&!d.hidden?d.getBoundingClientRect().height+(parseFloat(getComputedStyle(d).marginTop)||0):0; app.win.fit(h,Math.max(0,Math.round(h-mh))); }; setTimeout(fit,400);
    // MIX grows the receiver: every open, close or section change asks the app to refit the window (after the animation).
    addEventListener("mdfm:mixresize",()=>requestAnimationFrame(fit));
    // If the whole receiver fits, it is never left scrolled part-way (which looked like the top being cut off).
    const unscroll=()=>{ const se=document.scrollingElement; if(se&&se.scrollTop>0&&se.scrollHeight<=innerHeight+1) se.scrollTop=0; };
    addEventListener("resize",unscroll); addEventListener("focus",unscroll); document.addEventListener("visibilitychange",unscroll); }
  // ===== Live data from the app =====
  if(app&&typeof app.live==="function") radio.setProviders({weather:()=>app.live("weather"),sports:()=>app.live("sports"),news:()=>app.live("news"),cannedFallback:false});   // live data from the app (MDFM Radio, or a kit app with mdfm-live); without it, the station's own made-up reports
  // PTLK 108.0: newer apps fetch live business and gaming headlines and encyclopedia pages; without them the shows write their own.
  // (Through app.live, so older apps simply answer null.)
  if(app&&typeof app.live==="function") radio.setProviders({headlines:(kind,arg)=>app.live(kind==="wiki"?"wiki:"+arg:"headlines:"+kind)});
  // Newer apps render the robot voices as audio, so the volume and LOW/MID/HIGH EQ apply to them too.
  if(app&&typeof app.tts==="function") radio.setProviders({tts:spec=>app.tts(spec)});
  // ===== Now playing and the station dial =====
  // npText(s): the now-playing line for a "nowplaying" event s ({ station, title, artist, style, bpm, time, talk... }), worded per station.
  const np=$("#np"), cap=$("#cap"); let capT=0;
  const npText=s=>s.station==="cluk"?(s.talk?`${s.style} · “${s.title}” · ${s.artist}`:`“${s.title}” · ${s.artist} · ${String(s.style).toLowerCase()} · ${s.bpm} BPM`):s.station==="ptrn"?`“${s.title}” · ${s.artist} · ${String(s.style).toLowerCase()} · ${s.bpm} BPM${s.time&&s.time!=="4/4"?" · "+s.time:""}`:s.station==="ptlk"||(s.station==="hearye"&&s.talk)?`${s.style} · “${s.title}” · ${s.artist}`:s.station==="hearye"?`“${s.title}” · ${s.artist} · ${s.style.toLowerCase()}`:s.station==="wybc"?`“${s.title}” · ${s.artist} · ambient piano`:`“${s.title}” · ${s.style.toLowerCase()} · ${s.bpm} BPM`;
  radio.on("nowplaying",s=>{ np.textContent=`Now playing: ${npText(s)}`; });
  // Stations: WYBC 88.1 (Collin's ambient piano), HEARYE 95.5 (Renn Faire Radio), MDFM 99.9 HD and PTLK 108.0 (talk). The arrows switch; the choice is remembered on this device.
  const stLS="mdfmStation", showStation=st=>{ if(!st) return; $("#stName").textContent=st.name; document.documentElement.dataset.station=st.id;   // showStation(st): puts the station name on the display and words the Next and Station ID buttons for it; data-station lets the CSS and skins react
    const w=st.id==="wybc"||st.id==="hearye", t=st.id==="ptlk", pt=st.id==="ptrn"; $("#skipBtn").textContent=t?"Next show":w?"Next piece":pt?"Next track":"Next song"; $("#spotBtn").textContent=pt?"Drop a tag":w||t?"Station ID":"Station break";
    $("#skipBtn").title=st.id==="cluk"?"Skip to the next song":t?"Skip to a new show":st.id==="hearye"?"On to the next piece":w?"A new piece":pt?"Mix into the next track on the next bar":"Skip to the next song"; $("#spotBtn").title=pt?"A station tag on the beat":""; };
  if(radio.setStation){ try{ const k=localStorage.getItem(stLS); if(k) radio.setStation(k); }catch(e){}   // the last station picked on this device, if the engine still has it
    showStation(radio.getStation());
    radio.on("station",st=>{ showStation(st); try{ localStorage.setItem(stLS,st.id); }catch(e){}
      if(!radio.isOn()) np.textContent=`Tuned to ${st.name}. Press the SOUND button to tune in.`; else if(st.id==="mdfm"&&window.AXMOD) window.AXMOD.sound("MDFM 99.9 HD"); });
    // step(d): the arrows; d is +1 (up the dial) or -1 (down)
    const step=d=>()=>{ d>0?radio.nextStation():radio.prevStation(); };
    $("#stPrev").addEventListener("click",step(-1)); $("#stNext").addEventListener("click",step(1));
    if(!radio.stations().some(s=>s.id!=="mdfm"&&s.available)) $("#stBtns").hidden=true;   // hide the arrows when MDFM 99.9 is the only station this build can play
    // ===== Per-station "What plays" lists (this device) =====
    // Each list follows one pattern: radio.stationTypeList(id) gives [key, label, group?] rows, a checkbox per row (on unless saved
    // off), the whole set sent with radio.setStationTypes(id, {key: on}) at start and on every change, and saved to localStorage.
    // The section stays hidden when the station isn't available in this build.
    // WYBC's own "what plays" switches (this device)
    const wl=$("#wybcList"), list=radio.stationTypeList("wybc");
    if(wl&&list.length&&radio.stations().some(s=>s.id==="wybc"&&s.available)){ let wt={}; try{ wt=JSON.parse(localStorage.getItem("wybcTypes")||"{}"); }catch(e){} if(!wt||typeof wt!=="object"||Array.isArray(wt)) wt={};
      for(const [k,label] of list){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-wtype="${k}"> <span>${label}</span>`;
        l.querySelector("input").checked=wt[k]!==false; wl.appendChild(l); }
      const ws=()=>{ const t={}; wl.querySelectorAll("input[data-wtype]").forEach(cb=>t[cb.dataset.wtype]=cb.checked); return t; };
      radio.setStationTypes("wybc",ws()); wl.addEventListener("change",()=>{ const t=ws(); radio.setStationTypes("wybc",t); try{ localStorage.setItem("wybcTypes",JSON.stringify(t)); }catch(e){} });
      $("#wybcSet").hidden=false; }
    // HEARYE's show and segment switches (this device)
    const hl=$("#hearyeList"), hlist=radio.stationTypeList("hearye");
    if(hl&&hlist.length&&radio.stations().some(s=>s.id==="hearye"&&s.available)){ let ht={}; try{ ht=JSON.parse(localStorage.getItem("hearyeTypes")||"{}"); }catch(e){} if(!ht||typeof ht!=="object"||Array.isArray(ht)) ht={};
      for(const [k,label] of hlist){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-htype="${k}"> <span></span>`; l.querySelector("span").textContent=label;
        l.querySelector("input").checked=ht[k]!==false; hl.appendChild(l); }
      const hs=()=>{ const t={}; hl.querySelectorAll("input[data-htype]").forEach(cb=>t[cb.dataset.htype]=cb.checked); return t; };
      radio.setStationTypes("hearye",hs()); hl.addEventListener("change",()=>{ const t=hs(); radio.setStationTypes("hearye",t); try{ localStorage.setItem("hearyeTypes",JSON.stringify(t)); }catch(e){} });
      $("#hearyeSet").hidden=false; }
    // PTRN's genre switches, in families, with All / None for each (this device)
    const rl=$("#ptrnList"), rlist=radio.stationTypeList("ptrn");
    if(rl&&rlist.length&&radio.stations().some(s=>s.id==="ptrn"&&s.available)){ let rt={}; try{ rt=JSON.parse(localStorage.getItem("ptrnTypes")||"{}"); }catch(e){} if(!rt||typeof rt!=="object"||Array.isArray(rt)) rt={};
      const fams=[...new Set(rlist.map(x=>x[2]))];
      for(const f of fams){ const box=document.createElement("div"); box.className="ptrnfam"; const hd=document.createElement("div"); hd.className="ptrnfamhd"; const nm=document.createElement("span"); nm.textContent=f; hd.append(nm);
        // All / None buttons tick a whole family, then fire "change" on the list so the normal handler saves it
        const items=rlist.filter(x=>x[2]===f); if(items.length>1) for(const [lab,v] of [["All",true],["None",false]]){ const b=document.createElement("button"); b.type="button"; b.className="btn"; b.textContent=lab; b.setAttribute("aria-label",`${lab} of ${f}`); b.addEventListener("click",()=>{ box.querySelectorAll("input").forEach(cb=>cb.checked=v); rl.dispatchEvent(new Event("change")); }); hd.append(b); }
        const g=document.createElement("div"); g.className="types";
        for(const [k,label] of items){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-rtype="${k}"> <span></span>`; l.querySelector("span").textContent=label; l.querySelector("input").checked=rt[k]!==false; g.appendChild(l); }
        box.append(hd,g); rl.appendChild(box); }
      const rs=()=>{ const t={}; rl.querySelectorAll("input[data-rtype]").forEach(cb=>t[cb.dataset.rtype]=cb.checked); return t; };
      radio.setStationTypes("ptrn",rs()); rl.addEventListener("change",()=>{ const t=rs(); radio.setStationTypes("ptrn",t); try{ localStorage.setItem("ptrnTypes",JSON.stringify(t)); }catch(e){} });
      $("#ptrnSet").hidden=false; }
    // CLUK's genres, shows and on-air switches, in groups with All / None (this device)
    const cl=$("#clukList"), clist=radio.stationTypeList("cluk");
    if(cl&&clist.length&&radio.stations().some(s=>s.id==="cluk"&&s.available)){ let ct={}; try{ ct=JSON.parse(localStorage.getItem("clukTypes")||"{}"); }catch(e){} if(!ct||typeof ct!=="object"||Array.isArray(ct)) ct={};
      for(const f of [...new Set(clist.map(x=>x[2]))]){ const box=document.createElement("div"); box.className="ptrnfam"; const hd=document.createElement("div"); hd.className="ptrnfamhd"; const nm=document.createElement("span"); nm.textContent=f; hd.append(nm);
        const items=clist.filter(x=>x[2]===f); if(items.length>1) for(const [lab,v] of [["All",true],["None",false]]){ const b=document.createElement("button"); b.type="button"; b.className="btn"; b.textContent=lab; b.setAttribute("aria-label",`${lab} of ${f}`); b.addEventListener("click",()=>{ box.querySelectorAll("input").forEach(cb=>cb.checked=v); cl.dispatchEvent(new Event("change")); }); hd.append(b); }
        const g=document.createElement("div"); g.className="types";
        for(const [k,label] of items){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-ctype="${k}"> <span></span>`; l.querySelector("span").textContent=label; l.querySelector("input").checked=ct[k]!==false; g.appendChild(l); }
        box.append(hd,g); cl.appendChild(box); }
      const cs=()=>{ const t={}; cl.querySelectorAll("input[data-ctype]").forEach(cb=>t[cb.dataset.ctype]=cb.checked); return t; };
      radio.setStationTypes("cluk",cs()); cl.addEventListener("change",()=>{ const t=cs(); radio.setStationTypes("cluk",t); try{ localStorage.setItem("clukTypes",JSON.stringify(t)); }catch(e){} });
      $("#clukSet").hidden=false; }
    // Instruments on MDFM and PTRN (1.23): kits, bass, keys, leads and pads, in groups with All / None (this device)
    const il=$("#instList"), ilist=radio.instrumentList?radio.instrumentList():[];
    if(il&&ilist.length){ let it={}; try{ it=JSON.parse(localStorage.getItem("mdfmInstruments")||"{}"); }catch(e){} if(!it||typeof it!=="object"||Array.isArray(it)) it={};
      // CAT: the instrument groups (by category); TAG: the small "since" tag shown beside an instrument; ROLE: the role names used in the list
      const CAT={kit:"Drum kits",bass:"Bass",keys:"Keys and guitars",lead:"Leads",pad:"Pads",highend:"High-end pack"}, TAG={classic:"classic","1.22":"PTRN","1.23":"new","1.24":"CLUK","1.32":"new","1.37":"new"}, ROLE={keys:"keys",lead:"lead",bass:"bass"};   // 1.30: the high-end instruments have a box of their own
      for(const c of Object.keys(CAT)){ const items=c==="highend"?ilist.filter(x=>x[4]==="highend"):ilist.filter(x=>x[2]===c&&x[4]!=="highend"); if(!items.length) continue; const box=document.createElement("div"); box.className="ptrnfam"; const hd=document.createElement("div"); hd.className="ptrnfamhd"; const nm=document.createElement("span"); nm.textContent=CAT[c]; hd.append(nm);
        for(const [lab,v] of [["All",true],["None",false]]){ const b=document.createElement("button"); b.type="button"; b.className="btn"; b.textContent=lab; b.setAttribute("aria-label",`${lab} of ${CAT[c]}`); b.addEventListener("click",()=>{ box.querySelectorAll("input").forEach(cb=>cb.checked=v); il.dispatchEvent(new Event("change")); }); hd.append(b); }
        const g=document.createElement("div"); g.className="types";
        for(const [k,label,cat,since,pk] of items){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-itype="${k}" data-since="${since}"> <span></span> <small></small><em class="inow" hidden>▶ NOW</em><em class="iheard" hidden></em>`; l.querySelector("span").textContent=label; l.querySelector("small").textContent=pk==="highend"?ROLE[cat]||"":TAG[since]||""; l.querySelector("input").checked=it[k]!==false; g.appendChild(l); }   // rows: [key, label, category, since (the version it arrived in, or "classic"), pack]
        const note=c==="highend"?Object.assign(document.createElement("p"),{className:"packnote",textContent:"Marimba, kalimba, celesta, harp, koto, suitcase electric piano, felt and upright pianos, and a plucked upright bass. All and None switch the whole pack."}):null;
        if(note) box.append(hd,note,g); else box.append(hd,g); il.appendChild(box); }
      const is=()=>{ const t={}; il.querySelectorAll("input[data-itype]").forEach(cb=>t[cb.dataset.itype]=cb.checked); return t; };
      const saveI=()=>{ const t=is(); radio.setInstruments(t); try{ localStorage.setItem("mdfmInstruments",JSON.stringify(t)); }catch(e){} };
      radio.setInstruments(is()); il.addEventListener("change",saveI);
      $("#instClassic").addEventListener("click",()=>{ il.querySelectorAll("input[data-itype]").forEach(cb=>cb.checked=cb.dataset.since==="classic"); saveI(); });
      $("#instAll").addEventListener("click",()=>{ il.querySelectorAll("input[data-itype]").forEach(cb=>cb.checked=true); saveI(); });
      // 1.28: what's playing. A "Playing now" card (each part with Switch off) and NOW / HEARD marks on the list.
      // heard: the instruments of the last 12 songs (an array of key lists), for the HEARD ×n marks. Kept in mdfmInstHeard.
      const nowBox=$("#instNow"), HK="mdfmInstHeard"; let heard=[]; try{ heard=JSON.parse(localStorage.getItem(HK)||"[]"); }catch(e){} if(!Array.isArray(heard)) heard=[];
      const cbOf=k=>il.querySelector(`input[data-itype="${k}"]`);
      // paintNow(np): marks NOW on the instruments in the song on air and HEARD on recent ones, and rebuilds the "Playing now" card.
      // radio.instrumentsNow(np) gives [{ key, label, role, on }]; a part with no key is the genre's own sound and can't be switched off.
      const paintNow=np=>{ const L=radio.instrumentsNow?radio.instrumentsNow(np):[], keys=new Set(L.map(x=>x.key).filter(Boolean)), cnt={};
        for(const song of heard) for(const k of song) cnt[k]=(cnt[k]||0)+1;
        il.querySelectorAll("label.opt").forEach(l=>{ const k=l.querySelector("input").dataset.itype, n=l.querySelector(".inow"), h=l.querySelector(".iheard"); n.hidden=!keys.has(k); l.classList.toggle("isnow",keys.has(k));
          h.hidden=keys.has(k)||!cnt[k]; h.textContent=cnt[k]>1?`HEARD ×${cnt[k]}`:"HEARD"; });
        if(!nowBox) return; nowBox.textContent=""; if(!L.length){ nowBox.hidden=true; return; } nowBox.hidden=false;
        const hd=document.createElement("div"); hd.className="ptrnfamhd"; const t=document.createElement("span"); t.textContent=`Playing now${np&&np.title?": “"+np.title+"”":""}`; hd.append(t);
        if(radio.skip){ const sk=document.createElement("button"); sk.type="button"; sk.className="btn"; sk.textContent="Next song"; sk.addEventListener("click",()=>radio.skip()); hd.append(sk); } nowBox.append(hd);
        const g=document.createElement("div"); g.className="instnowlist";
        for(const x of L){ const row=document.createElement("div"); row.className="instrow"+(x.on?"":" off"); const r=document.createElement("small"); r.textContent=x.role; const nm=document.createElement("span"); nm.textContent=x.label; row.append(r,nm);
          if(x.key){ const cb=cbOf(x.key), b=document.createElement("button"); b.type="button"; b.className="btn"; const on=cb?cb.checked:x.on; b.textContent=on?"Switch off":"Switch on"; b.setAttribute("aria-label",`${on?"Switch off":"Switch on"} ${x.label}`);
            if(!on){ const o=document.createElement("em"); o.textContent="off from the next song"; row.append(o); }
            b.addEventListener("click",()=>{ if(cb){ cb.checked=!cb.checked; saveI(); paintNow(radio.nowPlaying&&radio.nowPlaying()); } }); row.append(b); }
          else { const o=document.createElement("em"); o.textContent="this genre's own"; row.append(o); }
          g.append(row); }
        nowBox.append(g); };
      // a new song title adds its instruments to the heard list; talk breaks are ignored
      let lastT=null; radio.on("nowplaying",np=>{ if(!np||np.talk) return; const L=radio.instrumentsNow?radio.instrumentsNow(np):[]; if(!L.length) return;
        if(np.title!==lastT){ lastT=np.title; heard.push([...new Set(L.map(x=>x.key).filter(Boolean))]); while(heard.length>12) heard.shift(); try{ localStorage.setItem(HK,JSON.stringify(heard)); }catch(e){} }
        paintNow(np); });
      il.addEventListener("change",()=>paintNow(radio.nowPlaying&&radio.nowPlaying())); paintNow(radio.nowPlaying&&radio.nowPlaying());
      $("#instSet").hidden=false; }
    // PTLK's show switches (this device)
    const pl=$("#ptlkList"), plist=radio.stationTypeList("ptlk");
    if(pl&&plist.length&&radio.stations().some(s=>s.id==="ptlk"&&s.available)){ let pt={}; try{ pt=JSON.parse(localStorage.getItem("ptlkTypes")||"{}"); }catch(e){} if(!pt||typeof pt!=="object"||Array.isArray(pt)) pt={};
      for(const [k,label] of plist){ const l=document.createElement("label"); l.className="opt"; l.innerHTML=`<input type="checkbox" data-ptype="${k}"> <span>${label}</span>`;
        l.querySelector("input").checked=pt[k]!==false; pl.appendChild(l); }
      const ps=()=>{ const t={}; pl.querySelectorAll("input[data-ptype]").forEach(cb=>t[cb.dataset.ptype]=cb.checked); return t; };
      radio.setStationTypes("ptlk",ps()); pl.addEventListener("change",()=>{ const t=ps(); radio.setStationTypes("ptlk",t); try{ localStorage.setItem("ptlkTypes",JSON.stringify(t)); }catch(e){} });
      $("#ptlkSet").hidden=false; }
    // 1.34: an imported MIX file changed the switches (the "switch" step of its crossmix): tick every list to match the file,
    // then fire each list's "change" so its own handler sends the set to the engine and saves it, as if ticked by hand.
    // MDFM 99.9's list (#typeList) is the receiver's; its change handler saves it the same way. Disabled boxes (Slack news
    // without Slack) are left alone.
    radio.on("mixfile",e=>{ if(!e||e.phase!=="switch") return;
      const sync=(sel,attr,t)=>{ const box=$(sel); if(!box||!t||typeof t!=="object") return; box.querySelectorAll(`input[${attr}]`).forEach(cb=>{ const k=cb.getAttribute(attr); if(!cb.disabled&&k in t) cb.checked=t[k]!==false; }); box.dispatchEvent(new Event("change")); };
      const T=e.types||{}; sync("#typeList","data-type",T.mdfm); sync("#wybcList","data-wtype",T.wybc); sync("#hearyeList","data-htype",T.hearye); sync("#ptrnList","data-rtype",T.ptrn);
      sync("#clukList","data-ctype",T.cluk); sync("#ptlkList","data-ptype",T.ptlk); sync("#instList","data-itype",e.instruments); }); }
  else { const b=$("#stBtns"); if(b) b.hidden=true; }   // an engine without stations: no dial
  // ===== Captions, play controls and Save =====
  // Captions (every spoken line) show under the display for 14 s.
  radio.on("caption",c=>{ cap.textContent=`${c.who}: ${c.text}`; clearTimeout(capT); capT=setTimeout(()=>{ cap.textContent=""; },14000); });
  const box=$("#sndOn"); box.checked=false;   // the SOUND switch: always starts off, because browsers need a click before audio can start
  box.addEventListener("change",()=>{ box.checked?radio.start():radio.stop(); if(!box.checked) np.textContent="Press the SOUND button to tune in."; });
  $("#skipBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); } else radio.skip(); });
  $("#spotBtn").addEventListener("click",()=>{ if(!radio.isOn()){ box.checked=true; radio.start(); setTimeout(()=>radio.spotNow(),1200); } else radio.spotNow(); });   // the first ID waits 1.2 s for the audio to start
  // Save song: renders the song on air again from the top (off the live audio, so it keeps playing) and saves it as an MP3.
  const saveBtn=$("#saveBtn");   // the floppy: saves the show/break on top (recorded from its start) or else the song on air, as an MP3
  if(saveBtn) saveBtn.addEventListener("click",async()=>{
    if(saveBtn.getAttribute("aria-busy")==="true") return;   // aria-busy marks a save in progress, so a second press does nothing
    if(!radio.isOn()||(!radio.nowPlaying()&&!(radio.onAir&&radio.onAir()))){ cap.textContent="Tune in first, then press the floppy to save what's playing."; return; }
    saveBtn.setAttribute("aria-busy","true"); clearTimeout(capT); const say=t=>{ cap.textContent=t; };
    try{ const r=await MDFM.saveSong(radio,{app,onStatus:say}); cap.textContent=MDFM.savedText?MDFM.savedText(r):`Saved “${r.title}”.`; }
    catch(e){ cap.textContent=e&&e.code==="declined"?"Not saved.":`Couldn't save it: ${(e&&e.message)||e}`; }
    finally{ saveBtn.removeAttribute("aria-busy"); capT=setTimeout(()=>{ cap.textContent=""; },9000); } });
  // ===== MIX, version and the receiver =====
  // MIX (was TUNE): the mixing drawer under the deck: EQ and sound, style, groove and key, effects. Kept on this device.
  // It runs before MDFM_receiver: the receiver wires #uwBtn, which MIX puts in FX > COLOUR.
  const mountMix=MDFM.mountMix||MDFM.mountTune;
  if(mountMix&&radio.setSound&&$("#tunePop")) mountMix(radio,{panel:$("#tunePop"),toggle:$("#tuneOn"),app});   // app: MIX FILE's EXPORT saves through the app's Save dialog (1.34)
  else if($("#tuneOn")) $("#tuneOn").closest("label").hidden=true;
  $("#stEngine").textContent=`v${MDFM.VERSION}`;
  window.MDFM_receiver(radio,{app});   // the MedDev Receiver wires the rest: power, volume, EQ display, meters, skins, MDFM 99.9's type list, the badges
  // AXMOD (accessibility, MedDev Receiver 1.7+): captions for voices and songs, text versions of the EQ and meters,
  // and Calm mode mutes the voice drops between songs. Skipped quietly on an older receiver.
  // A is window.AXMOD (the receiver's accessibility module) or undefined on an older receiver.
  (A=>{ if(!A) return; A.hasSound=true;
    radio.on("caption",c=>A.caption(c.text,{who:c.who}));
    radio.on("nowplaying",s=>A.sound(s.station==="cluk"?(s.talk?`CLUK 92.3: ${s.style}, “${s.title}”, with ${s.artist}`:`CLUK 92.3: “${s.title}” by ${s.artist}, ${String(s.style).toLowerCase()}, ${s.bpm} BPM`):s.station==="ptrn"?`PTRN 101.1: “${s.title}” by ${s.artist}, ${String(s.style).toLowerCase()}, ${s.bpm} BPM`:s.station==="ptlk"?`PTLK 108.0: ${s.style}, “${s.title}”, with ${s.artist}`:s.station==="hearye"?(s.talk?`HEARYE 95.5: ${s.style}, “${s.title}”, with ${s.artist}`:`HEARYE 95.5: “${s.title}” by ${s.artist}, ${s.style.toLowerCase()}`):s.station==="wybc"?`WYBC 88.1: “${s.title}” by ${s.artist}, ambient piano`:`Music: “${s.title}”, ${s.style.toLowerCase()}, ${s.bpm} BPM`));
    const band=(a,i,j)=>{ let m=0; for(let k=i;k<j;k++) m=Math.max(m,a[k]||0); return Math.round(m*100)+"%"; };   // band(a, i, j): the loudest of spectrum bars i..j-1, as a percentage
    A.describe($("header.top .lcd.viz"),()=>{ if(!radio.isOn()) return "off"; const s=radio.getSpectrum&&radio.getSpectrum(); return s?`bass ${band(s,0,6)}, mids ${band(s,6,13)}, treble ${band(s,13,19)}`:"on"; },{label:"EQ"});
    A.describe($(".vu"),()=>{ const l=radio.isOn()&&radio.getLevels?radio.getLevels():null; return l?`left ${Math.round(l[0]+14)} VU, right ${Math.round(l[1]+14)} VU`:"radio off"; },{label:"VU meters"});
    const stingers=()=>{ const cb=document.querySelector('#typeList input[data-type="stingers"]'); return cb?cb.checked:true; };   // the "Voice drops between songs" switch; Calm mode overrides it without changing it
    A.on(v=>{ if(radio.setTypes) radio.setTypes({stingers:!v.calm&&stingers()}); });
    if(A.get().calm&&radio.setTypes) radio.setTypes({stingers:false});
    const tl=$("#typeList"); if(tl) tl.addEventListener("change",()=>{ if(A.get().calm&&radio.setTypes) radio.setTypes({stingers:false}); });
  })(window.AXMOD);
  // ===== Settings panel =====
  // MDFM 99.9's list: "Songs in 3/4…" is music, the rest is talk and breaks; each gets a heading (same container, so the receiver's handler still reads it)
  { const tl=$("#typeList"), m=tl&&tl.querySelector('input[data-type="meters"]');
    if(m){ const h=t=>{ const d=document.createElement("div"); d.className="tsub"; d.textContent=t; return d; };
      tl.prepend(h("Music"),m.closest("label"),h("Talk and breaks")); } }
  $("#settings").hidden=false;
  document.querySelectorAll(".apponly").forEach(el=>el.hidden=!app);
  // Settings sections: the station on air opens by itself (ON AIR); the others remember being opened (mdfmSetOpen).
  // mine: which sections the person opened or closed by hand. auto: the section opened automatically for the station on air
  // (closed again when the station changes, unless the person opened it themselves). data-auto marks a toggle made by code.
  { const secs=[...document.querySelectorAll("#settings details.setsec")]; let mine={}; try{ mine=JSON.parse(localStorage.getItem("mdfmSetOpen")||"{}")||{}; }catch(e){} if(typeof mine!=="object"||Array.isArray(mine)) mine={};
    let auto=null;
    for(const d of secs){ const k=d.dataset.sec; if(k in mine) d.open=!!mine[k];
      d.addEventListener("toggle",()=>{ if(d===auto&&!d.open) auto=null; if(d.dataset.auto){ delete d.dataset.auto; return; } mine[k]=d.open; try{ localStorage.setItem("mdfmSetOpen",JSON.stringify(mine)); }catch(e){} }); }
    const onAir=st=>{ if(!st) return; for(const d of secs){ const on=d.dataset.station===st.id; d.classList.toggle("live",on); }
      if(auto&&auto.dataset.station!==st.id&&!mine[auto.dataset.sec]){ auto.dataset.auto="1"; auto.open=false; }
      const d=secs.find(x=>x.dataset.station===st.id); if(d&&!d.open){ d.dataset.auto="1"; d.open=true; auto=d; } };
    if(radio.getStation){ onAir(radio.getStation()); radio.on("station",onAir); }
    // "9 of 11 on" beside each list
    const count=d=>{ const c=d.querySelector(".setcount"); if(!c) return; const all=[...d.querySelectorAll('input[type=checkbox]')].filter(x=>!x.disabled); c.textContent=all.length?`${all.filter(x=>x.checked).length} of ${all.length} on`:""; };
    for(const d of secs){ count(d); d.addEventListener("change",()=>count(d)); d.addEventListener("click",e=>{ if(e.target.closest("button")) setTimeout(()=>count(d),0); }); } }
  if(!app) return;   // everything below is for the apps only
  // What this app can do. The MDFM Radio app has everything; another kit app may have only some of it (live data and
  // Slack come from the kit's mdfm-live module), and anything it can't do is hidden rather than left to fail silently.
  // has(f): f is a function. LS: the kit's mdfm-live settings (when present), else the app's own settings (S). liveOK / slackOK: what this app supports.
  const has=f=>typeof f==="function", LS=app.liveSettings||null, S=LS||app.settings||null, liveOK=has(app.live), slackOK=!!(app.slack&&has(app.slack.connect));
  const hideBox=sel=>{ const el=$(sel); if(el) (el.closest("label,fieldset")||el).hidden=true; };   // hideBox(sel): hides a setting's whole row
  if(!has(app.checkNow)){ hideBox("#setUpdates"); hideBox("#setBundled"); hideBox("#fpSet"); $("#checkNow").hidden=true; $("#appUpd").hidden=true; }
  if(!liveOK||!S){ hideBox("#setCity"); hideBox("#setUnits"); }
  if(!slackOK) hideBox("#slackSet");
  const logFn=has(app.showBouncerLog)?app.showBouncerLog:has(app.liveBouncerLog)?app.liveBouncerLog:null; if(!logFn) $("#bouncerLog").hidden=true;
  for(const d of document.querySelectorAll("#settings details.setsec.apponly")) if(![...d.children].some(c=>c.tagName!=="SUMMARY"&&!c.hidden)) d.hidden=true;   // hide any app-only section left with nothing in it
  if(app.autoplay) setTimeout(()=>{ box.checked=true; radio.start(); },600);   // apps can start playing by themselves (they allow autoplay)
  // The Mac's own location (macOS asks once). If it's off or unavailable, the app uses a rough network location and says so.
  const geoWhy=e=>e&&e.code===1?"not allowed (System Settings → Privacy & Security → Location Services → this app)":e&&e.code===3?"timed out":"unavailable";
  if(liveOK&&has(app.coords)){ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>app.coords(p.coords.latitude,p.coords.longitude),e=>{ if(has(app.geoError)) app.geoError(geoWhy(e)); }, {timeout:15000,maximumAge:3600e3,enableHighAccuracy:false});
    else if(has(app.geoError)) app.geoError("unavailable"); }
  // fill(s): puts saved settings into the fields. save(): writes them back: live data settings to LS when the kit has it,
  // update settings to the app's own store.
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
  // paint(st): the app's status object -> the version line (bundled or updated engine), live data and Bouncer/Futureproofer
  // status, the Futureproofer's results list, the Slack buttons, and content/app update lines. Called on every status push.
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
  // Status arrives two ways: the MDFM Radio app's onStatus/getStatus, and the kit's mdfm-live onLiveStatus/liveStatus.
  if(has(app.onStatus)) app.onStatus(paint); if(has(app.getStatus)) Promise.resolve(app.getStatus()).then(paint).catch(()=>{});
  if(has(app.onLiveStatus)) app.onLiveStatus(paint); if(has(app.liveStatus)) Promise.resolve(app.liveStatus()).then(paint).catch(()=>{});
  if(liveOK&&!has(app.getStatus)) $("#stLive").textContent="Live weather and sports: finding where you are…";
  else if(!liveOK) $("#stLive").textContent="Weather and sports are the station's own made-up reports here. Live ones need the app kit's mdfm-live module in this app.";
})();
