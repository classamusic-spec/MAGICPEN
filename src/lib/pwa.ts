// ─── Installing the app on the device ───────────────────────────────────────
// Registers the service worker that makes Drawlings work with no network at
// all. Everything the app needs — every world, every lesson, every doodle — is
// already local; this is what stops the browser needing a server to hand it
// over.
//
// Three rules, all of them about not breaking a child's afternoon:
//
//   1. Production only. A worker caching a dev server's assets makes editing
//      the app a maddening experience, and `import.meta.env.PROD` is the line
//      that prevents it.
//
//   2. Never take over a running app. The worker itself does not call
//      `skipWaiting`, and nothing here asks it to. A new version waits for
//      every tab to close. Swapping hashed chunks under a running app means a
//      lazy chunk that no longer exists, which is a blank screen in the middle
//      of someone's drawing — and this app's whole promise is that the magic
//      never fails.
//
//   3. Never let registration failures reach the child. A browser in private
//      mode, an OS that has run out of storage, a locked-down enterprise
//      profile: all of them throw here, and all of them are fine. The app works
//      exactly as it did before, just online-only.

/** Registered once per page load, and never on a dev server. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  /* After `load`, so fetching the shell never competes with the first paint.
     Offline is for the *next* visit; this one already has a network. */
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* private mode, no quota, a policy that forbids workers — the app is
         simply online-only on this device, which is where it started. */
    });
  });
}

/**
 * Is a version of the app on this device that a relaunch would pick up?
 *
 * Nothing in the app uses this yet — there is deliberately no "update
 * available" banner, because a three-year-old cannot act on one and a parent
 * did not come here to administer software. It exists so the grown-ups' screen
 * can one day say "a new version is ready, close and reopen" in plain words.
 */
export function updateWaiting(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker
    .getRegistration()
    .then((reg) => Boolean(reg && reg.waiting))
    .catch(() => false);
}
