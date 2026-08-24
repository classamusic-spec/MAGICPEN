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
  | "swim"     // fish, turtles — cruise with a tail wiggle
  | "drive"    // cars, tractors — scoot along the ground
  | "fly"      // birds, butterflies, rockets — free flight
  | "float"    // balloons, bubbles — drift upward and bob
  | "twinkle"  // stars, suns — hover and shimmer
  | "grow"     // flowers, trees — rooted, swaying
  /* ── motion styles that belong to a particular kind of thing ── */
  | "orbit"    // planets — circle a slow invisible centre
  | "jet"      // jellyfish, octopus — squeeze, surge, then drift
  | "scuttle"  // crabs — sideways skitter with a pause
  | "stomp"    // big dinosaurs — heavy steps that shake the ground
  | "waddle"   // chickens, ducks, penguins — rock side to side
  | "graze"    // cows, sheep, horses — amble, dip the head, chew
  | "hover"    // UFOs — hold station, bob, then slide somewhere new
  | "streak"   // comets, shooting stars — dash across and come round again
  | "erupt"    // volcanoes — rooted, puffing, occasionally spectacular
  | "sway"     // palm trees, seaweed — rooted, arcing in a current
  | "crawl"    // snakes, worms, crabs
  | "bounce";  // generic critter

export interface CreatureKind {
  id: string;           // "fish" | "car" | ...
  label: string;        // "Fish"
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
  /** How much of this creature's life the child has been present for.
   *
   *  The only number the growing-up feature persists: size, and everything that
   *  follows from size, is derived from it (see `lib/social`). Earned mostly by
   *  *visits* rather than by elapsed days, so a creature nobody has seen for a
   *  month is exactly as it was rather than reproachfully enormous. Absent on
   *  every creature drawn before this existed, and absent reads as 0. */
  care?: number;
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
  | "paintworld";

export interface WorldPack {
  id: string;
  name: string;
  tagline: string;
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

/* ── Dream World ──────────────────────────────────────────────────────────────
   The blank world: the child paints their own background and it comes alive.
   Stored in the pixel space it was drawn in (dw×dh) plus a ground line, so the
   renderer can scale it to any screen and stand creatures on the ground. */

/** What a painted region of a dream world *is*, which decides what lives there. */
export type RegionKind = "sky" | "water" | "ground";

export interface DreamWorld {
  /** Bumped on every save, so cached bakes know to redraw. */
  rev: number;
  /** The draw canvas size the strokes were captured in (CSS px). */
  dw: number;
  dh: number;
  /** Where the ground is, as a fraction 0..1 of the drawn height. */
  ground: number;
  /** The child's background, in draw-canvas pixels. */
  strokes: Stroke[];
  /**
   * Optional region mask: which parts of the world are sky, water and ground.
   * A REGION_W x REGION_H grid encoded one character per cell — see lib/regions.
   * Absent on worlds painted before regions existed; the renderer then falls
   * back to the flat `ground` line, so old worlds keep working untouched.
   */
  regions?: string;
}
