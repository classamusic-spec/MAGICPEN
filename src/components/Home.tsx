// ─── Home: the sketchbook's first page ──────────────────────────────────────
// The child's own drawings are the point of this product, so they are the
// hero of this screen — mounted into the book with tape, not listed in boxes.

import { useEffect, useRef, useState } from "react";
import type { Creature, WorldPack } from "@/lib/types";
import { WORLD_PACKS, kindById } from "@/lib/creatures";
import { sfxTap, sfxHappy } from "@/lib/audio";
import { artSprite, onArtLoaded } from "@/lib/polish";
import { bakeCrayonSprite } from "@/lib/sprites";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { Wordmark } from "@/components/ink/Wordmark";
import { hand } from "@/lib/ink";

/**
 * A creature thumbnail. Uses the same baked sticker sprite the worlds use —
 * ink ring, white ring, then the wax — so a small drawing still reads clearly
 * instead of fading into a pale scribble.
 */
export function Thumb({ c }: { c: Creature }) {
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
    const k = 104 / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * k));
    const ch = Math.max(1, Math.round(h * k));
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
  }, [c, art, photoImg]);

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

/* ── a drawing taped into the book ───────────────────────────────────────── */

function PinnedDrawing({
  c, index, onOpen,
}: { c: Creature; index: number; onOpen: () => void }) {
  const kind = kindById(c.kindId);
  const r = hand(index * 31 + 7);
  const tilt = (r() - 0.5) * 5.2;

  return (
    <button
      onClick={() => { sfxHappy(); onOpen(); }}
      aria-label={`Visit ${c.name} the ${kind.label} in your world`}
      className="ink-pinned relative block w-36 shrink-0 enter-pop"
      style={{ "--i": index, transform: `rotate(${tilt}deg)` } as React.CSSProperties}
    >
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
    </button>
  );
}

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
            <span className="text-6xl relative anim-float-y drop-shadow-lg">{pack.emoji}</span>
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

/* ── the page ────────────────────────────────────────────────────────────── */

export default function Home({
  creatures,
  onPlayWorld,
  onDraw,
}: {
  creatures: Creature[];
  onPlayWorld: (worldId: string) => void;
  onDraw: () => void;
}) {
  const [grownUps, setGrownUps] = useState<WorldPack | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const recent = creatures.slice(-8).reverse();
  const isNew = creatures.length === 0;
  const homeWorld = WORLD_PACKS[0].id;

  useEffect(() => {
    if (!grownUps) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setGrownUps(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grownUps]);

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

        {/* ── the one thing to do ── */}
        <section className="mt-3 enter" style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="hero-h">
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

          {!isNew && (
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
        <section className="mt-6 enter" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="mine-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="mine-h" className="ink-title text-fs-xl">
              {isNew ? "How the magic works" : "Your creatures"}
            </h2>
            {!isNew && <span className="ink-hand text-fs-2xs">tap one to visit it</span>}
          </div>

          {isNew ? (
            <div className="mt-2"><HowItWorks /></div>
          ) : (
            <ul className="flex gap-4 overflow-x-auto no-scrollbar pt-3 pb-2 -mx-1 px-1">
              {recent.map((c, i) => (
                <li key={c.id}>
                  <PinnedDrawing c={c} index={i} onOpen={() => onPlayWorld(homeWorld)} />
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
        <section className="mt-6 enter" style={{ "--i": 3 } as React.CSSProperties} aria-labelledby="worlds-h">
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

        {/* Honest about what leaves the device: the drawings are kept locally,
            but the optional "magic dust" art is generated online. */}
        <p className="ink-hand text-fs-2xs text-center mt-5 opacity-80">
          For grown-ups: no ads, no accounts. Drawings are saved on this device;
          the magic-dust artwork is made online.
        </p>
      </div>

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
            <span aria-hidden="true" className="text-5xl block">{grownUps.emoji}</span>
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
