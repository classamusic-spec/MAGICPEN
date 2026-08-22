// ─── Creature catalog & world packs ─────────────────────────────────────────

import type { CreatureKind, WorldPack } from "./types";

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

export const kindById = (id: string): CreatureKind =>
  CREATURE_KINDS.find((k) => k.id === id) ?? CREATURE_KINDS[CREATURE_KINDS.length - 1];

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
];

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
