"use client";

/* Server data → global player store. Renders nothing visible; the actual
   player is mounted once in the root layout and keeps playing across
   navigation (mini/floating mode). */
import { useEffect } from "react";
import { usePlayerStore, type PlayerEpisode, type PlayerSource } from "@/lib/player-store";

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

  useEffect(() => {
    play(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.titleId, p.episode?.id ?? 0, p.src]);

  return null;
}
