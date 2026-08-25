import { describe, it, expect } from "vitest";
import { resolvePet, isPet, petGreeting, makeRoom } from "./pet";
import type { Creature } from "./types";
import type { PetRef } from "./storage";
import type { Visit } from "./daily";

function creature(id: string, name = id): Creature {
  return {
    id, kindId: "fish", name, strokes: [], createdAt: 1,
    wx: 0.5, wy: 0.5, dir: 1, speed: 0.03, phase: 0, scale: 1,
  };
}
const ref = (id: string): PetRef => ({ id, since: 1 });
const visit = (v: Partial<Visit> = {}): Visit =>
  ({ newDay: false, away: 0, streak: 1, days: 1, firstEver: false, ...v });

describe("resolvePet", () => {
  it("finds the crowned creature", () => {
    const cs = [creature("a"), creature("b")];
    expect(resolvePet(ref("b"), cs)?.id).toBe("b");
  });

  it("treats no pet as no pet", () => {
    expect(resolvePet(null, [creature("a")])).toBeNull();
  });

  it("treats a dangling id as no pet rather than throwing", () => {
    // The creature was released, or evicted by an older build. This is an
    // ordinary state, not an error.
    expect(resolvePet(ref("gone"), [creature("a")])).toBeNull();
  });

  it("survives an empty sketchbook", () => {
    expect(resolvePet(ref("a"), [])).toBeNull();
  });
});

describe("isPet", () => {
  it("is safe with no pet", () => expect(isPet(null, "a")).toBe(false));
  it("matches only the crowned id", () => {
    expect(isPet(ref("a"), "a")).toBe(true);
    expect(isPet(ref("a"), "b")).toBe(false);
  });
});

describe("petGreeting", () => {
  it("always names the pet", () => {
    for (const v of [visit(), visit({ away: 300 }), visit({ firstEver: true })]) {
      expect(petGreeting(v, "Bubbles")).toContain("Bubbles");
    }
  });

  it("gets warmer with a longer gap, never colder", () => {
    expect(petGreeting(visit({ away: 300 }), "Bo")).toBe("Bo missed you!");
    expect(petGreeting(visit({ away: 24 }), "Bo")).toBe("Bo was waiting for you!");
  });

  /* The rule this whole feature lives under: absence is never punished. No
     greeting may scold, guilt, or report a loss. */
  it("never blames the child for being away", () => {
    const bad = /sad|sick|hungry|starv|lonely|forgot|neglect|left|why|should|sorry|miss you\b/i;
    for (const away of [0, 5, 7, 24, 100, 168, 1000, Infinity]) {
      for (const streak of [1, 3, 10]) {
        const line = petGreeting(visit({ away, streak }), "Bo");
        expect(line, `away=${away} streak=${streak}: "${line}"`).not.toMatch(bad);
        expect(line.endsWith("!")).toBe(true);
      }
    }
  });
});

describe("makeRoom — the pet must survive the cap", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => creature(`c${i}`));

  it("does nothing while there is room", () => {
    const cs = many(5);
    expect(makeRoom(cs, 30, null)).toHaveLength(5);
  });

  it("drops the oldest when full and there is no pet", () => {
    const cs = many(30);
    const out = makeRoom(cs, 30, null);
    expect(out).toHaveLength(29);
    expect(out[0].id).toBe("c1"); // c0, the oldest, made way
  });

  /* The bug this function exists to prevent: the pet is usually the oldest
     creature there is, so a plain oldest-first cap would delete precisely the
     creature the child had chosen. */
  it("keeps the pet even when it is the oldest", () => {
    const cs = many(30);
    const out = makeRoom(cs, 30, "c0");
    expect(out).toHaveLength(29);
    expect(out.some((c) => c.id === "c0")).toBe(true); // the pet stayed
    expect(out.some((c) => c.id === "c1")).toBe(false); // the next-oldest went
  });

  it("keeps the pet wherever it sits in the list", () => {
    for (const petId of ["c0", "c7", "c29"]) {
      const out = makeRoom(many(30), 30, petId);
      expect(out.some((c) => c.id === petId), petId).toBe(true);
    }
  });

  it("preserves order", () => {
    const out = makeRoom(many(30), 30, "c0");
    const ids = out.map((c) => c.id);
    expect(ids).toEqual([...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  });

  it("still respects the cap when over it by more than one", () => {
    const out = makeRoom(many(40), 30, "c0");
    expect(out).toHaveLength(29);
    expect(out.some((c) => c.id === "c0")).toBe(true);
  });

  it("does not exceed the cap even if only the pet could be dropped", () => {
    const out = makeRoom([creature("p")], 1, "p");
    expect(out.length).toBeLessThanOrEqual(0);
  });

  it("ignores a pet id that is not in the list", () => {
    const out = makeRoom(many(30), 30, "nobody");
    expect(out).toHaveLength(29);
    expect(out[0].id).toBe("c1");
  });
});

/* Saying goodbye is the one irreversible act in the app, and the crown must
   never be left pointing at somebody who has left. App owns both halves; these
   pin the contract that logic has to satisfy. */
describe("saying goodbye", () => {
  const remove = (cs: Creature[], id: string) => cs.filter((c) => c.id !== id);
  const petAfter = (ref: PetRef | null, id: string) => (ref && ref.id === id ? null : ref);

  it("takes the drawing out of the sketchbook", () => {
    const cs = [creature("a"), creature("b")];
    expect(remove(cs, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("clears the crown when the pet is the one leaving", () => {
    expect(petAfter(ref("a"), "a")).toBeNull();
  });

  it("leaves the crown alone when somebody else leaves", () => {
    expect(petAfter(ref("a"), "b")?.id).toBe("a");
  });

  it("is a no-op for an id nobody answers to", () => {
    const cs = [creature("a")];
    expect(remove(cs, "nobody")).toHaveLength(1);
    expect(petAfter(ref("a"), "nobody")?.id).toBe("a");
  });

  it("is idempotent", () => {
    const once = remove([creature("a"), creature("b")], "a");
    expect(remove(once, "a")).toEqual(once);
  });

  /* The pet resolving to nothing is the state the app must survive, since the
     pointer and the list are written separately. */
  it("resolves to no pet once the creature is gone", () => {
    expect(resolvePet(ref("a"), remove([creature("a")], "a"))).toBeNull();
  });
});
