import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WatchClient from "@/components/WatchClient";
import { getTitleBySlug, getEpisodes, getProgressFor, incrementViews } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ep?: string }> };

function parseSources(json: string): { q: string; v: string; url: string; mb?: number }[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.filter((s) => s && s.url) : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTitleBySlug(slug);
  return { title: t ? `پخش ${t.title} | نما` : "نما" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ep } = await searchParams;
  const t = await getTitleBySlug(slug);
  if (!t) notFound();

  const userKey = await getUserKey();
  const [eps, progress] = await Promise.all([
    t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
    getProgressFor(userKey, t.id),
  ]);
  await incrementViews(t.id);

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
