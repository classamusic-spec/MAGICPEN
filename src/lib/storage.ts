// ─── Persistence (browser localStorage) ─────────────────────────────────────

import type { Creature, DreamWorld, Stroke } from "./types";

/* ── what a point costs on disk ───────────────────────────────────────────────
   A pointer event hands us a float like 127.80000305175781: eighteen characters
   of JSON carrying about fifteen digits of precision, when the finest thing the
   app can draw is a pixel. A tenth of a CSS pixel is already far below the
   crayon engine's own hand-wobble, so rounding there is invisible — and it
   halves what every drawing costs.

   That matters because it is measured, not theoretical: sixteen hand-drawn
   creatures plus a full sticker book came to 78% of the browser's ~5MB budget,
   and a child who draws a lot has nowhere to go from there. Quantising happens
   at the moment of *writing* only, so the live drawing a child is making stays
   exactly as smooth as their finger. */
const q1 = (n: number) => Math.round(n * 10) / 10;

/** The same strokes, at the precision they are stored in. Never mutates. */
export function leanStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: q1(p.x), y: q1(p.y) })) }));
}

const KEY = "magicpen.creatures.v1";
const SEEN_KEY = "magicpen.seenIntro.v1";

export function loadCreatures(): Creature[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Creature[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

/** What a save managed. True is the ordinary case. */
export interface SaveResult {
  /** The creatures themselves — names, positions, care. */
  creatures: boolean;
}

/**
 * Write the sketchbook.
 *
 * A creature is a few small scalars plus its strokes, so the whole array stays
 * well inside the storage budget. The result is returned rather than swallowed:
 * a silent failure is the worst of both worlds — the child keeps playing,
 * everything looks saved, and it is gone tomorrow.
 */
export function saveCreatures(c: Creature[]): SaveResult {
  const out: SaveResult = { creatures: false };
  try {
    localStorage.setItem(KEY, JSON.stringify(c.map((x) => ({ ...x, strokes: leanStrokes(x.strokes ?? []) }))));
    out.creatures = true;
  } catch {
    /* storage full / private mode — play session continues in memory */
  }
  return out;
}

/* ── the pet ──────────────────────────────────────────────────────────────────
   Which creature the child has crowned as theirs. Deliberately a *pointer in
   its own key* rather than a flag on the creature: the sketchbook array is
   round-tripped whole with no migration step, and — more to the point — the
   thirty-creature cap evicts oldest-first, which is very often the pet. A
   pointer can dangle harmlessly (an id nobody answers to simply means "no pet
   today"); a flag on an evicted creature would take the pet with it.

   `since` is kept for warmth, not mechanics: nothing counts down from it and
   nothing is ever withheld because of it. */
const PET_KEY = "magicpen.pet.v1";

export interface PetRef {
  /** The creature's id. May legitimately point at nothing. */
  id: string;
  /** When it was made the pet, ms. Shown warmly; never used to pressure. */
  since: number;
}

export function loadPet(): PetRef | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PET_KEY) ?? "null") as unknown;
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<PetRef>;
    return typeof p.id === "string" && p.id
      ? { id: p.id, since: typeof p.since === "number" ? p.since : Date.now() }
      : null;
  } catch {
    return null;
  }
}

export function savePet(id: string): PetRef {
  const ref: PetRef = { id, since: Date.now() };
  try {
    localStorage.setItem(PET_KEY, JSON.stringify(ref));
  } catch {
    /* out of room: the choice is lost, the creature is not */
  }
  return ref;
}

export function clearPet(): void {
  try {
    localStorage.removeItem(PET_KEY);
  } catch {
    /* noop */
  }
}

/* ── food the child drew ──────────────────────────────────────────────────────
   Strokes, not baked images — the same reasoning that keeps `doodleId` an id
   rather than a PNG. A handful of strokes is a few hundred bytes and can be
   re-baked at any size; a baked canvas would be a ~160 KB blob that could crowd
   the ~5 MB browser budget and take the child's creatures down with it.

   Capped, oldest out. A crumb on the water is still never persisted — this is
   the *recipe*, not the crumb. */
const FOODS_KEY = "magicpen.foods.v1";

/** How many hand-drawn foods are kept. Small on purpose: a tray, not a pantry. */
export const MAX_DRAWN_FOODS = 6;

export interface DrawnFood {
  id: string;
  strokes: Stroke[];
  createdAt: number;
}

export function loadFoods(): DrawnFood[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOODS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as DrawnFood[]).filter(
      (f) => f && typeof f.id === "string" && Array.isArray(f.strokes),
    );
  } catch {
    return [];
  }
}

/** Add one drawn food, keeping the newest `MAX_DRAWN_FOODS`. */
export function saveFood(strokes: Stroke[]): DrawnFood[] {
  const next = [...loadFoods(), { id: uuid(), strokes: leanStrokes(strokes), createdAt: Date.now() }]
    .slice(-MAX_DRAWN_FOODS);
  try {
    localStorage.setItem(FOODS_KEY, JSON.stringify(next));
  } catch {
    /* noop — the food simply is not remembered for tomorrow */
  }
  return next;
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
  try {
    localStorage.setItem(DREAM_KEY, JSON.stringify({ ...d, strokes: leanStrokes(d.strokes) }));
  } catch { /* full / private mode */ }
}

export function hasDream(): boolean {
  return loadDream() !== null;
}
