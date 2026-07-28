import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android first, iOS after (spec §1). `npx cap add android` generates the
 * native project; it is gitignored because it is regenerated from here.
 *
 * The app id deliberately carries no reference to any competitor's brand (§2.2).
 */
const config: CapacitorConfig = {
  appId: 'com.biskit.game',
  appName: 'Biskit',
  webDir: 'dist',
  android: {
    // Keeps text and canvas crisp on high-DPI panels.
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_biskit',
      iconColor: '#A88BD8',
    },
  },
};

export default config;
