// ─── The sticker book ───────────────────────────────────────────────────────
// The world holds only so many creatures at once (see MAX_CREATURES) — a
// legibility limit that has always read to a child as a loss. Everything a
// child has ever drawn is remembered here instead, so the cap stops meaning
// "gone" and starts meaning "moved into the album".
//
// ── what is kept, and what is deliberately not ──
// Strokes, not pictures. A drawing is a few hundred bytes of points that can be
// re-baked at any size and replayed stroke by stroke; a baked PNG is 160KB and
// can do neither. That is the same reasoning that keeps `doodleId` an id: a hot
// array carrying base64 would crowd the storage budget and risk the whole book.
//
// An album entry can always be drawn from `doodleId` or `strokes`; if it has
// neither it is remembered as a name and a date, which is still better than
// forgetting it.

import type { Creature, Stroke } from "./types";
import { leanStrokes } from "./storage";

/**
 * How many drawings the book remembers, newest kept.
 *
 * Sized against the storage budget rather than picked round. Measured, not
 * guessed: a busily-scribbled drawing is about 12KB of stroke points once
 * coordinates are stored at the precision `leanStrokes` keeps, so a full book
 * sits near 1.8MB — comfortably clear of the ~5MB browser budget even with a
 * full world of creatures and a painted dream world alongside it.
 */
export const MAX_ALBUM = 150;

const KEY = "magicpen.album.v1";

export interface AlbumEntry {
  id: string;
  name: string;
  kindId: string;
  /** Set for stamped and word-born creatures: the body is this doodle. */
  doodleId?: string;
  /** The child's own strokes. Empty for a doodle-bodied creature. */
  strokes: Stroke[];
  createdAt: number;
}

/** Everything the child has drawn, oldest first. Never throws. */
export function loadAlbum(): AlbumEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as AlbumEntry[]).filter(
      (e) => e && typeof e.id === "string" && typeof e.name === "string" && Array.isArray(e.strokes),
    );
  } catch {
    return [];
  }
}

/** The album row for a creature — strokes kept, never an image. */
export function entryOf(c: Creature): AlbumEntry {
  const e: AlbumEntry = {
    id: c.id,
    name: c.name,
    kindId: c.kindId,
    strokes: leanStrokes(c.strokes ?? []),
    createdAt: c.createdAt,
  };
  if (c.doodleId) e.doodleId = c.doodleId;
  return e;
}

/**
 * Remember a creature.
 *
 * Called when a creature is *made*, not when it is evicted, so a drawing the
 * child released by hand is in the book too — the album is a record of what
 * they drew, not of what happens to still be swimming.
 *
 * Re-remembering the same id updates it in place (a rename should not create a
 * second sticker), and the newest survive the cap.
 */
export function remember(c: Creature): AlbumEntry[] {
  const next = loadAlbum().filter((e) => e.id !== c.id);
  next.push(entryOf(c));
  const capped = next.slice(-MAX_ALBUM);
  try {
    localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    /* Out of room. The album is a keepsake, never the source of truth — the
       creature itself is saved elsewhere, so this failing costs a sticker and
       not a drawing. */
  }
  return capped;
}

/**
 * Put creatures that predate the album into the book.
 *
 * The album records a creature when it is *made* — but creatures made before
 * the album existed (or restored from an old save) were never recorded, and a
 * book whose subtitle promises "every drawing you make lands here" must not
 * quietly omit the ones already swimming. Runs once per app start; a no-op
 * when everything is already remembered.
 */
export function backfill(creatures: Creature[]): void {
  const album = loadAlbum();
  const known = new Set(album.map((e) => e.id));
  const missing = creatures.filter((c) => !known.has(c.id));
  if (missing.length === 0) return;
  const merged = [...album, ...missing.map(entryOf)]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_ALBUM);
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* out of room — same stance as remember(): a sticker, never a drawing */
  }
}

/** Forget one sticker, when a child says goodbye from inside the book. */
export function forget(id: string): AlbumEntry[] {
  const next = loadAlbum().filter((e) => e.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

/** Is there anything worth drawing for this entry, or only a name? */
export function hasArt(e: AlbumEntry): boolean {
  return Boolean(e.doodleId) || e.strokes.length > 0;
}

/** Can this sticker be replayed stroke by stroke? Only real drawings can. */
export function canReplay(e: AlbumEntry): boolean {
  return e.strokes.length > 0;
}
