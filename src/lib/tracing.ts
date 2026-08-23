// ─── Tracing: scoring a child's attempt at a letter or number ───────────────
// Deliberately generous. A four-year-old's "A" wanders, doubles back and
// overshoots, and this app's rule is that the magic never fails — so the score
// decides how much praise to give, not whether to allow progress.
//
// Two measures, both order- and direction-independent (a child may write any
// stroke in any order, and left-handers often go the other way):
//
//   coverage — how much of the guide the child actually went over
//   tidiness — how much of the child's ink landed near the guide
//   economy  — how little ink it took
//
// All three are needed. Coverage alone passes a scribble that covers
// everything. Tidiness alone passes a single well-placed dot. Coverage plus
// tidiness *still* passes a dense scribble inside the letter's box, because
// with enough ink every guide point has something near it — economy is what
// separates "traced the shape" from "filled the box".

import type { Pt, Stroke } from "./types";
import { densify, glyphPoints, GLYPH_BOX, type Glyph } from "./glyphs";

export interface TraceScore {
  /** 0..1 — fraction of the guide the child covered. */
  coverage: number;
  /** 0..1 — fraction of the child's ink that landed on the guide. */
  tidiness: number;
  /** 0..1 — 1 when the trace is about as long as the guide, falling as it
   *  overshoots. This is what stops a scribble scoring full marks. */
  economy: number;
  /** 0..1 overall, weighted toward coverage (effort matters more than neatness). */
  score: number;
  /** 3 = great, 2 = good, 1 = had a go. Never 0 if they drew anything. */
  stars: 1 | 2 | 3;
  /** True when the child essentially did not attempt the shape. */
  empty: boolean;
}

/**
 * Squared distance from `q` to the nearest point in `cloud`.
 * Linear scan: clouds here are a few hundred points, and this runs once per
 * attempt rather than per frame.
 */
function nearestSq(q: Pt, cloud: Pt[]): number {
  let best = Infinity;
  for (const c of cloud) {
    const dx = c.x - q.x;
    const dy = c.y - q.y;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Map the child's strokes from canvas pixels into the glyph's 100×140 space,
 * using the box the guide was drawn in so the two are directly comparable.
 */
export function toGlyphSpace(strokes: Stroke[], box: { x: number; y: number; w: number; h: number }): Pt[] {
  const kx = GLYPH_BOX.w / box.w;
  const ky = GLYPH_BOX.h / box.h;
  const pts: Pt[] = [];
  for (const s of strokes) {
    // densify in canvas space first, so a fast swipe is not a sparse line
    for (const q of densify(s.pts, Math.max(2, box.w / 50))) {
      pts.push({ x: (q.x - box.x) * kx, y: (q.y - box.y) * ky });
    }
  }
  return pts;
}

/** How close counts as "on the guide", in glyph units. Generous on purpose. */
const HIT = 13;
/** Ink may run this many times the guide's length before economy suffers —
 *  children retrace and double back, and that should not be punished. */
const SLACK = 2.2;

/** Total length of a point path, in glyph units. */
function pathLength(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

export function scoreTrace(glyph: Glyph, inkPts: Pt[]): TraceScore {
  const guide = glyphPoints(glyph, 3);
  if (inkPts.length < 4 || guide.length === 0) {
    return { coverage: 0, tidiness: 0, economy: 0, score: 0, stars: 1, empty: true };
  }

  const hitSq = HIT * HIT;

  // coverage: guide points that the child passed near
  let covered = 0;
  for (const g of guide) if (nearestSq(g, inkPts) <= hitSq) covered++;
  const coverage = covered / guide.length;

  // tidiness: child's points that landed near the guide
  let onGuide = 0;
  for (const q of inkPts) if (nearestSq(q, guide) <= hitSq) onGuide++;
  const tidiness = onGuide / inkPts.length;

  // economy: how much ink it took relative to the shape itself
  const guideLen = pathLength(guide) || 1;
  const inkLen = pathLength(inkPts);
  const economy = Math.max(0, Math.min(1, (guideLen * SLACK) / Math.max(inkLen, 1)));

  // Effort is weighted above neatness: a child who traced the whole letter
  // messily has done the thing we are teaching; a neat dot has not.
  const score = coverage * 0.5 + tidiness * 0.25 + economy * 0.25;

  // Calibrated against synthetic attempts: a faithful trace scores 0.9–1.0,
  // half a letter ~0.8, a random scribble ~0.63 and a single dot ~0.57. The
  // thresholds sit in that gap so effort is rewarded and filling the box is
  // not — but one star is still praise, never a failure.
  const stars: 1 | 2 | 3 = score >= 0.8 ? 3 : score >= 0.68 ? 2 : 1;
  return { coverage, tidiness, economy, score, stars, empty: false };
}

/** Encouraging, age-appropriate feedback. Never says "wrong". */
export function tracePraise(s: TraceScore, target: string): string {
  if (s.empty) return `Trace the ${target} with your finger!`;
  if (s.stars === 3) return `Perfect ${target}!`;
  if (s.stars === 2) return `Nice ${target}!`;
  return `You wrote ${target}!`;
}
