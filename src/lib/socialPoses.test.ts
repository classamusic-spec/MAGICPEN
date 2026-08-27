// ─── The quieter states move the way they promise ────────────────────────────
// sleepPose, nibblePose and celebratePose are whole-body transforms wired into
// the render loop. These lock their shape so a refactor cannot quietly flatten
// a nap into stillness or turn a happy hop into a squash.

import { describe, expect, it } from "vitest";
import {
  sleepPose, nibblePose, celebratePose, SLEEP_PERIOD, NIBBLE_DUR, CELEBRATE_DUR,
  type TrickPose,
} from "./social";

const P = (): TrickPose => ({ dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 });

describe("the quieter creature states", () => {
  it("sleep breathes — volume-preserving, and settles downward", () => {
    const out = P();
    // across one breath the width swells and shrinks; sy is always the inverse
    let sawWide = false, sawNarrow = false;
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * SLEEP_PERIOD;
      sleepPose(out, t, 1);
      expect(out.sx * out.sy).toBeCloseTo(1, 2); // volume preserved (no inflating)
      if (out.sx > 1.01) sawWide = true;
      if (out.sx < 0.99) sawNarrow = true;
      expect(out.dy).toBeGreaterThan(0); // always settled a little below standing
    }
    expect(sawWide && sawNarrow).toBe(true);
  });

  it("sleep with reduced motion still sleeps, but does not move the body", () => {
    const out = P();
    sleepPose(out, SLEEP_PERIOD / 4, 0); // calm = 0
    expect(out.sx).toBe(1); expect(out.sy).toBe(1); expect(out.dy).toBe(0);
  });

  it("nibble chews several times and fades in and out", () => {
    const start = P(); nibblePose(start, 0.001, 1);
    const mid = P(); nibblePose(mid, 0.5, 1);
    const end = P(); nibblePose(end, 0.999, 1);
    // fades from and back to rest, biggest squash in the middle
    expect(Math.abs(start.sx - 1)).toBeLessThan(0.02);
    expect(Math.abs(end.sx - 1)).toBeLessThan(0.02);
    let peak = 0;
    for (let i = 0; i <= 30; i++) { const o = P(); nibblePose(o, i / 30, 1); peak = Math.max(peak, Math.abs(o.sx - 1)); }
    expect(peak).toBeGreaterThan(0.03);
    expect(NIBBLE_DUR).toBeGreaterThan(0);
  });

  it("celebrate lifts off the ground — a hop, not a squash", () => {
    let highest = 0, widestStretch = 0;
    for (let i = 0; i <= 30; i++) {
      const o = P(); celebratePose(o, i / 30, 1);
      highest = Math.min(highest, o.dy);      // dy negative = up
      widestStretch = Math.max(widestStretch, o.sy); // stretches, not squashes
    }
    expect(highest).toBeLessThan(-10);        // genuinely leaves the floor
    expect(widestStretch).toBeGreaterThan(1); // taller at the top of the hop
    expect(CELEBRATE_DUR).toBeGreaterThan(0);
  });
});
