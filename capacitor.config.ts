import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ir.frame.nama",
  appName: "Frame",
  webDir: "out",
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
    backgroundColor: "#070709",
  },
  plugins: {
    /* v0.11.0: Capacitor 8's SystemBars plugin injects --safe-area-inset-*
     * CSS vars and (WebView ≥ 140 + viewport-fit=cover) passes env() insets
     * through natively, so edge-to-edge (Android 15+, targetSdk 36) never
     * draws the status bar over our header. Keep "css" handling (default)
     * and make sure the bars stay visible above our dark UI. */
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
    cleartext: true, // some video sources are plain http
  },
};

export default config;
