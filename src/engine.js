/* MDFM 99.9 HD: an in-browser hip-hop radio station.
   Everything is synthesized live with Web Audio: no audio files, no network, no credits.
   Usage: const radio = createMDFM(); button.onclick = () => radio.start();   (see README) */
import corePack from "./content/default.js";
export const VERSION = "__VERSION__";
export const STYLES = ["MELODIC DRILL","CHILL TRAP","PLUGGNB","SLOW JAM R&B","AFROSWING","LO-FI BOOM BAP","NEO-SOUL","AMAPIANO","CLOUD RAP","JAZZ HOP","CHILL PHONK","WEST COAST"];

export function createMDFM(opts = {}) {
const listeners={}; const emit=(ev,data)=>(listeners[ev]||[]).forEach(f=>{try{f(data);}catch(e){}});
let nowPlaying=null, spotsOn=opts.spots!==false, ride=!!opts.letItRide, underwater=!!opts.underwater;
const R=Math.random, pick=a=>a[Math.floor(R()*a.length)], rr=(a,b)=>a+R()*(b-a), ri=(a,b)=>Math.floor(rr(a,b+1));
const mtof=m=>440*Math.pow(2,(m-69)/12);
let ctx=null,pre,master,analyser,freq,vuA=null,vuBuf=null,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn=null,voiceSrc=null;
let on=false,timer=0,songs=[],lastSpot=-999,spotCount=0,voicePulse=0,speaking=false,bed=null;
const VOL=.62;
function shaper(k){const c=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1023.5-1;c[i]=Math.tanh(x*k)/Math.tanh(k);}return c;}
function filt(type,f,q){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;return b;}
function osc(type,f){const o=ctx.createOscillator();o.type=type;o.frequency.value=f;return o;}
function G(v){const g=ctx.createGain();g.gain.value=v;return g;}
function env(g,t,a,peak,dec){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(peak,.0002),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec);}
function nz(t,dur){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.start(t,R()*1.4);s.stop(t+dur);return s;}
function pan(p){if(!ctx.createStereoPanner)return G(1);const n=ctx.createStereoPanner();n.pan.value=p;return n;}
function to(node,s,amt){if(amt>0){const g=G(amt);node.connect(g);g.connect(s.rv);}}
function makeIR(c,sec,decay){const len=Math.floor(c.sampleRate*sec),b=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++){const tt=i/c.sampleRate;d[i]=(R()*2-1)*Math.exp(-tt*decay)*(tt<.01?tt/.01:1)*(1-i/len);}}return b;}
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
  pre.connect(UW.dl).connect(UW.lp).connect(ls).connect(hs).connect(lp).connect(comp).connect(G(1.3)).connect(master);
  voiceIn.connect(master);
  master.connect(TONE.low).connect(TONE.mid).connect(TONE.high).connect(TONE.lim).connect(analyser).connect(ctx.destination);
  freq=new Uint8Array(analyser.frequencyBinCount);
  { const sp=ctx.createChannelSplitter(2); TONE.lim.connect(sp); vuA=[0,1].map(i=>{ const a=ctx.createAnalyser(); a.fftSize=1024; sp.connect(a,i); return a; }); vuBuf=new Float32Array(1024); }
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=R()*2-1;}
  SAT=shaper(1.8); SAT808=shaper(3);
  musicDuck=G(1); musicDuck.connect(pre);
  const ir=makeIR(ctx,2.2,2.4);
  songRev=ctx.createConvolver(); songRev.buffer=ir; songRev.connect(filt("lowpass",4200)).connect(G(.45)).connect(musicDuck);
  fxRev=ctx.createConvolver(); fxRev.buffer=ir; fxRev.connect(filt("lowpass",4200)).connect(G(.5)).connect(pre);
  fxDelay=G(1); const dl=ctx.createDelay(1); dl.delayTime.value=.24; const fb=G(.38), dlp=filt("lowpass",2600);
  fxDelay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(G(.5)).connect(pre);
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
};
/* ---------- styles: current hip-hop ---------- */
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
};
const STYLE_FAM={"MELODIC DRILL":"trap","CHILL TRAP":"trap","PLUGGNB":"trap","CLOUD RAP":"trap","CHILL PHONK":"trap","SLOW JAM R&B":"soul","NEO-SOUL":"soul","LO-FI BOOM BAP":"soul","JAZZ HOP":"soul","AFROSWING":"dance","AMAPIANO":"dance","WEST COAST":"dance"};
// Song forms. Section kinds: intro, verse, pre (build-up), hook, break, bridge, outro. "u" is a unit of 4 or 8 bars.
const FORMS=[
  [["intro",.5],["verse",1],["hook",1],["verse",1],["hook",1],["break",.5],["hook",1],["outro",.5]],
  [["intro",.5],["hook",1],["verse",1],["pre",.5],["hook",1],["bridge",1],["hook",1],["outro",.5]],
  [["intro",1],["verse",1],["verse",1],["hook",1],["break",.5],["verse",1],["hook",1],["outro",.5]],
  [["intro",.5],["verse",1],["pre",.5],["hook",1],["verse",1],["pre",.5],["hook",1],["hook",1],["outro",.5]],
  [["intro",.5],["hook",1],["bridge",1],["hook",1],["verse",1],["hook",1],["outro",.5]],
];
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
  let name=force; if(!name){ const all=Object.keys(STY), fresh=all.filter(n=>!recentStyles.includes(n)); name=pick(fresh.length?fresh:all); recentStyles.push(name); if(recentStyles.length>4) recentStyles.shift(); }
  const st=STY[name],fam=FAM[STYLE_FAM[name]]||FAM.soul,sc=pick(st.scales),root=ri(36,47),bpm=ri(st.bpm[0]-2,st.bpm[1]+2),major=sc[2]===4;
  const deg=d=>{const k=((d%7)+7)%7,o=Math.floor(d/7);return sc[k]+12*o;};
  const voi=st.voicing==='ext'?pick([[0,2,4,6],[0,2,6,8],[0,4,6,9],[0,2,4,6,8]]):pick([[0,2,4],[0,4,7],[-3,0,2]]), chord=(d,up=0)=>voi.map((x,j)=>root+12+deg(d+x)+(j<up?12:0));
  const sp=60/bpm/4, barSec=sp*16;
  // arrangement: a form, sized so the song runs about 70-110 seconds
  const form=pick(FORMS), unit=barSec*8*form.reduce((a,f)=>a+f[1],0)>115?4:8, sections=[]; let at=0;
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
  const dens=({piano:.24,bell:.26,whistle:.2,rhodesline:.18,pluck:.3,cowbell:.32,saw:.2}[leadI]||.25)*rr(.75,1.3);
  const base=root+12*Math.round((st.octLead-root)/12);
  const hookLen=pick([1,2,2,4]), verseLen=pick([2,4]);
  const hook=motifGen(base,deg,dens*1.15,st.half,hookLen,ri(1,5)), verse=motifGen(base-12*(R()<.4?1:0),deg,dens*.7,st.half,verseLen,ri(0,4));
  const answer=hook.map((n,k)=>k>=hook.length/2&&R()<.5?{...n,m:base+deg(ri(-1,5))}:n);
  const pa=pick(major?PROGS.maj:PROGS.min), pb=R()<.6?pick(major?PROGS.maj:PROGS.min):pa;
  const fills=sections.map(()=>pick(["tom","snareroll","hatstutter","drop","none","tom"]));
  const keyUp=R()<.22?pick([1,2]):0, lastHook=[...sections].reverse().find(x=>x.kind==="hook");
  return {name,st,sc,root,bpm,sp,bars,brk,deg,chord,sections,kinds,fills,keyUp,keyFrom:keyUp&&lastHook?lastHook.start:1e9,
    prog:pa,progB:pb,cpb:st.half?1:(R()<.5?1:2),swing:rr(st.sw[0],Math.min(.66,st.sw[1]+.02)),K,S,H,O,P,K2,H2,P2,LOG,bassPat,bassOff,
    hook,answer,verse,hookLen,verseLen,chordsI,leadI,leadB,padI,kTune:rr(.88,1.12),sTone:rr(.85,1.2),hatDec:rr(-.24,-.12),
    title:`${pick(T_A)} ${pick(T_B)}`};
}
function secAt(s,bar){ for(const x of s.sections) if(bar>=x.start&&bar<x.start+x.bars) return x;
  // past the written form (let it ride): keep cycling verse / hook in 8-bar blocks, ending on the outro
  const last=s.sections[s.sections.length-1], over=bar-(last.start+last.bars), n=Math.floor(over/8);
  return {kind:bar>=s.bars-4?"outro":n%2?"verse":"hook",start:last.start+last.bars+n*8,bars:8}; }
function playStep(s,step,t){
  const st=s.st,bar=Math.floor(step/16),i=step%16,sp=s.sp;
  let tt=t+(i%2?(s.swing-.5)*2*sp:0); if(s.swing>.55) tt+=rr(-.004,.004);
  const B2=s.brk2??-99, sec=(bar===B2||bar===B2+1)?{kind:"break",start:B2,bars:2}:secAt(s,bar), K=s.kinds[sec.kind]||s.kinds.verse;
  const sb=bar-sec.start, lastBar=sb===sec.bars-1, nextSec=secAt(s,sec.start+sec.bars), fill=s.fills[s.sections.indexOf(sec)]||(sec.kind==="hook"?"snareroll":"tom");
  const drop=lastBar&&fill==="drop"&&nextSec.kind==="hook"&&i>=8;   // a beat of silence before the hook lands
  const tr=bar>=s.keyFrom?s.keyUp:0, prog=sec.kind==="hook"||sec.kind==="pre"?s.prog:s.progB;
  const d=prog[Math.floor(bar/s.cpb)%4], notes=s.chord(d,K.up).map(n=>n+tr);
  // filter sweeps: open up across the intro and out of breaks; close down into a break
  if(step===0){ s.mlp.frequency.setValueAtTime(450,t); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*Math.max(2,s.sections[0].bars)); }
  if(sb===0&&i===0&&(sec.kind==="break"||sec.kind==="bridge")&&bar>0){ s.mlp.frequency.setValueAtTime(18000,t); s.mlp.frequency.exponentialRampToValueAtTime(900,t+sp*8); s.mlp.frequency.setValueAtTime(900,t+sp*16*(sec.bars-1)); s.mlp.frequency.exponentialRampToValueAtTime(18000,t+sp*16*sec.bars); }
  /* drums */
  if(K.drums&&!drop){
    const kp=K.kick==="B"?s.K2:s.K; if(kp[i]==="x") D.kick(s,tt,i===0?1:.88,s.kTune);
    const sp2=s.S[bar%s.S.length];
    if(sp2[i]==="x"){ if(st.snare==="snare"){ D.snare(s,tt,1,.22,s.sTone); if(st.clap) D.clap(s,tt,.65);} else if(st.snare==="snapclap"){ D.snap(s,tt,1.1); D.clap(s,tt,.5,.45);} else { D.clap(s,tt,1); D.snare(s,tt,.3,.1,s.sTone); } }
    const Pp=sec.kind==="hook"?s.P2:s.P; if(Pp&&Pp[i]==="x"&&sec.kind!=="intro"){ if(st.perc==="rim") D.rim(s,tt,.9); else if(st.perc==="snap") D.snap(s,tt,.8); else if(st.perc==="conga") D.conga(s,tt,.9,(i>>1)%2===1); else if(st.perc==="ghost") D.snare(s,tt,.2,.05); }
    if(st.shaker&&sec.kind!=="intro") D.shaker(s,tt,i%2?1:.6);
    if(lastBar&&nextSec.kind!=="outro"){   // the fill into the next section
      if(fill==="tom"&&i>=12) D.tom(s,tt,.7,[190,160,130,100][i-12]);
      else if(fill==="snareroll"&&i>=8) D.snare(s,tt,.3+(i-8)*.08,.12,s.sTone);
      else if(fill==="hatstutter"&&i>=12) for(let k=0;k<4;k++) D.hat(s,tt+k*sp/4,.6,false,s.hatDec);
    } else if(s.ride&&bar%16===15&&i>=8) D.snare(s,tt,.35+(i-8)*.08,.12,s.sTone);
    if(sb===0&&i===0&&(sec.kind==="hook"||(sec.kind==="verse"&&R()<.4))) D.crash(s,tt,sec.kind==="hook"?1:.6);
  }
  if(lastBar&&nextSec.kind==="hook"&&i===0&&(sec.kind==="pre"||sec.kind==="break"||R()<.5)) D.riser(s,t,sp*16);
  if(!(sec.kind==="intro"&&sb===0)&&!drop&&sec.kind!=="break"){
    const hp=K.hats==="busy"?s.H2:s.H, c=hp[i], hv=(i%4===0?1:rr(.55,.75))*(sec.kind==="intro"?.5:1)*(K.hats==="sparse"?.8:1);
    const build=K.hats==="build"&&sb>=sec.bars-2;
    if(K.hats==="sparse"){ if(i%4===0||c==="r") D.hat(s,tt,hv,false,s.hatDec); }
    else if(build){ if(i%2===0||sb===sec.bars-1) D.hat(s,tt,hv*(.6+sb/sec.bars*.4),false,s.hatDec); }
    else if(c==="x") D.hat(s,tt,hv,false,s.hatDec);
    else if(c==="r"){ D.hat(s,tt,hv*.8,false,s.hatDec); D.hat(s,tt+sp/2,hv*.6,false,s.hatDec); }
    else if(c==="3"){ for(let k=0;k<3;k++) D.hat(s,tt+k*sp/3,hv*(.85-k*.12),false,s.hatDec); }
    if(s.O&&s.O[i]==="o"&&K.drums) D.hat(s,tt,.85,true,.2);
  }
  if(i===0&&st.vinyl) D.vinyl(s,t,sp*16);
  /* bass */
  const bassOn=K.bass==="full"||(K.bass==="half"&&i<8);
  if(bassOn&&!drop&&st.bass==="log"&&s.LOG[i]==="x"){ let m=s.root+s.deg(d)+tr+pick([0,0,0,7,12,-5]); if(m>55) m-=12; D.logdrum(s,tt,m,1); }
  if(bassOn&&!drop&&st.bass!=="log"&&s.bassPat[i]){
    let len=1; while(i+len<16&&!s.bassPat[i+len]) len++;
    if(st.bass==="bass"){ let m=s.root+s.deg(d)+s.bassOff[i]+tr; if(m>52) m-=12; M.bass(s,tt,m,Math.min(len,4)*sp*.9,1,R()<.2?m+pick([-2,2]):null); }
    else { let m=s.root-12+s.deg(d)+tr+(s.bassOff[i]===12?0:s.bassOff[i]); if(m>40) m-=12; if(m<26) m+=12;
      let nxt=null; if(R()<st.slide) nxt=m+pick([-5,-2,3,5,7,12]);
      D.b808(s,tt,m,Math.min(len,8)*sp,st.bass==="808soft"?.75:1,nxt,false); }
  }
  /* chords + pad */
  const ck=s.chordsI, cmode=K.chords;
  if(cmode==="sustain"){ if(i===0&&bar%2===0) M.rhodes(s,tt,notes,sp*30,.7); }
  else if(cmode==="sparse"){ if(i===0) (ck==="piano"||ck==="pianostab"?M.piano:M.rhodes)(s,tt,notes,sp*12,.6); }
  else if(cmode==="stab"){ if("x..x..x.x.....x."[i]==="x") M.piano(s,tt,notes,sp*1.1,.6); }
  else if(ck==="piano"&&i===0) M.piano(s,tt,notes,sp*15,.75);
  else if(ck==="rhodes"&&(i===0||i===10)) M.rhodes(s,tt,notes,sp*(i?5:9),.9);
  else if(ck==="rhodesoff"&&(i===2||i===6||i===10||i===14)) M.rhodes(s,tt,notes,sp*1.6,.75);
  else if(ck==="pianostab"&&(i===2||i===6||i===10||i===14)) M.piano(s,tt,notes,sp*1.2,.55);
  else if(ck==="saw"&&"x..x..x...x..x.."[i]==="x") M.saw(s,tt,notes,sp*2.2,.9);
  else if(ck==="bellarp"&&"x..x..x.x..x..x."[i]==="x"){ s.arp=(s.arp||0)+1; M.bell(s,tt,notes[s.arp%notes.length]+12,sp*3,.75,(s.arp%2?.3:-.3)); }
  else if(ck==="pluckarp"&&i%2===0){ s.arp=(s.arp||0)+1; M.pluck(s,tt,notes[s.arp%notes.length]+12,sp*1.5,.6); }
  if(i===0&&bar%2===0&&s.padI!=="none"&&!drop){ const pd=s.padI; if(pd==="choir") M.choir(s,tt,notes,sp*32,.8); else M.pad(s,tt,notes,sp*32,.8,pd==="strings"?2000:1000); }
  else if(i===0&&bar%2===0&&ck==="padonly") M.pad(s,tt,notes,sp*32,.9,1400);
  /* melodies: the hook in hooks (sometimes up an octave or doubled), a sparser line in verses */
  if(K.lead!=="none"&&!drop&&bar>=1){
    const isHook=K.lead!=="verse", L=isHook?s.hookLen:s.verseLen, phrase=Math.floor(sb/L), mot=isHook?(phrase%2?s.answer:s.hook):s.verse;
    const ph=(sb%L)*16+i, inst=isHook?s.leadI:s.leadB, oct=K.lead==="hookHi"?12:0;
    for(let k=0;k<mot.length;k++){ const n=mot[k]; if(n.i!==ph) continue; const dur=n.len*sp, m=n.m+tr+oct;
      playLead(s,inst,tt,m,dur,k?mot[k-1].m+tr+oct:null,isHook?1:.75);
      if(K.lead==="hookDbl") playLead(s,inst==="bell"?"pluck":"bell",tt,m+12,dur,null,.45); }
  }
}
function playLead(s,inst,t,m,dur,prev,v){
  if(inst==="piano") M.piano(s,t,[m],dur,v); else if(inst==="bell") M.bell(s,t,m,dur,v,.15);
  else if(inst==="saw") M.saw(s,t,[m],dur,.8*v); else if(inst==="whistle") M.whistle(s,t,m,dur,v,prev);
  else if(inst==="rhodesline") M.rhodes(s,t,[m],dur,.9*v); else if(inst==="pluck") M.pluck(s,t,m,dur,1.1*v); else if(inst==="cowbell") M.cowbell(s,t,m,dur,v);
  else M.bell(s,t,m,dur,v,.15);
}
function setupSong(s,t,fadeBars){
  Object.assign(s,makeBus(musicDuck,songRev));
  const barT=s.sp*16; s.bus.gain.setValueAtTime(fadeBars?.0001:1,t); s.rvf.gain.setValueAtTime(fadeBars?.0001:1,t);
  if(fadeBars){ s.bus.gain.exponentialRampToValueAtTime(1,t+barT*fadeBars); s.rvf.gain.exponentialRampToValueAtTime(1,t+barT*fadeBars); }
  s.step=0; s.next=t; s.done=false; s.handed=false; return s;
}
function startSong(t,fadeBars){
  const s=setupSong(makeSong(),t,fadeBars); songs.push(s); if(ride) rideOn(s);
  nowPlaying={title:s.title,style:s.name,bpm:s.bpm}; emit("nowplaying",nowPlaying);
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
  page(b,t){ const n=nz(t,.5),bp=filt("bandpass",3000,1),g=ctx.createGain(); bp.frequency.setValueAtTime(1500,t); bp.frequency.exponentialRampToValueAtTime(5000,t+.35); env(g,t,.12,.35,.35); n.connect(bp); bp.connect(g); g.connect(b.dr); return .7; },
};
const ORGAN={
  theme(b,t){ const k=ri(-2,2),seq=[[[57,60,64],.7],[[55,59,62],.7],[[53,57,60,65],.7],[[52,56,59,64],2.2]]; let tt=t; for(const [c,d] of seq){ M.organ(b,tt,c.map(m=>m+k),d,1); tt+=d; } return tt-t; },
  sting(b,t){ M.organ(b,t,[48,51,55,60],.25,1.2); M.organ(b,t+.35,[47,50,53,59],.25,1.2); M.organ(b,t+.7,[46,49,52,58,61],1.8,1.3,7); return 2.3; },
  mystery(b,t){ M.organ(b,t,[54,57,60,63],2.4,.9,7.5); M.organ(b,t+1.2,[66,69],1.4,.6,7.5); return 2.6; },
  romance(b,t){ M.organ(b,t,[53,57,60,64],1.2,.9,5); M.organ(b,t+1.1,[55,59,62,67,71],2.4,1,5); return 3.2; },
  outro(b,t){ const k=ri(-2,2); M.organ(b,t,[53,57,60].map(m=>m+k),.6,1); M.organ(b,t+.6,[55,59,62].map(m=>m+k),.6,1); M.organ(b,t+1.2,[48,52,55,60,64].map(m=>m+k),3,1.1); return 3.6; },
};
const CUE_LABEL={rain:"rain",knock:"knock knock knock",door:"door creaks",steps:"footsteps",claps:"clapping",rocket:"rocket launch",beeps:"control panel beeps",theremin:"spooky space noise",zap:"zap",thunder:"thunder",clock:"clock ticking",horse:"hoofbeats",wind:"wind",teacup:"teacup clinks",typewriter:"typing",printer:"printer whirs",gallery:"quiet gallery",applause:"polite applause",page:"page turns"};

/* ---------- scheduler ---------- */
let nextGap=rr(30,60), lastShow=-1e9;   // first break comes quickly; after that the station leans on music
function tick(){
  if(!on) return;
  const ahead=ctx.currentTime+(document.hidden?1.6:.25);
  for(const s of songs){
    while(!s.done&&s.next<ahead){
      playStep(s,s.step,s.next); s.step++; s.next+=s.sp;
      if(!s.handed&&s.step===(s.bars-4)*16){ s.handed=true; const barT=s.sp*16,tH=s.next;
        s.bus.gain.setValueAtTime(1,tH); s.bus.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.rvf.gain.setValueAtTime(1,tH); s.rvf.gain.exponentialRampToValueAtTime(.0001,tH+barT*4); s.endT=tH+barT*4+.5;
        startSong(tH,3);
        const wait=Math.max(0,(tH-ctx.currentTime)*1000);
        if(newsDue()) setTimeout(()=>spot("news"),wait+300);   // company news at the top of the hour, when Slack is connected
        else if(techDue()) setTimeout(()=>spot("technews"),wait+300);   // MedDev tech news on the half hour, when the page can read the hub
        else if(ctx.currentTime-lastSpot>nextGap){ setTimeout(()=>spot(),wait+300); }
        else if(R()<.55&&!speaking) setTimeout(()=>{ if(on&&!speaking){ if(TYPES.stingers&&VSTING.length&&R()<.6) voiceSting(); else pick(STINGS)(ctx.currentTime+.05); } },wait+200);
      }
      if(s.step>=s.bars*16) s.done=true;
    }
  }
  songs=songs.filter(s=>!s.done||ctx.currentTime<(s.endT||0));
  if(bed&&!bed.stopped) while(bed.next<ahead){ playBed(bed,bed.next); bed.step++; bed.next+=bed.sp; }
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
async function fetchCached(fn,key,ttl){ try{ if(key==="sp"?(!spCache||Date.now()-spAt>ttl):(!wxCache||Date.now()-wxAt>ttl)){ const v=await Promise.race([fn(),new Promise(r=>setTimeout(()=>r(null),5000))]); if(key==="sp"){spCache=v;spAt=Date.now();} else {wxCache=v;wxAt=Date.now();} } return key==="sp"?spCache:wxCache; }catch(e){ return null; } }
async function sportsLines(){
  let g=null; if(typeof opts.sports==="function") g=await fetchCached(opts.sports,"sp",10*60e3);
  if(!(g&&g.length)&&typeof opts.sports==="function"&&!opts.cannedFallback) return null;   // live mode: no canned sports
  const lines=[]; if(CHIP.intro.length) lines.push(["host",pick(CHIP.intro)]);
  if(g&&g.length){
    // half mainstream, half obscure: the provider sends one of each when it can; play them in a random order
    const list=g.slice(0,2); if(list.length===2&&R()<.4) list.reverse();
    for(const x of list){ const k=x.state==="in"?"live":x.state==="pre"?"pre":(x.won||x.score>x.oscore)?"win":"loss";
      const when=x.date?new Date(x.date).toLocaleString([],{weekday:"long",hour:"numeric",minute:"2-digit"}):"soon";
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
  const wv=w&&w.temp!=null?{...v,temp:Math.round(w.temp),cond:w.cond||"doing its thing",place:w.place||"your area",wind:w.wind!=null?Math.round(w.wind)+" miles an hour":"who knows"}:null;
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
  for(const x of items){
    const ch=x.channel, chSay=CH_SAY[ch]||ch.replace(/[-_.]/g," "), ini=x.who.initial?` ${x.who.initial}.`:"";
    const lead=pick(NEWS.lead[x.kind]||NEWS.lead.other||["In {channel}, {name} posted:"]);
    let txt=x.text; for(const n of x.names||[]){ const sp=sayName(n); if(sp!==n.first) txt=txt.replace(new RegExp(`(?<![\\p{L}])${n.first.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![\\p{L}])`,"gu"),sp); }
    const vid=!x.image&&x.video, onlyMedia=!x.text&&(x.image||x.video), ml=onlyMedia?pick((vid?NEWS.videoOnly:NEWS.photoOnly).length?(vid?NEWS.videoOnly:NEWS.photoOnly):["{name} posted something I can't see."]):null;
    if(onlyMedia) lines.push(["news",{say:fill(ml,{name:sayName(x.who)+ini,channel:chSay}),show:fill(ml,{name:x.who.first+ini,channel:"#"+ch})}]);
    else lines.push(["news",{say:`${fill(lead,{name:sayName(x.who)+ini,channel:chSay})} ${txt}`,show:`${fill(lead,{name:x.who.first+ini,channel:"#"+ch})} ${x.text}`}]);
    if(x.image||x.video){ const pool=vid?NEWS.video:NEWS.image; if(pool.length){ const n=(x.image||0)+(x.video||0); const things=vid?(n>1?"videos":"video"):(n>1?"photos":"photo"), num=["","a","two","three","four","five","six"][n]||String(n), athing=`${num} ${things}`;
        lines.push(["news",fill(pick(pool),{n:String(n),things,athing,Athing:athing[0].toUpperCase()+athing.slice(1)})]); } }
    if(x.kind!=="official"&&(NEWS.react[x.kind]||NEWS.react.other||[]).length) lines.push(["host",pick(NEWS.react[x.kind]||NEWS.react.other)]);
    budget+=(txt?String(txt).split(/\s+/).length/2.4:0)+4+(x.image||x.video?4.5:0); if(budget>110) break;   // keep the whole break under about two minutes
  }
  if(NEWS.outro.length) lines.push(["host",pick(NEWS.outro)]);
  return lines;
}
let lastNewsHour=-1, lastTechHour=-1;
/* MedDev tech news on the :30s: what changed in the hub's automations in the past week, one item per automation, about a minute. */
const TECH={intro:cat2("technews","intro"),outro:cat2("technews","outro"),lead:{},react:cat2("technews","react")};
packs.forEach(p=>{ const l=p.technews&&p.technews.lead; if(l) for(const k in l) (TECH.lead[k]=TECH.lead[k]||[]).push(...l[k]); });
const TECHV={accent:"british",names:["Daniel","Arthur","Oliver","Google UK English Male","Microsoft Ryan","Microsoft George"],pitch:1,rate:1.02};
function techDue(){ if(typeof opts.techNews!=="function"||!spotsOn||!TYPES.technews) return false; const d=new Date(), key=d.getDate()*24+d.getHours(); const m=d.getMinutes(); if(m<30||m>=38||key===lastTechHour) return false; lastTechHour=key; return true; }
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
function newsDue(){ if(typeof opts.news!=="function"||!spotsOn||!TYPES.news) return false; const d=new Date(), key=d.getDate()*24+d.getHours(); if(d.getMinutes()>=8||key===lastNewsHour) return false; lastNewsHour=key; return true; }
const PLAYS=cat("plays"), ARTS=cat("arts"), PODS=cat("podcasts"), COOKS=cat("cooking"); const PLQ=[], ARQ=[], POQ=[], COQ=[];
const fromQ=(q,src)=>{ if(!q.length){ const a=[...src]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } q.push(...a); } return q.shift(); };
function showSpot(kind){ if(kind==="play"&&PLAYS.length) return {kind,...fromQ(PLQ,PLAYS)}; if(kind==="arts"&&ARTS.length) return {kind,...fromQ(ARQ,ARTS)};
  if(kind==="podcast"&&PODS.length) return {kind,...fromQ(POQ,PODS)}; if(kind==="cooking"&&COOKS.length) return {kind,...fromQ(COQ,COOKS)}; if(kind==="funnelball"&&FB.cities.length) return {kind}; return null; }
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
const part=k=>packs.flatMap(p=>(p.adParts&&p.adParts[k])||[]);
const AP={owner:part("owner"),kind:part("kind"),pitch:part("pitch"),turn:part("turn"),backdown:part("backdown")};
function genAd(){ if(!AP.owner.length||!AP.kind.length) return pick(ADS); const b=`${pick(AP.owner)} ${pick(AP.kind)}`; return `${b}. ${pick(AP.pitch)}, ${pick(AP.turn)}. ${pick(AP.backdown)}. ${b}.`; }
const QUEUE=[]; const refill=()=>{ const a=[...ADS]; for(let i=a.length-1;i>0;i--){ const j=ri(0,i); [a[i],a[j]]=[a[j],a[i]]; } QUEUE.push(...a); };
/* Content types listeners can switch off (music always plays). */
const TYPE_KEYS=["ids","stingers","ads","interviews","callers","weather","sports","plays","arts","podcast","cooking","funnelball","technews","news"];
const TYPES={}; for(const k of TYPE_KEYS) TYPES[k]=!(opts.types&&opts.types[k]===false);
const KIND_TYPE={id:"ids",ad:"ads",interview:"interviews",caller:"callers",weather:"weather",sports:"sports",play:"plays",arts:"arts",podcast:"podcast",cooking:"cooking",funnelball:"funnelball",technews:"technews",news:"news"};
function nextSpot(){ spotCount++;
  if(TYPES.ids&&LATE.length&&spotCount>2&&R()<.12) return {kind:"id",late:1,text:say(pick(LATE))};
  const showOk=spotCount>1&&ctx&&ctx.currentTime-lastShow>720;   // at most one play or arts piece every 12 minutes
  if(showOk&&TYPES.plays&&R()<.14&&PLAYS.length) return showSpot("play");
  if(showOk&&TYPES.arts&&R()<.16&&ARTS.length) return showSpot("arts");
  if(showOk&&TYPES.podcast&&R()<.14&&PODS.length) return showSpot("podcast");
  if(showOk&&TYPES.cooking&&R()<.14&&COOKS.length) return showSpot("cooking");
  const opts2=[["interviews",.17,INTERVIEWS.length],["callers",.07,CALLERS.open.length],["weather",.10,WX.time.length||TAB.noData.length],["sports",.09,CHIP.noData.length],["funnelball",.06,FB.cities.length],["ids",.15,IDS.length],["ads",.42,ADS.length||AP.owner.length]]
    .filter(([k,w,n])=>TYPES[k]&&n);
  if(!opts2.length) return null;   // everything switched off: just music
  let r=R()*opts2.reduce((a,o)=>a+o[1],0), k=opts2[0][0]; for(const o of opts2){ if((r-=o[1])<=0){ k=o[0]; break; } }
  if(k==="callers") return callerSegment();
  if(k==="interviews"){ if(!IVQ.length) ivRefill(); const iv=IVQ.shift(); return {kind:"interview",title:iv.title,guest:iv.guest,guest2:iv.guest2,lines:iv.lines}; }
  if(k==="weather") return {kind:"weather"};
  if(k==="sports") return {kind:"sports"};
  if(k==="funnelball") return {kind:"funnelball"};
  if(k==="ids") return {kind:"id",text:say(pick(IDS))};
  if(!ADS.length||(R()<.3&&AP.owner.length)) return {kind:"ad",text:genAd()};
  if(!QUEUE.length) refill(); return {kind:"ad",text:QUEUE.shift()}; }

let voice=null;
const HAS_TTS=typeof window!=="undefined"&&"speechSynthesis" in window;
function pickVoice(){ if(!HAS_TTS) return null; const vs=speechSynthesis.getVoices(); if(!vs.length) return null;
  const en=vs.filter(v=>/^en/i.test(v.lang));
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
  if(!HAS_TTS) return null; const vs=speechSynthesis.getVoices(); const a=ACCENTS[spec.accent]||{};
  for(const n of [...(spec.names||[]),...(a.names||[])]){ const v=vs.find(v=>v.name===n||v.name.startsWith(n+" ")||v.name.startsWith(n+" (")); if(v) return v; }
  if(a.lang){ const v=vs.find(v=>(v.lang||"").replace("_","-").toLowerCase().startsWith(a.lang)); if(v) return v; }
  return null;
}
const isRobo=v=>v&&/Fred|Ralph|Zarvox|Trinoids|Albert/i.test(v.name);
function hostCast(){ voice=voice||pickVoice(); return {voice, pitch:isRobo(voice)?1:.15, rate:isRobo(voice)?.95:.92}; }
function guestCast(spec,host){
  const v=voiceFor(spec||{});
  if(v&&(!host.voice||v.name!==host.voice.name)) return {voice:v,pitch:spec.pitch??1,rate:spec.rate??1};
  // no distinct voice on this machine: same voice, clearly different pitch/speed
  return {voice:host.voice, pitch:Math.max(.1,Math.min(2,(spec&&spec.pitch)||rr(.9,1.9))), rate:(spec&&spec.rate)||rr(.85,1.2)};
}
function fadeTo(p,v,dur,t){ p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); p.linearRampToValueAtTime(v,t+dur); }
function speak(text,done,cast,shown){
  let finished=false; const fin=()=>{ if(finished) return; finished=true; voiceSrc=null; done(); };
  const c=cast||hostCast(); emit("caption",{text:shown||text,who:(c&&c.who)||"DJ"});
  // The app can render each line to audio (macOS voices) so it plays through the volume, EQ, meters and visualizer.
  if(typeof opts.tts==="function"&&ctx&&voiceIn){
    const spec={text,voice:c.voice?c.voice.name:(c.voiceName||null),rate:c.rate||1,pitch:c.pitch==null?1:c.pitch};
    Promise.race([opts.tts(spec),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tts timeout")),15000))])
      .then(buf=>ctx.decodeAudioData(buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)))
      .then(ab=>{ if(!on){ fin(); return; } const src=ctx.createBufferSource(); src.buffer=ab; src.connect(c.phone?phoneLine():voiceIn); voiceSrc=src;
        src.onended=fin; src.start(ctx.currentTime+.02); setTimeout(fin,ab.duration*1000+2500); })
      .catch(()=>systemSpeak(text,fin,c));
    return;
  }
  systemSpeak(text,fin,c);
}
/* Callers sound like they're on the phone: band-limited (high-pass and low-pass), a nasal bump and a little distortion. */
function phoneLine(){
  const hp=filt("highpass",420,.9), hp2=filt("highpass",380,.7), bump=filt("peaking",1600,1.2), lp=filt("lowpass",3300,.9), lp2=filt("lowpass",3600,.7);
  bump.gain.value=5; const sh=ctx.createWaveShaper(); sh.curve=shaper(3.2); sh.oversample="2x"; const out=G(.85);
  hp.connect(hp2).connect(bump).connect(G(1.6)).connect(sh).connect(lp).connect(lp2).connect(out).connect(voiceIn);
  return hp;
}
function systemSpeak(text,fin,c){
  if(!HAS_TTS){ setTimeout(fin,Math.min(20000,text.length*70)); return; }
  const u=new SpeechSynthesisUtterance(text); if(c.voice) u.voice=c.voice;
  u.pitch=c.pitch; u.rate=c.rate; u.volume=Math.max(0,Math.min(1,opts.volume??1));   // system speech can't be EQ'd, but it follows the volume
  u.onboundary=()=>{ voicePulse=1; }; u.onend=fin; u.onerror=fin; setTimeout(fin,Math.min(32000,3000+text.length*120));
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function speakLines(lines,cast,done){
  let i=0; const next=()=>{ if(!on||i>=lines.length){ done(); return; } const [who,text]=lines[i++];
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
  if(!on||speaking) return; speaking=true; const line=say(pick(VSTING)), t=ctx.currentTime+.05; emit("spot",{kind:"stinger",text:line});
  fadeTo(musicDuck.gain,.35,.4,t); const len=pick(STINGS)(t);
  setTimeout(()=>{ if(!on){ speaking=false; return; } speak(line,()=>{ if(ctx) fadeTo(musicDuck.gain,1,1,ctx.currentTime+.1); speaking=false; }); },Math.max(300,len*500));
}
function spot(force){
  if(!on||speaking||!spotsOn) return;
  if(force&&KIND_TYPE[force]&&!TYPES[KIND_TYPE[force]]) return;   // switched off in Settings
  const sp=force?(showSpot(force)||{kind:force}):nextSpot(); if(!sp) return;
  speaking=true; lastSpot=ctx.currentTime;
  const show=sp.kind==="play"||sp.kind==="arts"||sp.kind==="podcast"||sp.kind==="cooking", ad=sp.kind==="ad", iv=sp.kind==="interview"||sp.kind==="weather"||sp.kind==="sports"||sp.kind==="news"||sp.kind==="technews"||sp.kind==="funnelball"||show, t=ctx.currentTime+.05; emit("spot",sp);
  fadeTo(musicDuck.gain,show?.0001:ad||iv?.02:.2,ad||iv?1.2:.6,t);
  const st0=ad||iv?.9:.25, len=pick(STINGS)(t+st0);
  let lead=st0+len*.75+(sp.late?rr(3.2,4.5):0);
  if(ad){ bed=startBed(t+st0+len*.65); lead+=.7; }
  if(iv){ bed=startBed(t+st0+len*.65,sp.kind==="play"?"organ":sp.kind==="arts"||sp.kind==="cooking"?"arts":true); lead+=.5; }
  const t0spot=ctx.currentTime; if(show) lastShow=t0spot;
  const after=()=>{ lastSpot=ctx.currentTime; const talk=lastSpot-t0spot;   // music-weighted: ~2 songs after a short break, 3-4 after a long one
    nextGap=talk>40?rr(160,240)+talk*.5:rr(100,170);
    if(!on){ speaking=false; return; }
    const t2=ctx.currentTime+.15; let back=.4;
    if(bed){ endBed(bed,t2); bed=null; back=1.4; }
    if(!ad||R()<.5){ const l2=pick(STINGS)(t2+back); back+=l2*.6; }
    fadeTo(musicDuck.gain,1,1.6,t2+back); speaking=false; };
  setTimeout(()=>{ if(!on){ speaking=false; return; }
    if(sp.kind==="news"){ newsLines().then(lines=>{ if(!on){ speaking=false; return; }
        if(!lines){ after(); return; }   // nothing new in Slack: straight back to the music
        sp.lines=lines; sp.text=lines.map(l=>typeof l[1]==="object"?l[1].show:l[1]).join(" "); emit("spot",sp); const host=hostCast();
        speakLines(lines,{host,news:guestCast(NEWSV,host),names:{host:"DJ",news:"Company News"}},after); }); return; }
    if(sp.kind==="technews"){ techLines().then(lines=>{ if(!on){ speaking=false; return; } if(!lines){ after(); return; }
        sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast(); speakLines(lines,{host,tech:guestCast(TECHV,host),names:{host:"DJ",tech:"MedDev Tech News"}},after); }); return; }
    if(sp.kind==="weather"||sp.kind==="sports"){ (sp.kind==="weather"?weatherLines():sportsLines()).then(lines=>{ if(!on){ speaking=false; return; }
        if(!lines){ if(!TYPES.ids){ after(); return; } const id={kind:"id",text:say(pick(IDS))}; emit("spot",id); speak(id.text,after); return; }
        sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast();
        speakLines(lines,{host,tab:guestCast(TABITHA,host),chip:guestCast(CHIPV,host),names:{host:"DJ",tab:"Tabitha Snatterbean",chip:"Chip Nitro"}},after); }); return; }
    if(sp.kind==="play"){ const host=hostCast(), cast={host,names:{host:"DJ"}};
      for(const [k,c] of Object.entries(sp.cast||{})){ cast[k]=guestCast(c,host); cast.names[k]=c.name||k; }
      speakLines([["host",`And now, the M D F M Golden Age Radio Hour. ${sp.title}. Tonight: ${sp.episode||"a new episode"}.`],...sp.lines,["host",pick(["You've been listening to the M D F M Golden Age Radio Hour. Back to the beats.","That was the Golden Age Radio Hour. None of those products exist. Please stop asking.","Golden Age Radio Hour, everybody. They don't make them like that anymore. For legal reasons."])]],cast,after); return; }
    if(sp.kind==="arts"){ const host=hostCast(), wren=guestCast(ARTS_HOST,host), cast={host:wren,dj:host,names:{host:"Wren Applewhite-Dunst",dj:"DJ"}};
      for(const k of ["reporter","subject","subject2"]) if(sp[k]){ cast[k]=guestCast(sp[k],wren); cast.names[k]=(k==="reporter"?sp[k].name:sp[k].name)||k; }
      speakLines([["dj","M D F M Arts and Culture. Here's Wren."],["host",`This is M D F M Arts and Culture. I'm Wren Applewhite-Dunst.`],["pause",700],...sp.lines,["host",pick(["This is M D F M Arts. Thank you for listening slowly.","For M D F M Arts and Culture, I'm Wren Applewhite-Dunst. Breathe in. Okay, that's enough.","I'm Wren Applewhite-Dunst. Art is everywhere. Mostly in the way."])]],cast,after); return; }
    if(sp.kind==="funnelball"){ const lines=funnelballLines(); sp.lines=lines; sp.text=lines.map(l=>l[1]).join(" "); emit("spot",sp); const host=hostCast();
      speakLines([["host",pick(["Time for Funnelball on M D F M.","It's Funnelball time. I still don't know the rules.","M D F M Funnelball, presented by nobody."])],...lines],{host,pbp:guestCast(FB_PBP,host),color:guestCast(FB_COLOR,host),names:{host:"DJ",pbp:"Duke Ransom",color:"Lorna Pike"}},after); return; }
    if(sp.kind==="podcast"||sp.kind==="cooking"){ const host=hostCast(), cast={dj:host,names:{dj:"DJ"}};
      for(const [k,c] of Object.entries(sp.cast||{})){ cast[k]=guestCast(c,host); cast.names[k]=c.name||k; }
      cast.host=cast[Object.keys(sp.cast||{})[0]]||host;
      const open=sp.kind==="podcast"?[["dj",`M D F M presents a podcast we did not ask for. ${sp.show}. ${sp.title}.`]]:[["dj",`And now, from M D F M Public Radio, ${sp.show}.`],["pause",600]];
      const close=sp.kind==="podcast"?pick(["That was a podcast. We're legally required to say it was a podcast.","Like, subscribe, and please stop sending us protein powder.","M D F M does not endorse the grindset. Back to the music."]):pick(["Simmer Down is made possible by listeners like you, and by butter.","That was Simmer Down. Please don't call in about the recipes.","Simmer Down, everybody. Back to the beats."]);
      speakLines([...open,...sp.lines,["dj",close]],cast,after); return; }
    if(iv){ const host=hostCast(); speakLines(sp.title==="Caller"?sp.lines:[["host",`M D F M interview. Today: ${sp.title}.`],...sp.lines],{host,guest:{...guestCast(sp.guest,host),phone:sp.title==="Caller"},guest2:guestCast(sp.guest2||{accent:"british"},host),names:{host:"DJ",guest:sp.title,guest2:"Guest"}},after); }
    else speak(sp.text,after); }, lead*1000);
}


/* ---------- public API ---------- */
function setOn(v){
  if(v===on) return; on=v;
  if(v){ if(!ctx) init(opts.audioContext); ctx.resume(); const t=ctx.currentTime; fadeTo(master.gain,(opts.volume??1)*VOL,.4,t);
    if(!songs.length){ startSong(t+.1,0); lastSpot=t-999; } clearInterval(timer); timer=setInterval(tick,40); tick(); }
  else if(ctx){ const t=ctx.currentTime; fadeTo(master.gain,0,.3,t); clearInterval(timer); try{speechSynthesis.cancel();}catch(e){} try{ voiceSrc&&voiceSrc.stop(); }catch(e){} speaking=false;
    const c=ctx,md=musicDuck; setTimeout(()=>{ if(!on){ for(const s of songs) try{s.bus.disconnect();}catch(e){} songs=[]; if(bed){ try{bed.bus.disconnect();}catch(e){} bed=null; } fadeTo(md.gain,1,.01,c.currentTime); c.suspend(); } },400); }
  emit(v?"start":"stop");
}
const N=19,outB=new Float32Array(N),edges=[]; for(let i=0;i<=N;i++) edges.push(42*Math.pow(15000/42,i/N));
function getSpectrum(){
  if(!on||!ctx) return null;
  analyser.getByteFrequencyData(freq); const hz=ctx.sampleRate/analyser.fftSize;
  for(let b=0;b<N;b++){ const a=Math.floor(edges[b]/hz),z=Math.max(a+1,Math.floor(edges[b+1]/hz)); let sum=0,mx=0; for(let k=a;k<z;k++){ sum+=freq[k]; if(freq[k]>mx) mx=freq[k]; }
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
  const keep={ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn};
  const oc=new OfflineAudioContext(2,Math.floor(44100*secs),44100); init(oc); master.gain.value=VOL;
  if(kind==="song"){ const s=setupSong(makeSong(arg),.05,0); if(ride) rideOn(s); while(s.next<secs-.1&&s.step<s.bars*16){ playStep(s,s.step,s.next); s.step++; s.next+=s.sp; } }
  else if(kind==="bed"){ const b=startBed(.05); if(arg!=null) b.def=BEDS[arg]; while(b.next<secs-2.5){ playBed(b,b.next); b.step++; b.next+=b.sp; } endBed(b,secs-2.4); }
  else if(kind==="sting"){ STINGS[arg](.1); }
  const buf=await oc.startRendering(); ({ctx,pre,master,analyser,freq,vuA,vuBuf,noiseBuf,songRev,fxRev,fxDelay,musicDuck,SAT,SAT808,UW,TONE,voiceIn}=keep);
  return buf;
}
return {
  version: VERSION,
  start(){ setOn(true); },
  stop(){ setOn(false); },
  toggle(){ setOn(!on); return on; },
  isOn(){ return on; },
  skip(){ for(const s of songs) if(!s.handed) s.step=Math.max(s.step,(s.bars-4)*16-1); },
  spotNow(kind){ spot(kind); },
  setProviders(p){ for(const k of ["weather","sports","news","tts","cannedFallback"]) if(k in p) opts[k]=p[k]; wxCache=spCache=null; },   // kind optional: "weather" | "sports"
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
  setTypes(t){ for(const k of TYPE_KEYS) if(t&&k in t) TYPES[k]=!!t[k]; },   // {ids, stingers, ads, interviews, callers, weather, sports, plays, arts, podcast, cooking, funnelball, technews, news}: false switches a kind off
  getTypes(){ return {...TYPES}; },
  sampleLines(kind){ if(kind==="funnelball") return funnelballLines(); if(kind==="technews") return techLines(); const s=showSpot(kind); return s&&s.lines; },   // for tests and previews
  setVolume(v){ opts.volume=v; if(ctx&&on) fadeTo(master.gain,v*VOL,.2,ctx.currentTime); },
  nowPlaying(){ return nowPlaying; },
  getSpectrum,
  getLevels,
  thwack(){ if(!on||!ctx) return; const b=fxBus(false),t0=ctx.currentTime; D.snare(b,t0,1.3,.3,.8); D.clap(b,t0,.8,.2); D.tom(b,t0,.6,90); },
  on(ev,f){ (listeners[ev]=listeners[ev]||[]).push(f); return ()=>{ listeners[ev]=listeners[ev].filter(x=>x!==f); }; },
  nextSpotText(){ return nextSpot(); },
  renderOffline,
  get audioContext(){ return ctx; },
};
}
