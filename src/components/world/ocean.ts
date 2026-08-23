// ─── OCEAN world theme ──────────────────────────────────────────────────────
// A fully procedural, art-directed underwater backdrop. Layer stack, back→front:
//
//   0  water column (depth-graded gradient + sand bounce)
//   1  far haze: distant rock stacks + ghost kelp        (cached, slow parallax)
//   2  mid rocks + shipwreck hero silhouette             (cached, mid parallax)
//   3  mid kelp — live, sways on the shared current
//   4  sand floor: dunes, ripples, pebbles, shells       (cached, hi-res)
//   5  caustics — two surging light nets over rock AND sand
//   6  static reef: branching/brain/fan/tube coral, urchins, starfish (cached)
//   7  live reef: anemones with per-tentacle sway, clams that open, vents
//   8  bioluminescence in the dark lower thirds
//   9  life & events: two schools, whale, manta, turtle, plankton bloom
//  10  god rays with refraction wobble (additive)
//  11  marine snow
//  12  surface: refraction wobble, sun disc, wave-pass light event
//  13  foreground: bokeh debris + out-of-focus fronds (fastest parallax)
//  14  colour grade + vignette
//
// Everything static is baked into cached layers; the per-frame budget is a
// handful of blits plus a few hundred cheap path ops.

import {
  cachedSprite, mulberry32, noise1, fbm1, detail, quality, richFx,
  bloom, vGrad, wavyBand, grade, vignette, slot,
  lerp, clamp, clamp01, easeOut, damp,
  dayLight, dayWarmth, applyNight,
  type ThemeFrame, type FxState,
} from "./shared";

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

/* ── the time of day ──────────────────────────────────────────────────────────
   Sunlight is the reef's whole lighting rig: it makes the caustics, the god
   rays and the colour of the water itself. Snapshotted into module scope so
   the baked painters can read it; the bake key carries the same value, so a
   layer only repaints when the light has actually moved a step. */

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

/** The same ramp, carrying an explicit alpha. */
const rampA = (night: string, gold: string, day: string, alpha: number, D = DAY) =>
  `rgba(${ramp(night, gold, day, D).slice(4, -1)},${alpha})`;

/**
 * A different gap before the next set-piece, every time round, derived from
 * when the last one fired. Fixed intervals are what make a scene feel like a
 * loop: a child who sees the whale at 0:21 and again at 0:42 has worked the
 * trick out. Returns 0‥1.
 */
const gap = (seed: number) => noise1(seed * 0.37, 13) * 0.5 + 0.5;

/**
 * Colour strings that move only with the light. Built once per light step, so
 * the draw loop never allocates one.
 */
function jpal(fx: FxState, lightK: number) {
  const p = slot(fx, "oc.pal", () => ({ k: -1, tintA: "", tintB: "", far: "" }));
  if (p.k !== lightK) {
    p.k = lightK;
    p.tintA = rampA("#8affd8", "#ffc6dd", "#ffd2e6", 0.62);
    p.tintB = rampA("#7fe6ff", "#c8b4ff", "#d9c6ff", 0.62);
    p.far = ramp("#020c1c", "#053050", "#063a63");
  }
  return p;
}

/* ── motion preference ────────────────────────────────────────────────────── */

let reduced: boolean | null = null;
/** True when the viewer asked for less motion — the reef slows, never stops. */
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

/* ── dither: the cure for 8-bit banding in a full-height water gradient ───── */

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
function dither(c: Ctx, x: number, y: number, w: number, h: number, amount = 0.2) {
  const pat = c.createPattern(grainTile(), "repeat");
  if (!pat) return;
  c.save();
  c.globalCompositeOperation = "overlay";
  c.globalAlpha = amount;
  c.fillStyle = pat;
  c.fillRect(x, y, w, h);
  c.restore();
}

/* ── palette ─────────────────────────────────────────────────────────────── */

const REEF_COLS: [string, string][] = [
  ["#ff8fb2", "#ffd6e4"],   // bubblegum
  ["#ff9d76", "#ffdcc6"],   // sunset coral
  ["#c79bff", "#ecdcff"],   // orchid
  ["#ffd65a", "#fff2bd"],   // butter
  ["#5fe3c0", "#ccfff2"],   // mint
  ["#ff6fa5", "#ffc9de"],   // magenta
  ["#7fc4ff", "#d8efff"],   // sky
];

/* ── geometry ────────────────────────────────────────────────────────────── */

/** The one true seabed profile — cached art and live props read the same line. */
const seabedAt = (x: number, floorY: number, H: number) =>
  floorY + Math.sin(x * 0.0021 + 1.1) * H * 0.013 + fbm1(x * 0.0055, 3, 11) * H * 0.016;

/**
 * Supersample factor for the cached detail layers: crisp on retina, and 1× on
 * huge canvases so we never sink tens of megabytes into offscreen bitmaps.
 * Deliberately independent of `quality()` — a tier flip must never invalidate
 * (and re-pay for) the two biggest cached layers.
 */
function ssFactor(W: number, H: number): number {
  if (W * H > 1.5e6) return 1;
  const d = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return d >= 1.75 ? 2 : d >= 1.25 ? 1.5 : 1;
}

/** cachedSprite that is painted in logical units but stored at `ss`× density. */
function hiSprite(
  key: string, w: number, h: number, ss: number, variant: string,
  paint: (c: Ctx, w: number, h: number) => void,
): HTMLCanvasElement {
  return cachedSprite(key, Math.max(1, w * ss), Math.max(1, h * ss), `${variant}|s${ss}`, (c) => {
    c.setTransform(ss, 0, 0, ss, 0, 0);
    paint(c, w, h);
    c.setTransform(1, 0, 0, 1, 0, 0);
  });
}

/** Trace an organic dome (rock / hump) from its left foot to its right foot. */
function domePath(c: Ctx, cx: number, baseY: number, hw: number, hh: number, seed: number, rough = 0.26, steps = 22) {
  c.beginPath();
  c.moveTo(cx - hw, baseY);
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const prof = Math.pow(Math.sin(u * Math.PI), 0.6);
    const n = fbm1(u * 3.4 + seed * 1.7, 3, seed) * rough;
    c.lineTo(cx - hw + u * hw * 2, baseY - hh * Math.max(0, prof * (1 + n)));
  }
  c.lineTo(cx + hw, baseY);
  c.closePath();
}

/* ── reef prop painters (all baked once into the reef layer) ─────────────── */

function coralBranch(c: Ctx, x: number, y: number, s: number, rnd: () => number, col: string, tip: string) {
  c.lineCap = "round";
  c.lineJoin = "round";
  const grow = (px: number, py: number, ang: number, len: number, wdt: number, depth: number) => {
    const ex = px + Math.cos(ang) * len;
    const ey = py + Math.sin(ang) * len;
    const mx = px + Math.cos(ang - 0.32) * len * 0.55;
    const my = py + Math.sin(ang - 0.32) * len * 0.55;
    c.strokeStyle = col;
    c.lineWidth = wdt;
    c.beginPath();
    c.moveTo(px, py);
    c.quadraticCurveTo(mx, my, ex, ey);
    c.stroke();
    if (depth <= 0) {
      c.fillStyle = tip;
      c.beginPath();
      c.arc(ex, ey, wdt * 0.66, 0, TAU);
      c.fill();
      return;
    }
    const n = rnd() > 0.4 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.44 + rnd() * 0.24);
      grow(ex, ey, ang + spread, len * (0.6 + rnd() * 0.18), wdt * 0.66, depth - 1);
    }
  };
  grow(x, y, -Math.PI / 2 + (rnd() - 0.5) * 0.28, s * 0.46, s * 0.2, 2);
}

function coralBrain(c: Ctx, x: number, y: number, s: number, rnd: () => number, col: string, tip: string) {
  const hw = s * 0.52 * (0.85 + rnd() * 0.3);
  const hh = s * 0.4;
  c.save();
  c.beginPath();
  c.ellipse(x, y - hh * 0.72, hw, hh, 0, 0, TAU);
  c.fillStyle = col;
  c.fill();
  c.clip();
  c.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    const yy = y - hh * 0.72 + i * hh * 0.3;
    c.beginPath();
    c.moveTo(x - hw, yy);
    for (let sx = -hw; sx <= hw; sx += hw * 0.25) {
      c.lineTo(x + sx, yy + Math.sin(sx * 0.16 + i * 1.4) * hh * 0.12);
    }
    c.strokeStyle = "rgba(90,30,60,0.22)";
    c.lineWidth = s * 0.055;
    c.stroke();
    c.beginPath();
    c.moveTo(x - hw, yy - s * 0.05);
    for (let sx = -hw; sx <= hw; sx += hw * 0.25) {
      c.lineTo(x + sx, yy - s * 0.05 + Math.sin(sx * 0.16 + i * 1.4) * hh * 0.12);
    }
    c.strokeStyle = tip;
    c.lineWidth = s * 0.03;
    c.globalAlpha = 0.5;
    c.stroke();
    c.globalAlpha = 1;
  }
  c.restore();
}

function coralFan(c: Ctx, x: number, y: number, s: number, rnd: () => number, col: string, tip: string) {
  const h = s * (1 + rnd() * 0.4);
  const spread = 0.9 + rnd() * 0.35;
  const ribs = 9;
  const tipX: number[] = [];
  const tipY: number[] = [];
  c.lineCap = "round";
  for (let i = 0; i < ribs; i++) {
    const u = i / (ribs - 1);
    const a = -Math.PI / 2 + (u - 0.5) * spread;
    const len = h * (0.55 + Math.sin(u * Math.PI) * 0.45);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    tipX.push(ex);
    tipY.push(ey);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.4, y + Math.sin(a) * len * 0.62, ex, ey);
    c.strokeStyle = col;
    c.lineWidth = s * 0.075 * (1 - u * 0.15);
    c.stroke();
  }
  // lacy cross-webbing between the ribs
  c.strokeStyle = tip;
  c.globalAlpha = 0.55;
  c.lineWidth = s * 0.028;
  for (let band = 0.45; band <= 0.95; band += 0.25) {
    c.beginPath();
    for (let i = 0; i < ribs; i++) {
      const px = lerp(x, tipX[i], band);
      const py = lerp(y, tipY[i], band);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
}

function coralTube(c: Ctx, x: number, y: number, s: number, rnd: () => number, col: string, tip: string) {
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * s * 0.26 + (rnd() - 0.5) * s * 0.08;
    const hh = s * (0.4 + rnd() * 0.55);
    const rw = s * 0.115;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x + ox - rw, y);
    c.quadraticCurveTo(x + ox - rw * 1.1, y - hh * 0.7, x + ox - rw * 0.72, y - hh);
    c.lineTo(x + ox + rw * 0.72, y - hh);
    c.quadraticCurveTo(x + ox + rw * 1.1, y - hh * 0.7, x + ox + rw, y);
    c.closePath();
    c.fill();
    c.fillStyle = tip;
    c.beginPath();
    c.ellipse(x + ox, y - hh, rw * 0.72, rw * 0.3, 0, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(60,16,52,0.45)";
    c.beginPath();
    c.ellipse(x + ox, y - hh + rw * 0.05, rw * 0.42, rw * 0.16, 0, 0, TAU);
    c.fill();
  }
}

function urchin(c: Ctx, x: number, y: number, s: number, rnd: () => number) {
  const r = s * 0.24;
  c.strokeStyle = "rgba(46,20,72,0.9)";
  c.lineCap = "round";
  const spines = 16;
  for (let i = 0; i < spines; i++) {
    const a = Math.PI + (i / (spines - 1)) * Math.PI;
    const len = r * (1.5 + rnd() * 0.9);
    c.lineWidth = s * 0.035;
    c.beginPath();
    c.moveTo(x, y - r * 0.6);
    c.lineTo(x + Math.cos(a) * len, y - r * 0.6 + Math.sin(a) * len);
    c.stroke();
  }
  c.fillStyle = "#3d1a5e";
  c.beginPath();
  c.arc(x, y - r * 0.6, r, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(190,140,255,0.5)";
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.9, r * 0.32, 0, TAU);
  c.fill();
}

function starfish(c: Ctx, x: number, y: number, s: number, rnd: () => number, col: string, tip: string) {
  const R = s * 0.42;
  const rot = rnd() * TAU;
  c.save();
  c.translate(x, y - R * 0.12);
  c.rotate(rot);
  c.scale(1, 0.52);
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * TAU - Math.PI / 2;
    const a1 = ((i + 0.5) / 5) * TAU - Math.PI / 2;
    const a2 = ((i + 1) / 5) * TAU - Math.PI / 2;
    if (i === 0) c.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
    c.quadraticCurveTo(Math.cos(a1) * R * 0.34, Math.sin(a1) * R * 0.34, Math.cos(a2) * R, Math.sin(a2) * R);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.fillStyle = tip;
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const rr = rnd() * R * 0.55;
    c.beginPath();
    c.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.07, 0, TAU);
    c.fill();
  }
  c.restore();
}

function shell(c: Ctx, x: number, y: number, s: number, rnd: () => number) {
  const R = s * 0.3 * (0.8 + rnd() * 0.5);
  c.save();
  c.translate(x, y);
  c.rotate((rnd() - 0.5) * 0.5);
  c.beginPath();
  c.moveTo(-R, 0);
  c.quadraticCurveTo(-R * 0.9, -R * 1.15, 0, -R * 1.2);
  c.quadraticCurveTo(R * 0.9, -R * 1.15, R, 0);
  c.closePath();
  c.fillStyle = "#ffeede";
  c.fill();
  c.strokeStyle = "rgba(206,150,120,0.5)";
  c.lineWidth = R * 0.09;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(0, -R * 1.16);
    c.lineTo(i * R * 0.42, 0);
    c.stroke();
  }
  c.restore();
}

function reefRock(c: Ctx, x: number, y: number, s: number, seed: number) {
  domePath(c, x, y, s * 0.62, s * 0.4, seed, 0.34, 16);
  c.fillStyle = "rgba(24,74,120,0.78)";
  c.fill();
  domePath(c, x - s * 0.04, y - s * 0.05, s * 0.6, s * 0.38, seed, 0.34, 16);
  c.fillStyle = "rgba(96,190,232,0.22)";
  c.fill();
}

/* ── cached scenery painters ─────────────────────────────────────────────── */

function paintFar(c: Ctx, w: number, h: number, pad: number, floorY: number, H: number) {
  const r = mulberry32(4711);
  const top = H - h;                       // the sprite is blitted flush to the bottom
  const yFoot = (sx: number) => seabedAt(sx - pad, floorY, H) - top;

  // ghost kelp forest, way back
  const strands = Math.max(6, Math.round(w / 46));
  for (let i = 0; i < strands; i++) {
    const x = r() * w;
    const hh = h * (0.3 + r() * 0.55);
    const bend = (r() - 0.5) * h * 0.14;
    c.strokeStyle = `rgba(10,74,92,${0.1 + r() * 0.1})`;
    c.lineWidth = 2 + r() * 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(x, yFoot(x) + 6);
    c.quadraticCurveTo(x + bend * 0.4, yFoot(x) - hh * 0.55, x + bend, yFoot(x) - hh);
    c.stroke();
  }

  // distant rock stacks
  const humps = Math.max(3, Math.round(w / 260));
  for (let i = 0; i < humps; i++) {
    const cx = (i + 0.5) * (w / humps) + (r() - 0.5) * (w / humps) * 0.6;
    const hw = w * (0.08 + r() * 0.13);
    // never taller than its own footing, or the roughness clips flat at the top
    const hh = Math.min(h * (0.3 + r() * 0.42), yFoot(cx) * 0.78);
    domePath(c, cx, yFoot(cx) + 4, hw, hh, i * 13 + 3, 0.22, 20);
    c.fillStyle = `rgba(13,80,142,${0.34 + r() * 0.16})`;
    c.fill();
  }

  // unifying depth haze — only where something was actually drawn
  c.globalCompositeOperation = "source-atop";
  const hz = c.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, "rgba(56,178,224,0.42)");
  hz.addColorStop(0.7, "rgba(24,116,184,0.16)");
  hz.addColorStop(1, "rgba(14,80,150,0.04)");
  c.fillStyle = hz;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
}

function paintMid(c: Ctx, w: number, h: number, pad: number, floorY: number, H: number, S: number) {
  const r = mulberry32(90210);
  const top = H - h;
  const yFoot = (sx: number) => seabedAt(sx - pad, floorY, H) - top;

  const rock = (cx: number, hw: number, hh: number, seed: number, alpha: number) => {
    const foot = yFoot(cx) + 6;
    // rim light first, then the body over it — leaves a lit sliver up-left
    domePath(c, cx - S * 0.012, foot - S * 0.016, hw, hh, seed, 0.3, 24);
    c.fillStyle = "rgba(120,224,255,0.34)";
    c.fill();
    domePath(c, cx, foot, hw, hh, seed, 0.3, 24);
    c.fillStyle = `rgba(9,56,104,${alpha})`;
    c.fill();
    // crevices
    c.save();
    domePath(c, cx, foot, hw, hh, seed, 0.3, 24);
    c.clip();
    c.strokeStyle = "rgba(4,30,62,0.4)";
    c.lineWidth = Math.max(1.5, S * 0.008);
    for (let k = 0; k < 3; k++) {
      const sx = cx + (r() - 0.5) * hw * 1.2;
      c.beginPath();
      c.moveTo(sx, foot - hh * (0.15 + r() * 0.3));
      c.quadraticCurveTo(sx + hw * 0.1, foot - hh * 0.05, sx + (r() - 0.5) * hw * 0.4, foot);
      c.stroke();
    }
    c.restore();
    // algae tuft on the shoulder
    c.strokeStyle = "rgba(12,96,86,0.5)";
    c.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const sx = cx + (r() - 0.5) * hw * 1.1;
      const sy = foot - hh * (0.5 + r() * 0.35);
      c.lineWidth = Math.max(1.5, S * 0.007);
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + S * 0.01, sy - S * 0.02, sx + (r() - 0.5) * S * 0.04, sy - S * 0.035);
      c.stroke();
    }
  };

  const stacks = clamp(Math.round(w / 250), 2, 8);
  for (let i = 0; i < stacks; i++) {
    const cx = (i + 0.5) * (w / stacks) + (r() - 0.5) * (w / stacks) * 0.5;
    rock(cx, S * (0.1 + r() * 0.17), Math.min(h * 0.82, H * (0.1 + r() * 0.26)), i * 7 + 2, 0.8 + r() * 0.12);
  }

  /* hero silhouette — a half-buried shipwreck */
  // bounded by the layer height too, so the mast never clips on wide/short screens
  const shipS = clamp(Math.min(w * 0.3, S * 0.5, H * 0.26), 46, 320);
  const sx0 = pad + (w - pad * 2) * 0.68;
  c.save();
  c.translate(sx0, yFoot(sx0) + shipS * 0.1);
  c.rotate(-0.12);
  const dark = "rgba(6,42,80,0.9)";
  const rim = "rgba(126,226,255,0.32)";
  // rim pass
  c.save();
  c.translate(-shipS * 0.02, -shipS * 0.03);
  c.fillStyle = rim;
  c.beginPath();
  c.moveTo(-shipS * 0.9, 0);
  c.quadraticCurveTo(-shipS * 0.75, -shipS * 0.42, -shipS * 0.1, -shipS * 0.44);
  c.quadraticCurveTo(shipS * 0.6, -shipS * 0.46, shipS * 0.95, -shipS * 0.72);
  c.lineTo(shipS * 0.86, shipS * 0.06);
  c.quadraticCurveTo(shipS * 0.1, shipS * 0.2, -shipS * 0.9, 0);
  c.closePath();
  c.fill();
  c.restore();
  // hull
  c.fillStyle = dark;
  c.beginPath();
  c.moveTo(-shipS * 0.9, 0);
  c.quadraticCurveTo(-shipS * 0.75, -shipS * 0.42, -shipS * 0.1, -shipS * 0.44);
  c.quadraticCurveTo(shipS * 0.6, -shipS * 0.46, shipS * 0.95, -shipS * 0.72);
  c.lineTo(shipS * 0.86, shipS * 0.06);
  c.quadraticCurveTo(shipS * 0.1, shipS * 0.2, -shipS * 0.9, 0);
  c.closePath();
  c.fill();
  // broken ribs
  c.strokeStyle = dark;
  c.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const bx = -shipS * 0.66 + i * shipS * 0.17;
    c.lineWidth = shipS * 0.055;
    c.beginPath();
    c.moveTo(bx, -shipS * 0.3);
    c.quadraticCurveTo(bx - shipS * 0.06, -shipS * 0.62, bx - shipS * 0.02, -shipS * 0.78 + i * shipS * 0.06);
    c.stroke();
  }
  // mast + spar + rigging
  c.lineWidth = shipS * 0.06;
  c.beginPath();
  c.moveTo(shipS * 0.24, -shipS * 0.42);
  c.lineTo(shipS * 0.52, -shipS * 1.5);
  c.stroke();
  c.lineWidth = shipS * 0.035;
  c.beginPath();
  c.moveTo(shipS * 0.12, -shipS * 1.06);
  c.lineTo(shipS * 0.86, -shipS * 1.24);
  c.stroke();
  c.strokeStyle = "rgba(6,42,80,0.55)";
  c.lineWidth = shipS * 0.016;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(shipS * 0.5, -shipS * 1.44);
    c.quadraticCurveTo(shipS * (0.1 + i * 0.28), -shipS * (0.9 - i * 0.1), shipS * (-0.2 + i * 0.5), -shipS * 0.44);
    c.stroke();
  }
  // portholes catching the light
  c.fillStyle = "rgba(150,236,255,0.2)";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(shipS * (-0.1 + i * 0.3), -shipS * 0.2, shipS * 0.05, 0, TAU);
    c.fill();
  }
  // kelp draped over the wreck
  c.strokeStyle = "rgba(12,96,86,0.55)";
  c.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const bx = -shipS * 0.7 + i * shipS * 0.34;
    c.lineWidth = shipS * 0.045;
    c.beginPath();
    c.moveTo(bx, -shipS * 0.4);
    c.quadraticCurveTo(bx + shipS * 0.1, -shipS * 0.62, bx + shipS * 0.05, -shipS * 0.82);
    c.stroke();
  }
  c.restore();

  // haze wash so the mid plane still sits behind the foreground
  c.globalCompositeOperation = "source-atop";
  const hz = c.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, "rgba(34,150,206,0.3)");
  hz.addColorStop(1, "rgba(16,92,164,0.06)");
  c.fillStyle = hz;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
}

function paintFloor(c: Ctx, w: number, h: number, top: number, floorY: number, H: number) {
  const r = mulberry32(8125);
  const yAt = (x: number) => seabedAt(x, floorY, H) - top;

  c.beginPath();
  c.moveTo(0, yAt(0));
  for (let x = 6; x <= w; x += 6) c.lineTo(x, yAt(x));
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffeec6");
  g.addColorStop(0.24, "#f7dda4");
  g.addColorStop(0.66, "#e8bf7c");
  g.addColorStop(1, "#cf9d5c");
  c.fillStyle = g;
  c.fill();

  c.save();
  c.clip();

  // ripple corduroy following the dune line
  c.lineCap = "round";
  const rows = Math.max(4, Math.round(h / 13));
  for (let i = 0; i < rows; i++) {
    const u = i / rows;
    const drop = h * (0.04 + u * 1.02);
    const amp = 3 + u * 9;
    c.beginPath();
    for (let x = 0; x <= w; x += 14) {
      const yy = yAt(x) + drop + Math.sin(x * 0.024 + i * 0.9) * amp * 0.5 + fbm1(x * 0.01 + i, 2, i) * amp;
      if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.strokeStyle = `rgba(168,116,58,${0.08 + u * 0.05})`;
    c.lineWidth = 2.4 + u * 2;
    c.stroke();
    c.beginPath();
    for (let x = 0; x <= w; x += 14) {
      const yy = yAt(x) + drop - 2.4 + Math.sin(x * 0.024 + i * 0.9) * amp * 0.5 + fbm1(x * 0.01 + i, 2, i) * amp;
      if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.strokeStyle = "rgba(255,247,214,0.2)";
    c.lineWidth = 1.6;
    c.stroke();
  }

  // grain
  c.fillStyle = "rgba(255,255,255,0.16)";
  const grains = Math.min(520, Math.round(w * h / 340));
  for (let i = 0; i < grains; i++) {
    const gx = r() * w;
    const gy = yAt(gx) + r() * (h - yAt(gx));
    c.fillRect(gx, gy, 1.4, 1.4);
  }
  c.fillStyle = "rgba(140,92,40,0.14)";
  for (let i = 0; i < grains * 0.6; i++) {
    const gx = r() * w;
    const gy = yAt(gx) + r() * (h - yAt(gx));
    c.fillRect(gx, gy, 1.6, 1.6);
  }

  // pebbles + shells
  const pebbles = Math.min(70, Math.max(10, Math.round(w / 24)));
  for (let i = 0; i < pebbles; i++) {
    const px = r() * w;
    const py = yAt(px) + h * 0.1 + r() * h * 0.85;
    const pr = 2 + r() * 5;
    c.beginPath();
    c.ellipse(px, py, pr, pr * 0.72, r() * 3, 0, TAU);
    c.fillStyle = `rgba(126,88,44,${0.14 + r() * 0.16})`;
    c.fill();
    c.beginPath();
    c.ellipse(px - pr * 0.25, py - pr * 0.3, pr * 0.5, pr * 0.3, 0, 0, TAU);
    c.fillStyle = "rgba(255,248,226,0.3)";
    c.fill();
  }
  const shells = Math.min(10, Math.max(2, Math.round(w / 220)));
  for (let i = 0; i < shells; i++) {
    const px = r() * w;
    shell(c, px, yAt(px) + h * (0.25 + r() * 0.6), 22 + r() * 16, r);
  }
  c.restore();

  // contact shadow + sunlit crest along the dune edge
  c.beginPath();
  c.moveTo(0, yAt(0));
  for (let x = 6; x <= w; x += 6) c.lineTo(x, yAt(x));
  c.strokeStyle = "rgba(255,250,222,0.8)";
  c.lineWidth = 2.4;
  c.stroke();
  c.beginPath();
  c.moveTo(0, yAt(0) + 5);
  for (let x = 6; x <= w; x += 6) c.lineTo(x, yAt(x) + 5);
  c.strokeStyle = "rgba(150,102,48,0.14)";
  c.lineWidth = 6;
  c.stroke();
}

function paintReef(c: Ctx, w: number, top: number, floorY: number, H: number, S: number) {
  const r = mulberry32(1337);
  const n = clamp(Math.round(w / 84), 8, 30);
  const props: { x: number; y: number; s: number; k: number; col: [string, string] }[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i + r() * 0.9) / n) * w;
    props.push({
      x,
      y: seabedAt(x, floorY, H) - top + S * 0.012,
      s: clamp(S * (0.055 + r() * 0.07), 14, 74),
      k: r(),
      col: REEF_COLS[Math.floor(r() * REEF_COLS.length)],
    });
  }
  props.sort((a, b) => a.y - b.y);
  for (const p of props) {
    const sub = mulberry32(Math.floor(p.x * 7.13 + p.k * 991));
    const [col, tip] = p.col;
    // soft contact shadow so nothing floats
    c.beginPath();
    c.ellipse(p.x, p.y + p.s * 0.03, p.s * 0.5, p.s * 0.1, 0, 0, TAU);
    c.fillStyle = "rgba(120,80,36,0.16)";
    c.fill();
    if (p.k < 0.26) coralBranch(c, p.x, p.y, p.s * 1.5, sub, col, tip);
    else if (p.k < 0.44) coralBrain(c, p.x, p.y, p.s * 1.5, sub, col, tip);
    else if (p.k < 0.6) coralFan(c, p.x, p.y, p.s * 1.2, sub, col, tip);
    else if (p.k < 0.74) coralTube(c, p.x, p.y, p.s * 1.4, sub, col, tip);
    else if (p.k < 0.83) urchin(c, p.x, p.y, p.s * 1.5, sub);
    else if (p.k < 0.92) starfish(c, p.x, p.y, p.s * 1.2, sub, col, tip);
    else reefRock(c, p.x, p.y, p.s * 1.3, Math.floor(p.k * 100));
  }
}

/**
 * The whole water column, baked. It was a live gradient fill, which banded
 * badly over 800px of near-identical blue; baking it costs the same one blit
 * per frame and buys room for a dither pass that kills the banding outright.
 * It also lets the column carry the time of day — night water is genuinely a
 * different, colder colour, not the day colour with a filter over it.
 */
function paintWater(c: Ctx, w: number, h: number) {
  c.fillStyle = vGrad(c, 0, h, [
    [0.00, ramp("#0d2f57", "#6fd3dd", "#8af4ff")],
    [0.08, ramp("#0a2547", "#41aec6", "#4ad9f4")],
    [0.30, ramp("#081c39", "#1e87b0", "#15abdf")],
    [0.56, ramp("#06152c", "#136394", "#0c7ec6")],
    [0.80, ramp("#04101f", "#0d4670", "#0a5596")],
    [1.00, ramp("#030a16", "#093352", "#083c74")],
  ]);
  c.fillRect(0, 0, w, h);
  dither(c, 0, 0, w, h, 0.13);
}

/**
 * One shaft of light. The old rays were flat polygons, so each carried two
 * hard vertical seams down the frame; a shaft of light in water has no edge at
 * all, it just runs out. So: paint the light as a plain vertical falloff, then
 * cut it to a cone with a *blurred* mask. The blur is what removes the edge,
 * it happens once at bake time, and it leaves one blit per ray in the frame
 * rather than a stack of overlapping ones.
 */
function paintRay(c: Ctx, w: number, h: number, rgb: string) {
  c.fillStyle = vGrad(c, 0, h, [
    [0, `rgba(${rgb},0)`],
    [0.11, `rgba(${rgb},0.9)`],
    [0.42, `rgba(${rgb},0.44)`],
    [0.78, `rgba(${rgb},0.12)`],
    [1, `rgba(${rgb},0)`],
  ]);
  c.fillRect(0, 0, w, h);

  c.globalCompositeOperation = "destination-in";
  const cx = w * 0.5;
  const cone = () => {
    c.beginPath();
    c.moveTo(cx - w * 0.09, -h * 0.06);
    c.lineTo(cx + w * 0.09, -h * 0.06);
    c.lineTo(cx + w * 0.33, h * 1.06);
    c.lineTo(cx - w * 0.33, h * 1.06);
    c.closePath();
  };
  if (typeof c.filter === "string") {
    c.filter = `blur(${(w * 0.14).toFixed(1)}px)`;
    c.fillStyle = "#000";
    cone();
    c.fill();
    c.filter = "none";
  } else {
    // no filter support: a horizontal falloff across the cone still beats an edge
    c.save();
    cone();
    c.clip();
    const g = c.createLinearGradient(cx - w * 0.42, 0, cx + w * 0.42, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
  c.globalCompositeOperation = "source-over";
}

/** A jellyfish bell. The tentacles are live, because they lag the pulse. */
function paintJelly(c: Ctx, w: number, h: number, body: string, rim: string) {
  const cx = w / 2, by = h * 0.72, rx = w * 0.44, ry = h * 0.56;
  const g = c.createRadialGradient(cx - rx * 0.25, by - ry * 0.6, rx * 0.1, cx, by - ry * 0.3, rx * 1.15);
  g.addColorStop(0, rim);
  g.addColorStop(0.55, body);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, by - ry * 0.28, rx, ry, 0, Math.PI, 0);
  c.quadraticCurveTo(cx, by + ry * 0.22, cx - rx, by - ry * 0.28);
  c.closePath();
  c.fill();
  // the gastric ring and four radial canals you can see straight through
  c.strokeStyle = rim;
  c.globalAlpha = 0.5;
  c.lineWidth = Math.max(1, w * 0.018);
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4;
    c.beginPath();
    c.moveTo(lerp(cx - rx * 0.72, cx + rx * 0.72, u), by - ry * 0.34);
    c.lineTo(lerp(cx - rx * 0.3, cx + rx * 0.3, u), by - ry * 0.86);
    c.stroke();
  }
  c.beginPath();
  c.ellipse(cx, by - ry * 0.32, rx * 0.72, ry * 0.14, 0, 0, TAU);
  c.stroke();
  c.globalAlpha = 1;
  // the scalloped lip
  c.beginPath();
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const x = lerp(cx - rx, cx + rx, u);
    c.lineTo(x, by - ry * 0.28 + Math.sin(u * Math.PI * 5) * ry * 0.05);
  }
  c.strokeStyle = rim;
  c.lineWidth = Math.max(1, w * 0.022);
  c.stroke();
}

const paintJellyA = (c: Ctx, w: number, h: number) => paintJelly(
  c, w, h,
  rampA("#4fd8b0", "#f0a0bc", "#ffb0cc", 0.5),
  rampA("#c8fff0", "#ffe0ec", "#fff0f6", 0.95),
);
const paintJellyB = (c: Ctx, w: number, h: number) => paintJelly(
  c, w, h,
  rampA("#4fb4d8", "#a68cf0", "#b79cff", 0.5),
  rampA("#c8f4ff", "#e6dcff", "#efe4ff", 0.95),
);

function paintCaustic(c: Ctx, w: number, h: number) {
  const r = mulberry32(31337);
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";
  const strands = clamp(Math.round((w * h) / 4200), 40, 300);
  for (let i = 0; i < strands; i++) {
    const x0 = r() * w;
    const y0 = r() * h;
    const a = r() * TAU;
    const len = h * (0.18 + r() * 0.5);
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len * 0.5;
    const mx = (x0 + x1) / 2 + Math.cos(a + 1.57) * len * (r() - 0.5) * 1.1;
    const my = (y0 + y1) / 2 + Math.sin(a + 1.57) * len * (r() - 0.5) * 0.6;
    c.strokeStyle = `rgba(255,252,226,${0.05 + r() * 0.1})`;
    c.lineWidth = 1 + r() * 4;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(mx, my, x1, y1);
    c.stroke();
  }
  const nodes = clamp(Math.round(w / 26), 12, 70);
  for (let i = 0; i < nodes; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = h * (0.03 + r() * 0.07);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,236,${0.16 + r() * 0.16})`);
    g.addColorStop(1, "rgba(255,255,236,0)");
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fade the edges so surging copies never show a seam
  c.globalCompositeOperation = "destination-in";
  const fy = c.createLinearGradient(0, 0, 0, h);
  fy.addColorStop(0, "rgba(0,0,0,0)");
  fy.addColorStop(0.32, "rgba(0,0,0,0.55)");
  fy.addColorStop(0.62, "rgba(0,0,0,1)");
  fy.addColorStop(1, "rgba(0,0,0,0.55)");
  c.fillStyle = fy;
  c.fillRect(0, 0, w, h);
  const fx2 = c.createLinearGradient(0, 0, w, 0);
  fx2.addColorStop(0, "rgba(0,0,0,0)");
  fx2.addColorStop(0.1, "rgba(0,0,0,1)");
  fx2.addColorStop(0.9, "rgba(0,0,0,1)");
  fx2.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = fx2;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
}

function paintFrond(c: Ctx, w: number, h: number, seed: number) {
  const r = mulberry32(seed);
  if (typeof c.filter === "string") c.filter = `blur(${Math.max(2, w * 0.02)}px)`;
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const bx = w * (0.28 + r() * 0.5);
    const lean = (r() - 0.5) * w * 0.8;
    const hh = h * (0.6 + r() * 0.4);
    c.strokeStyle = `rgba(5,38,72,${0.5 + r() * 0.3})`;
    c.lineWidth = w * (0.06 + r() * 0.07);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(bx, h);
    c.quadraticCurveTo(bx + lean * 0.3, h - hh * 0.55, bx + lean, h - hh);
    c.stroke();
    for (let f = 1; f <= 4; f++) {
      const u = f / 4.6;
      const fxp = bx + lean * u * u;
      const fyp = h - hh * u;
      c.lineWidth = w * 0.035;
      c.beginPath();
      c.moveTo(fxp, fyp);
      c.quadraticCurveTo(fxp + w * 0.16, fyp - h * 0.03, fxp + w * (0.1 + r() * 0.2), fyp - h * 0.08);
      c.stroke();
    }
  }
  if (typeof c.filter === "string") c.filter = "none";
}

/** One clam half-shell, hinge-anchored at the bottom centre. Stamped twice. */
function paintClamShell(c: Ctx, w: number, h: number) {
  c.beginPath();
  c.moveTo(0, h);
  c.quadraticCurveTo(w * 0.075, h * 0.05, w * 0.5, 0);
  c.quadraticCurveTo(w * 0.925, h * 0.05, w, h);
  c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#fff3e6");
  g.addColorStop(1, "#e2c2a4");
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = "rgba(180,128,96,0.42)";
  c.lineWidth = w * 0.035;
  for (let k = -3; k <= 3; k++) {
    c.beginPath();
    c.moveTo(w * 0.5, 0);
    c.lineTo(w * 0.5 + k * w * 0.21, h);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = "rgba(255,250,240,0.7)";
  c.lineWidth = w * 0.022;
  c.beginPath();
  c.moveTo(w * 0.06, h * 0.86);
  c.quadraticCurveTo(w * 0.12, h * 0.12, w * 0.5, h * 0.05);
  c.stroke();
}

function paintDot(c: Ctx, w: number, h: number, inner: string, mid: string) {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function paintFish(c: Ctx, w: number, h: number, body: string, back: string) {
  c.fillStyle = body;
  c.beginPath();
  c.ellipse(w * 0.56, h * 0.5, w * 0.34, h * 0.28, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(w * 0.26, h * 0.5);
  c.lineTo(w * 0.02, h * 0.14);
  c.lineTo(w * 0.06, h * 0.5);
  c.lineTo(w * 0.02, h * 0.86);
  c.closePath();
  c.fill();
  c.fillStyle = back;
  c.beginPath();
  c.ellipse(w * 0.58, h * 0.38, w * 0.26, h * 0.1, 0, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(10,30,50,0.65)";
  c.beginPath();
  c.arc(w * 0.82, h * 0.46, Math.max(0.6, w * 0.035), 0, TAU);
  c.fill();
}

/* ── persistent per-world state ──────────────────────────────────────────── */

interface Anemone { x: number; s: number; ph: number; body: string; tent: string; tip: string }
interface Kelp { x: number; h: number; ph: number; w: number; col: string; dep: number }
interface Clam { x: number; s: number; ph: number; per: number }
interface Vent { x: number; rate: number; ph: number }
interface Bio { x: number; y: number; r: number; ph: number; sp: number; alt: boolean }
/** A shaft of light. Seeded, so the shafts are never evenly spaced. */
interface Ray { x: number; w: number; sp: number; ph: number; a: number }
/** A jellyfish: it rises when it contracts and sinks when it relaxes. */
interface Jelly { x: number; y: number; home: number; ph: number; per: number; s: number; k: number; wob: number }
interface Bokeh { x: number; y: number; r: number; sp: number; a: number; dark: boolean; ph: number }
interface Snow { x: number; y: number; r: number; sp: number; ph: number }
interface Props {
  sig: string;
  anem: Anemone[]; kelp: Kelp[]; clam: Clam[]; vent: Vent[];
  bio: Bio[]; bok: Bokeh[]; snow: Snow[]; ray: Ray[]; jelly: Jelly[]; far: Far[];
}
/** A fish so far off it is only a smudge of a slightly darker blue. */
interface Far { y: number; s: number; sp: number; ph: number; dir: number }

interface Fish { ox: number; oy: number; x: number; y: number; ph: number; sc: number }
interface School {
  nx: number; ny: number; vx: number; vy: number; dir: number;
  wob: number; depth: number; ang: number; pa: number; bank: number; ready: boolean; fish: Fish[];
}

interface Bub { x: number; y: number; r: number; v: number; ph: number; life: number }
interface Ev { last: number; u: number }

/** Per-size gradients, built once and reused until the canvas resizes. */
interface Grads { sig: string; ctx: Ctx; bounce: CanvasGradient; surf: CanvasGradient; deep: CanvasGradient }

const SHELL_SIDES = [-1, 1];   // hoisted: the clam loop runs every frame

function buildGrads(ctx: Ctx, H: number, floorY: number, surfH: number, sig: string): Grads {
  return {
    sig, ctx,
    bounce: vGrad(ctx, floorY - H * 0.3, floorY + H * 0.02, [
      [0, "rgba(255,206,128,0)"], [1, "rgba(255,198,116,0.16)"],
    ]),
    surf: vGrad(ctx, 0, surfH, [
      [0, rampA("#4a6ea8", "#ffe4bc", "#f0fffc", 0.72)],
      [0.45, rampA("#33507f", "#ffcfa0", "#c4f6ff", 0.28)],
      [1, rampA("#26406a", "#e0b48c", "#b4f0ff", 0)],
    ]),
    // the cold weight of deep water, laid over the lower third after dark
    deep: vGrad(ctx, H * 0.34, H, [
      [0, "rgba(4,12,30,0)"], [0.55, "rgba(4,12,30,0.5)"], [1, "rgba(3,9,22,0.86)"],
    ]),
  };
}

function buildProps(sig: string): Props {
  const r = mulberry32(20260822);
  const anem: Anemone[] = [];
  for (let i = 0; i < 7; i++) {
    const col = REEF_COLS[Math.floor(r() * REEF_COLS.length)];
    anem.push({ x: (i + 0.35 + r() * 0.3) / 7, s: 0.7 + r() * 0.6, ph: r() * TAU, body: col[0], tent: col[1], tip: col[0] });
  }
  const kelp: Kelp[] = [];
  for (let i = 0; i < 14; i++) {
    kelp.push({
      x: (i + r() * 0.85) / 14,
      h: 0.2 + r() * 0.34,
      ph: r() * TAU,
      w: 0.6 + r() * 0.8,
      col: r() > 0.5 ? "#0f7a5c" : "#0b5d4b",
      dep: 0.5 + r() * 0.6,
    });
  }
  const clam: Clam[] = [];
  for (let i = 0; i < 5; i++) clam.push({ x: (i + 0.3 + r() * 0.4) / 5, s: 0.7 + r() * 0.8, ph: r() * 20, per: 9 + r() * 9 });
  const vent: Vent[] = [];
  for (let i = 0; i < 4; i++) vent.push({ x: (i + 0.25 + r() * 0.5) / 4, rate: 0.14 + r() * 0.1, ph: r() * TAU });
  const bio: Bio[] = [];
  for (let i = 0; i < 48; i++) {
    bio.push({ x: r(), y: 0.5 + r() * 0.46, r: 0.5 + r() * 1.4, ph: r() * TAU, sp: 0.4 + r() * 0.8, alt: r() > 0.62 });
  }
  const bok: Bokeh[] = [];
  for (let i = 0; i < 14; i++) {
    bok.push({ x: r(), y: r(), r: 0.02 + r() * 0.055, sp: 0.02 + r() * 0.05, a: 0.06 + r() * 0.12, dark: r() > 0.55, ph: r() * TAU });
  }
  const snow: Snow[] = [];
  for (let i = 0; i < 70; i++) snow.push({ x: r(), y: r(), r: 0.7 + r() * 1.5, sp: 0.01 + r() * 0.03, ph: r() * TAU });
  /* Light shafts. Evenly-spaced rays read as a picket fence, so the base
     positions are jittered off the grid and every shaft gets its own width,
     brightness and sway speed. */
  const ray: Ray[] = [];
  for (let i = 0; i < 8; i++) {
    ray.push({
      x: (i + 0.18 + r() * 0.64) / 8,
      w: 0.72 + r() * 0.85,
      sp: 0.05 + r() * 0.075,
      ph: r() * TAU,
      a: 0.55 + r() * 0.45,
    });
  }
  /* Jellyfish drifting through the mid-water, which was the emptiest part of
     the frame. They pulse; the pulse is why they move. */
  const jelly: Jelly[] = [];
  for (let i = 0; i < 3; i++) {
    const home = 0.30 + r() * 0.24;
    jelly.push({
      x: 0.18 + r() * 0.68, y: home, home, ph: r(),
      per: 3.4 + r() * 2.6, s: 0.72 + r() * 0.6, k: i % 2, wob: r() * 40,
    });
  }
  /* Fish at the edge of visibility. They read as depth, not as fish. */
  const far: Far[] = [];
  for (let i = 0; i < 6; i++) {
    far.push({
      y: 0.14 + r() * 0.42, s: 0.03 + r() * 0.035,
      sp: 0.010 + r() * 0.016, ph: r(), dir: r() > 0.45 ? 1 : -1,
    });
  }
  return { sig, anem, kelp, clam, vent, bio, bok, snow, ray, jelly, far };
}

function buildSchools(): School[] {
  const out: School[] = [];
  for (let s = 0; s < 2; s++) {
    const r = mulberry32(9001 + s * 733);
    const fish: Fish[] = [];
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU;
      const rad = Math.sqrt(r());
      fish.push({ ox: Math.cos(a) * rad, oy: Math.sin(a) * rad * 0.55, x: 0, y: 0, ph: r() * TAU, sc: 0.7 + r() * 0.7 });
    }
    out.push({
      nx: r(), ny: 0.2 + s * 0.16 + r() * 0.12, vx: s ? -1 : 1, vy: 0, dir: s ? -1 : 1,
      wob: r() * 30, depth: s, ang: s ? Math.PI : 0, pa: s ? Math.PI : 0, bank: 0, ready: false, fish,
    });
  }
  return out;
}

/* ── the world ───────────────────────────────────────────────────────────── */

export function drawOcean({ ctx, W, H, t: rt, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 1) || !(H > 1)) return;
  const S = Math.min(W, H);
  const q = quality();
  const rich = richFx();
  const ss = ssFactor(W, H);

  DAY = dayLight();
  WARM = dayWarmth();
  const D = DAY;
  const night = 1 - D;
  const lightK = Math.round(D * 8);
  const sig = `${Math.round(W)}x${Math.round(H)}x${Math.round(floorY)}`;

  /* One scene clock. "Less motion" slows the whole reef — the current, the
     schools, the flyovers — instead of freezing it, and because every phase
     and every event timer reads this one clock they all stay in step. */
  const clk = slot(fx, "oc.clock", () => {
    // park anything a previous world left mid-flight, then stagger the entrance
    fx.fly2.x = -1;
    fx.fly3.x = 2;
    fx.fly2.last = rt + 8;
    fx.fly3.last = rt + 3;
    return { t: rt };
  });
  clk.t += Math.min(0.05, dt) * (calm() ? 0.45 : 1);
  const t = clk.t;
  dt = Math.min(0.05, dt) * (calm() ? 0.45 : 1);

  /* one coherent current every swaying thing reads from */
  // `fly2`/`fly3` are shared across worlds, so a farm visit can leave a stamp
  // from a different clock behind. A stamp far in this world's future would
  // mean no whale for minutes; clear it rather than wait it out.
  if (fx.fly2.last - t > 40) fx.fly2.last = t - 14;
  if (fx.fly3.last - t > 40) fx.fly3.last = t - 20;

  const cur = Math.sin(t * 0.21) * 0.62 + Math.sin(t * 0.097 + 1.9) * 0.38;   // −1‥1
  const surge = Math.sin(t * 0.41) * 0.5 + 0.5;

  const surfH = Math.max(24, H * 0.1);

  let props = slot<Props>(fx, "oc.props", () => buildProps(sig));
  if (props.sig !== sig) { props = buildProps(sig); fx.store["oc.props"] = props; }

  const gsig = `${sig}|${lightK}`;
  let G = slot<Grads>(fx, "oc.grads", () => buildGrads(ctx, H, floorY, surfH, gsig));
  if (G.sig !== gsig || G.ctx !== ctx) { G = buildGrads(ctx, H, floorY, surfH, gsig); fx.store["oc.grads"] = G; }

  const jp = jpal(fx, lightK);

  /* ── 0 · water column ─────────────────────────────────────────────────── */
  ctx.drawImage(hiSprite("oc:water", W, H, ss, `${sig}|${lightK}`, paintWater), 0, 0, W, H);

  // warm bounce light kicked back up off the sand — no sun, no bounce
  if (q > 0 && D > 0.12) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = D;
    ctx.fillStyle = G.bounce;
    ctx.fillRect(0, floorY - H * 0.3, W, H * 0.32);
    ctx.restore();
  }

  /* ── 1 · far plane ────────────────────────────────────────────────────── */
  const PADF = 34;
  const farH = Math.max(24, Math.min(H, H - Math.max(0, floorY - H * 0.46)));
  const farTop = H - farH;
  const farCv = cachedSprite("oc:far", W + PADF * 2, farH, `${sig}`, (c, cw, ch) =>
    paintFar(c, cw, ch, PADF, floorY, H));
  ctx.drawImage(farCv, -PADF + cur * 4, farTop + Math.sin(t * 0.13) * 1.6);

  /* distant fish, dissolved into the haze. They used to march past on fixed
     rails at fixed speeds, which a child spots inside a minute; now each one
     has its own heading, pace and vertical wander drawn from the seeded noise
     field, so no two crossings look the same. */
  ctx.save();
  ctx.fillStyle = jp.far;
  const nFar = detail(5);
  for (let i = 0; i < nFar && i < props.far.length; i++) {
    const f = props.far[i];
    const span = W + S * 0.6;
    const u = ((f.ph + t * f.sp) % 1 + 1) % 1;
    const px = (f.dir > 0 ? u : 1 - u) * span - S * 0.3;
    const py = H * f.y + noise1(t * 0.09 + f.ph * 20, i * 3) * H * 0.05;
    const s = S * f.s;
    // the further off it is, the more the water eats it
    ctx.globalAlpha = 0.07 + (f.s / 0.065) * 0.09;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(f.dir, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.42, Math.sin(t * 0.5 + f.ph * 9) * 0.06, 0, TAU);
    ctx.moveTo(-s, 0);
    ctx.lineTo(-s * 1.62, -s * 0.36);
    ctx.lineTo(-s * 1.62, s * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  /* ── 2 · mid plane ────────────────────────────────────────────────────── */
  const PADM = 52;
  const midH = Math.max(30, Math.min(H, H - Math.max(0, floorY - H * 0.62)));
  const midTop = H - midH;
  const midCv = cachedSprite("oc:mid", W + PADM * 2, midH, `${sig}`, (c, cw, ch) =>
    paintMid(c, cw, ch, PADM, floorY, H, S));
  ctx.drawImage(midCv, -PADM + cur * 15, midTop + Math.sin(t * 0.17 + 1) * 3.4);

  /* ── 3 · mid kelp, alive on the current ───────────────────────────────── */
  const nKelp = detail(clamp(Math.round(W / 140), 4, 14));
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < nKelp && i < props.kelp.length; i++) {
    const k = props.kelp[i];
    const bx = k.x * W;
    const by = seabedAt(bx, floorY, H) + 8;
    const hgt = H * k.h;
    const sway = (cur * 22 + Math.sin(t * 0.9 + k.ph) * 9) * k.dep;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = k.col;
    ctx.lineWidth = Math.max(3, S * 0.016 * k.w);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + sway * 0.35, by - hgt * 0.55, bx + sway, by - hgt);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, S * 0.009 * k.w);
    for (let f = 1; f <= 3; f++) {
      const u = f / 3.4;
      const fyp = by - hgt * u;
      const fxp = bx + sway * u * u;
      const side = f % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(fxp, fyp);
      ctx.quadraticCurveTo(
        fxp + side * S * 0.035 + sway * 0.2, fyp - S * 0.012,
        fxp + side * S * 0.06 + sway * 0.3, fyp - S * 0.005,
      );
      ctx.stroke();
    }
  }
  ctx.restore();

  /* ── 4 · sand floor ───────────────────────────────────────────────────── */
  const flTop = Math.max(0, floorY - H * 0.09);
  const flH = Math.max(12, H - flTop + 2);
  const floorCv = hiSprite("oc:floor", W, flH, ss, `${sig}`, (c, cw, ch) =>
    paintFloor(c, cw, ch, flTop, floorY, H));
  ctx.drawImage(floorCv, 0, flTop, W, flH);

  /* ── 5 · caustics — two surging nets over rock and sand alike ─────────── */
  const PADC = 120;
  const causTop = Math.max(0, floorY - H * 0.34);
  const causH = Math.max(40, H - causTop + 4);
  const causCv = cachedSprite("oc:caust", W + PADC * 2, causH, `${Math.round(W)}x${Math.round(causH)}`,
    (c, cw, ch) => paintCaustic(c, cw, ch));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const causK = 0.12 + D * 0.88;
  ctx.globalAlpha = (0.34 + surge * 0.16) * causK;
  ctx.drawImage(causCv, -PADC + Math.sin(t * 0.19) * PADC * 0.55 + cur * 26, causTop + Math.sin(t * 0.31) * 5);
  if (q > 0) {
    ctx.globalAlpha = (0.2 + (1 - surge) * 0.14) * causK;
    ctx.save();
    ctx.translate(W, causTop - causH * 0.2);
    ctx.scale(-1.28, 1.28);
    ctx.drawImage(causCv, -PADC * 0.4 + Math.cos(t * 0.13) * PADC * 0.5, 0);
    ctx.restore();
  }
  ctx.restore();

  /* ── 6 · static reef ──────────────────────────────────────────────────── */
  const reefTop = Math.max(0, floorY - H * 0.2);
  const reefH = Math.max(16, H - reefTop + 2);
  const reefCv = hiSprite("oc:reef", W, reefH, ss, `${sig}`, (c, cw) =>
    paintReef(c, cw, reefTop, floorY, H, S));
  ctx.drawImage(reefCv, 0, reefTop, W, reefH);

  /* ── 7 · live reef: anemones, clams, vents ────────────────────────────── */
  const nAnem = detail(5);
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < nAnem && i < props.anem.length; i++) {
    const a = props.anem[i];
    const ax = a.x * W;
    const ay = seabedAt(ax, floorY, H) + 2;
    const s = clamp(S * 0.05 * a.s, 10, 46);
    const tent = detail(11);
    ctx.strokeStyle = a.tent;
    ctx.globalAlpha = 0.9;
    for (let k = 0; k < tent; k++) {
      const u = tent === 1 ? 0.5 : k / (tent - 1);
      const ang = -Math.PI / 2 + (u - 0.5) * 2.3;
      const wig = Math.sin(t * 1.7 + a.ph + k * 0.7) * 0.28 + cur * 0.4;
      const len = s * (0.9 + Math.sin(k * 2.3 + a.ph) * 0.22);
      ctx.lineWidth = Math.max(1.6, s * 0.11);
      ctx.beginPath();
      ctx.moveTo(ax, ay - s * 0.18);
      ctx.quadraticCurveTo(
        ax + Math.cos(ang) * len * 0.5, ay - s * 0.18 + Math.sin(ang) * len * 0.6,
        ax + Math.cos(ang + wig) * len, ay - s * 0.18 + Math.sin(ang + wig) * len,
      );
      ctx.stroke();
    }
    ctx.fillStyle = a.body;
    ctx.beginPath();
    ctx.ellipse(ax, ay - s * 0.1, s * 0.4, s * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = a.tip;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(ax - s * 0.1, ay - s * 0.2, s * 0.18, s * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.9;
  }
  ctx.restore();

  /* clams that yawn open on their own clock */
  const clamCv = cachedSprite("oc:clam", 108, 52, "v1", (c, w, h) => paintClamShell(c, w, h));
  const nClam = detail(4);
  ctx.save();
  for (let i = 0; i < nClam && i < props.clam.length; i++) {
    const cl = props.clam[i];
    const cx = cl.x * W;
    const cy = seabedAt(cx, floorY, H) + 4;
    const s = clamp(S * 0.045 * cl.s, 10, 40);
    const ph = ((t + cl.ph) % cl.per) / cl.per;
    const open = ph < 0.26 ? easeOut(ph / 0.26) * (1 - clamp01((ph - 0.18) / 0.08)) : 0;
    const gap = open * 0.62;
    for (const sgn of SHELL_SIDES) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(gap);
      if (sgn < 0) { ctx.scale(1, -1); ctx.globalAlpha = 0.82; }
      ctx.drawImage(clamCv, -s, -s * 0.95, s * 2, s * 0.95);
      ctx.restore();
    }
    if (open > 0.05) {
      bloom(ctx, cx, cy - s * 0.2, s * (1.1 + open), "rgba(200,255,250,0.5)", 0.34 * open);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.globalAlpha = open;
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.18, s * 0.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  /* bubble vents */
  ctx.save();
  ctx.strokeStyle = "#d8f6ff";
  ctx.lineWidth = 1.4;
  const nVent = detail(3);
  for (let v = 0; v < nVent && v < props.vent.length; v++) {
    const ve = props.vent[v];
    const vx = ve.x * W;
    const vy = seabedAt(vx, floorY, H);
    const nb = detail(7);
    for (let i = 0; i < nb; i++) {
      // each bubble leaves on its own beat, so the string never reads as a
      // metronome — and it rises faster as it swells, which is what buoyancy
      // actually does to a bubble
      const jit = noise1(i * 3.1 + v * 11, 5) * 0.4;
      const p = (t * ve.rate * (0.82 + jit * 0.5) + i / nb + ve.ph + jit) % 1;
      const rise = p * p * 0.45 + p * 0.55;
      const by = vy - rise * (floorY * 0.72);
      const bx = vx + Math.sin(t * 2 + i * 2.2 + p * 9) * (4 + p * 16) + cur * p * 26;
      ctx.globalAlpha = (1 - p * 0.75) * 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + p * S * 0.008, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  /* ── 8 · bioluminescence in the deep ──────────────────────────────────── */
  const dotA = cachedSprite("oc:dotA", 40, 40, "v1", (c, w, h) =>
    paintDot(c, w, h, "rgba(220,255,255,1)", "rgba(90,235,255,0.5)"));
  const dotB = cachedSprite("oc:dotB", 40, 40, "v1", (c, w, h) =>
    paintDot(c, w, h, "rgba(235,255,225,1)", "rgba(130,255,180,0.5)"));

  const blm = slot<Ev>(fx, "oc.bloom", () => ({ last: t + 16, u: -1 }));
  if (blm.u < 0 && t - blm.last > 41 + gap(blm.last * 3.1) * 28) { blm.last = t; blm.u = 0; }
  if (blm.u >= 0) {
    blm.u += dt / 6;
    if (blm.u > 1) blm.u = -1;
  }
  const bwave = blm.u >= 0 ? blm.u * 1.5 - 0.25 : -9;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const nBio = detail(34);
  for (let i = 0; i < nBio && i < props.bio.length; i++) {
    const b = props.bio[i];
    const bxn = ((b.x + t * 0.004 * b.sp + cur * 0.006) % 1 + 1) % 1;
    const bx = bxn * W;
    const by = b.y * H + Math.sin(t * 0.5 * b.sp + b.ph) * H * 0.012;
    if (by > H) continue;
    let a = 0.1 + Math.pow(Math.max(0, Math.sin(t * b.sp + b.ph)), 6) * 0.55;
    let rr = S * 0.012 * b.r;
    if (bwave > -1) {
      const d = Math.abs(bxn - bwave);
      const hit = Math.max(0, 1 - d * 5);
      a += hit * 0.75;
      rr *= 1 + hit * 1.6;
    }
    ctx.globalAlpha = clamp01(a) * 0.85 * (0.25 + D * 0.75);
    const img = b.alt ? dotB : dotA;
    ctx.drawImage(img, bx - rr, by - rr, rr * 2, rr * 2);
  }
  if (bwave > -1 && bwave < 1.3) {
    ctx.globalAlpha = 0.14 * Math.sin(clamp01(blm.u) * Math.PI);
    ctx.fillStyle = vGrad(ctx, H * 0.45, H, [
      [0, "rgba(60,230,220,0)"],
      [1, "rgba(80,255,210,0.6)"],
    ]);
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  }
  ctx.restore();

  /* ── 8b · jellyfish in the mid-water ───────────────────────────────────────
     The middle of the frame was the emptiest part of the reef: too deep for
     the surface light, too high for the coral. Jellyfish belong there, and
     they solve the ambient-motion problem honestly — a jellyfish moves because
     it contracts its bell, so the pulse *is* the propulsion. It jets upward on
     the squeeze and sinks back between squeezes, and the tentacles trail a
     beat behind because they are being dragged, not driven. */
  const nJel = Math.max(1, detail(3));
  // sprites and colour strings depend only on the light, so they are built
  // once per light step rather than once per jellyfish per frame
  const jellyA = cachedSprite("oc:jelly0", 112, 112, `v1|${lightK}`, paintJellyA);
  const jellyB = cachedSprite("oc:jelly1", 112, 112, `v1|${lightK}`, paintJellyB);
  ctx.save();
  ctx.lineCap = "round";
  const jelStep = props.jelly.length / Math.max(1, nJel);
  for (let i = 0; i < nJel; i++) {
    const j = props.jelly[Math.min(props.jelly.length - 1, Math.floor(i * jelStep))];
    const beat = ((t / j.per + j.ph) % 1 + 1) % 1;
    const push = Math.pow(Math.max(0, Math.sin(beat * TAU)), 3);
    const lag = Math.pow(Math.max(0, Math.sin(((beat - 0.13) % 1) * TAU)), 3);
    j.y += ((j.home - j.y) * 0.10 + 0.024 - push * 0.105) * dt;
    j.x += (cur * 0.011 + Math.sin(t * 0.13 + j.wob) * 0.005) * dt;
    if (j.x > 1.18) j.x = -0.18;
    if (j.x < -0.18) j.x = 1.18;

    const jx = j.x * W, jy = j.y * H;
    const sz = S * 0.085 * j.s;
    const sq = 1 - push * 0.24;      // the bell narrows as it squeezes …
    const st = 1 + push * 0.20;      // … and lengthens
    const tint = j.k ? jp.tintB : jp.tintA;
    ctx.save();
    ctx.translate(jx, jy);
    ctx.rotate(Math.sin(t * 0.4 + j.wob) * 0.09 + cur * 0.05);
    // tentacles, dragged along behind the pulse
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = tint;
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6;
      const ox = lerp(-sz * 0.4, sz * 0.4, u) * sq;
      const len = sz * (1.15 + (k % 3) * 0.42) * (1 + lag * 0.3);
      const swirl = Math.sin(t * 1.5 + j.wob + k * 1.3) * sz * 0.16 + cur * sz * 0.2 - lag * sz * 0.1;
      ctx.lineWidth = Math.max(1, sz * (k % 2 ? 0.05 : 0.032));
      ctx.beginPath();
      ctx.moveTo(ox, 0);
      ctx.quadraticCurveTo(ox + swirl * 0.45, len * 0.55, ox + swirl, len);
      ctx.stroke();
    }
    // and the bell over the top of them
    const dw = sz * 1.7 * sq, dh = sz * 1.7 * st;
    ctx.globalAlpha = 0.78;
    ctx.drawImage(j.k ? jellyB : jellyA, -dw / 2, -0.72 * dh, dw, dh);
    ctx.restore();
    if (rich) bloom(ctx, jx, jy - sz * 0.55, sz * 2.4, tint, 0.12 + night * 0.1);
  }
  ctx.restore();

  /* ── 9 · life & events ────────────────────────────────────────────────── */
  const fishA = cachedSprite("oc:fishA", 22, 12, "v1", (c, w, h) =>
    paintFish(c, w, h, "rgba(214,244,255,0.92)", "rgba(120,200,240,0.95)"));
  const fishB = cachedSprite("oc:fishB", 22, 12, "v1", (c, w, h) =>
    paintFish(c, w, h, "rgba(255,226,170,0.9)", "rgba(240,160,110,0.9)"));

  const schools = slot<School[]>(fx, "oc.schools", buildSchools);
  for (let si = 0; si < schools.length; si++) {
    const sc = schools[si];
    // steer: constant travel direction + a wandering vertical impulse, bounded
    let dx = sc.dir;
    let dy = noise1(t * 0.17 + sc.wob, sc.depth * 5) * 0.5;
    if (sc.ny < 0.14) dy += (0.14 - sc.ny) * 7;
    if (sc.ny > 0.58) dy -= (sc.ny - 0.58) * 7;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const k = damp(dt, 1.3);
    sc.vx += (dx - sc.vx) * k;
    sc.vy += (dy - sc.vy) * k;
    const spd = 0.075 + sc.depth * 0.035;
    sc.nx += (sc.vx * spd + cur * 0.006) * dt;
    sc.ny += sc.vy * spd * 0.5 * dt;
    if (sc.nx > 1.3) sc.nx = -0.3;
    if (sc.nx < -0.3) sc.nx = 1.3;
    sc.ny = clamp(sc.ny, 0.08, 0.66);

    sc.pa = sc.ang;
    sc.ang = Math.atan2(sc.vy * 0.55, sc.vx);
    let dA = sc.ang - sc.pa;
    while (dA > Math.PI) dA -= TAU;
    while (dA < -Math.PI) dA += TAU;
    sc.bank = lerp(sc.bank, clamp(dt > 0 ? (dA / dt) * 0.6 : 0, -1, 1), 0.18);

    const cxp = sc.nx * W;
    const cyp = sc.ny * H;
    const spread = S * (0.085 + sc.depth * 0.05);
    const ca = Math.cos(sc.ang);
    const sa = Math.sin(sc.ang);
    const n = Math.min(sc.fish.length, detail(sc.depth ? 16 : 24));
    const size = S * (0.024 - sc.depth * 0.006);
    const img = sc.depth ? fishB : fishA;
    const shimmerAll = Math.abs(sc.bank);

    ctx.save();
    ctx.globalAlpha = sc.depth ? 0.5 : 0.78;
    for (let i = 0; i < n; i++) {
      const f = sc.fish[i];
      const ox = f.ox + Math.sin(t * 2.4 + f.ph) * 0.07;
      const oy = f.oy + Math.cos(t * 1.9 + f.ph) * 0.06;
      const tx = cxp + (ox * ca - oy * sa) * spread;
      const ty = cyp + (ox * sa + oy * ca) * spread * 0.8;
      if (!sc.ready) { f.x = tx; f.y = ty; }
      else {
        const kk = damp(dt, 4 + f.sc * 4);
        f.x += (tx - f.x) * kk;
        f.y += (ty - f.y) * kk;
      }
      if (f.x < -size * 3 || f.x > W + size * 3) continue;
      const wig = Math.sin(t * 9 + f.ph) * 0.12;
      const sz = size * f.sc;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(sc.ang + wig);
      ctx.drawImage(img, -sz, -sz * 0.55, sz * 2, sz * 1.1);
      ctx.restore();
    }
    // the whole school flashes as it banks — one shared shimmer, not 24 sines
    if (shimmerAll > 0.12 && q > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp01(shimmerAll) * 0.5;
      for (let i = 0; i < n; i += 2) {
        const f = sc.fish[i];
        const sz = size * f.sc;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(sc.ang);
        ctx.drawImage(img, -sz, -sz * 0.55, sz * 2, sz * 1.1);
        ctx.restore();
      }
    }
    sc.ready = true;
    ctx.restore();
  }

  /* whale flyby — bubble wake + distant song */
  const bubs = slot<Bub[]>(fx, "oc.wbub", () => []);
  if (t - fx.fly2.last > 21 + gap(fx.fly2.last) * 17) { fx.fly2.last = t; fx.fly2.x = 1.4; }
  if (fx.fly2.x > -0.62) {
    fx.fly2.x -= dt * 0.082;
    const wx = fx.fly2.x * W;
    const wy = H * (0.3 + Math.sin(t * 0.35) * 0.05);
    const ws = S * 0.17;
    const song = Math.pow(Math.max(0, Math.sin(t * 0.55)), 8);

    ctx.save();
    ctx.translate(wx, wy);
    ctx.globalAlpha = 0.24;
    const bodyG = ctx.createLinearGradient(0, -ws * 0.6, 0, ws * 0.6);
    bodyG.addColorStop(0, "#0a4a86");
    bodyG.addColorStop(0.55, "#04294a");
    bodyG.addColorStop(1, "#0d5f8f");
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.ellipse(0, 0, ws * 1.5, ws * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();                                        // head bump
    ctx.ellipse(ws * 1.05, -ws * 0.1, ws * 0.55, ws * 0.42, 0, 0, TAU);
    ctx.fill();
    const wag = Math.sin(t * 1.05) * ws * 0.14;
    ctx.beginPath();                                        // fluke
    ctx.moveTo(-ws * 1.4, 0);
    ctx.quadraticCurveTo(-ws * 1.9, -ws * 0.4 + wag, -ws * 2.12, -ws * 0.52 + wag);
    ctx.quadraticCurveTo(-ws * 1.95, wag, -ws * 2.12, ws * 0.5 + wag);
    ctx.quadraticCurveTo(-ws * 1.9, ws * 0.4 + wag, -ws * 1.4, 0);
    ctx.fill();
    ctx.beginPath();                                        // pectoral
    ctx.ellipse(ws * 0.24, ws * 0.44, ws * 0.46, ws * 0.14, 0.55 + Math.sin(t * 1.05) * 0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(180,238,255,0.5)";                // belly pleats + rim
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(ws * (0.85 - i * 0.3), ws * 0.34, ws * 0.1, ws * 0.16, 0.2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(160,235,255,0.45)";
    ctx.lineWidth = Math.max(1.5, ws * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, -ws * 0.03, ws * 1.48, ws * 0.54, 0, Math.PI * 1.08, Math.PI * 1.95);
    ctx.stroke();
    ctx.restore();

    // song shimmer: expanding rings + a whisper of light on the whole scene
    if (song > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let r2 = 0; r2 < 3; r2++) {
        const u = (t * 0.4 + r2 * 0.33) % 1;
        ctx.globalAlpha = song * (1 - u) * 0.2;
        ctx.strokeStyle = "rgba(180,245,255,1)";
        ctx.lineWidth = Math.max(1, S * 0.004);
        ctx.beginPath();
        ctx.ellipse(wx + ws * 1.3, wy - ws * 0.1, ws * (0.6 + u * 3.4), ws * (0.4 + u * 2.4), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      if (rich) bloom(ctx, wx + ws * 1.2, wy, ws * 2.4, "rgba(150,240,255,0.5)", song * 0.12);
    }

    // wake bubbles
    if (bubs.length < 46 && fx.fly2.x < 1.2) {
      bubs.push({
        x: wx - ws * 1.9, y: wy + (noise1(t * 7) * ws * 0.4),
        r: 1.6 + Math.abs(noise1(t * 13)) * S * 0.008,
        v: 12 + Math.abs(noise1(t * 5)) * 26, ph: t * 3, life: 1,
      });
    }
  }
  if (bubs.length) {
    ctx.save();
    ctx.strokeStyle = "rgba(220,248,255,0.65)";
    ctx.lineWidth = 1.3;
    for (let i = bubs.length - 1; i >= 0; i--) {
      const b = bubs[i];
      b.y -= b.v * dt;
      b.x += (Math.sin(t * 2.4 + b.ph) * 8 + cur * 10) * dt;
      b.life -= dt * 0.22;
      if (b.life <= 0 || b.y < -20) { bubs.splice(i, 1); continue; }
      ctx.globalAlpha = clamp01(b.life) * 0.55;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* manta ray glide */
  if (t - fx.fly3.last > 29 + gap(fx.fly3.last * 1.7) * 21) { fx.fly3.last = t; fx.fly3.x = -0.45; }
  if (fx.fly3.x < 1.45) {
    fx.fly3.x += dt * 0.105;
    const mx = fx.fly3.x * W;
    const my = H * (0.24 + Math.sin(fx.fly3.x * 2.4) * 0.07);
    const ms = S * 0.13;
    const flap = Math.sin(t * 1.25);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.cos(fx.fly3.x * 2.4) * 0.12);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#062f5c";
    ctx.beginPath();
    ctx.moveTo(ms * 0.55, 0);
    ctx.quadraticCurveTo(ms * 0.1, -ms * 0.34, -ms * 1.15, -ms * (0.34 + flap * 0.34));
    ctx.quadraticCurveTo(-ms * 0.45, -ms * 0.02, -ms * 0.5, 0);
    ctx.quadraticCurveTo(-ms * 0.45, ms * 0.02, -ms * 1.15, ms * (0.34 - flap * 0.34));
    ctx.quadraticCurveTo(ms * 0.1, ms * 0.34, ms * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();                                       // cephalic fins
    ctx.ellipse(ms * 0.6, -ms * 0.12, ms * 0.2, ms * 0.06, -0.3, 0, TAU);
    ctx.ellipse(ms * 0.6, ms * 0.12, ms * 0.2, ms * 0.06, 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#062f5c";                           // whip tail
    ctx.lineWidth = Math.max(1.4, ms * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-ms * 0.5, 0);
    ctx.quadraticCurveTo(-ms * 1.1, flap * ms * 0.12, -ms * 1.7, flap * ms * 0.3);
    ctx.stroke();
    ctx.strokeStyle = "rgba(160,235,255,0.4)";             // lit leading edge
    ctx.lineWidth = Math.max(1.2, ms * 0.03);
    ctx.beginPath();
    ctx.moveTo(ms * 0.55, 0);
    ctx.quadraticCurveTo(ms * 0.1, -ms * 0.34, -ms * 1.15, -ms * (0.34 + flap * 0.34));
    ctx.stroke();
    ctx.restore();
  }

  /* turtle crossing */
  const tur = slot<Ev>(fx, "oc.turtle", () => ({ last: t + 24, u: -1 }));
  if (tur.u < 0 && t - tur.last > 37 + gap(tur.last * 2.3) * 26) { tur.last = t; tur.u = 0; }
  if (tur.u >= 0) {
    tur.u += dt * 0.055;
    if (tur.u > 1) tur.u = -1;
    else {
      const u = tur.u;
      const tx = lerp(-0.2, 1.2, u) * W;
      const ty = H * (0.4 + Math.sin(u * 5) * 0.05);
      const s = S * 0.075;
      const pad = Math.sin(t * 2.1);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(Math.cos(u * 5) * 0.16);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#0d5a52";
      for (let i = 0; i < 4; i++) {                        // flippers
        const sx = i < 2 ? 0.55 : -0.5;
        const sy = i % 2 ? 1 : -1;
        ctx.save();
        ctx.translate(s * sx, s * sy * 0.36);
        ctx.rotate(sy * (0.5 + pad * (i < 2 ? 0.5 : 0.25)));
        ctx.beginPath();
        ctx.ellipse(0, s * 0.3, s * 0.2, s * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#0f6b5c";                            // head
      ctx.beginPath();
      ctx.ellipse(s * 0.95, 0, s * 0.26, s * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#12796a";                            // shell
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.66, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(6,44,40,0.5)";
      ctx.lineWidth = Math.max(1.2, s * 0.05);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * s * 0.42, 0, s * 0.2, s * 0.36, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(180,240,220,0.35)";             // top light
      ctx.beginPath();
      ctx.ellipse(-s * 0.15, -s * 0.28, s * 0.5, s * 0.16, -0.12, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── 10 · god rays with refraction wobble ─────────────────────────────── */
  const wav = slot<Ev>(fx, "oc.wave", () => ({ last: t + 11, u: -1 }));
  if (wav.u < 0 && t - wav.last > 23 + gap(wav.last * 5.7) * 15) { wav.last = t; wav.u = 0; }
  if (wav.u >= 0) {
    wav.u += dt * 0.26;
    if (wav.u > 1) wav.u = -1;
  }
  const waveX = wav.u >= 0 ? lerp(-0.25, 1.3, wav.u) * W : -1e6;

  /* Sunlight through a moving ceiling. Each shaft is one soft-edged sprite,
     swayed by the swell above it — the ceiling is what is moving, so the
     shafts move with it rather than on their own private timers, and their
     brightness breathes with the same surge that drives the caustics. After
     dark the sun is replaced by two thin, cold moon shafts. */
  const sunX = W * (0.5 + Math.sin(t * 0.05) * 0.1);
  const rayLen = floorY * 0.82;
  const rayW = Math.max(26, S * 0.19);
  const warmRay = WARM > 0.45;
  const rayRGB = D <= 0.2 ? "176,206,255" : warmRay ? "255,238,198" : "222,255,255";
  const rayCv = cachedSprite(
    D > 0.2 ? "oc:raySun" : "oc:rayMoon", 96, 320,
    `v4|${D > 0.2 ? (warmRay ? "w" : "s") : "m"}`,
    (c, w, h) => paintRay(c, w, h, rayRGB),
  );
  const nRay = D > 0.2 ? Math.max(3, detail(6)) : 2;
  const rayK = D > 0.2 ? 0.2 + D * 0.34 : 0.1 + D * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const rayStep = props.ray.length / Math.max(1, nRay);
  for (let i = 0; i < nRay; i++) {
    const r = props.ray[Math.min(props.ray.length - 1, Math.floor(i * rayStep))];
    // the ceiling above is moving, so the shaft under it slides and shivers
    const bx = r.x * W + Math.sin(t * r.sp * 3.1 + r.ph) * S * 0.035
      + noise1(t * 0.09 + r.ph, i * 5) * S * 0.05;
    const near = Math.exp(-Math.pow((bx - waveX) / (W * 0.16), 2));
    const breathe = 0.72 + 0.28 * Math.sin(t * (0.23 + r.sp) + r.ph * 2) + surge * 0.14;
    const a = clamp01(rayK * r.a * breathe * (1 + near * 2.6));
    if (a < 0.006) continue;
    ctx.globalAlpha = a;
    /* Deliberately axis-aligned. A rotated or sheared blit of a shaft this
       size takes the general-transform path and costs more on its own than
       the rest of the reef put together; the convergence toward the sun is
       carried by the cone's taper and by where the shafts are placed. */
    const rw = rayW * r.w * (1 + surge * 0.05);
    ctx.drawImage(rayCv, bx - rw / 2, -H * 0.03, rw, rayLen);
  }
  ctx.restore();

  /* the wave's bright sweep running along the sand */
  if (wav.u >= 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.3 * Math.sin(clamp01(wav.u) * Math.PI);
    const swp = ctx.createLinearGradient(waveX - W * 0.24, 0, waveX + W * 0.24, 0);
    swp.addColorStop(0, "rgba(255,250,220,0)");
    swp.addColorStop(0.5, "rgba(255,250,220,0.75)");
    swp.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = swp;
    ctx.fillRect(waveX - W * 0.24, floorY - H * 0.06, W * 0.48, H - floorY + H * 0.07);
    ctx.restore();
  }

  /* ── 11 · marine snow ─────────────────────────────────────────────────── */
  const nSnow = detail(56);
  ctx.save();
  ctx.fillStyle = "rgba(236,255,252,0.4)";
  ctx.beginPath();
  for (let i = 0; i < nSnow && i < props.snow.length; i++) {
    const p = props.snow[i];
    const px = (((p.x + cur * 0.012 + Math.sin(t * 0.4 + p.ph) * 0.008) % 1) + 1) % 1 * W;
    const py = (((p.y + t * p.sp * 0.6) % 1) + 1) % 1 * H;
    ctx.moveTo(px + p.r, py);
    ctx.arc(px, py, p.r, 0, TAU);
  }
  ctx.fill();
  ctx.restore();

  /* ── 12 · the surface ─────────────────────────────────────────────────── */
  ctx.save();
  ctx.fillStyle = G.surf;
  ctx.fillRect(0, 0, W, surfH);
  ctx.globalCompositeOperation = "lighter";
  // refraction wobble: three interfering crest bands
  for (let i = 0; i < detail(3); i++) {
    ctx.globalAlpha = (0.12 + Math.sin(t * (0.9 + i * 0.4) + i) * 0.05) * (0.35 + D * 0.65);
    wavyBand(
      ctx, W,
      surfH * (0.12 + i * 0.2), surfH * (0.3 + i * 0.24),
      surfH * (0.09 + i * 0.05), 0.012 + i * 0.006, t * (1.1 + i * 0.5) + i * 2,
      "rgba(255,255,246,0.9)", 24,
    );
  }
  // the sun — or, after dark, the moon — seen through the wobbling ceiling
  ctx.globalAlpha = 1;
  bloom(
    ctx, sunX, -surfH * 0.35,
    surfH * ((D > 0.2 ? 2.6 : 1.5) + Math.sin(t * 1.3) * 0.2),
    D > 0.2 ? "rgba(255,252,214,0.75)" : "rgba(196,220,255,0.8)",
    0.1 + D * 0.24,
  );
  if (wav.u >= 0) {
    ctx.globalAlpha = 0.5 * Math.sin(clamp01(wav.u) * Math.PI);
    ctx.fillStyle = "rgba(255,253,232,0.8)";
    ctx.beginPath();
    ctx.ellipse(waveX, surfH * 0.26, W * 0.16, surfH * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* ── 13 · foreground: bokeh debris + out-of-focus fronds ──────────────── */
  const bokL = cachedSprite("oc:bokL", 64, 64, "v1", (c, w, h) =>
    paintDot(c, w, h, "rgba(226,252,255,0.55)", "rgba(180,238,255,0.3)"));
  const bokD = cachedSprite("oc:bokD", 64, 64, "v1", (c, w, h) =>
    paintDot(c, w, h, "rgba(10,52,92,0.6)", "rgba(8,44,84,0.35)"));
  ctx.save();
  const nBok = detail(10);
  for (let i = 0; i < nBok && i < props.bok.length; i++) {
    const b = props.bok[i];
    const bx = (((b.x - t * b.sp * 0.09 + cur * 0.03) % 1) + 1) % 1 * (W + S * 0.3) - S * 0.15;
    const by = (((b.y + Math.sin(t * 0.3 + b.ph) * 0.02) % 1) + 1) % 1 * H;
    const rr = S * b.r * (1 + Math.sin(t * 0.7 + b.ph) * 0.06);
    ctx.globalAlpha = b.a;
    ctx.drawImage(b.dark ? bokD : bokL, bx - rr, by - rr, rr * 2, rr * 2);
  }
  ctx.restore();

  // out-of-focus fronds frame the corners only — the middle stays readable
  const frondW = clamp(S * 0.36, 80, 400);
  const frondH = clamp(H * 0.52, 110, 780);
  const frondCv = cachedSprite("oc:frond", frondW, frondH, "v1", (c, w, h) => paintFrond(c, w, h, 606));
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.translate(-frondW * 0.36, H + frondH * 0.06);
  ctx.rotate(cur * 0.035);
  ctx.drawImage(frondCv, 0, -frondH, frondW, frondH);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.translate(W + frondW * 0.38, H + frondH * 0.04);
  ctx.rotate(-cur * 0.045);
  ctx.scale(-1, 1);
  ctx.drawImage(frondCv, 0, -frondH * 0.84, frondW, frondH * 0.84);
  ctx.restore();

  /* ── 14 · night ───────────────────────────────────────────────────────────
     The water column already carries the hour, so this is the last of it: the
     deep goes properly black, then the reef's own light comes back on. Every
     glow below is additive and drawn *after* the wash, which is the only way
     a light source survives being told the scene is dark. */
  if (night > 0.04) {
    ctx.save();
    ctx.globalAlpha = night * 0.85;
    ctx.fillStyle = G.deep;
    ctx.fillRect(0, H * 0.34, W, H * 0.66);
    ctx.restore();
  }

  applyNight(ctx, W, H);

  if (night > 0.12) {
    const glowK = clamp01((night - 0.12) * 1.5);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    /* the reef lights up: bioluminescence is what the dark is *for* */
    const nBioN = detail(30);
    for (let i = 0; i < nBioN && i < props.bio.length; i++) {
      const b = props.bio[i];
      const bxn = ((b.x + t * 0.004 * b.sp + cur * 0.006) % 1 + 1) % 1;
      const by = b.y * H + Math.sin(t * 0.5 * b.sp + b.ph) * H * 0.012;
      if (by > H) continue;
      // each mote breathes on its own clock, so the field never pulses in time
      const a = 0.18 + Math.pow(Math.max(0, Math.sin(t * b.sp * 0.9 + b.ph)), 3) * 0.7;
      const rr = S * 0.016 * b.r * (1 + a * 0.5);
      ctx.globalAlpha = a * glowK * 0.9;
      ctx.drawImage(b.alt ? dotB : dotA, bxn * W - rr, by - rr, rr * 2, rr * 2);
    }

    /* anemone tips carry their own light; so do the vents, faintly */
    ctx.globalAlpha = 1;
    const nAnemN = detail(5);
    for (let i = 0; i < nAnemN && i < props.anem.length; i++) {
      const a = props.anem[i];
      const ax = a.x * W;
      const ay = seabedAt(ax, floorY, H) + 2;
      const sz = clamp(S * 0.05 * a.s, 10, 46);
      const puff = 0.6 + 0.4 * Math.sin(t * 0.7 + a.ph);
      bloom(ctx, ax, ay - sz * 0.5, sz * 2.1, "rgba(120,255,224,0.55)", glowK * 0.3 * puff);
    }
    for (let v = 0; v < detail(3) && v < props.vent.length; v++) {
      const ve = props.vent[v];
      const vx = ve.x * W;
      bloom(ctx, vx, seabedAt(vx, floorY, H), S * 0.09, "rgba(120,220,255,0.5)", glowK * 0.18);
    }

    /* and the jellyfish, which is when they finally look like what they are */
    for (let i = 0; i < nJel; i++) {
      const j = props.jelly[Math.min(props.jelly.length - 1, Math.floor(i * jelStep))];
      const beat = ((t / j.per + j.ph) % 1 + 1) % 1;
      const push = Math.pow(Math.max(0, Math.sin(beat * TAU)), 3);
      bloom(
        ctx, j.x * W, j.y * H - S * 0.05 * j.s, S * 0.24 * j.s,
        j.k ? "rgba(150,200,255,0.65)" : "rgba(150,255,220,0.65)",
        glowK * (0.16 + push * 0.24),
      );
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ── 15 · grade + vignette ────────────────────────────────────────────── */
  // top-light is already baked into the water gradient, so skip grade's second
  // full-screen pass and keep the finish to two fills.
  grade(ctx, W, H, night > 0.5 ? "#3a6cff" : "#2fd6ff", 0.07 + Math.sin(t * 0.08) * 0.015, 0);
  vignette(ctx, W, H, 0.2 + night * 0.12);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
