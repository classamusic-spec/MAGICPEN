// ─── Shared creature sprite baking ───────────────────────────────────────────
// Turns a creature's crayon strokes into 4 wiggle-phase sticker frames.

import type { BehaviorKind, Creature } from "./types";
import { kindById } from "./creatures";
import { normalizeStrokes, drawStrokeFull, strokesBounds } from "./crayon";
import { paintDoodle, hasDoodle } from "./doodleArt";

export interface Sprite { frames: HTMLCanvasElement[]; w: number; h: number }

/**
 * Silhouette of a canvas filled with a solid color (for sticker outlines).
 *
 * `source-in` keeps the source's *alpha*, which is exactly right for wax and
 * exactly wrong for watercolour: a transparent, feathered wash would hand back
 * a transparent, feathered silhouette, and `stampRing` stamps that ten times —
 * so a watercolour creature would wear a murky halo instead of a clean edge.
 *
 * Drawing the source several times first drives the shape opaque before it is
 * filled, which costs nothing on an already-solid crayon and rescues the paint.
 * A soft edge is still soft; it simply stops being see-through.
 */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d")!;
  for (let i = 0; i < 5; i++) ctx.drawImage(src, 0, 0);
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

/* ── how alive a stamp is allowed to be ───────────────────────────────────
   A doodle is path data, which means every fin and wheel of it could be
   animated separately. It must not be. The whole premise of this app is that
   the drawing a four-year-old made is the good one — and if a stamped fish
   swims better than the fish they drew, the app has quietly told them their
   own work is the inferior option. So a stamp gets what a drawing gets and no
   more: whole-body motion, in tiers keyed on the same behaviours, tuned to
   land *under* what the crayon path manages rather than over it.

   These numbers were measured, not chosen. Bake both sprites, fit each frame
   into the same box, and take the mean absolute pixel difference between
   consecutive frames — that is "how much moves, per frame". Against a spread
   of plausible drawn fish (a traced one at three crayon widths, a freehand
   scribble, a small one, one coloured in) the drawings score 8.8 to 13.9 and
   the stamped fish scores 6.2: half again as lively as the 4.6 it used to be,
   and still below the least lively fish a child is likely to hand it. A drawn
   snake — one long thin line, the least ink a drawing can be — scores 6.1 to
   8.3, and the stamped snake's 7.3 sits just under the middle of that band.
   That is the tightest pairing there is, and the first one to re-measure if
   any of these are raised.

   One honest caveat, because it will look like a bug to whoever measures next:
   a drawing made of many *short* strokes barely moves at all, since the crayon
   wiggle ramps up along the length of each stroke. A drawn crab of ten stubby
   legs scores 4.7 while the crab doodle, a single dense body, scores 12.2 —
   and scored 9.6 before this change ever landed. No single whole-body
   amplitude fixes that pairing; only per-stroke deformation would, and a stamp
   has no strokes. It is noted here rather than tuned around. */

/** Whole-body lean, in radians, at the top tier. */
const DOODLE_LEAN = 0.048;
/** Squash and stretch, as a fraction, at the top tier. Deliberately
 *  volume-preserving — `(1 + k, 1 - k)` — because a body that widens without
 *  shortening does not breathe, it inflates. */
const DOODLE_BREATHE = 0.028;
/** A shear across the body, at the top tier: the top half leaning against the
 *  bottom half a quarter-beat after the lean. This is what turns a tilt into
 *  an undulation, and it is still one transform on one whole body — there is
 *  no fin in here, and there must never be. */
const DOODLE_FLEX = 0.02;

/**
 * How much a stamp of this behaviour moves, as a fraction of the top tier.
 *
 * The same three tiers, split on the same behaviours, as the crayon path's
 * `amp` below — swimmers and crawlers undulate most, fliers less, everything
 * else just breathes. Not the crayon path's own 7/4/2 though, and that is
 * deliberate: those are pixels of per-stroke deformation and these are a whole
 * body turning, so the two only line up once both are measured. Measured, a
 * stamped bird lands at 4.3 against drawn birds at 6.1 to 9.5 — and the
 * resting tier came *down* from where it shipped, because at the old fixed
 * 0.035 a stamped cake scored 6.0 against a drawn cake's 4.3. A stamp that
 * only sits there was the one already beating the drawings.
 */
const doodleAmp = (behavior: BehaviorKind): number =>
  behavior === "swim" || behavior === "crawl" ? 1 : behavior === "fly" ? 0.8 : 0.45;

/**
 * A creature born from a written word. Its body is a doodle, not the child's
 * strokes, so it is baked from path data instead — and given the same
 * behaviour-aware wiggle the crayon creatures get, so a stamped fish swims
 * rather than merely tilting.
 */
function bakeDoodleSprite(name: string, behavior: BehaviorKind): Sprite {
  const art = 190;
  const pad = 26;
  const w = art + pad * 2;
  const h = w;
  const amp = doodleAmp(behavior);
  const lean = DOODLE_LEAN * amp;
  const breathe = DOODLE_BREATHE * amp;
  const flex = DOODLE_FLEX * amp;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const raw = document.createElement("canvas");
    raw.width = w; raw.height = h;
    const rctx = raw.getContext("2d")!;
    // lean, flex and breathe — a quarter turn of the cycle per frame, so the
    // four frames are a seamless loop rather than a stutter at the wrap
    const t = (f / 4) * Math.PI * 2;
    const k = Math.cos(t) * breathe;
    rctx.translate(w / 2, h / 2);
    rctx.rotate(Math.sin(t) * lean);
    rctx.transform(1, 0, Math.cos(t) * flex, 1, 0, 0);
    rctx.scale(1 + k, 1 - k);
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
  const kind = kindById(c.kindId);
  if (c.doodleId && hasDoodle(c.doodleId)) return bakeDoodleSprite(c.doodleId, kind.behavior);
  const norm = normalizeStrokes(c.strokes, 150);
  // chunkier lines read better at world scale
  const thick = norm.strokes.map((s) => ({ ...s, size: Math.max(3.5, s.size * 1.6) }));
  const b = strokesBounds(thick);
  const pad = 40;
  const w = Math.ceil(b.w + pad * 2);
  const h = Math.ceil(b.h + pad * 2);
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
