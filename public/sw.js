/* v0.34.4 (IMG-CACHE-1) — Frame's image-only service worker.
 *
 * The user-facing problem this fixes: posters/covers used to re-download
 * every time the user left a page and came back («کافیه یک لحظه بره به یک
 * صفحه دیگه برگرده، باید دوباره عکس‌ها لود بشن»). The artwork hosts send
 * perfectly cacheable headers, but lazy <img> remounts + renderer memory
 * pressure + one failed fetch per session (then the onerror chain swaps in
 * the SVG placeholder) meant a fresh round-trip far too often — painfully
 * visible on Iranian networks.
 *
 * Scope: IMAGES ONLY, and only the artwork allowlist below. Nothing else
 * (no HTML, no RSC payloads, no /api/x data, no video ranges) ever touches
 * this worker, so app-update and catalog-sync flows are untouched.
 *
 * Strategy: cache-first, no background revalidation — key art is immutable
 * (metahub serves max-age=60d; local /covers files and generated SVGs are
 * content-addressed by slug). A stale poster is indistinguishable from a
 * fresh one, and skipping revalidation is what makes back-navigation paint
 * instantly from disk instead of hitting the network.
 *
 * Storage: one Cache API bucket, trimmed to MAX_ENTRIES (oldest-inserted
 * first). ~500 posters/page × 54KB ⇒ tens of MB in normal use; the cap is
 * only a safety net for binge sessions. Opaque (no-cors) responses from
 * metahub are cacheable exactly like same-origin ones.
 */

const VERSION = "frame-img-v1";
const MAX_ENTRIES = 5000;

/* Artwork allowlist — keep in sync with posterSrc/backdropSrc (src/lib/covers.ts)
 * and the IMG_FALLBACK chain (src/app/layout.tsx):
 *   • images.metahub.space  — remote poster/background streams (default)
 *   • live.metahub.space    — the 307 target some metahub variants use
 *   • /covers/…             — locally-merged cover packs + fallback SVGs
 *   • /api/cover/…          — on-demand generated SVG key art */
const ART_HOST_RE = /(^|\.)metahub\.space$/i;

function isArtRequest(request) {
  if (request.method !== "GET") return false;
  if (request.destination && request.destination !== "image") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (ART_HOST_RE.test(url.hostname)) return true;
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith("/covers/") || url.pathname.startsWith("/api/cover/");
  }
  return false;
}

/** Keep the bucket bounded: drop the oldest half when over budget. */
async function trimCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const excess = keys.length - Math.floor(MAX_ENTRIES / 2);
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  } catch {
    /* a failed trim must never break a response */
  }
}

self.addEventListener("install", (event) => {
  // No precache: the catalog is 20k+ titles — the user's own browsing IS the
  // working set. Activate immediately so the very first session is cached.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isArtRequest(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      let hit = null;
      try {
        hit = await cache.match(request, { ignoreVary: true });
      } catch {
        /* match errors on opaque corner cases — fall through to network */
      }
      if (hit) return hit;

      try {
        const fresh = await fetch(request);
        // Only cache real artwork; a 404/error would poison the bucket for
        // the fallback chain (metahub 404 → webp retry → SVG placeholder).
        if (fresh && (fresh.ok || fresh.type === "opaque")) {
          cache.put(request, fresh.clone()).then(() => trimCache(VERSION), () => {});
        }
        return fresh;
      } catch (e) {
        // Network failed AND nothing cached: surface the failure so the
        // app-level onerror chain (webp retry → metahub → SVG) still runs.
        throw e;
      }
    })(),
  );
});
