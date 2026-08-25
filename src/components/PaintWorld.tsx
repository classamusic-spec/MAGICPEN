// ─── Paint World: the easel for the child's own world ───────────────────────
// A full-page canvas where the child paints a background — sky, ground, a sun,
// water, anything. Then a second, quieter job: telling the world *what* they
// painted. A four-year-old can't be asked to trace a shape, so they wipe a fat
// brush over an area and tap "Water". That mask is what lets fish swim in the
// river they drew instead of in a guessed rectangle.
//
// Two modes, one canvas:
//   • Draw       — crayons, sizes, eraser, the draggable ground line (as before)
//   • What's what — Sky / Water / Ground, wiped on as a translucent wash
//
// Regions are entirely optional. Skip the second mode and "Bring it to life!"
// behaves exactly as it did before regions existed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DreamWorld, Pt, RegionKind, Stroke } from "@/lib/types";
import { drawStroke } from "@/lib/brushes";
import {
  REGION_H, REGION_KINDS, REGION_STYLE, REGION_W,
  decodeMask, encodeMask, hasRegion, newMask, paintMask, regionAt,
  type RegionMask,
} from "@/lib/regions";
import { sfxTap, sfxMagic, sfxPop } from "@/lib/audio";
import { InkButton, InkCard } from "@/components/ink/Ink";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { Icon } from "@/components/ink/Icons";

/* the same crayon box as the drawing screen, so a colour means the same thing
   everywhere in the app */
const CRAYONS = [
  { c: "#2f6fe4", name: "Ocean blue" },
  { c: "#00c2b9", name: "Lagoon" },
  { c: "#3aae3a", name: "Leaf green" },
  { c: "#ffc72c", name: "Sunshine yellow" },
  { c: "#ff7a1a", name: "Orange" },
  { c: "#e63b2e", name: "Cherry red" },
  { c: "#fb66e5", name: "Candy pink" },
  { c: "#8b46c7", name: "Grape" },
  { c: "#7a4a21", name: "Cocoa brown" },
  { c: "#2d2926", name: "Licorice black" },
];

const SIZES = [
  { px: 8, label: "Thin" },
  { px: 16, label: "Medium" },
  { px: 28, label: "Thick" },
];

/** Region brush radius, as a fraction of the sheet width — deliberately fat:
 *  a whole area gets marked in one confident swipe, not traced. */
const REGION_BRUSH = 0.14;
/** How far the brush may travel before we drop another dab, so a quick flick
 *  paints a continuous band instead of a dotted line. */
const REGION_STEP = REGION_BRUSH * 0.4;
/** Upscale factor for the region wash: a bilinear blow-up of the coarse grid
 *  gives soft watercolour edges for free, with no per-cell path work. */
const WASH_SS = 6;

const anyRegions = (m: RegionMask) => REGION_KINDS.some((k) => hasRegion(m, k));

/**
 * One clamped 3×3 box blur over the coarse grid, in premultiplied colour so
 * bare cells never bleed grey into the edges. Without it a blown-up 24×32 grid
 * reads as a staircase; with it, as a watercolour blob.
 */
function softenGrid(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    pr[i] = data[i * 4] * a;
    pg[i] = data[i * 4 + 1] * a;
    pb[i] = data[i * 4 + 2] * a;
    pa[i] = a;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const j = sy * w + Math.min(w - 1, Math.max(0, x + dx));
          r += pr[j]; g += pg[j]; b += pb[j]; a += pa[j];
        }
      }
      const i = (y * w + x) * 4;
      data[i + 3] = Math.round((a / 9) * 255);
      if (a > 0.001) {
        data[i] = Math.round(r / a);
        data[i + 1] = Math.round(g / a);
        data[i + 2] = Math.round(b / a);
      }
    }
  }
}

export default function PaintWorld({
  initial,
  onDone,
  onBack,
}: {
  initial?: DreamWorld | null;
  onDone: (dream: DreamWorld) => void;
  onBack: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const washRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const reduced = usePrefersReducedMotion();

  const [strokes, setStrokes] = useState<Stroke[]>(
    () => (initial?.strokes ? initial.strokes.map((s) => ({ ...s, pts: [...s.pts] })) : []),
  );
  const [color, setColor] = useState(CRAYONS[0].c);
  const [size, setSize] = useState(SIZES[1].px);
  const [erasing, setErasing] = useState(false);
  const [ground, setGround] = useState(initial?.ground ?? 0.78);
  const [draggingGround, setDraggingGround] = useState(false);
  const [sheet, setSheet] = useState({ w: 0, h: 0 });

  /* ── region mode ── */
  const [mode, setMode] = useState<"draw" | "regions">("draw");
  const [kind, setKind] = useState<RegionKind>("sky");
  const [regionErasing, setRegionErasing] = useState(false);
  /** Decoded from `initial` — a fresh array, so the prop is never mutated. */
  const [firstMask] = useState<RegionMask>(() => decodeMask(initial?.regions) ?? newMask());
  const maskRef = useRef<RegionMask>(firstMask);
  /** Snapshots for undo, one per wipe. */
  const histRef = useRef<RegionMask[]>([]);
  const wipingRef = useRef(false);
  const lastDabRef = useRef<{ nx: number; ny: number } | null>(null);
  /** What the mask says, mirrored into state so the buttons can read it. */
  const [marked, setMarked] = useState<RegionKind[]>(() => REGION_KINDS.filter((k) => hasRegion(firstMask, k)));
  const [undoDepth, setUndoDepth] = useState(0);

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokesRef.current.forEach((s, i) => drawStroke(ctx, s, i + 1));
    if (liveRef.current) drawStroke(ctx, liveRef.current, 999);
  }, []);

  /* ── the region wash: coarse grid → soft translucent colour over the art ──
     Painted at grid resolution and blown up with smoothing, so the child sees
     a watercolour blob, not 24×32 pixel steps. Repaints only when the mask
     changes, never per frame. */
  const drawWash = useCallback(() => {
    const cv = washRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const w = cv.width / dpr;
    const h = cv.height / dpr;
    if (!(w > 1) || !(h > 1)) return;

    const m = maskRef.current;
    const cells = document.createElement("canvas");
    cells.width = REGION_W;
    cells.height = REGION_H;
    const cc = cells.getContext("2d");
    if (!cc) return;
    const img = cc.createImageData(REGION_W, REGION_H);
    let painted = false;
    for (let y = 0; y < REGION_H; y++) {
      for (let x = 0; x < REGION_W; x++) {
        const k = regionAt(m, (x + 0.5) / REGION_W, (y + 0.5) / REGION_H);
        if (!k) continue;
        painted = true;
        const hex = REGION_STYLE[k].color;
        const n = parseInt(hex.slice(1), 16);
        const i = (y * REGION_W + x) * 4;
        img.data[i] = (n >> 16) & 255;
        img.data[i + 1] = (n >> 8) & 255;
        img.data[i + 2] = n & 255;
        img.data[i + 3] = 255;
      }
    }
    if (!painted) return;
    softenGrid(img.data, REGION_W, REGION_H);
    cc.putImageData(img, 0, 0);

    // one smoothed step up, then a second on the way to the sheet: two gentle
    // bilinear passes read as a soft edge instead of a diamond-shaped ramp
    const soft = document.createElement("canvas");
    soft.width = REGION_W * WASH_SS;
    soft.height = REGION_H * WASH_SS;
    const sc = soft.getContext("2d");
    if (!sc) return;
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = "high";
    sc.drawImage(cells, 0, 0, soft.width, soft.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.4;
    ctx.drawImage(soft, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    const cv = canvasRef.current!;
    const wash = washRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      for (const c of [cv, wash]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      setSheet((p) => (p.w === w && p.h === h ? p : { w, h }));
      redraw();
      drawWash();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw, drawWash]);

  useEffect(() => { strokesRef.current = strokes; redraw(); }, [strokes, redraw]);

  /** Repaint the wash and mirror the mask into state. Called from handlers only. */
  const syncRegions = useCallback(() => {
    drawWash();
    const m = maskRef.current;
    const next = REGION_KINDS.filter((k) => hasRegion(m, k));
    setMarked((prev) => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
    setUndoDepth(histRef.current.length);
  }, [drawWash]);

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toNorm = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { nx: (e.clientX - r.left) / Math.max(1, r.width), ny: (e.clientY - r.top) / Math.max(1, r.height) };
  };

  const eraseAt = (path: Pt[]) => {
    const radius = 26;
    setStrokes((prev) =>
      prev.filter((s) => {
        for (const q of path) for (const p of s.pts) if (Math.hypot(p.x - q.x, p.y - q.y) < radius + s.size / 2) return false;
        return true;
      }),
    );
  };

  /* ── wiping a region on ── */
  const dab = (nx: number, ny: number) => {
    paintMask(maskRef.current, regionErasing ? null : kind, nx, ny, REGION_BRUSH);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === "regions") {
      const { nx, ny } = toNorm(e);
      histRef.current = [...histRef.current.slice(-23), Uint8Array.from(maskRef.current)];
      wipingRef.current = true;
      lastDabRef.current = { nx, ny };
      dab(nx, ny);
      syncRegions();
      return;
    }
    const p = toLocal(e);
    if (erasing) { liveRef.current = { color: "", size: 0, pts: [p] }; eraseAt([p]); return; }
    liveRef.current = { color, size, pts: [p] };
  };

  const onMove = (e: React.PointerEvent) => {
    if (mode === "regions") {
      if (!wipingRef.current) return;
      const { nx, ny } = toNorm(e);
      const last = lastDabRef.current;
      if (last) {
        // walk the gap so a fast swipe paints a band, not a dotted line
        const dx = nx - last.nx, dy = ny - last.ny;
        const dist = Math.hypot(dx, dy);
        if (dist < REGION_STEP * 0.5) return;
        const steps = Math.min(24, Math.ceil(dist / REGION_STEP));
        for (let i = 1; i <= steps; i++) dab(last.nx + (dx * i) / steps, last.ny + (dy * i) / steps);
      } else {
        dab(nx, ny);
      }
      lastDabRef.current = { nx, ny };
      drawWash();
      return;
    }
    const live = liveRef.current;
    if (!live) return;
    const p = toLocal(e);
    const last = live.pts[live.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    live.pts.push(p);
    if (erasing) eraseAt(live.pts.slice(-4));
    redraw();
  };

  const onUp = () => {
    if (mode === "regions") {
      if (!wipingRef.current) return;
      wipingRef.current = false;
      lastDabRef.current = null;
      sfxPop();
      syncRegions();
      return;
    }
    const live = liveRef.current;
    liveRef.current = null;
    if (!live || erasing) return;
    if (live.pts.length >= 2) { sfxPop(); setStrokes((prev) => [...prev, live]); }
    else redraw();
  };

  const undo = () => {
    if (mode === "regions") {
      const h = histRef.current;
      if (!h.length) return;
      sfxTap();
      maskRef.current = h.pop()!;
      syncRegions();
      return;
    }
    setStrokes((prev) => {
      if (!prev.length) return prev;
      sfxTap();
      return prev.slice(0, -1);
    });
  };

  const clearAll = () => {
    if (mode === "regions") {
      if (!anyRegions(maskRef.current)) return;
      sfxTap();
      histRef.current = [...histRef.current.slice(-23), Uint8Array.from(maskRef.current)];
      maskRef.current = newMask();
      syncRegions();
      return;
    }
    if (strokes.length) { sfxTap(); setStrokes([]); }
  };

  /* ── the ground line, dragged with the grip ── */
  const groundDrag = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingGround(true);
  };
  const groundMove = (e: React.PointerEvent) => {
    if (!draggingGround) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const g = Math.max(0.35, Math.min(0.92, (e.clientY - r.top) / r.height));
    setGround(g);
  };
  const groundUp = () => setDraggingGround(false);

  const hasAnyRegion = marked.length > 0;

  const bringToLife = () => {
    if (!strokes.length) return;
    sfxMagic();
    onDone({
      rev: Date.now(),
      dw: sheet.w,
      dh: sheet.h,
      ground,
      strokes,
      // regions stay optional: a child who never opened the mode hands back
      // exactly what they always did
      ...(hasAnyRegion ? { regions: encodeMask(maskRef.current) } : {}),
    });
  };

  const empty = strokes.length === 0;
  const regionMode = mode === "regions";
  const canUndo = regionMode ? undoDepth > 0 : !empty;
  const canClear = regionMode ? hasAnyRegion : !empty;
  const grow = reduced ? "none" : "transform 140ms var(--ease-out, ease-out)";

  const pickMode = (m: "draw" | "regions") => {
    if (m === mode) return;
    sfxTap();
    liveRef.current = null;
    wipingRef.current = false;
    lastDabRef.current = null;
    setMode(m);
    redraw();
  };

  return (
    <div className="screen ink-paper overflow-hidden flex flex-col">
      {/* ── top bar ── */}
      <div
        className="relative z-20 flex items-center gap-2 pad-x"
        style={{ paddingTop: "max(10px, var(--safe-t))" }}
      >
        <InkButton
          seed={9}
          radius={16}
          onClick={() => { sfxTap(); onBack(); }}
          aria-label="Back to home"
          className="shrink-0"
          style={{ width: "var(--tap)", height: "var(--tap)" }}
        >
          <Icon name="back" size={22} />
        </InkButton>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="ink-title text-fs-lg leading-none truncate">
            {regionMode ? "What's what?" : "Paint your world"}
          </h1>
          <p className="ink-hand text-fs-2xs truncate">
            {regionMode ? "wipe over a bit and it gets a name" : "a sky, the ground, a sun — anything!"}
          </p>
        </div>
        <InkButton
          seed={21}
          radius={16}
          onClick={undo}
          disabled={!canUndo}
          aria-label={regionMode ? "Undo the last wipe" : "Undo the last stroke"}
          className="shrink-0 disabled:opacity-40"
          style={{ width: "var(--tap)", height: "var(--tap)" }}
        >
          <Icon name="undo" size={22} />
        </InkButton>
      </div>

      {/* ── the canvas ── */}
      <div ref={wrapRef} className="relative flex-1 mx-2 my-2 short:my-1 rounded-2xl overflow-hidden" style={{ border: "3px solid var(--ink)", background: "#fffdf7" }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 canvas-touch touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
        {/* the region wash, floated over the drawing — quieter while drawing so
            it never fights the crayon */}
        <canvas
          ref={washRef}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: regionMode ? 1 : 0.45, transition: reduced ? "none" : "opacity 200ms ease-out" }}
        />

        {/* first-time hints */}
        {empty && !regionMode && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none px-6 text-center">
            <p className="ink-hand text-fs-lg" style={{ color: "rgba(45,41,38,0.45)" }}>
              Draw your world here!<br />The sky, the ground, a sun…
            </p>
          </div>
        )}
        {regionMode && !hasAnyRegion && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none px-6 text-center">
            <p className="ink-hand text-fs-lg" style={{ color: "rgba(45,41,38,0.45)" }}>
              Wipe over the {REGION_STYLE[kind].label.toLowerCase()}!<br />
              <span className="text-fs-sm">…or skip this — your world works anyway</span>
            </p>
          </div>
        )}

        {/* ── the ground line: still the fallback when nothing is marked ── */}
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: `${ground * 100}%`, transform: "translateY(-50%)", opacity: regionMode ? 0.4 : 1 }}
          aria-hidden="true"
        >
          <div style={{ height: 0, borderTop: "3px dashed rgba(86,62,121,0.55)" }} />
        </div>
        {!regionMode && (
          <button
            type="button"
            onPointerDown={groundDrag}
            onPointerMove={groundMove}
            onPointerUp={groundUp}
            onPointerCancel={groundUp}
            aria-label={`Ground line at ${Math.round(ground * 100)} percent. Drag up or down to set where the ground is.`}
            className="absolute right-2 touch-none"
            style={{ top: `${ground * 100}%`, transform: "translateY(-50%)" }}
          >
            <span
              className="flex items-center gap-1 px-2.5 py-1 rounded-full ink-title text-fs-2xs shadow"
              style={{ background: "var(--sun)", border: "2.5px solid var(--ink)", color: "var(--ink)", cursor: "ns-resize" }}
            >
              <Icon name="more" size={14} />
              ground
            </span>
          </button>
        )}
      </div>

      {/* ── toolbar ── */}
      <div className="relative z-20 pad-x" style={{ paddingBottom: "max(8px, var(--safe-b))" }}>
        <InkCard
          seed={44}
          radius={20}
          className="p-2 short:p-1.5"
          contentClassName="flex flex-col gap-2 short:gap-1 landshort:flex-row landshort:items-center landshort:gap-2"
        >
          {/* which job am I doing? */}
          <div className="flex items-stretch gap-1.5 landshort:flex-col landshort:shrink-0 landshort:w-40" role="group" aria-label="Draw, or say what's what">
            {([
              { id: "draw" as const, icon: "pencil" as const, label: "Draw" },
              { id: "regions" as const, icon: "globe" as const, label: "What's what?" },
            ]).map((tab) => {
              const on = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => pickMode(tab.id)}
                  aria-pressed={on}
                  className="flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-2xl"
                  style={{
                    minHeight: 44,
                    border: "3px solid var(--ink)",
                    background: on ? "var(--sun)" : "#fffdf7",
                    boxShadow: on ? "0 3px 0 var(--ink)" : "none",
                  }}
                >
                  <Icon name={tab.icon} size={18} />
                  <span className="ink-title text-fs-2xs truncate">{tab.label}</span>
                  {tab.id === "regions" && hasAnyRegion && (
                    <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                      {marked.map((k) => (
                        <span
                          key={k}
                          className="rounded-full"
                          style={{ width: 7, height: 7, background: REGION_STYLE[k].color, border: "1.5px solid var(--ink)" }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 short:gap-1 min-w-0 landshort:flex-1">
          {regionMode ? (
            <>
              {/* sky · water · ground */}
              <div className="flex items-stretch gap-1.5" role="group" aria-label="What is this part of your world?">
                {REGION_KINDS.map((k) => {
                  const st = REGION_STYLE[k];
                  const on = !regionErasing && kind === k;
                  const done = marked.includes(k);
                  const dot = on ? "#fffaf0" : st.color;
                  return (
                    <button
                      key={k}
                      onClick={() => { sfxTap(); setRegionErasing(false); setKind(k); }}
                      aria-pressed={on}
                      aria-label={`${st.label} — ${st.hint}${done ? ", already marked" : ""}`}
                      className="flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-2xl"
                      style={{
                        minHeight: "var(--tap)",
                        border: "3px solid var(--ink)",
                        background: on ? st.color : "#fffdf7",
                        color: on ? "#fffaf0" : "var(--ink)",
                        boxShadow: on ? "0 0 0 3px var(--sun)" : "none",
                        transform: on ? "translateY(-1px)" : "none",
                        transition: grow,
                      }}
                    >
                      <span
                        className="rounded-full shrink-0"
                        style={{ width: 14, height: 14, background: done ? dot : "transparent", border: `3px solid ${dot}` }}
                      />
                      <span className="ink-title text-fs-2xs truncate">{st.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* what that one means · rub it out · start over */}
              <div className="flex items-center gap-2">
                <p className="ink-hand text-fs-2xs flex-1 min-w-0 truncate" style={{ color: "var(--ink-soft)" }}>
                  {regionErasing ? "rub the colour off" : REGION_STYLE[kind].hint}
                </p>
                <button
                  onClick={() => { sfxTap(); setRegionErasing((v) => !v); }}
                  aria-label="Rub out what you marked"
                  aria-pressed={regionErasing}
                  className="grid place-items-center rounded-full shrink-0"
                  style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: regionErasing ? "var(--sun)" : "#fffdf7" }}
                >
                  <Icon name="eraser" size={22} />
                </button>
                <button
                  onClick={clearAll}
                  disabled={!canClear}
                  aria-label="Clear everything you marked"
                  className="grid place-items-center rounded-full shrink-0 disabled:opacity-40"
                  style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: "#fffdf7" }}
                >
                  <Icon name="trash" size={20} />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* colours */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {CRAYONS.map((cr) => {
                  const on = !erasing && color === cr.c;
                  return (
                    <button
                      key={cr.c}
                      onClick={() => { sfxTap(); setErasing(false); setColor(cr.c); }}
                      aria-label={cr.name}
                      aria-pressed={on}
                      className="rounded-full transition-transform"
                      style={{
                        width: 30, height: 30, background: cr.c,
                        border: "3px solid var(--ink)",
                        transform: on ? "scale(1.22)" : "scale(1)",
                        boxShadow: on ? "0 0 0 3px var(--sun)" : "none",
                      }}
                    />
                  );
                })}
              </div>

              {/* sizes · eraser · clear */}
              <div className="flex items-center justify-center gap-2">
                {SIZES.map((sz) => {
                  const on = !erasing && size === sz.px;
                  return (
                    <button
                      key={sz.px}
                      onClick={() => { sfxTap(); setErasing(false); setSize(sz.px); }}
                      aria-label={`${sz.label} brush`}
                      aria-pressed={on}
                      className="grid place-items-center rounded-full"
                      style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: on ? "var(--sun)" : "#fffdf7" }}
                    >
                      <span className="rounded-full" style={{ width: sz.px, height: sz.px, background: "var(--ink)" }} />
                    </button>
                  );
                })}
                <div className="w-px self-stretch mx-0.5" style={{ background: "var(--ink)", opacity: 0.2 }} />
                <button
                  onClick={() => { sfxTap(); setErasing((e) => !e); }}
                  aria-label="Eraser"
                  aria-pressed={erasing}
                  className="grid place-items-center rounded-full"
                  style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: erasing ? "var(--sun)" : "#fffdf7" }}
                >
                  <Icon name="eraser" size={22} />
                </button>
                <button
                  onClick={clearAll}
                  disabled={!canClear}
                  aria-label="Clear the whole page"
                  className="grid place-items-center rounded-full disabled:opacity-40"
                  style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: "#fffdf7" }}
                >
                  <Icon name="trash" size={20} />
                </button>
              </div>
            </>
          )}
          </div>

          {/* the way in */}
          <InkButton
            tone="#8b46c7"
            seed={64}
            radius={22}
            onClick={bringToLife}
            disabled={empty}
            className="w-full font-display font-extrabold text-fs-xl !py-3 short:!py-2 landshort:w-auto landshort:shrink-0 landshort:!px-5 disabled:opacity-45"
            style={{ minHeight: "var(--tap-lg)" }}
          >
            <Icon name="sparkle" size={22} color="#ffe9a8" fill="#ffe9a8" />
            <span className="ink-on-wax">Bring it to life!</span>
            <Icon name="sparkle" size={22} color="#ffe9a8" fill="#ffe9a8" />
          </InkButton>
        </InkCard>
      </div>
    </div>
  );
}
