// ─── Drawing School: the shell around a drawing lesson ──────────────────────
// Until now the only way into a world was to draw something freehand, which
// means a four-year-old who wants a fish in their reef and cannot yet draw a
// fish gets nothing at all. Writing School already answered this shape of
// problem for letters — a faint guide under the finger and the child writes an
// A on their first try — and this is the same answer for drawing.
//
// The promise this file has to keep is that **a traced drawing is still the
// child's drawing**. The guide is a ghost that shows the way; what leaves here
// through `onDrawn` is the child's own strokes, and the reward screen shows
// those strokes rather than the doodle they were traced from. Stamping the
// doodle would be faster, would look better, and would quietly break the only
// promise the app makes.
//
// Structurally this is Write World: pick a lesson, trace it, get the payoff.
// The picking and the payoff live here; the tracing is TraceScreen's job.

import { useMemo, useState } from "react";
import type { Stroke } from "@/lib/types";
import { DRAW_LESSONS, LESSON_WORLDS, lessonsForWorld, type DrawLesson } from "@/lib/lessons";
import { DOODLE_BOX, doodleLesson } from "@/lib/doodleTrace";
import { WORLD_PACKS } from "@/lib/creatures";
import { loadWriting, saveWriting, type WritingProgress } from "@/lib/storage";
import { sfxHappy, sfxTap } from "@/lib/audio";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { Doodle } from "@/components/ink/Doodles";
import TraceScreen from "@/components/TraceScreen";
import { hand } from "@/lib/ink";

/* ── the worlds, as this screen needs them ───────────────────────────────── */

/**
 * The crayon each world's lessons are traced in.
 *
 * Taken from the darkest stop of the world's own gradient, because that is the
 * end of it that still reads as a line on cream paper — the pale end of a
 * gradient is a background, not a pencil.
 */
const WORLD_TONE: Record<string, string> = {
  ocean: "#0e7fd6",
  space: "#7c3aed",
  farm: "#65a30d",
  dino: "#047857",
  dream: "#d946ef",
};

const packOf = (worldId: string) =>
  WORLD_PACKS.find((p) => p.id === worldId) ?? WORLD_PACKS[0];

const toneOf = (worldId: string) => WORLD_TONE[worldId] ?? "#2f6fe4";

/** "Draw a fish" → "fish" — what the praise line calls it out loud, and the
 *  label a tile has room for. */
const nameOf = (l: DrawLesson) => l.title.replace(/^Draw (?:a |an |the )?/i, "");

/** "Draw a fish" → "a fish". A whole sentence needs the article back: "You drew
 *  a fish!", never "You drew fish!". */
const thingOf = (l: DrawLesson) => l.title.replace(/^Draw /i, "");

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

/* ── what the child actually drew ────────────────────────────────────────── */

/**
 * The child's own ink, replayed.
 *
 * This is the whole point of the screen, so it gets its own component rather
 * than being a `Doodle` with a nicer label: the reward must show the wobbling
 * line the child made, not the tidy picture underneath it. Their strokes come
 * back from TraceScreen in the guide's own box, so they drop straight into a
 * `DOODLE_BOX` viewBox with no fitting.
 */
function TheirDrawing({ strokes, size }: { strokes: Stroke[]; size: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${DOODLE_BOX.w} ${DOODLE_BOX.h}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={Math.max(3, s.size)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/* ── the picker tiles ────────────────────────────────────────────────────── */

function Tile({ lesson, index, stars, onPick }: {
  lesson: DrawLesson; index: number; stars: number; onPick: () => void;
}) {
  const r = hand(index * 23 + 5);
  const tilt = (r() - 0.5) * 4.4;
  return (
    <button
      onClick={() => { sfxHappy(); onPick(); }}
      aria-label={`${lesson.title}. ${starWord(stars)}`}
      className="ink-pinned relative block w-full enter-pop"
      style={{ "--i": Math.min(index, 12), transform: `rotate(${tilt}deg)` } as React.CSSProperties}
    >
      <InkCard
        seed={index * 13 + 3}
        radius={14}
        className="p-2"
        contentClassName="grid place-items-center gap-1"
        style={{ minHeight: "var(--tap-lg)" }}
      >
        {/* Not yet drawn is not yet awake: the picture waits in pencil until
            the child has been round it once, then it is in full colour. */}
        <span className={stars > 0 ? "anim-float-y block" : "block"}>
          <Doodle
            name={lesson.kindId}
            size={52}
            mono={stars > 0 ? undefined : "rgba(45,41,38,0.3)"}
          />
        </span>
        <span className="ink-title text-fs-xs" style={{ color: toneOf(lesson.worldId) }}>
          {nameOf(lesson)}
        </span>
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

function Reward({ lesson, stars, strokes, hasNext, onNext, onPicker, onSetFree }: {
  lesson: DrawLesson;
  stars: 1 | 2 | 3;
  strokes: Stroke[];
  hasNext: boolean;
  onNext: () => void;
  onPicker: () => void;
  onSetFree: () => void;
}) {
  const pack = packOf(lesson.worldId);
  const tone = toneOf(lesson.worldId);

  return (
    <div className="screen overflow-y-auto no-scrollbar" style={{ background: pack.gradient }}>
      <div className="min-h-full grid place-items-center pad-x pad-t pad-b">
        <InkCard
          seed={64}
          radius={22}
          className="w-full max-w-md p-5 text-center anim-pop-in"
          contentClassName="grid gap-2 justify-items-center"
        >
          <Stars n={stars} size={34} />
          <span className="visually-hidden" role="status">
            You drew {thingOf(lesson)}. {starWord(stars)}.
          </span>

          <span className="grid place-items-center min-h-[7.5rem] py-1">
            <span className="anim-float-y block">
              <TheirDrawing strokes={strokes} size={130} />
            </span>
          </span>

          <h2 className="ink-title text-fs-2xl leading-tight">You drew {thingOf(lesson)}!</h2>
          <p className="ink-hand text-fs-sm">Every line of it is yours.</p>
          <span className="block w-32"><Scribble seed={31} height={9} /></span>

          <div className="grid gap-2 w-full mt-1">
            <InkButton
              tone={tone}
              seed={12}
              radius={20}
              onClick={() => { sfxHappy(); onSetFree(); }}
              className="w-full font-display font-extrabold text-fs-xl"
              style={{ minHeight: "var(--tap-lg)" }}
            >
              <Icon name="sparkle" size={22} color="#fffaf0" fill="#fffaf0" />
              <span className="ink-on-wax">Set it free!</span>
            </InkButton>
            {hasNext && (
              <InkButton
                seed={45}
                radius={20}
                onClick={() => { sfxTap(); onNext(); }}
                className="w-full font-display font-extrabold text-fs-lg"
                style={{ minHeight: "var(--tap)" }}
              >
                Draw another
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

/* ── the school ──────────────────────────────────────────────────────────── */

export default function DrawSchool({ onBack, onDrawn }: {
  onBack: () => void;
  /** The child finished a lesson and wants it in their world. */
  onDrawn: (made: { kindId: string; worldId: string; strokes: Stroke[] }) => void;
}) {
  const [progress, setProgress] = useState<WritingProgress>(() => loadWriting());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /* Set the moment a lesson is finished, and it carries the child's ink — the
     reward and `onDrawn` both read it, so neither can fall back to the doodle. */
  const [made, setMade] = useState<{ stars: 1 | 2 | 3; strokes: Stroke[] } | null>(null);

  const active = useMemo(
    () => (activeKey ? DRAW_LESSONS.find((l) => l.key === activeKey) ?? null : null),
    [activeKey],
  );

  /* The guide is sampled out of SVG path data and needs a document to measure
     against, so it is built when a lesson opens rather than at module load —
     and `doodleLesson` caches, so coming back to a lesson is free. */
  const sheet = useMemo(() => (active ? doodleLesson(active.kindId) : null), [active]);

  const done = DRAW_LESSONS.filter((l) => (progress[l.key] ?? 0) > 0).length;

  const open = (key: string) => { setActiveKey(key); setMade(null); };

  const finish = (stars: 1 | 2 | 3, strokes: Stroke[]) => {
    if (active) setProgress(saveWriting(active.key, stars));
    setMade({ stars, strokes });
  };

  /** The next lesson in the same world — a child on the reef stays on the reef. */
  const nextInWorld = active
    ? lessonsForWorld(active.worldId)[
        lessonsForWorld(active.worldId).findIndex((l) => l.key === active.key) + 1
      ]
    : undefined;

  /* ── tracing ── */
  if (active && sheet && !made) {
    return (
      <TraceScreen
        /* keyed on the lesson so a new one always starts from a clean sheet,
           rather than relying on the screen to reset itself */
        key={active.key}
        targets={[{
          char: active.kindId,
          say: nameOf(active),
          guide: sheet.guide,
          detail: sheet.detail,
          space: DOODLE_BOX,
        }]}
        title={active.title}
        subtitle={active.hint}
        color={toneOf(active.worldId)}
        onBack={() => setActiveKey(null)}
        onComplete={(r) => finish(r.stars, r.strokes)}
      />
    );
  }

  /* ── reward ── */
  if (active && made) {
    return (
      <Reward
        lesson={active}
        stars={made.stars}
        strokes={made.strokes}
        hasNext={!!nextInWorld}
        onNext={() => nextInWorld && open(nextInWorld.key)}
        onPicker={() => { setActiveKey(null); setMade(null); }}
        onSetFree={() =>
          onDrawn({ kindId: active.kindId, worldId: active.worldId, strokes: made.strokes })
        }
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
            <h1 className="ink-title text-fs-2xl leading-none truncate">Drawing school</h1>
            <p className="ink-hand text-fs-xs truncate">Learn to draw anything!</p>
          </div>
          <span
            aria-label={`${done} of ${DRAW_LESSONS.length} done`}
            className="ink-title text-fs-xs px-2.5 py-1 rounded-full shrink-0"
            style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
          >
            {done}/{DRAW_LESSONS.length}
          </span>
        </header>

        {LESSON_WORLDS.map((worldId) => {
          const pack = packOf(worldId);
          return (
            <Section key={worldId} title={pack.name} hint="trace it — it's yours">
              <ul
                className="grid gap-3 pt-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(6.4rem, 1fr))" }}
              >
                {lessonsForWorld(worldId).map((l, i) => (
                  <li key={l.key}>
                    <Tile
                      lesson={l}
                      index={i}
                      stars={progress[l.key] ?? 0}
                      onPick={() => open(l.key)}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}

        <p className="ink-hand text-fs-2xs text-center mt-6 opacity-80">
          For grown-ups: the faint picture is only a guide — every line that ends up
          in the drawing is your child's own. Nothing is ever marked wrong — the stars
          say how close it was, and every try counts.
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
