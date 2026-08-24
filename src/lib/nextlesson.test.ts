import { describe, expect, it } from "vitest";
import { nextLessonKey } from "./storage";

describe("nextLessonKey — turning stars into a next step", () => {
  const keys = ["a", "b", "c", "d"];

  it("starts at the very first lesson when nothing has been tried", () => {
    expect(nextLessonKey(keys, {})).toBe("a");
  });

  it("points at the first untried lesson, skipping ones already done", () => {
    expect(nextLessonKey(keys, { a: 3, b: 2 })).toBe("c");
  });

  it("once everything is tried, brings back the shakiest for another go", () => {
    // b has the fewest stars — that is the gentle revisit
    expect(nextLessonKey(keys, { a: 3, b: 1, c: 2, d: 3 })).toBe("b");
  });

  it("prefers a never-tried lesson over revisiting a weak one", () => {
    expect(nextLessonKey(keys, { a: 1, b: 3, c: 0, d: 3 })).toBe("c");
  });

  it("returns null when every lesson is a confident three stars — a finish line", () => {
    expect(nextLessonKey(keys, { a: 3, b: 3, c: 3, d: 3 })).toBeNull();
  });

  it("treats a missing score as never tried, mid-list", () => {
    expect(nextLessonKey(keys, { a: 3, c: 3 })).toBe("b");
  });
});
