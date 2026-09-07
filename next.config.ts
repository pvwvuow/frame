import type { NextConfig } from "next";

/* NAMA_MOBILE=1 → static export for the Android/Capacitor build:
 * no Node server ships in the APK, so everything is pre-rendered/client. */
const isMobile = process.env.NAMA_MOBILE === "1";

const nextConfig: NextConfig = {
  output: isMobile ? "export" : "standalone",
  ...(isMobile ? { images: { unoptimized: true } } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
