"use client";

/* Server data → global player store, BEHIND THE PAYWALL (v0.10.11).
 *
 * Playback starts ONLY when the entitlement check passes:
 *   - signed out        → gate: «اول وارد شو»
 *   - signed in, no sub → gate: «اشتراک تهیه کن»
 * The actual player is mounted once in the root layout and keeps playing
 * across navigation (mini/floating mode). */
import { useEffect } from "react";
import { usePlayerStore, type PlayerEpisode, type PlayerSource } from "@/lib/player-store";
import { logEvent } from "@/lib/cloud";
import { SUBSCRIPTION_REQUIRED, useSubscription } from "@/lib/subscription";
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
  const sub = useSubscription();

  const allowed = !SUBSCRIPTION_REQUIRED || (sub.ready && sub.signedIn && sub.active);

  useEffect(() => {
    if (!allowed) return; // gated → the video never starts
    play(p);
    // activity log (cloud, only when signed in) — the actual progress stays LOCAL by design
    void logEvent("play", { titleId: p.titleId, episodeId: p.episode?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, p.titleId, p.episode?.id ?? 0, p.src]);

  if (SUBSCRIPTION_REQUIRED && (!sub.ready || !sub.signedIn || !sub.active)) {
    return <WatchGate signedIn={sub.ready ? sub.signedIn : false} />;
  }
  return null;
}
