// Two kinds of thing are pinned here.
//
// The growth curve, because it is the only persisted consequence of coming
// back and a child would notice it going wrong long before we would.
//
// And two invariants that are not obvious from reading either constant on its
// own, each of which produced a real bug when it was violated: separation must
// out-pull cohesion, or a school collapses into one flickering pile; and the
// separation radius must be wider than a creature is drawn, or a settled
// school is a heap of overlapping sprites. The second one shipped and had to
// be found by rendering five fish and looking at them.

import { describe, expect, it } from "vitest";
import {
  BIG, SOCIAL, SEP, SCHOOL, SEP2, SCHOOL2, W_SEP, W_COH, STEER_CAP,
  drawnWidth, sepFor,
  GROWTH, grownFrom, growthScale, trickPose, TRICK_DUR, TRICK_BOUNCE, type TrickPose,
  sleepPose, nibblePose, celebratePose, SLEEP_PERIOD, NIBBLE_DUR, CELEBRATE_DUR,
} from "./social";

describe("growing up", () => {
  it("is nothing at all before the child has been back", () => {
    expect(grownFrom(0)).toBe(0);
    expect(grownFrom(undefined)).toBe(0);
    expect(growthScale(undefined)).toBe(1);
  });

  it("only ever grows, and never past the ceiling", () => {
    let last = -1;
    for (const care of [0, 1, 2, 5, 10, 20, 50, 200, 10_000]) {
      const k = growthScale(care);
      expect(k).toBeGreaterThanOrEqual(last);
      expect(k).toBeLessThanOrEqual(1 + GROWTH);
      last = k;
    }
    // 1.5x is where a baked crayon sprite starts to look soft
    expect(growthScale(10_000)).toBeCloseTo(1.5, 3);
  });

  it("is front-loaded: the first days back are worth the most", () => {
    const early = growthScale(3) - growthScale(0);
    const late = growthScale(23) - growthScale(20);
    expect(early).toBeGreaterThan(late * 4);
  });

  it("is visible after a couple of visits, and most of the way there in a fortnight", () => {
    expect(growthScale(2) - 1).toBeGreaterThan(0.1);
    expect(grownFrom(14)).toBeGreaterThan(0.8);
  });

  it("shrugs off nonsense rather than exploding", () => {
    expect(growthScale(-5)).toBe(1);
  });
});

describe("the steering invariants", () => {
  it("pushes apart harder than it pulls together", () => {
    // otherwise a school converges to a single point and flickers
    expect(W_SEP).toBeGreaterThan(W_COH);
  });

  it("keeps creatures further apart than they are drawn, on every screen", () => {
    /* This is the invariant a fixed `SEP` could not hold. `sepFor` is where a
       settled school ends up, so on any screen it must exceed the width of the
       two creatures involved — otherwise they overlap. An upright phone is the
       case that broke: the same fish is a quarter of its width and a tenth of
       a landscape tablet's. */
    const SCREENS: [string, number, number][] = [
      ["phone", 390, 844], ["small phone", 320, 568],
      ["landscape", 740, 360], ["tablet", 820, 1180],
    ];
    for (const [, W, H] of SCREENS) {
      for (const scale of [0.4, 0.75, 0.9, 1.2, 1.2 * 1.5 /* fully grown */]) {
        const w = drawnWidth(scale, W, H);
        expect(sepFor(w, w)).toBeGreaterThan(w);
      }
    }
  });

  it("still keeps two tiny creatures a visible gap apart", () => {
    expect(sepFor(0.001, 0.001)).toBe(SEP);
  });

  it("lets a school gather from further off than it repels", () => {
    expect(SCHOOL).toBeGreaterThan(SEP);
    expect(SEP2).toBeCloseTo(SEP * SEP, 10);
    expect(SCHOOL2).toBeCloseTo(SCHOOL * SCHOOL, 10);
  });

  it("caps steering below a creature's own pace, so nothing becomes a rocket", () => {
    expect(STEER_CAP).toBeGreaterThan(0);
    expect(STEER_CAP).toBeLessThan(1);
  });

  it("never steers anything with roots", () => {
    for (const rooted of ["grow", "erupt", "sway"]) expect(SOCIAL.has(rooted)).toBe(false);
    // …nor anything welded to a ring, a station or a dash
    for (const fixed of ["orbit", "hover", "streak"]) expect(SOCIAL.has(fixed)).toBe(false);
  });

  it("only calls a creature big if it is one", () => {
    for (const big of ["shark", "whale", "trex"]) expect(BIG.has(big)).toBe(true);
    for (const small of ["fish", "crab", "chicken", "star"]) expect(BIG.has(small)).toBe(false);
  });
});

describe("tricks", () => {
  const out: TrickPose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

  it("starts and finishes exactly where the creature was standing", () => {
    for (let k = 0; k < 4; k++) {
      trickPose(out, k, 0);
      expect(Math.abs(out.dx)).toBeLessThan(0.001);
      expect(Math.abs(out.dy)).toBeLessThan(0.001);
      trickPose(out, k, 1);
      expect(Math.abs(out.dy)).toBeLessThan(0.001);
      expect(out.sx).toBeCloseTo(1, 3);
      expect(out.sy).toBeCloseTo(1, 3);
    }
  });

  it("actually does something in the middle", () => {
    for (let k = 0; k < 4; k++) {
      trickPose(out, k, 0.5);
      const moved = Math.abs(out.dx) + Math.abs(out.dy) + Math.abs(out.rot)
        + Math.abs(out.sx - 1) + Math.abs(out.sy - 1);
      expect(moved).toBeGreaterThan(0.05);
    }
  });

  it("stands still for a viewer who asked for less motion, and still counts", () => {
    for (let k = 0; k < 4; k++) {
      trickPose(out, k, 0.5, 0);
      expect(out.dx).toBeCloseTo(0, 6);
      expect(out.dy).toBeCloseTo(0, 6);
      expect(out.rot).toBeCloseTo(0, 6);
      expect(out.sx).toBeCloseTo(1, 6);
      expect(out.sy).toBeCloseTo(1, 6);
    }
  });

  it("has a length for every trick it can pick", () => {
    expect(TRICK_DUR).toHaveLength(4);
    for (const d of TRICK_DUR) expect(d).toBeGreaterThan(0.5);
  });
});

describe("the states in between", () => {
  /* These three run on every creature on screen, sixty times a second, and the
     thing most likely to go wrong about them is not the maths — it is a `{}`
     appearing in the middle of the hot path. That cannot be caught by weighing
     the heap: V8's escape analysis deletes a short-lived temporary before it is
     ever allocated, so a deliberately allocating version of one of these
     measures the same as a clean one. What can be pinned is the shape of the
     contract, so it is pinned hard: the caller's slot is *sealed*, which turns
     any stray property into a thrown TypeError, and nothing may be handed back. */

  const slot: TrickPose = Object.seal({ dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 });

  /** Every pose, with the span of its argument: seconds for the continuous one,
   *  0..1 for the timed ones, each stretched a frame past either end because a
   *  render loop lands on 1.004 as often as it lands on 1. */
  type Pose = (o: TrickPose, x: number, calm?: number) => void;
  const POSES: [string, Pose, number, number][] = [
    ["sleep", sleepPose, -SLEEP_PERIOD * 2, SLEEP_PERIOD * 3],
    ["nibble", nibblePose, -0.05, 1.05],
    ["celebrate", celebratePose, -0.05, 1.05],
  ];
  /** The i-th of n samples across one pose's span. */
  const at = (lo: number, hi: number, i: number, n: number): number => lo + ((hi - lo) * i) / n;

  it("writes into the caller's slot and hands nothing back", () => {
    for (const [, pose] of POSES) {
      const before = slot;
      expect(pose(slot, 0.4)).toBeUndefined();
      expect(slot).toBe(before);
      expect(Object.keys(slot).sort()).toEqual(["dx", "dy", "rot", "sx", "sy"]);
    }
  });

  it("puts nothing on the slot it was not asked to", () => {
    // `slot` is sealed: a pose that grew a sixth field would throw here
    for (const [, pose, lo, hi] of POSES) {
      for (let i = 0; i <= 40; i++) expect(() => pose(slot, at(lo, hi, i, 40))).not.toThrow();
    }
  });

  it("stands perfectly still for a viewer who asked for less motion", () => {
    for (const [, pose, lo, hi] of POSES) {
      for (let i = 0; i <= 40; i++) {
        pose(slot, at(lo, hi, i, 40), 0);
        expect(slot.dx).toBeCloseTo(0, 9);
        expect(slot.dy).toBeCloseTo(0, 9);
        expect(slot.rot).toBeCloseTo(0, 9);
        expect(slot.sx).toBeCloseTo(1, 9);
        expect(slot.sy).toBeCloseTo(1, 9);
      }
    }
  });

  it("stays finite, and stays a size a creature could actually be", () => {
    /* The failure that matters is a scale reaching zero or going negative: a
       sprite drawn at -0.2 is inside out, and one at 0 vanishes for a frame. */
    for (const [name, pose, lo, hi] of POSES) {
      for (let i = 0; i <= 400; i++) {
        pose(slot, at(lo, hi, i, 400));
        for (const v of [slot.dx, slot.dy, slot.rot, slot.sx, slot.sy]) {
          expect(Number.isFinite(v), name).toBe(true);
        }
        expect(Math.abs(slot.dx), name).toBeLessThanOrEqual(5);
        expect(Math.abs(slot.dy), name).toBeLessThanOrEqual(40);
        expect(Math.abs(slot.rot), name).toBeLessThanOrEqual(0.5);
        expect(slot.sx, name).toBeGreaterThan(0.8);
        expect(slot.sx, name).toBeLessThan(1.2);
        expect(slot.sy, name).toBeGreaterThan(0.8);
        expect(slot.sy, name).toBeLessThan(1.2);
      }
    }
  });

  it("keeps a breathing creature the same size overall", () => {
    // squash and stretch, not inflation: what widens has to shorten
    for (let i = 0; i <= 60; i++) {
      sleepPose(slot, (i / 60) * SLEEP_PERIOD);
      expect(Math.abs(slot.sx * slot.sy - 1)).toBeLessThan(0.01);
      nibblePose(slot, i / 60);
      expect(Math.abs(slot.sx * slot.sy - 1)).toBeLessThan(0.01);
    }
  });

  it("sleeps on the clock, not on a countdown: same phase, same pose", () => {
    /* Sleeping is a state and has no end to be part of the way towards, so it
       is driven by absolute seconds — which only works if it is exactly
       periodic and does not drift after an afternoon of running. */
    for (const t of [0, 0.7, 1.9, 3.1]) {
      sleepPose(slot, t);
      const first = { ...slot };
      for (const laps of [1, 5, 1000]) {
        sleepPose(slot, t + SLEEP_PERIOD * laps);
        expect(slot.dy).toBeCloseTo(first.dy, 4);
        expect(slot.sx).toBeCloseTo(first.sx, 4);
        expect(slot.sy).toBeCloseTo(first.sy, 4);
      }
    }
  });

  it("never stops breathing: there is no frame where a sleeper is doing nothing", () => {
    for (let i = 0; i <= 120; i++) {
      sleepPose(slot, (i / 120) * SLEEP_PERIOD);
      const moved = Math.abs(slot.dy) + Math.abs(slot.sx - 1) + Math.abs(slot.sy - 1);
      expect(moved).toBeGreaterThan(0.01);
    }
    // and it takes a slow breath, not a panicked one
    expect(SLEEP_PERIOD).toBeGreaterThanOrEqual(3);
    expect(SLEEP_PERIOD).toBeLessThanOrEqual(4);
  });

  it("starts and finishes the timed poses exactly where the creature was standing", () => {
    for (const pose of [nibblePose, celebratePose]) {
      for (const u of [0, 1]) {
        pose(slot, u);
        expect(Math.abs(slot.dx)).toBeLessThan(0.001);
        expect(Math.abs(slot.dy)).toBeLessThan(0.001);
        expect(Math.abs(slot.rot)).toBeLessThan(0.001);
        expect(slot.sx).toBeCloseTo(1, 3);
        expect(slot.sy).toBeCloseTo(1, 3);
      }
    }
  });

  it("chews more than once, and is over before the crumb is forgotten", () => {
    let squashes = 0;
    let last = 0;
    for (let i = 1; i < 200; i++) {
      nibblePose(slot, i / 200);
      const s = slot.sx - 1;
      if (last > 0 && s <= 0) squashes++;   // a chew closed and opened again
      last = s;
    }
    expect(squashes).toBeGreaterThanOrEqual(2);
    expect(NIBBLE_DUR).toBeGreaterThan(0.2);
    expect(NIBBLE_DUR).toBeLessThanOrEqual(0.6);
  });

  it("celebrates in a way nobody could mistake for the bounce trick", () => {
    /* `TRICK_BOUNCE` is squash → launch → squash: one arc, and a crouch first.
       A celebration is two hops and no crouch. One means "watch this" and the
       other means "you did it", so they have to be different at a glance. */
    const peaks = (pose: (o: TrickPose, u: number) => void): number => {
      let n = 0;
      let prev = 0;
      let rising = false;
      for (let i = 0; i <= 300; i++) {
        pose(slot, i / 300);
        const up = -slot.dy;
        if (up > prev + 1e-9) rising = true;
        else if (rising && up < prev - 1e-9) { n++; rising = false; }
        prev = up;
      }
      return n;
    };
    expect(peaks(celebratePose)).toBe(2);
    expect(peaks((o, u) => trickPose(o, TRICK_BOUNCE, u))).toBe(1);

    // no anticipation: the bounce is still crouching where this is already up
    trickPose(slot, TRICK_BOUNCE, 0.1);
    expect(slot.sx).toBeGreaterThan(1);        // wider: squashed down
    expect(slot.dy).toBeCloseTo(0, 6);         // …and still on the ground
    celebratePose(slot, 0.1);
    expect(slot.sx).toBeLessThan(1);           // narrower: stretched up
    expect(slot.dy).toBeLessThan(-5);          // …and airborne already

    expect(CELEBRATE_DUR).toBeGreaterThan(0.5);
    expect(CELEBRATE_DUR).toBeLessThanOrEqual(1.2);
  });
});
