// ─── Turning a drawing into an image ────────────────────────────────────────
// One small canvas helper that has nothing to do with the network: baking a
// child's strokes into a PNG, for the reveal animation and the share card.
//
// This used to live in a `polish.ts` that also talked to an online art model.
// That feature is gone — nothing a child makes ever leaves the device — and
// this one honest, offline helper is what remained.

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
