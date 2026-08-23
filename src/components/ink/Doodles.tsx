// ─── Drawn doodles ──────────────────────────────────────────────────────────
// The React face of the doodle set. The paths themselves live in
// `@/lib/doodles`, so the canvas sprite baker can use them without pulling a
// component into a lib module.

import { C, doodleParts } from "@/lib/doodles";

function doodlePaths(name: string, mono?: string) {
  return doodleParts(name).map((p, i) => (
    <path
      key={i}
      d={p.d}
      fill={mono ? "none" : p.fill ?? "none"}
      stroke={mono ?? p.c ?? C.ink}
      strokeWidth={p.w ?? 2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

/** A doodle drawn at any size. `mono` re-inks it in one colour, for wax. */
export function Doodle({
  name,
  size = 48,
  mono,
  className,
}: {
  name: string;
  size?: number;
  mono?: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", overflow: "visible" }}
    >
      {doodlePaths(name, mono)}
    </svg>
  );
}

export default Doodle;
