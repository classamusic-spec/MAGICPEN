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
  LETTER_LESSONS, NUMBER_LESSONS, SUM_LESSONS, WORD_LESSONS,
} from "@/lib/writing";
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
  /** Word World only: the word written, and the creature it becomes. */
  word?: string;
}

const say = (c: string) => c;

function letterLessons(): Lesson[] {
  return LETTER_LESSONS.map((l) => ({
    key: `letter:${l.char}`,
    targets: [{ char: l.char, say: say(l.char) }],
    title: `Trace the letter ${l.char}`,
    subtitle: `${l.char} is for ${l.word}`,
    doodle: l.doodle,
    count: 1,
    rewardTitle: `${l.char} is for ${l.word}!`,
    rewardLine: "You wrote a whole letter.",
  }));
}

/** The same twenty-six, in the letters children actually read. A separate
 *  progress key (`lower:`) so a child's lowercase stars are their own, and the
 *  lowercase glyph is what gets traced — a different letterform, not a small
 *  capital. */
function lowerLessons(): Lesson[] {
  return LETTER_LESSONS.map((l) => {
    const lc = l.char.toLowerCase();
    return {
      key: `lower:${lc}`,
      targets: [{ char: lc, say: say(lc) }],
      title: `Trace the letter ${lc}`,
      subtitle: `${lc} is for ${l.word}`,
      doodle: l.doodle,
      count: 1,
      rewardTitle: `${lc} is for ${l.word}!`,
      rewardLine: "You wrote a whole letter.",
    };
  });
}

const SPOKEN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function numberLessons(): Lesson[] {
  const digits: Lesson[] = NUMBER_LESSONS.map((n) => ({
    key: `digit:${n.digit}`,
    targets: [{ char: n.digit, say: SPOKEN[n.count] ?? n.digit }],
    title: `Trace the number ${n.digit}`,
    subtitle: n.count === 0 ? `${n.digit} means none at all` : `${n.digit} ${n.thing}`,
    doodle: n.doodle,
    count: n.count,
    rewardTitle: n.count === 0 ? "Zero! An empty plate." : `${n.count} ${n.thing}!`,
    rewardLine: "Count them with your finger.",
  }));
  const sums: Lesson[] = SUM_LESSONS.map((s) => {
    const q = `${s.a} ${s.op === "+" ? "+" : "−"} ${s.b}`;
    return {
      key: `sum:${s.a}${s.op}${s.b}`,
      targets: [{ char: String(s.answer), say: SPOKEN[s.answer] ?? String(s.answer) }],
      title: `${q} = ?`,
      subtitle: "Write the answer",
      doodle: "star",
      count: 1,
      rewardTitle: `${q} = ${s.answer}`,
      rewardLine: "You worked it out!",
    };
  });
  return [...digits, ...sums];
}

function wordLessons(): Lesson[] {
  return WORD_LESSONS.map((w) => ({
    key: `word:${w.word}`,
    targets: w.word.split("").map((c) => ({ char: c, say: c })),
    title: `Write ${w.word}`,
    subtitle: w.hint,
    doodle: w.doodle,
    count: 1,
    rewardTitle: `${w.word} is alive!`,
    rewardLine: w.hint,
    word: w.word,
  }));
}

/** How many digit lessons come before the sums, so the picker can split them. */
const SUM_OFFSET = NUMBER_LESSONS.length;

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
  const soundOut = useCallback(() => {
    clearBlend();
    hush();
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const step = 720;
    wordChars.forEach((c, i) => at(i * step, () => { setHi(i); sayLetter(c); }));
    const after = wordChars.length * step;
    at(after, () => { setHi(-1); sayWord(lesson.word ?? ""); });   // …now the whole word
    at(after + 900, () => sayLine(lesson.rewardTitle));            // "Dog is alive!"
  }, [wordChars, lesson.word, lesson.rewardTitle, clearBlend]);

  /* The payoff, out loud. A word sounds itself out; everything else just says
     its line — "A is for Apple!" — a beat after the celebration lands. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (isWord && wordChars.length) soundOut();
      else sayLine(lesson.rewardTitle);
    }, 480);
    return () => { window.clearTimeout(id); clearBlend(); hush(); };
  }, [lesson.rewardTitle, isWord, wordChars.length, soundOut, clearBlend]);
  // Math World counts the thing out; everywhere else one big one is the prize.
  const many = Math.min(lesson.count, 9);

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
            {lesson.count === 0 ? (
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
  const lessons = useMemo(
    () =>
      world === "letters"
        ? lowercase ? lowerLessons() : letterLessons()
        : world === "numbers" ? numberLessons() : wordLessons(),
    [world, lowercase]
  );

  const [progress, setProgress] = useState<WritingProgress>(() => loadWriting());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [earned, setEarned] = useState<1 | 2 | 3 | null>(null);

  const active = activeIndex === null ? null : lessons[activeIndex];
  const done = lessons.filter((l) => (progress[l.key] ?? 0) > 0).length;

  /* Where the stars say to go next: the first untried lesson, or once all are
     tried, the shakiest one for another gentle go. null once every lesson is a
     confident three stars — then there is nothing to nudge. */
  const nextKey = useMemo(() => nextLessonKey(lessons.map((l) => l.key), progress), [lessons, progress]);
  const nextIndex = nextKey ? lessons.findIndex((l) => l.key === nextKey) : -1;
  const anyStarted = done > 0;

  const open = (i: number) => { setActiveIndex(i); setEarned(null); };

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
        onBack={() => setActiveIndex(null)}
        onComplete={(r) => finish(r.stars)}
      />
    );
  }

  /* ── reward ── */
  if (active && earned !== null) {
    const hasNext = activeIndex !== null && activeIndex + 1 < lessons.length;
    return (
      <Reward
        world={world}
        lesson={active}
        stars={earned}
        hasNext={hasNext}
        onNext={() => open((activeIndex ?? 0) + 1)}
        onPicker={() => { setActiveIndex(null); setEarned(null); }}
        onBorn={active.word ? () => onBorn({ word: active.word!, doodle: active.doodle }) : undefined}
      />
    );
  }

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
        {nextIndex >= 0 && (
          <div className="pt-4 anim-rise-in">
            <InkButton
              tone={w.tone}
              seed={51}
              radius={18}
              onClick={() => { sfxHappy(); open(nextIndex); }}
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

        {world === "letters" && (
          <Section title={lowercase ? "Small letters" : "Big letters"} hint="tap one to write it">
            {/* Capitals or the lowercase children actually read. Both drawn from
                their own glyphs, so ABC and abc show the very shapes to trace. */}
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
            <ul className="grid gap-2.5 pt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(4.3rem, 1fr))" }}>
              {lessons.map((l, i) => (
                <li key={l.key}>
                  <Tile lesson={l} index={i} stars={progress[l.key] ?? 0} onPick={() => open(i)} wide>
                    <GlyphMark char={l.targets[0].char} size={40} color={w.tone} />
                  </Tile>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {world === "numbers" && (
          <>
            <Section title="Numbers" hint="0 to 9">
              <ul className="grid gap-2.5 pt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(4.3rem, 1fr))" }}>
                {lessons.slice(0, SUM_OFFSET).map((l, i) => (
                  <li key={l.key}>
                    <Tile lesson={l} index={i} stars={progress[l.key] ?? 0} onPick={() => open(i)} wide>
                      <GlyphMark char={l.targets[0].char} size={40} color={w.tone} />
                    </Tile>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Sums" hint="write the answer">
              <ul className="grid gap-2.5 pt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))" }}>
                {lessons.slice(SUM_OFFSET).map((l, i) => (
                  <li key={l.key}>
                    <Tile
                      lesson={l}
                      index={SUM_OFFSET + i}
                      stars={progress[l.key] ?? 0}
                      onPick={() => open(SUM_OFFSET + i)}
                      wide
                    >
                      <span className="ink-title text-fs-xl py-1" style={{ color: w.tone }}>
                        {l.title.replace(" = ?", "")}
                      </span>
                    </Tile>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}

        {world === "words" && (
          <Section title="Words to write" hint="write it — it comes alive">
            <ul className="grid gap-3 pt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(7.4rem, 1fr))" }}>
              {lessons.map((l, i) => {
                const stars = progress[l.key] ?? 0;
                return (
                  <li key={l.key}>
                    <Tile lesson={l} index={i} stars={stars} onPick={() => open(i)} wide>
                      {/* A word not yet written is a creature not yet awake:
                          drawn in pencil until the child writes it in. */}
                      <span className={stars > 0 ? "anim-float-y block" : "block"}>
                        <Doodle
                          name={l.doodle}
                          size={52}
                          mono={stars > 0 ? undefined : "rgba(45,41,38,0.3)"}
                        />
                      </span>
                      <span className="ink-title text-fs-md tracking-wide" style={{ color: w.tone }}>
                        {l.word}
                      </span>
                    </Tile>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

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
