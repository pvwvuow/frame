import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import type { Title as DbTitle } from "@prisma/client";

export type TitleView = Omit<DbTitle, "genres" | "cast"> & {
  genres: string[];
  cast: string[];
};

function pv(t: DbTitle): TitleView {
  let genres: string[] = [];
  let cast: string[] = [];
  try {
    genres = JSON.parse(t.genres || "[]");
    cast = JSON.parse(t.cast || "[]");
  } catch {
    /* ignore */
  }
  return { ...t, genres, cast };
}

export const GENRES = [
  "اکشن",
  "درام",
  "کمدی",
  "هیجان‌انگیز",
  "جنایی",
  "علمی‌تخیلی",
  "ترسناک",
  "عاشقانه",
  "ماجراجویی",
  "معمایی",
  "تاریخی",
  "جنگی",
  "حماسی",
  "نوآر",
];

const hasGenre = (g: string) => `"${g}"`;

export async function getFeatured() {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: { featured: true },
    orderBy: { trendingScore: "desc" },
    take: 5,
  });
  return rows.map(pv);
}

export async function getTrending(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" }, take: limit });
  return rows.map(pv);
}

export async function getNewest(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    orderBy: [{ year: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(pv);
}

export async function getTopRated(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { rating: "desc" }, take: limit });
  return rows.map(pv);
}

export async function getByType(
  type: "movie" | "series",
  opts: { genre?: string; sort?: string; year?: number; minRating?: number } = {}
) {
  await ensureSeeded();
  const orderBy =
    opts.sort === "rating"
      ? { rating: "desc" as const }
      : opts.sort === "newest"
        ? { year: "desc" as const }
        : opts.sort === "views"
          ? { views: "desc" as const }
          : { trendingScore: "desc" as const };
  const rows = await db.title.findMany({
    where: {
      type,
      ...(opts.genre ? { genres: { contains: hasGenre(opts.genre) } } : {}),
      ...(opts.year ? { year: opts.year } : {}),
      ...(opts.minRating ? { rating: { gte: opts.minRating } } : {}),
    },
    orderBy,
  });
  return rows.map(pv);
}

export async function getByGenre(genre: string, limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: { genres: { contains: hasGenre(genre) } },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export async function getTitleBySlug(slug: string) {
  await ensureSeeded();
  const t = await db.title.findUnique({ where: { slug } });
  return t ? pv(t) : null;
}

export async function getEpisodes(titleId: number) {
  return db.episode.findMany({
    where: { titleId },
    orderBy: [{ season: "asc" }, { number: "asc" }],
  });
}

export async function getSimilar(t: TitleView, limit = 10) {
  const rows = await db.title.findMany({
    where: {
      id: { not: t.id },
      OR: t.genres.map((g) => ({ genres: { contains: hasGenre(g) } })),
    },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export async function getReviews(titleId: number) {
  return db.review.findMany({
    where: { titleId },
    orderBy: { createdAt: "desc" },
  });
}

export async function search(q: string, limit = 30) {
  await ensureSeeded();
  const term = q.trim();
  if (!term) return [];
  const rows = await db.title.findMany({
    where: {
      OR: [
        { title: { contains: term } },
        { titleEn: { contains: term } },
        { director: { contains: term } },
        { description: { contains: term } },
        { cast: { contains: term } },
        { genres: { contains: term } },
      ],
    },
    orderBy: { trendingScore: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export async function getWatchlistIds(userKey: string) {
  const rows = await db.watchlist.findMany({
    where: { userKey },
    select: { titleId: true },
  });
  return rows.map((r) => r.titleId);
}

export async function getWatchlist(userKey: string) {
  await ensureSeeded();
  const rows = await db.watchlist.findMany({
    where: { userKey },
    include: { title: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ title: pv(r.title), addedAt: r.createdAt }));
}

export async function isInWatchlist(userKey: string, titleId: number) {
  const count = await db.watchlist.count({ where: { userKey, titleId } });
  return count > 0;
}

export type ContinueItem = {
  title: TitleView;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

export async function getContinueWatching(userKey: string, limit = 12): Promise<ContinueItem[]> {
  await ensureSeeded();
  const rows = await db.watchProgress.findMany({
    where: { userKey },
    include: { title: true, episode: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows
    .filter((r) => r.duration > 0 && r.position / r.duration < 0.97)
    .map((r) => ({
      title: pv(r.title),
      position: r.position,
      duration: r.duration,
      episodeId: r.episodeId,
      episodeName: r.episode?.name ?? null,
      episodeNumber: r.episode?.number ?? null,
      season: r.episode?.season ?? null,
    }));
}

export async function getProgressFor(userKey: string, titleId: number) {
  const row = await db.watchProgress.findUnique({
    where: { userKey_titleId: { userKey, titleId } },
  });
  return row ?? null;
}

export async function getProgressMap(userKey: string, titleIds: number[]) {
  if (!titleIds.length) return new Map<number, { position: number; duration: number }>();
  const rows = await db.watchProgress.findMany({
    where: { userKey, titleId: { in: titleIds } },
    select: { titleId: true, position: true, duration: true },
  });
  return new Map(rows.map((r) => [r.titleId, { position: r.position, duration: r.duration }]));
}

export async function incrementViews(titleId: number) {
  await db.title.update({
    where: { id: titleId },
    data: { views: { increment: 1 } },
  });
}

export async function getByDirector(director: string, excludeId: number, limit = 8) {
  if (!director) return [];
  const rows = await db.title.findMany({
    where: { director, id: { not: excludeId } },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export type GenreSummary = {
  genre: string;
  count: number;
  movies: number;
  series: number;
  covers: string[];
  avgRating: number;
};

export async function getGenreSummaries(): Promise<GenreSummary[]> {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" } });
  const all = rows.map(pv);
  return GENRES.map((genre) => {
    const items = all.filter((t) => t.genres.includes(genre));
    const avg = items.length ? items.reduce((a, t) => a + t.rating, 0) / items.length : 0;
    return {
      genre,
      count: items.length,
      movies: items.filter((t) => t.type === "movie").length,
      series: items.filter((t) => t.type === "series").length,
      covers: items.slice(0, 4).map((t) => t.poster),
      avgRating: Math.round(avg * 10) / 10,
    };
  }).filter((g) => g.count > 0);
}

export async function getCatalogStats(type: "movie" | "series") {
  await ensureSeeded();
  const [count, agg, top] = await Promise.all([
    db.title.count({ where: { type } }),
    db.title.aggregate({ where: { type }, _avg: { rating: true }, _sum: { views: true } }),
    db.title.findFirst({ where: { type }, orderBy: { trendingScore: "desc" } }),
  ]);
  return {
    count,
    avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
    totalViews: agg._sum.views ?? 0,
    top: top ? pv(top) : null,
  };
}

export async function getYears(type: "movie" | "series") {
  const rows = await db.title.findMany({ where: { type }, select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } });
  return rows.map((r) => r.year);
}
