// ─── Recorded creature sounds ────────────────────────────────────────────────
// Every creature says hello when it is tapped. A small pre-rendered sound clip
// per kind — a real meow, moo, quack, whoosh — made once (see public/sounds and
// scripts/sounds) and shipped with the app, so it plays with no per-tap network
// call and works fully offline once loaded.
//
// Nothing is ever silent: if a clip has not loaded yet (a first tap before the
// world's sounds have been fetched, or a decode that failed), the caller falls
// back to the synthesized voice in `creatureVoice`, which needs no assets and
// is always instant. The recorded clip takes over from the next tap on.
//
// Clips play through the app's own audio bus (see `audioBus`), so the single
// mute switch silences them and they wake on the same first tap the sound
// effects do. Each is loudness-normalized on decode, because a generated set
// varies wildly clip to clip and a child must not get a whisper then a shout.

import { audioBus, isMuted } from "./audio";

interface Manifest { clips: Record<string, string>; }

let manifest: Manifest | null = null;
let loading: Promise<void> | null = null;

/** A decoded, ready-to-play clip and the gain that evens its loudness out. */
interface Ready { buffer: AudioBuffer; gain: number; }
const ready = new Map<string, Ready>();
const inflight = new Map<string, Promise<void>>();

/** Perceived-loudness target and the clamps around it, chosen so a quiet clip
 *  is lifted and a hot one tamed without either being amplified into noise or
 *  pushed into clipping. */
const TARGET_RMS = 0.08;
const GAIN_MIN = 0.6;
const GAIN_MAX = 8;
const PEAK_CEIL = 0.95;

/** Load the manifest once. Cheap; a failure leaves it null and the app on its
 *  synthesized voices. */
export function loadSoundManifest(): Promise<void> {
  if (loading) return loading;
  loading = fetch("/sounds/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => { manifest = m && m.clips ? m : null; })
    .catch(() => { manifest = null; });
  return loading;
}

function decode(kind: string): Promise<void> {
  if (ready.has(kind)) return Promise.resolve();
  const running = inflight.get(kind);
  if (running) return running;
  const file = manifest?.clips[kind];
  const bus = audioBus();
  if (!file || !bus) return Promise.resolve();
  const job = fetch(`/sounds/clips/${file}`)
    .then((r) => { if (!r.ok) throw new Error("fetch"); return r.arrayBuffer(); })
    .then((ab) => bus.ctx.decodeAudioData(ab))
    .then((buffer) => {
      // measure this clip, then pick a gain that lands it near the target
      const d = buffer.getChannelData(0);
      let sq = 0, peak = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; }
      const rms = Math.sqrt(sq / Math.max(1, d.length)) || TARGET_RMS;
      let gain = Math.min(GAIN_MAX, Math.max(GAIN_MIN, TARGET_RMS / rms));
      if (peak * gain > PEAK_CEIL) gain = PEAK_CEIL / Math.max(0.001, peak);
      ready.set(kind, { buffer, gain });
    })
    .catch(() => { /* leave it unready; the synth voice covers the tap */ })
    .finally(() => { inflight.delete(kind); });
  inflight.set(kind, job);
  return job;
}

/** Warm the clips for a set of creature kinds — call on entering a world, so a
 *  tap plays the recorded sound rather than the fallback. Loads the manifest
 *  first if needed. */
export function prefetchSounds(kinds: Iterable<string>): void {
  if (isMuted()) return;
  loadSoundManifest().then(() => { for (const k of new Set(kinds)) decode(k); });
}

/**
 * Play the recorded hello for a creature kind.
 *
 * Returns true if a clip was ready and playback began — the caller then does
 * NOT also play the synthesized voice. Returns false if the clip is not loaded
 * (or muted, or no audio); the caller plays the synth instead, and this kicks
 * off loading the clip so the next tap is the real thing.
 */
export function playCreatureSound(kindId: string): boolean {
  if (isMuted()) return false;
  const bus = audioBus();
  if (!bus) return false;
  const r = ready.get(kindId);
  if (!r) { void decode(kindId); return false; }   // not yet — synth covers it
  const src = bus.ctx.createBufferSource();
  src.buffer = r.buffer;
  const g = bus.ctx.createGain();
  g.gain.value = r.gain;
  src.connect(g).connect(bus.out);
  try { src.start(); } catch { return false; }
  return true;
}
