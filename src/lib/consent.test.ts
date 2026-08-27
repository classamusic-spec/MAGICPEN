// The parental gate stands in front of the doors that lead out of the app —
// sharing and printing — so its failure modes matter more than its happy path.
// Every test here is a way a young child could get through it, or a way a
// grown-up's one pass could be forgotten.

import { beforeEach, describe, expect, it } from "vitest";
import { loadConsent, saveConsent, makeGateChallenge } from "./consent";

/** A tiny localStorage stand-in — the module must work in a plain node test. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

describe("the gate-passed flag defaults to no", () => {
  it("says no before the gate has ever been passed", () => {
    expect(loadConsent().gatePassed).toBe(false);
  });

  it("says no when storage holds nonsense", () => {
    localStorage.setItem("magicpen.consent.v1", "{{ not json");
    expect(loadConsent().gatePassed).toBe(false);
  });

  it("says no for any value that is not exactly true", () => {
    for (const v of ['"yes"', "1", "null", '{"nested":true}']) {
      localStorage.setItem("magicpen.consent.v1", `{"gatePassed":${v}}`);
      expect(loadConsent().gatePassed).toBe(false);
    }
  });

  it("says no when storage throws entirely", () => {
    globalThis.localStorage = {
      getItem() { throw new Error("private mode"); },
      setItem() { throw new Error("private mode"); },
      removeItem() {}, clear() {}, key: () => null, length: 0,
    } as unknown as Storage;
    expect(loadConsent().gatePassed).toBe(false);
  });
});

describe("passing the gate is remembered", () => {
  it("turns on only when set explicitly", () => {
    expect(loadConsent().gatePassed).toBe(false);
    saveConsent({ gatePassed: true });
    expect(loadConsent().gatePassed).toBe(true);
  });

  it("records when the gate was passed", () => {
    saveConsent({ gatePassed: true });
    expect(loadConsent().decidedAt).toBeGreaterThan(0);
  });
});

describe("the parental gate is actually a gate", () => {
  // a deterministic 'random' so the assertions are stable
  const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

  it("asks something a pre-reader cannot read or compute", () => {
    const c = makeGateChallenge(seq([0.2, 0.6, 0.1, 0.9, 0.4, 0.3]));
    // numbers are spelled out, never numerals — a child who knows digits is
    // still stopped by the words
    expect(c.prompt).toMatch(/^What is [a-z]+ times [a-z]+\?$/);
    expect(c.prompt).not.toMatch(/\d/);
  });

  it("always offers exactly four distinct options, one of them right", () => {
    for (let i = 0; i < 200; i++) {
      const c = makeGateChallenge();
      expect(c.options).toHaveLength(4);
      expect(new Set(c.options).size).toBe(4);
      expect(c.options).toContain(c.answer);
      expect(c.options.every((o) => o > 0)).toBe(true);
    }
  });

  it("cannot be beaten by always picking the largest or the smallest", () => {
    let biggestWins = 0, smallestWins = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const c = makeGateChallenge();
      if (Math.max(...c.options) === c.answer) biggestWins++;
      if (Math.min(...c.options) === c.answer) smallestWins++;
    }
    // a child tapping the biggest number every time must not sail through
    expect(biggestWins).toBeLessThan(N * 0.6);
    expect(smallestWins).toBeLessThan(N * 0.6);
  });

  it("does not put the answer in the same slot every time", () => {
    const slots = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const c = makeGateChallenge();
      slots.add(c.options.indexOf(c.answer));
    }
    expect(slots.size).toBeGreaterThan(1);
  });

  it("keeps the arithmetic genuinely adult — never a trivial product", () => {
    for (let i = 0; i < 200; i++) {
      const c = makeGateChallenge();
      expect(c.answer).toBeGreaterThanOrEqual(12);  // 3x4 at the very least
    }
  });
});
