// ─── Crayon stroke renderer ─────────────────────────────────────────────────
// Renders kid strokes with a waxy crayon texture + organic wiggle deformation
// so drawings feel hand-made and alive.

import type { Pt, Stroke } from "./types";

/** Deterministic pseudo-random from a seed (stable speckle per stroke). */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function strokeLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/** Resample a polyline to evenly spaced points for stable deformation. */
export function resample(pts: Pt[], step = 4): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let prev = pts[i - 1];
    const cur = pts[i];
    let seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      const nx = prev.x + (cur.x - prev.x) * t;
      const ny = prev.y + (cur.y - prev.y) * t;
      out.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      carry = 0;
    }
    carry += seg;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface WiggleOpts {
  time: number;        // seconds
  amp: number;         // max perpendicular displacement (px)
  freq: number;        // spatial frequency along path
  speed: number;       // temporal speed
  /** 0..1 where along the path amplitude peaks (0=head,1=tail). default 1 */
  tailBias?: number;
  seed?: number;
}

/** Apply sinusoidal wiggle perpendicular to the path direction. */
export function wigglePoints(pts: Pt[], o: WiggleOpts): Pt[] {
  if (o.amp <= 0 || pts.length < 3) return pts;
  const n = pts.length;
  const out = new Array<Pt>(n);
  const tb = o.tailBias ?? 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(i + 1, n - 1)];
    const r = pts[Math.max(i - 1, 0)];
    const dx = q.x - r.x;
    const dy = q.y - r.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const t = i / (n - 1); // 0..1 along path
    // amplitude envelope: ramps up from anchor point toward tailBias end
    const env = tb >= 0.5 ? Math.pow(t, 1.4) : Math.pow(1 - t, 1.4);
    const ph = o.time * o.speed + t * o.freq * Math.PI * 2 + (o.seed ?? 0);
    const off = Math.sin(ph) * o.amp * (0.25 + 0.75 * env);
    out[i] = { x: p.x + nx * off, y: p.y + ny * off };
  }
  return out;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
}

/**
 * Draw one stroke with crayon texture: a solid core, jittered ghost passes,
 * and waxy speckles along the path.
 */
/** A darker shade of a #rrggbb wax, for the grain that shows where a crayon
 *  pressed harder. Left untouched if the colour isn't a plain hex — grain is a
 *  nicety, never worth risking a wrong colour over. Drawn in normal
 *  source-over (never `multiply`): sprites are baked on a transparent canvas,
 *  where multiply would bleed black into the wax's edge. */
function waxGrain(color: string, k = 0.72): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export function drawCrayonStroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  size: number,
  seed = 1,
  progress = 1 // 0..1 for draw-on animation
) {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const rand = mulberry(seed * 7919 + 13);
  const count = Math.max(2, Math.floor(pts.length * Math.min(1, progress)));
  const sub = pts.slice(0, count);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ── the body of the wax ────────────────────────────────────────────────
  // Three soft passes, each nudged a little off true and a little different in
  // width, so the edge is furry rather than printed — a crayon never lays down
  // the same line twice.
  ctx.strokeStyle = color;
  for (let g = 0; g < 3; g++) {
    const jx = (rand() - 0.5) * size * 0.5;
    const jy = (rand() - 0.5) * size * 0.5;
    ctx.save();
    ctx.translate(jx, jy);
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = size * (0.86 + rand() * 0.5);
    tracePath(ctx, sub);
    ctx.stroke();
    ctx.restore();
  }

  // core pass — the darkest, most solid lay of wax
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = size * 0.7;
  tracePath(ctx, sub);
  ctx.stroke();

  // ── paper tooth ────────────────────────────────────────────────────────
  // The one thing that says "crayon" more than any amount of colour: wax skips
  // the low spots of the paper's grain, so real coverage is *broken*. Drawn as
  // a dashed pass in the wax colour — the gaps are the tooth showing through —
  // laid at a slight offset and a hair thinner than the core, so it grazes the
  // surface the way a crayon dragged at an angle does. A crayon also presses
  // unevenly, so the segments vary in how present they are.
  const grain = waxGrain(color);
  ctx.save();
  ctx.strokeStyle = grain;
  const dash = size * (0.5 + rand() * 0.4);
  const gap = size * (0.34 + rand() * 0.45);
  ctx.setLineDash([dash, gap]);
  ctx.lineDashOffset = rand() * (dash + gap);
  ctx.translate((rand() - 0.5) * size * 0.28, (rand() - 0.5) * size * 0.28);
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = size * 0.46;
  tracePath(ctx, sub);
  ctx.stroke();
  // a second, finer tooth crossing the first at a different phase, so the grain
  // reads as a texture and not as a row of tidy dashes
  ctx.setLineDash([size * 0.26, size * 0.55]);
  ctx.lineDashOffset = rand() * size * 2;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = size * 0.3;
  tracePath(ctx, sub);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // ── wax clumps ─────────────────────────────────────────────────────────
  // Little heavier deposits that gather along the stroke — more of them than
  // before and finer, hugging the line rather than scattered around it, the way
  // wax actually piles where the crayon lifts and lands.
  const clumps = Math.floor(sub.length / 3.2);
  for (let s = 0; s < clumps; s++) {
    const p = sub[Math.floor(rand() * sub.length)];
    const r = size * (0.07 + rand() * 0.15);
    // most flecks are the wax's own grain (darker); a few are bright wax catching
    // the light, so the surface glints instead of only darkening
    const bright = rand() < 0.25;
    ctx.fillStyle = bright ? "#fffaf0" : grain;
    ctx.globalAlpha = bright ? 0.18 + rand() * 0.18 : 0.28 + rand() * 0.33;
    ctx.beginPath();
    ctx.arc(p.x + (rand() - 0.5) * size * 0.55, p.y + (rand() - 0.5) * size * 0.55, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawStrokeFull(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  seed: number,
  wiggle?: WiggleOpts,
  progress = 1
) {
  const base = resample(stroke.pts, 3.5);
  const pts = wiggle ? wigglePoints(base, { ...wiggle, seed: (wiggle.seed ?? 0) + seed }) : base;
  drawCrayonStroke(ctx, pts, stroke.color, stroke.size, seed, progress);
}

export function strokesBounds(strokes: Stroke[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/** Normalize strokes into a centered unit box (keeps aspect) for world rendering. */
export function normalizeStrokes(strokes: Stroke[], target = 100): { strokes: Stroke[]; w: number; h: number } {
  const b = strokesBounds(strokes);
  const scale = target / Math.max(b.w, b.h);
  const w = b.w * scale;
  const h = b.h * scale;
  return {
    w,
    h,
    strokes: strokes.map((s) => ({
      ...s,
      size: Math.max(1.5, s.size * scale),
      pts: s.pts.map((p) => ({
        x: (p.x - b.x - b.w / 2) * scale,
        y: (p.y - b.y - b.h / 2) * scale,
      })),
    })),
  };
}
