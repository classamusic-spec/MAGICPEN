// ─── The recorded sounds cover every creature ────────────────────────────────
// A tapped creature plays a recorded clip keyed by its kind, falling back to the
// synthesized voice only until that clip loads. A kind with no clip in the
// shipped manifest would always fall back — never the warmer recorded sound — so
// this asserts the manifest covers the whole roster, and that each clip it names
// is really on disk. Adding a creature without regenerating the clips fails here
// rather than quietly downgrading that creature to the synth voice forever.
//
// It reads the built manifest from disk. If the clips have not been generated
// yet the file is absent, and the test says so plainly rather than pretending
// to pass.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { ALL_KINDS } from "./creatures";

const manifestPath = fileURLToPath(new URL("../../public/sounds/manifest.json", import.meta.url));

describe("recorded creature sounds", () => {
  it("has a manifest", () => {
    expect(existsSync(manifestPath), "public/sounds/manifest.json — run the sound generator").toBe(true);
  });

  it("covers every creature kind, and each clip file it names exists", () => {
    if (!existsSync(manifestPath)) return; // the test above is the failure
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { clips: Record<string, string> };
    const clipsDir = fileURLToPath(new URL("../../public/sounds/clips/", import.meta.url));

    const missing: string[] = [];
    const noFile: string[] = [];
    for (const kind of ALL_KINDS) {
      const file = manifest.clips[kind.id];
      if (!file) { missing.push(kind.id); continue; }
      if (!existsSync(clipsDir + file)) noFile.push(`${kind.id} → ${file}`);
    }
    expect(missing, `no clip for: ${missing.join(", ")}`).toEqual([]);
    expect(noFile, `manifest names a missing file: ${noFile.slice(0, 8).join(" | ")}`).toEqual([]);
  });
});
