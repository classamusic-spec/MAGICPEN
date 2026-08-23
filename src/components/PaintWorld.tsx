// ─── Paint World: the easel for the child's own world ───────────────────────
// A full-page canvas where the child paints a background — sky, ground, a sun,
// water, anything. One extra idea beyond drawing: a draggable ground line, so
// the world knows where creatures should stand. "Bring it to life!" hands the
// drawing to WorldScene, which makes it breathe and adds a glow to a sun and a
// shimmer to water.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DreamWorld, Pt, Stroke } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxTap, sfxMagic, sfxPop } from "@/lib/audio";
import { InkButton, InkCard } from "@/components/ink/Ink";
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
  const liveRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);

  const [strokes, setStrokes] = useState<Stroke[]>(
    () => (initial?.strokes ? initial.strokes.map((s) => ({ ...s, pts: [...s.pts] })) : []),
  );
  const [color, setColor] = useState(CRAYONS[0].c);
  const [size, setSize] = useState(SIZES[1].px);
  const [erasing, setErasing] = useState(false);
  const [ground, setGround] = useState(initial?.ground ?? 0.78);
  const [draggingGround, setDraggingGround] = useState(false);
  const [sheet, setSheet] = useState({ w: 0, h: 0 });

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokesRef.current.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1));
    if (liveRef.current) drawCrayonStroke(ctx, liveRef.current.pts, liveRef.current.color, liveRef.current.size, 999);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      setSheet((p) => (p.w === w && p.h === h ? p : { w, h }));
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => { strokesRef.current = strokes; redraw(); }, [strokes, redraw]);

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    if (erasing) { liveRef.current = { color: "", size: 0, pts: [p] }; eraseAt([p]); return; }
    liveRef.current = { color, size, pts: [p] };
  };
  const onMove = (e: React.PointerEvent) => {
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
    const live = liveRef.current;
    liveRef.current = null;
    if (!live || erasing) return;
    if (live.pts.length >= 2) { sfxPop(); setStrokes((prev) => [...prev, live]); }
    else redraw();
  };

  const undo = () => {
    setStrokes((prev) => {
      if (!prev.length) return prev;
      sfxTap();
      return prev.slice(0, -1);
    });
  };
  const clearAll = () => { if (strokes.length) { sfxTap(); setStrokes([]); } };

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

  const bringToLife = () => {
    if (!strokes.length) return;
    sfxMagic();
    onDone({ rev: Date.now(), dw: sheet.w, dh: sheet.h, ground, strokes });
  };

  const empty = strokes.length === 0;

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
          <h1 className="ink-title text-fs-lg leading-none truncate">Paint your world</h1>
          <p className="ink-hand text-fs-2xs truncate">a sky, the ground, a sun — anything!</p>
        </div>
        <InkButton
          seed={21}
          radius={16}
          onClick={undo}
          disabled={empty}
          aria-label="Undo the last stroke"
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

        {/* first-time hint */}
        {empty && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none px-6 text-center">
            <p className="ink-hand text-fs-lg" style={{ color: "rgba(45,41,38,0.45)" }}>
              Draw your world here!<br />The sky, the ground, a sun…
            </p>
          </div>
        )}

        {/* ── the draggable ground line ── */}
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: `${ground * 100}%`, transform: "translateY(-50%)" }}
          aria-hidden="true"
        >
          <div style={{ height: 0, borderTop: "3px dashed rgba(86,62,121,0.55)" }} />
        </div>
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
      </div>

      {/* ── toolbar ── */}
      <div className="relative z-20 pad-x" style={{ paddingBottom: "max(8px, var(--safe-b))" }}>
        <InkCard seed={44} radius={20} className="p-2 short:p-1.5" contentClassName="flex flex-col gap-2 short:gap-1">
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
              disabled={empty}
              aria-label="Clear the whole page"
              className="grid place-items-center rounded-full disabled:opacity-40"
              style={{ width: "var(--tap)", height: "var(--tap)", border: "3px solid var(--ink)", background: "#fffdf7" }}
            >
              <Icon name="trash" size={20} />
            </button>
          </div>

          {/* the way in */}
          <InkButton
            tone="#8b46c7"
            seed={64}
            radius={22}
            onClick={bringToLife}
            disabled={empty}
            className="w-full font-display font-extrabold text-fs-xl !py-3 short:!py-2 disabled:opacity-45"
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
