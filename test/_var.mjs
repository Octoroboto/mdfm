import { chromium } from 'playwright';
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto('file:///home/claude/mdfm/dist/radio.html'); await p.waitForTimeout(300);
const r=await p.evaluate(async()=>{ const out=[]; const R=MDFM.createMDFM({letItRide:false});
  for(const st of MDFM.STYLES){ const buf=await R.renderOffline('song',20,st); const d=buf.getChannelData(0); let pk=0,e=0,nan=0; for(const x of d){ if(!isFinite(x)) nan++; pk=Math.max(pk,Math.abs(x)); e+=x*x; } out.push(`${st}: peak ${pk.toFixed(2)} rms ${Math.sqrt(e/d.length).toFixed(3)}${nan?' NaN '+nan:''}`); }
  return out; });
console.log(r.join('\n'));
// live: run through several songs quickly with skip, check now-playing styles and no errors
await p.click('label.sndsw'); const seen=[]; await p.evaluate(()=>{ window.__np=[]; __radio.on('nowplaying',s=>__np.push(s.style)); __radio.setSpots(false); });
for(let k=0;k<6;k++){ await p.waitForTimeout(2500); await p.evaluate(()=>__radio.skip()); }
await p.waitForTimeout(6000); console.log('styles in a row:', JSON.stringify(await p.evaluate(()=>__np)), 'errs', errs); await b.close();
