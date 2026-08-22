import { useEffect, useRef, useState } from "react";
import { drawCrayonStroke } from "@/lib/crayon";
import { sfxMagic } from "@/lib/audio";

/** A golden squiggle that draws itself, then sparkles into a fish shape. */
function AutoDrawing() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const W = 320, H = 220;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d")!;

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

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = ((now - t0) % 4200) / 4200;
      const drawP = Math.min(1, t / 0.55);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const n = Math.max(2, Math.floor(path.length * drawP));
      const wob = drawP >= 1 ? Math.sin(now / 300) * 3 : 0;
      const pts = path.slice(0, n).map((p, i) => ({ x: p.x, y: p.y + Math.sin(i * 0.4 + now / 280) * (drawP >= 1 ? wob : 0) }));
      drawCrayonStroke(ctx, pts, "#f5a623", 7, 42);
      if (drawP >= 1) {
        // eye
        ctx.fillStyle = "#2d2926";
        ctx.beginPath();
        ctx.arc(115, 102 + wob * 0.4, 5, 0, Math.PI * 2);
        ctx.fill();
        // sparkle
        const sa = (Math.sin(now / 200) + 1) / 2;
        ctx.globalAlpha = 0.4 + sa * 0.6;
        ctx.font = "26px serif";
        ctx.fillText("✨", 268, 60);
        ctx.fillText("✨", 40, 180);
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} />;
}

export default function Splash({ onStart }: { onStart: () => void }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setLine(1), 500);
    const t2 = setTimeout(() => setLine(2), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="h-full paper-grain flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      {/* floating stickers */}
      <span className="absolute text-4xl anim-float-y" style={{ left: "8%", top: "12%" }}>🐠</span>
      <span className="absolute text-4xl anim-float-y" style={{ right: "10%", top: "18%", animationDelay: "0.8s" }}>🚀</span>
      <span className="absolute text-4xl anim-float-y" style={{ left: "12%", bottom: "16%", animationDelay: "1.4s" }}>🦋</span>
      <span className="absolute text-4xl anim-float-y" style={{ right: "12%", bottom: "22%", animationDelay: "0.4s" }}>🌸</span>

      <div className="sticker-card px-6 py-4 rotate-[-2deg] anim-spring-pop">
        <h1 className="font-display font-extrabold text-5xl sm:text-6xl tracking-tight">
          {["M", "A", "G", "I", "C", "", "P", "E", "N"].map((ch, i) =>
            ch === "" ? (
              <span key={i} className="inline-block w-3" />
            ) : (
              <span
                key={i}
                className="anim-letter"
                style={{
                  color: ["#e63b2e", "#ff7a1a", "#ffc72c", "#3aae3a", "#2f6fe4", "", "#8b46c7", "#fb66e5", "#00c2b9"][i],
                  animationDelay: `${i * 0.18}s`,
                }}
              >
                {ch}
              </span>
            )
          )}
        </h1>
      </div>

      <div className="mt-4 anim-pop-in" style={{ animationDelay: "0.15s" }}>
        <AutoDrawing />
      </div>

      <div className="max-w-md mt-2 space-y-2 font-semibold text-lg text-[var(--plum)]">
        <p className={`transition-opacity duration-700 ${line >= 1 ? "opacity-100" : "opacity-0"}`}>
          Long ago, a boy named <b>Ma Liang</b> had a magic brush.
        </p>
        <p className={`transition-opacity duration-700 ${line >= 2 ? "opacity-100" : "opacity-0"}`}>
          Everything he drew… <b className="text-[var(--coral)]">came ALIVE.</b> Now the brush is yours. 🪄
        </p>
      </div>

      <button
        onClick={() => { sfxMagic(); onStart(); }}
        className="sticker-btn btn-sheen anim-glow-pulse mt-8 rounded-full px-10 py-4 font-display font-extrabold text-2xl text-white anim-pop-in"
        style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5 60%,#ffc72c 140%)", animationDelay: "0.3s" }}
      >
        ✨ Start the Magic ✨
      </button>
    </div>
  );
}
