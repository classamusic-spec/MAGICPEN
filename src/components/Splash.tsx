import { useEffect, useRef, useState } from "react";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxMagic, sfxTap } from "@/lib/audio";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* MAGIC PEN wordmark — one crayon per letter, each with a baked-in tilt so it
   reads as hand-lettered rather than as a bouncing GIF. */
const WORDMARK = [
  { ch: "M", color: "var(--crayon-cherry)", tilt: "-5deg" },
  { ch: "A", color: "var(--crayon-orange)", tilt: "3deg" },
  { ch: "G", color: "var(--crayon-sun)", tilt: "-2deg" },
  { ch: "I", color: "var(--crayon-leaf)", tilt: "4deg" },
  { ch: "C", color: "var(--crayon-ocean)", tilt: "-3deg" },
  { ch: " ", color: "", tilt: "0deg" },
  { ch: "P", color: "var(--crayon-grape)", tilt: "3deg" },
  { ch: "E", color: "var(--crayon-candy)", tilt: "-4deg" },
  { ch: "N", color: "var(--crayon-lagoon)", tilt: "2deg" },
];

export function Wordmark({ animate = true }: { animate?: boolean }) {
  return (
    <span aria-hidden="true" className="font-display font-extrabold inline-block leading-none">
      {WORDMARK.map((l, i) =>
        l.ch === " " ? (
          <span key={i} className="inline-block w-[0.28em]" />
        ) : (
          <span
            key={i}
            className={animate ? "anim-letter-drop" : "inline-block"}
            style={
              {
                color: l.color,
                "--tilt": l.tilt,
                "--i": i,
                transform: animate ? undefined : `rotate(${l.tilt})`,
                WebkitTextStroke: "2px var(--ink)",
                paintOrder: "stroke fill",
              } as React.CSSProperties
            }
          >
            {l.ch}
          </span>
        )
      )}
    </span>
  );
}

/** A golden squiggle that draws itself, then sparkles into a fish. */
function AutoDrawing() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 320, H = 220;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // fish-ish path: body ellipse + tail triangle, parameterized 0..1
    const path: { x: number; y: number }[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      path.push({ x: 150 + Math.cos(a) * 80, y: 110 + Math.sin(a) * 48 });
    }
    path.push({ x: 242, y: 110 });
    path.push({ x: 292, y: 66 });
    path.push({ x: 292, y: 154 });
    path.push({ x: 242, y: 110 });

    const face = (wob: number, alpha: number) => {
      ctx.fillStyle = "#2d2926";
      ctx.beginPath();
      ctx.arc(115, 102 + wob * 0.4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.font = "26px serif";
      ctx.fillText("✨", 268, 60);
      ctx.fillText("✨", 40, 180);
      ctx.globalAlpha = 1;
    };

    // Reduced motion: paint the finished fish once, no loop.
    if (prefersReduced()) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawCrayonStroke(ctx, path, "#f5a623", 7, 42);
      face(0, 0.9);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = ((now - t0) % 4200) / 4200;
      const drawP = Math.min(1, t / 0.55);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const n = Math.max(2, Math.floor(path.length * drawP));
      const wob = drawP >= 1 ? Math.sin(now / 300) * 3 : 0;
      const pts = path
        .slice(0, n)
        .map((p, i) => ({ x: p.x, y: p.y + Math.sin(i * 0.4 + now / 280) * (drawP >= 1 ? wob : 0) }));
      drawCrayonStroke(ctx, pts, "#f5a623", 7, 42);
      if (drawP >= 1) face(wob, 0.4 + ((Math.sin(now / 200) + 1) / 2) * 0.6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="A crayon fish drawing itself and sparkling to life"
      className="block w-full h-auto"
      style={{ maxWidth: 320, aspectRatio: "320 / 220" }}
    />
  );
}

const DECOR = [
  { e: "🐠", x: "6%", y: "9%", d: "0s" },
  { e: "🚀", x: "82%", y: "13%", d: "0.8s" },
  { e: "🦋", x: "9%", y: "76%", d: "1.4s" },
  { e: "🌸", x: "85%", y: "70%", d: "0.4s" },
];

/* Story beats: 0 title · 1 first line · 2 second line · 3 call to action. */
const BEATS = [700, 1900, 3100];

export default function Splash({ onStart }: { onStart: () => void }) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (prefersReduced()) {
      setBeat(3);
      return;
    }
    const timers = BEATS.map((ms, i) => window.setTimeout(() => setBeat(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const skip = () => {
    sfxTap();
    setBeat(3);
  };
  const start = () => {
    sfxMagic();
    onStart();
  };

  return (
    <div className="screen paper-grain overflow-hidden">
      {/* ambient stickers */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        {DECOR.map((d) => (
          <span
            key={d.e}
            className="absolute text-3xl sm:text-4xl anim-float-y opacity-80"
            style={{ left: d.x, top: d.y, animationDelay: d.d }}
          >
            {d.e}
          </span>
        ))}
      </div>

      {/* skip — always reachable, clear of the notch */}
      <div
        className="absolute right-0 top-0 z-20 pad-t"
        style={{ paddingRight: "max(var(--gutter), var(--safe-r))" }}
      >
        <button
          onClick={beat >= 3 ? start : skip}
          className="sticker-btn btn-pill bg-white text-plum px-4 text-fs-sm"
          style={{ minHeight: "var(--tap)" }}
        >
          {beat >= 3 ? "Let's go ▸" : "Skip ▸"}
        </button>
      </div>

      <div className="h-full w-full overflow-hidden flex flex-col landshort:flex-row items-center justify-center gap-3 landshort:gap-6 pad-x pad-t pad-b">
        {/* ── title + auto-drawing ── */}
        <div className="flex flex-col items-center shrink-0 landshort:flex-1 landshort:max-w-[46%]">
          <h1 className="sticker-card px-5 py-3 sm:px-7 sm:py-4 -rotate-2 anim-spring-pop text-fs-4xl text-center">
            <span className="visually-hidden">Magic Pen</span>
            <Wordmark />
            <svg
              aria-hidden="true"
              viewBox="0 0 220 14"
              className="block w-full mt-1 h-3"
              preserveAspectRatio="none"
            >
              <path
                d="M4 9 C 45 2, 70 12, 110 6 S 180 2, 216 8"
                fill="none"
                stroke="var(--sun)"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          </h1>

          <p className="chip chip-sun mt-3 -rotate-1 anim-pop-in text-fs-xs" style={{ animationDelay: "180ms" }}>
            draw it · it lives 🪄
          </p>

          <div className="mt-2 w-full flex justify-center anim-pop-in landshort:max-w-[240px]" style={{ animationDelay: "260ms" }}>
            <AutoDrawing />
          </div>
        </div>

        {/* ── story + call to action ── */}
        <div className="flex flex-col items-center text-center max-w-md landshort:flex-1 landshort:max-w-[46%] w-full">
          <div className="min-h-[4.5em] landshort:min-h-[3.6em] flex flex-col justify-center gap-1">
            <p
              className={`type-body text-fs-md transition-all duration-500 ${
                beat >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              Long ago a boy named <b className="text-ink">Ma Liang</b> found a magic brush.
            </p>
            <p
              className={`type-body text-fs-md transition-all duration-500 ${
                beat >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              Everything he drew came <b className="text-coral">ALIVE</b>.
            </p>
          </div>

          <div
            className={`w-full mt-3 transition-all duration-500 ${
              beat >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
            }`}
          >
            <p className="type-h3 text-plum mb-2">Now the brush is yours.</p>
            <button
              onClick={start}
              className="sticker-btn btn-sheen btn-pill btn-hero grad-magic w-full max-w-sm anim-breathe"
            >
              ✨ Start the magic ✨
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
