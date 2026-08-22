// ─── Persistence (browser localStorage) ─────────────────────────────────────

import type { Creature } from "./types";

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
