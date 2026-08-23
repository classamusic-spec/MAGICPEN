import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Stroke, RecognitionResult, CreatureKind } from "@/lib/types";
import { drawStrokeFull, strokesBounds } from "@/lib/crayon";
import { CREATURE_KINDS, kindById } from "@/lib/creatures";
import { sfxScan, sfxMagic, sfxTap, sfxHappy } from "@/lib/audio";
import { hand, paperTile, roughEllipse, roughUnderline, seedOf, waxTile } from "@/lib/ink";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";

interface Props {
  strokes: Stroke[];
  result: RecognitionResult;
  name: string;
  photo?: string | null;   // paper-photo drawing (data URL) — skips the guess
  onShuffleName: (kindId: string) => string;
  onConfirm: (kindId: string, name: string) => void;
  onRedraw: () => void;
}

type Phase = "scan" | "guess" | "pick";

/* mystery last, and on its own: "something else" is a real answer, not a
   failure, so it gets a card of its own width rather than a slot in the grid */
const NAMED = CREATURE_KINDS.filter((k) => k.id !== "mystery");
const MYSTERY = CREATURE_KINDS.find((k) => k.id === "mystery") ?? CREATURE_KINDS[CREATURE_KINDS.length - 1];

/* ── the crayon box ──────────────────────────────────────────────────────── */

const C = {
  cherry: "#e63b2e",
  orange: "#ff7a1a",
  sun: "#ffc72c",
  leaf: "#3aae3a",
  lagoon: "#00c2b9",
  ocean: "#2f6fe4",
  grape: "#8b46c7",
  candy: "#fb66e5",
  cocoa: "#7a4a21",
  ink: "#2d2926",
  cream: "#fffaf0",
  paper: "#fffdf7",
};

/** Each creature gets one crayon out of the box — its wax, its ink, its badge. */
const TONE: Record<string, string> = {
  fish: C.lagoon, car: C.cherry, sun: C.sun, star: C.sun, bird: C.ocean,
  butterfly: C.candy, flower: C.candy, tree: C.leaf, snake: C.leaf,
  rainbow: C.grape, balloon: C.orange, rocket: C.ocean, heart: C.cherry,
  house: C.cocoa, mystery: C.grape,
};
const toneOf = (id: string) => TONE[id] ?? C.grape;

/** Wax this pale needs dark letters on it. */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 168;
}
const onWax = (hex: string) => (isLight(hex) ? C.ink : C.cream);

/* ── drawn creatures ─────────────────────────────────────────────────────── */
// Fourteen doodles plus a mystery, drawn on a 24×24 grid with the same round
// caps and off-true geometry as the app's icons. Emoji are somebody else's
// artwork rendered differently on every phone; these are ours.

interface Part { d: string; c?: string; fill?: string; w?: number }

const DOODLES: Record<string, Part[]> = {
  fish: [
    { d: "M15.4 12.2 20.9 8.3v7.9z", c: C.lagoon, fill: "rgba(0,194,185,0.22)" },
    { d: "M9.5 6.5a6.3 5.5 0 1 0 .1 11 6.3 5.5 0 0 0-.1-11z", c: C.lagoon, fill: "rgba(0,194,185,0.22)" },
    { d: "M9.6 6.8c.5-1.7 1.9-2.6 3.4-2.4-.2 1.7-1.1 2.6-2.4 2.8", c: C.lagoon },
    { d: "M6.4 10.5h.05", c: C.ink, w: 2.6 },
    { d: "M4.5 13.3c1 .9 2.1.9 3.1 0", c: C.ink, w: 1.6 },
  ],
  car: [
    { d: "M2.6 15.7v-2.5l2.4-4.5h8.8l3.9 4.5h3.8v2.5z", c: C.cherry, fill: "rgba(230,59,46,0.2)" },
    { d: "M6.6 12.8 8.2 9.6h4.6v3.2z", c: C.cherry },
    { d: "M7.3 15.3a2.4 2.4 0 1 0 .1 4.8 2.4 2.4 0 0 0-.1-4.8z", c: C.cocoa },
    { d: "M16.7 15.3a2.4 2.4 0 1 0 .1 4.8 2.4 2.4 0 0 0-.1-4.8z", c: C.cocoa },
  ],
  sun: [
    { d: "M12 6.8a5.2 5.2 0 1 0 .1 10.4A5.2 5.2 0 0 0 12 6.8z", c: C.sun, fill: "rgba(255,199,44,0.4)" },
    { d: "M12 1.7v3M11.9 19.4v2.9M1.8 12h3M19.3 11.9h2.9M4.7 4.6 6.9 6.8M17.1 17l2.2 2.2M19.2 4.7 17 6.9M6.8 17.1l-2.2 2.2", c: C.orange },
    { d: "M10.2 11.4h.05M13.7 11.3h.05", c: C.ink, w: 2.2 },
    { d: "M10.1 13.6c1.2 1.2 2.6 1.2 3.8 0", c: C.ink, w: 1.7 },
  ],
  star: [
    { d: "M12 3.3 14.9 9l6.3 1-4.6 4.4 1.1 6.3-5.6-3-5.7 2.9 1.2-6.2L3 10.1l6.3-1z", c: C.sun, fill: "rgba(255,199,44,0.4)" },
    { d: "M10.4 11.4h.05M13.7 11.3h.05", c: C.ink, w: 2.2 },
  ],
  bird: [
    { d: "M12 6.9c3.1 0 5.5 2.5 5.5 5.5S15.1 18 12 18s-5.6-2.6-5.6-5.6S8.9 6.9 12 6.9z", c: C.ocean, fill: "rgba(47,111,228,0.2)" },
    { d: "M17.3 10.8l3.5 1.4-3.4 1.4", c: C.orange },
    { d: "M9.2 12.4c1.9-1.4 4-1 5.3.6-1.5 1.8-3.9 1.6-5.3-.6z", c: C.ocean },
    { d: "M14.9 10.7h.05", c: C.ink, w: 2.4 },
    { d: "M10.4 17.8 9.5 20.5M13.4 17.8l.9 2.7", c: C.orange },
  ],
  butterfly: [
    { d: "M11.5 8.6C9.6 5.3 4.5 5.1 3.7 8c-.7 2.6 3 4.3 7.8 4.5zM11.5 13c-4.5.2-7.2 1.8-6.4 4.2.8 2.2 4.8 1.4 6.4-1.6z", c: C.candy, fill: "rgba(251,102,229,0.22)" },
    { d: "M12.5 8.6c1.9-3.3 7-3.5 7.8-.6.7 2.6-3 4.3-7.8 4.5zM12.5 13c4.5.2 7.2 1.8 6.4 4.2-.8 2.2-4.8 1.4-6.4-1.6z", c: C.candy, fill: "rgba(251,102,229,0.22)" },
    { d: "M12 6.7v10.6", c: C.grape },
    { d: "M11.7 6.8 9.9 4.3M12.3 6.8 14.2 4.4", c: C.grape },
  ],
  flower: [
    { d: "M12 3.6a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2zM15.3 5.9a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2zM14 9.8a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2zM9.9 9.8a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2zM8.7 5.9a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2z", c: C.candy, fill: "rgba(251,102,229,0.2)" },
    { d: "M12 7.8a1.8 1.8 0 1 0 .1 3.6 1.8 1.8 0 0 0-.1-3.6z", c: C.sun, fill: "rgba(255,199,44,0.55)" },
    { d: "M12 14.1v6.6M12 17.4c-2 0-3.4-1.3-3.6-3.1 2-.4 3.4.8 3.6 3.1z", c: C.leaf },
  ],
  tree: [
    { d: "M12 3.2c-3.7 0-6.7 2.6-6.7 5.9 0 3.3 3 5.6 6.7 5.6s6.8-2.3 6.8-5.6c0-3.3-3.1-5.9-6.8-5.9z", c: C.leaf, fill: "rgba(58,174,58,0.22)" },
    { d: "M10.5 14.4v6.2M13.5 14.3v6.3M9.2 20.7h5.6", c: C.cocoa },
  ],
  snake: [
    { d: "M4.4 19.9C9 19.9 8.5 15 12.8 15c3.5 0 3.5-4.1 0-4.1-2.7 0-3.5-1.2-3.5-2.9 0-2 1.9-3.1 3.7-3.3", c: C.leaf, w: 2.4 },
    { d: "M14.6 2a2.6 2.6 0 1 0 .1 5.2 2.6 2.6 0 0 0-.1-5.2z", c: C.leaf, fill: "rgba(58,174,58,0.24)" },
    { d: "M14.9 3.9h.05", c: C.ink, w: 2.2 },
    { d: "M17.2 4.7h2.3M19.5 4.7 21 3.6M19.5 4.7 21 5.8", c: C.cherry, w: 1.7 },
  ],
  rainbow: [
    { d: "M3.1 20.3a8.9 8.9 0 0 1 17.8 0", c: C.cherry, w: 2.5 },
    { d: "M6.4 20.3a5.6 5.6 0 0 1 11.2 0", c: C.sun, w: 2.5 },
    { d: "M9.7 20.3a2.3 2.3 0 0 1 4.6 0", c: C.lagoon, w: 2.5 },
  ],
  balloon: [
    { d: "M12 2.8c-3.2 0-5.6 2.5-5.6 5.6 0 3.6 3.6 6.5 5.6 7.8 2-1.3 5.6-4.2 5.6-7.8 0-3.1-2.4-5.6-5.6-5.6z", c: C.orange, fill: "rgba(255,122,26,0.22)" },
    { d: "M10.8 16.2h2.4L12 17.8z", c: C.orange },
    { d: "M12 17.9c0 2 1.9 1.6 1.9 3.6", c: C.cocoa, w: 1.8 },
    { d: "M9.3 6.6c.4-1.4 1.4-2.2 2.7-2.3", c: C.sun, w: 1.7 },
  ],
  rocket: [
    { d: "M12 2.3c2.8 2.6 4.3 5.9 4.3 9.5l-1.7 4.7H9.4L7.7 11.8c0-3.6 1.5-6.9 4.3-9.5z", c: C.ocean, fill: "rgba(47,111,228,0.18)" },
    { d: "M7.8 11.6 4.7 15l.7 3.7 2.7-2.3M16.2 11.6l3.1 3.4-.7 3.7-2.7-2.3", c: C.ocean },
    { d: "M12 7.3a2.1 2.1 0 1 0 .1 4.2 2.1 2.1 0 0 0-.1-4.2z", c: C.lagoon, fill: "rgba(0,194,185,0.4)" },
    { d: "M10 16.7c.3 2.1.9 3.6 2 5 1-1.4 1.6-2.9 1.9-5", c: C.orange },
  ],
  heart: [
    { d: "M12 20.4S3.2 15.2 3.2 9.2c0-2.8 2.2-5 4.9-5 1.9 0 3.2 1.1 3.9 2.4.7-1.3 2-2.4 3.9-2.4 2.7 0 4.9 2.2 4.9 5 0 6-8.8 11.2-8.8 11.2z", c: C.cherry, fill: "rgba(230,59,46,0.24)" },
    { d: "M7.6 8c-.1 1 .2 2 .9 2.8", c: C.cream, w: 1.6 },
  ],
  house: [
    { d: "M5.2 11.6v8.9h13.6v-8.9", c: C.cocoa },
    { d: "M3.1 12.2 12 4.1l9 8.1", c: C.cherry, w: 2.5 },
    { d: "M9.8 20.4v-5.3h4.3v5.3", c: C.cocoa, fill: "rgba(122,74,33,0.16)" },
    { d: "M15.4 13.4h2.4v2.4h-2.4z", c: C.sun, fill: "rgba(255,199,44,0.5)" },
  ],
  mystery: [
    { d: "M6.4 14.7c-2-4.3.8-9 5.4-9.2 4.7-.2 7.6 3.6 6.7 7.8-.7 3.2-3.2 5.4-6.5 5.4-2.8 0-5-1.5-5.6-4z", c: C.grape, fill: "rgba(139,70,199,0.18)" },
    { d: "M10.1 12h.05M14 11.9h.05", c: C.ink, w: 2.4 },
    { d: "M10.3 14.7c1.2 1.3 2.9 1.3 4.1 0", c: C.ink, w: 1.8 },
    { d: "M12 5V2.3M18.7 6.7 20.4 5M5.3 6.7 3.6 5", c: C.sun, w: 1.9 },
  ],
};

function doodlePaths(kindId: string, mono?: string) {
  const parts = DOODLES[kindId] ?? DOODLES.mystery;
  return parts.map((p, i) => (
    <path
      key={i}
      d={p.d}
      fill={mono ? "none" : p.fill ?? "none"}
      stroke={mono ?? p.c ?? C.ink}
      strokeWidth={p.w ?? 2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

/** A creature drawn at any size. `mono` re-inks it in one colour, for wax. */
function Doodle({ kindId, size = 48, mono }: { kindId: string; size?: number; mono?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", overflow: "visible" }}
    >
      {doodlePaths(kindId, mono)}
    </svg>
  );
}

/* ── measuring, so a drawn edge lands on the real pixel box ──────────────── */

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width / 2) * 2;
      const h = Math.round(r.height / 2) * 2;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** The app lays out landscape phones as a split; the panel gets tight there. */
const SHORT_LANDSCAPE = "(orientation: landscape) and (max-height: 560px)";

function useShortLandscape(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(SHORT_LANDSCAPE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(SHORT_LANDSCAPE).matches : false),
    () => false,
  );
}

/* ── the scan: a line being inked across the page ────────────────────────── */

function ScanRule({ progress, reduced }: { progress: number; reduced: boolean }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const H = 22;
  const d = useMemo(() => (box.w > 8 ? roughUnderline(box.w, H, 12) : ""), [box.w]);
  const pct = Math.round(progress * 100);
  return (
    <div
      ref={ref}
      className="relative mx-auto mt-2"
      style={{ width: "min(17rem, 78%)", height: H + 14 }}
      role="progressbar"
      aria-label="Reading your drawing"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      {d && (
        <svg width={box.w} height={H} viewBox={`0 0 ${box.w} ${H}`} aria-hidden="true" style={{ overflow: "visible" }}>
          {/* the line the pen is about to follow */}
          <path d={d} fill="none" stroke="rgba(86,62,121,0.22)" strokeWidth={4} strokeLinecap="round" strokeDasharray="1 11" />
          {/* the ink already laid down */}
          <path
            d={d}
            fill="none"
            stroke="var(--plum)"
            strokeWidth={6}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - pct}
          />
        </svg>
      )}
      {/* the pen doing the reading */}
      <span
        aria-hidden="true"
        className="absolute"
        style={{
          left: `calc(${pct}% - 7px)`,
          top: -7,
          transform: "rotate(34deg)",
          transition: "left 90ms linear",
        }}
      >
        <Icon name="pencil" size={30} color={C.ink} weight={2.4} />
      </span>
      {!reduced && (
        <span
          aria-hidden="true"
          className="absolute anim-sparkle"
          style={{ left: `calc(${pct}% + 4px)`, top: -6 }}
        >
          <Icon name="sparkle" size={14} color={C.sun} fill={C.sun} />
        </span>
      )}
    </div>
  );
}

/* ── the reveal badge: a drawn medal with the creature on it ─────────────── */

function KindBadge({ kindId, reduced, compact }: { kindId: string; reduced: boolean; compact?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const tone = toneOf(kindId);
  const waxUrl = waxTile(tone);
  const S = 132;
  const seed = seedOf(kindId);
  const outer = useMemo(() => roughEllipse(S, S, { seed }), [seed]);
  const inner = useMemo(() => roughEllipse(S * 0.72, S * 0.72, { seed: seed + 41 }), [seed]);
  const rays = useMemo(() => {
    const r = hand(seed + 7);
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + r() * 0.12;
      const r1 = S * 0.55 + r() * 4;
      const r2 = r1 + 7 + r() * 9;
      return {
        x1: S / 2 + Math.cos(a) * r1, y1: S / 2 + Math.sin(a) * r1,
        x2: S / 2 + Math.cos(a) * r2, y2: S / 2 + Math.sin(a) * r2,
      };
    });
  }, [seed]);
  const K = (S * 0.52) / 24;

  return (
    <div
      className="relative mx-auto shrink-0"
      style={{ width: compact ? "clamp(4.75rem, 25vmin, 7rem)" : "clamp(6rem, 30vmin, 10.5rem)", aspectRatio: "1 / 1" }}
    >
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" height="100%" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        <defs>
          {waxUrl && (
            <pattern id={`bw-${uid}`} patternUnits="userSpaceOnUse" width="96" height="96">
              <image href={waxUrl} width="96" height="96" />
            </pattern>
          )}
          <filter id={`bl-${uid}`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#4a3a28" floodOpacity="0.3" />
          </filter>
        </defs>
        <g
          className={reduced ? "" : "anim-spin-slow"}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {rays.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={C.sun} strokeWidth={5.5} strokeLinecap="round" opacity={0.9} />
          ))}
        </g>
        <path d={outer} fill={waxUrl ? `url(#bw-${uid})` : tone} filter={`url(#bl-${uid})`} />
        <path d={outer} fill="none" stroke={C.ink} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
        <g transform={`translate(${S * 0.14} ${S * 0.14})`}>
          <path d={inner} fill={C.paper} stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform={`translate(${(S - 24 * K) / 2} ${(S - 24 * K) / 2}) scale(${K})`}>
          {doodlePaths(kindId)}
        </g>
      </svg>
    </div>
  );
}

/* ── one drawn card in the "what did you draw?" set ──────────────────────── */

function KindCard({
  kind, active, wide, dense, onPick,
}: { kind: CreatureKind; active: boolean; wide?: boolean; dense?: boolean; onPick: () => void }) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const tone = toneOf(kind.id);
  const seed = seedOf(kind.id);
  const tilt = ((seed % 5) - 2) * 0.7;
  const label = kind.id === "mystery" ? "Something else!" : kind.label;
  const mono = active ? onWax(tone) : undefined;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={kind.id === "mystery" ? "Something else — a mystery creature" : kind.label}
      className={`ink-btn relative isolate ${wide ? "flex items-center gap-3 text-left" : "flex flex-col items-center justify-center gap-1"}`}
      style={{
        // a landscape phone has barely any height; the cards get shorter so two
        // full rows fit and a third peeks out to say "keep going"
        minHeight: wide ? 74 : dense ? 68 : 96,
        padding: wide ? "0.5rem 0.9rem" : dense ? "0.25rem 0.3rem" : "0.5rem 0.35rem",
        gridColumn: wide ? "1 / -1" : undefined,
      }}
    >
      {/* the card itself hangs a little crooked; the writing on it does not */}
      <span aria-hidden="true" className="absolute inset-0" style={{ transform: `rotate(${tilt}deg)` }}>
        <InkShape
          w={box.w}
          h={box.h}
          seed={seed}
          weight={active ? 3.8 : 2.6}
          radius={Math.max(10, box.h * 0.2)}
          fill={active ? { kind: "wax", color: tone } : { kind: "paper" }}
        />
      </span>

      <span className="relative z-10 shrink-0">
        <Doodle kindId={kind.id} size={wide ? 44 : dense ? 34 : 46} mono={mono} />
      </span>
      <span className={`relative z-10 ${wide ? "flex-1" : "text-center px-1"}`}>
        <span
          className="block font-display font-extrabold leading-tight"
          style={{ color: mono ?? C.ink, fontSize: "var(--fs-sm)", textShadow: mono && mono === C.cream ? "0 2px 0 rgba(45,41,38,0.32)" : undefined }}
        >
          {label}
        </span>
        {wide && (
          <span className="block type-fine" style={{ color: mono ? (mono === C.cream ? "rgba(255,250,240,0.9)" : "rgba(45,41,38,0.7)") : "var(--ink-soft)" }}>
            a mystery creature — that counts!
          </span>
        )}
      </span>

      {active && (
        <span aria-hidden="true" className="absolute z-20" style={{ top: -10, right: -8, width: 30, height: 30 }}>
          <svg width={30} height={30} viewBox="0 0 30 30" style={{ overflow: "visible" }}>
            <path d={roughEllipse(30, 30, { seed: 5 })} fill={C.paper} stroke={C.ink} strokeWidth={2.6} />
          </svg>
          <span className="absolute inset-0 grid place-items-center">
            <Icon name="check" size={17} color={C.leaf} weight={3.2} />
          </span>
        </span>
      )}
    </button>
  );
}

/* ── ambient: a few marks left on the page ───────────────────────────────── */

const MARK_GLYPHS = [
  "M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9",
  "M12 2.6c.6 4.6 2 6 6.6 6.6-4.6.7-6 2.1-6.6 6.7-.6-4.6-2-6-6.6-6.7 4.6-.6 6-2 6.6-6.6z",
  "M12 9.5h.06",
];

function PaperMarks() {
  const marks = useMemo(() => {
    const r = hand(9182);
    return Array.from({ length: 11 }, (_, i) => ({
      left: `${4 + r() * 92}%`,
      top: `${4 + r() * 92}%`,
      size: 12 + r() * 16,
      glyph: MARK_GLYPHS[i % MARK_GLYPHS.length],
      color: i % 4 === 0 ? C.sun : "var(--plum)",
      opacity: i % 4 === 0 ? 0.3 : 0.14,
      rot: r() * 60 - 30,
      delay: `${(i % 6) * 0.24}s`,
      lively: i % 4 === 0,
    }));
  }, []);
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {marks.map((m, i) => (
        <svg
          key={i}
          className={m.lively ? "anim-sparkle absolute" : "absolute"}
          width={m.size}
          height={m.size}
          viewBox="0 0 24 24"
          style={{ left: m.left, top: m.top, opacity: m.opacity, transform: `rotate(${m.rot}deg)`, animationDelay: m.delay }}
        >
          <path d={m.glyph} fill="none" stroke={m.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function MagicReveal({ strokes, result, name, photo, onShuffleName, onConfirm, onRedraw }: Props) {
  const isPhoto = Boolean(photo);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageRef, stageBox] = useBox<HTMLDivElement>();
  const [phase, setPhase] = useState<Phase>("scan");
  const [kindId, setKindId] = useState(result.kindId);
  const [creatureName, setCreatureName] = useState(name);
  const [scanX, setScanX] = useState(0);
  const [rollTick, setRollTick] = useState(0);
  const reduced = usePrefersReducedMotion();
  const short = useShortLandscape();
  const fibre = useMemo(() => paperTile(), []);
  const kind = kindById(kindId);
  const tone = toneOf(kindId);

  // scan sweep — 2s, then the drawing wakes up
  useEffect(() => {
    sfxScan();
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = (t - t0) / 2000;
      setScanX(Math.min(1, p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setPhase(isPhoto ? "pick" : "guess"); // photos skip straight to "what is it?"
        sfxHappy();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live wiggling drawing (strokes) or wobbling photo drawing
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    let photoImg: HTMLImageElement | null = null;
    if (photo) {
      const im = new Image();
      im.onload = () => { photoImg = im; };
      im.src = photo;
    }
    const fitAndLoop = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      const b = strokesBounds(strokes);
      // the sheet shrinks a lot in the picker — the margin has to shrink with it
      const pad = Math.max(8, Math.min(40, Math.min(r.width, r.height) * 0.12));
      const scale = Math.max(
        0.05,
        Math.min((r.width - pad * 2) / Math.max(1, b.w), (r.height - pad * 2) / Math.max(1, b.h), 2.2)
      );
      const cx = r.width / 2;
      const cy = r.height / 2;
      const ctx = cv.getContext("2d")!;
      const loop = (t: number) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, r.width, r.height);
        const excited = phase !== "scan";
        if (photo) {
          if (photoImg) {
            const fit = Math.min((r.width - pad) / photoImg.width, (r.height - pad) / photoImg.height, 1.4);
            const pw = photoImg.width * fit;
            const ph = photoImg.height * fit;
            const sq = reduced ? 1 : 1 + Math.sin(t / (excited ? 90 : 320)) * (excited ? 0.07 : 0.02);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(reduced ? 0 : Math.sin(t / (excited ? 260 : 900)) * (excited ? 0.08 : 0.02));
            ctx.scale(sq, 1 / sq);
            ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
          }
          // a still page for anyone who asked for less motion
          if (!reduced || !photoImg) raf = requestAnimationFrame(loop);
          return;
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        strokes.forEach((s, i) =>
          drawStrokeFull(ctx, s, i + 1, {
            time: reduced ? 0 : t / 1000,
            amp: reduced ? 0.6 : excited ? 4 : 1.2,
            freq: 1.2,
            speed: excited ? 10 : 3,
            tailBias: 1,
          })
        );
        ctx.restore();
        if (!reduced) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    fitAndLoop();
    const ro = new ResizeObserver(fitAndLoop);
    ro.observe(wrap);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [strokes, phase, photo, reduced]);

  /* torn paper confetti — real bits of coloured stock, not emoji */
  const confetti = useMemo(() => {
    const r = hand(31);
    const tones = [C.sun, C.candy, C.lagoon, C.cherry, C.grape, C.leaf, C.orange];
    return Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + r() * 0.5;
      const d = 110 + r() * 150;
      return {
        dx: `${Math.cos(a) * d}px`,
        dy: `${Math.sin(a) * d - 50}px`,
        rot: `${(i % 2 ? 1 : -1) * (200 + r() * 320)}deg`,
        w: 6 + r() * 8,
        h: 8 + r() * 10,
        color: tones[i % tones.length],
        round: r() > 0.72,
        delay: `${(i % 6) * 0.035}s`,
      };
    });
  }, []);

  /* a drawn "ta-da" burst behind the sheet, once the creature is awake */
  const burst = useMemo(() => {
    const r = hand(77);
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + r() * 0.2;
      return { a, r1: 0.36 + r() * 0.04, r2: 0.46 + r() * 0.08, w: 3 + r() * 3 };
    });
  }, []);

  const heading = phase === "scan" ? "Let me look…" : phase === "guess" ? "It's alive!" : "What did you draw?";
  const awake = phase !== "scan";
  const glow = awake && !reduced ? "drop-shadow(0 0 18px rgba(255,199,44,0.55))" : undefined;

  const rollName = () => {
    setCreatureName(onShuffleName(kindId));
    setRollTick((n) => n + 1);
    sfxTap();
  };

  const choose = (id: string) => {
    setKindId(id);
    setCreatureName(onShuffleName(id));
    setPhase("guess");
    sfxTap();
  };

  const title = kind.id === "mystery" ? "MYSTERY!" : `${kind.label.toUpperCase()}!`;

  /* Landscape puts the page and the panel side by side. Who deserves the room
     changes with the phase: while we're reading, nothing else is on screen, so
     give the whole width to the drawing; while you're choosing, the choices
     need it more than the thumbnail does. On tall screens the composition is
     centred instead of stretched across a tablet. */
  const gridStyle: React.CSSProperties = short
    ? {
        gridTemplateColumns:
          phase === "scan" ? "minmax(0, 1fr) 0px"
          : phase === "pick" ? "minmax(0, 13.5rem) minmax(0, 1fr)"
          : "minmax(0, 1fr) minmax(0, 20rem)",
      }
    : { maxWidth: "min(100%, 44rem)", marginInline: "auto" };

  /* The sheet gives ground as the screen fills up, but on a tall tablet it is
     allowed to be properly big instead of a stamp adrift in cream. */
  const stageMaxHeight =
    phase === "pick" ? "min(100%, max(11rem, 30dvh))"
    : phase === "guess" ? "min(100%, max(21rem, 46dvh))"
    : "min(100%, max(30rem, 38dvh))";

  return (
    <div className="screen ink-paper relative overflow-hidden">
      <PaperMarks />

      <div className="reveal-grid pad-x pad-t pad-b relative z-10" style={gridStyle}>
        {/* ── heading + the pen reading the page ── */}
        <div className="reveal-head text-center">
          <h1 className={`ink-title ${phase === "scan" ? "type-title" : "type-h2"}`} aria-live="polite">
            {heading}
          </h1>
          {phase === "scan" && <ScanRule progress={scanX} reduced={reduced} />}
        </div>

        {/* ── the drawing, taped into the book, wiggling to life ── */}
        <div className="reveal-stage grid place-items-center">
          <div
            ref={stageRef}
            className="relative"
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "min(100%, 28rem)",
              // the sheet shrinks right down while you are choosing, so the
              // choices get the room they need
              maxHeight: stageMaxHeight,
            }}
          >
            {awake && (
              <svg
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none anim-pop-in"
                width={stageBox.w}
                height={stageBox.h}
                style={{ overflow: "visible" }}
              >
                {burst.map((b, i) => {
                  const m = Math.min(stageBox.w, stageBox.h);
                  const cx = stageBox.w / 2;
                  const cy = stageBox.h / 2;
                  return (
                    <line
                      key={i}
                      x1={cx + Math.cos(b.a) * m * b.r1}
                      y1={cy + Math.sin(b.a) * m * b.r1}
                      x2={cx + Math.cos(b.a) * m * b.r2}
                      y2={cy + Math.sin(b.a) * m * b.r2}
                      stroke={C.sun}
                      strokeWidth={b.w}
                      strokeLinecap="round"
                      opacity={0.5}
                    />
                  );
                })}
              </svg>
            )}

            <div className="absolute inset-0" style={{ filter: glow }}>
              <InkShape w={stageBox.w} h={stageBox.h} seed={64} weight={3.2} wobble={3.6} radius={16} />
            </div>

            <div
              ref={wrapRef}
              className="absolute overflow-hidden"
              style={{ inset: 9, borderRadius: 12, backgroundImage: fibre ? `url("${fibre}")` : undefined }}
            >
              <canvas ref={canvasRef} className="absolute inset-0" />

              {phase === "scan" && (
                <>
                  {/* the light passing over the page */}
                  <div
                    aria-hidden="true"
                    className="absolute pointer-events-none"
                    style={{
                      top: "-8%",
                      bottom: "-8%",
                      width: "26%",
                      left: `calc(${scanX * 100}% - 13%)`,
                      transform: "rotate(3deg)",
                      background:
                        "linear-gradient(90deg, rgba(255,199,44,0) 0%, rgba(255,199,44,0.3) 50%, rgba(251,102,229,0.12) 74%, rgba(255,199,44,0) 100%)",
                      filter: "blur(6px)",
                    }}
                  />
                  {/* its inked leading edge */}
                  <svg
                    aria-hidden="true"
                    className="absolute pointer-events-none"
                    style={{ left: `calc(${scanX * 100}% - 7px)`, top: 0, width: 14, height: "100%" }}
                    viewBox="0 0 14 100"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M7 0 Q2.5 12 7.5 25 Q12 38 6.5 50 Q1.5 62 7.5 74 Q12.5 86 6.5 100"
                      fill="none"
                      stroke="rgba(255,199,44,0.6)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}

              {awake && !reduced && (
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none grid place-items-center">
                  {confetti.map((c, i) => (
                    <span
                      key={i}
                      className="confetti-p"
                      style={{
                        width: c.w,
                        height: c.h,
                        background: c.color,
                        borderRadius: c.round ? "999px" : "2px",
                        boxShadow: "0 1px 0 rgba(45,41,38,0.35)",
                        animationDelay: c.delay,
                        "--dx": c.dx,
                        "--dy": c.dy,
                        "--rot": c.rot,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
            </div>

            <Tape seed={2} style={{ width: 62, height: 22, top: -9, left: 16, transform: "rotate(-8deg)" }} />
            <Tape seed={0} style={{ width: 62, height: 22, top: -9, right: 16, transform: "rotate(7deg)" }} />
          </div>
        </div>

        {/* ── decision panel ── */}
        <div className="reveal-panel">
          {phase === "guess" && (
            <InkCard seed={12} className="anim-rise-in max-w-md mx-auto text-center px-3 pt-3 pb-3">
              <div className={short ? "flex items-center gap-4 text-left" : ""}>
                <KindBadge kindId={kindId} reduced={reduced} compact={short} />

                <div className={short ? "flex-1 min-w-0" : ""}>
                  <h2 className={`ink-title mt-2 ${short ? "type-h2" : "type-title"}`} style={{ color: C.ink }}>
                    <span className="whitespace-nowrap">It's a</span>{" "}
                    <span className="inline-block whitespace-nowrap">
                      {title.split("").map((ch, i) => (
                        <span key={i} className="anim-letter-drop" style={{ "--i": i + 6 } as React.CSSProperties}>
                          {ch}
                        </span>
                      ))}
                    </span>
                  </h2>
                  <span className="block mx-auto" style={{ width: short ? "88%" : "62%" }}>
                    <Scribble color={tone} height={11} seed={6} />
                  </span>

                  {/* the name tag — tap it for another one */}
                  <div className={`mt-2 flex flex-col gap-0.5 ${short ? "items-start" : "items-center"}`}>
                    <InkButton
                      tone={C.sun}
                      labelColor={C.ink}
                      seed={17}
                      onClick={rollName}
                      aria-label={`Its name is ${creatureName} the ${kind.label}. Tap for a different name.`}
                      className="max-w-full"
                      style={{ padding: "0.45rem 1rem" }}
                    >
                      <span
                        key={rollTick}
                        className="grid place-items-center shrink-0"
                        style={{ animation: reduced ? undefined : "wiggle 560ms var(--ease-spring)" }}
                      >
                        <Icon name="dice" size={22} color={C.ink} weight={2.3} />
                      </span>
                      <span
                        key={`${creatureName}-${rollTick}`}
                        className="anim-pop-in font-display font-extrabold leading-tight"
                        style={{ fontSize: "var(--fs-lg)" }}
                      >
                        {creatureName} the {kind.label}
                      </span>
                    </InkButton>
                    <span className="type-fine">tap for a new name</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <InkButton
                  seed={45}
                  onClick={() => { sfxTap(); setPhase("pick"); }}
                  className="flex-1 font-display font-extrabold leading-tight"
                  style={{ fontSize: "var(--fs-sm)" }}
                >
                  Not quite
                </InkButton>
                <InkButton
                  tone={C.leaf}
                  seed={88}
                  onClick={() => { sfxMagic(); onConfirm(kindId, creatureName); }}
                  className={`flex-[2.1] font-display font-extrabold leading-tight ink-on-wax ${reduced ? "" : "anim-breathe"}`}
                  style={{ fontSize: "var(--fs-lg)" }}
                >
                  <Icon name="sparkle" size={22} color={C.cream} fill={C.cream} />
                  Yes! Set it free
                </InkButton>
              </div>

              <button
                onClick={onRedraw}
                className="type-label mt-2 w-full min-h-tap flex items-center justify-center gap-2"
              >
                <Icon name="undo" size={18} color="var(--ink-soft)" />
                <span className="underline">Draw it again</span>
              </button>
            </InkCard>
          )}

          {phase === "pick" && (
            <InkCard seed={34} className="anim-rise-in max-w-lg mx-auto px-2 pt-2 pb-2">
              <div className="flex items-center gap-2 px-1">
                {!isPhoto && (
                  <InkButton
                    shape="ellipse"
                    seed={23}
                    onClick={() => { sfxTap(); setPhase("guess"); }}
                    aria-label="Back to the guess"
                    className="shrink-0"
                    style={{ width: 48, height: 48, padding: 0 }}
                  >
                    <Icon name="back" size={22} color={C.ink} />
                  </InkButton>
                )}
                <p className="type-label flex-1 text-center">Tap what it is</p>
                {!isPhoto && <span className="shrink-0" style={{ width: 48 }} aria-hidden="true" />}
              </div>

              <div className="relative mt-1">
                <div
                  role="group"
                  aria-label="Creature choices"
                  className="grid gap-2 p-2 overflow-y-auto no-scrollbar"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(6rem, 1fr))",
                    // in landscape the panel is already short; keep the scroll
                    // inside the grid so the card itself never scrolls too
                    maxHeight: short ? "min(50dvh, 22rem)" : "min(56dvh, 30rem)",
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {NAMED.map((k) => (
                    <KindCard key={k.id} kind={k} active={k.id === kindId} dense={short} onPick={() => choose(k.id)} />
                  ))}

                  <div style={{ gridColumn: "1 / -1" }} className="flex items-center gap-2 pt-1">
                    <span className="type-fine shrink-0">not there?</span>
                    <span className="flex-1">
                      <Scribble color="rgba(86,62,121,0.3)" height={8} seed={14} />
                    </span>
                  </div>

                  <KindCard kind={MYSTERY} active={MYSTERY.id === kindId} wide onPick={() => choose(MYSTERY.id)} />
                </div>
                {/* the page keeps going below */}
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 pointer-events-none"
                  style={{ height: 26, background: `linear-gradient(to top, ${C.paper}, rgba(255,253,247,0))` }}
                />
              </div>

              <button
                onClick={onRedraw}
                className="type-label mt-1 w-full min-h-tap flex items-center justify-center gap-2"
              >
                <Icon name="undo" size={18} color="var(--ink-soft)" />
                <span className="underline">Draw it again</span>
              </button>
            </InkCard>
          )}
        </div>
      </div>
    </div>
  );
}
