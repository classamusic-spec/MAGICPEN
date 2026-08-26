// ─── The parental gate ───────────────────────────────────────────────────────
// One question stands between a four-year-old and the only switch in Magic Pen
// that sends anything off this device. It is not a confirmation dialog and it
// is not an age question — a child taps "yes, I'm a grown-up" without pausing,
// and both app stores treat that as no gate at all.
//
// What is accepted is a challenge an adult reads at a glance and a young child
// genuinely cannot pass: a two-digit product with both numbers spelled out in
// words. A pre-reader cannot read "seven times six"; an early reader still
// cannot multiply. The challenge itself is built in @/lib/consent — this file
// only asks it.
//
// The other half of the design is what happens on a wrong answer. Four options
// means a one-in-four guess, so a child tapping at random gets through in a few
// tries if the same question waits for them. It doesn't: every miss re-rolls a
// completely fresh challenge, which turns guessing back into guessing from
// scratch. And the miss is never scolded — a child who wanders in here has done
// nothing wrong, and a grown-up who mis-taps deserves the same courtesy.

import { useEffect, useId, useRef, useState } from "react";
import { makeGateChallenge } from "@/lib/consent";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { sfxTap } from "@/lib/audio";

export default function ParentGate({ title, onPass, onCancel }: {
  /** Why we're asking, e.g. "Print this drawing?" */
  title: string;
  onPass: () => void;
  onCancel: () => void;
}) {
  // Lazily, so the challenge is built once per attempt rather than on every
  // render — a question that changes while you read it is unanswerable.
  const [challenge, setChallenge] = useState(() => makeGateChallenge());
  const [missed, setMissed] = useState(false);
  const headingId = useId();
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  // Focus lands on the first option, and returns there on every re-roll: the
  // options have all changed underneath, so keyboard focus starts over too.
  useEffect(() => { firstOptionRef.current?.focus(); }, [challenge]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const answer = (value: number) => {
    sfxTap();
    if (value === challenge.answer) { onPass(); return; }
    setMissed(true);
    setChallenge(makeGateChallenge());
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      style={{ background: "rgba(45,41,38,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={onCancel}
    >
      <InkCard
        seed={53}
        radius={22}
        className="w-full max-w-sm p-5 pt-6 my-auto anim-pop-in"
        contentClassName="grid gap-3 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Tape seed={3} style={{ width: 78, height: 24, top: -12, left: 22, transform: "rotate(-7deg)" }} />
        <Tape seed={1} style={{ width: 78, height: 24, top: -12, right: 22, transform: "rotate(6deg)" }} />

        <div className="grid place-items-center gap-1">
          <Icon name="lock" size={26} color="var(--plum)" weight={2.3} />
          <h2 id={headingId} className="ink-title text-fs-xl">Ask a grown-up</h2>
          <span className="block w-28"><Scribble seed={19} height={9} /></span>
          <p className="ink-hand text-fs-sm mt-1">{title}</p>
        </div>

        <p className="ink-title text-fs-2xl leading-tight" style={{ color: "var(--ink)" }}>
          {challenge.prompt}
        </p>

        {/* Kind and neutral, and only after a miss — nothing is "wrong" here. */}
        <p className="ink-hand text-fs-xs" aria-live="polite" style={{ minHeight: "1.2em" }}>
          {missed ? "Not quite — try this one." : " "}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {challenge.options.map((opt, i) => (
            // Keyed by the challenge too: a re-roll should mount fresh buttons
            // rather than swap numbers under a finger already on its way down.
            <InkButton
              key={`${challenge.prompt}-${opt}`}
              ref={i === 0 ? firstOptionRef : undefined}
              seed={opt * 3 + 11}
              radius={16}
              onClick={() => answer(opt)}
              className="ink-title text-fs-xl tabular-nums"
              style={{ minHeight: "var(--tap-lg)" }}
            >
              {String(opt)}
            </InkButton>
          ))}
        </div>

        <InkButton
          seed={41}
          radius={16}
          onClick={() => { sfxTap(); onCancel(); }}
          className="ink-hand text-fs-sm mt-1"
          style={{ minHeight: "var(--tap)" }}
        >
          <Icon name="close" size={18} color="var(--ink-soft)" weight={2.3} />
          <span>Cancel</span>
        </InkButton>
      </InkCard>
    </div>
  );
}
