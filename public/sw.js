/* v0.35.3 (IMG-CACHE-4) — Frame's image-only service worker.
 *
 * IMG-CACHE-2 hardens what v0.34.4 shipped: metahub art is cached as
 * OPAQUE (no-cors) responses, and Chromium pads opaque entries with up to
 * ~15MB of phantom size in its quota math — on devices with small disks
 * (32GB Android tablets are common) the padded estimate blew past the
 * origin quota and every later cache.put() silently failed, which looked
 * EXACTLY like "no cache": art re-downloaded on every navigation even
 * though earlier puts had succeeded. put() is now quota-resilient: on the
 * first failure the bucket is evicted down to a quarter of the cap and the
 * put is retried once from a second clone of the response.
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
 * IMG-CACHE-4 (v0.35.3) adds the poison-heal protocol: opaque responses
 * hide their HTTP status, so a metahub 404/429/503 error page used to be
 * cached exactly like a real image and served FOREVER by cache-first —
 * the reported «تصاویر دیگر اصلاً لود نمی‌شوند». Two halves:
 *   • page-side (layout.tsx IMG_FALLBACK): on <img> error for a metahub
 *     url, delete the cached entry and retry once with ?_rw=<ts>;
 *   • worker-side (below): _rw requests are a pure network pass-through —
 *     they are NEVER written to the bucket, so the heal cannot re-poison
 *     the key it just cleaned. A url that recovers is re-cached by the
 *     next normal fetch. The v2→v3 bucket bump also wipes every existing
 *     poisoned entry in one move.
 *
 * Storage: one Cache API bucket, trimmed to MAX_ENTRIES (oldest-inserted
 * first). ~500 posters/page × 54KB ⇒ tens of MB in normal use; the cap is
 * only a safety net for binge sessions. Opaque (no-cors) responses from
 * metahub are cacheable exactly like same-origin ones.
 */

const VERSION = "frame-img-v3";
const MAX_ENTRIES = 5000;
const EVICT_FLOOR = 1250; // put()-failure eviction target (MAX_ENTRIES / 4)

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

  /* IMG-CACHE-4: ?_rw=<ts> marks a HEAL retry. The page-side error chain
   * adds it after deleting a poisoned entry (an opaque response hides its
   * status — status, headers and body are ALL redacted, and even
   * `redirected` reads false for opaque responses, so the worker CANNOT
   * tell a poster from a metahub 404/429/503 error page at fetch time).
   * The heal contract is therefore: a _rw request is a pure NETWORK
   * PASS-THROUGH that is NEVER written to the bucket. Combined with the
   * page-side delete-before-retry, the invariant is:
   *   after any <img> decode failure the failing url is OUT of the bucket,
   *   and poison can never be (re)written by the heal itself. A url that
   *   recovered while we were away is re-cached by the next normal fetch
   *   (which finds the bucket empty for it) — self-repair, one fetch. */
  let heal = false;
  try {
    heal = new URL(request.url).searchParams.has("_rw");
  } catch {
    heal = false;
  }

  if (heal) {
    event.respondWith(fetch(request));
    return;
  }

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
        // Cache only plausible artwork: same-origin responses carry a real
        // status (ok=false on 404/500 → never stored). Opaque responses are
        // indistinguishable from errors at this layer — accepted here,
        // because any entry that fails to DECODE is deleted by the page-side
        // heal on its very first failure and never re-written by the retry,
        // so poison cannot survive a render pass.
        if (fresh && (fresh.ok || fresh.type === "opaque")) {
          // Two independent clones BEFORE anything consumes the body: the
          // first satisfies the normal put, the second exists only for the
          // quota-failure retry (a Response body can be cloned while still
          // unread; after cache.put() consumed the first clone it is gone).
          const primary = fresh.clone();
          const spare = fresh.clone();
          cache
            .put(request, primary)
            .then(() => trimCache(VERSION))
            .catch(async () => {
              // QuotaExceededError (padded opaque entries) or an aborted
              // write: evict down to EVICT_FLOOR and retry exactly once.
              try {
                const keys = await cache.keys();
                const excess = keys.length - EVICT_FLOOR;
                for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
                await cache.put(request, spare);
              } catch {
                /* a failed trim must never break a response */
              }
            });
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
