"use client";

/* Server data → global player store, BEHIND THE PAYWALL (v0.10.11+).
 *
 * Playback starts ONLY when the entitlement check passes:
 *   - signed out        → gate: «اول وارد شو»
 *   - signed in, no sub → gate: «اشتراک تهیه کن»
 * The actual player is mounted once in the root layout and keeps playing
 * across navigation (mini/floating mode).
 *
 * v0.10.13 (offline-resilient entitlement):
 *   - the session/entitlement no longer blocks on the network: a cached login
 *     (auth snapshot) + cached active subscription (sub snapshot) start
 *     playback IMMEDIATELY while the live check is still in flight. With the
 *     VPN off the live check simply fails and the cached entitlement keeps
 *     the user watching instead of hitting a wrong «اول لاگین کن» wall.
 *   - while resolving with no cached entitlement → neutral loader (this used
 *     to flash the signed-out gate on every movie open).
 *   - if the live check later DENIES (revoked sub / signed out), the player
 *     is closed so nothing plays behind the gate. */
import { useEffect, useState } from "react";
import { usePlayerStore, type PlayerEpisode, type PlayerSource } from "@/lib/player-store";
import { logEvent } from "@/lib/cloud";
import { SUBSCRIPTION_REQUIRED, useSubscription } from "@/lib/subscription";
import { readAuthSnapshot, readSubSnapshot, subSnapshotActive } from "@/lib/auth-offline";
import WatchGate from "./watch/WatchGate";

export default function WatchClient(p: {
  titleId: number;
  slug: string;
  title: string;
  subtitle?: string;
  src: string;
  sources: PlayerSource[];
  poster: string;
  startAt: number;
  episode: PlayerEpisode | null;
  nextEpisode: PlayerEpisode | null;
  episodes: PlayerEpisode[];
}) {
  const play = usePlayerStore((s) => s.play);
  const close = usePlayerStore((s) => s.close);
  const sub = useSubscription();

  // Cached entitlement gate: signed in + subscription still valid by its own
  // expiry date — all read locally, works fully offline.
  const [optimistic, setOptimistic] = useState(false);
  useEffect(() => {
    if (sub.ready) {
      setOptimistic(false);
      return;
    }
    setOptimistic(!!readAuthSnapshot() && subSnapshotActive(readSubSnapshot()));
  }, [sub.ready]);

  const allowed = !SUBSCRIPTION_REQUIRED || (sub.ready ? sub.signedIn && sub.active : optimistic);

  useEffect(() => {
    if (!allowed) {
      // entitlement denied/revoked → nothing may keep playing behind the gate
      close();
      return;
    }
    play(p);
    // activity log (cloud, only when signed in) — the actual progress stays LOCAL by design
    void logEvent("play", { titleId: p.titleId, episodeId: p.episode?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, p.titleId, p.episode?.id ?? 0, p.src]);

  if (SUBSCRIPTION_REQUIRED && !allowed) {
    // resolving with no cached entitlement → neutral loader, NOT the
    // signed-out gate (that was the login-page flash on every movie open)
    if (!sub.ready) {
      return (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-brand"
            role="status"
            aria-label="loading"
          />
        </div>
      );
    }
    return <WatchGate signedIn={sub.signedIn} />;
  }
  return null;
}
