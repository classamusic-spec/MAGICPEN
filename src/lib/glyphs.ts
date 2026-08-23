// ─── Glyph skeletons: the shapes a child traces ─────────────────────────────
// Uppercase A–Z and digits 0–9, each described as the *strokes a hand makes*
// rather than as an outline — so the app can show a guide, animate it being
// written in the correct order and direction, and score a trace against it.
//
// Grid: 100 wide × 140 tall. Cap height y=15, baseline y=130. Same coordinate
// space as the wordmark, so both can share the crayon renderer.

import type { Pt } from "./types";

/** A glyph is an ordered list of strokes; each stroke is an ordered polyline. */
export type Glyph = Pt[][];

const p = (x: number, y: number): Pt => ({ x, y });

/** Sample an ellipse arc. Angles in radians, canvas convention (y grows down). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return out;
}

const TOP = 15;
const BOT = 130;
const MID = 72;

/* Letters are uppercase: they are what children are taught to write first,
   and they are far easier to trace than lowercase with its ascenders and
   descenders. */
export const LETTER_GLYPHS: Record<string, Glyph> = {
  A: [[p(12, BOT), p(50, TOP), p(88, BOT)], [p(27, 95), p(73, 95)]],
  B: [
    [p(20, TOP), p(20, BOT)],
    [...arc(20, 43, 34, 28, -Math.PI / 2, Math.PI / 2)],
    [...arc(20, 101, 38, 29, -Math.PI / 2, Math.PI / 2)],
  ],
  C: [arc(54, MID, 38, 57, -0.35 * Math.PI, -1.65 * Math.PI)],
  D: [[p(20, TOP), p(20, BOT)], [...arc(20, MID, 46, 57.5, -Math.PI / 2, Math.PI / 2)]],
  E: [[p(22, TOP), p(22, BOT)], [p(22, TOP), p(80, TOP)], [p(22, MID), p(70, MID)], [p(22, BOT), p(80, BOT)]],
  F: [[p(22, TOP), p(22, BOT)], [p(22, TOP), p(80, TOP)], [p(22, MID), p(68, MID)]],
  G: [
    // sweeps round to the rightmost point, where the bar starts — the two used
    // to end in different places and the letter read as "Ꮐ"
    arc(52, MID, 36, 57, -0.35 * Math.PI, -2 * Math.PI, 26),
    [p(88, MID), p(62, MID)],
  ],
  H: [[p(20, TOP), p(20, BOT)], [p(80, TOP), p(80, BOT)], [p(20, MID), p(80, MID)]],
  I: [[p(50, TOP), p(50, BOT)]],
  J: [[p(66, TOP), p(66, 100)], [...arc(42, 100, 24, 30, 0, Math.PI * 0.92)]],
  K: [[p(22, TOP), p(22, BOT)], [p(78, TOP), p(22, MID)], [p(22, MID), p(80, BOT)]],
  L: [[p(24, TOP), p(24, BOT)], [p(24, BOT), p(78, BOT)]],
  M: [[p(14, BOT), p(18, TOP), p(50, 88), p(82, TOP), p(86, BOT)]],
  N: [[p(18, BOT), p(18, TOP), p(82, BOT), p(82, TOP)]],
  O: [arc(50, MID, 38, 57, -Math.PI / 2, Math.PI * 1.5)],
  P: [[p(22, TOP), p(22, BOT)], [...arc(22, 45, 36, 30, -Math.PI / 2, Math.PI / 2)]],
  Q: [arc(50, MID, 38, 57, -Math.PI / 2, Math.PI * 1.5), [p(62, 104), p(92, BOT)]],
  R: [[p(22, TOP), p(22, BOT)], [...arc(22, 45, 36, 30, -Math.PI / 2, Math.PI / 2)], [p(38, 75), p(82, BOT)]],
  S: [
    [
      // upper bowl: right → over the top → left → down to the waist at (50,70)
      ...arc(50, 42, 30, 28, -0.13 * Math.PI, -1.5 * Math.PI, 22),
      // lower bowl: leaves the waist to the right, round the bottom, out left
      ...arc(50, 100, 30, 30, -0.5 * Math.PI, 0.88 * Math.PI, 22),
    ],
  ],
  T: [[p(14, TOP), p(86, TOP)], [p(50, TOP), p(50, BOT)]],
  U: [[p(18, TOP), p(18, 92)], [...arc(50, 92, 32, 38, Math.PI, 0)], [p(82, 92), p(82, TOP)]],
  V: [[p(14, TOP), p(50, BOT), p(86, TOP)]],
  W: [[p(8, TOP), p(28, BOT), p(50, 52), p(72, BOT), p(92, TOP)]],
  X: [[p(18, TOP), p(82, BOT)], [p(82, TOP), p(18, BOT)]],
  Y: [[p(18, TOP), p(50, MID)], [p(82, TOP), p(50, MID)], [p(50, MID), p(50, BOT)]],
  Z: [[p(20, TOP), p(80, TOP), p(20, BOT), p(80, BOT)]],
};

export const DIGIT_GLYPHS: Record<string, Glyph> = {
  "0": [arc(50, MID, 32, 57, -Math.PI / 2, Math.PI * 1.5)],
  "1": [[p(30, 36), p(52, TOP), p(52, BOT)], [p(28, BOT), p(78, BOT)]],
  "2": [[
    // over the top, left to right, then the diagonal down to the foot
    ...arc(50, 45, 30, 30, -1.15 * Math.PI, 0.2 * Math.PI, 20),
    p(20, BOT), p(82, BOT),
  ]],
  "3": [
    // two right-facing bowls that meet at the waist, (48,70)
    [...arc(48, 44, 28, 26, -0.795 * Math.PI, 0.5 * Math.PI, 20)],
    [...arc(48, 100, 30, 30, -0.5 * Math.PI, 0.8 * Math.PI, 20)],
  ],
  "4": [[p(70, BOT), p(70, TOP), p(16, 96), p(88, 96)]],
  "5": [
    [p(80, TOP), p(30, TOP), p(24, 80)],
    [...arc(50, 98, 30, 32, -0.87 * Math.PI, 0.85 * Math.PI, 22)],
  ],
  "6": [
    [...arc(52, MID, 34, 57, -0.3 * Math.PI, -Math.PI * 1.5)],
    [...arc(50, 100, 30, 30, Math.PI, Math.PI * 3)],
  ],
  "7": [[p(18, TOP), p(84, TOP), p(42, BOT)]],
  "8": [
    [...arc(50, 44, 28, 29, -Math.PI / 2, Math.PI * 1.5)],
    [...arc(50, 101, 32, 29, -Math.PI / 2, Math.PI * 1.5)],
  ],
  "9": [
    [...arc(50, 44, 30, 29, -Math.PI / 2, Math.PI * 1.5)],
    [p(80, 44), p(76, BOT)],
  ],
};

export const ALL_GLYPHS: Record<string, Glyph> = { ...LETTER_GLYPHS, ...DIGIT_GLYPHS };

export const LETTERS = Object.keys(LETTER_GLYPHS);
export const DIGITS = Object.keys(DIGIT_GLYPHS);

/** Logical glyph box, shared by the guide renderer and the scorer. */
export const GLYPH_BOX = { w: 100, h: 140 };

/** Resample a polyline to points at most `step` apart — even sampling makes
 *  coverage scoring fair regardless of how the skeleton was authored. */
export function densify(stroke: Pt[], step = 3): Pt[] {
  if (stroke.length < 2) return stroke.slice();
  const out: Pt[] = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const a = out[out.length - 1];
    const b = stroke[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      out.push(p(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n));
    }
  }
  return out;
}

/** Every guide point of a glyph, densified — the target a trace is scored on. */
export function glyphPoints(g: Glyph, step = 3): Pt[] {
  return g.flatMap((s) => densify(s, step));
}
