/* MDFM receiver controls, shared by the MDFM Radio page and the Media Development Hub:
   LOW / MID / HIGH tone knobs (-12..+12 dB, centre = flat), the big VOLUME knob, LET IT RIDE and UNDERWATER (Collin's modes),
   and the "What plays between songs" checkboxes. Knobs: drag up/right, scroll, or arrow keys; double-click resets.
   Settings are remembered on this device; content types go to the app's settings when an app bridge is present.
   Usage: MDFM_receiver(radio, { app })   (looks for the standard element ids/classes; anything missing is skipped) */
window.MDFM_receiver=function(radio,{app=null}={}){
  const $=s=>document.querySelector(s);
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
  const TYPES=(window.MDFM_TYPES||[]).map(([k,label])=>[k,label,k==="news"&&!app?"app only":""]);
  const typeList=$("#typeList"); let types={}; if(!typeList) return;
  try{ types=app?(app.settings.get().types||{}):JSON.parse(localStorage.getItem("mdfmTypes")||"{}"); }catch(e){}
  if(app) types.news=!!app.settings.get().slackNews;
  for(const [k,label,note] of TYPES){ const l=document.createElement("label"); l.className="opt";
    l.innerHTML=`<input type="checkbox" data-type="${k}"${k==="news"?' id="setSlackNews"':""}> <span>${label}${note?` <small>(${note})</small>`:""}</span>`;
    const cb=l.querySelector("input"); cb.checked=types[k]!==false; if(k==="news"&&!app){ cb.disabled=true; cb.checked=false; } typeList.appendChild(l); }
  const typeState=()=>{ const t={}; typeList.querySelectorAll("input[data-type]").forEach(cb=>t[cb.dataset.type]=cb.checked); return t; };
  radio.setTypes(typeState());
  typeList.addEventListener("change",()=>{ const t=typeState(); radio.setTypes(t);
    if(app) app.settings.set({types:t,slackNews:t.news}); else try{ localStorage.setItem("mdfmTypes",JSON.stringify(t)); }catch(e){} });
  // In MD Hub the same switches are in the app's Settings too: follow changes made there.
  if(app&&app.settings.onChange) app.settings.onChange(s=>{ if(!s) return; const t=Object.assign({},s.types||{}); if("slackNews" in s) t.news=!!s.slackNews;
    typeList.querySelectorAll("input[data-type]").forEach(cb=>{ if(cb.dataset.type in t) cb.checked=t[cb.dataset.type]!==false; }); radio.setTypes(typeState()); });
};
