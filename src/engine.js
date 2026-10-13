/* MDFM 99.9 HD: an in-browser radio station: hip hop, R&B, pop, dance and a DJ set.
   Everything is synthesized live with Web Audio: no audio files, no network, no credits.
   Usage: const radio = createMDFM(); button.onclick = () => radio.start();   (see README) */
import corePack from "./content/default.js";
export const VERSION = "__VERSION__";
export const STYLES = ["MELODIC DRILL","CHILL TRAP","PLUGGNB","SLOW JAM R&B","AFROSWING","LO-FI BOOM BAP","NEO-SOUL","AMAPIANO","CLOUD RAP","JAZZ HOP","CHILL PHONK","WEST COAST","GOTHIC DANCE POP","POP BALLAD","ALT DANCE POP","EMO DANCE POP","AVANT DJ SET"];

export function createMDFM(opts = {}) {
const listeners={}; const emit=(ev,data)=>{ if(ev==="nowplaying") try{ data=gFacts(data); }catch(e){} (listeners[ev]||[]).forEach(f=>{try{f(data);}catch(e){}}); };
let nowPlaying=null, spotsOn=opts.spots!==false, ride=!!opts.letItRide, underwater=!!opts.underwater;
const R=Math.random, pick=a=>a[Math.floor(R()*a.length)], rr=(a,b)=>a+R()*(b-a), ri=(a,b)=>Math.floor(rr(a,b+1));
const mtof=m=>440*Math.pow(2,(m-69)/12);
let ctx=null,pre,master,analyser,freq,vuA=null,vuBuf=null,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn=null,voiceSrc=null;
let extDuck=null,duckLevel=1,recIn=null,REC=null;   // setDuck: the page ducks the whole station (a skin's actors singing); recIn: the station before the volume and EQ, for recording a break (Save)
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
function to(node,s,amt){if(amt>0){const g=G(amt);node.connect(g);g.connect(s.rv);}}
function makeIR(c,sec,decay){const len=Math.floor(c.sampleRate*sec),b=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++){const tt=i/c.sampleRate;d[i]=(R()*2-1)*Math.exp(-tt*decay)*(tt<.01?tt/.01:1)*(1-i/len);}}return b;}
/* ---------- TUNE: the sound-tuning stage (realism, soundstage, clarity, warmth, room, trunk rattle, radio grain) ----------
   Sits between the station mix (music, voices, WYBC) and the volume. Every control at its default is a straight wire,
   so MDFM sounds exactly as it always has until someone turns something. Ideas from Collin: rich, enveloping, warm;
   a car interior with a hint of trunk rattle on sub-heavy songs; a bit of radio grain. */
const SOUND_DEF={realism:0,width:.5,clarity:0,warmth:0,room:0,roomType:"studio",rattle:0,grain:0};
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
  S.satDry=G(1); S.satWet=G(0); const sh=ctx.createWaveShaper(); sh.curve=shaper(2.4); sh.oversample="2x"; S.grainLo.connect(S.satDry); S.grainLo.connect(sh); sh.connect(S.satWet);
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
function applySound(now){
  if(!ST||!ctx) return; const S=ST, t=ctx.currentTime, set=(p,v)=>{ if(now) { p.cancelScheduledValues(0); p.value=v; } else p.setTargetAtTime(v,t,.06); };
  const r=sound.realism, c=sound.clarity, w=sound.warmth, a=sound.room, car=sound.roomType==="car"?a:0, g=sound.grain, k=Math.min(2.2,sound.width*2+r*.25*(sound.width>0?1:0));
  set(S.lowCut.gain,-(r*5+g*14)); set(S.cabin.gain,car*8); set(S.mud.gain,-4*c+car*2.5); set(S.pres.gain,2.5*c+r*.8); set(S.air.gain,3*c+r*1.2-car*3);
  set(S.warmLo.gain,3*w); set(S.warmHi.gain,-4*w); set(S.grainHi.gain,-10*g); set(S.grainLo.gain,-5*g);
  const wet=Math.min(.6,.4*w+.12*r); set(S.satWet.gain,wet*.55); set(S.satDry.gain,1-wet*.3); set(S.flDepth.gain,.035*g);
  set(S.ll.gain,(1+k)/2); set(S.rr.gain,(1+k)/2); set(S.lr.gain,(1-k)/2); set(S.rl.gain,(1-k)/2);
  set(S.realSend.gain,.16*r); const R=ROOMS[sound.roomType]||ROOMS.studio; set(S.roomSend.gain,a*R.send);
  if(S.roomType!==sound.roomType){ S.roomType=sound.roomType; S.roomConv.buffer=roomIR(ctx,sound.roomType); }
  set(S.rattle.gain,.4*sound.rattle); S.gate.curve=S.gateCurve(.16-.1*sound.rattle);
  set(S.hiss.gain,.0075*g); if(!(typeof OfflineAudioContext!=="undefined"&&ctx instanceof OfflineAudioContext)) crackleOn(g>0);
}
let crackT=0;
function crackleOn(v){ clearTimeout(crackT); if(!v) return; const go=()=>{ if(!on||!ST||sound.grain<=0) { crackT=setTimeout(go,1000); return; }
    const n=1+Math.floor(R()*3), t0=ctx.currentTime+.05; for(let i=0;i<n;i++){ const s=nz(t0+i*rr(.01,.08),.004), hp=filt("highpass",1200,.7), g=G(rr(.04,.14)*sound.grain); s.connect(hp).connect(g).connect(ST.crackle); }
    ST.crackle.gain.value=1; crackT=setTimeout(go,rr(250,2200)/Math.max(.2,sound.grain)); };
  crackT=setTimeout(go,300); }
function init(c){
  ctx=c||new (window.AudioContext||window.webkitAudioContext)({latencyHint:"playback"});
  pre=G(1);
  const ls=filt("lowshelf",90); ls.gain.value=2.5;
  const hs=filt("highshelf",6500); hs.gain.value=-6;
  const lp=filt("lowpass",10500,.5);
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-16; comp.knee.value=6; comp.ratio.value=3.5; comp.attack.value=.008; comp.release.value=.22;
  master=G(0);
  analyser=ctx.createAnalyser(); analyser.fftSize=2048; analyser.smoothingTimeConstant=.5; analyser.minDecibels=-86; analyser.maxDecibels=-30;
  /* underwater: a wobbling delay (pitch drift) into a resonant low-pass whose cutoff drifts. Neutral when off. */
  UW={dl:ctx.createDelay(.05),lp:filt("lowpass",20000,.7),wob:osc("sine",.55),wobG:G(0),drift:osc("sine",.13),driftG:G(0)};
  UW.dl.delayTime.value=.012; UW.wob.connect(UW.wobG).connect(UW.dl.delayTime); UW.drift.connect(UW.driftG).connect(UW.lp.frequency);
  UW.wob.start(); UW.drift.start(); applyUnderwater(underwater,true);
  /* Listener EQ (LOW / MID / HIGH knobs): a real 3-band EQ on the final output, after the compressor so cuts and boosts
     aren't evened back out, then a brick-wall limiter so boosts can't clip. Everything passes through it: music, ad beds,
     effects and, when the app renders the robot voices as audio (opts.tts), the voices too. Volume is the master gain. */
  TONE={low:filt("lowshelf",250),mid:filt("peaking",1000,.7),high:filt("highshelf",4000),lim:ctx.createDynamicsCompressor()};
  TONE.lim.threshold.value=-1.5; TONE.lim.knee.value=0; TONE.lim.ratio.value=20; TONE.lim.attack.value=.002; TONE.lim.release.value=.12; applyTone(true);
  voiceIn=G(1);   // rendered robot voices join here: dry (no underwater, no music colouring), under the volume and the EQ
  const mix=G(1.3); mixOut=mix; pre.connect(UW.dl).connect(UW.lp).connect(ls).connect(hs).connect(lp).connect(comp).connect(mix);
   recIn=G(1); mix.connect(recIn); voiceIn.connect(recIn);   // recIn: what Save records during a break (before volume and EQ)
  extDuck=G(duckLevel); master.connect(extDuck).connect(TONE.low).connect(TONE.mid).connect(TONE.high).connect(TONE.lim).connect(analyser).connect(ctx.destination);
  freq=new Uint8Array(analyser.frequencyBinCount);
  { const sp=ctx.createChannelSplitter(2); TONE.lim.connect(sp); vuA=[0,1].map(i=>{ const a=ctx.createAnalyser(); a.fftSize=1024; sp.connect(a,i); return a; }); vuBuf=new Float32Array(1024); }
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=R()*2-1;}
  SAT=shaper(1.8); SAT808=shaper(3); GTR=shaper(7);
  musicDuck=G(1); musicDuck.connect(pre);
  const ir=makeIR(ctx,2.2,2.4);
  songRev=ctx.createConvolver(); songRev.buffer=ir; songRev.connect(filt("lowpass",4200)).connect(G(.45)).connect(musicDuck);
  fxRev=ctx.createConvolver(); fxRev.buffer=ir; fxRev.connect(filt("lowpass",4200)).connect(G(.5)).connect(pre);
  fxDelay=G(1); const dl=ctx.createDelay(1); dl.delayTime.value=.24; const fb=G(.38), dlp=filt("lowpass",2600);
  fxDelay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(G(.5)).connect(pre);
  buildStage(); mix.connect(ST.in); ST.out.connect(master); voiceIn.connect(ST.in);   // TUNE stage (after noiseBuf exists)
}
/* tone: low / mid / high in dB (-12..+12), the receiver's EQ knobs */
const tone={low:0,mid:0,high:0,...(opts.tone||{})};   // dB
function applyTone(now){ if(!ctx||!TONE) return; const t=ctx.currentTime; for(const k of ["low","mid","high"]){ const g=TONE[k].gain, v=Math.max(-12,Math.min(12,+tone[k]||0)); g.cancelScheduledValues(t); if(now) g.setValueAtTime(v,t); else g.setTargetAtTime(v,t,.05); } }
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
  return b;
}
function duck(s,t,d){ if(t<s.lastDuck) return; s.lastDuck=t; s.duck.gain.setValueAtTime(d,t); s.duck.gain.linearRampToValueAtTime(1,t+.2); }
const HATF=[205.3,304.4,369.6,522.7,540,800];
const VOW={a:[800,1150,2800],e:[420,1900,2600],i:[300,2200,2950],o:[460,820,2830],u:[330,720,2530]};   // vowel formants (Hz)
const SYL=[["h","e"],["","o"],["","a"],["y","e"],["","u"],["w","o"],["h","a"],["n","a"],["d","i"],["t","a"]];   // chop syllables: consonant, vowel
let GTR=null;   // guitar drive curve, built with the other curves
const D={
  kick(s,t,v=1,tune=1){
    const o=osc("sine",50*tune),g=ctx.createGain(),sh=ctx.createWaveShaper(); sh.curve=SAT;
    o.frequency.setValueAtTime(165*tune,t); o.frequency.exponentialRampToValueAtTime(58*tune,t+.055); o.frequency.exponentialRampToValueAtTime(46*tune,t+.35);
    env(g,t,.0015,.8*v,.38); o.connect(sh); sh.connect(g); g.connect(s.dr); o.start(t); o.stop(t+.48);
    const c=osc("triangle",900),cg=ctx.createGain(); c.frequency.setValueAtTime(1500,t); c.frequency.exponentialRampToValueAtTime(220,t+.015); env(cg,t,.0005,.3*v,.016); c.connect(cg); cg.connect(s.dr); c.start(t); c.stop(t+.04);
    duck(s,t,.5);
  },
  b808(s,t,m,dur,v=1,slideTo=null,heavy=false){
    const f=mtof(m),o=osc("sine",f),pg=G(heavy?2.4:1.5),sh=ctx.createWaveShaper(),lp=filt("lowpass",heavy?1300:750,.7),g=ctx.createGain(); sh.curve=SAT808;
    o.frequency.setValueAtTime(f*1.8,t); o.frequency.exponentialRampToValueAtTime(f,t+.035);
    if(slideTo!=null){ const ts=t+Math.max(.06,dur-.13); o.frequency.setValueAtTime(f,ts); o.frequency.exponentialRampToValueAtTime(mtof(slideTo),ts+.11); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.21*v,t+.006); g.gain.exponentialRampToValueAtTime(.13*v,t+Math.max(.1,dur*.7)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.1);
    o.connect(pg); pg.connect(sh); sh.connect(lp); lp.connect(g); g.connect(s.dr); o.start(t); o.stop(t+dur+.15);
    duck(s,t,.6);
  },
  snare(s,t,v=1,rv=.22,tone=1){
    const o=osc("triangle",200*tone),og=ctx.createGain(); o.frequency.setValueAtTime(240*tone,t); o.frequency.exponentialRampToValueAtTime(175*tone,t+.07); env(og,t,.001,.55*v,.11); o.connect(og); og.connect(s.dr); o.start(t); o.stop(t+.16);
    const n=nz(t,.3),bp=filt("bandpass",1800,.55),lp=filt("lowpass",5200),g=ctx.createGain(); env(g,t,.001,.75*v,.19); n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(s.dr); to(g,s,rv);
  },
  clap(s,t,v=1,rv=.32){
    const bp=filt("bandpass",1150,1.1),lp=filt("lowpass",4800),out=G(1); bp.connect(lp); lp.connect(out); out.connect(s.dr); to(out,s,rv);
    [0,.008,.017,.027].forEach((d,k)=>{ const n=nz(t+d,.3),g=ctx.createGain(); env(g,t+d,.0008,(k===3?.95:.55)*v,k===3?.21:.012); n.connect(g); g.connect(bp); });
  },
  snap(s,t,v=1){ const n=nz(t,.08),bp=filt("bandpass",2300,2.2),g=ctx.createGain(),p=pan(.2); env(g,t,.0008,.55*v,.05); n.connect(bp); bp.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.3); },
  rim(s,t,v=1){ const o=osc("triangle",1100),o2=osc("square",420),bp=filt("bandpass",1300,3),g=ctx.createGain(),p=pan(-.25); env(g,t,.0008,.28*v,.04); o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(p); p.connect(s.dr); o.start(t);o2.start(t);o.stop(t+.06);o2.stop(t+.06); to(g,s,.15); },
  hat(s,t,v=1,open=false,p0=-.18){
    const mix=G(.16),bp=filt("bandpass",8000,.8),hp=filt("highpass",6000),lp=filt("lowpass",9000),g=ctx.createGain(),p=pan(p0),d=open?.3:.04;
    for(const f of HATF){ const o=osc("square",f*1.7); o.connect(mix); o.start(t); o.stop(t+d+.05); }
    env(g,t,.0008,(open?.14:.19)*v,d); mix.connect(bp); bp.connect(hp); hp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr);
  },
  conga(s,t,v=1,hi=false){ const f=hi?380:290,o=osc("sine",f),g=ctx.createGain(),p=pan(hi?.35:-.35); o.frequency.setValueAtTime(f*1.25,t); o.frequency.exponentialRampToValueAtTime(f,t+.02); env(g,t,.001,.32*v,.16); o.connect(g); g.connect(p); p.connect(s.dr); o.start(t);o.stop(t+.22); },
  tom(s,t,v=1,f=130){ const o=osc("sine",f),g=ctx.createGain(); o.frequency.setValueAtTime(f*1.5,t); o.frequency.exponentialRampToValueAtTime(f*.8,t+.3); env(g,t,.001,.6*v,.3); o.connect(g); g.connect(s.dr); o.start(t);o.stop(t+.4); to(g,s,.2); },
  crash(s,t,v=1){ const mix=G(.1),hp=filt("highpass",3500),lp=filt("lowpass",8000),g=ctx.createGain(),p=pan(.3);
    for(const f of HATF){const o=osc("square",f*2.3);o.connect(mix);o.start(t);o.stop(t+2);} const n=nz(t,1.9),ng=G(.5); n.connect(ng); ng.connect(hp); mix.connect(hp);
    env(g,t,.002,.13*v,1.7); hp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr); to(g,s,.25); },
  shaker(s,t,v=1){ const n=nz(t,.09),bp=filt("bandpass",4200,1),lp=filt("lowpass",7000),g=ctx.createGain(),p=pan(.3); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.08*v,t+.018); g.gain.exponentialRampToValueAtTime(.0001,t+.07); n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.dr); },
  vinyl(s,t,dur){ const k=Math.floor(dur*rr(4,8)); for(let i=0;i<k;i++){ const tt=t+R()*dur,n=nz(tt,.003),g=G(rr(.02,.06)),bp=filt("bandpass",2200,.8); n.connect(bp); bp.connect(g); g.connect(s.mu);} },
  logdrum(s,t,m,v=1){ const f=mtof(m),o=osc("sine",f),g=ctx.createGain(),sh=ctx.createWaveShaper(),lp=filt("lowpass",900); sh.curve=SAT808; o.frequency.setValueAtTime(f*2.2,t); o.frequency.exponentialRampToValueAtTime(f,t+.06); env(g,t,.003,.34*v,.3); o.connect(sh); sh.connect(lp); lp.connect(g); g.connect(s.dr); o.start(t); o.stop(t+.4); duck(s,t,.7); },
  cowbell(s,t,m,dur,v=1){ M.cowbell(s,t,m,dur,v); },
  riser(s,t,dur){ const n=nz(t,dur+.05),bp=filt("bandpass",400,1.2),g=ctx.createGain(); bp.frequency.setValueAtTime(300,t); bp.frequency.exponentialRampToValueAtTime(4000,t+dur); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.16,t+dur); g.gain.setValueAtTime(.0001,t+dur+.01); n.connect(bp); bp.connect(g); g.connect(s.dr); to(g,s,.35); },
};
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
    notes.forEach((m,i)=>{ const f=mtof(m),c=osc("sine",f),mo=osc("sine",f),mg=ctx.createGain(),g=ctx.createGain(),p=pan(i%2?.22:-.22);
      mg.gain.setValueAtTime(f*1.3,t); mg.gain.exponentialRampToValueAtTime(f*.1,t+.35); mo.connect(mg); mg.connect(c.frequency);
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.1,t+.006); g.gain.exponentialRampToValueAtTime(.045,t+.4); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.35);
      c.connect(g); g.connect(p); p.connect(lp); c.start(t); mo.start(t); c.stop(t+dur+.4); mo.stop(t+dur+.4); });
  },
  bell(s,t,m,dur,v=1,pn=0){
    const f=mtof(m),c=osc("sine",f),mo=osc("sine",f*3.5),mg=ctx.createGain(),g=ctx.createGain(),p=pan(pn);
    mg.gain.setValueAtTime(f*2,t); mg.gain.exponentialRampToValueAtTime(f*.04,t+.22); mo.connect(mg); mg.connect(c.frequency);
    env(g,t,.002,.09*v,Math.max(.6,dur*1.6)); c.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.35); c.start(t); mo.start(t); c.stop(t+dur*1.7+.7); mo.stop(t+.4);
  },
  organ(s,t,notes,dur,v=1,trem=6){   // tonewheel-ish drawbars with a tremolo, for the radio plays
    const g=ctx.createGain(),lfo=osc("sine",trem),lg=G(.18*.05*v),lp=filt("lowpass",3200,.5); lp.connect(g); g.connect(s.mu); to(g,s,.6);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.05*v,t+.04); g.gain.setValueAtTime(.05*v,t+dur); g.gain.linearRampToValueAtTime(.0001,t+dur+.25);
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t+dur+.3);
    notes.forEach(m=>{ [[.5,.5],[1,1],[2,.55],[3,.3],[4,.22],[6,.08]].forEach(([h,a])=>{ const o=osc("sine",mtof(m)*h),og=G(a/notes.length*1.6); o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.3); }); });
  },
  pad(s,t,notes,dur,v=1,bright=1000){
    const lp=filt("lowpass",bright,.4),g=ctx.createGain(); lp.connect(g); g.connect(s.mu); to(g,s,.45);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+Math.min(1.2,dur*.35)); g.gain.setValueAtTime(.045*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.7);
    notes.forEach(m=>{ for(const dt of [-9,8]){ const o=osc("sawtooth",mtof(m)),p=pan(dt<0?-.4:.4); o.detune.value=dt; o.connect(p); p.connect(lp); o.start(t); o.stop(t+dur+.8);} });
  },
  choir(s,t,notes,dur,v=1){
    const f1=filt("bandpass",720,5),f2=filt("bandpass",1150,6),g=ctx.createGain(),lfo=osc("sine",5),lg=G(6); f1.connect(g); f2.connect(g); g.connect(s.mu); to(g,s,.55);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.15*v,t+Math.min(.8,dur*.3)); g.gain.setValueAtTime(.15*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.9);
    lfo.connect(lg); lfo.start(t); lfo.stop(t+dur+1);
    notes.forEach(m=>{ const o=osc("sawtooth",mtof(m)); lg.connect(o.detune); o.connect(f1); o.connect(f2); o.start(t); o.stop(t+dur+1); });
  },
  saw(s,t,notes,dur,v=1){
    const lp=filt("lowpass",2000,1.4),g=ctx.createGain(),sh=ctx.createWaveShaper(); sh.curve=SAT; lp.frequency.setValueAtTime(2800,t); lp.frequency.exponentialRampToValueAtTime(1000,t+dur+.05);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.045*v,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
    lp.connect(sh); sh.connect(g); g.connect(s.mu); to(g,s,.3);
    notes.forEach(m=>{ for(const dt of [-16,-6,5,15]){ const o=osc("sawtooth",mtof(m)),p=pan(dt/30); o.detune.value=dt; o.connect(p); p.connect(lp); o.start(t); o.stop(t+dur+.1);} });
  },
  pluck(s,t,m,dur,v=1){ const o=osc("sawtooth",mtof(m)),lp=filt("lowpass",2500,3),g=ctx.createGain(); lp.frequency.setValueAtTime(2800,t); lp.frequency.exponentialRampToValueAtTime(350,t+.22); env(g,t,.002,.12*v,.32); o.connect(lp); lp.connect(g); g.connect(s.mu); to(g,s,.3); o.start(t); o.stop(t+.4); },
  whistle(s,t,m,dur,v=1,prev=null){ const f=mtof(m),o=osc("sine",f),lfo=osc("sine",5.5),lg=G(f*.012),g=ctx.createGain(); lfo.connect(lg); lg.connect(o.frequency);
    if(prev!=null){o.frequency.setValueAtTime(mtof(prev),t);o.frequency.exponentialRampToValueAtTime(f,t+.08);}
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.08*v,t+.04); g.gain.setValueAtTime(.08*v,t+Math.max(.05,dur*.85)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.05);
    o.connect(g); g.connect(s.mu); to(g,s,.3); o.start(t); lfo.start(t); o.stop(t+dur+.1); lfo.stop(t+dur+.1); },
  bass(s,t,m,dur,v=1,prev=null){
    const g=ctx.createGain(),lp=filt("lowpass",420,2),a=osc("sawtooth",mtof(m)),b=osc("sine",mtof(m-12)),bg=G(1.6);
    if(prev!=null){a.frequency.setValueAtTime(mtof(prev),t);a.frequency.exponentialRampToValueAtTime(mtof(m),t+.06);b.frequency.setValueAtTime(mtof(prev-12),t);b.frequency.exponentialRampToValueAtTime(mtof(m-12),t+.06);}
    lp.frequency.setValueAtTime(900,t); lp.frequency.exponentialRampToValueAtTime(300,t+.2);
    a.connect(lp); b.connect(bg); bg.connect(lp); env(g,t,.004,.36*v,dur); lp.connect(g); g.connect(s.dr); a.start(t);b.start(t);a.stop(t+dur+.1);b.stop(t+dur+.1); duck(s,t,.7);
  },
  cowbell(s,t,m,dur,v=1){ const f=mtof(m),a=osc("square",f),b=osc("square",f*1.48),bp=filt("bandpass",f*1.6,1.5),lp=filt("lowpass",3200),g=ctx.createGain(),p=pan(.15); env(g,t,.002,.08*v,Math.min(.35,dur+.1)); a.connect(bp); b.connect(bp); bp.connect(lp); lp.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.3); a.start(t);b.start(t);a.stop(t+.5);b.stop(t+.5); },
  brass(s,t,notes,dur,v=1){ const lp=filt("lowpass",600,1.2),g=ctx.createGain(); lp.frequency.setValueAtTime(500,t); lp.frequency.exponentialRampToValueAtTime(2600,t+.05); lp.frequency.exponentialRampToValueAtTime(1300,t+dur+.2);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.06*v,t+.03); g.gain.setValueAtTime(.06*v,t+dur); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.25);
    lp.connect(g); g.connect(s.mu); to(g,s,.35);
    notes.forEach(m=>{ for(const dt of [-7,6]){ const o=osc("sawtooth",mtof(m)); o.detune.value=dt; o.connect(lp); o.start(t); o.stop(t+dur+.3);} }); },
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
    const vw=VOW[o.vw||"a"]||VOW.a, up=m>69?1.12:1;
    vw.forEach((F,k)=>{ const bp=filt("bandpass",F*up,[7,10,12][k]),fg=G([2.2,1.3,.8][k]); mix.connect(bp); bp.connect(fg); fg.connect(out); });
    const n=nz(t,dur+.2),hp=filt("highpass",3800),ng=G(.012); n.connect(hp); hp.connect(ng); ng.connect(out);
    const pk=.16*v, at=o.att??.045;
    if(o.rev){ g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+dur); g.gain.setValueAtTime(.0001,t+dur+.005); }
    else { g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+at); g.gain.setValueAtTime(pk*.9,t+Math.max(at+.01,dur)); g.gain.exponentialRampToValueAtTime(.0001,end); }
    out.connect(g); g.connect(p); p.connect(s.mu); to(g,s,.42); if(o.thr) g.connect(G(o.thr)).connect(fxDelay);
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
    if(!a){ const pre=G(1.8),sh=ctx.createWaveShaper(),hp=filt("highpass",110),pk=filt("peaking",2400,1),lp=filt("lowpass",mute?1300:3600,.8),out=G(.4); sh.curve=GTR; pk.gain.value=4;
      pre.connect(sh); sh.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(out); out.connect(s.mu); to(out,s,.12); a=s[k]={pre}; }
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
  "SLOW JAM R&B":{bpm:[66,76],sw:[.55,.6],scales:[DO,MA],mode:"any",voicing:"ext",
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
function motifGen(base,deg,dens,half,len,start){ // a melody: len bars of 16 steps, stepwise with the odd leap
  let cur=start; const out=[];
  for(let i=0;i<len*16;i++){ const p=i%4===0?dens*1.8:i%2===0?dens:(half?0:dens*.25);
    if(R()<p){ cur=Math.max(-2,Math.min(9,cur+pick([-2,-1,-1,0,1,1,2,3,-3,4]))); out.push({i,m:base+deg(cur)}); } }
  if(!out.length) out.push({i:0,m:base+deg(start)});
  out.forEach((n,k)=>{ const nx=k+1<out.length?out[k+1].i:len*16; n.len=Math.max(1,Math.min(8,nx-n.i)); });
  return out;
}
function makeSong(force){
  let name=force; if(!name){ const all=Object.keys(STY), fresh=all.filter(n=>!recentStyles.includes(n)), pool=fresh.length?fresh:all;   // weighted: ballads and DJ sets come up less often
    let r=R()*pool.reduce((a,n)=>a+(STY[n].w??1),0); name=pool[pool.length-1]; for(const n of pool){ if((r-=STY[n].w??1)<=0){ name=n; break; } }
    recentStyles.push(name); if(recentStyles.length>4) recentStyles.shift(); }
  const st=STY[name],fam=FAM[STYLE_FAM[name]]||FAM.soul,sc=pick(st.scales),root=ri(36,47),bpm=ri(st.bpm[0]-2,st.bpm[1]+2),major=sc[2]===4;
  const deg=d=>{const k=((d%7)+7)%7,o=Math.floor(d/7);return sc[k]+12*o;};
  const voi=st.voicing==='ext'?pick([[0,2,4,6],[0,2,6,8],[0,4,6,9],[0,2,4,6,8]]):pick([[0,2,4],[0,4,7],[-3,0,2]]), chord=(d,up=0)=>voi.map((x,j)=>root+12+deg(d+x)+(j<up?12:0));
  const sp=60/bpm/4, barSec=sp*16;
  // arrangement: a form, sized so the song runs about 70-110 seconds
  const form=st.set?SETFORM:pick(FORMS), unit=st.set?8:barSec*8*form.reduce((a,f)=>a+f[1],0)>115?4:8, sections=[]; let at=0;
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
  const chordsI=R()<.45?st.chords:pick(fam.chords), leadI=R()<.4?st.lead:pick(fam.lead), leadB=pick(fam.lead), padI=R()<.5?st.pad:pick(fam.pad);
  const dens=({piano:.24,bell:.26,whistle:.2,rhodesline:.18,pluck:.3,cowbell:.32,saw:.2,vox:.17,chop:.3}[leadI]||.25)*rr(.75,1.3);
  const base=root+12*Math.round((st.octLead-root)/12);
  const hookLen=pick([1,2,2,4]), verseLen=pick([2,4]);
  const hook=motifGen(base,deg,dens*1.15,st.half,hookLen,ri(1,5)), verse=motifGen(base-12*(R()<.4?1:0),deg,dens*.7,st.half,verseLen,ri(0,4));
  const answer=hook.map((n,k)=>k>=hook.length/2&&R()<.5?{...n,m:base+deg(ri(-1,5))}:n);
  const pa=pick(major?PROGS.maj:PROGS.min), pb=R()<.6?pick(major?PROGS.maj:PROGS.min):pa;
  const fills=sections.map(()=>pick(["tom","snareroll","hatstutter","drop","none","tom"]));
  const verses=sections.filter(x=>x.kind==="verse"), deckB=st.set&&verses[1]?verses[1].start:1e9;   // DJ set: deck B comes in a fourth or fifth away
  const keyUp=st.set?pick([5,7,-2,3]):R()<.22?pick([1,2]):0, lastHook=[...sections].reverse().find(x=>x.kind==="hook");
  if(st.set){ kinds.hook.lead="hook"; kinds.verse.lead=pick(["verse","none"]); kinds.break.chords="sustain"; }
  if(st.chords==="guitar"){ kinds.verse.chords="mute"; kinds.pre.chords="mute"; kinds.intro.chords="mute"; kinds.hook.chords="main"; kinds.outro.chords="main"; kinds.bridge.chords="sustain"; }   // emo: palm-muted verses, open hooks
  return {name,st,sc,root,bpm,sp,bars,brk,deg,chord,sections,kinds,fills,keyUp,keyFrom:st.set?deckB:keyUp&&lastHook?lastHook.start:1e9,deckB,
    chops:Array.from({length:4},()=>pick(SYL)),
    prog:pa,progB:pb,cpb:st.half?1:(R()<.5?1:2),swing:rr(st.sw[0],Math.min(.66,st.sw[1]+.02)),K,S,H,O,P,K2,H2,P2,LOG,bassPat,bassOff,
    hook,answer,verse,hookLen,verseLen,chordsI,leadI,leadB,padI,kTune:rr(.88,1.12),sTone:rr(.85,1.2),hatDec:rr(-.24,-.12),
    title:st.set?`${pick(T_A)} ${pick(T_B)} (Continuous Mix)`:`${pick(T_A)} ${pick(T_B)}`};
}
function secAt(s,bar){ for(const x of s.sections) if(bar>=x.start&&bar<x.start+x.bars) return x;
  // past the written form (let it ride): keep cycling verse / hook in 8-bar blocks, ending on the outro
  const last=s.sections[s.sections.length-1], over=bar-(last.start+last.bars), n=Math.floor(over/8);
  return {kind:bar>=s.bars-4?"outro":n%2?"verse":"hook",start:last.start+last.bars+n*8,bars:8}; }
function playStep(s,step,t){
  if(!s.gExtra&&(s.sp0!=null||MXON.mdfm||GON.mdfm)) mxSong(s,step);   // the style matrix (TUNE): tempo, swing and groove pulls, only once it's been used
  const st=s.st,bar=Math.floor(step/16),i=step%16,sp=s.sp,deckB=bar>=s.deckB, GN=GON.mdfm, gf=GN?GRV.mdfm.feel:.5, di=gf>.75?(i*2)%16:gf<.25?(i>>1)+8*(bar%2):i, gSkip=gf<.25&&i%2===1;   // di: where in the drum pattern (TUNE feel: half / double time)
  let tt=t+(i%2?(s.swing-.5)*2*sp:0); if(s.swing>.55) tt+=rr(-.004,.004);
  const B2=s.brk2??-99, sec=(bar===B2||bar===B2+1)?{kind:"break",start:B2,bars:2}:secAt(s,bar), K=s.kinds[sec.kind]||s.kinds.verse;
  const sb=bar-sec.start, lastBar=sb===sec.bars-1, nextSec=secAt(s,sec.start+sec.bars), fill=s.fills[s.sections.indexOf(sec)]||(sec.kind==="hook"?"snareroll":"tom");
  const drop=lastBar&&fill==="drop"&&nextSec.kind==="hook"&&i>=8;   // a beat of silence before the hook lands
  const tr=bar>=s.keyFrom?s.keyUp:0, prog=sec.kind==="hook"||sec.kind==="pre"?s.prog:s.progB;
  const d=prog[Math.floor(bar/s.cpb)%4], notes=s.chord(d,K.up).map(n=>n+tr);
  // filter sweeps: open up across the intro and out of breaks; close down into a break
  if(step===0&&!s.gExtra){ s.mlp.frequency.setValueAtTime(450,t); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*Math.max(2,s.sections[0].bars)); }
  if(!s.gExtra&&sb===0&&i===0&&(sec.kind==="break"||sec.kind==="bridge")&&bar>0){ s.mlp.frequency.setValueAtTime(18000,t); s.mlp.frequency.exponentialRampToValueAtTime(900,t+sp*8); s.mlp.frequency.setValueAtTime(900,t+sp*16*(sec.bars-1)); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*sec.bars); }
  /* drums */
  s.gTr=tr; if(GN&&i===0&&!s.gExtra){ s.gGrid={t0:t,st:sp,n:16,bar}; s.gNoFill=GRV.mdfm.fills<.49&&R()<(.5-GRV.mdfm.fills)*2; gPump("mdfm",s,t,16*sp,bar,lastBar); } if(GN) s.gPos=i;
  const drumsOn=K.drums&&!(st.drumHook&&!(sec.kind==="hook"||sec.kind==="bridge"||sec.kind==="outro"));
  if(drumsOn&&!drop&&!gSkip){
    const kp=(K.kick==="B")!==deckB?s.K2:s.K; if(kp[di]==="x") D.kick(s,tt,(di===0?1:.88)*(st.kv||1),s.kTune);
    const sp2=s.S[bar%s.S.length];
    if(sp2[di]==="x"){ if(st.snare==="big"){ D.snare(s,tt,1.05,.6,s.sTone*.9); D.clap(s,tt,.7,.55); } else if(st.snare==="ballad"){ D.snare(s,tt,.75,.7,s.sTone*.85); } else if(st.snare==="snare"){ D.snare(s,tt,1,.22,s.sTone); if(st.clap) D.clap(s,tt,.65);} else if(st.snare==="snapclap"){ D.snap(s,tt,1.1); D.clap(s,tt,.5,.45);} else { D.clap(s,tt,1); D.snare(s,tt,.3,.1,s.sTone); } }
    const Pp=sec.kind==="hook"?s.P2:s.P; if(Pp&&Pp[di]==="x"&&sec.kind!=="intro"){ if(st.perc==="rim") D.rim(s,tt,.9); else if(st.perc==="snap") D.snap(s,tt,.8); else if(st.perc==="conga") D.conga(s,tt,.9,(di>>1)%2===1); else if(st.perc==="ghost") D.snare(s,tt,.2,.05); }
    if(st.shaker&&sec.kind!=="intro") D.shaker(s,tt,di%2?1:.6);
    if(lastBar&&nextSec.kind!=="outro"&&!(GN&&s.gNoFill)){   // the fill into the next section
      if(fill==="tom"&&i>=12) D.tom(s,tt,.7,[190,160,130,100][i-12]);
      else if(fill==="snareroll"&&i>=8) D.snare(s,tt,.3+(i-8)*.08,.12,s.sTone);
      else if(fill==="hatstutter"&&i>=12) for(let k=0;k<4;k++) D.hat(s,tt+k*sp/4,.6,false,s.hatDec);
    } else if(s.ride&&bar%16===15&&i>=8) D.snare(s,tt,.35+(i-8)*.08,.12,s.sTone);
    if(sb===0&&i===0&&(sec.kind==="hook"||(sec.kind==="verse"&&R()<.4))) D.crash(s,tt,sec.kind==="hook"?1:.6);
    else if(st.crashBar&&sec.kind==="hook"&&i===0&&sb%2===0) D.crash(s,tt,.45);
  }
  if(!s.gExtra&&lastBar&&nextSec.kind==="hook"&&i===0&&(sec.kind==="pre"||sec.kind==="break"||R()<.5)) D.riser(s,t,sp*16);
  if(!(sec.kind==="intro"&&sb===0)&&!drop&&sec.kind!=="break"&&(drumsOn||!st.drumHook)&&!gSkip){
    const hp=(K.hats==="busy")!==deckB?s.H2:s.H, c=hp[di], hv=(di%4===0?1:rr(.55,.75))*(sec.kind==="intro"?.5:1)*(K.hats==="sparse"?.8:1);
    const build=K.hats==="build"&&sb>=sec.bars-2;
    if(K.hats==="sparse"){ if(di%4===0||c==="r") D.hat(s,tt,hv,false,s.hatDec); }
    else if(build){ if(di%2===0||sb===sec.bars-1) D.hat(s,tt,hv*(.6+sb/sec.bars*.4),false,s.hatDec); }
    else if(c==="x") D.hat(s,tt,hv,false,s.hatDec);
    else if(c==="r"){ D.hat(s,tt,hv*.8,false,s.hatDec); D.hat(s,tt+sp/2,hv*.6,false,s.hatDec); }
    else if(c==="3"){ for(let k=0;k<3;k++) D.hat(s,tt+k*sp/3,hv*(.85-k*.12),false,s.hatDec); }
    if(s.O&&s.O[di]==="o"&&K.drums) D.hat(s,tt,.85,true,.2);
  }
  if(i===0&&st.vinyl) D.vinyl(s,t,sp*16);
  /* bass */
  const bassOn=K.bass==="full"||(K.bass==="half"&&i<8);
  if(bassOn&&!drop&&st.bass==="log"&&s.LOG[i]==="x"){ let m=s.root+s.deg(d)+tr+pick([0,0,0,7,12,-5]); if(m>55) m-=12; D.logdrum(s,tt,m,1); }
  if(bassOn&&!drop&&(st.bass==="pulse"||st.bass==="octave")){   // dance: eighth-note synth bass (octave: jumps up on the offbeat)
    if(i%2===0){ let m=s.root+s.deg(d)+tr; while(m>50) m-=12; const up=st.bass==="octave"&&i%4===2?12:0; M.bass(s,tt,m+up,sp*1.6,i%4===0?.95:.75); } }
  else if(bassOn&&!drop&&st.bass==="held"){ if(i===0||(i===8&&R()<.3)){ let m=s.root+s.deg(d)+tr; while(m>50) m-=12; M.bass(s,tt,m,sp*(i?7:15),.7); } }
  else if(bassOn&&!drop&&st.bass!=="log"&&s.bassPat[i]){
    let len=1; while(i+len<16&&!s.bassPat[i+len]) len++;
    if(st.bass==="bass"){ let m=s.root+s.deg(d)+s.bassOff[i]+tr; if(m>52) m-=12; M.bass(s,tt,m,Math.min(len,4)*sp*.9,1,R()<.2?m+pick([-2,2]):null); }
    else { let m=s.root-12+s.deg(d)+tr+(s.bassOff[i]===12?0:s.bassOff[i]); if(m>40) m-=12; if(m<26) m+=12;
      let nxt=null; if(R()<st.slide) nxt=m+pick([-5,-2,3,5,7,12]);
      D.b808(s,tt,m,Math.min(len,8)*sp,st.bass==="808soft"?.75:1,nxt,false); }
  }
  /* chords + pad */
  const ck=s.chordsI, cmode=K.chords;
  if(cmode==="sustain"){ if(i===0&&bar%2===0) (ck==="organ"?M.organ:ck==="guitar"?(s2,t2,n,du,v)=>M.guitar(s2,t2,Math.min(...n)-12,du,v*.8):M.rhodes)(s,tt,notes,sp*30,.7); }
  else if(cmode==="mute"&&ck!=="guitar"){ if(i===0) M.rhodes(s,tt,notes,sp*12,.6); }
  else if(cmode==="sparse"){ if(i===0) (ck==="piano"||ck==="pianostab"?M.piano:M.rhodes)(s,tt,notes,sp*12,.6); }
  else if(cmode==="stab"){ if("x..x..x.x.....x."[i]==="x") M.piano(s,tt,notes,sp*1.1,.6); }
  else if(ck==="piano"&&i===0) M.piano(s,tt,notes,sp*15,.75);
  else if(ck==="rhodes"&&(i===0||i===10)) M.rhodes(s,tt,notes,sp*(i?5:9),.9);
  else if(ck==="rhodesoff"&&(i===2||i===6||i===10||i===14)) M.rhodes(s,tt,notes,sp*1.6,.75);
  else if(ck==="pianostab"&&(i===2||i===6||i===10||i===14)) M.piano(s,tt,notes,sp*1.2,.55);
  else if(ck==="saw"&&"x..x..x...x..x.."[i]==="x") M.saw(s,tt,notes,sp*2.2,.9);
  else if(ck==="bellarp"&&"x..x..x.x..x..x."[i]==="x"){ s.arp=(s.arp||0)+1; M.bell(s,tt,notes[s.arp%notes.length]+12,sp*3,.75,(s.arp%2?.3:-.3)); }
  else if(ck==="pluckarp"&&i%2===0){ s.arp=(s.arp||0)+1; M.pluck(s,tt,notes[s.arp%notes.length]+12,sp*1.5,.6); }
  else if(ck==="organ"&&i===0) M.organ(s,tt,notes,sp*15,.9,5);
  else if(ck==="pianoarp"&&i%2===0) M.piano(s,tt,[notes[(i/2)%notes.length]+(i>=8?12:0)],sp*3.5,.5);
  else if(ck==="housestab"&&"..x...x...x...x."[i]==="x") M.saw(s,tt,notes.map(n=>n+12),sp*.9,.75);
  else if(ck==="guitar"){ const r0=s.root+s.deg(d)+tr; let r=r0; while(r>52) r-=12; while(r<40) r+=12;
    if(cmode==="mute"){ if(i%2===0) M.guitar(s,tt,r,sp*.8,.8,true); } else if("x.x.x.x.x.x.x.x."[i]==="x") M.guitar(s,tt,r,sp*1.9,1,false); }
  if(i===0&&bar%2===0&&s.padI!=="none"&&!drop){ const pd=s.padI; if(pd==="choir") M.choir(s,tt,notes,sp*32,.8); else M.pad(s,tt,notes,sp*32,.8,pd==="strings"?2000:1000); }
  else if(i===0&&bar%2===0&&ck==="padonly") M.pad(s,tt,notes,sp*32,.9,1400);
  if(st.set&&!drop) setExtras(s,sec,sb,i,tt,d,tr,lastBar,nextSec);
  /* melodies: the hook in hooks (sometimes up an octave or doubled), a sparser line in verses */
  if(K.lead!=="none"&&!drop&&bar>=1){
    const isHook=K.lead!=="verse", L=isHook?s.hookLen:s.verseLen, phrase=Math.floor(sb/L), mot=isHook?(phrase%2?s.answer:s.hook):s.verse;
    const ph=(sb%L)*16+i, inst=isHook?s.leadI:s.leadB, oct=K.lead==="hookHi"?12:0;
    for(let k=0;k<mot.length;k++){ const n=mot[k]; if(n.i!==ph) continue; const dur=n.len*sp, m=n.m+tr+oct;
      playLead(s,inst,tt,m,dur,k?mot[k-1].m+tr+oct:null,isHook?1:.75);
      if(K.lead==="hookDbl") playLead(s,inst==="bell"?"pluck":"bell",tt,m+12,dur,null,.45); }
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
function playLead(s,inst,t,m,dur,prev,v){
  if(inst==="vox"){ M.vox(s,t,m,dur,v,{prev,vw:pick(["a","a","o","e","u"])}); return; }
  if(inst==="chop"){ M.chop(s,t,m,Math.min(dur,s.sp*2),v,{syl:s.chops[Math.floor(t/(s.sp*64))%4]}); return; }
  if(inst==="piano") M.piano(s,t,[m],dur,v); else if(inst==="bell") M.bell(s,t,m,dur,v,.15);
  else if(inst==="saw") M.saw(s,t,[m],dur,.8*v); else if(inst==="whistle") M.whistle(s,t,m,dur,v,prev);
  else if(inst==="rhodesline") M.rhodes(s,t,[m],dur,.9*v); else if(inst==="pluck") M.pluck(s,t,m,dur,1.1*v); else if(inst==="cowbell") M.cowbell(s,t,m,dur,v);
  else M.bell(s,t,m,dur,v,.15);
}
// What was rolled for a song, in plain words (for "now playing" and the product page's song card).
const NOTE_NAMES=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const SCALE_NAMES=new Map([[HM,"harmonic minor"],[AE,"minor"],[DO,"dorian"],[PH,"phrygian"],[MA,"major"]]);
const INST_NAMES={piano:"piano",pianostab:"piano stabs",pianoarp:"piano arpeggios",rhodes:"electric piano",rhodesoff:"offbeat electric piano",rhodesline:"electric piano",bellarp:"bell arpeggios",bell:"bells",pluckarp:"plucked arpeggios",pluck:"pluck synth",padonly:"pads",saw:"saw synth",organ:"church organ",guitar:"distorted guitar",housestab:"house stabs",whistle:"whistle",vox:"sung synth voice",chop:"vocal chops",cowbell:"cowbell",choir:"choir",pad:"synth pad",strings:"strings",none:null};
function songFacts(s){
  const prog=s.prog.map(d=>["I","II","III","IV","V","VI","VII"][((d%7)+7)%7]);
  return {key:NOTE_NAMES[s.root%12]+" "+(SCALE_NAMES.get(s.sc)||"modal"),swing:Math.round(s.swing*100),
    form:s.sections.map(x=>x.kind),bars:s.bars,progression:prog.join("–"),
    band:[s.chordsI,s.leadI,s.padI].map(k=>INST_NAMES[k]).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i)};
}
function setupSong(s,t,fadeBars){
  Object.assign(s,makeBus(musicDuck,songRev)); s.mxId="mdfm"; s.gNative=true; s.gKey={root:s.root,sc:s.sc}; if(s.st.set) loadVoiceSamples(); 
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
const CUE_LABEL={rain:"rain",knock:"knock knock knock",door:"door creaks",steps:"footsteps",claps:"clapping",rocket:"rocket launch",beeps:"control panel beeps",theremin:"spooky space noise",zap:"zap",thunder:"thunder",clock:"clock ticking",horse:"hoofbeats",wind:"wind",teacup:"teacup clinks",typewriter:"typing",printer:"printer whirs",gallery:"quiet gallery",applause:"polite applause",page:"page turns",hammer:"hammering",drill:"power drill",crash:"something big falls over",crank:"engine cranks and won't start"};

/* ---------- scheduler ---------- */
let nextGap=rr(30,60), lastShow=-1e9;   // first break comes quickly; after that the station leans on music
function tick(){
  if(!on) return;
  const ahead=ctx.currentTime+(document.hidden?1.6:.25), late=ctx.currentTime-.3;   // steps more than .3 s in the past (a stall) are skipped, not piled up
  let sp0=null;
  for(const s of songs){
    while(!s.done&&s.next<ahead){
      { const adv=mStep(s,s.next,s.next>late); s.step++; s.next+=adv; }
      if(!s.handed&&s.step===(s.bars-4)*16){ s.handed=true; const barT=s.sp*16,tH=s.next;
        s.bus.gain.setValueAtTime(s.st.lvl||1,tH); s.bus.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.rvf.gain.setValueAtTime(1,tH); s.rvf.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.endT=tH+barT*4+.5;
        startSong(tH,3);
        const wait=Math.max(0,(tH-ctx.currentTime)*1000);
        if(newsDue()) setTimeout(()=>spot("news"),wait+300);   // company news at the top of the hour, when Slack is connected
        else if(techDue()) setTimeout(()=>spot("technews"),wait+300);   // MedDev tech news on the half hour, when the page can read the hub
        else if(ctx.currentTime-lastSpot>nextGap&&(!spotsOn||speaking||(sp0=nextSpot()))){ const p=sp0; setTimeout(()=>spot(null,p),wait+300); }   // nothing to say (all talk types off): fall through to a voice drop
        else if(R()<.55&&!speaking) setTimeout(()=>{ if(on&&!speaking){ if(TYPES.stingers&&VSTING.length&&R()<.6) voiceSting(); else pick(STINGS)(ctx.currentTime+.05); } },wait+200);
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
    for(const x of list){ const k=x.state==="in"?"live":x.state==="pre"?"pre":(x.won||x.score>x.oscore)?"win":"loss";
      const dt=x.date?new Date(x.date):null, when=dt&&!isNaN(dt)?dt.toLocaleString([],{weekday:"long",hour:"numeric",minute:"2-digit"}):"soon";
      const v={...x,when,detail:(x.detail||"").replace(/(\d)(st|nd|rd|th)\b/g,"$1$2"),league:x.league||"sports"};
      if(x.obscure){ const pool=CHIP_OBS[x.state==="in"?"live":x.state==="pre"?"pre":x.score===x.oscore&&CHIP_OBS.tie.length?"tie":"win"]; if(CHIP_OBS.intro.length) lines.push(["chip",fill(pick(CHIP_OBS.intro),v)]); if(pool.length) lines.push(["chip",fill(pick(pool),v)]); }
      else { const pool=x.national&&CHIP_NAT[k]&&CHIP_NAT[k].length?CHIP_NAT[k]:CHIP[k]; if(pool.length) lines.push(["chip",fill(pick(pool),v)]); } } }
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
  if(kind==="funnelball"&&FB.cities.length) return {kind}; if(kind==="showponies"&&SP_OK()) return {kind}; return null; }
/* Funnelball: a made-up sport. Every broadcast is generated: teams, players, plays, scores and commentary. */
const FB={cities:[],mascots:[],first:[],last:[],venues:[],intro:[],plays:[],color:[],close:[],final:[],outro:[]};
packs.forEach(p=>{ const f=p.funnelball; if(f) for(const k in FB) FB[k].push(...(f[k]||[])); });
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
  const lead=sc[a.name]===sc[b.name]?null:(sc[a.name]>sc[b.name]?a:b), lose=lead===a?b:a;
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
const TYPE_KEYS=["ids","stingers","ads","interviews","callers","weather","sports","plays","arts","podcast","cooking","homerepair","garage","funnelball","showponies","technews","news"];
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
  const opts2=[["interviews",.17,INTERVIEWS.length],["callers",.07,CALLERS.open.length],["weather",.10,WX.time.length||TAB.noData.length],["sports",.09,CHIP.noData.length],["funnelball",.06,FB.cities.length],["showponies",.06,SP_OK()],["ids",.15,IDS.length],["ads",.42,ADS.length||AP_OK]]
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
  const c=cast||hostCast(); emit("caption",{text:shown||text,who:(c&&c.who)||"DJ"});
  // The app can render each line to audio (macOS voices) so it plays through the volume, EQ, meters and visualizer.
  if(typeof opts.tts==="function"&&ctx&&voiceIn){
    const spec={text,voice:c.voice?c.voice.name:(c.voiceName||null),rate:c.rate||1,pitch:c.pitch==null?1:c.pitch};
    Promise.race([opts.tts(spec),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))])
      .then(buf=>ctx.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)))
      .then(ab=>{ if(!on||g!==gen){ fin(); return; } const src=ctx.createBufferSource(); src.buffer=ab; let dst=c.phone?phoneLine():voiceIn; if(c.vol!=null&&c.vol!==1){ const vg=G(c.vol); vg.connect(dst); dst=vg; } src.connect(dst); voiceSrc=src;
        src.onended=fin; src.start(ctx.currentTime+.02); setTimeout(fin,ab.duration*1000+2500); })
      .catch(()=>systemSpeak(text,fin,c));
    return;
  }
  systemSpeak(text,fin,c);
}
/* Callers sound like they're on the phone: band-limited (high-pass and low-pass), a nasal bump and a little distortion. */
let PHONE_SAT=null;   // built once, shared by every caller line
function phoneLine(){
  const hp=filt("highpass",420,.9), hp2=filt("highpass",380,.7), bump=filt("peaking",1600,1.2), lp=filt("lowpass",3300,.9), lp2=filt("lowpass",3600,.7);
  bump.gain.value=5; const sh=ctx.createWaveShaper(); sh.curve=PHONE_SAT||(PHONE_SAT=shaper(3.2)); sh.oversample="2x"; const out=G(.25);   // 1.14: was drive 1.6, out .85, which made callers 8-16 dB louder than the host; now 1-5 dB under it
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
function breakInfo(sp){ if(sp.kind==="hearye") return {kind:"hearye",station:"hearye",show:sp.show,episode:String(sp.title||""),title:sp.title&&sp.title!==sp.show?`${sp.show}: ${sp.title}`:sp.show,hosts:sp.hosts||""};
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
  if(k==="caller") return CALLERS.open.length?callerSegment():null;   // these two need their lines picked too: a bare {kind} had none and ended the break silently
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
function rebuildAudio(){ const old=ctx; recStop(true); if(fair){ fair.dead=true; clearTimeout(fair.t); clearTimeout(fair.pt); if(fair.amb) fair.amb.dead=true; fair=null; } clearTimeout(wybcT); if(amb){ try{ amb.inst.stop(); }catch(e){} amb=null; } ambIn=null; clearInterval(timer); for(const s of songs) try{ s.bus.disconnect(); }catch(e){} songs=[]; bed=null; speaking=false; voiceSrc=null;
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
STATIONS.splice(1,0,{id:"hearye",name:"HEARYE 95.5",freq:"95.5",tagline:"Renn Faire Radio. The Home of High Drama.",style:"Fantasy"});   // by frequency: 88.1, 95.5, 99.9, 108.0
const AMB=()=>typeof AmbientSoundtrack!=="undefined"?AmbientSoundtrack:(typeof globalThis!=="undefined"&&globalThis.AmbientSoundtrack)||null;
const TALK=typeof createTalk==="function"?createTalk(R):null;   // PTLK's show writer; without it PTLK is skipped
const STATION_TYPES={ wybc:[["ids","The whisper DJ"],["strings","Light strings"],["winds","Bass clarinet and bassoon"],["hall","Far-off concert hall sounds"],["room","Room tone and tape grain"]],
  ptlk:TALK?[...TALK.shows.map(x=>[x.id,x.label]),["ids","Station IDs"]]:[],
  hearye:typeof createFaire==="function"?[...createFaire(Math.random).shows.map(x=>[x.id,x.label]),["joust","The Royal Joust"],["ponies","The Royal Pony Pageant"],["news","Realm news (from Slack)"],["ads","Ads from the merchants"],["callers","Call-ins to the bard"],["ids","The crier and the bard"],["amb","Forest and meadow sounds"]]:[] };
const wybcTypes={ids:true,strings:true,winds:true,hall:true,room:true};
const ptlkTypes=Object.fromEntries(STATION_TYPES.ptlk.map(([k])=>[k,true]));
const stationOk=id=>id==="wybc"?!!AMB():id==="ptlk"?!!TALK:id==="hearye"?typeof createFaire==="function":id==="mdfm";
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
let station=STATIONS.some(s=>s.id===opts.station)&&stationOk(opts.station)?opts.station:"mdfm";
let amb=null, ambIn=null, wybcT=0, lastPiece="";
const stationInfo=id=>{ const s=STATIONS.find(x=>x.id===id); return s?{...s,available:stationOk(id)}:null; };
function ambSettings(){ const t=wybcTypes; return {strings:t.strings?1:0,winds:t.winds?1:0,hall:t.hall?1:0,room:t.room?1:0,grain:t.room?1:0}; }
function ambStart(fadeIn){
  const L=AMB(); if(!L||!ctx) return false;
  if(!ambIn||ambIn.context!==ctx){ ambIn=G(AMB_LEVEL); ambIn.connect(ST?ST.in:master); }
  const out=G(fadeIn?.0001:1); out.connect(ambIn); if(fadeIn) fadeTo(out.gain,1,fadeIn,ctx.currentTime);
  const inst=L.create({context:ctx,destination:out,pauseWhenHidden:false,settings:ambSettings(),mapNote:wybcMapNote});
  amb={inst,out}; try{ const p=inst.start(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} if(MXON.wybc) wybcMixApply();
  let title; do title=pick(PIECES); while(title===lastPiece&&PIECES.length>1); lastPiece=title;
  nowPlaying={station:"wybc",title,style:"Ambient piano",bpm:null,artist:wybcArtist()}; emit("nowplaying",nowPlaying);
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
function leaveStation(id,t){   // tune away: everything that station had going stops and fades
  recStop(true);
  if(id==="mdfm"){ clearInterval(timer); timer=0; fadeTo(musicDuck.gain,.0001,1.2,t); const old=songs, b=bed; songs=[]; bed=null;
    setTimeout(()=>{ for(const x of old) try{ x.bus.disconnect(); x.rvf.disconnect(); }catch(e){} if(b){ b.stopped=true; try{ b.bus.disconnect(); }catch(e){} } },1500); }
  else if(id==="wybc") wybcOff(1.2);
  else if(id==="ptlk") ptlkOff();
  else if(id==="hearye") fairOff();
}
function enterStation(id,t){
  if(id==="mdfm"){ fadeTo(musicDuck.gain,1,.3,t); startSong(t+.3,0); lastSpot=t; clearInterval(timer); timer=setInterval(tick,40); tick(); }
  else if(id==="wybc") wybcOn();
  else if(id==="ptlk") ptlkOn();
  else if(id==="hearye") fairOn();
}
function setStation(id){
  const s=stationInfo(id); if(!s||!s.available||id===station) return station; const was=station; station=id;
  if(on&&ctx){ gen++; const t=ctx.currentTime; hush(); leaveStation(was,t); enterStation(id,t); mxFxLevels(mixOf(id),t); }
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
    theme(b,t,k){ const s=SIX(this.bpm), prog=[0,5,3,4], arp=[0,7,12,15,12,7,3,7];
      PI.zap(b,t,1); for(let bar=0;bar<4;bar++){ const r=k+[0,8,5,7][bar]; for(let i=0;i<16;i++){ const tt=t+(bar*16+i)*s; PI.chip(b,tt,r+12+arp[i%8],s*.8,.9);
          if(i%4===0) D.kick(b,tt,.9); if(i===4||i===12) D.snare(b,tt,.6,.12); if(i%2) D.hat(b,tt,.25); if(i%2===0) PI.pulse(b,tt,r-12,s*1.5,.9); } void prog; }
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
      mel.forEach(([i,iv,len])=>PI.flute(b,t+i*s,k+12+iv,len*s*.95,1)); void dor;
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
      const d=S.bed.call(SS,b,t1,bar,S.key); if(MXON.ptlk){ mxBarSt=0; mxGroove("ptlk",b,t1,d); } if(GON.ptlk) gPump("ptlk",b,t1,d,bar,false); bed.next+=d*(gOn("ptlk","meter")?METERS[GRV.ptlk.meter].ratio:1); } bed.t=setTimeout(pump,400); };
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
  let ep; try{ ep=TALK.episode(s.id,data,ptlkState[s.id]||(ptlkState[s.id]={})); }catch(e){ ep=TALK.episode(s.id,null,ptlkState[s.id]); }
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
function fg(){ let g=FG.get(ctx); if(!g){ g={in:G(F_LEVEL),rev:ctx.createConvolver()}; g.in.connect(pre); g.rev.buffer=makeIR(ctx,2.8,1.9); const rl=filt("lowpass",5200),rg=G(.55); g.rev.connect(rl); rl.connect(rg); rg.connect(g.in); FG.set(ctx,g); } return g; }
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
  fiddle(b,t,m,dur,v=1,prev=null){ const f=mtof(m), a=osc("sawtooth",f), c=osc("sawtooth",f*1.004), hp=filt("highpass",260), bp=filt("peaking",2400,1.2), lp=filt("lowpass",4200,.7), g=ctx.createGain(), lfo=osc("sine",5.6), lg=ctx.createGain();
    bp.gain.value=5; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.011,t+Math.max(.05,Math.min(.5,dur*.6))); lfo.connect(lg); lg.connect(a.frequency); lg.connect(c.frequency);
    if(prev!=null&&prev!==m){ a.frequency.setValueAtTime(mtof(prev),t); a.frequency.exponentialRampToValueAtTime(f,t+.06); c.frequency.setValueAtTime(mtof(prev)*1.004,t); c.frequency.exponentialRampToValueAtTime(f*1.004,t+.06); }
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.042*v,t+.05); g.gain.setValueAtTime(.036*v,t+Math.max(.06,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.18);
    a.connect(hp); c.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.4); for(const x of [a,c,lfo]){ x.start(t); x.stop(t+dur+.25); } },
  chant(b,t,m,dur,v=1,vw="o"){   // a few monks in unison (Gregorian chant), with one an octave down for weight
    const mix=G(1), out=G(1), g=ctx.createGain(), f=mtof(m), vow=VOW[vw]||VOW.o, end=t+dur;
    vow.slice(0,2).forEach((F,k)=>{ const bp=filt("bandpass",F*(m>64?1:.86),[6,9][k]), fgn=G([2.6,1.2][k]); mix.connect(bp); bp.connect(fgn); fgn.connect(out); });
    [[0,-7,1],[0,7,1],[-12,-3,.5]].forEach(([iv,dt,a])=>{ const o=osc("sawtooth",mtof(m+iv)), og=G(a); o.detune.value=dt; o.connect(og); og.connect(mix); o.start(t); o.stop(end+.7); });
    const pk=.055*v; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.18); g.gain.setValueAtTime(pk,end); g.gain.exponentialRampToValueAtTime(.0001,end+.6);
    out.connect(g); g.connect(b.mu); to(g,b,.75); void f; },
  horn(b,t,notes,dur,v=1){ const lp=filt("lowpass",500,.9), g=ctx.createGain(), pk=.06*v/Math.sqrt(notes.length);
    lp.frequency.setValueAtTime(380,t); lp.frequency.exponentialRampToValueAtTime(1500,t+.09); lp.frequency.exponentialRampToValueAtTime(950,t+dur+.2);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+.07); g.gain.setValueAtTime(pk*.9,t+Math.max(.08,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.35);
    lp.connect(g); g.connect(b.mu); to(g,b,.55); notes.forEach(m=>{ for(const [ty,dt,a] of [["sawtooth",-5,1],["sawtooth",5,1],["triangle",0,1.4]]){ const o=osc(ty,mtof(m)), og=G(a); o.detune.value=dt; o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.4); } }); },
  shawm(b,t,m,dur,v=1){ const f=mtof(m), a=osc("square",f), c=osc("sawtooth",f*1.003), bp=filt("bandpass",1300,1.4), pk2=filt("peaking",2800,2), lp=filt("lowpass",5000), g=ctx.createGain(), lfo=osc("sine",5), lg=G(f*.006);
    pk2.gain.value=6; lfo.connect(lg); lg.connect(a.frequency); lg.connect(c.frequency); a.connect(bp); c.connect(bp); bp.connect(pk2); pk2.connect(lp); lp.connect(g); g.connect(b.mu); to(g,b,.35);
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
const LEAD_OCT={flute:12,fiddle:12,harp:12,lute:12,horn:0,brass:12,chant:0,choir:0,shawm:12,bells:24,strings:12};
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
  const T=target||150, secs=[["intro",4,0],["A",8,1],["A",8,2],["B",8,2],["bridge",4,1],["A",8,3]];
  let bars=secs.reduce((a,x)=>a+x[1],0)+4, k=0; while(bars*p.bs<T-p.bs*4&&k<12){ secs.push(k%2?["A",8,3]:["B",8,3]); bars+=8; k++; }
  secs.push(["outro",4,0]); let at=0; p.secs=secs.map(([t,n,l])=>{ const x={t,n,lvl:l,at}; at+=n; return x; }); p.bars=at; p.len=at*p.bs+3.5;
  return p;
}
function fBar(p,bar,t,b){   // schedules one bar of a piece
  if(b&&b.mxId){ if(p.st0==null){ p.st0=p.st; p.bs0=p.bs; }   // the style matrix (TUNE): tempo and groove pulls
    if(MXON.hearye){ p.st=p.st0/mxTempoMul("hearye",p.bpm); p.bs=p.st*p.steps; mxBarT0=t; mxBarSt=p.st; mxBarSteps=p.steps; mxGroove("hearye",b,t,p.bs); } else { p.st=p.st0; p.bs=p.bs0; }
    if(GON.hearye){ if(gOn("hearye","bpm")){ p.st=p.st0*p.bpm/GRV.hearye.bpm; p.bs=p.st*p.steps; } b.gGrid={t0:t,st:p.st,n:p.steps,bar}; const bs0=p.bs;   // the groove (TUNE): tempo, time signature, drums
      if(gOn("hearye","meter")&&p.S.sub!==3&&p.S.beats===4) p.bs=bs0*METERS[GRV.hearye.meter].ratio; gPump("hearye",b,t,bs0,bar,false); } }
  const sec=p.secs.find(x=>bar>=x.at&&bar<x.at+x.n); if(!sec) return; const i=bar-sec.at;
  const B=sec.t==="B", prog=B?p.progB:p.progA, deg=sec.t==="outro"?0:sec.t==="intro"?(i<2?0:prog[i%4]):prog[i%4];
  const mel=sec.t==="A"?(i<4?p.mA:p.mA2)[i%4]:B?(i<4?p.mB:p.mB2)[i%4]:sec.t==="bridge"?p.mB[i%4]:sec.t==="intro"&&i>=sec.n-2?p.mA[(i+2)%4]:null;
  const inst=B||sec.t==="bridge"?p.leads[1]:p.leads[0], oct=LEAD_OCT[inst]??12;
  const c={b,st:p.st,bs:p.bs,lvl:sec.t==="outro"?0:sec.lvl,i,n:sec.n,ch:fch(p,deg),sec:sec.t,bed:false,
    lead:()=>{ if(!mel) return; let prev=null; const v=sec.lvl>=3?1:.85; mel.forEach(([pos,len,d])=>{ const m=fsd(p,d)+oct; fLead(b,inst,t+pos*p.st,m,len*p.st*.95,v,prev); if(sec.lvl>=3&&p.leads[0]!==p.leads[1]&&sec.t==="A") fLead(b,p.leads[1],t+pos*p.st,m+(LEAD_OCT[p.leads[1]]??12)-oct,len*p.st*.95,.5,prev); prev=m; }); }};
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
  if(kind==="wind"){ const bp=filt("bandpass",420,.6); n.connect(bp); bp.connect(g); return {g,f:bp.frequency,base:.05*lvl,lo:250,hi:900}; }
  if(kind==="leaves"){ const hp=filt("highpass",3200); n.connect(hp); hp.connect(g); return {g,base:.012*lvl}; }
  if(kind==="low"){ const lp=filt("lowpass",160); n.connect(lp); lp.connect(g); return {g,base:.12*lvl}; }
  if(kind==="stream"){ const bp=filt("bandpass",2300,.5), hp=filt("highpass",800); n.connect(bp); bp.connect(hp); hp.connect(g); return {g,base:.03*lvl,flutter:true}; }
  if(kind==="rain"){ const hp=filt("highpass",1800), lp=filt("lowpass",7000); n.connect(hp); hp.connect(lp); lp.connect(g); return {g,base:.022*lvl}; }
  if(kind==="fire"){ const lp=filt("lowpass",300); n.connect(lp); lp.connect(g); return {g,base:.035*lvl}; }
  if(kind==="murmur"){ const mix=G(1); for(const [f,q] of [[330,3],[720,4],[1450,5]]){ const bp=filt("bandpass",f,q); n.connect(bp); bp.connect(mix); } mix.connect(g); return {g,base:.06*lvl,flutter:true,slow:true}; }
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
function ambFade(A,v,sec){ if(!A||!ctx) return; try{ fadeTo(A.out.gain,Math.max(.0001,v*A.sg),sec,ctx.currentTime); }catch(e){} }
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
  if(kind==="outro"){ const b=fBus(gn); const d=p.progA[3]; fBar({...p},p.secs.find(x=>x.t==="A"&&x.lvl===3).at+3,t,b); const e=t+p.bs; FI.strings(b,e,fch(p,0).map(x=>x-12),1.8,.9,{att:.05,rel:1.4}); [0,2,4,7].forEach((x,k)=>FI.harp(b,e+k*.06,fsd(p,x)+12,.5)); FI.drum(b,e,.7,50); M.bell(b,e,p.key+24,2,.3,0); void d; return p.bs+2.2; }
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
function fairOff(){ const st=fair; if(!st) return; st.dead=true; clearTimeout(st.t); clearTimeout(st.pt); fBedOff(st,.8); fairPieceEnd(st,1.2,true); ambKill(st.amb,1.2); st.amb=null; fair=null; }
const fairNp=p=>({title:p.title,artist:p.artist});
function fairAmb(st,scene,key){ if(!fairTypes.amb){ if(st.amb){ ambKill(st.amb,2); st.amb=null; } return; }
  if(st.amb&&st.amb.scene===scene) return; const old=st.amb; st.amb=ambNew(scene,key); ambFade(st.amb,1,4); if(old) ambKill(old,4);
  const A=st.amb, run=()=>{ if(A.dead||st.dead) return; ambRun(A,ctx.currentTime+1.2); A.t=setTimeout(run,500); }; run(); }
function fairAmbLevel(st,v,sec=2){ if(st&&st.amb) ambFade(st.amb,v,sec); }
function fairPieceStart(st){ const p=fairMakeNext(); st.next=null; if(!p) return; st.mode="piece"; const t0=ctx.currentTime+.15;
  const b=fBus(.0001), lv0=p.S.gain*SEC_GAIN[0]; b.mxId="hearye"; b.gKey={root:p.key,sc:p.sc}; b.gNoMeter=p.S.sub===3||p.S.beats!==4; b.gain.gain.setValueAtTime(.0001,ctx.currentTime); b.gain.gain.linearRampToValueAtTime(lv0,t0+.3);
  const pc={p,b,next:t0,bar:0,t0,done:false,lv:lv0,pend:[]}; st.piece=pc; st.since++;
  fairAmb(st,p.S.scene,p.key); fairAmbLevel(st,1,2);
  nowPlaying={station:"hearye",title:p.title,style:p.name,artist:p.artist,bpm:p.bpm}; emit("nowplaying",nowPlaying);
  const pump=()=>{ if(st.dead||st.piece!==pc) return;
    while(pc.bar<p.bars&&pc.next<ctx.currentTime+1.6){ const sec=p.secs.find(x=>pc.bar>=x.at&&pc.bar<x.at+x.n); if(sec&&pc.bar===sec.at&&pc.bar>0) pc.pend.push([pc.next,sec.t==="outro"?0:sec.lvl]);
      fBar(p,pc.bar,pc.next,b); pc.bar++; pc.next+=p.bs; }
    while(pc.pend.length&&pc.pend[0][0]<=ctx.currentTime+.05){ const l=pc.pend.shift()[1]; pc.lv=p.S.gain*SEC_GAIN[l]; if(!pc.duck) fadeTo(b.gain.gain,pc.lv,2,ctx.currentTime); if(st.mode==="piece") fairAmbLevel(st,AMB_SEC[l],3); }
    if(pc.bar>=p.bars){ if(ctx.currentTime>pc.next+2.4){ fairPieceEnd(st,.5); fairAfterPiece(st); return; } }
    st.pt=setTimeout(pump,300); };
  pump(); }
function fairPieceEnd(st,fade,quiet){ const pc=st&&st.piece; if(!pc) return; st.piece=null; clearTimeout(st.pt); try{ fadeTo(pc.b.gain.gain,.0001,fade,ctx.currentTime); }catch(e){} setTimeout(()=>{ try{ pc.b.gain.disconnect(); }catch(e){} },fade*1000+4500); st.last=pc.p; void quiet; }
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
  const W=[]; const shows=FAIRE.shows.filter(s=>fairTypes[s.id]&&!st.talkRecent.includes(s.id));
  if(shows.length) W.push(["show",4]); if(fairTypes.joust) W.push(["joust",1.1]); if(fairTypes.ponies) W.push(["ponies",.9]); if(fairTypes.callers) W.push(["callers",1.4]); if(fairTypes.ads) W.push(["ads",1.3]);
  if(fairTypes.news&&Date.now()-(st.lastNews||0)>20*60e3) W.push(["news",1.2]);
  if(!W.length) return []; let r=R()*W.reduce((a,x)=>a+x[1],0), k=W[0][0]; for(const [x,w] of W){ if((r-=w)<=0){ k=x; break; } }
  let L=[];
  if(k==="show"){ const s=pick(shows); st.talkRecent.push(s.id); while(st.talkRecent.length>Math.min(3,FAIRE.shows.length-1)) st.talkRecent.shift(); L=fairShowLines(FAIRE.show(s.id)); }
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
async function renderFaire(p){ let f=1; if(gOn("hearye","bpm")) f=p.bpm/GRV.hearye.bpm; else if(MXON.hearye){ for(const [k,w] of MXSH.hearye.sty) f/=Math.pow(MX_BPM[k]/p.bpm,w*.8); if(MXSH.hearye.chaos) f*=1.07; }
  if(gOn("hearye","meter")&&p.S.sub!==3&&p.S.beats===4) f*=METERS[GRV.hearye.meter].ratio; const secs=Math.min(700,(p.len-3.5)*f+4.5); const buffer=await renderOffline("fpiece",secs,p);
  let pk=0; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  const k=pk>0?Math.min(8,.89/pk):1; for(let c=0;c<2;c++){ const d=buffer.getChannelData(c); for(let i=0;i<d.length;i++) d[i]*=k; } return buffer; }
/* ---------- STYLE MATRIX (1.17): pull the station's music toward pop, hip-hop, rock, classical, country, galactic ----------
   The song on air sits in the middle. Each slider pulls it toward a style: the song keeps its own notes, chords, melody,
   form and rhythm, but its instruments are played as that style would play them (a piano chord becomes power chords,
   strings, a strum or a cosmic pad; a kick becomes a rock kick, timpani or a brushed beat), its groove moves (half-time
   snares and hat rolls, straight rock eighths, a train beat, no drums at all for classical), its tempo and swing move
   toward the style's, and the whole station gets the style's sound (drive, lo-fi, a concert hall, slapback, a phaser).
   Several sliders combine: each pulls in its own direction, weighted by how far up it is (tempos multiply). Past 100%
   in total the song's own sound is gone and the styles share it. CHAOS isn't a direction: it makes things go wrong
   (notes jump, instruments swap at random, stutters, tape stops, gate chops), worse the higher it goes.
   How: every instrument call carries its bus; buses of a station with its matrix up are rerouted note by note
   (morphCall). All at zero: nothing is rerouted or built, so every station sounds exactly as before. */
const MIX_KEYS=[["pop","POP","Pulls toward pop: a punchy kit and claps, synth bass, plucks and bright pads, about 118 BPM"],["hiphop","HIP-HOP","Pulls toward hip-hop: 808s, half-time snares, hat rolls, Rhodes, lo-fi, about 90 BPM, swung"],
  ["rock","ROCK","Pulls toward rock: power chords, a hard kit, straight eighths, drive, about 132 BPM"],["classical","CLASSICAL","Pulls toward classical: strings, timpani, violin and flute, no drum kit, a concert hall, about 84 BPM"],
  ["country","COUNTRY","Pulls toward modern country radio: big kit with claps and shakers, acoustic strum over palm-muted electric, banjo rolls, Telecaster twang, pedal steel, about 104 BPM"],["galactic","GALACTIC COSMOTOSIS","Pulls toward deep space: cosmic pads, theremin, star-dust bells, laser drums, a phaser and echo, about 76 BPM"],
  ["chaos","CHAOS","Not a direction: things go wrong on purpose. Notes jump, instruments swap, stutters and tape stops. Higher is worse"]];
const MX_DIRS=["pop","hiphop","rock","classical","country","galactic"];
const MX_ST_GAIN={hearye:.58,ptlk:.8};   // HEARYE's own instruments run softer than MDFM's
const MX_GAIN={pop:1.8,classical:1.9,country:1.5,galactic:1.35,rock:.85,hiphop:1};   // each style's parts at about the song's own loudness (measured)
const MX_BPM={pop:118,hiphop:90,rock:132,classical:84,country:104,galactic:76}, MX_SWING={hiphop:.6};
const MIXES={}, MXON={}, MXSH={};   // per station: the sliders, whether any is up, and the shares (orig, [[style,share]...], chaos)
const mixZero=()=>Object.fromEntries(MIX_KEYS.map(([k])=>[k,0]));
const mixOf=id=>MIXES[id]||(MIXES[id]=mixZero());
function mixShares(m){ const sum=MX_DIRS.reduce((a,k)=>a+(m[k]||0),0), o=Math.max(0,1-sum), sty=MX_DIRS.filter(k=>m[k]>.001).map(k=>[k,m[k]/Math.max(1,sum)]).sort((a,b)=>b[1]-a[1]);
  return {o,sty,chaos:m.chaos||0,sum}; }
let mixOut=null;   // the station chain's output (set in init), so the style's sound can be put in its path on demand
const MXF=new WeakMap(), MXS={trans:0,until:0};
let inMorph=false, mxBarT0=0, mxBarSt=0, mxBarSteps=16;   // where the bar being scheduled starts, for groove moves
// the station sound stage: drive (rock), lo-fi (hip-hop), concert hall (classical), slapback (country), brightness (pop),
// phaser and echo (galactic), and chaos's stutter, tape stop and gate. Put in the path the first time a slider goes up.
function mxStage(){ const S={in:G(1),out:G(1),tape:ctx.createDelay(1),dry:G(1),pre:G(1),ph:G(0),echo:G(0),drive:G(0),lofi:G(0),hall:G(0),slap:G(0),bright:filt("highshelf",5000),repIn:G(0),rep:ctx.createDelay(2),repFb:G(0),repOut:G(0),lfoG:[]};
  S.bright.gain.value=0; S.tape.delayTime.value=0; S.in.connect(S.tape); S.tape.connect(S.pre); S.pre.connect(S.bright); S.bright.connect(S.dry); S.dry.connect(S.out);
  let n=S.pre; S.lfo=osc("sine",.07); for(const f of [350,800,1600,3100]){ const a=filt("allpass",f,.8), d=G(0); n.connect(a); n=a; S.lfo.connect(d); d.connect(a.frequency); S.lfoG.push([d,f]); }
  n.connect(S.ph); S.ph.connect(S.dry); S.lfo.start();
  const dl=ctx.createDelay(1.5), fb=G(.5), lp=filt("lowpass",3800), hp=filt("highpass",400); dl.delayTime.value=.42; S.pre.connect(S.echo); S.echo.connect(hp); hp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(S.dry);
  S.mkDrive=()=>{ if(S.hasDrive) return; S.hasDrive=1; const sh=ctx.createWaveShaper(); sh.curve=shaper(4); sh.oversample="2x"; const dlp=filt("lowpass",5200), dhp=filt("highpass",90); S.pre.connect(dhp); dhp.connect(sh); sh.connect(dlp); dlp.connect(S.drive); S.drive.connect(S.dry); };   // built the first time it's needed (the convolver and shaper cost CPU even at zero)
  const lf=filt("lowpass",2600,.9), lf2=filt("highpass",120); S.pre.connect(lf); lf.connect(lf2); lf2.connect(S.lofi); S.lofi.connect(S.dry);
  S.mkHall=()=>{ if(S.hasHall) return; S.hasHall=1; const cv=ctx.createConvolver(); cv.buffer=makeIR(ctx,3.6,1.6); const cl=filt("lowpass",5000); S.pre.connect(cv); cv.connect(cl); cl.connect(S.hall); S.hall.connect(S.dry); };
  const sd=ctx.createDelay(.5); sd.delayTime.value=.11; const sl=filt("lowpass",3000); S.pre.connect(sd); sd.connect(sl); sl.connect(S.slap); S.slap.connect(S.dry);
  S.in.connect(S.repIn); S.repIn.connect(S.rep); S.rep.connect(S.repFb); S.repFb.connect(S.rep); S.rep.connect(S.repOut); S.repOut.connect(S.out);
  return S; }
function mxFx(){ if(!ctx||!ST) return []; let F=MXF.get(ctx); if(!F){ F=[]; MXF.set(ctx,F); }
  if(mixOut&&!F.some(s=>s.src===mixOut)){ const s=mxStage(); s.src=mixOut; try{ mixOut.disconnect(ST.in); }catch(e){} mixOut.connect(s.in); s.out.connect(ST.in); F.push(s); }
  if(ambIn&&ambIn.context===ctx&&!F.some(s=>s.src===ambIn)){ const s=mxStage(); s.src=ambIn; try{ ambIn.disconnect(ST.in); }catch(e){} try{ ambIn.disconnect(master); }catch(e){} ambIn.connect(s.in); s.out.connect(ST.in); F.push(s); }
  return F; }
function mxFxLevels(m,now,inst){ const F=MXF.get(ctx); if(!F) return; const sh=mixShares(m), w=k=>(sh.sty.find(x=>x[0]===k)||[0,0])[1];
  const g=w("galactic"), lo=w("hiphop"), dr=w("rock"), ha=w("classical"), sl=w("country"), br=w("pop"), dry=1-.55*lo-.35*dr;
  for(const S of F){ const T=(p,v)=>inst?p.setValueAtTime(v,now):p.setTargetAtTime(v,now,.4); if(dr>0) S.mkDrive(); if(ha>0) S.mkHall();
    T(S.ph.gain,.7*g); T(S.echo.gain,.32*g); for(const [d,f] of S.lfoG) T(d.gain,f*.65*g); T(S.drive.gain,.55*dr); T(S.lofi.gain,.75*lo); T(S.pre.gain,Math.max(.25,dry)); T(S.hall.gain,.5*ha); T(S.slap.gain,.16*sl); T(S.bright.gain,4*br+2.5*sl); } }
// what each instrument is, and where its loudness is: [role, index of velocity in the arguments after the bus]
const MX_ROLE={D:{kick:["kick",1],snare:["snare",1],clap:["clap",1],snap:["snare",1],rim:["perc",1],hat:["hat",1],conga:["perc",1],tom:["tom",1],crash:["crash",1],shaker:["shaker",1],cowbell:["perc",3],b808:["bass",3],logdrum:["bass",2]},
  M:{piano:["chord",3],rhodes:["chord",3],organ:["chord",3],pad:["pad",3],choir:["pad",3],saw:["chord",3],accordion:["chord",3],brass:["chord",3],guitar:["gchord",3],bell:["lead",3],pluck:["lead",3],whistle:["lead",3],bass:["bass",3],vox:["lead",3],chop:["lead",3]},
  FI:{harp:["lead",2],strings:["pad",3],fiddle:["lead",3],chant:["lead",3],horn:["chord",3],shawm:["lead",3],drone:["pad",3],drum:["kick",1],frame:["perc",1],tamb:["shaker",1],hat:["hat",1],synbass:["bass",3],strum:["chord",2],organ:["chord",3],pipe:["lead",3],lute:["lead",2],flute:["lead",3]},
  PI:{lute:["lead",2],flute:["lead",3],timp:["tom",2],pulse:["bass",3],chip:["lead",3]}};
function noteInfo(role,a){ const t=a[0]; if(role==="chord"||role==="pad"){ const notes=Array.isArray(a[1])?a[1]:[a[1]]; return {t,notes,m:notes[0],dur:role==="chord"&&typeof a[2]!=="number"?.6:+a[2]||.5}; }
  if(role==="gchord") return {t,notes:[a[1],a[1]+7,a[1]+12],m:a[1],dur:+a[2]||.3};
  if(role==="bass"||role==="lead") return {t,m:a[1],notes:[a[1]],dur:typeof a[2]==="number"?a[2]:.5};
  return {t,open:role==="hat"?!!a[2]:false}; }
const pitch=(n,lo,hi)=>{ while(n<lo) n+=12; while(n>hi) n-=12; return n; };
// how each style plays each part (s: the bus, i: the note, v: loudness). null: the style leaves it out.
const MX_SUB={
  pop:{kick:(s,i,v)=>D.kick(s,i.t,v*1.05),snare:(s,i,v)=>{ D.clap(s,i.t,v*.8,.3); D.snare(s,i.t,v*.35,.2); },clap:(s,i,v)=>D.clap(s,i.t,v,.3),hat:(s,i,v)=>FI.hat(s,i.t,v,i.open),shaker:(s,i,v)=>FI.hat(s,i.t,v*.8),perc:(s,i,v)=>D.snap(s,i.t,v*.8),crash:(s,i,v)=>D.crash(s,i.t,v),tom:(s,i,v)=>D.tom(s,i.t,v),
    bass:(s,i,v)=>FI.synbass(s,i.t,pitch(i.m,33,48),Math.min(i.dur,.6),v),chord:(s,i,v)=>{ i.notes.slice(0,4).forEach((n,k)=>M.pluck(s,i.t+k*.03,pitch(n,60,79),.22,v*.8)); M.saw(s,i.t,i.notes.map(n=>pitch(n,55,74)),Math.min(i.dur,.5),v*.35); },
    pad:(s,i,v)=>M.pad(s,i.t,i.notes.map(n=>pitch(n,55,76)),i.dur,v,2400),lead:(s,i,v)=>{ M.pluck(s,i.t,pitch(i.m,64,84),Math.min(i.dur,.4),v*1.1); if(i.dur>.3) M.vox(s,i.t,pitch(i.m,60,79),i.dur,v*.55,{vw:"o"}); }},
  hiphop:{kick:(s,i,v)=>D.kick(s,i.t,v,.92),snare:(s,i,v)=>{ D.clap(s,i.t,v*.7,.35); D.snare(s,i.t,v*.5,.35); },clap:(s,i,v)=>D.clap(s,i.t,v,.35),hat:(s,i,v)=>{ FI.hat(s,i.t,v); if(R()<.18) for(let r=1;r<3;r++) FI.hat(s,i.t+r*.045,v*.6); },shaker:(s,i,v)=>FI.hat(s,i.t,v*.7),perc:(s,i,v)=>D.rim(s,i.t,v),crash:(s,i,v)=>D.crash(s,i.t,v*.4),tom:(s,i,v)=>D.tom(s,i.t,v),
    bass:(s,i,v)=>{ const m=pitch(i.m,28,40); D.b808(s,i.t,m,Math.max(.25,i.dur),v,R()<.15?m+(R()<.5?5:7):null); },chord:(s,i,v)=>M.rhodes(s,i.t,i.notes.map(n=>pitch(n,52,72)),i.dur,v*.9),pad:(s,i,v)=>M.rhodes(s,i.t,i.notes.map(n=>pitch(n,52,72)),i.dur,v*.7),
    lead:(s,i,v)=>M.bell(s,i.t,pitch(i.m,67,86),Math.min(i.dur,.6),v*.9)},
  rock:{kick:(s,i,v)=>D.kick(s,i.t,v*1.1,1.05),snare:(s,i,v)=>D.snare(s,i.t,v*1.1,.45),clap:(s,i,v)=>D.snare(s,i.t,v,.45),hat:(s,i,v)=>FI.hat(s,i.t,v*1.1,R()<.25),shaker:(s,i,v)=>FI.hat(s,i.t,v),perc:(s,i,v)=>D.rim(s,i.t,v),crash:(s,i,v)=>D.crash(s,i.t,v*1.1),tom:(s,i,v)=>D.tom(s,i.t,v*1.1),
    bass:(s,i,v)=>M.bass(s,i.t,pitch(i.m,33,48),i.dur,v*1.1),chord:(s,i,v)=>M.guitar(s,i.t,pitch(i.notes[0],40,52),Math.max(.18,i.dur),v*1.2,i.dur<.2),gchord:(s,i,v)=>M.guitar(s,i.t,i.m,Math.max(.18,i.dur),v*1.2,i.dur<.2),
    pad:(s,i,v)=>M.guitar(s,i.t,pitch(i.notes[0],40,52),i.dur,v),lead:(s,i,v)=>M.saw(s,i.t,[pitch(i.m,60,79)],i.dur,v*.9)},
  classical:{kick:(s,i,v)=>PI.timp(s,i.t,pitch(i.m||41,38,45),v*.55),snare:(s,i,v)=>{ if(R()<.3) PI.roll(s,i.t,45,.18,v*.25); },clap:null,hat:null,shaker:null,perc:null,crash:(s,i,v)=>D.crash(s,i.t,v*.3),tom:(s,i,v)=>PI.timp(s,i.t,43,v*.6),
    bass:(s,i,v)=>FI.strings(s,i.t,[pitch(i.m,36,50)],Math.max(.2,i.dur),v*1.5,{att:.06,rel:.3,bright:900,thin:true}),chord:(s,i,v)=>FI.strings(s,i.t,i.notes.map(n=>pitch(n,52,74)),Math.max(.3,i.dur),v*1.1,{att:.12,rel:.5,bright:1800}),
    gchord:(s,i,v)=>FI.strings(s,i.t,i.notes.map(n=>pitch(n,48,67)),Math.max(.3,i.dur),v,{att:.08,rel:.4,bright:1600}),pad:(s,i,v)=>FI.strings(s,i.t,i.notes.map(n=>pitch(n,52,76)),i.dur,v,{att:.4,rel:.8,bright:1500}),
    lead:(s,i,v)=>i.dur>.25?FI.fiddle(s,i.t,pitch(i.m,62,84),i.dur,v*1.1):PI.flute(s,i.t,pitch(i.m,67,86),Math.max(.12,i.dur),v)},
  country:{kick:(s,i,v)=>D.kick(s,i.t,v*.95),snare:(s,i,v)=>{ D.snare(s,i.t,v*.75,.3); D.clap(s,i.t,v*.45,.25); },clap:(s,i,v)=>D.clap(s,i.t,v*.8,.25),hat:(s,i,v)=>FI.hat(s,i.t,v*.9),shaker:(s,i,v)=>D.shaker(s,i.t,v),perc:(s,i,v)=>D.snap(s,i.t,v*.8),crash:(s,i,v)=>D.crash(s,i.t,v*.8),tom:(s,i,v)=>D.tom(s,i.t,v),
    bass:(s,i,v)=>M.bass(s,i.t,pitch(i.m,33,45),Math.min(i.dur,.45),v),
    chord:(s,i,v)=>{ const n=i.notes.map(x=>pitch(x,52,69)); FI.strum(s,i.t,n,v*1.05,.012); M.guitar(s,i.t,pitch(i.notes[0],40,52),Math.min(.22,i.dur),v*.55,true); if(R()<.35) FI.banjo(s,i.t,n,v*.7); },
    gchord:(s,i,v)=>{ FI.strum(s,i.t,i.notes.map(x=>pitch(x,52,69)),v*1.05,.012); M.guitar(s,i.t,i.m,Math.min(.22,i.dur),v*.55,true); },
    pad:(s,i,v)=>{ const n=pitch(i.notes[i.notes.length-1],62,76); M.whistle(s,i.t,n,i.dur,v*.5,n-2); },lead:(s,i,v)=>FI.tele(s,i.t,pitch(i.m,60,79),Math.max(.12,i.dur),v)},
  galactic:{kick:(s,i,v)=>{ D.kick(s,i.t,v*.7,.85); },snare:(s,i,v)=>{ PI.zap(s,i.t,v*.6,2600,180); D.clap(s,i.t,v*.25,.7); },clap:(s,i,v)=>PI.zap(s,i.t,v*.5,3000,240),hat:(s,i,v)=>M.bell(s,i.t,pitch(84+Math.floor(R()*12),84,100),.08,v*.2,R()-.5),shaker:(s,i,v)=>M.bell(s,i.t,96,.06,v*.12,R()-.5),perc:(s,i,v)=>PI.zap(s,i.t,v*.4,1800,300),crash:(s,i,v)=>D.riser(s,i.t,.8),tom:(s,i,v)=>PI.zap(s,i.t,v*.6,900,60),
    bass:(s,i,v)=>PI.pulse(s,i.t,pitch(i.m,33,45),Math.max(.2,i.dur),v*1.4),chord:(s,i,v)=>M.pad(s,i.t,i.notes.map(n=>pitch(n,60,84)),Math.max(.6,i.dur*1.4),v*1.1,3800),pad:(s,i,v)=>M.pad(s,i.t,i.notes.map(n=>pitch(n,60,84)),i.dur*1.2,v,3800),
    lead:(s,i,v)=>{ const n=pitch(i.m,67,88); M.whistle(s,i.t,n,Math.max(.15,i.dur),v*.8,n-(R()<.5?2:-3)); if(R()<.3) M.bell(s,i.t,n+12,i.dur,v*.25); }},
};
MX_SUB.rock.chord.g=1;
// modern country: a twangy Telecaster lead (bends up into longer notes) and a picked banjo roll
FI.tele=(b,t,m,dur,v=1)=>{ const f=mtof(m), o=osc("sawtooth",f), o2=osc("square",f*2), g2=G(.25), bp=filt("bandpass",1900,1.1), pk=filt("peaking",3200,2), g=ctx.createGain(); pk.gain.value=7;
  if(dur>.3){ o.frequency.setValueAtTime(f*.89,t); o.frequency.exponentialRampToValueAtTime(f,t+.12); }
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.05*v,t+.004); g.gain.exponentialRampToValueAtTime(.022*v,t+Math.min(.25,dur)); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.08);
  o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(pk); pk.connect(g); g.connect(b.mu); to(g,b,.25); o.start(t); o2.start(t); o.stop(t+dur+.1); o2.stop(t+dur+.1); };
FI.banjo=(b,t,notes,v=1)=>{ const ns=[notes[0]+12,notes[1]+12,notes[2]+12,notes[0]+24], st=.085; for(let k=0;k<6;k++){ const tt=t+k*st, f=mtof(ns[[0,1,3,2,1,3][k]]), o=osc("square",f), hp=filt("highpass",900), g=ctx.createGain();
    env(g,tt,.001,.035*v,.16); o.connect(hp); hp.connect(g); g.connect(b.mu); o.start(tt); o.stop(tt+.2); } };
/* One instrument call on a station whose matrix is up: the song's own part (quieter as the sliders go up) plus the same
   notes played the styles' way, louder the further each slider is pulled (equal power, so the loudness holds). */
function morphCall(id,role,vi,f,self,s,a){
  const sh=MXSH[id]; if(!sh){ return f.call(self,s,...a); } inMorph=true;
  try{
    const vel=typeof a[vi]==="number"?a[vi]:1, info=noteInfo(role,a);
    const tr=MXS.until>info.t?MXS.trans:0; if(tr&&info.notes){ info.notes=info.notes.map(n=>n+tr); info.m+=tr; }
    // groove: where in the bar this lands (16ths)
    const pos=mxBarSt>0?Math.round((info.t-mxBarT0)/mxBarSt*16/mxBarSteps):-1;
    if(sh.chaos>0&&R()<sh.chaos*.35){ const k=MX_DIRS[Math.floor(R()*6)], g=MX_SUB[k][role==="gchord"&&!MX_SUB[k].gchord?"chord":role];
      if(info.notes&&R()<sh.chaos*.4){ const j=[12,-12,7,-5,1,6][Math.floor(R()*6)]; info.notes=info.notes.map(n=>n+j); info.m+=j; }
      if(g) g(s,info,vel); else f.call(self,s,...a); return; }
    if(sh.o>.02){ const b=[...a]; if(typeof b[vi]==="number") b[vi]*=Math.sqrt(sh.o); else b[vi]=Math.sqrt(sh.o); if(tr&&info.notes){ if(Array.isArray(b[1])) b[1]=b[1].map(n=>n+tr); else if(typeof b[1]==="number"&&role!=="kick"&&role!=="snare") b[1]+=tr; } f.call(self,s,...b); }
    for(const [k,w] of sh.sty.slice(0,2)){ const S=MX_SUB[k]; let fn=S[role]; if(role==="gchord"&&!fn) fn=S.chord; if(fn===null) continue; if(!fn){ continue; }
      let t=info.t;
      if(pos>=0){   // groove moves
        if(k==="hiphop"&&(role==="snare"||role==="clap")){ if(pos%16===12) continue; if(pos%16===4) t=mxBarT0+8*mxBarSt*mxBarSteps/16; }
        if(k==="rock"&&role==="hat"&&pos%2===1) continue;
        if(k==="classical"&&role==="kick"&&pos%16!==0) continue; }
      fn(s,{...info,t},vel*Math.sqrt(w)*(MX_GAIN[k]||1)*(MX_ST_GAIN[id]||1)); }
  }catch(e){} finally{ inMorph=false; }
}
// wrap every instrument once: unchanged unless its bus belongs to a station with its matrix up
for(const [objName,map] of Object.entries(MX_ROLE)){ const obj={D,M,FI,PI}[objName];
  for(const [name,[role,vi]] of Object.entries(map)){ const f=obj[name]; if(typeof f!=="function") continue;
    obj[name]=function(s,...a){ const id=s&&s.mxId; if(inMorph||!id||!(MXON[id]||GON[id])) return f.call(this,s,...a);
      if(GON[id]){ let out; try{ out=grooveArgs(id,role,vi,s,a,objName); }catch(e){ out=[a]; } let r; for(const b of out) r=MXON[id]?morphCall(id,role,vi,f,this,s,b):f.call(this,s,...b); return r; }   // the groove and key (TUNE) first, then the style matrix
      return morphCall(id,role,vi,f,this,s,a); }; } }
// style grooves the song doesn't have: hip-hop hat rolls, rock eighths and crashes, country's brushed train beat, pop claps
function mxGroove(id,s,t0,bs){ const sh=MXSH[id]; if(!sh) return; inMorph=true;
  try{ const st=bs/16;
    for(const [k,w] of sh.sty.slice(0,2)){ const v=Math.sqrt(w);
      if(k==="hiphop"){ for(let i=0;i<16;i+=2) FI.hat(s,t0+i*st,.5*v); if(R()<.6){ const r=t0+st*(R()<.5?6:14); for(let j=0;j<4;j++) FI.hat(s,r+j*st/2,.45*v); } }
      if(k==="rock"){ for(let i=0;i<16;i+=2) FI.hat(s,t0+i*st,.45*v); if(R()<.3) D.crash(s,t0,.5*v); }
      if(k==="country"){ for(let i=0;i<16;i+=2) D.shaker(s,t0+i*st,(i%4?.5:.8)*v); D.snap(s,t0+4*st,.35*v); D.snap(s,t0+12*st,.35*v); }
      if(k==="pop"){ D.clap(s,t0+4*st,.35*v,.3); D.clap(s,t0+12*st,.35*v,.3); } }
    if(sh.chaos>0&&R()<.15+.6*sh.chaos) mxChaos(s,t0,bs,sh.chaos);
  }catch(e){} finally{ inMorph=false; } }
const MX_SFX=["crash","applause","horse","thunder","claps","teacup","hammer","knock","zap","beeps","theremin","printer","crank"];
function mxChaos(s,t,bs,v){ const F=mxFx(), e=R(), beat=bs/4, T=t+bs*(R()<.5?.5:.75), end=t+bs;
  if(e<.24){ const L=beat*(R()<.5?.25:.5); for(const S of F){ S.rep.delayTime.setValueAtTime(L,T); S.repIn.gain.setValueAtTime(1,T); S.repIn.gain.setValueAtTime(0,T+L); S.repFb.gain.setValueAtTime(1,T+L); S.repOut.gain.setValueAtTime(1,T+L);
      S.dry.gain.setValueAtTime(1,T+L); S.dry.gain.linearRampToValueAtTime(0,T+L+.01); S.repFb.gain.setValueAtTime(0,end); S.repOut.gain.setValueAtTime(0,end); S.dry.gain.setValueAtTime(0,end); S.dry.gain.linearRampToValueAtTime(1,end+.01); } }
  else if(e<.38&&v>.3){ const T2=end-Math.min(.8,beat*1.5); for(const S of F){ S.tape.delayTime.setValueAtTime(0,T2); S.tape.delayTime.linearRampToValueAtTime(.5,end-.02); S.dry.gain.setValueAtTime(1,T2); S.dry.gain.linearRampToValueAtTime(0,end-.02);
      S.tape.delayTime.setValueAtTime(0,end); S.dry.gain.setValueAtTime(0,end+.005); S.dry.gain.linearRampToValueAtTime(1,end+.02); } }
  else if(e<.55){ for(const S of F){ for(let k=0;k<4;k++) S.dry.gain.setValueAtTime(k%2?0:1,T+k*beat/4); S.dry.gain.setValueAtTime(1,T+beat); } }
  else if(e<.75){ MXS.trans=[-5,-2,-1,1,2,3,6][Math.floor(R()*7)]; MXS.until=t+bs*(2+Math.floor(R()*4)); }
  else { const k=MX_SFX[Math.floor(R()*MX_SFX.length)], f=OT[k]; if(f) f(otBus(),T); else PI.zap(s,T,v); } }
// tempo and swing pull (MDFM songs and HEARYE pieces): tempos multiply, each weighted by its share
function mxTempoMul(id,bpm){ const sh=MXSH[id]; if(!sh) return 1; let l=0; for(const [k,w] of sh.sty) l+=w*.8*Math.log(MX_BPM[k]/bpm); return Math.exp(l)*(sh.chaos>0?1+(R()-.5)*.12*sh.chaos:1); }
function mxSwing(id,sw){ const sh=MXSH[id]; if(!sh) return sw; let x=sw*(sh.o+sh.sty.reduce((a,[k,w])=>a+(MX_SWING[k]?0:w),0)); for(const [k,w] of sh.sty) if(MX_SWING[k]) x+=w*MX_SWING[k]; return x; }
function mxSong(s,step){ if(step%16!==0) return; if(s.sp0==null){ s.sp0=s.sp; s.swing0=s.swing; }
  if(!MXON.mdfm&&!GON.mdfm){ s.sp=s.sp0; s.swing=s.swing0; return; }
  const mul=MXON.mdfm?mxTempoMul("mdfm",s.bpm):1; s.sp=gOn("mdfm","bpm")?15/GRV.mdfm.bpm:s.sp0/mul; s.swing=gSwingRatio("mdfm",MXON.mdfm?mxSwing("mdfm",s.swing0):s.swing0);
  if(MXON.mdfm){ mxBarT0=s.next; mxBarSt=s.sp; mxBarSteps=16; mxGroove("mdfm",s,s.next,16*s.sp); } }
function setMix(id,vals){ const m=mixOf(id); for(const [k] of MIX_KEYS) if(vals&&k in vals){ const x=+vals[k]; if(Number.isFinite(x)) m[k]=Math.max(0,Math.min(1,x)); }
  MXON[id]=MIX_KEYS.some(([k])=>m[k]>.001); MXSH[id]=MXON[id]?mixShares(m):null;
  if(ctx&&station===id){ if(MXON[id]) mxFx(); mxFxLevels(m,ctx.currentTime); }
  if(id==="wybc"){ wybcMixApply(); wybcMixPump(); } return {...m}; }
// WYBC: Collin's piano can't be re-voiced note by note, so the pull works through its own controls (pace, how busy the
// melody is, strings, winds, warmth, space) plus a rhythm section in the style that follows the piano's chord.
const WYBC_PULL={pop:{tempo:1.15,notes:.7,strings:.8,winds:.5},hiphop:{tempo:.8,notes:.35,warmth:.8,strings:.5},rock:{tempo:1.35,notes:.95,strings:.3,winds:.3},
  classical:{tempo:.9,notes:.6,strings:1.5,winds:1.4,space:.75},country:{tempo:1.1,notes:.65,winds:.4,warmth:.7},galactic:{tempo:.7,notes:.3,space:1,strings:1.3}};
function wybcPull(){ const sh=MXSH.wybc, base={tempo:1,notes:.5,strings:wybcTypes.strings?1:0,winds:wybcTypes.winds?1:0,warmth:.5,space:.5}, v={};   // the generator's settings, pulled
  for(const k in base){ let x=base[k]; if(sh) for(const [st,w] of sh.sty){ const p=WYBC_PULL[st]; if(p&&k in p&&!((k==="strings"&&!wybcTypes.strings)||(k==="winds"&&!wybcTypes.winds))) x+=w*(p[k]-base[k]); } v[k]=x; } if(gOn("wybc","bpm")) v.tempo=Math.max(.35,Math.min(3,GRV.wybc.bpm/50)); return v; }   // the generator's pace: a piano step a beat, 50 BPM at 1
function wybcMixApply(){ const a=amb&&amb.inst; if(!a||!a.set) return; const v=wybcPull(); for(const k in v){ try{ a.set(k,v[k]); }catch(e){} } }
let wybcMixT=0, wybcMixNext=0;
const WYBC_RS={mxId:null};
const wybcMapNote=m=>{ if(!GON.wybc) return m; const f=gKeyMap("wybc",62,MA); return f?f(m):m; };   // the piano is in D major; TUNE's key and mode move it
let wybcBar=0;
function wybcTriad(x){ if(!x||x.length<3) return [50,54,57]; const r=x[0], iv=n=>(n-r+120)%12, th=x.find(n=>iv(n)===3||iv(n)===4), fi=x.find(n=>iv(n)===7||iv(n)===6); return [r,th??r+4,fi??r+7]; }
// one bar of the style's rhythm section over the piano's chord (live from the pump; offline, Save, from the generator's onChord)
function wybcRhythm(rs,t0,bs,ch,sh){ const st=bs/16, GW=GON.wybc; inMorph=true;
  if(GW){ rs.gGrid={t0,st,n:16,bar:wybcBar++}; ch=ch.map(wybcMapNote); }
  const H=(fn,role,t,v,info)=>{ if(!fn) return; if(!GW){ fn(rs,info(t),v); return; } for(const [tt,vv] of gEv("wybc",rs,role,t,v,"X")) fn(rs,info(tt),vv); };   // through the groove (TUNE)
  try{ for(const [k,w] of sh.sty){ const S=MX_SUB[k], v=Math.sqrt(w)*.7, I=t=>({t,m:ch[0],notes:ch,dur:st*3});
      if(k!=="classical"&&k!=="galactic"){ H(S.kick,"kick",t0,v,I); H(S.kick,"kick",t0+8*st,v*.8,I); H(S.snare,"snare",t0+(k==="hiphop"?8:4)*st,v,I); if(k!=="hiphop") H(S.snare,"snare",t0+12*st,v,I); for(let i=0;i<16;i+=2) H(S.hat,"hat",t0+i*st,v*.6,I); }
      if(k==="galactic"){ H(S.chord,"chord",t0,v*.6,t=>({t,notes:ch,m:ch[0],dur:bs})); H(S.lead,"lead",t0+bs*.5,v*.6,t=>({t,m:ch[2]+12,notes:[ch[2]],dur:bs*.4})); }
      if(k==="classical") H(S.kick,"kick",t0,v,I);
      H(S.bass,"bass",t0,v,t=>({t,m:ch[0],notes:[ch[0]],dur:bs*.45})); H(S.bass,"bass",t0+bs*.5,v*.85,t=>({t,m:ch[0]+(k==="country"?7:0),notes:[ch[0]],dur:bs*.45})); }
    if(sh.chaos>0&&R()<.15+.6*sh.chaos) mxChaos(rs,t0,bs,sh.chaos); }catch(e){} finally{ inMorph=false; }
  if(GW&&sh.sty.length) gPump("wybc",rs,t0,bs,rs.gGrid.bar,false); }
function wybcRS(){ let rs=MXF.get(ctx)&&MXF.get(ctx).rs; if(!rs){ const g=G(.7); g.connect(pre); rs=makeBus(g,fxRev); (MXF.get(ctx)||MXF.set(ctx,[]).get(ctx)).rs=rs; } return rs; }
function wybcMixPump(){ clearTimeout(wybcMixT); wybcMixT=0; if(!on||station!=="wybc"||!MXON.wybc||!ctx) return; const sh=MXSH.wybc; if(!sh.sty.length&&!sh.chaos) return;
  if(wybcMixNext<ctx.currentTime+.05) wybcMixNext=ctx.currentTime+.1;
  const rs=wybcRS();
  while(wybcMixNext<ctx.currentTime+1.4){ let x=null; try{ x=amb&&amb.inst&&amb.inst.chord&&amb.inst.chord(); }catch(e){}
    const bs=2.4*(amb&&amb.inst&&amb.inst.get?1/(amb.inst.get("tempo")||1):1);
    wybcRhythm(rs,wybcMixNext,bs,wybcTriad(x),sh); wybcMixNext+=bs; }
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
const METERS={"3/4":{name:"3/4",map:[0,1,2,3,4,5,6,7,8,9,10,11]},"6/8":{name:"6/8",map:[0,1,2,3,4,5,8,9,10,11,12,13]},
  "5/4":{name:"5/4",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,8,9,10,11]},"7/8":{name:"7/8",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13]},
  "7/4":{name:"7/4",map:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11]}};
for(const k in METERS){ const M=METERS[k]; M.slots=Array.from({length:16},()=>[]); M.map.forEach((p,j)=>M.slots[p].push(j)); M.ratio=M.map.length/16; }
const GROOVE_DEF={bpm:0,meter:"",swing:.5,length:.5,root:-1,mode:"",density:.5,fills:.5,feel:.5,humanize:0,drums:.5};
const GROOVE_KEYS=[["bpm","BPM","The tempo. All the way left: the song's own"],["meter","TIME","Time signature: the song's own 4/4, or 3/4, 6/8, 5/4, 7/8, 7/4"],
  ["swing","SWING","Straight to heavy swing (the middle is the song's own)"],["length","LENGTH","How long each song or piece runs (the middle is as written); from the next song"],
  ["root","KEY","The key the song is played in"],["mode","MODE","The scale: major, minor, the church modes and the strange ones"],
  ["density","DENSITY","Sparse to busy drums"],["fills","FILLS","No fills to a fill every few bars"],["feel","FEEL","Half time, normal or double time"],
  ["humanize","HUMANIZE","Tight to loose: timing and touch, like a drummer"],["drums","DRUMS","The drum kit's level: off to loud"]];
const GRV={}, GON={};
const grvOf=id=>GRV[id]||(GRV[id]={...GROOVE_DEF});
const GSUP={mdfm:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},hearye:{bpm:1,meter:1,swing:1,length:1,key:1,drums:1},
  ptlk:{bpm:1,meter:1,swing:1,length:0,key:1,drums:1},wybc:{bpm:1,meter:0,swing:1,length:1,key:1,drums:1}};
const GDRUM=new Set(["kick","snare","clap","hat","perc","shaker","tom","crash"]);
function cleanGroove(v){ const o={}; if(!v) return o;
  if("bpm" in v){ const x=+v.bpm; o.bpm=Number.isFinite(x)&&x>=30?Math.max(40,Math.min(220,Math.round(x))):0; }
  if("meter" in v) o.meter=METERS[v.meter]?v.meter:"";
  if("root" in v){ const x=Math.round(+v.root); o.root=Number.isFinite(x)&&x>=0&&x<12?x:-1; }
  if("mode" in v) o.mode=KEY_MODE[v.mode]?v.mode:"";
  if("feel" in v){ const x=+v.feel; o.feel=!Number.isFinite(x)?.5:x<.25?0:x>.75?1:.5; }
  for(const k of ["swing","length","density","fills","humanize","drums"]) if(k in v){ const x=+v[k]; if(Number.isFinite(x)) o[k]=Math.max(0,Math.min(1,x)); }
  return o; }
const grvIsDef=g=>Object.keys(GROOVE_DEF).every(k=>typeof GROOVE_DEF[k]==="number"?Math.abs(g[k]-GROOVE_DEF[k])<.005:g[k]===GROOVE_DEF[k]);
const gOn=(id,k)=>{ const g=GON[id]&&GRV[id]; if(!g) return false;
  return k==="key"?(g.root>=0||!!g.mode):k==="meter"?!!g.meter&&GSUP[id]&&GSUP[id].meter:k==="bpm"?g.bpm>0:k==="length"?Math.abs(g.length-.5)>.005:true; };
const gLenMul=id=>{ const v=gOn(id,"length")?GRV[id].length:.5; return v<.5?.5+v:1+(v-.5)*4; };   // 0.5x .. 3x
const gSwingRatio=(id,base)=>{ const v=GON[id]?GRV[id].swing:.5; if(Math.abs(v-.5)<.005) return base; return v<.5?.5+(base-.5)*v*2:base+(Math.max(base,.72)-base)*(v-.5)*2; };
const gDrumLv=v=>v<.5?Math.pow(v*2,1.6):1+(v-.5)*2;   // off .. x2 (+6 dB)
// key: each note's scale degree in the song's key, moved to the same degree of the chosen key and mode (chromatic notes keep their offset)
function gKeyMap(id,root,sc){ const g=GRV[id]; if(!gOn(id,"key")||!sc) return null; const tsc=g.mode?KEY_MODE[g.mode]:sc, rpc=((root%12)+12)%12;
  const shift=g.root>=0?((g.root-rpc+18)%12)-6:0;
  return m=>{ if(typeof m!=="number"||!Number.isFinite(m)||m!==Math.round(m)) return m; const rel=m-root, oct=Math.floor(rel/12), pc=rel-12*oct;
    let k=0; for(let j=0;j<7;j++) if(sc[j]<=pc) k=j; return root+shift+12*oct+tsc[k]+(pc-sc[k]); }; }
const gKeyName=(id,rootPc,scName)=>{ const g=GRV[id]; if(!gOn(id,"key")) return null; const r=g.root>=0?g.root:rootPc, md=g.mode?KEY_MODES.find(x=>x[0]===g.mode)[1].replace(/ \(.*\)$/,"").toLowerCase():scName;
  return NOTE_NAMES[((r%12)+12)%12]+" "+md; };
// where an event lands once the groove has moved it: [[time, velocity], ...] (none: left out). s.gGrid: the bar it's in.
function gEv(id,s,role,t,v,from){ const g=GRV[id], gr=s&&s.gGrid, drum=GDRUM.has(role), nat=!!s.gNative;
  let p=-1,n=16,st=0,w=-1; if(gr&&gr.st>0){ n=gr.n; st=gr.st; p=Math.round((t-gr.t0)/st); if(p<0||p>=n) p=-1; }
  if(nat&&s.gPos!=null){ w=s.gPos; } else if(p>=0) w=Math.round(p*16/n);
  let lv=1,T=[t];
  if(drum){ lv=gDrumLv(g.drums); if(lv<.003) return [];
    if(g.density<.49&&w>=0){ const q=(.5-g.density)*2; let pd=0;
      if(role==="hat") pd=w%2?q:w%4?q*.7:0; else if(role==="kick") pd=w%8?q*.8:0;
      else if(role==="snare"||role==="clap") pd=w===4||w===12||w===8?0:q; else if(role==="perc"||role==="shaker") pd=q;
      if(pd&&R()<pd) return []; }
    if(role==="tom"&&from==="D"&&g.fills<.49&&R()<(.5-g.fills)*2) return [];
    if(!nat&&p>=0&&g.feel!==.5){
      if(p%2) return [];
      if(g.feel<.5){ const half=n/2; if((gr.bar||0)%2===0){ if(p>=half) return []; T=[gr.t0+2*p*st]; } else { if(p<half) return []; T=[gr.t0+2*(p-half)*st]; } }
      else T=[gr.t0+p/2*st,gr.t0+(p/2+n/2)*st]; } }
  if(!nat&&p>=0&&g.swing>.505){ const off=(gSwingRatio(id,.5)-.5)*2*st; T=T.map(x=>Math.round((x-gr.t0)/st)%2?x+off:x); }
  if(!nat&&!s.gNoMeter&&gr&&gr.st>0&&gOn(id,"meter")){ const M=METERS[g.meter], b16=gr.st*gr.n/16, out=[];
    for(const x of T){ const f=(x-gr.t0)/b16, base=Math.floor(f+.001), fr=f-base;
      if(base<0) out.push(x); else if(base>=16) out.push(gr.t0+(M.map.length+f-16)*b16); else for(const j of M.slots[base]) out.push(gr.t0+(j+fr)*b16); }
    T=out; if(!T.length) return []; }
  let hv=1; if(drum&&g.humanize>.005){ const h=g.humanize; T=T.map(x=>x+(R()-.5)*2*h*.02); hv=1+(R()-.5)*h*.6; }
  return T.map(x=>[Math.max(0,x),v*lv*hv]); }
function grooveArgs(id,role,vi,s,a,from){ const drum=GDRUM.has(role), v0=typeof a[vi]==="number"?a[vi]:1, ev=gEv(id,s,role,a[0],v0,from);
  if(!ev.length) return ev; const km=!drum&&s.gKey?gKeyMap(id,s.gKey.root+(s.gTr||0),s.gKey.sc):null;
  return ev.map(([t,v])=>{ const b=[...a]; b[0]=t; if(drum||v!==v0) b[vi]=v;
    if(km){ if(Array.isArray(b[1])) b[1]=b[1].map(km); else if(typeof b[1]==="number") b[1]=km(b[1]); if(role==="bass"&&typeof b[4]==="number"&&vi!==4) b[4]=km(b[4]); }
    return b; }); }
// once a bar: busier drums and extra fills (density and fills past the middle)
function gPump(id,s,t0,bs,bar,noFill){ const g=GRV[id]; if(!GON[id]||!g||(g.density<.51&&g.fills<.51)) return;
  const st=bs/16, sw=s.gNative?(s.swing-.5)*2*st:0;
  const hit=(role,fn,t,v,pos)=>{ if(s.gNative) s.gPos=pos; for(const [tt,vv] of gEv(id,s,role,t,v,"D")){ inMorph=true; try{ fn(s,tt,vv); }catch(e){} finally{ inMorph=false; } } };
  if(g.density>.51){ const q=(g.density-.5)*2;
    for(let i=1;i<16;i+=2) if(R()<q*.85) hit("hat",(b,t,v)=>D.hat(b,t,v,false,b.hatDec),t0+i*st+sw,.2+.12*q,i);
    for(const i of [7,10,15]) if(R()<q*.35) hit("snare",(b,t,v)=>D.snare(b,t,v,.06,b.sTone||1),t0+i*st+(i%2?sw:0),.16,i);
    for(const i of [6,14]) if(R()<q*.3) hit("kick",(b,t,v)=>D.kick(b,t,v,b.kTune||1),t0+i*st,.5*q,i); }
  if(g.fills>.51&&!noFill){ const q=(g.fills-.5)*2;
    if((bar%4===3&&R()<q)||R()<q*.3){ if(R()<.5) for(let j=0;j<4;j++) hit("tom",(b,t,v)=>D.tom(b,t,v,[200,170,140,110][j]),t0+(12+j)*st,.65,12+j);
      else for(let j=8;j<16;j++) hit("snare",(b,t,v)=>D.snare(b,t,v,.1,b.sTone||1),t0+j*st+(j%2?sw:0),.25+(j-8)*.07,j); } }
  if(s.gNative) s.gPos=null; }
// MDFM songs: one step (a 16th) on the scheduler, through the time signature. Returns how far to move on.
function mStep(s,t,play){ if(!gOn("mdfm","meter")){ if(play) playStep(s,s.step,t); return s.sp; }
  const M=METERS[GRV.mdfm.meter], i=s.step%16; if(!M.slots[i].length) return 0;
  if(play) playStep(s,s.step,t); let adv=s.sp;
  if(i===15&&M.map.length>16){ const bar0=s.step-15; for(const x of M.map.slice(16)){ if(play){ s.gExtra=true; try{ playStep(s,bar0+x,t+adv); }finally{ s.gExtra=false; } } adv+=s.sp; } }
  return adv; }
// length: the song's form, every section stretched or squeezed (bars stay even)
function gSongLen(s){ const L=gLenMul("mdfm"); if(Math.abs(L-1)<.01) return s; let at=0; const old=s.sections;
  s.sections=old.map(x=>{ const bars=Math.max(2,Math.round(x.bars*L/2)*2), y={...x,start:at,bars}; at+=bars; return y; });
  const remap=b=>{ if(b>=1e8) return b; const k=old.findIndex(x=>b>=x.start&&b<x.start+x.bars); if(k<0) return b; return s.sections[k].start+Math.min(s.sections[k].bars-1,Math.round((b-old[k].start)*L)); };
  s.bars=Math.max(at,16); s.brk=remap(s.brk); s.keyFrom=remap(s.keyFrom); s.deckB=remap(s.deckB);
  return s; }
function setGroove(id,vals){ const g=grvOf(id), was={...g}; Object.assign(g,cleanGroove(vals)); GON[id]=!grvIsDef(g);
  if(id==="wybc") wybcMixApply();
  if(id==="hearye"&&g.length!==was.length&&fair&&fair.next&&!(fair.piece&&fair.piece.p===fair.next)){ const o=fair.next, p=fPiece(o.style,o.seed,o.base*gLenMul("hearye")); p.base=o.base; p.title=o.title; p.artist=o.artist; fair.next=p; }
  if(station===id&&nowPlaying) emit("nowplaying",nowPlaying);
  return {...g}; }
// what's on now, with the groove's tempo and key
function gFacts(np){ if(!np) return np; const id=np.station||"mdfm"; if(!GON[id]) return np; const o={...np};
  if(gOn(id,"bpm")) o.bpm=GRV[id].bpm;
  if(gOn(id,"key")&&typeof o.key==="string"){ const [r,...rest]=o.key.split(" "), pc=NOTE_NAMES.indexOf(r); if(pc>=0) o.key=gKeyName(id,pc,rest.join(" ")); }
  if(gOn(id,"meter")) o.time=GRV[id].meter;
  return o; }
function setOn(v){
  if(v===on) return; on=v; gen++;
  if(v){ iosPlayback(true); primeSpeech(); if(!ctx) init(opts.audioContext); try{ const pr=ctx.resume(); if(pr&&pr.catch) pr.catch(()=>{}); }catch(e){} watchAudio(); const t=ctx.currentTime; fadeTo(master.gain,(opts.volume??1)*VOL,.4,t);
    if(bed){ bed.stopped=true; try{ bed.bus.disconnect(); }catch(e){} bed=null; } fadeTo(musicDuck.gain,1,.3,t);   // restarted before the stop finished: the old break is gone
    if(station==="wybc"&&AMB()){ clearInterval(timer); timer=0; wybcOn(); } else if(station==="ptlk"&&TALK){ clearInterval(timer); timer=0; ptlkOn(); } else if(station==="hearye"&&FAIRE){ clearInterval(timer); timer=0; fairOn(); } else { station="mdfm"; if(!songs.length){ startSong(t+.1,0); lastSpot=t-999; } clearInterval(timer); timer=setInterval(tick,40); tick(); } }
  else if(ctx){ iosPlayback(false); recStop(true); wybcOff(.3); ptlkOff(); fairOff(); const t=ctx.currentTime; fadeTo(master.gain,0,.3,t); clearInterval(timer); try{speechSynthesis.cancel();}catch(e){} try{ voiceSrc&&voiceSrc.stop(); }catch(e){} speaking=false;
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
async function renderOffline(kind,secs,arg){
  const keep={ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn,extDuck,recIn,ST,mixOut,ambIn};
  const oc=new OfflineAudioContext(2,Math.floor(44100*secs),44100); let rendering;
  try{ init(oc); master.gain.value=VOL;
  if(kind==="song"){ const s=setupSong(makeSong(arg),.05,0); if(ride) rideOn(s); while(s.next<secs-.1&&s.step<s.bars*16){ s.next+=mStep(s,s.next,true); s.step++; } }
  else if(kind==="bed"){ const b=startBed(.05); if(arg!=null) b.def=BEDS[arg]; while(b.next<secs-2.5){ playBed(b,b.next); b.step++; b.next+=b.sp; } endBed(b,secs-2.4); }
  else if(kind==="sting"){ STINGS[arg](.1); }
  else if(kind==="current"){   // the song on air, from the top, as written (and as long as it runs now, Let It Ride included)
    const s=setupSong({...arg.recipe},.05,0); s.bars=arg.bars; if(arg.brk2!=null) s.brk2=arg.brk2; s.ride=!!arg.ride;
    while(s.next<secs-.1&&s.step<s.bars*16){ s.next+=mStep(s,s.next,true); s.step++; }
    const end=Math.min(secs-.05,s.next+2.6); master.gain.setValueAtTime(VOL,Math.max(.1,end-2.4)); master.gain.linearRampToValueAtTime(0,end); }
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
    else if(arg.cue==="bed"){ const b=ptBus(.3*(PT_BED_GAIN[arg.style]??1),k,S.minor); let t=.1,bar=0; while(t<secs-1.5){ if(GON.ptlk) b.gGrid={t0:t,st:SIX(SS.bpm),n:16,bar};
      const d=S.bed.call(SS,b,t,bar,k); if(GON.ptlk) gPump("ptlk",b,t,d,bar,false); bar++; t+=d*(gOn("ptlk","meter")?METERS[GRV.ptlk.meter].ratio:1); } }
    else S.stings[arg.i|0](ptBus(gn*(PT_STING_GAIN[arg.style]??1),k,S.minor),.1,k); }   // a show's sound effect, for episode exports
  else if(kind==="fpiece"){ const p=fPiece(arg.style,arg.seed,arg.target), b=fBus(p.S.gain); b.mxId="hearye"; b.gKey={root:p.key,sc:p.sc}; b.gNoMeter=p.S.sub===3||p.S.beats!==4; let t=.1;   // a HEARYE piece, from its seed, with its ambience (from: a bar to start at, for checks)
    for(let i=arg.from||0;i<p.bars&&t<secs;i++){ fBar(p,i,t,b); t+=p.bs; }
    for(const x of p.secs) if(x.at>=(arg.from||0)) b.gain.gain.setTargetAtTime(p.S.gain*SEC_GAIN[x.t==="outro"?0:x.lvl],.1+(x.at-(arg.from||0))*p.bs,.8);
    if(arg.amb!==false){ const A=ambNew(p.S.scene,p.key); A.out.gain.setValueAtTime(.0001,0); A.out.gain.linearRampToValueAtTime(A.sg,2.5); for(const x of p.secs) if(x.at>=(arg.from||0)) A.out.gain.setTargetAtTime(A.sg*AMB_SEC[x.t==="outro"?0:x.lvl],.1+(x.at-(arg.from||0))*p.bs,1); ambRun(A,secs-.3); }
    master.gain.setValueAtTime(VOL,Math.max(.2,secs-2)); master.gain.linearRampToValueAtTime(0,secs-.05); }
  else if(kind==="fcue"){ const p=fCueP(arg.style), gn=F_CUE_GAIN[arg.style]??1;   // HEARYE show music, for tests and level checks
    if(arg.cue==="bed"){ const b=fBus(.16*gn*(F_BED_GAIN[arg.style]??1)), at=p.secs.find(x=>x.t==="A"&&x.lvl===2).at; let t=.1, k=0; while(t<secs-1){ p.S.bar(p,t,{b,st:p.st,bs:p.bs,lvl:2,i:k%8,n:8,ch:fch(p,p.progA[k%4]),sec:"A",bed:true,lead:()=>{}}); t+=p.bs; k++; } void at; }
    else if(arg.cue==="sting"&&arg.i!=null) F_STINGS[arg.i](p,fBus(gn*F_STING_GAIN[arg.i]),.1); else fCue(arg.style,arg.cue,.1); }
  else if(kind==="wybc"){ const L=AMB(); ambIn=G(AMB_LEVEL); ambIn.connect(ST.in);   // a WYBC piece through the whole chain (TUNE and the style matrix included), for Save
    const sh=MXON.wybc?MXSH.wybc:null, rs=sh&&(sh.sty.length||sh.chaos)?wybcRS():null;
    const inst=L.create({context:oc,destination:ambIn,offline:true,mapNote:wybcMapNote,settings:{...ambSettings(),...wybcPull()},onChord:rs?(t,x,bar)=>{ const ch=wybcTriad(x); for(let i=0;i<4;i++) wybcRhythm(rs,t+i*bar/4,bar/4,ch,sh); }:null});
    inst._scheduleAll(secs,true); }
  else if(kind==="famb"){ const A=ambNew(arg.scene,62); A.out.gain.value=A.sg; ambRun(A,secs-.2); }
  { const id=kind==="fpiece"?"hearye":kind==="current"||kind==="song"?"mdfm":kind==="wybc"?"wybc":null;   // the style matrix's sound (drive, lo-fi, hall, slap, phaser...) as it is live
    if(id&&MXON[id]){ mxFx(); mxFxLevels(mixOf(id),0,true); } }
  rendering=oc.startRendering(); }finally{ ({ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn,extDuck,recIn,ST,mixOut,ambIn}=keep); }   // restore before the await: the live station keeps ticking meanwhile
  return await rendering;
}
return {
  version: VERSION,
  start(){ setOn(true); },
  stop(){ setOn(false); },
  toggle(){ setOn(!on); return on; },
  isOn(){ return on; },
  skip(){ if(station==="ptlk"){ ptlkSkip(); return; } if(station==="hearye"){ fairSkip(); return; } if(station==="wybc"){ if(on&&amb){ const a=amb; amb=null; ambRetire(a,4); ambStart(4); } return; } for(const s of songs) if(!s.handed) s.step=Math.max(s.step,(s.bars-4)*16-1); },
  spotNow(kind){ if(station==="ptlk"){ ptlkId(); return; } if(station==="hearye"){ fairId(); return; } if(station==="wybc"){ wybcId(true); return; } spot(kind); },
  setDuck(v){ v=Math.max(0,Math.min(1,+v)); if(!Number.isFinite(v)) return; duckLevel=v; if(ctx&&extDuck){ const t=ctx.currentTime; extDuck.gain.cancelScheduledValues(t); extDuck.gain.setTargetAtTime(Math.max(v,0),t,v<1?.08:.35); } },   // 0..1 over everything (music and DJ), eased
  setProviders(p){ for(const k of ["weather","sports","news","tts","cannedFallback","headlines"]) if(k in p) opts[k]=p[k]; wxCache=spCache=null; },   // kind optional: "weather" | "sports"
  stingNow(){ voiceSting(); },
  voices(){ return HAS_TTS?speechSynthesis.getVoices().map(v=>v.name+" ("+v.lang+")"):[]; },
  setSpots(v){ spotsOn=!!v; },
  setTone(t){ for(const k of ["low","mid","high"]) if(t&&k in t) tone[k]=Math.max(-12,Math.min(12,+t[k]||0)); applyTone(); },   // dB, -12..+12
  getTone(){ return {...tone}; },
  getVolume(){ return opts.volume??1; },
  /* let it ride: the current song (and each next one while on) runs about two minutes, with a second breakdown and extra fills */
  setLetItRide(v){ ride=!!v; for(const s of songs) (ride?rideOn:rideOff)(s); },
  isLetItRide(){ return ride; },
  /* underwater: muffled, resonant, slowly drifting low-pass with a slight pitch wobble on the music (the voice is the system's speech, so it stays dry) */
  setUnderwater(v){ applyUnderwater(v); },
  isUnderwater(){ return underwater; },
  setTypes(t){ for(const k of TYPE_KEYS) if(t&&k in t) TYPES[k]=!!t[k]; },   // {ids, stingers, ads, interviews, callers, weather, sports, plays, arts, podcast, cooking, homerepair, garage, funnelball, showponies, technews, news}: false switches a kind off
  getTypes(){ return {...TYPES}; },
  sampleLines(kind,advance){ if(kind==="funnelball") return funnelballLines(); if(kind==="showponies") return SP_OK()?showPonyEpisode(!!advance).lines:null; if(kind==="technews") return techLines(); const s=showSpot(kind); return s&&s.lines; },   // for tests and previews
  setVolume(v){ v=volNum(v); if(v==null) return; opts.volume=v; if(ctx&&on) fadeTo(master.gain,v*VOL,.2,ctx.currentTime); },
  nowPlaying(){ return gFacts(nowPlaying); },
  getSpectrum,
  getLevels,
  thwack(){ if(!on||!ctx) return; const b=fxBus(false),t0=ctx.currentTime; D.snare(b,t0,1.3,.3,.8); D.clap(b,t0,.8,.2); D.tom(b,t0,.6,90); },
  on(ev,f){ (listeners[ev]=listeners[ev]||[]).push(f); return ()=>{ listeners[ev]=listeners[ev].filter(x=>x!==f); }; },
  nextSpotText(){ return nextSpot(); },
  renderOffline,
  /* "Save song": renders the song on air again, from the top, off the live audio path, and returns {buffer, info}. */
  async renderSong(){ if(station==="ptlk") return null;   // talk saves as a recording (onAir / recordBreak), in the apps
    if(station==="hearye"){ const p=fair&&(fair.piece?fair.piece.p:fair.last); if(!p) return null; const buffer=await renderFaire(p); return {buffer,info:gFacts({station:"hearye",stationName:"HEARYE 95.5",title:p.title,artist:p.artist,style:p.name,bpm:p.bpm,key:`${NOTE_NAMES[p.key%12]} ${p.mode}`})}; }
    if(station==="wybc"){ if(!nowPlaying||nowPlaying.station!=="wybc") return null; const buffer=await renderAmbient(Math.round(150*gLenMul("wybc"))); return buffer&&{buffer,info:gFacts({...nowPlaying,stationName:"WYBC 88.1"})}; }
    const live=[...songs].reverse().find(x=>x.recipe&&nowPlaying&&x.title===nowPlaying.title)||[...songs].reverse().find(x=>x.recipe);
    if(!live) return null; const secs=Math.min(900,live.bars*16*(gOn("mdfm","bpm")?15/GRV.mdfm.bpm:live.sp)*(gOn("mdfm","meter")?METERS[GRV.mdfm.meter].ratio:1)+3);
    const buffer=await renderOffline("current",secs,{recipe:live.recipe,bars:live.bars,brk2:live.brk2,ride:live.ride});
    return {buffer,info:gFacts({title:live.title,style:live.name,bpm:live.bpm,...songFacts(live)})}; },
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
  /* Style matrix (TUNE): per-station influence 0..1 of pop, hip-hop, rock, classical, country, galactic and chaos.
     All zero (the default) = the station exactly as it is. id defaults to the station on. */
  styleMixKeys(){ return MIX_KEYS.map(x=>[...x]); },
  getStyleMix(id){ return {...mixOf(id||station)}; },
  setStyleMix(vals,id){ return setMix(id||station,vals); },
  resetStyleMix(id){ return setMix(id||station,mixZero()); },
  /* Groove & key (TUNE), per station: bpm (0 = the song's own, else 40-220), meter ("" or "3/4" "6/8" "5/4" "7/8" "7/4"), swing,
     length (.5 = as written), root (-1 = the song's own, 0-11 = C..B), mode ("" or a keyModes() id), and the drums: density,
     fills, feel (0 half, .5 normal, 1 double time), humanize, drums (level). All 0..1 unless noted. Defaults = as before. */
  grooveKeys(){ return GROOVE_KEYS.map(x=>[...x]); },
  grooveDefaults(){ return {...GROOVE_DEF}; },
  keyModes(){ return KEY_MODES.map(([id,name])=>({id,name})); },
  meters(){ return Object.keys(METERS); },
  grooveSupport(id){ return {...(GSUP[id||station]||GSUP.mdfm)}; },
  getGroove(id){ return {...grvOf(id||station)}; },
  setGroove(vals,id){ return setGroove(id||station,vals); },
  resetGroove(id){ return setGroove(id||station,GROOVE_DEF); },
  stationTypeList(id){ return (STATION_TYPES[id]||[]).map(x=>[...x]); },   // MDFM's own list is window.MDFM_TYPES / setTypes
  getStationTypes(id){ return id==="wybc"?{...wybcTypes}:id==="ptlk"?{...ptlkTypes}:id==="hearye"?{...fairTypes}:{...TYPES}; },
  setStationTypes(id,t){ if(id==="ptlk"){ for(const [k] of STATION_TYPES.ptlk) if(t&&k in t) ptlkTypes[k]=!!t[k]; return; }
    if(id==="hearye"){ for(const [k] of STATION_TYPES.hearye) if(t&&k in t) fairTypes[k]=!!t[k]; fairSetTypes(); return; }
    if(id!=="wybc"){ this.setTypes(t); return; } for(const [k] of STATION_TYPES.wybc) if(t&&k in t) wybcTypes[k]=!!t[k];
    if(amb){ const m=ambSettings(); for(const k in m) try{ amb.inst.set(k,m[k]); }catch(e){} } },
};
}
