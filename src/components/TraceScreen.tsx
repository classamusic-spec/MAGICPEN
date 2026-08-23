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
import { ALL_GLYPHS, DIGIT_GLYPHS, GLYPH_BOX, densify, type Glyph } from "@/lib/glyphs";
import { scoreTrace, toGlyphSpace, tracePraise, type TraceScore } from "@/lib/tracing";
import { hand, paperTile, roughEllipse, roughRect, shade, waxTile } from "@/lib/ink";
import { sfxHappy, sfxMagic, sfxPop, sfxTap } from "@/lib/audio";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { usePrefersReducedMotion } from "@/components/ink/motion";

/* ── contract ────────────────────────────────────────────────────────────── */

export interface TraceTarget {
  /** The character to trace, e.g. "A" or "7". */
  char: string;
  /** Spoken/label form, e.g. "A" or "seven". Used in praise copy. */
  say?: string;
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
  onComplete: (result: { stars: 1 | 2 | 3; perTarget: number[] }) => void;
}

/* ── geometry ────────────────────────────────────────────────────────────── */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Glyph space → canvas pixels. The exact inverse of `toGlyphSpace`. */
function toCanvas(pts: Pt[], box: Box): Pt[] {
  const kx = box.w / GLYPH_BOX.w;
  const ky = box.h / GLYPH_BOX.h;
  return pts.map((p) => ({ x: box.x + p.x * kx, y: box.y + p.y * ky }));
}

/** Canvas pixels → glyph space, for the strokes we keep after a target is done. */
function strokeToGlyph(s: Stroke, box: Box): Stroke {
  const kx = GLYPH_BOX.w / box.w;
  const ky = GLYPH_BOX.h / box.h;
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
 * The one rect everything hangs off. Fits the glyph's 100×140 aspect inside
 * whatever the sheet has left over once the word strip has taken its band.
 */
function fitBox(w: number, h: number, stripH: number): Box {
  const padX = Math.max(14, w * 0.07);
  const top = stripH + Math.max(12, h * 0.045);
  const bot = Math.max(14, h * 0.07);
  const aw = Math.max(1, w - padX * 2);
  const ah = Math.max(1, h - top - bot);
  const s = Math.min(aw / GLYPH_BOX.w, ah / GLYPH_BOX.h);
  const bw = GLYPH_BOX.w * s;
  const bh = GLYPH_BOX.h * s;
  return { x: padX + (aw - bw) / 2, y: top + (ah - bh) / 2, w: bw, h: bh };
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/* ── the paper ───────────────────────────────────────────────────────────── */

const RULE = "#8fb2cf";       // the pale blue a workbook rules its lines in
const BADGE_INK = "#7b4fb0";  // the teacher's pen: stroke numbers and arrows

/** The deckled edge and spiral binding — the page is torn from a sketchbook. */
function SheetDeco({ w, h }: { w: number; h: number }) {
  const uid = useId().replace(/:/g, "");
  const deckle = useMemo(
    () => (w > 20 && h > 20 ? roughRect(w - 8, h - 8, { seed: 41, wobble: 3.6, radius: 16 }) : ""),
    [w, h],
  );
  const rings = useMemo(() => {
    const n = Math.max(4, Math.floor((w - 30) / 42));
    const r = hand(19);
    return Array.from({ length: n }, (_, i) => ({
      x: 22 + ((w - 44) * i) / Math.max(1, n - 1),
      j: (r() - 0.5) * 1.6,
    }));
  }, [w]);

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
      {rings.map((k, i) => (
        <g key={i}>
          <ellipse cx={k.x + k.j} cy="15" rx="5" ry="4.2" fill="#e3d2b6" />
          <path
            d={`M${k.x + k.j - 4.6} 15.6 Q${k.x + k.j} 11.6 ${k.x + k.j + 4.6} 14.6`}
            fill="none"
            stroke="#b9a382"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d={`M${k.x + k.j - 7} 20 C${k.x + k.j - 9.5} -1 ${k.x + k.j + 9.5} -3 ${k.x + k.j + 6.6} 17`}
            fill="none"
            stroke="#8d949c"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d={`M${k.x + k.j - 7.8} 19 C${k.x + k.j - 10} -1.6 ${k.x + k.j + 8.6} -3.6 ${k.x + k.j + 5.8} 16`}
            fill="none"
            stroke="#dfe3e7"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </g>
      ))}
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
}: {
  strokes: Pt[][];
  h: number;
  color: string;
  weight: number;
  dashed?: boolean;
  opacity?: number;
}) {
  const w = (h * GLYPH_BOX.w) / GLYPH_BOX.h;
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${GLYPH_BOX.w} ${GLYPH_BOX.h}`}
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
function paintRules(ctx: CanvasRenderingContext2D, box: Box, sheetW: number) {
  const ky = box.h / GLYPH_BOX.h;
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
  line(15, true, 0.45, 1.6);   // cap height
  line(72, true, 0.3, 1.4);    // the midline you keep the humps under
  line(130, false, 0.6, 2.2);  // the baseline you sit letters on
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
  glyph: Glyph;
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

export default function TraceScreen({
  targets,
  title,
  subtitle,
  color = "#2f6fe4",
  onBack,
  onComplete,
}: TraceScreenProps): JSX.Element {
  /* Characters with no skeleton (spaces, "+", punctuation) are not traceable,
     so they never become a step. */
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of targets) {
      const ch = t.char.toUpperCase();
      const g = ALL_GLYPHS[ch];
      if (g) out.push({ char: ch, say: t.say ?? ch, glyph: g });
    }
    return out;
  }, [targets]);

  const multi = items.length > 1;
  const land = useLandscapeRail();
  const reduced = usePrefersReducedMotion();

  const [idx, setIdx] = useState(0);
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
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const doneRef = useRef<DoneRec[]>([]);
  const idxRef = useRef(0);
  const finishedRef = useRef(false);
  const phaseRef = useRef<"trace" | "praise">("trace");
  const demoRef = useRef<Demo>({ active: false, still: false, t0: 0, spans: [], gap: 0 });
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

    paintRules(ctx, b, cw);

    const paths = pathsRef.current;
    const gw = Math.max(7, b.w * 0.115);
    const d = demoRef.current;

    // the ghost: the letter itself, in real wax, laid down faintly. Baked once
    // per target into an offscreen sheet so it can be composited at low alpha —
    // the crayon renderer sets its own alphas and cannot be dimmed in place.
    const ghost = ghostRef.current;
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = d.active ? 0.16 : 0.4;
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

    // resting state: the dotted trail a workbook prints, then where to start
    // and which way to go
    ctx.save();
    ctx.fillStyle = "#5f5348";
    for (const st of glyphRef.current) {
      const dots = toCanvas(densify(st, 8), b);
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
    for (let i = 0; i < paths.length; i++) {
      const pts = paths[i];
      if (!pts.length) continue;
      paintArrow(ctx, pts, gw * 0.62);
      // D, P and R start both their strokes in the same corner. Step a badge
      // that would land on top of an earlier one along its own stroke, so the
      // order stays readable instead of one number hiding the other.
      let c = pts[0];
      for (const q of placed) {
        if (Math.hypot(c.x - q.x, c.y - q.y) < badgeR * 2.1) {
          const a = pts[Math.min(pts.length - 1, Math.ceil(pts.length * 0.12))];
          const dx = a.x - c.x;
          const dy = a.y - c.y;
          const d = Math.hypot(dx, dy) || 1;
          c = { x: c.x + (dx / d) * badgeR * 2.3, y: c.y + (dy / d) * badgeR * 2.3 };
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

  /** Re-derive everything that depends on (target × box): paths and the ghost. */
  const rebuild = useCallback(() => {
    const item = itemsRef.current[idxRef.current];
    const b = boxRef.current;
    glyphRef.current = item?.glyph ?? null;
    if (!item || b.w < 8) {
      pathsRef.current = [];
      ghostRef.current = null;
      paintGuide();
      paintInk();
      return;
    }
    pathsRef.current = item.glyph.map((st) => toCanvas(densify(st, 2), b));

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sheetRef.current;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(w * dpr));
    off.height = Math.max(1, Math.round(h * dpr));
    const octx = off.getContext("2d");
    if (octx) {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gw = Math.max(7, b.w * 0.115);
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
      const b = fitBox(w, h, sh);
      boxRef.current = b;
      setBox((p) => (sameBox(p, b) ? p : b));
      rebuild();
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [rebuild, multi]);

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
  }, [after, paintGuide, stopDemo]);

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
  }, [sig, clearTimers]);

  /* ── scoring and praise ───────────────────────────────────────────────── */

  const advance = useCallback(() => {
    if (phaseRef.current !== "praise") return;
    phaseRef.current = "trace";
    clearTimers();
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
      onCompleteRef.current({ stars, perTarget: per });
      return;
    }
    liveRef.current = null;
    strokesRef.current = [];
    setStrokes([]);
    setResult(null);
    setPhase("trace");
    setIdx(next);
  }, [clearTimers]);

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
          strokes: strokesRef.current.map((k) => strokeToGlyph(k, boxRef.current)),
        },
      ];
      setDone(doneRef.current);
      setResult(s);
      setPhase("praise");
      setSay(tracePraise(s, item.say));
      if (s.stars === 3) sfxHappy();
      else sfxPop();
      if ("vibrate" in navigator) navigator.vibrate(s.stars === 3 ? [18, 40, 18] : 14);
      after(2100, advance);
    },
    [advance, after, clearTimers],
  );

  /** Score whatever is on the page right now. */
  const grade = useCallback((): TraceScore | null => {
    const g = glyphRef.current;
    if (!g) return null;
    return scoreTrace(g, toGlyphSpace(strokesRef.current, boxRef.current));
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
    const ink = toGlyphSpace(strokesRef.current, boxRef.current);
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
    liveRef.current = { color, size: Math.max(6, b.w * 0.085), pts: [toLocal(e)] };
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

          <span className="tr-spacer" />

          <InkButton
            onClick={() => { sfxTap(); startDemo(); }}
            seed={64}
            radius={16}
            tone={demoing ? "#00c2b9" : undefined}
            aria-label={`Show me how to write ${current.say}`}
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
              aria-label={`Tracing area for ${current.say}. Draw over the dotted letter with your finger.`}
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
                        />
                      ) : (
                        <MiniGlyph
                          strokes={it.glyph}
                          h={glyphH}
                          color={isNow ? shade(color, 0.1) : "#8a7c6d"}
                          weight={isNow ? 9 : 8}
                          dashed
                          opacity={isNow ? 0.85 : 0.42}
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
              aria-label={`I have finished writing ${current.say}`}
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
            {multi ? `Letter ${idx + 1} of ${items.length}: ${current.say}` : `Writing ${current.say}`}
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
