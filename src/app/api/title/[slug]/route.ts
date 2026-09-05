import { getTitleBySlug, getEpisodes, getSimilar, isInWatchlist, getProgressFor, getReviews } from "@/lib/queries";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const t = await getTitleBySlug(slug);
  if (!t) return Response.json({ error: "not found" }, { status: 404 });

  const userKey = await getUserKey();
  const [episodes, similar, inList, progress, reviews] = await Promise.all([
    t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
    getSimilar(t, 8),
    isInWatchlist(userKey, t.id),
    getProgressFor(userKey, t.id),
    getReviews(t.id),
  ]);

  const userScore = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;

  return Response.json({
    title: t,
    episodes: episodes.map((e) => ({
      id: e.id,
      season: e.season,
      number: e.number,
      name: e.name,
      synopsis: e.synopsis,
      duration: e.duration,
      thumbnail: e.thumbnail,
    })),
    similar,
    inList,
    progress: progress ? { position: progress.position, duration: progress.duration, episodeId: progress.episodeId } : null,
    reviewCount: reviews.length,
    userScore,
  });
}
