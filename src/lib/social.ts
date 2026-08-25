// ─── Creatures that know each other exist ───────────────────────────────────
// A world where thirty creatures each behave as though they are alone is a
// screensaver with thirty layers. The moment one fish notices another, it stops
// being a loop and starts being a place.
//
// This module holds nothing but the *rules* — the sets, the radii, the maths of
// growing up. The steering itself lives in the render loop, because that is
// where the per-creature state lives and where an allocation would cost a
// frame. Keeping the numbers out here means the loop reads as behaviour rather
// than as arithmetic, and means the tuning is in one place when it turns out
// the fish school too tightly.
//
// Two rules govern everything below, and both are about who is playing this:
//
//   Nothing is ever eaten, hurt, or taken away. A shark makes small fish
//   scatter and then drift back, the way a big kid running through a playground
//   does. It is tag, not predation.
//
//   Coming back is rewarded; staying away is never punished. Growth is earned
//   by *visits*, so a creature left alone for a month is exactly as it was, not
//   sad, not shrunken, not asking for anything.

/** Kinds everyone smaller gives a wide, delighted berth. */
export const BIG = new Set([
  "shark", "whale", "trex", "triceratops", "longneck", "stegosaurus",
]);

/**
 * Behaviours that may be nudged by their neighbours.
 *
 * Left out on purpose: `grow`, `erupt` and `sway` have roots, and a tree
 * strolling across the meadow towards its friend is the single funniest bug
 * this feature could ship. `orbit` is welded to its ring and `hover` to its
 * station, and `streak` is a comet mid-dash — nudging any of the three fights
 * the state machine that owns it. Rooted creatures still make friends; they
 * lean towards them and sparkle instead of walking over.
 */
export const SOCIAL = new Set([
  "swim", "fly", "float", "twinkle", "crawl", "drive",
  "bounce", "jet", "scuttle", "stomp", "waddle", "graze",
]);

/* ── how close is close ───────────────────────────────────────────────────
   All distances are in normalized world units (0..1 across the canvas), and
   every comparison in the loop is done squared so nothing has to take a root.
   The separation radius is deliberately smaller than the schooling radius: a
   school that pulls harder than it pushes collapses into one flickering pile,
   and one that pushes harder than it pulls simply spreads out — which is the
   failure mode you cannot see. */

/**
 * The smallest gap two creatures will settle at, as a floor.
 *
 * A fixed number cannot be the whole answer, and finding out why was the most
 * useful mistake in this file. `SEP` *is* the spacing of a settled school — it
 * is where the pushing apart and the pulling together balance — so it has to
 * be wider than the creatures are drawn or the school is a heap of overlapping
 * sprites. But how wide a creature is *in these units* depends on the screen:
 * a sprite is drawn at `scale × min(W,H)/520` pixels and then measured against
 * the width, so the same fish is about a tenth of a landscape tablet and a
 * quarter of an upright phone. One constant tuned on one of those is wrong on
 * the other, and 0.115 — tuned in landscape — piles fish up on a phone.
 *
 * So the pass asks `sepFor` how far apart *these two* should sit, and this is
 * only the floor beneath it, for the very small. The floor stays at the value
 * that was measured to look right in landscape: below it a school reads as
 * loose rather than as a pile, which is the safer way to be wrong.
 */
export const SEP = 0.115;
export const SEP2 = SEP * SEP;

/** The box `bakeCrayonSprite` normalizes every drawing into. */
const SPRITE_BOX = 150;
/** The screen size the world's `sizeF` is measured against. */
const SIZE_REF = 520;

/**
 * How wide one creature is drawn, in the same normalized-x units the neighbour
 * pass measures distance in. `scale` is the creature's own, already multiplied
 * by whatever growing up has earned it.
 */
export const drawnWidth = (scale: number, W: number, H: number): number =>
  (SPRITE_BOX * scale * (Math.min(W, H) / SIZE_REF)) / Math.max(1, W);

/** A little less than touching: a school sits shoulder to shoulder, not apart. */
export const SEP_SNUG = 0.78;

/**
 * How close these two may get, given how big each is drawn. Never below `SEP`,
 * so two very small creatures still keep a gap worth seeing.
 */
export const sepFor = (wA: number, wB: number): number =>
  Math.max(SEP, (wA + wB) * 0.5 * SEP_SNUG * 2);
/** Same-kind cohesion and alignment reach this far. */
export const SCHOOL = 0.3;
export const SCHOOL2 = SCHOOL * SCHOOL;
/** How far a big creature's cheerful shadow falls. */
export const SCARE = 0.26;
export const SCARE2 = SCARE * SCARE;

/** Steering weights, as a fraction of the creature's own cruising speed. */
export const W_SEP = 0.9;
export const W_COH = 0.28;
export const W_ALIGN = 0.22;
export const W_FLEE = 1.5;
export const W_PAL = 0.3;
/** No steering may ever exceed this multiple of a creature's own speed, so a
 *  scatter stacked on an excited tap can never turn into a rocket. */
export const STEER_CAP = 0.6;

/** Seconds of scatter charge, and how fast it bleeds away. */
export const FLEE_DECAY = 0.4;   // ≈2.5s from full to nothing

/* ── friendship ───────────────────────────────────────────────────────────
   One candidate per creature rather than a pair table: at thirty creatures a
   table is 435 numbers to keep and to persist, and a single `near`/`nearT` slot
   says the same thing for four bytes. Drifting apart halves the accumulated
   time rather than resetting it, so two creatures that keep bumping into each
   other across several visits still get there — which is how it actually
   happens. */

/** Seconds of proximity before two creatures are friends. */
export const FRIEND_SECS = 90;
/** Proximity accrues faster than real time — 90 "seconds" is about 25 real. */
export const FRIEND_RATE = 4;

/* ── food ─────────────────────────────────────────────────────────────────── */

/** How far a crumb calls. Inside this, it beats schooling. */
export const FOOD = 0.35;
export const FOOD2 = FOOD * FOOD;
/** Close enough to have eaten it. */
export const FOOD_EAT = 0.03;
/** A crumb nobody came for fades away rather than sitting there forever. */
export const FOOD_LIFE = 12;
/** How many crumbs can be in the water at once; a new one replaces the oldest,
 *  which caps a four-year-old drumming on the glass without ever saying no. */
export const FOOD_MAX = 6;

/* ── growing up ───────────────────────────────────────────────────────────
   `care` is the only number this whole feature persists. Everything visible is
   derived from it, so there is no growth state to migrate, to get out of step,
   or to corrupt: an old creature with no `care` field reads as 0 and is exactly
   the size it has always been.

   The curve is deliberately front-loaded. The first visit back is visibly
   worth something; the twentieth is not, because a creature that keeps growing
   forever ends up as a wall. It saturates at 1.5× over two or three weeks of
   coming back — and 1.5× is also, not by coincidence, about as far as a baked
   sprite can be scaled up before the crayon edge starts to look soft. */

export const CARE_PER_DAY = 1;      // the main driver: one per day *seen*
export const CARE_PER_HI = 0.25;    // …a tap hello
export const CARE_HI_CAP = 3;       // …up to a dozen of them per session
export const CARE_PER_TRICK = 0.5;  // …a trick performed
export const CARE_PER_FOOD = 0.5;   // …a crumb eaten
export const CARE_PER_FRIEND = 1;   // …the day it made a friend

/** How much bigger a fully grown creature gets. 1.5× at the ceiling. */
export const GROWTH = 0.5;

/** 0 → 1, how grown up. Front-loaded, saturating. */
export const grownFrom = (care: number | undefined): number =>
  care && care > 0 ? 1 - Math.exp(-care / 8) : 0;

/** The multiplier to apply to a creature's drawn scale. 1 → 1.5. */
export const growthScale = (care: number | undefined): number =>
  1 + GROWTH * grownFrom(care);

/* ── tricks ───────────────────────────────────────────────────────────────
   Four of them, picked once per creature from its own seed so a given fish
   always does *its* trick — the one the child learns to expect. Deliberately
   not a nineteenth `BehaviorKind`: a trick is a moment laid over whatever the
   creature was already doing, not another way of being alive, and adding it to
   that union would mean a branch in eighteen places that all had to agree. */

export const TRICK_SPIN = 0;
export const TRICK_FLIP = 1;
export const TRICK_BOUNCE = 2;
export const TRICK_TWIRL = 3;

/** Seconds each trick runs for. */
export const TRICK_DUR = [0.9, 0.75, 0.7, 1.1];
/** A creature will not start a new trick within this many seconds of the last,
 *  so a child tapping happily reads as enthusiasm rather than a stuck loop. */
export const TRICK_COOLDOWN = 6;

/** What a trick looks like: a lie about the creature's transform, for `u` in
 *  0..1 through it. Returned through the caller's own slots — no allocation. */
export interface TrickPose { dx: number; dy: number; rot: number; sx: number; sy: number }

/**
 * Pose one creature mid-trick. `calm` scales everything down to nothing for a
 * viewer who asked for reduced motion, so the trick still *happens* — the name
 * tag, the sparkle, the care — it simply stops throwing the sprite about.
 */
export function trickPose(out: TrickPose, kind: number, u: number, calm = 1): void {
  const arc = Math.sin(Math.PI * u);          // 0 → 1 → 0
  out.dx = 0; out.dy = 0; out.rot = 0; out.sx = 1; out.sy = 1;
  if (kind === TRICK_SPIN) {
    out.rot = u * Math.PI * 2 * calm;
    out.sy = 1 - 0.08 * arc * calm;
  } else if (kind === TRICK_FLIP) {
    out.dy = -34 * arc * calm;
    out.rot = -u * Math.PI * 2 * calm;
  } else if (kind === TRICK_BOUNCE) {
    // squash, launch, squash: the whole charm is in the anticipation
    const s = u < 0.28 ? u / 0.28 : 0;
    const air = u < 0.28 ? 0 : Math.sin(Math.PI * ((u - 0.28) / 0.72));
    out.dy = -46 * air * calm;
    out.sx = 1 + (0.22 * s - 0.1 * air) * calm;
    out.sy = 1 - (0.22 * s - 0.1 * air) * calm;
  } else {
    // a slow twirl on the spot, leaning into it
    out.rot = Math.sin(u * Math.PI * 2) * 0.5 * calm;
    out.dy = -12 * arc * calm;
    out.sx = 1 + 0.1 * arc * calm;
  }
}

/* ── the states in between ────────────────────────────────────────────────
   A trick is an event: something happens, it takes three quarters of a second,
   it ends. Most of what a creature *is* is not an event — it is asleep, or it
   has just reached a crumb, or it has been crowned. Those wanted the same
   vocabulary as `trickPose` and none of them wanted its shape, so they are
   three more poses written to the same contract rather than three more entries
   in `TRICK_DUR`.

   The contract, in full, because every one of these runs sixty times a second
   for every creature on screen:

     · the pose is written into the caller's own `TrickPose` slot and nothing
       is returned — no `{dx, dy, …}` per creature per frame;
     · `calm` scales the whole thing to nothing, so a viewer who asked for
       reduced motion still *sleeps*, still *eats*, still gets crowned, and
       simply is not thrown about while it happens;
     · nothing here knows what a fin is. These run on a four-year-old's
       three-stroke scribble and on a vector doodle, and the only way that can
       be true is if they move the whole body and never a part of it.
*/

/** How long one breath takes, asleep. Slow enough to read as sleeping rather
 *  than as panting: a child's own resting breath is about this. */
export const SLEEP_PERIOD = 3.4;
/** Precomputed so the per-frame path has no division in it. */
const SLEEP_W = (Math.PI * 2) / SLEEP_PERIOD;
/** How far a sleeping creature settles below where it was standing, in sprite
 *  pixels — small on purpose, since the sprite is drawn about its centre. */
const SLEEP_SETTLE = 2.6;
/** How much the body swells on the in-breath. Volume-preserving: it widens by
 *  exactly as much as it shortens, so a sleeping creature never inflates. */
const SLEEP_BREATH = 0.045;

/**
 * Asleep: a slow breath and a slight settle downward.
 *
 * Unlike a trick this takes absolute seconds rather than a 0..1 progress,
 * because sleeping is a state and not an event — there is no end to be part of
 * the way towards. Pass the world clock plus the creature's own `phase` and a
 * row of sleeping creatures breathes out of step, which is the difference
 * between a nap and a chorus line.
 */
export function sleepPose(out: TrickPose, t: number, calm = 1): void {
  const breath = Math.sin(t * SLEEP_W);       // -1 → 1 → -1, once per period
  const k = SLEEP_BREATH * breath * calm;
  out.dx = 0;
  out.rot = 0;
  out.sx = 1 + k;
  out.sy = 1 - k;
  // sinks a little, and lowest at the bottom of the breath
  out.dy = (SLEEP_SETTLE - 1.2 * breath) * calm;
}

/** Seconds one bout of chewing runs for. Short: it is punctuation on reaching
 *  a crumb, not a meal. */
export const NIBBLE_DUR = 0.5;
/** Chews per bout. Three reads as eating; one reads as a hiccup. */
const NIBBLE_CHEWS = 3;
/** How hard each chew squashes the body. */
const NIBBLE_SQUASH = 0.075;

/**
 * A treat has been reached: a few quick small squashes, `u` in 0..1.
 *
 * The envelope is a half-sine, so the first chew grows out of whatever the
 * creature was doing and the last one dies back into it — a bout that started
 * and stopped at full squash would pop twice per crumb.
 */
export function nibblePose(out: TrickPose, u: number, calm = 1): void {
  const p = u * Math.PI * 2 * NIBBLE_CHEWS;
  const fade = Math.sin(Math.PI * u);         // 0 → 1 → 0
  const bite = -Math.cos(p) * fade;           // +1 mid-chomp, -1 mid-open
  const k = NIBBLE_SQUASH * bite * calm;
  out.dx = 0;
  out.dy = 2.2 * bite * calm;                 // dips into the crumb as it closes
  out.rot = 0.05 * Math.sin(p) * fade * calm; // …and nods, a quarter beat behind
  out.sx = 1 + k;
  out.sy = 1 - k;
}

/** Seconds a celebration runs for. */
export const CELEBRATE_DUR = 0.8;
/** How high the first hop goes, in sprite pixels. */
const CELEBRATE_HOP = 34;

/**
 * Finished a lesson, or been crowned: a double hop with a wiggle in it.
 *
 * Deliberately not shaped like `TRICK_BOUNCE`. That one is squash → launch →
 * squash: it spends its first third crouching, and all of its charm is in the
 * anticipation. This is already in the air on the first frame and hops twice,
 * the second lower than the first, stretching rather than squashing. The two
 * have to be told apart at a glance, because one of them means "watch this"
 * and the other means "you did it".
 */
export function celebratePose(out: TrickPose, u: number, calm = 1): void {
  const hop = Math.abs(Math.sin(Math.PI * 2 * u));  // two arcs, feet down between
  const lift = hop * (1 - 0.45 * u);                // …the second one smaller
  out.dx = Math.sin(u * Math.PI * 4) * 3.5 * calm;  // a sway, one per hop
  out.dy = -CELEBRATE_HOP * lift * calm;
  out.rot = Math.sin(u * Math.PI * 6) * 0.18 * calm;
  out.sx = 1 - 0.06 * lift * calm;                  // stretched by the rising,
  out.sy = 1 + 0.06 * lift * calm;                  // not squashed by a crouch
}
