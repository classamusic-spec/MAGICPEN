# Store submission kit

Everything needed to list Magic Pen on the App Store and Google Play.

## Contents

- **`COPY.md`** — app name, subtitle, keywords, and full descriptions for both
  stores, with character counts checked against each field's limit.
- **`PRIVACY.md`** — the exact answers for Apple's App Privacy and Google's Data
  safety questionnaires (short version: *no data collected*).
- **`screenshots/`** — real captures of the app at store device sizes.
- The user-facing privacy policy is `../public/privacy.html`.
- Native build instructions are in `../NATIVE.md`.

## Screenshots

Captured from the production build with a seeded ocean sketchbook. Three device
sizes × five screens:

| Screen | What it shows |
|---|---|
| `*--1-home.png` | The home hub: pet, today's idea, the child's creatures, the worlds |
| `*--2-ocean.png` | Magic Reef full of living creatures — the hero shot |
| `*--3-letters.png` | Letter World — the A–Z tracing grid |
| `*--4-shapes.png` | Shapes World — 24 lines, wiggles and shapes |
| `*--5-trace.png` | The guided letter-tracing moment |

Device sizes:

- `iphone-6.9--*` — 1290 × 2796 (iPhone 6.9" — App Store required size)
- `ipad-12.9--*` — 2048 × 2732 (iPad 12.9" — App Store required size)
- `android-phone--*` — 1080 × 1920 (Google Play phone)

To re-capture (e.g. after a visual change), the harness lives in the session
scratchpad (`verify/shots.mjs`): it serves `dist/public`, seeds an ocean
sketchbook into localStorage, and screenshots each screen with headless
Chromium. Run `npm run build` first.

Still needed by the consoles, not generated here:
- **App Store:** an optional app preview video.
- **Google Play:** a 1024 × 500 feature graphic, and the 512 × 512 app icon
  (use `assets/icon-only.png`, downscaled).

## Submission checklist

1. Confirm the bundle id `com.classamusic.magicpen` (see `../NATIVE.md`) before
   creating the app records — it is frozen after first submission.
2. Host `public/privacy.html` and put its URL in both consoles.
3. Build and upload:
   - iOS: `npm run build && npx cap sync && npx cap open ios` → Archive.
   - Android: `npm run build && npx cap sync` → `bundleRelease` (signed).
4. Fill listing text from `COPY.md`, upload `screenshots/`.
5. Answer the privacy questionnaires from `PRIVACY.md` (no data collected).
6. Complete the kids/families programs (App Store Kids category; Play Families).
