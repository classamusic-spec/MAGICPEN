// The album is the only place a released drawing still exists, so the ways it
// could quietly lose one — or quietly grow until it takes the sketchbook down
// with it — are what these cover.

import { beforeEach, describe, expect, it } from "vitest";
import { loadAlbum, remember, forget, entryOf, hasArt, canReplay, MAX_ALBUM } from "./album";
import type { Creature, Stroke } from "./types";

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
const fullStorage = () => ({
  getItem: () => null,
  setItem: () => { throw new DOMException("QuotaExceededError"); },
  removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage);

const stroke = (n = 1): Stroke =>
  ({ color: "#e63b2e", size: 8, pts: [{ x: n, y: n }, { x: n + 1, y: n + 1 }] } as Stroke);

function creature(id: string, over: Partial<Creature> = {}): Creature {
  return {
    id, kindId: "fish", name: id, strokes: [stroke()], createdAt: 1,
    wx: 0.5, wy: 0.5, dir: 1, speed: 0.03, phase: 0, scale: 1, ...over,
  };
}

beforeEach(() => { globalThis.localStorage = fakeStorage(); });

describe("remembering", () => {
  it("starts empty", () => expect(loadAlbum()).toEqual([]));

  it("keeps a drawing and its strokes", () => {
    remember(creature("a"));
    const [e] = loadAlbum();
    expect(e.id).toBe("a");
    expect(e.strokes).toHaveLength(1);
  });

  /* A rename must not make a second sticker of the same drawing. */
  it("updates in place rather than duplicating", () => {
    remember(creature("a", { name: "Bubbles" }));
    remember(creature("a", { name: "Splash" }));
    const all = loadAlbum();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Splash");
  });

  it("keeps the newest when the book is full", () => {
    for (let i = 0; i < MAX_ALBUM + 5; i++) remember(creature(`c${i}`));
    const all = loadAlbum();
    expect(all).toHaveLength(MAX_ALBUM);
    expect(all.some((e) => e.id === "c0")).toBe(false);          // oldest gone
    expect(all.some((e) => e.id === `c${MAX_ALBUM + 4}`)).toBe(true); // newest kept
  });

  it("forgets one sticker without touching the rest", () => {
    remember(creature("a")); remember(creature("b"));
    expect(forget("a").map((e) => e.id)).toEqual(["b"]);
  });

  it("forgetting an unknown id is a no-op", () => {
    remember(creature("a"));
    expect(forget("nobody")).toHaveLength(1);
  });
});

/* The trap this file exists to avoid: a hot array carrying base64, which would
   crowd the quota and take the sketchbook down with it. The album keeps strokes
   and ids only — never a baked image. */
describe("never stores an image", () => {
  it("remembers a doodle body by id, not as a picture", () => {
    const e = entryOf(creature("d", { doodleId: "crab", strokes: [] }));
    expect(e.doodleId).toBe("crab");
    expect(e.strokes).toEqual([]);
  });

  it("keeps no base64 anywhere in what is written to storage", () => {
    remember(creature("a"));
    remember(creature("d", { doodleId: "crab", strokes: [] }));
    expect(localStorage.getItem("magicpen.album.v1")).not.toContain("base64");
  });
});

describe("what a sticker can do", () => {
  it("a real drawing can be replayed", () => {
    expect(canReplay(entryOf(creature("a")))).toBe(true);
  });

  it("a stamp can be drawn but not replayed — there are no strokes to play", () => {
    const e = entryOf(creature("d", { doodleId: "crab", strokes: [] }));
    expect(hasArt(e)).toBe(true);
    expect(canReplay(e)).toBe(false);
  });

  it("an entry with neither strokes nor a doodle is still remembered by name", () => {
    const e = entryOf(creature("bare", { strokes: [] }));
    expect(hasArt(e)).toBe(false);
    expect(canReplay(e)).toBe(false);
    expect(e.name).toBe("bare");
  });
});

describe("resilience", () => {
  it("survives junk and half-written records", () => {
    for (const junk of ['{{ not json', '"a string"', "null", '{"a":1}', "[null]", '[{"id":"x"}]']) {
      localStorage.setItem("magicpen.album.v1", junk);
      expect(() => loadAlbum()).not.toThrow();
      expect(Array.isArray(loadAlbum())).toBe(true);
    }
  });

  /* The album is a keepsake, never the source of truth — a full disk costs a
     sticker, and must never cost a drawing or throw into a render. */
  it("does not throw when the disk is full", () => {
    globalThis.localStorage = fullStorage();
    expect(() => remember(creature("a"))).not.toThrow();
    expect(() => forget("a")).not.toThrow();
  });
});
