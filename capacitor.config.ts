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
  server: {
    androidScheme: "https",
    hostname: "localhost",
    cleartext: true, // some video sources are plain http
  },
};

export default config;
