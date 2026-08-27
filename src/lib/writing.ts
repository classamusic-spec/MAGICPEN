// ─── The writing curriculum ─────────────────────────────────────────────────
// What a child is asked to write, in the order they are asked to write it.
// Three worlds share this file: letters, numbers (and sums), and whole words.
//
// Three rules run through all of it:
//
//   1. Every `doodle` here names a real doodle in `@/components/ink/Doodles`.
//      Nothing is an emoji, and nothing is a picture we cannot draw. The
//      guard at the bottom of this file lets a caller assert that in one line.
//   2. Letters, sums and words are ordered easiest-first — straight-line
//      letters (I, L, T) before the curly ones (S, G, Q), short words before
//      long, plus before minus. Numbers are the exception: counting order,
//      because you cannot teach a five-year-old to count out of order.
//   3. Nothing is grouped by hand-counted offsets. A section owns its lessons;
//      the flat list is derived from the sections, never the other way round.
//      That is what keeps a picker tile and the lesson it opens in step.
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

/**
 * One number to trace — 0 to 100.
 *
 * A number is written the way a word is: one digit at a time, each its own
 * tracing screen. "42" is a four and then a two, and the child is asked for
 * both. What it is *called* is a separate fact from what it is spelled, which
 * is the whole reason `name` exists: a synthesizer handed "42" says "forty
 * two" only by luck, and handed "4" then "2" says "four two", which is not a
 * number a child has ever heard.
 */
export interface NumberLesson {
  /** The numeral exactly as written, e.g. "7" or "42" or "100". Every
   *  character is a key of `DIGIT_GLYPHS`, and each one is a tracing screen. */
  numeral: string;
  /** The same thing as a number — how many there are to count. */
  value: number;
  /** How it is said out loud: "forty-two", never "four two". */
  name: string;
  /**
   * Plural noun for the things counted, e.g. "apples".
   *
   * Only the small numbers have one. Counting art is honest up to about ten
   * and a lie after that — forty-seven apples on a phone is a grey smudge a
   * child cannot count, so a big number shows its numeral and says its name
   * instead. `thing` and `doodle` are set together, or neither is.
   */
  thing?: string;
  /** A doodle name, drawn `value` times. See `thing`. */
  doodle?: string;
}

/**
 * A named group of numbers, and the progress-key prefix its lessons persist
 * under.
 *
 * The prefix is written into a child's device the first time they trace one of
 * these, so it can never be renamed — that would silently wipe their stars —
 * and no prefix may be a prefix of another, because the grown-ups' summary
 * counts them with `startsWith`.
 */
export interface NumberCategory {
  /** Persisted progress-key prefix, e.g. "digit:". Never rename. */
  prefix: string;
  /** Heading — used by the picker and by the grown-ups' summary alike. */
  title: string;
  /** The small line under the heading. */
  hint: string;
  lessons: NumberLesson[];
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
  /** Uppercase A–Z only — every letter has a glyph. Six letters is the ceiling:
   *  each letter is a separate tracing screen, and seven is a chore. */
  word: string;
  /** A doodle name — see `DOODLES`. One word per doodle: the word becomes that
   *  creature, and two words hatching the same creature is confusing. */
  doodle: string;
  /** A short, warm clue. Lowercase: it is spoken, not written. */
  hint: string;
}

/** A section of Word World: the world these words belong to. */
export interface WordGroup {
  /** Stable id, for React keys and tests. Not persisted. */
  id: string;
  /** Heading in the picker. */
  title: string;
  /** The small line under the heading. */
  hint: string;
  words: WordLesson[];
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

/* ── how a number is said ────────────────────────────────────────────────── */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * A whole number 0–100 in words: `numberName(42)` → "forty-two".
 *
 * This is what the app says out loud. It exists because the alternative is
 * handing a speech synthesizer the digits and hoping — and the one thing a
 * counting lesson cannot afford is to name the number wrongly.
 */
export function numberName(n: number): string {
  if (n === 100) return "one hundred";
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens];
}

/** The same name, said rather than written — no hyphen for a voice to trip on. */
export const spokenName = (n: NumberLesson): string => n.name.replace(/-/g, " ");

/** A number with nothing to count: it shows its numeral and says its name. */
const big = (value: number): NumberLesson => ({
  numeral: String(value),
  value,
  name: numberName(value),
});

/* ── numbers ─────────────────────────────────────────────────────────────── */
// Four groups, easiest first, each with its own progress prefix so a grown-up
// can see which of them a child has actually met.
//
// Counting order within each. Zero comes first on purpose: an empty plate is
// the easiest number in the world to count, and "0" is one round stroke.

/** 0–9: one digit, one stroke lesson, and a small pile of things to count. */
export const NUMBER_LESSONS: NumberLesson[] = [
  { numeral: "0", value: 0, name: "zero", thing: "eggs", doodle: "egg" },
  { numeral: "1", value: 1, name: "one", thing: "moons", doodle: "moon" },
  { numeral: "2", value: 2, name: "two", thing: "ducks", doodle: "duck" },
  { numeral: "3", value: 3, name: "three", thing: "apples", doodle: "apple" },
  { numeral: "4", value: 4, name: "four", thing: "stars", doodle: "star" },
  { numeral: "5", value: 5, name: "five", thing: "fish", doodle: "fish" },
  { numeral: "6", value: 6, name: "six", thing: "bees", doodle: "bee" },
  { numeral: "7", value: 7, name: "seven", thing: "leaves", doodle: "leaf" },
  { numeral: "8", value: 8, name: "eight", thing: "balloons", doodle: "balloon" },
  { numeral: "9", value: 9, name: "nine", thing: "hearts", doodle: "heart" },
];

/** 10–19. The first two-digit numbers, and the ones English is worst at:
 *  "fourteen" says its digits backwards. Ten still counts out — ten flowers is
 *  a readable pile — and the teens show their numeral. */
export const TEEN_LESSONS: NumberLesson[] = [
  { numeral: "10", value: 10, name: "ten", thing: "flowers", doodle: "flower" },
  big(11), big(12), big(13), big(14), big(15), big(16), big(17), big(18), big(19),
];

/** 20, 30, 40 … 100. Place value, one tile at a time: the same digit in front,
 *  a zero behind, all the way to the round hundred. */
export const TENS_LESSONS: NumberLesson[] = [
  big(20), big(30), big(40), big(50), big(60), big(70), big(80), big(90), big(100),
];

/** One number from each ten, so every decade gets written at least once and
 *  the ones digit is never the same twice: 21, 32, 43 … 98. */
export const BIG_LESSONS: NumberLesson[] = [
  big(21), big(32), big(43), big(54), big(65), big(76), big(87), big(98),
];

export const NUMBER_CATEGORIES: NumberCategory[] = [
  {
    prefix: "digit:",
    title: "Numbers 0–9",
    hint: "count them as you go",
    lessons: NUMBER_LESSONS,
  },
  {
    prefix: "teen:",
    title: "Numbers 10–19",
    hint: "ten, eleven, twelve…",
    lessons: TEEN_LESSONS,
  },
  {
    prefix: "tens:",
    title: "Counting in tens",
    hint: "20, 30, 40 … up to 100",
    lessons: TENS_LESSONS,
  },
  {
    prefix: "big:",
    title: "Bigger numbers",
    hint: "two digits, one after the other",
    lessons: BIG_LESSONS,
  },
];

/** Every number a child can be asked to write, in picker order. */
export const ALL_NUMBER_LESSONS: NumberLesson[] = NUMBER_CATEGORIES.flatMap((c) => c.lessons);

/** Above this, counting the things out stops being countable and starts being
 *  a smudge — so the reward shows the numeral instead. */
export const COUNTABLE_MAX = 10;

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
// Grouped by the world the creature belongs to, because that is how a child
// already thinks about them, and because five short sections scan far better
// on a phone than one wall of forty tiles. Everyday comes first: it holds the
// three-letter words, and a child starting Word World should start there.
//
// Within a group: three letters before four before five, and within each, the
// words whose letters are mostly straight lines first.
//
// The corpus is capped by the artwork, not by ambition. A word here must:
//   • have a doodle of its own (one word per doodle — the word *becomes* that
//     creature, and two words hatching the same one is confusing),
//   • be at most six letters, because every letter is another tracing screen,
//   • and be a word a five-year-old already says out loud.
// Doodles that fail one of those are simply not words yet: OCTOPUS, RAINBOW,
// BUTTERFLY, VOLCANO, ASTRONAUT and the long dinosaurs are all pictures a
// child can draw in Draw School — they are just not words to write.

export const WORD_GROUPS: WordGroup[] = [
  {
    id: "everyday",
    title: "Everyday things",
    hint: "start here",
    words: [
      { word: "CAT", doodle: "cat", hint: "soft paws and long whiskers" },
      { word: "DOG", doodle: "dog", hint: "a friendly pup" },
      { word: "HAT", doodle: "hat", hint: "pop it on your head" },
      { word: "SUN", doodle: "sun", hint: "warm on your face" },
      { word: "BUS", doodle: "bus", hint: "beep beep, climb aboard" },
      { word: "BEE", doodle: "bee", hint: "buzzing off to find flowers" },
      { word: "CAR", doodle: "car", hint: "brmm, off down the road" },
      { word: "BALL", doodle: "ball", hint: "bounce it as high as you can" },
      { word: "CAKE", doodle: "cake", hint: "make a wish and blow" },
      { word: "TREE", doodle: "tree", hint: "tall, with birds in the top" },
      { word: "FROG", doodle: "frog", hint: "hop, hop, splash" },
      { word: "BIRD", doodle: "bird", hint: "sings on the fence" },
      { word: "APPLE", doodle: "apple", hint: "crunchy and sweet" },
      { word: "HEART", doodle: "heart", hint: "thump, thump, in your chest" },
      { word: "HOUSE", doodle: "house", hint: "a door, a roof, and home" },
      { word: "SNAKE", doodle: "snake", hint: "sssss, long and wiggly" },
      { word: "FLOWER", doodle: "flower", hint: "smells lovely in the sun" },
      /* these eight waited on a creature to be born into — see WORD_KINDS */
      { word: "KITE", doodle: "kite", hint: "it flies on a string" },
      { word: "LEAF", doodle: "leaf", hint: "it drifts down from a tree" },
      { word: "NEST", doodle: "nest", hint: "where baby birds live" },
      { word: "GIFT", doodle: "gift", hint: "a present with a ribbon" },
      { word: "YOYO", doodle: "yoyo", hint: "down it goes, up it comes" },
      { word: "CROWN", doodle: "crown", hint: "what a king or queen wears" },
      { word: "ZEBRA", doodle: "zebra", hint: "a horse in stripy pyjamas" },
      { word: "ORANGE", doodle: "orange", hint: "round, juicy and orange" },
    ],
  },
  {
    id: "reef",
    title: "Magic Reef",
    hint: "everything that swims",
    words: [
      { word: "FISH", doodle: "fish", hint: "swishes through the sea" },
      { word: "CRAB", doodle: "crab", hint: "scuttles sideways on the sand" },
      { word: "WHALE", doodle: "whale", hint: "the biggest one in the sea" },
      { word: "SHARK", doodle: "shark", hint: "a big grin full of teeth" },
      { word: "TURTLE", doodle: "turtle", hint: "slow and steady, house on its back" },
    ],
  },
  {
    id: "galaxy",
    title: "Giggle Galaxy",
    hint: "way, way up there",
    words: [
      { word: "STAR", doodle: "star", hint: "twinkles when it is dark" },
      { word: "MOON", doodle: "moon", hint: "glows while you are asleep" },
      { word: "MARS", doodle: "mars", hint: "the little red one up there" },
      { word: "ALIEN", doodle: "alien", hint: "waves hello from far away" },
      { word: "COMET", doodle: "comet", hint: "whooshes past with a sparkly tail" },
      { word: "ROCKET", doodle: "rocket", hint: "three, two, one, blast off" },
      { word: "PLANET", doodle: "planet", hint: "a big ball spinning in space" },
      { word: "UFO", doodle: "ufo", hint: "a saucer zipping through space" },
      { word: "VENUS", doodle: "venus", hint: "the bright evening one" },
    ],
  },
  {
    id: "farm",
    title: "Sunny Farm",
    hint: "moo, oink, quack",
    words: [
      { word: "COW", doodle: "cow", hint: "moo! munching the grass" },
      { word: "PIG", doodle: "pig", hint: "pink, and very muddy" },
      { word: "HEN", doodle: "chicken", hint: "cluck cluck, laying an egg" },
      { word: "DUCK", doodle: "duck", hint: "quack, quack, at the pond" },
      { word: "BARN", doodle: "barn", hint: "big red doors full of hay" },
      { word: "SHEEP", doodle: "sheep", hint: "as woolly as a cloud" },
      { word: "HORSE", doodle: "horse", hint: "clip clop down the lane" },
    ],
  },
  {
    id: "dino",
    title: "Dino Island",
    hint: "the big stompy ones",
    words: [
      { word: "EGG", doodle: "egg", hint: "something is wiggling inside" },
      { word: "TREX", doodle: "trex", hint: "tiny arms, enormous roar" },
      { word: "DINO", doodle: "longneck", hint: "a long neck for the tallest leaves" },
    ],
  },
];

/** Every word to write, in picker order. Derived — never hand-maintained. */
export const WORD_LESSONS: WordLesson[] = WORD_GROUPS.flatMap((g) => g.words);

/* ── lookups and guards ──────────────────────────────────────────────────── */

const BY_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const l of LETTER_LESSONS) map[l.char] = l.doodle;
  for (const n of ALL_NUMBER_LESSONS) if (n.doodle) map[n.numeral] = n.doodle;
  for (const w of WORD_LESSONS) map[w.word] = w.doodle;
  return map;
})();

/**
 * The doodle for a letter ("A"), a number ("3") or a word ("DOG").
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
      ...ALL_NUMBER_LESSONS.flatMap((n) => (n.doodle ? [n.doodle] : [])),
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
  numbers: ALL_NUMBER_LESSONS.length,
  sums: SUM_LESSONS.length,
  words: WORD_LESSONS.length,
} as const;
