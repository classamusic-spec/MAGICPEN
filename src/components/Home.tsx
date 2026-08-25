// ─── Home: the sketchbook's first page ──────────────────────────────────────
// The child's own drawings are the point of this product, so they are the
// hero of this screen — mounted into the book with tape, not listed in boxes.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Creature, WorldPack, WritingWorld, WritingWorldId } from "@/lib/types";
import { WORLD_PACKS, WRITING_WORLDS, kindById } from "@/lib/creatures";
import { LETTER_LESSONS, ALL_NUMBER_LESSONS, SUM_LESSONS, WORD_LESSONS } from "@/lib/writing";
import { SHAPE_LESSONS } from "@/lib/shapes";
import { DRAW_LESSONS } from "@/lib/lessons";
import { loadWriting } from "@/lib/storage";
import { sfxTap, sfxHappy, sfxPop, sfxSplash } from "@/lib/audio";
import { artSprite, onArtLoaded } from "@/lib/polish";
import { bakeCrayonSprite } from "@/lib/sprites";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { Wordmark } from "@/components/ink/Wordmark";
import { GlyphMark } from "@/components/ink/GlyphMark";
import { Doodle } from "@/components/ink/Doodles";
import ReleaseConfirm from "@/components/ink/ReleaseConfirm";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { hand } from "@/lib/ink";

/**
 * A creature thumbnail. Uses the same baked sticker sprite the worlds use —
 * ink ring, white ring, then the wax — so a small drawing still reads clearly
 * instead of fading into a pale scribble.
 *
 * `size` is the longest edge of the drawn box, in CSS pixels. It defaults to
 * the 104 every carousel thumbnail has always used; the pet card asks for more
 * because it is the one drawing the child is meant to see from across a room.
 */
export function Thumb({ c, size = 104 }: { c: Creature; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, tick] = useState(0);
  useEffect(() => onArtLoaded(() => tick((n) => n + 1)), []);
  const art = c.artUrl ? artSprite(c.artUrl) : null;
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!c.photoData || art) return;
    const im = new Image();
    im.onload = () => setPhotoImg(im);
    im.src = c.photoData;
  }, [c.photoData, art]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const src = art ?? photoImg ?? bakeCrayonSprite(c).frames[0];
    const w = "width" in src ? src.width : 100;
    const h = "height" in src ? src.height : 100;
    if (!w || !h) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = size / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * k));
    const ch = Math.max(1, Math.round(h * k));
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
  }, [c, art, photoImg, size]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${c.name}, your drawing`}
      className="max-w-full max-h-full"
      style={{ filter: "drop-shadow(0 3px 4px rgba(74,58,40,0.22))" }}
    />
  );
}

/* ── a drawing taped into the book ───────────────────────────────────────────
   Tap to go and see it; press and hold to wave it goodbye.

   The hold borrows the world's gesture vocabulary whole — 520ms, 14px of
   finger slop — rather than inventing a second one. A child who has learned to
   hold a creature in the world already knows how to do this, and the two
   screens cannot drift into two different holds.

   The shelf scrolls sideways under these tiles, which is the whole difficulty:
   a swipe that begins on a drawing has to move the shelf and must never say
   goodbye. The slop settles it exactly as it does in the world — past 14px the
   press stops being a hold *and* stops being a tap, so a scroll can only ever
   scroll. `touch-action` is left panning on both axes for the same reason:
   `none` would strand the carousel, and `pan-x` alone would strand the page
   behind it, which a finger that lands on a tile also has to be able to move.

   Nothing is destroyed here. The hold only asks the question. */

/** Same hold as the world's creature cards. */
const HOLD_MS = 520;
/** Same finger slop, in px: past this it is a scroll, not a press. */
const HOLD_SLOP = 14;
/** The progress ring the hold fills, and its circumference for the sweep. */
const RING_R = 15.5;
const RING_C = 2 * Math.PI * RING_R;

function PinnedDrawing({
  c, index, onOpen, onGoodbye, saying = false,
}: {
  c: Creature;
  index: number;
  onOpen: () => void;
  /** Ask about saying goodbye to this drawing. Without it the tile is exactly
   *  the tap-to-visit tile it has always been — no hold, no ring, no mention
   *  of it to a screen reader. */
  onGoodbye?: () => void;
  /** True while this is the drawing the confirm is asking about, so the tile
   *  stays lifted and it is never a mystery which one is leaving. */
  saying?: boolean;
}) {
  const kind = kindById(c.kindId);
  const r = hand(index * 31 + 7);
  const tilt = (r() - 0.5) * 5.2;
  const still = usePrefersReducedMotion();
  const [holding, setHolding] = useState(false);
  /** The live press: where the finger landed, and the timer it is racing. */
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  /** Set once a gesture has already meant something else — a scroll, a hold —
   *  so the click the browser sends afterwards cannot *also* open the world. */
  const skipClick = useRef(false);

  const clearPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  // a pending hold must never fire into a tile that has already gone
  useEffect(() => clearPress, [clearPress]);

  const down = (e: React.PointerEvent) => {
    if (!onGoodbye || e.button !== 0 || press.current) return;
    skipClick.current = false;
    const timer = window.setTimeout(() => {
      press.current = null;
      skipClick.current = true;
      // the hold is over; from here the question itself holds the tile up
      setHolding(false);
      sfxPop();
      if ("vibrate" in navigator) navigator.vibrate(18);
      onGoodbye();
    }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, timer };
    setHolding(true);
  };
  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= HOLD_SLOP) return;
    skipClick.current = true;
    clearPress();
    setHolding(false);
  };
  /** Let go. Early, and the tile drops straight back where it was. */
  const up = () => {
    clearPress();
    setHolding(false);
  };
  /** The browser took the gesture over — it is scrolling the shelf. */
  const cancel = () => { skipClick.current = true; up(); };

  const click = () => {
    if (skipClick.current) { skipClick.current = false; return; }
    sfxHappy();
    onOpen();
  };

  /* A hold is unreachable from a keyboard or a switch, so the same question
     has a key of its own. Enter and Space keep their old job, and clear the
     suppression flag in case a stray touch left it set. */
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { skipClick.current = false; return; }
    if (!onGoodbye || (e.key !== "Delete" && e.key !== "Backspace")) return;
    e.preventDefault();
    sfxPop();
    onGoodbye();
  };

  /* Being asked about is the pop: the threshold hands the tile straight over
     to `saying`, in the same commit, so there is one lifted state and not two
     that could disagree. */
  const popped = saying;
  /* The tile leans up out of the page for as long as it is held and pops when
     the threshold lands, so the hold is never a tap that did nothing — and it
     drops straight back the instant a finger lifts early, which is what makes
     "let go and nothing happens" legible without a word of instruction.

     It rides an inner wrapper rather than the button, because the button is
     still filling `enter-pop` forwards and a filling animation outranks any
     inline transform, however specific.

     The tile's pinned-on-the-page tilt has to live here for the same reason —
     on the button it was being silently overruled, which is why these drawings
     have been hanging perfectly straight rather than at the jaunty angles they
     were drawn to sit at. Picking one up squares it, the way lifting a taped
     photo off a page would. */
  const lift = still || !(holding || popped)
    ? `rotate(${tilt}deg)`
    : popped
      ? "translateY(-7px) scale(1.09)"
      : "translateY(-5px) scale(1.05)";
  const liftEase = still
    ? "none"
    : holding ? `transform ${HOLD_MS}ms linear` : "transform 220ms var(--ease-spring)";

  return (
    <button
      onClick={click}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onKeyDown={key}
      // a long press on a drawing is ours; it must not raise the platform's
      // text-selection bubble or a context menu on top of the answer
      onContextMenu={(e) => e.preventDefault()}
      aria-label={
        onGoodbye
          ? `Visit ${c.name} the ${kind.label} in your world. Press and hold, or press Delete, to say goodbye to ${c.name}.`
          : `Visit ${c.name} the ${kind.label} in your world`
      }
      className="ink-pinned relative block w-36 shrink-0 enter-pop"
      style={{
        "--i": index,
        touchAction: "pan-x pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as React.CSSProperties}
    >
      <span className="relative block" style={{ transform: lift, transition: liftEase }}>
        {/* The hold, drawn: a ring that fills while the tile is held. It is
            always mounted so the sweep has somewhere to start from, and it winds
            back much faster than it filled — letting go undoes the hold at once.
            With reduced motion it simply appears, whole, and no sweep is run. */}
        {onGoodbye && (
          <span
            aria-hidden="true"
            className="absolute grid place-items-center pointer-events-none"
            style={{
              top: -6, right: -8, width: 38, height: 38, zIndex: 25,
              opacity: holding || popped ? 1 : 0,
              transform: still || !popped ? "none" : "scale(1.16)",
              transition: still
                ? "opacity 120ms ease"
                : "opacity 140ms ease, transform 200ms var(--ease-spring)",
            }}
          >
            <svg width={38} height={38} viewBox="0 0 38 38">
              <circle cx={19} cy={19} r={RING_R} fill="#fffaf0" stroke="var(--ink)" strokeWidth={2.5} />
              <circle
                cx={19}
                cy={19}
                r={RING_R}
                fill="none"
                stroke="var(--coral)"
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={holding || popped ? 0 : RING_C}
                transform="rotate(-90 19 19)"
                style={{
                  transition: still
                    ? "none"
                    : holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : "stroke-dashoffset 160ms ease",
                }}
              />
            </svg>
            <span className="absolute">
              <Icon name="globe" size={16} color="var(--ink)" weight={2.2} />
            </span>
          </span>
        )}

        <Tape
          seed={index + 1}
          style={{
            width: 62, height: 22, top: -9, left: "50%",
            marginLeft: -31, transform: `rotate(${(r() - 0.5) * 14}deg)`,
          }}
        />
        <InkCard seed={index * 17 + 40} className="p-3 pt-4 text-center" radius={14}>
          <span className="h-24 grid place-items-center">
            <Thumb c={c} />
          </span>
          <span className="ink-title block text-fs-md truncate mt-1">{c.name}</span>
          <span className="ink-hand block text-fs-2xs truncate">{kind.label}</span>
        </InkCard>
      </span>
    </button>
  );
}

/* ── my pet: the face the app is about ───────────────────────────────────────
   The first thing on the page when there is one, because a child who has
   crowned a pet came back for *it*, not for a menu. It says hello and nothing
   else: no hunger, no happiness meter, no "last fed", no countdown. Coming
   back is rewarded; staying away is never punished — a card that measured
   anything would quietly break that promise, so this one measures nothing.
   The greeting arrives ready-made from above; this card only renders it. */
const PetCard = memo(function PetCard({
  pet, line, onVisit,
}: { pet: Creature; line?: string | null; onVisit: () => void }) {
  const kind = kindById(pet.kindId);
  return (
    <button
      onClick={() => { sfxHappy(); onVisit(); }}
      aria-label={`Visit ${pet.name}, your pet`}
      className="ink-pinned relative block w-full text-left"
    >
      <Tape
        seed={4}
        style={{
          width: 66, height: 22, top: -10, left: 26,
          transform: "rotate(-7deg)",
        }}
      />
      <InkCard
        seed={63}
        radius={18}
        className="px-3 py-3"
        contentClassName="flex items-center gap-3 sm:gap-4"
      >
        <span
          aria-hidden="true"
          className="shrink-0 grid place-items-center anim-float-y"
          style={{ width: 132 }}
        >
          <Thumb c={pet} size={132} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="ink-hand flex items-center gap-1 text-fs-2xs">
            <Icon name="heart" size={15} color="var(--pink)" fill="var(--pink)" />
            my pet
          </span>
          <span className="ink-title block text-fs-2xl leading-tight truncate">{pet.name}</span>
          <span className="ink-hand block text-fs-xs">{line ?? `Your very own ${kind.label}`}</span>
        </span>
      </InkCard>
    </button>
  );
});

/* ── first-run explainer ─────────────────────────────────────────────────── */

const STEPS: { icon: "pencil" | "sparkle" | "globe"; t: string; d: string }[] = [
  { icon: "pencil", t: "Scribble", d: "Draw anything" },
  { icon: "sparkle", t: "Magic", d: "Tap the big button" },
  { icon: "globe", t: "Alive!", d: "Watch it play" },
];
const STEP_TONE = ["#fb66e5", "#ffc72c", "#00c2b9"];

function HowItWorks() {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="How Magic Pen works">
      {STEPS.map((s, i) => (
        <li key={s.t} className="enter" style={{ "--i": i + 1 } as React.CSSProperties}>
          <InkCard seed={i * 29 + 12} className="px-2 py-3 text-center h-full" radius={13}>
            <span
              className="mx-auto grid place-items-center rounded-full"
              style={{ width: 40, height: 40, background: STEP_TONE[i] }}
            >
              <Icon name={s.icon} size={22} color="#fffaf0" weight={2.3} />
            </span>
            <span className="ink-title block text-fs-sm mt-1.5">{i + 1}. {s.t}</span>
            <span className="ink-hand block text-fs-2xs">{s.d}</span>
          </InkCard>
        </li>
      ))}
    </ol>
  );
}

/* ── a world, seen through a torn window in the page ─────────────────────── */

/** An irregular torn-paper mat — no two windows cut the same. */
function tornWindow(seed: number): string {
  const r = hand(seed);
  const pts: string[] = [];
  const jitter = () => (r() * 2.6).toFixed(1);
  for (let i = 0; i <= 6; i++) pts.push(`${(i / 6) * 100}% ${jitter()}%`);
  pts.push(`100% ${(100 - r() * 2.4).toFixed(1)}%`);
  for (let i = 5; i >= 0; i--) pts.push(`${(i / 6) * 100}% ${(100 - r() * 2.6).toFixed(1)}%`);
  return `polygon(${pts.join(", ")})`;
}

/* ── the window into a world ─────────────────────────────────────────────────
   This used to be one big emoji. `ink/Icons.tsx` opens by saying emoji "read as
   'we didn't make art'", and it is right: a 🐠 is somebody else's drawing,
   rendered differently on every phone, sitting on a card whose every other line
   this app drew by hand. Three of our own doodles in a little arrangement say
   what lives in there far better than one glyph ever did, and they say it in
   the same hand as everything around them. */
const PACK_SCENE: Record<string, [string, string, string]> = {
  ocean: ["fish", "starfish", "jellyfish"],
  space: ["rocket", "planet", "star"],
  farm:  ["cow", "chicken", "tree"],
  dino:  ["trex", "egg", "palmtree"],
  dream: ["rainbow", "cat", "star"],
};

function PackPreview({ id }: { id: string }) {
  const [big, left, right] = PACK_SCENE[id] ?? PACK_SCENE.dream;
  return (
    <span className="relative grid place-items-center" style={{ width: 168, height: 104 }}>
      {/* the two small ones drift on their own beat, so the group never pulses
          as one block — that reads as a logo rather than as a place */}
      <span className="absolute anim-float-y" style={{ left: 0, bottom: 2, animationDelay: "460ms" }}>
        <Doodle name={left} size={46} />
      </span>
      <span className="absolute anim-float-y" style={{ right: 0, top: 0, animationDelay: "900ms" }}>
        <Doodle name={right} size={42} />
      </span>
      <span className="relative anim-float-y drop-shadow-lg">
        <Doodle name={big} size={80} />
      </span>
    </span>
  );
}

/* ── drawing school ──────────────────────────────────────────────────────────
   One wide card, not a third carousel. Home already asks a child to swipe
   twice — through the worlds and through the writing worlds — and a third row
   of the same shape stops reading as "another thing you can do" and starts
   reading as wallpaper. The school's own screen is where the forty lessons get
   room to breathe. */
function DrawSchoolCard({ done, total, onOpen }: { done: number; total: number; onOpen: () => void }) {
  return (
    <button
      onClick={() => { sfxHappy(); onOpen(); }}
      aria-label={`Drawing school. Learn to draw by tracing. ${done} of ${total} done.`}
      className="ink-pinned block w-full text-left"
    >
      <InkCard seed={77} className="overflow-hidden" radius={16}>
        <div className="relative m-2 mb-0 overflow-hidden" style={{ clipPath: tornWindow(23) }}>
          <div
            className="h-28 sm:h-32 grid place-items-center"
            style={{ background: "linear-gradient(160deg,#ffd9a0 0%,#ffb37a 52%,#ff9ec4 100%)" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "radial-gradient(72% 58% at 50% 16%, rgba(255,255,255,0.42), rgba(255,255,255,0) 72%)" }}
            />
            {/* the promise of the screen, in one picture: a guide, and the
                drawing that comes off it */}
            <span aria-hidden="true" className="relative flex items-center gap-3">
              <Doodle name="fish" size={62} mono="rgba(255,253,247,0.8)" />
              <Icon name="pencil" size={22} color="#2d2926" weight={2.6} />
              <span className="anim-float-y block"><Doodle name="fish" size={68} /></span>
            </span>
          </div>
        </div>

        <div className="px-3 pb-3 pt-2">
          <span className="ink-title block text-fs-lg">Drawing school</span>
          <span className="ink-hand block text-fs-xs">Trace it once — then it's yours</span>
          <InkCard
            aria-hidden="true"
            tone="#ff7a1a"
            seed={31}
            radius={18}
            lifted={false}
            className="mt-2 py-1.5 ink-title text-fs-md"
            contentClassName="flex items-center justify-center gap-1.5 ink-on-wax"
          >
            <Icon name="pencil" size={17} color="#fffaf0" weight={2.4} />
            Learn to draw
          </InkCard>
        </div>

        {done > 0 && (
          <span
            className="absolute top-3 right-3 ink-title text-fs-2xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
          >
            {done}/{total}
          </span>
        )}
      </InkCard>
    </button>
  );
}

function PackCard({
  pack, count, index, onPlay, onLocked,
}: { pack: WorldPack; count: number; index: number; onPlay: () => void; onLocked: () => void }) {
  const label = pack.locked
    ? `${pack.name}. ${pack.tagline} Locked — ask a grown-up.`
    : `Play ${pack.name}. ${pack.tagline}${count > 0 ? ` ${count} creature${count === 1 ? "" : "s"} live here.` : ""}`;

  return (
    <button
      onClick={() => { if (pack.locked) { sfxTap(); onLocked(); } else { sfxHappy(); onPlay(); } }}
      aria-label={label}
      className="ink-pinned block w-[min(72vw,17rem)] shrink-0 text-left"
    >
      <InkCard seed={index * 53 + 9} className="overflow-hidden" radius={16}>
        {/* the window into the world */}
        <div className="relative m-2 mb-0 overflow-hidden" style={{ clipPath: tornWindow(index * 7 + 3) }}>
          <div className="h-28 sm:h-32 grid place-items-center" style={{ background: pack.gradient }}>
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "radial-gradient(72% 58% at 50% 16%, rgba(255,255,255,0.4), rgba(255,255,255,0) 72%)" }}
            />
            <span aria-hidden="true" className="relative"><PackPreview id={pack.id} /></span>
          </div>
        </div>

        <div className="px-3 pb-3 pt-2">
          <span className="ink-title block text-fs-lg">{pack.name}</span>
          <span className="ink-hand block text-fs-xs">{pack.tagline}</span>
          {pack.locked ? (
            <span
              aria-hidden="true"
              className="mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-full ink-title text-fs-md"
              style={{ color: "var(--plum)", border: "2.5px dashed var(--ink)" }}
            >
              <Icon name="lock" size={17} color="var(--plum)" />
              Ask a grown-up
            </span>
          ) : (
            <InkCard
              aria-hidden="true"
              tone="#00c2b9"
              seed={index * 11 + 61}
              radius={18}
              lifted={false}
              className="mt-2 py-1.5 ink-title text-fs-md"
              contentClassName="flex items-center justify-center gap-1.5 ink-on-wax"
            >
              <Icon name="play" size={17} color="#fffaf0" fill="#fffaf0" />
              Play
            </InkCard>
          )}
        </div>

        {count > 0 && !pack.locked && (
          <span
            className="absolute top-3 right-3 ink-title text-fs-2xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
          >
            {count} alive
          </span>
        )}
      </InkCard>
    </button>
  );
}

/* ── a writing world, previewed by what you make in it ──────────────────── */

/** How many lessons each writing world holds, so a card can show progress. */
const WRITING_TOTAL: Record<WritingWorldId, number> = {
  shapes: SHAPE_LESSONS.length,
  letters: LETTER_LESSONS.length,
  numbers: ALL_NUMBER_LESSONS.length + SUM_LESSONS.length,
  words: WORD_LESSONS.length,
};

/** Which progress keys belong to which world. Keys are persisted — see storage. */
const WRITING_PREFIX: Record<WritingWorldId, string[]> = {
  /* `shape:` moved worlds, not keys — every star a child earned tracing a
     circle in Math World is still theirs, and now counts here. */
  shapes: ["shape:"],
  letters: ["letter:"],
  numbers: ["digit:", "teen:", "tens:", "big:", "sum:"],
  words: ["word:"],
};

/** How many drawing lessons have been traced at least once. The `draw:` prefix
 *  is what keeps them out of the letter and number counts — one flat map holds
 *  the lot (see storage). */
function drawingDone(progress: Record<string, number>): number {
  return Object.keys(progress).filter((k) => k.startsWith("draw:")).length;
}

function writingDone(progress: Record<string, number>, id: WritingWorldId): number {
  const pre = WRITING_PREFIX[id];
  return Object.keys(progress).filter((k) => pre.some((p) => k.startsWith(p))).length;
}

/**
 * The preview inside the torn window. It shows the *output*, not an icon: three
 * letters in the very letterform the child will trace, and — for Word World —
 * the whole promise of the feature, a written word turning into a creature.
 */
function WritingPreview({ id }: { id: WritingWorldId }) {
  const cream = "#fffaf0";
  if (id === "words") {
    return (
      <span className="flex items-center gap-1.5 relative">
        {"DOG".split("").map((c, i) => (
          <GlyphMark key={i} char={c} size={34} color={cream} weight={11} />
        ))}
        <Icon name="sparkle" size={20} color={cream} fill={cream} className="anim-sparkle" />
        <span className="anim-float-y block"><Doodle name="dog" size={48} /></span>
      </span>
    );
  }
  if (id === "shapes") {
    /* The three that say what this world is at a glance: a closed shape, a
       straight-sided one, and the wiggle nobody expects to find in a writing
       school. Smaller than the letters because a shape fills its whole square
       box, where a letter only fills two thirds of its width. */
    return (
      <span className="flex items-center gap-2.5 relative">
        {["circle", "triangle", "zigzag"].map((c, i) => (
          <span key={c} className="anim-letter" style={{ animationDelay: `${i * 220}ms` }}>
            <GlyphMark char={c} size={44} color={cream} weight={9} />
          </span>
        ))}
      </span>
    );
  }
  const chars = id === "letters" ? ["A", "B", "C"] : ["1", "2", "3"];
  return (
    <span className="flex items-end gap-2.5 relative">
      {chars.map((c, i) => (
        <span key={c} className="anim-letter" style={{ animationDelay: `${i * 220}ms` }}>
          <GlyphMark char={c} size={54} color={cream} weight={11} />
        </span>
      ))}
    </span>
  );
}

function WritingCard({
  world, index, done, onOpen,
}: { world: WritingWorld; index: number; done: number; onOpen: () => void }) {
  const total = WRITING_TOTAL[world.id];
  return (
    <button
      onClick={() => { sfxHappy(); onOpen(); }}
      aria-label={`${world.name}. ${world.tagline} ${done} of ${total} done.`}
      className="ink-pinned block w-[min(72vw,17rem)] shrink-0 text-left"
    >
      <InkCard seed={index * 41 + 27} className="overflow-hidden" radius={16}>
        <div className="relative m-2 mb-0 overflow-hidden" style={{ clipPath: tornWindow(index * 9 + 11) }}>
          <div className="h-28 sm:h-32 grid place-items-center" style={{ background: world.gradient }}>
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "radial-gradient(72% 58% at 50% 16%, rgba(255,255,255,0.4), rgba(255,255,255,0) 72%)" }}
            />
            <span aria-hidden="true" className="relative drop-shadow-lg"><WritingPreview id={world.id} /></span>
          </div>
        </div>

        <div className="px-3 pb-3 pt-2">
          <span className="ink-title block text-fs-lg">{world.name}</span>
          <span className="ink-hand block text-fs-xs">{world.tagline}</span>
          <InkCard
            aria-hidden="true"
            tone={world.tone}
            seed={index * 19 + 5}
            radius={18}
            lifted={false}
            className="mt-2 py-1.5 ink-title text-fs-md"
            contentClassName="flex items-center justify-center gap-1.5 ink-on-wax"
          >
            <Icon name="pencil" size={17} color="#fffaf0" weight={2.4} />
            {world.verb}
          </InkCard>
        </div>

        {done > 0 && (
          <span
            className="absolute top-3 right-3 ink-title text-fs-2xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
          >
            {done}/{total}
          </span>
        )}
      </InkCard>
    </button>
  );
}

/* ── the page ────────────────────────────────────────────────────────────── */

export default function Home({
  creatures,
  onPlayWorld,
  onDraw,
  onWrite,
  onDrawSchool,
  onGrownUps,
  idea,
  welcome,
  onDrawIdea,
  pet,
  petLine,
  onVisitPet,
  onStickerBook,
  onForget,
}: {
  creatures: Creature[];
  onPlayWorld: (worldId: string) => void;
  onDraw: () => void;
  onWrite: (worldId: WritingWorldId) => void;
  /** Open the drawing school. Optional only so this file does not have to land
   *  in the same commit as the route. */
  onDrawSchool?: () => void;
  /** Open the grown-up snapshot. Optional for the same reason. */
  onGrownUps?: () => void;
  /** Today's drawing idea — the same all day, different tomorrow. */
  idea?: string;
  /** A warm line for a child who has been away — it already carries the streak
   *  when there is one to mention, so nothing else on the page repeats it. */
  welcome?: string | null;
  onDrawIdea?: () => void;
  /** The crowned creature, or nothing. Optional for the same reason as the
   *  callbacks above — Home must keep rendering for a build without a pet. */
  pet?: Creature | null;
  /** The pet's ready-made hello, written upstream. Rendered as given. */
  petLine?: string | null;
  /** Go and see the pet. Without it the card has nowhere to send anyone, so
   *  it is not shown at all. */
  onVisitPet?: () => void;
  /** Open the sticker book — every drawing ever made, including the ones the
   *  world has since made room for. Optional, like the other routes here. */
  onStickerBook?: () => void;
  /** Say goodbye to a drawing for good: above us it leaves the list, is
   *  written to the device, and gives up the crown if it wore one. This screen
   *  only ever asks the question — without this callback the shelf keeps its
   *  old single job, tapping to visit, and no hold is offered. */
  onForget?: (id: string) => void;
}) {
  const [grownUps, setGrownUps] = useState<WorldPack | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const recent = creatures.slice(-8).reverse();
  // Read once per mount: the writing worlds write it, and coming back here
  // remounts this screen.
  const [writing] = useState(() => loadWriting());
  const isNew = creatures.length === 0;
  const homeWorld = WORLD_PACKS[0].id;
  // No pet is the ordinary first-run state, and it must leave this page exactly
  // as it was: nothing rendered, no empty slot, and no shifted entrances. The
  // `--i` stagger below is hand-numbered, so it counts from the pet card when
  // there is one and from zero when there is not.
  const showPet = !!pet && !!onVisitPet;
  const step = (n: number) => ({ "--i": showPet ? n + 1 : n } as React.CSSProperties);

  useEffect(() => {
    if (!grownUps) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setGrownUps(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grownUps]);

  /* ── saying goodbye ─────────────────────────────────────────────────────────
     The hold on a tile arrives here and does exactly one thing: it puts the
     drawing on the table and asks. Nothing has happened to it yet, and nothing
     will until the shared confirm is answered — the same confirm the world
     shows, word for word, so there is only ever one wording of the only
     irreversible thing in this app. */
  const [goodbye, setGoodbye] = useState<Creature | null>(null);
  /** The farewell, in the world's own register: nobody is deleted here. */
  const [farewell, setFarewell] = useState<string | null>(null);
  const byeRef = useRef<HTMLDivElement>(null);
  /** Where the focus was, so a keyboard finds its place again on "Keep!". */
  const byeFrom = useRef<HTMLElement | null>(null);
  /** True only when a press *began* on the paper around the question — the
   *  finger that finished the hold is still coming up somewhere over this
   *  backdrop, and it must not answer the question it has just asked. */
  const byeOutside = useRef(false);
  const byeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(byeTimer.current), []);

  const askGoodbye = (c: Creature) => {
    byeFrom.current = document.activeElement as HTMLElement | null;
    byeOutside.current = false;
    setGoodbye(c);
  };
  const keepGoodbye = useCallback(() => {
    setGoodbye(null);
    byeFrom.current?.focus?.();
    byeFrom.current = null;
  }, []);
  const letGo = (c: Creature) => {
    setGoodbye(null);
    byeFrom.current = null;
    onForget?.(c.id);
    sfxSplash();
    setFarewell(`${c.name} went off to explore. Bye!`);
    window.clearTimeout(byeTimer.current);
    byeTimer.current = window.setTimeout(() => setFarewell(null), 2800);
  };

  useEffect(() => {
    if (!goodbye) return;
    byeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { sfxTap(); keepGoodbye(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goodbye, keepGoodbye]);

  return (
    <div className="screen ink-paper overflow-y-auto no-scrollbar">
      <div
        className="mx-auto w-full max-w-3xl pad-x pad-t"
        style={{ paddingBottom: "max(var(--sp-6), calc(var(--safe-b) + var(--sp-5)))" }}
      >
        {/* ── masthead: the mark is drawn in real wax ── */}
        <header className="text-center anim-rise-in">
          <h1 className="flex justify-center">
            <Wordmark width={286} className="max-w-[86%]" />
          </h1>
          <p className="ink-hand text-fs-sm -mt-1">draw it · it lives</p>
          <span className="block mx-auto w-40 max-w-[60%]"><Scribble seed={12} height={10} /></span>
        </header>

        {/* ── coming back: a warm hello, and something new to draw today ──
            No countdown, no expiring reward, nothing lost by staying away —
            just a reason to open it that is different from yesterday's. */}
        {welcome && (
          <p
            role="status"
            className="ink-title text-fs-md text-center mt-2 anim-pop-in"
            style={{ color: "var(--plum)" }}
          >
            {welcome}
          </p>
        )}

        {/* ── my pet ── */}
        {pet && onVisitPet && (
          <section className="mt-3 enter" style={{ "--i": 0 } as React.CSSProperties} aria-labelledby="pet-h">
            <h2 id="pet-h" className="visually-hidden">My pet</h2>
            <PetCard pet={pet} line={petLine} onVisit={onVisitPet} />
          </section>
        )}

        {idea && onDrawIdea && (
          <section className="mt-3 enter" style={step(0)} aria-labelledby="today-h">
            <h2 id="today-h" className="visually-hidden">Today's drawing idea</h2>
            <button
              onClick={() => { sfxHappy(); onDrawIdea(); }}
              aria-label={`Today's idea: draw ${idea}. Tap to start drawing it.`}
              className="ink-pinned block w-full text-left"
            >
              <InkCard
                seed={91}
                radius={18}
                className="px-3 py-2.5"
                contentClassName="flex items-center gap-3"
              >
                <span aria-hidden="true" className="shrink-0 anim-sparkle">
                  <Icon name="sparkle" size={26} color="var(--sun)" fill="var(--sun)" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="ink-hand block text-fs-2xs">today's idea</span>
                  <span className="ink-title block text-fs-lg leading-tight truncate">Draw {idea}!</span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 grid place-items-center rounded-full"
                  style={{ width: 34, height: 34, background: "var(--sun)", border: "2.5px solid var(--ink)" }}
                >
                  <Icon name="pencil" size={18} />
                </span>
              </InkCard>
            </button>
          </section>
        )}

        {/* ── the one thing to do ── */}
        <section className="mt-3 enter" style={step(1)} aria-labelledby="hero-h">
          <h2 id="hero-h" className="visually-hidden">Start drawing</h2>
          <InkButton
            tone="#8b46c7"
            seed={4}
            radius={22}
            onClick={() => { sfxHappy(); onDraw(); }}
            className="w-full !px-4 !py-4 sm:!px-6 sm:!py-5"
            style={{ minHeight: "var(--tap-hero)" }}
          >
            <span className="flex items-center gap-3 sm:gap-4 w-full text-left">
              <span aria-hidden="true" className="shrink-0 anim-wiggle inline-block">
                <Icon name="pencil" size={44} color="#fffaf0" weight={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block font-display font-extrabold text-fs-3xl leading-none ink-on-wax">
                  {isNew ? "Draw something!" : "Draw!"}
                </span>
                <span className="block ink-on-wax font-bold text-fs-sm mt-1 opacity-95">
                  {isNew ? "Anything at all — the pen brings it to life" : "Make a brand-new creature"}
                </span>
              </span>
            </span>
          </InkButton>

          {/* Absorbed by the pet card when there is one: tapping the pet goes
              to the same place, and two doors to one room is one too many.
              Without a pet this is still the only way in. */}
          {!isNew && !showPet && (
            <InkButton
              tone="#00c2b9"
              seed={26}
              radius={20}
              onClick={() => { sfxHappy(); onPlayWorld(homeWorld); }}
              className="w-full mt-3 font-display font-extrabold text-fs-xl"
              aria-label={`Visit my world — ${creatures.length} creature${creatures.length === 1 ? "" : "s"} living there`}
            >
              <Icon name="globe" size={24} color="#fffaf0" weight={2.3} />
              <span className="ink-on-wax">My world</span>
              <span
                aria-hidden="true"
                className="ink-title text-fs-sm px-2 rounded-full"
                style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
              >
                {creatures.length}
              </span>
            </InkButton>
          )}
        </section>

        {/* ── the child's own work ── */}
        <section className="mt-6 enter" style={step(2)} aria-labelledby="mine-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="mine-h" className="ink-title text-fs-xl">
              {isNew ? "How the magic works" : "Your creatures"}
            </h2>
            {!isNew && (
              <span className="ink-hand text-fs-2xs">
                {onForget ? "tap to visit · hold to wave bye" : "tap one to visit it"}
              </span>
            )}
          </div>

          {/* Said out loud, the way the world says it. */}
          {farewell && (
            <p
              role="status"
              className="ink-title text-fs-sm mt-1 anim-pop-in"
              style={{ color: "var(--plum)" }}
            >
              {farewell}
            </p>
          )}

          {isNew ? (
            <div className="mt-2"><HowItWorks /></div>
          ) : (
            <ul className="flex gap-4 overflow-x-auto no-scrollbar pt-3 pb-2 -mx-1 px-1">
              {recent.map((c, i) => (
                <li key={c.id}>
                  <PinnedDrawing
                    c={c}
                    index={i}
                    onOpen={() => onPlayWorld(homeWorld)}
                    onGoodbye={onForget ? () => askGoodbye(c) : undefined}
                    saying={goodbye?.id === c.id}
                  />
                </li>
              ))}
              <li className="self-stretch">
                <button
                  onClick={() => { sfxHappy(); onDraw(); }}
                  aria-label="Draw another creature"
                  className="ink-btn w-28 h-full min-h-[9rem] grid place-content-center place-items-center gap-1"
                  style={{ border: "3px dashed var(--ink)", borderRadius: 18, opacity: 0.65 }}
                >
                  <Icon name="plus" size={30} />
                  <span className="ink-hand text-fs-2xs">one more!</span>
                </button>
              </li>
            </ul>
          )}
        </section>

        {/* ── worlds ── */}
        {/* Everything ever drawn, including what the world has since made room
            for. It sits under the shelf rather than in its header, because that
            is where a child looking for a drawing that is no longer here looks. */}
        {!isNew && onStickerBook && (
          <button
            onClick={() => { sfxTap(); onStickerBook(); }}
            aria-label="Open the sticker book — every drawing you have made"
            className="hud-focus mt-3 w-full flex items-center justify-center gap-2 py-2"
            style={{ color: "var(--ink-soft)" }}
          >
            <Icon name="star" size={16} color="var(--ink-soft)" weight={2.1} />
            <span className="ink-hand text-fs-xs underline decoration-2 underline-offset-2">
              open the sticker book
            </span>
          </button>
        )}

        <section className="mt-6 enter" style={step(3)} aria-labelledby="worlds-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="worlds-h" className="ink-title text-fs-xl">Magic worlds</h2>
            <span className="ink-hand text-fs-2xs">swipe →</span>
          </div>
          <ul className="flex gap-4 overflow-x-auto no-scrollbar pt-3 pb-2 -mx-1 px-1">
            {WORLD_PACKS.map((p, i) => (
              <li key={p.id} className="enter-pop" style={{ "--i": i } as React.CSSProperties}>
                <PackCard
                  pack={p}
                  index={i}
                  count={!p.locked ? creatures.length : 0}
                  onPlay={() => onPlayWorld(p.id)}
                  onLocked={() => setGrownUps(p)}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ── writing worlds ── */}
        <section className="mt-6 enter" style={step(4)} aria-labelledby="write-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="write-h" className="ink-title text-fs-xl">Writing school</h2>
            <span className="ink-hand text-fs-2xs">shapes, letters, numbers &amp; words</span>
          </div>
          <ul className="flex gap-4 overflow-x-auto no-scrollbar pt-3 pb-2 -mx-1 px-1">
            {WRITING_WORLDS.map((w, i) => (
              <li key={w.id} className="enter-pop" style={{ "--i": i } as React.CSSProperties}>
                <WritingCard
                  world={w}
                  index={i}
                  done={writingDone(writing, w.id)}
                  onOpen={() => onWrite(w.id)}
                />
              </li>
            ))}
          </ul>
        </section>

        {onDrawSchool && (
          <section className="mt-6 enter" style={step(5)} aria-labelledby="school-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="school-h" className="ink-title text-fs-xl">Drawing school</h2>
              <span className="ink-hand text-fs-2xs">learn to draw anything</span>
            </div>
            <div className="pt-3 enter-pop" style={{ "--i": 0 } as React.CSSProperties}>
              <DrawSchoolCard
                done={drawingDone(writing)}
                total={DRAW_LESSONS.length}
                onOpen={onDrawSchool}
              />
            </div>
          </section>
        )}

        {/* Honest about what leaves the device — and, for a grown-up, a way in
            to see what the child has been practising. */}
        <div className="mt-5 flex flex-col items-center gap-2">
          {onGrownUps && (
            <button
              onClick={() => { sfxTap(); onGrownUps(); }}
              className="ink-title text-fs-xs px-4 py-2 rounded-full"
              style={{ background: "#fffaf0", border: "2.5px solid var(--ink)" }}
            >
              For grown-ups: what they've learned
            </button>
          )}
          <p className="ink-hand text-fs-2xs text-center opacity-80">
            No ads, no accounts. Drawings are saved on this device;
            the magic-dust artwork is made online.
          </p>
        </div>
      </div>

      {/* ── saying goodbye to a drawing ──────────────────────────────────────
          Over the shelf rather than inside it: the tiles are 144px wide and a
          question this size cannot be asked in a column that narrow. The
          drawing itself comes along, big, above its own name — a child cannot
          be asked to agree to something leaving without being shown which
          thing it is. Tapping the paper around it is a "Keep!", but not for
          the first moment: the finger that finished the hold is still coming
          up, and it must not answer the question it just asked. */}
      {goodbye && (
        <div
          className="fixed inset-0 bg-black/45 grid place-items-center p-5 z-50 overflow-y-auto"
          onPointerDown={(e) => { byeOutside.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            const outside = byeOutside.current && e.target === e.currentTarget;
            byeOutside.current = false;
            if (outside) { sfxTap(); keepGoodbye(); }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bye-title"
        >
          <div
            ref={byeRef}
            tabIndex={-1}
            className="max-w-sm w-full my-auto outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The drawing pops in; the sheet holding it does not. Everything
                under a scaling box measures small while the scale is running,
                and `ReleaseConfirm` draws its border from a box it measures on
                mount — so a pop on this card would leave that hand-drawn frame
                stuck at a fraction of its size. The pop belongs to the drawing,
                which is the thing worth announcing anyway. */}
            <InkCard seed={57} className="p-3 pt-4 text-center" radius={18}>
              <Tape
                seed={2}
                style={{
                  width: 74, height: 24, top: -11, left: "50%",
                  marginLeft: -37, transform: "rotate(-4deg)",
                }}
              />
              {/* Big where there is room for big. On a short screen — a tablet
                  held sideways — the drawing gives way rather than pushing
                  "Keep!" off the bottom of the glass. */}
              <span className="h-32 [@media(max-height:560px)]:h-24 grid place-items-center">
                {/* two wrappers, because the pop is an animation and would
                    otherwise outrank the shrink and undo it */}
                <span className="block anim-pop-in">
                  <span className="block [@media(max-height:560px)]:scale-75">
                    <Thumb c={goodbye} size={124} />
                  </span>
                </span>
              </span>
              <h3 id="bye-title" className="ink-title text-fs-2xl leading-tight mt-1">{goodbye.name}</h3>
              <p className="ink-hand text-fs-2xs">your {kindById(goodbye.kindId).label}</p>
              <ReleaseConfirm
                name={goodbye.name}
                onKeep={() => { sfxTap(); keepGoodbye(); }}
                onRelease={() => letGo(goodbye)}
              />
            </InkCard>
          </div>
        </div>
      )}

      {/* ── locked-world sheet ── */}
      {grownUps && (
        <div
          className="fixed inset-0 bg-black/45 grid place-items-center p-5 z-50 overflow-y-auto"
          onClick={() => setGrownUps(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pack-title"
        >
          <InkCard
            seed={71}
            className="max-w-sm w-full p-5 text-center anim-pop-in my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden="true" className="grid place-items-center">
              <Doodle name={PACK_SCENE[grownUps.id]?.[0] ?? "star"} size={64} />
            </span>
            <h3 id="pack-title" className="ink-title text-fs-2xl mt-2">{grownUps.name}</h3>
            <p className="ink-hand text-fs-sm mt-1">
              A whole new world where drawings{" "}
              {grownUps.id === "space" ? "blast off and orbit" : grownUps.id === "farm" ? "moo, oink and play" : "stomp and ROAR"}!
            </p>

            <p
              className="ink-title text-fs-xs inline-block mt-3 px-3 py-1 rounded-full"
              style={{ background: "var(--sun)", border: "2.5px solid var(--ink)" }}
            >
              Not ready yet
            </p>
            <p className="ink-hand text-fs-2xs mt-2">
              This is a preview build, so there's nothing to buy — no payment screen, no charge.
              {grownUps.price ? ` When it opens it'll be ${grownUps.price}.` : ""}
            </p>

            <InkButton
              ref={closeRef}
              tone="#00c2b9"
              seed={88}
              onClick={() => { sfxTap(); setGrownUps(null); }}
              className="w-full mt-4 font-display font-extrabold text-fs-lg"
            >
              <span className="ink-on-wax">Got it</span>
            </InkButton>
          </InkCard>
        </div>
      )}
    </div>
  );
}
