"use client";

import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import WatchClient from "@/components/WatchClient";
import { getFullTitle, getEpisodes, bumpViews, getTitleLiteBySlug } from "@/lib/mobile/db";
import { getProgressFor } from "@/lib/mobile/userdata";
import { fa } from "@/lib/format";
import { normalizeSources } from "@/lib/source-fix";

function parseSources(json: string) {
  try {
    const arr = JSON.parse(json || "[]");
    // v0.10.17: labels re-derived from the URL (the catalog's q/v rows were
    // zipped wrong at import time — user picks 480p and got the 720p file)
    return normalizeSources(Array.isArray(arr) ? arr.filter((s) => s && s.url) : []);
  } catch {
    return [];
  }
}

export default function WatchPage() {
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const slug = params?.slug as string;
  const ep = sp.get("ep") ?? undefined;
  const [st, setSt] = useState<{
    t: NonNullable<Awaited<ReturnType<typeof getFullTitle>>>;
    eps: Awaited<ReturnType<typeof getEpisodes>>;
    episode: Awaited<ReturnType<typeof getEpisodes>>[number] | null;
    nextEpisode: Awaited<ReturnType<typeof getEpisodes>>[number] | null;
    startAt: number;
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      const lite = await getTitleLiteBySlug(slug);
      const t = lite ? await getFullTitle(lite.id) : null;
      if (!t) {
        if (alive) setMissing(true);
        return;
      }
      bumpViews(t.id);
      const [eps, progress] = await Promise.all([
        t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
        getProgressFor(t.id),
      ]);

      let episode: (typeof eps)[number] | null = null;
      if (t.type === "series" && eps.length) {
        const wanted = ep ? Number(ep) : progress?.episodeId ?? null;
        // prefer the requested/progress episode; otherwise the first PLAYABLE one
        episode = (wanted ? eps.find((e) => e.id === wanted) : null) ?? eps.find((e) => e.videoUrl) ?? eps[0];
      }

      const idx = episode ? eps.findIndex((e) => e.id === episode.id) : -1;
      const nextEpisode = idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : null;

      const sameEpisode = episode ? progress?.episodeId === episode.id : !progress?.episodeId;
      const startAt = progress && sameEpisode && progress.duration > 0 && progress.position / progress.duration < 0.97 ? progress.position : 0;

      if (alive) setSt({ t, eps, episode, nextEpisode, startAt });
    })();
    return () => {
      alive = false;
    };
  }, [slug, ep]);

  if (missing) notFound();
  if (!st) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-black" aria-hidden />
        <div className="fixed inset-0 grid place-items-center" dir="rtl">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-brand" />
            <p className="text-xs text-zinc-500">در حال آماده‌سازی پخش…</p>
          </div>
        </div>
      </>
    );
  }

  const { t, eps, episode, nextEpisode, startAt } = st;
  const src = episode?.videoUrl ?? t.videoUrl;
  const sources = episode ? parseSources(episode.sources) : parseSources(t.sources);
  const subtitle = episode ? `فصل ${fa(episode.season)} · قسمت ${fa(episode.number)} · ${episode.name}` : `${t.titleEn} · ${fa(t.year)}`;

  /* The player itself lives in the root layout (GlobalPlayer) so playback
     survives navigation. This page only feeds the store + paints black
     behind the theater overlay. */
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-black" aria-hidden />
      <WatchClient
        titleId={t.id}
        slug={t.slug}
        title={t.title}
        subtitle={subtitle}
        src={src}
        sources={sources}
        poster={t.backdrop}
        startAt={startAt}
        episode={episode}
        nextEpisode={nextEpisode}
        episodes={eps}
      />
    </>
  );
}
