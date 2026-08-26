import type { CapacitorConfig } from "@capacitor/cli";

// ─── Native wrapper configuration ───────────────────────────────────────────
// Magic Pen is a self-contained web app; Capacitor packages the exact same
// `dist/public` build into an iOS and an Android app store binary. There is no
// server and no live-reload `server.url` here — the app runs entirely from the
// bundled files, so it works with no internet at all, on a plane or in a
// waiting room, which is the whole promise of the app.
//
// The appId is the store bundle identifier. It is easy to change now and
// effectively frozen once the app is first submitted, so confirm it before the
// first submission to App Store Connect / Google Play.
const config: CapacitorConfig = {
  appId: "com.classamusic.magicpen",
  appName: "Magic Pen",
  webDir: "dist/public",
  // The warm paper colour the web app paints before React boots, so the native
  // window never flashes white or black between the splash and the first frame.
  backgroundColor: "#fdf3e3",
  plugins: {
    SplashScreen: {
      // The web app paints its own paper immediately, so the native splash only
      // needs to cover the very first paint, then hand off without a spinner.
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#fdf3e3",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // Dark glyphs on the warm paper background (Capacitor's "LIGHT" style
      // means a light bar with dark content).
      style: "LIGHT",
      backgroundColor: "#fdf3e3",
      overlaysWebView: false,
    },
  },
};

export default config;
