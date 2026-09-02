// A child who takes today's idea and draws it should get *that thing* back by
// name. Most of the ideas are not among the fourteen shapes the recognizer
// knows, so this is the common case, not the edge case.

import { describe, expect, it } from "vitest";
import { dailyIdea, nameFromIdea } from "./daily";

/** Every idea in the rotation, gathered the way the app reaches them. */
const ALL_IDEAS = (() => {
  const seen = new Set<string>();
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 120; i++) {
    seen.add(dailyIdea(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
  }
  return [...seen];
})();

describe("nameFromIdea", () => {
  it("names the thing that was asked for", () => {
    expect(nameFromIdea("a tiny mouse")).toBe("Tiny Mouse");
    expect(nameFromIdea("a dragon")).toBe("Dragon");
    expect(nameFromIdea("an octopus")).toBe("Octopus");
    expect(nameFromIdea("the moon")).toBe("Moon");
    expect(nameFromIdea("your house")).toBe("House");
  });

  it("keeps the noun and drops what hangs off it", () => {
    // "a cat with a hat" is a cat; "a bowl of ice cream" is ice cream
    expect(nameFromIdea("a cat with a hat")).toBe("Cat");
    expect(nameFromIdea("a bowl of ice cream")).toBe("Ice Cream");
    expect(nameFromIdea("a family of ducks")).toBe("Ducks");
  });

  it("says nothing when the idea names nothing in particular", () => {
    // only the child knows what these turned out to be
    expect(nameFromIdea("something purple")).toBeNull();
    expect(nameFromIdea("your favourite animal")).toBeNull();
    expect(nameFromIdea("your favorite animal")).toBeNull();
    expect(nameFromIdea("your best friend")).toBeNull();
    expect(nameFromIdea("   ")).toBeNull();
  });

  it("gives every idea in the rotation a name a child could read", () => {
    expect(ALL_IDEAS.length).toBeGreaterThan(40);
    for (const idea of ALL_IDEAS) {
      const name = nameFromIdea(idea);
      if (name === null) continue;            // the open-ended few, on purpose
      expect(name).toMatch(/^[A-Z]/);          // a name, not a sentence fragment
      expect(name).not.toMatch(/^(A|An|The|Your|My) /);
      expect(name.split(" ").length).toBeLessThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(16);
    }
  });

  it("leaves only the handful that genuinely name nothing unnamed", () => {
    const unnamed = ALL_IDEAS.filter((i) => nameFromIdea(i) === null);
    expect(unnamed.sort()).toEqual(["something purple", "your best friend", "your favourite animal"]);
  });
});
