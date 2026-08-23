// ─── The writing curriculum ─────────────────────────────────────────────────
// What a child is asked to write, in the order they are asked to write it.
// Three worlds share this file: letters, numbers (and sums), and whole words.
//
// Two rules run through all of it:
//
//   1. Every `doodle` here names a real doodle in `@/components/ink/Doodles`.
//      Nothing is an emoji, and nothing is a picture we cannot draw. The
//      guard at the bottom of this file lets a caller assert that in one line.
//   2. Letters, sums and words are ordered easiest-first — straight-line
//      letters (I, L, T) before the curly ones (S, G, Q), short words before
//      long, plus before minus. Numbers are the exception: 0–9 in counting order,
//      because you cannot teach a five-year-old to count out of order.
//
// Everything is uppercase. Uppercase is what children are taught to write
// first, and it is what `LETTER_GLYPHS` in `./glyphs` knows how to guide.

/** One letter to trace, with a word and a picture that start with it. */
export interface LetterLesson {
  /** The single uppercase character traced — a key of `LETTER_GLYPHS`. */
  char: string;
  /** A word a four-year-old already says out loud. */
  word: string;
  /** A doodle name — see `DOODLES`. */
  doodle: string;
}

/** One digit to trace, with something to count while tracing it. */
export interface NumberLesson {
  /** "0".."9" — a single character, a key of `DIGIT_GLYPHS`. */
  digit: string;
  /** The same value as a number: how many things there are to count. */
  count: number;
  /** Plural noun for the things being counted, e.g. "apples". */
  thing: string;
  /** A doodle name, drawn `count` times. */
  doodle: string;
}

/** One sum, whose answer is a single digit the child then writes. */
export interface MathLesson {
  a: number;
  b: number;
  op: "+" | "-";
  answer: number;
}

/** One whole word to write, with a picture of it and a line to say out loud. */
export interface WordLesson {
  /** Uppercase A–Z only — every letter has a glyph. */
  word: string;
  /** A doodle name — see `DOODLES`. */
  doodle: string;
  /** A short, warm clue. Lowercase: it is spoken, not written. */
  hint: string;
}

/* ── letters ─────────────────────────────────────────────────────────────── */
// Ordered by how hard the *stroke* is, not by the alphabet: straight lines
// first (I, L, T, E, F, H), then diagonals (V, X, A, K…), then the curves
// (O, C, U, J…), with S and Q — two changes of direction — last.

export const LETTER_LESSONS: LetterLesson[] = [
  { char: "I", word: "Ice cream", doodle: "icecream" },
  { char: "L", word: "Leaf", doodle: "leaf" },
  { char: "T", word: "Tree", doodle: "tree" },
  { char: "E", word: "Egg", doodle: "egg" },
  { char: "F", word: "Fish", doodle: "fish" },
  { char: "H", word: "Hat", doodle: "hat" },
  { char: "V", word: "Volcano", doodle: "volcano" },
  { char: "X", word: "Xylophone", doodle: "xylophone" },
  { char: "A", word: "Apple", doodle: "apple" },
  { char: "K", word: "Kite", doodle: "kite" },
  { char: "N", word: "Nest", doodle: "nest" },
  { char: "M", word: "Moon", doodle: "moon" },
  { char: "W", word: "Whale", doodle: "whale" },
  { char: "Y", word: "Yo-yo", doodle: "yoyo" },
  { char: "Z", word: "Zebra", doodle: "zebra" },
  { char: "O", word: "Orange", doodle: "orange" },
  { char: "C", word: "Cat", doodle: "cat" },
  { char: "U", word: "Umbrella", doodle: "umbrella" },
  { char: "J", word: "Jellyfish", doodle: "jellyfish" },
  { char: "D", word: "Dog", doodle: "dog" },
  { char: "P", word: "Pig", doodle: "pig" },
  { char: "R", word: "Rainbow", doodle: "rainbow" },
  { char: "B", word: "Bee", doodle: "bee" },
  { char: "G", word: "Gift", doodle: "gift" },
  { char: "S", word: "Sun", doodle: "sun" },
  { char: "Q", word: "Queen", doodle: "crown" },
];

/* ── numbers ─────────────────────────────────────────────────────────────── */
// Counting order, 0–9. Zero comes first on purpose: an empty plate is the
// easiest number in the world to count, and "0" is one round stroke.

export const NUMBER_LESSONS: NumberLesson[] = [
  { digit: "0", count: 0, thing: "eggs", doodle: "egg" },
  { digit: "1", count: 1, thing: "moons", doodle: "moon" },
  { digit: "2", count: 2, thing: "ducks", doodle: "duck" },
  { digit: "3", count: 3, thing: "apples", doodle: "apple" },
  { digit: "4", count: 4, thing: "stars", doodle: "star" },
  { digit: "5", count: 5, thing: "fish", doodle: "fish" },
  { digit: "6", count: 6, thing: "bees", doodle: "bee" },
  { digit: "7", count: 7, thing: "leaves", doodle: "leaf" },
  { digit: "8", count: 8, thing: "balloons", doodle: "balloon" },
  { digit: "9", count: 9, thing: "hearts", doodle: "heart" },
];

/* ── sums ────────────────────────────────────────────────────────────────── */
// Single digits in, a single digit out — the answer is always 0–9, so it is
// one traceable glyph. Adding before taking away, small before large, and
// nothing goes below zero.

export const SUM_LESSONS: MathLesson[] = [
  { a: 1, b: 1, op: "+", answer: 2 },
  { a: 2, b: 1, op: "+", answer: 3 },
  { a: 2, b: 2, op: "+", answer: 4 },
  { a: 3, b: 1, op: "+", answer: 4 },
  { a: 3, b: 1, op: "-", answer: 2 },
  { a: 4, b: 2, op: "-", answer: 2 },
  { a: 3, b: 3, op: "+", answer: 6 },
  { a: 5, b: 2, op: "-", answer: 3 },
  { a: 4, b: 3, op: "+", answer: 7 },
  { a: 6, b: 3, op: "-", answer: 3 },
  { a: 5, b: 4, op: "+", answer: 9 },
  { a: 4, b: 4, op: "-", answer: 0 },
];

/* ── words ───────────────────────────────────────────────────────────────── */
// Three letters before four, and within each, the words whose letters are
// mostly straight lines first. Every one of them is a doodle we can draw, so
// the word the child writes can walk off the page as a creature.

export const WORD_LESSONS: WordLesson[] = [
  { word: "HAT", doodle: "hat", hint: "pop it on your head" },
  { word: "CAT", doodle: "cat", hint: "soft paws and long whiskers" },
  { word: "BEE", doodle: "bee", hint: "buzzing off to find flowers" },
  { word: "SUN", doodle: "sun", hint: "warm on your face" },
  { word: "PIG", doodle: "pig", hint: "pink, and very muddy" },
  { word: "BUS", doodle: "bus", hint: "beep beep, climb aboard" },
  { word: "DOG", doodle: "dog", hint: "a friendly pup" },
  { word: "TREE", doodle: "tree", hint: "tall, with birds in the top" },
  { word: "FISH", doodle: "fish", hint: "swishes through the sea" },
  { word: "STAR", doodle: "star", hint: "twinkles when it is dark" },
  { word: "BALL", doodle: "ball", hint: "bounce it as high as you can" },
  { word: "CAKE", doodle: "cake", hint: "make a wish and blow" },
  { word: "MOON", doodle: "moon", hint: "glows while you are asleep" },
  { word: "BIRD", doodle: "bird", hint: "sings on the fence" },
  { word: "DUCK", doodle: "duck", hint: "quack, quack, at the pond" },
  { word: "FROG", doodle: "frog", hint: "hop, hop, splash" },
];

/* ── lookups and guards ──────────────────────────────────────────────────── */

const BY_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const l of LETTER_LESSONS) map[l.char] = l.doodle;
  for (const n of NUMBER_LESSONS) map[n.digit] = n.doodle;
  for (const w of WORD_LESSONS) map[w.word] = w.doodle;
  return map;
})();

/**
 * The doodle for a letter ("A"), a digit ("3") or a word ("DOG").
 * Falls back to the mystery blob — a missing picture must never be a crash
 * in the middle of a child's turn.
 */
export function doodleFor(key: string): string {
  return BY_KEY[key.toUpperCase()] ?? "mystery";
}

/** Every doodle name this curriculum asks for, de-duplicated and sorted. */
export const REFERENCED_DOODLES: readonly string[] = Object.freeze(
  Array.from(
    new Set([
      ...LETTER_LESSONS.map((l) => l.doodle),
      ...NUMBER_LESSONS.map((n) => n.doodle),
      ...WORD_LESSONS.map((w) => w.doodle),
    ]),
  ).sort(),
);

/**
 * Which referenced doodles are missing from a set of drawable names — pass
 * `DOODLE_NAMES` (or `Object.keys(DOODLES)`) from the Doodles module. An
 * empty array means every lesson in this file has a picture.
 */
export function missingDoodles(available: Iterable<string>): string[] {
  const have = new Set(available);
  return REFERENCED_DOODLES.filter((name) => !have.has(name));
}

/** Total number of things to write across the three worlds. */
export const LESSON_COUNTS = {
  letters: LETTER_LESSONS.length,
  numbers: NUMBER_LESSONS.length,
  sums: SUM_LESSONS.length,
  words: WORD_LESSONS.length,
} as const;
