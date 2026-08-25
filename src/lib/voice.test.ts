// ─── The recorded voice covers what the app says ─────────────────────────────
// Every line the app speaks should have a clip, or a child hears the browser's
// fallback voice mid-lesson — a jarring switch from the warm one. This asserts
// the shipped manifest covers the whole spoken corpus, so adding a lesson
// without regenerating the clips fails here rather than in a child's ear.
//
// It reads the built manifest from disk. If the clips have not been generated
// yet the file is absent, and the test says so plainly rather than pretending
// to pass.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { spokenCorpus } from "./voiceLines";
import { clipKey } from "./voice";

const manifestPath = fileURLToPath(new URL("../../public/voice/manifest.json", import.meta.url));

describe("recorded voice", () => {
  it("has a manifest", () => {
    expect(existsSync(manifestPath), "public/voice/manifest.json — run the voice generator").toBe(true);
  });

  it("covers every spoken line, and each clip file it names exists", () => {
    if (!existsSync(manifestPath)) return; // the test above is the failure
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { clips: Record<string, string> };
    const clipsDir = fileURLToPath(new URL("../../public/voice/clips/", import.meta.url));

    const missing: string[] = [];
    const noFile: string[] = [];
    for (const line of spokenCorpus()) {
      const key = clipKey(line.text);
      const file = manifest.clips[key];
      if (!file) { missing.push(line.text); continue; }
      if (!existsSync(clipsDir + file)) noFile.push(`${line.text} → ${file}`);
    }
    expect(missing, `no clip for: ${missing.slice(0, 8).join(" | ")}`).toEqual([]);
    expect(noFile, `manifest names a missing file: ${noFile.slice(0, 8).join(" | ")}`).toEqual([]);
  });

  it("names every clip key the way the app will look it up", () => {
    // the generator and the app must normalise a line the same way, or a clip
    // that exists is never found
    expect(clipKey("  A is FOR  Apple! ")).toBe("a is for apple!");
    expect(clipKey("Forty  Two")).toBe("forty two");
  });
});
