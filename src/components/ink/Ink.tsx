// ─── Ink kit: drawn surfaces, drawn controls ────────────────────────────────
// Every surface in MAGIC PEN is a piece of paper with a hand-inked outline and
// a wax fill. These primitives replace the rounded-rect-with-a-3px-border that
// every other kids' app ships.

import { useCallback, useId, useRef, useState } from "react";
import { roughEllipse, roughRect, roughUnderline, seedOf, waxTile, type RoughOpts } from "@/lib/ink";

/* ── measure: the drawn path has to match the real pixel box ─────────────── */

function useMeasure<T extends HTMLElement>() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);

  // A callback ref rather than an object ref, so callers can compose their own
  // ref onto the same element without anyone mutating anyone else's.
  const measureRef = useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const read = () => {
      // offsetWidth/Height, not getBoundingClientRect: the rect is warped by
      // any ancestor transform (cards sit inside rotated "taped in" wrappers),
      // which would draw the outline at the wrong size and offset.
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

/* ── the drawn shape behind any control or card ──────────────────────────── */

export type InkFill =
  | { kind: "wax"; color: string }
  | { kind: "paper" }
  | { kind: "none" };

interface InkShapeProps extends RoughOpts {
  w: number;
  h: number;
  shape?: "rect" | "ellipse";
  fill?: InkFill;
  /** Ink colour for the outline. */
  ink?: string;
  /** Stroke weight of the outline. */
  weight?: number;
  /** Second, offset pass — a pen gone over the line twice. */
  double?: boolean;
  /** Soft drop shadow beneath the paper. */
  lifted?: boolean;
  className?: string;
}

/**
 * The drawn shape itself, as an absolutely-positioned SVG. Rendered behind
 * content so labels and icons sit on top of the wax.
 */
export function InkShape({
  w, h, shape = "rect", fill = { kind: "paper" }, ink = "#2d2926",
  weight = 3, double = true, lifted = true, seed = 7, wobble, radius, className,
}: InkShapeProps) {
  const uid = useId().replace(/:/g, "");
  if (w < 2 || h < 2) return null;
  const d = shape === "ellipse"
    ? roughEllipse(w, h, { seed, wobble, radius })
    : roughRect(w, h, { seed, wobble, radius });
  // the second pass is drawn from a different seed so it diverges like a real hand
  const d2 = shape === "ellipse"
    ? roughEllipse(w, h, { seed: seed + 91, wobble, radius })
    : roughRect(w, h, { seed: seed + 91, wobble, radius });
  const waxUrl = fill.kind === "wax" ? waxTile(fill.color) : "";

  return (
    <svg
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className ?? ""}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        {fill.kind === "wax" && waxUrl && (
          /* 96px, the tile's own logical size (it is baked 2× and downsampled
             — see waxTile). The slight rotation keeps the repeat from lining
             up with the button's edges, so a wide button reads as one field
             of wax instead of wallpaper. */
          <pattern id={`wax-${uid}`} patternUnits="userSpaceOnUse" width="96" height="96" patternTransform="rotate(-4)">
            <image href={waxUrl} width="96" height="96" />
          </pattern>
        )}
        {lifted && (
          <filter id={`lift-${uid}`} x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy={Math.max(2, h * 0.035)} stdDeviation={Math.max(2.5, h * 0.05)} floodColor="#4a3a28" floodOpacity="0.26" />
          </filter>
        )}
      </defs>

      {fill.kind !== "none" && (
        <path
          d={d}
          fill={fill.kind === "wax" && waxUrl ? `url(#wax-${uid})` : "#fffdf7"}
          filter={lifted ? `url(#lift-${uid})` : undefined}
        />
      )}

      {/* the ink: a firm pass, then a lighter wandering second pass */}
      <path d={d} fill="none" stroke={ink} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
      {double && (
        <path
          d={d2}
          fill="none"
          stroke={ink}
          strokeWidth={weight * 0.62}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
          transform="translate(0.9 1.1)"
        />
      )}
    </svg>
  );
}

/* ── controls ────────────────────────────────────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export interface InkButtonProps extends ButtonProps {
  /** Forwarded to the underlying <button>, alongside the internal measure ref. */
  ref?: React.Ref<HTMLButtonElement>;
  /** Wax colour. Omit for a plain paper button. */
  tone?: string;
  shape?: "rect" | "ellipse";
  /** Text colour for the label. */
  labelColor?: string;
  weight?: number;
  seed?: number;
  radius?: number;
}

/**
 * A pressable drawn button. Presses *into* the paper rather than translating a
 * hard shadow — paper compresses, it doesn't slide.
 */
export function InkButton({
  tone, shape = "rect", labelColor, weight = 3.2, seed, radius,
  ref: forwarded, className = "", style, children, ...rest
}: InkButtonProps) {
  const [measureRef, box] = useMeasure<HTMLButtonElement>();
  const label = typeof children === "string" ? children : "";
  const s = seed ?? (label ? seedOf(label) : 7);
  // the shape needs the element to measure it; callers may want it too.
  // Memoised: a fresh ref callback every render makes React detach and
  // reattach it, tearing down the ResizeObserver on every parent re-render.
  const attach = useCallback((el: HTMLButtonElement | null) => {
    measureRef(el);
    if (typeof forwarded === "function") forwarded(el);
    else if (forwarded) forwarded.current = el;
  }, [measureRef, forwarded]);
  return (
    <button
      ref={attach}
      className={`ink-btn relative isolate ${className}`}
      style={{ color: labelColor ?? (tone ? "#fffaf0" : "var(--ink)"), ...style }}
      {...rest}
    >
      <InkShape
        w={box.w}
        h={box.h}
        shape={shape}
        seed={s}
        radius={radius}
        weight={weight}
        fill={tone ? { kind: "wax", color: tone } : { kind: "paper" }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2 w-full h-full">
        {children}
      </span>
    </button>
  );
}

export interface InkCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Classes for the *content* wrapper. Reach for this whenever the card needs
   * to lay its children out (grid, flex, text-align): `className` styles the
   * outer box, whose only child is the wrapper, so a grid set there sizes the
   * wrapper rather than the children.
   */
  contentClassName?: string;
  tone?: string;
  shape?: "rect" | "ellipse";
  weight?: number;
  seed?: number;
  radius?: number;
  lifted?: boolean;
}

/**
 * A sheet of paper with a drawn edge — the container for everything.
 *
 * The drawn outline is an SVG sized to the outer box, so children live in a
 * wrapper stacked above it. That wrapper is the card's only direct child:
 * layout classes belong on `contentClassName`, not `className`.
 */
export function InkCard({
  tone, shape = "rect", weight = 3, seed = 21, radius, lifted = true,
  className = "", contentClassName = "", children, ...rest
}: InkCardProps) {
  const [measureRef, box] = useMeasure<HTMLDivElement>();
  return (
    <div ref={measureRef} className={`relative isolate ${className}`} {...rest}>
      <InkShape
        w={box.w}
        h={box.h}
        shape={shape}
        seed={seed}
        radius={radius}
        weight={weight}
        lifted={lifted}
        fill={tone ? { kind: "wax", color: tone } : { kind: "paper" }}
      />
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}

/* ── washi tape: how artwork gets stuck into the book ─────────────────────── */

const TAPE_TONES = ["#ffd98e", "#a8e6f0", "#ffc0d9", "#c9e8a8", "#dcc9f5"];

/** A torn strip of washi tape. Purely decorative. */
export function Tape({
  seed = 1, className = "", style,
}: { seed?: number; className?: string; style?: React.CSSProperties }) {
  const tone = TAPE_TONES[seed % TAPE_TONES.length];
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${className}`}
      style={{
        background: tone,
        opacity: 0.85,
        // torn short edges, straight long edges — exactly how tape rips
        clipPath:
          "polygon(0% 6%, 8% 0%, 20% 7%, 34% 1%, 48% 8%, 62% 2%, 76% 9%, 88% 3%, 100% 8%, 100% 92%, 90% 100%, 77% 93%, 63% 99%, 49% 92%, 35% 98%, 21% 91%, 9% 99%, 0% 93%)",
        boxShadow: "0 1px 3px rgba(74,58,40,0.22)",
        zIndex: 20,
        ...style,
      }}
    />
  );
}

/* ── a hand-scribbled underline, for titles ──────────────────────────────── */

export function Scribble({
  color = "var(--sun)", height = 12, seed = 3, className = "",
}: { color?: string; height?: number; seed?: number; className?: string }) {
  const [measureRef, box] = useMeasure<HTMLSpanElement>();
  return (
    <span ref={measureRef} aria-hidden="true" className={`block w-full ${className}`} style={{ height }}>
      {box.w > 2 && (
        <svg width={box.w} height={height} viewBox={`0 0 ${box.w} ${height}`} style={{ overflow: "visible" }}>
          <path
            d={roughUnderlineMemo(box.w, height, seed)}
            fill="none"
            stroke={color}
            strokeWidth={height * 0.55}
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

// tiny memo so a re-render doesn't rebuild the same squiggle
const underlineCache = new Map<string, string>();
function roughUnderlineMemo(w: number, h: number, seed: number): string {
  const k = `${w}:${h}:${seed}`;
  let hit = underlineCache.get(k);
  if (!hit) {
    hit = roughUnderline(w, h, seed);
    underlineCache.set(k, hit);
  }
  return hit;
}

