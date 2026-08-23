// ─── Dream world regions ────────────────────────────────────────────────────
// A blank world can't know that a blue squiggle is a river. So the child tells
// it: they wipe a fat brush over the page and say "this bit is water", "this is
// sky", "this is the ground". That mask is what makes a painted world behave
// like a place — fish swim in the water, birds keep to the sky, a cow stands on
// the grass instead of hovering in the air.
//
// The mask is a coarse grid rather than vector shapes: a four-year-old paints
// in broad swipes, the queries are all "what is at this point", and a grid this
// small encodes to a short string that costs nothing in localStorage.

import type { DreamWorld, RegionKind } from "./types";

/** Grid resolution. Coarse on purpose — cells are big soft areas, not pixels. */
export const REGION_W = 24;
export const REGION_H = 32;

/** One character per cell. "." is unpainted. */
const CH: Record<RegionKind, string> = { sky: "s", water: "w", ground: "g" };
const KIND: Record<string, RegionKind> = { s: "sky", w: "water", g: "ground" };

export const REGION_KINDS: RegionKind[] = ["sky", "water", "ground"];

/** How each region reads on the easel and in the world. */
export const REGION_STYLE: Record<RegionKind, { label: string; hint: string; color: string }> = {
  sky:    { label: "Sky",    hint: "birds and balloons go here", color: "#6595f9" },
  water:  { label: "Water",  hint: "fish swim here",             color: "#00c2b9" },
  ground: { label: "Ground", hint: "everyone stands here",       color: "#84cc16" },
};

/* ── the mask ─────────────────────────────────────────────────────────────── */

export type RegionMask = Uint8Array; // 0 = none, 1 = sky, 2 = water, 3 = ground

const CODE: Record<RegionKind, number> = { sky: 1, water: 2, ground: 3 };
const FROM_CODE: (RegionKind | null)[] = [null, "sky", "water", "ground"];

export const newMask = (): RegionMask => new Uint8Array(REGION_W * REGION_H);

export function encodeMask(m: RegionMask): string {
  let out = "";
  for (let i = 0; i < m.length; i++) {
    const k = FROM_CODE[m[i]];
    out += k ? CH[k] : ".";
  }
  return out;
}

export function decodeMask(s: string | undefined): RegionMask | null {
  if (!s || s.length !== REGION_W * REGION_H) return null;
  const m = newMask();
  let any = false;
  for (let i = 0; i < s.length; i++) {
    const k = KIND[s[i]];
    if (k) { m[i] = CODE[k]; any = true; }
  }
  return any ? m : null;
}

/** Paint a soft round dab of `kind` at normalized (nx, ny) with radius `nr`. */
export function paintMask(m: RegionMask, kind: RegionKind | null, nx: number, ny: number, nr: number) {
  const cx = nx * REGION_W;
  const cy = ny * REGION_H;
  // radius is given in fractions of the *width*; scale to cells on each axis
  const rx = Math.max(1, nr * REGION_W);
  const ry = Math.max(1, nr * REGION_W * (REGION_H / REGION_W) * 0.62);
  const code = kind ? CODE[kind] : 0;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(REGION_W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(REGION_H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) m[y * REGION_W + x] = code;
    }
  }
}

/** The region at normalized (nx, ny), or null where the child painted nothing. */
export function regionAt(m: RegionMask, nx: number, ny: number): RegionKind | null {
  const x = Math.max(0, Math.min(REGION_W - 1, Math.floor(nx * REGION_W)));
  const y = Math.max(0, Math.min(REGION_H - 1, Math.floor(ny * REGION_H)));
  return FROM_CODE[m[y * REGION_W + x]];
}

export function hasRegion(m: RegionMask, kind: RegionKind): boolean {
  const code = CODE[kind];
  for (let i = 0; i < m.length; i++) if (m[i] === code) return true;
  return false;
}

/**
 * The top of the ground directly below normalized x — what a walking creature
 * stands on. Returns null when no ground is painted in that column.
 */
export function groundTopAt(m: RegionMask, nx: number): number | null {
  const x = Math.max(0, Math.min(REGION_W - 1, Math.floor(nx * REGION_W)));
  for (let y = 0; y < REGION_H; y++) {
    if (m[y * REGION_W + x] === CODE.ground) return y / REGION_H;
  }
  return null;
}

/**
 * A place for a creature of this region to live. Deterministic given `seed`, so
 * a creature keeps its spot instead of teleporting on every re-render. Returns
 * null when the child painted no such region.
 */
export function findSpawn(m: RegionMask, kind: RegionKind, seed: number): { x: number; y: number } | null {
  const code = CODE[kind];
  const cells: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i] === code) cells.push(i);
  if (!cells.length) return null;
  const i = cells[Math.abs(Math.floor(seed)) % cells.length];
  return { x: ((i % REGION_W) + 0.5) / REGION_W, y: (Math.floor(i / REGION_W) + 0.5) / REGION_H };
}

/** The vertical span of a region, as normalized [top, bottom], or null. */
export function regionBand(m: RegionMask, kind: RegionKind): [number, number] | null {
  const code = CODE[kind];
  let top = Infinity, bot = -Infinity;
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== code) continue;
    const y = Math.floor(i / REGION_W);
    top = Math.min(top, y);
    bot = Math.max(bot, y);
  }
  return top === Infinity ? null : [top / REGION_H, (bot + 1) / REGION_H];
}

/** Convenience: the mask for a dream world, or null when it has none. */
export const maskOf = (d: DreamWorld | null | undefined): RegionMask | null =>
  d ? decodeMask(d.regions) : null;

/**
 * Which region a behaviour wants to live in. Anything not listed is a ground
 * dweller, which is the safe default: standing on the floor always looks right.
 */
export function regionForBehavior(b: string): RegionKind {
  if (b === "swim" || b === "jet") return "water";
  if (b === "fly" || b === "float" || b === "twinkle" || b === "orbit" || b === "hover" || b === "streak") return "sky";
  return "ground";
}
