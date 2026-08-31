// ─── ErrorBoundary: the only thing standing between a bug and a white page ───
// Screens are code-split, and `React.lazy` *throws* when its chunk fails to
// download. That is not a rare event: the child leaves the app open, we deploy,
// the old hashed chunk 404s, and the next tap renders nothing at all. With no
// boundary that is a blank white screen and a four-year-old with no way out.
//
// So the fallback is a drawn page like every other page, with one enormous
// crayon button on it. Nothing technical is shown — the stack goes to the
// console, where a grown-up can find it, and never onto the paper.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Change this to clear a caught error and try rendering the children again —
   * pass whatever identifies "where the app is now" (here: the screen).
   *
   * Why a reload is still the button, and not this: React.lazy caches the
   * *rejected* promise for a failed chunk forever, so simply re-rendering the
   * same screen re-throws the identical error and the child is stuck in a loop
   * on the same page. Only a fresh document — new index.html, new chunk hashes
   * — actually recovers from the case this boundary exists for. The reset key
   * is for the other case: a screen that crashed once while the app state has
   * since moved on, which should not poison every screen after it.
   */
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** The reset key this state was last reconciled against. */
  lastKey: string | number | undefined;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, lastKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.lastKey) return null;
    // The app moved somewhere new under us: whatever broke belonged to the
    // screen we have just left, so let the new one have its turn.
    return { error: null, lastKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Grown-ups get the detail; the child gets a drawing.
    console.error("[drawlings] a screen crashed:", error);
    if (info.componentStack) console.error("[drawlings] component stack:", info.componentStack);
  }

  private handleRetry = () => {
    // A hard reload, not a re-render: see the note on `resetKey` above.
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="screen ink-paper grid place-items-center pad-x">
        <div
          role="alert"
          className="relative anim-pop-in"
          style={{ transform: "rotate(1.2deg)" }}
        >
          {/* taped to the page, so it is a sibling of the card — inside it the
              strip would be measured against the padded content box. */}
          <Tape
            seed={4}
            style={{
              width: 72, height: 23, top: -12, left: "50%",
              marginLeft: -36, transform: "rotate(-4deg)",
            }}
          />

          <InkCard
            seed={44}
            radius={20}
            className="px-6 py-6 w-[20rem] max-w-[86vw]"
            contentClassName="flex flex-col items-center text-center gap-1"
          >
            <span aria-hidden="true" className="anim-bob-tilt shrink-0">
              <Icon name="pencil" size={44} color="var(--plum)" weight={2.4} />
            </span>

            <h1 className="ink-title text-fs-2xl leading-tight mt-2">
              Oops! The crayon slipped.
            </h1>

            <span className="block w-36 max-w-full"><Scribble seed={31} height={10} /></span>

            <p className="ink-hand text-fs-md mt-1">
              Nothing is lost — your drawings are safe.
              <br />
              Tap the big button and we&rsquo;ll start again.
            </p>

            <InkButton
              tone="#00c2b9"
              seed={88}
              autoFocus
              onClick={this.handleRetry}
              className="w-full mt-4 font-display font-extrabold text-fs-xl"
              style={{ minHeight: "var(--tap-hero)" }}
            >
              <span className="ink-on-wax flex items-center justify-center gap-2">
                <Icon name="redo" size={24} color="#fffaf0" weight={2.4} />
                Try again
              </span>
            </InkButton>
          </InkCard>
        </div>
      </div>
    );
  }
}
