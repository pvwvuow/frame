"use client";

/* Cloud sync triggers.
 *
 * v0.10.32 — fullSync() once per launch ~2.5s after boot (session restore
 *            has settled).
 * v0.12.0  — the boot timer alone MISSED restored sessions that settle late
 *            (slow re-attach / VPN): the sync ran signed-out and silently
 *            no-oped — data never appeared on the second device. Now the
 *            Supabase auth stream itself drives the sync (SIGNED_IN /
 *            INITIAL_SESSION / TOKEN_REFRESHED, deduped per uid), an
 *            `online` event retries after a failed pass, and a pulled
 *            profile/history change shows a small toast so cross-device
 *            sync is VISIBLE instead of silent.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fullSync, getSupabase } from "@/lib/cloud";
import { toast } from "sonner";

/** latest success per uid inside 60s → skip duplicate triggers */
const lastSyncByUid = new Map<string, number>();

export default function CloudAutoSync() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    const run = (reason: string) => {
      void fullSync().then((r) => {
        if (!alive) return;
        if (r.ok) {
          if ((r.favoritesAdded ?? 0) + (r.listAdded ?? 0) + (r.ratingsAdded ?? 0) + (r.progressApplied ?? 0) > 0) {
            toast.message("همگام‌سازی ابری", {
              description: "اطلاعات حساب شما (علاقه‌مندی‌ها، تاریخچه و پروفایل) به‌روز شد.",
            });
          }
          try {
            router.refresh();
          } catch {
            /* server components unavailable (static export) */
          }
        } else if (reason === "boot" && r.reason !== "no-session") {
          // keep a failed boot attempt retryable via the `online` listener
          lastSyncByUid.delete("__boot__");
        }
      });
    };

    const throttledRun = (uid: string, reason: string) => {
      const now = Date.now();
      const last = lastSyncByUid.get(uid) ?? 0;
      if (now - last < 60_000) return;
      lastSyncByUid.set(uid, now);
      run(reason);
    };

    const t = setTimeout(() => throttledRun("__boot__", "boot"), 2500);

    // v0.12.0 — the session stream is the source of truth
    const sb = getSupabase();
    if (sb) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (!alive || !session) return;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          throttledRun(session.user.id, event);
        }
      });
      unsub = () => data.subscription.unsubscribe();

      const onOnline = () => throttledRun("__online__", "online");
      window.addEventListener("online", onOnline);
      const prevUnsub = unsub;
      unsub = () => {
        prevUnsub();
        window.removeEventListener("online", onOnline);
      };
    }

    return () => {
      alive = false;
      clearTimeout(t);
      unsub?.();
    };
  }, [router]);

  return null;
}
