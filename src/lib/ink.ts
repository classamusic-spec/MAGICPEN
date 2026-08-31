// ─── Ink: the hand-drawn material system ────────────────────────────────────
// DRAWLINGS is a sketchbook where drawn things come alive, so the interface is
// drawn too. Nothing here is a rounded rectangle with a uniform border: every
// outline is a wobbled path with variable weight, every fill is real wax laid
// down by the same crayon engine that renders the child's own drawings.
//
// Everything is deterministic (seeded) and cached — a control must never
// shimmer between renders, and textures are baked once per colour.

import { drawCrayonStroke } from "./crayon";
import type { Pt } from "./types";

/* ── deterministic noise ─────────────────────────────────────────────────── */

/** Stable PRNG — the same seed always draws the same hand. */
export function hand(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash any string to a seed, so a label can pick its own consistent hand. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ── rough geometry: paths that look drawn, not computed ─────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Walk a straight run as a slightly bowed, wobbling line. Real pen strokes
 * bow away from the straight line and land imprecisely — both are modelled.
 */
function inkSegment(
  out: string[], x1: number, y1: number, x2: number, y2: number,
  r: () => number, wob: number, first: boolean,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal — the direction the stroke bows in
  const nx = -dy / len;
  const ny = dx / len;
  // bow grows with edge length: a long line drawn freehand curves a lot more
  // than a short one, and this is most of what sells "drawn" over "computed"
  const bow = (r() - 0.5) * wob * (1.4 + Math.min(2.2, len / 90));
  const cx = (x1 + x2) / 2 + nx * bow;
  const cy = (y1 + y2) / 2 + ny * bow;
  const ex = x2 + (r() - 0.5) * wob * 0.7;
  const ey = y2 + (r() - 0.5) * wob * 0.7;
  if (first) out.push(`M${round2(x1 + (r() - 0.5) * wob * 0.7)} ${round2(y1 + (r() - 0.5) * wob * 0.7)}`);
  out.push(`Q${round2(cx)} ${round2(cy)} ${round2(ex)} ${round2(ey)}`);
}

export interface RoughOpts {
  /** Max deviation from the true edge, in px. Scales with the shape. */
  wobble?: number;
  seed?: number;
  /** Corner radius. Hand-drawn corners are never perfectly equal. */
  radius?: number;
}

/**
 * A rectangle drawn by hand: bowed edges, unequal corners, an overshoot where
 * the pen closes the loop. Returns an SVG path `d`.
 */
export function roughRect(w: number, h: number, o: RoughOpts = {}): string {
  const r = hand(o.seed ?? 7);
  const wob = o.wobble ?? Math.min(6, Math.max(2.2, Math.min(w, h) * 0.055));
  const base = o.radius ?? Math.min(w, h) * 0.22;
  // four corners, each a little different — this is what kills the "CSS" look
  const c = [0, 1, 2, 3].map(() => base * (0.58 + r() * 0.84));
  const out: string[] = [];
  const arc = (x: number, y: number, rad: number, sx: number, sy: number, ex: number, ey: number) => {
    const k = rad * (0.52 + r() * 0.12);
    out.push(
      `C${round2(x + sx * k)} ${round2(y + sy * k)} ${round2(ex + (r() - 0.5) * wob * 0.5)} ${round2(ey + (r() - 0.5) * wob * 0.5)} ${round2(ex)} ${round2(ey)}`,
    );
  };
  // top edge → TR corner → right edge → BR → bottom → BL → left → TL
  inkSegment(out, c[0], 0, w - c[1], 0, r, wob, true);
  arc(w, 0, c[1], 0, 0, w, c[1]);
  inkSegment(out, w, c[1], w, h - c[2], r, wob, false);
  arc(w, h, c[2], 0, 0, w - c[2], h);
  inkSegment(out, w - c[2], h, c[3], h, r, wob, false);
  arc(0, h, c[3], 0, 0, 0, h - c[3]);
  inkSegment(out, 0, h - c[3], 0, c[0], r, wob, false);
  arc(0, 0, c[0], 0, 0, c[0], 0);
  out.push("Z");
  return out.join(" ");
}

/** A hand-drawn ellipse — the workhorse for round buttons and blobs. */
export function roughEllipse(w: number, h: number, o: RoughOpts = {}): string {
  const r = hand(o.seed ?? 11);
  const wob = o.wobble ?? Math.min(5.5, Math.max(2, Math.min(w, h) * 0.05));
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const steps = 10;
  const out: string[] = [];
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * (wob / Math.min(rx, ry)) * 1.4;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  out.push(`M${round2(pts[0].x)} ${round2(pts[0].y)}`);
  for (let i = 0; i < steps; i++) {
    const p = pts[(i + 1) % steps];
    const q = pts[(i + 2) % steps];
    out.push(`Q${round2(p.x)} ${round2(p.y)} ${round2((p.x + q.x) / 2)} ${round2((p.y + q.y) / 2)}`);
  }
  out.push("Z");
  return out.join(" ");
}

/** A drawn underline / emphasis swoosh, the kind you'd scribble under a title. */
export function roughUnderline(w: number, h = 10, seed = 3): string {
  const r = hand(seed);
  const out: string[] = [];
  const y = h * 0.6;
  out.push(`M${round2(w * 0.02)} ${round2(y + (r() - 0.5) * h * 0.5)}`);
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const px = w * (t - 0.5 / n);
    const py = y + (r() - 0.5) * h * 0.9;
    out.push(`Q${round2(px)} ${round2(py)} ${round2(w * t * 0.98)} ${round2(y + (r() - 0.5) * h * 0.4)}`);
  }
  return out.join(" ");
}

/* ── colour helpers ──────────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour by a 0..1 fraction. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/* ── wax: real crayon texture, baked from the app's own drawing engine ───── */

const waxCache = new Map<string, string>();

/**
 * Bake a tile of dense crayon scribble in `color` and return it as a data URL.
 * This is the whole trick: UI fills are made of the same wax the child draws
 * with, so the chrome and the artwork belong to one world.
 */
export function waxTile(color: string, size = 96): string {
  const key = `${color}@${size}`;
  const hit = waxCache.get(key);
  if (hit) return hit;
  /* Baked at twice the display size: the tile is resampled when the browser
     tiles it (device pixel ratios, SVG patterns), and an upscaled edge texel
     clamps into a visible seam column once per repeat. Downscaling hides it. */
  const RES = 2;
  const cv = document.createElement("canvas");
  cv.width = size * RES;
  cv.height = size * RES;
  const ctx = cv.getContext("2d");
  if (!ctx) return "";
  ctx.scale(RES, RES);

  // ground: a shade darker than the nominal colour, so the wax laid on top
  // reads as raised pigment rather than a flat swatch
  ctx.fillStyle = shade(color, -0.22);
  ctx.fillRect(0, 0, size, size);

  const r = hand(seedOf(color));
  const light = shade(color, 0.24);

  /* The strokes are laid out as *data* first, then stamped at all nine wrapped
     offsets (±size in x and y). A stroke that runs off the right edge is drawn
     again entering from the left, so the tile is genuinely toroidal — without
     this, every 128px of a wide waxed button showed a faint vertical seam. */
  interface WaxStroke { pts: Pt[]; tone: string; width: number; seed: number; alpha: number }
  const strokes: WaxStroke[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const tone = pass === 0 ? color : light;
    for (let i = -3; i < 9; i++) {
      const off = (i / 6) * size * 1.5 - size * 0.35 + pass * 9;
      /* every stroke gets its own vertical shift: with a shared span, all the
         rounded stroke ends land on one line and read as a scalloped band.
         Capped at 0.8×size so the farthest point stays within one wrap of the
         tile — the ±size stamping below then covers every sliver. */
      const yShift = r() * size * 0.8;
      const pts: Pt[] = [];
      for (let sIdx = 0; sIdx <= 5; sIdx++) {
        const t = sIdx / 5;
        pts.push({
          x: off + t * size * 1.35 + (r() - 0.5) * 13,
          y: yShift + t * size * 1.4 - size * 0.2 + (r() - 0.5) * 13,
        });
      }
      strokes.push({
        pts, tone,
        width: 13 + r() * 9,
        seed: i * 23 + pass * 131 + 5,
        alpha: pass === 0 ? 0.95 : 0.55,
      });
    }
  }
  const WRAP = [-size, 0, size];
  for (const dy of WRAP) for (const dx of WRAP) {
    for (const s of strokes) {
      ctx.globalAlpha = s.alpha;
      drawCrayonStroke(ctx, s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })), s.tone, s.width, s.seed);
    }
  }

  // tooth: tiny gaps where the paper shows through the wax — wrapped the same
  // way, so the speckle field carries across the tile edge too
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 130; i++) {
    const a = 0.05 + r() * 0.13;
    const x = r() * size, y = r() * size, rad = 0.5 + r() * 1.7;
    for (const dy of WRAP) for (const dx of WRAP) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  const url = cv.toDataURL("image/png");
  waxCache.set(key, url);
  return url;
}

/** CSS `background-image` value for a waxed surface in `color`. */
export function wax(color: string): string {
  const t = waxTile(color);
  return t ? `url("${t}")` : color;
}

/* ── paper: fibre, tooth and a torn edge ─────────────────────────────────── */

let paperUrl = "";

/** A tileable sheet of paper fibre — flecks and tooth, not gaussian noise. */
export function paperTile(): string {
  if (paperUrl) return paperUrl;
  const S = 160;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  if (!ctx) return "";
  const r = hand(4242);
  // tooth: faint short fibres lying in random directions
  for (let i = 0; i < 900; i++) {
    const x = r() * S;
    const y = r() * S;
    const a = r() * Math.PI;
    const len = 1 + r() * 4;
    const dark = r() < 0.5;
    ctx.strokeStyle = dark ? `rgba(120,96,64,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.04 + r() * 0.06})`;
    ctx.lineWidth = 0.6 + r() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // a few darker flecks — recycled stock, not printer paper
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(126,98,62,${0.05 + r() * 0.08})`;
    ctx.beginPath();
    ctx.arc(r() * S, r() * S, 0.4 + r() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  paperUrl = cv.toDataURL("image/png");
  return paperUrl;
}

/**
 * A torn-paper edge as an SVG path, for the bottom of a card or a page.
 * `flip` tears upward instead of downward.
 */
export function tornEdge(w: number, amp = 6, seed = 9, flip = false): string {
  const r = hand(seed);
  const out: string[] = [`M0 ${round2(amp)}`];
  const steps = Math.max(6, Math.round(w / 26));
  for (let i = 1; i <= steps; i++) {
    const x = (w * i) / steps;
    const y = amp + (r() - 0.5) * amp * 1.8 * (flip ? -1 : 1);
    const cx = x - w / steps / 2 + (r() - 0.5) * 6;
    const cy = amp + (r() - 0.5) * amp * 2 * (flip ? -1 : 1);
    out.push(`Q${round2(cx)} ${round2(cy)} ${round2(x)} ${round2(y)}`);
  }
  return out.join(" ");
}

/* ── tape: how a drawing gets stuck into a sketchbook ─────────────────────── */

/** Corner coordinates for a strip of washi tape rotated across a corner. */
export function tapeStrip(seed = 5): { rot: number; w: number; skew: number } {
  const r = hand(seed);
  return { rot: -28 + r() * 56, w: 46 + r() * 26, skew: (r() - 0.5) * 8 };
}

/**
 * Publish the baked paper fibre to CSS as `--paper-fibre`, so `.ink-paper`
 * can use it without every surface re-baking the texture.
 */
export function installPaper() {
  const tile = paperTile();
  if (tile) document.documentElement.style.setProperty("--paper-fibre", `url("${tile}")`);
}
