// ─── Onboarding: the first four pages of the pad ────────────────────────────
// Drawlings used to drop a grown-up straight from the title card into an empty
// canvas. That works for the child — they scribble, something hatches, they get
// it — but it leaves the person holding the tablet with no answer to the two
// questions they actually have: *what is this?* and *what is it doing with my
// child's drawings?* Both get answered here, in four sheets torn off the same
// pad the rest of the app is written on.
//
// Three rules shaped it:
//
//   **It is skippable from every page.** A parent reinstalling, or one who has
//   already read it once, taps Skip and is gone. Nothing here is a gate; an
//   onboarding a grown-up cannot leave is a dark pattern with nice paper.
//
//   **The copy is written to be read aloud.** Short sentences, concrete nouns,
//   no product words. A four-year-old is looking at the same page, so the art
//   carries as much of the meaning as the text does.
//
//   **The grown-ups page tells the truth and stops.** Nothing a child makes
//   leaves the device, nothing is collected, and the whole app works with no
//   internet at all — so the page says exactly that and offers no switch to
//   flip. The one door out of the device that does exist — printing or
//   sharing a drawing — lives behind the parental gate in lib/consent, not
//   in front of whoever happens to be holding the tablet.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotepadPage } from "@/components/ink/Notepad";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon, type IconName } from "@/components/ink/Icons";
import { Doodle } from "@/components/ink/Doodles";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { useBackClose } from "@/lib/native";
import { roughEllipse } from "@/lib/ink";
import { sfxTap } from "@/lib/audio";
import { hush, sayLine } from "@/lib/speech";

/* Wax needs a literal colour — the tile is baked on a canvas, so it cannot
   read a CSS variable. These are the same values as --crayon-* in index.css. */
const GRAPE = "#8b46c7";
const OCEAN = "#2f6fe4";
const CHERRY = "#e63b2e";
const SEA = "#0e8a86";

/* ── how far through the pad we are ──────────────────────────────────────────
   Four inked blobs, each with its own wobble, the current one circled the way
   you would ring the page you are on. Drawn rather than dotted, so it belongs
   to the same hand as everything else on the sheet. */

const MARK_STEP = 26;
const MARK_H = 24;

function PageMarks({ index, total }: { index: number; total: number }) {
  const marks = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => ({
        dot: roughEllipse(13, 12, { seed: 31 + i * 17, wobble: 2 }),
        ring: roughEllipse(23, 21, { seed: 71 + i * 13, wobble: 2.4 }),
      })),
    [total],
  );

  return (
    <div role="status" aria-live="polite" className="shrink-0">
      <span className="visually-hidden">{`Page ${index + 1} of ${total}`}</span>
      <svg
        aria-hidden="true"
        width={total * MARK_STEP}
        height={MARK_H}
        viewBox={`0 0 ${total * MARK_STEP} ${MARK_H}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {marks.map((m, i) => {
          const seen = i <= index;
          const now = i === index;
          return (
            <g key={i} transform={`translate(${MARK_STEP * i + MARK_STEP / 2} ${MARK_H / 2})`}>
              {now && (
                <path
                  d={m.ring}
                  transform="translate(-11.5 -10.5)"
                  fill="none"
                  stroke="var(--sun)"
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              <path
                d={m.dot}
                transform="translate(-6.5 -6)"
                fill={seen ? "var(--plum)" : "none"}
                stroke="var(--ink)"
                strokeWidth={now ? 2.2 : 1.7}
                opacity={seen ? 1 : 0.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── a few drawings taped onto the sheet ─────────────────────────────────── */

function TapedArt({ names, seed }: { names: readonly string[]; seed: number }) {
  return (
    <div className="relative inline-block pt-3 shrink-0">
      <Tape
        seed={seed}
        className="left-1/2 top-0"
        style={{ width: 64, height: 19, transform: "translateX(-50%) rotate(-4deg)" }}
      />
      <InkCard
        seed={seed * 7 + 3}
        radius={16}
        className="px-4 py-3"
        contentClassName="flex items-center justify-center gap-3"
      >
        {names.map((n, i) => (
          <span key={n} className="anim-float-y block" style={{ animationDelay: `${i * 0.55}s` }}>
            <span className="block" style={{ transform: `rotate(${(i - 1) * 6}deg)` }}>
              <Doodle name={n} size={52} />
            </span>
          </span>
        ))}
      </InkCard>
    </div>
  );
}

/* ── one beat of the loop ────────────────────────────────────────────────── */

interface BeatDef {
  icon: IconName;
  tone: string;
  title: string;
  line: string;
}

const BEATS: BeatDef[] = [
  { icon: "pencil", tone: OCEAN, title: "Draw it", line: "A fish, a dog, a whole dragon. Wobbly lines are perfect." },
  { icon: "sparkle", tone: GRAPE, title: "It comes alive", line: "Watch it blink, wriggle and set off across the page." },
  { icon: "heart", tone: CHERRY, title: "Look after it", line: "Feed it, play with it. It is still there tomorrow." },
];

function Beat({ beat, seed }: { beat: BeatDef; seed: number }) {
  return (
    <InkCard
      seed={seed}
      radius={18}
      className="p-3 landshort:p-2.5"
      contentClassName="flex items-center gap-3 landshort:flex-col landshort:gap-1.5 landshort:text-center"
    >
      <InkCard
        shape="ellipse"
        tone={beat.tone}
        seed={seed + 13}
        lifted={false}
        className="shrink-0 w-[46px] h-[46px] landshort:w-9 landshort:h-9"
        contentClassName="w-full h-full grid place-items-center"
      >
        <Icon name={beat.icon} size={22} color="#fffaf0" fill="#fffaf0" weight={2.3} />
      </InkCard>
      <span className="min-w-0">
        <span className="block ink-title text-fs-md landshort:text-fs-sm">{beat.title}</span>
        <span className="block ink-hand text-fs-sm landshort:text-fs-xs leading-snug">{beat.line}</span>
      </span>
    </InkCard>
  );
}

/* ── the four sheets ─────────────────────────────────────────────────────── */

function WelcomePage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center landshort:flex-row landshort:gap-5 landshort:text-left">
      <div className="min-w-0 landshort:order-1">
        <p className="ink-hand text-fs-xs">welcome to Drawlings</p>
        <h1 className="ink-title text-fs-3xl landshort:text-fs-2xl mt-0.5">
          Draw anything.<br />It comes alive.
        </h1>
        <span className="block w-36 mx-auto mt-1.5 landshort:mx-0">
          <Scribble seed={12} height={10} />
        </span>
        <p className="ink-hand text-fs-md landshort:text-fs-sm leading-relaxed mt-2.5">
          A fish, a dog, a whole dragon — whatever your child draws wakes up and
          stays in a little world that is theirs to keep.
        </p>
      </div>
      <div className="landshort:order-2">
        <TapedArt names={["fish", "cat", "rocket"]} seed={3} />
      </div>
    </div>
  );
}

function HowPage() {
  return (
    <div>
      <h1 className="ink-title text-fs-2xl landshort:text-fs-lg text-center">How it works</h1>
      <span className="block w-28 mx-auto mt-1">
        <Scribble seed={7} height={9} />
      </span>
      <div className="mt-3 landshort:mt-2 grid gap-2.5 landshort:grid-cols-3 landshort:gap-2.5">
        {BEATS.map((b, i) => (
          <Beat key={b.title} beat={b} seed={23 + i * 19} />
        ))}
      </div>
    </div>
  );
}

const PROMISES = [
  "No ads. Not one, ever.",
  "No accounts and no sign-in.",
  "Nothing about your child is collected.",
  "Everything is saved on this device.",
];

function GrownUpsPage() {
  return (
    <div>
      <div className="flex items-center justify-center gap-2">
        <Icon name="lock" size={20} color="var(--plum)" weight={2.2} />
        <h1 className="ink-title text-fs-2xl landshort:text-fs-lg">For grown-ups</h1>
      </div>
      <span className="block w-32 mx-auto mt-1">
        <Scribble seed={5} height={9} />
      </span>

      {/* stacked on a phone; the promises and the reassurance sit side by side
          on a short landscape screen, where height is the scarce thing */}
      <div className="mt-3 landshort:mt-2 grid gap-2.5 landshort:grid-cols-2 landshort:items-start">
        <div className="grid gap-2">
          {PROMISES.map((p, i) => (
            <InkCard
              key={p}
              seed={41 + i * 11}
              radius={15}
              className="px-3 py-2 landshort:py-1.5"
              contentClassName="flex items-center gap-2.5"
            >
              <Icon name="check" size={18} color={SEA} weight={2.6} />
              <span className="ink-hand text-fs-sm landshort:text-fs-xs leading-snug min-w-0">{p}</span>
            </InkCard>
          ))}
        </div>

        <InkCard seed={88} radius={18} className="p-3.5 landshort:p-3" contentClassName="grid gap-1.5">
          <span className="ink-title text-fs-md landshort:text-fs-sm">Nothing leaves this device</span>
          <p className="ink-hand text-fs-sm landshort:text-fs-xs leading-relaxed">
            Every letter traced and every creature made stays right here, on this
            tablet. Drawlings works with no internet at all — so there is nothing
            to send, and nothing does.
          </p>
        </InkCard>
      </div>
    </div>
  );
}

function ReadyPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center landshort:flex-row landshort:justify-center landshort:gap-6 landshort:text-left">
      <TapedArt names={["star", "rainbow", "heart"]} seed={9} />
      <div className="min-w-0">
        <h1 className="ink-title text-fs-3xl landshort:text-fs-2xl">All set!</h1>
        <span className="block w-24 mx-auto mt-1.5 landshort:mx-0">
          <Scribble seed={18} height={10} />
        </span>
        <p className="ink-hand text-fs-md leading-relaxed mt-2.5">
          Find a comfy spot and draw the first thing you think of. Nothing here
          can be wrong — wobbly lines make the best creatures.
        </p>
      </div>
    </div>
  );
}

/* ── the pad ─────────────────────────────────────────────────────────────── */

interface Sheet {
  key: string;
  /** Each sheet is torn off differently, so no two edges match. */
  seed: number;
  /** Said once when the sheet turns. Kept to one line — the grown-up reads the rest. */
  spoken?: string;
  Body: () => React.ReactElement;
}

const SHEETS: Sheet[] = [
  { key: "welcome", seed: 41, spoken: "Draw anything, and it comes alive.", Body: WelcomePage },
  { key: "how", seed: 63, spoken: "Draw it. It comes alive. Then look after it.", Body: HowPage },
  { key: "grownups", seed: 87, Body: GrownUpsPage },
  { key: "ready", seed: 29, spoken: "All set. Let's draw something.", Body: ReadyPage },
];

/* How long the outgoing sheet stays mounted after a turn starts. A touch past
   the longest of the two exits it has to cover — `page-flip-out` at --dur-3
   (420ms) going forward, and the 480ms `page-flip-back-in` the *arriving*
   sheet plays on top of it coming back — so a sheet is never cut short. */
const TURN_MS = 500;

export default function Onboarding({ onDone, onSkip }: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [i, setI] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* ── turning a sheet ───────────────────────────────────────────────────────
     Onboarding is the same top-bound pad as the rest of the app, so it turns
     the same way: the sheet being left lifts up over the coil (`page-flip-out`)
     and the next one settles down underneath it (`page-flip-in`); going back,
     the sheet that was lifted drops down over the top again
     (`page-flip-back-in`) while the one being left simply waits underneath.

     The part that has to be got right is that *both* sheets are mounted for the
     length of the turn. Swapping the body in place — which is what this screen
     used to do — leaves the exit with nothing to animate, and a 3D rotate with
     no `.page-stage` ancestor to hand it a perspective is flat anyway. Hence
     the stage below and the two stacked `.page-layer`s inside it. */
  const [exiting, setExiting] = useState<{ index: number; back: boolean } | null>(null);
  const [back, setBack] = useState(false);
  const turnTimer = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  const sheet = SHEETS[i];
  const last = i === SHEETS.length - 1;

  const turn = useCallback((to: number, isBack: boolean) => {
    if (to === i || to < 0 || to >= SHEETS.length) return;
    // a child who has asked for less motion gets the next sheet, now, flat
    if (!reduced) {
      setBack(isBack);
      setExiting({ index: i, back: isBack });
      if (turnTimer.current) window.clearTimeout(turnTimer.current);
      turnTimer.current = window.setTimeout(() => setExiting(null), TURN_MS);
    }
    setI(to);
  }, [i, reduced]);

  useEffect(() => () => { if (turnTimer.current) window.clearTimeout(turnTimer.current); }, []);

  // the app's voice reads the headline, and only the headline; it follows the
  // mute switch inside `speak`, and never trails a page the reader has left
  useEffect(() => {
    if (sheet.spoken) sayLine(sheet.spoken);
    return hush;
  }, [sheet]);

  // a turned page starts at its top, even if the last one was scrolled down
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [i]);

  const goBack = useCallback(() => {
    sfxTap();
    turn(i - 1, true);
  }, [i, turn]);

  const next = useCallback(() => {
    sfxTap();
    if (i < SHEETS.length - 1) { turn(i + 1, false); return; }
    hush();
    onDone();
  }, [i, turn, onDone]);

  /* Android hardware back turns the sheet back, exactly as the drawn arrow
     does. Without this the pad is four pages deep but back is a single step
     out of the app — a grown-up on the privacy page presses it expecting page
     two and Drawlings closes. Inactive on the first sheet, so back still
     leaves from the front of the pad the way it leaves from home. */
  useBackClose(i > 0, goBack);

  const skip = useCallback(() => {
    sfxTap();
    hush();
    onSkip();
  }, [onSkip]);

  /* One sheet's worth of pad, as a function of *which* sheet — so the page
     that is leaving can go on drawing itself while it flips away. `live` marks
     the one the child is actually reading: it is the sheet that owns the
     scroller. */
  const renderSheet = (index: number, live: boolean) => {
    const s = SHEETS[index];
    return (
      <NotepadPage
        seed={s.seed}
        className="h-full w-full"
        contentClassName="h-full min-h-0 flex flex-col px-4 pb-3 landshort:px-5"
      >
        {/* where we are, and the way out — on every sheet, in the same place */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <PageMarks index={index} total={SHEETS.length} />
          <InkButton
            seed={33}
            radius={14}
            onClick={skip}
            weight={2.6}
            aria-label="Skip and go straight to drawing"
            className="ink-title text-fs-xs shrink-0 !px-4"
          >
            Skip
          </InkButton>
        </div>

        {/* `my-auto` centres a short sheet in the space it has and quietly
            gives up when the sheet is taller, so nothing scrolls off the top */}
        <div
          ref={live ? scrollRef : undefined}
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col"
        >
          {/* the body settles in as the sheet lands. Under reduced motion it
              does not move at all: `anim-pop-in` degrades to a fade that still
              carries a transform, and the ask here is *no* transform. */}
          <div className={`my-auto w-full py-1${reduced ? "" : " anim-pop-in"}`}>
            <s.Body />
          </div>
        </div>
      </NotepadPage>
    );
  };

  return (
    <div className="screen ink-paper overflow-hidden">
      <div
        className="mx-auto flex h-full w-full max-w-2xl flex-col pad-x gap-3 landshort:gap-2"
        style={{
          // room above the pad for the wire loops, which arc past the paper
          paddingTop: "max(var(--sp-4), calc(var(--safe-t) + var(--sp-2)))",
          paddingBottom: "max(var(--sp-2), var(--safe-b))",
        }}
      >
        {/* the stage carries the perspective; the sheets inside it do the
            rotating. Perspective is handed *down* from a parent, so it can
            never live on the sheet that moves. */}
        <div className="page-stage flex-1 min-h-0 w-full">
          {/* the sheet being left, still on the pad for the length of the turn */}
          {exiting && (
            <div
              key={SHEETS[exiting.index].key}
              className={`page-layer ${exiting.back ? "" : "page-flip-out"}`}
              aria-hidden="true"
              inert
            >
              {renderSheet(exiting.index, false)}
            </div>
          )}
          <div
            key={sheet.key}
            className={`page-layer ${exiting ? (back ? "page-flip-back-in" : "page-flip-in") : ""}`}
          >
            {renderSheet(i, true)}
          </div>
        </div>

        <nav aria-label="Turn the page" className="flex items-center gap-3 shrink-0">
          {/* held open so the hero button does not shuffle sideways on page 1 */}
          <div className="shrink-0" style={{ width: "var(--tap)" }}>
            {i > 0 && (
              <InkButton
                seed={9}
                radius={16}
                onClick={goBack}
                aria-label="Back a page"
                style={{ width: "var(--tap)", height: "var(--tap)" }}
              >
                <Icon name="back" size={22} />
              </InkButton>
            )}
          </div>

          {/* the hero. `!min-h` because .ink-btn's own min-height is unlayered
              CSS, which outranks a Tailwind utility whatever the specificity */}
          <InkButton
            tone={GRAPE}
            seed={64}
            radius={24}
            onClick={next}
            className="flex-1 min-w-0 ink-title text-fs-xl !min-h-[var(--tap-hero)] landshort:!min-h-[var(--tap-lg)]"
          >
            <span className="ink-on-wax truncate">{last ? "Start drawing!" : "Next"}</span>
            <Icon
              name={last ? "sparkle" : "play"}
              size={last ? 22 : 16}
              color="#ffe9a8"
              fill="#ffe9a8"
            />
          </InkButton>
        </nav>
      </div>
    </div>
  );
}
