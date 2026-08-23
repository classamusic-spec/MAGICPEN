// ─── The day, and coming back to it ─────────────────────────────────────────
// A world that looks the same at bedtime as it did at breakfast has no reason
// to be opened twice. This module is the app's sense of time: what part of the
// day it is (so the worlds can be lit for it), what today's drawing idea is,
// and how long the child has been away.
//
// Deliberately free of anything that pressures a four-year-old. No lost
// streaks, no expiring rewards, no notifications. Coming back is rewarded;
// staying away is never punished.

const VISIT_KEY = "magicpen.visit.v1";

export type Daypart = "dawn" | "day" | "dusk" | "night";

/** Local hour as a float, e.g. 18.5 for half six in the evening. */
const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;

export function daypart(now: Date = new Date()): Daypart {
  const h = hourOf(now);
  if (h < 5 || h >= 20.5) return "night";
  if (h < 8) return "dawn";
  if (h < 17.5) return "day";
  return "dusk";
}

/**
 * How lit the world is, 0 (deep night) → 1 (full midday), on a smooth curve.
 * Worlds tint themselves by this rather than by the coarse `daypart`, so the
 * light slides through the evening instead of snapping.
 */
export function daylight(now: Date = new Date()): number {
  const h = hourOf(now);
  // sunrise ramps 5→8, sunset ramps 17.5→20.5
  if (h <= 5 || h >= 20.5) return 0;
  if (h < 8) return (h - 5) / 3;
  if (h < 17.5) return 1;
  return 1 - (h - 17.5) / 3;
}

/** Warm at the ends of the day, neutral in the middle — the golden-hour cast. */
export function warmth(now: Date = new Date()): number {
  const k = daylight(now);
  return k <= 0 ? 0 : 1 - Math.abs(k - 0.5) * 2;
}

export const isNight = (now: Date = new Date()) => daypart(now) === "night";

/* ── today ────────────────────────────────────────────────────────────────── */

/** Days since the epoch, in local time — the same all day, different tomorrow. */
export function dayIndex(now: Date = new Date()): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** Today's drawing idea. Stable all day, different tomorrow, no repeats for
 *  a month and a half. A reason to open the app that isn't a notification. */
const IDEAS = [
  "a dragon", "your house", "a rocket", "a silly monster", "a rainbow fish",
  "a cat with a hat", "the biggest dinosaur", "a robot friend", "a butterfly",
  "a snowman", "a pirate ship", "your favourite animal", "a jellyfish",
  "a birthday cake", "a racing car", "a friendly ghost", "a unicorn",
  "an octopus", "a treehouse", "a shooting star", "a penguin", "a submarine",
  "a wizard's hat", "a family of ducks", "a hot air balloon", "a dinosaur egg",
  "something purple", "the moon", "a bumblebee", "a castle", "a crab",
  "your best friend", "a train", "a talking tree", "a spaceship", "a snail",
  "a lion", "a mermaid", "a helicopter", "a caterpillar", "a big whale",
  "a bowl of ice cream", "a happy cloud", "a tiny mouse", "a scarecrow",
];

export function dailyIdea(now: Date = new Date()): string {
  return IDEAS[((dayIndex(now) % IDEAS.length) + IDEAS.length) % IDEAS.length];
}

/* ── the visit ────────────────────────────────────────────────────────────── */

interface VisitRecord {
  /** ms timestamp of the last time the app was opened. */
  last: number;
  /** dayIndex of the last visit, so "a new day" survives a clock change. */
  lastDay: number;
  /** Consecutive days visited. Shown warmly, never taken away in the UI. */
  streak: number;
  /** How many distinct days the child has ever visited. */
  days: number;
}

export interface Visit {
  /** True the first time the app is opened on a new calendar day. */
  newDay: boolean;
  /** Hours since the last visit; Infinity on a first ever run. */
  away: number;
  /** Consecutive days, counting today. 1 on a first run. */
  streak: number;
  days: number;
  firstEver: boolean;
}

function readVisit(): VisitRecord | null {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as VisitRecord;
    return typeof v?.last === "number" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Record that the child is here, and describe the gap since last time.
 * Call once per app start — it writes, so calling it in a render would lie.
 */
export function markVisit(now: Date = new Date()): Visit {
  const prev = readVisit();
  const today = dayIndex(now);
  const t = now.getTime();

  if (!prev) {
    const rec: VisitRecord = { last: t, lastDay: today, streak: 1, days: 1 };
    try { localStorage.setItem(VISIT_KEY, JSON.stringify(rec)); } catch { /* noop */ }
    return { newDay: true, away: Infinity, streak: 1, days: 1, firstEver: true };
  }

  const newDay = today !== prev.lastDay;
  const away = (t - prev.last) / 3_600_000;
  // a streak continues if the last visit was yesterday; a gap starts a new one
  const streak = !newDay ? prev.streak : today - prev.lastDay === 1 ? prev.streak + 1 : 1;
  const days = newDay ? prev.days + 1 : prev.days;

  const rec: VisitRecord = { last: t, lastDay: today, streak, days };
  try { localStorage.setItem(VISIT_KEY, JSON.stringify(rec)); } catch { /* noop */ }
  return { newDay, away, streak, days, firstEver: false };
}

/** Read the visit without recording one — for screens that only want to show it. */
export function peekVisit(now: Date = new Date()): Visit {
  const prev = readVisit();
  if (!prev) return { newDay: true, away: Infinity, streak: 1, days: 1, firstEver: true };
  const today = dayIndex(now);
  return {
    newDay: today !== prev.lastDay,
    away: (now.getTime() - prev.last) / 3_600_000,
    streak: prev.streak,
    days: prev.days,
    firstEver: false,
  };
}

/** A warm line for a child who has come back. Never guilt, never a countdown. */
export function welcomeBack(v: Visit): string | null {
  if (v.firstEver || v.away < 6) return null;
  if (v.away >= 168) return "Your friends missed you!";
  if (v.streak >= 3) return `${v.streak} days in a row!`;
  if (v.away >= 20) return "Your friends were waiting!";
  return "Welcome back!";
}
