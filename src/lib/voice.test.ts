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
import { spokenCorpus, LETTER_NAME, sayFor } from "./voiceLines";
import { LETTER_LESSONS } from "./writing";
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

  it("gives every letter a name-spelling, so no letter is read as its sound", () => {
    // a bare "A" is read by a TTS as either "ay" (the name) or "ah" (the sound),
    // non-deterministically — several came back wrong. Every letter in the
    // curriculum must therefore be synthesized from an explicit name-spelling.
    for (const l of LETTER_LESSONS) {
      const say = sayFor(l.char);
      expect(say, `${l.char} has no name-spelling`).toBeTruthy();
      // the spelling must not be the bare letter — that is the ambiguous input
      expect(say!.toLowerCase(), l.char).not.toBe(l.char.toLowerCase());
    }
    // all 26, keyed a–z
    expect(Object.keys(LETTER_NAME).sort().join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    // a digit is NOT given a letter-name spelling — it is spoken as a number
    expect(sayFor("4")).toBeUndefined();
    expect(sayFor("A")).toBe("Eigh");
  });

  it("names every clip key the way the app will look it up", () => {
    // the generator and the app must normalise a line the same way, or a clip
    // that exists is never found
    expect(clipKey("  A is FOR  Apple! ")).toBe("a is for apple!");
    expect(clipKey("Forty  Two")).toBe("forty two");
  });
});
