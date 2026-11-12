import type { CapacitorConfig } from '@capacitor/cli';

// Two ways to ship the Android app:
// 1. Shell (like the Amazon app): set TASKING_APP_URL to your hosted site before `npx cap sync`.
//    The APK opens that URL, so every web deploy updates the app without a new APK.
// 2. Bundled: leave TASKING_APP_URL unset. The APK carries the built web files (dist/) and talks to
//    the API at VITE_API_URL, which you must set at build time.
const appUrl = process.env.TASKING_APP_URL; // e.g. https://YOUR-TASKING-DOMAIN.example

const config: CapacitorConfig = {
  appId: process.env.TASKING_APP_ID ?? 'com.example.tasking', // PLACEHOLDER: change before publishing
  appName: 'Tasking',
  webDir: 'dist',
  server: appUrl ? { url: appUrl, cleartext: appUrl.startsWith('http://') } : undefined,
  android: { allowMixedContent: false },
};

export default config;
