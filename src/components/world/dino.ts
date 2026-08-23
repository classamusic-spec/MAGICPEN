// ─── DINO ISLAND world theme ────────────────────────────────────────────────
// A volcanic island that changes with the hour. Depth is built in planes, each
// one hazier and lower-contrast than the one in front of it:
//
//   sky + far ocean ridge → the hero volcano → misty far jungle →
//   mid jungle + geothermal terrace → jungle floor → blurred foreground fronds
//
// Everything static is baked once into two supersampled offscreen layers
// ("dino.sky" behind the flyers, "dino.isle" in front of them), so a frame
// costs two blits plus the things that have a *reason* to move: the crater
// breathing, lava running downhill, embers rising because they are hot, steam
// leaving hot ground, fronds pushed by the same breeze that leans the ash
// plume, and fireflies that only come out once the light goes.
//
// The bake is keyed to the shared day/night clock, so at nine in the morning
// this is a bright tropical island and at nine at night the crater is the only
// thing lighting the trees.
//
// Friendly by design — no fangs, no gore: silhouettes, warm light, big eggs.

import {
  cachedSprite, mulberry32, fbm1, noise1, detail, richFx,
  vGrad, vignette, slot, lerp, clamp, clamp01,
  dayLight, dayWarmth, applyNight,
  type ThemeFrame, type FxState,
} from "./shared";

/* ── motion preference ───────────────────────────────────────────────────── */

let reducedMotion: boolean | null = null;
/** True when the child has asked for less movement. Motion calms, never stops. */
function calm(): boolean {
  if (reducedMotion === null) {
    const mq = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    reducedMotion = !!mq?.matches;
    mq?.addEventListener?.("change", (e) => { reducedMotion = e.matches; });
  }
  return reducedMotion;
}

/* ── baked-layer plumbing (mirrors farm.ts) ──────────────────────────────── */

function ssFactor(W: number, H: number) {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, dpr, Math.sqrt(4.2e6 / Math.max(1, W * H))));
}

function scene(
  ctx: CanvasRenderingContext2D, key: string, W: number, H: number, variant: string,
  paint: (c: CanvasRenderingContext2D, W: number, H: number, S: number) => void,
) {
  const S = ssFactor(W, H);
  const cv = cachedSprite(key, W * S, H * S, `${variant}|${S.toFixed(2)}`, (c, w, h) => {
    c.save();
    c.scale(w / W, h / H);
    paint(c, W, H, S);
    c.restore();
  });
  ctx.drawImage(cv, 0, 0, W, H);
}

/** Island breeze — one wind, shared by the plume, the steam and every frond. */
const breeze = (t: number) => 0.55 + 0.30 * noise1(t * 0.19, 13) + 0.22 * Math.max(0, noise1(t * 0.52, 61));

/* ── palette: the island, lit for the hour ───────────────────────────────── */

type RGB = readonly [number, number, number];

const mix3 = (a: RGB, b: RGB, k: number): RGB =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] as const;
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

/** Sky column, zenith → horizon, at midnight / golden hour / midday. */
const SKY_NIGHT: RGB[] = [[9, 12, 38], [14, 19, 56], [24, 30, 74], [38, 38, 86], [56, 46, 92], [82, 56, 84]];
const SKY_GOLD: RGB[] = [[42, 26, 84], [68, 37, 100], [138, 65, 112], [212, 103, 92], [247, 149, 96], [255, 197, 132]];
const SKY_DAY: RGB[] = [[40, 96, 172], [64, 128, 202], [108, 170, 222], [156, 202, 232], [198, 226, 238], [228, 241, 234]];

interface Pal {
  k: number; w: number; night: number;
  sky: RGB[];
  sun: RGB; sunA: number;
  ridgeHi: RGB; ridgeLo: RGB;
  haze: RGB; hazeA: number;
  rockHi: RGB; rockMid: RGB; rockLo: RGB;
  farHi: RGB; farLo: RGB;
  midHi: RGB; midLo: RGB;
  flrHi: RGB; flrMid: RGB; flrLo: RGB;
  leaf: RGB;
  ember: RGB;
  steam: RGB;
}

/** Everything the bake needs to know about the light, from two scalars. */
function makePal(k: number, w: number): Pal {
  const g = w * 0.9;                       // how far towards golden hour
  const sky = SKY_NIGHT.map((n, i) => mix3(mix3(n, SKY_DAY[i], k), SKY_GOLD[i], g));
  const night = 1 - k;
  const warmy = (dark: RGB, bright: RGB, gold: RGB): RGB =>
    mix3(mix3(dark, bright, k), gold, g * 0.75);
  return {
    k, w, night, sky,
    sun: mix3([255, 168, 96], [255, 240, 208], k), sunA: 0.10 + w * 0.46 + k * 0.14,
    ridgeHi: warmy([26, 30, 62], [96, 118, 150], [122, 74, 112]),
    ridgeLo: warmy([16, 20, 46], [64, 84, 116], [78, 46, 86]),
    haze: mix3(mix3([70, 82, 130], [186, 214, 226], k), [255, 176, 128], g),
    hazeA: 0.26 + w * 0.20,
    rockHi: warmy([44, 34, 60], [138, 118, 122], [188, 116, 96]),
    rockMid: warmy([28, 21, 44], [92, 78, 88], [116, 66, 78]),
    rockLo: warmy([15, 10, 26], [48, 40, 52], [52, 28, 44]),
    farHi: warmy([17, 34, 38], [66, 132, 98], [110, 108, 92]),
    farLo: warmy([12, 26, 32], [44, 100, 78], [78, 74, 76]),
    midHi: warmy([11, 26, 26], [44, 102, 70], [78, 84, 62]),
    midLo: warmy([7, 17, 19], [26, 70, 50], [46, 50, 44]),
    flrHi: warmy([10, 24, 19], [56, 116, 72], [92, 96, 62]),
    flrMid: warmy([7, 17, 14], [38, 88, 56], [62, 68, 46]),
    flrLo: warmy([4, 10, 9], [20, 52, 34], [30, 34, 26]),
    leaf: warmy([9, 22, 17], [30, 78, 50], [50, 60, 40]),
    ember: [255, 166, 102],
    steam: mix3(mix3([182, 196, 218], [244, 250, 252], k), [255, 214, 176], g),
  };
}

let PAL: Pal = makePal(0.3, 0.6);

/**
 * The handful of colour strings the live pass needs. Rebuilt only when the
 * palette changes, because building `rgba(...)` strings inside the draw loop
 * allocates on every frame and hands the collector work it should never have.
 */
interface LivePal {
  flyer: string; rim: string; rimNeck: string; sauropod: string;
  bush: string; bushLit: string; frond: string; steam: string;
}
function makeLive(P: Pal): LivePal {
  const n = P.night;
  return {
    flyer: rgb(mix3(P.ridgeLo, [12, 8, 22], 0.5)),
    rim: rgba(P.ember, 0.22 + P.w * 0.20),
    rimNeck: rgba(P.ember, 0.34 + n * 0.16),
    sauropod: rgb(mix3(P.midLo, [18, 12, 30], 0.45)),
    bush: rgb(mix3(P.leaf, P.flrLo, 0.35)),
    bushLit: rgba(P.ember, 0.13 + n * 0.09),
    frond: rgba(mix3(P.flrLo, [6, 16, 12], 0.55), 0.94),
    steam: `rgba(${P.steam[0] | 0},${P.steam[1] | 0},${P.steam[2] | 0},ALPHA)`,
  };
}
let LIVE: LivePal = makeLive(PAL);

/* ── shared geometry ─────────────────────────────────────────────────────── */

const D = {
  W: 0, H: 0, fY: 0, U: 0, gh: 0,
  mtn: 0,
  vX: 0, vW: 0, vH: 0, craterY: 0, rimW: 0, wL: 0, wR: 0,
  farTop: 0, midTop: 0,
  lavaEndY: 0,
  ventX: 0, ventY: 0, ventW: 0,
  poolX: 0, poolY: 0, poolR: 0,
  nestX: 0, nestY: 0,
};

function setD(W: number, H: number, fY: number) {
  const U = Math.min(W, H);
  D.W = W; D.H = H; D.fY = fY; D.U = U; D.gh = Math.max(1, H - fY);
  D.mtn = fY * 0.82;
  D.vX = W * 0.31;
  D.vW = Math.min(W * 0.98, U * 1.24);
  D.vH = fY * 0.53;
  D.craterY = fY - D.vH;
  D.rimW = D.vW * 0.135;
  D.wL = D.vW * 0.60;
  D.wR = D.vW * 0.44;
  D.farTop = fY - fY * 0.150;
  D.midTop = fY - fY * 0.088;
  D.lavaEndY = D.farTop + U * 0.012;
  D.ventX = W * 0.795; D.ventY = fY + D.gh * 0.10; D.ventW = U * 0.20;
  D.poolX = W * 0.845; D.poolY = fY + D.gh * 0.30; D.poolR = Math.min(U * 0.16, W * 0.19);
  D.nestX = W * 0.17; D.nestY = fY + D.gh * 0.60;
}

/* ── the cone silhouette ─────────────────────────────────────────────────── */
// The whole mountain is one surface function. `surfX(u, p)` is the point at
// lateral fraction u ∈ [-1, 1] and height fraction p (0 at the rim, 1 at the
// base); u = ±1 is the silhouette, and every gully, terminator and old flow is
// a curve of constant u on the same surface. That is what makes it read as a
// cone rather than as a triangle with lines drawn on it.
//
// Asymmetric on purpose: a long shallow left flank carrying an old parasitic
// shoulder, and a shorter, steeper right flank broken open by the lava breach.
// The exponents are > 1, so the flanks are steep at the summit and splay near
// the base — concave, the way a strato-cone actually sits.

const CONE_N = 32;

/** Half-width of the cone at height fraction p, on the given side. */
function halfAt(side: number, p: number) {
  const half = side < 0 ? D.wL : D.wR;
  const n = side < 0 ? 1.24 : 1.46;
  const shoulder = side < 0 ? Math.exp(-Math.pow((p - 0.55) / 0.19, 2)) * D.vW * 0.024 : 0;
  return D.rimW + (half - D.rimW) * Math.pow(clamp01(p), n) + shoulder;
}
const surfX = (u: number, p: number) => D.vX + u * halfAt(u, p);
const surfY = (u: number, p: number) =>
  lerp(D.craterY + D.vH * 0.045, D.fY, clamp01(p))
  - (u < 0 ? Math.exp(-Math.pow((p - 0.55) / 0.19, 2)) * D.vH * 0.022 : 0)
  + fbm1(p * 4.4 + (u < 0 ? 2.1 : 8.4), 3, u < 0 ? 5 : 17) * D.U * (0.012 * Math.abs(u));

/** The broken rim, left → breach → right. [u across rim, v down from craterY]. */
const RIM: readonly (readonly [number, number])[] = [
  [-1.00, 0.052], [-0.88, 0.026], [-0.72, 0.038], [-0.54, 0.050],
  [-0.34, 0.058], [-0.12, 0.050], [0.10, 0.060], [0.28, 0.054],
  [0.42, 0.084], [0.58, 0.080], [0.74, 0.050], [0.90, 0.036], [1.00, 0.056],
];
const rimX = (u: number) => D.vX + D.rimW * u;
const rimY = (v: number) => D.craterY + D.vH * v;

function conePath(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(surfX(-1, 1), D.fY + 3);
  for (let i = CONE_N; i >= 1; i--) { const p = i / CONE_N; c.lineTo(surfX(-1, p), surfY(-1, p)); }
  for (const [u, v] of RIM) c.lineTo(rimX(u), rimY(v));
  for (let i = 1; i <= CONE_N; i++) { const p = i / CONE_N; c.lineTo(surfX(1, p), surfY(1, p)); }
  c.lineTo(surfX(1, 1), D.fY + 3);
  c.closePath();
}

/** The crater bowl: broken front rim plus the back lip standing behind it. */
function craterPath(c: CanvasRenderingContext2D) {
  const back = D.craterY + D.vH * 0.008;
  c.beginPath();
  c.moveTo(rimX(-1), rimY(0.046));
  for (const [u, v] of RIM) c.lineTo(rimX(u), rimY(v));
  c.quadraticCurveTo(D.vX + D.rimW * 0.5, back, D.vX, back);
  c.quadraticCurveTo(D.vX - D.rimW * 0.6, back, rimX(-1), rimY(0.046));
  c.closePath();
}

/** Trace a curve of constant u down the cone's surface — a gully, a flow edge. */
function surfLine(c: CanvasRenderingContext2D, u: number, p0: number, p1: number, wob: number, seed: number) {
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const p = lerp(p0, p1, i / n);
    const uu = u + wob * noise1(p * 3.1 + seed, seed) * (1 - Math.abs(u) * 0.5);
    const x = surfX(uu, p), y = surfY(uu, p);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
}

/* ── the lava channel ────────────────────────────────────────────────────── */
// One continuous course from the breach in the rim to the treeline, where it
// disappears behind the far canopy. Sampled into scratch objects so the draw
// loop never allocates.

/** The run, sampled as colour: white-hot at the breach, dead crust at the end. */
const LAVA_COLS = [
  "#fff4cf", "#ffe08d", "#ffc45a", "#ffa32e", "#fb8a20", "#f4691a",
  "#e34c14", "#cf3a11", "#b32c0d", "#93200a", "#6f1607", "#4d0f05",
];

const LP_A = { x: 0, y: 0, w: 0 };
const LP_B = { x: 0, y: 0, w: 0 };

function lavaAt(k: number, out: { x: number; y: number; w: number }) {
  const p = clamp01(k);
  const x0 = D.vX + D.rimW * 0.51, y0 = D.craterY + D.vH * 0.088;
  const x1 = D.vX + D.vW * 0.285, y1 = D.lavaEndY;
  const s = Math.pow(p, 0.86);
  out.x = lerp(x0, x1, s) + Math.sin(p * 4.3 + 0.6) * D.U * 0.022 + fbm1(p * 3.2 + 11, 2, 41) * D.U * 0.014;
  out.y = lerp(y0, y1, Math.pow(p, 1.05));
  out.w = D.U * (0.014 + 0.034 * Math.pow(p, 0.62));
  return out;
}

/** Trace the channel centreline into the current path. */
function lavaSpine(c: CanvasRenderingContext2D, n: number, from = 0, to = 1) {
  for (let i = 0; i <= n; i++) {
    const s = lavaAt(lerp(from, to, i / n), LP_A);
    if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
  }
}

/* ── canopy silhouettes ──────────────────────────────────────────────────── */

/**
 * A canopy is a single filled shape with a lumpy top edge — never a rectangle
 * with blobs sitting on it. A rectangle shows a ruled horizontal line wherever
 * the blobs do not reach, and a ruled line is the thing that makes painted
 * scenery look like a bar chart.
 */
const CROWNS = 34;
function canopyTop(x: number, W: number, topY: number, amp: number, seed: number) {
  const r = mulberry32(seed);
  let y = topY + amp * 0.55;
  for (let i = 0; i <= CROWNS; i++) {
    const cx = (i / CROWNS) * W + (r() - 0.5) * (W / CROWNS) * 1.4;
    const rr = amp * (0.55 + r() * 0.95);
    const d = Math.abs(x - cx) / rr;
    if (d < 1) y = Math.min(y, topY + amp * 0.55 - Math.sqrt(1 - d * d) * rr * 0.92);
  }
  return y;
}

function canopy(
  c: CanvasRenderingContext2D, W: number, topY: number, baseY: number,
  amp: number, seed: number, fill: string | CanvasGradient,
) {
  c.beginPath();
  c.moveTo(0, canopyTop(0, W, topY, amp, seed));
  for (let x = 4; x <= W; x += 4) c.lineTo(x, canopyTop(x, W, topY, amp, seed));
  c.lineTo(W, baseY); c.lineTo(0, baseY);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Ember rim light along a canopy edge, thrown by the volcano off to the left. */
function canopyRim(
  c: CanvasRenderingContext2D, W: number, topY: number, amp: number,
  seed: number, color: string, lw: number,
) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.beginPath();
  let pen = false;
  for (let x = 0; x <= W; x += 4) {
    const y = canopyTop(x, W, topY, amp, seed);
    const nx = canopyTop(x + 4, W, topY, amp, seed);
    if (nx < y - 0.15) { // only the up-slopes face the volcano
      if (!pen) { c.moveTo(x, y - lw * 0.3); pen = true; } else c.lineTo(x, y - lw * 0.3);
    } else pen = false;
  }
  c.stroke();
  c.restore();
}

/** A frond: curved rachis with pinnae down both sides. Used everywhere. */
function frond(
  c: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number,
  curl: number, color: string, lw: number,
) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.strokeStyle = color;
  c.lineCap = "round";
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -curl * len * 0.35, len, -curl * len * 0.1);
  c.stroke();
  const n = 11;
  for (let i = 1; i <= n; i++) {
    const p = i / (n + 1);
    const px = len * p;
    const py = -curl * len * (0.35 * 2 * p * (1 - p) + 0.1 * p * p);
    const bl = len * 0.26 * Math.sin(p * Math.PI) * (1.1 - p * 0.4);
    c.lineWidth = lw * 0.62;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(px, py);
      c.quadraticCurveTo(px + bl * 0.3, py + s * bl * 0.7, px + bl * 0.75, py + s * bl);
      c.stroke();
    }
  }
  c.restore();
}

/* ── film grain: what stops a 6-stop sky gradient from banding ───────────── */

function grainPattern(c: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = cachedSprite("dino.grain", 128, 128, "v2", (g, w, h) => {
    const img = g.createImageData(w, h);
    const r = mulberry32(90210);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + Math.round((r() - 0.5) * 54);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  return c.createPattern(tile, "repeat");
}

/** Dither a region so the gradient underneath resolves instead of stepping. */
function dither(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number) {
  const p = grainPattern(c);
  if (!p) return;
  c.save();
  c.globalCompositeOperation = "overlay";
  c.globalAlpha = amount;
  c.fillStyle = p;
  c.fillRect(x, y, w, h);
  c.restore();
}

/* ── layer A: the sky ────────────────────────────────────────────────────── */

function paintDinoSky(c: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const { fY } = D;
  const P = PAL;

  // Fourteen stops interpolated from six anchors: enough resolution that the
  // remaining steps fall below the dither floor.
  const stops: [number, string][] = [];
  for (let i = 0; i <= 13; i++) {
    const u = i / 13;
    const f = u * (P.sky.length - 1);
    const a = Math.min(P.sky.length - 1, Math.floor(f));
    const b = Math.min(P.sky.length - 1, a + 1);
    stops.push([u, rgb(mix3(P.sky[a], P.sky[b], f - a))]);
  }
  c.fillStyle = vGrad(c, 0, fY * 1.02, stops);
  c.fillRect(0, 0, W, fY + 3);
  c.fillStyle = rgb(P.sky[5]);
  c.fillRect(0, fY, W, Math.max(0, H - fY));

  // The sun, sitting just off the volcano's shoulder. Low and huge at golden
  // hour, small and high at midday, gone at night.
  const sunY = lerp(fY * 0.99, fY * 0.30, P.k);
  const sunX = D.vX + W * (0.34 - P.k * 0.06);
  if (P.sunA > 0.03) {
    const sg = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, fY) * (0.34 + P.w * 0.30));
    sg.addColorStop(0, rgba(P.sun, Math.min(0.85, P.sunA)));
    sg.addColorStop(0.28, rgba(P.sun, P.sunA * 0.34));
    sg.addColorStop(1, rgba(P.sun, 0));
    c.fillStyle = sg;
    c.fillRect(0, 0, W, fY + 3);
    if (P.w > 0.25 && P.k > 0.08) {
      // a soft-edged disc — a hard circle at this alpha reads as a lens flare
      const dr2 = D.U * 0.058;
      const dg = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, dr2);
      dg.addColorStop(0, rgba(P.sun, 0.50 * P.w));
      dg.addColorStop(0.62, rgba(P.sun, 0.34 * P.w));
      dg.addColorStop(1, rgba(P.sun, 0));
      c.fillStyle = dg;
      c.fillRect(sunX - dr2, sunY - dr2, dr2 * 2, dr2 * 2);
    }
  }

  // Long cloud banks. Wide and shallow, each one built from several overlapping
  // lobes so it has a shape; warm-lit underneath, cool on top, because at dusk
  // the light arrives from below the horizon. Anything narrower than this just
  // blurs into a speck and reads as dirt on the lens.
  const r = mulberry32(31337);
  for (let i = 0; i < 9; i++) {
    const y = fY * (0.10 + (i / 9) * 0.78 + (r() - 0.5) * 0.08);
    const x = r() * W;
    const rw = W * (0.30 + r() * 0.34);
    const rh = rw * (0.055 + r() * 0.045);
    const lit = clamp01((y / fY - 0.28) * 1.5);
    c.save();
    if (richFx()) c.filter = `blur(${(Math.max(4, rh * 0.9) * S).toFixed(1)}px)`;
    c.globalAlpha = (0.10 + r() * 0.16) * (0.5 + P.k * 0.65);
    c.fillStyle = rgb(mix3(P.sky[1], mix3(P.sun, P.sky[4], 0.35), lit * (0.35 + P.w * 0.55)));
    for (let k2 = 0; k2 < 4; k2++) {
      const lx = x + (k2 / 3 - 0.5) * rw * 1.1;
      const ly = y + (r() - 0.5) * rh * 1.2;
      c.beginPath();
      c.ellipse(lx, ly, rw * (0.34 + r() * 0.24), rh * (0.6 + r() * 0.7), 0, 0, Math.PI * 2);
      c.fill();
    }
    c.filter = "none";
    c.restore();
  }
  c.globalAlpha = 1;

  dither(c, 0, 0, W, fY + 3, 0.20);

  // Two ranges out to sea, not one grey triangle. The farther one is pushed
  // most of the way into the haze; the nearer one keeps a lit west face, a
  // shadowed east face and a soft ridge line, and both get their feet washed
  // out so the distance reads as air rather than as scale.
  const ridgeAt = (u: number, sc: number, off: number, sd: number, drop: number) =>
    D.mtn - off - Math.pow(clamp(1 - Math.abs(fbm1(u * sc + 4.3, 4, sd)), 0, 1), 3) * fY * drop;

  for (const [sc, off, sd, drop, back] of [
    [2.6, fY * 0.030, 71, 0.15, 1], [3.8, 0, 23, 0.23, 0],
  ] as const) {
    const line = (u: number) => ridgeAt(u, sc, off, sd, drop);
    c.beginPath();
    c.moveTo(0, line(0));
    for (let x = 5; x < W; x += 5) c.lineTo(x, line(x / W));
    c.lineTo(W, line(1));
    c.lineTo(W, fY + 3); c.lineTo(0, fY + 3);
    c.closePath();
    const hi = back ? mix3(P.ridgeHi, P.haze, 0.62) : P.ridgeHi;
    const lo = back ? mix3(P.ridgeLo, P.haze, 0.58) : P.ridgeLo;
    // light comes from the volcano side, so the west faces are the lit ones
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, rgb(mix3(lo, hi, 0.9)));
    g.addColorStop(0.45, rgb(hi));
    g.addColorStop(1, rgb(lo));
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = vGrad(c, D.mtn - fY * 0.24, D.mtn + fY * 0.10, [
      [0, rgba(P.haze, 0)], [1, rgba(P.haze, (back ? 0.62 : 0.40) * P.hazeA * 2.2)],
    ]);
    c.fillRect(0, D.mtn - fY * 0.26, W, fY * 0.40);
    c.restore();
    if (!back) {
      c.strokeStyle = rgba(P.sun, 0.16 + P.w * 0.32);
      c.lineWidth = Math.max(1, D.U * 0.003);
      c.beginPath();
      c.moveTo(0, line(0) + D.U * 0.002);
      for (let x = 5; x < W; x += 5) c.lineTo(x, line(x / W) + D.U * 0.002);
      c.stroke();
    }
  }

  // Atmosphere pooling at the base of the ridge — the far plane reads far
  // because it is washed out, not because it is small.
  c.fillStyle = vGrad(c, D.mtn - fY * 0.12, D.farTop + fY * 0.03, [
    [0, rgba(P.haze, 0)], [0.55, rgba(P.haze, P.hazeA * 0.5)], [1, rgba(P.haze, P.hazeA)],
  ]);
  c.fillRect(0, D.mtn - fY * 0.12, W, D.farTop - D.mtn + fY * 0.16);
  dither(c, 0, D.mtn - fY * 0.20, W, fY - D.mtn + fY * 0.24, 0.14);

  // The vignette is baked, not laid down every frame: it never changes, and a
  // full-screen radial fill is one of the most expensive things a software
  // canvas can be asked to do sixty times a second.
  vignette(c, W, H, 0.20 + P.night * 0.08);
}

/* ── the hero volcano (static rock; every hot thing is drawn live) ───────── */

function paintVolcano(c: CanvasRenderingContext2D) {
  const { fY, U, vX, vW, vH, craterY } = D;
  const P = PAL;

  // Warm air standing off the cone. Barely there in daylight; at night it is
  // most of what you can see of the mountain.
  const halo = c.createRadialGradient(vX, craterY, U * 0.02, vX, craterY, vW * 0.62);
  halo.addColorStop(0, `rgba(255,146,74,${(0.05 + P.night * 0.24).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(255,120,70,${(0.02 + P.night * 0.09).toFixed(3)})`);
  halo.addColorStop(1, "rgba(255,110,70,0)");
  c.fillStyle = halo;
  c.fillRect(vX - vW * 0.62, craterY - vW * 0.62, vW * 1.24, vW * 1.24);

  /* body: lit from the sun side (left), falling into shadow on the right */
  conePath(c);
  const body = c.createLinearGradient(vX - D.wL, 0, vX + D.wR, 0);
  body.addColorStop(0, rgb(mix3(P.rockMid, P.rockHi, 0.55)));
  body.addColorStop(0.30, rgb(P.rockHi));
  body.addColorStop(0.58, rgb(P.rockMid));
  body.addColorStop(1, rgb(P.rockLo));
  c.fillStyle = body;
  c.fill();

  c.save();
  conePath(c);
  c.clip();

  // The terminator: the shadow line is itself a curve of constant u on the
  // cone's surface, bowing out towards the base. This one curve is what turns
  // a flat triangle into something round.
  c.beginPath();
  c.moveTo(surfX(0.10, 0), surfY(0.10, 0));
  for (let i = 1; i <= 14; i++) { const p = i / 14; c.lineTo(surfX(0.10, p), surfY(0.10, p)); }
  c.lineTo(vX + vW, fY + 6);
  c.lineTo(vX + vW, craterY - vH);
  c.closePath();
  c.save();
  if (richFx()) c.filter = `blur(${(D.U * 0.018).toFixed(1)}px)`;
  c.fillStyle = vGrad(c, craterY, fY, [
    [0, rgba(P.rockLo, 0.24)], [0.55, rgba(P.rockLo, 0.44)], [1, rgba(P.rockLo, 0.50)],
  ]);
  c.fill();
  c.filter = "none";
  c.restore();

  // A matching bounce of light on the sunward flank, tightest near the top.
  c.beginPath();
  for (let i = 0; i <= 14; i++) { const p = i / 14; c.lineTo(surfX(-0.30, p), surfY(-0.30, p)); }
  for (let i = 14; i >= 0; i--) { const p = i / 14; c.lineTo(surfX(-1, p), surfY(-1, p)); }
  c.closePath();
  c.save();
  if (richFx()) c.filter = `blur(${(D.U * 0.022).toFixed(1)}px)`;
  c.fillStyle = vGrad(c, craterY, fY, [
    [0, rgba(mix3(P.rockHi, P.sun, 0.45 + P.w * 0.25), 0.22 + P.w * 0.34)],
    [0.55, rgba(mix3(P.rockHi, P.sun, 0.45 + P.w * 0.25), 0.10 + P.w * 0.16)],
    [1, rgba(mix3(P.rockHi, P.sun, 0.45), 0)],
  ]);
  c.fill();
  c.filter = "none";
  c.restore();

  // Gullies. Each one is a constant-u line on the surface, so they converge on
  // the rim and splay at the base without ever leaving the silhouette. Spaced
  // by sine of an even angle, which bunches them towards the edges the way a
  // real cone's foreshortening does.
  const gr = mulberry32(9091);
  for (let i = 0; i < 22; i++) {
    const u = Math.sin((-0.5 + (i + 0.5) / 22) * Math.PI) * 0.97;
    const p0 = 0.06 + gr() * 0.16;
    const p1 = 0.72 + gr() * 0.34;
    const lit = u < -0.2;
    c.lineCap = "round";
    c.strokeStyle = rgba(P.rockLo, 0.12 + gr() * 0.13);
    c.lineWidth = U * (0.003 + gr() * 0.006);
    c.beginPath();
    surfLine(c, u, p0, p1, 0.045, 100 + i * 7);
    c.stroke();
    c.strokeStyle = lit
      ? rgba(mix3(P.rockHi, P.sun, 0.4), 0.13 + P.w * 0.10)
      : rgba(P.rockHi, 0.055);
    c.lineWidth = U * 0.0026;
    c.beginPath();
    surfLine(c, u + 0.035, p0 + 0.05, p1 * 0.9, 0.04, 300 + i * 5);
    c.stroke();
  }

  // Older lava tongues: broad dark lobes hanging off the rim, cooled hard.
  // They cut across the gullies and stop the surface reading as corduroy.
  const tr = mulberry32(3131);
  for (let i = 0; i < 5; i++) {
    const u = -0.78 + i * 0.34 + (tr() - 0.5) * 0.14;
    c.strokeStyle = rgba(P.rockLo, 0.26);
    c.lineCap = "round";
    c.lineWidth = U * (0.018 + tr() * 0.020);
    c.beginPath();
    surfLine(c, u, 0.07, 0.42 + tr() * 0.46, 0.06, 700 + i * 11);
    c.stroke();
  }

  // Ash rime along the rim — fresh fall, paler than the old rock.
  c.fillStyle = rgba(mix3(P.rockHi, [216, 206, 214], 0.5), 0.13);
  c.beginPath();
  c.moveTo(surfX(-1, 0.10), surfY(-1, 0.10));
  c.quadraticCurveTo(vX, craterY + vH * 0.19, surfX(1, 0.09), surfY(1, 0.09));
  c.quadraticCurveTo(vX, craterY + vH * 0.03, surfX(-1, 0.10), surfY(-1, 0.10));
  c.fill();

  // Rock speckle, denser low down where scree collects.
  const rr = mulberry32(2468);
  const speck = 260;
  for (let i = 0; i < speck; i++) {
    const p = Math.pow(rr(), 0.55);
    const u = (rr() * 2 - 1) * 0.97;
    const x = surfX(u, p), y = surfY(u, p);
    c.fillStyle = rr() > 0.55 ? rgba(P.rockHi, 0.12) : rgba(P.rockLo, 0.22);
    c.fillRect(x, y, U * (0.005 + rr() * 0.010), U * 0.0035);
  }

  // Jungle climbing the lower flanks — the cone must not end in a clean line.
  const vr = mulberry32(555);
  for (let i = 0; i < 70; i++) {
    const p = 0.66 + vr() * 0.40;
    const u = (vr() * 2 - 1) * (0.30 + vr() * 0.70);
    const x = surfX(u, Math.min(1, p));
    const y = surfY(u, Math.min(1, p)) + vr() * U * 0.02;
    const rad = U * (0.012 + vr() * 0.020);
    c.fillStyle = rgba(mix3(P.farLo, P.rockLo, 0.35), 0.5 + vr() * 0.4);
    c.beginPath();
    c.ellipse(x, y, rad, rad * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }

  // The cooled crust the live lava runs inside: a dark channel with raised
  // levees either side, so the molten line has somewhere to be.
  c.strokeStyle = rgba(P.rockLo, 0.92);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  lavaSpine(c, 24);
  c.lineWidth = U * 0.070;
  c.stroke();
  c.strokeStyle = "rgba(96,34,18,0.55)";
  c.lineWidth = U * 0.044;
  c.beginPath();
  lavaSpine(c, 24);
  c.stroke();
  c.restore();

  /* the crater bowl itself — dark rock; the lava lake is painted live */
  c.save();
  craterPath(c);
  c.fillStyle = rgb(P.rockLo);
  c.fill();
  c.clip();
  c.fillStyle = vGrad(c, craterY - vH * 0.06, craterY + vH * 0.10, [
    [0, rgba(P.rockMid, 0.7)], [1, rgba(P.rockLo, 0)],
  ]);
  c.fillRect(vX - D.rimW * 1.2, craterY - vH * 0.08, D.rimW * 2.4, vH * 0.2);
  c.restore();

  // the broken lip, drawn as a jagged stroke rather than a smooth arc
  c.strokeStyle = rgba(P.rockLo, 0.95);
  c.lineWidth = U * 0.009;
  c.lineJoin = "round";
  c.beginPath();
  for (let i = 0; i < RIM.length; i++) {
    const [u, v] = RIM[i];
    if (i === 0) c.moveTo(rimX(u), rimY(v)); else c.lineTo(rimX(u), rimY(v));
  }
  c.stroke();
  // sun catching the high shoulder of the rim
  c.strokeStyle = rgba(mix3(P.rockHi, P.sun, 0.5), 0.26 + P.w * 0.34);
  c.lineWidth = U * 0.0035;
  c.beginPath();
  for (let i = 0; i < 5; i++) { const [u, v] = RIM[i]; if (i === 0) c.moveTo(rimX(u), rimY(v)); else c.lineTo(rimX(u), rimY(v)); }
  c.stroke();

  // Skylight down the western silhouette. At night the sky is still the second
  // brightest thing in the frame, and without this edge the cone goes to a
  // flat blot against it.
  c.save();
  c.strokeStyle = rgba(mix3(P.sky[3], P.rockHi, 0.35), 0.30 + P.night * 0.30);
  c.lineWidth = Math.max(1, U * 0.0045);
  c.lineJoin = "round";
  c.beginPath();
  for (let i = CONE_N; i >= 1; i--) { const p = i / CONE_N; c.lineTo(surfX(-1, p) + U * 0.002, surfY(-1, p)); }
  for (let i = 0; i < 4; i++) { const [u, v] = RIM[i]; c.lineTo(rimX(u), rimY(v)); }
  c.stroke();
  c.restore();

  // boulders at the foot, half swallowed by the jungle
  const br = mulberry32(1357);
  for (let i = 0; i < 9; i++) {
    const x = vX + (br() - 0.5) * vW * 1.02;
    const y = fY - fY * 0.006 - br() * fY * 0.022;
    const r = U * (0.012 + br() * 0.022);
    c.fillStyle = rgb(P.rockLo);
    c.beginPath();
    c.ellipse(x, y, r, r * 0.72, br() * 0.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = rgba(P.ember, 0.14 + P.night * 0.10);
    c.beginPath();
    c.ellipse(x - r * 0.3, y - r * 0.34, r * 0.44, r * 0.22, -0.4, 0, Math.PI * 2);
    c.fill();
  }
}

/* ── the geothermal terrace: hot ground, and what it does to water ───────── */

function paintVent(c: CanvasRenderingContext2D) {
  const { U, ventX, ventY, ventW, poolX, poolY, poolR } = D;
  const P = PAL;
  const r = mulberry32(24680);

  /* a low bluff of cracked, baked rock */
  c.save();
  c.beginPath();
  c.moveTo(ventX - ventW, ventY + U * 0.05);
  c.quadraticCurveTo(ventX - ventW * 0.7, ventY - U * 0.030, ventX - ventW * 0.18, ventY - U * 0.022);
  c.quadraticCurveTo(ventX + ventW * 0.3, ventY - U * 0.040, ventX + ventW * 0.86, ventY - U * 0.006);
  c.quadraticCurveTo(ventX + ventW * 1.1, ventY + U * 0.02, ventX + ventW * 1.05, ventY + U * 0.06);
  c.closePath();
  c.fillStyle = vGrad(c, ventY - U * 0.04, ventY + U * 0.06, [
    [0, rgb(mix3(P.rockMid, [188, 174, 168], 0.35))],
    [1, rgb(mix3(P.rockLo, P.flrLo, 0.4))],
  ]);
  c.fill();
  c.clip();
  // sinter terracing — pale mineral steps left by mineral-heavy water
  for (let i = 0; i < 5; i++) {
    const y = ventY - U * 0.03 + i * U * 0.019;
    c.strokeStyle = rgba(mix3([232, 224, 208], P.rockMid, 0.35), 0.30 - i * 0.03);
    c.lineWidth = U * 0.006;
    c.beginPath();
    c.moveTo(ventX - ventW, y + Math.sin(i * 2.1) * U * 0.004);
    c.quadraticCurveTo(ventX, y + U * 0.010, ventX + ventW * 1.1, y - Math.sin(i * 1.3) * U * 0.005);
    c.stroke();
  }
  // fissures with heat still in them
  for (let i = 0; i < 7; i++) {
    const x = ventX - ventW * 0.8 + r() * ventW * 1.7;
    const y = ventY - U * 0.024 + r() * U * 0.055;
    const len = U * (0.02 + r() * 0.045);
    const ang = -0.5 + r() * 1.0;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.strokeStyle = rgba(P.rockLo, 0.85);
    c.lineCap = "round";
    c.lineWidth = U * 0.006;
    c.beginPath();
    c.moveTo(-len / 2, 0);
    c.quadraticCurveTo(0, U * 0.004, len / 2, 0);
    c.stroke();
    c.strokeStyle = "rgba(255,132,52,0.55)";
    c.lineWidth = U * 0.0025;
    c.beginPath();
    c.moveTo(-len / 2, 0);
    c.quadraticCurveTo(0, U * 0.004, len / 2, 0);
    c.stroke();
    c.restore();
  }
  c.restore();

  /* the hot spring itself — milky turquoise, ringed with pale sinter */
  c.fillStyle = rgb(mix3([236, 228, 210], P.rockMid, 0.30 + P.night * 0.35));
  c.beginPath();
  c.ellipse(poolX, poolY, poolR * 1.20, poolR * 0.46, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgb(mix3([206, 196, 178], P.rockLo, 0.35 + P.night * 0.35));
  c.beginPath();
  c.ellipse(poolX, poolY, poolR * 1.05, poolR * 0.40, 0, 0, Math.PI * 2);
  c.fill();
  const water = vGrad(c, poolY - poolR * 0.36, poolY + poolR * 0.36, [
    [0, rgb(mix3([18, 74, 92], [96, 208, 206], P.k * 0.75))],
    [0.55, rgb(mix3([26, 104, 118], [140, 226, 216], P.k * 0.75))],
    [1, rgb(mix3([44, 140, 146], [196, 240, 226], P.k * 0.7))],
  ]);
  c.save();
  c.beginPath();
  c.ellipse(poolX, poolY, poolR * 0.92, poolR * 0.35, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = water;
  c.fill();
  c.clip();
  // the volcano reflected as a warm smear on the far side of the water
  c.fillStyle = rgba(P.ember, 0.20 + P.night * 0.16);
  c.beginPath();
  c.ellipse(poolX - poolR * 0.45, poolY + poolR * 0.06, poolR * 0.50, poolR * 0.14, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.14)";
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(poolX + (r() - 0.5) * poolR * 1.4, poolY + (r() - 0.5) * poolR * 0.5, poolR * 0.20, poolR * 0.025, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // reeds around the near edge, so the pool sits *in* the ground
  c.strokeStyle = rgb(P.flrLo);
  c.lineCap = "round";
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * (0.08 + r() * 0.84);
    const x = poolX + Math.cos(a) * poolR * (0.95 + r() * 0.3);
    const y = poolY + Math.sin(a) * poolR * 0.38;
    const h = U * (0.018 + r() * 0.03);
    c.lineWidth = Math.max(1, U * 0.003);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + (r() - 0.5) * h * 0.5, y - h * 0.6, x + (r() - 0.5) * h, y - h);
    c.stroke();
  }
}

/* ── jungle floor set-dressing ───────────────────────────────────────────── */

function paintFloorProps(c: CanvasRenderingContext2D, W: number, rnd: () => number) {
  const { fY, U, gh } = D;
  const P = PAL;

  /* mossy ancient rocks */
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + rnd() * 0.9);
    const y = fY + gh * (0.12 + rnd() * 0.5);
    const r = U * (0.026 + rnd() * 0.036);
    c.fillStyle = rgb(mix3(P.rockLo, P.flrLo, 0.4));
    c.beginPath();
    c.ellipse(x, y, r, r * 0.72, rnd() * 0.5 - 0.25, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = rgb(P.leaf);
    c.beginPath();
    c.ellipse(x - r * 0.12, y - r * 0.42, r * 0.78, r * 0.26, -0.15, Math.PI, Math.PI * 2);
    c.fill();
    c.fillStyle = rgba(P.ember, 0.16 + P.night * 0.10);
    c.beginPath();
    c.ellipse(x - r * 0.42, y - r * 0.3, r * 0.34, r * 0.16, -0.5, 0, Math.PI * 2);
    c.fill();
  }

  /* giant ferns and cycads sprouting from the floor */
  for (let i = 0; i < 16; i++) {
    const x = W * rnd();
    const y = fY + gh * (0.05 + rnd() * 0.85);
    const d = (y - fY) / gh;
    const len = U * (0.05 + d * 0.11) * (0.75 + rnd() * 0.5);
    const col = rgb(mix3(P.leaf, P.flrLo, d));
    const n = 5 + Math.floor(rnd() * 3);
    for (let f = 0; f < n; f++) {
      const a = -Math.PI * 0.92 + (f / (n - 1)) * Math.PI * 0.84;
      frond(c, x, y, len, a, 0.7, col, Math.max(1, len * 0.045));
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = W * (0.08 + rnd() * 0.84);
    const y = fY + gh * (0.3 + rnd() * 0.6);
    const r = U * (0.03 + rnd() * 0.02);
    c.fillStyle = rgb(mix3(P.leaf, P.flrLo, 0.45));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.3, r * 0.55, r * 0.16, a * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = rgb(mix3([138, 90, 43], P.flrLo, P.night * 0.5));
    c.beginPath();
    c.ellipse(x, y, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* a nest of big friendly eggs */
  const nx = D.nestX, ny = D.nestY, nr = U * 0.055;
  c.save();
  c.fillStyle = rgb(mix3([74, 55, 34], P.flrLo, P.night * 0.55));
  c.beginPath();
  c.ellipse(nx, ny, nr * 1.35, nr * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 3; i++) {
    const ex = nx + (i - 1) * nr * 0.62;
    const ey = ny - nr * 0.30 + Math.abs(i - 1) * nr * 0.1;
    c.fillStyle = rgb(mix3([240, 226, 196], [96, 84, 92], P.night * 0.55));
    c.beginPath();
    c.ellipse(ex, ey, nr * 0.34, nr * 0.46, (i - 1) * 0.25, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(150,116,78,0.42)";
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      c.arc(ex + (rnd() - 0.5) * nr * 0.4, ey + (rnd() - 0.5) * nr * 0.6, nr * 0.045, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = rgba(P.ember, 0.34 + P.night * 0.18);
    c.beginPath();
    c.ellipse(ex - nr * 0.12, ey - nr * 0.16, nr * 0.12, nr * 0.18, -0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = rgb(mix3([92, 69, 43], P.flrLo, P.night * 0.5));
  c.lineWidth = Math.max(1, nr * 0.07);
  c.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    c.beginPath();
    c.moveTo(nx + Math.cos(a) * nr * 0.9, ny + Math.sin(a) * nr * 0.32);
    c.lineTo(nx + Math.cos(a + 0.6) * nr * 1.4, ny + Math.sin(a + 0.6) * nr * 0.5);
    c.stroke();
  }
  c.restore();

  /* half-buried fossil ribs and a lump of amber */
  const bx = W * 0.46, by = fY + gh * 0.80;
  c.save();
  c.strokeStyle = rgba(mix3([226, 216, 196], P.flrLo, P.night * 0.45), 0.65);
  c.lineCap = "round";
  c.lineWidth = Math.max(1.4, U * 0.006);
  for (let i = 0; i < 5; i++) {
    const rx = bx + i * U * 0.026;
    c.beginPath();
    c.arc(rx, by, U * (0.026 - i * 0.002), Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
  }
  c.fillStyle = rgba(mix3([226, 216, 196], P.flrLo, P.night * 0.45), 0.6);
  c.beginPath();
  c.ellipse(bx - U * 0.05, by + U * 0.006, U * 0.022, U * 0.016, 0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/* ── layer B: the island ─────────────────────────────────────────────────── */

function paintDinoIsle(c: CanvasRenderingContext2D, W: number, H: number) {
  const { fY, U, gh } = D;
  const P = PAL;
  const rnd = mulberry32(60613);

  paintVolcano(c);

  /* the deepest jungle plane, almost lost in the haze */
  canopy(c, W, D.farTop - U * 0.030, fY + 2, U * 0.026, 331, vGrad(c, D.farTop - U * 0.03, fY, [
    [0, rgb(mix3(P.farHi, P.haze, 0.45))], [1, rgb(mix3(P.farLo, P.haze, 0.32))],
  ]));
  c.fillStyle = vGrad(c, D.farTop - U * 0.06, D.farTop + fY * 0.03, [
    [0, rgba(P.haze, 0)], [0.4, rgba(P.haze, P.hazeA * 0.7)], [1, rgba(P.haze, 0)],
  ]);
  c.fillRect(0, D.farTop - U * 0.06, W, fY * 0.03 + U * 0.06);

  /* far jungle: cool, misty, low contrast */
  canopy(c, W, D.farTop, fY + 2, U * 0.032, 505, vGrad(c, D.farTop, fY, [
    [0, rgb(P.farHi)], [1, rgb(P.farLo)],
  ]));
  const rimLit = mix3(P.ember, mix3(P.sun, [186, 226, 150], 0.45), P.k * 0.8);
  canopyRim(c, W, D.farTop, U * 0.032, 505, rgba(rimLit, 0.16 + P.night * 0.12), Math.max(1, U * 0.005));
  c.fillStyle = vGrad(c, D.farTop - U * 0.02, D.midTop + fY * 0.04, [
    [0, rgba(P.haze, 0)], [0.30, rgba(P.haze, P.hazeA * 0.72)], [1, rgba(P.haze, 0)],
  ]);
  c.fillRect(0, D.farTop - U * 0.02, W, D.midTop - D.farTop + fY * 0.06);

  /* mid jungle: palms and tree ferns breaking the canopy line */
  canopy(c, W, D.midTop, fY + 2, U * 0.042, 909, vGrad(c, D.midTop, fY, [
    [0, rgb(P.midHi)], [1, rgb(P.midLo)],
  ]));
  const pr = mulberry32(7788);
  const trunk = rgb(mix3(P.midLo, P.flrLo, 0.5));
  for (let i = 0; i < 12; i++) {
    const px = pr() * W;
    const ph = U * (0.09 + pr() * 0.09);
    const lean = pr() > 0.5 ? 1 : -1;
    c.strokeStyle = trunk;
    c.lineCap = "round";
    c.lineWidth = Math.max(1.5, ph * 0.055);
    c.beginPath();
    c.moveTo(px, D.midTop + U * 0.02);
    c.quadraticCurveTo(px + lean * ph * 0.16, D.midTop - ph * 0.5, px + lean * ph * 0.26, D.midTop - ph);
    c.stroke();
    for (let f = 0; f < 6; f++) {
      const a = -Math.PI * 0.9 + (f / 5) * Math.PI * 1.8;
      frond(c, px + lean * ph * 0.26, D.midTop - ph, ph * 0.5, a, 0.55, trunk, Math.max(1, ph * 0.035));
    }
  }
  // Patches of tone across the canopy: some crowns catch the sky, some sit in
  // the shade of the ones in front. A single flat green is what makes painted
  // jungle look like a bar of colour.
  c.save();
  c.beginPath();
  c.moveTo(0, canopyTop(0, W, D.midTop, U * 0.042, 909));
  for (let x = 4; x <= W; x += 4) c.lineTo(x, canopyTop(x, W, D.midTop, U * 0.042, 909));
  c.lineTo(W, fY + 2); c.lineTo(0, fY + 2);
  c.closePath();
  c.clip();
  const tr2 = mulberry32(6161);
  for (let i = 0; i < 30; i++) {
    const x = tr2() * W;
    const y = D.midTop + tr2() * (fY - D.midTop) * 1.1;
    const rr = U * (0.025 + tr2() * 0.055);
    const up = tr2() > 0.5;
    c.fillStyle = up
      ? rgba(mix3(P.midHi, P.haze, 0.30), 0.26)
      : rgba(mix3(P.midLo, [2, 8, 8], 0.5), 0.26);
    c.beginPath();
    c.ellipse(x, y, rr, rr * 0.62, (tr2() - 0.5), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // a few emergents standing clear of the canopy line
  const er2 = mulberry32(1919);
  for (let i = 0; i < 7; i++) {
    const ex = er2() * W;
    const eh = U * (0.045 + er2() * 0.05);
    const ey = canopyTop(ex, W, D.midTop, U * 0.042, 909) - eh * 0.5;
    c.fillStyle = rgb(mix3(P.midHi, P.midLo, 0.4));
    for (let k2 = 0; k2 < 5; k2++) {
      const a = (k2 / 5) * Math.PI * 2;
      c.beginPath();
      c.ellipse(ex + Math.cos(a) * eh * 0.32, ey + Math.sin(a) * eh * 0.22, eh * 0.34, eh * 0.24, a, 0, Math.PI * 2);
      c.fill();
    }
  }

  canopyRim(c, W, D.midTop, U * 0.042, 909, rgba(rimLit, 0.22 + P.night * 0.14), Math.max(1, U * 0.007));
  c.fillStyle = vGrad(c, D.midTop - U * 0.02, fY + gh * 0.06, [
    [0, rgba(P.haze, 0)], [0.22, rgba(P.haze, P.hazeA * 0.26)], [1, rgba(P.haze, 0)],
  ]);
  c.fillRect(0, D.midTop - U * 0.02, W, fY - D.midTop + gh * 0.08);

  /* two overlapping banks of jungle floor. One undulating edge would still be
     a single line across the frame; two, at different heights and with the
     nearer one darker, read as ground receding away from you. */
  const bank = (x: number, o: number, amp: number, sd: number) =>
    fY + o + fbm1(x / W * 4.6 + sd, 3, 91 + sd) * amp + Math.sin(x / W * 6.1 + sd) * amp * 0.28;
  const farBankAmp = U * 0.070;
  c.beginPath();
  c.moveTo(0, bank(0, -U * 0.030, farBankAmp, 3.7));
  for (let x = 5; x <= W; x += 5) c.lineTo(x, bank(x, -U * 0.030, farBankAmp, 3.7));
  c.lineTo(W, H + 4); c.lineTo(0, H + 4);
  c.closePath();
  c.fillStyle = vGrad(c, fY - U * 0.09, H, [
    [0, rgb(P.flrHi)], [0.34, rgb(P.flrMid)], [1, rgb(P.flrLo)],
  ]);
  c.fill();
  c.save();
  c.clip();
  // dapple: clearings and shade, so the floor is not one flat colour
  const dr = mulberry32(4242);
  for (let i = 0; i < 26; i++) {
    const x = dr() * W;
    const y = fY + gh * dr() * 1.05;
    const rw = U * (0.06 + dr() * 0.14);
    c.fillStyle = dr() > 0.45 ? rgba(P.flrHi, 0.20) : rgba(P.flrLo, 0.26);
    c.beginPath();
    c.ellipse(x, y, rw, rw * 0.30, (dr() - 0.5) * 0.4, 0, Math.PI * 2);
    c.fill();
  }
  // leaf litter
  for (let i = 0; i < 110; i++) {
    const x = dr() * W;
    const y = fY + gh * Math.pow(dr(), 0.8) * 1.05;
    c.fillStyle = dr() > 0.5 ? rgba(P.leaf, 0.35) : rgba(P.flrLo, 0.4);
    c.beginPath();
    c.ellipse(x, y, U * (0.006 + dr() * 0.010), U * 0.0028, dr() * 3, 0, Math.PI * 2);
    c.fill();
  }
  paintVent(c);
  paintFloorProps(c, W, rnd);
  c.restore();

  // the volcano's light rakes the crest of the bank — along the edge, not in a
  // horizontal band across the picture
  c.save();
  c.strokeStyle = rgba(P.ember, 0.26 + P.night * 0.14);
  c.lineWidth = Math.max(1.2, U * 0.005);
  c.lineJoin = "round";
  if (richFx()) c.filter = `blur(${(U * 0.005).toFixed(1)}px)`;
  c.beginPath();
  {
    let pen = false;
    for (let x = 0; x <= W; x += 5) {
      const y = bank(x, -U * 0.030, farBankAmp, 3.7);
      const ny = bank(x + 5, -U * 0.030, farBankAmp, 3.7);
      if (ny < y) { if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y); } else pen = false;
    }
  }
  c.stroke();
  c.filter = "none";
  c.restore();

  /* the near bank, darker and lower — the ground you are standing on */
  const nearAmp = U * 0.052;
  c.beginPath();
  c.moveTo(0, bank(0, gh * 0.30, nearAmp, 11.3));
  for (let x = 5; x <= W; x += 5) c.lineTo(x, bank(x, gh * 0.30, nearAmp, 11.3));
  c.lineTo(W, H + 4); c.lineTo(0, H + 4);
  c.closePath();
  c.fillStyle = vGrad(c, fY + gh * 0.22, H, [
    [0, rgb(mix3(P.flrMid, P.flrLo, 0.45))], [1, rgb(mix3(P.flrLo, [3, 8, 7], 0.5))],
  ]);
  c.fill();
  c.save();
  c.clip();
  const nr2 = mulberry32(8181);
  for (let i = 0; i < 14; i++) {
    const x = nr2() * W;
    const y = fY + gh * (0.34 + nr2() * 0.7);
    const rw = U * (0.05 + nr2() * 0.11);
    c.fillStyle = nr2() > 0.5 ? rgba(P.flrMid, 0.22) : rgba([2, 6, 5], 0.22);
    c.beginPath();
    c.ellipse(x, y, rw, rw * 0.26, 0, 0, Math.PI * 2);
    c.fill();
  }
  // undergrowth crowding the crest of the near bank
  for (let i = 0; i < 26; i++) {
    const x = nr2() * W;
    const y = bank(x, gh * 0.30, nearAmp, 11.3) + nr2() * U * 0.02;
    const len = U * (0.035 + nr2() * 0.05);
    const col = rgba(mix3(P.leaf, [3, 9, 7], 0.55), 0.9);
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI * 0.9 + (f / 4) * Math.PI * 0.8;
      frond(c, x, y, len, a, 0.7, col, Math.max(1, len * 0.05));
    }
  }
  c.restore();
  c.save();
  c.strokeStyle = rgba(P.ember, 0.13 + P.night * 0.09);
  c.lineWidth = Math.max(1, U * 0.0035);
  c.beginPath();
  {
    let pen = false;
    for (let x = 0; x <= W; x += 5) {
      const y = bank(x, gh * 0.30, nearAmp, 11.3);
      const ny = bank(x + 5, gh * 0.30, nearAmp, 11.3);
      if (ny < y) { if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y); } else pen = false;
    }
  }
  c.stroke();
  c.restore();

  dither(c, 0, fY - U * 0.20, W, H - fY + U * 0.20, 0.10);
}

/* ── cached sprites for the animated layer ───────────────────────────────── */

function puffSprite(key: string, color: string) {
  return cachedSprite(key, 128, 128, color, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, color.replace("ALPHA", "0.95"));
    g.addColorStop(0.42, color.replace("ALPHA", "0.42"));
    g.addColorStop(1, color.replace("ALPHA", "0"));
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
}
const ASH = "rgba(178,164,186,ALPHA)";
const HOT = "rgba(255,150,64,ALPHA)";
const FIRE = "rgba(255,124,44,ALPHA)";
const GLOW_FLY = "rgba(226,255,150,ALPHA)";

/**
 * Blit a cached radial glow instead of building a gradient. Every soft light in
 * this world goes through here: with two dozen of them in a frame, the
 * per-frame `createRadialGradient` calls were the single biggest cost, and the
 * only thing that changes between them is size, colour and alpha.
 */
function stamp(
  ctx: CanvasRenderingContext2D, sp: HTMLCanvasElement,
  x: number, y: number, r: number, alpha: number,
) {
  if (alpha <= 0.004 || r <= 0) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
}

/** Soft shaft of light for the canopy god rays (daytime only). */
function shaftSprite() {
  return cachedSprite("dino.shaft", 150, 340, "v2", (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,240,206,0.5)");
    g.addColorStop(0.55, "rgba(255,226,170,0.14)");
    g.addColorStop(1, "rgba(255,226,170,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w * 0.44, 0);
    c.lineTo(w * 0.58, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
  });
}

/** A frond baked flat, pivoting at its base — one blit per sway, not 24 paths. */
const frondPivot = (len: number) => ({ ox: len * 0.12, oy: len * 0.42 });
function frondSprite(key: string, len: number, curl: number, color: string, lw: number, blurPx: number) {
  const S = ssFactor(D.W, D.H);
  const { ox, oy } = frondPivot(len);
  const pad = blurPx * 3;
  const w = (len * 1.20 + ox + pad) * S, h = (len * 0.90 + pad * 2) * S;
  return cachedSprite(key, w, h, `${len.toFixed(1)}|${curl}|${color}|${lw.toFixed(1)}|${blurPx}|${S.toFixed(2)}`, (c) => {
    c.scale(S, S);
    if (blurPx > 0) c.filter = `blur(${blurPx}px)`;
    frond(c, ox + pad / 2, oy + pad, len, 0, curl, color, lw);
    c.filter = "none";
  });
}
function drawFrondSprite(
  ctx: CanvasRenderingContext2D, sp: HTMLCanvasElement, len: number, blurPx: number,
  x: number, y: number, ang: number, flip: boolean,
) {
  const S = ssFactor(D.W, D.H);
  const { ox, oy } = frondPivot(len);
  const pad = blurPx * 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sp, -(ox + pad / 2), -(oy + pad), sp.width / S, sp.height / S);
  ctx.restore();
}

/* ── the soft buffer ─────────────────────────────────────────────────────── */
// Soft, low-frequency light — the ash plume, steam, mist, every bloom — is the
// most expensive thing in the frame, because each puff is a big alpha-blended
// upscale and the cost is paid per destination pixel. Measured on this device,
// forty of them cost about 45 ms; the entire rest of the frame costs under 2.
//
// So all of it is drawn once into a third-size scratch canvas and blitted up in
// a single pass. Nothing in here has an edge sharp enough to miss the
// resolution, and the frame gets roughly thirty milliseconds back.

const SOFT_S = 0.34;
let softCv: HTMLCanvasElement | null = null;
let softCtx: CanvasRenderingContext2D | null = null;

/** Clear the scratch buffer and return a context that takes CSS coordinates. */
function softOpen(W: number, H: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const w = Math.max(1, Math.round(W * SOFT_S)), h = Math.max(1, Math.round(H * SOFT_S));
  if (!softCv) { softCv = document.createElement("canvas"); softCtx = softCv.getContext("2d"); }
  if (!softCtx) return null;
  if (softCv.width !== w || softCv.height !== h) { softCv.width = w; softCv.height = h; }
  softCtx.setTransform(w / W, 0, 0, h / H, 0, 0);
  softCtx.globalCompositeOperation = "source-over";
  softCtx.globalAlpha = 1;
  softCtx.clearRect(0, 0, W, H);
  return softCtx;
}

/** Lay the buffer over the scene — additively for light, plainly for vapour. */
function softClose(ctx: CanvasRenderingContext2D, W: number, H: number, additive: boolean) {
  if (!softCv) return;
  ctx.save();
  if (additive) ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  ctx.drawImage(softCv, 0, 0, W, H);
  ctx.restore();
}

/* ── particle pools: filled once, reused forever ─────────────────────────── */

interface Ember { x: number; y: number; vx: number; vy: number; life: number }
const EMBER_POOL = 64;
function emberPool(fx: FxState): Ember[] {
  const a = fx.sparks as Ember[];
  while (a.length < EMBER_POOL) a.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  return a;
}
function spawnEmber(pool: Ember[], cap: number, x: number, y: number, vx: number, vy: number) {
  for (let i = 0; i < cap; i++) {
    const s = pool[i];
    if (s.life <= 0) { s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.life = 1; return; }
  }
}

/* ── the frame ───────────────────────────────────────────────────────────── */

export function drawDino({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 2) || !(H > 2)) return;
  const fY = clamp(floorY, H * 0.25, H * 0.98);
  setD(W, H, fY);
  const U = D.U, gh = D.gh;
  const still = calm();
  const mo = still ? 0.34 : 1;              // one motion scale, honestly applied
  const wind = (still ? 0.45 : 1) * breeze(t * (still ? 0.4 : 1));

  /* the hour, quantised so the bake only changes a handful of times a day */
  const k = dayLight(), warm = dayWarmth();
  const kB = Math.round(k * 8), wB = Math.round(warm * 6);
  if (PAL.k !== kB / 8 || PAL.w !== wB / 6) { PAL = makePal(kB / 8, wB / 6); LIVE = makeLive(PAL); }
  const night = PAL.night;
  // Deliberately NOT keyed on the quality tier: the tier flips as the device
  // warms up, and re-baking two full-screen supersampled layers on every flip
  // costs far more than the detail it saves. The bake is static art; only the
  // live passes scale with `detail()`.
  const variant = `${Math.round(fY)}|${kB}|${wB}`;

  const air = slot(fx, "dino.air", () => ({ drift: 0 }));
  air.drift += dt * (12 + wind * 22) * mo;

  /* eruption cycle: rumble → burst → drifting embers → fading glow */
  const er = slot(fx, "dino.erupt", () => ({ next: 22, k: 0, burst: false }));
  if (er.k <= 0 && t > er.next) { er.next = t + (still ? 46 : 26); er.k = 1; er.burst = false; }
  let erupt = 0;
  if (er.k > 0) {
    er.k = Math.max(0, er.k - dt / 6);
    const u = 1 - er.k;
    erupt = (u < 0.18 ? (u / 0.18) * 0.55 : Math.max(0, 1 - (u - 0.18) / 0.82)) * (still ? 0.45 : 1);
  }

  /* ── plane 1: sky ── */
  scene(ctx, "dino.sky", W, H, variant, paintDinoSky);

  /* stars, only once the light has gone out of the sky */
  if (k < 0.55) {
    const starA = clamp01((0.55 - k) / 0.5);
    const nStar = Math.max(8, detail(Math.round(30 * starA)));
    ctx.fillStyle = "#ffeacb";
    for (let i = 0; i < nStar; i++) {
      const sx = ((i * 389) % 1000) / 1000 * W;
      const sy = ((i * 211) % 1000) / 1000 * fY * 0.52;
      const tw = 0.35 + 0.5 * Math.abs(Math.sin(t * (still ? 0.3 : 0.8) + i * 2.3));
      ctx.globalAlpha = tw * (1 - sy / (fY * 0.7)) * starA;
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* meteors — a night thing, and rare */
    const shots = fx.shots;
    while (shots.length < 3) shots.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    if (!still && t - fx.lastShot > 9 && starA > 0.4) {
      fx.lastShot = t;
      const q = noise1(t * 0.37, 7);
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        if (s.life > 0) continue;
        s.x = W * (0.35 + Math.abs(q) * 0.6);
        s.y = H * (0.04 + Math.abs(noise1(t * 0.91, 3)) * 0.18);
        s.vx = -(300 + Math.abs(q) * 160);
        s.vy = 120 + Math.abs(q) * 70;
        s.life = 1;
        break;
      }
    }
    ctx.lineCap = "round";
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (s.life <= 0) continue;
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.1;
      if (s.x < -60) s.life = 0;
      if (s.life <= 0) continue;
      const tail = U * 0.13 * s.life;
      const ang = Math.atan2(s.vy, s.vx);
      ctx.globalAlpha = 0.8 * s.life * starA;
      ctx.strokeStyle = "#ffce96";
      ctx.lineWidth = Math.max(1.4, U * 0.004);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* pterodactyl crossing the ridge line, silhouetted against the sky */
  if (t - fx.lastFly > (still ? 20 : 13)) { fx.lastFly = t; fx.flyX = -0.18; }
  const flying = fx.flyX < 1.25;
  const ptx = fx.flyX * W;
  const pty = fY * (0.30 + Math.sin(t * 0.6 * mo) * 0.035);
  if (flying) {
    fx.flyX += dt * 0.075 * (still ? 0.7 : 1);
    const ps = U * 0.055;
    const beat = Math.sin(t * (still ? 3.0 : 5.2));
    const up = Math.max(0, beat), down = Math.max(0, -beat);
    ctx.save();
    ctx.translate(ptx, pty);
    ctx.rotate(beat * 0.05);
    ctx.fillStyle = LIVE.flyer;
    for (const side of [-1, 1]) {
      const tipY = -ps * (0.55 * up) + ps * (0.45 * down);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * ps * 0.7, -ps * 0.42 + tipY * 0.5, side * ps * 1.5, tipY);
      ctx.quadraticCurveTo(side * ps * 0.95, tipY + ps * 0.30, side * ps * 0.5, ps * 0.16);
      ctx.quadraticCurveTo(side * ps * 0.28, ps * 0.1, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = LIVE.rim;
      ctx.lineWidth = Math.max(1, ps * 0.035);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * ps * 0.7, -ps * 0.42 + tipY * 0.5, side * ps * 1.5, tipY);
      ctx.stroke();
    }
    ctx.fillStyle = LIVE.flyer;
    ctx.beginPath();
    ctx.ellipse(0, ps * 0.06, ps * 0.34, ps * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ps * 0.22, ps * 0.02);
    ctx.lineTo(ps * 0.78, ps * 0.12);
    ctx.lineTo(ps * 0.24, ps * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // head crest
    ctx.moveTo(ps * 0.2, -ps * 0.02);
    ctx.lineTo(-ps * 0.2, -ps * 0.30);
    ctx.lineTo(ps * 0.12, -ps * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // tail
    ctx.moveTo(-ps * 0.3, ps * 0.04);
    ctx.lineTo(-ps * 0.85, ps * 0.2);
    ctx.lineTo(-ps * 0.3, ps * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* sauropod ambling behind the jungle — only the neck clears the canopy */
  if (t - fx.fly2.last > (still ? 40 : 28)) { fx.fly2.last = t; fx.fly2.x = -0.4; }
  if (fx.fly2.x < 1.4) {
    fx.fly2.x += dt * 0.045 * (still ? 0.7 : 1);
    const dx4 = fx.fly2.x * W;
    const ds = U * 0.20;
    const step = Math.sin(t * 1.5 * mo);
    ctx.save();
    ctx.translate(dx4, fY + 4 + step * ds * 0.015);
    ctx.fillStyle = LIVE.sauropod;
    ctx.beginPath();
    ctx.ellipse(0, -ds * 0.6, ds * 0.9, ds * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    const neckSway = Math.sin(t * 0.8 * mo) * ds * 0.06;
    ctx.beginPath();
    ctx.moveTo(ds * 0.55, -ds * 0.75);
    ctx.quadraticCurveTo(ds * 0.95, -ds * 1.45, ds * 1.2 + neckSway, -ds * 1.8);
    ctx.quadraticCurveTo(ds * 1.34 + neckSway, -ds * 1.94, ds * 1.5 + neckSway, -ds * 1.88);
    ctx.quadraticCurveTo(ds * 1.34 + neckSway, -ds * 1.74, ds * 1.1 + neckSway, -ds * 1.5);
    ctx.quadraticCurveTo(ds * 0.86, -ds * 1.1, ds * 0.74, -ds * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-ds * 0.85, -ds * 0.65);
    ctx.quadraticCurveTo(-ds * 1.6, -ds * 0.6 + step * ds * 0.05, -ds * 2.05, -ds * 0.32);
    ctx.quadraticCurveTo(-ds * 1.5, -ds * 0.4, -ds * 0.85, -ds * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = LIVE.rimNeck;
    ctx.lineWidth = Math.max(1.2, ds * 0.022);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ds * 0.55, -ds * 0.78);
    ctx.quadraticCurveTo(ds * 0.95, -ds * 1.45, ds * 1.2 + neckSway, -ds * 1.8);
    ctx.moveTo(-ds * 0.7, -ds * 0.98);
    ctx.quadraticCurveTo(0, -ds * 1.12, ds * 0.55, -ds * 0.82);
    ctx.stroke();
    ctx.restore();
  }

  /* ── plane 2: the island ── */
  scene(ctx, "dino.isle", W, H, variant, paintDinoIsle);

  /* ── everything soft and vaporous, in one low-resolution pass ── */
  const soft = softOpen(W, H);
  if (soft) {
    /* ash plume: leans downwind, widens, and comes apart as it cools */
    const ash = puffSprite("dino.ash", ASH);
    const nAsh = Math.max(4, detail(9));
    for (let i = 0; i < nAsh; i++) {
      // packed towards the vent so the plume leaves the crater as a column and
      // only comes apart higher up, instead of showing as separate blobs
      const p = Math.pow((t * 0.06 * (still ? 0.34 : 1) + i / nAsh) % 1, 1.45);
      const rise = Math.pow(p, 0.82);
      const px = D.vX + rise * rise * (U * 0.10 + wind * U * 0.52) + noise1(t * 0.3 + i * 3.1, 5) * U * 0.03;
      const py = D.craterY + D.vH * 0.03 - rise * fY * 0.62;
      const pr2 = U * (0.032 + rise * 0.26);
      soft.globalAlpha = Math.min(0.42, (0.13 + erupt * 0.34) * (1 - p * 0.85) * 1.4 * (0.55 + PAL.k * 0.45));
      soft.drawImage(ash, px - pr2, py - pr2, pr2 * 2, pr2 * 2);
    }

    /* steam leaving the hot ground and the spring — it rises, the wind takes it */
    const steamCol = LIVE.steam;
    const steam = puffSprite("dino.steam", steamCol);
    const nSteam = Math.max(4, detail(9));
    for (let i = 0; i < nSteam; i++) {
      const src = i % 3;
      const sx0 = src === 0 ? D.poolX : src === 1 ? D.ventX - D.ventW * 0.45 : D.ventX + D.ventW * 0.45;
      const sy0 = src === 0 ? D.poolY - D.poolR * 0.1 : D.ventY;
      const p = ((t * 0.075 * (still ? 0.34 : 1) + i * 0.137) % 1);
      const rise = Math.pow(p, 0.72);
      // a fat column at the ground that comes apart as it climbs — steam, not sparks
      const sw = U * (0.075 + rise * 0.30) * (0.75 + ((i * 37) % 11) / 22);
      const sx = sx0 + rise * rise * wind * U * 0.36 + noise1(t * 0.4 + i * 5.3, 23) * U * 0.03;
      const sy = sy0 - rise * gh * 0.85 - rise * U * 0.16;
      soft.globalAlpha = (1 - p) * (1 - p) * (0.34 + PAL.k * 0.14);
      soft.drawImage(steam, sx - sw, sy - sw * 1.15, sw * 2, sw * 2.3);
    }

    /* mist bands between the jungle planes, carried by the same wind */
    const mist = puffSprite("dino.mist", steamCol);
    const nMist = Math.max(2, detail(4));
    for (let i = 0; i < nMist; i++) {
      const band = i % 2;
      const mw = W * (0.30 + (i % 3) * 0.12);
      const span = W + mw * 2;
      const mx = ((air.drift * (0.5 + band * 0.5) + i * 733) % span) - mw;
      const my = band ? D.midTop + U * 0.02 : fY + gh * 0.16;
      soft.globalAlpha = (band ? 0.16 : 0.13) * (0.6 + PAL.k * 0.5);
      soft.drawImage(mist, mx - mw / 2, my - mw * 0.09, mw, mw * 0.18);
    }
    soft.globalAlpha = 1;
    softClose(ctx, W, H, false);
  }

  /* undergrowth pushed by the wind; one clump at a time gets a real shove */
  const rust = slot(fx, "dino.rustle", () => ({ next: 6, which: 0, k: 0 }));
  if (t > rust.next) { rust.next = t + (still ? 16 : 9); rust.which = (rust.which + 1) % 3; rust.k = 1; }
  if (rust.k > 0) rust.k = Math.max(0, rust.k - dt * 0.9);
  const bushCol = LIVE.bush;
  for (let i = 0; i < 3; i++) {
    const bx2 = W * (0.30 + i * 0.22);
    const by2 = fY + gh * (0.22 + (i % 2) * 0.18);
    const bs = U * (0.05 + (i % 2) * 0.012);
    const sway = Math.sin(t * 0.9 * mo + i * 2.1) * 0.05 * wind * mo;
    const shake = i === rust.which ? Math.sin(t * 22 * mo) * 0.10 * rust.k * mo : 0;
    ctx.save();
    ctx.translate(bx2, by2);
    ctx.rotate(sway + shake);
    ctx.fillStyle = bushCol;
    for (let m = 0; m < 7; m++) {
      const a = Math.PI + (m / 6) * Math.PI;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * bs * 0.6, Math.sin(a) * bs * 0.35, bs * 0.42, bs * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = LIVE.bushLit;
    ctx.beginPath();
    ctx.ellipse(-bs * 0.35, -bs * 0.3, bs * 0.4, bs * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* dragonflies over the warm water */
  const nDf = Math.max(1, detail(2));
  for (let i = 0; i < nDf; i++) {
    const dfx = D.poolX + noise1(t * 0.5 * mo + i * 4, 71 + i) * D.poolR * 1.3;
    const dfy = D.poolY - D.poolR * 0.22 + noise1(t * 0.7 * mo + i * 9, 83 + i) * D.poolR * 0.3;
    const dsz = U * 0.012;
    ctx.save();
    ctx.translate(dfx, dfy);
    ctx.rotate(Math.sin(t * 0.9 * mo + i) * 0.3);
    ctx.fillStyle = "rgba(210,245,255,0.45)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(0, s * dsz * 0.3, dsz * 1.1, dsz * 0.28, s * Math.sin(t * 28 * mo + i) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#4fd0c0";
    ctx.beginPath();
    ctx.ellipse(0, 0, dsz * 0.9, dsz * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* the two nearest fronds lean on the breeze — the pair behind them is baked
     into the island layer, since two moving silhouettes sell the wind and four
     only cost more */
  const fLen = U * 0.50;
  const blurPx = richFx() ? 6 : 0;
  const fc = LIVE.frond;
  const fs1 = frondSprite("dino.frondA", fLen, 0.85, fc, Math.max(3, U * 0.02), blurPx);
  const gust = wind * 0.11 * mo;
  const s1 = Math.sin(t * 0.55 * mo) * gust, s2 = Math.sin(t * 0.43 * mo + 1.7) * gust;
  drawFrondSprite(ctx, fs1, fLen, blurPx, -U * 0.05, H + U * 0.02, -0.95 + s1, false);
  drawFrondSprite(ctx, fs1, fLen, blurPx, W + U * 0.05, H + U * 0.02, -(-0.95 + s2), true);

  /* ── the evening, laid over the finished scene ── */
  applyNight(ctx, W, H);

  /* ── everything hot, drawn after the night so the fire survives it ── */
  const pulse = 0.70 + (Math.sin(t * (still ? 0.6 : 1.7)) * 0.13 + Math.sin(t * 0.61 + 1.2) * 0.06) * mo
    + erupt * 0.6;
  const hotK = 0.30 + night * 0.70;   // the fire dominates once the sun is gone
  const hotPuff = puffSprite("dino.hot", HOT);
  const firePuff = puffSprite("dino.fire", FIRE);

  /* the broad light: crater halo, the glow the flow throws on the mountain and
     the trees, the terrace fissures, the shafts through the canopy, and the
     whole-sky flash of an eruption. All of it low-frequency, so all of it goes
     through the third-size buffer and comes back as one additive pass. */
  const hot = softOpen(W, H);
  if (hot) {
    if (erupt > 0.02) {
      const fr = Math.max(W, fY) * 1.15;
      hot.globalAlpha = 0.30 * erupt;
      hot.drawImage(hotPuff, D.vX - fr, D.craterY - fr * 0.75, fr * 2, fr * 1.5);
    }
    stamp(hot, hotPuff, D.vX, D.craterY - D.vH * 0.045, D.vW * (0.070 + erupt * 0.07), 0.55 * pulse * hotK);
    stamp(hot, hotPuff, D.vX, D.craterY - D.vH * 0.14, D.vW * 0.30, (0.24 + erupt * 0.4) * hotK);
    for (let i = 0; i < 4; i++) {
      const s = lavaAt(0.12 + i * 0.28, LP_A);
      stamp(hot, firePuff, s.x, s.y, U * (0.10 + i * 0.028),
        (0.26 - i * 0.042) * (0.7 + night * 0.4) + erupt * 0.12);
    }
    const tail0 = lavaAt(1, LP_A);
    stamp(hot, firePuff, tail0.x, tail0.y + U * 0.012, U * 0.22, (0.24 + erupt * 0.14) * (0.7 + night * 0.4));
    stamp(hot, firePuff, D.ventX, D.ventY + U * 0.012, D.ventW * 0.85,
      (0.16 + night * 0.22) * (0.85 + 0.15 * Math.sin(t * 0.9 * mo)));
    /* shafts through the canopy — only while the sun is high enough to make them */
    if (k > 0.45) {
      const shaft = shaftSprite();
      const lean = (1 - k) * 0.5;
      const nShaft = Math.max(2, detail(3));
      for (let i = 0; i < nShaft; i++) {
        const sx = W * (0.24 + i * 0.27);
        const sw2 = U * (0.16 + (i % 2) * 0.07);
        const sh2 = fY - D.midTop + gh * 0.5;
        hot.globalAlpha = (0.10 + 0.05 * Math.sin(t * 0.4 * mo + i * 2)) * clamp01((k - 0.45) / 0.35);
        hot.save();
        hot.translate(sx, D.midTop - U * 0.02);
        hot.rotate(lean);
        hot.drawImage(shaft, -sw2 / 2, 0, sw2, sh2);
        hot.restore();
      }
    }
    hot.globalAlpha = 1;
    softClose(ctx, W, H, true);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // What you actually see of the vent from down here is a sliver of molten
  // rock behind the broken rim, not a bowl of soup. Irregular on purpose — a
  // clean ellipse reads as a cup.
  ctx.save();
  craterPath(ctx);
  ctx.clip();
  ctx.globalAlpha = Math.min(1, 0.26 * pulse * hotK);
  ctx.fillStyle = "#ff8a30";
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = 1 + noise1(i * 0.83, 57) * 0.30;
    const x = D.vX + Math.cos(a) * D.rimW * 0.92 * rr;
    const y = D.craterY + D.vH * 0.052 + Math.sin(a) * D.vH * 0.030 * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = Math.min(1, (0.46 + erupt * 0.4) * hotK);
  ctx.fillStyle = "#ffd66f";
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = 1 + noise1(i * 1.31 + 4, 71) * 0.34;
    const x = D.vX - D.rimW * 0.06 + Math.cos(a) * D.rimW * 0.48 * rr;
    const y = D.craterY + D.vH * 0.056 + Math.sin(a) * D.vH * 0.017 * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  /* heat shimmer: soft columns of hot air wobbling above the rim, not lines */
  if (richFx()) {
    const hot = hotPuff;
    for (let i = 0; i < 2; i++) {
      const hx = D.vX + (i - 1) * D.rimW * 0.62 + noise1(t * 1.1 + i * 3.7, 29) * U * 0.018 * mo;
      const hy = D.craterY - U * (0.03 + i * 0.012);
      const hw = U * (0.07 + i * 0.012);
      ctx.globalAlpha = (0.07 + 0.03 * Math.sin(t * 1.9 * mo + i)) * hotK;
      ctx.drawImage(hot, hx - hw, hy - hw * 2.1, hw * 2, hw * 3.2);
    }
    ctx.globalAlpha = 1;
  }

  /* the lava run: one continuous channel, white-hot at the breach, cooling to
     a dull red before it slips behind the treeline */
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.rect(0, 0, W, D.lavaEndY + U * 0.008);
  ctx.clip();
  // The body is laid down as overlapping round-capped segments, each taking
  // its colour from where it sits along the run. Round caps at a spacing well
  // under their own width give one unbroken channel; the old version stroked
  // sixteen widely-spaced segments and got a string of beads.
  const NS = Math.max(22, detail(44));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < NS; i++) {
    const p0 = i / NS, p1 = (i + 1) / NS;
    const a = lavaAt(p0, LP_A), b = lavaAt(p1, LP_B);
    ctx.strokeStyle = LAVA_COLS[Math.min(LAVA_COLS.length - 1, (p0 * LAVA_COLS.length) | 0)];
    ctx.globalAlpha = Math.min(1, (0.88 + erupt * 0.12) * (1 - Math.pow(p0, 6)));
    ctx.lineWidth = a.w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Surface heat travelling downhill. Long wavelength, gentle swing, and the
  // same overlap, so the channel breathes along its length rather than pulsing
  // in chunks.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "#ffb347";
  for (let i = 0; i < NS; i++) {
    const p0 = i / NS, p1 = (i + 1) / NS;
    const a = lavaAt(p0, LP_A), b = lavaAt(p1, LP_B);
    const flow = 0.5 + 0.5 * Math.sin(p0 * 5.2 - t * (still ? 0.6 : 1.5));
    const cool = 1 - Math.pow(p0, 1.4);
    ctx.globalAlpha = (0.07 + 0.15 * flow) * cool * (0.7 + night * 0.3);
    ctx.lineWidth = a.w * (0.40 + flow * 0.30);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Crust folds. A sheet of lava wrinkles as it goes, and the wrinkles ride
  // downhill with it — without them the lower run is a flat orange bar.
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#5a1a08";
  const nFold = Math.max(4, detail(9));
  for (let i = 0; i < nFold; i++) {
    const q = ((t * (still ? 0.020 : 0.055) + i / nFold) % 1);
    const a = lavaAt(q, LP_A), b2 = lavaAt(Math.min(1, q + 0.012), LP_B);
    const dx2 = b2.x - a.x, dy2 = b2.y - a.y;
    const ln = Math.hypot(dx2, dy2) || 1;
    ctx.globalAlpha = 0.12 + 0.20 * q;
    ctx.lineWidth = Math.max(1, a.w * 0.11);
    ctx.beginPath();
    ctx.moveTo(a.x + dy2 / ln * a.w * 0.42, a.y - dx2 / ln * a.w * 0.42);
    ctx.quadraticCurveTo(a.x + dx2 / ln * a.w * 0.22, a.y + dy2 / ln * a.w * 0.22,
      a.x - dy2 / ln * a.w * 0.42, a.y + dx2 / ln * a.w * 0.42);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "lighter";

  // the white-hot mouth at the breach
  ctx.globalAlpha = Math.min(1, 0.45 * pulse * hotK);
  ctx.strokeStyle = "#fff2c4";
  ctx.lineWidth = lavaAt(0, LP_A).w * 0.46;
  ctx.beginPath();
  lavaSpine(ctx, 8, 0, 0.09);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.globalCompositeOperation = "lighter";


  /* embers: they rise because they are hot, and die when they cool */
  const pool = emberPool(fx);
  const cap = Math.max(10, detail(40));
  const rate = (5.5 + erupt * 40) * (still ? 0.35 : 1);
  const emitCarry = slot(fx, "dino.emit", () => ({ c: 0 }));
  emitCarry.c += dt * rate;
  while (emitCarry.c >= 1) {
    emitCarry.c -= 1;
    const j = noise1(t * 31.3 + emitCarry.c, 97);
    const a = -Math.PI / 2 + j * (0.5 + erupt * 0.5);
    const sp = U * (0.20 + Math.abs(noise1(t * 17.7, 41)) * 0.24) * (1 + erupt * 0.6);
    spawnEmber(pool, cap, D.vX + j * D.rimW * 0.9, D.craterY + D.vH * 0.02, Math.cos(a) * sp, Math.sin(a) * sp);
  }
  // the flow sheds them too
  const lavaEmit = slot(fx, "dino.emit2", () => ({ c: 0 }));
  lavaEmit.c += dt * (1.6 * (still ? 0.35 : 1));
  while (lavaEmit.c >= 1) {
    lavaEmit.c -= 1;
    const p = Math.abs(noise1(t * 13.1, 63));
    const s = lavaAt(p * 0.8, LP_A);
    spawnEmber(pool, cap, s.x, s.y, noise1(t * 7.7, 11) * U * 0.06, -U * (0.12 + Math.abs(noise1(t * 5.5, 19)) * 0.14));
  }
  if (er.k > 0 && !er.burst && 1 - er.k > 0.18) {
    er.burst = true;
    const n = Math.max(6, detail(16));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n - 0.5) * 1.55;
      const sp = U * (0.30 + ((i * 37) % 13) / 46) * (still ? 0.6 : 1);
      spawnEmber(pool, cap, D.vX + ((i % 5) - 2) * D.rimW * 0.3, D.craterY, Math.cos(a) * sp, Math.sin(a) * sp);
    }
  }
  for (let i = 0; i < cap; i++) {
    const s = pool[i];
    if (s.life <= 0) continue;
    s.vy += U * 0.62 * dt;            // gravity wins eventually
    s.vy -= U * 0.30 * dt * s.life;   // but hot air lifts them while they burn
    s.vx += wind * U * 0.09 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.5;
    if (s.y > fY + gh * 0.2) s.life = 0;
    if (s.life <= 0) continue;
    // A short streak along its own velocity, not a dot: a rising ember is a
    // moving spark. Sizes and brightnesses are spread by the pool index so no
    // two match — uniform particles always read as UI, never as fire. It cools
    // as it climbs, pale gold at the vent through orange to a dying red, and
    // the wind pushes it sideways exactly as it pushes the plume.
    const vary = 0.55 + ((i * 41) % 17) / 17;
    const heat = s.life * s.life;
    // The streak is measured against a fixed 60 Hz step and then capped, so a
    // slow frame cannot stretch an ember into a firework tracer.
    const sp2 = Math.hypot(s.vx, s.vy) || 1;
    const tr3 = Math.min(U * 0.013, sp2 / 60 * 1.6) / sp2;
    ctx.globalAlpha = Math.min(1, s.life * 1.05) * (0.34 + night * 0.5) * (0.55 + vary * 0.45);
    ctx.strokeStyle = heat > 0.62 ? "#ffbe6a" : heat > 0.30 ? "#ff8f3c" : "#dd4a26";
    ctx.lineWidth = U * (0.0015 + heat * 0.0026) * vary;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * tr3, s.y - s.vy * tr3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* ash-fall glow: the fine stuff still cooling as it drifts down the valley */
  const nDrift = Math.max(4, detail(10));
  for (let i = 0; i < nDrift; i++) {
    const p = ((t * 0.05 * (still ? 0.5 : 1) + i / nDrift) % 1);
    const ex = (((i * 443) % 1000) / 1000) * W + Math.sin(t * 0.7 * mo + i * 2.7) * U * 0.04 + p * wind * U * 0.18;
    const ey = fY - p * fY * 0.7;
    ctx.globalAlpha = (1 - p) * (1 - p) * 0.6 * (0.5 + night * 0.6);
    ctx.fillStyle = i % 3 ? "#ffa855" : "#ef6a34";
    ctx.beginPath();
    ctx.arc(ex, ey, U * (0.0018 + ((i * 29) % 7) * 0.0007), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* fireflies — they only come out once the light has gone */
  if (k < 0.55) {
    const flyA = clamp01((0.55 - k) / 0.4);
    const flyPuff = puffSprite("dino.fly", GLOW_FLY);
    const nFly = Math.max(3, detail(Math.round(12 * flyA)));
    for (let i = 0; i < nFly; i++) {
      const edge = i % 2 ? 0.05 + ((i * 13) % 26) / 100 : 0.95 - ((i * 17) % 26) / 100;
      const fx5 = edge * W + Math.sin(t * 0.6 * mo + i * 2.4) * U * 0.05;
      const fy3 = fY - U * 0.03 + Math.sin(t * 1.2 * mo + i) * U * 0.03 + ((i * 173) % 100) / 100 * gh * 0.75;
      const blink = Math.max(0, Math.sin(t * (still ? 0.9 : 1.8) + i * 2.7));
      if (blink < 0.35) continue;
      stamp(ctx, flyPuff, fx5, fy3, U * 0.018, (blink - 0.35) * 1.4 * flyA);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* the pterodactyl's shadow sweeping the jungle floor */
  if (flying && ptx > -U * 0.2 && ptx < W + U * 0.2 && k > 0.25) {
    ctx.save();
    ctx.globalAlpha = 0.16 * clamp01((k - 0.25) / 0.4);
    ctx.fillStyle = "#0a1a12";
    const beat = Math.sin(t * (still ? 3.0 : 5.2));
    ctx.beginPath();
    ctx.ellipse(ptx + U * 0.06, fY + gh * 0.34, U * 0.075 * (1 - Math.abs(beat) * 0.25), U * 0.014, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
