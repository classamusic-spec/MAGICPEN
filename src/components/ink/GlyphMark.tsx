// ─── A character drawn from its glyph skeleton ──────────────────────────────
// The letters a child traces are described as the strokes a hand makes, not as
// an outline. Drawing tiles and previews from those same strokes means the A on
// a picker tile is exactly the A they are about to write — a webfont's A is a
// different letterform, which is confusing at the age where the shape is the
// whole lesson.

import { ALL_GLYPHS, LOWER_GLYPHS, LOWER_BOX, GLYPH_BOX, SHAPE_GLYPHS, SHAPE_BOX } from "@/lib/glyphs";

export function GlyphMark({
  char, size = 42, color = "var(--ink)", weight = 9, className, style,
}: {
  char: string;
  /** Height in px; the glyph's 100×140 box keeps the width proportional. */
  size?: number;
  color?: string;
  weight?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  // shapes and lowercase have their own boxes; the tile shows exactly the shape
  // the child will trace
  const shape = SHAPE_GLYPHS[char];
  const lower = !shape && /^[a-z]$/.test(char) ? LOWER_GLYPHS[char] : undefined;
  const g = shape ?? lower ?? ALL_GLYPHS[char];
  const boxW = shape ? SHAPE_BOX.w : GLYPH_BOX.w;
  const boxH = shape ? SHAPE_BOX.h : lower ? LOWER_BOX.h : GLYPH_BOX.h;
  if (!g) {
    return (
      <span aria-hidden="true" className={`ink-title ${className ?? ""}`} style={{ fontSize: size, ...style }}>
        {char}
      </span>
    );
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size * (boxW / boxH)}
      height={size}
      viewBox={`0 0 ${boxW} ${boxH}`}
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      {g.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
