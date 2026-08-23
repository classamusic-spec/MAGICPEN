// ─── Persistence (browser localStorage) ─────────────────────────────────────

import type { Creature, DreamWorld } from "./types";

const KEY = "magicpen.creatures.v1";
const SEEN_KEY = "magicpen.seenIntro.v1";

export function loadCreatures(): Creature[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Creature[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCreatures(c: Creature[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage full / private mode — play session continues in memory */
  }
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
