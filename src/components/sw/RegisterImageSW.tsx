"use client";

import { useEffect } from "react";

/* v0.34.4 (IMG-CACHE-1) — registers the image-only service worker
 * (public/sw.js). The worker gives posters/covers a persistent cache so
 * back-navigation no longer re-downloads art the user already saw
 * («حافظه موقت» برای تصاویر). It intercepts ONLY artwork requests
 * (metahub hosts, /covers/, /api/cover/) — data, RSC payloads and video
 * are untouched, so updater/catalog flows behave exactly as before.
 *
 * Registration is deliberately late (after hydration settles) and every
 * failure is swallowed: an environment without SW support (older WebView,
 * file://, Capacitor quirks) simply keeps the previous network behavior.
 */

export default function RegisterImageSW() {
  useEffect(() => {
    try {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
      const proto = window.location.protocol;
      if (proto !== "http:" && proto !== "https:") return;
      const id = window.setTimeout(() => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
          /* no SW is fine — the old network path still works */
        });
      }, 2500);
      return () => window.clearTimeout(id);
    } catch {
      /* storage disabled / private mode — ignore */
    }
  }, []);

  return null;
}
