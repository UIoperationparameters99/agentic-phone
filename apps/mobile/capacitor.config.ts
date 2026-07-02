import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the Next.js static export as an Android APK.
 *
 * Build flow:
 *   pnpm mobile:build       (next build → out/)
 *   pnpm mobile:cap:sync    (copy out/ into android/)
 *   pnpm mobile:apk         (gradle assembleDebug → APK)
 */
const config: CapacitorConfig = {
  appId: 'ai.agentic.phone',
  appName: 'Agentic',
  webDir: 'out',
  server: {
    // Allow the WebView to make fetch() calls to external origins (LLM providers, Daytona).
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    // Allow mixed content (HTTPS app talking to HTTP sandboxes if needed).
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
  },
};

export default config;
