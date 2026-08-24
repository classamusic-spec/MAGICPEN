// ─── Persistence (browser localStorage) ─────────────────────────────────────

import type { Creature, DreamWorld } from "./types";

const KEY = "magicpen.creatures.v1";
const SEEN_KEY = "magicpen.seenIntro.v1";
/* ── why photos live in their own key ─────────────────────────────────────────
   A paper-photo creature carries `photoData`: a transparent PNG data URL, about
   160 KB of base64. Thirty of those is roughly 4.7 MB, and a browser's whole
   localStorage budget is about 5. So the array that gets rewritten on *every*
   change — a rename, a released friend, a creature growing a little — was
   carrying nearly the entire quota with it, and the write that finally failed
   would have taken the whole sketchbook with it.

   Splitting them out means the hot array is a few kilobytes of small scalars.
   A photo that will not fit now loses that one photo; it can no longer lose the
   child's creatures. */
const PHOTO_KEY = "magicpen.photos.v1";

type PhotoMap = Record<string, string>;

function loadPhotos(): PhotoMap {
  try {
    const raw = JSON.parse(localStorage.getItem(PHOTO_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as PhotoMap) : {};
  } catch {
    return {};
  }
}

export function loadCreatures(): Creature[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Creature[];
    if (!Array.isArray(arr)) return [];
    /* Photos are put back on the way in, so nothing downstream of here has to
       know they were ever stored apart. A sketchbook written before the split
       still has them inline; that reads fine, and the next save moves them. */
    const photos = loadPhotos();
    return arr.map((c) => (c.photoData || !photos[c.id] ? c : { ...c, photoData: photos[c.id] }));
  } catch {
    return [];
  }
}

/** What a save managed. Both true is the ordinary case. */
export interface SaveResult {
  /** The creatures themselves — names, positions, care. The important one. */
  creatures: boolean;
  /** Their paper photos. False means one or more photos did not fit; the
   *  creatures are still saved and will come back drawn in crayon. */
  photos: boolean;
}

/**
 * Write the sketchbook.
 *
 * Photos are peeled off into their own key and pruned to the creatures that
 * still exist — a released friend used to leave its 160 KB behind forever.
 *
 * The result is returned rather than swallowed. This used to fail silently,
 * which is the worst of both worlds: the child keeps playing, everything looks
 * saved, and it is gone tomorrow.
 */
export function saveCreatures(c: Creature[]): SaveResult {
  const photos: PhotoMap = {};
  let any = false;
  const lean = c.map((x) => {
    if (!x.photoData) return x;
    photos[x.id] = x.photoData;
    any = true;
    const lean: Creature = { ...x };
    delete lean.photoData;
    return lean;
  });

  const out: SaveResult = { creatures: false, photos: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(lean));
    out.creatures = true;
  } catch {
    /* storage full / private mode — play session continues in memory */
  }

  try {
    if (any) localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
    else localStorage.removeItem(PHOTO_KEY);
  } catch {
    out.photos = false;
    /* One last try without the photos at all. A child would far rather their
       creature came back in crayon than not come back. */
    try { localStorage.removeItem(PHOTO_KEY); } catch { /* noop */ }
  }
  return out;
}

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
export function markSeenIntro() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch { /* noop */ }
}

export function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ── mini-game best scores (per world) ── */
const BEST_KEY = "magicpen.best.v1";

export function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveBest(worldId: string, score: number): boolean {
  const best = loadBest();
  if (score <= (best[worldId] ?? 0)) return false;
  best[worldId] = score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* noop */ }
  return true; // new record!
}

/* ── writing progress (Letter / Math / Word world) ───────────────────────────
   One flat map of lesson key → best stars, e.g. "letter:A" → 3. Flat because
   the pickers only ever ask "how did this one go", and a flat map survives new
   lesson types without a migration. */

const WRITE_KEY = "magicpen.writing.v1";

export type WritingProgress = Record<string, number>;

export function loadWriting(): WritingProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(WRITE_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as WritingProgress) : {};
  } catch {
    return {};
  }
}

/** Record an attempt. Only ever raises a score — a bad day never takes a star
 *  away from a child. Returns the map so callers can re-render from it. */
export function saveWriting(key: string, stars: number): WritingProgress {
  const all = loadWriting();
  if (stars > (all[key] ?? 0)) {
    all[key] = stars;
    try { localStorage.setItem(WRITE_KEY, JSON.stringify(all)); } catch { /* noop */ }
  }
  return all;
}

/**
 * Which lesson to steer a child to next, given the stars they have earned.
 *
 * This is the whole point of recording those stars: a lesson score that nobody
 * ever reads is not progress, it is bookkeeping. The rule is gentle and never
 * scolds — it points at the first thing not yet tried, and once everything has
 * been tried it quietly brings back the shakiest one (the lowest score under
 * three stars) for another, no-pressure go. When every lesson is a confident
 * three stars, it returns null: there is nothing left to nudge, and that is a
 * win, not an empty screen to fill.
 *
 * `keys` is the ordered list of lesson keys as the picker shows them, so "next"
 * follows the teaching order a child already sees.
 */
export function nextLessonKey(keys: string[], progress: WritingProgress): string | null {
  let weakest: string | null = null;
  let weakestStars = 3;
  for (const k of keys) {
    const stars = progress[k] ?? 0;
    if (stars === 0) return k;                       // never tried — start here
    if (stars < weakestStars) { weakestStars = stars; weakest = k; }
  }
  return weakest;                                     // the shakiest, or null if all are 3
}

/* ── Dream World (the child's own painted world) ─────────────────────────────── */

const DREAM_KEY = "magicpen.dreamworld.v1";

export function loadDream(): DreamWorld | null {
  try {
    const raw = localStorage.getItem(DREAM_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DreamWorld;
    return d && Array.isArray(d.strokes) && d.strokes.length ? d : null;
  } catch {
    return null;
  }
}

export function saveDream(d: DreamWorld) {
  try { localStorage.setItem(DREAM_KEY, JSON.stringify(d)); } catch { /* full / private mode */ }
}

export function hasDream(): boolean {
  return loadDream() !== null;
}
