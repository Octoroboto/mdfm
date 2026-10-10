/* MD Hub frame wiring: window controls, drag by the metal, Bouncer + Futureproofer badges, settings. */
(()=>{
  const $=id=>document.getElementById(id), h=window.mdhub; if(!h) return;
  $("wClose").onclick=()=>h.win.close(); $("wMin").onclick=()=>h.win.minimize(); $("wFull").onclick=()=>h.win.toggleFullScreen();
  $("strip").addEventListener("dblclick",e=>{ if(!e.target.closest("button")) h.win.zoom(); });
  h.win.onFullScreen(v=>document.documentElement.classList.toggle("fullscreen",v));
  let dragging=false; const end=()=>{ if(dragging){ dragging=false; h.win.dragEnd(); document.documentElement.classList.remove("dragging"); } };
  $("strip").addEventListener("mousedown",e=>{ if(e.button!==0||e.detail>1||e.target.closest("button")||document.documentElement.classList.contains("fullscreen")) return;
    dragging=true; document.documentElement.classList.add("dragging"); h.win.dragStart(); e.preventDefault(); });
  addEventListener("mouseup",end); addEventListener("blur",end);
  // settings
  const panel=$("settings"), setBtn=$("setBtn");
  const show=open=>{ panel.hidden=!open; setBtn.setAttribute("aria-pressed",String(open)); h.showSettings(open); if(open) details(); };
  setBtn.onclick=()=>show(panel.hidden);
  // the two badges on the strip open settings at their own section
  const jump=id=>{ show(true); const el=$(id); el.scrollIntoView({block:"start",behavior:"smooth"}); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); };
  $("bdgBouncer").onclick=()=>{ jump("boxBouncer"); details(); }; $("bdgFp").onclick=()=>jump("boxFp"); $("closeSet").onclick=()=>show(false);
  addEventListener("keydown",e=>{ if(e.key==="Escape"&&!panel.hidden) show(false); });
  const s=h.settings.get();
  $("setCity").value=s.city||""; $("setUnits").value=s.units||"f"; $("setSlackChannels").value=s.slackChannels||""; $("setNameFixes").value=s.nameFixes||"";
  // content switches (same list and wording as every MDFM receiver)
  const tbox=$("setTypes");
  for(const [k,label] of window.MDFM_TYPES||[]){ const l=document.createElement("label"); l.className="opt"; const cb=document.createElement("input"); cb.type="checkbox"; cb.dataset.type=k;
    const sp=document.createElement("span"); sp.textContent=label; l.append(cb,document.createTextNode(" "),sp); tbox.append(l); }
  const showTypes=st=>{ const t=Object.assign({},st.types||{}); t.news=!!st.slackNews; tbox.querySelectorAll("input").forEach(cb=>cb.checked=t[cb.dataset.type]!==false); };
  showTypes(s);
  tbox.addEventListener("change",()=>{ const t={}; tbox.querySelectorAll("input").forEach(cb=>t[cb.dataset.type]=cb.checked); h.settings.set({types:t}); });
  // skin: the frame's own look follows the same choice as the hub page
  const skinSel=$("setSkin");
  async function skins(){ const l=await h.skins(); if(!l) return; const house=l.skins.find(k=>k.id===l.houseDefault);
    skinSel.textContent=""; const o=document.createElement("option"); o.value=""; o.textContent=`House default (${house?house.name:"Default"})`; skinSel.append(o);
    for(const k of l.skins){ const op=document.createElement("option"); op.value=k.id; op.textContent=k.name; op.title=k.description||""; skinSel.append(op); }
    skinSel.value=l.skins.some(k=>k.id===l.choice)?l.choice:""; document.documentElement.dataset.skin=l.current;
    $("themeCss").href="theme.css?s="+encodeURIComponent(l.current)+"&t="+Date.now(); }
  skinSel.addEventListener("change",()=>h.settings.set({skin:skinSel.value}));
  skins();
  if(h.settings.onTypes) h.settings.onTypes(st=>{ showTypes(st); skins(); });
  const save=()=>h.settings.set({city:$("setCity").value.trim(),units:$("setUnits").value,slackChannels:$("setSlackChannels").value.trim(),nameFixes:$("setNameFixes").value});
  for(const id of ["setCity","setUnits","setSlackChannels","setNameFixes"]) $(id).addEventListener("change",save);
  $("slackConnect").onclick=()=>{ $("slackState").textContent="Sign in to Slack in the window that opened. It closes by itself when you're done."; h.slack.connect(); };
  if(h.slack.setup) $("slackSetup").onclick=()=>h.slack.setup();
  $("slackDisconnect").onclick=()=>h.slack.disconnect();
  $("checkNow").onclick=()=>h.checkNow().then(paint);
  $("logApp").onclick=()=>h.showBouncerLog("app"); $("logHub").onclick=()=>h.showBouncerLog("hub"); $("reloadHub").onclick=()=>{ h.reloadHub(); show(false); };
  const LV=l=>l==="green"||l==="amber"||l==="red"?l:"";
  const badge=(id,level,text,title)=>{ const el=$(id); el.className="kbadge "+LV(level); $(id+"Txt").textContent=String(text||"").toUpperCase(); el.title=title; el.setAttribute("aria-label",title); };
  const mk=(tag,cls,text)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };
  const when=iso=>iso?new Date(iso).toLocaleString():"never";
  function card(name,d){ const st=d.status, c=mk("div","bcard"), h=mk("h4"); h.append(mk("i","led "+LV(st.level)),document.createTextNode(`${name}: ${st.label}`)); c.append(h);
    c.append(mk("p","hint",st.mode==="enforce"?"Enforcing: anything not on the list is stopped before it leaves this Mac.":"Observing: nothing is blocked. Anything the rules would block is logged as \"would block\"."));
    const dl=mk("dl"), kv=(k,v)=>dl.append(mk("dt",null,k),mk("dd",null,v));
    kv("Rules",`v${st.policy&&st.policy.version} · ${st.policy&&st.policy.locked?"matches the reviewed copy ✓":"DOES NOT match the reviewed copy"}`);
    kv("Engine",`${st.engine?st.engine.name+" "+st.engine.version:"not loaded"}${st.upToDate===true?" · up to date ✓":st.upToDate===false?" · update available (optional)":""}`);
    kv("Last checked",when(st.lastUpdateCheck)); kv("Since launch",st.counts?`${st.counts.allowed} allowed · ${st.counts.blocked} blocked · ${st.counts.wouldBlock} would block`:"");
    kv("Log",st.log?`${st.log.entries} entries this month · ${st.log.intact?"untouched ✓":"EDITED"}`:""); c.append(dl);
    if(st.problems&&st.problems.length) c.append(mk("p","hint bad",st.problems.join(" · ")));
    const r=mk("details"); r.append(mk("summary",null,`Rules (${(st.policy&&st.policy.rules||[]).length})`)); const ul=mk("ul");
    for(const x of (st.policy&&st.policy.rules)||[]){ const li=mk("li"); li.append(mk("span","tag "+x.effect,x.effect==="forbid"?"never":"allow"),mk("span",null,x.description||x.id)); ul.append(li); } r.append(ul); c.append(r);
    const ev=mk("details"); ev.append(mk("summary",null,`Recent decisions (${d.recent.length})`)); const ul2=mk("ul");
    for(const e of d.recent){ const li=mk("li"), w=mk("div"); w.append(mk("code",null,`${e.method||""} ${e.host||""}${e.path||e.url||""}`),mk("div","hint",`${when(e.t)} · ${e.caller} · ${e.why||(e.rules||[]).join(", ")}`)); li.append(mk("span","tag "+String(e.d||""),String(e.d||"").replace("-"," ")),w); ul2.append(li); }
    if(!d.recent.length) ul2.append(mk("li","hint","Nothing yet. Reads aren't listed; changes and blocks are."));
    ev.append(ul2); c.append(ev); return c; }
  async function details(){ try{ const d=await h.bouncerDetails(); const box=$("bouncerDetail"); box.textContent=""; box.append(card("App's own requests",d.app),card("Hub page",d.hub)); }catch{} }
  function paint(st){ if(!st) return;
    $("liveStatus").textContent=`Location: ${st.live.location}\nWeather: ${st.live.weather}\nSports: ${st.live.sports}`;
    const b=st.bouncer, v=st.hubBouncer;
    $("bouncerState").textContent=`App's own requests: ${b.label}${b.blocked?` (${b.blocked} blocked)`:""}${b.problem?` · ${b.problem}`:""}. Hub page: ${v.mode==="enforce"?v.label:"watching (observe)"}${v.wouldBlock?` · ${v.wouldBlock} unusual request${v.wouldBlock===1?"":"s"} logged`:""}.`;
    const bl=!b.healthy?"red":b.level==="red"?"red":(b.level==="amber"||v.level==="red"||v.wouldBlock)?"amber":"green";
    badge("bdgBouncer",bl,!b.healthy?"PROBLEM":b.blocked?`${b.blocked} BLOCKED`:v.wouldBlock?`${v.wouldBlock} TO REVIEW`:b.label.replace(/[^\w ✓]/g,"").trim(),`Bouncer: ${b.label}. Hub page: watching${v.wouldBlock?`, ${v.wouldBlock} unusual`:""}. Click for details.`);
    if(!panel.hidden) details();
    const f=st.futureproofer; if(!f) badge("bdgFp","","CHECKING","Futureproofer: checking"); if(f){ badge("bdgFp",f.level,f.label,`Futureproofer: ${f.label}. Updates are optional. Click for details.`);
      const ul=$("fpList"); ul.textContent="";
      for(const r of f.results){ const li=document.createElement("li"); li.className=r.level==="bad"?"bad":r.level==="warn"?"warn":r.level==="ok"?"ok":"";
        const i=document.createElement("i"), t=document.createElement("b"), sp=document.createElement("span"); t.textContent=r.title+":"; sp.textContent=r.summary||""; li.append(i,t,sp);
        if(r.action&&r.action.url){ const bt=document.createElement("button"); bt.type="button"; bt.className="btn"; bt.textContent=r.action.label||"Open"; bt.onclick=()=>h.open(r.action.url); li.append(bt); }
        ul.append(li); } }
    const sl=st.slack; if(sl){ $("slackConnect").hidden=sl.connected; $("slackDisconnect").hidden=!sl.connected; $("slackConnect").disabled=!sl.ready; $("slackSetup").hidden=!sl.builder;
      $("slackState").textContent=!sl.ready?"Slack news isn't switched on for RentVision yet. When MedDev switches it on, Connect Slack works here without an update.":sl.connected?`Connected. News: ${sl.news}.`:"Not connected. When connected, MDFM reads the newest posts from #general, #littlevisionaries and #animal-pics at the top of each hour (two minutes at most). Read-only."; }
  }
  h.onStatus(paint); h.getStatus().then(paint);
})();
