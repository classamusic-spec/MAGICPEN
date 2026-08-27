// ─── The MAGIC PEN wordmark ─────────────────────────────────────────────────
// Not a webfont with coloured letters — the logo is *drawn*, stroke by stroke,
// by the same crayon engine that renders the child's artwork. Each letter is a
// skeleton of polylines laid down in wax, so the mark has real grain, real
// pressure variation and a hand that wobbles.

import { useEffect, useRef } from "react";
import { drawCrayonStroke } from "@/lib/crayon";
import { hand } from "@/lib/ink";
import { usePrefersReducedMotion } from "./motion";
import type { Pt } from "@/lib/types";

/* Letters live on a 100 × 140 grid, baseline at y=130, cap height at y=15. */
type Skeleton = Pt[][];

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 14, squash = 1): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash });
  }
  return out;
};

const LETTERS: Record<string, Skeleton> = {
  M: [[{ x: 10, y: 130 }, { x: 15, y: 16 }, { x: 47, y: 86 }, { x: 79, y: 16 }, { x: 84, y: 130 }]],
  A: [
    [{ x: 6, y: 130 }, { x: 46, y: 16 }, { x: 88, y: 130 }],
    [{ x: 24, y: 92 }, { x: 70, y: 90 }],
  ],
  // C and G share the same open bowl; G then gets its bar and hook
  C: [arc(50, 73, 42, -0.35 * Math.PI, -1.66 * Math.PI, 22, 1.34)],
  G: [
    arc(50, 73, 42, -0.35 * Math.PI, -1.66 * Math.PI, 22, 1.34),
    [{ x: 63, y: 122 }, { x: 90, y: 108 }, { x: 90, y: 76 }],
    [{ x: 90, y: 78 }, { x: 58, y: 76 }],
  ],
  I: [[{ x: 22, y: 16 }, { x: 24, y: 130 }]],
  P: [
    [{ x: 16, y: 130 }, { x: 13, y: 17 }],
    [{ x: 13, y: 19 }, { x: 58, y: 23 }, { x: 71, y: 47 }, { x: 56, y: 71 }, { x: 15, y: 75 }],
  ],
  E: [
    [{ x: 18, y: 17 }, { x: 15, y: 130 }],
    [{ x: 15, y: 18 }, { x: 78, y: 21 }],
    [{ x: 16, y: 73 }, { x: 62, y: 71 }],
    [{ x: 15, y: 128 }, { x: 80, y: 126 }],
  ],
  N: [[{ x: 10, y: 130 }, { x: 13, y: 16 }, { x: 81, y: 128 }, { x: 84, y: 16 }]],
};

/** Each letter carries its own advance — a fixed pitch collides M and gaps I. */
const WIDTH: Record<string, number> = {
  M: 96, A: 96, G: 102, I: 46, C: 94, P: 82, E: 88, N: 96,
};

const WORD = "MAGIC PEN";
const COLORS: Record<number, string> = {
  0: "#e63b2e", 1: "#ff7a1a", 2: "#ffc72c", 3: "#3aae3a", 4: "#2f6fe4",
  6: "#8b46c7", 7: "#fb66e5", 8: "#00c2b9",
};

const TRACK = 14;    // letter spacing
const SPACE = 46;    // width of the word space
const PAD = 26;      // room for the wax to spill past the skeleton

/** Lay the word out left to right, advancing by each letter's own width. */
function layout(): { x: number; ch: string; i: number; w: number }[] {
  const out: { x: number; ch: string; i: number; w: number }[] = [];
  let x = PAD;
  for (let i = 0; i < WORD.length; i++) {
    const ch = WORD[i];
    if (ch === " ") { x += SPACE; continue; }
    const w = WIDTH[ch] ?? 90;
    out.push({ x, ch, i, w });
    x += w + TRACK;
  }
  return out;
}
const PLACED = layout();
const LAST = PLACED[PLACED.length - 1];
const LOGO_W = LAST.x + LAST.w + PAD;
const LOGO_H = 140 + PAD * 2;

export interface WordmarkProps {
  /** Rendered width in CSS px. Height follows the mark's aspect ratio. */
  width?: number;
  /** Draw the letters on over this many ms. 0 paints the finished mark. */
  drawIn?: number;
  className?: string;
}

/**
 * The wordmark. When `drawIn` is set the letters draw themselves in sequence,
 * the way a child would write it.
 */
export function Wordmark({ width = 280, drawIn = 0, className = "" }: WordmarkProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const h = (width * LOGO_H) / LOGO_W;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(h * dpr);
    /* width only — height comes from the aspect-ratio below, so when a narrow
       screen clamps the width the mark scales instead of squashing */
    cv.style.width = `${width}px`;
    const k = width / LOGO_W;

    /** Paint the word with each letter revealed to `progress` (0..1 overall). */
    const paint = (progress: number) => {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, LOGO_W, LOGO_H);
      const n = PLACED.length;
      PLACED.forEach((slot, idx) => {
        const skel = LETTERS[slot.ch];
        if (!skel) return;
        // each letter gets its own slice of the timeline, with a little overlap
        const start = (idx / n) * 0.82;
        const p = progress >= 1 ? 1 : Math.max(0, Math.min(1, (progress - start) / (1 / n)));
        if (p <= 0) return;
        const r = hand(slot.i * 37 + 5);
        const tilt = (r() - 0.5) * 0.09;      // every letter sits a bit crooked
        const dy = (r() - 0.5) * 7;
        const color = COLORS[slot.i] ?? "#2d2926";
        ctx.save();
        ctx.translate(slot.x + slot.w / 2, PAD + 70 + dy);
        ctx.rotate(tilt);
        ctx.translate(-(slot.x + slot.w / 2), -(PAD + 70));
        // strokes within a letter reveal in order too
        const total = skel.length;
        skel.forEach((stroke, si) => {
          const sStart = si / total;
          const sp = Math.max(0, Math.min(1, (p - sStart) * total));
          if (sp <= 0) return;
          const pts = stroke.map((q) => ({ x: q.x + slot.x, y: q.y + PAD }));
          drawCrayonStroke(ctx, pts, color, 17, slot.i * 13 + si * 7 + 3, sp);
        });
        ctx.restore();
      });
    };

    if (!drawIn || reduced) { paint(1); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / drawIn);
      paint(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, drawIn, reduced]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Magic Pen"
      className={className}
      style={{ display: "block", maxWidth: "100%", height: "auto", aspectRatio: `${LOGO_W} / ${LOGO_H}` }}
    />
  );
}

export const WORDMARK_RATIO = LOGO_W / LOGO_H;
