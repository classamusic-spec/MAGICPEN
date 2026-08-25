// ─── The app's voice ─────────────────────────────────────────────────────────
// Magic Pen is for children who cannot read yet, and until now it said nothing
// out loud. "A is for Apple" was text on a card — invisible to the very child
// it was written for. This module gives the app a voice: it names the letter a
// child is about to trace, counts the number, blends the word, and reads the
// drawing hint aloud.
//
// The app speaks in two voices, and prefers the first:
//
//   1. A warm, pre-recorded voice, one clip per line, shipped with the app and
//      the same on every device (see lib/voice and public/voice). This is what
//      a child normally hears.
//   2. The browser's own speech synthesizer — the fallback for anything not
//      pre-recorded (a name a child typed), for the moments before the clip
//      manifest has loaded, and for old or locked-down browsers. It ships
//      nothing and reads in whatever voice the device has.
//
// Callers never choose between them: they call `sayLetter`, `sayLine` and the
// rest, and this module plays the clip if there is one and speaks it otherwise.
//
// Two rules hold whichever voice speaks:
//   It follows the same mute switch as every other sound (see lib/audio). A
//   grown-up who silences the app silences all of it, on a bus or at bedtime.
//
//   It never queues. A child tapping ahead should hear the thing in front of
//   them now, not a backlog of everything they tapped past — so each new
//   utterance cancels the last, in both voices at once.

import { isMuted } from "./audio";
import { hasClip, playClip, supersedeVoice, stopVoice, loadVoiceManifest, voiceReady } from "./voice";

/** Whether this browser can speak at all. Old and locked-down ones cannot. */
export const canSpeak = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Whether the app can make *any* sound for a spoken line — a recorded clip or
 *  the browser's own voice. Screens gate their "say it again" controls on this
 *  rather than on `canSpeak` alone, so the recorded voice still surfaces on a
 *  browser that has no synthesizer of its own. */
export const canNarrate = (): boolean => voiceReady() || canSpeak();

/* ── choosing a voice ────────────────────────────────────────────────────────
   Voices load asynchronously on most browsers — `getVoices()` is empty on the
   first call and fills in later, announced by a `voiceschanged` event. We keep
   the best English voice we have found so far and upgrade it when more arrive,
   so the first word might use the platform default and the second the nicer
   voice. That is invisible to a four-year-old and saves blocking speech on a
   load that sometimes never fires. */

let chosen: SpeechSynthesisVoice | null = null;
let wired = false;

/** Higher is better. We want a real, local, English — ideally warm — voice. */
function rank(v: SpeechSynthesisVoice): number {
  const lang = (v.lang || "").toLowerCase();
  const name = (v.name || "").toLowerCase();
  let s = 0;
  if (lang.startsWith("en")) s += 100;
  else if (lang) s += 10;                       // a non-English voice still reads digits
  if (lang === "en-us" || lang === "en-gb") s += 20;
  if (v.localService) s += 30;                  // offline, and lower latency
  // voices that tend to be gentler / clearer for children
  if (/(samantha|karen|moira|tessa|fiona|serena|female|kids?|child)/.test(name)) s += 15;
  if (/(google|natural|premium|enhanced)/.test(name)) s += 8;
  if (v.default) s += 4;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return chosen;            // not loaded yet; keep what we have
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const r = rank(v);
    if (r > bestScore) { bestScore = r; best = v; }
  }
  return best;
}

/** Load voices now and keep watching for better ones. Cheap and idempotent.
 *  Also kicks off loading the recorded-clip manifest, so the very first spoken
 *  line already has the warm voice rather than the browser one. */
export function primeVoices(): void {
  void loadVoiceManifest();
  if (!canSpeak() || wired) return;
  wired = true;
  chosen = pickVoice();
  window.speechSynthesis.addEventListener("voiceschanged", () => { chosen = pickVoice(); });
}

/* ── speaking ────────────────────────────────────────────────────────────── */

export interface SpeakOpts {
  /** 0.1–2, lower is slower. Children need it slower than adult default. */
  rate?: number;
  /** 0–2, higher is brighter. A touch up reads as friendly, not shrill. */
  pitch?: number;
}

/** Speak with the browser's own synthesizer. The fallback path. */
function browserSpeak(text: string, opts: SpeakOpts): void {
  if (!canSpeak()) return;
  if (!wired) primeVoices();
  const synth = window.speechSynthesis;
  try {
    synth.cancel();                             // no backlog: the newest wins
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.92;
    u.pitch = opts.pitch ?? 1.08;
    u.volume = 1;
    const v = chosen ?? pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    synth.speak(u);
  } catch {
    /* some browsers throw from a background tab; a silent letter is fine */
  }
}

/**
 * Say something out loud, cancelling whatever was being said. Silent when the
 * app is muted — callers never have to check.
 *
 * Prefers the recorded clip and falls back to the browser voice: for a line
 * with a clip, the clip plays (and if it cannot be fetched — offline, first
 * time — the browser voice speaks it instead); for a line with no clip, the
 * browser voice speaks it directly.
 */
export function speak(text: string, opts: SpeakOpts = {}): void {
  if (!text || isMuted()) return;
  // newest wins across BOTH voices: stop any clip and cancel any utterance
  // before starting the next, whichever engine each is on.
  stopVoice();
  if (canSpeak()) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }

  if (hasClip(text)) {
    // the clip supersedes the browser voice; on a fetch miss it hands back
    playClip(text, () => browserSpeak(text, opts));
    return;
  }
  browserSpeak(text, opts);
}

/** Stop talking now — e.g. when leaving a screen. Silences both voices. */
export function hush(): void {
  supersedeVoice();
  if (canSpeak()) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }
}

/* ── what to say for the things a child traces ───────────────────────────────
   The three writing worlds want three different readings of a single "target",
   and the tracing screen does not know which world it is in — so it hands us
   the target and lets the caller pick the reading. */

/**
 * Say a single letter as its *name* — "A" as "ay", not the word "a". A lone
 * character is spoken more clearly, and a hair slower, than running text: it is
 * the one sound the child is here to learn.
 */
export function sayLetter(ch: string): void {
  const c = ch.trim();
  if (!c) return;
  // Uppercase so a bare "a" is read as the letter name rather than the word.
  speak(c.length === 1 ? c.toUpperCase() : c, { rate: 0.8, pitch: 1.1 });
}

/** Say a number the way you would count it: "three", not "3". */
export function sayNumber(word: string): void {
  speak(word, { rate: 0.85, pitch: 1.05 });
}

/** Blend a word slowly, the way you would sound it out to a child. */
export function sayWord(word: string): void {
  speak(word, { rate: 0.75, pitch: 1.05 });
}

/** Read a whole line — a hint, a bit of praise, "A is for Apple". */
export function sayLine(text: string): void {
  speak(text, { rate: 0.9, pitch: 1.06 });
}
