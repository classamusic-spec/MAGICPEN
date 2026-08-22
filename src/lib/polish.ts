// ─── AI Polish (frontend) ────────────────────────────────────────────────────
// Bakes the kid's drawing to a PNG and asks the backend to redraw it as premium
// storybook art. The returned image gets its white background flood-cut and a
// sticker outline re-applied so it matches the crayon creatures. Fully optional:
// any failure just keeps the crayon sprite.

import type { Stroke } from "./types";
import { normalizeStrokes, drawStrokeFull } from "./crayon";

/** Render the drawing on a transparent canvas → PNG data URL (for the AI). */
export function bakeSketchPNG(strokes: Stroke[], box = 448): string {
  const pad = 40;
  const size = box + pad * 2;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const n = normalizeStrokes(strokes, box);
  ctx.translate(size / 2, size / 2);
  n.strokes.forEach((s, i) => drawStrokeFull(ctx, s, i * 77 + 13));
  return cv.toDataURL("image/png");
}

/** Route generated art through the backend proxy (image hosts send no CORS). */
export function proxyArtUrl(raw: string): string {
  return "/api/art-proxy?url=" + encodeURIComponent(raw);
}

/* ── art sprite pipeline: download → cutout → sticker rings → cache ── */

const cache = new Map<string, HTMLCanvasElement | "loading" | "error">();
const listeners = new Set<() => void>();

function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

function stampRing(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, radius: number) {
  const ox = -img.width / 2;
  const oy = -img.height / 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.drawImage(img, ox + Math.cos(a) * radius, oy + Math.sin(a) * radius);
  }
  ctx.drawImage(img, ox, oy);
}

/** Flood-remove the near-white background, keeping enclosed highlights. */
function cutout(img: HTMLImageElement): HTMLCanvasElement {
  const S = 512;
  const k = S / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qs = 0, qe = 0;
  const push = (i: number) => { if (!visited[i]) { visited[i] = 1; queue[qe++] = i; } };
  const isBg = (i: number) => {
    const o = i * 4;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 222 && mx - mn < 28; // bright + unsaturated = background
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qs < qe) {
    const i = queue[qs++];
    if (!isBg(i)) continue;
    px[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

/** Ink/white sticker rings around an image → final sprite canvas. */
export function stickerizeImage(src: HTMLCanvasElement): HTMLCanvasElement {
  const pad = 34;
  const W = src.width + pad * 2;
  const H = src.height + pad * 2;
  const ink = silhouette(src, "#2d2926");
  const white = silhouette(src, "#ffffff");
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.translate(W / 2, H / 2);
  stampRing(ctx, ink, 17);
  stampRing(ctx, white, 10);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return cv;
}

/** Cutout + ink/white sticker rings → final sprite canvas. */
function processArt(img: HTMLImageElement): HTMLCanvasElement {
  return stickerizeImage(cutout(img));
}

/** Get the processed art sprite for a proxied URL (null while loading/failed). */
export function artSprite(url: string): HTMLCanvasElement | null {
  const hit = cache.get(url);
  if (hit && hit !== "loading" && hit !== "error") return hit;
  if (hit) return null;
  cache.set(url, "loading");
  const img = new Image();
  img.onload = () => {
    try {
      cache.set(url, processArt(img));
    } catch {
      cache.set(url, "error");
    }
    listeners.forEach((f) => f());
  };
  img.onerror = () => { cache.set(url, "error"); listeners.forEach((f) => f()); };
  img.src = url;
  return null;
}

/** Components re-render when any art sprite finishes processing. */
export function onArtLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
