// ─── My Pet ─────────────────────────────────────────────────────────────────
// A child can make thirty creatures and end up attached to none of them. This
// lets them crown one as *theirs* — the face the app is about, the one waiting
// on the home screen when they come back.
//
// It adds no new machinery. Growth, tricks, feeding, hellos and the care that
// drives them all already exist and already run for every creature (see
// `lib/social`). The pet is a pointer and a place to be seen.
//
// ── the rule this file must never break ──
// Nothing here may punish absence. No hunger, no decay, no sadness, no
// sickness, nothing dying, nothing counting down. That is not a preference,
// it is the app's stated law (`daily.ts`, `social.ts`, and the promise shown
// to parents in `GrownUps`): *coming back is rewarded; staying away is never
// punished.* A pet left for a month is exactly as it was — and pleased to see
// you. The most a long gap may ever do is make the greeting warmer.

import type { Creature } from "./types";
import type { PetRef } from "./storage";
import type { Visit } from "./daily";

/**
 * The creature a `PetRef` points at, or null.
 *
 * A dangling id is an ordinary, expected state — the creature may have been
 * released, or evicted by an older build's cap — and it simply means "no pet
 * today". Never throws, never resurrects anything.
 */
export function resolvePet(ref: PetRef | null, creatures: Creature[]): Creature | null {
  if (!ref) return null;
  return creatures.find((c) => c.id === ref.id) ?? null;
}

/** Is this creature the crowned one? Safe with a null ref. */
export function isPet(ref: PetRef | null, id: string): boolean {
  return ref != null && ref.id === id;
}

/**
 * What the pet says on the home screen.
 *
 * Warmth scales with how long it has been, and stops there: the longest gap
 * gets the fondest line, never a reproachful one. Thresholds mirror
 * `welcomeBack` in `daily.ts` so the pet and the rest of the app agree about
 * what counts as "a while".
 *
 * `name` is the pet's own name so the line reads as the pet talking.
 */
export function petGreeting(v: Visit, name: string): string {
  if (v.firstEver) return `${name} is so happy to meet you!`;
  if (v.away >= 168) return `${name} missed you!`;
  if (v.away >= 20) return `${name} was waiting for you!`;
  if (v.streak >= 3) return `${name} loves that you keep coming back!`;
  if (v.away >= 6) return `${name} is happy you're back!`;
  return `${name} is happy to see you!`;
}

/**
 * Drop the oldest creature that is *not* the pet, to stay under a cap.
 *
 * The plain `slice(-(max - 1))` this replaces evicted oldest-first, and the pet
 * is very often the oldest creature there is — so the cap would quietly delete
 * the one creature the child had chosen. Everything else about the old
 * behaviour is kept: oldest goes first, order is preserved.
 *
 * If the pet is somehow the only creature left, the cap wins — but that can
 * only happen at max = 1, which is not a real configuration.
 */
export function makeRoom(creatures: Creature[], max: number, petId: string | null): Creature[] {
  if (creatures.length < max) return creatures;
  const drop = creatures.length - (max - 1);
  const out: Creature[] = [];
  let dropped = 0;
  for (const c of creatures) {
    if (dropped < drop && c.id !== petId) {
      dropped++;
      continue;
    }
    out.push(c);
  }
  // Only the pet was left to drop: fall back to plain oldest-first rather than
  // exceeding the cap.
  if (dropped < drop) return out.slice(drop - dropped);
  return out;
}
