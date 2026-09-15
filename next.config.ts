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
  /* v0.35.2 (IMG-CACHE-3) — the router-cache half of the artwork fix.
   * Next defaults to staleTimes.dynamic = 0: every client navigation to a
   * dynamic route (home/movies/series are force-dynamic) re-runs the RSC
   * round-trip and shows loading.tsx skeletons, UNMOUNTING every <img> the
   * user just saw — so returning to home always looked like «عکسا لود شده
   * نیستن» even when the service worker had every byte cached. With a stale
   * window, back-navigation inside it reuses the rendered tree as-is: zero
   * refetch, zero skeleton, images never even remount. Catalog/user rows
   * behind the page keep updating via their own client providers, so the
   * staleness is invisible in practice.
   * v0.35.4 (IMG-CACHE-5): 60s → 600s. The 60s window expired mid-session
   * (and any router.refresh() — a favorite toggle or progress save —
   * invalidates the whole router cache anyway), after which every page
   * return remounted from a skeleton again. 10 minutes keeps the tree alive
   * across a realistic browsing stretch; the SWR data layer in
   * useAsyncData covers the remounts that still happen. */
  experimental: {
    staleTimes: { dynamic: 600, static: 300 },
  },
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
        /* ART-3.0 (v0.36.0) — /covers/:path* now ALSO serves the desktop
         * LOCAL covers-store: static public/covers files (dev, bundled-cover
         * installs, the Android web root) always win; when they are absent —
         * the packaged cover-light installer — the request falls through to
         * /api/covers/file/... which streams from userData/covers-store.
         * posterSrc can therefore mount /covers/<tt>/poster.webp everywhere
         * without caring which backend is behind it. */
        async rewrites() {
          return {
            beforeFiles: [],
            afterFiles: [{ source: "/covers/:path*", destination: "/api/covers/file/:path*" }],
            fallback: [],
          };
        },
      }
    : {}),
};

export default nextConfig;
