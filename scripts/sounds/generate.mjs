// ─── Render the creature sounds ──────────────────────────────────────────────
// Turns each prompt in prompts.mjs into a small mp3 through ElevenLabs'
// sound-generation, and writes a manifest mapping a creature kind to its clip.
// Resumable: a kind whose clip already exists is skipped, so a re-run only
// fills gaps. The API key is passed in the environment, never stored.
//
//   ELEVEN_API_KEY=sk_... node scripts/sounds/generate.mjs
//
// Clips are named `<kind>-<audio-hash>.mp3`. The hash changes when the audio
// does, which lets a re-recorded clip bust the year-long immutable cache it is
// served under; the kind half stays stable so a resume can tell it exists.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOUND_PROMPTS, STYLE } from "./prompts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(HERE, "../../public/sounds/clips");
const MANIFEST = join(HERE, "../../public/sounds/manifest.json");
const KEY = process.env.ELEVEN_API_KEY;
if (!KEY) { console.error("set ELEVEN_API_KEY"); process.exit(1); }

mkdirSync(CLIPS, { recursive: true });

// what is already on disk, by kind → filename
const existing = new Map();
for (const f of readdirSync(CLIPS)) {
  const m = /^([a-z]+)-[0-9a-f]{8}\.mp3$/.exec(f);
  if (m) existing.set(m[1], f);
}

const manifest = { clips: {} };
const kinds = Object.keys(SOUND_PROMPTS);
let made = 0, failed = 0, skipped = 0;

async function gen(text, seconds) {
  const body = JSON.stringify({
    text: text + STYLE,
    duration_seconds: seconds,
    prompt_influence: 0.45,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json" },
      body,
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, (attempt + 1) * 2000)); continue; }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  }
  throw new Error("retries exhausted");
}

for (const kind of kinds) {
  if (existing.has(kind)) { manifest.clips[kind] = existing.get(kind); skipped++; continue; }
  const [prompt, seconds] = SOUND_PROMPTS[kind];
  try {
    const buf = await gen(prompt, seconds);
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
    const file = `${kind}-${hash}.mp3`;
    writeFileSync(join(CLIPS, file), buf);
    manifest.clips[kind] = file;
    made++;
    process.stdout.write(`  ${kind} → ${file} (${(buf.length / 1024) | 0}KB)\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`  ${kind} FAILED: ${e.message}\n`);
  }
}

// keep manifest sorted for a stable diff
const sorted = {};
for (const k of Object.keys(manifest.clips).sort()) sorted[k] = manifest.clips[k];
writeFileSync(MANIFEST, JSON.stringify({ clips: sorted }));
console.log(`\ndone: ${made} new, ${skipped} kept, ${failed} failed, ${Object.keys(sorted).length}/${kinds.length} in manifest`);
if (failed) process.exit(1);
