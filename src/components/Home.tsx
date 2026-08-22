import { useEffect, useRef, useState } from "react";
import type { Creature, WorldPack } from "@/lib/types";
import { WORLD_PACKS, kindById } from "@/lib/creatures";
import { normalizeStrokes, drawStrokeFull, strokesBounds } from "@/lib/crayon";
import { sfxTap, sfxHappy } from "@/lib/audio";
import { artSprite, onArtLoaded } from "@/lib/polish";
import { Wordmark } from "@/components/Splash";

/** Mini creature thumbnail — premium AI art when available, else baked crayon. */
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
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    if (photoImg && !art) {
      const k = 88 / Math.max(photoImg.width, photoImg.height);
      cv.width = Math.round(photoImg.width * k) + 8;
      cv.height = Math.round(photoImg.height * k) + 8;
      ctx.drawImage(photoImg, 4, 4, cv.width - 8, cv.height - 8);
      return;
    }
    if (art) {
      const k = 96 / Math.max(art.width, art.height);
      cv.width = Math.round(art.width * k);
      cv.height = Math.round(art.height * k);
      ctx.drawImage(art, 0, 0, cv.width, cv.height);
      return;
    }
    const norm = normalizeStrokes(c.strokes, 80);
    const b = strokesBounds(norm.strokes);
    cv.width = b.w + 16; cv.height = b.h + 16;
    ctx.translate(cv.width / 2, cv.height / 2);
    norm.strokes.forEach((s, i) => drawStrokeFull(ctx, s, i + 1));
  }, [c, art, photoImg]);
  return <canvas ref={ref} role="img" aria-label={`${c.name}, your drawing`} className="max-w-full max-h-full" />;
}

/* ── World card: the whole card is the target, so small hands can't miss ── */
function PackCard({
  pack, count, onPlay, onLocked,
}: { pack: WorldPack; count: number; onPlay: () => void; onLocked: () => void }) {
  const label = pack.locked
    ? `${pack.name}. ${pack.tagline} Locked — ask a grown-up.`
    : `Play ${pack.name}. ${pack.tagline}${count > 0 ? ` ${count} creature${count === 1 ? "" : "s"} live here.` : ""}`;

  return (
    <button
      onClick={() => { if (pack.locked) { sfxTap(); onLocked(); } else { sfxHappy(); onPlay(); } }}
      aria-label={label}
      className="sticker-card hover-lift overflow-hidden w-[min(72vw,16rem)] shrink-0 flex flex-col text-left p-0"
    >
      <div className="h-28 sm:h-32 relative grid place-items-center overflow-hidden" style={{ background: pack.gradient }}>
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "radial-gradient(70% 55% at 50% 20%, rgba(255,255,255,0.42), rgba(255,255,255,0) 70%)" }}
        />
        <span aria-hidden="true" className="absolute left-3 bottom-2 text-2xl opacity-70 anim-float-y" style={{ animationDelay: "1.1s" }}>✨</span>
        <span aria-hidden="true" className="absolute right-4 top-3 text-xl opacity-60 anim-float-y" style={{ animationDelay: "0.5s" }}>✨</span>
        <span className="text-6xl anim-float-y drop-shadow-lg relative">{pack.emoji}</span>

        {pack.locked ? (
          <span className="chip chip-coral absolute top-2 right-2 rotate-6 shadow-ink-1">🔒 {pack.price ?? "soon"}</span>
        ) : count > 0 ? (
          <span className="chip absolute top-2 right-2 shadow-ink-1">
            {count} alive
          </span>
        ) : null}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1">
        <span className="type-h3 block">{pack.name}</span>
        <span className="type-label block flex-1">{pack.tagline}</span>
        <span
          aria-hidden="true"
          className={`sticker-btn btn-pill mt-2 w-full text-fs-md ${pack.locked ? "bg-white text-plum" : "grad-sea text-white"}`}
        >
          {pack.locked ? "🔒 Ask a grown-up" : "▶ Play"}
        </span>
      </div>
    </button>
  );
}

/* ── First-run explainer: three steps, no reading required ── */
const STEPS = [
  { e: "🖍️", t: "Scribble", d: "Draw anything" },
  { e: "🪄", t: "Magic", d: "Tap the big button" },
  { e: "🐠", t: "Alive!", d: "Watch it play" },
];

function HowItWorks() {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="How Magic Pen works">
      {STEPS.map((s, i) => (
        <li
          key={s.t}
          className="card-plain px-2 py-3 text-center enter"
          style={{ "--i": i + 1 } as React.CSSProperties}
        >
          <span aria-hidden="true" className="block text-3xl anim-bob-tilt" style={{ animationDelay: `${i * 0.4}s` }}>{s.e}</span>
          <span className="type-h3 block mt-1 text-fs-sm">{i + 1}. {s.t}</span>
          <span className="type-fine block">{s.d}</span>
        </li>
      ))}
    </ol>
  );
}

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

  // modal: escape closes, close button takes focus
  useEffect(() => {
    if (!grownUps) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setGrownUps(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grownUps]);

  return (
    <div className="screen paper-grain overflow-y-auto no-scrollbar">
      <div
        className="mx-auto w-full max-w-3xl pad-x pad-t"
        style={{ paddingBottom: "max(var(--sp-6), calc(var(--safe-b) + var(--sp-5)))" }}
      >
        {/* ── masthead ── */}
        <header className="text-center anim-rise-in">
          <h1 className="inline-block sticker-card px-4 py-2 sm:px-5 sm:py-3 -rotate-1 text-fs-3xl">
            <span className="visually-hidden">Magic Pen</span>
            <Wordmark />
          </h1>
          <p className="type-label mt-2 text-plum">draw it · it lives 🪄</p>
        </header>

        {/* ── hero action ── */}
        <section className="mt-5 enter" style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="hero-h">
          <h2 id="hero-h" className="visually-hidden">Start drawing</h2>
          <button
            onClick={() => { sfxHappy(); onDraw(); }}
            className="sticker-btn btn-sheen grad-magic w-full text-white text-left px-4 py-4 sm:px-6 sm:py-5"
            style={{ borderRadius: "var(--r-xl)", minHeight: "var(--tap-hero)" }}
          >
            <span className="flex items-center gap-3 sm:gap-4">
              <span aria-hidden="true" className="text-5xl sm:text-6xl anim-wiggle inline-block shrink-0">✏️</span>
              <span className="min-w-0">
                <span className="block font-display font-extrabold text-fs-3xl leading-none ink-outline">
                  {isNew ? "Draw something!" : "Draw!"}
                </span>
                <span className="block type-label text-white/95 mt-1.5">
                  {isNew ? "Anything at all — the pen brings it to life" : "Make a brand-new creature"}
                </span>
              </span>
            </span>
          </button>

          {!isNew && (
            <button
              onClick={() => { sfxHappy(); onPlayWorld(homeWorld); }}
              className="sticker-btn btn-pill grad-sea text-white w-full mt-3"
              aria-label={`Visit my world — ${creatures.length} creature${creatures.length === 1 ? "" : "s"} living there`}
            >
              <span aria-hidden="true" className="text-2xl anim-bounce-soft inline-block">🌍</span>
              My world
              <span aria-hidden="true" className="chip chip-sun ml-1">{creatures.length}</span>
            </button>
          )}
        </section>

        {/* ── the child's own work (or, for a new player, what happens next) ── */}
        <section className="mt-6 enter" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="mine-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="mine-h" className="type-h2">
              {isNew ? "How the magic works" : "Your creatures ✨"}
            </h2>
            {!isNew && <span className="type-fine">tap one to visit it</span>}
          </div>

          {isNew ? (
            <div className="mt-2"><HowItWorks /></div>
          ) : (
            <ul className="shelf no-scrollbar mt-1">
              {recent.map((c, i) => {
                const kind = kindById(c.kindId);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => { sfxHappy(); onPlayWorld(homeWorld); }}
                      aria-label={`Visit ${c.name} the ${kind.label} in your world`}
                      className="sticker-card hover-lift w-28 p-2 text-center enter-pop block"
                      style={{ "--i": i, transform: `rotate(${(i % 2 ? 1 : -1) * 2}deg)` } as React.CSSProperties}
                    >
                      <span className="h-16 grid place-items-center anim-bob-tilt" style={{ animationDelay: `${i * 0.5}s` }}>
                        <Thumb c={c} />
                      </span>
                      <span className="type-h3 block text-fs-sm truncate mt-1">{c.name}</span>
                      <span className="type-fine block truncate">
                        <span aria-hidden="true">{kind.emoji} </span>{kind.label}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  onClick={() => { sfxHappy(); onDraw(); }}
                  aria-label="Draw another creature"
                  className="card-dashed w-28 h-full min-h-[7.5rem] grid place-content-center place-items-center gap-1 text-plum sticker-btn !border-dashed !shadow-none"
                >
                  <span aria-hidden="true" className="text-3xl">➕</span>
                  <span className="type-fine">one more!</span>
                </button>
              </li>
            </ul>
          )}
        </section>

        {/* ── worlds ── */}
        <section className="mt-6 enter" style={{ "--i": 3 } as React.CSSProperties} aria-labelledby="worlds-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="worlds-h" className="type-h2">Magic worlds 🌍</h2>
            <span className="type-fine">swipe →</span>
          </div>
          <ul className="shelf no-scrollbar mt-1">
            {WORLD_PACKS.map((p, i) => (
              <li key={p.id} className="enter-pop" style={{ "--i": i } as React.CSSProperties}>
                <PackCard
                  pack={p}
                  count={!p.locked ? creatures.length : 0}
                  onPlay={() => onPlayWorld(p.id)}
                  onLocked={() => setGrownUps(p)}
                />
              </li>
            ))}
          </ul>
        </section>

        <p className="type-fine text-center mt-5">
          For grown-ups: drawings stay on this device. No ads, no accounts.
        </p>
      </div>

      {/* ── locked-world sheet: says exactly what is and isn't real ── */}
      {grownUps && (
        <div
          className="fixed inset-0 bg-black/45 grid place-items-center p-5 z-50 overflow-y-auto"
          onClick={() => setGrownUps(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pack-title"
        >
          <div className="sticker-card max-w-sm w-full p-5 text-center anim-pop-in my-auto" onClick={(e) => e.stopPropagation()}>
            <span aria-hidden="true" className="text-5xl block">{grownUps.emoji}</span>
            <h3 id="pack-title" className="type-title mt-2">{grownUps.name}</h3>
            <p className="type-body mt-1">
              A whole new world where drawings{" "}
              {grownUps.id === "space" ? "blast off and orbit" : grownUps.id === "farm" ? "moo, oink and play" : "stomp and ROAR"}!
            </p>

            <p className="chip chip-sun mt-3">🛠️ Not ready yet</p>
            <p className="type-fine mt-2">
              This is a preview build, so there's nothing to buy — no payment screen, no charge.
              {grownUps.price ? ` When it opens it'll be ${grownUps.price}.` : ""}
            </p>

            <button
              ref={closeRef}
              onClick={() => { sfxTap(); setGrownUps(null); }}
              className="sticker-btn btn-pill grad-sea text-white w-full mt-4"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
