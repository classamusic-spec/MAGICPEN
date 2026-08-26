// ─── Native shell wiring (Capacitor) ────────────────────────────────────────
// Magic Pen runs identically as a web page and as an iOS/Android app. On the
// web these calls are no-ops; only inside the native shell do they do anything.
// Everything here is best-effort — a failed bridge call must never keep the
// app from starting — so each promise swallows its own errors.

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Fired when the Android hardware back button is pressed. A screen that can
 *  handle it calls `preventDefault()`; if nobody does, the app exits. */
export const BACK_EVENT = "magicpen:backbutton";

export function initNative(): void {
  if (!Capacitor.isNativePlatform()) return;

  // Android hardware back: offer it to the app first (it navigates between
  // screens itself, without browser history), and only leave the app if the
  // current screen chooses not to handle it.
  CapApp.addListener("backButton", () => {
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
