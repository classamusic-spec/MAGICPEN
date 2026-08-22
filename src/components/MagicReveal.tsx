import { useEffect, useMemo, useRef, useState } from "react";
import type { Stroke, RecognitionResult } from "@/lib/types";
import { drawStrokeFull, strokesBounds } from "@/lib/crayon";
import { CREATURE_KINDS, kindById } from "@/lib/creatures";
import { sfxScan, sfxMagic, sfxTap, sfxHappy } from "@/lib/audio";

interface Props {
  strokes: Stroke[];
  result: RecognitionResult;
  name: string;
  photo?: string | null;   // paper-photo drawing (data URL) — skips the guess
  onShuffleName: (kindId: string) => string;
  onConfirm: (kindId: string, name: string) => void;
  onRedraw: () => void;
}

type Phase = "scan" | "guess" | "pick";

export default function MagicReveal({ strokes, result, name, photo, onShuffleName, onConfirm, onRedraw }: Props) {
  const isPhoto = Boolean(photo);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("scan");
  const [kindId, setKindId] = useState(result.kindId);
  const [creatureName, setCreatureName] = useState(name);
  const [scanX, setScanX] = useState(0);
  const kind = kindById(kindId);

  // scan sweep
  useEffect(() => {
    sfxScan();
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = (t - t0) / 2000;
      setScanX(Math.min(1, p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setPhase(isPhoto ? "pick" : "guess"); // photos skip straight to "what is it?"
        sfxHappy();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // live wiggling drawing (strokes) or wobbling photo drawing
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    let photoImg: HTMLImageElement | null = null;
    if (photo) {
      const im = new Image();
      im.onload = () => { photoImg = im; };
      im.src = photo;
    }
    const fitAndLoop = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      const b = strokesBounds(strokes);
      const pad = 40;
      const scale = Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.6);
      const cx = r.width / 2;
      const cy = r.height / 2;
      const ctx = cv.getContext("2d")!;
      const loop = (t: number) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, r.width, r.height);
        const excited = phase !== "scan";
        if (photo) {
          if (photoImg) {
            const fit = Math.min((r.width - 60) / photoImg.width, (r.height - 60) / photoImg.height, 1.4);
            const pw = photoImg.width * fit;
            const ph = photoImg.height * fit;
            const sq = 1 + Math.sin(t / (excited ? 90 : 320)) * (excited ? 0.07 : 0.02);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.sin(t / (excited ? 260 : 900)) * (excited ? 0.08 : 0.02));
            ctx.scale(sq, 1 / sq);
            ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
          }
          raf = requestAnimationFrame(loop);
          return;
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        strokes.forEach((s, i) =>
          drawStrokeFull(ctx, s, i + 1, {
            time: t / 1000,
            amp: excited ? 4 : 1.2,
            freq: 1.2,
            speed: excited ? 10 : 3,
            tailBias: 1,
          })
        );
        ctx.restore();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    fitAndLoop();
    const ro = new ResizeObserver(fitAndLoop);
    ro.observe(wrap);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [strokes, phase, photo]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        delay: `${(i % 7) * 0.22}s`,
        size: 14 + ((i * 13) % 20),
      })),
    []
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2 + (i % 5) * 0.3;
        const d = 120 + ((i * 47) % 160);
        return {
          dx: `${Math.cos(a) * d}px`,
          dy: `${Math.sin(a) * d - 60}px`,
          rot: `${(i % 2 ? 1 : -1) * (180 + (i * 53) % 360)}deg`,
          glyph: ["✨", "⭐", "🌟", "💛", "🟡", "🟣", "🔵"][i % 7],
          size: 12 + ((i * 17) % 16),
          delay: `${(i % 6) * 0.03}s`,
        };
      }),
    []
  );

  return (
    <div className="h-full flex flex-col paper-grain relative overflow-hidden">
      {/* sparkles overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {sparkles.map((s, i) => (
          <span
            key={i}
            className="anim-sparkle absolute"
            style={{ left: s.left, top: s.top, animationDelay: s.delay, fontSize: s.size }}
          >
            {i % 3 === 0 ? "✨" : i % 3 === 1 ? "⭐" : "🌟"}
          </span>
        ))}
      </div>

      <div className="pt-6 text-center relative z-10">
        <h2 className="font-display font-extrabold text-3xl text-[var(--plum)]">
          {phase === "scan" ? "The magic is reading your drawing…" : phase === "guess" ? "It came alive!" : isPhoto ? "What did you draw?" : "What is it really?"}
        </h2>
      </div>

      {/* drawing stage */}
      <div ref={wrapRef} className={`flex-1 relative mx-4 my-3 sticker-card overflow-hidden bg-[#fffdf7] ${phase !== "scan" ? "anim-halo" : ""}`}>
        <canvas ref={canvasRef} className="absolute inset-0" />
        {phase !== "scan" && (
          <div className="absolute inset-0 pointer-events-none grid place-items-center">
            {confetti.map((c, i) => (
              <span
                key={i}
                className="confetti-p"
                style={{ "--dx": c.dx, "--dy": c.dy, "--rot": c.rot, fontSize: c.size, animationDelay: c.delay } as React.CSSProperties}
              >
                {c.glyph}
              </span>
            ))}
          </div>
        )}
        {phase === "scan" && (
          <div
            className="absolute inset-y-0 w-24 pointer-events-none"
            style={{
              left: `calc(${scanX * 100}% - 48px)`,
              background: "linear-gradient(90deg, transparent, rgba(255,199,44,0.55), rgba(251,102,229,0.35), transparent)",
              filter: "blur(2px)",
            }}
          />
        )}
      </div>

      {/* guess card */}
      {phase === "guess" && (
        <div className="relative z-10 px-4 pb-6 anim-spring-pop">
          <div className="sticker-card p-5 text-center max-w-md mx-auto">
            <div className="text-6xl anim-bounce-soft inline-block drop-shadow-lg">{kind.emoji}</div>
            <div className="font-display font-extrabold text-3xl mt-1 text-[var(--ink)]">
              It's a {kind.label.toUpperCase()}!
            </div>
            <button
              onClick={() => { setCreatureName(onShuffleName(kindId)); sfxTap(); }}
              className="mt-2 inline-flex items-center gap-2 sticker-btn bg-[var(--teal)] text-white rounded-full px-4 py-1.5 font-bold"
            >
              🎲 {creatureName} the {kind.label}
            </button>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setPhase("pick")}
                className="sticker-btn flex-1 rounded-full py-3 bg-white font-display font-bold text-lg text-[var(--plum)]"
              >
                🤔 Nope!
              </button>
              <button
                onClick={() => { sfxMagic(); onConfirm(kindId, creatureName); }}
                className="sticker-btn btn-sheen flex-[2] rounded-full py-3 font-display font-extrabold text-xl text-white"
                style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 120%)" }}
              >
                YES! Set it free! 🌊
              </button>
            </div>
            <button onClick={onRedraw} className="mt-3 text-sm font-bold text-[var(--muted-foreground)] underline">
              ← draw again instead
            </button>
          </div>
        </div>
      )}

      {/* correction picker */}
      {phase === "pick" && (
        <div className="relative z-10 px-4 pb-6 anim-pop-in">
          <div className="sticker-card p-4 max-w-lg mx-auto">
            <div className="grid grid-cols-5 gap-2">
              {CREATURE_KINDS.filter((k) => k.id !== "mystery").map((k) => (
                <button
                  key={k.id}
                  onClick={() => { setKindId(k.id); setCreatureName(onShuffleName(k.id)); setPhase("guess"); sfxTap(); }}
                  className={`sticker-btn rounded-2xl py-2 grid place-items-center bg-white ${
                    k.id === kindId ? "!bg-[var(--sun)]" : ""
                  }`}
                >
                  <span className="text-2xl">{k.emoji}</span>
                  <span className="text-[10px] font-extrabold text-[var(--ink)]">{k.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
