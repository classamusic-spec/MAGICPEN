// ─── The recorded voice ──────────────────────────────────────────────────────
// The app's spoken lines — every letter name, "A is for Apple", the counting,
// the shape names, the creature facts — are pre-rendered once at build time in
// a single warm voice and shipped as small audio clips (see public/voice, and
// the generator that made them). This module plays the right clip for a line of
// text, and reports whether it could, so `speech.ts` can fall back to the
// browser's own synthesizer for anything not pre-rendered.
//
// Why pre-render at all, when the browser can already speak?
//   • One warm, consistent voice on every device, instead of the platform
//     lottery — a gentle voice on one phone, a robotic one on the next.
//   • It says the curriculum the way a person would, because a person's voice
//     was recorded saying it. "forty two", not "forty minus two".
//   • Nothing a child does is ever sent anywhere: the clips are static files,
//     generated ahead of time. No microphone, no per-tap network call.
//
// The clips play through the app's own audio bus (see `audioBus`), so the one
// mute switch silences them, they wake on the same first tap as the sound
// effects, and — like everything else — the newest utterance cancels the last.

import { audioBus } from "./audio";

interface Manifest {
  clips: Record<string, string>;
}

let manifest: Manifest | null = null;
let loading: Promise<void> | null = null;

/** Normalise a line to its clip key. MUST match the generator's `normalize`. */
export const clipKey = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Load the clip manifest once. Cheap (a few kilobytes of JSON) and idempotent;
 * a failure just leaves the manifest null and the app on its browser voice.
 */
export function loadVoiceManifest(): Promise<void> {
  if (loading) return loading;
  loading = fetch("/voice/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => { manifest = m && m.clips ? m : null; })
    .catch(() => { manifest = null; });
  return loading;
}

/** Is there a recorded clip for this exact line? Sync, so `speak` can decide
 *  in one step whether to use the voice or fall back. */
export function hasClip(text: string): boolean {
  return !!manifest && clipKey(text) in manifest.clips;
}

/** Has the recorded voice loaded and got clips? Lets a screen show its "hear it
 *  again" control even on a browser whose own synthesizer is missing. */
export function voiceReady(): boolean {
  return !!manifest && Object.keys(manifest.clips).length > 0;
}

/* Decoded clips are held for the session so a line said twice is instant the
   second time. The browser's HTTP cache holds the files themselves across
   sessions — they are static and immutable. */
const bufCache = new Map<string, AudioBuffer>();

/* Newest-wins, across both this engine and the browser's. Every call to `speak`
   bumps the token; a clip whose fetch finishes after a newer line was asked for
   is dropped rather than played late. */
let token = 0;
let current: AudioBufferSourceNode | null = null;

/** Stop whatever clip is playing now. */
export function stopVoice(): void {
  if (current) {
    try { current.stop(); } catch { /* already ended */ }
    current = null;
  }
}

/** Bump the token so any in-flight clip is superseded — used when the browser
 *  voice takes over instead. */
export function supersedeVoice(): void {
  token++;
  stopVoice();
}

/**
 * Play the recorded clip for `text`, if there is one.
 *
 * Returns true when a clip exists and playback has begun or been queued (the
 * caller must then NOT also speak it with the browser). Returns false when
 * there is no clip, or no audio bus at all — the caller speaks it instead.
 *
 * `onMiss` is the browser-voice fallback, called only if the clip existed but
 * could not be fetched or decoded (offline, before it was ever cached) — and
 * only if nothing newer has been asked for since, so it never doubles up.
 */
export function playClip(text: string, onMiss?: () => void): boolean {
  if (!manifest) return false;
  const key = clipKey(text);
  const file = manifest.clips[key];
  if (!file) return false;
  const bus = audioBus();
  if (!bus) return false;

  const mine = ++token;
  const { ctx, out } = bus;

  const start = (buf: AudioBuffer) => {
    if (mine !== token) return;              // a newer line won
    stopVoice();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.onended = () => { if (current === src) current = null; };
    current = src;
    try { src.start(); } catch { /* context not ready */ }
  };

  const cached = bufCache.get(key);
  if (cached) { start(cached); return true; }

  fetch(`/voice/clips/${file}`)
    .then((r) => { if (!r.ok) throw new Error("fetch"); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { bufCache.set(key, buf); start(buf); })
    .catch(() => { if (mine === token) onMiss?.(); }); // couldn't get it → browser voice
  return true;
}
