import { useEffect, useRef, useState, useCallback } from "react";
import type { Pt, Stroke } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxTap, sfxPop, sfxMagic } from "@/lib/audio";
import { extractDrawingFromPhoto } from "@/lib/photo";

const CRAYONS = [
  { c: "#e63b2e", name: "Cherry" },
  { c: "#ff7a1a", name: "Orange" },
  { c: "#ffc72c", name: "Sunshine" },
  { c: "#3aae3a", name: "Leaf" },
  { c: "#00c2b9", name: "Lagoon" },
  { c: "#2f6fe4", name: "Ocean" },
  { c: "#8b46c7", name: "Grape" },
  { c: "#fb66e5", name: "Candy" },
  { c: "#7a4a21", name: "Cocoa" },
  { c: "#2d2926", name: "Licorice" },
];

const SIZES = [
  { px: 5, label: "S" },
  { px: 10, label: "M" },
  { px: 17, label: "L" },
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

  return (
    <div className="h-full flex flex-col paper-grain">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => { sfxTap(); onBack(); }}
          className="sticker-btn bg-white rounded-full w-11 h-11 grid place-items-center text-xl font-black"
          aria-label="Back"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <div key={prompt} className="inline-block sticker-btn anim-spring-pop bg-[var(--sun)] rounded-full px-5 py-1.5 font-display font-bold text-lg text-[var(--ink)]">
            Draw {prompt}! <span className="anim-wiggle inline-block">✏️</span>
          </div>
        </div>
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
          className="sticker-btn bg-white rounded-full w-11 h-11 grid place-items-center text-xl"
          aria-label="Photo of a paper drawing"
          title="Use a photo of a paper drawing"
        >
          {photoBusy ? "⏳" : "📷"}
        </button>
      </div>

      {/* canvas */}
      <div ref={wrapRef} className="flex-1 relative mx-3 mb-2 rounded-3xl overflow-hidden sticker-card">
        <canvas
          ref={canvasRef}
          className="canvas-touch absolute inset-0 cursor-crosshair bg-[#fffdf7]"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
        {empty && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center opacity-40 font-display text-2xl font-bold text-[var(--plum)]">
              <div className="text-5xl mb-2">🖍️</div>
              scribble anything…
            </div>
          </div>
        )}
      </div>

      {/* tool tray */}
      <div className="px-4 pb-4 pt-1">
        <div className="flex items-end justify-between gap-3">
          {/* crayons */}
          <div className="flex flex-wrap gap-2 max-w-[46%] items-center">
            {CRAYONS.map((k) => {
              const active = !erasing && color === k.c;
              return (
                <button
                  key={k.c}
                  aria-label={k.name}
                  title={k.name}
                  onClick={() => { setColor(k.c); setErasing(false); sfxTap(); }}
                  className="sticker-btn w-9 h-9 rounded-full"
                  style={{
                    background: k.c,
                    transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.12s",
                    transform: active ? "scale(1.3) rotate(-8deg)" : undefined,
                    boxShadow: active ? "0 5px 0 var(--ink), 0 0 0 3px #fff inset" : undefined,
                  }}
                />
              );
            })}
          </div>

          {/* sizes + eraser + undo */}
          <div className="flex items-center gap-2">
            {SIZES.map((s) => (
              <button
                key={s.px}
                onClick={() => { setSize(s.px); setErasing(false); sfxTap(); }}
                className={`sticker-btn rounded-full grid place-items-center bg-white ${
                  size === s.px && !erasing ? "!bg-[var(--teal)] text-white" : ""
                }`}
                style={{ width: 36 + s.px, height: 36 + s.px }}
              >
                <span className="rounded-full bg-current" style={{ width: s.px, height: s.px, display: "block", color: size === s.px && !erasing ? "#fff" : "#2d2926", background: "currentColor" }} />
              </button>
            ))}
            <button
              onClick={() => { setErasing(!erasing); sfxTap(); }}
              className={`sticker-btn w-11 h-11 rounded-full grid place-items-center text-xl bg-white ${erasing ? "!bg-[var(--coral)]" : ""}`}
              aria-label="Eraser"
            >
              🧽
            </button>
            <button
              onClick={() => { setStrokes((p) => p.slice(0, -1)); sfxPop(); }}
              disabled={empty}
              className="sticker-btn w-11 h-11 rounded-full grid place-items-center text-xl bg-white"
              aria-label="Undo"
            >
              ↩️
            </button>
          </div>
        </div>

        {/* magic button */}
        <button
          onClick={() => {
            if (!empty) {
              sfxPop();
              if ("vibrate" in navigator) navigator.vibrate(12);
              onDone(strokes);
            }
          }}
          disabled={empty}
          className={`sticker-btn mt-3 w-full rounded-full py-4 font-display font-extrabold text-2xl text-white tracking-wide ${
            empty ? "" : "btn-sheen anim-glow-pulse"
          }`}
          style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5 60%,#ffc72c 130%)" }}
        >
          ✨ MAKE IT ALIVE! ✨
        </button>
      </div>
    </div>
  );
}
