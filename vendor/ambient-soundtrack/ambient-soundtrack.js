/*!
 * Ambient Soundtrack (from "Where Ya Been, Collin?!")
 * A generative, never-repeating soft piano piece built entirely with the Web Audio API: an acoustic-style piano
 * (with pedal, hammer and key noises), very light strings, low woodwinds, a hushed room tone, tape grain and the
 * occasional far-off concert-hall sound, all through a warm "tape" stage and a wood-panelled room reverb.
 * No samples, no dependencies. Works in any modern browser or web view.
 *
 *   const music = AmbientSoundtrack.create();          // or create({ settings:{ tempo:.9 } })
 *   button.onclick = () => music.start();               // browsers need a user gesture before audio can start
 *   music.set('strings', 1.3);                          // live mixer (see DEFAULTS below)
 *   music.stop();
 *
 *   // render a finished file instead of live audio (e.g. for a radio playlist):
 *   const wavBlob = await AmbientSoundtrack.renderWav(300);   // 5 minutes, 44.1 kHz 16-bit stereo
 */
(function(root,factory){ if(typeof module==='object'&&module.exports) module.exports=factory(); else root.AmbientSoundtrack=factory(); })(typeof self!=='undefined'?self:this,function(){
'use strict';
// Mixer settings. Levels are 0–1.5 (1 = as designed); tempo 0.6–1.4; notes (melody busy-ness), warmth and space 0–1.
const DEFAULTS={master:1,piano:1,mech:1,strings:1,winds:1,room:1,grain:1,hall:1,tempo:1,notes:.5,warmth:.5,space:.5};

function create(opts={}){
  const M={...DEFAULTS}; for(const k in (opts.settings||{})) if(k in DEFAULTS&&isFinite(opts.settings[k])) M[k]=+opts.settings[k];
  const offline=!!opts.offline, VOL=1.3, RM=false;
  let ctx=opts.context||null, master=null, music=null, verb=null, wet=null, tone=null, bus=null, out=null;
  let timer=0, hallTimer=0, nextT=0, step=0, built=false, started=false, playing=false;
  const C={}, BASE={piano:.32,mech:1,strings:1,winds:1,room:1,grain:1,hall:1};
  const warmHz=()=>9000*Math.pow(1700/9000,M.warmth), wetAmt=()=>.2+.75*M.space;
  function init(){
    if(built) return true;
    if(!ctx){ const AC=(typeof window!=='undefined')&&(window.AudioContext||window.webkitAudioContext); if(!AC) return false; ctx=new AC(); }
    master=ctx.createGain(); master.gain.value=offline?VOL*M.master:0;
    out=ctx.createDynamicsCompressor(); out.threshold.value=-6; out.knee.value=6; out.ratio.value=8; out.attack.value=.003; out.release.value=.2; master.connect(out);
    out.connect(opts.destination||ctx.destination);
    verb=ctx.createConvolver(); const len=Math.floor(ctx.sampleRate*4.8), ir=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c); let lp=0; for(let i=0;i<len;i++){const k=i/len, a=.5-.42*k; lp=lp*a+(Math.random()*2-1)*(1-a); d[i]=lp*Math.pow(1-k,2.4)*1.6;}}
    verb.buffer=ir; wet=ctx.createGain(); wet.gain.value=wetAmt(); verb.connect(wet); wet.connect(master);
    Object.keys(BASE).forEach(k=>{C[k]=ctx.createGain(); C[k].gain.value=BASE[k]*M[k];});
    C.hallWet=ctx.createGain(); C.hallWet.gain.value=M.hall; C.hallWet.connect(verb);
    bus=ctx.createGain(); bus.gain.value=0;
    const sat=ctx.createWaveShaper(), curve=new Float32Array(1024); for(let i=0;i<1024;i++){const x=i/511.5-1; curve[i]=Math.tanh(1.6*x)/Math.tanh(1.6);} sat.curve=curve; sat.oversample='2x';
    const wow=ctx.createDelay(.05); wow.delayTime.value=.008;
    [[.33,.0004],[.07,.0003],[5.7,.00003]].forEach(([f,d])=>{const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=f; g.gain.value=d; o.connect(g); g.connect(wow.delayTime); o.start();});
    tone=ctx.createBiquadFilter(); tone.type='lowpass'; tone.frequency.value=warmHz(); tone.Q.value=.35;
    const lowWarm=ctx.createBiquadFilter(); lowWarm.type='lowshelf'; lowWarm.frequency.value=220; lowWarm.gain.value=2;
    bus.connect(sat); sat.connect(wow); wow.connect(tone); tone.connect(lowWarm); lowWarm.connect(master); lowWarm.connect(verb);
    music=C.piano;
    const b1=ctx.createBiquadFilter(), b2=ctx.createBiquadFilter(), b3=ctx.createBiquadFilter();
    b1.type='peaking'; b1.frequency.value=230; b1.Q.value=.9; b1.gain.value=2.2; b2.type='peaking'; b2.frequency.value=750; b2.Q.value=1.1; b2.gain.value=1.4;
    b3.type='highshelf'; b3.frequency.value=3800; b3.gain.value=-5;
    music.connect(b1); b1.connect(b2); b2.connect(b3); b3.connect(bus);
    const erLp=ctx.createBiquadFilter(); erLp.type='lowpass'; erLp.frequency.value=2800; b3.connect(erLp);
    [[.011,.16,-.6],[.019,.12,.5],[.027,.1,-.3],[.041,.08,.7]].forEach(([d,g,p])=>{const dl=ctx.createDelay(.1), gg=ctx.createGain(); dl.delayTime.value=d; gg.gain.value=g;
      erLp.connect(dl); dl.connect(gg); if(ctx.createStereoPanner){const pn=ctx.createStereoPanner(); pn.pan.value=p; gg.connect(pn); pn.connect(bus);} else gg.connect(bus);});
    C.mech.connect(bus); C.strings.connect(bus); C.winds.connect(bus);
    C.room.connect(master); C.grain.connect(master); C.hall.connect(master);
    built=true; return true;
  }
  const hz=m=>440*Math.pow(2,((opts.mapNote?opts.mapNote(m):m)-69)/12);   // MDFM patch: the host can move notes (MDFM's TUNE key and mode)
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const pan=(dest,p)=>{ if(!ctx.createStereoPanner) return dest; const pn=ctx.createStereoPanner(); pn.pan.value=p; pn.connect(dest); return pn; };   // a panned input into dest
  // a short burst of filtered noise (used for all the little mechanical sounds)
  function nburst(dest,t,dur,a,type,f,q,att){const n=noise(dur+.05), fl=ctx.createBiquadFilter(), g=ctx.createGain(); fl.type=type; fl.frequency.value=f; fl.Q.value=q||.7;
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(a,t+(att||.004)); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    n.connect(fl); fl.connect(g); g.connect(dest); n.start(t); n.stop(t+dur+.05);}
  function thump(dest,t,f,a,dur){const o=ctx.createOscillator(), g=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(f*1.25,t); o.frequency.exponentialRampToValueAtTime(f,t+.04);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(a,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur+.05);}

  function note(m,t,vel,dur,dest){ if(opts.onNote) try{ opts.onNote('piano',m,t,dur,vel); }catch(e){}   // MDFM patch: each note as it's played (Save writes a MIDI file)
    // acoustic piano voice: stretched partials, unison strings that beat gently, a fast "prompt" decay into a quiet
    // aftersound, a felt-hammer knock, and a top register that behaves like real short treble strings
    const f0=hz(m), hi=Math.min(1,Math.max(0,(m-64)/22));
    vel*=1-.38*hi; dur*=1.3*(1-.3*hi);
    const B=.00022+.0011*Math.min(1,Math.max(0,(m-48)/40));
    const out=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=.2;
    f.frequency.setValueAtTime(Math.min(4000-1300*hi,f0*6),t); f.frequency.exponentialRampToValueAtTime(Math.max(280,f0*(1.4-.25*hi)),t+dur*.6);
    out.connect(f); f.connect(dest||music);
    const amps=[1,.45,.22,.12,.065,.035], N=m>86?2:m>76?3:m>66?4:6, att=.005+.004*hi;
    const prompt=.5-.17*hi, promptT=.4-.2*hi;
    for(let n=1;n<=N;n++){
      const fr=f0*n*Math.sqrt(1+B*n*n); if(fr>7500) break;
      const pg=ctx.createGain(), a=vel*amps[n-1], tau=dur/(1+(n-1)*(.55+.5*hi));
      pg.gain.setValueAtTime(0,t); pg.gain.linearRampToValueAtTime(a,t+att);
      pg.gain.exponentialRampToValueAtTime(a*(n===1?prompt:prompt*.7),t+promptT+.08*(n===1)); pg.gain.exponentialRampToValueAtTime(.0001,t+Math.max(.4,tau));
      pg.connect(out);
      const strings=n<=2&&hi>0?[-1,0,1]:n<=3?[-1,1]:[0], cents=(.8+1.6*hi)*(.8+Math.random()*.4);
      strings.forEach(sgn=>{const o=ctx.createOscillator(), sg=ctx.createGain(); o.type='sine'; o.frequency.value=fr; o.detune.value=sgn*cents+(Math.random()-.5)*.3;
        sg.gain.value=1/Math.sqrt(strings.length)*.85; o.connect(sg); sg.connect(pg); o.start(t); o.stop(t+Math.max(.4,tau)+.1);});
    }
    // felt hammer: a muffled knock, a little more present (and brighter) up top where real treble notes are mostly attack
    const h=noise(.07), hb=ctx.createBiquadFilter(), hg=ctx.createGain(); hb.type='bandpass'; hb.frequency.value=Math.min(3200,f0*(2.2-.8*hi)); hb.Q.value=.8;
    hg.gain.setValueAtTime(0,t); hg.gain.linearRampToValueAtTime(vel*(.2+.18*hi),t+.002); hg.gain.exponentialRampToValueAtTime(.0001,t+.04+.015*hi);
    h.connect(hb); hb.connect(hg); hg.connect(out); h.start(t); h.stop(t+.07);
    action(t,vel,m);
  }
  // the action you hear up close: the key's felt bottoming out on the keybed, the hammer's wooden flick and, when the
  // finger lifts, the soft tick of the key and back-check settling (each a little different every time)
  function action(t,vel,m){
    const side=Math.max(-.6,Math.min(.6,(m-60)/40)), d=pan(C.mech,side);
    nburst(d,t-.012,.03,vel*.16,'bandpass',rnd(260,380),1.1,.002);                // key travel + keybed thock
    nburst(d,t-.004,.018,vel*.05,'bandpass',rnd(1300,1900),1.6,.001);             // hammer shank flick
    const up=t+rnd(.35,1.3);
    nburst(d,up,.025,vel*.06,'bandpass',rnd(900,1300),1.3,.002);                  // key rising
    if(Math.random()<.35) nburst(d,up+rnd(.01,.03),.012,vel*.035,'bandpass',rnd(2300,3000),2,.001);  // little wooden click
  }
  // sustain pedal: lifting lets the dampers fall onto the strings with a soft felt brush; pressing raises every damper, so the
  // whole piano's undamped strings breathe a quiet, pitched "shhh" in sympathy with the chord (plus the odd squeak of the trapwork)
  function pedalUp(t){
    const d=pan(C.mech,-.15);
    nburst(d,t,.16,.022,'lowpass',850,.5,.01); thump(d,t+.01,62,.035,.09); nburst(d,t+.012,.02,.008,'bandpass',1700,2,.001);
  }
  function pedalDown(t,chord){
    const d=pan(C.mech,-.15);
    thump(d,t,52,.03,.16); nburst(d,t,.06,.012,'lowpass',500,.6,.004);
    if(Math.random()<.18){ const n=noise(.35), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.Q.value=18; const f0=rnd(900,1300);   // trapwork squeak
      bp.frequency.setValueAtTime(f0,t+.02); bp.frequency.linearRampToValueAtTime(f0*1.12,t+.2); g.gain.setValueAtTime(.0001,t+.02); g.gain.linearRampToValueAtTime(.006,t+.08); g.gain.exponentialRampToValueAtTime(.0001,t+.3);
      n.connect(bp); bp.connect(g); g.connect(d); n.start(t+.02); n.stop(t+.36); }
    // sympathetic bloom: soft noise rung through the open strings of the chord
    const D=3.2, n=noise(D+.1), g=ctx.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(1,t+.35); g.gain.exponentialRampToValueAtTime(.0001,t+D);
    n.connect(g); const sum=ctx.createGain(); sum.gain.value=.25;
    [chord[0],chord[1],chord[2],chord[3],chord[0]+12].forEach(p=>{const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=hz(p); bp.Q.value=60; g.connect(bp); bp.connect(sum);});
    sum.connect(C.mech); n.start(t); n.stop(t+D+.1);
  }
  // the bench now and then: a slow wooden creak as the player shifts their weight
  function bench(t){
    const n=noise(.8), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.Q.value=12; const f0=rnd(170,240);
    bp.frequency.setValueAtTime(f0,t); bp.frequency.linearRampToValueAtTime(f0*rnd(1.15,1.4),t+.6);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.02,t+.15); g.gain.linearRampToValueAtTime(.014,t+.45); g.gain.exponentialRampToValueAtTime(.0001,t+.75);
    n.connect(bp); bp.connect(g); g.connect(pan(C.mech,.1)); n.start(t); n.stop(t+.8);
  }

  // very light strings: a few bowed voices sitting under the piano, each a small section of slightly detuned players,
  // with a soft bow hiss, a slow swell in and a long fade out (they don't play every bar, so the texture breathes)
  function strings(chord,t,dur){
    const pick=[...new Set(chord.slice(1).filter(p=>p>=52&&p<=76))]; if(pick.length<2) return; if(opts.onNote) try{ opts.onNote('strings',pick,t,dur,.6); }catch(e){}   // MDFM patch (MIDI)
    const voices=[pick[0],pick[Math.floor(pick.length/2)],pick[pick.length-1]];
    const A=Math.min(3.2,dur*.35), R=Math.min(3.5,dur*.4);
    voices.forEach((p,vi)=>{
      const amp=[.0135,.01,.0075][vi], env=ctx.createGain(), lp=ctx.createBiquadFilter(), body=ctx.createBiquadFilter();
      lp.type='lowpass'; lp.frequency.value=1100+vi*250; lp.Q.value=.4; body.type='peaking'; body.frequency.value=420; body.Q.value=.9; body.gain.value=3;
      env.gain.setValueAtTime(.0001,t); env.gain.linearRampToValueAtTime(amp,t+A); env.gain.setValueAtTime(amp,t+dur-R*.4); env.gain.linearRampToValueAtTime(amp*.8,t+dur); env.gain.exponentialRampToValueAtTime(.0001,t+dur+R);
      lp.connect(body); body.connect(env); env.connect(pan(C.strings,[-.45,.1,.45][vi]));
      const vib=ctx.createOscillator(), vg=ctx.createGain(); vib.frequency.value=rnd(4.6,5.4); vg.gain.value=hz(p)*.0025; vib.connect(vg);
      [-8,-2,5,10].forEach(c=>{const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=hz(p); o.detune.value=c+rnd(-2,2); vg.connect(o.frequency);
        const og=ctx.createGain(); og.gain.value=.25; o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+R+.1);});
      const bn=noise(dur+R+.1), bb=ctx.createBiquadFilter(), bg=ctx.createGain(); bb.type='bandpass'; bb.frequency.value=hz(p)*3; bb.Q.value=1.2; bg.gain.value=.18;
      bn.connect(bb); bb.connect(bg); bg.connect(env); bn.start(t); bn.stop(t+dur+R+.1);
      vib.start(t); vib.stop(t+dur+R+.1);
    });
  }
  // low woodwinds: a bass clarinet (hollow, odd harmonics) or a bassoon (reedy, a little nasal), breathing a slow line or two
  // from the chord down in the cellar, with a touch of breath, a tongued start and vibrato that blooms late in long notes
  function reed(m,t,dur,kind,amp){ if(opts.onNote) try{ opts.onNote(kind,m,t,dur,.7); }catch(e){}   // MDFM patch (MIDI)
    const f=hz(m), out=ctx.createGain(), lp=ctx.createBiquadFilter(), fm=ctx.createBiquadFilter();
    lp.type='lowpass'; lp.frequency.value=kind==='clar'?720:1200; lp.Q.value=.6;
    fm.type='peaking'; fm.frequency.value=kind==='clar'?300:480; fm.Q.value=1.4; fm.gain.value=kind==='clar'?2:5;
    out.gain.setValueAtTime(.0001,t); out.gain.linearRampToValueAtTime(amp*.8,t+.22); out.gain.linearRampToValueAtTime(amp,t+dur*.45); out.gain.linearRampToValueAtTime(amp*.7,t+dur*.9); out.gain.exponentialRampToValueAtTime(.0001,t+dur+.55);
    lp.connect(fm); fm.connect(out); out.connect(pan(C.winds,kind==='clar'?-.25:.25));
    const vib=ctx.createOscillator(), vg=ctx.createGain(); vib.frequency.value=rnd(4.2,4.9); vg.gain.setValueAtTime(0,t); vg.gain.linearRampToValueAtTime(0,t+Math.min(1.2,dur*.4)); vg.gain.linearRampToValueAtTime(f*.0035,t+dur*.8); vib.connect(vg);
    const parts=kind==='clar'?[['square',.32],['triangle',.7]]:[['sawtooth',.38],['sine',.6]];
    parts.forEach(([ty,a])=>{const o=ctx.createOscillator(), og=ctx.createGain(); o.type=ty; o.frequency.setValueAtTime(f*.994,t); o.frequency.exponentialRampToValueAtTime(f,t+.14); vg.connect(o.frequency);
      og.gain.value=a; o.connect(og); og.connect(lp); o.start(t); o.stop(t+dur+.6);});
    const br=noise(dur+.6), bb=ctx.createBiquadFilter(), bg=ctx.createGain(); bb.type='bandpass'; bb.frequency.value=kind==='clar'?1100:1500; bb.Q.value=.8; bg.gain.value=.09;
    br.connect(bb); bb.connect(bg); bg.connect(out); br.start(t); br.stop(t+dur+.6);
    nburst(out,t,.03,.25,'bandpass',kind==='clar'?600:900,1,.002);          // the tongue leaving the reed
    vib.start(t); vib.stop(t+dur+.6);
  }

  // D major chord palette (16 voicings)
  const D9=[50,57,62,64,66,69,73,76], BM7=[47,54,59,62,66,69,71,74], GM7=[43,50,55,59,62,66,69,74], ASUS=[45,52,57,59,62,64,69,71],
        EM9=[52,59,62,64,66,67,71,74], FSM7=[54,61,64,66,69,73,76,78], GM9=[43,50,57,59,62,66,69,71], A6=[45,52,57,61,64,66,69,73];
  const BM9=[47,54,57,61,62,66,69,73], EM11=[52,59,62,67,69,71,74,78], DFS=[54,57,61,62,64,66,69,73], GADD9=[43,50,55,57,59,62,67,69];
  const DA9=[45,57,62,64,66,69,74,76], BM11=[47,54,59,62,64,66,69,74], GM7S11=[43,50,59,61,66,69,71,74], A7SUS=[45,52,57,62,64,67,69,71];
  const CH=[D9,BM7,GM7,ASUS,EM9,FSM7,GM9,A6,BM9,EM11,DFS,GADD9,DA9,BM11,GM7S11,A7SUS];
  // no fixed order: each bar picks a next chord from ones that flow naturally from the current one (weights in brackets)
  const NEXT={0:[[1,3],[8,2],[2,2],[4,2],[5,1],[11,2],[6,1]], 1:[[2,3],[6,2],[4,2],[9,2],[11,1]], 2:[[3,3],[7,2],[0,2],[4,1],[10,1]],
    3:[[0,4],[8,2],[1,1],[10,1]], 4:[[3,3],[7,2],[5,1],[10,1],[2,1]], 5:[[6,3],[2,2],[1,1],[9,1],[11,1]], 6:[[7,3],[3,2],[0,2],[10,1],[4,1]],
    7:[[0,4],[8,2],[10,1],[1,1]], 8:[[9,3],[2,2],[6,2],[4,1],[11,1]], 9:[[10,2],[3,2],[7,2],[5,1],[2,1]], 10:[[11,3],[2,2],[4,1],[9,1],[3,1]],
    11:[[0,3],[3,2],[7,2],[10,1],[8,1]],
    12:[[1,2],[8,2],[2,2],[13,1]], 13:[[2,2],[6,2],[14,2],[4,1]], 14:[[3,2],[15,2],[0,2],[7,1]], 15:[[0,3],[12,2],[13,1],[8,1]]};
  [[0,13,1],[1,14,1],[3,12,2],[4,15,1],[6,15,1],[7,12,1],[9,14,1]].forEach(([a,b,w])=>NEXT[a].push([b,w]));
  // melody notes for each chord, kept in the warm middle (nothing above D5)
  const MEL_EXTRA={0:[57],5:[57,61],12:[57]};
  const MEL=CH.map((ch,i)=>{const set=[...new Set(ch.slice(2).map(p=>p>74?p-12:p))]; (MEL_EXTRA[i]||[]).forEach(p=>{if(!set.includes(p)) set.push(p);}); return set;});
  let chordAt=0, ped=null;
  const nextChord=i=>{const o=NEXT[i]; let r=Math.random()*o.reduce((a,b)=>a+b[1],0); for(const [j,w] of o){r-=w; if(r<=0) return j;} return o[0][0];};
  const SUB0=1.2;   // one step at normal tempo; a bar is 8 steps
  function schedule(until){
    if(!ctx) return; const horizon=until??ctx.currentTime+1.5;
    while(nextT<horizon){
      const SUB=SUB0/M.tempo, BAR=SUB*8;
      const pos=step%8; if(pos===0&&step>0) chordAt=nextChord(chordAt); const ch=CH[chordAt];
      if(pos===0&&opts.onChord) try{ opts.onChord(nextT,ch.slice(),BAR); }catch(e){}   // MDFM patch: each chord as it's laid out (offline Save), so MDFM's style matrix can play along
      if(pos===0){
        // legato pedalling: the new chord is struck, the old pedal lifts (its strings get damped) and the pedal goes back down
        const old=ped; ped=ctx.createGain(); ped.connect(music);
        if(old){ old.gain.setValueAtTime(1,nextT+.02); old.gain.setTargetAtTime(0,nextT+.03,.07); pedalUp(nextT+.02); if(!offline) setTimeout(()=>{try{old.disconnect();}catch(e){}},(nextT-ctx.currentTime+2)*1000); }
        pedalDown(nextT+.2,ch);
        note(ch[0]-12,nextT,.13,9,ped); note(ch[1],nextT+.04,.05,8,ped);
        if(Math.random()<.72) strings(ch,nextT+rnd(0,SUB),BAR*rnd(.75,1));
        if(Math.random()<.5){ const kind=Math.random()<.5?'clar':'bsn', pool=[...new Set([ch[0],ch[1],ch[0]+12,ch[1]-12].filter(p=>p>=38&&p<=55))];
          let at=nextT+SUB*rnd(.5,3), left=nextT+BAR-at, p=pool[Math.floor(Math.random()*pool.length)];
          for(let k=0;k<3&&left>SUB*1.5;k++){ const d=Math.min(left,SUB*rnd(1.5,4)); reed(p,at,d*.92,kind,.012); at+=d; left-=d; p=pool[Math.floor(Math.random()*pool.length)]; if(Math.random()<.4) break; } }
        if(Math.random()<.1) bench(nextT+rnd(1,BAR-1));
      }
      const pMel=.08+.68*M.notes;
      if(pos===0||Math.random()<pMel){ const mp=MEL[chordAt], pick=mp[Math.floor(Math.random()*mp.length)]; note(pick,nextT+Math.random()*.25,.05+Math.random()*.05,4.5+Math.random()*2.5,ped); }
      step++; nextT+=SUB+(Math.random()-.5)*.12;
    }
  }
  // hushed room tone: two slowly breathing beds of soft, low-passed noise (left and right) far under everything
  function roomTone(){
    const t=ctx.currentTime, out=ctx.createGain(); out.gain.setValueAtTime(0,t); out.gain.linearRampToValueAtTime(.026,t+10);
    const hp=ctx.createBiquadFilter(), lp=ctx.createBiquadFilter(), lp2=ctx.createBiquadFilter();
    hp.type='highpass'; hp.frequency.value=90; hp.Q.value=.5; lp.type='lowpass'; lp.frequency.value=650; lp.Q.value=.3; lp2.type='lowpass'; lp2.frequency.value=1100; lp2.Q.value=.4;
    const merge=ctx.createChannelMerger(2);
    for(let ch=0;ch<2;ch++){ const src=noise(7+ch*1.3); src.loop=true; src.connect(merge,0,ch); src.start(t); }
    merge.connect(hp); hp.connect(lp); lp.connect(lp2); lp2.connect(out); out.connect(C.room);
    [[.05,.00165],[.023,.0012]].forEach(([f,d])=>{const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=f; g.gain.value=d; o.connect(g); g.connect(out.gain); o.start(t);});
    const sweep=ctx.createOscillator(), sg=ctx.createGain(); sweep.frequency.value=.03; sg.gain.value=45; sweep.connect(sg); sg.connect(lp.frequency); sweep.start(t);
    // the grain: faint tape hiss, a soft low tape rumble and very sparse specks of dust
    const gOut=ctx.createGain(); gOut.gain.setValueAtTime(0,t); gOut.gain.linearRampToValueAtTime(.042,t+10); gOut.connect(C.grain);
    const hiss=noise(5.3); hiss.loop=true; const hb=ctx.createBiquadFilter(), hl=ctx.createBiquadFilter(), hg=ctx.createGain();
    hb.type='highpass'; hb.frequency.value=2200; hl.type='lowpass'; hl.frequency.value=6500; hg.gain.value=.045;
    hiss.connect(hb); hb.connect(hl); hl.connect(hg); hg.connect(gOut); hiss.start(t);
    const rum=noise(6.1); rum.loop=true; const rl=ctx.createBiquadFilter(), rg=ctx.createGain(); rl.type='lowpass'; rl.frequency.value=120; rg.gain.value=.25;
    rum.connect(rl); rl.connect(rg); rg.connect(gOut); rum.start(t);
    { const sr=ctx.sampleRate, len=Math.ceil(sr*9.7), b=ctx.createBuffer(2,len,sr);
      for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch); for(let k=0;k<len/sr*26;k++){const i=Math.floor(Math.random()*(len-40)), a=(Math.random()*.6+.2)*(Math.random()<.5?-1:1); for(let j=0;j<24;j++) d[i+j]+=a*Math.exp(-j/5);}}
      const dust=ctx.createBufferSource(); dust.buffer=b; dust.loop=true; const dl=ctx.createBiquadFilter(), dh=ctx.createBiquadFilter(), dg=ctx.createGain();
      dh.type='highpass'; dh.frequency.value=700; dl.type='lowpass'; dl.frequency.value=4500; dg.gain.value=.07;
      dust.connect(dh); dh.connect(dl); dl.connect(dg); dg.connect(gOut); dust.start(t); }
  }
  // distant concert-hall life: every 25–70 s, one faint, far-off sound (a door, a dropped pencil, a creaky or folding seat, a rustle, footsteps, a cough, a program page, a string player tuning, jingling keys, a sniffle)
  function hallSound(at){
    if(!ctx||(!offline&&(!playing||ctx.state!=='running'))) return;
    const t=at??ctx.currentTime+.05, out=ctx.createGain(), dist=ctx.createBiquadFilter(), pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
    dist.type='lowpass'; dist.frequency.value=1800+Math.random()*900; out.gain.value=1;
    out.connect(dist); const dry=ctx.createGain(), wetS=ctx.createGain(); dry.gain.value=.35; wetS.gain.value=1;     // mostly reverb = far away
    if(pan){pan.pan.value=(Math.random()*2-1)*.8; dist.connect(pan); pan.connect(dry); pan.connect(wetS);} else {dist.connect(dry); dist.connect(wetS);}
    dry.connect(C.hall); wetS.connect(C.hallWet);
    const burst=(at,dur,a,type,f,q)=>{const n=noise(dur+.05), fl=ctx.createBiquadFilter(), g=ctx.createGain(); fl.type=type; fl.frequency.value=f; fl.Q.value=q||.7;
      g.gain.setValueAtTime(.0001,t+at); g.gain.linearRampToValueAtTime(a,t+at+.004); g.gain.exponentialRampToValueAtTime(.0001,t+at+dur);
      n.connect(fl); fl.connect(g); g.connect(out); n.start(t+at); n.stop(t+at+dur+.05);};
    const thud=(at,f,a,dur)=>{const o=ctx.createOscillator(), g=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(f*1.3,t+at); o.frequency.exponentialRampToValueAtTime(f,t+at+.05);
      g.gain.setValueAtTime(.0001,t+at); g.gain.linearRampToValueAtTime(a,t+at+.006); g.gain.exponentialRampToValueAtTime(.0001,t+at+dur); o.connect(g); g.connect(out); o.start(t+at); o.stop(t+at+dur+.05);};
    const kind=['door','drop','creak','rustle','steps','rustle','drop','cough','page','seat','tune','keys','sniff'][Math.floor(Math.random()*13)];
    if(kind==='door'){ burst(0,.012,.012,'bandpass',2600,2); thud(.01,58+Math.random()*12,.05,.32); burst(.01,.22,.03,'lowpass',380); burst(.09,.01,.006,'bandpass',3200,3); }
    else if(kind==='drop'){ let at=0, a=.022, gap=.16+Math.random()*.06; for(let i=0;i<5;i++){ burst(at,.03,a,'bandpass',2100+Math.random()*900,1.6); at+=gap; gap*=.62; a*=.55; } }
    else if(kind==='creak'){ const n=noise(.7), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.Q.value=14;
      const f0=280+Math.random()*120; bp.frequency.setValueAtTime(f0,t); bp.frequency.linearRampToValueAtTime(f0*1.35,t+.55);
      g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.05,t+.12); g.gain.linearRampToValueAtTime(.035,t+.4); g.gain.exponentialRampToValueAtTime(.0001,t+.62);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t+.7); }
    else if(kind==='rustle'){ const D=1.2+Math.random()*1.4, n=noise(D), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.frequency.value=1500+Math.random()*900; bp.Q.value=.6;
      g.gain.setValueAtTime(.0001,t); for(let k=0;k<7;k++) g.gain.linearRampToValueAtTime(.004+Math.random()*.009,t+D*(k+1)/8); g.gain.exponentialRampToValueAtTime(.0001,t+D);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t+D); }
    else if(kind==='cough'){ // a polite, muffled cough or two somewhere in the seats
      const n2=Math.random()<.55?2:1; for(let i=0;i<n2;i++){ const at=i*(.22+Math.random()*.06), a=(.03+Math.random()*.012)*(i?.7:1);
        burst(at,.11,a,'bandpass',520+Math.random()*160,1.3); burst(at+.005,.07,a*.5,'bandpass',1350+Math.random()*300,2); thud(at,120+Math.random()*30,a*.35,.08); } }
    else if(kind==='page'){ // someone turning a program page: a crisp little swish and flap
      const D=.32+Math.random()*.12, n=noise(D), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.Q.value=.9;
      bp.frequency.setValueAtTime(2400,t); bp.frequency.linearRampToValueAtTime(3600,t+D*.7);
      g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.014,t+D*.35); g.gain.linearRampToValueAtTime(.006,t+D*.7); g.gain.exponentialRampToValueAtTime(.0001,t+D);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t+D+.02); burst(D*.8,.03,.012,'bandpass',1800,1.4); }
    else if(kind==='seat'){ // a theater seat folding up: short squeak, then a soft padded thump
      const n=noise(.3), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.Q.value=16; const f0=520+Math.random()*140;
      bp.frequency.setValueAtTime(f0,t); bp.frequency.linearRampToValueAtTime(f0*.8,t+.22);
      g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.035,t+.05); g.gain.exponentialRampToValueAtTime(.0001,t+.25);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t+.3); thud(.24,70+Math.random()*10,.045,.22); burst(.24,.08,.012,'lowpass',500); }
    else if(kind==='tune'){ // far-off string player checking their A: a soft bowed note, a hair flat, settling into tune
      const D=1.6+Math.random()*.9, o=ctx.createOscillator(), o2=ctx.createOscillator(), lp=ctx.createBiquadFilter(), g=ctx.createGain(), vib=ctx.createOscillator(), vg=ctx.createGain();
      const f=Math.random()<.6?440:293.66; o.type='sawtooth'; o2.type='sawtooth'; o2.detune.value=7;
      o.frequency.setValueAtTime(f*.985,t); o.frequency.exponentialRampToValueAtTime(f,t+.5); o2.frequency.setValueAtTime(f*.985,t); o2.frequency.exponentialRampToValueAtTime(f,t+.5);
      vib.frequency.value=5.2; vg.gain.value=f*.003; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      lp.type='lowpass'; lp.frequency.value=1400; lp.Q.value=.7;
      g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.009,t+.35); g.gain.setValueAtTime(.009,t+D-.5); g.gain.exponentialRampToValueAtTime(.0001,t+D);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); [o,o2,vib].forEach(x=>{x.start(t); x.stop(t+D+.05);}); burst(0,.06,.004,'bandpass',2600,1.2); }
    else if(kind==='keys'){ // keys or coins jingling in a pocket as someone settles in
      const k=5+Math.floor(Math.random()*5); for(let i=0;i<k;i++){ const at=i*.045+Math.random()*.05, fr=4200+Math.random()*2600;
        const o=ctx.createOscillator(), g=ctx.createGain(); o.type='sine'; o.frequency.value=fr;
        g.gain.setValueAtTime(.0001,t+at); g.gain.linearRampToValueAtTime(.0035+Math.random()*.003,t+at+.002); g.gain.exponentialRampToValueAtTime(.0001,t+at+.09+Math.random()*.06);
        o.connect(g); g.connect(out); o.start(t+at); o.stop(t+at+.2); burst(at,.012,.005,'highpass',5000,.7); } }
    else if(kind==='sniff'){ // a quiet sniffle and a little shuffle
      burst(0,.16,.01,'bandpass',3000,1.1); burst(.2,.12,.008,'bandpass',3300,1.1);
      const D=.7, n=noise(D), bp=ctx.createBiquadFilter(), g=ctx.createGain(); bp.type='bandpass'; bp.frequency.value=1200; bp.Q.value=.6;
      g.gain.setValueAtTime(.0001,t+.45); g.gain.linearRampToValueAtTime(.006,t+.7); g.gain.exponentialRampToValueAtTime(.0001,t+.45+D);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t+.45); n.stop(t+.45+D); }
    else { const k=3+Math.floor(Math.random()*3), gap=.55+Math.random()*.15; for(let i=0;i<k;i++){ thud(i*gap,90+Math.random()*15,.018,.12); burst(i*gap,.05,.006,'bandpass',900,1); } }
  }
  function noise(sec){const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*sec),ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=ctx.createBufferSource();s.buffer=b;return s;}

  function hallLoop(){ clearTimeout(hallTimer); hallTimer=setTimeout(()=>{ try{ hallSound(); }catch(e){} if(playing) hallLoop(); }, 25000+Math.random()*45000); }
  function begin(){ if(started) return; started=true; nextT=ctx.currentTime+.3; roomTone();
    bus.gain.setValueAtTime(0,ctx.currentTime); bus.gain.linearRampToValueAtTime(1,ctx.currentTime+6); }
  /** Start (or resume) live playback. Call from a click/tap handler the first time. */
  async function start(){
    if(!init()) throw new Error('Web Audio is not available here');
    if(ctx.state==='suspended') try{ await ctx.resume(); }catch(e){}
    begin(); playing=true;
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(VOL*M.master,ctx.currentTime,.25);
    if(!timer){ schedule(); timer=setInterval(schedule,250); } hallLoop();
  }
  /** Fade out and pause (the piece carries on where it left off on the next start()). */
  function stop(){ if(!ctx||!playing) return; playing=false; clearTimeout(hallTimer);
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0,ctx.currentTime,.2);
    setTimeout(()=>{ if(!playing){ clearInterval(timer); timer=0; if(!opts.context) ctx.suspend&&ctx.suspend().catch(()=>{}); } },900); }   // MDFM patch: never suspend a context the host owns
  function apply(k){
    if(!built) return; const now=ctx.currentTime;
    if(k==='master'){ if(playing||offline){ master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(VOL*M.master,now,.08);} }
    else if(k in BASE){ C[k].gain.setTargetAtTime(BASE[k]*M[k],now,.08); if(k==='hall') C.hallWet.gain.setTargetAtTime(M.hall,now,.08); }
    else if(k==='warmth') tone.frequency.setTargetAtTime(warmHz(),now,.1);
    else if(k==='space') wet.gain.setTargetAtTime(wetAmt(),now,.1);
  }
  const api={
    start, stop, isPlaying:()=>playing,
    /** Change a mixer setting live, e.g. set('tempo', 0.8). */
    set(k,v){ if(!(k in DEFAULTS)||!isFinite(v)) return; M[k]=+v; apply(k); },
    get:k=>M[k], settings:()=>({...M}), reset(){ Object.assign(M,DEFAULTS); Object.keys(DEFAULTS).forEach(apply); },
    chord:()=>CH[chordAt].slice(),   // MDFM patch: the chord the piano is on (MIDI notes, bass first), so MDFM's style matrix can play along
    /** The AudioContext (created on first start) and the final output node, for routing into your own graph or a stream. */
    get context(){ return ctx; }, get output(){ return out; },
    // used by renderWav(): lay the whole piece out ahead of time on an OfflineAudioContext
    _scheduleAll(seconds,fade){ init(); begin(); schedule(seconds);
      for(let t=20+Math.random()*30;t<seconds-6;t+=25+Math.random()*45) hallSound(t);
      if(fade){ master.gain.setValueAtTime(VOL*M.master,Math.max(0,seconds-5)); master.gain.linearRampToValueAtTime(0,seconds); } }
  };
  if(opts.pauseWhenHidden!==false&&!offline&&typeof document!=='undefined')
    document.addEventListener('visibilitychange',()=>{ if(!ctx||!playing) return; if(document.hidden) ctx.suspend(); else ctx.resume(); });
  return api;
}

/** Render `seconds` of the piece to a WAV Blob (16-bit stereo). Big renders use a lot of memory: keep each to ~10 minutes. */
async function renderWav(seconds,settings={},{sampleRate=44100,fadeOut=true}={}){
  const OAC=(typeof window!=='undefined')&&(window.OfflineAudioContext||window.webkitOfflineAudioContext); if(!OAC) throw new Error('OfflineAudioContext not available');
  const off=new OAC(2,Math.ceil(seconds*sampleRate),sampleRate), eng=create({context:off,offline:true,settings});
  eng._scheduleAll(seconds,fadeOut);
  const buf=await off.startRendering();
  const L=buf.getChannelData(0), R=buf.getChannelData(1), n=L.length, ab=new ArrayBuffer(44+n*4), v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF'); v.setUint32(4,36+n*4,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
  v.setUint32(24,sampleRate,true); v.setUint32(28,sampleRate*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*4,true);
  for(let i=0,o=44;i<n;i++,o+=4){ const a=Math.max(-1,Math.min(1,L[i])), b=Math.max(-1,Math.min(1,R[i])); v.setInt16(o,a<0?a*0x8000:a*0x7fff,true); v.setInt16(o+2,b<0?b*0x8000:b*0x7fff,true); }
  return new Blob([ab],{type:'audio/wav'});
}

return {create, renderWav, DEFAULTS};
});
