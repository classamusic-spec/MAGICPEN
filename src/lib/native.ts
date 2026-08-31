// ─── Native shell wiring (Capacitor) ────────────────────────────────────────
// Drawlings runs identically as a web page and as an iOS/Android app. On the
// web these calls are no-ops; only inside the native shell do they do anything.
// Everything here is best-effort — a failed bridge call must never keep the
// app from starting — so each promise swallows its own errors.

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Fired when the Android hardware back button is pressed. A screen that can
 *  handle it calls `preventDefault()`; if nobody does, the app exits. */
export const BACK_EVENT = "magicpen:backbutton";

/* ── overlays get the back button first ──────────────────────────────────────
   A child with a sheet, a tray, or a grown-up gate open who presses back
   means "close this", not "leave the screen". Overlays register here while
   open; the newest open one consumes the press, and only when nothing is
   open does the press fall through to screen navigation. */
type BackHandler = () => boolean;
const backStack: BackHandler[] = [];

export function pushBackHandler(fn: BackHandler): () => void {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}

/** While `active`, the hardware back button closes this overlay instead of
 *  navigating. A no-op on the web, where overlays already handle Escape. */
export function useBackClose(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => { closeRef.current(); return true; });
  }, [active]);
}

export function initNative(): void {
  if (!Capacitor.isNativePlatform()) return;

  // Android hardware back: an open overlay gets it first, then the app's own
  // screen navigation (it navigates by state, not browser history), and only
  // when neither claims it does the press leave the app.
  CapApp.addListener("backButton", () => {
    for (let i = backStack.length - 1; i >= 0; i--) {
      if (backStack[i]()) return;
    }
    const ev = new CustomEvent(BACK_EVENT, { cancelable: true });
    const handled = window.dispatchEvent(ev) === false; // false ⇒ preventDefault called
    if (!handled) CapApp.exitApp();
  });

  // Dark glyphs on the warm paper bar. The config sets this too; doing it here
  // as well keeps it right after any theme flicker at launch.
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});

  // Hide the launch splash as soon as the first frame is up, so the handoff to
  // the paper is instant rather than waiting out the config's fallback timer.
  requestAnimationFrame(() => {
    SplashScreen.hide().catch(() => {});
  });
}
