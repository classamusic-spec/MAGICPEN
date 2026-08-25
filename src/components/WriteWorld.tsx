// ─── Write World: the shell around the tracing screen ───────────────────────
// Three worlds run through here — letters, numbers and words. They differ in
// what they teach and in what the child gets at the end, not in how tracing
// works, so this file owns the picking and the payoff and hands the actual
// writing to TraceScreen.
//
// The payoff is the point. A child does not trace an A because tracing is fun;
// they trace it because an apple appears. In Word World the payoff is the whole
// product: the word they wrote turns into a creature and walks into their
// world.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WritingWorldId } from "@/lib/types";
import { writingWorldById } from "@/lib/creatures";
import {
  LETTER_LESSONS, NUMBER_CATEGORIES, SUM_LESSONS, WORD_GROUPS,
  COUNTABLE_MAX, spokenName,
  type NumberCategory, type NumberLesson,
} from "@/lib/writing";
import { SHAPES, SHAPE_GLYPHS, SHAPE_BOX } from "@/lib/glyphs";
import { loadWriting, saveWriting, nextLessonKey, type WritingProgress } from "@/lib/storage";
import { sfxTap, sfxHappy } from "@/lib/audio";
import { sayLine, sayLetter, sayWord, hush, canSpeak } from "@/lib/speech";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { GlyphMark } from "@/components/ink/GlyphMark";
import { Doodle } from "@/components/ink/Doodles";
import TraceScreen, { type TraceTarget } from "@/components/TraceScreen";
import { hand } from "@/lib/ink";

/* ── one thing a child can be asked to write ─────────────────────────────── */

interface Lesson {
  /** Progress key, e.g. "letter:A". Persisted — do not rename. */
  key: string;
  /** What gets traced, in order. A word is several targets. */
  targets: TraceTarget[];
  /** Shown on the tracing sheet. */
  title: string;
  subtitle?: string;
  /** What appears when they finish. */
  doodle: string;
  /** How many of it — Math World counts them out. */
  count: number;
  rewardTitle: string;
  rewardLine: string;
  /**
   * What the reward says out loud, when the written line is not what should be
   * said. A number is the reason this exists: "Forty-two!" read off the screen
   * comes out "forty minus two" — a hyphen is a dash to a speech synthesizer —
   * and the digits alone come out "four two". Left unset, the reward speaks its
   * own title, which is right for everything else.
   */
  say?: string;
  /**
   * Math World: show this numeral, big, instead of counting things out.
   *
   * Set on every number too large to count — you cannot draw forty-seven
   * apples on a phone and expect a five-year-old to count them. The small
   * numbers leave it unset and keep their pile.
   */
  numeral?: string;
  /** Word World only: the word written, and the creature it becomes. */
  word?: string;
  /** Shapes: the name of the shape traced, e.g. "circle". Its reward shows the
   *  shape rather than a doodle, and it never counts or comes alive. */
  shape?: string;
}

/* ── the picker, built from the lessons rather than sliced out of them ───────
   Sections used to be `lessons.slice(SUM_OFFSET, SHAPE_OFFSET)` against a flat
   array, with the tile's index recomputed by hand — three numbers that had to
   agree, in three different places, every time the curriculum changed. They did
   not always agree.

   So a section now *owns* its lessons and the flat list is derived from the
   sections (see `sections`/`lessons` below). A tile carries the lesson it was
   built from and opens it by key, so there is no index arithmetic left to get
   wrong: a tile can only ever open the lesson whose face it is showing. */

interface PickerItem {
  lesson: Lesson;
  /** What the tile shows. Takes the stars so far — a word not yet written is
   *  drawn in pencil. */
  face: (stars: number) => React.ReactNode;
}

interface PickerSection {
  /** Stable id, for React keys. */
  id: string;
  title: string;
  hint: string;
  /** Narrowest a tile may be; the grid auto-fills from there. */
  min: string;
  items: PickerItem[];
  /** Lesson keys in *teaching* order, when that differs from the order the
   *  tiles are shown in. Only "keep going" reads it — see `letterSections`,
   *  where the shelf is alphabetical but the teaching order is by stroke. */
  nextKeys?: string[];
}

/** Turn a written line into one a synthesizer says right: math glyphs become
 *  words (a screen's "−" is often read as nothing at all), and an all-caps word
 *  is lowercased so it is blended, not spelled letter by letter. */
const forSpeech = (line: string): string =>
  line
    .replace(/[−–—-]/g, " minus ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\b[A-Z]{2,}\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();

/** One letter, drawn from the very glyph the child is about to trace. */
const glyphFace = (char: string, tone: string, size = 40) => (
  <GlyphMark char={char} size={size} color={tone} />
);

/** A numeral, one glyph per digit — "42" is a four and a two, side by side, the
 *  same two shapes the tracing screen will ask for and in the same order. Three
 *  digits get a little smaller so a hundred still fits a narrow tile. */
function numeralFace(numeral: string, tone: string, size: number) {
  const s = numeral.length >= 3 ? size * 0.78 : numeral.length === 2 ? size * 0.9 : size;
  return (
    <span className="flex items-end justify-center gap-1">
      {numeral.split("").map((d, i) => (
        <GlyphMark key={i} char={d} size={s} color={tone} />
      ))}
    </span>
  );
}

function letterSections(lowercase: boolean, tone: string): PickerSection[] {
  /* Two different right answers, so this keeps both.
     
     The shelf is A to Z, because that is how a child looks a letter up: it is
     the order of the alphabet song, and of every wall frieze they have ever
     seen. Hunting for "M" in a list that runs I, L, T, E, F, H is a puzzle
     nobody asked for.

     "Keep going" still follows `LETTER_LESSONS`' own order, which is by how
     hard the *stroke* is — straight lines, then diagonals, then curves. A
     four-year-old handed B as their second letter has been set up to fail. */
  const item = (l: (typeof LETTER_LESSONS)[number]) => {
    /* A separate progress key for each case (`letter:` / `lower:`) so a
       child's lowercase stars are their own, and the lowercase glyph is what
       gets traced — a different letterform, not a small capital. */
    const c = lowercase ? l.char.toLowerCase() : l.char;
    return {
      lesson: {
        key: `${lowercase ? "lower" : "letter"}:${c}`,
        targets: [{ char: c, say: c }],
        title: `Trace the letter ${c}`,
        subtitle: `${c} is for ${l.word}`,
        doodle: l.doodle,
        count: 1,
        rewardTitle: `${c} is for ${l.word}!`,
        rewardLine: "You wrote a whole letter.",
      },
      face: () => glyphFace(c, tone),
    };
  };

  const byStroke = LETTER_LESSONS.map(item);
  const alphabetical = LETTER_LESSONS.slice()
    .sort((a, b) => a.char.localeCompare(b.char))
    .map(item);

  return [{
    id: "letters",
    title: lowercase ? "Small letters" : "Big letters",
    hint: "tap one to write it",
    min: "4.3rem",
    items: alphabetical,
    nextKeys: byStroke.map((i) => i.lesson.key),
  }];
}

const SPOKEN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One number, in one of the four groups. The group supplies the progress
 *  prefix, so 0–9 keep the `digit:` keys they have always had. */
function numberItem(cat: NumberCategory, n: NumberLesson, tone: string): PickerItem {
  /* Counting art is only honest while the pile is countable. Past that the
     reward shows the numeral and says its name — which is the lesson anyway,
     once a number is bigger than a child's fingers. */
  const counts = n.doodle !== undefined && n.thing !== undefined && n.value <= COUNTABLE_MAX;
  // "1 moons" is not a sentence anybody says; one is the only count that needs it
  const thing = n.value === 1 ? (n.thing ?? "").replace(/s$/, "") : n.thing ?? "";
  return {
    lesson: {
      key: `${cat.prefix}${n.numeral}`,
      // one screen per digit, each spoken as the digit it is: "four", "two"
      targets: n.numeral.split("").map((d) => ({ char: d, say: SPOKEN[Number(d)] ?? d })),
      title: `Trace the number ${n.numeral}`,
      subtitle: counts
        ? n.value === 0 ? `${n.numeral} means none at all` : `${n.value} ${thing}`
        : n.name,
      doodle: n.doodle ?? "",
      count: n.value,
      numeral: counts ? undefined : n.numeral,
      rewardTitle: counts
        ? n.value === 0 ? "Zero! An empty plate." : `${n.value} ${thing}!`
        : `${capitalise(n.name)}!`,
      rewardLine: counts ? "Count them with your finger." : "You wrote a big number.",
      // never left to the screen's own words: "Forty-two!" reads as a subtraction
      say: counts
        ? n.value === 0 ? "zero. an empty plate." : `${n.name} ${thing}`
        : spokenName(n),
    },
    face: () => numeralFace(n.numeral, tone, 40),
  };
}

const SHAPE_HINT: Record<string, string> = {
  circle: "round and round, back to the start",
  square: "four straight sides, four corners",
  triangle: "three straight sides",
  star: "five points, without lifting your finger",
  diamond: "a square, tilted on its point",
  heart: "two bumps at the top, down to a point",
};

/** Numbers by group, then sums, then shapes. */
function numberSections(tone: string): PickerSection[] {
  const numbers: PickerSection[] = NUMBER_CATEGORIES.map((cat) => ({
    id: cat.prefix,
    title: cat.title,
    hint: cat.hint,
    // a two- or three-digit tile needs more room than a single figure does
    min: cat.lessons.some((n) => n.numeral.length > 1) ? "5rem" : "4.3rem",
    items: cat.lessons.map((n) => numberItem(cat, n, tone)),
  }));

  const sums: PickerSection = {
    id: "sums",
    title: "Sums",
    hint: "write the answer",
    min: "8rem",
    items: SUM_LESSONS.map((s) => {
      const q = `${s.a} ${s.op === "+" ? "+" : "−"} ${s.b}`;
      return {
        lesson: {
          key: `sum:${s.a}${s.op}${s.b}`,
          targets: [{ char: String(s.answer), say: SPOKEN[s.answer] ?? String(s.answer) }],
          title: `${q} = ?`,
          subtitle: "Write the answer",
          doodle: "star",
          count: 1,
          rewardTitle: `${q} = ${s.answer}`,
          rewardLine: "You worked it out!",
        },
        face: () => (
          <span className="ink-title text-fs-xl py-1" style={{ color: tone }}>{q}</span>
        ),
      };
    }),
  };

  /* Shapes — the marks a hand learns to make before any letter. Traced like a
     drawing (their own square box, no penmanship lines), never counted. */
  const shapes: PickerSection = {
    id: "shapes",
    title: "Shapes",
    hint: "the first thing a hand learns to draw",
    min: "4.3rem",
    items: SHAPES.map((name) => ({
      lesson: {
        key: `shape:${name}`,
        targets: [{ char: name, say: name, guide: SHAPE_GLYPHS[name], space: SHAPE_BOX }],
        title: `Trace a ${name}`,
        subtitle: SHAPE_HINT[name],
        doodle: "",
        count: 1,
        rewardTitle: `A ${name}!`,
        rewardLine: "You traced a whole shape.",
        shape: name,
      },
      face: () => <GlyphMark char={name} size={38} color={tone} weight={7} />,
    })),
  };

  return [...numbers, sums, shapes];
}

/** Words, in the world each one belongs to. */
function wordSections(tone: string): PickerSection[] {
  return WORD_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    hint: g.hint,
    min: "7.4rem",
    items: g.words.map((w) => ({
      lesson: {
        key: `word:${w.word}`,
        targets: w.word.split("").map((c) => ({ char: c, say: c })),
        title: `Write ${w.word}`,
        subtitle: w.hint,
        doodle: w.doodle,
        count: 1,
        rewardTitle: `${w.word} is alive!`,
        rewardLine: w.hint,
        word: w.word,
      },
      face: (stars: number) => (
        <>
          {/* A word not yet written is a creature not yet awake: drawn in
              pencil until the child writes it in. */}
          <span className={stars > 0 ? "anim-float-y block" : "block"}>
            <Doodle name={w.doodle} size={52} mono={stars > 0 ? undefined : "rgba(45,41,38,0.3)"} />
          </span>
          <span className="ink-title text-fs-md tracking-wide" style={{ color: tone }}>
            {w.word}
          </span>
        </>
      ),
    })),
  }));
}

/* ── earned stars ────────────────────────────────────────────────────────── */

function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span aria-hidden="true" className="flex justify-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Icon
          key={i}
          name={i <= n ? "star" : "starEmpty"}
          size={size}
          color={i <= n ? "#b8860b" : "rgba(45,41,38,0.3)"}
          fill={i <= n ? "var(--sun)" : undefined}
        />
      ))}
    </span>
  );
}

const starWord = (n: number) => (n === 0 ? "not tried yet" : `${n} of 3 stars`);

/* ── the picker tiles ────────────────────────────────────────────────────── */

function Tile({ lesson, index, stars, onPick, children, wide = false }: {
  lesson: Lesson; index: number; stars: number; onPick: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  const r = hand(index * 23 + 5);
  const tilt = (r() - 0.5) * 4.4;
  return (
    <button
      onClick={() => { sfxHappy(); onPick(); }}
      aria-label={`${lesson.title}. ${starWord(stars)}`}
      className={`ink-pinned relative block ${wide ? "w-full" : ""} enter-pop`}
      style={{ "--i": Math.min(index, 12), transform: `rotate(${tilt}deg)` } as React.CSSProperties}
    >
      <InkCard
        seed={index * 13 + 3}
        radius={14}
        className="p-2"
        contentClassName="grid place-items-center gap-1"
        style={{ minHeight: "var(--tap-lg)" }}
      >
        {children}
        <Stars n={stars} size={13} />
      </InkCard>
      {stars === 3 && (
        <Tape
          seed={index + 3}
          style={{ width: 34, height: 14, top: -6, right: 6, transform: `rotate(${(r() - 0.5) * 18}deg)` }}
        />
      )}
    </button>
  );
}

/* ── the reward ──────────────────────────────────────────────────────────── */

function Reward({ world, lesson, stars, hasNext, onNext, onPicker, onBorn }: {
  world: WritingWorldId;
  lesson: Lesson;
  stars: 1 | 2 | 3;
  hasNext: boolean;
  onNext: () => void;
  onPicker: () => void;
  onBorn?: () => void;
}) {
  const w = writingWorldById(world);
  const isWord = world === "words";
  const wordChars = useMemo(() => (lesson.word ? lesson.word.split("") : []), [lesson.word]);

  /* ── sounding out ──────────────────────────────────────────────────────────
     A word is not letters in a row, it is a blend — and blending is the skill
     Word World exists to teach. So the reward does not just say the answer: it
     sounds it out, one letter lit and named at a time, then the whole word
     said fast. `hi` is which letter is glowing right now; -1 is none. */
  const [hi, setHi] = useState(-1);
  const timers = useRef<number[]>([]);
  const clearBlend = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  /* What the payoff says out loud. A lesson that knows how it should sound —
     every number does — says so; everything else has its written line read. */
  const spoken = lesson.say ?? forSpeech(lesson.rewardTitle);

  const soundOut = useCallback(() => {
    clearBlend();
    hush();
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const step = 720;
    wordChars.forEach((c, i) => at(i * step, () => { setHi(i); sayLetter(c); }));
    const after = wordChars.length * step;
    at(after, () => { setHi(-1); sayWord((lesson.word ?? "").toLowerCase()); });  // …now the whole word
    at(after + 900, () => sayLine(spoken));  // "dog is alive!"
  }, [wordChars, lesson.word, spoken, clearBlend]);

  /* The payoff, out loud. A word sounds itself out; everything else just says
     its line — "A is for Apple!" — a beat after the celebration lands. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (isWord && wordChars.length) soundOut();
      else sayLine(spoken);
    }, 480);
    return () => { window.clearTimeout(id); clearBlend(); hush(); };
  }, [spoken, isWord, wordChars.length, soundOut, clearBlend]);
  // Math World counts the thing out; everywhere else one big one is the prize.
  const many = Math.min(lesson.count, COUNTABLE_MAX);

  return (
    <div className="screen overflow-y-auto no-scrollbar" style={{ background: w.gradient }}>
      <div className="min-h-full grid place-items-center pad-x pad-t pad-b">
        <InkCard
          seed={64}
          radius={22}
          className="w-full max-w-md p-5 text-center anim-pop-in"
          contentClassName="grid gap-2 justify-items-center"
        >
          <Stars n={stars} size={34} />
          <span className="visually-hidden" role="status">
            {lesson.rewardTitle}. {starWord(stars)}.
          </span>

          <span className="grid place-items-center min-h-[7.5rem] py-1">
            {lesson.shape ? (
              <span className="anim-float-y block">
                <GlyphMark char={lesson.shape} size={112} color={w.tone} weight={9} />
              </span>
            ) : lesson.numeral ? (
              /* Too many to count, so the number itself is the prize: the
                 numeral they just wrote, big, with its name underneath. */
              <span className="anim-float-y flex items-end justify-center gap-1.5">
                {lesson.numeral.split("").map((d, i) => (
                  <GlyphMark key={i} char={d} size={lesson.numeral!.length >= 3 ? 88 : 100} color={w.tone} weight={9} />
                ))}
              </span>
            ) : lesson.count === 0 ? (
              <span className="ink-hand text-fs-lg opacity-70">nothing at all!</span>
            ) : many > 1 ? (
              <span className="flex flex-wrap justify-center gap-1.5 max-w-[16rem]">
                {Array.from({ length: many }, (_, i) => (
                  <span key={i} className="anim-pop-in" style={{ animationDelay: `${i * 90}ms` }}>
                    <Doodle name={lesson.doodle} size={44} />
                  </span>
                ))}
              </span>
            ) : (
              <span className="anim-float-y block">
                <Doodle name={lesson.doodle} size={112} />
              </span>
            )}
          </span>

          {/* the blend itself: the letters they wrote, lighting up and sounding
              out one by one, then the whole word — this is the reading skill,
              not decoration */}
          {isWord && wordChars.length > 0 && (
            <div className="grid gap-2 justify-items-center">
              <div className="flex items-end justify-center gap-1.5" aria-hidden="true">
                {wordChars.map((c, i) => {
                  const on = hi === i;
                  return (
                    <span
                      key={i}
                      className="grid place-items-center rounded-xl transition-transform"
                      style={{
                        width: 42, height: 52,
                        background: on ? "#fffaf0" : "rgba(255,250,240,0.55)",
                        border: `2.5px solid ${on ? "var(--ink)" : "rgba(45,41,38,0.35)"}`,
                        transform: on ? "translateY(-4px) scale(1.08)" : "none",
                      }}
                    >
                      <GlyphMark char={c} size={30} color={on ? w.tone : "rgba(45,41,38,0.6)"} />
                    </span>
                  );
                })}
              </div>
              {canSpeak() && (
                <button
                  onClick={() => { sfxTap(); soundOut(); }}
                  className="ink-title text-fs-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                  style={{ background: "#fffaf0", border: "2.5px solid var(--ink)" }}
                >
                  <Icon name="soundOn" size={16} />
                  Sound it out
                </button>
              )}
            </div>
          )}

          <h2 className="ink-title text-fs-2xl leading-tight">{lesson.rewardTitle}</h2>
          <p className="ink-hand text-fs-sm">{lesson.rewardLine}</p>
          <span className="block w-32"><Scribble seed={31} height={9} /></span>

          <div className="grid gap-2 w-full mt-1">
            {isWord && onBorn && (
              <InkButton
                tone={w.tone}
                seed={12}
                radius={20}
                onClick={() => { sfxHappy(); onBorn(); }}
                className="w-full font-display font-extrabold text-fs-xl"
                style={{ minHeight: "var(--tap-lg)" }}
              >
                <Icon name="sparkle" size={22} color="#fffaf0" fill="#fffaf0" />
                <span className="ink-on-wax">Set it free!</span>
              </InkButton>
            )}
            {hasNext && (
              <InkButton
                tone={isWord ? undefined : w.tone}
                seed={45}
                radius={20}
                onClick={() => { sfxTap(); onNext(); }}
                className="w-full font-display font-extrabold text-fs-lg"
                style={{ minHeight: "var(--tap)" }}
              >
                <span className={isWord ? "" : "ink-on-wax"}>
                  {isWord ? "Write another word" : "Next one"}
                </span>
              </InkButton>
            )}
            <InkButton
              seed={77}
              radius={18}
              onClick={() => { sfxTap(); onPicker(); }}
              className="w-full font-display font-bold text-fs-md"
              style={{ minHeight: "var(--tap)" }}
            >
              <Icon name="back" size={19} />
              Pick another
            </InkButton>
          </div>
        </InkCard>
      </div>
    </div>
  );
}

/* ── the world ───────────────────────────────────────────────────────────── */

export default function WriteWorld({ world, onBack, onBorn }: {
  world: WritingWorldId;
  onBack: () => void;
  /** Word World: the child chose to release what they wrote into their world. */
  onBorn: (born: { word: string; doodle: string }) => void;
}) {
  const w = writingWorldById(world);
  /* Letter World teaches both cases. Capitals first — they are what a child is
     taught to write first and the easier shapes — with a tap to switch to the
     lowercase they will actually read. */
  const [lowercase, setLowercase] = useState(false);

  /* The sections are the source of truth; the flat list is what falls out of
     them. Everything downstream — "keep going", "next one", how many are done —
     reads the flat list, and nothing anywhere has to know where one section
     ends and the next begins. */
  const sections = useMemo(
    () =>
      world === "letters" ? letterSections(lowercase, w.tone)
        : world === "numbers" ? numberSections(w.tone)
          : wordSections(w.tone),
    [world, lowercase, w.tone]
  );
  const lessons = useMemo(() => sections.flatMap((s) => s.items.map((i) => i.lesson)), [sections]);
  /** Where each lesson sits in the flat list — the tiles' only use for a number
   *  is to seed their scatter, so it is looked up, never counted out. */
  const orderOf = useMemo(
    () => new Map(lessons.map((l, i) => [l.key, i])),
    [lessons]
  );

  const [progress, setProgress] = useState<WritingProgress>(() => loadWriting());
  /* Which lesson is open, held by its key rather than its position: a key
     names one lesson and only that lesson, so a tile cannot open its
     neighbour. */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [earned, setEarned] = useState<1 | 2 | 3 | null>(null);

  const activeIndex = activeKey === null ? -1 : lessons.findIndex((l) => l.key === activeKey);
  const active = activeIndex < 0 ? null : lessons[activeIndex];
  const done = lessons.filter((l) => (progress[l.key] ?? 0) > 0).length;

  /* Where the stars say to go next: the first untried lesson, or once all are
     tried, the shakiest one for another gentle go. null once every lesson is a
     confident three stars — then there is nothing to nudge. */
  /* Teaching order, which is not always the order the tiles are shown in. */
  const teachKeys = useMemo(
    () => sections.flatMap((s) => s.nextKeys ?? s.items.map((i) => i.lesson.key)),
    [sections]
  );
  const nextKey = useMemo(() => nextLessonKey(teachKeys, progress), [teachKeys, progress]);
  const anyStarted = done > 0;

  const open = (key: string) => { setActiveKey(key); setEarned(null); };
  const close = () => { setActiveKey(null); setEarned(null); };

  const finish = (stars: 1 | 2 | 3) => {
    if (active) setProgress(saveWriting(active.key, stars));
    setEarned(stars);
  };

  /* ── tracing ── */
  if (active && earned === null) {
    return (
      <TraceScreen
        /* keyed on the lesson so a new one always starts from a clean sheet,
           rather than relying on the screen to reset itself */
        key={active.key}
        targets={active.targets}
        title={active.title}
        subtitle={active.subtitle}
        color={w.tone}
        onBack={close}
        onComplete={(r) => finish(r.stars)}
      />
    );
  }

  /* ── reward ── */
  if (active && earned !== null) {
    const next = lessons[activeIndex + 1];
    return (
      <Reward
        world={world}
        lesson={active}
        stars={earned}
        hasNext={Boolean(next)}
        onNext={() => { if (next) open(next.key); }}
        onPicker={close}
        onBorn={active.word ? () => onBorn({ word: active.word!, doodle: active.doodle }) : undefined}
      />
    );
  }

  /* Capitals or the lowercase children actually read. Both drawn from their own
     glyphs, so ABC and abc show the very shapes to trace. */
  const caseToggle = (
    <div className="flex justify-center pt-3">
      <div
        role="tablist"
        aria-label="Letter case"
        className="inline-flex gap-1 p-1 rounded-full"
        style={{ background: "#fffaf0", border: "2.5px solid var(--ink)" }}
      >
        {([["Big ABC", false], ["small abc", true]] as const).map(([label, lc]) => {
          const on = lowercase === lc;
          return (
            <button
              key={label}
              role="tab"
              aria-selected={on}
              onClick={() => { if (!on) { sfxTap(); setLowercase(lc); } }}
              className="ink-title text-fs-sm px-4 py-1.5 rounded-full transition-colors"
              style={{
                background: on ? w.tone : "transparent",
                color: on ? "#fffaf0" : "var(--ink)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ── picker ── */
  return (
    <div className="screen ink-paper overflow-y-auto no-scrollbar">
      <div
        className="mx-auto w-full max-w-3xl pad-x pad-t"
        style={{ paddingBottom: "max(var(--sp-6), calc(var(--safe-b) + var(--sp-5)))" }}
      >
        <header className="flex items-center gap-3 anim-rise-in">
          <InkButton
            seed={9}
            radius={16}
            onClick={() => { sfxTap(); onBack(); }}
            aria-label="Back to the sketchbook"
            className="shrink-0"
            style={{ width: "var(--tap)", height: "var(--tap)" }}
          >
            <Icon name="back" size={22} />
          </InkButton>
          <div className="min-w-0 flex-1">
            <h1 className="ink-title text-fs-2xl leading-none truncate">{w.name}</h1>
            <p className="ink-hand text-fs-xs truncate">{w.tagline}</p>
          </div>
          <span
            aria-label={`${done} of ${lessons.length} done`}
            className="ink-title text-fs-xs px-2.5 py-1 rounded-full shrink-0"
            style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
          >
            {done}/{lessons.length}
          </span>
        </header>

        {/* The stars, put to work: one warm tap that takes the child to the
            right next thing — the first they have not tried, or the one they
            found hardest — instead of leaving a four-year-old to choose from a
            wall of tiles. Gone only when every lesson is a confident three
            stars, which is a finish line, not a gap. */}
        {nextKey && (
          <div className="pt-4 anim-rise-in">
            <InkButton
              tone={w.tone}
              seed={51}
              radius={18}
              onClick={() => { sfxHappy(); open(nextKey); }}
              className="w-full font-display font-extrabold text-fs-lg"
              style={{ minHeight: "var(--tap)" }}
            >
              <span className="ink-on-wax flex items-center justify-center gap-2">
                <Icon name="play" size={20} color="#fffaf0" fill="#fffaf0" />
                {anyStarted ? "Keep going" : "Start here"}
              </span>
            </InkButton>
          </div>
        )}

        {/* One render for all three worlds. A tile is handed the lesson it was
            built beside and opens it by key, so what a tile shows and what it
            opens cannot drift apart. */}
        {sections.map((s) => (
          <Section key={s.id} title={s.title} hint={s.hint}>
            {s.id === "letters" && caseToggle}
            <ul
              className="grid gap-2.5 pt-3"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${s.min}, 1fr))` }}
            >
              {s.items.map(({ lesson, face }) => {
                const stars = progress[lesson.key] ?? 0;
                return (
                  <li key={lesson.key}>
                    <Tile
                      lesson={lesson}
                      index={orderOf.get(lesson.key) ?? 0}
                      stars={stars}
                      onPick={() => open(lesson.key)}
                      wide
                    >
                      {face(stars)}
                    </Tile>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

        <p className="ink-hand text-fs-2xs text-center mt-6 opacity-80">
          For grown-ups: {w.teaches}. Nothing is ever marked wrong — the stars say how
          close it was, and every try counts.
        </p>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 enter" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ink-title text-fs-xl">{title}</h2>
        <span className="ink-hand text-fs-2xs">{hint}</span>
      </div>
      {children}
    </section>
  );
}
