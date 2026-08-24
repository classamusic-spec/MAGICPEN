// ─── The curriculum's own guard rails ───────────────────────────────────────
// Everything asserted here is something that fails *silently* in front of a
// child: a word with no picture is a blank reward screen, a renamed progress
// key is a wall of earned stars that quietly vanishes, an eight-letter word is
// eight tracing screens a five-year-old will not finish.
//
// So these are not tests of behaviour. They are the rules the content has to
// obey, written down where adding a word to `writing.ts` will run into them.

import { describe, expect, it } from "vitest";
import {
  ALL_NUMBER_LESSONS,
  COUNTABLE_MAX,
  LETTER_LESSONS,
  NUMBER_CATEGORIES,
  NUMBER_LESSONS,
  REFERENCED_DOODLES,
  SUM_LESSONS,
  WORD_GROUPS,
  WORD_LESSONS,
  doodleFor,
  missingDoodles,
  numberName,
  spokenName,
} from "./writing";
import { DOODLES, DOODLE_NAMES } from "./doodles";
import { DIGIT_GLYPHS, LETTER_GLYPHS, SHAPES } from "./glyphs";
import { ALL_KINDS } from "./creatures";

/* Rebuilt exactly as WriteWorld builds them. If these two ever disagree the
   picker opens the wrong lesson, which is why the browser check walks a tile
   from every section as well. */
const lessonKeys = (): string[] => [
  ...LETTER_LESSONS.map((l) => `letter:${l.char}`),
  ...LETTER_LESSONS.map((l) => `lower:${l.char.toLowerCase()}`),
  ...NUMBER_CATEGORIES.flatMap((c) => c.lessons.map((n) => `${c.prefix}${n.numeral}`)),
  ...SUM_LESSONS.map((s) => `sum:${s.a}${s.op}${s.b}`),
  ...SHAPES.map((s) => `shape:${s}`),
  ...WORD_LESSONS.map((w) => `word:${w.word}`),
];

/** Every progress-key prefix the app writes to a child's device. */
const PREFIXES = [
  "letter:", "lower:", "sum:", "shape:", "word:", "draw:",
  ...NUMBER_CATEGORIES.map((c) => c.prefix),
];

describe("words", () => {
  it("every word has a doodle that actually exists", () => {
    for (const w of WORD_LESSONS) {
      expect(DOODLES, `${w.word} → ${w.doodle}`).toHaveProperty(w.doodle);
    }
  });

  it("no two words hatch the same creature", () => {
    const seen = new Map<string, string>();
    for (const w of WORD_LESSONS) {
      expect(seen.get(w.doodle), `${w.doodle} is already ${seen.get(w.doodle)}`).toBeUndefined();
      seen.set(w.doodle, w.word);
    }
  });

  it("every word is uppercase A–Z and at most six letters", () => {
    for (const w of WORD_LESSONS) {
      // each letter is its own tracing screen — seven is a chore, not a lesson
      expect(w.word, w.word).toMatch(/^[A-Z]{2,6}$/);
      for (const c of w.word) expect(LETTER_GLYPHS, `${w.word}: ${c}`).toHaveProperty(c);
    }
  });

  it("every word has a hint, spoken not read, and so lowercase", () => {
    for (const w of WORD_LESSONS) {
      expect(w.hint.length, w.word).toBeGreaterThan(3);
      expect(w.hint, w.word).toBe(w.hint.toLowerCase());
    }
  });

  it("the flat list is exactly the groups, in order", () => {
    expect(WORD_LESSONS).toEqual(WORD_GROUPS.flatMap((g) => g.words));
    expect(new Set(WORD_GROUPS.map((g) => g.id)).size).toBe(WORD_GROUPS.length);
  });

  it("every word becomes a creature the app can name and animate", () => {
    /* A word written in Word World is set free as `kindId: doodle` (App.tsx),
       and a doodle with no kind behind it falls back to the mystery blob — the
       child writes ZEBRA and gets a creature called "Squiggle", labelled
       "Mystery Creature", that swims. So a doodle is only a word once it is
       also a kind. This is what keeps KITE, LEAF, NEST, GIFT, CROWN, ORANGE,
       YOYO and ZEBRA out of the corpus, pretty as they are. */
    const kinds = new Set(ALL_KINDS.map((k) => k.id));
    for (const w of WORD_LESSONS) {
      expect(kinds, `${w.word} → ${w.doodle}`).toContain(w.doodle);
      expect(w.doodle, w.word).not.toBe("mystery");
    }
  });

  it("keeps every word that has ever earned a star", () => {
    // renaming one of these wipes a child's progress for it — see storage.ts
    const shipped = [
      "HAT", "CAT", "BEE", "SUN", "PIG", "BUS", "DOG", "TREE",
      "FISH", "STAR", "BALL", "CAKE", "MOON", "BIRD", "DUCK", "FROG",
    ];
    const have = new Set(WORD_LESSONS.map((w) => w.word));
    for (const word of shipped) expect(have, word).toContain(word);
  });
});

describe("numbers", () => {
  it("every digit of every numeral is one we can guide a hand through", () => {
    for (const n of ALL_NUMBER_LESSONS) {
      expect(n.numeral, String(n.value)).toMatch(/^[0-9]+$/);
      for (const d of n.numeral) expect(DIGIT_GLYPHS, `${n.numeral}: ${d}`).toHaveProperty(d);
    }
  });

  it("the numeral is the value, written out", () => {
    for (const n of ALL_NUMBER_LESSONS) expect(n.numeral).toBe(String(n.value));
  });

  it("covers 0–100 without repeating itself", () => {
    const values = ALL_NUMBER_LESSONS.map((n) => n.value);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // the two runs a child works straight through, whole and in order
    expect(NUMBER_CATEGORIES[0].lessons.map((n) => n.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(NUMBER_CATEGORIES[1].lessons.map((n) => n.value))
      .toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(NUMBER_CATEGORIES[2].lessons.map((n) => n.value))
      .toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("names every number the way a person would say it", () => {
    for (const n of ALL_NUMBER_LESSONS) expect(n.name, n.numeral).toBe(numberName(n.value));
    expect(numberName(0)).toBe("zero");
    expect(numberName(13)).toBe("thirteen");
    expect(numberName(40)).toBe("forty");
    expect(numberName(42)).toBe("forty-two");
    expect(numberName(98)).toBe("ninety-eight");
    expect(numberName(100)).toBe("one hundred");
  });

  it("says its name with no hyphen for a voice to read as a minus sign", () => {
    // "forty-two" spoken off the screen comes out "forty minus two"
    for (const n of ALL_NUMBER_LESSONS) expect(spokenName(n)).not.toContain("-");
    expect(spokenName({ numeral: "42", value: 42, name: "forty-two" })).toBe("forty two");
  });

  it("only counts things out while they are still countable", () => {
    for (const n of ALL_NUMBER_LESSONS) {
      if (n.value > COUNTABLE_MAX) {
        // you cannot draw forty-seven apples and expect anyone to count them
        expect(n.doodle, n.numeral).toBeUndefined();
        expect(n.thing, n.numeral).toBeUndefined();
      }
      // a thing to count and a picture of it are set together, or not at all
      expect(Boolean(n.doodle), n.numeral).toBe(Boolean(n.thing));
    }
  });

  it("keeps 0–9 on the keys they were first written under", () => {
    expect(NUMBER_CATEGORIES[0].prefix).toBe("digit:");
    expect(NUMBER_LESSONS.map((n) => `digit:${n.numeral}`)).toEqual([
      "digit:0", "digit:1", "digit:2", "digit:3", "digit:4",
      "digit:5", "digit:6", "digit:7", "digit:8", "digit:9",
    ]);
  });

  it("the flat list is exactly the categories, in order", () => {
    expect(ALL_NUMBER_LESSONS).toEqual(NUMBER_CATEGORIES.flatMap((c) => c.lessons));
  });
});

describe("progress keys", () => {
  it("names every lesson exactly once", () => {
    const keys = lessonKeys();
    const seen = new Set<string>();
    for (const k of keys) {
      expect(seen, k).not.toContain(k);
      seen.add(k);
    }
    expect(seen.size).toBe(keys.length);
  });

  it("gives every category a prefix no other category shares", () => {
    for (const a of PREFIXES) {
      for (const b of PREFIXES) {
        if (a === b) continue;
        // GrownUps counts with startsWith, so one prefix inside another
        // silently double-counts a whole category
        expect(a.startsWith(b), `${a} starts with ${b}`).toBe(false);
      }
    }
    expect(new Set(PREFIXES).size).toBe(PREFIXES.length);
  });

  it("files every lesson under exactly one prefix", () => {
    for (const k of lessonKeys()) {
      const owners = PREFIXES.filter((p) => k.startsWith(p));
      expect(owners, k).toHaveLength(1);
    }
  });
});

describe("artwork", () => {
  it("asks for nothing we cannot draw", () => {
    expect(missingDoodles(DOODLE_NAMES)).toEqual([]);
    for (const name of REFERENCED_DOODLES) expect(DOODLES).toHaveProperty(name);
  });

  it("finds the picture for a letter, a digit or a word", () => {
    expect(doodleFor("A")).toBe("apple");
    expect(doodleFor("3")).toBe("apple");
    expect(doodleFor("dog")).toBe("dog");
    // a big number has no pile to draw, and must not crash looking for one
    expect(doodleFor("42")).toBe("mystery");
    expect(DOODLES).toHaveProperty(doodleFor("nonsense"));
  });
});
