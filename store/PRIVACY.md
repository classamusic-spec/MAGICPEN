# Privacy — answers for the store consoles

The user-facing privacy policy is `public/privacy.html` (host it and link its
URL in both consoles). This file gives the exact answers for the two consoles'
privacy questionnaires. All of it follows from one fact: **Drawlings collects
nothing and makes no network requests.** Everything a child makes is stored in
the app's own on-device storage and never leaves the device.

## Apple — App Privacy ("Data Not Collected")

In App Store Connect → App Privacy, choose:

- **Data collection:** *"No, we do not collect data from this app."*

That is the whole answer — it removes every follow-up question. It is accurate:
the app has no server, no analytics SDK, no ad SDK, and no tracking, and makes
no network requests. Everything a child makes lives only in on-device storage.

- **Export compliance:** `ITSAppUsesNonExemptEncryption = false` is already set
  in `Info.plist`, so the encryption question is answered automatically.
- **Kids Category:** if you list in the Kids category, confirm no third-party
  analytics or advertising — there is none.

## Google Play — Data safety form

- **Does your app collect or share any of the required user data types?** No.
- **Is all of the user data encrypted in transit?** Not applicable — no data
  leaves the device.
- **Do you provide a way for users to request that their data is deleted?**
  Yes — clearing the app's storage or uninstalling deletes everything; there is
  no server copy. (State this; there is no account to delete.)
- **Data types collected/shared:** none.
- **Families / Target audience:** children. Complete the Play Families
  questionnaire; the app has no ads and no third-party SDKs, and works offline.

## Permissions declared

| Permission | Platform | Why |
|---|---|---|
| _None_ | iOS | The app declares no device permissions and can prompt for none. |
| _None_ | Android | Only `INTERNET` is present (Capacitor default, unused); no runtime permission is requested. |

The app never prompts for a device permission. Sharing and printing use the OS
share sheet / print dialog and sit behind the in-app parental gate.
