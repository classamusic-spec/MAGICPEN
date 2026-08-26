// ─── Painting a doodle onto a canvas ────────────────────────────────────────
// The doodles are authored as SVG path data on a 24×24 grid because that is
// how they are drawn on screen. A creature born in Word World needs the same
// artwork as pixels — for its world sprite, and as a PNG for the AI to redraw.
//
// Path2D takes SVG path data directly, so there is no serialise-to-blob dance:
// the same `d` strings paint natively on a canvas.

import { DOODLES, hasDoodle } from "@/lib/doodles";

export { hasDoodle };

/** The grid the doodles are authored on. */
const GRID = 24;
/** Some doodles (sun rays, snake tongue) reach just past the grid. */
const BLEED = 0.09;

/**
 * Paint one doodle centred in a `size`×`size` box, origin at the box's
 * top-left. Returns false if there is no doodle by that name.
 */
export function paintDoodle(ctx: CanvasRenderingContext2D, name: string, size: number): boolean {
  const parts = DOODLES[name];
  if (!parts) return false;
  const k = (size * (1 - BLEED * 2)) / GRID;
  ctx.save();
  ctx.translate(size * BLEED, size * BLEED);
  ctx.scale(k, k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of parts) {
    const path = new Path2D(p.d);
    if (p.fill) {
      ctx.fillStyle = p.fill;
      ctx.fill(path);
    }
    ctx.strokeStyle = p.c ?? "#2d2926";
    ctx.lineWidth = p.w ?? 2.1;
    ctx.stroke(path);
  }
  ctx.restore();
  return true;
}

/** A doodle on its own transparent canvas. */
export function doodleCanvas(name: string, size = 256): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx || !paintDoodle(ctx, name, size)) return null;
  return cv;
}
