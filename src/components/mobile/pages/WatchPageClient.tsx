"use client";

import { notFound } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import WatchClient from "@/components/WatchClient";
import LoadErrorCard from "@/components/LoadErrorCard";
import { getFullTitle, getEpisodes, bumpViews, getTitleLiteBySlug } from "@/lib/mobile/db";
import { getProgressFor } from "@/lib/mobile/userdata";
import { fa } from "@/lib/format";
import { normalizeSources } from "@/lib/source-fix";
import { getDownloadFor } from "@/lib/mobile-downloads";
import { nativeBridge } from "@/lib/native-bridge";
import { useRouteSlug } from "@/lib/mobile-links";
import { useAsyncData } from "@/lib/use-async-data";

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
  const slug = useRouteSlug("slug");
  const sp = useSearchParams();
  const ep = sp.get("ep") ?? undefined;
  // v0.14.0 — cinema guests land with season/epnum NUMBERS (episode ids drift
  // between devices — the whole reason slugs exist)
  const seasonP = sp.get("season");
  const epnumP = sp.get("epnum");

  type Eps = Awaited<ReturnType<typeof getEpisodes>>;
  type WatchLoad =
    | { missing: true }
    | {
        missing: false;
        t: NonNullable<Awaited<ReturnType<typeof getFullTitle>>>;
        eps: Eps;
        episode: Eps[number] | null;
        nextEpisode: Eps[number] | null;
        startAt: number;
      };

  /* B-2: a rejected query used to leave the forever spinner — the hook now
   * captures the error and the page offers a retry. */
  const { data, error, retry } = useAsyncData<WatchLoad>(async () => {
    if (!slug) return { missing: true };
    const lite = await getTitleLiteBySlug(slug);
    const t = lite ? await getFullTitle(lite.id) : null;
    if (!t) return { missing: true };
    void bumpViews(t.id);
    const [eps, progress] = await Promise.all([
      t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
      getProgressFor(t.id),
    ]);

    let episode: Eps[number] | null = null;
    if (t.type === "series" && eps.length) {
      const wanted = ep ? Number(ep) : progress?.episodeId ?? null;
      const byId = (wanted ? eps.find((e) => e.id === wanted) : null) ?? null;
      const byNum =
        seasonP && epnumP
          ? eps.find((e) => e.season === Number(seasonP) && e.number === Number(epnumP)) ?? null
          : null;
      // prefer the requested/progress episode; otherwise the first PLAYABLE one
      episode = byId ?? byNum ?? eps.find((e) => e.videoUrl) ?? eps[0];
    }

    const idx = episode ? eps.findIndex((e) => e.id === episode.id) : -1;
    const nextEpisode = idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : null;

    /* v0.27.0 (DATA-7) — per-EPISODE resume: progress is stored per episode
     * now, so opening S01E03 resumes S01E03's own position even after the
     * user later watched S02E01 (which owns the title-level pointer). */
    let epProgress: { position: number; duration: number } | null = null;
    if (t.type === "series" && episode) {
      epProgress = await getProgressFor(t.id, episode.id);
    }
    const sameEpisode = episode ? (epProgress ? true : progress?.episodeId === episode.id) : !progress?.episodeId;
    const res = epProgress ?? progress;
    const startAt =
      res && sameEpisode && res.duration > 0 && res.position / res.duration < 0.97 ? res.position : 0;

    return { missing: false, t, eps, episode, nextEpisode, startAt };
  }, [slug, ep, seasonP, epnumP]);

  const [offlineSrc, setOfflineSrc] = useState<string | null>(null);

  /* v0.12.0 — offline first: a completed download plays from the device with
     zero network; the native player receives the absolute file path */
  useEffect(() => {
    let alive = true;
    if (!data || data.missing) {
      setOfflineSrc(null);
      return;
    }
    const wanted = data.episode?.videoUrl ?? data.t.videoUrl;
    if (!nativeBridge() || !wanted) return;
    void getDownloadFor(data.t.id, data.episode ? data.episode.id : null).then(async (dl) => {
      if (!alive || !dl || dl.status !== "completed") return;
      const stat = await nativeBridge()?.fileStat({ path: dl.dest }).catch(() => null);
      if (alive && stat?.exists) setOfflineSrc(`local:${stat.absPath}`);
    });
    return () => {
      alive = false;
    };
  }, [data]);

  if (data?.missing) notFound();

  if (error) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-black" aria-hidden />
        <div className="fixed inset-0 grid place-items-center px-6" dir="rtl">
          <LoadErrorCard onRetry={retry} />
        </div>
      </>
    );
  }

  if (!data) {
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

  const { t, eps, episode, nextEpisode, startAt } = data;
  const src = offlineSrc ?? episode?.videoUrl ?? t.videoUrl;
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
