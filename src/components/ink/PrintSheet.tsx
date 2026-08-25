// ─── For the fridge ─────────────────────────────────────────────────────────
// The thing every parent actually wants out of a drawing app: the drawing, on
// paper, at a size worth taping up. Everything else Magic Pen makes is a
// picture on a screen that a grandparent never sees.
//
// This prints *the drawing*, not a screenshot — the strokes are re-drawn at
// print resolution onto paper stock, so it comes out as art rather than as a
// photograph of an app. A doodle-bodied creature prints its doodle; a creature
// with neither prints its name, because a page with a name on it is still
// worth keeping.
//
// Printing is a door out of the device, so the way in sits behind the same
// grown-up question as the camera and the share sheet.

import { useEffect, useRef } from "react";
import type { Stroke } from "@/lib/types";
import { drawCrayonStroke, normalizeStrokes } from "@/lib/crayon";
import { paperTile } from "@/lib/ink";

/** Print at a size that stays crisp on paper rather than on a screen. */
const PX = 1000;

export default function PrintSheet({
  name,
  subtitle,
  strokes,
  onClose,
}: {
  name: string;
  subtitle: string;
  strokes: Stroke[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cv.width = PX;
    cv.height = PX;

    // warm stock, the same paper the rest of the app is drawn on
    ctx.fillStyle = "#fdf6e8";
    ctx.fillRect(0, 0, PX, PX);
    const fibre = new Image();
    fibre.onload = () => {
      const pat = ctx.createPattern(fibre, "repeat");
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, PX, PX); }
      paint();
    };
    fibre.onerror = () => paint();
    fibre.src = paperTile();

    function paint() {
      if (!ctx || !strokes.length) return;
      const norm = normalizeStrokes(strokes, PX * 0.78);
      ctx.save();
      // `normalizeStrokes` centres on the origin, so this lands it mid-page
      ctx.translate(PX / 2, PX / 2);
      norm.strokes.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1, 1));
      ctx.restore();
    }
  }, [strokes]);

  /* Print once the sheet is on screen, and close when the dialog goes away —
     `afterprint` fires whether the grown-up printed or cancelled, so there is
     no state to get stuck in. */
  useEffect(() => {
    const done = () => onClose();
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 350);
    return () => {
      window.removeEventListener("afterprint", done);
      window.clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div className="print-sheet" role="dialog" aria-modal="true" aria-label={`Print ${name}`}>
      <style>{`
        /* On screen this is an ordinary preview over the app. On paper it is
           the only thing that exists — everything else is taken out rather
           than hidden behind it, so no stray shadow or scrollbar prints. */
        .print-sheet {
          position: fixed; inset: 0; z-index: 90;
          display: grid; place-items: center; gap: 12px;
          padding: 20px; overflow-y: auto;
          background: rgba(45,41,38,0.55);
        }
        .print-paper {
          background: #fdf6e8; padding: 18px; border-radius: 6px;
          max-width: 560px; width: 100%; text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
        .print-paper canvas { width: 100%; height: auto; display: block; }
        .print-name { font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 30px; margin: 10px 0 2px; color: #2d2926; }
        .print-sub  { font-family: "Nunito", sans-serif; font-size: 15px; color: #6b6560; margin: 0 0 4px; }
        @media print {
          /* the app disappears; the drawing is the page */
          body > *:not(.print-sheet-host) { display: none !important; }
          .print-sheet { position: static; background: none; padding: 0; display: block; }
          .print-paper { box-shadow: none; max-width: none; border-radius: 0; padding: 0; }
          .print-hide { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="print-paper">
        <canvas ref={ref} aria-hidden="true" />
        <p className="print-name">{name}</p>
        <p className="print-sub">{subtitle}</p>
        <p className="print-sub">drawn with Magic Pen</p>
      </div>

      <button
        className="print-hide"
        onClick={onClose}
        style={{
          minHeight: 48, padding: "0 22px", borderRadius: 14,
          background: "#fffdf7", border: "2.5px solid #2d2926",
          fontFamily: '"Baloo 2", sans-serif', fontWeight: 700, fontSize: 17,
        }}
      >
        Done
      </button>
    </div>
  );
}
