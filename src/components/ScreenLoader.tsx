// ─── ScreenLoader: the page while the next screen is still on its way ────────
// Screens are fetched on demand now, so on a slow tablet there is a real gap
// between a tap and the next screen appearing. A blank second reads as broken
// to a four-year-old, so the gap gets a drawn page of its own: a taped-in card
// on the same paper, in the same ink, with three crayon dots ticking.
//
// Deliberately *not* a spinner. A spinner would be the only un-drawn thing in
// the product, and it would be the first thing the child sees when the app is
// at its slowest.
//
// This file is eagerly bundled with the entry chunk on purpose — a fallback
// that had to be downloaded before it could be shown would be no fallback.

import { InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";

/** The three crayons the dots are coloured with, left to right. */
const DOTS = ["var(--crayon-sun)", "var(--crayon-candy)", "var(--crayon-lagoon)"];

export default function ScreenLoader() {
  return (
    <div className="screen ink-paper grid place-items-center pad-x">
      <div
        role="status"
        aria-live="polite"
        className="relative anim-pop-in"
        style={{ transform: "rotate(-1.5deg)" }}
      >
        {/* the tape is a sibling of the card, not a child: inside the card it
            would be positioned against the padded content box and land on the
            paper instead of over its torn top edge. */}
        <Tape
          seed={2}
          style={{
            width: 68, height: 22, top: -11, left: "50%",
            marginLeft: -34, transform: "rotate(3.5deg)",
          }}
        />

        <InkCard
          seed={57}
          radius={20}
          className="px-6 py-5 w-[19.5rem] max-w-[86vw]"
          contentClassName="flex flex-col items-center text-center gap-1"
        >
          <span aria-hidden="true" className="anim-sparkle shrink-0">
            <Icon name="sparkle" size={54} color="var(--sun)" fill="var(--sun)" />
          </span>

          {/* one line at every width the app supports — a title that breaks
              after "the" reads as a wrapping accident, and this is the first
              thing a child sees when the app is at its slowest */}
          <p className="ink-title text-fs-lg leading-tight mt-1 text-nowrap">
            warming up the magic…
          </p>

          <span className="block w-28 max-w-full"><Scribble seed={19} height={9} /></span>

          <p className="ink-hand text-fs-sm">nearly there!</p>

          {/* three crayon dots, ticking one after another */}
          <span aria-hidden="true" className="flex items-center gap-2 mt-2">
            {DOTS.map((tone, i) => (
              <span
                key={tone}
                className="anim-sparkle block rounded-full"
                style={{
                  width: 13,
                  height: 13,
                  background: tone,
                  border: "2.5px solid var(--ink)",
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </span>
        </InkCard>
      </div>
    </div>
  );
}
