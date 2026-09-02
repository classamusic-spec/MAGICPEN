// Android's hardware back is the one control the app does not draw, so it is
// the one a walkthrough cannot press. These are its rules, stated once.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACK_EVENT, handleBack, pushBackHandler } from "./native";

/* The handler stack is module state, so every test takes its registrations
   back — otherwise one test's open sheet is still open in the next. */
const pops: (() => void)[] = [];
const open = (fn: () => boolean) => { pops.push(pushBackHandler(fn)); };
afterEach(() => { while (pops.length) pops.pop()!(); });

/** A minimal window, since these tests run without a DOM. */
beforeEach(() => {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (t: string, fn: (e: Event) => void) => { (listeners[t] ??= []).push(fn); },
    removeEventListener: (t: string, fn: (e: Event) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn);
    },
    dispatchEvent: (e: Event & { type: string; defaultPrevented?: boolean }) => {
      let prevented = false;
      const ev = { ...e, type: e.type, preventDefault: () => { prevented = true; } } as unknown as Event;
      for (const fn of listeners[e.type] ?? []) fn(ev);
      return !prevented;
    },
  };
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    constructor(type: string) { this.type = type; }
  };
});

describe("the hardware back button", () => {
  it("falls through to the screen when nothing is open", () => {
    const seen = vi.fn();
    window.addEventListener(BACK_EVENT, seen);
    expect(handleBack()).toBe(false);   // nobody claimed it — the shell may exit
    expect(seen).toHaveBeenCalledOnce();
  });

  it("lets the screen keep the press by preventing the event", () => {
    window.addEventListener(BACK_EVENT, (e) => e.preventDefault());
    expect(handleBack()).toBe(true);
  });

  it("gives the press to the newest thing open", () => {
    const order: string[] = [];
    open(() => { order.push("under"); return true; });
    const pop = pushBackHandler(() => { order.push("over"); return true; });
    expect(handleBack()).toBe(true);
    expect(order).toEqual(["over"]);     // the sheet on top, not the one beneath
    pop();
    expect(handleBack()).toBe(true);
    expect(order).toEqual(["over", "under"]);
  });

  it("passes the press down when a handler declines it", () => {
    // this is what onboarding's first page does: it declines, so back leaves
    const under = vi.fn(() => true);
    open(under);
    open(() => false);
    expect(handleBack()).toBe(true);
    expect(under).toHaveBeenCalledOnce();
  });
});
