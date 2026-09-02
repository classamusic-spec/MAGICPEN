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

/* ── what this shell can actually do with a picture ──────────────────────────
   Both WebViews define the APIs below and then quietly do nothing with them,
   which is the worst possible failure: a grown-up taps Print, watches a
   preview appear, and no printer dialog ever comes. So the app asks what the
   shell can really do and only offers the doors that open.

   The split is not arbitrary. A real browser can print a page and can save a
   file. iOS can do neither directly, but WKWebView has the system share sheet
   — and AirPrint lives inside it, so the fridge is still reachable. Android's
   WebView is the one that can do none of the three: no Web Share API, and an
   `<a download>` needs a native download listener this shell does not set. */

/** Can this shell put a page on paper? Only a real browser opens a dialog. */
export const canPrintPage = (): boolean =>
  typeof window !== "undefined" && !Capacitor.isNativePlatform();

/** Can this shell write a file to the device? Same answer, different door. */
export const canSaveFile = (): boolean =>
  typeof window !== "undefined" && !Capacitor.isNativePlatform();

/** Can this shell hand a file to the system — the share sheet, and AirPrint
 *  with it? Asked with the real file where there is one, since `canShare`
 *  judges the payload and not just the platform. */
export const canShareFiles = (files?: File[]): boolean => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (!files) return true;                       // deciding whether to offer it at all
  return navigator.canShare?.({ files }) ?? false;
};

/** Is there any way at all to get a picture out of here? When this is false
 *  the control is not drawn, because there is nothing behind it. */
export const canOfferPicture = (): boolean => canShareFiles() || canSaveFile();

/**
 * Resolve one back press against whatever is open.
 *
 * The newest registered handler that claims the press wins; true means it was
 * consumed and nothing else should act on it. Exported so the rule can be
 * exercised without a device — the caller below is the only part that needs
 * a native shell.
 */
export function handleBack(): boolean {
  for (let i = backStack.length - 1; i >= 0; i--) {
    if (backStack[i]()) return true;
  }
  // nothing open: screen navigation gets its say
  const ev = new CustomEvent(BACK_EVENT, { cancelable: true });
  return window.dispatchEvent(ev) === false; // false ⇒ preventDefault called
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
    if (!handleBack()) CapApp.exitApp();
  }).catch(() => {
    /* No App plugin on this shell. Nothing else here depends on the listener,
       and the file's rule is that a failed bridge call never keeps the app
       from starting — so this is a shell without a hardware back button, not
       an error to surface. */
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
