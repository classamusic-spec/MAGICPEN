# The recorded voice

Magic Pen speaks its curriculum — every letter name, "A is for Apple", the
counting, the shape names, the creature facts — in one warm voice, recorded
once and shipped as small audio clips. At runtime `src/lib/speech.ts` plays the
clip for a line and falls back to the browser's own synthesizer only for lines
that have none (a name a child typed) or before the clips have loaded.

Why pre-render instead of using the browser voice everywhere:

- **One voice on every device**, instead of the platform lottery — gentle on
  one phone, robotic on the next.
- **It says the curriculum right** because a person's voice was recorded saying
  it: "forty two", not "forty minus two".
- **Nothing a child does is sent anywhere.** The clips are static files made
  ahead of time — no microphone, no per-tap network call.

## Files

- `public/voice/clips/*.mp3` — one clip per line, named by a hash of the line.
- `public/voice/manifest.json` — maps a normalised line to its clip file.
- `src/lib/voiceLines.ts` — derives the exact spoken corpus from the curriculum.
- `src/lib/voice.test.ts` — fails if any spoken line has no clip, so a new
  lesson can't ship silent.
- `scripts/voice/corpus.json` — the frozen corpus the generator renders.

## Letters say their name, not their sound

A text-to-speech engine handed a lone "A" reads it as either the letter's name
("ay") or its sound ("ah"), non-deterministically — several letters shipped
saying the sound, which is wrong for a screen teaching letter names. So each
letter is synthesized from an explicit name-spelling (`LETTER_NAME` in
`src/lib/voiceLines.ts` — "Eigh", "You", "Double-you", …) while still being
stored and looked up under the plain letter. The spellings were chosen by
generating each and transcribing it back until the transcript was the letter
again; `voice.test.ts` asserts every letter has one.

Clips are named `<key-hash>-<audio-hash>.mp3`. The audio half changes when the
audio does, which is what lets a corrected clip bust the year-long immutable
cache it is served under; the key half stays stable so a resume can tell a clip
already exists. A voice that is not deterministic cannot be verified from a
build machine with no ears — the committed generator ships the name-spellings
and trusts them; the clips in the repo were additionally transcription-checked
(see the audit under scratch tooling) before being committed.

## Regenerating

The API key is **never** stored in the repo — pass it in the environment.

```sh
ELEVEN_API_KEY=sk_... VOICE_ID=<voice> node scripts/voice/generate.mjs
```

Resumable: a clip that already exists is skipped, so a re-run only fills gaps.
`VOICE_ID` defaults to the voice the current clips were made with. To swap the
whole voice, delete `public/voice/clips` first, then run with a new `VOICE_ID`.

### After a curriculum change

`corpus.json` is frozen, so a new lesson won't be spoken until it is refreshed.
Regenerate it from `src/lib/voiceLines.ts`, then run the generator. The corpus
is produced the same way the coverage test reads it — the shape is
`{ count, chars, lines: [{ text, kind }] }`. A one-liner that writes it:

```sh
npx vitest run --reporter=dot -t 'covers every spoken line'   # confirms drift first
```

If that test fails, a line is missing a clip — refresh `corpus.json` to include
every `spokenCorpus()` line and re-run the generator.
