// ─── DINO ISLAND world theme ────────────────────────────────────────────────
// Warm adventure-book island at dusk. Depth is built in five planes:
//   ember sky + mountain range → the hero volcano → misty far jungle →
//   fern/palm mid jungle + waterfall → jungle floor + blurred foreground fronds.
//
// As on the farm, every static pixel is baked once into two supersampled
// offscreen layers ("dino.sky" behind the flyers, "dino.isle" in front of them)
// so a frame costs two blits plus the animated set-pieces: the crater, the lava
// flow, the eruption event, the waterfall and the wildlife.
//
// Friendly by design — no fangs, no gore: silhouettes, warm light, big eggs.

import {
  cachedSprite, mulberry32, fbm1, noise1, detail, richFx, quality,
  bloom, glow, vGrad, grade, vignette, slot, lerp, clamp,
  type ThemeFrame, type FxState,
} from "./shared";

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

/** Island breeze — carries the ash plume, the mist and the fireflies together. */
const breeze = (t: number) => 0.55 + 0.30 * noise1(t * 0.19, 13) + 0.22 * Math.max(0, noise1(t * 0.52, 61));

/* ── shared geometry ─────────────────────────────────────────────────────── */

const D = {
  W: 0, H: 0, fY: 0, U: 0, gh: 0,
  mtn: 0,
  vX: 0, vW: 0, vH: 0, craterY: 0, rimW: 0,
  farTop: 0, midTop: 0,
  cliffX: 0, cliffTop: 0, fallX: 0, fallW: 0, fallTop: 0,
  lagX: 0, lagY: 0, lagR: 0,
  nestX: 0, nestY: 0,
};

function setD(W: number, H: number, fY: number) {
  const U = Math.min(W, H);
  D.W = W; D.H = H; D.fY = fY; D.U = U; D.gh = Math.max(1, H - fY);
  D.mtn = fY * 0.80;
  D.vX = W * 0.27;
  D.vW = Math.min(W * 0.86, U * 1.15);
  D.vH = fY * 0.50;
  D.craterY = fY - D.vH;
  D.rimW = D.vW * 0.115;
  D.farTop = fY - fY * 0.150;
  D.midTop = fY - fY * 0.088;
  D.cliffX = W * 0.82; D.cliffTop = fY - fY * 0.175;
  D.fallX = W * 0.845; D.fallW = Math.max(6, U * 0.055); D.fallTop = D.cliffTop + fY * 0.030;
  D.lagX = D.fallX; D.lagY = fY + D.gh * 0.30; D.lagR = Math.min(U * 0.17, W * 0.2);
  D.nestX = W * 0.17; D.nestY = fY + D.gh * 0.58;
}

/** Volcano flank profile: concave cone with a little erosion noise. */
const coneLeft = (p: number) =>
  lerp(D.fY, D.craterY, Math.pow(clamp(p, 0, 1), 1.32)) + fbm1(p * 5.5 + 2.1, 3, 5) * D.U * 0.012;
const coneRight = (p: number) =>
  lerp(D.fY, D.craterY, Math.pow(clamp(p, 0, 1), 1.28)) + fbm1(p * 6.2 + 8.4, 3, 17) * D.U * 0.012;

function conePath(c: CanvasRenderingContext2D) {
  const { vX, vW, craterY, rimW, fY } = D;
  c.beginPath();
  c.moveTo(vX - vW / 2, fY + 2);
  for (let i = 1; i <= 22; i++) {
    const p = i / 22;
    c.lineTo(lerp(vX - vW / 2, vX - rimW, p), coneLeft(p));
  }
  c.lineTo(vX - rimW * 0.66, craterY + D.vH * 0.035);
  c.lineTo(vX + rimW * 0.55, craterY + D.vH * 0.028);
  c.lineTo(vX + rimW, craterY - D.vH * 0.012);
  for (let i = 21; i >= 1; i--) {
    const p = i / 22;
    c.lineTo(lerp(vX + vW / 2, vX + rimW, p), coneRight(p));
  }
  c.lineTo(vX + vW / 2, fY + 2);
  c.closePath();
}

/** The lava channel running down the right flank — sampled by the live glow. */
function lavaPoint(k: number) {
  const { vX, vW, craterY, rimW, fY } = D;
  const p = clamp(k, 0, 1);
  const x = lerp(vX + rimW * 0.35, vX + vW * 0.30, Math.pow(p, 0.85)) + Math.sin(p * 7.3) * D.U * 0.012;
  const y = lerp(craterY + D.vH * 0.02, fY, Math.pow(p, 0.92));
  const w = lerp(D.U * 0.022, D.U * 0.05, p);
  return { x, y, w };
}

/* ── canopy silhouettes ──────────────────────────────────────────────────── */

function canopy(
  c: CanvasRenderingContext2D, W: number, topY: number, baseY: number,
  amp: number, count: number, seed: number, fill: string | CanvasGradient,
) {
  c.fillStyle = fill;
  c.fillRect(0, topY, W, Math.max(0, baseY - topY));
  const r = mulberry32(seed);
  for (let i = 0; i <= count; i++) {
    const x = (i / count) * W + (r() - 0.5) * (W / count) * 1.3;
    const rr = amp * (0.5 + r() * 0.85);
    c.beginPath();
    c.arc(x, topY + rr * 0.30, rr, 0, Math.PI * 2);
    c.fill();
  }
}

/** Ember rim light along a canopy edge, thrown by the volcano. */
function canopyRim(
  c: CanvasRenderingContext2D, W: number, topY: number, amp: number,
  count: number, seed: number, color: string,
) {
  const r = mulberry32(seed);
  c.fillStyle = color;
  for (let i = 0; i <= count; i++) {
    const x = (i / count) * W + (r() - 0.5) * (W / count) * 1.3;
    const rr = amp * (0.5 + r() * 0.85);
    c.beginPath();
    c.arc(x - rr * 0.16, topY + rr * 0.30 - rr * 0.16, rr, Math.PI * 1.05, Math.PI * 1.75);
    c.fill();
  }
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

/* ── layer A: the dusk sky ───────────────────────────────────────────────── */

function paintDinoSky(c: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const { fY } = D;
  c.fillStyle = vGrad(c, 0, fY, [
    [0, "#281a4d"],
    [0.34, "#4d2a63"],
    [0.62, "#95446b"],
    [0.82, "#e0745f"],
    [1, "#ffbe79"],
  ]);
  c.fillRect(0, 0, W, fY + 2);
  c.fillStyle = "#ffbe79";
  c.fillRect(0, fY, W, Math.max(0, H - fY));

  // the sun already below the ridge, blooming behind the volcano
  const sg = c.createRadialGradient(D.vX + W * 0.06, fY * 0.86, 0, D.vX + W * 0.06, fY * 0.86, Math.max(W, fY) * 0.55);
  sg.addColorStop(0, "rgba(255,196,120,0.55)");
  sg.addColorStop(0.35, "rgba(255,150,96,0.22)");
  sg.addColorStop(1, "rgba(255,120,80,0)");
  c.fillStyle = sg;
  c.fillRect(0, 0, W, fY + 2);

  // long dusk cloud slabs catching the last light
  c.save();
  if (richFx()) c.filter = `blur(${(5 * S).toFixed(1)}px)`;
  const r = mulberry32(31337);
  for (let i = 0; i < 16; i++) {
    const y = fY * (0.16 + r() * 0.68);
    const x = r() * W;
    const rw = W * (0.10 + r() * 0.20);
    const warm = y / fY;
    c.globalAlpha = 0.10 + r() * 0.22;
    c.fillStyle = warm > 0.62 ? "#ffc48b" : "#7a4d84";
    c.beginPath();
    c.ellipse(x, y, rw, rw * (0.05 + r() * 0.06), 0, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = "none";
  c.globalAlpha = 1;
  c.restore();

  // distant island ridge, hazed out
  const ridge = (u: number) =>
    D.mtn - Math.pow(clamp(1 - Math.abs(fbm1(u * 3.8 + 4.3, 4, 23)), 0, 1), 3) * fY * 0.20;
  c.beginPath();
  c.moveTo(0, ridge(0));
  for (let x = 8; x < W; x += 8) c.lineTo(x, ridge(x / W));
  c.lineTo(W, ridge(1));
  c.lineTo(W, fY + 2); c.lineTo(0, fY + 2);
  c.closePath();
  c.fillStyle = vGrad(c, D.mtn - fY * 0.20, D.mtn + fY * 0.06, [
    [0, "#5a3a6b"], [1, "#3d2758"],
  ]);
  c.fill();
  c.strokeStyle = "rgba(255,170,110,0.45)";
  c.lineWidth = Math.max(1, D.U * 0.004);
  c.beginPath();
  c.moveTo(0, ridge(0) + D.U * 0.002);
  for (let x = 8; x < W; x += 8) c.lineTo(x, ridge(x / W) + D.U * 0.002);
  c.lineTo(W, ridge(1) + D.U * 0.002);
  c.stroke();
  // haze pooling under the ridge
  c.fillStyle = vGrad(c, D.mtn - fY * 0.06, D.farTop + fY * 0.02, [
    [0, "rgba(255,170,120,0)"], [1, "rgba(255,164,116,0.42)"],
  ]);
  c.fillRect(0, D.mtn - fY * 0.06, W, D.farTop - D.mtn + fY * 0.09);
}

/* ── layer B: the island ─────────────────────────────────────────────────── */

function paintDinoIsle(c: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const { fY, U, gh } = D;
  const rnd = mulberry32(60613);

  paintVolcano(c);

  /* far jungle: cool, misty, low contrast */
  canopy(c, W, D.farTop, fY + 2, U * 0.032, 26, 505, vGrad(c, D.farTop, fY, [
    [0, "#3c6b5e"], [1, "#2a5148"],
  ]));
  canopyRim(c, W, D.farTop, U * 0.032, 26, 505, "rgba(255,166,110,0.16)");
  c.fillStyle = vGrad(c, D.farTop - fY * 0.01, D.midTop + fY * 0.03, [
    [0, "rgba(226,196,214,0.32)"], [1, "rgba(226,196,214,0)"],
  ]);
  c.fillRect(0, D.farTop - fY * 0.01, W, D.midTop - D.farTop + fY * 0.05);

  /* the waterfall cliff, tucked behind the mid jungle */
  paintCliff(c);

  /* mid jungle: palms and tree ferns breaking the canopy line */
  canopy(c, W, D.midTop, fY + 2, U * 0.042, 20, 909, vGrad(c, D.midTop, fY, [
    [0, "#2c5d43"], [1, "#1c3f31"],
  ]));
  const pr = mulberry32(7788);
  for (let i = 0; i < 12; i++) {
    const px = pr() * W;
    const ph = U * (0.09 + pr() * 0.09);
    const lean = pr() > 0.5 ? 1 : -1;
    c.strokeStyle = "#173627";
    c.lineCap = "round";
    c.lineWidth = Math.max(1.5, ph * 0.055);
    c.beginPath();
    c.moveTo(px, D.midTop + U * 0.02);
    c.quadraticCurveTo(px + lean * ph * 0.16, D.midTop - ph * 0.5, px + lean * ph * 0.26, D.midTop - ph);
    c.stroke();
    for (let f = 0; f < 6; f++) {
      const a = -Math.PI * 0.9 + (f / 5) * Math.PI * 1.8;
      frond(c, px + lean * ph * 0.26, D.midTop - ph, ph * 0.5, a, 0.55, "#173627", Math.max(1, ph * 0.035));
    }
  }
  canopyRim(c, W, D.midTop, U * 0.042, 20, 909, "rgba(255,150,92,0.20)");
  c.fillStyle = vGrad(c, D.midTop, fY + gh * 0.05, [
    [0, "rgba(214,186,210,0.26)"], [0.6, "rgba(214,186,210,0.06)"], [1, "rgba(214,186,210,0)"],
  ]);
  c.fillRect(0, D.midTop, W, fY - D.midTop + gh * 0.06);

  /* jungle floor */
  c.fillStyle = vGrad(c, fY, H, [[0, "#2b5b40"], [0.5, "#1c4130"], [1, "#0e2419"]]);
  c.fillRect(0, fY, W, Math.max(0, H - fY));
  // ember-lit rim where the floor meets the jungle
  c.fillStyle = vGrad(c, fY - U * 0.008, fY + U * 0.05, [
    [0, "rgba(255,178,110,0.5)"], [0.3, "rgba(255,160,96,0.18)"], [1, "rgba(255,160,96,0)"],
  ]);
  c.fillRect(0, fY - U * 0.008, W, U * 0.06);

  paintFloorProps(c, W, rnd);

  /* huge out-of-focus fronds framing the bottom corners */
  c.save();
  if (richFx()) c.filter = `blur(${(6 * S).toFixed(1)}px)`;
  const fc = "rgba(9,26,19,0.92)";
  frond(c, -U * 0.05, H + U * 0.02, U * 0.52, -0.95, 0.85, fc, Math.max(3, U * 0.02));
  frond(c, -U * 0.02, H + U * 0.06, U * 0.44, -0.52, 0.7, fc, Math.max(3, U * 0.018));
  frond(c, W + U * 0.05, H + U * 0.02, U * 0.5, Math.PI + 0.95, -0.85, fc, Math.max(3, U * 0.02));
  frond(c, W + U * 0.02, H + U * 0.07, U * 0.42, Math.PI + 0.55, -0.7, fc, Math.max(3, U * 0.018));
  c.filter = "none";
  c.restore();
}

/* ── the hero volcano (static rock; the fire is animated on top) ──────────── */

function paintVolcano(c: CanvasRenderingContext2D) {
  const { fY, U, vX, vW, craterY } = D;

  // warm air pooling around the cone
  const halo = c.createRadialGradient(vX, craterY, U * 0.02, vX, craterY, vW * 0.62);
  halo.addColorStop(0, "rgba(255,146,74,0.34)");
  halo.addColorStop(0.5, "rgba(255,120,70,0.12)");
  halo.addColorStop(1, "rgba(255,110,70,0)");
  c.fillStyle = halo;
  c.fillRect(vX - vW * 0.62, craterY - vW * 0.62, vW * 1.24, vW * 1.24);

  conePath(c);
  c.fillStyle = vGrad(c, craterY, fY, [
    [0, "#5b3550"], [0.35, "#3f2745"], [1, "#241733"],
  ]);
  c.fill();

  c.save();
  conePath(c);
  c.clip();
  // strata bands
  c.strokeStyle = "rgba(18,10,26,0.30)";
  for (let i = 1; i < 7; i++) {
    const y = lerp(craterY, fY, i / 7);
    c.lineWidth = U * (0.006 + (i % 3) * 0.004);
    c.beginPath();
    c.moveTo(vX - vW, y + Math.sin(i) * U * 0.01);
    c.quadraticCurveTo(vX, y + U * 0.02, vX + vW, y - Math.sin(i * 1.7) * U * 0.012);
    c.stroke();
  }
  // ridges catching the last of the sunset on the left flank
  c.strokeStyle = "rgba(255,168,110,0.30)";
  c.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const p = 0.12 + i * 0.12;
    c.lineWidth = U * 0.004;
    c.beginPath();
    c.moveTo(lerp(vX - D.rimW, vX - vW / 2, p * 0.35), lerp(craterY, fY, p * 0.35));
    c.quadraticCurveTo(
      lerp(vX - D.rimW, vX - vW / 2, p * 0.7) - U * 0.01, lerp(craterY, fY, p * 0.72),
      lerp(vX - D.rimW, vX - vW / 2, p) - U * 0.02, lerp(craterY, fY, p * 1.05),
    );
    c.stroke();
  }
  // rock speckle
  const rr = mulberry32(2468);
  for (let i = 0; i < 220; i++) {
    const x = vX + (rr() - 0.5) * vW;
    const y = lerp(craterY, fY + U * 0.02, rr());
    c.fillStyle = rr() > 0.55 ? "rgba(255,160,110,0.10)" : "rgba(12,6,20,0.22)";
    c.fillRect(x, y, U * 0.012, U * 0.004);
  }
  // the right flank sits in shadow
  c.fillStyle = vGrad(c, craterY, fY, [[0, "rgba(20,10,32,0)"], [1, "rgba(20,10,32,0.45)"]]);
  c.fillRect(vX, craterY, vW, fY - craterY + 4);
  // cooled lava crust running down the channel
  c.strokeStyle = "#1a0d1e";
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  for (let i = 0; i <= 16; i++) {
    const s = lavaPoint(i / 16);
    if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
  }
  c.lineWidth = U * 0.062;
  c.stroke();
  c.restore();

  // crater lip
  c.strokeStyle = "#1a0d1e";
  c.lineWidth = U * 0.012;
  c.beginPath();
  c.moveTo(vX - D.rimW * 1.06, craterY + D.vH * 0.005);
  c.lineTo(vX - D.rimW * 0.66, craterY + D.vH * 0.035);
  c.lineTo(vX + D.rimW * 0.55, craterY + D.vH * 0.028);
  c.lineTo(vX + D.rimW * 1.04, craterY - D.vH * 0.012);
  c.stroke();

  // boulders scattered at the foot of the cone
  const br = mulberry32(1357);
  for (let i = 0; i < 9; i++) {
    const x = vX + (br() - 0.5) * vW * 1.05;
    const y = fY - fY * 0.006 - br() * fY * 0.02;
    const r = U * (0.012 + br() * 0.022);
    c.fillStyle = "#24162f";
    c.beginPath();
    c.ellipse(x, y, r, r * 0.72, br() * 0.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,150,96,0.18)";
    c.beginPath();
    c.ellipse(x - r * 0.3, y - r * 0.34, r * 0.44, r * 0.22, -0.4, 0, Math.PI * 2);
    c.fill();
  }
}

/* ── the waterfall cliff (the water itself is animated) ──────────────────── */

function paintCliff(c: CanvasRenderingContext2D) {
  const { fY, U, cliffX, cliffTop, fallX, fallW } = D;
  const w = U * 0.30;
  c.save();
  c.beginPath();
  c.moveTo(cliffX - w, fY + 4);
  c.lineTo(cliffX - w * 0.86, cliffTop + U * 0.03);
  c.lineTo(cliffX - w * 0.5, cliffTop);
  c.lineTo(cliffX + w * 0.55, cliffTop - U * 0.012);
  c.lineTo(cliffX + w, cliffTop + U * 0.04);
  c.lineTo(cliffX + w * 1.05, fY + 4);
  c.closePath();
  c.fillStyle = vGrad(c, cliffTop, fY, [[0, "#3d3050"], [0.5, "#2b2340"], [1, "#1b162c"]]);
  c.fill();
  c.clip();
  // strata + crevices
  c.strokeStyle = "rgba(12,8,20,0.4)";
  for (let i = 1; i < 6; i++) {
    const y = lerp(cliffTop, fY, i / 6);
    c.lineWidth = U * 0.006;
    c.beginPath();
    c.moveTo(cliffX - w * 1.1, y);
    c.quadraticCurveTo(cliffX, y + U * 0.014, cliffX + w * 1.1, y - U * 0.006);
    c.stroke();
  }
  c.strokeStyle = "rgba(255,160,110,0.18)";
  c.lineWidth = U * 0.004;
  for (let i = 0; i < 5; i++) {
    const x = cliffX - w * 0.9 + i * w * 0.42;
    c.beginPath();
    c.moveTo(x, cliffTop + U * 0.02);
    c.lineTo(x - U * 0.01, fY);
    c.stroke();
  }
  // moss on the cliff top
  c.fillStyle = "#2c5d43";
  c.beginPath();
  c.ellipse(cliffX, cliffTop + U * 0.012, w * 0.95, U * 0.022, 0, 0, Math.PI * 2);
  c.fill();
  // the plunge basin behind the falling water
  c.fillStyle = "#16304a";
  c.fillRect(fallX - fallW * 0.7, D.fallTop, fallW * 1.4, fY - D.fallTop + 4);
  c.restore();

  // pouring lip
  c.fillStyle = "#cfeeff";
  c.beginPath();
  c.ellipse(fallX, D.fallTop, fallW * 0.62, U * 0.008, 0, 0, Math.PI * 2);
  c.fill();
}

/* ── jungle floor set-dressing ───────────────────────────────────────────── */

function paintFloorProps(c: CanvasRenderingContext2D, W: number, rnd: () => number) {
  const { fY, U, gh, lagX, lagY, lagR } = D;

  /* lagoon the waterfall pours into */
  const lrY = lagR * 0.34;
  c.fillStyle = "#20402f";
  c.beginPath();
  c.ellipse(lagX, lagY, lagR * 1.12, lrY * 1.3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = vGrad(c, lagY - lrY, lagY + lrY, [
    [0, "#1d5b74"], [0.5, "#2b87a4"], [1, "#57bdd0"],
  ]);
  c.beginPath();
  c.ellipse(lagX, lagY, lagR, lrY, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.ellipse(lagX, lagY, lagR, lrY, 0, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = "rgba(255,168,110,0.30)";
  c.beginPath();
  c.ellipse(lagX - lagR * 0.4, lagY + lrY * 0.2, lagR * 0.42, lrY * 0.55, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(lagX + (rnd() - 0.5) * lagR * 1.5, lagY + (rnd() - 0.5) * lrY * 1.5, lagR * 0.2, lrY * 0.07, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  /* mossy ancient rocks */
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + rnd() * 0.9);
    const y = fY + gh * (0.12 + rnd() * 0.5);
    const r = U * (0.026 + rnd() * 0.036);
    c.fillStyle = "#2a2438";
    c.beginPath();
    c.ellipse(x, y, r, r * 0.72, rnd() * 0.5 - 0.25, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3c7a52";
    c.beginPath();
    c.ellipse(x - r * 0.12, y - r * 0.42, r * 0.78, r * 0.26, -0.15, Math.PI, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,164,104,0.22)";
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
    const col = d > 0.5 ? "#173d2b" : "#22563a";
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
    c.fillStyle = "#1b4630";
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.3, r * 0.55, r * 0.16, a * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#8a5a2b";
    c.beginPath();
    c.ellipse(x, y, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* a nest of big friendly eggs */
  const nx = D.nestX, ny = D.nestY, nr = U * 0.055;
  c.save();
  c.fillStyle = "#4a3722";
  c.beginPath();
  c.ellipse(nx, ny, nr * 1.35, nr * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 3; i++) {
    const ex = nx + (i - 1) * nr * 0.62;
    const ey = ny - nr * 0.30 + Math.abs(i - 1) * nr * 0.1;
    c.fillStyle = "#f0e2c4";
    c.beginPath();
    c.ellipse(ex, ey, nr * 0.34, nr * 0.46, (i - 1) * 0.25, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(190,150,100,0.5)";
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      c.arc(ex + (rnd() - 0.5) * nr * 0.4, ey + (rnd() - 0.5) * nr * 0.6, nr * 0.045, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(255,190,130,0.45)";
    c.beginPath();
    c.ellipse(ex - nr * 0.12, ey - nr * 0.16, nr * 0.12, nr * 0.18, -0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = "#5c452b";
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

  /* half-buried fossils and a glowing lump of amber */
  const bx = W * 0.46, by = fY + gh * 0.80;
  c.save();
  c.strokeStyle = "rgba(226,216,196,0.65)";
  c.lineCap = "round";
  c.lineWidth = Math.max(1.4, U * 0.006);
  for (let i = 0; i < 5; i++) {
    const rx = bx + i * U * 0.026;
    c.beginPath();
    c.arc(rx, by, U * (0.026 - i * 0.002), Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
  }
  c.fillStyle = "rgba(226,216,196,0.6)";
  c.beginPath();
  c.ellipse(bx - U * 0.05, by + U * 0.006, U * 0.022, U * 0.016, 0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();

  const ax = W * 0.66, ay = fY + gh * 0.46, ar = U * 0.020;
  const ag = c.createRadialGradient(ax, ay, 0, ax, ay, ar * 3);
  ag.addColorStop(0, "rgba(255,178,84,0.45)");
  ag.addColorStop(1, "rgba(255,178,84,0)");
  c.fillStyle = ag;
  c.fillRect(ax - ar * 3, ay - ar * 3, ar * 6, ar * 6);
  c.fillStyle = "#f0a63c";
  c.beginPath();
  c.ellipse(ax, ay, ar, ar * 1.25, 0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(120,62,10,0.6)";
  c.beginPath();
  c.ellipse(ax, ay, ar * 0.22, ar * 0.32, 0.4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,240,200,0.6)";
  c.beginPath();
  c.ellipse(ax - ar * 0.3, ay - ar * 0.5, ar * 0.22, ar * 0.3, 0.3, 0, Math.PI * 2);
  c.fill();
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
const ASH = "rgba(198,180,206,ALPHA)";
const MIST = "rgba(226,206,238,ALPHA)";

/** Vertically tiling curtain of water streaks — scrolled to make it fall. */
function fallSprite(w: number, h: number) {
  return cachedSprite("dino.fall", w, h, "v1", (c, ww, hh) => {
    const r = mulberry32(4711);
    c.fillStyle = "rgba(206,238,255,0.45)";
    c.fillRect(0, 0, ww, hh);
    const seg = hh / 10;
    for (let i = 0; i < 22; i++) {
      const x = r() * ww;
      const sw = ww * (0.03 + r() * 0.10);
      const phase = Math.floor(r() * 10);
      for (let j = 0; j < 10; j++) {
        const a = 0.10 + 0.55 * (0.5 + 0.5 * Math.sin(((j + phase) / 10) * Math.PI * 2));
        c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        c.fillRect(x, j * seg + seg * 0.12, sw, seg * 0.76);
      }
    }
  });
}

/** Soft shaft of light for the canopy god rays. */
function shaftSprite() {
  return cachedSprite("dino.shaft", 150, 340, "v1", (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,206,148,0.55)");
    g.addColorStop(0.6, "rgba(255,190,130,0.16)");
    g.addColorStop(1, "rgba(255,190,130,0)");
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

/* ── the frame ───────────────────────────────────────────────────────────── */

export function drawDino({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 2) || !(H > 2)) return;
  const fY = clamp(floorY, H * 0.25, H * 0.98);
  setD(W, H, fY);
  const U = D.U, gh = D.gh;
  const wind = breeze(t);
  const variant = `${Math.round(fY)}|${quality()}`;
  const air = slot(fx, "dino.air", () => ({ drift: 0, fall: 0 }));
  air.drift += dt * (12 + wind * 22);
  air.fall += dt;

  /* eruption cycle: rumble → burst → drifting embers → fading glow */
  const er = slot(fx, "dino.erupt", () => ({ next: 13, k: 0, burst: false }));
  if (er.k <= 0 && t > er.next) { er.next = t + 24; er.k = 1; er.burst = false; }
  let erupt = 0;
  if (er.k > 0) {
    er.k = Math.max(0, er.k - dt / 6);
    const u = 1 - er.k;
    erupt = u < 0.18 ? (u / 0.18) * 0.55 : Math.max(0, 1 - (u - 0.18) / 0.82);
  }

  /* ── layer A: sky ── */
  scene(ctx, "dino.sky", W, H, variant, paintDinoSky);

  /* first stars, brightest at the top of the frame */
  const nStar = Math.max(8, detail(30));
  ctx.fillStyle = "#ffe9c4";
  for (let i = 0; i < nStar; i++) {
    const sx = ((i * 389) % 1000) / 1000 * W;
    const sy = ((i * 211) % 1000) / 1000 * fY * 0.45;
    const tw = 0.25 + 0.55 * Math.abs(Math.sin(t * 0.8 + i * 2.3));
    ctx.globalAlpha = tw * (1 - sy / (fY * 0.6)) * 0.9;
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + (i % 3) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* meteor streaks */
  if (t - fx.lastShot > 7 + (fx.lastShot % 4) && fx.shots.length < 2) {
    fx.lastShot = t;
    fx.shots.push({
      x: W * (0.35 + Math.random() * 0.6),
      y: H * (0.04 + Math.random() * 0.18),
      vx: -(300 + Math.random() * 160),
      vy: 120 + Math.random() * 70,
      life: 1,
    });
  }
  ctx.lineCap = "round";
  for (let i = fx.shots.length - 1; i >= 0; i--) {
    const s = fx.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 1.1;
    if (s.life <= 0 || s.x < -60) { fx.shots.splice(i, 1); continue; }
    const tail = U * 0.13 * s.life;
    const ang = Math.atan2(s.vy, s.vx);
    const mg = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    mg.addColorStop(0, `rgba(255,206,150,${0.85 * s.life})`);
    mg.addColorStop(1, "rgba(255,206,150,0)");
    ctx.strokeStyle = mg;
    ctx.lineWidth = Math.max(1.4, U * 0.004);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    ctx.stroke();
  }

  /* the eruption lights the whole sky for a moment */
  if (erupt > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = vGrad(ctx, 0, fY, [
      [0, `rgba(255,120,60,${(0.03 * erupt).toFixed(3)})`],
      [1, `rgba(255,170,90,${(0.16 * erupt).toFixed(3)})`],
    ]);
    ctx.fillRect(0, 0, W, fY + 2);
    ctx.restore();
  }

  /* pterodactyl flyby every ~11s — real wing-beat cycle, membrane wings */
  if (t - fx.lastFly > 11) { fx.lastFly = t; fx.flyX = -0.18; }
  const flying = fx.flyX < 1.25;
  const ptx = fx.flyX * W;
  const pty = fY * (0.20 + Math.sin(t * 0.6) * 0.035);
  if (flying) {
    fx.flyX += dt * 0.085;
    const ps = U * 0.055;
    const beat = Math.sin(t * 5.2);
    const up = Math.max(0, beat), down = Math.max(0, -beat);
    ctx.save();
    ctx.translate(ptx, pty);
    ctx.rotate(beat * 0.05);
    ctx.fillStyle = "#241536";
    for (const side of [-1, 1]) {
      const tipY = -ps * (0.55 * up) + ps * (0.45 * down);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * ps * 0.7, -ps * 0.42 + tipY * 0.5, side * ps * 1.5, tipY);
      ctx.quadraticCurveTo(side * ps * 0.95, tipY + ps * 0.30, side * ps * 0.5, ps * 0.16);
      ctx.quadraticCurveTo(side * ps * 0.28, ps * 0.1, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,170,110,0.35)";
      ctx.lineWidth = Math.max(1, ps * 0.035);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * ps * 0.7, -ps * 0.42 + tipY * 0.5, side * ps * 1.5, tipY);
      ctx.stroke();
    }
    ctx.fillStyle = "#241536";
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

  /* sauropod ambling behind the jungle every ~26s — only the neck clears it */
  if (t - fx.fly2.last > 26) { fx.fly2.last = t; fx.fly2.x = -0.4; }
  if (fx.fly2.x < 1.4) {
    fx.fly2.x += dt * 0.045;
    const dx4 = fx.fly2.x * W;
    const ds = Math.min(W, H) * 0.20;
    const step = Math.sin(t * 1.5);
    ctx.save();
    ctx.translate(dx4, fY + 4 + step * ds * 0.015);
    ctx.fillStyle = "#26173a";
    ctx.beginPath();
    ctx.ellipse(0, -ds * 0.6, ds * 0.9, ds * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    const neckSway = Math.sin(t * 0.8) * ds * 0.06;
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
    // warm rim along the neck and back
    ctx.strokeStyle = "rgba(255,166,102,0.5)";
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

  /* ── layer B: the island ── */
  scene(ctx, "dino.isle", W, H, variant, paintDinoIsle);

  /* crater: pulsing glow, heat shimmer, ember bloom */
  const pulse = 0.72 + Math.sin(t * 2.1) * 0.14 + erupt * 0.6;
  glow(ctx, D.vX, D.craterY + D.vH * 0.02, D.vW * (0.20 + erupt * 0.12),
    `rgba(255,150,64,${Math.min(0.95, 0.62 * pulse).toFixed(3)})`, "rgba(255,120,50,0)");
  ctx.save();
  ctx.fillStyle = `rgba(255,214,120,${(0.55 + erupt * 0.4).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(D.vX - D.rimW * 0.05, D.craterY + D.vH * 0.028, D.rimW * 0.72, D.vH * 0.018, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  bloom(ctx, D.vX, D.craterY, D.vW * 0.30, "rgba(255,150,70,0.55)", 0.28 + erupt * 0.35);
  if (richFx()) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,180,120,0.05)";
    ctx.lineWidth = U * 0.02;
    for (let i = 0; i < 4; i++) {
      const yy = D.craterY - U * 0.02 - i * U * 0.028;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const xx = D.vX - D.rimW * 1.2 + (k / 8) * D.rimW * 2.4;
        const off = Math.sin(t * 3 + k * 0.9 + i) * U * 0.006;
        if (k === 0) ctx.moveTo(xx, yy + off); else ctx.lineTo(xx, yy + off);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* lava flow: additive cracks travelling down the crust */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const steps = Math.max(6, detail(16));
  for (let i = 0; i < steps; i++) {
    const a = lavaPoint(i / steps), b = lavaPoint((i + 1) / steps);
    const heat = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(i * 1.1 - t * 2.4)) + erupt * 0.3;
    ctx.strokeStyle = `rgba(255,${Math.round(120 + heat * 90)},50,${(0.42 * heat).toFixed(3)})`;
    ctx.lineWidth = a.w * (0.5 + heat * 0.35);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
  const foot = lavaPoint(1);
  bloom(ctx, foot.x, foot.y, U * 0.16, "rgba(255,140,60,0.8)", 0.3 + erupt * 0.2);

  /* ember fountain from the crater (bursts hard during an eruption) */
  const rate = 6 + erupt * 90;
  if (Math.random() < dt * rate && fx.sparks.length < detail(46)) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (1.0 + erupt * 0.7);
    const sp = U * (0.28 + Math.random() * 0.34) * (1 + erupt * 0.7);
    fx.sparks.push({ x: D.vX + (Math.random() - 0.5) * D.rimW, y: D.craterY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
  }
  if (er.k > 0 && !er.burst && 1 - er.k > 0.18) {
    er.burst = true;
    const n = Math.max(6, detail(24));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n - 0.5) * 1.7;
      const sp = U * (0.5 + Math.random() * 0.5);
      fx.sparks.push({ x: D.vX + (Math.random() - 0.5) * D.rimW, y: D.craterY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    const s = fx.sparks[i];
    s.vy += U * 0.72 * dt;
    s.vx += wind * U * 0.06 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.6;
    if (s.life <= 0 || s.y > fY) { fx.sparks.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, s.life * 1.2);
    ctx.fillStyle = s.life > 0.5 ? "#ffe08a" : "#ff7a45";
    ctx.beginPath();
    ctx.arc(s.x, s.y, U * (0.003 + s.life * 0.005), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* ash plume leaning downwind */
  const ash = puffSprite("dino.ash", ASH);
  const nAsh = Math.max(5, detail(14));
  ctx.save();
  for (let i = 0; i < nAsh; i++) {
    const p = ((t * 0.075 + i / nAsh) % 1);
    const rise = Math.pow(p, 0.85);
    const px = D.vX + rise * (U * 0.16 + wind * U * 0.34) + Math.sin(t * 0.6 + i * 2.1) * U * 0.02;
    const py = D.craterY - rise * fY * 0.55;
    const pr2 = U * (0.05 + rise * 0.20);
    ctx.globalAlpha = Math.min(0.55, (0.16 + erupt * 0.35) * (1 - p) * 1.6);
    ctx.drawImage(ash, px - pr2, py - pr2, pr2 * 2, pr2 * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* waterfall: scrolling curtain, foam, spray, ripples */
  const fw = D.fallW, fTop = D.fallTop, fBot = D.lagY - D.lagR * 0.10;
  const fh = Math.max(8, fBot - fTop);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(D.fallX - fw * 0.5, fTop);
  ctx.lineTo(D.fallX + fw * 0.5, fTop);
  ctx.lineTo(D.fallX + fw * 0.78, fBot);
  ctx.lineTo(D.fallX - fw * 0.78, fBot);
  ctx.closePath();
  ctx.clip();
  const curtain = fallSprite(Math.round(fw * 1.6), Math.round(fh));
  const off = (air.fall * fh * 1.5) % fh;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(curtain, D.fallX - fw * 0.8, fTop + off - fh, fw * 1.6, fh);
  ctx.drawImage(curtain, D.fallX - fw * 0.8, fTop + off, fw * 1.6, fh);
  ctx.globalAlpha = 1;
  ctx.restore();
  // foam where it lands
  ctx.save();
  ctx.fillStyle = "rgba(240,252,255,0.75)";
  for (let i = 0; i < Math.max(3, detail(7)); i++) {
    const a = (i / 7) * Math.PI * 2 + t * 0.6;
    const rr2 = fw * (0.5 + 0.28 * Math.abs(Math.sin(t * 2.2 + i)));
    ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(t * 1.7 + i * 1.3));
    ctx.beginPath();
    ctx.ellipse(D.fallX + Math.cos(a) * fw * 0.35, fBot + Math.sin(a) * fw * 0.12, rr2 * 0.6, rr2 * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // spray droplets
  const spray = slot(fx, "dino.spray", () => {
    const r = mulberry32(515);
    return Array.from({ length: 22 }, () => ({ p: r(), a: r() * 6.283, s: 0.5 + r() * 0.9 }));
  });
  const nSpray = Math.min(spray.length, Math.max(5, detail(22)));
  ctx.save();
  ctx.fillStyle = "rgba(232,250,255,0.8)";
  for (let i = 0; i < nSpray; i++) {
    const sp2 = spray[i];
    const p = (sp2.p + t * 0.55 * sp2.s) % 1;
    const dx5 = Math.cos(sp2.a) * fw * (0.3 + p * 1.7);
    const dy5 = -Math.sin(p * Math.PI) * fw * (0.7 + sp2.s * 0.5) + p * fw * 0.3;
    ctx.globalAlpha = (1 - p) * 0.7;
    ctx.beginPath();
    ctx.arc(D.fallX + dx5, fBot + dy5, Math.max(0.8, fw * 0.05 * sp2.s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // lagoon ripples
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(D.lagX, D.lagY, D.lagR, D.lagR * 0.34, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(220,250,255,0.5)";
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.5 + i / 3) % 1);
    ctx.globalAlpha = (1 - p) * 0.55;
    ctx.lineWidth = Math.max(0.8, U * 0.0025);
    ctx.beginPath();
    ctx.ellipse(D.lagX, D.lagY - D.lagR * 0.12, D.lagR * p, D.lagR * 0.34 * p, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* shafts of light dropping through the canopy */
  const shaft = shaftSprite();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const nShaft = Math.max(2, detail(3));
  for (let i = 0; i < nShaft; i++) {
    const sx = W * (0.24 + i * 0.27);
    const sw2 = U * (0.16 + (i % 2) * 0.07);
    const sh2 = fY - D.midTop + gh * 0.5;
    ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 0.4 + i * 2);
    ctx.drawImage(shaft, sx - sw2 / 2, D.midTop - U * 0.02, sw2, sh2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* mist bands drifting between the jungle planes */
  const mist = puffSprite("dino.mist", MIST);
  ctx.save();
  const nMist = Math.max(3, detail(6));
  for (let i = 0; i < nMist; i++) {
    const band = i % 2;
    const mw = W * (0.30 + (i % 3) * 0.12);
    const span = W + mw * 2;
    const mx = ((air.drift * (0.5 + band * 0.5) + i * 733) % span) - mw;
    const my = band ? D.midTop + U * 0.02 : fY + gh * 0.16;
    ctx.globalAlpha = band ? 0.16 : 0.13;
    ctx.drawImage(mist, mx - mw / 2, my - mw * 0.09, mw, mw * 0.18);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* something unseen rustles the undergrowth */
  const rust = slot(fx, "dino.rustle", () => ({ next: 6, which: 0, k: 0 }));
  if (t > rust.next) { rust.next = t + 9; rust.which = (rust.which + 1) % 3; rust.k = 1; }
  if (rust.k > 0) rust.k = Math.max(0, rust.k - dt * 0.9);
  for (let i = 0; i < 3; i++) {
    const bx2 = W * (0.30 + i * 0.22);
    const by2 = fY + gh * (0.22 + (i % 2) * 0.18);
    const bs = U * (0.05 + (i % 2) * 0.012);
    const shake = i === rust.which ? Math.sin(t * 22) * 0.10 * rust.k : 0;
    ctx.save();
    ctx.translate(bx2, by2);
    ctx.rotate(shake);
    ctx.fillStyle = "#16382a";
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * bs * 0.6, Math.sin(a) * bs * 0.35, bs * 0.42, bs * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,158,96,0.16)";
    ctx.beginPath();
    ctx.ellipse(-bs * 0.35, -bs * 0.3, bs * 0.4, bs * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* drifting embers riding the breeze */
  const nEmber = Math.max(5, detail(16));
  ctx.save();
  for (let i = 0; i < nEmber; i++) {
    const p = ((t * 0.055 + i / nEmber) % 1);
    const ex = (((i * 443) % 1000) / 1000) * W + Math.sin(t * 0.7 + i * 2.7) * U * 0.04 + p * wind * U * 0.16;
    const ey = fY - p * fY * 0.72;
    ctx.globalAlpha = (1 - p) * 0.75;
    ctx.fillStyle = i % 3 ? "#ffb35c" : "#ff7a45";
    ctx.beginPath();
    ctx.arc(ex, ey, U * (0.0022 + (i % 3) * 0.0012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* dragonflies skimming the lagoon */
  const nDf = Math.max(1, detail(2));
  for (let i = 0; i < nDf; i++) {
    const dfx = D.lagX + noise1(t * 0.5 + i * 4, 71 + i) * D.lagR * 1.3;
    const dfy = D.lagY - D.lagR * 0.22 + noise1(t * 0.7 + i * 9, 83 + i) * D.lagR * 0.3;
    const dsz = U * 0.012;
    ctx.save();
    ctx.translate(dfx, dfy);
    ctx.rotate(Math.sin(t * 0.9 + i) * 0.3);
    ctx.fillStyle = "rgba(210,245,255,0.45)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(0, s * dsz * 0.3, dsz * 1.1, dsz * 0.28, s * Math.sin(t * 28 + i) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#4fd0c0";
    ctx.beginPath();
    ctx.ellipse(0, 0, dsz * 0.9, dsz * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* fireflies blinking in the dark edges of the jungle */
  const nFly = Math.max(3, detail(10));
  ctx.save();
  for (let i = 0; i < nFly; i++) {
    const edge = i % 2 ? 0.06 + ((i * 13) % 18) / 100 : 0.94 - ((i * 17) % 18) / 100;
    const fx5 = edge * W + Math.sin(t * 0.6 + i * 2.4) * U * 0.05;
    const fy3 = fY - U * 0.02 + Math.sin(t * 1.2 + i) * U * 0.03 + ((i * 173) % 100) / 100 * gh * 0.7;
    const blink = Math.max(0, Math.sin(t * 1.8 + i * 2.7));
    if (blink < 0.35) continue;
    ctx.globalAlpha = (blink - 0.35) * 1.3;
    const fr = U * 0.016;
    const fg = ctx.createRadialGradient(fx5, fy3, 0, fx5, fy3, fr);
    fg.addColorStop(0, "#eaff9a");
    fg.addColorStop(0.4, "rgba(214,255,140,0.5)");
    fg.addColorStop(1, "rgba(232,255,154,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx5, fy3, fr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* the pterodactyl's shadow sweeping the jungle floor */
  if (flying && ptx > -U * 0.2 && ptx < W + U * 0.2) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#0a1a12";
    const shx = ptx + U * 0.06;
    const shy = fY + gh * 0.34;
    const beat = Math.sin(t * 5.2);
    ctx.beginPath();
    ctx.ellipse(shx, shy, U * 0.075 * (1 - Math.abs(beat) * 0.25), U * 0.014, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ember grade + vignette */
  grade(ctx, W, H, "#ff9a5c", 0.10, 0.03);
  vignette(ctx, W, H, 0.22);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
