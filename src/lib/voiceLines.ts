// ─── The spoken corpus ───────────────────────────────────────────────────────
// Every distinct line the app says out loud, derived from the same curriculum
// data the screens read — so the recorded-voice generator renders exactly what
// will be asked for, and a test can prove the shipped clips cover it.
//
// This is not used by the running app: `speech.ts` speaks free text and looks a
// clip up by that text at play time. This module exists for the *tooling* — the
// generator that makes the clips, and `voice.test.ts` that checks none is
// missing. It lives beside the data it reads so a new lesson runs into the test
// that will fail until its clip is generated.
//
// It reproduces, faithfully, the strings the components build. Anything here
// that drifts from a component is caught the moment a clip is asked for that
// was never made — the app just falls back to the browser voice — but the test
// turns that soft miss into a loud one at build time.

import {
  LETTER_LESSONS, NUMBER_CATEGORIES, SUM_LESSONS, WORD_LESSONS,
  COUNTABLE_MAX, spokenName, type NumberLesson,
} from "./writing";
import { SHAPE_GROUPS, bareName } from "./shapes";
import { DRAW_LESSONS } from "./lessons";
import { CREATURE_FACTS } from "./facts";

/** How a line is said — used to pace letters slower than sentences, the way
 *  `speech.ts` does with rate. */
export type SpokenKind = "letter" | "number" | "word" | "line";

export interface SpokenLine {
  /** What the app asks for, and the key the clip is stored under. For a letter
   *  this is the letter itself — "A". */
  text: string;
  kind: SpokenKind;
  /**
   * What the generator actually synthesizes, when that must differ from `text`.
   *
   * A single letter is the reason this exists. Handed a lone "A", a text-to-
   * speech engine is free to read either the letter's *name* ("ay") or its
   * *sound* ("ah"), and it picks non-deterministically — several letters came
   * back saying the sound, which is the wrong thing for a screen that is
   * teaching letter names. So a letter is synthesized from an explicit spelling
   * of its name ("Eigh", "You", "Double-you") while still being stored, and
   * looked up, under the plain letter. Everything else leaves this unset and is
   * synthesized from `text`.
   */
  say?: string;
}

/**
 * How to make a text-to-speech engine say each letter's NAME rather than its
 * sound. Chosen by generating each candidate and transcribing it back until the
 * transcript was the letter again (see scripts/voice) — these are not guesses.
 * The vowels and a handful of consonants are the ones that go wrong; the rest
 * are spelled their ordinary way for consistency and to pin the reading.
 */
export const LETTER_NAME: Record<string, string> = {
  a: "Eigh", b: "Bee", c: "See", d: "Dee", e: "Ee", f: "Eff", g: "Gee",
  h: "Aitch", i: "Eye", j: "Jay", k: "Kay", l: "Ell", m: "Em", n: "En",
  o: "Oh", p: "Pee", q: "Cue", r: "Ar", s: "Ess", t: "Tee", u: "You",
  v: "Vee", w: "Double-you", x: "Ex", y: "Why", z: "Zee",
};

/** The name-spelling for a one-character letter line, or undefined for anything
 *  else. A digit ("4") is left alone — it is spoken as a number elsewhere. */
export function sayFor(text: string): string | undefined {
  return /^[A-Za-z]$/.test(text) ? LETTER_NAME[text.toLowerCase()] : undefined;
}

/** The `forSpeech` cleanup from WriteWorld: math glyphs become words, and an
 *  all-caps word is lowercased so it is blended, not spelled. Kept in step with
 *  the component by the coverage test. */
const forSpeech = (line: string): string =>
  line
    .replace(/[−–—-]/g, " minus ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\b[A-Z]{2,}\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SPOKEN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** What Math World says at the reward for one number. */
function numberSpoken(n: NumberLesson): string {
  const counts = n.doodle !== undefined && n.thing !== undefined && n.value <= COUNTABLE_MAX;
  const thing = n.value === 1 ? (n.thing ?? "").replace(/s$/, "") : n.thing ?? "";
  return counts
    ? n.value === 0 ? "zero. an empty plate." : `${n.name} ${thing}`
    : spokenName(n);
}

/** Every distinct line the app speaks, in a stable order. */
export function spokenCorpus(): SpokenLine[] {
  const order: string[] = [];
  const kinds = new Map<string, SpokenKind>();
  const add = (raw: string, kind: SpokenKind) => {
    const text = (raw ?? "").trim();
    if (!text) return;
    if (!kinds.has(text)) { kinds.set(text, kind); order.push(text); }
    // a full line outranks a bare token if the same text arrives as both
    else if (kind === "line") kinds.set(text, "line");
  };

  // letters: the name, said on the sheet, and the reward line
  for (const l of LETTER_LESSONS) {
    add(l.char, "letter");
    add(`${l.char} is for ${l.word}!`, "line");
  }

  // numbers: the reward, and each digit said on the sheet
  for (const cat of NUMBER_CATEGORIES) {
    for (const n of cat.lessons) {
      add(numberSpoken(n), "line");
      for (const d of n.numeral.split("")) add(SPOKEN[Number(d)] ?? d, "number");
    }
  }

  // sums: the worked line, and the answer said on the sheet
  for (const s of SUM_LESSONS) {
    const q = `${s.a} ${s.op === "+" ? "+" : "−"} ${s.b}`;
    add(forSpeech(`${q} = ${s.answer}`), "line");
    add(SPOKEN[s.answer] ?? String(s.answer), "number");
  }

  // words: each letter blended, the whole word, then the reward line
  for (const w of WORD_LESSONS) {
    for (const c of w.word.split("")) add(c, "letter");
    add(w.word.toLowerCase(), "word");
    add(forSpeech(`${w.word} is alive!`), "line");
  }

  // shapes: the name on the sheet, and the reward
  for (const g of SHAPE_GROUPS) {
    for (const sh of g.lessons) {
      add(bareName(sh), "line");
      add(sh.like ? `${capitalise(sh.label)}. ${sh.like}` : forSpeech(`${capitalise(sh.label)}!`), "line");
    }
  }

  // drawing school: the target on the sheet, and the reward
  for (const l of DRAW_LESSONS) {
    add(l.title.replace(/^Draw (?:a |an |the )?/i, ""), "line");
    add(`You drew ${l.title.replace(/^Draw /i, "")}!`, "line");
  }

  // onboarding
  for (const s of [
    "Draw anything, and it comes alive.",
    "Draw it. It comes alive. Then look after it.",
    "All set. Let's draw something.",
  ]) add(s, "line");

  // creature facts, said in the world
  for (const f of Object.values(CREATURE_FACTS)) add(f, "line");

  return order.map((text) => {
    const say = sayFor(text);
    return say ? { text, kind: kinds.get(text)!, say } : { text, kind: kinds.get(text)! };
  });
}
