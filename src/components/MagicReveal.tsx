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

/* mystery last: "something else" is a real answer, not a failure */
const PICKABLE = [
  ...CREATURE_KINDS.filter((k) => k.id !== "mystery"),
  ...CREATURE_KINDS.filter((k) => k.id === "mystery"),
];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      Array.from({ length: 12 }, (_, i) => ({
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

  const heading =
    phase === "scan" ? "Looking at your drawing…" : phase === "guess" ? "It's alive!" : "What did you draw?";

  return (
    <div className="screen paper-grain relative overflow-hidden">
      {/* ambient sparkles */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
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

      <div className="reveal-grid pad-x pad-t pad-b relative z-10">
        {/* ── heading + scan progress ── */}
        <div className="reveal-head text-center">
          <h1 className="type-title text-plum" aria-live="polite">{heading}</h1>
          {phase === "scan" && (
            <div
              className="mx-auto mt-2 h-3 w-40 max-w-[70%] rounded-full overflow-hidden border-[2.5px] border-ink bg-white"
              role="progressbar"
              aria-label="Reading your drawing"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scanX * 100)}
            >
              <div className="h-full grad-magic transition-[width] duration-100" style={{ width: `${scanX * 100}%` }} />
            </div>
          )}
        </div>

        {/* ── the drawing, wiggling to life ── */}
        <div
          ref={wrapRef}
          className={`reveal-stage relative my-2 sticker-card bg-paper-card overflow-hidden ${phase !== "scan" ? "anim-halo" : ""}`}
        >
          <canvas ref={canvasRef} className="absolute inset-0" />

          {phase !== "scan" && (
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none grid place-items-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="burst-ring"
                  style={{ width: 120, height: 120, animationDelay: `${i * 140}ms` }}
                />
              ))}
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
              aria-hidden="true"
              className="absolute inset-y-0 w-24 pointer-events-none"
              style={{
                left: `calc(${scanX * 100}% - 48px)`,
                background: "linear-gradient(90deg, transparent, rgba(255,199,44,0.55), rgba(251,102,229,0.35), transparent)",
                filter: "blur(2px)",
              }}
            />
          )}
        </div>

        {/* ── decision panel ── */}
        <div className="reveal-panel">
          {phase === "guess" && (
            <div className="sticker-card p-4 text-center max-w-md mx-auto anim-spring-pop">
              <div className="relative grid place-items-center">
                <span
                  aria-hidden="true"
                  className="absolute w-24 h-24 rounded-full anim-spin-slow"
                  style={{
                    background:
                      "conic-gradient(from 0deg, rgba(255,199,44,0.45), rgba(255,199,44,0) 25%, rgba(251,102,229,0.4) 50%, rgba(255,199,44,0) 75%, rgba(255,199,44,0.45))",
                  }}
                />
                <span aria-hidden="true" className="text-6xl anim-bounce-soft relative drop-shadow-lg">{kind.emoji}</span>
              </div>

              <h2 className="type-title mt-1">It's a {kind.label.toUpperCase()}!</h2>

              <button
                onClick={() => { setCreatureName(onShuffleName(kindId)); sfxTap(); }}
                aria-label={`Name: ${creatureName}. Tap for a different name.`}
                className="sticker-btn btn-pill bg-lagoon text-white mt-2 text-fs-md px-4"
              >
                <span aria-hidden="true">🎲</span> {creatureName} the {kind.label}
              </button>

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                  onClick={() => { sfxTap(); setPhase("pick"); }}
                  className="sticker-btn btn-pill bg-white text-plum sm:flex-1"
                >
                  🤔 Not quite
                </button>
                <button
                  onClick={() => { sfxMagic(); onConfirm(kindId, creatureName); }}
                  className="sticker-btn btn-sheen btn-pill grad-go text-white sm:flex-[2] text-fs-xl anim-breathe"
                >
                  Yes! Set it free 🌊
                </button>
              </div>

              <button
                onClick={onRedraw}
                className="type-label underline mt-3 px-3 py-2 min-h-tap w-full"
              >
                ← Draw it again instead
              </button>
            </div>
          )}

          {phase === "pick" && (
            <div className="sticker-card p-3 max-w-lg mx-auto anim-pop-in">
              <div className="flex items-center gap-2 mb-2">
                {!isPhoto && (
                  <button
                    onClick={() => { sfxTap(); setPhase("guess"); }}
                    className="sticker-btn btn-icon bg-white text-ink font-black shrink-0"
                    aria-label="Back to the guess"
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                )}
                <h2 className="type-h3 flex-1 text-center">Tap what it is</h2>
                {!isPhoto && <span className="w-tap shrink-0" aria-hidden="true" />}
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[44dvh] overflow-y-auto no-scrollbar p-1">
                {PICKABLE.map((k) => {
                  const active = k.id === kindId;
                  return (
                    <button
                      key={k.id}
                      onClick={() => { setKindId(k.id); setCreatureName(onShuffleName(k.id)); setPhase("guess"); sfxTap(); }}
                      aria-label={k.id === "mystery" ? "Something else — a mystery creature" : k.label}
                      className={`sticker-btn grid place-items-center gap-0.5 py-2 px-1 min-h-[4.5rem] ${
                        active ? "bg-sunny text-ink" : "bg-white"
                      }`}
                      style={{ borderRadius: "var(--r-md)" }}
                    >
                      <span aria-hidden="true" className="text-3xl leading-none">{k.emoji}</span>
                      <span className="type-fine text-ink text-center leading-tight">
                        {k.id === "mystery" ? "Something else" : k.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={onRedraw}
                className="type-label underline mt-2 px-3 py-2 min-h-tap w-full"
              >
                ← Draw it again instead
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
