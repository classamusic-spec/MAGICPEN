// The pet pointer and the drawn-treat shelf are both small, and both are the
// kind of small that quietly loses a child's things. These are the ways they
// could go wrong.

import { beforeEach, describe, expect, it } from "vitest";
import { loadPet, savePet, clearPet, loadFoods, saveFood, MAX_DRAWN_FOODS } from "./storage";
import type { Stroke } from "./types";

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

/** A storage that is full — every write throws, as Safari's private mode does. */
function fullStorage() {
  return {
    getItem: () => null,
    setItem: () => { throw new DOMException("QuotaExceededError"); },
    removeItem: () => { throw new DOMException("QuotaExceededError"); },
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

const stroke = (n = 1): Stroke =>
  ({ color: "#e63b2e", size: 8, pts: [{ x: n, y: n }, { x: n + 1, y: n + 1 }] } as Stroke);

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

describe("the pet pointer", () => {
  it("is absent until a pet is chosen", () => {
    expect(loadPet()).toBeNull();
  });

  it("remembers the chosen creature", () => {
    savePet("abc");
    expect(loadPet()?.id).toBe("abc");
  });

  it("keeps only one pet — choosing again replaces", () => {
    savePet("first");
    savePet("second");
    expect(loadPet()?.id).toBe("second");
  });

  it("forgets on release", () => {
    savePet("abc");
    clearPet();
    expect(loadPet()).toBeNull();
  });

  /* A dangling pointer is an ordinary state, not an error: the creature may
     have been released. It must never throw and never resurrect anything. */
  it("survives junk, half-written records and missing fields", () => {
    for (const junk of ['{{ not json', '"a string"', "null", "[]", "{}", '{"id":""}', '{"id":123}']) {
      localStorage.setItem("magicpen.pet.v1", junk);
      expect(() => loadPet()).not.toThrow();
      expect(loadPet()).toBeNull();
    }
  });

  it("fills in a missing timestamp rather than failing", () => {
    localStorage.setItem("magicpen.pet.v1", '{"id":"abc"}');
    const p = loadPet();
    expect(p?.id).toBe("abc");
    expect(typeof p?.since).toBe("number");
  });

  it("does not throw when the disk is full", () => {
    globalThis.localStorage = fullStorage();
    expect(() => savePet("abc")).not.toThrow();
    expect(() => clearPet()).not.toThrow();
  });
});

describe("treats the child drew", () => {
  it("starts empty", () => {
    expect(loadFoods()).toEqual([]);
  });

  it("keeps a drawn treat, with its strokes", () => {
    saveFood([stroke()]);
    const foods = loadFoods();
    expect(foods).toHaveLength(1);
    expect(foods[0].strokes).toHaveLength(1);
    expect(foods[0].id).toBeTruthy();
  });

  it("gives every treat its own id", () => {
    for (let i = 0; i < 4; i++) saveFood([stroke(i)]);
    const ids = new Set(loadFoods().map((f) => f.id));
    expect(ids.size).toBe(4);
  });

  /* A shelf, not a pantry. The newest are what a child wants to give again. */
  it("caps the shelf, dropping the oldest", () => {
    for (let i = 0; i < MAX_DRAWN_FOODS + 3; i++) saveFood([stroke(i)]);
    const foods = loadFoods();
    expect(foods).toHaveLength(MAX_DRAWN_FOODS);
    // the first three drawn are gone; the last one drawn is still here
    expect(foods[foods.length - 1].strokes[0].pts[0].x).toBe(MAX_DRAWN_FOODS + 2);
  });

  it("returns the newest last, so callers can arm what was just drawn", () => {
    saveFood([stroke(1)]);
    const after = saveFood([stroke(2)]);
    expect(after[after.length - 1].strokes[0].pts[0].x).toBe(2);
  });

  it("survives junk and half-written records", () => {
    for (const junk of ['{{ not json', '"a string"', "null", '{"a":1}', '[{"id":"x"}]', "[null]"]) {
      localStorage.setItem("magicpen.foods.v1", junk);
      expect(() => loadFoods()).not.toThrow();
      expect(Array.isArray(loadFoods())).toBe(true);
    }
  });

  it("does not throw when the disk is full", () => {
    globalThis.localStorage = fullStorage();
    expect(() => saveFood([stroke()])).not.toThrow();
  });
});
