// ─── SPACE world · "Giggle Galaxy" ──────────────────────────────────────────
// A layered, cinematic candy-sci-fi backdrop.
//
// Render order (back → front). Everything up to the night wash is *matter*;
// everything after it is *light*, so the evening can fall on the scene without
// putting out the stars.
//
//   ── matter ──
//   1  sky plate .......... gradient + colour washes + Milky-Way dust band +
//                           the deepest micro-stars                    [cached]
//   2  daylight lift ...... one gradient that raises the sky toward blue-violet
//                           and warms the sun side; a no-op at night
//   3  nebula plates ...... fbm-carved volumetric cloud masses, additive,
//                           slowly drifting / breathing / counter-rotating [cached]
//   4  deep field ......... spiral galaxy, edge-on galaxy, elliptical smudge,
//                           globular cluster — the mid-frame's furniture [cached]
//   5  ion wisps .......... soft solar-wind streamers threading the middle
//   6  starfield .......... 5 parallax depths, dim+slow behind → bright+fast in
//                           front: sky micro-stars, a wrapping baked plate and
//                           three live twinkling layers          [cached glyphs]
//   7  far planet ......... banded ice world, deep parallax           [cached]
//   8  hero planet ........ back rings → moonlet → globe (terminator, bands,
//                           ring shadow) → front rings → moonlet      [cached]
//   9  asteroid ........... one slow tumbling rock on a long crossing [cached]
//  10  moon surface ....... crater field, boulders, rover tracks       [cached]
//  11  the sun's angle ..... warm grazing light on the regolith by day
//  12  applyNight ......... the shared evening, laid over the matter
//   ── light (all additive, so it survives the night wash) ──
//  13  live stars ......... twinkle, colour temperature, diffraction spikes
//  14  emission core ...... bloom heart inside the violet cloud
//  15  rim lights ......... sun-side rim on planet + moonlet, day only
//  16  events ............. comet (ion + dust tails), station pass, meteor
//                           bursts, rocket flyby + exhaust, wormhole
//  17  aurora ............. additive curtains, clipped to the sky
//  18  vignette ........... one coherent image
//
// Everything static is painted once into an offscreen canvas and blitted; the
// per-frame budget is a handful of blits, ~100 sprite stamps and ~12 paths.

import {
  applyNight, applySeasonWash, bloom, cachedLayer, cachedSprite, clamp, dayLight, dayWarmth,
  detail, easeOut, fbm1, glow, lerp, mulberry32, noise1, quality,
  richFx, slot, vGrad, vignette,
  type ThemeFrame, type FxState,
} from "./shared";

/* ── motion preference ─────────────────────────────────────────────────────
   Reduced motion calms the world rather than freezing it: drift, twinkle and
   spin all keep going at about a third speed, and flybys come round less
   often. A dead-still sky reads as broken, not as restful. */

let reducedMotion: boolean | null = null;
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

/* ── art direction ───────────────────────────────────────────────────────── */

/** Scene key light: one distant sun off the upper-left. Every shadow agrees. */
const SUN_X = -0.64, SUN_Y = -0.77;
/** Tilt of the hero planet's ring plane (radians; canvas rotates CW+). */
const RING_TILT = -0.34;
/** Foreshortening of the ring plane (semi-minor / semi-major). */
const RING_FLAT = 0.3;

const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;

/** Star colour temperature ramp: 0 = hot blue-white → 1 = cool amber. */
function starRgb(k: number): string {
  const u = clamp(k, 0, 1);
  if (u < 0.5) {
    const v = u * 2;
    return `${Math.round(lerp(174, 255, v))},${Math.round(lerp(205, 253, v))},${Math.round(lerp(255, 246, v))}`;
  }
  const v = (u - 0.5) * 2;
  return `255,${Math.round(lerp(253, 208, v))},${Math.round(lerp(246, 136, v))}`;
}

/** Soft radial blob into an offscreen context (optionally squashed). */
function blob(
  c: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  rgb: string, a: number, squash = 1, rot = 0,
) {
  if (!(r > 0.2) || a <= 0.002) return;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  c.scale(1, squash);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(rgb, a));
  g.addColorStop(0.45, rgba(rgb, a * 0.5));
  g.addColorStop(1, rgba(rgb, 0));
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
}

/* ══ cached art: the sky plate ═══════════════════════════════════════════════ */

function paintMilkyWay(c: CanvasRenderingContext2D, w: number, h: number) {
  const S = Math.min(w, h);
  const L = Math.hypot(w, h) * 1.3;
  const bw = S * 0.34;                 // band half-height
  const rnd = mulberry32(90817);
  c.save();
  c.translate(w * 0.46, h * 0.34);
  c.rotate(-0.42);

  // luminous ridge, broken up by fbm so it never reads as a plain stripe
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 170; i++) {
    const x = (rnd() - 0.5) * L;
    const dens = 0.5 + fbm1(x * 0.0055, 3, 7) * 0.9;
    if (dens < 0.16) continue;
    const y = (rnd() + rnd() + rnd() - 1.5) * bw * 0.62;
    const r = bw * (0.18 + rnd() * 0.5);
    const fall = 1 - Math.min(1, Math.abs(y) / bw);
    const warm = rnd() < 0.28;
    blob(c, x, y, r, warm ? "255,214,168" : "170,186,255",
      clamp(dens, 0, 1) * fall * 0.05, 0.55 + rnd() * 0.3);
  }

  // ── dark dust lanes ──
  // These used to be filled polygons, and a filled polygon has an edge: at
  // this scale the fbm boundary flattened into three parallel diagonal rules
  // straight across the frame — the single most artificial thing in the world.
  // Now each lane is a chain of soft absorption blobs strung along a wandering
  // centreline, so the lane is *made of* softness and has no edge of its own.
  // Each lane also gets its own shear, so they fan instead of running parallel,
  // and its thickness and opacity breathe along its length so it thins out to
  // nothing rather than stopping.
  c.globalCompositeOperation = "source-over";
  for (let lane = 0; lane < 3; lane++) {
    const off = (lane - 1) * bw * 0.4;
    const shear = (lane - 1) * 0.052;            // fans the lanes apart
    const steps = 74;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = (u - 0.5) * L;
      const y = off + x * shear
        + fbm1(x * 0.0042 + lane * 31, 4, 21 + lane) * bw * 0.42
        + noise1(x * 0.013 + lane * 7, 41 + lane) * bw * 0.1;
      // thickness and density breathe, so the lane frays instead of ending
      const gate = 0.36 + 0.64 * Math.abs(fbm1(x * 0.0055 + lane * 11, 3, 9 + lane));
      const th = bw * (0.2 + lane * 0.05) * gate;
      const a = 0.05 * gate * (0.45 + 0.55 * Math.abs(noise1(x * 0.006 + lane * 3, 17)));
      // squashed and tilted along the lane so the grain runs with the dust
      blob(c, x, y, th * 1.9, "5,3,20", a, 0.4 + gate * 0.2, shear);
    }
  }

  // pinprick stars crowding toward the galactic plane
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 460; i++) {
    const x = (rnd() - 0.5) * L;
    const y = (rnd() + rnd() + rnd() + rnd() - 2) * bw * 0.42;
    const a = 0.12 + rnd() * 0.4;
    c.fillStyle = rgba(starRgb(rnd()), a);
    const r = 0.35 + rnd() * 0.55;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.restore();
  c.globalCompositeOperation = "source-over";
}

function paintSky(c: CanvasRenderingContext2D, w: number, h: number) {
  const S = Math.min(w, h);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#030216");
  g.addColorStop(0.34, "#08062a");
  g.addColorStop(0.68, "#160d42");
  g.addColorStop(1, "#2a1250");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  // broad static colour washes — keeps the low quality tier looking rich even
  // when the animated nebula plate count drops.
  c.globalCompositeOperation = "lighter";
  blob(c, w * 0.24, h * 0.3, S * 0.78, "112,58,178", 0.16, 0.9);
  blob(c, w * 0.82, h * 0.2, S * 0.6, "0,150,168", 0.11, 1.05);
  blob(c, w * 0.56, h * 0.8, S * 0.72, "176,52,150", 0.08, 0.75);
  blob(c, w * 0.06, h * 0.88, S * 0.55, "48,84,214", 0.07);
  c.globalCompositeOperation = "source-over";

  // top-light falloff, baked here rather than paid for on every frame
  const tl = c.createLinearGradient(0, 0, 0, h * 0.55);
  tl.addColorStop(0, "rgba(190,206,255,0.07)");
  tl.addColorStop(1, "rgba(190,206,255,0)");
  c.fillStyle = tl;
  c.fillRect(0, 0, w, h * 0.55);

  paintMilkyWay(c, w, h);

  // depth 0 — the deepest, densest micro-stars: no parallax at all
  const rnd = mulberry32(4242);
  const n = Math.round(clamp((w * h) / 3400, 120, 900));
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const a = 0.1 + rnd() * rnd() * 0.5;
    const r = 0.32 + rnd() * 0.5;
    c.fillStyle = rgba(starRgb(rnd() * 0.85), a);
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.globalCompositeOperation = "source-over";
}

/* ══ cached art: the drifting star plate (parallax depth 1) ══════════════════ */

function paintStarPlate(c: CanvasRenderingContext2D, w: number, h: number) {
  const rnd = mulberry32(77713);
  const n = Math.round(clamp((w * h) / 5200, 80, 520));
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const k = rnd();
    const rgb = starRgb(k);
    const r = 0.5 + rnd() * rnd() * 1.5;
    const a = 0.24 + rnd() * 0.5;
    // tiny halo so the plate reads as light, not as pixels
    blob(c, x, y, r * 3.4, rgb, a * 0.3);
    c.fillStyle = rgba(rgb, a);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = "source-over";
}

/** Cached glyph for a live star: soft core + optional diffraction spikes. */
function starGlyph(id: number, rgb: string, spikes: boolean): HTMLCanvasElement {
  return cachedSprite(`sp.star${id}`, 64, 64, "v2", (c, w) => {
    const m = w / 2;
    c.globalCompositeOperation = "lighter";
    if (spikes) {
      for (let p = 0; p < 2; p++) {
        const len = p === 0 ? m * 0.96 : m * 0.5;
        const a = p === 0 ? 0.5 : 0.22;
        c.save();
        c.translate(m, m);
        c.rotate(p === 0 ? 0 : Math.PI / 4);
        for (let k = 0; k < 2; k++) {
          c.rotate(Math.PI / 2);
          const lg = c.createLinearGradient(0, 0, len, 0);
          lg.addColorStop(0, rgba(rgb, a));
          lg.addColorStop(0.28, rgba(rgb, a * 0.42));
          lg.addColorStop(1, rgba(rgb, 0));
          c.fillStyle = lg;
          c.beginPath();
          c.moveTo(0, -m * 0.055);
          c.lineTo(len, 0);
          c.lineTo(0, m * 0.055);
          c.closePath();
          c.fill();
          c.beginPath();
          c.moveTo(0, m * 0.055);
          c.lineTo(-len, 0);
          c.lineTo(0, -m * 0.055);
          c.closePath();
          c.fill();
        }
        c.restore();
      }
    }
    const g = c.createRadialGradient(m, m, 0, m, m, m * 0.42);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.16, rgba(rgb, 0.95));
    g.addColorStop(0.4, rgba(rgb, 0.34));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.globalCompositeOperation = "source-over";
  });
}

/* ══ cached art: volumetric nebula plates ═══════════════════════════════════ */

function paintNebula(c: CanvasRenderingContext2D, P: number, seed: number, rgb: string, hot: string) {
  const rnd = mulberry32(seed);
  const cx = P / 2, cy = P / 2;
  c.globalCompositeOperation = "lighter";

  // cloud mass: blobs scattered in a disc, density carved by two crossed
  // fbm fields so the result is filamentary rather than a fuzzy ball.
  const N = 96;
  for (let i = 0; i < N; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.55) * P * 0.46;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.86;
    const f = 0.6 * fbm1(x * 0.013 + y * 0.008, 3, seed)
      + 0.4 * fbm1(y * 0.017 - x * 0.006, 3, seed + 53);
    const d = clamp(f * 1.5 + 0.55, 0, 1);
    const fall = 1 - rad / (P * 0.5);
    const a = 0.075 * d * fall * fall;
    blob(c, x, y, P * (0.05 + rnd() * 0.17), rgb, a, 0.6 + rnd() * 0.8, rnd() * Math.PI);
  }

  // filaments: chains of stretched blobs that follow a swirl field, so the
  // cloud gains the wispy internal structure real emission nebulae have. Each
  // strand is soft along its whole length — no strokes, so no edges.
  for (let f = 0; f < 9; f++) {
    const ang = rnd() * Math.PI * 2;
    const rad0 = Math.pow(rnd(), 0.6) * P * 0.34;
    let x = cx + Math.cos(ang) * rad0;
    let y = cy + Math.sin(ang) * rad0 * 0.86;
    let dir = rnd() * Math.PI * 2;
    const len = 14 + Math.floor(rnd() * 12);
    const stepL = P * 0.028;
    const thick = P * (0.024 + rnd() * 0.03);
    for (let s = 0; s < len; s++) {
      // curl the strand with noise instead of drawing an arc
      dir += noise1(s * 0.42 + f * 9.3, seed + 71) * 0.55;
      x += Math.cos(dir) * stepL;
      y += Math.sin(dir) * stepL * 0.9;
      const rad = Math.hypot(x - cx, y - cy);
      const fall = clamp(1 - rad / (P * 0.48), 0, 1);
      if (fall <= 0) break;
      const taper = Math.sin((s / (len - 1)) * Math.PI);
      blob(c, x, y, thick * (0.6 + taper * 0.9), rgb,
        0.045 * fall * taper, 0.34, dir);
    }
  }

  // bright interior knots — where the young stars are cooking
  for (let i = 0; i < 7; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.7) * P * 0.26;
    blob(c, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.8,
      P * (0.03 + rnd() * 0.07), hot, 0.10 + rnd() * 0.08);
  }
  for (let i = 0; i < 26; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.6) * P * 0.4;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.85;
    const r = 0.6 + rnd() * 1.1;
    c.fillStyle = rgba(starRgb(rnd() * 0.5), 0.5 + rnd() * 0.4);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // dust voids — punched out so the cloud gains depth and internal shadow
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 22; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.5) * P * 0.42;
    blob(c, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.85,
      P * (0.04 + rnd() * 0.13), "0,0,0", 0.28 + rnd() * 0.42,
      0.35 + rnd() * 0.7, rnd() * Math.PI);
  }

  // feather the plate edge so the square canvas can never show
  const m = c.createRadialGradient(cx, cy, P * 0.3, cx, cy, P * 0.5);
  m.addColorStop(0, "rgba(0,0,0,0)");
  m.addColorStop(1, "rgba(0,0,0,1)");
  c.fillStyle = m;
  c.fillRect(0, 0, P, P);
  c.globalCompositeOperation = "source-over";
}

interface Plate { key: string; seed: number; rgb: string; hot: string; x: number; y: number; s: number; a: number; sp: number; dx: number; dy: number; rot: number }

// Ordered so the low-quality tier (which keeps only the first two) still has
// cloud at the top *and* through the middle — the mid plate is not a luxury,
// it is what stops the centre of the frame going empty.
const PLATES: Plate[] = [
  { key: "sp.neb0", seed: 1301, rgb: "126,64,214", hot: "214,168,255", x: 0.24, y: 0.28, s: 1.4, a: 0.62, sp: 0.006, dx: 0.031, dy: 0.024, rot: 0.2 },
  { key: "sp.neb1", seed: 3313, rgb: "196,66,186", hot: "255,190,232", x: 0.47, y: 0.63, s: 1.5, a: 0.44, sp: 0.007, dx: 0.026, dy: 0.019, rot: 3.4 },
  { key: "sp.neb2", seed: 2207, rgb: "0,178,192", hot: "168,255,246", x: 0.85, y: 0.21, s: 1.05, a: 0.44, sp: -0.009, dx: 0.043, dy: 0.033, rot: 1.9 },
  { key: "sp.neb3", seed: 4409, rgb: "62,96,224", hot: "180,214,255", x: 0.87, y: 0.85, s: 1.05, a: 0.42, sp: -0.005, dx: 0.037, dy: 0.028, rot: 5.1 },
];

/* ══ cached art: celestial bodies ═══════════════════════════════════════════ */

/** The hero gas giant: bands, terminator, ring shadow, rim light, halo. */
function paintGasGiant(c: CanvasRenderingContext2D, D: number, pad: number) {
  const r = D / 2 - pad;
  const cx = D / 2, cy = D / 2;
  if (r <= 1) return;
  const rnd = mulberry32(60613);

  // atmospheric halo (outside the globe, inside the sprite padding)
  blob(c, cx, cy, r + pad, "196,138,255", 0.3);

  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();

  // base body
  const bg = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  bg.addColorStop(0, "#d3a4ff");
  bg.addColorStop(0.45, "#9a55d8");
  bg.addColorStop(1, "#59219f");
  c.fillStyle = bg;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);

  // banded atmosphere — latitude stripes bent into arcs by a squashed scale
  c.save();
  c.translate(cx, cy);
  for (let i = 0; i < 22; i++) {
    const yy = (-1 + (i / 21) * 2) * r;
    const th = r * (0.045 + Math.abs(noise1(i * 0.7, 5)) * 0.11);
    const n = noise1(i * 1.31, 11);
    const warm = n > 0.25;
    const a = 0.05 + Math.abs(n) * 0.16;
    c.fillStyle = warm ? `rgba(255,225,190,${a})` : `rgba(70,20,120,${a * 1.1})`;
    c.beginPath();
    c.moveTo(-r * 1.05, yy);
    for (let x = -r * 1.05; x <= r * 1.05; x += r * 0.16) {
      c.lineTo(x, yy + Math.sin(x / r * 1.6 + i) * r * 0.02);
    }
    c.lineTo(r * 1.05, yy + th);
    for (let x = r * 1.05; x >= -r * 1.05; x -= r * 0.16) {
      c.lineTo(x, yy + th + Math.sin(x / r * 1.6 + i) * r * 0.02);
    }
    c.closePath();
    c.fill();
  }
  // the great candy spot
  blob(c, -r * 0.3, r * 0.24, r * 0.3, "255,150,205", 0.5, 0.52, -0.12);
  blob(c, -r * 0.3, r * 0.24, r * 0.13, "255,236,246", 0.4, 0.55, -0.12);
  // a few swirl highlights
  for (let i = 0; i < 6; i++) {
    blob(c, (rnd() - 0.5) * r * 1.6, (rnd() - 0.5) * r * 1.7,
      r * (0.06 + rnd() * 0.12), "255,240,255", 0.07, 0.4);
  }
  c.restore();

  // ring shadow cast across the globe
  c.save();
  c.translate(cx, cy);
  c.rotate(RING_TILT);
  const sh = c.createLinearGradient(0, -r * 0.34, 0, r * 0.24);
  sh.addColorStop(0, "rgba(18,4,44,0)");
  sh.addColorStop(0.38, "rgba(18,4,44,0.5)");
  sh.addColorStop(0.72, "rgba(18,4,44,0.42)");
  sh.addColorStop(1, "rgba(18,4,44,0)");
  c.fillStyle = sh;
  c.fillRect(-r * 1.1, -r * 0.34, r * 2.2, r * 0.58);
  c.restore();

  // terminator: linear falloff along the sun axis + cool night tint
  const tg = c.createLinearGradient(cx + SUN_X * r, cy + SUN_Y * r, cx - SUN_X * r * 1.15, cy - SUN_Y * r * 1.15);
  tg.addColorStop(0, "rgba(6,2,26,0)");
  tg.addColorStop(0.4, "rgba(8,3,30,0.1)");
  tg.addColorStop(0.66, "rgba(8,3,30,0.5)");
  tg.addColorStop(1, "rgba(5,2,20,0.88)");
  c.fillStyle = tg;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);

  // limb darkening for roundness
  const ld = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  ld.addColorStop(0, "rgba(20,4,48,0)");
  ld.addColorStop(1, "rgba(20,4,48,0.5)");
  c.fillStyle = ld;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);

  // rim light on the sunward limb
  const la = Math.atan2(SUN_Y, SUN_X);
  c.globalCompositeOperation = "lighter";
  c.lineWidth = Math.max(1, r * 0.06);
  c.strokeStyle = "rgba(226,206,255,0.55)";
  c.beginPath();
  c.arc(cx, cy, r - c.lineWidth * 0.4, la - 1.1, la + 1.1);
  c.stroke();
  // a whisper of scattered light on the night limb
  c.lineWidth = Math.max(1, r * 0.035);
  c.strokeStyle = "rgba(255,150,220,0.2)";
  c.beginPath();
  c.arc(cx, cy, r - c.lineWidth * 0.5, la + 1.35, la - 1.35);
  c.stroke();
  c.globalCompositeOperation = "source-over";
  c.restore();
}

/** The ring system, painted flat in the ring plane's local frame. */
function paintRings(c: CanvasRenderingContext2D, w: number, h: number, ra: number, inner: number) {
  const cx = w / 2, cy = h / 2;
  const rnd = mulberry32(31337);
  c.save();
  c.translate(cx, cy);
  const steps = 68;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const r = lerp(inner, ra, u);
    // Cassini-ish gaps + banded density
    let d = 0.5 + 0.5 * noise1(u * 9.5, 3);
    if (Math.abs(u - 0.42) < 0.035) d *= 0.12;
    if (Math.abs(u - 0.74) < 0.022) d *= 0.25;
    d *= 0.35 + 0.65 * Math.sin(Math.PI * clamp(u * 1.06, 0, 1));
    const warm = noise1(u * 5.1, 9) > 0.1;
    const col = warm ? "255,228,196" : "214,190,255";
    c.strokeStyle = rgba(col, clamp(d, 0, 1) * 0.42);
    c.lineWidth = Math.max(0.7, (ra - inner) / steps * 1.5);
    c.beginPath();
    c.ellipse(0, 0, r, Math.max(0.5, r * RING_FLAT), 0, 0, Math.PI * 2);
    c.stroke();
  }
  // a scatter of icy sparkle in the brightest annulus
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = lerp(inner, ra, 0.15 + rnd() * 0.75);
    c.fillStyle = `rgba(255,250,255,${0.1 + rnd() * 0.35})`;
    c.fillRect(Math.cos(a) * r - 0.6, Math.sin(a) * r * RING_FLAT - 0.6, 1.2, 1.2);
  }
  c.globalCompositeOperation = "destination-out";
  // the planet's shadow falling across the near side of the rings
  c.rotate(1.22);
  const len = ra * 1.2, hw = inner * 0.56;
  const sg = c.createLinearGradient(0, 0, len, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.8)");
  sg.addColorStop(0.65, "rgba(0,0,0,0.5)");
  sg.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = sg;
  c.fillRect(0, -hw, len, hw * 2);
  c.restore();
  c.globalCompositeOperation = "source-over";
}

/** Little cratered moonlet, lit from the same sun. */
function paintMoonlet(c: CanvasRenderingContext2D, D: number) {
  const r = D / 2 - 1;
  const m = D / 2;
  if (r <= 1) return;
  const rnd = mulberry32(8123);
  c.save();
  c.beginPath();
  c.arc(m, m, r, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = "#cfc6e6";
  c.fillRect(0, 0, D, D);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * r * 0.8;
    const cr = r * (0.1 + rnd() * 0.24);
    c.fillStyle = `rgba(112,102,150,${0.2 + rnd() * 0.2})`;
    c.beginPath();
    c.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, cr, 0, Math.PI * 2);
    c.fill();
  }
  const tg = c.createLinearGradient(m + SUN_X * r, m + SUN_Y * r, m - SUN_X * r, m - SUN_Y * r);
  tg.addColorStop(0, "rgba(10,4,32,0)");
  tg.addColorStop(0.5, "rgba(10,4,32,0.35)");
  tg.addColorStop(1, "rgba(8,3,26,0.92)");
  c.fillStyle = tg;
  c.fillRect(0, 0, D, D);
  c.restore();
}

/** Distant banded ice world — hazier and lower-contrast for aerial depth. */
function paintFarPlanet(c: CanvasRenderingContext2D, D: number, pad: number) {
  const r = D / 2 - pad;
  const m = D / 2;
  if (r <= 1) return;
  blob(c, m, m, r + pad, "120,190,255", 0.24);
  c.save();
  c.beginPath();
  c.arc(m, m, r, 0, Math.PI * 2);
  c.clip();
  const bg = c.createLinearGradient(m - r, m - r, m + r, m + r);
  bg.addColorStop(0, "#ffd79a");
  bg.addColorStop(0.5, "#e8845c");
  bg.addColorStop(1, "#8a3b6e");
  c.fillStyle = bg;
  c.fillRect(m - r, m - r, r * 2, r * 2);
  for (let i = 0; i < 12; i++) {
    const yy = m - r + (i / 11) * r * 2;
    const n = noise1(i * 1.7, 27);
    c.fillStyle = n > 0 ? `rgba(255,240,214,${0.05 + n * 0.12})` : `rgba(96,32,86,${0.05 - n * 0.12})`;
    c.fillRect(m - r, yy, r * 2, r * (0.08 + Math.abs(n) * 0.1));
  }
  const tg = c.createLinearGradient(m + SUN_X * r, m + SUN_Y * r, m - SUN_X * r, m - SUN_Y * r);
  tg.addColorStop(0, "rgba(10,6,34,0)");
  tg.addColorStop(0.55, "rgba(10,6,34,0.3)");
  tg.addColorStop(1, "rgba(8,4,26,0.8)");
  c.fillStyle = tg;
  c.fillRect(m - r, m - r, r * 2, r * 2);
  // atmospheric veil: distance washes the contrast out
  c.fillStyle = "rgba(96,120,220,0.16)";
  c.fillRect(m - r, m - r, r * 2, r * 2);
  c.restore();
}

/** A faint island universe, blitted with a slow spin. */
function paintGalaxy(c: CanvasRenderingContext2D, D: number) {
  const m = D / 2;
  const R = D * 0.46;
  const rnd = mulberry32(5150);
  c.save();
  c.translate(m, m);
  c.scale(1, 0.44);
  c.globalCompositeOperation = "lighter";
  blob(c, 0, 0, R * 0.95, "150,132,255", 0.1);
  for (let arm = 0; arm < 2; arm++) {
    const base = arm * Math.PI;
    for (let i = 0; i < 60; i++) {
      const u = i / 59;
      const a = base + u * 3.1;
      const rr = R * (0.1 + u * 0.88);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const w = R * (0.1 + u * 0.13);
      blob(c, x, y, w, "176,196,255", 0.07 * (1 - u * 0.4));
      if (i % 7 === 0) blob(c, x, y, w * 0.42, "255,150,214", 0.1);
    }
  }
  blob(c, 0, 0, R * 0.3, "255,238,206", 0.42);
  blob(c, 0, 0, R * 0.12, "255,252,238", 0.6);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.6) * R;
    c.fillStyle = rgba(starRgb(rnd()), 0.2 + rnd() * 0.3);
    c.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1, 1);
  }
  c.restore();
  c.globalCompositeOperation = "source-over";
}

/** A needle galaxy seen edge-on: lens, bulge, and a dust lane cut through it. */
function paintEdgeGalaxy(c: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const rnd = mulberry32(6621);
  c.globalCompositeOperation = "lighter";
  // the disc, as a run of squashed blobs tapering along the major axis
  for (let i = 0; i < 48; i++) {
    const u = (i / 47) * 2 - 1;
    const fall = Math.pow(1 - Math.abs(u), 0.75);
    const tilt = Math.sin(u * 1.1) * h * 0.06;
    blob(c, cx + u * w * 0.45, cy + tilt, h * (0.42 + fall * 0.6),
      "180,198,255", 0.075 * fall, 0.4);
  }
  blob(c, cx, cy, h * 0.95, "255,238,208", 0.16, 0.66);   // bulge
  blob(c, cx, cy, h * 0.44, "255,250,236", 0.3, 0.72);
  for (let i = 0; i < 26; i++) {
    const u = rnd() * 2 - 1;
    const x = cx + u * w * 0.44;
    const y = cy + (rnd() - 0.5) * h * 0.5 + Math.sin(u * 1.1) * h * 0.06;
    c.fillStyle = rgba(starRgb(rnd()), 0.16 + rnd() * 0.2);
    c.fillRect(x, y, 1, 1);
  }
  // dust lane, punched out so it reads as absorption rather than a dark stroke
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 44; i++) {
    const u = (i / 43) * 2 - 1;
    blob(c, cx + u * w * 0.45, cy + Math.sin(u * 1.1) * h * 0.06 + h * 0.02,
      h * 0.24, "0,0,0", 0.34 * Math.pow(1 - Math.abs(u), 0.5), 0.4);
  }
  c.globalCompositeOperation = "source-over";
}

/** A far elliptical galaxy — barely more than a warm smudge with a core. */
function paintSmudge(c: CanvasRenderingContext2D, D: number) {
  const m = D / 2;
  c.globalCompositeOperation = "lighter";
  blob(c, m, m, D * 0.46, "168,176,240", 0.1, 0.66, 0.5);
  blob(c, m, m, D * 0.26, "226,214,255", 0.16, 0.7, 0.5);
  blob(c, m, m, D * 0.1, "255,244,222", 0.34, 0.78, 0.5);
  c.globalCompositeOperation = "source-over";
}

/** A globular cluster: a swarm that thickens to an unresolvable core. */
function paintCluster(c: CanvasRenderingContext2D, D: number) {
  const m = D / 2;
  const rnd = mulberry32(19881);
  c.globalCompositeOperation = "lighter";
  blob(c, m, m, D * 0.42, "206,214,255", 0.1);
  blob(c, m, m, D * 0.16, "255,246,224", 0.26);
  for (let i = 0; i < 210; i++) {
    // r^3 concentrates the swarm hard into the middle
    const rr = Math.pow(rnd(), 3) * D * 0.46;
    const a = rnd() * Math.PI * 2;
    const s = 0.4 + rnd() * 0.55;
    c.fillStyle = rgba(starRgb(0.2 + rnd() * 0.7), 0.2 + rnd() * 0.55);
    c.fillRect(m + Math.cos(a) * rr - s, m + Math.sin(a) * rr - s, s * 2, s * 2);
  }
  c.globalCompositeOperation = "source-over";
}

/**
 * A solar-wind streamer. Built from stretched blobs walking a noise-curved
 * centreline and feathered to nothing at both ends, so however it is rotated
 * and scaled it can never present a straight edge.
 */
function paintWisp(c: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rnd = mulberry32(seed);
  const cy = h / 2;
  c.globalCompositeOperation = "lighter";
  for (let strand = 0; strand < 3; strand++) {
    const yo = (strand - 1) * h * 0.16;
    const col = strand === 1 ? "150,226,255" : strand === 0 ? "196,168,255" : "120,246,222";
    const steps = 56;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const y = cy + yo + fbm1(u * 3.4 + strand * 13 + seed * 0.01, 3, seed + strand) * h * 0.3;
      // both ends taper to nothing; the middle breathes
      const taper = Math.pow(Math.sin(u * Math.PI), 0.7);
      const gate = 0.4 + 0.6 * Math.abs(noise1(u * 7 + strand * 5, seed + 3));
      blob(c, x, y, h * (0.07 + gate * 0.13) * (0.35 + taper), col,
        0.062 * taper * gate, 0.3 + rnd() * 0.22,
        fbm1(u * 3.4 + strand * 13, 2, seed) * 0.6);
    }
  }
  c.globalCompositeOperation = "source-over";
}

/**
 * Aurora curtain rays, baked once. Rows of thin vertical strokes read as a bar
 * chart no matter how their heights are jittered — the give-away is the crisp
 * edge. These are chains of tall soft blobs at irregular pitch and width that
 * overlap their neighbours, so the light is ribbed rather than fenced.
 */
function paintAuroraRays(c: CanvasRenderingContext2D, w: number, h: number) {
  const rnd = mulberry32(70707);
  c.globalCompositeOperation = "lighter";
  let x = 0;
  while (x < w) {
    const wid = h * (0.018 + rnd() * 0.05);
    const top = h * (0.04 + rnd() * 0.5);
    const bot = h * (0.9 + rnd() * 0.08);
    const a = (0.03 + Math.pow(rnd(), 2) * 0.26) / 6;   // a few rays lead
    const lean = (rnd() - 0.5) * h * 0.05;
    const col = rnd() < 0.34 ? "196,232,255" : "150,255,224";
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const y = lerp(top, bot, u);
      // faded at both ends, so a ray dissolves instead of stopping
      const fade = Math.pow(Math.sin(u * Math.PI), 0.55);
      blob(c, x + lean * (u - 0.5) * 2, y, wid * (1.5 + u * 0.9), col, a * fade, 2.6);
    }
    x += h * (0.022 + rnd() * 0.11);
  }
  c.globalCompositeOperation = "source-over";
}

/** A lumpy rock, lit by the same distant sun as everything else. */
function paintAsteroid(c: CanvasRenderingContext2D, D: number) {
  const m = D / 2;
  const r = D * 0.4;
  const rnd = mulberry32(3391);
  c.save();
  c.beginPath();
  const pts = 11;
  for (let k = 0; k <= pts; k++) {
    const a = (k / pts) * Math.PI * 2;
    const rr = r * (0.66 + Math.abs(noise1(k * 1.7, 29)) * 0.5);
    const x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr * 0.84;
    if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  c.clip();
  const g = c.createLinearGradient(m + SUN_X * r, m + SUN_Y * r, m - SUN_X * r, m - SUN_Y * r);
  g.addColorStop(0, "#b9aecd");
  g.addColorStop(0.45, "#6f6488");
  g.addColorStop(1, "#2a2144");
  c.fillStyle = g;
  c.fillRect(0, 0, D, D);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * r * 0.7;
    c.fillStyle = `rgba(42,32,66,${0.2 + rnd() * 0.25})`;
    c.beginPath();
    c.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, r * (0.08 + rnd() * 0.16), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Orbital station: modules, trusses, solar arrays, dish. */
function paintStation(c: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const u = w / 100;                          // 100-unit design grid
  c.save();
  c.translate(cx, cy);
  // truss
  c.strokeStyle = "#8f9ac4";
  c.lineWidth = Math.max(1, u * 1.4);
  c.beginPath();
  c.moveTo(-u * 40, 0);
  c.lineTo(u * 40, 0);
  c.stroke();
  c.lineWidth = Math.max(0.6, u * 0.7);
  c.strokeStyle = "rgba(180,192,228,0.65)";
  c.beginPath();
  for (let x = -40; x < 40; x += 6) {
    c.moveTo(x * u, -u * 2.4);
    c.lineTo((x + 6) * u, u * 2.4);
    c.moveTo(x * u, u * 2.4);
    c.lineTo((x + 6) * u, -u * 2.4);
  }
  c.stroke();
  // solar arrays
  for (const s of [-1, 1]) {
    for (const yy of [-1, 1]) {
      const x0 = s * u * 16, y0 = yy * u * 5;
      const pw = u * 24, ph = u * 13;
      const pg = c.createLinearGradient(x0, y0, x0 + s * pw, y0 + yy * ph);
      pg.addColorStop(0, "#5f7fd6");
      pg.addColorStop(0.5, "#2d47a0");
      pg.addColorStop(1, "#16255e");
      c.fillStyle = pg;
      c.beginPath();
      c.rect(s > 0 ? x0 : x0 - pw, yy > 0 ? y0 : y0 - ph, pw, ph);
      c.fill();
      c.strokeStyle = "rgba(190,215,255,0.35)";
      c.lineWidth = Math.max(0.5, u * 0.4);
      c.stroke();
      c.beginPath();
      const bx = s > 0 ? x0 : x0 - pw, by = yy > 0 ? y0 : y0 - ph;
      for (let k = 1; k < 6; k++) { c.moveTo(bx + (pw * k) / 6, by); c.lineTo(bx + (pw * k) / 6, by + ph); }
      c.moveTo(bx, by + ph / 2); c.lineTo(bx + pw, by + ph / 2);
      c.stroke();
    }
  }
  // core module (hand-rolled capsule — roundRect is too new for old tablets)
  const mg = c.createLinearGradient(0, -u * 7, 0, u * 7);
  mg.addColorStop(0, "#eef1ff");
  mg.addColorStop(0.45, "#c2c8e6");
  mg.addColorStop(1, "#6a7098");
  c.fillStyle = mg;
  c.beginPath();
  c.moveTo(-u * 8, -u * 6);
  c.lineTo(u * 8, -u * 6);
  c.quadraticCurveTo(u * 14, -u * 6, u * 14, 0);
  c.quadraticCurveTo(u * 14, u * 6, u * 8, u * 6);
  c.lineTo(-u * 8, u * 6);
  c.quadraticCurveTo(-u * 14, u * 6, -u * 14, 0);
  c.quadraticCurveTo(-u * 14, -u * 6, -u * 8, -u * 6);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(60,64,96,0.55)";
  for (let k = 0; k < 3; k++) c.fillRect(-u * 8 + k * u * 7, -u * 2, u * 3.2, u * 4);
  // dish
  c.fillStyle = "#dfe4ff";
  c.beginPath();
  c.ellipse(u * 17, -u * 8, u * 6, u * 4, -0.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#9aa2cc";
  c.lineWidth = Math.max(0.6, u * 0.8);
  c.beginPath();
  c.moveTo(u * 13, -u * 4);
  c.lineTo(u * 16, -u * 7);
  c.stroke();
  c.restore();
}

/** Cheery little rocket. */
function paintRocket(c: CanvasRenderingContext2D, w: number, h: number) {
  const u = w / 100;
  c.save();
  c.translate(w / 2, h / 2);
  // fins
  c.fillStyle = "#00c2b9";
  c.beginPath();
  c.moveTo(-u * 22, -u * 8); c.quadraticCurveTo(-u * 36, -u * 20, -u * 34, -u * 6); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(-u * 22, u * 8); c.quadraticCurveTo(-u * 36, u * 20, -u * 34, u * 6); c.closePath(); c.fill();
  // body
  const bg = c.createLinearGradient(0, -u * 12, 0, u * 12);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.55, "#e8e4f6");
  bg.addColorStop(1, "#9d94c7");
  c.fillStyle = bg;
  c.beginPath();
  c.moveTo(u * 44, 0);
  c.quadraticCurveTo(u * 18, -u * 13, -u * 30, -u * 10);
  c.quadraticCurveTo(-u * 38, 0, -u * 30, u * 10);
  c.quadraticCurveTo(u * 18, u * 13, u * 44, 0);
  c.closePath();
  c.fill();
  // nose
  c.fillStyle = "#fb66e5";
  c.beginPath();
  c.moveTo(u * 44, 0);
  c.quadraticCurveTo(u * 22, -u * 11, u * 16, -u * 8);
  c.quadraticCurveTo(u * 22, 0, u * 16, u * 8);
  c.quadraticCurveTo(u * 22, u * 11, u * 44, 0);
  c.closePath();
  c.fill();
  // window
  c.fillStyle = "#ffd65a";
  c.beginPath();
  c.arc(u * 2, 0, u * 7, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = Math.max(1, u * 1.6);
  c.stroke();
  c.restore();
}

/* ══ cached art: the lunar surface ══════════════════════════════════════════ */

function paintMoonGround(c: CanvasRenderingContext2D, w: number, h: number, horizon: number) {
  const rnd = mulberry32(20250822);
  const depth = Math.max(4, h - horizon);
  const surfY = (x: number) => horizon + fbm1(x * 0.0032, 3, 61) * horizon * 0.3;

  // ── distant mountain ridges above the horizon ──
  for (let ridge = 0; ridge < 2; ridge++) {
    const amp = horizon * (0.55 - ridge * 0.2);
    const base = horizon + 2;
    // the skirt runs to the bottom of the plate: the regolith paints over it, so
    // a low dip in the foreground surface can never open a gap under a ridge.
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += Math.max(6, w / 90)) {
      const y = base - amp * (0.35 + 0.65 * Math.abs(fbm1(x * (0.0026 + ridge * 0.0016) + ridge * 40, 4, 71 + ridge)));
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = ridge === 0 ? "rgba(58,44,102,0.85)" : "rgba(84,68,136,0.9)";
    c.fill();
    // rim light along the crests (sun from the left)
    c.save();
    c.clip();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = ridge === 0 ? "rgba(180,160,255,0.35)" : "rgba(214,198,255,0.45)";
    c.lineWidth = 1.6;
    c.beginPath();
    for (let x = 0; x <= w; x += Math.max(6, w / 90)) {
      const y = base - amp * (0.35 + 0.65 * Math.abs(fbm1(x * (0.0026 + ridge * 0.0016) + ridge * 40, 4, 71 + ridge)));
      if (x === 0) c.moveTo(x, y + 1); else c.lineTo(x, y + 1);
    }
    c.stroke();
    c.restore();
  }

  // ── regolith body ──
  c.beginPath();
  c.moveTo(0, surfY(0));
  for (let x = 0; x <= w; x += Math.max(5, w / 140)) c.lineTo(x, surfY(x));
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.closePath();
  c.save();
  c.clip();

  const gg = c.createLinearGradient(0, horizon - horizon * 0.3, 0, h);
  gg.addColorStop(0, "#ded8f4");
  gg.addColorStop(0.28, "#bfb6e2");
  gg.addColorStop(0.7, "#9186bd");
  gg.addColorStop(1, "#6c6096");
  c.fillStyle = gg;
  c.fillRect(0, 0, w, h);

  // broad tonal mottling
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = horizon + Math.pow(rnd(), 0.7) * depth;
    const r = depth * (0.1 + rnd() * 0.55);
    blob(c, x, y, r, rnd() < 0.5 ? "255,250,255" : "70,58,116", 0.035 + rnd() * 0.05, 0.3);
  }

  // ── crater field ──
  const craters = Math.round(clamp(w / 42, 12, 46));
  for (let i = 0; i < craters; i++) {
    const dz = Math.pow(rnd(), 0.62);                  // 0 = far, 1 = near
    const x = rnd() * w;
    const y = horizon + dz * depth * 1.02;
    const r = depth * (0.06 + dz * 0.34) * (0.55 + rnd() * 0.9);
    const flat = 0.3 + dz * 0.22;
    if (r < 1.5) continue;

    // ejecta blanket
    blob(c, x, y, r * 2.1, "255,250,255", 0.05, flat);
    // bowl: shadowed near wall (sunward) → lit far wall
    c.save();
    c.translate(x, y);
    c.scale(1, flat);
    const bwl = c.createLinearGradient(-r, 0, r, 0);
    bwl.addColorStop(0, "rgba(44,32,84,0.55)");
    bwl.addColorStop(0.42, "rgba(96,84,148,0.3)");
    bwl.addColorStop(0.78, "rgba(226,220,255,0.4)");
    bwl.addColorStop(1, "rgba(196,188,238,0.24)");
    c.fillStyle = bwl;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    // rim: bright on the sunward side, shadowed opposite
    c.lineWidth = Math.max(1, r * 0.14);
    c.strokeStyle = "rgba(255,252,255,0.55)";
    c.beginPath();
    c.arc(0, 0, r * 1.02, Math.PI * 0.58, Math.PI * 1.42);
    c.stroke();
    c.strokeStyle = "rgba(38,26,74,0.4)";
    c.beginPath();
    c.arc(0, 0, r * 1.02, Math.PI * 1.6, Math.PI * 0.4);
    c.stroke();
    c.restore();

    // ejecta rays off the biggest fresh craters
    if (r > depth * 0.16 && rnd() < 0.45) {
      c.save();
      c.translate(x, y);
      c.scale(1, flat);
      c.globalCompositeOperation = "lighter";
      const rays = 9;
      for (let k = 0; k < rays; k++) {
        const a = rnd() * Math.PI * 2;
        const len = r * (1.6 + rnd() * 2.4);
        const rg = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        rg.addColorStop(0, "rgba(255,250,255,0.14)");
        rg.addColorStop(1, "rgba(255,250,255,0)");
        c.strokeStyle = rg;
        c.lineWidth = Math.max(1, r * (0.12 + rnd() * 0.2));
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        c.stroke();
      }
      c.restore();
    }
  }

  // ── rover tracks receding toward the horizon ──
  c.save();
  c.globalAlpha = 0.5;
  for (const side of [-1, 1]) {
    c.beginPath();
    for (let u = 0; u <= 1.001; u += 0.05) {
      const y = h + 6 - u * depth * 0.98;
      const persp = 1 - u * 0.86;
      const x = w * 0.2 + u * w * 0.34 + Math.sin(u * 2.6) * w * 0.05 + side * depth * 0.22 * persp;
      if (u === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = "rgba(58,44,98,0.5)";
    c.lineWidth = Math.max(1.2, depth * 0.05);
    c.stroke();
    c.strokeStyle = "rgba(240,236,255,0.4)";
    c.lineWidth = Math.max(0.6, depth * 0.02);
    c.stroke();
  }
  // tread ties
  c.strokeStyle = "rgba(52,40,92,0.35)";
  c.lineWidth = 1;
  c.beginPath();
  for (let u = 0; u <= 1.001; u += 0.028) {
    const y = h + 6 - u * depth * 0.98;
    const persp = 1 - u * 0.86;
    const xc = w * 0.2 + u * w * 0.34 + Math.sin(u * 2.6) * w * 0.05;
    c.moveTo(xc - depth * 0.22 * persp, y);
    c.lineTo(xc + depth * 0.22 * persp, y);
  }
  c.stroke();
  c.restore();

  // ── footprints wandering off to the right ──
  c.save();
  c.globalAlpha = 0.45;
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const y = h - 4 - u * depth * 0.72;
    const persp = 1 - u * 0.7;
    const x = w * 0.72 + u * w * 0.18 + Math.sin(u * 4) * w * 0.02 + (i % 2 ? 1 : -1) * depth * 0.06 * persp;
    const fw = Math.max(1.4, depth * 0.045 * persp);
    c.fillStyle = "rgba(48,36,88,0.55)";
    c.beginPath();
    c.ellipse(x, y, fw, fw * 0.55, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,252,255,0.3)";
    c.beginPath();
    c.ellipse(x - fw * 0.35, y - fw * 0.28, fw * 0.55, fw * 0.24, 0.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // ── boulders with cast shadows ──
  const rocks = Math.round(clamp(w / 90, 6, 22));
  for (let i = 0; i < rocks; i++) {
    const dz = Math.pow(rnd(), 0.5);
    const x = rnd() * w;
    const y = horizon + 4 + dz * depth * 0.95;
    const r = Math.max(1.5, depth * (0.03 + dz * 0.09) * (0.6 + rnd() * 0.9));
    // shadow away from the sun
    c.fillStyle = "rgba(36,26,72,0.45)";
    c.beginPath();
    c.ellipse(x + r * 1.3, y + r * 0.28, r * 1.5, r * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    // body
    c.beginPath();
    const pts = 7;
    for (let k = 0; k <= pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const rr = r * (0.72 + noise1(i * 3.1 + k * 0.9, 13) * 0.3);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.78;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    const rg = c.createLinearGradient(x - r, y - r, x + r, y + r);
    rg.addColorStop(0, "#e9e3ff");
    rg.addColorStop(0.5, "#a99ed2");
    rg.addColorStop(1, "#544878");
    c.fillStyle = rg;
    c.fill();
  }

  // ── fine regolith speckle ──
  const grains = Math.round(clamp(w * 1.1, 300, 1600));
  for (let i = 0; i < grains; i++) {
    const x = rnd() * w;
    const y = horizon + Math.pow(rnd(), 0.55) * depth;
    const lite = rnd() < 0.55;
    c.fillStyle = lite ? `rgba(255,252,255,${0.05 + rnd() * 0.16})` : `rgba(48,36,88,${0.05 + rnd() * 0.14})`;
    const s = rnd() < 0.85 ? 1 : 1.6;
    c.fillRect(x, y, s, s);
  }
  c.restore();   // end regolith clip

  // ── horizon dust haze + a crisp lit edge ──
  c.save();
  c.globalCompositeOperation = "lighter";
  const hz = c.createLinearGradient(0, horizon - horizon * 0.9, 0, horizon + depth * 0.34);
  hz.addColorStop(0, "rgba(186,166,255,0)");
  hz.addColorStop(0.55, "rgba(198,180,255,0.16)");
  hz.addColorStop(0.72, "rgba(226,212,255,0.22)");
  hz.addColorStop(1, "rgba(186,166,255,0)");
  c.fillStyle = hz;
  c.fillRect(0, horizon - horizon * 0.9, w, depth * 0.34 + horizon * 0.9);
  c.strokeStyle = "rgba(244,238,255,0.5)";
  c.lineWidth = 1.4;
  c.beginPath();
  for (let x = 0; x <= w; x += Math.max(5, w / 140)) {
    const y = surfY(x);
    if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  c.restore();
  c.globalCompositeOperation = "source-over";
}

/* ══ live per-frame state ═══════════════════════════════════════════════════ */

interface LiveStar { x: number; y: number; s: number; g: number; a: number; sp: number; ph: number; drift: number }
interface Puff { x: number; y: number; r: number; life: number }
/** One crossing body (comet / station / asteroid) — everything about a pass is
 *  re-rolled from a seed keyed to the pass number, so nothing ever repeats. */
interface Pass {
  last: number; gap: number; u: number; live: number; pass: number;
  dir: number; y0: number; y1: number; spd: number; sz: number; spin: number;
}
const newPass = (gap: number): Pass => ({
  last: 0, gap, u: 0, live: 0, pass: 0,
  dir: -1, y0: 0.2, y1: 0.3, spd: 0.1, sz: 1, spin: 0,
});

interface SpaceState {
  key: string;
  born: number;
  frames: number;
  stars: LiveStar[];
  burst: { n: number; next: number; at: number; rx: number; ry: number; ang: number; dir: number; idx: number };
  portal: { next: number; open: number; env: number; x: number; y: number; pass: number };
  rocket: { next: number; x: number; puffs: Puff[]; w: number; y: number; spd: number; pass: number };
  comet: Pass;
  station: Pass;
  rock: Pass;
}

const newSpaceState = (): SpaceState => ({
  key: "",
  born: -1,
  frames: 0,
  stars: [],
  burst: { n: 0, next: 0, at: 0, rx: 0, ry: 0, ang: 0.8, dir: 1, idx: 0 },
  portal: { next: 0, open: 0, env: 0, x: 0.87, y: 0.62, pass: 0 },
  rocket: { next: 0, x: 2, puffs: [], w: 0, y: 0.78, spd: 0.17, pass: 0 },
  comet: newPass(26),
  station: newPass(44),
  rock: newPass(14),
});

/**
 * Re-roll a crossing. Every parameter that a child could use to recognise a
 * repeat — when it comes, which way it goes, how high, how fast, how big — is
 * drawn from a seed keyed to the pass index, so passes never rhyme.
 */
function rollPass(p: Pass, t: number, seed: number, cfg: {
  gap: [number, number]; spd: [number, number]; y0: [number, number];
  fall: number; sz: [number, number]; rtl: number; slow: number;
}) {
  p.pass++;
  p.last = t;
  const r = mulberry32(seed + p.pass * 7919);
  // `slow` stretches the waits only: the crossing itself is already calmed by
  // the MO factor on dt, and slowing it twice leaves a comet barely moving.
  p.gap = lerp(cfg.gap[0], cfg.gap[1], r()) * cfg.slow;
  p.spd = lerp(cfg.spd[0], cfg.spd[1], r());
  p.dir = r() < cfg.rtl ? -1 : 1;
  p.y0 = lerp(cfg.y0[0], cfg.y0[1], r());
  p.y1 = p.y0 + (r() - 0.4) * cfg.fall;
  p.sz = lerp(cfg.sz[0], cfg.sz[1], r());
  p.spin = (r() - 0.5) * 0.5;
  p.u = 0;
  p.live = 1;
}

/** Where a crossing body is, 0 → 1 across the frame plus generous margins. */
const passX = (p: Pass) => (p.dir < 0 ? 1.3 - p.u * 1.6 : -0.3 + p.u * 1.6);

/**
 * Cache builds are spread over the first frames of a world so entering never
 * drops a clump of frames: returns 0 (skip entirely) until `at`, then fades in.
 */
const warmup = (frames: number, at: number) => clamp((frames - at) / 10, 0, 1);

/** Reused every frame so the hot path allocates nothing. */
const GLYPHS: HTMLCanvasElement[] = [];
const AURORA_COLS = ["64,232,196", "150,146,255", "255,150,232"];

/**
 * The parallax ladder. The counts matter far less than the relationship
 * between the columns: something far away is small, dim, twinkles lazily and
 * barely moves; something near is big, bright, scintillates and slides. Give
 * every layer the same drift and the sky flattens into a printed backdrop.
 */
const STAR_DEPTHS = [
  { n: 36, s: 5.4, a: 0.3, sp: 0.55, drift: 3.2, spike: 0 },
  { n: 30, s: 8.4, a: 0.52, sp: 0.95, drift: 7, spike: 0.2 },
  { n: 15, s: 13.4, a: 0.85, sp: 1.75, drift: 13, spike: 1 },
];

function buildStars(W: number, top: number): LiveStar[] {
  const out: LiveStar[] = [];
  for (let d = 0; d < STAR_DEPTHS.length; d++) {
    const L = STAR_DEPTHS[d];
    const n = detail(L.n);
    const rnd = mulberry32(515151 + d * 30301);
    for (let i = 0; i < n; i++) {
      const k = rnd();
      const bright = rnd() < L.spike;
      const gi = k < 0.34 ? 0 : k < 0.7 ? 1 : 2;
      out.push({
        x: rnd() * W,
        y: rnd() * top,
        s: L.s * (0.7 + rnd() * 0.9),
        g: gi + (bright ? 3 : 0),
        a: L.a * (0.62 + rnd() * 0.5),
        sp: L.sp * (0.5 + rnd()),
        ph: rnd() * Math.PI * 2,
        drift: L.drift * (0.86 + rnd() * 0.28),
      });
    }
  }
  return out;
}

/* ══ the world ══════════════════════════════════════════════════════════════ */

/** Solar-wind streamers threading the middle distance. */
const WISPS = [
  { key: "sp.wisp0", seed: 771, x: 0.42, y: 0.5, s: 1.18, a: 0.38, rot: -0.36, sp: 0.05, ph: 0.4 },
  { key: "sp.wisp1", seed: 1553, x: 0.63, y: 0.76, s: 0.96, a: 0.32, rot: 0.3, sp: -0.037, ph: 2.1 },
  { key: "sp.wisp2", seed: 2287, x: 0.26, y: 0.92, s: 0.92, a: 0.22, rot: 0.13, sp: 0.028, ph: 4.3 },
];

export function drawSpace({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 1) || !(H > 1) || !Number.isFinite(t) || !Number.isFinite(floorY)) return;
  const S = Math.min(W, H);
  const D = Math.max(W, H);
  const sky = clamp(floorY, S * 0.2, H);       // usable sky height
  const q = quality();
  const rich = richFx();

  // Reduced motion calms rather than stops: every ambient phase runs on `tm`
  // instead of `t`, velocities scale by MO, and flybys wait SLOW× longer.
  const MO = calm() ? 0.34 : 1;
  const tm = t * MO;
  const SLOW = calm() ? 1.7 : 1;

  // ── the shared clock ──────────────────────────────────────────────────────
  // Space is the odd one out: it is already dark, so "night" cannot mean "add
  // darkness". It means take the daylight away and let the stars have the
  // frame. By day a lit sky washes the stars out and the sun catches the rims;
  // by night the nebula, the aurora and the starfield are the whole show.
  const L = dayLight();
  const Wm = dayWarmth();
  const starDim = lerp(1.14, 0.38, L); // a bright sky drowns faint stars
  const nebDim = lerp(1, 0.52, L);
  const glowDim = lerp(1, 0.6, L);

  const st = slot<SpaceState>(fx, "space.v3", newSpaceState);
  if (st.born < 0) {
    // stagger every event so the first minute never feels empty or busy
    st.born = t;
    st.comet.last = t - 20;      // first comet at about +6s
    st.station.last = t - 32;    // station at about +12s
    st.rock.last = t - 11;       // asteroid at about +3s
    st.burst.next = t + 4;
    st.portal.next = t + 21;
    st.rocket.next = t + 16;
  }
  const sizeKey = `${Math.round(W)}x${Math.round(H)}x${Math.round(sky)}:${q}`;
  if (st.key !== sizeKey) {
    st.key = sizeKey;
    st.stars = buildStars(W, sky * 0.97);
  }
  if (st.frames < 1000) st.frames++;

  // lunar ground geometry, needed early so the aurora can be clipped to the sky
  const gMarg = Math.round(clamp(S * 0.11, 24, 110));
  const gTop = Math.round(floorY) - gMarg;
  const gH = Math.max(8, Math.round(H) - gTop + 2);
  // The baked horizon wanders ±0.3·gMarg around floorY; anything that must stay
  // on one side of it is parked outside that band rather than clipped to it.

  /* ══ MATTER ═══════════════════════════════════════════════════════════════ */

  /* ── 1 · sky plate ───────────────────────────────────────────────────────── */
  cachedLayer(ctx, "sp.sky", Math.ceil(W), Math.ceil(H), "v3", paintSky);

  /* ── 2 · the daylight lift ───────────────────────────────────────────────── */
  // One gradient does all of it: raises the sky toward blue-violet, and warms
  // the sun corner at dawn and dusk. Costs nothing at night, where it is skipped.
  if (L > 0.02) {
    const g = ctx.createLinearGradient(0, -H * 0.12, W * 0.88, H);
    g.addColorStop(0, `rgba(255,198,146,${0.32 * L * (0.38 + 0.62 * Wm)})`);
    g.addColorStop(0.28, `rgba(146,156,236,${0.36 * L})`);
    g.addColorStop(0.7, `rgba(126,126,222,${0.29 * L})`);
    g.addColorStop(1, `rgba(158,124,212,${0.22 * L})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── 3 · volumetric nebula plates ────────────────────────────────────────── */
  const P = Math.round(clamp(S * 0.95, 128, 560));
  const plateN = q === 2 ? 4 : q === 1 ? 3 : 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < plateN; i++) {
    // one new plate baked every 4 frames so world entry never stalls
    const warm = warmup(st.frames, 8 + i * 4);
    if (warm <= 0) break;
    const p = PLATES[i];
    const plate = cachedSprite(p.key, P, P, "v3", (c, pw) => paintNebula(c, pw, p.seed, p.rgb, p.hot));
    const breathe = 1 + Math.sin(tm * p.dx * 0.9 + p.rot) * 0.045;
    const scl = (D * 0.56 * p.s * breathe) / P;
    const x = W * p.x + Math.sin(tm * p.dx + p.rot) * W * 0.022;
    const y = sky * p.y + Math.cos(tm * p.dy + p.rot) * H * 0.016;
    ctx.globalAlpha = warm * p.a * nebDim * (0.86 + Math.sin(tm * p.dy * 1.7 + p.rot) * 0.14);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rot + tm * p.sp);
    ctx.scale(scl, scl);
    ctx.drawImage(plate, -P / 2, -P / 2);
    ctx.restore();
  }
  ctx.restore();

  /* ── 4 · the deep field ──────────────────────────────────────────────────── */
  // The middle of the frame used to be nothing but starfield. These are the
  // things a child can actually find in it: a spiral seen face-on, a needle
  // seen edge-on, a far smudge, and a cluster. All baked, all one blit each.
  const wDeep = warmup(st.frames, 4);
  if (wDeep > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const gD = Math.round(clamp(S * 0.36, 64, 340));
    const gal = cachedSprite("sp.galaxy", gD, gD, "v3", (c, w) => paintGalaxy(c, w));
    ctx.globalAlpha = wDeep * (0.6 + Math.sin(tm * 0.21) * 0.06) * glowDim;
    ctx.save();
    ctx.translate(W * 0.63, sky * 0.44);
    ctx.rotate(0.5 + tm * 0.012);          // an island universe turns slowly
    ctx.drawImage(gal, -gD / 2, -gD / 2);
    ctx.restore();

    const eW = Math.round(clamp(S * 0.32, 48, 300));
    const eH = Math.max(6, Math.round(eW * 0.3));
    const edge = cachedSprite("sp.egal", eW, eH, "v3", paintEdgeGalaxy);
    ctx.globalAlpha = wDeep * 0.66 * glowDim;
    ctx.save();
    ctx.translate(W * 0.2, sky * 0.67);
    ctx.rotate(-0.6 + tm * 0.006);
    ctx.drawImage(edge, -eW / 2, -eH / 2);
    ctx.restore();

    const sD = Math.round(clamp(S * 0.17, 24, 170));
    const sm = cachedSprite("sp.smudge", sD, sD, "v3", (c, w) => paintSmudge(c, w));
    ctx.globalAlpha = wDeep * 0.5 * glowDim;
    ctx.drawImage(sm, W * 0.88 - sD / 2, sky * 0.76 - sD / 2);

    const cD = Math.round(clamp(S * 0.14, 24, 140));
    const cl = cachedSprite("sp.cluster", cD, cD, "v3", (c, w) => paintCluster(c, w));
    ctx.globalAlpha = wDeep * (0.68 + Math.sin(tm * 0.3 + 2) * 0.05) * starDim;
    ctx.drawImage(cl, W * 0.4 - cD / 2, sky * 0.85 - cD / 2);
    ctx.restore();
  }

  /* ── 5 · ion wisps ───────────────────────────────────────────────────────── */
  const wWisp = warmup(st.frames, 16);
  const nWisp = rich ? 2 : q === 1 ? 1 : 0;
  if (wWisp > 0 && nWisp > 0) {
    const ww = Math.round(clamp(D * 0.38, 96, 380));
    const wh = Math.max(12, Math.round(ww * 0.3));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < nWisp; i++) {
      const cf = WISPS[i];
      const sp = cachedSprite(cf.key, ww, wh, "v3", (c, w, h) => paintWisp(c, w, h, cf.seed));
      const ph = tm * cf.sp + cf.ph;
      ctx.globalAlpha = wWisp * cf.a * glowDim * (0.62 + 0.38 * Math.sin(ph * 1.7));
      ctx.save();
      ctx.translate(W * cf.x + Math.sin(ph) * W * 0.045, sky * cf.y + Math.cos(ph * 0.8) * S * 0.018);
      ctx.rotate(cf.rot + Math.sin(ph * 0.6) * 0.07);
      ctx.scale(cf.s, cf.s);
      ctx.drawImage(sp, -ww / 2, -wh / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ── 6 · starfield: the slow baked plate (parallax depth 1) ──────────────── */
  const wSt = warmup(st.frames, 2);
  if (wSt > 0) {
    const plateH = Math.max(2, Math.round(sky));
    const stars1 = cachedSprite("sp.stars1", Math.ceil(W), plateH, "v3", paintStarPlate);
    const sw1 = stars1.width;
    const dx1 = -((tm * 1.2) % sw1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = wSt * starDim;
    ctx.drawImage(stars1, dx1, 0);
    ctx.drawImage(stars1, dx1 + sw1, 0);
    ctx.restore();
  }

  /* ── 7 · distant banded world (deep parallax) ────────────────────────────── */
  const wFar = warmup(st.frames, 6);
  const fr = Math.round(clamp(S * 0.045, 8, 90));
  const fx0 = W * 0.115 + Math.sin(tm * 0.017) * W * 0.006;
  const fy0 = clamp(sky * 0.36, fr + 12, H) + Math.cos(tm * 0.021) * S * 0.006;
  if (wFar > 0) {
    const fpad = Math.max(2, Math.round(fr * 0.34));
    const fD = fr * 2 + fpad * 2;
    const far = cachedSprite("sp.far", fD, fD, "v3", (c, w) => paintFarPlanet(c, w, fpad));
    ctx.save();
    ctx.globalAlpha = wFar;
    ctx.drawImage(far, fx0 - fD / 2, fy0 - fD / 2);
    ctx.restore();
  }

  /* ── 8 · hero ringed planet ──────────────────────────────────────────────── */
  const wHero = warmup(st.frames, 3);
  const pr = Math.round(clamp(S * 0.088, 12, 190));
  const px = W * 0.81;
  const py = clamp(H * 0.19, pr * 1.15 + H * 0.07, sky * 0.6);
  let mlx = px, mly = py, mlS = pr * 0.3, mlFront = false;
  if (wHero > 0) {
    ctx.save();
    ctx.globalAlpha = wHero;
    const ppad = Math.max(3, Math.round(pr * 0.3));
    const pD = pr * 2 + ppad * 2;
    const ra = Math.round(pr * 2.05);
    const rin = Math.round(pr * 1.2);
    const RW = ra * 2 + 8;
    let RH = Math.round(ra * RING_FLAT) * 2 + 8;
    if (RH % 2) RH += 1;
    const rings = cachedSprite("sp.rings", RW, RH, `v3:${ra}:${rin}`, (c, w, h) => paintRings(c, w, h, ra, rin));
    const globe = cachedSprite("sp.globe", pD, pD, "v3", (c, w) => paintGasGiant(c, w, ppad));
    const mlD = Math.max(4, Math.round(pr * 0.3));
    const moonlet = cachedSprite("sp.moonlet", mlD, mlD, "v3", (c, w) => paintMoonlet(c, w));

    // the moonlet is on a real orbit in the ring plane — that is why it moves
    const mph = tm * 0.13 + 1.15;
    const orb = pr * 2.7;
    const cosT = Math.cos(RING_TILT), sinT = Math.sin(RING_TILT);
    const ox = Math.cos(mph) * orb, oy = Math.sin(mph) * orb * 0.34;
    mlx = px + ox * cosT - oy * sinT;
    mly = py + ox * sinT + oy * cosT;
    mlS = mlD * (1 + Math.sin(mph) * 0.12);
    mlFront = Math.sin(mph) > 0;

    // rings behind → moonlet if behind → globe → rings in front → moonlet if front
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(RING_TILT);
    ctx.drawImage(rings, 0, 0, RW, RH / 2, -RW / 2, -RH / 2, RW, RH / 2);
    ctx.restore();
    if (!mlFront) ctx.drawImage(moonlet, mlx - mlS / 2, mly - mlS / 2, mlS, mlS);
    ctx.drawImage(globe, px - pD / 2, py - pD / 2);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(RING_TILT);
    ctx.drawImage(rings, 0, RH / 2, RW, RH / 2, -RW / 2, 0, RW, RH / 2);
    ctx.restore();
    if (mlFront) ctx.drawImage(moonlet, mlx - mlS / 2, mly - mlS / 2, mlS, mlS);

    // the planet turns: a cloud band creeping across the lit face
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.1 + Math.sin(tm * 0.23) * 0.03;
    ctx.fillStyle = "#ffe6ff";
    const bandY = py - pr * 0.3 + Math.sin(tm * 0.11) * pr * 0.16;
    ctx.fillRect(px - pr, bandY, pr * 2, pr * 0.2);
    ctx.fillRect(px - pr, bandY + pr * 0.62, pr * 2, pr * 0.1);
    ctx.restore();
    ctx.restore();
  }

  /* ── 9 · the drifting asteroid ───────────────────────────────────────────── */
  // It has momentum and a tumble, and it takes well over a minute to cross, so
  // it is nearly always somewhere in the middle distance without ever hurrying.
  const rk2 = st.rock;
  if (!rk2.live && t - rk2.last > rk2.gap) {
    rollPass(rk2, t, 6113, {
      gap: [9, 26], spd: [0.011, 0.019], y0: [0.44, 0.8],
      fall: 0.2, sz: [0.7, 1.5], rtl: 0.5, slow: SLOW,
    });
  }
  if (rk2.live) {
    rk2.u += dt * rk2.spd * MO;
    if (rk2.u > 1) { rk2.live = 0; rk2.last = t; }
    const aD = Math.max(5, Math.round(clamp(S * 0.03 * rk2.sz, 5, 46)));
    const rock = cachedSprite("sp.rock", 48, 48, "v3", (c, w) => paintAsteroid(c, w));
    const ax2 = passX(rk2) * W;
    const ay2 = sky * (lerp(rk2.y0, rk2.y1, rk2.u) + Math.sin(tm * 0.07 + rk2.pass) * 0.008);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.translate(ax2, ay2);
    ctx.rotate(rk2.spin * tm + rk2.pass);
    ctx.drawImage(rock, -aD / 2, -aD / 2, aD, aD);
    ctx.restore();
  }

  /* ── 10 · lunar surface ──────────────────────────────────────────────────── */
  const ground = cachedSprite("sp.ground", Math.ceil(W), gH, `v3:${gMarg}`,
    (c, w, h) => paintMoonGround(c, w, h, gMarg));
  ctx.drawImage(ground, 0, gTop);

  /* ── 11 · the sun's angle on the regolith ────────────────────────────────── */
  // By day the same key light that rims the planet grazes the moon surface from
  // the upper left. Clipped to below the horizon so it cannot bleed into the sky.
  if (L > 0.03) {
    const lit = floorY - gMarg * 0.34;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gl = ctx.createLinearGradient(0, lit, W * 0.78, H);
    const warmG = Math.round(lerp(226, 196, Wm));
    gl.addColorStop(0, `rgba(255,${warmG},${Math.round(lerp(198, 150, Wm))},${0.26 * L})`);
    gl.addColorStop(0.5, `rgba(255,${warmG},202,${0.12 * L})`);
    gl.addColorStop(1, "rgba(228,214,255,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(0, lit, W, H - lit);
    ctx.restore();
  }

  /* ── 12 · the evening ────────────────────────────────────────────────────── */
  // Everything above is matter and takes the night wash. Everything below is
  // light, and is drawn additively on top of it so the dark cannot put it out.
  applyNight(ctx, W, H);
  // orbit has weather nowhere — the cast shifts, the sky does not snow
  applySeasonWash(ctx, W, H);

  /* ══ LIGHT ════════════════════════════════════════════════════════════════ */

  /* ── 13 · live stars: twinkle, colour temperature, diffraction spikes ────── */
  GLYPHS[0] = starGlyph(0, starRgb(0.08), false);
  GLYPHS[1] = starGlyph(1, starRgb(0.5), false);
  GLYPHS[2] = starGlyph(2, starRgb(0.9), false);
  GLYPHS[3] = starGlyph(3, starRgb(0.08), true);
  GLYPHS[4] = starGlyph(4, starRgb(0.5), true);
  GLYPHS[5] = starGlyph(5, starRgb(0.92), true);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < st.stars.length; i++) {
    const s = st.stars[i];
    let x = s.x - tm * s.drift;
    x = x % W; if (x < 0) x += W;
    // stars twinkle because the air in front of them moves, so the near, fast
    // layers scintillate hardest and the far, slow ones barely flicker
    const tw = 0.52 + 0.48 * Math.abs(Math.sin(tm * s.sp + s.ph));
    const edge = clamp(Math.min(x, W - x) / 30, 0, 1);
    const a = s.a * tw * edge * starDim;
    if (a < 0.02) continue;
    const sz = s.s * (0.82 + tw * 0.32);
    ctx.globalAlpha = a;
    ctx.drawImage(GLYPHS[s.g], x - sz, s.y - sz, sz * 2, sz * 2);
  }
  ctx.restore();

  /* ── 14 · emission core: the bright heart of the violet cloud ────────────── */
  const ecx = W * 0.25, ecy = sky * 0.32;
  const pulse = (0.5 + Math.sin(tm * 0.42) * 0.12 + Math.sin(tm * 0.17 + 1.3) * 0.08) * glowDim;
  bloom(ctx, ecx, ecy, S * 0.2, "rgba(255,170,240,0.34)", pulse);
  if (rich) bloom(ctx, ecx - S * 0.02, ecy + S * 0.01, S * 0.08, "rgba(255,244,255,0.5)", pulse * 0.9);

  /* ── 15 · sun-side rim light ─────────────────────────────────────────────── */
  // The one thing that says "daytime" on a body that has no sky of its own.
  if (wHero > 0 && L > 0.04) {
    const la = Math.atan2(SUN_Y, SUN_X);
    const rimG = Math.round(lerp(238, 208, Wm));
    const rimB = Math.round(lerp(212, 154, Wm));
    // clipped to the disc, so the only hard edge it can make is the limb
    // itself — a stroked arc was floating a white hoop off the planet's edge
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    // the whole sunward hemisphere warms, and the limb itself takes the graze
    const lit = ctx.createLinearGradient(
      px + Math.cos(la) * pr, py + Math.sin(la) * pr,
      px - Math.cos(la) * pr * 0.9, py - Math.sin(la) * pr * 0.9);
    lit.addColorStop(0, `rgba(255,${rimG},${rimB},${0.26 * L})`);
    lit.addColorStop(0.55, `rgba(255,${rimG},${rimB},${0.07 * L})`);
    lit.addColorStop(1, `rgba(255,${rimG},${rimB},0)`);
    ctx.fillStyle = lit;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    glow(ctx, px + Math.cos(la) * pr * 0.88, py + Math.sin(la) * pr * 0.88, pr * 0.8,
      `rgba(255,${rimG},${rimB},${0.5 * L})`, `rgba(255,${rimG},${rimB},0)`);
    ctx.restore();
    bloom(ctx, px + Math.cos(la) * pr * 0.66, py + Math.sin(la) * pr * 0.66, pr * 1.35,
      `rgba(255,${rimG},${rimB},0.26)`, 0.5 * L);
    if (mlFront) {
      bloom(ctx, mlx + Math.cos(la) * mlS * 0.3, mly + Math.sin(la) * mlS * 0.3,
        mlS * 1.2, `rgba(255,${rimG},196,0.55)`, 0.55 * L);
    }
    if (wFar > 0) bloom(ctx, fx0 + Math.cos(la) * fr * 0.7, fy0 + Math.sin(la) * fr * 0.7,
      fr * 1.5, `rgba(255,${rimG},176,0.4)`, 0.5 * L);
  }
  // and at night the moonlet catches starlight instead
  if (wHero > 0 && mlFront && rich && L < 0.7) {
    bloom(ctx, mlx, mly, mlS * 1.5, "rgba(220,214,255,0.26)", 0.5 * (1 - L));
  }

  /* ── 16a · wormhole portal (periodic) ────────────────────────────────────── */
  const po = st.portal;
  if (t > po.next) {
    po.pass++;
    const r = mulberry32(1201 + po.pass * 601);
    po.next = t + (27 + r() * 27) * SLOW;
    po.open = t;
    po.x = 0.16 + r() * 0.7;
    po.y = 0.36 + r() * 0.38;
  }
  const pAge = t - po.open;
  const life = 11;
  po.env = po.open > 0 && pAge < life
    ? easeOut(clamp(pAge / 1.6, 0, 1)) * easeOut(clamp((life - pAge) / 1.8, 0, 1))
    : 0;
  if (po.env > 0.01) {
    const wx = W * po.x, wy = clamp(sky * po.y, S * 0.2, sky - S * 0.1);
    const wr = S * 0.062 * po.env;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.globalCompositeOperation = "lighter";
    const rings2 = detail(9);
    for (let i = 0; i < rings2; i++) {
      const k = i / rings2;
      const rr = wr * (0.28 + k * 0.85);
      const col = k < 0.4 ? "0,224,214" : k < 0.75 ? "150,110,255" : "251,102,229";
      ctx.strokeStyle = rgba(col, 0.24 * po.env * (1 - k * 0.45));
      ctx.lineWidth = Math.max(1, wr * 0.09 * (1 - k * 0.4));
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * (0.72 + k * 0.2), tm * (0.4 + k * 0.7) * (i % 2 ? -1 : 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    const motes = detail(11);
    for (let i = 0; i < motes; i++) {
      const u = ((tm * 0.5 + i / motes) % 1);
      const rr = wr * (1.5 - u * 1.3);
      const a = i * 2.1 + tm * (1.4 + (i % 3) * 0.3);
      ctx.fillStyle = `rgba(220,250,255,${(1 - u) * 0.5 * po.env})`;
      ctx.fillRect(Math.cos(a) * rr - 1, Math.sin(a) * rr * 0.8 - 1, 2.2, 2.2);
    }
    ctx.restore();
    glow(ctx, wx, wy, wr * 0.6, `rgba(24,6,48,${0.55 * po.env})`, "rgba(24,6,48,0)");
    bloom(ctx, wx, wy, wr * 1.7, "rgba(160,120,255,0.34)", po.env * (0.7 + Math.sin(tm * 3.1) * 0.16));
  }

  /* ── 16b · comet: coma + straight ion tail + curved dust tail ────────────── */
  // Every crossing re-rolls its gap, direction, entry height, fall, speed and
  // size from the pass number, so it never runs the same track twice.
  const cm = st.comet;
  if (!cm.live && t - cm.last > cm.gap) {
    rollPass(cm, t, 4477, {
      gap: [17, 39], spd: [0.06, 0.115], y0: [0.05, 0.34],
      fall: 0.28, sz: [0.015, 0.027], rtl: 0.76, slow: SLOW,
    });
  }
  if (cm.live) {
    cm.u += dt * cm.spd * MO;
    if (cm.u > 1) { cm.live = 0; cm.last = t; }
    const cx = passX(cm) * W;
    const cy = sky * lerp(cm.y0, cm.y1, easeOut(cm.u));
    const cs = S * cm.sz;
    // anti-sunward direction (both tails point away from the sun)
    const ax = -SUN_X, ay = -SUN_Y;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // dust tail: broad, warm, curved back along the trajectory
    const dl = S * 0.5;
    const dgx = cx + ax * dl * 0.62 + dl * 0.6 * cm.dir * -1, dgy = cy + ay * dl * 0.62;
    const dg = ctx.createLinearGradient(cx, cy, dgx, dgy);
    dg.addColorStop(0, "rgba(255,236,196,0.4)");
    dg.addColorStop(0.45, "rgba(255,206,170,0.16)");
    dg.addColorStop(1, "rgba(255,190,150,0)");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cs * 0.6);
    ctx.quadraticCurveTo(cx - dl * 0.5 * cm.dir, cy + ay * dl * 0.2 - cs * 3, dgx, dgy - cs * 5);
    ctx.lineTo(dgx, dgy + cs * 3);
    ctx.quadraticCurveTo(cx - dl * 0.4 * cm.dir, cy + ay * dl * 0.24 + cs * 2.4, cx, cy + cs * 0.6);
    ctx.closePath();
    ctx.fill();
    // ion tail: narrow, straight, electric blue
    const il = S * 0.62;
    for (let k = 0; k < 3; k++) {
      const spr = (k - 1) * 0.1;
      const ex = cx + (ax * Math.cos(spr) - ay * Math.sin(spr)) * il;
      const ey = cy + (ax * Math.sin(spr) + ay * Math.cos(spr)) * il;
      const ig = ctx.createLinearGradient(cx, cy, ex, ey);
      ig.addColorStop(0, `rgba(180,244,255,${0.5 - k * 0.06})`);
      ig.addColorStop(0.5, "rgba(140,200,255,0.16)");
      ig.addColorStop(1, "rgba(120,180,255,0)");
      ctx.strokeStyle = ig;
      ctx.lineWidth = Math.max(1, cs * (0.5 - k * 0.12));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
    bloom(ctx, cx, cy, cs * 4.6, "rgba(190,244,255,0.55)", 0.8 + Math.sin(tm * 7) * 0.12);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, cs * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── 16c · orbital station slow pass ─────────────────────────────────────── */
  const sn = st.station;
  if (!sn.live && t - sn.last > sn.gap) {
    rollPass(sn, t, 8821, {
      gap: [31, 63], spd: [0.026, 0.048], y0: [0.18, 0.44],
      fall: 0.08, sz: [0.85, 1.18], rtl: 0.34, slow: SLOW,
    });
  }
  if (sn.live) {
    sn.u += dt * sn.spd * MO;
    if (sn.u > 1) { sn.live = 0; sn.last = t; }
    const stW = Math.round(clamp(S * 0.17 * sn.sz, 40, 190));
    const stH = Math.round(stW * 0.56);
    const ship = cachedSprite("sp.station", stW, stH, "v3", paintStation);
    const sx = passX(sn) * W;
    const sy = sky * (lerp(sn.y0, sn.y1, sn.u) + Math.sin(tm * 0.24 + sn.pass) * 0.016);
    const roll = Math.sin(tm * 0.16 + sn.pass) * 0.22 + 0.1 * sn.dir;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(roll);
    ctx.drawImage(ship, -stW / 2, -stH / 2);
    // solar glint
    const gl = 0.5 + 0.5 * Math.sin(tm * 0.5 + sn.pass);
    if (gl > 0.86) bloom(ctx, -stW * 0.28, -stH * 0.16, stW * 0.28, "rgba(255,255,255,0.7)", (gl - 0.86) * 6);
    ctx.restore();
    // beacons (drawn upright so they read at any roll)
    const blinkR = Math.sin(tm * 4.2) > 0.55, blinkG = Math.sin(tm * 4.2 + 2.1) > 0.55;
    if (blinkR) bloom(ctx, sx - stW * 0.44, sy - stH * 0.1, stW * 0.1, "rgba(255,90,110,0.9)", 0.9);
    if (blinkG) bloom(ctx, sx + stW * 0.44, sy + stH * 0.1, stW * 0.1, "rgba(120,255,160,0.9)", 0.9);
    if (Math.sin(tm * 1.7) > 0.94) bloom(ctx, sx, sy - stH * 0.3, stW * 0.14, "rgba(255,255,255,0.9)", 1);
  }

  /* ── 16d · meteor shower bursts ──────────────────────────────────────────── */
  const bu = st.burst;
  if (t > bu.next) {
    bu.idx++;
    const r = mulberry32(9000 + bu.idx * 7);
    bu.next = t + (11 + r() * 13) * SLOW;
    bu.n = detail(6);
    bu.at = t;
    bu.dir = r() < 0.5 ? 1 : -1;
    bu.rx = (bu.dir > 0 ? 0.05 + r() * 0.3 : 0.65 + r() * 0.3) * W;
    bu.ry = -H * (0.02 + r() * 0.1);
    bu.ang = 0.42 + r() * 0.42;
  }
  if (bu.n > 0 && t >= bu.at && fx.shots.length < 12) {
    bu.n--;
    bu.at = t + 0.12 + (bu.n % 3) * 0.13;
    const r = mulberry32(bu.idx * 977 + bu.n * 37);
    const spread = (r() - 0.5) * 0.42;
    const spd = (520 + r() * 460) * MO;
    const a = bu.ang + spread;
    fx.shots.push({
      x: bu.rx + (r() - 0.5) * W * 0.42,
      y: bu.ry + r() * H * 0.12,
      vx: Math.cos(a) * spd * bu.dir,
      vy: Math.sin(a) * spd,
      life: 1,
    });
  }
  for (let i = fx.shots.length - 1; i >= 0; i--) {
    const s = fx.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.62 * MO;
    if (s.life <= 0 || s.x < -140 || s.x > W + 140 || s.y > sky) { fx.shots.splice(i, 1); continue; }
    const len = S * 0.34 * clamp(s.life, 0, 1);
    const ang = Math.atan2(s.vy, s.vx);
    const ex = s.x - Math.cos(ang) * len, ey = s.y - Math.sin(ang) * len;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const wide = ctx.createLinearGradient(s.x, s.y, ex, ey);
    wide.addColorStop(0, `rgba(190,220,255,${0.3 * s.life})`);
    wide.addColorStop(1, "rgba(150,190,255,0)");
    ctx.strokeStyle = wide;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const core = ctx.createLinearGradient(s.x, s.y, ex, ey);
    core.addColorStop(0, `rgba(255,255,255,${0.95 * s.life})`);
    core.addColorStop(0.3, `rgba(255,236,190,${0.45 * s.life})`);
    core.addColorStop(1, "rgba(255,220,170,0)");
    ctx.strokeStyle = core;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
    if (rich) bloom(ctx, s.x, s.y, S * 0.026, "rgba(255,246,220,0.7)", s.life);
  }

  /* ── 16e · rocket flyby with exhaust trail ───────────────────────────────── */
  const rk = st.rocket;
  const rkW = Math.round(clamp(S * 0.08, 18, 92));
  if (rk.w !== rkW) { rk.w = rkW; rk.puffs.length = 0; }
  if (rk.puffs.length === 0) for (let i = 0; i < 26; i++) rk.puffs.push({ x: 0, y: 0, r: 0, life: 0 });
  if (t > rk.next) {
    rk.pass++;
    const r = mulberry32(5533 + rk.pass * 313);
    rk.next = t + (23 + r() * 26) * SLOW;
    rk.x = -0.14;
    rk.y = 0.6 + r() * 0.26;
    rk.spd = 0.13 + r() * 0.1;
  }
  const rkH = Math.max(4, Math.round(rkW * 0.52));
  if (rk.x < 1.16) {
    rk.x += dt * rk.spd * MO;
    const rx = rk.x * W;
    const ry = sky * (rk.y - Math.sin(clamp(rk.x, 0, 1) * Math.PI) * 0.1);
    // emit into a preallocated ring buffer (no per-frame allocation)
    const pf = rk.puffs[Math.floor(t * 22) % rk.puffs.length];
    if (pf.life <= 0) {
      pf.x = rx - rkW * 0.5;
      pf.y = ry + Math.sin(tm * 9) * rkW * 0.05;
      pf.r = rkW * (0.1 + Math.abs(noise1(tm * 4, 3)) * 0.12);
      pf.life = 1;
    }
    const rocket = cachedSprite("sp.rocket", rkW, rkH, "v3", paintRocket);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < rk.puffs.length; i++) {
      const p = rk.puffs[i];
      if (p.life <= 0) continue;
      const a = p.life * 0.34;
      const rr = p.r * (1 + (1 - p.life) * 2.6);
      const cg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      cg.addColorStop(0, `rgba(255,214,150,${a})`);
      cg.addColorStop(0.5, `rgba(255,140,220,${a * 0.4})`);
      cg.addColorStop(1, "rgba(160,110,255,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    }
    ctx.restore();
    // flame
    const flick = 0.72 + Math.abs(noise1(tm * 26, 9)) * 0.5;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(Math.sin(tm * 2) * 0.06 - 0.05);
    ctx.globalCompositeOperation = "lighter";
    const fg = ctx.createLinearGradient(-rkW * 0.3, 0, -rkW * (0.4 + 0.5 * flick), 0);
    fg.addColorStop(0, "rgba(255,255,232,0.95)");
    fg.addColorStop(0.4, "rgba(255,190,120,0.6)");
    fg.addColorStop(1, "rgba(255,110,200,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-rkW * 0.28, -rkH * 0.17);
    ctx.lineTo(-rkW * (0.45 + 0.55 * flick), 0);
    ctx.lineTo(-rkW * 0.28, rkH * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(rocket, -rkW / 2, -rkH / 2);
    ctx.restore();
  }
  for (let i = 0; i < rk.puffs.length; i++) {
    const p = rk.puffs[i];
    if (p.life > 0) p.life -= dt * 0.55 * MO;
  }

  /* ── 17 · aurora curtains over the horizon ───────────────────────────────── */
  // Drawn after the night wash — at bedtime this is meant to be the brightest
  // thing in the world — and clipped to the sky so it cannot glow over rock.
  const auroraK = lerp(1.15, 0.34, L);
  const bands = q === 0 ? 2 : 3;
  const step = Math.max(16, W / 46);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let b = 0; b < bands; b++) {
    const cols = AURORA_COLS;
    const baseY = floorY - gMarg * 0.34 - b * S * 0.028;
    const hgt = S * (0.15 + b * 0.055);
    const amp = S * (0.028 + b * 0.012);
    const drift = tm * (0.16 + b * 0.05);
    const topAt = (x: number) =>
      baseY - hgt + fbm1(x * 0.0042 + drift + b * 17, 3, 33 + b) * amp
      + Math.sin(x * 0.006 + tm * 0.5 + b) * amp * 0.4;
    const wob = (0.72 + 0.28 * Math.sin(tm * 0.37 + b * 1.7)) * auroraK;

    for (let pass = 0; pass < (rich ? 2 : 1); pass++) {
      const xo = pass === 0 ? 0 : S * 0.012;
      const col = pass === 0 ? cols[b] : cols[(b + 2) % 3];
      const ga = ctx.createLinearGradient(0, baseY - hgt, 0, baseY);
      ga.addColorStop(0, rgba(col, 0));
      ga.addColorStop(0.5, rgba(col, 0.05 * wob));
      ga.addColorStop(0.88, rgba(col, (0.17 - b * 0.03) * wob));
      ga.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = ga;
      ctx.beginPath();
      ctx.moveTo(-step, baseY);
      for (let x = -step; x <= W + step; x += step) ctx.lineTo(x + xo, topAt(x));
      ctx.lineTo(W + step, baseY);
      ctx.closePath();
      ctx.fill();
    }

  }

  // the rays themselves: one soft cached plate, swaying rather than scrolling,
  // its foot parked above the highest point the horizon ever reaches
  if (q > 0) {
    const rayH = Math.max(8, Math.round(S * 0.3));
    const rayW = Math.ceil(W) + 56;
    const rayPlate = cachedSprite("sp.rays", rayW, rayH, "v3", paintAuroraRays);
    ctx.globalAlpha = clamp(auroraK * (0.62 + 0.38 * Math.sin(tm * 0.29)), 0, 1);
    ctx.drawImage(rayPlate, -28 + Math.sin(tm * 0.07) * 22, floorY - gMarg * 0.34 - rayH);
  }
  ctx.restore();

  // live low dust haze drifting along the horizon
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.1 + Math.sin(tm * 0.5) * 0.035) * lerp(1, 1.5, L);
  const hz = vGrad(ctx, floorY - S * 0.06, floorY + S * 0.02, [
    [0, "rgba(196,178,255,0)"],
    [0.7, L > 0.4 ? "rgba(255,232,214,0.5)" : "rgba(214,198,255,0.5)"],
    [1, "rgba(230,216,255,0)"],
  ]);
  ctx.fillStyle = hz;
  ctx.fillRect(0, floorY - S * 0.06, W, S * 0.08);
  ctx.restore();

  /* ── 18 · vignette ───────────────────────────────────────────────────────── */
  vignette(ctx, W, H, lerp(0.3, 0.18, L));

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
