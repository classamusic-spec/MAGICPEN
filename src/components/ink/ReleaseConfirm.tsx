// ─── Letting a creature go: never silent, never one tap ─────────────────────
// The only irreversible thing a child can do in Magic Pen. It lived inside the
// world scene, which was fine while the world was the only place you could say
// goodbye; the sketchbook shelf can now do it too, and two confirmations that
// drift apart is exactly how one of them ends up missing a warning.
//
// The shape of it matters as much as the words:
//   · "Keep!" comes first and is the friendlier button, because a stray tap
//     from a small hand should land on the safe one.
//   · It says plainly that the drawing cannot come back. A child this age does
//     not infer permanence, so it has to be said.
//   · It scrolls itself into view — a destructive choice must never open below
//     the fold, where "Let go" is visible and "Keep!" is not.
//
// The app never says "delete". A creature goes off to explore.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { InkButton, InkShape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";

/** The "let go" wax, kept in step with the world's own palette. */
const GO_WAX = "#e0533f";

/**
 * Measured box, rounded so a press micro-resize doesn't redraw the hand.
 *
 * `clientWidth/Height`, never `getBoundingClientRect()`. This card can open
 * inside something that is still animating — the sketchbook's goodbye sheet
 * pops in from `scale(0.96)` — and a rect reports the *projected* size while a
 * transform is running. Worse, a transform never moves the layout box, so the
 * ResizeObserver has nothing to fire on afterwards and the too-small number
 * sticks: the hand-drawn border ends up as a little box beside the words
 * instead of a frame around them.
 */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth / 2) * 2;
      const h = Math.round(el.clientHeight / 2) * 2;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

export default function ReleaseConfirm({
  name, onKeep, onRelease,
}: { name: string; onKeep: () => void; onRelease: () => void }) {
  const [ref, box] = useBox<HTMLDivElement>();
  // a destructive choice must never open below the fold
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [ref]);
  return (
    <div ref={ref} className="relative isolate mt-4 mb-1 p-3 text-center">
      <InkShape
        w={box.w}
        h={box.h}
        seed={950}
        weight={3}
        lifted={false}
        ink="var(--coral)"
        fill={{ kind: "none" }}
      />
      <div className="relative">
        <p className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Really let {name} go?</p>
        <p className="ink-hand mb-2.5" style={{ fontSize: "var(--fs-2xs)" }}>This drawing can't come back.</p>
        <div className="grid grid-cols-2 gap-2">
          <InkButton seed={31} className="hud-focus" style={{ height: 50 }} onClick={onKeep}>
            <Icon name="heart" size={20} color="#2d2926" fill="#3aae3a" weight={2} />
            <span className="ink-title whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Keep!</span>
          </InkButton>
          <InkButton tone={GO_WAX} seed={97} className="hud-focus" style={{ height: 50 }} onClick={onRelease}>
            <Icon name="globe" size={20} color="#fff6e6" weight={2.2} />
            <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-md)" }}>Let go</span>
          </InkButton>
        </div>
      </div>
    </div>
  );
}
