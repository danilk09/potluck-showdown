import type { CapacitorConfig } from '@capacitor/cli';

// CAP_EMULATORS=1 builds a debug APK that talks to the local Firebase
// emulators (http://10.0.2.2). Never set it for a release build.
const emulators = process.env.CAP_EMULATORS === '1';

const config: CapacitorConfig = {
  appId: 'com.potluckshowdown.app',
  appName: 'Potluck Showdown',
  webDir: 'dist',
  android: {
    backgroundColor: '#FFF7F2',
    allowMixedContent: emulators,
  },
  server: emulators ? { cleartext: true } : undefined,
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: '#FFF7F2',
      showSpinner: false,
    },
  },
};

export default config;
