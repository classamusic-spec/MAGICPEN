// ─── Motion preference ──────────────────────────────────────────────────────
// Its own module so the component files export only components (which is what
// keeps fast refresh working).

import { useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const readReduced = () =>
  typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches;

/** True when the viewer has asked for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}
