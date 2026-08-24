// ─── World scene: the living canvas where a kid's creatures actually live ───
// Owns the render loop, the HUD, the banner queue, the friends roster (look at
// a creature up close, rename it, release it) and the share card.
//
// The overlay is drawn, not chromed: every control is a wax fill inside a
// hand-inked edge, so the interface belongs to the same sketchbook as the
// artwork underneath it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Creature, DreamWorld, RegionKind } from "@/lib/types";
import { kindById, BEHAVIOR_COPY, WORLD_PACKS } from "@/lib/creatures";
import {
  maskOf, regionAt, regionBand, regionForBehavior, findSpawn, groundTopAt,
  REGION_W,
} from "@/lib/regions";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { sfxBubble, sfxPop, sfxSplash, sfxTap, setMuted, isMuted, sfxHappy, sfxMagic } from "@/lib/audio";
import { drawOcean, drawSpace, drawFarm, drawDino, drawDream, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { bakeCrayonSprite, type Sprite } from "@/lib/sprites";
import { saveCreatures } from "@/lib/storage";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "@/components/ink/Ink";
import { Icon, type IconName } from "@/components/ink/Icons";
import { hand, paperTile, roughRect, seedOf, tornEdge } from "@/lib/ink";
import { newLag, lagWeight, updateLag, applyLag, type Lag } from "@/lib/secondary";
import { growthScale } from "@/lib/social";
import { welcomeBack, type Visit } from "@/lib/daily";
import { drawCrayonStroke } from "@/lib/crayon";

/* per-world wrapper colors + empty-state copy */
const WORLD_BG: Record<string, string> = {
  dream: "#eaf1ff",
  ocean: "#0a4d8f",
  space: "#151040",
  farm: "#6ec3f7",
  dino: "#2d1b4e",
};
const WORLD_EMPTY: Record<string, string> = {
  dream: "Your world is ready — draw something to bring it to life!",
  ocean: "Your reef is waiting…",
  space: "Your galaxy is waiting…",
  farm: "Your meadow is waiting…",
  dino: "Your island is waiting…",
};

/* ── arrival copy ────────────────────────────────────────────────────────────
   `BEHAVIOR_COPY` in lib/creatures was written when there were eight ways to
   move and four worlds. It has no line for a crab scuttling in, and none at all
   for the world the child painted themselves — and its own fallback would have
   a UFO "swimming into the reef". These fill those gaps in the same voice: the
   shared table still wins wherever it has something to say. */
const ARRIVAL_ANY: Record<string, string> = {
  swim: "swims in", drive: "drives in", fly: "flies in", float: "floats in",
  twinkle: "twinkles into view", grow: "puts its roots down", crawl: "wiggles in",
  bounce: "bounces in", orbit: "starts going round and round", jet: "whooshes in",
  scuttle: "scuttles in sideways", stomp: "STOMPS in", waddle: "waddles in",
  graze: "ambles in for a nibble", hover: "hovers into view", streak: "zooms across the sky",
  erupt: "rumbles into place", sway: "settles in and sways",
};
const ARRIVAL_WORLD: Record<string, Record<string, string>> = {
  ocean: {
    orbit: "circles over the reef", jet: "squeezes and whooshes off",
    scuttle: "scuttles across the sand", stomp: "stomps along the seabed",
    waddle: "waddles down to the water", graze: "nibbles at the seaweed",
    hover: "hovers over the reef", streak: "zooms over the waves",
    erupt: "settles on the seabed and puffs", sway: "sways in the current",
  },
  space: {
    orbit: "swings into orbit", jet: "puffs off into the stars",
    scuttle: "skitters over a moon", stomp: "stomps across the moon dust",
    waddle: "waddles over the moon", graze: "nibbles at the moon dust",
    hover: "hovers over the galaxy", streak: "streaks across the stars",
    erupt: "rumbles on a faraway moon", sway: "sways in the starlight",
  },
  farm: {
    orbit: "circles over the barn", jet: "whooshes across the pond",
    scuttle: "scuttles through the grass", stomp: "stomps across the meadow",
    waddle: "waddles into the yard", graze: "starts munching the grass",
    hover: "hovers over the field", streak: "zooms over the hayfield",
    erupt: "settles in the field and puffs", sway: "sways in the breeze",
  },
  dino: {
    orbit: "circles over the island", jet: "whooshes through the lagoon",
    scuttle: "scuttles over the rocks", stomp: "STOMPS onto the island",
    waddle: "waddles out of the ferns", graze: "starts munching the ferns",
    hover: "hovers over the jungle", streak: "streaks over the volcano",
    erupt: "rumbles and puffs out smoke", sway: "sways over the beach",
  },
  dream: {
    swim: "swims into your world", drive: "drives into your world",
    fly: "flies into your world", float: "floats into your world",
    twinkle: "twinkles over your world", grow: "puts its roots down in your world",
    crawl: "wiggles into your world", bounce: "bounces into your world",
    orbit: "circles over your world", stomp: "STOMPS into your world",
    hover: "hovers over your world", streak: "zooms across your sky",
  },
};
/** The line for a creature arriving — never blank, never the wrong world. */
function arrivalLine(worldId: string, behavior: string): string {
  return (
    ARRIVAL_WORLD[worldId]?.[behavior] ??
    BEHAVIOR_COPY[worldId]?.[behavior]?.arrival ??
    ARRIVAL_ANY[behavior] ??
    "arrives"
  );
}

/* ── the HUD's wax box ───────────────────────────────────────────────────────
   Four skies have to be survived: farm blue, reef blue, near-black space and a
   dusk jungle. So nothing here is white (white dissolves into the farm's
   clouds) and nothing is near-black (that sinks into space). Every control is a
   mid-tone wax inside an inked edge, and `.hud-drawn` lays a cream rim outside
   that edge so the silhouette still reads on the darkest ground. */
interface Tone { wax: string; on: string }
const TONE: Record<string, Tone> = {
  manila: { wax: "#e9c98d", on: "#2d2926" },
  sun: { wax: "#ffc72c", on: "#2d2926" },
  play: { wax: "#12a08f", on: "#fff6e6" },
  draw: { wax: "#8b46c7", on: "#fff6e6" },
  go: { wax: "#e0533f", on: "#fff6e6" },
};

const MAX_NAME = 16;
const BANNER_MS = 2800;
const LONG_PRESS_MS = 520;

/* the ink each banner icon is drawn in */
const BANNER_INK: Partial<Record<IconName, { color: string; fill?: string }>> = {
  sparkle: { color: "#2d2926", fill: "#ffc72c" },
  pencil: { color: "#8b46c7" },
  globe: { color: "#12a08f" },
  camera: { color: "#563e79" },
  heart: { color: "#2d2926", fill: "#ff6b6b" },
};

/* ── runtime state per creature ──────────────────────────────────────────────
   One flat record of numbers per creature, made once when it is staged. The
   render loop only ever writes into these fields — it allocates nothing, so
   thirty creatures cost thirty objects for the life of the scene, not thirty
   per frame. */
interface RT {
  x: number; y: number; dir: 1 | -1;
  baseY: number; t: number; speed: number;
  excite: number; born: number; labelT: number;
  seed: number;
  /* ── the way this particular kind of thing moves ──
     Each style is a tiny state machine over the same handful of slots:
       mode   which beat of the cycle it is on (0 = resting/drifting)
       next   the value of `t` at which that beat ends
       vx,vy  velocity, for the styles that coast (jet, streak)
       ax,ay  its anchor: orbit centre, hovering station, root in the ground
       tx,ty  where it is heading, or how far it swings (orbit radii)
       sq     squash: >0 wide and flat, <0 stretched tall
       roll   a screen-space lean, positive = nose down / tipped right
       dip    0..1, how far a grazer's head is down in the grass */
  mode: number; next: number;
  vx: number; vy: number;
  ax: number; ay: number;
  tx: number; ty: number;
  sq: number; roll: number; dip: number;
  /* ── where it belongs, in a world the child painted regions onto ──
     `reg` is null in every other case, and null is the old behaviour: free
     roaming against the flat floor line. Resolved once, at spawn. */
  reg: RegionKind | null;
  bandT: number; bandB: number;
  /** The region this kind wants, painted or not — what it is placed among. */
  home: RegionKind;
  /** Its own depth along the ground, so a row of animals is not one flat line. */
  foot: number;
  /* ── what trails ──
     Secondary motion: one `Lag` made at spawn and mutated in place for the
     life of the creature (see lib/secondary — it allocates nothing per frame).
     `lagW` is how much this behaviour is allowed to trail, resolved once. */
  lag: Lag;
  lagW: number;
  /** Seconds between this one's blinks — near enough shared, never in step. */
  blinkP: number;
  /* ── what its neighbours have talked it into ──
     `sx`/`sy` are a steering *intent* in normalized units per second, written
     by the neighbour pass and spent by the behaviour chain. They persist
     between passes on purpose: the pass runs at a quarter of frame rate and
     the motion has to stay smooth in between. `flee` is a scatter charge, 1
     the moment something big goes past and gone a couple of seconds later. */
  sx: number; sy: number; flee: number;
  /* ── who it keeps running into ──
     One candidate, not a table. `near` is whoever it is closest to right now,
     `nearT` the time it has spent near them, and `pal` the one it finally
     committed to. Drifting apart halves `nearT` rather than clearing it, so a
     friendship built over several visits still happens. */
  near: string; nearT: number; pal: string;
  /* ── being picked up ──
     `held` is 1 while a finger has it; `hx`/`hy` are where that finger is, and
     the behaviour chain is skipped entirely while it is set. `dropT` is when it
     was let go, so it can swim home rather than appear where it landed. */
  held: 0 | 1; hx: number; hy: number; dropT: number;
  /* ── its trick ──
     `trK` is which of the four it does, chosen once from its own seed so it is
     always *its* trick. `trT` is when the current one started, or long ago. */
  trT: number; trK: number;
  /** Care earned this session and not yet written down. See `commitCare`. */
  care: number;
  /** Hellos counted towards care this session, so a drum solo is still one hi. */
  hiN: number;
}

/** Behaviours whose artwork turns to face the way it is travelling. */
const FACING = new Set([
  "swim", "fly", "drive", "crawl",              // (unchanged: exactly today's set)
  "jet", "stomp", "waddle", "graze", "streak",
]);
/** Behaviours that pivot around their feet rather than their middle. */
const FOOTED = new Set(["sway", "erupt", "stomp", "waddle", "graze", "scuttle"]);
/** Behaviours that live on the ground line rather than in the air. */
const GROUNDED = new Set([
  "drive", "grow", "crawl",
  "stomp", "waddle", "graze", "scuttle", "erupt", "sway",
]);
/** Bottom of the canvas kept clear of standing creatures, in CSS px: the
 *  friends pill and the tip live down there, and a creature hidden behind a
 *  label may as well not have been drawn. Measured against the real chrome —
 *  the tip banner starts ~70px up — plus a standing sprite's own height, which
 *  is what the first value missed. */
const HUD_CLEAR = 214;
/** How far below the middle of the artwork those feet are. */
const FOOT = 0.45;
/** Things with roots. They can shiver and look up; they do not hop or spin. */
const ROOTED = new Set(["grow", "erupt", "sway"]);

/* ── blinking ────────────────────────────────────────────────────────────────
   A creature whose eyes never close reads as a stuffed toy. These sprites are
   single baked canvases with no eyes to address, so the nearest honest thing is
   to squeeze the upper region for a moment — shorter and a touch wider, which
   is what a face actually does as the lids come down. The seam sits *inside*
   the sprite and both slices meet exactly on it, with one source row of
   overlap, so nothing tears. `k` is 0 for all but ~120ms at a time, and at 0
   this is one plain `drawImage` — the common path costs nothing. */
const BLINK_CUT = 0.56;      // where a head stops being a head, near enough
function drawBlink(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  dx: number, dy: number, dw: number, dh: number,
  k: number,
): void {
  if (k <= 0.02) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const iw = img.width, ih = img.height;
  if (iw < 2 || ih < 2) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const sq = k * 0.17;
  const sy = ih * BLINK_CUT;              // the seam, in source pixels
  const my = dy + dh * BLINK_CUT;         // the seam, on the canvas
  const th = dh * BLINK_CUT * (1 - sq);   // the squeezed head
  const tw = dw * (1 + sq * 0.4);         // …which bulges a little as it goes
  ctx.drawImage(img, 0, 0, iw, sy, dx - (tw - dw) / 2, my - th, tw, th);
  const o = Math.min(1, sy);              // one source row of overlap: no seam
  ctx.drawImage(
    img, 0, sy - o, iw, ih - sy + o,
    dx, my - (dh / ih) * o, dw, dh * (1 - BLINK_CUT) + (dh / ih) * o,
  );
}

/** Set up the state machine for one motion style. Runs once, at spawn. */
function styleSpawn(rt: RT, b: string) {
  const r = () => Math.random();
  if (b === "orbit") {
    // a circle that is guaranteed to stay on screen, centred where it landed
    rt.tx = 0.12 + r() * 0.08;
    rt.ty = rt.tx * (0.45 + r() * 0.3);
    rt.ax = Math.max(0.08 + rt.tx, Math.min(0.92 - rt.tx, rt.x));
    rt.ay = Math.max(rt.bandT + rt.ty + 0.02, Math.min(rt.bandB - rt.ty - 0.02, rt.y));
    if (rt.ay < rt.ty + 0.06) rt.ay = rt.ty + 0.06;
  } else if (b === "jet") {
    rt.next = rt.t + 0.4 + r() * 1.4;
  } else if (b === "scuttle") {
    rt.next = rt.t + 0.2 + r() * 0.8;
  } else if (b === "stomp") {
    rt.next = rt.t + r() * 1.1;
  } else if (b === "graze" || b === "erupt") {
    rt.next = rt.t + 0.8 + r() * 3;
  } else if (b === "hover") {
    rt.ax = rt.x; rt.ay = rt.y;
    rt.tx = rt.x; rt.ty = rt.y;
    rt.next = rt.t + 0.9 + r() * 1.4;
  } else if (b === "streak") {
    rt.mode = 1;                 // "gone": it comes in off the edge on frame one
    rt.next = rt.t + 0.1;
  }
  if (b === "erupt" || b === "sway") rt.ax = rt.x;   // rooted: it stays put
}

/** Ground height at normalized x: the painted hills, or the flat floor line. */
function groundAt(cols: Float32Array | null, floor: number, nx: number): number {
  if (!cols) return floor;
  const f = nx * REGION_W - 0.5;
  const i = Math.floor(f);
  const a = cols[i < 0 ? 0 : i > REGION_W - 1 ? REGION_W - 1 : i];
  const j = i + 1;
  const bb = cols[j < 0 ? 0 : j > REGION_W - 1 ? REGION_W - 1 : j];
  const av = a === a ? a : bb === bb ? bb : floor;      // NaN = nothing painted here
  const bv = bb === bb ? bb : av;
  const k = f - i;
  return av + (bv - av) * (k < 0 ? 0 : k > 1 ? 1 : k);
}

/** True where the child actually painted ground for this column to stand on. */
function hasGroundAt(cols: Float32Array | null, nx: number): boolean {
  if (!cols) return true;
  const i = Math.floor(nx * REGION_W);
  if (i < 0 || i > REGION_W - 1) return false;
  return cols[i] === cols[i];
}

/* ── drawn shapes on the world canvas ────────────────────────────────────── */

/** Baked once per size + hand, so the render loop never pays for the wobble. */
const tagCache = new Map<string, Path2D>();
function tagPath(w: number, h: number, seed: number): Path2D {
  const key = `${w}x${h}:${seed}`;
  let p = tagCache.get(key);
  if (!p) {
    if (tagCache.size > 96) tagCache.clear();
    p = new Path2D(roughRect(w, h, { seed, wobble: 2.1, radius: h * 0.3 }));
    tagCache.set(key, p);
  }
  return p;
}

/** The four-point sparkle the whole app uses instead of a ✨. */
function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.lineTo(0, -r * 2);
    ctx.lineTo(r * 0.42, -r * 0.42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ── measuring, so a drawn path can match its real pixel box ─────────────── */

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      // round to 2px so a press micro-resize doesn't redraw the hand
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

/* ── HUD control: a drawn object sitting in the world, not OS chrome ─────── */

interface HudBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** The control's label. Omit for an icon-only 48×48 control. */
  label?: string;
  /** Tail of the label that only appears once the row has room for it. */
  labelWide?: string;
  /** Stand the whole label down on a narrow row, leaving the icon alone. */
  labelOnlyWide?: boolean;
  tone?: Tone;
  iconFill?: string;
  seed?: number;
  round?: boolean;
}

function HudBtn({
  icon, label, labelWide, labelOnlyWide, tone = TONE.manila, iconFill,
  seed, round = false, className = "", style, ...rest
}: HudBtnProps) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const s = seed ?? seedOf(icon + (label ?? ""));
  const onWax = tone.on !== "#2d2926";
  // a label that comes and goes has to take its padding with it, so that case
  // is driven by a class instead of an inline style
  const fluid = !!label && !!labelOnlyWide;
  return (
    <button
      ref={ref}
      className={`ink-btn hud-btn hud-drawn hud-focus-light pointer-events-auto relative isolate ${fluid ? "hud-btn-fluid" : ""} ${className}`}
      style={{
        padding: fluid ? undefined : label ? "0 15px 0 13px" : 0,
        width: round ? 48 : undefined,
        minWidth: 48,
        height: 48,
        ...style,
      }}
      {...rest}
    >
      <InkShape
        w={box.w}
        h={box.h}
        shape={round ? "ellipse" : "rect"}
        seed={s}
        weight={3.1}
        radius={round ? undefined : 15}
        lifted={false}
        fill={{ kind: "wax", color: tone.wax }}
      />
      <span className="relative z-10 flex items-center justify-center gap-1.5">
        <Icon name={icon} size={round ? 25 : 22} color={tone.on} fill={iconFill} weight={2.3} />
        {label && (
          <span
            className={`font-display font-extrabold whitespace-nowrap ${labelOnlyWide ? "hidden sm:inline" : ""} ${onWax ? "ink-on-wax" : ""}`}
            style={{ color: tone.on, fontSize: "var(--fs-sm)" }}
          >
            {label}
            {labelWide && <span className="hidden sm:inline">{labelWide}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

/** Paper fibre laid over a drawn sheet — the flat fill alone reads as plastic. */
function PaperFibre({ inset = 7, radius = 26 }: { inset?: number; radius?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ inset, borderRadius: radius, backgroundImage: "var(--paper-fibre, none)", opacity: 0.6 }}
    />
  );
}

/** Small offscreen-sprite thumbnail — no dependency on the Home screen. */
function CreatureThumb({
  creature, sprite, size, tick,
}: { creature: Creature; sprite: HTMLCanvasElement | null; size: number; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const src = (creature.artUrl ? artSprite(creature.artUrl) : null) ?? sprite;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = `${size}px`;
    cv.style.height = `${size}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (!src || !src.width || !src.height) return;
    const k = Math.min(size / src.width, size / src.height);
    const w = src.width * k, h = src.height * k;
    ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
  }, [creature.artUrl, creature.id, sprite, size, tick]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none" />;
}

/** Load a data-URL texture for the share card. Never rejects. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

export default function WorldScene({
  creatures,
  newId,
  worldId,
  dream,
  polishingIds,
  onBack,
  onDrawMore,
  onPlayGame,
  onRenameCreature,
  onDeleteCreature,
  onRepaint,
  onCare,
  visit,
}: {
  creatures: Creature[];
  newId: string | null;
  worldId: string;
  /** The child's painted world, when `worldId === "dream"`. */
  dream?: DreamWorld | null;
  polishingIds?: Set<string>;
  onBack: () => void;
  onDrawMore: () => void;
  onPlayGame: () => void;
  /** Optional: let the app own creature edits. Falls back to local + storage. */
  onRenameCreature?: (id: string, name: string) => void;
  onDeleteCreature?: (id: string) => void;
  /** Dream world only: reopen the easel to repaint the background. */
  onRepaint?: () => void;
  /** Write down care earned in the scene, as `{ creatureId: delta }`. Called on
   *  a slow cadence — see `commitCare` — never per frame. */
  onCare?: (deltas: Record<string, number>) => void;
  /** How long the child has been away, so their creatures can say hello. */
  visit?: Visit;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  const rtRef = useRef<Map<string, RT>>(new Map());
  const fxRef = useRef(newFxState());
  const burstRef = useRef<{ x: number; y: number }[]>([]); // evolution bursts (world coords)
  const seenArtRef = useRef<Set<string>>(new Set());
  const arrivalRef = useRef<string | null>(null);
  const [muted, setM] = useState(isMuted());
  const [artTick, forceTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<{ mode: "roster" } | { mode: "detail"; id: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tip, setTip] = useState(true);

  /* local creature edits — used when the app doesn't hand us callbacks */
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [released, setReleased] = useState<Set<string>>(() => new Set());
  const view = useMemo(
    () =>
      creatures
        .filter((c) => !released.has(c.id))
        .map((c) => (renames[c.id] && renames[c.id] !== c.name ? { ...c, name: renames[c.id] } : c)),
    [creatures, renames, released],
  );

  const creaturesRef = useRef(view);
  creaturesRef.current = view;
  const polishRef = useRef<Set<string>>(polishingIds ?? new Set());
  polishRef.current = polishingIds ?? new Set();
  const worldRef = useRef(worldId);
  worldRef.current = worldId;
  const dreamRef = useRef(dream);
  dreamRef.current = dream;
  const floorR = worldId === "dream" && dream ? dream.ground : floorRatio(worldId);
  const floorRef = useRef(floorR);
  floorRef.current = floorR;

  /* ── the painted world ────────────────────────────────────────────────────
     When the child has painted regions onto their own world, creatures live in
     the one their behaviour wants: fish in the water they painted, birds in
     their sky, a cow on the hill rather than on one flat line. Everything here
     is null in every other world — and null is exactly today's behaviour. */
  const mask = useMemo(() => (worldId === "dream" ? maskOf(dream) : null), [worldId, dream]);
  /** The top of the ground per mask column, resolved once per repaint. */
  const groundCols = useMemo(() => {
    if (!mask) return null;
    const cols = new Float32Array(REGION_W);
    for (let i = 0; i < REGION_W; i++) {
      const g = groundTopAt(mask, (i + 0.5) / REGION_W);
      cols[i] = g == null ? NaN : g;
    }
    return cols;
  }, [mask]);
  const maskRef = useRef(mask);
  maskRef.current = mask;
  const colsRef = useRef(groundCols);
  colsRef.current = groundCols;

  /* ── writing down what has been earned ────────────────────────────────────
     Care accrues in the runtime records, where a `+=` costs nothing, and only
     reaches the creature list on a slow cadence: once a minute, when the tab
     goes away, and when the scene unmounts. Never per frame, and this is not a
     micro-optimisation — a creature list can carry a 160 KB photo per creature,
     so serialising it sixty times a second would cost more than every other
     thing in this file put together. */
  const onCareRef = useRef(onCare);
  onCareRef.current = onCare;
  const commitCare = useCallback(() => {
    let any = false;
    const deltas: Record<string, number> = {};
    for (const [id, rt] of rtRef.current) {
      if (rt.care > 0) { deltas[id] = rt.care; rt.care = 0; any = true; }
    }
    if (any) onCareRef.current?.(deltas);
  }, []);
  const commitRef = useRef(commitCare);
  commitRef.current = commitCare;
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") commitCare(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      commitCare();
    };
  }, [commitCare]);

  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  /** Everything new moves at this fraction of full pelt, and waits longer. */
  const calmRef = useRef(1);
  calmRef.current = reduced ? 0.45 : 1;

  const newCreature = useMemo(() => view.find((c) => c.id === newId) ?? null, [view, newId]);
  const detail = sheet?.mode === "detail" ? view.find((c) => c.id === sheet.id) ?? null : null;

  /* ── banner queue: arrivals and evolutions never clobber each other ────── */
  const [banner, setBanner] = useState<{ id: number; text: string; icon: IconName } | null>(null);
  const bannerQ = useRef<{ id: number; text: string; icon: IconName }[]>([]);
  const bannerBusy = useRef(false);
  const bannerId = useRef(0);
  const pushBanner = useCallback((text: string, icon: IconName = "sparkle") => {
    const item = { id: ++bannerId.current, text, icon };
    if (bannerBusy.current) {
      bannerQ.current.push(item);
      if (bannerQ.current.length > 4) bannerQ.current.splice(0, bannerQ.current.length - 4);
      return;
    }
    bannerBusy.current = true;
    setBanner(item);
  }, []);
  useEffect(() => {
    if (!banner) { bannerBusy.current = false; return; }
    const t = window.setTimeout(() => {
      const next = bannerQ.current.shift() ?? null;
      bannerBusy.current = !!next;
      setBanner(next);
    }, BANNER_MS);
    return () => window.clearTimeout(t);
  }, [banner]);

  // the touch tip says its piece once, then leaves
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(false), 6000);
    return () => window.clearTimeout(t);
  }, [tip]);

  // re-render when AI art finishes downloading
  useEffect(() => onArtLoaded(() => forceTick((n) => n + 1)), []);

  // evolution moment: a creature's premium art just arrived
  useEffect(() => {
    for (const c of view) {
      if (!c.artUrl || seenArtRef.current.has(c.id)) continue;
      const rt = rtRef.current.get(c.id);
      if (!rt) continue; // creature not staged yet; burst next visit instead
      // only celebrate if the art image is actually ready to show
      if (!artSprite(c.artUrl)) continue;
      seenArtRef.current.add(c.id);
      burstRef.current.push({ x: rt.x, y: rt.y });
      rt.excite = 1;
      rt.labelT = performance.now();
      sfxMagic();
      pushBanner(`The magic dust worked! ${c.name} transformed!`, "sparkle");
    }
  }, [view, artTick, pushBanner]);

  /* ── coming back ──────────────────────────────────────────────────────────
     A child who has been away overnight is met by name. Not a modal, not a
     reward chest, not a streak that can be lost — the two or three creatures
     they have spent the most time with turn round and say hello, a beat apart
     so it reads as three friends noticing rather than one animation firing.

     Waits for the sprites, because photo creatures bake asynchronously and a
     greeting from something that is not on screen yet is no greeting at all. */
  const greetedRef = useRef(false);
  useEffect(() => {
    const v = visit;
    if (!v || greetedRef.current) return;
    if (!v.newDay && v.away < 8) { greetedRef.current = true; return; }
    const here = view.filter((c) => rtRef.current.has(c.id));
    if (!here.length) return;                       // nothing staged yet; try again
    greetedRef.current = true;
    const line = welcomeBack(v);
    if (line) pushBanner(line, "heart");
    const oldest = here
      .slice()
      .sort((a, b) => (b.care ?? 0) - (a.care ?? 0) || a.createdAt - b.createdAt)
      .slice(0, 3);
    const now = performance.now();
    oldest.forEach((c, i) => {
      const rt = rtRef.current.get(c.id);
      if (!rt) return;
      rt.excite = 1;
      rt.labelT = now + 900 + i * 600;
    });
  }, [view, visit, pushBanner]);

  // bake sprites for any new creatures (photo creatures bake async)
  useEffect(() => {
    const ensureRT = (c: Creature) => {
      if (rtRef.current.has(c.id)) return;
      const kind = kindById(c.kindId);
      const b = kind.behavior;
      const want = regionForBehavior(b);
      const grounded = GROUNDED.has(b);
      const top = b === "twinkle";
      /* Everything about where a creature starts is drawn from its own id, so
         the same drawing lands in the same place every time the scene mounts
         instead of hopping about between visits. */
      let h = seedOf(c.id) || 1;
      const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
      // its own depth into the scene: a row of animals is a band, not a line
      const foot = grounded ? -0.045 + rnd() * 0.06 : 0;
      let y = grounded ? floorR + foot
            : top ? 0.1 + rnd() * 0.12
            : 0.22 + rnd() * 0.44;
      /* Spread out along the width, then stepped clear of anyone already
         standing at the same height. Ten creatures is nothing to compare at
         spawn time, and it never happens again. */
      const LO = 0.07, SPAN = 0.86;
      let peers = 0;
      for (const o of rtRef.current.values()) if (o.home === want) peers++;
      const gap = Math.max(0.055, Math.min(0.16, SPAN / (peers + 2)));
      let x = LO + rnd() * SPAN;
      for (let tries = 0; tries < 16; tries++) {
        let clash = false;
        for (const o of rtRef.current.values()) {
          if (o.home !== want || Math.abs(o.y - y) > 0.09) continue;
          if (Math.abs(o.x - x) < gap) { clash = true; break; }
        }
        if (!clash) break;
        x = LO + ((x - LO + gap * 1.3) % SPAN);
      }
      // how high a flyer or a swimmer may range, before any painted region
      let reg: RegionKind | null = null;
      let bandT = want === "sky" ? 0.08 : 0.18;
      let bandB = want === "sky" ? 0.6 : 0.78;
      const m = maskRef.current;
      if (m) {
        // seeded by the creature's own id, so it keeps its spot across renders
        const spot = findSpawn(m, want, seedOf(c.id));
        if (spot) {
          reg = want;
          x = spot.x;
          y = want === "ground" ? groundAt(colsRef.current, floorR, x) + foot : spot.y;
          const band = regionBand(m, want);
          if (band) { bandT = band[0]; bandB = band[1]; }
        }
      }
      const rt: RT = {
        x, y,
        dir: rnd() > 0.5 ? 1 : -1,
        baseY: reg ? y : 0.3 + rnd() * 0.4,
        t: rnd() * 100,
        speed: (0.02 + rnd() * 0.025) * (b === "crawl" || b === "drive" ? 0.7 : 1),
        excite: 0,
        born: c.id === newId ? performance.now() : -1e9,
        labelT: c.id === newId ? performance.now() + 1200 : -1e9,
        seed: rnd() * 1000,
        mode: 0, next: 0, vx: 0, vy: 0,
        ax: x, ay: y, tx: x, ty: y,
        sq: 0, roll: 0, dip: 0,
        reg, bandT, bandB, home: want, foot,
        lag: newLag(), lagW: lagWeight(b), blinkP: 3.1 + rnd() * 1.7,
        sx: 0, sy: 0, flee: 0,
        near: "", nearT: 0, pal: "",
        held: 0, hx: 0, hy: 0, dropT: -1e9,
        trT: -1e9, trK: (rnd() * 4) | 0,
        care: 0, hiN: 0,
      };
      rt.next = rt.t;
      styleSpawn(rt, b);
      rtRef.current.set(c.id, rt);
    };
    for (const c of view) {
      if (!spritesRef.current.has(c.id)) {
        if (c.photoData) {
          // paper-photo creature: stickerize the lifted drawing
          const im = new Image();
          im.onload = () => {
            const S = Math.min(1, 160 / Math.max(im.width, im.height));
            const tmp = document.createElement("canvas");
            tmp.width = Math.max(1, Math.round(im.width * S));
            tmp.height = Math.max(1, Math.round(im.height * S));
            tmp.getContext("2d")!.drawImage(im, 0, 0, tmp.width, tmp.height);
            const sticker = stickerizeImage(tmp);
            spritesRef.current.set(c.id, { frames: [sticker, sticker, sticker, sticker], w: sticker.width, h: sticker.height });
            ensureRT(c);
            forceTick((n) => n + 1); // roster thumbnails can paint now
          };
          im.src = c.photoData;
          continue;
        }
        spritesRef.current.set(c.id, bakeCrayonSprite(c));
      }
      ensureRT(c);
    }
    // released creatures must not keep their sprite/runtime state alive
    const alive = new Set(view.map((c) => c.id));
    for (const id of [...rtRef.current.keys()]) if (!alive.has(id)) rtRef.current.delete(id);
    for (const id of [...spritesRef.current.keys()]) if (!alive.has(id)) spritesRef.current.delete(id);
  }, [view, newId, floorR]);

  // Repainting the world moves the water and the hills. Anyone left standing in
  // the wrong place is re-homed — once, here, never in the render loop.
  useEffect(() => {
    const m = mask;
    for (const c of creaturesRef.current) {
      const rt = rtRef.current.get(c.id);
      if (!rt) continue;
      const b = kindById(c.kindId).behavior;
      const want = regionForBehavior(b);
      const spot = m ? findSpawn(m, want, seedOf(c.id)) : null;
      if (!m || !spot) { rt.reg = null; continue; }
      const band = regionBand(m, want);
      if (band) { rt.bandT = band[0]; rt.bandB = band[1]; }
      const home = want === "ground"
        ? hasGroundAt(groundCols, rt.x)
        : regionAt(m, Math.max(0, Math.min(1, rt.x)), Math.max(0, Math.min(1, rt.y))) === want;
      rt.reg = want;
      if (home) continue;
      rt.x = spot.x;
      rt.y = want === "ground" ? groundAt(groundCols, floorR, spot.x) : spot.y;
      rt.baseY = rt.y;
      rt.ax = rt.tx = rt.x;
      rt.ay = rt.ty = rt.y;
    }
  }, [mask, groundCols, floorR]);

  // entrance banner + splash sound (once per arriving creature)
  useEffect(() => {
    if (!newCreature || arrivalRef.current === newCreature.id) return;
    arrivalRef.current = newCreature.id;
    const kind = kindById(newCreature.kindId);
    sfxSplash();
    pushBanner(`${newCreature.name} the ${kind.label} ${arrivalLine(worldId, kind.behavior)}!`, "sparkle");
  }, [newCreature, worldId, pushBanner]);

  // gentle ambient bubbles (ocean only)
  useEffect(() => {
    if (worldId !== "ocean") return;
    const iv = setInterval(() => { if (Math.random() < 0.5) sfxBubble(); }, 5000);
    return () => clearInterval(iv);
  }, [worldId]);

  // a world switch invalidates every cached scenery layer
  useEffect(() => {
    fxRef.current = newFxState();
    return () => clearLayers();
  }, [worldId]);

  /* ── main render loop ─────────────────────────────────────────────────── */
  // Intentionally mount-scoped: everything that changes over the scene's life
  // (creature list, world id, floor ratio, polish set) is read through a ref,
  // so the loop is never torn down and rebuilt mid-animation.
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    let raf = 0;
    let W = 0, H = 0;
    const bubbles: { x: number; y: number; r: number; v: number; wob: number }[] = [];
    const sparkles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    let lastT = performance.now();
    /** Ground shake, in px. A footfall knocks it up; it dies away in a moment. */
    let shake = 0;
    /* ── idle beats ──────────────────────────────────────────────────────────
       Every so often one creature — never two, that reads as a bug — does
       something it did not have to do: a spin, a hop, a shiver, a look at
       whoever is watching. Rarity is the whole point. A hop every few seconds
       is a walk cycle; a hop once in twenty is a personality. One slot, so two
       can never overlap, and the next gap is only counted from the end of the
       last one. All numbers, no allocation. */
    let beatId: string | null = null;
    let beatKind = 0;
    let beatFrom = 0;                 // scene time the beat began
    let beatDur = 0;
    let beatNext = performance.now() / 1000 + 7 + Math.random() * 9;
    let beatDX = 0, beatDY = 0, beatRot = 0, beatSx = 1, beatSy = 1;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const seabedY = () => H * floorRef.current;
    /** What a walker stands on at normalized x — painted hills, or the floor. */
    const gy = (nx: number) => groundAt(colsRef.current, floorRef.current, nx);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      sampleFrame(dt);
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      // A heavy footfall knocks the whole scene about for a moment. The zoom is
      // the amount needed to keep the shifted background covering its own edges.
      shake = shake > 0.06 ? shake * Math.exp(-dt * 7.5) : 0;
      if (shake > 0) {
        const k = 1 + (2.4 * shake) / Math.max(1, Math.min(W, H));
        const ox = Math.sin(now * 0.085) * shake - ((k - 1) * W) / 2;
        const oy = Math.cos(now * 0.121) * shake - ((k - 1) * H) / 2;
        ctx.setTransform(dpr * k, 0, 0, dpr * k, ox * dpr, oy * dpr);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const t = now / 1000;
      const world = worldRef.current;

      /* ── world theme (background + floor + ambience) ── */
      const frame = { ctx, W, H, t, floorY: seabedY() };
      if (world === "dream") drawDream(frame, fxRef.current, dt, dreamRef.current ?? null);
      else if (world === "space") drawSpace(frame, fxRef.current, dt);
      else if (world === "farm") drawFarm(frame, fxRef.current, dt);
      else if (world === "dino") drawDino(frame, fxRef.current, dt);
      else drawOcean(frame, fxRef.current, dt);

      /* ── bubbles (ocean) / stardust motes (space) ── */
      if (world === "space") {
        ctx.save();
        ctx.fillStyle = "rgba(255,240,200,0.35)";
        for (let i = 0; i < 18; i++) {
          const sx = (((i * 389) % 1000) / 1000) * W + Math.sin(t * 0.3 + i * 2) * 30;
          const sy = (((i * 233 + t * 5) % 1000) / 1000) * H;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.8 + (i % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (world === "ocean" && Math.random() < 0.06 && bubbles.length < 26) {
        bubbles.push({ x: Math.random() * W, y: seabedY(), r: 2 + Math.random() * 5, v: 26 + Math.random() * 30, wob: Math.random() * 10 });
      }
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.v * dt;
        b.x += Math.sin(t * 3 + b.wob) * 0.4;
        if (b.y < H * 0.05) { bubbles.splice(i, 1); continue; }
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* ── creatures ── */
      const list = creaturesRef.current;
      const pen = maskRef.current;          // the painted regions, when there are any
      const calm = calmRef.current;         // < 1 when the viewer asked for less motion

      /* ── whose turn it is to be a character ── */
      if (beatId !== null) {
        const u = (t - beatFrom) / beatDur;
        if (u >= 1) {
          beatId = null;
          beatDX = 0; beatDY = 0; beatRot = 0; beatSx = 1; beatSy = 1;
          beatNext = t + (15 + Math.random() * 15) / calm;   // 15–30s, and longer when calmed
        } else if (beatKind === 0) {                 // a whole turn, for no reason at all
          const e = u * u * (3 - 2 * u);
          beatRot = e * Math.PI * 2;
        } else if (beatKind === 1) {                 // a hop, stretched at the top
          const k = Math.sin(Math.PI * u);
          beatDY = -k * 26 * calm;
          beatSx = 1 - k * 0.1 * calm;
          beatSy = 1 + k * 0.1 * calm;
        } else if (beatKind === 2) {                 // a shiver that shakes itself out
          const d = Math.sin(u * 44) * (1 - u) * calm;
          beatDX = d * 4;
          beatRot = d * 0.05;
        } else {                                     // a look at whoever is watching
          const f = Math.min(1, Math.sin(Math.PI * u) * 1.7);
          beatSx = 1 - 0.34 * f * calm;              // turning towards you, flattened
          beatDY = -3 * f;
          beatRot = Math.sin(u * Math.PI * 2) * 0.05 * calm;
        }
      } else if (t >= beatNext && list.length > 0) {
        // whoever it falls to must be on screen and done arriving
        const pick = list[(Math.random() * list.length) | 0];
        const prt = rtRef.current.get(pick.id);
        if (prt && now - prt.born > 2400 && prt.x > -0.2 && prt.x < 1.2) {
          const pb = kindById(pick.kindId).behavior;
          beatId = pick.id;
          beatFrom = t;
          beatKind = ROOTED.has(pb) ? 2 + ((Math.random() * 2) | 0) : (Math.random() * 4) | 0;
          beatDur = (beatKind === 0 ? 0.8 : beatKind === 1 ? 0.55 : beatKind === 2 ? 0.7 : 1.1) / calm;
        } else {
          beatNext = t + 2;                          // ask again in a moment
        }
      }

      // nobody stands so low that the bottom HUD is drawn over them
      const standCap = Math.max(0.62, 1 - HUD_CLEAR / Math.max(1, H));
      for (const c of list) {
        const sp = spritesRef.current.get(c.id);
        const rt = rtRef.current.get(c.id);
        if (!sp || !rt) continue;
        const kind = kindById(c.kindId);
        const b = kind.behavior;
        rt.t += dt;
        rt.excite = Math.max(0, rt.excite - dt);
        const speedBoost = 1 + rt.excite * 3;
        const sizeF = Math.min(W, H) / 520;

        // where it was, in case the painted world says it may not go there
        const wasX = rt.x, wasY = rt.y, wasB = rt.baseY;

        // behavior motion
        if (b === "swim" || b === "fly") {
          rt.x += rt.dir * rt.speed * speedBoost * dt;
          rt.baseY += Math.sin(t * 0.3 + rt.seed) * 0.008 * dt * 60;
          // (the painted band, when the child painted one — else exactly as before)
          rt.baseY = Math.min(rt.reg ? rt.bandB - 0.03 : 0.72, Math.max(rt.reg ? rt.bandT + 0.03 : 0.16, rt.baseY));
          rt.y = rt.baseY + Math.sin(rt.t * (b === "fly" ? 1.4 : 0.9) + rt.seed) * 0.045;
          if (rt.x > 1.08) { rt.x = 1.08; rt.dir = -1; }
          if (rt.x < -0.08) { rt.x = -0.08; rt.dir = 1; }
        } else if (b === "drive" || b === "crawl") {
          rt.x += rt.dir * rt.speed * speedBoost * dt;
          rt.y = gy(rt.x) + rt.foot + Math.abs(Math.sin(rt.t * (b === "drive" ? 9 : 4))) * -0.008;
          if (rt.x > 1.05) { rt.dir = -1; }
          if (rt.x < -0.05) { rt.dir = 1; }
        } else if (b === "float") {
          rt.y = 0.4 + Math.sin(rt.t * 0.35 + rt.seed) * 0.22;
          rt.x += Math.sin(rt.t * 0.22 + rt.seed * 2) * 0.0004;
        } else if (b === "twinkle") {
          rt.y += Math.sin(rt.t * 0.8 + rt.seed) * 0.0006;
          rt.x += Math.cos(rt.t * 0.5 + rt.seed) * 0.0004;
        } else if (b === "bounce") {
          rt.x += rt.dir * rt.speed * 0.8 * speedBoost * dt;
          const hop = Math.abs(Math.sin(rt.t * 2.2 + rt.seed));
          rt.y = (rt.reg ? gy(rt.x) + rt.foot : 0.68) - hop * 0.24;
          if (rt.x > 1.02) rt.dir = -1;
          if (rt.x < -0.02) rt.dir = 1;

        /* ── and now the ten that belong to one kind of thing ── */

        } else if (b === "orbit") {
          // a planet: one slow circle, ten to twenty seconds round. The angle is
          // accumulated (in `vx`) rather than read off the clock, so an excited
          // wobble speeds it up instead of teleporting it round the ring.
          rt.vx += dt * rt.speed * 14 * calm * speedBoost;
          const a = rt.vx + rt.seed;
          rt.x = rt.ax + Math.cos(a) * rt.tx;
          rt.y = rt.ay + Math.sin(a) * rt.ty;
          rt.roll = Math.sin(a) * 0.06;
        } else if (b === "jet") {
          // an octopus: squeeze… surge… then a long, passive, sinking drift
          if (rt.t >= rt.next) {
            if (rt.mode === 0) {                       // the bell squeezes shut
              rt.mode = 1;
              rt.next = rt.t + 0.24 / calm;
              rt.sq = 0.26;
            } else {                                    // and shoves off
              rt.mode = 0;
              rt.next = rt.t + (1.6 + (rt.seed % 10) * 0.14) / calm;
              rt.sq = -0.22;
              rt.vx = rt.dir * 0.34 * calm * speedBoost;
              rt.vy = -0.2 * calm;
            }
          }
          const drag = Math.exp(-1.5 * dt);
          rt.vx *= drag;
          rt.vy = rt.vy * drag + 0.05 * dt;              // and then it sinks again
          rt.x += rt.vx * dt;
          rt.y += rt.vy * dt;
          rt.sq += (0 - rt.sq) * Math.min(1, dt * 3.2);
          rt.roll = -Math.min(0.34, Math.abs(rt.vx) * 0.9);   // nose up on the surge
          if (rt.x > 0.97) { rt.x = 0.97; rt.dir = -1; rt.vx = -Math.abs(rt.vx); }
          if (rt.x < 0.03) { rt.x = 0.03; rt.dir = 1; rt.vx = Math.abs(rt.vx); }
          if (rt.y > rt.bandB - 0.04) { rt.y = rt.bandB - 0.04; rt.vy = -Math.abs(rt.vy) * 0.4; }
          if (rt.y < rt.bandT + 0.04) { rt.y = rt.bandT + 0.04; rt.vy = Math.abs(rt.vy) * 0.4; }
        } else if (b === "scuttle") {
          // a crab: quick sideways skitters and sharp stops. It never turns to
          // face where it is going — that is the whole read.
          if (rt.t >= rt.next) {
            if (rt.mode === 0) {
              rt.mode = 1;
              rt.next = rt.t + (0.16 + (rt.seed % 7) * 0.035) / calm;
              if (Math.random() < 0.4) rt.dir = rt.dir === 1 ? -1 : 1;
            } else {
              rt.mode = 0;
              rt.next = rt.t + (0.4 + (rt.seed % 5) * 0.2 + Math.random() * 0.4) / calm;
            }
          }
          if (rt.mode === 1) {
            rt.x += rt.dir * 0.34 * calm * speedBoost * dt;
            rt.y = gy(rt.x) + rt.foot - Math.abs(Math.sin(rt.t * 26)) * 0.005;
            rt.roll = rt.dir * 0.1;                      // leaning into the dash
          } else {
            rt.y = gy(rt.x) + rt.foot;
            rt.roll = Math.sin(rt.t * 3.1 + rt.seed) * 0.03;   // a nervous little jiggle
          }
          if (rt.x > 0.95) rt.dir = -1;
          if (rt.x < 0.05) rt.dir = 1;
        } else if (b === "stomp") {
          // a T-rex: one heavy step at a time, and the ground knows about it
          const per = 1.15 / calm;
          if (rt.t >= rt.next) {                          // …and it lands
            rt.next = rt.t + per;
            rt.mode = rt.mode === 1 ? 0 : 1;              // alternating feet
            rt.sq = 0.17;
            if (!reducedRef.current) shake = Math.max(shake, 2.4 + 1.6 * Math.min(1.3, c.scale));
            const fy = rt.y * H + sp.h * c.scale * sizeF * 0.4;
            for (let k = 0; k < 5; k++) {
              sparkles.push({
                x: rt.x * W + (Math.random() - 0.5) * 34,
                y: fy,
                vx: (Math.random() - 0.5) * 80,
                vy: -18 - Math.random() * 46,
                life: 0.45 + Math.random() * 0.3,
              });
            }
            if (rt.x > 0.9) rt.dir = -1;
            else if (rt.x < 0.1) rt.dir = 1;
          }
          const step = Math.min(1, (1 - (rt.next - rt.t) / per) / 0.62);   // 0..1 through the swing
          if (step < 1) rt.x += rt.dir * 0.075 * calm * speedBoost * dt;
          rt.y = gy(rt.x) + rt.foot - Math.sin(step * Math.PI) * 0.022;
          rt.sq += (0 - rt.sq) * Math.min(1, dt * 7);
          rt.roll = Math.sin(step * Math.PI) * 0.05 * (rt.mode === 1 ? 1 : -1);
        } else if (b === "waddle") {
          // a chicken: rocks from one foot to the other, and gains a little
          // ground on every rock
          const w = rt.t * 4.6 * calm + rt.seed;
          const rock = Math.sin(w);
          rt.roll = rock * 0.22;
          rt.x += rt.dir * 0.075 * calm * speedBoost * Math.abs(rock) * dt;
          rt.y = gy(rt.x) + rt.foot - Math.abs(Math.cos(w)) * 0.008;
          if (rt.x > 0.94) rt.dir = -1;
          if (rt.x < 0.06) rt.dir = 1;
        } else if (b === "graze") {
          // a cow: amble a few steps, put your head down in the grass, chew
          if (rt.t >= rt.next) {
            rt.mode = rt.mode === 0 ? 1 : 0;
            rt.next = rt.t + (rt.mode === 1 ? 2.6 + (rt.seed % 9) * 0.4 : 2.2 + (rt.seed % 7) * 0.5) / calm;
            if (rt.mode === 0 && Math.random() < 0.35) rt.dir = rt.dir === 1 ? -1 : 1;
          }
          rt.dip += ((rt.mode === 1 ? 1 : 0) - rt.dip) * Math.min(1, dt * 2.6);
          if (rt.mode === 0) rt.x += rt.dir * 0.05 * calm * speedBoost * (1 - rt.dip) * dt;
          rt.roll = rt.dip * (0.3 + Math.sin(rt.t * 7.5) * 0.03);   // nose down, chewing
          rt.y = gy(rt.x) + rt.foot + rt.dip * 0.012;
          if (rt.x > 0.94) rt.dir = -1;
          if (rt.x < 0.06) rt.dir = 1;
        } else if (b === "hover") {
          // a UFO: hold station, bob — then slide, decisively, somewhere new
          if (rt.t >= rt.next) {
            if (rt.mode === 0) {
              rt.mode = 1;
              rt.tx = 0.12 + Math.random() * 0.76;
              rt.ty = rt.bandT + 0.08 + Math.random() * Math.max(0.02, rt.bandB - rt.bandT - 0.16);
              rt.next = rt.t + 1.4 / calm;
            } else {
              rt.mode = 0;
              rt.ax = rt.tx; rt.ay = rt.ty;
              rt.next = rt.t + (1.5 + Math.random() * 1.6) / calm;
            }
          }
          if (rt.mode === 1) {
            const k = Math.min(1, dt * 3.2 * calm * speedBoost);
            const dx = rt.tx - rt.ax;
            rt.ax += dx * k;
            rt.ay += (rt.ty - rt.ay) * k;
            rt.roll = Math.max(-0.2, Math.min(0.2, dx * 0.7));      // banking into the move
          } else {
            rt.roll += (0 - rt.roll) * Math.min(1, dt * 3);
          }
          rt.x = rt.ax + Math.sin(rt.t * 0.7 + rt.seed) * 0.005;
          rt.y = rt.ay + Math.sin(rt.t * 1.9 + rt.seed) * 0.009;
        } else if (b === "streak") {
          // a comet: one fast diagonal dash, gone, then round again from
          // another edge. While it is away it waits off-canvas, where nothing
          // draws it and nothing can tap it.
          if (rt.mode === 1) {
            if (rt.t >= rt.next) {
              rt.mode = 0;
              const left = Math.random() < 0.5;
              rt.dir = left ? 1 : -1;
              rt.x = left ? -0.14 : 1.14;
              const hi = Math.max(rt.bandT + 0.04, Math.min(rt.bandB - 0.1, rt.bandT + 0.05));
              rt.y = hi + Math.random() * Math.max(0.04, (rt.bandB - hi) * 0.5);
              rt.vx = rt.dir * (0.5 + Math.random() * 0.3) * calm;
              rt.vy = (0.06 + Math.random() * 0.2) * calm;
              rt.roll = Math.atan2(rt.vy, rt.vx * rt.dir);
            } else {
              rt.x = -0.5; rt.y = -0.5;
            }
          } else {
            rt.x += rt.vx * dt * speedBoost;
            rt.y += rt.vy * dt * speedBoost;
            if (rt.x < -0.22 || rt.x > 1.22 || rt.y > Math.min(0.98, rt.bandB + 0.12)) {
              rt.mode = 1;
              rt.next = rt.t + (0.7 + Math.random() * 1.4) / calm;
              rt.x = -0.5; rt.y = -0.5;
            }
          }
        } else if (b === "erupt") {
          // a volcano: rooted and grumbling, with the occasional puff
          if (rt.t >= rt.next) {
            const big = Math.random() < 0.3;
            rt.next = rt.t + (big ? 5 : 2.2) + Math.random() * 3;
            rt.sq = big ? -0.14 : -0.06;
            if (big && !reducedRef.current) shake = Math.max(shake, 1.6);
            const top = rt.y * H - sp.h * c.scale * sizeF * 0.5;
            const puff = big ? 16 : 5;
            for (let k = 0; k < puff; k++) {
              sparkles.push({
                x: rt.x * W + (Math.random() - 0.5) * 20,
                y: top,
                vx: (Math.random() - 0.5) * 70 * calm,
                vy: -(60 + Math.random() * 130) * calm,
                life: 0.6 + Math.random() * 0.6,
              });
            }
          }
          rt.sq += (0 - rt.sq) * Math.min(1, dt * 2.2);
          const rumble = Math.min(1, Math.max(0, -rt.sq) * 9);
          rt.x = rt.ax + Math.sin(rt.t * 31) * 0.0022 * rumble;
          rt.y = gy(rt.x) + rt.foot;
          rt.roll = Math.sin(rt.t * 0.6 + rt.seed) * 0.012;
        } else if (b === "sway") {
          // a palm tree: rooted, arcing over and back like something in a current
          const a = rt.t * 0.85 * calm + rt.seed;
          rt.roll = (Math.sin(a) * 0.17 + Math.sin(a * 2.1 + 1.3) * 0.045) * calm;
          rt.x = rt.ax + Math.sin(a) * 0.004;
          rt.y = gy(rt.x) + rt.foot;
        }
        // grow, and anything we have never heard of: anchored, sway only

        if (GROUNDED.has(b) && rt.y > standCap) rt.y = standCap;

        /* ── a painted world keeps everyone where they belong ── */
        if (pen && rt.reg) {
          if (rt.reg === "ground") {
            if (!hasGroundAt(colsRef.current, rt.x)) {
              rt.x = wasX; rt.y = wasY;
              rt.dir = rt.dir === 1 ? -1 : 1;
              rt.ax = rt.x;
            }
          } else if (b !== "streak") {
            if (rt.y < rt.bandT + 0.02) rt.y = rt.bandT + 0.02;
            else if (rt.y > rt.bandB - 0.02) rt.y = rt.bandB - 0.02;
            const cy = rt.y < 0 ? 0 : rt.y > 1 ? 1 : rt.y;
            const cx = rt.x < 0 ? 0 : rt.x > 1 ? 1 : rt.x;
            if (regionAt(pen, cx, cy) !== rt.reg) {
              rt.x = wasX; rt.y = wasY; rt.baseY = wasB;
              rt.dir = rt.dir === 1 ? -1 : 1;
              rt.vx = -rt.vx * 0.6; rt.vy = -rt.vy * 0.6;
              if (b === "hover") {                        // pick somewhere it can actually go
                rt.ax = rt.tx = rt.x; rt.ay = rt.ty = rt.y;
                rt.mode = 0; rt.next = rt.t + 0.7;
              }
            }
          }
        }

        /* ── what trails ──────────────────────────────────────────────────
           Once a frame, from how far this creature *actually* ended up moving
           — after its own motion, after the standing cap, after a painted
           region has pushed it back. A comet leaving and re-entering the scene
           is a jump, not a movement, so its followers are reset rather than
           whipped: the shear then eases away from where it was instead of
           snapping. `updateLag` writes into `rt.lag` in place. */
        const ldx = rt.x - wasX, ldy = rt.y - wasY;
        if (ldx * ldx + ldy * ldy > 0.04) {
          rt.lag.vx = 0; rt.lag.vy = 0; rt.lag.wx = 0; rt.lag.wy = 0;
        } else {
          updateLag(rt.lag, ldx, ldy, dt, rt.lagW, calm);
        }

        const px = rt.x * W;
        const py = rt.y * H;
        /* Growing up costs nothing to draw: the sprite is baked at a fixed size
           and scaled here, so a creature that has been visited for a fortnight
           is simply drawn half again as large — and its hit target, its name
           tag, its trailing anchor and every particle that comes off it follow
           for free, because all of them are already measured from `scl`. */
        const scl = c.scale * growthScale(c.care) * sizeF * (1 + rt.excite * 0.25);
        const entrance = now - rt.born < 1600;
        const e = entrance ? Math.max(0, Math.min(1, (now - rt.born) / 1600)) : 1;
        const ease = 1 - Math.pow(1 - e, 3);

        // entrance sparkle trail
        if (entrance && Math.random() < 0.7) {
          sparkles.push({
            x: px + (Math.random() - 0.5) * 50,
            y: py + (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 40,
            vy: -30 - Math.random() * 40,
            life: 1,
          });
        }
        // rocket exhaust: space flyers leave a stardust trail
        if (world === "space" && b === "fly" && !entrance && Math.random() < 0.18) {
          sparkles.push({
            x: px - rt.dir * 40 * sizeF * c.scale,
            y: py + (Math.random() - 0.5) * 14,
            vx: -rt.dir * (30 + Math.random() * 30),
            vy: (Math.random() - 0.5) * 20,
            life: 0.7,
          });
        }

        // a comet drags its tail behind it, whatever world it turns up in
        if (b === "streak" && rt.mode === 0 && Math.random() < 0.7) {
          sparkles.push({
            x: px - rt.vx * W * 0.045,
            y: py - rt.vy * H * 0.045,
            vx: -rt.vx * W * 0.16,
            vy: -rt.vy * H * 0.16,
            life: 0.5 + Math.random() * 0.35,
          });
        }

        ctx.save();
        ctx.translate(px, py);
        if (entrance) {
          ctx.scale(ease * scl, ease * scl);
          ctx.rotate((1 - ease) * Math.PI * 4 * rt.dir);
          ctx.globalAlpha = ease;
        } else {
          /* ── the idle beat, if this is the one having one ── */
          if (beatId === c.id) {
            if (beatDX !== 0 || beatDY !== 0) ctx.translate(beatDX * sizeF, beatDY * sizeF);
            if (beatRot !== 0) ctx.rotate(beatRot);
            if (beatSx !== 1 || beatSy !== 1) ctx.scale(beatSx, beatSy);
          }
          /* ── what trails ──
             Applied out here, *before* the facing flip below: the whip is a
             direction in the world, and `scale(scl * flip, …)` would mirror it
             onto the wrong side of anything walking left. Out here it is also
             in screen px, so the sprite's drawn height is `sp.h * scl`. It
             wraps the tilt rather than fighting it — the body still swims and
             leans inside a frame that is itself trailing. */
          applyLag(ctx, rt.lag, sp.h * scl, GROUNDED.has(b));
          const tilt = b === "swim" ? Math.sin(rt.t * 1.8 + rt.seed) * 0.07 :
                       b === "grow" ? Math.sin(rt.t * 1.1 + rt.seed) * 0.06 :
                       b === "twinkle" ? Math.sin(rt.t * 0.9 + rt.seed) * 0.1 : 0;
          const spaceRoll =
            world === "space" && (b === "swim" || b === "float" || b === "fly")
              ? Math.sin(rt.t * 0.45 + rt.seed) * 0.2
              : 0;
          const flip = FACING.has(b) ? rt.dir : 1;
          ctx.scale(scl * flip, scl);
          // `rt.roll` is a lean in screen terms, so unlike `tilt` it is not
          // mirrored by the flip: a grazing cow puts its head down towards the
          // grass whichever way round it happens to be standing. Things with
          // feet pivot on them, so a palm tree bends from its root and a T-rex
          // squashes onto the ground rather than through it.
          const footed = FOOTED.has(b);
          if (footed) ctx.translate(0, sp.h * FOOT);
          ctx.rotate(tilt * flip + spaceRoll + rt.roll);
          if (rt.sq !== 0) ctx.scale(1 + rt.sq, 1 - rt.sq);
          if (footed) ctx.translate(0, -sp.h * FOOT);
          if (b === "twinkle") {
            const p = 1 + Math.sin(rt.t * 3 + rt.seed) * 0.08;
            ctx.scale(p, p);
          }
        }
        /* One shared blink clock, staggered by each creature's own seed and run
           at its own period, so no two ever close together. Skipped entirely
           while a creature is still making its entrance. */
        const bph = (t + rt.seed) % rt.blinkP;
        const blink = entrance || bph > 0.12 ? 0 : Math.sin((bph / 0.12) * Math.PI) * calm;

        // AI-polished art (breathing squash) or crayon wiggle frames
        const art = c.artUrl ? artSprite(c.artUrl) : null;
        if (art) {
          const breathe = 1 + Math.sin(rt.t * 2.4 + rt.seed) * 0.045 + rt.excite * 0.1;
          const ar = art.width / art.height;
          const ah = sp.h * 1.15;
          const aw = ah * ar;
          ctx.scale(breathe, 1 / breathe);
          drawBlink(ctx, art, -aw / 2, -ah / 2, aw, ah, blink);
        } else {
          const frameI = Math.floor(rt.t * (rt.excite > 0 ? 14 : 7)) % 4;
          const img = sp.frames[frameI];
          drawBlink(ctx, img, -sp.w / 2, -sp.h / 2, sp.w, sp.h, blink);
        }
        ctx.restore();

        // golden halo during entrance
        if (entrance) {
          ctx.save();
          ctx.globalAlpha = (1 - e) * 0.7;
          const rg = ctx.createRadialGradient(px, py, 4, px, py, 90 * ease + 10);
          rg.addColorStop(0, "rgba(255,214,90,0.9)");
          rg.addColorStop(1, "rgba(255,214,90,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(px, py, 90 * ease + 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // name label — a paper tag torn off and written on, not a UI pill
        if (now - rt.labelT < 2200 && now - rt.labelT > 0) {
          ctx.save();
          ctx.font = `800 ${Math.round(15 * sizeF) + 8}px 'Baloo 2', sans-serif`;
          const label = `${c.name} the ${kind.label}`;
          const tw = Math.round(ctx.measureText(label).width + 32);
          const th = 38;
          const ly = py - sp.h * scl * 0.62 - 18;
          const seed = (c.id.charCodeAt(0) * 37 + c.id.length * 11) % 997;
          const tag = tagPath(tw, th, seed);
          ctx.translate(px - tw / 2, ly - 28);
          ctx.fillStyle = "#fffaf0";
          ctx.fill(tag);
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2.6;
          ctx.lineJoin = "round";
          ctx.stroke(tag);
          ctx.fillStyle = "#563e79";
          ctx.textAlign = "center";
          ctx.fillText(label, tw / 2, th * 0.68);
          ctx.restore();
        }

        // magic-dust aura: AI polish in progress for this creature
        if (polishRef.current.has(c.id) && !c.artUrl) {
          const R = (Math.max(sp.w, sp.h) / 2) * scl + 14;
          ctx.save();
          ctx.translate(px, py);
          for (let k = 0; k < 7; k++) {
            const a = t * 1.6 + (k / 7) * Math.PI * 2 + rt.seed;
            const rr = R * (1 + 0.12 * Math.sin(t * 3 + k * 1.7));
            const sx = Math.cos(a) * rr;
            const sy = Math.sin(a) * rr * 0.8;
            const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 4.2 + k * 2.1));
            ctx.globalAlpha = tw;
            ctx.fillStyle = k % 3 === 0 ? "#fff3c4" : "#ffd65a";
            drawSpark(ctx, sx, sy, 4.5 * sizeF + 2, t * 3 + k);
          }
          // a little drawn tag above the creature, with a drawn star on it
          const hint = "magic dust…";
          ctx.font = `800 ${Math.round(11 * sizeF) + 7}px 'Baloo 2', sans-serif`;
          const hw = Math.round(ctx.measureText(hint).width + 46);
          const hh = 30;
          const hy = -R - 30 + Math.sin(t * 2.2) * 3;
          const tag = tagPath(hw, hh, 613);
          ctx.globalAlpha = 0.95;
          ctx.save();
          ctx.translate(-hw / 2, hy - hh / 2);
          ctx.fillStyle = "#ffd65a";
          ctx.fill(tag);
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2.2;
          ctx.lineJoin = "round";
          ctx.stroke(tag);
          ctx.fillStyle = "#2d2926";
          drawSpark(ctx, 17, hh / 2, 3.6, t * 1.8);
          ctx.textAlign = "center";
          ctx.fillText(hint, hw / 2 + 10, hh * 0.68);
          ctx.restore();
          ctx.restore();
        }
      }

      /* ── sparkles (incl. evolution bursts) ── */
      while (burstRef.current.length) {
        const b = burstRef.current.pop()!;
        for (let k = 0; k < 46; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 160;
          sparkles.push({
            x: b.x * W + (Math.random() - 0.5) * 30,
            y: b.y * H + (Math.random() - 0.5) * 30,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 40,
            life: 1 + Math.random() * 0.4,
          });
        }
      }
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.life -= dt * 1.4;
        if (s.life <= 0) { sparkles.splice(i, 1); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.fillStyle = "#ffd65a";
        drawSpark(ctx, s.x, s.y, 4 * s.life + 1, t * 4);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  /* ── tapping a creature ───────────────────────────────────────────────── */
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  useEffect(() => cancelPress, [cancelPress]);

  /** Size-aware hit test: the target grows with the creature, never below 48px. */
  const hitAt = useCallback((nx: number, ny: number, W: number, H: number): Creature | null => {
    const sizeF = Math.min(W, H) / 520;
    const maxR = Math.min(W, H) * 0.3;
    let best: { c: Creature; d: number } | null = null;
    for (const c of creaturesRef.current) {
      const rt = rtRef.current.get(c.id);
      const sp = spritesRef.current.get(c.id);
      if (!rt || !sp) continue;
      const scl = c.scale * growthScale(c.care) * sizeF * (1 + rt.excite * 0.25);
      const rPx = Math.min(maxR, Math.max(28, (Math.max(sp.w, sp.h) / 2) * scl * 1.05));
      const d = Math.hypot((rt.x - nx) * W, (rt.y - ny) * H) / rPx;
      if (d <= 1 && (!best || d < best.d)) best = { c, d };
    }
    return best?.c ?? null;
  }, []);

  const onCanvasDown = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    const hit = hitAt(nx, ny, r.width, r.height);
    if (!hit) return;
    const rt = rtRef.current.get(hit.id);
    if (rt) { rt.excite = 1; rt.labelT = performance.now(); }
    sfxPop();
    cancelPress();
    // hold a creature to open its card
    const id = hit.id;
    pressRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        pressRef.current = null;
        if ("vibrate" in navigator) navigator.vibrate(18);
        setNameDraft(creaturesRef.current.find((x) => x.id === id)?.name ?? "");
        setConfirmDel(false);
        setSheet({ mode: "detail", id });
      }, LONG_PRESS_MS),
    };
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) cancelPress();
  };

  /* ── creature edits ───────────────────────────────────────────────────── */
  // When the app hands us callbacks it owns the data. Otherwise we keep the
  // edit locally and write it back ourselves — see the persistence effect.
  const appOwnsEdits = !!onRenameCreature || !!onDeleteCreature;
  const editedRef = useRef(false);

  const commitRename = useCallback((c: Creature, raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
    if (!name || name === c.name) return;
    if (onRenameCreature) onRenameCreature(c.id, name);
    else {
      editedRef.current = true;
      setRenames((r) => ({ ...r, [c.id]: name }));
    }
    sfxHappy();
    pushBanner(`Say hello to ${name}!`, "pencil");
  }, [onRenameCreature, pushBanner]);

  const releaseCreature = useCallback((c: Creature) => {
    if (onDeleteCreature) onDeleteCreature(c.id);
    else {
      editedRef.current = true;
      setReleased((s) => new Set(s).add(c.id));
    }
    sfxSplash();
    pushBanner(`${c.name} went off to explore. Bye!`, "globe");
    setConfirmDel(false);
    setSheet(view.length > 1 ? { mode: "roster" } : null);
  }, [onDeleteCreature, pushBanner, view.length]);

  /* Fallback persistence. The timeout deliberately lands after the parent's own
     save effect (child effects run first), so a background art update can't
     resurrect a released creature or an old name. Wiring
     onRenameCreature/onDeleteCreature in App.tsx removes the need for this. */
  useEffect(() => {
    if (appOwnsEdits || !editedRef.current) return;
    const t = window.setTimeout(() => {
      try { saveCreatures(view); } catch { /* storage full / private mode */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, [view, appOwnsEdits]);

  /* ── share card ───────────────────────────────────────────────────────────
     This is the artifact that leaves the app, so it is built the same way the
     rest of the interface is: a real sheet of paper, the world taped into it,
     the wordmark laid down in wax. */
  const doShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    sfxTap();
    try {
      const src = canvasRef.current;
      if (!src || !src.width || !src.height) return;
      const CW = 1200, CH = 900;
      const card = document.createElement("canvas");
      card.width = CW; card.height = CH;
      const ctx = card.getContext("2d");
      if (!ctx) return;

      /* the ground: warm stock with fibre, lit from above */
      ctx.fillStyle = "#f7e8ca";
      ctx.fillRect(0, 0, CW, CH);
      const fibre = await loadImage(paperTile());
      if (fibre) {
        const pat = ctx.createPattern(fibre, "repeat");
        if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, CW, CH); }
      }
      const lit = ctx.createLinearGradient(0, 0, 0, CH);
      lit.addColorStop(0, "rgba(255,255,255,0.5)");
      lit.addColorStop(0.5, "rgba(255,255,255,0)");
      lit.addColorStop(1, "rgba(186,158,113,0.32)");
      ctx.fillStyle = lit;
      ctx.fillRect(0, 0, CW, CH);

      /* the world, taped into the book, cropped to fill (never squashed) */
      const mw = 1044, mh = 524;
      const my = 142;
      const srcAR = src.width / src.height;
      const dstAR = mw / mh;
      /* Aim the crop at the child's drawings rather than at the middle of the
         screen. A tall phone survives as a band about a quarter of its height,
         and dead centre routinely lands in empty water between the creatures —
         an empty souvenir. So slide a window of the crop's size over the
         creature positions and keep the fullest one, then centre on that group.
         rt.x/rt.y are normalised, so this is independent of backing-store scale. */
      const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
      const aim = (pick: (r: RT) => number, span: number, extent: number) => {
        const ps = [...rtRef.current.values()].map((r) => pick(r) * extent).sort((a, b) => a - b);
        if (!ps.length) return (extent - span) / 2;
        let bestN = 0, bestC = extent / 2;
        for (let i = 0; i < ps.length; i++) {
          let j = i;
          while (j + 1 < ps.length && ps[j + 1] - ps[i] <= span) j++;
          if (j - i + 1 > bestN) { bestN = j - i + 1; bestC = (ps[i] + ps[j]) / 2; }
        }
        return clamp(bestC - span / 2, extent - span);
      };
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (srcAR > dstAR) { sw = src.height * dstAR; sx = aim((r) => r.x, sw, src.width); }
      else { sh = src.width / dstAR; sy = aim((r) => r.y, sh, src.height); }

      ctx.save();
      ctx.translate(CW / 2, my + mh / 2);
      ctx.rotate(-0.013);
      ctx.translate(-mw / 2, -mh / 2);
      const frame = new Path2D(roughRect(mw, mh, { seed: 12, wobble: 9, radius: 20 }));
      ctx.save();
      ctx.shadowColor = "rgba(74,58,40,0.34)";
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = "#fffdf7";
      ctx.fill(frame);
      ctx.restore();
      ctx.save();
      ctx.clip(frame);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, mw, mh);
      ctx.restore();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "#2d2926";
      ctx.lineWidth = 7;
      ctx.stroke(frame);
      // the pen goes over the line a second time, and never in the same place
      ctx.save();
      ctx.translate(1.5, 2);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 4;
      ctx.stroke(new Path2D(roughRect(mw, mh, { seed: 103, wobble: 9, radius: 20 })));
      ctx.restore();
      // washi tape over two corners
      const tape = (x: number, y: number, rot: number, color: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = color;
        const w = 176, h = 50;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, -h / 2);
        for (let i = 1; i <= 5; i++) ctx.lineTo(w / 2 + (i % 2 ? -8 : 8), -h / 2 + (h * i) / 5);
        ctx.lineTo(-w / 2, h / 2);
        for (let i = 4; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? 8 : -8), -h / 2 + (h * i) / 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      tape(46, -6, -0.42, "#ffd98e");
      tape(mw - 46, mh + 6, -0.42, "#a8e6f0");
      ctx.restore();

      /* the headline, written on the page */
      const star = newCreature ? `“${newCreature.name}” came alive!` : "Look what I drew — it’s ALIVE!";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = "800 58px 'Baloo 2', Nunito, sans-serif";
      ctx.fillStyle = "#563e79";
      ctx.fillText(star, CW / 2, 92);
      // a crayon swoosh under it — drawn, not stroked
      const uw = Math.min(CW - 220, ctx.measureText(star).width + 24);
      const ur = hand(seedOf(star));
      const upts = Array.from({ length: 22 }, (_, i) => {
        const p = i / 21;
        return { x: CW / 2 - uw / 2 + uw * p, y: 116 + Math.sin(p * 3.1) * 5 + (ur() - 0.5) * 4 };
      });
      drawCrayonStroke(ctx, upts, "#ffc72c", 13, 17);

      /* the wordmark, laid down letter by letter in wax colours */
      const WORD = "MAGIC PEN";
      const HUES: (string | null)[] = ["#e63b2e", "#ff7a1a", "#ffc72c", "#3aae3a", "#2f6fe4", null, "#8b46c7", "#fb66e5", "#00c2b9"];
      ctx.font = "800 34px 'Baloo 2', Nunito, sans-serif";
      ctx.fillStyle = "#7a6a58";
      ctx.fillText("made with", CW / 2, 736);
      ctx.font = "800 66px 'Baloo 2', Nunito, sans-serif";
      const widths = [...WORD].map((ch) => ctx.measureText(ch).width + 3);
      const total = widths.reduce((a, b) => a + b, 0);
      let cx = CW / 2 - total / 2;
      const wr = hand(451);
      ctx.textAlign = "left";
      [...WORD].forEach((ch, i) => {
        const w = widths[i];
        if (ch !== " ") {
          ctx.save();
          ctx.translate(cx + w / 2, 812 + (wr() - 0.5) * 7);
          ctx.rotate((wr() - 0.5) * 0.1);
          ctx.lineJoin = "round";
          ctx.lineWidth = 8;
          ctx.strokeStyle = "#2d2926";
          ctx.strokeText(ch, -w / 2, 0);
          ctx.fillStyle = HUES[i] ?? "#2d2926";
          ctx.fillText(ch, -w / 2, 0);
          ctx.restore();
        }
        cx += w;
      });
      ctx.textAlign = "center";
      // two drawn stars flanking the mark
      ctx.fillStyle = "#ffc72c";
      drawSpark(ctx, CW / 2 - total / 2 - 46, 790, 13, 0.3);
      drawSpark(ctx, CW / 2 + total / 2 + 46, 790, 13, -0.4);
      ctx.font = "700 26px Nunito, sans-serif";
      ctx.fillStyle = "#8a7a68";
      ctx.fillText("draw it · it lives", CW / 2, 858);

      /* torn off a pad: the bottom edge is never straight */
      const torn = new Path2D(`${tornEdge(CW, 16, 21)} L${CW} 60 L0 60 Z`);
      ctx.save();
      ctx.translate(0, CH - 22);
      ctx.fillStyle = "rgba(176,148,104,0.45)";
      ctx.fill(torn);
      ctx.restore();

      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, "image/png"));
      if (!blob) { pushBanner("Hmm — the photo didn't come out. Try again!", "camera"); return; }
      const file = new File([blob], "magic-pen.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "MAGIC PEN", text: "My drawing came alive!" });
          return;
        } catch (err) {
          // kid cancelled → done; anything else (desktop, permissions) → download
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "magic-pen.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      pushBanner("Saved your world as a picture!", "camera");
    } finally {
      setSharing(false);
    }
  }, [newCreature, pushBanner, sharing]);

  /* ── overlays: close on Escape ────────────────────────────────────────── */
  useEffect(() => {
    if (!sheet && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(null);
      else setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, menuOpen]);

  const openDetail = (c: Creature) => {
    sfxTap();
    setNameDraft(c.name);
    setConfirmDel(false);
    setSheet({ mode: "detail", id: c.id });
  };
  const toggleSound = () => { const m = !muted; setM(m); setMuted(m); sfxTap(); };
  const emptyLine = WORLD_EMPTY[worldId] ?? WORLD_EMPTY.ocean;
  const prompts = (WORLD_PACKS.find((p) => p.id === worldId) ?? WORLD_PACKS[0]).prompts;
  const padX = { paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" };
  const bannerInk = BANNER_INK[banner?.icon ?? "sparkle"] ?? { color: "#2d2926" };

  return (
    <div ref={wrapRef} className="h-full relative overflow-hidden" style={{ background: WORLD_BG[worldId] ?? "#0a4d8f" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 canvas-touch"
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
      />

      {/* ── HUD ── */}
      <div
        className="absolute top-0 inset-x-0 z-20 pointer-events-none"
        style={{ ...padX, paddingTop: "max(10px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-start gap-1.5 sm:gap-2">
          <HudBtn
            round
            icon="home"
            seed={41}
            aria-label="Back to home"
            onClick={() => { sfxTap(); onBack(); }}
          />
          <div className="flex-1" />
          <HudBtn
            round
            className="hud-roomy"
            icon={muted ? "soundOff" : "soundOn"}
            seed={77}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!muted}
            onClick={toggleSound}
          />
          <HudBtn
            round
            className="hud-roomy"
            icon="camera"
            seed={12}
            disabled={sharing}
            aria-label="Share a photo of your world"
            onClick={() => void doShare()}
          />
          {view.length > 0 && (
            <HudBtn
              icon="gamepad"
              tone={TONE.play}
              seed={205}
              label="Play"
              labelOnlyWide
              aria-label="Play mini-games"
              onClick={() => { sfxHappy(); onPlayGame(); }}
            />
          )}
          <HudBtn
            icon="pencil"
            tone={TONE.draw}
            seed={331}
            label="Draw"
            labelWide=" more!"
            aria-label="Draw another creature"
            onClick={() => { sfxHappy(); onDrawMore(); }}
          />
          <HudBtn
            round
            icon="more"
            seed={509}
            aria-label="More world options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => { sfxTap(); setMenuOpen((o) => !o); }}
          />
        </div>

        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 pointer-events-auto cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative z-20 mt-2 flex justify-end pointer-events-auto">
              <InkCard
                className="hud-sheet hud-drop p-2 w-60 max-w-full grid gap-1"
                seed={63}
                weight={3.2}
                role="menu"
                aria-label="World options"
              >
                <PaperFibre inset={6} radius={22} />
                <div className="relative grid gap-1">
                  {([
                    ...(worldId === "dream" && onRepaint
                      ? [{
                          key: "repaint",
                          icon: "pencil" as IconName,
                          text: "Redraw my world",
                          onClick: () => { sfxTap(); setMenuOpen(false); onRepaint(); },
                          disabled: false,
                        }]
                      : []),
                    {
                      key: "sound",
                      icon: (muted ? "soundOff" : "soundOn") as IconName,
                      text: muted ? "Sound is off" : "Sound is on",
                      onClick: toggleSound,
                      disabled: false,
                    },
                    {
                      key: "share",
                      icon: "camera" as IconName,
                      text: sharing ? "Making photo…" : "Share a photo",
                      onClick: () => { setMenuOpen(false); void doShare(); },
                      disabled: sharing,
                    },
                    {
                      key: "friends",
                      icon: "heart" as IconName,
                      text: `My friends (${view.length})`,
                      onClick: () => { sfxTap(); setMenuOpen(false); setSheet({ mode: "roster" }); },
                      disabled: false,
                    },
                  ]).map((it) => (
                    <button
                      key={it.key}
                      role="menuitem"
                      onClick={it.onClick}
                      disabled={it.disabled}
                      className="hud-focus hud-menu-item h-12 px-2.5 flex items-center gap-2.5 text-left disabled:opacity-50"
                    >
                      <Icon name={it.icon} size={22} color="var(--plum)" fill={it.icon === "heart" ? "#ff6b6b" : undefined} />
                      <span className="ink-title" style={{ fontSize: "var(--fs-sm)" }}>{it.text}</span>
                    </button>
                  ))}
                </div>
              </InkCard>
            </div>
          </>
        )}
      </div>

      {/* ── banner queue: a note taped into the book ── */}
      {banner && (
        <div
          className="absolute inset-x-0 z-10 flex justify-center pointer-events-none"
          style={{ ...padX, top: "calc(max(10px, env(safe-area-inset-top)) + 62px)" }}
        >
          <div key={banner.id} className="anim-spring-pop max-w-[94%]">
            <div className="hud-drop" style={{ transform: "rotate(-1.2deg)" }}>
              <InkCard className="px-4 py-2.5" seed={seedOf(banner.text)} weight={3.2} role="status">
                <Tape
                  seed={banner.id % 5}
                  style={{ width: 78, height: 26, top: -13, left: "50%", marginLeft: -39, transform: "rotate(-4deg)" }}
                />
                <PaperFibre inset={5} radius={20} />
                <div className="relative flex items-center gap-2">
                  <span className="shrink-0">
                    <Icon name={banner.icon} size={24} color={bannerInk.color} fill={bannerInk.fill} weight={2.2} />
                  </span>
                  <span className="ink-title" style={{ fontSize: "var(--fs-md)" }}>{banner.text}</span>
                </div>
              </InkCard>
            </div>
          </div>
        </div>
      )}

      {/* golden flash on arrival */}
      {newCreature && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 55%, rgba(255,214,90,0.55), transparent 60%)",
            animation: "screen-fade 1.4s ease-out reverse both",
          }}
        />
      )}

      {/* ── friends chip → roster ── */}
      {view.length > 0 && (
        <HudBtn
          icon="heart"
          iconFill="#ff6b6b"
          tone={TONE.sun}
          seed={823}
          label={`${view.length} ${view.length === 1 ? "friend" : "friends"}`}
          className="anim-rise-in z-20"
          /* `.ink-btn` sets `position: relative`, so the placement has to be
             stated inline or the chip lands back in the flow. */
          style={{
            position: "absolute",
            left: "max(12px, env(safe-area-inset-left))",
            bottom: "max(12px, env(safe-area-inset-bottom))",
          }}
          aria-label={`Open your friends list — ${view.length} creatures`}
          onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
        />
      )}

      {/* ── empty state: an actual invitation ── */}
      {/* Dream world: the painted world IS the content, so a first-time visitor
          gets a small bottom nudge instead of a full-screen card that would
          hide the very thing they just made. */}
      {view.length === 0 && worldId === "dream" && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 grid justify-items-center pointer-events-none"
          style={{ ...padX, paddingBottom: "max(16px, var(--safe-b))" }}
        >
          <div className="hud-fade-in hud-drop pointer-events-auto w-full" style={{ maxWidth: 360 }}>
            <InkCard className="px-4 py-3 text-center" seed={seedOf(worldId)} weight={3.2}>
              <PaperFibre inset={6} radius={22} />
              <div className="relative flex items-center gap-3 text-left">
                <span className="anim-float-y shrink-0"><Icon name="sparkle" size={30} color="var(--sun)" fill="var(--sun)" /></span>
                <div className="min-w-0 flex-1">
                  <p className="ink-title leading-tight" style={{ fontSize: "var(--fs-md)" }}>Your world is alive!</p>
                  <p className="ink-hand" style={{ fontSize: "var(--fs-2xs)" }}>Now draw a friend to live in it.</p>
                </div>
                <InkButton
                  tone={TONE.draw.wax}
                  seed={57}
                  className="shrink-0"
                  style={{ height: 52, padding: "0 14px" }}
                  onClick={() => { sfxHappy(); onDrawMore(); }}
                >
                  <Icon name="pencil" size={20} color="#fff6e6" weight={2.3} />
                  <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-sm)" }}>Draw</span>
                </InkButton>
              </div>
            </InkCard>
          </div>
        </div>
      )}

      {view.length === 0 && worldId !== "dream" && (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 pointer-events-none" style={padX}>
          <div className="hud-fade-in hud-drop pointer-events-auto w-full" style={{ maxWidth: 340 }}>
            <InkCard className="px-5 pt-7 pb-5 text-center" seed={seedOf(worldId)} weight={3.4}>
              <Tape seed={2} style={{ width: 74, height: 24, top: -12, left: 14, transform: "rotate(-10deg)" }} />
              <Tape seed={4} style={{ width: 74, height: 24, top: -12, right: 14, transform: "rotate(9deg)" }} />
              <PaperFibre inset={8} radius={26} />

              <div className="relative">
                {/* the mount where the first drawing will go */}
                <div className="mx-auto mt-1 relative hud-motion anim-float-y hud-short-hide" style={{ width: 132, height: 104 }}>
                  <InkShape
                    w={132}
                    h={104}
                    seed={311}
                    weight={2.6}
                    double={false}
                    lifted={false}
                    ink="rgba(86,62,121,0.38)"
                    fill={{ kind: "none" }}
                  />
                  <div className="absolute inset-0 grid place-items-center">
                    <Icon name="pencil" size={42} color="var(--plum)" weight={2.1} />
                  </div>
                </div>

                <h2 className="ink-title mt-2" style={{ fontSize: "var(--fs-2xl)" }}>{emptyLine}</h2>
                <div className="px-8"><Scribble color="var(--sun)" height={10} seed={9} /></div>
                <p className="ink-hand mt-1" style={{ fontSize: "var(--fs-sm)" }}>
                  Draw one thing and watch it come alive right here.
                </p>

                <div className="flex flex-wrap justify-center gap-1.5 my-3">
                  {prompts.slice(0, 3).map((p, i) => (
                    <span key={p} className="hud-slip" style={{ "--tilt": `${(i - 1) * 1.6}deg` } as React.CSSProperties}>
                      {p}
                    </span>
                  ))}
                </div>

                {/* the pulse lives on the wrapper so the button keeps its press feel */}
                <div className="hud-invite hud-motion">
                  <InkButton
                    tone={TONE.draw.wax}
                    seed={57}
                    className="w-full"
                    style={{ height: 62, padding: "0 12px" }}
                    onClick={() => { sfxHappy(); onDrawMore(); }}
                  >
                    <Icon name="pencil" size={23} color="#fff6e6" weight={2.3} />
                    <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-lg)" }}>
                      Draw my first friend!
                    </span>
                  </InkButton>
                </div>
              </div>
            </InkCard>
          </div>
        </div>
      )}

      {/* ── roster / detail sheet: the sketchbook their drawings live in ── */}
      {sheet && (
        <div
          className="hud-scrim absolute inset-0 z-30 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={sheet.mode === "roster" ? "Your friends" : "Creature card"}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}
        >
          <InkCard
            className="hud-sheet w-full max-w-md"
            seed={sheet.mode === "roster" ? 21 : 34}
            weight={3.6}
            style={{ margin: 12, marginBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            <PaperFibre inset={9} radius={30} />
            <div className="relative p-3">
              <div className="flex items-center gap-2">
                {sheet.mode === "detail" && (
                  <InkButton
                    shape="ellipse"
                    seed={88}
                    className="hud-focus shrink-0"
                    style={{ width: 48, height: 48, padding: 0 }}
                    onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
                    aria-label="Back to your friends list"
                  >
                    <Icon name="back" size={22} color="var(--ink)" />
                  </InkButton>
                )}
                <h2 className="ink-title flex-1 min-w-0 flex items-center gap-2" style={{ fontSize: "var(--fs-xl)" }}>
                  {sheet.mode === "roster" ? (
                    <>
                      <span className="shrink-0"><Icon name="heart" size={22} color="#2d2926" fill="#ff6b6b" /></span>
                      <span className="truncate min-w-0">My friends</span>
                      <span className="hud-tally">{view.length}</span>
                    </>
                  ) : (
                    <span className="truncate min-w-0">{detail ? detail.name : "…"}</span>
                  )}
                </h2>
                <InkButton
                  shape="ellipse"
                  seed={140}
                  className="hud-focus shrink-0"
                  style={{ width: 48, height: 48, padding: 0 }}
                  onClick={() => { sfxTap(); setSheet(null); }}
                  aria-label="Close"
                >
                  <Icon name="close" size={20} color="var(--ink)" weight={2.6} />
                </InkButton>
              </div>
              <div className="px-2 -mt-0.5">
                <Scribble color="rgba(45,41,38,0.3)" height={9} seed={23} />
              </div>

              {sheet.mode === "roster" && (
                <div
                  /* the gap has to clear two hand-drawn edges, not one: a rough
                     border bows a few px outside its own box, so tiles set 14px
                     apart visually collide. */
                  className="overflow-y-auto hud-scroll hud-fade-edge pt-2 pb-2 px-1.5 grid gap-5 content-start"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", maxHeight: "min(58vh, 400px)" }}
                >
                  {view.map((c, i) => {
                    const k = kindById(c.kindId);
                    const s = seedOf(c.id);
                    const tilt = ((s % 100) / 100 - 0.5) * 8;
                    return (
                      <button
                        key={c.id}
                        onClick={() => openDetail(c)}
                        className="hud-tilt hud-focus relative w-full min-w-0"
                        style={{ "--tilt": `${tilt.toFixed(2)}deg` } as React.CSSProperties}
                        aria-label={`Open ${c.name} the ${k.label}`}
                      >
                        {/* Plain block flow, not a grid: InkCard wraps its children
                            in a div of its own, so a centring grid here sized that
                            wrapper to its widest child — `w-full` on the labels then
                            resolved against their own text, never truncated, and a
                            long kind name ("Mystery Creature") pushed the tile out
                            over its neighbours. */}
                        <InkCard className="p-1.5 pt-3 text-center" seed={s % 900} weight={2.6}>
                          <Tape
                            seed={i + 1}
                            style={{ width: 52, height: 19, top: -9, left: "50%", marginLeft: -26, transform: `rotate(${(tilt * -2.4).toFixed(1)}deg)` }}
                          />
                          <div className="h-16 grid place-items-center">
                            <CreatureThumb creature={c} sprite={spritesRef.current.get(c.id)?.frames[0] ?? null} size={62} tick={artTick} />
                          </div>
                          {/* px-2: the ink edge bows inward, so a label that fills
                              the padding box exactly still crosses the line */}
                          <div className="ink-title truncate px-2 mt-0.5" style={{ fontSize: 11, color: "var(--ink)" }}>{c.name}</div>
                          <div className="ink-hand truncate px-2" style={{ fontSize: 10 }}>{k.label}</div>
                        </InkCard>
                        {polishRef.current.has(c.id) && !c.artUrl && (
                          <span className="absolute -top-1.5 -right-1 z-30">
                            <Icon name="sparkle" size={20} color="#2d2926" fill="#ffc72c" weight={1.8} />
                            <span className="visually-hidden">getting magic dust</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {sheet.mode === "detail" && detail && (
                <div className="overflow-y-auto hud-scroll hud-fade-edge px-1 pt-3 pb-2" style={{ maxHeight: "min(62vh, 430px)" }}>
                 <div className="hud-detail">
                  {/* their artwork, taped into the book */}
                  <div className="hud-detail-art">
                   <div className="grid place-items-center">
                    <div style={{ transform: "rotate(-1.6deg)" }}>
                      <InkCard className="p-3" seed={(seedOf(detail.id) + 17) % 900} weight={3}>
                        <Tape seed={2} style={{ width: 82, height: 26, top: -13, left: -16, transform: "rotate(-26deg)" }} />
                        <Tape seed={4} style={{ width: 82, height: 26, bottom: -13, right: -16, transform: "rotate(-24deg)" }} />
                        <PaperFibre inset={5} radius={22} />
                        <div className="relative grid place-items-center">
                          <CreatureThumb creature={detail} sprite={spritesRef.current.get(detail.id)?.frames[0] ?? null} size={132} tick={artTick} />
                        </div>
                      </InkCard>
                    </div>
                   </div>
                    <p className="ink-hand text-center mt-4" style={{ fontSize: "var(--fs-sm)" }}>
                      {kindById(detail.kindId).label} · joined {new Date(detail.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="hud-detail-form">
                  <label className="block mt-3 ink-title" style={{ fontSize: "var(--fs-sm)" }} htmlFor="creature-name">
                    Name
                  </label>
                  <div className="flex gap-2 mt-1.5">
                    <InkCard className="flex-1 min-w-0" seed={412} weight={2.8} lifted={false}>
                      <input
                        id="creature-name"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value.slice(0, MAX_NAME))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(detail, nameDraft); } }}
                        maxLength={MAX_NAME}
                        autoComplete="off"
                        className="hud-focus w-full h-12 bg-transparent px-3 font-display font-extrabold outline-none"
                        style={{ fontSize: "var(--fs-lg)", color: "var(--ink)" }}
                        aria-label="Creature name"
                      />
                    </InkCard>
                    <InkButton
                      tone={TONE.play.wax}
                      seed={655}
                      className="hud-focus shrink-0"
                      style={{ height: 52 }}
                      onClick={() => commitRename(detail, nameDraft)}
                      disabled={!nameDraft.trim() || nameDraft.trim() === detail.name}
                    >
                      <Icon name="check" size={20} color="#fff6e6" weight={2.6} />
                      <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Save</span>
                    </InkButton>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <InkButton
                      seed={721}
                      className="hud-focus"
                      style={{ height: 52 }}
                      onClick={() => {
                        const rt = rtRef.current.get(detail.id);
                        if (rt) { rt.excite = 1; rt.labelT = performance.now() + 260; }
                        sfxPop();
                        setSheet(null);
                      }}
                    >
                      <Icon name="sparkle" size={20} color="#2d2926" fill="#ffc72c" weight={2} />
                      <span className="ink-title whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Say hi</span>
                    </InkButton>
                    <InkButton
                      tone={TONE.play.wax}
                      seed={809}
                      className="hud-focus"
                      style={{ height: 52 }}
                      onClick={() => { sfxHappy(); onPlayGame(); }}
                    >
                      <Icon name="gamepad" size={20} color="#fff6e6" weight={2.2} />
                      <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Play</span>
                    </InkButton>
                  </div>

                  {!confirmDel ? (
                    <button
                      onClick={() => { sfxTap(); setConfirmDel(true); }}
                      className="hud-focus mt-4 mb-1 w-full h-12 flex items-center justify-center gap-2"
                      style={{ color: "var(--coral)" }}
                    >
                      <Icon name="globe" size={19} color="var(--coral)" weight={2.1} />
                      <span className="font-display font-bold underline underline-offset-4" style={{ fontSize: "var(--fs-sm)" }}>
                        Let {detail.name} go…
                      </span>
                    </button>
                  ) : (
                    <ReleaseConfirm
                      name={detail.name}
                      onKeep={() => { sfxTap(); setConfirmDel(false); }}
                      onRelease={() => releaseCreature(detail)}
                    />
                  )}
                  </div>
                 </div>
                </div>
              )}
            </div>
          </InkCard>
        </div>
      )}

      {/* how-to-touch tip, then it gets out of the way */}
      {tip && view.length > 0 && !sheet && (
        <div
          className="hud-hint absolute z-10 pointer-events-none flex justify-center inset-x-0 px-4"
          style={{ bottom: "max(76px, calc(env(safe-area-inset-bottom) + 76px))" }}
        >
          {/* a paper slip: the worlds behind this are busy, and the reef bed in
              particular swallowed the bare text entirely */}
          <span className="hud-slip hud-slip-note">tap a friend to say hi · hold to open its card</span>
        </div>
      )}
    </div>
  );
}

/* ── letting a creature go: never silent, never one tap ──────────────────── */
function ReleaseConfirm({
  name, onKeep, onRelease,
}: { name: string; onKeep: () => void; onRelease: () => void }) {
  const [ref, box] = useBox<HTMLDivElement>();
  // a destructive choice must never open below the fold
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [ref]);
  return (
    <div ref={ref} className="relative isolate mt-4 mb-1 p-3 text-center">
      <InkShape
        w={box.w}
        h={box.h}
        seed={950}
        weight={3}
        lifted={false}
        ink="var(--coral)"
        fill={{ kind: "none" }}
      />
      <div className="relative">
        <p className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Really let {name} go?</p>
        <p className="ink-hand mb-2.5" style={{ fontSize: "var(--fs-2xs)" }}>This drawing can't come back.</p>
        <div className="grid grid-cols-2 gap-2">
          <InkButton seed={31} className="hud-focus" style={{ height: 50 }} onClick={onKeep}>
            <Icon name="heart" size={20} color="#2d2926" fill="#3aae3a" weight={2} />
            <span className="ink-title whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Keep!</span>
          </InkButton>
          <InkButton tone={TONE.go.wax} seed={97} className="hud-focus" style={{ height: 50 }} onClick={onRelease}>
            <Icon name="globe" size={20} color="#fff6e6" weight={2.2} />
            <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Let go</span>
          </InkButton>
        </div>
      </div>
    </div>
  );
}
