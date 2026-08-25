// ─── Magic stamps: the instant-creature pathway ─────────────────────────────
// Drawing School lets a child *trace* a creature they can't yet draw; the magic
// stamp is the rung below that — for the youngest hands, tap once and the
// creature is made. It is deliberately a *toy stamp*: the child still chooses
// which creature and which world it belongs to, so it reads as "I stamped a
// fish", not "the app drew one for me".
//
// A stamped creature has no strokes of its own — its body is the doodle art,
// exactly like a Word World creature (see `Creature.doodleId`). So a stamp is
// nothing more than a (kindId, doodleId) pair the world already knows how to
// bake, which keeps this file tiny and impossible to get out of step with the
// creature catalog.

import { rosterFor } from "@/lib/creatures";
import { hasDoodle } from "@/lib/doodles";

export interface Stamp {
  /** The creature kind this stamp makes — drives behaviour, names, facts. */
  kindId: string;
  /** The doodle drawn as its body. Equal to `kindId` for every roster kind. */
  doodleId: string;
  /** What a screen reader announces, e.g. "Stamp a fish". */
  label: string;
}

/**
 * The stamps offered in a given world, in the world's own roster order.
 *
 * It is the world roster minus the "mystery" escape hatch (there is no such
 * thing as a mystery *stamp* — a stamp is by definition a known picture), and
 * minus any kind with no doodle to draw, so every stamp is guaranteed to
 * render. Every current roster kind has a doodle, so nothing is dropped today;
 * the guard is there so adding a doodle-less kind can never ship a blank stamp.
 */
export function stampsFor(worldId: string): Stamp[] {
  const out: Stamp[] = [];
  for (const kind of rosterFor(worldId)) {
    if (kind.id === "mystery") continue;
    if (!hasDoodle(kind.id)) continue;
    out.push({ kindId: kind.id, doodleId: kind.id, label: `Stamp ${indefinite(kind.label)}` });
  }
  return out;
}

/**
 * "a fish" / "an octopus" — a/an for the aria label, chosen by *sound*, not
 * spelling: a "ufo" starts with a vowel letter but a consonant sound ("you-"),
 * so it takes "a", while an "hour" is the reverse. Best-effort on the handful
 * of exceptions that actually appear in the roster.
 */
function indefinite(label: string): string {
  const l = label.toLowerCase();
  const consonantSound = /^(ufo|uni|use|user|ewe|one)/; // vowel letter, "you-/wuh-" sound
  const vowelSound = /^(hour|honest|honou?r)/; // consonant letter, vowel sound
  const an = (/^[aeiou]/.test(l) && !consonantSound.test(l)) || vowelSound.test(l);
  return `${an ? "an" : "a"} ${l}`;
}
