// ─── Shared creature sprite baking ───────────────────────────────────────────
// Turns a creature's crayon strokes into 4 wiggle-phase sticker frames.

import type { Creature } from "./types";
import { kindById } from "./creatures";
import { normalizeStrokes, drawStrokeFull, strokesBounds } from "./crayon";
import { paintDoodle, hasDoodle } from "./doodleArt";

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

/**
 * A creature born from a written word. Its body is a doodle, not the child's
 * strokes, so it is baked from path data instead — and given a small per-frame
 * lean so it breathes in the world like the crayon creatures do.
 */
function bakeDoodleSprite(name: string): Sprite {
  const art = 190;
  const pad = 26;
  const w = art + pad * 2;
  const h = w;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const raw = document.createElement("canvas");
    raw.width = w; raw.height = h;
    const rctx = raw.getContext("2d")!;
    // a gentle lean-and-breathe, a quarter turn of the cycle per frame
    const t = (f / 4) * Math.PI * 2;
    rctx.translate(w / 2, h / 2);
    rctx.rotate(Math.sin(t) * 0.035);
    rctx.scale(1 + Math.cos(t) * 0.02, 1 - Math.cos(t) * 0.02);
    rctx.translate(-art / 2, -art / 2);
    paintDoodle(rctx, name, art);

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

export function bakeCrayonSprite(c: Creature): Sprite {
  if (c.doodleId && hasDoodle(c.doodleId)) return bakeDoodleSprite(c.doodleId);
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
