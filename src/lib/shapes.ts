// ─── The shapes curriculum ──────────────────────────────────────────────────
// What a child is asked to trace in Shapes World, in the order they are asked
// to trace it. The geometry lives in `./glyphs` — this file is the *teaching*:
// which shapes, in what order, called what, and what a grown-up should say
// about each one while it is being traced.
//
// ── why this is its own world ──
// Shapes used to be one section at the bottom of Math World, behind a hundred
// numbers and a dozen sums. That is exactly backwards: these are the marks a
// hand makes *before* it can make a number, and they were sitting where a
// three-year-old would never reach them.
//
// ── the order is the whole design ──
// It is the order an occupational therapist teaches pre-writing in, not the
// order a grown-up would list shapes in. A vertical line, then a horizontal,
// then a circle, then a cross — each one is a control a hand has to have before
// the next is possible, and a child who can hold a zig zag has the wrist that
// "M" and "W" are about to ask for. So a section is never "the easy ones"; it
// is "the ones that come before".
//
// Three rules, the same three the writing curriculum keeps:
//
//   1. Every `id` here names a real glyph in `SHAPE_GLYPHS`, and every glyph
//      there is a lesson here. `shapes.test.ts` asserts both directions, so a
//      shape can never be drawable-but-unreachable or listed-but-blank.
//   2. An id is a persisted progress key (`shape:circle`) and can never be
//      renamed — that silently wipes the stars a child earned for it.
//   3. Nothing is grouped by hand-counted offsets. A group owns its lessons;
//      the flat list is derived from the groups, never the other way round.

import { SHAPES } from "./glyphs";

/** One shape to trace. */
export interface ShapeLesson {
  /** Persisted as `shape:<id>`, and the key of `SHAPE_GLYPHS`. Never rename. */
  id: string;
  /** What it is called, out loud and on the tile: "a zig zag". Written with
   *  its article, because every place it appears wants one. */
  label: string;
  /** How to make it, in the words you would use to a four-year-old. Spoken,
   *  so lowercase. */
  hint: string;
  /**
   * Something in the world that is this shape.
   *
   * The point of learning shapes is spotting them in things, so a reward shows
   * the shape *and* the thing, where there is an honest pairing. Set only where
   * there is one: a zig zag is not a picture we have, and a forced one teaches
   * nothing. Names a doodle in `@/components/ink/Doodles`.
   */
  doodle?: string;
  /** The line under the reward, when there is a doodle: "a ball is a circle!" */
  like?: string;
}

/** A named group of shapes, and what it is for. */
export interface ShapeGroup {
  /** Stable id, for React keys and tests. Not persisted. */
  id: string;
  title: string;
  /** The small line under the heading. */
  hint: string;
  lessons: ShapeLesson[];
}

export const SHAPE_GROUPS: ShapeGroup[] = [
  {
    id: "marks",
    title: "Lines and wiggles",
    hint: "the marks a hand makes first",
    lessons: [
      { id: "line", label: "a line down", hint: "start at the top and pull straight down" },
      { id: "across", label: "a line across", hint: "start on the left and go all the way over" },
      { id: "slant", label: "a slanty line", hint: "from the top corner down to the other one" },
      { id: "cross", label: "a cross", hint: "one line down, then one line across it" },
      { id: "xcross", label: "an X", hint: "two slanty lines that meet in the middle" },
      { id: "arch", label: "an arch", hint: "up and over the top, like a rainbow", doodle: "rainbow", like: "a rainbow is an arch!" },
      { id: "wave", label: "a wave", hint: "up and down, but round instead of pointy", doodle: "fish", like: "the sea is full of waves!" },
      { id: "zigzag", label: "a zig zag", hint: "down, up, down, up — with sharp corners" },
      { id: "squiggle", label: "a squiggle", hint: "a wiggly line that never goes straight", doodle: "snake", like: "a snake is one long squiggle!" },
      { id: "loops", label: "loops", hint: "round and round without stopping" },
      { id: "spiral", label: "a spiral", hint: "start in the middle and go round and round" },
    ],
  },
  {
    id: "first",
    title: "First shapes",
    hint: "round ones and straight ones",
    lessons: [
      { id: "circle", label: "a circle", hint: "all the way round, back to where you started", doodle: "ball", like: "a ball is a circle!" },
      { id: "oval", label: "an oval", hint: "a circle that got stretched", doodle: "egg", like: "an egg is an oval!" },
      { id: "square", label: "a square", hint: "four sides, all the same", doodle: "gift", like: "a present is a square!" },
      { id: "rectangle", label: "a rectangle", hint: "two long sides and two short ones", doodle: "bus", like: "a bus is a rectangle!" },
      { id: "triangle", label: "a triangle", hint: "three straight sides", doodle: "tree", like: "a tree is a triangle!" },
      { id: "diamond", label: "a diamond", hint: "a square, tipped up on its point", doodle: "kite", like: "a kite is a diamond!" },
    ],
  },
  {
    id: "trickier",
    title: "Trickier shapes",
    hint: "these ones take practice",
    lessons: [
      { id: "star", label: "a star", hint: "five points, without lifting your finger", doodle: "star", like: "stars have five points!" },
      { id: "heart", label: "a heart", hint: "two bumps at the top, down to a point", doodle: "heart", like: "two bumps and a point!" },
      { id: "moon", label: "a crescent moon", hint: "a big curve, then a little one back", doodle: "moon", like: "the moon is a crescent!" },
      { id: "arrow", label: "an arrow", hint: "a line, then a point on the end", doodle: "rocket", like: "a rocket is arrow-shaped!" },
      { id: "pentagon", label: "a pentagon", hint: "five straight sides — count them", doodle: "house", like: "a house is a pentagon!" },
      { id: "hexagon", label: "a hexagon", hint: "six sides, like a honeycomb", doodle: "bee", like: "bees build hexagons!" },
      { id: "octagon", label: "an octagon", hint: "eight sides, like a stop sign", doodle: "octopus", like: "eight sides, eight arms!" },
    ],
  },
];

/** Every shape to trace, in picker order. Derived — never hand-maintained. */
export const SHAPE_LESSONS: ShapeLesson[] = SHAPE_GROUPS.flatMap((g) => g.lessons);

const BY_ID: Record<string, ShapeLesson> = Object.fromEntries(
  SHAPE_LESSONS.map((l) => [l.id, l]),
);

/** The lesson for a shape id, or undefined if it is not one of ours. */
export const shapeById = (id: string): ShapeLesson | undefined => BY_ID[id];

/**
 * The shape's name with its article taken off: "a zig zag" → "zig zag".
 *
 * The tracing screen's praise is built as `Perfect ${name}!`, so it wants the
 * bare noun the way a letter gives it "A" and a number gives it "seven".
 * Handed the label whole it says "Perfect a zig zag!", which is not English.
 * The label keeps its article because every *other* place — the sheet's title,
 * the reward — needs one, and "a" versus "an" is not something to guess at.
 */
export const bareName = (l: ShapeLesson): string => l.label.replace(/^an? /, "");

/**
 * Shapes that can be drawn but that nobody can reach, and lessons that point at
 * a shape we cannot draw. Both are blank screens in front of a child, so
 * `shapes.test.ts` asserts this comes back empty in both directions.
 */
export function shapeGaps(): { unreachable: string[]; missing: string[] } {
  const taught = new Set(SHAPE_LESSONS.map((l) => l.id));
  const drawable = new Set(SHAPES);
  return {
    unreachable: SHAPES.filter((id) => !taught.has(id)),
    missing: SHAPE_LESSONS.map((l) => l.id).filter((id) => !drawable.has(id)),
  };
}

/** Every doodle this curriculum asks for, de-duplicated and sorted. */
export const SHAPE_DOODLES: readonly string[] = Object.freeze(
  Array.from(new Set(SHAPE_LESSONS.flatMap((l) => (l.doodle ? [l.doodle] : [])))).sort(),
);
