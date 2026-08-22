// ─── SPACE world · "Giggle Galaxy" ──────────────────────────────────────────
// A layered, cinematic candy-sci-fi backdrop.
//
// Render order (back → front):
//   1  sky plate .......... gradient + colour washes + Milky-Way dust band +
//                           the deepest micro-stars                    [cached]
//   2  nebula plates ...... fbm-carved volumetric cloud masses, additive,
//                           slowly drifting / breathing / counter-rotating [cached]
//   3  emission core ...... additive bloom heart inside the violet cloud
//   4  spiral galaxy ...... slow-rotating island universe             [cached]
//   5  starfield .......... 4 parallax depths: two baked plates (one of which
//                           wraps + drifts) and two live twinkling layers with
//                           colour temperature and diffraction spikes [cached glyphs]
//   6  far planet ......... banded ice world, deep parallax           [cached]
//   7  hero planet ........ back rings → moonlet → globe (terminator, bands,
//                           ring shadow, rim light) → front rings → moonlet [cached]
//   8  wormhole ........... periodic portal shimmer
//   9  events ............. comet (ion + dust tails), station pass, meteor
//                           shower bursts, rocket flyby + exhaust
//  10  aurora ............. multi-band additive curtains over the horizon
//  11  moon surface ....... crater field, boulders, rover tracks       [cached]
//  12  grade + vignette ... one coherent image
//
// Everything static is painted once into an offscreen canvas and blitted; the
// per-frame budget is a handful of blits, ~45 sprite stamps and ~10 paths.

import {
  bloom, cachedLayer, cachedSprite, clamp, detail, easeOut, fbm1, glow, grade,
  lerp, mulberry32, noise1, quality, richFx, slot, vGrad, vignette,
  type ThemeFrame, type FxState,
} from "./shared";

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
  for (let i = 0; i < 150; i++) {
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

  // dark dust lanes threading the band (absorption, so straight source-over)
  c.globalCompositeOperation = "source-over";
  for (let lane = 0; lane < 3; lane++) {
    c.beginPath();
    const off = (lane - 1) * bw * 0.34;
    const amp = bw * 0.16;
    const th = bw * (0.1 + lane * 0.05);
    for (let x = -L / 2; x <= L / 2; x += L / 40) {
      const y = off + fbm1(x * 0.004 + lane * 13, 3, 21 + lane) * amp;
      if (x <= -L / 2) c.moveTo(x, y); else c.lineTo(x, y);
    }
    for (let x = L / 2; x >= -L / 2; x -= L / 40) {
      const y = off + fbm1(x * 0.004 + lane * 13, 3, 21 + lane) * amp + th;
      c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = `rgba(6,4,22,${0.3 - lane * 0.06})`;
    c.fill();
  }

  // pinprick stars crowding toward the galactic plane
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 420; i++) {
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
  g.addColorStop(0, "#04031a");
  g.addColorStop(0.34, "#0c0932");
  g.addColorStop(0.68, "#1a1049");
  g.addColorStop(1, "#33165c");
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

  // top-light falloff, baked here rather than paid for every frame in grade()
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

const PLATES: Plate[] = [
  { key: "sp.neb0", seed: 1301, rgb: "126,64,214", hot: "214,168,255", x: 0.26, y: 0.3, s: 1.35, a: 0.62, sp: 0.006, dx: 0.031, dy: 0.024, rot: 0.2 },
  { key: "sp.neb1", seed: 2207, rgb: "0,182,190", hot: "168,255,246", x: 0.79, y: 0.24, s: 1.05, a: 0.5, sp: -0.009, dx: 0.043, dy: 0.033, rot: 1.9 },
  { key: "sp.neb2", seed: 3313, rgb: "224,68,178", hot: "255,190,232", x: 0.44, y: 0.72, s: 1.2, a: 0.4, sp: 0.007, dx: 0.026, dy: 0.019, rot: 3.4 },
  { key: "sp.neb3", seed: 4409, rgb: "62,96,224", hot: "180,214,255", x: 0.92, y: 0.66, s: 0.9, a: 0.36, sp: -0.005, dx: 0.037, dy: 0.028, rot: 5.1 },
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
interface SpaceState {
  key: string;
  born: number;
  frames: number;
  stars: LiveStar[];
  burst: { n: number; next: number; at: number; rx: number; ry: number; ang: number; dir: number; idx: number };
  portal: { next: number; open: number; env: number };
  rocket: { next: number; x: number; puffs: Puff[]; w: number };
}

const newSpaceState = (): SpaceState => ({
  key: "",
  born: -1,
  frames: 0,
  stars: [],
  burst: { n: 0, next: 0, at: 0, rx: 0, ry: 0, ang: 0.8, dir: 1, idx: 0 },
  portal: { next: 0, open: 0, env: 0 },
  rocket: { next: 0, x: 2, puffs: [], w: 0 },
});

/**
 * Cache builds are spread over the first frames of a world so entering never
 * drops a clump of frames: returns 0 (skip entirely) until `at`, then fades in.
 */
const warmup = (frames: number, at: number) => clamp((frames - at) / 10, 0, 1);

/** Reused every frame so the hot path allocates nothing. */
const GLYPHS: HTMLCanvasElement[] = [];
const AURORA_COLS = ["64,232,196", "150,146,255", "255,150,232"];

function buildStars(W: number, top: number): LiveStar[] {
  const out: LiveStar[] = [];
  for (let depth = 0; depth < 2; depth++) {
    const n = detail(depth === 0 ? 30 : 13);
    const rnd = mulberry32(depth === 0 ? 515151 : 818181);
    for (let i = 0; i < n; i++) {
      const k = rnd();
      const bright = depth === 1 || rnd() < 0.22;
      const gi = k < 0.34 ? 0 : k < 0.7 ? 1 : 2;
      out.push({
        x: rnd() * W,
        y: rnd() * top,
        s: (depth === 0 ? 8 : 13) * (0.7 + rnd() * 0.9),
        g: gi + (bright ? 3 : 0),
        a: (depth === 0 ? 0.5 : 0.8) * (0.6 + rnd() * 0.5),
        sp: (depth === 0 ? 0.9 : 1.7) * (0.5 + rnd()),
        ph: rnd() * Math.PI * 2,
        drift: depth === 0 ? 6 : 12,
      });
    }
  }
  return out;
}

/* ══ the world ══════════════════════════════════════════════════════════════ */

export function drawSpace({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  if (!(W > 1) || !(H > 1) || !Number.isFinite(t) || !Number.isFinite(floorY)) return;
  const S = Math.min(W, H);
  const D = Math.max(W, H);
  const sky = clamp(floorY, S * 0.2, H);       // usable sky height
  const q = quality();
  const rich = richFx();

  const st = slot<SpaceState>(fx, "space.v2", newSpaceState);
  if (st.born < 0) {
    // stagger every event so the first minute never feels empty or busy
    st.born = t;
    fx.fly2.last = t - 24 + 6;   // comet at +6s
    fx.fly2.x = -1;              // parked: the draw test is x > -0.4
    fx.fly3.last = t - 40 + 11;  // station at +11s
    fx.fly3.x = 2;
    st.burst.next = t + 3;
    st.portal.next = t + 19;
    st.rocket.next = t + 14;
  }
  const sizeKey = `${Math.round(W)}x${Math.round(H)}x${Math.round(sky)}:${q}`;
  if (st.key !== sizeKey) {
    st.key = sizeKey;
    st.stars = buildStars(W, sky * 0.97);
  }
  if (st.frames < 1000) st.frames++;

  /* ── 1 · sky plate ───────────────────────────────────────────────────────── */
  cachedLayer(ctx, "sp.sky", Math.ceil(W), Math.ceil(H), "v2", paintSky);

  /* ── 2 · volumetric nebula plates ────────────────────────────────────────── */
  const P = Math.round(clamp(S * 0.95, 128, 560));
  const plateN = q === 2 ? 4 : q === 1 ? 3 : 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < plateN; i++) {
    // one new plate baked every 4 frames so world entry never stalls
    const warm = warmup(st.frames, 8 + i * 4);
    if (warm <= 0) break;
    const p = PLATES[i];
    const plate = cachedSprite(p.key, P, P, "v2", (c, pw) => paintNebula(c, pw, p.seed, p.rgb, p.hot));
    const breathe = 1 + Math.sin(t * p.dx * 0.9 + p.rot) * 0.045;
    const scl = (D * 0.56 * p.s * breathe) / P;
    const x = W * p.x + Math.sin(t * p.dx + p.rot) * W * 0.022;
    const y = sky * p.y + Math.cos(t * p.dy + p.rot) * H * 0.016;
    ctx.globalAlpha = warm * p.a * (0.86 + Math.sin(t * p.dy * 1.7 + p.rot) * 0.14);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rot + t * p.sp);
    ctx.scale(scl, scl);
    ctx.drawImage(plate, -P / 2, -P / 2);
    ctx.restore();
  }
  ctx.restore();

  /* ── 3 · emission core: the bright heart of the violet cloud ─────────────── */
  const ecx = W * 0.27, ecy = sky * 0.34;
  const pulse = 0.5 + Math.sin(t * 0.42) * 0.12 + Math.sin(t * 0.17 + 1.3) * 0.08;
  bloom(ctx, ecx, ecy, S * 0.2, "rgba(255,170,240,0.34)", pulse);
  if (rich) bloom(ctx, ecx - S * 0.02, ecy + S * 0.01, S * 0.08, "rgba(255,244,255,0.5)", pulse * 0.9);

  /* ── 4 · spiral galaxy ───────────────────────────────────────────────────── */
  const wGal = warmup(st.frames, 4);
  if (wGal > 0) {
    const gD = Math.round(clamp(S * 0.34, 64, 340));
    const gal = cachedSprite("sp.galaxy", gD, gD, "v2", (c, w) => paintGalaxy(c, w));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = wGal * (0.62 + Math.sin(t * 0.21) * 0.06);
    ctx.translate(W * 0.58, sky * 0.125);
    ctx.rotate(0.5 + t * 0.014);
    ctx.drawImage(gal, -gD / 2, -gD / 2);
    ctx.restore();
  }

  /* ── 5 · starfield ───────────────────────────────────────────────────────── */
  // depth 1: a baked plate that wraps horizontally as it drifts
  const wSt = warmup(st.frames, 2);
  if (wSt > 0) {
    const plateH = Math.max(2, Math.round(sky));
    const stars1 = cachedSprite("sp.stars1", Math.ceil(W), plateH, "v2", paintStarPlate);
    const sw1 = stars1.width;
    const dx1 = -((t * 1.6) % sw1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = wSt;
    ctx.drawImage(stars1, dx1, 0);
    ctx.drawImage(stars1, dx1 + sw1, 0);
    ctx.restore();
  }

  // depths 2 & 3: live twinkle, colour temperature, diffraction spikes
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
    let x = s.x - t * s.drift;
    x = x % W; if (x < 0) x += W;
    const tw = 0.52 + 0.48 * Math.abs(Math.sin(t * s.sp + s.ph));
    const edge = clamp(Math.min(x, W - x) / 30, 0, 1);
    const a = s.a * tw * edge;
    if (a < 0.02) continue;
    const sz = s.s * (0.82 + tw * 0.32);
    ctx.globalAlpha = a;
    ctx.drawImage(GLYPHS[s.g], x - sz, s.y - sz, sz * 2, sz * 2);
  }
  ctx.restore();

  /* ── 6 · distant banded world (deep parallax) ────────────────────────────── */
  const wFar = warmup(st.frames, 6);
  if (wFar > 0) {
    const fr = Math.round(clamp(S * 0.045, 8, 90));
    const fpad = Math.max(2, Math.round(fr * 0.34));
    const fD = fr * 2 + fpad * 2;
    const far = cachedSprite("sp.far", fD, fD, "v2", (c, w) => paintFarPlanet(c, w, fpad));
    const fx0 = W * 0.115 + Math.sin(t * 0.017) * W * 0.006;
    const fy0 = clamp(sky * 0.36, fr + 12, H) + Math.cos(t * 0.021) * S * 0.006;
    ctx.save();
    ctx.globalAlpha = wFar;
    ctx.drawImage(far, fx0 - fD / 2, fy0 - fD / 2);
    ctx.restore();
  }

  /* ── 7 · hero ringed planet ──────────────────────────────────────────────── */
  const wHero = warmup(st.frames, 3);
  if (wHero > 0) {
    ctx.save();
    ctx.globalAlpha = wHero;
    const pr = Math.round(clamp(S * 0.088, 12, 190));
    const ppad = Math.max(3, Math.round(pr * 0.3));
    const pD = pr * 2 + ppad * 2;
    const px = W * 0.81;
    const py = clamp(H * 0.19, pr * 1.15 + H * 0.07, sky * 0.6);
    const ra = Math.round(pr * 2.05);
    const rin = Math.round(pr * 1.2);
    const RW = ra * 2 + 8;
    let RH = Math.round(ra * RING_FLAT) * 2 + 8;
    if (RH % 2) RH += 1;
    const rings = cachedSprite("sp.rings", RW, RH, `v2:${ra}:${rin}`, (c, w, h) => paintRings(c, w, h, ra, rin));
    const globe = cachedSprite("sp.globe", pD, pD, "v2", (c, w) => paintGasGiant(c, w, ppad));
    const mlD = Math.max(4, Math.round(pr * 0.3));
    const moonlet = cachedSprite("sp.moonlet", mlD, mlD, "v2", (c, w) => paintMoonlet(c, w));

    const mph = t * 0.13 + 1.15;
    const orb = pr * 2.7;
    const cosT = Math.cos(RING_TILT), sinT = Math.sin(RING_TILT);
    const ox = Math.cos(mph) * orb, oy = Math.sin(mph) * orb * 0.34;
    const mlx = px + ox * cosT - oy * sinT;
    const mly = py + ox * sinT + oy * cosT;
    const mlS = mlD * (1 + Math.sin(mph) * 0.12);
    const mlFront = Math.sin(mph) > 0;

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
    if (mlFront) {
      ctx.drawImage(moonlet, mlx - mlS / 2, mly - mlS / 2, mlS, mlS);
      if (rich) bloom(ctx, mlx, mly, mlS * 1.5, "rgba(220,214,255,0.26)", 0.5);
  }
  // slow cloud band creeping across the lit face
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.1 + Math.sin(t * 0.23) * 0.03;
  ctx.fillStyle = "#ffe6ff";
  const bandY = py - pr * 0.3 + Math.sin(t * 0.11) * pr * 0.16;
  ctx.fillRect(px - pr, bandY, pr * 2, pr * 0.2);
  ctx.fillRect(px - pr, bandY + pr * 0.62, pr * 2, pr * 0.1);
  ctx.restore();
  ctx.restore();
  }

  /* ── 8 · wormhole portal (periodic) ──────────────────────────────────────── */
  const po = st.portal;
  if (t > po.next) { po.next = t + 38; po.open = t; }
  const pAge = t - po.open;
  const life = 11;
  po.env = po.open > 0 && pAge < life
    ? easeOut(clamp(pAge / 1.6, 0, 1)) * easeOut(clamp((life - pAge) / 1.8, 0, 1))
    : 0;
  if (po.env > 0.01) {
    const wx = W * 0.87, wy = clamp(sky * 0.62, S * 0.2, sky - S * 0.1);
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
      ctx.ellipse(0, 0, rr, rr * (0.72 + k * 0.2), t * (0.4 + k * 0.7) * (i % 2 ? -1 : 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    const motes = detail(11);
    for (let i = 0; i < motes; i++) {
      const u = ((t * 0.5 + i / motes) % 1);
      const rr = wr * (1.5 - u * 1.3);
      const a = i * 2.1 + t * (1.4 + (i % 3) * 0.3);
      ctx.fillStyle = `rgba(220,250,255,${(1 - u) * 0.5 * po.env})`;
      ctx.fillRect(Math.cos(a) * rr - 1, Math.sin(a) * rr * 0.8 - 1, 2.2, 2.2);
    }
    ctx.restore();
    glow(ctx, wx, wy, wr * 0.6, `rgba(24,6,48,${0.55 * po.env})`, "rgba(24,6,48,0)");
    bloom(ctx, wx, wy, wr * 1.7, "rgba(160,120,255,0.34)", po.env * (0.7 + Math.sin(t * 3.1) * 0.16));
  }

  /* ── 9a · comet: coma + straight ion tail + curved dust tail ─────────────── */
  if (t - fx.fly2.last > 24) { fx.fly2.last = t; fx.fly2.x = 1.32; }
  if (fx.fly2.x > -0.4) {
    fx.fly2.x -= dt * 0.1;
    const u = 1.32 - fx.fly2.x;
    const cx = fx.fly2.x * W;
    const cy = sky * (0.08 + u * 0.2);
    const cs = S * 0.02;
    // anti-sunward direction (both tails point away from the sun)
    const ax = -SUN_X, ay = -SUN_Y;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // dust tail: broad, warm, curved back along the trajectory
    const dl = S * 0.5;
    const dgx = cx + ax * dl * 0.62 + dl * 0.6, dgy = cy + ay * dl * 0.62;
    const dg = ctx.createLinearGradient(cx, cy, dgx, dgy);
    dg.addColorStop(0, "rgba(255,236,196,0.4)");
    dg.addColorStop(0.45, "rgba(255,206,170,0.16)");
    dg.addColorStop(1, "rgba(255,190,150,0)");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cs * 0.6);
    ctx.quadraticCurveTo(cx + dl * 0.5, cy + ay * dl * 0.2 - cs * 3, dgx, dgy - cs * 5);
    ctx.lineTo(dgx, dgy + cs * 3);
    ctx.quadraticCurveTo(cx + dl * 0.4, cy + ay * dl * 0.24 + cs * 2.4, cx, cy + cs * 0.6);
    ctx.closePath();
    ctx.fill();
    // ion tail: narrow, straight, electric blue
    const il = S * 0.62;
    for (let k = 0; k < 3; k++) {
      const sp = (k - 1) * 0.1;
      const ex = cx + (ax * Math.cos(sp) - ay * Math.sin(sp)) * il;
      const ey = cy + (ax * Math.sin(sp) + ay * Math.cos(sp)) * il;
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
    bloom(ctx, cx, cy, cs * 4.6, "rgba(190,244,255,0.55)", 0.8 + Math.sin(t * 7) * 0.12);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, cs * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── 9b · orbital station slow pass ──────────────────────────────────────── */
  if (t - fx.fly3.last > 40) { fx.fly3.last = t; fx.fly3.x = -0.2; }
  if (fx.fly3.x < 1.25) {
    fx.fly3.x += dt * 0.042;
    const stW = Math.round(clamp(S * 0.17, 40, 190));
    const stH = Math.round(stW * 0.56);
    const ship = cachedSprite("sp.station", stW, stH, "v2", paintStation);
    const sx = fx.fly3.x * W;
    const sy = sky * (0.29 + Math.sin(t * 0.24) * 0.018);
    const roll = Math.sin(t * 0.16) * 0.22 + 0.1;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(roll);
    ctx.drawImage(ship, -stW / 2, -stH / 2);
    // solar glint
    const gl = 0.5 + 0.5 * Math.sin(t * 0.5);
    if (gl > 0.86) bloom(ctx, -stW * 0.28, -stH * 0.16, stW * 0.28, "rgba(255,255,255,0.7)", (gl - 0.86) * 6);
    ctx.restore();
    // beacons (drawn upright so they read at any roll)
    const blinkR = Math.sin(t * 4.2) > 0.55, blinkG = Math.sin(t * 4.2 + 2.1) > 0.55;
    if (blinkR) bloom(ctx, sx - stW * 0.44, sy - stH * 0.1, stW * 0.1, "rgba(255,90,110,0.9)", 0.9);
    if (blinkG) bloom(ctx, sx + stW * 0.44, sy + stH * 0.1, stW * 0.1, "rgba(120,255,160,0.9)", 0.9);
    if (Math.sin(t * 1.7) > 0.94) bloom(ctx, sx, sy - stH * 0.3, stW * 0.14, "rgba(255,255,255,0.9)", 1);
  }

  /* ── 9c · meteor shower bursts ───────────────────────────────────────────── */
  const bu = st.burst;
  if (t > bu.next) {
    bu.idx++;
    bu.next = t + 13 + (bu.idx % 3) * 4;
    const r = mulberry32(9000 + bu.idx * 7);
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
    const spd = 520 + r() * 460;
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
    s.life -= dt * 0.62;
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

  /* ── 9d · rocket flyby with exhaust trail ────────────────────────────────── */
  const rk = st.rocket;
  const rkW = Math.round(clamp(S * 0.08, 18, 92));
  if (rk.w !== rkW) { rk.w = rkW; rk.puffs.length = 0; }
  if (rk.puffs.length === 0) for (let i = 0; i < 26; i++) rk.puffs.push({ x: 0, y: 0, r: 0, life: 0 });
  if (t > rk.next) { rk.next = t + 29; rk.x = -0.14; }
  const rkH = Math.max(4, Math.round(rkW * 0.52));
  if (rk.x < 1.16) {
    rk.x += dt * 0.17;
    const rx = rk.x * W;
    const ry = sky * (0.78 - Math.sin(clamp(rk.x, 0, 1) * Math.PI) * 0.1);
    // emit into a preallocated ring buffer (no per-frame allocation)
    const pf = rk.puffs[Math.floor(t * 22) % rk.puffs.length];
    if (pf.life <= 0) {
      pf.x = rx - rkW * 0.5;
      pf.y = ry + Math.sin(t * 9) * rkW * 0.05;
      pf.r = rkW * (0.1 + Math.abs(noise1(t * 4, 3)) * 0.12);
      pf.life = 1;
    }
    const rocket = cachedSprite("sp.rocket", rkW, rkH, "v2", paintRocket);
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
    const flick = 0.72 + Math.abs(noise1(t * 26, 9)) * 0.5;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(Math.sin(t * 2) * 0.06 - 0.05);
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
    if (p.life > 0) p.life -= dt * 0.55;
  }

  /* ── 10 · aurora curtains over the horizon ───────────────────────────────── */
  const bands = q === 0 ? 2 : 3;
  const step = Math.max(16, W / 46);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let b = 0; b < bands; b++) {
    const cols = AURORA_COLS;
    const baseY = floorY + S * 0.012 - b * S * 0.028;
    const hgt = S * (0.15 + b * 0.055);
    const amp = S * (0.028 + b * 0.012);
    const drift = t * (0.16 + b * 0.05);
    const topAt = (x: number) =>
      baseY - hgt + fbm1(x * 0.0042 + drift + b * 17, 3, 33 + b) * amp
      + Math.sin(x * 0.006 + t * 0.5 + b) * amp * 0.4;
    const wob = 0.72 + 0.28 * Math.sin(t * 0.37 + b * 1.7);

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

    // vertical curtain streaks — one path, one stroke
    const sg2 = ctx.createLinearGradient(0, baseY - hgt, 0, baseY);
    sg2.addColorStop(0, rgba(cols[b], 0));
    sg2.addColorStop(0.7, rgba(cols[b], 0.09 * wob));
    sg2.addColorStop(1, rgba(cols[b], 0));
    ctx.strokeStyle = sg2;
    ctx.lineWidth = Math.max(1.5, S * 0.006);
    ctx.beginPath();
    for (let x = 0; x <= W; x += step * 0.62) {
      const n = noise1(x * 0.02 + t * 0.6 + b * 9, 5);
      if (n < -0.15) continue;
      const ty = topAt(x);
      ctx.moveTo(x, ty + (baseY - ty) * (0.05 + Math.abs(n) * 0.3));
      ctx.lineTo(x, baseY - (baseY - ty) * 0.06);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* ── 11 · lunar surface ──────────────────────────────────────────────────── */
  const gMarg = Math.round(clamp(S * 0.11, 24, 110));
  const gTop = Math.round(floorY) - gMarg;
  const gH = Math.max(8, Math.round(H) - gTop + 2);
  const ground = cachedSprite("sp.ground", Math.ceil(W), gH, `v2:${gMarg}`,
    (c, w, h) => paintMoonGround(c, w, h, gMarg));
  ctx.drawImage(ground, 0, gTop);

  // live low dust haze drifting along the horizon
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.1 + Math.sin(t * 0.5) * 0.035;
  const hz = vGrad(ctx, floorY - S * 0.06, floorY + S * 0.02, [
    [0, "rgba(196,178,255,0)"],
    [0.7, "rgba(214,198,255,0.5)"],
    [1, "rgba(230,216,255,0)"],
  ]);
  ctx.fillStyle = hz;
  ctx.fillRect(0, floorY - S * 0.06, W, S * 0.08);
  ctx.restore();

  /* ── 12 · grade + vignette ───────────────────────────────────────────────── */
  grade(ctx, W, H, "#7d4ce0", 0.07, 0);   // top light is baked into the sky plate
  vignette(ctx, W, H, 0.26);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
