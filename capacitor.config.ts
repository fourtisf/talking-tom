import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android and iOS both ship at launch. `npx cap add android` / `npx cap add ios`
 * generate the native projects; they are gitignored because they are
 * regenerated from here.
 *
 * IMPORTANT: both platforms need usage-description strings before they will
 * pass review — see docs/native-setup.md. The microphone one is not optional:
 * iOS terminates the app on a getUserMedia call with no NSMicrophoneUsageDescription.
 *
 * The app id deliberately carries no reference to any competitor's brand (§2.2).
 */
const config: CapacitorConfig = {
  appId: 'com.biskit.game',
  appName: 'Biskit',
  webDir: 'dist',
  android: {
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
    backgroundColor: '#2e2340',
  },
  ios: {
    // 'always' keeps the canvas clear of the notch and home indicator; the
    // shell CSS already pads with env(safe-area-inset-*).
    contentInset: 'always',
    // The game draws its own background; stop the webview flashing white.
    backgroundColor: '#2e2340',
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_biskit',
      iconColor: '#A88BD8',
    },
  },
};

export default config;
