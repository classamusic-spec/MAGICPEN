import { useEffect, useRef, useState, useCallback } from "react";
import type { Pt, Stroke } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxTap, sfxPop, sfxMagic } from "@/lib/audio";
import { extractDrawingFromPhoto } from "@/lib/photo";

const CRAYONS = [
  { c: "#e63b2e", name: "Cherry red" },
  { c: "#ff7a1a", name: "Orange" },
  { c: "#ffc72c", name: "Sunshine yellow" },
  { c: "#3aae3a", name: "Leaf green" },
  { c: "#00c2b9", name: "Lagoon" },
  { c: "#2f6fe4", name: "Ocean blue" },
  { c: "#8b46c7", name: "Grape" },
  { c: "#fb66e5", name: "Candy pink" },
  { c: "#7a4a21", name: "Cocoa brown" },
  { c: "#2d2926", name: "Licorice black" },
];

const SIZES = [
  { px: 5, label: "Thin" },
  { px: 10, label: "Medium" },
  { px: 17, label: "Thick" },
];

interface Props {
  prompt: string;
  onDone: (strokes: Stroke[]) => void;
  onPhoto: (photoData: string) => void;
  onBack: () => void;
}

export default function DrawScreen({ prompt, onDone, onPhoto, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [color, setColor] = useState(CRAYONS[5].c);
  const [size, setSize] = useState(SIZES[1].px);
  const [erasing, setErasing] = useState(false);
  const liveRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // parent snaps a paper drawing → lift it off the paper → magic reveal
  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const data = await extractDrawingFromPhoto(file);
      sfxMagic();
      onPhoto(data);
    } catch {
      // couldn't find a drawing — shake it off, stay on the draw screen
      if ("vibrate" in navigator) navigator.vibrate([40, 60, 40]);
      setPhotoBusy(false);
    }
  };
  strokesRef.current = strokes;

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokesRef.current.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1));
    if (liveRef.current) {
      const s = liveRef.current;
      drawCrayonStroke(ctx, s.pts, s.color, s.size, 999);
    }
  }, []);

  // resize canvas to fill wrapper
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); }, [strokes, redraw]);

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const eraseAt = (path: Pt[]) => {
    const radius = 22;
    setStrokes((prev) =>
      prev.filter((s) => {
        for (const q of path) {
          for (const p of s.pts) {
            if (Math.hypot(p.x - q.x, p.y - q.y) < radius + s.size / 2) return false;
          }
        }
        return true;
      })
    );
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    setUndone([]); // a fresh mark ends the redo trail
    if (erasing) {
      liveRef.current = { color: "", size: 0, pts: [p] };
      eraseAt([p]);
      return;
    }
    liveRef.current = { color, size, pts: [p] };
  };

  const onMove = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    const p = toLocal(e);
    const last = live.pts[live.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    live.pts.push(p);
    if (erasing) {
      eraseAt(live.pts.slice(-4));
    }
    redraw();
  };

  const onUp = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live || erasing) return;
    if (live.pts.length >= 2) {
      setStrokes((prev) => [...prev, live]);
    }
  };

  const empty = strokes.length === 0;
  const canUndo = strokes.length > 0;
  const canRedo = undone.length > 0;

  const undo = () => {
    if (!canUndo) return;
    setUndone((u) => [...u, strokes[strokes.length - 1]]);
    setStrokes(strokes.slice(0, -1));
    sfxPop();
  };

  const redo = () => {
    if (!canRedo) return;
    setStrokes([...strokes, undone[undone.length - 1]]);
    setUndone(undone.slice(0, -1));
    sfxTap();
  };

  const pickCrayon = (c: string) => { setColor(c); setErasing(false); sfxTap(); };
  const pickSize = (px: number) => { setSize(px); setErasing(false); sfxTap(); };

  return (
    <div className="screen paper-grain">
      <div className="stage-grid pad-x pad-t pad-b">
        {/* ── top bar: leave · history · photo ─────────────────────────── */}
        <div className="stage-top topbar">
          <div className="topbar-nav">
            <button
              onClick={() => { sfxTap(); onBack(); }}
              className="sticker-btn btn-icon bg-white text-ink font-black"
              aria-label="Back to home"
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              onClick={undo}
              disabled={!canUndo}
              className="sticker-btn btn-icon bg-white text-ink font-black"
              aria-label="Undo the last line"
            >
              <span aria-hidden="true">↩</span>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="sticker-btn btn-icon bg-white text-ink font-black"
              aria-label="Redo the line you undid"
            >
              <span aria-hidden="true">↪</span>
            </button>
          </div>

          <div className="topbar-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickPhoto}
            />
            <button
              onClick={() => { sfxTap(); fileRef.current?.click(); }}
              disabled={photoBusy}
              className="sticker-btn btn-icon bg-white"
              aria-label="Grown-ups: photograph a drawing on paper"
              title="Photograph a drawing on paper"
            >
              <span aria-hidden="true">{photoBusy ? "⏳" : "📷"}</span>
            </button>
          </div>

          <div className="topbar-prompt text-center">
            <h1
              key={prompt}
              className="sticker-btn anim-spring-pop chip chip-sun mx-auto max-w-full text-fs-md sm:text-fs-lg font-display font-extrabold px-4 py-1.5"
              style={{ cursor: "default" }}
            >
              <span className="truncate min-w-0">Draw {prompt}!</span>
              <span aria-hidden="true" className="anim-wiggle inline-block shrink-0">✏️</span>
            </h1>
          </div>
        </div>

        {/* ── the sheet ────────────────────────────────────────────────── */}
        <div
          ref={wrapRef}
          className="stage-canvas relative overflow-hidden sticker-card paper-sheet bg-paper-card"
        >
          <canvas
            ref={canvasRef}
            className="canvas-touch absolute inset-0 cursor-crosshair"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          />

          {/* eraser mode is impossible to miss: dashed coral frame + banner */}
          {erasing && (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-1 pointer-events-none"
                style={{ border: "4px dashed var(--coral)", borderRadius: "calc(var(--r-lg) - 4px)" }}
              />
              <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none px-2">
                <span className="chip chip-coral anim-pop-in shadow-ink-1">🧽 Rubbing out — tap a crayon to draw</span>
              </div>
            </>
          )}

          {empty && !erasing && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none px-4">
              <div className="text-center opacity-45">
                <div aria-hidden="true" className="text-5xl mb-2 anim-bob-tilt">🖍️</div>
                <p className="type-h3 text-plum">Draw right here</p>
                <p className="type-fine">anything you like!</p>
              </div>
            </div>
          )}
        </div>

        {/* ── tools ────────────────────────────────────────────────────── */}
        <div className="stage-tools toolbar">
          <div
            className="crayon-rail no-scrollbar"
            role="radiogroup"
            aria-label="Pick a crayon colour"
          >
            {CRAYONS.map((k) => {
              const active = !erasing && color === k.c;
              return (
                <button
                  key={k.c}
                  role="radio"
                  aria-checked={active}
                  aria-label={k.name}
                  title={k.name}
                  onClick={() => pickCrayon(k.c)}
                  className="sticker-btn swatch"
                  style={{ backgroundColor: k.c }}
                />
              );
            })}
          </div>

          <div className="tool-cluster">
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Crayon thickness">
              {SIZES.map((s) => {
                const active = size === s.px && !erasing;
                return (
                  <button
                    key={s.px}
                    role="radio"
                    aria-checked={active}
                    aria-label={`${s.label} line`}
                    title={`${s.label} line`}
                    onClick={() => pickSize(s.px)}
                    className={`sticker-btn btn-icon ${active ? "grad-sea text-white" : "bg-white text-ink"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="rounded-full bg-current block"
                      style={{ width: s.px, height: s.px }}
                    />
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => { setErasing(!erasing); sfxTap(); }}
              aria-pressed={erasing}
              aria-label={erasing ? "Eraser is on. Turn it off." : "Turn on the eraser"}
              className={`sticker-btn btn-icon ${erasing ? "bg-coral text-white is-on" : "bg-white"}`}
            >
              <span aria-hidden="true">🧽</span>
            </button>
          </div>

          <p aria-live="polite" className="visually-hidden">
            {erasing ? "Eraser on" : "Crayon on"}
          </p>
        </div>

        {/* ── the event ────────────────────────────────────────────────── */}
        <div className="stage-go">
          <button
            onClick={() => {
              if (empty) return;
              sfxPop();
              if ("vibrate" in navigator) navigator.vibrate(12);
              onDone(strokes);
            }}
            disabled={empty}
            className={`sticker-btn btn-pill btn-hero grad-magic w-full ${empty ? "" : "btn-sheen anim-breathe"}`}
          >
            {empty ? (
              <span className="text-fs-lg">Draw something first ✏️</span>
            ) : (
              <>
                <span aria-hidden="true" className="anim-sparkle">✨</span>
                MAKE IT ALIVE!
                <span aria-hidden="true" className="anim-sparkle" style={{ animationDelay: "0.5s" }}>✨</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
