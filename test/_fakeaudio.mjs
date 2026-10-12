// A strict stand-in for the Web Audio API, for node tests of the engine's scheduling and math.
// AudioParams throw the way browsers do on NaN/Infinity, negative times and exponential ramps to or through 0.
const fin = (x, what) => { if (typeof x !== "number" || !Number.isFinite(x)) throw new TypeError(`${what}: non-finite ${x}`); };
const tm = (t, what) => { fin(t, what); if (t < 0) throw new RangeError(`${what}: negative time ${t}`); };
export class FakeParam {
  constructor(v = 0) { this._v = v; }
  get value() { return this._v; }
  set value(v) { fin(v, "param.value"); this._v = v; }
  setValueAtTime(v, t) { fin(v, "setValueAtTime"); tm(t, "setValueAtTime"); this._v = v; return this; }
  linearRampToValueAtTime(v, t) { fin(v, "linearRamp"); tm(t, "linearRamp"); this._v = v; return this; }
  exponentialRampToValueAtTime(v, t) { fin(v, "expRamp"); tm(t, "expRamp"); if (v === 0) throw new RangeError("expRamp to 0"); this._v = v; return this; }
  setTargetAtTime(v, t, k) { fin(v, "setTarget"); tm(t, "setTarget"); fin(k, "setTarget k"); if (k < 0) throw new RangeError("setTarget k<0"); this._v = v; return this; }
  cancelScheduledValues(t) { tm(t, "cancel"); return this; }
}
let live = 0;
class Node {
  constructor(ctx, params = {}) { this.context = ctx; this.outs = new Set(); ctx.nodes++; live++; for (const k in params) this[k] = new FakeParam(params[k]); }
  connect(d) { if (!d) throw new TypeError("connect: no destination"); if (d.context && d.context !== this.context) throw new Error("connect: different context"); if (d instanceof FakeParam || d instanceof Node) this.outs.add(d); return d instanceof FakeParam ? undefined : d; }
  disconnect() { this.outs.clear(); this.context.disconnects++; }
}
class Src extends Node {
  start(t = 0, off = 0) { if (this._started) throw new Error("start twice"); tm(t, "start"); fin(off, "start offset"); this._started = true; this.startT = t; this.off = off; }
  stop(t = 0) { if (!this._started) throw new Error("stop before start"); tm(t, "stop"); this.stopT = t; }
}
export class FakeAudioContext {
  constructor({ sampleRate = 48000 } = {}) { this.sampleRate = sampleRate; this.currentTime = 0; this.state = "running"; this.nodes = 0; this.disconnects = 0; this.sources = []; this.destination = new Node(this); }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
  createGain() { return new Node(this, { gain: 1 }); }
  createOscillator() { const o = new Src(this, { frequency: 440, detune: 0 }); o.type = "sine"; return o; }
  createBufferSource() { const s = new Src(this, { playbackRate: 1 }); s.buffer = null; s.loop = false; this.sources.push(s); return s; }
  createBiquadFilter() { const b = new Node(this, { frequency: 350, Q: 1, gain: 0 }); b.type = "lowpass"; return b; }
  createStereoPanner() { return new Node(this, { pan: 0 }); }
  createDelay() { return new Node(this, { delayTime: 0 }); }
  createWaveShaper() { const n = new Node(this); n.curve = null; n.oversample = "none"; return n; }
  createConvolver() { const n = new Node(this); n.buffer = null; return n; }
  createChannelSplitter() { return new Node(this); }
  createChannelMerger() { return new Node(this); }
  createDynamicsCompressor() { return new Node(this, { threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 }); }
  createAnalyser() { const a = new Node(this); a.fftSize = 2048; a.smoothingTimeConstant = .8; a.minDecibels = -100; a.maxDecibels = -30;
    Object.defineProperty(a, "frequencyBinCount", { get() { return a.fftSize / 2; } });
    a.getByteFrequencyData = arr => { for (let i = 0; i < arr.length; i++) arr[i] = 128; }; a.getFloatTimeDomainData = arr => { for (let i = 0; i < arr.length; i++) arr[i] = .1; }; return a; }
  createBuffer(ch, len, sr) { fin(len, "createBuffer len"); const data = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => data[i] }; }
  decodeAudioData() { return Promise.reject(new Error("no decode in tests")); }
}
export class FakeOfflineAudioContext extends FakeAudioContext {
  constructor(ch, len, sr) { super({ sampleRate: sr }); this.len = len; }
  startRendering() { return new Promise(r => setTimeout(() => r(this.createBuffer(2, this.len, this.sampleRate)), 2000)); }   // resolves later, like a real render
}
export function installGlobals({ hidden = false } = {}) {
  globalThis.window = globalThis.window || {};   // no speechSynthesis: the engine times voice lines with setTimeout
  globalThis.document = { hidden };
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
}
