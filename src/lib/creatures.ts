// ─── Creature catalog & world packs ─────────────────────────────────────────

import type { CreatureKind, WorldPack, WritingWorld } from "./types";

export const CREATURE_KINDS: CreatureKind[] = [
  { id: "fish",      label: "Fish",      emoji: "🐟", behavior: "swim",   names: ["Bubbles", "Splash", "Finley", "Coral", "Wavy", "Ziggy"] },
  { id: "car",       label: "Car",       emoji: "🚗", behavior: "drive",  names: ["Vroom", "Scooter", "Zoom", "Turbo", "Beep-Beep"] },
  { id: "sun",       label: "Sun",       emoji: "☀️", behavior: "twinkle",names: ["Sunny", "Glowy", "Ray", "Goldie"] },
  { id: "star",      label: "Star",      emoji: "⭐", behavior: "twinkle",names: ["Twinkle", "Nova", "Sparky", "Stella"] },
  { id: "bird",      label: "Bird",      emoji: "🐦", behavior: "fly",    names: ["Flappy", "Sky", "Pip", "Winger"] },
  { id: "butterfly", label: "Butterfly", emoji: "🦋", behavior: "fly",    names: ["Flutter", "Petal", "Wings", "Mariposa"] },
  { id: "flower",    label: "Flower",    emoji: "🌸", behavior: "grow",   names: ["Bloom", "Daisy", "Poppy", "Rosie"] },
  { id: "tree",      label: "Tree",      emoji: "🌳", behavior: "grow",   names: ["Woody", "Leafy", "Oakie", "Sprout"] },
  { id: "snake",     label: "Snek",      emoji: "🐍", behavior: "crawl",  names: ["Slither", "Noodle", "Wiggles", "Sssam"] },
  { id: "rainbow",   label: "Rainbow",   emoji: "🌈", behavior: "float",  names: ["Arcy", "Prism", "Skittles", "Halo"] },
  { id: "balloon",   label: "Balloon",   emoji: "🎈", behavior: "float",  names: ["Floaty", "Pop", "Helium", "Up"] },
  { id: "rocket",    label: "Rocket",    emoji: "🚀", behavior: "fly",    names: ["Blastoff", "Comet", "Zoom-Zoom", "Astro"] },
  { id: "heart",     label: "Heart",     emoji: "💖", behavior: "bounce", names: ["Lovey", "Sweetie", "Beat", "Hug"] },
  { id: "house",     label: "House",     emoji: "🏠", behavior: "grow",   names: ["Homey", "Cottage", "Nook", "Shelly"] },
  { id: "mystery",   label: "Mystery Creature", emoji: "✨", behavior: "swim", names: ["Doodle", "Squiggle", "Whatzit", "Scribble", "Zorp"] },
];

/* Creatures born in Word World. They are deliberately NOT in CREATURE_KINDS:
   that array is the set the sketch recognizer can guess, and it is rendered
   verbatim as the "or is it a…?" chips on the reveal screen. Twenty-six chips
   would drown that screen, and the recognizer cannot tell a duck from a hat
   anyway — a written word can. `kindById` looks in both. */
export const WORD_KINDS: CreatureKind[] = [
  { id: "dog",   label: "Dog",   emoji: "", behavior: "bounce",  names: ["Rex", "Biscuit", "Pip", "Waggy", "Bandit"] },
  { id: "cat",   label: "Cat",   emoji: "", behavior: "crawl",   names: ["Mittens", "Whiskers", "Nibbles", "Smudge"] },
  { id: "bee",   label: "Bee",   emoji: "", behavior: "fly",     names: ["Buzz", "Honey", "Fuzzy", "Zip"] },
  { id: "frog",  label: "Frog",  emoji: "", behavior: "bounce",  names: ["Hopper", "Ribbit", "Lily", "Splot"] },
  { id: "duck",  label: "Duck",  emoji: "", behavior: "waddle",  names: ["Quackers", "Puddle", "Waddle", "Beaky"] },
  { id: "pig",   label: "Pig",   emoji: "", behavior: "graze",   names: ["Truffle", "Snout", "Pinky", "Oink"] },
  { id: "moon",  label: "Moon",  emoji: "", behavior: "twinkle", names: ["Luna", "Crescent", "Dozy", "Silver"] },
  { id: "apple", label: "Apple", emoji: "", behavior: "grow",    names: ["Pip", "Crunch", "Rosy", "Core"] },
  { id: "ball",  label: "Ball",  emoji: "", behavior: "bounce",  names: ["Bouncy", "Rolly", "Boing", "Spot"] },
  { id: "hat",   label: "Hat",   emoji: "", behavior: "float",   names: ["Topper", "Flop", "Brim", "Tip"] },
  { id: "bus",   label: "Bus",   emoji: "", behavior: "drive",   names: ["Rumble", "Doors", "Big Red", "Toot"] },
  { id: "cake",  label: "Cake",  emoji: "", behavior: "grow",    names: ["Sprinkle", "Frosting", "Cherry", "Slice"] },
];

/* Creatures that belong to one particular world. Like WORD_KINDS these stay out
   of CREATURE_KINDS — the recognizer cannot tell a stegosaurus from a sheep, and
   the reveal screen no longer shows one flat list anyway: it shows the roster of
   the world the child is drawing for (see WORLD_ROSTERS below). Each id here has
   drawn artwork in lib/doodles, because we render the drawing, never an emoji. */
export const WORLD_KINDS: CreatureKind[] = [
  /* ── Magic Reef ─────────────────────────────────────────────────────────── */
  { id: "starfish",    label: "Starfish",    emoji: "", behavior: "crawl",   names: ["Twinkletoes", "Sandy", "Wishy", "Five-Points", "Glitter"] },
  { id: "octopus",     label: "Octopus",     emoji: "", behavior: "jet",     names: ["Inky", "Eight-Arms", "Squishy", "Noodle-Arms", "Blub"] },
  { id: "crab",        label: "Crab",        emoji: "", behavior: "scuttle", names: ["Pinchy", "Sideways", "Clacky", "Snip-Snap", "Shelly"] },
  { id: "seahorse",    label: "Seahorse",    emoji: "", behavior: "swim",    names: ["Curly", "Twirl", "Sea-Pony", "Bobbin", "Ripple"] },
  { id: "turtle",      label: "Turtle",      emoji: "", behavior: "swim",    names: ["Shelldon", "Slowpoke", "Paddle", "Domey", "Tuck"] },
  { id: "shark",       label: "Shark",       emoji: "", behavior: "swim",    names: ["Chomper", "Toothy", "Finny", "Big Grin", "Zoomer"] },
  { id: "jellyfish",   label: "Jellyfish",   emoji: "", behavior: "jet",     names: ["Wobble", "Squish", "Glowy", "Bloop", "Jelly-Belly"] },
  { id: "whale",       label: "Whale",       emoji: "", behavior: "swim",    names: ["Big Blue", "Spout", "Gulp", "Songy", "Splashy"] },

  /* ── Giggle Galaxy ──────────────────────────────────────────────────────── */
  { id: "planet",      label: "Planet",      emoji: "", behavior: "orbit",   names: ["Ringo", "Bumpy", "Spinny", "Swirl", "Big Ball"] },
  { id: "mercury",     label: "Mercury",     emoji: "", behavior: "orbit",   names: ["Speedy", "Zippy", "Little Rock", "Sizzle"] },
  { id: "venus",       label: "Venus",       emoji: "", behavior: "orbit",   names: ["Cloudy", "Toasty", "Puff", "Shimmer"] },
  { id: "mars",        label: "Mars",        emoji: "", behavior: "orbit",   names: ["Rusty", "Red-Red", "Dusty", "Blush"] },
  { id: "ufo",         label: "UFO",         emoji: "", behavior: "hover",   names: ["Beep-Boop", "Saucer", "Blinky", "Whoosh", "Zoop"] },
  { id: "alien",       label: "Alien",       emoji: "", behavior: "bounce",  names: ["Zorb", "Blip", "Greenie", "Bloop-Bloop", "Squeek"] },
  { id: "astronaut",   label: "Astronaut",   emoji: "", behavior: "float",   names: ["Bouncy Boots", "Star Hopper", "Bubble-Head", "Moonwalker"] },
  { id: "comet",       label: "Comet",       emoji: "", behavior: "streak",  names: ["Swoosh", "Sparktail", "Dash", "Glimmer", "Zing"] },
  { id: "satellite",   label: "Satellite",   emoji: "", behavior: "orbit",   names: ["Beep", "Wing-Ding", "Ping", "Chirpy", "Antenna"] },

  /* ── Sunny Farm ─────────────────────────────────────────────────────────── */
  { id: "cow",         label: "Cow",         emoji: "", behavior: "graze",   names: ["Moo-Moo", "Buttercup", "Spots", "Clover", "Bessie"] },
  { id: "chicken",     label: "Chicken",     emoji: "", behavior: "waddle",  names: ["Cluck-Cluck", "Feathers", "Peck", "Henrietta", "Fluffy"] },
  { id: "sheep",       label: "Sheep",       emoji: "", behavior: "graze",   names: ["Woolly", "Baa-Baa", "Puffball", "Marshmallow", "Nibble"] },
  { id: "horse",       label: "Horse",       emoji: "", behavior: "graze",   names: ["Clip-Clop", "Sugar", "Gallop", "Star-Nose", "Pepper"] },
  { id: "barn",        label: "Barn",        emoji: "", behavior: "grow",    names: ["Red Roof", "Hay House", "Creaky", "Cozy", "Big Doors"] },
  { id: "tractor",     label: "Tractor",     emoji: "", behavior: "drive",   names: ["Chugger", "Putt-Putt", "Big Wheels", "Muddy", "Tilly"] },

  /* ── Dino Island ────────────────────────────────────────────────────────── */
  { id: "trex",        label: "T-Rex",       emoji: "", behavior: "stomp",   names: ["Chompy", "Tiny Arms", "Roary", "Rexy", "Big Teeth"] },
  { id: "triceratops", label: "Triceratops", emoji: "", behavior: "stomp",   names: ["Three-Horn", "Frilly", "Bonk", "Trixie", "Charger"] },
  { id: "stegosaurus", label: "Stegosaurus", emoji: "", behavior: "stomp",   names: ["Spike", "Steggy", "Platey", "Thwack", "Diamond-Back"] },
  { id: "pterodactyl", label: "Pterodactyl", emoji: "", behavior: "fly",     names: ["Screech", "Wingnut", "Glider", "Swoopy", "Kite"] },
  { id: "longneck",    label: "Long-neck",   emoji: "", behavior: "stomp",   names: ["Stretch", "Tall-Boy", "Necky", "Munch", "Treetop"] },
  { id: "egg",         label: "Dino Egg",    emoji: "", behavior: "bounce",  names: ["Crackle", "Hatchy", "Speckles", "Peep", "Wibble"] },
  { id: "volcano",     label: "Volcano",     emoji: "", behavior: "erupt",   names: ["Rumbly", "Puffs", "Hot-Top", "Boom-Boom", "Smokey"] },
  { id: "palmtree",    label: "Palm Tree",   emoji: "", behavior: "sway",    names: ["Swishy", "Coco", "Fronds", "Breezy", "Tall Tom"] },
];

/** Every kind the app knows: guessable, written, and world-specific. */
export const ALL_KINDS: CreatureKind[] = [...CREATURE_KINDS, ...WORD_KINDS, ...WORLD_KINDS];

export const kindById = (id: string): CreatureKind =>
  ALL_KINDS.find((k) => k.id === id) ?? CREATURE_KINDS[CREATURE_KINDS.length - 1];

export const WORLD_PACKS: WorldPack[] = [
  {
    id: "ocean",
    name: "Magic Reef",
    tagline: "Your drawings swim here!",
    emoji: "🐠",
    price: null,
    locked: false,
    gradient: "linear-gradient(160deg,#0e7fd6 0%,#06b6d4 55%,#67e8f9 100%)",
    prompts: ["a fish", "an octopus", "a crab", "a seahorse", "a shark", "a jellyfish"],
  },
  {
    id: "space",
    name: "Giggle Galaxy",
    tagline: "Draw rockets & aliens!",
    emoji: "🪐",
    price: null,
    locked: false,
    gradient: "linear-gradient(160deg,#1e1b4b 0%,#7c3aed 60%,#c084fc 100%)",
    prompts: ["a rocket", "an alien", "a planet", "a UFO", "an astronaut", "a star"],
  },
  {
    id: "farm",
    name: "Sunny Farm",
    tagline: "Draw animals that moo & oink!",
    emoji: "🐮",
    price: null,
    locked: false,
    gradient: "linear-gradient(160deg,#65a30d 0%,#a3e635 60%,#fef08a 100%)",
    prompts: ["a cow", "a pig", "a chicken", "a barn", "a sheep", "a tractor"],
  },
  {
    id: "dino",
    name: "Dino Island",
    tagline: "Draw giants that ROAR!",
    emoji: "🦕",
    price: null,
    locked: false,
    gradient: "linear-gradient(160deg,#065f46 0%,#10b981 55%,#fbbf24 100%)",
    prompts: ["a T-rex", "a long-neck", "a pterodactyl", "a volcano", "a palm tree", "a dino egg"],
  },
  {
    id: "dream",
    name: "My World",
    tagline: "Draw your OWN world!",
    emoji: "✨",
    price: null,
    locked: false,
    gradient: "linear-gradient(160deg,#fca5f1 0%,#a78bfa 52%,#7dd3fc 100%)",
    prompts: ["anything you like", "your house", "a rainbow", "a garden", "the sky", "a castle"],
  },
];

/* ── who you are offered, world by world ──────────────────────────────────────
   "What did you draw?" used to show the same fourteen chips everywhere, so the
   Reef offered a rocket and the Galaxy offered a flower. Each world now offers
   the things that live in it, most-likely-first. Keep these to about a dozen:
   they are tappable cards on a small phone, and twenty is a wall of noise. */

/** Ordered kind ids offered on the reveal screen, per world id. */
export const WORLD_ROSTERS: Record<string, string[]> = {
  ocean: ["fish", "starfish", "octopus", "crab", "jellyfish", "seahorse", "turtle", "shark", "whale", "duck", "snake"],
  space: ["rocket", "ufo", "alien", "astronaut", "planet", "star", "moon", "mars", "comet", "satellite", "mercury", "venus"],
  farm:  ["cow", "pig", "chicken", "sheep", "horse", "duck", "barn", "tractor", "tree", "flower"],
  dino:  ["trex", "longneck", "triceratops", "stegosaurus", "pterodactyl", "egg", "volcano", "palmtree"],
  /* "My World" is the everyday set — the things children actually draw when
     nobody has told them what to draw, plus the two show-offs (a volcano and
     an alien) that every five-year-old wants in their world. */
  dream: ["cat", "dog", "house", "tree", "flower", "sun", "butterfly", "bird", "rainbow", "car", "volcano", "alien", "star", "heart"],
};

/** The world an unknown id falls back to: "My World", the everyday set. */
const FALLBACK_ROSTER = "dream";

/**
 * The roster for a world as full kinds, always ending with "mystery" — the
 * escape hatch for "it is not any of these", which every world needs last.
 * Unknown ids and ids with no kind behind them are dropped rather than
 * silently resolved to mystery, so a typo cannot smuggle in a duplicate.
 */
export function rosterFor(worldId: string): CreatureKind[] {
  const ids = WORLD_ROSTERS[worldId] ?? WORLD_ROSTERS[FALLBACK_ROSTER];
  const seen = new Set<string>(["mystery"]);
  const roster: CreatureKind[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const kind = ALL_KINDS.find((k) => k.id === id);
    if (!kind) continue;
    seen.add(id);
    roster.push(kind);
  }
  roster.push(kindById("mystery"));
  return roster;
}

/** Behavior → arrival copy, per world. */
export const BEHAVIOR_COPY: Record<string, Record<string, { arrival: string }>> = {
  ocean: {
    swim:    { arrival: "swims into the reef" },
    drive:   { arrival: "drives onto the seabed" },
    fly:     { arrival: "glides through the water" },
    float:   { arrival: "drifts up like a bubble" },
    twinkle: { arrival: "twinkles above the reef" },
    grow:    { arrival: "plants itself in the sand" },
    crawl:   { arrival: "wiggles across the sand" },
    bounce:  { arrival: "bounces into the reef" },
  },
  space: {
    swim:    { arrival: "floats into the galaxy" },
    drive:   { arrival: "lands its rover on the moon" },
    fly:     { arrival: "blasts into orbit" },
    float:   { arrival: "drifts through zero-G" },
    twinkle: { arrival: "joins the constellations" },
    grow:    { arrival: "sprouts on the moon" },
    crawl:   { arrival: "wiggles across the moon" },
    bounce:  { arrival: "moon-bounces into the galaxy" },
  },
  farm: {
    swim:    { arrival: "splashes into the pond" },
    drive:   { arrival: "chugs down the farm lane" },
    fly:     { arrival: "flutters over the meadow" },
    float:   { arrival: "floats over the cornfield" },
    twinkle: { arrival: "twinkles over the barn" },
    grow:    { arrival: "sprouts in the veggie patch" },
    crawl:   { arrival: "wiggles through the grass" },
    bounce:  { arrival: "bounces into the meadow" },
  },
  dino: {
    swim:    { arrival: "splashes into the lagoon" },
    drive:   { arrival: "rumbles across the island" },
    fly:     { arrival: "soars over the volcano" },
    float:   { arrival: "drifts past the palms" },
    twinkle: { arrival: "twinkles over the nest" },
    grow:    { arrival: "sprouts in the jungle" },
    crawl:   { arrival: "stomps out of the jungle" },
    bounce:  { arrival: "stomp-bounces onto the island" },
  },
};

/* ── writing worlds ──────────────────────────────────────────────────────────
   Three worlds where the child makes marks on purpose rather than freely. They
   share one tracing screen; only the content and the palette differ. */

export const WRITING_WORLDS: WritingWorld[] = [
  {
    id: "letters",
    name: "Letter World",
    tagline: "Write your ABCs!",
    teaches: "Letter shapes and first sounds, A to Z",
    gradient: "linear-gradient(160deg,#8b46c7 0%,#c084fc 58%,#fbcfe8 100%)",
    tone: "#8b46c7",
  },
  {
    id: "numbers",
    name: "Math World",
    tagline: "Write numbers & sums!",
    teaches: "Writing 0–9, counting, and single-digit sums",
    gradient: "linear-gradient(160deg,#0369a1 0%,#00c2b9 58%,#bbf7d0 100%)",
    tone: "#00838a",
  },
  {
    id: "words",
    name: "Word World",
    tagline: "Write a word — watch it come alive!",
    teaches: "Blending letters into three- and four-letter words",
    gradient: "linear-gradient(160deg,#c2410c 0%,#f59e0b 55%,#fde68a 100%)",
    tone: "#d1490b",
  },
];

export const writingWorldById = (id: string): WritingWorld =>
  WRITING_WORLDS.find((w) => w.id === id) ?? WRITING_WORLDS[0];
