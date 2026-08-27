import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Stroke, RecognitionResult, CreatureKind } from "@/lib/types";
import { drawStrokeFull, strokesBounds } from "@/lib/crayon";
import { kindById, rosterFor } from "@/lib/creatures";
import { sfxScan, sfxMagic, sfxTap, sfxHappy } from "@/lib/audio";
import { hand, paperTile, roughEllipse, roughUnderline, seedOf, waxTile } from "@/lib/ink";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";
import { C, doodleParts } from "@/lib/doodles";
import { Doodle } from "@/components/ink/Doodles";

interface Props {
  strokes: Stroke[];
  result: RecognitionResult;
  name: string;
  worldId: string;         // the world being drawn for — it picks the choices
  onShuffleName: (kindId: string) => string;
  onConfirm: (kindId: string, name: string) => void;
  onRedraw: () => void;
}

type Phase = "scan" | "guess" | "pick";

/* ── the crayon box ──────────────────────────────────────────────────────── */
// The waxes and the drawn creatures come from @/lib/doodles. This screen used
// to keep a private copy of both, which went stale the moment a world added a
// creature: every new kind drew a blank card.

/** The fourteen the recognizer knows get a crayon chosen by hand. */
const TONE: Record<string, string> = {
  fish: C.lagoon, car: C.cherry, sun: C.sun, star: C.sun, bird: C.ocean,
  butterfly: C.candy, flower: C.candy, tree: C.leaf, snake: C.leaf,
  rainbow: C.grape, balloon: C.orange, rocket: C.ocean, heart: C.cherry,
  house: C.cocoa, mystery: C.grape,
};

/* A world roster reaches well past those fourteen, and a whale in grape wax
   looks wrong. Anyone unnamed above borrows the crayon their own drawing was
   drawn with: the first stroke that isn't ink, cream or paper. */
const borrowedTone = new Map<string, string>();

/** Each creature gets one crayon out of the box — its wax, its ink, its badge. */
function toneOf(id: string): string {
  const chosen = TONE[id];
  if (chosen) return chosen;
  let tone = borrowedTone.get(id);
  if (!tone) {
    const lead = doodleParts(id).find(
      (part) => part.c && part.c !== C.ink && part.c !== C.cream && part.c !== C.paper,
    );
    tone = lead?.c ?? C.grape;
    borrowedTone.set(id, tone);
  }
  return tone;
}

/** Wax this pale needs dark letters on it. */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 168;
}
const onWax = (hex: string) => (isLight(hex) ? C.ink : C.cream);

/* ── drawn creatures ─────────────────────────────────────────────────────── */

/** A creature's paths, for drawing inside an SVG we are already inside. */
function doodlePaths(name: string) {
  return doodleParts(name).map((p, i) => (
    <path
      key={i}
      d={p.d}
      fill={p.fill ?? "none"}
      stroke={p.c ?? C.ink}
      strokeWidth={p.w ?? 2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

/* ── how much room one card gets ─────────────────────────────────────────── */
// A roster can be four creatures or fifteen. Rather than let fifteen become a
// wall the child has to scroll past, the cards give up a little size once the
// set gets long — still well over a 44px target, still the same drawn card.

type CardSize = "lg" | "md" | "sm";

const CARD: Record<CardSize, { min: number; art: number; pad: string; col: string }> = {
  lg: { min: 96, art: 46, pad: "0.5rem 0.3rem", col: "6rem" },
  md: { min: 80, art: 38, pad: "0.4rem 0.15rem", col: "4.9rem" },
  // a landscape phone has barely any height; a third row peeks out to say
  // "keep going"
  sm: { min: 68, art: 32, pad: "0.25rem 0.15rem", col: "4.6rem" },
};

/** The lettering size on a card. The column widths are measured in it. */
const labelSize = (size: CardSize, wide?: boolean) =>
  wide || size === "lg" ? "var(--fs-sm)" : "calc(var(--fs-sm) * 0.92)";

/* "Stegosaurus" does not fit where "Cat" does, and a name broken across two
   lines is no use to a child still learning to read them. So the columns are
   measured in the lettering itself: the longest word in the set, at roughly
   0.62em a letter in Baloo, decides how many cards fit across. */
function widestWord(labels: string[]): number {
  let n = 0;
  for (const label of labels) {
    const hyphen = label.includes("-") ? 1 : 0;
    for (const word of label.split(/[\s-]+/)) n = Math.max(n, word.length + hyphen);
  }
  return n;
}

/* ── does the choice list run past its box? ──────────────────────────────── */

function useScrollMore<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", read); ro.disconnect(); };
    // `key` carries the phase as well as the count: the box only exists while
    // the set is open, so the listener has to be hung on it again each time
  }, [key]);
  return [ref, more] as const;
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
  kind, active, wide, note, size = "lg", onPick,
}: {
  kind: CreatureKind;
  active: boolean;
  wide?: boolean;
  note?: string;
  size?: CardSize;
  onPick: () => void;
}) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const tone = toneOf(kind.id);
  const seed = seedOf(kind.id);
  const tilt = ((seed % 5) - 2) * 0.7;
  const label = kind.id === "mystery" ? "Something else!" : kind.label;
  const mono = active ? onWax(tone) : undefined;
  const s = CARD[size];

  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={kind.id === "mystery" ? "Something else — a mystery creature" : kind.label}
      data-picked={active ? "true" : undefined}
      className={`ink-btn relative isolate ${
        wide ? "w-full flex items-center gap-3 text-left" : "flex flex-col items-center justify-center gap-1"
      }`}
      style={{
        minHeight: wide ? (size === "sm" ? 62 : 72) : s.min,
        padding: wide ? "0.5rem 0.9rem" : s.pad,
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
        <Doodle name={kind.id} size={wide ? 44 : s.art} mono={mono} />
      </span>
      <span className={`relative z-10 min-w-0 ${wide ? "flex-1" : "text-center w-full"}`}>
        <span
          className="block font-display font-extrabold leading-tight"
          style={{
            color: mono ?? C.ink,
            fontSize: labelSize(size, wide),
            textShadow: mono && mono === C.cream ? "0 2px 0 rgba(45,41,38,0.32)" : undefined,
          }}
        >
          {label}
        </span>
        {note && (
          <span
            className="block type-fine"
            style={{ color: mono ? (mono === C.cream ? "rgba(255,250,240,0.9)" : "rgba(45,41,38,0.7)") : "var(--ink-soft)" }}
          >
            {note}
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

export default function MagicReveal({
  strokes, result, name, worldId, onShuffleName, onConfirm, onRedraw,
}: Props) {
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

  /* What this world offers. A reef asks "fish or starfish?", a galaxy "rocket
     or Mars?" — one list of everything would be a phone book. */
  const roster = useMemo(() => rosterFor(worldId), [worldId]);

  /* "Something else" always closes the roster and always gets its own card, so
     it comes out of the grid; the rest keep the guess at the front, because
     nine times in ten the guess is the answer and the child just taps it. */
  const { cards, mystery } = useMemo(() => {
    const escape = roster.find((k) => k.id === "mystery") ?? kindById("mystery");
    const named = roster.filter((k) => k.id !== "mystery");
    const guessed = result.kindId;
    const inRoster = named.find((k) => k.id === guessed);
    // a guess this world does not stock still deserves a card — it is the one
    // already ticked, and a ticked card you cannot see is a puzzle
    const stray = !inRoster && guessed !== "mystery" && kindById(guessed).id === guessed
      ? kindById(guessed)
      : undefined;
    const first = inRoster ?? stray;
    const rest = named.filter((k) => k.id !== first?.id);
    return { cards: first ? [first, ...rest] : rest, mystery: escape };
  }, [roster, result.kindId]);

  /* nine cards or fifteen: the set gives up size before it gives up the screen */
  const cardSize: CardSize = short ? "sm" : cards.length > 6 ? "md" : "lg";
  const colMin = `max(${CARD[cardSize].col}, ${(widestWord(cards.map((k) => k.label)) * 0.62 + 0.5).toFixed(2)}em)`;
  const [gridRef, more] = useScrollMore<HTMLDivElement>(`${phase}:${cards.length}`);

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
        setPhase("guess");
        sfxHappy();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // live wiggling drawing (strokes)
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    const fitAndLoop = () => {
      /* One loop at a time: this is called again on every resize (and the
         observer's guaranteed first delivery), and each call starts a fresh
         rAF chain — without this cancel the chains pile up and fight. */
      cancelAnimationFrame(raf);
      const dpr = window.devicePixelRatio || 1;
      /* clientWidth, not getBoundingClientRect: this screen mounts under the
         page-flip 3D transform, and the projected rect is ~2.5% small — the
         transform never changes the layout box, so the shrunken size sticks. */
      const r = { width: wrap.clientWidth, height: wrap.clientHeight };
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
    /* No manual first call: observing always delivers an initial callback,
       and calling it here as well started a second, orphaned loop. */
    const ro = new ResizeObserver(fitAndLoop);
    ro.observe(wrap);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [strokes, phase, reduced]);

  /* whatever is already ticked should be in sight the moment the set opens */
  useEffect(() => {
    if (phase !== "pick") return;
    const box = gridRef.current;
    const card = box?.querySelector<HTMLElement>('[data-picked="true"]');
    if (!box || !card) return;
    const top = card.offsetTop - box.clientHeight / 2 + card.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }, [phase, reduced, gridRef]);

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
          {/* the tick is a drawn mark; this is the same news, out loud */}
          <span className="sr-only" role="status" aria-live="polite">
            {phase === "scan" ? "" : `Chosen: ${kind.id === "mystery" ? "Something else" : kind.label}`}
          </span>
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
            /* The card is a column with one elastic row: the choices. Whatever
               is left after the heading, the mystery card and "draw it again"
               is what the set gets — so a fifteen-creature roster shortens the
               scroll rather than pushing the buttons off the screen. */
            <InkCard
              seed={34}
              className="anim-rise-in max-w-lg mx-auto px-2 pt-2 pb-2 flex flex-col"
              contentClassName="flex flex-col min-h-0"
              style={{ maxHeight: short ? "100%" : "min(70dvh, 34rem)" }}
            >
              <div className="flex items-center gap-2 px-1 shrink-0">
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
                <p className="type-label flex-1 text-center">Tap what it is</p>
                <span className="shrink-0" style={{ width: 48 }} aria-hidden="true" />
              </div>

              <div className="relative mt-1 min-h-0 flex">
                <div
                  ref={gridRef}
                  role="group"
                  aria-label="Creature choices"
                  className="grid gap-2 p-2 overflow-y-auto no-scrollbar w-full font-display"
                  style={{
                    // the em here is the card lettering, so the columns hold
                    // "Stegosaurus" at whatever size the screen is using
                    fontSize: labelSize(cardSize),
                    gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}, 1fr))`,
                    // the only part of the card allowed to shrink, and the only
                    // part allowed to scroll: the panel itself never does
                    flex: "0 1 auto",
                    minHeight: 0,
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {cards.map((k) => (
                    <KindCard
                      key={k.id}
                      kind={k}
                      active={k.id === kindId}
                      size={cardSize}
                      onPick={() => choose(k.id)}
                    />
                  ))}
                </div>
                {/* the page keeps going below */}
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 pointer-events-none"
                  style={{
                    height: 32,
                    opacity: more ? 1 : 0,
                    transition: reduced ? undefined : "opacity 180ms linear",
                    background: `linear-gradient(to top, ${C.paper} 12%, rgba(255,253,247,0))`,
                  }}
                />
              </div>

              {/* "something else" is a real answer, not a failure: it keeps a
                  card of its own width, and it sits outside the scroller so a
                  fifteen-creature roster can never bury it */}
              {!short && (
                <div className="flex items-center gap-2 px-2 pt-1 shrink-0">
                  <span className="type-fine shrink-0">not there?</span>
                  <span className="flex-1">
                    <Scribble color="rgba(86,62,121,0.3)" height={8} seed={14} />
                  </span>
                </div>
              )}

              {/* a landscape phone is 360px tall on a good day: down there the
                  escape hatch and the way out share one line, so the choices
                  keep the rows they would otherwise have lost */}
              <div className={`px-2 pt-1 shrink-0 flex gap-2 ${short ? "items-stretch" : "flex-col"}`}>
                <span className={short ? "flex-1 min-w-0" : "block"}>
                  <KindCard
                    kind={mystery}
                    active={mystery.id === kindId}
                    wide
                    size={cardSize}
                    note="a mystery creature — that counts!"
                    onPick={() => choose(mystery.id)}
                  />
                </span>
                <button
                  onClick={onRedraw}
                  className={`type-label min-h-tap flex items-center justify-center gap-2 ${
                    short ? "shrink-0 px-2" : "w-full mt-1"
                  }`}
                >
                  <Icon name="undo" size={18} color="var(--ink-soft)" />
                  <span className="underline">Draw it again</span>
                </button>
              </div>
            </InkCard>
          )}
        </div>
      </div>
    </div>
  );
}
