// ─── Regenerate the recorded voice ──────────────────────────────────────────
// Renders every line in corpus.json to a clip through ElevenLabs and writes the
// clips + manifest into public/voice. Idempotent and resumable: a clip that
// already exists is skipped, so a re-run only fills gaps or picks up new lines.
//
// The API key is NEVER stored in the repo. Pass it in the environment:
//
//   ELEVEN_API_KEY=sk_... VOICE_ID=... node scripts/voice/generate.mjs
//
// VOICE_ID defaults to the voice the current clips were made with. To change
// the whole voice, delete public/voice/clips first, then run with a new VOICE_ID.
//
// The corpus is derived from src/lib/voiceLines.ts. When the curriculum changes,
// regenerate corpus.json first (see scripts/voice/README.md), then run this.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const KEY = process.env.ELEVEN_API_KEY;
if (!KEY) { console.error("Set ELEVEN_API_KEY in the environment. It is never read from the repo."); process.exit(1); }
const VOICE = process.env.VOICE_ID || "n7Wi4g1bhpw4Bs8HK5ph";
const MODEL = process.env.VOICE_MODEL || "eleven_multilingual_v2";
const FORMAT = process.env.VOICE_FORMAT || "mp3_44100_64";
const CONC = Number(process.env.VOICE_CONCURRENCY || 3);

const corpus = JSON.parse(readFileSync(join(HERE, "corpus.json"), "utf8"));
const OUT = join(ROOT, "public", "voice");
const CLIPS = join(OUT, "clips");
mkdirSync(CLIPS, { recursive: true });

// MUST match clipKey() in src/lib/voice.ts
const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const keyHash = (key) => createHash("sha1").update(key).digest("hex").slice(0, 16);
/* A clip is named <keyhash>-<audiohash>.mp3. The key half keeps a stable prefix
   so a resume can tell a clip for this line already exists; the audio half
   changes when the audio does, which is what lets a corrected clip bust the
   year-long immutable cache it is served under. Predicting the audio hash is
   impossible (the voice is not deterministic), so the resume test matches the
   prefix, and a clip is only re-made when its file is deleted. */
const fileFor = (key, buf) =>
  `${keyHash(key)}-${createHash("sha1").update(buf).digest("hex").slice(0, 8)}.mp3`;
/* Matches both the current `<keyhash>-<audiohash>.mp3` names and the earlier
   `<keyhash…>.mp3` names, so a resume skips clips made under either scheme. */
const existingClip = (key) => readdirSync(CLIPS).find((f) => f.startsWith(keyHash(key)));
const speedFor = (l) => (l.text.length === 1 ? 0.85 : l.kind === "line" ? 1.0 : 0.9);

async function gen(l, attempt = 1) {
  const key = normalize(l.text);
  const have = existingClip(key);
  if (have) return { key, file: have, skipped: true };
  const body = JSON.stringify({
    // a letter is synthesized from its name-spelling; everything else from itself
    text: l.say ?? l.text,
    model_id: MODEL,
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: speedFor(l) },
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body, signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) {
      const t = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
        await new Promise((r) => setTimeout(r, 1000 * attempt * attempt));
        return gen(l, attempt + 1);
      }
      throw new Error(`HTTP ${res.status} ${t.slice(0, 160)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) throw new Error(`tiny ${buf.length}b`);
    const file = fileFor(key, buf);
    writeFileSync(join(CLIPS, file), buf);
    return { key, file, bytes: buf.length };
  } catch (e) {
    clearTimeout(to);
    if (attempt <= 5) {
      await new Promise((r) => setTimeout(r, 1000 * attempt * attempt));
      return gen(l, attempt + 1);
    }
    throw new Error(`${l.text.slice(0, 30)}: ${e.message}`);
  }
}

const seen = new Map();
for (const l of corpus.lines) { const k = normalize(l.text); if (!seen.has(k)) seen.set(k, l); }
const work = [...seen.values()];
console.log(`${work.length} unique clips (${corpus.lines.length} corpus lines), voice ${VOICE}`);

const manifest = {};
let done = 0, made = 0, failed = 0, bytes = 0, idx = 0;
async function worker() {
  while (idx < work.length) {
    const l = work[idx++];
    try {
      const r = await gen(l);
      manifest[r.key] = r.file;
      if (!r.skipped) { made++; bytes += r.bytes || 0; }
    } catch (e) { failed++; console.log("FAIL", e.message); }
    if (++done % 40 === 0) console.log(`  ${done}/${work.length} (made ${made}, failed ${failed})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  version: 1, voice: VOICE, model: MODEL, format: FORMAT,
  generatedChars: corpus.chars,
  clips: Object.fromEntries(Object.entries(manifest).sort()),
}));
console.log(`\ndone: ${Object.keys(manifest).length} clips, ${made} new, ${failed} failed, ${(bytes / 1024).toFixed(0)}KB new`);
if (failed) process.exit(1);
