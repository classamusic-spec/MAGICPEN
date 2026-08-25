// ─── Three ways to make a mark ──────────────────────────────────────────────
// A crayon, a watercolour brush and a paintbrush. They are not three colours of
// the same line: each one behaves the way its real material behaves, because
// that difference is the whole point of being offered a choice.
//
//   crayon      wax dragged over paper. Opaque, grainy, and *broken* — the
//               tooth of the paper shows through. Lives in `crayon.ts`.
//   watercolour transparent. It stains rather than covers, so crossing your own
//               line makes it darker, and pigment creeps to the edge of the wet
//               patch and dries in a rim. That rim is the tell.
//   paint       opaque and thick. It sits *on* the paper instead of in it,
//               combed into grooves by the bristles, and it hides whatever it
//               is laid over.
//
// The one rule they share: the mark is the child's. None of these smooths,
// straightens, or prettifies the line it was given.

import type { Pt, Stroke } from "./types";
import { drawCrayonStroke, mulberry, tracePath } from "./crayon";

/** Which material a stroke was made with. Absent means crayon — every drawing
 *  made before there was a choice was made with one. */
export type Medium = "crayon" | "water" | "paint";

/**
 * Darken or lighten a colour without caring what notation it arrived in.
 *
 * The crayon box is hex, but strokes are re-coloured elsewhere and can arrive
 * as `rgb()`/`rgba()`. Those are passed through untouched rather than mangled
 * into `NaN` — a stroke that came out the wrong colour would be a far worse
 * bug than one that is not quite dark enough.
 */
function tone(color: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** The visible part of a stroke at `progress`, and its own random hand. */
function head(pts: Pt[], seed: number, progress: number) {
  const rand = mulberry(seed * 7919 + 13);
  const count = Math.max(2, Math.floor(pts.length * Math.min(1, progress)));
  return { rand, sub: pts.slice(0, count) };
}

/** A single tap, in whatever the material is. */
function dab(ctx: CanvasRenderingContext2D, p: Pt, color: string, size: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ── watercolour ──────────────────────────────────────────────────────────── */

/**
 * A wet, transparent wash.
 *
 * Built in the order water actually does it: the wash creeps into damp paper,
 * pigment drifts to the edge of the wet patch and dries darkest there, and the
 * middle stays lighter. The whole thing is laid at well under full alpha, so
 * crossing a line you already made *darkens* it — which is the behaviour a
 * child discovers in about four seconds and then does on purpose.
 *
 * No canvas blur filter anywhere: this is redrawn every frame by the replay,
 * and `filter` is far too expensive to put on that path. The softness is
 * several offset passes instead, the way the crayon's fur is.
 */
export function drawWaterStroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  size: number,
  seed = 1,
  progress = 1,
) {
  if (pts.length === 0) return;
  if (pts.length === 1) { dab(ctx, pts[0], color, size, 0.4); return; }
  const { rand, sub } = head(pts, seed, progress);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;

  // ── the wash creeping outward into damp paper ──
  // Wide and very faint, nudged off true, so the edge is soft without ever
  // being blurred. Three of them read as water finding its own way.
  for (let g = 0; g < 3; g++) {
    ctx.save();
    ctx.translate((rand() - 0.5) * size * 0.75, (rand() - 0.5) * size * 0.75);
    ctx.globalAlpha = 0.05 + rand() * 0.035;
    ctx.lineWidth = size * (1.55 - g * 0.2);
    tracePath(ctx, sub);
    ctx.stroke();
    ctx.restore();
  }

  // ── the rim ──
  // The one thing that says watercolour before any amount of colour does: as
  // the water dries it pulls pigment to the edge of the patch, which ends up
  // *darker than the middle*. Laid full width first…
  ctx.strokeStyle = tone(color, -0.34);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = size;
  tracePath(ctx, sub);
  ctx.stroke();

  // …then the body inside it, which leaves the darker rim showing at the edges
  // rather than painting a separate outline around the stroke.
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.33;
  ctx.lineWidth = size * 0.72;
  tracePath(ctx, sub);
  ctx.stroke();

  // ── pooling ──
  // Where the brush slowed or turned, water gathers and dries into a bloom.
  const pools = Math.max(1, Math.floor(sub.length / 16));
  ctx.fillStyle = tone(color, -0.22);
  for (let i = 0; i < pools; i++) {
    const p = sub[Math.floor(rand() * sub.length)];
    ctx.globalAlpha = 0.1 + rand() * 0.1;
    ctx.beginPath();
    ctx.ellipse(
      p.x + (rand() - 0.5) * size * 0.5,
      p.y + (rand() - 0.5) * size * 0.5,
      size * (0.3 + rand() * 0.4),
      size * (0.24 + rand() * 0.34),
      rand() * Math.PI, 0, Math.PI * 2,
    );
    ctx.fill();
  }

  // ── granulation ──
  // Heavier pigment settles into the hollows of the paper. Sparse and small:
  // this is a texture you notice without looking for it.
  const grains = Math.floor(sub.length / 5);
  for (let i = 0; i < grains; i++) {
    const p = sub[Math.floor(rand() * sub.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.14;
    ctx.beginPath();
    ctx.arc(
      p.x + (rand() - 0.5) * size * 0.8,
      p.y + (rand() - 0.5) * size * 0.8,
      size * (0.03 + rand() * 0.07), 0, Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ── paint ────────────────────────────────────────────────────────────────── */

/**
 * Thick, opaque poster paint.
 *
 * The opposite of the watercolour in every way that matters: it covers instead
 * of stains, so crossing your own line hides it rather than darkening it, and
 * it has no paper tooth at all — the paint fills the grain rather than skipping
 * it. What it has instead is bristles: a loaded brush combs the paint into
 * grooves, and that is what makes it read as paint rather than as a fat crayon.
 */
export function drawPaintStroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  size: number,
  seed = 1,
  progress = 1,
) {
  if (pts.length === 0) return;
  if (pts.length === 1) { dab(ctx, pts[0], color, size * 1.05, 1); return; }
  const { rand, sub } = head(pts, seed, progress);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ── the body ──
  // Flat and fully opaque. Paint is not subtle and should not pretend to be.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  tracePath(ctx, sub);
  ctx.stroke();

  // ── the bristles ──
  // Narrow passes nudged off true, alternately lighter and darker than the
  // paint, so the stroke is combed rather than printed. Offsetting the whole
  // path rather than computing a normal per point is both cheaper and truer:
  // a real brush wanders as a whole, it does not shear.
  const hairs = 5;
  for (let i = 0; i < hairs; i++) {
    const off = ((i + 0.5) / hairs - 0.5) * size * 0.72;
    ctx.save();
    ctx.translate(off * (0.6 + rand() * 0.8), off * (0.6 + rand() * 0.8));
    ctx.strokeStyle = tone(color, rand() < 0.5 ? 0.24 : -0.24);
    ctx.globalAlpha = 0.16 + rand() * 0.16;
    ctx.lineWidth = size * (0.06 + rand() * 0.1);
    tracePath(ctx, sub);
    ctx.stroke();
    ctx.restore();
  }

  // ── thickness ──
  // A light edge along one side and a dark one along the other. It is a cheap
  // lie about a light source, and it is what makes the paint sit *on* the paper
  // instead of soaking into it.
  ctx.save();
  ctx.translate(-size * 0.11, -size * 0.13);
  ctx.strokeStyle = tone(color, 0.38);
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = size * 0.2;
  tracePath(ctx, sub);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(size * 0.12, size * 0.14);
  ctx.strokeStyle = tone(color, -0.4);
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = size * 0.18;
  tracePath(ctx, sub);
  ctx.stroke();
  ctx.restore();

  // ── where the brush landed ──
  // A loaded brush puts down more paint on first contact than anywhere after.
  dab(ctx, sub[0], tone(color, -0.1), size * 1.16, 0.7);
  ctx.globalAlpha = 1;
}

/* ── the one way anything draws a stroke ──────────────────────────────────── */

/**
 * Draw a stroke in whatever it was made with.
 *
 * Everything that paints a child's drawing goes through here — the drawing
 * board, the world's baked sprites, the replay, the print sheet, the tracing
 * sheets — so a new material is added in one place and appears everywhere at
 * once, and a drawing can never come back in the wrong medium.
 *
 * `progress` draws only the first part of the stroke, which is what lets the
 * sticker book play a drawing back as it was drawn.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  seed = 1,
  progress = 1,
) {
  if (s.medium === "water") drawWaterStroke(ctx, s.pts, s.color, s.size, seed, progress);
  else if (s.medium === "paint") drawPaintStroke(ctx, s.pts, s.color, s.size, seed, progress);
  else drawCrayonStroke(ctx, s.pts, s.color, s.size, seed, progress);
}

/** Is this material see-through? The sticker ring baked around a creature has
 *  to know: a translucent body needs its outline taken from a hard silhouette,
 *  or the ring stamps a murky halo instead of a clean edge. */
export const isWet = (m: Medium | undefined): boolean => m === "water";
