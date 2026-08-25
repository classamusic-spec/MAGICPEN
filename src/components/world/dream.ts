// ─── Dream World: the child's own painted world, brought to life ─────────────
// The other worlds are hand-authored procedural scenes. This one is whatever
// the child drew. It has two ways of knowing what it is looking at:
//
//   • the child told it — a region mask painted on the easel says "this bit is
//     water, that bit is sky, this is the ground". Then the water shimmer, the
//     airy sky light and the settled earth follow the shapes they actually
//     drew, however wonky those shapes are;
//   • nobody told it — the old heuristics stand in: a warm blob up high is a
//     sun, cool ink down low is water in a band above the ground line. Worlds
//     painted before regions existed keep exactly the look they had.
//
// The frame budget is the reason this file is shaped the way it is. Everything
// that does not move — the region colour wash, the sky's light, the earth's
// shade and dapple, the water's tint — is baked once per drawing revision into
// one small overlay and composited with a single drawImage. Only the water's
// caustics are masked per frame, and only inside the water's bounding box.

import type { DreamWorld, RegionKind } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { REGION_H, REGION_W, maskOf, regionAt, regionBand, type RegionMask } from "@/lib/regions";
import { applySeasonWash, clamp01, detail, quality, slot, vignette, type FxState, type ThemeFrame } from "./shared";

/* ── colour helpers ────────────────────────────────────────────────────────── */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const isWarm = ([r, g, b]: [number, number, number]) => r > 175 && g > 105 && b < 150 && r >= g - 10;
const isCool = ([r, g, b]: [number, number, number]) => b > r + 18 || (g > 150 && b > 150 && r < 130);

/** The wash a region lends to the paper underneath the crayon. These are the
 *  colours of a *place*, not the bright labels the easel uses. */
const WASH: Record<RegionKind, [number, number, number]> = {
  sky: [209, 229, 255],
  water: [126, 208, 223],
  ground: [223, 201, 158],
};

/* ── motion preference ─────────────────────────────────────────────────────── */

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

/* ── what got baked, cached per drawing revision ───────────────────────────── */

/** Blow-up factor for the coarse region grid: 24×32 cells become a 144×192
 *  feathered image, which is plenty for soft washes and glows. */
const MS = 6;

interface Baked {
  cv: HTMLCanvasElement;
  ss: number;
  /** Sun, in drawn-canvas coords, or null when there isn't a warm blob up top. */
  sun: { x: number; y: number } | null;
  /** Top of the heuristic water band in drawn-canvas coords, or null. */
  waterTop: number | null;
  /** What the child said, or null when they said nothing. */
  mask: RegionMask | null;
  /** Everything that does not move, in drawing-normalized space. One blit. */
  overlay: HTMLCanvasElement | null;
  /** Soft alpha mask for the water, for the one live effect that needs it. */
  waterShape: HTMLCanvasElement | null;
  /** Water's normalized bounding box [x0, y0, x1, y1] — the only part of the
   *  screen the shimmer ever has to touch. */
  waterBox: [number, number, number, number] | null;
  /** Bottom of the water, normalized to the drawing — where bubbles are born. */
  waterFloor: number | null;
  /** Soft 0..1 sky coverage per cell, so clouds can fade in and out of it. */
  skyCover: Float32Array | null;
}

/**
 * One clamped 3×3 box blur over the coarse grid, in premultiplied colour so
 * bare cells never bleed into the edges. Without it a blown-up 24×32 grid
 * reads as a staircase; with it, the effects hug a soft organic shape.
 */
function soften(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    pr[i] = data[i * 4] * a;
    pg[i] = data[i * 4 + 1] * a;
    pb[i] = data[i * 4 + 2] * a;
    pa[i] = a;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const j = sy * w + Math.min(w - 1, Math.max(0, x + dx));
          r += pr[j]; g += pg[j]; b += pb[j]; a += pa[j];
        }
      }
      const i = (y * w + x) * 4;
      data[i + 3] = Math.round((a / 9) * 255);
      if (a > 0.001) {
        data[i] = Math.round(r / a);
        data[i + 1] = Math.round(g / a);
        data[i + 2] = Math.round(b / a);
      }
    }
  }
}

/** Bilinear blow-up of a grid-sized canvas: cheap feathering, no blur filter. */
function feather(cells: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = cells.width * MS;
  out.height = cells.height * MS;
  const c = out.getContext("2d")!;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(cells, 0, 0, out.width, out.height);
  return out;
}

/** Bilinear read of a per-cell coverage field at normalized coords. */
function coverAt(f: Float32Array, nx: number, ny: number): number {
  const x = nx * REGION_W - 0.5;
  const y = ny * REGION_H - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) =>
    f[Math.min(REGION_H - 1, Math.max(0, yy)) * REGION_W + Math.min(REGION_W - 1, Math.max(0, xx))];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
       + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

function bake(dream: DreamWorld): Baked {
  const ss = 2; // supersample so the crayon stays crisp when scaled up
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(dream.dw * ss));
  cv.height = Math.max(1, Math.round(dream.dh * ss));
  const ctx = cv.getContext("2d")!;
  ctx.scale(ss, ss);
  dream.strokes.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1));

  const mask = maskOf(dream);
  let overlay: HTMLCanvasElement | null = null;
  let waterShape: HTMLCanvasElement | null = null;
  let waterBox: [number, number, number, number] | null = null;
  let skyCover: Float32Array | null = null;

  if (mask) {
    /* ── per-kind cell coverage and the colour wash ── */
    const cells = document.createElement("canvas");
    cells.width = REGION_W;
    cells.height = REGION_H;
    const cc = cells.getContext("2d")!;
    const washImg = cc.createImageData(REGION_W, REGION_H);
    const found: Partial<Record<RegionKind, ImageData>> = {};
    let washAny = false;
    let wx0 = 1, wy0 = 1, wx1 = 0, wy1 = 0;

    for (let y = 0; y < REGION_H; y++) {
      for (let x = 0; x < REGION_W; x++) {
        const k = regionAt(mask, (x + 0.5) / REGION_W, (y + 0.5) / REGION_H);
        if (!k) continue;
        const i = (y * REGION_W + x) * 4;
        const [wr, wg, wb] = WASH[k];
        washImg.data[i] = wr;
        washImg.data[i + 1] = wg;
        washImg.data[i + 2] = wb;
        washImg.data[i + 3] = 255;
        washAny = true;
        let img = found[k];
        if (!img) { img = cc.createImageData(REGION_W, REGION_H); found[k] = img; }
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
        if (k === "water") {
          wx0 = Math.min(wx0, x / REGION_W);
          wx1 = Math.max(wx1, (x + 1) / REGION_W);
          wy0 = Math.min(wy0, y / REGION_H);
          wy1 = Math.max(wy1, (y + 1) / REGION_H);
        }
      }
    }

    const shape: Partial<Record<RegionKind, HTMLCanvasElement>> = {};
    for (const k of Object.keys(found) as RegionKind[]) {
      const img = found[k]!;
      soften(img.data, REGION_W, REGION_H);
      cc.putImageData(img, 0, 0);
      shape[k] = feather(cells);
      if (k === "sky") {
        skyCover = new Float32Array(REGION_W * REGION_H);
        for (let i = 0; i < skyCover.length; i++) skyCover[i] = img.data[i * 4 + 3] / 255;
      }
    }
    waterShape = shape.water ?? null;
    if (waterShape) {
      // the softening feathers a cell outwards; give the box the same margin
      const px = 1.5 / REGION_W, py = 1.5 / REGION_H;
      waterBox = [
        Math.max(0, wx0 - px), Math.max(0, wy0 - py),
        Math.min(1, wx1 + px), Math.min(1, wy1 + py),
      ];
    }

    /* ── one static overlay: wash + sky light + earth shade + water tint ── */
    if (washAny) {
      soften(washImg.data, REGION_W, REGION_H);
      cc.putImageData(washImg, 0, 0);
      const wash = feather(cells);

      overlay = document.createElement("canvas");
      overlay.width = wash.width;
      overlay.height = wash.height;
      const OW = overlay.width, OH = overlay.height;
      const oc = overlay.getContext("2d")!;
      oc.globalAlpha = 0.62;
      oc.drawImage(wash, 0, 0);
      oc.globalAlpha = 1;

      const layer = document.createElement("canvas");
      layer.width = OW;
      layer.height = OH;
      const lc = layer.getContext("2d")!;
      const stamp = (k: RegionKind, paint: (c: CanvasRenderingContext2D) => void) => {
        const sh = shape[k];
        if (!sh) return;
        lc.globalCompositeOperation = "source-over";
        lc.globalAlpha = 1;
        lc.clearRect(0, 0, OW, OH);
        paint(lc);
        lc.globalCompositeOperation = "destination-in";
        lc.drawImage(sh, 0, 0);
        lc.globalCompositeOperation = "source-over";
        oc.drawImage(layer, 0, 0);
      };

      // sky: light pooling at the top, thinning as it comes down
      stamp("sky", (c) => {
        const g = c.createLinearGradient(0, 0, 0, OH);
        g.addColorStop(0, "rgba(255,255,255,0.30)");
        g.addColorStop(0.5, "rgba(255,247,224,0.14)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, OW, OH);
      });

      // ground: warm light on top, settling into shade, with old soft patches
      stamp("ground", (c) => {
        const g = c.createLinearGradient(0, 0, 0, OH);
        g.addColorStop(0, "rgba(255,238,196,0.18)");
        g.addColorStop(0.35, "rgba(150,112,60,0.06)");
        g.addColorStop(1, "rgba(84,58,30,0.26)");
        c.fillStyle = g;
        c.fillRect(0, 0, OW, OH);
        const R = OW * 0.17;
        for (let i = 0; i < 7; i++) {
          const px = ((i * 0.2637 + 0.08) % 1) * OW;
          const py = OH * (0.16 + ((i * 0.5171) % 1) * 0.78);
          const gg = c.createRadialGradient(px, py, 0, px, py, R);
          gg.addColorStop(0, "rgba(112,80,42,0.09)");
          gg.addColorStop(1, "rgba(112,80,42,0)");
          c.fillStyle = gg;
          c.beginPath();
          c.arc(px, py, R, 0, Math.PI * 2);
          c.fill();
        }
      });

      // water: the aqua tint that says "you are looking into it"
      stamp("water", (c) => {
        const g = c.createLinearGradient(0, 0, 0, OH);
        g.addColorStop(0, "rgba(90,205,228,0.14)");
        g.addColorStop(1, "rgba(28,132,168,0.26)");
        c.fillStyle = g;
        c.fillRect(0, 0, OW, OH);
      });
    }
  }

  // ── heuristics, for worlds that were never labelled (and for the sun, which
  //    is a thing rather than a region, so it is always worth spotting) ──
  // A warm cluster is only a sun if it is up high, or sitting in painted sky —
  // that stops a yellow flower on the grass from lighting up the world.
  const inSky = (px: number, py: number) => {
    if (!mask) return py < dream.dh * 0.45;
    const k = regionAt(mask, px / dream.dw, py / dream.dh);
    return k === "sky" || (k === null && py < dream.dh * 0.45);
  };
  let sx = 0, sy = 0, sn = 0;
  let waterTop = Infinity, wn = 0;
  for (const s of dream.strokes) {
    const col = rgb(s.color);
    const warm = isWarm(col);
    const cool = isCool(col);
    for (let k = 0; k < s.pts.length; k += 3) {
      const p = s.pts[k];
      if (warm && inSky(p.x, p.y)) { sx += p.x; sy += p.y; sn++; }
      if (cool && p.y > dream.dh * 0.5) { waterTop = Math.min(waterTop, p.y); wn++; }
    }
  }

  const wBand = mask ? regionBand(mask, "water") : null;

  return {
    cv,
    ss,
    sun: sn > 8 ? { x: sx / sn, y: sy / sn } : null,
    waterTop: wn > 10 ? waterTop : null,
    mask,
    overlay,
    waterShape,
    waterBox,
    waterFloor: wBand ? wBand[1] : null,
    skyCover,
  };
}

/* ── one reusable scratch surface for clipping an effect to a painted shape ── */

let scratchCv: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
function scratch(w: number, h: number) {
  if (!scratchCv) scratchCv = document.createElement("canvas");
  if (scratchCv.width !== w || scratchCv.height !== h) {
    scratchCv.width = w;
    scratchCv.height = h;
    scratchCtx = null;
  }
  if (!scratchCtx) scratchCtx = scratchCv.getContext("2d");
  return scratchCtx ? { cv: scratchCv, c: scratchCtx } : null;
}

/**
 * Paint a live effect and keep only the part inside a painted region. `paint`
 * works in ordinary screen coordinates; only the region's bounding box is ever
 * cleared, masked or blitted, and at less than screen resolution — everything
 * that goes through here is a soft ripple, so nobody can tell.
 */
function inRegion(
  ctx: CanvasRenderingContext2D,
  shape: HTMLCanvasElement,
  mx: number, my: number, mw: number, mh: number,
  bx: number, by: number, bw: number, bh: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  if (!(bw > 1) || !(bh > 1)) return;
  const q = quality();
  const k = q === 2 ? 0.75 : q === 1 ? 0.55 : 0.4;
  const sw = Math.max(1, Math.round(bw * k));
  const sh = Math.max(1, Math.round(bh * k));
  const s = scratch(sw, sh);
  if (!s) return;
  const { cv, c } = s;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.clearRect(0, 0, sw, sh);
  c.save();
  c.scale(k, k);
  c.translate(-bx, -by);
  paint(c);
  c.restore();
  c.globalCompositeOperation = "destination-in";
  c.imageSmoothingEnabled = true;
  c.drawImage(shape, (mx - bx) * k, (my - by) * k, mw * k, mh * k);
  c.globalCompositeOperation = "source-over";
  ctx.drawImage(cv, 0, 0, sw, sh, bx, by, bw, bh);
}

/* ── drifting motes: dust in the air, bubbles in the water ─────────────────── */

interface Mote { x: number; y: number; r: number; sp: number; ph: number }

function motes(fx: FxState): Mote[] {
  return slot(fx, "dream.motes", () => {
    const out: Mote[] = [];
    // deterministic scatter — no Math.random in a render module's init path
    let seed = 1234;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 16; i++) out.push({ x: rnd(), y: rnd(), r: 1.2 + rnd() * 2.4, sp: 0.01 + rnd() * 0.03, ph: rnd() * 6.28 });
    return out;
  });
}

/* ── the frame ─────────────────────────────────────────────────────────────── */

export function drawDream({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number, dream: DreamWorld | null) {
  if (!(W > 1) || !(H > 1)) return;
  const still = calm();
  const T = still ? 0 : t;      // frozen phases when the viewer wants less motion
  const DT = still ? 0 : dt;

  // ── base wash: soft sky above the ground, soft earth below, so any part of
  //    the world the child left blank still reads as a place, not a gap ──
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#eaf1ff");
  sky.addColorStop(1, "#f4eeff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, floorY);
  const earth = ctx.createLinearGradient(0, floorY, 0, H);
  earth.addColorStop(0, "#efe6d3");
  earth.addColorStop(1, "#e6d9be");
  ctx.fillStyle = earth;
  ctx.fillRect(0, floorY, W, H - floorY);

  if (!dream) { vignette(ctx, W, H, 0.16); return; }

  const key = `dream.bake.${dream.rev}`;
  const baked = slot(fx, key, () => {
    // a repaint replaces the world; let the old bake's canvases go
    for (const k of Object.keys(fx.store)) if (k !== key && k.startsWith("dream.bake.")) delete fx.store[k];
    return bake(dream);
  });

  // fill the width; anchor the drawn ground to where creatures walk
  const s = W / dream.dw;
  const oy = floorY - dream.ground * dream.dh * s;
  const dh = dream.dh * s;

  // ── everything the regions say, under the crayon: one blit ──
  if (baked.overlay) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baked.overlay, 0, oy, W, dh);
    ctx.restore();
  }

  // ── the drawing, breathing: a tiny scale about the ground line so the top
  //    of the world lifts and settles while the ground stays put ──
  const breathe = still ? 1 : 1 + Math.sin(t * 0.6) * 0.005;
  ctx.save();
  ctx.translate(W / 2, floorY);
  ctx.scale(breathe, breathe);
  ctx.translate(-W / 2, -floorY);
  ctx.drawImage(baked.cv, 0, 0, baked.cv.width, baked.cv.height, 0, oy, dream.dw * s, dh);
  ctx.restore();

  // ── sun glow, only if the child drew one ──
  if (baked.sun) {
    const sxp = baked.sun.x * s;
    const syp = oy + baked.sun.y * s;
    const pulse = 0.6 + Math.sin(T * 1.3) * 0.12;
    const R = Math.min(W, H) * 0.34;
    const g = ctx.createRadialGradient(sxp, syp, 0, sxp, syp, R);
    g.addColorStop(0, `rgba(255,214,92,${0.42 * pulse})`);
    g.addColorStop(0.5, `rgba(255,190,60,${0.16 * pulse})`);
    g.addColorStop(1, "rgba(255,190,60,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sxp, syp, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── sky: clouds drifting through the air the child marked. No mask pass —
  //    each one simply fades out as it leaves the sky, which is cheaper and
  //    looks the same. ──
  const cover = baked.skyCover;
  if (cover) {
    const n = detail(3);
    const R = Math.min(W, H);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const sp = 0.011 + i * 0.005;
      const cxn = ((i * 0.37 + T * sp) % 1.3) - 0.15;
      const cyn = 0.13 + 0.3 * ((i * 0.41) % 1);
      const a = coverAt(cover, clamp01(cxn), cyn);
      if (a < 0.03) continue;
      const r = R * (0.13 + 0.05 * ((i * 0.7) % 1));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255,255,255,${0.34 * a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.translate(cxn * W, oy + cyn * dh);
      ctx.scale(1.8, 0.6);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ── water: caustics and a slow swell, hugging the shape they painted ──
  const waterShape = baked.waterShape;
  const box = baked.waterBox;
  if (waterShape && box) {
    const bx = box[0] * W;
    const by = Math.max(0, oy + box[1] * dh);
    const bw = box[2] * W - bx;
    const bh = Math.min(H, oy + box[3] * dh) - by;
    inRegion(ctx, waterShape, 0, oy, W, dh, bx, by, bw, bh, (c) => {
      c.strokeStyle = "rgba(255,255,255,0.38)";
      c.lineWidth = 2.6;
      const rows = detail(8);
      const top = oy + box[1] * dh;
      const span = (box[3] - box[1]) * dh;
      for (let i = 0; i < rows; i++) {
        const y = top + (span * (i + 0.5)) / rows;
        c.beginPath();
        for (let x = bx; x <= bx + bw; x += 14) {
          const yy = y
            + Math.sin(x * 0.028 + T * 1.4 + i * 1.7) * 4
            + Math.sin(x * 0.011 - T * 0.75 + i) * 3;
          if (x === bx) c.moveTo(x, yy); else c.lineTo(x, yy);
        }
        c.stroke();
      }
      // a bright swell sliding through, so the water has depth
      const cy = top + (0.5 + Math.sin(T * 0.22) * 0.34) * span;
      const half = Math.max(8, span * 0.34);
      const g = c.createLinearGradient(0, cy - half, 0, cy + half);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(220,250,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(bx, by, bw, bh);
    });
  } else if (baked.waterTop != null) {
    // ── no mask: the old band above the ground line, unchanged ──
    const top = oy + baked.waterTop * s;
    const band = Math.max(0, floorY - top);
    if (band > 6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, W, band);
      ctx.clip();
      ctx.fillStyle = "rgba(90,200,220,0.10)";
      ctx.fillRect(0, top, W, band);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = top + (band * (i + 0.5)) / 4;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = y + Math.sin(x * 0.03 + T * 1.4 + i) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── ambient motes: dust drifting, bubbles rising in the water ──
  const mask = baked.mask;
  const bandTop = baked.waterTop != null ? oy + baked.waterTop * s : H;
  const wet = (px: number, py: number) => {
    if (mask && waterShape) {
      const ny = (py - oy) / dh;
      if (ny < 0 || ny > 1) return false;
      return regionAt(mask, px / W, ny) === "water";
    }
    return py > bandTop;
  };
  // bubbles are reborn at the bottom of the water they came from
  const born = mask && baked.waterFloor != null
    ? Math.min(1, (oy + baked.waterFloor * dh) / H)
    : 1;
  ctx.save();
  for (const m of motes(fx)) {
    m.ph += DT * (0.6 + m.sp * 8);
    const px = ((m.x + Math.sin(m.ph) * 0.02) % 1) * W;
    if (wet(px, m.y * H)) {
      // in the water: rise like a bubble, wrap back down to the riverbed
      m.y -= m.sp * DT * 0.9;
      if (!wet(px, m.y * H)) m.y = born;
      ctx.strokeStyle = "rgba(160,215,235,0.5)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, m.y * H, m.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // in the air: drift slowly
      m.y += Math.sin(m.ph) * 0.0006 * (still ? 0 : 1);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(px, m.y * H, m.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── a top-down highlight and a vignette for depth ──
  const hi = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.9);
  hi.addColorStop(0, "rgba(255,255,255,0.18)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, W, H);
  vignette(ctx, W, H, 0.18);
  /* The child painted this one, so the year only changes its light — nothing
     falls across a picture somebody made on purpose. */
  applySeasonWash(ctx, W, H);
}
