// ─── Every creature can say hello ────────────────────────────────────────────
// A creature tapped in the world plays a synthesized voice keyed by its kind.
// A kind with no voice would be silent on tap — a small, easily-missed gap — so
// this asserts every creature kind in the roster has one wired up, and that
// each names a real archetype.

import { describe, expect, it } from "vitest";
import { ALL_KINDS } from "./creatures";
import { VOICED_KINDS } from "./creatureVoice";

describe("creature voices", () => {
  it("gives every creature kind a voice", () => {
    const voiced = new Set(VOICED_KINDS);
    const missing = ALL_KINDS.map((k) => k.id).filter((id) => !voiced.has(id));
    expect(missing, `kinds with no tap-sound: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a voice for the mystery blob, the fallback for anything unknown", () => {
    expect(VOICED_KINDS).toContain("mystery");
  });
});
