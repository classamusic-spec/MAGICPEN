// ─── Secondary motion ───────────────────────────────────────────────────────
// The difference between a sprite that moves and a creature that is alive is
// almost never the path it travels — it is everything that trails behind.
// A real tail keeps going after the body stops. Ears swing late. A fish that
// turns bends before it points the new way.
//
// The creatures here are baked as single canvases, so there is no rig to hang
// a tail off. The trick that works anyway is to treat the whole sprite as soft:
// keep a lagged copy of the creature's velocity, and shear/lean/squash the
// sprite by the *difference* between where it is going and where the lag says
// it was going. Nothing trails when the motion is steady; everything trails on
// a start, a stop or a turn — which is exactly when a real animal's parts do.
//
// One object per creature, updated once a frame, no allocation.

export interface Lag {
  /** Followed velocity, in normalized units per second. */
  vx: number;
  vy: number;
  /** Heavier follower — the difference between the two is the whip. */
  wx: number;
  wy: number;
  /** Current shear, lean and squash, themselves eased so nothing snaps. */
  shear: number;
  lean: number;
  squash: number;
}

export const newLag = (): Lag => ({ vx: 0, vy: 0, wx: 0, wy: 0, shear: 0, lean: 0, squash: 0 });

/** Frame-rate independent approach factor. */
const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt);

/**
 * How much trail a kind of movement should have. A jellyfish is nearly all
 * trail; a UFO is rigid and should have almost none, or it stops reading as a
 * machine. Anything unlisted gets a modest default.
 */
const WEIGHT: Record<string, number> = {
  swim: 1.15, jet: 1.5, fly: 1.0, float: 1.2, sway: 1.3, crawl: 1.1,
  bounce: 0.9, waddle: 0.85, graze: 0.7, scuttle: 0.6, drive: 0.4,
  stomp: 0.5, orbit: 0.45, streak: 0.8, hover: 0.15, twinkle: 0.3,
  grow: 0.5, erupt: 0.2,
};

export const lagWeight = (behavior: string) => WEIGHT[behavior] ?? 0.8;

/**
 * Advance one creature's trailing state.
 *
 * `dx`/`dy` are how far it moved this frame in normalized world units, `dt` the
 * frame time, `w` the behaviour's weight from `lagWeight`, and `calm` a 0..1
 * scale (0 when the viewer asked for reduced motion).
 */
export function updateLag(l: Lag, dx: number, dy: number, dt: number, w: number, calm = 1): void {
  if (dt <= 0) return;
  const inv = 1 / dt;
  const vx = dx * inv;
  const vy = dy * inv;

  // two followers at different weights; their gap is the whip
  const kFast = approach(dt, 14);
  const kSlow = approach(dt, 4.5);
  l.vx += (vx - l.vx) * kFast;
  l.vy += (vy - l.vy) * kFast;
  l.wx += (vx - l.wx) * kSlow;
  l.wy += (vy - l.wy) * kSlow;

  const whipX = l.vx - l.wx;
  const whipY = l.vy - l.wy;

  // The tail lags *behind* the direction of travel, so the shear opposes the
  // whip. Clamped hard: past about a fifth of the sprite it stops reading as
  // a tail and starts reading as a rendering bug.
  const targetShear = clampTo(-whipX * 2.1 * w * calm, 0.2);
  const targetLean = clampTo(whipX * 0.55 * w * calm, 0.26);
  // rising = stretch, settling = squash; this is what sells a landing
  const targetSquash = clampTo(whipY * 0.9 * w * calm, 0.16);

  const ease = approach(dt, 9);
  l.shear += (targetShear - l.shear) * ease;
  l.lean += (targetLean - l.lean) * ease;
  l.squash += (targetSquash - l.squash) * ease;
}

function clampTo(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}

/**
 * Apply the trail to the canvas, around the sprite's own centre. Call between
 * `translate` to the creature and drawing it; the caller keeps the save/restore
 * so this never leaks transform state.
 *
 * `h` is the sprite's drawn height, used to anchor the shear at the feet so a
 * standing creature's head trails and its feet stay planted.
 */
export function applyLag(ctx: CanvasRenderingContext2D, l: Lag, h: number, grounded: boolean): void {
  if (grounded) ctx.translate(0, h * 0.5);
  // shear x by y: the further from the anchor, the further it trails
  ctx.transform(1, 0, l.shear, 1, 0, 0);
  ctx.rotate(l.lean);
  ctx.scale(1 - l.squash, 1 + l.squash);
  if (grounded) ctx.translate(0, -h * 0.5);
}
