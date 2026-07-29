# Native setup — Android and iOS

Both platforms ship at launch. The native projects are **generated, not
committed**: `capacitor.config.ts` is the source of truth and `android/` and
`ios/` are gitignored.

```bash
npm install
npx cap add android
npx cap add ios      # macOS with Xcode only
npm run cap:android  # build + sync + open Android Studio
npm run cap:ios      # build + sync + open Xcode
```

Re-run `npm run cap:sync` after any web change. Re-run `npx cap add` only if you
delete a native project.

---

## Permissions you must declare, or the app is rejected

These are not optional polish. Two of them will get the build rejected or crash
it outright.

### iOS — `ios/App/App/Info.plist`

| Key | Why | Consequence if missing |
|---|---|---|
| `NSMicrophoneUsageDescription` | Voice mimic (§9) calls `getUserMedia` | **iOS terminates the app immediately** on the first mic call. Not a permission denial — a hard crash. |
| `NSUserTrackingUsageDescription` | AppLovin MAX and most mediation use IDFA | App Store rejection, and ad revenue collapses without ATT consent |
| `UIBackgroundModes` | Not needed | Do **not** add `audio`; the game has no background playback and it invites rejection |

Suggested copy, matching the in-game pre-prompt so the two do not contradict
each other:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Biskit repeats what you say back in a silly voice. Recordings stay on your device and are never uploaded.</string>

<key>NSUserTrackingUsageDescription</key>
<string>Used to show more relevant ads. Biskit works exactly the same if you say no.</string>
```

The second sentence of each is doing real work: the game genuinely is fully
playable after a denial (§15), and saying so raises accept rates honestly.

### Android — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="com.google.android.gms.permission.AD_ID" />
```

`POST_NOTIFICATIONS` is runtime-requested from Android 13 (API 33). The app
already asks via `Notifications.requestPermission()` on first run, and §14 goes
quiet on refusal.

---

## Ads and IAP adapters

Neither SDK resolves on the registry this was built against, so both sit behind
interfaces with a stub. To go live:

1. Install the mediation plugin and the billing plugin for your chosen vendors.
2. Write one adapter each — `RewardedAdProvider` (`src/services/Ads.ts`) and
   `IapProvider` (`src/services/Iap.ts`). Both are deliberately tiny: three
   methods and four methods respectively.
3. Register them in `src/main.ts` behind the `isNative` check:

```ts
if (isNative) {
  context.ads.setProvider(new MaxRewardedAdapter(/* unit ids */));
  context.iap.setProvider(new StoreKitAdapter());
}
```

Everything else — the 10/day cap, the device-local rollover, the level-3 gate,
granting nothing on a fill failure, crediting purchases through `Economy` — is
already implemented and tested against a scripted provider, and does not change.

### Store SKUs to create

From `src/config/tuning.ts`. Create these in Play Console and App Store Connect
with matching ids:

| SKU | Type | Grants |
|---|---|---|
| `biskit.coins.small` | Consumable | 1,200 coins |
| `biskit.coins.medium` | Consumable | 6,500 coins |
| `biskit.coins.large` | Consumable | 15,000 coins |
| `biskit.removeads` | Non-consumable | Suppresses forced ad formats |

**Do not create `biskit.removeads` yet.** v1 is rewarded-video only, so there is
no forced ad format for it to remove — see the README's "Deviations" section.
The code is complete and the settings row appears automatically once
`ADS.forcedFormatsEnabled` is true.

---

## iOS specifics worth knowing

- **Audio unlock.** iOS refuses an `AudioContext` before a user gesture.
  `HomeScene` unlocks the bus on the first pointer event; nothing to configure,
  but it means the very first tap makes no sound. That is expected.
- **`localStorage` is evicted.** Everything persistent goes through Capacitor
  Preferences (§2.4), enforced by a lint rule and a repo test.
- **Safe areas.** The shell pads with `env(safe-area-inset-*)` and Phaser's FIT
  scale mode letterboxes inside that, so the notch and home indicator never
  overlap the dock. Worth re-checking on a device with a Dynamic Island.
- **`preservesPitch`.** The voice effect depends on pitch preservation being
  *off*. WebKit has historically used `webkitPreservesPitch`; all three spellings
  are set in `VoiceMimic`, but this is the single most likely thing to behave
  differently on a real iPhone than in a desktop browser. Test it early.
