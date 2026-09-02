// ─── World scene: the living canvas where a kid's creatures actually live ───
// Owns the render loop, the HUD, the banner queue, the friends roster (look at
// a creature up close, rename it, release it) and the share card.
//
// The overlay is drawn, not chromed: every control is a wax fill inside a
// hand-inked edge, so the interface belongs to the same sketchbook as the
// artwork underneath it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Creature, DreamWorld, RegionKind } from "@/lib/types";
import { kindById, BEHAVIOR_COPY, WORLD_PACKS } from "@/lib/creatures";
import {
  maskOf, regionAt, regionBand, regionForBehavior, findSpawn, groundTopAt,
  REGION_W,
} from "@/lib/regions";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { sfxBubble, sfxPop, sfxSplash, sfxTap, setMuted, isMuted, sfxHappy } from "@/lib/audio";
import { drawOcean, drawSpace, drawFarm, drawDino, drawDream, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { useBackClose, canOfferPicture, canShareFiles, canSaveFile } from "@/lib/native";
import { playCreatureVoice } from "@/lib/creatureVoice";
import { playCreatureSound, prefetchSounds } from "@/lib/creatureSounds";
import { bakeCrayonSprite, silhouette, stampRing, type Sprite } from "@/lib/sprites";
import { loadFoods } from "@/lib/storage";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "@/components/ink/Ink";
import PickTray, { type PickTile } from "@/components/ink/PickTray";
import { Doodle } from "@/components/ink/Doodles";
import { FOODS, foodById } from "@/lib/foods";
import { Icon, type IconName } from "@/components/ink/Icons";
import ParentGate from "@/components/ParentGate";
import { hand, paperTile, roughRect, seedOf, tornEdge } from "@/lib/ink";
import { newLag, lagWeight, updateLag, applyLag, type Lag } from "@/lib/secondary";
import { factFor } from "@/lib/facts";
import { sayLine, hush, canNarrate } from "@/lib/speech";
import {
  BIG, SOCIAL, SCHOOL, SCHOOL2, SCARE2, drawnWidth, sepFor,
  W_SEP, W_COH, W_ALIGN, W_FLEE, W_PAL, STEER_CAP, FLEE_DECAY,
  FRIEND_SECS, FRIEND_RATE, CARE_PER_FRIEND, growthScale,
  FOOD2, FOOD_EAT, FOOD_LIFE, FOOD_MAX,
  CARE_PER_FOOD, CARE_PER_HI, CARE_HI_CAP, CARE_PER_TRICK,
  TRICK_DUR, TRICK_COOLDOWN, TRICK_TWIRL, trickPose, type TrickPose,
  NIBBLE_DUR, nibblePose, CELEBRATE_DUR, celebratePose, sleepPose,
} from "@/lib/social";
import { welcomeBack, daylight, type Visit } from "@/lib/daily";
import { drawCrayonStroke, drawStrokeFull, normalizeStrokes } from "@/lib/crayon";
import { paintDoodle } from "@/lib/doodleArt";
import ReleaseConfirm from "@/components/ink/ReleaseConfirm";

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

/* ── how big a child may make a friend ────────────────────────────────────────
   A creature is born between 0.75 and 1.2, and growing up multiplies whatever
   it is by up to 1.5 (see `growthScale`). Pinching sets that *base* number, so
   the two are independent: making a creature bigger is a choice about how you
   want your world to look, and growing up is still something only care earns.

   The ceiling is not arbitrary. A sprite is baked once into a fixed 150px box
   and drawn by scaling that canvas, so past roughly this much the crayon edge
   starts to look soft rather than drawn. The floor keeps a creature findable —
   and the hit test grows and shrinks with it, so a small one is still tappable. */
const MIN_PINCH = 0.6;
const MAX_PINCH = 1.7;
/** Finger slop, in px: past this a press stops being a tap or a hold and
 *  becomes a carry. One number separates all three gestures — see `onCanvasMove`. */
const DRAG_SLOP = 14;
/** Seconds a creature takes to swim back to where it belongs after being put
 *  down. Long enough to read as swimming, short enough that a child who let go
 *  in the sky is not left waiting for the joke to end. */
const DROP_HOME = 0.4;

/** What a crumb is worth, as a fraction of a creature's own cruising speed.
 *  Not a new number to tune: it is exactly the three pulls it stands in for —
 *  cohesion, alignment, and the lean towards a pal — so a crumb in reach beats
 *  schooling by construction and still loses to something big going past. */
const W_FOOD = W_COH + W_ALIGN + W_PAL;
/** Numbers per crumb in the ring: x, y, born, alive. */
const FOOD_SLOT = 4;
/** How wide a crumb that is a *particular* food is drawn, as a multiple of the
 *  generic crumb's radius. An apple has to read as an apple from across the
 *  room, and the generic crumb is deliberately tiny. */
const FOOD_ART = 5.6;

/** How often care earned in the scene is swept into the creature list. Slow on
 *  purpose: persisting the whole list is a localStorage write, so this is the
 *  one cadence that must never follow the frame. */
const CARE_COMMIT_MS = 60_000;

/** One trick pose, borrowed by whichever creature is mid-trick this frame.
 *  Thirty creatures cost thirty records for the life of the scene, not thirty
 *  per frame, and a trick is one creature at a time on top of that. */
const POSE: TrickPose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

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
  /** When it last took a bite, and when it last had something to celebrate.
   *  Both are moments laid over whatever it was already doing, like a trick. */
  nbT: number; celT: number;
  /** Care earned this session and not yet written down. See `commitCare`. */
  care: number;
  /** Hellos counted towards care this session, so a drum solo is still one hi. */
  hiN: number;
  /** 1 while there is a crumb in reach. A swimmer's idle up-and-down is worth
   *  half the screen a second and the strongest steer it can be given is worth
   *  a fiftieth of that, so a fish that keeps drifting off its own height never
   *  actually arrives at anything. While this is set, that wandering gives way
   *  — it is still swimming, it just stops changing its mind about how deep. */
  onFood: 0 | 1;
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
/** Behaviours that carry their own drifting height in `rt.baseY`, and so are
 *  the only ones a neighbour may talk *up or down*. Everything else either
 *  re-derives `y` from the ground under its feet every frame — where a nudge
 *  would sink it into the floor — or from a formula that would swallow it. */
const FREE_Y = new Set(["swim", "fly"]);
/** Behaviours that author their own `rt.roll` every frame. A lean handed to one
 *  of these rides on top of what it was already doing; for everyone else the
 *  lean *is* the roll, because adding to one nobody resets winds up like a
 *  clock spring and leaves a fish permanently on its side. */
const ROLL_OWN = new Set([
  "orbit", "jet", "scuttle", "stomp", "waddle", "graze", "hover", "streak", "erupt", "sway",
]);

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

/* ── a particular food, baked once ─────────────────────────────────────────
   A doodle is a stack of SVG paths, and `paintDoodle` builds a `Path2D` per
   path every time it is called — fine for a card, not for something drawn
   sixty times a second. So each food is painted once onto its own little
   canvas and stamped from there afterwards: no allocation on the frame path,
   and a name with no doodle behind it is remembered as a miss so it is never
   tried twice. Keyed by name, and there are only ever a handful. */
const FOOD_ART_PX = 128;
/** What a hand-drawn treat's name looks like: the prefix, then the id the
 *  recipe was saved under. Everything else is a doodle name. */
const DRAWN_PREFIX = "drawn:";
/** The tray tile that means "nothing in particular" — the plain crumb again.
 *  Not a treat id: it is the absence of one. */
const CRUMB_TILE = "__crumb";
const foodArtCache = new Map<string, HTMLCanvasElement | null>();

/**
 * A treat the child drew themselves, baked the same way and onto the same
 * little canvas as the doodles are. The strokes are the recipe — the crumb is
 * never saved, only this — so they are re-baked from `loadFoods` rather than
 * from a stored picture, and the normalise-then-draw is exactly the pass
 * `bakeCrayonSprite` makes for a creature.
 *
 * Wax lines get thicker on the way down: this canvas is stamped at roughly
 * a third of its size, and a one-pixel line at that scale is not a treat, it
 * is a smudge. The floor is about the width `paintDoodle` gives the built-in
 * treats at this size, so a drawn treat sits beside an apple rather than
 * behind it; the ceiling is the other half of the same thought — a drawing
 * that is a single dot normalises to a stroke as wide as the whole tile.
 */
function bakeDrawnFood(id: string): HTMLCanvasElement | null {
  const drawn = loadFoods().find((f) => f.id === id);
  if (!drawn || drawn.strokes.length === 0) return null;
  const raw = document.createElement("canvas");
  raw.width = FOOD_ART_PX;
  raw.height = FOOD_ART_PX;
  const rctx = raw.getContext("2d");
  if (!rctx) return null;
  const norm = normalizeStrokes(drawn.strokes, FOOD_ART_PX * 0.74);
  rctx.translate(FOOD_ART_PX / 2, FOOD_ART_PX / 2);
  norm.strokes.forEach((st, i) =>
    drawStrokeFull(rctx, { ...st, size: Math.max(9, Math.min(FOOD_ART_PX * 0.2, st.size * 1.5)) }, i + 1),
  );

  /* …and then the sticker outline the creatures wear, for the same reason they
     wear it: a crayon line laid straight onto deep water goes to mud. Ink ring
     behind white ring behind the wax, exactly `bakeCrayonSprite`'s recipe, at
     this canvas's scale. Baked into the same one canvas, so the frame path is
     still one `drawImage`. */
  const cv = document.createElement("canvas");
  cv.width = FOOD_ART_PX;
  cv.height = FOOD_ART_PX;
  const ctx = cv.getContext("2d");
  if (!ctx) return raw;
  ctx.translate(FOOD_ART_PX / 2, FOOD_ART_PX / 2);
  stampRing(ctx, silhouette(raw, "#2d2926"), 5);
  stampRing(ctx, silhouette(raw, "#ffffff"), 3);
  ctx.drawImage(raw, -FOOD_ART_PX / 2, -FOOD_ART_PX / 2);
  return cv;
}

function foodArt(name: string): HTMLCanvasElement | null {
  const hit = foodArtCache.get(name);
  if (hit !== undefined) return hit;
  let baked: HTMLCanvasElement | null = null;
  if (name.startsWith(DRAWN_PREFIX)) {
    baked = bakeDrawnFood(name.slice(DRAWN_PREFIX.length));
  } else {
    const cv = document.createElement("canvas");
    cv.width = FOOD_ART_PX;
    cv.height = FOOD_ART_PX;
    const c2 = cv.getContext("2d");
    baked = !!c2 && paintDoodle(c2, name, FOOD_ART_PX) ? cv : null;
  }
  foodArtCache.set(name, baked);
  return baked;
}

/**
 * A crumb of food, drawn the way the child drew everything else it is sitting
 * in: a lumpy wax morsel inside an inked edge, not a dot. The lumps come off
 * the crumb's own seed rather than a random hand, so it is the same crumb every
 * frame — the wobble reads as a drawn shape, and a wobble that re-rolled sixty
 * times a second would read as static. Costs one path and no allocation.
 */
const CRUMB_PTS = 7;
/** The corners of the crumb being drawn. One array for the life of the page:
 *  a crumb is drawn every frame and must not allocate to be drawn. */
const CRUMB_XY = new Float64Array(CRUMB_PTS * 2);
function drawCrumb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, seed: number, alpha: number,
  doodle: string,
) {
  /* …unless somebody put down a *particular* thing to eat — an apple, a cake,
     something the child drew themselves. Then the crumb is that drawing, in the
     same ink as everything else in the scene. A name with no doodle behind it
     is not an error, it is just lunch: `foodArt` hands back null and this falls
     through to the crumb. */
  if (doodle) {
    const art = foodArt(doodle);
    if (art) {
      const size = r * FOOD_ART;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(art, x - size / 2, y - size / 2, size, size);
      ctx.restore();
      return;
    }
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  for (let k = 0; k < CRUMB_PTS; k++) {
    const a = (k / CRUMB_PTS) * Math.PI * 2 + seed;
    // a cheap, stable hash per corner: same crumb, same lumps, every frame
    const rr = r * (0.66 + 0.5 * (Math.sin(seed * 12.9898 + k * 4.1) * 0.5 + 0.5));
    CRUMB_XY[k * 2] = Math.cos(a) * rr;
    CRUMB_XY[k * 2 + 1] = Math.sin(a) * rr * 0.86;
  }
  /* Curved through the corners rather than joined between them: a crumb has
     lumps, not facets, and seven straight edges read as a bag of chips. */
  ctx.beginPath();
  ctx.moveTo(
    (CRUMB_XY[(CRUMB_PTS - 1) * 2] + CRUMB_XY[0]) / 2,
    (CRUMB_XY[(CRUMB_PTS - 1) * 2 + 1] + CRUMB_XY[1]) / 2,
  );
  for (let k = 0; k < CRUMB_PTS; k++) {
    const n = ((k + 1) % CRUMB_PTS) * 2;
    ctx.quadraticCurveTo(
      CRUMB_XY[k * 2], CRUMB_XY[k * 2 + 1],
      (CRUMB_XY[k * 2] + CRUMB_XY[n]) / 2, (CRUMB_XY[k * 2 + 1] + CRUMB_XY[n + 1]) / 2,
    );
  }
  ctx.closePath();
  ctx.fillStyle = "#ffc72c";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.26);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2d2926";
  ctx.stroke();
  // …and a crumb of a crumb beside it, because nobody draws just the one
  ctx.beginPath();
  ctx.arc(r * 1.05, -r * 0.8, Math.max(1.2, r * 0.22), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A treat at tile size, drawn by the world's own hands so the thing on the
 * tray and the thing in the water are the same picture. A hand-drawn treat
 * comes out of `foodArt`'s cache — the tray is where a child's drawing is
 * usually baked for the first time, and the world then stamps that very
 * canvas — and the empty name is the plain morsel, drawn by `drawCrumb`
 * itself rather than by a second copy of it that could drift.
 */
function TreatThumb({ name, size = 44 }: { name: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = `${size}px`;
    cv.style.height = `${size}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const src = name ? foodArt(name) : null;
    if (src) ctx.drawImage(src, 0, 0, size, size);
    else drawCrumb(ctx, size / 2, size * 0.54, size * 0.26, 1.7, 1, "");
  }, [name, size]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none" />;
}

/**
 * A small drawn heart, for the one creature the child has made their pet. Two
 * lobes and a point, inked like everything else — it rides inside the name tag
 * rather than floating over the world, so nothing new is drawn every frame and
 * a pet is simply the friend whose tag has a heart on it.
 */
function drawHeartMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.92);
  ctx.bezierCurveTo(-r * 1.25, -r * 0.16, -r * 0.62, -r * 1.14, 0, -r * 0.42);
  ctx.bezierCurveTo(r * 0.62, -r * 1.14, r * 1.25, -r * 0.16, 0, r * 0.92);
  ctx.closePath();
  ctx.fillStyle = "#ff6b6b";
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.34);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2d2926";
  ctx.stroke();
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
      // offsetWidth/Height, not getBoundingClientRect: the world flips in on a
      // 3D `page-flip-in` (translateZ + rotateX under perspective), and a
      // client rect returns the *projected* size — a squashed button. Worse, a
      // transform does not change the layout box, so the ResizeObserver never
      // fires when the flip lands, and the drawn background stays squashed for
      // good. The offset box ignores the transform and reads the real size.
      const w = Math.round(el.offsetWidth / 2) * 2;
      const h = Math.round(el.offsetHeight / 2) * 2;
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
  /** The drawn glyph. Every control has one except the treat button, which
   *  wears `art` instead — there is no icon for "an apple". */
  icon?: IconName;
  /** Art worn in the icon's place: the treat button shows whatever is armed,
   *  so a child can see what the next tap on the water will put down without
   *  opening anything. */
  art?: ReactNode;
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
  icon, art, label, labelWide, labelOnlyWide, tone = TONE.manila, iconFill,
  seed, round = false, className = "", style, ...rest
}: HudBtnProps) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const s = seed ?? seedOf((icon ?? "") + (label ?? ""));
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
        {art ?? (icon && <Icon name={icon} size={round ? 25 : 22} color={tone.on} fill={iconFill} weight={2.3} />)}
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
    const src = sprite;
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
  }, [creature.id, sprite, size, tick]);
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
  departed,
  onDepartedShown,
  worldId,
  dream,
  onBack,
  onDrawMore,
  onLearnDraw,
  onPlayGame,
  onRenameCreature,
  onDeleteCreature,
  onRepaint,
  onCare,
  onResize,
  visit,
  petId,
  onMakePet,
  onReleasePet,
  foodKind,
  onArmTreat,
  onDrawTreat,
}: {
  creatures: Creature[];
  newId: string | null;
  /** A creature the world just made room for, waved off by name once. */
  departed?: string | null;
  /** Called after the goodbye has been shown, so the app can clear it. */
  onDepartedShown?: () => void;
  worldId: string;
  /** The child's painted world, when `worldId === "dream"`. */
  dream?: DreamWorld | null;
  onBack: () => void;
  onDrawMore: () => void;
  /** Open Drawing School focused on this world — the way in for a child who
   *  wants a fish but cannot yet draw one freehand. Optional so this file need
   *  not land in the same commit as the route. */
  onLearnDraw?: () => void;
  onPlayGame: () => void;
  /** Optional: let the app own creature edits. Falls back to local + storage. */
  onRenameCreature?: (id: string, name: string) => void;
  onDeleteCreature?: (id: string) => void;
  /** Dream world only: reopen the easel to repaint the background. */
  onRepaint?: () => void;
  /** Write down care earned in the scene, as `{ creatureId: delta }`. Called on
   *  a slow cadence — see `commitCare` — never per frame. */
  onCare?: (deltas: Record<string, number>) => void;
  /** A grown creature's new base size, after a pinch. Persisted by App. */
  onResize?: (id: string, scale: number) => void;
  /** How long the child has been away, so their creatures can say hello. */
  visit?: Visit;
  /** The one creature the child has crowned as their pet, if they have. */
  petId?: string | null;
  /** Crown this creature. Choosing another one simply crowns that one instead:
   *  there is no un-petting, and nothing is ever taken off anybody. */
  onMakePet?: (id: string) => void;
  /** Forget the pet entirely — only ever when that creature is let go. */
  onReleasePet?: () => void;
  /** Optional: the particular thing the next tap on empty water puts down (a
   *  doodle name — "apple", "cake", something the child drew). Null or empty
   *  and a tap drops the generic crumb, exactly as it always did. */
  foodKind?: string | null;
  /** Tell the app which treat is armed, so a treat drawn on another screen can
   *  come back armed through `foodKind`. Optional: without it the choice still
   *  works, it simply lives and dies with this screen. */
  onArmTreat?: (id: string | null) => void;
  /** Leave the world to draw a treat. Optional — the tile is only offered when
   *  somebody upstream knows how to get there. */
  onDrawTreat?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  const rtRef = useRef<Map<string, RT>>(new Map());
  const fxRef = useRef(newFxState());
  const burstRef = useRef<{ x: number; y: number }[]>([]); // evolution bursts (world coords)
  const popRef = useRef<{ x: number; y: number }[]>([]);   // a creature put down (world coords)
  /* ── crumbs ───────────────────────────────────────────────────────────────
     Six of them at most, in a fixed ring of x, y, born, alive — a new crumb
     overwrites the oldest, which caps a child drumming on the glass without
     ever telling them no. Made once and written in place for the life of the
     scene, like everything else the loop touches. It lives out here rather than
     inside the loop because dropping one happens in a pointer handler, the same
     way `burstRef` does. Never persisted, never on `Creature`: food is a treat,
     not a save file, and a crumb should not still be there tomorrow. */
  const foodRef = useRef(new Float32Array(FOOD_MAX * FOOD_SLOT));
  /* What each of those six crumbs *is*, if it is anything in particular. One
     name per ring slot, written at the same cursor as the numbers on the same
     line, so the two can never drift apart. "" is the generic crumb. */
  const foodDoodleRef = useRef<string[]>(new Array<string>(FOOD_MAX).fill(""));
  const foodAt = useRef(0);                                // the write cursor
  /* ── what the next tap puts down ──────────────────────────────────────────
     Picking a treat *arms* it; it does not drop one. The chosen thing stays
     chosen and every tap after that is another one of it, because tapping
     again and again is how a small child plays — and because a treat is a
     present, there is nothing to use up and nothing to refill.

     The app owns the choice too (`foodKind`), so a treat drawn on the draw
     screen comes back armed. That makes the prop the outside source of truth:
     whenever it *changes* it wins, and in between the tray writes here. Sunk
     into a ref for the loop, which must not do a lookup to draw a crumb. */
  const [armed, setArmed] = useState<string | null>(foodKind ?? null);
  const lastKind = useRef(foodKind);
  if (foodKind !== lastKind.current) {
    lastKind.current = foodKind;
    setArmed(foodKind ?? null);
  }
  const foodKindRef = useRef(armed);
  foodKindRef.current = armed;
  /** Who is the pet, for the render loop: one string compare per name tag, no
   *  lookup and nothing new per frame. */
  const petRef = useRef(petId ?? null);
  petRef.current = petId ?? null;
  /** Somebody was just crowned, at these world coords — drained by the loop
   *  into a little burst of hearts, the way `popRef` is. */
  const petFxRef = useRef<{ x: number; y: number }[]>([]);
  const arrivalRef = useRef<string | null>(null);
  const [muted, setM] = useState(isMuted());
  const [artTick, forceTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sheet, setSheet] = useState<{ mode: "roster" } | { mode: "detail"; id: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);
  /* Sharing hands a picture to the OS share sheet — Messages, Mail, every
     social app on the device — and the card carries the name the child typed
     and their drawing. That is a door out of the app, so a grown-up opens it. */
  const [shareGate, setShareGate] = useState(false);
  /* Android's WebView has no Web Share API, and an `<a download>` there needs
     a native download listener this shell does not set — so the picture has
     nowhere to go and the button is not drawn. It used to be, and it cheerfully
     said "Saved your world as a picture!" over a save that never happened. */
  const canPhoto = canOfferPicture();
  const [tip, setTip] = useState(true);

  /* Android hardware back closes whatever is open — the gate, then the sheet,
     the tray, or the menu — before it is allowed to leave the world. */
  useBackClose(shareGate, () => setShareGate(false));
  useBackClose(!!sheet, () => setSheet(null));
  useBackClose(trayOpen, () => setTrayOpen(false));
  useBackClose(menuOpen, () => setMenuOpen(false));

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

  /* ── pinching a friend bigger or smaller ──────────────────────────────────
     Declared up here because the render loop and the hit test both have to see
     it, and both are written before the pointer handlers that drive it. */
  /** Every finger currently on the world, so the second one can be noticed. */
  const ptrRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** A pinch in flight. `scale` is live, so the creature resizes under the
   *  fingers rather than jumping when they lift. */
  const pinchRef = useRef<{ id: string; startDist: number; startScale: number; scale: number } | null>(null);
  /** The last time we buzzed at a limit, so the edge ticks once, not every frame. */
  const lastEdgeRef = useRef(0);

  /** A creature's base scale — the live pinch value while it is being pinched.
   *  Every place that draws or measures a creature goes through this, so the
   *  body, its shadow, its label and its hit target all resize together. */
  const scaleOf = useCallback(
    (c: Creature) => (pinchRef.current?.id === c.id ? pinchRef.current.scale : c.scale),
    [],
  );
  creaturesRef.current = view;
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
     goes away, and when the scene unmounts. Never per frame — serialising the
     whole list to localStorage sixty times a second would cost more than every
     other thing in this file put together. */
  const onCareRef = useRef(onCare);
  onCareRef.current = onCare;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const commitCare = useCallback(() => {
    let any = false;
    const deltas: Record<string, number> = {};
    for (const [id, rt] of rtRef.current) {
      if (rt.care > 0) { deltas[id] = rt.care; rt.care = 0; any = true; }
    }
    if (any) onCareRef.current?.(deltas);
  }, []);
  useEffect(() => {
    /* The slow cadence itself. A tab hidden and an unmount are the tidy ways a
       visit ends; a phone that simply kills the app is the common one, and
       without this every hello, trick and crumb of that session went with it.
       Once a minute costs one sweep of a map of thirty flat records. */
    const tick = window.setInterval(commitCare, CARE_COMMIT_MS);
    const onHide = () => { if (document.visibilityState === "hidden") commitCare(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(tick);
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

  /* Open a creature's card and it tells you one true thing about itself, out
     loud — the worlds are full of science and the app can finally say it. A
     beat lets the sheet settle; leaving the card takes the voice with it. */
  useEffect(() => {
    if (sheet?.mode !== "detail" || !detail) return;
    const fact = factFor(detail.kindId);
    if (!fact) return;
    const t = window.setTimeout(() => sayLine(fact), 560);
    return () => { window.clearTimeout(t); hush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, sheet?.mode]);

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
  /* The render loop is mount-scoped and cannot reach a callback that a re-render
     might replace, so it announces friendships through this — the same way it
     reaches the burst queue. */
  const bannerRef = useRef(pushBanner);
  bannerRef.current = pushBanner;
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

  /* ── coming back ──────────────────────────────────────────────────────────
     A child who has been away overnight is met by name. Not a modal, not a
     reward chest, not a streak that can be lost — the two or three creatures
     they have spent the most time with turn round and say hello, a beat apart
     so it reads as three friends noticing rather than one animation firing.

     Waits for the sprites, which are staged in a separate effect below — a
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
    /* artTick re-runs this once staging (below) has actually populated the
       stage — the greeting used to race it and silently never fire */
  }, [view, visit, pushBanner, artTick]);

  // bake sprites for any new creatures
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
        nbT: -1e9, celT: -1e9,
        care: 0, hiN: 0, onFood: 0,
      };
      rt.next = rt.t;
      styleSpawn(rt, b);
      rtRef.current.set(c.id, rt);
    };
    for (const c of view) {
      if (!spritesRef.current.has(c.id)) {
        spritesRef.current.set(c.id, bakeCrayonSprite(c));
      }
      ensureRT(c);
    }
    // released creatures must not keep their sprite/runtime state alive
    const alive = new Set(view.map((c) => c.id));
    for (const id of [...rtRef.current.keys()]) if (!alive.has(id)) rtRef.current.delete(id);
    for (const id of [...spritesRef.current.keys()]) if (!alive.has(id)) spritesRef.current.delete(id);
    /* Announce that staging happened: the runtimes live in refs, which no
       effect can observe — without this tick the welcome-back greeting below
       finds an empty stage on mount and then never gets another turn. */
    forceTick((n) => n + 1);
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

  /* Wave off the creature the world just made room for — by name, a beat
     after the newcomer's arrival so the two banners do not collide. It is
     safe in the sticker book; this is a goodbye, not a loss. */
  const departedRef = useRef<string | null>(null);
  const departedShownRef = useRef(onDepartedShown);
  departedShownRef.current = onDepartedShown;
  useEffect(() => {
    if (!departed || departedRef.current === departed) return;
    departedRef.current = departed;
    const t = window.setTimeout(() => {
      bannerRef.current(`${departed} swam off to explore. Bye-bye!`, "heart");
      departedShownRef.current?.();
    }, 1500);
    return () => window.clearTimeout(t);
    // onDepartedShown is read through a ref so a new inline callback each
    // render does not cancel this pending goodbye — depend on the name only.
  }, [departed]);

  // warm the recorded creature sounds for whoever is in this world, so the
  // first tap plays the real clip rather than the synth fallback
  useEffect(() => {
    prefetchSounds(view.map((c) => c.kindId));
  }, [view]);

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
  // (creature list, world id, floor ratio) is read through a ref,
  // so the loop is never torn down and rebuilt mid-animation.
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    let raf = 0;
    let W = 0, H = 0;
    const bubbles: { x: number; y: number; r: number; v: number; wob: number }[] = [];
    const sparkles: { x: number; y: number; vx: number; vy: number; life: number; heart?: 1 }[] = [];
    let lastT = performance.now();

    /* ── the neighbour pass's scratch ────────────────────────────────────────
       Everyone in the scene, flattened once per pass into plain arrays: the map
       lookups, the kind lookups and the set tests are each paid for once per
       creature instead of once per *pair*, and the 435 pairs at thirty
       creatures then read nothing but numbers. Every array here is made once,
       at mount, and written in place for the life of the scene — the pass
       allocates nothing, which is the whole reason the runtime records are flat
       records of numbers in the first place.

       Sized well past the app's own cap of thirty; anyone past the end is
       simply not part of the conversation that frame. */
    const SOC_MAX = 64;
    /** One frame in four. The intent persists in `sx`/`sy` in between, so the
     *  motion is smooth and the pass costs a quarter of what it looks like. */
    const SOC_EVERY = 4;
    const nc: (Creature | null)[] = new Array(SOC_MAX).fill(null);
    const nrt: (RT | null)[] = new Array(SOC_MAX).fill(null);
    const nkind = new Int32Array(SOC_MAX);   // cheap hash of kindId; ties confirmed by string
    const nbig = new Uint8Array(SOC_MAX);
    const nsoc = new Uint8Array(SOC_MAX);
    const nroot = new Uint8Array(SOC_MAX);
    /* How wide each one is drawn, in the same normalized-x the pass measures
       distance in. Not a constant, and that is the whole point: a sprite is
       drawn at `scale × min(W,H)/520` pixels and then measured against the
       width, so the same fish is a tenth of a landscape tablet and a quarter
       of an upright phone. A fixed separation tuned on one is a heap on the
       other — which is exactly what happened. */
    const nwide = new Float64Array(SOC_MAX);
    const sepX = new Float64Array(SOC_MAX), sepY = new Float64Array(SOC_MAX);
    const cohX = new Float64Array(SOC_MAX), cohY = new Float64Array(SOC_MAX);
    const cohN = new Int32Array(SOC_MAX);
    const aliX = new Float64Array(SOC_MAX), aliN = new Int32Array(SOC_MAX);
    const flX = new Float64Array(SOC_MAX), flY = new Float64Array(SOC_MAX);
    const paX = new Float64Array(SOC_MAX), paY = new Float64Array(SOC_MAX);
    const bestJ = new Int32Array(SOC_MAX), bestD = new Float64Array(SOC_MAX);
    let socN = 0;                                  // frames since the last pass
    let socT = performance.now() / 1000;           // when that pass was
    let bubbleT = -1e9;                            // last scatter that made a sound
    /** kindId → a number, so the inner loop compares integers. Collisions only
     *  ever cost one string comparison, which the caller does on a match. */
    const kindHash = (id: string) => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
      return h;
    };
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
      /* `clientWidth/Height`, never `getBoundingClientRect()`.
         
         A screen arrives by turning over the coil, and mid-turn it is really
         rotated in 3D: `page-flip-in` starts at `translateZ(-46px)` under a
         1800px perspective, so the sheet measures about 97.5% of itself.
         `getBoundingClientRect()` reports that *projected* size, and this
         function then froze it into inline pixels. The layout box never
         changed, so the ResizeObserver never fired again and the canvas stayed
         a little too small for good — leaving a strip of page showing down the
         right edge and along the bottom of every world.

         `clientWidth/Height` are layout numbers. No transform can bend them. */
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;   // mid-mount, or hidden: nothing to size to
      W = w; H = h;
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
      const food = foodRef.current;         // whatever crumbs are in the water
      /* Dozing is decided once a frame, not once a creature: the sky is the
         same for everybody, and `daylight` reads the clock. */
      const night = daylight() < 0.12;

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

      /* ── everyone notices everyone else ──────────────────────────────────
         One pass over the whole scene, before anybody has moved. It is separate
         from the behaviour loop on purpose: reading neighbours from inside that
         loop would give the first half of the creatures this frame's positions
         and the second half last frame's, and would mean an edit to all
         eighteen branches. Instead it leaves an *intent* behind — `sx`/`sy`, in
         world units per second — which each creature spends further down, after
         it has moved the way its own kind moves.

         Everything here is a playground, not a food chain. Nothing is chased,
         caught or taken away: something big going past makes the small ones
         scatter and then drift back together, and it wiggles too, because both
         ends of that are a game of tag. */
      /* (one creature alone still needs this pass now that there are crumbs to
         notice — the pair loops below simply have no pairs to walk) */
      if (list.length > 0 && ++socN >= SOC_EVERY) {
        socN = 0;
        // real seconds since the last *pass* — using `dt` here would quarter it
        const el = Math.min(0.5, t - socT);
        socT = t;
        let chomp = false;               // one nibble is heard, not six at once

        /* Flattened once: the map lookup, the kind lookup and the three set
           tests are paid per creature, never per pair. */
        let n = 0;
        for (let i = 0; i < list.length && n < SOC_MAX; i++) {
          const c = list[i];
          const rt = rtRef.current.get(c.id);
          if (!rt) continue;                       // still baking; not here yet
          const cb = kindById(c.kindId).behavior;
          nc[n] = c; nrt[n] = rt;
          nkind[n] = kindHash(c.kindId);
          nbig[n] = BIG.has(c.kindId) ? 1 : 0;
          nsoc[n] = SOCIAL.has(cb) ? 1 : 0;
          nroot[n] = ROOTED.has(cb) ? 1 : 0;
          // the same scale the sprite is drawn at further down, growth included
          nwide[n] = drawnWidth(scaleOf(c) * growthScale(c.care), W, H);
          sepX[n] = 0; sepY[n] = 0;
          cohX[n] = 0; cohY[n] = 0; cohN[n] = 0;
          aliX[n] = 0; aliN[n] = 0;
          flX[n] = 0; flY[n] = 0;
          paX[n] = 0; paY[n] = 0;
          bestJ[n] = -1; bestD[n] = SCHOOL2;       // nothing further than a school counts
          n++;
        }

        /* …and from here it is nothing but numbers in arrays: 435 pairs at the
           app's thirty creatures, a few microseconds against a 16.7ms frame. */
        for (let i = 0; i < n; i++) {
          const a = nrt[i]!, ac = nc[i]!;
          const aFree = a.pal === "";              // still looking for a friend
          for (let j = i + 1; j < n; j++) {
            const o = nrt[j]!, oc = nc[j]!;
            const dx = o.x - a.x, dy = o.y - a.y;
            const d2 = dx * dx + dy * dy;

            /* too close for comfort — whoever they are. Pushing harder than the
               school pulls is what stops the school becoming one flickering
               pile; `W_SEP` > `W_COH` is that rule, and this is where it lands.
               How close is too close depends on how big these two actually
               are: a whale and a starfish do not want the same elbow room, and
               neither does the same fish on a phone and on a tablet. */
            const sep = sepFor(nwide[i], nwide[j]);
            if (d2 < sep * sep && d2 > 1e-9) {
              const d = Math.sqrt(d2);
              const w = (sep - d) / (sep * d);     // strongest right up against each other
              sepX[i] -= dx * w; sepY[i] -= dy * w;
              sepX[j] += dx * w; sepY[j] += dy * w;
            }

            /* its own kind, near enough to keep up with: where to be, and which
               way everyone is pointing */
            if (d2 < SCHOOL2 && nkind[i] === nkind[j] && ac.kindId === oc.kindId) {
              cohX[i] += o.x; cohY[i] += o.y; cohN[i]++;
              cohX[j] += a.x; cohY[j] += a.y; cohN[j]++;
              aliX[i] += o.dir; aliN[i]++;
              aliX[j] += a.dir; aliN[j]++;
            }

            /* something big came past. Exactly one of the two is big, so this
               never fires between two whales — and the small one is never
               followed, only startled: it points away, and that is the end of it. */
            if (nbig[i] !== nbig[j] && d2 < SCARE2 && d2 > 1e-9) {
              const sm = nbig[i] ? j : i;
              const rs = nrt[sm]!, rb = nrt[nbig[i] ? i : j]!;
              const f = 1 - d2 / SCARE2;           // 1 right beside it, 0 at the rim
              const d = Math.sqrt(d2);
              const wx = (sm === i ? -dx : dx) / d, wy = (sm === i ? -dy : dy) / d;
              flX[sm] += wx * f; flY[sm] += wy * f;
              if (f > rs.flee) {
                // one bubble per scatter at most, and not many of those
                if (rs.flee < 0.25 && f > 0.5 && world === "ocean" && t - bubbleT > 4) {
                  bubbleT = t;
                  sfxBubble();
                }
                rs.flee = f;
              }
              // and the big one wiggles too: this is tag, and it is playing
              const play = f * 0.5;
              if (play > rb.flee) rb.flee = play;
            }

            /* pals, at any distance at all: a small, permanent lean towards
               each other. A pal whose creature is gone is simply never matched
               here, which is exactly what "resolves to nothing" should cost. */
            const aPal = a.pal !== "" && a.pal === oc.id;
            const oPal = o.pal !== "" && o.pal === ac.id;
            if (aPal) { paX[i] += dx; paY[i] += dy; }
            if (oPal) { paX[j] -= dx; paY[j] -= dy; }
            if (aPal && oPal && Math.random() < 0.02) {
              sparkles.push({
                x: a.x * W, y: a.y * H - 10,
                vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 12,
                life: 0.9, heart: 1,
              });
              sparkles.push({
                x: o.x * W, y: o.y * H - 10,
                vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 12,
                life: 0.9, heart: 1,
              });
            }

            /* and who each of them is closest to, of the things that live where
               they live — the one candidate a friendship can grow from. Anyone
               who already has a friend is out of the running: a friendship here
               is never swapped, dropped or taken off anybody. */
            if (aFree && o.pal === "" && a.home === o.home) {
              if (d2 < bestD[i]) { bestD[i] = d2; bestJ[i] = j; }
              if (d2 < bestD[j]) { bestD[j] = d2; bestJ[j] = i; }
            }
          }
        }

        for (let i = 0; i < n; i++) {
          const r = nrt[i]!;

          /* ── keeping running into the same one ──────────────────────────
             Time near, not distance travelled, and never a punishment: drifting
             off to somebody else halves what was banked rather than emptying
             it, so two creatures that keep meeting across several visits still
             get there in the end. */
          const bi = r.pal === "" ? bestJ[i] : -1;
          if (bi >= 0) {
            const oc = nc[bi]!, o = nrt[bi]!;
            if (r.near !== oc.id) {
              r.near = oc.id;
              r.nearT *= 0.5;
            } else {
              r.nearT += el * FRIEND_RATE;
            }
            // (the candidate may have been spoken for a moment ago, further up
            //  this same loop — then it simply is not today)
            if (r.nearT > FRIEND_SECS && o.pal === "") {
              /* Both ends at once — one friendship, one banner, and the other
                 one can never come back round here and announce it again. */
              const me = nc[i]!;
              r.pal = oc.id; o.pal = me.id;
              o.near = me.id; o.nearT = r.nearT;
              r.care += CARE_PER_FRIEND; o.care += CARE_PER_FRIEND;
              r.excite = Math.max(r.excite, 0.5); o.excite = Math.max(o.excite, 0.5);
              r.labelT = now; o.labelT = now;        // both of them, named, together
              for (let k = 0; k < 12; k++) {
                const h = k % 2 === 0 ? r : o;
                sparkles.push({
                  x: h.x * W + (Math.random() - 0.5) * 30,
                  y: h.y * H + (Math.random() - 0.5) * 20,
                  vx: (Math.random() - 0.5) * 60,
                  vy: -30 - Math.random() * 50,
                  life: 0.9 + Math.random() * 0.4, heart: 1,
                });
              }
              sfxHappy();
              bannerRef.current(`${me.name} and ${oc.name} are friends now!`, "heart");
            }
          }

          if (r.held) {
            // in a hand. Nothing talks it into anything while it is up there.
            r.sx = 0; r.sy = 0;
            continue;
          }

          if (!nsoc[i]) {
            /* Rooted, orbiting, station-keeping or mid-dash: never steered. A
               tree with a friend leans towards it instead of strolling over,
               so on one of those `sx` is not a speed at all but the lean
               itself, in radians — spent as one, down in the behaviour loop. */
            r.sy = 0;
            r.sx = nroot[i] && paX[i] !== 0
              ? Math.max(-1, Math.min(1, paX[i] / SCHOOL)) * (W_PAL / 2)
              : 0;
            continue;
          }

          /* ── and whether anybody drew it any lunch ────────────────────────
             Six crumbs against thirty creatures is a hundred and eighty plain
             number comparisons — against the 435 pairs above, nothing. The
             nearest one wins, and only if it is inside `FOOD`: a creature is
             not summoned across the whole world by a crumb, it notices one
             nearby. Nothing is ever hungry and nothing ever misses out; food
             here is a treat somebody brought, not a thing to survive. */
          let fx = 0, fy = 0;
          let fd = FOOD2;
          for (let k = 0; k < FOOD_MAX; k++) {
            const o = k * FOOD_SLOT;
            if (food[o + 3] !== 1) continue;
            const dx = food[o] - r.x, dy = food[o + 1] - r.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= fd) continue;
            fd = d2; fx = dx; fy = dy;
            if (d2 < FOOD_EAT * FOOD_EAT) {
              food[o + 3] = 0;                       // eaten, and delighted about it
              fx = 0; fy = 0; fd = FOOD2;
              r.excite = 1;
              r.care += CARE_PER_FOOD;
              r.nbT = t;   // chew it, so the treat lands instead of vanishing
              for (let s = 0; s < 7; s++) {
                sparkles.push({
                  x: r.x * W + (Math.random() - 0.5) * 26,
                  y: r.y * H + (Math.random() - 0.5) * 20,
                  vx: (Math.random() - 0.5) * 60,
                  vy: -26 - Math.random() * 40,
                  life: 0.5 + Math.random() * 0.4,
                });
              }
              if (!chomp) {
                chomp = true;
                if (world === "ocean") sfxBubble(); else sfxHappy();
              }
            }
          }

          /* Heading for one, then, and it says so — a swimmer's own idle
             wandering gives way to it up in the behaviour chain. */
          const fed = fx !== 0 || fy !== 0;
          r.onFood = fed ? 1 : 0;

          /* Each pull arrives as a direction; the weights say how much of the
             creature's own cruising speed each one is worth. */
          let ax = 0, ay = 0;
          if (sepX[i] !== 0 || sepY[i] !== 0) {
            const m = Math.hypot(sepX[i], sepY[i]);
            ax += (sepX[i] / m) * W_SEP; ay += (sepY[i] / m) * W_SEP;
          }
          if (fed) {
            /* A crumb in reach is where the school is going now: it stands in
               for cohesion, alignment and the pull of a pal rather than being
               weighed against them, which is what makes it the strongest thing
               a creature wants short of getting out of a big one's way.
               Spacing still applies, so they gather round a crumb rather than
               piling into one another on top of it. */
            const m = Math.hypot(fx, fy);
            ax += (fx / m) * W_FOOD; ay += (fy / m) * W_FOOD;
          } else if (cohN[i] > 0) {
            const cx = cohX[i] / cohN[i] - r.x, cy = cohY[i] / cohN[i] - r.y;
            const m = Math.hypot(cx, cy);
            if (m > 1e-6) { ax += (cx / m) * W_COH; ay += (cy / m) * W_COH; }
          }
          // …and the other two the crumb stood in for
          // alignment needs no normalising: a school that disagrees with itself
          // averages towards nothing, which is the honest answer
          if (!fed && aliN[i] > 0) ax += (aliX[i] / aliN[i]) * W_ALIGN;
          if (flX[i] !== 0 || flY[i] !== 0) {
            // …and nothing outranks getting out of the way, crumb or no crumb
            const m = Math.hypot(flX[i], flY[i]);
            ax += (flX[i] / m) * W_FLEE * r.flee; ay += (flY[i] / m) * W_FLEE * r.flee;
          }
          if (!fed && (paX[i] !== 0 || paY[i] !== 0)) {
            const m = Math.hypot(paX[i], paY[i]);
            ax += (paX[i] / m) * W_PAL; ay += (paY[i] / m) * W_PAL;
          }
          /* …and no combination of them, ever, is worth more than `STEER_CAP`
             of that speed. The behaviour loop's own `speedBoost` is not in
             here: a scatter on top of an excited tap is still a fish. */
          ax *= r.speed; ay *= r.speed;
          const cap = STEER_CAP * r.speed;
          const m2 = ax * ax + ay * ay;
          if (m2 > cap * cap) {
            const k = cap / Math.sqrt(m2);
            ax *= k; ay *= k;
          }
          r.sx = ax; r.sy = ay;
        }
      }

      /* ── the crumbs somebody drew ────────────────────────────────────────
         Drawn before the creatures, so a fish that has arrived at one is over
         it rather than behind it. A crumb nobody comes for fades out at
         `FOOD_LIFE` instead of sitting there forever, and a crumb fades *in*
         over its first moment so it reads as being drawn rather than as
         appearing. */
      const crumbF = Math.min(W, H) / 520;
      for (let k = 0; k < FOOD_MAX; k++) {
        const o = k * FOOD_SLOT;
        if (food[o + 3] !== 1) continue;
        const age = t - food[o + 2];
        if (age > FOOD_LIFE) { food[o + 3] = 0; continue; }
        const a = Math.min(1, age * 5) * Math.min(1, (FOOD_LIFE - age) * 0.7);
        const seed = food[o + 2] * 3.7 + k;
        drawCrumb(
          ctx,
          food[o] * W,
          food[o + 1] * H + Math.sin(t * 1.6 + seed) * 2.2,   // it drifts, a little
          5.5 * crumbF + 3,
          seed,
          a,
          foodDoodleRef.current[k],
        );
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

        /* ── in a hand, or on its way back from one ── */
        const carried = rt.held === 1;
        const homing = !carried && t - rt.dropT < DROP_HOME;

        // behavior motion
        if (carried) {
          /* Everything a creature usually does is off while a finger has it —
             a fish that carried on swimming out of a hand would not be a fish
             that is being held. Only its own motion is skipped, though:
             everything below still runs, so the neighbours still see it, its
             trail still whips out behind it as it is swung about, and it still
             wriggles and blinks. */
          rt.x = rt.hx; rt.y = rt.hy; rt.baseY = rt.hy;
          rt.excite = Math.max(rt.excite, 0.6);              // wriggling, the whole time
          rt.sq += (-0.12 - rt.sq) * Math.min(1, dt * 6);    // and dangling, stretched
        } else if (b === "swim" || b === "fly") {
          rt.x += rt.dir * rt.speed * speedBoost * dt;
          // …and the wandering stops while there is a crumb to get to (see `onFood`)
          if (!rt.onFood) rt.baseY += Math.sin(t * 0.3 + rt.seed) * 0.008 * dt * 60;
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
            if (!reducedRef.current) shake = Math.max(shake, 2.4 + 1.6 * Math.min(1.3, scaleOf(c)));
            const fy = rt.y * H + sp.h * scaleOf(c) * sizeF * 0.4;
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
            const top = rt.y * H - sp.h * scaleOf(c) * sizeF * 0.5;
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

        /* ── and if it has just been put down ─────────────────────────────
           It does not *appear* where it belongs; it goes there. Its own way of
           moving has already run, above, from wherever the finger left it — a
           fish in the sky has already pulled its drifting height back into its
           band, a cow in mid-air has already found the ground under it — and
           all this does is ease the drop position onto that answer over
           `DROP_HOME`. Which is why it needs to know nothing about which of the
           eighteen ways of moving this one does: at `e` = 0 it is exactly where
           it was let go, at 1 it is exactly where its own kind would have it,
           and there is no seam at either end. */
        if (homing) {
          const u = (t - rt.dropT) / DROP_HOME;
          const e = u * u * (3 - 2 * u);
          /* Anything with feet belongs on the ground, whether or not its own
             way of moving bothers to say so — a flower's does not, it simply
             stands where it was planted, and a flower left hovering in the sky
             is the one thing worse than a flower that teleported. */
          if (GROUNDED.has(b)) rt.y = gy(rt.x) + rt.foot;
          rt.x = rt.hx + (rt.x - rt.hx) * e;
          rt.y = rt.hy + (rt.y - rt.hy) * e;
          rt.baseY = rt.hy + (rt.baseY - rt.hy) * e;
          rt.sq *= 1 - e;                    // the landing squash, gone by the time it is home
        }

        /* ── and what the neighbours talked it into ───────────────────────
           Spent here, after the creature has moved its own way and before the
           standing cap, the painted region and the trailing update — all three
           of which want the position it actually ended up at. `sx`/`sy` are an
           intent per second, so they cost one multiply whether the neighbour
           pass ran this frame or three frames ago. */
        let lean = 0;                      // …how far over it goes about it, in radians
        if (SOCIAL.has(b)) {
          rt.x += rt.sx * dt;
          // …but only the free swimmers and flyers carry their own height.
          // Everything else re-derives `y` from the ground under it every
          // frame, and a nudge there would sink it through the floor.
          if (FREE_Y.has(b)) rt.baseY += rt.sy * dt;
          /* Turning to look where it is being pulled — but not for every
             little tug: a steer no stronger than the pull of its own school is
             a drift, not a decision. Anything stronger (getting out of
             somebody's way, a big one going past, a friend across the reef)
             turns it round, and for these behaviours `dir` is both the facing
             and the way it swims, so it really does set off. */
          if (FACING.has(b) && Math.abs(rt.sx) > W_COH * rt.speed) {
            rt.dir = rt.sx > 0 ? 1 : -1;
          }
        } else if (ROOTED.has(b)) {
          /* Roots do not walk, and a tree strolling over to its friend is the
             one bug this feature must never ship. On a rooted creature `sx` is
             not a speed at all but the lean itself — see the neighbour pass. */
          lean = rt.sx;
        }
        if (rt.flee > 0) {
          // the shiver of a game of tag, on whoever is playing it — the big one
          // included, which is what keeps it a game (see the pass)
          lean += Math.sin(rt.t * 17 + rt.seed) * 0.07 * rt.flee;
          rt.flee = Math.max(0, rt.flee - FLEE_DECAY * dt);
        }
        if (ROLL_OWN.has(b)) rt.roll += lean;
        else rt.roll = lean;

        if (GROUNDED.has(b) && rt.y > standCap) rt.y = standCap;

        /* …and nobody floats so high that their head leaves the screen. The
           swim band's floor is a fixed 0.16, but a sprite is drawn from its
           *centre*, so a big fish riding the top of its wave hung half out the
           top edge — the mirror of the HUD clamp above, and the same fix: keep
           the whole body on screen rather than the centre. Size-aware, because
           a grown whale needs far more headroom than a minnow. Streaks are
           meant to leave, and a finger may lift a creature anywhere, so both
           are left alone. */
        if (!GROUNDED.has(b) && b !== "streak" && !carried) {
          const scl0 = scaleOf(c) * growthScale(c.care) * sizeF * (1 + rt.excite * 0.25);
          const ceilY = (sp.h * scl0 * 0.5 + 6) / Math.max(1, H);
          if (rt.y < ceilY) rt.y = ceilY;
        }

        /* ── a painted world keeps everyone where they belong ──
           …unless a hand has it, or is still handing it back: a wall that
           pushes against a finger reads as a creature refusing to be picked
           up. Where it is put down is settled on release, not here. */
        if (pen && rt.reg && !carried && !homing) {
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
        const scl = scaleOf(c) * growthScale(c.care) * sizeF * (1 + rt.excite * 0.25);
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
            x: px - rt.dir * 40 * sizeF * scaleOf(c),
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
          /* ── and its trick, if somebody just said hello ──
             The same hook as the idle beat, for the same reason: a trick is a
             moment laid over whatever the creature was already doing, not
             another way of being alive. `trickPose` writes into one module
             record — thirty creatures never cost thirty poses a frame — and
             `calm` is handed straight through, so a viewer who asked for less
             motion still gets the trick, the name tag and the sparkle without
             the sprite being thrown about. */
          /* ── the quieter states ──
             One at a time and in this order: a bite interrupts a celebration,
             a celebration interrupts dozing, and the trick below outranks all
             three. Every one of them is a whole-body transform, so a scribble
             and a stamp wear them identically — which is the whole reason they
             are shaped this way. */
          const nu = (t - rt.nbT) / NIBBLE_DUR;
          const cu = (t - rt.celT) / CELEBRATE_DUR;
          let posed = false;
          if (nu > 0 && nu < 1) { nibblePose(POSE, nu, calm); posed = true; }
          else if (cu > 0 && cu < 1) { celebratePose(POSE, cu, calm); posed = true; }
          else if (night && !rt.held && rt.excite < 0.2) {
            /* Dozing, not switched off: it still drifts along its band, it just
               breathes slowly while it does. Nothing here is sad, and nothing
               is lost by being away — the world is simply darker. */
            sleepPose(POSE, t + rt.seed, calm);
            posed = true;
          }
          if (posed) {
            if (POSE.dx !== 0 || POSE.dy !== 0) ctx.translate(POSE.dx * sizeF, POSE.dy * sizeF);
            if (POSE.rot !== 0) ctx.rotate(POSE.rot);
            if (POSE.sx !== 1 || POSE.sy !== 1) ctx.scale(POSE.sx, POSE.sy);
          }

          const tu = (t - rt.trT) / TRICK_DUR[rt.trK];
          if (tu > 0 && tu < 1) {
            trickPose(POSE, rt.trK, tu, calm);
            if (POSE.dx !== 0 || POSE.dy !== 0) ctx.translate(POSE.dx * sizeF, POSE.dy * sizeF);
            if (POSE.rot !== 0) ctx.rotate(POSE.rot);
            if (POSE.sx !== 1 || POSE.sy !== 1) ctx.scale(POSE.sx, POSE.sy);
            // the fourth one throws off sparks as it goes round
            if (rt.trK === TRICK_TWIRL && Math.random() < 0.5) {
              sparkles.push({
                x: px + (Math.random() - 0.5) * sp.w * scl,
                y: py + (Math.random() - 0.5) * sp.h * scl,
                vx: (Math.random() - 0.5) * 50,
                vy: -20 - Math.random() * 40,
                life: 0.5 + Math.random() * 0.35,
              });
            }
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

        // crayon wiggle frames
        const frameI = Math.floor(rt.t * (rt.excite > 0 ? 14 : 7)) % 4;
        const img = sp.frames[frameI];
        drawBlink(ctx, img, -sp.w / 2, -sp.h / 2, sp.w, sp.h, blink);
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
          /* The pet's tag carries a heart. One string compare, and the tag was
             already being drawn — a pet is recognisable at a glance without
             anything following it around the world. */
          const pet = petRef.current === c.id;
          const tw = Math.round(ctx.measureText(label).width + 32) + (pet ? 26 : 0);
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
          ctx.fillText(label, tw / 2 + (pet ? 12 : 0), th * 0.68);
          if (pet) drawHeartMark(ctx, 21, th * 0.5, 8.5);
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
      // …and hearts wherever somebody has just been made the pet
      while (petFxRef.current.length) {
        const q = petFxRef.current.pop()!;
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 34 + Math.random() * 80;
          sparkles.push({
            x: q.x * W + (Math.random() - 0.5) * 26,
            y: q.y * H + (Math.random() - 0.5) * 20,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 44,
            life: 0.9 + Math.random() * 0.4, heart: 1,
          });
        }
      }
      // …and a smaller one wherever a creature has just been put back down
      while (popRef.current.length) {
        const p = popRef.current.pop()!;
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 30 + Math.random() * 70;
          sparkles.push({
            x: p.x * W + (Math.random() - 0.5) * 16,
            y: p.y * H + (Math.random() - 0.5) * 12,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 30,
            life: 0.5 + Math.random() * 0.35,
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
        // friendship sparkles are drawn in the heart's own ink; everything
        // else is the app's gold
        ctx.fillStyle = s.heart ? "#ff6b6b" : "#ffd65a";
        drawSpark(ctx, s.x, s.y, 4 * s.life + 1, t * 4);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [scaleOf]);

  /* ── three things a finger can do ─────────────────────────────────────────
     One press, three verbs, and no state machine to get out of step: the two
     thresholds already here separate them completely.

       up before 520ms and inside 14px … a hello, and its trick
       still down at 520ms, inside 14px … its card
       past 14px, whenever …………………………… it is being carried

     A press that misses everything is a fourth: a crumb dropped in the water.
     None of them can fire together — the timer that opens the card is cleared
     the moment a carry begins, and a carry can only begin while that timer is
     still pending. */
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  /** Whichever creature is in a finger right now, if any. */
  const dragRef = useRef<string | null>(null);

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
      const scl = scaleOf(c) * growthScale(c.care) * sizeF * (1 + rt.excite * 0.25);
      const rPx = Math.min(maxR, Math.max(28, (Math.max(sp.w, sp.h) / 2) * scl * 1.05));
      const d = Math.hypot((rt.x - nx) * W, (rt.y - ny) * H) / rPx;
      if (d <= 1 && (!best || d < best.d)) best = { c, d };
    }
    return best?.c ?? null;
  }, [scaleOf]);

  /** Drop a crumb where the finger went. Never refuses: the oldest goes. */
  const dropCrumb = useCallback((nx: number, ny: number) => {
    const food = foodRef.current;
    const slot = foodAt.current;
    const o = slot * FOOD_SLOT;
    foodAt.current = (foodAt.current + 1) % FOOD_MAX;
    // what it is goes down on the same line as where it is, so the two rings
    // can never disagree about which crumb is the apple
    foodDoodleRef.current[slot] = foodKindRef.current || "";
    food[o] = nx;
    food[o + 1] = ny;
    food[o + 2] = performance.now() / 1000;
    food[o + 3] = 1;
    sfxTap();
  }, []);

  const onCanvasDown = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* ── a second finger means "make this one bigger" ──────────────────────
       Whatever the first finger had started — a hello, a hold on its way to
       the card, a carry — is abandoned: two fingers is a different sentence,
       and finishing the old one as well would open a card in the middle of a
       pinch. The creature resized is the one already under a finger, so a
       child who grabs a friend and spreads always gets *that* friend, and only
       failing that the one nearest the middle of the two. */
    if (ptrRef.current.size === 2) {
      const [a, b] = [...ptrRef.current.values()];
      const held = dragRef.current ?? pressRef.current?.id ?? null;
      let target = held ? creaturesRef.current.find((c) => c.id === held) ?? null : null;
      if (!target) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        target = hitAt((mx - r.left) / r.width, (my - r.top) / r.height, r.width, r.height);
      }
      cancelPress();
      if (target) {
        const rt = rtRef.current.get(target.id);
        if (rt) { rt.held = 0; rt.excite = 1; }
        dragRef.current = null;
        pinchRef.current = {
          id: target.id,
          startDist: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
          startScale: target.scale,
          scale: target.scale,
        };
        sfxPop();
      }
      return;
    }

    const hit = hitAt(nx, ny, r.width, r.height);
    // …and a finger that lands on nothing at all is drawing food
    if (!hit) { dropCrumb(nx, ny); return; }
    const rt = rtRef.current.get(hit.id);
    if (rt) {
      // roused from a night-time doze? stretch awake before saying hello
      if (daylight() < 0.12 && rt.excite < 0.2) rt.celT = performance.now() / 1000;
      // hello, straight away — this much happens whatever the finger does next
      rt.excite = 1;
      rt.labelT = performance.now();
      // …and hellos count towards growing up, up to a dozen of them a session
      if (rt.hiN * CARE_PER_HI < CARE_HI_CAP) {
        rt.hiN++;
        rt.care += CARE_PER_HI;
      }
      // the creature says hello: its recorded sound if ready, else the
      // always-instant synthesized voice (which also warms the clip for next time)
      if (!playCreatureSound(hit.kindId)) playCreatureVoice(hit.kindId);
    }
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
    if (ptrRef.current.has(e.pointerId)) {
      ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pinch = pinchRef.current;
    if (pinch && ptrRef.current.size >= 2) {
      const [a, b] = [...ptrRef.current.values()];
      const want = pinch.startScale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.startDist);
      const next = Math.max(MIN_PINCH, Math.min(MAX_PINCH, want));
      /* One buzz on arrival at a limit, not one per frame: a child who keeps
         spreading past the ceiling should feel the wall once. */
      const atEdge = next !== want;
      const now = performance.now();
      if (atEdge && pinch.scale !== next && now - lastEdgeRef.current > 400) {
        lastEdgeRef.current = now;
        if ("vibrate" in navigator) navigator.vibrate(8);
      }
      pinch.scale = next;
      return;
    }

    const carrying = dragRef.current;
    // a mouse wandering across the world with nothing pressed asks nothing of
    // us, and must not pay for a layout read to find that out
    if (!carrying && !pressRef.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    /* Kept just inside the edges of the world: a creature carried off the side
       is a creature the child has to go and find again. */
    const nx = Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width));
    const ny = Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / r.height));

    if (carrying) {
      const rt = rtRef.current.get(carrying);
      if (!rt) { dragRef.current = null; return; }
      // it looks the way it is being swung, the same as it would if it swam there
      if (Math.abs(nx - rt.hx) > 0.004) rt.dir = nx > rt.hx ? 1 : -1;
      rt.hx = nx;
      rt.hy = ny;
      return;
    }

    const p = pressRef.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_SLOP) return;
    /* Past the slop, so this was never a tap and is no longer on its way to
       being a hold: the card's timer goes, and from here the creature hangs off
       the finger. The pointer is captured so it keeps up with a hand that
       leaves the canvas — over the HUD, off the edge — instead of being
       abandoned mid-air by a pointerleave. */
    const id = p.id;
    cancelPress();
    const rt = rtRef.current.get(id);
    if (!rt) return;
    dragRef.current = id;
    cv.setPointerCapture(e.pointerId);
    rt.held = 1;
    rt.hx = nx;
    rt.hy = ny;
    rt.excite = 1;      // it knows: wriggling, and a little bigger for it
    rt.sq = -0.2;       // and stretched, because something has hold of it
    sfxPop();
  };

  /** A finger lifted: either a creature is put down, or a tap is finished. */
  const onCanvasUp = useCallback((e?: React.PointerEvent) => {
    if (e) ptrRef.current.delete(e.pointerId);
    else ptrRef.current.clear();
    const pinch = pinchRef.current;
    if (pinch) {
      /* Keep resizing while two fingers remain; the moment one leaves, the size
         is settled and written to the creature, where it persists. */
      if (ptrRef.current.size >= 2) return;
      pinchRef.current = null;
      cancelPress();
      dragRef.current = null;
      if (Math.abs(pinch.scale - pinch.startScale) > 0.01) {
        const rt = rtRef.current.get(pinch.id);
        if (rt) { rt.sq = pinch.scale > pinch.startScale ? 0.18 : -0.14; rt.excite = 1; }
        onResizeRef.current?.(pinch.id, pinch.scale);
        sfxHappy();
      }
      return;
    }
    const id = dragRef.current;
    if (!id) {
      /* Still pending means the press never became a hold and never became a
         carry — the card's timer has not fired and the slop was never crossed —
         so this was a tap, and a tap is where the trick belongs. Starting it
         back on the press would mean a creature spinning behind its own card,
         or doing a backflip while it dangles off a finger; here, exactly one of
         the three things a finger can do ever happens. */
      const p = pressRef.current;
      const rt = p ? rtRef.current.get(p.id) : null;
      /* One tap is both hello and "do your trick": at four, two gestures for
         two things that feel like one thing is one gesture too many. Tapping
         again inside the cooldown still says hello and still excites it — it
         simply does not restart the trick, so a drum solo reads as enthusiasm
         rather than as a loop stuttering back to its first frame. */
      if (rt) {
        const s = performance.now() / 1000;
        if (s - rt.trT > TRICK_COOLDOWN) {
          rt.trT = s;
          rt.care += CARE_PER_TRICK;
        }
      }
      cancelPress();
      return;
    }
    dragRef.current = null;
    cancelPress();
    const rt = rtRef.current.get(id);
    if (!rt) return;
    rt.held = 0;
    rt.dropT = performance.now() / 1000;
    rt.sq = 0.24;                                 // landing squash, the other way up
    rt.excite = 1;
    popRef.current.push({ x: rt.hx, y: rt.hy });
    sfxSplash();
    /* Put down somewhere it cannot live — a fish on the grass of a world the
       child painted — the hand wins. It stops being bound to that region and
       lives where it was left, rather than jittering against a wall it can
       never walk out of. Repainting the world re-homes it, as it always did. */
    const m = maskRef.current;
    if (!m || !rt.reg) return;
    const ok = rt.reg === "ground"
      ? hasGroundAt(colsRef.current, rt.hx)
      : regionAt(m, rt.hx, rt.hy) === rt.reg;
    if (!ok) rt.reg = null;
  }, [cancelPress]);

  /* ── creature edits ───────────────────────────────────────────────────── */
  // When the app hands us callbacks it owns the data. Otherwise we keep the
  // edit locally and write it back ourselves — see the persistence effect.
  /* App owns renames and goodbyes now, so both go straight into its creature
     list and are persisted by its own save effect. The local branches below are
     kept only so this scene still behaves if it is ever mounted without those
     handlers — they hold the change for the session, they do not save it. */

  const commitRename = useCallback((c: Creature, raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
    if (!name || name === c.name) return;
    if (onRenameCreature) onRenameCreature(c.id, name);
    else {
      setRenames((r) => ({ ...r, [c.id]: name }));
    }
    sfxHappy();
    pushBanner(`Say hello to ${name}!`, "pencil");
  }, [onRenameCreature, pushBanner]);

  /* ── the crown ────────────────────────────────────────────────────────────
     One creature at a time, and never taken away: a child who decides somebody
     else is their pet simply crowns that one, and the first is still exactly as
     welcome as it was. Nothing here can make anybody sad. */
  const crownPet = useCallback((c: Creature) => {
    if (petId === c.id) return;
    onMakePet?.(c.id);
    const rt = rtRef.current.get(c.id);
    if (rt) {
      rt.excite = 1;
      // a little hop of delight — the same celebrate a creature does on waking
      rt.celT = performance.now() / 1000;
      // late enough that the tag is still popping when the card is put down
      rt.labelT = performance.now() + 900;
      petFxRef.current.push({ x: rt.x, y: rt.y });
    }
    sfxHappy();
    pushBanner(`${c.name} is your pet now!`, "heart");
  }, [petId, onMakePet, pushBanner]);

  const releaseCreature = useCallback((c: Creature) => {
    // a pet that has gone off to explore is not a pet any more — the crown must
    // never dangle on somebody who has left
    if (petId === c.id) onReleasePet?.();
    if (onDeleteCreature) onDeleteCreature(c.id);
    else {
      setReleased((s) => new Set(s).add(c.id));
    }
    sfxSplash();
    pushBanner(`${c.name} went off to explore. Bye!`, "globe");
    setConfirmDel(false);
    setSheet(view.length > 1 ? { mode: "roster" } : null);
  }, [onDeleteCreature, pushBanner, view.length, petId, onReleasePet]);

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
      const WORD = "DRAWLINGS";
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
      const file = new File([blob], "drawlings.png", { type: "image/png" });
      if (canShareFiles([file])) {
        try {
          await navigator.share({ files: [file], title: "Drawlings", text: "My drawing came alive!" });
          return;
        } catch (err) {
          // kid cancelled → done; anything else (desktop, permissions) → download
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      if (!canSaveFile()) {
        // the button is not drawn where this is true, so getting here means
        // something changed under us — say so rather than claim a save
        pushBanner("This one needs a grown-up's browser to save the picture.", "camera");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "drawlings.png";
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

  /* ── the treat tray ───────────────────────────────────────────────────────
     Opened from its own button in the HUD, never from the overflow menu: a
     three-year-old will not go looking, so a thing they cannot see is a thing
     that does not exist. What is in it is read when it opens rather than kept
     in state — the child may have drawn a new treat since the last time. */
  const drawnTreats = useMemo(
    // newest first: the one they just drew is the one they want
    () => (trayOpen ? loadFoods().slice().reverse() : []),
    [trayOpen],
  );
  const treatTiles: PickTile[] = useMemo(() => {
    const tiles: PickTile[] = FOODS.map((f) => ({
      id: f.id,
      label: f.label,
      name: f.name,
      art: <Doodle name={f.doodleId} size={44} />,
    }));
    drawnTreats.forEach((f, i) => {
      const id = `${DRAWN_PREFIX}${f.id}`;
      tiles.push({
        id,
        label: `Give them the treat you drew${drawnTreats.length > 1 ? ` (${i + 1})` : ""}`,
        name: "Mine!",
        art: <TreatThumb name={id} />,
      });
    });
    tiles.push({
      id: CRUMB_TILE,
      label: "Just give them a crumb",
      name: "A crumb",
      art: <TreatThumb name="" />,
    });
    return tiles;
  }, [drawnTreats]);

  /** Arm a treat — or nothing, which is the plain crumb again. */
  const armTreat = useCallback((id: string | null) => {
    setArmed(id);
    onArmTreat?.(id);
  }, [onArmTreat]);

  const pickTreat = (tileId: string) => {
    const id = tileId === CRUMB_TILE ? null : (foodById(tileId)?.doodleId ?? tileId);
    armTreat(id);
    setTrayOpen(false);
    sfxHappy();
    pushBanner(
      id ? "Yum! Tap the water to put it down." : "Crumbs it is — tap the water.",
      "heart",
    );
  };

  /* What the treat button is wearing: the armed treat itself, so the choice is
     visible without opening anything. With nothing armed it wears the gift
     doodle — there is no icon in `Icons` for "an apple", and a present is the
     honest shape for a thing that is given and never owed. */
  const armedFood = armed ? foodById(armed) : null;
  const treatFace = !armed
    ? undefined
    : armedFood
      ? <Doodle name={armedFood.doodleId} size={26} />
      : <TreatThumb name={armed} size={26} />;
  const treatLabel = !armed
    ? "Pick a treat to give"
    : `Treat ready: ${armedFood ? armedFood.name : "the one you drew"} — pick another`;
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
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
        onPointerLeave={onCanvasUp}
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
          {canPhoto && (
            <HudBtn
              round
              className="hud-roomy"
              icon="camera"
              seed={12}
              disabled={sharing}
              aria-label="Share a photo of your world"
              onClick={() => setShareGate(true)}
            />
          )}
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
          {/* Feeding used to be a secret: a tap on empty water dropped an
              anonymous crumb, and nothing anywhere said so. Now it has a button
              of its own beside Draw — never in the overflow menu, where a
              three-year-old would never go looking — wearing whatever is
              armed, so the choice is visible without opening anything.

              It stands where `more` used to: at 320px the row was already
              within 14px of its own padding, and a sixth control tipped it
              over. Nothing shrank to make room — those targets are sized for
              small hands. `more` moved instead, down to the far corner, with
              every one of its items intact. */}
          <HudBtn
            round
            art={treatFace ?? <Doodle name="gift" size={27} />}
            tone={TONE.sun}
            seed={613}
            aria-label={treatLabel}
            aria-haspopup="dialog"
            onClick={() => { sfxTap(); setTrayOpen(true); }}
          />
        </div>
      </div>

      {/* ── world options: the grown-up corner ─────────────────────────────
          Sound, sharing, the friends list, repainting a dream world. It sat in
          the top row until feeding needed that slot; here it keeps its own
          menu — which is the only way to reach the sound and share controls on
          a narrow phone, where both stand down — and simply opens upwards. */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          right: "max(12px, env(safe-area-inset-right))",
          bottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <HudBtn
          round
          icon="more"
          seed={509}
          className="relative z-20"
          aria-label="More world options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => { sfxTap(); setMenuOpen((o) => !o); }}
        />

        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 pointer-events-auto cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-full right-0 z-20 mb-2 pointer-events-auto">
              <InkCard
                className="hud-sheet hud-drop p-2 w-60 max-w-[86vw] grid gap-1"
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
                    ...(canPhoto
                      ? [{
                          key: "share",
                          icon: "camera" as IconName,
                          text: sharing ? "Making photo…" : "Share a photo",
                          onClick: () => { setMenuOpen(false); setShareGate(true); },
                          disabled: sharing,
                        }]
                      : []),
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

      {/* ── banner queue: a note taped into the book ──
          Above the sheet scrim (z-30): confirmations fired from inside the
          sheet — a rename, a new pet — must not play out invisibly behind it. */}
      {banner && (
        <div
          className="absolute inset-x-0 z-40 flex justify-center pointer-events-none"
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

                {/* the way out of "I can't draw a fish": trace one first. Lands
                    the child in this same world with a creature of their own. */}
                {onLearnDraw && (
                  <button
                    onClick={() => { sfxTap(); onLearnDraw(); }}
                    className="ink-hand mt-1 px-4 underline decoration-2 underline-offset-4"
                    style={{ fontSize: "var(--fs-sm)", color: "var(--plum)", minHeight: "var(--tap)" }}
                  >
                    …or show me how to draw one
                  </button>
                )}
              </div>
            </InkCard>
          </div>
        </div>
      )}

      {shareGate && (
        <ParentGate
          title="Share this drawing?"
          onPass={() => { setShareGate(false); void doShare(); }}
          onCancel={() => setShareGate(false)}
        />
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
                  autoFocus
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
                    {factFor(detail.kindId) && (
                      <div
                        className="mt-3 mx-auto text-center px-4 py-3 rounded-2xl"
                        style={{ maxWidth: 320, background: "#fffaf0", border: "2.5px solid var(--ink)" }}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <Icon name="sparkle" size={15} color="#2d2926" fill="#ffc72c" weight={2} />
                          <span className="ink-title" style={{ fontSize: "var(--fs-xs)" }}>Did you know?</span>
                          {canNarrate() && (
                            <button
                              onClick={() => { sfxTap(); const f = factFor(detail.kindId); if (f) sayLine(f); }}
                              aria-label="Hear the fact again"
                              className="hud-focus ml-1 grid place-items-center rounded-full"
                              style={{ width: 44, height: 44, margin: -7, border: "2px solid var(--ink)", background: "#fff" }}
                            >
                              <Icon name="soundOn" size={18} />
                            </button>
                          )}
                        </div>
                        <p className="ink-hand mt-1.5" style={{ fontSize: "var(--fs-sm)", lineHeight: 1.4 }}>
                          {factFor(detail.kindId)}
                        </p>
                      </div>
                    )}
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

                  {/* …and, right beside saying hello, the biggest thing a child
                      can say about a creature. Once it is theirs the row goes
                      calm and stops being a button: there is nothing here to
                      undo, only somebody else to crown instead. */}
                  {petId === detail.id ? (
                    <InkCard
                      className="mt-2"
                      contentClassName="flex items-center justify-center gap-2 px-3 py-3.5"
                      seed={877}
                      weight={2.8}
                      lifted={false}
                    >
                      <Icon name="heart" size={20} color="#2d2926" fill="#ff6b6b" weight={2.2} />
                      <span className="ink-title text-center" style={{ fontSize: "var(--fs-md)" }}>
                        {detail.name} is your pet
                      </span>
                    </InkCard>
                  ) : (
                    <InkButton
                      tone={TONE.sun.wax}
                      seed={877}
                      className="hud-focus w-full mt-2"
                      style={{ minHeight: 52 }}
                      labelColor="#2d2926"
                      onClick={() => crownPet(detail)}
                    >
                      <Icon name="heart" size={20} color="#2d2926" fill="#ff6b6b" weight={2.2} />
                      <span className="font-display font-extrabold text-center px-1" style={{ fontSize: "var(--fs-md)" }}>
                        Make {detail.name} my pet
                      </span>
                    </InkButton>
                  )}

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
          <span className="hud-slip hud-slip-note">tap a friend to say hi · hold for its card · tap the water to give a treat</span>
        </div>
      )}

      {trayOpen && (
        <PickTray
          title="Pick a treat!"
          tiles={treatTiles}
          onPick={pickTreat}
          onClose={() => { sfxTap(); setTrayOpen(false); }}
          closeLabel="Close treats"
          footer={
            onDrawTreat ? (
              <InkButton
                onClick={() => { sfxHappy(); setTrayOpen(false); onDrawTreat(); }}
                aria-label="Draw a treat of your own"
                seed={seedOf("draw-a-treat")}
                radius={14}
                tone={TONE.draw.wax}
                className="pick-tile"
              >
                <span className="pick-tileinner">
                  <span className="pick-thumb"><Icon name="pencil" size={26} color="#fff6e6" weight={2.4} /></span>
                  <span className="pick-name ink-hand ink-on-wax" style={{ color: "#fff6e6" }} aria-hidden="true">Draw one</span>
                </span>
              </InkButton>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

