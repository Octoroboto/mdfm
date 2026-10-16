/* MDFM 99.9 HD: an in-browser radio station: hip hop, R&B, pop, dance and a DJ set.
   Everything is synthesized live with Web Audio: no audio files, no network, no credits.
   Usage: const radio = createMDFM(); button.onclick = () => radio.start();   (see README) */
import corePack from "./content/default.js";
export const VERSION = "__VERSION__";
export const STYLES = ["MELODIC DRILL","CHILL TRAP","PLUGGNB","SLOW JAM R&B","AFROSWING","LO-FI BOOM BAP","NEO-SOUL","AMAPIANO","CLOUD RAP","JAZZ HOP","CHILL PHONK","WEST COAST","GOTHIC DANCE POP","POP BALLAD","ALT DANCE POP","EMO DANCE POP","AVANT DJ SET"];

export function createMDFM(opts = {}) {
const listeners={}; const emit=(ev,data)=>{ if(ev==="nowplaying") try{ data=gFacts(data); }catch(e){} (listeners[ev]||[]).forEach(f=>{try{f(data);}catch(e){}}); };
let nowPlaying=null, spotsOn=opts.spots!==false, ride=!!opts.letItRide, underwater=!!opts.underwater;
let R=Math.random; const pick=a=>a[Math.floor(R()*a.length)], rr=(a,b)=>a+R()*(b-a), ri=(a,b)=>Math.floor(rr(a,b+1));
const mtof=m=>440*Math.pow(2,(m-69)/12);
let ctx=null,pre,master,analyser,freq,vuA=null,vuBuf=null,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn=null,voiceSrc=null;
let extDuck=null,duckLevel=1,recIn=null,REC=null;   // setDuck: the page ducks the whole station (a skin's actors singing); recIn: the station before the volume and EQ, for recording a break (Save)
let BYP=null, glOn=false;   // 1.25 (E3): the A/B bypass (ORIGINAL) and whether GLITCH is armed
let on=false,gen=0,timer=0,songs=[],lastSpot=-999,spotCount=0,voicePulse=0,speaking=false,bed=null;
const VOL=.62;
const volNum=v=>{ v=+v; return Number.isFinite(v)?Math.max(0,v):null; }; if(opts.volume!=null) opts.volume=volNum(opts.volume)??1;   // NaN into an AudioParam throws
function shaper(k){const c=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1023.5-1;c[i]=Math.tanh(x*k)/Math.tanh(k);}return c;}
function filt(type,f,q){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;return b;}
function osc(type,f){const o=ctx.createOscillator();o.type=type;o.frequency.value=f;return o;}
function G(v){const g=ctx.createGain();g.gain.value=v;return g;}
function env(g,t,a,peak,dec){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(peak,.0002),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec);}
function nz(t,dur){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.start(t,R()*1.4);s.stop(t+dur);return s;}
function pan(p){if(!ctx.createStereoPanner)return G(1);const n=ctx.createStereoPanner();n.pan.value=p;return n;}
function to(node,s,amt){if(amt>0){ const m=s._to||(s._to=new Map()); let g=m.get(amt); if(!g||g.context!==ctx){ g=G(amt); g.connect(s.rv); m.set(amt,g); } node.connect(g); }}   // 1.25: one send per bus and amount (the sum of the sends is the same)
function makeIR(c,sec,decay){const len=Math.floor(c.sampleRate*sec),b=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++){const tt=i/c.sampleRate;d[i]=(R()*2-1)*Math.exp(-tt*decay)*(tt<.01?tt/.01:1)*(1-i/len);}}return b;}
// 1.27: an effect turned all the way down stops getting signal once its tail has rung out, so the browser can skip the
// reverb's work (a send faded to zero only approaches zero, so it was never "silent" and the convolver kept running).
// Turned back up, it's reconnected before the send rises. Live only: a Save renders exactly as before.
const GATES=new WeakMap();
function isOff(c){ return typeof OfflineAudioContext!=="undefined"&&c instanceof OfflineAudioContext; }
// 1.26/1.27 LITE (MIX open on a phone or tablet): every saturator on the live context runs without oversampling; a Save
// (offline render) always gets the full-quality setting. osv() records each one's full setting so LITE off restores it.
let LITE=false; const SH_LIVE=new Set();
const WR=typeof WeakRef==="function"?x=>new WeakRef(x):x=>({deref:()=>x});   // weak, so a caller line's saturator can go when the call ends
function osv(sh,full){ sh._os=full; sh.oversample=LITE&&!isOff(ctx)?"none":full; if(!isOff(ctx)){ if(SH_LIVE.size>150) for(const r of SH_LIVE){ const x=r.deref(); if(!x||x.context!==ctx) SH_LIVE.delete(r); } SH_LIVE.add(WR(sh)); } return sh; }
function gate(a,b,on,tail){ if(!a||!b||isOff(ctx)) return;
  let g=GATES.get(b); if(!g){ g={on:true,t:0}; GATES.set(b,g); } clearTimeout(g.t); g.t=0;
  if(on){ if(!g.on){ try{ a.connect(b); }catch(e){} g.on=true; } return; }
  if(g.on){ const c=ctx; g.t=setTimeout(()=>{ g.t=0; if(ctx===c&&g.on){ try{ a.disconnect(b); }catch(e){} g.on=false; } },tail*1000); } }
// 1.25 (E2): an impulse response with a little silence in front (pre-delay), so the dry note speaks before the room
function preIR(b,sec){ const n=Math.floor(b.sampleRate*sec), o=ctx.createBuffer(b.numberOfChannels,b.length+n,b.sampleRate); for(let c=0;c<b.numberOfChannels;c++) o.getChannelData(c).set(b.getChannelData(c),n); return o; }
// the safety after the limiter: straight up to -2 dBFS, then a tanh knee into a -0.3 dBFS ceiling (the curve spans +-2, so overs fold in too)
const MIX_GAIN=1.22;   // was 1.3: the master now loses about 1.5 dB less to the compressor and the low shelf; levels re-measured per station (within 1 dB of 1.24 on average)
function softClip(){ const N=8193, c=new Float32Array(N), top=Math.pow(10,-.3/20), k0=.8; for(let i=0;i<N;i++){ const a=(i/(N-1)*2-1)*2, x=Math.abs(a); c[i]=Math.sign(a)*(x<=k0?x:k0+(top-k0)*Math.tanh((x-k0)/(top-k0))); }
  const pre=G(.5), sh=ctx.createWaveShaper(); sh.curve=c; osv(sh,"4x"); pre.connect(sh); return {in:pre,out:sh}; }
/* ---------- TUNE: the sound-tuning stage (realism, soundstage, clarity, warmth, room, trunk rattle, radio grain) ----------
   Sits between the station mix (music, voices, WYBC) and the volume. Every control at its default is a straight wire,
   so MDFM sounds exactly as it always has until someone turns something. Ideas from Collin: rich, enveloping, warm;
   a car interior with a hint of trunk rattle on sub-heavy songs; a bit of radio grain. */
const SOUND_DEF={realism:0,width:.5,clarity:0,warmth:0,room:0,roomType:"studio",rattle:0,grain:0,ambience:.5};
const ROOMS={studio:{name:"Studio",sec:.45,decay:9,lp:9000,pre:.004,send:.5},car:{name:"Car",sec:.12,decay:38,lp:3200,pre:.0015,send:.55},
  living:{name:"Living room",sec:.7,decay:6,lp:6000,pre:.008,send:.45},club:{name:"Club",sec:1.5,decay:3,lp:5000,pre:.018,send:.5},hall:{name:"Concert hall",sec:2.6,decay:1.7,lp:4500,pre:.03,send:.42}};
const SOUND_PRESETS=[
  {id:"mdfm",name:"MDFM (as it is)",s:{}},
  {id:"rich",name:"Rich and warm",s:{realism:.7,width:.7,clarity:.35,warmth:.6,room:.25,roomType:"studio",grain:.08}},
  {id:"car",name:"Car stereo",s:{realism:.6,width:.62,clarity:.45,warmth:.35,room:.7,roomType:"car",rattle:.55,grain:.18}},
  {id:"am",name:"Late-night AM",s:{realism:.3,width:0,warmth:.8,grain:.9}},
  {id:"club",name:"Club PA",s:{realism:.5,width:.8,clarity:.3,warmth:.3,room:.55,roomType:"club",rattle:.2}},
  {id:"living",name:"Living room",s:{realism:.6,width:.55,warmth:.3,room:.45,roomType:"living"}},
  {id:"hall",name:"Concert hall",s:{realism:.5,width:.75,clarity:.2,room:.6,roomType:"hall"}},
];
const sound={...SOUND_DEF}; const clamp01=v=>Math.max(0,Math.min(1,+v||0));
function cleanSound(s){ const o={}; if(!s||typeof s!=="object") return o; for(const k in SOUND_DEF){ if(!(k in s)) continue; if(k==="roomType"){ if(ROOMS[s[k]]) o[k]=s[k]; } else if(Number.isFinite(+s[k])) o[k]=clamp01(s[k]); } return o; }
Object.assign(sound,cleanSound(opts.sound));
let ST=null;
function roomIR(c,type){   // its own seeded noise, so tuning never changes what the station writes
  const RM=ROOMS[type]||ROOMS.studio, sr=c.sampleRate, len=Math.max(64,Math.floor(sr*RM.sec)), b=c.createBuffer(2,len,sr), pre=Math.floor(sr*RM.pre);
  let seed=type.length*7919+17; const rnd=()=>{ seed=(seed*1103515245+12345)>>>0; return seed/4294967296; };
  for(let ch=0;ch<2;ch++){ const d=b.getChannelData(ch); let lp=0; const a=Math.exp(-2*Math.PI*RM.lp/sr);
    for(let i=pre;i<len;i++){ const t=(i-pre)/sr; lp=lp*a+(rnd()*2-1)*(1-a); d[i]=lp*Math.exp(-t*RM.decay)*(i-pre<sr*.002?(i-pre)/(sr*.002):1); }
    if(type==="car") for(let k=0;k<7;k++){ const at=pre+Math.floor(sr*(.0008+rnd()*.0052)); if(at<len) d[at]+=(.25+rnd()*.35)*(rnd()<.5?-1:1); } }   // glass and dash: a few strong, very early bounces
  return b; }
function buildStage(){
  const S={}; S.in=G(1); S.out=G(1);
  // shelves and peaks, never high/low-pass filters: at 0 dB they are perfect straight wires
  const peak=(f,q)=>{ const b=filt("peaking",f,q); b.gain.value=0; return b; }, shelf=(t,f)=>{ const b=filt(t,f); b.gain.value=0; return b; };
  S.lowCut=shelf("lowshelf",45); S.cabin=shelf("lowshelf",70); S.mud=peak(320,.9); S.pres=peak(3200,.8); S.air=shelf("highshelf",10000);
  S.warmLo=shelf("lowshelf",160); S.warmHi=shelf("highshelf",8000); S.grainHi=shelf("highshelf",6500); S.grainLo=shelf("lowshelf",150);
  S.in.connect(S.lowCut).connect(S.cabin).connect(S.mud).connect(S.pres).connect(S.air).connect(S.warmLo).connect(S.warmHi).connect(S.grainHi).connect(S.grainLo);
  // warmth: a little parallel saturation (tape/console), level-matched
  S.satDry=G(1); S.satWet=G(0); const sh=ctx.createWaveShaper(); sh.curve=shaper(2.4); osv(sh,"2x"); S.grainLo.connect(S.satDry); S.grainLo.connect(sh); sh.connect(S.satWet);
  S.flut=G(1); S.satDry.connect(S.flut); S.satWet.connect(S.flut);
  S.fl=osc("sine",.6); S.flDepth=G(0); S.fl.connect(S.flDepth).connect(S.flut.gain); S.fl.start();   // radio flutter (multipath wobble)
  // soundstage: mid/side width (1 = untouched, 0 = mono, 2 = wide)
  const sp=ctx.createChannelSplitter(2), mg=ctx.createChannelMerger(2); S.flut.connect(sp);
  S.ll=G(1); S.lr=G(0); S.rl=G(0); S.rr=G(1); sp.connect(S.ll,0); sp.connect(S.rl,0); sp.connect(S.lr,1); sp.connect(S.rr,1);
  S.ll.connect(mg,0,0); S.lr.connect(mg,0,0); S.rr.connect(mg,0,1); S.rl.connect(mg,0,1); mg.connect(S.out);
  // rooms: realism's small room and the chosen listening room, as parallel sends
  S.realSend=G(0); S.realConv=ctx.createConvolver(); S.realConv.buffer=roomIR(ctx,"studio"); mg.connect(S.realSend).connect(S.realConv).connect(S.out);
  S.roomSend=G(0); S.roomConv=ctx.createConvolver(); S.roomType=sound.roomType; S.roomConv.buffer=roomIR(ctx,sound.roomType); mg.connect(S.roomSend).connect(S.roomConv).connect(S.out);
  // trunk rattle: the sub bass, clipped hard into the buzz of loose panels, gated by how hard the sub is pushing
  const lo1=filt("lowpass",95,.7), lo2=filt("lowpass",95,.7), clip=ctx.createWaveShaper(); clip.curve=shaper(28); S.in.connect(lo1).connect(lo2);
  const env=ctx.createWaveShaper(), envC=new Float32Array(1024); for(let i=0;i<1024;i++) envC[i]=Math.abs(i/511.5-1); env.curve=envC;
  const envLp=filt("lowpass",16,.5), gate=ctx.createWaveShaper(); S.gateCurve=t=>{ const c=new Float32Array(1024); for(let i=0;i<1024;i++){ const x=i/511.5-1; c[i]=Math.max(0,(x-t))*4; } return c; };
  gate.curve=S.gateCurve(.14); S.gate=gate; lo2.connect(env).connect(envLp).connect(gate);
  S.vca=G(0); gate.connect(S.vca.gain); lo2.connect(clip);
  S.rattle=G(0); for(const [f,q,g] of [[240,5,.5],[460,6,.7],[1150,7,.45],[2700,9,.25]]){ const bp=filt("bandpass",f,q), bg=G(g); clip.connect(bp).connect(bg).connect(S.vca); }
  S.vca.connect(S.rattle).connect(S.out);
  // radio grain: hiss, the odd crackle
  S.hiss=G(0); const hs=ctx.createBufferSource(); hs.buffer=noiseBuf; hs.loop=true; const hhp=filt("highpass",2500,.7); hs.connect(hhp).connect(S.hiss).connect(S.out); hs.start();
  S.crackle=G(0); S.crackle.connect(S.out);
  ST=S; applySound(true); return S;
}
// AMBIENCE (TUNE): the background sounds under the music. HEARYE's forests, taverns and caves, WYBC's concert-hall room
// tone and hall noises, MDFM's vinyl crackle. The middle (.5) is each station's own level; off at 0, about 2.5x at the top.
const ambMul=()=>{ const v=sound.ambience??.5; return Math.abs(v-.5)<.001?1:v<.5?Math.pow(v*2,1.5):1+(v-.5)*3; };
function ambApply(){ try{ if(fair&&fair.amb) ambFade(fair.amb,fair.amb.v??1,.4); }catch(e){}
  try{ if(amb&&amb.inst&&amb.inst.set){ const m=ambSettings(); for(const k of ["room","grain","hall"]) amb.inst.set(k,m[k]); } }catch(e){} }
function applySound(now){
  try{ if(!(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext)) ambApply(); }catch(e){}   // 1.25: a Save's stage never touches the live ambience
  if(!ST||!ctx) return; const S=ST, t=ctx.currentTime, set=(p,v)=>{ if(now) { p.cancelScheduledValues(0); p.value=v; } else p.setTargetAtTime(v,t,.06); };
  const r=sound.realism, c=sound.clarity, w=sound.warmth, a=sound.room, car=sound.roomType==="car"?a:0, g=sound.grain, k=Math.min(2.2,sound.width*2+r*.25*(sound.width>0?1:0));
  set(S.lowCut.gain,-(r*5+g*14)); set(S.cabin.gain,car*8); set(S.mud.gain,-4*c+car*2.5); set(S.pres.gain,2.5*c+r*.8); set(S.air.gain,3*c+r*1.2-car*3);
  set(S.warmLo.gain,3*w); set(S.warmHi.gain,-4*w); set(S.grainHi.gain,-10*g); set(S.grainLo.gain,-5*g);
  const wet=Math.min(.6,.4*w+.12*r); set(S.satWet.gain,wet*.55); set(S.satDry.gain,1-wet*.3); set(S.flDepth.gain,.035*g);
  set(S.ll.gain,(1+k)/2); set(S.rr.gain,(1+k)/2); set(S.lr.gain,(1-k)/2); set(S.rl.gain,(1-k)/2);
  set(S.realSend.gain,.16*r); const R=ROOMS[sound.roomType]||ROOMS.studio; set(S.roomSend.gain,a*R.send);
  gate(S.realSend,S.realConv,r>0,1.5); gate(S.roomSend,S.roomConv,a>0,4);   // 1.27
  if(S.roomType!==sound.roomType){ S.roomType=sound.roomType; S.roomConv.buffer=roomIR(ctx,sound.roomType); }
  set(S.rattle.gain,.4*sound.rattle); S.gate.curve=S.gateCurve(.16-.1*sound.rattle);
  set(S.hiss.gain,.0075*g); if(!(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext)) crackleOn(g>0);
}
let crackT=0;
function crackleOn(v){ clearTimeout(crackT); if(!v) return; const go=()=>{ if(!on||!ST||sound.grain<=0) { crackT=setTimeout(go,1000); return; }
    const n=1+Math.floor(R()*3), t0=ctx.currentTime+.05; for(let i=0;i<n;i++){ const s=nz(t0+i*rr(.01,.08),.004), hp=filt("highpass",1200,.7), g=G(rr(.04,.14)*sound.grain); s.connect(hp).connect(g).connect(ST.crackle); }
    ST.crackle.gain.value=1; crackT=setTimeout(go,rr(250,2200)/Math.max(.2,sound.grain)); };
  crackT=setTimeout(go,300); }
/* ---------- EFFECTS (TUNE, 1.22): DJ effects on everything the station plays, after the sound tuning ----------
   Echo (dotted eighths, in time), chorus, reverb, flange, phaser, warble (tape wow and flutter), bitcrush, drive, a DJ filter
   (left: low-pass, right: high-pass), a stutter gate and a sidechain pump (both on the beat), plus TAPE STOP and SPIN BACK.
   Like the style matrix's stage, the effects are only in the path while something is turned up (or a tape trick is
   running): at zero they fade out and are taken out again, so the station is bit for bit as it was. Save includes them. */
const FX_DEF={echo:0,chorus:0,reverb:0,flange:0,phaser:0,warble:0,crush:0,drive:0,filter:.5,gate:0,pump:0,glitch:0};   // 1.25 (E3): glitch (was the matrix's CHAOS)
const FX_KEYS=[["echo","ECHO","Echoes in time with the beat (dotted eighths)"],["reverb","REVERB","A big hall around the music"],
  ["chorus","CHORUS","Two slightly detuned copies: wide and shimmering"],["flange","FLANGE","The jet-plane sweep"],["phaser","PHASER","A slow, swirling sweep"],
  ["warble","WARBLE","Old tape: the pitch wobbles"],["crush","BITCRUSH","Fewer bits: crunchy and lo-fi"],["drive","DRIVE","Overdrive: warm to dirty"],
  ["filter","FILTER","The DJ filter: left cuts the highs (low-pass), right cuts the lows (high-pass); the middle is off"],
  ["gate","GATE","Stutter: chops the sound on the beat (eighths, sixteenths at the top)"],["pump","PUMP","Sidechain pump: everything ducks on each beat"],
  ["glitch","GLITCH","Once a bar, maybe, a trick on the beat: a stutter, a gate chop, a tape stop or an octave jump. It always comes back on the next downbeat. Higher: more often"]];
const fxv={...FX_DEF};
function cleanFx(v){ const o={}; if(!v||typeof v!=="object") return o; for(const k in FX_DEF) if(k in v&&Number.isFinite(+v[k])) o[k]=clamp01(v[k]); return o; }
Object.assign(fxv,cleanFx(opts.fx));
const FXW=new WeakMap(); let fxOffT=0, fxTape=0;
const fxIsOn=()=>Object.keys(FX_DEF).some(k=>Math.abs(fxv[k]-FX_DEF[k])>.004);
function fxCurve(n,f){ const c=new Float32Array(n); for(let i=0;i<n;i++) c[i]=f(i/(n-1)*2-1); return c; }
function fxBuild(){   // one effects stage per AudioContext
  let F=FXW.get(ctx); if(F) return F; F={in:G(1),out:G(1),lfos:[],beat:.5,t0:0,inPath:false};
  const ins=(name,wet,dry=1)=>{ const x={in:G(1),out:G(1),dry:G(dry),wet:G(wet)}; x.in.connect(x.dry).connect(x.out); x.wet.connect(x.out); F[name]=x; return x; };
  const lfo=(type,f,depth,dest)=>{ const o=osc(type,f), g=G(depth); o.connect(g).connect(dest); o.start(); F.lfos.push(o); return {o,g}; };
  // the DJ filter: a low-pass and a high-pass, crossfaded in only as far as it's turned
  const fl=ins("filter",0); F.lp=filt("lowpass",20000,1); F.hp=filt("highpass",10,1); fl.in.connect(F.lp).connect(F.hp).connect(fl.wet);
  // drive: tanh into a gentle low-pass, level-matched
  const dv=ins("drive",0); F.dpre=G(1); const dsh=ctx.createWaveShaper(); dsh.curve=shaper(1.2); osv(dsh,"2x"); F.dpost=G(1); dv.in.connect(F.dpre).connect(dsh).connect(filt("lowpass",7000,.6)).connect(F.dpost).connect(dv.wet);
  // bitcrush: a staircase (the number of bits follows the slider)
  const cr=ins("crush",0); F.crsh=ctx.createWaveShaper(); F.bits=0; cr.in.connect(F.crsh).connect(cr.wet);
  // phaser: six all-pass stages swept slowly
  const ph=ins("phaser",0); let n=ph.in; F.phDep=[]; for(const f of [300,520,900,1500,2600,4200]){ const a=filt("allpass",f,.7); n.connect(a); n=a; F.phDep.push([lfo("sine",.27,0,a.frequency).g,f]); } n.connect(ph.wet);
  // flange: a very short swept delay with feedback
  const fg=ins("flange",0); const fd=ctx.createDelay(.03); fd.delayTime.value=.0035; F.flfb=G(0); fg.in.connect(fd); fd.connect(F.flfb).connect(fd); fd.connect(fg.wet); F.flDep=lfo("sine",.18,0,fd.delayTime).g;
  // chorus: two delays a few milliseconds apart, wobbling, panned apart
  const ch=ins("chorus",0); F.chDep=[]; [[.016,.8,-.7],[.023,1.13,.7]].forEach(([d,r,p])=>{ const dl=ctx.createDelay(.06); dl.delayTime.value=d; ch.in.connect(dl); dl.connect(pan(p)).connect(ch.wet); F.chDep.push(lfo("sine",r,0,dl.delayTime).g); });
  // warble: wow (slow) and flutter (fast) on a short delay; the dry signal goes out while it's on
  const wb=ins("warble",0); const wd=ctx.createDelay(.05); wd.delayTime.value=.012; wb.in.connect(wd).connect(wb.wet); F.wbDep=[lfo("sine",.63,0,wd.delayTime).g,lfo("sine",.21,0,wd.delayTime).g,lfo("triangle",6.3,0,wd.delayTime).g];
  // stutter gate and pump: gains driven by beat-locked oscillators (see fxBeat)
  F.gate=G(1); F.gDep=G(0); F.gDep.connect(F.gate.gain); F.pump=G(1); F.pDep=G(0); F.pDep.connect(F.pump.gain);
  F.gShape=ctx.createWaveShaper(); F.gShape.curve=fxCurve(256,x=>x>0?0:1); F.gShape.connect(F.gDep);   // square: open half, shut half
  F.pShape=ctx.createWaveShaper(); F.pShape.curve=fxCurve(512,x=>{ const p=(x+1)/2; return Math.exp(-p*4.5); }); F.pShape.connect(F.pDep);   // saw: a duck that recovers over the beat
  // echo: dotted eighths with feedback, filtered so repeats sit back; reverb: a big hall
  const ec=ins("echo",0); F.edl=ctx.createDelay(3); F.edl.delayTime.value=.375; F.efb=G(.3); const ehp=filt("highpass",350,.7), elp=filt("lowpass",3600,.7);
  ec.in.connect(ehp).connect(F.edl).connect(elp); elp.connect(F.efb).connect(F.edl); elp.connect(ec.wet);
  const rv=ins("reverb",0); const cv=ctx.createConvolver(); cv.buffer=makeIR(ctx,3.4,1.5); F.rvHp=filt("highpass",180,.7); F.rvCv=cv; rv.in.connect(F.rvHp); F.rvHp.connect(cv); cv.connect(filt("lowpass",6500,.7)).connect(rv.wet);
  // the tape (TAPE STOP, SPIN BACK): a delay line whose delay grows faster or slower than time passes
  F.tDry=G(1); F.tWet=G(0); F.tdl=ctx.createDelay(6); F.tdl.delayTime.value=0;
  // the chain
  // GLITCH (1.25, E3): a tape delay in series (for its tape stop), the dry gain (for its chops) and a repeat loop (for its stutters)
  F.glIn=G(1); F.glTape=ctx.createDelay(1); F.glTape.delayTime.value=0; F.glDry=G(1); F.glRepIn=G(0); F.glRep=ctx.createDelay(2); F.glFb=G(0); F.glRepOut=G(0); F.glOut=G(1);
  F.glIn.connect(F.glTape).connect(F.glDry).connect(F.glOut); F.glIn.connect(F.glRepIn).connect(F.glRep); F.glRep.connect(F.glFb).connect(F.glRep); F.glRep.connect(F.glRepOut).connect(F.glOut);
  F.glS=0x1F123BB5^(Math.floor(ctx.currentTime*1000)|0); F.glR=()=>{ let x=F.glS; x^=x<<13; x^=x>>>17; x^=x<<5; F.glS=x; return (x>>>0)/4294967296; };   // its own random stream (never the song's)
  F.in.connect(fl.in); fl.out.connect(dv.in); dv.out.connect(cr.in); cr.out.connect(ph.in); ph.out.connect(fg.in); fg.out.connect(ch.in); ch.out.connect(wb.in);
  wb.out.connect(F.gate); F.gate.connect(F.pump); F.pump.connect(ec.in); ec.out.connect(rv.in); rv.out.connect(F.glIn); F.glOut.connect(F.tDry).connect(F.out); F.glOut.connect(F.tdl).connect(F.tWet).connect(F.out);
  FXW.set(ctx,F); fxLevels(F,true); fxBeat(ctx.currentTime,.5,true); return F; }
function fxLevels(F,now){ const t=ctx.currentTime, T=(p,v)=>now?p.setValueAtTime(v,t):p.setTargetAtTime(v,t,.05), a=fxv;
  const f=a.filter-.5, fw=Math.min(1,Math.abs(f)*6); T(F.filter.wet.gain,fw); T(F.filter.dry.gain,1-fw);
  T(F.lp.frequency,f<0?20000*Math.pow(180/20000,Math.min(1,-f*2)):20000); T(F.hp.frequency,f>0?10*Math.pow(300,Math.min(1,f*2)):10); T(F.lp.Q,1+Math.max(0,-f)*7); T(F.hp.Q,1+Math.max(0,f)*7);
  T(F.drive.wet.gain,a.drive); T(F.drive.dry.gain,1-a.drive); T(F.dpre.gain,1+a.drive*14); T(F.dpost.gain,1/(1+a.drive*3.2));
  const bits=a.crush>0?Math.round(12-a.crush*9):0; if(bits&&bits!==F.bits){ F.bits=bits; const q=Math.pow(2,bits-1); F.crsh.curve=fxCurve(4096,x=>Math.round(x*q)/q); }
  const cw=Math.min(1,a.crush*3); T(F.crush.wet.gain,cw); T(F.crush.dry.gain,1-cw);
  T(F.phaser.wet.gain,a.phaser*.9); for(const [g,fq] of F.phDep) T(g.gain,fq*.75*a.phaser);
  T(F.flange.wet.gain,a.flange*.85); T(F.flfb.gain,.62*a.flange); T(F.flDep.gain,.0028*a.flange);
  T(F.chorus.wet.gain,a.chorus*.75); T(F.chorus.dry.gain,1-a.chorus*.2); for(const g of F.chDep) T(g.gain,.0035*a.chorus);
  const ww=a.warble>0?1:0; T(F.warble.wet.gain,ww); T(F.warble.dry.gain,1-ww); [.0035,.0018,.00035].forEach((d,i)=>T(F.wbDep[i].gain,d*a.warble));
  T(F.gDep.gain,-Math.min(1,a.gate*1.2)); T(F.pDep.gain,-.85*a.pump);
  T(F.echo.wet.gain,a.echo*.8); T(F.efb.gain,.22+.5*a.echo);
  T(F.reverb.wet.gain,a.reverb*.85); T(F.reverb.dry.gain,1-a.reverb*.3); gate(F.rvHp,F.rvCv,a.reverb>0,4.5); }   // 1.27: the hall rests while REVERB is at zero
// the beat: gate and pump oscillators start on a beat and run at its rate; the echo is a dotted eighth. Re-locked when the tempo or the downbeat moves.
function fxBeat(t0,beat,force){ const F=ctx&&FXW.get(ctx); if(!F||!(beat>.12&&beat<3)) return;
  const now=ctx.currentTime, gr=fxv.gate>.6?4:2;   // gate: eighths, sixteenths near the top
  const drift=F.oG?((((t0-F.t0)/F.beat)%1)+1)%1:1, off=Math.min(drift,1-drift);
  if(!force&&F.oG&&Math.abs(beat-F.beat)<.0015&&off<.02&&F.gr===gr) return;
  let ts=t0; while(ts<now+.03) ts+=beat; F.beat=beat; F.t0=ts; F.gr=gr;
  for(const k of ["oG","oP"]) if(F[k]){ try{ F[k].stop(ts); }catch(e){} }
  const oG=osc("square",gr/beat); oG.connect(F.gShape); oG.start(ts); F.oG=oG;   // a square starts high: open on the beat
  const oP=osc("sawtooth",1/beat); oP.connect(F.pShape); oP.start(ts-beat/2>=now?ts-beat/2:ts+beat/2); F.oP=oP;   // a saw starts at the middle of its ramp: start half a beat early so the duck lands on the beat
  F.edl.delayTime.setTargetAtTime(Math.min(2.5,beat*.75),now,.05); }
function fxInPath(F,v){ if(!ST) return; if(v&&!F.inPath){ try{ ST.out.disconnect(master); }catch(e){} ST.out.connect(F.in); F.out.connect(master); F.inPath=true; }
  else if(!v&&F.inPath){ try{ ST.out.disconnect(F.in); }catch(e){} try{ F.out.disconnect(master); }catch(e){} ST.out.connect(master); F.inPath=false; FXW.delete(ctx); for(const o of [...F.lfos,F.oG,F.oP]) try{ o&&o.stop(); }catch(e){}
    try{ F.efb.disconnect(); F.flfb.disconnect(); F.glFb.disconnect(); F.out.disconnect(); }catch(e){} } }   // 1.25: break the echo and flange feedback loops so the old stage can be collected
function fxApply(now){ glOn=fxv.glitch>.004&&!BYP; if(!ctx||!ST) return; clearTimeout(fxOffT); fxOffT=0;
  if((fxIsOn()&&!BYP)||fxTape){ const F=fxBuild(); fxInPath(F,true); fxLevels(F,now); const b=curBeat(); if(b) fxBeat(b.t0,b.beat); return; }
  const F=FXW.get(ctx); if(!F) return; fxLevels(F,now); if(now||BYP){ fxInPath(F,false); return; } const c=ctx; fxOffT=setTimeout(()=>{ fxOffT=0; if(ctx===c&&!fxIsOn()&&!fxTape){ const G2=FXW.get(c); if(G2) fxInPath(G2,false); } },2500); }
// TAPE STOP: the music slows to a stop over about two beats. SPIN BACK: it spins backwards like a record pulled back.
// Either way it comes back in on the next downbeat after a beat of quiet.
function fxTapeTrick(kind){ if(!on||!ctx||!ST||fxTape) return false; const b=curBeat()||{beat:.5,t0:ctx.currentTime}, F=fxBuild(); fxInPath(F,true); fxLevels(F,true);
  const t=ctx.currentTime+.03, N=96, dl=F.tdl.delayTime, T=kind==="spin"?Math.max(.5,Math.min(1.2,b.beat*1.5)):Math.max(.8,Math.min(2.2,b.beat*2)), c=new Float32Array(N);
  for(let i=0;i<N;i++){ const x=i/(N-1)*T; c[i]=kind==="spin"?(x<.15?10*x*x:.225+3*(x-.15)):x*x/(2*T); }
  F.tDry.gain.setValueAtTime(0,t); F.tWet.gain.setValueAtTime(1,t); dl.setValueAtTime(0,t); dl.setValueCurveAtTime(c,t,T);
  F.tWet.gain.setValueAtTime(1,t+T*.55); F.tWet.gain.linearRampToValueAtTime(0,t+T);
  let back=t+T+b.beat*.5; if(b.t0){ let k=b.t0; while(k<back) k+=b.beat; back=k; }
  fxTape=1; dl.setValueAtTime(0,back-.01); F.tWet.gain.setValueAtTime(0,back-.01); F.tDry.gain.setValueAtTime(0,back-.005); F.tDry.gain.linearRampToValueAtTime(1,back+.01);
  emit("tape",{kind,until:back}); const c0=ctx; setTimeout(()=>{ if(ctx!==c0) return; fxTape=0; fxApply(); },(back-ctx.currentTime)*1000+80); return true; }
/* GLITCH (1.25, E3; was the style matrix's CHAOS): at each bar line, with probability .6 x the setting, one trick on the beat:
   a 1/8 or 1/16 stutter, a gate chop, a tape stop into the downbeat, or a one-bar octave jump of the pitched parts. Always
   back on the next downbeat. Never swaps instruments, changes key or wobbles the tempo. Its own random stream. Live and Save. */
function glitchBar(t,bs,beat){ const F=ctx&&FXW.get(ctx), v=fxv.glitch; if(!F||!glOn||!(v>.004)||!(bs>.3&&bs<12)) return;
  if(F.glLast!=null&&Math.abs(t-F.glLast)<bs*.5) return; F.glLast=t;   // once a bar (two songs crossfading share it)
  F.glo=null; if(F.glR()>=.6*v) return;
  beat=beat>0?beat:bs/4; const end=t+bs, e=F.glR(), T=end-beat*(F.glR()<.5?1:2), now=ctx.currentTime;
  if(T<now+.01) return;
  const d=F.glDry.gain, tp=F.glTape.delayTime;
  if(e<.3){ const L=beat*(F.glR()<.5?.5:.25); F.glRep.delayTime.setValueAtTime(L,T); F.glRepIn.gain.setValueAtTime(1,T); F.glRepIn.gain.setValueAtTime(0,T+L);   // stutter: catch a 1/8 or 1/16, loop it to the bar line
    F.glFb.gain.setValueAtTime(1,T+L); F.glRepOut.gain.setValueAtTime(1,T+L); d.setValueAtTime(1,T+L); d.linearRampToValueAtTime(0,T+L+.008);
    F.glFb.gain.setValueAtTime(0,end); F.glRepOut.gain.setValueAtTime(1,end); F.glRepOut.gain.linearRampToValueAtTime(0,end+.008); d.setValueAtTime(0,end); d.linearRampToValueAtTime(1,end+.008); }
  else if(e<.55){ const n=Math.round((end-T)/(beat/4)); for(let k=1;k<n;k++){ const a=T+k*beat/4, tg=k%2?0:1; d.setValueAtTime(1-tg,a); d.linearRampToValueAtTime(tg,a+.004); } d.setValueAtTime(n%2?1:0,end); d.linearRampToValueAtTime(1,end+.004); }   // gate chop: sixteenths, open-shut
  else if(e<.8){ const D0=Math.min(.9,beat), a=end-D0; if(a<now+.01) return; tp.setValueAtTime(0,a); for(let k=1;k<=8;k++){ const x=k/8*D0; tp.linearRampToValueAtTime(x*x/(2*D0)*.98,a+x); }   // tape stop into the downbeat
    d.setValueAtTime(1,a+D0*.6); d.linearRampToValueAtTime(0,end-.004); tp.setValueAtTime(0,end); d.setValueAtTime(0,end); d.linearRampToValueAtTime(1,end+.01); }
  else F.glo={from:t-.002,until:end-.002};   // the octave jump: the pitched parts of this bar, up an octave (in the instrument wrapper)
  emit("glitch",{t,until:end,kind:e<.3?"stutter":e<.55?"gate":e<.8?"tape":"octave"}); }
// where the beat is on the station on air (for the effects and PTRN's tags)
function curBeat(){ const b=STN[station]&&STN[station].beat(); if(b) return b;
  const np=nowPlaying, bpm=np&&np.bpm?+np.bpm:120; return {t0:fxFree||(fxFree=ctx?ctx.currentTime:0),beat:60/Math.max(40,Math.min(220,bpm))}; }
let fxFree=0;
function init(c){
  ctx=c||new (window.AudioContext||window.webkitAudioContext)({latencyHint:"playback"});
  if(!(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext)){   // 1.25: a context the OS suspended or interrupted (a call, sleep) comes back by itself while SOUND is on
    const c0=ctx, kick=()=>{ if(on&&ctx===c0&&c0.state!=="running"&&c0.state!=="closed"){ try{ const p=c0.resume(); p&&p.catch&&p.catch(()=>{}); }catch(e){} } };
    try{ c0.addEventListener?.("statechange",()=>setTimeout(kick,300)); }catch(e){}
    try{ if(typeof document!=="undefined"&&document.addEventListener) document.addEventListener("visibilitychange",kick); if(typeof window!=="undefined"&&window.addEventListener) window.addEventListener("focus",kick); }catch(e){} }
  coreWarm(ctx.sampleRate);   // the cymbal cores for this rate (1.25)
  pre=G(1);
  /* 1.25 (E2), the master: a 30 Hz high-pass (the compressor no longer rides sub nobody hears), a lighter low shelf, a de-harsh
     dip at 3.2 kHz, a gentle top shelf at 9 kHz with the low-pass up at 15 kHz (some air), and bus glue instead of squash */
  const hp=filt("highpass",30,.7), ls=filt("lowshelf",90); ls.gain.value=1;
  const hs=filt("highshelf",9000); hs.gain.value=-2.5;
  const dh=filt("peaking",3200,1); dh.gain.value=-2.5;
  const lp=filt("lowpass",15000,.5);
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-18; comp.knee.value=6; comp.ratio.value=2.5; comp.attack.value=.015; comp.release.value=.18;
  master=G(0);
  analyser=ctx.createAnalyser(); analyser.fftSize=2048; analyser.smoothingTimeConstant=.5; analyser.minDecibels=-86; analyser.maxDecibels=-30;
  /* underwater: a wobbling delay (pitch drift) into a resonant low-pass whose cutoff drifts. Neutral when off. */
  UW={dl:ctx.createDelay(.05),lp:filt("lowpass",20000,.7),wob:osc("sine",.55),wobG:G(0),drift:osc("sine",.13),driftG:G(0)};
  UW.dl.delayTime.value=.012; UW.wob.connect(UW.wobG).connect(UW.dl.delayTime); UW.drift.connect(UW.driftG).connect(UW.lp.frequency);
  UW.wob.start(); UW.drift.start(); applyUnderwater(underwater,true);
  /* Listener EQ (LOW / MID / HIGH knobs): a real 3-band EQ on the final output, after the compressor so cuts and boosts
     aren't evened back out, then a brick-wall limiter so boosts can't clip. Everything passes through it: music, ad beds,
     effects and, when the app renders the robot voices as audio (opts.tts), the voices too. Volume is the master gain. */
  TONE={low:filt("lowshelf",eq.ls.freq),mid:filt("peaking",eq.p1.freq,eq.p1.q),high:filt("highshelf",eq.hs.freq),lim:ctx.createDynamicsCompressor()};   // 1.25 (E3): the EQ's LOW, MID 1 and HIGH (defaults: the old tone knobs exactly)
  TONE.lim.threshold.value=-2.5; TONE.lim.knee.value=0; TONE.lim.ratio.value=20; TONE.lim.attack.value=.001; TONE.lim.release.value=.12; applyTone(true);
  TONE.clip=softClip();   // 1.25 (E2): after the limiter, a soft clip that never passes -0.3 dBFS (the limiter alone let overs through)
  voiceIn=G(1);   // rendered robot voices join here: dry (no underwater, no music colouring), under the volume and the EQ
  const mix=G(MIX_GAIN); mixOut=mix; mxIn=G(1); mxDst=comp; pre.connect(UW.dl).connect(UW.lp).connect(hp).connect(ls).connect(hs).connect(dh).connect(lp).connect(mxIn).connect(comp).connect(mix);   // 1.25 (E3): mxIn, a unity gain where the style matrix's sound goes in (before the compressor)
   recIn=G(1); mix.connect(recIn); voiceIn.connect(recIn);   // recIn: what Save records during a break (before volume and EQ)
  extDuck=G(duckLevel); master.connect(extDuck).connect(TONE.low).connect(TONE.mid).connect(TONE.high).connect(TONE.lim).connect(TONE.clip.in); TONE.clip.out.connect(analyser).connect(ctx.destination); TONE.wired=true; eqRoute();
  freq=new Uint8Array(analyser.frequencyBinCount);
  { const sp=ctx.createChannelSplitter(2); TONE.clip.out.connect(sp); vuA=[0,1].map(i=>{ const a=ctx.createAnalyser(); a.fftSize=1024; sp.connect(a,i); return a; }); vuBuf=new Float32Array(1024); }
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=R()*2-1;}
  SAT=shaper(1.8); SAT808=shaper(3); GTR=shaper(7);
  musicDuck=G(1); musicDuck.connect(pre);
  const ir=preIR(makeIR(ctx,2.2,2.4),.02);   // 1.25 (E2): 20 ms pre-delay, and the returns high-passed at 280 Hz (no low-mid mud from pad and choir sends)
  songRev=ctx.createConvolver(); songRev.buffer=ir; songRev.connect(filt("highpass",280)).connect(filt("lowpass",4200)).connect(G(.45)).connect(musicDuck);
  fxRev=ctx.createConvolver(); fxRev.buffer=ir; fxRev.connect(filt("highpass",280)).connect(filt("lowpass",4200)).connect(G(.5)).connect(pre);
  fxDelay=G(1); const dl=ctx.createDelay(1); dl.delayTime.value=.24; const fb=G(.38), dlp=filt("lowpass",2600);
  fxDelay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(G(.5)).connect(pre);
  buildStage(); mix.connect(ST.in); ST.out.connect(master); voiceIn.connect(ST.in);   // TUNE stage (after noiseBuf exists)
}
/* EQ (1.25, E3): a parametric EQ on the final output (after the volume, before the limiter), for every station and Save.
   LOW CUT (high-pass 20-300 Hz, 12 or 24 dB/oct), LOW (low shelf), MID 1 and MID 2 (peaking: freq, gain, Q), HIGH (high
   shelf), HIGH CUT (low-pass 3-20 kHz). LOW / MID 1 / HIGH are the old tone knobs (LOW / MID / HIGH, same filters, same
   frequencies), so setTone() keeps working. MID 2 and the cuts are only in the path while used: flat is bit for bit as before. */
const EQ_BANDS=[{id:"lc",label:"LOW CUT",type:"highpass",freq:[20,300],slopes:[12,24],def:{on:false,freq:80,slope:12}},
  {id:"ls",label:"LOW",type:"lowshelf",freq:[30,600],gain:[-12,12],def:{freq:250,gain:0},tone:"low"},
  {id:"p1",label:"MID 1",type:"peaking",freq:[40,4000],gain:[-12,12],q:[.3,8],def:{freq:1000,gain:0,q:.7},tone:"mid"},
  {id:"p2",label:"MID 2",type:"peaking",freq:[300,16000],gain:[-12,12],q:[.3,8],def:{freq:3000,gain:0,q:1}},
  {id:"hs",label:"HIGH",type:"highshelf",freq:[1500,16000],gain:[-12,12],def:{freq:4000,gain:0},tone:"high"},
  {id:"hc",label:"HIGH CUT",type:"lowpass",freq:[3000,20000],slopes:[12,24],def:{on:false,freq:12000,slope:12}}];
const EQB=Object.fromEntries(EQ_BANDS.map(b=>[b.id,b])), TONE_BAND={low:"ls",mid:"p1",high:"hs"};
const eqDef=()=>({on:true,...Object.fromEntries(EQ_BANDS.map(b=>[b.id,{...b.def}]))});
const eq=eqDef();
function cleanEq(v){ if(!v||typeof v!=="object") return; const c=(x,[a,b])=>Math.max(a,Math.min(b,x));
  if("on" in v) eq.on=v.on!==false;
  for(const B of EQ_BANDS){ const x=v[B.id]; if(!x||typeof x!=="object") continue; const o=eq[B.id];
    if("freq" in x&&Number.isFinite(+x.freq)) o.freq=c(+x.freq,B.freq); if(B.gain&&"gain" in x&&Number.isFinite(+x.gain)) o.gain=c(+x.gain,B.gain);
    if(B.q&&"q" in x&&Number.isFinite(+x.q)) o.q=c(+x.q,B.q); if(B.slopes&&"slope" in x) o.slope=+x.slope>=18?24:12; if(B.slopes&&"on" in x) o.on=!!x.on; } }
for(const k in TONE_BAND) if(opts.tone&&k in opts.tone&&Number.isFinite(+opts.tone[k])) eq[TONE_BAND[k]].gain=Math.max(-12,Math.min(12,+opts.tone[k]));   // tone: low / mid / high in dB (-12..+12), the receiver's EQ knobs
cleanEq(opts.eq);
const getTone=()=>({low:eq.ls.gain,mid:eq.p1.gain,high:eq.hs.gain});
const eqLive=()=>eq.on&&!BYP;
function applyTone(now){ if(!ctx||!TONE) return; const t=ctx.currentTime, E=eqLive(); for(const k of ["low","mid","high"]){ const g=TONE[k].gain, v=E?Math.max(-12,Math.min(12,+eq[TONE_BAND[k]].gain||0)):0; g.cancelScheduledValues(t); if(now) g.setValueAtTime(v,t); else g.setTargetAtTime(v,t,.05); }
  eqParams(now); eqRoute(); }
// the filters each band uses: [type, freq, gain, Q (Web Audio's units: dB for the cuts)]
const BW={12:[-3.0103],24:[-5.3329,2.3229]};   // Butterworth, as Q in dB
function eqSpecs(id){ const B=EQB[id], o=eq[id]; if(B.slopes) return o.on?BW[o.slope===24?24:12].map(q=>[B.type,o.freq,0,q]):[]; return [[B.type,o.freq,o.gain||0,o.q??1]]; }
function eqParams(now){ if(!ctx||!TONE) return; const t=ctx.currentTime, set=(p,v)=>{ if(Math.abs(p.value-v)<1e-6&&!now) return; if(now){ p.cancelScheduledValues(t); p.setValueAtTime(v,t); } else p.setTargetAtTime(v,t,.05); };
  for(const [k,id] of Object.entries(TONE_BAND)){ const o=eq[id], f=TONE[k]; if(Math.abs(f.frequency.value-o.freq)>1e-6||(o.q!=null&&Math.abs(f.Q.value-o.q)>1e-6)){ set(f.frequency,o.freq); if(o.q!=null) set(f.Q,o.q); } }
  for(const id of ["p2","lc","hc"]){ const N=TONE[id]; if(!N) continue; const sp=eqSpecs(id); N.forEach((n,j)=>{ const x=sp[j]; if(!x) return; set(n.frequency,x[1]); set(n.Q,x[3]); if(id==="p2") set(n.gain,eqLive()?x[2]:0); }); } }
// MID 2 and the cuts go in the path only while they do something (like the effects stage), so flat stays a straight wire
function eqRoute(){ if(!ctx||!TONE||!TONE.wired) return; const E=eqLive(), want=[], mk=(id,n)=>{ let N=TONE[id]; if(!N||N.length!==n){ N=TONE[id]=Array.from({length:n},()=>ctx.createBiquadFilter()); N.forEach(b=>b.type=EQB[id].type); eqParams(true); } return N; };
  if(E&&Math.abs(eq.p2.gain)>.01) want.push(...mk("p2",1).map(n=>[n,"p2"]));
  for(const id of ["lc","hc"]) if(E&&eq[id].on) want.push(...mk(id,eq[id].slope===24?2:1).map(n=>[n,id]));
  if(want.length) eqParams(true);
  const key=want.map(x=>x[1]+TONE[x[1]].length).join(); if(key===(TONE.rk||"")) return; TONE.rk=key;
  try{ TONE.high.disconnect(); }catch(e){} for(const n of TONE.rn||[]) try{ n.disconnect(); }catch(e){}
  let n=TONE.high; for(const [x] of want){ n.connect(x); n=x; } n.connect(TONE.lim); TONE.rn=want.map(x=>x[0]); }
// the curve the EQ makes, in dB at each frequency (for the UI's graph): Web Audio's own getFrequencyResponse when there's a
// context to ask, else the same Audio EQ Cookbook maths the spec uses
let eqCtxC=null;
function bqDb(type,f0,gain,Q,f,sr){ const w0=2*Math.PI*Math.min(f0,sr/2*.999)/sr, A=Math.pow(10,gain/40), cw=Math.cos(w0), sw=Math.sin(w0); let b0,b1,b2,a0,a1,a2;
  if(type==="lowpass"||type==="highpass"){ const al=sw/(2*Math.pow(10,Q/20)); a0=1+al; a1=-2*cw; a2=1-al; if(type==="lowpass"){ b0=(1-cw)/2; b1=1-cw; b2=b0; } else { b0=(1+cw)/2; b1=-(1+cw); b2=b0; } }
  else if(type==="peaking"){ const al=sw/(2*Q); b0=1+al*A; b1=-2*cw; b2=1-al*A; a0=1+al/A; a1=-2*cw; a2=1-al/A; }
  else { const al=sw/2*Math.SQRT2, sa=2*Math.sqrt(A)*al;
    if(type==="lowshelf"){ b0=A*((A+1)-(A-1)*cw+sa); b1=2*A*((A-1)-(A+1)*cw); b2=A*((A+1)-(A-1)*cw-sa); a0=(A+1)+(A-1)*cw+sa; a1=-2*((A-1)+(A+1)*cw); a2=(A+1)+(A-1)*cw-sa; }
    else { b0=A*((A+1)+(A-1)*cw+sa); b1=-2*A*((A-1)+(A+1)*cw); b2=A*((A+1)+(A-1)*cw-sa); a0=(A+1)-(A-1)*cw+sa; a1=2*((A-1)-(A+1)*cw); a2=(A+1)-(A-1)*cw-sa; } }
  const w=2*Math.PI*f/sr, c1=Math.cos(w), s1=Math.sin(w), c2=Math.cos(2*w), s2=Math.sin(2*w);
  const nr=b0+b1*c1+b2*c2, ni=-(b1*s1+b2*s2), dr=a0+a1*c1+a2*c2, di=-(a1*s1+a2*s2);
  return 10*Math.log10((nr*nr+ni*ni)/(dr*dr+di*di)); }
function eqResponse(freqs,band){ const f=Float32Array.from(freqs||[],x=>+x||0), out=new Float32Array(f.length); if(!f.length) return out;
  if(!band&&!eq.on) return out;
  const specs=(band?[band]:EQ_BANDS.map(b=>b.id)).filter(id=>EQB[id]).flatMap(id=>eqSpecs(id)).filter(x=>x[0]!=="peaking"&&x[0]!=="lowshelf"&&x[0]!=="highshelf"||Math.abs(x[2])>1e-4);
  if(!specs.length) return out;
  let c=ctx; if(!c){ try{ if(!eqCtxC&&typeof OfflineAudioContext!=="undefined") eqCtxC=new OfflineAudioContext(1,128,48000); }catch(e){} c=eqCtxC; }
  const sr=c&&c.sampleRate||48000, fc=f.map(x=>Math.max(1,Math.min(sr/2*.999,x)));
  for(const [type,f0,gain,Q] of specs){ let done=false;
    try{ const b=c&&c.createBiquadFilter(); if(b&&typeof b.getFrequencyResponse==="function"){ b.type=type; b.frequency.value=f0; b.Q.value=Q; b.gain.value=gain; const mag=new Float32Array(f.length), ph=new Float32Array(f.length);
        b.getFrequencyResponse(fc,mag,ph); for(let i=0;i<f.length;i++) out[i]+=20*Math.log10(Math.max(1e-9,mag[i])); done=true; } }catch(e){}
    if(!done) for(let i=0;i<f.length;i++) out[i]+=bqDb(type,f0,gain,Q,fc[i],sr); }
  return out; }
function setEq(v){ cleanEq(v); applyTone(); const e=getEq(); emit("eq",e); emit("tone",getTone()); return e; }
const getEq=()=>JSON.parse(JSON.stringify(eq));
function applyUnderwater(v,now){
  underwater=!!v; if(!ctx||!UW) return;
  const t=ctx.currentTime,k=now?.001:.35,set=(p,val)=>{ p.cancelScheduledValues(t); if(now) p.setValueAtTime(val,t); else p.setTargetAtTime(val,t,k); };
  set(UW.lp.frequency,underwater?520:20000); set(UW.lp.Q,underwater?5:.7);
  set(UW.driftG.gain,underwater?170:0); set(UW.wobG.gain,underwater?.0022:0);
}
/* let it ride: stretch a song to about two minutes with a second breakdown; fills every 8 bars already, plus rolls every 16 */
const RIDE_SEC=120;
function rideOn(s){
  if(s.handed||s.ride) return; const barSec=s.sp*16, tgt=Math.max(s.bars,Math.round(RIDE_SEC/barSec/8)*8);
  if(tgt<=s.bars) return; s.origBars=s.bars; s.bars=tgt; s.ride=true;
  const b2=Math.floor(tgt*.72/2)*2; s.brk2=(b2>s.brk+8&&b2<tgt-8&&b2>Math.floor(s.step/16)+1)?b2:null;
}
function rideOff(s){
  if(s.handed||!s.ride) return; s.ride=false;
  const cur=Math.floor(s.step/16); s.bars=Math.max(s.origBars,cur+6);
  if(s.brk2!=null&&s.brk2<=cur+1){ /* already in or past the second breakdown: keep it */ } else s.brk2=null;
}
function makeBus(target,rev){
  const b={bus:G(1),dr:G(1.2),mu:G(1.1),duck:G(1),mlp:filt("lowpass",18000,.6),rv:G(1),rvf:G(1),lastDuck:0};
  b.dr.connect(b.bus); b.mu.connect(b.duck); b.duck.connect(b.mlp); b.mlp.connect(b.bus); b.bus.connect(target); b.rv.connect(b.rvf); b.rvf.connect(rev);
  if(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext&&ctx.createConstantSource&&ctx.createChannelMerger){   // 1.25, Save in slices: a silent stereo
    const k=ctx.createConstantSource(), m=ctx.createChannelMerger(2); k.offset.value=0; k.connect(m,0,0); k.connect(m,0,1); for(const n of [b.dr,b.mu,b.rv]) m.connect(n); k.start(0); }   // input keeps each bus stereo and running between notes, as when the whole song was laid out up front (a bus going mono and back resets its filters: a click)
  return b;
}
function duck(s,t,d){ if(t<s.lastDuck) return; s.lastDuck=t; s.duck.gain.setValueAtTime(d,t); s.duck.gain.linearRampToValueAtTime(1,t+.2); }
/* 1.25 (E2): in a song, the basses play through s.bsd (into the drums), and the kick dips it for 70 ms: the kick gets its
   50-60 Hz window and the bass fills the rest, instead of every kick and every bass note pumping the whole music bus. The
   music bus (chords and pads, never the lead) still pumps a little in the four-on-the-floor genres, where it's the sound. */
const bOut=s=>s.bsd||s.dr, bDuck=(s,t,d)=>{ if(!s.bsd) duck(s,t,d); };   // stingers, beds and show music keep the old bus duck
const subM=m=>m-12<28?m:m-12, subF=f=>f/2<41.2?f:f/2;   // a sub an octave down, unless that's under 41 Hz
function kickDuck(s,t){ if(!s.bsd){ duck(s,t,.5); return; } if(t>=(s.lastBsd||0)){ s.lastBsd=t; const g=s.bsd.gain; g.setValueAtTime(s.bd||.55,t); g.linearRampToValueAtTime(1,t+.07); } if(s.kd<1) duck(s,t,s.kd); }
const KICK_DUCK={dance:[.6,.5],set:[.55,.5],cluk:[.6,.5],Electronic:[.6,.5],"Big beat & electro":[.6,.5],trap:[1,.6],soul:[1,.65],ballad:[1,.7]};   // family: [music bus, bass]
const HATF=[205.3,304.4,369.6,522.7,540,800];
/* 1.25: the six-square metal cores of the hats, ride and crash (and their fixed filters) are the same on every hit, for a kit
   and a sample rate. Each is rendered once into a buffer and played through the hit's own envelope: a buffer source and a
   gain per hit instead of six oscillators, four gains and three filters. Until a core is ready (the first hit or two after
   the engine starts) the old way plays. It differs from the old way only where a hit starts between two samples (a buffer
   start is interpolated, an oscillator's isn't): -68 to -79 dB on whole songs, at the top of a cymbal's transient. */
const COREB=new Map();
function coreBuf(sr,key,mul,mg,flt,stop,tail){ const k=sr+"|"+key, b=COREB.get(k); if(b) return b===1?null:b; COREB.set(k,1);
  try{ const oc=new OfflineAudioContext(1,Math.ceil((stop+tail)*sr),sr), mix=oc.createGain(); mix.gain.value=mg; let n=mix;
    for(const [ty,f,q] of flt){ const x=oc.createBiquadFilter(); x.type=ty; x.frequency.value=f; if(q!=null) x.Q.value=q; n.connect(x); n=x; } n.connect(oc.destination);
    for(const f of HATF){ const o=oc.createOscillator(); o.type="square"; o.frequency.value=f*mul; o.connect(mix); o.start(0); o.stop(stop); }
    oc.startRendering().then(r=>COREB.set(k,r),()=>COREB.delete(k)); }catch(e){ COREB.delete(k); } return null; }
const hatLp=K=>(K.lp?9000:11000)*Math.min(1.15,K.hf), hatLv=K=>K.lp?1:1.26;   // 1.25 (E2): hats a little brighter and louder (air from the source, not the master), except the dusty kit
const coreHat=(sr,K,open)=>{ const d=(open?.3:.04)*K.hd; return coreBuf(sr,"hat"+K.hf+"|"+d+"|"+hatLp(K),1.7,.16,[["bandpass",8000*K.hf,.8],["highpass",6000*K.hf],["lowpass",hatLp(K)]],d+.05,.05); };
const coreRide=sr=>coreBuf(sr,"ride",2.9,.11,[["bandpass",5600,.9],["highpass",3400]],1.2,.05);
const coreCrash=sr=>coreBuf(sr,"crash",2.3,.1,[["highpass",3500],["lowpass",8000]],2,.05);
// render every kit's cores for a sample rate ahead of the first hit (the live context, and Save's 44.1 kHz at start-up)
function coreWarm(sr){ if(typeof OfflineAudioContext==="undefined"||!(sr>0)) return; try{ for(const K of Object.values(KITS)) for(const o of [false,true]) coreHat(sr,K,o); coreRide(sr); coreCrash(sr); }catch(e){} }
const VOW={a:[800,1150,2800],e:[420,1900,2600],i:[300,2200,2950],o:[460,820,2830],u:[330,720,2530]};   // vowel formants (Hz)
const SYL=[["h","e"],["","o"],["","a"],["y","e"],["","u"],["w","o"],["h","a"],["n","a"],["d","i"],["t","a"]];   // chop syllables: consonant, vowel
let GTR=null;   // guitar drive curve, built with the other curves
const D={
  kick(s,t,v=1,tune=1){   // the song's drum kit (1.23) shapes it: K.kp/ke pitch, K.kd length, K.kc click (the classic kit is all 1s)
    const K=s.kit||KIT0, dk=.38*K.kd, o=osc("sine",50*tune),g=ctx.createGain(),sh=ctx.createWaveShaper(); sh.curve=SAT;
    o.frequency.setValueAtTime(165*tune*K.kp,t); o.frequency.exponentialRampToValueAtTime(58*tune*K.ke,t+(K.kd>1.5?.09:.055)); o.frequency.exponentialRampToValueAtTime(46*tune*K.ke,t+.35*K.kd);
    env(g,t,.0015,.8*v*(K.kg||1),dk); o.connect(sh); sh.connect(g); g.connect(s.dr); o.start(t); o.stop(t+.1+dk);
    const c=osc("triangle",900),cg=ctx.createGain(); c.frequency.setValueAtTime(1500,t); c.frequency.exponentialRampToValueAtTime(220,t+.015); env(cg,t,.0005,.3*v*K.kc,.016); c.connect(cg); cg.connect(s.dr); c.start(t); c.stop(t+.04);
    kickDuck(s,t);
  },
  b808(s,t,m,dur,v=1,slideTo=null,heavy=false){
    const f=mtof(m),o=osc("sine",f),pg=G(heavy?2.4:1.5),sh=ctx.createWaveShaper(),lp=filt("lowpass",heavy?1300:750,.7),g=ctx.createGain(); sh.curve=SAT808;
    o.frequency.setValueAtTime(f*1.8,t); o.frequency.exponentialRampToValueAtTime(f,t+.035);
    if(slideTo!=null){ const ts=t+Math.max(.06,dur-.13); o.frequency.setValueAtTime(f,ts); o.frequency.exponentialRampToValueAtTime(mtof(slideTo),ts+.11); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.21*v,t+.006); g.gain.exponentialRampToValueAtTime(.13*v,t+Math.max(.1,dur*.7)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.1);
    o.connect(pg); pg.connect(sh); sh.connect(lp); lp.connect(g); g.connect(bOut(s)); o.start(t); o.stop(t+dur+.15);
    bDuck(s,t,.6);
  },
  snare(s,t,v=1,rv=.22,tone=1){
    const K=s.kit||KIT0; tone*=K.st;
    const o=osc("triangle",200*tone),og=ctx.createGain(); o.frequency.setValueAtTime(240*tone,t); o.frequency.exponentialRampToValueAtTime(175*tone,t+.07); env(og,t,.001,.55*v,.11); o.connect(og); og.connect(s.dr); o.start(t); o.stop(t+.16);
    const n=nz(t,.3*Math.max(1,K.sd)),bp=filt("bandpass",1800*K.sn,.55),lp=filt("lowpass",7000),g=ctx.createGain(); env(g,t,.001,.75*v*K.snl,.19*K.sd); n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(s.dr); to(g,s,rv);   // 1.25 (E2): snare noise open to 7 kHz (was 5.2)
  },
  clap(s,t,v=1,rv=.32){   // 1.22.2: about 4 dB quieter, a shorter tail and less reverb (it was sitting on top of the mix)
    const bp=filt("bandpass",1150,1.1),lp=filt("lowpass",4800),out=G(.62); bp.connect(lp); lp.connect(out); out.connect(s.dr); to(out,s,rv*.55);
    [0,.008,.017,.027].forEach((d,k)=>{ const n=nz(t+d,.3),g=ctx.createGain(); env(g,t+d,.0008,(k===3?.95:.55)*v,k===3?.16:.012); n.connect(g); g.connect(bp); });
  },
  snap(s,t,v=1){ const n=nz(t,.08),bp=filt("bandpass",2300,2.2),g=ctx.createGain(),p=pan(.2); env(g,t,.0008,.55*v,.05); n.connect(bp); bp.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.3); },
  rim(s,t,v=1){ const o=osc("triangle",1100),o2=osc("square",420),bp=filt("bandpass",1300,3),g=ctx.createGain(),p=pan(-.25); env(g,t,.0008,.28*v,.04); o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(p); p.connect(s.dr); o.start(t);o2.start(t);o.stop(t+.06);o2.stop(t+.06); to(g,s,.15); },
  hat(s,t,v=1,open=false,p0=-.18){
    { const K=s.kit||KIT0, hb=coreHat(ctx.sampleRate,K,open);   // the pre-rendered core (1.25); one panner per song and position (mono in: identical)
      if(hb){ const src=ctx.createBufferSource(), g=ctx.createGain(), d=(open?.3:.04)*K.hd; src.buffer=hb; let p=s._hp&&s._hp.get(p0); if(!p||p.context!==ctx){ p=pan(p0); p.connect(s.dr); (s._hp||(s._hp=new Map())).set(p0,p); }
        env(g,t,.0008,(open?.14:.19)*v*K.hl*hatLv(K),d); src.connect(g); g.connect(p); src.start(t); return; } }
    const K=s.kit||KIT0, mix=G(.16),bp=filt("bandpass",8000*K.hf,.8),hp=filt("highpass",6000*K.hf),lp=filt("lowpass",hatLp(K)),g=ctx.createGain(),p=pan(p0),d=(open?.3:.04)*K.hd;
    for(const f of HATF){ const o=osc("square",f*1.7); o.connect(mix); o.start(t); o.stop(t+d+.05); }
    env(g,t,.0008,(open?.14:.19)*v*K.hl*hatLv(K),d); mix.connect(bp); bp.connect(hp); hp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr);
  },
  conga(s,t,v=1,hi=false){ const f=hi?380:290,o=osc("sine",f),g=ctx.createGain(),p=pan(hi?.35:-.35); o.frequency.setValueAtTime(f*1.25,t); o.frequency.exponentialRampToValueAtTime(f,t+.02); env(g,t,.001,.32*v,.16); o.connect(g); g.connect(p); p.connect(s.dr); o.start(t);o.stop(t+.22); },
  tom(s,t,v=1,f=130){ const o=osc("sine",f),g=ctx.createGain(); o.frequency.setValueAtTime(f*1.5,t); o.frequency.exponentialRampToValueAtTime(f*.8,t+.3); env(g,t,.001,.6*v,.3); o.connect(g); g.connect(s.dr); o.start(t);o.stop(t+.4); to(g,s,.2); },
  crash(s,t,v=1){ const hp=filt("highpass",3500),lp=filt("lowpass",8000),g=ctx.createGain(),p=pan(.3), cb=coreCrash(ctx.sampleRate);
    if(cb){ const src=ctx.createBufferSource(); src.buffer=cb; src.connect(g); src.start(t); }   // the core (1.25): the squares through the same filters, so only the noise goes through hp/lp per hit
    else { const mix=G(.1); for(const f of HATF){const o=osc("square",f*2.3);o.connect(mix);o.start(t);o.stop(t+2);} mix.connect(hp); }
    const n=nz(t,1.9),ng=G(.5); n.connect(ng); ng.connect(hp);
    env(g,t,.002,.13*v,1.7); hp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.25); },
  shaker(s,t,v=1){ const n=nz(t,.09),bp=filt("bandpass",4200,1),lp=filt("lowpass",7000),g=ctx.createGain(),p=pan(.3); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.08*v,t+.018); g.gain.exponentialRampToValueAtTime(.0001,t+.07); n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr); },
  vinyl(s,t,dur){ const k=Math.floor(dur*rr(4,8)); for(let i=0;i<k;i++){ const tt=t+R()*dur,n=nz(tt,.003),g=G(rr(.02,.06)*ambMul()),bp=filt("bandpass",2200,.8); n.connect(bp); bp.connect(g); g.connect(s.mu);} },
  logdrum(s,t,m,v=1){ const f=mtof(m),o=osc("sine",f),g=ctx.createGain(),sh=ctx.createWaveShaper(),lp=filt("lowpass",900); sh.curve=SAT808; o.frequency.setValueAtTime(f*2.2,t); o.frequency.exponentialRampToValueAtTime(f,t+.06); env(g,t,.003,.34*v,.3); o.connect(sh); sh.connect(lp); lp.connect(g); g.connect(bOut(s)); o.start(t); o.stop(t+.4); bDuck(s,t,.7); },
  cowbell(s,t,m,dur,v=1){ M.cowbell(s,t,m,dur,v); },
  riser(s,t,dur){ const n=nz(t,dur+.05),bp=filt("bandpass",400,1.2),g=ctx.createGain(); bp.frequency.setValueAtTime(300,t); bp.frequency.exponentialRampToValueAtTime(4000,t+dur); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.16,t+dur); g.gain.setValueAtTime(.0001,t+dur+.01); n.connect(bp); bp.connect(g); g.connect(s.dr); to(g,s,.35); },
};
// the organ's six drawbars (.5, 1, 2, 3, 4 and 6 x the note) are harmonics 1, 2, 4, 6, 8 and 12 of half the note: one
// PeriodicWave per context plays them all (1.25; was six oscillators and six gains a note, -87 dB from the old sound)
const ORGW=new WeakMap();
function organWave(){ let w=ORGW.get(ctx); if(!w){ const re=new Float32Array(13),im=new Float32Array(13); for(const [h,a] of [[.5,.5],[1,1],[2,.55],[3,.3],[4,.22],[6,.08]]) im[h*2]=a; w=ctx.createPeriodicWave(re,im,{disableNormalization:true}); ORGW.set(ctx,w); } return w; }
const M={
  piano(s,t,notes,dur,v=1){
    const lp=filt("lowpass",3400,.5),out=G(v),p=pan(.08); lp.connect(out); out.connect(p); p.connect(s.mu); to(out,s,.24);
    for(const m of notes){ const f=mtof(m),rel=t+dur+.25;
      for(let n=1;n<=7;n++){ const fn=f*n*Math.sqrt(1+.0004*n*n); if(fn>5500) break;
        const a=.2/Math.pow(n,1.25)*(m>72?.7:1),dk=Math.min(5,3.6/Math.pow(n,.65)*Math.pow(2,(60-m)/24)),end=Math.max(t+.15,Math.min(t+dk,rel)),o=osc("sine",fn),g=ctx.createGain();
        g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(a,t+.003); g.gain.exponentialRampToValueAtTime(a*.45,t+.09); g.gain.exponentialRampToValueAtTime(.0001,end);
        o.connect(g); g.connect(lp); o.start(t); o.stop(end+.02); }
      const h=nz(t,.03),hg=ctx.createGain(),hl=filt("lowpass",2000); env(hg,t,.0005,.04,.018); h.connect(hl); hl.connect(hg); hg.connect(lp);
    }
  },
  rhodes(s,t,notes,dur,v=1){
    const out=G(v),lp=filt("lowpass",2800); lp.connect(out); out.connect(s.mu); to(out,s,.2);
    const RP=[pan(-.22),pan(.22)]; for(const x of RP) x.connect(lp);   // 1.25: two panners per chord, not one per note (mono in: identical)
    notes.forEach((m,i)=>{ const f=mtof(m),c=osc("sine",f),mo=osc("sine",f),mg=ctx.createGain(),g=ctx.createGain(),p=RP[i%2];
      mg.gain.setValueAtTime(f*1.3,t); mg.gain.exponentialRampToValueAtTime(f*.1,t+.35); mo.connect(mg); mg.connect(c.frequency);
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.1,t+.006); g.gain.exponentialRampToValueAtTime(.045,t+.4); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.35);
      c.connect(g); g.connect(p); c.start(t); mo.start(t); c.stop(t+dur+.4); mo.stop(t+dur+.4); });
  },
  bell(s,t,m,dur,v=1,pn=0){
    const f=mtof(m),c=osc("sine",f),mo=osc("sine",f*3.5),mg=ctx.createGain(),g=ctx.createGain(),p=pan(pn);
    mg.gain.setValueAtTime(f*2*Math.min(1,Math.pow(2,(76-m)/24)),t); mg.gain.exponentialRampToValueAtTime(f*.04,t+.22); mo.connect(mg); mg.connect(c.frequency);   // 1.25 (E2): gentler FM above E5 (no sidebands past 5 kHz)
    env(g,t,.002,.09*v,Math.max(.6,dur*1.6)); c.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.35); c.start(t); mo.start(t); c.stop(t+dur*1.7+.7); mo.stop(t+.4);
  },
  organ(s,t,notes,dur,v=1,trem=6){   // tonewheel-ish drawbars with a tremolo, for the radio plays
    const g=ctx.createGain(),lfo=osc("sine",trem),lg=G(.18*.05*v),lp=filt("lowpass",3200,.5); lp.connect(g); g.connect(s.mu); to(g,s,.6);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.05*v,t+.04); g.gain.setValueAtTime(.05*v,t+dur); g.gain.linearRampToValueAtTime(.0001,t+dur+.25);
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t+dur+.3);
    notes.forEach(m=>{ const f=mtof(m);
      if(ctx.createPeriodicWave&&f*6<ctx.sampleRate/2){ const o=ctx.createOscillator(),og=G(1/notes.length*1.6); o.setPeriodicWave(organWave()); o.frequency.value=f*.5; o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.3); return; }   // 1.25: the drawbars as one wave
      [[.5,.5],[1,1],[2,.55],[3,.3],[4,.22],[6,.08]].forEach(([h,a])=>{ const o=osc("sine",f*h),og=G(a/notes.length*1.6); o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.3); }); });
  },
  pad(s,t,notes,dur,v=1,bright=1000){
    const lp=filt("lowpass",bright,.4),g=ctx.createGain(); lp.connect(g); g.connect(s.mu); to(g,s,.45);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+Math.min(1.2,dur*.35)); g.gain.setValueAtTime(.045*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.7);
    const PP=[pan(-.4),pan(.4)]; for(const x of PP) x.connect(lp);   // 1.25: one panner per side, not per oscillator
    notes.forEach(m=>{ for(const dt of [-9,8]){ const o=osc("sawtooth",mtof(m)); o.detune.value=dt; o.connect(PP[dt<0?0:1]); o.start(t); o.stop(t+dur+.8);} });
  },
  choir(s,t,notes,dur,v=1){
    const f1=filt("bandpass",720,5),f2=filt("bandpass",1150,6),f3=filt("bandpass",2600,8),g3=G(.3),g=ctx.createGain(),lfo=osc("sine",5),lg=G(6); f1.connect(g); f2.connect(g); f3.connect(g3); g3.connect(g); g.connect(s.mu); to(g,s,.55);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.11*v,t+Math.min(.8,dur*.3)); g.gain.setValueAtTime(.11*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.9);   // 1.25 (E2): less boxy: a little quieter, a third formant so it reads as voices
    lfo.connect(lg); lfo.start(t); lfo.stop(t+dur+1);
    notes.forEach(m=>{ const o=osc("sawtooth",mtof(m)); lg.connect(o.detune); o.connect(f1); o.connect(f2); o.connect(f3); o.start(t); o.stop(t+dur+1); });
  },
  saw(s,t,notes,dur,v=1,q=1.4){   // q: .9 as a lead (1.25 E2)
    const lp=filt("lowpass",2000,q),g=ctx.createGain(),sh=ctx.createWaveShaper(); sh.curve=SAT; lp.frequency.setValueAtTime(2800,t); lp.frequency.exponentialRampToValueAtTime(1000,t+dur+.05);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
    lp.connect(sh); sh.connect(g); g.connect(s.mu); to(g,s,.3);
    const SP=[-16,-6,5,15].map(dt=>{ const p=pan(dt/30); p.connect(lp); return p; });   // 1.25: four panners per chord, not four per note
    notes.forEach(m=>{ [-16,-6,5,15].forEach((dt,k)=>{ const o=osc("sawtooth",mtof(m)); o.detune.value=dt; o.connect(SP[k]); o.start(t); o.stop(t+dur+.1); }); });
  },
  pluck(s,t,m,dur,v=1){ const o=osc("sawtooth",mtof(m)),lp=filt("lowpass",2500,3),g=ctx.createGain(); lp.frequency.setValueAtTime(2800,t); lp.frequency.exponentialRampToValueAtTime(350,t+.22); env(g,t,.002,.12*v,.32); o.connect(lp); lp.connect(g); g.connect(s.mu); to(g,s,.3); o.start(t); o.stop(t+.4); },
  whistle(s,t,m,dur,v=1,prev=null){ const f=mtof(m),o=osc("sine",f),o2=osc("sine",f*2),g2=G(.06),lfo=osc("sine",5.5),lg=ctx.createGain(),lg2=G(2),g=ctx.createGain(); lfo.connect(lg); lg.connect(o.frequency); lg.connect(lg2); lg2.connect(o2.frequency);
    lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.007,t+Math.min(.35,dur*.6));   // 1.25 (E2): the vibrato grows in (short notes sound in tune), a quiet 2nd harmonic for body
    if(prev!=null){o.frequency.setValueAtTime(mtof(prev),t);o.frequency.exponentialRampToValueAtTime(f,t+.08);o2.frequency.setValueAtTime(mtof(prev)*2,t);o2.frequency.exponentialRampToValueAtTime(f*2,t+.08);}
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.06*v,t+.04); g.gain.setValueAtTime(.06*v,t+Math.max(.05,dur*.85)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.05);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(s.mu); to(g,s,.3); o.start(t); o2.start(t); lfo.start(t); o.stop(t+dur+.1); o2.stop(t+dur+.1); lfo.stop(t+dur+.1); },
  bass(s,t,m,dur,v=1,prev=null){
    if(s.bassKit&&BASSK[s.bassKit]) return BASSK[s.bassKit](s,t,m,dur,v,prev);   // the song's bass sound (1.23); the classic synth bass below
    const g=ctx.createGain(),lp=filt("lowpass",420,2),a=osc("sawtooth",mtof(m)),sb=subM(m)-m,b=osc("sine",mtof(m+sb)),bg=G(1.6);   // 1.25 (E2): the sine sub stays above 41 Hz
    if(prev!=null){a.frequency.setValueAtTime(mtof(prev),t);a.frequency.exponentialRampToValueAtTime(mtof(m),t+.06);b.frequency.setValueAtTime(mtof(prev+sb),t);b.frequency.exponentialRampToValueAtTime(mtof(m+sb),t+.06);}
    lp.frequency.setValueAtTime(900,t); lp.frequency.exponentialRampToValueAtTime(300,t+.2);
    a.connect(lp); b.connect(bg); bg.connect(lp); env(g,t,.004,.36*v,dur); lp.connect(g); g.connect(bOut(s)); a.start(t);b.start(t);a.stop(t+dur+.1);b.stop(t+dur+.1); bDuck(s,t,.7);
  },
  cowbell(s,t,m,dur,v=1){ const f=mtof(m),a=osc("square",f),b=osc("square",f*1.48),bp=filt("bandpass",Math.min(2200,f*1.6),1.5),lp=filt("lowpass",3200),g=ctx.createGain(),p=pan(.15); env(g,t,.002,.08*v,Math.min(.35,dur+.1)); a.connect(bp); b.connect(bp); bp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.3); a.start(t);b.start(t);a.stop(t+.5);b.stop(t+.5); },
  brass(s,t,notes,dur,v=1,one=false){ const lp=filt("lowpass",600,1.2),g=ctx.createGain(),pk=.06*v*(one?Math.SQRT2:1); lp.frequency.setValueAtTime(500,t); lp.frequency.exponentialRampToValueAtTime(2600,t+.05); lp.frequency.exponentialRampToValueAtTime(1300,t+dur+.2);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.03); g.gain.setValueAtTime(pk,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.25);
    lp.connect(g); g.connect(s.mu); to(g,s,.35);
    notes.forEach(m=>{ for(const dt of one?[0]:[-7,6]){ const o=osc("sawtooth",mtof(m)); o.detune.value=dt; o.connect(lp); o.start(t); o.stop(t+dur+.3);} }); },   // one (1.25, CLUK's big-beat stabs): one saw a note at the pair's level
  accordion(s,t,notes,dur,v=1){ const bp=filt("bandpass",1300,.7),g=ctx.createGain(),lfo=osc("sine",6.5),lg=G(.012); lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+.02); g.gain.setValueAtTime(.045*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.06);
    bp.connect(g); g.connect(s.mu); lfo.start(t); lfo.stop(t+dur+.1);
    notes.forEach(m=>{ for(const ty of ["square","sawtooth"]){ const o=osc(ty,mtof(m)); o.detune.value=ty==="square"?-6:6; o.connect(bp); o.start(t); o.stop(t+dur+.1);} }); },
  /* A sung synth voice: saw + pulse through vowel formants, vibrato that grows into long notes, a little breath.
     o: {prev, vw (vowel a e i o u), att, rel, rev (swell up then cut, like a reversed sample), thr (echo throw), pn} */
  vox(s,t,m,dur,v=1,o={}){
    const f=mtof(m),a=osc("sawtooth",f),b=osc("square",f*1.003),bg=G(.35),mix=G(1),out=G(1),g=ctx.createGain(),p=pan(o.pn??rr(-.12,.12)),end=t+dur+(o.rel??.14);
    a.connect(mix); b.connect(bg); bg.connect(mix);
    const lfo=osc("sine",rr(5.2,6)),lg=ctx.createGain(); lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.017,t+Math.max(.05,Math.min(.7,dur*.7)));
    lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
    if(o.prev!=null&&o.prev!==m){ for(const x of [a,b]){ x.frequency.setValueAtTime(mtof(o.prev)*(x===b?1.003:1),t); x.frequency.exponentialRampToValueAtTime(f*(x===b?1.003:1),t+.07); } }
    const vw=VOW[o.vw||"a"]||VOW.a, up=m>69?1.12:1;   // 1.25 (E2): only the first two formants follow the note up; the third stays at 2.6 kHz, softer
    vw.forEach((F,k)=>{ const bp=filt("bandpass",k<2?F*up:2600,[7,10,12][k]),fg=G([2.2,1.3,.5][k]); mix.connect(bp); bp.connect(fg); fg.connect(out); });
    const n=nz(t,dur+.2),hp=filt("highpass",3800),ng=G(.012); n.connect(hp); hp.connect(ng); ng.connect(out);
    const pk=.16*v, at=o.att??.045;
    if(o.rev){ g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+dur); g.gain.setValueAtTime(.0001,t+dur+.005); }
    else { g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+at); g.gain.setValueAtTime(pk*.9,t+Math.max(at+.01,dur)); g.gain.exponentialRampToValueAtTime(.0001,end); }
    const dh=filt("peaking",3000,1.2); dh.gain.value=-3; out.connect(dh); dh.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.42); if(o.thr) g.connect(G(o.thr)).connect(fxDelay);
    for(const x of [a,b,lfo]){ x.start(t); x.stop(end+.05); }
  },
  /* a vocal chop: a consonant click and a short vowel, pitched to the key */
  chop(s,t,m,dur,v=1,o={}){
    const syl=o.syl||pick(SYL), c=syl[0];
    if(c&&!o.rev){ const n=nz(t,.06),bp=filt(c==="w"||c==="n"?"lowpass":"bandpass",{h:2200,y:2800,t:4200,d:1800,w:700,n:400}[c]||2000,c==="h"?.6:2),g=ctx.createGain(); env(g,t,.001,c==="h"?.05*v:.09*v,c==="h"?.06:.025); n.connect(bp); bp.connect(g); g.connect(s.mu); }
    M.vox(s,t+(c&&!o.rev?.012:0),m,Math.max(.05,dur),v*1.05,{vw:syl[1],att:o.rev?0:.006,rel:o.rel??.05,rev:o.rev,thr:o.thr,pn:o.pn??rr(-.45,.45)});
  },
  /* distorted guitar power chords (palm-muted when mute). One amp chain per song (open and muted), so busy parts stay light on the CPU. */
  guitar(s,t,r,dur,v=1,mute=false){
    const k=mute?"gtrM":"gtrO"; let a=s[k];
    if(!a){ const pre=G(1.8),sh=ctx.createWaveShaper(),hp=filt("highpass",110),pk=filt("peaking",1700,1),fz=filt("peaking",4500,1.5),lp=filt("lowpass",mute?1300:3600,.8),out=G(.4); sh.curve=GTR; pk.gain.value=3; fz.gain.value=-4;   // 1.25 (E2): presence at 1.7 kHz, the amp fizz notched
      pre.connect(sh); sh.connect(hp); hp.connect(pk); pk.connect(fz); fz.connect(lp); lp.connect(out); out.connect(s.mu); to(out,s,.12); a=s[k]={pre}; }
    const g=ctx.createGain(),end=t+dur+(mute?.03:.12); g.connect(a.pre);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+.004); g.gain.exponentialRampToValueAtTime(mute?.012*v:.035*v,t+Math.max(.02,dur*.6)); g.gain.exponentialRampToValueAtTime(.0001,end);
    [[0,-8],[7,7],[12,-4]].forEach(([iv,dt])=>{ const o=osc("sawtooth",mtof(r+iv)); o.detune.value=dt; o.connect(g); o.start(t); o.stop(end+.02); });
  },
  /* a real word, rendered by the app's voice and pitched like a sampler; rev plays it backwards */
  sample(s,t,smp,semis,dur,v=1,o={}){
    const src=ctx.createBufferSource(),hp=filt("highpass",160),g=ctx.createGain(),p=pan(o.pn??rr(-.35,.35)); src.buffer=o.rev?smp.r:smp.b; src.playbackRate.value=Math.pow(2,semis/12);
    const len=Math.min(dur,src.buffer.duration/src.playbackRate.value), off=o.slice?R()*Math.max(0,src.buffer.duration-len*src.playbackRate.value):0;
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.55*v,t+.005); g.gain.setValueAtTime(.55*v,t+Math.max(.01,len-.02)); g.gain.exponentialRampToValueAtTime(.0001,t+len+.01);
    src.connect(hp); hp.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.3); if(o.thr) g.connect(G(o.thr)).connect(fxDelay);
    src.start(t,off); src.stop(t+len+.05);
  },
};
/* ---------- styles: current hip-hop, plus pop, dance and a DJ set ---------- */
const HM=[0,2,3,5,7,8,11],AE=[0,2,3,5,7,8,10],DO=[0,2,3,5,7,9,10],PH=[0,1,3,5,7,8,10],MA=[0,2,4,5,7,9,11];
const STY={
  "MELODIC DRILL":{bpm:[140,144],half:1,sw:[.5,.52],scales:[HM,AE],mode:"min",voicing:"triad",
    K:["x.........x.....","x......x...x....","x..........x..x."],S:[["........x.......","........x.....x."],["........x......x","........x......."]],
    H:["x..x..x.x..x..x.","x..x..x.x.3..x..","x..x..x.x..x.rr."],O:[""],P:["...x.......x....","......x......x.."],perc:"rim",
    snare:"snare",clap:0,bass:"808",slide:.5,chords:"piano",pad:"choir",lead:"piano",leadFrom:0,octLead:72},
  "CHILL TRAP":{bpm:[132,144],half:1,sw:[.5,.52],scales:[AE,DO],mode:"min",voicing:"ext",
    K:["x......x..x.....","x.........x..x..","x......x.x......"],S:[["........x.......","........x......."],["........x.......","........x.....x."]],
    H:["x.x.x.x.x.x.x.x.","x.x.xrx.x.x.x3x.","x.x.x.x3x.x.x.xr"],O:["..............o.",""],P:["","...........x...."],perc:"snap",
    snare:"clap",clap:1,bass:"808",slide:.2,chords:"bellarp",pad:"pad",lead:"bell",leadFrom:4,octLead:76},
  "PLUGGNB":{bpm:[146,154],half:1,sw:[.5,.52],scales:[MA],mode:"maj",voicing:"ext",
    K:["x.........x.....","x......x........","x.........x..x.."],S:[["........x.......","........x......."]],
    H:["x.x.x.x.x.x.x.x.","x.x.x.xrx.x.x.x.","x.x.x.x.x.x.x3x."],O:[""],P:["....x.......x..."],perc:"snap",
    snare:"clap",clap:0,bass:"808",slide:.35,chords:"rhodes",pad:"pad",lead:"bell",leadFrom:2,octLead:79},
  "SLOW JAM R&B":{lvl:1.06,bpm:[66,76],sw:[.55,.6],scales:[DO,MA],mode:"any",voicing:"ext",
    K:["x.........x..x..","x......x..x.....","x..x......x....."],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.x3x.x.","x.x3x.x.x.xrx.x."],O:[""],P:["..x....x..x....x","......x.......x."],perc:"rim",
    snare:"snapclap",clap:0,bass:"808soft",slide:.25,chords:"rhodes",pad:"pad",lead:"bell",leadFrom:4,octLead:76},
  "AFROSWING":{bpm:[100,108],sw:[.54,.57],scales:[MA,DO],mode:"maj",voicing:"ext",
    K:["x..x..x...x..x..","x...x..x..x.x...","x..x...xx..x...."],S:[["............x...","....x.......x..."]],
    H:["x.xxx.xxx.xxx.xx","xxx.xxx.xxx.xxx."],O:[""],P:["x..x..x...x.x...","..x..x..x..x.x.."],perc:"conga",
    snare:"clap",clap:0,bass:"bass",chords:"rhodesoff",pad:"pad",lead:"pluck",leadFrom:4,octLead:72,shaker:1},
  "LO-FI BOOM BAP":{bpm:[84,92],sw:[.58,.63],scales:[DO,AE],mode:"min",voicing:"ext",
    K:["x......x..x.....","x.........x.x...","x..x......x.....","x......xx.x....."],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","x.x.x.x.x.x.xxx."],O:["..........o.....",""],P:["......x........x",".......x......x."],perc:"ghost",
    snare:"snare",clap:0,bass:"bass",chords:"rhodes",pad:"strings",lead:"rhodesline",leadFrom:4,octLead:72,vinyl:1,shaker:1},
  "NEO-SOUL":{bpm:[84,92],sw:[.6,.65],scales:[DO,MA],mode:"any",voicing:"ext",
    K:["x......x..x.....","x..x......x..x..","x.......xx......"],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","x.x.x.xxx.x.x.x."],O:[""],P:[".......x.......x","...x.......x...."],perc:"ghost",
    snare:"snare",clap:0,bass:"bass",chords:"rhodes",pad:"strings",lead:"rhodesline",leadFrom:4,octLead:72},
  "AMAPIANO":{bpm:[110,114],sw:[.54,.57],scales:[MA,DO],mode:"maj",voicing:"ext",
    K:["x...x...x...x...","x...x...x...x..."],S:[["............x...","....x.......x..."]],
    H:["x.xxx.xxx.xxx.xx",".xx..xx..xx..xx."],O:[""],P:["..x..x....x..x..","x..x..x..x..x..."],perc:"conga",LOG:["..x..x....x.x...","x..x..x...x..x..","...x..x.x.....x."],
    snare:"clap",clap:0,bass:"log",chords:"pianostab",pad:"pad",lead:"pluck",leadFrom:4,octLead:72,shaker:1},
  "CLOUD RAP":{bpm:[134,142],half:1,sw:[.5,.52],scales:[AE,DO],mode:"min",voicing:"ext",
    K:["x.........x.....","x......x........"],S:[["........x.......","........x......."]],
    H:["x.x.x.x.x.x.x.x.","x.x.x.x.x.x.x3x."],O:[""],P:[""],perc:"",
    snare:"clap",clap:0,bass:"808soft",slide:.3,chords:"bellarp",pad:"choir",lead:"bell",leadFrom:2,octLead:79},
  "JAZZ HOP":{bpm:[86,92],sw:[.6,.64],scales:[DO,MA],mode:"any",voicing:"ext",
    K:["x.......x.x.....","x......x..x.....","x..x.....xx....."],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.xxx.x."],O:["..........o.....",""],P:["......x.........","..............x."],perc:"rim",
    snare:"snare",clap:0,bass:"bass",chords:"rhodes",pad:"pad",lead:"whistle",leadFrom:4,octLead:76,vinyl:1},
  "CHILL PHONK":{bpm:[132,140],half:1,sw:[.5,.53],scales:[PH,AE],mode:"min",voicing:"triad",
    K:["x.....x...x.....","x.....x.x......."],S:[["........x.......","........x......."]],
    H:["x.x.x.x.x.x.x.x.","x.x.x.xrx.x.x.x."],O:[""],P:["....x.......x..."],perc:"snap",
    snare:"clap",clap:0,bass:"808",slide:.3,chords:"none",pad:"choir",lead:"cowbell",leadFrom:0,octLead:72,vinyl:1},
  "WEST COAST":{bpm:[94,100],sw:[.53,.56],scales:[DO,AE],mode:"min",voicing:"ext",
    K:["x.....x...x.x...","x..x...x..x.....","x.....x.x..x...."],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","xxx.x.x.xxx.x.x."],O:[""],P:["..x...x.....x...","..x.....x.x....."],perc:"conga",
    snare:"clap",clap:1,bass:"bass",chords:"rhodes",pad:"pad",lead:"whistle",leadFrom:4,octLead:79,shaker:1},
  /* --- pop, dance and the DJ set --- */
  "GOTHIC DANCE POP":{bpm:[118,126],sw:[.5,.51],scales:[HM,PH,AE],mode:"min",voicing:"triad",
    K:["x...x...x...x...","x...x...x...x..x"],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.xxx.x."],O:["..o...o...o...o."],P:["..........x.....",""],perc:"rim",
    snare:"big",clap:1,bass:"octave",chords:"organ",pad:"choir",lead:"vox",leadFrom:2,octLead:72,crashBar:1,w:1,lvl:.85},
  "POP BALLAD":{bpm:[66,76],sw:[.5,.52],scales:[MA,DO],mode:"maj",voicing:"ext",
    K:["x.......x.x.....","x.........x....."],S:[["....x.......x...","....x.......x..."]],
    H:["x...x...x...x...","x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"ballad",clap:0,bass:"held",chords:"pianoarp",pad:"strings",lead:"vox",leadFrom:2,octLead:72,drumHook:1,kv:.75,w:.55},
  "ALT DANCE POP":{bpm:[112,122],sw:[.5,.53],scales:[DO,MA,AE],mode:"any",voicing:"ext",
    K:["x...x...x...x...","x...x...x.x.x...","x..x..x...x...x."],S:[["....x.......x...","....x.......x..x"]],
    H:["x.x.x.x.x.x.x.x.",".x.x.x.x.x.x.x.x"],O:["..o...o...o...o.",""],P:["...x.......x....","......x.......x."],perc:"snap",
    snare:"clap",clap:0,bass:"pulse",chords:"pluckarp",pad:"pad",lead:"vox",leadFrom:2,octLead:74,shaker:1,w:1,lvl:.9},
  "EMO DANCE POP":{bpm:[144,156],sw:[.5,.5],scales:[AE,MA,DO],mode:"any",voicing:"triad",
    K:["x...x...x...x...","x.....x.x...x...","x...x...x...x.x."],S:[["....x.......x...","....x.......x.x."]],
    H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"snare",clap:1,bass:"pulse",chords:"guitar",pad:"none",lead:"vox",leadFrom:2,octLead:74,crashBar:1,w:1,lvl:.85},
  "AVANT DJ SET":{bpm:[120,126],sw:[.5,.54],scales:[AE,DO,PH],mode:"min",voicing:"ext",set:1,
    K:["x...x...x...x...","x...x...x...x..x","x...x..xx...x..."],S:[["....x.......x...","....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","xxx.xxx.xxx.xxx."],O:["..o...o...o...o."],P:["...x..x....x..x.","..x...x...x.x..."],perc:"conga",
    snare:"clap",clap:0,bass:"pulse",chords:"housestab",pad:"pad",lead:"chop",leadFrom:2,octLead:72,shaker:1,w:.6},
};
const MDFM_STY=Object.keys(STY);   // MDFM 99.9's own genres (PTRN 101.1 adds more to STY below)
/* chart-style progressions (scale degrees, 0 = home chord) */
const PROGS={
  min:[[0,5,2,6],[0,3,6,2],[0,6,5,6],[0,4,5,3],[5,6,0,0],[0,2,6,3],[0,5,3,4],[3,4,0,0],[0,3,4,0],[5,3,0,4],[0,6,3,5],[3,6,2,5]],
  maj:[[0,4,5,3],[5,3,0,4],[1,4,0,5],[0,2,5,3],[3,2,1,0],[3,4,2,5],[3,4,0,5],[0,5,1,4],[1,2,3,4],[0,3,1,4],[5,1,4,0],[3,0,4,5]],
};
const T_A=["Satin","Rooftop","Slow Motion","Afterglow","Basement Tapes","Late Checkout","Quiet Storm","Soft Launch","Pending Review","Low Battery","Window Seat","Two Pillows","Hazy","Overcast","Warm Leatherette","Cozy Closet","Show Pony","Mattress Storage","Sugar Mist","Band Fourteen","Midnight","Velvet","Cardboard","Chrome","Leftover","Sunday","Turbo","Gravy","Crispy","Lunch Money","Basement","Fruit Fly","Triage","Spud","Floorplan","Overtime","Grandma's","Parking Lot","Bulk","Certified","Unapproved","Pending","Steel","Off-Brand","Lukewarm","Late Fee","Reheated","Sideways"];
const T_B=["Serenade","Weather","Drive","Exhale","Voicemail","Daydream","Afterparty","Lullaby","Slow Dance","Blueprint","Static","Mirage","Reflections","Situationship","Dial Tone","Hold Music","Shuffle","Theory","Cypher","Remix","Bounce","Ride","Hustle","Anthem","Groove","Business","Slump","Situation","Hotline","Breakdown","Freestyle","Banger","Interlude","Freestyle (Live)","Season","Pressure","Forecast","Exit Strategy","Receipt","Paperwork","Rotation"];
/* ---------- songs: every song gets its own instruments, arrangement, melodies and kit, within its genre ---------- */
// Instrument pools by family, so a genre keeps its feel but two songs in it don't sound the same.
const FAM={
  trap:{chords:["piano","bellarp","pianostab","rhodes","padonly","pluckarp"],lead:["piano","bell","whistle","pluck","saw","bell"],pad:["choir","pad","strings","none"]},
  soul:{chords:["rhodes","piano","pianostab","rhodesoff","rhodes"],lead:["rhodesline","whistle","bell","piano","pluck"],pad:["pad","strings","choir","none"]},
  dance:{chords:["rhodesoff","pianostab","rhodes","pluckarp","saw"],lead:["pluck","whistle","bell","saw","piano"],pad:["pad","strings","none"]},
  goth:{chords:["organ","saw","pianostab","organ"],lead:["vox","bell","pluck","saw"],pad:["choir","strings"]},
  ballad:{chords:["pianoarp","piano","rhodes","pianoarp"],lead:["vox","vox","whistle","bell"],pad:["strings","pad","choir"]},
  pop:{chords:["pluckarp","rhodesoff","saw","pianostab","guitar"],lead:["vox","pluck","bell","vox"],pad:["pad","strings","none"]},
  emo:{chords:["guitar","guitar","saw"],lead:["vox","vox","pluck"],pad:["none","pad","strings"]},
  set:{chords:["housestab","saw","pluckarp","organ"],lead:["chop","chop","vox","pluck"],pad:["pad","strings","choir"]},
};
const STYLE_FAM={"MELODIC DRILL":"trap","CHILL TRAP":"trap","PLUGGNB":"trap","CLOUD RAP":"trap","CHILL PHONK":"trap","SLOW JAM R&B":"soul","NEO-SOUL":"soul","LO-FI BOOM BAP":"soul","JAZZ HOP":"soul","AFROSWING":"dance","AMAPIANO":"dance","WEST COAST":"dance","GOTHIC DANCE POP":"goth","POP BALLAD":"ballad","ALT DANCE POP":"pop","EMO DANCE POP":"emo","AVANT DJ SET":"set"};
// Song forms. Section kinds: intro, verse, pre (build-up), hook, break, bridge, outro. "u" is a unit of 4 or 8 bars.
const FORMS=[
  [["intro",.5],["verse",1],["hook",1],["verse",1],["hook",1],["break",.5],["hook",1],["outro",.5]],
  [["intro",.5],["hook",1],["verse",1],["pre",.5],["hook",1],["bridge",1],["hook",1],["outro",.5]],
  [["intro",1],["verse",1],["verse",1],["hook",1],["break",.5],["verse",1],["hook",1],["outro",.5]],
  [["intro",.5],["verse",1],["pre",.5],["hook",1],["verse",1],["pre",.5],["hook",1],["hook",1],["outro",.5]],
  [["intro",.5],["hook",1],["bridge",1],["hook",1],["verse",1],["hook",1],["outro",.5]],
];
// The DJ set: about four minutes, two "tracks" blended in the middle (deck B starts at the second verse).
const SETFORM=[["intro",1],["verse",2],["pre",.5],["hook",2],["break",1],["hook",1.5],["verse",2],["pre",.5],["hook",2],["break",1],["hook",2],["outro",1]];
const recentStyles=[];
/* 1.25 (E2), the producer's pass on the song writer: the lead fits the chord under it, sits in its instrument's own register,
   and the progressions keep each mode's colour without the accidental diminished and augmented chords. */
// the highest note each lead plays (MIDI): a sung voice and a sax at a pop belt, whistle and bells around E6, chip and flute a little higher
const LEAD_TOP={vox:81,sax:81,chop:84,cowbell:84,brass1:84,harm:84,melodica:84,acid303:79,whistle:88,bell:88,piano:88,pluck:88,
  saw:86,sqlead:86,fmlead:86,gtrlead:86,tele:86,rhodesline:86,fiddle:88,vibes:89,flute:91,chip:91};
const leadTop=i=>LEAD_TOP[i]??88;
const regShift=(a,inst)=>{ let k=0; const hi=Math.max(...a.map(n=>n.m)); while(hi+k>leadTop(inst)) k-=12; return k; };
const arpUp=n=>Math.max(...n)+12<=86?12:0;   // arpeggios an octave up only while they stay below D6 (the lead lives above)
// chord voicings out of the mud: no 2nds below C4, no 3rds below E3
function tidyV(ns){ ns=[...ns].sort((a,b)=>a-b); for(let j=0;j+1<ns.length;j++) while((ns[j]<52&&ns[j+1]-ns[j]<=4)||(ns[j]<60&&ns[j+1]-ns[j]<=2)){ ns[j]+=12; ns.sort((a,b)=>a-b); } return ns; }
// a diminished or augmented degree in a progression becomes the mode's own chord: harmonic minor's ii°, III+ and vii° become
// iv, VI and V (the major V stays: it's what makes it harmonic minor), phrygian's v° bVII (bII stays), dorian's vi° IV, lydian's #iv° II
function progFix(p,sc,deg){ const q=d=>{ const a=deg(d+2)-deg(d), b=deg(d+4)-deg(d); return (a===3&&b===6)||(a===4&&b===8); };
  const SUB=sc===HM?{1:3,2:5,6:4}:sc===DO?{5:3}:sc===PH?{4:6}:sc===LYD?{3:1}:sc===MA?{6:4}:sc===MIXO?{2:6}:sc===AE?{1:3}:{};
  return p.map(d=>{ if(!q(d)) return d; const k=((d%7)+7)%7, t=SUB[k]; return t!=null&&!q(d-k+t)?d-k+t:d; }); }
// the key change up a step for the last hook: pop, goth, emo, ballads and dance (and PTRN's rock and pop), a little in soul; never in trap, electronic, hip-hop, chill or CLUK
const KEYUP_P={pop:.22,goth:.22,emo:.22,ballad:.22,dance:.22,soul:.08};
function keyUpP(name){ const g=PTRN_KEY[name], f=g?{"Rock & pop":"pop","Jazz, funk & soul":"soul"}[g[2]]:STYLE_FAM[name]; return KEYUP_P[f]||0; }
// the kick's tail tuned to the song's root or 5th (whichever is nearer the kit's own pitch), so it doesn't beat against the bass
function kickTn(root,K){ const nat=46*(K.ke||1); let best=1, bd=9; for(let m=12;m<48;m++){ const pc=((m-root)%12+12)%12; if(pc!==0&&pc!==7) continue; const r=mtof(m)/nat, dd=Math.abs(Math.log2(r)); if(dd<bd){ bd=dd; best=r; } } return best; }
// the lead note as played: a strong-beat or held note a semitone off the chord moves to the nearest chord tone (passing notes
// and 9ths, 11ths and 13ths stay); harmonic minor's raised 7th is held only over V; a note tied over a chord change that clashes
// with the new chord stops at the bar line; and it never goes above its instrument's ceiling. Returns [note, length in 16ths].
function leadNote(s,n,d,tr,oct,i,inst,notes,nd){ const P=x=>((x%12)+12)%12, core=[0,2,4].map(x=>P(s.root+s.deg(d+x)+tr)), allc=notes.map(P), k=((d%7)+7)%7;
  let m=n.m+tr+oct, len=n.len; const strong=i%4===0||len>=3;
  if(s.sc===HM&&P(m-s.root-tr)===11&&k!==4&&strong) m-=1;
  const l=P(m); if(strong&&!allc.includes(l)&&core.some(c=>P(l-c)===1||P(c-l)===1)) for(const dm of [-1,1,-2,2,-3,3]) if(core.includes(P(m+dm))){ m+=dm; break; }
  if(nd!=null&&nd!==d&&i+len>16){ const c2=[0,2,4].map(x=>P(s.root+s.deg(nd+x)+tr)), l2=P(m); if(!c2.includes(l2)&&c2.some(c=>P(l2-c)===1||P(c-l2)===1)) len=16-i; }
  const top=leadTop(inst); while(m>top) m-=12; return [m,len]; }
// hookDbl: a producer's double. Non-vibrato leads (piano, pluck, electric piano, vibes) keep their bell an octave up while it
// stays below G6; everything else gets itself again, quieter, 12 ms late and panned to one side. [inst, note, level, delay, pan]
const LEAD_PURE=new Set(["piano","pluck","rhodesline","vibes"]);
function leadDbl(s,inst,m){ return LEAD_PURE.has(inst)&&m+12<=91?["bell",m+12,.45,0,null]:[inst,m,.4,.012,s.dpn||.3]; }
function motifGen(base,deg,dens,half,len,start,lo=-2,hi=9){ // a melody: len bars of 16 steps, stepwise with the odd leap
  let cur=start; const out=[];   // 1.25 (E2): lo/hi keep a line within about an octave (hooks -1..7, verses -2..6; was -2..9)
  for(let i=0;i<len*16;i++){ const p=i%4===0?dens*1.8:i%2===0?dens:(half?0:dens*.25);
    if(R()<p){ cur=Math.max(lo,Math.min(hi,cur+pick([-2,-1,-1,0,1,1,2,3,-3,4]))); out.push({i,m:base+deg(cur),dg:cur}); } }
  if(!out.length) out.push({i:0,m:base+deg(start),dg:start});
  out.forEach((n,k)=>{ const nx=k+1<out.length?out[k+1].i:len*16; n.len=Math.max(1,Math.min(8,nx-n.i)); });
  { const z=out[out.length-1]; let c=z.dg, b=99; for(let x=z.dg-3;x<=z.dg+3;x++) if([0,2,4].includes(((x%7)+7)%7)&&Math.abs(x-z.dg)<b){ b=Math.abs(x-z.dg); c=x; } z.dg=c; z.m=base+deg(c); }   // 1.25 (E2): the phrase ends on the 1st, 3rd or 5th (a cadence, as HEARYE's lines do)
  return out;
}
function makeSong(force,from=MDFM_STY,recent=recentStyles){
  let name=force; if(!name){ const all=from, fresh=all.filter(n=>!recent.includes(n)), pool=fresh.length?fresh:all;   // weighted: ballads and DJ sets come up less often
    let r=R()*pool.reduce((a,n)=>a+(STY[n].w??1),0); name=pool[pool.length-1]; for(const n of pool){ if((r-=STY[n].w??1)<=0){ name=n; break; } }
    recent.push(name); if(recent.length>4) recent.shift(); }
  const st=STY[name],fam=st.fam||FAM[STYLE_FAM[name]]||FAM.soul,sc=pick(st.scales),root=ri(36,47),bpm=ri(st.bpm[0]-2,st.bpm[1]+2),major=sc[2]===4;
  const deg=d=>{const k=((d%7)+7)%7,o=Math.floor(d/7);return sc[k]+12*o;};
  let voi=st.voicing==='ext'?pick([[0,2,4,6],[0,2,6,8],[0,4,6,9],[0,2,4,6,8]]):pick([[0,2,4],[0,4,7],[-3,0,2]]); if(voi.length===5&&st.bass!=="none") voi=[2,4,6,8];   // 1.25 (E2): five-note voicings go rootless over a bass (3-5-7-9; the bass has the root)
  const chord=st.voicing==="dom7"?(d,up=0)=>tidyV([0,4,7,10].map((x,j)=>root+12+deg(d)+x+(j<up?12:0))):(d,up=0)=>tidyV(voi.map((x,j)=>root+12+deg(d+x)+(j<up?12:0)));
  const sp=60/bpm/4, barSec=sp*16;
  // arrangement: a form, sized so the song runs about 70-110 seconds
  const form=st.set?SETFORM:pick(st.forms||FORMS), unit=st.set?8:st.unit||(barSec*8*form.reduce((a,f)=>a+f[1],0)>115?4:8), sections=[]; let at=0;
  for(const [kind,len] of form){ const bars=Math.max(2,Math.round(len*unit/2)*2); sections.push({kind,start:at,bars}); at+=bars; }
  const bars=Math.max(at,16), brkSec=sections.find(x=>x.kind==="break"||x.kind==="bridge"), brk=brkSec?brkSec.start:Math.floor(bars*.45/2)*2;
  // per-section flavour
  const kinds={}; for(const k of ["intro","verse","pre","hook","break","bridge","outro"]) kinds[k]={
    hats:k==="hook"?pick(["full","busy"]):k==="verse"?pick(["sparse","full","full"]):k==="pre"?"build":"sparse",
    kick:k==="hook"?pick(["A","B"]):"A", lead:k==="hook"?pick(["hook","hookHi","hookDbl"]):k==="verse"?pick(["none","verse","verse"]):k==="bridge"?pick(["verse","none"]):k==="pre"?pick(["none","verse"]):"none",
    chords:k==="bridge"||k==="break"?"sustain":k==="hook"?pick(["main","main","stab"]):pick(["main","sparse"]),
    bass:k==="intro"||k==="break"?"none":k==="bridge"?pick(["none","half"]):k==="verse"?pick(["full","half","full"]):"full",
    drums:!(k==="intro"&&R()<.6)&&k!=="break"&&!(k==="bridge"&&R()<.5), up:k==="hook"&&R()<.5?1:0 };
  const K=pick(st.K),S=pick(st.S),H=pick(st.H),O=pick(st.O),P=pick(st.P),K2=pick(st.K),H2=pick(st.H),P2=pick(st.P),LOG=pick(st.LOG||[""]);
  const bassPat=[...K].map((c,i)=>c==="x"||(R()<.1&&i%2===0)?1:0), bassOff=bassPat.map(()=>pick([0,0,0,0,0,7,12,-2,3,5]));
  // instruments for this song: the genre's own sound most of the time, a swap some of the time
  let chordsI=R()<.45?st.chords:pick(fam.chords), leadI=R()<.4?st.lead:pick(fam.lead), leadB=pick(fam.lead), padI=R()<.5?st.pad:pick(fam.pad);
  // 1.23: newer instruments some of the time, then Settings' instrument pool (anything switched off is swapped for one that's on)
  if(R()<.2&&!["vox","chop","chip","cowbell"].includes(leadI)) leadI=pick(XTRA.lead); if(R()<.2) leadB=pick(XTRA.lead);
  if(R()<.3&&["piano","pianostab","rhodes","rhodesoff"].includes(chordsI)) chordsI="wurli"; if(R()<.15&&padI!=="none") padI="warm";
  chordsI=poolFix("keys",chordsI,[st.chords,...fam.chords,"wurli"],st.chords); leadI=poolFix("lead",leadI,[st.lead,...fam.lead,...XTRA.lead],st.lead); leadB=poolFix("lead",leadB,[...fam.lead,...XTRA.lead],st.lead); padI=poolFix("pad",padI,[st.pad,...fam.pad,"warm","none"],st.pad);
  const kitId=kitFor(name), bassKit=bassFor(name), no808=!poolOn("bass","b808");
  const dens=({piano:.24,bell:.26,whistle:.2,rhodesline:.18,pluck:.3,cowbell:.32,saw:.2,vox:.17,chop:.3}[leadI]||.25)*rr(.75,1.3);
  const base=root+12*Math.round((st.octLead-root)/12);
  const hookLen=pick([1,2,2,4]), verseLen=pick([2,4]);
  let hook=motifGen(base,deg,dens*1.15,st.half,hookLen,ri(1,5),-1,7), verse=motifGen(base-12*(R()<.4?1:0),deg,dens*.7,st.half,verseLen,ri(0,4),-2,6);
  let answer=hook.map((n,k)=>k>=hook.length/2&&R()<.5?{...n,m:base+deg(ri(-1,5))}:n);
  { const hk=Math.min(regShift(hook,leadI),regShift(answer,leadI)), vk=regShift(verse,leadB);   // 1.25 (E2): each lead in its own register (whole phrases move, not single notes)
    if(hk){ hook=hook.map(n=>({...n,m:n.m+hk})); answer=answer.map(n=>({...n,m:n.m+hk})); } if(vk) verse=verse.map(n=>({...n,m:n.m+vk}));
    if(kinds.hook.lead==="hookHi"&&Math.max(...hook.map(n=>n.m),...answer.map(n=>n.m))+12>leadTop(leadI)) kinds.hook.lead="hook"; }   // up an octave only where it still fits
  let PG=st.progs?(st.progs[major?"maj":"min"]||st.progs.maj||st.progs.min):major?PROGS.maj:PROGS.min, pa=pick(PG), pb=R()<.6?pick(PG):pa;
  pa=progFix(pa,sc,deg); pb=progFix(pb,sc,deg);   // 1.25 (E2): no accidental diminished or augmented chords; each mode keeps its signature chord
  const fills=sections.map(()=>pick(["tom","snareroll","hatstutter","drop","none","tom"]));
  const verses=sections.filter(x=>x.kind==="verse"), deckB=st.set&&verses[1]?verses[1].start:1e9;   // DJ set: deck B comes in a fourth or fifth away
  const keyUp=st.set?pick([5,7,-2,3]):R()<keyUpP(name)?pick([1,2]):0, lastHook=[...sections].reverse().find(x=>x.kind==="hook");   // 1.25 (E2): the lift only in genres where it's idiomatic
  if(keyUp&&!st.set&&lastHook){ const ix=sections.indexOf(lastHook)-1; if(ix>=0) fills[ix]="drop"; }   // ...and it lands after a beat of silence, not on the old key's tails
  if(st.set){ kinds.hook.lead="hook"; kinds.verse.lead=pick(["verse","none"]); kinds.break.chords="sustain"; }
  if(st.chords==="guitar"){ kinds.verse.chords="mute"; kinds.pre.chords="mute"; kinds.intro.chords="mute"; kinds.hook.chords="main"; kinds.outro.chords="main"; kinds.bridge.chords="sustain"; }   // emo: palm-muted verses, open hooks
  return snareVar(songMeterPick(from===MDFM_STY&&TYPES.meters===false,{name,st,sc,root,bpm,sp,bars,brk,deg,chord,sections,kinds,fills,keyUp,keyFrom:st.set?deckB:keyUp&&lastHook?lastHook.start:1e9,deckB,
    chops:Array.from({length:4},()=>pick(SYL)),
    prog:pa,progB:pb,cpb:st.cpb||(st.half?1:(R()<.5?1:2)),swing:rr(st.sw[0],Math.min(.66,st.sw[1]+.02)),K,S,H,O,P,K2,H2,P2,LOG,bassPat,bassOff,
    hook,answer,verse,hookLen,verseLen,chordsI,leadI,leadB,padI,kitId,kit:KITS[kitId]||KIT0,bassKit:bassKit==="synth"?null:bassKit,no808,kTune:rr(.88,1.12),kTn:kickTn(root,KITS[kitId]||KIT0),dpn:(root+bpm)%2?.3:-.3,sTone:rr(.85,1.2),hatDec:rr(-.24,-.12),
    title:st.set?`${pick(T_A)} ${pick(T_B)} (Continuous Mix)`:`${pick(T_A)} ${pick(T_B)}`}));
}
/* 1.22.2: not every song in a clap genre claps. About 3 in 10 play a snare only, about 1 in 4 a snare with a soft clap under it,
   the rest as the genre is written. Drawn from what the song already rolled (no extra random draw). */
const CLAP_SNARES=new Set(["clap","big","snapclap","dembow","gated"]);
function snareVar(s){ const st=s.st; if(!(CLAP_SNARES.has(st.snare)||st.clap)) return s; const r=((s.hatDec*7777.7+s.kTune*313.3)%1+1)%1; s.snv=r<.3?1:r<.55?2:0; return s; }
/* Time signatures of their own (1.22): about one song in four is in 3/4, 6/8, 5/4 or 7/8, picked to suit the genre. Played
   through the same 16th-slot maps as TUNE's TIME control (METERS), with drum patterns written for 3/4 and 6/8; 5/4 and 7/8
   play the song's own patterns with the bar extended or cut. The choice uses no random draw of its own, so a 4/4 song is exactly as before. */
const METER_FIT={trap:["6/8","3/4"],soul:["6/8","3/4","5/4","7/8"],dance:["6/8","3/4"],goth:["6/8","7/8"],ballad:["3/4","6/8"],pop:["7/8","6/8","5/4"],emo:["6/8","7/8"],set:[]};
const FAM_FEEL={trap:"half",soul:"back",dance:"back",goth:"four",ballad:"ballad",pop:"four",emo:"back",set:"four"};
const METER_PATS={
  "3/4":{back:{K:["x......x....","x.....x.....","x.......x.x."],S:[["........x..."],["........x...","....x...x..."]],H:["x.x.x.x.x.x.","x.xxx.x.x.xx"],P:["......x.....",""]},
    half:{K:["x.........x.","x......x...."],S:[["........x..."]],H:["x.x.x.x.x.x.","x.x.x.xrx.x.","x.x.x.x.x3x."],P:[""]},
    four:{K:["x...x...x..."],S:[["....x...x..."]],H:["..x...x...x."],O:["..o.........",""],P:[""]},
    ballad:{K:["x...........","x.......x..."],S:[["........x..."]],H:["x...x...x...","x.x.x.x.x.x."],P:[""]}},
  "6/8":{back:{K:["x...x.....x.....","x.........x.....","x....x....x..x.."],S:[["........x......."]],H:["x.x.x...x.x.x...","x.xxx...x.xxx..."],P:["....x.......x...",""]},
    half:{K:["x.........x.....","x...x.......x..."],S:[["........x......."]],H:["x.x.x...x.x.x...","xxxxxx..xxxxxx..","x.x.xr..x.x.x3.."],P:[""]},
    four:{K:["x.......x.......","x...x...x......."],S:[["........x......."]],H:["..x.x.....x.x..."],O:["....o.......o...",""],P:[""]},
    ballad:{K:["x.........x.....","x..............."],S:[["........x......."]],H:["x.x.x...x.x.x..."],P:[""]}}};
function songMeterPick(only44,s){ if(only44) return s;   // MDFM's Settings: "Songs in 3/4, 6/8, 5/4, 7/8" off: every song in 4/4, as before 1.22
 const st=s.st, list=st.meters||METER_FIT[STYLE_FAM[s.name]]||[], p=st.meterP??.25, r=((s.kTune*9973.17+s.sTone*7919.31)%1+1)%1;   // drawn from what was already rolled: no extra random draw, so a 4/4 song plays exactly as before
  if(!list.length||r>=p||st.set) return s;
  const mk=list[Math.min(list.length-1,Math.floor(r/p*list.length))], keep=()=>({K:s.K,K2:s.K2,S:s.S,H:s.H,H2:s.H2,O:s.O,P:s.P,P2:s.P2,bassPat:s.bassPat,f0:s.f0});
  s.pat44=keep(); s.pat44.f0=12;   // if TUNE's TIME takes it back to 4/4 (or anything else), it plays its 4/4 patterns
  s.meter=mk; s.f0=mk==="3/4"?8:mk==="6/8"||mk==="7/8"?10:12;
  const P=METER_PATS[mk]; if(!P){ s.patOwn=keep(); return s; }   // 5/4 and 7/8: the song's own patterns, the bar extended or cut
  const set=P[st.feel||FAM_FEEL[STYLE_FAM[s.name]]||"back"]||P.back;
  s.K=pick(set.K); s.K2=pick(set.K); s.S=pick(set.S); s.H=pick(set.H); s.H2=pick(set.H); s.O=pick(set.O||[""]); s.P=pick(set.P||[""]); s.P2=pick(set.P||[""]);
  s.bassPat=[...s.K].map((c,i)=>c==="x"||(i%4===2&&R()<.15)?1:0); s.patOwn=keep(); return s; }
function secAt(s,bar){ for(const x of s.sections) if(bar>=x.start&&bar<x.start+x.bars) return x;
  // past the written form (let it ride): keep cycling verse / hook in 8-bar blocks, ending on the outro
  const last=s.sections[s.sections.length-1], over=bar-(last.start+last.bars), n=Math.floor(over/8);
  return {kind:bar>=s.bars-4?"outro":n%2?"verse":"hook",start:last.start+last.bars+n*8,bars:8}; }
function playStep(s,step,t){
  const sid=s.mxId||"mdfm"; if(!s.gExtra&&(s.sp0!=null||MXON[sid]||GON[sid])) mxSong(s,step);   // the style matrix (TUNE): tempo, swing and groove pulls, only once it's been used
  const st=s.st,bar=Math.floor(step/16),i=step%16,sp=s.sp,deckB=bar>=s.deckB, GN=GON[sid], gf=GN?GRV[sid].feel:.5, di=gf>.75?(i*2)%16:gf<.25?(i>>1)+8*(bar%2):i, gSkip=gf<.25&&i%2===1;   // di: where in the drum pattern (TUNE feel: half / double time)
  let tt=t+(st.sw8?(i%4===2?(s.swing-.5)*4*sp:0):i%2?(s.swing-.5)*2*sp:0); if(s.swing>.55) tt+=rr(-.004,.004);
  const B2=s.brk2??-99, sec=(bar===B2||bar===B2+1)?{kind:"break",start:B2,bars:2}:secAt(s,bar), K=s.kinds[sec.kind]||s.kinds.verse;
  const sb=bar-sec.start, lastBar=sb===sec.bars-1, nextSec=secAt(s,sec.start+sec.bars), fill=s.fills[s.sections.indexOf(sec)]||(sec.kind==="hook"?"snareroll":"tom");
  const drop=lastBar&&fill==="drop"&&nextSec.kind==="hook"&&i>=8;   // a beat of silence before the hook lands
  const tr=bar>=s.keyFrom?s.keyUp:0, prog=sec.kind==="hook"||sec.kind==="pre"?s.prog:s.progB;
  const d=prog[Math.floor(bar/s.cpb)%prog.length], notes=s.chord(d,K.up).map(n=>n+tr);
  // filter sweeps: open up across the intro and out of breaks; close down into a break
  if(step===0&&!s.gExtra){ s.mlp.frequency.setValueAtTime(450,t); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*Math.max(2,s.sections[0].bars)); }
  if(!s.gExtra&&sb===0&&i===0&&(sec.kind==="break"||sec.kind==="bridge")&&bar>0){ s.mlp.frequency.setValueAtTime(18000,t); s.mlp.frequency.exponentialRampToValueAtTime(900,t+sp*8); s.mlp.frequency.setValueAtTime(900,t+sp*16*(sec.bars-1)); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*sec.bars); }
  /* drums */
  s.gTr=tr; if(GN&&i===0&&!s.gExtra){ s.gGrid={t0:t,st:sp,n:16,bar}; s.gNoFill=GRV[sid].fills<.49&&R()<(.5-GRV[sid].fills)*2; gPump(sid,s,t,16*sp,bar,lastBar); }
  if(MXON[sid]&&i===0&&!s.gExtra){ s.mxD=d; s.mxTr=tr; s.mxRoot=s.root+s.deg(d)+tr; s.mxNd=prog[Math.floor((bar+1)/s.cpb)%prog.length]; s.mxNx=s.root+s.deg(s.mxNd)+tr; s.mxCh=notes; s.mxFill=lastBar&&nextSec.kind!=="outro"; mxGroove(sid,s,t,16*sp,bar); }   // 1.25 (E3): the style matrix's bar (its swaps, extras and pattern bass), on this chord
  if(GN){ s.gPos=i; s.gSp=sp; s.gSw=tt-t; }   // 1.25 (E3): the step and its swing offset, for HAT SWING
  const drumsOn=K.drums&&!st.nodrums&&!(st.drumHook&&!(sec.kind==="hook"||sec.kind==="bridge"||sec.kind==="outro")), KICK=st.kickI?D[st.kickI]:D.kick, HAT=st.hat?D[st.hat]:D.hat;
  if(drumsOn&&!drop&&!gSkip){
    const kp=(K.kick==="B")!==deckB?s.K2:s.K; if(kp[di]==="x") KICK(s,tt,(di===0?1:.88)*(st.kv||1),s.kTn||s.kTune);
    const sp2=s.S[bar%s.S.length];
    if(sp2[di]==="x"){ if(s.snv===1) D.snare(s,tt,1,.24,s.sTone); else if(s.snv===2){ D.snare(s,tt,1,.24,s.sTone); D.clap(s,tt,.4,.15); }   // this song: snare only, or a snare with a soft clap under it
      else if(SNX[st.snare]) SNX[st.snare](s,tt,di); else if(st.snare==="big"){ D.snare(s,tt,1.05,.6,s.sTone*.9); D.clap(s,tt,.7,.55); } else if(st.snare==="ballad"){ D.snare(s,tt,.75,.7,s.sTone*.85); } else if(st.snare==="snare"){ D.snare(s,tt,1,.22,s.sTone); if(st.clap) D.clap(s,tt,.65);} else if(st.snare==="snapclap"){ D.snap(s,tt,1.1); D.clap(s,tt,.5,.45);} else { D.clap(s,tt,1); D.snare(s,tt,.3,.1,s.sTone); } }
    const Pp=sec.kind==="hook"?s.P2:s.P; if(Pp&&Pp[di]==="x"&&sec.kind!=="intro"){ if(st.perc==="rim") D.rim(s,tt,.9); else if(st.perc==="snap") D.snap(s,tt,.8); else if(st.perc==="conga") D.conga(s,tt,.9,(di>>1)%2===1); else if(st.perc==="ghost") D.snare(s,tt,.2,.05); else if(PERCX[st.perc]) PERCX[st.perc](s,tt,di,bar); }
    if(PERCX[st.perc2]&&sec.kind!=="intro") PERCX[st.perc2](s,tt,di,bar);
    if(st.shaker&&sec.kind!=="intro") D.shaker(s,tt,di%2?1:.6);
    if(lastBar&&nextSec.kind!=="outro"&&!(GN&&s.gNoFill)){   // the fill into the next section
      const mk=songMeter(s), f0=mk==="3/4"?8:mk==="6/8"||mk==="7/8"?10:12;   // where the fill starts: the last beat of the bar (3/4, 6/8, 7/8 bars end early; 1.25: TUNE's TIME too)
      if(fill==="tom"&&i>=f0&&i<f0+4) D.tom(s,tt,.7,[190,160,130,100][i-f0]);
      else if(fill==="snareroll"&&i>=f0-4) D.snare(s,tt,.3+(i-f0+4)*.08,.12,s.sTone);
      else if(fill==="hatstutter"&&i>=f0&&i<f0+4) for(let k=0;k<4;k++) D.hat(s,tt+k*sp/4,.6,false,s.hatDec);
    } else if(s.ride&&bar%16===15&&i>=8) D.snare(s,tt,.35+(i-8)*.08,.12,s.sTone);
    if(sb===0&&i===0&&(sec.kind==="hook"||(sec.kind==="verse"&&R()<.4))) D.crash(s,tt,sec.kind==="hook"?1:.6);
    else if(st.crashBar&&sec.kind==="hook"&&i===0&&sb%2===0) D.crash(s,tt,.45);
  }
  if(!s.gExtra&&lastBar&&nextSec.kind==="hook"&&i===0&&(sec.kind==="pre"||sec.kind==="break"||bar===s.keyFrom-1||R()<.5)) D.riser(s,t,sp*16);
  if(s.keyUp&&!st.set&&!s.gExtra){ if(bar===s.keyFrom-1&&i===8){ for(const [g,v] of [[s.mu.gain,1.1],[s.rv.gain,1]]){ g.setValueAtTime(v,t); g.setTargetAtTime(.0001,t,.03); } }   // 1.25 (E2): the key change lands clean:
    else if(bar===s.keyFrom&&i===0){ s.mu.gain.setValueAtTime(1.1,t); s.rv.gain.setValueAtTime(1,t); } }   // the old key's pads and reverb sends are choked in the dropped half bar
  if(!(sec.kind==="intro"&&sb===0)&&!drop&&sec.kind!=="break"&&(drumsOn||!st.drumHook)&&!st.nodrums&&!gSkip){
    const hp=(K.hats==="busy")!==deckB?s.H2:s.H, c=hp[di], hv=(di%4===0?1:rr(.55,.75))*(sec.kind==="intro"?.5:1)*(K.hats==="sparse"?.8:1)*(st.hv||1);
    const build=K.hats==="build"&&sb>=sec.bars-2;
    if(K.hats==="sparse"){ if(di%4===0||c==="r") HAT(s,tt,hv,false,s.hatDec); }
    else if(build){ if(di%2===0||sb===sec.bars-1) HAT(s,tt,hv*(.6+sb/sec.bars*.4),false,s.hatDec); }
    else if(c==="x") HAT(s,tt,hv,false,s.hatDec);
    else if(c==="r"){ HAT(s,tt,hv*.8,false,s.hatDec); HAT(s,tt+sp/2,hv*.6,false,s.hatDec); }
    else if(c==="3"){ for(let k=0;k<3;k++) HAT(s,tt+k*sp/3,hv*(.85-k*.12),false,s.hatDec); }
    if(s.O&&s.O[di]==="o"&&K.drums) HAT(s,tt,.85,true,.2);
  }
  if(i===0&&st.vinyl) D.vinyl(s,t,sp*16);
  /* bass */
  const bassOn=K.bass==="full"||(K.bass==="half"&&i<8), BX=BASSX[st.bass];
  if(BX){ if(bassOn&&!drop) BX(s,tt,i,d,tr,prog[Math.floor((bar+1)/s.cpb)%prog.length],bar); }
  else if(bassOn&&!drop&&st.bass==="log"&&s.LOG[i]==="x"){ let m=s.root+s.deg(d)+tr+pick([0,0,0,7,12,-5]); if(m>55) m-=12; D.logdrum(s,tt,m,1); }
  if(!BX&&bassOn&&!drop&&(st.bass==="pulse"||st.bass==="octave")){   // dance: eighth-note synth bass (octave: jumps up on the offbeat)
    if(i%2===0){ let m=s.root+s.deg(d)+tr; while(m>50) m-=12; const up=st.bass==="octave"&&i%4===2?12:0; M.bass(s,tt,m+up,sp*1.6,i%4===0?.95:.75); } }
  else if(bassOn&&!drop&&st.bass==="held"){ if(i===0||(i===8&&R()<.3)){ let m=s.root+s.deg(d)+tr; while(m>50) m-=12; M.bass(s,tt,m,sp*(i?7:15),.7); } }
  else if(!BX&&bassOn&&!drop&&st.bass!=="log"&&s.bassPat[i]){
    let len=1; while(i+len<16&&!s.bassPat[i+len]) len++;
    if(st.bass==="bass"||s.no808){ let m=s.root+s.deg(d)+s.bassOff[i]+tr; if(m>52) m-=12; M.bass(s,tt,m,Math.min(len,4)*sp*.9,1,R()<.2?m+pick([-2,2]):null); }
    else { let m=s.root-12+s.deg(d)+tr+(s.bassOff[i]===12?0:s.bassOff[i]); if(m>40) m-=12; if(m<28) m+=12;   // 1.25 (E2): 808 notes from 41 Hz (was 37)
      let nxt=null; if(R()<st.slide) nxt=m+pick([-5,-2,3,5,7,12]);
      D.b808(s,tt,m,Math.min(len,8)*sp,st.bass==="808soft"?.75:1,nxt,false); }
  }
  /* chords + pad */
  const ck=s.chordsI, cmode=K.chords;
  const CX=CHX[ck]; if(CX&&cmode!=="sustain"&&cmode!=="sparse"){ if(!drop) CX(s,tt,i,notes,cmode,d,tr,bar,di); }
  else if(cmode==="sustain"){ if(i===0&&bar%2===0) (ck==="organ"?M.organ:ck==="guitar"?(s2,t2,n,du,v)=>M.guitar(s2,t2,Math.min(...n)-12,du,v*.8):M.rhodes)(s,tt,notes,sp*30,.7); }
  else if(cmode==="mute"&&ck!=="guitar"){ if(i===0) M.rhodes(s,tt,notes,sp*12,.6); }
  else if(cmode==="sparse"){ if(i===0) (ck==="piano"||ck==="pianostab"?M.piano:M.rhodes)(s,tt,notes,sp*12,.6); }
  else if(cmode==="stab"){ if("x..x..x.x.....x."[i]==="x") M.piano(s,tt,notes,sp*1.1,.6); }
  else if(ck==="piano"&&i===0) M.piano(s,tt,notes,sp*15,.75);
  else if(ck==="rhodes"&&(i===0||i===10)) M.rhodes(s,tt,notes,sp*(i?5:9),.9);
  else if(ck==="rhodesoff"&&(i===2||i===6||i===10||i===14)) M.rhodes(s,tt,notes,sp*1.6,.75);
  else if(ck==="pianostab"&&(i===2||i===6||i===10||i===14)) M.piano(s,tt,notes,sp*1.2,.55);
  else if(ck==="saw"&&"x..x..x...x..x.."[i]==="x") M.saw(s,tt,notes,sp*2.2,.9);
  else if(ck==="bellarp"&&"x..x..x.x..x..x."[i]==="x"){ s.arp=(s.arp||0)+1; M.bell(s,tt,notes[s.arp%notes.length]+arpUp(notes),sp*3,K.lead!=="none"?.56:.75,(s.arp%2?.3:-.3)); }   // 1.25 (E2): arps stay out of the lead's octave, and back off under a melody
  else if(ck==="pluckarp"&&i%2===0){ s.arp=(s.arp||0)+1; M.pluck(s,tt,notes[s.arp%notes.length]+arpUp(notes),sp*1.5,K.lead!=="none"?.45:.6); }
  else if(ck==="organ"&&i===0) M.organ(s,tt,notes,sp*15,.9,5);
  else if(ck==="pianoarp"&&i%2===0) M.piano(s,tt,[notes[(i/2)%notes.length]+(i>=8?12:0)],sp*3.5,.5);
  else if(ck==="housestab"&&"..x...x...x...x."[i]==="x") M.saw(s,tt,notes.map(n=>n+12),sp*.9,.75);
  else if(ck==="guitar"){ const r0=s.root+s.deg(d)+tr; let r=r0; while(r>52) r-=12; while(r<40) r+=12;
    if(cmode==="mute"){ if(i%2===0) M.guitar(s,tt,r,sp*.8,.8,true); } else if("x.x.x.x.x.x.x.x."[i]==="x") M.guitar(s,tt,r,sp*1.9,1,false); }
  const pn=Math.min(...notes)<55?notes.map(x=>x+12):notes;   // 1.25 (E2): pads sit above the keys, not doubling them in the low mids
  if(i===0&&bar%2===0&&s.padI!=="none"&&!drop){ const pd=s.padI; if(pd==="choir") M.choir(s,tt,pn,sp*32,.8); else if(pd==="warm") M.warmpad(s,tt,pn,sp*32,.8); else M.pad(s,tt,pn,sp*32,.8,pd==="strings"?2000:1000); }
  else if(i===0&&bar%2===0&&ck==="padonly") M.pad(s,tt,pn,sp*32,.9,1400);
  if(st.set&&!drop) setExtras(s,sec,sb,i,tt,d,tr,lastBar,nextSec);
  if((st.cx||st.laser)&&!drop&&!s.gExtra) clukExtras(s,sec,sb,i,tt,lastBar,nextSec);
  /* melodies: the hook in hooks (sometimes up an octave or doubled), a sparser line in verses */
  if(K.lead!=="none"&&!drop&&bar>=1){
    const isHook=K.lead!=="verse", L=isHook?s.hookLen:s.verseLen, phrase=Math.floor(sb/L), mot=isHook?(phrase%2?s.answer:s.hook):s.verse;
    const ph=(sb%L)*16+i, inst=isHook?s.leadI:s.leadB, oct=K.lead==="hookHi"?12:0, nd=prog[Math.floor((bar+1)/s.cpb)%prog.length];
    for(let k=0;k<mot.length;k++){ const n=mot[k]; if(n.i!==ph) continue; const [m,len]=leadNote(s,n,d,tr,oct,i,inst,notes,nd), dur=len*sp, prev=k&&s.llast!=null?s.llast:null; s.llast=m;   // 1.25 (E2): fitted to the chord and the register; slides from the note actually played
      playLead(s,inst,tt,m,dur,prev,isHook?1:.75);
      if(K.lead==="hookDbl"){ const [i2,m2,v2,dt,pn]=leadDbl(s,inst,m); playLead(s,i2,tt+dt,m2,dur,null,v2*(isHook?1:.75),pn); } }
  }
}
function setExtras(s,sec,sb,i,tt,d,tr,lastBar,nextSec){
  const sp=s.sp, root=s.root+24+s.deg(d)+tr, syl=s.chops[(Math.floor(sb/4)+(sec.start>=s.deckB?2:0))%4], smp=VSAMP&&VSAMP.length?VSAMP:null;
  // a stutter at the end of every fourth bar of a hook
  if(sec.kind==="hook"&&sb%4===3&&i===12){ const k=pick([4,6,8]); for(let n=0;n<k;n++) M.chop(s,tt+n*sp*4/k,root+(n>=k/2?pick([0,2,3]):0),sp*4/k*.7,.7+n*.04,{syl}); }
  // a reversed swell into a hook, and the build into deck B
  if(lastBar&&i===8&&nextSec.kind==="hook"){ if(smp&&R()<.6) M.sample(s,tt,pick(smp),pick([0,-5,-12]),sp*8,.8,{rev:1}); else M.chop(s,tt,root,sp*8,.9,{syl,rev:1}); }
  // echo throws on the off beats in verses and breaks
  if((sec.kind==="verse"||sec.kind==="break")&&i===6&&sb%2===1&&R()<.6) M.chop(s,tt,root+pick([0,7,12]),sp*1.5,.6,{syl,thr:.55});
  // word samples: the app's voice saying station words, chopped and pitched
  if(smp&&(sec.kind==="hook"||sec.kind==="verse")&&sb%2===0&&i===pick([0,4,10])&&R()<.45){ const w=pick(smp); M.sample(s,tt,w,pick([0,0,-5,7,-12,12]),sp*pick([2,4,6]),.75,{slice:R()<.4,thr:R()<.3?.4:0}); }
  // the blend: the outgoing groove gets filtered down over the last bar before deck B
  if(sec.start+sec.bars===s.deckB&&lastBar&&i===0){ s.mlp.frequency.setValueAtTime(18000,tt); s.mlp.frequency.exponentialRampToValueAtTime(500,tt+sp*15); s.mlp.frequency.setValueAtTime(500,tt+sp*15.5); s.mlp.frequency.exponentialRampToValueAtTime(18000,tt+sp*20); D.riser(s,tt,sp*16); }
}
/* Word samples for the DJ set: when the app renders voices (opts.tts), a few station words are rendered once and kept as audio. */
let VSAMP=null, vsampLoading=false;
const SAMPLE_VOICES=["Samantha","Daniel","Whisper","Zarvox","Trinoids","Karen","Moira"];   // macOS voices; a missing one falls back to the default
const SAMPLE_WORDS=["M D F M","yeah","ninety nine point nine","show pony","synergy","circle back","per my last email","reconcile","again","oh no"];
function revBuf(b){ const r=ctx.createBuffer(b.numberOfChannels,b.length,b.sampleRate); for(let c=0;c<b.numberOfChannels;c++){ const src=b.getChannelData(c),dst=r.getChannelData(c); for(let k=0;k<src.length;k++) dst[k]=src[src.length-1-k]; } return r; }
function loadVoiceSamples(){
  if(VSAMP||vsampLoading||typeof opts.tts!=="function"||!ctx) return; vsampLoading=true;
  const say=(w,v)=>Promise.race([opts.tts({text:w,voice:v,rate:1,pitch:1}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))]);
  const one=w=>say(w,pick(SAMPLE_VOICES)).catch(()=>say(w,null))
    .then(buf=>ctx.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength))).then(b=>({b,r:revBuf(b)})).catch(()=>null);
  Promise.all(SAMPLE_WORDS.map(one)).then(a=>{ VSAMP=a.filter(Boolean); vsampLoading=false; });
}
/* 1.25 (E2): leads play into the song's lead bus (s.ld: no kick ducking, so a hook's downbeats aren't pumped 6 dB down), a
   double through its own panner, each at a trimmed level so they sit at about the same loudness (they spanned 20 dB). */
const LEAD_TRIM={saw:2.2,tele:1.8,pluck:1.25,cowbell:1.2,vibes:1.15,sax:1.1,whistle:.85,vox:.85,chip:.85,flute:.9,fmlead:.68,sqlead:.75,brass1:.72,acid303:.5};   // measured solo, a six-note phrase at E5: 20 dB spread before, about 10 now (and the decaying ones read low on RMS)
function playLead(s,inst,t,m,dur,prev,v,pn=null){ const mu=s.mu;
  if(s.ld){ if(pn!=null){ let p=s._dp; if(!p||p.context!==ctx){ p=s._dp=pan(pn); p.connect(s.ld); } s.mu=p; } else s.mu=s.ld; }
  try{ playLead0(s,inst,t,m,dur,prev,v*(LEAD_TRIM[inst]??1),pn!=null); } finally{ s.mu=mu; } }
function playLead0(s,inst,t,m,dur,prev,v,dbl){
  if(LEADX[inst]){ LEADX[inst](s,t,m,dur,v,prev); return; }
  if(inst==="vox"){ M.vox(s,t,m,dur,v,{prev,vw:dbl&&s.vwl?s.vwl:(s.vwl=pick(["a","a","o","e","u"]))}); return; }
  if(inst==="chop"){ M.chop(s,t,m,Math.min(dur,s.sp*2),v,{syl:s.chops[Math.floor(t/(s.sp*64))%4]}); return; }
  if(inst==="piano") M.piano(s,t,[m],dur,v); else if(inst==="bell") M.bell(s,t,m,dur,v,.15);
  else if(inst==="saw") M.saw(s,t,[m],dur,.8*v,.9); else if(inst==="whistle") M.whistle(s,t,m,dur,v,prev);
  else if(inst==="rhodesline") M.rhodes(s,t,[m],dur,.9*v); else if(inst==="pluck") M.pluck(s,t,m,dur,1.1*v); else if(inst==="cowbell") M.cowbell(s,t,m,dur,v);
  else M.bell(s,t,m,dur,v,.15);
}
// What was rolled for a song, in plain words (for "now playing" and the product page's song card).
const NOTE_NAMES=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const SCALE_NAMES=new Map([[HM,"harmonic minor"],[AE,"minor"],[DO,"dorian"],[PH,"phrygian"],[MA,"major"]]);
const INST_NAMES={piano:"piano",pianostab:"piano stabs",pianoarp:"piano arpeggios",rhodes:"electric piano",rhodesoff:"offbeat electric piano",rhodesline:"electric piano",bellarp:"bell arpeggios",bell:"bells",pluckarp:"plucked arpeggios",pluck:"pluck synth",padonly:"pads",saw:"saw synth",organ:"church organ",guitar:"distorted guitar",housestab:"house stabs",whistle:"whistle",vox:"sung synth voice",chop:"vocal chops",cowbell:"cowbell",choir:"choir",pad:"synth pad",strings:"strings",none:null};
function songFacts(s){
  const prog=s.prog.map(d=>["I","II","III","IV","V","VI","VII"][((d%7)+7)%7]);
  return {key:NOTE_NAMES[s.root%12]+" "+(SCALE_NAMES.get(s.sc)||s.st.scaleName||"modal"),time:s.meter||"4/4",swing:Math.round(s.swing*100),
    form:s.sections.map(x=>x.kind),bars:s.bars,progression:prog.join("–"),
    band:[s.chordsI,s.leadI,s.padI].map(k=>INST_NAMES[k]).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i),
    kit:KIT_NAMES[s.kitId]||"classic kit",bassSound:/^808/.test(s.st.bass)&&!s.no808?"808":BASS_NAMES[s.bassKit||"synth"]};
}
function setupSong(s,t,fadeBars,dest,rev,id){
  Object.assign(s,makeBus(dest||musicDuck,rev||songRev)); s.mxId=id||"mdfm"; s.ld=G(1.1); s.ld.connect(s.mlp);   // 1.25 (E2): the lead bus, beside the music bus but not ducked
  if(s.kit&&s.kit.lp){ s.dr.disconnect(); const lp=filt("lowpass",s.kit.lp,.5), sh=ctx.createWaveShaper(); sh.curve=SAT; s.dr.connect(lp).connect(sh).connect(G(.6)).connect(s.bus); }   // the dusty kit: darker, a little saturated
  s.gNative=true; s.gKey={root:s.root,sc:s.sc}; if(s.st.set) loadVoiceSamples();   // (1.24: this line had slipped into the comment above in 1.23.0, so TUNE's key and swing skipped songs)
  if(s.st.drive&&!(s.kit&&s.kit.lp)){ s.dr.disconnect(); const sh=ctx.createWaveShaper(); sh.curve=SAT; s.dr.connect(G(s.st.drive)).connect(sh).connect(G(.8)).connect(s.bus); }   // CLUK: the drums pushed into a little saturation
  if(s.st.cx) loadClukSamples(); 
  s.bsd=G(1); s.bsd.connect(s.dr); { const kd=KICK_DUCK[s.st.set?"set":familyOf(s.name)]||[1,.65]; s.kd=kd[0]; s.bd=kd[1]; }   // 1.25 (E2): the bass bus the kick dips, and how hard (by family)
  const barT=s.sp*16, L=s.st.lvl||1; s.bus.gain.setValueAtTime(fadeBars?.0001:L,t); s.rvf.gain.setValueAtTime(fadeBars?.0001:1,t);
  if(fadeBars){ s.bus.gain.exponentialRampToValueAtTime(L,t+barT*fadeBars); s.rvf.gain.exponentialRampToValueAtTime(1,t+barT*fadeBars); }
  s.step=0; s.next=t; s.done=false; s.handed=false; return s;
}
function startSong(t,fadeBars){
  const made=GON.mdfm?gSongLen(makeSong()):makeSong(), recipe={...made};   // the song as written, kept so "Save song" can render it again from the top
  const s=setupSong(made,t,fadeBars); s.recipe=recipe; songs.push(s); if(ride) rideOn(s);
  nowPlaying={title:s.title,style:s.name,bpm:s.bpm,...songFacts(s)}; emit("nowplaying",nowPlaying);
  return s;
}

/* ---------- cheesy ad beds ---------- */
const BEDS=[
  {name:"ukulele",bpm:112,prog:[0,4,5,3],step(b,i,bar,t,ch){
    if(i%2===0){ const down=i%4===0; ch.forEach((m,k)=>M.pluck(b,t+(down?k:ch.length-1-k)*.012,m+12,.3,i%8===0?1:.6)); }
    if(i===0||i===8) M.bass(b,t,ch[0]-12,b.sp*6,.8);
    if(i===4||i===12) D.clap(b,t,.45,.25);
    if(i%2===0) D.shaker(b,t,.8);
    const m=b.mel[(bar%2)*16+i]; if(m) M.bell(b,t,m,b.sp*2,.9,.2); }},
  {name:"lounge",bpm:86,swing:.62,prog:[1,4,0,5],seventh:1,step(b,i,bar,t,ch){
    if(i===0||i===6) M.rhodes(b,t,ch,b.sp*(i?6:5),.9);
    if(i%4===0) M.bass(b,t,[ch[0],ch[1],ch[2],ch[1]][i/4]-24,b.sp*3.5,.8);
    if(i%2===0) D.shaker(b,t,.6); if(i===4||i===12) D.snare(b,t,.16,.3);
    const m=b.mel[(bar%2)*16+i]; if(m) M.bell(b,t,m,b.sp*3,.6,-.2); }},
  {name:"car dealer rock",bpm:132,prog:[0,3,4,3],step(b,i,bar,t,ch){
    if(i%2===0) M.saw(b,t,[ch[0]-12,ch[0]-5,ch[0]],b.sp*1.5,.9);
    if(i===0||i===8||i===10) D.kick(b,t,.9); if(i===4||i===12) D.snare(b,t,1,.3); if(i%2===0) D.hat(b,t,.6);
    if(i===0&&bar%4===0) D.crash(b,t,.7); }},
  {name:"polka",bpm:124,prog:[0,4,4,0],step(b,i,bar,t,ch){
    if(i===0||i===8) M.bass(b,t,(i===0?ch[0]:ch[0]+7)-24,b.sp*2,1);
    if(i===4||i===12){ M.accordion(b,t,ch.map(m=>m+12),b.sp*2,.9); D.snare(b,t,.25,.1); }
    const m=b.mel[(bar%2)*16+i]; if(m) M.accordion(b,t,[m],b.sp*1.6,.8); }},
  {name:"game show",bpm:120,prog:[0,5,3,4],step(b,i,bar,t,ch){
    if(i===0||i===3||i===6||i===10) M.brass(b,t,ch.map(m=>m+12),b.sp*1.4,.8);
    if(i%4===0) D.kick(b,t,.7); if(i===4||i===12) D.clap(b,t,.6); if(i%2===0) D.hat(b,t,.5);
    if(i%2===1) M.bell(b,t,ch[(i>>1)%ch.length]+24,b.sp,.5,.3); }},
  {name:"infomercial synth",bpm:104,prog:[0,5,3,4],seventh:1,step(b,i,bar,t,ch){
    if(i===0) M.pad(b,t,ch,b.sp*16,1.2,1800);
    if(i%4===2) M.pluck(b,t,ch[(i>>2)%ch.length]+12,.2,.8);
    if(i===0||i===10) M.bass(b,t,ch[0]-24,b.sp*4,.8); if(i===0||i===8) D.kick(b,t,.6); if(i===4||i===12) D.snap(b,t,.8);
    const m=b.mel[(bar%2)*16+i]; if(m) M.bell(b,t,m,b.sp*2,.8,0); }},
  {name:"organ",only:1,bpm:60,prog:[5,3,4,0],step(b,i,bar,t,ch){   // radio-play underscore: slow, soft
    if(i===0&&bar%2===0) M.organ(b,t,ch.map(m=>m-12),b.sp*30,.55,5.5); }},
  {name:"arts",only:1,bpm:92,swing:.6,prog:[0,5,3,4],seventh:1,step(b,i,bar,t,ch){   // public-radio style noodle: marimba-ish, upright bass, brushes
    if(i%3===0&&R()<.8) M.bell(b,t,ch[(i/3+bar)%ch.length]+12,b.sp*1.5,.55,(i%2?-.3:.3));
    if(i===0||i===8) M.bass(b,t,ch[0]-24,b.sp*5,.6); if(i===6) M.bass(b,t,ch[2]-24,b.sp*2,.4);
    if(i%2===0) D.shaker(b,t,.35); }},
];
function startBed(t,talk){
  const def=typeof talk==="string"?BEDS.find(b=>b.name===talk):talk?pick(BEDS.filter(b=>b.name==="lounge"||b.name==="infomercial synth")):pick(BEDS.filter(b=>!b.only)),sc=MA,root=ri(48,55),deg=d=>{const k=((d%7)+7)%7,o=Math.floor(d/7);return sc[k]+12*o;};
  const b=Object.assign(makeBus(pre,fxRev),{def,sp:60/def.bpm/4,step:0,next:t,stopped:false,swing:def.swing||.5});
  b.chord=d=>[0,2,4].concat(def.seventh?[6]:[]).map(x=>root+12+deg(d+x));
  const pent=[0,2,4,7,9,12,14,16]; let cur=ri(1,4); b.mel=new Array(32).fill(0);
  for(let i=0;i<32;i+=2) if(R()<(i%4===0?.6:.3)){ cur=Math.max(0,Math.min(pent.length-1,cur+ri(-2,2))); b.mel[i]=root+24+pent[cur]; }
  b.lvl=talk==="organ"?.3:talk==="arts"?.2:talk?.22:.42; b.bus.gain.setValueAtTime(.0001,t); b.bus.gain.exponentialRampToValueAtTime(b.lvl,t+.25);
  return b;
}
function playBed(b,t){ const bar=Math.floor(b.step/16),i=b.step%16,ch=b.chord(b.def.prog[bar%4]); b.def.step(b,i,bar,t+(i%2?(b.swing-.5)*2*b.sp:0),ch); }
function endBed(b,t){
  b.stopped=true; const ch=b.chord(0),tt=Math.max(t,b.next);
  M.brass(b,tt,ch.map(m=>m+12),.7,1.1); M.piano(b,tt,ch,1.2,.8); D.kick(b,tt,.8); D.crash(b,tt,.6);
  b.bus.gain.setValueAtTime(b.lvl||.42,tt+.9); b.bus.gain.exponentialRampToValueAtTime(.0001,tt+2.2); b.rvf.gain.setValueAtTime(1,tt+1.5); b.rvf.gain.exponentialRampToValueAtTime(.0001,tt+3);
}

/* ---------- stingers ---------- */
function fxBus(echo){ const b=makeBus(pre,fxRev); if(echo) b.bus.connect(fxDelay); return b; }
const STINGS=[
  function brassHits(t){ const b=fxBus(false),k=ri(0,4),seq=[[60,64,67],[62,65,69],[65,69,72,77]].map(c=>c.map(m=>m+k));
    seq.forEach((c,j)=>{ const tt=t+j*.16; M.brass(b,tt,c,j===2?1.1:.1,1); D.kick(b,tt,j===2?1:.5,.85); }); D.crash(b,t+.32,1); D.clap(b,t+.32,.7,.5); return 1.7; },
  function laser(t){ const b=fxBus(true); for(let k=0;k<3;k++){ const tt=t+k*.18,o=osc("square",1800),g=ctx.createGain(),lp=filt("lowpass",2600); o.frequency.setValueAtTime(2000,tt); o.frequency.exponentialRampToValueAtTime(140,tt+.22); env(g,tt,.002,.06,.22); o.connect(lp); lp.connect(g); g.connect(b.mu); o.start(tt); o.stop(tt+.3); }
    D.kick(b,t+.54,1); D.clap(b,t+.54,.9,.5); return 1.3; },
  function drop(t){ const b=fxBus(false); D.riser(b,t,.9); D.b808(b,t+.9,29,1.3,1,24,true); D.kick(b,t+.9,1); D.clap(b,t+.9,1,.5); D.crash(b,t+.9,.8); return 2.1; },
  function chime(t){ const b=fxBus(true); [79,84,88,91].forEach((m,k)=>M.bell(b,t+k*.13,m,.5,1,(k-1.5)*.3)); M.pad(b,t,[60,64,67,71],1.4,1.2,2000); return 1.5; },
  function scratch(t){ const b=fxBus(false); const gest=(tt,dd)=>{ const n=nz(tt,dd),bp=filt("bandpass",900,4),g=ctx.createGain(); bp.frequency.setValueAtTime(400,tt); bp.frequency.exponentialRampToValueAtTime(2200,tt+dd*.45); bp.frequency.exponentialRampToValueAtTime(500,tt+dd);
      g.gain.setValueAtTime(.0001,tt); g.gain.exponentialRampToValueAtTime(.5,tt+.02); g.gain.setValueAtTime(.5,tt+dd*.8); g.gain.exponentialRampToValueAtTime(.0001,tt+dd); n.connect(bp); bp.connect(g); g.connect(b.dr); };
    gest(t,.14); gest(t+.16,.1); gest(t+.28,.18); D.kick(b,t+.5,1); D.snare(b,t+.5,1,.4); return 1.0; },
  function synthSweep(t){ const b=fxBus(true),o=osc("sawtooth",110),lp=filt("lowpass",300,8),g=ctx.createGain(); lp.frequency.setValueAtTime(250,t); lp.frequency.exponentialRampToValueAtTime(3500,t+.7); env(g,t,.05,.07,.8);
    o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(220,t+.7); o.connect(lp); lp.connect(g); g.connect(b.mu); o.start(t); o.stop(t+1); M.brass(b,t+.75,[57,64,69,73],.6,1); D.kick(b,t+.75,1); D.crash(b,t+.75,.7); return 1.6; },
];

/* ---------- old-time radio sound effects and organ cues (plays, arts pieces) ---------- */
function otBus(){ const hp=filt("highpass",220),lp=filt("lowpass",4200); hp.connect(lp); lp.connect(pre); return makeBus(hp,fxRev); }
function noiseHit(b,t,f,q,dur,v,dest){ const n=nz(t,dur+.05),bp=filt("bandpass",f,q),g=ctx.createGain(); env(g,t,.003,v,dur); n.connect(bp); bp.connect(g); g.connect(dest||b.dr); }
function wood(b,t,f,v){ const o=osc("sine",f),g=ctx.createGain(); env(g,t,.001,.4*v,.07); o.connect(g); g.connect(b.dr); o.start(t); o.stop(t+.1); }
const OT={
  rain(b,t){ const n=nz(t,4),hp=filt("highpass",2500),g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12,t+.6); g.gain.setValueAtTime(.12,t+3); g.gain.exponentialRampToValueAtTime(.0001,t+4); n.connect(hp); hp.connect(g); g.connect(b.dr);
    for(let k=0;k<26;k++) noiseHit(b,t+R()*3.6,rr(1800,5000),3,.02,.15); return 2.6; },
  knock(b,t){ for(const d of [0,.22,.44]){ noiseHit(b,t+d,380,2,.06,.9); D.tom(b,t+d,.5,140); } return .8; },
  door(b,t){ const o=osc("sawtooth",70),bp=filt("bandpass",900,9),g=ctx.createGain(); for(let k=0;k<8;k++) o.frequency.setValueAtTime(rr(55,110),t+k*.13);
    bp.frequency.setValueAtTime(600,t); bp.frequency.linearRampToValueAtTime(1500,t+.6); bp.frequency.linearRampToValueAtTime(800,t+1.1); env(g,t,.15,.35,1.0); o.connect(bp); bp.connect(g); g.connect(b.dr); o.start(t); o.stop(t+1.3);
    D.tom(b,t+1.25,.9,70); noiseHit(b,t+1.25,250,1,.15,.6); return 1.6; },
  steps(b,t){ for(let k=0;k<6;k++){ const tt=t+k*.42; noiseHit(b,tt,k%2?520:440,2.5,.07,.8); wood(b,tt,k%2?180:160,.6); } return 2.6; },
  claps(b,t){ for(let k=0;k<5;k++) D.clap(b,t+k*.32+rr(0,.04),.9,.4); return 1.8; },
  rocket(b,t){ const n=nz(t,3),lp=filt("lowpass",300,1),g=ctx.createGain(); lp.frequency.setValueAtTime(200,t); lp.frequency.exponentialRampToValueAtTime(2400,t+2.4); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.7,t+1.2); g.gain.exponentialRampToValueAtTime(.0001,t+3);
    n.connect(lp); lp.connect(g); g.connect(b.dr); OT.theremin(b,t+.4,2.2); return 2.8; },
  beeps(b,t){ for(let k=0;k<7;k++){ const o=osc("square",pick([880,1320,660,1760])),g=ctx.createGain(); env(g,t+k*.13,.002,.06,.08); o.connect(g); g.connect(b.mu); o.start(t+k*.13); o.stop(t+k*.13+.12); } return 1.1; },
  theremin(b,t,d=2.4){ const o=osc("sine",500),v=osc("sine",6.5),vg=G(14),g=ctx.createGain(); v.connect(vg); vg.connect(o.frequency);
    o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(950,t+d*.45); o.frequency.exponentialRampToValueAtTime(520,t+d); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.16,t+.3); g.gain.setValueAtTime(.16,t+d-.4); g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g); g.connect(b.mu); to(g,b,.5); o.start(t); v.start(t); o.stop(t+d+.05); v.stop(t+d+.05); return d; },
  zap(b,t){ for(let k=0;k<3;k++){ const tt=t+k*.25,o=osc("sawtooth",1500),g=ctx.createGain(); o.frequency.setValueAtTime(1600,tt); o.frequency.exponentialRampToValueAtTime(120,tt+.2); env(g,tt,.002,.18,.2); o.connect(g); g.connect(b.mu); o.start(tt); o.stop(tt+.25); } return .9; },
  thunder(b,t){ const n=nz(t,3.5),lp=filt("lowpass",420,.7),g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(1.1,t+.08); g.gain.exponentialRampToValueAtTime(.35,t+.7); g.gain.exponentialRampToValueAtTime(.0001,t+3.4);
    n.connect(lp); lp.connect(g); g.connect(b.dr); to(g,b,.6); D.b808&&D.kick(b,t,.9,.6); return 2.6; },
  clock(b,t){ for(let k=0;k<8;k++) wood(b,t+k*.5,k%2?1600:1250,.5); return 3.8; },
  horse(b,t){ for(let k=0;k<4;k++){ const tt=t+k*.5; [0,.09,.21].forEach((d,j)=>wood(b,tt+d,[620,520,700][j],.8)); } return 2.1; },
  wind(b,t){ const n=nz(t,3.6),bp=filt("bandpass",500,6),g=ctx.createGain(); bp.frequency.setValueAtTime(400,t); bp.frequency.linearRampToValueAtTime(1100,t+1.5); bp.frequency.linearRampToValueAtTime(500,t+3.4);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.7,t+1); g.gain.exponentialRampToValueAtTime(.0001,t+3.5); n.connect(bp); bp.connect(g); g.connect(b.dr); return 2.4; },
  teacup(b,t){ M.bell(b,t,96,.4,.5,.2); M.bell(b,t+.35,93,.5,.35,-.2); return .9; },
  typewriter(b,t){ let tt=t; for(let k=0;k<14;k++){ tt+=rr(.07,.16); noiseHit(b,tt,2600,4,.02,.8); } M.bell(b,tt+.15,100,.8,.6,0); return tt-t+.6; },
  printer(b,t){ const o=osc("square",180),bp=filt("bandpass",1200,3),g=ctx.createGain(),lfo=osc("square",9),lg=G(.05); lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.06,t+.1); g.gain.setValueAtTime(.06,t+1.8); g.gain.exponentialRampToValueAtTime(.0001,t+2); o.connect(bp); bp.connect(g); g.connect(b.mu); o.start(t); lfo.start(t); o.stop(t+2.1); lfo.stop(t+2.1);
    for(let k=0;k<3;k++) M.bell(b,t+2.1+k*.2,84,.15,.5,0); return 2.7; },
  gallery(b,t){ OT.steps(b,t); for(let k=0;k<10;k++) noiseHit(b,t+R()*2.4,rr(300,700),2,.25,.08); return 2.2; },
  applause(b,t){ for(let k=0;k<90;k++) noiseHit(b,t+R()*2.4*Math.sqrt(R()),rr(900,2400),1.5,.03,.35); return 2.4; },
  hammer(b,t){ for(let k=0;k<5;k++){ const tt=t+k*.34+rr(0,.05); noiseHit(b,tt,1800,3,.04,.9); wood(b,tt,rr(300,360),.9); D.tom(b,tt,.35,110); } return 1.9; },
  drill(b,t){ const bp=filt("bandpass",1400,2),g=ctx.createGain();
    for(const [type,hi] of [["sawtooth",420],["square",840]]){ const o=osc(type,hi/4); o.frequency.setValueAtTime(hi/4,t); o.frequency.exponentialRampToValueAtTime(hi,t+.35); o.frequency.setValueAtTime(hi,t+1.2); o.frequency.exponentialRampToValueAtTime(hi*.3,t+1.6); o.connect(bp); o.start(t); o.stop(t+1.7); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12,t+.15); g.gain.setValueAtTime(.12,t+1.2); g.gain.exponentialRampToValueAtTime(.0001,t+1.65); bp.connect(g); g.connect(b.mu); return 1.7; },
  crash(b,t){ noiseHit(b,t,600,.7,.6,1); D.tom(b,t,1,70); for(let k=0;k<14;k++){ const tt=t+.08+R()*1.5; noiseHit(b,tt,rr(900,4000),3,rr(.03,.1),rr(.3,.8)); if(R()<.4) wood(b,tt,rr(200,900),.7); } M.bell(b,t+1.1,86,.5,.4,.3); return 2.0; },
  crank(b,t){ const n=nz(t,2),lp=filt("lowpass",500,2),g=ctx.createGain(),lfo=osc("square",7),lg=G(.25); lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.3,t+.08); g.gain.setValueAtTime(.3,t+1.5); g.gain.exponentialRampToValueAtTime(.0001,t+1.8); n.connect(lp); lp.connect(g); g.connect(b.dr); lfo.start(t); lfo.stop(t+1.9); noiseHit(b,t+1.85,2200,4,.03,.6); return 2.0; },
  page(b,t){ const n=nz(t,.5),bp=filt("bandpass",3000,1),g=ctx.createGain(); bp.frequency.setValueAtTime(1500,t); bp.frequency.exponentialRampToValueAtTime(5000,t+.35); env(g,t,.12,.35,.35); n.connect(bp); bp.connect(g); g.connect(b.dr); return .7; },
};
const ORGAN={
  theme(b,t){ const k=ri(-2,2),seq=[[[57,60,64],.7],[[55,59,62],.7],[[53,57,60,65],.7],[[52,56,59,64],2.2]]; let tt=t; for(const [c,d] of seq){ M.organ(b,tt,c.map(m=>m+k),d,1); tt+=d; } return tt-t; },
  sting(b,t){ M.organ(b,t,[48,51,55,60],.25,1.2); M.organ(b,t+.35,[47,50,53,59],.25,1.2); M.organ(b,t+.7,[46,49,52,58,61],1.8,1.3,7); return 2.3; },
  mystery(b,t){ M.organ(b,t,[54,57,60,63],2.4,.9,7.5); M.organ(b,t+1.2,[66,69],1.4,.6,7.5); return 2.6; },
  romance(b,t){ M.organ(b,t,[53,57,60,64],1.2,.9,5); M.organ(b,t+1.1,[55,59,62,67,71],2.4,1,5); return 3.2; },
  outro(b,t){ const k=ri(-2,2); M.organ(b,t,[53,57,60].map(m=>m+k),.6,1); M.organ(b,t+.6,[55,59,62].map(m=>m+k),.6,1); M.organ(b,t+1.2,[48,52,55,60,64].map(m=>m+k),3,1.1); return 3.6; },
};
Object.assign(OT,{
  laser(b,t){ for(let k=0;k<2;k++){ const tt=t+k*.2,o=osc("triangle",2200),lp=filt("lowpass",3200),g=ctx.createGain(); o.frequency.setValueAtTime(2400,tt); o.frequency.exponentialRampToValueAtTime(280,tt+.2); env(g,tt,.002,.16,.22); o.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.4); o.start(tt); o.stop(tt+.26); } return .7; },
  gavel(b,t){ for(const d of [0,.32]){ noiseHit(b,t+d,1100,2,.05,.8); wood(b,t+d,430,1); D.tom(b,t+d,.35,190); } return .9; },
  whoosh(b,t){ const n=nz(t,.9),bp=filt("bandpass",400,1.6),g=ctx.createGain(); bp.frequency.setValueAtTime(300,t); bp.frequency.exponentialRampToValueAtTime(2800,t+.35); bp.frequency.exponentialRampToValueAtTime(500,t+.8);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.45,t+.3); g.gain.exponentialRampToValueAtTime(.0001,t+.85); n.connect(bp); bp.connect(g); g.connect(b.dr); return .8; },
  cheer(b,t){ const n=nz(t,3),bp=filt("bandpass",1100,.8),g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.3,t+.4); g.gain.setValueAtTime(.3,t+1.8); g.gain.exponentialRampToValueAtTime(.0001,t+2.9);
    n.connect(bp); bp.connect(g); g.connect(b.dr); OT.applause(b,t+.2); return 2.6; },
  ding(b,t){ M.bell(b,t,84,.6,.8,-.1); M.bell(b,t+.18,91,.9,.8,.1); return 1.1; },
});
const CUE_LABEL={laser:"pew pew",gavel:"gavel",whoosh:"whoosh",cheer:"the crowd goes wild",ding:"ding ding",rain:"rain",knock:"knock knock knock",door:"door creaks",steps:"footsteps",claps:"clapping",rocket:"rocket launch",beeps:"control panel beeps",theremin:"spooky space noise",zap:"zap",thunder:"thunder",clock:"clock ticking",horse:"hoofbeats",wind:"wind",teacup:"teacup clinks",typewriter:"typing",printer:"printer whirs",gallery:"quiet gallery",applause:"polite applause",page:"page turns",hammer:"hammering",drill:"power drill",crash:"something big falls over",crank:"engine cranks and won't start"};

/* ---------- scheduler ---------- */
let nextGap=rr(30,60), lastShow=-1e9;   // first break comes quickly; after that the station leans on music
function tick(){
  if(!on) return;
  const ahead=ctx.currentTime+AHEAD(), late=ctx.currentTime-.3;   // steps more than .3 s in the past (a stall) are skipped, not piled up
  let sp0=null;
  for(const s of songs){
    while(!s.done&&s.next<ahead){
      { const adv=mStep(s,s.next,pStep(s.next,late)); s.step++; s.next+=adv; }
      if(!s.handed&&s.step===(s.bars-4)*16){ s.handed=true; const barT=s.sp*16*meterRatio(s),tH=s.next;
        s.bus.gain.setValueAtTime(s.st.lvl||1,tH); s.bus.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.rvf.gain.setValueAtTime(1,tH); s.rvf.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.endT=tH+barT*4+.5;
        startSong(tH,3);
        const wait=Math.max(0,(tH-ctx.currentTime)*1000);
        if(newsDue()) setTimeout(()=>spot("news"),wait+300);   // company news at the top of the hour, when Slack is connected
        else if(techDue()) setTimeout(()=>spot("technews"),wait+300);   // MedDev tech news on the half hour, when the page can read the hub
        else if(ctx.currentTime-lastSpot>nextGap&&(!spotsOn||speaking||(sp0=nextSpot()))){ const p=sp0; setTimeout(()=>spot(null,p),wait+300); }   // nothing to say (all talk types off): fall through to a voice drop
        else if(R()<.55&&!speaking) setTimeout(()=>{ if(on&&!speaking&&station==="mdfm"){ if(TYPES.stingers&&VSTING.length&&R()<.6) voiceSting(); else pick(STINGS)(ctx.currentTime+.05); } },wait+200);   // 1.25: not on the station just tuned to
      }
      if(s.step>=s.bars*16) s.done=true;
    }
  }
  songs=songs.filter(s=>{ if(!s.done||ctx.currentTime<(s.endT||0)) return true; try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} return false; });
  if(bed&&!bed.stopped) while(bed.next<ahead){ if(bed.next>late) playBed(bed,bed.next); bed.step++; bed.next+=bed.sp; }
}


/* ---------- content packs ---------- */
const packs=[...(opts.includeCore===false?[]:[corePack]),...(opts.packs||[])];
const cat=k=>packs.flatMap(p=>p[k]||[]);
const FREQ=cat("freq").length?cat("freq"):["ninety nine point nine"];
const H={pick,ri,freq:FREQ};
const say=x=>typeof x==="function"?x(H):x;
const IDS=cat("ids"), ADS=cat("ads"), LATE=cat("late"), VSTING=cat("stingers");
const WX={time:[],withData:[],noData:[],timeMood:{}}; packs.forEach(p=>{ const w=p.weather; if(!w) return; for(const k of ["time","withData","noData"]) WX[k].push(...(w[k]||[])); for(const k in (w.timeMood||{})) (WX.timeMood[k]=WX.timeMood[k]||[]).push(...w.timeMood[k]); });
const fill=(s,v)=>s.replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?v[k]:m);
let wxCache=null, wxAt=0, spCache=null, spAt=0;
const TAB={withData:cat2("tabitha","withData"),noData:cat2("tabitha","noData"),thanks:cat2("tabitha","thanks")};
const CHIP={}; for(const k of ["intro","win","loss","live","pre","noData","outro"]) CHIP[k]=cat2("sports",k);
const CHIP_OBS={intro:[],win:[],live:[],pre:[],tie:[]}, CHIP_NAT={win:[],loss:[],live:[],pre:[]};
packs.forEach(p=>{ const o=p.sports&&p.sports.obscure; if(o) for(const k in CHIP_OBS) CHIP_OBS[k].push(...(o[k]||[])); const n=p.sports&&p.sports.national; if(n) for(const k in CHIP_NAT) CHIP_NAT[k].push(...(n[k]||[])); });
function cat2(a,b){ return packs.flatMap(p=>(p[a]&&p[a][b])||[]); }
const TABITHA={accent:"british",names:["Serena","Kate","Martha","Stephanie","Google UK English Female","Microsoft Hazel","Microsoft Sonia","Moira"],pitch:1.05,rate:.95};
const ARTS_HOST={accent:"american",names:["Ava","Allison","Samantha","Microsoft Aria","Google US English"],pitch:.95,rate:.86};
const CHIPV={accent:"american",names:["Aaron","Tom","Evan","Nathan","Alex","Microsoft Guy","Google US English"],pitch:1.15,rate:1.2};
async function fetchCached(fn,key,ttl){ try{ if(key==="sp"?(!spCache||Date.now()-spAt>ttl):(!wxCache||Date.now()-wxAt>ttl)){ const v=await Promise.race([fn(),new Promise(r=>setTimeout(()=>r(null),5000))]); if(v==null) return null; if(key==="sp"){spCache=v;spAt=Date.now();} else {wxCache=v;wxAt=Date.now();} } return key==="sp"?spCache:wxCache; }catch(e){ return null; } }
async function sportsLines(){
  let g=null; if(typeof opts.sports==="function") g=await fetchCached(opts.sports,"sp",10*60e3);
  if(!(g&&g.length)&&typeof opts.sports==="function"&&!opts.cannedFallback) return null;   // live mode: no canned sports
  const lines=[]; if(CHIP.intro.length) lines.push(["host",pick(CHIP.intro)]);
  if(g&&g.length){
    // half mainstream, half obscure: the provider sends one of each when it can; play them in a random order
    const list=g.slice(0,2); if(list.length===2&&R()<.4) list.reverse();
    const n0=lines.length; for(const x of list){ const sc=Number(x.score), os=Number(x.oscore), k=x.state==="in"?"live":x.state==="pre"?"pre":(x.won||sc>os)?"win":"loss";   // 1.25: scores as numbers ("10" beats "3")
      const dt=x.date?new Date(x.date):null, when=dt&&!isNaN(dt)?dt.toLocaleString([],{weekday:"long",hour:"numeric",minute:"2-digit"}):"soon";
      const v={...x,when,detail:(x.detail||"").replace(/(\d)(st|nd|rd|th)\b/g,"$1$2"),league:x.league||"sports"};
      const ok=l=>!/\{\w+\}/.test(l);   // 1.25: a provider with missing fields: skip the game rather than say "{score}"
      if(x.obscure){ const pool=CHIP_OBS[x.state==="in"?"live":x.state==="pre"?"pre":sc===os&&CHIP_OBS.tie.length?"tie":"win"], a=CHIP_OBS.intro.length?fill(pick(CHIP_OBS.intro),v):null, b=pool.length?fill(pick(pool),v):null;
        if(b&&ok(b)){ if(a&&ok(a)) lines.push(["chip",a]); lines.push(["chip",b]); } }
      else { const pool=x.national&&CHIP_NAT[k]&&CHIP_NAT[k].length?CHIP_NAT[k]:CHIP[k]; if(pool.length){ const l=fill(pick(pool),v); if(ok(l)) lines.push(["chip",l]); } } }
    if(lines.length===n0&&CHIP.noData.length) lines.push(["chip",pick(CHIP.noData)]); }
  else if(CHIP.noData.length) lines.push(["chip",pick(CHIP.noData)]);
  if(CHIP.outro.length) lines.push(["chip",pick(CHIP.outro)]);
  return lines;
}
async function weatherLines(){
  const now=new Date(), h=now.getHours();
  const v={time:now.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}).replace(/^0/,""),day:now.toLocaleDateString([],{weekday:"long"})};
  const mood=h<5?"late":h<7?"early":h<11?"morning":h<14?"midday":h<17?"afternoon":h<21?"evening":"late";
  const out=[];
  if(WX.time.length) out.push(fill(pick(WX.time),v));
  if(WX.timeMood[mood]&&WX.timeMood[mood].length) out.push(pick(WX.timeMood[mood]));
  let w=null; if(typeof opts.weather==="function") w=await fetchCached(opts.weather,"wx",20*60e3);
  const fnum=x=>x!=null&&x!==""&&Number.isFinite(+x);
  const wv=w&&fnum(w.temp)?{...v,temp:Math.round(w.temp),cond:w.cond||"doing its thing",place:w.place||"your area",wind:fnum(w.wind)?Math.round(w.wind)+" miles an hour":"who knows"}:null;
  if(!wv&&typeof opts.weather==="function"&&!opts.cannedFallback) return null;   // live mode: no canned weather
  const tabPool=wv?(TAB.withData.length?TAB.withData:WX.withData):(TAB.noData.length?TAB.noData:WX.noData);
  const lines=[["host",out.join(" ")+(tabPool.length?" Here's Tabitha Snatterbean with the weather.":"")]];
  if(tabPool.length){ lines.push(["tab",wv?fill(pick(tabPool),wv):pick(tabPool)]); if(TAB.thanks.length) lines.push(["host",pick(TAB.thanks)]); }
  return lines;
}
const INTERVIEWS=cat("interviews"); const CALLERS={open:[],complaint:[],reply:[],bye:[]}; packs.forEach(p=>{ if(p.callers) for(const k in CALLERS) CALLERS[k].push(...(p.callers[k]||[])); });
const CALL_OK=()=>Object.keys(CALLERS).every(k=>CALLERS[k].length);
const IVQ=[]; const ivRefill=()=>{ const a=[...INTERVIEWS]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } IVQ.push(...a); };
const NEWS={intro:cat2("news","intro"),outro:cat2("news","outro"),none:cat2("news","none"),image:cat2("news","image"),video:cat2("news","video"),photoOnly:cat2("news","photoOnly"),videoOnly:cat2("news","videoOnly"),lead:{},react:{}};
packs.forEach(p=>{ const n=p.news; if(!n) return; for(const k in (n.lead||{})) (NEWS.lead[k]=NEWS.lead[k]||[]).push(...n.lead[k]); for(const k in (n.react||{})) (NEWS.react[k]=NEWS.react[k]||[]).push(...n.react[k]); });
const normName=n=>String(n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const PRON={}; packs.forEach(p=>{ for(const k in (p.pronounce||{})) PRON[normName(k)]=p.pronounce[k]; }); for(const k in (opts.pronounce||{})) PRON[normName(k)]=opts.pronounce[k];
// How to say a first name: the person's own Slack pronunciation (or a local fix), then the shared dictionary, then as written.
const sayName=n=>(n&&(n.pron||PRON[normName(n.first)]))||(n&&n.first)||"someone";
const CH_SAY={littlevisionaries:"little visionaries","animal-pics":"animal pics"};
const NEWSV={accent:"american",names:["Samantha","Ava","Allison","Microsoft Aria","Google US English"],pitch:1,rate:.98};
async function newsLines(){
  let d=null; if(typeof opts.news==="function") d=await Promise.race([opts.news(),new Promise(r=>setTimeout(()=>r(null),8000))]).catch(()=>null);
  const items=d&&d.items||[]; if(!items.length) return null;
  const now=new Date(), time=now.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}).replace(/^0/,"");
  const lines=[["host",fill(pick(NEWS.intro.length?NEWS.intro:["It's {time}. M D F M Company News."]),{time})]]; let budget=0;
  for(const x of items){ if(!x||!x.who||typeof x.channel!=="string"||(!x.text&&!x.image&&!x.video)) continue;
    const ch=x.channel, chSay=CH_SAY[ch]||ch.replace(/[-_.]/g," "), ini=x.who.initial?` ${x.who.initial}.`:"";
    const lead=pick(NEWS.lead[x.kind]||NEWS.lead.other||["In {channel}, {name} posted:"]);
    let txt=x.text; for(const n of x.names||[]){ if(!n||typeof n.first!=="string") continue; const sp=sayName(n); if(sp!==n.first) txt=txt.replace(new RegExp(`(?<![\\p{L}])${n.first.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![\\p{L}])`,"gu"),sp); }
    const vid=!x.image&&x.video, onlyMedia=!x.text&&(x.image||x.video), ml=onlyMedia?pick((vid?NEWS.videoOnly:NEWS.photoOnly).length?(vid?NEWS.videoOnly:NEWS.photoOnly):["{name} posted something I can't see."]):null;
    if(onlyMedia) lines.push(["news",{say:fill(ml,{name:sayName(x.who)+ini,channel:chSay}),show:fill(ml,{name:x.who.first+ini,channel:"#"+ch})}]);
    else lines.push(["news",{say:`${fill(lead,{name:sayName(x.who)+ini,channel:chSay})} ${txt}`,show:`${fill(lead,{name:x.who.first+ini,channel:"#"+ch})} ${x.text}`}]);
    if(x.image||x.video){ const pool=vid?NEWS.video:NEWS.image; if(pool.length){ const n=(x.image||0)+(x.video||0); const things=vid?(n>1?"videos":"video"):(n>1?"photos":"photo"), num=["","a","two","three","four","five","six"][n]||String(n), athing=`${num} ${things}`;
        lines.push(["news",fill(pick(pool),{n:String(n),things,athing,Athing:athing[0].toUpperCase()+athing.slice(1)})]); } }
    if(x.kind!=="official"&&(NEWS.react[x.kind]||NEWS.react.other||[]).length) lines.push(["host",pick(NEWS.react[x.kind]||NEWS.react.other)]);
    budget+=(txt?String(txt).split(/\s+/).length/2.4:0)+4+(x.image||x.video?4.5:0); if(budget>110) break;   // keep the whole break under about two minutes
  }
  if(lines.length<2) return null;   // nothing readable
  if(NEWS.outro.length) lines.push(["host",pick(NEWS.outro)]);
  return lines;
}
let lastNewsHour=-1, lastTechHour=-1;
/* MedDev tech news on the :30s: what changed in the hub's automations in the past week, one item per automation, about a minute. */
const TECH={intro:cat2("technews","intro"),outro:cat2("technews","outro"),lead:{},react:cat2("technews","react")};
packs.forEach(p=>{ const l=p.technews&&p.technews.lead; if(l) for(const k in l) (TECH.lead[k]=TECH.lead[k]||[]).push(...l[k]); });
const TECHV={accent:"british",names:["Daniel","Arthur","Oliver","Google UK English Male","Microsoft Ryan","Microsoft George"],pitch:1,rate:1.02};
function techDue(){ if(typeof opts.techNews!=="function"||!spotsOn||!TYPES.technews||speaking) return false; const d=new Date(), key=d.getDate()*24+d.getHours(); const m=d.getMinutes(); if(m<30||m>=38||key===lastTechHour) return false; lastTechHour=key; return true; }
async function techLines(){
  let d=null; try{ d=await Promise.race([opts.techNews(),new Promise(r=>setTimeout(()=>r(null),8000))]); }catch(e){}
  const week=Date.now()-7*864e5, all=(d&&d.items||[]).filter(x=>x&&x.title&&(x.when||0)>=week); if(!all.length) return null;
  const by={}; for(const x of all) (by[x.automation||"Other"]=by[x.automation||"Other"]||[]).push(x);
  const groups=Object.values(by).map(g=>g.sort((a,b)=>(b.when||0)-(a.when||0))); for(let i=groups.length-1;i>0;i--){ const j=ri(0,i); [groups[i],groups[j]]=[groups[j],groups[i]]; }
  const time=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}).replace(/^0/,"");
  const lines=[["tech",fill(pick(TECH.intro.length?TECH.intro:["It's {time}. MedDev Tech News."]),{time,n:String(all.length)})]]; let words=12;
  for(const g of groups){ const x=g[ri(0,Math.min(2,g.length-1))], kind=x.event||x.kind||"other";
    const lead=fill(pick(TECH.lead[kind]||TECH.lead.other||["In {app}:"]),{app:x.app||x.automation||"the hub",name:x.who||"someone",status:x.status||""});
    const body=`${lead} ${x.title}.${x.summary&&words<90?" "+String(x.summary).split(/(?<=[.!?])\s/)[0]:""}`;
    const w=body.split(/\s+/).length; if(words+w>150) break; words+=w; lines.push(["tech",body]);
    if(TECH.react.length&&R()<.35&&words<130){ const r=pick(TECH.react); words+=r.split(/\s+/).length; lines.push(["host",r]); } }
  if(TECH.outro.length) lines.push(["tech",pick(TECH.outro)]);
  return lines;
}
function newsDue(){ if(typeof opts.news!=="function"||!spotsOn||!TYPES.news||speaking) return false; const d=new Date(), key=d.getDate()*24+d.getHours(); if(d.getMinutes()>=8||key===lastNewsHour) return false; lastNewsHour=key; return true; }
const PLAYS=cat("plays"), ARTS=cat("arts"), PODS=cat("podcasts"), COOKS=cat("cooking"), HOMES=cat("homerepair"), CARS=cat("garage"); const PLQ=[], ARQ=[], POQ=[], COQ=[], HRQ=[], GAQ=[];
const fromQ=(q,src)=>{ if(!q.length){ const a=[...src]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } q.push(...a); } return q.shift(); };
function showSpot(kind){ if(kind==="play"&&PLAYS.length) return {kind,...fromQ(PLQ,PLAYS)}; if(kind==="arts"&&ARTS.length) return {kind,...fromQ(ARQ,ARTS)};
  if(kind==="podcast"&&PODS.length) return {kind,...fromQ(POQ,PODS)}; if(kind==="cooking"&&COOKS.length) return {kind,...fromQ(COQ,COOKS)}; if(kind==="homerepair"&&HOMES.length) return {kind,...fromQ(HRQ,HOMES)}; if(kind==="garage"&&CARS.length) return {kind,...fromQ(GAQ,CARS)};
  if(kind==="funnelball"&&FB_OK()) return {kind}; if(kind==="showponies"&&SP_OK()) return {kind}; return null; }
/* Funnelball: a made-up sport. Every broadcast is generated: teams, players, plays, scores and commentary. */
const FB={cities:[],mascots:[],first:[],last:[],venues:[],intro:[],plays:[],color:[],close:[],final:[],outro:[]};
packs.forEach(p=>{ const f=p.funnelball; if(f) for(const k in FB) FB[k].push(...(f[k]||[])); });
const FB_OK=()=>Object.keys(FB).every(k=>FB[k].length);   // 1.25: every list, or a pack with a missing one says "undefined"
const FB_PBP={accent:"american",names:["Tom","Aaron","Evan","Microsoft Guy","Google US English"],pitch:.9,rate:1.12};
const FB_COLOR={accent:"southafrican",names:["Tessa","Karen","Moira","Microsoft Leah","Google UK English Female"],pitch:1.05,rate:1.02};
function funnelballLines(){
  const team=()=>{ const city=pick(FB.cities); let m=pick(FB.mascots); return {city,m,name:`${city} ${m}`}; };
  const a=team(); let b=team(); for(let i=0;i<6&&(b.city===a.city||b.m===a.m);i++) b=team();
  const plr=()=>`${pick(FB.first)} ${pick(FB.last)}`, roster={[a.name]:[plr(),plr(),plr()],[b.name]:[plr(),plr(),plr()]};
  const sc={[a.name]:0,[b.name]:0}, f=(s,x)=>s.replace(/\{(\w+)\}/g,(m,k)=>x[k]!=null?x[k]:m);
  const L=[["pbp",f(pick(FB.intro),{a:a.name,b:b.name,venue:pick(FB.venues),q:pick(["second","third","fourth","final"])})]];
  const n=ri(3,5);
  for(let i=0;i<n;i++){ const t=R()<.5?a:b, o=t===a?b:a, pl=pick(FB.plays), pts=pl.pts??ri(1,3); sc[t.name]+=pts;
    const x={p:pick(roster[t.name]),p2:pick(roster[o.name]),t:t.m,o:o.m,n:pts,s:sc[t.name],os:sc[o.name]};
    L.push(["pbp",f(pl.text,x)]); L.push(["pbp",`That's ${pts===1?"one":pts} for ${t.m}. ${t.m} ${sc[t.name]}, ${o.m} ${sc[o.name]}.`]);
    if(R()<.75) L.push(["color",f(pick(FB.color),x)]); }
  const lead=sc[a.name]===sc[b.name]?null:(sc[a.name]>sc[b.name]?a:b);
  if(!lead){ const t=R()<.5?a:b; sc[t.name]+=1; L.push(["pbp",f(pick(FB.close),{t:t.m,p:pick(roster[t.name])})]); }
  const w=sc[a.name]>sc[b.name]?a:b, l=w===a?b:a;
  L.push(["pbp",f(pick(FB.final),{w:w.name,l:l.name,ws:sc[w.name],ls:sc[l.name]})]);
  L.push(["color",pick(FB.outro)]); return L;
}
/* Show Ponies: a serial. A season is one circuit with the same six ponies, three judges and running points over five episodes
   (four classes, then a double-points finale). The season is kept in localStorage when there is one, so the story carries on between launches. */
const SP={host:[],circuits:[],venues:[],towns:[],titles:[],firsts:[],lasts:[],coats:[],people:[],surnames:[],quirks:[],judgeLines:[],classes:[],intro:[],newSeason:[],meet:[],recap:[],entry:[],mishaps:[],color:[],scores:[],ask:[],owner:[],owner2:[],results:[],standings:[],standingsTie:[],tease:[],champ:[],champColor:[],outro:[]};
packs.forEach(p=>{ const s=p.showponies; if(s) for(const k in SP) SP[k].push(...(s[k]||[])); });
const SP_ANN={accent:"british",names:["Daniel","Arthur","Oliver","Google UK English Male","Microsoft Ryan","Microsoft George"],pitch:.95,rate:1};
const SP_COLOR={accent:"american",names:["Samantha","Allison","Ava","Susan","Microsoft Aria","Google US English"],pitch:1.1,rate:1.05};
const SP_KEY="mdfm.showponies.v1", SP_EPS=5, SP_OK=()=>SP.firsts.length&&SP.classes.length&&SP.people.length&&SP.surnames.length&&SP.quirks.length&&SP.judgeLines.length;
let SEASON=null;
const spLoad=()=>{ try{ const s=JSON.parse(globalThis.localStorage.getItem(SP_KEY)); return s&&s.v===1&&Array.isArray(s.field)&&s.field.length>=4&&Array.isArray(s.plan)&&s.plan.length&&Array.isArray(s.judges)&&s.judges.length===3?s:null; }catch{ return null; } };
const spSave=s=>{ try{ globalThis.localStorage.setItem(SP_KEY,JSON.stringify(s)); }catch{} };
const spShuf=a=>{ a=[...a]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const spNum=n=>n%1?`${Math.floor(n)} and a half`:String(n), spPts=n=>`${n} point${n===1?"":"s"}`;
function spNewSeason(n){
  const used=new Set(), uniq=fn=>{ let v; for(let i=0;i<25;i++){ v=fn(); if(!used.has(v)) break; } used.add(v); return v; };
  const js=spShuf(SP.surnames).slice(0,3), sur=SP.surnames.length>6?SP.surnames.filter(x=>!js.includes(x)):SP.surnames;   // judges never share a surname with an owner
  const person=()=>uniq(()=>`${pick(SP.people)} ${pick(sur)}`), qs=spShuf(SP.quirks), nums=spShuf(Array.from({length:98},(_,i)=>i+2));
  const field=Array.from({length:6},(_,i)=>{ const short=uniq(()=>pick(SP.firsts));
    return {pony:`${R()<.55&&SP.titles.length?pick(SP.titles)+" ":""}${short}${R()<.65&&SP.lasts.length?" "+uniq(()=>pick(SP.lasts)):""}`,short,coat:pick(SP.coats)||"pony",town:pick(SP.towns)||"out of town",
      owner:person(),rider:R()<.5?person():"",skill:rr(-1,1),quirk:qs[i%qs.length],pts:0,num:nums[i]}; });
  const jl=spShuf(SP.judgeLines), judges=[0,1,2].map(i=>({name:`Judge ${js[i%js.length]}`,line:jl[i%jl.length]}));
  const fin=SP.classes.find(c=>c.final), plan=[...spShuf(SP.classes.filter(c=>!c.final)).slice(0,SP_EPS-(fin?1:0)).map(c=>c.name),...(fin?[fin.name]:[])], vs=spShuf(SP.venues.length?SP.venues:["the fairgrounds"]);
  return {v:1,n,circuit:pick(SP.circuits)||"Show Pony Circuit",venues:plan.map((_,i)=>vs[i%vs.length]),plan,field,judges,ep:0,last:""};
}
function showPonyEpisode(commit){   // commit=false (tests, previews) leaves the saved season alone
  let s=SEASON||(SEASON=spLoad()); if(s&&!commit) s=JSON.parse(JSON.stringify(s));
  if(!s||s.ep>=s.plan.length) s=spNewSeason(((s&&s.n)||0)+1);
  const f=(t,x)=>String(t).replace(/\{(\w+)\}/g,(m,k)=>x[k]!=null?x[k]:m), P=a=>a.length?pick(a):"";
  const ep=s.ep, fin=ep===s.plan.length-1, cls=SP.classes.find(c=>c.name===s.plan[ep])||pick(SP.classes);
  const base={circuit:s.circuit,season:s.n,ep:ep+1,eps:s.plan.length,cls:cls.name,venue:s.venues[ep]||"the fairgrounds"};
  const px=e=>({...base,pony:e.pony,short:e.short,coat:e.coat,town:e.town,owner:e.owner,rider:e.rider||e.owner,num:e.num,costume:pick(cls.costumes||["a pony"])});
  const table=()=>[...s.field].sort((a,b)=>b.pts-a.pts||b.skill-a.skill);
  const L=[["sfx","horse"],["ann",f(P(SP.intro),base)]];
  if(ep===0){ L.push(["color",f(P(SP.newSeason),base)]); for(const e of spShuf(s.field).slice(0,2)) L.push(["color",f(P(SP.meet),{...px(e),about:f(e.quirk.about,px(e))})]); }
  else { const [a,b]=table(); L.push(["color",f(P(SP.recap),{...base,last:s.last||"nothing much happened, which is its own kind of drama",leader:a.short,pts:spPts(a.pts),second:b.short,pts2:spPts(b.pts)})]); }
  L.push(["ann",cls.intro]);
  const ents=fin?table().slice(0,4):spShuf(s.field).slice(0,R()<.35?4:3), res=[]; let moment="";
  for(const e of ents){ const x=px(e); let perf=e.skill+rr(-1.4,1.4);
    L.push(["ann",f(P(SP.entry),x)]);
    if(R()<.3){ L.push(["ann",f(e.quirk.trig,x)]); perf+=e.quirk.mod??rr(-.6,.6); }
    if(R()<.22&&SP.mishaps.length){ const m=pick(SP.mishaps); L.push(["ann",f(m.text,x)]); perf-=1.3; if(!moment) moment=f(m.memory,x); }
    else L.push(["ann",f(pick(perf>=0?cls.good:cls.bad),x)]);
    const sc=s.judges.map(()=>Math.max(1,Math.min(10,Math.round((7+perf*1.2+rr(-.7,.7))*2)/2))), tot=sc[0]+sc[1]+sc[2];
    L.push(["ann",f(P(SP.scores),{...x,j1:s.judges[0].name,j2:s.judges[1].name,j3:s.judges[2].name,s1:spNum(sc[0]),s2:spNum(sc[1]),s3:spNum(sc[2]),t:spNum(tot)})]);
    if(R()<.35){ const j=ri(0,2); L.push(["ann",f(s.judges[j].line,{...x,judge:s.judges[j].name,s:spNum(sc[j])})]); }
    if(R()<.55) L.push(["color",f(P(SP.color),x)]);
    res.push({e,tot,tie:R()}); }
  res.sort((a,b)=>b.tot-a.tot||b.tie-a.tie);
  const lo=res[res.length-1].e; let owner=null;
  if(R()<.55&&SP.ask.length&&SP.owner.length){ const x={...px(lo),jl:pick(s.judges).name}; owner={name:lo.owner,accent:pick(["american","irish","australian","scottish","gloomy","bubbly","cheery"])};
    L.push(["ann",f(pick(SP.ask),x)]); L.push(["owner",f(pick(SP.owner),x)]); if(R()<.5&&SP.owner2.length) L.push(["owner",f(pick(SP.owner2),x)]);
    if(!moment) moment=`${lo.owner} had some things to say about the judging`; }
  L.push(["sfx","applause"]);
  const pts=fin?[10,6,4,2]:[5,3,2,1]; res.forEach((r,i)=>{ r.e.pts+=pts[i]||0; });
  L.push(["ann",f(P(SP.results),{...base,p1:res[0].e.pony,t1:spNum(res[0].tot),p2:res[1].e.pony,p3:res[2].e.pony})]);
  if(fin){ const c=table()[0]; L.push(["ann",f(P(SP.champ),{...px(c),pts:spPts(c.pts)})]); L.push(["color",f(P(SP.champColor),{...base,next:s.n+1})]); }
  else { const [a,b]=table(); L.push(["color",f(P(a.pts===b.pts&&SP.standingsTie.length?SP.standingsTie:SP.standings),{leader:a.short,pts:spPts(a.pts),second:b.short,pts2:spPts(b.pts)})]);
    L.push(["ann",f(P(SP.tease),{...base,next:s.plan[ep+1],nextVenue:s.venues[ep+1],left:s.plan.length-ep-1===1?"one episode":`${s.plan.length-ep-1} episodes`})]); }
  L.push(["color",P(SP.outro)]);
  s.ep++; s.last=moment||`${res[0].e.short} won the ${cls.name}`;
  if(commit){ SEASON=s; spSave(s); }
  return {lines:L.filter(l=>l[1]!==""),owner,ep:ep+1,eps:s.plan.length,cls:cls.name,circuit:s.circuit,season:s.n};
}
const part=k=>packs.flatMap(p=>(p.adParts&&p.adParts[k])||[]);
const AP={owner:part("owner"),kind:part("kind"),pitch:part("pitch"),turn:part("turn"),backdown:part("backdown")}; const AP_OK=Object.values(AP).every(a=>a.length);
function genAd(){ if(!AP_OK) return pick(ADS); const b=`${pick(AP.owner)} ${pick(AP.kind)}`; return `${b}. ${pick(AP.pitch)}, ${pick(AP.turn)}. ${pick(AP.backdown)}. ${b}.`; }
const QUEUE=[]; const refill=()=>{ const a=[...ADS]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } QUEUE.push(...a); };
/* Content types listeners can switch off (music always plays). */
const TYPE_KEYS=["meters","ids","stingers","ads","interviews","callers","weather","sports","plays","arts","podcast","cooking","homerepair","garage","funnelball","showponies","technews","news"];
const TYPES={}; for(const k of TYPE_KEYS) TYPES[k]=!(opts.types&&opts.types[k]===false);
const KIND_TYPE={id:"ids",ad:"ads",interview:"interviews",caller:"callers",weather:"weather",sports:"sports",play:"plays",arts:"arts",podcast:"podcast",cooking:"cooking",homerepair:"homerepair",garage:"garage",funnelball:"funnelball",showponies:"showponies",technews:"technews",news:"news"};
function nextSpot(){ spotCount++;
  if(TYPES.ids&&LATE.length&&spotCount>2&&R()<.12) return {kind:"id",late:1,text:say(pick(LATE))};
  const showOk=spotCount>1&&ctx&&ctx.currentTime-lastShow>720;   // at most one play or arts piece every 12 minutes
  if(showOk&&TYPES.plays&&R()<.14&&PLAYS.length) return showSpot("play");
  if(showOk&&TYPES.arts&&R()<.16&&ARTS.length) return showSpot("arts");
  if(showOk&&TYPES.podcast&&R()<.14&&PODS.length) return showSpot("podcast");
  if(showOk&&TYPES.cooking&&R()<.14&&COOKS.length) return showSpot("cooking");
  if(showOk&&TYPES.homerepair&&R()<.14&&HOMES.length) return showSpot("homerepair");
  if(showOk&&TYPES.garage&&R()<.14&&CARS.length) return showSpot("garage");
  const opts2=[["interviews",.17,INTERVIEWS.length],["callers",.07,CALL_OK()],["weather",.10,WX.time.length||TAB.noData.length],["sports",.09,CHIP.noData.length],["funnelball",.06,FB_OK()],["showponies",.06,SP_OK()],["ids",.15,IDS.length],["ads",.42,ADS.length||AP_OK]]
    .filter(([k,w,n])=>TYPES[k]&&n);
  if(!opts2.length) return null;   // everything switched off: just music
  let r=R()*opts2.reduce((a,o)=>a+o[1],0), k=opts2[0][0]; for(const o of opts2){ if((r-=o[1])<=0){ k=o[0]; break; } }
  if(k==="callers") return callerSegment();
  if(k==="interviews"){ if(!IVQ.length) ivRefill(); const iv=IVQ.shift(); return {kind:"interview",title:iv.title,guest:iv.guest,guest2:iv.guest2,lines:iv.lines}; }
  if(k==="weather") return {kind:"weather"};
  if(k==="sports") return {kind:"sports"};
  if(k==="funnelball") return {kind:"funnelball"};
  if(k==="showponies") return {kind:"showponies"};
  if(k==="ids") return {kind:"id",text:say(pick(IDS))};
  if(!ADS.length||(R()<.3&&AP_OK)) return {kind:"ad",text:genAd()};
  if(!QUEUE.length) refill(); return {kind:"ad",text:QUEUE.shift()}; }

let voice=null;
const HAS_TTS=typeof window!=="undefined"&&"speechSynthesis" in window;
/* Voices people can follow. The singing, bubbling and warbling system voices (Good News, Bad News, Cellos, Bubbles...)
   and the whisper are for novelty moments only: a cast asks for one with novelty:true. Everything else gets a clear,
   everyday voice, even when a script asks for a "gloomy" or "bubbly" accent. Robot voices are fine: they're MDFM's brand. */
const HARD_VOICE=/^(Bad News|Good News|Cellos|Organ|Pipe Organ|Bells|Superstar|Jester|Bubbles|Boing|Wobble|Bahh|Hysterical|Deranged|Whisper)\b/i;
const CLEAR_FOR={gloomy:"british",cheery:"american",bubbly:"australian",whisper:"american"};
const clearSpec=spec=>{ if(!spec||spec.novelty) return spec||{}; const names=(spec.names||[]).filter(n=>!HARD_VOICE.test(n)); return CLEAR_FOR[spec.accent]?{...spec,accent:CLEAR_FOR[spec.accent],names}:{...spec,names}; };
const clearVoice=v=>v&&!HARD_VOICE.test(v.name);
function pickVoice(){ if(!HAS_TTS) return null; const vs=speechSynthesis.getVoices(); if(!vs.length) return null;
  const en=vs.filter(v=>/^en/i.test(v.lang)&&clearVoice(v));
  return en.find(v=>/\bFred\b/i.test(v.name))||en.find(v=>/Ralph|Zarvox|Trinoids/i.test(v.name))||en.find(v=>/Google US English|David|Alex|Daniel/i.test(v.name))||en[0]||vs[0]; }
if(HAS_TTS){ speechSynthesis.addEventListener?.("voiceschanged",()=>{ voice=pickVoice(); }); voice=pickVoice(); }
/* Accents map to system voices: by name first (macOS/Windows/Chrome names), then by language region. */
const ACCENTS={
  american:{names:["Samantha","Alex","Aaron","Nicky","Allison","Ava","Tom","Google US English","Microsoft Guy","Microsoft Aria","Microsoft David","Microsoft Zira"],lang:"en-us"},
  british:{names:["Daniel","Arthur","Oliver","Serena","Kate","Martha","Google UK English Male","Google UK English Female","Microsoft George","Microsoft Hazel","Microsoft Ryan","Microsoft Sonia"],lang:"en-gb"},
  australian:{names:["Karen","Lee","Catherine","Gordon","Microsoft Natasha","Microsoft William"],lang:"en-au"},
  irish:{names:["Moira","Microsoft Emily","Microsoft Connor"],lang:"en-ie"},
  scottish:{names:["Fiona"],lang:"en-gb"},
  indian:{names:["Rishi","Veena","Isha","Sangeeta","Microsoft Heera","Microsoft Ravi","Microsoft Neerja","Microsoft Prabhat"],lang:"en-in"},
  southafrican:{names:["Tessa","Microsoft Leah","Microsoft Luke"],lang:"en-za"},
  robot:{names:["Zarvox","Trinoids","Ralph","Fred","Albert"]},
  whisper:{names:["Whisper"]},
  gloomy:{names:["Bad News","Organ","Cellos"]},
  cheery:{names:["Good News","Superstar","Jester"]},
  bubbly:{names:["Bubbles","Boing","Wobble"]},
  kid:{names:["Junior","Kathy"]},
};
function voiceFor(spec){
  if(!HAS_TTS) return null; const nov=!!(spec&&spec.novelty); spec=clearSpec(spec); const vs=speechSynthesis.getVoices().filter(v=>nov||clearVoice(v)); const a=ACCENTS[spec.accent]||{};
  for(const n of [...(spec.names||[]),...(a.names||[])]){ const v=vs.find(v=>v.name===n||v.name.startsWith(n+" ")||v.name.startsWith(n+" (")); if(v) return v; }
  if(a.lang){ const v=vs.find(v=>(v.lang||"").replace("_","-").toLowerCase().startsWith(a.lang)); if(v) return v; }
  return null;
}
const isRobo=v=>v&&/Fred|Ralph|Zarvox|Trinoids|Albert/i.test(v.name);
function hostCast(){ voice=voice||pickVoice(); return {voice, pitch:isRobo(voice)?1:.15, rate:isRobo(voice)?.95:.92}; }
function guestCast(spec,host){
  const v=voiceFor(spec||{});
  if(v&&(!host.voice||v.name!==host.voice.name)) return {voice:v,pitch:spec&&spec.novelty?spec.pitch??1:Math.max(.85,Math.min(1.2,spec.pitch??1)),rate:spec.rate??1};
  // no distinct voice on this machine: same voice, clearly different pitch/speed
  // (kept close to natural so it stays easy to follow; only a novelty cast goes far from it)
  const nov=spec&&spec.novelty, cl=(x,a,b)=>nov?x:Math.max(a,Math.min(b,x));
  return {voice:host.voice, pitch:cl((spec&&spec.pitch)||rr(.9,1.9),.85,1.2), rate:cl((spec&&spec.rate)||rr(.85,1.2),.9,1.1)};
}
function fadeTo(p,v,dur,t){ p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); p.linearRampToValueAtTime(v,t+dur); }
function speak(text,done,cast,shown){
  let finished=false; const g=gen; const fin=()=>{ if(finished) return; finished=true; voiceSrc=null; done(); };
  if(text==null||!String(text).trim()){ setTimeout(fin,0); return; } text=String(text);   // 1.25: a missing line never sticks the station in a break
  const c=cast||hostCast(); emit("caption",{text:shown||text,who:(c&&c.who)||"DJ"});
  // The app can render each line to audio (macOS voices) so it plays through the volume, EQ, meters and visualizer.
  if(typeof opts.tts==="function"&&ctx&&voiceIn){
    const spec={text,voice:c.voice?c.voice.name:(c.voiceName||null),rate:c.rate||1,pitch:c.pitch==null?1:c.pitch};
    Promise.race([opts.tts(spec),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))])
      .then(buf=>ctx.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)))
      .then(ab=>{ if(!on||g!==gen){ fin(); return; } const src=ctx.createBufferSource(); src.buffer=ab; let dst=c.phone?phoneLine():voiceIn; if(c.vol!=null&&c.vol!==1){ const vg=G(c.vol); vg.connect(dst); dst=vg; } src.connect(dst); voiceSrc=src;
        src.onended=fin; src.start(ctx.currentTime+.02); setTimeout(fin,ab.duration*1000+2500); })
      .catch(()=>{ if(!on||g!==gen){ fin(); return; } systemSpeak(text,fin,c); });   // 1.25: not over the next station
    return;
  }
  systemSpeak(text,fin,c);
}
/* Callers sound like they're on the phone: band-limited (high-pass and low-pass), a nasal bump and a little distortion. */
let PHONE_SAT=null;   // built once, shared by every caller line
function phoneLine(){
  const hp=filt("highpass",420,.9), hp2=filt("highpass",380,.7), bump=filt("peaking",1600,1.2), lp=filt("lowpass",3300,.9), lp2=filt("lowpass",3600,.7);
  bump.gain.value=5; const sh=ctx.createWaveShaper(); sh.curve=PHONE_SAT||(PHONE_SAT=shaper(3.2)); osv(sh,"2x"); const out=G(.25);   // 1.14: was drive 1.6, out .85, which made callers 8-16 dB louder than the host; now 1-5 dB under it
  hp.connect(hp2).connect(bump).connect(G(.7)).connect(sh).connect(lp).connect(lp2).connect(out).connect(voiceIn);
  return hp;
}
function systemSpeak(text,fin,c){
  if(!HAS_TTS){ setTimeout(fin,Math.min(20000,text.length*70)); return; }
  const u=new SpeechSynthesisUtterance(text); if(c.voice) u.voice=c.voice;
  u.pitch=c.pitch; u.rate=c.rate; u.volume=Math.max(0,Math.min(1,(opts.volume??1)*(c.vol??1)));   // system speech can't be EQ'd, but it follows the volume
  u.onboundary=()=>{ voicePulse=1; }; u.onend=fin; u.onerror=fin; setTimeout(fin,Math.min(32000,3000+text.length*120));
  if(speechSynthesis.speaking||speechSynthesis.pending) speechSynthesis.cancel();   // a cancel right before speak drops the line on iPhone
  speechSynthesis.speak(u);
}
function speakLines(lines,cast,done){
  let i=0; const g=gen; const next=()=>{ if(!on||g!==gen||i>=lines.length){ done(); return; } const [who,text]=lines[i++];
    if(who==="pause"){ setTimeout(next,+text||1000); return; }
    if(who==="sfx"||who==="organ"){ const f=(who==="sfx"?OT:ORGAN)[text]; if(!f){ next(); return; }
      if(who==="sfx") emit("caption",{who:"SFX",text:`(${CUE_LABEL[text]||text})`});
      const d=f(otBus(),ctx.currentTime+.05); setTimeout(next,Math.max(300,d*(who==="organ"?950:800))); return; } const two=text&&typeof text==="object"&&!Array.isArray(text);   // {say, show}: spoken words vs caption (names said one way, spelled another)
    speak(say(two?text.say:text),()=>setTimeout(next,rr(220,520)),{...(cast[who]||cast.host),who:cast.names&&cast.names[who]||(who==="host"?"DJ":who)},two?text.show:undefined); };
  next();
}
function callerSegment(){
  const C=CALLERS, accent=pick(["american","british","australian","irish","scottish","indian","southafrican","bubbly","kid","gloomy"]);
  return {kind:"interview",title:"Caller",guest:{accent},lines:[["host",pick(["We've got a caller. Go ahead, you're on M D F M.","Phone lines are open. You're on the air.","Caller, you're on M D F M H D. What's on your mind?"])],
    ["guest",pick(C.open)],["guest",`I just wanted to say ${pick(C.complaint)}.`],["host",pick(C.reply)],["guest",pick(C.bye)],["host",pick(["Thanks for calling.","Okay.","We'll be right back.","Click."])]]};
}
function voiceSting(){
  if(!on||speaking||!VSTING.length||station!=="mdfm") return; speaking=true; const g=gen, line=say(pick(VSTING)), t=ctx.currentTime+.05; emit("spot",{kind:"stinger",text:line});
  fadeTo(musicDuck.gain,.35,.4,t); const len=pick(STINGS)(t);
  setTimeout(()=>{ if(g!==gen) return; speak(line,()=>{ if(g!==gen) return; fadeTo(musicDuck.gain,1,1,ctx.currentTime+.1); speaking=false; }); },Math.max(300,len*500));
}
/* Recording a break for Save: every break (show, weather, ad...) is recorded off recIn from its first sting until the
   music is back, so Save can hand over the whole thing even when pressed halfway. Voices are only in the recording when
   the app renders them as audio (opts.tts); the browser's own speech can't be captured. Up to 15 minutes. */
const SHOW_NAME={weather:"Weather with Tabitha Snatterbean",sports:"Sports with Chip Nitro",news:"Company News",technews:"MedDev Tech News",funnelball:"Funnelball",showponies:"Show Ponies",play:"Golden Age Radio Hour",arts:"Arts and Culture",interview:"Interview",ad:"Ad break",id:"Station ID"};
function breakInfo(sp){ if(sp.kind==="cluk") return {kind:"cluk",station:"cluk",show:sp.show,episode:String(sp.title||""),title:sp.title&&sp.title!==sp.show?`${sp.show}: ${sp.title}`:sp.show,hosts:sp.hosts||""};
  if(sp.kind==="hearye") return {kind:"hearye",station:"hearye",show:sp.show,episode:String(sp.title||""),title:sp.title&&sp.title!==sp.show?`${sp.show}: ${sp.title}`:sp.show,hosts:sp.hosts||""};
  if(sp.kind==="ptlk") return {kind:"ptlk",station:"ptlk",show:sp.show,episode:String(sp.title||""),title:sp.title?`${sp.show}: ${sp.title}`:sp.show,hosts:sp.hosts||""};
  const call=sp.kind==="interview"&&sp.title==="Caller", show=sp.show||(call?"Call-in":SHOW_NAME[sp.kind])||"Station break";
  const ep=sp.kind==="ad"||sp.kind==="id"||call||!sp.title||sp.title===show?"":String(sp.title); return {kind:sp.kind,show,episode:ep,title:ep?`${show}: ${ep}`:show}; }
function recStart(sp){ recStop(true); if(!ctx||!recIn||typeof ctx.createScriptProcessor!=="function") return;
  const node=ctx.createScriptProcessor(4096,2,2), sink=G(0), r={sp,node,sink,chunks:[[],[]],n:0,sr:ctx.sampleRate,live:true,voiced:typeof opts.tts==="function",waiters:[]};
  node.onaudioprocess=e=>{ if(!r.live||r.n>r.sr*900) return; for(let c=0;c<2;c++) r.chunks[c].push(new Float32Array(e.inputBuffer.getChannelData(Math.min(c,e.inputBuffer.numberOfChannels-1)))); r.n+=e.inputBuffer.length; };
  recIn.connect(node); node.connect(sink).connect(ctx.destination); REC=r; }
function recStop(abort){ const r=REC; if(!r) return; REC=null; r.live=false; node0(r);
  if(abort){ r.waiters.forEach(w=>w.rej(Object.assign(new Error("The break stopped before it ended."),{code:"stopped"}))); return; }
  if(!r.waiters.length) return; let buf=null; try{ buf=recBuffer(r); }catch(e){ r.waiters.forEach(w=>w.rej(e)); return; } const info=breakInfo(r.sp); r.waiters.forEach(w=>w.res({buffer:buf,info})); }
function node0(r){ r.node.onaudioprocess=null; try{ recIn.disconnect(r.node); }catch(e){} try{ r.node.disconnect(); r.sink.disconnect(); }catch(e){} }
function recBuffer(r){ const n=Math.max(1,r.n), b=new AudioBuffer({length:n,numberOfChannels:2,sampleRate:r.sr});
  for(let c=0;c<2;c++){ const d=b.getChannelData(c); let o=0; for(const ch of r.chunks[c]){ if(o+ch.length>n){ d.set(ch.subarray(0,n-o),o); break; } d.set(ch,o); o+=ch.length; }
  }
  // even it out: peak to -1 dBFS (the live station sits under the volume knob, this doesn't), fade the last half second
  let pk=0; for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(d[i])); }
  const g=pk>1e-4?.89/pk:1, f=Math.min(n,Math.floor(r.sr*.5)); for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<n;i++) d[i]*=g*(i>n-f?(n-i)/f:1); }
  return b; }
function forcedSpot(k){   // spotNow(kind) for kinds that need their text picked here
  if(k==="id") return IDS.length?{kind:"id",text:say(pick(IDS))}:null;
  if(k==="caller") return CALL_OK()?callerSegment():null;   // these two need their lines picked too: a bare {kind} had none and ended the break silently
  if(k==="interview"){ if(!INTERVIEWS.length) return null; if(!IVQ.length) ivRefill(); const iv=IVQ.shift(); return {kind:"interview",title:iv.title,guest:iv.guest,guest2:iv.guest2,lines:iv.lines}; }
  if(k==="ad"){ if(!ADS.length&&!AP_OK) return null; if(!ADS.length||(R()<.3&&AP_OK)) return {kind:"ad",text:genAd()}; if(!QUEUE.length) refill(); return {kind:"ad",text:QUEUE.shift()}; }
  return {kind:k}; }
function spot(force,pre){
  if(!on||speaking||!spotsOn||station!=="mdfm") return;
  if(force&&KIND_TYPE[force]&&!TYPES[KIND_TYPE[force]]) return;   // switched off in Settings
  const sp=pre||(force?(showSpot(force)||forcedSpot(force)):nextSpot()); if(!sp) return;
  if(pre&&!TYPES[sp.title==="Caller"?"callers":KIND_TYPE[sp.kind]]) return;   // picked at the song change, switched off since
  speaking=true; lastSpot=ctx.currentTime; const g=gen; recStart(sp); const myRec=REC;   // g: this start/stop session; a stop (or stop and start) retires the break
  const show=sp.kind==="play"||sp.kind==="arts"||sp.kind==="podcast"||sp.kind==="cooking"||sp.kind==="homerepair"||sp.kind==="garage", ad=sp.kind==="ad", iv=sp.kind==="interview"||sp.kind==="weather"||sp.kind==="sports"||sp.kind==="news"||sp.kind==="technews"||sp.kind==="funnelball"||sp.kind==="showponies"||show, t=ctx.currentTime+.05; emit("spot",sp);
  fadeTo(musicDuck.gain,show?.0001:ad||iv?.02:.2,ad||iv?1.2:.6,t);
  const st0=ad||iv?.9:.25, len=pick(STINGS)(t+st0);
  let lead=st0+len*.75+(sp.late?rr(3.2,4.5):0);
  if(ad){ bed=startBed(t+st0+len*.65); lead+=.7; }
  if(iv){ bed=startBed(t+st0+len*.65,sp.kind==="play"?"organ":sp.kind==="arts"||sp.kind==="cooking"?"arts":true); lead+=.5; }
  const t0spot=ctx.currentTime; if(show) lastShow=t0spot;
  let ended=false; const after=()=>{ if(ended||g!==gen) return; ended=true; lastSpot=ctx.currentTime; const talk=lastSpot-t0spot;   // music-weighted: ~2 songs after a short break, 3-4 after a long one
    nextGap=talk>40?rr(160,240)+talk*.5:rr(100,170);
    if(!on){ speaking=false; return; }
    const t2=ctx.currentTime+.15; let back=.4; const endRec=()=>setTimeout(()=>{ if(REC&&REC===myRec) recStop(); },(back+2.2)*1000);
    if(bed){ endBed(bed,t2); bed=null; back=1.4; }
    if(!ad||R()<.5){ const l2=pick(STINGS)(t2+back); back+=l2*.6; }
    fadeTo(musicDuck.gain,1,1.6,t2+back); speaking=false; endRec(); };
  setTimeout(()=>{ if(g!==gen) return; try{
    if(sp.kind==="news"){ newsLines().catch(()=>null).then(lines=>{ if(g!==gen) return;
        if(!lines){ after(); return; }   // nothing new in Slack: straight back to the music
        sp.lines=lines; sp.text=lines.map(l=>typeof l[1]==="object"?l[1].show:l[1]).join(" "); emit("spot",sp); const host=hostCast();
        speakLines(lines,{host,news:guestCast(NEWSV,host),names:{host:"DJ",news:"Company News"}},after); }).catch(after); return; }
    if(sp.kind==="technews"){ techLines().catch(()=>null).then(lines=>{ if(g!==gen) return; if(!lines){ after(); return; }
        sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast(); speakLines(lines,{host,tech:guestCast(TECHV,host),names:{host:"DJ",tech:"MedDev Tech News"}},after); }).catch(after); return; }
    if(sp.kind==="weather"||sp.kind==="sports"){ (sp.kind==="weather"?weatherLines():sportsLines()).catch(()=>null).then(lines=>{ if(g!==gen) return;
        if(!lines){ if(!TYPES.ids||!IDS.length){ after(); return; } const id={kind:"id",text:say(pick(IDS))}; emit("spot",id); speak(id.text,after); return; }
        sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast();
        speakLines(lines,{host,tab:guestCast(TABITHA,host),chip:guestCast(CHIPV,host),names:{host:"DJ",tab:"Tabitha Snatterbean",chip:"Chip Nitro"}},after); }).catch(after); return; }
    if(sp.kind==="play"){ const host=hostCast(), cast={host,names:{host:"DJ"}};
      for(const [k,c] of Object.entries(sp.cast||{})){ cast[k]={...guestCast(c,host),phone:!!c.phone}; cast.names[k]=c.name||k; }
      speakLines([["host",`And now, the M D F M Golden Age Radio Hour. ${sp.title}. Tonight: ${sp.episode||"a new episode"}.`],...sp.lines,["host",pick(["You've been listening to the M D F M Golden Age Radio Hour. Back to the beats.","That was the Golden Age Radio Hour. None of those products exist. Please stop asking.","Golden Age Radio Hour, everybody. They don't make them like that anymore. For legal reasons."])]],cast,after); return; }
    if(sp.kind==="arts"){ const host=hostCast(), wren=guestCast(ARTS_HOST,host), cast={host:wren,dj:host,names:{host:"Wren Applewhite-Dunst",dj:"DJ"}};
      for(const k of ["reporter","subject","subject2"]) if(sp[k]){ cast[k]=guestCast(sp[k],wren); cast.names[k]=(k==="reporter"?sp[k].name:sp[k].name)||k; }
      speakLines([["dj","M D F M Arts and Culture. Here's Wren."],["host",`This is M D F M Arts and Culture. I'm Wren Applewhite-Dunst.`],["pause",700],...sp.lines,["host",pick(["This is M D F M Arts. Thank you for listening slowly.","For M D F M Arts and Culture, I'm Wren Applewhite-Dunst. Breathe in. Okay, that's enough.","I'm Wren Applewhite-Dunst. Art is everywhere. Mostly in the way."])]],cast,after); return; }
    if(sp.kind==="funnelball"){ const lines=funnelballLines(); sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast();
      speakLines([["host",pick(["Time for Funnelball on M D F M.","It's Funnelball time. I still don't know the rules.","M D F M Funnelball, presented by nobody."])],...lines],{host,pbp:guestCast(FB_PBP,host),color:guestCast(FB_COLOR,host),names:{host:"DJ",pbp:"Duke Ransom",color:"Lorna Pike"}},after); return; }
    if(sp.kind==="showponies"){ const e=showPonyEpisode(true), lines=e.lines; sp.lines=lines; sp.title=`${e.circuit}, episode ${e.ep} of ${e.eps}: ${e.cls}`; sp.text=lines.filter(l=>l[0]!=="sfx").map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast();
      speakLines([["host",SP.host.length?pick(SP.host):"Show ponies, on M D F M."],...lines],{host,ann:guestCast(SP_ANN,host),color:guestCast(SP_COLOR,host),owner:guestCast(e.owner||{accent:"american"},host),names:{host:"DJ",ann:"Pembroke Vance",color:"Darlene Tuttle",owner:e.owner?e.owner.name:"Owner"}},after); return; }
    if(sp.kind==="podcast"||sp.kind==="cooking"||sp.kind==="homerepair"||sp.kind==="garage"){ const host=hostCast(), cast={dj:host,names:{dj:"DJ"}};
      for(const [k,c] of Object.entries(sp.cast||{})){ cast[k]={...guestCast(c,host),phone:!!c.phone}; cast.names[k]=c.name||k; }
      cast.host=cast[Object.keys(sp.cast||{})[0]]||host;
      const OPENX={homerepair:[["dj",`M D F M Home and Garden presents ${sp.show}. Today: ${sp.title}.`]],garage:[["dj",`Car trouble? Please don't call these guys. It's ${sp.show}. Today: ${sp.title}.`],["pause",400]]};
      const CLOSEX={homerepair:["That was Fixer Downer. M D F M does not recommend anything Gary did.","Fixer Downer, everybody. Please call a licensed professional. Gary is not one.","That was Fixer Downer. If Gary is at your door, do not open it."],garage:["That was Gasket Case. Get your car looked at by a real mechanic.","Gasket Case, everybody. The goose is fine.","That was Gasket Case. No cars were fixed during this broadcast."]};
      const open=OPENX[sp.kind]||(sp.kind==="podcast"?[["dj",`M D F M presents a podcast we did not ask for. ${sp.show}. ${sp.title}.`]]:[["dj",`And now, from M D F M Public Radio, ${sp.show}.`],["pause",600]]);
      const close=sp.kind==="podcast"?pick(["That was a podcast. We're legally required to say it was a podcast.","Like, subscribe, and please stop sending us protein powder.","M D F M does not endorse the grindset. Back to the music."]):pick(["Simmer Down is made possible by listeners like you, and by butter.","That was Simmer Down. Please don't call in about the recipes.","Simmer Down, everybody. Back to the beats."]);
      speakLines([...open,...sp.lines,["dj",CLOSEX[sp.kind]?pick(CLOSEX[sp.kind]):close]],cast,after); return; }
    if(iv){ const host=hostCast(); speakLines(sp.title==="Caller"?sp.lines:[["host",`M D F M interview. Today: ${sp.title}.`],...sp.lines],{host,guest:{...guestCast(sp.guest,host),phone:sp.title==="Caller"},guest2:guestCast(sp.guest2||{accent:"british"},host),names:{host:"DJ",guest:sp.title,guest2:"Guest"}},after); }
    else speak(sp.text,after); }catch(e){ after(); } }, lead*1000);   // a bad line or pack never leaves the station stuck mid-break
}


// skip on MDFM: the next song comes in over the last bars of this one. Pressed during that crossfade (1.25): finish the
// crossfade instead, so the song fading in isn't skipped too
function mdfmSkip(){ const live=songs.find(s=>!s.handed), out=songs.filter(s=>s.handed&&!s.done);
  if(on&&ctx&&live&&out.length&&live.step<64){ const t=ctx.currentTime;
    for(const s of out){ fadeTo(s.bus.gain,.0001,.8,t); fadeTo(s.rvf.gain,.0001,.8,t); s.done=true; s.endT=t+1; }
    fadeTo(live.bus.gain,live.st.lvl||1,.8,t); fadeTo(live.rvf.gain,1,.8,t); return; }
  for(const s of songs) if(!s.handed) s.step=Math.max(s.step,(s.bars-4)*16-1); }
/* ---------- public API ---------- */
/* iPhone and iPad only let a page start speech from a tap. One silent line during the SOUND press unlocks it for the rest of the visit. */
let speechPrimed=false;
/* iPhone and iPad: Web Audio counts as "ambient" sound there, so the ring/silent switch mutes the music while the
   voices (system speech) still play. Asking for "playback" audio (Safari 17+), and keeping a silent <audio> element
   playing (older iOS), makes the station play like any music app, switch or no switch. Only on iOS, and only from the
   SOUND press, since iOS needs a tap to start audio. */
const IS_IOS=typeof navigator!=="undefined"&&(/iPad|iPhone|iPod/.test(navigator.userAgent||"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1));
let iosKeep=null;
function silentWav(){ const n=4000,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,x)=>{ for(let i=0;i<x.length;i++) v.setUint8(o+i,x.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4,36+n*2,true); w(8,"WAVEfmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,8000,true); v.setUint32(28,16000,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40,n*2,true);
  return URL.createObjectURL(new Blob([b],{type:"audio/wav"})); }
function iosPlayback(v){ if(!IS_IOS||typeof document==="undefined") return;
  try{ if(v&&navigator.audioSession) navigator.audioSession.type="playback"; }catch(e){}
  try{ if(!iosKeep){ if(!v) return; iosKeep=document.createElement("audio"); iosKeep.setAttribute("playsinline",""); iosKeep.setAttribute("webkit-playsinline",""); iosKeep.loop=true; iosKeep.src=silentWav(); }
    if(v){ const p=iosKeep.play(); if(p&&p.catch) p.catch(()=>{}); } else iosKeep.pause(); }catch(e){} }
function primeSpeech(){ if(speechPrimed||!HAS_TTS||typeof opts.tts==="function") return; speechPrimed=true; try{ const u=new SpeechSynthesisUtterance(" "); u.volume=0; speechSynthesis.speak(u); }catch(e){} }
/* Stuck audio watchdog: after sleep or a change of speakers/headphones, macOS can leave the AudioContext unable to
   resume (its clock stops: the station "plays" in silence and the EQ goes blank). If the clock hasn't moved shortly after
   SOUND is turned on (or the audio devices change), throw the context away and start again on a fresh one. Only for a
   context the engine made itself, at most once every 8 seconds. */
let lastRebuild=-1e9;
function watchAudio(){ if(opts.audioContext||typeof window==="undefined"||!ctx) return; const c=ctx, t0=c.currentTime, g=gen;
  setTimeout(()=>{ if(!on||gen!==g||ctx!==c||c.currentTime-t0>.25) return; const now=Date.now(); if(now-lastRebuild<8000){ emit("caption",{who:"MDFM",text:"Can't reach the speakers. Check your sound output, then press SOUND again."}); return; } lastRebuild=now; rebuildAudio(); },1600); }
function rebuildAudio(){ const old=ctx; recStop(true); for(const id of STN_IDS) STN[id].kill(); FXW.delete(old); speaking=false; voiceSrc=null;
  ctx=null; try{ old&&old.close&&old.close().catch(()=>{}); }catch(e){} on=false; setOn(true); }
if(typeof navigator!=="undefined"&&navigator.mediaDevices&&typeof navigator.mediaDevices.addEventListener==="function")
  navigator.mediaDevices.addEventListener("devicechange",()=>{ if(on) watchAudio(); });
/* ---------- stations: WYBC 88.1 (Collin's ambient piano, vendor/ambient-soundtrack), MDFM 99.9 HD (everything above)
   and PTLK 108.0 (procedural talk shows, src/talk.js) ----------
   One AudioContext, one volume, EQ, meters and visualizer: every station plays into the TUNE stage (ST.in).
   Switching tunes away: the old station's songs, beds, timers and talk stop and fade, the new one fades in (leaveStation /
   enterStation). Dial order is by frequency and the arrows wrap. Pages remember the choice. */
const STATIONS=[
  {id:"wybc",name:"WYBC 88.1",freq:"88.1",tagline:"Where Ya Been, Collin?!",style:"Ambient piano"},
  {id:"mdfm",name:"MDFM 99.9 HD",freq:"99.9",tagline:"Hip hop, R&B, pop, dance and a DJ set",style:null},
  {id:"ptlk",name:"PTLK 108.0",freq:"108.0",tagline:"All talk. Every show written live.",style:"Talk radio"},
];
STATIONS.splice(1,0,{id:"hearye",name:"HEARYE 95.5",freq:"95.5",tagline:"Renn Faire Radio. The Home of High Drama.",style:"Fantasy"});   // by frequency: 88.1, 95.5, 99.9, 101.1, 108.0
STATIONS.splice(3,0,{id:"ptrn",name:"PTRN 101.1",freq:"101.1",tagline:"PATTERN. Every genre. Your hands on the knobs.",style:"Every genre"});
const AMB=()=>typeof AmbientSoundtrack!=="undefined"?AmbientSoundtrack:(typeof globalThis!=="undefined"&&globalThis.AmbientSoundtrack)||null;
const TALK=typeof createTalk==="function"?createTalk(R):null;   // PTLK's show writer; without it PTLK is skipped
const STATION_TYPES={ wybc:[["ids","The whisper DJ"],["strings","Light strings"],["winds","Bass clarinet and bassoon"],["hall","Far-off concert hall sounds"],["room","Room tone and tape grain"]],
  ptlk:TALK?[...TALK.shows.map(x=>[x.id,x.label]),["ids","Station IDs"]]:[],
  hearye:typeof createFaire==="function"?[...createFaire(Math.random).shows.map(x=>[x.id,x.label]),["joust","The Royal Joust"],["ponies","The Royal Pony Pageant"],["news","Realm news (from Slack)"],["ads","Ads from the merchants"],["callers","Call-ins to the bard"],["ids","The crier and the bard"],["amb","Forest and meadow sounds"]]:[] };
const wybcTypes={ids:true,strings:true,winds:true,hall:true,room:true};
const ptlkTypes=Object.fromEntries(STATION_TYPES.ptlk.map(([k])=>[k,true]));
const stn=id=>typeof id==="string"&&Object.prototype.hasOwnProperty.call(STN,id)?STN[id]:null;   // a station's entry (STN, near the end)
const stationOk=id=>!!(stn(id)&&stn(id).ok());
const AMB_LEVEL=4.2;   // the piece is soft by design (about -27 dB average): this brings it to about 3 dB under MDFM (a quiet station, not a dead one), under the limiter
const PIECES=["Where Ya Been","Porch Light","The Long Way Round","Postcard, Unsent","Night Ferry","Back Before Dark","Small Hours","The Map Room",
  "Quiet Miles","Window Seat","Somewhere Off the Interstate","Left the Light On","Slow Train North","Kitchen at 2 a.m.","Rain on the Map","Pinned, Not Posted"];
// Procedural music, procedural players: every piece gets a made-up artist.
const ART={first:["Elin","Marisol","Teodor","Ines","Callum","Noor","Aurelio","Hanne","Sabine","Rafe","Odile","Lucan","Mirela","Jonas","Thea","Bastian","Ilse","Corwin","Wren","Anouk"],
  last:["Vane","Halloway","Brask","Lindqvist","Moreau","Ashdown","Kestrel","Ferrante","Okafor","Strand","Delacroix","Rowe","Abernathy","Solberg","Marchetti","Quill","Fairweather","Lusk"],
  adj:["Quiet","Late","Slow","Paper","Lantern","Low Tide","Northbound","Small Hours","Porchlight","Wool"],noun:["Ensemble","Players","Chamber Group","Room","Society","Orchestra"]};
function wybcArtist(){ const r=R(); if(r<.6) return `${pick(ART.first)} ${pick(ART.last)}`; if(r<.85) return `${pick(ART.last)} ${pick(["Trio","Quartet","Duo"])}`; return `The ${pick(ART.adj)} ${pick(ART.noun)}`; }
// The whisper DJ: WYBC's only voice. Leans in close every 15-20 minutes, whispers about the station, sometimes says what just played.
const WYBC_WHISPER=[
  ()=>"Shh. You're listening to W Y B C. Eighty eight point one.",
  ()=>"W Y B C. We whisper so the piano can do the talking.",
  ()=>"Eighty eight one. If you can hear this, you're close enough.",
  ()=>"This is the whisper desk at W Y B C. Lights low. Stay a while.",
  ()=>"W Y B C. Where ya been? Doesn't matter. You're here now.",
  ()=>"The piano asked me to say hi. So. Hi. This is W Y B C.",
  ()=>"Eighty eight point one. Nobody's in a hurry here. Not even me.",
  ()=>`It's ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}. W Y B C is still on. So are you.`,
  s=>s?`That was ${s.title}, by ${s.artist}. W Y B C.`:null,
  s=>s?`${s.artist}, playing ${s.title}. Just for you. Don't tell anyone.`:null,
  s=>s?`You're hearing ${s.title}. It's never been played before, and it won't be again. W Y B C.`:null,
];
const WYBC_VOICE={accent:"whisper",names:["Whisper"],pitch:1,rate:.86,novelty:true};   // the whisper DJ is the joke, so it may whisper
const WYBC_SOFT={accent:"american",names:["Ava","Allison","Samantha","Microsoft Aria","Google US English"],pitch:.85,rate:.78};   // no whisper voice on this computer: a soft, slow one
let station="mdfm";   // opts.station is taken once every station is known (near the end)
let amb=null, ambIn=null, wybcT=0, lastPiece="";
const stationInfo=id=>{ const s=STATIONS.find(x=>x.id===id); return s?{...s,available:stationOk(id)}:null; };
function ambSettings(){ const t=wybcTypes, a=ambMul(); return {strings:t.strings?1:0,winds:t.winds?1:0,hall:t.hall?a:0,room:t.room?a:0,grain:t.room?a:0}; }
function ambStart(fadeIn){
  const L=AMB(); if(!L||!ctx) return false;
  if(!ambIn||ambIn.context!==ctx){ ambIn=G(AMB_LEVEL); ambIn.connect(ST?ST.in:master); }
  const out=G(fadeIn?.0001:1); out.connect(ambIn); if(fadeIn) fadeTo(out.gain,1,fadeIn,ctx.currentTime);
  const inst=L.create({context:ctx,destination:out,pauseWhenHidden:false,settings:ambSettings(),mapNote:wybcMapNote});
  amb={inst,out}; try{ const p=inst.start(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} if(MXON.wybc) wybcMixApply();
  let title; do title=pick(PIECES); while(title===lastPiece&&PIECES.length>1); lastPiece=title;
  nowPlaying={station:"wybc",title,style:"Ambient piano",bpm:null,artist:wybcArtist(),key:"D major"}; emit("nowplaying",nowPlaying);
  return true;
}
function ambRetire(a,fade){ if(!a) return; try{ fadeTo(a.out.gain,.0001,fade,ctx.currentTime); }catch(e){}
  setTimeout(()=>{ try{ a.inst.stop(); }catch(e){} setTimeout(()=>{ try{ a.out.disconnect(); }catch(e){} },1500); },fade*1000+100); }
function wybcOn(){ ambStart(1.5); clearTimeout(wybcT); wybcT=setTimeout(wybcId,rr(40,90)*1000); if(MXON.wybc){ wybcMixApply(); wybcMixPump(); } }
function wybcOff(fade){ clearTimeout(wybcT); wybcT=0; clearTimeout(wybcMixT); wybcMixT=0; const a=amb; amb=null; ambRetire(a,fade); }
// A quiet station ID every 15-20 minutes: the piano dips, a calm voice, the piano comes back.
function wybcId(force){
  if(!on||station!=="wybc") return; clearTimeout(wybcT); wybcT=setTimeout(wybcId,rr(15,20)*60e3);
  if(!wybcTypes.ids||speaking) return; const np=nowPlaying&&nowPlaying.station==="wybc"?nowPlaying:null;
  let line=null; for(let i=0;i<8&&!line;i++) line=pick(WYBC_WHISPER)(np); if(!line) return;
  speaking=true; const g=gen, a=amb; emit("spot",{kind:"id",station:"wybc",text:line}); if(a) fadeTo(a.out.gain,.3,1.5,ctx.currentTime);
  const w=voiceFor(WYBC_VOICE), v=w||voiceFor(WYBC_SOFT), sp=w?WYBC_VOICE:WYBC_SOFT;
  const cast={voice:v,voiceName:v?null:"Whisper",pitch:sp.pitch,rate:sp.rate,vol:w?.85:.6,who:"WYBC whisper DJ"};
  setTimeout(()=>{ if(g!==gen||station!=="wybc"){ speaking=false; return; } speak(line,()=>{ if(g!==gen) return; speaking=false; if(amb) fadeTo(amb.out.gain,1,3,ctx.currentTime); },cast); },1600);
}
function hush(){ try{ speechSynthesis.cancel(); }catch(e){} try{ voiceSrc&&voiceSrc.stop(); }catch(e){} speaking=false; }
function leaveStation(id,t){ recStop(true); STN[id].off(1.2,t); }   // tune away: everything that station had going stops and fades
function enterStation(id,t){ STN[id].on(t,false); }
function setStation(id){
  const s=stationInfo(id); if(!s||!s.available||id===station) return station; const was=station; station=id;
  if(on&&ctx){ gen++; const t=ctx.currentTime; hush(); leaveStation(was,t); enterStation(id,t); mxFxSync(id,t); }
  emit("station",stationInfo(station)); return station;
}
function stepStation(d){ const list=STATIONS.filter(s=>stationInfo(s.id).available), i=list.findIndex(s=>s.id===station); return setStation(list[(i+d+list.length)%list.length].id); }
/* PTLK 108.0: 100% procedural talk. src/talk.js writes each episode (cast, lines, sound cues); this plays them back to back
   through speak() (so the app's rendered voices, captions, TUNE and Save all work), with an announcer and the organ between
   shows. Some shows read live headlines or an encyclopedia page through opts.headlines(kind, arg) (the apps provide it);
   without it, or when it's slow, they make their own. Shows remember their running plots (feuds, serials) while the page is open. */
const PTLK_ANN={name:"P T L K announcer",accent:"american",names:["Evan","Tom","Daniel","Aaron","Microsoft Guy","Google US English"],pitch:.86,rate:1.02};
const ptlkState={}, ptlkRecent=[]; let ptlk=null;
const spelled=t=>String(t).replace(/\b[A-Z](?: [A-Z]){2,5}\b/g,m=>m.replace(/ /g,""));   // "P T L K" is how it's said; captions show "PTLK"
/* PTLK music. Every show has its own theme (an opening that carries on softly as a bed under the host's first lines and
   comes back under the sign-off), stingers between segments and a closing hit. Talk radio is mostly newsy and
   high-energy (brass hits, ticker beeps, drum fills, timpani); Cleverly Spillz is West Coast and urban (G-funk whistle,
   808, Rhodes), Button Mashers high-tech (chip arps, zaps), the wizard medieval (lute, recorder, drone, harp), the
   nature show gentle (piano and pad), the serial noir (walking bass, muted brass). Built from MDFM's own instruments and
   played into the same chain as MDFM's stingers, so volume, EQ, TUNE and Save all apply. */
function ptBus(level,key,minor){ const g=G(level); g.connect(pre); const b=makeBus(g,fxRev); b.gain=g; b.mxId="ptlk"; if(key!=null) b.gKey={root:key,sc:minor?AE:MA}; return b; }
const ptS=S=>gOn("ptlk","bpm")?Object.assign(Object.create(S),{bpm:GRV.ptlk.bpm}):S;   // a show's music at the TUNE tempo
const PI={   // a few extra voices for the talk-show music
  pulse(b,t,m,dur,v=1){ const o=osc("sawtooth",mtof(m)),lp=filt("lowpass",1600,2),g=ctx.createGain(); lp.frequency.setValueAtTime(2600,t); lp.frequency.exponentialRampToValueAtTime(500,t+dur);
    env(g,t,.003,.07*v,dur); o.connect(lp); lp.connect(g); g.connect(b.mu); o.start(t); o.stop(t+dur+.05); },
  chip(b,t,m,dur,v=1,duty="square"){ const o=osc(duty,mtof(m)),g=ctx.createGain(),lp=filt("lowpass",5200); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+.004);
    g.gain.setValueAtTime(.045*v,t+Math.max(.01,dur*.8)); g.gain.exponentialRampToValueAtTime(.0001,t+dur); o.connect(lp); lp.connect(g); g.connect(b.mu); o.start(t); o.stop(t+dur+.02); },
  zap(b,t,v=1,hi=2200,lo=140){ const o=osc("square",hi),g=ctx.createGain(),lp=filt("lowpass",3000); o.frequency.setValueAtTime(hi,t); o.frequency.exponentialRampToValueAtTime(lo,t+.2);
    env(g,t,.002,.05*v,.22); o.connect(lp); lp.connect(g); g.connect(b.mu); o.start(t); o.stop(t+.26); },
  flute(b,t,m,dur,v=1){ const f=mtof(m),o=osc("sine",f),o2=osc("triangle",f*2),g=ctx.createGain(),g2=G(.18),lfo=osc("sine",5.2),lg=G(f*.008);
    lfo.connect(lg); lg.connect(o.frequency); o2.connect(g2); g2.connect(g); o.connect(g);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.06*v,t+.05); g.gain.setValueAtTime(.06*v,t+Math.max(.06,dur*.85)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
    const n=nz(t,dur+.1),bp=filt("bandpass",f*2,3),ng=G(.012*v); n.connect(bp); bp.connect(ng); ng.connect(b.mu);
    g.connect(b.mu); to(g,b,.35); for(const x of [o,o2,lfo]){ x.start(t); x.stop(t+dur+.12); } },
  lute(b,t,m,v=1){ const o=osc("triangle",mtof(m)),o2=osc("sawtooth",mtof(m)),lp=filt("lowpass",3200,1.5),g=ctx.createGain(),g2=G(.35);
    lp.frequency.setValueAtTime(3600,t); lp.frequency.exponentialRampToValueAtTime(700,t+.35); env(g,t,.002,.1*v,.6); o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.3);
    o.start(t); o2.start(t); o.stop(t+.7); o2.stop(t+.7); },
  timp(b,t,m,v=1){ D.tom(b,t,v,mtof(m)); const n=nz(t,.5),lp=filt("lowpass",300),g=ctx.createGain(); env(g,t,.004,.12*v,.45); n.connect(lp); lp.connect(g); g.connect(b.dr); },
  roll(b,t,m,dur,v=1){ for(let x=0;x<dur;x+=.045) PI.timp(b,t+x,m,v*(.4+.6*x/dur)); },
};
const SIX=(bpm)=>60/bpm/4;
const chordOf=(k,deg,minor=false)=>{ const sc=minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11], r=sc[deg%7]; return [k+r,k+sc[(deg+2)%7]+((deg+2)>=7?12:0),k+sc[(deg+4)%7]+((deg+4)>=7?12:0)]; };
// high-energy news stingers, shared by most shows
const NEWS_STINGS=[
  (b,t,k)=>{ [[0,0],[.17,3],[.34,4]].forEach(([d,deg],j)=>{ M.brass(b,t+d,chordOf(k,deg),j===2?.9:.1,1); D.kick(b,t+d,j===2?1:.6,.9); }); D.crash(b,t+.34,1); return 1.4; },
  (b,t,k)=>{ const s=.055; for(let i=0;i<8;i++) PI.chip(b,t+i*s,k+24+[0,2,4,5,7,9,11,12][i],.05,.9); M.brass(b,t+8*s,chordOf(k,0),.8,1); D.kick(b,t+8*s,1); D.crash(b,t+8*s,.9); return 1.5; },
  (b,t,k)=>{ const s=.06; for(let i=0;i<8;i++) D.snare(b,t+i*s,.25+i*.09,.1); D.tom(b,t+8*s,.9,110); M.brass(b,t+9*s,chordOf(k,4),.7,1); D.crash(b,t+9*s,1); D.kick(b,t+9*s,1); return 1.4; },
  (b,t,k)=>{ D.riser(b,t,.7); M.brass(b,t+.7,chordOf(k,0).map(x=>x+12),.6,1); D.kick(b,t+.7,1); D.clap(b,t+.7,.9,.4); D.crash(b,t+.7,1); return 1.6; },
  (b,t,k)=>{ PI.roll(b,t,k-24,.45,.8); [[.5,7,.18],[.7,7,.18],[.9,12,.7]].forEach(([d,iv,len])=>M.brass(b,t+d,[k+iv,k+iv+4,k+iv+7],len,1)); D.crash(b,t+.9,.9); PI.timp(b,t+.9,k-24,1); return 1.9; },
];
// Each style: tempo, key, theme (opening), bed (one bar), stings, outro. Times in seconds, k = MIDI key.
const PT={
  news:{name:"news",bpm:132,key:60,
    theme(b,t,k){ const s=SIX(this.bpm);
      for(let i=0;i<32;i++){ PI.pulse(b,t+i*s,k-12+[0,0,7,0,12,0,7,0][i%8],s*.9,.8); if(i%4===0) D.kick(b,t+i*s,.85); if(i%8===4) D.snare(b,t+i*s,.5,.15); if(i%2===0) D.hat(b,t+i*s,.35); }
      [[0,0],[3,0],[6,0],[8,0],[16,5],[19,5],[22,4],[24,4]].forEach(([i,deg])=>M.brass(b,t+i*s,chordOf(k,deg),s*1.6,1));
      PI.timp(b,t,k-24,.8); const end=t+32*s; M.brass(b,end,chordOf(k,0).concat(k+12),1.3,1.1); D.kick(b,end,1); D.crash(b,end,1); PI.timp(b,end,k-24,1); return 32*s+1.4; },
    bed(b,t,bar,k){ const s=SIX(this.bpm); for(let i=0;i<16;i+=2) PI.pulse(b,t+i*s,k-12+(i%8===4?7:0),s*1.6,.55); for(let i=0;i<16;i+=4) D.kick(b,t+i*s,.45); for(let i=2;i<16;i+=4) D.hat(b,t+i*s,.25);
      M.bass(b,t,(bar%4===3?k+5:k)-24,s*7,.5); return 16*s; },
    stings:NEWS_STINGS,
    outro(b,t,k){ const s=SIX(this.bpm); [[0,0],[2,3],[4,4]].forEach(([i,deg])=>{ M.brass(b,t+i*s,chordOf(k,deg),s*1.5,1); D.kick(b,t+i*s,.8); });
      const e=t+7*s; M.brass(b,e,chordOf(k,0).concat(k+12),1.2,1.1); D.crash(b,e,1); PI.timp(b,e,k-24,1); D.kick(b,e,1); return 7*s+1.3; }},
  ticker:{name:"ticker",bpm:124,key:65,minor:true,
    theme(b,t,k){ const s=SIX(this.bpm), arp=[0,3,7,12,7,3,0,-2];
      for(let i=0;i<32;i++){ PI.chip(b,t+i*s,k+12+arp[i%8]+(i>=16?-4:0),s*.7,.8,"square"); if(i%4===0) D.kick(b,t+i*s,.9); if(i%8===4) D.clap(b,t+i*s,.5,.2); if(i%2===1) D.hat(b,t+i*s,.3); }
      for(let i=0;i<32;i+=8) M.bell(b,t+i*s,k+24,.6,.8,.2);
      [[0,0],[14,0],[16,5],[30,6]].forEach(([i,deg])=>M.brass(b,t+i*s,chordOf(k,deg,true),s*2,1));
      const end=t+32*s; M.brass(b,end,chordOf(k,0,true).concat(k+12),1.1,1.1); D.crash(b,end,1); D.kick(b,end,1); M.bell(b,end,k+24,1,1); return 32*s+1.3; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), arp=[0,3,7,3]; for(let i=0;i<16;i+=2) PI.chip(b,t+i*s,k+12+arp[(i/2)%4],s*.6,.45,"triangle"); for(let i=0;i<16;i+=4) D.kick(b,t+i*s,.45); M.bass(b,t,k-24+(bar%2?-2:0),s*7,.45); return 16*s; },
    stings:[...NEWS_STINGS,
      (b,t,k)=>{ for(let i=0;i<6;i++) PI.chip(b,t+i*.07,k+24+(i%2?7:0),.05,.9); M.bell(b,t+.45,k+24,.8,1); M.bell(b,t+.62,k+31,.9,1); D.kick(b,t+.45,1); return 1.5; },
      (b,t,k)=>{ M.bell(b,t,k+24,.5,1); M.bell(b,t+.22,k+24,.5,1); M.bell(b,t+.44,k+24,1,1); D.kick(b,t+.44,.9); M.brass(b,t+.44,chordOf(k,0,true),.6,.9); return 1.5; }],
    outro(b,t,k){ return PT.news.outro.call(this,b,t,k); }},
  doug:{name:"doug",bpm:128,key:62,
    theme(b,t,k){ const d=PT.news.theme.call(this,b,t,k), s=SIX(this.bpm); for(let i=4;i<32;i+=8) D.clap(b,t+i*s,.8,.35); for(let i=28;i<32;i++) D.clap(b,t+i*s,.5,.2); return d; },
    bed(b,t,bar,k){ const l=PT.news.bed.call(this,b,t,bar,k), s=SIX(this.bpm); D.clap(b,t+4*s,.35,.2); D.clap(b,t+12*s,.35,.2); return l; },
    stings:[...NEWS_STINGS, (b,t,k)=>{ for(let i=0;i<3;i++) D.clap(b,t+i*.16,.9,.3); M.brass(b,t+.48,chordOf(k,0),.7,1); D.kick(b,t+.48,1); D.crash(b,t+.48,.8); return 1.5; }],
    outro(b,t,k){ const d=PT.news.outro.call(this,b,t,k); for(let i=0;i<3;i++) D.clap(b,t+d-1.2+i*.12,.8,.3); return d; }},
  pomp:{name:"pomp",bpm:100,key:58,
    theme(b,t,k){ const s=SIX(this.bpm); [0,3,4,0].forEach((deg,j)=>{ M.organ(b,t+j*8*s,chordOf(k,deg).map(x=>x-12),8*s*.95,.9); M.brass(b,t+j*8*s,chordOf(k,deg),s*3,1); PI.timp(b,t+j*8*s,k-24+(deg===4?7:0),.9); });
      PI.roll(b,t+28*s,k-24,4*s,.8); const e=t+32*s; M.brass(b,e,chordOf(k,0).concat(k+12),1.4,1.1); M.organ(b,e,chordOf(k,0).map(x=>x-12),1.4,1); D.crash(b,e,.9); return 32*s+1.5; },
    bed(b,t,bar,k){ const s=SIX(this.bpm); M.organ(b,t,chordOf(k,[0,3,4,0][bar%4]).map(x=>x-12),16*s*.95,.45); PI.timp(b,t,k-24,.35); return 16*s; },
    stings:[...NEWS_STINGS, (b,t,k)=>{ PI.timp(b,t,k-24,1); PI.timp(b,t+.25,k-24,1); M.brass(b,t+.5,chordOf(k,4),.25,1); M.brass(b,t+.8,chordOf(k,0).concat(k+12),.8,1.1); D.crash(b,t+.8,.8); return 1.8; }],
    outro(b,t,k){ return PT.news.outro.call(this,b,t,k); }},
  lost:{name:"lost",bpm:120,key:63,
    theme(b,t,k){ const d=PT.news.theme.call(this,b,t,k), s=SIX(this.bpm); for(let i=0;i<32;i+=6) D.cowbell(b,t+i*s,k+24,.15,.7); return d; },
    bed(b,t,bar,k){ return PT.news.bed.call(this,b,t,bar,k); },
    stings:[...NEWS_STINGS, (b,t,k)=>{ [0,4,7,12].forEach((iv,i)=>M.pluck(b,t+i*.08,k+12+iv,.2,1)); D.rim(b,t+.32,.8); D.cowbell(b,t+.4,k+24,.2,.8); M.brass(b,t+.4,chordOf(k,0),.5,.9); return 1.3; }],
    outro(b,t,k){ return PT.news.outro.call(this,b,t,k); }},
  westcoast:{name:"westcoast",bpm:94,key:56,minor:true,swing:.58,
    theme(b,t,k){ const s=SIX(this.bpm), sw=i=>t+(i+(i%2?this.swing*2-1:0)*.5)*s, ch=[[k,k+3,k+7,k+10],[k+5,k+8,k+12,k+15]];
      for(let bar=0;bar<2;bar++){ const t0=bar*16, c=ch[bar%2]; M.rhodes(b,sw(t0),c,s*7,.8); M.rhodes(b,sw(t0+10),c,s*4,.6);
        D.kick(b,sw(t0),.95); D.kick(b,sw(t0+7),.6); D.kick(b,sw(t0+10),.8); D.clap(b,sw(t0+4),.75,.4); D.clap(b,sw(t0+12),.75,.4);
        for(let i=0;i<16;i+=2) D.hat(b,sw(t0+i),i%4?.2:.32); D.b808(b,sw(t0),(bar%2?k+5:k)-24,s*6,.9,bar%2?k-24:null); D.b808(b,sw(t0+10),(bar%2?k+5:k)-24,s*4,.7); }
      const mel=[[0,12],[3,15],[6,17],[8,15],[11,12],[14,10],[16,12],[19,15],[22,19],[24,17],[28,15],[30,12]];
      let prev=null; mel.forEach(([i,iv])=>{ M.whistle(b,sw(i),k+12+iv,s*2.4,1,prev); prev=k+12+iv; });   // the G-funk whistle
      const e=t+32*s; M.whistle(b,e,k+24,1.2,1,prev); D.b808(b,e,k-24,1.2,1,k-36); D.clap(b,e,.9,.5); return 32*s+1.3; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), c=bar%2?[k+5,k+8,k+12,k+15]:[k,k+3,k+7,k+10]; M.rhodes(b,t,c,s*14,.45); D.kick(b,t,.5); D.kick(b,t+10*s,.4); D.clap(b,t+4*s,.35,.4); D.clap(b,t+12*s,.35,.4);
      for(let i=0;i<16;i+=2) D.hat(b,t+i*s,.14); D.b808(b,t,(bar%2?k+5:k)-24,s*8,.5); return 16*s; },
    stings:[
      (b,t,k)=>{ M.whistle(b,t,k+24,.5,1,k+31); M.whistle(b,t+.5,k+19,.6,1,k+24); D.b808(b,t+.5,k-24,.9,1,k-36); D.clap(b,t+.5,.9,.5); return 1.5; },
      (b,t,k)=>{ D.riser(b,t,.5); M.rhodes(b,t+.5,[k,k+3,k+7,k+10],.8,1); D.b808(b,t+.5,k-24,.9,1); D.kick(b,t+.5,1); D.clap(b,t+.5,.8,.6); return 1.6; },
      (b,t,k)=>{ for(let i=0;i<8;i++) D.hat(b,t+i*.05,.3+i*.05); D.clap(b,t+.4,.9,.5); M.whistle(b,t+.4,k+22,.7,1,k+17); D.b808(b,t+.4,k-24,.8,1); return 1.4; },
      (b,t,k)=>{ M.rhodes(b,t,[k-1,k+2,k+6,k+9],.25,1); M.rhodes(b,t+.3,[k,k+3,k+7,k+10],.9,1); D.b808(b,t+.3,k-24,1,1,k-29); D.snare(b,t+.3,.7,.4); return 1.5; }],
    outro(b,t,k){ M.rhodes(b,t,[k,k+3,k+7,k+10],1.6,.9); M.whistle(b,t,k+24,.4,1,k+19); M.whistle(b,t+.45,k+22,.4,1); M.whistle(b,t+.9,k+19,1,1); D.b808(b,t,k-24,1.6,1,k-36); D.clap(b,t,.8,.5); D.crash(b,t,.5); return 2.2; }},
  tech:{name:"tech",bpm:140,key:57,minor:true,
    theme(b,t,k){ const s=SIX(this.bpm), arp=[0,7,12,15,12,7,3,7];
      PI.zap(b,t,1); for(let bar=0;bar<4;bar++){ const r=k+[0,8,5,7][bar]; for(let i=0;i<16;i++){ const tt=t+(bar*16+i)*s; PI.chip(b,tt,r+12+arp[i%8],s*.8,.9);
          if(i%4===0) D.kick(b,tt,.9); if(i===4||i===12) D.snare(b,tt,.6,.12); if(i%2) D.hat(b,tt,.25); if(i%2===0) PI.pulse(b,tt,r-12,s*1.5,.9); } }
      const e=t+64*s; [0,4,7,12,16,19,24].forEach((iv,i)=>PI.chip(b,e+i*.04,k+12+iv,.12,.9)); PI.zap(b,e+.3,1,3000,200); D.crash(b,e,.9); D.kick(b,e,1); return 64*s+1.2; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), r=k+[0,8,5,7][bar%4], arp=[0,7,12,7]; for(let i=0;i<16;i+=2) PI.chip(b,t+i*s,r+12+arp[(i/2)%4],s*.7,.45,"triangle"); for(let i=0;i<16;i+=4) D.kick(b,t+i*s,.45); PI.pulse(b,t,r-12,s*14,.5); return 16*s; },
    stings:[
      (b,t,k)=>{ for(let i=0;i<12;i++) PI.chip(b,t+i*.035,k+12+[0,4,7,12][i%4]+Math.floor(i/4)*12,.04,.9); M.bell(b,t+.45,k+36,.8,.8); D.kick(b,t+.45,1); return 1.3; },
      (b,t,k)=>{ PI.zap(b,t,1); PI.zap(b,t+.15,1,2600,200); PI.zap(b,t+.3,1,3200,120); D.kick(b,t+.45,1); D.snare(b,t+.45,.8,.2); D.crash(b,t+.45,.8); return 1.3; },
      (b,t,k)=>{ [[0,12,.1],[.1,16,.1],[.2,19,.1],[.3,24,.12],[.45,28,.1],[.55,31,.45]].forEach(([d,iv,len])=>PI.chip(b,t+d,k+iv,len,1)); D.kick(b,t+.55,.9); D.crash(b,t+.55,.6); return 1.4; },
      (b,t,k)=>{ D.riser(b,t,.5); for(let i=0;i<6;i++) PI.chip(b,t+.5+i*.03,k+36-i*2,.03,.8,"sawtooth"); PI.pulse(b,t+.5,k-12,.6,1); D.kick(b,t+.5,1); D.clap(b,t+.5,.8,.3); return 1.4; }],
    outro(b,t,k){ [[0,12],[.12,15],[.24,19],[.36,24],[.6,22],[.72,24]].forEach(([d,iv])=>PI.chip(b,t+d,k+iv,.11,1)); PI.chip(b,t+.9,k+24,.8,1); PI.zap(b,t+.9,.8,2600,90); D.kick(b,t+.9,1); D.crash(b,t+.9,.7); return 2; }},
  nature:{name:"nature",bpm:72,key:62,
    theme(b,t,k){ const s=SIX(this.bpm), prog=[0,4,5,3];
      prog.forEach((deg,j)=>{ const c=chordOf(k,deg); M.pad(b,t+j*8*s,c.map(x=>x-12),8*s,.5,900); [0,2,1,2].forEach((ix,q)=>M.piano(b,t+(j*8+q*2)*s,[c[ix]+12],s*3,.55)); });
      M.bell(b,t+32*s,k+24,1.6,.6); M.piano(b,t+32*s,chordOf(k,0).map(x=>x+12),1.6,.5); return 32*s+1.5; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), c=chordOf(k,[0,4,5,3][bar%4]); M.pad(b,t,c.map(x=>x-12),16*s,.32,800); M.piano(b,t,[c[0]+12],s*8,.3); return 16*s; },
    stings:[
      (b,t,k)=>{ M.piano(b,t,chordOf(k,5).map(x=>x+12),.9,.6); M.piano(b,t+.9,chordOf(k,0).map(x=>x+12),1.4,.6); M.pad(b,t,chordOf(k,0).map(x=>x-12),2.2,.4,800); return 2.6; },
      (b,t,k)=>{ M.bell(b,t,k+19,1.4,.6); M.bell(b,t+.5,k+24,1.6,.5); M.pad(b,t,chordOf(k,3).map(x=>x-12),2.2,.4,900); return 2.6; },
      (b,t,k)=>{ [0,4,7,11,14].forEach((iv,i)=>M.piano(b,t+i*.28,[k+12+iv],1.2,.45)); return 2.6; }],
    outro(b,t,k){ M.pad(b,t,chordOf(k,0).map(x=>x-12),3,.5,800); M.piano(b,t,chordOf(k,0).map(x=>x+12),2.6,.55); M.bell(b,t+.6,k+24,2,.5); return 3.2; }},
  noir:{name:"noir",bpm:86,key:57,minor:true,
    theme(b,t,k){ const s=SIX(this.bpm), walk=[0,3,5,6,7,5,3,2];
      walk.forEach((iv,i)=>{ const tt=t+i*4*s; M.bass(b,tt,k-24+iv,s*3.6,.7); D.hat(b,tt,.18,false); D.hat(b,tt+2.6*s,.12); if(i%2) D.snare(b,tt,.12,.3,.6); });
      [[0,[k,k+3,k+7,k+10,k+14]],[16,[k-4,k,k+3,k+7]]].forEach(([i,c])=>M.brass(b,t+i*s,c,s*10,.55));
      const e=t+32*s; [[0,k+7],[.35,k+6],[.7,k+5]].forEach(([d,m])=>M.brass(b,e+d,[m,m+3],d<.7?.3:1.2,.9)); M.piano(b,e+.7,[k-24,k-23,k-18],1.6,.7); return 32*s+2.2; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), w=[[0,3,5,7],[5,3,2,0]][bar%2]; w.forEach((iv,i)=>{ M.bass(b,t+i*4*s,k-24+iv,s*3.5,.45); D.hat(b,t+i*4*s,.1); }); M.rhodes(b,t,[k,k+3,k+7,k+10],s*14,.3); return 16*s; },
    stings:[
      (b,t,k)=>{ [[0,k+7],[.3,k+6],[.6,k+3]].forEach(([d,m],i)=>M.brass(b,t+d,[m,m+3,m+7],i<2?.22:1.1,.95)); PI.timp(b,t+.6,k-24,.7); return 1.9; },
      (b,t,k)=>{ M.piano(b,t,[k-24,k-23,k-18,k-17],1.4,.8); D.hat(b,t,.4,true); D.tom(b,t,.6,70); return 1.7; },
      (b,t,k)=>{ for(let i=0;i<4;i++) M.bass(b,t+i*.18,k-24+[0,3,6,5][i],.16,.7); M.brass(b,t+.72,[k,k+3,k+6,k+10],.9,.9); D.snare(b,t+.72,.4,.4); return 1.7; }],
    outro(b,t,k){ M.brass(b,t,[k+7,k+10],.3,.9); M.brass(b,t+.4,[k+6,k+9],.3,.9); M.brass(b,t+.8,[k,k+3,k+7,k+11],1.6,1); M.bass(b,t+.8,k-24,1.6,.8); M.piano(b,t+.8,[k-24,k-23],2,.6); return 2.8; }},
  fantasy:{name:"fantasy",bpm:96,key:62,minor:true,
    theme(b,t,k){ const s=SIX(this.bpm), dor=[0,2,3,5,7,9,10,12];
      M.organ(b,t,[k-24,k-17],32*s,.45,4); const arp=[0,7,12,7,3,7,12,15];
      for(let i=0;i<32;i+=2){ PI.lute(b,t+i*s,k+arp[(i/2)%8]-(Math.floor(i/16)%2?2:0),.8); if(i%8===0) D.shaker(b,t+i*s,.4); }
      const mel=[[0,7,4],[4,9,2],[6,10,2],[8,12,6],[16,10,4],[20,9,2],[22,7,2],[24,5,3],[27,3,2],[29,2,3]];
      mel.forEach(([i,iv,len])=>PI.flute(b,t+i*s,k+12+iv,len*s*.95,1));
      const e=t+32*s; dor.forEach((iv,i)=>PI.lute(b,e+i*.05,k+12+iv,.9)); M.bell(b,e+.4,k+24,1.6,.8); M.organ(b,e+.4,[k-12,k-5,k],1.6,.8,4); return 32*s+2; },
    bed(b,t,bar,k){ const s=SIX(this.bpm), arp=[0,7,12,7]; M.organ(b,t,[k-24,k-17],16*s,.25,4); for(let i=0;i<16;i+=4) PI.lute(b,t+i*s,k+arp[i/4]-(bar%2?2:0),.45); return 16*s; },
    stings:[
      (b,t,k)=>{ [0,2,3,5,7,9,10,12,14,15].forEach((iv,i)=>PI.lute(b,t+i*.045,k+12+iv,.9)); M.bell(b,t+.5,k+36,1.2,.8); return 1.8; },
      (b,t,k)=>{ for(let i=0;i<7;i++) M.bell(b,t+i*.09,k+24+[0,7,12,10,14,19,24][i],.6,.5,(i%2?.3:-.3)); M.organ(b,t,[k-12,k-5],1.2,.6,4); return 1.8; },
      (b,t,k)=>{ [[0,7,.15],[.18,7,.15],[.36,12,.7]].forEach(([d,iv,len])=>{ PI.flute(b,t+d,k+12+iv,len,1); M.brass(b,t+d,[k+iv,k+iv+7],len,.7); }); PI.timp(b,t+.36,k-24,.9); return 1.6; },
      (b,t,k)=>{ PI.flute(b,t,k+19,.25,1); PI.flute(b,t+.25,k+17,.25,1); PI.flute(b,t+.5,k+15,.8,1); [0,7,12].forEach((iv,i)=>PI.lute(b,t+.5+i*.06,k+iv,.9)); return 1.6; }],
    outro(b,t,k){ [0,3,7,10,12,15,19].forEach((iv,i)=>PI.lute(b,t+i*.07,k+iv,.9)); PI.flute(b,t+.5,k+19,1.6,1); M.organ(b,t+.5,[k-12,k-5,k],2,.7,4); M.bell(b,t+.5,k+24,2,.7); return 2.8; }},
};
// loudness trims so every show's music sits at about the same level (measured offline): themes/stings and the bed
const PT_GAIN={westcoast:.75,tech:1.15,nature:2.2,fantasy:1.35,noir:1}, PT_STING_GAIN={tech:1.6,nature:2,fantasy:1.6,westcoast:.8}, PT_BED_GAIN={pomp:2.4,nature:4,fantasy:3,tech:1.2};
const PT_STYLE={doug:"doug",biz:"ticker",usb:"westcoast",buttons:"tech",nature:"nature",lost:"lost",hoa:"pomp",ship:"noir",wizard:"fantasy"};
const ptStingDecks={};
function ptMusic(p,kind){   // plays one music cue for the show on air; returns how long to wait before the next line
  if(!ctx) return 0; const S=PT[p.style]||PT.news, k=S.key, t=ctx.currentTime+.05;
  try{
    const gn=PT_GAIN[p.style]??1, sg=(PT_STING_GAIN[p.style]??1)*gn;
    if(kind==="theme"){ const d=S.theme.call(ptS(S),ptBus(gn,k,S.minor),t,k); ptBedOn(p,S,t+d-1); return Math.max(1,d-.6); }
    if(kind==="sting"||kind==="id"){ const st=kind==="id"?NEWS_STINGS:S.stings, key=kind==="id"?"id":p.style;
      let dk=ptStingDecks[key]; if(!dk||!dk.length) dk=ptStingDecks[key]=st.map((_,i)=>i).sort(()=>R()-.5);
      const d=st[dk.pop()](ptBus(kind==="id"?1:sg,kind==="id"?60:k,kind==="id"?false:S.minor),t,kind==="id"?60:k); return d*.8; }
    if(kind==="outro"){ ptBedOff(p,.8); return S.outro.call(ptS(S),ptBus(gn,k,S.minor),t,k)+.3; }
    if(kind==="bedOn"){ ptBedOn(p,S,t); return 1.2; }
    if(kind==="bedOff"){ ptBedOff(p,2.4); return .1; }
  }catch(e){}
  return 0;
}
// The bed: the show's theme, softly, under the host's first and last lines. Scheduled a bar at a time; it always stops by itself.
function ptBedOn(p,S,t0){ if(!p||p.bed) return; const b=ptBus(.0001,S.key,S.minor), bed={b,S,next:t0,bar:0,stop:false,until:Date.now()+45000};
  b.gain.gain.setValueAtTime(.0001,ctx.currentTime); b.gain.gain.linearRampToValueAtTime(.3*(PT_BED_GAIN[S.name]??1),t0+.8); p.bed=bed;
  const pump=()=>{ if(bed.stop||!ctx||p!==ptlk) return ptBedOff(p,1.5,bed); if(Date.now()>bed.until) return ptBedOff(p,3,bed);
    while(bed.next<ctx.currentTime+1.5){ const t1=Math.max(bed.next,ctx.currentTime+.05), bar=bed.bar++, SS=ptS(S); if(GON.ptlk) b.gGrid={t0:t1,st:SIX(SS.bpm),n:16,bar};
      const d=S.bed.call(SS,b,t1,bar,S.key); if(MXON.ptlk){ mxBarSt=0; b.mxBpm=SS.bpm; mxGroove("ptlk",b,t1,d,bar); } if(glOn&&FXW.get(ctx)) glitchBar(t1,d,d/4); if(GON.ptlk) gPump("ptlk",b,t1,d,bar,false); bed.next+=d*(gOn("ptlk","meter")?METERS[GRV.ptlk.meter].ratio:1); } bed.t=setTimeout(pump,400); };
  pump(); }
function ptBedOff(p,fade=1.6,which){ const bed=which||(p&&p.bed); if(!bed) return; if(p&&p.bed===bed) p.bed=null; if(bed.off) return; bed.off=bed.stop=true; clearTimeout(bed.t);
  try{ fadeTo(bed.b.gain.gain,.0001,fade,ctx.currentTime); }catch(e){} setTimeout(()=>{ try{ bed.b.gain.disconnect(); }catch(e){} },fade*1000+3000); }
function talkCast(c){   // a cast as speak() wants it: distinct voices where the computer has them, callers on the phone line
  const host=hostCast(), out={names:{}}, used=new Set(), vs=HAS_TTS?speechSynthesis.getVoices():[];
  for(const [k,sp0] of Object.entries(c)){
    const sp=clearSpec(sp0), nov=!!sp0.novelty, ok=x=>nov||clearVoice(x);
    let v=null; const want=[...(sp.names||[]),...((ACCENTS[sp.accent]||{}).names||[])];
    for(const n of want){ const f=vs.find(x=>(x.name===n||x.name.startsWith(n+" ")||x.name.startsWith(n+" ("))&&!used.has(x.name)&&ok(x)); if(f){ v=f; break; } }
    if(!v){ const a=(ACCENTS[sp.accent]||{}).lang; if(a) v=vs.find(x=>(x.lang||"").replace("_","-").toLowerCase().startsWith(a)&&!used.has(x.name)&&ok(x))||null; }
    if(!v) v=voiceFor(sp0)||host.voice; if(v) used.add(v.name);
    const cl=(x,a,b)=>nov?x:Math.max(a,Math.min(b,x));   // natural pitch and pace, so every voice is easy to follow
    out[k]={voice:v,voiceName:v?null:(want[0]||null),pitch:cl(sp.pitch??1,.88,1.12),rate:cl(sp.rate??1,.9,1.1),vol:sp.vol,phone:/^c\d+$|^owner$|^ph_/.test(k)};
    out.names[k]=spelled(sp.name||k); if(!out.host) out.host=out[k];
  }
  return out;
}
function ptlkPick(){
  const ok=TALK.shows.filter(x=>ptlkTypes[x.id]); if(!ok.length) return null;
  let c=ok.filter(x=>!ptlkRecent.includes(x.id)); if(!c.length) c=ok; const s=pick(c);
  ptlkRecent.push(s.id); while(ptlkRecent.length>Math.min(4,ok.length-1)) ptlkRecent.shift(); return s;
}
const within=(p,ms)=>Promise.race([Promise.resolve().then(()=>p),new Promise(res=>setTimeout(()=>res(null),ms))]).catch(()=>null);
async function ptlkData(s){   // live headlines or an encyclopedia page, checked; null means the show makes its own
  if(!s.needs) return null; const h=typeof opts.headlines==="function"?opts.headlines:null;
  if(s.needs==="animal"){ const a=pick(TALK.animals()); if(!h) return {animal:a}; const w=await within(h("wiki",a),6000);
    return {animal:a,wiki:w&&typeof w.extract==="string"?{title:String(w.title||a).slice(0,120),extract:w.extract.slice(0,2000)}:null}; }
  if(!h) return null; const list=await within(h(s.needs),6000); if(!Array.isArray(list)) return null;
  return list.filter(x=>x&&typeof x.title==="string").slice(0,25).map(x=>({title:x.title.slice(0,200),source:typeof x.source==="string"?x.source.slice(0,60):""}));
}
function ptlkOn(){ ptlkOff(); ptlk={n:0,t:0,lines:null,i:0,cast:null,ep:null}; const p=ptlk; p.t=setTimeout(()=>ptlkShow(p,true),700); }
function ptlkOff(){ if(!ptlk) return; clearTimeout(ptlk.t); ptBedOff(ptlk,.8); ptlk.dead=true; ptlk=null; }
async function ptlkShow(p,first){
  if(p!==ptlk||!on||station!=="ptlk") return; clearTimeout(p.t); const n=++p.n; p.lines=null;
  const s=ptlkPick();
  if(!s){ nowPlaying={station:"ptlk",title:"Dead air",style:"Talk radio",artist:"Nobody, every show is switched off",bpm:null}; emit("nowplaying",nowPlaying); p.t=setTimeout(()=>ptlkShow(p),4000); return; }
  speaking=true; const data=await ptlkData(s); if(p!==ptlk||n!==p.n) return;
  let ep; try{ ep=TALK.episode(s.id,data,ptlkState[s.id]||(ptlkState[s.id]={})); }catch(e){ try{ ep=TALK.episode(s.id,null,ptlkState[s.id]={}); }catch(e2){ speaking=false; p.t=setTimeout(()=>ptlkShow(p),2000); return; } }   // 1.25: a fresh state, then the next show, never dead air
  const show=spelled(ep.show), hosts=spelled(ep.hosts), sp={kind:"ptlk",station:"ptlk",show,title:ep.title,showId:ep.showId,hosts,live:!!ep.usedLive};
  nowPlaying={station:"ptlk",title:ep.title,style:show,artist:hosts,bpm:null}; emit("nowplaying",nowPlaying); emit("spot",sp); recStart(sp);
  const cast=talkCast({ann:PTLK_ANN,...ep.cast}); cast.host=cast[Object.keys(ep.cast)[0]]||cast.ann;
  p.style=PT_STYLE[ep.showId]||"news"; p.lines=ptlkRunOrder(ep,first); p.i=0; p.cast=cast; p.ep=ep; ptlkStep(p,n);
}
/* The running order: station ID (sometimes), the announcer, the show's theme with its bed under the first two lines,
   the episode with a stinger at every segment break, the bed back under the sign-off, the closing hit. */
function ptlkRunOrder(ep,first){
  const spoken=l=>l[0]!=="sfx"&&l[0]!=="music"&&l[0]!=="pause"&&l[0]!=="seg", L=[];
  if(ptlkTypes.ids){ if(first||R()<.35) L.push(["music","id"],["ann",TALK.id()]); L.push(["ann",TALK.next(ep.showId)]); }
  L.push(["music","theme"]);
  const body=[]; for(const l of ep.lines){ const m=l[0]==="seg"?["music","sting"]:l; if(m[0]==="music"&&body.length&&body[body.length-1][0]==="music") continue; body.push(m); }
  while(body.length&&body[0][0]==="music") body.shift();
  let k=0, i2=-1; for(let i=0;i<body.length;i++) if(spoken(body[i])&&++k===2){ i2=i; break; }
  let last=-1; for(let i=body.length-1;i>=0;i--) if(spoken(body[i])){ last=i; break; }
  body.forEach((l,i)=>{ if(i===last&&i>i2+1) L.push(["music","bedOn"]); L.push(l); if(i===i2) L.push(["music","bedOff"]); });
  L.push(["music","outro"]); return L;
}
function ptlkStep(p,n){   // one line at a time, so a station ID can cut in between lines
  if(p!==ptlk||n!==p.n||!on) return;
  if(p.i>=p.lines.length){ ptBedOff(p,1); recStop(); speaking=false; p.t=setTimeout(()=>ptlkShow(p),rr(1200,2500)); return; }
  let line=p.lines[p.i++];
  if(line[0]==="music"){ const d=ptMusic(p,line[1]); p.t=setTimeout(()=>ptlkStep(p,n),d*1000); return; } if(typeof line[1]==="string"&&line[0]!=="sfx"&&line[0]!=="organ"&&line[0]!=="pause"){ const v=spelled(line[1]); if(v!==line[1]) line=[line[0],{say:line[1],show:v}]; }
  speakLines([line],p.cast,()=>{ if(p===ptlk&&n===p.n) ptlkStep(p,n); });
}
function ptlkId(){   // "Station ID": cuts in after the line being spoken, then the show picks up where it was
  const p=ptlk; if(!on||station!=="ptlk"||!p||!ptlkTypes.ids) return; const line=TALK.id(); emit("spot",{kind:"id",station:"ptlk",text:spelled(line)});
  if(!p.lines){ return; }
  const back=p.ep&&p.i<p.lines.length-1?[["ann",`We now return you to ${p.ep.show}.`]]:[];
  p.lines.splice(p.i,0,["music","id"],["ann",pick(["Pardon the interruption.","A quick word from the station.","Sorry, folks. Legally, we have to say this."])+" "+line],...back);
}
function ptlkSkip(){ const p=ptlk; if(!on||!p) return; gen++; hush(); ptBedOff(p,.6); recStop(true); ptlkShow(p); }
// "Save" on WYBC: a fresh 2.5-minute performance, rendered off the live audio and brought up to MDFM's level.
async function renderAmbient(secs){
  if(!AMB()) return null; const buffer=await renderOffline("wybc",secs);
  let pk=0; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  const k=pk>0?Math.min(8,.89/pk):1; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++) d[i]*=k; }
  return buffer;
}
/* ---------- HEARYE 95.5: Renn Faire Radio, the Home of High Drama ----------
   Procedural high-fantasy music (harps, lutes, flutes, fiddles, strings, horns, organ, chant, battle drums, tambourines)
   over forest, meadow and mountain ambience, with scripted shows, jousting, show ponies, realm news, ads and call-ins
   between the pieces (src/faire.js writes them). Everything plays into its own gain into the MDFM chain (pre), so
   volume, EQ, TUNE, the limiter, the meters and Save all apply. Each piece is written from a seed, so Save renders
   the same piece that's on air, from the top. */
const FAIRE=typeof createFaire==="function"?createFaire(R):null;
const F_LEVEL=1.5;   // the station's trim into the chain (measured: about 3 dB under MDFM)
const FG=new WeakMap();   // per AudioContext (live, or an offline render): the station's input and its long hall reverb
function fg(){ let g=FG.get(ctx); if(!g){ g={in:G(F_LEVEL),rev:ctx.createConvolver()}; g.in.connect(pre); g.rev.buffer=preIR(makeIR(ctx,2.8,1.9),.02); const rl=filt("lowpass",5200),rg=G(.55); g.rev.connect(filt("highpass",220)).connect(rl); rl.connect(rg); rg.connect(g.in); FG.set(ctx,g); } return g; }
function fBus(level){ const g=G(level); g.connect(fg().in); const b=makeBus(g,fg().rev); b.gain=g; return b; }
const srand=s=>()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
// the fantasy instruments (MDFM's brass, organ, bells, choir and PTLK's lute, flute and timpani do the rest)
const FI={
  harp(b,t,m,v=1,pn=0){ const f=mtof(m), dec=Math.max(.9,Math.min(3.2,2.6-(m-60)*.04)), p=pan(pn), out=G(1); out.connect(p); p.connect(b.mu); to(out,b,.5);
    for(const [h,a,dk,ty] of [[1,.09,1,"triangle"],[3,.014,.35,"sine"]]){ const o=osc(ty,f*h), g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(a*v,t+.003); g.gain.exponentialRampToValueAtTime(.0001,t+dec*dk); o.connect(g); g.connect(out); o.start(t); o.stop(t+dec*dk+.05); } },
  strings(b,t,notes,dur,v=1,o={}){ if((o.att??.35)<.05&&dur<.4){ const lp=filt("lowpass",o.bright||1900,.6), g=ctx.createGain(), pk=.034*v/Math.sqrt(notes.length), e=t+dur;   // spiccato: light on the CPU
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.008); g.gain.setValueAtTime(pk*.8,e); g.gain.exponentialRampToValueAtTime(.0001,e+(o.rel??.1)); lp.connect(g); g.connect(b.mu); to(g,b,o.rv??.3);
      notes.forEach(m=>{ const x=osc("sawtooth",mtof(m)); x.detune.value=rr(-5,5); x.connect(lp); x.start(t); x.stop(e+(o.rel??.1)+.05); }); return; }
    const att=o.att??.35, rel=o.rel??.6, end=t+Math.max(att,dur), lp=filt("lowpass",o.bright||1900,.6), g=ctx.createGain(), lfo=osc("sine",5.3), lg=G(o.vib??7), pk=.026*v/Math.sqrt(notes.length);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(pk,t+att); g.gain.setValueAtTime(pk,end); g.gain.exponentialRampToValueAtTime(.0001,end+rel);
    lp.connect(g); g.connect(b.mu); to(g,b,o.rv??.55); lfo.connect(lg); lfo.start(t); lfo.stop(end+rel+.1);
    notes.forEach((m,i)=>{ for(const dt of (o.thin||notes.length>2?[-7,7]:[-9,0,8])){ const x=osc("sawtooth",mtof(m)), pn=pan(Math.max(-.8,Math.min(.8,((i/(notes.length-1||1))-.5)*.7+dt/40))); x.detune.value=dt; lg.connect(x.detune); x.connect(pn); pn.connect(lp); x.start(t); x.stop(end+rel+.1); } }); },
  fiddle(b,t,m,dur,v=1,prev=null){ const f=mtof(m), a=osc("sawtooth",f), c=osc("sawtooth",f*1.004), hp=filt("highpass",260), bp=filt("peaking",2000,1.2), lp=filt("lowpass",4200,.7), g=ctx.createGain(), lfo=osc("sine",5.6), lg=ctx.createGain();
    bp.gain.value=2.5; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.011,t+Math.max(.05,Math.min(.5,dur*.6))); lfo.connect(lg); lg.connect(a.frequency); lg.connect(c.frequency);   // 1.25 (E2): the fiddle's presence at 2 kHz, +2.5 (was 2.4 kHz +5)
    if(prev!=null&&prev!==m){ a.frequency.setValueAtTime(mtof(prev),t); a.frequency.exponentialRampToValueAtTime(f,t+.06); c.frequency.setValueAtTime(mtof(prev)*1.004,t); c.frequency.exponentialRampToValueAtTime(f*1.004,t+.06); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.042*v,t+.05); g.gain.setValueAtTime(.036*v,t+Math.max(.06,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.18);
    a.connect(hp); c.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.4); for(const x of [a,c,lfo]){ x.start(t); x.stop(t+dur+.25); } },
  chant(b,t,m,dur,v=1,vw="o"){   // a few monks in unison (Gregorian chant), with one an octave down for weight
    const mix=G(1), out=G(1), g=ctx.createGain(), vow=VOW[vw]||VOW.o, end=t+dur;
    vow.slice(0,2).forEach((F,k)=>{ const bp=filt("bandpass",F*(m>64?1:.86),[6,9][k]), fgn=G([2.6,1.2][k]); mix.connect(bp); bp.connect(fgn); fgn.connect(out); });
    [[0,-7,1],[0,7,1],[-12,-3,.5]].forEach(([iv,dt,a])=>{ const o=osc("sawtooth",mtof(m+iv)), og=G(a); o.detune.value=dt; o.connect(og); og.connect(mix); o.start(t); o.stop(end+.7); });
    const pk=.055*v; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.18); g.gain.setValueAtTime(pk,end); g.gain.exponentialRampToValueAtTime(.0001,end+.6);
    out.connect(g); g.connect(b.mu); to(g,b,.75); },
  horn(b,t,notes,dur,v=1){ const lp=filt("lowpass",500,.9), g=ctx.createGain(), pk=.06*v/Math.sqrt(notes.length);
    lp.frequency.setValueAtTime(380,t); lp.frequency.exponentialRampToValueAtTime(1500,t+.09); lp.frequency.exponentialRampToValueAtTime(950,t+dur+.2);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.07); g.gain.setValueAtTime(pk*.9,t+Math.max(.08,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.35);
    lp.connect(g); g.connect(b.mu); to(g,b,.55); notes.forEach(m=>{ for(const [ty,dt,a] of [["sawtooth",-5,1],["sawtooth",5,1],["triangle",0,1.4]]){ const o=osc(ty,mtof(m)), og=G(a); o.detune.value=dt; o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.4); } }); },
  shawm(b,t,m,dur,v=1){ const f=mtof(m), a=osc("square",f), c=osc("sawtooth",f*1.003), bp=filt("bandpass",1300,1.4), pk2=filt("peaking",2800,1.4), lp=filt("lowpass",4000), g=ctx.createGain(), lfo=osc("sine",5), lg=G(f*.006);
    pk2.gain.value=3; lfo.connect(lg); lg.connect(a.frequency); lg.connect(c.frequency); a.connect(bp); c.connect(bp); bp.connect(pk2); pk2.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.35);   // 1.25 (E2): still nasal, without the needle
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+.03); g.gain.setValueAtTime(.045*v,t+Math.max(.04,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.1); for(const x of [a,c,lfo]){ x.start(t); x.stop(t+dur+.15); } },
  drone(b,t,notes,dur,v=1){ const bp=filt("bandpass",900,.8), lp=filt("lowpass",2400), g=ctx.createGain(); bp.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.35);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.016*v,t+.4); g.gain.setValueAtTime(.016*v,t+dur); g.gain.linearRampToValueAtTime(.0001,t+dur+.4);
    notes.forEach(m=>{ for(const [ty,dt] of [["sawtooth",-4],["square",5]]){ const o=osc(ty,mtof(m)); o.detune.value=dt; o.connect(bp); o.start(t); o.stop(t+dur+.5); } }); },
  drum(b,t,v=1,f=58){ const o=osc("sine",f*2.2), g=ctx.createGain(); o.frequency.setValueAtTime(f*2.2,t); o.frequency.exponentialRampToValueAtTime(f,t+.12); env(g,t,.002,.9*v,.9); o.connect(g); g.connect(b.dr); o.start(t); o.stop(t+1);
    const n=nz(t,.4), lp=filt("lowpass",700), ng=ctx.createGain(); env(ng,t,.001,.35*v,.25); n.connect(lp); lp.connect(ng); ng.connect(b.dr); to(g,b,.3); to(ng,b,.4); duck(b,t,.85); },
  frame(b,t,v=1,hi=false){ const f=hi?170:95, o=osc("sine",f*1.3), g=ctx.createGain(); o.frequency.setValueAtTime(f*1.3,t); o.frequency.exponentialRampToValueAtTime(f*.75,t+.18); env(g,t,.002,.55*v,hi?.14:.24); o.connect(g); g.connect(b.dr); o.start(t); o.stop(t+.3);
    if(!hi){ const n=nz(t,.08), bp=filt("bandpass",500,1), ng=ctx.createGain(); env(ng,t,.001,.12*v,.06); n.connect(bp); bp.connect(ng); ng.connect(b.dr); } to(g,b,.2); },
  tamb(b,t,v=1,shake=false){ for(let k=0;k<(shake?2:1);k++){ const tt=t+k*.03, n=nz(tt,.2), hp=filt("highpass",rr(6500,8000),1.5), g=ctx.createGain();
    env(g,tt,.001,(shake?.07:.12)*v,shake?.09:.16); n.connect(hp); hp.connect(g); g.connect(b.dr); } },
};
FI.pipe=(b,t,m,dur,v=1)=>{ const o=osc("sine",mtof(m)), g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.065*v,t+.025); g.gain.setValueAtTime(.06*v,t+Math.max(.03,dur*.8)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.06); o.connect(g); g.connect(b.mu); to(g,b,.35); o.start(t); o.stop(t+dur+.1); };   // a quick tin-whistle note
FI.lute=(b,t,m,v=1)=>PI.lute(b,t,m,v);
// a small church organ: three pipes a note, no tremolo (lighter than MDFM's tonewheel organ)
FI.organ=(b,t,notes,dur,v=1)=>{ const lp=filt("lowpass",2600,.5), g=ctx.createGain(), pk=.05*v; g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(pk,t+.08); g.gain.setValueAtTime(pk,t+dur); g.gain.linearRampToValueAtTime(.0001,t+dur+.35);
  lp.connect(g); g.connect(b.mu); to(g,b,.6); notes.forEach(m=>{ for(const [h,a,ty] of [[1,.9,"sine"],[2,.45,"triangle"],[4,.14,"sine"]]){ const o=osc(ty,mtof(m)*h), og=G(a/notes.length*1.7); o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.4); } }); };
// a strummed chord: one filter and envelope for the whole chord (light on the CPU), strings a hair apart
FI.strum=(b,t,notes,v=1,gap=.022)=>{ const lp=filt("lowpass",3400,1.2), g=ctx.createGain(), pk=.075*v/Math.sqrt(notes.length); lp.frequency.setValueAtTime(3600,t); lp.frequency.exponentialRampToValueAtTime(800,t+.4);
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.004); g.gain.exponentialRampToValueAtTime(.0001,t+.75); lp.connect(g); g.connect(b.mu); to(g,b,.3);
  notes.forEach((m,k)=>{ const o=osc("sawtooth",mtof(m)), og=G(.55); o.connect(og); og.connect(lp); o.start(t+k*gap); o.stop(t+.8); }); };
// a string ostinato: one bowed line, retuned and re-bowed every step (one voice for the whole bar instead of one per note)
FI.ostinato=(b,t,notes,step,v=1,bright=2000)=>{ const a=osc("sawtooth",mtof(notes[0])), c=osc("sawtooth",mtof(notes[0])), lp=filt("lowpass",bright,.7), g=ctx.createGain(), pk=.036*v; c.detune.value=8; a.detune.value=-6;
  g.gain.setValueAtTime(.0001,t); notes.forEach((m,k)=>{ const tt=t+k*step, f=mtof(m); a.frequency.setValueAtTime(f,tt); c.frequency.setValueAtTime(f,tt); g.gain.setValueAtTime(.0001,tt); g.gain.exponentialRampToValueAtTime(pk*(k%4===0?1:.75),tt+.008); g.gain.exponentialRampToValueAtTime(pk*.25,tt+step*.8); });
  const e=t+notes.length*step; g.gain.exponentialRampToValueAtTime(.0001,e+.08); a.connect(lp); c.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.25); for(const x of [a,c]){ x.start(t); x.stop(e+.12); } }; FI.flute=(b,t,m,dur,v=1)=>PI.flute(b,t,m,dur,v);
function fLead(b,inst,t,m,dur,v,prev){
  switch(inst){ case "flute": if(dur<.3) FI.pipe(b,t,m,dur,v); else PI.flute(b,t,m,dur,v); break; case "fiddle": FI.fiddle(b,t,m,dur,v,prev); break; case "harp": FI.harp(b,t,m,v*1.25,.15); break; case "lute": PI.lute(b,t,m,v*1.1); break;
    case "horn": FI.horn(b,t,[m],dur,v); break; case "brass": M.brass(b,t,[m],dur,v*.9); break; case "chant": FI.chant(b,t,m,dur,v,"o"); break; case "choir": FI.chant(b,t,m,dur,v*.9,"a"); break;
    case "shawm": FI.shawm(b,t,m,dur,v); break; case "bells": M.bell(b,t,m,dur,v*.8,0); break; case "strings": FI.strings(b,t,[m],dur,v*1.5,{att:.1,rel:.3,thin:true}); break; }
}
const LEAD_OCT={flute:12,fiddle:12,harp:12,lute:12,horn:0,brass:12,chant:0,choir:0,shawm:12,bells:12,strings:12};   // 1.25 (E2): bells an octave lower (council bells ran up to 100)
const FMODES={ionian:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],phrygian:[0,1,3,5,7,8,10],lydian:[0,2,4,6,7,9,11],mixolydian:[0,2,4,5,7,9,10],aeolian:[0,2,3,5,7,8,10],harmonic:[0,2,3,5,7,8,11]};
const fsd=(p,d)=>p.key+p.sc[((d%7)+7)%7]+12*Math.floor(d/7);
const fch=(p,d)=>[fsd(p,d),fsd(p,d+2),fsd(p,d+4)];
/* The styles. Each: tempo, meter (beats x sub steps), modes, keys, progressions (scale degrees, a chord a bar), two lead
   instruments (A and B sections), rhythm cells for the tune (steps), its scene, and bar(): what plays in one bar at a
   given level (0 sparse intro/outro, 1, 2, 3 full; c.bed = accompaniment only, under talk). */
const FS={
  elven:{name:"Elven ambience",scene:"forest",bpm:[62,72],beats:3,sub:2,modes:["lydian","ionian","dorian"],keys:[59,64],gain:1.25,
    progs:[[0,4,5,3],[0,3,4,0],[0,5,3,4],[0,1,4,0],[0,2,3,4]],leads:[["flute","strings"],["flute","harp"],["harp","choir"]],
    cells:[[[0,2],[2,2],[4,2]],[[0,4],[4,2]],[[0,6]],[[0,3],[3,1],[4,2]],[[0,2],[2,4]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl;
      FI.strings(c.b,t,ch.map(x=>x-12),c.bs,lv===0?.45:.65,{att:.8,rel:1.2,bright:1400});
      if(lv>0||c.i%2===0) [0,1,2,3,2,1].forEach((ix,k)=>FI.harp(c.b,t+k*s,(ix===3?ch[0]+12:ch[ix])+12,lv===0?.45:.6,(k-2.5)*.15));
      if(lv>=2) FI.strings(c.b,t,[ch[0]-24],c.bs,.7,{att:.5,rel:.8,bright:900,thin:true});
      if(lv>=3){ M.choir(c.b,t,ch,c.bs*.95,.4); if(c.i%2===0) FI.frame(c.b,t,.25); }
      if((lv===0||lv===3)&&p.rnd()<.5) [0,7,12].forEach((iv,k)=>M.bell(c.b,t+(3+k)*s,ch[0]+24+iv,.8,.22,(k-1)*.4));
      if(lv>=1&&!c.bed) c.lead(); }},
  halfling:{name:"Halfling party",scene:"meadow",bpm:[104,118],beats:2,sub:3,modes:["mixolydian","ionian","dorian"],keys:[60,67],gain:1,
    progs:[[0,6,0,4],[0,3,0,4],[0,4,5,4],[0,3,6,0],[0,0,3,4]],leads:[["flute","fiddle"],["fiddle","flute"],["flute","shawm"]],
    cells:[[[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]],[[0,2],[2,1],[3,2],[5,1]],[[0,3],[3,1],[4,1],[5,1]],[[0,1],[1,1],[2,1],[3,3]],[[0,2],[2,1],[3,1],[4,1],[5,1]]],
    bar(p,t,c){ return FS.tavern.jig(p,t,c,false); }},
  tavern:{name:"Tavern jig",scene:"tavern",bpm:[112,126],beats:2,sub:3,modes:["dorian","aeolian","mixolydian"],keys:[57,64],gain:1,
    progs:[[0,6,0,6],[0,3,6,4],[0,6,5,4],[0,3,0,4]],leads:[["fiddle","flute"],["fiddle","shawm"]],
    cells:[[[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]],[[0,2],[2,1],[3,2],[5,1]],[[0,1],[1,1],[2,1],[3,2],[5,1]],[[0,3],[3,1],[4,1],[5,1]]],
    bar(p,t,c){ return FS.tavern.jig(p,t,c,true); },
    jig(p,t,c,dark){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      if(lv===0){ FI.drone(b,t,[ch[0]-12,ch[0]-5],c.bs,.8); if(c.i%2===0) FI.strum(b,t,ch,.7,.03); if(!c.bed&&c.n-c.i<=2) c.lead(); return; }
      FI.strum(b,t,ch,.8); FI.strum(b,t+3*s,ch,.65); FI.lute(b,t+2*s,ch[2]+12,.35); FI.lute(b,t+5*s,ch[1]+12,.35);
      FI.lute(b,t,ch[0]-12,.6); FI.lute(b,t+3*s,ch[0]-5,.5);
      FI.frame(b,t,.7); FI.frame(b,t+2*s,.3,true); FI.frame(b,t+3*s,.55); FI.frame(b,t+5*s,.3,true);
      if(lv>=2){ FI.tamb(b,t+3*s,.6); if(dark) FI.drone(b,t,[ch[0]-12],c.bs,.5); }
      if(lv>=3){ FI.tamb(b,t+s,.35,true); FI.tamb(b,t+4*s,.35,true); M.accordion(b,t,ch,s*1.6,.6); M.accordion(b,t+3*s,ch,s*1.6,.5); }
      if(!c.bed) c.lead(); }},
  council:{name:"The wizards' council",scene:"night",bpm:[74,86],beats:4,sub:2,modes:["dorian","aeolian","phrygian"],keys:[55,61],gain:1.2,
    progs:[[0,5,3,4],[0,3,5,4],[0,6,5,4],[0,2,3,4],[0,5,1,4]],leads:[["bells","chant"],["flute","chant"],["bells","strings"]],
    cells:[[[0,2],[2,2],[4,4]],[[0,4],[4,2],[6,2]],[[0,3],[3,1],[4,4]],[[0,8]],[[0,2],[2,1],[3,1],[4,4]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      FI.organ(b,t,ch.map(x=>x-12),c.bs*.96,lv===0?.4:.55);
      if(lv>=1) [0,2,1,2,0,2,1,2].forEach((ix,k)=>FI.harp(b,t+k*s,ch[ix]+12,.42,(k%2?.3:-.3)));
      if(lv>=2){ FI.strings(b,t,[ch[0]-24],c.bs,.75,{att:.3,rel:.6,bright:900,thin:true}); PI.timp(b,t,ch[0]-24,.45); }
      if(lv>=3){ M.choir(b,t,ch,c.bs*.95,.45); if(c.i===c.n-1) PI.roll(b,t+4*s,ch[0]-24,4*s,.5); }
      if((lv===0||c.i%4===3)&&p.rnd()<.6) [0,3,7,10].forEach((iv,k)=>M.bell(b,t+(4+k)*s,ch[0]+24+iv,.7,.2,(k-1.5)*.3));
      if(lv>=1&&!c.bed) c.lead(); }},
  evil:{name:"Den of evil",scene:"cave",bpm:[64,76],beats:4,sub:2,modes:["phrygian","harmonic"],keys:[49,55],gain:.8,
    progs:[[0,1,0,1],[0,5,1,0],[0,6,5,1],[0,3,1,0],[0,1,6,4]],leads:[["chant","horn"],["chant","strings"]],
    cells:[[[0,4],[4,4]],[[0,2],[2,2],[4,4]],[[0,6],[6,2]],[[0,8]],[[0,3],[3,1],[4,4]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      FI.organ(b,t,[ch[0]-12,ch[0]-5],c.bs*.97,lv===0?.45:.6);
      if(lv>=1){ FI.drum(b,t,.8,46); FI.drum(b,t+4*s,.55,46); }
      if(lv>=2) FI.strings(b,t,[ch[0]+1,ch[0]+6],c.bs,.45,{att:.6,rel:.8,bright:1300,vib:18});
      if(lv>=3){ FI.drum(b,t+6*s,.5,52); FI.drum(b,t+7*s,.6,52); [0,3].forEach(k=>FI.strings(b,t+k*s*2,ch.map(x=>x),s*.8,.9,{att:.01,rel:.12,bright:2400})); }
      if(c.i%2===0) M.bell(b,t,ch[0]-12+12,2.4,lv===0?.3:.4,0);
      if(lv>=1&&!c.bed) c.lead(); }},
  herald:{name:"Angelic herald",scene:"heights",bpm:[70,82],beats:4,sub:2,modes:["ionian","lydian"],keys:[60,65],gain:1.1,
    progs:[[0,4,5,3],[0,3,4,4],[3,4,0,0],[0,5,3,4],[0,2,3,4]],leads:[["brass","choir"],["choir","brass"],["horn","choir"]],
    cells:[[[0,2],[2,2],[4,4]],[[0,3],[3,1],[4,4]],[[0,4],[4,4]],[[0,2],[2,1],[3,1],[4,2],[6,2]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      FI.organ(b,t,ch.map(x=>x-12),c.bs*.96,lv===0?.35:.45);
      if(c.i===0&&lv>0) [0,1,2,3,4,5,6,7,8,9].forEach(k=>FI.harp(b,t+k*.05,fsd(p,k+7),.4,(k-5)*.08));
      if(lv>=1) M.choir(b,t,ch,c.bs*.95,.4);
      if(lv>=2){ PI.timp(b,t,ch[0]-24,.5); FI.strings(b,t,[ch[0]-24,ch[0]-12],c.bs,.6,{att:.3,rel:.6,bright:1200,thin:true}); }
      if(lv>=3){ M.brass(b,t,ch,s*1.5,.55); M.brass(b,t+4*s,ch,s*1.2,.45); M.bell(b,t,ch[0]+24,1.5,.35,0); }
      if(lv===0&&p.rnd()<.6) M.bell(b,t+4*s,ch[2]+24,1.2,.25,.3);
      if(lv>=1&&!c.bed) c.lead(); }},
  orders:{name:"Battle orders",scene:"mountain",bpm:[94,108],beats:4,sub:2,modes:["aeolian","dorian"],keys:[50,57],gain:.62,
    progs:[[0,0,5,6],[0,6,5,4],[0,3,6,4],[0,5,6,0],[0,4,0,6]],leads:[["horn","brass"],["horn","strings"]],
    cells:[[[0,3],[3,1],[4,4]],[[0,2],[2,2],[4,2],[6,2]],[[0,1],[1,1],[2,2],[4,4]],[[0,4],[4,3],[7,1]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b, h=s/2;
      FI.drum(b,t,.8,50); if(lv>=1) FI.drum(b,t+4*s,.6,50);
      if(lv>=1){ for(const [x,v] of [[0,.55],[3,.3],[4,.45],[6,.3],[6.5,.25],[7,.35],[7.5,.3]]) D.snare(b,t+x*s,v,.12,.8); }
      if(lv>=1) FI.ostinato(b,t,[ch[0]-12,ch[0]-12,ch[2]-24,ch[0]-12,ch[0]-12,ch[0]-12,ch[2]-24,ch[2]-24],s,.8,1600);
      if(lv>=2){ FI.strings(b,t,ch.map(x=>x-12),c.bs,.5,{att:.4,rel:.6,bright:1400}); if(c.i===0) D.crash(b,t,.5); }
      if(lv>=3){ PI.timp(b,t,ch[0]-24,.7); PI.timp(b,t+4*s,ch[0]-24,.6); for(let k=0;k<4;k++) D.snare(b,t+6*s+k*h,.2+.08*k,.1,.8); }
      if(lv===0){ FI.drum(b,t+4*s,.4,50); if(c.i%2===1) FI.horn(b,t,[ch[0],ch[2]],c.bs*.7,.6); }
      if(lv>=1&&!c.bed) c.lead(); }},
  battle:{name:"Glorious battle",scene:"mountain",bpm:[122,138],beats:4,sub:2,modes:["aeolian","harmonic","dorian"],keys:[50,56],gain:.43,
    progs:[[0,5,6,0],[0,6,5,6],[0,3,6,4],[0,5,3,4],[0,6,3,4]],leads:[["brass","choir"],["horn","choir"],["strings","brass"]],
    cells:[[[0,3],[3,1],[4,4]],[[0,2],[2,2],[4,4]],[[0,4],[4,2],[6,2]],[[0,1],[1,1],[2,2],[4,4]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b, h=s/2;
      if(lv===0){ FI.strings(b,t,ch.map(x=>x-12),c.bs,.5,{att:.6,rel:1,bright:1200}); FI.drum(b,t,.6,48); if(c.i%2) PI.roll(b,t+4*s,ch[0]-24,4*s,.45); if(!c.bed&&c.n-c.i<=2) c.lead(); return; }
      FI.ostinato(b,t,Array.from({length:16},(_,k)=>[ch[0],ch[0],ch[2],ch[0]][k%4]-12),h,lv>=2?.95:.75);
      FI.drum(b,t,.9,48); FI.drum(b,t+3*s,.6,48); FI.drum(b,t+4*s,.8,48);
      if(lv>=2){ D.snare(b,t+2*s,.45,.25); D.snare(b,t+6*s,.45,.25); FI.drum(b,t+7*s,.5,56); FI.drum(b,t+7.5*s,.55,60); if(c.i===0) D.crash(b,t,.7); }
      if(lv>=3){ M.brass(b,t,ch,s*1.5,.6); M.brass(b,t+3*s,ch,s*1.4,.5); M.choir(b,t,ch,c.bs*.95,.45); PI.timp(b,t,ch[0]-24,.7); }
      if(!c.bed) c.lead(); }},
  lament:{name:"Bard's lament",scene:"hearth",bpm:[58,68],beats:3,sub:2,modes:["aeolian","dorian"],keys:[57,62],gain:1.35,
    progs:[[0,5,3,4],[0,3,5,4],[0,6,5,4],[0,4,5,0],[0,2,5,4]],leads:[["fiddle","flute"],["flute","fiddle"]],
    cells:[[[0,2],[2,2],[4,2]],[[0,4],[4,2]],[[0,3],[3,1],[4,2]],[[0,6]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      [0,2,1,2,0,2].forEach((ix,k)=>FI.lute(b,t+k*s,(k===0?ch[0]:ch[ix]+12),lv===0?.45:.55));
      if(lv>=1) FI.strings(b,t,[ch[0]-24],c.bs,.7,{att:.5,rel:.9,bright:800,thin:true});
      if(lv>=2) [1,3,5].forEach(k=>FI.harp(b,t+k*s,ch[(k+1)%3]+24,.3,.3));
      if(lv>=3){ FI.strings(b,t,ch.map(x=>x),c.bs,.45,{att:.7,rel:1,bright:1500}); if(c.i%2===0) FI.frame(b,t,.3); }
      if(lv>=1&&!c.bed) c.lead(); }},
  procession:{name:"Royal procession",scene:"meadow",bpm:[86,98],beats:4,sub:2,modes:["ionian","mixolydian"],keys:[58,65],gain:1,
    progs:[[0,3,4,0],[0,4,5,3],[3,4,0,0],[0,5,3,4],[0,6,3,0]],leads:[["shawm","brass"],["brass","shawm"],["shawm","fiddle"]],
    cells:[[[0,2],[2,2],[4,2],[6,2]],[[0,3],[3,1],[4,4]],[[0,2],[2,1],[3,1],[4,4]],[[0,4],[4,2],[6,2]]],
    bar(p,t,c){ const s=c.st, ch=c.ch, lv=c.lvl, b=c.b;
      FI.drone(b,t,[p.key-12,p.key-5],c.bs,lv===0?.6:.8);
      if(lv>=1){ [0,2,4,6].forEach(k=>FI.frame(b,t+k*s,k%4?.4:.6)); FI.frame(b,t+7*s,.25,true); [0,4].forEach(k=>FI.strum(b,t+k*s,ch,.65)); }
      if(lv>=2){ FI.tamb(b,t+2*s,.5); FI.tamb(b,t+6*s,.5); FI.lute(b,t,ch[0]-12,.6); FI.lute(b,t+4*s,ch[0]-5,.5); }
      if(lv>=3){ M.brass(b,t,ch,s*1.6,.45); M.brass(b,t+4*s,ch,s*1.2,.4); if(c.i%4===0) M.bell(b,t,p.key+24,1.6,.3,0); }
      if(lv===0&&c.i%2===0) M.bell(b,t,p.key+12,2.4,.25,0);
      if(lv>=1&&!c.bed) c.lead(); }},
};

/* Extra instruments (from 1.16): a hi-hat, braams, impacts and a synth bass. HEARYE's own music no longer uses them
   (it is back to its 1.15 sound); the style matrix and the groove can. */
FI.hat=(b,t,v=1,open=false)=>{ const n=nz(t,open?.35:.06), hp=filt("highpass",open?7000:8500,.7), g=ctx.createGain(); env(g,t,.001,(open?.06:.09)*v,open?.28:.035); n.connect(hp); hp.connect(g); g.connect(b.dr); };
FI.braam=(b,t,root,dur,v=1)=>{ const sh=ctx.createWaveShaper(); sh.curve=SAT; const lp=filt("lowpass",180,2), g=ctx.createGain();
  lp.frequency.setValueAtTime(160,t); lp.frequency.exponentialRampToValueAtTime(1400,t+.35); lp.frequency.exponentialRampToValueAtTime(260,t+dur);
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.1*v,t+.08); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  for(const [m,dt] of [[root-24,-8],[root-24,8],[root-12,0],[root-5,-4]]){ const o=osc("sawtooth",mtof(m)); o.detune.value=dt; o.connect(sh); o.start(t); o.stop(t+dur+.05); } sh.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.5); };
FI.impact=(b,t,v=1)=>{ const o=osc("sine",90), g=ctx.createGain(); o.frequency.setValueAtTime(90,t); o.frequency.exponentialRampToValueAtTime(32,t+.8); env(g,t,.003,.9*v,1.4); o.connect(g); g.connect(b.dr); o.start(t); o.stop(t+1.5);
  const n=nz(t,1.2), lp=filt("lowpass",900), ng=ctx.createGain(); env(ng,t,.002,.3*v,1); n.connect(lp); lp.connect(ng); ng.connect(b.dr); to(ng,b,.8); D.crash(b,t,.7*v); duck(b,t,.4); };
FI.synbass=(b,t,m,dur,v=1,dark=false)=>{ const a=osc("sawtooth",mtof(m)), c=osc("square",mtof(m-12)), lp=filt("lowpass",dark?380:620,3), g=ctx.createGain(), cg=G(.6);
  lp.frequency.setValueAtTime(dark?700:1300,t); lp.frequency.exponentialRampToValueAtTime(dark?240:380,t+Math.min(.25,dur)); env(g,t,.004,.2*v,Math.max(.08,dur));
  a.connect(lp); c.connect(cg); cg.connect(lp); lp.connect(g); g.connect(b.dr); for(const x of [a,c]){ x.start(t); x.stop(t+dur+.1); } };
const FS_KEYS=Object.keys(FS);
/* A piece: picked from a seed, so the same seed always writes the same piece (Save renders it again from the top). */
function fMotif(p,rnd,prog,end){   // a 4-bar phrase over prog, in scale degrees: steps mostly, chord tones on the downbeats, ends on the tonic
  const out=[]; let d=rnd()<.5?2:4; const cells=p.S.cells;
  for(let bar=0;bar<4;bar++){ const cell=cells[Math.floor(rnd()*cells.length)], deg=prog[bar], notes=[];
    cell.forEach(([pos,len],k)=>{ if(pos===0){ const tones=[deg,deg+2,deg+4,deg+7,deg-3]; let best=tones[0]; for(const x of tones) if(Math.abs(x-d)<Math.abs(best-d)) best=x; d=best; }
      else { const r=rnd(); d+=r<.38?1:r<.76?-1:r<.86?2:r<.94?-2:(rnd()<.5?3:-3); }
      if(d>9) d-=2; if(d<-2) d+=2;
      if(bar===3&&k===cell.length-1&&end) d=d>3?7:0;
      notes.push([pos,len,d]); });
    out.push(notes); }
  return out;
}
function fPiece(style,seed,target){
  const rnd=srand(seed>>>0), S=FS[style], pk=a=>a[Math.floor(rnd()*a.length)];
  const p={style,seed,S,rnd,name:S.name,bpm:Math.round(S.bpm[0]+rnd()*(S.bpm[1]-S.bpm[0])),mode:pk(S.modes)};
  p.sc=FMODES[p.mode]; p.key=Math.round(S.keys[0]+rnd()*(S.keys[1]-S.keys[0]));
  p.st=60/p.bpm/(S.sub===3?3:2); p.steps=S.beats*S.sub; p.bs=p.st*p.steps;
  p.target=target||150; p.progA=pk(S.progs); do p.progB=pk(S.progs); while(p.progB===p.progA&&S.progs.length>1);
  p.leads=pk(S.leads);
  p.mA=fMotif(p,rnd,p.progA,false); p.mA2=[...p.mA.slice(0,2),...fMotif(p,rnd,p.progA,true).slice(2)];
  p.mB=fMotif(p,rnd,p.progB,false); p.mB2=[...p.mB.slice(0,2),...fMotif(p,rnd,p.progB,true).slice(2)];
  { const hi=Math.max(...[p.mA,p.mA2,p.mB,p.mB2].flat(2).filter(Array.isArray).map(n=>fsd(p,n[2])).concat(-99)); p.oct={};   // 1.25 (E2): a lead whose line would top G6 (E6 for bells) plays it an octave down in this piece
    for(const i of p.leads){ const o=LEAD_OCT[i]??12; p.oct[i]=hi+o>(i==="bells"?88:91)?o-12:o; } }
  const T=target||150, secs=[["intro",4,0],["A",8,1],["A",8,2],["B",8,2],["bridge",4,1],["A",8,3]];
  let bars=secs.reduce((a,x)=>a+x[1],0)+4, k=0; while(bars*p.bs<T-p.bs*4&&k<12){ secs.push(k%2?["A",8,3]:["B",8,3]); bars+=8; k++; }
  secs.push(["outro",4,0]); let at=0; p.secs=secs.map(([t,n,l])=>{ const x={t,n,lvl:l,at}; at+=n; return x; }); p.bars=at; p.len=at*p.bs+3.5;
  return p;
}
function fBar(p,bar,t,b){   // schedules one bar of a piece
  if(b&&b.mxId){ if(p.st0==null){ p.st0=p.st; p.bs0=p.bs; }   // the style matrix (TUNE): tempo and groove pulls
    if(MXON.hearye){ p.st=p.st0/mxTempoMul("hearye",p.bpm); p.bs=p.st*p.steps; mxBarT0=t; mxBarSt=p.st; mxBarSteps=p.steps; b.mxBpm=p.bpm; mxGroove("hearye",b,t,p.bs,bar); } else { p.st=p.st0; p.bs=p.bs0; }
    if(GON.hearye){ if(gOn("hearye","bpm")){ p.st=p.st0*p.bpm/GRV.hearye.bpm; p.bs=p.st*p.steps; } b.gGrid={t0:t,st:p.st,n:p.steps,bar}; const bs0=p.bs;   // the groove (TUNE): tempo, time signature, drums
      if(gOn("hearye","meter")&&p.S.sub!==3&&p.S.beats===4) p.bs=bs0*METERS[GRV.hearye.meter].ratio; gPump("hearye",b,t,bs0,bar,false); } }
  const sec=p.secs.find(x=>bar>=x.at&&bar<x.at+x.n); if(!sec) return; const i=bar-sec.at;
  const B=sec.t==="B", prog=B?p.progB:p.progA, deg=sec.t==="outro"?0:sec.t==="intro"?(i<2?0:prog[i%4]):prog[i%4];
  const mel=sec.t==="A"?(i<4?p.mA:p.mA2)[i%4]:B?(i<4?p.mB:p.mB2)[i%4]:sec.t==="bridge"?p.mB[i%4]:sec.t==="intro"&&i>=sec.n-2?p.mA[(i+2)%4]:null;
  const inst=B||sec.t==="bridge"?p.leads[1]:p.leads[0], LO=x=>p.oct&&p.oct[x]!=null?p.oct[x]:LEAD_OCT[x]??12, oct=LO(inst);
  const c={b,st:p.st,bs:p.bs,lvl:sec.t==="outro"?0:sec.lvl,i,n:sec.n,ch:fch(p,deg),sec:sec.t,bed:false,
    lead:()=>{ if(!mel) return; let prev=null; const v=sec.lvl>=3?1:.85; mel.forEach(([pos,len,d])=>{ const m=fsd(p,d)+oct; fLead(b,inst,t+pos*p.st,m,len*p.st*.95,v,prev); if(sec.lvl>=3&&p.leads[0]!==p.leads[1]&&sec.t==="A") fLead(b,p.leads[1],t+pos*p.st,m+LO(p.leads[1])-oct,len*p.st*.95,.5,prev); prev=m; }); }};
  if(glOn&&b&&b.mxId&&FXW.get(ctx)) glitchBar(t,p.bs,p.st*p.S.sub);   // 1.25 (E3): GLITCH, once a bar
  if(MXON.hearye&&b&&b.mxId&&!(sec.t==="outro"&&i===sec.n-1)) mxBeat("hearye",b,t,p.st*p.steps,p.S.beats,p.S.sub,c.ch,bar,c.lvl,60/(p.st*p.S.sub));   // the style matrix: a full beat and a bass line under the piece
  if(sec.t==="outro"&&i===sec.n-1){ FI.strings(b,t,fch(p,0).map(x=>x-12),p.bs*1.5,.5,{att:.2,rel:2}); [0,2,4,7,9,11,14].forEach((d,k)=>FI.harp(b,t+k*.08,fsd(p,d)+12,.45,(k-3)*.12)); M.bell(b,t+.6,p.key+24,2.5,.3,0); return; }
  try{ p.S.bar(p,t,c); }catch(e){}
}
/* Ambience: forests, meadows, mountains, a cave, a tavern, a hearth. Continuous beds (wind, a stream, rain, a crowd) and
   events (birds, crickets, owls, drips, a far-off eagle, a distant bell, glass clinks, a crackling fire), scheduled a second ahead. */
const SCENE_GAIN={forest:2.2,meadow:3.5,night:4.5,cave:1.6,heights:3,mountain:1.7,tavern:2,hearth:2};   // evens the scenes out (about -32 dB at full)
const AMB_SEC=[1,.6,.4,.32], SEC_GAIN=[1.8,1.15,1,.92];   // by section level (0 intro/outro .. 3 full): the ambience recedes as the music fills in, and the quiet sections come up a little
const SCENES={forest:{wind:.45,leaves:.8,birds:9,stream:.7,owl:.6,shimmer:2},meadow:{wind:.35,birds:16,crickets:5,bell:.4},night:{wind:.3,crickets:10,owl:2,shimmer:2.5},
  cave:{wind:.5,low:1,drips:14},heights:{wind:.6,birds:5,bell:1.2},mountain:{wind:1.1,low:.5,eagle:1.2},tavern:{murmur:1,clinks:7,fire:.5},hearth:{fire:1,rain:.8}};
function ambBed(A,kind,lvl){ const n=ctx.createBufferSource(); n.buffer=noiseBuf; n.loop=true; n.start(ctx.currentTime,R()*1.5); A.src.push(n); const g=G(0); g.connect(A.bus);
  if(kind==="wind"){ const bp=filt("bandpass",420,.6), lp=filt("lowpass",1100,.5); n.connect(bp); bp.connect(lp); lp.connect(g); return {g,f:bp.frequency,base:.02*lvl,lo:250,hi:800}; }   // soft and low: a hissy wind read as static
  if(kind==="leaves"){ const hp=filt("highpass",3200); n.connect(hp); hp.connect(g); return {g,base:.006*lvl}; }
  if(kind==="low"){ const lp=filt("lowpass",160); n.connect(lp); lp.connect(g); return {g,base:.07*lvl}; }
  if(kind==="stream"){ const bp=filt("bandpass",2300,.5), hp=filt("highpass",800); n.connect(bp); bp.connect(hp); hp.connect(g); return {g,base:.014*lvl,flutter:true}; }
  if(kind==="rain"){ const hp=filt("highpass",1800), lp=filt("lowpass",7000); n.connect(hp); hp.connect(lp); lp.connect(g); return {g,base:.013*lvl}; }
  if(kind==="fire"){ const lp=filt("lowpass",300); n.connect(lp); lp.connect(g); return {g,base:.025*lvl}; }
  if(kind==="murmur"){ const mix=G(1); for(const [f,q] of [[330,3],[720,4],[1450,5]]){ const bp=filt("bandpass",f,q); n.connect(bp); bp.connect(mix); } mix.connect(g); return {g,base:.042*lvl,flutter:true,slow:true}; }
}
const AMB_EV={
  birds(A,t){ const sp=Math.floor(R()*3), p=pan(rr(-.8,.8)), g=ctx.createGain(); g.gain.value=0; p.connect(A.b.mu); g.connect(p); to(g,A.b,.25); const o=osc("sine",3000); o.connect(g); let tt=t;
    const n=sp===2?2:ri(2,6); for(let k=0;k<n;k++){ const f0=sp===0?rr(2400,3200):sp===1?rr(3600,4200):(k?1900:2400), f1=sp===0?f0*rr(1.3,1.6):sp===1?f0*.9:f0*.92, d=sp===1?.05:sp===0?rr(.06,.12):.22;
      o.frequency.setValueAtTime(f0,tt); o.frequency.exponentialRampToValueAtTime(f1,tt+d); g.gain.setValueAtTime(.0001,tt); g.gain.linearRampToValueAtTime(.014,tt+.01); g.gain.linearRampToValueAtTime(.0001,tt+d); tt+=d+(sp===1?.03:rr(.05,.16)); }
    o.start(t); o.stop(tt+.1); },
  crickets(A,t){ const o=osc("sine",rr(4200,4700)), g=ctx.createGain(), p=pan(rr(-.7,.7)); g.gain.value=0; o.connect(g); g.connect(p); p.connect(A.b.mu); let tt=t;
    for(let c=0;c<ri(2,5);c++){ for(let k=0;k<3;k++){ g.gain.setValueAtTime(.006,tt); g.gain.setValueAtTime(0,tt+.018); tt+=.034; } tt+=rr(.25,.4); } o.start(t); o.stop(tt+.05); },
  owl(A,t){ const g=ctx.createGain(), lp=filt("lowpass",900), p=pan(rr(-.6,.6)); g.gain.value=0; lp.connect(g); g.connect(p); p.connect(A.b.mu); to(g,A.b,.6); const o=osc("sine",370); o.connect(lp); let tt=t;
    for(let k=0;k<ri(2,4);k++){ const d=k===1?.2:.38; o.frequency.setValueAtTime(380,tt); o.frequency.exponentialRampToValueAtTime(335,tt+d); g.gain.setValueAtTime(.0001,tt); g.gain.linearRampToValueAtTime(.022,tt+.06); g.gain.linearRampToValueAtTime(.0001,tt+d); tt+=d+(k===0?.15:.3); }
    o.start(t); o.stop(tt+.1); },
  shimmer(A,t){ const pent=[0,2,4,7,9], k0=A.key||62; for(let k=0;k<ri(3,5);k++) M.bell(A.b,t+k*rr(.14,.3),k0+24+pent[ri(0,4)]+(R()<.4?12:0),1.4,.12,rr(-.6,.6)); },
  drips(A,t){ const f=rr(1100,2100), o=osc("sine",f), g=ctx.createGain(), p=pan(rr(-.7,.7)); o.frequency.setValueAtTime(f,t); o.frequency.exponentialRampToValueAtTime(f*.55,t+.05); env(g,t,.001,.03,.08); o.connect(g); g.connect(p); p.connect(A.b.mu); to(g,A.b,1); o.start(t); o.stop(t+.15); },
  eagle(A,t){ const o=osc("sawtooth",2300), lp=filt("lowpass",2600), g=ctx.createGain(), lfo=osc("sine",22), lg=G(60), p=pan(rr(-.7,.7)); lfo.connect(lg); lg.connect(o.frequency);
    o.frequency.setValueAtTime(2300,t); o.frequency.exponentialRampToValueAtTime(1400,t+1); g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.005,t+.08); g.gain.exponentialRampToValueAtTime(.0001,t+1.05);
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(A.b.mu); to(g,A.b,1.2); o.start(t); lfo.start(t); o.stop(t+1.1); lfo.stop(t+1.1); },
  bell(A,t){ M.bell(A.b,t,(A.key||62)+rr(0,1)*0+12,2.6,.18,rr(-.5,.5)); M.bell(A.b,t+1.4,(A.key||62)+7,2.6,.12,rr(-.5,.5)); },
  clinks(A,t){ const m=ri(94,100); M.bell(A.b,t,m,.12,.14,rr(-.6,.6)); if(R()<.6) M.bell(A.b,t+rr(.06,.12),m+ri(-2,3),.1,.1,rr(-.6,.6)); },
  fire(A,t){ for(let k=0;k<ri(2,7);k++){ const tt=t+R()*.9, n=nz(tt,.01), hp=filt("highpass",rr(1500,4000)), g=ctx.createGain(), p=pan(rr(-.4,.4)); env(g,tt,.0005,rr(.02,.06),.006); n.connect(hp); hp.connect(g); g.connect(p); p.connect(A.b.mu); } },
};
function ambNew(scene,key,level){
  const sc=SCENES[scene]||SCENES.forest, out=G(.0001); out.connect(fg().in);
  const A={scene,key,out,b:makeBus(out,fg().rev),bus:null,src:[],beds:[],next:0,level:level??1,sg:SCENE_GAIN[scene]??2,dead:false}; A.bus=A.b.bus;
  for(const k of ["wind","leaves","low","stream","rain","fire","murmur"]) if(sc[k]) A.beds.push(ambBed(A,k,sc[k]));
  A.ev=Object.keys(AMB_EV).filter(k=>sc[k]).map(k=>[k,sc[k]]); A.next=ctx.currentTime; return A;
}
function ambRun(A,until){   // schedules the scene up to `until` (live: a second ahead; offline: the whole render)
  while(A.next<until){ const t=A.next, w=Math.min(1,until-t), sl=x=>x.slow?.9:.18;
    for(const x of A.beds){ const v=x.base*(x.flutter?rr(.7,1.15):rr(.55,1.25)); x.g.gain.setTargetAtTime(v,t,x.f?1.2:sl(x)); if(x.f) x.f.setTargetAtTime(rr(x.lo,x.hi),t,1.5); }
    for(const [k,rate] of A.ev) if(R()<rate*w/60) try{ AMB_EV[k](A,t+R()*w); }catch(e){}
    A.next+=w; }
}
function ambFade(A,v,sec){ if(!A||!ctx) return; A.v=v; try{ fadeTo(A.out.gain,Math.max(.0001,v*A.sg*ambMul()),sec,ctx.currentTime); }catch(e){} }
function ambKill(A,sec){ if(!A||A.dead) return; A.dead=true; ambFade(A,.0001,sec); setTimeout(()=>{ for(const s of A.src) try{ s.stop(); }catch(e){} try{ A.out.disconnect(); }catch(e){} },sec*1000+200); }
/* Show music: every show, ad and ID gets its own style's theme (a few bars of the style, always the same for that
   style, ending on a hit), a bed (the accompaniment, softly), stingers and a closing cadence. */
const FCUE={}; function fCueP(style){ return FCUE[style]||(FCUE[style]=fPiece(style,[...style].reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0,60)); }
const F_STINGS=[
  (p,b,t)=>{ const ch=fch(p,0); [0,2,4,7,9,11,14].forEach((d,k)=>FI.harp(b,t+k*.05,fsd(p,d)+12,.6,(k-3)*.12)); FI.strings(b,t+.35,ch.map(x=>x-12),.9,.8,{att:.05,rel:.8}); M.bell(b,t+.35,p.key+24,1.2,.35,0); return 1.8; },
  (p,b,t)=>{ const ch=fch(p,0), m=fsd(p,4)+12; [[0,m,.14],[.16,m,.14],[.32,fsd(p,7)+12,.7]].forEach(([d,x,l])=>FI.horn(b,t+d,[x,x-7],l,.9)); FI.drum(b,t+.32,1,52); PI.timp(b,t+.32,p.key-24,.8); return 1.6; },
  (p,b,t)=>{ for(let k=0;k<6;k++) FI.drum(b,t+k*.09,.35+k*.1,60); M.brass(b,t+.55,fch(p,0),.8,.8); FI.drum(b,t+.55,1,48); D.crash(b,t+.55,.5); return 1.7; },
  (p,b,t)=>{ [0,2,4,7].forEach((d,k)=>PI.lute(b,t+k*.07,fsd(p,d)+12,.8)); FI.tamb(b,t+.3,.8,true); PI.flute(b,t+.3,fsd(p,7)+12,.7,1); M.bell(b,t+.3,p.key+24,.9,.3,0); return 1.4; },
  (p,b,t)=>{ M.organ(b,t,fch(p,0).map(x=>x-12),1.2,.8,1); FI.chant(b,t,fsd(p,4)-12,1.1,.9,"o"); M.bell(b,t,p.key+12,1.6,.35,0); return 1.6; },
];
const F_STYLE_STINGS={elven:[0,3,4],halfling:[3,0,2],tavern:[3,2,0],council:[4,0,1],evil:[4,2,1],herald:[1,0,2],orders:[1,2],battle:[2,1],lament:[0,3],procession:[1,3,2]};
const F_STING_GAIN=[2.5,1,.6,1.4,1.25], F_BED_GAIN={elven:2,lament:2,halfling:.8,tavern:.75,evil:.32,orders:.3,battle:.17};   // measured: every sting about the same loudness, every bed about -29 dB under the voices
const F_CUE_GAIN={battle:1,orders:1,evil:1.1,council:1.15,elven:1.25,lament:1.3,herald:1.05,halfling:1,tavern:1,procession:1};
function fCue(style,kind,t,level=1){   // plays one cue; returns its length in seconds
  const p=fCueP(style), gn=(F_CUE_GAIN[style]??1)*level;
  if(kind==="theme"){ const b=fBus(gn), n=Math.max(2,Math.min(4,Math.floor(7/p.bs))), at=p.secs.find(x=>x.t==="A"&&x.lvl===3).at;
    for(let k=0;k<n;k++) fBar(p,at+k,t+k*p.bs,b); const e=t+n*p.bs; FI.strings(b,e,fch(p,0).map(x=>x-12),1.4,.9,{att:.03,rel:1}); M.bell(b,e,p.key+24,1.6,.35,0); FI.drum(b,e,.8,50); return n*p.bs+1.6; }
  if(kind==="sting"||kind==="id"){ const list=kind==="id"?[1,0]:F_STYLE_STINGS[style]||[0], key=kind+style; let dk=fStingDeck[key]; if(!dk||!dk.length) dk=fStingDeck[key]=[...list].sort(()=>R()-.5);
    const i=dk.pop(); return F_STINGS[i](kind==="id"?fCueP("herald"):p,fBus((kind==="id"?F_CUE_GAIN.herald:gn)*F_STING_GAIN[i]),t); }
  if(kind==="outro"){ const b=fBus(gn); fBar({...p},p.secs.find(x=>x.t==="A"&&x.lvl===3).at+3,t,b); const e=t+p.bs; FI.strings(b,e,fch(p,0).map(x=>x-12),1.8,.9,{att:.05,rel:1.4}); [0,2,4,7].forEach((x,k)=>FI.harp(b,e+k*.06,fsd(p,x)+12,.5)); FI.drum(b,e,.7,50); M.bell(b,e,p.key+24,2,.3,0); return p.bs+2.2; }
  return 0;
}
const fStingDeck={};
// the bed under talk: the style's accompaniment, a bar at a time, softly, stopping by itself after 50 seconds
function fBedOn(st,style,t0){ if(!st||st.bed) return; const p=fCueP(style), b=fBus(.0001), bed={b,p,next:t0,bar:0,stop:false,until:Date.now()+50000};
  b.gain.gain.setValueAtTime(.0001,ctx.currentTime); b.gain.gain.linearRampToValueAtTime(.16*(F_CUE_GAIN[style]??1)*(F_BED_GAIN[style]??1),t0+.8); st.bed=bed;
  const at=p.secs.find(x=>x.t==="A"&&x.lvl===2).at;
  const pump=()=>{ if(bed.stop||!ctx||st.dead) return fBedOff(st,1.5,bed); if(Date.now()>bed.until) return fBedOff(st,3,bed);
    while(bed.next<ctx.currentTime+1.5){ const t=Math.max(bed.next,ctx.currentTime+.05); const c={b,st:p.st,bs:p.bs,lvl:2,i:bed.bar%8,n:8,ch:fch(p,p.progA[bed.bar%4]),sec:"A",bed:true,lead:()=>{}}; try{ p.S.bar(p,t,c); }catch(e){} bed.bar++; bed.next=t+p.bs; }
    bed.t=setTimeout(pump,400); };
  pump(); }
function fBedOff(st,fade=1.6,which){ const bed=which||(st&&st.bed); if(!bed) return; if(st&&st.bed===bed) st.bed=null; if(bed.off) return; bed.off=bed.stop=true; clearTimeout(bed.t);
  try{ fadeTo(bed.b.gain.gain,.0001,fade,ctx.currentTime); }catch(e){} setTimeout(()=>{ try{ bed.b.gain.disconnect(); }catch(e){} },fade*1000+4000); }
/* The station: piece, then (every piece or two) a break, then the next piece. Breaks are a list of lines played one at
   a time (like PTLK), so a station ID can cut in between lines; music cues, nowplaying and the Save recording ride along. */
const fairTypes=FAIRE?Object.fromEntries([...FAIRE.shows.map(s=>s.id),"joust","ponies","news","ads","callers","ids","amb"].map(k=>[k,true])):{};
let fair=null;
function fairCast(extra){ return talkCast({crier:FAIRE.HOSTS.crier,bard:FAIRE.HOSTS.bard,herald:FAIRE.HOSTS.herald,...extra}); }
function fairStyleNext(){ const st=fair; let c=FS_KEYS.filter(k=>!st.recent.includes(k)); if(!c.length) c=FS_KEYS; const s=pick(c); st.recent.push(s); while(st.recent.length>4) st.recent.shift(); return s; }
function fairMakeNext(){ const st=fair; if(!st||st.next) return st&&st.next; const style=fairStyleNext(), seed=Math.floor(R()*4294967296), base=rr(125,165), p=fPiece(style,seed,base*gLenMul("hearye"));
  p.base=base; p.title=FAIRE.piece(); p.artist=FAIRE.artist(); st.next=p; return p; }
function fairOn(){ fairOff(); if(!FAIRE) return; fair={n:0,recent:[],next:null,piece:null,lines:null,i:0,cast:null,since:0,gap:1,bed:null,dead:false,amb:null,mode:"talk",talkRecent:[],t:0};
  const st=fair; fairMakeNext(); const L=[]; if(fairTypes.ids) L.push(["music","id"],["crier",FAIRE.ids()]); L.push(["piece"]); if(fairTypes.ids) L.push(["pause",2500],["bard",FAIRE.bardIntro(fairNp(st.next))]);
  st.t=setTimeout(()=>fairRun(st,L),600); }
function fairOff(){ const st=fair; if(!st) return; st.dead=true; clearTimeout(st.t); clearTimeout(st.pt); fBedOff(st,.8); fairPieceEnd(st,1.2); ambKill(st.amb,1.2); st.amb=null; fair=null; }
const fairNp=p=>({title:p.title,artist:p.artist});
function fairAmb(st,scene,key){ if(!fairTypes.amb){ if(st.amb){ ambKill(st.amb,2); st.amb=null; } return; }
  if(st.amb&&st.amb.scene===scene) return; const old=st.amb; st.amb=ambNew(scene,key); ambFade(st.amb,1,4); if(old) ambKill(old,4);
  const A=st.amb, run=()=>{ if(A.dead||st.dead) return; ambRun(A,ctx.currentTime+1.2); A.t=setTimeout(run,500); }; run(); }
function fairAmbLevel(st,v,sec=2){ if(st&&st.amb) ambFade(st.amb,v,sec); }
function fairPieceStart(st){ const p=fairMakeNext(); st.next=null; if(!p) return; st.mode="piece"; const t0=ctx.currentTime+.15;
  const b=fBus(.0001), lv0=p.S.gain*SEC_GAIN[0]; b.mxId="hearye"; b.gKey={root:p.key,sc:p.sc}; b.gNoMeter=p.S.sub===3||p.S.beats!==4; b.gain.gain.setValueAtTime(.0001,ctx.currentTime); b.gain.gain.linearRampToValueAtTime(lv0,t0+.3);
  const pc={p,b,next:t0,bar:0,t0,done:false,lv:lv0,pend:[]}; st.piece=pc; st.since++;
  fairAmb(st,p.S.scene,p.key); fairAmbLevel(st,1,2);
  nowPlaying={station:"hearye",title:p.title,style:p.name,artist:p.artist,bpm:p.bpm,key:`${NOTE_NAMES[p.key%12]} ${p.mode}`,time:p.S.sub===3?`${p.S.beats*3}/8`:`${p.S.beats}/4`}; emit("nowplaying",nowPlaying);
  const pump=()=>{ if(st.dead||st.piece!==pc) return;
    while(pc.bar<p.bars&&pc.next<ctx.currentTime+1.6){ const sec=p.secs.find(x=>pc.bar>=x.at&&pc.bar<x.at+x.n); if(sec&&pc.bar===sec.at&&pc.bar>0) pc.pend.push([pc.next,sec.t==="outro"?0:sec.lvl]);
      fBar(p,pc.bar,pc.next,b); pc.bar++; pc.next+=p.bs; }
    while(pc.pend.length&&pc.pend[0][0]<=ctx.currentTime+.05){ const l=pc.pend.shift()[1]; pc.lv=p.S.gain*SEC_GAIN[l]; if(!pc.duck) fadeTo(b.gain.gain,pc.lv,2,ctx.currentTime); if(st.mode==="piece") fairAmbLevel(st,AMB_SEC[l],3); }
    if(pc.bar>=p.bars){ if(ctx.currentTime>pc.next+2.4){ fairPieceEnd(st,.5); fairAfterPiece(st); return; } }
    st.pt=setTimeout(pump,300); };
  pump(); }
function fairPieceEnd(st,fade){ const pc=st&&st.piece; if(!pc) return; st.piece=null; clearTimeout(st.pt); try{ fadeTo(pc.b.gain.gain,.0001,fade,ctx.currentTime); }catch(e){} setTimeout(()=>{ try{ pc.b.gain.disconnect(); }catch(e){} },fade*1000+4500); st.last=pc.p; }
function fairAfterPiece(st){ if(st.dead||!on) return; st.mode="talk"; const prev=st.last, nx=fairMakeNext(), L=[], talky=Object.keys(fairTypes).some(k=>k!=="ids"&&k!=="amb"&&fairTypes[k]);
  if(talky&&st.since>=st.gap){ st.since=0; st.gap=R()<.45?1:2;
    if(fairTypes.ids&&prev) L.push(["bard",FAIRE.bardBack(fairNp(prev))]);
    if(fairTypes.ids&&R()<.5) L.push(["music","id"],["crier",FAIRE.ids()]);
    L.push(...fairSegment(st));
    if(fairTypes.ids) L.push(["piece"],["pause",2500],["bard",FAIRE.bardIntro(fairNp(nx))]); else L.push(["piece"]); }
  else if(fairTypes.ids&&prev&&R()<.4) L.push(["bard",FAIRE.bardBack(fairNp(prev))],["piece"],["pause",2500],["bard",R()<.5?FAIRE.bardIntro(fairNp(nx)):FAIRE.bridge()]);
  else L.push(["pause",1500],["piece"]);
  fairRun(st,L); }
// one talk segment (a show, the joust, the ponies, the news, a caller or an ad block), with its music, and maybe ads after
function fairSegment(st){
  const W=[]; const enabled=FAIRE.shows.filter(s=>fairTypes[s.id]); let shows=enabled.filter(s=>!st.talkRecent.includes(s.id)); if(!shows.length) shows=enabled;   // 1.25: with three or fewer shows on, they come round again
  if(shows.length) W.push(["show",4]); if(fairTypes.joust) W.push(["joust",1.1]); if(fairTypes.ponies) W.push(["ponies",.9]); if(fairTypes.callers) W.push(["callers",1.4]); if(fairTypes.ads) W.push(["ads",1.3]);
  if(fairTypes.news&&Date.now()-(st.lastNews||0)>20*60e3) W.push(["news",1.2]);
  if(!W.length) return []; let r=R()*W.reduce((a,x)=>a+x[1],0), k=W[0][0]; for(const [x,w] of W){ if((r-=w)<=0){ k=x; break; } }
  let L=[];
  if(k==="show"){ const s=pick(shows); st.talkRecent.push(s.id); while(st.talkRecent.length>Math.min(3,Math.max(0,enabled.length-1))) st.talkRecent.shift(); L=fairShowLines(FAIRE.show(s.id)); }
  else if(k==="joust") L=fairShowLines(FAIRE.joust()); else if(k==="ponies") L=fairShowLines(FAIRE.ponies());
  else if(k==="callers"){ const c=FAIRE.caller(); L=[["style","lament"],["np",{title:"Call-in",style:"The Bard's Hearth",artist:FAIRE.HOSTS.bard.name}],["rec",{show:"The Bard's Hearth",title:"Call-in",hosts:FAIRE.HOSTS.bard.name}],["cast",c.cast],["music","sting"],["music","bedOn"],...c.lines,["music","bedOff"],["recstop"]]; }
  else if(k==="news"){ st.lastNews=Date.now(); L=[["style","herald"],["np",{title:"Tidings of the realm",style:"Realm news",artist:FAIRE.HOSTS.herald.name}],["rec",{show:"Realm news",title:"Tidings of the realm",hosts:FAIRE.HOSTS.herald.name}],["music","theme"],["herald",FAIRE.heraldOpen()],["news"],["music","bedOn"],["herald",FAIRE.heraldClose()],["music","outro"],["recstop"]]; }
  if(k!=="ads"&&fairTypes.ads&&R()<.45) L.push(...fairAdLines(R()<.6?1:2));
  if(k==="ads") L=fairAdLines(R()<.5?2:3);
  return L;
}
function fairAdLines(n){ const L=[["crier",FAIRE.adIntro()]]; for(let i=0;i<n;i++){ const a=FAIRE.ad(), sty=pick(["tavern","halfling","procession","herald","lament","council"]);
    L.push(["style",sty],["np",{title:a.title,style:"Ad",artist:"A word from our patrons"}],["rec",{show:"Ad",title:a.title,hosts:"Hear Ye patrons",ad:true}],["cast",a.cast],["music","sting"],["music","bedOn"],...a.lines,["music","bedOff"],["recstop"]); }
  return L; }
// a scripted show (or the joust, or the ponies): the crier's intro, the theme with its bed under the opening lines, a stinger at every segment break, the bed back under the sign-off, the closing cadence
function fairShowLines(ep){ const spoken=l=>!["sfx","music","pause","seg"].includes(l[0]), L=[["style",ep.style],["np",{title:ep.title,style:ep.show,artist:ep.hosts}],["rec",{show:ep.show,title:ep.title,hosts:ep.hosts}],["cast",ep.cast]];
  const open=ep.open||[`Hear ye! It is time for ${ep.show}.`];
  L.push(["crier",open[0]],["music","theme"]); if(open[1]) L.push(["crier",open[1]]);
  const body=[]; for(const l of ep.lines){ const m=l[0]==="seg"?["music","sting"]:l; if(m[0]==="music"&&(!body.length||body[body.length-1][0]==="music")) continue; body.push(m); }
  let i2=-1, k=0; for(let i=0;i<body.length;i++) if(spoken(body[i])&&++k===1){ i2=i; break; }
  let last=-1; for(let i=body.length-1;i>=0;i--) if(spoken(body[i])){ last=i; break; }
  body.forEach((l,i)=>{ if(i===last&&i>i2+1) L.push(["music","bedOn"]); L.push(l); if(i===i2) L.push(["music","bedOff"]); });
  L.push(["music","outro"]); if(ep.close) L.push(["crier",ep.close]); L.push(["recstop"]); return L; }
function fairRun(st,L){ if(st.dead) return; st.lines=L; st.i=0; st.n++; st.cast=fairCast({}); st.style=st.style||"herald"; fairStep(st,st.n); }
function fairStep(st,n){
  if(st.dead||n!==st.n||!on) return;
  if(st.i>=st.lines.length){ fBedOff(st,1); if(REC&&REC.sp&&REC.sp.station==="hearye") recStop(); speaking=false; return; }
  const line=st.lines[st.i++], nx=d=>{ st.t=setTimeout(()=>fairStep(st,n),Math.max(0,d)); };
  if(line[0]==="piece"){ speaking=false; fBedOff(st,1.2); fairPieceStart(st); nx(0); return; }
  if(line[0]==="style"){ st.style=line[1]; nx(0); return; }
  if(line[0]==="cast"){ st.cast=fairCast(line[1]||{}); nx(0); return; }
  if(line[0]==="np"){ nowPlaying={station:"hearye",bpm:null,talk:true,...line[1]}; emit("nowplaying",nowPlaying); nx(0); return; }
  if(line[0]==="rec"){ const sp={kind:"hearye",station:"hearye",...line[1]}; emit("spot",sp); recStart(sp); st.mode="talk"; fairAmbLevel(st,.15,2); nx(0); return; }
  if(line[0]==="recstop"){ fBedOff(st,1.2); if(REC&&REC.sp&&REC.sp.station==="hearye") recStop(); nx(300); return; }
  if(line[0]==="music"){ const t=ctx.currentTime+.05, k=line[1]; let d=0;
    try{ if(k==="bedOn"){ fBedOn(st,st.style,t); d=1200; } else if(k==="bedOff"){ fBedOff(st,2.4); d=100; }
      else if(k==="theme"){ const len=fCue(st.style,"theme",t); fBedOn(st,st.style,t+len-1.2); d=Math.max(1,len-.8)*1000; }
      else if(k==="outro"){ fBedOff(st,.8); d=(fCue(st.style,"outro",t)+.2)*1000; }
      else { if(st.piece){ st.piece.duck=true; fadeTo(st.piece.b.gain.gain,st.piece.lv*.3,.4,ctx.currentTime); } d=fCue(st.style,k,t)*800; } }catch(e){}
    nx(d); return; }
  if(line[0]==="news"){ speaking=true; Promise.resolve().then(async()=>{ let d=null; if(typeof opts.news==="function") d=await within(opts.news(),8000);
      const items=d&&Array.isArray(d.items)?d.items:[], ls=(items.length&&FAIRE.news(items,sayName))||FAIRE.proclamations();
      if(st.dead||n!==st.n) return; st.lines.splice(st.i,0,...ls.flatMap((l,j)=>j&&j%3===0?[["music","sting"],l]:[l])); fairStep(st,n); }).catch(()=>{ if(!st.dead&&n===st.n) fairStep(st,n); }); return; }
  speaking=true; let l=line; if(typeof l[1]==="string"&&l[0]!=="sfx"&&l[0]!=="pause"){ const v=spelled(l[1]); if(v!==l[1]) l=[l[0],{say:l[1],show:v}]; }
  if(st.piece&&!st.bed&&l[0]!=="pause"&&l[0]!=="sfx"){ st.piece.duck=true; fadeTo(st.piece.b.gain.gain,st.piece.lv*.3,.5,ctx.currentTime); }   // the bard talks over the start of a piece: it dips under him
  speakLines([l],st.cast,()=>{ if(st.dead||n!==st.n) return; const pc=st.piece; if(pc&&st.i>=st.lines.length){ pc.duck=false; fadeTo(pc.b.gain.gain,pc.lv,1.5,ctx.currentTime); } fairStep(st,n); });
}
function fairId(){ const st=fair; if(!on||station!=="hearye"||!st||!fairTypes.ids) return; const line=FAIRE.ids(); emit("spot",{kind:"id",station:"hearye",text:line});
  if(st.lines&&st.i<st.lines.length&&speaking){ st.lines.splice(st.i,0,["music","id"],["crier",line]); return; }
  if(speaking) return; speaking=true; const pc=st.piece, g=gen; if(pc){ pc.duck=true; fadeTo(pc.b.gain.gain,pc.lv*.3,.5,ctx.currentTime); }
  const d=fCue("herald","id",ctx.currentTime+.05);
  setTimeout(()=>{ if(g!==gen||st.dead) { speaking=false; return; } speakLines([["crier",line]],st.cast||fairCast({}),()=>{ speaking=false; if(pc&&st.piece===pc){ pc.duck=false; fadeTo(pc.b.gain.gain,pc.lv,1.5,ctx.currentTime); } }); },d*800); }
function fairSkip(){ const st=fair; if(!on||!st) return; if(st.piece&&!speaking){ fairPieceEnd(st,2); st.n++; fairAfterPiece(st); return; }
  gen++; hush(); fBedOff(st,.6); recStop(true); st.n++; fairPieceEnd(st,1.5); fairRun(st,[["pause",800],["piece"]]); }
function fairSetTypes(){ const st=fair; if(!st) return; if(!fairTypes.amb&&st.amb){ ambKill(st.amb,2); st.amb=null; } else if(fairTypes.amb&&!st.amb&&st.piece) fairAmb(st,st.piece.p.S.scene,st.piece.p.key); }
// "Save" on HEARYE: the piece on air, rendered again from the top (with its ambience), brought up to -1 dBFS
async function renderFaire(p){ let f=1; if(gOn("hearye","bpm")) f=p.bpm/GRV.hearye.bpm; else if(MXON.hearye) f/=mxTempoMul("hearye",p.bpm);   // 1.25 (E3): the matrix's tempo pull (GLITCH never changes the length)
  if(gOn("hearye","meter")&&p.S.sub!==3&&p.S.beats===4) f*=METERS[GRV.hearye.meter].ratio; const secs=Math.min(700,(p.len-3.5)*f+4.5); const buffer=await renderOffline("fpiece",secs,p);
  let pk=0; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  const k=pk>0?Math.min(8,.89/pk):1; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++) d[i]*=k; } return buffer; }
/* ---------- PTRN 101.1: PATTERN ----------
   No shows, no DJ, no default sound: every genre switched on in its Settings, played as simple, well-made procedural
   tracks, mixed into each other like a DJ would (beat-matched when the tempos are close, an equal-power blend that
   doesn't dip). Built on MDFM's song writer with genres of its own. The only voice is TAGS: station IDs and short drops
   locked to the beat (and to TUNE's tempo), chopped, pitched or thrown into an echo like vocal samples.
   The point of the station is the TUNE tools: the style matrix, groove and key, and the effects. */
const MIXO=[0,2,4,5,7,9,10], LYD=[0,2,4,6,7,9,11]; SCALE_NAMES.set(MIXO,"mixolydian"); SCALE_NAMES.set(LYD,"lydian");
Object.assign(INST_NAMES,{sax:"saxophone",clav:"clavinet",comp:"jazz piano",bossa:"nylon guitar",montuno:"piano montuno",skank:"offbeat skank",strum:"acoustic guitar",chiparp:"8-bit arpeggios",
  supersaw:"supersaws",chug:"chugging guitar",stab1:"synth stabs",gospel:"organ and piano",pianoshuffle:"blues piano",tele:"twangy guitar",chip:"8-bit lead",flute:"flute",brass1:"horns",
  gtrlead:"lead guitar",fiddle:"fiddle",harm:"harmonica",melodica:"melodica"});
// a few more instruments: jazz ride and brushes, latin percussion, 8-bit drums, and basses and leads for the new genres
Object.assign(D,{
  ride(s,t,v=1){ const g=ctx.createGain(),p=pan(.28), rb=coreRide(ctx.sampleRate);
    if(rb){ const src=ctx.createBufferSource(); src.buffer=rb; src.connect(g); src.start(t); }   // the pre-rendered core (1.25)
    else { const mix=G(.11),bp=filt("bandpass",5600,.9),hp=filt("highpass",3400); for(const f of HATF){ const o=osc("square",f*2.9); o.connect(mix); o.start(t); o.stop(t+1.2); } mix.connect(bp); bp.connect(hp); hp.connect(g); }
    const b=osc("sine",3150),bg=ctx.createGain(); env(bg,t,.001,.025*v,.45); b.connect(bg); bg.connect(p); b.start(t); b.stop(t+.55);
    env(g,t,.001,.1*v,1); g.connect(p); p.connect(s.dr); to(g,s,.18); },
  brush(s,t,v=1){ const n=nz(t,.3),bp=filt("bandpass",2600,.6),lp=filt("lowpass",5200),g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.32*v,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+.22);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(s.dr); to(g,s,.2); const o=osc("triangle",190),og=ctx.createGain(); env(og,t,.002,.12*v,.08); o.connect(og); og.connect(s.dr); o.start(t); o.stop(t+.12); },
  clave(s,t,v=1){ const o=osc("sine",2480),o2=osc("sine",4900),g=ctx.createGain(),g2=G(.25),p=pan(.22); env(g,t,.0007,.22*v,.055); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.15); o.start(t); o2.start(t); o.stop(t+.08); o2.stop(t+.08); },
  timbale(s,t,v=1,hi=false){ const f=hi?640:470,o=osc("sine",f),g=ctx.createGain(),p=pan(hi?.3:.1); o.frequency.setValueAtTime(f*1.08,t); o.frequency.exponentialRampToValueAtTime(f,t+.03); env(g,t,.001,.2*v,.3);
    const n=nz(t,.12),bp=filt("bandpass",f*3,2),ng=ctx.createGain(); env(ng,t,.001,.12*v,.08); n.connect(bp); bp.connect(ng); ng.connect(p); o.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.2); o.start(t); o.stop(t+.35); },
  chipk(s,t,v=1){ const o=osc("square",180),lp=filt("lowpass",1800),g=ctx.createGain(); o.frequency.setValueAtTime(190,t); o.frequency.exponentialRampToValueAtTime(42,t+.09); env(g,t,.001,.22*v,.13); o.connect(lp); lp.connect(g); g.connect(s.dr); o.start(t); o.stop(t+.16); kickDuck(s,t); },
  chipn(s,t,v=1,open=false){ const sn=open==="snare",n=nz(t,.3),f=filt(sn?"bandpass":"highpass",sn?1900:7000,sn?.8:.7),g=ctx.createGain(); env(g,t,.001,(sn?.3:.1)*v,sn?.14:open?.14:.035); n.connect(f); f.connect(g); g.connect(s.dr); },
});
Object.assign(M,{
  sax(s,t,m,dur,v=1,prev=null){ const f=mtof(m),a=osc("sawtooth",f),bp=filt("bandpass",1150,.9),pk=filt("peaking",2600,1.5),lp=filt("lowpass",1400,.7),g=ctx.createGain(),lfo=osc("sine",5),lg=ctx.createGain(),end=t+dur+.1; pk.gain.value=3;
    lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.011,t+Math.max(.05,Math.min(.5,dur*.7))); lfo.connect(lg); lg.connect(a.frequency);
    if(prev!=null&&prev!==m){ a.frequency.setValueAtTime(mtof(prev),t); a.frequency.exponentialRampToValueAtTime(f,t+.06); }
    lp.frequency.setValueAtTime(800,t); lp.frequency.exponentialRampToValueAtTime(3200,t+.05); lp.frequency.exponentialRampToValueAtTime(1700,t+Math.max(.06,dur));
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.075*v,t+.03); g.gain.setValueAtTime(.06*v,t+Math.max(.04,dur*.9)); g.gain.exponentialRampToValueAtTime(.0001,end);
    const n=nz(t,dur+.12),nb=filt("bandpass",1700,1),ng=G(.009*v); n.connect(nb); nb.connect(ng); ng.connect(g);
    a.connect(bp); bp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(s.mu); to(g,s,.28); for(const x of [a,lfo]){ x.start(t); x.stop(end+.05); } },
  clav(s,t,notes,dur,v=1){ const hp=filt("highpass",320),bp=filt("bandpass",1500,1.3),g=ctx.createGain(),p=pan(-.2); bp.frequency.setValueAtTime(2600,t); bp.frequency.exponentialRampToValueAtTime(1100,t+.12);
    env(g,t,.002,.07*v,Math.min(.2,dur+.04)); hp.connect(bp); bp.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.12);
    for(const m of notes){ const o=osc("square",mtof(m)),og=G(1/Math.sqrt(notes.length)); o.connect(og); og.connect(hp); o.start(t); o.stop(t+dur+.1); } },
  nylon(s,t,notes,dur,v=1){ const lp=filt("lowpass",2600,.7),out=G(1); lp.frequency.setValueAtTime(2800,t); lp.frequency.exponentialRampToValueAtTime(900,t+.6); lp.connect(out); out.connect(s.mu); to(out,s,.25);
    notes.forEach((m,k)=>{ const tt=t+k*.013,f=mtof(m),o=osc("triangle",f),o2=osc("sine",f*2),g=ctx.createGain(),g2=G(.25); env(g,tt,.002,.07*v/Math.sqrt(notes.length),Math.max(.4,Math.min(1.4,dur*1.2)));
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); o.start(tt); o2.start(tt); o.stop(tt+1.5); o2.stop(tt+1.5); }); },
  reese(s,t,m,dur,v=1){ const f=mtof(m),a=osc("sawtooth",f*1.006),b=osc("sawtooth",f*.994),sub=osc("sine",f),lp=filt("lowpass",380,2),lfo=osc("sine",.35),lg=G(160),g=ctx.createGain(),sg=G(.9),end=t+dur;
    lfo.connect(lg); lg.connect(lp.frequency); a.connect(lp); b.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.17*v,t+.015); g.gain.setValueAtTime(.15*v,Math.max(t+.02,end-.06)); g.gain.exponentialRampToValueAtTime(.0001,end+.05);
    g.connect(bOut(s)); for(const x of [a,b,sub,lfo]){ x.start(t); x.stop(end+.1); } bDuck(s,t,.7); },
  wobble(s,t,m,dur,v=1,hz=4){ const f=mtof(m),a=osc("sawtooth",f),b=osc("square",f*1.003),sub=osc("sine",f),lp=filt("lowpass",400,7),lfo=osc("sine",hz),lg=G(1300),sh=ctx.createWaveShaper(),g=ctx.createGain(),sg=G(.8),end=t+dur; sh.curve=SAT;
    lfo.connect(lg); lg.connect(lp.frequency); a.connect(lp); b.connect(lp); lp.connect(sh); sh.connect(g); sub.connect(sg); sg.connect(g);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12*v,t+.01); g.gain.setValueAtTime(.11*v,Math.max(t+.02,end-.05)); g.gain.exponentialRampToValueAtTime(.0001,end+.04);
    g.connect(bOut(s)); for(const x of [a,b,sub,lfo]){ x.start(t); x.stop(end+.1); } bDuck(s,t,.7); },
  slap(s,t,m,dur,v=1){ const f=mtof(m),a=osc("sawtooth",f),sub=osc("sine",f),lp=filt("lowpass",900,1.6),g=ctx.createGain(),sg=G(1.2); lp.frequency.setValueAtTime(3200,t); lp.frequency.exponentialRampToValueAtTime(500,t+.09);
    env(g,t,.002,.24*v,Math.max(.08,dur)); a.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g); g.connect(bOut(s));
    const n=nz(t,.03),hp=filt("highpass",2500),ng=ctx.createGain(); env(ng,t,.0005,.06*v,.02); n.connect(hp); hp.connect(ng); ng.connect(bOut(s));
    for(const x of [a,sub]){ x.start(t); x.stop(t+dur+.1); } bDuck(s,t,.75); },
  upright(s,t,m,dur,v=1){ const f=mtof(m),a=osc("sine",f),b=osc("triangle",f),bg=G(.45),lp=filt("lowpass",850,.8),g=ctx.createGain(),end=t+Math.max(.15,dur);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.34*v,t+.008); g.gain.exponentialRampToValueAtTime(.15*v,t+.22); g.gain.exponentialRampToValueAtTime(.0001,end+.08);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(bOut(s)); a.start(t); b.start(t); a.stop(end+.1); b.stop(end+.1);
    const n=nz(t,.04),bp=filt("bandpass",420,1.5),ng=ctx.createGain(); env(ng,t,.001,.05*v,.03); n.connect(bp); bp.connect(ng); ng.connect(bOut(s)); bDuck(s,t,.8); },
  harm(s,t,m,dur,v=1,prev=null){ const f=mtof(m),a=osc("square",f),b=osc("sawtooth",f*1.002),bp=filt("bandpass",1500,1.2),g=ctx.createGain(),lfo=osc("sine",5.6),lg=ctx.createGain(),end=t+dur+.06;
    lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.014,t+Math.max(.05,Math.min(.4,dur*.6))); lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
    const from=prev!=null&&prev!==m?mtof(prev):dur>.35?f*.94:f; for(const x of [a,b]){ x.frequency.setValueAtTime(from,t); x.frequency.exponentialRampToValueAtTime(f,t+.07); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+.03); g.gain.setValueAtTime(.045*v,t+Math.max(.04,dur*.9)); g.gain.exponentialRampToValueAtTime(.0001,end);
    const hl=filt("lowpass",3200); a.connect(bp); b.connect(bp); bp.connect(hl); hl.connect(g); g.connect(s.mu); to(g,s,.25); for(const x of [a,b,lfo]){ x.start(t); x.stop(end+.05); } },
  gtrlead(s,t,m,dur,v=1,prev=null){ const f=mtof(m),a=osc("sawtooth",f),b=osc("sawtooth",f*1.005),pg=G(2.2),sh=ctx.createWaveShaper(),hp=filt("highpass",220),pk=filt("peaking",1700,1.2),lp=filt("lowpass",3800,.8),g=ctx.createGain(),end=t+dur+.08; sh.curve=GTR; pk.gain.value=3;   // 1.25 (E2): presence lower and softer
    const from=prev!=null&&prev!==m?mtof(prev):dur>.3?f*.89:f; for(const x of [a,b]){ x.frequency.setValueAtTime(from,t); x.frequency.exponentialRampToValueAtTime(f*(x===b?1.005:1),t+.09); }
    if(dur>.4){ const lfo=osc("sine",5.8),lg=ctx.createGain(); lg.gain.setValueAtTime(0,t+.2); lg.gain.linearRampToValueAtTime(f*.012,t+dur); lfo.connect(lg); lg.connect(a.frequency); lfo.start(t); lfo.stop(end); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.032*v,t+.006); g.gain.setValueAtTime(.028*v,t+Math.max(.02,dur)); g.gain.exponentialRampToValueAtTime(.0001,end);
    a.connect(pg); b.connect(pg); pg.connect(sh); sh.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(s.mu); to(g,s,.2); for(const x of [a,b]){ x.start(t); x.stop(end+.02); } },
});
// how the new genres play their parts (hooks into MDFM's playStep: bass, chords, leads, percussion and snares)
const bRoot=(s,d,tr,lo=31,hi=50)=>{ let m=s.root+s.deg(d)+tr; while(m>hi) m-=12; while(m<lo) m+=12; return m; };
const ivl=(s,d,k)=>s.deg(d+k)-s.deg(d);   // the k-th scale step above chord d, in semitones
const blen=(s,i)=>{ let n=1; while(i+n<16&&!s.bassPat[i+n]) n++; return n; };
const BASSX={
  walk(s,t,i,d,tr,nd){ if(i%4) return; const b=i>>2, r=bRoot(s,d,tr,33,47), nx=bRoot(s,nd,tr,33,47);
    let m=[r,r+ivl(s,d,2),r+ivl(s,d,4),nx+(R()<.55?-1:1)][b]; if(b===1&&R()<.3) m=r+12; if(b===2&&R()<.25) m=r+ivl(s,d,5); M.upright(s,t,m,s.sp*3.3,b===0?1:.85); },
  tumbao(s,t,i,d,tr,nd){ const r=bRoot(s,d,tr,33,47); if(i===6) M.upright(s,t,r+7>47?r-5:r+7,s.sp*5.5,.9); else if(i===12) M.upright(s,t,bRoot(s,nd,tr,33,47),s.sp*7,1); },
  bossa(s,t,i,d,tr){ const r=bRoot(s,d,tr,33,47), f=r+7>47?r-5:r+7; if(i===0) M.upright(s,t,r,s.sp*5.5,1); else if(i===6) M.upright(s,t,f,s.sp*1.8,.75); else if(i===8) M.upright(s,t,f,s.sp*5.5,.9); },
  reggae(s,t,i,d,tr){ s.rg=s.rg||pick(["..x.x...x.x.x...","x...x.x...x.x...","..x...x.x...x.x."]); if(s.rg[i]!=="x") return; const r=bRoot(s,d,tr,33,47), k=[...s.rg.slice(0,i)].filter(c=>c==="x").length;
    M.bass(s,t,r+[0,0,ivl(s,d,4),ivl(s,d,2),12,ivl(s,d,4)][k%6],s.sp*1.8,1); },
  rootfifth(s,t,i,d,tr,nd){ const r=bRoot(s,d,tr,33,47); if(i===0) M.bass(s,t,r,s.sp*3.2,1); else if(i===8) M.bass(s,t,r-5<31?r+7:r-5,s.sp*3.2,.85); else if(i===14&&R()<.35){ const nx=bRoot(s,nd,tr,33,47); M.bass(s,t,nx+(nx>r?-1:1),s.sp*1.6,.7); } },
  offbeat(s,t,i,d,tr){ if(i%4===2) M.bass(s,t,bRoot(s,d,tr),s.sp*1.5,.95); },
  roll(s,t,i,d,tr){ if(i%4) M.bass(s,t,bRoot(s,d,tr),s.sp*.85,i%4===2?.9:.68); },
  reese(s,t,i,d,tr){ if(s.bassPat[i]) M.reese(s,t,bRoot(s,d,tr,28,40),Math.min(blen(s,i),8)*s.sp,1); },
  wobble(s,t,i,d,tr,nd,bar){ if(!s.bassPat[i]) return; s.wob=s.wob||[pick([1,2,4]),pick([2,3,4]),pick([1,2,4,8]),pick([4,6,8])]; M.wobble(s,t,bRoot(s,d,tr,28,40),Math.min(blen(s,i),8)*s.sp,1,s.wob[bar%4]/(s.sp*4)); },
  slap(s,t,i,d,tr){ if(!s.slp){ s.slp=[...s.bassPat].map((x,k)=>x||(k%2===1&&R()<.3)?1:0); s.slo=s.slp.map((x,k)=>k===0?0:pick([0,0,12,12,7,10,-2])); }
    if(s.slp[i]) M.slap(s,t,bRoot(s,d,tr,31,45)+s.slo[i],s.sp*(s.slo[i]===12?.7:1.4),s.slo[i]===12?.85:1); },
  boogie(s,t,i,d,tr){ if(i%2) return; const r=bRoot(s,d,tr,33,45); M.upright(s,t,r+[0,4,7,9,10,9,7,4][i>>1],s.sp*1.7,i%4?.75:.95); },
  chipb(s,t,i,d,tr){ if(i%2) return; PI.chip(s,t,bRoot(s,d,tr,40,52)+(i%4===2?12:0),s.sp*1.7,1.3,"triangle"); },
};
const COMP=[["...x.....x......","......x.......x."],["..x.......x.....","x.....x...x....."],["......x.x.......","...x......x....x"]];
const CHX={
  comp(s,t,i,n,c,d,tr,bar){ s.cp=s.cp||pick(COMP); if(s.cp[bar%2][i]==="x") M.piano(s,t,n.slice(0,4),s.sp*1.6,.48); },
  bossa(s,t,i,n,c,d,tr,bar){ if((bar%2?"..x..x..x..x....":"x..x..x...x..x..")[i]==="x") M.nylon(s,t,n,s.sp*2.4,.85); },
  montuno(s,t,i,n){ if("x.x.x..x.x.x..x."[i]!=="x") return; const u=n.map(x=>x+12), k=(i>>1)%4, m=[u[0],u[2]??u[1],u[1],u[2]??u[0]][k]; M.piano(s,t,[m,m+12],s.sp*1.3,.4); },
  skank(s,t,i,n){ if(i===4||i===12) M.rhodes(s,t,n.map(x=>x+12),s.sp*.9,.75); },
  clav(s,t,i,n){ s.cl=s.cl||pick(["x..x.xx...x.x.x.","x.x..x.x..x..xx.","..x.x..x.xx..x.x"]); if(s.cl[i]==="x") M.clav(s,t,n.slice(0,3).map(x=>x+12),s.sp*.7,.8); },
  strum(s,t,i,n){ s.sm=s.sm||pick(["x...x.x...x.x.x.","x.....x...x.x...","x...x...x...x.x."]); if(s.sm[i]!=="x") return; const ns=n.map(x=>pitch(x,52,71)); FI.strum(s,t,i%4===2?[...ns].reverse():ns,i%4===0?1:.65,.014); },
  chiparp(s,t,i,n){ PI.chip(s,t,n[i%n.length]+12,s.sp*.9,.55,"square"); },
  supersaw(s,t,i,n,c,d,tr,bar){ if(i%4===2) M.saw(s,t,n.map(x=>x+12),s.sp*1.3,.75); else if(c==="main"&&i===0&&bar%2===0) M.pad(s,t,n.map(x=>x+12),s.sp*30,.7,2600); },
  chug(s,t,i,n,c,d,tr,bar,di){ const r=bRoot(s,d,tr,40,52); if(i===0&&bar%2===0) M.guitar(s,t,r,s.sp*1.8,1,false); else if(s.K[di]==="x"||i%2===0) M.guitar(s,t,r,s.sp*.7,.85,true); },
  stab1(s,t,i,n){ s.sb=s.sb||pick(["...x......x.....","......x....x....","..x...x...x....x"]); if(s.sb[i]==="x") M.saw(s,t,[n[0]+12,n[Math.min(2,n.length-1)]+12],s.sp*.7,.6); },
  gospel(s,t,i,n){ if(i===0) M.organ(s,t,n,s.sp*15,.7,6); if(i===4||i===12||(i===14&&R()<.3)) M.piano(s,t,n.map(x=>x+12),s.sp*1.2,.42); },
  pianoshuffle(s,t,i,n,c,d,tr,bar){ if(i%4===2||(i===0&&bar%2===0)) M.piano(s,t,n,s.sp*(i?1.4:3),i?.38:.5); },
};
const LEADX={ sax:(s,t,m,dur,v,p)=>M.sax(s,t,m,dur,v,p), tele:(s,t,m,dur,v)=>FI.tele(s,t,m,Math.max(.12,dur),v), chip:(s,t,m,dur,v)=>PI.chip(s,t,m,dur*.9,v*1.3,"square"),
  flute:(s,t,m,dur,v)=>PI.flute(s,t,m,dur,v), brass1:(s,t,m,dur,v)=>M.brass(s,t,[m],Math.min(dur,s.sp*4),v*1.3), gtrlead:(s,t,m,dur,v,p)=>M.gtrlead(s,t,m,dur,v,p),
  fiddle:(s,t,m,dur,v,p)=>FI.fiddle(s,t,m,dur,v,p), harm:(s,t,m,dur,v,p)=>M.harm(s,t,m,dur,v,p), melodica:(s,t,m,dur,v)=>M.accordion(s,t,[m],dur,v*.9) };
const PERCX={ clave:(s,t)=>D.clave(s,t,.9), tamb:(s,t,di)=>FI.tamb(s,t,di%4===0?.75:.45), hatpedal:(s,t)=>D.hat(s,t,.35,false), timbale:(s,t,di)=>D.timbale(s,t,.7,di%8<4),
  salsa(s,t,di,bar){ if((bar%2===0?"x.....x.....x...":"....x...x.......")[di]==="x") D.clave(s,t,.85); if(di%4===0) D.cowbell(s,t,81,.08,di===0?.7:.5);
    if(di===4) D.conga(s,t,.6,true); else if(di===12||di===14) D.conga(s,t,.85,false); else if(di===10&&R()<.35) D.conga(s,t,.45,true); } };
const SNX={ brush:(s,t)=>D.brush(s,t,.9), chip:(s,t)=>D.chipn(s,t,1,"snare"), xstick:(s,t)=>D.rim(s,t,1.2), dembow:(s,t)=>{ D.snare(s,t,.65,.12,1.15); D.clap(s,t,.35); },
  gated:(s,t)=>{ D.snare(s,t,1.1,.9,.8); D.clap(s,t,.25,.4); }, acoustic:(s,t)=>D.snare(s,t,1.05,.38,1.12), none:()=>{} };
// the genres: [id, label, family, MDFM style]. Some are MDFM's own (boom bap, trap, drill, G-funk, R&B, lo-fi, afrobeats).
const PTRN_GENRES=[["house","House","Electronic","HOUSE"],["techno","Techno","Electronic","TECHNO"],["trance","Trance","Electronic","TRANCE"],["dnb","Drum & bass","Electronic","DRUM & BASS"],
  ["dubstep","Dubstep","Electronic","DUBSTEP"],["garage","UK garage","Electronic","UK GARAGE"],["synthwave","Synthwave","Electronic","SYNTHWAVE"],["chiptune","Chiptune","Electronic","CHIPTUNE"],
  ["boombap","Boom bap","Hip-hop & R&B","BOOM BAP"],["trap","Trap","Hip-hop & R&B","TRAP"],["drill","Drill","Hip-hop & R&B","DRILL"],["gfunk","G-funk","Hip-hop & R&B","G-FUNK"],["rnb","R&B","Hip-hop & R&B","R&B"],
  ["rock","Rock","Rock & pop","ROCK"],["punk","Punk","Rock & pop","PUNK"],["metal","Metal","Rock & pop","METAL"],["indie","Indie pop","Rock & pop","INDIE POP"],["synthpop","Synth-pop","Rock & pop","SYNTH-POP"],
  ["jazz","Swing jazz","Jazz, funk & soul","SWING JAZZ"],["bossa","Bossa nova","Jazz, funk & soul","BOSSA NOVA"],["funk","Funk","Jazz, funk & soul","FUNK"],["disco","Disco","Jazz, funk & soul","DISCO"],
  ["blues","Blues","Jazz, funk & soul","BLUES"],["gospel","Gospel","Jazz, funk & soul","GOSPEL"],
  ["reggaeton","Reggaeton","Latin & Caribbean","REGGAETON"],["salsa","Salsa","Latin & Caribbean","SALSA"],["reggae","Reggae","Latin & Caribbean","REGGAE"],["dancehall","Dancehall","Latin & Caribbean","DANCEHALL"],["afrobeats","Afrobeats","Latin & Caribbean","AFROBEATS"],
  ["lofi","Lo-fi","Chill","LO-FI"],["triphop","Trip-hop","Chill","TRIP-HOP"],["ambient","Ambient","Chill","AMBIENT"],["country","Country","Country & folk","COUNTRY"],["folk","Folk","Country & folk","FOLK"]];
const X16="................", F4="x...x...x...x...";
Object.assign(STY,{
  "HOUSE":{lvl:1.15,bpm:[120,126],sw:[.5,.54],scales:[AE,DO,MA],mode:"any",voicing:"ext",K:[F4],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:["..o...o...o...o."],P:["...x.......x....",""],perc:"rim",
    snare:"clap",clap:0,bass:"offbeat",chords:"pianostab",pad:"pad",lead:"chop",leadFrom:2,octLead:72,fam:{chords:["pianostab","housestab","rhodesoff"],lead:["chop","pluck","bell"],pad:["pad","strings","none"]}},
  "TECHNO":{bpm:[128,134],sw:[.5,.52],scales:[PH,AE],mode:"min",voicing:"triad",K:[F4],S:[["....x.......x..."],["............x..."]],H:["..x...x...x...x.","x.x.x.x.x.x.x.x."],O:["..o...o...o...o."],P:["x..x..x...x..x..",""],perc:"rim",
    snare:"snare",clap:0,bass:"roll",chords:"stab1",pad:"none",lead:"bell",leadFrom:4,octLead:72,fam:{chords:["stab1","stab1","padonly"],lead:["bell","pluck","saw"],pad:["none","pad"]}},
  "TRANCE":{lvl:1,bpm:[136,140],sw:[.5,.5],scales:[AE,HM],mode:"min",voicing:"triad",K:[F4],S:[["....x.......x..."]],H:["..x...x...x...x.","x.xxx.xxx.xxx.xx"],O:["..o...o...o...o."],P:[""],perc:"",
    snare:"snare",clap:0,bass:"roll",chords:"supersaw",pad:"pad",lead:"saw",leadFrom:2,octLead:76,fam:{chords:["supersaw","pluckarp"],lead:["saw","pluck","bell"],pad:["pad","choir","strings"]},progs:{min:[[0,5,2,6],[5,3,0,4],[0,6,5,4],[0,3,5,4]]}},
  "DRUM & BASS":{lvl:0.7,bpm:[170,176],half:1,sw:[.5,.52],scales:[AE,DO],mode:"min",voicing:"ext",K:["x.........x.....","x.........xx....","x......x..x....."],S:[["....x.......x..."],["....x.......x..x"]],H:["x...x.x.x...x.x.","x.x.x...x.x.x..."],O:[""],
    P:[".......x.x....x.","..x......x......"],perc:"ghost",snare:"snare",clap:0,bass:"reese",chords:"padonly",pad:"pad",lead:"bell",leadFrom:4,octLead:76,cpb:2,fam:{chords:["padonly","rhodes","pianostab"],lead:["bell","pluck","whistle"],pad:["pad","strings","choir"]}},
  "DUBSTEP":{lvl:0.72,bpm:[138,142],half:1,sw:[.5,.5],scales:[PH,AE,HM],mode:"min",voicing:"triad",K:["x.........x.....","x......x...x...."],S:[["........x......."]],H:["x.x.x.x.x.x.x.x.","x.x.x.x.x.x.x3x."],O:[""],P:[""],perc:"",
    snare:"big",clap:1,bass:"wobble",chords:"none",pad:"choir",lead:"bell",leadFrom:4,octLead:76,kv:1.1,fam:{chords:["none","padonly","pianostab"],lead:["bell","saw","pluck"],pad:["choir","pad","none"]}},
  "UK GARAGE":{bpm:[130,134],sw:[.56,.6],scales:[DO,AE,MA],mode:"any",voicing:"ext",K:["x......x..x.....","x.........x..x..","x.....x...x....."],S:[["....x.......x..."]],H:["x.xxx.xxx.xxx.xx","..x...x...x...x."],O:["..o.......o.....",""],P:["...x......x.....",""],perc:"rim",
    snare:"clap",clap:0,bass:"bass",chords:"rhodesoff",pad:"pad",lead:"chop",leadFrom:2,octLead:72,shaker:1,fam:{chords:["rhodesoff","pianostab","stab1"],lead:["chop","chop","pluck"],pad:["pad","none"]}},
  "SYNTHWAVE":{bpm:[96,112],sw:[.5,.5],scales:[AE,MA,DO],mode:"any",voicing:"triad",K:["x.......x.......","x.......x.x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"gated",bass:"pulse",chords:"pluckarp",pad:"pad",lead:"saw",leadFrom:2,octLead:72,crashBar:1,fam:{chords:["pluckarp","saw","pluckarp"],lead:["saw","bell","pluck"],pad:["pad","strings"]},meters:["6/8"],meterP:.1},
  "CHIPTUNE":{lvl:1.9,bpm:[140,160],sw:[.5,.5],scales:[MA,AE,DO],mode:"any",voicing:"triad",kickI:"chipk",hat:"chipn",K:["x.......x.......","x.......x.x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"chip",bass:"chipb",chords:"chiparp",pad:"none",lead:"chip",leadFrom:2,octLead:76,fam:{chords:["chiparp"],lead:["chip"],pad:["none"]}},
  "BOOM BAP":{...STY["LO-FI BOOM BAP"],bpm:[88,96],vinyl:0}, "TRAP":{...STY["CHILL TRAP"],lvl:.75}, "DRILL":{...STY["MELODIC DRILL"],lvl:.85}, "G-FUNK":{...STY["WEST COAST"],lead:"whistle"}, "R&B":{...STY["SLOW JAM R&B"],lvl:.9},
  "ROCK":{bpm:[112,132],sw:[.5,.52],scales:[MA,DO,AE],mode:"any",voicing:"triad",K:["x.......x.x.....","x.......x.......","x..x....x.x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:["..............o.",""],P:[""],perc:"",
    snare:"acoustic",bass:"pulse",chords:"guitar",pad:"none",lead:"gtrlead",leadFrom:2,octLead:72,crashBar:1,fam:{chords:["guitar"],lead:["gtrlead","gtrlead","vox"],pad:["none","strings"]}},
  "PUNK":{bpm:[168,188],sw:[.5,.5],scales:[MA,AE],mode:"any",voicing:"triad",K:["x.......x.......",F4],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"acoustic",bass:"pulse",chords:"guitar",pad:"none",lead:"vox",leadFrom:2,octLead:72,crashBar:1,fam:{chords:["guitar"],lead:["vox","gtrlead"],pad:["none"]}},
  "METAL":{bpm:[96,116],sw:[.5,.5],scales:[PH,HM,AE],mode:"min",voicing:"triad",K:["xxxxxxxx........","x.x.x.x.x.x.x.x.","x.xxx.xxx.xxx.xx"],S:[["....x.......x..."]],H:[F4],O:[""],P:[""],perc:"",
    snare:"acoustic",bass:"pulse",chords:"chug",pad:"none",lead:"gtrlead",leadFrom:4,octLead:72,crashBar:1,kv:.7,fam:{chords:["chug"],lead:["gtrlead"],pad:["none","choir"]}},
  "INDIE POP":{bpm:[108,124],sw:[.5,.53],scales:[MA,DO],mode:"maj",voicing:"ext",K:["x.......x.x.....","x.....x...x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:["x.x.x.x.x.x.x.x."],perc:"tamb",
    snare:"snare",bass:"bass",chords:"strum",pad:"pad",lead:"bell",leadFrom:2,octLead:76,fam:{chords:["strum","pluckarp","rhodes"],lead:["bell","whistle","vox","pluck"],pad:["pad","strings","none"]}},
  "SYNTH-POP":{bpm:[116,126],sw:[.5,.5],scales:[AE,MA,DO],mode:"any",voicing:"triad",K:[F4],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x.","..x...x...x...x."],O:[""],P:[""],perc:"",
    snare:"clap",clap:0,bass:"octave",chords:"saw",pad:"pad",lead:"vox",leadFrom:2,octLead:74,fam:{chords:["saw","pluckarp","bellarp"],lead:["vox","saw","pluck"],pad:["pad","strings"]}},
  "SWING JAZZ":{bpm:[132,168],sw:[.62,.66],sw8:1,scales:[MA,MA,DO],mode:"any",voicing:"ext",hat:"ride",K:["x...............","x.......x......."],S:[[X16],[X16,"..............x."]],H:["x...x.x.x...x.x."],O:[""],P:["....x.......x..."],perc:"hatpedal",
    snare:"brush",kv:.35,bass:"walk",chords:"comp",pad:"none",lead:"sax",leadFrom:2,octLead:70,cpb:1,progs:{maj:[[1,4,0,0],[0,5,1,4],[2,5,1,4],[0,3,1,4]],min:[[1,4,0,0],[0,3,1,4],[0,5,1,4]]},
    fam:{chords:["comp"],lead:["sax","sax","piano","brass1"],pad:["none"]},meters:["3/4","5/4"],meterP:.2,feel:"ballad"},
  "BOSSA NOVA":{bpm:[124,140],sw:[.5,.52],scales:[MA,DO],mode:"any",voicing:"ext",K:["x..x....x..x...."],S:[[X16]],H:[X16],nohats:1,O:[""],P:["x..x..x...x..x..","..x..x..x..x...."],perc:"rim",snare:"none",
    bass:"bossa",chords:"bossa",pad:"strings",lead:"flute",leadFrom:2,octLead:74,shaker:1,kv:.55,fam:{chords:["bossa"],lead:["flute","sax","whistle"],pad:["strings","none"]},progs:{maj:[[0,1,4,0],[1,4,0,5],[0,5,1,4]],min:[[0,3,4,0]]}},
  "FUNK":{bpm:[98,110],sw:[.53,.57],scales:[DO,MIXO],mode:"any",voicing:"ext",K:["x.x.......x..x..","x......x..x.x...","x..x......x....."],S:[["....x.......x..."]],H:["x.xxx.xxx.xxx.xx","x.xxx.xxx.xxx.xx"],O:["..........o.....",""],P:["..x....x.x....x.",".......x......x."],perc:"ghost",
    snare:"snare",clap:0,bass:"slap",chords:"clav",pad:"none",lead:"brass1",leadFrom:2,octLead:72,cpb:2,fam:{chords:["clav","clav","rhodesoff"],lead:["brass1","sax","whistle"],pad:["none","pad"]},progs:{min:[[0,0,3,3],[0,3,0,4],[0,6,0,3]],maj:[[0,3,0,3],[0,0,3,4]]}},
  "DISCO":{bpm:[116,124],sw:[.5,.53],scales:[DO,MA,AE],mode:"any",voicing:"ext",K:[F4],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x.","x.xxx.xxx.xxx.xx"],O:["..o...o...o...o."],P:[""],perc:"",
    snare:"snare",clap:1,bass:"octave",chords:"rhodesoff",pad:"strings",lead:"fiddle",leadFrom:2,octLead:79,fam:{chords:["rhodesoff","pianostab","clav"],lead:["fiddle","brass1","whistle"],pad:["strings","strings","pad"]}},
  "BLUES":{bpm:[68,88],sw:[.62,.66],sw8:1,scales:[MIXO],mode:"maj",voicing:"dom7",K:["x.......x.......","x.......x.x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"snare",bass:"boogie",chords:"pianoshuffle",pad:"none",lead:"harm",leadFrom:2,octLead:72,cpb:1,progs:{maj:[[0,0,0,0,3,3,0,0,4,3,0,4],[0,3,0,0,3,3,0,0,4,3,0,4]]},
    fam:{chords:["pianoshuffle","organ"],lead:["harm","gtrlead","sax"],pad:["none"]}},
  "GOSPEL":{lvl:1.06,bpm:[68,82],sw:[.58,.64],sw8:1,scales:[MA],mode:"maj",voicing:"ext",K:["x.......x.x.....","x......x..x....."],S:[["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"snare",clap:0,bass:"bass",chords:"gospel",pad:"choir",lead:"vox",leadFrom:2,octLead:72,progs:{maj:[[0,3,0,4],[3,4,2,5],[0,5,3,4],[3,0,4,0]]},
    fam:{chords:["gospel","gospel","organ"],lead:["vox","vox","piano"],pad:["choir","choir","strings"]},meters:["6/8"],meterP:.45},
  "REGGAETON":{lvl:0.85,bpm:[88,98],sw:[.5,.52],scales:[AE,HM,DO],mode:"min",voicing:"triad",K:[F4],S:[["...x..x....x..x."]],H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.xxx.x."],O:[""],P:[""],perc:"",
    snare:"dembow",bass:"808",slide:.15,chords:"pianostab",pad:"pad",lead:"pluck",leadFrom:2,octLead:72,fam:{chords:["pianostab","pluckarp","bellarp"],lead:["pluck","vox","bell"],pad:["pad","none"]},progs:{min:[[0,5,2,6],[0,3,4,0],[5,3,0,4]]},meters:[]},
  "SALSA":{bpm:[94,104],sw:[.5,.5],scales:[MA,AE],mode:"any",voicing:"triad",K:["............x...",X16],S:[[X16]],H:[X16],nohats:1,O:[""],P:[""],perc:"",perc2:"salsa",snare:"none",kv:.6,
    bass:"tumbao",chords:"montuno",pad:"none",lead:"brass1",leadFrom:2,octLead:72,cpb:1,progs:{maj:[[0,4,4,0],[0,3,4,3],[1,4,0,0]],min:[[0,3,4,0],[0,6,4,0],[0,3,6,4]]},fam:{chords:["montuno"],lead:["brass1","flute","brass1"],pad:["none"]}},
  "REGGAE":{lvl:1.45,bpm:[68,80],sw:[.55,.6],sw8:1,scales:[MA,DO,AE],mode:"any",voicing:"triad",K:["........x.......","........x.....x."],S:[["........x......."]],H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.xxx.x."],O:[""],P:[""],perc:"",
    snare:"xstick",bass:"reggae",chords:"skank",pad:"none",lead:"melodica",leadFrom:2,octLead:72,fam:{chords:["skank"],lead:["melodica","flute","sax"],pad:["none","pad"]},progs:{maj:[[0,3,4,3],[0,5,3,4],[0,3,0,4]],min:[[0,6,0,6],[0,3,6,4],[0,5,6,0]]}},
  "DANCEHALL":{lvl:0.8,bpm:[94,104],sw:[.5,.53],scales:[AE,DO,PH],mode:"min",voicing:"triad",K:["x..x..x...x.....","x.....x.x...x..."],S:[["....x..x....x..."],["....x.......x..."]],H:["x.x.x.x.x.x.x.x."],O:[""],P:["..x...x...x...x."],perc:"rim",
    snare:"clap",clap:0,bass:"808",slide:.1,chords:"pluckarp",pad:"pad",lead:"chop",leadFrom:2,octLead:72,fam:{chords:["pluckarp","pianostab","stab1"],lead:["chop","pluck","bell"],pad:["pad","none"]}},
  "AFROBEATS":{...STY["AFROSWING"],bpm:[100,110]}, "LO-FI":{...STY["JAZZ HOP"],vinyl:1},
  "TRIP-HOP":{lvl:1.15,bpm:[76,88],sw:[.52,.56],scales:[AE,PH,HM],mode:"min",voicing:"ext",K:["x......x..x.....","x.........x..x.."],S:[["....x.......x..."]],H:[F4,"x.x.x.x.x.x.x.x."],O:[""],P:[""],perc:"",
    snare:"big",bass:"bass",chords:"rhodes",pad:"strings",lead:"bell",leadFrom:4,octLead:76,vinyl:1,fam:{chords:["rhodes","piano","padonly"],lead:["bell","whistle","saw"],pad:["strings","choir","pad"]}},
  "AMBIENT":{bpm:[64,80],sw:[.5,.5],scales:[MA,LYD,DO],mode:"any",voicing:"ext",nodrums:1,K:[X16],S:[[X16]],H:[X16],O:[""],P:[""],perc:"",snare:"none",
    bass:"held",chords:"padonly",pad:"choir",lead:"bell",leadFrom:4,octLead:79,fam:{chords:["padonly","pianoarp","bellarp"],lead:["bell","piano","whistle"],pad:["choir","strings","pad"]}},
  "COUNTRY":{lvl:1.3,bpm:[100,120],sw:[.5,.54],scales:[MA,MIXO],mode:"maj",voicing:"triad",K:["x.......x.......","x.....x.x......."],S:[["....x.......x..."]],H:[F4],O:[""],P:[""],perc:"",shaker:1,kv:.85,
    snare:"snare",clap:0,bass:"rootfifth",chords:"strum",pad:"none",lead:"tele",leadFrom:2,octLead:72,fam:{chords:["strum","strum","pianostab"],lead:["tele","fiddle","tele"],pad:["none","strings"]},progs:{maj:[[0,3,4,0],[0,4,5,3],[0,3,0,4]]},meters:["3/4"],meterP:.2},
  "FOLK":{lvl:1.6,bpm:[88,108],sw:[.5,.55],scales:[MA,DO,MIXO],mode:"any",voicing:"triad",K:["x.......x.......","x..............."],S:[["....x.......x..."]],H:[X16],nohats:1,O:[""],P:["x.x.x.x.x.x.x.x."],perc:"tamb",kv:.6,
    snare:"brush",bass:"rootfifth",chords:"strum",pad:"none",lead:"fiddle",leadFrom:2,octLead:72,fam:{chords:["strum","bossa"],lead:["fiddle","flute","whistle"],pad:["none","strings"]},meters:["3/4","6/8"],meterP:.35},
});
Object.assign(STYLE_FAM,{"BOOM BAP":"soul","TRAP":"trap","DRILL":"trap","G-FUNK":"dance","R&B":"soul","AFROBEATS":"dance","LO-FI":"soul"});
const PTRN_KEY=Object.fromEntries(PTRN_GENRES.map(g=>[g[3],g])), PTRN_LEVEL=1;
const ptrnTypes=Object.fromEntries([...PTRN_GENRES.map(g=>[g[0],true]),["tags",true]]);
STATION_TYPES.ptrn=[...PTRN_GENRES.map(g=>[g[0],g[1],g[2]]),["tags","Tags: IDs and vocal drops","Voice"]];
// titles and artists: made up, like every procedural station's
const PT_A=["Signal","Neon","Static","Velvet","Concrete","Paper","Glass","Second","Low","Slow","Golden","Midnight","Sunday","Basement","Satellite","Cassette","Analog","Rooftop","Parallel","Copper","Electric","Lucky","Open","Silver","Northern","Overtime","Spreadsheet","Lanyard","Thermostat","Parking Lot"];
const PT_B=["Groove","Motion","Theory","Drift","Pressure","Shuffle","Circuit","Bounce","Season","Weather","Dance","Hours","Lights","Frequency","Feeling","Run","Swing","Ritual","Garden","Parade","Fever","Tide","Machine","Mirror","Avenue","Waves","Rhythm","Fade","Loop","Pattern"];
const PT_HANDLE=["Paperclip","Tupperware","Night Bus","Floppy","Mezzanine","Speedbump","Stapler","Low Battery","Group Chat","Voicemail","Laminator","Snooze","Hold Music","Dial Tone","Lunch Break","Fax Machine","Breakroom","Cul-de-sac","Sticky Note","Swivel Chair"];
const PT_GROUP=["Collective","Sound System","Club","Committee","Unit","Orchestra","Social","Quartet","All-Stars","Department"];
function ptrnTitle(){ const r=R(), t=`${pick(PT_A)} ${pick(PT_B)}`; return r<.12?`${t} (Extended Mix)`:r<.2?`${t} (Pattern Edit)`:r<.26?`${t} (Dub)`:t; }
function ptrnArtist(){ const r=R(); return r<.3?`DJ ${pick(PT_HANDLE)}`:r<.55?`${pick(ART.first)} ${pick(ART.last)}`:r<.75?`The ${pick(PT_HANDLE)} ${pick(PT_GROUP)}`:r<.88?`${pick(ART.first)} & ${pick(PT_HANDLE)}`:`${pick(PT_HANDLE)} ${ri(2,99)}`; }
/* TAGS. The words are original; {genre}, {bpm}, {key} and {time} come from the track on air. */
const TAG_TXT={
  id:["P T R N. Pattern, one oh one point one.","Pattern. One oh one one.","You're on Pattern.","Pattern. No talking. Just tags.","This is a tag. On Pattern.","One oh one point one. Pattern.","P T R N.",
    "Pattern. The knobs are yours.","Pattern. You're the D J now.","Pattern, one oh one one. Hands on the dials.","Pattern. Every genre. No D J.","You found Pattern."],
  drop:["Again.","Turn it up.","Bring it back.","From the top.","Here we go.","Loop that.","Filter it.","Hold it.","Switch.","Pattern recognized.","Mix it.","Keep it locked.","Rewind.","Louder.",
    "Uh huh.","Yeah.","Okay.","Let it ride.","No skips.","Echo. Echo.","Dial it in.","Turn the knob.","Tweak it.","Run it back.","Drop.","Feel that."],
  joke:["This tag has been approved.","Pattern. Sponsored by nobody.","Do not adjust your knobs. Adjust your knobs.","We don't have a D J. You're it.","Tag. You're it.","Pattern. Batteries not included.",
    "This is the part where you touch the knobs.","Pattern. Now with more pattern.","Legally, this is a tag.","Pattern. The station that just keeps going.","Please enjoy this tag responsibly."],
  song:["{genre}. On Pattern.","{bpm} beats per minute.","Now playing {genre}.","{genre}. Probably.","This is {genre}. Allegedly.","Pattern plays {genre} now.","{key}. Pattern.","Pattern, in {time}.","It's {clock}. Still mixing."]};
const TAG_VOICES=["Daniel","Aaron","Samantha","Karen","Moira","Rishi","Evan","Tom","Ava","Allison"];   // clear voices only (1.22.2: no robot voices)
const TAG_CAST=[{accent:"british",names:["Daniel","Arthur"],pitch:.9,rate:1.05},{accent:"american",names:["Aaron","Evan","Tom","Samantha"],pitch:1,rate:1.08}];
const TIME_SAY={"3/4":"three four","6/8":"six eight","5/4":"five four","7/8":"seven eight","7/4":"seven four","4/4":"four four"};
function ptrnTagText(kind,s){ let L=TAG_TXT[kind]||TAG_TXT.drop, x=pick(L);
  if(kind==="song"&&s){ const np=songFacts(s), meter=songMeter(s); if(/\{time\}/.test(x)&&!meter) x="{genre}. On Pattern.";
    x=x.replace("{genre}",(PTRN_KEY[s.name]||[0,s.name])[1]).replace("{bpm}",String(Math.round(15/s.sp))).replace("{key}",np.key).replace("{time}",TIME_SAY[meter]||meter).replace("{clock}",new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})); }
  return x; }
let ptrn=null, ptrnIn=null, ptrnRv=null; const ptrnRecent=[];
function pDest(){ if(!ptrnIn||ptrnIn.context!==ctx){ ptrnIn=G(PTRN_LEVEL); ptrnIn.connect(pre); ptrnRv=ctx.createConvolver(); ptrnRv.buffer=songRev.buffer; ptrnRv.connect(filt("highpass",280)).connect(filt("lowpass",4200)).connect(G(.45)).connect(ptrnIn); } return ptrnIn; }
function ptrnPool(){ const on2=PTRN_GENRES.filter(g=>ptrnTypes[g[0]]).map(g=>g[3]); return on2.length?on2:PTRN_GENRES.map(g=>g[3]); }
function ptrnSong(t){ const p=ptrn, made=makeSong(null,ptrnPool(),ptrnRecent); if(GON.ptrn) gSongLen(made,"ptrn");
  made.title=ptrnTitle(); made.artist=ptrnArtist(); const recipe={...made}, s=setupSong(made,t,0,pDest(),ptrnRv,"ptrn"); s.recipe=recipe; s.genre=(PTRN_KEY[s.name]||[0,s.name])[1];
  s.sp0=s.sp; s.swing0=s.swing;   // so the tempo can glide while it's being mixed in
  if(p) p.songs.push(s); nowPlaying={station:"ptrn",title:s.title,style:s.genre,artist:s.artist,bpm:s.bpm,...songFacts(s)}; emit("nowplaying",nowPlaying); ptrnTagPrefetch(s); return s; }
function ptrnOn(){ ptrnOff(.01); ptrn={songs:[],timer:0,lastTag:-99,ready:[],loading:0,srcs:[],n:0}; const p=ptrn, t=ctx.currentTime+.15, s=ptrnSong(t);
  s.bus.gain.setValueAtTime(.0001,t); s.bus.gain.exponentialRampToValueAtTime(s.st.lvl||1,t+1.5); p.firstId=true; p.timer=setInterval(ptrnTick,40); ptrnTick(); }
function ptrnOff(fade=1.2){ const p=ptrn; if(!p) return; ptrn=null; clearInterval(p.timer); if(!ctx) return; const t=ctx.currentTime;
  for(const s of p.songs) for(const g of [s.bus.gain,s.rvf.gain]) try{ holdAt(g,t); g.linearRampToValueAtTime(.0001,t+fade); }catch(e){}
  for(const x of p.srcs) try{ x.stop(t+fade); }catch(e){}
  setTimeout(()=>{ for(const s of p.songs) try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} },fade*1000+300); }
const holdAt=(g,t)=>{ if(g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value,t); } };   // stop where it is, even mid-curve
const ptrnBlendBars=s=>{ const barT=s.sp*16*meterRatio(s); return Math.max(4,Math.min(8,Math.round(15/barT),Math.floor(s.bars/3))); };
function ptrnTick(){ const p=ptrn; if(!on||!p||station!=="ptrn"||!ctx) return; const now=ctx.currentTime, ahead=now+AHEAD(), late=now-.3;
  for(const s of [...p.songs]){
    while(!s.done&&s.next<ahead){
      if(s.step%16===0) ptrnBar(p,s,s.next);
      const adv=mStep(s,s.next,pStep(s.next,late)); s.step++; s.next+=adv;
      if(!s.handed&&s.step===(s.bars-(s.blendBars||(s.blendBars=ptrnBlendBars(s))))*16) ptrnHand(p,s,s.blendBars);
      if(s.step>=s.bars*16) s.done=true; } }
  p.songs=p.songs.filter(s=>{ if(!s.done||now<(s.endT||0)) return true; try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} return false; }); }
// once a bar: a skip waiting for the downbeat, the tempo glide after a blend, and the tags
function ptrnBar(p,s,t){
  if(s.skip&&!s.handed){ s.skip=false; const B=4; s.blendBars=B; s.step=Math.max(s.step,(s.bars-B)*16); ptrnHand(p,s,B); }
  if(s.glide){ const b=Math.floor(s.step/16)-s.glide.start; if(b>=0){ const x=Math.min(1,(b+1)/s.glide.len); s.blendSp=s.glide.from+(s.glide.to-s.glide.from)*x; if(x>=1){ s.blendSp=null; s.glide=null; } } }
  if(s.handed||!ptrnTypes.tags) return; const b=Math.floor(s.step/16), sec=secAt(s,b), barT=s.sp*16*meterRatio(s), T=t+barT;   // tags are planned a bar ahead
  if(p.firstId&&b===1){ p.firstId=false; ptrnTag(s,T,"id"); return; }
  const nb=b+1, ns=secAt(s,nb); if(nb!==ns.start||T-p.lastTag<20) return;
  const k=ns.kind, pr=k==="hook"?.6:k==="verse"?.35:k==="break"||k==="bridge"?.5:0; if(R()<pr) ptrnTag(s,T,k==="break"||k==="bridge"?pick(["drop","joke"]):pick(["drop","drop","song","song","id","joke"])); }
// the blend: the next track comes in under this one (on its tempo when they're close, gliding to its own after),
// equal-power so the level holds, with a station ID somewhere in the middle
function ptrnHand(p,s,B){ s.handed=true; const barT=s.sp*16*meterRatio(s), tH=s.next, dur=barT*B, n=ptrnSong(tH);
  if(!gOn("ptrn","bpm")){ const r=n.sp0/s.sp; if(r>.8&&r<1.25){ n.blendSp=s.sp; n.sp=s.sp; n.glide={from:s.sp,to:n.sp0,start:B,len:4}; } }
  const N=48, up=new Float32Array(N), dn=new Float32Array(N), L1=n.st.lvl||1, L0=s.st.lvl||1;
  for(let k=0;k<N;k++){ const x=k/(N-1); up[k]=Math.max(.0001,Math.sin(x*Math.PI/2)*L1); dn[k]=Math.max(.0001,Math.cos(x*Math.PI/2)*L0); }
  for(const [g,c] of [[n.bus.gain,up],[n.rvf.gain,up.map(v=>v/L1)],[s.bus.gain,dn],[s.rvf.gain,dn.map(v=>v/L0)]]) try{ holdAt(g,tH-.004); g.setValueAtTime(c[0],tH-.003); g.setValueCurveAtTime(c,tH,dur); }catch(e){}
  s.endT=tH+dur+.5; if(ptrnTypes.tags&&R()<.7) ptrnTag(n,tH+barT*Math.floor(B/2),"id"); }
function ptrnSkip(){ const p=ptrn; if(!on||!p) return; const s=p.songs.find(x=>!x.handed), out=p.songs.filter(x=>x.handed&&!x.done);
  if(s&&out.length){ const t=ctx.currentTime;   // 1.25: pressed during a blend: finish the blend (the track fading in stays), don't skip it too
    for(const o of out){ for(const g of [o.bus.gain,o.rvf.gain]) try{ holdAt(g,t); g.linearRampToValueAtTime(.0001,t+.8); }catch(e){} o.done=true; o.endT=t+1; }
    for(const [g,v] of [[s.bus.gain,s.st.lvl||1],[s.rvf.gain,1]]) try{ holdAt(g,t); g.linearRampToValueAtTime(v,t+.8); }catch(e){} return; }
  if(s) s.skip=true; }
function ptrnTagNow(){ const p=ptrn; if(!on||!p) return; const s=p.songs.find(x=>!x.handed); if(!s) return; const b=curBeat(); let T=b.t0; while(T<ctx.currentTime+.2+b.beat*2) T+=b.beat; ptrnTag(s,T,"id",true); }
// rendered tags (apps that render voices): a few kept ready, so each one can land exactly on the beat
function ptrnTagPrefetch(s){ const p=ptrn; if(!p||typeof opts.tts!=="function"||!ctx) return; const want=[];
  if(s) want.push({kind:"song",text:ptrnTagText("song",s),sid:s.title});
  while(p.ready.length+p.loading+want.length<6) want.push((k=>({kind:k,text:ptrnTagText(k)}))(pick(["id","id","drop","drop","joke"])));
  for(const w of want){ p.loading++; const v=pick(TAG_VOICES), c=ctx;
    Promise.race([opts.tts({text:w.text,voice:v,rate:1,pitch:1}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))])
      .then(buf=>c.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)))
      .then(b=>{ p.loading--; if(ptrn===p&&b&&b.duration<6) p.ready.push({...w,b,r:revBuf(b),voice:v}); }).catch(()=>{ p.loading--; }); } }
function ptrnTake(p,kind,s){ const R2=p.ready; let i=R2.findIndex(x=>x.kind==="song"&&s&&x.sid===s.title&&kind!=="id"); if(i<0) i=R2.findIndex(x=>x.kind===kind); if(i<0) i=R2.findIndex(x=>x.kind!=="song"); if(i<0) return null;
  const it=R2.splice(i,1)[0]; ptrnTagPrefetch(); return it; }
function ptrnTag(s,T,kind,force){ const p=ptrn; if(!p||(!ptrnTypes.tags&&!force)) return; p.lastTag=T; const beat=s.sp*4, it=ptrnTake(p,kind,s), g=gen;
  if(it){ const mode=ptrnTagPlay(s,T,it,beat,null,p.srcs); setTimeout(()=>{ if(ptrn===p&&g===gen) emit("caption",{text:it.text,who:"PTRN tag"}); },Math.max(0,(T-ctx.currentTime)*1000)); return; }
  // no rendered voices (a browser): the system voice on the downbeat, with a chopped vocal stutter into it
  const text=ptrnTagText(kind,s), c=pick(TAG_CAST), v=voiceFor(c), root=s.root+24+s.deg(s.prog[0]);
  for(let k=0;k<4;k++) M.chop(s,T-beat+k*beat/4,root+(k>=2?pick([0,3,7]):0),beat/4*.7,.55+k*.08,{syl:s.chops[k%4]});
  setTimeout(()=>{ if(ptrn!==p||g!==gen||!on||station!=="ptrn"||speaking) return; speaking=true; speak(text,()=>{ speaking=false; },{voice:v,pitch:c.pitch,rate:c.rate,vol:.9,who:"PTRN tag"}); },Math.max(0,(T-ctx.currentTime)*1000-60)); }
// one rendered tag, played like a sampler: straight with an echo, stuttered in, slowed down, reversed in, or gated
const TAG_MODES=[["hype",.3],["stutter",.25],["slow",.15],["reverse",.17],["gate",.13]];   // 1.22.2: the vocoder is gone
function ptrnTagPlay(s,T,it,beat,mode,srcs){ if(!mode){ let r=R(); mode="hype"; for(const [m,w] of TAG_MODES){ if((r-=w)<=0){ mode=m; break; } } }
  const out=G(.9), pn=pan(rr(-.12,.12)), dest=pDest(); out.connect(pn).connect(dest); const sendRv=G(mode==="slow"?.5:.18); out.connect(sendRv).connect(ptrnRv);
  const src=(buf,rate=1)=>{ const x=ctx.createBufferSource(); x.buffer=buf; x.playbackRate.value=rate; const hp=filt("highpass",140); x.connect(hp); if(srcs){ srcs.push(x); x.onended=()=>{ const k=srcs.indexOf(x); if(k>=0) srcs.splice(k,1); }; } return [x,hp]; };
  const b=it.b, len=b.duration;
  const [x,hp]=src(b,mode==="slow"?.8:1); hp.connect(out);
  if(mode==="hype"||mode==="slow"){ const e=ctx.createDelay(2), fb=G(.38), el=filt("lowpass",2800), eg=G(.3); e.delayTime.value=Math.min(1.9,beat*.75); hp.connect(eg).connect(e).connect(el).connect(fb).connect(e); el.connect(out);
    if(!(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext)){ const c=ctx; setTimeout(()=>{ try{ fb.disconnect(); out.disconnect(); sendRv.disconnect(); }catch(e){} },(T-c.currentTime+len+8)*1000); } }   // 1.25: the echo loop is let go once it has died away
  if(mode==="stutter"){ const sl=Math.min(beat/4,len*.5); for(let k=0;k<4;k++){ const [y,h2]=src(b); h2.connect(out); y.start(T-beat+k*beat/4,0,sl*.9); } }
  if(mode==="reverse"){ const L=Math.min(len,beat*2), [y,h2]=src(it.r); h2.connect(out); y.start(T-L,Math.max(0,it.r.duration-L),L); }
  if(mode==="gate"){ const gt=G(1); hp.disconnect(); hp.connect(gt).connect(out); for(let k=0;k*beat/4<len+.1;k++) gt.gain.setValueAtTime(k%2?0:1,T+k*beat/4); }
  x.start(T); return mode; }
/* ---------- 1.23: more instruments for MDFM 99.9 and PTRN 101.1, and Settings' instrument pool ----------
   Drum kits (the classic one plus 808 boom, punchy and dusty lo-fi), bass sounds (the classic synth bass and 808 plus sub,
   FM and acid), keys (Wurlitzer), leads (FM, square, vibraphone) and a warm analog pad. Each song picks its kit and bass
   sound to suit its genre, and newer leads, keys and pads turn up some of the time. Settings can switch any of them off;
   POOL marks which were in the classic MDFM line-up (before 1.22), which came with PTRN (1.22) and which are new (1.23). */
const KIT0={kp:1,ke:1,kd:1,kc:1,st:1,sn:1,snl:1,sd:1,hf:1,hl:1,hd:1};
const KITS={classic:KIT0,
  boom:{kg:.68,kp:.92,ke:.82,kd:2.4,kc:.4,st:1.2,sn:1.5,snl:.8,sd:.75,hf:1.12,hl:.85,hd:.8},   // 808: long, deep kick; tight, ringy snare; small hats
  punch:{kp:1.2,ke:1.05,kd:.8,kc:1.9,st:1.1,sn:1.35,snl:1.15,sd:1.1,hf:1.1,hl:1.05,hd:1.25},   // 909-ish: hard click, short kick, crisp snare, bright hats
  dusty:{kp:.95,ke:.95,kd:1.1,kc:.5,st:.85,sn:.8,snl:.85,sd:1.3,hf:.78,hl:.8,hd:1,lp:5200}};   // lo-fi: soft attack, dark, a little saturated
const KIT_NAMES={classic:"classic kit",boom:"808 boom kit",punch:"punchy kit",dusty:"dusty kit"};
const BASS_NAMES={synth:"synth bass",sub:"sub bass",fm:"FM bass",acid:"acid bass"};
const POOL=[   // [key, label, category, since, ids]: since "classic" (MDFM before 1.22), "1.22" (came with PTRN), "1.23" (new)
  ["kit_classic","Classic kit","kit","classic",["classic"]],["kit_boom","808 boom kit","kit","1.23",["boom"]],["kit_punch","Punchy kit","kit","1.23",["punch"]],["kit_dusty","Dusty lo-fi kit","kit","1.23",["dusty"]],
  ["bass_synth","Synth bass","bass","classic",["synth"]],["bass_808","808 bass","bass","classic",["b808"]],["bass_sub","Sub bass","bass","1.23",["sub"]],["bass_fm","FM bass","bass","1.23",["fm"]],["bass_acid","Acid bass","bass","1.23",["acid"]],
  ["keys_piano","Piano","keys","classic",["piano","pianostab","pianoarp"]],["keys_ep","Electric piano","keys","classic",["rhodes","rhodesoff"]],["keys_bells","Bell arpeggios","keys","classic",["bellarp"]],
  ["keys_pluck","Plucked arpeggios","keys","classic",["pluckarp"]],["keys_saw","Saw synths and stabs","keys","classic",["saw","housestab","supersaw","stab1"]],["keys_organ","Organ","keys","classic",["organ","gospel"]],
  ["keys_guitar","Electric guitar","keys","classic",["guitar","chug"]],["keys_wurli","Wurlitzer","keys","1.23",["wurli"]],
  ["keys_clav","Clavinet","keys","1.22",["clav"]],["keys_nylon","Nylon guitar","keys","1.22",["bossa"]],["keys_montuno","Piano montuno","keys","1.22",["montuno"]],["keys_skank","Offbeat skank","keys","1.22",["skank"]],
  ["keys_strum","Acoustic guitar","keys","1.22",["strum"]],["keys_chip","8-bit arpeggios","keys","1.22",["chiparp"]],["keys_jazz","Jazz and blues piano","keys","1.22",["comp","pianoshuffle"]],
  ["lead_piano","Piano lead","lead","classic",["piano"]],["lead_bell","Bells","lead","classic",["bell"]],["lead_whistle","Synth whistle","lead","classic",["whistle"]],["lead_pluck","Pluck synth","lead","classic",["pluck"]],
  ["lead_saw","Saw lead","lead","classic",["saw"]],["lead_vox","Sung synth voice","lead","classic",["vox"]],["lead_chop","Vocal chops","lead","classic",["chop"]],["lead_cowbell","Cowbell","lead","classic",["cowbell"]],
  ["lead_ep","Electric piano lead","lead","classic",["rhodesline"]],["lead_fm","FM lead","lead","1.23",["fmlead"]],["lead_square","Square lead","lead","1.23",["sqlead"]],["lead_vibes","Vibraphone","lead","1.23",["vibes"]],
  ["lead_sax","Saxophone","lead","1.22",["sax"]],["lead_tele","Twangy guitar","lead","1.22",["tele"]],["lead_chip","8-bit lead","lead","1.22",["chip"]],["lead_flute","Flute","lead","1.22",["flute"]],
  ["lead_horns","Horns","lead","1.22",["brass1"]],["lead_gtr","Lead guitar","lead","1.22",["gtrlead"]],["lead_fiddle","Fiddle","lead","1.22",["fiddle"]],["lead_harm","Harmonica","lead","1.22",["harm"]],["lead_melodica","Melodica","lead","1.22",["melodica"]],
  ["pad_synth","Synth pad","pad","classic",["pad"]],["pad_strings","Strings","pad","classic",["strings"]],["pad_choir","Choir","pad","classic",["choir"]],["pad_warm","Warm analog pad","pad","1.23",["warm"]]];
const INSTR={};   // key -> false when switched off in Settings
const poolEntry=(cat,id)=>POOL.find(p=>p[2]===cat&&p[4].includes(id));
const poolOn=(cat,id)=>{ const e=poolEntry(cat,id); return !e||INSTR[e[0]]!==false; };
// off in Settings: another the genre likes, else anything that's on in that category, else (everything off) the genre's own
function poolFix(cat,id,cands,own){ if(poolOn(cat,id)) return id; const c=[...new Set(cands)].filter(x=>x!==id&&poolOn(cat,x)); if(c.length) return pick(c);
  const any=POOL.filter(p=>p[2]===cat&&INSTR[p[0]]!==false).map(p=>p[4][0]); return any.length?pick(any):(own||id); }
const XTRA={lead:["fmlead","sqlead","vibes"]};
function wpick(w){ let t=0; for(const k in w) t+=w[k]; if(t<=0) return null; let r=R()*t; for(const k in w){ if((r-=w[k])<=0) return k; } return Object.keys(w).pop(); }
function familyOf(name){ const g=typeof PTRN_KEY!=="undefined"&&PTRN_KEY[name]; return STYLE_FAM[name]||(g?g[2]:"other"); }
const KIT_W={trap:{boom:.45,classic:.3,dusty:.15,punch:.1},soul:{dusty:.4,classic:.4,punch:.1,boom:.1},ballad:{classic:.7,dusty:.3},Electronic:{punch:.45,classic:.3,boom:.15,dusty:.1},
  Chill:{dusty:.6,classic:.4},"Rock & pop":{punch:.4,classic:.6},"Jazz, funk & soul":{classic:.6,dusty:.25,punch:.15},"Latin & Caribbean":{classic:.5,punch:.3,boom:.2},"Country & folk":{classic:.8,dusty:.2}};
const BASS_W={trap:{synth:.5,sub:.35,fm:.15},soul:{synth:.55,sub:.3,fm:.15},Electronic:{synth:.35,acid:.3,fm:.2,sub:.15},Chill:{synth:.6,sub:.4}};
function kitFor(name){ const w={...(KIT_W[familyOf(name)]||{classic:.45,punch:.3,boom:.1,dusty:.15})}; for(const k in w) if(!poolOn("kit",k)) delete w[k]; return wpick(w)||"classic"; }
function bassFor(name){ const b=STY[name]&&STY[name].bass; if(BASSX[b]&&b!=="offbeat"&&b!=="roll") return "synth";   // walking, reggae and country lines keep their own tone
  const w={...(BASS_W[familyOf(name)]||{synth:.5,sub:.2,fm:.15,acid:.15})}; for(const k in w) if(!poolOn("bass",k)) delete w[k]; return wpick(w)||"synth"; }
// bass sounds (M.bass hands over to these)
const BASSK={
  sub(s,t,m,dur,v=1,prev=null){ const sb=subM(m)-m, f=mtof(m+sb),a=osc("sine",f),b=osc("sine",f*2),bg=G(.22),sh=ctx.createWaveShaper(),g=ctx.createGain(); sh.curve=SAT;   // 1.25 (E2): not under 41 Hz
    if(prev!=null){ a.frequency.setValueAtTime(mtof(prev+sb),t); a.frequency.exponentialRampToValueAtTime(f,t+.06); b.frequency.setValueAtTime(mtof(prev+sb)*2,t); b.frequency.exponentialRampToValueAtTime(f*2,t+.06); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.115*v,t+.008); g.gain.setValueAtTime(.1*v,t+Math.max(.02,dur*.8)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
    a.connect(sh); b.connect(bg); bg.connect(sh); sh.connect(g); g.connect(bOut(s)); a.start(t); b.start(t); a.stop(t+dur+.12); b.stop(t+dur+.12); bDuck(s,t,.7); },
  fm(s,t,m,dur,v=1,prev=null){ const f=mtof(m),sk=subF(f)/f,c=osc("sine",f),mo=osc("sine",f),mg=ctx.createGain(),sub=osc("sine",f*sk),sg=G(.8),lp=filt("lowpass",1800,.7),g=ctx.createGain();
    mg.gain.setValueAtTime(f*2.6,t); mg.gain.exponentialRampToValueAtTime(f*.25,t+.14); mo.connect(mg); mg.connect(c.frequency);
    if(prev!=null){ for(const [o,k] of [[c,1],[mo,1],[sub,sk]]){ o.frequency.setValueAtTime(mtof(prev)*k,t); o.frequency.exponentialRampToValueAtTime(f*k,t+.05); } }
    env(g,t,.003,.34*v,Math.max(.12,dur)); c.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(g); g.connect(bOut(s)); for(const o of [c,mo,sub]){ o.start(t); o.stop(t+dur+.15); } bDuck(s,t,.7); },
  acid(s,t,m,dur,v=1,prev=null){ const f=mtof(m),a=osc("sawtooth",f),lp=filt("lowpass",400,13),sh=ctx.createWaveShaper(),g=ctx.createGain(),sub=osc("sine",subF(f)),sg=G(.5); sh.curve=SAT;
    if(prev!=null){ a.frequency.setValueAtTime(mtof(prev),t); a.frequency.exponentialRampToValueAtTime(f,t+.05); }
    const pk=R()<.3?4200:2600; lp.frequency.setValueAtTime(pk,t); lp.frequency.exponentialRampToValueAtTime(260,t+.18);
    env(g,t,.003,.2*v,Math.max(.1,dur)); a.connect(lp); lp.connect(sh); sh.connect(g); sub.connect(sg); sg.connect(g); g.connect(bOut(s)); for(const o of [a,sub]){ o.start(t); o.stop(t+dur+.12); } bDuck(s,t,.7); },
};
// keys, leads and a pad
Object.assign(M,{
  wurli(s,t,notes,dur,v=1){ const lp=filt("lowpass",2300,.6),sh=ctx.createWaveShaper(),out=G(v),tr=G(1),lfo=osc("sine",5.2),lg=G(.18); sh.curve=SAT; lfo.connect(lg); lg.connect(tr.gain);
    lp.connect(sh); sh.connect(tr); tr.connect(out); out.connect(s.mu); to(out,s,.18); lfo.start(t); lfo.stop(t+dur+.5);
    notes.forEach((m,k)=>{ const f=mtof(m),a=osc("triangle",f),b=osc("square",f),bg=G(.12),g=ctx.createGain(),p=pan(k%2?.18:-.18);
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.07,t+.004); g.gain.exponentialRampToValueAtTime(.03,t+.35); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.3);
      a.connect(g); b.connect(bg); bg.connect(g); g.connect(p); p.connect(lp); a.start(t); b.start(t); a.stop(t+dur+.35); b.stop(t+dur+.35); }); },
  warmpad(s,t,notes,dur,v=1){ const lp=filt("lowpass",380,.8),g=ctx.createGain(); lp.frequency.setValueAtTime(380,t); lp.frequency.linearRampToValueAtTime(1500,t+Math.max(1,dur*.6));
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+Math.min(1.6,dur*.4)); g.gain.setValueAtTime(.05*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+1.2);
    lp.connect(g); g.connect(s.mu); to(g,s,.5);
    notes.forEach(m=>{ for(const dt of [-11,4,13]){ const o=osc("sawtooth",mtof(m)),p=pan(dt/20); o.detune.value=dt; o.connect(p); p.connect(lp); o.start(t); o.stop(t+dur+1.3); } }); },
  fmlead(s,t,m,dur,v=1,prev=null){ const f=mtof(m),c=osc("sine",f),mo=osc("sine",f*2),mg=ctx.createGain(),g=ctx.createGain(),lfo=osc("sine",5.4),lg=ctx.createGain(),end=t+dur+.12;
    mg.gain.setValueAtTime(f*3,t); mg.gain.exponentialRampToValueAtTime(f*.9,t+.25); mo.connect(mg); mg.connect(c.frequency);
    lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.01,t+Math.max(.05,Math.min(.5,dur*.7))); lfo.connect(lg); lg.connect(c.frequency);
    if(prev!=null&&prev!==m){ c.frequency.setValueAtTime(mtof(prev),t); c.frequency.exponentialRampToValueAtTime(f,t+.06); mo.frequency.setValueAtTime(mtof(prev)*2,t); mo.frequency.exponentialRampToValueAtTime(f*2,t+.06); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.08*v,t+.012); g.gain.setValueAtTime(.065*v,t+Math.max(.03,dur*.85)); g.gain.exponentialRampToValueAtTime(.0001,end);
    c.connect(g); g.connect(s.mu); to(g,s,.3); for(const o of [c,mo,lfo]){ o.start(t); o.stop(end+.05); } },
  sqlead(s,t,m,dur,v=1,prev=null){ const f=mtof(m),a=osc("square",f),b=osc("square",f),lp=filt("lowpass",3400,1),g=ctx.createGain(),end=t+dur+.08, c0=Math.min(3600,f*4); a.detune.value=-7; b.detune.value=7;   // 1.25 (E2): Q 1 and the cutoff following the note
    if(prev!=null&&prev!==m){ for(const o of [a,b]){ o.frequency.setValueAtTime(mtof(prev),t); o.frequency.exponentialRampToValueAtTime(f,t+.07); } }
    lp.frequency.setValueAtTime(c0,t); lp.frequency.exponentialRampToValueAtTime(Math.min(1400,c0*.5),t+Math.max(.08,dur*.8));
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.04*v,t+.006); g.gain.setValueAtTime(.034*v,t+Math.max(.02,dur*.9)); g.gain.exponentialRampToValueAtTime(.0001,end);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(s.mu); to(g,s,.25); for(const o of [a,b]){ o.start(t); o.stop(end+.03); } },
  vibes(s,t,m,dur,v=1){ const f=mtof(m),a=osc("sine",f),b=osc("sine",f*3.99),bg=G(.12),g=ctx.createGain(),tr=G(1),lfo=osc("sine",5.6),lg=G(.22),p=pan(.12),end=t+Math.max(.6,Math.min(2.4,dur*1.6));
    lfo.connect(lg); lg.connect(tr.gain); env(g,t,.002,.11*v,end-t); const bge=ctx.createGain(); env(bge,t,.001,1,.25);
    a.connect(g); b.connect(bg); bg.connect(bge); bge.connect(g); g.connect(tr); tr.connect(p); p.connect(s.mu); to(g,s,.35); for(const o of [a,b,lfo]){ o.start(t); o.stop(end+.1); } },
});
Object.assign(INST_NAMES,{wurli:"Wurlitzer",warm:"warm analog pad",fmlead:"FM lead",sqlead:"square lead",vibes:"vibraphone"});
Object.assign(LEADX,{fmlead:(s,t,m,dur,v,p)=>M.fmlead(s,t,m,dur,v,p),sqlead:(s,t,m,dur,v,p)=>M.sqlead(s,t,m,dur,v,p),vibes:(s,t,m,dur,v)=>M.vibes(s,t,m,dur,v)});
CHX.wurli=(s,t,i,n,c)=>{ if(c==="stab"){ if("x..x..x.x.....x."[i]==="x") M.wurli(s,t,n,s.sp*1.1,.6); } else if(i===0||i===10) M.wurli(s,t,n,s.sp*(i?5:9),.9); };
/* ---------- CLUK 92.3: Everything in the Chicken ----------
   Music that rips: big beat, breakbeat and its cousins, electro and hard house, on MDFM's song writer with basses,
   stabs and a drum-bus drive of their own; between songs, scripted shows (src/cluk/*.js), ads, call-ins and IDs
   (src/cluk.js). Songs run about two to two and a half minutes, with breakdowns and drops. */
// the instruments: a distorted riff bass, a 303-style acid line, an electro square bass, a rubbery electro-house bass,
// chicken-scratch funk guitar, big-beat horn stabs, rave piano stabs, hard-house stabs and a soft laser
Object.assign(M,{
  dirt(s,t,m,dur,v=1,prev=null,open=1){ const f=mtof(m),a=wOsc(sawSqWave(1.4),f),sk=subF(f)/f,sub=wOsc(subWave(.9),f*sk),lp=filt("lowpass",500,2.5),sh=ctx.createWaveShaper(),g=ctx.createGain(),end=t+Math.max(.08,dur); sh.curve=SAT808;   // 1.25: saw+square (and their 1.4 drive) as one wave, the sub at its level, the tone filter shared
    const tl=cShared(s,"dirt",()=>{ const x=filt("lowpass",2600,.7); x.connect(bOut(s)); return x; });
    if(prev!=null&&prev!==m) for(const [o,k] of [[a,1],[sub,sk]]){ o.frequency.setValueAtTime(mtof(prev)*k,t); o.frequency.exponentialRampToValueAtTime(f*k,t+.05); }
    lp.frequency.setValueAtTime(380,t); lp.frequency.exponentialRampToValueAtTime(600+1900*open,t+.012); lp.frequency.exponentialRampToValueAtTime(560,t+.24);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.15*v,t+.005); g.gain.setValueAtTime(.12*v,Math.max(t+.01,end-.04)); g.gain.exponentialRampToValueAtTime(.0001,end+.05);
    a.connect(lp); lp.connect(sh); sh.connect(g); sub.connect(g); g.connect(tl); for(const o of [a,sub]){ o.start(t); o.stop(end+.1); } bDuck(s,t,.75); },
  tb(s,t,m,dur,v=1,o={}){ const f=mtof(m),a=osc("sawtooth",f),lp=filt("lowpass",300,o.res||10),sh=ctx.createWaveShaper(),g=ctx.createGain(),end=t+Math.max(.06,dur); sh.curve=SAT;
    const tl=cShared(s,o.mu?"tbmu":"tbdr",()=>{ const x=filt("lowpass",2400,.6); x.connect(o.mu?s.mu:bOut(s)); if(o.mu) to(x,s,.2); return x; });   // 1.25: the tone filter (and the lead's send) shared, after the envelope
    if(o.from!=null&&o.from!==m){ a.frequency.setValueAtTime(mtof(o.from),t); a.frequency.exponentialRampToValueAtTime(f,t+Math.min(.08,dur*.6)); }
    const c=Math.min(1900,o.cut??1100), pk=Math.min(3000,c*(o.acc?2.2:1.5)); lp.frequency.setValueAtTime(c*.45,t); lp.frequency.exponentialRampToValueAtTime(pk,t+.008); lp.frequency.exponentialRampToValueAtTime(Math.max(200,c*.4),t+(o.acc?.17:.11));
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime((o.acc?.13:.09)*v,t+.004); g.gain.setValueAtTime((o.acc?.11:.08)*v,Math.max(t+.01,end-.02)); g.gain.exponentialRampToValueAtTime(.0001,end+.03);
    a.connect(lp); lp.connect(sh); sh.connect(g); g.connect(tl); a.start(t); a.stop(end+.06); if(!o.mu) bDuck(s,t,.8); },
  ebass(s,t,m,dur,v=1){ const f=mtof(m),a=osc("square",f),b=osc("sawtooth",f*.997),sub=wOsc(subWave(.9),f),lp=filt("lowpass",900,3.5),g=ctx.createGain(),end=t+Math.max(.08,dur);   // 1.25: the sub at its level, no gain node
    lp.frequency.setValueAtTime(2000,t); lp.frequency.exponentialRampToValueAtTime(380,t+.14);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12*v,t+.003); g.gain.setValueAtTime(.095*v,Math.max(t+.01,end-.03)); g.gain.exponentialRampToValueAtTime(.0001,end+.04);
    a.connect(lp); b.connect(lp); lp.connect(g); sub.connect(g); g.connect(bOut(s)); for(const o of [a,b,sub]){ o.start(t); o.stop(end+.08); } bDuck(s,t,.75); },
  rubber(s,t,m,dur,v=1){ const f=mtof(m),a=osc("sawtooth",f*1.006),b=osc("sawtooth",f*.994),sub=wOsc(subWave(.8),f),lp=filt("lowpass",300,5),sh=ctx.createWaveShaper(),g=ctx.createGain(),end=t+Math.max(.1,dur); sh.curve=SAT;   // 1.25: the sub at its level
    lp.frequency.setValueAtTime(260,t); lp.frequency.exponentialRampToValueAtTime(1500,t+Math.max(.04,dur*.4)); lp.frequency.exponentialRampToValueAtTime(320,end);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12*v,t+.006); g.gain.setValueAtTime(.1*v,Math.max(t+.01,end-.03)); g.gain.exponentialRampToValueAtTime(.0001,end+.04);
    a.connect(lp); b.connect(lp); lp.connect(sh); sh.connect(g); sub.connect(g); g.connect(bOut(s)); for(const o of [a,b,sub]){ o.start(t); o.stop(end+.08); } bDuck(s,t,.75); },
  scratchg(s,t,notes,v=1,open=false){ const bp=filt("bandpass",1700,1.2),g=ctx.createGain(),end=t+(open?.16:.045);   // 1.25: the static high- and low-pass, the pan and the send shared per song, after the envelope
    const p=cShared(s,"scrp",()=>{ const x=pan(-.32); x.connect(s.mu); return x; }), lp=cShared(s,"scrf",()=>{ const h=filt("highpass",500), l=filt("lowpass",3200,.7); h.connect(l); l.connect(p); to(l,s,.06); return h; });
    bp.frequency.setValueAtTime(2300,t); bp.frequency.exponentialRampToValueAtTime(1100,t+.05); env(g,t,.0015,.12*v,end-t); bp.connect(g); g.connect(lp);
    for(const m of notes.slice(0,3)){ const o=osc("sawtooth",mtof(m+12)); o.connect(bp); o.start(t); o.stop(end+.04); }
    const n=nz(t,.03),nb=filt("bandpass",2200,1.5),ng=ctx.createGain(); env(ng,t,.0005,.025*v,.015); n.connect(nb); nb.connect(ng); ng.connect(p); },
  bstab(s,t,notes,dur,v=1){ M.brass(s,t,notes.map(n=>n+12),dur,v*1.15,true); let r=Math.min(...notes)-12; while(r<40) r+=12; M.guitar(s,t,r,dur,v*.5,false); },   // 1.25: the horns one saw a note (one)
  hhstab(s,t,notes,dur,v=1){ const lp=filt("lowpass",2600,1.1),g=ctx.createGain(),end=t+Math.max(.1,dur); lp.frequency.setValueAtTime(3600,t); lp.frequency.exponentialRampToValueAtTime(1300,end);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*1.2247*v/Math.sqrt(notes.length),t+.006); g.gain.exponentialRampToValueAtTime(.0001,end+.08); lp.connect(g); g.connect(s.mu); to(g,s,.25);
    for(const m of notes) for(const dt of [-11,11]){ const o=osc("sawtooth",mtof(m)); o.detune.setValueAtTime(dt+50,t); o.detune.linearRampToValueAtTime(dt,t+.05); o.connect(lp); o.start(t); o.stop(end+.1); } },   // 1.25: two saws a note (was three), level kept below
});
Object.assign(D,{
  laser(s,t,v=1){ const o=osc("triangle",2200),lp=filt("lowpass",3000),g=ctx.createGain(),p=pan(rr(-.5,.5)); o.frequency.setValueAtTime(2300,t); o.frequency.exponentialRampToValueAtTime(260,t+.2); env(g,t,.002,.05*v,.22);
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.35); if(fxDelay) g.connect(G(.25)).connect(fxDelay); o.start(t); o.stop(t+.26); },
});
/* 1.25, lighter CLUK instruments (they cost 2-3x MDFM's): waves with their level built in (one oscillator for the riff bass's
   saw and square, a sub sine without its gain node), the static filters, pans and sends that sat after a per-note envelope
   shared per song, and fewer oscillators in the stacked stabs. Level per genre within 1 dB of 1.24. */
const CW=new WeakMap();   // per context
function cWave(key,mk){ let m=CW.get(ctx); if(!m) CW.set(ctx,m=new Map()); let w=m.get(key); if(!w){ const [re,im]=mk(); w=ctx.createPeriodicWave(re,im,{disableNormalization:true}); m.set(key,w); } return w; }
function wOsc(w,f){ const o=ctx.createOscillator(); o.setPeriodicWave(w); o.frequency.value=f; return o; }
const subWave=a=>cWave("sub"+a,()=>{ const re=new Float32Array(2), im=new Float32Array(2); im[1]=a; return [re,im]; });   // a sine at level a
// the built-in saw and square summed (as their oscillators play them: Chromium scales each to a peak of 1, x.8485 and x.8482), times k
const sawSqWave=k=>cWave("sawsq"+k,()=>{ const H=2048, re=new Float32Array(H), im=new Float32Array(H); for(let n=1;n<H;n++){ const pf=2/(n*Math.PI); im[n]=k*(pf*(n&1?1:-1)*.8485425+(n&1?2*pf:0)*.8481909); } return [re,im]; });
// a static filter (or pan) per song and destination, after the notes' envelopes: the same filter on the sum
function cShared(s,key,mk){ const m=s._cs||(s._cs=new Map()); let n=m.get(key); if(!n||n.context!==ctx){ n=mk(); m.set(key,n); } return n; }
// how they play (hooks into playStep: bass, chords, leads and the snare)
Object.assign(BASSX,{
  riff(s,t,i,d,tr,nd,bar){ if(!s.rf){ const b=[...s.K].map((c,k)=>c==="x"||(k%2===0&&R()<.4)?1:0); b[0]=1; s.rf=b; s.rfo=b.map((x,k)=>k===0?0:pick([0,0,0,12,7,10,3,-2,5]));
      s.rf2=b.map((x,k)=>k>=12?(k%2===0?1:0):x); s.rfo2=s.rfo.map((o,k)=>k>=12?[0,3,5,7,10,12][((k-12)>>1)+(R()<.5?2:0)]:o); }
    const P=bar%4===3?s.rf2:s.rf, O=bar%4===3?s.rfo2:s.rfo; if(!P[i]) return; let n=1; while(i+n<16&&!P[i+n]) n++;
    M.dirt(s,t,bRoot(s,d,tr,31,45)+O[i],Math.min(n,4)*s.sp*.92,i%4===0?1:.85,null,i===0?1:.6); },
  acidline(s,t,i,d,tr,nd,bar){ if(!s.ac){ s.ac=Array.from({length:16},(_,k)=>k%4===0||R()<.5?1:0); s.aco=s.ac.map((x,k)=>k===0?0:pick([0,0,12,0,7,3,10,12,5])); s.aca=s.ac.map((x,k)=>k%8===0||R()<.22); s.acs=s.ac.map(()=>R()<.2); }
    if(!s.ac[i]) return; const m=bRoot(s,d,tr,33,45)+s.aco[i], ph=((bar%8)*16+i)/128, cut=520+1250*(.5-.5*Math.cos(ph*Math.PI*2));
    let n=1; while(i+n<16&&!s.ac[i+n]) n++; const tie=s.acs[i]&&n>1, from=s.acPrev!=null&&s.acs[(i+15)%16]?s.acPrev:null; s.acPrev=m;
    M.tb(s,t,m,(tie?n:.7)*s.sp,1,{cut,acc:s.aca[i],from}); },
  electro(s,t,i,d,tr){ s.eb=s.eb||pick(["x..x..x...x.x...","x..x..x..x..x.x.","x.x...x.x..x..x."]); if(s.eb[i]!=="x") return; let n=1; while(i+n<16&&s.eb[i+n]!=="x") n++;
    M.ebass(s,t,bRoot(s,d,tr,33,45)+(i%8===6||i===13?12:0),Math.min(n,3)*s.sp*.85,i%4===0?1:.85); },
  rubber(s,t,i,d,tr){ s.rb=s.rb||pick(["x.x.x.x.x.x.x.x.","x..x..x.x..x..x.","x.xx..x.x.xx..x."]); if(s.rb[i]!=="x") return; let n=1; while(i+n<16&&s.rb[i+n]!=="x") n++;
    M.rubber(s,t,bRoot(s,d,tr,31,43)+(i===12&&s.root%2?12:0),n*s.sp*.9,i%4===0?1:.85); },
  hhbass(s,t,i,d,tr){ if(i%4===2) M.dirt(s,t,bRoot(s,d,tr,33,47),s.sp*1.3,1,null,.8); else if(i%8===7) M.dirt(s,t,bRoot(s,d,tr,33,47)+12,s.sp*.6,.55,null,.5); },
});
Object.assign(CHX,{
  scratch(s,t,i,n,c,d,tr,bar){ s.scp=s.scp||pick(["x.xxx.x.xx.xx.x.","xxx.x.xxx.xx.x.x","x.x.xxx.x.xxx.xx"]); if(s.scp[i]==="x") M.scratchg(s,t,n,i%4===0?1:.7,i===0&&bar%2===0); },
  bstab(s,t,i,n,c,d,tr,bar){ s.bst=s.bst||pick([["x.........x.....","......x.....x..."],["x.....x...x.....","x..............."],["..x...x.....x...","x...x..........."]]); if(s.bst[bar%2][i]==="x") M.bstab(s,t,n.slice(0,3),s.sp*(i===0?2:1.2),.85); },
  ravepiano(s,t,i,n){ s.rp=s.rp||pick(["x..x..x...x..x..","x..x..x.x..x..x.","x.....x...x.x..."]); if(s.rp[i]==="x") M.piano(s,t,[...n.slice(0,3),n[0]+12].map(x=>x+12),s.sp*1.3,.62); },
  hhstab(s,t,i,n){ s.hs=s.hs||pick(["..x...x...x...x.","..x..x....x..x..","...x..x...x...x."]); if(s.hs[i]==="x") M.hhstab(s,t,n.slice(0,3).map(x=>x+12),s.sp*1.4,.9); },
  estab(s,t,i,n){ s.es=s.es||pick(["..x.....x.x.....","x.....x.....x...","...x..x....x...."]); if(s.es[i]==="x") M.saw(s,t,n.slice(0,3).map(x=>x+12),s.sp*1.2,.6); },
});
Object.assign(LEADX,{ acid303:(s,t,m,dur,v,p)=>M.tb(s,t,m,Math.min(dur,s.sp*2),v*1.15,{from:p,cut:1400,acc:true,mu:true}) });
Object.assign(SNX,{ crack:(s,t)=>{ D.snare(s,t,1.15,.3,s.sTone*1.05); D.snap(s,t,.45); }, elec:(s,t)=>{ D.snare(s,t,.95,.28,s.sTone*1.1); D.clap(s,t,.4,.25); } });
Object.assign(INST_NAMES,{bstab:"horn and guitar stabs",scratch:"chicken-scratch guitar",ravepiano:"rave piano",hhstab:"hard house stabs",estab:"electro stabs",acid303:"acid line"});
// the genres: [id, label, family, style]
const CLUK_GENRES=[["bigbeat","Big beat","Big beat & breaks","BIG BEAT"],["breaks","Breakbeat","Big beat & breaks","BREAKBEAT"],["funkbreaks","Funky breaks","Big beat & breaks","FUNKY BREAKS"],
  ["acidbreaks","Acid breaks","Big beat & breaks","ACID BREAKS"],["ravebreaks","Rave breaks","Big beat & breaks","RAVE BREAKS"],
  ["electro","Electro","Electro & hard house","ELECTRO"],["electrohouse","Electro house","Electro & hard house","ELECTRO HOUSE"],["hardhouse","Hard house","Electro & hard house","HARD HOUSE"]];
// longer forms than MDFM's: two to two and a half minutes, with a breakdown and a double hook at the end
const CLUK_FORMS=[
  [["intro",1],["verse",1],["pre",.5],["hook",1],["verse",1],["pre",.5],["hook",1],["break",1],["hook",2],["outro",.5]],
  [["intro",1],["hook",1],["verse",1],["pre",.5],["hook",1],["break",.5],["bridge",1],["hook",2],["outro",1]],
  [["intro",.5],["verse",1],["hook",1],["verse",1],["pre",.5],["hook",1],["break",1],["hook",1],["hook",1],["outro",.5]]];
const CK={forms:CLUK_FORMS,unit:8,meters:[],cx:1};
const BRK_K=["x.........x..x..","x......x..x.....","x.x.......x.....","x.........xx...."];
Object.assign(STY,{
  "BIG BEAT":{...CK,lvl:0.73,bpm:[118,132],sw:[.5,.54],scales:[AE,DO,MIXO],mode:"any",voicing:"triad",K:BRK_K,S:[["....x.......x...","....x.......x..x"],["....x.......x...","....x..x....x..."]],
    H:["x.x.x.x.x.x.x.x.","xxx.x.xxx.x.x.x.","x.xxx.x.x.xxx.xr"],O:["......o.......o.",""],P:["...x.....x......",".x....x....x..x."],perc:"ghost",snare:"crack",kv:1.1,drive:1.5,
    bass:"riff",chords:"bstab",pad:"none",lead:"brass1",leadFrom:2,octLead:72,crashBar:1,fam:{chords:["bstab","bstab","scratch","stab1"],lead:["brass1","gtrlead","acid303","chop"],pad:["none","strings"]}},
  "BREAKBEAT":{...CK,lvl:0.8,bpm:[128,136],sw:[.5,.52],scales:[AE,PH,DO],mode:"min",voicing:"triad",K:["x.........x..x..","x......x..x.....","x.x.......x....."],S:[["....x.......x..."]],
    H:["x.xxx.xxx.xxx.xx","x.x.x.x.x.x.x.x."],O:["..o...o...o...o.",""],P:["......x.......x.","..x.......x....."],perc:"ghost",snare:"crack",kv:1.05,drive:1.3,
    bass:"rubber",chords:"estab",pad:"pad",lead:"sqlead",leadFrom:2,octLead:72,fam:{chords:["estab","stab1","supersaw"],lead:["sqlead","fmlead","saw","chop"],pad:["pad","none","strings"]}},
  "FUNKY BREAKS":{...CK,lvl:1.15,hv:.55,bpm:[110,120],sw:[.53,.57],scales:[DO,MIXO],mode:"any",voicing:"ext",K:["x.x.......x..x..","x......x.x......","x.........x.x..."],S:[["....x.......x..."],["....x.......x...","....x.......x.x."]],
    H:["x.xxx.xxx.xxx.xx"],O:["..........o.....",""],P:["",""],perc:"",snare:"crack",kv:1.05,drive:1.2,
    bass:"slap",chords:"scratch",pad:"none",lead:"brass1",leadFrom:2,octLead:72,cpb:2,fam:{chords:["scratch","scratch","clav"],lead:["brass1","sax","gtrlead"],pad:["none","pad"]},progs:{min:[[0,0,3,3],[0,3,0,4],[0,6,0,3]],maj:[[0,3,0,3],[0,0,3,4]]}},
  "ACID BREAKS":{...CK,lvl:1.2,hv:.55,bpm:[130,136],sw:[.5,.52],scales:[PH,AE],mode:"min",voicing:"triad",K:BRK_K,S:[["....x.......x..."],["....x.......x..x"]],
    H:["x.xxx.xxx.xxx.xx","x.x.x.x.x.x.x.x."],O:["..o.......o.....",""],P:["......x.......x.",""],perc:"ghost",snare:"crack",kv:1.1,drive:1.4,
    bass:"acidline",chords:"padonly",pad:"pad",lead:"sqlead",leadFrom:4,octLead:72,fam:{chords:["padonly","estab","stab1"],lead:["sqlead","chop","fmlead"],pad:["pad","none"]}},
  "RAVE BREAKS":{...CK,lvl:0.78,bpm:[134,140],sw:[.5,.52],scales:[AE,HM],mode:"min",voicing:"triad",K:["x.........x.....","x.........xx....","x......x..x....."],S:[["....x.......x..."],["....x.......x.x."]],
    H:["x.x.x.x.x.x.x.x.","x.xxx.x.x.xxx.x."],O:["..o...o...o...o.",""],P:["......x.......x.",""],perc:"ghost",snare:"crack",kv:1.05,drive:1.3,
    bass:"reese",chords:"ravepiano",pad:"strings",lead:"saw",leadFrom:2,octLead:76,fam:{chords:["ravepiano","ravepiano","supersaw"],lead:["saw","chop","pluck"],pad:["strings","pad","choir"]}},
  "ELECTRO":{...CK,lvl:0.92,bpm:[118,128],sw:[.5,.53],scales:[PH,AE],mode:"min",voicing:"triad",K:["x.....x...x.....","x.....x.......x.","x..x......x....."],S:[["....x.......x..."]],
    H:["x.x.x.x.x.x.x.x.","xxxxxxxxxxxxxxxx"],O:[""],P:["..x.......x.....","......x.......x."],perc:"rim",snare:"elec",kv:1.1,laser:1,
    bass:"electro",chords:"estab",pad:"pad",lead:"sqlead",leadFrom:2,octLead:72,fam:{chords:["estab","pluckarp","stab1"],lead:["sqlead","fmlead","saw"],pad:["pad","warm","none"]}},
  "ELECTRO HOUSE":{...CK,lvl:0.75,bpm:[126,129],sw:[.5,.52],scales:[AE,DO,PH],mode:"min",voicing:"triad",K:[F4],S:[["....x.......x..."]],
    H:["..x...x...x...x.","x.xxx.xxx.xxx.xx"],O:["..o...o...o...o."],P:["...x.......x....",""],perc:"rim",snare:"elec",kv:1.1,drive:1.2,laser:1,
    bass:"rubber",chords:"supersaw",pad:"pad",lead:"saw",leadFrom:2,octLead:74,fam:{chords:["supersaw","estab","stab1"],lead:["saw","sqlead","chop"],pad:["pad","none"]}},
  "HARD HOUSE":{...CK,lvl:0.8,bpm:[142,148],sw:[.5,.51],scales:[AE,PH,HM],mode:"min",voicing:"triad",K:[F4],S:[["....x.......x..."]],
    H:["..x...x...x...x.","..xx..x...xx..x."],O:["..o...o...o...o."],P:["...x..x....x..x.",""],perc:"rim",snare:"elec",kv:1.1,drive:1.3,
    bass:"hhbass",chords:"hhstab",pad:"pad",lead:"saw",leadFrom:2,octLead:74,fam:{chords:["hhstab","supersaw","estab"],lead:["saw","sqlead","chop"],pad:["pad","none"]}},
});
for(const g of CLUK_GENRES) STYLE_FAM[g[3]]="cluk";
KIT_W.cluk={punch:.55,classic:.25,boom:.2}; METER_FIT.cluk=[];
/* 1.25 (E2): PTRN 101.1 plays CLUK's eight genres too, as a family "Big beat & electro", in the basic form of its other genres:
   PTRN's song forms and lengths (no CLUK breakdown forms), its blends and tags, no CLUK station words; the beats, basses, stabs,
   drum drive and electro's laser are CLUK's. Own style names ("PTRN BIG BEAT"...), so CLUK's songs are untouched. */
const PTRN_CL_LVL={"BIG BEAT":.47,"BREAKBEAT":.44,"FUNKY BREAKS":.9,"ACID BREAKS":.6,"RAVE BREAKS":.34,"ELECTRO":.55,"ELECTRO HOUSE":.44,"HARD HOUSE":.47};   // PTRN's level range (CLUK's own bus runs hotter)
const PTRN_CLUK=CLUK_GENRES.map(([id,label,,st])=>[id,label,"Big beat & electro","PTRN "+st]);
for(const g of PTRN_CLUK){ const n=g[3].slice(5), c=STY[n]; STY[g[3]]={...c,forms:undefined,unit:undefined,cx:0,lvl:PTRN_CL_LVL[n]}; }
PTRN_GENRES.push(...PTRN_CLUK); for(const g of PTRN_CLUK){ PTRN_KEY[g[3]]=g; ptrnTypes[g[0]]=true; }
STATION_TYPES.ptrn=[...PTRN_GENRES.map(g=>[g[0],g[1],g[2]]),["tags","Tags: IDs and vocal drops","Voice"]];
KIT_W["Big beat & electro"]=KIT_W.cluk;
const CLUK_KEY=Object.fromEntries(CLUK_GENRES.map(g=>[g[3],g]));
// the extras on top: a soft laser in electro hooks, and (in the apps, which render voices) shouted station words, chopped like a big-beat sample
let VSC=null, vscLoading=false;
const CLUK_WORDS=["Cluck","ninety two point three","everything in the chicken","go hard","feed time","bawk","make some noise","lazers"];
function loadClukSamples(){ if(VSC||vscLoading||typeof opts.tts!=="function"||!ctx) return; vscLoading=true;
  const say=(w,v)=>Promise.race([opts.tts({text:w,voice:v,rate:1,pitch:1}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))]);
  const one=w=>say(w,pick(["Daniel","Samantha","Karen","Tom","Moira","Ava"])).catch(()=>say(w,null))
    .then(buf=>ctx.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength))).then(b=>({b,r:revBuf(b)})).catch(()=>null);
  Promise.all(CLUK_WORDS.map(one)).then(a=>{ VSC=a.filter(Boolean); vscLoading=false; }); }
function clukExtras(s,sec,sb,i,tt,lastBar,nextSec){ const st=s.st, sp=s.sp;
  if(st.laser&&sec.kind==="hook"&&sb%4===3&&(i===14||(i===10&&sb%8===7))) D.laser(s,tt,.8);
  if(!st.cx) return;   // PTRN's big beat and electro (1.25 E2): the laser only
  const smp=VSC&&VSC.length?VSC:null; if(!smp) return;
  if(sec.kind==="hook"&&sb===0&&i===0&&R()<.65) M.sample(s,tt,pick(smp),pick([0,0,-3]),sp*10,.85,{thr:.3});
  else if(sec.kind==="hook"&&sb%4===3&&i===12&&R()<.4){ const w=pick(smp); for(let k=0;k<4;k++) M.sample(s,tt+k*sp,w,0,sp*.8,.7); }
  else if(lastBar&&i===8&&nextSec.kind==="hook"&&(sec.kind==="break"||sec.kind==="pre")&&R()<.6) M.sample(s,tt,pick(smp),pick([0,-5]),sp*8,.75,{rev:1});
}
/* The station: a song (about two minutes, it rips), then every song or two a break: a show, the request line or ads,
   each with its own music (a theme from the show's genre, stingers at every segment break, a bed under the talk, an
   outro), then Rhonda brings in the next song. Breaks are lines played one at a time, so a station ID can cut in. */
const CLUKW=typeof createCluk==="function"?createCluk(R):null;
const CLUK_LEVEL=1;
let clukIn=null, clukRv=null;
function cDest(){ if(!clukIn||clukIn.context!==ctx){ clukIn=G(CLUK_LEVEL); const hs=filt("highshelf",7500); hs.gain.value=-3; clukIn.connect(hs).connect(pre);   // a touch less fizz up top: hard, not harsh
    clukRv=ctx.createConvolver(); clukRv.buffer=songRev.buffer; clukRv.connect(filt("highpass",280)).connect(filt("lowpass",4500)).connect(G(.4)).connect(clukIn); } return clukIn; }
const clukTypes=Object.fromEntries([...CLUK_GENRES.map(g=>[g[0],true]),...(CLUKW?CLUKW.shows.map(s=>[s.id,true]):[]),["callers",true],["ads",true],["ids",true]]);
STATION_TYPES.cluk=CLUKW?[...CLUK_GENRES.map(g=>[g[0],g[1],g[2]]),...CLUKW.shows.map(s=>[s.id,s.label,"Shows"]),["callers","Rhonda's request line","On the air"],["ads","Ads from inside the Chicken","On the air"],["ids","Rhonda and Clark between songs","On the air"]]:[];
STATIONS.splice(1,0,{id:"cluk",name:"CLUK 92.3",freq:"92.3",tagline:"Everything in the Chicken.",style:"Big beat, breaks, electro"});   // by frequency: 88.1, 92.3, 95.5, 99.9, 101.1, 108.0
const clukPool=()=>{ const on2=CLUK_GENRES.filter(g=>clukTypes[g[0]]).map(g=>g[3]); return on2.length?on2:CLUK_GENRES.map(g=>g[3]); };
const clukRecent=[];
let cluk=null;
const clukCast=extra=>talkCast({voice:CLUKW.HOSTS.voice,dj:CLUKW.HOSTS.dj,...extra});
const clukNp=s=>({title:s.title,artist:s.artist});
function clukMake(){ const made=makeSong(null,clukPool(),clukRecent); if(GON.cluk) gSongLen(made,"cluk"); made.title=CLUKW.title(); made.artist=CLUKW.artist(); made.genre=(CLUK_KEY[made.name]||[0,made.name])[1]; return made; }
function clukOn(){ clukOff(.01); if(!CLUKW) return; cluk={n:0,next:clukMake(),song:null,since:0,gap:1,bed:null,dead:false,talkRecent:[],t:0,lines:null,i:0,cast:null,style:"electro",timer:0,rave:null,mode:"talk"};
  const st=cluk; st.timer=setInterval(()=>clukTick(st),40); const L=[]; if(clukTypes.ids) L.push(["music","id"],["voice",CLUKW.ids()]); L.push(["song"]); if(clukTypes.ids) L.push(["pause",2200],["dj",CLUKW.djIntro(clukNp(st.next))]);
  st.t=setTimeout(()=>clukRun(st,L),500); }
function clukOff(fade=1.2){ const st=cluk; if(!st) return; st.dead=true; cluk=null; clearTimeout(st.t); clearInterval(st.timer); cBedOff(st,.8); clukSongEnd(st,fade); clukRaveEnd(st,fade); }
// the song on air: ticked like MDFM's (40 ms, a quarter second ahead)
function clukTick(st){ if(st.dead||!on||station!=="cluk"||!ctx) return; const now=ctx.currentTime, ahead=now+AHEAD(), late=now-.3;
  for(const s of [st.song,st.rave&&st.rave.s]){ if(!s||s.done) continue; while(!s.done&&s.next<ahead){ const adv=mStep(s,s.next,pStep(s.next,late)); s.step++; s.next+=adv; if(s.step>=s.endStep) s.done=true; } }
  const s=st.song; if(s&&s.done&&now>s.next+1.2&&!s.over){ s.over=true; clukSongEnd(st,.4); clukAfterSong(st); }
  const rv=st.rave; if(rv&&!rv.over&&now>=rv.until){ rv.over=true; clukRaveEnd(st,2.2); setTimeout(()=>{ if(!st.dead) clukStep(st,rv.n); },2300); } }
function clukSongStart(st){ const made=st.next||clukMake(); st.next=null; const recipe={...made}, t0=ctx.currentTime+.12, s=setupSong(made,t0,0,cDest(),clukRv,"cluk");
  s.recipe=recipe; s.sp0=s.sp; s.swing0=s.swing; s.endStep=s.bars*16; s.lv=s.st.lvl||1; st.song=s; st.since++; st.mode="song";
  nowPlaying={station:"cluk",title:s.title,style:s.genre,artist:s.artist,bpm:s.bpm,...songFacts(s)}; emit("nowplaying",nowPlaying); }
function clukSongEnd(st,fade){ const s=st&&st.song; if(!s) return; st.song=null; st.last=s; if(!ctx) return; const t=ctx.currentTime;
  for(const g of [s.bus.gain,s.rvf.gain]) try{ holdAt(g,t); g.linearRampToValueAtTime(.0001,t+fade); }catch(e){} s.done=true; setTimeout(()=>{ try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} },fade*1000+3500); }
const clukDuck=(st,on2)=>{ const s=st.song; if(!s||s.duckOn===on2) return; s.duckOn=on2; fadeTo(s.bus.gain,s.lv*(on2?.3:1),on2?.4:1.5,ctx.currentTime); };
function clukAfterSong(st){ if(st.dead||!on) return; st.mode="talk"; const prev=st.last, nx=st.next=clukMake(), L=[], talky=["callers","ads",...CLUKW.shows.map(s=>s.id)].some(k=>clukTypes[k]);
  if(talky&&st.since>=st.gap){ st.since=0; st.gap=R()<.45?1:2;
    if(clukTypes.ids&&prev) L.push(["dj",CLUKW.djBack(clukNp(prev))]);
    if(clukTypes.ids&&R()<.45) L.push(["music","id"],["voice",CLUKW.ids()]);
    L.push(...clukSegment(st));
    L.push(["song"]); if(clukTypes.ids) L.push(["pause",2200],["dj",R()<.12?CLUKW.raveOpen():CLUKW.djIntro(clukNp(nx))]); }
  else if(clukTypes.ids&&prev&&R()<.45) L.push(["dj",CLUKW.djBack(clukNp(prev))],["song"],["pause",2200],["dj",R()<.6?CLUKW.djIntro(clukNp(nx)):CLUKW.bridge()]);
  else L.push(["pause",1200],["song"]);
  clukRun(st,L); }
// one break: a show, the request line or an ad block (shows sometimes have ads after)
function clukSegment(st){
  const W=[]; const shows=CLUKW.shows.filter(s=>clukTypes[s.id]&&!st.talkRecent.includes(s.id)), allShows=CLUKW.shows.filter(s=>clukTypes[s.id]);
  if(shows.length||allShows.length) W.push(["show",4]); if(clukTypes.callers) W.push(["callers",1.2]); if(clukTypes.ads) W.push(["ads",1]);
  if(!W.length) return []; let r=R()*W.reduce((a,x)=>a+x[1],0), k=W[0][0]; for(const [x,w] of W){ if((r-=w)<=0){ k=x; break; } }
  let L=[];
  if(k==="show"){ const pool=shows.length?shows:allShows, ned=pool.find(s=>s.id==="ned"), sh=ned&&R()<.22?ned:pick(pool); st.talkRecent.push(sh.id); while(st.talkRecent.length>Math.min(4,CLUKW.shows.length-1)) st.talkRecent.shift(); L=clukShowLines(CLUKW.show(sh.id)); }   // Lazer Hour comes up a little more often
  else if(k==="callers"){ const c=CLUKW.caller(); L=[["style",pick(["funkbreaks","electro","bigbeat"])],["np",{title:"A caller",style:"Rhonda's Request Line",artist:CLUKW.HOSTS.dj.name}],["rec",{show:"Rhonda's Request Line",title:"A caller",hosts:CLUKW.HOSTS.dj.name}],["cast",c.cast],["music","sting"],["music","bedOn"],...c.lines,["music","bedOff"],["recstop"]]; }
  if(k==="show"&&clukTypes.ads&&R()<.4) L.push(...clukAdLines(R()<.6?1:2));
  if(k==="ads") L=clukAdLines(R()<.5?2:3);
  return L; }
function clukAdLines(n){ const L=[["voice",CLUKW.adIntro()]]; for(let i=0;i<n;i++){ const a=CLUKW.ad(), sty=pick(["funkbreaks","bigbeat","electrohouse","electro","breaks"]);
    L.push(["style",sty],["np",{title:a.title,style:"Ad",artist:"A word from inside the Chicken"}],["rec",{show:"Ad",title:a.title,hosts:"CLUK sponsors",ad:true}],["cast",a.cast],["music","sting"],["music","bedOn"],...a.lines,["music","bedOff"],["recstop"]); }
  return L; }
// a scripted show: the station voice's intro, the theme with its bed under the opening lines, a stinger at every segment break, the bed back under the sign-off, the outro
function clukShowLines(ep){ const spoken=l=>!["sfx","music","pause","seg","rave"].includes(l[0]), L=[["style",ep.style],["np",{title:ep.title,style:ep.show,artist:ep.hosts}],["rec",{show:ep.show,title:ep.title,hosts:ep.hosts}],["cast",ep.cast]];
  L.push(["voice",ep.open[0]],["music","theme"],["voice",ep.open[1]]);
  const body=[]; for(const l of ep.lines){ const m=l[0]==="seg"?["music","sting"]:l; if(m[0]==="music"&&(!body.length||body[body.length-1][0]==="music")) continue; body.push(m); }
  let i2=-1, k=0; for(let i=0;i<body.length;i++) if(spoken(body[i])&&++k===1){ i2=i; break; }
  let last=-1; for(let i=body.length-1;i>=0;i--) if(spoken(body[i])){ last=i; break; }
  body.forEach((l,i)=>{ if(i===last&&i>i2+1) L.push(["music","bedOn"]); L.push(l); if(i===i2) L.push(["music","bedOff"]); });
  L.push(["music","outro"],["voice",ep.close],["recstop"]); return L; }
function clukRun(st,L){ if(st.dead) return; st.lines=L; st.i=0; st.n++; st.cast=clukCast({}); clukStep(st,st.n); }
const clukSay=t=>String(t).replace(/\bCLUK\b/g,"Cluck");   // "CLUK" is said "cluck"; captions keep the call letters
function clukStep(st,n){
  if(st.dead||n!==st.n||!on) return;
  if(st.i>=st.lines.length){ cBedOff(st,1); if(REC&&REC.sp&&REC.sp.station==="cluk") recStop(); speaking=false; if(st.song) clukDuck(st,false); return; }
  const line=st.lines[st.i++], nx=d=>{ st.t=setTimeout(()=>clukStep(st,n),Math.max(0,d)); };
  if(line[0]==="song"){ speaking=false; cBedOff(st,1.2); clukSongStart(st); nx(0); return; }
  if(line[0]==="style"){ st.style=line[1]; nx(0); return; }
  if(line[0]==="cast"){ st.cast=clukCast(line[1]||{}); nx(0); return; }
  if(line[0]==="np"){ nowPlaying={station:"cluk",bpm:null,talk:true,...line[1]}; emit("nowplaying",nowPlaying); nx(0); return; }
  if(line[0]==="rec"){ const sp={kind:"cluk",station:"cluk",...line[1]}; emit("spot",sp); recStart(sp); st.mode="talk"; nx(0); return; }
  if(line[0]==="recstop"){ cBedOff(st,1.2); if(REC&&REC.sp&&REC.sp.station==="cluk") recStop(); nx(300); return; }
  if(line[0]==="rave"){ speaking=false; cBedOff(st,.6); clukRave(st,n,Math.max(30,Math.min(120,+line[1]||75))); return; }   // Lazer Hour: Ned does a rave (the show waits for it)
  if(line[0]==="music"){ const t=ctx.currentTime+.05, k=line[1]; let d=0;
    try{ if(k==="bedOn"){ cBedOn(st,st.style,t); d=1100; } else if(k==="bedOff"){ cBedOff(st,2.2); d=100; }
      else if(k==="theme"){ const len=cCue(st.style,"theme",t); cBedOn(st,st.style,t+len-.6); d=Math.max(1,len-.5)*1000; }
      else if(k==="outro"){ cBedOff(st,.6); d=(cCue(st.style,"outro",t)+.1)*1000; }
      else { if(st.song) clukDuck(st,true); d=cCue(k==="id"?"electro":st.style,k,t)*850; } }catch(e){}
    nx(d); return; }
  speaking=true; let l=line; if(typeof l[1]==="string"&&l[0]!=="sfx"&&l[0]!=="pause"){ const v=spelled(l[1]), say=clukSay(l[1]); if(v!==l[1]||say!==l[1]) l=[l[0],{say,show:v}]; }
  if(st.song&&l[0]!=="pause"&&l[0]!=="sfx") clukDuck(st,true);   // Rhonda talks over the start of a song: it dips under her
  speakLines([l],st.cast,()=>{ if(st.dead||n!==st.n) return; if(st.song&&st.i>=st.lines.length) clukDuck(st,false); clukStep(st,n); });
}
/* Show music, built from each genre's own song: one song per genre is written the first time it's needed and kept,
   so a show's theme, stingers and bed stay the same all session. Theme: the hook, four bars, and a hit. Stingers: a bar
   of the hook into a hit, a snare roll into a hit, or a reversed riser into a hit. Bed: the verse, quietly, looping. */
const CUE_REC={}, cStingDeck={};
const cRec=style=>{ const g=CLUK_GENRES.find(x=>x[0]===style)||CLUK_GENRES[5]; return CUE_REC[g[0]]||(CUE_REC[g[0]]=makeSong(g[3],[g[3]],[])); };
const CUE_GAIN=.85;
function cSong(rec,t,level){ const s=setupSong({...rec},t,0,cDest(),clukRv,"cluk"); s.handed=true; s.bus.gain.setValueAtTime(level*(rec.st.lvl||1),t); s.next=t; return s; }   // handed: cue songs never re-lock the effects' beat (1.25)
function cPlay(s,fromBar,bars){ s.step=fromBar*16; const end=(fromBar+bars)*16; while(s.step<end){ const adv=mStep(s,s.next,true); s.step++; s.next+=adv; } return s.next; }
function cFree(s,t,fade=.6){ for(const g of [s.bus.gain,s.rvf.gain]) try{ g.setValueAtTime(g.value,t); g.exponentialRampToValueAtTime(.0001,t+fade); }catch(e){} setTimeout(()=>{ try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} },(t-ctx.currentTime+fade)*1000+4000); }
function cHit(s,t,big=1){ const r=bRoot(s,s.prog[0],0,31,43), ch=s.chord(s.prog[0]); D.kick(s,t,1.1,s.kTn||s.kTune); D.snare(s,t,.9,.5,s.sTone); D.crash(s,t,big); M.dirt(s,t,r,1.2*big,1,null,1); M.bstab(s,t,ch.slice(0,3),.9*big,.9); }
function cCue(style,kind,t){ const rec=cRec(style), hk=(rec.sections.find(x=>x.kind==="hook")||rec.sections[0]).start, bar=rec.sp*16;
  if(kind==="theme"){ const n=bar>2.1?2:4, s=cSong(rec,t,CUE_GAIN); const e=cPlay(s,hk,n); cHit(s,e,1.2); cFree(s,e+2,1.4); return e-t+1.6; }
  if(kind==="outro"){ const s=cSong(rec,t,CUE_GAIN); const e=cPlay(s,hk,bar>2.1?1:2); cHit(s,e,1.4); cFree(s,e+2.6,1.6); return e-t+2.4; }
  if(kind==="sting"||kind==="id"){ const key=kind+style; let dk=cStingDeck[key]; if(!dk||!dk.length) dk=cStingDeck[key]=[0,1,2].sort(()=>R()-.5); const v=kind==="id"?pick([0,2]):dk.pop(), s=cSong(rec,t,CUE_GAIN*.95);
    if(v===0){ const e=cPlay(s,hk,1); cHit(s,e,.9); cFree(s,e+1.4,1); return e-t+1.2; }
    if(v===1){ for(let k=0;k<8;k++) D.snare(s,t+k*rec.sp,.35+k*.08,.12,s.sTone); const e=t+rec.sp*8; cHit(s,e,1); cFree(s,e+1.4,1); return e-t+1.2; }
    D.riser(s,t,bar/2); if(rec.st.laser) D.laser(s,t+bar/4,.9); const e=t+bar/2; cHit(s,e,1); cFree(s,e+1.4,1); return e-t+1.2; }
  return 0; }
// the bed under talk: the genre's verse, softly, a bar at a time, stopping by itself after 50 seconds
function cBedOn(st,style,t0){ if(!st||st.bed) return; const rec=cRec(style), vs=(rec.sections.find(x=>x.kind==="verse")||rec.sections[0]).start, s=cSong(rec,t0,.0001), L=.15*(rec.st.lvl||1);
  s.bus.gain.setValueAtTime(.0001,ctx.currentTime); s.bus.gain.linearRampToValueAtTime(L,t0+.8); const bed={s,bar:0,stop:false,until:Date.now()+50000}; st.bed=bed;
  const pump=()=>{ if(bed.stop||!ctx||st.dead) return cBedOff(st,1.5,bed); if(Date.now()>bed.until) return cBedOff(st,3,bed);
    while(s.next<ctx.currentTime+1.5){ if(s.next<ctx.currentTime) s.next=ctx.currentTime+.05; s.step=(vs+bed.bar%4)*16; const end=s.step+16; while(s.step<end){ const adv=mStep(s,s.next,true); s.step++; s.next+=adv; } bed.bar++; }
    bed.t=setTimeout(pump,400); };
  pump(); }
function cBedOff(st,fade=1.6,which){ const bed=which||(st&&st.bed); if(!bed) return; if(st&&st.bed===bed) st.bed=null; if(bed.off) return; bed.off=bed.stop=true; clearTimeout(bed.t);
  try{ fadeTo(bed.s.bus.gain,.0001,fade,ctx.currentTime); }catch(e){} setTimeout(()=>{ try{ bed.s.bus.disconnect(); bed.s.rvf.disconnect(); }catch(e){} },fade*1000+4000); }
/* Lazer Hour's raves: Ned says the word, and the hardest genre that's switched on plays from its hook (the drop) for a
   minute or so, lasers on every other bar, then fades back to the show. */
function clukRave(st,n,secs){ const pool=["ELECTRO","ELECTRO HOUSE","HARD HOUSE","RAVE BREAKS","BIG BEAT"].filter(k=>clukPool().includes(k)), made=makeSong(pool.length?pick(pool):pick(clukPool()),clukPool(),[]);
  const t0=ctx.currentTime+.15, s=setupSong(made,t0,0,cDest(),clukRv,"cluk"), hk=(s.sections.find(x=>x.kind==="hook")||s.sections[0]).start-1;
  s.step=Math.max(0,hk)*16; s.endStep=s.bars*16; s.lv=s.st.lvl||1; s.bus.gain.setValueAtTime(.0001,t0); s.bus.gain.exponentialRampToValueAtTime(s.lv,t0+.8);
  secs=Math.min(secs,(s.endStep-s.step)*songSp("cluk",s)*meterRatio(s)*1+.5);   // 1.25: never past the end of its song
  const bar=s.sp*16; for(let b=1;b*bar<secs;b+=2) D.laser(s,t0+b*bar+s.sp*R2(14),.9);
  st.rave={s,n,until:ctx.currentTime+secs,over:false}; emit("spot",{kind:"rave",station:"cluk",text:"Rave"}); }
const R2=n=>Math.floor(R()*n);
function clukRaveEnd(st,fade){ const rv=st&&st.rave; if(!rv) return; st.rave=null; const s=rv.s; if(!ctx) return; const t=ctx.currentTime;
  for(const g of [s.bus.gain,s.rvf.gain]) try{ holdAt(g,t); g.linearRampToValueAtTime(.0001,t+fade); }catch(e){} s.done=true; setTimeout(()=>{ try{ s.bus.disconnect(); s.rvf.disconnect(); }catch(e){} },fade*1000+3500); }
function clukId(){ const st=cluk; if(!on||station!=="cluk"||!st||!clukTypes.ids) return; const line=CLUKW.ids(); emit("spot",{kind:"id",station:"cluk",text:line});
  if(st.lines&&st.i<st.lines.length&&speaking){ st.lines.splice(st.i,0,["music","id"],["voice",line]); return; }
  if(speaking||st.rave) return; speaking=true; const g=gen; if(st.song) clukDuck(st,true);
  const d=cCue("electro","id",ctx.currentTime+.05);
  setTimeout(()=>{ if(g!==gen||st.dead){ speaking=false; return; } speakLines([["voice",{say:clukSay(line),show:line}]],st.cast||clukCast({}),()=>{ speaking=false; if(st.song) clukDuck(st,false); }); },d*850); }
function clukSkip(){ const st=cluk; if(!on||!st) return; if(st.rave){ st.rave.until=0; return; }
  if(st.song){ if(speaking){ gen++; hush(); } st.song.over=true; clukSongEnd(st,1.5); st.n++; clukAfterSong(st); return; }   // a song on (Rhonda may be talking over its start): on to whatever comes after it
  gen++; hush(); cBedOff(st,.6); recStop(true); st.n++; clukSongEnd(st,1.2); clukRun(st,[["pause",700],["song"]]); }
// "Save" on CLUK: the song on air (or the last one), rendered again from the top
async function renderCluk(){ const st=cluk, live=st&&(st.song||st.last); if(!live) return null;
  const sp=gOn("cluk","bpm")?15/GRV.cluk.bpm:live.sp0||live.sp, secs=Math.min(900,live.bars*16*songSp("cluk",live)*meterRatio(live)+3);
  const info=gFacts({station:"cluk",stationName:"CLUK 92.3",title:live.title,artist:live.artist,style:live.genre,bpm:Math.round(15/sp),...songFacts(live)});
  midiStart("cluk",.05,secs,{bpm:15/sp,time:songMeter(live)||"4/4",title:info.title,text:`CLUK 92.3. ${info.style}, ${info.key}. ${info.artist}`});
  const pr=renderOffline("cluk",secs,{recipe:live.recipe}), cap=midiTake(), buffer=await pr, midi=midiOut(cap);
  let pk=0; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  const k=pk>0?Math.min(8,.89/pk):1; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++) d[i]*=k; }
  return {buffer,midi,info}; }
/* ---------- STYLE MATRIX (1.25, phase E3 redesign): pull the station's music toward ten directions ----------
   The directions sit on a circle (clockwise from the top, 36 degrees apart): ROCK, POP, DANCE, HIP-HOP, LO-FI, SPACE,
   ORCHESTRAL, JAZZ, LATIN, COUNTRY. Neighbours blend musically: the top half is band and energy, the bottom chill and
   space; the right side electronic, the left acoustic. The song keeps its notes, chords, melody and form.
   Staged, not layered: as a direction goes up it first nudges the feel (swing, push, accent) and tints the sound (5-50%),
   then crossfades the drum kit into its own (15-45%) and brings in its pattern extras (25-60%), lays its keys under the
   song's and swaps them (30-90%), swaps the bass (at 50%, on a bar line) and the lead (at 70%, on a 4-bar line), and only
   above 50% pulls the tempo, and only if the song is outside the style's tempo range (half and double time count).
   One direction owns a part: the strongest that has an idea for it. Others add only their groove extras and sound.
   Nothing here draws from the song's own random numbers (the matrix has its own stream), so the song stays the song.
   Each direction's parts are level-matched per part (MX_TRIM, from the _mxCal hook). The style sound stage sits before
   the station compressor (through a unity gain, so it's out of the path, bit for bit, at zero).
   CHAOS is no longer a direction: it's GLITCH, in the effects. All at zero: nothing is rerouted or built. */
const mxSS=(a,b,x)=>x<=a?0:x>=b?1:(u=>u*u*(3-2*u))((x-a)/(b-a));   // smoothstep
let mxSeed=0x2545F491;
const mxRand=()=>{ mxSeed^=mxSeed<<13; mxSeed^=mxSeed>>>17; mxSeed^=mxSeed<<5; return (mxSeed>>>0)/4294967296; };   // the matrix's own random stream
const mxHash=(a,b,c)=>{ let h=Math.imul((a|0)^0x9E3779B9,0x85EBCA6B)^Math.imul((b|0)+0x632BE5AB,0xC2B2AE35)^Math.imul((c|0)+0x27D4EB2F,0x165667B1); h^=h>>>15; h=Math.imul(h,0x2C1B3C6D); h^=h>>>12; return (h>>>0)/4294967296; };   // a fixed "random" per bar and slot
function mxPriv(fn){ const r0=R; R=mxRand; try{ return fn(); }catch(e){} finally{ R=r0; } }   // substitutes play with the matrix's stream, not the song's
const pitch=(n,lo,hi)=>{ while(n<lo) n+=12; while(n>hi) n-=12; return n; };
const MX_DRUM=["kick","snare","clap","hat","perc","shaker","tom","crash"], MX_ROLES=[...MX_DRUM,"bass","chord","gchord","pad","lead"];
const MX_STAGE_OF=r=>MX_DRUM.includes(r)?"drums":r==="bass"?"bass":r==="lead"?"lead":"keys";
// a swapped bass plays through a little saturation (glue): a stand-in with a sharper attack than the part it replaces
// would otherwise peak into the limiter and come out quieter. One per song (bus) and context.
function mxBB(s){ const c=s.mxBB; if(c&&c.ctx===ctx) return c.b; const pre=G(.5), sh=ctx.createWaveShaper(); sh.curve=shaper(2.5); osv(sh,"2x"); const post=G(.85); pre.connect(sh).connect(post).connect(s.bsd||s.dr);
  const b=Object.create(s); b.bsd=pre; b.dr=pre; b.mu=pre; b._to=null; s.mxBB={ctx,b}; return b; }
const mxLeg=(d,k)=>d<.6?Math.min(d*k,.75):d;   // basses: short notes held a little longer (legato), long ones as they are
const MX_PUSHK={kick:.3,snare:1,clap:1,hat:.7,shaker:.7,perc:.8,tom:.5,crash:.3};
// once per chord (pads that should only move when the harmony does)
const mxChg=(s,k,i)=>{ const c=s.mxCc||(s.mxCc={}), key=i.notes?i.notes.join(","):String(i.m); if(c[k]===key&&i.t-(c[k+"t"]||0)<4) return false; c[k]=key; c[k+"t"]=i.t; return true; };
const mxRoot=(s,lo,hi)=>pitch(s.mxRoot!=null?s.mxRoot:s.gKey?s.gKey.root:41,lo,hi);
const mxLat=s=>{ const b=s.mxBpm||s.bpm||120; return b<110||b>150?"bossa":"salsa"; };   // Latin's flavour, by the song's tempo (no draw)
/* The directions. roles: how each plays a part, (s, note info, loudness); null = the style leaves that part out (faded
   out at the top of the range); missing = no idea, the next direction (or the song) keeps it. win: the register each part
   is folded into (the lowest note of a chord), kept as one block per part so melodies and voicings stay whole.
   tempo: in-range BPMs (half and double count). feel: swing target, push (ms behind), accent (-1 flat .. 1 hard),
   humanize, ghosts. fx: the stage's tint. groove(G): the pattern extras. bassPat(s,x): a bass pattern once the bass is
   switched (else note by note). half: the half-time snare (dropped on 2 and 4, played on 3). */
const MXD={
  rock:{label:"ROCK",ang:0,inst:{bass:"M.bass"},desc:"Band energy: a hard kit, straight eighths, picked bass, power-chord guitars and a lead guitar",tempo:[[100,160]],feel:{swing:.5},
    win:{bass:[33,47],chord:[40,52],gchord:[40,52],pad:[40,52],lead:[62,84]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v,1.05),snare:(s,i,v)=>D.snare(s,i.t,v,.45,s.sTone||1),clap:(s,i,v)=>D.snare(s,i.t,v*.9,.45),hat:(s,i,v)=>D.hat(s,i.t,v,i.open,s.hatDec),shaker:(s,i,v)=>D.hat(s,i.t,v*.7,false,s.hatDec),
      perc:(s,i,v)=>D.rim(s,i.t,v),tom:(s,i,v)=>D.tom(s,i.t,v),crash:(s,i,v)=>D.crash(s,i.t,v),bass:(s,i,v)=>M.bass(s,i.t,i.m,mxLeg(i.dur,1.8),v),   // legato: the picked bass sustains like the part it replaces (a plucky one at the same loudness peaks into the limiter)
     
      chord:(s,i,v)=>M.guitar(s,i.t,i.notes[0],Math.max(.18,i.dur),v,i.dur<.2),gchord:(s,i,v)=>M.guitar(s,i.t,i.notes[0],Math.max(.18,i.dur),v,i.dur<.2),
      pad:(s,i,v)=>{ if(mxChg(s,"rockpad",i)) M.guitar(s,i.t,i.notes[0],Math.max(.4,i.dur),v); },lead:(s,i,v)=>M.gtrlead(s,i.t,i.m,i.dur,v,i.prev)},
    groove(G){ if(G.hatsSparse) for(let i=0;i<16;i+=2) G.hit("hat",i,.45,(s,t,v)=>D.hat(s,t,v,false,s.hatDec));
      if(G.bar%8===0) G.hit("crash",0,.5,(s,t,v)=>D.crash(s,t,v)); }},
  pop:{label:"POP",ang:36,desc:"Radio pop: a punchy kit with claps, synth bass, bright pads and plucks",tempo:[[100,128]],feel:{swing:.52},fx:{bright:2},
    win:{bass:[40,52],chord:[55,66],gchord:[55,66],pad:[55,66],lead:[64,84]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v,1),snare:(s,i,v)=>{ D.snare(s,i.t,v*.6,.2,s.sTone||1); D.clap(s,i.t,v*.5,.3); },clap:(s,i,v)=>D.clap(s,i.t,v*.8,.3),hat:(s,i,v)=>D.hat(s,i.t,v,i.open,s.hatDec),
      perc:(s,i,v)=>D.snap(s,i.t,v),shaker:(s,i,v)=>D.shaker(s,i.t,v),crash:(s,i,v)=>D.crash(s,i.t,v),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>FI.synbass(s,i.t,i.m,mxLeg(i.dur,1.5),v),
      chord:(s,i,v)=>{ if(i.dur<.35) M.saw(s,i.t,i.notes,i.dur,v*.5); else M.pad(s,i.t,i.notes,i.dur,v,2400);
        if(s.mxPl!==i.bar){ s.mxPl=i.bar; M.pluck(s,i.t,pitch(i.notes[i.notes.length-1]+12,64,84),.22,v*.5); } },
      pad:(s,i,v)=>M.warmpad(s,i.t,i.notes,i.dur,v),lead:(s,i,v)=>M.pluck(s,i.t,i.m,Math.min(i.dur,.4),v)},
    groove(G){ if(!G.has("S",4)) G.hit("clap",4,.22,(s,t,v)=>D.clap(s,t,v,.3)); if(!G.has("S",12)) G.hit("clap",12,.22,(s,t,v)=>D.clap(s,t,v,.3));
      if(G.hatsSparse) for(let i=0;i<16;i+=2) G.hit("hat",i,.4,(s,t,v)=>D.hat(s,t,v,false,s.hatDec)); }},
  dance:{label:"DANCE",ang:72,desc:"The club: four on the floor, sidechain pump, offbeat bass, open hats and supersaw stabs",tempo:[[118,132],[170,176]],feel:{swing:.5},fx:{bright:1.5},
    win:{bass:[33,45],chord:[60,71],gchord:[60,71],pad:[55,66],lead:[64,84]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v,1),snare:(s,i,v)=>D.clap(s,i.t,v*.85,.3),clap:(s,i,v)=>D.clap(s,i.t,v*.85,.3),hat:(s,i,v)=>D.hat(s,i.t,v*.8,i.open,s.hatDec),
      perc:(s,i,v)=>D.snap(s,i.t,v),shaker:(s,i,v)=>D.hat(s,i.t,v*.6,false,s.hatDec),crash:(s,i,v)=>D.crash(s,i.t,v),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>M.bass(s,i.t,i.m,mxLeg(i.dur,1.5),v),
      chord:(s,i,v)=>{ const g=(s.sp||.12)*1.8; if(i.t-(s.mxSt||-9)<g) return; s.mxSt=i.t; M.saw(s,i.t,i.notes,Math.min(i.dur,(s.sp||.12)*1.3),v*.75); },
      pad:(s,i,v)=>M.pad(s,i.t,i.notes,i.dur,v,2600),lead:(s,i,v)=>M.sqlead(s,i.t,i.m,i.dur,v,i.prev)},
    drop:(role,pos,w)=>role==="kick"&&pos>=0&&pos%4?mxSS(.6,.9,w):0,   // the song's off-quarter kicks go at the top
    bassPat:()=>"offbeat",
    groove(G){ for(const i of [0,4,8,12]) if(!G.has("K",i)) G.hit("kick",i,.6,(s,t,v)=>D.kick(s,t,v,1));
      for(const i of [2,6,10,14]) G.hit("hat",i,.4,(s,t,v)=>D.hat(s,t,v,true,.2));
      for(const i of [4,12]) if(!G.has("S",i)) G.hit("clap",i,.45,(s,t,v)=>D.clap(s,t,v,.3)); }},
  hiphop:{label:"HIP-HOP",ang:108,inst:{bass:"D.b808"},desc:"Boom bap to trap: 808s, clap and snare, Rhodes, a bell lead, hat rolls, swung",tempo:[[75,100],[130,170]],feel:{swing:.58,push:8,accent:.2},fx:{low:1.5},
    win:{bass:[28,40],chord:[52,64],gchord:[52,64],pad:[52,64],lead:[67,86]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v,.92),snare:(s,i,v)=>{ D.snare(s,i.t,v*.5,.35,s.sTone||1); D.clap(s,i.t,v*.6,.35); },clap:(s,i,v)=>D.clap(s,i.t,v,.35),hat:(s,i,v)=>D.hat(s,i.t,v,i.open,s.hatDec),
      perc:(s,i,v)=>D.rim(s,i.t,v),shaker:(s,i,v)=>D.hat(s,i.t,v*.7,false,s.hatDec),crash:(s,i,v)=>D.crash(s,i.t,v*.4),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>{ const nx=i.pos>=12&&s.mxNx!=null?pitch(s.mxNx,28,40):null; D.b808(s,i.t,i.m,Math.max(.25,i.dur),v,nx!=null&&nx!==i.m?nx:null); },
      chord:(s,i,v)=>M.rhodes(s,i.t,i.notes,i.dur,v),pad:(s,i,v)=>M.warmpad(s,i.t,i.notes,i.dur,v),lead:(s,i,v)=>M.bell(s,i.t,i.m,Math.min(i.dur,.6),v)},
    half:{a:.6,b:.8,bpm:115},
    groove(G){ if(G.bar%2===1&&G.p(14,1)<.5) for(let j=0;j<4;j++) G.hit("hat",14,.4,(s,t,v)=>D.hat(s,t,v,false,s.hatDec),j*G.st/2); }},
  lofi:{label:"LO-FI",ang:144,desc:"Dusty and laid back: a soft kit behind the beat, Rhodes or Wurli, warm bass, vibes, tape wow and vinyl",tempo:[[65,92],[130,180]],feel:{swing:.6,push:12,hum:.25,accent:-.2},fx:{lofi:1},
    win:{bass:[40,52],chord:[52,64],gchord:[52,64],pad:[52,64],lead:[62,82]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v*.8,.9),snare:(s,i,v)=>{ D.snare(s,i.t,v*.6,.3,.85); D.rim(s,i.t,v*.3); },clap:(s,i,v)=>{ D.snare(s,i.t,v*.6,.3,.85); D.rim(s,i.t,v*.3); },hat:(s,i,v)=>D.hat(s,i.t,v*.6,i.open,s.hatDec),
      perc:(s,i,v)=>D.rim(s,i.t,v),shaker:(s,i,v)=>D.shaker(s,i.t,v*.6),crash:(s,i,v)=>D.crash(s,i.t,v*.5),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>FI.synbass(s,i.t,i.m,mxLeg(i.dur,1.5),v,true),chord:(s,i,v)=>((s.kTune||1)>1?M.wurli:M.rhodes)(s,i.t,i.notes,i.dur,v),pad:(s,i,v)=>M.warmpad(s,i.t,i.notes,i.dur,v),
      lead:(s,i,v)=>M.vibes(s,i.t,i.m,i.dur,v)},
    groove(G){ if(G.bar%2===0&&G.fx>.3) mxPriv(()=>D.vinyl(G.s,G.t0,G.bs*2)); }},
  space:{label:"SPACE",ang:180,desc:"Deep space and ambient: cosmic pads, a pulse bass, a theremin lead, laser drums, a phaser, a synced echo and a half-time feel",tempo:null,feel:{swing:.5},fx:{space:1},
    win:{bass:[36,48],chord:[60,72],gchord:[60,72],pad:[60,72],lead:[67,88]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v*.8,.85),snare:(s,i,v)=>PI.zap(s,i.t,v*.5,2600,180),clap:(s,i,v)=>PI.zap(s,i.t,v*.5,3000,240),hat:(s,i,v)=>D.hat(s,i.t,v*.6,i.open,s.hatDec),shaker:null,
      perc:(s,i,v)=>PI.zap(s,i.t,v*.4,1800,300),crash:(s,i,v)=>D.riser(s,i.t,.8),tom:(s,i,v)=>PI.zap(s,i.t,v*.6,900,60),
      bass:(s,i,v)=>PI.pulse(s,i.t,i.m,Math.max(.3,mxLeg(i.dur,1.5)),v),chord:(s,i,v)=>M.pad(s,i.t,i.notes,Math.max(.6,i.dur*1.4),v,3800),pad:(s,i,v)=>M.pad(s,i.t,i.notes,i.dur*1.2,v,3800),
      lead:(s,i,v)=>{ M.whistle(s,i.t,i.m,Math.max(.15,i.dur),v,i.prev); if(i.w>.8) M.bell(s,i.t,i.m+12>100?i.m:i.m+12,i.dur,v*.25); }},
    half:{a:.7,b:1,bpm:0},
    groove(G){ const ch=G.s.mxCh; if(ch&&ch.length) for(let i=0;i<16;i+=2) if(G.p(i,7)<.25) G.hit("hat",i,.18,(s,t,v)=>M.bell(s,t,pitch(ch[Math.floor(G.p(i,8)*ch.length)],84,96),.08,v,G.p(i,9)-.5)); }},
  orchestral:{label:"ORCHESTRAL",ang:216,desc:"The orchestra: strings for the keys and bass, timpani in key, violin or flute for the tune, a concert hall, no drum kit at the top",tempo:[[60,110]],feel:{swing:.5,hum:.15},fx:{hall:1},
    win:{bass:[36,50],chord:[52,64],gchord:[48,60],pad:[52,64],lead:[62,84]},
    roles:{kick:(s,i,v)=>{ if(i.pos<=0) PI.timp(s,i.t,mxRoot(s,38,45),v*.55); else if(i.pos===8) PI.timp(s,i.t,mxRoot(s,38,45),v*.4); else FI.drum(s,i.t,v*.45,50); },snare:(s,i,v)=>{ if(s.mxFill&&i.pos>=8) PI.roll(s,i.t,mxRoot(s,38,45)+7,.18,v*.25); },clap:null,hat:null,shaker:null,perc:null,
      crash:(s,i,v)=>D.crash(s,i.t,v*.3),tom:(s,i,v)=>PI.timp(s,i.t,mxRoot(s,38,45)+7,v*.6),
      bass:(s,i,v)=>FI.strings(s,i.t,[i.m],Math.max(.2,i.dur),v,{att:.06,rel:.3,bright:900,thin:true}),
      chord:(s,i,v)=>FI.strings(s,i.t,i.notes,Math.max(.3,i.dur),v,{att:.12,rel:.5,bright:1800}),gchord:(s,i,v)=>FI.strings(s,i.t,i.notes,Math.max(.25,i.dur),v,{att:.02,rel:.25,bright:1600}),
      pad:(s,i,v)=>FI.strings(s,i.t,i.notes,i.dur,v,{att:.4,rel:.8,bright:1500}),
      lead:(s,i,v)=>(s.mxLead&&s.mxLead.orchestral==="flute"?PI.flute(s,i.t,i.m,Math.max(.12,i.dur),v):FI.fiddle(s,i.t,i.m,i.dur,v,i.prev))},
    leadPick:med=>med>.25?"fiddle":"flute"},
  jazz:{label:"JAZZ",ang:252,inst:{bass:"M.upright"},desc:"Jazz and soul: swing, brushes and ride, upright bass (walking at the top), extended Rhodes chords, a sax",tempo:[[80,180]],feel:{swing:.64,accent:.4,hum:.2,ghosts:.5},fx:{bright:-1},
    win:{bass:[33,47],chord:[50,62],gchord:[50,62],pad:[50,62],lead:[58,80]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v*.55,1.1),snare:(s,i,v)=>D.brush(s,i.t,v*.8),clap:(s,i,v)=>D.rim(s,i.t,v),hat:(s,i,v)=>{ if(i.pos<0||i.pos%4===0) D.ride(s,i.t,v); },
      perc:(s,i,v)=>D.rim(s,i.t,v),shaker:(s,i,v)=>D.brush(s,i.t,v*.4),crash:(s,i,v)=>D.crash(s,i.t,v*.5),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>M.upright(s,i.t,i.m,i.dur,v),
      chord:(s,i,v)=>{ let n=i.notes; if(s.deg&&s.mxD!=null){ const r=n[0], d=s.mxD; n=[r,r+ivl(s,d,2),r+ivl(s,d,6)-12,r+ivl(s,d,8)].map(x=>x<r?x+12:x).sort((a,b)=>a-b); }
        M.rhodes(s,i.t,n,i.dur,v); },
      pad:(s,i,v)=>M.organ(s,i.t,i.notes,i.dur,v*.5,6),lead:(s,i,v)=>M.sax(s,i.t,i.m,i.dur,v,i.prev)},
    bassPat:(s,x)=>x>.7?"walk":null,
    groove(G){ for(const i of [6,14]) G.hit("hat",i,.35,(s,t,v)=>D.ride(s,t,v)); for(const i of [4,12]) G.hit("hat",i,.3,(s,t,v)=>D.hat(s,t,v,false,s.hatDec)); }},
  latin:{label:"LATIN",ang:288,inst:{bass:"M.upright"},desc:"Bossa nova (slower songs) or salsa: clave, congas, cowbell, nylon guitar or a piano montuno, a tumbao bass",tempo:[[110,150],[160,210]],feel:{swing:.5,accent:.2},
    win:{bass:[33,47],chord:[55,66],gchord:[50,62],pad:[55,66],lead:[62,84]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v*.75),snare:(s,i,v)=>mxLat(s)==="bossa"?D.rim(s,i.t,v):D.timbale(s,i.t,v,true),clap:(s,i,v)=>mxLat(s)==="bossa"?D.rim(s,i.t,v):D.timbale(s,i.t,v,false),
      hat:(s,i,v)=>{ if(mxLat(s)==="salsa"&&(i.pos<0||i.pos%4===0)) D.cowbell(s,i.t,81,.08,v*.7); else D.shaker(s,i.t,v); },perc:(s,i,v)=>D.conga(s,i.t,v,i.pos%4===2),shaker:(s,i,v)=>D.shaker(s,i.t,v),
      crash:(s,i,v)=>D.crash(s,i.t,v*.6),tom:(s,i,v)=>D.conga(s,i.t,v,false),
      bass:(s,i,v)=>M.upright(s,i.t,i.m,i.dur,v),chord:(s,i,v)=>mxLat(s)==="bossa"?M.nylon(s,i.t,i.notes,i.dur,v):M.piano(s,i.t,i.notes,i.dur,v*.8),
      pad:(s,i,v)=>FI.strings(s,i.t,i.notes,i.dur,v,{att:.3,rel:.6,bright:1400}),lead:(s,i,v)=>mxLat(s)==="bossa"?PI.flute(s,i.t,i.m,Math.max(.12,i.dur),v):M.brass(s,i.t,[i.m],i.dur,v)},
    bassPat:s=>mxLat(s)==="bossa"?"bossa":"tumbao",
    groove(G){ for(const i of G.bar%2===0?[0,6,12]:[4,8]) G.hit("perc",i,.55,(s,t,v)=>D.clave(s,t,v));
      if(mxLat(G.s)==="salsa") for(const i of [4,12,14]) G.hit("perc",i,i===4?.4:.55,(s,t,v)=>D.conga(s,t,v,i===4)); }},
  country:{label:"COUNTRY",ang:324,desc:"Modern country radio: a big kit with shakers, acoustic strum over palm-muted electric, root-fifth bass, Telecaster twang, pedal steel",tempo:[[85,125]],feel:{swing:.52},fx:{slap:1,bright:1},
    win:{bass:[33,45],chord:[52,63],gchord:[52,63],pad:[62,76],lead:[60,79]},
    roles:{kick:(s,i,v)=>D.kick(s,i.t,v*.95),snare:(s,i,v)=>{ D.snare(s,i.t,v*.75,.3,s.sTone||1); D.snap(s,i.t,v*.4); },clap:(s,i,v)=>D.clap(s,i.t,v*.8,.25),hat:(s,i,v)=>D.hat(s,i.t,v,i.open,s.hatDec),
      shaker:(s,i,v)=>D.shaker(s,i.t,v),perc:(s,i,v)=>D.snap(s,i.t,v*.8),crash:(s,i,v)=>D.crash(s,i.t,v*.8),tom:(s,i,v)=>D.tom(s,i.t,v),
      bass:(s,i,v)=>M.bass(s,i.t,i.m,mxLeg(i.dur,1.6),v),
      chord:(s,i,v)=>{ FI.strum(s,i.t,i.notes,v,.012); M.guitar(s,i.t,pitch(i.notes[0],40,52),Math.min(.22,i.dur),v*.55,true);
        if(i.w>.6&&i.bar%2===0&&s.mxBj!==i.bar){ s.mxBj=i.bar; FI.banjo(s,i.t,i.notes,v*.6); } },
      gchord:(s,i,v)=>{ FI.strum(s,i.t,i.notes,v,.012); M.guitar(s,i.t,pitch(i.notes[0],40,52),Math.min(.22,i.dur),v*.55,true); },
      pad:(s,i,v)=>{ const n=i.notes[i.notes.length-1]; if(mxChg(s,"steel",i)){ M.whistle(s,i.t,n,i.dur,v*.5,s.mxStl!=null?s.mxStl:n-2); s.mxStl=n; } },
      lead:(s,i,v)=>FI.tele(s,i.t,i.m,Math.max(.12,i.dur),v)},
    bassPat:()=>"rootfifth",
    groove(G){ for(let i=0;i<16;i+=2) G.hit("shaker",i,i%4?.35:.55,(s,t,v)=>D.shaker(s,t,v)); }},
};
const MX_ORDER=Object.keys(MXD);
const MIX_KEYS=MX_ORDER.map(k=>[k,MXD[k].label,MXD[k].desc,MXD[k].ang]);
const MX_LANES=[["drums","DRUMS","The kit and its pattern"],["keys","KEYS","Chords and pads"],["bass","BASS","The bass (swaps at 50%)"],["lead","LEAD","The tune (swaps at 70%)"],
  ["groove","GROOVE","Feel (swing, push, accent) and the style's extra hits"],["tempo","TEMPO","The tempo pull (above 50%, only if the song is outside the style's range)"],["fx","FX","The style's sound (hall, echo, lo-fi, brightness)"]];
// the stages as amounts (from..to: where each goes in; a swap has from = to), and the pad's rings (ring: the amount, ringLabel)
const MX_STAGES=[{id:"feel",label:"FEEL",from:.05,to:.5,ring:.15,ringLabel:"FEEL"},{id:"drums",label:"DRUMS",from:.15,to:.45,ring:.45,ringLabel:"DRUMS"},{id:"groove",label:"GROOVE",from:.25,to:.6},{id:"keys",label:"KEYS",from:.3,to:.9},
  {id:"bass",label:"BASS",from:.5,to:.5,ring:.7,ringLabel:"BAND"},{id:"lead",label:"LEAD",from:.7,to:.7},{id:"tempo",label:"TEMPO",from:.5,to:1},{id:"fx",label:"FX",from:0,to:1},{id:"full",label:"FULL",from:1,to:1,ring:1,ringLabel:"FULL"}];
const MX_LEGACY={classical:"orchestral",galactic:"space"};
const MX_ST_TRIM={hearye:.58,ptlk:.8};   // HEARYE's and PTLK's own instruments run softer than MDFM's
/* MX_TRIM: each direction's parts at the loudness of the part they replace (K-weighted RMS, from _mxCal: a reference
   pattern through the station's usual instrument against the direction's; trim = 10^(-delta/20)). 1 = not measured. */
const MX_TRIM={rock:{clap:0.34,shaker:2.47,crash:0.97,chord:0.25,pad:0.25,lead:0.58,bass:0.97},pop:{snare:1.59,clap:1.24,perc:1.15,gchord:4,pad:0.58,lead:1.23,bass:4.35},dance:{snare:3.99,clap:1.18,hat:1.23,perc:1.13,shaker:2.88,chord:5.46,gchord:4,pad:0.76,lead:0.51,bass:1.1},hiphop:{snare:1.84,shaker:2.46,crash:2.32,chord:0.9,gchord:3.63,pad:0.58,lead:1.33,bass:0.73},lofi:{kick:1.22,snare:1.62,clap:0.47,hat:1.61,shaker:1.62,crash:1.9,chord:0.9,gchord:3.63,pad:0.58,bass:3.84},space:{kick:1.21,snare:4,clap:2.64,hat:1.61,perc:1.75,tom:4,crash:0.83,chord:0.8,gchord:3.87,pad:0.66,lead:0.68,bass:9.9},orchestral:{kick:2,tom:1.63,crash:3.04,chord:2.62,gchord:4,pad:2.17,lead:0.77,bass:7.95},jazz:{kick:1.77,snare:3.0,clap:2.09,hat:0.28,shaker:0.27,crash:1.88,chord:0.9,gchord:3.63,pad:1.14,lead:0.91,bass:0.73},latin:{kick:1.31,snare:4,clap:2.29,hat:0.56,perc:0.33,tom:3.0,crash:1.6,chord:2.44,gchord:4,pad:2.13,lead:0.69,bass:0.62},country:{kick:1.05,snare:1.29,clap:1.28,perc:1.36,crash:1.24,chord:1.17,gchord:3.93,pad:1.74,lead:2.34,bass:1.09}};   // _mxCal (30 Hz high-pass, peaks capped at +3 dB; clamped: drums .25-4, guitar chords 4, the downbeat timpani 2); the basses then
   // corrected in the mix (pass 3: four songs, the bass lane alone at 100%, an additive fit per direction and per original instrument)
const MIXES={}, LANES={}, MXON={}, MXP={};   // per station: the sliders, the lanes, whether any is up, and the plan
const mixZero=()=>Object.fromEntries(MX_ORDER.map(k=>[k,0]));
const mixOf=id=>MIXES[id]||(MIXES[id]=mixZero());
const lanesOf=id=>LANES[id]||(LANES[id]=Object.fromEntries(MX_LANES.map(([k])=>[k,1])));
const mxFn=(dir,role)=>{ const R0=MXD[dir].roles; return role==="gchord"&&R0.gchord===undefined?R0.chord:R0[role]; };
const mxTrim=(id,dir,role)=>((MX_TRIM[dir]&&MX_TRIM[dir][role])||1)*(MX_ST_TRIM[id]||1);
// old saved values: classical -> orchestral, galactic -> space, chaos -> GLITCH (an effect now)
function mxMigrate(v){ const o={}; let glitch=null; if(!v||typeof v!=="object") return {w:o,glitch};
  const src=v.w&&typeof v.w==="object"?v.w:v;
  for(const k in src){ const x=+src[k]; if(!Number.isFinite(x)) continue; if(k==="chaos"){ glitch=Math.max(0,Math.min(1,x)); continue; } const n=MX_LEGACY[k]||k; if(MXD[n]) o[n]=Math.max(0,Math.min(1,(o[n]||0)+x)); }
  return {w:o,glitch,lanes:v.lanes&&typeof v.lanes==="object"?v.lanes:null}; }
// the plan: worked out once per change (not per note)
function mxPlan(id){ const m=mixOf(id), L=lanesOf(id), sum=MX_ORDER.reduce((a,k)=>a+m[k],0), sc=sum>1?1/sum:1, w={};
  for(const k of MX_ORDER) w[k]=m[k]*sc;
  const top=MX_ORDER.filter(k=>w[k]>.001).sort((a,b)=>w[b]-w[a]); if(!top.length) return null;
  const roles={};
  for(const role of MX_ROLES){ const dir=top.find(k=>mxFn(k,role)!==undefined); if(!dir) continue; const x=w[dir], f=mxFn(dir,role), st=MX_STAGE_OF(role), tr=mxTrim(id,dir,role);
    if(st==="drums"){ if(f===null){ roles[role]={dir,x,og:1-mxSS(.7,1,x)*L.drums,sg:0}; } else { const xd=mxSS(.15,.45,x)*L.drums; roles[role]={dir,x,og:Math.pow(1-xd,.7),sg:Math.pow(xd,.7)*tr}; } }   // drums: between linear (correlated) and equal power, a kick and its stand-in being only partly alike
    else if(st==="keys"){ if(f===null){ roles[role]={dir,x,og:1-mxSS(.7,1,x)*L.keys,sg:0}; } else { const xi=mxSS(.3,.6,x)*L.keys, xo=mxSS(.6,.9,x)*L.keys; let og=Math.cos(xo*Math.PI/2), sg=Math.sin(xi*Math.PI/2); const pw=Math.sqrt(og*og+sg*sg); if(pw>1){ og/=pw; sg/=pw; } roles[role]={dir,x,og,sg:sg*tr}; } }   // laid under, then swapped; never louder in sum (equal power)
    else roles[role]={dir,x:x*L[st],sw:true,tr,og:1,sg:0}; }
  const feel={swing:[],push:0,accent:0,hum:0,ghosts:0}; let fw=0;
  for(const k of top){ const f=mxSS(.05,.5,w[k])*L.groove, F=MXD[k].feel||{}; if(f<=0) continue; fw+=f; feel.swing.push([F.swing??.5,f]); feel.push+=f*(F.push||0); feel.accent+=f*(F.accent||0); feel.hum+=f*(F.hum||0); feel.ghosts+=f*(F.ghosts||0); }
  if(fw>1){ for(const k of ["push","accent","hum","ghosts"]) feel[k]/=fw; }
  const fx={}; for(const k of top){ const a=mxSS(0,.6,w[k])*w[k]*L.fx; for(const [n,v] of Object.entries(MXD[k].fx||{})) fx[n]=(fx[n]||0)+a*v; fx["_"+k]=a; }
  let half=0, halfDir=null; for(const k of top){ const H=MXD[k].half; if(!H) continue; const h=mxSS(H.a,H.b,w[k])*L.drums; if(h>half){ half=h; halfDir=k; } }
  const groove=top.map(k=>[k,mxSS(.25,.6,w[k])*L.groove,w[k]]).filter(x=>x[1]>0);
  const tempo=top.map(k=>[k,mxSS(.5,1,w[k])*L.tempo]).filter(x=>x[1]>0&&MXD[x[0]].tempo);
  return {w,top,sum,scaled:sum>1,roles,feel,fx,half,halfDir,groove,tempo,lanes:{...L}}; }
let mixOut=null, mxIn=null, mxDst=null;   // the station mix: mixOut after the compressor; mxIn -> mxDst (the compressor) is where the style sound goes
const MXF=new WeakMap();
let mxNm="";   // the instrument being morphed (for MX_OLV)
// 1.25 (E3): from _mxCal {orig}, clamped to +-6 dB; the 808 (+0.9 dB) and the upright (+5.1 dB: a walking upright carries a jazz mix more than its dry level says) corrected in the mix (see MX_TRIM)
const MX_OLV={"D.snap":0.5,"D.conga":2.0,"D.cowbell":1.27,"D.logdrum":0.5,"D.ride":2.0,"D.brush":0.5,"D.clave":1.95,"D.timbale":2.0,"D.chipk":0.5,"D.chipn":2.0,"M.piano":1.48,"M.rhodes":1.11,"M.organ":1.35,"M.pad":1.25,"M.choir":1.25,"M.saw":0.5,"M.accordion":1.27,"M.brass":2.0,"M.bell":0.75,"M.pluck":0.81,"M.whistle":1.45,"M.vox":1.2,"M.chop":2.0,"M.sax":1.1,"M.clav":0.5,"M.nylon":0.5,"M.wurli":1.38,"M.warmpad":1.72,"M.fmlead":2.0,"M.sqlead":1.95,"M.reese":1.44,"M.slap":0.59,"M.upright":2.0,"D.b808":1.10,"M.harm":1.35,"M.gtrlead":1.72,"FI.harp":1.1,"FI.strings":0.5,"FI.fiddle":1.3,"FI.chant":1.43,"FI.horn":1.82,"FI.shawm":1.07,"FI.drone":0.6,"FI.drum":1.49,"FI.frame":2.0,"FI.tamb":2.0,"FI.hat":2.0,"FI.synbass":0.5,"FI.strum":0.5,"FI.organ":1.06,"FI.pipe":1.58,"FI.lute":1.2,"FI.flute":1.44,"PI.lute":1.2,"PI.flute":1.44,"PI.pulse":0.5,"PI.chip":1.49};   // each instrument's level against its part's reference (_mxCal with {orig}), so a direction matches what it replaces
let inMorph=false, mxBarT0=0, mxBarSt=0, mxBarSteps=16;   // where the bar being scheduled starts, for groove moves
// where a note lands in its bar (16ths), -1 if not known
const mxPos=(s,t)=>{ const g=s&&s.mxG, t0=g?g.t0:mxBarT0, st=g?g.st:mxBarSt, n=g?g.n:mxBarSteps; if(!(st>0)) return -1; const p=Math.round((t-t0)/st*16/n); return p>=0&&p<16?p:-1; };
// the station sound stage: lo-fi (series low-pass and tape wow), brightness, low end, a phaser and a synced echo (space),
// a concert hall (high-passed, with pre-delay), slapback (country) and a little glue (rock). Built the first time it's needed.
// 1.26 (mobile mix): the matrix hall's impulse response is made once per audio context and reused by later stages. On a
// live context MIX's opening builds it in small slices when the page is idle (prewarmMix), so raising SPACE or HALL
// doesn't stall the page (a 3 s stereo buffer filled in one go was a 30-120 ms task on a phone). Offline renders build
// it in place, as before, so a seeded render is unchanged.
const HALL_IR=new WeakMap(); let hallWarm=null;
function mxHallIR(){ let b=HALL_IR.get(ctx); if(!b){ b=preIR(makeIR(ctx,3.2,1.7),.025); HALL_IR.set(ctx,b); } return b; }
function prewarmMix(){ const c=ctx; if(!c||HALL_IR.has(c)||hallWarm===c||isOff(c)) return; hallWarm=c;
  const sr=c.sampleRate, len=Math.floor(sr*3.2), pd=Math.floor(sr*.025), b=c.createBuffer(2,len+pd,sr), D=[b.getChannelData(0),b.getChannelData(1)]; let i=0;
  const idle=typeof requestIdleCallback==="function"?f=>requestIdleCallback(f,{timeout:400}):f=>setTimeout(()=>f({timeRemaining:()=>8}),30);
  const slice=dl=>{ if(ctx!==c||HALL_IR.has(c)){ if(hallWarm===c) hallWarm=null; return; } const t0=performance.now();
    while(i<len&&performance.now()-t0<Math.min(8,Math.max(2,dl.timeRemaining()))){ const e=Math.min(len,i+4096); for(;i<e;i++){ const tt=i/sr, k=Math.exp(-tt*1.7)*(tt<.01?tt/.01:1)*(1-i/len); D[0][pd+i]=(Math.random()*2-1)*k; D[1][pd+i]=(Math.random()*2-1)*k; } }
    if(i<len) idle(slice); else { HALL_IR.set(c,b); hallWarm=null; } };
  idle(slice); }
// 1.26 (mobile mix): LITE is set by MIX while it's open on a phone or tablet. It schedules notes further ahead (.5 s, so a
// busy page doesn't make the music skip), runs every saturator without oversampling (osv) and leaves out the near-silent
// copy at the edges of a style blend (mxCull). Off, nothing changes.
// 1.27: the performance readout's numbers. Every live step the schedulers write counts: "late" ones were already more than
// .3 s in the past (skipped: the page stalled that long) and "tight" ones had under 30 ms to spare (a near miss).
const PERF={steps:0,late:0,tight:0,minLead:9};
function pStep(t,late){ if(t<=late){ PERF.late++; return false; } const lead=t-ctx.currentTime; PERF.steps++; if(lead<.03) PERF.tight++; if(lead<PERF.minLead) PERF.minLead=lead; return true; }
const MX_CULL=.1; let CULL_TEST=false;
const mxCull=()=>LITE&&(!isOff(ctx)||CULL_TEST);   // live only (a Save keeps both copies); CULL_TEST lets the bench measure it offline
const AHEAD=()=>(typeof document!=="undefined"&&document.hidden)?1.6:(LITE?.5:.25);
function setLite(v){ LITE=!!v; for(const r of SH_LIVE){ const sh=r.deref(), c=sh&&sh.context; if(!c||c.state==="closed"){ SH_LIVE.delete(r); continue; } try{ sh.oversample=LITE?"none":sh._os; }catch(e){} } }
function mxStage(){ return mxPriv(()=>{ const S={in:G(1),out:G(1),wow:ctx.createDelay(.05),lp:filt("lowpass",20000,.7),bright:filt("highshelf",6000),low:filt("lowshelf",80),pre:G(1),ph:G(0),echo:G(0),hall:G(0),slap:G(0),glue:G(0),lfoG:[]};
  S.bright.gain.value=0; S.low.gain.value=0; S.wow.delayTime.value=0;
  S.in.connect(S.wow); S.wow.connect(S.lp); S.lp.connect(S.bright); S.bright.connect(S.low); S.low.connect(S.pre); S.pre.connect(S.out);
  S.wl=[osc("sine",.55),osc("sine",5.7)]; S.wg=[G(0),G(0)]; S.wl.forEach((o,k)=>{ o.connect(S.wg[k]); S.wg[k].connect(S.wow.delayTime); o.start(); });
  let n=S.pre; S.lfo=osc("sine",.07); for(const f of [350,800,1600,3100]){ const a=filt("allpass",f,.8), d=G(0); n.connect(a); n=a; S.lfo.connect(d); d.connect(a.frequency); S.lfoG.push([d,f]); }
  n.connect(S.ph); S.ph.connect(S.out); S.lfo.start();
  S.dl=ctx.createDelay(1.5); const fb=G(.4), lp=filt("lowpass",3800), hp=filt("highpass",300); S.dl.delayTime.value=.42; S.pre.connect(S.echo); S.echo.connect(hp); hp.connect(S.dl); S.dl.connect(lp); lp.connect(fb); fb.connect(S.dl); lp.connect(S.out); S.fb=fb;
  S.mkHall=()=>{ if(S.hasHall) return; S.hasHall=1; mxPriv(()=>{ const cv=ctx.createConvolver(); cv.buffer=mxHallIR(); const hh=filt("highpass",250), cl=filt("lowpass",5000); S.hallHp=hh; S.hallCv=cv; S.pre.connect(hh); hh.connect(cv); cv.connect(cl); cl.connect(S.hall); S.hall.connect(S.out); }); };
  S.mkGlue=()=>{ if(S.hasGlue) return; S.hasGlue=1; const sh=ctx.createWaveShaper(); sh.curve=shaper(1.5); osv(sh,"2x"); const gh=filt("highpass",150); S.pre.connect(gh); gh.connect(sh); sh.connect(S.glue); S.glue.connect(S.out); };
  const sd=ctx.createDelay(.5); sd.delayTime.value=.11; const sl=filt("lowpass",3000); S.pre.connect(sd); sd.connect(sl); sl.connect(S.slap); S.slap.connect(S.out);
  return S; }); }
function mxFx(){ if(!ctx||!ST) return []; let F=MXF.get(ctx); if(!F){ F=[]; MXF.set(ctx,F); }
  if(mxIn&&mxDst&&!F.some(s=>s.src===mxIn)){ const s=mxStage(); s.src=mxIn; s.dst=mxDst; try{ mxIn.disconnect(); }catch(e){} mxIn.connect(s.in); s.out.connect(mxDst); F.push(s); }
  if(ambIn&&ambIn.context===ctx&&!F.some(s=>s.src===ambIn)){ const s=mxStage(); s.src=ambIn; s.dst=ST.in; try{ ambIn.disconnect(ST.in); }catch(e){} try{ ambIn.disconnect(master); }catch(e){} ambIn.connect(s.in); s.out.connect(ST.in); F.push(s); }   // WYBC: after the chain (the piano has no compressor before it)
  return F; }
// the stage is in the path only while the station on air has its matrix up: at zero it fades out and is taken out of the
// path again, so the music is exactly as it was before (bit for bit), not just close to it
let mxOffT=0;
function mxFxSync(id,now){ clearTimeout(mxOffT); mxOffT=0;
  if(MXON[id]){ mxFx(); mxFxLevels(id,now); return; }
  mxFxLevels(id,now); const c=ctx; mxOffT=setTimeout(()=>{ mxOffT=0; if(ctx===c&&!MXON[station]) mxFxOff(); },2500); }
function mxFxOff(){ const F=ctx&&MXF.get(ctx); if(!F||!F.length) return;
  for(const S of F){ try{ S.src.disconnect(S.in); }catch(e){} try{ S.src.connect(S.dst||(ST?ST.in:master)); }catch(e){} try{ S.out.disconnect(); }catch(e){} try{ S.lfo.stop(); for(const o of S.wl) o.stop(); }catch(e){} try{ S.fb.disconnect(); }catch(e){} }
  F.length=0; }
function mxFxLevels(id,now,inst){ const F=MXF.get(ctx); if(!F) return; const P=MXP[id], f=k=>(P&&P.fx[k])||0;
  const br=Math.max(-2,Math.min(2.5,f("bright"))), lo=Math.min(1,f("lofi")), sp=Math.min(1,f("space")), ha=Math.min(1,f("hall")), sl=Math.min(1,f("slap")), lw=f("low"), gl=f("glue")||(f("_rock")*.06);
  for(const S of F){ const T=(p,v)=>inst?p.setValueAtTime(v,now):p.setTargetAtTime(v,now,.4); if(ha>0||sp>0) S.mkHall(); if(gl>0) S.mkGlue();
    T(S.bright.gain,br); T(S.low.gain,Math.min(2,lw*1.5)); T(S.lp.frequency,20000*Math.pow(6500/20000,lo)); T(S.wow.delayTime,.004*lo); T(S.wg[0].gain,.0025*lo); T(S.wg[1].gain,.0003*lo);
    T(S.ph.gain,.5*sp); for(const [d,fq] of S.lfoG) T(d.gain,fq*.65*sp); T(S.echo.gain,.3*sp); T(S.hall.gain,.35*ha+.2*sp); if(S.hasHall) gate(S.hallHp,S.hallCv,ha>0||sp>0,4.5); T(S.slap.gain,.12*sl); T(S.glue.gain,gl); T(S.pre.gain,1); } }
// what each instrument is, and where its loudness is: [role, index of velocity in the arguments after the bus]
const MX_ROLE={D:{kick:["kick",1],snare:["snare",1],clap:["clap",1],snap:["snare",1],rim:["perc",1],hat:["hat",1],conga:["perc",1],tom:["tom",1],crash:["crash",1],shaker:["shaker",1],cowbell:["perc",3],b808:["bass",3],logdrum:["bass",2],ride:["hat",1],brush:["snare",1],clave:["perc",1],timbale:["perc",1],chipk:["kick",1],chipn:["hat",1]},
  M:{piano:["chord",3],rhodes:["chord",3],organ:["chord",3],pad:["pad",3],choir:["pad",3],saw:["chord",3],accordion:["chord",3],brass:["chord",3],guitar:["gchord",3],bell:["lead",3],pluck:["lead",3],whistle:["lead",3],bass:["bass",3],vox:["lead",3],chop:["lead",3],sax:["lead",3],clav:["chord",3],nylon:["chord",3],wurli:["chord",3],warmpad:["pad",3],fmlead:["lead",3],sqlead:["lead",3],vibes:["lead",3],reese:["bass",3],wobble:["bass",3],slap:["bass",3],upright:["bass",3],harm:["lead",3],gtrlead:["lead",3]},
  FI:{harp:["lead",2],strings:["pad",3],fiddle:["lead",3],chant:["lead",3],horn:["chord",3],shawm:["lead",3],drone:["pad",3],drum:["kick",1],frame:["perc",1],tamb:["shaker",1],hat:["hat",1],synbass:["bass",3],strum:["chord",2],organ:["chord",3],pipe:["lead",3],lute:["lead",2],flute:["lead",3]},
  PI:{lute:["lead",2],flute:["lead",3],timp:["tom",2],pulse:["bass",3],chip:["lead",3]}};
function noteInfo(role,a){ const t=a[0]; if(role==="chord"||role==="pad"){ const notes=Array.isArray(a[1])?a[1]:[a[1]]; return {t,notes,m:notes[0],dur:role==="chord"&&typeof a[2]!=="number"?.6:+a[2]||.5}; }
  if(role==="gchord") return {t,notes:[a[1],a[1]+7,a[1]+12],m:a[1],dur:+a[2]||.3};
  if(role==="bass"||role==="lead") return {t,m:a[1],notes:[a[1]],dur:typeof a[2]==="number"?a[2]:.5};
  return {t,open:role==="hat"?!!a[2]:false}; }
// one octave offset per (song, direction, part), kept while the part stays near its window: melodies don't jump an
// octave mid-phrase, and chords move as one block (their voicing stays)
function mxFold(s,dir,role,m){ const W=MXD[dir].win[role]||MXD[dir].win.chord, k=dir+role, O=s.mxO||(s.mxO={}); let o=O[k];
  if(o==null||m+o<W[0]-5||m+o>W[1]+5){ o=0; while(m+o<W[0]) o+=12; while(m+o>W[1]) o-=12; O[k]=o; } return m+o; }
const mxFoldCh=(s,dir,role,ns)=>{ const lo=Math.min(...ns), o=mxFold(s,dir,role,lo)-lo; return ns.map(n=>n+o); };
// modern country: a twangy Telecaster lead (bends up into longer notes) and a picked banjo roll
FI.tele=(b,t,m,dur,v=1)=>{ const f=mtof(m), o=osc("sawtooth",f), o2=osc("square",f*2), g2=G(.25), bp=filt("bandpass",1900,1.1), pk=filt("peaking",2500,1.4), g=ctx.createGain(); pk.gain.value=3.5;   // 1.25 (E2): the twang at 2.5 kHz, half the boost
  if(dur>.3){ o.frequency.setValueAtTime(f*.89,t); o.frequency.exponentialRampToValueAtTime(f,t+.12); }
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+.004); g.gain.exponentialRampToValueAtTime(.022*v,t+Math.min(.25,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
  o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(pk); pk.connect(g); g.connect(b.mu); to(g,b,.25); o.start(t); o2.start(t); o.stop(t+dur+.1); o2.stop(t+dur+.1); };
FI.banjo=(b,t,notes,v=1)=>{ const ns=[notes[0]+12,notes[1]+12,notes[2]+12,notes[0]+24], st=.085; for(let k=0;k<6;k++){ const tt=t+k*st, f=mtof(ns[[0,1,3,2,1,3][k]]), o=osc("square",f), hp=filt("highpass",900), g=ctx.createGain();
    env(g,tt,.001,.035*v,.16); o.connect(hp); hp.connect(g); g.connect(b.mu); o.start(tt); o.stop(tt+.2); } };
// the user's own groove control wins over the matrix's feel
const gUser=(id,k,def)=>{ const g=GON[id]&&GRV[id]; return !!g&&Math.abs(g[k]-def)>.005; };
/* One instrument call on a station whose matrix is up: the song's part and/or the owning direction's, by stage. */
function morphCall(id,role,vi,f,self,s,a){
  const P=MXP[id], R0=P&&P.roles[role]; if(!R0){ const was=inMorph; inMorph=true; try{ return f.call(self,s,...a); } finally{ inMorph=was; } }
  inMorph=true;
  try{
    let vel=typeof a[vi]==="number"?a[vi]:1; const info=noteInfo(role,a), dir=R0.dir, D0=MXD[dir], drum=MX_DRUM.includes(role), pos=mxPos(s,info.t);
    if(role==="lead"){ const L=s.mxLd||(s.mxLd=[]); if(L.length<64) L.push(info.dur); }
    if(role==="bass"){ s.mxBL=s.mxG?s.mxG.bar:0; s.mxBN=mxNm; } else if(drum) s.mxDL=s.mxG?s.mxG.bar:0;
    let og=R0.og, sg=R0.sg, t=info.t;
    if(R0.sw){ const on=s.mxSw&&s.mxSw[role]===dir; og=on?0:1; sg=on&&!(role==="bass"&&s.mxPat)?R0.tr:0; }
    let dr=0; for(const k of P.top){ const d=MXD[k].drop; if(d) dr=Math.max(dr,d(role,pos,P.w[k])*P.lanes.drums); }
    if(P.half&&(role==="snare"||role==="clap")&&(pos===4||pos===12)&&(mxBpm(s)>=MXD[P.halfDir].half.bpm)) dr=Math.max(dr,P.half);
    if(dr>0){ og*=1-dr; sg*=1-dr; }
    if(drum){ const F=P.feel;   // the style's feel, unless the user has set that control
      if(F.push&&!gUser(id,"push",.5)) t+=F.push*(MX_PUSHK[role]??.6)/1000;
      if(F.hum&&!gUser(id,"humanize",0)){ const k=MX_PUSHK[role]??.6, b=s.mxG?s.mxG.bar:0; t+=(mxHash(b,pos,role.length*31+7)-.5)*2*F.hum*.02*k; vel*=1+(mxHash(b,pos,role.length*17+3)-.5)*F.hum*.6*k; }
      if(F.accent&&pos>=0&&!gUser(id,"accent",.5)){ const e=Math.pow(2,F.accent*1.3), vn=Math.min(1,vel); vel*=(vn>0?Math.pow(vn,e)/vn:1)*(pos%4===0?1+.15*Math.max(0,F.accent):1); }
      if(t!==info.t) t=Math.max(ctx.currentTime,t); }
    const sm=D0.inst&&D0.inst[role]===mxNm?1/((MX_TRIM[dir]&&MX_TRIM[dir][role])||1):MX_OLV[mxNm]||1;   // level-matched to the instrument it stands in for (an 808 is louder than a picked bass); the same instrument stays as loud
    if(mxCull()&&og>.001&&sg>.001){ const es=sg*sm, r=es/og, p=Math.sqrt(og*og+es*es);   // 1.27 LITE: at the edges of a blend, the copy 20 dB or more under the other is left out (the other takes its power)
      if(r<MX_CULL){ og=p; sg=0; } else if(r>1/MX_CULL){ sg=p/sm; og=0; } }
    if(og>.001){ const b=[...a]; b[vi]=vel*og; b[0]=t; f.call(self,s,...b); }
    sg*=sm;
    if(sg>.001){ const fn=mxFn(dir,role); if(fn){ const I={...info,t,pos,w:R0.x,bar:s.mxG?s.mxG.bar:0};
        if(I.notes&&role!=="lead"&&role!=="bass") I.notes=mxFoldCh(s,dir,role,I.notes);
        if(I.m!=null&&(role==="lead"||role==="bass")){ I.m=mxFold(s,dir,role,I.m); I.notes=[I.m]; const pv=s.mxPv||(s.mxPv={}); I.prev=pv[dir]; pv[dir]=I.m; }
        mxPriv(()=>fn(role==="bass"?mxBB(s):s,I,vel*sg)); } }
  }catch(e){} finally{ inMorph=false; }
}
const mxBpm=s=>s.mxBpm||s.bpm||(s.sp?15/s.sp:120);
// GLITCH (an effect): a one-bar octave jump moves the pitched parts up an octave (set by glitchBar, per context)
const GL_OCT=new Set(["chord","gchord","pad","lead"]);
function glOct(role,a){ const F=FXW.get(ctx), J=F&&F.glo; if(!J||!(a[0]>=J.from&&a[0]<J.until)) return a; const b=[...a];
  if(Array.isArray(b[1])) b[1]=b[1].map(n=>n+12); else if(typeof b[1]==="number") b[1]+=12; return b; }
// wrap every instrument once: unchanged unless its bus belongs to a station with its matrix or groove up (or a glitch is due)
for(const [objName,map] of Object.entries(MX_ROLE)){ const obj={D,M,FI,PI}[objName];
  for(const [name,[role,vi]] of Object.entries(map)){ const f0=obj[name]; if(typeof f0!=="function") continue;
    const f=function(s,...a){ if(!MIDICAP) return f0.call(this,s,...a); if(!midiDepth) midiRec(objName,name,role,vi,a); midiDepth++; try{ return f0.call(this,s,...a); }finally{ midiDepth--; } };   // Save: every note that sounds goes into the MIDI file too
    const nm=objName+"."+name;
    obj[name]=function(s,...a){ const id=s&&s.mxId; if(inMorph||!id) return f.call(this,s,...a); mxNm=nm;
      if(glOn&&GL_OCT.has(role)) a=glOct(role,a);   // 1.25 (E3): GLITCH's octave jump
      if(!(MXON[id]||GON[id])) return f.call(this,s,...a);
      if(GON[id]){ let out; try{ out=grooveArgs(id,role,vi,s,a,objName); }catch(e){ out=[a]; } let r;   // the groove and key (TUNE) first, then the style matrix
        for(const b of out){ if(MXON[id]) r=morphCall(id,role,vi,f,this,s,b); else { const was=inMorph; inMorph=true; try{ r=f.call(this,s,...b); } finally{ inMorph=was; } } }   // 1.25: inner calls (chop->vox, lute, flute, timp->tom) play plain, not mapped twice
        return r; }
      return morphCall(id,role,vi,f,this,s,a); }; } }
/* Once a bar (at its start): latch the bass and lead swaps, then the style's extras: its pattern hits (through the groove,
   on the song's swung grid, at a fixed per-slot probability), the half-time snare, ghost notes, and a pattern bass. */
function mxGroove(id,s,t0,bs,bar){ const P=MXP[id]; if(!P) return; const st=bs/16;
  s.mxG={t0,st,n:16,bar};
  const sw=s.mxSw||(s.mxSw={});
  for(const role of ["bass","lead"]){ const R0=P.roles[role]; if(!R0||!R0.sw){ sw[role]=null; continue; }
    if(role==="lead"&&sw.leadT&&bar%4!==0) continue; sw.leadT=1;
    const on=sw[role]===R0.dir, x=R0.x, thr=role==="bass"?(on?.45:.55):(on?.65:.75); sw[role]=x>=thr?R0.dir:null;
    if(role==="lead"&&sw.lead){ const D0=MXD[sw.lead]; if(D0.leadPick){ const ml=s.mxLead||(s.mxLead={}); if(!ml[sw.lead]){ const L=[...(s.mxLd||[.3])].sort((a,b)=>a-b); ml[sw.lead]=D0.leadPick(L[L.length>>1]); } } } }
  const bp=sw.bass&&MXD[sw.bass].bassPat&&s.deg&&s.mxD!=null?MXD[sw.bass].bassPat(s,P.roles.bass.x):null; s.mxPat=bp;
  for(const S of MXF.get(ctx)||[]) if(S.dl&&P.fx.space) S.dl.delayTime.setTargetAtTime(Math.min(1.4,3*st),t0,.05);   // the space echo: a dotted eighth at this tempo
  const nat=!!s.gNative, sw8=nat&&s.st&&s.st.sw8, so=i=>nat?(sw8?(i%4===2?(s.swing-.5)*4*st:0):i%2?(s.swing-.5)*2*st:0):0;
  const has=(k,i)=>{ if(!nat) return false; const p=k==="K"?s.K:k==="S"?s.S&&s.S[bar%s.S.length]:s.H; return !!p&&p[i]==="x"; };
  const hatsN=nat&&s.H?[...s.H].filter(c=>c!=="."&&c!=="-").length:0, drumsOn=s.mxDL!=null&&s.mxDL>=bar-1;   // extra hits only while the song's own drums play (no beat in a drumless intro)
  const r0=R; R=mxRand;
  try{
    for(const [k,xg,wk] of P.groove){ const D0=MXD[k]; if(!D0.groove) continue;
      const G={s,id,t0,bs,st,bar,w:wk,fx:P.fx["_"+k]||0,hatsSparse:nat?hatsN<=4:true,has,p:(i,salt)=>mxHash(bar,i,salt*97+k.length),
        hit:(role,i,v,fn,dt=0)=>{ if(drumsOn===false&&MX_DRUM.includes(role)) return; if(mxHash(bar,i,k.length*13+role.length)>=xg) return; mxHit(id,s,role,fn,t0+i*st+so(i)+dt,v*mxTrim(id,k,role),i,so(i)); }};
      D0.groove(G); }
    if(P.half>0&&P.halfDir&&mxBpm(s)>=MXD[P.halfDir].half.bpm){ const fn=mxFn(P.halfDir,"snare"); if(fn) mxHit(id,s,"snare",(b,t,v)=>fn(b,{t,pos:8,bar},v),t0+8*st,.9*P.half*mxTrim(id,P.halfDir,"snare"),8,0); }
    if(P.feel.ghosts>.005&&!gUser(id,"ghosts",0)){ const q=P.feel.ghosts; for(const [i,pr] of [[3,.35],[7,.5],[9,.45],[11,.2],[15,.55]]) if(mxHash(bar,i,5)<q*pr) mxHit(id,s,"snare",(b,t,v)=>D.snare(b,t,v,.04,(b.sTone||1)*1.05),t0+i*st+so(i),.1+.08*q,i,so(i)); }
    if(bp&&s.deg&&(s.mxBL==null||s.mxBL>=bar-1)) mxBassPat(id,s,bp,t0,st,so);
  }catch(e){} finally{ R=r0; } }
// an extra hit through the groove (TUNE) when it's on, never through the matrix itself
function mxHit(id,s,role,fn,t,v,pos,swo){ if(!(v>.001)) return; const was=inMorph; inMorph=true;
  try{ if(!(GON[id]&&GRV[id])){ fn(s,t,v); return; }
    const gp=s.gPos, gs=s.gSw; if(s.gNative){ s.gPos=pos; s.gSw=swo||0; } try{ for(const [tt,vv] of gEv(id,s,role,t,v,"X")) fn(s,tt,vv); } finally{ if(s.gNative){ s.gPos=gp; s.gSw=gs; } } }
  catch(e){} finally{ inMorph=was; } }
// the pattern basses (once the bass is swapped): root on the chord, deterministic (no draws)
function mxBassPat(id,s,kind,t0,st,so){ const d=s.mxD, tr=s.mxTr||0, nd=s.mxNd!=null?s.mxNd:d, D0=MXD[s.mxSw.bass], trim=D0.inst&&D0.inst.bass===s.mxBN?(MX_ST_TRIM[id]||1):mxTrim(id,s.mxSw.bass,"bass")*(MX_OLV[s.mxBN]||1), H=(fn,i,dur,v)=>mxHit(id,s,"bass",(b,t,vv)=>fn(mxBB(b),t,vv),t0+i*st+so(i),v*trim,i,so(i));
  const r=bRoot(s,d,tr,33,47), nx=bRoot(s,nd,tr,33,47), f=r+7>47?r-5:r+7;
  if(kind==="offbeat") for(const i of [2,6,10,14]) H((b,t,v)=>M.bass(b,t,bRoot(s,d,tr,33,45),st*1.5,v),i,0,.95);
  else if(kind==="rootfifth"){ H((b,t,v)=>M.bass(b,t,r,st*7,v),0,0,1); H((b,t,v)=>M.bass(b,t,r-5<31?r+7:r-5,st*7,v),8,0,.9); }   // two-beat: root and fifth, held
  else if(kind==="walk"){ const ns=[r,r+ivl(s,d,2),r+ivl(s,d,4),nx+(nx>r?-1:1)]; ns.forEach((m,b)=>H((bb,t,v)=>M.upright(bb,t,m,st*3.3,v),b*4,0,b?.85:1)); }
  else if(kind==="tumbao"){ H((b,t,v)=>M.upright(b,t,f,st*5.5,v),6,0,.9); H((b,t,v)=>M.upright(b,t,nx,st*7,v),12,0,1); }
  else if(kind==="bossa"){ H((b,t,v)=>M.upright(b,t,r,st*5.5,v),0,0,1); H((b,t,v)=>M.upright(b,t,f,st*1.8,v),6,0,.75); H((b,t,v)=>M.upright(b,t,f,st*5.5,v),8,0,.9); } }
// HEARYE's pieces have no drum kit or bass of their own, so pulling them toward a style with a beat brings one in:
// a kick and snare pattern in the style and, from 50%, a bass line on the chord's root, built for the piece's meter.
// Intros and outros get a lighter version. Level: the drums stage (15-45%), x the style's beat level (measured).
const MX_BEAT_LV={rock:.53,pop:1.12,dance:1,hiphop:1.6,lofi:.9,space:1.2,orchestral:1.9,jazz:1.1,latin:1,country:1.12};
const MX_BEAT={   // 16ths of a 4/4 bar: kick, snare; per tempo feel (half: half-time, about 100 BPM and up)
  hiphop:{K:[0,6,10],K2:[0,6,10,14],S:[4,12],Sh:[8],B:"808"},pop:{K:[0,4,8,12],S:[4,12],B:"eighths"},dance:{K:[0,4,8,12],S:[4,12],B:"offbeat"},
  rock:{K:[0,8,10],K2:[0,3,8,10],S:[4,12],B:"eighths"},country:{K:[0,8],K2:[0,7,8],S:[4,12],B:"rootfifth"},lofi:{K:[0,7,10],S:[4,12],B:"rootfifth"},
  space:{K:[0,8],S:[12],B:"pulse"},orchestral:{K:[0],S:[],B:"held"},jazz:{K:[0,10],S:[4,12],B:"walk"},latin:{K:[0,8],S:[6,12],B:"tumbao"}};
function mxBeat(id,s,t0,bs,beats,sub,ch,bar,lvl,bpm){ const P=MXP[id]; if(!P||!ch||!ch.length) return;
  const compound=sub===3, N=compound?beats*6:beats*4, st=bs/N, half=!compound&&beats===4&&bpm>=100;
  const map=x=>compound?Math.round(x/16*N):beats===4?x:Math.round(x*N/16);   // place a 4/4 slot in this meter
  const root=ch[0], GW=GON[id]; s.mxRoot=root; s.mxCh=ch;
  const r0=R; R=mxRand; inMorph=true;
  try{ for(const k of P.top.slice(0,2)){ const Bt=MX_BEAT[k], w=P.w[k]; if(!Bt) continue; const g=mxSS(.15,.45,w)*P.lanes.drums*(MX_ST_TRIM[id]||1)*MX_BEAT_LV[k], gb=w>=.5?mxSS(.45,.55,w)*P.lanes.bass*(MX_ST_TRIM[id]||1)*MX_BEAT_LV[k]:0;
      const I=(t,m,dur)=>({t,m,notes:[m],dur,pos:0,bar,w}), kick=mxFn(k,"kick"), snare=mxFn(k,"snare"), bass=mxFn(k,"bass");
      const H=(fn,role,t,v,m,dur)=>{ if(!fn||!(v>.001)) return; if(!GW){ fn(s,I(t,m,dur),v); return; } for(const [tt,vv] of gEv(id,s,role,t,v,"X")) fn(s,I(tt,m,dur),vv); };
      const kicks=(lvl>=3&&Bt.K2?Bt.K2:Bt.K).map(map).filter((x,j,a)=>x<N&&a.indexOf(x)===j), snares=(k==="hiphop"&&half?Bt.Sh:Bt.S).map(map).filter(x=>x<N);
      const kk=lvl===0?[0]:kicks;
      if(g>.001){ for(const x of kk) H(kick,"kick",t0+x*st,(x===0?1:.85)*g,root-24,.3);
        if(lvl>=1) for(const x of snares) H(snare,"snare",t0+x*st,.9*g,root,.2); }
      if(!(gb>.001)) continue;
      const lo=pitch(root-24,28,43), bl=pitch(root-24,33,45);
      if(Bt.B==="808") kk.forEach((x,j)=>{ const nx=j+1<kk.length?kk[j+1]:N; H(bass,"bass",t0+x*st,.95*gb,pitch(root-24,28,40),(nx-x)*st*.95); });
      else if(Bt.B==="eighths"){ const step=compound?3:2; for(let x=0;x<N;x+=step){ if(lvl===0&&x>0) break; const off=k==="pop"&&x%(step*2)===step; H(bass,"bass",t0+x*st,(x===0?.95:off?.85:.7)*gb,bl+(k==="rock"&&x===N-step&&lvl>=3?7:0),st*step*.9); } }
      else if(Bt.B==="offbeat"){ const q=compound?6:4; for(let x=q/2;x<N;x+=q) H(bass,"bass",t0+x*st,.9*gb,bl,st*q*.4); }
      else if(Bt.B==="rootfifth"){ H(bass,"bass",t0,.9*gb,bl,bs*.45); if(lvl>=1) H(bass,"bass",t0+bs/2,.8*gb,bl+7>47?bl-5:bl+7,bs*.45); }
      else if(Bt.B==="walk"){ const q=N/4; [bl,pitch(ch[1]-24,33,47),pitch((ch[2]??root+7)-24,33,47),bl+(lvl>=2?-1:0)].forEach((m,j)=>{ if(j*q<N) H(bass,"bass",t0+j*q*st,(j?.8:.95)*gb,m,q*st*.9); }); }
      else if(Bt.B==="tumbao"){ H(bass,"bass",t0+map(6)*st,.85*gb,bl+7>47?bl-5:bl+7,st*5); H(bass,"bass",t0+map(12)*st,.95*gb,bl,st*4); }
      else if(Bt.B==="pulse"){ for(let x=0;x<N;x+=compound?3:2) H(bass,"bass",t0+x*st,.7*gb,bl,st*1.6); }
      else if(Bt.B==="held") H(bass,"bass",t0,.8*gb,bl+12,bs*.95); }
  }catch(e){} finally{ inMorph=false; R=r0; } }
// tempo: pulled only above 50%, only when the song is outside the style's range (half and double time count), at most
// x0.8 .. x1.25; swing toward each style's own (from 5%)
function mxInRange(bpm,ranges){ for(const [a,b] of ranges) for(const m of [.5,1,2]) if(bpm>=a*m&&bpm<=b*m) return 0;
  let best=1e9, tgt=bpm; for(const [a,b] of ranges) for(const m of [.5,1,2]) for(const e of [a*m,b*m]){ const d=Math.abs(Math.log(e/bpm)); if(d<best){ best=d; tgt=e; } } return Math.log(tgt/bpm); }
function mxTempoMul(id,bpm){ const P=MXP[id]; if(!P||!(bpm>0)) return 1; let l=0; for(const [k,x] of P.tempo) l+=x*mxInRange(bpm,MXD[k].tempo);
  return Math.max(.8,Math.min(1.25,Math.exp(l))); }
// 1.25: a song's step length as it will play (TUNE's BPM, else the style matrix's pull), for Save and the raves
const songSp=(id,s)=>gOn(id,"bpm")?15/GRV[id].bpm:MXON[id]?(s.sp0||s.sp)/mxTempoMul(id,s.bpm):(s.sp0||s.sp);
function mxSwing(id,sw){ const P=MXP[id]; if(!P||!P.feel.swing.length) return sw; let tw=0, x=0; for(const [tg,f] of P.feel.swing){ tw+=f; x+=f*(tg-sw); } return sw+x/Math.max(1,tw); }
function mxSong(s,step){ if(step%16!==0) return; if(s.sp0==null){ s.sp0=s.sp; s.swing0=s.swing; } const id=s.mxId||"mdfm";
  if(!MXON[id]&&!GON[id]){ s.sp=s.blendSp||s.sp0; s.swing=s.swing0; return; }
  const mul=MXON[id]?mxTempoMul(id,s.bpm):1; s.sp=gOn(id,"bpm")?15/GRV[id].bpm:(s.blendSp||s.sp0)/mul; s.swing=gSwingRatio(id,MXON[id]?mxSwing(id,s.swing0):s.swing0);
  if(MXON[id]){ mxBarT0=s.next; mxBarSt=s.sp; mxBarSteps=16; } }
function setMix(id,vals){ const m=mixOf(id), L=lanesOf(id); const mg=mxMigrate(vals);
  for(const k in mg.w) m[k]=mg.w[k];
  if(mg.lanes) for(const [k] of MX_LANES) if(k in mg.lanes){ const x=+mg.lanes[k]; if(Number.isFinite(x)) L[k]=Math.max(0,Math.min(1,x)); }
  if(mg.glitch>fxv.glitch){ fxv.glitch=mg.glitch; fxApply(); emit("fx",{...fxv}); }   // an old CHAOS setting becomes GLITCH (an effect, all stations)
  MXON[id]=MX_ORDER.some(k=>m[k]>.001); MXP[id]=MXON[id]?mxPlan(id):null;
  if(BYP){ BYP.mx[id]=MXON[id]; BYP.mp[id]=MXP[id]; MXON[id]=false; MXP[id]=null; }
  else if(ctx&&station===id) mxFxSync(id,ctx.currentTime);
  if(id==="wybc"){ wybcMixApply(); wybcMixPump(); }
  emit("mix",{id,mix:{...m},lanes:{...L}}); return {...m}; }
// the pad (PAD view): a point on the circle -> the two nearest directions, cos^2/sin^2 (they sum to 1), times the amount
const MX_N=MX_ORDER.length, MX_SEC=360/MX_N;
function padToMix(x,y,ring=1){ x=+x||0; y=+y||0; ring=Number.isFinite(+ring)?Math.max(0,Math.min(1,+ring)):1;
  const r=Math.min(1,Math.hypot(x,y)), th=((Math.atan2(x,-y)*180/Math.PI)+360)%360, A=(r<.05?0:(r-.05)/.95)*ring;
  const ia=Math.floor(th/MX_SEC)%MX_N, ib=(ia+1)%MX_N, t=(th-ia*MX_SEC)/MX_SEC; let na=Math.cos(t*Math.PI/2)**2, nb=Math.sin(t*Math.PI/2)**2;
  if(na>.93){ na=1; nb=0; } else if(nb>.93){ na=0; nb=1; }
  const w=mixZero(); if(A>0){ w[MX_ORDER[ia]]=+(A*na).toFixed(4); w[MX_ORDER[ib]]=+(A*nb).toFixed(4); }
  return {w,amount:A,angle:th,dist:r,a:MX_ORDER[ia],b:MX_ORDER[ib],t}; }
function mixToPad(m,ring=1){ const w=mxMigrate(m).w, on=MX_ORDER.filter(k=>(w[k]||0)>.001); ring=ring>0?ring:1;
  if(!on.length) return {x:0,y:0,angle:0,dist:0,amount:0,custom:false};
  const ix=on.map(k=>MX_ORDER.indexOf(k)), adj=on.length===1||(on.length===2&&(Math.abs(ix[0]-ix[1])===1||Math.abs(ix[0]-ix[1])===MX_N-1));
  if(adj){ let ia=ix[0], ib=on.length>1?ix[1]:ix[0]; if(on.length>1&&((ib+1)%MX_N===ia)) [ia,ib]=[ib,ia]; const wa=w[MX_ORDER[ia]]||0, wb=ia===ib?0:(w[MX_ORDER[ib]]||0), A=Math.min(1,wa+wb), t=A>0?2/Math.PI*Math.asin(Math.sqrt(wb/A)):0;
    const th=(ia*MX_SEC+t*MX_SEC)%360, r=Math.min(1,.05+.95*Math.min(1,A/ring)), rad=th*Math.PI/180; return {x:r*Math.sin(rad),y:-r*Math.cos(rad),angle:th,dist:r,amount:A,custom:false}; }
  let x=0, y=0, A=0; for(const k of on){ const rad=MXD[k].ang*Math.PI/180; x+=w[k]*Math.sin(rad); y-=w[k]*Math.cos(rad); A+=w[k]; } const r=Math.hypot(x,y);
  return {x,y,angle:((Math.atan2(x,-y)*180/Math.PI)+360)%360,dist:Math.min(1,r),amount:Math.min(1,A),custom:true}; }
// WYBC: Collin's piano can't be re-voiced note by note, so the pull works through its own controls (pace, how busy the
// melody is, strings, winds, warmth, space) plus a rhythm section in the style that follows the piano's chord.
// The pace only moves above 50%, as everywhere.
const WYBC_PULL={pop:{tempo:1.15,notes:.7,strings:.8,winds:.5},hiphop:{tempo:.8,notes:.35,warmth:.8,strings:.5},rock:{tempo:1.35,notes:.95,strings:.3,winds:.3},
  orchestral:{tempo:.9,notes:.6,strings:1.5,winds:1.4,space:.75},country:{tempo:1.1,notes:.65,winds:.4,warmth:.7},space:{tempo:.7,notes:.3,space:1,strings:1.3},
  dance:{tempo:1.3,notes:.8,strings:.4},lofi:{tempo:.75,notes:.4,warmth:.9,space:.4},jazz:{tempo:1.05,notes:.75,winds:.8,warmth:.65},latin:{tempo:1.15,notes:.7,winds:.6,strings:.4}};
function wybcPull(){ const P=MXP.wybc, base={tempo:1,notes:.5,strings:wybcTypes.strings?1:0,winds:wybcTypes.winds?1:0,warmth:.5,space:.5}, v={};   // the generator's settings, pulled
  for(const k in base){ let x=base[k]; if(P) for(const st of P.top){ const p=WYBC_PULL[st], w=P.w[st]; if(p&&k in p&&!((k==="strings"&&!wybcTypes.strings)||(k==="winds"&&!wybcTypes.winds))) x+=(k==="tempo"?mxSS(.5,1,w)*P.lanes.tempo:w)*(p[k]-base[k]); } v[k]=x; }
  if(gOn("wybc","bpm")) v.tempo=Math.max(.35,Math.min(3,GRV.wybc.bpm/50)); return v; }   // the generator's pace: a piano step a beat, 50 BPM at 1
function wybcMixApply(){ const a=amb&&amb.inst; if(!a||!a.set) return; const v=wybcPull(); for(const k in v){ try{ a.set(k,v[k]); }catch(e){} } }
let wybcMixT=0, wybcMixNext=0;
const wybcMapNote=m=>{ if(!GON.wybc) return m; const f=gKeyMap("wybc",62,MA); return f?f(m):m; };   // the piano is in D major; TUNE's key and mode move it
let wybcBar=0;
function wybcTriad(x){ if(!x||x.length<3) return [50,54,57]; const r=x[0], iv=n=>(n-r+120)%12, th=x.find(n=>iv(n)===3||iv(n)===4), fi=x.find(n=>iv(n)===7||iv(n)===6); return [r,th??r+4,fi??r+7]; }
// one bar of the style's rhythm section over the piano's chord (live from the pump; offline, Save, from the generator's onChord)
function wybcRhythm(rs,t0,bs,ch,P){ const st=bs/16, GW=GON.wybc; inMorph=true; if(!P) P=MXP.wybc; if(!P){ inMorph=false; return; }
  if(GW){ rs.gGrid={t0,st,n:16,bar:wybcBar}; ch=ch.map(wybcMapNote); } rs.mxRoot=ch[0]; rs.mxCh=ch; rs.mxG={t0,st,n:16,bar:wybcBar}; wybcBar++;
  const H=(fn,role,t,v,info)=>{ if(!fn||!(v>.001)) return; if(!GW){ fn(rs,info(t),v); return; } for(const [tt,vv] of gEv("wybc",rs,role,t,v,"X")) fn(rs,info(tt),vv); };   // through the groove (TUNE)
  const r0=R; R=mxRand;
  try{ for(const k of P.top){ const w=P.w[k], v=mxSS(.15,.45,w)*P.lanes.drums*.7, vb=w>=.5?.7*P.lanes.bass:0, fn=r=>mxFn(k,r), I=t=>({t,m:ch[0],notes:ch,dur:st*3,pos:0,bar:rs.mxG.bar,w});
      if(k!=="orchestral"&&k!=="space"){ H(fn("kick"),"kick",t0,v,I); H(fn("kick"),"kick",t0+8*st,v*.8,I); H(fn("snare"),"snare",t0+(k==="hiphop"?8:4)*st,v,I); if(k!=="hiphop") H(fn("snare"),"snare",t0+12*st,v,I);
        for(let i=0;i<16;i+=2) H(fn("hat"),"hat",t0+i*st,v*.6,t=>({...I(t),pos:i})); }
      if(k==="space"){ H(fn("chord"),"chord",t0,v*.6,t=>({t,notes:ch,m:ch[0],dur:bs})); H(fn("lead"),"lead",t0+bs*.5,v*.6,t=>({t,m:pitch(ch[2]+12,67,88),notes:[ch[2]],dur:bs*.4})); }
      if(k==="orchestral") H(fn("kick"),"kick",t0,v,I);
      const lo=pitch(ch[0]-24,33,45); H(fn("bass"),"bass",t0,vb,t=>({t,m:k==="hiphop"?pitch(lo,28,40):lo,notes:[lo],dur:bs*.45})); H(fn("bass"),"bass",t0+bs*.5,vb*.85,t=>({t,m:lo+(k==="country"?7:0),notes:[lo],dur:bs*.45})); }
  }catch(e){} finally{ inMorph=false; R=r0; }
  if(GW&&P.top.length) gPump("wybc",rs,t0,bs,rs.gGrid.bar,false); }
function wybcRS(){ let rs=MXF.get(ctx)&&MXF.get(ctx).rs; if(!rs){ const g=G(.7); g.connect(pre); rs=makeBus(g,fxRev); (MXF.get(ctx)||MXF.set(ctx,[]).get(ctx)).rs=rs; } return rs; }
function wybcMixPump(){ clearTimeout(wybcMixT); wybcMixT=0; if(!on||station!=="wybc"||!MXON.wybc||!ctx) return; const P=MXP.wybc; if(!P||!P.top.length) return;
  if(wybcMixNext<ctx.currentTime+.05) wybcMixNext=ctx.currentTime+.1;
  const rs=wybcRS();
  while(wybcMixNext<ctx.currentTime+1.4){ let x=null; try{ x=amb&&amb.inst&&amb.inst.chord&&amb.inst.chord(); }catch(e){}
    const bs=2.4*(amb&&amb.inst&&amb.inst.get?1/(amb.inst.get("tempo")||1):1);
    wybcRhythm(rs,wybcMixNext,bs,wybcTriad(x),P); wybcMixNext+=bs; }
  wybcMixT=setTimeout(wybcMixPump,500); }
/* ---------- GROOVE & KEY (TUNE): tempo, time signature, swing, length, key and mode, and the drums, per station ----------
   Everything at its default = the station exactly as before (nothing is rerouted, no random numbers are drawn).
   The song's notes are moved by scale degree into the chosen key and mode, so its chords and tunes keep their shape.
   Drums: density thins or fills in the kit, fills come more or less often, feel is half / normal / double time,
   humanize loosens timing and touch, and the drum level is the kit's loudness. Applies live and to Save. */
const KEY_MODES=[["major","Major (Ionian)",[0,2,4,5,7,9,11]],["minor","Minor (Aeolian)",[0,2,3,5,7,8,10]],["dorian","Dorian",[0,2,3,5,7,9,10]],
  ["phrygian","Phrygian",[0,1,3,5,7,8,10]],["lydian","Lydian",[0,2,4,6,7,9,11]],["mixolydian","Mixolydian",[0,2,4,5,7,9,10]],["locrian","Locrian",[0,1,3,5,6,8,10]],
  ["harmonic","Harmonic minor",[0,2,3,5,7,8,11]],["melodic","Melodic minor",[0,2,3,5,7,9,11]],["phrygdom","Phrygian dominant",[0,1,4,5,7,8,10]],
  ["lyddom","Lydian dominant",[0,2,4,6,7,9,10]],["ukrdorian","Ukrainian dorian",[0,2,3,6,7,9,10]],["hungarian","Hungarian minor",[0,2,3,6,7,8,11]],
  ["doubleharm","Double harmonic",[0,1,4,5,7,8,11]],["neapmin","Neapolitan minor",[0,1,3,5,7,8,11]],["neapmaj","Neapolitan major",[0,1,3,5,7,9,11]],
  ["persian","Persian",[0,1,4,5,6,8,11]],["enigmatic","Enigmatic",[0,1,4,6,8,10,11]],["altered","Super Locrian (altered)",[0,1,3,4,6,8,10]]];
const KEY_MODE=Object.fromEntries(KEY_MODES.map(([k,,sc])=>[k,sc]));
// time signatures as 16th slots of the song's 4/4 bar: which of its 16ths play, in order (5/4 plays beat 3 again)
const METERS={"4/4":{name:"4/4",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]},"3/4":{name:"3/4",map:[0,1,2,3,4,5,6,7,8,9,10,11]},"6/8":{name:"6/8",map:[0,1,2,3,4,5,8,9,10,11,12,13]},
  "5/4":{name:"5/4",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,8,9,10,11]},"7/8":{name:"7/8",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13]},
  "7/4":{name:"7/4",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11]}};
for(const k in METERS){ const M=METERS[k]; M.slots=Array.from({length:16},()=>[]); M.map.forEach((p,j)=>M.slots[p].push(j)); M.ratio=M.map.length/16; }
const GROOVE_DEF={bpm:0,meter:"",swing:.5,swAbs:-1,length:.5,root:-1,mode:"",density:.5,fills:.5,feel:.5,humanize:0,drums:.5,
  push:.5,pushK:-1,pushS:-1,pushH:-1,ghosts:0,accent:.5,hsAbs:-1,hatdens:.5,kick:.5,snare:.5,hats:.5};   // inside the engine (.5 = as written); 1.25 (E3): the drum controls
/* What the controls hold (1.22): swing, length, density, fills and drums are -1 for the song's own (TUNE's SONG button),
   or 0..1 on their own scale: swing 0 = dead straight .. 1 = heavy shuffle; length x0.5 .. x3; density 0 = bare .. 1 = busiest;
   fills 0 = none .. 1 = lots; drums 0 = off .. 1 = +6 dB (density, fills, length and drums at .5 play as written). */
/* 1.25 (E3), the drum controls: push (0 = 30 ms ahead .. .5 on the beat .. 1 = 30 ms behind; the kit moves as a drummer
   would: the snare most, the kick least, the bass a little) and per part pushK / pushS / pushH (-1 = follow PUSH); ghosts
   (0 none .. 1 lots of ghost snares); accent (0 flat .. .5 as written .. 1 hard accents); hatswing (-1 = follows SWING,
   0 straight .. 1 heavy, the hats only); hatdens (-1 song; 0 quarters only .. .5 as written .. 1 sixteenths and rolls);
   kick / snare / hats (-1 song; 0 off .. .5 0 dB .. 1 +6 dB). gv 3: HUMANIZE is per part (kicks tighter than hats). */
const GROOVE_UI={bpm:0,meter:"",swing:-1,length:-1,root:-1,mode:"",density:-1,fills:-1,feel:.5,humanize:0,drums:-1,
  push:.5,pushK:-1,pushS:-1,pushH:-1,ghosts:0,accent:.5,hatswing:-1,hatdens:-1,kick:-1,snare:-1,hats:-1,gv:3};
const GSONG=["swing","length","density","fills","drums","hatdens","kick","snare","hats"], GFOLLOW=["pushK","pushS","pushH","hatswing"], GRAW={};
const grvDerive=r=>{ const n=x=>x<0||x==null?.5:x, f=x=>x==null||x<0?-1:x; return {bpm:r.bpm,meter:r.meter,root:r.root,mode:r.mode,feel:r.feel,humanize:r.humanize,swing:.5,swAbs:r.swing,length:n(r.length),density:n(r.density),fills:n(r.fills),drums:n(r.drums),
  push:r.push??.5,pushK:f(r.pushK),pushS:f(r.pushS),pushH:f(r.pushH),ghosts:r.ghosts||0,accent:r.accent??.5,hsAbs:f(r.hatswing),hatdens:n(r.hatdens),kick:n(r.kick),snare:n(r.snare),hats:n(r.hats),hum3:(r.gv||0)>=3}; };
const GROOVE_KEYS=[["bpm","BPM","The tempo (SONG: the song's own, where the slider sits)"],["meter","TIME","Time signature: the song's own (most are 4/4), or 4/4, 3/4, 6/8, 5/4, 7/8, 7/4"],
  ["swing","SWING","Dead straight to a heavy shuffle (SONG: the song's own)"],["length","LENGTH","How long each song or piece runs, from the next song (SONG: as written)"],
  ["root","KEY","The key the song is played in"],["mode","MODE","The scale: major, minor, the church modes and the strange ones"],
  ["density","DENSITY","Bare (just the backbone) to busy drums; 50 is as written"],["fills","FILLS","No fills at all to a fill every few bars; 50 is as written"],["feel","FEEL","Half time, normal or double time"],
  ["humanize","HUMANIZE","Tight to loose: timing and touch, like a drummer"],["drums","DRUMS","The drum kit's level: off to loud (SONG: as mixed)"],
  ["push","PUSH / PULL","Where the drums sit against the beat: ahead (pushed, urgent) to behind (laid back), up to 30 ms. The snare moves most, the kick least"],
  ["pushK","KICK PUSH","The kick alone, ahead or behind (FOLLOW: as PUSH / PULL)"],["pushS","SNARE PUSH","The snare and clap alone, ahead or behind (FOLLOW: as PUSH / PULL)"],["pushH","HAT PUSH","The hats and shaker alone, ahead or behind (FOLLOW: as PUSH / PULL)"],
  ["ghosts","GHOSTS","Ghost notes: quiet snares between the beats"],["accent","ACCENT","Dynamics: flat (every hit the same) to hard accents on the beats; 50 is as written"],
  ["hatswing","HAT SWING","The hats' own swing, straight to heavy (FOLLOW: the SWING setting)"],["hatdens","HATS","Hat density: quarters only to sixteenths and rolls; 50 is as written (SONG)"],
  ["kick","KICK","The kick's level: off to +6 dB (SONG: as mixed)"],["snare","SNARE","The snare and clap level: off to +6 dB (SONG: as mixed)"],["hats","HATS LEVEL","The hats, shaker and percussion level: off to +6 dB (SONG: as mixed)"]];
// how to build each control (UI): range, default, what -1 means, labels at each end, the group it sits in
const GROOVE_META={bpm:{type:"bpm",min:40,max:220,def:0,song:"SONG",group:"tempo"},meter:{type:"choice",def:"",song:"SONG",group:"tempo"},feel:{type:"choice",options:[0,.5,1],def:.5,group:"tempo",captions:["HALF","NORMAL","DOUBLE"]},
  swing:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"tempo",captions:["STRAIGHT","SHUFFLE"]},length:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"tempo",captions:["x0.5","x3"]},
  root:{type:"choice",def:-1,song:"SONG",group:"key"},mode:{type:"choice",def:"",song:"SONG",group:"key"},
  density:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"drums",captions:["BARE","BUSY"]},hatdens:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"drums",captions:["QUARTERS","16THS"]},
  fills:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"drums",captions:["NONE","LOTS"]},ghosts:{type:"knob",min:0,max:1,def:0,group:"drums",captions:["OFF","LOTS"]},
  push:{type:"knob",min:0,max:1,def:.5,bipolar:true,group:"feel",captions:["AHEAD","BEHIND"],unit:"ms",scale:[-30,30]},
  pushK:{type:"knob",min:0,max:1,def:-1,song:"FOLLOW",bipolar:true,group:"feel",captions:["AHEAD","BEHIND"],unit:"ms",scale:[-30,30]},
  pushS:{type:"knob",min:0,max:1,def:-1,song:"FOLLOW",bipolar:true,group:"feel",captions:["AHEAD","BEHIND"],unit:"ms",scale:[-30,30]},
  pushH:{type:"knob",min:0,max:1,def:-1,song:"FOLLOW",bipolar:true,group:"feel",captions:["AHEAD","BEHIND"],unit:"ms",scale:[-30,30]},
  hatswing:{type:"knob",min:0,max:1,def:-1,song:"FOLLOW",group:"feel",captions:["STRAIGHT","HEAVY"]},humanize:{type:"knob",min:0,max:1,def:0,group:"feel",captions:["TIGHT","LOOSE"]},
  accent:{type:"knob",min:0,max:1,def:.5,bipolar:true,group:"feel",captions:["FLAT","PUNCHY"]},
  kick:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"levels",captions:["OFF","+6 dB"],unit:"dB"},snare:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"levels",captions:["OFF","+6 dB"],unit:"dB"},
  hats:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"levels",captions:["OFF","+6 dB"],unit:"dB"},drums:{type:"knob",min:0,max:1,def:-1,song:"SONG",group:"levels",captions:["OFF","LOUD"],unit:"dB"}};
const GRV={}, GON={};
const grvOf=id=>GRV[id]||(GRV[id]={...GROOVE_DEF});
const GSUP={mdfm:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},cluk:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},ptrn:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},hearye:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},
  ptlk:{bpm:1,meter:1,swing:1,length:0,key:1,drums:1},wybc:{bpm:1,meter:0,swing:1,length:1,key:1,drums:1}};
const GDRUM=new Set(["kick","snare","clap","hat","perc","shaker","tom","crash"]);
function cleanGroove(v){ const o={}; if(!v) return o;
  if("bpm" in v){ const x=+v.bpm; o.bpm=Number.isFinite(x)&&x>=30?Math.max(40,Math.min(220,Math.round(x))):0; }
  if("meter" in v) o.meter=METERS[v.meter]?v.meter:"";
  if("root" in v){ const x=Math.round(+v.root); o.root=Number.isFinite(x)&&x>=0&&x<12?x:-1; }
  if("mode" in v) o.mode=KEY_MODE[v.mode]?v.mode:"";
  if("feel" in v){ const x=+v.feel; o.feel=!Number.isFinite(x)?.5:x<.25?0:x>.75?1:.5; }
  const legacy=!(+v.gv>=2);   // saved before 1.22: .5 was "the song's own", and swing was relative to the song (1.25: gv 3 is current)
  if("gv" in v&&Number.isFinite(+v.gv)) o.gv=+v.gv;
  for(const k of ["swing","length","density","fills","humanize","drums"]) if(k in v){ let x=+v[k]; if(!Number.isFinite(x)) continue;
    if(GSONG.includes(k)&&(x<0||(legacy&&Math.abs(x-.5)<.006))){ o[k]=-1; continue; }
    if(legacy&&k==="swing") x=x<.5?x*.4:.2+(x-.5)*1.6; o[k]=Math.max(0,Math.min(1,x)); }
  for(const k of ["push","pushK","pushS","pushH","ghosts","accent","hatswing","hatdens","kick","snare","hats"]) if(k in v){ const x=+v[k]; if(!Number.isFinite(x)) continue;   // 1.25 (E3)
    o[k]=x<0&&(GSONG.includes(k)||GFOLLOW.includes(k))?-1:Math.max(0,Math.min(1,x)); }
  return o; }
const grvIsDef=g=>Object.keys(GROOVE_DEF).every(k=>typeof GROOVE_DEF[k]==="number"?Math.abs(g[k]-GROOVE_DEF[k])<.005:g[k]===GROOVE_DEF[k]);
const gOn=(id,k)=>{ const g=GON[id]&&GRV[id]; if(!g) return false;
  return k==="key"?(g.root>=0||!!g.mode):k==="meter"?!!g.meter&&GSUP[id]&&GSUP[id].meter:k==="bpm"?g.bpm>0:k==="length"?Math.abs(g.length-.5)>.005:true; };
const gLenMul=id=>{ const v=gOn(id,"length")?GRV[id].length:.5; return v<.5?.5+v:1+(v-.5)*4; };   // 0.5x .. 3x
const gSwingRatio=(id,base)=>{ const g=GON[id]&&GRV[id]; if(g&&g.swAbs>=0) return .5+.22*g.swAbs; const v=g?g.swing:.5; if(Math.abs(v-.5)<.005) return base; return v<.5?.5+(base-.5)*v*2:base+(Math.max(base,.72)-base)*(v-.5)*2; };
const gDrumLv=v=>v<.5?Math.pow(v*2,1.6):1+(v-.5)*2;   // off .. x2 (+6 dB)
// key: each note's scale degree in the song's key, moved to the same degree of the chosen key and mode (chromatic notes keep their offset)
function gKeyMap(id,root,sc){ const g=GRV[id]; if(!gOn(id,"key")||!sc) return null; const tsc=g.mode?KEY_MODE[g.mode]:sc, rpc=((root%12)+12)%12;
  const shift=g.root>=0?((g.root-rpc+18)%12)-6:0;
  return m=>{ if(typeof m!=="number"||!Number.isFinite(m)||m!==Math.round(m)) return m; const rel=m-root, oct=Math.floor(rel/12), pc=rel-12*oct;
    let k=0; for(let j=0;j<7;j++) if(sc[j]<=pc) k=j; return root+shift+12*oct+tsc[k]+(pc-sc[k]); }; }
const gKeyName=(id,rootPc,scName)=>{ const g=GRV[id]; if(!gOn(id,"key")) return null; const r=g.root>=0?g.root:rootPc, md=g.mode?KEY_MODES.find(x=>x[0]===g.mode)[1].replace(/ \(.*\)$/,"").toLowerCase():scName;
  return NOTE_NAMES[((r%12)+12)%12]+" "+md; };
// where an event lands once the groove has moved it: [[time, velocity], ...] (none: left out). s.gGrid: the bar it's in.
const gHats8=s=>s.gH8??(s.gH8=typeof s.H==="string"&&![...s.H].some((c,i)=>i%2===1&&c!=="."&&c!=="-"));   // 1.25 (E3): the song's main hat pattern is all eighths
function gEv(id,s,role,t,v,from){ const g=GRV[id], gr=s&&s.gGrid, drum=GDRUM.has(role), nat=!!s.gNative;
  let p=-1,n=16,st=0,w=-1; if(gr&&gr.st>0){ n=gr.n; st=gr.st; p=Math.round((t-gr.t0)/st); if(p<0||p>=n) p=-1; }
  if(nat&&s.gPos!=null){ w=s.gPos; } else if(p>=0) w=Math.round(p*16/n);
  let lv=1,T=[t];
  if(drum){ lv=gDrumLv(g.drums); if(lv<.003) return []; if(g.density<.02&&(role==="hat"||role==="perc"||role==="shaker")) return [];   // density 0: bare, just the backbone
    if(g.density<.49&&w>=0){ const q=(.5-g.density)*2; let pd=0;
      if(role==="hat") pd=w%2?q:w%4?q*.7:0; else if(role==="kick") pd=w%8?q*.8:0;
      else if(role==="snare"||role==="clap") pd=w===4||w===12||w===8?0:q; else if(role==="perc"||role==="shaker") pd=q;
      if(pd&&R()<pd) return []; }
    if(role==="tom"&&from==="D"&&g.fills<.49&&R()<(.5-g.fills)*2) return [];
    if(!nat&&p>=0&&g.feel!==.5){
      if(p%2) return [];
      if(g.feel<.5){ const half=n/2; if((gr.bar||0)%2===0){ if(p>=half) return []; T=[gr.t0+2*p*st]; } else { if(p<half) return []; T=[gr.t0+2*(p-half)*st]; } }
      else T=[gr.t0+p/2*st,gr.t0+(p/2+n/2)*st]; } }
  if(!nat&&p>=0&&gSwingRatio(id,.5)>.505){ const off=(gSwingRatio(id,.5)-.5)*2*st; T=T.map(x=>Math.round((x-gr.t0)/st)%2?x+off:x); }
  if(!nat&&!s.gNoMeter&&gr&&gr.st>0&&gOn(id,"meter")){ const M=METERS[g.meter], b16=gr.st*gr.n/16, out=[];
    for(const x of T){ const f=(x-gr.t0)/b16, base=Math.floor(f+.001), fr=f-base;
      if(base<0) out.push(x); else if(base>=16) out.push(gr.t0+(M.map.length+f-16)*b16); else for(const j of M.slots[base]) out.push(gr.t0+(j+fr)*b16); }
    T=out; if(!T.length) return []; }
  // 1.25 (E3): the drum controls. Each does nothing (no time, level or random change) at its default.
  if(drum){ const L=role==="kick"?g.kick:role==="snare"||role==="clap"?g.snare:role==="hat"||role==="shaker"||role==="perc"?g.hats:.5;   // part levels
    if(Math.abs(L-.5)>.005){ lv*=gDrumLv(L); if(lv<.003) return []; }
    if(role==="hat"&&g.hatdens<.49&&w>=0){ const q=(.5-g.hatdens)*2, pd=w%2?q:w%4?q*.8:0; if(pd&&R()<pd) return []; } }   // hat density, thinner (busier is in gPump)
  if(role==="hat"&&g.hsAbs>=0&&w>=0){   // hat swing: the hats' own swing offset instead of the song's (16ths; 8ths on 8th-swung songs)
    const s8=nat&&(s.st&&s.st.sw8||gHats8(s)), on=s8?w%4===2:w%2===1;   // songs whose hats are all on eighths swing their eighths
    if(on){ const stp=nat?(s.gSp||st):st, cur=nat?(s.gSw||0):(gSwingRatio(id,.5)>.505?(gSwingRatio(id,.5)-.5)*2*st:0), want=g.hsAbs*.22*(s8?4:2)*stp; T=T.map(x=>x-cur+want); } }
  { const pk=role==="kick"?g.pushK:role==="snare"||role==="clap"?g.pushS:role==="hat"||role==="shaker"?g.pushH:-1, P=pk>=0?pk:g.push;   // push / pull
    if(Math.abs(P-.5)>.005){ const k=pk>=0?1:drum?(MX_PUSHK[role]??.6):role==="bass"?.3:0; if(k){ const ms=(P-.5)*2*.030*k, now=ctx?ctx.currentTime:0; T=T.map(x=>Math.max(now,x+ms)); } } }
  let av=1; if(drum&&Math.abs(g.accent-.5)>.005&&w>=0){ const a=(g.accent-.5)*2, e=Math.pow(2,a*1.3), vn=Math.min(1,v); av=(vn>0?Math.pow(vn,e)/vn:1)*(w%4===0?1+.15*Math.max(0,a):1); }   // accent: velocity contrast, a lift on the beats
  let hv=1; if(drum&&g.humanize>.005){ const h=g.humanize, k=g.hum3?({kick:.5,snare:.8,clap:.8,hat:1,shaker:1,perc:1,tom:.8,crash:.5}[role]??1):1; T=T.map(x=>x+(R()-.5)*2*h*.02*k); hv=1+(R()-.5)*h*.6*k; }   // gv 3: per part
  return T.map(x=>[Math.max(0,x),v*lv*hv*av]); }
function grooveArgs(id,role,vi,s,a,from){ const drum=GDRUM.has(role), v0=typeof a[vi]==="number"?a[vi]:1, ev=gEv(id,s,role,a[0],v0,from);
  if(!ev.length) return ev; const km=!drum&&s.gKey?gKeyMap(id,s.gKey.root+(s.gTr||0),s.gKey.sc):null;
  return ev.map(([t,v])=>{ const b=[...a]; b[0]=t; if(drum||v!==v0) b[vi]=v;
    if(km){ if(Array.isArray(b[1])) b[1]=b[1].map(km); else if(typeof b[1]==="number") b[1]=km(b[1]); if(role==="bass"&&typeof b[4]==="number"&&vi!==4) b[4]=km(b[4]); }
    return b; }); }
// once a bar: busier drums and extra fills (density and fills past the middle)
function gPump(id,s,t0,bs,bar,noFill){ const g=GRV[id]; if(!GON[id]||!g||(g.density<.51&&g.fills<.51&&g.ghosts<.005&&g.hatdens<.51)) return;
  const st=bs/16, sw=s.gNative?(s.swing-.5)*2*st:0;
  const hit=(role,fn,t,v,pos)=>{ if(s.gNative){ s.gPos=pos; s.gSw=pos%2?sw:0; } for(const [tt,vv] of gEv(id,s,role,t,v,"D")){ inMorph=true; try{ fn(s,tt,vv); }catch(e){} finally{ inMorph=false; } } };
  if(g.density>.51){ const q=(g.density-.5)*2;
    for(let i=1;i<16;i+=2) if(R()<q*.85) hit("hat",(b,t,v)=>D.hat(b,t,v,false,b.hatDec),t0+i*st+sw,.2+.12*q,i);
    for(const i of [7,10,15]) if(R()<q*.35) hit("snare",(b,t,v)=>D.snare(b,t,v,.06,b.sTone||1),t0+i*st+(i%2?sw:0),.16,i);
    for(const i of [6,14]) if(R()<q*.3) hit("kick",(b,t,v)=>D.kick(b,t,v,b.kTn||b.kTune||1),t0+i*st,.5*q,i); }
  if(g.fills>.51&&!noFill){ const q=(g.fills-.5)*2;
    if((bar%4===3&&R()<q)||R()<q*.3){ if(R()<.5) for(let j=0;j<4;j++) hit("tom",(b,t,v)=>D.tom(b,t,v,[200,170,140,110][j]),t0+(12+j)*st,.65,12+j);
      else for(let j=8;j<16;j++) hit("snare",(b,t,v)=>D.snare(b,t,v,.1,b.sTone||1),t0+j*st+(j%2?sw:0),.25+(j-8)*.07,j); } }
  if(g.ghosts>.005){ const q=g.ghosts; for(const [i,pr] of [[3,.35],[6,.25],[7,.5],[9,.45],[10,.3],[11,.2],[14,.35],[15,.55]])   // 1.25 (E3): ghost snares
    if(R()<q*pr) hit("snare",(b,t,v)=>D.snare(b,t,v,.04,(b.sTone||1)*1.05),t0+i*st+(i%2?sw:0),.1+.1*q,i); }
  if(g.hatdens>.51){ const q=(g.hatdens-.5)*2; for(let i=1;i<16;i+=2) if(R()<q) hit("hat",(b,t,v)=>D.hat(b,t,v,false,b.hatDec),t0+i*st+sw,.22+.1*q,i);   // 1.25 (E3): busier hats, and rolls
    if(R()<q*.3){ const r=R()<.5?6:14; for(let j=0;j<4;j++) hit("hat",(b,t,v)=>D.hat(b,t,v,false,b.hatDec),t0+(r+j/2)*st+sw,.3,r); } }
  if(s.gNative) s.gPos=null; }
// MDFM songs: one step (a 16th) on the scheduler, through the time signature. Returns how far to move on.
const songMeter=s=>{ const id=s.mxId||"mdfm"; return gOn(id,"meter")?GRV[id].meter:s.meter||""; };   // TUNE's time signature, else the song's own
const meterRatio=s=>{ const k=songMeter(s); return k?METERS[k].ratio:1; };
function mStep(s,t,play){ const mk=songMeter(s); if(s.step%16===0){ s.barT0=t; if(s.patOwn){ const w=mk===s.meter?s.patOwn:s.pat44; if(s.patNow!==w){ Object.assign(s,w); s.patNow=w; } } if(play&&!s.handed&&ctx&&FXW.get(ctx)){ fxBeat(t,s.sp*4); if(glOn) glitchBar(t,s.sp*16*meterRatio(s),s.sp*4); } } if(!mk){ if(play) playStep(s,s.step,t); return s.sp; }
  const M=METERS[mk], i=s.step%16; if(!M.slots[i].length) return 0;
  if(play) playStep(s,s.step,t); let adv=s.sp;
  if(i===15&&M.map.length>16){ const bar0=s.step-15; for(const x of M.map.slice(16)){ if(play){ s.gExtra=true; try{ playStep(s,bar0+x,t+adv); }finally{ s.gExtra=false; } } adv+=s.sp; } }
  return adv; }
// length: the song's form, every section stretched or squeezed (bars stay even)
function gSongLen(s,id="mdfm"){ const L=gLenMul(id); if(Math.abs(L-1)<.01) return s; let at=0; const old=s.sections;
  s.sections=old.map(x=>{ const bars=Math.max(2,Math.round(x.bars*L/2)*2), y={...x,start:at,bars}; at+=bars; return y; });
  const remap=b=>{ if(b>=1e8) return b; const k=old.findIndex(x=>b>=x.start&&b<x.start+x.bars); if(k<0) return b; return s.sections[k].start+Math.min(s.sections[k].bars-1,Math.round((b-old[k].start)*L)); };
  s.bars=Math.max(at,16); s.brk=remap(s.brk); s.keyFrom=remap(s.keyFrom); s.deckB=remap(s.deckB);
  return s; }
function setGroove(id,vals){ const r=GRAW[id]||(GRAW[id]={...GROOVE_UI}), g=grvOf(id), was={...g}; Object.assign(r,cleanGroove(vals)); Object.assign(g,grvDerive(r)); GON[id]=!grvIsDef(g);
  if(BYP){ BYP.g[id]=GON[id]; GON[id]=false; }   // 1.25 (E3): during ORIGINAL (bypass), held until it's let go
  if(id==="wybc") wybcMixApply();
  if(id==="hearye"&&g.length!==was.length&&fair&&fair.next&&!(fair.piece&&fair.piece.p===fair.next)){ const o=fair.next, p=fPiece(o.style,o.seed,o.base*gLenMul("hearye")); p.base=o.base; p.title=o.title; p.artist=o.artist; fair.next=p; }
  if(station===id&&nowPlaying) emit("nowplaying",nowPlaying);
  emit("groove",{id,groove:{...r}}); return {...r}; }
// what's on now, with the groove's tempo and key
function gFacts(np){ if(!np) return np; const id=np.station||"mdfm"; if(!GON[id]) return np; const o={...np};
  if(gOn(id,"bpm")) o.bpm=GRV[id].bpm;
  if(gOn(id,"key")&&typeof o.key==="string"){ const [r,...rest]=o.key.split(" "), pc=NOTE_NAMES.indexOf(r); if(pc>=0) o.key=gKeyName(id,pc,rest.join(" ")); }
  if(gOn(id,"meter")) o.time=GRV[id].meter;
  return o; }
/* ---------- MIDI (Save): the notes of the song as it renders, after the style matrix and the groove, as a Standard MIDI File.
   One track per part (drums on channel 10 with General MIDI drum notes, bass, chords, pad, lead, and on WYBC the
   piano, strings and winds), the tempo and time signature, and the title. For DAWs and notation programs. ---------- */
let MIDICAP=null, midiDepth=0;
const GM_DRUM={kick:36,snare:38,clap:39,snap:39,rim:37,crash:49,shaker:70,cowbell:56,tamb:54,frame:61,drum:35,ride:51,brush:40,clave:75,timbale:65,chipk:36,chipn:42};
function midiRec(obj,name,role,vi,a){ const C=MIDICAP, t=a[0]; if(!C||typeof t!=="number"||t<C.t0-.01||t>C.end) return;
  const vv=typeof a[vi]==="number"?a[vi]:1, vel=Math.max(1,Math.min(127,Math.round(24+vv*80)));
  if(obj==="PI"&&name==="timp"){ C.ev.push({tr:"Timpani",m:[a[1]],t,d:.9,vel}); return; }
  if(GDRUM.has(role)){ let n=GM_DRUM[name];
    if(name==="hat") n=a[2]?46:42; else if(name==="conga") n=a[2]?63:64; else if(name==="tom"){ const f=typeof a[2]==="number"?a[2]:130; n=f>170?50:f>130?48:f>100?47:45; }
    if(n==null) n=role==="kick"?36:role==="snare"?38:role==="hat"?42:role==="tom"?45:role==="crash"?49:role==="shaker"?70:60;
    C.ev.push({tr:"Drums",m:[n],t,d:.1,vel,drum:1}); return; }
  let m=role==="gchord"?[a[1],a[1]+7,a[1]+12]:Array.isArray(a[1])?a[1]:[a[1]]; m=m.filter(x=>typeof x==="number"&&Number.isFinite(x)).map(Math.round); if(!m.length) return;
  const d=vi>=3&&typeof a[2]==="number"?a[2]:role==="chord"||role==="gchord"?.8:.5;
  C.ev.push({tr:role==="gchord"?"Chords":{bass:"Bass",chord:"Chords",pad:"Pad",lead:"Lead"}[role]||"Lead",m,t,d:Math.max(.03,Math.min(30,d)),vel}); }
const MIDI_PROG={mdfm:{Bass:38,Chords:4,Pad:89,Lead:81,Timpani:47},cluk:{Bass:39,Chords:62,Pad:89,Lead:81,Timpani:47},ptrn:{Bass:33,Chords:4,Pad:89,Lead:81,Timpani:47},hearye:{Bass:32,Chords:46,Pad:48,Lead:73,Timpani:47},
  wybc:{Piano:0,Strings:48,Winds:71,Bass:33,Chords:4,Pad:89,Lead:81}};
const MIDI_ORDER=["Drums","Bass","Chords","Pad","Lead","Timpani","Piano","Strings","Winds"];
function midiFile(C){ const PPQ=480, bpm=Math.max(20,Math.min(300,C.bpm||120)), tk=sec=>Math.max(0,Math.round((sec-C.t0)*bpm/60*PPQ));
  const vlq=n=>{ const b=[n&127]; while(n>>=7) b.unshift((n&127)|128); return b; }, str=x=>[...new TextEncoder().encode(x)];
  const trk=evs=>{ evs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const out=[]; let last=0; for(const [t,,bytes] of evs){ out.push(...vlq(t-last),...bytes); last=t; } out.push(0,255,47,0);
    return [77,84,114,107,out.length>>>24&255,out.length>>>16&255,out.length>>>8&255,out.length&255,...out]; };
  const meta=(t,type,data)=>[t,0,[255,type,...vlq(data.length),...data]];
  const [num,den]=(C.time||"4/4").split("/").map(Number), us=Math.round(6e7/bpm);
  const T0=[meta(0,3,str(C.title||"MDFM")),meta(0,81,[us>>>16&255,us>>>8&255,us&255]),meta(0,88,[num,Math.round(Math.log2(den)),24,8])];
  if(C.text) T0.push(meta(0,1,str(C.text)));
  const tracks=[trk(T0)], names=[...new Set(C.ev.map(e=>e.tr))].sort((a,b)=>MIDI_ORDER.indexOf(a)-MIDI_ORDER.indexOf(b)); let ch=0;
  for(const nm of names){ const drum=nm==="Drums"; let c=9; if(!drum){ if(ch===9) ch++; c=ch++; } const evs=[meta(0,3,str(nm))];
    if(!drum) evs.push([0,1,[192|c,(MIDI_PROG[C.station]||MIDI_PROG.mdfm)[nm]??0]]);
    const open={};   // one sounding note per pitch: a repeat cuts the one before
    const notes=[]; for(const e of C.ev) if(e.tr===nm) for(const m of e.m){ if(m<0||m>127) continue; notes.push([tk(e.t),Math.max(tk(e.t)+(drum?60:10),tk(e.t+e.d)),m,e.vel]); }
    notes.sort((a,b)=>a[0]-b[0]);
    for(const [on,off,m,v] of notes){ const p=open[m]; if(p&&p.off>on){ p.off=on; } const n={on,off,m,v}; open[m]=n; n.ref=n; evs.push(n); }
    const fin=[]; for(const x of evs){ if(Array.isArray(x)){ fin.push(x); continue; } if(x.off<=x.on) x.off=x.on+1; fin.push([x.on,1,[144|c,x.m,x.v]],[x.off,0,[128|c,x.m,0]]); }
    tracks.push(trk(fin)); }
  const h=[77,84,104,100,0,0,0,6,0,1,0,tracks.length,PPQ>>>8,PPQ&255], all=new Uint8Array(h.length+tracks.reduce((a,t)=>a+t.length,0)); all.set(h,0); let o=h.length; for(const t of tracks){ all.set(t,o); o+=t.length; }
  return all; }
function midiStart(station,t0,end,o={}){ MIDICAP={station,t0,end,ev:[],...o}; }
// a Save takes its capture right after starting the render (so the live station never adds to it); the render's slices keep
// filling it (1.25), and the file is written once the render is done
function midiTake(){ const C=MIDICAP; MIDICAP=null; midiDepth=0; return C; }
function midiOut(C){ if(!C||!C.ev.length) return null; try{ return midiFile(C); }catch(e){ return null; } }
/* ---------- the stations (1.25): one entry each, MDFM included ----------
   ok: it can play here; on(t,cold): start it (cold: from SOUND, else tuned to); off(fade): tune away, fading; kill: drop
   everything at once (the speaker watchdog's fresh context); skip; spot(kind): the "now" button (an ID, a tag, a break);
   render: Save; types / setTypes: its "what plays" switches; beat: {t0, beat} of the music on air, for the effects and tags. */
const pickTypes=(obj,list)=>t=>{ for(const [k] of list) if(t&&k in t) obj[k]=!!t[k]; };
const songsBeat=L=>{ if(L&&L.length){ const s=L.find(x=>!x.handed)||L[L.length-1]; if(s&&s.barT0!=null) return {t0:s.barT0,beat:s.sp*4}; } return null; };
const STN={
  mdfm:{ ok:()=>true,
    on(t,cold){ if(cold){ if(!songs.length){ startSong(t+.1,0); lastSpot=t-999; } } else { fadeTo(musicDuck.gain,1,.3,t); startSong(t+.3,0); lastSpot=t; } clearInterval(timer); timer=setInterval(tick,40); tick(); },
    off(fade,t){ clearInterval(timer); timer=0; fadeTo(musicDuck.gain,.0001,fade,t); const old=songs, b=bed; songs=[]; bed=null;
      setTimeout(()=>{ for(const x of old) try{ x.bus.disconnect(); x.rvf.disconnect(); }catch(e){} if(b){ b.stopped=true; try{ b.bus.disconnect(); }catch(e){} } },1500); },
    kill(){ clearInterval(timer); for(const s of songs) try{ s.bus.disconnect(); }catch(e){} songs=[]; bed=null; },
    skip:()=>mdfmSkip(), spot:k=>spot(k), render:()=>renderMdfm(), types:TYPES, setTypes(t){ for(const k of TYPE_KEYS) if(t&&k in t) TYPES[k]=!!t[k]; }, beat:()=>songsBeat(songs) },
  wybc:{ ok:()=>!!AMB(), on:()=>wybcOn(), off:f=>wybcOff(f),
    kill(){ clearTimeout(wybcT); if(amb){ try{ amb.inst.stop(); }catch(e){} amb=null; } ambIn=null; },
    skip(){ if(on&&amb){ const a=amb; amb=null; ambRetire(a,4); ambStart(4); } }, spot:()=>wybcId(true), render:()=>renderWybc(), types:wybcTypes,
    setTypes(t){ pickTypes(wybcTypes,STATION_TYPES.wybc)(t); if(amb){ const m=ambSettings(); for(const k in m) try{ amb.inst.set(k,m[k]); }catch(e){} } }, beat:()=>null },
  ptlk:{ ok:()=>!!TALK, on:()=>ptlkOn(), off:()=>ptlkOff(), kill(){}, skip:()=>ptlkSkip(), spot:()=>ptlkId(), render:async()=>null, types:ptlkTypes, setTypes:pickTypes(ptlkTypes,STATION_TYPES.ptlk), beat:()=>null },
  hearye:{ ok:()=>typeof createFaire==="function", on:()=>fairOn(), off:()=>fairOff(),
    kill(){ if(fair){ fair.dead=true; clearTimeout(fair.t); clearTimeout(fair.pt); if(fair.amb) fair.amb.dead=true; fair=null; } },
    skip:()=>fairSkip(), spot:()=>fairId(), render:()=>renderHearye(), types:fairTypes, setTypes(t){ pickTypes(fairTypes,STATION_TYPES.hearye)(t); fairSetTypes(); }, beat:()=>null },
  ptrn:{ ok:()=>true, on:()=>ptrnOn(), off:f=>ptrnOff(f),
    kill(){ if(ptrn){ clearInterval(ptrn.timer); ptrn=null; } ptrnIn=null; },
    skip:()=>ptrnSkip(), spot:()=>ptrnTagNow(), render:()=>renderPtrn(), types:ptrnTypes, setTypes:pickTypes(ptrnTypes,STATION_TYPES.ptrn), beat:()=>songsBeat(ptrn&&ptrn.songs) },
  cluk:{ ok:()=>!!CLUKW, on:()=>clukOn(), off:f=>clukOff(f),
    kill(){ if(cluk){ cluk.dead=true; clearTimeout(cluk.t); clearInterval(cluk.timer); if(cluk.bed) clearTimeout(cluk.bed.t); cluk=null; } clukIn=null; },
    skip:()=>clukSkip(), spot:()=>clukId(), render:()=>renderCluk(), types:clukTypes, setTypes:pickTypes(clukTypes,STATION_TYPES.cluk), beat:()=>songsBeat(cluk&&[cluk.rave&&cluk.rave.s,cluk.song].filter(Boolean)) },
};
const STN_IDS=["mdfm","wybc","ptlk","hearye","ptrn","cluk"];
for(const id of STN_IDS) STN[id].id=id;
if(STATIONS.some(s=>s.id===opts.station)&&stationOk(opts.station)) station=opts.station;   // the station SOUND starts on (CLUK too: it joins STATIONS after the old check ran)
// "Save song" on each station: the song (or piece) on air, rendered again from the top: {buffer, midi, info}, or null
async function renderPtrn(){ const L=ptrn?ptrn.songs:[], live=L.find(x=>!x.handed&&nowPlaying&&x.title===nowPlaying.title)||L.find(x=>!x.handed)||L[L.length-1]; if(!live) return null;
      const sp=gOn("ptrn","bpm")?15/GRV.ptrn.bpm:live.sp0||live.sp, secs=Math.min(900,live.bars*16*songSp("ptrn",live)*meterRatio(live)+3);   // 1.25: as long as it plays with the style matrix's tempo pull
      const info=gFacts({station:"ptrn",stationName:"PTRN 101.1",title:live.title,artist:live.artist,style:live.genre,bpm:Math.round(15/sp),...songFacts(live)});
      const tags=ptrnTypes.tags&&ptrn?[...ptrn.ready.filter(x=>x.kind==="song"&&x.sid===live.title),...ptrn.ready.filter(x=>x.kind==="id")].slice(0,3):[];
      midiStart("ptrn",.05,secs,{bpm:15/sp,time:songMeter(live)||"4/4",title:info.title,text:`PTRN 101.1. ${info.style}, ${info.key}. ${info.artist}`});
      const pr=renderOffline("ptrn",secs,{recipe:live.recipe,tags}), cap=midiTake(), buffer=await pr, midi=midiOut(cap); return {buffer,midi,info}; }
async function renderHearye(){ const p=fair&&(fair.piece?fair.piece.p:fair.last); if(!p) return null;
      const info=gFacts({station:"hearye",stationName:"HEARYE 95.5",title:p.title,artist:p.artist,style:p.name,bpm:p.bpm,key:`${NOTE_NAMES[p.key%12]} ${p.mode}`}), S=p.S;
      const time=S.sub===3?`${S.beats*3}/8`:gOn("hearye","meter")&&S.beats===4?GRV.hearye.meter:`${S.beats}/4`;
      midiStart("hearye",.1,1e9,{bpm:60/(2*p.st),time,title:info.title,text:`HEARYE 95.5. ${info.style}, ${info.key}. ${info.artist||""}`});
      const pr=renderFaire(p), cap=midiTake(), buffer=await pr, midi=midiOut(cap); return {buffer,midi,info}; }
async function renderWybc(){ if(!nowPlaying||nowPlaying.station!=="wybc") return null; const info=gFacts({...nowPlaying,stationName:"WYBC 88.1"});
      midiStart("wybc",.3,1e9,{bpm:50*(wybcPull().tempo||1),time:"4/4",title:info.title,text:`WYBC 88.1. Ambient piano${gOn("wybc","key")?", "+gKeyName("wybc",2,"major"):", D major"}. ${info.artist||""}`});
      const pr=renderAmbient(Math.round(150*gLenMul("wybc"))), cap=midiTake(), buffer=await pr, midi=midiOut(cap); return buffer&&{buffer,midi,info}; }
async function renderMdfm(){
    const live=[...songs].reverse().find(x=>x.recipe&&nowPlaying&&x.title===nowPlaying.title)||[...songs].reverse().find(x=>x.recipe);
    if(!live) return null; const secs=Math.min(900,live.bars*16*(gOn("mdfm","bpm")?15/GRV.mdfm.bpm:live.sp)*meterRatio(live)+3);
    const info=gFacts({title:live.title,style:live.name,bpm:live.bpm,...songFacts(live)});
    midiStart("mdfm",.05,secs,{bpm:gOn("mdfm","bpm")?GRV.mdfm.bpm:15/live.sp,time:songMeter(live)||"4/4",title:info.title,text:`MDFM 99.9 HD. ${info.style}, ${info.key}`});
    const pr=renderOffline("current",secs,{recipe:live.recipe,bars:live.bars,brk2:live.brk2,ride:live.ride}), cap=midiTake(), buffer=await pr, midi=midiOut(cap);
    return {buffer,midi,info}; }
function setOn(v){
  if(v===on) return; on=v; gen++;
  if(v){ iosPlayback(true); primeSpeech(); if(!ctx) init(opts.audioContext); try{ const pr=ctx.resume(); if(pr&&pr.catch) pr.catch(()=>{}); }catch(e){} watchAudio(); const t=ctx.currentTime; fadeTo(master.gain,(opts.volume??1)*VOL,.4,t);
    if(bed){ bed.stopped=true; try{ bed.bus.disconnect(); }catch(e){} bed=null; } fadeTo(musicDuck.gain,1,.3,t);   // restarted before the stop finished: the old break is gone
    if(!stationOk(station)) station="mdfm"; clearInterval(timer); timer=0; STN[station].on(t,true);
    fxApply(true); mxFxSync(station,ctx.currentTime); }   // 1.25: saved effects and the style matrix's sound, on a new (or rebuilt) context
  else if(ctx){ iosPlayback(false); recStop(true); for(const id of STN_IDS) if(id!=="mdfm") STN[id].off(.3); const t=ctx.currentTime; fadeTo(master.gain,0,.3,t); clearInterval(timer);   // MDFM's songs stay a moment (below), so a quick SOUND off and on carries on try{speechSynthesis.cancel();}catch(e){} try{ voiceSrc&&voiceSrc.stop(); }catch(e){} speaking=false;
    const c=ctx,md=musicDuck; setTimeout(()=>{ if(!on){ for(const s of songs) try{s.bus.disconnect();}catch(e){} songs=[]; if(bed){ try{bed.bus.disconnect();}catch(e){} bed=null; } fadeTo(md.gain,1,.01,c.currentTime); c.suspend(); } },400); }
  emit(v?"start":"stop");
}
const N=19,outB=new Float32Array(N),edges=[]; for(let i=0;i<=N;i++) edges.push(42*Math.pow(15000/42,i/N));
function getSpectrum(){
  if(!on||!ctx) return null;
  analyser.getByteFrequencyData(freq); const hz=ctx.sampleRate/analyser.fftSize;
  for(let b=0;b<N;b++){ const nb=freq.length,a=Math.min(nb-1,Math.floor(edges[b]/hz)),z=Math.min(nb,Math.max(a+1,Math.floor(edges[b+1]/hz))); let sum=0,mx=0; for(let k=a;k<z;k++){ sum+=freq[k]; if(freq[k]>mx) mx=freq[k]; }
    const v=(sum/(z-a)*.5+mx*.5)/255; outB[b]=Math.min(1,Math.pow(v,1.1)*1.1*(1+b/N*.8+Math.pow(b/N,3)*6)+(b>=5&&b<=12?voicePulse*R()*.35:0)); }
  voicePulse*=.86; return outB;
}
// Per-channel RMS in dBFS for meters. Speech runs outside Web Audio, so a voice adds a little to keep needles alive.
const lv=[-90,-90];
function getLevels(){
  if(!on||!ctx||!vuA) return null;
  for(let c=0;c<2;c++){ vuA[c].getFloatTimeDomainData(vuBuf); let s=0; for(let i=0;i<vuBuf.length;i++) s+=vuBuf[i]*vuBuf[i];
    const rms=Math.sqrt(s/vuBuf.length)+(voicePulse>.05?voicePulse*.08*(.6+R()*.4):0); lv[c]=20*Math.log10(rms+1e-9); }
  return lv;
}
/* Save renders in slices (1.25). Chromium pulls every scheduled node on every 128-frame quantum, started or not, so laying
   a whole song out before startRendering() cost O(notes x time): a 2-minute Save took 4x longer than it needed to. Every
   kind now gives a fill(until) that schedules what starts before `until`; it runs for the first few seconds now, then from
   oc.suspend() every OFF_SLICE seconds, a little ahead, with the render's globals (and the Save's MIDI capture) swapped in
   and the live station's put back after. Without suspend() (an old browser, the node tests' fake) it fills everything up front. */
const OFF_SLICE=2, OFF_AHEAD=3;
const offGet=()=>({ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,GTR,UW,TONE,voiceIn,extDuck,recIn,ST,mixOut,mxIn,mxDst,ambIn,ptrnIn,ptrnRv,clukIn,clukRv,mxBarT0,mxBarSt,mxBarSteps,MIDICAP});
const offPut=o=>{ ({ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,GTR,UW,TONE,voiceIn,extDuck,recIn,ST,mixOut,mxIn,mxDst,ambIn,ptrnIn,ptrnRv,clukIn,clukRv,mxBarT0,mxBarSt,mxBarSteps,MIDICAP}=o); };
// a song's steps as a fill; fade: the end fade (PTRN, CLUK, the song on air), laid down when the last step is
const songFill=(s,secs,fade)=>u=>{ while(s.next<Math.min(u,secs-.1)&&s.step<s.bars*16){ s.next+=mStep(s,s.next,true); s.step++; }
  if(fade&&!s.faded&&(s.step>=s.bars*16||s.next>=secs-.1)){ s.faded=1; const end=Math.min(secs-.05,s.next+2.6); master.gain.setValueAtTime(VOL,Math.max(.1,end-2.4)); master.gain.linearRampToValueAtTime(0,end); } };
async function renderOffline(kind,secs,arg){
  const keep=offGet();   // the live station's globals (and MIDICAP: the Save's MIDI capture, if one was started)
  const oc=new OfflineAudioContext(2,Math.floor(44100*secs),44100), SL=typeof oc.suspend==="function"&&secs>OFF_AHEAD+1;
  const lim=k=>!SL||k+OFF_AHEAD>=secs-3.2?secs:k+OFF_AHEAD;   // near the end, everything left (end fades need a couple of seconds' notice)
  let rendering, fill=null, off=null;
  try{ init(oc); master.gain.value=VOL;
  let fxS=null;
  if(kind==="song"){ const s=fxS=setupSong(makeSong(arg),.05,0); if(ride) rideOn(s); fill=songFill(s,secs,false); fill(lim(0)); }
  else if(kind==="ptrn"){   // a PTRN track: from its recipe (Save), or a fresh one in a genre (tests); with the tags it had ready
    ptrnIn=null; const s=fxS=setupSong(arg&&arg.recipe?{...arg.recipe}:makeSong(arg&&arg.style||null,ptrnPool(),[]),.05,0,pDest(),ptrnRv,"ptrn"); s.sp0=s.sp; s.swing0=s.swing;
    fill=songFill(s,secs,true); fill(lim(0));
    const beat=(gOn("ptrn","bpm")?15/GRV.ptrn.bpm:s.sp0)*4, bar=beat*4*meterRatio(s), tags=(arg&&arg.tags)||[];
    tags.slice(0,3).forEach((it,k)=>{ const at=.05+bar*[1,Math.max(2,s.sections[Math.min(2,s.sections.length-1)].start),Math.max(3,s.bars-6)][k]; if(at<secs-3) try{ ptrnTagPlay(s,at,it,beat,k===0?"hype":null,null); }catch(e){} }); }
  else if(kind==="cluk"){   // a CLUK song: from its recipe (Save), or a fresh one in a genre (tests and level checks)
    clukIn=null; const s=fxS=setupSong(arg&&arg.recipe?{...arg.recipe}:makeSong(arg&&arg.style||null,clukPool(),[]),.05,0,cDest(),clukRv,"cluk"); s.sp0=s.sp; s.swing0=s.swing;
    if(arg&&arg.from) s.step=arg.from*16;
    fill=songFill(s,secs,true); fill(lim(0)); }
  else if(kind==="ccue"){ clukIn=null; const t=.1;   // CLUK show music, for tests and level checks
    if(arg.cue==="bed"){ const rec=cRec(arg.style), vs=(rec.sections.find(x=>x.kind==="verse")||rec.sections[0]).start, s=cSong(rec,t,.15*(rec.st.lvl||1)); let b=0;
      fill=u=>{ while(s.next<Math.min(u,secs-1)){ s.step=(vs+b%4)*16; const e=s.step+16; while(s.step<e){ s.next+=mStep(s,s.next,true); s.step++; } b++; } }; fill(lim(0)); }
    else cCue(arg.style,arg.cue,t); }
  else if(kind==="bed"){ const b=startBed(.05); if(arg!=null) b.def=BEDS[arg];
    fill=u=>{ while(b.next<Math.min(u,secs-2.5)){ playBed(b,b.next); b.step++; b.next+=b.sp; } if(!b.ended&&b.next>=secs-2.5){ b.ended=1; endBed(b,secs-2.4); } }; fill(lim(0)); }
  else if(kind==="sting"){ STINGS[arg](.1); }
  else if(kind==="current"){   // the song on air, from the top, as written (and as long as it runs now, Let It Ride included)
    const s=fxS=setupSong({...arg.recipe},.05,0); s.bars=arg.bars; if(arg.brk2!=null) s.brk2=arg.brk2; s.ride=!!arg.ride;
    fill=songFill(s,secs,true); fill(lim(0)); }
  else if(kind==="sfx"){ const f=OT[arg]||ORGAN[arg]; if(f) f(otBus(),.05); }
  else if(kind==="voicetest"){   // a speech-like test signal, dry or through the caller phone line, for level checks
    const dst=arg&&arg.phone?phoneLine():voiceIn, o=osc("sawtooth",120),lfo=osc("sine",3),lg=G(12),am=G(0),mix=G(1); lfo.connect(lg); lg.connect(o.frequency);
    for(const [f,q,gg] of [[700,6,1],[1200,8,.6],[2600,10,.35]]){ const bp=filt("bandpass",f,q),bg=G(gg*3); o.connect(bp); bp.connect(bg); bg.connect(mix); }
    const n=nz(.05,secs),hp=filt("highpass",4000),ng=G(.05); n.connect(hp); hp.connect(ng); ng.connect(mix);
    mix.connect(am); am.connect(dst); for(let t=.1;t<secs-.3;t+=.25){ am.gain.setValueAtTime(.0001,t); am.gain.linearRampToValueAtTime((arg&&arg.amp)||.5,t+.04); am.gain.linearRampToValueAtTime(.0001,t+.22); }
    o.start(.05); lfo.start(.05); o.stop(secs); lfo.stop(secs); }
  else if(kind==="ptmusic"){ const S=PT[arg.style]||PT.news, k=S.key;   // PTLK show music, for tests and checks
    const gn=PT_GAIN[arg.style]??1;
    const SS=ptS(S);   // with TUNE's groove and key, as on air
    if(arg.cue==="theme") S.theme.call(SS,ptBus(gn,k,S.minor),.1,k); else if(arg.cue==="outro") S.outro.call(SS,ptBus(gn,k,S.minor),.1,k);
    else if(arg.cue==="bed"){ const b=ptBus(.3*(PT_BED_GAIN[arg.style]??1),k,S.minor); let t=.1,bar=0;
      fill=u=>{ while(t<Math.min(u,secs-1.5)){ if(GON.ptlk) b.gGrid={t0:t,st:SIX(SS.bpm),n:16,bar};
        const d=S.bed.call(SS,b,t,bar,k); if(GON.ptlk) gPump("ptlk",b,t,d,bar,false); bar++; t+=d*(gOn("ptlk","meter")?METERS[GRV.ptlk.meter].ratio:1); } }; fill(lim(0)); }
    else S.stings[arg.i|0](ptBus(gn*(PT_STING_GAIN[arg.style]??1),k,S.minor),.1,k); }   // a show's sound effect, for episode exports
  else if(kind==="fpiece"){ const p=fPiece(arg.style,arg.seed,arg.target), b=fBus(p.S.gain), f0=arg.from||0; b.mxId="hearye"; b.gKey={root:p.key,sc:p.sc}; b.gNoMeter=p.S.sub===3||p.S.beats!==4; let t=.1, i=f0, A=null;   // a HEARYE piece, from its seed, with its ambience (from: a bar to start at, for checks)
    fill=u=>{ for(;i<p.bars&&t<Math.min(u,secs);i++){ fBar(p,i,t,b); t+=p.bs; } if(A) ambRun(A,Math.min(u,secs-.3)); }; fill(lim(0));
    for(const x of p.secs) if(x.at>=f0) b.gain.gain.setTargetAtTime(p.S.gain*SEC_GAIN[x.t==="outro"?0:x.lvl],.1+(x.at-f0)*p.bs,.8);
    if(arg.amb!==false){ A=ambNew(p.S.scene,p.key); A.out.gain.setValueAtTime(.0001,0); A.out.gain.linearRampToValueAtTime(A.sg*ambMul(),2.5); for(const x of p.secs) if(x.at>=f0) A.out.gain.setTargetAtTime(A.sg*ambMul()*AMB_SEC[x.t==="outro"?0:x.lvl],.1+(x.at-f0)*p.bs,1); ambRun(A,Math.min(lim(0),secs-.3)); }
    master.gain.setValueAtTime(VOL,Math.max(.2,secs-2)); master.gain.linearRampToValueAtTime(0,secs-.05); }
  else if(kind==="fcue"){ const p=fCueP(arg.style), gn=F_CUE_GAIN[arg.style]??1;   // HEARYE show music, for tests and level checks
    if(arg.cue==="bed"){ const b=fBus(.16*gn*(F_BED_GAIN[arg.style]??1)); let t=.1, k=0; fill=u=>{ while(t<Math.min(u,secs-1)){ p.S.bar(p,t,{b,st:p.st,bs:p.bs,lvl:2,i:k%8,n:8,ch:fch(p,p.progA[k%4]),sec:"A",bed:true,lead:()=>{}}); t+=p.bs; k++; } }; fill(lim(0)); }
    else if(arg.cue==="sting"&&arg.i!=null) F_STINGS[arg.i](p,fBus(gn*F_STING_GAIN[arg.i]),.1); else fCue(arg.style,arg.cue,.1); }
  else if(kind==="wybc"){ const L=AMB(); ambIn=G(AMB_LEVEL); ambIn.connect(ST.in);   // a WYBC piece through the whole chain (TUNE and the style matrix included), for Save
    const sh=MXON.wybc?MXP.wybc:null, rs=sh&&sh.top.length?wybcRS():null;
    const inst=L.create({context:oc,destination:ambIn,offline:true,mapNote:wybcMapNote,onNote:(k,m,t,d,v)=>{ const C=MIDICAP; if(!C) return; const ns=(Array.isArray(m)?m:[m]).map(x=>Math.round(wybcMapNote(x)));
      C.ev.push({tr:k==='piano'?'Piano':k==='strings'?'Strings':'Winds',m:ns,t,d:Math.max(.05,Math.min(12,d)),vel:Math.max(1,Math.min(127,Math.round(k==='piano'?20+v/.13*85:70)))}); },settings:{...ambSettings(),...wybcPull()},onChord:rs?(t,x,bar)=>{ const ch=wybcTriad(x); for(let i=0;i<4;i++) wybcRhythm(rs,t+i*bar/4,bar/4,ch,sh); }:null});
    inst._scheduleAll(secs,true,lim(0)); if(inst._scheduleTo){ fill=u=>inst._scheduleTo(Math.min(u,secs)); } }   // the vendored generator lays the piece out in slices too (its MDFM patch)
  else if(kind==="famb"){ const A=ambNew(arg.scene,62); A.out.gain.value=A.sg*ambMul(); fill=u=>ambRun(A,Math.min(u,secs-.2)); fill(lim(0)); }
  if(fxIsOn()&&!BYP){ const F=fxBuild(); fxInPath(F,true); fxLevels(F,true); fxBeat(.05,fxS?fxS.sp*4:.5,true); }   // TUNE's effects, as they are live (1.25: without fxApply, which touched the live stage's timer)
  { const id=kind==="fpiece"?"hearye":kind==="current"||kind==="song"?"mdfm":kind==="wybc"?"wybc":kind==="ptrn"?"ptrn":kind==="cluk"?"cluk":null;   // the style matrix's sound (drive, lo-fi, hall, slap, phaser...) as it is live
    if(id&&MXON[id]){ mxFx(); mxFxLevels(id,0,true); } }
  if(fill&&SL&&lim(0)<secs){ off=offGet(); const f=fill;
    for(let k=OFF_SLICE;k<secs-.05;k+=OFF_SLICE){ const u=lim(k); oc.suspend(k).then(()=>{ const live=offGet(); offPut(off);
      try{ if(!f.done){ f(u); if(u>=secs) f.done=1; } }catch(e){} finally{ off=offGet(); offPut(live); oc.resume(); } }).catch(()=>{}); if(u>=secs) break; } }
  rendering=oc.startRendering(); }finally{ offPut(keep); }   // restore before the await: the live station keeps ticking meanwhile
  return await rendering;
}
// ORIGINAL (1.25 E3): the matrix, groove and key, effects and EQ step aside (their settings are held) until it's let go
function setBypass(v){ v=!!v; if(v===!!BYP) return v;
  if(v){ BYP={mx:{...MXON},mp:{...MXP},g:{...GON}}; for(const k in MXON) MXON[k]=false; for(const k in MXP) MXP[k]=null; for(const k in GON) GON[k]=false; }
  else { const b=BYP; BYP=null; Object.assign(MXON,b.mx); Object.assign(MXP,b.mp); Object.assign(GON,b.g); }
  fxApply(true);
  if(ctx){ if(v){ clearTimeout(mxOffT); mxOffT=0; mxFxOff(); } else mxFxSync(station,ctx.currentTime); applyTone(); }
  if(station==="wybc"){ wybcMixApply(); wybcMixPump(); }
  emit("bypass",v); return v; }
function mxPlanInfo(id){ const m=mixOf(id), P=BYP?BYP.mp[id]:MXP[id], L=lanesOf(id), out={id,w:mixZero(),sum:0,scaled:false,roles:{},stages:{},lanes:{...L},bypass:!!BYP};
  if(!P) return out; Object.assign(out.w,P.w); out.sum=P.sum; out.scaled=P.scaled;
  for(const [r,x] of Object.entries(P.roles)) if(x.sg>.001||x.sw||x.og<.999) out.roles[r]=x.dir;
  for(const k of P.top){ const w=P.w[k]; out.stages[k]={feel:mxSS(.05,.5,w)*L.groove,drums:mxSS(.15,.45,w)*L.drums,groove:mxSS(.25,.6,w)*L.groove,keys:mxSS(.3,.9,w)*L.keys,bass:w*L.bass>=.5,lead:w*L.lead>=.7,tempo:MXD[k].tempo?mxSS(.5,1,w)*L.tempo:0,fx:mxSS(0,.6,w)*w*L.fx}; }
  const np=nowPlaying; if(np&&(np.station||"mdfm")===id&&+np.bpm>0) out.tempoMul=mxTempoMul(id,+np.bpm); return out; }   // nowPlaying holds the song's own tempo
/* _mxCal(dir, role): the level hook behind MX_TRIM. Four bars of a reference pattern (kick and snare on a 4/4 grid, hats
   in 8ths, a I-vi-IV-V bass at 33-45, triads at 55-70 in half notes, a scale run for the lead) through the station's usual
   instrument for that part and through the direction's, each rendered dry; K-weighted RMS (+4 dB above 1.5 kHz, and a
   30 Hz high-pass like the master's: a 60 Hz one hides the 808's weight). Returns {dir, role, ref, sub, delta, peak, trim} (dB; trim = 10^(-delta/20), capped so the peaks stay within 3 dB of the
   reference's: what MX_TRIM holds). */
const MX_REF={kick:(s,t,v)=>D.kick(s,t,v,1),snare:(s,t,v)=>D.snare(s,t,v,.24,1),clap:(s,t,v)=>D.clap(s,t,v),hat:(s,t,v)=>D.hat(s,t,v,false),perc:(s,t,v)=>D.rim(s,t,v),shaker:(s,t,v)=>D.shaker(s,t,v),
  tom:(s,t,v)=>D.tom(s,t,v),crash:(s,t,v)=>D.crash(s,t,v),bass:(s,t,v,m,d)=>M.bass(s,t,m,d,v),chord:(s,t,v,m,d,n)=>M.rhodes(s,t,n,d,v*.9),gchord:(s,t,v,m,d)=>M.guitar(s,t,m,d,v),
  pad:(s,t,v,m,d,n)=>M.pad(s,t,n,d,.8*v,1000),lead:(s,t,v,m,d)=>M.pluck(s,t,m,d,v*1.25)};
// any wrapped instrument, called the way its part is (for {orig}: how loud it is against the part's reference)
function mxOrigCall(nm){ const [on,n]=nm.split("."), map=MX_ROLE[on], e=map&&map[n]; if(!e) return null; const [role,vi]=e, f=({D,M,FI,PI})[on][n];
  if(n==="cowbell") return [role,(s,t,v)=>f(s,t,81,.08,v)]; if(n==="timp") return [role,(s,t,v)=>f(s,t,45,v)];
  if(MX_DRUM.includes(role)) return [role,(s,t,v)=>f(s,t,v)];
  if(role==="bass") return [role,vi===2?(s,t,v,m)=>f(s,t,m,v):(s,t,v,m,d)=>f(s,t,m,d,v)];
  if(role==="chord"||role==="pad") return [role,vi===2?(s,t,v,m,d,ns)=>f(s,t,ns,v):(s,t,v,m,d,ns)=>f(s,t,ns,d,v)];
  if(role==="gchord") return [role,(s,t,v,m,d)=>f(s,t,m,d,v)];
  return [role,vi===2?(s,t,v,m)=>f(s,t,m,v):(s,t,v,m,d)=>f(s,t,m,d,v)]; }
async function mxCal(dir,role,o={}){ if(o.orig){ const oc=mxOrigCall(o.orig); if(!oc) return null; role=oc[0]; }
  if(!o.orig&&(!MXD[dir]||!MX_REF[role])) return null; const fn=o.orig?null:mxFn(dir,role); if(!o.orig&&!fn) return {dir,role,ref:null,sub:null,delta:0,trim:1,none:true};
  const ocall=o.orig?mxOrigCall(o.orig)[1]:null;
  const secs=o.secs||8, bpm=o.bpm||100, sp=15/bpm, run=async which=>{ const keep=offGet(), oc=new OfflineAudioContext(2,Math.floor(44100*secs),44100); let r;
    try{ init(oc); const hs=filt("highshelf",1500); hs.gain.value=o.shelf??4; const hp=filt("highpass",o.hp||30,.7); hs.connect(hp).connect(oc.destination); const s=makeBus(hs,songRev); s.mxId=null; s.sp=sp; s.bpm=bpm; s.root=45; s.deg=d=>[0,2,3,5,7,8,10][((d%7)+7)%7]+12*Math.floor(d/7);
      const prog=[0,5,3,4], ev=[], D16=sp*16;
      for(let bar=0;bar<4;bar++){ const t0=.1+bar*D16, rt=33+[0,9,5,7][bar];   // I vi IV V
        if(role==="kick") for(const i of [0,8]) ev.push([t0+i*sp,1,i]); else if(role==="snare"||role==="clap") for(const i of [4,12]) ev.push([t0+i*sp,1,i]);
        else if(role==="hat"||role==="shaker") for(let i=0;i<16;i+=2) ev.push([t0+i*sp,i%4?.7:1,i]); else if(role==="perc") for(const i of [3,6,11,14]) ev.push([t0+i*sp,.9,i]);
        else if(role==="tom") for(const i of [12,13,14,15]) ev.push([t0+i*sp,.8,i]); else if(role==="crash"){ if(bar%2===0) ev.push([t0,1,0]); }
        else if(role==="bass") for(const i of [0,6,8,14]) ev.push([t0+i*sp,1,i,rt,sp*(i%8?2:5)]);
        else if(role==="lead") for(let i=0;i<16;i+=2) ev.push([t0+i*sp,1,i,69+[0,2,3,5,7,5,3,2][i/2]+(bar%2?2:0),sp*1.8]);
        else for(const i of [0,8]) { const r=rt+24, n=[r,r+([0,9,5,7][bar]===9?3:4),r+7].map(x=>pitch(x,55,70)).sort((a,b)=>a-b); ev.push([t0+i*sp,1,i,n[0],sp*7.5,n]); } }
      s.mxG={t0:.1,st:sp,n:16,bar:0}; s.mxRoot=45; s.mxCh=[57,60,64];
      inMorph=true; const r0=R; R=mxRand;
      try{ for(const [t,v,i,m,d,n] of ev){ s.mxG={t0:t-i*sp,st:sp,n:16,bar:0};
          if(which==="ref") MX_REF[role](s,t,v,m,d,n); else if(ocall) ocall(s,t,v,m,d,n||(m!=null?[m]:null));
          else { let I={t,pos:i,bar:0,w:1,open:false,dur:d||.3,m,notes:n||(m!=null?[m]:null)}; if(I.notes&&role!=="lead"&&role!=="bass") I.notes=mxFoldCh(s,dir,role,I.notes); if(I.m!=null&&(role==="lead"||role==="bass")){ I.m=mxFold(s,dir,role,I.m); I.notes=[I.m]; }
            if(role==="gchord"){ I.notes=mxFoldCh(s,dir,role,[m,m+7,m+12]); } fn(s,I,v); } } }
      finally{ inMorph=false; R=r0; }
      r=await oc.startRendering(); }finally{ offPut(keep); }
    let q=0, pk=0; for(let c=0;c<2;c++){ const d=r.getChannelData(c); for(let i=0;i<d.length;i++){ q+=d[i]*d[i]; const a=Math.abs(d[i]); if(a>pk) pk=a; } } return [10*Math.log10(q/(2*r.length)+1e-20),20*Math.log10(pk+1e-12)]; };
  const [ref,rp]=await run("ref"), [sub,sp2]=await run("sub"), delta=sub-ref, pkD=sp2-rp, trim=Math.min(Math.pow(10,-delta/20),Math.pow(10,(3-pkD)/20));   // level-matched, but never peaking more than 3 dB over what it replaces
  return {dir,role,orig:o.orig||null,ref:+ref.toFixed(2),sub:+sub.toFixed(2),delta:+delta.toFixed(2),peak:+pkD.toFixed(2),trim:+trim.toFixed(3)}; }
const mxOrigList=()=>Object.entries(MX_ROLE).flatMap(([on,map])=>Object.keys(map).map(n=>on+"."+n));
coreWarm(44100);   // Save renders at 44.1 kHz: its cymbal cores are ready long before the first Save (1.25)
return {
  version: VERSION,
  start(){ setOn(true); },
  stop(){ setOn(false); },
  toggle(){ setOn(!on); return on; },
  isOn(){ return on; },
  skip(){ STN[station].skip(); },
  spotNow(kind){ STN[station].spot(kind); },
  setDuck(v){ v=Math.max(0,Math.min(1,+v)); if(!Number.isFinite(v)) return; duckLevel=v; if(ctx&&extDuck){ const t=ctx.currentTime; extDuck.gain.cancelScheduledValues(t); extDuck.gain.setTargetAtTime(Math.max(v,0),t,v<1?.08:.35); } },   // 0..1 over everything (music and DJ), eased
  setProviders(p){ for(const k of ["weather","sports","news","tts","cannedFallback","headlines"]) if(k in p) opts[k]=p[k]; wxCache=spCache=null; },   // kind optional: "weather" | "sports"
  stingNow(){ voiceSting(); },
  voices(){ return HAS_TTS?speechSynthesis.getVoices().map(v=>v.name+" ("+v.lang+")"):[]; },
  setSpots(v){ spotsOn=!!v; },
  getSpots(){ return spotsOn; },
  /* 1.26 mobile mix: see setLite in the engine; MIX calls it while it's open on a phone or tablet */
  setLite(v){ setLite(v); },
  isLite(){ return LITE; },
  prewarmMix(){ prewarmMix(); },
  _cullTest(v){ CULL_TEST=!!v; },
  /* 1.27: scheduler health for the performance readout (counts since the last call when reset is true) */
  perfStats(reset){ const o={...PERF,ahead:AHEAD(),lite:LITE,state:ctx?ctx.state:"none",sampleRate:ctx?ctx.sampleRate:0,baseLatency:ctx&&ctx.baseLatency||0,outputLatency:ctx&&ctx.outputLatency||0};
    if(reset){ PERF.steps=0; PERF.late=0; PERF.tight=0; PERF.minLead=9; } return o; },   // tests and the bench only: apply LITE's blend culling to offline renders too
  setTone(t){ for(const k of ["low","mid","high"]) if(t&&k in t) eq[TONE_BAND[k]].gain=Math.max(-12,Math.min(12,+t[k]||0)); applyTone(); const o=getTone(); emit("tone",o); emit("eq",getEq()); return o; },   // dB, -12..+12: the EQ's LOW, MID 1 and HIGH gains (1.25)
  getTone(){ return getTone(); },
  getVolume(){ return opts.volume??1; },
  /* let it ride: the current song (and each next one while on) runs about two minutes, with a second breakdown and extra fills */
  setLetItRide(v){ ride=!!v; for(const s of songs) (ride?rideOn:rideOff)(s); },
  isLetItRide(){ return ride; },
  /* underwater: muffled, resonant, slowly drifting low-pass with a slight pitch wobble on the music (the voice is the system's speech, so it stays dry) */
  setUnderwater(v){ applyUnderwater(v); },
  isUnderwater(){ return underwater; },
  setTypes(t){ for(const k of TYPE_KEYS) if(t&&k in t) TYPES[k]=!!t[k]; },   // {ids, stingers, ads, interviews, callers, weather, sports, plays, arts, podcast, cooking, homerepair, garage, funnelball, showponies, technews, news}: false switches a kind off
  getTypes(){ return {...TYPES}; },
  sampleLines(kind,advance){ if(kind==="funnelball") return FB_OK()?funnelballLines():null; if(kind==="showponies") return SP_OK()?showPonyEpisode(!!advance).lines:null; if(kind==="technews") return techLines(); const s=showSpot(kind); return s&&s.lines; },   // for tests and previews
  setVolume(v){ v=volNum(v); if(v==null) return; opts.volume=v; if(ctx&&on) fadeTo(master.gain,v*VOL,.2,ctx.currentTime); },
  nowPlaying(){ return gFacts(nowPlaying); },
  getSpectrum,
  getLevels,
  thwack(){ if(!on||!ctx) return; const b=fxBus(false),t0=ctx.currentTime; D.snare(b,t0,1.3,.3,.8); D.clap(b,t0,.8,.2); D.tom(b,t0,.6,90); },
  on(ev,f){ (listeners[ev]=listeners[ev]||[]).push(f); return ()=>{ listeners[ev]=listeners[ev].filter(x=>x!==f); }; },
  nextSpotText(){ return nextSpot(); },
  renderOffline,
  /* "Save song": renders the song on air again, from the top, off the live audio path, and returns {buffer, info}. */
  async renderSong(){ return STN[station].render(); },   // talk (PTLK) saves as a recording (onAir / recordBreak), in the apps
  /* "Save" during a break: onAir() says what break is on now ({kind, show, episode, title, saveable}); recordBreak()
     resolves {buffer, info} when it ends (the whole break, recorded from its start), or null if none is on. */
  onAir(){ return station!=="wybc"&&REC&&REC.live?{...breakInfo(REC.sp),station,saveable:REC.voiced}:null; },
  recordBreak(){ const r=REC; if(!r||!r.live) return Promise.resolve(null); return new Promise((res,rej)=>r.waiters.push({res,rej})); },
  get audioContext(){ return ctx; },
  /* TUNE: the sound-tuning stage. All defaults = MDFM exactly as before. Values 0..1 (width 0.5 = untouched);
     roomType is studio | car | living | club | hall. Applies to every station and to Save. */
  setSound(s){ Object.assign(sound,cleanSound(s)); applySound(); return {...sound}; },
  getSound(){ return {...sound}; },
  resetSound(){ Object.assign(sound,SOUND_DEF); applySound(); return {...sound}; },
  soundDefaults(){ return {...SOUND_DEF}; },
  soundPresets(){ return SOUND_PRESETS.map(p=>({id:p.id,name:p.name,sound:{...SOUND_DEF,...p.s}})); },
  rooms(){ return Object.entries(ROOMS).map(([id,r])=>({id,name:r.name})); },
  /* Stations: WYBC 88.1 (ambient piano), MDFM 99.9 HD and PTLK 108.0 (talk). setStation / nextStation / prevStation switch live (or pick the
     one SOUND starts on); the "station" event says which is on. Each station has its own "what plays" switches. */
  stations(){ return STATIONS.map(x=>stationInfo(x.id)); },
  getStation(){ return stationInfo(station); },
  setStation(id){ return setStation(id); },
  nextStation(){ return stepStation(1); },
  prevStation(){ return stepStation(-1); },
  /* Style matrix (MIX, 1.25 E3): per-station pull 0..1 toward ten directions (rock, pop, dance, hiphop, lofi, space,
     orchestral, jazz, latin, country, clockwise from the top of the pad). All zero (the default) = the station exactly as it
     is. id defaults to the station on. Old saved values (classical, galactic, chaos) are taken and moved over. */
  styleMixKeys(){ return MIX_KEYS.map(x=>[...x]); },   // [id, LABEL, description, angle (degrees clockwise from the top)]
  styleDirections(){ return MX_ORDER.map(k=>({id:k,label:MXD[k].label,desc:MXD[k].desc,angle:MXD[k].ang,tempo:MXD[k].tempo?MXD[k].tempo.map(r=>[...r]):null})); },
  styleStages(){ return MX_STAGES.map(x=>({...x})); },
  styleLanes(){ return MX_LANES.map(x=>[...x]); },
  getStyleMix(id){ return {...mixOf(id||station)}; },
  setStyleMix(vals,id){ return setMix(id||station,vals); },
  resetStyleMix(id){ id=id||station; Object.assign(lanesOf(id),Object.fromEntries(MX_LANES.map(([k])=>[k,1]))); return setMix(id,mixZero()); },
  getStyleLanes(id){ return {...lanesOf(id||station)}; },
  setStyleLanes(l,id){ id=id||station; setMix(id,{lanes:l}); return {...lanesOf(id)}; },
  getStylePlan(id){ return mxPlanInfo(id||station); },   // what the matrix is doing now: effective weights, who owns each part, how far each stage has gone
  padToMix(x,y,ring){ return padToMix(x,y,ring); },   // pure: a pad point (x right, y down, radius 1) -> {w, amount, angle, dist, a, b, t}
  mixToPad(m,ring){ return mixToPad(m||mixOf(station),ring); },   // pure: weights -> {x, y, angle, dist, amount, custom}
  setStylePad(p,id){ p=p||{}; let x=+p.x||0, y=+p.y||0; if("angle" in p||"dist" in p){ const a=(+p.angle||0)*Math.PI/180, d=Math.max(0,Math.min(1,+p.dist||0)); x=d*Math.sin(a); y=-d*Math.cos(a); }
    const r=padToMix(x,y,p.ring??1); setMix(id||station,r.w); return r; },
  migrateStyleMix(rec){ const m=mxMigrate(rec), w={...mixZero(),...m.w}; return {v:2,w,lanes:{...Object.fromEntries(MX_LANES.map(([k])=>[k,1])),...(m.lanes||{})},glitch:m.glitch}; },
  /* GLITCH (1.25 E3, was the matrix's CHAOS): an effect on every station, 0..1 (0 = off): the FX key "glitch". */
  setGlitch(v){ return this.setFx({glitch:v}).glitch; },
  getGlitch(){ return fxv.glitch; },
  /* EQ (1.25 E3): {on, lc:{on,freq,slope}, ls:{freq,gain}, p1:{freq,gain,q}, p2:{freq,gain,q}, hs:{freq,gain}, hc:{on,freq,slope}};
     setEq takes any part of it. eqBands() gives the ranges; eqResponse(freqs[, band]) the curve in dB (Float32Array). */
  eqBands(){ return EQ_BANDS.map(b=>JSON.parse(JSON.stringify(b))); },
  eqDefaults(){ return eqDef(); },
  getEq(){ return getEq(); },
  setEq(v){ return setEq(v); },
  resetEq(){ return setEq(eqDef()); },
  eqBypass(v){ return setEq({on:!v}); },
  eqResponse(freqs,band){ return eqResponse(freqs,band); },
  /* ORIGINAL (1.25 E3): true = hear the station without the style matrix, the groove and key, the effects and the EQ (the
     settings are kept, and come back as they were on false). Sound (TUNE) stays. */
  setMixBypass(v){ return setBypass(v); },
  setBypass(v){ return setBypass(v); },
  isMixBypass(){ return !!BYP; },
  _mxCal(dir,role,o){ return mxCal(dir,role,o); },
  _mxOrigList(){ return mxOrigList(); },
  _mxTune(o){ if(o&&o.olv) Object.assign(MX_OLV,o.olv); if(o&&o.trim) for(const k in o.trim) Object.assign(MX_TRIM[k]||(MX_TRIM[k]={}),o.trim[k]); for(const id in MXP) if(MXP[id]) MXP[id]=mxPlan(id); return {olv:{...MX_OLV},trim:JSON.parse(JSON.stringify(MX_TRIM))}; },   // tests: level tables   // tests and calibration: a reference pattern through the usual instrument and the direction's
  /* Groove & key (TUNE), per station: bpm (0 = the song's own, else 40-220), meter ("" or "3/4" "6/8" "5/4" "7/8" "7/4"), swing,
     length (.5 = as written), root (-1 = the song's own, 0-11 = C..B), mode ("" or a keyModes() id), and the drums: density,
     fills, feel (0 half, .5 normal, 1 double time), humanize, drums (level). All 0..1 unless noted. Defaults = as before. */
  grooveKeys(){ return GROOVE_KEYS.map(x=>[x[0],x[1],x[2],{...(GROOVE_META[x[0]]||{}),def:GROOVE_UI[x[0]]}]); },   // [id, LABEL, tip, {type, min, max, def, song, group, captions, bipolar, unit, scale}]
  grooveKeyInfo(){ return GROOVE_KEYS.map(([id,label,tip])=>({id,label,tip,...(GROOVE_META[id]||{}),def:GROOVE_UI[id]})); },
  /* The music on air as written, before TUNE's groove and key: {key, time, bpm} (for "Song's own (6/8)" and the like). Null in talk. */
  songOwn(){ const n=nowPlaying; if(!n||(n.station||"mdfm")!==station||n.talk) return null; return {key:n.key||null,time:n.time||null,bpm:n.bpm||(station==="wybc"?50:null)}; },   // WYBC's piano: a step a beat at 50 BPM
  _tuneState(){ return {matrix:{...MXON},groove:{...GON},stages:ctx&&MXF.get(ctx)?MXF.get(ctx).length:0,bypass:!!BYP,eqRoute:TONE?TONE.rk||"":null}; },   // for tests
  grooveDefaults(){ return {...GROOVE_UI}; },
  keyModes(){ return KEY_MODES.map(([id,name])=>({id,name})); },
  meters(){ return Object.keys(METERS); },
  grooveSupport(id){ return {...(GSUP[id||station]||GSUP.mdfm)}; },
  getGroove(id){ return {...(GRAW[id||station]||GROOVE_UI)}; },
  setGroove(vals,id){ return setGroove(id||station,vals); },
  resetGroove(id){ return setGroove(id||station,GROOVE_UI); },
  stationTypeList(id){ return (STATION_TYPES[id]||[]).map(x=>[...x]); },   // PTRN's entries carry a third item: the genre's family
  /* Effects (TUNE, 1.22), on every station and in Save: echo, chorus, reverb, flange, phaser, warble, crush, drive, gate, pump
     (0..1, 0 = off) and filter (.5 = off, below: low-pass, above: high-pass). tapeStop() and spinBack() are one-shots. */
  /* Instruments (1.23): the pool MDFM 99.9 and PTRN 101.1 pick from. instrumentList() gives [key, label, category
     (kit, bass, keys, lead, pad), since ("classic" = MDFM before 1.22, "1.22" = came with PTRN, "1.23" = new)];
     setInstruments({key: false}) switches one off (from the next song). Everything off in a category: the genre's own. */
  instrumentList(){ return POOL.map(([k,l,c,s])=>[k,l,c,s]); },
  getInstruments(){ return Object.fromEntries(POOL.map(([k])=>[k,INSTR[k]!==false])); },
  setInstruments(v){ if(v&&typeof v==="object") for(const [k] of POOL) if(k in v) INSTR[k]=v[k]!==false; return this.getInstruments(); },
  fxKeys(){ return FX_KEYS.map(x=>[...x]); },
  fxDefaults(){ return {...FX_DEF}; },
  getFx(){ return {...fxv}; },
  setFx(v){ Object.assign(fxv,cleanFx(v)); fxApply(); emit("fx",{...fxv}); return {...fxv}; },
  resetFx(){ Object.assign(fxv,FX_DEF); fxApply(); emit("fx",{...fxv}); return {...fxv}; },
  tapeStop(){ return fxTapeTrick("stop"); },
  spinBack(){ return fxTapeTrick("spin"); },
  _fxState(){ const F=ctx&&FXW.get(ctx); return {on:fxIsOn(),inPath:!!(F&&F.inPath),tape:!!fxTape}; },   // for tests   // MDFM's own list is window.MDFM_TYPES / setTypes
  _clukRun(L){ if(cluk&&Array.isArray(L)){ gen++; hush(); cluk.n++; clukSongEnd(cluk,.5); clukRun(cluk,L); return true; } return false; },   // for tests: play these lines on CLUK now
  getStationTypes(id){ return {...(stn(id)||STN.mdfm).types}; },
  setStationTypes(id,t){ (stn(id)||STN.mdfm).setTypes(t); },
};
}
