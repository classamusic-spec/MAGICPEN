// ─── Shared creature sprite baking ───────────────────────────────────────────
// Turns a creature's crayon strokes into 4 wiggle-phase sticker frames.

import type { Creature } from "./types";
import { kindById } from "./creatures";
import { normalizeStrokes, drawStrokeFull, strokesBounds } from "./crayon";

export interface Sprite { frames: HTMLCanvasElement[]; w: number; h: number }

/** Silhouette of a canvas filled with a solid color (for sticker outlines). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

/** Draw a silhouette image stamped in a ring so it forms a solid outline. */
export function stampRing(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, radius: number) {
  const ox = -img.width / 2;
  const oy = -img.height / 2;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(img, ox + Math.cos(a) * radius, oy + Math.sin(a) * radius);
  }
  ctx.drawImage(img, ox, oy);
}

export function bakeCrayonSprite(c: Creature): Sprite {
  const norm = normalizeStrokes(c.strokes, 150);
  // chunkier lines read better at world scale
  const thick = norm.strokes.map((s) => ({ ...s, size: Math.max(3.5, s.size * 1.6) }));
  const b = strokesBounds(thick);
  const pad = 40;
  const w = Math.ceil(b.w + pad * 2);
  const h = Math.ceil(b.h + pad * 2);
  const kind = kindById(c.kindId);
  const amp = kind.behavior === "swim" || kind.behavior === "crawl" ? 7 : kind.behavior === "fly" ? 4 : 2;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    // raw crayon frame
    const raw = document.createElement("canvas");
    raw.width = w; raw.height = h;
    const rctx = raw.getContext("2d")!;
    rctx.translate(w / 2, h / 2);
    thick.forEach((s, i) =>
      drawStrokeFull(rctx, s, i + 1, {
        time: f / 3.2,
        amp,
        freq: 1.4,
        speed: Math.PI,
        tailBias: kind.behavior === "swim" || kind.behavior === "crawl" ? 1 : 0.5,
      })
    );
    // sticker outline: ink ring behind white ring behind crayon
    const ink = silhouette(raw, "#2d2926");
    const white = silhouette(raw, "#ffffff");
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d")!;
    ctx.translate(w / 2, h / 2);
    stampRing(ctx, ink, 7);
    stampRing(ctx, white, 4);
    ctx.drawImage(raw, -w / 2, -h / 2);
    frames.push(cv);
  }
  return { frames, w, h };
}
