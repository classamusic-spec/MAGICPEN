// ─── Watch it being drawn ───────────────────────────────────────────────────
// Every drawing keeps its strokes, in the order they were laid down, so the
// picture can be drawn again in front of the child who drew it. It is the
// cheapest magic in the app: no new data, no new art, just the strokes played
// back through the same crayon that made them.
//
// ── one honest limit ──
// A `Stroke` is `{color, size, pts}` — there are no timestamps. This is not a
// recording of the real drawing session and does not pretend to be: the pace is
// invented, by arc length at a steady rate. That is deliberate rather than a
// shortcut. A real session is mostly pauses — a four-year-old stops to look at
// the ceiling — and playing that back honestly would be dull. This plays back
// the *drawing*, not the afternoon.

import { useEffect, useRef } from "react";
import type { Stroke } from "@/lib/types";
import { drawCrayonStroke, normalizeStrokes, strokeLength } from "@/lib/crayon";
import { usePrefersReducedMotion } from "@/components/ink/motion";

/** Crayon travel, in normalised units a second. Tuned by eye: fast enough that
 *  a small child does not lose interest, slow enough to read as drawing. */
const SPEED = 165;
/** However long or short the drawing, the replay stays in this window. */
const MIN_S = 1.4;
const MAX_S = 6;

export default function Replay({
  strokes,
  size = 220,
  /** Bump to play again — the same value never restarts a finished replay. */
  playKey = 0,
  onDone,
  className,
}: {
  strokes: Stroke[];
  size?: number;
  playKey?: number;
  onDone?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  /* The callback is held in a ref so a parent that re-creates it inline does
     not restart the replay — but written in an effect, never during render. */
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = `${size}px`;
    cv.style.height = `${size}px`;

    /* Fit the drawing to the box once, not per frame.
       `normalizeStrokes` hands back strokes centred **on the origin** — its
       points run -w/2..+w/2 — so the picture is placed by translating to the
       middle of the canvas, not by offsetting from its top-left corner. */
    const pad = size * 0.08;
    const norm = normalizeStrokes(strokes, size - pad * 2);

    // how far the crayon travels in total, so long drawings take longer
    const lens = norm.strokes.map((s) => Math.max(1, strokeLength(s.pts)));
    const total = lens.reduce((a, b) => a + b, 0);
    const dur = Math.min(MAX_S, Math.max(MIN_S, total / SPEED));

    const paint = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      // how much crayon-travel has happened by now
      let left = total * t;
      for (let i = 0; i < norm.strokes.length; i++) {
        if (left <= 0) break;
        const s = norm.strokes[i];
        const p = Math.min(1, left / lens[i]);
        // `drawCrayonStroke`'s own `progress` argument does the draw-on — the
        // partial stroke is drawn by the crayon, not clipped after the fact
        drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1, p);
        left -= lens[i];
      }
      ctx.restore();
    };

    if (reduced || !strokes.length) {
      // no performance, just the finished picture
      paint(1);
      doneRef.current?.();
      return;
    }

    let raf = 0;
    let start = 0;
    const frame = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / (dur * 1000));
      paint(t);
      if (t < 1) raf = requestAnimationFrame(frame);
      else doneRef.current?.();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [strokes, size, playKey, reduced]);

  return <canvas ref={ref} className={className} aria-hidden="true" style={{ display: "block" }} />;
}
