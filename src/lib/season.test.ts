// The year wraps, and winter is the season that straddles the wrap — which is
// the one place a day-of-year calculation goes wrong quietly.

import { describe, expect, it } from "vitest";
import { season, SEASONS } from "./daily";

const on = (m: number, d: number) => season(new Date(2026, m - 1, d));

describe("season", () => {
  it("names one of the four, always", () => {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 14, 28]) {
        expect(SEASONS).toContain(on(m, d).now);
      }
    }
  });

  it("puts the solstices and equinoxes in the right season", () => {
    expect(on(1, 15).now).toBe("winter");
    expect(on(4, 15).now).toBe("spring");
    expect(on(7, 15).now).toBe("summer");
    expect(on(10, 15).now).toBe("autumn");
  });

  /* Winter owns the turn of the year. If the wrap is wrong, late December and
     early January land in different seasons — which is the bug. */
  it("keeps winter continuous across New Year", () => {
    expect(on(12, 20).now).toBe("winter");
    expect(on(12, 31).now).toBe("winter");
    expect(on(1, 1).now).toBe("winter");
    expect(on(1, 10).now).toBe("winter");
  });

  it("blends into the next season rather than snapping", () => {
    // most of a season is settled…
    expect(on(1, 15).blend).toBe(0);
    // …and `next` always follows `now` in the cycle
    for (let m = 1; m <= 12; m++) {
      const s = on(m, 5);
      const i = SEASONS.indexOf(s.now);
      expect(s.next).toBe(SEASONS[(i + 1) % 4]);
    }
  });

  it("keeps the blend a real 0..1 fraction all year", () => {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const { blend } = on(m, d);
        expect(blend).toBeGreaterThanOrEqual(0);
        expect(blend).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is stable within a day and independent of the hour", () => {
    const a = season(new Date(2026, 5, 10, 3, 0));
    const b = season(new Date(2026, 5, 10, 21, 30));
    expect(a).toEqual(b);
  });

  it("survives a leap year without falling off the end", () => {
    expect(SEASONS).toContain(season(new Date(2024, 1, 29)).now);
    expect(SEASONS).toContain(season(new Date(2024, 11, 31)).now);
  });
});
