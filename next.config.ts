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
  /* v0.35.1 (IMG-CACHE-2) — the HTTP-cache half of the artwork fix.
   * The image service worker (public/sw.js) is the primary cache, but it
   * mounts ~2.5s after hydration and can be absent entirely (file://,
   * exotic WebViews). Next standalone serves public/ files with
   * max-age=0 (revalidate every navigation), which is exactly the
   * "posters re-download on every page change" report when no SW is
   * running. Artwork paths are content-addressed (tt ids / slugs), so a
   * long freshness window + stale-while-revalidate is safe: cover-pack
   * updates propagate within a week or after an app update instead of
   * being pinned forever (hence NOT immutable here). Output export
   * (mobile) cannot serve custom headers — Capacitor keeps its own
   * behavior, unchanged. */
  ...(!isMobile
    ? {
        async headers() {
          const artCache = [
            {
              key: "Cache-Control",
              value: "public, max-age=604800, stale-while-revalidate=2592000",
            },
          ];
          return ["/covers/:path*", "/posters/:path*", "/backdrops/:path*", "/thumbs/:path*"].map(
            (source) => ({ source, headers: artCache }),
          );
        },
      }
    : {}),
};

export default nextConfig;
