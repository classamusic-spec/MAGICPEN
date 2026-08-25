// ─── TraceScreen: where children write ──────────────────────────────────────
// One screen for all three writing worlds — Letter World (A–Z), Math World
// (0–9) and Word World (a whole word, one letter at a time).
//
// The page is a sheet of penmanship paper: ruled lines, a ghosted letter to
// go over, numbered dots showing where each stroke starts and little arrows
// showing which way it goes. Tap "Show me" and the guide writes itself in the
// correct order — that animation is the actual teaching, everything else is
// scaffolding around it.
//
// The one thing that must never drift: the rect the guide is drawn into and
// the rect the child's ink is measured against are the *same object*
// (`boxRef.current`). Everything derives from it; nothing recomputes it.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { Pt, Stroke } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { ALL_GLYPHS, DIGIT_GLYPHS, GLYPH_BOX, LOWER_GLYPHS, LOWER_BOX, LOWER_RULE, densify, type Glyph } from "@/lib/glyphs";
import { scoreTrace, toGlyphSpace, tracePraise, type TraceScore } from "@/lib/tracing";
import { paperTile, roughEllipse, roughRect, shade, waxTile } from "@/lib/ink";
import { sfxHappy, sfxMagic, sfxPop, sfxTap } from "@/lib/audio";
import { primeVoices, hush, sayLetter, sayNumber, sayLine, canNarrate } from "@/lib/speech";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { usePrefersReducedMotion } from "@/components/ink/motion";

/* ── contract ────────────────────────────────────────────────────────────── */

export interface TraceTarget {
  /** The character to trace, e.g. "A" or "7". */
  char: string;
  /** Spoken/label form, e.g. "A" or "seven". Used in praise copy. */
  say?: string;
  /**
   * Trace this outline instead of the letter skeleton `char` names — a drawing
   * lesson hands over a doodle. Its presence is what makes a target a drawing
   * rather than a letter, and the penmanship rules go away with it: cap height
   * and baseline are facts about letters, and ruled lines under a fish are
   * nonsense.
   */
  guide?: Glyph;
  /**
   * The marks that are *not* the lesson — the pattern on a shell, the whiskers,
   * the toes. Drawn faintly the whole time and never scored or required, so a
   * child who wants to add them can and a child who does not has still drawn a
   * turtle.
   */
  detail?: Glyph;
  /** The box `guide` and `detail` are authored in. Defaults to the letter box. */
  space?: Space;
}

export interface TraceScreenProps {
  /** One or more characters to trace in sequence (a word = several). */
  targets: TraceTarget[];
  /** Shown above the sheet, e.g. "Trace the letter A" or "Write DOG". */
  title: string;
  /** Optional sub-line, e.g. "A is for Apple". */
  subtitle?: string;
  /** Crayon colour for the child's ink. */
  color?: string;
  onBack: () => void;
  /** Fires once every target is done. `stars` is the average, rounded. */
  onComplete: (result: {
    stars: 1 | 2 | 3;
    perTarget: number[];
    /**
     * Every stroke the child actually laid down, in the guide's own space.
     *
     * This is what makes a traced drawing still *the child's* drawing: the
     * caller bakes a creature out of these rather than stamping the doodle it
     * showed them. A word lesson has several targets and their strokes all
     * share one box, so this is only meaningful for a single-target lesson —
     * which is exactly what a drawing lesson is.
     */
    strokes: Stroke[];
  }) => void;
}

/* ── geometry ────────────────────────────────────────────────────────────── */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The logical box a guide is authored in. Letters are 100×140 (`GLYPH_BOX`);
 * a drawing lesson brings its own, and everything below is written in terms of
 * whichever one the current target uses rather than assuming the letter one.
 */
export type Space = { w: number; h: number };

/** Guide space → canvas pixels. The exact inverse of `toGlyphSpace`. */
function toCanvas(pts: Pt[], box: Box, space: Space = GLYPH_BOX): Pt[] {
  const kx = box.w / space.w;
  const ky = box.h / space.h;
  return pts.map((p) => ({ x: box.x + p.x * kx, y: box.y + p.y * ky }));
}

/** Canvas pixels → guide space, for the strokes we keep after a target is done. */
function strokeToGlyph(s: Stroke, box: Box, space: Space = GLYPH_BOX): Stroke {
  const kx = space.w / box.w;
  const ky = space.h / box.h;
  return {
    color: s.color,
    size: s.size * kx,
    pts: s.pts.map((p) => ({ x: (p.x - box.x) * kx, y: (p.y - box.y) * ky })),
  };
}

function pathLen(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

/**
 * The one rect everything hangs off. Fits the guide's own aspect inside
 * whatever the sheet has left over once the word strip has taken its band.
 */
function fitBox(w: number, h: number, stripH: number, space: Space = GLYPH_BOX): Box {
  const padX = Math.max(14, w * 0.07);
  const top = stripH + Math.max(12, h * 0.045);
  const bot = Math.max(14, h * 0.07);
  const aw = Math.max(1, w - padX * 2);
  const ah = Math.max(1, h - top - bot);
  const s = Math.min(aw / space.w, ah / space.h);
  const bw = space.w * s;
  const bh = space.h * s;
  return { x: padX + (aw - bw) / 2, y: top + (ah - bh) / 2, w: bw, h: bh };
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/* ── the paper ───────────────────────────────────────────────────────────── */

const RULE = "#8fb2cf";       // the pale blue a workbook rules its lines in
const BADGE_INK = "#7b4fb0";  // the teacher's pen: stroke numbers and arrows

/**
 * The deckled edge — the page is torn free of the sketchbook and taped down,
 * so it carries no binding of its own; the tape at the top corners holds it.
 */
function SheetDeco({ w, h }: { w: number; h: number }) {
  const uid = useId().replace(/:/g, "");
  const deckle = useMemo(
    () => (w > 20 && h > 20 ? roughRect(w - 8, h - 8, { seed: 41, wobble: 3.6, radius: 16 }) : ""),
    [w, h],
  );

  if (!deckle) return null;
  return (
    <svg aria-hidden="true" className="tr-deco" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <mask id={`trm-${uid}`}>
          <rect x="0" y="0" width={w} height={h} fill="#fff" />
          <path d={deckle} transform="translate(4 4)" fill="#000" />
        </mask>
      </defs>
      {/* trims the canvas's square corners back into a torn-out page */}
      <rect x="0" y="0" width={w} height={h} fill="var(--paper)" mask={`url(#trm-${uid})`} />
      <g transform="translate(4 4)">
        <path d={deckle} fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" opacity="0.9" />
        <path
          d={deckle}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          opacity="0.45"
          transform="translate(1 1.2)"
        />
      </g>
    </svg>
  );
}

/* ── stars, filled with real wax ─────────────────────────────────────────── */

function WaxStar({ size, tone }: { size: number; tone: string }) {
  const uid = useId().replace(/:/g, "");
  const url = waxTile(tone);
  // the pattern lives in the icon's own 24-unit space, so scale the tile back up
  const p = (128 * 24) / size;
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={0} height={0} aria-hidden="true" className="absolute">
        <defs>
          <pattern id={`trs-${uid}`} patternUnits="userSpaceOnUse" width={p} height={p}>
            <image href={url} width={p} height={p} />
          </pattern>
        </defs>
      </svg>
      <Icon name="star" size={size} color="#2d2926" fill={url ? `url(#trs-${uid})` : tone} weight={2.3} />
    </span>
  );
}

function Stars({ n, size, animate }: { n: number; size: number; animate: boolean }) {
  return (
    <span className="tr-stars" role="img" aria-label={`${n} out of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={i < n && animate ? "tr-star-in" : undefined}
          style={{
            display: "block",
            animationDelay: i < n && animate ? `${0.08 + i * 0.22}s` : undefined,
            transform: i === 1 ? "translateY(-5px)" : undefined,
          }}
        >
          {i < n ? (
            <WaxStar size={size + (i === 1 ? size * 0.16 : 0)} tone="#ffc72c" />
          ) : (
            <Icon
              name="starEmpty"
              size={size + (i === 1 ? size * 0.16 : 0)}
              color="var(--ink)"
              weight={2.1}
              style={{ opacity: 0.2 }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

/* ── the word strip: which letters are written, which is next ────────────── */

/** A small glyph drawn as SVG polylines — either the skeleton or a child's ink. */
function MiniGlyph({
  strokes,
  h,
  color,
  weight,
  dashed,
  opacity,
  space = GLYPH_BOX,
}: {
  strokes: Pt[][];
  h: number;
  color: string;
  weight: number;
  dashed?: boolean;
  opacity?: number;
  space?: Space;
}) {
  const w = (h * space.w) / space.h;
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${space.w} ${space.h}`}
      style={{ display: "block", overflow: "visible", opacity }}
    >
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? "2 10" : undefined}
        />
      ))}
    </svg>
  );
}

/** The hand-drawn ring a child would put around the one they're on. */
function RoundRing({ w, h, color, seed }: { w: number; h: number; color: string; seed: number }) {
  const d = useMemo(() => roughEllipse(w, h, { seed, wobble: 3.2 }), [w, h, seed]);
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="tr-ring"
      style={{ overflow: "visible" }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" opacity="0.95" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
        transform={`translate(1.2 1.4) rotate(1.6 ${w / 2} ${h / 2})`}
      />
    </svg>
  );
}

/* ── canvas painting helpers ─────────────────────────────────────────────── */

/** The ruled lines of penmanship paper, pinned to the glyph's own metrics. */
const CAP_RULE = { top: 15, mid: 72, base: 130 };
function paintRules(
  ctx: CanvasRenderingContext2D, box: Box, sheetW: number,
  spaceH: number = GLYPH_BOX.h,
  rule: { top: number; mid: number; base: number; desc?: number } = CAP_RULE,
) {
  const ky = box.h / spaceH;
  const x0 = Math.max(6, box.x - box.w * 0.42);
  const x1 = Math.min(sheetW - 6, box.x + box.w * 1.42);
  const line = (gy: number, dash: boolean, alpha: number, wgt: number) => {
    const y = box.y + gy * ky;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = wgt;
    ctx.lineCap = "round";
    ctx.setLineDash(dash ? [7, 9] : []);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.restore();
  };
  line(rule.top, true, 0.45, 1.6);         // the top the tall letters reach
  line(rule.mid, true, 0.3, 1.4);          // the midline you keep the humps under
  line(rule.base, false, 0.6, 2.2);        // the baseline you sit letters on
  if (rule.desc != null) line(rule.desc, true, 0.32, 1.4);  // where the tails hang to
}

/** A stroke-number badge, its digit drawn from the app's own digit glyphs. */
function paintBadge(ctx: CanvasRenderingContext2D, n: number, c: Pt, r: number) {
  ctx.save();
  ctx.fillStyle = "#fffdf7";
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BADGE_INK;
  ctx.lineWidth = Math.max(1.4, r * 0.2);
  ctx.stroke();

  const g = DIGIT_GLYPHS[String(n)];
  if (g) {
    const hh = r * 1.12;
    const s = hh / 115;               // the digits' inked span is y 15…130
    ctx.strokeStyle = BADGE_INK;
    ctx.lineWidth = Math.max(1.2, r * 0.24);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of g) {
      ctx.beginPath();
      st.forEach((p, i) => {
        const x = c.x - GLYPH_BOX.w * s * 0.5 + p.x * s;
        const y = c.y - hh / 2 + (p.y - 15) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The little arrowhead that says which way the pen travels. */
function paintArrow(ctx: CanvasRenderingContext2D, pts: Pt[], size: number) {
  const n = pts.length;
  if (n < 3) return;
  const tip = pts[n - 1];
  const back = pts[Math.max(0, n - 1 - Math.ceil(n * 0.08))];
  const a = Math.atan2(tip.y - back.y, tip.x - back.x);
  const w = 0.62;
  ctx.save();
  ctx.strokeStyle = BADGE_INK;
  ctx.lineWidth = Math.max(1.6, size * 0.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(tip.x - Math.cos(a - w) * size, tip.y - Math.sin(a - w) * size);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x - Math.cos(a + w) * size, tip.y - Math.sin(a + w) * size);
  ctx.stroke();
  ctx.restore();
}

/* ── the letter comes alive ──────────────────────────────────────────────────
   The moment a target is finished, the child's own crayon gets up and does the
   one thing only that character would do — S slithers, T spins its crossbar,
   8 cartwheels — and then settles back exactly where it was drawn.

   Every act is a pure function of time across one short beat, written in the
   glyph's own 100×140 space so the same numbers mean the same thing on a phone
   and on a tablet, and every act is the *identity* at t=0 and t=1 — which is
   what makes the settle seamless and makes a torn-down animation harmless.

   Nothing in here touches `boxRef`, the strokes the scorer saw, or any state.
   The score is already in by the time a letter comes alive: this is only paint. */

/** One stroke of the child's ink, in glyph space. */
type LifeStroke = { color: string; size: number; pts: Pt[] };

/** The ink's own bounds — pivots come from what the child drew, not the ideal. */
interface LifeBox {
  x0: number; y0: number; x1: number; y1: number;
  cx: number; cy: number; w: number; h: number;
}

interface LifeCtx {
  /** 0…1 through the beat. */
  t: number;
  bb: LifeBox;
  /** The edges of the sheet, in glyph units — so a letter that runs, rolls or
   *  hops stays on the paper on a 320px phone and uses the room a tablet has. */
  room: { x0: number; x1: number; y0: number; y1: number };
}

/** Take the ink and give it back moved. May return extra strokes (I's dot). */
type Act = (src: LifeStroke[], c: LifeCtx) => LifeStroke[];

const cl01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const cl11 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** Smoothstep from a to b — and b may be *below* a, for a falling ramp. */
function smooth(a: number, b: number, v: number): number {
  const u = cl01((v - a) / ((b - a) || 1e-6));
  return u * u * (3 - 2 * u);
}
/** 0 → 1 → 0 across the beat. The workhorse: guarantees a clean start and end. */
const bell = (t: number) => Math.sin(Math.PI * cl01(t));
/** Like `bell` but flat-topped — an envelope for something that oscillates. */
const hold = (t: number) => Math.pow(Math.sin(Math.PI * cl01(t)), 0.55);
/** Ease in and out, 0…1 — for spins that must land on a whole turn. */
const ease = (t: number) => { const u = cl01(t); return u * u * (3 - 2 * u); };

function rotP(p: Pt, c: Pt, a: number): Pt {
  if (!a) return p;
  const s = Math.sin(a);
  const k = Math.cos(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
}
const scaleP = (p: Pt, c: Pt, sx: number, sy: number): Pt => ({
  x: c.x + (p.x - c.x) * sx,
  y: c.y + (p.y - c.y) * sy,
});

/** Move every point of every stroke. */
const move = (s: LifeStroke[], f: (p: Pt) => Pt): LifeStroke[] =>
  s.map((k) => ({ color: k.color, size: k.size, pts: k.pts.map(f) }));

/** Move every point, told where it sits along its own stroke and which way is
 *  sideways there — for waves that travel along a letter's path. */
const along = (
  s: LifeStroke[],
  f: (p: Pt, u: number, nx: number, ny: number) => Pt,
): LifeStroke[] =>
  s.map((k) => {
    const n = k.pts.length;
    return {
      color: k.color,
      size: k.size,
      pts: k.pts.map((p, i) => {
        const a = k.pts[Math.max(0, i - 1)];
        const b = k.pts[Math.min(n - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        return f(p, n > 1 ? i / (n - 1) : 0, -dy / d, dx / d);
      }),
    };
  });

function lifeBounds(src: LifeStroke[]): LifeBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of src) {
    for (const p of s.pts) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 100, y1: 140, cx: 50, cy: 70, w: 100, h: 140 };
  const w = Math.max(6, x1 - x0);
  const h = Math.max(6, y1 - y0);
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h };
}

/** Where a letter sits, 0…1, so an act can say "only the arms" or "only the
 *  foot" without caring how the child happened to split their strokes. */
const vy = (p: Pt, b: LifeBox) => (p.y - b.y0) / b.h;
const vx = (p: Pt, b: LifeBox) => (p.x - b.x0) / b.w;

/** As much of the wanted travel as the sheet actually has room for. */
const goRight = (c: LifeCtx, want: number) => Math.max(0, Math.min(want, c.room.x1 - c.bb.x1));
const goUp = (c: LifeCtx, want: number) => Math.max(0, Math.min(want, c.bb.y0 - c.room.y0));

/* ── the roster ───────────────────────────────────────────────────────────
   26 letters and 10 digits. Each one is about its own shape: a hinge where
   the letter has a joint, a wave along the path the letter actually takes,
   a pivot on the point it would really balance on. */

const ACTS: Record<string, Act> = {
  /* A — pitches its roof up like a tent: crouches wide, then springs tall. */
  A: (s, c) => {
    const crouch = smooth(0, 0.3, c.t) - smooth(0.26, 0.6, c.t);
    const rise = smooth(0.3, 0.62, c.t) - smooth(0.6, 1, c.t);
    const base = { x: c.bb.cx, y: c.bb.y1 };
    const sx = 1 + 0.22 * crouch - 0.11 * rise;
    const sy = 1 - 0.3 * crouch + 0.18 * rise;
    return move(s, (p) => scaleP(p, base, sx, sy));
  },

  /* B — bounces on its flat back, squashing as it lands. */
  B: (s, c) => {
    const air = Math.abs(Math.sin(Math.PI * 2 * c.t));
    const g = hold(c.t);
    const land = Math.pow(1 - air, 3) * g;
    const base = { x: c.bb.cx, y: c.bb.y1 };
    const lift = -goUp(c, c.bb.h * 0.2) * air * g;
    return move(s, (p) => {
      const q = scaleP(p, base, 1 + 0.16 * land - 0.06 * air * g, 1 - 0.18 * land + 0.08 * air * g);
      return { x: q.x, y: q.y + lift };
    });
  },

  /* C — chomps: the open side is a mouth, hinged at the back of the curve. */
  C: (s, c) => {
    const a = -0.36 * Math.sin(Math.PI * 3 * c.t); // open, snap shut, open, rest
    const hinge = { x: c.bb.x0, y: c.bb.cy };
    const lunge = 3 * bell(c.t);
    return move(s, (p) => {
      const jaw = smooth(0.05, 0.5, vx(p, c.bb));
      const side = cl11((p.y - c.bb.cy) / (c.bb.h * 0.26));
      const q = rotP(p, hinge, a * jaw * side);
      return { x: q.x + lunge, y: q.y };
    });
  },

  /* D — a door: the bowl swings open on the spine and shuts again. */
  D: (s, c) => {
    const open = bell(c.t);
    const spine = c.bb.x0 + c.bb.w * 0.14;
    return move(s, (p) => {
      const w = smooth(0, 0.22, (p.x - spine) / c.bb.w);
      const k = 1 - 0.6 * open * w;
      return { x: spine + (p.x - spine) * k, y: p.y };
    });
  },

  /* E — its three arms shoot out and back in turn, top one leading. */
  E: (s, c) => {
    const g = hold(c.t);
    const spine = c.bb.x0 + c.bb.w * 0.12;
    return move(s, (p) => {
      const w = smooth(0.02, 0.34, (p.x - spine) / c.bb.w);
      const ph = Math.PI * 2 * (c.t * 1.7 - vy(p, c.bb) * 0.42);
      return { x: p.x + 7 * w * g * Math.sin(ph), y: p.y + 2.4 * w * g * Math.cos(ph) };
    });
  },

  /* F — a flag: the arms ripple away from the pole, the stem holds still. */
  F: (s, c) => {
    const g = hold(c.t);
    const spine = c.bb.x0 + c.bb.w * 0.12;
    return move(s, (p) => {
      const u = cl01((p.x - spine) / (c.bb.w * 0.88));
      return { x: p.x, y: p.y + 8 * u * u * g * Math.sin(Math.PI * 2 * (u * 1.15 - c.t * 2.6)) };
    });
  },

  /* G — the spiral winds itself up and springs open again. */
  G: (s, c) => {
    const a = bell(c.t);
    const cn = { x: c.bb.cx, y: c.bb.cy };
    const rmax = Math.max(1, Math.hypot(c.bb.w, c.bb.h) / 2);
    return move(s, (p) => {
      const r = Math.hypot(p.x - cn.x, p.y - cn.y) / rmax;
      const k = 1 - 0.14 * a;
      return scaleP(rotP(p, cn, 0.8 * a * r), cn, k, k);
    });
  },

  /* H — the crossbar is a trampoline: it sags, then twangs back. */
  H: (s, c) => {
    const drop = 9 * Math.sin(Math.PI * 2 * c.t) * (1 - 0.4 * c.t);
    const bar = c.bb.y0 + c.bb.h * 0.5;
    return move(s, (p) => {
      const near = 1 - smooth(0, c.bb.h * 0.2, Math.abs(p.y - bar));
      const mid = 1 - smooth(c.bb.w * 0.16, c.bb.w * 0.42, Math.abs(p.x - c.bb.cx));
      return { x: p.x, y: p.y + drop * near * mid };
    });
  },

  /* I — hops, and dots itself on the way down. */
  I: (s, c) => {
    const air = Math.abs(Math.sin(Math.PI * 2 * c.t));
    const g = hold(c.t);
    const land = Math.pow(1 - air, 3) * g;
    const lift = -goUp(c, c.bb.h * 0.2) * air;
    const foot = { x: c.bb.cx, y: c.bb.y1 };
    const lean = 0.12 * Math.sin(Math.PI * 4 * c.t) * g; // leans into each hop
    const out = move(s, (p) => {
      const q = scaleP(p, foot, 1 + 0.3 * land - 0.1 * air * g, 1 - 0.16 * land + 0.08 * air * g);
      const r = rotP(q, foot, lean);
      return { x: r.x, y: r.y + lift };
    });
    const first = out[0];
    if (first) {
      const fall = Math.pow(1 - cl01(c.t * 1.9), 2);
      const r = first.size * 1.25 * (1 - smooth(0.78, 1, c.t));
      const rest = c.bb.y0 - goUp(c, c.bb.h * 0.12);
      if (r > 0.6) {
        out.push({
          color: first.color,
          size: r,
          pts: [{ x: c.bb.cx, y: rest - fall * (rest - c.room.y0) + lift }],
        });
      }
    }
    return out;
  },

  /* J — hangs off its own top and swings like a hook. */
  J: (s, c) => {
    const piv = { x: c.bb.x1, y: c.bb.y0 };
    const a = 0.22 * Math.sin(Math.PI * 3 * c.t) * (1 - c.t);
    return move(s, (p) => rotP(p, piv, a));
  },

  /* K — kicks: the low diagonal swings up from the joint, twice. */
  K: (s, c) => {
    const joint = { x: c.bb.x0 + c.bb.w * 0.08, y: c.bb.cy };
    const a = -0.5 * Math.abs(Math.sin(Math.PI * 2 * c.t));
    return move(s, (p) => {
      const w = smooth(0.06, 0.4, vx(p, c.bb)) * smooth(0.48, 0.62, vy(p, c.bb));
      return rotP(p, joint, a * w);
    });
  },

  /* L — lifts its toe and stamps, and the stem shivers with the bang. */
  L: (s, c) => {
    const up = smooth(0, 0.42, c.t) - smooth(0.42, 0.56, c.t);
    const after = cl01((c.t - 0.56) / 0.44);
    const ring = c.t > 0.56 ? Math.sin(Math.PI * 8 * (c.t - 0.56)) * (1 - after) : 0;
    const corner = { x: c.bb.x0, y: c.bb.y1 };
    return move(s, (p) => {
      const foot = smooth(0.66, 0.92, vy(p, c.bb));
      const q = rotP(p, corner, -0.34 * up * foot);
      return { x: q.x + ring * 2.2 * (1 - foot), y: q.y + ring * 1.1 * foot };
    });
  },

  /* M — a wave rolls through it, left to right. */
  M: (s, c) => {
    const g = hold(c.t);
    return move(s, (p) => ({
      x: p.x,
      y: p.y + 7 * g * Math.sin(Math.PI * 2 * (vx(p, c.bb) * 1.25 - c.t * 2)),
    }));
  },

  /* N — a concertina: the zigzag squeezes shut, then springs wide. */
  N: (s, c) => {
    const k = -0.15 * Math.sin(Math.PI * 2 * c.t);
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) => scaleP(p, cn, 1 + k, 1 - 0.5 * k));
  },

  /* O — rolls away and rolls back, turning exactly as far as it travels. */
  O: (s, c) => {
    const r = Math.max(6, c.bb.w / 2);
    const dx = Math.sin(Math.PI * c.t) * goRight(c, c.bb.w * 0.66);
    const bump = bell(cl01((c.t - 0.34) / 0.32));
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) => {
      const q = scaleP(rotP(p, cn, dx / r), cn, 1 - 0.1 * bump, 1 + 0.07 * bump);
      return { x: q.x + dx, y: q.y };
    });
  },

  /* P — its head puffs up like a balloon on a stick. */
  P: (s, c) => {
    const puff = bell(c.t);
    const bowl = { x: c.bb.x0 + c.bb.w * 0.48, y: c.bb.y0 + c.bb.h * 0.24 };
    return move(s, (p) => {
      const w = smooth(0.52, 0.1, vy(p, c.bb));
      const k = 1 + 0.24 * puff * w;
      const q = scaleP(p, bowl, k, k);
      return { x: q.x, y: q.y - 2.5 * puff * w };
    });
  },

  /* Q — sits still and wags its tail. */
  Q: (s, c) => {
    const g = hold(c.t);
    const wag = 0.5 * Math.sin(Math.PI * 5 * c.t) * g;
    const piv = { x: c.bb.x0 + c.bb.w * 0.6, y: c.bb.y0 + c.bb.h * 0.72 };
    const bob = -c.bb.h * 0.03 * Math.abs(Math.sin(Math.PI * 5 * c.t)) * g;
    return move(s, (p) => {
      const w = smooth(0.5, 0.82, vx(p, c.bb)) * smooth(0.6, 0.84, vy(p, c.bb));
      const q = rotP(p, piv, wag * w);
      return { x: q.x, y: q.y + bob };
    });
  },

  /* R — strides: the leg swings through and the body bobs with the step. */
  R: (s, c) => {
    const swing = Math.sin(Math.PI * 2 * c.t);
    const joint = { x: c.bb.x0 + c.bb.w * 0.18, y: c.bb.y0 + c.bb.h * 0.45 };
    const bob = -c.bb.h * 0.06 * Math.abs(swing);
    return move(s, (p) => {
      const w = smooth(0.2, 0.55, vx(p, c.bb)) * smooth(0.46, 0.62, vy(p, c.bb));
      const q = rotP(p, joint, 0.38 * swing * w);
      return { x: q.x, y: q.y + bob };
    });
  },

  /* S — a snake: a wave travels down the letter's own path, and it slides. */
  S: (s, c) => {
    const amp = 9 * bell(c.t);
    const slide = 3.5 * Math.sin(Math.PI * 2 * c.t) * (1 - c.t);
    return along(s, (p, u, nx, ny) => {
      const w = Math.sin(Math.PI * 2 * (u * 1.5 - c.t * 2.2));
      return { x: p.x + nx * amp * w + slide, y: p.y + ny * amp * w };
    });
  },

  /* T — hovers, spinning its crossbar like a propeller. Two whole turns, so
     it lands facing exactly the way the child drew it. */
  T: (s, c) => {
    const a = Math.PI * 4 * ease(c.t);
    const piv = { x: c.bb.cx, y: c.bb.y0 };
    const lift = -goUp(c, c.bb.h * 0.08) * bell(c.t);
    const chord = 1 - 0.34 * bell(c.t); // the blade foreshortens as it turns
    return move(s, (p) => {
      const w = smooth(0.05, 0.15, Math.abs(p.x - c.bb.cx) / c.bb.w) * smooth(0.34, 0.16, vy(p, c.bb));
      const k = 1 - (1 - chord) * w;
      const q = rotP(scaleP(p, piv, k, k), piv, a * w);
      return { x: q.x, y: q.y + lift };
    });
  },

  /* U — a cup rocking on its round bottom. */
  U: (s, c) => {
    const a = 0.2 * Math.sin(Math.PI * 3 * c.t) * (1 - c.t);
    const piv = { x: c.bb.cx, y: c.bb.y1 };
    return move(s, (p) => {
      const q = rotP(p, piv, a);
      return { x: q.x - a * c.bb.w * 0.32, y: q.y };
    });
  },

  /* V — a beak: it snaps shut on the point it stands on, then opens again.
     Wide open is what the child drew, so the snap is the half that moves. */
  V: (s, c) => {
    const k = Math.sin(Math.PI * 2 * c.t);
    const a = k > 0 ? 0.36 * k : 0.14 * k; // snaps shut hard, opens gently
    const tip = { x: c.bb.cx, y: c.bb.y1 };
    return move(s, (p) => {
      const side = cl11((p.x - c.bb.cx) / (c.bb.w * 0.22));
      return rotP(p, tip, -a * side);
    });
  },

  /* W — the deeper water: a bigger, slower swell running the other way. */
  W: (s, c) => {
    const g = hold(c.t);
    const sway = 3 * Math.sin(Math.PI * 2 * c.t) * g;
    return move(s, (p) => ({
      x: p.x + sway,
      y: p.y + 9 * g * Math.sin(Math.PI * 2 * (vx(p, c.bb) * 2.1 + c.t * 1.6)),
    }));
  },

  /* X — scissors: both pairs of arms pinch together and open again. */
  X: (s, c) => {
    const a = 0.26 * Math.sin(Math.PI * 4 * c.t);
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) =>
      rotP(p, cn, a * cl11((p.x - cn.x) / (c.bb.w * 0.24)) * cl11((p.y - cn.y) / (c.bb.h * 0.24))),
    );
  },

  /* Y — throws both arms up in a cheer, and lifts onto its toes. */
  Y: (s, c) => {
    const up = bell(c.t);
    const joint = { x: c.bb.cx, y: c.bb.y0 + c.bb.h * 0.42 };
    return move(s, (p) => {
      const w = smooth(0.44, 0.16, vy(p, c.bb));
      const side = cl11((p.x - c.bb.cx) / (c.bb.w * 0.2));
      const q = rotP(p, joint, -0.4 * up * w * side);
      return { x: q.x, y: q.y - goUp(c, c.bb.h * 0.06) * up };
    });
  },

  /* Z — zips off to the right and snaps back, stretching as it goes. */
  Z: (s, c) => {
    const g = hold(c.t);
    const reach = 0.72 * Math.min(goRight(c, c.bb.w * 0.7), Math.max(0, c.bb.x0 - c.room.x0));
    const dart = Math.sin(Math.PI * 3 * c.t); // out, back past home, out, rest
    const dx = dart * reach;
    const speed = Math.cos(Math.PI * 3 * c.t);
    const stretch = 1 + 0.34 * Math.abs(speed) * g;
    const lean = speed * g * c.bb.w * 0.15; // the top leans into the run
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) => {
      const q = scaleP(p, cn, stretch, 1 - 0.1 * (stretch - 1));
      return { x: q.x + dx + lean * (0.5 - vy(p, c.bb)), y: q.y };
    });
  },

  /* 0 — spins on the spot like a coin, edge-on and back. */
  "0": (s, c) => {
    const a = Math.PI * 4 * ease(c.t);
    const k = Math.max(0.1, Math.abs(Math.cos(a)));
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) => scaleP(p, cn, k, 1 + 0.06 * (1 - k)));
  },

  /* 1 — takes a bow from the waist. */
  "1": (s, c) => {
    const bow = smooth(0, 0.42, c.t) - smooth(0.55, 1, c.t);
    const base = { x: c.bb.cx, y: c.bb.y1 };
    const lean = Math.min(0.36, (c.room.x1 - c.bb.x1 + 8) / Math.max(20, c.bb.h));
    return move(s, (p) => {
      const w = Math.pow(1 - vy(p, c.bb), 1.3);
      const q = scaleP(rotP(p, base, lean * bow * w), base, 1, 1 - 0.16 * bow * w);
      return { x: q.x, y: q.y + 2 * bow * w };
    });
  },

  /* 2 — a swan: the neck dips down for a drink and lifts again. */
  "2": (s, c) => {
    const dip = bell(c.t);
    const neck = { x: c.bb.cx, y: c.bb.y0 + c.bb.h * 0.55 };
    return move(s, (p) => {
      const w = smooth(0.6, 0.1, vy(p, c.bb));
      const q = rotP(p, neck, Math.min(0.42, (c.room.x1 - c.bb.x1 + 10) / Math.max(20, c.bb.h)) * dip * w);
      return { x: q.x, y: q.y + 4 * dip * w };
    });
  },

  /* 3 — flexes: both bowls bulge out like a strongman, twice. */
  "3": (s, c) => {
    const f = Math.abs(Math.sin(Math.PI * 2 * c.t));
    const cn = { x: c.bb.cx, y: c.bb.cy };
    return move(s, (p) => {
      const v = vy(p, c.bb);
      const top = Math.exp(-Math.pow((v - 0.26) / 0.19, 2));
      const bot = Math.exp(-Math.pow((v - 0.76) / 0.19, 2));
      const right = smooth(0.2, 0.62, vx(p, c.bb));
      const q = scaleP(p, cn, 1, 1 - 0.06 * f);
      return { x: q.x + (top + bot * 1.15) * right * 8 * f, y: q.y };
    });
  },

  /* 4 — winks: the little window under its arm blinks shut and open. */
  "4": (s, c) => {
    const shut = Math.abs(Math.sin(Math.PI * 2 * c.t));
    const bar = c.bb.y0 + c.bb.h * 0.66;
    const stem = c.bb.x0 + c.bb.w * 0.74;
    return move(s, (p) => {
      const w = smooth(0.02, 0.3, (stem - p.x) / c.bb.w);
      return { x: p.x, y: p.y + 0.62 * shut * w * Math.max(0, bar - p.y) };
    });
  },

  /* 5 — its belly bounces like a ball while the flat top holds. */
  "5": (s, c) => {
    const k = Math.sin(Math.PI * 2 * c.t);
    const foot = c.bb.y1;
    return move(s, (p) => {
      const w = smooth(0.4, 0.7, vy(p, c.bb));
      return {
        x: c.bb.cx + (p.x - c.bb.cx) * (1 + 0.16 * k * w),
        y: foot + (p.y - foot) * (1 - 0.2 * k * w),
      };
    });
  },

  /* 6 — a fern frond: the tail coils into the loop and unrolls again. Each
     step bends a shade more than the one before, the way a real curl does. */
  "6": (s, c) => {
    const curl = 2.0 * bell(c.t);
    return s.map((k) => {
      const n = k.pts.length;
      const out: Pt[] = new Array(n);
      out[n - 1] = k.pts[n - 1];
      let ang = 0;
      for (let i = n - 2; i >= 0; i--) {
        ang += (curl * 2 * (1 - i / (n - 1))) / n;
        const dx = k.pts[i].x - k.pts[i + 1].x;
        const dy = k.pts[i].y - k.pts[i + 1].y;
        const co = Math.cos(ang);
        const si = Math.sin(ang);
        out[i] = { x: out[i + 1].x + dx * co - dy * si, y: out[i + 1].y + dx * si + dy * co };
      }
      return { color: k.color, size: k.size, pts: out };
    });
  },

  /* 7 — cracks like a whip, all the snap out at the foot. */
  "7": (s, c) => {
    const g = hold(c.t);
    return along(s, (p, u, nx, ny) => {
      const amp = 11 * Math.pow(u, 2.2) * g;
      const w = Math.sin(Math.PI * 2 * (u * 1.1 - c.t * 2.8));
      return { x: p.x + nx * amp * w, y: p.y + ny * amp * w };
    });
  },

  /* 8 — cartwheels: one whole turn, out over the arc and back. */
  "8": (s, c) => {
    const a = Math.PI * 2 * ease(c.t);
    const arc = Math.sin(Math.PI * c.t);
    const cn = { x: c.bb.cx, y: c.bb.cy };
    const tuck = 1 - 0.4 * arc; // tucks in mid-air, the way a cartwheel does
    // turning sideways makes it wider than it stands: spend that width first,
    // and travel on whatever is left, so a 320px phone still fits the whole turn
    const bulge = Math.max(0, (Math.hypot(c.bb.w, c.bb.h) * tuck - c.bb.w) / 2);
    const over = arc * Math.max(0, goRight(c, c.bb.w * 0.55) - bulge);
    const up = arc * goUp(c, c.bb.h * 0.12);
    return move(s, (p) => {
      const q = rotP(scaleP(p, cn, tuck, tuck), cn, a);
      return { x: q.x + over, y: q.y - up };
    });
  },

  /* 9 — a balloon tugging up on its string, swaying as it goes. */
  "9": (s, c) => {
    const g = hold(c.t);
    const sway = 3.4 * Math.sin(Math.PI * 3 * c.t) * g;
    return move(s, (p) => {
      const w = smooth(0.9, 0.08, vy(p, c.bb));
      return { x: p.x + sway * w, y: p.y - goUp(c, c.bb.h * 0.09) * g * w };
    });
  },
};

/** For anything with no act of its own: a short, happy jump. Better a good
 *  shared moment than a bad bespoke one. */
const CHEER: Act = (s, c) => {
  const air = bell(c.t);
  const g = hold(c.t);
  const base = { x: c.bb.cx, y: c.bb.y1 };
  const squash = Math.pow(1 - air, 2) * g;
  return move(s, (p) => {
    const q = scaleP(p, base, 1 + 0.1 * squash - 0.04 * air, 1 - 0.12 * squash + 0.06 * air);
    const r = rotP(q, base, 0.08 * Math.sin(Math.PI * 2 * c.t) * g);
    return { x: r.x, y: r.y - goUp(c, c.bb.h * 0.16) * air };
  });
};

/** Reduced motion: no somersault, just a breath in and out. */
const PULSE: Act = (s, c) => {
  const k = 1 + 0.05 * bell(c.t);
  const cn = { x: c.bb.cx, y: c.bb.cy };
  return move(s, (p) => scaleP(p, cn, k, k));
};

/** How long a letter is alive for. Short on purpose: the child is mid-praise
 *  and the Next button is live the whole time. */
const LIFE_MS = 1150;
const LIFE_CALM_MS = 700;

/* ── layout mode ─────────────────────────────────────────────────────────── */

const LAND_Q = "(orientation: landscape) and (max-height: 560px)";

function useLandscapeRail(): boolean {
  const [land, setLand] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(LAND_Q).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(LAND_Q);
    const on = () => setLand(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return land;
}

/* ── screen ──────────────────────────────────────────────────────────────── */

interface Item {
  char: string;
  say: string;
  /** What is traced and scored. */
  glyph: Glyph;
  /** Shown faintly, never scored, never asked for. Empty for a letter. */
  detail: Glyph;
  /** The box `glyph` and `detail` are authored in. */
  space: Space;
  /** A letter or a number — the only things penmanship rules mean anything
   *  for, and so the only things that get them. */
  ruled: boolean;
  /** The ruled lines this glyph sits on, when they are not the capitals'
   *  cap/mid/baseline — lowercase brings its own, including a descender line. */
  rule?: { top: number; mid: number; base: number; desc?: number };
}

interface DoneRec {
  char: string;
  stars: number;
  strokes: Stroke[]; // kept in glyph space so the strip can redraw at any size
}

interface Demo {
  active: boolean;
  still: boolean; // reduced motion: hold the finished letter instead of drawing it
  t0: number;
  spans: number[];
  gap: number;
}

/** One letter's turn at being alive: the ink it moves, in glyph space, and the
 *  act that moves it. Held in a ref so a frame never sees a stale letter. */
interface Life {
  t0: number;
  dur: number;
  act: Act;
  src: LifeStroke[];
  bb: LifeBox;
}

export default function TraceScreen({
  targets,
  title,
  subtitle,
  color = "#2f6fe4",
  onBack,
  onComplete,
}: TraceScreenProps): JSX.Element {
  /* Characters with no skeleton (spaces, "+", punctuation) are not traceable,
     so they never become a step. Nor is an empty drawing guide — a doodle the
     tracer could make nothing of is "no lesson here" rather than an error, so
     it can never strand a child on a sheet with nothing to go over. */
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of targets) {
      if (t.guide) {
        if (t.guide.length) {
          out.push({
            char: t.char,
            say: t.say ?? t.char,
            glyph: t.guide,
            detail: t.detail ?? [],
            space: t.space ?? GLYPH_BOX,
            ruled: false,
          });
        }
        continue;
      }
      // a lowercase letter is a different letterform in a taller box, not just
      // a small capital — resolve it to its own glyph, or fall through to caps
      if (/^[a-z]$/.test(t.char)) {
        const lg = LOWER_GLYPHS[t.char];
        if (lg) {
          out.push({ char: t.char, say: t.say ?? t.char, glyph: lg, detail: [], space: LOWER_BOX, ruled: true, rule: LOWER_RULE });
          continue;
        }
      }
      const ch = t.char.toUpperCase();
      const g = ALL_GLYPHS[ch];
      if (g) out.push({ char: ch, say: t.say ?? ch, glyph: g, detail: [], space: GLYPH_BOX, ruled: true });
    }
    return out;
  }, [targets]);

  const multi = items.length > 1;
  const land = useLandscapeRail();
  const reduced = usePrefersReducedMotion();

  const [idx, setIdx] = useState(0);
  // give the app a voice the moment a lesson opens, and take it back on the way
  // out so a letter is never still being spoken over the next screen
  useEffect(() => { primeVoices(); return () => hush(); }, []);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [done, setDone] = useState<DoneRec[]>([]);
  const [result, setResult] = useState<TraceScore | null>(null);
  const [phase, setPhase] = useState<"trace" | "praise">("trace");
  const [demoing, setDemoing] = useState(false);
  const [say, setSay] = useState("");
  const [sheet, setSheet] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 1, h: 1 });

  const wrapRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement | null>(null);
  const pathsRef = useRef<Pt[][]>([]);
  const boxRef = useRef<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const sheetRef = useRef({ w: 0, h: 0 });
  const glyphRef = useRef<Glyph | null>(null);
  const detailPathsRef = useRef<Pt[][]>([]);
  const spaceRef = useRef<Space>(GLYPH_BOX);
  const ruledRef = useRef(true);
  const ruleRef = useRef<{ top: number; mid: number; base: number; desc?: number } | undefined>(undefined);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const doneRef = useRef<DoneRec[]>([]);
  const idxRef = useRef(0);
  const finishedRef = useRef(false);
  const phaseRef = useRef<"trace" | "praise">("trace");
  const demoRef = useRef<Demo>({ active: false, still: false, t0: 0, spans: [], gap: 0 });
  const lifeRef = useRef<Life | null>(null);
  const lifeRafRef = useRef(0);
  const rafRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const itemsRef = useRef<Item[]>(items);
  const colorRef = useRef(color);
  const reducedRef = useRef(reduced);
  const onCompleteRef = useRef(onComplete);

  /* Mirrors, so the imperative canvas layer — which lives in stable callbacks,
     rAF frames and timers — never closes over a stale render. A layout effect
     with no dependency list, declared first: every other layout effect below
     (sizing, rebuilding the guide) runs after it and therefore reads the
     current values, and no ref is written while React is rendering. */
  useLayoutEffect(() => {
    strokesRef.current = strokes;
    doneRef.current = done;
    idxRef.current = idx;
    itemsRef.current = items;
    colorRef.current = color;
    reducedRef.current = reduced;
    onCompleteRef.current = onComplete;
    phaseRef.current = phase;
  });

  const current = items[idx];
  const space = current?.space ?? GLYPH_BOX;

  /* What a target should sound like. The tracing screen does not know which
     world it is in, so it reads the target itself: a one-character ruled glyph
     is a letter said by its name, a longer ruled glyph is a number said as a
     word ("three", never "3"), and an unruled target is a drawing, named as a
     phrase. */
  const sayTarget = useCallback((t: Item | undefined) => {
    if (!t || !canNarrate()) return;
    if (!t.ruled) sayLine(t.say);
    else if (t.say.trim().length <= 1) sayLetter(t.say);
    else sayNumber(t.say);
  }, []);
  const stripH = multi ? Math.round(Math.min(78, Math.max(48, sheet.h * 0.15))) : 0;

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  /* ── painting ─────────────────────────────────────────────────────────── */

  const paintGuide = useCallback(() => {
    const cv = guideRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const b = boxRef.current;
    const cw = cv.width / dpr;
    const ch = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (b.w < 8 || !glyphRef.current) return;

    // Penmanship rules are pinned to letter metrics — cap height, midline,
    // baseline. Those are facts about letters, so a drawing gets none of them.
    if (ruledRef.current) paintRules(ctx, b, cw, spaceRef.current.h, ruleRef.current);

    const paths = pathsRef.current;
    const gw = Math.max(4, b.w * 0.062);
    const d = demoRef.current;

    // The marks that are not the lesson. Thin and pencil-grey, so they read as
    // a different *kind* of mark from the fat crayon ghost the child is being
    // asked for — and painted before the early returns below, so the picture
    // stays whole while the guide itself comes and goes.
    for (const pts of detailPathsRef.current) {
      if (pts.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = "#6b5f52";
      ctx.lineWidth = Math.max(1.1, gw * 0.14);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // the ghost: the letter itself, in real wax, laid down faintly. Baked once
    // per target into an offscreen sheet so it can be composited at low alpha —
    // the crayon renderer sets its own alphas and cannot be dimmed in place.
    const ghost = ghostRef.current;
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = d.active || phaseRef.current === "praise" ? 0.16 : 0.4;
      ctx.drawImage(ghost, 0, 0, cw, ch);
      ctx.restore();
    }

    if (d.active) {
      // the guide writing itself, stroke by stroke, in the right direction
      const el = d.still ? Infinity : performance.now() - d.t0;
      let acc = 0;
      for (let i = 0; i < paths.length; i++) {
        const span = d.spans[i] ?? 400;
        const start = acc;
        const p = d.still ? 1 : el >= start + span ? 1 : el >= start ? (el - start) / span : 0;
        acc = start + span + d.gap;
        if (p <= 0) continue;
        drawCrayonStroke(ctx, paths[i], colorRef.current, gw * 0.9, 700 + i * 13, p);
        if (p < 1) {
          // the crayon's own tip, so the eye has something to follow
          const pts = paths[i];
          const head = pts[Math.max(0, Math.min(pts.length - 1, Math.floor(pts.length * p) - 1))];
          ctx.save();
          ctx.fillStyle = "#fffdf7";
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(head.x, head.y, gw * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = BADGE_INK;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }
      return;
    }

    // The letter is written and being praised — and possibly up on its feet.
    // The dots, numbers and arrows were instructions; they step out of the way.
    if (phaseRef.current === "praise") return;

    // resting state: the dotted trail a workbook prints, then where to start
    // and which way to go
    ctx.save();
    ctx.fillStyle = "#5f5348";
    for (const st of glyphRef.current) {
      const dots = toCanvas(densify(st, 8), b, spaceRef.current);
      for (let i = 0; i < dots.length; i++) {
        ctx.globalAlpha = i === 0 ? 0 : 0.5;
        ctx.beginPath();
        ctx.arc(dots[i].x, dots[i].y, gw * 0.115, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    const badgeR = gw * 0.5;
    const placed: Pt[] = [];
    /** How far the nearest badge already on the page is. */
    const gapAt = (q: Pt) =>
      placed.reduce((m, r) => Math.min(m, Math.hypot(q.x - r.x, q.y - r.y)), Infinity);
    for (let i = 0; i < paths.length; i++) {
      const pts = paths[i];
      if (!pts.length) continue;
      paintArrow(ctx, pts, gw * 0.62);
      let c = pts[0];
      if (ruledRef.current) {
        // D, P and R start both their strokes in the same corner. Step a badge
        // that would land on top of an earlier one along its own stroke, so the
        // order stays readable instead of one number hiding the other.
        for (const q of placed) {
          if (Math.hypot(c.x - q.x, c.y - q.y) < badgeR * 2.1) {
            const a = pts[Math.min(pts.length - 1, Math.ceil(pts.length * 0.12))];
            const dx = a.x - c.x;
            const dy = a.y - c.y;
            const d = Math.hypot(dx, dy) || 1;
            c = { x: c.x + (dx / d) * badgeR * 2.3, y: c.y + (dy / d) * badgeR * 2.3 };
          }
        }
      } else if (gapAt(c) < badgeR * 2.1) {
        // A drawing is a harder case than any letter: six marks put six numbers
        // on one small picture, and several of them genuinely start in the same
        // place — a turtle's shell and the pattern inside it both begin at the
        // top of the shell. One step aside is not enough there (it left 1 and 2
        // still overlapping), so walk along the mark itself and take the first
        // spot clear of every badge already down. Stopping at seven-tenths of
        // the way keeps the badge off its own arrowhead; if the mark is crowded
        // end to end, the roomiest spot on it beats stacking.
        let best = c;
        let bestGap = -1;
        for (let k = 0; k <= 7; k++) {
          const q = pts[Math.min(pts.length - 1, Math.round((pts.length - 1) * k * 0.1))];
          const gap = gapAt(q);
          if (gap >= badgeR * 2.1) { best = q; break; }
          if (gap > bestGap) { bestGap = gap; best = q; }
        }
        c = best;
        // Some marks are simply too short to escape along: a fish's gill lives
        // entirely inside one badge's width of the body's start, so every point
        // on it is crowded. Then step the number straight out from the badge it
        // clashes with. It ends up beside its own mark rather than on it, which
        // is all a stroke number has to do, and two readable numbers beat two
        // perfectly placed ones stacked on top of each other.
        if (gapAt(c) < badgeR * 2.1) {
          const near = placed.reduce((a, r) =>
            Math.hypot(c.x - r.x, c.y - r.y) < Math.hypot(c.x - a.x, c.y - a.y) ? r : a);
          const dx = c.x - near.x;
          const dy = c.y - near.y;
          const d = Math.hypot(dx, dy);
          // exactly coincident starts have no direction of their own — go up
          const ux = d < 0.01 ? 0 : dx / d;
          const uy = d < 0.01 ? -1 : dy / d;
          c = { x: near.x + ux * badgeR * 2.2, y: near.y + uy * badgeR * 2.2 };
        }
      }
      placed.push(c);
      paintBadge(ctx, i + 1, c, badgeR);
    }
  }, []);

  const paintInk = useCallback(() => {
    const cv = inkRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    strokesRef.current.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1));
    const live = liveRef.current;
    if (live) drawCrayonStroke(ctx, live.pts, live.color, live.size, 999);
  }, []);

  /* ── the letter comes alive ───────────────────────────────────────────── */

  /** One frame of the come-alive beat: the child's own ink, moved. Lives on the
   *  ink canvas and reads `boxRef` without ever writing to it — the source is
   *  kept in glyph space, so a resize mid-caper lands in the right place. */
  const paintLife = useCallback((now: number) => {
    const cv = inkRef.current;
    const ctx = cv?.getContext("2d");
    const L = lifeRef.current;
    const b = boxRef.current;
    if (!cv || !ctx || !L || b.w < 8) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    const k = b.w / spaceRef.current.w;
    const { w: sw, h: shh } = sheetRef.current;
    // the word strip owns the top band of the sheet: a hopping letter stops
    // short of it rather than jumping through the word it belongs to
    const top = itemsRef.current.length > 1 ? Math.min(78, Math.max(48, shh * 0.15)) : 0;
    const room = {
      x0: (0 - b.x) / k + 10,
      x1: (sw - b.x) / k - 10,
      y0: (top - b.y) / k + 10,
      y1: (shh - b.y) / k - 10,
    };
    const t = Math.max(0, Math.min(1, (now - L.t0) / L.dur));
    for (const [i, s] of L.act(L.src, { t, bb: L.bb, room }).entries()) {
      if (!s.pts.length) continue;
      drawCrayonStroke(ctx, toCanvas(s.pts, b, spaceRef.current), s.color, Math.max(1.5, s.size * k), i + 1);
    }
  }, []);

  const stopLife = useCallback(() => {
    if (lifeRafRef.current) cancelAnimationFrame(lifeRafRef.current);
    lifeRafRef.current = 0;
    if (!lifeRef.current) return;
    lifeRef.current = null;
    paintInk(); // whatever happened, the letter settles exactly where it was drawn
  }, [paintInk]);

  /** Hand the finished letter its own small personality for a beat. Called
   *  once the score is already recorded: nothing below can change it. */
  const startLife = useCallback(() => {
    const item = itemsRef.current[idxRef.current];
    const b = boxRef.current;
    if (!item || b.w < 8) return;
    const src: LifeStroke[] = strokesRef.current
      .map((s) => {
        const g = strokeToGlyph(s, b, spaceRef.current);
        return { color: g.color, size: g.size, pts: densify(g.pts, 2.4) };
      })
      .filter((s) => s.pts.length >= 2);
    if (!src.length) return;

    if (lifeRafRef.current) cancelAnimationFrame(lifeRafRef.current);
    const calm = reducedRef.current;
    lifeRef.current = {
      t0: performance.now(),
      dur: calm ? LIFE_CALM_MS : LIFE_MS,
      act: calm ? PULSE : (ACTS[item.char.toUpperCase()] ?? CHEER),
      src,
      bb: lifeBounds(src),
    };
    paintGuide(); // the dots and arrows step aside while the letter has its moment

    const step = () => {
      const L = lifeRef.current;
      if (!L) {
        lifeRafRef.current = 0;
        return;
      }
      const now = performance.now();
      if (now - L.t0 >= L.dur) {
        lifeRafRef.current = 0;
        stopLife();
        return;
      }
      paintLife(now);
      lifeRafRef.current = requestAnimationFrame(step);
    };
    lifeRafRef.current = requestAnimationFrame(step);
  }, [paintGuide, paintLife, stopLife]);

  /** Re-derive everything that depends on (target × box): paths and the ghost. */
  const rebuild = useCallback(() => {
    const item = itemsRef.current[idxRef.current];
    const b = boxRef.current;
    glyphRef.current = item?.glyph ?? null;
    spaceRef.current = item?.space ?? GLYPH_BOX;
    ruledRef.current = item?.ruled ?? true;
    ruleRef.current = item?.rule;
    if (!item || b.w < 8) {
      pathsRef.current = [];
      detailPathsRef.current = [];
      ghostRef.current = null;
      paintGuide();
      paintInk();
      return;
    }
    const sp = item.space;
    pathsRef.current = item.glyph.map((st) => toCanvas(densify(st, 2), b, sp));
    detailPathsRef.current = item.detail.map((st) => toCanvas(densify(st, 2), b, sp));

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sheetRef.current;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(w * dpr));
    off.height = Math.max(1, Math.round(h * dpr));
    const octx = off.getContext("2d");
    if (octx) {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gw = Math.max(4, b.w * 0.062);
      const tone = shade(colorRef.current, 0.34);
      pathsRef.current.forEach((pts, i) => drawCrayonStroke(octx, pts, tone, gw, 31 + i * 7));
      ghostRef.current = off;
    }
    paintGuide();
    paintInk();
  }, [paintGuide, paintInk]);

  /* ── sizing: DPR-correct, resize-aware, one rect for guide and scoring ── */

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const guide = guideRef.current;
    const ink = inkRef.current;
    if (!wrap || !guide || !ink) return;

    const fit = () => {
      // clientWidth/Height, not getBoundingClientRect: an ancestor screen
      // transition can rotate the page in 3D, and a warped rect would size the
      // sheet to the projection instead of the real box.
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      const dpr = window.devicePixelRatio || 1;
      for (const cv of [guide, ink]) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      sheetRef.current = { w, h };
      setSheet((p) => (p.w === w && p.h === h ? p : { w, h }));

      const sh = itemsRef.current.length > 1 ? Math.round(Math.min(78, Math.max(48, h * 0.15))) : 0;
      const b = fitBox(w, h, sh, itemsRef.current[idxRef.current]?.space ?? GLYPH_BOX);
      boxRef.current = b;
      setBox((p) => (sameBox(p, b) ? p : b));
      rebuild();
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
    // `space` is in here because the rect is fitted to the guide's own aspect:
    // moving from a 100×140 letter to a 100×100 drawing has to refit the sheet.
  }, [rebuild, multi, space.w, space.h]);

  /* A new letter needs new paths, a new ghost and a new set of stroke badges.
     A layout effect, so it has run before the effect below asks to animate it —
     otherwise "Show me" would replay the letter the child has just finished. */
  useLayoutEffect(() => {
    rebuild();
  }, [idx, box, rebuild]);

  /* ── stroke-order demo ────────────────────────────────────────────────── */

  const stopDemo = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    demoRef.current = { ...demoRef.current, active: false, still: false };
    setDemoing(false);
    paintGuide();
  }, [paintGuide]);

  const startDemo = useCallback(() => {
    const paths = pathsRef.current;
    if (!paths.length) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopLife(); // one animation at a time, and the guide is the important one

    if (reducedRef.current) {
      // no motion: hold the finished letter for a beat instead of drawing it
      demoRef.current = { active: true, still: true, t0: 0, spans: [], gap: 0 };
      setDemoing(true);
      paintGuide();
      after(2000, stopDemo);
      return;
    }

    const gap = 190;
    const spans = paths.map((p) => Math.min(2200, Math.max(360, pathLen(p) / 0.55)));
    demoRef.current = { active: true, still: false, t0: performance.now(), spans, gap };
    setDemoing(true);
    const total = spans.reduce((a, b) => a + b + gap, 0) + 260;
    const step = () => {
      if (!demoRef.current.active) return;
      paintGuide();
      if (performance.now() - demoRef.current.t0 >= total) {
        stopDemo();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [after, paintGuide, stopDemo, stopLife]);

  // play it once, unprompted, whenever a new letter arrives
  const shownRef = useRef(-1);
  useEffect(() => {
    if (box.w < 8 || !current) return;
    if (shownRef.current === idx) return;
    shownRef.current = idx;
    // on the next frame, not synchronously: the guide has only just been
    // rebuilt, and kicking the animation off here would cascade a render
    const kick = requestAnimationFrame(() => startDemo());
    return () => cancelAnimationFrame(kick);
  }, [idx, box.w, current, startDemo]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (lifeRafRef.current) cancelAnimationFrame(lifeRafRef.current);
      lifeRafRef.current = 0;
      lifeRef.current = null;
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      demoRef.current.active = false;
      // Forget that this target has been demonstrated. On a real unmount that
      // is moot; under StrictMode's mount → unmount → mount it is what lets the
      // stroke-order animation play again instead of being torn down unseen.
      shownRef.current = -1;
    };
  }, []);

  useEffect(() => {
    paintInk();
  }, [strokes, paintInk]);

  /* If the caller hands over a different word without remounting, start that
     word from its first letter rather than halfway through the last one. Keyed
     on the characters themselves, so a caller that rebuilds the `targets` array
     on every render does not reset the child mid-stroke. */
  const sig = items.map((i) => i.char).join("");
  const sigRef = useRef(sig);
  useEffect(() => {
    if (sigRef.current === sig) return;
    sigRef.current = sig;
    clearTimers();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopLife();
    demoRef.current.active = false;
    liveRef.current = null;
    strokesRef.current = [];
    doneRef.current = [];
    finishedRef.current = false;
    shownRef.current = -1;
    phaseRef.current = "trace";
    setDemoing(false);
    setStrokes([]);
    setDone([]);
    setResult(null);
    setPhase("trace");
    setSay("");
    setIdx(0);
  }, [sig, clearTimers, stopLife]);

  /* ── scoring and praise ───────────────────────────────────────────────── */

  /* Say each target out loud as the child arrives at it. A short beat lets the
     sheet settle and the previous sound finish; `speak` cancels anything still
     talking, so tapping ahead never stacks up a backlog. Only in the tracing
     phase — the praise moment has its own line. */
  useEffect(() => {
    if (phase !== "trace") return;
    const t = items[idx];
    if (!t) return;
    const id = window.setTimeout(() => sayTarget(t), 260);
    return () => window.clearTimeout(id);
  }, [idx, phase, items, sayTarget]);

  const advance = useCallback(() => {
    if (phaseRef.current !== "praise") return;
    phaseRef.current = "trace";
    clearTimers();
    stopLife(); // tapping Next cuts the caper short — it never holds the child up
    const next = idxRef.current + 1;
    if (next >= itemsRef.current.length) {
      // the auto-advance timer and the Next button both land here; whoever is
      // first finishes the lesson, and the other is a no-op
      if (finishedRef.current) return;
      finishedRef.current = true;
      const per = doneRef.current.map((d) => d.stars);
      const avg = per.length ? per.reduce((a, b) => a + b, 0) / per.length : 1;
      const stars = Math.max(1, Math.min(3, Math.round(avg))) as 1 | 2 | 3;
      sfxMagic();
      // The child's own ink goes out with the score: a drawing lesson makes its
      // creature out of this, never out of the guide it was shown.
      onCompleteRef.current({
        stars,
        perTarget: per,
        strokes: doneRef.current.flatMap((d) => d.strokes),
      });
      return;
    }
    liveRef.current = null;
    strokesRef.current = [];
    setStrokes([]);
    setResult(null);
    setPhase("trace");
    setIdx(next);
  }, [clearTimers, stopLife]);

  const celebrate = useCallback(
    (s: TraceScore) => {
      if (phaseRef.current === "praise") return;
      const item = itemsRef.current[idxRef.current];
      if (!item) return;
      phaseRef.current = "praise";
      clearTimers();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      demoRef.current.active = false;
      setDemoing(false);

      doneRef.current = [
        ...doneRef.current,
        {
          char: item.char,
          stars: s.stars,
          strokes: strokesRef.current.map((k) => strokeToGlyph(k, boxRef.current, spaceRef.current)),
        },
      ];
      setDone(doneRef.current);
      setResult(s);
      setPhase("praise");
      setSay(tracePraise(s, item.say));
      if (s.stars === 3) sfxHappy();
      else sfxPop();
      if ("vibrate" in navigator) navigator.vibrate(s.stars === 3 ? [18, 40, 18] : 14);
      // …and the letter they just wrote gets up and shows them who it is.
      startLife();
      after(2100, advance);
    },
    [advance, after, clearTimers, startLife],
  );

  /** Score whatever is on the page right now. */
  const grade = useCallback((): TraceScore | null => {
    const g = glyphRef.current;
    if (!g) return null;
    return scoreTrace(g, toGlyphSpace(strokesRef.current, boxRef.current, spaceRef.current));
  }, []);

  /**
   * Has every part of the letter been attempted? Overall coverage is not
   * enough to decide a letter is finished: A's two legs alone cover 91% of it,
   * so a child who pauses before the crossbar would be congratulated on an
   * upside-down V. Each guide stroke has to have been gone over separately.
   */
  const allStrokesTouched = useCallback((): boolean => {
    const g = glyphRef.current;
    if (!g) return false;
    const ink = toGlyphSpace(strokesRef.current, boxRef.current, spaceRef.current);
    if (ink.length < 4) return false;
    return g.every((st) => scoreTrace([st], ink).coverage >= 0.7);
  }, []);

  const onDone = useCallback(() => {
    const s = grade();
    const item = itemsRef.current[idxRef.current];
    if (!s || !item) return;
    if (s.empty) {
      // never a failure — just point back at the letter and show them again
      sfxTap();
      setSay(tracePraise(s, item.say));
      startDemo();
      return;
    }
    celebrate(s);
  }, [celebrate, grade, startDemo]);

  /* ── pointer: the child's finger ──────────────────────────────────────── */

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = inkRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phaseRef.current === "praise") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    clearTimers();
    if (demoRef.current.active) stopDemo();
    const b = boxRef.current;
    liveRef.current = { color, size: Math.max(3.5, b.w * 0.05), pts: [toLocal(e)] };
    setSay("");
    paintInk();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    const p = toLocal(e);
    const last = live.pts[live.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    live.pts.push(p);
    paintInk();
  };

  const onPointerUp = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    if (live.pts.length >= 2) {
      const next = [...strokesRef.current, live];
      strokesRef.current = next;
      setStrokes(next);
    } else {
      paintInk();
    }
    // A pen-lift is not the end of a letter — "A" takes three. Wait for the
    // hand to settle, then take it as finished only once every stroke of the
    // guide has been gone over. Otherwise the child keeps writing, or taps DONE.
    clearTimers();
    after(1150, () => {
      if (phaseRef.current !== "trace" || liveRef.current) return;
      if (!allStrokesTouched()) return;
      const s = grade();
      if (s && !s.empty && s.coverage >= 0.72) celebrate(s);
    });
  };

  const undo = () => {
    if (!strokesRef.current.length) return;
    clearTimers();
    const next = strokesRef.current.slice(0, -1);
    strokesRef.current = next;
    setStrokes(next);
    sfxPop();
  };

  const tryAgain = () => {
    clearTimers();
    liveRef.current = null;
    strokesRef.current = [];
    setStrokes([]);
    setSay("");
    sfxTap();
    startDemo();
  };

  /* ── the page ─────────────────────────────────────────────────────────── */

  const fibre = useMemo(() => paperTile(), []);
  /* Letters are written and drawings are drawn. Only the spoken and read-aloud
     copy changes — everything the child touches is the same screen. */
  const verb = current && !current.ruled ? "draw" : "write";
  const empty = strokes.length === 0;
  const TOOL = land ? 48 : 52;
  const last = idx >= items.length - 1;

  const sheetStyle: React.CSSProperties = {
    backgroundColor: "var(--paper-card)",
    backgroundImage: fibre ? `url("${fibre}")` : undefined,
    boxShadow: "0 10px 26px rgba(74,58,40,0.22), 0 2px 5px rgba(74,58,40,0.14)",
    borderRadius: 16,
  };

  if (!current) {
    return (
      <div className="screen ink-paper">
        <style>{TR_CSS}</style>
        <div className="tr-grid pad-x pad-t pad-b">
          <div className="tr-top">
            <InkButton
              onClick={() => { sfxTap(); onBack(); }}
              shape="ellipse"
              seed={12}
              aria-label="Back"
              className="tr-icon-btn"
              style={{ width: TOOL, height: TOOL }}
            >
              <Icon name="back" size={22} />
            </InkButton>
          </div>
          <div className="tr-head">
            <h1 className="ink-title tr-title">{title}</h1>
            <p className="ink-hand tr-sub">Nothing to write here yet.</p>
          </div>
        </div>
      </div>
    );
  }

  /* The strip must always fit: a ten-digit counting run gets smaller letters
     rather than a row the child cannot reach the end of (it takes no pointer). */
  const slotRoom = Math.max(16, (sheet.w - 18) / Math.max(1, items.length) - 3);
  const glyphH = Math.max(16, Math.min(stripH * 0.56, (slotRoom - 8) / 0.86));
  const slotW = glyphH * 0.86 + 8;
  const starPx = Math.max(6, Math.min(10, glyphH * 0.3));

  return (
    <div className={`screen ink-paper ${land ? "tr-land" : ""}`}>
      <style>{TR_CSS}</style>

      <div className="tr-grid pad-x pad-t pad-b">
        {/* ── leave · show me again ─────────────────────────────────────── */}
        <div className="tr-top">
          <InkButton
            onClick={() => { sfxTap(); onBack(); }}
            shape="ellipse"
            seed={12}
            aria-label="Back"
            className="tr-icon-btn"
            style={{ width: TOOL, height: TOOL }}
          >
            <Icon name="back" size={22} />
          </InkButton>

          {canNarrate() && (
            <InkButton
              onClick={() => { sfxTap(); sayTarget(current); }}
              shape="ellipse"
              seed={31}
              aria-label={`Hear ${current.say} again`}
              className="tr-icon-btn"
              style={{ width: TOOL, height: TOOL }}
            >
              <Icon name="soundOn" size={20} />
            </InkButton>
          )}

          <span className="tr-spacer" />

          <InkButton
            onClick={() => { sfxTap(); sayTarget(current); startDemo(); }}
            seed={64}
            radius={16}
            tone={demoing ? "#00c2b9" : undefined}
            aria-label={`Show me how to ${verb} ${current.say}`}
            className="tr-show"
          >
            <Icon
              name="play"
              size={19}
              color={demoing ? "#fffaf0" : "var(--ink)"}
              fill={demoing ? "#fffaf0" : "var(--ink)"}
            />
            <span className={demoing ? "ink-on-wax" : undefined}>Show me</span>
          </InkButton>
        </div>

        {/* ── what we're doing ──────────────────────────────────────────── */}
        <div className="tr-head">
          <h1 key={title} className="tr-head-in">
            <span className="ink-title tr-title">{title}</span>
            <Scribble color="var(--sun)" height={9} seed={7} />
          </h1>
          {subtitle && <p className="ink-hand tr-sub">{subtitle}</p>}
        </div>

        {/* ── the sheet ─────────────────────────────────────────────────── */}
        <div className="tr-sheetarea">
          <div ref={wrapRef} className="tr-sheet" style={sheetStyle}>
            <canvas ref={guideRef} className="tr-cv tr-cv-guide" aria-hidden="true" />
            <canvas
              ref={inkRef}
              className="tr-cv tr-cv-ink canvas-touch"
              role="img"
              aria-label={`Tracing area for ${current.say}. Draw over the dotted ${
                current.ruled ? "letter" : "picture"
              } with your finger.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            />

            <SheetDeco w={sheet.w} h={sheet.h} />

            <Tape seed={2} style={{ width: 72, height: 24, top: -9, left: "16%", transform: "rotate(-5deg)" }} />
            <Tape seed={4} style={{ width: 66, height: 24, top: -8, right: "14%", transform: "rotate(4deg)" }} />

            {/* ── the word building up on the page ─────────────────────── */}
            {multi && sheet.w > 40 && (
              <div className="tr-strip" style={{ height: stripH }} role="list" aria-label="Your word so far">
                {items.map((it, i) => {
                  const rec = done[i];
                  const isNow = i === idx;
                  return (
                    <div
                      key={`${it.char}-${i}`}
                      className="tr-slot"
                      role="listitem"
                      style={{ width: slotW }}
                      aria-label={
                        rec
                          ? `${it.say}, written, ${rec.stars} stars`
                          : isNow
                            ? `${it.say}, writing now`
                            : `${it.say}, coming up`
                      }
                    >
                      {rec ? (
                        <MiniGlyph
                          strokes={rec.strokes.map((s) => s.pts)}
                          h={glyphH}
                          color={rec.strokes[0]?.color ?? color}
                          weight={Math.max(5, rec.strokes[0]?.size ?? 9)}
                          space={it.space}
                        />
                      ) : (
                        <MiniGlyph
                          strokes={it.glyph}
                          h={glyphH}
                          color={isNow ? shade(color, 0.1) : "#8a7c6d"}
                          weight={isNow ? 9 : 8}
                          dashed
                          opacity={isNow ? 0.85 : 0.42}
                          space={it.space}
                        />
                      )}
                      {rec && (
                        <span className="tr-slot-stars" aria-hidden="true">
                          {Array.from({ length: rec.stars }, (_, k) => (
                            <Icon key={k} name="star" size={starPx} color="#c2740a" fill="#ffc72c" weight={1.6} />
                          ))}
                        </span>
                      )}
                      {isNow && !rec && (
                        <RoundRing w={slotW + 10} h={glyphH + 16} color="var(--coral)" seed={200 + i * 11} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── a nudge, only while the page is blank ────────────────── */}
            {empty && phase === "trace" && !demoing && (
              <div
                className="tr-hint"
                style={{ top: Math.min(box.y + box.h + 6, Math.max(0, sheet.h - 26)) }}
              >
                <Icon name="pencil" size={20} color="var(--plum)" weight={2.4} />
                <span className="ink-hand">Trace the dots with your finger</span>
              </div>
            )}

            {/* ── the payoff ───────────────────────────────────────────── */}
            {phase === "praise" && result && (
              <div className={`tr-praise ${reduced ? "" : "tr-praise-in"}`}>
                <InkCard tone="#8b46c7" seed={57} radius={18} className="tr-praise-card" contentClassName="tr-praise-in-card">
                  <div className="tr-praise-row">
                    <Stars n={result.stars} size={land ? 24 : 30} animate={!reduced} />
                    <p className="ink-on-wax tr-praise-text">{tracePraise(result, current.say)}</p>
                  </div>
                  <InkButton
                    onClick={() => { sfxTap(); advance(); }}
                    seed={83}
                    radius={14}
                    aria-label={last ? "Finish" : `Next, ${items[idx + 1]?.say ?? ""}`}
                    className="tr-next"
                  >
                    <Icon name={last ? "check" : "play"} size={18} color="var(--ink)" fill="var(--ink)" />
                    {last ? "Finish!" : "Next"}
                  </InkButton>
                </InkCard>
              </div>
            )}
          </div>
        </div>

        {/* ── the tools ─────────────────────────────────────────────────── */}
        <div className="tr-tools">
          <div className="tr-toolrow">
            <InkButton
              onClick={undo}
              disabled={empty || phase === "praise"}
              shape="ellipse"
              seed={34}
              aria-label="Undo the last line"
              className="tr-icon-btn"
              style={{ width: TOOL, height: TOOL }}
            >
              <Icon name="undo" size={22} />
            </InkButton>

            <InkButton
              onClick={tryAgain}
              disabled={empty || phase === "praise"}
              seed={46}
              radius={14}
              aria-label={`Rub out and try ${current.say} again`}
              className="tr-again"
              style={{ minHeight: TOOL }}
            >
              <Icon name="eraser" size={20} />
              <span className="tr-again-label">Try again</span>
            </InkButton>

            <InkButton
              onClick={onDone}
              disabled={phase === "praise"}
              tone={empty ? undefined : "#3aae3a"}
              seed={311}
              radius={22}
              weight={3.6}
              className={`tr-hero ${!empty && !reduced ? "tr-breathe" : ""}`}
              aria-label={`I have finished ${verb === "draw" ? "drawing" : "writing"} ${current.say}`}
            >
              <span className={empty ? "tr-hero-idle ink-hand" : "tr-hero-live ink-on-wax"}>
                <Icon
                  name={empty ? "pencil" : "check"}
                  size={empty ? 19 : 24}
                  color={empty ? "var(--ink-soft)" : "#fffaf0"}
                  weight={empty ? 2.2 : 3}
                />
                {empty ? "Trace it!" : "DONE!"}
              </span>
            </InkButton>
          </div>

          <p className="visually-hidden" aria-live="polite">
            {say}
          </p>
          <p className="visually-hidden">
            {multi
              ? `Letter ${idx + 1} of ${items.length}: ${current.say}`
              : `${verb === "draw" ? "Drawing" : "Writing"} ${current.say}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── screen-local layout ──────────────────────────────────────────────────
   Prefixed tr- so this screen owns its look without reaching into a shared
   stylesheet. Materials come from the ink kit; only layout and press feel
   live here. */

const TR_CSS = `
.tr-grid {
  display: grid;
  height: 100%;
  min-height: 0;
  gap: var(--sp-2);
  grid-template-areas: "top" "head" "sheet" "tools";
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-columns: minmax(0, 1fr);
}
.tr-top { grid-area: top; display: flex; align-items: center; gap: 6px; min-width: 0; }
.tr-spacer { flex: 1 1 auto; }
.tr-icon-btn { padding: 0 !important; flex: none; }
.tr-show { flex: none; font-size: var(--fs-xs); font-weight: 800; padding: 0.4rem 0.85rem !important; }

.tr-head { grid-area: head; min-width: 0; }
.tr-head-in { display: inline-block; max-width: 100%; animation: tr-write var(--dur-3) var(--ease-spring) both; }
.tr-title { display: block; font-size: var(--fs-xl); line-height: 1.1; overflow-wrap: anywhere; }
.tr-sub { font-size: var(--fs-xs); margin-top: 1px; overflow-wrap: anywhere; }

.tr-sheetarea { grid-area: sheet; min-height: 0; min-width: 0; padding-top: 10px; }
.tr-sheet { position: relative; width: 100%; height: 100%; }
.tr-cv { position: absolute; inset: 0; width: 100%; height: 100%; }
.tr-cv-guide { z-index: 1; pointer-events: none; }
.tr-cv-ink { z-index: 2; cursor: crosshair; }
.tr-deco { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 3; }

.tr-strip {
  position: absolute; left: 0; right: 0; top: 8px; z-index: 4;
  display: flex; align-items: flex-end; justify-content: safe center;
  gap: 3px; padding: 0 8px;
  overflow-x: auto; overflow-y: hidden;
  pointer-events: none;
  scrollbar-width: none;
}
.tr-strip::-webkit-scrollbar { display: none; }
.tr-slot {
  position: relative; flex: none;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
  gap: 2px; height: 100%;
}
.tr-slot > svg { margin: 0 auto; }
.tr-slot-stars { display: flex; gap: 1px; }
.tr-ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); pointer-events: none; }

.tr-hint {
  position: absolute; left: 8px; right: 8px; z-index: 4;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  pointer-events: none; text-align: center; opacity: 0.5;
  font-size: var(--fs-2xs);
}

.tr-praise {
  position: absolute; left: 10px; right: 10px; bottom: 12px; z-index: 6;
  display: flex; justify-content: center; pointer-events: none;
}
.tr-praise-card { pointer-events: auto; max-width: 100%; }
.tr-praise-in-card { display: grid; justify-items: center; gap: 7px; padding: 10px 14px; }
.tr-praise-row {
  display: flex; align-items: center; justify-content: center;
  flex-wrap: wrap; gap: 4px 12px; max-width: 100%;
}
.tr-praise-text { font-size: var(--fs-lg); font-weight: 800; margin: 0; }
.tr-stars { display: flex; align-items: flex-end; gap: 3px; }
.tr-next { font-size: var(--fs-xs); font-weight: 800; padding: 0.35rem 0.9rem !important; min-height: var(--tap); }
.tr-praise-in { animation: tr-pop var(--dur-3) var(--ease-spring) both; }
.tr-star-in { animation: tr-star 480ms var(--ease-spring) both; }

.tr-tools { grid-area: tools; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tr-toolrow { display: flex; align-items: stretch; gap: 6px; min-width: 0; }
.tr-again { flex: none; font-size: var(--fs-2xs); font-weight: 800; padding: 0 0.7rem !important; }
.tr-again-label { white-space: nowrap; }
.tr-hero {
  flex: 1 1 auto; min-width: 0; min-height: var(--tap-hero);
  font-family: "Baloo 2", "Nunito", ui-rounded, system-ui, sans-serif;
  font-weight: 800; font-size: var(--fs-xl);
}
.tr-hero-idle { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--fs-md); }
.tr-hero-live { display: flex; align-items: center; justify-content: center; gap: 10px; }

@keyframes tr-write { from { opacity: 0; transform: translateY(5px) rotate(-1.2deg); } to { opacity: 1; transform: none; } }
@keyframes tr-pop { from { opacity: 0; transform: translateY(14px) scale(0.94); } to { opacity: 1; transform: none; } }
@keyframes tr-star { from { opacity: 0; transform: scale(0.3) rotate(-24deg); } to { opacity: 1; transform: none; } }
@keyframes tr-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.012); } }
.tr-breathe { animation: tr-breathe 2.6s var(--ease-in-out) infinite; }

/* ── landscape phone: the writing page takes the height, tools sit beside ── */
.tr-land .tr-grid {
  grid-template-areas: "top sheet" "head sheet" "tools sheet";
  grid-template-columns: minmax(132px, 27%) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  column-gap: var(--sp-3);
  row-gap: var(--sp-2);
}
.tr-land .tr-top { flex-wrap: wrap; }
.tr-land .tr-show { font-size: var(--fs-2xs); padding: 0.3rem 0.6rem !important; }
.tr-land .tr-title { font-size: var(--fs-md); }
.tr-land .tr-sub { font-size: var(--fs-2xs); }
.tr-land .tr-sheetarea { padding-top: 2px; }
.tr-land .tr-tools { justify-content: flex-end; gap: 6px; }
.tr-land .tr-toolrow { flex-wrap: wrap; }
.tr-land .tr-again { flex: 1 1 auto; }
.tr-land .tr-hero { flex: 1 1 100%; min-height: var(--tap-lg); font-size: var(--fs-lg); }
.tr-land .tr-hero-idle { font-size: var(--fs-xs); }
.tr-land .tr-praise { bottom: 8px; }
.tr-land .tr-praise-text { font-size: var(--fs-md); }

/* ── a tablet: the same page, held closer ── */
@media (min-width: 700px) and (min-height: 620px) {
  .tr-icon-btn { width: 58px !important; height: 58px !important; }
  .tr-top { gap: 10px; }
  .tr-show { font-size: var(--fs-sm); padding: 0.5rem 1.1rem !important; }
  .tr-head { text-align: center; }
  .tr-title { font-size: var(--fs-2xl); }
  .tr-toolrow { gap: 12px; }
  .tr-again { font-size: var(--fs-xs); }
  .tr-hero { flex: 0 1 420px; margin: 0 auto; }
  .tr-sheetarea { padding-top: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .tr-head-in, .tr-praise-in, .tr-star-in { animation: none; }
  .tr-breathe { animation: none; }
}
`;
