import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Pt, Stroke } from "@/lib/types";
import { drawStroke } from "@/lib/brushes";
import type { Medium } from "@/lib/brushes";
import { sfxTap, sfxPop, sfxMagic } from "@/lib/audio";
import { extractDrawingFromPhoto } from "@/lib/photo";
import { hand, paperTile, roughEllipse, roughRect, seedOf, shade, waxTile } from "@/lib/ink";
import { InkButton, InkCard, Scribble } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";
import { Doodle } from "@/components/ink/Doodles";
import { stampsFor, type Stamp } from "@/lib/stamps";
import ParentGate from "@/components/ParentGate";

/* The crayon box. `short` is what's printed on the paper wrapper — kept to
   five or six letters so the whole word still reads once the crayon's blunt
   end is down in the box; `name` is what a screen reader says, so a colour is
   never identified by colour alone. */
const CRAYONS = [
  { c: "#e63b2e", name: "Cherry red", short: "CHERRY" },
  { c: "#ff7a1a", name: "Orange", short: "ORANGE" },
  { c: "#ffc72c", name: "Sunshine yellow", short: "SUNNY" },
  { c: "#3aae3a", name: "Leaf green", short: "LEAF" },
  { c: "#00c2b9", name: "Lagoon", short: "LAGOON" },
  { c: "#2f6fe4", name: "Ocean blue", short: "OCEAN" },
  { c: "#8b46c7", name: "Grape", short: "GRAPE" },
  { c: "#fb66e5", name: "Candy pink", short: "CANDY" },
  { c: "#7a4a21", name: "Cocoa brown", short: "COCOA" },
  { c: "#2d2926", name: "Licorice black", short: "BLACK" },
];

const SIZES = [
  { px: 5, label: "Thin" },
  { px: 10, label: "Medium" },
  { px: 17, label: "Thick" },
];

/* ── the crayon itself ─────────────────────────────────────────────────────
   Drawn, not shaded: a wax barrel filled with the app's own crayon texture, a
   paper wrapper with printed bands and a label, and a cone worn blunt by use.
   Every crayon in the box is a slightly different length and sharpness. */

const CW = 40;  // crayon box, local SVG units
const CH = 86;

interface CrayonGeo {
  sil: string; facet: string; ring: string; wrap: string;
  bandA: string; bandB: string; zigA: string; zigB: string;
  hiBarrel: string; loBarrel: string; hiWrap: string;
  labelY: number; labelX: number; labelLen: number; tilt: number;
}

const geoCache = new Map<number, CrayonGeo>();

function crayonGeo(seed: number): CrayonGeo {
  const hit = geoCache.get(seed);
  if (hit) return hit;
  const r = hand(seed);
  const j = (n: number) => (r() - 0.5) * n;

  const wear = 13 + r() * 7;        // how much cone is left
  const flat = 2.4 + r() * 3.2;     // the blunt spot at the very point
  const apex = 3 + r() * 1.8;
  const x0 = 9 + j(0.9);
  const x1 = CW - 9 + j(0.9);
  const mid = (x0 + x1) / 2 + j(1.4);
  const base = apex + wear;         // where the sharpened cone meets the barrel
  const bot = CH - 3 + j(0.9);

  const sil = [
    `M${x0} ${base}`,
    `Q${mid - flat * 1.1} ${apex + 2.4} ${mid - flat / 2} ${apex + j(0.5)}`,
    `Q${mid} ${apex - 1.4} ${mid + flat / 2} ${apex + j(0.5)}`,
    `Q${mid + flat * 1.1} ${apex + 2.6} ${x1} ${base}`,
    `L${x1 + j(0.7)} ${bot - 4}`,
    `Q${x1} ${bot} ${x1 - 4} ${bot}`,
    `L${x0 + 4} ${bot + j(0.6)}`,
    `Q${x0} ${bot} ${x0 + j(0.5)} ${bot - 4}`,
    "Z",
  ].join(" ");

  // the lit side of the cone — a facet, not a gloss highlight
  const facet =
    `M${x0} ${base} Q${mid - flat * 1.1} ${apex + 2.4} ${mid - flat / 2} ${apex} ` +
    `L${mid - flat / 2} ${base} Z`;
  const ring = `M${x0 + 0.4} ${base} Q${mid} ${base + 1.4} ${x1 - 0.4} ${base - 0.3}`;

  // The label has to read while the crayon's blunt end is down in the box, so
  // the wrapper is printed on the upper barrel and the bare wax below it is
  // what the cardboard swallows.
  const wy0 = base + 6 + r() * 2.2;
  const wy1 = CH - 26 + j(1.4);
  const wx0 = x0 - 1.6;
  const wx1 = x1 + 1.6;
  const wrap =
    `M${wx0} ${wy0} L${wx1} ${wy0 + j(0.7)} L${wx1 + j(0.5)} ${wy1} L${wx0 + j(0.5)} ${wy1 + j(0.7)} Z`;
  const bh = 4.4;
  const bandA = `M${wx0} ${wy0} L${wx1} ${wy0 + j(0.5)} L${wx1} ${wy0 + bh} L${wx0} ${wy0 + bh + j(0.5)} Z`;
  const bandB = `M${wx0} ${wy1 - bh} L${wx1} ${wy1 - bh + j(0.5)} L${wx1} ${wy1} L${wx0} ${wy1 + j(0.5)} Z`;

  // the scalloped teeth printed just inside each band
  const zig = (y: number, dir: number) => {
    let d = `M${wx0} ${y}`;
    const n = 7;
    for (let k = 1; k <= n; k++) {
      d += ` L${(wx0 + ((wx1 - wx0) * k) / n).toFixed(2)} ${(y + (k % 2 ? 2.1 * dir : 0)).toFixed(2)}`;
    }
    return d;
  };

  const hiBarrel = `M${x0 + 3.2} ${base + 1.5} L${x0 + 3.2} ${bot - 4}`;
  const loBarrel = `M${x1 - 2.6} ${base + 2} L${x1 - 2.6} ${bot - 4}`;
  const hiWrap = `M${wx0 + 3} ${wy0 + bh + 2} L${wx0 + 3} ${wy1 - bh - 2}`;

  const geo: CrayonGeo = {
    sil, facet, ring, wrap, bandA, bandB,
    zigA: zig(wy0 + bh + 1.6, 1),
    zigB: zig(wy1 - bh - 1.6, -1),
    hiBarrel, loBarrel, hiWrap,
    labelY: (wy0 + wy1) / 2,
    labelX: (wx0 + wx1) / 2,
    labelLen: wy1 - wy0 - bh * 2 - 5,
    tilt: j(4.5),
  };
  geoCache.set(seed, geo);
  return geo;
}

function CrayonArt({ color, short, seed, lifted }: {
  color: string; short: string; seed: number; lifted: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const g = crayonGeo(seed);
  const tile = waxTile(color);
  // the wrapper is printed in the crayon's own colour, a shade off the wax
  const paperTone = shade(color, 0.16);
  const bandTone = shade(color, -0.34);
  const printTone = shade(color, -0.66);
  return (
    <svg
      aria-hidden="true"
      width={CW}
      height={CH}
      viewBox={`0 0 ${CW} ${CH}`}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        {tile && (
          <pattern
            id={`cx-${uid}`}
            patternUnits="userSpaceOnUse"
            width="128"
            height="128"
            patternTransform={`translate(${-(seed % 53)} ${-(seed % 71)})`}
          >
            <image href={tile} width="128" height="128" />
          </pattern>
        )}
        <filter id={`cl-${uid}`} x="-60%" y="-30%" width="220%" height="170%">
          <feDropShadow
            dx="0" dy={lifted ? 5 : 2}
            stdDeviation={lifted ? 3.4 : 1.6}
            floodColor="#4a3a28" floodOpacity={lifted ? 0.4 : 0.24}
          />
        </filter>
      </defs>

      <g filter={`url(#cl-${uid})`}>
        {/* wax */}
        <path d={g.sil} fill={tile ? `url(#cx-${uid})` : color} />
        <path d={g.facet} fill="#ffffff" opacity="0.2" />
        <path d={g.hiBarrel} stroke="#ffffff" strokeOpacity="0.24" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d={g.loBarrel} stroke="#2d2926" strokeOpacity="0.16" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d={g.ring} stroke="#2d2926" strokeOpacity="0.22" strokeWidth="1.1" fill="none" strokeLinecap="round" />

        {/* paper wrapper */}
        <path d={g.wrap} fill={paperTone} />
        <path d={g.hiWrap} stroke="#ffffff" strokeOpacity="0.26" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d={g.bandA} fill={bandTone} />
        <path d={g.bandB} fill={bandTone} />
        <path d={g.zigA} fill="none" stroke={bandTone} strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
        <path d={g.zigB} fill="none" stroke={bandTone} strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
        <text
          x={g.labelX}
          y={g.labelY}
          transform={`rotate(-90 ${g.labelX} ${g.labelY})`}
          textAnchor="middle"
          dominantBaseline="central"
          fill={printTone}
          opacity="0.95"
          style={{
            fontFamily: '"Baloo 2", "Nunito", ui-rounded, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 6.6,
            letterSpacing: 0.25,
          }}
        >
          {short}
        </text>
        <path d={g.wrap} fill="none" stroke="#2d2926" strokeOpacity="0.35" strokeWidth="1.1" strokeLinejoin="round" />

        {/* the hand that inked the outline */}
        <path d={g.sil} fill="none" stroke="var(--ink)" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />
        <path
          d={g.sil} fill="none" stroke="var(--ink)" strokeWidth="1.2"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.5"
          transform="translate(0.7 0.9)"
        />
      </g>
    </svg>
  );
}

/* ── the other two tools ───────────────────────────────────────────────────
   A watercolour brush and a paintbrush, drawn in the same box as a crayon so
   all three stand level in the tray, and by the same hand: a wobbled
   silhouette, a wax fill, an ink outline gone over twice.

   What separates them is the one thing a child who cannot read a label still
   reads instantly — the shape:

     crayon       a fat wrapped stick worn down to a cone
     watercolour  a slim stick, a small band, a long soft *point*, and a drip
     paintbrush   a chunky stick, a wide band, a *square block* of bristles

   The bristles carry the crayon colour the child has picked, so the tray
   recolours with the box and the tool shows what it would put down. */

const TW = CW;
const TH = CH;

interface BrushGeo {
  hairs: string; ferrule: string; handle: string;
  crimpA: string; crimpB: string; hiFerrule: string;
  hiHandle: string; loHandle: string;
  comb: string[]; load: string; drop: string; wash: string[];
  rivet: { x: number; y: number };
}

const brushCache = new Map<string, BrushGeo>();

function brushGeo(seed: number, kind: "water" | "paint"): BrushGeo {
  const key = `${kind}:${seed}`;
  const hit = brushCache.get(key);
  if (hit) return hit;
  const r = hand(seed);
  const j = (n: number) => (r() - 0.5) * n;
  const soft = kind === "water";
  const f = (n: number) => n.toFixed(2);

  const mx = TW / 2 + j(1.2);
  const bot = TH - 3 + j(0.9);
  // slim versus chunky has to survive being drawn twenty-five pixels wide, so
  // the two are a long way apart: the watercolour handle is barely half the
  // paintbrush's, and a third of the crayon barrel below it.
  const hw = soft ? 4.2 + r() * 0.4 : 7.3 + r() * 0.5;   // handle at the ferrule
  const hb = hw * (soft ? 0.58 : 0.8);                   // handle at the butt
  const fw = soft ? 5.4 + r() * 0.3 : 8.2 + r() * 0.4;   // the metal band
  const bw = soft ? 5.9 + r() * 0.4 : 9.1 + r() * 0.4;   // the bristles
  const tipY = (soft ? 3 : 6) + r() * 1.4;
  const fy0 = (soft ? 31 : 30) + j(1.4);
  const fy1 = fy0 + (soft ? 11.5 : 14.5);
  const belly = tipY + (fy0 - tipY) * 0.66;              // where a round brush is fattest

  const hairs = soft
    ? [
        `M${f(mx)} ${f(tipY)}`,
        `C${f(mx - bw * 0.42)} ${f(tipY + (belly - tipY) * 0.62)} ${f(mx - bw)} ${f(belly)} ${f(mx - bw * 0.86)} ${f(fy0)}`,
        `L${f(mx + bw * 0.88)} ${f(fy0 + j(0.4))}`,
        `C${f(mx + bw * 1.02)} ${f(belly - 0.6)} ${f(mx + bw * 0.46)} ${f(tipY + (belly - tipY) * 0.6)} ${f(mx)} ${f(tipY)}`,
        "Z",
      ].join(" ")
    : [
        // splayed a little wider than the band, and cut off square — bristle
        // ends are ragged, never a ruled line
        `M${f(mx - bw * 0.9)} ${f(fy0)}`,
        `L${f(mx - bw)} ${f(tipY + 4)}`,
        `Q${f(mx - bw + 0.4)} ${f(tipY + 1)} ${f(mx - bw * 0.6)} ${f(tipY + 1.6 + j(1))}`,
        `L${f(mx - bw * 0.2)} ${f(tipY + 0.2 + j(0.9))}`,
        `L${f(mx + bw * 0.24)} ${f(tipY + 1.8 + j(0.9))}`,
        `L${f(mx + bw * 0.62)} ${f(tipY + 0.4 + j(0.9))}`,
        `Q${f(mx + bw - 0.4)} ${f(tipY + 1)} ${f(mx + bw)} ${f(tipY + 4)}`,
        `L${f(mx + bw * 0.9)} ${f(fy0 + j(0.4))}`,
        "Z",
      ].join(" ");

  const ferrule =
    `M${f(mx - fw)} ${f(fy0 - 1.4)} L${f(mx + fw)} ${f(fy0 - 1 + j(0.4))} ` +
    `L${f(mx + fw * 0.9)} ${f(fy1)} L${f(mx - fw * 0.9)} ${f(fy1 + j(0.4))} Z`;
  const crimpA = `M${f(mx - fw * 0.95)} ${f(fy0 + 2.6)} Q${f(mx)} ${f(fy0 + 3.7)} ${f(mx + fw * 0.95)} ${f(fy0 + 2.4)}`;
  const crimpB = `M${f(mx - fw * 0.9)} ${f(fy1 - 2.6)} Q${f(mx)} ${f(fy1 - 1.5)} ${f(mx + fw * 0.9)} ${f(fy1 - 2.9)}`;
  const hiFerrule = `M${f(mx - fw * 0.46)} ${f(fy0 + 0.6)} L${f(mx - fw * 0.46)} ${f(fy1 - 1.6)}`;

  const handle = [
    `M${f(mx - hw)} ${f(fy1 - 1)}`,
    `L${f(mx + hw)} ${f(fy1 - 1 + j(0.4))}`,
    `C${f(mx + hw * 1.02)} ${f(fy1 + 16)} ${f(mx + hb + 0.6)} ${f(bot - 12)} ${f(mx + hb)} ${f(bot - 3.5)}`,
    `Q${f(mx + hb)} ${f(bot)} ${f(mx + j(0.5))} ${f(bot)}`,
    `Q${f(mx - hb)} ${f(bot)} ${f(mx - hb)} ${f(bot - 3.5)}`,
    `C${f(mx - hb - 0.6)} ${f(bot - 12)} ${f(mx - hw * 1.02)} ${f(fy1 + 16)} ${f(mx - hw)} ${f(fy1 - 1)}`,
    "Z",
  ].join(" ");
  const hiHandle = `M${f(mx - hw * 0.44)} ${f(fy1 + 3)} L${f(mx - hb * 0.5)} ${f(bot - 6)}`;
  const loHandle = `M${f(mx + hw * 0.6)} ${f(fy1 + 4)} L${f(mx + hb * 0.62)} ${f(bot - 6)}`;

  // the grain of the bristles: combed straight on a flat brush, drawn together
  // into the point on a round one
  const comb: string[] = [];
  const n = soft ? 3 : 5;
  for (let k = 1; k <= n; k++) {
    const x = mx - bw * 0.72 + ((bw * 1.44) * k) / (n + 1);
    comb.push(
      soft
        ? `M${f(x)} ${f(fy0 - 2)} Q${f(mx + (x - mx) * 0.35)} ${f(belly)} ${f(mx)} ${f(tipY + 2.8)}`
        : `M${f(x)} ${f(fy0 - 1.4)} L${f(x + j(0.8))} ${f(tipY + 2.6)}`,
    );
  }

  // a loaded brush carries a band of thicker colour across the very end
  const load = soft
    ? ""
    : `M${f(mx - bw * 0.94)} ${f(tipY + 7)} Q${f(mx)} ${f(tipY + 1.4)} ${f(mx + bw * 0.94)} ${f(tipY + 7)} ` +
      `Q${f(mx)} ${f(tipY + 11)} ${f(mx - bw * 0.94)} ${f(tipY + 7)} Z`;

  // …and a wet one is about to drip
  const dx = mx + bw + 3.2 + j(0.6);
  const dy = belly + 5;
  const drop = soft
    ? `M${f(dx)} ${f(dy - 4.4)} C${f(dx + 2.5)} ${f(dy - 1.2)} ${f(dx + 2.8)} ${f(dy + 1.6)} ${f(dx)} ${f(dy + 2.6)} ` +
      `C${f(dx - 2.8)} ${f(dy + 1.6)} ${f(dx - 2.5)} ${f(dy - 1.2)} ${f(dx)} ${f(dy - 4.4)} Z`
    : "";

  // the damp halo, made the way the watercolour itself makes it: offset passes,
  // never a blur filter
  const wash = soft
    ? [
        `translate(${f(-1.5 + j(0.6))} ${f(0.9 + j(0.5))})`,
        `translate(${f(1.7 + j(0.6))} ${f(-0.7 + j(0.5))})`,
        `translate(${f(0.3 + j(0.8))} ${f(1.7 + j(0.5))})`,
      ]
    : [];

  const geo: BrushGeo = {
    hairs, ferrule, handle, crimpA, crimpB, hiFerrule, hiHandle, loHandle,
    comb, load, drop, wash,
    rivet: { x: mx + j(0.8), y: (fy0 + fy1) / 2 + 2.4 },
  };
  brushCache.set(key, geo);
  return geo;
}

function BrushArt({ kind, color, seed, lifted }: {
  kind: "water" | "paint"; color: string; seed: number; lifted: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const soft = kind === "water";
  const g = brushGeo(seed, kind);
  // two different woods, so the pair is still a pair in silhouette alone
  const woodTone = soft ? "#e0a94a" : "#b4632f";
  const wood = waxTile(woodTone);
  const rim = shade(color, -0.32);
  const deep = shade(color, -0.24);
  const lit = shade(color, 0.34);
  return (
    <svg
      aria-hidden="true"
      width={TW}
      height={TH}
      viewBox={`0 0 ${TW} ${TH}`}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        {wood && (
          <pattern
            id={`bw-${uid}`}
            patternUnits="userSpaceOnUse"
            width="128"
            height="128"
            patternTransform={`translate(${-(seed % 47)} ${-(seed % 61)})`}
          >
            <image href={wood} width="128" height="128" />
          </pattern>
        )}
        <filter id={`bl-${uid}`} x="-60%" y="-30%" width="220%" height="170%">
          <feDropShadow
            dx="0" dy={lifted ? 5 : 2}
            stdDeviation={lifted ? 3.4 : 1.6}
            floodColor="#4a3a28" floodOpacity={lifted ? 0.4 : 0.24}
          />
        </filter>
      </defs>

      <g filter={`url(#bl-${uid})`}>
        {/* the damp edge, before the colour that made it */}
        {g.wash.map((t, i) => (
          <path
            key={i} d={g.hairs} fill="none" stroke={color}
            strokeWidth={3.2 - i * 0.7} opacity="0.1"
            strokeLinejoin="round" transform={t}
          />
        ))}

        {/* the bristles, carrying the colour the child picked */}
        <path d={g.hairs} fill={color} opacity={soft ? 0.44 : 1} />
        {soft && (
          // the rim water dries to — the one thing that says watercolour
          <path d={g.hairs} fill="none" stroke={rim} strokeWidth="1.7" opacity="0.55" strokeLinejoin="round" />
        )}
        {!soft && <path d={g.load} fill={deep} />}
        {g.comb.map((d, i) => (
          <path
            key={i} d={d} fill="none" stroke={i % 2 ? lit : rim}
            strokeWidth={soft ? 0.9 : 1.2} strokeLinecap="round"
            opacity={soft ? 0.38 : 0.5}
          />
        ))}
        {soft && (
          <>
            <path d={g.drop} fill={color} opacity="0.42" />
            <path d={g.drop} fill="none" stroke={rim} strokeWidth="0.9" opacity="0.6" />
          </>
        )}

        {/* the metal band, crimped onto the handle */}
        <path d={g.ferrule} fill="#c9cfd7" />
        <path d={g.hiFerrule} stroke="#ffffff" strokeOpacity="0.7" strokeWidth={soft ? 2 : 3.2} strokeLinecap="round" fill="none" />
        <path d={g.crimpA} stroke="#7d8894" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d={g.crimpB} stroke="#7d8894" strokeWidth="1" fill="none" strokeLinecap="round" />
        {!soft && <circle cx={g.rivet.x} cy={g.rivet.y} r="1.5" fill="#7d8894" opacity="0.75" />}
        <path d={g.ferrule} fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinejoin="round" />

        {/* the handle */}
        <path d={g.handle} fill={wood ? `url(#bw-${uid})` : woodTone} />
        <path d={g.hiHandle} stroke="#ffffff" strokeOpacity="0.28" strokeWidth={soft ? 2 : 3.2} strokeLinecap="round" fill="none" />
        <path d={g.loHandle} stroke="#2d2926" strokeOpacity="0.2" strokeWidth={soft ? 1.6 : 2.4} strokeLinecap="round" fill="none" />

        {/* the hand that inked the outline. The wet tip is drawn with a lighter
            pen than the handle: a soaked brush has no hard edge. */}
        <path d={g.handle} fill="none" stroke="var(--ink)" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />
        <path
          d={g.hairs} fill="none" stroke="var(--ink)"
          strokeWidth={soft ? 1.5 : 2.2} strokeOpacity={soft ? 0.5 : 1}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path
          d={g.handle} fill="none" stroke="var(--ink)" strokeWidth="1.2"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.5"
          transform="translate(0.7 0.9)"
        />
      </g>
    </svg>
  );
}

/* The three ways to make a mark, in the order a child meets them. `word` is
   what the tray calls the tool under the colour name ("Ocean blue paint");
   `label` is the whole name, for a screen reader. */
interface MediumChoice {
  id: Medium;
  label: string;
  word: string;
  seed: number;
}

const MEDIA: readonly MediumChoice[] = [
  { id: "crayon", label: "Crayon", word: "crayon", seed: 401 },
  { id: "water", label: "Watercolour brush", word: "watercolour", seed: 419 },
  { id: "paint", label: "Paintbrush", word: "paint", seed: 433 },
];

/* ── the cardboard box the crayons live in ───────────────────────────────── */

const BOX_FONT = '"Baloo 2", "Nunito", ui-rounded, system-ui, sans-serif';

function BoxFront({ w, h, axis }: { w: number; h: number; axis: "x" | "y" }) {
  const uid = useId().replace(/:/g, "");
  const tile = waxTile("#c07d35");
  const geo = useMemo(() => {
    const r = hand(88);
    const lip: string[] = [];    // the front panel's cut top edge
    const fold: string[] = [];   // the crease where the card folds over
    if (axis === "x") {
      const n = Math.max(5, Math.round(w / 54));
      lip.push(`M-1 ${(7 + r() * 2).toFixed(1)}`);
      for (let i = 1; i <= n; i++) {
        const x = (w * i) / n;
        // a shallow scalloped cut, the way a crayon box is die-cut
        lip.push(`Q${(x - w / n / 2).toFixed(1)} ${(1 + r() * 3).toFixed(1)} ${x.toFixed(1)} ${(7 + r() * 2.4).toFixed(1)}`);
      }
      const body = `${lip.join(" ")} L${w + 1} ${h} L-1 ${h} Z`;
      fold.push(`M2 ${(h * 0.52).toFixed(1)}`);
      for (let i = 1; i <= n; i++) {
        fold.push(`Q${((w * (i - 0.5)) / n).toFixed(1)} ${(h * 0.52 + (r() - 0.5) * 3).toFixed(1)} ${((w * i) / n - 2).toFixed(1)} ${(h * 0.52).toFixed(1)}`);
      }
      return { body, edge: lip.join(" "), fold: fold.join(" ") };
    }
    const n = Math.max(5, Math.round(h / 54));
    lip.push(`M${(w - 7 - r() * 2).toFixed(1)} -1`);
    for (let i = 1; i <= n; i++) {
      const y = (h * i) / n;
      lip.push(`Q${(w - 1 - r() * 3).toFixed(1)} ${(y - h / n / 2).toFixed(1)} ${(w - 7 - r() * 2.4).toFixed(1)} ${y.toFixed(1)}`);
    }
    const body = `${lip.join(" ")} L-1 ${h + 1} L-1 -1 Z`;
    fold.push(`M${(w * 0.46).toFixed(1)} 2`);
    for (let i = 1; i <= n; i++) {
      fold.push(`Q${(w * 0.46 + (r() - 0.5) * 3).toFixed(1)} ${((h * (i - 0.5)) / n).toFixed(1)} ${(w * 0.46).toFixed(1)} ${((h * i) / n - 2).toFixed(1)}`);
    }
    return { body, edge: lip.join(" "), fold: fold.join(" ") };
  }, [w, h, axis]);

  if (w < 4 || h < 4) return null;
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        {tile && (
          <pattern id={`bx-${uid}`} patternUnits="userSpaceOnUse" width="128" height="128">
            <image href={tile} width="128" height="128" />
          </pattern>
        )}
      </defs>
      <path d={geo.body} fill={tile ? `url(#bx-${uid})` : "#c07d35"} />
      {/* the fold in the card, and the shadow it throws */}
      <path d={geo.fold} fill="none" stroke="#4a2c10" strokeOpacity="0.32" strokeWidth="1.6" strokeLinecap="round" />
      <path d={geo.fold} fill="none" stroke="#ffe6bf" strokeOpacity="0.3" strokeWidth="1.2" strokeLinecap="round" transform={axis === "x" ? "translate(0 2)" : "translate(2 0)"} />
      <path d={geo.edge} fill="none" stroke="var(--ink)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
      <path
        d={geo.edge} fill="none" stroke="var(--ink)" strokeOpacity="0.45" strokeWidth="1.3"
        strokeLinecap="round" transform={axis === "x" ? "translate(0.7 1.1)" : "translate(-1.1 0.7)"}
      />
      {/* printed on the box, the way a crayon box is printed */}
      {axis === "x" && w > 210 && (
        <text
          x={16} y={h - 8} fill="#fff2dc" opacity="0.62"
          style={{ fontFamily: BOX_FONT, fontWeight: 800, fontSize: 11, letterSpacing: 2.6 }}
        >
          CRAYONS
        </text>
      )}
      {axis === "y" && h > 210 && (
        <text
          x={0} y={0} fill="#fff2dc" opacity="0.62"
          transform={`translate(${w - 7} ${h - 16}) rotate(-90)`}
          style={{ fontFamily: BOX_FONT, fontWeight: 800, fontSize: 11, letterSpacing: 2.6 }}
        >
          CRAYONS
        </text>
      )}
    </svg>
  );
}

/* ── a real crayon mark, at the weight it would draw ─────────────────────── */

function SizeMark({ px, color, w, h, medium }: { px: number; color: string; w: number; h: number; medium: Medium }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = px * 0.55 + 3;
    const pts: Pt[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      pts.push({
        x: pad + t * (w - pad * 2),
        y: h / 2 + Math.sin(t * Math.PI * 1.7 + 0.5) * (h * 0.5 - pad) * 0.85,
      });
    }
    // the swatch is a preview, so it has to be drawn with the tool in hand —
    // a wax mark under a watercolour brush is just a small lie
    drawStroke(ctx, { color, size: px, pts, medium }, seedOf(`mark${px}`));
  }, [px, color, w, h, medium]);
  return <canvas ref={ref} aria-hidden="true" style={{ display: "block" }} />;
}

/** The child's own way of choosing: a circle drawn around the thing they picked. */
function PickRing({ w, h, color, seed }: { w: number; h: number; color: string; seed: number }) {
  const d = useMemo(() => roughEllipse(w, h, { seed, wobble: 3.4 }), [w, h, seed]);
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="absolute pointer-events-none"
      style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", overflow: "visible" }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" opacity="0.95" />
      <path
        d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        opacity="0.55" transform={`translate(1.2 1.4) rotate(1.4 ${w / 2} ${h / 2})`}
      />
    </svg>
  );
}

/* ── layout mode ─────────────────────────────────────────────────────────── */

const LAND_Q = "(orientation: landscape) and (max-height: 560px)";
/* the same query the stylesheet grows --cs on: a tablet, where the whole box is
   drawn bigger and the tool tray has to grow with it or look like a toy beside
   it */
const ROOMY_Q = "(min-width: 700px) and (min-height: 620px)";

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const read = () => setOn(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return on;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      // offsetWidth/Height, not getBoundingClientRect: the screen entrance
      // animation rotates the page in 3D and a warped rect would size the
      // cardboard to the projection instead of the real box.
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** "Stamp a fish" → "Fish": the creature's own name, for the label under a tile. */
function stampName(label: string): string {
  const n = label.replace(/^stamp an? /i, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

interface Props {
  prompt: string;
  /** The world this drawing is bound for — picks the roster of magic stamps. */
  worldId: string;
  onDone: (strokes: Stroke[]) => void;
  onPhoto: (photoData: string) => void;
  /** Tap-once creature: App bakes the doodle-bodied kind and flies to the world. */
  onStamp: (kindId: string, doodleId: string) => void;
  onBack: () => void;
  /** Drawing a *treat* rather than a creature.
   *
   *  A treat is not alive and must never be guessed at: it skips the recogniser
   *  and the reveal screen entirely and goes straight back to the world as
   *  something to give. The screen is otherwise identical — same crayons, same
   *  paper — because to a child it is the same act. */
  treat?: boolean;
  onTreat?: (strokes: Stroke[]) => void;
}

export default function DrawScreen({ prompt, worldId, onDone, onPhoto, onStamp, onBack, treat = false, onTreat }: Props) {
  /* The camera is the one control here a child must not reach alone. Its label
     has always said "Grown-ups:", but a label is not a gate and the child this
     is built for cannot read it — and a photograph of a paper drawing can
     easily contain the child holding it. */
  const [camGate, setCamGate] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [color, setColor] = useState(CRAYONS[5].c);
  const [size, setSize] = useState(SIZES[1].px);
  /* What the *next* line will be made of. Stamped onto each stroke as it is
     begun, never onto the drawing: switching tools half way through leaves
     everything already on the page in the material it was made with. */
  const [medium, setMedium] = useState<Medium>("crayon");
  const [erasing, setErasing] = useState(false);
  const liveRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sheet, setSheet] = useState({ w: 0, h: 0 });

  /* Magic stamp: the rung below Drawing School. A child who can't draw yet taps
     the stamp, taps a creature, and it's already swimming in the world. */
  const [stampOpen, setStampOpen] = useState(false);
  const stampTitleId = useId();
  const stamps = useMemo(() => stampsFor(worldId), [worldId]);

  const land = useMedia(LAND_Q);
  const roomy = useMedia(ROOMY_Q);
  const reduced = usePrefersReducedMotion();
  const [boxRef, boxBox] = useBox<HTMLDivElement>();

  // parent snaps a paper drawing → lift it off the paper → magic reveal
  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const data = await extractDrawingFromPhoto(file);
      sfxMagic();
      onPhoto(data);
    } catch {
      // couldn't find a drawing — shake it off, stay on the draw screen
      if ("vibrate" in navigator) navigator.vibrate([40, 60, 40]);
      setPhotoBusy(false);
    }
  };
  strokesRef.current = strokes;

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokesRef.current.forEach((s, i) => drawStroke(ctx, s, i + 1));
    if (liveRef.current) drawStroke(ctx, liveRef.current, 999);
  }, []);

  // resize canvas to fill wrapper
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      // clientWidth/Height, not getBoundingClientRect: the screen entrance
      // animation rotates the page in 3D, and a transformed rect would size
      // the sheet to the projection instead of the real box.
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      setSheet((p) => (p.w === w && p.h === h ? p : { w, h }));
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); }, [strokes, redraw]);

  // Escape closes the stamp tray, the same courtesy the parent gate gives.
  useEffect(() => {
    if (!stampOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStampOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stampOpen]);

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const eraseAt = (path: Pt[]) => {
    const radius = 22;
    setStrokes((prev) =>
      prev.filter((s) => {
        for (const q of path) {
          for (const p of s.pts) {
            if (Math.hypot(p.x - q.x, p.y - q.y) < radius + s.size / 2) return false;
          }
        }
        return true;
      })
    );
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    setUndone([]); // a fresh mark ends the redo trail
    if (erasing) {
      liveRef.current = { color: "", size: 0, pts: [p] };
      eraseAt([p]);
      return;
    }
    liveRef.current = { color, size, pts: [p], medium };
  };

  const onMove = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    const p = toLocal(e);
    const last = live.pts[live.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    live.pts.push(p);
    if (erasing) {
      eraseAt(live.pts.slice(-4));
    }
    redraw();
  };

  const onUp = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live || erasing) return;
    if (live.pts.length >= 2) {
      setStrokes((prev) => [...prev, live]);
    }
  };

  const empty = strokes.length === 0;
  const canUndo = strokes.length > 0;
  const canRedo = undone.length > 0;

  const undo = () => {
    if (!canUndo) return;
    setUndone((u) => [...u, strokes[strokes.length - 1]]);
    setStrokes(strokes.slice(0, -1));
    sfxPop();
  };

  const redo = () => {
    if (!canRedo) return;
    setStrokes([...strokes, undone[undone.length - 1]]);
    setUndone(undone.slice(0, -1));
    sfxTap();
  };

  const pickCrayon = (c: string) => { setColor(c); setErasing(false); sfxTap(); };
  const pickSize = (px: number) => { setSize(px); setErasing(false); sfxTap(); };
  const pickMedium = (m: Medium) => { setMedium(m); setErasing(false); sfxTap(); };

  const openStamps = () => { sfxTap(); setStampOpen(true); };
  const closeStamps = () => { sfxTap(); setStampOpen(false); };
  const pickStamp = (stamp: Stamp) => {
    // The whole payoff of this pathway: tap → the creature is made and gone to
    // its world. Close first so the tray doesn't linger over the celebration.
    setStampOpen(false);
    sfxMagic();
    if ("vibrate" in navigator) navigator.vibrate(12);
    onStamp(stamp.kindId, stamp.doodleId);
  };

  /* ── the sheet: deckled edge, spiral binding, real paper ─────────────── */
  const fibre = useMemo(() => paperTile(), []);
  const deckle = useMemo(
    () => (sheet.w > 20 && sheet.h > 20 ? roughRect(sheet.w - 8, sheet.h - 8, { seed: 41, wobble: 3.6, radius: 16 }) : ""),
    [sheet.w, sheet.h],
  );
  const eraseFrame = useMemo(
    () => (sheet.w > 40 && sheet.h > 40 ? roughRect(sheet.w - 26, sheet.h - 26, { seed: 73, wobble: 4.2, radius: 14 }) : ""),
    [sheet.w, sheet.h],
  );
  const rings = useMemo(() => {
    const n = Math.max(4, Math.floor((sheet.w - 30) / 36));
    const r = hand(19);
    return Array.from({ length: n }, (_, i) => ({
      x: 22 + ((sheet.w - 44) * i) / Math.max(1, n - 1),
      w: (r() - 0.5) * 1.6,
    }));
  }, [sheet.w]);

  const current = CRAYONS.find((k) => k.c === color) ?? CRAYONS[5];
  const kit = MEDIA.find((m) => m.id === medium) ?? MEDIA[0];
  const TOOL = land ? 48 : 50;
  const MARK_W = land ? 46 : 56;
  const MARK_H = land ? 26 : 30;

  /* How big the three tools are drawn. Portrait stands them up beside the
     colour name; a landscape phone lays them down the side of the page the
     same way it lays the crayons down. */
  const MS = land ? 0.86 : roomy ? 0.95 : 0.7;
  const SLOT_W = Math.round((land ? TH : TW) * MS);
  const SLOT_H = Math.round((land ? TW : TH) * MS);

  /* ── the tool tray ────────────────────────────────────────────────────
     What to draw *with*, above what colour to draw it in. Each is drawn as
     the thing itself and named only for a screen reader: the child this is
     built for cannot read "watercolour", but they have held one. */
  const mediaRow = (
    <div className="dw-media">
      {/* the colour and the tool, read as one thing: "Ocean blue paint" */}
      <p className="dw-current ink-hand" aria-hidden="true">
        {erasing ? "Rubbing out" : `${current.name} ${kit.word}`}
      </p>

      <div className="dw-media-group" role="radiogroup" aria-label="Pick something to draw with">
        {MEDIA.map((m) => {
          const active = !erasing && medium === m.id;
          return (
            <InkButton
              key={m.id}
              role="radio"
              aria-checked={active}
              aria-label={m.label}
              title={m.label}
              onClick={() => pickMedium(m.id)}
              seed={m.seed}
              radius={13}
              className={`dw-media-btn ${active ? "is-picked" : ""}`}
              style={{ height: land ? Math.max(48, SLOT_H + 12) : SLOT_H + 14 }}
            >
              <span className="dw-media-slot" style={{ width: SLOT_W, height: SLOT_H }}>
                <span
                  className="dw-media-art"
                  style={{ transform: land ? `rotate(90deg) scale(${MS})` : `scale(${MS})` }}
                >
                  {m.id === "crayon" ? (
                    <CrayonArt
                      color={erasing ? "#a99e93" : color}
                      short={erasing ? "RUB" : current.short}
                      seed={m.seed}
                      lifted={active}
                    />
                  ) : (
                    <BrushArt
                      kind={m.id === "water" ? "water" : "paint"}
                      color={erasing ? "#a99e93" : color}
                      seed={m.seed}
                      lifted={active}
                    />
                  )}
                </span>
                {active && (
                  <PickRing w={SLOT_W + 18} h={SLOT_H + 14} color={color} seed={m.seed + 7} />
                )}
              </span>
            </InkButton>
          );
        })}
      </div>
    </div>
  );

  /* Thickness + eraser. In portrait they sit under the crayon box; on a
     landscape phone the box needs the whole rail, so they move up top. */
  const toolRow = (
    <>
      {/* thicknesses and the eraser travel together: when the row has to wrap
          it is the colour name that takes its own line, never one lone tool */}
      <div className="dw-toolgroup">
        <div className="dw-sizes" role="radiogroup" aria-label={`${kit.label} thickness`}>
          {SIZES.map((s, i) => {
            const active = size === s.px && !erasing;
            return (
              <InkButton
                key={s.px}
                role="radio"
                aria-checked={active}
                aria-label={`${s.label} line`}
                title={`${s.label} line`}
                onClick={() => pickSize(s.px)}
                seed={140 + i * 17}
                radius={12}
                className="dw-size-btn"
                style={{ width: MARK_W + 10, height: MARK_H + 20 }}
              >
                <SizeMark px={s.px} color={erasing ? "#a99e93" : color} w={MARK_W} h={MARK_H} medium={medium} />
                {active && <PickRing w={MARK_W + 14} h={MARK_H + 22} color={color} seed={200 + i * 9} />}
              </InkButton>
            );
          })}
        </div>

        <InkButton
          onClick={() => { setErasing(!erasing); sfxTap(); }}
          aria-pressed={erasing}
          aria-label={erasing ? "Eraser is on. Turn it off." : "Turn on the eraser"}
          tone={erasing ? "#ff6b6b" : undefined}
          seed={erasing ? 91 : 27}
          radius={13}
          className={`dw-eraser ${erasing ? "dw-on" : ""}`}
          style={{ width: TOOL + 8, height: MARK_H + 20 }}
        >
          <Icon name="eraser" size={22} color={erasing ? "#fffaf0" : "var(--ink)"} />
          {/* the same circled-it-with-a-crayon language as the thickness picks —
              never the app-wide `.is-on` sticker ring, which is the generic
              treatment this screen exists to get rid of */}
          {erasing && <PickRing w={TOOL + 24} h={MARK_H + 34} color="var(--coral)" seed={317} />}
        </InkButton>
      </div>
    </>
  );

  const sheetStyle: React.CSSProperties = {
    backgroundColor: "var(--paper-card)",
    backgroundImage: fibre ? `url("${fibre}")` : undefined,
    boxShadow: "0 10px 26px rgba(74,58,40,0.22), 0 2px 5px rgba(74,58,40,0.14)",
    borderRadius: 16,
  };

  return (
    <div className={`screen ink-paper ${land ? "dw-land" : ""}`}>
      <style>{DW_CSS}</style>

      <div className="dw-grid pad-x pad-t pad-b">
        {/* ── top: leave · history · photograph ───────────────────────── */}
        <div className="dw-top">
          <InkButton
            onClick={() => { sfxTap(); onBack(); }}
            shape="ellipse"
            seed={12}
            aria-label="Back to home"
            className="dw-icon-btn"
            style={{ width: TOOL, height: TOOL }}
          >
            <Icon name="back" size={22} />
          </InkButton>

          <span className="dw-sep" aria-hidden="true" />

          <InkButton
            onClick={undo}
            disabled={!canUndo}
            shape="ellipse"
            seed={34}
            aria-label="Undo the last line"
            className="dw-icon-btn"
            style={{ width: TOOL, height: TOOL }}
          >
            <Icon name="undo" size={22} />
          </InkButton>
          <InkButton
            onClick={redo}
            disabled={!canRedo}
            shape="ellipse"
            seed={56}
            aria-label="Redo the line you undid"
            className="dw-icon-btn"
            style={{ width: TOOL, height: TOOL }}
          >
            <Icon name="redo" size={22} />
          </InkButton>

          <span className="dw-sep" aria-hidden="true" />

          {/* Magic stamp: for the youngest, who can't draw a fish yet — tap once,
              tap a creature, and it's alive. Waxed plum so it reads as the one
              "make magic" control here, a sibling of the MAKE IT ALIVE button. */}
          {/* A stamp makes a *creature*, so it has no business here when the
              child is drawing something to give away. */}
          {!treat && (
            <InkButton
              onClick={openStamps}
              tone="#8b46c7"
              shape="ellipse"
              seed={63}
              aria-haspopup="dialog"
              aria-expanded={stampOpen}
              aria-label="Magic stamp"
              title="Magic stamp"
              className="dw-icon-btn dw-stamp-open"
              style={{ width: TOOL, height: TOOL }}
            >
              <Icon name="sparkle" size={22} color="var(--sun)" fill="var(--sun)" />
            </InkButton>
          )}

          {land && <div className="dw-toolrow dw-toolrow-top">{toolRow}</div>}

          <span className="dw-spacer" />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickPhoto}
          />
          <InkButton
            onClick={() => { sfxTap(); setCamGate(true); }}
            disabled={photoBusy}
            aria-busy={photoBusy}
            shape="ellipse"
            seed={78}
            aria-label="Grown-ups: photograph a drawing on paper"
            title="Photograph a drawing on paper"
            className="dw-icon-btn"
            style={{ width: TOOL, height: TOOL }}
          >
            <Icon name={photoBusy ? "clock" : "camera"} size={22} />
          </InkButton>

          {camGate && (
            <ParentGate
              title="Open the camera?"
              onPass={() => { setCamGate(false); fileRef.current?.click(); }}
              onCancel={() => setCamGate(false)}
            />
          )}
        </div>

        {/* ── the sheet ───────────────────────────────────────────────── */}
        <div className="dw-canvasarea">
          <div ref={wrapRef} className="dw-sheet" style={sheetStyle}>
            <canvas
              ref={canvasRef}
              className="canvas-touch absolute inset-0 cursor-crosshair"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onUp}
            />

            {/* everything below is decoration and never takes a pointer */}
            {deckle && (
              <svg
                aria-hidden="true"
                className="dw-deco"
                width={sheet.w}
                height={sheet.h}
                viewBox={`0 0 ${sheet.w} ${sheet.h}`}
              >
                <defs>
                  <mask id="dw-sheet-mask">
                    <rect x="0" y="0" width={sheet.w} height={sheet.h} fill="#fff" />
                    <path d={deckle} transform="translate(4 4)" fill="#000" />
                  </mask>
                </defs>
                {/* trims the canvas's square corners into a torn-out page */}
                <rect x="0" y="0" width={sheet.w} height={sheet.h} fill="var(--paper)" mask="url(#dw-sheet-mask)" />
                <g transform="translate(4 4)">
                  <path d={deckle} fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" opacity="0.9" />
                  <path d={deckle} fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeLinejoin="round" opacity="0.45" transform="translate(1 1.2)" />
                </g>

                {/* spiral binding — the page is torn from a sketchbook */}
                {rings.map((h, i) => (
                  <g key={i}>
                    <ellipse cx={h.x + h.w} cy="15" rx="5" ry="4.2" fill="#e3d2b6" />
                    <path
                      d={`M${h.x + h.w - 4.6} 15.6 Q${h.x + h.w} 11.6 ${h.x + h.w + 4.6} 14.6`}
                      fill="none" stroke="#b9a382" strokeWidth="1.4" strokeLinecap="round"
                    />
                    <path
                      d={`M${h.x + h.w - 7} 20 C${h.x + h.w - 9.5} -1 ${h.x + h.w + 9.5} -3 ${h.x + h.w + 6.6} 17`}
                      fill="none" stroke="#8d949c" strokeWidth="3.6" strokeLinecap="round"
                    />
                    <path
                      d={`M${h.x + h.w - 7.8} 19 C${h.x + h.w - 10} -1.6 ${h.x + h.w + 8.6} -3.6 ${h.x + h.w + 5.8} 16`}
                      fill="none" stroke="#dfe3e7" strokeWidth="1.3" strokeLinecap="round"
                    />
                  </g>
                ))}

                {/* eraser mode is impossible to miss */}
                {erasing && eraseFrame && (
                  <path
                    d={eraseFrame}
                    transform="translate(13 13)"
                    fill="none"
                    stroke="var(--coral)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="12 10"
                  />
                )}
              </svg>
            )}

            {/* the prompt, written on the page like a title on homework */}
            <div className={`dw-prompt ${empty ? "" : "is-drawn"}`}>
              <h1 key={prompt} className="dw-prompt-in">
                <span className="ink-title dw-prompt-text">Draw {prompt}!</span>
                <Scribble color="var(--sun)" height={9} seed={seedOf(prompt)} />
              </h1>
            </div>

            {empty && !erasing && (
              <div className="dw-hint">
                <Icon name="pencil" size={34} color="var(--plum)" weight={2.4} />
                <p className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Draw right here</p>
                <p className="ink-hand" style={{ fontSize: "var(--fs-2xs)" }}>anything you like!</p>
              </div>
            )}

            {erasing && (
              <div className="dw-erase-note">
                <InkCard tone="#ff6b6b" seed={64} className="px-3 py-1.5" radius={12}>
                  <span className="flex items-center gap-2 ink-on-wax" style={{ fontSize: "var(--fs-2xs)", fontWeight: 800 }}>
                    <Icon name="eraser" size={16} color="#fffaf0" />
                    Rubbing out — tap a crayon to draw
                  </span>
                </InkCard>
              </div>
            )}
          </div>
        </div>

        {/* ── the tool tray, then the crayon box ──────────────────────── */}
        <div className="dw-tools">
          {mediaRow}

          <div className="dw-rail">
            <div
              className="dw-rail-scroll no-scrollbar"
              role="radiogroup"
              aria-label="Pick a crayon colour"
            >
              {CRAYONS.map((k, i) => {
                const active = !erasing && color === k.c;
                const seed = seedOf(k.name);
                const g = crayonGeo(seed);
                const lift = active ? (land ? "translateX(13px)" : "translateY(-15px)") : "none";
                return (
                  <button
                    key={k.c}
                    role="radio"
                    aria-checked={active}
                    aria-label={k.name}
                    title={k.name}
                    onClick={() => pickCrayon(k.c)}
                    className={`dw-crayon ${active ? "is-picked" : ""}`}
                    style={{
                      transform: `${lift} rotate(${active ? g.tilt * 0.4 : g.tilt}deg)`,
                      zIndex: active ? 4 : 1,
                      animationDelay: `${i * 28}ms`,
                    }}
                  >
                    <span className="dw-crayon-slot">
                      <span className="dw-crayon-art">
                        <CrayonArt color={k.c} short={k.short} seed={seed} lifted={active} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {/* the cardboard is sized by CSS and measured back, so the front
                panel always reaches the bottom of the box and no crayon end
                pokes out below it */}
            <div className="dw-box-front" ref={boxRef} aria-hidden="true">
              <BoxFront
                w={Math.max(4, boxBox.w)}
                h={Math.max(4, boxBox.h)}
                axis={land ? "y" : "x"}
              />
            </div>
          </div>

          {!land && <div className="dw-toolrow">{toolRow}</div>}

          <p aria-live="polite" className="visually-hidden">
            {erasing ? "Eraser on" : `${current.name} ${kit.word}`}
          </p>
        </div>

        {/* ── the payoff ──────────────────────────────────────────────── */}
        <div className="dw-go">
          <div className="dw-go-wrap">
            {!empty && (
              <svg aria-hidden="true" className="dw-go-rays" viewBox="0 0 300 90" preserveAspectRatio="none">
                <g
                  fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round"
                  className={reduced ? "" : "dw-twinkle"}
                >
                  <path d="M14 20 Q9 12 6 5" />
                  <path d="M42 10 Q41 5 40 1" />
                  <path d="M286 21 Q291 12 295 5" />
                  <path d="M258 10 Q259 5 260 1" />
                  <path d="M12 70 Q7 78 4 85" />
                  <path d="M288 70 Q293 78 296 85" />
                  <path d="M150 6 Q150 3 150 1" />
                </g>
              </svg>
            )}
            <InkButton
              onClick={() => {
                if (empty) return;
                sfxPop();
                if ("vibrate" in navigator) navigator.vibrate(12);
                if (treat) onTreat?.(strokes);
                else onDone(strokes);
              }}
              disabled={empty}
              tone={empty ? undefined : "#8b46c7"}
              seed={311}
              radius={26}
              weight={3.6}
              className={`dw-hero ${!empty && !reduced ? "dw-breathe" : ""}`}
            >
              {empty ? (
                <span className="dw-hero-idle ink-hand">
                  <Icon name="pencil" size={20} color="var(--ink-soft)" />
                  {treat ? "Draw a treat first" : "Draw something first"}
                </span>
              ) : (
                <span className="dw-hero-live ink-on-wax">
                  <Icon name="sparkle" size={22} color="var(--sun)" fill="var(--sun)" />
                  {treat ? "GIVE IT!" : "MAKE IT ALIVE!"}
                  <Icon name="sparkle" size={22} color="var(--sun)" fill="var(--sun)" />
                </span>
              )}
            </InkButton>
          </div>
        </div>
      </div>

      {/* ── the magic stamp tray ────────────────────────────────────────
          A sheet of the world's creatures. Tap one and it's already alive in
          its world — the lowest-friction way in, below tracing and drawing. */}
      {stampOpen && (
        <div
          className={`dw-stamp-scrim ${reduced ? "" : "dw-stamp-scrim-in"}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={stampTitleId}
          onClick={closeStamps}
        >
          <InkCard
            seed={57}
            radius={22}
            className={`dw-stamp-card ${reduced ? "" : "dw-stamp-card-in"}`}
            contentClassName="dw-stamp-body"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dw-stamp-head">
              <div className="dw-stamp-heading">
                <h2 id={stampTitleId} className="ink-title dw-stamp-title">
                  Pick a magic stamp!
                </h2>
                <Scribble color="var(--sun)" height={9} seed={seedOf("magic stamp")} />
              </div>
              <InkButton
                onClick={closeStamps}
                shape="ellipse"
                seed={22}
                aria-label="Close stamps"
                className="dw-icon-btn"
                style={{ width: TOOL, height: TOOL }}
              >
                <Icon name="close" size={22} />
              </InkButton>
            </div>

            <div className="dw-stamp-grid no-scrollbar">
              {stamps.map((stamp, i) => (
                <InkButton
                  key={stamp.kindId}
                  onClick={() => pickStamp(stamp)}
                  aria-label={stamp.label}
                  seed={seedOf(stamp.kindId)}
                  radius={14}
                  className={`dw-stamp-tile ${reduced ? "" : "dw-stamp-tile-in"}`}
                  style={reduced ? undefined : { animationDelay: `${i * 24}ms` }}
                >
                  <span className="dw-stamp-tileinner">
                    <span className="dw-stamp-thumb">
                      <Doodle name={stamp.doodleId} size={44} />
                    </span>
                    <span className="dw-stamp-name ink-hand" aria-hidden="true">
                      {stampName(stamp.label)}
                    </span>
                  </span>
                </InkButton>
              ))}
            </div>
          </InkCard>
        </div>
      )}
    </div>
  );
}

/* ── screen-local layout ──────────────────────────────────────────────────
   Scoped to this screen with a dw- prefix. Everything here is layout and
   press feel; the materials come from the ink kit. */

const DW_CSS = `
.dw-grid {
  /* one knob for how big the crayons are drawn; the box, its lip shadow and
     the rail headroom all scale off it */
  --cs: 1;
  display: grid;
  height: 100%;
  min-height: 0;
  gap: var(--sp-2);
  grid-template-areas: "top" "canvas" "tools" "go";
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  grid-template-columns: minmax(0, 1fr);
}
.dw-top { grid-area: top; display: flex; align-items: center; gap: 6px; min-width: 0; }
.dw-spacer { flex: 1 1 auto; }
.dw-sep { width: 2px; }
.dw-icon-btn { padding: 0 !important; flex: none; }

.dw-canvasarea { grid-area: canvas; min-height: 0; min-width: 0; padding-top: 11px; }
.dw-sheet { position: relative; width: 100%; height: 100%; }
.dw-sheet > canvas { width: 100%; height: 100%; }
.dw-deco {
  position: absolute; inset: 0; pointer-events: none;
  overflow: visible; z-index: 3;
}

/* the prompt is written on the page, not stuck on a chip above it */
.dw-prompt {
  position: absolute; left: 20px; right: 20px; top: 26px;
  pointer-events: none; z-index: 4;
  transition: opacity var(--dur-3) var(--ease-out);
}
.dw-prompt.is-drawn { opacity: 0.34; }
.dw-prompt-in {
  display: inline-block; max-width: 100%;
  animation: dw-write var(--dur-3) var(--ease-spring) both;
}
.dw-prompt-text {
  display: block; font-size: var(--fs-xl); line-height: 1.1;
  overflow-wrap: anywhere;
}

.dw-hint {
  position: absolute; left: 8%; right: 8%; top: 42%; z-index: 2;
  display: grid; justify-items: center; align-content: start; gap: 3px;
  pointer-events: none; text-align: center; opacity: 0.42;
}
.dw-erase-note {
  position: absolute; left: 0; right: 0; bottom: 12px; z-index: 5;
  display: flex; justify-content: center; pointer-events: none; padding: 0 12px;
}

/* ── the crayon box ── */
.dw-tools { grid-area: tools; display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
.dw-rail { position: relative; min-height: 0; }
.dw-rail-scroll {
  display: flex; gap: 5px; align-items: flex-end;
  overflow-x: auto; overflow-y: hidden;
  padding: calc(17px * var(--cs)) 6px 0;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.dw-rail-scroll > * { scroll-snap-align: center; }
.dw-box-front {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: calc(28px * var(--cs));
  pointer-events: none; z-index: 4; overflow: hidden;
}
/* the crayons descend into the box, so the box throws a shadow up onto them */
.dw-rail::before {
  content: ""; position: absolute; left: 0; right: 0;
  bottom: calc(28px * var(--cs) - 3px); height: calc(9px * var(--cs));
  background: linear-gradient(to bottom, rgba(58,38,16,0), rgba(58,38,16,0.18));
  pointer-events: none; z-index: 3;
}
/* there are more crayons than fit: fade the open end of the box */
.dw-rail::after {
  content: ""; position: absolute; right: 0;
  top: calc(14px * var(--cs)); bottom: calc(26px * var(--cs)); width: 18px;
  background: linear-gradient(to right, rgba(253,243,227,0), rgba(253,243,227,0.92));
  pointer-events: none; z-index: 3;
}
.dw-crayon {
  position: relative; flex: none; border: 0; background: none; padding: 0 5px;
  min-width: 48px; min-height: 48px; cursor: pointer; z-index: 1;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-2) var(--ease-spring);
  animation: dw-tumble var(--dur-3) var(--ease-out) both;
}
.dw-crayon-slot {
  display: block; position: relative;
  width: calc(${CW}px * var(--cs)); height: calc(${CH}px * var(--cs));
}
.dw-crayon-art { position: absolute; left: 0; top: 0; transform: scale(var(--cs)); transform-origin: 0 0; }
@media (hover: hover) {
  .dw-crayon:hover { filter: brightness(1.04); }
}
.dw-crayon:active { transition-duration: var(--dur-1); }

/* ── the tool tray ──
   What to draw *with*, on the line above what colour to draw it in. Three
   equal shares of the row, none of which may fall below --tap, and the
   colour-and-tool name beside them.

   The name is what gives ground when the room runs out: at 320px the three
   tools claim 3 x 48px and the name keeps a 4.6rem column, which is why the
   name moved up here out of the thickness row — that row now holds only its
   own tools and no longer has to wrap onto a second line, so the tray costs
   the page about forty pixels rather than a whole extra row. */
.dw-media { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dw-media-group { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; }
.dw-media-btn {
  flex: 1 1 0; min-width: var(--tap); padding: 0 !important;
  transition: transform var(--dur-2) var(--ease-spring);
}
/* the picked tool is out of the tray and in the child's hand — the same lift
   the picked crayon gets out of the box, plus the circled-it-with-a-crayon
   ring the thickness picks use */
.dw-media-btn.is-picked { transform: translateY(-3px); }
.dw-media-btn:active { transition-duration: var(--dur-1); }
.dw-media-slot { position: relative; display: block; flex: none; }
.dw-media-art { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
@media (hover: hover) {
  .dw-media-btn:hover { filter: brightness(1.03); }
}
/* the tray owns the name now, so it may shrink here rather than reserving a
   line of its own */
.dw-media .dw-current { flex: 0 1 auto; max-width: 7.5rem; }

/* Wraps rather than truncates. The size buttons and eraser are fixed 48px
   targets; they are one flex item (.dw-toolgroup) so a break can never fall
   mid-tray. */
.dw-toolrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
.dw-current {
  flex: 1 1 4.6rem; min-width: 4.6rem;
  font-size: var(--fs-2xs); line-height: 1.12;
  /* two lines rather than an ellipsis: "Sunshine yellow" has to survive a
     narrow column, and clamping keeps the row's height steady either way */
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere;
  padding-left: 2px;
}
.dw-toolgroup { display: flex; align-items: center; gap: 6px; flex: none; }
.dw-sizes { display: flex; align-items: center; gap: 4px; flex: none; }
.dw-size-btn { padding: 0 !important; }
.dw-eraser { padding: 0 !important; flex: none; }

/* ── the payoff ── */
.dw-go { grid-area: go; min-width: 0; }
.dw-go-wrap { position: relative; }
.dw-go-rays {
  position: absolute; left: 0; right: 0; top: -15px; bottom: -13px;
  width: 100%; height: calc(100% + 28px);
  pointer-events: none; z-index: 5;
}
.dw-hero {
  width: 100%; min-height: var(--tap-hero);
  font-family: "Baloo 2", "Nunito", ui-rounded, system-ui, sans-serif;
  font-weight: 800; font-size: var(--fs-xl);
}
.dw-hero-idle {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: var(--fs-md);
}
.dw-hero-live { display: flex; align-items: center; justify-content: center; gap: 10px; }

/* ── the magic stamp: entry button + tray ──
   The tray is a sheet of paper laid over the room, the same idiom as the parent
   gate: a scrim, a drawn card taped down, and the world's creatures inside. */
.dw-stamp-scrim {
  position: fixed; inset: 0; z-index: 60;
  display: grid; place-items: center;
  overflow-y: auto; padding: 16px;
  background: rgba(45, 41, 38, 0.5);
}
.dw-stamp-scrim-in { animation: dw-stamp-fade var(--dur-2) var(--ease-out) both; }
.dw-stamp-card { width: 100%; max-width: 380px; margin: auto; padding: 16px 16px 18px; }
.dw-stamp-card-in { animation: dw-stamp-pop var(--dur-3) var(--ease-spring) both; }
.dw-stamp-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; margin-bottom: 8px;
}
.dw-stamp-heading { flex: 1 1 auto; min-width: 0; }
.dw-stamp-title { font-size: var(--fs-lg); line-height: 1.08; }
/* scrolls when the roster is long; never spills sideways on a 320px phone */
.dw-stamp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  max-height: min(52vh, 380px);
  overflow-y: auto; overflow-x: hidden;
  padding: 4px 2px 6px;
}
.dw-stamp-tile { padding: 8px 4px 6px !important; min-height: 74px; }
.dw-stamp-tile-in { animation: dw-tumble var(--dur-3) var(--ease-out) both; }
.dw-stamp-tileinner {
  display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100%;
}
.dw-stamp-thumb { display: grid; place-items: center; width: 44px; height: 44px; }
.dw-stamp-name {
  font-size: var(--fs-2xs); line-height: 1.05; text-align: center;
  overflow-wrap: anywhere; color: var(--ink);
}
@keyframes dw-stamp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dw-stamp-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
/* the roster is short enough to centre once the card is wide */
@media (min-width: 420px) {
  .dw-stamp-grid { justify-content: center; }
}

@keyframes dw-write { from { opacity: 0; transform: translateY(5px) rotate(-1.4deg); } to { opacity: 1; transform: none; } }
@keyframes dw-tumble { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; } }
@keyframes dw-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.012); } }
@keyframes dw-twink { 0%, 100% { opacity: 0.3; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.05); } }
.dw-breathe { animation: dw-breathe 2.6s var(--ease-in-out) infinite; }
.dw-twinkle { animation: dw-twink 1.9s var(--ease-in-out) infinite; transform-origin: 50% 50%; }

/* ── landscape phone: the box becomes a rail beside the page ── */
.dw-land .dw-grid {
  grid-template-areas: "tools top" "tools canvas" "tools go";
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  column-gap: var(--sp-3);
  row-gap: var(--sp-2);
}
.dw-land .dw-tools { width: 96px; min-width: 96px; height: 100%; min-height: 0; gap: 0; }
.dw-land .dw-rail { flex: 1 1 auto; min-height: 0; }
.dw-land .dw-rail-scroll {
  flex-direction: column; align-items: flex-start; height: 100%;
  overflow-x: hidden; overflow-y: auto;
  /* no left padding: the crayons start at the box wall so the cardboard
     covers their blunt ends and only the sharpened half sticks out */
  padding: 4px 0 26px;
  scroll-snap-type: y proximity;
}
.dw-land .dw-box-front { left: 0; right: auto; top: 0; bottom: 0; width: 28px; height: auto; }
.dw-land .dw-rail::before {
  left: 25px; right: auto; top: 0; bottom: 0; width: 9px; height: auto;
  background: linear-gradient(to right, rgba(58,38,16,0.22), rgba(58,38,16,0));
}
/* there are more crayons than fit down the side: fade the open end */
.dw-land .dw-rail::after {
  left: 30px; right: 0; top: auto; bottom: 0; width: auto; height: 30px;
  background: linear-gradient(to bottom, rgba(253,243,227,0), rgba(253,243,227,0.88));
}
.dw-land .dw-crayon { padding: 2px 0; }
.dw-land .dw-crayon-slot { width: calc(${CH}px * var(--cs)); height: calc(${CW}px * var(--cs)); }
.dw-land .dw-crayon-art {
  left: 50%; top: 50%;
  margin-left: ${-CW / 2}px; margin-top: ${-CH / 2}px;
  transform: rotate(90deg) scale(var(--cs)); transform-origin: 50% 50%;
}
.dw-land .dw-toolrow-top { flex: 1 1 auto; min-width: 0; justify-content: flex-start; }
/* the tray becomes the head of the column: three tools lying down the side of
   the page, exactly as the crayons below them lie down. The crayon box keeps
   the rest of the column and goes on scrolling, which it already did — there
   were never ten crayons' worth of room down the side of a landscape phone. */
.dw-land .dw-media {
  flex-direction: column; align-items: stretch; flex: none;
  gap: 4px; margin-bottom: 6px;
}
.dw-land .dw-media-group { flex-direction: column; align-items: stretch; gap: 4px; flex: none; }
.dw-land .dw-media-btn { flex: none; width: 100%; }
.dw-land .dw-media-btn.is-picked { transform: translateX(3px); }
.dw-land .dw-media .dw-current {
  flex: none; min-width: 0; max-width: none; text-align: center; padding: 0 2px;
}
.dw-land .dw-media-art {
  left: 50%; top: 50%;
  margin-left: ${-TW / 2}px; margin-top: ${-TH / 2}px;
  transform-origin: 50% 50%;
}
.dw-land .dw-canvasarea { padding-top: 10px; }
.dw-land .dw-prompt { top: 22px; left: 16px; right: 16px; }
.dw-land .dw-prompt-text { font-size: var(--fs-lg); }
.dw-land .dw-hint { top: 34%; }
.dw-land .dw-hero { min-height: 50px; font-size: var(--fs-lg); }
.dw-land .dw-hero-idle { font-size: var(--fs-sm); }
.dw-land .dw-go-rays { top: -7px; bottom: -7px; height: calc(100% + 14px); }

/* ── a tablet: the same box, held closer ──
   Guarded on height as well as width so a landscape phone (which is wide but
   short, and runs the rail layout above) never picks this up. */
@media (min-width: 700px) and (min-height: 620px) {
  .dw-grid { --cs: 1.34; }
  .dw-toolrow { justify-content: center; gap: var(--sp-3); }
  .dw-current {
    flex: 0 1 auto; min-width: 0; max-width: 16rem;
    font-size: var(--fs-xs); padding-left: 0;
  }
  .dw-sizes { gap: 8px; }
  .dw-toolgroup { gap: 12px; }
  .dw-media { justify-content: center; gap: var(--sp-3); }
  .dw-media-group { flex: 0 1 auto; gap: 10px; }
  .dw-media-btn { flex: 0 0 auto; min-width: var(--tap-hero); }
  .dw-media .dw-current { max-width: 12rem; }
  .dw-canvasarea { padding-top: 14px; }
  .dw-icon-btn { width: 56px !important; height: 56px !important; }
  .dw-top { gap: 10px; }
}
/* A short phone. The paper is the point, so the crayon box gives up a little
   height rather than the sheet — the tool tray above it is new, and it should
   not be the drawing that pays for it. Every crayon stays a 48px target:
   .dw-crayon's minimums are fixed pixels and do not scale with --cs. */
@media (orientation: portrait) and (max-height: 600px) {
  .dw-grid { --cs: 0.82; }
}

@media (min-width: 820px) and (min-height: 620px) {
  /* only once every crayon is certain to fit: centring a scroller that
     overflows would put its first crayon out of reach */
  .dw-rail-scroll { justify-content: center; gap: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .dw-crayon, .dw-media-btn, .dw-prompt, .dw-prompt-in { transition: none; animation: none; }
  .dw-breathe, .dw-twinkle { animation: none; }
  .dw-stamp-scrim-in, .dw-stamp-card-in, .dw-stamp-tile-in { animation: none; }
}
`;
