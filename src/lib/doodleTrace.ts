// ─── Turning a doodle into something a child can trace ──────────────────────
// Letter World teaches writing by putting a faint letter under the child's
// finger and letting them go over it. The same idea is the answer to a much
// bigger problem: a four-year-old who wants a fish in their reef but cannot
// draw a fish.
//
// The important decision here is that a traced drawing is still *the child's
// drawing*. A stamp would be faster and would look better, and it would quietly
// break the only promise the app makes — that everything alive in these worlds
// came out of their own hand. So the guide is a ghost: it shows the way, the
// child's strokes are what get baked into a creature, and the guide is gone by
// the time anything hatches.
//
// The app already owns 69 doodles as SVG path data on a 24-unit grid
// (`lib/doodles`). This module turns any of them into the same `Glyph` shape
// the letter tracer already scores — a list of polylines — so the whole of
// `lib/tracing` works on a rocket exactly as it works on an R.

import type { Pt } from "./types";
import type { Glyph } from "./glyphs";
import { doodleParts, hasDoodle } from "./doodles";

/** The space a doodle guide is normalized into, matching the letter box's
 *  order of magnitude so `tracing`'s hit radius means the same thing here. */
export const DOODLE_BOX = { w: 100, h: 100 };

/** The grid the doodle path data is authored on. */
const SRC = 24;

/**
 * Parts shorter than this (in source units) are detail, not shape: the dot of
 * an eye, a nostril, a single whisker. Asking a child to trace a 0.05-unit dot
 * is asking them to fail, so the guide leaves them out — and the drawn doodle
 * shown beside the tracing still has them, so the child can see where they go.
 *
 * Tuned by rendering all sixty-nine guides and looking at them. At 5 the sun
 * lost every one of its rays and became a circle labelled "sun", which is worse
 * than useless to a child learning what a sun looks like. At 1.6 the rays and
 * the smiles survive and the dot-eyes — two hundredths of a unit — still do not.
 */
const MIN_PART = 1.6;

/**
 * How far apart the sampled points are, in source units. Fine enough that a
 * curve reads as a curve, coarse enough that a whole doodle stays a few hundred
 * points — which is what keeps `scoreTrace`'s nearest-point scan cheap.
 */
const STEP = 0.35;

const cache = new Map<string, Glyph>();

/** A detached SVG we can ask about path geometry. Made once, on first use. */
let probe: SVGPathElement | null = null;
function pathProbe(): SVGPathElement | null {
  if (probe) return probe;
  if (typeof document === "undefined") return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.opacity = "0";
  svg.style.pointerEvents = "none";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.appendChild(path);
  document.body.appendChild(svg);
  probe = path;
  return probe;
}

/**
 * Split one path `d` at its `M` commands and sample each piece.
 *
 * A single `d` often holds several disconnected marks — the five petals of the
 * flower are one string — and sampling it whole would draw a guide line through
 * the gaps between them, inviting the child to trace a shape that is not there.
 */
function samplePart(d: string): Pt[][] {
  const path = pathProbe();
  if (!path) return [];
  const out: Pt[][] = [];
  // keep the M with the piece that follows it
  for (const piece of d.split(/(?=[Mm])/)) {
    const sub = piece.trim();
    if (!sub) continue;
    path.setAttribute("d", sub);
    let len = 0;
    try { len = path.getTotalLength(); } catch { continue; }
    if (!isFinite(len) || len < MIN_PART) continue;
    const n = Math.max(2, Math.ceil(len / STEP));
    const line: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const q = path.getPointAtLength((i / n) * len);
      line.push({ x: q.x, y: q.y });
    }
    out.push(line);
  }
  return out;
}

/**
 * The traceable skeleton of a doodle, as polylines in `DOODLE_BOX`.
 *
 * Returns an empty guide when the doodle is unknown or when there is no DOM to
 * measure paths with — callers should treat that as "no lesson for this one"
 * rather than as an error, so a missing doodle can never strand a child on a
 * screen with nothing to trace.
 */
export function doodleGuide(name: string): Glyph {
  const hit = cache.get(name);
  if (hit) return hit;
  if (!hasDoodle(name)) return [];

  const k = DOODLE_BOX.w / SRC;
  const lines: Pt[][] = [];
  for (const part of doodleParts(name)) {
    for (const line of samplePart(part.d)) {
      lines.push(line.map((q) => ({ x: q.x * k, y: q.y * (DOODLE_BOX.h / SRC) })));
    }
  }
  // Biggest shape first: the body before the fin before the tail. Children are
  // shown the guide one line at a time, and starting with the largest is both
  // how a person actually draws and the order that makes the picture readable
  // soonest.
  lines.sort((a, b) => span(b) - span(a));
  cache.set(name, lines);
  return lines;
}

/** Rough size of a polyline: the diagonal of its bounding box. */
function span(line: Pt[]): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of line) {
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  return Math.hypot(x1 - x0, y1 - y0);
}

/** True when this doodle has enough shape in it to be worth a lesson. */
export function traceable(name: string): boolean {
  return doodleGuide(name).length > 0;
}
