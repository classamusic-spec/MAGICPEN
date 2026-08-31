// ─── Treats ─────────────────────────────────────────────────────────────────
// What a child can give a creature. Tapping empty water has always dropped a
// crumb; this lets the child choose *what* the crumb is — an apple, a slice of
// cake, or something they drew themselves.
//
// ── the rule ──
// A treat is a present, never a requirement. Nothing in Drawlings gets hungry,
// and feeding is not a chore that resets a timer: it is one more way to say
// hello. The world scene says the same thing in its own comment — *"food is a
// treat, not a save file"* — and that is why a dropped treat is never persisted.
// Only the *recipe* for a hand-drawn one is remembered (see `storage.saveFood`).

/** A treat the child can pick from the tray. */
export interface Food {
  /** Stable id. For built-ins this is the doodle name. */
  id: string;
  /** The doodle drawn on the water. Empty for a hand-drawn treat. */
  doodleId: string;
  /** What a screen reader says, e.g. "Give them an apple". */
  label: string;
  /** Caption under the tile. */
  name: string;
}

/**
 * The built-in treats, in the order they appear in the tray.
 *
 * Drawn from doodles that already exist, so every tile is guaranteed to render
 * and nothing here can drift out of step with the art. Deliberately short: a
 * tray, not a pantry — six good choices a three-year-old can scan beats twenty
 * they have to hunt through.
 */
export const FOODS: Food[] = [
  { id: "apple", doodleId: "apple", name: "Apple", label: "Give them an apple" },
  { id: "cake", doodleId: "cake", name: "Cake", label: "Give them cake" },
  { id: "icecream", doodleId: "icecream", name: "Ice cream", label: "Give them ice cream" },
  { id: "orange", doodleId: "orange", name: "Orange", label: "Give them an orange" },
  { id: "leaf", doodleId: "leaf", name: "Leaf", label: "Give them a leaf" },
  { id: "egg", doodleId: "egg", name: "Egg", label: "Give them an egg" },
];

/** Look one up by id. Unknown ids fall back to the plain crumb (empty doodle). */
export function foodById(id: string): Food | null {
  return FOODS.find((f) => f.id === id) ?? null;
}
