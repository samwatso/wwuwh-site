import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wwuwh.app',
  appName: 'Wickham Wave',
  webDir: 'dist',
  ios: {
    allowsLinkPreview: false,
    path: 'ios',
  },
};

export default config;
