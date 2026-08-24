// ─── Drawing school: what to teach, in what order ───────────────────────────
// The app has always had exactly one way in — draw something freehand — and a
// four-year-old who cannot yet draw a fish has no way to get a fish. Writing
// School already solved this shape of problem for letters: put a faint guide
// under the finger and the child writes an A on their first try. This is the
// same answer for drawing.
//
// The roster is picked by hand, not generated, and it was picked by rendering
// every candidate guide and looking at it. Two doodles that are perfectly good
// pictures make bad lessons: the T-Rex and the Triceratops are built from
// overlapping filled blobs, and once the fills are gone their outlines cross
// into mush. A child cannot trace mush. They stay drawings and are not lessons.
//
// Order inside a world is easiest first, by how many marks the guide asks for
// — a starfish is one closed line, a turtle is six. Nothing is locked: a child
// who wants the turtle first may have the turtle first. The order is a
// suggestion the layout makes, not a gate.

/** One thing a child can be taught to draw. */
export interface DrawLesson {
  /** Progress key. Persisted in `WritingProgress` — do not rename.
   *  The `draw:` prefix is what keeps these out of the letter counts. */
  key: string;
  /** The creature kind this teaches. Doubles as the doodle name: every kind in
   *  `WORLD_ROSTERS` has artwork under the same id in `lib/doodles`. */
  kindId: string;
  /** Which world's section it sits in, and which world it is born into. */
  worldId: string;
  /** On the tracing sheet. */
  title: string;
  /** One line of how. Said the way you would say it out loud to a child, not
   *  the way a manual would write it: "start with the big round body". */
  hint: string;
}

const L = (worldId: string, kindId: string, title: string, hint: string): DrawLesson => ({
  key: `draw:${kindId}`, kindId, worldId, title, hint,
});

export const DRAW_LESSONS: DrawLesson[] = [
  /* ── Magic Reef ────────────────────────────────────────────────────────── */
  L("ocean", "starfish", "Draw a starfish", "One long line, all the way round the points."),
  L("ocean", "fish", "Draw a fish", "A big round body, then a triangle tail."),
  L("ocean", "shark", "Draw a shark", "A long body, then the fin on top."),
  L("ocean", "whale", "Draw a whale", "A huge round body — whales are the biggest of all."),
  L("ocean", "jellyfish", "Draw a jellyfish", "A bell on top, then wiggly bits hanging down."),
  L("ocean", "crab", "Draw a crab", "A wide body, then a claw on each side."),
  L("ocean", "seahorse", "Draw a seahorse", "A little head, then curl the tail round."),
  L("ocean", "octopus", "Draw an octopus", "A big round head, then all the arms."),
  L("ocean", "turtle", "Draw a turtle", "The shell first — it's the biggest part."),

  /* ── Giggle Galaxy ─────────────────────────────────────────────────────── */
  L("space", "star", "Draw a star", "Five points, without lifting your finger."),
  L("space", "planet", "Draw a planet", "A big ball, then a ring around the middle."),
  L("space", "ufo", "Draw a UFO", "A dome on top of a wide flat saucer."),
  L("space", "rocket", "Draw a rocket", "A tall pointy body, then fins at the bottom."),
  L("space", "comet", "Draw a comet", "A little ball with long streaks behind it."),
  L("space", "moon", "Draw the moon", "A big curve, then curve back in for the crescent."),
  L("space", "alien", "Draw an alien", "A tall round head with big friendly eyes."),
  L("space", "astronaut", "Draw an astronaut", "A round helmet, then the body underneath."),
  L("space", "satellite", "Draw a satellite", "A box in the middle, wings on both sides."),

  /* ── Sunny Farm ────────────────────────────────────────────────────────── */
  L("farm", "pig", "Draw a pig", "A round face, two ears, then a big snout."),
  L("farm", "tree", "Draw a tree", "A big round top, then the trunk under it."),
  L("farm", "sheep", "Draw a sheep", "Lots of little bumps — sheep are all wool."),
  L("farm", "cow", "Draw a cow", "A big head, ears out sideways, then the nose."),
  L("farm", "chicken", "Draw a chicken", "A round body, then the head on top."),
  L("farm", "barn", "Draw a barn", "The big roof first, then the walls under it."),
  L("farm", "flower", "Draw a flower", "Petals round and round, then the stalk."),
  L("farm", "horse", "Draw a horse", "A long body, then stretch the neck up high."),
  L("farm", "tractor", "Draw a tractor", "One enormous wheel, then the little one."),

  /* ── Dino Island ───────────────────────────────────────────────────────── */
  L("dino", "egg", "Draw a dino egg", "One big oval. Something is inside it."),
  L("dino", "volcano", "Draw a volcano", "A wide mountain, then smoke out of the top."),
  L("dino", "palmtree", "Draw a palm tree", "A long bendy trunk, then leaves at the top."),
  L("dino", "longneck", "Draw a long-neck", "A big body, then the neck up and up and up."),
  L("dino", "stegosaurus", "Draw a stegosaurus", "A humped back, then spikes all along it."),

  /* ── My World ──────────────────────────────────────────────────────────── */
  L("dream", "heart", "Draw a heart", "Two bumps at the top, down to a point."),
  L("dream", "rainbow", "Draw a rainbow", "Curves over the top of each other."),
  L("dream", "house", "Draw a house", "A pointy roof, then a box under it."),
  L("dream", "car", "Draw a car", "A long shape, then two round wheels."),
  L("dream", "bird", "Draw a bird", "A round body, then a little pointy beak."),
  L("dream", "sun", "Draw the sun", "A circle, then rays poking out all round."),
  L("dream", "butterfly", "Draw a butterfly", "Two wings each side, big ones on top."),
  L("dream", "cat", "Draw a cat", "A round face, then two pointy ears."),
];

/** The lessons for one world, in teaching order. */
export const lessonsForWorld = (worldId: string): DrawLesson[] =>
  DRAW_LESSONS.filter((l) => l.worldId === worldId);

/** Every world that has lessons, in the order Home lists the worlds. */
export const LESSON_WORLDS = ["ocean", "space", "farm", "dino", "dream"];

/** A lesson by its progress key, for reading back saved stars. */
export const lessonByKey = (key: string): DrawLesson | undefined =>
  DRAW_LESSONS.find((l) => l.key === key);
