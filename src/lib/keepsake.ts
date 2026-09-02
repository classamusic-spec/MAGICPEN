// ─── One drawing, on a page ─────────────────────────────────────────────────
// The thing every parent actually wants out of a drawing app: the drawing, at
// a size worth taping up. This paints it — the strokes re-drawn at print
// resolution onto paper stock, so it comes out as art rather than as a
// photograph of an app.
//
// Two things ask for this page and they want slightly different versions of
// it. The printer takes the art alone, because the name underneath it is
// crisper set as real text on the sheet. The share sheet takes the whole
// keepsake, lettering included, because a PNG is all it gets — a caption that
// lives in the DOM would simply be missing from the picture.

import type { Stroke } from "./types";
import { normalizeStrokes } from "./crayon";
import { drawStroke } from "./brushes";
import { paperTile } from "./ink";
import { paintDoodle } from "./doodleArt";

export interface Keepsake {
  strokes: Stroke[];
  /** Word-born and stamped creatures: the body is this doodle, not strokes. */
  doodleId?: string;
  /** Set only when the lettering has to be *in* the picture. */
  caption?: { name: string; subtitle: string };
}

/** Paint at a size that stays crisp on paper rather than on a screen. */
export const KEEPSAKE_PX = 1000;

/** The warm stock the rest of the app is drawn on. */
function paintPaper(ctx: CanvasRenderingContext2D, px: number, fibre: HTMLImageElement | null): void {
  ctx.fillStyle = "#fdf6e8";
  ctx.fillRect(0, 0, px, px);
  if (!fibre) return;
  const pat = ctx.createPattern(fibre, "repeat");
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, px, px); }
}

/**
 * The drawing itself, centred on the page.
 *
 * A captioned page gives the drawing less of the sheet and sits it higher:
 * at the full size a tall drawing reaches within a few pixels of where the
 * name is set, and a keepsake whose lettering crosses the tail is not one.
 * The printed page keeps the full size, because there the name is set on the
 * sheet below the picture rather than inside it.
 */
function paintArt(ctx: CanvasRenderingContext2D, px: number, k: Keepsake): void {
  const captioned = Boolean(k.caption);
  const box = px * (captioned ? 0.66 : 0.78);
  const midY = px * (captioned ? 0.44 : 0.5);
  if (k.strokes.length) {
    const norm = normalizeStrokes(k.strokes, box);
    ctx.save();
    // `normalizeStrokes` centres on the origin, so this lands it on the page
    ctx.translate(px / 2, midY);
    norm.strokes.forEach((s, i) => drawStroke(ctx, s, i + 1, 1));
    ctx.restore();
  } else if (k.doodleId) {
    // a doodle-bodied creature prints its doodle, as the header promises
    const dbox = px * (captioned ? 0.6 : 0.7);
    ctx.save();
    ctx.translate((px - dbox) / 2, midY - dbox / 2);
    paintDoodle(ctx, k.doodleId, dbox);
    ctx.restore();
  }
  // neither: the page keeps the name, which is still worth keeping
}

/** The name and the day, set under the drawing. */
function paintCaption(ctx: CanvasRenderingContext2D, px: number, name: string, subtitle: string): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#2d2926";
  ctx.font = `700 ${Math.round(px * 0.066)}px "Baloo 2", ui-rounded, system-ui, sans-serif`;
  ctx.fillText(name, px / 2, px * 0.905, px * 0.86);
  ctx.fillStyle = "#6b5f52";
  ctx.font = `600 ${Math.round(px * 0.034)}px "Baloo 2", ui-rounded, system-ui, sans-serif`;
  ctx.fillText(subtitle, px / 2, px * 0.951, px * 0.86);
  ctx.fillText("drawn with Drawlings", px / 2, px * 0.987, px * 0.86);
  ctx.restore();
}

/**
 * Paint one keepsake onto a square context.
 *
 * The paper fibre is an image that has to load, so this resolves once the page
 * is actually complete — a caller that raced it would share a blank sheet.
 * A fibre that never loads is not worth failing over: the flat stock beneath
 * it is the same colour, so the page is painted either way.
 */
export function paintKeepsake(
  ctx: CanvasRenderingContext2D,
  px: number,
  k: Keepsake,
): Promise<void> {
  return new Promise((resolve) => {
    const finish = (fibre: HTMLImageElement | null) => {
      paintPaper(ctx, px, fibre);
      paintArt(ctx, px, k);
      if (k.caption) paintCaption(ctx, px, k.caption.name, k.caption.subtitle);
      resolve();
    };
    const img = new Image();
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = paperTile();
  });
}

/** The whole keepsake as a PNG, lettering and all — what the share sheet gets. */
export async function keepsakeFile(k: Keepsake, filename: string): Promise<File | null> {
  const cv = document.createElement("canvas");
  cv.width = KEEPSAKE_PX;
  cv.height = KEEPSAKE_PX;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  await paintKeepsake(ctx, KEEPSAKE_PX, k);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
  return blob ? new File([blob], filename, { type: "image/png" }) : null;
}
