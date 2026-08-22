// ─── Magic sketch recognizer ────────────────────────────────────────────────
// A heuristic gesture classifier: turns scribbles into creature guesses.
// Design rule: the magic NEVER fails — low confidence becomes a Mystery
// Creature that still comes alive. Kids never hit an error state.

import type { Pt, Stroke, RecognitionResult } from "./types";
import { strokeLength, strokesBounds } from "./crayon";

interface StrokeFeat {
  len: number;
  closed: boolean;
  circularity: number; // 4πA/P², 1 = perfect circle
  bounds: { x: number; y: number; w: number; h: number };
  turns: number;       // significant direction changes
  arcs: number;        // long smooth single-curvature runs
  crossings: number;   // self intersections
  pts: Pt[];
}

function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function countTurns(pts: Pt[]): { turns: number; arcs: number } {
  let turns = 0;
  let arcs = 0;
  let run = 0;
  let prevSign = 0;
  for (let i = 2; i < pts.length; i++) {
    const ax = pts[i - 1].x - pts[i - 2].x;
    const ay = pts[i - 1].y - pts[i - 2].y;
    const bx = pts[i].x - pts[i - 1].x;
    const by = pts[i].y - pts[i - 1].y;
    const cross = ax * by - ay * bx;
    const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (mag < 1e-6) continue;
    const s = Math.abs(cross / mag) > 0.06 ? Math.sign(cross) : 0;
    if (s !== 0 && prevSign !== 0 && s !== prevSign) {
      turns++;
      if (run > 6) arcs++;
      run = 0;
    } else if (s !== 0) {
      run++;
    }
    if (s !== 0) prevSign = s;
  }
  if (run > 6) arcs++;
  return { turns, arcs };
}

function countCrossings(pts: Pt[]): number {
  // sample segments, count proper intersections (skip neighbors)
  const seg = pts.length <= 80 ? 1 : Math.floor(pts.length / 60);
  const ids: number[] = [];
  for (let i = 0; i < pts.length; i += seg) ids.push(i);
  let c = 0;
  const inter = (a: Pt, b: Pt, c2: Pt, d: Pt) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c2.x, y: d.y - c2.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((c2.x - a.x) * s.y - (c2.y - a.y) * s.x) / den;
    const u = ((c2.x - a.x) * r.y - (c2.y - a.y) * r.x) / den;
    return t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95;
  };
  for (let i = 0; i < ids.length - 1; i++) {
    for (let j = i + 3; j < ids.length - 1; j++) {
      if (inter(pts[ids[i]], pts[ids[i + 1]], pts[ids[j]], pts[ids[j + 1]])) c++;
    }
  }
  return c;
}

function feat(s: Stroke): StrokeFeat {
  const pts = s.pts;
  const len = strokeLength(pts);
  const b = strokesBounds([s]);
  const d0 = pts.length > 2 ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) : Infinity;
  const closed = pts.length > 4 && len > 20 && d0 < Math.max(18, len * 0.22);
  const area = closed ? polygonArea(pts) : 0;
  const circularity = closed && len > 0 ? Math.min(1, (4 * Math.PI * area) / (len * len)) : 0;
  const { turns, arcs } = countTurns(pts);
  const crossings = pts.length > 6 ? countCrossings(pts) : 0;
  return { len, closed, circularity, bounds: b, turns, arcs, crossings, pts };
}

interface Scores { [kindId: string]: number }

export function recognize(strokes: Stroke[]): RecognitionResult {
  const usable = strokes.filter((s) => s.pts.length > 1 && strokeLength(s.pts) > 8);
  if (usable.length === 0) {
    return { kindId: "mystery", confidence: 1, alternatives: [] };
  }
  const fs = usable.map(feat);
  const B = strokesBounds(usable);
  const maxDim = Math.max(B.w, B.h);
  const aspect = B.w / Math.max(1, B.h);
  const totalLen = fs.reduce((a, f) => a + f.len, 0);
  const main = fs.reduce((a, f) => (f.len > a.len ? f : a), fs[0]);

  const closedBig = fs.filter((f) => f.closed && f.len > maxDim * 0.7);
  const smallLoops = fs.filter(
    (f) => f.closed && f.len <= maxDim * 0.95 && f.bounds.w < B.w * 0.55 && f.bounds.h < B.h * 0.6
  );
  const shortStrokes = fs.filter((f) => !f.closed && f.len < maxDim * 0.45);
  const longOpen = fs.filter((f) => !f.closed && f.len > maxDim * 0.9);
  const bottomLoops = smallLoops.filter((f) => f.bounds.y + f.bounds.h / 2 > B.y + B.h * 0.55);
  const center = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  const surroundLoops = smallLoops.filter((f) => {
    const cx = f.bounds.x + f.bounds.w / 2;
    const cy = f.bounds.y + f.bounds.h / 2;
    const d = Math.hypot(cx - center.x, cy - center.y);
    return d > maxDim * 0.18;
  });
  // closed shapes sitting in the top half (balloon / tree canopy / lollipop)
  const topClosed = fs.filter(
    (f) => f.closed && f.bounds.y + f.bounds.h / 2 < B.y + B.h * 0.45
  );
  // wing lobes: mid-size closed shapes left & right of center (butterfly)
  const wingLoops = fs.filter((f) => f.closed && f.len < totalLen * 0.5 && f.bounds.w < B.w * 0.6);
  const leftWings = wingLoops.filter((f) => f.bounds.x + f.bounds.w / 2 < center.x).length;
  const rightWings = wingLoops.length - leftWings;
  // vertical-ish open strokes (stems, trunks, strings)
  const verticals = fs.filter(
    (f) => !f.closed && f.bounds.h > f.bounds.w * 1.6 && f.len > maxDim * 0.35
  );

  // radiating lines around a center (sun rays)
  const rays = shortStrokes.filter((f) => {
    const mx = f.bounds.x + f.bounds.w / 2;
    const my = f.bounds.y + f.bounds.h / 2;
    const d = Math.hypot(mx - center.x, my - center.y);
    return d > maxDim * 0.28;
  }).length;

  const S: Scores = {};

  // SUN: a properly round circle + at least 3 radiating rays
  const roundClosed =
    closedBig.some((f) => f.circularity > 0.7) || smallLoops.some((f) => f.circularity > 0.75);
  S.sun = (roundClosed && rays >= 3 ? 0.55 : 0) + Math.min(0.4, rays * 0.08);

  // STAR: a stroke that crosses itself (star polygons always do)
  S.star =
    main.crossings >= 2
      ? 0.6 + Math.min(0.3, main.crossings * 0.05) + (Math.abs(1 - aspect) < 0.35 ? 0.1 : 0)
      : main.closed && main.turns >= 8 && Math.abs(1 - aspect) < 0.35
        ? 0.45
        : 0;

  // FISH: horizontal, ONE closed body blob (oval), maybe a tail stroke
  S.fish =
    (aspect > 1.25 ? 0.25 : 0) +
    (closedBig.length <= 1 &&
    closedBig.some((f) => f.circularity > 0.35 && f.circularity < 0.95 && f.bounds.w / f.bounds.h > 1.15)
      ? 0.45
      : main.closed && main.bounds.w / main.bounds.h > 1.2
        ? 0.35
        : 0) +
    (fs.length >= 2 && fs.length <= 6 ? 0.15 : 0) +
    (shortStrokes.length >= 1 ? 0.1 : 0);

  // CAR: 2+ small loops in bottom half + boxy body
  S.car =
    (bottomLoops.length >= 2 ? 0.7 : bottomLoops.length === 1 ? 0.25 : 0) +
    (aspect > 1.2 ? 0.15 : 0) +
    (closedBig.length >= 1 || longOpen.length >= 1 ? 0.15 : 0);

  // FLOWER: central circle + surrounding petals/loops
  S.flower =
    (smallLoops.length >= 3 && surroundLoops.length >= 2 ? 0.55 : 0) +
    (smallLoops.some((f) => f.circularity > 0.5) ? 0.15 : 0) +
    (verticals.length >= 1 ? 0.2 : 0); // stem

  // BUTTERFLY: symmetric closed lobes left/right of center
  S.butterfly =
    (leftWings >= 1 && rightWings >= 1 ? 0.7 : 0) +
    (aspect > 1.05 ? 0.15 : 0) +
    (verticals.some((f) => f.bounds.h > f.bounds.w * 2) ? 0.1 : 0);

  // BIRD: few open arc strokes, wide
  S.bird =
    (longOpen.length >= 1 && longOpen.length <= 3 && fs.every((f) => !f.closed) ? 0.3 : 0) +
    (main.arcs >= 1 && main.turns <= 4 ? 0.3 : 0) +
    (aspect > 1.3 ? 0.15 : 0) +
    (fs.length <= 3 ? 0.1 : 0);

  // ROCKET: a TALL closed body (the closed shape itself is vertical)
  S.rocket =
    aspect < 0.7 && closedBig.some((f) => f.bounds.h > f.bounds.w * 1.5)
      ? 0.6
      : aspect < 0.6 && main.bounds.h > main.bounds.w * 2 && !main.closed
        ? 0.3
        : 0;

  // TREE / LOLLIPOP: vertical trunk with a blob canopy on top
  S.tree =
    (verticals.length >= 1 && topClosed.some((f) => f.bounds.w >= maxDim * 0.3) ? 0.65 : 0) +
    (topClosed.length >= 1 ? 0.15 : 0);

  // BALLOON: a round loop up high + a string longer than the loop is tall
  const topRound = topClosed.find((f) => f.circularity > 0.6 && f.bounds.h < B.h * 0.5);
  S.balloon =
    topRound &&
    verticals.some(
      (f) => f.bounds.y > topRound.bounds.y + topRound.bounds.h * 0.5 && f.len > topRound.bounds.h
    ) &&
    fs.length <= 3
      ? 0.85
      : 0;

  // SNAKE / WORM: single long wavy open stroke
  S.snake =
    fs.length === 1 && !main.closed && main.turns >= 5 && main.len > totalLen * 0.9
      ? 0.62
      : longOpen.length === 1 && main.turns >= 6 && fs.length <= 2
        ? 0.5
        : 0;

  // RAINBOW: multiple wide arcs stacked together
  const arcStrokes = fs.filter((f) => !f.closed && f.arcs >= 1 && f.turns <= 2 && f.bounds.w > f.bounds.h);
  S.rainbow = arcStrokes.length >= 2 ? 0.95 : arcStrokes.length === 1 && aspect > 1.6 ? 0.3 : 0;

  // HEART: single closed stroke, wider than tall, moderate circularity with a notch
  S.heart =
    fs.length === 1 && main.closed && aspect > 0.85 && aspect < 1.6 && main.circularity > 0.45 && main.circularity < 0.8 && main.turns >= 3
      ? 0.5
      : 0;

  // HOUSE-ish fallback for boxy closed shapes with extra strokes
  S.house =
    closedBig.some((f) => f.circularity < 0.55 && Math.abs(1 - aspect) < 0.6) && fs.length >= 2 && topClosed.length === 0
      ? 0.35
      : 0;

  const entries = Object.entries(S).sort((a, b) => b[1] - a[1]);
  const [topId, topScore] = entries[0];
  const confidence = Math.min(0.98, topScore);
  const alternatives = entries.filter(([, v]) => v > 0.25).slice(1, 4).map(([k]) => k);

  if (confidence < 0.42) {
    return { kindId: "mystery", confidence: 0.5, alternatives: alternatives.length ? alternatives : ["fish", "bird", "star"] };
  }
  return { kindId: topId, confidence, alternatives };
}
