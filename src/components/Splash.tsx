// ─── Splash: the title card ─────────────────────────────────────────────────
// The mark writes itself in wax, then a whole little sea draws itself on the
// page — waves, coral, seaweed, two fish — and once it is drawn, it comes to
// life: the fish swim, the weed sways, the water washes in and bubbles rise.
// One loop, no words needed: draw it, and it lives.

import { useEffect, useRef, useState } from "react";
import type { Pt } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxMagic, sfxTap } from "@/lib/audio";
import { InkButton } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";
import { Wordmark } from "@/components/ink/Wordmark";
import { hand } from "@/lib/ink";

/* ── the scene, drawn in one virtual box then scaled to fit ────────────────── */

const VW = 400;
const VH = 300;
const FLOOR = 262;

/** A colour that darkens/lightens a hex by `amt` (−1..1). Small, local copy. */
function tint(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)))
  );
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A wavy horizontal line across the frame — the surface of the water. */
function wave(y: number, amp: number, phase: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = 14 + (i / 40) * (VW - 28);
    pts.push({ x, y: y + Math.sin(i * 0.5 + phase) * amp });
  }
  return pts;
}

/** A closed fish body as a squashed ellipse, drawn as one continuous line. */
function body(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 54; i++) {
    const a = (i / 54) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** A strand of seaweed rising from the floor, wavy along its length. */
function weed(x: number, top: number, wobble: number): Pt[] {
  const pts: Pt[] = [];
  const h = FLOOR - top;
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    pts.push({ x: x + Math.sin(f * 4 + wobble) * 9 * (1 - f * 0.3), y: FLOOR - f * h });
  }
  return pts;
}

/** Bend a set of points along their own length — the wiggle that says "alive". */
function bend(pts: Pt[], t: number, amp: number, k = 0.36): Pt[] {
  return pts.map((p, i) => ({ x: p.x, y: p.y + Math.sin(i * k + t / 300) * amp }));
}

/** Sway points around a base point (used for weed and coral). */
function sway(pts: Pt[], baseY: number, t: number, amp: number, phase: number): Pt[] {
  return pts.map((p) => {
    const f = Math.max(0, (baseY - p.y) / baseY); // 0 at floor, →1 up top
    return { x: p.x + Math.sin(t / 620 + phase) * amp * f * f, y: p.y };
  });
}

/** Fraction 0..1 of an element's draw-on, from the scene clock. */
const prog = (el: number, start: number, dur: number) => Math.max(0, Math.min(1, (el - start) / dur));

/** Everything is drawn by ~this time; after it, the scene eases into life. */
const DRAWN_MS = 3300;

/**
 * The living sea. Draws itself once, then animates forever. `still` paints the
 * final live frame with no motion, for reduced-motion and for a paused tab.
 * `rush` (a changing token) fast-forwards the draw-on to done.
 */
function LivingSea({ still, rush, onDrawn }: { still: boolean; rush: number; onDrawn: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t0Ref = useRef(0);
  const drawnRef = useRef(false);
  // keep the callback out of the effect deps: a fresh `onDrawn` each render
  // would otherwise restart the whole draw-on every time the parent re-renders
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
    const size = () => {
      dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 320;
      const h = cv.clientHeight || 240;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    size();

    const paint = (el: number, life: number, t: number) => {
      const cw = cv.width / dpr;
      const ch = cv.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // fit the 400×300 scene inside the canvas, centred
      const s = Math.min(cw / VW, ch / VH);
      const ox = (cw - VW * s) / 2;
      const oy = (ch - VH * s) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(s, s);

      // a rounded window; the water washes in as the scene comes alive
      ctx.beginPath();
      ctx.roundRect(6, 6, VW - 12, VH - 12, 26);
      ctx.clip();
      if (life > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, VH);
        g.addColorStop(0, "rgba(101,149,249,0.20)");
        g.addColorStop(1, "rgba(0,194,185,0.16)");
        ctx.globalAlpha = life;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VW, VH);
        ctx.globalAlpha = 1;
      }

      // ── waves ──
      [[34, 5, 0], [50, 4, 1.1], [64, 3.4, 2.2]].forEach(([y, a, ph], i) => {
        const p = prog(el, i * 260, 560);
        if (p <= 0) return;
        drawCrayonStroke(ctx, wave(y as number, a as number, (ph as number) + t / 900), "#6595f9", 4.4, 5 + i, p);
      });

      // ── sea floor ──
      const fp = prog(el, 600, 500);
      if (fp > 0) drawCrayonStroke(ctx, wave(FLOOR, 3, 0.4), tint("#ffc72c", -0.25), 6, 21, fp);

      // ── coral (two clusters) ──
      const coral = (bx: number, start: number, color: string, seed: number, ph: number) => {
        const stalks: [number, number][] = [[0, 44], [-16, 34], [15, 30]];
        stalks.forEach(([dx, hgt], j) => {
          const p = prog(el, start + j * 120, 420);
          if (p <= 0) return;
          const line = sway([{ x: bx + dx, y: FLOOR }, { x: bx + dx * 1.4, y: FLOOR - hgt }], FLOOR, t, 3.2, ph + j);
          drawCrayonStroke(ctx, line, color, 8, seed + j, p);
        });
      };
      coral(70, 900, "#ff6b6b", 30, 0);
      coral(322, 1150, "#fb66e5", 44, 1.6);

      // ── seaweed ──
      [[120, 150, 1000, 0.0], [300, 168, 1250, 1.4]].forEach(([x, top, start, ph]) => {
        const p = prog(el, start as number, 780);
        if (p <= 0) return;
        drawCrayonStroke(ctx, sway(weed(x as number, top as number, 0.5), FLOOR, t, 10, ph as number), "#84cc16", 6, 60 + (x as number), p);
      });

      // ── hero fish (faces left, swims side to side) ──
      const hp = prog(el, 1700, 800);
      if (hp > 0) {
        const dx = Math.sin(t / 1500) * 26 * life;
        ctx.save();
        ctx.translate(dx, Math.sin(t / 700) * 3 * life);
        drawCrayonStroke(ctx, bend(body(210, 150, 62, 38), t, life * 3, 0.22), "#f5a623", 8, 42, hp);
        const tp = prog(el, 2350, 400);
        if (tp > 0) {
          const tail = [{ x: 268, y: 150 }, { x: 316, y: 118 + Math.sin(t / 180) * 9 * life }, { x: 316, y: 182 + Math.sin(t / 180) * 9 * life }, { x: 268, y: 150 }];
          drawCrayonStroke(ctx, tail, "#f5a623", 8, 77, tp);
        }
        const finp = prog(el, 2500, 300);
        if (finp > 0) drawCrayonStroke(ctx, [{ x: 196, y: 116 }, { x: 224, y: 92 }, { x: 240, y: 122 }], "#ffb84d", 7, 91, finp);
        if (el > 2820) {
          ctx.fillStyle = "#2d2926";
          ctx.beginPath();
          ctx.arc(168, 143, 5.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── little fish (faces right, swims the other way) ──
      const sp = prog(el, 2650, 500);
      if (sp > 0) {
        const dx = -Math.sin(t / 1200 + 1) * 30 * life;
        ctx.save();
        ctx.translate(dx, Math.sin(t / 600 + 2) * 4 * life);
        drawCrayonStroke(ctx, bend(body(300, 104, 30, 20), t, life * 2.4, 0.3), "#00c2b9", 6.5, 51, sp);
        const tp = prog(el, 3050, 300);
        if (tp > 0) {
          const tw = Math.sin(t / 150 + 1) * 6 * life;
          drawCrayonStroke(ctx, [{ x: 272, y: 104 }, { x: 248, y: 90 - tw }, { x: 248, y: 118 - tw }, { x: 272, y: 104 }], "#00c2b9", 6.5, 52, tp);
        }
        if (el > 3300) {
          ctx.fillStyle = "#2d2926";
          ctx.beginPath();
          ctx.arc(316, 100, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── bubbles, only once it is alive ──
      if (life > 0.2) {
        ctx.strokeStyle = "rgba(120,180,220,0.7)";
        ctx.lineWidth = 2;
        const springs = [[150, 150], [86, FLOOR - 40], [330, FLOOR - 30]];
        springs.forEach(([bx, by], si) => {
          for (let b = 0; b < 3; b++) {
            const bt = ((t / (1400 + si * 300)) + b * 0.34) % 1;
            ctx.globalAlpha = (1 - bt) * life;
            ctx.beginPath();
            ctx.arc((bx as number) + Math.sin(bt * 6 + si) * 5, (by as number) - bt * ((by as number) - 40), 2.4 + b, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };

    const fireDrawn = () => { if (!drawnRef.current) { drawnRef.current = true; onDrawnRef.current(); } };

    if (still) {
      paint(DRAWN_MS + 2000, 1, DRAWN_MS + 2000);
      fireDrawn();
      const ro = new ResizeObserver(() => { size(); paint(DRAWN_MS + 2000, 1, DRAWN_MS + 2000); });
      ro.observe(cv);
      return () => ro.disconnect();
    }

    let raf = 0;
    t0Ref.current = performance.now();
    const loop = (now: number) => {
      const el = now - t0Ref.current;
      if (el >= DRAWN_MS) fireDrawn();
      const life = Math.max(0, Math.min(1, (el - DRAWN_MS) / 600));
      paint(el, life, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(size);
    ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [still]);

  // a tap during the draw-on rushes it to the end
  useEffect(() => {
    if (rush > 0 && !still) t0Ref.current -= DRAWN_MS + 800;
  }, [rush, still]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="A crayon sea drawing itself — waves, coral and fish — and coming alive"
      className="block w-full h-full"
    />
  );
}

/* Doodles in the margin, the way a child fills the edges of a page. */
const MARGIN = [
  { icon: "star", x: "7%", y: "10%", s: 24, c: "#ffc72c", d: "0s" },
  { icon: "sparkle", x: "87%", y: "13%", s: 28, c: "#fb66e5", d: "0.9s" },
  { icon: "heart", x: "9%", y: "82%", s: 22, c: "#ff6b6b", d: "1.5s" },
  { icon: "sparkle", x: "89%", y: "80%", s: 20, c: "#00c2b9", d: "0.4s" },
] as const;

export default function Splash({ onStart }: { onStart: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(reduced);
  const [rush, setRush] = useState(0);
  const r = hand(19);

  const start = () => { sfxMagic(); onStart(); };
  const rushIn = () => { if (!ready) { sfxTap(); setRush((n) => n + 1); } };

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

      {/* skip the draw-on — reachable until the scene is alive */}
      {!ready && (
        <div
          className="absolute right-0 top-0 z-20 pad-t"
          style={{ paddingRight: "max(var(--gutter), var(--safe-r))" }}
        >
          <InkButton seed={33} onClick={rushIn} className="ink-title text-fs-sm !px-4">
            Skip
            <Icon name="play" size={13} fill="var(--plum)" color="var(--plum)" />
          </InkButton>
        </div>
      )}

      <div className="h-full w-full flex flex-col landshort:flex-row items-center justify-center gap-2 landshort:gap-6 pad-x pad-t pad-b">
        {/* ── the mark writes itself ── */}
        <div className="flex flex-col items-center shrink-0 landshort:flex-1 landshort:max-w-[42%]">
          <h1 className="flex justify-center w-full">
            <Wordmark width={360} drawIn={reduced ? 0 : 1800} className="max-w-[90%]" />
          </h1>
          <p className="ink-hand text-fs-sm -mt-1 anim-pop-in" style={{ animationDelay: reduced ? "0s" : "1.7s" }}>
            draw it · it lives
          </p>
        </div>

        {/* ── the sea draws itself, then swims ── */}
        <div className="flex flex-col items-center w-full max-w-md landshort:flex-1 landshort:max-w-[52%]">
          <button
            type="button"
            onClick={rushIn}
            aria-hidden="true"
            tabIndex={-1}
            className="w-full anim-pop-in"
            style={{ animationDelay: reduced ? "0s" : "1.9s", cursor: ready ? "default" : "pointer" }}
          >
            <div className="w-full aspect-[4/3] max-h-[46vh] landshort:max-h-[64vh]">
              <LivingSea still={reduced} rush={rush} onDrawn={() => setReady(true)} />
            </div>
          </button>

          {/* ── the way in, once the sea is alive ── */}
          <div
            className={`w-full mt-3 transition-all duration-500 ${
              ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
            }`}
          >
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
