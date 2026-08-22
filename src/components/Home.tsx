import { useEffect, useRef, useState } from "react";
import type { Creature, WorldPack } from "@/lib/types";
import { WORLD_PACKS, kindById } from "@/lib/creatures";
import { normalizeStrokes, drawStrokeFull, strokesBounds } from "@/lib/crayon";
import { sfxTap, sfxHappy } from "@/lib/audio";
import { artSprite, onArtLoaded } from "@/lib/polish";

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
  return <canvas ref={ref} className="max-w-full max-h-full" />;
}

function PackCard({
  pack, count, onPlay, onLocked,
}: { pack: WorldPack; count: number; onPlay: () => void; onLocked: () => void }) {
  return (
    <div className="sticker-card hover-lift overflow-hidden w-64 shrink-0 flex flex-col">
      <div className="h-32 relative grid place-items-center" style={{ background: pack.gradient }}>
        <span className="text-6xl anim-float-y drop-shadow-lg">{pack.emoji}</span>
        {pack.locked && (
          <div className="absolute top-2 right-2 rotate-6 bg-[var(--coral)] text-white font-display font-bold text-sm px-3 py-1 rounded-full border-[2.5px] border-[var(--ink)] shadow-[0_3px_0_var(--ink)]">
            {pack.price}
          </div>
        )}
        {!pack.locked && count > 0 && (
          <div className="absolute top-2 right-2 bg-white font-extrabold text-xs px-2.5 py-1 rounded-full border-[2.5px] border-[var(--ink)] text-[var(--plum)]">
            {count} alive!
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="font-display font-extrabold text-xl text-[var(--ink)]">{pack.name}</div>
        <div className="text-sm font-semibold text-[var(--muted-foreground)] flex-1">{pack.tagline}</div>
        <button
          onClick={() => { if (pack.locked) { sfxTap(); onLocked(); } else { sfxHappy(); onPlay(); } }}
          className={`sticker-btn mt-3 rounded-full py-2.5 font-display font-extrabold text-lg ${
            pack.locked ? "bg-white text-[var(--plum)]" : "text-white"
          }`}
          style={pack.locked ? undefined : { background: "linear-gradient(120deg,#00c2b9,#2f6fe4 130%)" }}
        >
          {pack.locked ? "🔒 Unlock" : "▶ Play"}
        </button>
      </div>
    </div>
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
  const recent = creatures.slice(-6).reverse();

  return (
    <div className="h-full paper-grain overflow-y-auto no-scrollbar">
      <div className="max-w-3xl mx-auto px-5 py-6 pb-10">
        {/* logo */}
        <div className="text-center anim-rise-in">
          <div className="inline-block sticker-card px-6 py-3 rotate-[-1.5deg]">
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight">
              {["M", "A", "G", "I", "C", "", "P", "E", "N"].map((ch, i) =>
                ch === "" ? (
                  <span key={i} className="inline-block w-2" />
                ) : (
                  <span
                    key={i}
                    className="anim-letter"
                    style={{
                      color: ["#e63b2e", "#ff7a1a", "#ffc72c", "#3aae3a", "#2f6fe4", "", "#8b46c7", "#fb66e5", "#00c2b9"][i],
                      animationDelay: `${i * 0.18}s`,
                    }}
                  >
                    {ch}
                  </span>
                )
              )}
            </h1>
          </div>
          <p className="font-display font-bold text-lg text-[var(--plum)] mt-2">draw it · it lives 🪄</p>
        </div>

        {/* big actions */}
        <div className="grid grid-cols-2 gap-3 mt-6 anim-rise-in" style={{ animationDelay: "0.08s" }}>
          <button
            onClick={() => { sfxHappy(); onDraw(); }}
            className="sticker-btn btn-sheen rounded-3xl py-6 font-display font-extrabold text-2xl text-white"
            style={{ background: "linear-gradient(130deg,#8b46c7,#fb66e5 120%)" }}
          >
            <div className="text-4xl mb-1 anim-wiggle inline-block">✏️</div>
            Draw!
          </button>
          <button
            onClick={() => { sfxHappy(); onPlayWorld("ocean"); }}
            className="sticker-btn btn-sheen rounded-3xl py-6 font-display font-extrabold text-2xl text-white"
            style={{ background: "linear-gradient(130deg,#0f8fd0,#00c2b9 120%)" }}
          >
            <div className="text-4xl mb-1 anim-bounce-soft">🌍</div>
            My World
            {creatures.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-[var(--coral)] text-white text-sm font-extrabold px-2.5 py-0.5 rounded-full border-[2.5px] border-[var(--ink)] rotate-6">
                {creatures.length}
              </span>
            )}
          </button>
        </div>

        {/* recent creatures */}
        {recent.length > 0 && (
          <div className="mt-7 anim-rise-in" style={{ animationDelay: "0.16s" }}>
            <h2 className="font-display font-extrabold text-xl text-[var(--plum)] mb-2">Your living doodles ✨</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {recent.map((c, i) => (
                <div
                  key={c.id}
                  className="sticker-card hover-lift shrink-0 w-28 p-2 text-center anim-spring-pop"
                  style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 2}deg)`, animationDelay: `${0.16 + i * 0.06}s` }}
                >
                  <div className="h-16 grid place-items-center anim-bob-tilt" style={{ animationDelay: `${i * 0.5}s` }}><Thumb c={c} /></div>
                  <div className="font-display font-bold text-sm text-[var(--ink)] truncate">{c.name}</div>
                  <div className="text-xs font-bold text-[var(--muted-foreground)]">{kindById(c.kindId).emoji} {kindById(c.kindId).label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* world packs */}
        <div className="mt-7 anim-rise-in" style={{ animationDelay: "0.24s" }}>
          <h2 className="font-display font-extrabold text-xl text-[var(--plum)] mb-2">Magic worlds 🌍</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {WORLD_PACKS.map((p, i) => (
              <div key={p.id} className="anim-spring-pop" style={{ animationDelay: `${0.24 + i * 0.07}s` }}>
                <PackCard
                  pack={p}
                  count={!p.locked ? creatures.length : 0}
                  onPlay={() => onPlayWorld(p.id)}
                  onLocked={() => setGrownUps(p)}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs font-bold text-[var(--muted-foreground)] mt-6">
          for grown-ups: drawings stay on this device · no ads · no accounts
        </p>
      </div>

      {/* grown-ups purchase modal (demo) */}
      {grownUps && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-5 z-50" onClick={() => setGrownUps(null)}>
          <div className="sticker-card max-w-sm w-full p-6 text-center anim-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">{grownUps.emoji}</div>
            <h3 className="font-display font-extrabold text-2xl text-[var(--ink)] mt-2">{grownUps.name}</h3>
            <p className="font-semibold text-[var(--muted-foreground)] mt-1">
              A whole new world where drawings {grownUps.id === "space" ? "blast off and orbit" : grownUps.id === "farm" ? "moo, oink and play" : "stomp and ROAR"}!
            </p>
            <div className="font-display font-extrabold text-3xl text-[var(--coral)] mt-3">{grownUps.price}</div>
            <div className="sticker-btn bg-[var(--sun)] rounded-2xl px-4 py-3 mt-4 font-bold text-[var(--ink)] text-sm">
              👨‍👩‍👧 Grown-ups only: hold to buy
            </div>
            <button
              onClick={() => { sfxTap(); setGrownUps(null); }}
              className="sticker-btn mt-3 w-full rounded-full py-3 bg-white font-display font-bold text-lg text-[var(--plum)]"
            >
              Maybe later
            </button>
            <p className="text-[11px] font-bold text-[var(--muted-foreground)] mt-3">demo build — checkout not wired up yet</p>
          </div>
        </div>
      )}
    </div>
  );
}
