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
//
// ── what makes a coil read as metal ─────────────────────────────────────────
// The one observation that does more than all the shading in the world: the
// wire goes *through* the paper. Half of every loop is in front of the sheet
// and half is behind it, and the sheet's own edge is what cuts between them.
// So the binding is drawn in two halves — `part="back"` and `part="front"` —
// with the paper painted in between (see `NotepadPage`). Everything else here
// is in service of that: the hole is a hole with a lifted, shadowed inner edge
// rather than a printed dot; you can see the far leg of the wire through it;
// the near leg drops a shadow on the sheet where it touches; and no two rings
// were bent by the same hand.

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
export const COIL_H = 34;

/** Roughly one ring per this many px of width — a real pad's spacing. */
const RING_PITCH = 42;

/* ── the coil's own coordinate space ─────────────────────────────────────────
   Two landmarks the whole drawing hangs off. `PAPER_Y` is where the sheet's
   top edge crosses the binding: above it the wire is in the open, below it the
   far half is hidden and the near half lies on the paper. `HOLE_Y` is far
   enough below that a full hole's worth of paper sits between them, the way a
   real punch is set back from the edge.

   `PAPER_Y` is generous on purpose. Once the far leg is cut off at the sheet,
   only the part above the edge is left to carry the loop's shape — give it too
   little and the arch goes square and the whole ring reads as a bracket. */
const PAPER_Y = 16;
const HOLE_Y = 24.2;
const HOLE_RX = 6;
const HOLE_RY = 4.7;

/** Where a page must sit the coil so `PAPER_Y` lands on its drawn top edge. */
const COIL_TOP = -(PAPER_Y - 4);

/* ── the palette ─────────────────────────────────────────────────────────────
   Metal is metal — it does not take the page's ink colour — so these are fixed
   greys, kept to one ramp so every ring is lit from the same corner. The warm
   tones are the paper's, and sit on top of `--paper-card`. */
const WIRE_BASE = "#767e88";   // the wire's own dark, and its outline
const WIRE_BODY = "#a9b0b9";   // the lit face of the cylinder
const WIRE_SHINE = "#f1f4f7";  // the specular run down its upper-left
const WIRE_SUNK = "#5b626b";   // the far leg, glimpsed through the punched hole
const HOLE_FLOOR = "#e3d2b6";  // what you see down the hole: the sheet below
const HOLE_WALL = "#a68d67";   // the lifted inner edge, in shadow
const HOLE_DEEP = "#8a7150";   // …and the deepest part of it
const HOLE_LIP = "#fff7e6";    // the cut edge nearest you, catching light
const HOLE_RIM = "#bda684";
const CAST = "#6b563a";        // everything the metal does to the paper

const r2 = (n: number) => Math.round(n * 100) / 100;

type P = readonly [number, number];
const mid = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const C = (a: P, b: P, c: P) => `C${r2(a[0])} ${r2(a[1])} ${r2(b[0])} ${r2(b[1])} ${r2(c[0])} ${r2(c[1])}`;

/**
 * The first `t` of a cubic, as its own cubic (de Casteljau).
 *
 * This is what keeps the two halves of a loop from showing a seam. The near
 * half has to run a little past the crown so its round cap is buried inside the
 * far half's stroke — but "a little past" has to be *the same curve*, not a
 * freehand stub that lands a pixel outside it and draws a second edge.
 */
function cubicHead(p0: P, p1: P, p2: P, p3: P, t: number): string {
  const q0 = mid(p0, p1, t);
  const q1 = mid(p1, p2, t);
  const q2 = mid(p2, p3, t);
  const s0 = mid(q0, q1, t);
  const s1 = mid(q1, q2, t);
  return C(q0, s0, mid(s0, s1, t));
}

/**
 * `roughEllipse` in absolute coordinates.
 *
 * Same algorithm as the ink kit's, and deliberately so — it is only re-stated
 * here because the coil draws a great many small ovals (a hole, a rim and a
 * shadow pool per ring) and emitting them in page space lets every ring's oval
 * share one `<path>` with the rest of the row's. That keeps the element count flat as rings are added,
 * which a per-ring `transform` cannot do.
 */
function roughOval(cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.7): string {
  const r = hand(seed);
  const steps = 10;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * (wob / Math.min(rx, ry)) * 1.4;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  const out = [`M${r2(pts[0].x)} ${r2(pts[0].y)}`];
  for (let i = 0; i < steps; i++) {
    const p = pts[(i + 1) % steps];
    const q = pts[(i + 2) % steps];
    out.push(`Q${r2(p.x)} ${r2(p.y)} ${r2((p.x + q.x) / 2)} ${r2((p.y + q.y) / 2)}`);
  }
  out.push("Z");
  return out.join(" ");
}

/**
 * Where the holes are punched. Ring count follows width — the pitch is what is
 * constant, not the count — so a 320px phone gets a handful of wide loops and a
 * tablet gets a dozen at exactly the same spacing.
 *
 * Split out because the page wants the hole positions too, for the shadow the
 * lifted top strip casts between the rings.
 */
function ringXs(w: number, seed: number): number[] {
  if (w < 40) return [];
  const n = Math.max(3, Math.floor((w - 30) / RING_PITCH));
  const span = w - 44;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // one hand per ring, rather than one hand walked across the row: a ring's
    // shape then depends only on its own index, so adding a ring at the right
    // edge cannot re-roll the ring at the left
    const r = hand(seed * 131 + i * 9173 + 5);
    out.push(22 + (span * i) / Math.max(1, n - 1) + (r() - 0.5) * 1.8);
  }
  return out;
}

interface Coil {
  /** The whole loop, for the half that lives behind the sheet. */
  loop: string;
  /** Just the near half: out of the hole, up the front, over the crown. */
  leg: string;
  /** The specular run along the wire's upper-left. */
  shine: string;
  /** A far dimmer one down the inside of the far leg — the loop's far side. */
  glint: string;
  /** The far leg where it passes behind the punched hole. */
  sunk: string;
  /** What the wire throws onto the paper. */
  cast: string;
  pool: string;
  /** The punched hole itself — filled for the throat, stroked for the rim. */
  hole: string;
  wall: string;
  deep: string;
  lip: string;
  /** Where the wire has bruised the sheet. */
  crease: string;
}

function buildCoil(w: number, seed: number): Coil | null {
  const xs = ringXs(w, seed);
  if (!xs.length) return null;

  const loop: string[] = [];
  const leg: string[] = [];
  const shine: string[] = [];
  const glint: string[] = [];
  const sunk: string[] = [];
  const cast: string[] = [];
  const pool: string[] = [];
  const hole: string[] = [];
  const wall: string[] = [];
  const deep: string[] = [];
  const lip: string[] = [];
  const crease: string[] = [];

  for (let i = 0; i < xs.length; i++) {
    const cx = xs[i];
    const r = hand(seed * 131 + i * 9173 + 5);
    r(); // the draw `ringXs` already spent on this ring's x

    // A coil is wound, then opened and shut a few hundred times by a child.
    // Every ring gets its own lean, width, crown height and crown flatness, so
    // the row reads as one bent piece of wire rather than a stamp repeated.
    const lean = 1.3 + (r() - 0.5) * 1.8;
    const rx = 6.9 + (r() - 0.5) * 1.3;
    // The crown never climbs above ~1: a page's own top padding is all the room
    // the metal has to stand up in, and a loop clipped by the window edge would
    // undo every other thing on this list.
    const topY = 2 + (r() - 0.5) * 2.0;
    // The shoulders sit *above* the sheet's edge on purpose: the far leg is
    // then already in its steep run down when the paper cuts it, so it reads
    // as diving behind rather than hooking back on itself.
    const midL = PAPER_Y - 3.4 + (r() - 0.5) * 1.6;
    const midR = PAPER_Y - 3.2 + (r() - 0.5) * 1.6;
    const crown = 0.62 + (r() - 0.5) * 0.16;

    const fx = cx - 2.6 + (r() - 0.5) * 0.9;   // where the near leg leaves the hole
    const fy = HOLE_Y + 1.3;
    const bx = cx + 4.4 + (r() - 0.5) * 0.9;   // where the far leg dives behind
    // …and where it stops. Not at the hole, where it truly ends: the sheet's
    // drawn edge is a freehand line that bows by a couple of px, so it stops a
    // little past the lowest that bow can wander, still descending.
    const by = PAPER_Y + 5;
    const lx = cx - rx;
    const rxp = cx + rx + lean * 0.45;
    const tx = cx + lean;

    const crestL: P = [tx - rx * crown, topY];
    const crest: P = [tx, topY];
    const crestR: P = [tx + rx * crown, topY];
    const shoulderR: P = [rxp, midR];
    const shoulderRc: P = [rxp, midR - (midR - topY) * 0.55];

    const up =
      `M${r2(fx)} ${r2(fy)}` +
      C([fx - rx * 0.86, fy - 2.2], [lx - 0.4, midL + (fy - midL) * 0.46], [lx, midL]) +
      C([lx, midL - (midL - topY) * 0.55], crestL, crest);

    loop.push(
      up +
      C(crestR, shoulderRc, shoulderR) +
      C([rxp + 0.3, midR + (by - midR) * 0.42], [bx + 1.8, by - 2.4], [bx, by]),
    );

    // The near half carries on a little past the crown, so its round cap is
    // buried inside the far half's stroke — and it carries on along exactly
    // the far half's curve, which is what `cubicHead` is for.
    leg.push(up + cubicHead(crest, crestR, shoulderRc, shoulderR, 0.42));

    // A cylinder lit from one corner still turns on its far side, and without
    // this the far leg goes dead flat next to the near one. It starts below
    // where the near half's tail overlaps, so nothing paints over it.
    glint.push(
      `M${r2(rxp - 1.15)} ${r2(topY + (midR - topY) * 0.46)}` +
      C([rxp - 1.4, topY + (midR - topY) * 0.74], [rxp - 1.3, midR + 0.4], [rxp - 1.1, midR + 2.6]),
    );

    // the far leg continuing down behind the sheet, seen through the punch
    sunk.push(
      `M${r2(bx - 1.4)} ${r2(HOLE_Y - 5.6)}` +
      C([bx - 0.4, HOLE_Y - 2], [bx - 0.2, HOLE_Y + 2], [bx - 1.2, HOLE_Y + 5.4]),
    );

    // Light comes from the upper-left everywhere else in the kit, so the shine
    // runs up the near leg's left shoulder and dies just over the crown.
    const sx = fx - rx * 0.55;
    shine.push(
      `M${r2(sx)} ${r2(HOLE_Y - 3.6)}` +
      C([sx - rx * 0.3, HOLE_Y - 6.4], [lx - 0.9, midL + 2.2], [lx - 0.85, midL - 1.0]) +
      C([lx - 0.8, midL - (midL - topY) * 0.62], [tx - rx * 0.72, topY - 1.05], [tx - rx * 0.04, topY - 1.1]),
    );

    // the near leg's shadow, thrown down and right onto the sheet — it exists
    // only between the hole and the paper's edge, because above the edge there
    // is nothing left for it to fall on
    cast.push(
      `M${r2(fx + 2.3)} ${r2(HOLE_Y + 1.6)}` +
      C([fx - 0.2, HOLE_Y - 2.2], [lx + 2.9, PAPER_Y + 4.6], [lx + 3.2, PAPER_Y + 1.8]),
    );

    // hugging the hole, and thrown the way the light falls — a pool that
    // drifts free of the thing casting it stops reading as a shadow at all
    pool.push(roughOval(cx + 0.9, HOLE_Y + 1.2, HOLE_RX + 1.5, HOLE_RY + 1.2, seed + i * 37 + 3, 1.0));
    hole.push(roughOval(cx, HOLE_Y, HOLE_RX, HOLE_RY, seed + i * 53 + 11, 0.75));

    // A punched hole is a short tube, not an oval: the sheet is lifted by the
    // wire so the far wall is in shadow, and the near cut edge catches light.
    // The weight sits right of centre, because that is the side of the hole the
    // near leg has not already covered — shading a hole where nobody can see it
    // is how these things end up looking flat.
    wall.push(
      `M${r2(cx - HOLE_RX + 0.5)} ${r2(HOLE_Y + 1.0)}` +
      C([cx - 1.4, HOLE_Y - HOLE_RY - 0.6], [cx + 2.6, HOLE_Y - HOLE_RY - 0.3], [cx + HOLE_RX - 0.3, HOLE_Y + 0.2]),
    );
    deep.push(
      `M${r2(cx - 1.6)} ${r2(HOLE_Y - 2.6)}Q${r2(cx + 1.4)} ${r2(HOLE_Y - HOLE_RY + 0.1)} ${r2(cx + HOLE_RX - 1.2)} ${r2(HOLE_Y - 1.4)}`,
    );
    lip.push(
      `M${r2(cx - HOLE_RX + 2.0)} ${r2(HOLE_Y + 2.4)}Q${r2(cx + 0.6)} ${r2(HOLE_Y + HOLE_RY + 0.2)} ${r2(cx + HOLE_RX - 1.2)} ${r2(HOLE_Y + 1.4)}`,
    );

    // two faint creases: the paper around a bound hole is stressed, never flat
    crease.push(
      `M${r2(cx - 3.5)} ${r2(HOLE_Y + 4.0)}Q${r2(cx - 2.8)} ${r2(HOLE_Y + 5.0)} ${r2(cx - 2.0)} ${r2(HOLE_Y + 5.8)}` +
      `M${r2(cx + 2.8)} ${r2(HOLE_Y + 4.2)}Q${r2(cx + 3.4)} ${r2(HOLE_Y + 5.0)} ${r2(cx + 4.0)} ${r2(HOLE_Y + 5.7)}`,
    );
  }

  return {
    loop: loop.join(""),
    leg: leg.join(""),
    shine: shine.join(""),
    glint: glint.join(""),
    sunk: sunk.join(""),
    cast: cast.join(""),
    pool: pool.join(" "),
    hole: hole.join(" "),
    wall: wall.join(""),
    deep: deep.join(""),
    lip: lip.join(""),
    crease: crease.join(""),
  };
}

/* ── the metal ───────────────────────────────────────────────────────────── */

/**
 * The spiral binding alone: punched holes with wire loops through them.
 *
 * `w` is the width to span. Ring count follows it, so a phone gets fewer, wider
 * loops and a tablet gets more — the pitch stays constant, which is what makes
 * it read as a real pad rather than a stretched graphic.
 *
 * `seed` shifts the per-ring variation, so two pads on screen at once are not
 * identical twins.
 *
 * `part` splits the binding around the sheet it is threaded through:
 *
 *   `"back"`  the far half of every loop, to be painted *under* the paper
 *   `"front"` the holes, the shadows and the near half, painted *over* it
 *   `"all"`   both, with the far half cut off at `PAPER_Y` — for a coil drawn
 *             on its own, where there is no paper in the same SVG to hide it
 *
 * `"all"` is the default, so a lone `<SpiralBinding />` still reads correctly.
 */
export function SpiralBinding({
  w, seed = 19, className, style, part = "all",
}: {
  w: number;
  seed?: number;
  className?: string;
  style?: React.CSSProperties;
  part?: "all" | "back" | "front";
}) {
  const uid = useId().replace(/:/g, "");
  const coil = useMemo(() => buildCoil(w, seed), [w, seed]);

  if (!coil) return null;

  const back = part !== "front";
  const front = part !== "back";

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={COIL_H}
      viewBox={`0 0 ${w} ${COIL_H}`}
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <defs>
        {front && (
          <clipPath id={`coil-h-${uid}`}>
            <path d={coil.hole} />
          </clipPath>
        )}
        {part === "all" && (
          // no sheet in this SVG to hide the far half, so cut it at the line
          // where the sheet's edge would be
          <clipPath id={`coil-b-${uid}`}>
            <rect x={-8} y={-COIL_H} width={w + 16} height={COIL_H + PAPER_Y} />
          </clipPath>
        )}
      </defs>

      {/* ── behind the sheet ── the loop drawn whole, so the half that shows
          above the paper's edge is one unbroken piece of wire */}
      {back && (
        <g clipPath={part === "all" ? `url(#coil-b-${uid})` : undefined}>
          <path d={coil.loop} fill="none" stroke={WIRE_BASE} strokeWidth={4.6} strokeLinecap="round" />
          <path
            d={coil.loop} transform="translate(-0.25 -0.35)"
            fill="none" stroke={WIRE_BODY} strokeWidth={3.1} strokeLinecap="round"
          />
          <path d={coil.glint} fill="none" stroke={WIRE_SHINE} strokeWidth={0.9} strokeLinecap="round" opacity={0.45} />
        </g>
      )}

      {/* ── in front of the sheet ── */}
      {front && (
        <g>
          {/* What the metal does to the paper. Softness is layered strokes, not
              a blur filter: this is on screen constantly and sits inside a 3D
              page flip, and a filter would force a raster pass every frame. */}
          <path d={coil.pool} fill={CAST} opacity={0.06} />
          <path d={coil.cast} fill="none" stroke={CAST} strokeWidth={5.4} strokeLinecap="round" opacity={0.045} />
          <path d={coil.cast} fill="none" stroke={CAST} strokeWidth={2.4} strokeLinecap="round" opacity={0.085} />

          {/* the punch: a floor, the far leg passing behind it, then the walls */}
          <path d={coil.hole} fill={HOLE_FLOOR} />
          <g clipPath={`url(#coil-h-${uid})`}>
            <path d={coil.sunk} fill="none" stroke={WIRE_SUNK} strokeWidth={3.6} strokeLinecap="round" opacity={0.62} />
          </g>
          <path d={coil.wall} fill="none" stroke={HOLE_WALL} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
          <path d={coil.deep} fill="none" stroke={HOLE_DEEP} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
          <path d={coil.lip} fill="none" stroke={HOLE_LIP} strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />
          <path d={coil.hole} fill="none" stroke={HOLE_RIM} strokeWidth={0.9} opacity={0.55} />
          <path d={coil.crease} fill="none" stroke={CAST} strokeWidth={0.7} strokeLinecap="round" opacity={0.11} />

          {/* the near half: outline, lit face, and the shine down its shoulder */}
          <path d={coil.leg} fill="none" stroke={WIRE_BASE} strokeWidth={4.6} strokeLinecap="round" />
          <path
            d={coil.leg} transform="translate(-0.25 -0.35)"
            fill="none" stroke={WIRE_BODY} strokeWidth={3.1} strokeLinecap="round"
          />
          <path d={coil.shine} fill="none" stroke={WIRE_SHINE} strokeWidth={1.15} strokeLinecap="round" opacity={0.92} />
        </g>
      )}
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
      style={{ top: COIL_TOP, zIndex: 5 }}
    >
      {box.w > 0 && <SpiralBinding w={box.w} seed={seed} />}
    </div>
  );
}

/* ── a whole sheet ───────────────────────────────────────────────────────── */

/**
 * The shadow the bound top strip lies in, as a band whose lower edge scallops.
 *
 * A sheet on a coil is pulled up at every ring and hangs between them, so the
 * shading under its top edge is deepest midway between two holes. It is drawn
 * clipped to the paper, and that is what makes it safe: the page's own edge is
 * a freehand line that bows by a couple of px, so anything painted near it in
 * open space would float clear of the sheet wherever the bow went the other
 * way. Two of these stacked stand in for a soft gradient — one step reads as a
 * printed line, two read as shade.
 *
 * `y` values are page coordinates, measured from the top of the page box.
 */
function liftShade(w: number, xs: number[], hi: number, lo: number): string {
  if (!xs.length) return "";
  const out = [`M0 ${r2(lo)}`];
  for (let i = 0; i < xs.length; i++) {
    const prev = i === 0 ? 0 : xs[i - 1];
    out.push(`Q${r2((prev + xs[i]) / 2)} ${r2(lo)} ${r2(xs[i])} ${r2(hi)}`);
  }
  out.push(`Q${r2((xs[xs.length - 1] + w) / 2)} ${r2(lo)} ${r2(w)} ${r2(lo)}`);
  out.push(`L${r2(w)} 0 L0 0 Z`);
  return out.join(" ");
}

/**
 * One page of the pad: torn edge, paper, and the coil across the top.
 *
 * The page is a real drawn rectangle rather than a `border-radius`, so its edge
 * wobbles the way a sheet torn out of a pad does. Content is padded clear of
 * the binding automatically — a caller should never have to know how tall the
 * metal is.
 *
 * The layering is the point: far half of the wire, then the paper, then the
 * near half. That is the only way the binding can look like it is threaded
 * through the sheet instead of resting on it.
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
  // The same hole positions the metal will use, so the sag lands between the
  // rings. Both bands start well clear of the drawn edge — the ink line the
  // page draws over itself is nearly 3px wide, and shade tucked under it is
  // shade nobody will ever see.
  const shade = useMemo(() => {
    if (!coil || box.w < 40) return null;
    const xs = ringXs(box.w, seed + 7);
    const y = PAPER_Y + COIL_TOP;
    return { far: liftShade(box.w, xs, y + 13, y + 19), near: liftShade(box.w, xs, y + 7, y + 12) };
  }, [box.w, seed, coil]);

  const showCoil = coil && box.w > 0;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`} style={style}>
      {/* first, and with no z-index of its own, so the paper paints over it */}
      {showCoil && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: COIL_TOP }}>
          <SpiralBinding w={box.w} seed={seed + 7} part="back" />
        </div>
      )}

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
            <rect x={0} y={0} width={box.w} height={box.h} fill="var(--paper-card, #fffdf7)" />
            {shade && <path d={shade.far} fill={CAST} opacity={0.035} />}
            {shade && <path d={shade.near} fill={CAST} opacity={0.04} />}
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

      {showCoil && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: COIL_TOP, zIndex: 5 }}>
          <SpiralBinding w={box.w} seed={seed + 7} part="front" />
        </div>
      )}

      {/* clear of the metal, always */}
      <div className={`relative ${contentClassName ?? ""}`} style={{ paddingTop: coil ? COIL_H - 12 : undefined, zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
