// ─── Synthesized sound engine (WebAudio, no assets) ─────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

function env(g: GainNode, t0: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number) {
  if (muted) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(g, t0, 0.01, vol, dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Magic sparkle arpeggio — the signature "it came alive" sound. */
export function sfxMagic() {
  if (muted) return;
  const t = ac().currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  notes.forEach((f, i) => tone(f, t + i * 0.07, 0.35, "sine", 0.22));
  tone(2093, t + 0.45, 0.6, "triangle", 0.12);
}

export function sfxPop() {
  if (muted) return;
  const t = ac().currentTime;
  tone(600, t, 0.12, "sine", 0.35, 180);
}

export function sfxTap() {
  if (muted) return;
  const t = ac().currentTime;
  tone(880, t, 0.06, "triangle", 0.12);
}

export function sfxSplash() {
  if (muted) return;
  const c = ac();
  const t = c.currentTime;
  const len = 0.4;
  const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(500, t + len);
  f.Q.value = 1.2;
  const g = c.createGain();
  env(g, t, 0.01, 0.25, len);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
  tone(300, t, 0.2, "sine", 0.15, 90);
}

/** Scanning shimmer during "reading your drawing". */
export function sfxScan() {
  if (muted) return;
  const t = ac().currentTime;
  for (let i = 0; i < 10; i++) {
    tone(1200 + i * 120, t + i * 0.09, 0.08, "sine", 0.06);
  }
}

export function sfxHappy() {
  if (muted) return;
  const t = ac().currentTime;
  [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * 0.09, 0.3, "triangle", 0.2));
}

/** Gentle underwater bubble blip. */
export function sfxBubble() {
  if (muted) return;
  const t = ac().currentTime;
  tone(400 + Math.random() * 500, t, 0.15, "sine", 0.06, 900 + Math.random() * 600);
}
