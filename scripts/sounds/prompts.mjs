// ─── What each creature sounds like ──────────────────────────────────────────
// One short, gentle, cartoon sound-effect prompt per creature kind, handed to
// ElevenLabs' sound-generation to render the clips in public/sounds. Animals
// get their own sound; an object gets a sound that suits it rather than a
// literal one, in the same playful spirit as the crayon it was drawn with.
//
// Kept deliberately soft and single — these play when a small child taps a
// friend, so nothing here is loud, long, or startling. Keys MUST match the
// creature kind ids in src/lib/creatures.ts; the coverage test enforces it.

/** Appended to every prompt, so the whole set stays gentle and consistent. */
export const STYLE = ", cute cartoon sound effect, short, soft, gentle, single, clean, no music";

/** kind id → [prompt, seconds]. Most are ~0.9s; a few calls run a touch longer. */
export const SOUND_PROMPTS = {
  // ── land animals ──
  cat: ["a single soft cute kitten meow", 0.9],
  dog: ["a single happy small puppy woof bark", 0.8],
  cow: ["a single gentle cow moo", 1.1],
  pig: ["a single cute pig oink", 0.8],
  duck: ["a single cute duck quack", 0.7],
  sheep: ["a single soft sheep baa", 1.0],
  horse: ["a single gentle horse neigh whinny", 1.1],
  zebra: ["a single soft horse neigh", 1.0],
  frog: ["a single cute frog ribbit croak", 0.7],
  bee: ["a short gentle friendly bee buzz", 0.9],
  bird: ["a single cheerful little bird chirp tweet", 0.7],
  chicken: ["a single cute chicken cluck", 0.7],
  snake: ["a short soft playful snake hiss", 0.9],
  // ── the sea ──
  fish: ["a cute little underwater bubble blub", 0.7],
  seahorse: ["a tiny soft underwater bloop", 0.6],
  octopus: ["a soft squishy underwater blub", 0.8],
  jellyfish: ["a soft squishy watery wobble blorp", 0.9],
  crab: ["a cute little crab claw click snap", 0.6],
  turtle: ["a slow gentle little turtle grunt", 0.9],
  shark: ["a soft playful cartoon chomp bite", 0.7],
  starfish: ["a soft magical water sparkle twinkle", 0.9],
  whale: ["a gentle soft whale song call", 1.5],
  // ── the sky and space ──
  star: ["a soft magical twinkle sparkle chime", 0.9],
  sun: ["a warm gentle magical shimmer", 1.0],
  moon: ["a soft dreamy sleepy chime", 1.1],
  rainbow: ["a magical rising sparkle shimmer", 1.0],
  rocket: ["a tiny toy rocket whoosh launch", 0.9],
  comet: ["a bright clear fast whoosh with a sparkle trail", 0.8],
  ufo: ["a playful wobbling ufo warble", 0.9],
  alien: ["a cute friendly little alien blip babble", 0.9],
  astronaut: ["a soft space radio blip and whoosh", 0.9],
  satellite: ["a soft beeping little radio blip", 0.8],
  planet: ["a clear deep cosmic hum with a bright shimmer", 1.2],
  mercury: ["a light quick cosmic blip", 0.7],
  venus: ["a warm soft cosmic shimmer chime", 1.0],
  mars: ["a soft cosmic thud with a shimmer", 0.9],
  // ── dinosaurs ──
  trex: ["a cute friendly little dinosaur roar", 1.0],
  triceratops: ["a soft friendly dinosaur grunt bellow", 1.0],
  stegosaurus: ["a gentle friendly dinosaur hum growl", 1.0],
  longneck: ["a soft gentle long dinosaur call hum", 1.3],
  pterodactyl: ["a cute little pterodactyl screech", 0.8],
  egg: ["a cute little egg crack with a sparkle", 0.8],
  volcano: ["a deep clear rumbling volcano with a puff of smoke", 1.2],
  // ── things ──
  car: ["a tiny toy car vroom and a little beep", 0.8],
  bus: ["a friendly little toy bus horn beep", 0.8],
  tractor: ["a tiny toy tractor engine putter chug", 1.0],
  balloon: ["a soft rubbery balloon squeak", 0.7],
  ball: ["a soft bouncy rubber ball boing", 0.7],
  yoyo: ["a playful springy yoyo boing", 0.7],
  hat: ["a soft playful little pop", 0.5],
  heart: ["a clear cute cartoon heartbeat, two thumps", 0.9],
  crown: ["a tiny regal royal fanfare sparkle", 1.0],
  gift: ["a cheerful little gift unwrap crinkle with a sparkle", 0.9],
  cake: ["a bright cheerful birthday sparkle with a clear pop", 0.8],
  apple: ["a crisp cute apple crunch", 0.6],
  orange: ["a juicy soft squish", 0.6],
  kite: ["a light breezy kite whoosh flutter", 0.9],
  leaf: ["a clear crisp leaf rustle crunch", 0.7],
  butterfly: ["a soft delicate fluttering whoosh with a tiny sparkle", 0.9],
  palmtree: ["a soft tropical leafy sway rustle", 0.9],
  flower: ["a gentle magical flower bloom sparkle", 0.9],
  tree: ["a soft leafy tree rustle", 0.8],
  house: ["a cozy little wooden door knock", 0.7],
  barn: ["a soft wooden barn creak", 0.8],
  nest: ["tiny baby birds cheeping softly", 0.9],
  // ── the mystery blob ──
  mystery: ["a curious playful cartoon boing wobble", 0.8],
};
