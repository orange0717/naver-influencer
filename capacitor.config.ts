import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.kr.ninfl.app',
  appName: 'N인플',
  webDir: 'out',

  server: {
    url: 'https://naver-influencer.vercel.app',
    cleartext: false,
  },

  ios: {
    scheme: 'Ninfl',
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#E4C1B8',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#E4C1B8',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
