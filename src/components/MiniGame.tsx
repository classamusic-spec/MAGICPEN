// ─── Mini-games shell: pick a game + your hero creature, then play ──────────
// Game mechanics live in @/lib/games; this file owns the screens around them:
// the game-select page, the 3·2·1·GO count-in, the in-round HUD (score, hearts,
// combo, clock), pause/resume, and the results moment.
//
// Everything here is drawn rather than styled: surfaces are paper with a
// hand-inked edge, fills are real crayon wax baked by the app's own engine, and
// every icon is a drawn path. Nothing is an emoji and nothing is a rounded rect
// with a uniform border.

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById, WORLD_PACKS } from "@/lib/creatures";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { bakeCrayonSprite } from "@/lib/sprites";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { loadBest, saveBest } from "@/lib/storage";
import { sfxPop, sfxSplash, sfxHappy, sfxMagic, sfxTap } from "@/lib/audio";
import { WORLD_GAMES, createGame, type Frame, type GameAPI, type GameInstance, type Input } from "@/lib/games";
import { Juice } from "@/lib/games/juice";
import { Thumb } from "./Home";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "./ink/Ink";
import { Icon } from "./ink/Icons";
import { hand, roughEllipse, roughRect, seedOf, wax, waxTile } from "@/lib/ink";

const ROUND_S = 60;
const COUNT_IN = 3.2;   // seconds of "3 · 2 · 1 · GO!"
const RESUME_IN = 1.4;  // shorter count-in when un-pausing

const INK = "#2d2926";
const CREAM = "#fffdf7";

type Stage = "choose" | "play" | "over";

/* ── per-game identity ─────────────────────────────────────────────────────
   A solid crayon colour (wax needs pigment, not a gradient) plus a drawn
   emblem, so each game is recognisable before a word is read. */

const GAME_TONE: Record<string, string> = {
  bubbleGulp: "#0e7fd6",
  coralGlide: "#fb66e5",
  crabTap: "#e63b2e",
  starRush: "#8b46c7",
  astroLanes: "#2f6fe4",
  orbitHop: "#7c3aed",
  eggCatch: "#ffc72c",
  moleMash: "#3aae3a",
  pumpkinPunt: "#ff7a1a",
  lavaLeap: "#e63b2e",
  meteorDodge: "#00c2b9",
  cliffHopper: "#3aae3a",
};
const TONE_FALLBACK = ["#00c2b9", "#ffc72c", "#8b46c7"];
const toneFor = (id: string, i: number) => GAME_TONE[id] ?? TONE_FALLBACK[i % TONE_FALLBACK.length];

/** Drawn emblems on the icon grid — one per game, hand-wobbled like the rest. */
const EMBLEMS: Record<string, string> = {
  bubbleGulp:
    "M9.6 16a5.4 5.4 0 1 0 .2-10.8A5.4 5.4 0 0 0 9.6 16zM17.8 20.4a2.9 2.9 0 1 0 .1-5.8 2.9 2.9 0 0 0-.1 5.8zM18.4 8.8a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8M7.4 8.6c.4-1 1.3-1.7 2.4-1.9",
  coralGlide:
    "M4.4 20.4V11.2a7.6 7.6 0 0 1 15.2.2v9M8.7 20.4v-9a3.4 3.4 0 0 1 6.7.2v8.8M12 15.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6",
  crabTap:
    "M5.2 14.4a6.8 4.9 0 1 0 13.6.2 6.8 4.9 0 0 0-13.6-.2zM9.1 9.9 7.2 6.3M14.9 9.8l2-3.6M4.9 12.9 2.4 15.6M19.1 12.8l2.6 2.6M9.5 14.1h.1M14.6 14.1h.1",
  starRush:
    "M14 4.1l2.3 4.7 5.1.8-3.8 3.6 1 5.1-4.6-2.5-4.5 2.4.9-5.1L6.6 9.5l5.2-.8zM5.6 6.2H2.3M4.7 11.5H1.5M6.2 16.6H3.1",
  astroLanes:
    "M5.2 3.7v16.9M18.8 3.6v17M12 17.9c1.9-1.3 2.8-3.1 2.8-5.1 0-2.5-1.2-4.5-2.8-5.8-1.6 1.3-2.8 3.3-2.8 5.8 0 2 .9 3.8 2.8 5.1zM9.6 15.4l-1.8 2.9M14.4 15.3l1.9 3",
  orbitHop:
    "M12 16.6a4.4 4.4 0 1 0 .1-8.8 4.4 4.4 0 0 0-.1 8.8zM3.4 12.2c4.4 3.4 12.9 3.5 17.3.2M20.7 12.4C16.3 9 7.8 8.9 3.4 12.2M6.4 5.9c2.2-2.6 5.4-2.8 8-.7",
  eggCatch:
    "M12 3.9c2.7 2.5 4.3 5.2 4.3 7.4a4.3 4.3 0 0 1-8.6 0c0-2.2 1.6-4.9 4.3-7.4zM4.3 14.9h15.4l-2 5.8H6.3zM4.3 14.9h15.4",
  moleMash:
    "M3.2 17.4c0 1.9 3.9 3.5 8.8 3.5s8.8-1.6 8.8-3.5-4-3.5-8.8-3.5-8.8 1.6-8.8 3.5zM8.1 16.6c0-2.7 1.7-4.8 3.9-4.8s3.9 2.1 3.9 4.8M9.6 8.4c-.8-1.6-.2-2.9 1-3.2M14.5 8.3c.8-1.6.3-2.9-.9-3.2M10.6 14.6h.1M13.4 14.6h.1",
  pumpkinPunt:
    "M12 8c3.7 0 6.5 2.9 6.5 6.5S15.7 21 12 21s-6.5-2.9-6.5-6.5S8.3 8 12 8zM12 8.2V21M8.4 9.2c-1 1.7-1.5 3.5-1.5 5.4s.5 3.7 1.5 5.3M15.6 9.1c1 1.7 1.5 3.5 1.5 5.4s-.5 3.7-1.5 5.3M12 8V4.7M12 4.7c1.6-1.5 3.4-1.4 4.3.1",
  lavaLeap:
    "M2.4 20.6 8.9 8.4h6.2l6.5 12.2zM9.5 8.4c.9-1.7 4.1-1.8 5 0M12 5.6V2.4M7.7 6 6 3.5M16.3 5.9 18 3.4",
  meteorDodge:
    "M15.6 15.6a4.7 4.7 0 1 0 .1-9.4 4.7 4.7 0 0 0-.1 9.4zM9.2 14.3 3 20.6M9.7 8.2 5.2 5.9M9.4 18.4l-4.3 1.4M14.4 9.4h.1M17.6 12.4h.1",
  cliffHopper:
    "M2.5 20.6v-7.2h5.4V9.7h5.5V6.1h5.6v14.5M4.7 11.4c1.6-3.1 4.5-3.1 6.1 0M10.2 7.8c1.6-3.1 4.5-3.1 6.1 0",
};

/** Emblem for a game — falls back to the gamepad glyph for anything unknown. */
function Emblem({ id, size, color }: { id: string; size: number; color: string }) {
  const d = EMBLEMS[id];
  if (!d) return <Icon name="gamepad" size={size} color={color} weight={2.2} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── colour helpers ──────────────────────────────────────────────────────── */

/** Which ink reads on a given wax fill — cream on deep pigment, ink on pale. */
function onWax(hex: string): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? INK : CREAM;
}

const reduced = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ── drawn primitives (local, cached — the HUD redraws 8×/second) ─────────── */

const pathCache = new Map<string, string>();
function drawn(shape: "rect" | "ellipse", w: number, h: number, seed: number, radius?: number): string {
  const k = `${shape}|${w}|${h}|${seed}|${radius ?? ""}`;
  let d = pathCache.get(k);
  if (!d) {
    d = shape === "ellipse" ? roughEllipse(w, h, { seed, radius }) : roughRect(w, h, { seed, radius });
    pathCache.set(k, d);
  }
  return d;
}

/**
 * A fixed-size drawn surface. Unlike the kit's `InkCard` it never measures, so
 * the path is cached and the HUD can re-render without rebuilding geometry.
 * `shadow` is deliberately dark and tight: over a near-black space backdrop the
 * cream paper carries the contrast, over a bright farm sky the shadow does.
 */
const DrawnBox = memo(function DrawnBox({
  w, h, seed = 7, shape = "rect", tone, radius, weight = 3.3, ink = INK,
  shadow = true, className = "", style, children,
}: {
  w: number; h: number; seed?: number; shape?: "rect" | "ellipse"; tone?: string;
  radius?: number; weight?: number; ink?: string; shadow?: boolean;
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const d = drawn(shape, w, h, seed, radius);
  const d2 = drawn(shape, w, h, seed + 91, radius);
  const waxUrl = tone ? waxTile(tone) : "";
  return (
    <div className={`relative isolate shrink-0 ${className}`} style={{ width: w, height: h, ...style }}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {waxUrl && (
            <pattern id={`wx${uid}`} patternUnits="userSpaceOnUse" width={128} height={128}>
              <image href={waxUrl} width={128} height={128} />
            </pattern>
          )}
          {shadow && (
            <filter id={`sh${uid}`} x="-35%" y="-35%" width="170%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3.2" floodColor="#150f0a" floodOpacity="0.5" />
            </filter>
          )}
        </defs>
        <path d={d} fill={waxUrl ? `url(#wx${uid})` : CREAM} filter={shadow ? `url(#sh${uid})` : undefined} />
        <path d={d} fill="none" stroke={ink} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={d2} fill="none" stroke={ink} strokeWidth={weight * 0.58}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.62} transform="translate(0.8 1)"
        />
      </svg>
      <div className="relative z-10 h-full w-full flex items-center justify-center gap-1.5 px-2">{children}</div>
    </div>
  );
});

/** Live media-query state — landscape phones get a compacted select screen. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return on;
}
const SHORT_LANDSCAPE = "(orientation: landscape) and (max-height: 560px)";

/** Measure a fluid element so a drawn edge can be laid over its real box. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      // offsetWidth/Height are the untransformed layout box: a card mid-entry
      // (scaled) would otherwise be inked at the wrong size
      const w = Math.round(el.offsetWidth / 2) * 2;
      const h = Math.round(el.offsetHeight / 2) * 2;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** The crayon circle a child draws around the thing they picked. */
function ChosenRing({ w, h, seed, color = "#ffc72c", pad = 7 }: { w: number; h: number; seed: number; color?: string; pad?: number }) {
  if (w < 8 || h < 8) return null;
  const rw = w + pad * 2;
  const rh = h + pad * 2;
  const d = drawn("rect", rw, rh, seed + 401, Math.min(rw, rh) * 0.3);
  return (
    <svg
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{ left: -pad, top: -pad, overflow: "visible" }}
      width={rw}
      height={rh}
      viewBox={`0 0 ${rw} ${rh}`}
    >
      <path d={d} fill="none" stroke={INK} strokeWidth={7.5} strokeLinecap="round" opacity={0.34} />
      <path d={d} fill="none" stroke={color} strokeWidth={4.4} strokeLinecap="round" />
    </svg>
  );
}

/** A drawn star/heart filled with real wax at native texture scale. */
function WaxGlyph({
  name, size, tone, ink = INK, weight = 2.1,
}: { name: "star" | "heart"; size: number; tone: string; ink?: string; weight?: number }) {
  const uid = useId().replace(/:/g, "");
  const url = waxTile(tone);
  // pattern lives in the icon's user space (viewBox 24), so scale it back up
  const p = (128 * 24) / size;
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={0} height={0} aria-hidden="true" className="absolute">
        <defs>
          <pattern id={`g${uid}`} patternUnits="userSpaceOnUse" width={p} height={p}>
            <image href={url} width={p} height={p} />
          </pattern>
        </defs>
      </svg>
      <Icon name={name} size={size} color={ink} fill={`url(#g${uid})`} weight={weight} />
    </span>
  );
}

/* ── the shell's own motion + focus rules ──────────────────────────────────
   Scoped to this screen (prefix `mg-`) so the mini-game shell owns its look
   without reaching into a stylesheet another screen shares. */

const SHELL_CSS = `
.mg-focus:focus-visible{outline:3px solid var(--focus);outline-offset:3px;box-shadow:0 0 0 6px rgba(255,199,44,.55);border-radius:8px}
.mg-focus-light:focus-visible{outline:3px solid #fffdf7;outline-offset:3px;box-shadow:0 0 0 6px rgba(255,199,44,.8);border-radius:8px}
.mg-scroll{-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(86,62,121,.35) transparent}
.mg-scroll::-webkit-scrollbar{width:8px;height:8px}
.mg-scroll::-webkit-scrollbar-thumb{background:rgba(86,62,121,.3);border-radius:99px}
.mg-scroll::-webkit-scrollbar-track{background:transparent}
.mg-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mg-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.mg-tap{min-width:var(--tap);min-height:var(--tap)}
.mg-press{-webkit-tap-highlight-color:transparent;transition:transform var(--dur-1) var(--ease-spring),filter var(--dur-1) ease}
.mg-press:active:not(:disabled){transform:translateY(2px) scale(.985);filter:brightness(.97)}
@media (hover:hover){.mg-press:not(:disabled):hover{transform:translateY(-2px)}}
.mg-pin{transform:rotate(var(--tilt,0deg))}
@media (hover:hover){.mg-pin:not(:disabled):hover{transform:rotate(0deg) translateY(-4px) scale(1.03)}}
.mg-pin:active:not(:disabled){transform:rotate(var(--tilt,0deg)) scale(.96)}
/* A cream halo lifts a drawn control off near-black space; the dark shadow
   separates it from a bright farm sky. One of the two is always doing work. */
.mg-rim{filter:drop-shadow(0 0 1.6px rgba(255,250,236,.95)) drop-shadow(0 0 7px rgba(255,246,224,.5)) drop-shadow(0 4px 7px rgba(24,16,8,.5))}
@keyframes mg-drop{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.mg-drop{animation:mg-drop .38s cubic-bezier(.22,1,.36,1) both}
@keyframes mg-fade{from{opacity:0}to{opacity:1}}
.mg-fade{animation:mg-fade .22s ease-out both}
@keyframes mg-sheet{from{opacity:0;transform:translateY(30px)}55%{opacity:1}to{opacity:1;transform:none}}
.mg-sheet{animation:mg-sheet .34s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-count{0%{opacity:0;transform:scale(.3) rotate(-11deg)}42%{opacity:1;transform:scale(1.12) rotate(3deg)}66%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.32)}}
.mg-count{animation:mg-count .86s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-ink-in{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.mg-ink-in{stroke-dasharray:1 1.02;animation:mg-ink-in .5s ease-out both}
@keyframes mg-hint{0%{opacity:0;transform:translateY(12px) rotate(-1.2deg)}9%,78%{opacity:1;transform:translateY(0) rotate(-1.2deg)}100%{opacity:0;transform:translateY(-8px) rotate(-1.2deg)}}
.mg-hint{animation:mg-hint 5s ease-in-out both}
@keyframes mg-pop{0%{transform:scale(.2) rotate(-16deg);opacity:0}62%{transform:scale(1.16) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
.mg-pop{animation:mg-pop .42s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-star{0%{transform:scale(0) rotate(-150deg);opacity:0}64%{transform:scale(1.3) rotate(12deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
.mg-star{animation:mg-star .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-rosette{0%{transform:scale(.2) rotate(-24deg);opacity:0}58%{transform:scale(1.14) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(-5deg);opacity:1}}
.mg-rosette{animation:mg-rosette .62s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-twinkle{0%,100%{transform:scale(.6) rotate(-8deg);opacity:.25}50%{transform:scale(1.1) rotate(8deg);opacity:1}}
.mg-twinkle{animation:mg-twinkle 1.8s ease-in-out infinite}
@keyframes mg-heartbreak{0%{transform:scale(1.5);filter:brightness(1.7)}26%{transform:scale(1.22) rotate(-14deg)}56%{transform:scale(.85) rotate(12deg)}100%{transform:scale(1) rotate(0);filter:none}}
.mg-heartbreak{animation:mg-heartbreak .55s cubic-bezier(.34,1.56,.64,1) both}
@keyframes mg-shake{0%,100%{transform:translateX(0) rotate(-1.5deg)}22%{transform:translateX(-5px) rotate(-4deg)}48%{transform:translateX(5px) rotate(1deg)}72%{transform:translateX(-3px) rotate(-3deg)}}
.mg-shake{animation:mg-shake .42s ease-in-out both}
@keyframes mg-wash{0%{opacity:0}18%{opacity:1}100%{opacity:0}}
.mg-wash{background:radial-gradient(circle at 50% 55%,rgba(230,59,46,0) 40%,rgba(230,59,46,.6) 100%);animation:mg-wash .5s ease-out both}
@keyframes mg-alarm{0%,100%{transform:rotate(2deg) scale(1)}50%{transform:rotate(2deg) scale(1.07)}}
.mg-alarm{animation:mg-alarm .9s ease-in-out infinite}
@keyframes mg-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
.mg-breathe{animation:mg-breathe 2.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){
.mg-drop,.mg-fade,.mg-sheet,.mg-count,.mg-ink-in,.mg-hint,.mg-pop,.mg-star,.mg-rosette,.mg-twinkle,
.mg-heartbreak,.mg-shake,.mg-alarm,.mg-breathe{animation:none!important;opacity:1!important}
.mg-drop,.mg-fade,.mg-sheet,.mg-count,.mg-pop,.mg-star,.mg-rosette,.mg-twinkle{transform:none!important}
.mg-press,.mg-press:active:not(:disabled),.mg-pin:active:not(:disabled){transition:none}
.mg-ink-in{stroke-dasharray:none}
.mg-wash{animation-duration:.25s}
}`;

/* ── count-in: 3 · 2 · 1 · GO! written straight onto the page ─────────────── */

function CountIn({ label }: { label: string }) {
  const uid = useId().replace(/:/g, "");
  const go = label === "GO!";
  const tone = go ? "#3aae3a" : "#ffc72c";
  const seed = seedOf(label);
  const ring = drawn("ellipse", 200, 200, seed + 5);
  const url = waxTile(tone);
  const r = hand(seed);
  // short impact ticks, the way you'd flick a pen outward from a circled word
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    const R1 = 108 + r() * 5;
    const R2 = R1 + 16 + r() * 12;
    return `M${(130 + Math.cos(a) * R1).toFixed(1)} ${(130 + Math.sin(a) * R1).toFixed(1)}L${(130 + Math.cos(a) * R2).toFixed(1)} ${(130 + Math.sin(a) * R2).toFixed(1)}`;
  });
  return (
    <div key={label} className="mg-count" style={{ animationDuration: go ? "0.62s" : "0.86s" }}>
      <svg
        width="min(66vmin, 340px)"
        height="min(66vmin, 340px)"
        viewBox="0 0 260 260"
        aria-hidden="true"
        style={{ overflow: "visible", display: "block" }}
      >
        <defs>
          <pattern id={`cw${uid}`} patternUnits="userSpaceOnUse" width={150} height={150}>
            <image href={url} width={150} height={150} />
          </pattern>
          <filter id={`cs${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#150f0a" floodOpacity="0.55" />
          </filter>
        </defs>
        <g filter={`url(#cs${uid})`}>
          {/* the circled ring: inked first, then gone over in crayon */}
          <path
            d={ring} transform="translate(30,30)" fill="none" stroke={INK} strokeWidth={12}
            strokeLinecap="round" opacity={0.9} pathLength={1} className="mg-ink-in"
          />
          <path
            d={ring} transform="translate(30,30)" fill="none" stroke={tone} strokeWidth={7}
            strokeLinecap="round" pathLength={1} className="mg-ink-in"
          />
          {ticks.map((d, i) => (
            <path key={i} d={d} stroke={INK} strokeWidth={7} strokeLinecap="round" opacity={0.85} />
          ))}
          {ticks.map((d, i) => (
            <path key={`t${i}`} d={d} stroke={tone} strokeWidth={3.6} strokeLinecap="round" />
          ))}
          <text
            x={130}
            y={132}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={go ? 92 : 148}
            fontWeight={800}
            fontFamily='"Baloo 2","Nunito",ui-rounded,system-ui,sans-serif'
            fill={`url(#cw${uid})`}
            stroke={INK}
            strokeWidth={go ? 11 : 13}
            style={{ paintOrder: "stroke" }}
          >
            {label}
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ── the in-round HUD ──────────────────────────────────────────────────────
   It floats over four very different worlds — bright farm sky, deep ocean,
   near-black space, dusk jungle — so every chip is cream paper with a heavy
   ink edge and a tight dark shadow: the paper carries contrast on the dark
   worlds, the ink and the shadow carry it on the bright ones. Wax is reserved
   for meaning (combo, hearts, the clock running out). */

const Hud = memo(function Hud({
  score, hearts, left, combo, hurtSeq, onPause,
}: {
  score: number; hearts: number; left: number; combo: number; hurtSeq: number; onPause: () => void;
}) {
  const low = left <= 10;
  const scoreW = score >= 10000 ? 140 : score >= 1000 ? 124 : 108;
  return (
    <div
      className="mg-rim absolute top-0 inset-x-0 z-10 flex items-start gap-2 pointer-events-none"
      style={{
        paddingLeft: "max(10px, env(safe-area-inset-left))",
        paddingRight: "max(10px, env(safe-area-inset-right))",
        paddingTop: "max(10px, env(safe-area-inset-top))",
      }}
    >
      <div className="flex flex-col items-start gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onPause}
            aria-label="Pause game"
            className="mg-press mg-focus-light mg-tap pointer-events-auto block"
            style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
          >
            <DrawnBox w={48} h={48} shape="ellipse" seed={12} weight={3.5} shadow={false}>
              <Icon name="pause" size={22} color={INK} weight={2.8} />
            </DrawnBox>
          </button>
          <DrawnBox w={scoreW} h={46} seed={33} shadow={false} style={{ transform: "rotate(-1.6deg)" }}>
            <WaxGlyph name="star" size={20} tone="#ffc72c" />
            <span className="font-display font-black tabular-nums leading-none" style={{ color: INK, fontSize: 19 }}>
              {score}
            </span>
          </DrawnBox>
        </div>

        <div className="flex items-center gap-2">
          <div key={`h${hurtSeq}`} className={hurtSeq > 0 ? "mg-shake" : ""} style={{ transform: "rotate(-1.5deg)" }}>
            <DrawnBox w={92} h={36} seed={54} shadow={false}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={hurtSeq > 0 && i === hearts ? "mg-heartbreak" : ""} style={{ display: "block" }}>
                  {i < hearts
                    ? <WaxGlyph name="heart" size={19} tone="#e63b2e" />
                    : <Icon name="heartEmpty" size={19} color={INK} weight={2.3} style={{ opacity: 0.28 }} />}
                </span>
              ))}
              <span className="sr-only" role="status">{hearts} hearts left</span>
            </DrawnBox>
          </div>
          {combo > 1 && (
            <div key={`x${combo}`} className="mg-pop">
              <DrawnBox w={56} h={36} seed={71} tone="#fb66e5" shadow={false} style={{ transform: "rotate(2.5deg)" }}>
                <span className="font-display font-black leading-none ink-on-wax" style={{ fontSize: 16 }}>×{combo}</span>
              </DrawnBox>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1" />

      <div className={low ? "mg-alarm" : ""} style={{ transform: "rotate(2deg)" }}>
        <DrawnBox w={100} h={46} seed={88} tone={low ? "#e63b2e" : undefined} shadow={false}>
          <Icon name="clock" size={19} color={low ? CREAM : INK} weight={2.5} />
          <span
            className={`font-display font-black tabular-nums leading-none ${low ? "ink-on-wax" : ""}`}
            style={{ color: low ? undefined : INK, fontSize: 19 }}
          >
            {left}s
          </span>
        </DrawnBox>
      </div>
    </div>
  );
});

/* ── select-screen cards ─────────────────────────────────────────────────── */

function GameCard({
  id, title, how, index, selected, best, compact, onPick,
}: {
  id: string; title: string; how: string; index: number;
  selected: boolean; best: number; compact: boolean; onPick: () => void;
}) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const tone = toneFor(id, index);
  const fg = onWax(tone);
  const seed = seedOf(id);
  return (
    <button
      ref={ref}
      role="radio"
      aria-checked={selected}
      aria-label={`${title}. ${how} ${best > 0 ? `Best score ${best}.` : "You have not played this one yet."}`}
      onClick={onPick}
      className="mg-press mg-focus mg-drop relative isolate text-left w-full"
      style={{ padding: 0, border: 0, background: "none", cursor: "pointer", animationDelay: `${index * 70}ms` }}
    >
      <InkShape w={box.w} h={box.h} seed={seed} weight={3.1} radius={18} fill={{ kind: "paper" }} />
      {selected && <ChosenRing w={box.w} h={box.h} seed={seed} />}
      <div className={`relative z-10 flex items-center gap-3 ${compact ? "p-2" : "p-3"}`}>
        <DrawnBox w={compact ? 54 : 72} h={compact ? 54 : 72} seed={seed + 7} tone={tone} radius={compact ? 15 : 19} shadow={false} weight={3}>
          <Emblem id={id} size={compact ? 30 : 40} color={fg} />
        </DrawnBox>
        <div className="min-w-0 flex-1">
          <div className="ink-title truncate" style={{ fontSize: "var(--fs-md)" }}>{title}</div>
          <div className={`${compact ? "mg-clamp2" : "mg-clamp3"} ink-hand`} style={{ fontSize: "var(--fs-2xs)", lineHeight: 1.3 }}>{how}</div>
          {best > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <Icon name="trophy" size={14} color="var(--plum)" weight={2.5} />
              <span className="font-display font-extrabold tabular-nums" style={{ fontSize: 11, color: "var(--plum)" }}>
                best {best}
              </span>
            </div>
          )}
        </div>
      </div>
      {best === 0 && (
        <span className="absolute -top-2.5 -right-1.5 z-20" style={{ transform: "rotate(7deg)" }}>
          <DrawnBox w={54} h={24} seed={19} tone="#ffc72c" radius={11} weight={2.6}>
            <span className="font-display font-black" style={{ fontSize: 11, color: INK, letterSpacing: "0.02em" }}>NEW!</span>
          </DrawnBox>
        </span>
      )}
      {selected && (
        <span className="absolute -bottom-3 -left-2.5 z-20 mg-pop" aria-hidden="true">
          <DrawnBox w={32} h={32} shape="ellipse" seed={26} tone="#3aae3a" weight={3}>
            <Icon name="check" size={17} color={CREAM} weight={3} />
          </DrawnBox>
        </span>
      )}
    </button>
  );
}

const HERO_W = 100;
const HERO_H = 124;

function HeroCard({
  c, label, selected, onPick, btnRef, index, compact,
}: {
  c: Creature; label: string; selected: boolean; onPick: () => void;
  btnRef?: React.Ref<HTMLButtonElement>; index: number; compact: boolean;
}) {
  const seed = seedOf(c.id + c.name);
  const r = hand(seed);
  const tilt = (r() - 0.5) * 5.4;
  const tapeRot = (r() - 0.5) * 26;
  const W = compact ? 78 : HERO_W;
  const H = compact ? 86 : HERO_H;
  return (
    <div className="shrink-0 snap-center" style={{ paddingTop: 11, paddingBottom: 2 }}>
      <div className="mg-drop" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
        <button
          ref={btnRef}
          role="radio"
          aria-checked={selected}
          aria-label={`Play as ${c.name} the ${label}`}
          onClick={onPick}
          className="ink-pinned mg-pin mg-press mg-focus relative isolate block"
          style={{ ["--tilt" as string]: `${tilt.toFixed(2)}deg`, width: W, height: H, padding: 0, border: 0, background: "none", cursor: "pointer" }}
        >
          <InkShape w={W} h={H} seed={seed} weight={3} radius={9} fill={{ kind: "paper" }} />
          {selected && <ChosenRing w={W} h={H} seed={seed} pad={6} />}
          <Tape
            seed={seed % 5}
            style={{ width: compact ? 42 : 50, height: 18, top: -9, left: (W - (compact ? 42 : 50)) / 2, transform: `rotate(${tapeRot.toFixed(1)}deg)` }}
          />
          <div className="relative z-10 h-full w-full grid grid-rows-[1fr_auto] gap-1 px-2 pt-3 pb-2">
            <div className="grid place-items-center overflow-hidden [&>canvas]:max-h-full [&>canvas]:max-w-full">
              <Thumb c={c} />
            </div>
            <div className="min-w-0">
              <div className="ink-title truncate text-center" style={{ fontSize: compact ? 11 : 12.5, lineHeight: 1.1 }}>{c.name}</div>
              <div className="ink-hand truncate text-center" style={{ fontSize: 10, lineHeight: 1.2 }}>{label}</div>
            </div>
          </div>
          {selected && (
            <span className="absolute -top-3.5 -right-2.5 z-30 mg-pop" aria-hidden="true">
              <WaxGlyph name="star" size={28} tone="#ffc72c" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── results bits ────────────────────────────────────────────────────────── */

/** The score counts itself up — isolated so the whole card doesn't re-render. */
const ScoreCountUp = memo(function ScoreCountUp({ target, big = true, ms = 950 }: { target: number; big?: boolean; ms?: number }) {
  const [v, setV] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced() || target <= 0) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - u, 3))));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return (
    <span aria-hidden="true" className="font-display font-black tabular-nums leading-none" style={{ color: INK, fontSize: big ? "var(--fs-4xl)" : "var(--fs-3xl)" }}>
      {v}
    </span>
  );
});

/** How close this run came to the child's best, drawn as a waxed bar. */
function BestMeter({ score, best }: { score: number; best: number }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const pct = Math.max(5, Math.min(100, (score / Math.max(1, best)) * 100));
  // fill from empty on mount, so the bar visibly grows toward the old best
  const [fill, setFill] = useState(() => (reduced() ? pct : 0));
  useEffect(() => {
    if (reduced()) { setFill(pct); return; }
    const id = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div ref={ref} className="relative isolate w-full" style={{ height: 20 }}>
      <InkShape w={box.w} h={box.h} seed={64} weight={2.6} radius={10} fill={{ kind: "paper" }} lifted={false} />
      <div className="absolute z-10 overflow-hidden" style={{ inset: 4, borderRadius: 99 }}>
        <div
          style={{
            height: "100%",
            width: `${fill}%`,
            borderRadius: 99,
            backgroundImage: wax("#8b46c7"),
            transition: reduced() ? undefined : "width .9s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ── hero art ────────────────────────────────────────────────────────────── */

/** Resolve the best available hero canvas: AI art → photo sticker → crayon. */
function useHeroCanvas(c: Creature | null) {
  const [cv, setCv] = useState<HTMLCanvasElement | null>(null);
  const [artTick, bumpArt] = useState(0);
  useEffect(() => onArtLoaded(() => bumpArt((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    if (!c) { setCv(null); return; }
    if (c.artUrl) {
      const art = artSprite(c.artUrl);
      if (art) { setCv(art); return; }
    }
    if (c.photoData) {
      const im = new Image();
      im.onload = () => {
        if (!live) return;
        const S = Math.min(1, 160 / Math.max(im.width, im.height));
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(im.width * S));
        tmp.height = Math.max(1, Math.round(im.height * S));
        tmp.getContext("2d")!.drawImage(im, 0, 0, tmp.width, tmp.height);
        setCv(stickerizeImage(tmp));
      };
      im.src = c.photoData;
      return () => { live = false; };
    }
    setCv(bakeCrayonSprite(c).frames[0]);
    return () => { live = false; };
    // artTick re-runs this once the AI art finishes downloading
  }, [c, artTick]);
  return cv;
}

/** Neutral input + silent API used while the round is frozen (count-in). */
const IDLE_INPUT: Input = { down: false, x: 0.5, y: 0.5 };
const SILENT_API: GameAPI = {
  score: () => {}, hurt: () => {}, inv: () => true, blip: () => {},
  burst: () => {}, pop: () => {}, shake: () => {}, combo: () => 1,
};

export default function MiniGame({
  worldId,
  creatures,
  onBack,
}: {
  worldId: string;
  creatures: Creature[];
  onBack: () => void;
}) {
  const games = WORLD_GAMES[worldId] ?? WORLD_GAMES.ocean;
  const [gameIdx, setGameIdx] = useState(0);
  const meta = games[Math.min(gameIdx, games.length - 1)] ?? games[0];
  const worldName = useMemo(
    () => WORLD_PACKS.find((p) => p.id === worldId)?.name ?? "Your world",
    [worldId],
  );

  // newest creature is the one the kid just made — the friendliest default hero
  const [hero, setHero] = useState<Creature | null>(creatures.length ? creatures[creatures.length - 1] : null);
  const [stage, setStage] = useState<Stage>("choose");
  const [paused, setPaused] = useState(false);
  const [countLabel, setCountLabel] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hurtSeq, setHurtSeq] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [prevBest, setPrevBest] = useState(0);
  const [endReason, setEndReason] = useState<"time" | "hearts">("time");
  const [bests, setBests] = useState<Record<string, number>>(() => loadBest());
  /* a 740×360 phone in landscape has ~360px of column: everything compacts */
  const compact = useMedia(SHORT_LANDSCAPE);
  const heroCv = useHeroCanvas(hero);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resumeBtnRef = useRef<HTMLButtonElement>(null);
  const heroSelRef = useRef<HTMLButtonElement>(null);
  const ptr = useRef<Input>({ down: false, x: 0.5, y: 0.5 });
  const gameRef = useRef<GameInstance | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const fxRef = useRef(newFxState());
  const juiceRef = useRef(new Juice());
  const pausedRef = useRef(false);
  const countRef = useRef<string | null>(null);
  const sceneT = useRef(0); // wall clock for the backdrop — never rewinds
  /** Round state lives in a ref: the 60fps loop must not re-render React. */
  const gs = useRef({ score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false, freeze: COUNT_IN, gt: 0 });
  const [hud, setHud] = useState({ score: 0, hearts: 3, left: ROUND_S, combo: 0 });

  /* ── round lifecycle ──────────────────────────────────────────────────── */

  const start = useCallback(() => {
    if (!hero) return;
    sfxMagic();
    gs.current = { score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false, freeze: COUNT_IN, gt: 0 };
    gameRef.current = createGame(meta.id);
    fxRef.current = newFxState();
    juiceRef.current.reset();
    ptr.current = { down: false, x: 0.5, y: 0.5 };
    // the backdrop clock is a wall clock: it must not rewind to zero between
    // rounds (the world painters ease several features in off `t`, and some of
    // them are only well-defined once the scene has been running)
    sceneT.current = performance.now() / 1000;
    countRef.current = null;
    pausedRef.current = false;
    setCountLabel(null);
    setPaused(false);
    setHurtSeq(0);
    setHint(gameRef.current.hint ?? meta.how);
    setHud({ score: 0, hearts: 3, left: ROUND_S, combo: 0 });
    setStage("play");
  }, [hero, meta]);

  /** Leave the round without finishing it — safe to call at any time. */
  const quitRound = useCallback(() => {
    gs.current.over = true;
    pausedRef.current = false;
    ptr.current.down = false;
    countRef.current = null;
    setPaused(false);
    setCountLabel(null);
    setHint(null);
    setBests(loadBest());
    setStage("choose");
  }, []);

  const pause = useCallback(() => {
    if (pausedRef.current || gs.current.over) return;
    pausedRef.current = true;
    ptr.current.down = false;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    gs.current.freeze = Math.max(gs.current.freeze, RESUME_IN);
    countRef.current = null;
    setCountLabel(null);
    setPaused(false);
    sfxTap();
  }, []);

  /* ── the round loop ───────────────────────────────────────────────────── */
  // Deps cover everything the loop reads from props/state; round progress lives
  // in refs, so a restart (art loaded, un-pause, resize) resumes seamlessly.
  useEffect(() => {
    if (stage !== "play" || paused || !hero) return;
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    let raf = 0;
    let W = 0, H = 0;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    let lastT = performance.now();
    let hudT = 0;

    const juice = juiceRef.current;
    const syncHud = () => setHud({
      score: gs.current.score,
      hearts: gs.current.hearts,
      left: Math.max(0, Math.ceil(gs.current.left)),
      combo: juice.multiplier(),
    });

    const endRound = (reason: "time" | "hearts") => {
      if (gs.current.over) return;
      gs.current.over = true;
      ptr.current.down = false;
      countRef.current = null;
      const before = loadBest()[meta.id] ?? 0;
      setPrevBest(before);
      setFinalScore(gs.current.score);
      setEndReason(reason);
      setNewBest(saveBest(meta.id, gs.current.score));
      setBests(loadBest());
      setCountLabel(null);
      setHint(null);
      sfxHappy();
      setStage("over");
    };

    const api: GameAPI = {
      score: (n: number) => {
        const mult = juice.hit();
        gs.current.score += n * mult;
        sfxPop();
        if (mult > 1 && juice.comboCount() % 3 === 0) sfxHappy();
      },
      blip: () => sfxTap(),
      inv: () => gs.current.inv > 0,
      hurt: () => {
        if (gs.current.inv > 0 || gs.current.over) return;
        gs.current.hearts -= 1;
        gs.current.inv = 1.3;
        juice.breakCombo();
        juice.shake(0.55);
        sfxSplash();
        if ("vibrate" in navigator) navigator.vibrate(35);
        /* hearts are rare and must feel instant — sync the HUD off-throttle */
        syncHud();
        setHurtSeq((n) => n + 1);
        if (gs.current.hearts <= 0) endRound("hearts");
      },
      burst: (x, y, color, count) => juice.burst(x, y, color, count),
      pop: (x, y, text, color) => juice.pop(x, y, text, color),
      shake: (amount) => juice.shake(amount),
      combo: () => juice.multiplier(),
    };

    const loop = (now: number) => {
      const game = gameRef.current;
      if (!game || gs.current.over || pausedRef.current) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      sampleFrame(dt);
      sceneT.current += dt;
      const wallT = sceneT.current;
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const floorY = H * floorRatio(worldId);
      const sizeF = Math.min(W, H) / 520;

      /* count-in: the world stays alive, the game does not tick yet */
      const frozen = gs.current.freeze > 0;
      if (frozen) {
        gs.current.freeze -= dt;
        const f = gs.current.freeze;
        const label = f > 2.2 ? "3" : f > 1.4 ? "2" : f > 0.6 ? "1" : "GO!";
        if (label !== countRef.current) {
          countRef.current = label;
          setCountLabel(label);
          if (label === "GO!") sfxHappy(); else sfxTap();
        }
      } else if (countRef.current !== null) {
        countRef.current = null;
        setCountLabel(null);
      }
      const gdt = frozen ? 0 : dt;
      gs.current.gt += gdt;
      const frame: Frame = { W, H, t: gs.current.gt, dt: gdt, sizeF, floorY };
      frameRef.current = frame;

      /* screen shake wraps the whole world + entities, never the HUD */
      juice.update(gdt);
      ctx.save();
      juice.applyShake(ctx, sizeF);

      /* the living world as the backdrop */
      const themeFrame = { ctx, W, H, t: wallT, floorY };
      if (worldId === "space") drawSpace(themeFrame, fxRef.current, dt);
      else if (worldId === "farm") drawFarm(themeFrame, fxRef.current, dt);
      else if (worldId === "dino") drawDino(themeFrame, fxRef.current, dt);
      else drawOcean(themeFrame, fxRef.current, dt);

      /* round clock (paused during the count-in) */
      if (!frozen) {
        gs.current.left -= dt;
        if (gs.current.left <= 0) { gs.current.left = 0; ctx.restore(); endRound("time"); return; }
        gs.current.inv = Math.max(0, gs.current.inv - dt);
      }

      /* game logic + entities */
      game.update(frame, frozen ? IDLE_INPUT : ptr.current, frozen ? SILENT_API : api);
      game.draw(ctx, frame);

      /* the hero — the kid's own creature */
      const blink = gs.current.inv > 0 && Math.floor(wallT * 14) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.translate(game.heroX, game.heroY);
      ctx.rotate(game.tilt * 0.6);
      const breathe = 1 + Math.sin(wallT * 3) * 0.03;
      ctx.scale(breathe, 1 / breathe);
      if (heroCv) {
        const hh = 96 * frame.sizeF * game.heroScale;
        const hw = (hh * heroCv.width) / heroCv.height;
        ctx.drawImage(heroCv, -hw / 2, -hh / 2, hw, hh);
      }
      ctx.restore();

      /* game overlay painted in front of the hero (aim lines, charge meters) */
      game.drawFront?.(ctx, frame);

      /* juice: particles + floating score text ride above every entity */
      juice.draw(ctx, frame.sizeF);
      ctx.restore(); // end screen shake

      /* HUD sync (throttled — React never runs in the hot path) */
      hudT += dt;
      if (hudT > 0.12) { hudT = 0; syncHud(); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [stage, paused, hero, heroCv, meta.id, worldId]);

  /* cached scenery layers are shared with WorldScene — drop them on unmount */
  useEffect(() => () => { gs.current.over = true; clearLayers(); }, []);

  /* auto-pause: switching apps must never burn the round clock */
  useEffect(() => {
    if (stage !== "play") return;
    const onHidden = () => { if (document.visibilityState === "hidden") pause(); };
    const onBlur = () => pause();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pausedRef.current) resume(); else pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [stage, pause, resume]);

  /* the hint waits out the count-in, says its piece, then leaves the DOM */
  const hintUp = stage === "play" && !paused && !countLabel && !!hint;
  useEffect(() => {
    if (!hintUp) return;
    const t = window.setTimeout(() => setHint(null), 4800);
    return () => window.clearTimeout(t);
  }, [hintUp]);

  /* keyboard players land on "keep playing" when the pause card opens */
  useEffect(() => {
    if (paused) resumeBtnRef.current?.focus();
  }, [paused]);

  /* Centre the chosen hero in its rail — by moving the rail itself, never
     scrollIntoView: that also scrolls the page, and on a short screen it
     yanks the game list out of sight the moment the picker mounts. */
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stage !== "choose") return;
    const btn = heroSelRef.current;
    const rail = railRef.current;
    if (!btn || !rail) return;
    const b = btn.getBoundingClientRect();
    const r = rail.getBoundingClientRect();
    const left = rail.scrollLeft + (b.left - r.left) - (r.width - b.width) / 2;
    rail.scrollTo({ left, behavior: reduced() ? "auto" : "smooth" });
  }, [stage, hero]);

  const stars = finalScore >= 150 ? 3 : finalScore >= 80 ? 2 : finalScore > 0 ? 1 : 0;
  const starPx = compact ? 40 : 54;

  /* results: stars land one at a time */
  useEffect(() => {
    if (stage !== "over" || reduced()) return;
    const ids: number[] = [];
    for (let i = 0; i < stars; i++) ids.push(window.setTimeout(() => sfxPop(), 420 + i * 280));
    if (newBest) ids.push(window.setTimeout(() => sfxMagic(), 480 + stars * 280));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [stage, stars, newBest]);

  /* ── pointer plumbing ─────────────────────────────────────────────────── */
  const setPtr = (e: React.PointerEvent, down: boolean | null) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    ptr.current.x = (e.clientX - r.left) / Math.max(1, r.width);
    ptr.current.y = (e.clientY - r.top) / Math.max(1, r.height);
    if (down !== null) ptr.current.down = down;
  };
  const live = () => !pausedRef.current && !gs.current.over && gs.current.freeze <= 0;
  const onDown = (e: React.PointerEvent) => {
    if (!live()) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    setPtr(e, true);
    if (frameRef.current) gameRef.current?.onDown?.(frameRef.current, ptr.current);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!ptr.current.down) { setPtr(e, false); return; }
    setPtr(e, false);
    if (live() && frameRef.current) gameRef.current?.onUp?.(frameRef.current);
  };

  const kind = hero ? kindById(hero.kindId) : null;
  const padX = {
    paddingLeft: "max(12px, env(safe-area-inset-left))",
    paddingRight: "max(12px, env(safe-area-inset-right))",
  };

  return (
    <div ref={wrapRef} className="h-full relative overflow-hidden select-none">
      <style>{SHELL_CSS}</style>

      {stage === "play" && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 canvas-touch"
          onPointerDown={onDown}
          onPointerMove={(e) => setPtr(e, null)}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}

      {/* ── in-round HUD ── */}
      {stage === "play" && (
        <Hud
          score={hud.score}
          hearts={hud.hearts}
          left={hud.left}
          combo={hud.combo}
          hurtSeq={hurtSeq}
          onPause={() => { sfxTap(); pause(); }}
        />
      )}

      {/* hit reaction wash */}
      {stage === "play" && hurtSeq > 0 && (
        <div key={`w${hurtSeq}`} className="mg-wash absolute inset-0 z-10 pointer-events-none" />
      )}

      {/* ── count-in + coaching hint ── */}
      {stage === "play" && !paused && countLabel && (
        <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
          <CountIn label={countLabel} />
        </div>
      )}
      {hintUp && (
        <div className="absolute inset-x-0 top-[62%] z-20 flex justify-center pointer-events-none" style={padX}>
          <div className="mg-hint mg-rim max-w-[94%]">
            <InkCard seed={83} weight={2.9} radius={14} lifted={false}>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="shrink-0 mt-0.5">
                  <Icon name="sparkle" size={17} color="#c2740a" fill="#ffc72c" weight={1.8} />
                </span>
                <span className="ink-hand text-center" style={{ fontSize: "var(--fs-xs)", color: "#4a3a28", lineHeight: 1.3 }}>
                  {hint}
                </span>
              </div>
            </InkCard>
          </div>
        </div>
      )}

      {/* ── pause: the book closes for a moment ── */}
      {stage === "play" && paused && (
        <div
          className="mg-fade absolute inset-0 z-30 grid place-items-center p-3"
          style={{ background: "radial-gradient(circle at 50% 42%, rgba(45,41,38,.5), rgba(28,22,16,.8))", backdropFilter: "blur(3px)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Game paused"
        >
          <div className="mg-sheet w-full max-w-[19rem] max-h-full overflow-y-auto mg-scroll" style={{ paddingTop: 14 }}>
            <div style={{ transform: "rotate(-1.2deg)" }}>
              <InkCard seed={29} weight={3.2} radius={24}>
                <Tape seed={2} style={{ width: 76, height: 24, top: -12, left: 18, transform: "rotate(-8deg)" }} />
                <Tape seed={4} style={{ width: 76, height: 24, top: -12, right: 18, transform: "rotate(7deg)" }} />
                <div className={`text-center ${compact ? "p-3 pt-4" : "p-4 pt-5"}`}>
                  <div className="grid place-items-center mb-1">
                    <DrawnBox w={compact ? 42 : 54} h={compact ? 42 : 54} shape="ellipse" seed={45} tone="#563e79" weight={3.2}>
                      <Icon name="pause" size={compact ? 19 : 24} color={CREAM} weight={2.8} />
                    </DrawnBox>
                  </div>
                  <div className="inline-block">
                    <h2 className="ink-title" style={{ fontSize: compact ? "var(--fs-xl)" : "var(--fs-2xl)" }}>Paused</h2>
                    <Scribble color="var(--sun)" height={9} seed={7} />
                  </div>
                  <div className={`flex items-center justify-center gap-3 mt-1 ${compact ? "mb-2" : "mb-3"}`}>
                    <span className="flex items-center gap-1">
                      <WaxGlyph name="star" size={16} tone="#ffc72c" />
                      <span className="ink-hand tabular-nums" style={{ fontSize: "var(--fs-xs)" }}>{hud.score}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="clock" size={15} color="var(--ink-soft)" weight={2.4} />
                      <span className="ink-hand tabular-nums" style={{ fontSize: "var(--fs-xs)" }}>{hud.left}s left</span>
                    </span>
                  </div>

                  <InkButton
                    ref={resumeBtnRef}
                    tone="#00a89f"
                    seed={63}
                    onClick={resume}
                    className="w-full mg-focus"
                    style={{ height: compact ? 46 : 58, padding: "0 14px", marginBottom: 8 }}
                  >
                    <Icon name="play" size={22} color={CREAM} fill={CREAM} />
                    <span className="font-display font-black ink-on-wax" style={{ fontSize: "var(--fs-lg)" }}>Keep playing</span>
                  </InkButton>

                  <div className="grid grid-cols-2 gap-2">
                    <InkButton seed={81} onClick={() => { sfxTap(); start(); }} className="mg-focus" style={{ height: compact ? 44 : 50, padding: "0 8px" }}>
                      <Icon name="undo" size={18} color="var(--plum)" weight={2.4} />
                      <span className="font-display font-extrabold" style={{ fontSize: "var(--fs-sm)", color: "var(--plum)" }}>Restart</span>
                    </InkButton>
                    <InkButton seed={97} onClick={() => { sfxTap(); quitRound(); }} className="mg-focus" style={{ height: compact ? 44 : 50, padding: "0 8px" }}>
                      <Icon name="gamepad" size={18} color="var(--plum)" weight={2.4} />
                      <span className="font-display font-extrabold" style={{ fontSize: "var(--fs-sm)", color: "var(--plum)" }}>Games</span>
                    </InkButton>
                  </div>

                  <InkButton
                    seed={113}
                    onClick={() => { sfxTap(); quitRound(); onBack(); }}
                    className="w-full mg-focus"
                    style={{ height: compact ? 44 : 48, padding: "0 10px", marginTop: 8 }}
                  >
                    <Icon name="home" size={18} color="var(--ink-soft)" weight={2.4} />
                    <span className="font-display font-bold" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-soft)" }}>
                      Back to my world
                    </span>
                  </InkButton>
                </div>
              </InkCard>
            </div>
          </div>
        </div>
      )}

      {/* ── game select ── */}
      {stage === "choose" && (
        <div className="h-full ink-paper flex flex-col" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
          <header className="shrink-0 flex items-center gap-3 pb-2 landshort:pb-1" style={padX}>
            <InkButton
              shape="ellipse"
              seed={15}
              onClick={() => { sfxTap(); onBack(); }}
              className="mg-focus shrink-0"
              style={{ width: 50, height: 50, padding: 0 }}
              aria-label="Back to your world"
            >
              <Icon name="back" size={23} color="var(--plum)" weight={2.6} />
            </InkButton>
            <div className="min-w-0">
              <h1 className="ink-title truncate flex items-center gap-2" style={{ fontSize: "var(--fs-xl)" }}>
                Game time!
                <Icon name="gamepad" size={22} color="var(--plum)" weight={2.3} />
              </h1>
              <p className="ink-hand truncate flex items-center gap-1" style={{ fontSize: "var(--fs-2xs)" }}>
                <Icon name="globe" size={12} color="var(--ink-soft)" weight={2.4} />
                {worldName}
              </p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto mg-scroll" style={{ ...padX, paddingBottom: 6 }}>
            {/* one column on a phone; on a tablet the games and the hero
                picker sit side by side so the page has no dead middle */}
            <div className="mx-auto w-full max-w-[56rem] min-h-full flex flex-col md:grid md:grid-cols-2 md:gap-x-6 md:items-start">
            <div>
            <div className="inline-block mb-2 landshort:mb-2.5">
              <h2 className="ink-title" style={{ fontSize: "var(--fs-lg)" }}>Choose a game</h2>
              <div className="landshort:hidden"><Scribble color="var(--sun)" height={9} seed={12} /></div>
            </div>
            <div
              role="radiogroup"
              aria-label="Choose a game"
              className="grid gap-3.5 landshort:gap-2.5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))" }}
            >
              {games.map((gm, i) => (
                <GameCard
                  key={gm.id}
                  id={gm.id}
                  title={gm.title}
                  how={gm.how}
                  index={i}
                  selected={i === gameIdx}
                  best={bests[gm.id] ?? 0}
                  compact={compact}
                  onPick={() => { setGameIdx(i); sfxTap(); }}
                />
              ))}
            </div>

            </div>

            <div className="contents md:block">
            {/* On a tall screen the child's own drawing gets the spare room:
                their hero, taped into the page, ready for the game they picked. */}
            {hero && (
              <div className="hidden tall:block mt-4 md:mt-0" aria-hidden="true">
                <div style={{ transform: "rotate(-1.1deg)" }}>
                  <InkCard seed={(seedOf(hero.id) % 700) + 7} radius={20} className="p-2.5">
                    <Tape
                      seed={seedOf(hero.name) % 5}
                      style={{ width: 72, height: 22, top: -14, left: 18, transform: "rotate(-11deg)" }}
                    />
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 grid place-items-center overflow-hidden [&>canvas]:max-h-full [&>canvas]:max-w-full" style={{ width: 86, height: 86 }}>
                        <Thumb c={hero} />
                      </div>
                      <div className="min-w-0">
                        <div className="ink-hand" style={{ fontSize: "var(--fs-2xs)" }}>your hero</div>
                        <div className="ink-title truncate" style={{ fontSize: "var(--fs-lg)" }}>{hero.name}</div>
                        <div className="ink-hand" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.25 }}>
                          is ready for {meta.title}!
                        </div>
                      </div>
                    </div>
                  </InkCard>
                </div>
              </div>
            )}

            {creatures.length > 0 ? (
              <div className="mt-auto pt-1 md:mt-0">
                <div className="inline-block mt-5 landshort:mt-2 mb-0.5">
                  <h2 className="ink-title flex items-baseline gap-2" style={{ fontSize: "var(--fs-lg)" }}>
                    Pick your hero
                    <span className="ink-hand" style={{ fontSize: "var(--fs-2xs)" }}>
                      {creatures.length} {creatures.length === 1 ? "friend" : "friends"}
                    </span>
                  </h2>
                  <div className="landshort:hidden"><Scribble color="var(--pink)" height={9} seed={22} /></div>
                </div>
                <div
                  ref={railRef}
                  role="radiogroup"
                  aria-label="Pick your hero"
                  className="flex gap-3.5 landshort:gap-2.5 overflow-x-auto mg-scroll snap-x -mx-2 px-2"
                >
                  {creatures.map((c, i) => (
                    <HeroCard
                      key={c.id}
                      c={c}
                      index={i}
                      label={kindById(c.kindId).label}
                      selected={hero?.id === c.id}
                      compact={compact}
                      btnRef={hero?.id === c.id ? heroSelRef : undefined}
                      onPick={() => { setHero(c); sfxTap(); }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="my-4" style={{ transform: "rotate(-1deg)" }}>
                <InkCard seed={35} radius={20} className="p-4 text-center">
                  <div className="grid place-items-center mb-1.5">
                    <DrawnBox w={52} h={52} shape="ellipse" seed={51} tone="#ffc72c" weight={3}>
                      <Icon name="pencil" size={24} color={INK} weight={2.4} />
                    </DrawnBox>
                  </div>
                  <p className="ink-title" style={{ fontSize: "var(--fs-lg)" }}>Draw a friend first!</p>
                  <p className="ink-hand" style={{ fontSize: "var(--fs-sm)" }}>Your creature is the star of every game.</p>
                </InkCard>
              </div>
            )}
            </div>
            </div>
          </div>

          <footer className="shrink-0 pt-2 landshort:pt-1" style={{ ...padX, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
            <div className={hero && heroCv ? "mg-breathe" : ""}>
              <InkButton
                tone="#3aae3a"
                seed={41}
                onClick={start}
                disabled={!hero || !heroCv}
                className="w-full mg-focus"
                style={{ height: compact ? 52 : 60, padding: "0 16px" }}
              >
                <Icon name="play" size={24} color={CREAM} fill={CREAM} />
                <span className="font-display font-black truncate ink-on-wax" style={{ fontSize: "var(--fs-xl)" }}>
                  {hero ? `Go, ${hero.name}!` : "Pick a hero!"}
                </span>
              </InkButton>
            </div>
          </footer>
        </div>
      )}

      {/* ── results ── */}
      {stage === "over" && hero && kind && (
        <div
          className="h-full ink-paper overflow-y-auto mg-scroll grid place-items-center"
          style={{ ...padX, paddingTop: "max(14px, env(safe-area-inset-top))", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
        >
          <div className={`mg-sheet w-full ${compact ? "max-w-[34rem]" : "max-w-sm"}`} style={{ paddingTop: 12 }}>
            <div style={{ transform: "rotate(-0.8deg)" }}>
              <InkCard seed={57} weight={3.2} radius={26} className={`text-center ${compact ? "p-3 pt-5" : "p-4 pt-6 sm:p-5 sm:pt-7"}`}>
                <Tape seed={1} style={{ width: 70, height: 22, top: -16, left: -10, transform: "rotate(-14deg)" }} />
                <Tape seed={3} style={{ width: 70, height: 22, top: -16, right: -10, transform: "rotate(12deg)" }} />

                {/* landscape has half the height and twice the width: the run
                    itself goes left, what to do next goes right */}
                <div className={compact ? "grid grid-cols-2 gap-5 items-center" : ""}>
                <div>
                <div className="flex items-center justify-center gap-2">
                  <Icon
                    name={endReason === "hearts" ? "heartEmpty" : "clock"}
                    size={22}
                    color="var(--plum)"
                    weight={2.5}
                  />
                  <h2 className="ink-title" style={{ fontSize: compact ? "var(--fs-xl)" : "var(--fs-2xl)" }}>
                    {endReason === "hearts" ? "Out of hearts!" : "Time's up!"}
                  </h2>
                </div>

                <div
                  className="flex justify-center items-end gap-2 mt-2 mb-1"
                  role="img"
                  aria-label={`${stars} out of 3 stars`}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={i < stars ? "mg-star" : ""}
                      style={{
                        display: "block",
                        animationDelay: i < stars ? `${0.3 + i * 0.26}s` : undefined,
                        transform: i === 1 ? "translateY(-6px)" : undefined,
                      }}
                    >
                      {i < stars
                        ? <WaxGlyph name="star" size={starPx + (i === 1 ? 8 : 0)} tone="#ffc72c" weight={2.4} />
                        : <Icon name="starEmpty" size={starPx + (i === 1 ? 8 : 0)} color={INK} weight={2.2} style={{ opacity: 0.22 }} />}
                    </span>
                  ))}
                </div>

                <div className="inline-block mt-1">
                  <ScoreCountUp target={finalScore} big={!compact} />
                  <Scribble color="var(--teal)" height={10} seed={9} />
                </div>
                <p className="sr-only" role="status">You scored {finalScore} points.</p>
                <div className="ink-hand truncate mt-0.5" style={{ fontSize: "var(--fs-xs)" }}>
                  {hero.name} the {kind.label} · {meta.title}
                </div>

                </div>
                <div>
                {newBest ? (
                  <div className="relative mt-3 grid place-items-center">
                    <span className="absolute left-1 top-0 mg-twinkle" aria-hidden="true" style={{ animationDelay: ".2s" }}>
                      <Icon name="sparkle" size={20} color="#c2740a" fill="#ffc72c" weight={1.6} />
                    </span>
                    <span className="absolute right-2 -top-1 mg-twinkle" aria-hidden="true" style={{ animationDelay: ".9s" }}>
                      <Icon name="sparkle" size={16} color="#c2740a" fill="#ffc72c" weight={1.6} />
                    </span>
                    <div className="mg-rosette">
                      <DrawnBox w={compact ? 176 : 202} h={compact ? 48 : 56} seed={77} tone="#ffc72c" radius={24} weight={3.4}>
                        <Icon name="trophy" size={compact ? 21 : 24} color={INK} weight={2.5} />
                        <span className="font-display font-black" style={{ fontSize: compact ? 17 : 19, color: INK, letterSpacing: ".01em" }}>
                          NEW BEST!
                        </span>
                      </DrawnBox>
                    </div>
                    {prevBest > 0 && (
                      <div className="ink-hand mt-2.5 relative inline-block" style={{ fontSize: "var(--fs-2xs)" }}>
                        <span style={{ opacity: 0.75 }}>was {prevBest}</span>
                        <svg
                          aria-hidden="true"
                          className="absolute inset-0 pointer-events-none"
                          viewBox="0 0 100 12"
                          preserveAspectRatio="none"
                          style={{ width: "100%", height: "100%" }}
                        >
                          <path d="M2 7.4C22 5.2 46 8.6 68 5.8 80 4.4 92 6.6 98 5.2" fill="none" stroke="var(--coral)" strokeWidth={2.4} strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                ) : prevBest > 0 ? (
                  <div className="mt-3">
                    <BestMeter score={finalScore} best={prevBest} />
                    <div className="ink-hand mt-1 flex items-center justify-center gap-1.5 tabular-nums" style={{ fontSize: "var(--fs-2xs)" }}>
                      <Icon name="trophy" size={13} color="var(--plum)" weight={2.5} />
                      {finalScore >= prevBest
                        ? `you matched your best of ${prevBest}!`
                        : `${prevBest - finalScore} more to beat your best of ${prevBest}`}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2">
                  <InkButton
                    tone="#8b46c7"
                    seed={101}
                    onClick={() => { sfxTap(); start(); }}
                    className="w-full mg-focus"
                    style={{ height: compact ? 50 : 60, padding: "0 14px" }}
                  >
                    <Icon name="undo" size={23} color={CREAM} weight={2.6} />
                    <span className="font-display font-black ink-on-wax" style={{ fontSize: "var(--fs-xl)" }}>Play again!</span>
                  </InkButton>
                  <div className="grid grid-cols-2 gap-2">
                    <InkButton
                      seed={119}
                      onClick={() => { sfxTap(); setBests(loadBest()); setStage("choose"); }}
                      className="mg-focus"
                      style={{ height: compact ? 44 : 52, padding: compact ? "0 5px" : "0 8px" }}
                    >
                      <Icon name="gamepad" size={compact ? 17 : 19} color="var(--plum)" weight={2.4} />
                      {/* the label has to survive a half-width landscape column
                          next to its icon — a pre-reader needs both */}
                      <span
                        className="font-display font-extrabold truncate"
                        style={{ fontSize: compact ? "var(--fs-xs)" : "var(--fs-sm)", color: "var(--plum)" }}
                      >
                        {compact ? "New game" : "Another game"}
                      </span>
                    </InkButton>
                    <InkButton
                      seed={131}
                      onClick={() => { sfxTap(); onBack(); }}
                      className="mg-focus"
                      style={{ height: compact ? 44 : 52, padding: compact ? "0 5px" : "0 8px" }}
                    >
                      <Icon name="home" size={compact ? 17 : 19} color="var(--plum)" weight={2.4} />
                      <span
                        className="font-display font-extrabold truncate"
                        style={{ fontSize: compact ? "var(--fs-xs)" : "var(--fs-sm)", color: "var(--plum)" }}
                      >
                        My world
                      </span>
                    </InkButton>
                  </div>
                </div>
                </div>
                </div>
              </InkCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
