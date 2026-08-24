// ─── For grown-ups: a quiet look at what a child has been practising ─────────
// Everything a child does in Magic Pen is recorded on the device and, until
// now, only ever shown back to the child as stars. A parent had no window at
// all — no way to answer "is she actually learning anything on that thing?"
//
// This is that window, and it is deliberately not a dashboard. No grades, no
// streaks to protect, no red. It is a fridge-door summary: the letters met,
// the words written, the creatures made. It reads the same star records the
// lessons already keep, so it costs nothing to show and is always true.
//
// It is also, honestly, where a free user decides to become a paying one — the
// "look what they learned" moment — so it is worth making calm and real rather
// than boastful.

import { useMemo, useState } from "react";
import type { Creature } from "@/lib/types";
import { loadWriting } from "@/lib/storage";
import { peekVisit } from "@/lib/daily";
import { LETTER_LESSONS, NUMBER_CATEGORIES, SUM_LESSONS, WORD_LESSONS } from "@/lib/writing";
import { DRAW_LESSONS } from "@/lib/lessons";
import { SHAPES } from "@/lib/glyphs";
import { InkButton, InkCard, Scribble } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import ParentGate from "@/components/ParentGate";
import { loadConsent, saveConsent } from "@/lib/consent";
import { sfxTap } from "@/lib/audio";

/** How many keys with a given prefix have earned at least one star. */
function tried(progress: Record<string, number>, prefix: string): number {
  let n = 0;
  for (const k in progress) if (k.startsWith(prefix) && progress[k] > 0) n++;
  return n;
}

/** A teal-to-blue ramp, one shade per group of numbers, in curriculum order. */
const NUMBER_TONES = ["#0e8a86", "#0d7f92", "#0c6f9e", "#0b5fa8"];

interface Row {
  label: string;
  done: number;
  total: number;
  tone: string;
  /** Plural noun for the count read out to assistive tech. */
  unit: string;
}

export default function GrownUps({ creatures, onBack }: {
  creatures: Creature[];
  onBack: () => void;
}) {
  const progress = useMemo(() => loadWriting(), []);
  const visit = useMemo(() => peekVisit(), []);

  // The magic-dust decision. Held in state as well as storage so the page tells
  // the truth the instant a grown-up changes it, with no reload.
  const [consent, setConsent] = useState(() => loadConsent());
  const [gateOpen, setGateOpen] = useState(false);
  const dustOn = consent.aiArt === true;   // never asked reads as off

  // Only one direction is guarded. Turning magic dust *off* makes the app more
  // private, so it happens the moment it is asked for; turning it on is the
  // choice that needs a grown-up, so it goes through the gate first.
  const toggleDust = () => {
    sfxTap();
    if (dustOn) setConsent(saveConsent({ aiArt: false }));
    else setGateOpen(true);
  };

  const rows: Row[] = [
    { label: "Capital letters", done: tried(progress, "letter:"), total: LETTER_LESSONS.length, tone: "#8b46c7", unit: "letters" },
    { label: "Lowercase letters", done: tried(progress, "lower:"), total: LETTER_LESSONS.length, tone: "#a855f7", unit: "letters" },
    /* One row per group of numbers, straight off the curriculum — the picker
       shows a child exactly these four sections, so a grown-up looking for
       "has she met the teens yet?" sees the same shape she does. Each group
       counts its own progress prefix; totals can never drift from the lessons
       because they are the lessons. */
    ...NUMBER_CATEGORIES.map((c, i) => ({
      label: c.title,
      done: tried(progress, c.prefix),
      total: c.lessons.length,
      tone: NUMBER_TONES[i % NUMBER_TONES.length],
      unit: "numbers",
    })),
    { label: "Sums", done: tried(progress, "sum:"), total: SUM_LESSONS.length, tone: "#0369a1", unit: "sums" },
    { label: "Shapes", done: tried(progress, "shape:"), total: SHAPES.length, tone: "#0891b2", unit: "shapes" },
    { label: "Words written", done: tried(progress, "word:"), total: WORD_LESSONS.length, tone: "#c2600c", unit: "words" },
    { label: "Drawings learned", done: tried(progress, "draw:"), total: DRAW_LESSONS.length, tone: "#0e7fd6", unit: "drawings" },
  ];

  const anyLearning = rows.some((r) => r.done > 0);
  const made = creatures.length;

  return (
    <div className="screen ink-paper overflow-y-auto no-scrollbar">
      <div
        className="mx-auto w-full max-w-xl pad-x pad-t"
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
            <h1 className="ink-title text-fs-2xl leading-none truncate">For grown-ups</h1>
            <p className="ink-hand text-fs-xs truncate">what they've been practising</p>
          </div>
        </header>

        {/* the warm top line: days spent, creatures made — the shape of the habit */}
        <div className="grid grid-cols-2 gap-3 pt-5">
          <InkCard seed={21} radius={18} className="p-4" contentClassName="flex flex-col items-center text-center gap-0.5">
            <span className="ink-title text-fs-3xl" style={{ color: "#e0791f" }}>{made}</span>
            <span className="ink-hand text-fs-xs">{made === 1 ? "creature made" : "creatures made"}</span>
          </InkCard>
          <InkCard seed={34} radius={18} className="p-4" contentClassName="flex flex-col items-center text-center gap-0.5">
            <span className="ink-title text-fs-3xl" style={{ color: "#12a08f" }}>{visit.days}</span>
            <span className="ink-hand text-fs-xs">{visit.days === 1 ? "day drawing" : "days drawing"}</span>
          </InkCard>
        </div>

        {/* the skills, each a calm bar — a picture of coverage, never a grade */}
        <div className="pt-4 grid gap-2.5">
          {rows.map((r) => {
            const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
            return (
              <InkCard key={r.label} seed={r.label.length * 7 + 3} radius={16} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="ink-title text-fs-md">{r.label}</span>
                  <span
                    className="ink-hand text-fs-sm shrink-0 tabular-nums"
                    aria-label={`${r.done} of ${r.total} ${r.unit} tried`}
                    style={{ color: r.tone }}
                  >
                    {r.done}<span className="opacity-50"> / {r.total}</span>
                  </span>
                </div>
                <div
                  className="mt-2 h-2.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(45,41,38,0.10)", border: "1.5px solid rgba(45,41,38,0.18)" }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.tone, transition: "width .5s ease" }} />
                </div>
              </InkCard>
            );
          })}
        </div>

        {/* ── magic dust: the one thing that leaves the device ──────────────
            Written for a parent rather than for a child, and deliberately even-
            handed: off is a perfectly good place to stay, so nothing here nags,
            warns, or dresses "on" up as the finished state. */}
        <InkCard seed={58} radius={18} className="mt-4 p-4" contentClassName="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="ink-title text-fs-md">Magic dust</span>
            <span
              className="ink-title text-fs-xs shrink-0 px-3 py-1 rounded-full"
              style={{
                background: dustOn ? "#e3f5f2" : "rgba(45,41,38,0.06)",
                border: `2.5px solid ${dustOn ? "#0e8a86" : "rgba(45,41,38,0.3)"}`,
                color: dustOn ? "#0e8a86" : "var(--ink-soft)",
              }}
            >
              {dustOn ? "On" : "Off"}
            </span>
          </div>
          <span className="block w-24"><Scribble seed={31} height={8} /></span>

          <p className="ink-hand text-fs-sm leading-relaxed">
            Magic dust is the optional step that turns a crayon drawing into
            polished artwork. To do it, that one drawing is sent over the
            internet to an art service, which sends a picture back. It is the
            only thing in Magic Pen that ever leaves this device — no name, no
            account, nothing else. The crayon original is always kept, exactly
            as it was drawn.
          </p>

          <InkButton
            seed={64}
            radius={16}
            tone={dustOn ? "#0e8a86" : undefined}
            onClick={toggleDust}
            role="switch"
            aria-checked={dustOn}
            aria-label="Magic dust"
            className="mt-1 w-full ink-title text-fs-md"
            style={{ minHeight: "var(--tap-lg)" }}
          >
            {dustOn && <Icon name="check" size={20} color="#fffaf0" weight={2.6} />}
            <span className={dustOn ? "ink-on-wax" : ""}>{dustOn ? "On" : "Off"}</span>
          </InkButton>

          <p className="ink-hand text-fs-xs opacity-80 leading-relaxed">
            {dustOn
              ? "Tap to turn it off. That takes effect straight away, and no drawing is sent anywhere again."
              : "Tap to turn it on. We'll ask a grown-up a quick question first, so it can't be switched on by small hands."}
          </p>
        </InkCard>

        {/* the promise, said plainly to a parent */}
        <InkCard seed={77} radius={18} className="mt-4 p-4" contentClassName="grid gap-2">
          <span className="ink-title text-fs-md">The way it works</span>
          <span className="block w-24"><Scribble seed={12} height={8} /></span>
          <p className="ink-hand text-fs-sm leading-relaxed">
            {anyLearning
              ? "Nothing here is a test, and nothing is ever marked wrong. The stars only show how close a trace was, and every try counts — a shaky first go still earns its star. Coming back is rewarded; staying away is never punished."
              : "When they start tracing letters, numbers and drawings, their progress will show up here. Nothing is ever marked wrong — the stars only show how close a trace was, and every try counts."}
          </p>
          <p className="ink-hand text-fs-xs opacity-80 leading-relaxed mt-1">
            No ads, no accounts, no data collected. Everything above is stored on
            this device only. The optional “magic-dust” artwork is the one thing
            made online, and it is{" "}
            {dustOn
              ? "switched on right now — a drawing is sent away each time it's used."
              : "switched off right now, so nothing at all leaves this device."}
          </p>
        </InkCard>
      </div>

      {gateOpen && (
        <ParentGate
          title="Turn on magic dust?"
          onPass={() => {
            // Passing the gate is itself worth recording: it is the evidence
            // that a grown-up, not the child, made this call.
            setConsent(saveConsent({ aiArt: true, gatePassed: true }));
            setGateOpen(false);
          }}
          onCancel={() => setGateOpen(false)}
        />
      )}
    </div>
  );
}
