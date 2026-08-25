// ─── Shapes World's own guard rails ─────────────────────────────────────────
// Same principle as `writing.test.ts`: none of this is behaviour, it is the
// rules the content has to obey, written where breaking them will run into
// them. Every one of these fails *silently* in front of a child — a blank
// tracing sheet, a shape nobody can reach, a wall of stars that vanishes
// because a key was renamed.

import { describe, expect, it } from "vitest";
import {
  SHAPE_DOODLES,
  SHAPE_GROUPS,
  SHAPE_LESSONS,
  bareName,
  shapeById,
  shapeGaps,
} from "./shapes";
import { tracePraise } from "./tracing";
import { SHAPES, SHAPE_GLYPHS, glyphPoints } from "./glyphs";
import { DOODLES } from "./doodles";

describe("the shapes curriculum", () => {
  it("teaches every shape we can draw, and draws every shape we teach", () => {
    // one direction is a blank sheet, the other is a shape no child can reach
    expect(shapeGaps()).toEqual({ unreachable: [], missing: [] });
  });

  it("the flat list is exactly the groups, in order", () => {
    expect(SHAPE_LESSONS).toEqual(SHAPE_GROUPS.flatMap((g) => g.lessons));
    expect(new Set(SHAPE_GROUPS.map((g) => g.id)).size).toBe(SHAPE_GROUPS.length);
  });

  it("names each shape once", () => {
    const ids = SHAPE_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of SHAPE_LESSONS) expect(shapeById(l.id)).toBe(l);
    expect(shapeById("nonsense")).toBeUndefined();
  });

  it("keeps every shape that has ever earned a star", () => {
    /* These six shipped inside Math World. Their progress lives under
       `shape:<id>` and moving worlds did not move the keys — renaming one now
       would wipe the stars a child already earned for it. */
    const shipped = ["circle", "square", "triangle", "star", "diamond", "heart"];
    const have = new Set(SHAPE_LESSONS.map((l) => l.id));
    for (const id of shipped) expect(have, id).toContain(id);
  });

  it("never uses a one-character id", () => {
    /* `GlyphMark` looks in SHAPE_GLYPHS before it looks at the letters, so a
       shape keyed "x" would quietly replace the lowercase letter x everywhere
       in the app — including on the letter it is supposed to be teaching. */
    for (const id of SHAPE_LESSONS.map((l) => l.id)) {
      expect(id.length, id).toBeGreaterThan(1);
      expect(id, id).toMatch(/^[a-z]+$/);
    }
  });

  it("says how to make each one, in words a four-year-old hears", () => {
    for (const l of SHAPE_LESSONS) {
      // spoken, not read: the hint is said out loud under the title
      expect(l.hint, l.id).toBe(l.hint.toLowerCase());
      expect(l.hint.length, l.id).toBeGreaterThan(8);
      /* The label carries its own article — "Trace a circle", "Trace loops" —
         and starts lowercase, because the reward capitalises it into "A
         circle!". Interior capitals are allowed: "an X" names a letter, and
         "an x" on a screen teaching letter shapes would be a different one. */
      expect(l.label[0], l.id).toBe(l.label[0].toLowerCase());
      expect(l.label.length, l.id).toBeGreaterThan(2);
    }
  });

  it("praises without the article the label carries", () => {
    /* The tracing sheet builds "Perfect ${name}!". Handed the label whole it
       said "Perfect a zig zag!" on a real screen — this is that bug. */
    for (const l of SHAPE_LESSONS) {
      const bare = bareName(l);
      expect(bare, l.id).not.toMatch(/^an? /);
      // "an X" leaves "X", which is a whole name — "Perfect X!" is fine
      expect(bare.length, l.id).toBeGreaterThan(0);
      const praise = tracePraise(
        { coverage: 1, tidiness: 1, economy: 1, score: 1, stars: 3, empty: false },
        bare,
      );
      expect(praise, l.id).not.toMatch(/Perfect an? /);
    }
    expect(bareName({ id: "z", label: "a zig zag", hint: "" })).toBe("zig zag");
    expect(bareName({ id: "z", label: "an arch", hint: "" })).toBe("arch");
    // no article to take off, and none invented
    expect(bareName({ id: "z", label: "loops", hint: "" })).toBe("loops");
  });

  it("pairs a shape with a picture only when it has one, and vice versa", () => {
    for (const l of SHAPE_LESSONS) {
      // a picture with no line to say about it, or a line with no picture,
      // is half a reward screen
      expect(Boolean(l.doodle), l.id).toBe(Boolean(l.like));
      if (l.doodle) {
        expect(DOODLES, `${l.id} → ${l.doodle}`).toHaveProperty(l.doodle);
        expect(l.like!.length, l.id).toBeGreaterThan(8);
      }
    }
    for (const name of SHAPE_DOODLES) expect(DOODLES).toHaveProperty(name);
  });
});

describe("the shapes themselves", () => {
  it("gives every shape something to trace", () => {
    for (const id of SHAPES) {
      const g = SHAPE_GLYPHS[id];
      expect(g.length, id).toBeGreaterThan(0);
      // a guide the scorer can actually score against
      expect(glyphPoints(g, 3).length, id).toBeGreaterThan(12);
    }
  });

  it("keeps every shape inside its own box", () => {
    /* The tracing sheet fits the box, not the shape — a stroke outside it is
       drawn off the edge of the paper, where a finger cannot reach it. */
    for (const id of SHAPES) {
      for (const stroke of SHAPE_GLYPHS[id]) {
        for (const q of stroke) {
          expect(q.x, `${id} x`).toBeGreaterThanOrEqual(0);
          expect(q.x, `${id} x`).toBeLessThanOrEqual(100);
          expect(q.y, `${id} y`).toBeGreaterThanOrEqual(0);
          expect(q.y, `${id} y`).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("draws the closed shapes closed", () => {
    /* Closing the shape is half of what is being learned, so the guide has to
       actually come back to where it started — a square that stops one side
       short teaches a child to leave it open. */
    for (const id of ["circle", "oval", "square", "rectangle", "triangle", "diamond", "star", "heart", "pentagon", "hexagon", "octagon"]) {
      const pts = SHAPE_GLYPHS[id].flat();
      const a = pts[0];
      const b = pts[pts.length - 1];
      expect(Math.hypot(b.x - a.x, b.y - a.y), id).toBeLessThan(2);
    }
  });

  it("leaves the open strokes open", () => {
    // and the ones that are a journey rather than an outline must NOT close,
    // or they stop being a line and start being a very thin shape
    for (const id of ["line", "across", "slant", "arch", "wave", "zigzag", "squiggle", "spiral"]) {
      const pts = SHAPE_GLYPHS[id].flat();
      const a = pts[0];
      const b = pts[pts.length - 1];
      expect(Math.hypot(b.x - a.x, b.y - a.y), id).toBeGreaterThan(20);
    }
  });

  it("starts every stroke where a hand starts", () => {
    /* The guide animation is the lesson: a child copying a circle drawn
       anticlockwise learns to draw it anticlockwise. So each stroke has to
       begin at the top or on the left — never at the bottom-right corner. */
    for (const id of SHAPES) {
      for (const [i, stroke] of SHAPE_GLYPHS[id].entries()) {
        const start = stroke[0];
        const ok = start.y <= 55 || start.x <= 45;
        expect(ok, `${id} stroke ${i} starts at ${start.x.toFixed(0)},${start.y.toFixed(0)}`).toBe(true);
      }
    }
  });
});
