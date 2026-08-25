// ─── World themes: shared frame types, fx state & the premium render toolkit ─
// Every world module gets the same set of primitives so the four worlds feel
// like one art-directed game rather than four separate canvas doodles.

import { daylight, season, warmth, type Season } from "@/lib/daily";

export interface ThemeFrame {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  t: number;          // seconds
  floorY: number;     // px y of the ground line
}

export interface FxState {
  shots: { x: number; y: number; vx: number; vy: number; life: number }[];
  lastShot: number;
  lastFly: number;   // dino: pterodactyl flyby timer
  flyX: number;
  fly2: { last: number; x: number };  // ocean: whale · space: comet · farm: balloon · dino: sauropod
  fly3: { last: number; x: number };  // farm: bird flock · space: satellite
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[]; // dino lava sparks
  /** Free-form per-world scratch space — each world owns its own keys. */
  store: Record<string, unknown>;
}

export const newFxState = (): FxState => ({
  shots: [], lastShot: 0, lastFly: 0, flyX: -0.2,
  fly2: { last: 0, x: -0.3 }, fly3: { last: 5, x: -0.25 }, sparks: [],
  store: {},
});

/** Typed accessor for a world's private slice of `FxState.store`. */
export function slot<T>(fx: FxState, key: string, init: () => T): T {
  let v = fx.store[key] as T | undefined;
  if (v === undefined) { v = init(); fx.store[key] = v; }
  return v;
}

/* ── math & easing ───────────────────────────────────────────────────────── */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
export const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** Frame-rate independent smoothing factor (per-second half-life feel). */
export const damp = (dt: number, rate: number) => 1 - Math.exp(-rate * dt);

/** Deterministic PRNG — stable scenery that never flickers between frames. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap smooth 1-D value noise — organic drift for clouds, kelp, lava. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n * 127.1 + seed * 311.7) * 43758.5453);
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

/** Fractal sum of noise1 — richer silhouettes (mountains, dunes, waves). */
export function fbm1(x: number, octaves = 3, seed = 0): number {
  let v = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < octaves; o++) {
    v += noise1(x * freq, seed + o * 17) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return v;
}

/* ── quality tier: keep 60fps on a cheap tablet ──────────────────────────── */

let qualityTier: 0 | 1 | 2 = 2; // 0 = low, 1 = medium, 2 = high
let frameAcc = 0;
let frameCount = 0;
let frameDt = 1 / 60;   // the last frame's length, for effects that ask for none
let frameSeq = 0;       // ticks once a frame, so an effect can step itself once

/** Feed every frame's dt; the toolkit auto-drops detail if the device chugs. */
/* ── the time of day ──────────────────────────────────────────────────────────
   Every world reads the same clock, so at bedtime the whole app dims together
   instead of one world going dark while the next stays at noon. Sampled once
   per frame rather than per draw call: `Date` is cheap but not free, and the
   answer cannot change inside a frame. */

let dayK = 1;      // 0 = deep night, 1 = full midday
let dayWarm = 0;   // 1 at golden hour, 0 at noon and midnight
let dayAt = -1e9;

/** Refresh the cached clock. Called by `sampleFrame`; worlds never call it. */
function sampleClock(now: number) {
  if (now - dayAt < 20_000) return;   // the sky does not move that fast
  dayAt = now;
  dayK = daylight();
  dayWarm = warmth();
}

/** How lit the world should be, 0..1. Worlds tint by this, never by the hour. */
export const dayLight = () => dayK;
/** Golden-hour cast, 0..1 — warm at dawn and dusk, neutral at noon and night. */
export const dayWarmth = () => dayWarm;

/**
 * The night wash, as a paintable colour. Worlds lay this over their finished
 * scene so the whole app agrees on what evening looks like. Returns null in
 * broad daylight so the common case costs nothing.
 */
export function nightTint(): { fill: string; alpha: number } | null {
  const k = 1 - dayK;
  if (k < 0.02) return null;
  return { fill: "#101a3a", alpha: k * 0.42 };
}

/** Lay the evening over a finished scene. Cheap, and a no-op at midday. */
export function applyNight(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const n = nightTint();
  if (!n) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = n.alpha;
  ctx.fillStyle = n.fill;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // a little cool bloom back in, so night reads as moonlit rather than muddy
  if (n.alpha > 0.2) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (n.alpha - 0.2) * 0.28;
    const g = ctx.createRadialGradient(W * 0.72, H * 0.16, 0, W * 0.72, H * 0.16, Math.max(W, H) * 0.7);
    g.addColorStop(0, "#9fb8ff");
    g.addColorStop(1, "rgba(159,184,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ── the season ───────────────────────────────────────────────────────────────
   The same bargain as the clock, one turn of the dial slower: one shared
   answer, sampled rarely, so the whole app agrees it is winter rather than one
   world snowing while the next is in blossom. `season()` crossfades the last
   tenth of a season into the next, so nothing ever snaps on a date boundary. */

let seasonKind: Season = "summer";
let seasonAfter: Season = "autumn";
let seasonMix = 0;
let seasonAt = -1e9;

/** Refresh the cached season. Called by `sampleFrame`; worlds never call it. */
function sampleSeason(now: number) {
  if (now - seasonAt < 60_000) return;   // the year moves slower than the sky
  seasonAt = now;
  const s = season();
  seasonKind = s.now;
  seasonAfter = s.next;
  seasonMix = s.blend;
}

/** Which season the worlds are dressed for. */
export const seasonNow = (): Season => seasonKind;
/** The season on its way in — only visible while `seasonBlend()` is above 0. */
export const seasonNext = (): Season => seasonAfter;
/** 0 for most of a season, ramping to 1 as it hands over to `seasonNext()`. */
export const seasonBlend = () => seasonMix;

/**
 * Each season's cast over a finished world: r, g, b, how much of it, a little
 * light back on top, and how far the colour is let out of the picture. Summer
 * is nearly neutral on purpose — the worlds are already summery, so the wash's
 * job is to make the other three feel unlike it, not to gild the one they were
 * painted as.
 */
const SEASON_CAST: Record<Season, [number, number, number, number, number, number]> = {
  winter: [168, 206, 255, 0.15, 0.055, 0.24],
  spring: [150, 226, 140, 0.11, 0.018, 0],
  summer: [255, 214, 138, 0.05, 0.016, 0],
  autumn: [255, 152, 66, 0.12, 0.012, 0],
};

/**
 * The seasonal wash, as a paintable colour — the year's answer to `nightTint`.
 * Crossfades from this season into the next, and eases off after dark so a
 * winter night is not tinted twice. Null when there is nothing worth painting.
 */
export function seasonTint(): { fill: string; alpha: number; lift: number; drab: number } | null {
  const a = SEASON_CAST[seasonKind];
  const b = SEASON_CAST[seasonAfter];
  const k = seasonMix;
  const dim = 0.45 + 0.55 * dayK;
  const alpha = lerp(a[3], b[3], k) * dim;
  const drab = lerp(a[5], b[5], k) * dim;
  if (alpha < 0.006 && drab < 0.04) return null;
  return {
    fill: `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`,
    alpha,
    lift: lerp(a[4], b[4], k) * dim,
    drab,
  };
}

/**
 * Lay the year over a finished scene: a tint, never a repaint. Overlay keeps
 * the world's own drawing legible — the crayon stays crayon, it just agrees
 * with the month. Cheap, and close to a no-op in summer.
 */
export function applySeasonWash(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const s = seasonTint();
  if (!s) return;
  // winter first takes some colour back out of the year — a green field under
  // snow light is not the green of July, and this is the only honest way to
  // say so without repainting five worlds. `saturation` is a non-separable
  // blend and the dearest thing here by far, so a device that is already
  // working hard keeps its colour and loses only this.
  if (s.drab > 0.04 && richFx()) {
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = s.drab;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = s.fill;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // a breath of the season's own light back in, so winter reads as bright air
  // rather than a blue film over the lens
  if (s.lift > 0.004) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = s.lift;
    ctx.fillStyle = s.fill;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function sampleFrame(dt: number) {
  const now = performance.now();
  sampleClock(now);
  sampleSeason(now);
  frameDt = dt;
  frameSeq++;
  frameAcc += dt;
  frameCount++;
  if (frameCount >= 90) {
    const avg = frameAcc / frameCount;
    if (avg > 1 / 34) qualityTier = 0;
    else if (avg > 1 / 50) qualityTier = qualityTier === 0 ? 0 : 1;
    else if (qualityTier < 2 && avg < 1 / 57) qualityTier = (qualityTier + 1) as 0 | 1 | 2;
    frameAcc = 0;
    frameCount = 0;
  }
}

export const quality = () => qualityTier;
/** Scale a particle/detail count by the current quality tier. */
export const detail = (n: number) => (qualityTier === 2 ? n : qualityTier === 1 ? Math.ceil(n * 0.62) : Math.ceil(n * 0.34));
/** True when expensive effects (blur, shadowBlur, big gradients) are affordable. */
export const richFx = () => qualityTier === 2;

let motionReduced: boolean | null = null;
/**
 * True when the viewer asked for less motion. Cached on first ask and kept
 * current, the same bargain each world makes locally — shared effects read
 * this one instead of each growing their own copy.
 */
export function reducedMotion(): boolean {
  if (motionReduced === null) {
    const mq = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    motionReduced = !!mq?.matches;
    mq?.addEventListener?.("change", (e) => { motionReduced = e.matches; });
  }
  return motionReduced;
}

/* ── cached layers: paint static scenery once, blit it every frame ───────── */

interface Layer { cv: HTMLCanvasElement; w: number; h: number; key: string }
const layers = new Map<string, Layer>();

/**
 * Draw `paint` into an offscreen canvas keyed by `key` + `variant`, then blit.
 * Static art (starfields, coral beds, mountain ranges) costs one paint instead
 * of thousands of path ops per frame — this is what buys the extra detail.
 *
 * **Never put `quality()` in the `variant`.** The tier is adaptive: it drops
 * when a device is warm and climbs back when it cools, so a bake keyed on it
 * re-paints every time the device changes its mind — which is precisely when
 * the device could least afford it. Scale detail *inside* `paint` with
 * `detail()` instead, and let the bake key describe only the geometry.
 */
export function cachedLayer(
  ctx: CanvasRenderingContext2D,
  key: string,
  w: number,
  h: number,
  variant: string,
  paint: (c: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const sig = `${W}x${H}:${variant}`;
  const hit = layers.get(key);
  if (hit && hit.key === sig) { ctx.drawImage(hit.cv, 0, 0); return hit.cv; }
  const cv = hit?.cv ?? document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, W, H);
  paint(c, W, H);
  layers.set(key, { cv, w: W, h: H, key: sig });
  ctx.drawImage(cv, 0, 0);
  return cv;
}

/** Build (or fetch) a cached sprite without blitting it — for repeated stamps. */
export function cachedSprite(
  key: string,
  w: number,
  h: number,
  variant: string,
  paint: (c: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const sig = `${W}x${H}:${variant}`;
  const hit = layers.get(key);
  if (hit && hit.key === sig) return hit.cv;
  const cv = hit?.cv ?? document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, W, H);
  paint(c, W, H);
  layers.set(key, { cv, w: W, h: H, key: sig });
  return cv;
}

/** Drop every cached layer (call on world switch to free memory). */
export function clearLayers() { layers.clear(); }

/* ── painting helpers ────────────────────────────────────────────────────── */

/** Soft radial glow — the workhorse for suns, lava, bioluminescence, magic. */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  inner: string, outer = "rgba(0,0,0,0)",
  alpha = 1,
) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Additive light bloom — screen-blend glow that never muddies the art. */
export function bloom(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  color: string, alpha = 0.5,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, x, y, r, color, "rgba(0,0,0,0)", alpha);
  ctx.restore();
}

/** Fill a wavy horizon band — reused for water, dunes, hills, lava fields. */
export function wavyBand(
  ctx: CanvasRenderingContext2D,
  W: number, yTop: number, yBottom: number,
  amp: number, freq: number, phase: number,
  fill: string | CanvasGradient,
  step = 18,
) {
  ctx.beginPath();
  ctx.moveTo(0, yTop + Math.sin(phase) * amp);
  for (let x = 0; x <= W; x += step) {
    ctx.lineTo(x, yTop + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35);
  }
  ctx.lineTo(W, yBottom);
  ctx.lineTo(0, yBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Vertical linear gradient from a list of [stop, color] pairs. */
export function vGrad(
  ctx: CanvasRenderingContext2D,
  y0: number, y1: number,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [s, c] of stops) g.addColorStop(s, c);
  return g;
}

/** Soft vignette — the AAA finishing touch on every world. */
export function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, strength = 0.16) {
  const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.42, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  v.addColorStop(0, "rgba(10,10,30,0)");
  v.addColorStop(1, `rgba(10,10,30,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Colour-grade the finished frame: a warm/cool tint wash plus a gentle
 * top-light falloff. Call last (before `vignette`) to unify a world's palette.
 */
export function grade(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  tint: string,
  amount = 0.08,
  lightFromTop = 0.1,
) {
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = amount;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (lightFromTop > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = vGrad(ctx, 0, H * 0.55, [
      [0, `rgba(255,255,255,${lightFromTop})`],
      [1, "rgba(255,255,255,0)"],
    ]);
    ctx.fillRect(0, 0, W, H * 0.55);
    ctx.restore();
  }
}

/* ── the weather ──────────────────────────────────────────────────────────────
   What the season looks like in the air: snow, blossom, leaves, or the drowsy
   motes of a hot afternoon. One preallocated pool of drifters serves every
   world and every season — nothing is allocated per frame, the count comes
   down with `detail()` on a tired device, and a viewer who asked for less
   motion gets the season standing still instead of falling past them.

   Atmosphere, never an event: nothing here is announced, counted, or missed. */

const W_SNOW = 0, W_PETAL = 1, W_LEAF = 2, W_MOTE = 3;

const WEATHER_OF: Record<Season, number> = {
  winter: W_SNOW, spring: W_PETAL, summer: W_MOTE, autumn: W_LEAF,
};

/** Counts at the top tier, before `detail()` takes an old tablet down. */
const W_COUNT = [64, 36, 26, 28];
/** Screen-heights per second. Motes rise; everything else falls. */
const W_FALL = [0.055, 0.075, 0.105, 0.022];
/** Sideways wander, and the slow wind that carries it, in screen-widths. */
const W_SWAY = [0.010, 0.022, 0.030, 0.014];
const W_WIND = [0.010, 0.022, 0.030, 0.006];
/** Size as a fraction of the shorter screen edge, and base opacity. */
const W_SIZE = [0.015, 0.024, 0.026, 0.010];
const W_ALPHA = [0.88, 0.82, 0.88, 0.5];

interface Drifter {
  /** Normalized, so a rotate or a resize never scatters the sky. */
  x: number; y: number;
  sp: number;    // fall speed, ×
  sz: number;    // size, ×
  ph: number;    // sway phase
  wob: number;   // sway rate
  rot: number;   // leaves only
  spin: number;
  tint: number;  // picks between the two colourways
}

/** Big enough for the fullest season; a crossfade splits it, never exceeds it. */
const DRIFT_POOL = 72;
let drifters: Drifter[] | null = null;
let driftRnd: () => number = mulberry32(0x5ea50);

/** Built once, on the first frame that wants weather, and then never again. */
function drifterPool(): Drifter[] {
  if (drifters) return drifters;
  const r = mulberry32(0x5ea50);
  driftRnd = r;
  const pool: Drifter[] = new Array(DRIFT_POOL);
  for (let i = 0; i < DRIFT_POOL; i++) {
    pool[i] = {
      x: r(), y: r(),
      sp: 0.55 + r() * 0.9,
      sz: 0.62 + r() * 0.8,
      ph: r() * Math.PI * 2,
      wob: 0.55 + r() * 0.95,
      rot: r() * Math.PI * 2,
      spin: (r() - 0.5) * 2.2,
      tint: r(),
    };
  }
  drifters = pool;
  return pool;
}

/* the stamps: four kinds, two colourways where it helps, drawn once each */

const snowSprite = () => cachedSprite("fx.snow", 24, 24, "v1", (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(255,255,255,0.98)");
  g.addColorStop(0.4, "rgba(243,249,255,0.7)");
  g.addColorStop(1, "rgba(226,240,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
});

const petalSprite = (v: number) => cachedSprite(`fx.petal${v}`, 26, 20, "v1", (c, w, h) => {
  c.fillStyle = v ? "#ffb9d6" : "#ffd9e9";
  c.beginPath();
  c.moveTo(w * 0.06, h * 0.5);
  c.quadraticCurveTo(w * 0.4, h * 0.02, w * 0.96, h * 0.32);
  c.quadraticCurveTo(w * 0.6, h * 0.98, w * 0.06, h * 0.5);
  c.closePath();
  c.fill();
  c.strokeStyle = v ? "rgba(214,124,166,0.5)" : "rgba(232,166,194,0.45)";
  c.lineWidth = 1.1;
  c.stroke();
});

const leafSprite = (v: number) => cachedSprite(`fx.leaf${v}`, 26, 26, "v1", (c, w, h) => {
  c.fillStyle = v ? "#c8632a" : "#e29a34";
  c.beginPath();
  c.moveTo(w * 0.5, h * 0.06);
  c.quadraticCurveTo(w * 0.98, h * 0.44, w * 0.5, h * 0.96);
  c.quadraticCurveTo(w * 0.02, h * 0.44, w * 0.5, h * 0.06);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(112,58,18,0.5)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(w * 0.5, h * 0.14);
  c.lineTo(w * 0.5, h * 0.9);
  c.stroke();
});

const moteSprite = () => cachedSprite("fx.mote", 20, 20, "v1", (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(255,240,196,0.95)");
  g.addColorStop(0.45, "rgba(255,226,150,0.45)");
  g.addColorStop(1, "rgba(255,214,120,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
});

/** Summer's haze sits still, so it is baked as a gradient and kept. */
let hazeGrad: CanvasGradient | null = null;
let hazeSig = "";

/** Advance and draw one kind over `n` drifters starting at `from`. */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  kind: number, from: number, n: number,
  step: number,
) {
  if (n <= 0) return;
  const pool = drifterPool();
  const U = Math.min(W, H);
  const size = W_SIZE[kind] * U;
  const sway = W_SWAY[kind] * W;
  const wind = W_WIND[kind];
  const fall = W_FALL[kind] * (kind === W_MOTE ? -1 : 1);
  // snow keeps its glint after dark; petals and leaves are lit, so they dim
  const lit = kind === W_SNOW ? 0.72 + 0.28 * dayK : 0.55 + 0.45 * dayK;
  const spriteA = kind === W_SNOW ? snowSprite()
    : kind === W_PETAL ? petalSprite(0)
    : kind === W_LEAF ? leafSprite(0)
    : moteSprite();
  const spriteB = kind === W_PETAL ? petalSprite(1) : kind === W_LEAF ? leafSprite(1) : spriteA;

  ctx.save();
  if (kind === W_MOTE) ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = W_ALPHA[kind] * lit;

  for (let i = from; i < from + n; i++) {
    const d = pool[i];
    if (step > 0) {
      d.y += fall * d.sp * step;
      if (d.y > 1.08) { d.y = -0.08; d.x = driftRnd(); }
      else if (d.y < -0.08) { d.y = 1.08; d.x = driftRnd(); }
      d.x += wind * d.sp * step;
      if (d.x > 1) d.x -= 1;
      if (kind === W_LEAF) d.rot += d.spin * step * 1.5;
    }
    const px = d.x * W + Math.sin(weatherT * d.wob + d.ph) * sway;
    const py = d.y * H;
    const s = size * d.sz;
    if (kind === W_LEAF) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.rot);
      ctx.drawImage(d.tint < 0.5 ? spriteA : spriteB, -s * 0.5, -s * 0.5, s, s);
      ctx.restore();
    } else if (kind === W_PETAL) {
      // a petal turning over, faked by squeezing its width — free, and it
      // reads as flutter without a transform per petal
      const flut = 0.3 + 0.7 * Math.abs(Math.sin(weatherT * d.wob * 1.6 + d.ph));
      const w2 = s * flut;
      ctx.drawImage(d.tint < 0.5 ? spriteA : spriteB, px - w2 * 0.5, py - s * 0.38, w2, s * 0.76);
    } else {
      ctx.drawImage(spriteA, px - s * 0.5, py - s * 0.5, s, s);
    }
  }
  ctx.restore();
}

/** The warm sag of air over a summer afternoon — no particles, just weight. */
function summerHaze(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const top = H * 0.36;
  const sig = `${Math.round(W)}x${Math.round(H)}`;
  if (sig !== hazeSig || !hazeGrad) {
    hazeSig = sig;
    hazeGrad = vGrad(ctx, top, H, [
      [0, "rgba(255,236,180,0)"],
      [0.55, "rgba(255,232,168,0.55)"],
      [1, "rgba(255,224,146,0.2)"],
    ]);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.08 * k * dayK;
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, top, W, H - top);
  ctx.restore();
}

let weatherT = 0;      // weather's own clock, so reduced motion can stop it
let weatherFrame = -1; // drifters advance once a frame, however often we draw

/**
 * Lay the season's weather over a finished scene: snow in winter, blossom in
 * spring, leaves in autumn, and the drift of a hot afternoon in summer, one
 * thinning out as the next arrives. `dt` defaults to the frame the toolkit
 * last saw, so a world can add its season in a single line.
 *
 * Draws nothing a world has to know about — a world that ends underwater or in
 * orbit can take `applySeasonWash` alone and skip the falling half.
 */
export function applyWeather(ctx: CanvasRenderingContext2D, W: number, H: number, dt = frameDt) {
  const still = reducedMotion();
  // one advance per frame no matter how many times a world composites, and no
  // advance at all for a viewer who asked the app to hold still
  const step = weatherFrame === frameSeq || still ? 0 : Math.min(0.05, Math.max(0, dt));
  weatherFrame = frameSeq;
  weatherT += step;

  const k = seasonMix;
  const hold = still ? 0.5 : 1;   // held still, a full sky would read as dirt
  const kindNow = WEATHER_OF[seasonKind];
  const kindNext = WEATHER_OF[seasonAfter];
  const nNow = Math.round(detail(W_COUNT[kindNow]) * (1 - k) * hold);
  const nNext = k > 0 ? Math.round(detail(W_COUNT[kindNext]) * k * hold) : 0;

  drawWeather(ctx, W, H, kindNow, 0, nNow, step);
  drawWeather(ctx, W, H, kindNext, DRIFT_POOL - nNext, nNext, step);

  const summer = (seasonKind === "summer" ? 1 - k : 0) + (seasonAfter === "summer" ? k : 0);
  if (summer > 0.01) summerHaze(ctx, W, H, summer);
}

/**
 * The whole year in one line: the wash, then the weather. Worlds call this
 * where they already call `applyNight` — after the scene is finished, before
 * the vignette.
 */
export function applySeason(ctx: CanvasRenderingContext2D, W: number, H: number, dt = frameDt) {
  applySeasonWash(ctx, W, H);
  applyWeather(ctx, W, H, dt);
}

export function floorRatio(worldId: string): number {
  if (worldId === "space") return 0.86;
  if (worldId === "farm") return 0.8;
  if (worldId === "dino") return 0.84;
  return 0.88;
}
