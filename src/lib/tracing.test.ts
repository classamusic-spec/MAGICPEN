// The star thresholds are the whole difficulty curve of Writing School and now
// of Drawing School too — forty lessons hang off them. They were calibrated by
// hand against synthetic attempts, and the calibration is written down in a
// comment in `tracing.ts`, which is exactly the kind of claim that quietly
// stops being true. These tests are that comment, executable.
//
// Nothing here asserts an exact score: the point is the *ordering* and the
// bands. A faithful trace must beat half a letter, which must beat a scribble,
// which must beat a dot — and a scribble that fills the box must not earn the
// three stars a careful child earns.

import { describe, expect, it } from "vitest";
import { scoreTrace, toGlyphSpace } from "./tracing";
import { ALL_GLYPHS, GLYPH_BOX, densify } from "./glyphs";
import type { Pt, Stroke } from "./types";

const A = ALL_GLYPHS.A;

/** Every point of a glyph, as if a child had gone over it exactly. */
const perfect = (g: typeof A): Pt[] => g.flatMap((s) => densify(s, 2));

/** …and the same, wobbled: a real four-year-old's hand. */
const wobbly = (g: typeof A, amt: number): Pt[] => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  return perfect(g).map((p) => ({ x: p.x + rnd() * amt, y: p.y + rnd() * amt }));
};

describe("scoreTrace", () => {
  it("gives three stars to a faithful trace", () => {
    const s = scoreTrace(A, perfect(A));
    expect(s.empty).toBe(false);
    expect(s.stars).toBe(3);
    expect(s.score).toBeGreaterThan(0.9);
  });

  it("still gives three stars to a shaky one — this is a four-year-old", () => {
    expect(scoreTrace(A, wobbly(A, 6)).stars).toBe(3);
  });

  it("never says a child failed, however little they drew", () => {
    const barely = perfect(A).slice(0, 6);
    const s = scoreTrace(A, barely);
    expect(s.stars).toBeGreaterThanOrEqual(1);
  });

  it("calls an empty sheet empty rather than scoring it", () => {
    expect(scoreTrace(A, []).empty).toBe(true);
    expect(scoreTrace(A, perfect(A).slice(0, 3)).empty).toBe(true);
  });

  it("ranks effort above neatness, and both above filling the box", () => {
    const full = scoreTrace(A, perfect(A)).score;
    const half = scoreTrace(A, perfect(A).slice(0, Math.floor(perfect(A).length / 2))).score;
    // a dense scribble inside the letter's box: every guide point has ink near
    // it, so coverage and tidiness are both high — economy is what catches it
    const scribble: Pt[] = [];
    for (let i = 0; i < 700; i++) {
      scribble.push({ x: 10 + ((i * 37) % 80), y: 15 + ((i * 53) % 115) });
    }
    const mess = scoreTrace(A, scribble).score;
    const dot: Pt[] = Array.from({ length: 20 }, (_, i) => ({ x: 50 + i * 0.1, y: 70 }));
    const speck = scoreTrace(A, dot).score;

    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(mess);
    expect(scoreTrace(A, scribble).stars).toBeLessThan(3);
    expect(mess).toBeGreaterThan(speck);
  });

  it("does not care which order or direction the strokes were made in", () => {
    const fwd = perfect(A);
    const back = [...fwd].reverse();
    expect(scoreTrace(A, back).score).toBeCloseTo(scoreTrace(A, fwd).score, 5);
  });
});

describe("toGlyphSpace", () => {
  const boxed = (b: { x: number; y: number; w: number; h: number }): Stroke[] => [
    { color: "#000", size: 6, pts: [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }] },
  ];

  it("maps the sheet's corners onto the guide's corners", () => {
    const pts = toGlyphSpace(boxed({ x: 40, y: 90, w: 300, h: 420 }), { x: 40, y: 90, w: 300, h: 420 });
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[0].y).toBeCloseTo(0, 6);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(GLYPH_BOX.w, 6);
    expect(last.y).toBeCloseTo(GLYPH_BOX.h, 6);
  });

  it("takes a drawing's own square box, not only the letter box", () => {
    const space = { w: 100, h: 100 };
    const pts = toGlyphSpace(boxed({ x: 0, y: 0, w: 200, h: 200 }), { x: 0, y: 0, w: 200, h: 200 }, space);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(100, 6);
    expect(last.y).toBeCloseTo(100, 6);
  });
});
