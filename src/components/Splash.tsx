// ─── Splash: the title card ─────────────────────────────────────────────────
// The book opens, the mark writes itself in wax, a fish draws itself and comes
// alive. Ma Liang's story is told in three beats, skippable at any time.

import { useEffect, useRef, useState } from "react";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxMagic, sfxTap } from "@/lib/audio";
import { InkButton } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";
import { Wordmark } from "@/components/ink/Wordmark";
import { hand } from "@/lib/ink";

/**
 * A fish that draws itself in crayon, blinks into life, then swims — the whole
 * promise of the app in one loop, rendered by the app's real drawing engine.
 */
function AutoDrawing({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = 320, H = 220;
    cv.width = W * dpr;
    cv.height = H * dpr;

    // body + tail, as one continuous path a child would draw
    const body: { x: number; y: number }[] = [];
    for (let i = 0; i <= 58; i++) {
      const a = (i / 58) * Math.PI * 2;
      body.push({ x: 148 + Math.cos(a) * 78, y: 110 + Math.sin(a) * 47 });
    }
    const tail = [
      { x: 226, y: 110 }, { x: 288, y: 68 }, { x: 288, y: 152 }, { x: 226, y: 110 },
    ];
    const fin = [{ x: 130, y: 66 }, { x: 158, y: 40 }, { x: 176, y: 72 }];

    // draws itself once over 1.6s, then stays alive and swims. It must not
    // loop the draw-on — a fish that keeps erasing itself reads as a glitch.
    const DRAW_MS = 1600;
    const progressOf = (t: number) => Math.min(1, t / DRAW_MS);

    const paint = (t: number, alive: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const wob = alive * 3.4;
      const swim = Math.sin(t / 340) * wob;

      ctx.save();
      ctx.translate(0, swim);
      const bend = (pts: { x: number; y: number }[], k: number) =>
        pts.map((p, i) => ({
          x: p.x,
          y: p.y + Math.sin(i * 0.36 + t / 300) * wob * k,
        }));

      const p = progressOf(t);
      // body first, then the tail and fin once the body is mostly there
      drawCrayonStroke(ctx, bend(body, 1), "#f5a623", 8, 42, Math.min(1, p / 0.7));
      if (p > 0.62) {
        drawCrayonStroke(ctx, bend(tail, 1.8), "#f5a623", 8, 77, Math.min(1, (p - 0.62) / 0.22));
        drawCrayonStroke(ctx, fin, "#ffb84d", 7, 91, Math.min(1, (p - 0.78) / 0.22));
      }
      if (alive > 0) {
        ctx.fillStyle = "#2d2926";
        ctx.beginPath();
        ctx.arc(112, 100 + swim * 0.3, 5.2, 0, Math.PI * 2);
        ctx.fill();
        // a bubble or two, because it is alive now
        ctx.strokeStyle = "rgba(120,180,220,0.75)";
        ctx.lineWidth = 2;
        for (let b = 0; b < 3; b++) {
          const bt = ((t / 900) + b * 0.33) % 1;
          ctx.globalAlpha = 1 - bt;
          ctx.beginPath();
          ctx.arc(96 - bt * 30, 92 - bt * 54, 3 + b, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    if (still) { paint(DRAW_MS * 4, 1); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = now - t0;
      // once drawn, it eases into being alive rather than snapping
      const alive = Math.max(0, Math.min(1, (t - DRAW_MS) / 500));
      paint(t, alive);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="A crayon fish drawing itself and coming alive"
      className="block w-full h-auto"
      style={{ maxWidth: 320, aspectRatio: "320 / 220" }}
    />
  );
}

/* Doodles in the margin, the way a child fills the edges of a page. */
const MARGIN = [
  { icon: "star", x: "7%", y: "11%", s: 26, c: "#ffc72c", d: "0s" },
  { icon: "sparkle", x: "86%", y: "16%", s: 30, c: "#fb66e5", d: "0.9s" },
  { icon: "heart", x: "10%", y: "78%", s: 24, c: "#ff6b6b", d: "1.5s" },
  { icon: "sparkle", x: "88%", y: "72%", s: 22, c: "#00c2b9", d: "0.4s" },
] as const;

/* Story beats: 0 title · 1 first line · 2 second line · 3 call to action. */
const BEATS = [700, 1900, 3100];

export default function Splash({ onStart }: { onStart: () => void }) {
  const [told, setTold] = useState(0);
  const reduced = usePrefersReducedMotion();
  // reduced motion skips straight to the end of the story
  const beat = reduced ? 3 : told;

  useEffect(() => {
    if (reduced) return;
    const timers = BEATS.map((ms, i) => window.setTimeout(() => setTold(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const skip = () => { sfxTap(); setTold(3); };
  const start = () => { sfxMagic(); onStart(); };
  const r = hand(19);

  return (
    <div className="screen ink-paper overflow-hidden">
      {/* margin doodles */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        {MARGIN.map((m, i) => (
          <span
            key={i}
            className="absolute anim-float-y"
            style={{ left: m.x, top: m.y, animationDelay: m.d, transform: `rotate(${(r() - 0.5) * 40}deg)` }}
          >
            <Icon name={m.icon} size={m.s} color={m.c} fill={m.c} weight={2.2} />
          </span>
        ))}
      </div>

      {/* skip — always reachable, clear of the notch */}
      <div
        className="absolute right-0 top-0 z-20 pad-t"
        style={{ paddingRight: "max(var(--gutter), var(--safe-r))" }}
      >
        <InkButton
          seed={33}
          onClick={beat >= 3 ? start : skip}
          className="ink-title text-fs-sm !px-4"
        >
          {beat >= 3 ? "Let's go" : "Skip"}
          <Icon name="play" size={13} fill="var(--plum)" color="var(--plum)" />
        </InkButton>
      </div>

      <div className="h-full w-full overflow-hidden flex flex-col landshort:flex-row items-center justify-center gap-3 landshort:gap-6 pad-x pad-t pad-b">
        {/* ── the mark writes itself, then the fish draws itself ── */}
        <div className="flex flex-col items-center shrink-0 landshort:flex-1 landshort:max-w-[46%]">
          <h1 className="flex justify-center w-full">
            <Wordmark width={360} drawIn={reduced ? 0 : 2000} className="max-w-[92%]" />
          </h1>
          <p className="ink-hand text-fs-sm -mt-1 anim-pop-in" style={{ animationDelay: "1.9s" }}>
            draw it · it lives
          </p>

          <div
            className="mt-1 w-full flex justify-center anim-pop-in landshort:max-w-[240px]"
            style={{ animationDelay: "2.1s" }}
          >
            <AutoDrawing still={reduced} />
          </div>
        </div>

        {/* ── the story, then the way in ── */}
        <div className="flex flex-col items-center text-center max-w-md landshort:flex-1 landshort:max-w-[46%] w-full">
          <div className="min-h-[4.5em] landshort:min-h-[3.6em] flex flex-col justify-center gap-1">
            <p
              className={`ink-hand text-fs-md transition-all duration-500 ${
                beat >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              Long ago a boy named <b style={{ color: "var(--ink)" }}>Ma Liang</b> found a magic brush.
            </p>
            <p
              className={`ink-hand text-fs-md transition-all duration-500 ${
                beat >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              Everything he drew came <b style={{ color: "var(--coral)" }}>ALIVE</b>.
            </p>
          </div>

          <div
            className={`w-full mt-3 transition-all duration-500 ${
              beat >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
            }`}
          >
            <p className="ink-title text-fs-lg mb-2">Now the brush is yours.</p>
            <InkButton
              tone="#8b46c7"
              seed={64}
              radius={26}
              onClick={start}
              className="w-full max-w-sm mx-auto font-display font-extrabold text-fs-2xl !py-4"
              style={{ minHeight: "var(--tap-hero)" }}
            >
              <Icon name="sparkle" size={24} color="#ffe9a8" fill="#ffe9a8" />
              <span className="ink-on-wax">Start the magic</span>
              <Icon name="sparkle" size={24} color="#ffe9a8" fill="#ffe9a8" />
            </InkButton>
          </div>
        </div>
      </div>
    </div>
  );
}
