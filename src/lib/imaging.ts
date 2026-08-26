// ─── Turning a drawing into an image ────────────────────────────────────────
// Two small canvas helpers that have nothing to do with the network: baking a
// child's strokes into a PNG (for the reveal and the share card), and wrapping
// any canvas in the app's ink-and-white sticker rings so a photographed paper
// drawing matches the crayon creatures around it.
//
// These used to live in a `polish.ts` that also talked to an online art model.
// That feature is gone — nothing a child makes ever leaves the device — and
// these two honest, offline helpers are what remained.

import type { Stroke } from "./types";
import { normalizeStrokes, drawStrokeFull } from "./crayon";

/** Render the drawing on a transparent canvas → PNG data URL. */
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

/** A solid-colour silhouette of a canvas, for the sticker outline. */
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

/** Stamp a silhouette in a ring, so the outline reads as a hand-drawn border. */
function stampRing(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, radius: number) {
  const ox = -img.width / 2;
  const oy = -img.height / 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.drawImage(img, ox + Math.cos(a) * radius, oy + Math.sin(a) * radius);
  }
  ctx.drawImage(img, ox, oy);
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
