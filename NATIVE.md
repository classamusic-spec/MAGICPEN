# Drawlings as a native app (Capacitor)

Drawlings is a self-contained web app. Capacitor packages the exact same
`dist/public` build into an iOS and an Android store binary — there is no
server, no live reload, and no network calls, so the native app works fully
offline, just like the web one.

- **App name:** Drawlings
- **Bundle id / applicationId:** `com.classamusic.magicpen`
  (set in `capacitor.config.ts`, `ios` project settings, and
  `android/app/build.gradle` — change all three together, and do it **before**
  the first store submission, after which the id is effectively frozen).

## One-time setup on a build machine

The native projects (`ios/`, `android/`) are committed, but their build
outputs are not. You need:

- **Both platforms:** Node 20+, then `npm install`.
- **Android:** a JDK (17+) and the Android SDK (platform + build-tools 35).
  Android Studio installs these; set `ANDROID_HOME`.
- **iOS:** macOS with Xcode and CocoaPods (`sudo gem install cocoapods`).

## The build flow

The web assets inside the native projects are produced by `cap sync`, not
checked in, so **always build the web app first**:

```sh
npm run build        # Vite build + service worker → dist/public
npx cap sync         # copy dist/public into ios/ and android/, update plugins
```

Then:

```sh
npx cap open android   # opens Android Studio → Build / Run / Generate Signed Bundle
npx cap open ios       # opens Xcode → Run / Archive
```

Or from the command line:

```sh
# Android debug APK
cd android && ./gradlew assembleDebug
# Android release bundle (needs your signing config)
cd android && ./gradlew bundleRelease
```

iOS release binaries are archived and uploaded from Xcode (Product → Archive).

## Icons and splash screens

The launcher icon is drawn in the app's own hand (a wax crayon on warm paper) —
see the source SVG in `assets/`:

- `assets/icon-only.png` — 1024², opaque (iOS + Android legacy icon)
- `assets/icon-foreground.png` / `icon-background.png` — Android adaptive icon
- `assets/splash.png` / `splash-dark.png` — 2732² launch screen

To regenerate every platform size after changing the art:

```sh
npx @capacitor/assets generate \
  --iconBackgroundColor '#fdf3e3' --iconBackgroundColorDark '#fdf3e3' \
  --splashBackgroundColor '#fdf3e3' --splashBackgroundColorDark '#fdf3e3'
```

## Permissions

Drawlings declares no device permissions and can prompt for none.

- **iOS:** `Info.plist` carries no usage-description keys, so the OS never shows
  a permission dialog.
- **Android:** only the `INTERNET` permission is present (the Capacitor default,
  and unused — the app makes no network requests); nothing is requested at
  runtime.

Sharing and printing go through the OS share sheet / print dialog and sit behind
the in-app parental gate — they are not device permissions.

`ITSAppUsesNonExemptEncryption = false` is set so the App Store export-compliance
question is answered automatically at upload.

## Native shell wiring

`src/lib/native.ts` (called from `main.tsx`) is a no-op on the web and, inside
the native shell:

- routes the **Android hardware back button** to the app's own screen
  navigation (screens move by state, not browser history), leaving the app only
  from a root screen;
- hides the launch splash on the first painted frame;
- keeps the status bar dark-on-paper.
