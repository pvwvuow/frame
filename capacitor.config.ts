import type { CapacitorConfig } from "@capacitor/cli";

/* v0.17.0 — release hardening (Google Play Protect signals): debugging and
 * mixed content are DEV-only. scripts/mobile-build.cjs sets CAP_RELEASE=1
 * before `cap sync`, so every shipped bundle is hardened; a bare `cap sync`
 * on a dev machine keeps inspectability. */
const isDev = process.env.CAP_RELEASE !== "1";

const config: CapacitorConfig = {
  appId: "ir.frame.nama",
  appName: "Frame",
  webDir: "out",
  android: {
    // http:// video URLs ride the native Media3 player (needsNativePlayer),
    // so the WebView never needs mixed content
    allowMixedContent: false,
    webContentsDebuggingEnabled: isDev,
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
    // v0.17.0 — the WebView page itself never needs plain http anymore
    // (video http URLs are routed to Media3); cleartext exceptions live in
    // android/app/src/main/res/xml/network_security_config.xml
    cleartext: false,
  },
};

export default config;
