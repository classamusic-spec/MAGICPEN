// ─── MAGIC PEN core types ───────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

export interface Stroke {
  color: string;
  size: number; // brush width in canvas units
  pts: Pt[];
}

export type BehaviorKind =
  | "swim"     // fish, octopus, turtle, mystery sea life
  | "drive"    // cars, boats that scoot along the seabed
  | "fly"      // birds, butterflies, rockets in water = glide
  | "float"    // balloons, bubbles, jellyfish drift
  | "twinkle"  // stars, suns — hover and shimmer
  | "grow"     // flowers, trees — rooted, swaying
  | "crawl"    // snakes, worms, crabs
  | "bounce";  // generic critter

export interface CreatureKind {
  id: string;           // "fish" | "car" | ...
  label: string;        // "Fish"
  emoji: string;
  behavior: BehaviorKind;
  names: string[];      // pool of cute names
}

export interface Creature {
  id: string;                 // uuid
  kindId: string;
  name: string;
  strokes: Stroke[];          // the kid's actual drawing
  createdAt: number;
  // runtime world state (not persisted shape-critical, but persisted anyway)
  wx: number;                 // world position 0..1 normalized
  wy: number;
  dir: 1 | -1;
  speed: number;
  phase: number;              // animation phase offset
  scale: number;              // size relative to drawing
  artUrl?: string;            // AI-polished artwork (public URL), undefined = crayon
  artTried?: boolean;         // polish was already requested (don't re-ask)
  photoData?: string;         // paper-photo drawing (transparent PNG data URL)
  /** Born in Word World: its body is the doodle of this name, not `strokes`.
   *  Kept as an id rather than a baked PNG so it costs a few bytes of storage
   *  and stays sharp at any size. */
  doodleId?: string;
  /** The word the child wrote to summon it, e.g. "DOG". */
  word?: string;
}

export interface RecognitionResult {
  kindId: string;
  confidence: number;  // 0..1
  alternatives: string[]; // other kindIds
}

export type Screen =
  | "splash"
  | "home"
  | "draw"
  | "reveal"
  | "world"
  | "game"
  | "write"
  | "packs";

export interface WorldPack {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  price: string | null; // null = free
  locked: boolean;
  gradient: string;     // css gradient for card
  prompts: string[];    // suggested things to draw
}

/* ── writing worlds ──────────────────────────────────────────────────────────
   Letters, numbers and words are a different kind of world: nothing lives in
   them, you go there to *make* something. They share the tracing screen, so
   they are described by data rather than by three near-identical components. */

export type WritingWorldId = "letters" | "numbers" | "words";

export interface WritingWorld {
  id: WritingWorldId;
  name: string;
  tagline: string;
  /** What a grown-up would call it, for the parent-facing line. */
  teaches: string;
  gradient: string;
  /** Wax colour for this world's controls. */
  tone: string;
}
