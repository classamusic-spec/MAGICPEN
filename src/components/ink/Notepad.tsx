// ─── The notepad: the surface the whole app is written on ───────────────────
// Magic Pen has always *said* it lives in a sketchbook, but only the tracing
// screen ever looked like one — it had a real spiral binding at the top and a
// torn deckle edge, built inline and reachable by nothing else. This promotes
// that surface into the app's shared material, so every page a child turns is
// the same physical pad.
//
// Two pieces, on purpose:
//
//   `SpiralBinding` is only the metal — the rings and the wire loops — drawn to
//   whatever width it is given. It is separate because a page is not always the
//   thing being bound: a full-bleed world scene wants the coil across the top of
//   the *screen*, not around a card.
//
//   `NotepadPage` is a whole sheet: the coil, the torn edge, the paper. It
//   measures itself, so callers hand it children and nothing else.
//
// Everything here is drawn — wobbled paths from the app's own ink engine, no
// gradients pretending to be metal, no images. It is the same hand as the rest
// of the product.

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { hand, roughRect } from "@/lib/ink";

/* ── measure ─────────────────────────────────────────────────────────────────
   The same approach the ink kit uses, and for the same reason: `offsetWidth`
   rather than `getBoundingClientRect`, because the rect is warped by any
   ancestor transform — and a page mid-flip is *always* under a transform. A
   rect-based measure would draw the coil at the wrong size for the whole
   animation. */
function useMeasure<T extends HTMLElement>() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.offsetWidth / 2) * 2;
      const h = Math.round(el.offsetHeight / 2) * 2;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    roRef.current = ro;
  }, []);
  return [measureRef, box] as const;
}

/** How tall the metal is, in px. The rings hang below the paper's top edge. */
export const COIL_H = 26;

/** Roughly one ring per this many px of width — a real pad's spacing. */
const RING_PITCH = 42;

/* ── the metal ───────────────────────────────────────────────────────────── */

/**
 * The spiral binding alone: punched holes with wire loops through them.
 *
 * `w` is the width to span. Ring count follows it, so a phone gets fewer, wider
 * loops and a tablet gets more — the pitch stays constant, which is what makes
 * it read as a real pad rather than a stretched graphic.
 *
 * `seed` shifts the tiny per-ring jitter, so two pads on screen at once are not
 * identical twins.
 */
export function SpiralBinding({
  w, seed = 19, className, style,
}: {
  w: number;
  seed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rings = useMemo(() => {
    if (w < 40) return [];
    const n = Math.max(3, Math.floor((w - 30) / RING_PITCH));
    const r = hand(seed);
    return Array.from({ length: n }, (_, i) => ({
      x: 22 + ((w - 44) * i) / Math.max(1, n - 1),
      j: (r() - 0.5) * 1.6,
    }));
  }, [w, seed]);

  if (!rings.length) return null;

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={COIL_H}
      viewBox={`0 0 ${w} ${COIL_H}`}
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      {rings.map((k, i) => {
        const cx = k.x + k.j;
        return (
          <g key={i}>
            {/* the punched hole, seen through the paper */}
            <ellipse cx={cx} cy={15} rx={5} ry={4.2} fill="#e3d2b6" />
            <path
              d={`M${cx - 4.6} 15.6 Q${cx} 11.6 ${cx + 4.6} 14.6`}
              fill="none" stroke="#b9a382" strokeWidth={1.4} strokeLinecap="round"
            />
            {/* the wire: a dark pass for the metal, a light one for the shine */}
            <path
              d={`M${cx - 7} 20 C${cx - 9.5} -1 ${cx + 9.5} -3 ${cx + 6.6} 17`}
              fill="none" stroke="#8d949c" strokeWidth={3.6} strokeLinecap="round"
            />
            <path
              d={`M${cx - 7.8} 19 C${cx - 10} -1.6 ${cx + 8.6} -3.6 ${cx + 5.8} 16`}
              fill="none" stroke="#dfe3e7" strokeWidth={1.3} strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** The coil pinned across the top of whatever contains it, full width. */
export function TopBinding({ seed = 19 }: { seed?: number }) {
  const [ref, box] = useMeasure<HTMLDivElement>();
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0"
      style={{ top: -4, zIndex: 5 }}
    >
      {box.w > 0 && <SpiralBinding w={box.w} seed={seed} />}
    </div>
  );
}

/* ── a whole sheet ───────────────────────────────────────────────────────── */

/**
 * One page of the pad: torn edge, paper, and the coil across the top.
 *
 * The page is a real drawn rectangle rather than a `border-radius`, so its edge
 * wobbles the way a sheet torn out of a pad does. Content is padded clear of
 * the binding automatically — a caller should never have to know how tall the
 * metal is.
 */
export function NotepadPage({
  children, seed = 41, className, contentClassName, style, coil = true,
}: {
  children: React.ReactNode;
  seed?: number;
  /** Classes for the page itself (size, position). */
  className?: string;
  /** Classes for the content box inside the paper — layout goes here. */
  contentClassName?: string;
  style?: React.CSSProperties;
  /** Set false for a loose sheet that was torn out and is no longer bound. */
  coil?: boolean;
}) {
  const [ref, box] = useMeasure<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const edge = useMemo(
    () => (box.w > 24 && box.h > 24 ? roughRect(box.w - 8, box.h - 8, { seed, wobble: 3.6, radius: 16 }) : ""),
    [box.w, box.h, seed],
  );

  return (
    <div ref={ref} className={`relative ${className ?? ""}`} style={style}>
      {edge && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width={box.w}
          height={box.h}
          viewBox={`0 0 ${box.w} ${box.h}`}
          style={{ overflow: "visible" }}
        >
          <defs>
            <clipPath id={`np-${uid}`}>
              <path d={edge} transform="translate(4 4)" />
            </clipPath>
          </defs>
          {/* the paper itself, clipped to the torn edge */}
          <g clipPath={`url(#np-${uid})`}>
            <rect x={0} y={0} width={box.w} height={box.h} fill="var(--card, #fffaf0)" />
            <rect
              x={0} y={0} width={box.w} height={box.h}
              fill="var(--paper-fibre-fill, transparent)" opacity={0.6}
            />
          </g>
          {/* two passes of ink: a pen gone over the edge twice */}
          <g transform="translate(4 4)">
            <path d={edge} fill="none" stroke="var(--ink)" strokeWidth={2.6} strokeLinejoin="round" opacity={0.9} />
            <path
              d={edge} fill="none" stroke="var(--ink)" strokeWidth={1.2}
              strokeLinejoin="round" opacity={0.45} transform="translate(1 1.2)"
            />
          </g>
        </svg>
      )}

      {coil && box.w > 0 && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: -6, zIndex: 5 }}>
          <SpiralBinding w={box.w} seed={seed + 7} />
        </div>
      )}

      {/* clear of the metal, always */}
      <div className={`relative ${contentClassName ?? ""}`} style={{ paddingTop: coil ? COIL_H - 4 : undefined, zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
