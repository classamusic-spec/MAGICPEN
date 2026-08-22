// ─── World themes: shared frame types, fx state & the premium render toolkit ─
// Every world module gets the same set of primitives so the four worlds feel
// like one art-directed game rather than four separate canvas doodles.

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

/** Feed every frame's dt; the toolkit auto-drops detail if the device chugs. */
export function sampleFrame(dt: number) {
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

/* ── cached layers: paint static scenery once, blit it every frame ───────── */

interface Layer { cv: HTMLCanvasElement; w: number; h: number; key: string }
const layers = new Map<string, Layer>();

/**
 * Draw `paint` into an offscreen canvas keyed by `key` + `variant`, then blit.
 * Static art (starfields, coral beds, mountain ranges) costs one paint instead
 * of thousands of path ops per frame — this is what buys the extra detail.
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

export function floorRatio(worldId: string): number {
  if (worldId === "space") return 0.86;
  if (worldId === "farm") return 0.8;
  if (worldId === "dino") return 0.84;
  return 0.88;
}
