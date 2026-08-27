// ─── The voice of a creature ─────────────────────────────────────────────────
// Every creature says hello when it is tapped. Not a recorded sound and not a
// stock effect — each one is synthesized on the spot from oscillators and a
// little filtered noise, so it costs no download, works with no internet, and
// can never be a harsh or scary clip a generator slipped in. Playful blips in
// the same hand-made spirit as the crayon they were drawn with.
//
// A cow moos, a cat meows, a rocket whooshes, a star twinkles. Object creatures
// get a sound that suits them rather than a literal one — a balloon squeaks, a
// heart beats, a crown plays a tiny fanfare — because a page of crayon is a
// place where a house can be as alive as a puppy.
//
// It all plays through the app's own audio bus (see `audioBus`), so the single
// mute switch silences it, it wakes on the same first tap the sound effects do,
// and it mixes at the same gentle level. Where WebAudio is missing it is simply
// silent — a creature that cannot chirp is no worse off than one on a muted
// tablet.

import { audioBus, isMuted } from "./audio";

type Bus = { ctx: AudioContext; out: AudioNode };

/* One short reusable burst of white noise — for chirps' breath, an engine's
   grit, a rocket's whoosh. Built once, lazily, and read through a filter. */
let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = ctx.sampleRate * 1.2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

/* A tone with an attack-release envelope and an optional pitch glide. The
   envelope uses exponential ramps (never to a true zero, which the API
   forbids), so every sound fades rather than clicks off. */
interface ToneOpts {
  t0: number; f0: number; f1?: number; dur: number; peak?: number;
  type?: OscillatorType; attack?: number; vibHz?: number; vibCents?: number;
}
function blip(bus: Bus, o: ToneOpts): void {
  const { ctx, out } = bus;
  const { t0, f0, f1 = f0, dur, peak = 0.18, type = "sine", attack = 0.008, vibHz = 0, vibCents = 0 } = o;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  // a wobble in the pitch, for a bleating sheep or a warbling UFO
  if (vibHz && vibCents) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = vibHz;
    lg.gain.value = (f0 * vibCents) / 1200; // cents → Hz swing
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.06);
}

/* A burst of filtered noise — breath, wind, grit, a rumble. */
interface NoiseOpts {
  t0: number; dur: number; peak?: number;
  type?: BiquadFilterType; cut0: number; cut1?: number; q?: number;
}
function hush(bus: Bus, o: NoiseOpts): void {
  const { ctx, out } = bus;
  const { t0, dur, peak = 0.14, type = "bandpass", cut0, cut1 = cut0, q = 1 } = o;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(cut0, t0);
  if (cut1 !== cut0) f.frequency.exponentialRampToValueAtTime(Math.max(20, cut1), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

/* Each hello is nudged a few percent off true, so tapping the same creature
   twice is alive rather than a recording. */
const wobble = () => 1 + (Math.random() - 0.5) * 0.06;

/* ── the archetypes ──────────────────────────────────────────────────────────
   A voice is (archetype, base pitch). Same-family creatures share an archetype
   and differ by pitch, so a whole reef of fish is a family, not one clone. */
type Voice = (bus: Bus, t: number, base: number) => void;

const ARCH: Record<string, Voice> = {
  // a bright little rising set of blips
  chirp: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 1.5, dur: 0.09, peak: 0.16, type: "triangle" }); blip(b, { t0: t + 0.1, f0: k * 1.4, f1: k * 2, dur: 0.1, peak: 0.16, type: "triangle" }); },
  meow:  (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 0.8, f1: k * 1.25, dur: 0.16, peak: 0.2, type: "sawtooth", attack: 0.04 }); blip(b, { t0: t + 0.14, f0: k * 1.25, f1: k * 0.7, dur: 0.22, peak: 0.18, type: "sawtooth" }); },
  woof:  (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.4, f1: k * 0.7, dur: 0.14, peak: 0.24, type: "sawtooth" }); hush(b, { t0: t, dur: 0.12, peak: 0.08, cut0: k * 2, cut1: k, q: 0.7 }); },
  moo:   (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.1, f1: k * 0.85, dur: 0.5, peak: 0.2, type: "sawtooth", attack: 0.05 }); },
  oink:  (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 0.8, dur: 0.1, peak: 0.16, type: "square" }); blip(b, { t0: t + 0.12, f0: k * 1.05, f1: k * 0.8, dur: 0.12, peak: 0.16, type: "square" }); },
  quack: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 0.85, dur: 0.14, peak: 0.2, type: "sawtooth" }); hush(b, { t0: t, dur: 0.12, peak: 0.05, cut0: k * 3, q: 3 }); },
  baa:   (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.05, f1: k * 0.9, dur: 0.4, peak: 0.18, type: "sawtooth", vibHz: 22, vibCents: 60 }); },
  neigh: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.5, f1: k * 0.8, dur: 0.35, peak: 0.18, type: "sawtooth", vibHz: 30, vibCents: 40 }); },
  buzz:  (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 1.05, dur: 0.35, peak: 0.12, type: "sawtooth", vibHz: 45, vibCents: 30 }); },
  hum:   (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 1.06, dur: 0.7, peak: 0.16, type: "sine", attack: 0.08, vibHz: 5, vibCents: 25 }); },
  bubble:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 0.7, f1: k * 1.6, dur: 0.12, peak: 0.16, type: "sine" }); blip(b, { t0: t + 0.1, f0: k * 1.2, f1: k * 2.2, dur: 0.1, peak: 0.12, type: "sine" }); },
  click: (b, t, f) => { const k = f * wobble(); hush(b, { t0: t, dur: 0.05, peak: 0.5, cut0: k, q: 3 }); hush(b, { t0: t + 0.09, dur: 0.05, peak: 0.5, cut0: k * 1.1, q: 3 }); },
  boing: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.6, f1: k * 0.6, dur: 0.18, peak: 0.2, type: "sine" }); blip(b, { t0: t + 0.12, f0: k * 0.7, f1: k * 1.3, dur: 0.16, peak: 0.12, type: "sine" }); },
  whoosh:(b, t, f) => { hush(b, { t0: t, dur: 0.5, peak: 0.5, type: "lowpass", cut0: f * 0.6, cut1: f * 4, q: 1.2 }); },
  warble:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 1.1, dur: 0.5, peak: 0.14, type: "sine", vibHz: 12, vibCents: 250 }); },
  engine:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 0.9, f1: k * 1.15, dur: 0.4, peak: 0.13, type: "sawtooth", attack: 0.06, vibHz: 18, vibCents: 40 }); hush(b, { t0: t, dur: 0.4, peak: 0.05, type: "lowpass", cut0: k * 4, q: 0.8 }); },
  twinkle:(b, t, f) => { const k = f * wobble(); [0, 1.5, 2.5, 4].forEach((m, i) => blip(b, { t0: t + i * 0.07, f0: k * (1 + m * 0.5), dur: 0.16, peak: 0.1, type: "sine" })); },
  chime: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, dur: 0.4, peak: 0.16, type: "sine", attack: 0.005 }); blip(b, { t0: t, f0: k * 2.01, dur: 0.35, peak: 0.06, type: "sine" }); },
  roar:  (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.15, f1: k * 0.8, dur: 0.45, peak: 0.2, type: "sawtooth", attack: 0.05, vibHz: 14, vibCents: 40 }); hush(b, { t0: t, dur: 0.45, peak: 0.07, type: "lowpass", cut0: k * 5, cut1: k * 2, q: 1 }); },
  screech:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 2.2, f1: k, dur: 0.28, peak: 0.14, type: "sawtooth", vibHz: 40, vibCents: 50 }); },
  rumble:(b, t, f) => { hush(b, { t0: t, dur: 0.7, peak: 0.6, type: "lowpass", cut0: f, cut1: f * 1.8, q: 2 }); },
  heartbeat:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 0.7, dur: 0.14, peak: 0.22, type: "sine" }); blip(b, { t0: t + 0.26, f0: k * 0.95, f1: k * 0.65, dur: 0.18, peak: 0.18, type: "sine" }); },
  pop:   (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 0.8, f1: k * 1.8, dur: 0.08, peak: 0.2, type: "sine" }); hush(b, { t0: t, dur: 0.05, peak: 0.06, cut0: k * 4, q: 2 }); },
  hiss:  (b, t, f) => { hush(b, { t0: t, dur: 0.4, peak: 0.5, type: "bandpass", cut0: f * 1.4, cut1: f, q: 1.2 }); },
  ribbit:(b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k, f1: k * 1.3, dur: 0.1, peak: 0.18, type: "square" }); blip(b, { t0: t + 0.13, f0: k * 0.9, f1: k * 1.2, dur: 0.12, peak: 0.18, type: "square" }); },
  cluck: (b, t, f) => { const k = f * wobble(); blip(b, { t0: t, f0: k * 1.3, f1: k * 0.8, dur: 0.06, peak: 0.18, type: "square" }); blip(b, { t0: t + 0.08, f0: k, f1: k * 1.4, dur: 0.07, peak: 0.16, type: "square" }); },
  fanfare:(b, t, f) => { const k = f * wobble(); [1, 1.26, 1.5].forEach((m, i) => blip(b, { t0: t + i * 0.09, f0: k * m, dur: 0.2, peak: 0.14, type: "triangle" })); },
  sway:  (b, t, f) => { hush(b, { t0: t, dur: 0.6, peak: 0.45, type: "bandpass", cut0: f, cut1: f * 1.5, q: 0.6 }); },
};

/* Which voice each creature has, and at what pitch. Pitch is in hertz — the
   centre the archetype builds around. Same family, spread across pitches. */
const VOICE: Record<string, [keyof typeof ARCH | string, number]> = {
  // land animals
  cat: ["meow", 620], dog: ["woof", 280], cow: ["moo", 150], pig: ["oink", 300],
  duck: ["quack", 340], sheep: ["baa", 380], horse: ["neigh", 300], zebra: ["neigh", 340],
  frog: ["ribbit", 200], bee: ["buzz", 210], bird: ["chirp", 1500], chicken: ["cluck", 700],
  snake: ["hiss", 1600],
  // the sea
  fish: ["bubble", 480], seahorse: ["bubble", 620], octopus: ["bubble", 360],
  jellyfish: ["bubble", 300], crab: ["click", 900], turtle: ["moo", 200],
  shark: ["woof", 150], whale: ["hum", 90], starfish: ["twinkle", 700],
  // the sky and space
  star: ["twinkle", 900], sun: ["twinkle", 640], moon: ["chime", 520], rainbow: ["twinkle", 560],
  rocket: ["whoosh", 500], comet: ["whoosh", 700], ufo: ["warble", 480], alien: ["warble", 620],
  astronaut: ["warble", 360], satellite: ["warble", 800], planet: ["hum", 130],
  mercury: ["hum", 200], venus: ["hum", 165], mars: ["hum", 145],
  // dinosaurs
  trex: ["roar", 130], triceratops: ["roar", 150], stegosaurus: ["roar", 170],
  longneck: ["roar", 110], pterodactyl: ["screech", 700], egg: ["boing", 500],
  volcano: ["rumble", 90],
  // things
  car: ["engine", 130], bus: ["engine", 100], tractor: ["engine", 110],
  balloon: ["pop", 500], ball: ["boing", 400], yoyo: ["boing", 520], hat: ["pop", 620],
  heart: ["heartbeat", 200], crown: ["fanfare", 520], gift: ["chime", 640], cake: ["chime", 720],
  apple: ["pop", 560], orange: ["pop", 460], kite: ["whoosh", 620], leaf: ["sway", 900],
  butterfly: ["sway", 1100], palmtree: ["sway", 700], flower: ["chime", 840], tree: ["chime", 300],
  house: ["chime", 380], barn: ["chime", 340], nest: ["chirp", 1100],
  // the mystery blob — a curious wobble
  mystery: ["boing", 460],
};

/** Play the hello a creature of this kind makes when it is tapped. Silent when
 *  muted, when WebAudio is unavailable, or for an unknown kind. */
/** Schedule a creature's hello into any audio bus at time `t0`. Exposed so a
 *  test can render it into an OfflineAudioContext and measure it; the app uses
 *  `playCreatureVoice`. */
export function renderCreatureVoice(bus: Bus, kindId: string, t0: number): void {
  const v = VOICE[kindId] ?? VOICE.mystery;
  const arch = ARCH[v[0] as string];
  if (arch) arch(bus, t0, v[1]);
}

export function playCreatureVoice(kindId: string): void {
  if (isMuted()) return;           // do not even wake the audio context
  const bus = audioBus();          // null when WebAudio is missing
  if (!bus) return;
  renderCreatureVoice(bus, kindId, bus.ctx.currentTime + 0.001);
}

/** Every creature kind that has a wired-up voice — the test asserts this
 *  covers the roster, so a new kind cannot ship mute. */
export const VOICED_KINDS: readonly string[] = Object.freeze(Object.keys(VOICE));
