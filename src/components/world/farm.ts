// ─── SUNNY FARM world theme ─────────────────────────────────────────────────
// A golden-hour storybook meadow with real depth:
//   far mountains → rolling hills → hedgerows & tree line → crop rows in
//   perspective → farmyard props → swaying meadow in the foreground.
//
// Two things buy the extra detail:
//  1. every static pixel is baked once into two supersampled offscreen layers
//     ("farm.sky" behind the clouds, "farm.land" in front of them), so a frame
//     costs two blits plus the animated set-dressing;
//  2. one coherent WIND FIELD (gust pulses travelling left→right) drives the
//     grass, wheat, tree line, windmill, washing line and butterflies together,
//     which is what makes a procedural landscape feel alive instead of loopy.

import {
  cachedSprite, mulberry32, fbm1, noise1, detail, richFx, quality,
  bloom, vGrad, grade, vignette, slot, lerp, clamp, clamp01,
  dayLight, dayWarmth, applyNight, applySeason,
  type ThemeFrame, type FxState,
} from "./shared";

/* ── the time of day ──────────────────────────────────────────────────────────
   Snapshotted once per frame into module scope so the *baked* painters can
   read it without threading an argument through every helper. The bake key
   carries the same value, so a layer is only ever repainted when the light
   actually moves a step. */

let DAY = 1;    // 0 = deep night, 1 = full midday
let WARM = 0;   // 1 at golden hour

/** Mix two "#rrggbb" strings. Bake time only — never called in the draw loop. */
function mix(a: string, b: string, k: number): string {
  const ai = parseInt(a.slice(1), 16), bi = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((ai >> 16) & 255, (bi >> 16) & 255, k));
  const g = Math.round(lerp((ai >> 8) & 255, (bi >> 8) & 255, k));
  const l = Math.round(lerp(ai & 255, bi & 255, k));
  return `rgb(${r},${g},${l})`;
}

/** night → golden hour → midday, picked by the shared clock. */
const ramp = (night: string, gold: string, day: string, D = DAY) =>
  D < 0.5 ? mix(night, gold, D * 2) : mix(gold, day, (D - 0.5) * 2);

/** The same ramp, carrying an explicit alpha — for glows and hazes. */
const rampA = (night: string, gold: string, day: string, alpha: number, D = DAY) =>
  `rgba(${ramp(night, gold, day, D).slice(4, -1)},${alpha})`;

/* ── motion preference ────────────────────────────────────────────────────── */

let reduced: boolean | null = null;
/** True when the viewer asked for less motion — the farm slows, never stops. */
function calm(): boolean {
  if (reduced === null) {
    const mq = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    reduced = !!mq?.matches;
    mq?.addEventListener?.("change", (e) => { reduced = e.matches; });
  }
  return reduced;
}

/* ── dither: the cure for 8-bit banding in a 600px sky gradient ───────────── */

/** 256² of white noise, mid-grey centred so `overlay` leaves the tone alone. */
function grainTile(): HTMLCanvasElement {
  return cachedSprite("fx.grain", 256, 256, "v1", (c, w, h) => {
    const r = mulberry32(19283);
    const img = c.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + Math.round((r() - 0.5) * 78);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

/** Break up a smooth gradient with one pattern fill. Bake time only. */
function dither(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount = 0.5) {
  const pat = c.createPattern(grainTile(), "repeat");
  if (!pat) return;
  c.save();
  c.globalCompositeOperation = "overlay";
  c.globalAlpha = amount;
  c.fillStyle = pat;
  c.fillRect(x, y, w, h);
  c.restore();
}

/* ── baked-layer plumbing ─────────────────────────────────────────────────── */

/** Supersample factor for baked scenery: crisp on retina, capped for memory. */
function ssFactor(W: number, H: number) {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, dpr, Math.sqrt(4.2e6 / Math.max(1, W * H))));
}

/**
 * Paint `paint` once into an offscreen canvas (authored in CSS pixels) and blit
 * it. `S` is handed to the painter because canvas filters are measured in
 * device pixels — blur radii have to be scaled to stay art-directed.
 */
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

/* ── the wind system ──────────────────────────────────────────────────────── */

/** Global gust strength: a slow swell with sharper pulses riding on top. */
const gustNow = (t: number) =>
  0.40 + 0.32 * (noise1(t * 0.23, 7) * 0.5 + 0.5) + 0.46 * Math.max(0, noise1(t * 0.63, 29));

/** Gusts travel across the field, so props bend in a wave, never in unison. */
const windAt = (t: number, x: number, W: number) =>
  gustNow(t) * (0.72 + 0.28 * Math.sin((x / Math.max(1, W)) * 4.6 - t * 2.1));

/* ── shared geometry: painters and live props read the same numbers ───────── */

const P = {
  W: 0, H: 0, fY: 0, U: 0, gh: 0,
  sunX: 0, sunY: 0, sunR: 0,
  mtn: 0, hillFar: 0, hillMid: 0, field: 0,
  wmX: 0, wmBase: 0, wmH: 0, hubY: 0,
  barnX: 0, barnY: 0, barnW: 0, vaneY: 0,
  siloX: 0, siloW: 0, siloH: 0,
  pondX: 0, pondY: 0, pondR: 0,
  lineX0: 0, lineX1: 0, lineY: 0,
};

const mtnFarY = (u: number) =>
  P.mtn - Math.pow(clamp(1 - Math.abs(fbm1(u * 3.4 + 1.1, 4, 3)), 0, 1), 3) * P.fY * 0.20 - P.fY * 0.012;
const mtnNearY = (u: number) =>
  P.mtn + P.fY * 0.030 - Math.pow(clamp(1 - Math.abs(fbm1(u * 4.3 + 7.7, 4, 19)), 0, 1), 3) * P.fY * 0.145;
const hillFarY = (u: number) => P.hillFar - (fbm1(u * 2.3 + 4.2, 3, 31) * 0.5 + 0.50) * P.fY * 0.075;
const hillMidY = (u: number) => P.hillMid - (fbm1(u * 1.8 + 9.1, 3, 47) * 0.5 + 0.52) * P.fY * 0.085;
const fieldTopY = (u: number) => P.field + Math.sin(u * 3.3 + 1.1) * P.fY * 0.014;

function setProps(W: number, H: number, fY: number) {
  const U = Math.min(W, H);
  P.W = W; P.H = H; P.fY = fY; P.U = U; P.gh = Math.max(1, H - fY);
  // the sun climbs with the day: low and fat at golden hour, high at noon
  const el = DAY * DAY * (3 - 2 * DAY);
  P.sunX = W * 0.155;
  P.sunY = lerp(fY * 0.66, Math.min(H * 0.15, fY * 0.26), el);
  P.sunR = U * (0.06 + (1 - el) * 0.014);
  P.mtn = fY * 0.745;
  P.hillFar = fY * 0.805;
  P.hillMid = fY * 0.875;
  P.field = fY * 0.905;
  P.wmH = U * 0.19;
  P.wmX = W * 0.115;
  P.wmBase = hillMidY(0.115) + fY * 0.012;
  P.hubY = P.wmBase - P.wmH * 0.93;
  P.barnW = U * 0.175; P.barnX = W * 0.795; P.barnY = fY - fY * 0.008;
  P.vaneY = P.barnY - P.barnW * 0.74 - P.barnW * 0.42;
  P.siloW = P.barnW * 0.36; P.siloH = P.barnW * 1.22; P.siloX = P.barnX + P.barnW * 0.82;
  P.lineX0 = P.barnX - P.barnW * 1.55; P.lineX1 = P.barnX - P.barnW * 0.52;
  P.lineY = P.barnY - P.barnW * 0.52;
  P.pondR = Math.min(U * 0.15, W * 0.19);
  P.pondX = W * 0.115; P.pondY = fY + P.gh * 0.46;
}

/** The crop field: a trapezoid opening toward the viewer (right of the pasture). */
function fieldPath(c: CanvasRenderingContext2D) {
  const { W, fY } = P;
  c.beginPath();
  c.moveTo(W * 0.34, fieldTopY(0.34));
  for (let u = 0.34; u <= 1.001; u += 0.055) c.lineTo(W * Math.min(u, 1), fieldTopY(Math.min(u, 1)));
  c.lineTo(W * 1.02, fY + 2);
  c.lineTo(W * 0.02, fY + 2);
  c.closePath();
}

/* ── terrain painting helpers (bake time only) ────────────────────────────── */

function terrain(
  c: CanvasRenderingContext2D, W: number, base: number,
  fn: (u: number) => number, fill: string | CanvasGradient, step = 7,
) {
  c.beginPath();
  c.moveTo(0, fn(0));
  for (let x = step; x < W; x += step) c.lineTo(x, fn(x / W));
  c.lineTo(W, fn(1));
  c.lineTo(W, base);
  c.lineTo(0, base);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Golden-hour rim light along a ridge line. */
function rimLight(
  c: CanvasRenderingContext2D, W: number,
  fn: (u: number) => number, color: string, lw: number, dy: number, step = 7,
) {
  c.beginPath();
  c.moveTo(0, fn(0) + dy);
  for (let x = step; x < W; x += step) c.lineTo(x, fn(x / W) + dy);
  c.lineTo(W, fn(1) + dy);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
}

/** A little bushy tree used for hedgerows and tree lines. */
function bushyTree(c: CanvasRenderingContext2D, x: number, y: number, r: number, dark: string, lit: string) {
  c.fillStyle = dark;
  c.beginPath();
  c.arc(x, y - r * 0.55, r, 0, Math.PI * 2);
  c.arc(x - r * 0.75, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
  c.arc(x + r * 0.78, y - r * 0.2, r * 0.66, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = lit;
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.95, r * 0.52, 0, Math.PI * 2);
  c.fill();
}

/* ── layer A: the sky (behind the clouds) ─────────────────────────────────── */

function paintSky(c: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const { fY, sunX, sunY } = P;
  const D = DAY;
  const night = 1 - D;

  // six stops rather than four: the extra anchors keep the mid-sky from
  // collapsing into one long ramp, which is where the banding used to live.
  c.fillStyle = vGrad(c, 0, fY, [
    [0.00, ramp("#03071c", "#2a67ab", "#4fb2f0")],
    [0.20, ramp("#060d2c", "#4a86c4", "#6dc3f4")],
    [0.42, ramp("#0c1740", "#83aedb", "#9bd9f7")],
    [0.64, ramp("#152250", "#d7b39a", "#c4e7f7")],
    [0.84, ramp("#1e2b5c", "#ffb277", "#e6f2ec")],
    [1.00, ramp("#2a3768", "#ffd7a2", "#ffeec4")],
  ]);
  c.fillRect(0, 0, W, fY + 2);
  c.fillStyle = ramp("#2a3768", "#ffd7a2", "#ffeec4");
  c.fillRect(0, fY, W, Math.max(0, H - fY));

  /* stars, and a whisper of milky way — only worth painting after dusk */
  if (night > 0.04) {
    const sr = mulberry32(8080);
    c.save();
    // the galaxy band, leaning across the upper sky
    c.globalAlpha = night * 0.16;
    c.save();
    c.translate(W * 0.62, fY * 0.24);
    c.rotate(-0.5);
    const mw = c.createLinearGradient(0, -fY * 0.16, 0, fY * 0.16);
    mw.addColorStop(0, "rgba(150,170,255,0)");
    mw.addColorStop(0.5, "rgba(196,206,255,0.9)");
    mw.addColorStop(1, "rgba(150,170,255,0)");
    c.fillStyle = mw;
    c.fillRect(-W, -fY * 0.16, W * 2, fY * 0.32);
    c.restore();
    for (let i = 0; i < 190; i++) {
      const x = sr() * W;
      const y = Math.pow(sr(), 1.25) * fY * 0.86;
      const b = sr();
      // stars thin out toward the horizon haze, exactly as they do outdoors
      const fade = 1 - clamp01((y / fY - 0.5) / 0.42);
      c.globalAlpha = night * (0.25 + b * 0.7) * fade;
      c.fillStyle = b > 0.86 ? "#ffe9c0" : b > 0.6 ? "#dfe8ff" : "#ffffff";
      const r = (0.5 + b * b * 1.5) * (S > 1.4 ? 1 : 0.9);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      if (b > 0.95) {                       // a cross flare on the brightest few
        c.globalAlpha = night * 0.4 * fade;
        c.fillRect(x - r * 3.4, y - r * 0.22, r * 6.8, r * 0.44);
        c.fillRect(x - r * 0.22, y - r * 3.4, r * 0.44, r * 6.8);
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }

  // sun haze — baked so the live sun only pays for its disc and bloom
  if (D > 0.03) {
    const haze = c.createRadialGradient(sunX, sunY, P.sunR * 0.4, sunX, sunY, P.sunR * 7);
    haze.addColorStop(0, `rgba(255,238,170,${(0.60 * (0.4 + D * 0.6)).toFixed(3)})`);
    haze.addColorStop(0.45, `rgba(255,${Math.round(231 - WARM * 40)},163,${(0.22 * (0.4 + D * 0.6)).toFixed(3)})`);
    haze.addColorStop(1, "rgba(255,225,150,0)");
    c.fillStyle = haze;
    c.fillRect(sunX - P.sunR * 7, sunY - P.sunR * 7, P.sunR * 14, P.sunR * 14);
  }

  /* god rays fanning down from the sun — they fan flat when the sun is low,
     and there are none at all once it has set */
  if (D > 0.08) {
    c.save();
    if (richFx()) c.filter = `blur(${(10 * S).toFixed(1)}px)`;
    c.globalCompositeOperation = "lighter";
    c.translate(sunX, sunY);
    const el = D * D * (3 - 2 * D);
    c.rotate(0.18 + el * 0.42);
    const rayLen = Math.max(W, H) * 1.1;
    for (let i = 0; i < 7; i++) {
      const a = -0.55 + i * 0.185;
      const wSpread = 0.026 + (i % 3) * 0.016;
      const gr = c.createLinearGradient(0, 0, Math.cos(a) * rayLen, Math.sin(a) * rayLen);
      gr.addColorStop(0, `rgba(255,${Math.round(244 - WARM * 26)},196,${((0.12 + (i % 2) * 0.045) * D).toFixed(3)})`);
      gr.addColorStop(1, "rgba(255,244,196,0)");
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - wSpread) * rayLen, Math.sin(a - wSpread) * rayLen);
      c.lineTo(Math.cos(a + wSpread) * rayLen, Math.sin(a + wSpread) * rayLen);
      c.closePath();
      c.fill();
    }
    c.filter = "none";
    c.restore();
  }

  /* pale static cloud banks: two shelves, the higher one thinner and fainter,
     so the empty middle of the sky reads as distance instead of paint */
  c.save();
  if (richFx()) c.filter = `blur(${(6 * S).toFixed(1)}px)`;
  const rnd = mulberry32(4242);
  const bankCol = ramp("#7d88c4", "#ffd3ad", "#ffffff");
  for (let i = 0; i < 26; i++) {
    const hi = i >= 14;                      // the upper, more distant shelf
    const x = rnd() * W;
    const y = hi ? fY * (0.40 + rnd() * 0.16) : fY * (0.60 + rnd() * 0.14);
    const rw = W * (hi ? 0.05 + rnd() * 0.07 : 0.06 + rnd() * 0.09);
    c.globalAlpha = (0.16 + rnd() * 0.16) * (hi ? 0.6 : 1) * (0.3 + D * 0.7);
    c.fillStyle = bankCol;
    c.beginPath();
    c.ellipse(x, y, rw, rw * (hi ? 0.11 : 0.16), 0, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = "none";
  c.globalAlpha = 1;
  c.restore();

  // horizon glow: warm under the sun, a cold blue afterglow once it is gone
  c.fillStyle = vGrad(c, fY * 0.66, fY + 2, [
    [0, rampA("#1d2a5e", "#ffcf9e", "#fff1cd", 0)],
    [0.55, rampA("#22305f", "#ffc590", "#fff0c8", 0.26)],
    [1, rampA("#2b3a72", "#ffb87e", "#fff2c4", 0.75)],
  ]);
  c.fillRect(0, fY * 0.66, W, fY - fY * 0.66 + 2);

  // and finally the dither, which is what actually kills the banding
  dither(c, 0, 0, W, fY + 2, 0.15);
}

/* ── layer B: the land (in front of the clouds) ───────────────────────────── */

function paintLand(c: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const { fY, U } = P;
  const rnd = mulberry32(90210);
  const D = DAY;

  /* distant mountain ranges — bluer and flatter as the light goes */
  terrain(c, W, P.mtn + fY * 0.08, mtnFarY, vGrad(c, P.mtn - fY * 0.20, P.mtn + fY * 0.02, [
    [0, ramp("#41508a", "#b9b7d8", "#c3d4ec")], [1, ramp("#2f3c70", "#93a0c8", "#9fb6da")],
  ]));
  rimLight(c, W, mtnFarY, rampA("#8fa4e0", "#ffd7a8", "#fff3d6", 0.2 + D * 0.4), Math.max(1, U * 0.004), U * 0.002);
  terrain(c, W, P.mtn + fY * 0.10, mtnNearY, vGrad(c, P.mtn - fY * 0.11, P.mtn + fY * 0.05, [
    [0, ramp("#2d3a72", "#8497c4", "#93b0d6")], [1, ramp("#25305f", "#6f83b4", "#7d9ec9")],
  ]));
  rimLight(c, W, mtnNearY, rampA("#93a8ea", "#ffcf9a", "#ffebba", 0.22 + D * 0.42), Math.max(1, U * 0.004), U * 0.0025);
  // haze pooling at the foot of the range
  c.fillStyle = vGrad(c, P.mtn - fY * 0.09, P.hillFar + fY * 0.01, [
    [0, rampA("#3a4784", "#ffdcb4", "#fff4d6", 0)],
    [0.5, rampA("#3a4784", "#ffdcb4", "#fff4d6", 0.36)],
    [1, rampA("#414e90", "#ffe0bd", "#fff6de", 0.85)],
  ]);
  c.fillRect(0, P.mtn - fY * 0.09, W, P.hillFar - P.mtn + fY * 0.10);

  /* far rolling hills */
  terrain(c, W, P.hillFar + fY * 0.10, hillFarY, vGrad(c, P.hillFar - fY * 0.075, P.hillFar + fY * 0.05, [
    [0, "#c2e9a4"], [1, "#95cc85"],
  ]));
  rimLight(c, W, hillFarY, rampA("#9db2f0", "#ffe8b8", "#fffacd", 0.22 + D * 0.53), Math.max(1, U * 0.005), U * 0.002);
  // tree line marching along the far ridge
  for (let i = 0; i < 46; i++) {
    const u = rnd();
    const r = U * (0.007 + rnd() * 0.006);
    bushyTree(c, u * W, hillFarY(u) + r * 0.6, r, "#7ab473", "#a4d68f");
  }

  /* mid hills + hedgerows */
  terrain(c, W, P.hillMid + fY * 0.12, hillMidY, vGrad(c, P.hillMid - fY * 0.085, P.hillMid + fY * 0.07, [
    [0, "#a9de7c"], [1, "#6fb551"],
  ]));
  rimLight(c, W, hillMidY, rampA("#a6b8f4", "#ffe0a0", "#fff8ba", 0.24 + D * 0.61), Math.max(1.2, U * 0.006), U * 0.0025);
  c.save();
  c.beginPath();
  c.moveTo(0, hillMidY(0));
  for (let x = 0; x < W; x += 7) c.lineTo(x, hillMidY(x / W));
  c.lineTo(W, hillMidY(1));
  c.lineTo(W, fY + 2); c.lineTo(0, fY + 2);
  c.closePath();
  c.clip();
  // field-boundary hedgerows contouring the hillside
  c.strokeStyle = "rgba(72,140,64,0.55)";
  for (let k = 0; k < 3; k++) {
    const off = fY * (0.018 + k * 0.022);
    c.beginPath();
    c.moveTo(0, hillMidY(0) + off);
    for (let x = 0; x < W; x += 9) c.lineTo(x, hillMidY(x / W) + off + Math.sin(x * 0.011 + k) * U * 0.004);
    c.lineWidth = Math.max(1.2, U * (0.006 - k * 0.001));
    c.stroke();
  }
  // sun-warmed grass speckle
  for (let i = 0; i < 260; i++) {
    const u = rnd();
    const y = hillMidY(u) + rnd() * fY * 0.10;
    c.fillStyle = rnd() > 0.5 ? "rgba(255,255,220,0.16)" : "rgba(60,120,50,0.14)";
    c.fillRect(u * W, y, U * 0.012, U * 0.0035);
  }
  c.restore();
  for (let i = 0; i < 26; i++) {
    const u = rnd();
    const r = U * (0.011 + rnd() * 0.010);
    bushyTree(c, u * W, hillMidY(u) + r * 0.7, r, "#5aa249", "#8ecb6a");
  }

  /* the crop field: rows converging toward the horizon */
  c.save();
  fieldPath(c);
  c.clip();
  const rows = 30;
  for (let k = 0; k < rows; k++) {
    const t0 = k / rows, t1 = (k + 1) / rows;
    const xT0 = lerp(W * 0.33, W * 1.02, t0), xT1 = lerp(W * 0.33, W * 1.02, t1);
    const xB0 = lerp(-W * 0.30, W * 1.55, t0), xB1 = lerp(-W * 0.30, W * 1.55, t1);
    c.fillStyle = k % 2 ? "#e9bf52" : "#f5d574";
    c.beginPath();
    c.moveTo(xT0, P.field - fY * 0.03);
    c.lineTo(xT1, P.field - fY * 0.03);
    c.lineTo(xB1, fY + 4);
    c.lineTo(xB0, fY + 4);
    c.closePath();
    c.fill();
    // furrow shadow on the near half of each row
    c.strokeStyle = "rgba(150,105,32,0.30)";
    c.lineWidth = Math.max(0.8, U * 0.0035);
    c.beginPath();
    c.moveTo(xT0, P.field);
    c.lineTo(xB0, fY + 4);
    c.stroke();
  }
  // stubble texture + distance haze inside the field
  for (let i = 0; i < 420; i++) {
    const yy = P.field + Math.pow(rnd(), 1.6) * (fY - P.field);
    c.fillStyle = rnd() > 0.5 ? "rgba(255,246,200,0.35)" : "rgba(160,116,40,0.25)";
    c.fillRect(rnd() * W, yy, U * 0.008, U * 0.003);
  }
  c.fillStyle = vGrad(c, P.field - fY * 0.02, fY, [
    [0, rampA("#5a68a8", "#ffdcae", "#fff3ce", 0.85)],
    [0.5, rampA("#5a68a8", "#ffdcae", "#fff3ce", 0.18)],
    [1, rampA("#5a68a8", "#ffdcae", "#fff3ce", 0)],
  ]);
  c.fillRect(0, P.field - fY * 0.02, W, fY - P.field + fY * 0.02);
  c.restore();

  /* pasture strip left of the crop (keeps the composition from tiling) */
  c.save();
  c.beginPath();
  c.moveTo(0, P.field - fY * 0.01);
  c.lineTo(W * 0.345, fieldTopY(0.345));
  c.lineTo(W * 0.03, fY + 2);
  c.lineTo(0, fY + 2);
  c.closePath();
  c.fillStyle = vGrad(c, P.field, fY, [[0, "#8bc95f"], [1, "#69ae45"]]);
  c.fill();
  c.restore();

  /* hedgerow along the far edge of the field */
  for (let i = 0; i < 40; i++) {
    const u = 0.30 + rnd() * 0.72;
    if (u > 1.02) continue;
    const r = U * (0.010 + rnd() * 0.008);
    bushyTree(c, u * W, fieldTopY(Math.min(u, 1)) + r * 0.3, r, "#4f9743", "#7cc25f");
  }

  paintFarmyard(c, W, rnd);

  /* the meadow the creatures play on */
  c.fillStyle = vGrad(c, fY, H, [[0, "#84cf51"], [0.55, "#63b23e"], [1, "#43902d"]]);
  c.fillRect(0, fY, W, Math.max(0, H - fY));
  // hot rim where the meadow catches the low sun
  c.fillStyle = vGrad(c, fY - U * 0.006, fY + U * 0.05, [
    [0, rampA("#7a8ad0", "#ffd79a", "#fff7ba", 0.3 + D * 0.55)],
    [0.25, rampA("#7a8ad0", "#ffd08a", "#fff0a0", (0.3 + D * 0.55) * 0.41)],
    [1, rampA("#7a8ad0", "#ffd08a", "#fff0a0", 0)],
  ]);
  c.fillRect(0, fY - U * 0.006, W, U * 0.06);
  // baked undergrowth so the live blades read as a dense meadow
  const gh = Math.max(1, H - fY);
  c.lineCap = "round";
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W;
    const y = fY + Math.pow(rnd(), 0.72) * gh;
    const d = (y - fY) / gh;
    const bl = U * (0.014 + d * 0.034);
    const bend = (rnd() - 0.5) * bl * 0.9;
    c.strokeStyle = d > 0.5 ? "rgba(34,98,26,0.55)" : "rgba(60,142,42,0.45)";
    c.lineWidth = Math.max(0.8, U * (0.0022 + d * 0.0032));
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + bend * 0.4, y - bl * 0.6, x + bend, y - bl);
    c.stroke();
  }
  // a soft cart track curving off toward the barn
  c.strokeStyle = "rgba(196,168,104,0.30)";
  c.lineWidth = U * 0.05;
  c.beginPath();
  c.moveTo(W * 0.62, fY + 2);
  c.quadraticCurveTo(W * 0.78, fY + gh * 0.45, W * 1.02, fY + gh * 0.72);
  c.stroke();

  paintMeadowProps(c, W, rnd);

  /* soft out-of-focus tufts framing the bottom corners */
  c.save();
  if (richFx()) c.filter = `blur(${(5 * S).toFixed(1)}px)`;
  c.fillStyle = "rgba(30,88,26,0.75)";
  for (const side of [0, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = side === 0 ? W * (0.005 + i * 0.018) : W * (0.995 - i * 0.018);
      const bh = U * (0.07 + ((i * 37) % 10) / 10 * 0.07);
      c.beginPath();
      c.moveTo(x - U * 0.012, H + 2);
      c.quadraticCurveTo(x + (side ? -1 : 1) * U * 0.02, H - bh * 0.6, x + (side ? -1 : 1) * U * 0.05, H - bh);
      c.quadraticCurveTo(x + (side ? -1 : 1) * U * 0.012, H - bh * 0.5, x + U * 0.014, H + 2);
      c.closePath();
      c.fill();
    }
  }
  c.filter = "none";
  c.restore();

}

/* ── baked farmyard: barn, silo, windmill tower, fences, hay, scarecrow ───── */

function paintFarmyard(c: CanvasRenderingContext2D, W: number, rnd: () => number) {
  const { fY, U } = P;

  /* hay bales dotted across the stubble */
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    const x = lerp(W * 0.40, W * 0.97, k) + (rnd() - 0.5) * W * 0.04;
    const y = lerp(P.field + fY * 0.018, fY - fY * 0.004, k * k);
    const r = lerp(U * 0.016, U * 0.036, k * k);
    c.fillStyle = "rgba(90,70,30,0.20)";
    c.beginPath();
    c.ellipse(x, y + r * 0.05, r * 1.15, r * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8c163";
    c.beginPath();
    c.ellipse(x, y - r * 0.55, r, r * 0.62, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(160,116,40,0.55)";
    c.lineWidth = Math.max(0.8, r * 0.07);
    for (let k2 = -1; k2 <= 1; k2++) {
      c.beginPath();
      c.ellipse(x, y - r * 0.55, r * (0.4 + k2 * 0.28), r * 0.6, 0, -Math.PI * 0.85, Math.PI * 0.85);
      c.stroke();
    }
    c.fillStyle = "rgba(255,246,198,0.5)";
    c.beginPath();
    c.ellipse(x - r * 0.3, y - r * 0.8, r * 0.42, r * 0.2, -0.35, 0, Math.PI * 2);
    c.fill();
  }

  /* scarecrow standing watch in the crop */
  const scX = W * 0.56, scY = P.field + fY * 0.035, sc = U * 0.055;
  c.save();
  c.translate(scX, scY);
  c.strokeStyle = "#9a6b3a";
  c.lineWidth = Math.max(1.4, sc * 0.11);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(0, -sc * 1.5);
  c.moveTo(-sc * 0.6, -sc * 1.05); c.lineTo(sc * 0.6, -sc * 1.05);
  c.stroke();
  c.fillStyle = "#5fa9d8";
  c.beginPath();
  c.moveTo(-sc * 0.52, -sc * 1.12);
  c.lineTo(sc * 0.52, -sc * 1.12);
  c.lineTo(sc * 0.34, -sc * 0.5);
  c.lineTo(-sc * 0.34, -sc * 0.5);
  c.closePath();
  c.fill();
  c.fillStyle = "#f0c96a";
  c.beginPath();
  c.arc(0, -sc * 1.42, sc * 0.26, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c98b3f";
  c.beginPath();
  c.ellipse(0, -sc * 1.6, sc * 0.46, sc * 0.12, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(0, -sc * 1.66, sc * 0.2, Math.PI, 0);
  c.fill();
  c.restore();

  /* windmill tower (the sails are animated on top of this) */
  const wh = P.wmH;
  c.save();
  c.translate(P.wmX, P.wmBase);
  c.fillStyle = "rgba(70,110,50,0.25)";
  c.beginPath();
  c.ellipse(0, 0, wh * 0.26, wh * 0.06, 0, 0, Math.PI * 2);
  c.fill();
  const tower = c.createLinearGradient(-wh * 0.18, 0, wh * 0.18, 0);
  tower.addColorStop(0, "#fff6e2");
  tower.addColorStop(0.55, "#f0dfbe");
  tower.addColorStop(1, "#c9b691");
  c.fillStyle = tower;
  c.beginPath();
  c.moveTo(-wh * 0.17, 0);
  c.lineTo(-wh * 0.095, -wh);
  c.lineTo(wh * 0.095, -wh);
  c.lineTo(wh * 0.17, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(160,134,94,0.35)";
  c.lineWidth = Math.max(0.8, wh * 0.012);
  for (let i = 1; i < 5; i++) {
    const yy = -wh * (i / 5);
    const hw = lerp(wh * 0.17, wh * 0.095, i / 5);
    c.beginPath();
    c.moveTo(-hw, yy); c.lineTo(hw, yy);
    c.stroke();
  }
  c.fillStyle = "#d1503f";
  c.beginPath();
  c.moveTo(-wh * 0.15, -wh);
  c.quadraticCurveTo(0, -wh * 1.30, wh * 0.15, -wh);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.moveTo(-wh * 0.15, -wh);
  c.quadraticCurveTo(-wh * 0.06, -wh * 1.24, 0, -wh * 1.16);
  c.lineTo(-wh * 0.04, -wh);
  c.closePath();
  c.fill();
  c.fillStyle = "#8a5a2b";
  c.fillRect(-wh * 0.05, -wh * 0.24, wh * 0.1, wh * 0.24);
  c.fillStyle = "#ffe9a8";
  c.fillRect(-wh * 0.055, -wh * 0.58, wh * 0.075, wh * 0.075);
  c.restore();

  /* silo */
  const sx = P.siloX, sy = P.barnY, sw = P.siloW, sh2 = P.siloH;
  c.save();
  c.fillStyle = "rgba(70,110,50,0.28)";
  c.beginPath();
  c.ellipse(sx, sy, sw * 0.8, sw * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  const silo = c.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0);
  silo.addColorStop(0, "#efe6d2");
  silo.addColorStop(0.4, "#ded2b8");
  silo.addColorStop(1, "#ab9c7f");
  c.fillStyle = silo;
  c.fillRect(sx - sw / 2, sy - sh2, sw, sh2);
  c.strokeStyle = "rgba(140,124,96,0.35)";
  c.lineWidth = Math.max(0.8, sw * 0.05);
  for (let i = 1; i < 7; i++) {
    const yy = sy - (sh2 * i) / 7;
    c.beginPath();
    c.moveTo(sx - sw / 2, yy); c.lineTo(sx + sw / 2, yy);
    c.stroke();
  }
  c.fillStyle = "#c04a3b";
  c.beginPath();
  c.ellipse(sx, sy - sh2, sw * 0.56, sw * 0.42, 0, Math.PI, 0);
  c.fill();
  c.fillStyle = "rgba(255,224,170,0.4)";
  c.beginPath();
  c.ellipse(sx - sw * 0.16, sy - sh2 - sw * 0.06, sw * 0.2, sw * 0.16, -0.4, 0, Math.PI * 2);
  c.fill();
  c.restore();

  /* the barn: front face + a receding side wall for real depth */
  const bx = P.barnX, by = P.barnY, bw = P.barnW, bh = bw * 0.74, dep = bw * 0.34;
  c.save();
  c.fillStyle = "rgba(70,110,50,0.30)";
  c.beginPath();
  c.ellipse(bx + dep * 0.3, by, bw * 0.78, bw * 0.10, 0, 0, Math.PI * 2);
  c.fill();
  // side wall
  c.fillStyle = "#a8382e";
  c.beginPath();
  c.moveTo(bx + bw / 2, by);
  c.lineTo(bx + bw / 2 + dep, by - dep * 0.24);
  c.lineTo(bx + bw / 2 + dep, by - bh - dep * 0.24);
  c.lineTo(bx + bw / 2, by - bh);
  c.closePath();
  c.fill();
  // front wall
  c.fillStyle = vGrad(c, by - bh, by, [[0, "#ec5c48"], [1, "#c8422f"]]);
  c.fillRect(bx - bw / 2, by - bh, bw, bh);
  c.strokeStyle = "rgba(120,40,28,0.28)";
  c.lineWidth = Math.max(0.7, bw * 0.008);
  for (let i = 1; i < 9; i++) {
    c.beginPath();
    c.moveTo(bx - bw / 2 + (bw * i) / 9, by - bh);
    c.lineTo(bx - bw / 2 + (bw * i) / 9, by);
    c.stroke();
  }
  // gambrel roof
  const rr = (k: number) => bx - bw / 2 - bw * 0.06 + k * (bw + bw * 0.12);
  c.fillStyle = "#8e2f26";
  c.beginPath();
  c.moveTo(rr(0), by - bh);
  c.lineTo(bx - bw * 0.30, by - bh - bw * 0.24);
  c.lineTo(bx, by - bh - bw * 0.42);
  c.lineTo(bx + bw * 0.30, by - bh - bw * 0.24);
  c.lineTo(rr(1), by - bh);
  c.closePath();
  c.fill();
  // roof side (perspective)
  c.fillStyle = "#6f251e";
  c.beginPath();
  c.moveTo(rr(1), by - bh);
  c.lineTo(bx + bw * 0.30, by - bh - bw * 0.24);
  c.lineTo(bx + bw * 0.30 + dep, by - bh - bw * 0.24 - dep * 0.24);
  c.lineTo(rr(1) + dep, by - bh - dep * 0.24);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(255,214,150,0.22)";
  c.beginPath();
  c.moveTo(bx, by - bh - bw * 0.42);
  c.lineTo(bx + bw * 0.30, by - bh - bw * 0.24);
  c.lineTo(bx + bw * 0.30 + dep, by - bh - bw * 0.24 - dep * 0.24);
  c.lineTo(bx + dep, by - bh - bw * 0.42 - dep * 0.24);
  c.closePath();
  c.fill();
  // white trim, hayloft, doors, glowing windows
  c.strokeStyle = "#fff8ec";
  c.lineWidth = Math.max(1.4, bw * 0.035);
  c.strokeRect(bx - bw * 0.19, by - bh * 0.60, bw * 0.38, bh * 0.60);
  c.beginPath();
  c.moveTo(bx - bw * 0.19, by - bh * 0.60); c.lineTo(bx + bw * 0.19, by);
  c.moveTo(bx + bw * 0.19, by - bh * 0.60); c.lineTo(bx - bw * 0.19, by);
  c.stroke();
  c.fillStyle = "#7d2a20";
  c.fillRect(bx - bw * 0.10, by - bh - bw * 0.16, bw * 0.20, bw * 0.18);
  c.strokeStyle = "#fff8ec";
  c.lineWidth = Math.max(1, bw * 0.022);
  c.strokeRect(bx - bw * 0.10, by - bh - bw * 0.16, bw * 0.20, bw * 0.18);
  c.fillStyle = "#ffdc8f";
  for (const s2 of [-1, 1]) {
    c.beginPath();
    c.arc(bx + s2 * bw * 0.33, by - bh * 0.72, bw * 0.055, 0, Math.PI * 2);
    c.fill();
  }
  // cupola the weather vane sits on
  c.fillStyle = "#8e2f26";
  c.fillRect(bx - bw * 0.05, by - bh - bw * 0.42 - bw * 0.10, bw * 0.10, bw * 0.10);
  c.restore();

  /* washing-line posts (the line and the flapping cloths are animated) */
  c.save();
  c.strokeStyle = "#9a7042";
  c.lineWidth = Math.max(1.4, U * 0.006);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(P.lineX0, P.lineY + P.barnW * 0.5);
  c.lineTo(P.lineX0, P.lineY);
  c.stroke();
  c.restore();
}

/* ── baked props living in the near meadow ───────────────────────────────── */

function paintMeadowProps(c: CanvasRenderingContext2D, W: number, rnd: () => number) {
  const { U, fY, pondX, pondY, pondR } = P;
  const pr = pondR, py = pondY, prY = pr * 0.32;

  /* pond: muddy rim, deep water, reflected sky, lily pads */
  c.save();
  c.fillStyle = "#6b8f45";
  c.beginPath();
  c.ellipse(pondX, py, pr * 1.10, prY * 1.28, 0, 0, Math.PI * 2);
  c.fill();
  const water = c.createLinearGradient(0, py - prY, 0, py + prY);
  water.addColorStop(0, "#2f7fa8");
  water.addColorStop(0.45, "#4fa9cd");
  water.addColorStop(1, "#7fd0e0");
  c.fillStyle = water;
  c.beginPath();
  c.ellipse(pondX, py, pr, prY, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.ellipse(pondX, py, pr, prY, 0, 0, Math.PI * 2);
  c.clip();
  // warm reflection of the low sun
  c.fillStyle = "rgba(255,236,168,0.45)";
  c.beginPath();
  c.ellipse(pondX - pr * 0.35, py - prY * 0.15, pr * 0.32, prY * 0.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.ellipse(pondX + (rnd() - 0.5) * pr * 1.4, py + (rnd() - 0.5) * prY * 1.4, pr * 0.22, prY * 0.07, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  // lily pads
  for (let i = 0; i < 4; i++) {
    const lx = pondX + (rnd() - 0.5) * pr * 1.3;
    const ly = py + (rnd() - 0.4) * prY * 1.1;
    const lr = pr * (0.07 + rnd() * 0.05);
    c.fillStyle = "#3f8f42";
    c.beginPath();
    c.ellipse(lx, ly, lr, lr * 0.5, 0, 0.5, Math.PI * 2.35);
    c.fill();
  }
  // reeds on the shoulder of the pond
  c.strokeStyle = "#3d7d2c";
  c.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const a = Math.PI * (0.55 + rnd() * 0.9);
    const rx = pondX + Math.cos(a) * pr * (0.85 + rnd() * 0.3);
    const ry = py + Math.sin(a) * prY * (0.9 + rnd() * 0.4);
    const rh = U * (0.03 + rnd() * 0.035);
    c.lineWidth = Math.max(1, U * 0.004);
    c.beginPath();
    c.moveTo(rx, ry);
    c.quadraticCurveTo(rx + rh * 0.12, ry - rh * 0.6, rx + rh * 0.3, ry - rh);
    c.stroke();
    if (rnd() > 0.55) {
      c.fillStyle = "#8a5a2b";
      c.beginPath();
      c.ellipse(rx + rh * 0.3, ry - rh * 1.05, U * 0.005, U * 0.012, 0.25, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();

  /* fence receding along the left edge, posts shrinking with distance */
  c.save();
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const x = lerp(-U * 0.02, W * 0.30, k * k * 0.8 + k * 0.2);
    const y = lerp(fY + P.gh * 0.34, P.field + fY * 0.012, k);
    const ph = lerp(U * 0.075, U * 0.022, k);
    const pw = Math.max(1.2, ph * 0.13);
    if (i > 0) {
      const pk = (i - 1) / 8;
      const px = lerp(-U * 0.02, W * 0.30, pk * pk * 0.8 + pk * 0.2);
      const py = lerp(fY + P.gh * 0.34, P.field + fY * 0.012, pk);
      const pph = lerp(U * 0.075, U * 0.022, pk);
      c.strokeStyle = "rgba(226,208,172,0.95)";
      c.lineWidth = Math.max(1.1, ph * 0.10);
      for (const r of [0.32, 0.68]) {
        c.beginPath();
        c.moveTo(px, py - pph * r);
        c.lineTo(x, y - ph * r);
        c.stroke();
      }
    }
    c.fillStyle = "#efe2c6";
    c.fillRect(x - pw / 2, y - ph, pw, ph);
    c.fillStyle = "rgba(120,92,54,0.35)";
    c.fillRect(x + pw * 0.15, y - ph, pw * 0.35, ph);
  }
  c.restore();

  /* vegetable patch: tidy rows of cabbages and carrot tops */
  const vx = W * 0.80, vy = P.fY + P.gh * 0.62;
  c.save();
  c.fillStyle = "rgba(108,76,44,0.55)";
  c.beginPath();
  c.ellipse(vx, vy, U * 0.15, U * 0.045, 0, 0, Math.PI * 2);
  c.fill();
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 5; i++) {
      const gxp = vx - U * 0.12 + i * U * 0.06 + r * U * 0.012;
      const gyp = vy - U * 0.022 + r * U * 0.024;
      const gr = U * 0.016;
      if (r % 2 === 0) {
        c.fillStyle = "#5fae4e";
        c.beginPath();
        c.arc(gxp, gyp, gr, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "rgba(190,240,160,0.55)";
        c.beginPath();
        c.arc(gxp - gr * 0.3, gyp - gr * 0.3, gr * 0.45, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = "#4e9b33";
        c.lineWidth = Math.max(1, U * 0.004);
        for (let k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(gxp, gyp);
          c.quadraticCurveTo(gxp + k * gr * 0.5, gyp - gr, gxp + k * gr * 1.1, gyp - gr * 1.5);
          c.stroke();
        }
      }
    }
  }
  c.restore();
}

/* ── cached sprites for the animated layer ───────────────────────────────── */

/** Volumetric cumulus: blob silhouette → volume gradient → per-puff highlight. */
function cloudSprite(i: number, w: number, h: number) {
  return cachedSprite(`farm.cloud${i}`, w, h, `v1|${Math.round(DAY * 8)}`, (c, cw, ch) => {
    const r = mulberry32(6100 + i * 911);
    const n = 10;
    const px: number[] = [], py: number[] = [], pr: number[] = [];
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const bell = Math.pow(Math.sin(u * Math.PI), 0.75);
      px.push(cw * (0.12 + u * 0.76) + (r() - 0.5) * cw * 0.04);
      py.push(ch * (0.70 - bell * 0.34) + (r() - 0.5) * ch * 0.06);
      pr.push(ch * (0.14 + bell * 0.19 + r() * 0.06));
    }
    c.fillStyle = ramp("#2b3665", "#f7ded0", "#ffffff");
    for (let k = 0; k < n; k++) {
      c.beginPath();
      c.arc(px[k], py[k], pr[k], 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.ellipse(cw * 0.5, ch * 0.70, cw * 0.37, ch * 0.13, 0, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = vGrad(c, ch * 0.18, ch * 0.88, [
      [0, ramp("#4b5893", "#fff0dc", "#ffffff")],
      [0.5, ramp("#2c3768", "#f0cfba", "#f4f8ff")],
      [1, ramp("#161e46", "#b99384", "#b5c6e3")],
    ]);
    c.fillRect(0, 0, cw, ch);
    for (let k = 0; k < n; k++) {
      const g = c.createRadialGradient(px[k] - pr[k] * 0.35, py[k] - pr[k] * 0.45, pr[k] * 0.05, px[k], py[k], pr[k] * 1.05);
      g.addColorStop(0, rampA("#93a4dd", "#fff6e6", "#fffdf4", 0.95));
      g.addColorStop(1, rampA("#93a4dd", "#fff6e6", "#fffdf4", 0));
      c.fillStyle = g;
      c.fillRect(px[k] - pr[k] * 1.2, py[k] - pr[k] * 1.2, pr[k] * 2.4, pr[k] * 2.4);
    }
    const rim = c.createLinearGradient(0, ch, cw * 0.55, 0);
    rim.addColorStop(0, rampA("#b9c8ff", "#ffc98a", "#ffd684", 0));
    rim.addColorStop(0.72, rampA("#b9c8ff", "#ffcf96", "#ffdc8c", 0.35));
    rim.addColorStop(1, rampA("#d6e2ff", "#ffdcae", "#ffecb4", 0.75));
    c.fillStyle = rim;
    c.fillRect(0, 0, cw, ch);
    c.globalCompositeOperation = "source-over";
  });
}

/**
 * The same cumulus seen from much further off: flat, pale, and already tinted
 * toward the sky. Aerial perspective is what sells the middle distance — a far
 * cloud that is merely *smaller* still reads as a near cloud in a big sky.
 */
function farCloudSprite(i: number, w: number, h: number) {
  return cachedSprite(`farm.fcloud${i}`, w, h, `v1|${Math.round(DAY * 8)}`, (c, cw, ch) => {
    const r = mulberry32(3300 + i * 577);
    const n = 8;
    c.fillStyle = ramp("#3b4a86", "#e7c4b0", "#eef7ff");
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const bell = Math.pow(Math.sin(u * Math.PI), 0.8);
      c.beginPath();
      c.arc(
        cw * (0.14 + u * 0.72) + (r() - 0.5) * cw * 0.03,
        ch * (0.66 - bell * 0.26) + (r() - 0.5) * ch * 0.05,
        ch * (0.16 + bell * 0.16 + r() * 0.05), 0, Math.PI * 2,
      );
      c.fill();
    }
    c.beginPath();
    c.ellipse(cw * 0.5, ch * 0.66, cw * 0.34, ch * 0.11, 0, 0, Math.PI * 2);
    c.fill();
    // one soft top light, no shaded belly: distance flattens the modelling
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = vGrad(c, ch * 0.28, ch * 0.84, [
      [0, rampA("#8894d8", "#fff0dc", "#ffffff", 0.75)],
      [1, rampA("#2f3d76", "#d8b4a4", "#cfe3f6", 0.55)],
    ]);
    c.fillRect(0, 0, cw, ch);
    c.globalCompositeOperation = "source-over";
  });
}

/**
 * High cirrus: fibrous streaks at the top of the troposphere. They crawl, and
 * because they are the furthest thing in the sky they crawl slowest of all.
 */
function cirrusSprite(i: number, w: number, h: number) {
  return cachedSprite(`farm.cirrus${i}`, w, h, `v1|${Math.round(DAY * 8)}`, (c, cw, ch) => {
    const r = mulberry32(9400 + i * 131);
    c.lineCap = "round";
    c.strokeStyle = ramp("#66739f", "#ffd9bc", "#ffffff");
    for (let k = 0; k < 26; k++) {
      const y0 = ch * (0.15 + r() * 0.7);
      const x0 = cw * r() * 0.85;
      const len = cw * (0.10 + r() * 0.26);
      const rise = (r() - 0.5) * ch * 0.24;
      c.globalAlpha = 0.10 + r() * 0.26;
      c.lineWidth = ch * (0.02 + r() * 0.055);
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + len * 0.45, y0 + rise * 0.7, x0 + len, y0 + rise);
      c.stroke();
      // the hooked head every cirrus streak drags behind it
      if (r() > 0.55) {
        c.lineWidth *= 0.5;
        c.globalAlpha *= 0.8;
        c.beginPath();
        c.moveTo(x0 + len, y0 + rise);
        c.quadraticCurveTo(x0 + len * 1.2, y0 + rise - ch * 0.05, x0 + len * 1.3, y0 + rise - ch * 0.12);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  });
}

/** Soft cloud shadow puddle swept across the fields. */
function shadowSprite() {
  return cachedSprite("farm.cshadow", 220, 88, "v1", (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(38,74,46,0.55)");
    g.addColorStop(0.55, "rgba(38,74,46,0.30)");
    g.addColorStop(1, "rgba(38,74,46,0)");
    c.fillStyle = g;
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(1, h / w);
    c.beginPath();
    c.arc(0, 0, w / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
  });
}

/** Hoisted: the moon is redrawn every night frame and must not allocate. */
const MOON_CRATERS: [number, number, number, number][] = [
  [-0.30, -0.18, 0.22, 0.3], [0.22, 0.26, 0.17, -0.4],
  [0.34, -0.34, 0.10, 0.1], [-0.12, 0.42, 0.12, 0.8],
];

const PETAL = ["#ff8fb2", "#fff4f7", "#c79bff"];
/** Little five-petal wildflower head, stamped and rotated by the wind. */
function flowerSprite(k: number, d: number) {
  return cachedSprite(`farm.flower${k}`, d, d, "v1", (c, w) => {
    const r = w * 0.5;
    c.fillStyle = PETAL[k];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      c.beginPath();
      c.ellipse(r + Math.cos(a) * r * 0.42, r + Math.sin(a) * r * 0.42, r * 0.34, r * 0.26, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#ffb020";
    c.beginPath();
    c.arc(r, r, r * 0.24, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.beginPath();
    c.arc(r - r * 0.08, r - r * 0.08, r * 0.10, 0, Math.PI * 2);
    c.fill();
  });
}

/** One hot-air balloon. Hoisted so a flyover costs no closure per frame. */
function drawBalloon(
  ctx: CanvasRenderingContext2D, t: number, night: number,
  bx3: number, by3: number, br: number, alpha: number, ph: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(bx3, by3);
  ctx.rotate(Math.sin(t * 0.6 + ph) * 0.05);
  for (let s = -2; s <= 2; s++) {
    ctx.fillStyle = s % 2 ? "#ff8fa3" : "#ffd65a";
    ctx.beginPath();
    ctx.ellipse(s * br * 0.36, 0, br * (0.42 - Math.abs(s) * 0.05), br * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-br * 0.34, -br * 0.3, br * 0.22, br * 0.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a5a2b";
  ctx.lineWidth = Math.max(1, br * 0.06);
  ctx.beginPath();
  ctx.moveTo(-br * 0.45, br * 0.92); ctx.lineTo(-br * 0.26, br * 1.5);
  ctx.moveTo(br * 0.45, br * 0.92); ctx.lineTo(br * 0.26, br * 1.5);
  ctx.stroke();
  ctx.fillStyle = "#a06a35";
  ctx.fillRect(-br * 0.3, br * 1.48, br * 0.6, br * 0.44);
  // the burner: a real reason for the basket to flare, and it flares at night
  if (Math.sin(t * 3.1 + ph) > 0.6) {
    bloom(ctx, 0, br * 1.35, br * (0.6 + night * 0.9), "rgba(255,190,90,0.9)", 0.5 + night * 0.35);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── the frame ───────────────────────────────────────────────────────────── */

export function drawFarm({ ctx, W, H, t: rt, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 2) || !(H > 2)) return;

  DAY = dayLight();
  WARM = dayWarmth();
  const D = DAY;
  const night = 1 - D;

  /* One scene clock, so "less motion" slows the whole farm — wind, flyovers
     and all — rather than freezing it. Every phase and every event timer below
     reads this clock, so they stay in step with each other. */
  const clk = slot(fx, "farm.clock", () => {
    fx.fly2.x = -1;          // park anything left over from another world
    fx.fly3.x = 2;
    fx.fly2.last = rt - 12;  // first balloon at ~11s, first flock at ~4s
    fx.fly3.last = rt - 9;
    return { t: rt };
  });
  clk.t += Math.min(0.05, dt) * (calm() ? 0.45 : 1);
  const t = clk.t;
  dt = Math.min(0.05, dt) * (calm() ? 0.45 : 1);

  // `fly2`/`fly3` are shared across worlds; a stamp left far in this world's
  // future by another one would mean no balloon and no birds for minutes
  if (fx.fly2.last - t > 60) fx.fly2.last = t - 20;
  if (fx.fly3.last - t > 60) fx.fly3.last = t - 10;

  const fY = clamp(floorY, H * 0.25, H * 0.98);
  setProps(W, H, fY);
  const U = P.U, gh = P.gh;
  const wind = gustNow(t);
  const variant = `${Math.round(fY)}|${quality()}|d${Math.round(D * 8)}`;
  // colour strings that move only with the light, rebuilt once per light step
  const pal = slot(fx, "farm.pal", () => ({ k: -1, skein: "", flock: "" }));
  const kb = Math.round(D * 16);
  if (pal.k !== kb) {
    pal.k = kb;
    pal.skein = rampA("#c8d6ff", "#8a7c9e", "#6d7b9c", 0.30 + D * 0.28);
    pal.flock = rampA("#aab8e8", "#4a4358", "#3a3e56", 0.55 + D * 0.2);
  }
  const air = slot(fx, "farm.air", () => ({ drift: 0, sail: 0 }));
  air.drift += dt * (9 + wind * 30);
  air.sail += dt * (0.30 + wind * 1.15);

  /* ── layer A: sky ── */
  scene(ctx, "farm.sky", W, H, variant, paintSky);

  /* sun: breathing rays, bright disc, lens bloom — fades out as it sets */
  if (D > 0.04) {
    ctx.save();
    ctx.globalAlpha = clamp01(D * 1.6);
    ctx.translate(P.sunX, P.sunY);
    ctx.rotate(Math.sin(t * 0.10) * 0.07);
    ctx.strokeStyle = "rgba(255,224,116,0.72)";
    ctx.lineWidth = P.sunR * 0.13;
    ctx.lineCap = "round";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const breathe = 1 + Math.sin(t * 1.1 + i * 0.9) * 0.13;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * P.sunR * 1.35, Math.sin(a) * P.sunR * 1.35);
      ctx.lineTo(Math.cos(a) * P.sunR * 1.92 * breathe, Math.sin(a) * P.sunR * 1.92 * breathe);
      ctx.stroke();
    }
    const disc = ctx.createRadialGradient(-P.sunR * 0.3, -P.sunR * 0.32, P.sunR * 0.08, 0, 0, P.sunR);
    disc.addColorStop(0, "#fffbe0");
    disc.addColorStop(0.55, WARM > 0.5 ? "#ffd97a" : "#ffe98d");
    disc.addColorStop(1, WARM > 0.5 ? "#ff9e3c" : "#ffc93c");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, P.sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    bloom(ctx, P.sunX, P.sunY, P.sunR * 3.6, "rgba(255,238,176,0.55)", 0.30 * D);
  }

  /* ── the middle of the sky ────────────────────────────────────────────────
     Three cloud strata, ordered by distance. The rules are the ones the eye
     already knows: the further away a layer is, the slower it crawls, the
     hazier it gets, and the closer it sits to the horizon. Get those three
     agreeing and an empty sky turns into a deep one. */

  /* stratum 1 — cirrus, five miles up and barely moving */
  const cirW = Math.max(180, W * 1.35), cirH = Math.max(40, fY * 0.15);
  const nCir = quality() > 1 ? 3 : 2;
  ctx.save();
  for (let i = 0; i < nCir; i++) {
    const span = W + cirW;
    const cxp = ((air.drift * (0.055 + i * 0.022) + i * 977) % span) - cirW;
    ctx.globalAlpha = (0.40 - i * 0.075) * (0.34 + D * 0.66);
    ctx.drawImage(cirrusSprite(i % 2, cirW, cirH), cxp, fY * (0.19 + i * 0.085), cirW, cirH);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  /* strata 2 & 3 — cumulus, sorted back to front and painted in one pass */
  interface Cl { d: number; sc: number; a: number; sp: number; ph: number; k: number; bob: number }
  const clouds = slot<Cl[]>(fx, "farm.clouds", () => {
    const r = mulberry32(51515);
    const out: Cl[] = [];
    for (let i = 0; i < 12; i++) {
      const d = Math.pow(r(), 0.82);
      out.push({
        d,
        sc: lerp(1.15, 0.26, d) * (0.85 + r() * 0.3),
        a: lerp(0.95, 0.30, d),
        sp: lerp(1, 0.13, d) * (0.82 + r() * 0.36),
        ph: r() * 4000,
        k: Math.floor(r() * 3),
        bob: r() * 6.283,
      });
    }
    return out.sort((a, b) => b.d - a.d);      // far first, so near ones overlap
  });
  const cw = Math.max(70, U * 0.62), chh = cw * 0.52;
  const nCloud = Math.min(clouds.length, Math.max(4, detail(10)));
  for (let i = 0; i < nCloud; i++) {
    const cl = clouds[i];
    const wCl = cw * cl.sc;
    const span = W + wCl * 2.4;
    const cx = ((air.drift * cl.sp + cl.ph) % span) - wCl * 1.2;
    const cy = fY * lerp(0.10, 0.62, cl.d) + Math.sin(t * 0.21 + cl.bob) * U * 0.006 * (1 - cl.d);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(cl.sc, cl.sc * (0.95 + 0.05 * Math.sin(t * 0.24 + cl.bob)));
    if (cl.d > 0.44 || quality() === 0) {
      ctx.globalAlpha = cl.a * (0.62 + D * 0.38);
      ctx.drawImage(farCloudSprite(cl.k, cw, chh), -cw / 2, -chh / 2, cw, chh);
    } else if (quality() > 1) {
      // near clouds cross-fade between two silhouettes, so they visibly boil
      const morph = 0.5 + 0.5 * Math.sin(t * 0.10 + cl.bob * 1.7);
      ctx.globalAlpha = cl.a * morph * (0.6 + D * 0.4);
      ctx.drawImage(cloudSprite(cl.k, cw, chh), -cw / 2, -chh / 2, cw, chh);
      ctx.globalAlpha = cl.a * (1 - morph) * (0.6 + D * 0.4);
      ctx.drawImage(cloudSprite(cl.k + 3, cw, chh), -cw / 2, -chh / 2, cw, chh);
    } else {
      // on a weak device one silhouette, swapped as it drifts, is plenty
      ctx.globalAlpha = cl.a * (0.6 + D * 0.4);
      ctx.drawImage(cloudSprite(cl.k, cw, chh), -cw / 2, -chh / 2, cw, chh);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  /* a far skein of birds, high and slow — three or four pixels of pure depth.
     Its interval, altitude and heading are all noise-picked, so it never
     crosses on the same schedule twice. */
  const skein = slot(fx, "farm.skein", () => ({ at: rt + 9, u: -1, n: 0, y: 0.4, dir: 1, len: 11 }));
  if (skein.u < 0 && t > skein.at) {
    skein.u = 0;
    skein.n++;
    skein.y = 0.30 + (noise1(skein.n * 2.3, 61) * 0.5 + 0.5) * 0.18;
    skein.dir = noise1(skein.n * 5.1, 17) > 0 ? 1 : -1;
    skein.len = 8 + Math.round((noise1(skein.n * 1.7, 83) * 0.5 + 0.5) * 8);
  }
  if (skein.u >= 0) {
    skein.u += dt * 0.020;
    if (skein.u > 1) { skein.u = -1; skein.at = t + 26 + (noise1(skein.n * 3.7, 41) * 0.5 + 0.5) * 34; }
    else {
      const bs = Math.max(1.6, U * 0.006);
      ctx.save();
      ctx.strokeStyle = pal.skein;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, bs * 0.34);
      const headX = lerp(-0.12, 1.12, skein.dir > 0 ? skein.u : 1 - skein.u) * W;
      for (let b = 0; b < skein.len; b++) {
        // a loose skein, not a stencilled V: each bird lags on its own noise
        const lag = b * 1.0 + noise1(b * 0.9 + skein.n, 7) * 1.6;
        const bx2 = headX - skein.dir * lag * bs * 2.6;
        const by2 = fY * skein.y + Math.sin(lag * 0.55 + skein.n) * bs * 2.2
          + noise1(t * 0.3 + b * 2.2, 23) * bs * 1.4;
        const flap = Math.sin(t * (5.4 + (b % 3) * 0.7) + b * 1.9);
        ctx.beginPath();
        ctx.moveTo(bx2 - bs, by2 - flap * bs * 0.5);
        ctx.quadraticCurveTo(bx2, by2 + bs * 0.22, bx2 + bs, by2 - flap * bs * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* two hot-air balloons at different distances: a big one that crosses in
     under a minute, and a small hazy one that takes several */
  const bal = slot(fx, "farm.balloon", () => ({ n: 0 }));
  if (t - fx.fly2.last > 23 + (noise1(bal.n * 4.1, 53) * 0.5 + 0.5) * 22) {
    fx.fly2.last = t; fx.fly2.x = 1.3; bal.n++;
  }
  if (fx.fly2.x > -0.32) {
    fx.fly2.x -= dt * (0.020 + wind * 0.022);
    const alt = 0.24 + (noise1(bal.n * 2.9, 11) * 0.5 + 0.5) * 0.09;
    drawBalloon(ctx, t, night, fx.fly2.x * W, fY * (alt + Math.sin(t * 0.45) * 0.025), U * 0.048, 1, 0);
  }
  // the far one rides the same wind the other way round the valley
  const bal2 = slot(fx, "farm.balloon2", () => ({ x: 1.6, at: rt + 30, n: 0 }));
  if (bal2.x > 1.4 && t > bal2.at) { bal2.x = -0.2; bal2.n++; }
  if (bal2.x <= 1.4) {
    bal2.x += dt * (0.0075 + wind * 0.006);
    if (bal2.x > 1.4) bal2.at = t + 50 + (noise1(bal2.n * 6.3, 29) * 0.5 + 0.5) * 60;
    else {
      const alt = 0.40 + (noise1(bal2.n * 3.3, 71) * 0.5 + 0.5) * 0.07;
      drawBalloon(ctx, t, night, bal2.x * W, fY * (alt + Math.sin(t * 0.3) * 0.012), U * 0.020, 0.42 + D * 0.2, 2.1);
    }
  }

  /* the near flock, low and quick, crossing in a loose V */
  const flk = slot(fx, "farm.flock", () => ({ n: 0, y: 0.17, dir: 1 }));
  if (t - fx.fly3.last > 13 + (noise1(flk.n * 2.7, 97) * 0.5 + 0.5) * 16) {
    fx.fly3.last = t;
    fx.fly3.x = -0.18;
    flk.n++;
    flk.y = 0.13 + (noise1(flk.n * 1.9, 43) * 0.5 + 0.5) * 0.10;
  }
  if (fx.fly3.x < 1.3) {
    fx.fly3.x += dt * (0.115 + (noise1(flk.n * 4.4, 13) * 0.5 + 0.5) * 0.045);
    ctx.save();
    ctx.strokeStyle = pal.flock;
    ctx.lineCap = "round";
    const bs = Math.max(4, U * 0.016);
    for (let b = 0; b < 7; b++) {
      const arm = Math.abs(b - 3);
      const bx2 = fx.fly3.x * W - arm * bs * 1.9 + Math.sin(t * 0.6 + b) * bs * 0.2
        + noise1(t * 0.5 + b * 3.1, 5) * bs * 0.5;
      const by2 = fY * flk.y + arm * bs * 1.15 + Math.sin(t * 0.5 + b * 0.7) * bs * 0.2
        + noise1(t * 0.42 + b * 1.7, 9) * bs * 0.6;
      const flap = Math.sin(t * (8.0 + (b % 3) * 0.9) + b * 1.25);
      ctx.lineWidth = Math.max(1.2, bs * 0.22);
      ctx.beginPath();
      ctx.moveTo(bx2 - bs, by2 - flap * bs * 0.45);
      ctx.quadraticCurveTo(bx2 - bs * 0.4, by2 + bs * 0.25, bx2, by2 + flap * bs * 0.1);
      ctx.quadraticCurveTo(bx2 + bs * 0.4, by2 + bs * 0.25, bx2 + bs, by2 - flap * bs * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── layer B: the land ── */
  scene(ctx, "farm.land", W, H, variant, paintLand);

  /* cloud shadows sweeping the hills and the crop */
  const shadow = shadowSprite();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, P.hillFar - fY * 0.03, W, H - P.hillFar + fY * 0.03);
  ctx.clip();
  const nSh = Math.max(2, detail(4));
  for (let i = 0; i < nSh; i++) {
    const sw = W * (0.38 + (i % 3) * 0.16);
    const span = W + sw * 2;
    const sx = ((air.drift * 1.35 + i * 811) % span) - sw;
    const sy = lerp(P.hillFar, H, ((i * 0.37) % 1) * 0.9 + 0.05);
    ctx.globalAlpha = 0.20 * D;
    ctx.drawImage(shadow, sx - sw / 2, sy - sw * 0.11, sw, sw * 0.22);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* a little tractor working the far field every ~34s */
  const trac = slot(fx, "farm.tractor", () => ({ next: 8, x: -0.3 }));
  if (t > trac.next) { trac.next = t + 34; trac.x = -0.25; }
  if (trac.x < 1.25) {
    trac.x += dt * 0.052;
    const tx = trac.x * W, ty = P.field + fY * 0.055, s = U * 0.05;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = "rgba(120,90,40,0.22)";
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.5 + i * 0.25) % 1;
      ctx.globalAlpha = (1 - p) * 0.22;
      ctx.beginPath();
      ctx.arc(-s * (0.9 + p * 2.4), -s * (0.25 + p * 0.5), s * (0.18 + p * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d8463a";
    ctx.fillRect(-s * 0.62, -s * 0.72, s * 1.06, s * 0.42);
    ctx.fillRect(-s * 0.10, -s * 1.16, s * 0.56, s * 0.5);
    ctx.fillStyle = "#2c3a4a";
    ctx.fillRect(s * 0.02, -s * 1.08, s * 0.34, s * 0.3);
    ctx.fillStyle = "#3a3f46";
    ctx.fillRect(-s * 0.52, -s * 1.02, s * 0.11, s * 0.32);
    ctx.fillStyle = "#2f2f33";
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.34, s * 0.36, 0, Math.PI * 2);
    ctx.arc(-s * 0.48, -s * 0.44, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f0d9a0";
    ctx.lineWidth = Math.max(1, s * 0.05);
    for (const wheel of [{ x: s * 0.4, y: -s * 0.34, r: s * 0.22 }, { x: -s * 0.48, y: -s * 0.44, r: s * 0.12 }]) {
      const a0 = t * 3.4;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(wheel.x - Math.cos(a) * wheel.r, wheel.y - Math.sin(a) * wheel.r);
        ctx.lineTo(wheel.x + Math.cos(a) * wheel.r, wheel.y + Math.sin(a) * wheel.r);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* windmill sails — speed tied to the gust field */
  ctx.save();
  ctx.translate(P.wmX, P.hubY);
  ctx.rotate(air.sail);
  for (let b = 0; b < 4; b++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(255,253,243,0.95)";
    ctx.strokeStyle = "#c9563f";
    ctx.lineWidth = Math.max(1, P.wmH * 0.014);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(P.wmH * 0.10, -P.wmH * 0.15);
    ctx.lineTo(P.wmH * 0.40, -P.wmH * 0.46);
    ctx.lineTo(P.wmH * 0.27, -P.wmH * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k < 4; k++) {
      ctx.moveTo(P.wmH * 0.10 * (1 - k / 4) + P.wmH * 0.40 * (k / 4), -P.wmH * (0.15 * (1 - k / 4) + 0.46 * (k / 4)));
      ctx.lineTo(P.wmH * 0.27 * (k / 4), -P.wmH * 0.06 * (k / 4));
    }
    ctx.lineWidth = Math.max(0.6, P.wmH * 0.008);
    ctx.stroke();
  }
  ctx.fillStyle = "#c9563f";
  ctx.beginPath();
  ctx.arc(0, 0, P.wmH * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* weather vane on the barn cupola, swinging with the wind */
  ctx.save();
  ctx.translate(P.barnX, P.vaneY);
  const vs = P.barnW * 0.22;
  ctx.strokeStyle = "#4a3b2f";
  ctx.lineWidth = Math.max(1, vs * 0.10);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, -vs * 1.1);
  ctx.stroke();
  const yaw = Math.sin(t * 0.35) * 0.7 + (wind - 0.75) * 0.6;
  ctx.translate(0, -vs * 1.1);
  ctx.scale(Math.max(0.18, Math.abs(Math.cos(yaw))) * Math.sign(Math.cos(yaw) || 1), 1);
  ctx.fillStyle = "#4a3b2f";
  ctx.beginPath();
  ctx.moveTo(-vs * 0.55, 0);
  ctx.lineTo(0, -vs * 0.16);
  ctx.lineTo(vs * 0.30, -vs * 0.5);
  ctx.lineTo(vs * 0.42, -vs * 0.12);
  ctx.lineTo(vs * 0.62, vs * 0.06);
  ctx.lineTo(0, vs * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* washing line: catenary sag plus three cloths snapping in the gusts */
  const lx0 = P.lineX0, lx1 = P.lineX1, ly = P.lineY;
  const sag = U * 0.018 * (1.25 - wind * 0.4);
  ctx.save();
  ctx.strokeStyle = "rgba(90,70,50,0.75)";
  ctx.lineWidth = Math.max(0.8, U * 0.0025);
  ctx.beginPath();
  ctx.moveTo(lx0, ly);
  ctx.quadraticCurveTo((lx0 + lx1) / 2, ly + sag * 2, lx1, ly - U * 0.004);
  ctx.stroke();
  const clothCols = ["#ffd7e4", "#cfe9ff", "#fff0bb"];
  for (let k = 0; k < 3; k++) {
    const u = (k + 1) / 4;
    const cx2 = lerp(lx0, lx1, u);
    const cy2 = ly + sag * 2 * (1 - (2 * u - 1) * (2 * u - 1));
    const cwid = U * 0.030, chgt = U * 0.042;
    const bendW = windAt(t, cx2, W) * chgt * 0.55 + Math.sin(t * 5 + k * 2) * chgt * 0.08;
    ctx.fillStyle = clothCols[k];
    ctx.beginPath();
    ctx.moveTo(cx2 - cwid / 2, cy2);
    ctx.lineTo(cx2 + cwid / 2, cy2);
    ctx.quadraticCurveTo(cx2 + cwid * 0.5 + bendW * 0.5, cy2 + chgt * 0.6, cx2 + cwid * 0.35 + bendW, cy2 + chgt);
    ctx.quadraticCurveTo(cx2 + bendW * 0.9, cy2 + chgt * 0.88, cx2 - cwid * 0.4 + bendW * 0.8, cy2 + chgt * 0.96);
    ctx.quadraticCurveTo(cx2 - cwid * 0.5 + bendW * 0.35, cy2 + chgt * 0.55, cx2 - cwid / 2, cy2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* pond: ripple rings and a shimmering sun path */
  const prX = P.pondR, prY = P.pondR * 0.32;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(P.pondX, P.pondY, prX, prY, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.35 + i / 3) % 1);
    ctx.globalAlpha = (1 - p) * 0.5;
    ctx.lineWidth = Math.max(0.8, U * 0.0022);
    ctx.beginPath();
    ctx.ellipse(P.pondX + prX * 0.25, P.pondY + prY * 0.1, prX * 0.55 * p, prY * 0.55 * p, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.55 * D;
  ctx.fillStyle = "rgba(255,244,190,0.8)";
  for (let i = 0; i < 7; i++) {
    const gy2 = P.pondY - prY * 0.8 + (i / 7) * prY * 1.7;
    const gw = prX * (0.10 + 0.16 * Math.abs(Math.sin(t * 1.6 + i * 1.3)));
    ctx.fillRect(P.pondX - prX * 0.42 - gw / 2, gy2, gw, Math.max(1, prY * 0.06));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* wheat: a gust shimmer sweeping the crop, then swaying heads on the near edge */
  ctx.save();
  fieldPath(ctx);
  ctx.clip();
  const shim = ((air.drift * 1.9) % (W * 1.6)) - W * 0.3;
  const gsh = ctx.createLinearGradient(shim - W * 0.16, 0, shim + W * 0.16, 0);
  gsh.addColorStop(0, "rgba(255,250,205,0)");
  gsh.addColorStop(0.5, `rgba(255,250,205,${(0.10 + wind * 0.09) * (0.25 + D * 0.75)})`);
  gsh.addColorStop(1, "rgba(255,250,205,0)");
  ctx.fillStyle = gsh;
  ctx.fillRect(shim - W * 0.16, P.field - fY * 0.02, W * 0.32, fY - P.field + fY * 0.04);
  ctx.restore();

  const nWheat = Math.max(10, detail(52));
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < nWheat; i++) {
    const u = i / nWheat;
    const x = W * (0.10 + u * 0.94) + ((i * 37) % 11) * U * 0.002;
    const wl = U * (0.030 + ((i * 53) % 7) * 0.003);
    const bend = windAt(t, x, W) * wl * 0.55;
    const y0 = fY + U * 0.004;
    ctx.strokeStyle = "rgba(214,164,54,0.9)";
    ctx.lineWidth = Math.max(0.9, U * 0.0026);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + bend * 0.35, y0 - wl * 0.6, x + bend, y0 - wl);
    ctx.stroke();
    ctx.fillStyle = "#f5d574";
    ctx.beginPath();
    ctx.ellipse(x + bend, y0 - wl - U * 0.004, U * 0.005, U * 0.010, bend * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* foreground meadow: swaying blades and wildflowers */
  const blades = slot(fx, "farm.blades", () => {
    const r = mulberry32(20240);
    return Array.from({ length: 110 }, () => ({
      x: r(), d: Math.pow(r(), 0.7), l: 0.6 + r() * 0.85, ph: r() * 6.283, c: Math.floor(r() * 3),
    }));
  });
  const bladeCol = ["#3f8f2c", "#54a537", "#6cbb45"];
  const nB = Math.min(blades.length, Math.max(18, detail(110)));
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < nB; i++) {
    const b = blades[i];
    const x = b.x * W;
    const y = fY + b.d * gh;
    const l = U * (0.022 + b.d * 0.05) * b.l;
    const bend = windAt(t, x + b.ph * 20, W) * l * 0.6 + Math.sin(t * 3 + b.ph) * l * 0.05;
    ctx.strokeStyle = bladeCol[b.c];
    ctx.lineWidth = Math.max(1, U * (0.0022 + b.d * 0.004));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bend * 0.3, y - l * 0.62, x + bend, y - l);
    ctx.stroke();
  }
  ctx.restore();

  const flowers = slot(fx, "farm.flowers", () => {
    const r = mulberry32(777);
    return Array.from({ length: 30 }, () => ({
      x: r(), d: Math.pow(r(), 0.6), k: Math.floor(r() * 3), s: 0.7 + r() * 0.65, ph: r() * 6.283,
    }));
  });
  const nF = Math.min(flowers.length, Math.max(6, detail(30)));
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < nF; i++) {
    const f = flowers[i];
    const x = f.x * W;
    const y = fY + f.d * gh;
    const st = U * (0.020 + f.d * 0.035) * f.s;
    const bend = windAt(t, x + f.ph * 15, W) * st * 0.5;
    ctx.strokeStyle = "#3f8f2c";
    ctx.lineWidth = Math.max(1, U * 0.0026);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bend * 0.3, y - st * 0.6, x + bend, y - st);
    ctx.stroke();
    const d = Math.max(6, U * (0.016 + f.d * 0.014) * f.s);
    ctx.save();
    ctx.translate(x + bend, y - st);
    ctx.rotate(bend * 0.02);
    ctx.drawImage(flowerSprite(f.k, 44), -d / 2, -d / 2, d, d);
    ctx.restore();
  }
  ctx.restore();

  /* chickens pecking near the barn */
  const nHen = Math.max(1, detail(3));
  for (let i = 0; i < nHen; i++) {
    const hx = W * (0.62 + i * 0.09) + Math.sin(t * 0.35 + i * 2.1) * W * 0.025;
    const hy = fY + gh * (0.16 + i * 0.09);
    const hs = U * (0.020 + i * 0.002);
    const peck = Math.max(0, Math.sin(t * 2.2 + i * 2));
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(Math.cos(t * 0.35 + i * 2.1) > 0 ? 1 : -1, 1);
    ctx.strokeStyle = "#e5a13c";
    ctx.lineWidth = Math.max(1, hs * 0.13);
    ctx.beginPath();
    ctx.moveTo(-hs * 0.15, 0); ctx.lineTo(-hs * 0.2, hs * 0.42);
    ctx.moveTo(hs * 0.2, 0); ctx.lineTo(hs * 0.25, hs * 0.42);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? "#fffaf0" : "#e8d7b6";
    ctx.beginPath();
    ctx.ellipse(0, -hs * 0.15, hs * 0.62, hs * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(hs * 0.45, -hs * 0.45);
    ctx.rotate(peck * 0.9);
    ctx.fillStyle = i % 2 ? "#fffaf0" : "#e8d7b6";
    ctx.beginPath();
    ctx.arc(0, 0, hs * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e04b3c";
    ctx.beginPath();
    ctx.arc(-hs * 0.05, -hs * 0.28, hs * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5a623";
    ctx.beginPath();
    ctx.moveTo(hs * 0.26, 0);
    ctx.lineTo(hs * 0.52, hs * 0.06);
    ctx.lineTo(hs * 0.26, hs * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2f2a26";
    ctx.beginPath();
    ctx.arc(hs * 0.1, -hs * 0.06, hs * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /* butterflies wandering on gust-pushed paths */
  const bCols = ["#ff8fb2", "#c79bff", "#ffd65a"];
  const nBf = Math.max(1, detail(3));
  for (let i = 0; i < nBf; i++) {
    const bfx = W * (0.24 + i * 0.28) + noise1(t * 0.28 + i * 5, 3 + i) * W * 0.16 + wind * U * 0.04;
    const bfy = fY - U * 0.03 - i * U * 0.02 + noise1(t * 0.42 + i * 9, 11 + i) * U * 0.05;
    const flap = Math.abs(Math.sin(t * 9 + i * 3)) * 0.85 + 0.15;
    const bs2 = U * 0.013;
    ctx.save();
    ctx.translate(bfx, bfy);
    ctx.rotate(Math.sin(t * 1.3 + i) * 0.25);
    ctx.fillStyle = bCols[i % 3];
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * bs2 * 0.75 * flap, -bs2 * 0.25, bs2 * 0.78 * flap, bs2, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * bs2 * 0.8 * flap, -bs2 * 0.55, bs2 * 0.28 * flap, bs2 * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#5a4a3a";
    ctx.lineWidth = Math.max(1, bs2 * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, -bs2 * 0.8);
    ctx.lineTo(0, bs2 * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* bees bumbling over the flowers */
  const nBee = Math.max(1, detail(2));
  for (let i = 0; i < nBee; i++) {
    const ex = W * (0.42 + i * 0.3) + noise1(t * 0.9 + i * 3, 21 + i) * W * 0.10;
    const ey = fY + gh * 0.30 + noise1(t * 1.1 + i * 7, 31 + i) * gh * 0.22;
    const es = U * 0.007;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(0, -es, es * 1.1, es * 0.5, Math.sin(t * 30 + i) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5c518";
    ctx.beginPath();
    ctx.ellipse(0, 0, es, es * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2f22";
    ctx.fillRect(-es * 0.2, -es * 0.7, es * 0.35, es * 1.4);
    ctx.restore();
  }

  /* dandelion clock bursting every ~17s, seeds riding the gust */
  const seeds = slot(fx, "farm.seeds", () => ({
    next: 7,
    ps: [] as { x: number; y: number; vx: number; vy: number; sp: number; life: number }[],
  }));
  if (t > seeds.next) {
    seeds.next = t + 17;
    const ox = W * (0.2 + ((t * 13) % 1) * 0.6), oy = fY + gh * 0.35;
    const n = Math.max(5, detail(18));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n - 0.5) * 2.4;
      const sp = U * (0.05 + (i % 5) * 0.012);
      seeds.ps.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp: (i % 7) * 0.9, life: 1 });
    }
  }
  if (seeds.ps.length) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    for (let i = seeds.ps.length - 1; i >= 0; i--) {
      const s = seeds.ps[i];
      s.vx += (windAt(t, s.x, W) * U * 0.22 - s.vx) * Math.min(1, dt * 1.4);
      s.vy += (-U * 0.012 - s.vy) * Math.min(1, dt * 0.8);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 0.13;
      if (s.life <= 0 || s.x > W + 40 || s.y < -20) { seeds.ps.splice(i, 1); continue; }
      const r = U * 0.008;
      ctx.globalAlpha = Math.min(1, s.life * 1.6) * 0.9;
      ctx.lineWidth = Math.max(0.7, U * 0.0016);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + s.sp + t * 0.6;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.8, r * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* a few leaves tumbling downwind */
  const nLeaf = Math.max(2, detail(6));
  ctx.save();
  for (let i = 0; i < nLeaf; i++) {
    const p = ((t * 0.055 + i / nLeaf) % 1);
    const lx = -U * 0.05 + p * (W + U * 0.1);
    const ly = fY * (0.90 + i * 0.012) + Math.sin(p * 9 + i) * U * 0.05 + p * gh * 0.85;
    const ls = U * 0.010;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(t * 2.2 + i);
    ctx.fillStyle = i % 2 ? "rgba(226,168,62,0.85)" : "rgba(168,196,72,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, 0, ls, ls * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  /* ── evening ──────────────────────────────────────────────────────────────
     `applyNight` only dims. A meadow at nine at night is also *desaturated* —
     moonlight is too weak for the cones, so the greens fall away toward blue.
     One graded wash over the land (live grass, flowers and hens included, which
     is why it cannot be baked) does that, and it feathers in behind the
     mountain haze so there is no line across the hills. */
  if (night > 0.03) {
    const nw = slot(fx, "farm.nightwash", () => ({ sig: "", g: null as CanvasGradient | null }));
    const nsig = `${Math.round(H)}|${Math.round(fY)}`;
    if (nw.sig !== nsig || !nw.g) {
      nw.sig = nsig;
      nw.g = vGrad(ctx, P.hillFar - fY * 0.10, H, [
        [0, "rgba(20,30,72,0)"],
        [0.24, "rgba(18,27,66,0.95)"],
        [0.62, "rgba(16,24,60,0.78)"],
        [1, "rgba(12,19,50,0.92)"],
      ]);
    }
    ctx.save();
    ctx.globalAlpha = night * 0.6;
    ctx.fillStyle = nw.g;
    ctx.fillRect(0, P.hillFar - fY * 0.10, W, H - P.hillFar + fY * 0.10);
    ctx.restore();
  }

  applyNight(ctx, W, H);
  // the farm is out of doors, so it gets the whole year
  applySeason(ctx, W, H, dt);

  if (night > 0.06) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    /* the moon, rising opposite the sun — it does not show itself until the
       sky is dark enough to see it against */
    const moonA = clamp01((night - 0.28) * 2.6);
    const mR = U * 0.052;
    const mX = W * 0.66, mY = fY * 0.205;
    ctx.globalAlpha = moonA;
    const md = ctx.createRadialGradient(mX - mR * 0.25, mY - mR * 0.28, mR * 0.1, mX, mY, mR);
    md.addColorStop(0, "#fffdf2");
    md.addColorStop(0.7, "#eef1ff");
    md.addColorStop(1, "#c3ccec");
    ctx.fillStyle = md;
    ctx.beginPath();
    ctx.arc(mX, mY, mR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(150,164,206,0.5)";           // maria
    for (const cr of MOON_CRATERS) {
      ctx.beginPath();
      ctx.ellipse(mX + cr[0] * mR, mY + cr[1] * mR, mR * cr[2], mR * cr[2] * 0.82, cr[3], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    bloom(ctx, mX, mY, mR * 5.5, "rgba(198,214,255,0.5)", moonA * 0.3);

    /* the farm is awake: warm windows, and a lamp over the barn door */
    const bx = P.barnX, by = P.barnY, bw = P.barnW, bh = bw * 0.74;
    // a slow, shallow flicker — an oil lamp, not a fault in the wiring
    const lamp = 0.86 + noise1(t * 0.9, 3) * 0.1 + noise1(t * 2.6, 8) * 0.04;
    const winA = clamp01((night - 0.10) * 1.25) * lamp;
    for (const s2 of [-1, 1]) {
      const wx = bx + s2 * bw * 0.33, wy = by - bh * 0.72;
      ctx.globalAlpha = winA * 0.95;
      ctx.fillStyle = "#ffca62";
      ctx.beginPath();
      ctx.arc(wx, wy, bw * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      bloom(ctx, wx, wy, bw * 0.42, "rgba(255,182,84,0.85)", winA * 0.5);
    }
    ctx.globalAlpha = winA * 0.8;                        // the hayloft door
    ctx.fillStyle = "#ffb84e";
    ctx.fillRect(bx - bw * 0.075, by - bh - bw * 0.135, bw * 0.15, bw * 0.13);
    ctx.globalAlpha = 1;
    bloom(ctx, bx, by - bh - bw * 0.07, bw * 0.55, "rgba(255,170,70,0.8)", winA * 0.4);
    bloom(ctx, bx, by - bh * 0.34, bw * 0.75, "rgba(255,186,96,0.75)", winA * 0.5);
    // the light pools on the yard in front of the doors
    ctx.globalAlpha = winA * 0.22;
    ctx.fillStyle = "#ffb559";
    ctx.beginPath();
    ctx.ellipse(bx, by + gh * 0.02, bw * 0.62, bw * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // the windmill keeps one lamp lit too, so the left of the frame is not dead
    bloom(ctx, P.wmX, P.wmBase - P.wmH * 0.34, P.wmH * 0.3, "rgba(255,196,110,0.8)", winA * 0.26);

    /* fireflies over the meadow — each on its own blink clock, so the field
       twinkles instead of pulsing in time */
    const flies = slot(fx, "farm.flies", () => {
      const r = mulberry32(31415);
      return Array.from({ length: 34 }, () => ({
        x: r(), d: Math.pow(r(), 0.75), ph: r() * 6.283,
        per: 0.55 + r() * 1.5, sp: 0.5 + r() * 0.9, sd: r() * 90,
      }));
    });
    const flyK = clamp01((night - 0.28) * 2.2);
    const nFly = flyK <= 0 ? 0 : Math.min(flies.length, Math.max(4, Math.round(detail(34) * flyK)));
    for (let i = 0; i < nFly; i++) {
      const f = flies[i];
      const blink = Math.pow(Math.max(0, Math.sin(t * f.per + f.ph)), 3.2);
      if (blink < 0.02) continue;
      const fx2 = f.x * W + noise1(t * 0.20 * f.sp + f.sd, 3) * W * 0.11;
      const fy2 = fY + gh * (-0.24 + f.d * 1.12) + noise1(t * 0.27 * f.sp + f.sd + 40, 7) * gh * 0.09;
      const r2 = U * (0.0035 + f.d * 0.0035);
      ctx.globalAlpha = blink * flyK;
      ctx.fillStyle = "#d8ff9a";
      ctx.beginPath();
      ctx.arc(fx2, fy2, r2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      bloom(ctx, fx2, fy2, r2 * 9, "rgba(186,255,120,0.85)", blink * flyK * 0.5);
    }
    ctx.restore();

    /* the moon lays its own path on the pond */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(P.pondX, P.pondY, P.pondR, P.pondR * 0.32, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const gy3 = P.pondY - P.pondR * 0.26 + (i / 6) * P.pondR * 0.55;
      const gw = P.pondR * (0.05 + 0.09 * Math.abs(Math.sin(t * 1.1 + i * 1.7)));
      ctx.globalAlpha = moonA * 0.42;
      ctx.fillStyle = "rgba(206,224,255,0.9)";
      ctx.fillRect(P.pondX + P.pondR * 0.1 - gw / 2, gy3, gw, Math.max(1, P.pondR * 0.02));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* grade + vignette: golden by day, cool and close by night */
  grade(ctx, W, H, night > 0.55 ? "#7f9dff" : "#ffcf8a", 0.09 - night * 0.025, 0.05 * D);
  vignette(ctx, W, H, 0.15 + night * 0.1);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
