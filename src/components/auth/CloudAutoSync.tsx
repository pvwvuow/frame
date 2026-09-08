"use client";

/* v0.10.32 — cloud sync on app start.
 *
 * Previously the library only synced when the user opened /auth (login or
 * "Sync now"). A restored session (auth snapshot survives restarts) never
 * pulled the cloud snapshot, so data saved on one device (favorites,
 * watchlist, ratings, collections) would NOT appear on another device until
 * the user manually visited /auth. This component runs fullSync() once per
 * launch ~2.5s after boot (session restore has settled) and refreshes the
 * server components when the cloud actually changed something locally.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fullSync } from "@/lib/cloud";

export default function CloudAutoSync() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      void fullSync().then((r) => {
        if (!alive) return;
        if (r.ok && ((r.favoritesAdded ?? 0) + (r.listAdded ?? 0) + (r.ratingsAdded ?? 0) > 0)) {
          try {
            router.refresh();
          } catch {
            /* server components unavailable (static export) — client pages
             * re-read on their own mount anyway */
          }
        }
      });
    }, 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [router]);

  return null;
}
