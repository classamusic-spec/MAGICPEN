// ─── The grown-up's decisions ────────────────────────────────────────────────
// Drawlings is built for four- to seven-year-olds, which in the United States
// puts it squarely inside COPPA's definition of a child-directed service, and
// inside the Kids categories of both app stores. This module holds the two
// decisions that must belong to a grown-up rather than to the child, and the
// gate that establishes a grown-up is the one making them.
//
// The design starts from the strongest possible position: **collect nothing.**
// Drawlings has no accounts, no ads, no analytics, no third-party SDKs, and
// every drawing lives in this browser's own storage. Most of COPPA's machinery
// attaches to *collecting* personal information from a child; the cleanest way
// to honour it is to never collect any. That is a product decision already made
// and worth protecting — this module exists to guard the one exception.
//
// So Drawlings collects nothing and sends nothing — there is no exception left.
// What remains is the parental gate itself, which still guards the doors that
// lead *out* of the app: the share sheet and printing. A young child should not
// be able to open those alone, and both stores require a gate in front of them,
// so the challenge below lives on.
//
// On the gate itself: an age question a child answers is not a gate — a
// five-year-old will happily tap "yes, I am a grown-up", and both app stores
// know it. What is accepted is a challenge that is trivial for an adult and
// genuinely out of reach for a young child. Two-digit arithmetic written in
// words is the long-standing pattern, and it is what this uses.
//
// None of this is legal advice, and nothing here replaces a review by a lawyer
// before the app is listed. What it does is make the honest, conservative
// choice the default, and make the risky thing impossible to switch on by
// accident.

const KEY = "magicpen.consent.v1";

export interface ConsentState {
  /** A grown-up has passed the parental gate at least once on this device. */
  gatePassed: boolean;
  /** When the grown-up last passed the gate, for the record. */
  decidedAt: number | null;
}

const EMPTY: ConsentState = { gatePassed: false, decidedAt: null };

export function loadConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<ConsentState>;
    return {
      gatePassed: v.gatePassed === true,
      decidedAt: typeof v.decidedAt === "number" ? v.decidedAt : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveConsent(next: Partial<ConsentState>): ConsentState {
  const merged: ConsentState = { ...loadConsent(), ...next, decidedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* private mode — session only */ }
  return merged;
}

/* ── the parental gate ───────────────────────────────────────────────────── */

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];

export interface GateChallenge {
  /** The question, with both numbers spelled out — a young child cannot read it. */
  prompt: string;
  /** The correct answer, as a number. */
  answer: number;
  /** Four options including the answer, already shuffled. */
  options: number[];
}

/**
 * Build a fresh parental gate challenge.
 *
 * Spelled-out numbers and a two-digit product: an adult reads it at a glance, a
 * pre-reader cannot read the words at all, and a child who can read early
 * numerals still cannot multiply. The wrong options are deliberately close to
 * the answer so it cannot be guessed by "the biggest one".
 */
export function makeGateChallenge(rand: () => number = Math.random): GateChallenge {
  const a = 3 + Math.floor(rand() * 6);   // 3..8
  const b = 4 + Math.floor(rand() * 5);   // 4..8
  const answer = a * b;
  const opts = new Set<number>([answer]);
  while (opts.size < 4) {
    const delta = 1 + Math.floor(rand() * 9);
    const cand = answer + (rand() < 0.5 ? -delta : delta);
    if (cand > 0 && cand !== answer) opts.add(cand);
  }
  const options = [...opts];
  // Fisher–Yates, so the answer is not always in the same slot
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { prompt: `What is ${WORDS[a]} times ${WORDS[b]}?`, answer, options };
}
