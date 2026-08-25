// ─── PickTray: a sheet of paper laid over the room ──────────────────────────
// The magic-stamp tray turned out to be the right shape for every "pick one of
// these" moment a child has — stamps, treats, and whatever comes next. It was
// written inside DrawScreen's private stylesheet, so the second use would have
// been a copy-paste of forty lines of CSS and a hand-rolled dialog. This is
// that tray, lifted out once so both uses share one behaviour.
//
// What it carries with it, all of which is easy to get wrong a second time:
// a real dialog (`role`/`aria-modal`/labelled title), Escape and scrim-click to
// close, a grid that scrolls rather than spilling sideways on a 320px phone,
// tap targets a small hand can hit, and motion that respects the reduced-motion
// switch.

import { useEffect, useId, type ReactNode } from "react";
import { InkButton, InkCard, Scribble } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { seedOf } from "@/lib/ink";

export interface PickTile {
  /** Stable key, and the seed for this tile's hand-drawn wobble. */
  id: string;
  /** What a screen reader announces. */
  label: string;
  /** The caption under the art. */
  name: string;
  /** The art itself — usually a `<Doodle>`. */
  art: ReactNode;
}

export default function PickTray({
  title,
  tiles,
  onPick,
  onClose,
  closeLabel = "Close",
  footer,
}: {
  title: string;
  tiles: PickTile[];
  onPick: (id: string) => void;
  onClose: () => void;
  /** Screen-reader label for the close button, e.g. "Close stamps". */
  closeLabel?: string;
  /** Optional extra tile-row content, e.g. a "draw your own" button. */
  footer?: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const titleId = useId();

  // Escape closes. Bound only while open, because this component only exists
  // while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`pick-scrim ${reduced ? "" : "pick-scrim-in"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <InkCard
        seed={57}
        radius={22}
        className={`pick-card ${reduced ? "" : "pick-card-in"}`}
        contentClassName="pick-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pick-head">
          <div className="pick-heading">
            <h2 id={titleId} className="ink-title pick-title">{title}</h2>
            <Scribble color="var(--sun)" height={9} seed={seedOf(title)} />
          </div>
          <InkButton
            onClick={onClose}
            shape="ellipse"
            seed={22}
            aria-label={closeLabel}
            style={{ width: 50, height: 50, flex: "0 0 auto" }}
          >
            <Icon name="close" size={22} />
          </InkButton>
        </div>

        <div className="pick-grid no-scrollbar">
          {tiles.map((t, i) => (
            <InkButton
              key={t.id}
              onClick={() => onPick(t.id)}
              aria-label={t.label}
              seed={seedOf(t.id)}
              radius={14}
              className={`pick-tile ${reduced ? "" : "pick-tile-in"}`}
              style={reduced ? undefined : { animationDelay: `${i * 24}ms` }}
            >
              <span className="pick-tileinner">
                <span className="pick-thumb">{t.art}</span>
                <span className="pick-name ink-hand" aria-hidden="true">{t.name}</span>
              </span>
            </InkButton>
          ))}
          {footer}
        </div>
      </InkCard>
    </div>
  );
}
