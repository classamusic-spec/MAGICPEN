// ─── One true thing about each creature ──────────────────────────────────────
// The worlds are already full of science — a reef, a galaxy, a farm, an island
// of dinosaurs — but the app never said any of it out loud. When a child looks
// closely at a creature they drew, this is the small, true, surprising thing it
// tells them. A fact, not a lesson: one sentence, said the way you would say it
// to a delighted four-year-old, and every one of them actually true.
//
// Keyed by creature kind. Anything without an entry simply shows no fact rather
// than a made-up one — a wrong fact taught to a small child is worse than none.

export const CREATURE_FACTS: Record<string, string> = {
  /* ── the reef ── */
  fish: "Fish breathe underwater using gills instead of a nose!",
  starfish: "A starfish can grow a whole new arm if it loses one!",
  octopus: "An octopus has three hearts and blue blood!",
  crab: "Crabs walk sideways because of the way their legs bend!",
  seahorse: "It's the daddy seahorse who carries the babies!",
  turtle: "A sea turtle can hold its breath for hours underwater!",
  shark: "A shark can have thousands of teeth in its whole life!",
  jellyfish: "A jellyfish has no brain, no bones, and no heart!",
  whale: "The blue whale is the biggest animal that has ever lived!",

  /* ── the galaxy ── */
  planet: "There are eight planets going around our Sun!",
  mercury: "Mercury is the closest planet to the Sun — super hot!",
  venus: "Venus is the hottest planet, even hotter than Mercury!",
  mars: "Mars is called the Red Planet because its dirt is rusty!",
  moon: "The Moon has no wind, so footprints stay for a very long time!",
  star: "Stars are giant balls of burning gas, far, far away!",
  sun: "The Sun is a star — our very own star!",
  rocket: "A rocket has to go super fast to leave the Earth!",
  ufo: "UFO just means a flying thing nobody can name yet!",
  alien: "Nobody has ever found a real alien… but space is very big!",
  astronaut: "Astronauts float because there's no gravity to hold them down!",
  comet: "A comet is a giant snowball flying through space!",
  satellite: "Satellites help your phone know where you are!",

  /* ── the farm ── */
  cow: "A cow has four tummies to help it eat all that grass!",
  pig: "Pigs roll in mud to keep cool — they can't sweat much!",
  chicken: "A chicken can remember more than a hundred faces!",
  sheep: "A sheep's wool never stops growing, like your hair!",
  horse: "Horses can sleep standing up!",
  duck: "A duck's feathers are so oily that water rolls right off!",
  tractor: "A tractor's back wheels are huge so it won't get stuck in mud!",

  /* ── the island ── */
  trex: "A T-Rex had tiny arms but a bite stronger than a lion!",
  triceratops: "Triceratops had three horns to keep it safe!",
  stegosaurus: "Stegosaurus had a brain the size of a walnut!",
  longneck: "Long-necks were so tall they could eat the treetops!",
  pterodactyl: "Pterodactyls flew, but they were not birds!",
  volcano: "A volcano is a mountain that can puff out hot melted rock!",
  egg: "Every dinosaur once started inside an egg!",
  palmtree: "A coconut can float across the whole sea to grow a new tree!",

  /* ── everyday ── */
  cat: "A cat says hello by rubbing its head on you!",
  dog: "A dog smells the world a million times better than you do!",
  bird: "Some birds fly all the way around the world every year!",
  butterfly: "A butterfly tastes with its feet!",
  bee: "Bees do a little dance to tell each other where flowers are!",
  frog: "A frog drinks water through its skin — it never sips!",
  snake: "A snake smells the air with its wiggly tongue!",
  tree: "A big tree can drink hundreds of buckets of water in a day!",
  flower: "Flowers turn to follow the Sun across the sky!",
  rainbow: "A rainbow is sunlight bent by tiny raindrops!",
};

/** The fact for a creature kind, or null if we don't have a true one. */
export const factFor = (kindId: string): string | null => {
  const f = CREATURE_FACTS[kindId];
  return f && f.length ? f : null;
};
