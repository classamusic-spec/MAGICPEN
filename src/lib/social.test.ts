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
  GROWTH, grownFrom, growthScale, trickPose, TRICK_DUR, type TrickPose,
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
